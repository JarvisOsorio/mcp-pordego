# Contributing

## Scanner rules

Each rule is a TypeScript module exporting `{ id, severity, check(...) → Finding[] }`.

- Static rules: `packages/scan/src/rules/static/`
- Live rules: `packages/scan/src/rules/live/`
- Register in the package `index.ts`
- Add positive and negative fixtures/tests

## Detectors

Redaction / inline-secret detectors live in `packages/redact/src/detectors/`. Anchor patterns, avoid catastrophic backtracking, and never log matched secret values.

## Dev loop

```bash
pnpm install
pnpm build
pnpm test
```

## Pull requests

- Keep the scanner usable alone (`mcp-pordego scan` must work without gateway packages).
- No secrets in the repo.
- Apache-2.0 for contributions.
