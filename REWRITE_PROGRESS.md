# Study-note rewrite progress

Updated: 2026-08-26

This file replaces the retired `REWRITTEN_FILES.md` list. The detailed, page-by-page status remains in [`docs/superpowers/plans/2026-08-25-one-topic-rewrite-tracker.md`](docs/superpowers/plans/2026-08-25-one-topic-rewrite-tracker.md).

---

## Completed Sections Summary (313 pages complete)

| Completed Section | Page Count | Status |
|---|---:|---|
| **JavaScript Core Concepts** (`src/javascript/concepts/`) | 56 | Complete |
| **Frontend Fundamentals** (`src/frontend/html/`, `css/`, `web/`, + single pages) | 20 | Complete |
| **React Core Concepts** (`src/react/concepts/`) | 66 | Complete |
| **React Focused Chapters** (`src/react/*.md`) | 7 | Complete |
| **Backend Core Concepts** (`src/full-stack/backend/concepts/`) | 39 | Complete |
| **Backend System Design** (`src/full-stack/backend/system-design/`) | 30 | Complete |
| **Node.js Core Concepts** (`src/full-stack/backend/nodejs/`) | 30 | Complete |
| **MongoDB Core Concepts** (`src/full-stack/databases/mongodb/`) | 35 | Complete |
| **Mongoose Core Concepts** (`src/full-stack/backend/mongoose/`) | 30 | Complete |

---

## 1. Backend Core Concepts — Complete (39 pages)

All 39 Backend Concept pages are rewritten in canonical Type A format, verified with `mdbook build`, and committed:

1. `src/full-stack/backend/concepts/http-request-lifecycle.md` — `416021c`
2. `src/full-stack/backend/concepts/http-vs-https.md` — `31383e2`
3. `src/full-stack/backend/concepts/rest.md` — `4020b3d`
4. `src/full-stack/backend/concepts/http-methods.md` — `0510cd5`
5. `src/full-stack/backend/concepts/put-vs-patch.md` — `087d003`
6. `src/full-stack/backend/concepts/idempotency.md` — `c458bb9`
7. `src/full-stack/backend/concepts/http-status-codes.md` — `521b7c7`
8. `src/full-stack/backend/concepts/401-vs-403.md` — `4ee2c1a`
9. `src/full-stack/backend/concepts/400-vs-422.md` — `9a9f062`
10. `src/full-stack/backend/concepts/stateless-apis.md` — `b9f38f2`
11. `src/full-stack/backend/concepts/api-versioning.md` — `68a1513`
12. `src/full-stack/backend/concepts/offset-pagination.md` — `695eb8e`
13. `src/full-stack/backend/concepts/cursor-pagination.md` — `4394b59`
14. `src/full-stack/backend/concepts/cursor-vs-offset-pagination.md` — `d18da3b`
15. `src/full-stack/backend/concepts/api-filtering-sorting.md` — `1fd8a51`
16. `src/full-stack/backend/concepts/backend-file-uploads.md` — `3f03224`
17. `src/full-stack/backend/concepts/rate-limiting.md` — `aa3b37d`
18. `src/full-stack/backend/concepts/request-throttling.md` — `5ec26ce`
19. `src/full-stack/backend/concepts/backend-debouncing.md` — `d87a871`
20. `src/full-stack/backend/concepts/request-validation.md` — `75c7931`
21. `src/full-stack/backend/concepts/response-serialization.md` — `9ce32cd`
22. `src/full-stack/backend/concepts/middleware.md` — `7c1e95a`
23. `src/full-stack/backend/concepts/backend-framework-request-lifecycle.md` — `4824ffd`
24. `src/full-stack/backend/concepts/cors.md` — `fae2bbb`
25. `src/full-stack/backend/concepts/preflight-request.md` — `2cb4934`
26. `src/full-stack/backend/concepts/same-origin-policy.md` — `bce05bc`
27. `src/full-stack/backend/concepts/backend-caching.md` — `d7ebf60`
28. `src/full-stack/backend/concepts/cache-headers.md` — `a8e7e88`
29. `src/full-stack/backend/concepts/etag.md` — `6590454`
30. `src/full-stack/backend/concepts/cache-control.md` — `02681ab`
31. `src/full-stack/backend/concepts/cdn-caching.md` — `0d57dc6`
32. `src/full-stack/backend/concepts/server-side-caching.md` — `7c783d8`
33. `src/full-stack/backend/concepts/reverse-proxy.md` — `be07d35`
34. `src/full-stack/backend/concepts/load-balancing.md` — `6038c9c`
35. `src/full-stack/backend/concepts/horizontal-scaling.md` — `a98e590`
36. `src/full-stack/backend/concepts/vertical-scaling.md` — `1efb197`
37. `src/full-stack/backend/concepts/graceful-shutdown.md` — `0050da9`
38. `src/full-stack/backend/concepts/health-check-endpoint.md` — `ab81308`
39. `src/full-stack/backend/concepts/observability.md` — `c8cddb5`

