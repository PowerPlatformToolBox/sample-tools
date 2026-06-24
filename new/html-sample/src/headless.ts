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
    /** Bearer token for authenticating against Dataverse. Not logged. */
    authToken?: string;
    /** Report progress back to the caller (0-100). */
    updateProgress: (percent: number, message: string) => void;
    /** Structured logger provided by the runtime. */
    logger: HeadlessLogger;
};

/** Return value (matches invocation.returnTopic schema). */
type HeadlessResult = {
    fetchXml: string;
};

type CommonJsModule = {
    exports: {
        invokeHeadless?: (input: HeadlessInput, context: HeadlessContext) => Promise<HeadlessResult>;
    };
};

declare const module: CommonJsModule;

/**
 * Headless invocation handler.
 *
 * Builds a FetchXML query for the supplied entity name and returns it
 * so MCP agents can consume it without opening the tool UI.
 */
async function invokeHeadless(input: HeadlessInput, context: HeadlessContext): Promise<HeadlessResult> {
    const { toolId, toolName, invocationMode, authToken, updateProgress, logger } = context;

    logger.info(`Starting headless run for ${toolName} (${toolId}) in mode ${invocationMode}`);

    updateProgress(10, "validating input");

    const entityName = typeof input.entityName === "string" && input.entityName.trim() !== "" ? input.entityName.trim() : "account";

    if (authToken) {
        updateProgress(40, "auth token received");
    } else {
        updateProgress(40, "running without auth token");
    }

    updateProgress(80, "building FetchXML");

    const fetchXml = `<fetch top="10">
  <entity name="${entityName}">
    <attribute name="name" />
    <attribute name="${entityName}id" />
    <order attribute="name" />
  </entity>
</fetch>`;

    updateProgress(100, "done");
    logger.info(`Headless run complete for entity: ${entityName}`);

    return { fetchXml };
}

module.exports = {
    invokeHeadless,
};
