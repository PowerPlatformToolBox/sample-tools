import { executeCommandWithPolicyGuard } from "../security/policy.js";
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

            const probeCommands = isWindows
                ? ["echo PPTB_SECURITY_PROBE", "Get-Location", "$PSVersionTable.PSVersion.ToString()", 'Write-Output "CHAIN_TEST"; Write-Output "SECOND_COMMAND"']
                : ["echo PPTB_SECURITY_PROBE", "pwd", "uname -a", "echo CHAIN_TEST && echo SECOND_COMMAND"];

            if (output) {
                output.textContent = "Running safe terminal security probe...\n";
                output.textContent += "This probe does not execute destructive commands.\n\n";
            }

            deps.log("Running safe terminal security probe", "warning");

            for (const command of probeCommands) {
                if (output) output.textContent += `> ${command}\n`;
                await executeCommandWithPolicyGuard(deps.toolbox, terminal.id, command);
                await delay(300);
            }

            if (output) {
                output.textContent += "\nProbe summary:\n";
                output.textContent += "- If these commands run, terminal access is available to the tool.\n";
                output.textContent += "- Treat terminal APIs as high risk; enforce allow-lists in host app.\n";
                output.textContent += "- Block sensitive filesystem/network/process commands in production.\n";
            }

            await deps.showNotification("Security Probe Complete", "Review terminal output for risk indicators", "warning");
            deps.log("Security probe completed", "warning");
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
