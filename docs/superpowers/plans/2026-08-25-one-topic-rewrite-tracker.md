# One-Topic Rewrite Tracker

Mark a page only after a worker read it completely, rewrote it in the Type A–E format, and the master reviewed and committed it.

Status values: `queued` | `assigned` | `rewritten`

The master may mark several rows `assigned` in one wave (one worker per row). Never mark a whole directory rewritten from a script.

Start at Task 0, then Phase 1 in list order. Parallel waves take the next N queued rows, not random files.

## Wiring (once, before any topic)

- [x] rewritten — `src/study-system.md` — Type A–E recipe and parallel one-page worker rule

## Phase 1 — JavaScript concepts

Process in this order. Skip `src/javascript/concepts/index.md`.

1. [x] rewritten — `src/javascript/concepts/memory-heap.md` — Type A
2. [x] rewritten — `src/javascript/concepts/execution-context.md` — Type A
3. [x] rewritten — `src/javascript/concepts/global-execution-context.md` — Type A
4. [x] rewritten — `src/javascript/concepts/function-execution-context.md` — Type A
5. [x] rewritten — `src/javascript/concepts/call-stack.md` — Type A
6. [x] rewritten — `src/javascript/concepts/lexical-environment.md` — Type A
7. [x] rewritten — `src/javascript/concepts/lexical-scoping.md` — Type A
8. [x] rewritten — `src/javascript/concepts/scope-chain.md` — Type A
9. [x] rewritten — `src/javascript/concepts/hoisting.md` — Type A
10. [x] rewritten — `src/javascript/concepts/temporal-dead-zone.md` — Type A
11. [x] rewritten — `src/javascript/concepts/closures.md` — Type A
12. [x] rewritten — `src/javascript/concepts/closure-memory-retention.md` — Type A
13. [x] rewritten — `src/javascript/concepts/closures-in-loops.md` — Type A
14. [x] rewritten — `src/javascript/concepts/closures-in-event-handlers.md` — Type A
15. [x] rewritten — `src/javascript/concepts/event-loop.md` — Type A
16. [x] rewritten — `src/javascript/concepts/microtask-queue.md` — Type A
17. [x] rewritten — `src/javascript/concepts/macrotask-queue.md` — Type A
18. [x] rewritten — `src/javascript/concepts/rendering-pipeline-interaction.md` — Type A
19. [x] rewritten — `src/javascript/concepts/promise-states.md` — Type A
20. [x] rewritten — `src/javascript/concepts/promise-chaining.md` — Type A
21. [x] rewritten — `src/javascript/concepts/async-await.md` — Type A
22. [x] rewritten — `src/javascript/concepts/timeout-handling.md` — Type A
23. [x] rewritten — `src/javascript/concepts/this-binding.md` — Type A
24. [x] rewritten — `src/javascript/concepts/primitive-vs-reference-values.md` — Type A
25. [x] rewritten — `src/javascript/concepts/shallow-copy-vs-deep-copy.md` — Type A
26. [x] rewritten — `src/javascript/concepts/array-mutation.md` — Type A
27. [x] rewritten — `src/javascript/concepts/type-coercion-and-equality.md` — Type A
28. [x] rewritten — `src/javascript/concepts/flatmap.md` — Type A
29. [x] rewritten — `src/javascript/concepts/private-fields.md` — Type A
30. [x] rewritten — `src/javascript/concepts/copying-array-methods.md` — Type A
31. [x] rewritten — `src/javascript/concepts/barrel-files.md` — Type A
32. [x] rewritten — `src/javascript/concepts/passive-listeners.md` — Type A
33. [x] rewritten — `src/javascript/concepts/custom-events.md` — Type A
34. [x] rewritten — `src/javascript/concepts/pointer-events.md` — Type A
35. [x] rewritten — `src/javascript/concepts/focus-and-blur.md` — Type A
36. [x] rewritten — `src/javascript/concepts/dom-event-propagation.md` — Type A
37. [x] rewritten — `src/javascript/concepts/indexeddb.md` — Type A
38. [x] rewritten — `src/javascript/concepts/storage-event.md` — Type A
39. [x] rewritten — `src/javascript/concepts/broadcast-channel.md` — Type A
40. [x] rewritten — `src/javascript/concepts/history-api.md` — Type A
41. [x] rewritten — `src/javascript/concepts/file-api.md` — Type A
42. [x] rewritten — `src/javascript/concepts/clipboard-api.md` — Type A
43. [x] rewritten — `src/javascript/concepts/performance-api.md` — Type A
44. [x] rewritten — `src/javascript/concepts/dom-based-xss.md` — Type A
45. [x] rewritten — `src/javascript/concepts/open-redirects.md` — Type A
46. [x] rewritten — `src/javascript/concepts/browser-storage-token-risks.md` — Type A
47. [x] rewritten — `src/javascript/concepts/xss-csrf-cors-csp.md` — Type A
48. [x] rewritten — `src/javascript/concepts/layout-thrashing.md` — Type A
49. [x] rewritten — `src/javascript/concepts/detached-dom-nodes.md` — Type A
50. [x] rewritten — `src/javascript/concepts/heap-snapshots.md` — Type A
51. [x] rewritten — `src/javascript/concepts/debounce-and-throttle.md` — Type A
52. [x] rewritten — `src/javascript/concepts/garbage-collection-memory-leaks.md` — Type A
53. [x] rewritten — `src/javascript/concepts/query-string-parser.md` — Type A
54. [x] rewritten — `src/javascript/concepts/virtual-list-basics.md` — Type A
55. [x] rewritten — `src/javascript/concepts/custom-new.md` — Type A
56. [x] rewritten — `src/javascript/concepts/custom-instanceof.md` — Type A
57. [x] complete — all 56 `src/javascript/concepts/*.md` pages in index order are rewritten

