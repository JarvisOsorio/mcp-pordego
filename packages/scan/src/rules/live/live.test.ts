import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ServerLiveInfo } from "../../types.js";
import { runLiveRules } from "../../runner.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "../../../../../fixtures/malicious/tools.json"), "utf8"),
) as { servers: ServerLiveInfo[] };

describe("live rules", () => {
  const findings = runLiveRules(fixture.servers);
  const byRule = (id: string) => findings.filter((f) => f.rule === id);

  it("flags injection phrases", () => {
    expect(byRule("desc-injection-phrases").length).toBeGreaterThan(0);
    expect(byRule("desc-injection-phrases")[0]!.severity).toBe("high");
  });

  it("flags hidden chars", () => {
    expect(byRule("desc-hidden-chars").some((f) => f.tool === "hidden")).toBe(true);
  });

  it("flags markup / base64-ish hidden content", () => {
    expect(byRule("desc-markup-hidden").length).toBeGreaterThan(0);
  });

  it("flags cross-tool refs", () => {
    expect(byRule("desc-cross-tool-ref").some((f) => f.tool === "helper")).toBe(true);
  });

  it("flags exfil URLs", () => {
    expect(byRule("desc-exfil-url").length).toBeGreaterThan(0);
    expect(byRule("desc-exfil-url")[0]!.severity).toBe("high");
  });

  it("flags freeform exec/path/url schemas", () => {
    expect(byRule("schema-freeform-exec").length).toBeGreaterThan(0);
    expect(byRule("schema-freeform-path").length).toBeGreaterThan(0);
    expect(byRule("schema-freeform-url").length).toBeGreaterThan(0);
  });

  it("flags missing readOnlyHint", () => {
    expect(byRule("no-readonly-hint").length).toBeGreaterThan(0);
  });

  it("flags tool name collisions across servers", () => {
    expect(byRule("tool-name-collision").some((f) => f.tool === "search")).toBe(true);
  });

  it("does not false-positive oversized on short descriptions", () => {
    expect(byRule("desc-oversized")).toHaveLength(0);
  });

  it("flags oversized descriptions", () => {
    const big: ServerLiveInfo = {
      name: "big",
      tools: [{ name: "t", description: "x".repeat(2001) }],
    };
    const f = runLiveRules([big]);
    expect(f.some((x) => x.rule === "desc-oversized")).toBe(true);
  });
});
