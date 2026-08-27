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
9. [x] rewritten — `src/full-stack/backend/mern/how-do-you-handle-file-uploads-in-mern.md` — Type E
10. [x] rewritten — `src/full-stack/backend/mern/how-do-you-implement-pagination-in-mern.md` — Type E
11. [x] rewritten — `src/full-stack/backend/mern/how-do-you-handle-api-errors-in-mern.md` — Type E
12. [x] rewritten — `src/full-stack/backend/mern/how-do-you-handle-form-validation-from-react-to-backend.md` — Type E
13. [x] rewritten — `src/full-stack/backend/mern/how-do-you-handle-loading-error-states.md` — Type E
14. [x] rewritten — `src/full-stack/backend/mern/how-do-you-handle-optimistic-ui-with-backend.md` — Type E
15. [x] rewritten — `src/full-stack/backend/mern/how-do-you-handle-permissions.md` — Type E
16. [x] rewritten — `src/full-stack/backend/mern/how-do-you-handle-race-conditions-in-search.md` — Type E
17. [x] rewritten — `src/full-stack/backend/mern/how-do-you-handle-socket-authentication.md` — Type E
18. [x] rewritten — `src/full-stack/backend/mern/how-do-you-implement-image-upload-with-mongodb.md` — Type E
19. [x] rewritten — `src/full-stack/backend/mern/how-do-you-implement-notifications-in-mern.md` — Type E
20. [x] rewritten — `src/full-stack/backend/mern/how-do-you-implement-real-time-chat-in-mern.md` — Type E
21. [x] rewritten — `src/full-stack/backend/mern/how-do-you-implement-search-in-mern.md` — Type E
22. [x] rewritten — `src/full-stack/backend/mern/how-do-you-manage-environment-variables.md` — Type E
23. [x] rewritten — `src/full-stack/backend/mern/how-do-you-monitor-mern-backend.md` — Type E
24. [x] rewritten — `src/full-stack/backend/mern/how-do-you-structure-a-mern-backend.md` — Type E
25. [x] rewritten — `src/full-stack/backend/mern/how-do-you-connect-frontend-and-backend-in-production.md` — Type E
26. [ ] assigned — `src/full-stack/backend/mern/how-do-you-deploy-mern-app.md` — Type E
27. [ ] assigned — `src/full-stack/backend/mern/how-do-you-design-admin-apis.md` — Type E
28. [ ] assigned — `src/full-stack/backend/mern/should-files-be-stored-in-mongodb-or-object-storage.md` — Type E
29. [ ] assigned — `src/full-stack/backend/mern/why-is-frontend-route-protection-not-enough.md` — Type E
30. [ ] assigned — `src/full-stack/backend/mern/how-do-you-avoid-duplicate-api-calls.md` — Type E

## Phase 9 — Backend Core Concepts

Process 39 leaf pages under `src/full-stack/backend/concepts/` as Type A in SUMMARY order. Skip `index.md`.

