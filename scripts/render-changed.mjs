#!/usr/bin/env node
// Render only pages newer than their corresponding HTML output. A full build
// is still required after navigation, theme, or asset changes.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, "..");
const site = join(root, "_site");

if (!existsSync(join(site, "index.html"))) {
  console.error("render-changed: _site is missing; run `npm run build` first.");
  process.exit(1);
}

const summary = readFileSync(join(root, "SUMMARY.md"), "utf8");
const pages = [
  ...summary.matchAll(/^\[[^\]]+\]\(([^)#]+\.md)\)\s*$/gm),
  ...summary.matchAll(/^\s*-\s+\[[^\]]+\]\(([^)#]+\.md)\)\s*$/gm),
].map((match) => match[1]);
const uniquePages = [...new Set(pages)];

const htmlFor = (page) => join(site, page.replace(/\.md$/, ".html"));
const needsRender = (page) => {
  const source = join(root, page);
  const output = htmlFor(page);
  return existsSync(source) && (!existsSync(output) || statSync(source).mtimeMs > statSync(output).mtimeMs + 1);
};

const navFiles = ["SUMMARY.md", "_quarto.yml"];
const indexOutput = join(site, "index.html");
const navigationChanged = navFiles.some((file) => {
  const path = join(root, file);
  return existsSync(path) && statSync(path).mtimeMs > statSync(indexOutput).mtimeMs + 1;
});
if (navigationChanged) {
  console.warn("render-changed: navigation changed; run `npm run build` for a complete rebuild.");
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((path) => path.replace(/^\.\//, ""))
  : uniquePages.filter(needsRender);

if (!targets.length) {
  console.log("render-changed: nothing to do.");
  process.exit(0);
}

const quartoResult = spawnSync("bash", [join(root, "scripts/ensure-quarto.sh")], {
  cwd: root,
  encoding: "utf8",
});
if (quartoResult.status !== 0 || !quartoResult.stdout.trim()) {
  console.error(quartoResult.stderr || "render-changed: Quarto not found.");
  process.exit(1);
}
const quarto = quartoResult.stdout.trim().split(/\r?\n/).at(-1);

let completed = 0;
for (const page of targets) {
  const source = join(root, page);
  if (!existsSync(source) || !page.endsWith(".md")) {
    console.error(`render-changed: skipped missing/non-Markdown target ${page}`);
    process.exitCode = 1;
    continue;
  }

  const started = Date.now();
  const result = spawnSync(quarto, ["render", page, "--to", "html", "--output-dir", "_site", "--no-clean"], {
    cwd: root,
    stdio: "inherit",
  });
  rmSync(join(site, page.replace(/\.md$/, "_files")), { force: true, recursive: true });

  if (result.status !== 0) {
    console.error(`render-changed: failed ${page}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`render-changed: ${page} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  completed++;
}

console.log(`render-changed: updated ${completed}/${targets.length} page(s)`);
