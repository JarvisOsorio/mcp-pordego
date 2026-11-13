import * as esbuild from "esbuild";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await esbuild.build({
  entryPoints: ["packages/cli/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/mcp-pordego.cjs",
  packages: "bundle",
  external: [],
  logLevel: "info",
});

const out = "dist/mcp-pordego.cjs";
const body = readFileSync(out, "utf8");
const withShebang = body.startsWith("#!") ? body : `#!/usr/bin/env node\n${body}`;
writeFileSync(out, withShebang);
chmodSync(out, 0o755);
console.log("bundled", out);
