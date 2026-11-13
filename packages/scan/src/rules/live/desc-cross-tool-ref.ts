import type { Finding, LiveRule } from "../../types.js";

export const descCrossToolRef: LiveRule = {
  id: "desc-cross-tool-ref",
  severity: "medium",
  check(server) {
    const findings: Finding[] = [];
    const names = server.tools.map((t) => t.name);
    for (const tool of server.tools) {
      const desc = tool.description ?? "";
      if (!desc) continue;
      for (const other of names) {
        if (other === tool.name) continue;
        if (!mentionsOtherTool(desc, other)) continue;
        findings.push({
          rule: "desc-cross-tool-ref",
          severity: "medium",
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

const VERBS = /\b(?:use|call|invoke|run|first|before|after|instead)\b/i;

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[A-Za-z0-9_]/.test(ch);
}

/**
 * Heuristic: description mentions another tool name (word-bounded) near an instructional verb.
 * Avoids RegExp string escapes that are fragile across JSON-based git pushes.
 */
export function mentionsOtherTool(desc: string, other: string): boolean {
  const lower = desc.toLowerCase();
  const needle = other.toLowerCase();
  let from = 0;
  while (from <= lower.length) {
    const idx = lower.indexOf(needle, from);
    if (idx < 0) return false;
    const beforeOk = !isWordChar(lower[idx - 1]);
    const afterOk = !isWordChar(lower[idx + needle.length]);
    if (beforeOk && afterOk) {
      const window = desc.slice(Math.max(0, idx - 48), idx + other.length + 48);
      if (VERBS.test(window)) return true;
    }
    from = idx + 1;
  }
  return false;
}
