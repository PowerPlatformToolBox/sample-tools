/// <reference types="@pptb/types" />

import { createFileSystemFeature } from "./features/filesystem.js";
import { createTerminalFeature } from "./features/terminal.js";
import { createSecuritySuites, type SecuritySuites } from "./security/suites.js";

/**
 * HTML Sample Tool for Power Platform Tool Box
 *
 * This sample demonstrates:
 * - ToolBox API usage (connections, utils, terminal, events)
 * - Dataverse API usage (CRUD, queries, metadata)
 * - Event-driven architecture
 * - Error handling
 * - TypeScript with type safety
 */

// Global API references
const toolbox = window.toolboxAPI;
const dataverse = window.dataverseAPI;
const powerplatform = window.powerplatformAPI;

// Application state
let currentConnection: ToolBoxAPI.DataverseConnection | null = null;
let secondaryConnection: ToolBoxAPI.DataverseConnection | null = null;
let currentTerminal: ToolBoxAPI.Terminal | null = null;
let createdId: string | null = null;
let currentLaunchContext: Record<string, unknown> | null = null;

let securitySuites: SecuritySuites | null = null;
let terminalFeature: ReturnType<typeof createTerminalFeature> | null = null;
let fileSystemFeature: ReturnType<typeof createFileSystemFeature> | null = null;
let inputEntityName: string | null = null;

type PowerPlatformMethodName = "Get" | "Post" | "Put" | "Patch" | "Delete";

const powerPlatformNamespaces = [
    "Analytics",
    "AppManagement",
    "Authorization",
    "Connectivity",
    "CopilotStudio",
    "Dynamics",
    "EnvironmentManagement",
    "Governance",
    "Licensing",
    "PowerApps",
    "PowerAutomate",
    "PowerPages",
    "ResourceQuery",
    "UserManagement",
    "WorkflowAgents",
] as const;

/**
 * Initialize the application
 */
async function initialize() {
    log("Initializing HTML Sample Tool...", "info");

    try {
        // Check connection
        await refreshConnection();

        // Subscribe to events
        subscribeToEvents();

        terminalFeature = createTerminalFeature({
            toolbox,
            showNotification,
            log,
            getCurrentTerminal: () => currentTerminal,
            setCurrentTerminal: (t) => {
                currentTerminal = t;
            },
        });

        fileSystemFeature = createFileSystemFeature({
            toolbox,
            showNotification,
            log,
            getCurrentConnection: () => currentConnection,
        });

        // Initialize security suites (used by UI buttons)
        securitySuites = createSecuritySuites({
            toolbox,
            dataverse,
            getCurrentConnection: () => currentConnection,
            getCurrentTerminal: () => currentTerminal,
            createTerminal,
            handleTerminalOutput,
            handleCommandCompleted,
            showNotification,
            log,
        });

        await identifyLaunchContext();

        // Setup UI event handlers
        setupEventHandlers();

        // Apply theme
        await applyTheme();

        // Load any previously saved setting into UI
        await loadToolSetting();

        log("Tool initialized successfully", "success");
    } catch (error) {
        log(`Initialization error: ${(error as Error).message}`, "error");
    }
}

/**
 * Identifying Launch Context
 */
async function identifyLaunchContext() {
    try {
        const ctx = await toolbox.invocation.getLaunchContext();
        log(`Launch context: ${ctx}`, "info");

        if (ctx !== null) {
            // Tool was launched via inter-tool invocation
            inputEntityName = ctx.entityName as string;
            currentLaunchContext = ctx;

            log(`Launched with context for entity: ${inputEntityName}`, "success");

            // Set iti-entity-name value with the entity name from the launch context
            const entityNameInput = document.getElementById("iti-entity-name") as HTMLInputElement;
            if (entityNameInput) {
                entityNameInput.value = inputEntityName;
            }

            // Set default fetchXML to query the launched entity
            const defaultFetchOutput = document.getElementById("iti-default-fetch-output");
            if (defaultFetchOutput) {
                defaultFetchOutput.textContent = `
                    <fetch top="10">
                        <entity name="${inputEntityName}">
                            <attribute name="name" />
                            <attribute name="${inputEntityName}id" />
                            <order attribute="name" />
                        </entity>
                    </fetch>`;
            }
        }
    } catch (error) {
        log(`Error getting launch context: ${(error as Error).message}`, "error");
    }
}

/**
 * Refresh connection information
 */
async function refreshConnection() {
    try {
        currentConnection = await toolbox.connections.getActiveConnection();
        secondaryConnection = await toolbox.connections.getSecondaryConnection();

        const connectionInfo = document.getElementById("connection-info");
        if (!connectionInfo) return;

        if (currentConnection) {
            const envClass = currentConnection.environment.toLowerCase();
            connectionInfo.className = "info-box success";
            connectionInfo.innerHTML = `
                <div class="connection-details">
                    <div class="connection-item">
                        <strong>Name:</strong>
                        <span>${currentConnection.name}</span>
                    </div>
                    <div class="connection-item">
                        <strong>URL:</strong>
                        <span>${currentConnection.url}</span>
                    </div>
                    <div class="connection-item">
                        <strong>Environment:</strong>
                        <span class="env-badge ${envClass}">${currentConnection.environment}</span>
                    </div>
                    <div class="connection-item">
                        <strong>ID:</strong>
                        <span>${currentConnection.id}</span>
                    </div>
                </div>
            `;
            log(`Connected to: ${currentConnection.name}`, "success");
        } else {
            connectionInfo.className = "info-box warning";
            connectionInfo.innerHTML = "<p><strong>⚠️ No active connection</strong><br>Please connect to a Dataverse environment to use this tool.</p>";
            log("No active connection found", "warning");
        }

        if (secondaryConnection) {
            const secondaryInfo = document.getElementById("secondary-connection-info");
            if (!secondaryInfo) return;

            const envClass = secondaryConnection.environment.toLowerCase();
            secondaryInfo.className = "info-box success";
            secondaryInfo.innerHTML = `
                <div class="connection-details">
                    <div class="connection-item">
                        <strong>Name:</strong>
                        <span>${secondaryConnection.name}</span>
                    </div>
                    <div class="connection-item">
                        <strong>URL:</strong>
                        <span>${secondaryConnection.url}</span>
                    </div>
                    <div class="connection-item">
                        <strong>Environment:</strong>
                        <span class="env-badge ${envClass}">${secondaryConnection.environment}</span>
                    </div>
                    <div class="connection-item">
                        <strong>ID:</strong>
                        <span>${secondaryConnection.id}</span>
                    </div>
                </div>
            `;
            log(`Secondary connection: ${secondaryConnection.name}`, "success");
        } else {
            const secondaryInfo = document.getElementById("secondary-connection-info");
            if (!secondaryInfo) return;

            secondaryInfo.className = "info-box warning";
            secondaryInfo.innerHTML = "<p><strong>⚠️ No secondary connection</strong><br>Please connect to a secondary Dataverse environment to use this tool.</p>";
            log("No secondary connection found", "warning");
        }
    } catch (error) {
        log(`Error refreshing connection: ${(error as Error).message}`, "error");
    }
}

