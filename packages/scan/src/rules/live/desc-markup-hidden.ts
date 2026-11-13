import type { LiveRule } from "../../types.js";

const HTML_COMMENT = /<!--[\s\S]*?-->/;
const IMPORTANT_TAG = /<\/?(important|system|hidden|secret|instructions?)\b[^>]*>/i;
const LARGE_B64 = /(?:[A-Za-z0-9+/]{80,}={0,2})/;

export const descMarkupHidden: LiveRule = {
  id: "desc-markup-hidden",
  severity: "medium",
  check(server) {
    const findings = [];
    for (const tool of server.tools) {
      const desc = tool.description ?? "";
      const hits: string[] = [];
      if (HTML_COMMENT.test(desc)) hits.push("HTML comment");
      if (IMPORTANT_TAG.test(desc)) hits.push("hidden markup tag");
      if (LARGE_B64.test(desc)) hits.push("large base64 blob");
      if (hits.length === 0) continue;
      findings.push({
        rule: "desc-markup-hidden",
        severity: "medium" as const,
        server: server.name,
        tool: tool.name,
        message: `Suspicious markup in description: ${hits.join(", ")}`,
        evidence: desc.slice(0, 120),
      });
    }
    return findings;
  },
};
