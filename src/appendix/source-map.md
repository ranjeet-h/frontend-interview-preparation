# Source Map

Maps every `{{#include}}` range to its canonical book chapter.

## `01-html-css-web-concepts.md` → Frontend Fundamentals

| Source section | Lines | Book chapter |
|---|---|---|
| `## HTML` (Q1–Q5) | L1–102 | [HTML](../frontend/html.md) |
| `## CSS` (Q6–Q10) | L103–178 | [CSS](../frontend/css.md) |
| `## Web Vitals & Performance` (Q11–Q12) | L179–280 | [Web Concepts & Performance](../frontend/web-concepts.md) |
| `## Browser & Web Concepts` (Q13–Q15) | L179–280 | [Web Concepts & Performance](../frontend/web-concepts.md) |
| `## Design Patterns` (Q16–Q18) | L179–280 | [Web Concepts & Performance](../frontend/web-concepts.md) |

## `02-javascript-theory-concepts.md` → JavaScript (theory)

| Source section | Lines | Book chapter |
|---|---|---|
| Prototypes (Array, String, Object) | L1–291 | [Prototypes & Loops](../javascript/prototypes-loops.md) |
| Looping Guide + Examples | L292–660 | [Prototypes & Loops](../javascript/prototypes-loops.md) |
| Overview section | L661–754 | [Core Concepts](../javascript/core-concepts.md) |
| Q1–Q10 (Hoisting – IIFE) | L755–959 | [Core Concepts](../javascript/core-concepts.md) |
| Q11–Q17 (Event Loop – Promise.race) | L960–1082 | [Core Concepts](../javascript/core-concepts.md) |
| Q18–Q27 (ES6+ – Generators) | L1083–1252 | [ES6 & Modern JavaScript](../javascript/es6-modern.md) |
| Q28–Q35 (DSA basics) | L1253–1397 | [ES6 & Modern JavaScript](../javascript/es6-modern.md) |
| Q36–Q44 (Browser/DOM/Performance) | L1398–1511 | [Browser, DOM & Performance](../javascript/browser-dom-perf.md) |
| Q45+ (Design Patterns in JS) | L1512–3139 | [Browser, DOM & Performance](../javascript/browser-dom-perf.md) |

## `03-javascript-coding-problems.md` → JavaScript (coding)

| Source section | Lines | Book chapter | Deduplication note |
|---|---|---|---|
| 40 Essential Questions (theory deep-dive) | L1–1711 | *Not included* — overlaps with `02` chapters | Cross-link to canonical `02` chapters |
| Coding Problems (arrays/strings/objects) | L1712–2190 | [Coding Problems](../javascript/coding-problems.md) | Unique |
| Output Qs (hoisting/closures/Promises/async/event loop) | L2191–3160 | [Output Questions – Part 1](../javascript/output-questions.md) | Unique |
| Polyfills (Array/Function/Promise) | L3161–4286 | [Polyfills](../javascript/polyfills.md) | Unique |
| Output Qs Part 2 (`this`/scope/coercion/classes) | L4287–5521 | [Output Questions – Part 2](../javascript/output-questions-2.md) | Unique |

## `04-react-theory-concepts.md` → React (theory)

| Source section | Lines | Book chapter |
|---|---|---|
| Core React Concepts | L1–296 | [Core Concepts](../react/core-concepts.md) |
| Hooks In-Depth | L297–538 | [Hooks In-Depth](../react/hooks.md) |
| State Management + Performance | L539–663 | [State Management & Performance](../react/state-performance.md) |
| Component Architecture + Testing | L664–879 | [Architecture & Testing](../react/architecture-testing.md) |
| Advanced Patterns + Ecosystem | L880–1165 | [Advanced Patterns & Ecosystem](../react/advanced-patterns.md) |
| Implementations & Coding Walkthroughs | L1166–2195 | [Implementations & Examples](../react/implementations.md) |

## `05-react-coding-challenges.md` → React (coding)

| Source section | Lines | Book chapter |
|---|---|---|
| Custom Hooks + Performance + Component Design + State Mgmt | L1–734 | [Coding Challenges](../react/coding-challenges.md) |
| Output Questions (useState/useEffect/useMemo/useContext/useReducer) | L735–1917 | [Output Questions](../react/output-questions.md) |

## Curated chapters (direct authoring in `src/`)

