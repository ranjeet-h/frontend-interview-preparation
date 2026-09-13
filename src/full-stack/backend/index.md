# Backend & APIs

> Growing track for server-side JavaScript, Python, APIs, auth, and backend architecture.

This track currently includes imported CSV question banks. The deeper backend chapters will follow
the same navigation pattern as the rest of the book.

## Planned chapters

| Chapter | Topics |
|---|---|
| Node.js Runtime & Server Patterns | Event loop, streams, concurrency, worker threads, runtime trade-offs |
| API Design & Contracts | REST, versioning, pagination, errors, idempotency, validation |
| Python & FastAPI | Request lifecycle, dependency injection, async endpoints, schema validation |
| Backend Libraries & Ecosystem | Express, Fastify, NestJS, ORM/validation/logging/testing tools |
| Authentication & Authorization | Sessions, JWT, OAuth, RBAC, permissions, token handling |
| Testing & Observability | Unit and integration tests, logging, metrics, tracing, health checks |

## Backend fundamentals concept pages

| Concept | Focus |
|---|---|
| [HTTP Request Lifecycle](concepts/http-request-lifecycle.md) | Request path from client to backend to response |
| [HTTP vs HTTPS](concepts/http-vs-https.md) | Transport security and TLS basics |
| [REST](concepts/rest.md) | Resource-oriented API design |
| [HTTP Methods](concepts/http-methods.md) | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| [PUT vs PATCH](concepts/put-vs-patch.md) | Full replacement vs partial update |
| [Idempotency](concepts/idempotency.md) | Safe retries and duplicate prevention |
| [HTTP Status Codes](concepts/http-status-codes.md) | Backend fundamentals |
| [401 vs 403](concepts/401-vs-403.md) | Backend fundamentals |
| [400 vs 422](concepts/400-vs-422.md) | Backend fundamentals |
| [Stateless Backend APIs](concepts/stateless-apis.md) | Backend fundamentals |
| [API Versioning](concepts/api-versioning.md) | Backend fundamentals |
| [Offset-Based Pagination](concepts/offset-pagination.md) | Backend fundamentals |
| [Cursor-Based Pagination](concepts/cursor-pagination.md) | Backend fundamentals |
| [Cursor Pagination vs Offset Pagination](concepts/cursor-vs-offset-pagination.md) | Backend fundamentals |
| [API Filtering and Sorting](concepts/api-filtering-sorting.md) | Backend fundamentals |
| [Backend File Uploads](concepts/backend-file-uploads.md) | Backend fundamentals |
| [Rate Limiting](concepts/rate-limiting.md) | Backend fundamentals |
| [Request Throttling](concepts/request-throttling.md) | Backend fundamentals |
| [Backend Request Debouncing](concepts/backend-debouncing.md) | Backend fundamentals |
| [Request Validation](concepts/request-validation.md) | Backend fundamentals |
| [Response Serialization](concepts/response-serialization.md) | Backend fundamentals |
| [Middleware](concepts/middleware.md) | Backend fundamentals |
| [Request Lifecycle in Backend Frameworks](concepts/backend-framework-request-lifecycle.md) | Backend fundamentals |
| [CORS](concepts/cors.md) | Backend fundamentals |
| [Preflight Request](concepts/preflight-request.md) | Backend fundamentals |
| [Same-Origin Policy](concepts/same-origin-policy.md) | Backend fundamentals |
| [Backend Caching](concepts/backend-caching.md) | Backend fundamentals |
| [Cache Headers](concepts/cache-headers.md) | Backend fundamentals |
| [ETag](concepts/etag.md) | Backend fundamentals |
| [Cache-Control](concepts/cache-control.md) | Backend fundamentals |
| [CDN Caching](concepts/cdn-caching.md) | Backend fundamentals |
| [Server-Side Caching](concepts/server-side-caching.md) | Backend fundamentals |
| [Reverse Proxy](concepts/reverse-proxy.md) | Backend fundamentals |
| [Load Balancing](concepts/load-balancing.md) | Backend fundamentals |
| [Horizontal Scaling](concepts/horizontal-scaling.md) | Backend fundamentals |
| [Vertical Scaling](concepts/vertical-scaling.md) | Backend fundamentals |
| [Graceful Shutdown](concepts/graceful-shutdown.md) | Backend fundamentals |
| [Health Check Endpoint](concepts/health-check-endpoint.md) | Backend fundamentals |
| [Observability](concepts/observability.md) | Backend fundamentals |

## API design scenario pages