1. [x] rewritten — `src/full-stack/backend/concepts/http-request-lifecycle.md` — Type A
2. [x] rewritten — `src/full-stack/backend/concepts/http-vs-https.md` — Type A
3. [x] rewritten — `src/full-stack/backend/concepts/rest.md` — Type A
4. [x] rewritten — `src/full-stack/backend/concepts/http-methods.md` — Type A
5. [x] rewritten — `src/full-stack/backend/concepts/put-vs-patch.md` — Type A
6. [x] rewritten — `src/full-stack/backend/concepts/idempotency.md` — Type A
7. [x] rewritten — `src/full-stack/backend/concepts/http-status-codes.md` — Type A
8. [x] rewritten — `src/full-stack/backend/concepts/401-vs-403.md` — Type A
9. [x] rewritten — `src/full-stack/backend/concepts/400-vs-422.md` — Type A
10. [x] rewritten — `src/full-stack/backend/concepts/stateless-apis.md` — Type A
11. [x] rewritten — `src/full-stack/backend/concepts/api-versioning.md` — Type A
12. [x] rewritten — `src/full-stack/backend/concepts/offset-pagination.md` — Type A
13. [x] rewritten — `src/full-stack/backend/concepts/cursor-pagination.md` — Type A
14. [x] rewritten — `src/full-stack/backend/concepts/cursor-vs-offset-pagination.md` — Type A
15. [x] rewritten — `src/full-stack/backend/concepts/api-filtering-sorting.md` — Type A
16. [x] rewritten — `src/full-stack/backend/concepts/backend-file-uploads.md` — Type A
17. [x] rewritten — `src/full-stack/backend/concepts/rate-limiting.md` — Type A
18. [x] rewritten — `src/full-stack/backend/concepts/request-throttling.md` — Type A
19. [x] rewritten — `src/full-stack/backend/concepts/backend-debouncing.md` — Type A
20. [x] rewritten — `src/full-stack/backend/concepts/request-validation.md` — Type A
21. [x] rewritten — `src/full-stack/backend/concepts/response-serialization.md` — Type A
22. [x] rewritten — `src/full-stack/backend/concepts/middleware.md` — Type A
23. [x] rewritten — `src/full-stack/backend/concepts/backend-framework-request-lifecycle.md` — Type A
24. [x] rewritten — `src/full-stack/backend/concepts/cors.md` — Type A
25. [x] rewritten — `src/full-stack/backend/concepts/preflight-request.md` — Type A
26. [x] rewritten — `src/full-stack/backend/concepts/same-origin-policy.md` — Type A
27. [x] rewritten — `src/full-stack/backend/concepts/backend-caching.md` — Type A
28. [x] rewritten — `src/full-stack/backend/concepts/cache-headers.md` — Type A
29. [x] rewritten — `src/full-stack/backend/concepts/etag.md` — Type A
30. [x] rewritten — `src/full-stack/backend/concepts/cache-control.md` — Type A
31. [x] rewritten — `src/full-stack/backend/concepts/cdn-caching.md` — Type A
32. [x] rewritten — `src/full-stack/backend/concepts/server-side-caching.md` — Type A
33. [x] rewritten — `src/full-stack/backend/concepts/reverse-proxy.md` — Type A
34. [x] rewritten — `src/full-stack/backend/concepts/load-balancing.md` — Type A
35. [x] rewritten — `src/full-stack/backend/concepts/horizontal-scaling.md` — Type A
36. [x] rewritten — `src/full-stack/backend/concepts/vertical-scaling.md` — Type A
37. [x] rewritten — `src/full-stack/backend/concepts/graceful-shutdown.md` — Type A
38. [x] rewritten — `src/full-stack/backend/concepts/health-check-endpoint.md` — Type A
39. [x] rewritten — `src/full-stack/backend/concepts/observability.md` — Type A

## Phase 5 — Express

Process 30 leaf pages under `src/full-stack/backend/express/` as Type E in SUMMARY order. Skip `index.md`.

1. [x] rewritten — `src/full-stack/backend/express/what-is-express-js.md` — Type E
2. [x] rewritten — `src/full-stack/backend/express/how-does-express-middleware-work.md` — Type E
3. [x] rewritten — `src/full-stack/backend/express/what-is-request-response-lifecycle-in-express.md` — Type E
4. [x] rewritten — `src/full-stack/backend/express/how-do-you-define-routes.md` — Type E
5. [x] rewritten — `src/full-stack/backend/express/how-do-you-split-routes.md` — Type E
6. [x] rewritten — `src/full-stack/backend/express/how-do-you-create-middleware.md` — Type E
7. [x] rewritten — `src/full-stack/backend/express/what-is-error-handling-middleware.md` — Type E
8. [x] rewritten — `src/full-stack/backend/express/how-do-you-handle-async-errors-in-express.md` — Type E
9. [x] rewritten — `src/full-stack/backend/express/how-do-you-validate-request-body.md` — Type E
10. [x] rewritten — `src/full-stack/backend/express/how-do-you-handle-file-uploads.md` — Type E
11. [x] rewritten — `src/full-stack/backend/express/how-do-you-serve-static-files.md` — Type E
12. [x] rewritten — `src/full-stack/backend/express/how-do-you-implement-jwt-authentication.md` — Type E
13. [x] rewritten — `src/full-stack/backend/express/how-do-you-implement-role-based-authorization.md` — Type E
14. [x] rewritten — `src/full-stack/backend/express/how-do-you-implement-refresh-tokens.md` — Type E
15. [x] rewritten — `src/full-stack/backend/express/how-do-you-hash-passwords.md` — Type E
16. [x] rewritten — `src/full-stack/backend/express/how-do-you-use-cookies-in-express.md` — Type E
17. [x] rewritten — `src/full-stack/backend/express/how-do-you-handle-cors.md` — Type E
18. [x] rewritten — `src/full-stack/backend/express/how-do-you-rate-limit-apis.md` — Type E
19. [x] rewritten — `src/full-stack/backend/express/how-do-you-secure-express-app.md` — Type E
20. [x] rewritten — `src/full-stack/backend/express/what-is-helmet.md` — Type E
21. [x] rewritten — `src/full-stack/backend/express/how-do-you-prevent-nosql-injection.md` — Type E
22. [x] rewritten — `src/full-stack/backend/express/how-do-you-prevent-xss.md` — Type E
23. [x] rewritten — `src/full-stack/backend/express/how-do-you-handle-logs.md` — Type E
24. [x] rewritten — `src/full-stack/backend/express/how-do-you-structure-a-large-express-app.md` — Type E
25. [ ] assigned — `src/full-stack/backend/express/how-do-you-implement-global-error-handling.md` — Type E
26. [ ] assigned — `src/full-stack/backend/express/how-do-you-implement-pagination.md` — Type E
27. [ ] assigned — `src/full-stack/backend/express/how-do-you-implement-search.md` — Type E
28. [ ] assigned — `src/full-stack/backend/express/how-do-you-handle-transactions.md` — Type E
29. [ ] assigned — `src/full-stack/backend/express/how-do-you-test-express-apis.md` — Type E
30. [ ] assigned — `src/full-stack/backend/express/how-do-you-deploy-express-app.md` — Type E

