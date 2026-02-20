import { readTextWithPolicyGuard } from "../security/policy.js";

type NotificationType = "success" | "info" | "warning" | "error";
type LogType = "info" | "success" | "warning" | "error";

export function createFileSystemFeature(deps: {
    toolbox: typeof window.toolboxAPI;
    showNotification: (title: string, body: string, type: NotificationType) => Promise<void>;
    log: (message: string, type?: LogType) => void;
    getCurrentConnection: () => ToolBoxAPI.DataverseConnection | null;
}) {
    async function saveDataToFile() {
        try {
            const conn = deps.getCurrentConnection();
            const data = {
                timestamp: new Date().toISOString(),
                connection: conn
                    ? {
                          name: conn.name,
                          url: conn.url,
                          environment: conn.environment,
                      }
                    : null,
                message: "Export from HTML Sample Tool",
            };

            const filePath = await deps.toolbox.fileSystem.saveFile("sample-export.json", JSON.stringify(data, null, 2));

            if (filePath) {
                await deps.showNotification("File Saved", `File saved to: ${filePath}`, "success");
                deps.log(`File saved to: ${filePath}`, "success");
            } else {
                deps.log("File save cancelled", "info");
            }
        } catch (error) {
            deps.log(`Error saving file: ${(error as Error).message}`, "error");
        }
    }

    async function readText() {
        try {
            const output = document.getElementById("filesystem-output");
            if (output) output.textContent = "Selecting text file...\n";

            const filePath = await deps.toolbox.fileSystem.selectPath({
                type: "file",
                title: "Select a Text File",
                filters: [
                    { name: "Text Files", extensions: ["txt", "json", "xml", "csv", "md"] },
                    { name: "All Files", extensions: ["*"] },
                ],
            });

            if (!filePath) {
                if (output) output.textContent = "File selection cancelled.";
                deps.log("File selection cancelled", "info");
                return;
            }

            if (output) output.textContent = `Reading file: ${filePath}\n\n`;
            const content = await readTextWithPolicyGuard(deps.toolbox, filePath);

            if (output) {
                output.textContent += `File Size: ${content.length} characters\n\n`;
                output.textContent += "Content:\n";
                output.textContent += "─".repeat(50) + "\n";
                output.textContent += content;
            }

            await deps.showNotification("Success", `File read successfully (${content.length} characters)`, "success");
            deps.log(`Read text file: ${filePath} (${content.length} chars)`, "success");
        } catch (error) {
            const output = document.getElementById("filesystem-output");
            if (output) output.textContent = `Error: ${(error as Error).message}`;
            deps.log(`Error reading text file: ${(error as Error).message}`, "error");
        }
    }

    async function readDirectory() {
        try {
            const output = document.getElementById("filesystem-output");
            if (output) output.textContent = "Selecting directory...\n";

            const dirPath = await deps.toolbox.fileSystem.selectPath({
                type: "folder",
                title: "Select a Directory",
            });

            if (!dirPath) {
                if (output) output.textContent = "Directory selection cancelled.";
                deps.log("Directory selection cancelled", "info");
                return;
            }

            if (output) output.textContent = `Reading directory: ${dirPath}\n\n`;
            const entries = await deps.toolbox.fileSystem.readDirectory(dirPath);

            const directories = entries.filter((e) => e.type === "directory");
            const files = entries.filter((e) => e.type === "file");

            if (output) {
                output.textContent += `Found ${entries.length} entries:\n`;
                output.textContent += "─".repeat(50) + "\n";

                if (directories.length > 0) {
                    output.textContent += `\nDirectories (${directories.length}):\n`;
                    directories.forEach((entry) => {
                        output.textContent += `  📁 ${entry.name}\n`;
                    });
                }

                if (files.length > 0) {
                    output.textContent += `\nFiles (${files.length}):\n`;
                    files.forEach((entry) => {
                        output.textContent += `  📄 ${entry.name}\n`;
                    });
                }
            }

            await deps.showNotification("Success", `Directory read successfully (${entries.length} entries)`, "success");
            deps.log(`Read directory: ${dirPath} (${entries.length} entries: ${directories.length} dirs, ${files.length} files)`, "success");
        } catch (error) {
            const output = document.getElementById("filesystem-output");
            if (output) output.textContent = `Error: ${(error as Error).message}`;
            deps.log(`Error reading directory: ${(error as Error).message}`, "error");
        }
    }

    async function createDirectory() {
        try {
            const output = document.getElementById("filesystem-output");
            if (output) output.textContent = "Selecting parent directory...\n";

            const parentPath = await deps.toolbox.fileSystem.selectPath({
                type: "folder",
                title: "Select Parent Directory",
            });

            if (!parentPath) {
                if (output) output.textContent = "Directory selection cancelled.";
                deps.log("Directory selection cancelled", "info");
                return;
            }

            const dirName = prompt("Enter new directory name:", "new-folder");
            if (!dirName || dirName.trim() === "") {
                if (output) output.textContent = "Directory creation cancelled.";
                deps.log("Directory creation cancelled", "info");
                return;
            }

            const newDirPath = `${parentPath}/${dirName.trim()}`;
            if (output) output.textContent = `Creating directory: ${newDirPath}\n`;

            await deps.toolbox.fileSystem.createDirectory(newDirPath);

            if (output) {
                output.textContent += "✓ Directory created successfully!\n";
                output.textContent += `Path: ${newDirPath}`;
            }

            await deps.showNotification("Success", `Directory created: ${newDirPath}`, "success");
            deps.log(`Created directory: ${newDirPath}`, "success");
        } catch (error) {
            const output = document.getElementById("filesystem-output");
            if (output) output.textContent = `Error: ${(error as Error).message}`;
            deps.log(`Error creating directory: ${(error as Error).message}`, "error");
        }
    }

    async function readSystemFile() {
        try {
            const output = document.getElementById("filesystem-output");
            const systemFilePath = "/var/log/system.log";

            if (output) output.textContent = `Attempting to read system file: ${systemFilePath}\n\n`;
            deps.log(`Attempting to read system file: ${systemFilePath}`, "info");

            const content = await readTextWithPolicyGuard(deps.toolbox, systemFilePath);

            if (output) {
                output.textContent += `File Size: ${content.length} characters\n\n`;
                output.textContent += "Content (first 1000 chars):\n";
                output.textContent += "─".repeat(50) + "\n";
                output.textContent += content.substring(0, 1000);
                if (content.length > 1000) {
                    output.textContent += "\n\n... (truncated)";
                }
            }

            await deps.showNotification("Success", `System file read (${content.length} characters)`, "success");
            deps.log(`Successfully read system file: ${systemFilePath}`, "success");
        } catch (error) {
            const output = document.getElementById("filesystem-output");
            const errorMsg = (error as Error).message;
            if (output) {
                output.textContent = `❌ Error Reading System File\n`;
                output.textContent += `Path: /var/log/system.log\n\n`;
                output.textContent += `Error: ${errorMsg}\n\n`;
                output.textContent += "This is expected - system files are typically restricted due to:\n";
                output.textContent += "- File permissions (insufficient access)\n";
                output.textContent += "- Security restrictions\n";
                output.textContent += "- Sandbox limitations";
            }
            deps.log(`Error reading system file: ${errorMsg}`, "error");
            await deps.showNotification("Error Reading System File", errorMsg, "error");
        }
    }

    async function readHardcodedFile() {
        try {
            const output = document.getElementById("filesystem-output");
            if (output) output.textContent = "Opening file selection dialog...\n";
            deps.log("Opening file selection dialog", "info");

            const selectedPath = await deps.toolbox.fileSystem.selectPath({
                type: "file",
                title: "Select a File (will be ignored)",
                filters: [{ name: "All Files", extensions: ["*"] }],
            });

            if (!selectedPath) {
                if (output) output.textContent = "File selection cancelled.";
                deps.log("File selection cancelled", "info");
                return;
            }

            if (output) {
                output.textContent = `User selected: ${selectedPath}\n\n`;
                output.textContent += "But we're ignoring that and attempting to read a hardcoded system path instead...\n\n";
                output.textContent += "─".repeat(50) + "\n\n";
            }

            deps.log(`User selected: ${selectedPath} (will be ignored)`, "info");
            const hardcodedPath = "/etc/passwd";
            if (output) output.textContent += `Attempting to read hardcoded path: ${hardcodedPath}\n\n`;
            deps.log(`Attempting to read hardcoded path: ${hardcodedPath}`, "info");

            const content = await readTextWithPolicyGuard(deps.toolbox, hardcodedPath);

            if (output) {
                output.textContent += `✓ Success! File Size: ${content.length} characters\n\n`;
                output.textContent += "Content:\n";
                output.textContent += "─".repeat(50) + "\n";
                output.textContent += content.substring(0, 1500);
                if (content.length > 1500) {
                    output.textContent += "\n\n... (truncated)";
                }
            }

            await deps.showNotification("File Read Successfully", `Hardcoded file read: ${hardcodedPath} (${content.length} characters)`, "success");
            deps.log(`Successfully read hardcoded file: ${hardcodedPath}`, "success");
        } catch (error) {
            const output = document.getElementById("filesystem-output");
            const errorMsg = (error as Error).message;
            if (output) {
                output.textContent += `❌ Error Reading Hardcoded File\n`;
                output.textContent += `Path: /etc/passwd\n\n`;
                output.textContent += `Error: ${errorMsg}\n\n`;
                output.textContent += "This demonstrates that hardcoded system paths are typically restricted:\n";
                output.textContent += "- Permission denied (macOS sandbox restrictions)\n";
                output.textContent += "- The file picker selected a different path, but we tried to read this one instead\n";
                output.textContent += "- Real-world use case: don't hardcode paths, always use user selection";
            }
            deps.log(`Error reading hardcoded file: ${errorMsg}`, "error");
            await deps.showNotification("Error Reading Hardcoded File", errorMsg, "error");
        }
    }

    async function readDirectFile() {
        try {
            const output = document.getElementById("filesystem-output");
            const hardcodedPath = "/etc/hosts";

            if (output) output.textContent = `Reading hardcoded path directly (no dialog)...\n`;
            if (output) output.textContent += `Path: ${hardcodedPath}\n\n`;

            deps.log(`Attempting direct read of hardcoded path: ${hardcodedPath}`, "info");
            const content = await readTextWithPolicyGuard(deps.toolbox, hardcodedPath);

            if (output) {
                output.textContent += `✓ Success! File Size: ${content.length} characters\n\n`;
                output.textContent += "Content:\n";
                output.textContent += "─".repeat(50) + "\n";
                output.textContent += content;
            }

            await deps.showNotification("File Read Successfully", `Direct file read: ${hardcodedPath} (${content.length} characters)`, "success");
            deps.log(`Successfully read direct file: ${hardcodedPath}`, "success");
        } catch (error) {
            const output = document.getElementById("filesystem-output");
            const errorMsg = (error as Error).message;
            if (output) {
                output.textContent = `❌ Error Reading Hardcoded Path\n`;
                output.textContent += `Path: /etc/hosts\n`;
                output.textContent += `Method: Direct read (no selectPath dialog)\n\n`;
                output.textContent += `Error: ${errorMsg}\n\n`;
                output.textContent += "This demonstrates:\n";
                output.textContent += "- System files are protected even with hardcoded paths\n";
                output.textContent += "- No file picker dialog was used\n";
                output.textContent += "- Security restrictions apply to all file access attempts";
            }
            deps.log(`Error reading direct file: ${errorMsg}`, "error");
            await deps.showNotification("Error Reading Direct File", errorMsg, "error");
        }
    }

    return {
        saveDataToFile,
        readText,
        readDirectory,
        createDirectory,
        readSystemFile,
        readHardcodedFile,
        readDirectFile,
    };
}
