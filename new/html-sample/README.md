# HTML Sample Tool

A complete example tool for Power Platform Tool Box built with HTML, CSS, and TypeScript.

## Features

This sample demonstrates:

- ✅ **ToolBox API Integration**
    - Connection management and status display
    - Notifications (success, info, warning, error)
    - Clipboard operations
    - File save dialogs
    - Tool settings storage (save/load/clear)
    - Theme detection
    - Terminal creation and command execution
    - Event subscription and handling
    - Prevent Close / Release Prevent Close (guard against accidental tool/app closure)

- ✅ **Dataverse API Usage**
    - FetchXML queries
    - Multi-connection queries (primary and secondary)
    - CRUD operations (Create, Read, Update, Delete)
    - Entity metadata retrieval
    - Error handling

- ✅ **Best Practices**
    - TypeScript with full type safety
    - Event-driven architecture
    - Proper error handling
    - Clean, modern UI design
    - Responsive layout

## Installation

### Prerequisites

- Node.js 18 or higher
- Power Platform Tool Box desktop application

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

This compiles the TypeScript source in `src/` to JavaScript in `dist/`.

## Project Structure

```
html-sample/
├── dotnet/              # C# worker tool and shared Core project
├── src/
│   ├── app.ts           # Main application logic (TypeScript)
│   ├── features/        # UI feature modules (terminal, filesystem, etc.)
│   ├── security/        # Security policy + test suites
│   └── utils/           # Small reusable helpers
├── index.html           # Main HTML file (entry point)
├── styles.css           # Stylesheet
├── package.json         # Package configuration
├── tsconfig.json        # TypeScript configuration
└── README.md           # This file
```

## Usage

### Install in Power Platform Tool Box

1. Open Power Platform Tool Box
2. Go to Tools section
3. Click "Install Tool"
4. Enter the path to this directory or publish to npm and use the package name

### Features Overview

#### Connection Status

- Shows current Dataverse connection details
- Displays environment type (Production, Sandbox, Dev)
- Updates automatically when connection changes

#### ToolBox API Examples

**Notifications:**

- Test different notification types
- Success, info, warning, and error messages

**Utilities:**

- Copy data to clipboard
- Get current theme (light/dark)
- Save data to file with native dialog

**Prevent Close:**

- Call `preventClose()` to mark this tool instance as blocking closure (e.g. to guard unsaved changes)
- While enabled, closing the tool's tab or quitting PPTB shows a warning dialog with an "Ignore & Close" override
- Call `releasePreventClose()` to clear the guard once changes are saved

**Terminal:**

- Create isolated terminal instances
- Execute shell commands
- Run a safe terminal security probe (non-destructive)
- Run API-specific security test suites with pass/fail JSON reports
- View command output
- Close terminal when done

#### Dataverse API Examples

**Query Records:**

- FetchXML query to retrieve top 10 accounts
- Display results with formatting
- If a FetchXML is saved in Tool Settings, the Query button will use that instead of the default
- This sample supports up to three connections: use the Primary, Secondary, and Third query buttons to test slots 0, 1, and 2

**CRUD Operations:**

- Create new account records
- Update existing records
- Delete records
- Full error handling

**Metadata:**

- Retrieve entity metadata
- Display entity information and attributes

#### Event Log

- Real-time event logging
- Color-coded by severity
- Timestamp for each entry
- Clear log functionality

## Development

### Watch Mode

During development, you can use watch mode to automatically recompile on changes:

```bash
npm run watch
```

### Type Safety

This tool uses TypeScript with the `@pptb/types` package for full type safety:

```typescript
/// <reference types="@pptb/types" />

// Type-safe API access
const toolbox: typeof window.toolboxAPI = window.toolboxAPI;
const dataverse: typeof window.dataverseAPI = window.dataverseAPI;
```

### Customization

1. **Modify UI:** Edit `index.html` and `styles.css`
2. **Add Features:** Update `src/app.ts`
3. **Rebuild:** Run `npm run build`
4. **Reload Tool:** In Power Platform Tool Box, close and reopen the tool

## .NET Worker Test

