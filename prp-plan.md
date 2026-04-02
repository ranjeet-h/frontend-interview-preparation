# Full Stack Interview Study Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the scattered markdown interview notes into a single navigable mdBook called `Full Stack Interview Study Book`, with non deduplicated chapters, consistent memory-first formatting, and future diagram support.

**Architecture:** Build a fresh mdBook source tree under `src/` while keeping the existing root markdown files as the source archive. The book will use a small number of shared entry pages and many focused topic chapters, so each question lives in one canonical place instead of being repeated across files. A study-system chapter will document the 17-section chapter recipe, the interview principles that transfer to DSA and full-stack work, and the diagram conventions. The original source text will be preserved in a collapsible appendix and linked back to the canonical chapters. `mdbook-excalidraw` will be wired into `book.toml` so Mermaid-style diagrams can be added later without changing the book structure.

**Tech Stack:** mdBook, Markdown, Mermaid, `mdbook-excalidraw`, Rust/Cargo for plugin installation, Git.

## Source map

| Existing source | Planned mdBook home |
| --- | --- |
| `01-html-css-web-concepts.md` | Frontend fundamentals chapters for HTML, CSS, and web concepts |
| `02-javascript-theory-concepts.md` | JavaScript theory chapters |
| `03-javascript-coding-problems.md` | JavaScript coding chapters |
| `04-react-theory-concepts.md` | React theory chapters |
| `05-react-coding-challenges.md` | React coding chapters |
| `06-javascript-coding-DSA-problems.md` | DSA and algorithm practice chapters |
| `ops-tree-interview-qna.md` | Appendix unless later reclassified |
| `the-transformation-group.md` | Appendix unless later reclassified |

## Scope decisions

- The first mdBook version should reorganize the existing frontend-heavy content into a cleaner study path instead of inventing new backend material.
- Future full-stack sections should appear as navigation placeholders only until there is source content for them.
- The root markdown files stay in place during the migration so the new book can be validated without losing the original material.
- Use the actual filenames in the repo (`04-react-theory-concepts.md` and `05-react-coding-challenges.md`); the README numbering is stale.

## Proposed navigation

```text
src/SUMMARY.md
- [Full Stack Interview Study Book](index.md)
- [Study System](study-system.md)
- [Frontend Fundamentals](frontend/index.md)
  - [HTML](frontend/html/index.md)
  - [CSS](frontend/css/index.md)
  - [Web Concepts](frontend/web/index.md)
- [JavaScript](javascript/index.md)
  - [Theory](javascript/theory/index.md)
  - [Coding](javascript/coding/index.md)
- [React](react/index.md)
  - [Theory](react/theory/index.md)
  - [Coding](react/coding/index.md)
- [Full Stack Expansion](full-stack/index.md)
- [Appendix](appendix/original-sources.md)
```

### Task 1: Scaffold the mdBook

**Files:**
- Create: `book.toml`
- Create: `src/SUMMARY.md`
- Create: `src/index.md`
- Create: `src/full-stack/index.md`

- [ ] **Step 1: Write the book shell**

Create the mdBook config and landing page with the book title `Full Stack Interview Study Book`, then add the top-level navigation tree above.

```toml
[book]
title = "Full Stack Interview Study Book"
```

- [ ] **Step 2: Add the top-level chapter map**

Make `src/SUMMARY.md` the single navigation source of truth, with dedicated sections for the study system, frontend fundamentals, JavaScript, React, DSA, future full-stack expansion, and the appendix.

- [ ] **Step 3: Confirm the book builds**

Run: `mdbook build`

Expected: mdBook generates a `book/` output directory without missing-file or summary errors.

### Task 2: Write the shared study system chapter

**Files:**
- Create: `src/study-system.md`

- [ ] **Step 1: Encode the chapter recipe**

Document the approved 17-section order as the canonical pattern for every problem chapter:
Question, Idea to remember, Picture it, Say it back, Worked example, Invariant, Why this works, Closed-book drill, Common traps, Pattern transfer, Interview strategy, Memory-map Mermaid diagram, Quick self-check, Solution, Solution walkthrough, Original source in a collapsible appendix, One-sentence recap.

- [ ] **Step 2: Add the cross-topic principles**

Include the study rules that apply across HTML, CSS, JavaScript, React, and DSA: retrieval practice, self-explanation, worked examples, invariant-first reasoning, pattern transfer, and difficulty-aware walkthrough depth.

- [ ] **Step 3: Add DSA-specific transfer principles**