## Phase 5 — FastAPI

Process 50 leaf pages under `src/full-stack/backend/fastapi/` as Type E in SUMMARY order. Skip `index.md`.

1. [ ] queued — `src/full-stack/backend/fastapi/what-is-fastapi.md` — Type E
2. [ ] queued — `src/full-stack/backend/fastapi/why-fastapi-is-fast.md` — Type E
3. [ ] queued — `src/full-stack/backend/fastapi/asgi.md` — Type E
4. [ ] queued — `src/full-stack/backend/fastapi/uvicorn.md` — Type E
5. [ ] queued — `src/full-stack/backend/fastapi/starlette.md` — Type E
6. [ ] queued — `src/full-stack/backend/fastapi/pydantic.md` — Type E
7. [ ] queued — `src/full-stack/backend/fastapi/request-body-validation.md` — Type E
8. [ ] queued — `src/full-stack/backend/fastapi/swagger-docs.md` — Type E
9. [ ] queued — `src/full-stack/backend/fastapi/dependency-injection.md` — Type E
10. [ ] queued — `src/full-stack/backend/fastapi/reusable-dependencies.md` — Type E
11. [ ] queued — `src/full-stack/backend/fastapi/path-parameters.md` — Type E
12. [ ] queued — `src/full-stack/backend/fastapi/query-parameters.md` — Type E
13. [ ] queued — `src/full-stack/backend/fastapi/validate-request-body.md` — Type E
14. [ ] queued — `src/full-stack/backend/fastapi/response-models.md` — Type E
15. [ ] queued — `src/full-stack/backend/fastapi/response-model.md` — Type E
16. [ ] queued — `src/full-stack/backend/fastapi/depends.md` — Type E
17. [ ] queued — `src/full-stack/backend/fastapi/apirouter.md` — Type E
18. [ ] queued — `src/full-stack/backend/fastapi/split-routes.md` — Type E
19. [ ] queued — `src/full-stack/backend/fastapi/large-project-structure.md` — Type E
20. [ ] queued — `src/full-stack/backend/fastapi/middleware.md` — Type E
21. [ ] queued — `src/full-stack/backend/fastapi/custom-exception-handlers.md` — Type E
22. [ ] queued — `src/full-stack/backend/fastapi/validation-errors.md` — Type E
23. [ ] queued — `src/full-stack/backend/fastapi/global-errors.md` — Type E
24. [ ] queued — `src/full-stack/backend/fastapi/custom-status-codes.md` — Type E
25. [ ] queued — `src/full-stack/backend/fastapi/file-uploads.md` — Type E
26. [ ] queued — `src/full-stack/backend/fastapi/stream-large-files.md` — Type E
27. [ ] queued — `src/full-stack/backend/fastapi/static-files.md` — Type E
28. [ ] queued — `src/full-stack/backend/fastapi/background-tasks.md` — Type E
29. [ ] queued — `src/full-stack/backend/fastapi/lifespan-events.md` — Type E
30. [ ] queued — `src/full-stack/backend/fastapi/startup-shutdown-logic.md` — Type E
31. [ ] queued — `src/full-stack/backend/fastapi/environment-variables.md` — Type E
32. [ ] queued — `src/full-stack/backend/fastapi/settings-management.md` — Type E
33. [ ] queued — `src/full-stack/backend/fastapi/jwt-auth.md` — Type E
34. [ ] queued — `src/full-stack/backend/fastapi/oauth2-password-flow.md` — Type E
35. [ ] queued — `src/full-stack/backend/fastapi/protect-routes.md` — Type E
36. [ ] queued — `src/full-stack/backend/fastapi/role-based-authorization.md` — Type E
37. [ ] queued — `src/full-stack/backend/fastapi/refresh-tokens.md` — Type E
38. [ ] queued — `src/full-stack/backend/fastapi/password-hashing.md` — Type E
39. [ ] queued — `src/full-stack/backend/fastapi/testing-fastapi.md` — Type E
40. [ ] queued — `src/full-stack/backend/fastapi/mock-dependencies.md` — Type E
41. [ ] queued — `src/full-stack/backend/fastapi/async-endpoints.md` — Type E
42. [ ] queued — `src/full-stack/backend/fastapi/sync-vs-async-routes.md` — Type E
43. [ ] queued — `src/full-stack/backend/fastapi/when-not-async.md` — Type E
44. [ ] queued — `src/full-stack/backend/fastapi/sqlalchemy-with-fastapi.md` — Type E
45. [ ] queued — `src/full-stack/backend/fastapi/db-sessions.md` — Type E
46. [ ] queued — `src/full-stack/backend/fastapi/prevent-db-session-leaks.md` — Type E
47. [ ] queued — `src/full-stack/backend/fastapi/alembic-migrations.md` — Type E
48. [ ] queued — `src/full-stack/backend/fastapi/transactions.md` — Type E
49. [ ] queued — `src/full-stack/backend/fastapi/rollback-transactions.md` — Type E
50. [ ] queued — `src/full-stack/backend/fastapi/pagination.md` — Type E

