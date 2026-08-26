# Rewrite Progress

Tracks migration from the old 12-section template (`One-line mental model`, `Engine Mechanism`, interview scripts) to the **Type A–E** study format.

Full writing rules live in [Study System](../study-system.md). Workers follow the canonical spec in `docs/superpowers/plans/2026-08-25-sequential-study-note-rewrite.md`.

## The five formats (quick reference)

| Type | Use for | Sections end with |
|---|---|---|
| **A** — Concept / theory | How something works (JS, React, HTTP, CSS) | Memory hook |
| **B** — Coding problem | Implement debounce, LRU, hooks | Memory hook |
| **C** — Output / predict | What does this code print? | Memory hook |
| **D** — System design | URL shortener, feed, chat at scale | Memory hook |
| **E** — Database / backend pattern | Indexes, ORMs, API patterns | Memory hook |

Every page opens with the **problem or pain**, not a definition. Plain language first; jargon after the idea clicks.

## Status by area

| Area | Status | Notes |
|---|---|---|
| [Study System](../study-system.md) | Done | Points to Type A–E spec |
| [Frontend fundamentals](../frontend/index.md) | Done | 18 topic pages + 2 question banks (in place, not split) |
| [System design guide](../full-stack/system-design/index.md) | Done | 15 foundations + 4 problem banks + prep |
| [Backend system design](../full-stack/backend/system-design/index.md) | Done | 30 Type D pages |
| [Node.js concepts](../full-stack/backend/nodejs/index.md) | Done | 30 Type A pages |
| JavaScript concepts | In progress | 27 / 55 Type A (`src/javascript/concepts/`) |
| React concepts | In progress | 45 / 66 Type A — core + refs done; 7 hooks done; 21 hook-advanced pages queued |
| MongoDB concepts | Queued | 35 pages — `src/full-stack/databases/mongodb/` |
| Mongoose concepts | Queued | 30 pages — `src/full-stack/backend/mongoose/` |
| MERN backend | Queued | 30 pages — `src/full-stack/backend/mern/` |
| Backend leaf pages (other) | Queued | Express, FastAPI, auth, APIs, Redis, … |
| Database leaf pages (other) | Queued | PostgreSQL, MySQL, SQLAlchemy, … |
| Legacy include chapters | Not migrated | `core-concepts.md`, `hooks.md`, DSA dumps — still `{{#include}}` from root files |
| Output question dumps | Not migrated | `output-questions-3.md` etc. — need per-puzzle treatment later |

## What “done” means

A page is done when it has:

- Correct Type A–E section order for its topic type
- Problem-first opening (no definition lead)
- Real code or queries where promised
- Full interview answers (not one-liner bullets or verbal scripts)
- Traps and comparisons that match the actual topic
- A sticky memory hook — not a restated definition

Forbidden leftovers: `Engine Mechanism`, `Senior Interview Playbook`, `Detailed explanation` + numbered old template.

## Question banks

These stay **one file each** — not split per question:

- [Frontend Questions](../frontend/question-banks.md) — 19 skill areas, full answers per section
- [Frontend Coding Questions](../frontend/coding-questions.md) — 14 problems, Format B each

Backend question banks follow the same in-place rule when rewritten.

## Tracker file

Live checklist: `docs/superpowers/plans/2026-08-25-one-topic-rewrite-tracker.md`  
Project root snapshot: [`REWRITE-PROGRESS.md`](../../REWRITE-PROGRESS.md)
