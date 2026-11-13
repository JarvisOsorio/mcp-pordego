import type { Finding, StaticRule } from "../../types.js";

function isNpx(command?: string): boolean {
  if (!command) return false;
  const base = command.replace(/\\/g, "/").split("/").pop() ?? command;
  return base === "npx" || base === "npx.cmd";
}

/** True if package ref looks unpinned (no exact version, or @latest). */
export function isUnpinnedNpxPackage(pkg: string): boolean {
  if (!pkg || pkg.startsWith("-")) return false;
  // local paths / urls are not npm packages we pin by version
  if (pkg.startsWith(".") || pkg.startsWith("/") || pkg.includes("://")) return false;
  if (pkg.endsWith("@latest") || pkg.includes("@latest")) return true;
  // scoped: @scope/name@version or @scope/name
  if (pkg.startsWith("@")) {
    const at = pkg.indexOf("@", 1);
    if (at === -1) return true; // @scope/name with no version
    const ver = pkg.slice(at + 1);
    return !ver || ver === "latest" || ver.startsWith("^") || ver.startsWith("~") || ver.includes("*");
  }
  // unscoped: name@version
  const at = pkg.lastIndexOf("@");
  if (at <= 0) return true; // name with no version (at===0 would be weird)
  const ver = pkg.slice(at + 1);
  return !ver || ver === "latest" || ver.startsWith("^") || ver.startsWith("~") || ver.includes("*");
}

export const unpinnedNpx: StaticRule = {
  id: "unpinned-npx",
  severity: "high",
  check(server) {
    if (!isNpx(server.command)) return [];
    const args = server.args ?? [];
    // skip flags until we hit the package
    let i = 0;
    while (i < args.length && args[i]!.startsWith("-")) i++;
    const pkg = args[i];
    if (!pkg) {
      return [
        {
          rule: "unpinned-npx",
          severity: "high",
          server: server.name,
          message: "npx invoked with no package argument",
          source: server.source,
        } satisfies Finding,
      ];
    }
    if (!isUnpinnedNpxPackage(pkg)) return [];
    return [
      {
        rule: "unpinned-npx",
        severity: "high",
        server: server.name,
        message: `npx package is unpinned: ${pkg}`,
        evidence: pkg,
        source: server.source,
      },
    ];
  },
};
