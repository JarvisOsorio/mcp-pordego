import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadExplicitConfig, parseConfigFile, serverFromCommandLine } from "./discover.js";

describe("discover/parse", () => {
  it("parses Claude-style mcpServers", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-pordego-"));
    const path = join(dir, "mcp.json");
    writeFileSync(
      path,
      JSON.stringify({
        mcpServers: {
          a: { command: "npx", args: ["-y", "pkg@1.0.0"] },
        },
      }),
    );
    const cfg = parseConfigFile(path, "cursor");
    expect(cfg?.servers).toHaveLength(1);
    expect(cfg?.servers[0]!.name).toBe("a");
  });

  it("parses VS Code servers map", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-pordego-"));
    mkdirSync(join(dir, ".vscode"));
    const path = join(dir, ".vscode", "mcp.json");
    writeFileSync(
      path,
      JSON.stringify({
        servers: {
          b: { command: "uvx", args: ["pkg==1.0.0"] },
        },
      }),
    );
    const cfg = parseConfigFile(path, "vscode");
    expect(cfg?.servers[0]!.command).toBe("uvx");
  });

  it("builds server from CLI command", () => {
    const s = serverFromCommandLine("npx -y foo@1.0.0 /tmp");
    expect(s.command).toBe("npx");
    expect(s.args).toEqual(["-y", "foo@1.0.0", "/tmp"]);
  });

  it("loadExplicitConfig errors on missing, invalid, or empty configs", () => {
    expect(() => loadExplicitConfig("/tmp/mcp-pordego-does-not-exist-xyz.json")).toThrow(
      /not found/,
    );

    const dir = mkdtempSync(join(tmpdir(), "mcp-pordego-"));
    const badJson = join(dir, "bad.json");
    writeFileSync(badJson, "not-json");
    expect(() => loadExplicitConfig(badJson)).toThrow(/Invalid JSON/);

    const empty = join(dir, "empty.json");
    writeFileSync(empty, JSON.stringify({ notServers: true }));
    expect(() => loadExplicitConfig(empty)).toThrow(/No MCP servers/);
  });
});
