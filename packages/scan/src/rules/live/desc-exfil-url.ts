import type { LiveRule } from "../../types.js";

const URL_RE = /https?:\/\/[^\s"'<>]+/gi;

function collectDefaults(schema: unknown, out: string[] = []): string[] {
  if (!schema || typeof schema !== "object") return out;
  const obj = schema as Record<string, unknown>;
  if (typeof obj.default === "string") out.push(obj.default);
  if (obj.properties && typeof obj.properties === "object") {
    for (const v of Object.values(obj.properties as Record<string, unknown>)) {
      collectDefaults(v, out);
    }
  }
  if (Array.isArray(obj.anyOf)) for (const v of obj.anyOf) collectDefaults(v, out);
  if (Array.isArray(obj.oneOf)) for (const v of obj.oneOf) collectDefaults(v, out);
  return out;
}

export const descExfilUrl: LiveRule = {
  id: "desc-exfil-url",
  severity: "high",
  check(server) {
    const findings = [];
    for (const tool of server.tools) {
      const texts = [tool.description ?? "", ...collectDefaults(tool.inputSchema)];
      for (const text of texts) {
        const urls = text.match(URL_RE);
        if (!urls || urls.length === 0) continue;
        // documentation links to known docs hosts are still flagged per SPEC (URLs in descriptions)
        findings.push({
          rule: "desc-exfil-url",
          severity: "high" as const,
          server: server.name,
          tool: tool.name,
          message: `URL(s) in tool description or schema defaults: ${urls.slice(0, 3).join(", ")}`,
          evidence: urls[0],
        });
        break;
      }
    }
    return findings;
  },
};
