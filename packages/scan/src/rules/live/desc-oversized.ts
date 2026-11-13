import type { LiveRule } from "../../types.js";

export const DESC_OVERSIZE_LIMIT = 2000;

export const descOversized: LiveRule = {
  id: "desc-oversized",
  severity: "low",
  check(server) {
    return server.tools
      .filter((t) => (t.description?.length ?? 0) > DESC_OVERSIZE_LIMIT)
      .map((t) => ({
        rule: "desc-oversized",
        severity: "low" as const,
        server: server.name,
        tool: t.name,
        message: `Description length ${t.description!.length} exceeds ${DESC_OVERSIZE_LIMIT}`,
      }));
  },
};
