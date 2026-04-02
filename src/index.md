# Full Stack Interview Study Book

A structured study guide for frontend and full-stack engineers preparing for senior interviews.

## How to use this book

Each section maps to a cluster of original interview-prep source files. Content is chunked into
focused chapters so you can study by topic rather than reading one giant file.

| Section | Source files | Focus |
|---|---|---|
| [Frontend Fundamentals](frontend/index.md) | `01-html-css-web-concepts.md` | HTML, CSS, Web Vitals, browser APIs, rendering |
| [JavaScript](javascript/index.md) | `02-javascript-theory-concepts.md` + `03-javascript-coding-problems.md` | Theory, coding, output Qs, polyfills |
| [DSA](dsa/index.md) | `06-javascript-coding-DSA-problems.md` | Array/String/Object algorithms + 50+ implementations |
| [React](react/index.md) | `04-react-theory-concepts.md` + `05-react-coding-challenges.md` | Theory, hooks, coding, output Qs |
| [Full Stack Expansion](full-stack/index.md) | planned | Node, DB, APIs, system design |
| [Appendix](appendix/index.md) | all | Source map, original files |

## Quick reference: canonical chapters

| Topic | Canonical chapter |
|---|---|
| Event Loop | [Core Concepts](javascript/core-concepts.md) |
| Hoisting & Closures | [Core Concepts](javascript/core-concepts.md) |
| Async / Promises | [Core Concepts](javascript/core-concepts.md) |
| ES6+ features | [ES6 & Modern JS](javascript/es6-modern.md) |
| Debounce / Throttle implementations | [DSA Implementations](dsa/implementations.md) |
| Array polyfills | [Polyfills](javascript/polyfills.md) |
| React hooks | [Hooks In-Depth](react/hooks.md) |
| React state management | [State Management & Performance](react/state-performance.md) |
| Rendering strategies (SSR/CSR/SSG/ISR) | [Architecture & Testing](react/architecture-testing.md) |

> **Deduplication note:** Where multiple source files cover the same topic (e.g., the event loop
> appears in both `02` and `03`), one chapter is designated canonical and the others cross-link.
> See the [Source Map](appendix/source-map.md) for the full mapping.
