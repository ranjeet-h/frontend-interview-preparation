# Study-note rewrite progress

Updated: 2026-08-25

This file replaces the retired `REWRITTEN_FILES.md` list. The detailed, page-by-page status remains in [`docs/superpowers/plans/2026-08-25-one-topic-rewrite-tracker.md`](docs/superpowers/plans/2026-08-25-one-topic-rewrite-tracker.md), and the broader project rollup remains in [`REWRITE-PROGRESS.md`](REWRITE-PROGRESS.md).

## Current JavaScript concept queue

39 of 56 JavaScript concept pages are reviewed and committed. The commit for each accepted page is recorded here.

1. `src/javascript/concepts/memory-heap.md` — `be5f70d`, wording refinement `205763a`
2. `src/javascript/concepts/execution-context.md` — `c540720`
3. `src/javascript/concepts/global-execution-context.md` — `ab108fa`
4. `src/javascript/concepts/function-execution-context.md` — `ed1fcf9`
5. `src/javascript/concepts/call-stack.md` — `9f3b9b0`
6. `src/javascript/concepts/lexical-environment.md` — `75f4718`
7. `src/javascript/concepts/lexical-scoping.md` — `4e6d5e8`
8. `src/javascript/concepts/scope-chain.md` — `2cd4ef3`
9. `src/javascript/concepts/hoisting.md` — `b93e070`
10. `src/javascript/concepts/temporal-dead-zone.md` — `48d8d46`
11. `src/javascript/concepts/closures.md` — `ac5c4ef`
12. `src/javascript/concepts/closure-memory-retention.md` — `e79cd57`
13. `src/javascript/concepts/closures-in-loops.md` — `f26a48c`
14. `src/javascript/concepts/closures-in-event-handlers.md` — `b0f9463`
15. `src/javascript/concepts/event-loop.md` — `4b0e29e`
16. `src/javascript/concepts/microtask-queue.md` — `073db09`
17. `src/javascript/concepts/macrotask-queue.md` — `b2e1980`
18. `src/javascript/concepts/rendering-pipeline-interaction.md` — `fd58b2e`
19. `src/javascript/concepts/promise-states.md` — `656e4eb`
20. `src/javascript/concepts/promise-chaining.md` — `4d0822e`
21. `src/javascript/concepts/async-await.md` — `283aca5`
22. `src/javascript/concepts/timeout-handling.md` — `681bf34`
23. `src/javascript/concepts/this-binding.md` — `c0e4578`
24. `src/javascript/concepts/primitive-vs-reference-values.md` — `aa218e1`
25. `src/javascript/concepts/shallow-copy-vs-deep-copy.md` — `f57c70b`
26. `src/javascript/concepts/array-mutation.md` — `9ff19bb`
27. `src/javascript/concepts/type-coercion-and-equality.md` — `c27eaa1`
28. `src/javascript/concepts/flatmap.md` — `bacb460`
29. `src/javascript/concepts/private-fields.md` — `f1acc84`
30. `src/javascript/concepts/copying-array-methods.md` — `d8c62c9`
31. `src/javascript/concepts/barrel-files.md` — `6997275`
32. `src/javascript/concepts/passive-listeners.md` — `debf639`
33. `src/javascript/concepts/custom-events.md` — `f56dea1`
34. `src/javascript/concepts/pointer-events.md` — `ca4322d`
35. `src/javascript/concepts/focus-and-blur.md` — `f7059f1`
36. `src/javascript/concepts/dom-event-propagation.md` — `cb3e4a2`
37. `src/javascript/concepts/indexeddb.md` — `ebd36a9`
38. `src/javascript/concepts/storage-event.md` — `36e18a4`
39. `src/javascript/concepts/broadcast-channel.md` — `3d2c18e`

## Active JavaScript pages

- `src/javascript/concepts/history-api.md` — Luna worker active; review pending
- `src/javascript/concepts/file-api.md` — Luna worker active; review pending

## Cross-project synchronization

- The detailed tracker currently has 203 page rows marked `rewritten` and 18 rows marked `assigned`.
- The broader rollup in `REWRITE-PROGRESS.md` includes the other completed frontend, React, system-design, Node.js, MongoDB, Mongoose, and MERN work.
- Update the detailed tracker only after a page has passed its scoped review and target-only commit.