The **.NET Worker Test (Account Summary)** section is beside Query Records. The
worker summarizes up to ten accounts by country. The TypeScript callback builds
the FetchXML and calls Dataverse; the C# worker groups the returned rows and
returns `{ totalAccounts, countries: [{ country, count }] }`. The direct account
query remains independent and continues to use saved `demo.fetchxml`. Start,
summarize, cancel and stop are explicit; worker status/output is separate.
Loading the tool does not start .NET. The headless entry point is unchanged and
never starts a worker.

The complete C# sample is in `dotnet/Worker`; it has no separate Core project.
Workers run as the current OS user and **are not sandboxed**. No tokens, secrets
or credential environment variables are sent by this tool.

Tool code uses PPTB's worker session API rather than implementing a JSON-RPC
transport:

```typescript
const worker = await toolboxAPI.workers.connect("sample", {
    requests: {
        "dataverse/getAccounts": (params, context) => {
            const top = typeof params === "object" && params !== null && "top" in params ? params.top : undefined;
            if (typeof top !== "number" || !Number.isSafeInteger(top) || top < 1 || top > 100) throw new Error("Expected an account limit from 1 to 100");
            if (context.isCancellationRequested) throw new Error("Cancelled");
            const fetchXml = `<fetch top="${top}"><entity name="account"><attribute name="name" /><attribute name="address1_country" /></entity></fetch>`;
            return dataverseAPI.fetchXmlQuery(fetchXml).then((result) => ({ value: result.value }));
        },
    },
    notifications: {
        progress: (message) => showStatus(String(message)),
    },
});

await worker.ready;
const result = await worker.request("accounts/summarizeByCountry", { top: 10 });
await worker.stop();
```

PPTB owns JSON-RPC framing, readiness buffering, request correlation,
cancellation, and transport disposal. Tool authors provide only the
worker-initiated callbacks they need and call named worker methods.

### Build And Pack

Use the PR7 desktop development build, Node.js, and a compatible installed .NET
10 SDK/runtime. This sample pins `@pptb/types@1.2.7-beta.6`, the current npm
beta tag, for `workers.connect()`. The shrinkwrap locks that exact release;
dependency changes use npm and the existing shrinkwrap workflow (`npm run finalize-package`).
The beta still depends on `@pptb/validate@1.0.4`, which warns that `workers` is
unrecognized. That validator result is not worker-declaration validation; the
current desktop worker validator remains authoritative.

From this `html-sample` directory:

```sh
npm install
npm test
npm run pack:worker
```

The pack command writes `PPTB.Sample.Query.Worker.0.1.6.nupkg` to `dotnet/feed/`.
The exact declaration is `PPTB.Sample.Query.Worker@0.1.6`, command
`pptb-sample-query-worker`, targeting `net10.0`. Inspect the `.nupkg`: it must
contain `Worker.dll`, managed dependencies, runtime/dependency manifests and
`DotnetToolSettings.xml`. Changing package bytes requires a fresh
worker version and a matching `packageVersion` update in `pptb.config.json`. Do
not overwrite a version with new bytes. `platforms: ["all"]` is the PPTB support
matrix, not qualification evidence.

### Load Local Tool

From the desktop-app repo in PowerShell, point to this repo's generated feed in
the main-process environment:

```powershell
$env:PPTB_DOTNET_LOCAL_NUGET_FEED = (Resolve-Path "../sample-tools/new/html-sample/dotnet/feed").Path
pnpm run dev
```

On macOS/Linux shells:

```sh
PPTB_DOTNET_LOCAL_NUGET_FEED="$(cd ../sample-tools/new/html-sample/dotnet/feed && pwd -P)" pnpm run dev
```

First run `npm run pack:worker` in `html-sample`. The feed must already exist
and be a flat directory containing only regular files, with no symlink path
components, subdirectories, symlink files or hard-linked files. On other OSes,
choose an absolute canonical directory satisfying the same rules. Set the
environment variable before launching PPTB; restart the development app after
changing it. The previously packed package is accessible at the canonical path
without moving or repacking it.