| Book chapter | Canonical source | Notes |
|---|---|---|
| [Practical Questions (50 Interview Builds)](../react/practical-questions.md) | `src/react/practical-questions.md` | Curated beginner/intermediate/advanced React practical builds |

## `06-javascript-coding-DSA-problems.md` → DSA

| Source section | Lines | Book chapter |
|---|---|---|
| Array-Based Questions | L1–573 | [Array Problems](../dsa/arrays.md) |
| String Manipulation Questions | L574–970 | [String Problems](../dsa/strings.md) |
| Object-Related Questions | L971–1470 | [Object Problems](../dsa/objects.md) |
| Frontend-Specific Application Problems | L1471–1882 | [Frontend Application Problems](../dsa/frontend-apps.md) |
| Implementation Challenges #1–#53 | L1883–4984 | [Implementations](../dsa/implementations.md) |

## `100_System_Design_Interview_Questions_Complete_Guide.md` → Full Stack Expansion / System Design

| Source section | Lines | Book chapter |
|---|---|---|
| Introduction & Framework + Concept-Based Questions (Q1–Q15) | L22–141 | [Foundations & Framework](../full-stack/system-design/concepts.md) |
| Easy System Design Problems (Q16–Q35) | L143–483 | [Easy System Design Problems](../full-stack/system-design/easy.md) |
| Medium System Design Problems (Q36–Q70) | L485–1220 | [Medium System Design Problems](../full-stack/system-design/medium.md) |
| Hard System Design Problems (Q71–Q95) | L1222–1879 | [Hard System Design Problems](../full-stack/system-design/hard.md) |
| Advanced & Specialist Areas (Q96–Q100) | L1881–2209 | [Advanced & Specialist Areas](../full-stack/system-design/specialist.md) |
| Preparation Strategy | L2211–2390 | [Preparation Strategy](../full-stack/system-design/preparation.md) |

## Question-bank CSV imports

| Source file | Prompt count | Book chapter |
|---|---|---|
| `Frontend_Questions.csv` | 19 | [Frontend Questions](../frontend/question-banks.md) |
| `Frontend_Coding_Questions.csv` | 14 | [Frontend Coding Questions](../frontend/coding-questions.md) |
| `Backend_Questions.csv` | 20 | [Backend Questions](../full-stack/backend/question-banks.md) |
| `Backend_Coding_Questions.csv` | 19 | [Backend Coding Questions](../full-stack/backend/coding-questions.md) |
| Curated Node.js bank | 50 | [Node.js Question Bank](../full-stack/backend/nodejs-question-bank.md) |
| Curated FastAPI bank | 50 | [FastAPI Question Bank](../full-stack/backend/fastapi-question-bank.md) |
| Curated backend libraries bank | 50 | [Backend Libraries Question Bank](../full-stack/backend/libraries-question-bank.md) |
| Curated MongoDB bank | 50 | [MongoDB Question Bank](../full-stack/databases/mongodb-question-bank.md) |
| Curated MySQL bank | 50 | [MySQL Question Bank](../full-stack/databases/mysql-question-bank.md) |
| Curated PostgreSQL bank | 50 | [PostgreSQL Question Bank](../full-stack/databases/postgresql-question-bank.md) |
| Curated database modeling bank | 50 | [Database Modeling Question Bank](../full-stack/databases/modeling-management-question-bank.md) |

## Not yet integrated (archived)

| File | Reason |
|---|---|
| `ops-tree-interview-qna.md` | Ops/tree topics; planned for Full Stack Expansion |
| `the-transformation-group.md` | Miscellaneous notes; not interview-focused |

## Expansion scaffold

These pages cover both live and planned expansion tracks. Live tracks map to source files; planned
tracks are placeholders for future content.

| Page | Purpose | Status |
|---|---|---|
| [Full Stack Expansion](../full-stack/index.md) | Expansion hub | Ready |
| [Backend & APIs](../full-stack/backend/index.md) | Node, Python, FastAPI, auth, backend design | Planned |
| [Databases & Storage](../full-stack/databases/index.md) | MongoDB, MySQL, PostgreSQL, modeling | Planned |
| [Cloud & DevOps](../full-stack/cloud/index.md) | AWS, Azure, Google Cloud, delivery, ops | Planned |
| [System Design](../full-stack/system-design/index.md) | 100 system design questions and patterns | Ready |
| [AI & Agents](../full-stack/ai/index.md) | Agentic workflows, prompting, RAG, evaluation | Planned |
