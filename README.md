# Frontend Interview Preparation

An open-source, long-form study book for frontend and full-stack interviews. It combines guided
explanations, practical code examples, coding exercises, question banks, and system-design
practice in one navigable book.

The book is authored by **Ranjeet Harishchandre** and is published as a static Quarto Book on
[GitHub Pages](https://ranjeet-h.github.io/frontend-interview-preparation/).

## What is covered

- HTML, CSS, browser APIs, web performance, and security
- JavaScript fundamentals, asynchronous behavior, browser internals, coding problems, and output questions
- TypeScript concepts and interview questions
- React architecture, hooks, state, performance, testing, and coding challenges
- Next.js rendering, routing, server/client boundaries, and production concerns
- Backend APIs, Node.js, Express, FastAPI, Python, authentication concepts, and testing
- SQL, PostgreSQL, MySQL, MongoDB, SQLAlchemy, indexing, transactions, and data modeling
- Cloud, DevOps, queues, observability, WebSockets, and full-stack integration
- System-design foundations plus high-level and low-level interview designs
- AI and agent concepts

Start with the rendered [study book](https://ranjeet-h.github.io/frontend-interview-preparation/) or open
[`index.md`](index.md) locally.

## Local development

The repository uses [Quarto](https://quarto.org/) for rendering and keeps every chapter as
Markdown. Node.js is used only for the small build and verification scripts; the project has no
runtime package dependencies.

```bash
# Install the pinned project-local Quarto CLI when needed.
npm run book:install

# Verify navigation, links, includes, assets, and code fences.
npm run book:check

# Render the complete HTML book into _site/.
npm run build

# Review the last build at http://localhost:4200.
npm run serve
```

`npm run dev` renders only the home page into an ignored `.quarto-preview/` directory and serves it;
it does not trigger the 1,139-page build:

```bash
npm run dev
```

Open `http://localhost:4200/index.html`. To inspect another chapter, pass its Markdown path:

```bash
npm run dev -- full-stack/system-design/medium.md
```

Then open `http://localhost:4200/full-stack/system-design/medium.html`. Stop the server with
`Ctrl-C`. The page is a targeted visual check; links to chapters that were not rendered in this
preview will not be available until you run the full build.

For active editing, render one changed page without rebuilding the whole book:

```bash
npm run render:changed -- javascript/index.md
```

The mtime-based watcher can render changed Markdown pages automatically:

```bash
npm run watch
```

## EPUB and PDF exports

EPUB and PDF generation is intentionally local-only. The GitHub Pages deployment publishes HTML only;
large binary exports are not part of the static deployment.

```bash
npm run exports
```

The generated EPUB and Typst PDF are written to `_site/`. They are ignored by Git and can be
shared separately when needed.

## Repository layout

```text
.
├── _quarto.yml             # HTML book configuration
├── _quarto-release.yml     # Local EPUB/PDF profile
├── SUMMARY.md              # Ordered navigation source
├── index.md                # Book home page
├── frontend/               # Frontend fundamentals
├── javascript/             # JavaScript concepts and exercises
├── typescript/             # TypeScript track
├── react/                  # React track
├── nextjs/                 # Next.js track
├── full-stack/             # Backend, databases, cloud, and system design
├── dsa/                    # Data structures and algorithms
├── appendix/               # Source map and project notes
├── assets/                 # Self-hosted fonts, Mermaid, and page tools
├── filters/                # Quarto Lua filters for Markdown compatibility
├── styles/                 # Quarto theme and responsive reading styles
└── scripts/                # Build, export, serving, checking, and watch tools
```

The original source tree was under `src/`. It was moved to the Quarto project root so the rendered
paths remain unchanged: `frontend/html.html` still renders as `frontend/html.html`, just as it did
with mdBook.

## Content and navigation policy

`SUMMARY.md` is the human-edited source of truth for book order. Run `npm run book:sync-nav` after
changing it; the command updates only the generated chapter block in `_quarto.yml`.

Educational content is preserved as Markdown. Migration changes are limited to the structural
move required by Quarto, rendering-compatible blank lines around standalone horizontal rules, and
relative paths that must follow the move. The integrity checker and the migration comparison
workflow guard against accidental content loss.

## Deployment

The repository deploys automatically to GitHub Pages through
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) whenever `master`
changes. The workflow installs the pinned Quarto version, runs the same HTML build used locally,
and publishes `_site/` as the Pages artifact.

GitHub Pages must be enabled for the repository with **Settings → Pages → Source: GitHub Actions**.
EPUB and PDF files are intentionally not deployed; generate them locally with `npm run exports`.

## Contributing

1. Fork the repository and create a focused branch.
2. Add or improve a Markdown chapter and link new chapters from `SUMMARY.md`.
3. Keep examples accurate, runnable where applicable, and useful for interview preparation.
4. Run `npm run book:check`, `npm run build`, and `git diff --check`.
5. Open a pull request with a short explanation of the learner outcome.

Please preserve existing questions, examples, criteria, and source-faithful details when improving
an educational page.

## Author

**Ranjeet Harishchandre**
