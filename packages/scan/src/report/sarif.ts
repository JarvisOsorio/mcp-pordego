import type { Finding, Severity } from "../types.js";

function level(s: Severity): "error" | "warning" | "note" {
  if (s === "high") return "error";
  if (s === "medium") return "warning";
  return "note";
}

/** SARIF 2.1.0 suitable for GitHub code scanning. */
export function formatSarif(findings: Finding[]): string {
  const rulesMap = new Map<string, { id: string; severity: Severity }>();
  for (const f of findings) {
    if (!rulesMap.has(f.rule)) rulesMap.set(f.rule, { id: f.rule, severity: f.severity });
  }

  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "mcp-pordego",
            informationUri: "https://github.com/JarvisOsorio/mcp-pordego",
            rules: [...rulesMap.values()].map((r) => ({
              id: r.id,
              shortDescription: { text: r.id },
              defaultConfiguration: { level: level(r.severity) },
              properties: { "security-severity": r.severity },
            })),
          },
        },
        results: findings.map((f) => ({
          ruleId: f.rule,
          level: level(f.severity),
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: f.source ?? `mcp://${f.server}`,
                },
                ...(f.tool
                  ? {
                      region: {
                        message: { text: `tool: ${f.tool}` },
                      },
                    }
                  : {}),
              },
            },
          ],
          properties: {
            server: f.server,
            ...(f.tool ? { tool: f.tool } : {}),
            ...(f.evidence ? { evidence: f.evidence } : {}),
          },
        })),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2) + "\n";
}