Do not rewrite `src/javascript/output-questions.md`, `output-questions-2.md`, or `output-questions-3.md` as a single page. Each output puzzle is its own later Type C task after it is split into its own file.

## Phase 1C — JavaScript output questions (Type C, one puzzle per page)

Begin with one verified seed puzzle from each requested collection. Add later puzzles only as they are individually assigned; do not bulk-generate this queue.

1. [x] rewritten — `src/javascript/output-questions/part-1/001-var-hoisting.md` — Type C (Part 1 Question 1)
2. [x] rewritten — `src/javascript/output-questions/part-2/001-default-this.md` — Type C (Part 2 Question 1)
3. [x] rewritten — `src/javascript/output-questions/part-3/001-var-hoisting.md` — Type C (Part 3 Question 1)
4. [x] rewritten — `src/javascript/output-questions/part-1/002-function-declaration-hoisting.md` — Type C (Part 1 Question 2)
5. [x] rewritten — `src/javascript/output-questions/part-2/002-call-vs-method-this.md` — Type C (Part 2 Question 2)
6. [x] rewritten — `src/javascript/output-questions/part-3/002-let-tdz.md` — Type C (Part 3 Question 2)
7. [x] rewritten — `src/javascript/output-questions/part-1/003-var-function-expression.md` — Type C (Part 1 Question 3)
8. [x] rewritten — `src/javascript/output-questions/part-2/003-arrow-function-this.md` — Type C (Part 2 Question 3)
9. [x] rewritten — `src/javascript/output-questions/part-3/003-const-tdz.md` — Type C (Part 3 Question 3)
10. [x] rewritten — `src/javascript/output-questions/part-1/004-let-tdz.md` — Type C (Part 1 Question 4)
11. [x] rewritten — `src/javascript/output-questions/part-2/004-make-user-this.md` — Type C (Part 2 Question 4)
12. [x] rewritten — `src/javascript/output-questions/part-3/004-function-declaration.md` — Type C (Part 3 Question 4)
13. [x] rewritten — `src/javascript/output-questions/part-1/005-var-shadowing.md` — Type C (Part 1 Question 5)
14. [x] rewritten — `src/javascript/output-questions/part-2/005-var-loop-closure.md` — Type C (Part 2 Question 7)
15. [x] rewritten — `src/javascript/output-questions/part-3/005-function-expression-call.md` — Type C (Part 3 Question 5)

## Later phases

Use the directory order in `2026-08-25-sequential-study-note-rewrite.md`. Add filenames to this tracker only when that phase starts, never as a bulk generated list used to rewrite many pages at once.