/**
 * Subscribe to platform events
 */
function subscribeToEvents() {
    toolbox.events.on((event, payload) => {
        log(`Event: ${payload.event}`, "info");

        switch (payload.event) {
            case "connection:updated":
            case "connection:created":
                refreshConnection();
                break;

            case "connection:deleted":
                currentConnection = null;
                refreshConnection();
                break;

            case "terminal:output":
                handleTerminalOutput(payload.data);
                break;

            case "terminal:command:completed":
                handleCommandCompleted(payload.data);
                break;

            case "terminal:error":
                log(`Terminal error: ${(payload.data as any).error}`, "error");
                break;
        }
    });
}

/**
 * Setup UI event handlers
 */
function setupEventHandlers() {
    // Notification buttons
    document.getElementById("show-success-btn")?.addEventListener("click", () => showNotification("Success!", "Operation completed successfully", "success"));

    document.getElementById("show-info-btn")?.addEventListener("click", () => showNotification("Information", "This is an informational message", "info"));

    document.getElementById("show-warning-btn")?.addEventListener("click", () => showNotification("Warning", "Please review this warning", "warning"));

    document.getElementById("show-error-btn")?.addEventListener("click", () => showNotification("Error", "An error has occurred", "error"));

    // Utility buttons
    document.getElementById("copy-clipboard-btn")?.addEventListener("click", copyToClipboard);
    document.getElementById("get-theme-btn")?.addEventListener("click", showCurrentTheme);
    document.getElementById("save-file-btn")?.addEventListener("click", saveDataToFile);

    // File System API buttons
    document.getElementById("read-text-btn")?.addEventListener("click", readText);
    document.getElementById("read-directory-btn")?.addEventListener("click", readDirectory);
    document.getElementById("create-directory-btn")?.addEventListener("click", createDirectory);
    document.getElementById("read-system-file-btn")?.addEventListener("click", readSystemFile);
    document.getElementById("read-hardcoded-file-btn")?.addEventListener("click", readHardcodedFile);
    document.getElementById("read-direct-file-btn")?.addEventListener("click", readDirectFile);

    // Terminal buttons
    document.getElementById("create-terminal-btn")?.addEventListener("click", createTerminal);
    document.getElementById("execute-command-btn")?.addEventListener("click", executeTerminalCommand);
    document.getElementById("run-security-probe-btn")?.addEventListener("click", runTerminalSecurityProbe);
    document.getElementById("run-terminal-suite-btn")?.addEventListener("click", () => securitySuites?.runTerminalSuite());
    document.getElementById("run-filesystem-suite-btn")?.addEventListener("click", () => securitySuites?.runFileSystemSuite());
    document.getElementById("run-events-suite-btn")?.addEventListener("click", () => securitySuites?.runEventsSuite());
    document.getElementById("run-settings-suite-btn")?.addEventListener("click", () => securitySuites?.runSettingsSuite());
    document.getElementById("run-dataverse-suite-btn")?.addEventListener("click", () => securitySuites?.runDataverseSuite());
    document.getElementById("run-security-suite-btn")?.addEventListener("click", () => securitySuites?.runAllSuites());
    document.getElementById("close-terminal-btn")?.addEventListener("click", closeTerminal);

    // Dataverse query button
    document.getElementById("query-accounts-btn")?.addEventListener("click", queryAccounts);
    document.getElementById("query-accounts-secondary-btn")?.addEventListener("click", queryAccountsSecondary);
    document.getElementById("query-contacts-querydata-btn")?.addEventListener("click", queryContactQueryData);

    // CRUD buttons
    document.getElementById("create-contact-btn")?.addEventListener("click", createContact);
    document.getElementById("update-contact-btn")?.addEventListener("click", updateContact);
    document.getElementById("delete-contact-btn")?.addEventListener("click", deleteContact);

    // Metadata button
    document.getElementById("get-metadata-btn")?.addEventListener("click", getContactMetadata);
    document.getElementById("get-metadata-attributes")?.addEventListener("click", getAccountAttributesMetadata);
    document.getElementById("get-metadata-allentities")?.addEventListener("click", getAllEntities);

    //Execute buttons
    document.getElementById("whoami-btn")?.addEventListener("click", executeWhoAmI);

    // Power Platform API buttons
    document.getElementById("list-apps-btn")?.addEventListener("click", listPowerApps);
    document.getElementById("list-flows-btn")?.addEventListener("click", listPowerAutomateFlows);
    document.getElementById("list-environments-btn")?.addEventListener("click", listEnvironments);
    document.getElementById("get-governance-btn")?.addEventListener("click", getGovernanceData);
    document.getElementById("query-role-definitions-btn")?.addEventListener("click", queryRoleDefinitions);
    document.getElementById("assign-role-btn")?.addEventListener("click", assignRole);
    document.getElementById("query-role-assignments-btn")?.addEventListener("click", queryRoleAssignments);
    document.getElementById("pp-generic-execute-btn")?.addEventListener("click", executeGenericPowerPlatformEndpoint);

    // Clear log button
    document.getElementById("clear-log-btn")?.addEventListener("click", clearLog);

    // Advanced utilities demos
    document.getElementById("parallel-demo-btn")?.addEventListener("click", demoExecuteParallel);
    document.getElementById("loading-demo-btn")?.addEventListener("click", demoLoading);

    // Settings buttons
    document.getElementById("load-setting-btn")?.addEventListener("click", loadToolSetting);
    document.getElementById("save-setting-btn")?.addEventListener("click", saveToolSetting);

    // Inter-tool invocation buttons
    document.getElementById("iti-return-value-btn")?.addEventListener("click", async () => {
        const fetchXML = document.getElementById("iti-default-fetch-output")?.textContent;
        await toolbox.invocation.returnData({
            fetchXml: fetchXML,
        });
        log(`Returned data to caller: ${fetchXML}`, "info");
        // PPTB automatically closes this window after delivering the result.
    });
    document.getElementById("iti-launch-fetchxml-btn")?.addEventListener("click", async () => {
        const entityName = (document.getElementById("iti-entity-logical-name") as HTMLInputElement).value;
        const result = await toolbox.invocation.launchTool(
            "@mohsinonxrm/pptb-fetchxml-studio", // npm package name of the target tool
            { entityName: entityName }, // prefill data (should match callee's prefill schema)
        );

        log(`Launched entity picker with result: ${JSON.stringify(result)}`, "info");
    });
}

