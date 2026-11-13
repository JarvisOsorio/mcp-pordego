import type { LiveRule } from "../../types.js";

export const noReadonlyHint: LiveRule = {
  id: "no-readonly-hint",
  severity: "low",
  check(server) {
    return server.tools
      .filter((t) => t.annotations?.readOnlyHint !== true && t.annotations?.readOnlyHint !== false)
      .map((t) => ({
        rule: "no-readonly-hint",
        severity: "low" as const,
        server: server.name,
        tool: t.name,
        message: "Tool missing annotations.readOnlyHint",
      }));
  },
};
