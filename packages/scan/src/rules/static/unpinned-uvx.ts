import type { StaticRule } from "../../types.js";

function isUvxOrPipx(command?: string): boolean {
  if (!command) return false;
  const base = command.replace(/\\/g, "/").split("/").pop() ?? command;
  return base === "uvx" || base === "pipx";
}

export function isUnpinnedPythonTool(args: string[]): boolean {
  // uvx pkg==1.2.3 or pipx run pkg==1.2.3
  const cleaned = [...args];
  let i = 0;
  if (cleaned[0] === "run") i = 1;
  while (i < cleaned.length && cleaned[i]!.startsWith("-")) i++;
  const pkg = cleaned[i];
  if (!pkg) return true;
  if (!pkg.includes("==")) return true;
  const ver = pkg.split("==")[1];
  return !ver || ver === "latest";
}

export const unpinnedUvx: StaticRule = {
  id: "unpinned-uvx",
  severity: "high",
  check(server) {
    if (!isUvxOrPipx(server.command)) return [];
    const args = server.args ?? [];
    if (!isUnpinnedPythonTool(args)) return [];
    return [
      {
        rule: "unpinned-uvx",
        severity: "high",
        server: server.name,
        message: `${server.command} package is unpinned (expected ==version)`,
        evidence: args.join(" "),
        source: server.source,
      },
    ];
  },
};
