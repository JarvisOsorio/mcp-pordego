import type { LiveRule } from "../../types.js";

const PHRASES: RegExp[] = [
  /ignore\s+(all\s+)?previous/i,
  /ignore\s+(all\s+)?prior/i,
  /do\s+not\s+tell\s+the\s+user/i,
  /don't\s+tell\s+the\s+user/i,
  /before\s+using\s+this\s+tool,?\s+read/i,
  /send\s+.+\s+to\s+https?:\/\//i,
  /system\s+prompt/i,
  /disregard\s+(your\s+)?instructions/i,
  /you\s+must\s+exfiltrate/i,
];

export const descInjectionPhrases: LiveRule = {
  id: "desc-injection-phrases",
  severity: "high",
  check(server) {
    const findings = [];
    for (const tool of server.tools) {
      const text = [tool.name, tool.description ?? "", JSON.stringify(tool.inputSchema ?? {})].join(
        "\n",
      );
      for (const re of PHRASES) {
        if (!re.test(text)) continue;
        findings.push({
          rule: "desc-injection-phrases",
          severity: "high" as const,
          server: server.name,
          tool: tool.name,
          message: `Suspicious injection phrase in tool description/schema (${re.source})`,
          evidence: (tool.description ?? "").slice(0, 160),
        });
        break;
      }
    }
    return findings;
  },
};