/**
 * Show notification
 */
async function showNotification(title: string, body: string, type: "success" | "info" | "warning" | "error") {
    try {
        await toolbox.utils.showNotification({
            title,
            body,
            type,
            duration: 3000,
        });
        log(`Notification shown: ${title} - ${body}`, type);
    } catch (error) {
        log(`Error showing notification: ${(error as Error).message}`, "error");
    }
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard() {
    try {
        const data = {
            timestamp: new Date().toISOString(),
            connection: currentConnection?.name || "No connection",
            message: "This data was copied from the HTML Sample Tool",
        };

        await toolbox.utils.copyToClipboard(JSON.stringify(data, null, 2));
        await showNotification("Copied!", "Data copied to clipboard", "success");
    } catch (error) {
        log(`Error copying to clipboard: ${(error as Error).message}`, "error");
    }
}

/**
 * Show current theme
 */
async function showCurrentTheme() {
    try {
        const theme = await toolbox.utils.getCurrentTheme();
        await showNotification("Current Theme", `The current theme is: ${theme}`, "info");
        log(`Current theme: ${theme}`, "info");
    } catch (error) {
        log(`Error getting theme: ${(error as Error).message}`, "error");
    }
}

function requireTerminalFeature() {
    if (!terminalFeature) {
        throw new Error("Terminal feature not initialized");
    }
    return terminalFeature;
}

function requireFileSystemFeature() {
    if (!fileSystemFeature) {
        throw new Error("FileSystem feature not initialized");
    }
    return fileSystemFeature;
}

/**
 * Save data to file
 */
async function saveDataToFile() {
    await requireFileSystemFeature().saveDataToFile();
}

/**
 * Read text file
 */
async function readText() {
    await requireFileSystemFeature().readText();
}

/**
 * Read directory contents
 */
async function readDirectory() {
    await requireFileSystemFeature().readDirectory();
}

/**
 * Create directory
 */
async function createDirectory() {
    await requireFileSystemFeature().createDirectory();
}

/**
 * Read system file (hardcoded macOS path for testing)
 * This tests error handling when accessing restricted files
 */
async function readSystemFile() {
    await requireFileSystemFeature().readSystemFile();
}

/**
 * Read file with selection dialog, but then hardcode a macOS path instead
 * This tests ignoring user selection and attempting to read a restricted path
 */
async function readHardcodedFile() {
    await requireFileSystemFeature().readHardcodedFile();
}

/**
 * Read a hardcoded macOS file path directly without using selectPath dialog
 * This tests reading a restricted file with no user interaction
 */
async function readDirectFile() {
    await requireFileSystemFeature().readDirectFile();
}

/**
 * Create a terminal
 */
async function createTerminal() {
    await requireTerminalFeature().createTerminal();
}

/**
 * Execute terminal command
 */
async function executeTerminalCommand() {
    await requireTerminalFeature().executeTerminalCommand();
}

/**
 * Run a safe terminal security probe.
 * This validates terminal exposure and command chaining with non-malicious commands only.
 */
async function runTerminalSecurityProbe() {
    await requireTerminalFeature().runTerminalSecurityProbe();
}

/**
 * Close terminal
 */
async function closeTerminal() {
    await requireTerminalFeature().closeTerminal();
}

/**
 * Handle terminal output events
 */
function handleTerminalOutput(data: any) {
    requireTerminalFeature().handleTerminalOutput(data);
}

/**
 * Handle command completed events
 */
function handleCommandCompleted(data: any) {
    requireTerminalFeature().handleCommandCompleted(data);
}

/**
 * Query accounts from Dataverse
 */
async function queryAccounts() {
    if (!currentConnection) {
        await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
        return;
    }

    try {
        const output = document.getElementById("query-output");
        if (output) output.textContent = "Querying accounts...\n";

        // If user saved a FetchXML in settings, prefer that; otherwise use default
        const saved = await getSetting<string>("demo.fetchxml");
        const fetchXml =
            saved && saved.trim().length > 0
                ? saved
                : `
<fetch top="10">
    <entity name="account">
        <attribute name="name" />
        <attribute name="accountid" />
        <attribute name="emailaddress1" />
        <attribute name="telephone1" />
        <order attribute="name" />
    </entity>
</fetch>
                `.trim();

        const result = await dataverse.fetchXmlQuery(fetchXml);

        if (output) {
            output.textContent = `Found ${result.value.length} account(s):\n\n`;
            result.value.forEach((account: any, index: number) => {
                output.textContent += `${index + 1}. ${account.name}\n`;
                output.textContent += `   ID: ${account.accountid}\n`;
                if (account.emailaddress1) output.textContent += `   Email: ${account.emailaddress1}\n`;
                if (account.telephone1) output.textContent += `   Phone: ${account.telephone1}\n`;
                output.textContent += "\n";
            });
        }

        log(`Queried ${result.value.length} accounts`, "success");
    } catch (error) {
        const output = document.getElementById("query-output");
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error querying accounts: ${(error as Error).message}`, "error");
    }
}

async function queryContactQueryData() {
    if (!currentConnection) {
        await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
        return;
    }
    const output = document.getElementById("query-output");
    try {
        if (output) output.textContent = "Querying contacts... with QueryData\n";
        const queryString = "contacts?$top=10&$select=fullname,contactid,emailaddress1,telephone1&$orderby=fullname asc";
        if (output) output.textContent += "Using QueryData:\n" + queryString + "\n\n";

        const result = await window.dataverseAPI.queryData(queryString);
        if (output) output.textContent += `Found ${result.value.length} contact(s):\n\n`;
        result.value.forEach((contact: any, index: number) => {
            if (output) {
                output.textContent += `${index + 1}. ${contact.fullname}\n`;
                output.textContent += `   ID: ${contact.contactid}\n`;
                if (contact.emailaddress1) output.textContent += `   Email: ${contact.emailaddress1}\n`;
                if (contact.telephone1) output.textContent += `   Phone: ${contact.telephone1}\n`;
                output.textContent += "\n";
            }
        });
        log(`Queried ${result.value.length} contacts`, "success");
    } catch (error) {
        const errorMsg = `Error: ${(error as Error).message}`;
        if (output) output.textContent = errorMsg;
        log(`Error querying contacts: ${(error as Error).message}`, "error");
    }
}

/**
 * Query accounts from Dataverse using the secondary connection (FetchXML)
 */
async function queryAccountsSecondary() {
    if (!secondaryConnection) {
        await showNotification("No Secondary Connection", "Please configure a secondary Dataverse connection", "warning");
        return;
    }

    try {
        const output = document.getElementById("query-output-secondary");
        if (output) output.textContent = "Querying accounts using secondary connection...\n";

        // Use saved FetchXML if present, otherwise default
        const saved = await getSetting<string>("demo.fetchxml");
        const fetchXml =
            saved && saved.trim().length > 0
                ? saved
                : `
<fetch top="10">
    <entity name="account">
        <attribute name="name" />
        <attribute name="accountid" />
        <attribute name="emailaddress1" />
        <attribute name="telephone1" />
        <order attribute="name" />
    </entity>
</fetch>
        `.trim();

        // Pass 'secondary' to target the secondary connection
        const result = await dataverse.fetchXmlQuery(fetchXml, "secondary");

        if (output) {
            output.textContent = `Found ${result.value.length} account(s) on secondary:\n\n`;
            result.value.forEach((account: any, index: number) => {
                output.textContent += `${index + 1}. ${account.name}\n`;
                output.textContent += `   ID: ${account.accountid}\n`;
                if ((account as any).emailaddress1) output.textContent += `   Email: ${(account as any).emailaddress1}\n`;
                if ((account as any).telephone1) output.textContent += `   Phone: ${(account as any).telephone1}\n`;
                output.textContent += "\n";
            });
        }

        log(`Queried ${result.value.length} accounts on secondary`, "success");
    } catch (error) {
        const output = document.getElementById("query-output-secondary");
        if (output) output.textContent = `Error (secondary): ${(error as Error).message}`;
        log(`Error querying accounts (secondary): ${(error as Error).message}`, "error");
    }
}

/**
 * Create a new account
 */
async function createContact() {
    if (!currentConnection) {
        await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
        return;
    }

    try {
        const firstnameInput = document.getElementById("contact-firstname") as HTMLInputElement;
        const lastnameInput = document.getElementById("contact-lastname") as HTMLInputElement;

        const output = document.getElementById("crud-output");
        if (output) output.textContent = "Creating contact...\n";

        const result = await dataverse.create("contact", {
            firstname: firstnameInput.value,
            lastname: lastnameInput.value,
            telephone1: "555-0100",
            description: "Created by HTML Sample Tool",
        });

        createdId = result.id;

        if (output) {
            output.textContent = `Contact created successfully!\n\n`;
            output.textContent += `ID: ${result.id}\n`;
            output.textContent += `Name: ${firstnameInput.value} ${lastnameInput.value}\n`;
        }

        // Enable update and delete buttons
        const updateBtn = document.getElementById("update-contact-btn") as HTMLButtonElement;
        const deleteBtn = document.getElementById("delete-contact-btn") as HTMLButtonElement;
        if (updateBtn) updateBtn.disabled = false;
        if (deleteBtn) deleteBtn.disabled = false;

        await showNotification("Contact Created", `Contact "${firstnameInput.value} ${lastnameInput.value}" created successfully`, "success");
        log(`Contact created: ${result.id}`, "success");
    } catch (error) {
        const output = document.getElementById("crud-output");
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error creating contact: ${(error as Error).message}`, "error");
    }
}

