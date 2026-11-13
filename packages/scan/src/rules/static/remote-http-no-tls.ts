import type { StaticRule } from "../../types.js";

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h.endsWith(".localhost")
  );
}

export function isRemoteHttpNoTls(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  return !isLoopbackHost(parsed.hostname);
}

export const remoteHttpNoTls: StaticRule = {
  id: "remote-http-no-tls",
  severity: "high",
  check(server) {
    if (!server.url) return [];
    if (!isRemoteHttpNoTls(server.url)) return [];
    return [
      {
        rule: "remote-http-no-tls",
        severity: "high",
        server: server.name,
        message: `Remote HTTP URL without TLS: ${server.url}`,
        evidence: server.url,
        source: server.source,
      },
    ];
  },
};