## Phase 4 — SQL

Process 40 leaf pages under `src/full-stack/databases/sql/` as Type E in alphabetical order. Skip `index.md`.

1. [x] rewritten — `src/full-stack/databases/sql/how-do-you-debug-a-slow-query.md` — Type E
2. [x] rewritten — `src/full-stack/databases/sql/how-do-you-prevent-deadlocks.md` — Type E
3. [x] rewritten — `src/full-stack/databases/sql/how-does-an-index-improve-query-performance.md` — Type E
4. [x] rewritten — `src/full-stack/databases/sql/what-are-1nf-2nf-and-3nf.md` — Type E
5. [x] rewritten — `src/full-stack/databases/sql/what-are-acid-properties.md` — Type E
6. [x] rewritten — `src/full-stack/databases/sql/what-is-a-clustered-index.md` — Type E
7. [x] rewritten — `src/full-stack/databases/sql/what-is-a-composite-index.md` — Type E
8. [x] rewritten — `src/full-stack/databases/sql/what-is-a-composite-key.md` — Type E
9. [x] rewritten — `src/full-stack/databases/sql/what-is-a-foreign-key.md` — Type E
10. [x] rewritten — `src/full-stack/databases/sql/what-is-a-non-clustered-index.md` — Type E
11. [x] rewritten — `src/full-stack/databases/sql/what-is-a-primary-key.md` — Type E
12. [x] rewritten — `src/full-stack/databases/sql/what-is-a-table.md` — Type E
13. [x] rewritten — `src/full-stack/databases/sql/what-is-a-transaction.md` — Type E
14. [x] rewritten — `src/full-stack/databases/sql/what-is-a-unique-key.md` — Type E
15. [x] rewritten — `src/full-stack/databases/sql/what-is-connection-pooling.md` — Type E
16. [x] rewritten — `src/full-stack/databases/sql/what-is-covering-index.md` — Type E
17. [x] rewritten — `src/full-stack/databases/sql/what-is-database-migration.md` — Type E
18. [x] rewritten — `src/full-stack/databases/sql/what-is-database-replication.md` — Type E
19. [x] rewritten — `src/full-stack/databases/sql/what-is-database-sharding.md` — Type E
20. [x] rewritten — `src/full-stack/databases/sql/what-is-deadlock.md` — Type E
21. [x] rewritten — `src/full-stack/databases/sql/what-is-denormalization.md` — Type E
22. [x] rewritten — `src/full-stack/databases/sql/what-is-dirty-read.md` — Type E
23. [x] rewritten — `src/full-stack/databases/sql/what-is-explain-analyze.md` — Type E
24. [x] rewritten — `src/full-stack/databases/sql/what-is-explain.md` — Type E
25. [x] rewritten — `src/full-stack/databases/sql/what-is-indexing.md` — Type E
26. [x] rewritten — `src/full-stack/databases/sql/what-is-isolation-level.md` — Type E
27. [x] rewritten — `src/full-stack/databases/sql/what-is-non-repeatable-read.md` — Type E
28. [x] rewritten — `src/full-stack/databases/sql/what-is-normalization.md` — Type E
29. [x] rewritten — `src/full-stack/databases/sql/what-is-optimistic-locking.md` — Type E
30. [x] rewritten — `src/full-stack/databases/sql/what-is-partitioning.md` — Type E
31. [x] rewritten — `src/full-stack/databases/sql/what-is-pessimistic-locking.md` — Type E
32. [x] rewritten — `src/full-stack/databases/sql/what-is-phantom-read.md` — Type E
33. [x] rewritten — `src/full-stack/databases/sql/what-is-query-execution-plan.md` — Type E
34. [x] rewritten — `src/full-stack/databases/sql/what-is-rdbms.md` — Type E
35. [x] rewritten — `src/full-stack/databases/sql/what-is-read-replica.md` — Type E
36. [x] rewritten — `src/full-stack/databases/sql/what-is-row-level-locking.md` — Type E
37. [x] rewritten — `src/full-stack/databases/sql/what-is-schema-migration.md` — Type E
38. [x] rewritten — `src/full-stack/databases/sql/what-is-sql.md` — Type E
39. [x] rewritten — `src/full-stack/databases/sql/what-is-table-level-locking.md` — Type E
40. [x] rewritten — `src/full-stack/databases/sql/when-can-indexes-hurt-performance.md` — Type E
41. [x] complete — all 40 `src/full-stack/databases/sql/*.md` leaf pages rewritten; track gate clean