/**
 * Update the created contact
 */
async function updateContact() {
    if (!createdId) {
        await showNotification("No Contact", "Please create a contact first", "warning");
        return;
    }

    try {
        const output = document.getElementById("crud-output");
        if (output) output.textContent = "Updating contact...\n";

        await dataverse.update("contact", createdId, {
            description: "Updated by HTML Sample Tool at " + new Date().toISOString(),
            telephone1: "555-0200",
        });

        if (output) {
            output.textContent = `Contact updated successfully!\n\n`;
            output.textContent += `ID: ${createdId}\n`;
            output.textContent += `Updated fields: description, telephone1\n`;
        }

        await showNotification("Contact Updated", "Contact updated successfully", "success");
        log(`Contact updated: ${createdId}`, "success");
    } catch (error) {
        const output = document.getElementById("crud-output");
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error updating contact: ${(error as Error).message}`, "error");
    }
}

/**
 * Delete the created contact
 */
async function deleteContact() {
    if (!createdId) {
        await showNotification("No Contact", "Please create a contact first", "warning");
        return;
    }

    try {
        const output = document.getElementById("crud-output");
        if (output) output.textContent = "Deleting contact...\n";

        await dataverse.delete("contact", createdId);

        if (output) {
            output.textContent = `Contact deleted successfully!\n\n`;
            output.textContent += `ID: ${createdId}\n`;
        }

        // Disable update and delete buttons
        const updateBtn = document.getElementById("update-contact-btn") as HTMLButtonElement;
        const deleteBtn = document.getElementById("delete-contact-btn") as HTMLButtonElement;
        if (updateBtn) updateBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;

        await showNotification("Contact Deleted", "Contact deleted successfully", "success");
        log(`Contact deleted: ${createdId}`, "success");
        createdId = null;
    } catch (error) {
        const output = document.getElementById("crud-output");
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error deleting contact: ${(error as Error).message}`, "error");
    }
}

