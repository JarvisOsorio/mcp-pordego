import type { Finding } from "../types.js";

export function formatJson(findings: Finding[]): string {
  return JSON.stringify({ version: 1, findings }, null, 2) + "\n";
}
