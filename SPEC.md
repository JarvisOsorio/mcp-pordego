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

PLACEHOLDER_REPLACE_WITH_FULL
