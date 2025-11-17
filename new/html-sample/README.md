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

- ✅ **Dataverse API Usage**
  - FetchXML queries
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
├── src/
│   └── app.ts           # Main application logic (TypeScript)
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

**Terminal:**
- Create isolated terminal instances
- Execute shell commands
- View command output
- Close terminal when done

#### Dataverse API Examples

**Query Records:**
- FetchXML query to retrieve top 10 accounts
- Display results with formatting
- If a FetchXML is saved in Tool Settings, the Query button will use that instead of the default

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

## API Usage Examples

### Advanced Utilities

Below demonstrates using `executeParallel` to run multiple Dataverse operations concurrently, and wrapping work with `showLoading` / `hideLoading`:

```typescript
// Execute multiple operations in parallel
const [account, contact, opportunities] = await toolboxAPI.utils.executeParallel(
    dataverseAPI.retrieve('account', accountId, ['name']),
    dataverseAPI.retrieve('contact', contactId, ['fullname']),
    dataverseAPI.fetchXmlQuery(opportunityFetchXml)
);
console.log('All data fetched:', account, contact, opportunities);

// Show loading screen during operations
await toolboxAPI.utils.showLoading('Processing data...');
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
await toolboxAPI.settings.set('demo.fetchxml', myFetchXmlString);

// Read a setting
const saved = await toolboxAPI.settings.get('demo.fetchxml');

// Delete a setting
await toolboxAPI.settings.delete('demo.fetchxml');
```

In this sample, the “Tool Settings” section lets you save a FetchXML snippet. The “Query Top 10 Accounts” button will use the saved FetchXML if present, otherwise it falls back to the default.

### ToolBox API

```typescript
// Show notification
await toolbox.utils.showNotification({
    title: 'Success',
    body: 'Operation completed',
    type: 'success',
    duration: 3000
});

// Get active connection
const connection = await toolbox.connections.getActiveConnection();

// Create terminal
const terminal = await toolbox.terminal.create({
    name: 'My Terminal'
});

// Subscribe to events
toolbox.events.on((event, payload) => {
    console.log('Event:', payload.event, payload.data);
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

// Create record
const account = await dataverse.create('account', {
    name: 'Contoso Ltd',
    emailaddress1: 'info@contoso.com'
});

// Update record
await dataverse.update('account', accountId, {
    telephone1: '555-0100'
});

// Delete record
await dataverse.delete('account', accountId);

// Get metadata
const metadata = await dataverse.getEntityMetadata('account');
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
