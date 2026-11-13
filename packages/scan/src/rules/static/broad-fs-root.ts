import { homedir } from "node:os";
import type { StaticRule } from "../../types.js";

const FS_HINTS =
  /filesystem|server-filesystem|@modelcontextprotocol\/server-filesystem|mcp-server-fs\b/i;

export function isBroadFsRoot(arg: string, home = homedir()): boolean {
  const trimmed = arg.trim();
  if (trimmed === "/" || trimmed === "~" || trimmed === "${home}" || trimmed === "$HOME") {
    return true;
  }
  if (trimmed === home || trimmed === home + "/" || trimmed === home + "\\") return true;
  // bare home expansions in configs
  if (/^~[/\\]?$/.test(trimmed)) return true;
  return false;
}

export const broadFsRoot: StaticRule = {
  id: "broad-fs-root",
  severity: "medium",
  check(server) {
    const hay = [server.name, server.command ?? "", ...(server.args ?? [])].join(" ");
    if (!FS_HINTS.test(hay) && !/filesystem/i.test(server.name)) {
      // still check if any arg is clearly a root for known fs servers by package
      const pkg = (server.args ?? []).find((a) => /filesystem/i.test(a));
      if (!pkg && !/filesystem/i.test(server.command ?? "")) return [];
    }
    const findings = [];
    for (const arg of server.args ?? []) {
      if (!isBroadFsRoot(arg)) continue;
      findings.push({
        rule: "broad-fs-root",
        severity: "medium" as const,
        server: server.name,
        message: `Filesystem server rooted at broad path: ${arg}`,
        evidence: arg,
        source: server.source,
      });
    }
    return findings;
  },
};