Explain the reusable problem-solving habits for algorithms and coding interviews: define the state, state the invariant, start with brute force, optimize only after the pattern is clear, and compare trade-offs explicitly.

- [ ] **Step 4: Add diagram guidance**

Explain how future chapters should use Mermaid or excalidraw-backed diagrams for memory maps, flow charts, and process sketches.

### Task 3: Build the frontend fundamentals section

**Files:**
- Create: `src/frontend/index.md`
- Create: `src/frontend/html/index.md`
- Create: `src/frontend/html/html5-features.md`
- Create: `src/frontend/html/document-structure.md`
- Create: `src/frontend/html/semantic-html.md`
- Create: `src/frontend/html/meta-tags.md`
- Create: `src/frontend/html/media-tags.md`
- Create: `src/frontend/css/index.md`
- Create: `src/frontend/css/box-model.md`
- Create: `src/frontend/css/specificity.md`
- Create: `src/frontend/css/layout-flexbox-grid.md`
- Create: `src/frontend/css/pseudo-classes-elements.md`
- Create: `src/frontend/css/positioning.md`
- Create: `src/frontend/web/index.md`
- Create: `src/frontend/web/core-web-vitals.md`
- Create: `src/frontend/web/performance-optimization.md`
- Create: `src/frontend/web/browser-storage.md`
- Create: `src/frontend/web/dom.md`
- Create: `src/frontend/web/security.md`
- Create: `src/frontend/web/design-patterns.md`
- Create: `src/frontend/web/rendering-patterns.md`

- [ ] **Step 1: Split the monolithic HTML/CSS/web material into focused chapters**

Turn `01-html-css-web-concepts.md` into smaller canonical chapters instead of one large page, so topics like semantic HTML, document structure, meta tags, media tags, box model, specificity, layout, positioning, DOM, storage, and security are easy to find.

- [ ] **Step 2: Remove repeated explanations from the main path**

Keep one canonical chapter per unique concept, then replace repeated content in related chapters with internal links back to the canonical page.

- [ ] **Step 3: Preserve the study flow**

Order the chapters from foundational to applied topics so the section reads like a guided study path, not a raw dump of interview questions.

### Task 4: Build the JavaScript and DSA sections

**Files:**
- Create: `src/javascript/index.md`
- Create: `src/javascript/theory/index.md`
- Create: `src/javascript/theory/core-concepts.md`
- Create: `src/javascript/theory/prototypes.md`
- Create: `src/javascript/theory/looping-and-iteration.md`
- Create: `src/javascript/theory/async-javascript.md`
- Create: `src/javascript/theory/es6-modern-features.md`
- Create: `src/javascript/theory/browser-dom-web-apis.md`
- Create: `src/javascript/theory/performance-and-memory.md`
- Create: `src/javascript/theory/design-patterns.md`
- Create: `src/javascript/theory/web-security.md`
- Create: `src/javascript/theory/modern-web-apis.md`
- Create: `src/javascript/theory/build-tools-environment-testing.md`
- Create: `src/javascript/theory/advanced-language-features.md`
- Create: `src/javascript/theory/typescript.md`
- Create: `src/javascript/theory/concurrency-and-parallelism.md`
- Create: `src/javascript/theory/code-architecture-best-practices.md`
- Create: `src/javascript/coding/index.md`
- Create: `src/javascript/coding/function-combinators.md`
- Create: `src/javascript/coding/collections-and-cloning.md`
- Create: `src/javascript/coding/async-control-flow.md`
- Create: `src/javascript/coding/browser-helpers.md`
- Create: `src/javascript/coding/runtime-and-serialization.md`
- Create: `src/dsa/index.md`
- Create: `src/dsa/array-patterns.md`
- Create: `src/dsa/string-patterns.md`
- Create: `src/dsa/object-patterns.md`
- Create: `src/dsa/async-patterns.md`
- Create: `src/dsa/interview-strategies.md`

- [ ] **Step 1: Migrate the JavaScript theory content**

Break `02-javascript-theory-concepts.md` into canonical theory chapters for core concepts, prototypes, looping, async JavaScript, ES6+, browser and web APIs, performance, security, TypeScript, concurrency, architecture, and related material.

- [ ] **Step 2: Migrate the coding problems into chapter pages**

Split `03-javascript-coding-problems.md` and `06-javascript-coding-DSA-problems.md` into one canonical chapter per question or tightly related question cluster, with the hardest pages getting longer walkthroughs and proof-style explanation.

