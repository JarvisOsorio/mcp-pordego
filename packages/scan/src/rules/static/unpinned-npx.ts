import type { Finding, StaticRule } from "../../types.js";

function isNpx(command?: string): boolean {
  if (!command) return false;
  const base = command.replace(/\\/g, "/").split("/").pop() ?? command;
  return base === "npx" || base === "npx.cmd";
}

/** True if the version/tag looks like an exact pin (semver or date-ish), not a range/dist-tag. */
export function isPinnedNpmVersion(ver: string): boolean {
  if (!ver || ver === "latest") return false;
  // ranges / wildcards
  if (/^[\^~>=<]/.test(ver) || ver.includes("*") || ver.includes("||")) return false;
  if (/(?:^|[.])[xX](?:$|[.-])/.test(ver)) return false;
  // dist-tags (next, beta, canary, …) do not start with an optional v + digit
  if (!/^v?\d/.test(ver)) return false;
  return true;
}

/** True if package ref looks unpinned (no exact version, or @latest / dist-tag / range). */
export function isUnpinnedNpxPackage(pkg: string): boolean {
  if (!pkg || pkg.startsWith("-")) return false;
  // local paths / urls are not npm packages we pin by version
  if (pkg.startsWith(".") || pkg.startsWith("/") || pkg.includes("://")) return false;
  // scoped: @scope/name@version or @scope/name
  if (pkg.startsWith("@")) {
    const at = pkg.indexOf("@", 1);
    if (at === -1) return true; // @scope/name with no version
    return !isPinnedNpmVersion(pkg.slice(at + 1));
  }
  // unscoped: name@version
  const at = pkg.lastIndexOf("@");
  if (at <= 0) return true; // name with no version
  return !isPinnedNpmVersion(pkg.slice(at + 1));
}

/** Resolve the package argument from npx argv (handles -p / --package). */
export function extractNpxPackage(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-p" || a === "--package") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) return next;
      continue;
    }
    if (a.startsWith("--package=")) {
      return a.slice("--package=".length) || undefined;
    }
    if (a.startsWith("-p=")) {
      return a.slice(3) || undefined;
    }
  }
  // positional package: skip flags (and values for known value-taking flags)
  let i = 0;
  while (i < args.length) {
    const a = args[i]!;
    if (!a.startsWith("-")) return a;
    if (
      (a === "-p" || a === "--package" || a === "-c" || a === "--call" || a === "--node-options") &&
      i + 1 < args.length &&
      !args[i + 1]!.startsWith("-")
    ) {
      i += 2;
      continue;
    }
    i++;
  }
  return undefined;
}

export const unpinnedNpx: StaticRule = {
  id: "unpinned-npx",
  severity: "high",
  check(server) {
    if (!isNpx(server.command)) return [];
    const args = server.args ?? [];
    const pkg = extractNpxPackage(args);
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