## Phase 2 — Frontend fundamentals (parallel track)

HTML, CSS, and web concept leaf pages under `src/frontend/`. Question banks stay out of scope until split one-question-per-file.

### HTML

1. [x] rewritten — `src/frontend/html/html5-features.md` — Type A
2. [x] rewritten — `src/frontend/html/document-structure.md` — Type A
3. [x] rewritten — `src/frontend/html/semantic-html.md` — Type A
4. [x] rewritten — `src/frontend/html/meta-tags.md` — Type A
5. [x] rewritten — `src/frontend/html/media-tags.md` — Type A

### CSS

6. [x] rewritten — `src/frontend/css/box-model.md` — Type A
7. [x] rewritten — `src/frontend/css/specificity.md` — Type A
8. [x] rewritten — `src/frontend/css/layout-flexbox-grid.md` — Type A
9. [x] rewritten — `src/frontend/css/pseudo-classes-elements.md` — Type A
10. [x] rewritten — `src/frontend/css/positioning.md` — Type A

### Web concepts

11. [x] rewritten — `src/frontend/web/core-web-vitals.md` — Type A
12. [x] rewritten — `src/frontend/web/performance-optimization.md` — Type A
13. [x] rewritten — `src/frontend/web/browser-storage.md` — Type A
14. [x] rewritten — `src/frontend/web/dom.md` — Type A
15. [x] rewritten — `src/frontend/web/security.md` — Type A
16. [x] rewritten — `src/frontend/web/design-patterns.md` — Type A
17. [x] rewritten — `src/frontend/web/react-design-patterns.md` — Type A
18. [x] rewritten — `src/frontend/web/rendering-patterns.md` — Type A

### Still queued

Question banks stay as **single pages** (not split per question). Rewrite in place with full learning content.

- [x] rewritten — `src/frontend/question-banks.md` — study bank with full section answers
- [x] rewritten — `src/frontend/coding-questions.md` — Format B per problem, one file

## Phase 2 — React Core Concepts & Hooks

Process React leaf pages under `src/react/concepts/` as Type A in dependency order.

