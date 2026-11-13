import type { Finding, Severity } from "../types.js";

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function severityColor(s: Severity, color: boolean): string {
  if (!color) return s.toUpperCase();
  const c =
    s === "high" ? COLORS.red : s === "medium" ? COLORS.yellow : COLORS.cyan;
  return `${c}${s.toUpperCase()}${COLORS.reset}`;
}

export function formatText(findings: Finding[], opts: { color?: boolean } = {}): string {
  const color = opts.color ?? true;
  if (findings.length === 0) {
    return color
      ? `${COLORS.bold}No findings.${COLORS.reset}\n`
      : "No findings.\n";
  }

  const byServer = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byServer.get(f.server) ?? [];
    list.push(f);
    byServer.set(f.server, list);
  }

  const lines: string[] = [];
  for (const [server, list] of [...byServer.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push(
      color
        ? `${COLORS.bold}▸ ${server}${COLORS.reset} ${COLORS.dim}(${list.length})${COLORS.reset}`
        : `▸ ${server} (${list.length})`,
    );
    for (const f of list) {
      const tool = f.tool ? ` ${f.tool}` : "";
      const src = f.source ? (color ? ` ${COLORS.gray}${f.source}${COLORS.reset}` : ` ${f.source}`) : "";
      lines.push(
        `  [${severityColor(f.severity, color)}] ${f.rule}${tool}`,
      );
      lines.push(`    ${f.message}${src}`);
      if (f.evidence) {
        lines.push(
          color
            ? `    ${COLORS.dim}evidence: ${f.evidence}${COLORS.reset}`
            : `    evidence: ${f.evidence}`,
        );
      }
    }
    lines.push("");
  }

  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;
  lines.push(
    `Summary: ${findings.length} finding(s) — high=${counts.high} medium=${counts.medium} low=${counts.low}`,
  );
  return lines.join("\n") + "\n";
}
