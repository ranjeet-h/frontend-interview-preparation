# JavaScript

JavaScript is the language layer that powers the browser, your algorithms, and the reusable
patterns interviewers probe from multiple angles.

## Migration tracker

| Chapter | Purpose |
|---|---|
| [JavaScript Missing Concepts Audit](missing-concepts-audit.md) | Tracks frontend-interview JavaScript topics that still need dedicated concept pages |

## Concept chapters (12-section study format)

| Chapter | Focus |
|---|---|
| [Memory Heap](concepts/memory-heap.md) | Heap storage, object references, leaks |
| [Global Execution Context](concepts/global-execution-context.md) | Top-level script environment and globals |
| [Function Execution Context](concepts/function-execution-context.md) | Per-call runtime environment and stack frames |
| [Execution Context](concepts/execution-context.md) | Runtime environment for bindings, scope, and `this` |
| [Call Stack](concepts/call-stack.md) | Active function frames and synchronous execution |
| [Scope Chain](concepts/scope-chain.md) | Identifier lookup through nested scopes |
| [JavaScript and Rendering Pipeline Interaction](concepts/rendering-pipeline-interaction.md) | Main thread, rendering opportunities, UI blocking |
| [Lexical Scoping](concepts/lexical-scoping.md) | Source-location based variable access |
| [Lexical Environment](concepts/lexical-environment.md) | Scope records and outer environment links |
| [Hoisting](concepts/hoisting.md) | Declaration setup before execution |
| [Temporal Dead Zone](concepts/temporal-dead-zone.md) | `let`/`const` access before initialization |
| [Event Loop](concepts/event-loop.md) | Scheduling stack, tasks, microtasks, and rendering |
| [Microtask Queue](concepts/microtask-queue.md) | Promise jobs and high-priority async follow-ups |
| [Macrotask Queue](concepts/macrotask-queue.md) | Timers, events, script tasks, and render gaps |
| [Closures](concepts/closures.md) | Functions retaining outer lexical environments |
| [Closure Memory Retention](concepts/closure-memory-retention.md) | Captured variables, reachability, leak risk |
| [Closures in Loops](concepts/closures-in-loops.md) | `var` vs `let`, per-iteration bindings |
| [Closures in Event Handlers](concepts/closures-in-event-handlers.md) | Handler context, retained values, cleanup |
| [Primitive vs Reference Values](concepts/primitive-vs-reference-values.md) | Value copy vs shared object identity |
| [`this` Binding](concepts/this-binding.md) | Call-site receivers, arrows, bind/call/apply |
| [Shallow Copy vs Deep Copy](concepts/shallow-copy-vs-deep-copy.md) | Top-level copies vs recursive copies |
| [Array Mutation](concepts/array-mutation.md) | Mutating methods, immutable array updates |
| [`flatMap`](concepts/flatmap.md) | Map plus one-level flatten |
| [Promise States](concepts/promise-states.md) | Pending, fulfilled, rejected, settled |
| [Promise Chaining](concepts/promise-chaining.md) | Sequential async values and error propagation |
| [Async/Await](concepts/async-await.md) | Promise workflows with sequential syntax |
| [Timeout Handling](concepts/timeout-handling.md) | Async deadlines, abort, timeout errors |
| [Passive Listeners](concepts/passive-listeners.md) | Non-blocking scroll/touch listeners |
| [Custom Events](concepts/custom-events.md) | DOM event publishing with `detail` |
| [Pointer Events](concepts/pointer-events.md) | Unified mouse/touch/pen input |
| [Focus and Blur](concepts/focus-and-blur.md) | Keyboard focus, blur, accessible UI |
| [DOM Event Propagation](concepts/dom-event-propagation.md) | Capture, target, bubble, and delegation |
| [Private Fields](concepts/private-fields.md) | Runtime class-private `#field` |
| [Copying Array Methods](concepts/copying-array-methods.md) | `toSorted`, `toReversed`, `toSpliced` |
| [Barrel Files](concepts/barrel-files.md) | Re-export hubs and tree-shaking risks |
| [IndexedDB](concepts/indexeddb.md) | Async browser database |
| [Storage Event](concepts/storage-event.md) | localStorage cross-tab notifications |
| [BroadcastChannel](concepts/broadcast-channel.md) | Same-origin tab messaging |
| [DOM-Based XSS](concepts/dom-based-xss.md) | Client-side script injection through DOM sinks |
| [Open Redirects](concepts/open-redirects.md) | Unsafe redirect target handling |
| [Layout Thrashing](concepts/layout-thrashing.md) | Repeated layout read/write reflows |
| [Detached DOM Nodes](concepts/detached-dom-nodes.md) | Removed DOM retained by JS references |
| [Heap Snapshots](concepts/heap-snapshots.md) | DevTools memory leak evidence |
| [History API](concepts/history-api.md) | URL/history updates without reload |
| [File API](concepts/file-api.md) | User-selected file metadata/content |
| [Clipboard API](concepts/clipboard-api.md) | Permissioned clipboard read/write |
| [Performance API](concepts/performance-api.md) | Browser/app timing measurement |
| [Type Coercion and Equality](concepts/type-coercion-and-equality.md) | `==`, `===`, object identity, and `Object.is` |
| [Browser Storage and Token Risks](concepts/browser-storage-token-risks.md) | localStorage, cookies, memory, and auth trade-offs |
| [XSS, CSRF, CORS, and CSP](concepts/xss-csrf-cors-csp.md) | Browser security concepts and mitigations |
| [Debounce and Throttle](concepts/debounce-and-throttle.md) | Rate control for repeated UI events |
| [Garbage Collection and Memory Leaks](concepts/garbage-collection-memory-leaks.md) | Reachability, leaks, and frontend debugging |
| [Query String Parser](concepts/query-string-parser.md) | URL query parsing practice |
| [Virtual List Basics](concepts/virtual-list-basics.md) | Windowed rendering for huge lists |
| [Custom `new`](concepts/custom-new.md) | Constructor/prototype creation algorithm |
| [Custom `instanceof`](concepts/custom-instanceof.md) | Prototype-chain membership check |