/**
 * Get contact metadata
 */
async function getContactMetadata() {
    if (!currentConnection) {
        await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
        return;
    }

    try {
        const output = document.getElementById("metadata-output");
        if (output) output.textContent = "Retrieving metadata...\n";

        // Adjusted to match current API signature (logical name, includeAttributes?)
        const metadata = await dataverse.getEntityMetadata("contact", true);

        if (output) {
            output.textContent = "Contact Entity Metadata:\n\n";
            output.textContent += `Logical Name: ${metadata.LogicalName}\n`;
            output.textContent += `Metadata ID: ${metadata.MetadataId}\n`;
            output.textContent += `Display Name: ${metadata.DisplayName?.LocalizedLabels?.[0]?.Label || "N/A"}\n`;
        }

        log("Contact metadata retrieved", "success");
    } catch (error) {
        const output = document.getElementById("metadata-output");
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error getting metadata: ${(error as Error).message}`, "error");
    }
}

async function getAccountAttributesMetadata() {
    if (!currentConnection) {
        await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");

        return;
    }
    const output = document.getElementById("metadata-output");
    try {
        if (output) {
            output.textContent = "Retrieving account attributes metadata...\n";
            const metadata = await dataverse.getEntityRelatedMetadata("account", "Attributes", ["LogicalName", "DisplayName", "AttributeType"]);
            if (metadata) {
                const metadataArray = metadata.value as unknown[];
                output.textContent += `Found ${metadataArray.length} attributes:\n\n`;
                metadataArray.forEach((attr: any, index: number) => {
                    output.textContent += `${index + 1}. ${attr.LogicalName} (${attr.AttributeType}) - ${attr.DisplayName?.LocalizedLabels?.[0]?.Label || "N/A"}\n`;
                });
            }
        }
    } catch (error) {
        const output = document.getElementById("metadata-output");
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error getting account attributes metadata: ${(error as Error).message}`, "error");
    }
}

async function getAllEntities() {
    if (!currentConnection) {
        await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
        return;
    }
    const output = document.getElementById("metadata-output");
    if (output) {
        try {
            output.textContent = "Retrieving all entities metadata...\n";
            const metadata = await dataverse.getAllEntitiesMetadata();
            if (metadata) {
                const metadataArray = metadata.value as unknown[];
                output.textContent += `Found ${metadataArray.length} entities:\n\n`;
                metadataArray.forEach((entity: any, index: number) => {
                    output.textContent += `${index + 1}. ${entity.LogicalName} - ${entity.DisplayName?.LocalizedLabels?.[0]?.Label || "N/A"}\n`;
                });
            }
        } catch (error) {
            if (output) output.textContent = `Error: ${(error as Error).message}`;
            log(`Error getting all entities metadata: ${(error as Error).message}`, "error");
        }
    }
}

