#!/usr/bin/env node
// Parse every book page with the same Quarto Markdown reader used by the
// full build, without rendering HTML or writing generated files.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const summaryPath = join(root, "SUMMARY.md");

const usage = () => {
  console.log(`Usage: node scripts/preflight.mjs [options] [page.md ...]

Parse every SUMMARY.md page by default. Passing one or more Markdown paths limits
the check to those pages, which is useful when investigating a failure.

Options:
  --quarto PATH    Use this Quarto executable
  --workers N      Run at most N parser processes concurrently
  --help           Show this help`);
};

const options = { paths: [] };
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--help" || arg === "-h") {
    usage();
    process.exit(0);
  }
  if (arg === "--quarto") {
    options.quarto = args[++index];
    continue;
  }
  if (arg === "--workers") {
    options.workers = args[++index];
    continue;
  }
  if (arg.startsWith("--")) {
    console.error(`preflight: unknown option '${arg}'`);
    process.exit(2);
  }
  options.paths.push(arg);
}

const summary = readFileSync(summaryPath, "utf8");
const summaryPaths = [
  ...summary.matchAll(/^\[[^\]]+\]\(([^)#]+\.md)\)\s*$/gm),
  ...summary.matchAll(/^\s*-\s+\[[^\]]+\]\(([^)#]+\.md)\)\s*$/gm),
].map((match) => match[1]);
const requestedPaths = options.paths.length ? options.paths : [...new Set(summaryPaths)];

const pagePath = (value) => {
  const absolute = isAbsolute(value) ? value : join(root, value);
  return { absolute: resolve(absolute), display: relative(root, absolute) || value };
};

const pages = requestedPaths.map(pagePath);
const invalidPages = pages.filter(({ absolute }) => !existsSync(absolute));
if (invalidPages.length) {
  console.error("preflight: missing Markdown page(s):");
  for (const page of invalidPages) console.error(`  - ${page.display}`);
  process.exit(1);
}

const quarto = options.quarto || process.env.QUARTO_BIN || execFileSync(
  "bash",
  [join(root, "scripts/ensure-quarto.sh")],
  { cwd: root, encoding: "utf8" },
).trim();
const quartoBinary = realpathSync(quarto);
const quartoRoot = dirname(dirname(quartoBinary));
const quartoShare = join(quartoRoot, "share");
const reader = join(quartoShare, "filters", "qmd-reader.lua");
const dataDir = join(quartoShare, "pandoc", "datadir");
const toolArchitecture = process.arch === "arm64" ? "aarch64" : "x86_64";
const pandocCandidates = [
  process.env.QUARTO_PANDOC,
  join(quartoRoot, "bin", "tools", toolArchitecture, "pandoc"),
  join(quartoRoot, "bin", "tools", "pandoc"),
].filter(Boolean);
const pandoc = pandocCandidates.find((candidate) => existsSync(candidate));

if (!existsSync(reader) || !existsSync(dataDir) || !pandoc) {
  console.error("preflight: could not locate Quarto's bundled Pandoc reader");
  console.error(`  Quarto: ${quartoBinary}`);
  console.error(`  Reader: ${reader}`);
  console.error(`  Data dir: ${dataDir}`);
  console.error(`  Pandoc candidates: ${pandocCandidates.join(", ")}`);
  process.exit(1);
}

const environment = {
  ...process.env,
  QUARTO_SHARE_PATH: quartoShare,
  QUARTO_PROJECT_DIR: root,
  // Quarto's init.lua expects this value even though the reader-only check has
  // no format-specific parameters.
  QUARTO_FILTER_PARAMS: Buffer.from("{}").toString("base64"),
};
const parserArgs = [
  "--from",
  reader,
  "--to",
  "native",
  "--data-dir",
  dataDir,
  "--quiet",
];

const configuredWorkers = Number(options.workers || process.env.PREFLIGHT_WORKERS || 2);
const workers = Math.max(1, Math.min(pages.length || 1, Number.isFinite(configuredWorkers) ? configuredWorkers : 2));
const failures = [];
let nextPage = 0;
let completed = 0;

const parsePage = (page) => new Promise((resolveResult) => {
  const child = spawn(pandoc, [...parserArgs, page.absolute], {
    cwd: root,
    env: environment,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.on("error", (error) => {
    resolveResult({ page, code: 1, error: error.message, stderr });
  });
  child.on("close", (code, signal) => {
    resolveResult({ page, code: code ?? 1, signal, stderr });
  });
});

const worker = async () => {
  while (nextPage < pages.length) {
    const page = pages[nextPage++];
    const result = await parsePage(page);
    completed += 1;
    if (result.code !== 0) {
      failures.push(result);
      console.error(`preflight: FAILED ${page.display}`);
    } else if (completed % 100 === 0 || completed === pages.length) {
      console.log(`preflight: parsed ${completed}/${pages.length} pages`);
    }
  }
};

console.log(`preflight: parsing ${pages.length} page(s) with ${workers} worker(s)`);
await Promise.all(Array.from({ length: workers }, worker));

if (failures.length) {
  failures.sort((left, right) => left.page.display.localeCompare(right.page.display));
  console.error(`preflight: ${failures.length} page(s) failed Quarto Markdown parsing:`);
  for (const failure of failures) {
    console.error(`\n--- ${failure.page.display} ---`);
    if (failure.signal) console.error(`terminated by ${failure.signal}`);
    if (failure.error) console.error(failure.error);
    if (failure.stderr.trim()) console.error(failure.stderr.trim());
  }
  process.exit(1);
}

console.log(`preflight: OK — all ${pages.length} page(s) parsed by Quarto's reader`);
