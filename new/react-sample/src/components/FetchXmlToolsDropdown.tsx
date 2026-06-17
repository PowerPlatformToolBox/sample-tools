import React, { useCallback, useEffect, useMemo, useState } from "react";

interface FetchXmlToolsDropdownProps {
  onLog: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}

type ToolOption = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  raw: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeToolOption(raw: unknown, index: number): ToolOption {
  const candidate = (raw ?? {}) as Record<string, unknown>;

  const fallbackId = `tool-${index + 1}`;
  const id =
    asString(candidate.toolId) ||
    asString(candidate.id) ||
    asString(candidate.packageName) ||
    asString(candidate.name) ||
    fallbackId;

  const name =
    asString(candidate.displayName) ||
    asString(candidate.title) ||
    asString(candidate.name) ||
    asString(candidate.toolName) ||
    id;

  const description = asString(candidate.description) || asString(candidate.summary);

  const invocation = (candidate.invocation ?? {}) as Record<string, unknown>;
  const capabilities = asStringArray(invocation.capabilities);

  return {
    id,
    name,
    description,
    capabilities,
    raw,
  };
}

export const FetchXmlToolsDropdown: React.FC<FetchXmlToolsDropdownProps> = ({ onLog }) => {
  const [tools, setTools] = useState<ToolOption[]>([]);
  const [selectedToolId, setSelectedToolId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const discoveredTools = await window.toolboxAPI.invocation.findToolsByCapability("fetchxml");
      console.log("Discovered tools with fetchxml capability:", discoveredTools);
      const normalized = discoveredTools.map((tool, index) => normalizeToolOption(tool, index));

      const uniqueTools = Array.from(new Map(normalized.map((tool) => [tool.id, tool])).values());
      setTools(uniqueTools);

      if (uniqueTools.length > 0) {
        setSelectedToolId((prev) => prev || uniqueTools[0].id);
        onLog(`Found ${uniqueTools.length} installed tool(s) with fetchxml capability`, "success");
      } else {
        setSelectedToolId("");
        onLog("No installed tools were found with fetchxml capability", "warning");
      }
    } catch (err) {
      const message = (err as Error).message || "Unknown error while loading tools";
      setError(message);
      setTools([]);
      setSelectedToolId("");
      onLog(`Failed to load fetchxml-capable tools: ${message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [onLog]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.id === selectedToolId) ?? null,
    [selectedToolId, tools],
  );

  return (
    <div className="card">
      <h2>🔎 FetchXML-Capable Installed Tools</h2>

      <div className="example-group">
        <div className="button-group">
          <button className="btn btn-primary" onClick={() => void loadTools()} disabled={isLoading}>
            {isLoading ? "Loading..." : "Refresh Tool List"}
          </button>
        </div>

        <div className="input-group">
          <label htmlFor="fetchxml-tools-dropdown">Installed tools with "fetchxml" capability</label>
          <select
            id="fetchxml-tools-dropdown"
            className="select-input"
            value={selectedToolId}
            onChange={(event) => setSelectedToolId(event.target.value)}
            disabled={isLoading || tools.length === 0}
          >
            {tools.length === 0 ? (
              <option value="">No matching tools found</option>
            ) : (
              tools.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.name}
                </option>
              ))
            )}
          </select>
        </div>

        {error ? <div className="info-box error">{error}</div> : null}

        {!error && selectedTool ? (
          <div className="info-box">
            <div>
              <strong>Selected Tool:</strong> {selectedTool.name}
            </div>
            <div>
              <strong>Tool ID:</strong> {selectedTool.id}
            </div>
            <div>
              <strong>Capabilities:</strong> {selectedTool.capabilities.join(", ") || "fetchxml"}
            </div>
            {selectedTool.description ? (
              <div>
                <strong>Description:</strong> {selectedTool.description}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
