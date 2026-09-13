#!/usr/bin/env node
// Quarto indexes headings individually. Group records by chapter so the
// client-side search index stays small enough for fast first interaction.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = join(root, "_site", "search.json");
const records = JSON.parse(await readFile(indexPath, "utf8"));

if (!Array.isArray(records)) {
  throw new Error("compact-search: expected Quarto search.json to be an array");
}

const pages = new Map();
for (const record of records) {
  const href = String(record.href || "").split("#", 1)[0];
  if (!href) continue;

  if (!pages.has(href)) {
    pages.set(href, {
      objectID: href,
      href,
      title: record.title || href,
      section: "",
      text: "",
      crumbs: record.crumbs || [],
      sections: new Set(),
    });
  }

  const page = pages.get(href);
  if (record.section) page.sections.add(record.section);
  if (record.text) page.text += `${page.text ? "\n" : ""}${record.text}`;
}

const compact = [...pages.values()].map(({ sections, ...page }) => ({
  ...page,
  section: [...sections].join(" "),
}));

await writeFile(indexPath, `${JSON.stringify(compact)}\n`);
console.log(`compact-search: ${records.length} records -> ${compact.length} chapter records`);
