# Quarto Study Book Migration Implementation Plan

> **For agentic workers:** Execute this plan inline in the current session. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit until the owner approves the rendered result and Vercel deployment.

**Goal:** Replace the mdBook build with a Quarto HTML book while preserving the existing chapter content, `.html` URLs, local study experience, and open-source deployment behavior.

**Architecture:** Move the existing `src/` content to the repository root so the Quarto project root is also the Vercel root and output paths remain unchanged. Keep `SUMMARY.md` as the navigation source of truth; generate Quarto’s `book.chapters` block from it. Use a Lua filter for Mermaid fences in `.md` files, self-hosted assets, and small Node/Bash scripts for builds, checks, exports, watching, rendering, and static serving.

**Tech Stack:** Quarto 1.10.18, Pandoc/Lua filters, Markdown, SCSS/CSS, Node.js 22+, Bash, Vercel CLI.

## Global Constraints

- Keep every educational source file as `.md`; do not rewrite educational prose or examples.
- Preserve the existing `book/` HTML paths as `_site/` paths with matching `.html` filenames.
- Preserve source bytes except for migration-required blank-line normalization around `---` and structural file moves.
- Do not add, modify, or deploy authentication in this migration; the book remains open source for this phase.
- Deploy HTML only on Vercel; EPUB and PDF are local-only exports.
- Keep the author as `Ranjeet Harishchandre` in Quarto metadata.
- Do not commit until content comparisons, checks, local builds, rendered browser states, and a Vercel preview pass.

## File map

- Create `_quarto.yml`, `_quarto-release.yml`, `filters/mermaid.lua`, `styles/theme.scss`, `styles/custom.css`, `assets/`, `scripts/`, `package.json`, `vercel.json`, `.vercelignore`, and `AGENTS.md`.
- Move `src/*` to the repository root, preserving paths and file contents.
- Preserve `SUMMARY.md` as the ordered source and generate only the marked chapter block in `_quarto.yml`.
- Update `README.md` with public-repository documentation and Quarto workflows.
- Do not touch the legacy root source files, CSV files, or authentication because they are outside this migration’s required content root/auth phase.

## Execution tasks

### Task 1: Preserve baseline and move the content root

- Record `git status`, the complete list and SHA-256 hashes of `HEAD:src/*`, the current Summary paths, and current generated URL paths.
- Move `src/*` to the repository root with `git mv` so history remains traceable.
- Insert only the required blank lines around standalone `---` separators in Markdown.
- Re-run a source-to-destination comparison and retain a machine-readable report for final verification.

### Task 2: Add Quarto configuration and navigation generation

- Add HTML-only `_quarto.yml` with author metadata, sidebar/search, CSS, fonts, page tools, Mermaid filter, and `_site` output.
- Add local `_quarto-release.yml` for EPUB and Typst PDF.
- Add `scripts/sync-nav.mjs` to parse `SUMMARY.md` indentation and rewrite the generated chapter block.
- Run navigation synchronization and verify all listed files exist.

### Task 3: Port runtime assets and theme

- Copy Quarto’s installed Mermaid runtime files into `assets/mermaid/`.
- Port the existing copy-page and Mermaid/diagram behavior into Quarto-compatible assets without changing chapter content.
- Add self-hosted fonts, theme SCSS, custom CSS, flashcard styling, tables, code-copy styling, dark-mode tokens, Mermaid sizing, focus states, and mobile sidebar/search fixes.

### Task 4: Add build, export, development, and integrity tooling

- Add pinned Quarto installation/selection scripts.
- Add HTML build, local EPUB/PDF export, preview, static serving, cleanup, watch, and changed-page rendering scripts.
- Add `scripts/check.mjs` for navigation/file coverage, internal Markdown links, assets, and balanced fences.
- Add package scripts for `dev`, `build`, `exports`, `serve`, `watch`, `render:changed`, `clean`, `book:install`, and `book:sync-nav`/`book:check`.

### Task 5: Configure Vercel and public documentation

- Replace the dashboard’s mdBook commands through root `vercel.json` with Quarto install/build/output settings and safe cache/security headers.
- Add root `.vercelignore` that excludes only generated/toolchain directories.
- Document public-repository structure, local commands, export behavior, content-preservation policy, deployment behavior, and the deferred auth phase in `README.md` and `AGENTS.md`.

### Task 6: Verify locally and on Vercel

- Run `node scripts/check.mjs`, `git diff --check`, source-preservation comparisons, `npm run build`, and `npm run exports`.
- Serve `_site` locally and inspect representative desktop, dark, mobile, Mermaid, search, table, flashcard, and copy-code states in a browser.
- Deploy a Vercel preview with the new build and verify representative `.html` URLs, assets, search, and no auth gate.
- Review the complete diff and leave all changes uncommitted for owner approval.
