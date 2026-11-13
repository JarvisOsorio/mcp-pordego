import type { LiveRule } from "../../types.js";

export const descCrossToolRef: LiveRule = {
  id: "desc-cross-tool-ref",
  severity: "medium",
  check(server) {
    const findings = [];
    const names = server.tools.map((t) => t.name);
    for (const tool of server.tools) {
      const desc = tool.description ?? "";
      if (!desc) continue;
      for (const other of names) {
        if (other === tool.name) continue;
        // require a verb-ish instruction involving the other tool
        const re = new RegExp(
          `(?:use|call|invoke|run|first|before|after|instead)\s+[\s\S]{0,40}\b${escapeRe(other)}\b|\b${escapeRe(other)}\b[\s\S]{0,40}(?:instead|first|before)`,
          "i",
        );
        if (!re.test(desc)) continue;
        findings.push({
          rule: "desc-cross-tool-ref",
          severity: "medium" as const,
          server: server.name,
          tool: tool.name,
          message: `Description of ${tool.name} instructs behavior involving ${other}`,
          evidence: other,
        });
        break;
      }
    }
    return findings;
  },
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