- [ ] **Step 3: Deduplicate repeated questions**

Consolidate overlapping questions such as promises, closures, object helpers, memoization, event emitters, and async utilities into one canonical chapter each, then cross-link from every place that previously repeated them.

- [ ] **Step 4: Add DSA learning support**

Make the DSA chapters emphasize invariant tracking, edge-case handling, time/space complexity, and pattern recognition so they work for interview prep, not just memorization.

### Task 5: Build the React sections

**Files:**
- Create: `src/react/index.md`
- Create: `src/react/theory/index.md`
- Create: `src/react/theory/core-concepts.md`
- Create: `src/react/theory/hooks-deep-dive.md`
- Create: `src/react/theory/state-management.md`
- Create: `src/react/theory/performance-optimization.md`
- Create: `src/react/theory/component-architecture.md`
- Create: `src/react/theory/advanced-patterns.md`
- Create: `src/react/coding/index.md`
- Create: `src/react/coding/custom-hooks.md`
- Create: `src/react/coding/component-implementations.md`
- Create: `src/react/coding/performance-patterns.md`
- Create: `src/react/coding/state-and-data-flow.md`

- [ ] **Step 1: Migrate the React theory material**

Break `04-react-theory-concepts.md` into canonical pages for core React concepts, hooks, state management, performance, component architecture, and advanced patterns.

- [ ] **Step 2: Migrate the React coding challenges**

Break `05-react-coding-challenges.md` into reusable chapter pages for hooks, components, and performance-oriented patterns, keeping the benchmark memory-first structure.

- [ ] **Step 3: Remove duplicates across theory and coding**

If a React concept appears in both theory and coding form, keep the more complete canonical page and link to it instead of copying the full answer again.

### Task 6: Preserve the original source material

**Files:**
- Create: `src/appendix/original-sources.md`
- Create: `src/appendix/source-map.md`

- [ ] **Step 1: Preserve each original markdown source**

Keep the original source text in a collapsible appendix so the migration remains traceable and the old answers are still accessible for reference.

- [ ] **Step 2: Add a source-to-chapter index**

Document which canonical chapter each original file maps to so readers can move from the old flat layout to the new study path.

- [ ] **Step 3: Keep off-scope notes archived**

Leave `ops-tree-interview-qna.md` and `the-transformation-group.md` in the archive path unless they are later reclassified into the core book.

### Task 7: Wire `mdbook-excalidraw` and diagram support

**Files:**
- Modify: `book.toml`
- Modify: `theme/` files generated by `mdbook-excalidraw install`

- [ ] **Step 1: Add the preprocessor config**

Add the plugin block to `book.toml`:

```toml
[preprocessor.excalidraw]
command = "mdbook-excalidraw"

[output.html]
additional-js = ["mermaid.min.js", "mermaid-init.js", "theme/excalidraw.js"]
additional-css = ["theme/excalidraw.css"]
```

- [ ] **Step 2: Install the assets**

Run: `mdbook-excalidraw install`

Expected: the required theme assets are copied into the book and the HTML hooks are updated.

- [ ] **Step 3: Prove the diagram path**

Add one sample memory-map or flow diagram in a chapter so future pages can safely use the same pipeline.

### Task 8: Validate navigation, deduplication, and formatting

**Files:**
- Review: the full `src/` tree
- Review: `book.toml`
- Review: generated `book/` output

- [ ] **Step 1: Build the book**

Run: `mdbook build`

- [ ] **Step 2: Check the navigation**

Verify the summary tree is easy to scan, sections are grouped logically, and the future full-stack placeholders are visible but clearly unfinished.

- [ ] **Step 3: Check the chapter format**

Confirm migrated problem pages follow the 17-section order, with deeper walkthroughs for harder problems and shorter ones for easy chapters.

- [ ] **Step 4: Check duplication and appendix behavior**

Confirm repeated questions only exist once in the main study path and the original wording survives in the appendix.

## Definition of done

- The book has a working `book.toml` and `src/SUMMARY.md`.
- The book title is `Full Stack Interview Study Book`.
- The study-system chapter documents the 17-section recipe and the shared interview principles.
- The frontend, JavaScript, React, and DSA content is reorganized into canonical chapters with duplicates removed from the main path.
- The appendix preserves the original source material in a collapsed form.
- `mdbook-excalidraw` is configured so future diagrams can be added without changing the book structure.
- Future full-stack sections are present as placeholders only, not fake content.

## IMP
- Only mark done when all the existing content is migrated without any duplicates in the content.