1. [x] rewritten — `src/react/concepts/what-is-react.md` — Type A
2. [x] rewritten — `src/react/concepts/declarative-vs-imperative-ui.md` — Type A
3. [x] rewritten — `src/react/concepts/component-based-architecture.md` — Type A
4. [x] rewritten — `src/react/concepts/jsx-and-compilation.md` — Type A
5. [x] rewritten — `src/react/concepts/react-elements-vs-components.md` — Type A
6. [x] rewritten — `src/react/concepts/functional-vs-class-components.md` — Type A
7. [x] rewritten — `src/react/concepts/props.md` — Type A
8. [x] rewritten — `src/react/concepts/state.md` — Type A
9. [x] rewritten — `src/react/concepts/children-prop.md` — Type A
10. [x] rewritten — `src/react/concepts/conditional-rendering.md` — Type A
11. [x] rewritten — `src/react/concepts/list-rendering.md` — Type A
12. [x] rewritten — `src/react/concepts/keys-in-lists.md` — Type A
13. [x] rewritten — `src/react/concepts/event-handling.md` — Type A
14. [x] rewritten — `src/react/concepts/controlled-components.md` — Type A
15. [x] rewritten — `src/react/concepts/uncontrolled-components.md` — Type A
16. [x] rewritten — `src/react/concepts/forms-in-react.md` — Type A
17. [x] rewritten — `src/react/concepts/component-composition.md` — Type A
18. [x] rewritten — `src/react/concepts/reusable-components.md` — Type A
19. [x] rewritten — `src/react/concepts/presentational-vs-container-components.md` — Type A
20. [x] rewritten — `src/react/concepts/lifting-state-up.md` — Type A
21. [x] rewritten — `src/react/concepts/props-drilling.md` — Type A
22. [x] rewritten — `src/react/concepts/component-lifecycle.md` — Type A
23. [x] rewritten — `src/react/concepts/one-way-data-flow.md` — Type A
24. [x] rewritten — `src/react/concepts/immutability-in-react-state.md` — Type A
25. [x] rewritten — `src/react/concepts/rendering-flow.md` — Type A
26. [x] rewritten — `src/react/concepts/virtual-dom-reconciliation.md` — Type A
27. [x] rewritten — `src/react/concepts/reconciliation.md` — Type A
28. [x] rewritten — `src/react/concepts/diffing-algorithm.md` — Type A
29. [x] rewritten — `src/react/concepts/react-fiber-architecture.md` — Type A
30. [x] rewritten — `src/react/concepts/synthetic-events.md` — Type A
31. [x] rewritten — `src/react/concepts/fragments.md` — Type A
32. [x] rewritten — `src/react/concepts/portals.md` — Type A
33. [x] rewritten — `src/react/concepts/error-boundaries.md` — Type A
34. [x] rewritten — `src/react/concepts/refs.md` — Type A
35. [x] rewritten — `src/react/concepts/forward-refs.md` — Type A
36. [x] rewritten — `src/react/concepts/callback-refs.md` — Type A
37. [x] rewritten — `src/react/concepts/strict-mode.md` — Type A
38. [x] rewritten — `src/react/concepts/react-devtools.md` — Type A
39. [x] rewritten — `src/react/concepts/use-state.md` — Type A
40. [x] rewritten — `src/react/concepts/use-effect.md` — Type A
41. [x] rewritten — `src/react/concepts/use-context.md` — Type A
42. [x] rewritten — `src/react/concepts/use-ref.md` — Type A
43. [x] rewritten — `src/react/concepts/use-reducer.md` — Type A
44. [x] rewritten — `src/react/concepts/use-memo.md` — Type A
45. [x] rewritten — `src/react/concepts/use-callback.md` — Type A
46. [x] rewritten — `src/react/concepts/use-layout-effect.md` — Type A
47. [x] rewritten — `src/react/concepts/use-imperative-handle.md` — Type A
48. [x] rewritten — `src/react/concepts/use-debug-value.md` — Type A
49. [x] rewritten — `src/react/concepts/custom-hooks.md` — Type A
50. [x] rewritten — `src/react/concepts/rules-of-hooks.md` — Type A
51. [x] rewritten — `src/react/concepts/hook-dependency-array.md` — Type A
52. [x] rewritten — `src/react/concepts/stale-closures.md` — Type A
53. [x] rewritten — `src/react/concepts/effect-cleanup-functions.md` — Type A
54. [x] rewritten — `src/react/concepts/avoiding-infinite-re-renders.md` — Type A
55. [x] rewritten — `src/react/concepts/lazy-initialization-use-state.md` — Type A
56. [x] rewritten — `src/react/concepts/functional-state-updates.md` — Type A
57. [x] rewritten — `src/react/concepts/referential-equality-stable-references.md` — Type A
58. [x] rewritten — `src/react/concepts/race-conditions-inside-effects.md` — Type A
59. [x] rewritten — `src/react/concepts/abort-controller-inside-effects.md` — Type A
60. [x] rewritten — `src/react/concepts/debouncing-with-hooks.md` — Type A
61. [x] rewritten — `src/react/concepts/throttling-with-hooks.md` — Type A
62. [x] rewritten — `src/react/concepts/use-previous.md` — Type A
63. [x] rewritten — `src/react/concepts/mounted-state-tracking.md` — Type A
64. [x] rewritten — `src/react/concepts/hook-comparisons.md` — Type A
65. [x] rewritten — `src/react/concepts/async-logic-inside-hooks.md` — Type A
66. [x] rewritten — `src/react/concepts/custom-hook-testing.md` — Type A

## Phase 7 — Backend System Design

Process 30 leaf pages under `src/full-stack/backend/system-design/` as Type D in dependency order.

