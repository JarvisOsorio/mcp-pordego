import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import type { DiscoveredConfig, McpServerConfig } from "./types.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function parseServerEntry(
  name: string,
  raw: unknown,
  source: string,
  client: string,
): McpServerConfig | undefined {
  const obj = asRecord(raw);
  if (!obj) return undefined;

  // VS Code / some clients nest under "server"
  const nested = asRecord(obj.server) ?? obj;

  const command = typeof nested.command === "string" ? nested.command : undefined;
  const url = typeof nested.url === "string" ? nested.url : undefined;
  if (!command && !url) return undefined;

  const args = Array.isArray(nested.args)
    ? nested.args.filter((a): a is string => typeof a === "string")
    : undefined;

  const envRaw = asRecord(nested.env);
  const env =
    envRaw &&
    Object.fromEntries(
      Object.entries(envRaw).filter((e): e is [string, string] => typeof e[1] === "string"),
    );

  const headersRaw = asRecord(nested.headers);
  const headers =
    headersRaw &&
    Object.fromEntries(
      Object.entries(headersRaw).filter((e): e is [string, string] => typeof e[1] === "string"),
    );

  const cwd = typeof nested.cwd === "string" ? nested.cwd : undefined;

  return {
    name,
    ...(command !== undefined ? { command } : {}),
    ...(args !== undefined ? { args } : {}),
    ...(env !== undefined ? { env } : {}),
    ...(cwd !== undefined ? { cwd } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(headers !== undefined ? { headers } : {}),
    source,
    client,
  };
}

function extractServers(
  data: unknown,
  source: string,
  client: string,
): McpServerConfig[] {
  const root = asRecord(data);
  if (!root) return [];

  // Claude Desktop / Cursor classic: { mcpServers: { name: {...} } }
  // Claude Code / project: { mcpServers: ... } or top-level servers
  // VS Code: { servers: { name: {...} } }
  const map =
    asRecord(root.mcpServers) ??
    asRecord(root.servers) ??
    (Object.keys(root).every((k) => asRecord(root[k]))
      ? root
      : undefined);

  if (!map) return [];

  const out: McpServerConfig[] = [];
  for (const [name, entry] of Object.entries(map)) {
    // Skip non-server keys when we fell back to root
    if (name === "mcpServers" || name === "servers" || name === "version") continue;
    const parsed = parseServerEntry(name, entry, source, client);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function parseConfigFile(
  path: string,
  client: string,
): DiscoveredConfig | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const data = readJson(path);
    const servers = extractServers(data, path, client);
    return { path, client, servers };
  } catch {
    return undefined;
  }
}

/**
 * Load an explicit `--config` path. Throws on missing file, invalid JSON, or
 * zero parseable servers so the CLI can exit 2 (config error) instead of
 * silently reporting a clean scan.
 */
export function loadExplicitConfig(path: string, client = "explicit"): DiscoveredConfig {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    throw new Error(`Config file not found: ${path}`);
  }
  let data: unknown;
  try {
    data = readJson(abs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in config file ${path}: ${msg}`);
  }
  const servers = extractServers(data, abs, client);
  if (servers.length === 0) {
    throw new Error(
      `No MCP servers found in config file ${path} (expected mcpServers or servers map)`,
    );
  }
  return { path: abs, client, servers };
}

function candidatePaths(): Array<{ path: string; client: string }> {
  const home = homedir();
  const cwd = process.cwd();
  const plat = platform();
  const out: Array<{ path: string; client: string }> = [];

  // Project-local
  out.push(
    { path: join(cwd, ".mcp.json"), client: "claude-code" },
    { path: join(cwd, ".cursor", "mcp.json"), client: "cursor" },
    { path: join(cwd, ".vscode", "mcp.json"), client: "vscode" },
  );

  // User-level
  out.push(
    { path: join(home, ".claude.json"), client: "claude-code" },
    { path: join(home, ".cursor", "mcp.json"), client: "cursor" },
  );

  if (plat === "darwin") {
    out.push({
      path: join(
        home,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      ),
      client: "claude-desktop",
    });
  } else if (plat === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    out.push({
      path: join(appData, "Claude", "claude_desktop_config.json"),
      client: "claude-desktop",
    });
  } else {
    // Linux Claude Desktop (common electron path)
    out.push({
      path: join(home, ".config", "Claude", "claude_desktop_config.json"),
      client: "claude-desktop",
    });
  }

  return out;
}

/** Discover MCP configs from known client locations. Read-only. */
export function discoverConfigs(extraPaths: string[] = []): DiscoveredConfig[] {
  const seen = new Set<string>();
  const results: DiscoveredConfig[] = [];

  const candidates = [
    ...extraPaths.map((p) => ({ path: resolve(p), client: "explicit" as const })),
    ...candidatePaths(),
  ];

  for (const c of candidates) {
    const abs = resolve(c.path);
    if (seen.has(abs)) continue;
    seen.add(abs);
    const parsed = parseConfigFile(abs, c.client);
    if (parsed && parsed.servers.length > 0) results.push(parsed);
  }

  return results;
}

/** Build a synthetic server entry from `--server "<command>"`. */
export function serverFromCommandLine(
  commandLine: string,
  source = "<cli>",
): McpServerConfig {
  const parts = commandLine.trim().split(/\s+/);
  const command = parts[0] ?? "unknown";
  const args = parts.slice(1);
  return {
    name: "cli-server",
    command,
    args,
    source,
    client: "cli",
  };
}
