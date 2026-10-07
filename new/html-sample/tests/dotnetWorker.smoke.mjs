import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { isAbsolute } from "node:path";

const [dotnetPath, workerDll] = process.argv.slice(2);
assert.ok(dotnetPath && workerDll && isAbsolute(dotnetPath) && isAbsolute(workerDll), "Provide absolute dotnet and unpacked Worker.dll paths");

function createRpc(child) {
    let nextId = 1;
    let input = Buffer.alloc(0);
    const pending = new Map();
    const requests = new Map();
    const notifications = new Map();
    const inboundCancellations = new Map();

    function write(message) {
        const body = Buffer.from(JSON.stringify(message), "utf8");
        child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
        child.stdin.write(body);
    }

    function tokenSource() {
        let cancelled = false;
        const listeners = new Set();
        return {
            token: {
                get isCancellationRequested() {
                    return cancelled;
                },
                onCancellationRequested(listener) {
                    listeners.add(listener);
                    return { dispose: () => listeners.delete(listener) };
                },
            },
            cancel() {
                if (cancelled) return;
                cancelled = true;
                for (const listener of listeners) listener();
            },
        };
    }

    function dispatch(message) {
        if (message.method === "$/cancelRequest") {
            inboundCancellations.get(String(message.params?.id))?.cancel();
            return;
        }
        if (message.method && Object.hasOwn(message, "id")) {
            const handler = requests.get(message.method);
            if (!handler) {
                write({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
                return;
            }
            const source = tokenSource();
            inboundCancellations.set(String(message.id), source);
            Promise.resolve(handler(message.params, source.token))
                .then(
                    (result) => write({ jsonrpc: "2.0", id: message.id, result }),
                    (error) => write({ jsonrpc: "2.0", id: message.id, error: { code: Number.isSafeInteger(error.code) ? error.code : -32603, message: error.message ?? String(error) } }),
                )
                .finally(() => inboundCancellations.delete(String(message.id)));
            return;
        }
        if (message.method) {
            notifications.get(message.method)?.(message.params);
            return;
        }
        const result = pending.get(String(message.id));
        if (!result) return;
        pending.delete(String(message.id));
        if (message.error) result.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
        else result.resolve(message.result);
    }

    child.stdout.on("data", (chunk) => {
        input = Buffer.concat([input, chunk]);
        while (true) {
            const boundary = input.indexOf("\r\n\r\n");
            if (boundary < 0) return;
            const header = input.subarray(0, boundary).toString("ascii");
            const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1]);
            if (!Number.isSafeInteger(length) || length < 0) throw new Error(`Invalid worker frame header: ${header}`);
            const bodyStart = boundary + 4;
            if (input.length < bodyStart + length) return;
            const body = input.subarray(bodyStart, bodyStart + length).toString("utf8");
            input = input.subarray(bodyStart + length);
            dispatch(JSON.parse(body));
        }
    });

    return {
        onNotification: (method, handler) => notifications.set(method, handler),
        onRequest: (method, handler) => requests.set(method, handler),
        sendRequest(method, params, token) {
            const id = nextId++;
            const promise = new Promise((resolve, reject) => pending.set(String(id), { resolve, reject }));
            const subscription = token?.onCancellationRequested(() => write({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } }));
            write({ jsonrpc: "2.0", id, method, params });
            return promise.finally(() => subscription?.dispose());
        },
        dispose() {
            for (const entry of pending.values()) entry.reject(new Error("RPC client disposed"));
            pending.clear();
        },
    };
}

const cancellation = tokenSourceForClient();

function tokenSourceForClient() {
    let cancelled = false;
    const listeners = new Set();
    return {
        token: {
            get isCancellationRequested() {
                return cancelled;
            },
            onCancellationRequested(listener) {
                listeners.add(listener);
                return { dispose: () => listeners.delete(listener) };
            },
        },
        cancel() {
            if (cancelled) return;
            cancelled = true;
            for (const listener of listeners) listener();
        },
        dispose() {
            listeners.clear();
        },
    };
}

const child = spawn(dotnetPath, [workerDll], {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    env: { DOTNET_NOLOGO: "1", DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1" },
});
let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
    stderr += chunk;
});
const closed = once(child, "close");
let stage = "initialize";
const timeout = setTimeout(() => {
    console.error(`Real worker smoke timed out during ${stage}${stderr ? `; stderr: ${stderr}` : ""}`);
    process.exitCode = 1;
    child.kill("SIGKILL");
}, 15000);
const rpc = createRpc(child);
const progress = [];
let callbackCount = 0;
let holdCallback = false;
let callbackStarted;
const callbackPending = new Promise((resolve) => {
    callbackStarted = resolve;
});
rpc.onNotification("progress", (message) => progress.push(Array.isArray(message) ? message[0] : message));
rpc.onRequest("dataverse/getAccounts", async (params, token) => {
    assert.deepEqual(params, { top: 10 });
    callbackCount += 1;
    if (!holdCallback) return { value: [{ name: "Example account", address1_country: "US" }] };
    callbackStarted();
    return new Promise((_resolve, reject) => {
        const cancel = () => reject(Object.assign(new Error("Fixture callback cancelled"), { code: -32800 }));
        if (token.isCancellationRequested) cancel();
        else token.onCancellationRequested(cancel);
    });
});
try {
    assert.deepEqual(await rpc.sendRequest("platform/initialize", { protocol: "jsonrpc-stdio-v1", protocolVersion: 1 }), { protocol: "jsonrpc-stdio-v1", protocolVersion: 1 });
    stage = "account summary";
    const request = { top: 10 };
    assert.deepEqual(await rpc.sendRequest("accounts/summarizeByCountry", request), {
        totalAccounts: 1,
        countries: [{ country: "US", count: 1 }],
    });
    assert.ok(progress.includes("Account summary ready"));
    stage = "cancellation";
    holdCallback = true;
    const pending = rpc.sendRequest("accounts/summarizeByCountry", request, cancellation.token);
    const cancelled = assert.rejects(pending);
    await callbackPending;
    cancellation.cancel();
    await cancelled;
    assert.equal(callbackCount, 2);
    stage = "EOF shutdown";
    child.stdin.end();
    const [code] = await closed;
    assert.equal(code, 0);
    console.log("Real packaged C# stdio passed: initialize, account summary, fixture reverse callback, progress, cancellation, EOF exit. No live Dataverse or PPTB broker/consent was exercised.");
} finally {
    cancellation.dispose();
    rpc.dispose();
    if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await closed;
    }
    clearTimeout(timeout);
}
