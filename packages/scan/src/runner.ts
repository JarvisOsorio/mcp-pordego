import { applyBaseline, loadBaseline } from "./baseline.js";
import {
  discoverConfigs,
  loadExplicitConfig,
  serverFromCommandLine,
} from "./discover.js";
import { inspectServerLive } from "./live.js";
import { formatJson } from "./report/json.js";
import { formatSarif } from "./report/sarif.js";
import { formatText } from "./report/text.js";
import { LIVE_RULES } from "./rules/live/index.js";
import { STATIC_RULES } from "./rules/static/index.js";
import type {
  FailOn,
  Finding,
  McpServerConfig,
  OutputFormat,
  ServerLiveInfo,
  Severity,
} from "./types.js";
import { SEVERITY_RANK } from "./types.js";

export interface ScanOptions {
  configPaths?: string[];
  serverCommand?: string;
  live?: boolean;
  format?: OutputFormat;
  failOn?: FailOn;
  baselinePath?: string;
  color?: boolean;
  /** When true, skip auto-discovery and only use explicit configs/server. */
  noDiscover?: boolean;
}

export interface ScanResult {
  findings: Finding[];
  servers: McpServerConfig[];
  liveServers: ServerLiveInfo[];
  exitCode: number;
  report: string;
}

function collectServers(opts: ScanOptions): McpServerConfig[] {
  const servers: McpServerConfig[] = [];

  if (opts.serverCommand) {
    servers.push(serverFromCommandLine(opts.serverCommand));
  }

  if (opts.configPaths && opts.configPaths.length > 0) {
    for (const p of opts.configPaths) {
      const parsed = loadExplicitConfig(p, "explicit");
      servers.push(...parsed.servers);
    }
  } else if (!opts.noDiscover && !opts.serverCommand) {
    for (const cfg of discoverConfigs()) {
      servers.push(...cfg.servers);
    }
  } else if (!opts.noDiscover && opts.configPaths === undefined && opts.serverCommand) {
    // still discover unless noDiscover — but prefer not to mix; only CLI server
  }

  // Dedup by name+source
  const seen = new Set<string>();
  return servers.filter((s) => {
    const k = `${s.source}::${s.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function runStaticRules(servers: McpServerConfig[]): Finding[] {
  const findings: Finding[] = [];
  for (const server of servers) {
    for (const rule of STATIC_RULES) {
      findings.push(...rule.check(server));
    }
  }
  return findings;
}

export function runLiveRules(liveServers: ServerLiveInfo[]): Finding[] {
  const findings: Finding[] = [];
  for (const server of liveServers) {
    for (const rule of LIVE_RULES) {
      findings.push(...rule.check(server, liveServers));
    }
  }
  return findings;
}

export function shouldFail(findings: Finding[], failOn: Severity): boolean {
  const threshold = SEVERITY_RANK[failOn];
  return findings.some((f) => SEVERITY_RANK[f.severity] >= threshold);
}

export function renderReport(
  findings: Finding[],
  format: OutputFormat,
  color: boolean,
): string {
  if (format === "json") return formatJson(findings);
  if (format === "sarif") return formatSarif(findings);
  return formatText(findings, { color });
}

export async function runScan(opts: ScanOptions = {}): Promise<ScanResult> {
  const format = opts.format ?? "text";
  const failOn = opts.failOn ?? "high";
  const color = opts.color ?? (process.stdout.isTTY && !process.env.NO_COLOR);

  const servers = collectServers(opts);
  let findings = runStaticRules(servers);

  const liveServers: ServerLiveInfo[] = [];
  if (opts.live) {
    for (const server of servers) {
      try {
        const info = await inspectServerLive(server);
        liveServers.push(info);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[mcp-pordego] live inspect failed for "${server.name}": ${msg}\n`,
        );
        liveServers.push({ name: server.name, tools: [] });
      }
    }
    findings = findings.concat(runLiveRules(liveServers));
  }

  if (opts.baselinePath) {
    const baseline = loadBaseline(opts.baselinePath);
    findings = applyBaseline(findings, baseline);
  }

  // Stable order: severity desc, then rule, server, tool
  findings.sort((a, b) => {
    const sr = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sr !== 0) return sr;
    return (
      a.rule.localeCompare(b.rule) ||
      a.server.localeCompare(b.server) ||
      (a.tool ?? "").localeCompare(b.tool ?? "")
    );
  });

  const report = renderReport(findings, format, color);
  const exitCode = shouldFail(findings, failOn) ? 1 : 0;
  return { findings, servers, liveServers, exitCode, report };
}
