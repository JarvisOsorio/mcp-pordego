#!/usr/bin/env node
import { Command } from "commander";
import { scanCommand } from "./commands/scan.js";

const program = new Command();

program
  .name("mcp-pordego")
  .description(
    "MCP security scanner (and upcoming gateway). Pordego = Esperanto for gate.",
  )
  .version("0.1.0")
  .option("--no-color", "Disable ANSI colors")
  .option("--log-level <level>", "Diagnostic log level", "info");

program
  .command("scan")
  .description("Scan MCP configs for security issues (static; optional --live)")
  .option("-c, --config <path>", "Config file path (repeatable)", (v, acc: string[]) => {
    acc.push(v);
    return acc;
  }, [] as string[])
  .option("--server <command>", "Scan a single server command line")
  .option("--live", "Spawn servers and inspect tools/list (never tools/call)", false)
  .option("--format <fmt>", "Output format: text | json | sarif", "text")
  .option("--fail-on <sev>", "Exit 1 on findings at/above severity: high|medium|low", "high")
  .option("--baseline <file>", "Suppress accepted findings by (rule, server, tool)")
  .option("--no-discover", "Do not auto-discover client configs")
  .action(async (opts, cmd) => {
    const global = cmd.parent?.opts() as { color?: boolean } | undefined;
    const code = await scanCommand({
      config: opts.config?.length ? opts.config : undefined,
      server: opts.server,
      live: opts.live,
      format: opts.format,
      failOn: opts.failOn,
      baseline: opts.baseline,
      color: global?.color,
      noDiscover: opts.discover === false,
    });
    process.exitCode = code;
  });

program
  .command("init")
  .description("(Coming soon) Generate starter mcp-pordego.yaml")
  .action(() => {
    process.stderr.write(
      "mcp-pordego init is not available yet — scanner ships first. Gateway init lands in a later release.\n",
    );
    process.exitCode = 2;
  });

program
  .command("run")
  .description("(Coming soon) Wrap one stdio MCP server with policy")
  .allowUnknownOption()
  .action(() => {
    process.stderr.write(
      "mcp-pordego run (gateway wrap) ships after the scanner. Use `mcp-pordego scan` today.\n",
    );
    process.exitCode = 2;
  });

program
  .command("serve")
  .description("(Coming soon) Multi-server MCP gateway")
  .action(() => {
    process.stderr.write(
      "mcp-pordego serve ships after the scanner. Use `mcp-pordego scan` today.\n",
    );
    process.exitCode = 2;
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exitCode = 2;
});
