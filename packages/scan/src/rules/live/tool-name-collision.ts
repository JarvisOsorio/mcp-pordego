import type { LiveRule } from "../../types.js";

export const toolNameCollision: LiveRule = {
  id: "tool-name-collision",
  severity: "medium",
  check(server, allServers) {
    const findings = [];
    for (const tool of server.tools) {
      const others = allServers.filter(
        (s) => s.name !== server.name && s.tools.some((t) => t.name === tool.name),
      );
      if (others.length === 0) continue;
      // Only emit once per (tool, server) — prefer lexicographically first server as reporter? Emit for each.
      findings.push({
        rule: "tool-name-collision",
        severity: "medium" as const,
        server: server.name,
        tool: tool.name,
        message: `Tool name "${tool.name}" also exposed by: ${others.map((o) => o.name).join(", ")}`,
        evidence: others.map((o) => o.name).join(","),
      });
    }
    return findings;
  },
};