async function executeWhoAmI() {
    if (!currentConnection) {
        await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
        return;
    }
    try {
        const output = document.getElementById("execute-output");
        if (output) output.textContent = "Executing WhoAmI action...\n";

        const result = await dataverse.execute({ operationName: "WhoAmI", operationType: "function" });

        if (output) {
            output.textContent = "WhoAmI Result:\n\n";
            output.textContent += JSON.stringify(result, null, 2);
        }

        log("WhoAmI executed successfully", "success");
    } catch (error) {
        const output = document.getElementById("execute-output");
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error executing WhoAmI: ${(error as Error).message}`, "error");
    }
}

/**
 * Apply current theme
 */
async function applyTheme() {
    try {
        const theme = await toolbox.utils.getCurrentTheme();
        document.body.setAttribute("data-theme", theme);
    } catch (error) {
        log(`Error applying theme: ${(error as Error).message}`, "error");
    }
}

/**
 * Log message to event log
 */
function log(message: string, type: "info" | "success" | "warning" | "error" = "info") {
    const logDiv = document.getElementById("event-log");
    if (!logDiv) return;

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement("div");
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span>${message}</span>
    `;

    logDiv.insertBefore(logEntry, logDiv.firstChild);

    // Keep only last 50 entries
    while (logDiv.children.length > 50) {
        logDiv.removeChild(logDiv.lastChild!);
    }

    console.log(`[${type.toUpperCase()}] ${message}`);
}

/**
 * Clear event log
 */
function clearLog() {
    const logDiv = document.getElementById("event-log");
    if (logDiv) {
        logDiv.innerHTML = "";
    }
}

// -----------------------------
// Tool Settings helpers & demos
// -----------------------------

const SETTINGS_KEY = "demo.fetchxml";

async function getSetting<T = any>(key: string): Promise<T | undefined> {
    try {
        // Tool settings are scoped to the tool; implementation provided by the host app
        // API shape (based on docs): toolbox.settings.get(key)
        const value = await (toolbox as any).settings?.get?.(key);
        return value as T | undefined;
    } catch (error) {
        log(`Error reading setting: ${(error as Error).message}`, "error");
        return undefined;
    }
}

async function setSetting<T = any>(key: string, value: T): Promise<void> {
    try {
        await (toolbox as any).settings?.set?.(key, value);
    } catch (error) {
        log(`Error saving setting: ${(error as Error).message}`, "error");
        throw error;
    }
}

async function loadToolSetting() {
    const textarea = document.getElementById("settings-fetchxml") as HTMLTextAreaElement | null;
    const output = document.getElementById("settings-output");
    try {
        const val = await getSetting<string>(SETTINGS_KEY);
        if (textarea) textarea.value = val || "";
        if (output) output.textContent = val ? "Loaded saved FetchXML from settings." : "No saved FetchXML found.";
        log("Loaded tool setting", "info");
    } catch (error) {
        if (output) output.textContent = `Error loading setting: ${(error as Error).message}`;
    }
}

async function saveToolSetting() {
    const textarea = document.getElementById("settings-fetchxml") as HTMLTextAreaElement | null;
    const output = document.getElementById("settings-output");
    const value = (textarea?.value || "").trim();
    if (!value) {
        await showNotification("Nothing to save", "Enter FetchXML before saving.", "warning");
        return;
    }
    try {
        await setSetting(SETTINGS_KEY, value);
        if (output) output.textContent = "Saved FetchXML to tool settings.";
        await showNotification("Setting Saved", "Your FetchXML has been saved.", "success");
        log("Saved tool setting", "success");
    } catch (error) {
        if (output) output.textContent = `Error saving setting: ${(error as Error).message}`;
        await showNotification("Save Failed", (error as Error).message, "error");
    }
}

/**
 * Demonstrate executeParallel utility by performing three Dataverse operations in parallel.
 * Falls back gracefully if no connection is available.
 */
async function demoExecuteParallel() {
    const output = document.getElementById("parallel-output");
    if (output) output.textContent = "Running parallel operations...\n";

    if (!currentConnection) {
        if (output) output.textContent += "No active Dataverse connection.\n";
        await showNotification("No Connection", "Connect to a Dataverse environment to run the parallel demo", "warning");
        return;
    }

    try {
        // Prepare lightweight FetchXML queries (top 1 / top 3) for demo purposes
        const accountFetchXml = `<fetch top="1"><entity name="account"><attribute name="name" /><attribute name="accountid" /></entity></fetch>`;
        const contactFetchXml = `<fetch top="1"><entity name="contact"><attribute name="fullname" /><attribute name="contactid" /></entity></fetch>`;
        const userFetchXml = `<fetch top="3"><entity name="systemuser"><attribute name="fullname" /><attribute name="systemuserid" /></entity></fetch>`;

        log("Starting parallel Dataverse queries", "info");

        const [accounts, contacts, users] = await toolbox.utils.executeParallel(
            dataverse.fetchXmlQuery(accountFetchXml),
            dataverse.fetchXmlQuery(contactFetchXml),
            dataverse.fetchXmlQuery(userFetchXml),
        );

        if (output) {
            output.textContent += "All operations completed!\n\n";
            output.textContent += `Accounts Returned: ${accounts.value.length}\n`;
            accounts.value.forEach((a: any) => (output.textContent += ` • ${a.name} (${a.accountid})\n`));
            output.textContent += `\nContacts Returned: ${contacts.value.length}\n`;
            contacts.value.forEach((c: any) => (output.textContent += ` • ${c.fullname} (${c.contactid})\n`));
            output.textContent += `\nUsers Returned: ${users.value.length}\n`;
            users.value.forEach((u: any) => (output.textContent += ` • ${u.fullname} (${u.systemuserid})\n`));
        }

        await showNotification("Parallel Complete", "Fetched accounts, contacts & users", "success");
        log("Parallel queries finished successfully", "success");
    } catch (error) {
        if (output) output.textContent += `Error: ${(error as Error).message}\n`;
        log(`Parallel query error: ${(error as Error).message}`, "error");
        await showNotification("Parallel Error", (error as Error).message, "error");
    }
}

/**
 * Demonstrate showLoading/hideLoading utilities wrapping async work.
 */
async function demoLoading() {
    const output = document.getElementById("parallel-output");
    if (output) output.textContent = "Showing loading screen...\n";

    try {
        log("Loading screen displayed", "info");

        // Simulate async work or perform a lightweight query
        if (currentConnection) {
            const fetchXml = `<fetch top="2"><entity name="account"><attribute name="name" /></entity></fetch>`;
            const result = await dataverse.fetchXmlQuery(fetchXml);
            if (output) {
                output.textContent += `Fetched ${result.value.length} account(s) during loading:\n`;
                result.value.forEach((a: any) => (output.textContent += ` • ${a.name}\n`));
            }
        } else {
            // Fallback simulated delay
            await new Promise((r) => setTimeout(r, 1500));
            if (output) output.textContent += "Simulated work (no connection).\n";
        }
    } catch (error) {
        if (output) output.textContent += `Error during loading demo: ${(error as Error).message}\n`;
        log(`Loading demo error: ${(error as Error).message}`, "error");
        await showNotification("Loading Demo Error", (error as Error).message, "error");
    } finally {
        if (output) output.textContent += "\nLoading screen hidden.";
        log("Loading screen hidden", "info");
        await showNotification("Loading Complete", "Demo finished", "success");
    }
}

// -----------------------------
// Power Platform API Examples
// -----------------------------

async function listPowerApps() {
    const output = document.getElementById("powerapps-output");
    const envId = (document.getElementById("ppapps-env-id") as HTMLInputElement)?.value;

    if (!envId) {
        await showNotification("Missing Environment ID", "Please enter an environment ID", "warning");
        if (output) output.textContent = "Enter an environment ID to list apps.";
        return;
    }

    try {
        if (output) output.textContent = "Fetching Power Apps...\n";
        const result = await powerplatform.PowerApps.Get(`environments/${envId}/apps?api-version=2024-10-01`);

        if (output) {
            const apps = (result.value as any[]) || [];
            output.textContent += `Found ${apps.length} app(s):\n\n`;
            apps.forEach((app: any, index: number) => {
                output.textContent += `${index + 1}. ${app.name}\n`;
                output.textContent += `   ID: ${app.id || app.appId}\n`;
                output.textContent += `   Type: ${app.type || "N/A"}\n\n`;
            });
            log(`Listed ${apps.length} Power Apps`, "success");
        }
    } catch (error) {
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error listing Power Apps: ${(error as Error).message}`, "error");
    }
}

async function listPowerAutomateFlows() {
    const output = document.getElementById("powerautomate-output");
    const envId = (document.getElementById("ppautomate-env-id") as HTMLInputElement)?.value;

    if (!envId) {
        await showNotification("Missing Environment ID", "Please enter an environment ID", "warning");
        if (output) output.textContent = "Enter an environment ID to list flows.";
        return;
    }

    try {
        if (output) output.textContent = "Fetching Power Automate flows...\n";
        const result = await powerplatform.PowerAutomate.Get(`environments/${envId}/cloudFlows?api-version=2024-10-01`);

        if (output) {
            const flows = (result.value as any[]) || [];
            output.textContent += `Found ${flows.length} flow(s):\n\n`;
            flows.forEach((flow: any, index: number) => {
                output.textContent += `${index + 1}. ${flow.displayName || flow.name}\n`;
                output.textContent += `   ID: ${flow.id || flow.flowId}\n`;
                output.textContent += `   State: ${flow.state || "N/A"}\n\n`;
            });
            log(`Listed ${flows.length} Power Automate flows`, "success");
        }
    } catch (error) {
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error listing flows: ${(error as Error).message}`, "error");
    }
}

