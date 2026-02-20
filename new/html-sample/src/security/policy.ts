const TERMINAL_ALLOWED_COMMANDS = new Set([
    "dir",
    "ls -la",
    "echo PPTB_SECURITY_PROBE",
    "pwd",
    "uname -a",
    "echo CHAIN_TEST && echo SECOND_COMMAND",
    "Get-Location",
    "$PSVersionTable.PSVersion.ToString()",
    'Write-Output "CHAIN_TEST"; Write-Output "SECOND_COMMAND"',
]);

const TERMINAL_BLOCKED_TOKENS = [
    "rm ",
    "del ",
    "format",
    "sudo",
    "chmod",
    "chown",
    "powershell -enc",
    "invoke-expression",
    "downloadstring",
    "curl ",
    "wget ",
    "invoke-webrequest",
    "http://",
    "https://",
    "| curl",
    "| wget",
    "base64",
    "scp ",
    "ssh ",
    "id_rsa",
    ".ssh",
    "system_profiler",
    "wmic",
    "procdump",
    "memory",
    "dump",
];

const FILE_PATH_BLOCK_LIST = ["/etc/passwd", "/etc/shadow", "/etc/hosts", "/var/log/system.log", "/.ssh/", "\\.ssh\\", "id_rsa", "known_hosts", "c:\\windows\\system32"];

const LOCAL_DATA_TOKENS = ["uname", "system_profiler", "wmic", "ipconfig", "ifconfig", "cat ", "type ", "get-content", "env", "$env:", "whoami", ".ssh", "id_rsa"];

const NETWORK_EGRESS_TOKENS = ["curl ", "wget ", "invoke-webrequest", "http://", "https://", "ftp://", "scp ", "nc ", "netcat"];

export function listTerminalAllowedCommands(): string[] {
    return Array.from(TERMINAL_ALLOWED_COMMANDS);
}

export function listTerminalBlockedTokens(): string[] {
    return [...TERMINAL_BLOCKED_TOKENS];
}

export function listFilePathBlockedPatterns(): string[] {
    return [...FILE_PATH_BLOCK_LIST];
}

export function normalizeForPolicy(value: string): string {
    return value.trim().replace(/\\/g, "/").toLowerCase();
}

function isAbsolutePath(filePath: string): boolean {
    return /^([a-zA-Z]:[\\/]|\/)/.test(filePath.trim());
}

function hasPathTraversalSegment(normalizedPath: string): boolean {
    return normalizedPath.includes("/../") || normalizedPath.endsWith("/..") || normalizedPath.startsWith("../");
}

export function getBlockedCommandReason(command: string): string | null {
    const normalized = command.trim();

    if (!normalized) {
        return "Command is empty";
    }

    if (normalized.length > 200) {
        return "Command exceeds maximum allowed length";
    }

    if (/[\r\n]/.test(normalized)) {
        return "Multiline commands are not allowed";
    }

    if (/[\u0000-\u001F\u007F]/.test(normalized)) {
        return "Control characters are not allowed";
    }

    const low = normalizeForPolicy(normalized);
    const hasLocalDataSignal = LOCAL_DATA_TOKENS.some((token) => low.includes(token));
    const hasNetworkSignal = NETWORK_EGRESS_TOKENS.some((token) => low.includes(token));
    if (hasLocalDataSignal && hasNetworkSignal) {
        return "Potential local-data exfiltration pattern detected";
    }

    if (TERMINAL_ALLOWED_COMMANDS.has(normalized)) {
        return null;
    }

    const blockedToken = TERMINAL_BLOCKED_TOKENS.find((token) => low.includes(token));
    if (blockedToken) {
        return `Blocked token detected: ${blockedToken}`;
    }

    return "Command is not on allow-list";
}

export function getBlockedPathReason(filePath: string): string | null {
    if (!isAbsolutePath(filePath)) {
        return "Only absolute paths are allowed";
    }

    const normalized = normalizeForPolicy(filePath);

    if (hasPathTraversalSegment(normalized)) {
        return "Path traversal segments are not allowed";
    }

    const blockedMatch = FILE_PATH_BLOCK_LIST.find((token) => normalized.includes(token));
    if (blockedMatch) {
        return `Sensitive path pattern detected: ${blockedMatch}`;
    }

    return null;
}

export async function executeCommandWithPolicyGuard(toolbox: typeof window.toolboxAPI, terminalId: string, command: string): Promise<void> {
    const blockedReason = getBlockedCommandReason(command);
    if (blockedReason) {
        throw new Error(`Terminal command blocked by policy. ${blockedReason}`);
    }

    await toolbox.terminal.execute(terminalId, command);
}

export async function readTextWithPolicyGuard(toolbox: typeof window.toolboxAPI, filePath: string): Promise<string> {
    const blockedReason = getBlockedPathReason(filePath);
    if (blockedReason) {
        throw new Error(`File path blocked by policy. ${blockedReason}`);
    }

    return toolbox.fileSystem.readText(filePath);
}
