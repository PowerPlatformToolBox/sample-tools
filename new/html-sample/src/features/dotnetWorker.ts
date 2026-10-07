export function createDotnetWorkerFeature(deps: {
    toolbox: typeof window.toolboxAPI;
    dataverse: typeof window.dataverseAPI;
    getCurrentConnection: () => ToolBoxAPI.Connection | null;
    log: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}) {
    const startButton = document.getElementById("worker-start-btn") as HTMLButtonElement;
    const runButton = document.getElementById("worker-query-btn") as HTMLButtonElement;
    const cancelButton = document.getElementById("worker-cancel-btn") as HTMLButtonElement;
    const stopButton = document.getElementById("worker-stop-btn") as HTMLButtonElement;
    const status = document.getElementById("worker-status")!;
    const output = document.getElementById("worker-output")!;
    let worker: ToolBoxAPI.WorkerSession | undefined;
    let queryRunning = false;
    let cancelRequested = false;
    let state: "stopped" | "starting" | "ready" | "stopping" | "blocked" = "stopped";

    function render() {
        startButton.disabled = state !== "stopped" || !deps.toolbox.workers;
        runButton.disabled = state !== "ready" || queryRunning;
        cancelButton.disabled = state !== "ready" || !queryRunning;
        stopButton.disabled = !worker || state === "stopping";
    }

    function report(error: unknown, prefix: string) {
        const message = `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
        status.textContent = message;
        deps.log(message, "error");
    }

    function clearWorker() {
        worker?.dispose();
        worker = undefined;
        state = "stopped";
        render();
    }

    async function start() {
        if (state !== "stopped") return;
        state = "starting";
        render();
        status.textContent = "Requesting native-code consent and starting worker...";
        output.textContent = "";
        try {
            const started = await deps.toolbox.workers.connect("sample", {
                requests: {
                    "dataverse/getAccounts": async (params, context) => {
                        const top = typeof params === "object" && params !== null && "top" in params ? params.top : undefined;
                        if (typeof top !== "number" || !Number.isSafeInteger(top) || top < 1 || top > 100) throw new Error("Expected an account limit from 1 to 100");
                        if (!deps.getCurrentConnection()) throw new Error("No active Dataverse connection");
                        if (context.isCancellationRequested) throw new Error("Request cancelled");
                        const fetchXml = `<fetch top="${top}"><entity name="account"><attribute name="name" /><attribute name="address1_country" /></entity></fetch>`;
                        const result = await deps.dataverse.fetchXmlQuery(fetchXml);
                        if (context.isCancellationRequested) throw new Error("Request cancelled");
                        return { value: result.value };
                    },
                },
                notifications: {
                    progress: (message) => {
                        if (state === "ready" && typeof message === "string") status.textContent = message;
                    },
                },
                onExit: (snapshot) => {
                    clearWorker();
                    status.textContent = snapshot.failure ? `Worker exited: ${snapshot.failure}` : "Worker exited";
                },
            });
            worker = started;
            void started.ready.catch(() => undefined);
            await started.ready;
            if (worker !== started || state !== "starting") return;
            state = "ready";
            status.textContent = "Worker ready";
            render();
        } catch (error) {
            if (worker) {
                try {
                    await worker.stop();
                    clearWorker();
                } catch (stopError) {
                    state = "blocked";
                    render();
                    report(stopError, "Startup failed; cleanup unverified. Retry Stop worker");
                    return;
                }
            }
            clearWorker();
            report(error, "Worker startup failed");
        }
    }

    async function query() {
        if (state !== "ready" || !worker || queryRunning) return;
        const activeWorker = worker;
        queryRunning = true;
        cancelRequested = false;
        render();
        output.textContent = "";
        status.textContent = "Preparing account summary in worker...";
        try {
            if (!deps.getCurrentConnection()) throw new Error("No active Dataverse connection");
            if (worker !== activeWorker || state !== "ready") return;
            const result = await activeWorker.request("accounts/summarizeByCountry", { top: 10 });
            if (worker !== activeWorker || state !== "ready") return;
            if (cancelRequested) status.textContent = "Query cancelled";
            else {
                output.textContent = JSON.stringify(result, null, 2);
                status.textContent = "Worker query completed";
            }
        } catch (error) {
            if (worker === activeWorker && state === "ready") {
                if (cancelRequested) status.textContent = "Query cancelled";
                else report(error, "Worker query failed");
            }
        } finally {
            queryRunning = false;
            render();
        }
    }

    function cancel() {
        if (!worker || state !== "ready" || !queryRunning) return;
        cancelRequested = true;
        worker.cancel();
        status.textContent = "Cancellation requested; an in-flight Dataverse call may still finish";
        cancelButton.disabled = true;
    }

    async function stop() {
        if (!worker || state === "stopping") return;
        const stoppingWorker = worker;
        state = "stopping";
        stoppingWorker.cancel();
        render();
        status.textContent = "Stopping worker...";
        try {
            await stoppingWorker.stop();
            if (worker === stoppingWorker) clearWorker();
            status.textContent = "Worker stopped";
        } catch (error) {
            if (worker !== stoppingWorker) return;
            state = "blocked";
            render();
            report(error, "Worker cleanup unverified. Retry Stop worker");
        }
    }

    render();
    if (!deps.toolbox.workers) status.textContent = "Worker API unavailable in this PPTB build";
    return { start, query, cancel, stop };
}
