# mcp-pordego

**Scan your MCP setup for security footguns. Gateway coming next.**

`mcp-pordego` (*pordego* = Esperanto for *gate*) audits the MCP servers your agents already use — Claude Desktop, Claude Code, Cursor, VS Code — and flags unpinned packages, inline secrets, prompt-injection in tool descriptions, over-broad filesystem roots, and more.

> **v0.1 ships the scanner.** Policy gateway, lockfile, redaction proxy, audit log, and replay are designed (see [SPEC.md](./SPEC.md)) and land in follow-up releases. The CLI stubs those commands so the surface stays stable.

```
┌─────────┐         ┌──────────────┐
│  Agent  │  MCP    │ your servers │
│ configs │ ──────► │ github, fs…  │
└────┬────┘         └──────────────┘
     │
     ▼
 mcp-pordego scan   ← you are here (v0.1)
```

## Why

Today, every MCP setup is "give the agent the whole server and hope." No check that a tool description didn't smuggle instructions, no alarm when `npx` floats on `@latest`, nothing stopping a PAT from sitting in plaintext in `mcp.json`.

## Install

```bash
npx mcp-pordego scan
# or
npm i -g mcp-pordego
mcp-pordego scan
```

Requires **Node 20+**.

## Quick start (30 seconds)

```bash
npx mcp-pordego scan
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
mcp-pordego scan --config ./fixtures/configs/bad-mcp.json
mcp-pordego scan --server "npx -y @modelcontextprotocol/server-filesystem@2025.1.14 /tmp"
mcp-pordego scan --live --config .mcp.json   # spawn servers; tools/list only, never tools/call
```

### Output formats

```bash
mcp-pordego scan --format text          # default, colored, grouped by server
mcp-pordego scan --format json
mcp-pordego scan --format sarif         # GitHub code scanning
mcp-pordego scan --fail-on medium       # high | medium | low (default: high)
mcp-pordego scan --baseline accepted.json
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

## What this is not

- **Not a sandbox.** It inspects configs and tool metadata. It does not isolate upstream server processes.
- **Heuristics miss things.** Encoded injection, novel secret formats, and clever shadowing can slip through.
- **Live mode still trusts the server binary.** It only reads `tools/list`.

## License

Apache-2.0