1. [x] rewritten — `src/full-stack/backend/system-design/design-a-url-shortener.md` — Type D
2. [x] rewritten — `src/full-stack/backend/system-design/design-a-file-upload-service.md` — Type D
3. [x] rewritten — `src/full-stack/backend/system-design/design-an-image-upload-and-resize-service.md` — Type D
4. [x] rewritten — `src/full-stack/backend/system-design/design-an-authentication-system.md` — Type D
5. [x] rewritten — `src/full-stack/backend/system-design/design-a-role-based-access-system.md` — Type D
6. [x] rewritten — `src/full-stack/backend/system-design/design-a-notification-system.md` — Type D
7. [x] rewritten — `src/full-stack/backend/system-design/design-an-email-delivery-system.md` — Type D
8. [x] rewritten — `src/full-stack/backend/system-design/design-a-real-time-chat-system.md` — Type D
9. [x] rewritten — `src/full-stack/backend/system-design/design-a-logging-system.md` — Type D
10. [x] rewritten — `src/full-stack/backend/system-design/design-an-audit-log-system.md` — Type D
11. [x] rewritten — `src/full-stack/backend/system-design/design-a-payment-system.md` — Type D
12. [x] rewritten — `src/full-stack/backend/system-design/design-an-order-management-system.md` — Type D
13. [x] rewritten — `src/full-stack/backend/system-design/design-an-inventory-management-system.md` — Type D
14. [x] rewritten — `src/full-stack/backend/system-design/design-a-booking-system.md` — Type D
15. [x] rewritten — `src/full-stack/backend/system-design/design-a-ride-booking-backend.md` — Type D
16. [x] rewritten — `src/full-stack/backend/system-design/design-a-food-delivery-backend.md` — Type D
17. [x] rewritten — `src/full-stack/backend/system-design/design-a-social-media-feed.md` — Type D
18. [x] rewritten — `src/full-stack/backend/system-design/design-a-search-autocomplete-system.md` — Type D
19. [x] rewritten — `src/full-stack/backend/system-design/design-a-rate-limiter.md` — Type D
20. [x] rewritten — `src/full-stack/backend/system-design/design-a-recommendation-backend.md` — Type D
21. [x] rewritten — `src/full-stack/backend/system-design/design-a-multi-tenant-saas-backend.md` — Type D
22. [x] rewritten — `src/full-stack/backend/system-design/design-a-webhook-processing-system.md` — Type D
23. [x] rewritten — `src/full-stack/backend/system-design/design-a-background-job-system.md` — Type D
24. [x] rewritten — `src/full-stack/backend/system-design/design-a-report-generation-system.md` — Type D
25. [x] rewritten — `src/full-stack/backend/system-design/design-an-analytics-dashboard-backend.md` — Type D
26. [x] rewritten — `src/full-stack/backend/system-design/design-a-comments-system.md` — Type D
27. [x] rewritten — `src/full-stack/backend/system-design/design-a-like-follow-system.md` — Type D
28. [x] rewritten — `src/full-stack/backend/system-design/design-a-scalable-rest-api.md` — Type D
29. [x] rewritten — `src/full-stack/backend/system-design/design-a-cache-layer.md` — Type D
30. [x] rewritten — `src/full-stack/backend/system-design/design-a-distributed-notification-service.md` — Type D

## Phase 8 — Node.js backend concepts

Process 30 leaf pages under `src/full-stack/backend/nodejs/` as Type A in SUMMARY order. Skip `index.md`.

