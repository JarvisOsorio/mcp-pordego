import type { LiveRule } from "../../types.js";

/** Zero-width, bidi overrides, Unicode tag block. */
const HIDDEN =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u{E0000}-\u{E007F}]/u;

export function hasHiddenChars(text: string): boolean {
  return HIDDEN.test(text);
}

export const descHiddenChars: LiveRule = {
  id: "desc-hidden-chars",
  severity: "high",
  check(server) {
    const findings = [];
    for (const tool of server.tools) {
      const parts = [
        tool.name,
        tool.description ?? "",
        JSON.stringify(tool.inputSchema ?? {}),
      ];
      for (const part of parts) {
        if (!hasHiddenChars(part)) continue;
        findings.push({
          rule: "desc-hidden-chars",
          severity: "high" as const,
          server: server.name,
          tool: tool.name,
          message:
            "Hidden/zero-width/bidi/tag characters in tool name, description, or schema",
        });
        break;
      }
    }
    return findings;
  },
};
