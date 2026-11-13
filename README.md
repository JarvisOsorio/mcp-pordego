# mcp-pordego

[![GitHub stars](https://img.shields.io/github/stars/JarvisOsorio/mcp-pordego?style=social)](https://github.com/JarvisOsorio/mcp-pordego/stargazers)
[![CI](https://github.com/JarvisOsorio/mcp-pordego/actions/workflows/ci.yml/badge.svg)](https://github.com/JarvisOsorio/mcp-pordego/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

**Scan your MCP setup for security footguns. Gateway coming next.**

Site: [jarvisosorio.com/mcp-pordego](https://jarvisosorio.com/mcp-pordego/) · If this helps, **[⭐ star the repo](https://github.com/JarvisOsorio/mcp-pordego)** — it helps others find a local MCP scanner.

`mcp-pordego` (*pordego* = Esperanto for *gate*) is an open-source security scanner for the MCP servers your agents already use — Claude Desktop, Claude Code, Cursor, VS Code. It flags unpinned packages, inline secrets, prompt-injection in tool descriptions, over-broad filesystem roots, and more.

> **v0.1 ships the scanner.** A policy gateway, lockfile, redaction proxy, audit log, and replay are designed (see [SPEC.md](./SPEC.md)) and the CLI stubs those commands so the surface stays stable, but they are **not** in this release.

```
┌─────────┐         ┌──────────────┐
│  Agent  │  MCP    │ your servers │
│ configs │ ──────► │ github, fs…  │
└────┬────┘         └──────────────┘
     │
     ▼
 mcp-pordego scan   ← you are here (v0.1)
```

## Install (from source — npm not published yet)

Requires **Node.js 20+** and **pnpm**. The package is **not yet on the npm registry** — do **not** run `npx mcp-pordego`. Install from this repository or a [GitHub Release](https://github.com/JarvisOsorio/mcp-pordego/releases) asset.

### Clone and build

```bash
git clone https://github.com/JarvisOsorio/mcp-pordego.git
cd mcp-pordego
pnpm install && pnpm build
pnpm scan -- --help
```

After build, the CLI is also at `node packages/cli/dist/index.js` (or `dist/mcp-pordego.cjs` from `pnpm bundle`).

### Or download the release asset

```bash
curl -L -o mcp-pordego.cjs \
  https://github.com/JarvisOsorio/mcp-pordego/releases/download/v0.1.1/mcp-pordego.cjs
node mcp-pordego.cjs scan --help
```

## Why

Today, every MCP setup is "give the agent the whole server and hope." No check that a tool description didn't smuggle instructions, no alarm when `npx` floats on `@latest`, nothing stopping a PAT from sitting in plaintext in `mcp.json`.

## Quick start (30 seconds)

```bash
pnpm scan
# or with an explicit config:
node packages/cli/dist/index.js scan --config ./fixtures/configs/bad-mcp.json
```

Auto-discovers configs from:

| Client | Paths |
|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%/Claude/…` (Windows), `~/.config/Claude/…` (Linux) |
| Claude Code | `.mcp.json`, `~/.claude.json` |
| Cursor | `.cursor/mcp.json`, `~/.cursor/mcp.json` |
| VS Code | `.vscode/mcp.json` |

Exits **1** on high-severity findings (CI-friendly). Exit **2** on config/integrity errors.

### Point at a file or command

```bash
node dist/mcp-pordego.cjs scan --config ./fixtures/configs/bad-mcp.json
node dist/mcp-pordego.cjs scan --server "npx -y @modelcontextprotocol/server-filesystem@2025.1.14 /tmp"
node dist/mcp-pordego.cjs scan --live --config .mcp.json   # spawn servers; tools/list only, never tools/call
```

### Output formats

```bash
node dist/mcp-pordego.cjs scan --format text          # default, colored, grouped by server
node dist/mcp-pordego.cjs scan --format json
node dist/mcp-pordego.cjs scan --format sarif         # GitHub code scanning
node dist/mcp-pordego.cjs scan --fail-on medium       # high | medium | low (default: high)
node dist/mcp-pordego.cjs scan --baseline accepted.json
```

## What it checks

### Static (config only)

| Rule | Severity | Check |
|---|---|---|
| `unpinned-npx` | high | `npx` package without exact version, or `@latest` |
| `unpinned-uvx` | high | `uvx` / `pipx run` without `==version` |
| `unpinned-docker` | high | image with `:latest` or no tag / digest |
| `unpinned-git` | high | git URL without commit SHA |
| `inline-secret` | high | secret-looking value in `env` / `args` / `headers` |
| `remote-http-no-tls` | high | `http://` to a non-loopback host |
| `broad-fs-root` | medium | filesystem server rooted at `/`, `~`, or home |
| `shell-server` | medium | name/package suggests shell/exec capability |

### Live (`--live`)

Spawns each stdio server, calls `initialize` + `tools/list` (never `tools/call`):

| Rule | Severity |
|---|---|
| `desc-injection-phrases` | high |
| `desc-hidden-chars` | high |
| `desc-exfil-url` | high |
| `schema-freeform-exec` | high |
| `desc-markup-hidden` | medium |
| `desc-cross-tool-ref` | medium |
| `schema-freeform-path` | medium |
| `schema-freeform-url` | medium |
| `tool-name-collision` | medium |
| `no-readonly-hint` | low |
| `desc-oversized` | low |

Detection is heuristic. Rules are plain TypeScript modules — add one file + fixtures.

## Roadmap (gateway)

Designed, not yet in this release:

| Feature | What it will do |
|---|---|
| **Policy-as-code** | Allow/deny per server/tool with arg constraints + rate limits |
| **Audit log** | Hash-chained JSONL of every call |
| **Redaction** | Strip API keys / tokens from responses |
| **Tool pinning** | `mcp-pordego.lock` blocks silent description changes |
| **Replay** | Mock / verify recorded sessions |

Decisions locked for v1 gateway: **tool pinning on**, **deny sampling/elicitation by default**, denials returned as MCP results with `isError: true` (not JSON-RPC errors).

## Develop

```bash
pnpm install
pnpm build
pnpm test
node packages/cli/dist/index.js scan --config fixtures/configs/bad-mcp.json
```

**How to run tests:** `pnpm test` (Vitest). 42 tests covering static rules, live rules, detectors, discovery, and the scan runner.

## What this is not

- **Not a sandbox.** It inspects configs and tool metadata. It does not isolate upstream server processes.
- **Heuristics miss things.** Encoded injection, novel secret formats, and clever shadowing can slip through.
- **Live mode still trusts the server binary.** It only reads `tools/list`.

## License

Apache-2.0 · [jarvisosorio.com/mcp-pordego](https://jarvisosorio.com/mcp-pordego/)
