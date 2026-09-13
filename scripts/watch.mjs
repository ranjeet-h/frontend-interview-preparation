#!/usr/bin/env node
// Debounced source watcher for incremental page rendering.

import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pending = new Set();
let timer = null;
let running = false;

const ignored = /^(?:\.git|\.quarto|_site|book|node_modules)(?:\/|$)/;
const classify = (value) => {
  const path = String(value || "").replaceAll("\\", "/");
  if (!path || ignored.test(path)) return;
  if (path === "SUMMARY.md" || path === "_quarto.yml" || path.startsWith("styles/") || path.startsWith("assets/") || path.startsWith("filters/")) {
    console.log(`[full build required] ${path}`);
    return;
  }
  if (path.endsWith(".md")) pending.add(path);
};

const flush = () => {
  if (running || !pending.size) return;
  running = true;
  const files = [...pending];
  pending.clear();
  const child = spawn(process.execPath, [join(root, "scripts/render-changed.mjs"), ...files], {
    cwd: root,
    stdio: "inherit",
  });
  child.on("exit", () => {
    running = false;
    if (pending.size) flush();
  });
};

const onEvent = (_event, filename) => {
  classify(filename);
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
};

watch(root, { recursive: true }, onEvent);
console.log("Watching Markdown sources. Run `npm run serve` in another terminal.");
