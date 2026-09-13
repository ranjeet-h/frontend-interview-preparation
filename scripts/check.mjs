#!/usr/bin/env node
// Fast integrity checks that do not render the book.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const fail = (message) => problems.push(message);
const read = (path) => readFileSync(join(root, path), "utf8");

const summary = read("SUMMARY.md");
const summaryPaths = [
  ...summary.matchAll(/^\[[^\]]+\]\(([^)#]+\.md)\)\s*$/gm),
  ...summary.matchAll(/^\s*-\s+\[[^\]]+\]\(([^)#]+\.md)\)\s*$/gm),
].map((match) => match[1]);
const listed = [...new Set(summaryPaths)];

const quarto = read("_quarto.yml");
const quartoPaths = [
  ...quarto.matchAll(/^\s+-\s+(?!part:)([^\s#]+\.md)\s*$/gm),
].map((match) => match[1]);
const quartoSet = new Set(quartoPaths);
const summarySet = new Set(listed);

if (!quarto.includes('author: "Ranjeet Harishchandre"')) {
  fail("_quarto.yml must identify Ranjeet Harishchandre as author");
}

for (const path of listed) {
  if (!existsSync(join(root, path))) fail(`SUMMARY.md lists missing file: ${path}`);
  if (!quartoSet.has(path)) fail(`_quarto.yml is missing SUMMARY page: ${path}`);
}
for (const path of quartoSet) {
  if (!summarySet.has(path)) fail(`_quarto.yml contains page absent from SUMMARY.md: ${path}`);
}
if (quartoPaths.length !== listed.length || quartoPaths.some((path, index) => path !== listed[index])) {
  fail("_quarto.yml chapter order does not match SUMMARY.md");
}

const referencedFiles = [
  "filters/mdbook-include.lua",
  "filters/mermaid.lua",
  "styles/theme.scss",
  "styles/custom.css",
  "assets/fonts/fonts.css",
  "assets/favicon.svg",
  "assets/js/page-tools.html",
  "assets/mermaid/mermaid.min.js",
  "assets/mermaid/mermaid-init.js",
  "assets/mermaid/mermaid.css",
  "_quarto-release.yml",
];
for (const path of referencedFiles) {
  if (!existsSync(join(root, path))) fail(`missing referenced file: ${path}`);
}

const resolveBookPath = (from, target) => {
  const clean = target.split("#", 1)[0].split("?", 1)[0];
  if (!clean) return null;
  const absolute = resolve(dirname(join(root, from)), clean);
  if (existsSync(absolute)) return absolute;
  return null;
};

const markdownLinks = (text) => {
  const links = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const marker = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (marker) {
      const current = { char: marker[2][0], length: marker[2].length };
      if (!fence) fence = current;
      else if (current.char === fence.char && current.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;

    const withoutInlineCode = line.replace(/`[^`\n]*`/g, "");
    for (const match of withoutInlineCode.matchAll(/(?<![\w`])\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
      links.push(match[1]);
    }
  }
  return links;
};

for (const page of listed) {
  const text = read(page);
  for (const target of markdownLinks(text)) {
    if (/^(https?:|mailto:|#|javascript:)/i.test(target)) continue;
    if (!resolveBookPath(page, target)) fail(`${page}: broken link -> ${target}`);
  }

  for (const match of text.matchAll(/\{\{#include\s+([^}]+)\}\}/g)) {
    const directive = match[1];
    const range = /^(.*?):(\d+):(\d+)$/.exec(directive);
    const includePath = range ? range[1] : directive;
    const candidate = resolveBookPath(page, includePath);
    const fallback = resolve(root, includePath.replace(/^(\.\.\/)+/, ""));
    const target = candidate || (existsSync(fallback) ? fallback : null);
    if (!target) {
      fail(`${page}: missing include -> ${directive}`);
    } else if (range) {
      const lineCount = readFileSync(target, "utf8").split(/\r?\n/).length;
      if (Number(range[2]) > lineCount) {
        fail(`${page}: include ends beyond ${relative(root, target)} line ${lineCount}: ${directive}`);
      }
    }
  }

  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const marker = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (!marker) continue;
    const current = { char: marker[2][0], length: marker[2].length };
    if (!fence) fence = current;
    else if (current.char === fence.char && current.length >= fence.length) fence = null;
  }
  if (fence !== null) fail(`${page}: unbalanced fenced code block`);
}

if (problems.length) {
  console.error(`book:check found ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`book:check OK — ${listed.length} Summary pages and all referenced assets checked.`);