## Phase 4 — PostgreSQL

Process 35 leaf pages under `src/full-stack/databases/postgresql/` as Type E in alphabetical order. Skip `index.md`.

1. [x] rewritten — `src/full-stack/databases/postgresql/how-do-you-optimize-slow-postgresql-queries.md` — Type E
2. [x] rewritten — `src/full-stack/databases/postgresql/how-do-you-query-jsonb-fields.md` — Type E
3. [x] rewritten — `src/full-stack/databases/postgresql/how-do-you-store-arrays-in-postgresql.md` — Type E
4. [x] rewritten — `src/full-stack/databases/postgresql/json-vs-jsonb.md` — Type E
5. [x] rewritten — `src/full-stack/databases/postgresql/postgresql-vs-mysql.md` — Type E
6. [x] rewritten — `src/full-stack/databases/postgresql/what-are-ctes.md` — Type E
7. [x] rewritten — `src/full-stack/databases/postgresql/what-are-database-views.md` — Type E
8. [x] rewritten — `src/full-stack/databases/postgresql/what-are-materialized-views.md` — Type E
9. [x] rewritten — `src/full-stack/databases/postgresql/what-are-postgresql-data-types.md` — Type E
10. [x] rewritten — `src/full-stack/databases/postgresql/what-are-window-functions.md` — Type E
11. [x] rewritten — `src/full-stack/databases/postgresql/what-is-advisory-lock.md` — Type E
12. [x] rewritten — `src/full-stack/databases/postgresql/what-is-autovacuum.md` — Type E
13. [x] rewritten — `src/full-stack/databases/postgresql/what-is-b-tree-index.md` — Type E
14. [x] rewritten — `src/full-stack/databases/postgresql/what-is-bigserial.md` — Type E
15. [x] rewritten — `src/full-stack/databases/postgresql/what-is-connection-pooling-with-pgbouncer.md` — Type E
16. [x] rewritten — `src/full-stack/databases/postgresql/what-is-explain-analyze.md` — Type E
17. [x] rewritten — `src/full-stack/databases/postgresql/what-is-expression-index.md` — Type E
18. [x] rewritten — `src/full-stack/databases/postgresql/what-is-full-text-search-in-postgresql.md` — Type E
19. [x] rewritten — `src/full-stack/databases/postgresql/what-is-gin-index.md` — Type E
20. [x] rewritten — `src/full-stack/databases/postgresql/what-is-gist-index.md` — Type E
21. [x] rewritten — `src/full-stack/databases/postgresql/what-is-jsonb.md` — Type E
22. [x] rewritten — `src/full-stack/databases/postgresql/what-is-logical-replication.md` — Type E
23. [x] rewritten — `src/full-stack/databases/postgresql/what-is-mvcc.md` — Type E
24. [x] rewritten — `src/full-stack/databases/postgresql/what-is-on-conflict.md` — Type E
25. [x] rewritten — `src/full-stack/databases/postgresql/what-is-partial-index.md` — Type E
26. [x] rewritten — `src/full-stack/databases/postgresql/what-is-partitioning-in-postgresql.md` — Type E
27. [x] rewritten — `src/full-stack/databases/postgresql/what-is-postgis.md` — Type E
28. [x] rewritten — `src/full-stack/databases/postgresql/what-is-postgresql.md` — Type E
29. [x] rewritten — `src/full-stack/databases/postgresql/what-is-row-level-locking.md` — Type E
30. [x] rewritten — `src/full-stack/databases/postgresql/what-is-serial.md` — Type E
31. [x] rewritten — `src/full-stack/databases/postgresql/what-is-streaming-replication.md` — Type E
32. [x] rewritten — `src/full-stack/databases/postgresql/what-is-transaction-isolation-in-postgresql.md` — Type E
33. [x] rewritten — `src/full-stack/databases/postgresql/what-is-upsert.md` — Type E
34. [x] rewritten — `src/full-stack/databases/postgresql/what-is-uuid-in-postgresql.md` — Type E
35. [x] rewritten — `src/full-stack/databases/postgresql/what-is-vacuum.md` — Type E
36. [x] complete — all 35 `src/full-stack/databases/postgresql/*.md` leaf pages rewritten; track gate clean