---

## 2. JavaScript Core Concepts — Complete (56 pages)

56 of 56 JavaScript concept pages are reviewed and committed:

1. `src/javascript/concepts/memory-heap.md` — `be5f70d`, `205763a`
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
40. `src/javascript/concepts/history-api.md` — `3c2b14b`
41. `src/javascript/concepts/file-api.md` — `4058e0e`
42. `src/javascript/concepts/clipboard-api.md` — `c19e94f`
43. `src/javascript/concepts/performance-api.md` — `9f4e48f`
44. `src/javascript/concepts/dom-based-xss.md` — `122089a`
45. `src/javascript/concepts/open-redirects.md` — `39a0a5c`
46. `src/javascript/concepts/browser-storage-token-risks.md` — `d65309b`
47. `src/javascript/concepts/xss-csrf-cors-csp.md` — `f6c27b0`
48. `src/javascript/concepts/detached-dom-nodes.md` — `d2c87b2`
49. `src/javascript/concepts/layout-thrashing.md` — `e99faaa`
50. `src/javascript/concepts/heap-snapshots.md` — `1049dc8`
51. `src/javascript/concepts/garbage-collection-memory-leaks.md` — `2081c80`
52. `src/javascript/concepts/debounce-and-throttle.md` — `cb8231b`
53. `src/javascript/concepts/query-string-parser.md` — `8b46d8e`
54. `src/javascript/concepts/custom-new.md` — `7a2beef`
55. `src/javascript/concepts/custom-instanceof.md` — `8ba1db3`
56. `src/javascript/concepts/virtual-list-basics.md` — `8f5eedf`

---

## 3. React Focused Chapters — Complete (7 pages)

| Page | Commit |
|---|---|
| `src/react/server-state.md` | `854030a` |
| `src/react/routing.md` | `6900159` |
| `src/react/forms.md` | `809df15` |
| `src/react/typescript-react.md` | `c22808e` |
| `src/react/component-design.md` | `c22808e` |
| `src/react/security-build-platform.md` | `f9fba1a` |
| `src/react/senior-scenarios.md` | `a53ae65` |

---

## Pending Rewrite Scope

### JavaScript Output Questions (Active Type C Queue)

| Collection | Total Puzzles | Accepted Pages | Remaining |
|---|---:|---:|---:|
| Part 1 | 40 | 5 | 35 (Questions 6–40) |
| Part 2 | 100 | 5 | 95 (Questions 5, 6, and 8–100; Question 7 is accepted) |
| Part 3 | 203 | 5 | 198 (Questions 6–203) |

### Backend Sections (Pending Rewrite)

*(Completed sections `Backend concepts` [39/39], `system-design` [30/30], `nodejs` [30/30], and `mongoose` [30/30] have been removed from this table).*

| Section | Leaf Pages Remaining |
|---|---:|
| API design | 30 |
| Authentication | 30 |
| Coding practice | 30 |
| Deployment | 25 |
| Express | 30 |
| FastAPI | 50 |
| Full-stack integration | 20 |
| Observability | 25 |
| Performance | 25 |
| Python backend | 30 |
| Queues | 20 |
| Redis | 20 |
| Security | 30 |
| Senior scenarios | 25 |
| SQLAlchemy | 30 |
| Testing | 20 |
| WebSockets | 20 |
| **Total Backend Remaining** | **470** |

### MERN Status

MERN has 30 leaf pages total: 25 are rewritten and 5 are assigned in the tracker.

### Database Sections (Pending Rewrite)

*(Completed section `mongodb` [35/35] has been removed from this table).*

| Section | Leaf Pages Remaining |
|---|---:|
| SQL | 40 |
| MySQL | 30 |
| PostgreSQL | 35 |
| SQL query practice | 30 |
| **Total Database Remaining** | **135** |

---

## Cross-Project Summary

- **Total Completed Concept/System Pages:** **313**
- **Total Outstanding Leaf Pages:** **605** (470 Backend + 135 Database)