| Scenario | Focus |
|---|---|
| [User Registration API](api-design/user-registration-api.md) | API design |
| [Login API](api-design/login-api.md) | API design |
| [Refresh Token API](api-design/refresh-token-api.md) | API design |
| [Logout API](api-design/logout-api.md) | API design |
| [Forgot Password Flow](api-design/forgot-password-flow.md) | API design |
| [Reset Password Flow](api-design/reset-password-flow.md) | API design |
| [Role-Based Access APIs](api-design/role-based-access-apis.md) | API design |
| [Product CRUD APIs](api-design/product-crud-apis.md) | API design |
| [Order APIs](api-design/order-apis.md) | API design |
| [Payment Callback APIs](api-design/payment-callback-apis.md) | API design |
| [Webhook APIs](api-design/webhook-apis.md) | API design |
| [Bulk Upload APIs](api-design/bulk-upload-apis.md) | API design |
| [Bulk Update APIs](api-design/bulk-update-apis.md) | API design |
| [Search APIs](api-design/search-apis.md) | API design |
| [Autocomplete APIs](api-design/autocomplete-apis.md) | API design |
| [Notification APIs](api-design/notification-apis.md) | API design |
| [Audit Log APIs](api-design/audit-log-apis.md) | API design |
| [Admin Dashboard APIs](api-design/admin-dashboard-apis.md) | API design |
| [API Response Structure](api-design/api-response-structure.md) | API design |
| [API Error Structure](api-design/api-error-structure.md) | API design |
| [Backward Compatible APIs](api-design/backward-compatible-apis.md) | API design |
| [Breaking API Changes](api-design/breaking-api-changes.md) | API design |
| [API Versioning Design](api-design/api-versioning-design.md) | API design |
| [API Documentation](api-design/api-documentation.md) | API design |
| [Secure Public APIs](api-design/secure-public-apis.md) | API design |
| [Secure Internal APIs](api-design/secure-internal-apis.md) | API design |
| [Prevent Duplicate Submissions](api-design/duplicate-submissions.md) | API design |
| [Idempotency Keys](api-design/idempotency-keys.md) | API design |
| [Partial Failure in Bulk APIs](api-design/partial-failure-bulk-apis.md) | API design |
| [Nested Request Payload Validation](api-design/nested-request-validation.md) | API design |

## FastAPI concept pages

| Concept | Focus |
|---|---|
| [What Is FastAPI](fastapi/what-is-fastapi.md) | FastAPI |
| [Why FastAPI Is Fast](fastapi/why-fastapi-is-fast.md) | FastAPI |
| [ASGI](fastapi/asgi.md) | FastAPI |
| [Uvicorn](fastapi/uvicorn.md) | FastAPI |
| [Starlette](fastapi/starlette.md) | FastAPI |
| [Pydantic](fastapi/pydantic.md) | FastAPI |
| [FastAPI Request Body Validation](fastapi/request-body-validation.md) | FastAPI |
| [FastAPI Swagger Docs](fastapi/swagger-docs.md) | FastAPI |
| [FastAPI Dependency Injection](fastapi/dependency-injection.md) | FastAPI |
| [Reusable Dependencies](fastapi/reusable-dependencies.md) | FastAPI |
| [Path Parameters](fastapi/path-parameters.md) | FastAPI |
| [Query Parameters](fastapi/query-parameters.md) | FastAPI |
| [Validate Request Body](fastapi/validate-request-body.md) | FastAPI |
| [Response Models](fastapi/response-models.md) | FastAPI |
| [response_model](fastapi/response-model.md) | FastAPI |
| [Depends](fastapi/depends.md) | FastAPI |
| [APIRouter](fastapi/apirouter.md) | FastAPI |
| [Split Routes in FastAPI](fastapi/split-routes.md) | FastAPI |
| [Large FastAPI Project Structure](fastapi/large-project-structure.md) | FastAPI |
| [FastAPI Middleware](fastapi/middleware.md) | FastAPI |
| [Custom Exception Handlers](fastapi/custom-exception-handlers.md) | FastAPI |
| [FastAPI Validation Errors](fastapi/validation-errors.md) | FastAPI |
| [Global Errors in FastAPI](fastapi/global-errors.md) | FastAPI |
| [Custom Status Codes](fastapi/custom-status-codes.md) | FastAPI |
| [FastAPI File Uploads](fastapi/file-uploads.md) | FastAPI |
| [Stream Large Files](fastapi/stream-large-files.md) | FastAPI |
| [Serve Static Files](fastapi/static-files.md) | FastAPI |
| [Background Tasks](fastapi/background-tasks.md) | FastAPI |
| [FastAPI Lifespan Events](fastapi/lifespan-events.md) | FastAPI |
| [Startup and Shutdown Logic](fastapi/startup-shutdown-logic.md) | FastAPI |
| [Environment Variables in FastAPI](fastapi/environment-variables.md) | FastAPI |
| [Settings Management in FastAPI](fastapi/settings-management.md) | FastAPI |
| [JWT Auth in FastAPI](fastapi/jwt-auth.md) | FastAPI |
| [OAuth2 Password Flow](fastapi/oauth2-password-flow.md) | FastAPI |
| [Protect Routes in FastAPI](fastapi/protect-routes.md) | FastAPI |
| [Role-Based Authorization in FastAPI](fastapi/role-based-authorization.md) | FastAPI |
| [Refresh Tokens in FastAPI](fastapi/refresh-tokens.md) | FastAPI |
| [Password Hashing in FastAPI](fastapi/password-hashing.md) | FastAPI |
| [Testing FastAPI APIs](fastapi/testing-fastapi.md) | FastAPI |
| [Mock Dependencies in FastAPI Tests](fastapi/mock-dependencies.md) | FastAPI |
| [Async Endpoints](fastapi/async-endpoints.md) | FastAPI |
| [Sync vs Async Routes](fastapi/sync-vs-async-routes.md) | FastAPI |
| [When Not To Use Async Routes](fastapi/when-not-async.md) | FastAPI |
| [SQLAlchemy With FastAPI](fastapi/sqlalchemy-with-fastapi.md) | FastAPI |
| [DB Sessions in FastAPI](fastapi/db-sessions.md) | FastAPI |
| [Prevent DB Session Leaks](fastapi/prevent-db-session-leaks.md) | FastAPI |
| [Alembic Migrations](fastapi/alembic-migrations.md) | FastAPI |
| [Transactions in FastAPI](fastapi/transactions.md) | FastAPI |
| [Rollback Transactions](fastapi/rollback-transactions.md) | FastAPI |
| [Pagination in FastAPI](fastapi/pagination.md) | FastAPI |

