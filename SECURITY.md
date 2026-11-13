# Security Policy

## What mcp-pordego defends against (scanner, v0.1)

- Unpinned MCP server installs (`npx @latest`, docker `:latest`, unpinned git)
- Secrets committed into MCP config `env` / `args` / `headers`
- Cleartext remote HTTP MCP endpoints
- Heuristic prompt-injection and hidden characters in tool descriptions (`--live`)
- Cross-server tool-name shadowing (`--live`)

## What it does not defend against

- Runtime behavior of a compromised upstream beyond its MCP surface
- Agent capabilities outside MCP (shell, browser)
- Novel or encoded secrets / injection that evade heuristics
- Anything after content reaches the model client

Gateway features (policy, lockfile, redaction, audit) are specified in `SPEC.md` and not yet enforced in v0.1.

## Reporting a vulnerability

Please open a private security advisory on GitHub, or email the maintainer listed on the GitHub profile. Do not file a public issue for undisclosed vulnerabilities.

Do not include real secrets in reports or fixtures — use obviously fake tokens that still match detector patterns.
