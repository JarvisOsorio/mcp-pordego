export type Severity = "high" | "medium" | "low";

export const SEVERITY_RANK: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export interface McpServerConfig {
  /** Logical name from the config map key. */
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  /** Source config file path. */
  source: string;
  /** Client that owned this entry (claude-desktop, cursor, …). */
  client: string;
}

export interface DiscoveredConfig {
  path: string;
  client: string;
  servers: McpServerConfig[];
}

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    title?: string;
    [k: string]: unknown;
  };
}

export interface ServerLiveInfo {
  name: string;
  serverInfo?: { name?: string; version?: string };
  tools: ToolInfo[];
}

export interface Finding {
  rule: string;
  severity: Severity;
  server: string;
  tool?: string;
  message: string;
  evidence?: string;
  source?: string;
}

export interface StaticRule {
  id: string;
  severity: Severity;
  check(server: McpServerConfig): Finding[];
}

export interface LiveRule {
  id: string;
  severity: Severity;
  check(server: ServerLiveInfo, allServers: ServerLiveInfo[]): Finding[];
}

export interface BaselineEntry {
  rule: string;
  server: string;
  tool?: string;
}

export type OutputFormat = "text" | "json" | "sarif";
export type FailOn = Severity;
