import { describe, expect, it } from "vitest";
import type { McpServerConfig } from "../../types.js";
import { broadFsRoot, isBroadFsRoot } from "./broad-fs-root.js";
import { inlineSecret } from "./inline-secret.js";
import { isRemoteHttpNoTls, remoteHttpNoTls } from "./remote-http-no-tls.js";
import { shellServer } from "./shell-server.js";
import { isUnpinnedDockerImage, unpinnedDocker } from "./unpinned-docker.js";
import { isUnpinnedGitUrl, unpinnedGit } from "./unpinned-git.js";
import { isUnpinnedNpxPackage, unpinnedNpx } from "./unpinned-npx.js";
import { unpinnedUvx } from "./unpinned-uvx.js";

function srv(partial: Partial<McpServerConfig> & { name: string }): McpServerConfig {
  return {
    source: "/tmp/test.json",
    client: "test",
    ...partial,
  };
}

describe("unpinned-npx", () => {
  it("flags unversioned and @latest", () => {
    expect(isUnpinnedNpxPackage("@modelcontextprotocol/server-fs")).toBe(true);
    expect(isUnpinnedNpxPackage("@modelcontextprotocol/server-fs@latest")).toBe(true);
    expect(isUnpinnedNpxPackage("foo@^1.0.0")).toBe(true);
    expect(isUnpinnedNpxPackage("@scope/pkg@1.2.3")).toBe(false);
    expect(isUnpinnedNpxPackage("pkg@1.2.3")).toBe(false);
  });

  it("emits finding for unpinned npx server", () => {
    const f = unpinnedNpx.check(
      srv({ name: "x", command: "npx", args: ["-y", "some-mcp@latest"] }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.rule).toBe("unpinned-npx");
    expect(f[0]!.severity).toBe("high");
  });
});

describe("unpinned-uvx", () => {
  it("flags missing ==version", () => {
    const f = unpinnedUvx.check(srv({ name: "u", command: "uvx", args: ["pkg"] }));
    expect(f).toHaveLength(1);
    expect(
      unpinnedUvx.check(srv({ name: "u", command: "uvx", args: ["pkg==1.0.0"] })),
    ).toHaveLength(0);
  });
});

describe("unpinned-docker", () => {
  it("detects latest / untagged", () => {
    expect(isUnpinnedDockerImage("mcp/foo")).toBe(true);
    expect(isUnpinnedDockerImage("mcp/foo:latest")).toBe(true);
    expect(isUnpinnedDockerImage("mcp/foo:1.2.3")).toBe(false);
    expect(isUnpinnedDockerImage("mcp/foo@sha256:abc")).toBe(false);
  });

  it("parses docker run args", () => {
    const f = unpinnedDocker.check(
      srv({
        name: "d",
        command: "docker",
        args: ["run", "-i", "--rm", "-e", "TOKEN=x", "img:latest"],
      }),
    );
    expect(f).toHaveLength(1);
  });
});

describe("unpinned-git", () => {
  it("requires commit SHA", () => {
    expect(isUnpinnedGitUrl("git+https://github.com/a/b.git")).toBe(true);
    expect(
      isUnpinnedGitUrl(
        "git+https://github.com/a/b.git#0123456789abcdef0123456789abcdef01234567",
      ),
    ).toBe(false);
    const f = unpinnedGit.check(
      srv({
        name: "g",
        command: "npx",
        args: ["-y", "git+https://github.com/a/b.git"],
      }),
    );
    expect(f[0]!.severity).toBe("high");
  });
});

describe("inline-secret", () => {
  it("flags env secrets without echoing them", () => {
    const f = inlineSecret.check(
      srv({
        name: "s",
        command: "npx",
        args: ["x"],
        env: { T: "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB" },
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.evidence).toContain("REDACTED");
    expect(JSON.stringify(f)).not.toContain("ghp_");
  });
});

describe("remote-http-no-tls", () => {
  it("allows loopback http, blocks remote http", () => {
    expect(isRemoteHttpNoTls("http://127.0.0.1/mcp")).toBe(false);
    expect(isRemoteHttpNoTls("http://evil.com/mcp")).toBe(true);
    expect(isRemoteHttpNoTls("https://evil.com/mcp")).toBe(false);
    expect(
      remoteHttpNoTls.check(srv({ name: "r", url: "http://evil.com/mcp" })),
    ).toHaveLength(1);
  });
});

describe("broad-fs-root", () => {
  it("flags / and ~", () => {
    expect(isBroadFsRoot("/")).toBe(true);
    expect(isBroadFsRoot("~")).toBe(true);
    expect(isBroadFsRoot("./src")).toBe(false);
    const f = broadFsRoot.check(
      srv({
        name: "fs",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/"],
      }),
    );
    expect(f[0]!.severity).toBe("medium");
  });
});

describe("shell-server", () => {
  it("flags shell-ish names", () => {
    const f = shellServer.check(
      srv({ name: "shell", command: "npx", args: ["mcp-shell"] }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("medium");
  });
});