1. [x] rewritten — `src/full-stack/backend/nodejs/what-is-node-js.md` — Type A
2. [x] rewritten — `src/full-stack/backend/nodejs/how-does-node-js-work.md` — Type A
3. [x] rewritten — `src/full-stack/backend/nodejs/what-is-v8.md` — Type A
4. [x] rewritten — `src/full-stack/backend/nodejs/what-is-libuv.md` — Type A
5. [x] rewritten — `src/full-stack/backend/nodejs/what-is-node-js-event-loop.md` — Type A
6. [x] rewritten — `src/full-stack/backend/nodejs/browser-event-loop-vs-node-js-event-loop.md` — Type A
7. [x] rewritten — `src/full-stack/backend/nodejs/what-are-event-loop-phases.md` — Type A
8. [x] rewritten — `src/full-stack/backend/nodejs/what-is-process-nexttick.md` — Type A
9. [x] rewritten — `src/full-stack/backend/nodejs/what-is-setimmediate.md` — Type A
10. [x] rewritten — `src/full-stack/backend/nodejs/process-nexttick-vs-setimmediate.md` — Type A
11. [x] rewritten — `src/full-stack/backend/nodejs/what-is-callback-queue.md` — Type A
12. [x] rewritten — `src/full-stack/backend/nodejs/what-is-microtask-queue.md` — Type A
13. [x] rewritten — `src/full-stack/backend/nodejs/what-is-non-blocking-i-o.md` — Type A
14. [x] rewritten — `src/full-stack/backend/nodejs/what-is-blocking-code.md` — Type A
15. [x] rewritten — `src/full-stack/backend/nodejs/how-do-you-avoid-blocking-node-js.md` — Type A
16. [x] rewritten — `src/full-stack/backend/nodejs/what-are-streams.md` — Type A
17. [x] rewritten — `src/full-stack/backend/nodejs/what-are-readable-streams.md` — Type A
18. [x] rewritten — `src/full-stack/backend/nodejs/what-are-writable-streams.md` — Type A
19. [x] rewritten — `src/full-stack/backend/nodejs/what-are-transform-streams.md` — Type A
20. [x] rewritten — `src/full-stack/backend/nodejs/what-is-backpressure.md` — Type A
21. [x] rewritten — `src/full-stack/backend/nodejs/how-do-you-handle-large-file-uploads.md` — Type A
22. [x] rewritten — `src/full-stack/backend/nodejs/what-is-buffer.md` — Type A
23. [x] rewritten — `src/full-stack/backend/nodejs/what-is-eventemitter.md` — Type A
24. [x] rewritten — `src/full-stack/backend/nodejs/what-is-cluster-module.md` — Type A
25. [x] rewritten — `src/full-stack/backend/nodejs/what-are-worker-threads.md` — Type A
26. [x] rewritten — `src/full-stack/backend/nodejs/cluster-vs-worker-threads.md` — Type A
27. [x] rewritten — `src/full-stack/backend/nodejs/how-do-you-scale-node-js-app.md` — Type A
28. [x] rewritten — `src/full-stack/backend/nodejs/how-do-you-handle-uncaught-exceptions.md` — Type A
29. [x] rewritten — `src/full-stack/backend/nodejs/how-do-you-handle-unhandled-promise-rejections.md` — Type A
30. [x] rewritten — `src/full-stack/backend/nodejs/how-do-you-manage-environment-variables.md` — Type A

## Phase 4 — MongoDB

Process MongoDB leaf pages under `src/full-stack/databases/mongodb/` as Type E.

1. [x] rewritten — `src/full-stack/databases/mongodb/what-is-mongodb.md` — Type E
2. [x] rewritten — `src/full-stack/databases/mongodb/what-is-a-document.md` — Type E
3. [x] rewritten — `src/full-stack/databases/mongodb/what-is-a-collection.md` — Type E
4. [x] rewritten — `src/full-stack/databases/mongodb/sql-vs-nosql.md` — Type E
5. [x] rewritten — `src/full-stack/databases/mongodb/what-is-limit.md` — Type E
6. [x] rewritten — `src/full-stack/databases/mongodb/what-is-skip.md` — Type E
7. [x] rewritten — `src/full-stack/databases/mongodb/what-is-sparse-index.md` — Type E
8. [x] rewritten — `src/full-stack/databases/mongodb/what-is-text-index.md` — Type E
9. [x] rewritten — `src/full-stack/databases/mongodb/what-is-ttl-index.md` — Type E
10. [x] rewritten — `src/full-stack/databases/mongodb/what-is-bson.md` — Type E
11. [x] rewritten — `src/full-stack/databases/mongodb/what-is-objectid.md` — Type E
12. [x] rewritten — `src/full-stack/databases/mongodb/what-is-mongodb-indexing.md` — Type E
13. [x] rewritten — `src/full-stack/databases/mongodb/what-is-compound-index.md` — Type E
14. [x] rewritten — `src/full-stack/databases/mongodb/what-is-partial-index.md` — Type E
15. [x] rewritten — `src/full-stack/databases/mongodb/what-is-aggregation-pipeline.md` — Type E
16. [x] rewritten — `src/full-stack/databases/mongodb/what-is-match.md` — Type E
17. [x] rewritten — `src/full-stack/databases/mongodb/what-is-group.md` — Type E
18. [x] rewritten — `src/full-stack/databases/mongodb/what-is-project.md` — Type E
19. [x] rewritten — `src/full-stack/databases/mongodb/what-is-lookup.md` — Type E
20. [x] rewritten — `src/full-stack/databases/mongodb/what-is-unwind.md` — Type E
21. [x] rewritten — `src/full-stack/databases/mongodb/what-is-sort.md` — Type E
22. [x] rewritten — `src/full-stack/databases/mongodb/embedding-vs-referencing.md` — Type E
23. [x] rewritten — `src/full-stack/databases/mongodb/when-should-you-embed-documents.md` — Type E
24. [x] rewritten — `src/full-stack/databases/mongodb/when-should-you-reference-documents.md` — Type E
25. [x] rewritten — `src/full-stack/databases/mongodb/how-do-you-model-many-to-many-relationships.md` — Type E
26. [x] rewritten — `src/full-stack/databases/mongodb/how-is-mongodb-schema-designed.md` — Type E
27. [x] rewritten — `src/full-stack/databases/mongodb/what-are-mongodb-transactions.md` — Type E
28. [x] rewritten — `src/full-stack/databases/mongodb/when-should-you-avoid-mongodb-transactions.md` — Type E
29. [x] rewritten — `src/full-stack/databases/mongodb/what-is-replica-set.md` — Type E
30. [x] rewritten — `src/full-stack/databases/mongodb/what-is-sharding.md` — Type E
31. [x] rewritten — `src/full-stack/databases/mongodb/what-is-read-concern.md` — Type E
32. [x] rewritten — `src/full-stack/databases/mongodb/what-is-write-concern.md` — Type E
33. [x] rewritten — `src/full-stack/databases/mongodb/how-do-you-optimize-mongodb-queries.md` — Type E
34. [x] rewritten — `src/full-stack/databases/mongodb/how-do-you-avoid-slow-lookup-queries.md` — Type E
35. [x] rewritten — `src/full-stack/databases/mongodb/how-do-you-handle-pagination-in-mongodb.md` — Type E

