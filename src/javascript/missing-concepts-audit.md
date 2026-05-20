# JavaScript Missing Concepts Audit

This audit was checked against the current mdBook content and source files, excluding this audit file itself.

Use this file as the JavaScript migration queue. It separates:

- **Not found:** no meaningful hit in the current mdBook/source files.
- **Broadly covered:** appears in older broad chapters, question banks, coding files, or output questions.
- **Needs dedicated concept page:** not yet in the new preferred format:

```md
# Concept Name

## Detailed explanation

## 1. One-line mental model
...
## 12. Spaced revision prompts
```

## 1. Truly Not Found In The Current mdBook

These topics from your JavaScript priority list originally had no meaningful coverage. They now have dedicated concept pages.

### Execution Model

- Memory heap — added as [Memory Heap](concepts/memory-heap.md)
- Global execution context — added as [Global Execution Context](concepts/global-execution-context.md)
- Function execution context — added as [Function Execution Context](concepts/function-execution-context.md)
- Rendering pipeline interaction — added as [JavaScript and Rendering Pipeline Interaction](concepts/rendering-pipeline-interaction.md)

### Closures

- Lexical scoping as its own topic — added as [Lexical Scoping](concepts/lexical-scoping.md)
- Closure memory retention — added as [Closure Memory Retention](concepts/closure-memory-retention.md)
- Closures in loops as its own topic — added as [Closures in Loops](concepts/closures-in-loops.md)
- Closures in event handlers as its own topic — added as [Closures in Event Handlers](concepts/closures-in-event-handlers.md)

### Objects, References, Mutation

- Primitive vs reference values as its own topic — added as [Primitive vs Reference Values](concepts/primitive-vs-reference-values.md)
- Array mutation as its own topic — added as [Array Mutation](concepts/array-mutation.md)

### Arrays and Data Transformation

- `flatMap` — added as [`flatMap`](concepts/flatmap.md)

### Promises and Async

- Promise states as its own topic — added as [Promise States](concepts/promise-states.md)
- Timeout handling — added as [Timeout Handling](concepts/timeout-handling.md)

### DOM and Browser Events

- Passive listeners — added as [Passive Listeners](concepts/passive-listeners.md)
- Custom events — added as [Custom Events](concepts/custom-events.md)
- Pointer events — added as [Pointer Events](concepts/pointer-events.md)
- Focus and blur as its own topic — added as [Focus and Blur](concepts/focus-and-blur.md)

### ES6+ Features

- Private fields as its own topic — added as [Private Fields](concepts/private-fields.md)
- `Array.prototype.toSorted` — added as [Copying Array Methods](concepts/copying-array-methods.md)
- `Array.prototype.toReversed` — added as [Copying Array Methods](concepts/copying-array-methods.md)
- `Array.prototype.toSpliced` — added as [Copying Array Methods](concepts/copying-array-methods.md)

### Modules and Bundling

- Barrel files — added as [Barrel Files](concepts/barrel-files.md)

### Browser Storage

- IndexedDB — added as [IndexedDB](concepts/indexeddb.md)
- Storage event — added as [Storage Event](concepts/storage-event.md)
- BroadcastChannel — added as [BroadcastChannel](concepts/broadcast-channel.md)

### Security

- DOM-based XSS — added as [DOM-Based XSS](concepts/dom-based-xss.md)
- Open redirects — added as [Open Redirects](concepts/open-redirects.md)

### Performance

- Layout thrashing — added as [Layout Thrashing](concepts/layout-thrashing.md)

### Memory Management

- Detached DOM nodes — added as [Detached DOM Nodes](concepts/detached-dom-nodes.md)
- Heap snapshots — added as [Heap Snapshots](concepts/heap-snapshots.md)

### Web APIs

- History API — added as [History API](concepts/history-api.md)
- File API — added as [File API](concepts/file-api.md)
- Clipboard API — added as [Clipboard API](concepts/clipboard-api.md)
- Performance API — added as [Performance API](concepts/performance-api.md)

### Coding Practice

- Query string parser — added as [Query String Parser](concepts/query-string-parser.md)
- Virtual list basics — added as [Virtual List Basics](concepts/virtual-list-basics.md)
- Custom `new` — added as [Custom `new`](concepts/custom-new.md)
- Custom `instanceof` — added as [Custom `instanceof`](concepts/custom-instanceof.md)

## 2. Broadly Covered, But Not Dedicated Concept Pages Yet

These topics exist somewhere in the mdBook/source material, but they are not yet split into one concept page with the required study format.

### Execution Model

- Call stack
- Execution context
- Scope chain
- Lexical environment
- Hoisting
- Temporal Dead Zone
- Event loop
- Microtask queue
- Macrotask queue
- Why JavaScript is single-threaded
- What happens when a function is called
- Promise vs `setTimeout` output order

### Closures

- Closures
- Private variables
- Stale closures
- `var` vs `let` loop behavior

### `this` Binding

- Global `this`
- Object method `this`
- Arrow function `this`
- Constructor function `this`
- Class method `this`
- `call`
- `apply`
- `bind`
- Lost `this` problem

### Objects, References, Mutation

- Shallow copy
- Deep copy
- Object mutation
- Object identity
- Reference equality
- `Object.assign`
- Spread operator
- `structuredClone`
- Immutability
- Nested updates

