import { readFileSync } from "node:fs";
import type { BaselineEntry, Finding } from "./types.js";

export function loadBaseline(path: string): BaselineEntry[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (Array.isArray(raw)) {
    return raw.map(normalizeEntry).filter((e): e is BaselineEntry => e !== undefined);
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { findings?: unknown }).findings)) {
    return ((raw as { findings: unknown[] }).findings)
      .map(normalizeEntry)
      .filter((e): e is BaselineEntry => e !== undefined);
  }
  throw new Error(`Invalid baseline file: ${path}`);
}

function normalizeEntry(v: unknown): BaselineEntry | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.rule !== "string" || typeof o.server !== "string") return undefined;
  return {
    rule: o.rule,
    server: o.server,
    ...(typeof o.tool === "string" ? { tool: o.tool } : {}),
  };
}

export function applyBaseline(findings: Finding[], baseline: BaselineEntry[]): Finding[] {
  return findings.filter(
    (f) =>
      !baseline.some(
        (b) =>
          b.rule === f.rule &&
          b.server === f.server &&
          (b.tool === undefined || b.tool === f.tool),
      ),
  );
}
