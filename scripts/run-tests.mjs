/**
 * Bundles tests/*.test.ts with esbuild (alias @ -> src) and runs them with
 * node's built-in test runner. No extra dependencies.
 *
 *   node scripts/run-tests.mjs
 */
import { build } from "esbuild";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(root, ".test-build");
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const filter = process.argv[2];
const entries = readdirSync(path.join(root, "tests"))
  .filter((f) => f.endsWith(".test.ts") && (!filter || f.includes(filter)))
  .map((f) => path.join(root, "tests", f));

await build({
  entryPoints: entries,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outdir,
  outExtension: { ".js": ".mjs" },
  alias: { "@": path.join(root, "src") },
  // Route handlers import next/server; keep Next itself external (ESM needs the .js path).
  plugins: [
    {
      name: "next-external",
      setup(b) {
        b.onResolve({ filter: /^next\// }, (args) => ({ path: args.path.endsWith(".js") ? args.path : `${args.path}.js`, external: true }));
      },
    },
  ],
  logLevel: "warning",
});

const files = readdirSync(outdir).filter((f) => f.endsWith(".mjs")).map((f) => path.join(outdir, f));
const res = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit", env: { ...process.env, HELIUS_API_KEY: "", ENABLE_HELIUS: "true", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" } });
rmSync(outdir, { recursive: true, force: true });
process.exit(res.status ?? 1);
