import { hasSecret } from "@mcp-pordego/redact";
import type { Finding, StaticRule } from "../../types.js";

export const inlineSecret: StaticRule = {
  id: "inline-secret",
  severity: "high",
  check(server) {
    const findings: Finding[] = [];
    const checkValue = (where: string, value: string) => {
      const detector = hasSecret(value);
      if (!detector) return;
      findings.push({
        rule: "inline-secret",
        severity: "high",
        server: server.name,
        message: `Secret-looking value in ${where} (matched ${detector})`,
        evidence: `[REDACTED:${detector}]`,
        source: server.source,
      });
    };

    for (const [k, v] of Object.entries(server.env ?? {})) {
      checkValue(`env.${k}`, v);
    }
    for (const [k, v] of Object.entries(server.headers ?? {})) {
      checkValue(`headers.${k}`, v);
    }
    for (const [i, a] of (server.args ?? []).entries()) {
      checkValue(`args[${i}]`, a);
    }
    return findings;
  },
};
