import { runScan, type FailOn, type OutputFormat } from "@mcp-pordego/scan";

export interface ScanCliOptions {
  config?: string[];
  server?: string;
  live?: boolean;
  format?: string;
  failOn?: string;
  baseline?: string;
  color?: boolean;
  noDiscover?: boolean;
}

export async function scanCommand(opts: ScanCliOptions): Promise<number> {
  const format = (opts.format ?? "text") as OutputFormat;
  if (!["text", "json", "sarif"].includes(format)) {
    process.stderr.write(`Invalid --format: ${opts.format}\n`);
    return 2;
  }
  const failOn = (opts.failOn ?? "high") as FailOn;
  if (!["high", "medium", "low"].includes(failOn)) {
    process.stderr.write(`Invalid --fail-on: ${opts.failOn}\n`);
    return 2;
  }

  try {
    const result = await runScan({
      ...(opts.config ? { configPaths: opts.config } : {}),
      ...(opts.server ? { serverCommand: opts.server } : {}),
      live: Boolean(opts.live),
      format,
      failOn,
      ...(opts.baseline ? { baselinePath: opts.baseline } : {}),
      color: opts.color !== false && !process.env.NO_COLOR,
      noDiscover: Boolean(opts.noDiscover),
    });

    process.stdout.write(result.report);

    if (result.servers.length === 0) {
      process.stderr.write(
        "No MCP servers found. Pass --config <path> or --server \"<command>\", or place a config in a known location.\n",
      );
      return result.findings.length === 0 ? 0 : result.exitCode;
    }

    return result.exitCode;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`mcp-pordego scan error: ${msg}\n`);
    return 2;
  }
}
