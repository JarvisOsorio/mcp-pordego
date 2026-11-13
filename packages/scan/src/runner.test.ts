import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatJson } from "./report/json.js";
import { formatSarif } from "./report/sarif.js";
import { runScan, shouldFail } from "./runner.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const bad = join(root, "fixtures/configs/bad-mcp.json");
const good = join(root, "fixtures/configs/good-mcp.json");

describe("runScan", () => {
  it("finds high-severity issues in bad fixture", async () => {
    const res = await runScan({
      configPaths: [bad],
      noDiscover: true,
      format: "json",
      color: false,
    });
    expect(res.findings.length).toBeGreaterThan(5);
    const rules = new Set(res.findings.map((f) => f.rule));
    expect(rules.has("unpinned-npx")).toBe(true);
    expect(rules.has("inline-secret")).toBe(true);
    expect(rules.has("remote-http-no-tls")).toBe(true);
    expect(rules.has("unpinned-docker")).toBe(true);
    expect(rules.has("unpinned-uvx")).toBe(true);
    expect(rules.has("unpinned-git")).toBe(true);
    expect(rules.has("broad-fs-root")).toBe(true);
    expect(rules.has("shell-server")).toBe(true);
    expect(res.exitCode).toBe(1);
  });

  it("passes good fixture at fail-on high", async () => {
    const res = await runScan({
      configPaths: [good],
      noDiscover: true,
      failOn: "high",
      format: "text",
      color: false,
    });
    expect(res.findings.every((f) => f.severity !== "high")).toBe(true);
    expect(res.exitCode).toBe(0);
  });

  it("emits valid json and sarif", async () => {
    const res = await runScan({
      configPaths: [bad],
      noDiscover: true,
      format: "json",
      color: false,
    });
    const json = JSON.parse(formatJson(res.findings));
    expect(json.findings.length).toBe(res.findings.length);
    const sarif = JSON.parse(formatSarif(res.findings));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].results.length).toBe(res.findings.length);
  });

  it("shouldFail respects threshold", () => {
    expect(shouldFail([{ rule: "x", severity: "low", server: "s", message: "m" }], "high")).toBe(
      false,
    );
    expect(
      shouldFail([{ rule: "x", severity: "high", server: "s", message: "m" }], "high"),
    ).toBe(true);
  });
});
