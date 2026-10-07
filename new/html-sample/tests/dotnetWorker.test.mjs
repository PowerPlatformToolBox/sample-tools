import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bundle = await readFile(new URL("../dist/features/dotnetWorker.js", import.meta.url));
const { createDotnetWorkerFeature } = await import(`data:text/javascript;base64,${bundle.toString("base64")}`);
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function harness(options = {}) {
    const elements = new Map(
        ["worker-start-btn", "worker-query-btn", "worker-cancel-btn", "worker-stop-btn", "worker-status", "worker-output"].map((id) => [id, { disabled: false, textContent: "" }]),
    );
    globalThis.document = { getElementById: (id) => elements.get(id) };
    const messages = [];
    const fetches = [];
    let sessionOptions;
    let rejectPending;
    let sessionDisposed = false;
    const workers = {
        connect: async (id, sessionConfig) => {
            assert.equal(id, "sample");
            if (options.denied) throw new Error("Consent denied");
            sessionOptions = sessionConfig;
            return {
                ready: options.ready ?? Promise.resolve(),
                request: async (method, params) => {
                    assert.equal(method, "accounts/summarizeByCountry");
                    assert.deepEqual(params, { top: 10 });
                    messages.push({ method, params });
                    if (options.pending)
                        return new Promise((_resolve, reject) => {
                            rejectPending = reject;
                        });
                    sessionConfig.notifications.progress("Loading accounts from Dataverse...");
                    const result = await sessionConfig.requests["dataverse/getAccounts"]({ top: 10 }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) });
                    const countries = new Map();
                    for (const account of result.value) {
                        const country = account.address1_country || "Unspecified";
                        countries.set(country, (countries.get(country) ?? 0) + 1);
                    }
                    return {
                        totalAccounts: result.value.length,
                        countries: [...countries].map(([country, count]) => ({ country, count })).sort((left, right) => right.count - left.count || left.country.localeCompare(right.country)),
                    };
                },
                cancel: () => {
                    messages.push({ method: "cancel" });
                    rejectPending?.(new Error("Cancelled by worker"));
                    rejectPending = undefined;
                },
                stop: async () => {
                    if (options.stopFails) throw new Error("Pipes remain open");
                },
                dispose: async () => {
                    sessionDisposed = true;
                    rejectPending?.(new Error("Worker exited"));
                    rejectPending = undefined;
                },
            };
        },
    };
    const feature = createDotnetWorkerFeature({
        toolbox: { workers: options.unavailable ? undefined : workers },
        dataverse: {
            fetchXmlQuery: async (fetchXml) => {
                fetches.push(fetchXml);
                if (options.fetchFails) throw new Error("Dataverse unavailable");
                return {
                    value: [
                        { accountid: "one", address1_country: "US" },
                        { accountid: "two", address1_country: "Canada" },
                    ],
                    "@odata.context": "not sent to worker",
                };
            },
        },
        getCurrentConnection: () => (options.noConnection ? null : { id: "primary" }),
        log: () => undefined,
    });
    return {
        feature,
        elements,
        messages,
        fetches,
        get sessionOptions() {
            return sessionOptions;
        },
        get sessionDisposed() {
            return sessionDisposed;
        },
        exit: () => sessionOptions.onExit({ state: "failed", failure: "Unexpected exit" }),
    };
}

test("waits for readiness, fetches accounts through the callback, and returns a C# country summary", async () => {
    const ready = deferred();
    const context = harness({ ready: ready.promise });
    const starting = context.feature.start();
    await nextTurn();
    assert.ok(context.sessionOptions);
    assert.equal(context.elements.get("worker-query-btn").disabled, true);
    await context.feature.query();
    assert.equal(context.messages.length, 0);
    ready.resolve();
    await starting;
    await context.feature.query();
    assert.equal(context.fetches.length, 1);
    assert.deepEqual(context.fetches, ['<fetch top="10"><entity name="account"><attribute name="name" /><attribute name="address1_country" /></entity></fetch>']);
    assert.deepEqual(JSON.parse(context.elements.get("worker-output").textContent), {
        totalAccounts: 2,
        countries: [
            { country: "Canada", count: 1 },
            { country: "US", count: 1 },
        ],
    });
    await context.feature.stop();
    assert.equal(context.sessionDisposed, true);
});

test("cancels a pending request explicitly without replaying it", async () => {
    const context = harness({ pending: true });
    await context.feature.start();
    const query = context.feature.query();
    await nextTurn();
    context.feature.cancel();
    await query;
    assert.equal(context.messages.filter((message) => message.method === "accounts/summarizeByCountry").length, 1);
    assert.ok(context.messages.some((message) => message.method === "cancel"));
    assert.match(context.elements.get("worker-status").textContent, /cancelled/i);
    assert.equal(context.elements.get("worker-cancel-btn").disabled, true);
    await context.feature.stop();
});

test("propagates Dataverse callback errors separately from baseline output", async () => {
    const context = harness({ fetchFails: true });
    await context.feature.start();
    await context.feature.query();
    assert.match(context.elements.get("worker-status").textContent, /Dataverse unavailable/);
    assert.equal(context.elements.get("worker-output").textContent, "");
    await context.feature.stop();
});

test("keeps start and query blocked when shutdown cannot be verified", async () => {
    const options = { stopFails: true };
    const context = harness(options);
    await context.feature.start();
    await context.feature.stop();
    assert.equal(context.elements.get("worker-start-btn").disabled, true);
    assert.equal(context.elements.get("worker-query-btn").disabled, true);
    assert.equal(context.elements.get("worker-stop-btn").disabled, false);
    assert.match(context.elements.get("worker-status").textContent, /cleanup unverified/);
    options.stopFails = false;
    await context.feature.stop();
    assert.equal(context.elements.get("worker-start-btn").disabled, false);
});

test("exit settles pending requests and removes subscriptions", async () => {
    const context = harness({ pending: true });
    await context.feature.start();
    const query = context.feature.query();
    await nextTurn();
    context.exit();
    await query;
    assert.equal(context.sessionDisposed, true);
    assert.equal(context.elements.get("worker-start-btn").disabled, false);
    assert.match(context.elements.get("worker-status").textContent, /Unexpected exit/);
});

test("denial and readiness failure leave no usable worker", async () => {
    const denied = harness({ denied: true });
    await denied.feature.start();
    assert.match(denied.elements.get("worker-status").textContent, /Consent denied/);
    const ready = deferred();
    const failed = harness({ ready: ready.promise });
    const starting = failed.feature.start();
    await nextTurn();
    ready.reject(new Error("Handshake failed"));
    await starting;
    assert.match(failed.elements.get("worker-status").textContent, /Handshake failed/);
    assert.equal(failed.sessionDisposed, true);
    assert.equal(failed.elements.get("worker-query-btn").disabled, true);
});

test("unavailable worker API does not prevent the other sample features", () => {
    const context = harness({ unavailable: true });
    assert.equal(context.elements.get("worker-start-btn").disabled, true);
    assert.match(context.elements.get("worker-status").textContent, /unavailable/);
});
