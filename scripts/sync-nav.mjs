#!/usr/bin/env node
// Generate Quarto's book.chapters tree from SUMMARY.md.
//
// SUMMARY.md remains the human-edited navigation source. It contains Markdown
// heading groups and indentation-based nested links; Quarto's book schema
// supports one part level, so this script preserves every page and its order
// while flattening deeper groups within their top-level section.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const summaryPath = join(root, "SUMMARY.md");
const quartoPath = join(root, "_quarto.yml");

const BEGIN = "# BEGIN-GENERATED-CHAPTERS";
const END = "# END-GENERATED-CHAPTERS";
const summary = readFileSync(summaryPath, "utf8");

const rootEntries = [];
const sections = [];
let section = null;
let stack = [];

const addNode = (node, depth) => {
  while (stack.length && stack.at(-1).depth >= depth) stack.pop();
  const parent = stack.at(-1);
  if (parent) parent.node.children.push(node);
  else if (section) section.children.push(node);
  else rootEntries.push(node);
  stack.push({ depth, node });
};

for (const line of summary.split(/\r?\n/)) {
  const heading = /^#\s+(.+?)\s*$/.exec(line);
  if (heading) {
    if (heading[1] === "Summary") continue;
    section = { title: heading[1], children: [] };
    sections.push(section);
    stack = [];
    continue;
  }

  const rootLink = /^\[([^\]]+)\]\(([^)]+\.md)\)\s*$/.exec(line);
  if (rootLink) {
    if (section) {
      throw new Error(`Unexpected root link after section heading: ${line}`);
    }
    rootEntries.push({ title: rootLink[1].trim(), path: rootLink[2].trim(), children: [] });
    continue;
  }

  const item = /^(\s*)-\s+\[([^\]]+)\]\(([^)]+\.md)\)\s*$/.exec(line);
  if (!item) continue;

  const indentation = item[1].replace(/\t/g, "  ").length;
  addNode(
    { title: item[2].trim(), path: item[3].trim(), children: [] },
    Math.floor(indentation / 2),
  );
}

if (!rootEntries.length && !sections.length) {
  throw new Error("No navigation entries found in SUMMARY.md");
}

const quote = (value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
const lines = [];
const flatten = (nodes) => nodes.flatMap((node) => [
  node.path,
  ...flatten(node.children),
]);

const emitPart = (title, nodes) => {
  lines.push(`    - part: ${quote(title)}`);
  lines.push("      chapters:");
  for (const path of flatten(nodes)) lines.push(`        - ${path}`);
};

for (const entry of rootEntries) {
  if (entry.children.length) {
    emitPart(entry.title, [entry]);
  } else {
    lines.push(`    - ${entry.path}`);
  }
}
for (const group of sections) {
  emitPart(group.title, group.children);
}

const quarto = readFileSync(quartoPath, "utf8");
const begin = quarto.indexOf(BEGIN);
const end = quarto.indexOf(END);
if (begin < 0 || end < begin) {
  throw new Error(`Missing ${BEGIN} / ${END} markers in _quarto.yml`);
}

const before = quarto.slice(0, begin + BEGIN.length);
const endLineStart = quarto.lastIndexOf("\n", end) + 1;
const after = quarto.slice(endLineStart);
writeFileSync(quartoPath, `${before}\n${lines.join("\n")}\n${after}`);

const count = (nodes) => nodes.reduce((total, node) => total + 1 + count(node.children), 0);
const total = count(rootEntries) + sections.reduce((sum, group) => sum + count(group.children), 0);
console.log(`sync-nav: wrote ${sections.length} sections / ${total} pages`);
