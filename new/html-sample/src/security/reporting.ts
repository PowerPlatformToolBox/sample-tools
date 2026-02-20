import { getBlockedCommandReason, normalizeForPolicy } from "./policy.js";

export type SecuritySeverity = "low" | "medium" | "high" | "critical";

export type SecuritySuiteResult = {
    name: string;
    status: "pass" | "fail";
    severity: SecuritySeverity;
    details: string;
};

export function addSecurityResult(results: SecuritySuiteResult[], name: string, status: "pass" | "fail", severity: SecuritySeverity, details: string) {
    results.push({ name, status, severity, details });
}

export function assertCommandBlockedWithToken(name: string, command: string, expectedToken: string, severity: SecuritySeverity = "critical"): SecuritySuiteResult {
    const reason = getBlockedCommandReason(command);
    const pass = reason !== null && normalizeForPolicy(reason).includes(normalizeForPolicy(expectedToken));

    return {
        name,
        status: pass ? "pass" : "fail",
        severity,
        details: pass ? `Command blocked with expected token: ${expectedToken}` : `Expected token '${expectedToken}' not found in block reason. Reason: ${reason || "none"}`,
    };
}

export function getHighestSeverity(results: SecuritySuiteResult[]): SecuritySeverity {
    const order: SecuritySeverity[] = ["low", "medium", "high", "critical"];
    let highest: SecuritySeverity = "low";
    for (const r of results) {
        if (order.indexOf(r.severity) > order.indexOf(highest)) {
            highest = r.severity;
        }
    }
    return highest;
}

function sortResultsForTriage(results: SecuritySuiteResult[]): SecuritySuiteResult[] {
    const severityOrder: Record<SecuritySeverity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
    };

    const statusOrder: Record<SecuritySuiteResult["status"], number> = {
        fail: 0,
        pass: 1,
    };

    return [...results].sort((a, b) => {
        const bySeverity = severityOrder[a.severity] - severityOrder[b.severity];
        if (bySeverity !== 0) return bySeverity;

        const byStatus = statusOrder[a.status] - statusOrder[b.status];
        if (byStatus !== 0) return byStatus;

        return a.name.localeCompare(b.name);
    });
}

export function renderSuiteReport(outputId: string, suiteName: string, results: SecuritySuiteResult[]) {
    const output = document.getElementById(outputId);
    const sortedResults = sortResultsForTriage(results);
    const failed = results.filter((r) => r.status === "fail").length;
    const passed = results.length - failed;
    const highestSeverity = getHighestSeverity(results);
    const report = {
        generatedAt: new Date().toISOString(),
        suite: suiteName,
        summary: {
            total: results.length,
            passed,
            failed,
            highestSeverity,
        },
        results: sortedResults,
    };

    if (output) {
        output.textContent = JSON.stringify(report, null, 2);
    }

    return { failed, passed, total: results.length, highestSeverity };
}
