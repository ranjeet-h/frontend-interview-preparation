# Study Note Rewrite Progress

Living snapshot of the Type A–E migration. **Last updated:** 2026-08-25 (night).

Canonical rules: `docs/superpowers/plans/2026-08-25-sequential-study-note-rewrite.md`  
Detailed per-file checklist: `docs/superpowers/plans/2026-08-25-one-topic-rewrite-tracker.md`  
In-book summary: `src/appendix/rewrite-progress.md`

---

## At a glance

|| Metric | Count |
||---|---:|
|| **Type A** leaf pages (`## 1. Why This Exists`) | 170 |
|| **Type D** leaf pages (`## 1. Understand the Problem First`) | 30 |
|| **Type E** leaf pages (`## 1. The Real-World Problem`) | 31 |
|| **Condensed study banks** (system-design chapters, frontend banks) | 6 files |
|| **Total rewritten leaf pages** | **231** |
|| Still on **old template** (`One-line mental model` / `Engine Mechanism`) | ~722 |
|| **Next up** | JavaScript concepts (20 not yet committed), then MongoDB/Mongoose/MERN queues |

> Counts use automated heading markers. A page is "done" only when the full Type A–E section contract is satisfied — not just a heading swap.

### By section (verified)

|| Section | Done | Total leaf | Format | Status |
||---|---:|---:|---|---|
|| `src/study-system.md` | 1 | 1 | Wiring | ✅ |
|| `src/frontend/` (HTML, CSS, web) | 18 | 18 | Type A | ✅ |
|| `src/frontend/question-banks.md` | 1 | 1 | Study bank | ✅ |
|| `src/frontend/coding-questions.md` | 1 | 1 | Type B (14 problems) | ✅ |
|| `src/full-stack/system-design/foundations/` | 15 | 15 | Type A | ✅ |
|| `src/full-stack/system-design/` chapters | 5 | 5 | Type A / condensed Type D | ✅ |
|| `src/full-stack/backend/system-design/` | 30 | 30 | Type D (full) | ✅ |
|| `src/full-stack/backend/nodejs/` | 30 | 30 | Type A | ✅ |
|| `src/javascript/concepts/` | 37 | 56 | Type A | 🔄 66% |
|| `src/react/concepts/` | 45 | 66 | Type A | 🔄 68% |
|| `src/full-stack/databases/mongodb/` | 16 | 35 | Type E | 🔄 46% |
|| `src/full-stack/backend/mongoose/` | 15 | 30 | Type E | 🔄 50% |
|| `src/full-stack/backend/mern/` | 0 | 30 | Type E | ⏳ queued |

---

## ✅ Complete

### Wiring
- `src/study-system.md` — Type A–E recipe pointer

### Frontend fundamentals (`src/frontend/`) — 20 files
|| Area | Files | Notes |
||---|---:|---|
|| HTML | 5 | `html5-features` → `media-tags` |
|| CSS | 5 | `box-model` → `positioning` |
|| Web | 8 | `core-web-vitals` → `rendering-patterns` |
|| `question-banks.md` | 1 | 19 skill areas, full answers |
|| `coding-questions.md` | 1 | 14 problems, Format B |

### System design guide (`src/full-stack/system-design/`) — 22 files
|| Area | Files | Notes |
||---|---:|---|
|| `foundations/*.md` | 15 | Type A concept pages |
|| `concepts.md`, `index.md` | 2 | Index / navigation |
|| `preparation.md` | 1 | Type A study strategy |
|| `easy.md` | 1 | Q16–35, condensed Type D |
|| `medium.md` | 1 | Q36–70, condensed Type D |
|| `hard.md` | 1 | Q71–95, condensed Type D |
|| `specialist.md` | 1 | Q96–100, condensed Type D |

### Backend system design (`src/full-stack/backend/system-design/`) — 30/30
Full Type D pages: URL shortener, auth, payments, feeds, cache, notifications, etc.

### Node.js (`src/full-stack/backend/nodejs/`) — 30/30
Type A: V8, libuv, event loop, streams, cluster, worker threads, errors, env config.

---

## 🔄 In progress

### JavaScript concepts — 37 / 56 done

