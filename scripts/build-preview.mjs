// Builds a single self-contained HTML file of the app (no Next runtime) for static hosting / sharing.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist");
mkdirSync(out, { recursive: true });

execFileSync(
  resolve(root, "node_modules/.bin/tailwindcss"),
  ["-i", "src/app/globals.css", "-o", "dist/app.css", "--minify"],
  { cwd: root, stdio: "inherit" },
);

const result = await build({
  entryPoints: [resolve(root, "preview/main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  write: false,
  alias: { "@": resolve(root, "src") },
  define: {
    "process.env.XRAY_STATIC_PREVIEW": JSON.stringify("1"), "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

const js = result.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
const css = readFileSync(resolve(out, "app.css"), "utf8");

const html = `<title>ONCHAIN X-RAY</title>
<meta name="color-scheme" content="dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Syncopate:wght@400;700&display=swap">
<style>${css}
html,body{height:100%}#xray-root{height:100%}</style>
<div id="xray-root"></div>
<script>${js}</script>
`;
writeFileSync(resolve(out, "onchain-xray.html"), html);
console.log(`dist/onchain-xray.html ${(html.length / 1024).toFixed(0)} KB`);