## Phase 4 — MySQL

Process 30 leaf pages under `src/full-stack/databases/mysql/` as Type E in alphabetical order. Skip `index.md`.

1. [x] rewritten — `src/full-stack/databases/mysql/how-do-you-backup-and-restore-mysql-database.md` — Type E
2. [x] rewritten — `src/full-stack/databases/mysql/how-do-you-debug-mysql-deadlocks.md` — Type E
3. [x] rewritten — `src/full-stack/databases/mysql/how-do-you-handle-migrations-in-mysql.md` — Type E
4. [x] rewritten — `src/full-stack/databases/mysql/how-do-you-optimize-slow-mysql-queries.md` — Type E
5. [x] rewritten — `src/full-stack/databases/mysql/how-do-you-store-json-in-mysql.md` — Type E
6. [x] rewritten — `src/full-stack/databases/mysql/innodb-vs-myisam.md` — Type E
7. [x] rewritten — `src/full-stack/databases/mysql/what-are-mysql-isolation-levels.md` — Type E
8. [x] rewritten — `src/full-stack/databases/mysql/what-are-mysql-json-functions.md` — Type E
9. [x] rewritten — `src/full-stack/databases/mysql/what-is-auto-increment.md` — Type E
10. [x] rewritten — `src/full-stack/databases/mysql/what-is-binlog.md` — Type E
11. [x] rewritten — `src/full-stack/databases/mysql/what-is-charset.md` — Type E
12. [x] rewritten — `src/full-stack/databases/mysql/what-is-collation.md` — Type E
13. [x] rewritten — `src/full-stack/databases/mysql/what-is-composite-index-in-mysql.md` — Type E
14. [x] rewritten — `src/full-stack/databases/mysql/what-is-connection-pool-in-mysql.md` — Type E
15. [x] rewritten — `src/full-stack/databases/mysql/what-is-datetime-vs-timestamp.md` — Type E
16. [x] rewritten — `src/full-stack/databases/mysql/what-is-deadlock-in-mysql.md` — Type E
17. [x] rewritten — `src/full-stack/databases/mysql/what-is-explain-in-mysql.md` — Type E
18. [x] rewritten — `src/full-stack/databases/mysql/what-is-full-text-index-in-mysql.md` — Type E
19. [x] rewritten — `src/full-stack/databases/mysql/what-is-gap-lock.md` — Type E
20. [x] rewritten — `src/full-stack/databases/mysql/what-is-innodb.md` — Type E
21. [x] rewritten — `src/full-stack/databases/mysql/what-is-master-slave-replication.md` — Type E
22. [x] rewritten — `src/full-stack/databases/mysql/what-is-myisam.md` — Type E
23. [x] rewritten — `src/full-stack/databases/mysql/what-is-mysql-indexing.md` — Type E
24. [x] rewritten — `src/full-stack/databases/mysql/what-is-mysql-query-cache.md` — Type E
25. [x] rewritten — `src/full-stack/databases/mysql/what-is-mysql-replication.md` — Type E
26. [x] rewritten — `src/full-stack/databases/mysql/what-is-mysql-storage-engine.md` — Type E
27. [x] rewritten — `src/full-stack/databases/mysql/what-is-mysql.md` — Type E
28. [x] rewritten — `src/full-stack/databases/mysql/what-is-next-key-lock.md` — Type E
29. [x] rewritten — `src/full-stack/databases/mysql/what-is-read-replica.md` — Type E
30. [x] rewritten — `src/full-stack/databases/mysql/what-is-varchar-vs-text.md` — Type E
31. [x] complete — all 30 `src/full-stack/databases/mysql/*.md` leaf pages rewritten; track gate clean