The feed requires both the Vite development bundle's main-only
`PPTB_DEVELOPER_BUILD=1` marker and an unpackaged app. Production-mode unpackaged
and packaged builds reject it. Never add the feed to the tool manifest or
renderer. Registry, marketplace and npm-debug installs remain nuget.org-only;
only the exact local worker package ID is mapped to this feed, and dependencies
remain on nuget.org. Source path/package digest changes require fresh consent.

1. Use **Load Local Tool** to load `sample-tools/new/html-sample` and select an
   authenticated primary Dataverse connection.
2. Start worker, review native-code consent, and wait for Worker ready.
3. Select **Summarize Accounts by Country (Top 10)**. TypeScript sends
   `accounts/summarizeByCountry({ top: 10 })`; C# calls the registered
   `dataverse/getAccounts({ top: 10 })` callback. TypeScript builds the bounded
   FetchXML and returns only account names and country values; C# groups those
   rows and returns `{ totalAccounts, countries: [{ country, count }] }`.
4. Cancel a pending query, then stop explicitly. Cancellation is cooperative;
   the existing Dataverse API does not abort an in-flight HTTP request. No request
   is automatically replayed. A failed stop disables start/query until cleanup
   is verified; Stop worker remains available to retry.
5. Also check consent denial/revocation, tool close and app quit.

### Verification Boundaries

`npm test` builds the browser bundle and runs simulated worker transport tests;
it does not launch C#. There were no pre-existing automated sample test scripts;
the interactive security suites remain available in the UI.

For an opt-in **real packaged C# stdio** test, extract the `.nupkg` into a temporary
directory, then run from `new/html-sample` with absolute paths:

```sh
node tests/dotnetWorker.smoke.mjs /usr/local/share/dotnet/dotnet \
  /absolute/path/to/extracted/tools/net10.0/any/Worker.dll
```

This launches native code explicitly with a minimal credential-free environment.
It checks initialize, account summary, reverse callbacks with fixture data, progress,
cancellation and EOF exit. It does **not** test live Dataverse, local-feed restore,
PPTB consent/broker, or other OS/architecture targets. The full Load Local Tool
smoke remains a separate manual gate; do not infer PR7 completion from either
simulated transport tests or this real-stdio fixture.

## Security Testing Guidance

Use the built-in **Run Security Probe** button in the Terminal section to validate terminal exposure with safe commands only.

What it checks:

- Terminal can be created and receives command output
- Basic command execution works
- Command chaining is possible (risk signal if unrestricted)

What it does not do:

- No destructive commands
- No credential, SSH, or private file access attempts
- No process memory dumping attempts

If the probe succeeds, treat that as a signal to enforce stricter host-side controls in Power Platform Tool Box:

- Command allow-listing
- Path allow-listing for filesystem APIs
- Auditing/logging for terminal command execution

This sample now includes policy guards in [src/security/policy.ts](src/security/policy.ts):

- `getBlockedCommandReason(...)` / `getBlockedPathReason(...)`: policy decisions
- `executeCommandWithPolicyGuard(...)` / `readTextWithPolicyGuard(...)`: central enforcement wrappers

Security suites and report formatting live in:

- [src/security/suites.ts](src/security/suites.ts)
- [src/security/reporting.ts](src/security/reporting.ts)

It also includes **API-specific Security Suite** buttons plus an **All Suites** runner. Each suite emits a JSON report with per-test `severity` and a rolled-up `highestSeverity`:

- **Terminal suite:** command allow-list enforcement, multiline/control-character blocking, overlong command blocking, local-data-to-network exfil pattern blocking, burst handling
- **FileSystem suite:** absolute-path enforcement, traversal blocking, sensitive path blocking, guarded read rejection checks, API surface checks
- **Events suite:** event API presence and malformed payload resilience checks
- **Settings suite:** API surface checks, set/get roundtrip checks, optional setAll/getAll validation
- **Dataverse suite:** method surface checks and read-only runtime checks (WhoAmI/query) when connected

For production PPTB host hardening, apply equivalent checks in the host process (server-side / main-process boundary), not only in tool UI code.

