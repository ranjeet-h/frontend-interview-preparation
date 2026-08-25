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
9. [ ] assigned — `src/javascript/concepts/hoisting.md` — Type A
10. [x] rewritten — `src/javascript/concepts/temporal-dead-zone.md` — Type A
11. [x] rewritten — `src/javascript/concepts/closures.md` — Type A
12. [ ] assigned — `src/javascript/concepts/closure-memory-retention.md` — Type A
13. [ ] assigned — `src/javascript/concepts/closures-in-loops.md` — Type A
14. [ ] assigned — `src/javascript/concepts/closures-in-event-handlers.md` — Type A
15. [ ] assigned — `src/javascript/concepts/event-loop.md` — Type A
16. [ ] assigned — `src/javascript/concepts/microtask-queue.md` — Type A
17. [ ] assigned — `src/javascript/concepts/macrotask-queue.md` — Type A
18. [ ] queued — `src/javascript/concepts/rendering-pipeline-interaction.md` — Type A
19. [ ] queued — `src/javascript/concepts/promise-states.md` — Type A
20. [ ] queued — `src/javascript/concepts/promise-chaining.md` — Type A
21. [ ] queued — `src/javascript/concepts/async-await.md` — Type A
22. [ ] queued — `src/javascript/concepts/timeout-handling.md` — Type A
23. [ ] queued — `src/javascript/concepts/this-binding.md` — Type A
24. [ ] queued — `src/javascript/concepts/primitive-vs-reference-values.md` — Type A
25. [ ] queued — `src/javascript/concepts/shallow-copy-vs-deep-copy.md` — Type A
26. [ ] queued — `src/javascript/concepts/array-mutation.md` — Type A
27. [ ] queued — `src/javascript/concepts/type-coercion-and-equality.md` — Type A
28. [ ] queued — remaining `src/javascript/concepts/*.md` in index order

Do not rewrite `src/javascript/output-questions.md`, `output-questions-2.md`, or `output-questions-3.md` as a single page. Each output puzzle is its own later Type C task after it is split into its own file.

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