## Phase 4 — Mongoose

Process Mongoose leaf pages under `src/full-stack/backend/mongoose/` as Type E.

1. [x] rewritten — `src/full-stack/backend/mongoose/what-is-mongoose.md` — Type E
2. [x] rewritten — `src/full-stack/backend/mongoose/what-is-a-schema.md` — Type E
3. [x] rewritten — `src/full-stack/backend/mongoose/what-is-a-model.md` — Type E
4. [x] rewritten — `src/full-stack/backend/mongoose/what-is-a-document.md` — Type E
5. [x] rewritten — `src/full-stack/backend/mongoose/what-is-discriminator.md` — Type E
6. [x] rewritten — `src/full-stack/backend/mongoose/why-use-lean.md` — Type E
7. [x] rewritten — `src/full-stack/backend/mongoose/why-use-mongoose-with-mongodb.md` — Type E
8. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-define-indexes-in-mongoose.md` — Type E
9. [x] rewritten — `src/full-stack/backend/mongoose/what-are-schema-types.md` — Type E
10. [x] rewritten — `src/full-stack/backend/mongoose/what-are-validators.md` — Type E
11. [x] rewritten — `src/full-stack/backend/mongoose/what-are-custom-validators.md` — Type E
12. [x] rewritten — `src/full-stack/backend/mongoose/what-are-middleware-hooks.md` — Type E
13. [x] rewritten — `src/full-stack/backend/mongoose/what-are-virtuals.md` — Type E
14. [x] rewritten — `src/full-stack/backend/mongoose/what-are-getters-and-setters.md` — Type E
15. [x] rewritten — `src/full-stack/backend/mongoose/what-is-populate.md` — Type E
16. [x] rewritten — `src/full-stack/backend/mongoose/what-is-pre-save-hook.md` — Type E
17. [x] rewritten — `src/full-stack/backend/mongoose/what-is-post-save-hook.md` — Type E
18. [x] rewritten — `src/full-stack/backend/mongoose/what-is-lean-query.md` — Type E
19. [x] rewritten — `src/full-stack/backend/mongoose/what-is-aggregation-in-mongoose.md` — Type E
20. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-handle-connection-errors.md` — Type E
21. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-handle-transactions-in-mongoose.md` — Type E
22. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-handle-references.md` — Type E
23. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-handle-timestamps.md` — Type E
24. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-handle-unique-fields.md` — Type E
25. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-hash-password-before-saving-user.md` — Type E
26. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-implement-soft-delete.md` — Type E
27. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-optimize-mongoose-queries.md` — Type E
28. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-prevent-n-1-queries-with-populate.md` — Type E
29. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-structure-mongoose-models.md` — Type E
30. [x] rewritten — `src/full-stack/backend/mongoose/how-do-you-validate-nested-schemas.md` — Type E
31. [x] complete — all 30 `src/full-stack/backend/mongoose/*.md` pages rewritten

## Phase 5 — MERN full-stack patterns

Process MERN leaf pages under `src/full-stack/backend/mern/` as Type E.

1. [x] rewritten — `src/full-stack/backend/mern/how-does-mern-architecture-work.md` — Type E
2. [x] rewritten — `src/full-stack/backend/mern/how-does-react-communicate-with-express-backend.md` — Type A
3. [x] rewritten — `src/full-stack/backend/mern/how-do-you-design-auth-in-mern.md` — Type E
4. [x] rewritten — `src/full-stack/backend/mern/how-do-you-handle-refresh-tokens-in-mern.md` — Type E
5. [x] rewritten — `src/full-stack/backend/mern/how-do-you-protect-backend-routes.md` — Type E
6. [x] rewritten — `src/full-stack/backend/mern/how-do-you-protect-frontend-routes.md` — Type E
7. [x] rewritten — `src/full-stack/backend/mern/how-do-you-store-jwt-securely-in-mern.md` — Type E
8. [x] rewritten — `src/full-stack/backend/mern/how-do-you-handle-cors-in-mern.md` — Type E
9. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-file-uploads-in-mern.md` — Type E
10. [ ] assigned — `src/full-stack/backend/mern/how-do-you-implement-pagination-in-mern.md` — Type E
11. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-api-errors-in-mern.md` — Type E
12. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-form-validation-from-react-to-backend.md` — Type E
13. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-loading-error-states.md` — Type E
14. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-optimistic-ui-with-backend.md` — Type E
15. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-permissions.md` — Type E
16. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-race-conditions-in-search.md` — Type E
11. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-api-errors-in-mern.md` — Type E
12. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-form-validation-from-react-to-backend.md` — Type E
13. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-loading-error-states.md` — Type E
14. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-optimistic-ui-with-backend.md` — Type E
15. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-permissions.md` — Type E
16. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-race-conditions-in-search.md` — Type E
17. [ ] assigned — `src/full-stack/backend/mern/how-do-you-handle-socket-authentication.md` — Type E
18. [ ] assigned — `src/full-stack/backend/mern/how-do-you-implement-image-upload-with-mongodb.md` — Type E
19. [ ] assigned — `src/full-stack/backend/mern/how-do-you-implement-notifications-in-mern.md` — Type E
20. [ ] assigned — `src/full-stack/backend/mern/how-do-you-implement-real-time-chat-in-mern.md` — Type E
21. [ ] assigned — `src/full-stack/backend/mern/how-do-you-implement-search-in-mern.md` — Type E
22. [ ] assigned — `src/full-stack/backend/mern/how-do-you-manage-environment-variables.md` — Type E
23. [ ] assigned — `src/full-stack/backend/mern/how-do-you-monitor-mern-backend.md` — Type E
24. [ ] assigned — `src/full-stack/backend/mern/how-do-you-structure-a-mern-backend.md` — Type E
25. [ ] assigned — `src/full-stack/backend/mern/how-do-you-connect-frontend-and-backend-in-production.md` — Type E
26. [ ] assigned — `src/full-stack/backend/mern/how-do-you-deploy-mern-app.md` — Type E
27. [ ] assigned — `src/full-stack/backend/mern/how-do-you-design-admin-apis.md` — Type E
28. [ ] assigned — `src/full-stack/backend/mern/should-files-be-stored-in-mongodb-or-object-storage.md` — Type E
29. [ ] assigned — `src/full-stack/backend/mern/why-is-frontend-route-protection-not-enough.md` — Type E
30. [ ] assigned — `src/full-stack/backend/mern/how-do-you-avoid-duplicate-api-calls.md` — Type E