### Arrays and Data Transformation

- `map`
- `filter`
- `reduce`
- `find`
- `some`
- `every`
- `sort`
- `flat`
- GroupBy pattern
- Deduplication
- Normalization
- Transforming nested API data
- Pagination
- Sorting
- Filtering
- Avoiding mutation

### Promises and Async/Await

- Promise chaining
- `then`
- `catch`
- `finally`
- Error propagation
- `async`
- `await`
- Sequential vs parallel execution
- `Promise.all`
- `Promise.allSettled`
- `Promise.race`
- `Promise.any`
- AbortController
- Request cancellation
- Retry logic
- Race conditions

### Event Loop Deep Dive

- Sync code
- Microtasks
- Macrotasks
- Promise queue
- Timer queue
- `queueMicrotask`
- `requestAnimationFrame`
- Browser rendering opportunity
- Long tasks
- UI blocking
- Main thread

### DOM and Browser Events

- DOM tree
- Event bubbling
- Event capturing
- Event delegation
- `target` vs `currentTarget`
- `preventDefault`
- `stopPropagation`
- Input events
- Keyboard events
- DOM measurements
- Reflow
- Repaint

### Type Coercion and Equality

- `==` vs `===`
- Truthy/falsy values
- Boolean coercion
- Number coercion
- String coercion
- `null` vs `undefined`
- `NaN`
- `Object.is`
- Optional chaining
- Nullish coalescing
- `||` vs `??`
- `isNaN` vs `Number.isNaN`

### ES6+ Features Used In Frontend

- `let`
- `const`
- Arrow functions
- Destructuring
- Spread/rest
- Template literals
- Default parameters
- Optional chaining
- Nullish coalescing
- Dynamic imports
- Modules
- Classes
- Map
- Set
- WeakMap
- Promise combinators
- `structuredClone`

### Modules and Bundling Awareness

- ES Modules
- CommonJS basics
- Named export
- Default export
- Dynamic import
- Tree shaking
- Circular dependencies
- Side effects
- Code splitting
- Lazy loading

### Browser Storage

- Cookies
- LocalStorage
- SessionStorage
- Cache API
- Storage limits
- Client-side caching
- Sensitive data risks
- HttpOnly cookies
- Token storage risks

### Security For Frontend JavaScript

- XSS
- CSRF
- CORS
- Same-origin policy
- CSP
- Sanitization
- Escaping
- `innerHTML`
- `eval`
- Prototype pollution
- Token storage
- Dependency vulnerabilities
- Authentication vs authorization
- Why frontend route protection is not enough

### Performance For Frontend JavaScript

- Main thread blocking
- Long tasks
- Debounce
- Throttle
- Memoization
- Lazy loading
- Code splitting
- Web workers
- Virtualization
- Event delegation
- Reflow
- Repaint
- `requestAnimationFrame`
- Bundle size
- Web Vitals
- LCP
- CLS
- INP

### Memory Management

- Garbage collection
- Reachability
- Memory leaks
- Event listener leaks
- Timer leaks
- Closure leaks
- Large caches
- WeakMap
- WeakSet
- Chrome DevTools memory debugging

### Web APIs For Frontend

- Fetch API
- AbortController
- URLSearchParams
- IntersectionObserver
- ResizeObserver
- MutationObserver
- WebSocket
- Web Workers

## 3. Coding Questions Broadly Present, But Need Standalone Practice Pages

These appear in broad coding files or DSA files, but should be split into dedicated practice pages later.

### Very High Priority

- Implement debounce
- Implement throttle
- Implement deep clone
- Implement deep equal
- Implement flatten array
- Implement flatten object
- Implement groupBy
- Implement unique array
- Implement curry
- Implement memoize
- Implement once
- Implement event emitter
- Implement `Promise.all`
- Implement `Promise.allSettled`
- Implement promise retry
- Implement promise timeout
- Implement concurrency limiter
- Implement LRU cache
- Implement localStorage wrapper with expiry
- Implement autocomplete with debounce and cancellation
- Implement infinite scroll

### Medium Priority

- Implement custom `bind`
- Implement custom `call`
- Implement custom `apply`
- Implement `Object.create`
- Implement pub-sub
- Implement task scheduler
- Implement async queue
- Implement rate limiter
- Implement compose
- Implement pipe

## 4. Output-Based Question Sets Broadly Present, But Need Focused Indexing

Existing output chapters already include many examples. They should be grouped into focused practice pages:

- Hoisting output
- Closure output
- Event loop output
- Promise output
- Async/await output
- `this` binding output
- Object reference output
- Array mutation output
- Type coercion output
- Prototype output
- Scope output
- `var` vs `let` loop output

## 5. Recommended Next Work Order

All **truly not found** items are now added as dedicated concept pages. Next pass: convert **broadly covered** legacy topics into dedicated pages, starting here:

1. Call stack
2. Execution context
3. Scope chain
4. Lexical environment
5. Hoisting
6. Temporal Dead Zone
7. Event loop
8. Microtask queue
9. Macrotask queue
10. Closures
11. `this` binding
12. Shallow copy vs deep copy
13. Promise chaining
14. Async/await
15. DOM event propagation
16. Type coercion and equality
17. Browser storage and token risks
18. XSS, CSRF, CORS, CSP
19. Debounce and throttle
20. Garbage collection and memory leaks
