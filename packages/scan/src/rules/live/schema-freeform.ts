import type { LiveRule, ToolInfo } from "../../types.js";

type Prop = {
  name: string;
  schema: Record<string, unknown>;
};

function propsOf(tool: ToolInfo): Prop[] {
  const schema = tool.inputSchema;
  if (!schema || typeof schema !== "object") return [];
  const properties = (schema as { properties?: Record<string, unknown> }).properties;
  if (!properties || typeof properties !== "object") return [];
  return Object.entries(properties).map(([name, s]) => ({
    name,
    schema: (s && typeof s === "object" ? s : {}) as Record<string, unknown>,
  }));
}

function isUnconstrainedString(schema: Record<string, unknown>): boolean {
  const t = schema.type;
  const isString = t === "string" || (Array.isArray(t) && t.includes("string"));
  if (!isString && t !== undefined) return false;
  if (t === undefined && !schema.pattern && !schema.enum && !schema.format) {
    // untyped — treat as freeform if no constraints
    return !schema.enum && !schema.pattern && !schema.format && !schema.const;
  }
  if (!isString) return false;
  return !schema.pattern && !schema.enum && !schema.format && !schema.const;
}

const EXEC_NAMES = /^(command|cmd|script|code|sql|eval)$/i;
const PATH_NAMES = /^(path|file|dir|directory|filepath|filename)$/i;
const URL_NAMES = /^(url|uri|href|endpoint)$/i;

export const schemaFreeformExec: LiveRule = {
  id: "schema-freeform-exec",
  severity: "high",
  check(server) {
    const findings = [];
    for (const tool of server.tools) {
      for (const p of propsOf(tool)) {
        if (!EXEC_NAMES.test(p.name)) continue;
        if (!isUnconstrainedString(p.schema)) continue;
        findings.push({
          rule: "schema-freeform-exec",
          severity: "high" as const,
          server: server.name,
          tool: tool.name,
          message: `Unconstrained string arg "${p.name}" looks like an execution surface`,
          evidence: p.name,
        });
      }
    }
    return findings;
  },
};

export const schemaFreeformPath: LiveRule = {
  id: "schema-freeform-path",
  severity: "medium",
  check(server) {
    const findings = [];
    for (const tool of server.tools) {
      for (const p of propsOf(tool)) {
        if (!PATH_NAMES.test(p.name)) continue;
        if (!isUnconstrainedString(p.schema)) continue;
        findings.push({
          rule: "schema-freeform-path",
          severity: "medium" as const,
          server: server.name,
          tool: tool.name,
          message: `Path-like arg "${p.name}" has no pattern/enum constraint`,
          evidence: p.name,
        });
      }
    }
    return findings;
  },
};

export const schemaFreeformUrl: LiveRule = {
  id: "schema-freeform-url",
  severity: "medium",
  check(server) {
    const findings = [];
    for (const tool of server.tools) {
      for (const p of propsOf(tool)) {
        if (!URL_NAMES.test(p.name)) continue;
        if (!isUnconstrainedString(p.schema)) continue;
        findings.push({
          rule: "schema-freeform-url",
          severity: "medium" as const,
          server: server.name,
          tool: tool.name,
          message: `URL-like arg "${p.name}" has no format/pattern constraint`,
          evidence: p.name,
        });
      }
    }
    return findings;
  },
};
