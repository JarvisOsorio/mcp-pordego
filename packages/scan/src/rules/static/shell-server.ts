import type { StaticRule } from "../../types.js";

const SHELL_HINTS =
  /\b(shell|exec|terminal|bash|zsh|cmd|powershell|osascript|command-runner|mcp-shell|server-shell)\b/i;

export const shellServer: StaticRule = {
  id: "shell-server",
  severity: "medium",
  check(server) {
    const hay = [server.name, server.command ?? "", ...(server.args ?? [])].join(" ");
    if (!SHELL_HINTS.test(hay)) return [];
    return [
      {
        rule: "shell-server",
        severity: "medium",
        server: server.name,
        message:
          "Server name/package suggests shell/exec capability — high blast radius if unconstrained",
        evidence: hay.slice(0, 200),
        source: server.source,
      },
    ];
  },
};
