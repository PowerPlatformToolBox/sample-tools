/// <reference types="@pptb/types" />

/**
 * Headless runtime for PPTB MCP agent invocation.
 *
 * Compiled entry point: dist/headless.js (see pptb.config.json -> agents.headlessEntry)
 *
 * Input schema  : pptb.config.json -> invocation.prefill
 * Output schema : pptb.config.json -> invocation.returnTopic
 */

/** Input provided by the MCP caller (matches invocation.prefill schema). */
type HeadlessInput = {
    entityName?: string;
};

/** Logger provided by the PPTB runtime. */
type HeadlessLogger = {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
};

/** Context injected by the PPTB MCP runtime. */
type HeadlessContext = {
    /** Unique identifier for this tool instance. */
    toolId: string;
    /** Human-readable name of the tool. */
    toolName: string;
    /** Invocation mode, e.g. "two-way". */
    invocationMode: string;
    /** Report progress back to the caller (0-100). */
    updateProgress: (percent: number, message: string) => void;
    /** Structured logger provided by the runtime. */
    logger: HeadlessLogger;
};

/** Return value (matches invocation.returnTopic schema). */
type HeadlessResult = {
    entityName: string;
    fetchXml: string;
    recordCount: number;
    records: Record<string, unknown>[];
};

type CommonJsModule = {
    exports: {
        invokeHeadless?: (input: HeadlessInput, context: HeadlessContext) => Promise<HeadlessResult>;
    };
};

declare const module: CommonJsModule;

declare const dataverseAPI: DataverseAPI.API;

function sanitizeEntityName(value: string): string {
    const trimmed = value.trim();

    if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
        throw new Error("Invalid entity name. Only letters, numbers, and underscores are allowed.");
    }

    return trimmed.toLowerCase();
}

async function resolveEntityAttributes(api: DataverseAPI.API, entityName: string): Promise<{ idAttribute: string; nameAttribute?: string }> {
    try {
        const metadata = await api.getEntityMetadata(entityName, true, ["PrimaryIdAttribute", "PrimaryNameAttribute"]);
        const idAttribute = typeof metadata.PrimaryIdAttribute === "string" && metadata.PrimaryIdAttribute.trim().length > 0 ? metadata.PrimaryIdAttribute : `${entityName}id`;
        const nameAttribute = typeof metadata.PrimaryNameAttribute === "string" && metadata.PrimaryNameAttribute.trim().length > 0 ? metadata.PrimaryNameAttribute : undefined;

        return { idAttribute, nameAttribute };
    } catch {
        // Fallback keeps headless invocation resilient when metadata lookup is unavailable.
        return {
            idAttribute: `${entityName}id`,
            nameAttribute: "name",
        };
    }
}

function buildFetchXml(entityName: string, idAttribute: string, nameAttribute?: string): string {
    const attributeLines = [`    <attribute name="${idAttribute}" />`, ...(nameAttribute ? [`    <attribute name="${nameAttribute}" />`] : [])];

    const orderLine = nameAttribute ? `\n    <order attribute="${nameAttribute}" />` : "";

    return `<fetch top="10">\n  <entity name="${entityName}">\n${attributeLines.join("\n")}${orderLine}\n  </entity>\n</fetch>`;
}

/**
 * Headless invocation handler.
 *
 * Builds a FetchXML query for the supplied entity name and returns it
 * so MCP agents can consume it without opening the tool UI.
 */
async function invokeHeadless(input: HeadlessInput, context: HeadlessContext): Promise<HeadlessResult> {
    const { toolId, toolName, invocationMode, updateProgress, logger } = context;

    logger.info(`Starting headless run for ${toolName} (${toolId}) in mode ${invocationMode}`);

    updateProgress(10, "validating input");

    if (typeof dataverseAPI === "undefined" || dataverseAPI === null) {
        throw new Error("dataverseAPI is not available in this runtime context");
    }

    const entityName = sanitizeEntityName(typeof input.entityName === "string" && input.entityName.trim() !== "" ? input.entityName : "account");

    updateProgress(40, "resolving entity metadata");

    const attributes = await resolveEntityAttributes(dataverseAPI, entityName);

    updateProgress(75, "building FetchXML");

    const fetchXml = buildFetchXml(entityName, attributes.idAttribute, attributes.nameAttribute);

    updateProgress(90, "executing FetchXML query");

    const result = await dataverseAPI.fetchXmlQuery(fetchXml);

    updateProgress(100, "done");
    logger.info(`Headless run complete for entity: ${entityName}. Returned ${result.value.length} record(s).`);

    return {
        entityName,
        fetchXml,
        recordCount: result.value.length,
        records: result.value,
    };
}

module.exports = {
    invokeHeadless,
};