## API Usage Examples

### Advanced Utilities

Below demonstrates using `executeParallel` to run multiple Dataverse operations concurrently, and wrapping work with `showLoading` / `hideLoading`:

```typescript
// Execute multiple operations in parallel
const [account, contact, opportunities] = await toolboxAPI.utils.executeParallel(
    dataverseAPI.retrieve("account", accountId, ["name"]),
    dataverseAPI.retrieve("contact", contactId, ["fullname"]),
    dataverseAPI.fetchXmlQuery(opportunityFetchXml),
);
console.log("All data fetched:", account, contact, opportunities);

// Show loading screen during operations
await toolboxAPI.utils.showLoading("Processing data...");
try {
    // Perform operations
    await processData();
} finally {
    // Always hide loading
    await toolboxAPI.utils.hideLoading();
}
```

In this HTML sample, the "Run Parallel Demo" button issues three light FetchXML queries simultaneously using `toolbox.utils.executeParallel`, and the "Run Loading Demo" button shows a loading overlay while either performing a quick query (if connected) or simulating work.

### Tool Settings Storage

Use the tool settings API to persist user preferences and configuration for your tool. This storage is scoped per tool.

```typescript
// Save a setting
await toolboxAPI.settings.set("demo.fetchxml", myFetchXmlString);

// Read a setting
const saved = await toolboxAPI.settings.get("demo.fetchxml");

// Delete a setting
await toolboxAPI.settings.delete("demo.fetchxml");
```

In this sample, the “Tool Settings” section lets you save a FetchXML snippet. The “Query Top 10 Accounts” button will use the saved FetchXML if present, otherwise it falls back to the default.

### ToolBox API

```typescript
// Show notification
await toolbox.utils.showNotification({
    title: "Success",
    body: "Operation completed",
    type: "success",
    duration: 3000,
});

// Get active connection
const connection = await toolbox.connections.getActiveConnection();

// Create terminal
const terminal = await toolbox.terminal.create({
    name: "My Terminal",
});

// Subscribe to events
toolbox.events.on((event, payload) => {
    console.log("Event:", payload.event, payload.data);
});
```

### Dataverse API

```typescript
// Query with FetchXML
const result = await dataverse.fetchXmlQuery(`
    <fetch top="10">
        <entity name="account">
            <attribute name="name" />
        </entity>
    </fetch>
`);

// Query with FetchXML targeting the secondary connection
const secondaryResult = await dataverse.fetchXmlQuery(
    `
    <fetch top="5">
        <entity name="account">
            <attribute name="name" />
            <order attribute="name" />
        </entity>
    </fetch>
`,
    "secondary",
);

// Create record
const account = await dataverse.create("account", {
    name: "Contoso Ltd",
    emailaddress1: "info@contoso.com",
});

// Update record
await dataverse.update("account", accountId, {
    telephone1: "555-0100",
});

// Delete record
await dataverse.delete("account", accountId);

// Get metadata
const metadata = await dataverse.getEntityMetadata("account");

// Get metadata on secondary
const metadataSecondary = await dataverse.getEntityMetadata("account", true, ["LogicalName"], "secondary");
```

## Troubleshooting

### Build Errors

If you encounter TypeScript errors:

1. Ensure `@pptb/types` is installed: `npm install`
2. Check TypeScript version: `tsc --version` (should be 5.x)
3. Clean and rebuild: `rm -rf dist && npm run build`

### API Not Available

If `toolboxAPI` or `dataverseAPI` is undefined:

- The tool must be loaded within Power Platform Tool Box
- These APIs are injected by the toolboxAPIBridge
- They are not available in a standalone browser

### Connection Issues

If connection is null:

- Open Power Platform Tool Box
- Create a connection to a Dataverse environment
- The tool will automatically detect the connection

## Resources

- [Tool Development Guide](../../docs/TOOL_DEVELOPMENT.md)
- [API Reference](../../packages/README.md)
- [Power Platform Tool Box Repository](https://github.com/PowerPlatformToolBox/desktop-app)

## License

GPL-3.0 - See LICENSE file in repository root