## Phase 4 — SQL Query Practice

Process 30 leaf pages under `src/full-stack/databases/sql-query-practice/` as Type B (one SQL problem per page) in alphabetical order. Skip `index.md`.

1. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-aggregate-json-data.md` — Type B
2. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-calculate-monthly-revenue.md` — Type B
3. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-calculate-running-total.md` — Type B
4. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-count-users-by-role.md` — Type B
5. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-delete-duplicate-rows.md` — Type B
6. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-filter-by-date-range.md` — Type B
7. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-find-customers-who-ordered-in-the-last-30-days.md` — Type B
8. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-find-duplicate-emails.md` — Type B
9. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-find-inactive-users.md` — Type B
10. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-find-parent-child-hierarchy.md` — Type B
11. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-find-top-5-products-by-sales.md` — Type B
12. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-get-orders-with-user-details.md` — Type B
13. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-get-the-nth-highest-salary.md` — Type B
14. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-get-the-second-highest-salary.md` — Type B
15. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-get-users-with-no-orders.md` — Type B
16. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-paginate-records.md` — Type B
17. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-soft-delete-records.md` — Type B
18. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-to-update-records-using-join.md` — Type B
19. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-cte.md` — Type B
20. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-dense-rank.md` — Type B
21. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-full-outer-join.md` — Type B
22. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-group-by.md` — Type B
23. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-having.md` — Type B
24. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-inner-join.md` — Type B
25. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-left-join.md` — Type B
26. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-rank.md` — Type B
27. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-right-join.md` — Type B
28. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-row-number.md` — Type B
29. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-subquery.md` — Type B
30. [x] rewritten — `src/full-stack/databases/sql-query-practice/write-a-query-using-window-functions.md` — Type B
31. [x] complete — all 30 `src/full-stack/databases/sql-query-practice/*.md` leaf pages rewritten; track gate clean

## Phase 7 — Senior Scenarios

Process 25 leaf pages under `src/full-stack/backend/senior-scenarios/` as Type E/D in alphabetical order. Skip `index.md`. Classify Type D only if the page is genuinely a system-design build; most are debugging/pattern pages → Type E.

1. [x] rewritten — `src/full-stack/backend/senior-scenarios/api-is-slow-in-production-how-will-you-debug-it.md` — Type E
2. [x] rewritten — `src/full-stack/backend/senior-scenarios/api-works-locally-but-fails-in-production-how-will-you-debug-it.md` — Type E
3. [x] rewritten — `src/full-stack/backend/senior-scenarios/backend-has-high-traffic-spikes-how-will-you-scale-it.md` — Type E
4. [x] rewritten — `src/full-stack/backend/senior-scenarios/cors-works-in-postman-but-fails-in-browser-why.md` — Type E
5. [x] rewritten — `src/full-stack/backend/senior-scenarios/database-cpu-is-high-how-will-you-debug-it.md` — Type E
6. [x] rewritten — `src/full-stack/backend/senior-scenarios/duplicate-orders-are-getting-created-how-will-you-fix-it.md` — Type E
7. [x] rewritten — `src/full-stack/backend/senior-scenarios/fastapi-server-workers-are-blocked-how-will-you-debug-it.md` — Type E
8. [x] rewritten — `src/full-stack/backend/senior-scenarios/file-upload-fails-for-large-files-how-will-you-fix-it.md` — Type E
9. [x] rewritten — `src/full-stack/backend/senior-scenarios/how-will-you-deploy-a-breaking-schema-change-safely.md` — Type E
10. [x] rewritten — `src/full-stack/backend/senior-scenarios/how-will-you-design-a-backend-that-supports-mobile-and-web-clients.md` — Type E/D
11. [x] rewritten — `src/full-stack/backend/senior-scenarios/how-will-you-handle-large-reports.md` — Type E
12. [x] rewritten — `src/full-stack/backend/senior-scenarios/how-will-you-handle-multi-tenant-data-isolation.md` — Type E
13. [x] rewritten — `src/full-stack/backend/senior-scenarios/how-will-you-migrate-a-large-table-without-downtime.md` — Type E
14. [x] rewritten — `src/full-stack/backend/senior-scenarios/how-will-you-prevent-one-tenant-from-accessing-another-tenant-s-data.md` — Type E
15. [x] rewritten — `src/full-stack/backend/senior-scenarios/how-will-you-process-1-million-records-efficiently.md` — Type E
16. [x] rewritten — `src/full-stack/backend/senior-scenarios/jwt-works-for-some-users-but-fails-for-others-why.md` — Type E
17. [x] rewritten — `src/full-stack/backend/senior-scenarios/mongodb-query-is-slow-how-will-you-optimize-it.md` — Type E
18. [x] rewritten — `src/full-stack/backend/senior-scenarios/mysql-deadlock-occurs-how-will-you-debug-it.md` — Type E
19. [x] rewritten — `src/full-stack/backend/senior-scenarios/node-js-server-memory-keeps-increasing-how-will-you-debug-it.md` — Type E
20. [x] rewritten — `src/full-stack/backend/senior-scenarios/one-endpoint-randomly-times-out-how-will-you-debug-it.md` — Type E
21. [x] rewritten — `src/full-stack/backend/senior-scenarios/payment-webhook-is-called-multiple-times-how-will-you-handle-it.md` — Type E
22. [x] rewritten — `src/full-stack/backend/senior-scenarios/postgresql-query-is-slow-how-will-you-optimize-it.md` — Type E
23. [x] rewritten — `src/full-stack/backend/senior-scenarios/refresh-token-rotation-causes-logout-issues-how-will-you-fix-it.md` — Type E
24. [x] rewritten — `src/full-stack/backend/senior-scenarios/search-api-returns-old-results-how-will-you-debug-it.md` — Type E
25. [x] rewritten — `src/full-stack/backend/senior-scenarios/users-are-getting-logged-out-randomly-how-will-you-debug-it.md` — Type E
26. [x] complete — all 25 `src/full-stack/backend/senior-scenarios/*.md` leaf pages rewritten; track gate clean

## Phase 10 — SQLAlchemy

Process 30 leaf pages under `src/full-stack/backend/sqlalchemy/` as Type E/A in SUMMARY order. Skip `index.md`.

1. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-sqlalchemy.md` — Type A
2. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-orm.md` — Type A
3. [x] rewritten — `src/full-stack/backend/sqlalchemy/orm-vs-raw-sql.md` — Type A
4. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-sqlalchemy-core.md` — Type A
5. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-sqlalchemy-orm.md` — Type A
6. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-declarative-model.md` — Type A
7. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-session-in-sqlalchemy.md` — Type A
8. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-create-a-database-session.md` — Type A
9. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-manage-session-lifecycle.md` — Type A
10. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-connection-pool.md` — Type A
11. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-define-relationships.md` — Type A
12. [x] rewritten — `src/full-stack/backend/sqlalchemy/one-to-one-relationship.md` — Type A
13. [x] rewritten — `src/full-stack/backend/sqlalchemy/one-to-many-relationship.md` — Type A
14. [x] rewritten — `src/full-stack/backend/sqlalchemy/many-to-many-relationship.md` — Type A
15. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-lazy-loading.md` — Type A
16. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-eager-loading.md` — Type A
17. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-n-1-query-problem.md` — Type A
18. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-solve-n-1-query-problem.md` — Type A
19. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-joinedload.md` — Type A
20. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-selectinload.md` — Type A
21. [x] rewritten — `src/full-stack/backend/sqlalchemy/what-is-transaction-handling-in-sqlalchemy.md` — Type A
22. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-rollback-transactions.md` — Type A
23. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-use-alembic.md` — Type A
24. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-create-migrations.md` — Type A
25. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-handle-schema-changes.md` — Type A
26. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-write-raw-sql-in-sqlalchemy.md` — Type A
27. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-do-bulk-inserts.md` — Type A
28. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-optimize-sqlalchemy-queries.md` — Type A
29. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-handle-soft-deletes.md` — Type A
30. [x] rewritten — `src/full-stack/backend/sqlalchemy/how-do-you-implement-audit-columns.md` — Type A