async function listEnvironments() {
    const output = document.getElementById("environments-output");

    try {
        if (output) output.textContent = "Fetching environments...\n";
        const result = await powerplatform.EnvironmentManagement.Get("environments?api-version=2024-10-01");

        if (output) {
            const envs = (result.value as any[]) || [];
            output.textContent += `Found ${envs.length} environment(s):\n\n`;
            envs.forEach((env: any, index: number) => {
                output.textContent += `${index + 1}. ${env.displayName}\n`;
                output.textContent += `   ID: ${env.id || env.environmentId}\n`;
                output.textContent += `   Type: ${env.type || env.environmentType || "N/A"}\n\n`;
            });
            log(`Listed ${envs.length} environments`, "success");
        }
    } catch (error) {
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error listing environments: ${(error as Error).message}`, "error");
    }
}

async function getGovernanceData() {
    const output = document.getElementById("governance-output");
    const envId = (document.getElementById("governance-env-id") as HTMLInputElement)?.value;

    if (!envId) {
        await showNotification("Missing Environment ID", "Please enter an environment ID", "warning");
        if (output) output.textContent = "Enter an environment ID to get governance data.";
        return;
    }

    try {
        if (output) output.textContent = "Fetching governance data...\n";
        const result = await powerplatform.Governance.Get(`ruleBasedPolicies/environments/${envId}/assignments?includeRuleSetCounts=true&api-version=2024-10-01`);

        if (output) {
            output.textContent += "Governance Data:\n\n";
            output.textContent += JSON.stringify(result, null, 2);
        }
        log("Governance data retrieved", "success");
    } catch (error) {
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error getting governance data: ${(error as Error).message}`, "error");
    }
}

/**
 * Query role definitions from Power Platform Authorization API
 * Retrieves all available role definitions with their IDs and names
 */
