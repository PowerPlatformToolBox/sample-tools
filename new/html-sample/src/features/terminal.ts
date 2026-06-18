import { executeCommandWithPolicyGuard } from "../security/policy.js";
import { buildProbeCommands, PROBE_TIMEOUT_MS, ProbeResult, withTimeout } from "../utils/probing.js";
import { delay } from "../utils/time.js";

type NotificationType = "success" | "info" | "warning" | "error";
type LogType = "info" | "success" | "warning" | "error";

export function createTerminalFeature(deps: {
    toolbox: typeof window.toolboxAPI;
    showNotification: (title: string, body: string, type: NotificationType) => Promise<void>;
    log: (message: string, type?: LogType) => void;
    getCurrentTerminal: () => ToolBoxAPI.Terminal | null;
    setCurrentTerminal: (terminal: ToolBoxAPI.Terminal | null) => void;
}) {
    async function createTerminal() {
        try {
            const terminal = await deps.toolbox.terminal.create({
                name: "HTML Sample Terminal",
            });

            deps.setCurrentTerminal(terminal);
            deps.log(`Terminal created: ${terminal.name} (${terminal.id})`, "success");

            const executeBtn = document.getElementById("execute-command-btn") as HTMLButtonElement;
            const probeBtn = document.getElementById("run-security-probe-btn") as HTMLButtonElement;
            const closeBtn = document.getElementById("close-terminal-btn") as HTMLButtonElement;

            if (executeBtn) executeBtn.disabled = false;
            if (probeBtn) probeBtn.disabled = false;
            if (closeBtn) closeBtn.disabled = false;

            await deps.showNotification("Terminal Created", `Terminal ${terminal.name} is ready`, "success");
        } catch (error) {
            deps.log(`Error creating terminal: ${(error as Error).message}`, "error");
        }
    }

    async function executeTerminalCommand() {
        const terminal = deps.getCurrentTerminal();
        if (!terminal) {
            await deps.showNotification("No Terminal", "Please create a terminal first", "warning");
            return;
        }

        try {
            const isWindows = navigator.platform.toLowerCase().includes("win");
            const command = isWindows ? "dir" : "ls -la";

            const output = document.getElementById("terminal-output");
            if (output) output.textContent = `> ${command}\n`;

            deps.log(`Executing command: ${command}`, "info");
            await executeCommandWithPolicyGuard(deps.toolbox, terminal.id, command);
        } catch (error) {
            deps.log(`Error executing command: ${(error as Error).message}`, "error");
        }
    }

    async function runTerminalSecurityProbe() {
        try {
            if (!deps.getCurrentTerminal()) {
                await createTerminal();
            }

            const terminal = deps.getCurrentTerminal();
            if (!terminal) {
                await deps.showNotification("Terminal Unavailable", "Unable to create terminal for probe", "error");
                return;
            }

            const output = document.getElementById("terminal-output");
            const isWindows = navigator.platform.toLowerCase().includes("win");
            const probeCommands = buildProbeCommands(isWindows);

            if (output) {
                output.textContent = "Running terminal security probe (allow/block list validation)...\n";
                output.textContent += "All probes are non-destructive and self-cleaning.\n\n";
            }

            deps.log("Running terminal security probe", "warning");

            const results: ProbeResult[] = [];

            for (const probe of probeCommands) {
                if (output) output.textContent += `> [${probe.category}] ${probe.command}\n`;

                let actualBlocked: boolean | "timeout";
                let errorMessage: string | undefined;

                try {
                    // ASSUMPTION: executeCommandWithPolicyGuard rejects/throws when the policy
                    // blocks a command. If your guard instead resolves with a { blocked: true }
                    // shape, replace the detection below accordingly.
                    await withTimeout(executeCommandWithPolicyGuard(deps.toolbox, terminal.id, probe.command), PROBE_TIMEOUT_MS);
                    actualBlocked = false;
                } catch (error) {
                    const message = (error as Error).message;
                    if (message === "PROBE_TIMEOUT") {
                        actualBlocked = "timeout";
                        errorMessage = "Command did not complete within timeout — may have opened an interactive prompt";
                    } else {
                        actualBlocked = true;
                        errorMessage = message;
                    }
                }

                const pass = actualBlocked === probe.expectBlocked;
                results.push({ ...probe, actualBlocked, pass, errorMessage });

                if (output) {
                    const status = actualBlocked === "timeout" ? "TIMEOUT" : actualBlocked ? "BLOCKED" : "ALLOWED";
                    output.textContent += `  -> ${status} (expected ${probe.expectBlocked ? "BLOCKED" : "ALLOWED"}) ${pass ? "✓ PASS" : "✗ FAIL"}\n`;
                }

                await delay(300);
            }

            const failures = results.filter((r) => !r.pass);
            const timeouts = results.filter((r) => r.actualBlocked === "timeout");

            if (output) {
                output.textContent += "\n--- Probe Summary ---\n";
                output.textContent += `Total: ${results.length}  Passed: ${results.length - failures.length}  Failed: ${failures.length}  Timeouts: ${timeouts.length}\n\n`;

                if (failures.length > 0) {
                    output.textContent += "Failures (mismatch between expected and actual):\n";
                    for (const f of failures) {
                        output.textContent += `  [${f.category}] "${f.command}" — expected ${f.expectBlocked ? "BLOCKED" : "ALLOWED"}, got ${f.actualBlocked}\n`;
                    }
                    output.textContent += "\nAny FAIL where a dangerous command was expected BLOCKED but came back ALLOWED is a real security gap — fix the blocklist before shipping.\n";
                } else {
                    output.textContent += "All probes matched expectations.\n";
                }
            }

            const severity = failures.some((f) => f.expectBlocked && f.actualBlocked === false) ? "error" : "warning";

            await deps.showNotification("Security Probe Complete", failures.length > 0 ? `${failures.length} mismatch(es) found — review terminal output` : "All checks passed", severity);
            deps.log(`Security probe completed: ${results.length - failures.length}/${results.length} passed`, severity);
        } catch (error) {
            deps.log(`Error running security probe: ${(error as Error).message}`, "error");
        }
    }

    async function closeTerminal() {
        const terminal = deps.getCurrentTerminal();
        if (!terminal) return;

        try {
            await deps.toolbox.terminal.close(terminal.id);
            deps.log("Terminal closed", "info");
            deps.setCurrentTerminal(null);

            const executeBtn = document.getElementById("execute-command-btn") as HTMLButtonElement;
            const probeBtn = document.getElementById("run-security-probe-btn") as HTMLButtonElement;
            const closeBtn = document.getElementById("close-terminal-btn") as HTMLButtonElement;

            if (executeBtn) executeBtn.disabled = true;
            if (probeBtn) probeBtn.disabled = true;
            if (closeBtn) closeBtn.disabled = true;

            const output = document.getElementById("terminal-output");
            if (output) output.textContent = "";
        } catch (error) {
            deps.log(`Error closing terminal: ${(error as Error).message}`, "error");
        }
    }

    function handleTerminalOutput(data: any) {
        if (!data || typeof data !== "object") return;
        const terminal = deps.getCurrentTerminal();
        if (!terminal || data.terminalId !== terminal.id) return;

        const output = document.getElementById("terminal-output");
        if (output) {
            output.textContent += data.data;
            output.scrollTop = output.scrollHeight;
        }
    }

    function handleCommandCompleted(data: any) {
        if (!data || typeof data !== "object") return;
        const terminal = deps.getCurrentTerminal();
        if (!terminal || data.terminalId !== terminal.id) return;

        const output = document.getElementById("terminal-output");
        if (output) {
            output.textContent += `\n[Command completed with exit code: ${data.exitCode}]\n`;
            output.scrollTop = output.scrollHeight;
        }
    }

    return {
        createTerminal,
        executeTerminalCommand,
        runTerminalSecurityProbe,
        closeTerminal,
        handleTerminalOutput,
        handleCommandCompleted,
    };
}
