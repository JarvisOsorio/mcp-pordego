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

**Request ID remapping:** in serve mode, downstream IDs are mapped to per-upstream IDs. Keep `Map<downstreamId, {upstream, upstreamId, startedAt}>`. Handle `notifications/cancelled` by remapping `requestId`.

### 3.4 Server-initiated requests

Upstream servers can send `sampling/createMessage`, `elicitation/create`, and `roots/list` to the client. Default: **deny sampling and elicitation** (a server that can make the agent's model run its prompts is a prompt-injection channel). `roots/list` is answered from policy config. Opt-in per server via `servers.<name>.allow_sampling: true`.

## 4. Pipeline

Interceptors run in order on request, reverse order on response.

```ts
interface Ctx {
  sessionId: string;
  server: string;          // upstream name
  method: string;
  tool?: string;           // un-namespaced
  args?: unknown;
  startedAt: bigint;
  decision?: Decision;
}

type Decision =
  | { action: 'allow'; ruleId?: string }
  | { action: 'deny'; ruleId?: string; reason: string };

interface Interceptor {
  name: string;
  onRequest?(ctx: Ctx, msg: JsonRpcRequest): Promise<JsonRpcRequest | JsonRpcResponse>; // return a response to short-circuit
  onResponse?(ctx: Ctx, req: JsonRpcRequest, res: JsonRpcResponse): Promise<JsonRpcResponse>;
}
```

Order: `LockInterceptor` → `PolicyInterceptor` → `RateLimitInterceptor` → *(forward upstream)* → `RedactInterceptor` → `AuditInterceptor`.

`AuditInterceptor` also wraps the whole pipeline so denials and errors are logged. **Every request produces exactly one audit entry**, including denied, timed-out, and crashed ones.

### 4.1 Denial semantics
- `tools/call` denied: return a normal JSON-RPC **result** with `isError: true` and a text block (`"Blocked by policy: <reason>"`). The model sees it and can adapt. Do not use a JSON-RPC error here.
- Call to a tool hidden from `tools/list` (or nonexistent): JSON-RPC error `-32602`.
- Rate limited: result with `isError: true`, text includes retry-after seconds.
- Lock violation: tool is removed from `tools/list`, calls return `isError: true`, and a loud stderr warning is emitted.

### 4.2 Timeouts
Per-call timeout (default 60 s, per-server override). On timeout: send `notifications/cancelled` upstream, return `isError` result, log `outcome: "timeout"`.

## 5. Tool pinning (`mcp-pordego.lock`)

Defends against tool-description changes after approval ("rug pull") and tool shadowing.

```json
{
  "version": 1,
  "servers": {
    "github": {
      "fingerprint": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github@1.2.3"] },
      "tools": {
        "create_issue": { "hash": "sha256:9f2c…", "approved_at": "2026-11-12T10:00:00Z" }
      }
    }
  }
}
```

- `hash` = SHA-256 of JCS-canonicalized `{name, description, inputSchema, annotations}`.
- On `tools/list`: new tool not in lock → hidden by default (`lock.on_new_tool: hide | allow | warn`); changed hash → hidden and error logged with a unified diff of the description.
- `mcp-pordego lock` writes/updates the lockfile interactively (shows diffs, asks y/N per change; `--yes` for CI).
- Lockfile is committed to the repo.
- Cross-server collisions: if two servers expose the same un-namespaced tool name, the scanner flags it (shadowing).

## 6. Policy engine

### 6.1 Config schema (`mcp-pordego.yaml`)

```yaml
version: 1

defaults:
  action: deny              # allow | deny. Applied when no rule matches.
  timeout_ms: 60000
  unknown_methods: deny

servers:
  <name>:
    # stdio upstream
    command: string
    args: [string]
    env: { KEY: "${env:VAR}" }      # explicit only; no ambient env
    cwd: string
    # or HTTP upstream
    url: string
    headers: { Authorization: "Bearer ${env:TOKEN}" }
    allow_sampling: false
    timeout_ms: 60000

rules:
  - id: string                        # required, unique. Appears in audit log.
    match:
      server: string | [string]       # globs allowed
      tool: string | [string]         # globs allowed
      method: string | [string]       # default: tools/call
    when:                             # all conditions must hold (AND)
      - { arg: "path", glob: "..." }
      - { arg: "path", not_glob: ["..."] }
      - { arg: "query", regex: "..." }
      - { arg: "query", not_regex: "..." }
      - { arg: "mode", in: ["read", "list"] }
      - { arg: "body", max_len: 10000 }
      - { arg: "url", host_in: ["api.github.com"] }
      - { arg: "limit", lte: 100 }
    action: allow | deny
    reason: string
    limits:
      calls_per_minute: 30
      calls_per_session: 500
      concurrent: 4

redaction:
  responses: { enabled: true, detectors: [default], custom: [] }
  requests:  { enabled: false }
  on_detect: redact              # redact | block

audit:
  path: ~/.mcp-pordego/audit.jsonl
  record_bodies: false           # true required for replay
  args_mode: full                # full | hash_only
  rotate_mb: 100

lock:
  path: ./mcp-pordego.lock
  on_new_tool: hide
  on_changed_tool: hide
```

Variables: `${cwd}`, `${home}`, `${env:NAME}`. Unset env var = startup error.

### 6.2 Evaluation semantics
1. Collect rules whose `match` matches the request.
2. Evaluate in file order. **First rule whose `when` conditions all pass wins.** A rule whose `match` fits but `when` fails is skipped (falls through).
3. If none wins, apply `defaults.action`.
4. `arg` is a dot path into `params.arguments` (`"options.path"`). Missing arg: `glob`, `regex`, `in`, `host_in`, `lte`, `max_len` fail; `not_glob`, `not_regex` pass.
5. **Path normalization before glob matching:** resolve `..`, `.`, symlinks (`fs.realpath` when the file exists; otherwise normalize lexically), collapse duplicate slashes, and expand `~`. Reject args containing NUL bytes. This is the single most important correctness detail; test traversal attempts heavily.
6. `host_in`: parse with `URL`; compare the hostname exactly (or `*.example.com` suffix). Reject credentials in URLs and non-http(s) schemes.
7. Policy is compiled at startup into a matcher index keyed by `(server, tool)`. Hot reload on SIGHUP and file change; a failed reload keeps the old policy and logs an error.
8. `mcp-pordego policy test --tool fs__read_file --args '{"path":"/etc/passwd"}'` prints the decision and matching rule. This is a core DX feature; build it early.

### 6.3 Rate limiting
In-memory token bucket per `(rule.id, session)` for `calls_per_minute`; counters for `calls_per_session` and `concurrent`. No persistence in v1.

## 7. Redaction

### 7.1 Scope
Applied recursively to: `content[].text` blocks, `structuredContent` (every string value, and keys are left alone), `resource.text`, `prompts/get` message text. Image/binary blocks pass through untouched (noted as a limitation). Request redaction (when enabled) applies to `arguments` string values.

### 7.2 Built-in detectors (`default` set)

| ID | Method |
|---|---|
| `aws_access_key` | `\b(AKIA\|ASIA)[A-Z0-9]{16}\b` |
| `aws_secret_key` | 40-char base64 adjacent to an `aws_secret` keyword |
| `github_token` | `\bgh[pousr]_[A-Za-z0-9]{36,}\b`, `github_pat_[A-Za-z0-9_]{50,}` |
| `slack_token` | `\bxox[baprs]-[A-Za-z0-9-]{10,}\b` |
| `stripe_key` | `\b(sk\|rk)_(live\|test)_[A-Za-z0-9]{20,}\b` |
| `openai_key` / `anthropic_key` | `\bsk-[A-Za-z0-9_-]{20,}\b`, `\bsk-ant-[A-Za-z0-9_-]{20,}\b` |
| `google_api_key` | `\bAIza[0-9A-Za-z_-]{35}\b` |
| `jwt` | three base64url segments, first decodes to JSON with `alg` |
| `private_key` | `-----BEGIN [A-Z ]*PRIVATE KEY-----` through `END`, multiline |
| `bearer_header` | `(?i)authorization:\s*bearer\s+\S+` |
| `db_url_password` | `\b[a-z][a-z0-9+.-]*://[^:\s/]+:([^@\s]+)@` (redact the password group only) |
| `email` | conservative RFC-lite regex (off by default; in `pii` set) |
| `credit_card` | 13-19 digits + Luhn (in `pii` set) |
| `high_entropy` | tokens ≥ 24 chars, Shannon entropy > 4.0 bits/char, near keywords `key\|token\|secret\|password` (off by default) |

Replacement: `[REDACTED:<detector_id>]`. Redact only the sensitive group where applicable (e.g. the password, not the whole URL).

### 7.3 Rules for detector contributors
- Anchor patterns; avoid catastrophic backtracking. Run every regex under a 5 ms budget in tests (use `safe-regex` or an RE2 binding).
- Each detector ships with ≥10 positive and ≥10 negative fixtures (including look-alikes).
- Performance: response bodies > 1 MB are scanned in 64 KB overlapping windows (overlap ≥ 4 KB so tokens straddling a boundary are caught).

### 7.4 `on_detect: block`
Instead of redacting, replace the entire response with an `isError` result: `"Response blocked: contained <detector_id>"`. Log the detector IDs, never the matched values.

## 8. Audit log

### 8.1 Format
JSONL, one entry per request, append-only, `fsync` batching every 100 ms or 50 entries (configurable; `--sync` for per-entry).

```json
{
  "v": 1,
  "seq": 1042,
  "ts": "2026-11-12T10:15:03.221Z",
  "session": "a1b2c3",
  "client": { "name": "claude-code", "version": "2.1.0" },
  "server": "github",
  "method": "tools/call",
  "tool": "list_issues",
  "args": { "repo": "acme/api" },
  "args_hash": "sha256:…",
  "decision": { "action": "allow", "rule": "gh-read" },
  "outcome": "ok",
  "is_error": false,
  "result_hash": "sha256:…",
  "result_bytes": 4821,
  "redactions": [{ "detector": "github_token", "count": 1 }],
  "latency_ms": 312,
  "prev_hash": "sha256:…",
  "hash": "sha256:…"
}
```

- `outcome`: `ok | denied | rate_limited | locked | timeout | upstream_error | blocked`.
- `args_hash` / `result_hash`: SHA-256 of JCS-canonical JSON. `result_hash` is computed on the **post-redaction** result (what the agent saw).
- Hash chain: `hash = sha256(prev_hash + JCS(entry without hash))`. First entry's `prev_hash` is 64 zeros. On rotation, the new file's first `prev_hash` = last hash of the previous file.
- `args_mode: hash_only` omits `args` (for sensitive environments).
- Redaction events log detector IDs and counts, **never** matched values.

### 8.2 Bodies (for replay)
When `record_bodies: true`, write full request and **pre-redaction** and post-redaction results to a sidecar: `audit-bodies/<session>.jsonl`, with the audit entry referencing `body_ref: {file, offset}`. Pre-redaction bodies contain secrets; the sidecar is created mode `0600` and the CLI warns on first enable. Offer `bodies_store: redacted_only` as the safer setting.

### 8.3 Verification
`mcp-pordego log verify [--file path]` walks the chain; reports the first broken `seq`. Exit code 0 ok, 2 tampered. Note in docs: the chain detects edits and truncation of the middle, but not truncation of the tail unless the latest hash is anchored externally (`log anchor` prints the head hash for the user to store elsewhere).

## 9. Replay

Requires `record_bodies: true`. Sessions are identified by `session` ID.

### 9.1 `replay mock`
Gateway serves recorded results instead of contacting upstreams. A live agent (or a test harness) connects as usual.
- Match key: `(server, tool, args_hash)`.
- Multiple recorded matches: return in recorded order (cyclic after exhausted if `--loop`, else error).
- No match: `--on-miss error | passthrough | fail` (default `fail`: result `isError`, exit non-zero at session end, and report the unmatched call).
- `tools/list` is served from the recording to freeze the tool surface.
- Output: end-of-session report of calls matched, missed, and calls recorded but never made (the agent's behavior drift).
- Use case: CI agent regression: "given these tool results, did the agent still do X?"

### 9.2 `replay verify`
Re-issues every recorded `tools/call` to live upstreams in recorded order, through the normal pipeline (policy still applies), and diffs the results against the recording.
- Diff: structural JSON diff on `structuredContent`; normalized text diff on text blocks. `--ignore` JSONPath list for volatile fields (timestamps, IDs).
- Exit 0 if all identical, 1 if differences, 2 on errors.
- Warn loudly before replaying calls that look mutating (tool annotation `readOnlyHint != true`); require `--allow-writes` to proceed.

## 10. Scanner (`mcp-pordego scan`)

Static analysis plus optional live inspection of MCP configs.

### 10.1 Config discovery
Read-only. Locations (macOS/Linux/Windows variants):
- Claude Desktop: `claude_desktop_config.json`
- Claude Code: `.mcp.json` (project), `~/.claude.json`
- Cursor: `.cursor/mcp.json`, `~/.cursor/mcp.json`
- VS Code: `.vscode/mcp.json`
- Explicit: `mcp-pordego scan --config path` or `--server "<command>"`.

### 10.2 Static checks (config only)

| Rule ID | Severity | Check |
|---|---|---|
| `unpinned-npx` | high | `npx` package without exact version, or `@latest` |
| `unpinned-uvx` | high | `uvx` / `pipx run` without `==version` |
| `unpinned-docker` | high | image with `:latest` or no tag, no digest |
| `unpinned-git` | high | git URL without commit SHA |
| `inline-secret` | high | secret-looking value in `env`/`args`/`headers` (reuse redaction detectors) |
| `remote-http-no-tls` | high | `http://` URL to non-loopback host |
| `broad-fs-root` | medium | filesystem server rooted at `/`, `~`, or home |
| `shell-server` | medium | server whose name/package suggests shell/exec capability |

### 10.3 Live checks (`--live`)
Spawns each server, calls `initialize` and `tools/list` (never `tools/call`), then:

| Rule ID | Severity | Check |
|---|---|---|
| `desc-injection-phrases` | high | Phrases like "ignore previous", "do not tell the user", "before using this tool, read…", "send … to http" |
| `desc-hidden-chars` | high | Zero-width characters, Unicode tag block (U+E0000-E007F), bidi overrides, in name/description/schema |
| `desc-markup-hidden` | medium | HTML comments, `<important>`-style tags, large base64 blobs in descriptions |
| `desc-cross-tool-ref` | medium | Description of tool A instructs behavior involving tool B |
| `desc-exfil-url` | high | URLs in descriptions or schema defaults |
| `schema-freeform-exec` | high | Args named `command`, `cmd`, `script`, `code`, `sql`, `eval` typed as unconstrained string |
| `schema-freeform-path` | medium | `path`/`file`/`dir` args with no `pattern`/`enum` |
| `schema-freeform-url` | medium | `url` args with no `format`/`pattern` |
| `no-readonly-hint` | low | Tools missing `annotations.readOnlyHint` |
| `tool-name-collision` | medium | Same tool name on multiple servers |
| `desc-oversized` | low | Description > 2000 chars |

Detection is heuristic. Rules are plain TypeScript modules exporting `{ id, severity, check(serverInfo, tools) → Finding[] }` so contributors can add one in a single file with fixtures.

### 10.4 Output
- `--format text` (default, grouped by server, colored)
- `--format json`
- `--format sarif` (GitHub code scanning)
- `--fail-on high|medium|low` (default `high`); exit 1 on findings at/above threshold.
- `--baseline file` to suppress accepted findings by `(rule, server, tool)`.

## 11. CLI reference

```
mcp-pordego scan      [--config P] [--live] [--format F] [--fail-on S] [--baseline F]
mcp-pordego init      [--from-discovered]            # generate starter mcp-pordego.yaml
mcp-pordego run       [--policy P] -- <cmd> [args]   # wrap one stdio server
mcp-pordego serve     [--policy P] [--http HOST:PORT] [--token T]
mcp-pordego lock      [--yes] [--check]              # --check exits 1 if lock is stale (CI)
mcp-pordego policy test --tool T --args JSON [--server S]
mcp-pordego policy validate
mcp-pordego log       tail | verify | export | anchor
mcp-pordego replay    mock | verify --session ID
```

Global: `--config`, `--log-level`, `--no-color`. Exit codes: 0 ok, 1 findings/diffs, 2 integrity/config error.

## 12. Repo layout

```
mcp-pordego/
├─ packages/
│  ├─ core/
│  │  ├─ transport/{stdio,http}.ts      # downstream + upstream adapters
│  │  ├─ router.ts                      # id remap, namespacing, fan-out
│  │  ├─ pipeline.ts                    # interceptor chain
│  │  ├─ gateway.ts                     # wiring
│  │  └─ session.ts
│  ├─ policy/{schema.json,parse.ts,compile.ts,eval.ts,paths.ts,ratelimit.ts}
│  ├─ redact/{detectors/*.ts,redactor.ts,walk.ts}
│  ├─ audit/{logger.ts,chain.ts,verify.ts,bodies.ts}
│  ├─ lock/{hash.ts,lockfile.ts,diff.ts}
│  ├─ replay/{record.ts,mock.ts,verify.ts,diff.ts}
│  ├─ scan/{discover.ts,rules/static/*.ts,rules/live/*.ts,report/*.ts}
│  └─ cli/{index.ts,commands/*.ts}
├─ fixtures/
│  ├─ servers/{echo,fs-lite,slow,crashy,chatty,big-response}.ts
│  └─ malicious/{injection,hidden-chars,rug-pull,shadow}.ts
├─ docs/
├─ README.md  SPEC.md  CONTRIBUTING.md  SECURITY.md  LICENSE
└─ .github/workflows/{ci.yml,release.yml}
```

## 13. Testing

1. **Unit:** policy evaluator (table-driven, ≥200 cases), path normalization (traversal, symlink, `..%2f`, NUL, Unicode normalization), every detector, JCS hashing, hash chain.
2. **Integration:** spin up fixture upstreams and a real SDK `Client` through the gateway in-process. Assert tool lists, filtering, namespacing, denial shape, redaction, one-audit-entry-per-request.
3. **Protocol conformance:** run the official MCP SDK client test flows against the gateway (initialize, pagination, cancellation, progress, list_changed, session resume on HTTP).
4. **Adversarial fixtures:** `rug-pull.ts` changes its tool description after the first `tools/list`; `injection.ts` and `hidden-chars.ts` for the scanner; `chatty.ts` floods stderr and stdout noise; `crashy.ts` exits mid-call; `slow.ts` exceeds the timeout; `big-response.ts` returns 50 MB.
5. **Fuzz:** `fast-check` property tests on the redactor (never throws, idempotent, output contains no original match) and on JSON-RPC framing (partial chunks, multiple messages per chunk, CRLF).
6. **Replay golden tests:** record a session from fixtures, replay in mock mode, assert byte-identical results.
7. **Perf:** benchmark gateway overhead with `echo` server; CI fails if p50 added latency > 5 ms at 100 rps.
8. **CI matrix:** Node 20/22 × Linux/macOS/Windows (stdio spawning differs on Windows: use `cross-spawn`).

## 14. Threat model

**Defends against**
- Agent calling tools or arguments the user never intended (policy).
- Secrets in tool output entering model context (redaction, best-effort).
- Tool definitions changing after approval (lockfile).
- Malicious tool descriptions in already-installed servers (scanner, heuristic).
- Silent actions with no record (audit).
- Server-initiated sampling used as an injection channel (denied by default).
- DNS rebinding to a local HTTP gateway (Origin check, loopback bind).

**Does not defend against**
- A malicious or compromised upstream server's runtime behavior beyond its MCP surface (no sandbox).
- Agents using non-MCP capabilities (shell, browser).
- Redaction misses; encoded or transformed secrets.
- Laundering sensitive content through allowed tools (no taint tracking).
- A local user with write access to the audit file and the ability to rewrite the whole chain (anchor the head hash externally).
- Prompt injection in *results* from allowed tools. Redaction doesn't touch it; the scanner only covers descriptions.

Document these in `SECURITY.md`. Overclaiming kills trust faster than missing features.

## 15. Build plan (3 weeks, 2 engineers)

**Week 1: Core proxy**
- Stdio transport both sides, JSON-RPC framing, `run` mode, pass-through with zero policy.
- Router + namespacing + ID remap for `serve` mode.
- Audit logger (no hash chain yet), CLI skeleton.
- Exit criterion: Claude Code and Cursor work through `run` against two real servers, no behavior change.

**Week 2: Control**
- Policy parser, compiler, evaluator, path normalization, `policy test`.
- Rate limiting, timeouts, denial semantics.
- Redaction with default detectors.
- Hash chain + `log verify`.
- Lockfile + `lock` command.
- Streamable HTTP downstream.

**Week 3: Differentiators + ship**
- Scanner (static first, live second) with SARIF output. **Ship this to the public first**, before the gateway is announced.
- Replay `mock` then `verify`.
- Docs, `init` command, example policies for the top 5 public MCP servers, release workflow.

**Cut order if time slips:** `replay verify` → HTTP upstream → `high_entropy` detector → `--baseline`. Never cut path normalization tests or the lockfile.

## 16. Open questions

1. Should `serve` aggregation hide the upstream name entirely behind policy-defined aliases? Namespacing leaks server names to the model, which is usually fine.
2. Human approval (`action: approve`) via TTY prompt: v1.1. Needs a side channel since stdio is occupied; likely a local socket plus `mcp-pordego approve` CLI.
3. Stateful servers: replay mock can't model them. Document it; consider per-server `replay: stateless` flags.
4. Name, org, and npm package availability: check before the first public commit.
5. Before building, search GitHub and npm for existing MCP gateways and proxies. Differentiate on policy ergonomics, lockfile, scanner, and replay, not on the proxy itself.