**Rewritten (Type A):**  
`memory-heap`, `execution-context`, `global-execution-context`, `function-execution-context`, `call-stack`, `lexical-environment`, `lexical-scoping`, `scope-chain`, `hoisting`, `temporal-dead-zone`, `closures`, `closure-memory-retention`, `closures-in-loops`, `closures-in-event-handlers`, `event-loop`, `microtask-queue`, `macrotask-queue`, `rendering-pipeline-interaction`, `promise-states`, `promise-chaining`, `async-await`, `timeout-handling`, `this-binding`, `primitive-vs-reference-values`, `shallow-copy-vs-deep-copy`, `array-mutation`, `type-coercion-and-equality`, `flatmap`, `private-fields`, `copying-array-methods`, `barrel-files`, `passive-listeners`, `custom-events`, `pointer-events`, `focus-and-blur`, `dom-event-propagation`, `indexeddb`

**In review / assigned (not counted done):**  
`storage-event`, `broadcast-channel`

**Still old template (17):**  
`debounce-and-throttle`, `browser-storage-token-risks`, `xss-csrf-cors-csp`, `garbage-collection-memory-leaks`, `dom-based-xss`, `open-redirects`, `layout-thrashing`, `detached-dom-nodes`, `heap-snapshots`, `history-api`, `file-api`, `clipboard-api`, `performance-api`, `query-string-parser`, `virtual-list-basics`, `custom-new`, `custom-instanceof`

### React concepts — 45 / 66 done

**Rewritten through core + refs + first 7 hooks:**  
All pages through `react-devtools.md`, plus `use-state`, `use-effect`, `use-context`, `use-ref`, `use-reducer`, `use-memo`, `use-callback`

**Still old template (21):**  
`use-layout-effect`, `use-imperative-handle`, `use-debug-value`, `custom-hooks`, `rules-of-hooks`, `hook-dependency-array`, `stale-closures`, `effect-cleanup-functions`, `avoiding-infinite-re-renders`, `lazy-initialization-use-state`, `functional-state-updates`, `referential-equality-stable-references`, `race-conditions-inside-effects`, `abort-controller-inside-effects`, `debouncing-with-hooks`, `throttling-with-hooks`, `use-previous`, `mounted-state-tracking`, `hook-comparisons`, `async-logic-inside-hooks`, `custom-hook-testing`

### MongoDB — 16 / 35 done

**Rewritten (Type E):**  
`what-is-mongodb`, `what-is-a-document`, `what-is-a-collection`, `sql-vs-nosql`, `what-is-limit`, `what-is-skip`, `what-is-sparse-index`, `what-is-text-index`, `what-is-ttl-index`, `what-is-bson`, `what-is-objectid`, `what-is-mongodb-indexing`, `what-is-compound-index`, `what-is-partial-index`, `what-is-aggregation-pipeline`, `what-is-match`

**Still old template (19):**  
Remaining MongoDB pages

### Mongoose — 15 / 30 done

**Rewritten (Type E):**  
`what-is-mongoose`, `what-is-a-schema`, `what-is-a-model`, `what-is-a-document`, `what-is-discriminator`, `why-use-lean`, `why-use-mongoose-with-mongodb`, `how-do-you-define-indexes-in-mongoose`, `what-are-schema-types`, `what-are-validators`, `what-are-custom-validators`, `what-are-middleware-hooks`, `what-are-virtuals`, `what-are-getters-and-setters`, `what-is-populate`

**Still old template (15):**  
Remaining Mongoose pages

---

## ⏳ Queued (not started)

### MERN — `src/full-stack/backend/mern/` (0 / 30)
Type E. All pages still on old template.

### Everything else (~700+ leaf pages)
Express, FastAPI, auth, APIs, Redis, PostgreSQL, MySQL, SQLAlchemy, legacy `{{#include}}` chapters, output-question mega-files, backend question banks.

---

## Cleanup / housekeeping

|| Item | Action |
||---|---|
|| `src/javascript/missing-concepts-audit.md` | **Removed** — migration queue was obsolete; tracking lives here + docs tracker |
|| System design duplicate Q61–70 / Q86–95 | **Fixed** — each question in one chapter only |

---

## How to update this file

1. Rewrite one leaf page (full Type A–E contract).  
2. Mark `rewritten` in `docs/superpowers/plans/2026-08-25-one-topic-rewrite-tracker.md`.  
3. Update counts and tables in this file.  
4. One file per commit when committing.

**Forbidden leftovers:** `Engine Mechanism`, `Senior Interview Playbook`, `One-line mental model`, generic interview scripts.
