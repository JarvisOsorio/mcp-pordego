# mcp-pordego: Technical Specification

Status: v1 draft. Audience: engineers building it. Package name: `mcp-pordego` (npm + GitHub).

## 1. Goals and non-goals

**Goals**
- Transparent MCP proxy: stdio and Streamable HTTP, both directions.
- Enforce per-server, per-tool policy with argument constraints and rate limits.
- Tamper-evident audit log of every call.
- Redact secrets and PII from responses (optionally requests).
- Pin tool definitions and block silent changes.
- Replay recorded sessions (mock and verify modes).
- Scanner CLI for existing MCP configs.
- Added latency: p50 < 5 ms, p99 < 25 ms for non-network work (excluding upstream time).

**Non-goals (v1)**
- UI, hosted service, multi-user auth, multiplayer.
- Sandboxing or process isolation of upstream servers.
- ML/classifier-based detection.
- Semantic taint tracking.
- Protocol translation beyond stdio <-> Streamable HTTP.

## 2. Tech stack

- **Language:** TypeScript, Node 20+, ESM.
- **MCP:** `@modelcontextprotocol/sdk` for transports and types. Do not hand-roll framing; do hand-roll the interception layer.
- **Libraries:** `yaml`, `ajv` (config validation), `picomatch` (globs), `commander` (CLI), `pino` (diagnostic logging to stderr), `vitest`.
- **Canonical JSON:** RFC 8785 (JCS), e.g. `canonicalize`.
- **Hashing:** `node:crypto` SHA-256.
- **Distribution:** npm (`npx mcp-pordego`). Optional single binary later via `bun build --compile` or Node SEA.
- **Monorepo:** pnpm workspaces.

## 3. Architecture

The gateway is an **MCP server** to the agent and an **MCP client** to each upstream.

```
Agent ──(MCP)──► [Downstream Transport] ─► Router ─► [Pipeline] ─► [Upstream Client] ──(MCP)──► Server
                                                         │
                                  lock → policy → ratelimit → (forward) → redact → audit
```

### 3.1 Modes

| Mode | Command | Behavior |
|---|---|---|
| **wrap** | `mcp-pordego run -- <cmd> [args]` | One upstream, stdio. Tool names pass through unchanged. |
| **serve** | `mcp-pordego serve` | Many upstreams from config. Tools are namespaced `<server>__<tool>`. Downstream is stdio or Streamable HTTP. |

Namespace rule: `^[a-zA-Z0-9_-]{1,64}$` is the strictest common client limit. Truncate and disambiguate with a short hash suffix if needed, and keep the mapping in memory and in the audit log.

### 3.2 Transports

**Stdio (downstream and upstream)**
- Newline-delimited JSON-RPC on stdin/stdout. Nothing but protocol messages on stdout. All diagnostics go to stderr.
- Upstream: spawn the child with `env` from config only (no ambient inheritance except an explicit allowlist: `PATH`, `HOME`, `LANG`). Kill the child on gateway exit. Restart policy: none in v1; surface the error to the client.

**Streamable HTTP**
- Single MCP endpoint (`/mcp`) supporting POST, and GET for server-to-client streams. Responses may be `application/json` or `text/event-stream`.
- Session handling: `Mcp-Session-Id` header issued at `initialize`; `MCP-Protocol-Version` header on subsequent requests.
- Downstream HTTP binds to `127.0.0.1` by default. Validate the `Origin` header (DNS rebinding defense). Require a bearer token (`--token` or env) if bound to a non-loopback address; refuse to start otherwise.

### 3.3 Message handling

All traffic is JSON-RPC 2.0. The gateway classifies each message:

| Message | Handling |
|---|---|
| `initialize` | Gateway answers downstream itself; negotiates the lower protocol version; advertises merged capabilities from upstreams, with `sampling`/`elicitation` handling per 3.4. |
| `tools/list` | Fan out, follow `nextCursor` pagination fully, check lockfile, filter by policy (hide tools no rule could allow), namespace, return. |
| `tools/call` | Full pipeline (section 4). |
| `resources/list`, `resources/templates/list` | Fan out, namespace URIs, filter by policy (resource rules). |
| `resources/read` | Policy check on URI, redact response. |
| `prompts/list`, `prompts/get` | Fan out and filter; redact `get` responses. |
| `ping`, `notifications/cancelled`, `notifications/progress` | Forward, remap request IDs. |
| `notifications/tools/list_changed` etc. | Upstream: invalidate cache, re-run lock check, forward only if tool set (post-policy) changed. |
| Anything unknown | Configurable: `unknown_methods: forward \| deny` (default `deny` in serve mode, `forward` in wrap mode). |

**Request ID remapping:** in serve mode, downstream IDs are mapped to per-u