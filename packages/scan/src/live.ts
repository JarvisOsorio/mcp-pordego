import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig, ServerLiveInfo, ToolInfo } from "./types.js";

const ALLOWED_ENV = new Set(["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TEMP", "TMP"]);

function childEnv(server: McpServerConfig): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ALLOWED_ENV) {
    const v = process.env[key];
    if (v !== undefined) env[key] = v;
  }
  for (const [k, v] of Object.entries(server.env ?? {})) {
    env[k] = v;
  }
  return env;
}

async function listAllTools(client: Client): Promise<ToolInfo[]> {
  const tools: ToolInfo[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.listTools(cursor ? { cursor } : undefined);
    for (const t of res.tools) {
      tools.push({
        name: t.name,
        ...(t.description !== undefined ? { description: t.description } : {}),
        ...(t.inputSchema
          ? { inputSchema: t.inputSchema as Record<string, unknown> }
          : {}),
        ...(t.annotations
          ? { annotations: t.annotations as ToolInfo["annotations"] }
          : {}),
      });
    }
    cursor = res.nextCursor;
  } while (cursor);
  return tools;
}

/**
 * Spawn a stdio MCP server, call initialize + tools/list only (never tools/call).
 * HTTP upstreams are skipped with a stderr note.
 */
export async function inspectServerLive(
  server: McpServerConfig,
  opts: { timeoutMs?: number } = {},
): Promise<ServerLiveInfo> {
  if (server.url) {
    process.stderr.write(
      `[mcp-pordego] skipping live inspect for HTTP server "${server.name}" (stdio only in v0.1)\n`,
    );
    return { name: server.name, tools: [] };
  }
  if (!server.command) {
    return { name: server.name, tools: [] };
  }

  const timeoutMs = opts.timeoutMs ?? 30_000;
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args ?? [],
    env: childEnv(server),
    cwd: server.cwd,
    stderr: "pipe",
  });

  const client = new Client({ name: "mcp-pordego-scan", version: "0.1.0" });

  const run = async (): Promise<ServerLiveInfo> => {
    await client.connect(transport);
    const tools = await listAllTools(client);
    const si = client.getServerVersion();
    return {
      name: server.name,
      ...(si ? { serverInfo: { name: si.name, version: si.version } } : {}),
      tools,
    };
  };

  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`live inspect timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }
}
