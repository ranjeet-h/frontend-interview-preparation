# Frontend Interview Preparation — Repository Guide

## Content contract

- Educational chapters remain Markdown files; do not convert them to `.qmd`.
- Preserve questions, examples, criteria, and source-faithful educational text. Do not make prose
  rewrites as part of build or theme work.
- `SUMMARY.md` is the ordered navigation source. New book pages must be linked there.
- The Quarto project root is the repository root, and the rendered site is `_site/`.
- The legacy `book/` directory is generated mdBook output and is not the deployment output.

## Required checks

Before describing a migration or content change as complete, run:

```bash
npm run book:check
node scripts/preflight.mjs
git diff --check
npm run build
```

For local release artifacts, run `npm run exports`. That command produces EPUB and Typst PDF files
locally; GitHub Pages deploys HTML only.

## Build and deployment rules

- Use the pinned Quarto version selected by `scripts/ensure-quarto.sh`.
- Keep generated `_site/`, `.quarto/`, and local export artifacts out of Git.
- Use `npm run dev` for a fast one-page visual preview; do not use it as a substitute for the full
  release build.
- Keep Mermaid source fences as plain Markdown and render them through `filters/mermaid.lua`.
- Use the mdBook include compatibility filter rather than rewriting educational source ranges.
- Do not introduce authentication as part of the Quarto migration.
- Do not commit migration work until the owner has reviewed the local rendering and GitHub Pages
  preview.