## Chapters (theory — source: `02-javascript-theory-concepts.md`)

| Chapter | Lines | Focus |
|---|---|---|
| [Prototypes & Loops](prototypes-loops.md) | `02` L1–660 | Array/String/Object prototypes; all looping patterns |
| [Core Concepts](core-concepts.md) | `02` L661–1082 | Hoisting, closures, `this`, scope, async, event loop, Promises |
| [ES6 & Modern JavaScript](es6-modern.md) | `02` L1083–1397 | Arrow fns, destructuring, modules, generators, Set/Map |
| [Browser, DOM & Performance](browser-dom-perf.md) | `02` L1398–end | DOM, CORS, CRP, memory, tree shaking, design patterns |

## Chapters (coding — source: `03-javascript-coding-problems.md`)

| Chapter | Lines | Focus |
|---|---|---|
| [Coding Problems](coding-problems.md) | `03` L1712–2190 | 40 coding challenges — arrays, strings, objects |
| [Output Questions – Part 1](output-questions.md) | `03` L2191–3160 | "What is the output?" — hoisting, closures, Promises, async/await, event loop |
| [Polyfills](polyfills.md) | `03` L3161–4286 | Array, Function & Promise polyfills from scratch |
| [Output Questions – Part 2](output-questions-2.md) | `03` L4287–end | `this`, scope, coercion, classes, advanced tricky Qs |
| [Output Questions – Part 3](output-questions-3.md) | Manual expansion | Hoisting, scope, closures, this, coercion, equality, arrays, async, classes, prototypes |

> **Deduplication:** `03` lines 1–1711 contain extended theory that overlaps with the `02`-based
> chapters above. The canonical theory reference is the `02`-based chapters. If you want the
> longer deep-dive treatment of the same topics, open `03-javascript-coding-problems.md` directly.