## Python backend concept pages

| Concept | Focus |
|---|---|
| [list, tuple, set, and dict](python/list-tuple-set-dict.md) | Python backend |
| [Mutable and Immutable Types](python/mutable-immutable-types.md) | Python backend |
| [GIL](python/gil.md) | Python backend |
| [Python Memory Management](python/python-memory-management.md) | Python backend |
| [Garbage Collection in Python](python/python-garbage-collection.md) | Python backend |
| [Decorators](python/decorators.md) | Python backend |
| [How Decorators Work](python/how-decorators-work.md) | Python backend |
| [Generators](python/generators.md) | Python backend |
| [yield](python/yield.md) | Python backend |
| [Iterators](python/iterators.md) | Python backend |
| [Context Manager](python/context-manager.md) | Python backend |
| [with Statement](python/with-statement.md) | Python backend |
| [Dataclasses](python/dataclasses.md) | Python backend |
| [Type Hinting](python/type-hinting.md) | Python backend |
| [Optional](python/optional.md) | Python backend |
| [Union](python/union.md) | Python backend |
| [Protocol](python/protocol.md) | Python backend |
| [asyncio](python/asyncio.md) | Python backend |
| [async/await in Python](python/python-async-await.md) | Python backend |
| [Concurrency vs Parallelism](python/concurrency-vs-parallelism.md) | Python backend |
| [Multiprocessing](python/multiprocessing.md) | Python backend |
| [Multithreading](python/multithreading.md) | Python backend |
| [Exception Handling](python/exception-handling.md) | Python backend |
| [Custom Exceptions](python/custom-exceptions.md) | Python backend |
| [Dependency Injection in Python](python/dependency-injection-python.md) | Python backend |
| [Virtual Environment](python/virtual-environment.md) | Python backend |
| [pip](python/pip.md) | Python backend |
| [Poetry](python/poetry.md) | Python backend |
| [Python Dependency Management](python/python-dependency-management.md) | Python backend |
| [Unit Tests in Python](python/python-unit-tests.md) | Python backend |

## Question banks

| Page | Source | Focus |
|---|---|---|
| [Full-Stack Backend Coverage Roadmap](full-stack-backend-roadmap.md) | Manual audit | Missing backend/full-stack topics to expand next |
| [Backend Questions](question-banks.md) | `Backend_Questions.csv` | Theory prompts |
| [Backend Coding Questions](coding-questions.md) | `Backend_Coding_Questions.csv` | Coding prompts |
| [Node.js Question Bank](nodejs-question-bank.md) | Curated | 50 Node.js backend interview questions |
| [FastAPI Question Bank](fastapi-question-bank.md) | Curated | 50 Python FastAPI interview questions |
| [Backend Libraries Question Bank](libraries-question-bank.md) | Curated | 50 backend library/ecosystem questions |

## Expansion rule

Keep backend topics split by runtime and concern, then add chapter pages once the roadmap becomes
dense.

## Remaining full-stack expansion pages

- [SQLAlchemy Concept Pages](backend/sqlalchemy/index.md)
- [Mongoose Concept Pages](backend/mongoose/index.md)
- [Node.js Concept Pages](backend/nodejs/index.md)
- [Express.js Concept Pages](backend/express/index.md)
- [MERN Backend Pages](backend/mern/index.md)
- [Authentication and Authorization Pages](backend/auth/index.md)
- [Backend Security Pages](backend/security/index.md)
- [Backend Performance Pages](backend/performance/index.md)
- [Caching and Redis Pages](backend/redis/index.md)
- [Background Jobs and Queues Pages](backend/queues/index.md)
- [WebSocket and Real-Time Pages](backend/websocket/index.md)
- [Backend Testing Pages](backend/testing/index.md)
- [Deployment and DevOps Pages](backend/deployment/index.md)
- [Logging Monitoring Debugging Pages](backend/observability/index.md)
- [Backend System Design Pages](backend/system-design/index.md)
- [Full-Stack Integration Pages](backend/full-stack-integration/index.md)
- [Backend Coding Practice Pages](backend/coding-practice/index.md)
- [Senior Backend Scenario Pages](backend/senior-scenarios/index.md)