async function queryRoleDefinitions() {
    const output = document.getElementById("role-definitions-output");

    try {
        if (output) output.textContent = "Fetching role definitions...\n";

        // Call the Power Platform Authorization API to get role definitions
        const result = await powerplatform.Authorization.Get("roleDefinitions?api-version=2024-10-01");

        if (output) {
            const roleDefinitions = (result.value as any[]) || [];
            output.textContent = `Found ${roleDefinitions.length} role definition(s):\n\n`;

            if (roleDefinitions.length === 0) {
                output.textContent += "No role definitions found.";
            } else {
                // Display role definitions in a formatted table
                roleDefinitions.forEach((role: any, index: number) => {
                    output.textContent += `${index + 1}. ${role.roleDefinitionName}\n`;
                    output.textContent += `   ID: ${role.roleDefinitionId}\n`;
                    if (role.description) output.textContent += `   Description: ${role.description}\n`;
                    output.textContent += "\n";
                });
            }

            log(`Retrieved ${roleDefinitions.length} role definitions`, "success");
            await showNotification("Role Definitions Retrieved", `Found ${roleDefinitions.length} role definition(s)`, "success");
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        if (output) output.textContent = `Error: ${errorMessage}`;
        log(`Error querying role definitions: ${errorMessage}`, "error");
        await showNotification("Error", `Failed to retrieve role definitions: ${errorMessage}`, "error");
    }
}

/**
 * Assign a role to a principal (user, service principal, or enterprise app)
 * Creates a role assignment in the Power Platform Authorization API
 */
async function assignRole() {
    const output = document.getElementById("role-assignment-output");
    const tenantId = (document.getElementById("role-assign-tenant-id") as HTMLInputElement)?.value;
    const principalObjectId = (document.getElementById("role-assign-principal-object-id") as HTMLInputElement)?.value;
    const principalType = (document.getElementById("role-assign-principal-type") as HTMLSelectElement)?.value || "ApplicationUser";
    const roleDefinitionId = (document.getElementById("role-assign-role-definition-id") as HTMLInputElement)?.value;

    if (!tenantId || !principalObjectId || !roleDefinitionId) {
        await showNotification("Missing Fields", "Please fill in all required fields", "warning");
        if (output) output.textContent = "Please provide Tenant ID, Principal Object ID, and Role Definition ID.";
        return;
    }

    try {
        if (output) output.textContent = "Assigning role...\n";

        // Build the request body
        const body = {
            roleDefinitionId,
            principalObjectId,
            principalType,
            scope: `/tenants/${tenantId}`,
        };

        // Call the Power Platform Authorization API to assign role
        const result = await powerplatform.Authorization.Post("roleAssignments?api-version=2024-10-01", body);

        if (output) {
            output.textContent = "Role assignment created successfully!\n\n";
            output.textContent += "Assignment Details:\n";
            output.textContent += `ID: ${(result as any).id || (result as any).roleAssignmentId}\n`;
            output.textContent += `Role Definition ID: ${(result as any).roleDefinitionId}\n`;
            output.textContent += `Principal Object ID: ${(result as any).principalObjectId}\n`;
            output.textContent += `Principal Type: ${(result as any).principalType}\n`;
            output.textContent += `Scope: ${(result as any).scope}\n`;
        }

        log(`Role assigned successfully to ${principalObjectId}`, "success");
        await showNotification("Role Assigned", `Role assigned to ${principalObjectId}`, "success");
    } catch (error) {
        const errorMessage = (error as Error).message;
        if (output) output.textContent = `Error: ${errorMessage}`;
        log(`Error assigning role: ${errorMessage}`, "error");
        await showNotification("Error", `Failed to assign role: ${errorMessage}`, "error");
    }
}

/**
 * Query existing role assignments from Power Platform Authorization API
 * Optionally filter by principal object ID
 */
async function queryRoleAssignments() {
    const output = document.getElementById("role-assignments-list-output");
    const filterPrincipalId = (document.getElementById("query-role-assign-principal-id") as HTMLInputElement)?.value;

    try {
        if (output) output.textContent = "Fetching role assignments...\n";

        // Call the Power Platform Authorization API to get role assignments
        const result = await powerplatform.Authorization.Get("roleAssignments?api-version=2024-10-01");

        if (output) {
            const roleAssignments = (result.value as any[]) || [];

            // Filter by principal object ID if provided
            let filteredAssignments = roleAssignments;
            if (filterPrincipalId && filterPrincipalId.trim()) {
                filteredAssignments = roleAssignments.filter((assignment: any) => assignment.principalObjectId === filterPrincipalId);
                output.textContent = `Found ${filteredAssignments.length} role assignment(s) for principal ${filterPrincipalId}:\n\n`;
            } else {
                output.textContent = `Found ${roleAssignments.length} total role assignment(s):\n\n`;
            }

            if (filteredAssignments.length === 0) {
                output.textContent += "No role assignments found.";
            } else {
                // Display role assignments in a formatted table
                filteredAssignments.forEach((assignment: any, index: number) => {
                    output.textContent += `${index + 1}. Role Assignment ID: ${assignment.roleAssignmentId || assignment.id}\n`;
                    output.textContent += `   Role Definition ID: ${assignment.roleDefinitionId}\n`;
                    output.textContent += `   Principal Object ID: ${assignment.principalObjectId}\n`;
                    output.textContent += `   Principal Type: ${assignment.principalType}\n`;
                    output.textContent += `   Scope: ${assignment.scope}\n`;
                    output.textContent += "\n";
                });
            }

            log(`Retrieved ${filteredAssignments.length} role assignment(s)${filterPrincipalId ? ` for ${filterPrincipalId}` : ""}`, "success");
            await showNotification("Role Assignments Retrieved", `Found ${filteredAssignments.length} role assignment(s)`, "success");
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        if (output) output.textContent = `Error: ${errorMessage}`;
        log(`Error querying role assignments: ${errorMessage}`, "error");
        await showNotification("Error", `Failed to retrieve role assignments: ${errorMessage}`, "error");
    }
}

async function executeGenericPowerPlatformEndpoint() {
    const output = document.getElementById("pp-generic-output");
    const method = (document.getElementById("pp-generic-method") as HTMLSelectElement | null)?.value as PowerPlatformMethodName;
    const namespace = (document.getElementById("pp-generic-namespace") as HTMLSelectElement | null)?.value;
    const path = (document.getElementById("pp-generic-path") as HTMLInputElement | null)?.value?.trim();
    const rawBody = (document.getElementById("pp-generic-body") as HTMLTextAreaElement | null)?.value?.trim();

    if (!method || !namespace || !path) {
        await showNotification("Missing Inputs", "Method, namespace, and path are required", "warning");
        if (output) output.textContent = "Please provide method, namespace, and path.";
        return;
    }

    if (!powerPlatformNamespaces.includes(namespace as (typeof powerPlatformNamespaces)[number])) {
        await showNotification("Invalid Namespace", `Unsupported namespace: ${namespace}`, "error");
        if (output) output.textContent = `Unsupported namespace: ${namespace}`;
        return;
    }

    let parsedBody: unknown = undefined;
    if (rawBody) {
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            await showNotification("Invalid JSON Body", "Request body must be valid JSON", "error");
            if (output) output.textContent = "Request body is not valid JSON.";
            return;
        }
    }

    try {
        if (output) {
            output.textContent = `Executing ${method.toUpperCase()} ${namespace}/${path}\n\n`;
        }

        const namespaceClient = (powerplatform as unknown as Record<string, Record<PowerPlatformMethodName, (...args: unknown[]) => Promise<unknown>>>)[namespace];
        if (!namespaceClient) {
            throw new Error(`Namespace '${namespace}' not found on powerplatformAPI`);
        }

        const methodClient = namespaceClient[method];
        if (typeof methodClient !== "function") {
            throw new Error(`Method '${method}' is not available on namespace '${namespace}'`);
        }

        let result: unknown;
        if (method === "Get") {
            result = await methodClient(path);
        } else if (method === "Delete") {
            result = parsedBody === undefined ? await methodClient(path) : await methodClient(path, undefined, undefined, parsedBody);
        } else {
            result = await methodClient(path, parsedBody ?? {});
        }

        if (output) {
            output.textContent += JSON.stringify(result, null, 2);
        }

        log(`Executed ${method} on ${namespace}: ${path}`, "success");
    } catch (error) {
        const message = (error as Error).message;
        if (output) output.textContent = `Error executing endpoint: ${message}`;
        log(`Generic Power Platform endpoint error: ${message}`, "error");
        await showNotification("Endpoint Execution Failed", message, "error");
    }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
} else {
    initialize();
}
