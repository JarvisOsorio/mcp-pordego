import type { Finding, StaticRule } from "../../types.js";

const GIT_URL =
  /(?:git\+)?(?:https?:\/\/|git@|ssh:\/\/).*?(?:\.git)?(?:@|#|\/tree\/|\/commit\/)?([0-9a-f]{40})?/i;

export function isGitRef(arg: string): boolean {
  return (
    arg.startsWith("git+") ||
    arg.startsWith("git@") ||
    /^https?:\/\/(github|gitlab|bitbucket)/i.test(arg) ||
    arg.includes(".git")
  );
}

export function isUnpinnedGitUrl(url: string): boolean {
  // commit SHA of 40 hex chars somewhere after @ or # or /commit/
  if (/@[0-9a-f]{40}(?:#|$)/i.test(url)) return false;
  if (/#[0-9a-f]{40}(?:#|$)/i.test(url)) return false;
  if (/\/commit\/[0-9a-f]{40}/i.test(url)) return false;
  if (/\/tree\/[0-9a-f]{40}/i.test(url)) return false;
  // npm git: git+https://...#v1.0.0 is a tag, still not a commit pin — flag it
  void GIT_URL;
  return true;
}

export const unpinnedGit: StaticRule = {
  id: "unpinned-git",
  severity: "high",
  check(server) {
    const findings: Finding[] = [];
    const args = server.args ?? [];
    for (const arg of args) {
      if (!isGitRef(arg)) continue;
      if (!isUnpinnedGitUrl(arg)) continue;
      findings.push({
        rule: "unpinned-git",
        severity: "high",
        server: server.name,
        message: `Git URL without commit SHA: ${arg}`,
        evidence: arg,
        source: server.source,
      });
    }
    return findings;
  },
};
