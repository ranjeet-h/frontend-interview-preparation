# Full-Stack Backend Coverage Roadmap

This chapter tracks backend, database, security, deployment, and full-stack integration topics that were not fully covered in the mdBook.

Use this as the expansion checklist. Each item should eventually become either:

- a dedicated concept page using the 12-step study format, or
- a question-answer page when the topic is mainly interview scenario practice.

## Current completion note

The original missing full-stack checklist has now been expanded into mdBook submenus and dedicated pages. The next pass should improve depth topic-by-topic, add richer code examples where needed, and replace any broad generated page with a more hand-written production answer when that topic becomes the current study focus.

## Coverage status

| Area | Status | Next action |
|---|---|---|
| Backend fundamentals | Added as dedicated pages | Improve examples over time |
| API design scenarios | Added as scenario pages | Improve examples over time |
| FastAPI | Added as concept pages | Improve examples over time |
| Python backend | Added as concept pages | Improve examples over time |
| SQL fundamentals | Added as concept pages | Improve examples over time |
| SQL query practice | Added as practice pages | Add executable query examples over time |
| MySQL | Added as concept pages | Improve examples over time |
| PostgreSQL | Added as concept pages | Improve examples over time |
| SQLAlchemy | Added as concept pages | Improve examples over time |
| MongoDB | Added as concept pages | Improve examples over time |
| Mongoose | Added as concept pages | Improve examples over time |
| Node.js | Added as concept pages | Improve examples over time |
| Express.js | Added as concept pages | Improve examples over time |
| MERN backend | Added as integration pages | Improve examples over time |
| Auth and authorization | Added as backend-focused pages | Improve examples over time |
| Security | Added as backend-focused pages | Improve examples over time |
| Performance | Added as scenario pages | Improve examples over time |
| Redis and caching | Added as concept pages | Improve examples over time |
| Background jobs and queues | Added as concept pages | Improve examples over time |
| WebSocket and real-time | Added as concept pages | Improve examples over time |
| Backend testing | Added as testing pages | Improve examples over time |
| Deployment and DevOps | Added as deployment pages | Improve examples over time |
| Logging and monitoring | Added as observability pages | Improve examples over time |
| Backend system design | Added as backend-specific design pages | Improve examples over time |
| Full-stack integration | Added as frontend-backend contract pages | Improve examples over time |
| Coding questions | Added as implementation practice pages | Add fuller code over time |
| Senior scenarios | Added as debugging scenario pages | Improve examples over time |

---

# Backend Fundamentals

## Concepts to add

1. What happens when a client sends an HTTP request to a backend server?
2. What is the difference between HTTP and HTTPS?
3. What is REST?
4. What are the main HTTP methods and when do you use each?
5. What is the difference between PUT and PATCH?
6. What is idempotency?
7. Which HTTP status codes do you commonly use in APIs?
8. What is the difference between 401 and 403?
9. What is the difference between 400 and 422?
10. What is statelessness in backend APIs?
11. What is API versioning and why is it needed?
12. How do you design pagination in an API?
13. What is cursor-based pagination?
14. What is offset-based pagination?
15. Cursor pagination vs offset pagination?
16. How do you design filtering and sorting in APIs?
17. How do you handle file uploads in backend?
18. What is rate limiting?
19. What is request throttling?
20. What is request debouncing on backend?
21. What is request validation?
22. What is response serialization?
23. What is middleware?
24. What is request lifecycle in backend frameworks?
25. What is CORS?
26. What is preflight request?
27. What is Same-Origin Policy?
28. What is caching?
29. What are cache headers?
30. What is ETag?
31. What is Cache-Control?
32. What is CDN caching?
33. What is server-side caching?
34. What is reverse proxy?
35. What is load balancing?
36. What is horizontal scaling?
37. What is vertical scaling?
38. What is graceful shutdown?
39. What is health check endpoint?
40. What is observability?

## First expansion priority

These should become individual 12-step concept pages first:

1. HTTP request lifecycle
2. HTTP vs HTTPS
3. REST
4. HTTP methods
5. PUT vs PATCH
6. Idempotency
7. HTTP status codes
8. API pagination
9. Cursor vs offset pagination
10. Request validation
11. Middleware
12. CORS and preflight
13. Caching headers
14. Reverse proxy
15. Load balancing
16. Health checks
17. Observability

---

# API Design Questions

## Scenarios to add

1. How would you design a user registration API?
2. How would you design a login API?
3. How would you design a refresh token API?
4. How would you design logout?
5. How would you design forgot password flow?
6. How would you design reset password flow?
7. How would you design role-based access APIs?
8. How would you design CRUD APIs for products?
9. How would you design order APIs?
10. How would you design payment callback APIs?
11. How would you design webhook APIs?
12. How would you design bulk upload APIs?
13. How would you design bulk update APIs?
14. How would you design search APIs?
15. How would you design autocomplete APIs?
16. How would you design notification APIs?
17. How would you design audit log APIs?
18. How would you design admin dashboard APIs?
19. How would you design API response structure?
20. How would you design API error structure?
21. How do you keep APIs backward compatible?
22. How do you handle breaking API changes?
23. How do you version APIs?
24. How do you document APIs?
25. How do you secure public APIs?
26. How do you secure internal APIs?
27. How do you prevent duplicate submissions?
28. How do you handle idempotency keys?
29. How do you handle partial failure in bulk APIs?
30. How do you validate nested request payloads?

---

# FastAPI Questions

## Concepts to add or expand

1. What is FastAPI?
2. Why is FastAPI fast?
3. What is ASGI?
4. What is Uvicorn?
5. What is Starlette?
6. What is Pydantic?
7. How does FastAPI validate request bodies?
8. How does FastAPI generate Swagger docs?
9. What is dependency injection in FastAPI?
10. How do you create reusable dependencies?
11. How do you use path parameters?
12. How do you use query parameters?
13. How do you validate request body?
14. How do you return response models?
15. What is `response_model`?
16. What is `Depends`?
17. What is `APIRouter`?
18. How do you split routes in FastAPI?
19. How do you structure a large FastAPI project?
20. How do you create middleware in FastAPI?
21. How do you create custom exception handlers?
22. How do you handle validation errors?
23. How do you handle global errors?
24. How do you return custom status codes?
25. How do you handle file uploads?
26. How do you stream large files?
27. How do you serve static files?
28. How do you implement background tasks?
29. What are FastAPI lifespan events?
30. How do you run startup and shutdown logic?
31. How do you use environment variables?
32. How do you manage settings in FastAPI?
33. How do you implement JWT auth in FastAPI?
34. How do you implement OAuth2 password flow?
35. How do you protect routes?
36. How do you implement role-based authorization?
37. How do you implement refresh tokens?
38. How do you hash passwords?
39. How do you test FastAPI APIs?
40. How do you mock dependencies in FastAPI tests?
41. How do you use async endpoints?
42. What is the difference between sync and async routes?
43. When should you not use async routes?
44. How do you use SQLAlchemy with FastAPI?
45. How do you manage DB sessions in FastAPI?
46. How do you prevent DB session leaks?
47. How do you use Alembic migrations?
48. How do you handle transactions?
49. How do you rollback transactions?
50. How do you implement pagination in FastAPI?

---

# Python Backend Questions

## Concepts to add

1. What is the difference between list, tuple, set, and dict?
2. What are mutable and immutable types?
3. What is GIL?
4. How does Python memory management work?
5. What is garbage collection in Python?
6. What are decorators?
7. How do decorators work?
8. What are generators?
9. What is `yield`?
10. What are iterators?
11. What is context manager?
12. What is `with` statement?
13. What are dataclasses?
14. What is type hinting?
15. What is `Optional`?
16. What is `Union`?
17. What is `Protocol`?
18. What is `asyncio`?
19. What is async/await in Python?
20. What is the difference between concurrency and parallelism?
21. What is multiprocessing?
22. What is multithreading?
23. What is exception handling?
24. How do you create custom exceptions?
25. What is dependency injection in Python?
26. What is virtual environment?
27. What is pip?
28. What is Poetry?
29. How do you manage Python dependencies?
30. How do you write unit tests in Python?

---

# SQL Questions

## Concepts to add

1. What is SQL?
2. What is RDBMS?
3. What is a table?
4. What is a primary key?
5. What is a foreign key?
6. What is a unique key?
7. What is a composite key?
8. What is normalization?
9. What is denormalization?
10. What are 1NF, 2NF, and 3NF?
11. What is indexing?
12. How does an index improve query performance?
13. When can indexes hurt performance?
14. What is a clustered index?
15. What is a non-clustered index?
16. What is a composite index?
17. What is covering index?
18. What is query execution plan?
19. How do you debug a slow query?
20. What is `EXPLAIN`?
21. What is `EXPLAIN ANALYZE`?
22. What is a transaction?
23. What are ACID properties?
24. What is isolation level?
25. What is dirty read?
26. What is non-repeatable read?
27. What is phantom read?
28. What is deadlock?
29. How do you prevent deadlocks?
30. What is optimistic locking?
31. What is pessimistic locking?
32. What is row-level locking?
33. What is table-level locking?
34. What is connection pooling?
35. What is database migration?
36. What is schema migration?
37. What is database replication?
38. What is database sharding?
39. What is partitioning?
40. What is read replica?

---

# SQL Query Questions

## Practice questions to add

1. Write a query to find duplicate emails.
2. Write a query to get the second highest salary.
3. Write a query to get the nth highest salary.
4. Write a query to count users by role.
5. Write a query to get users with no orders.
6. Write a query to get orders with user details.
7. Write a query using INNER JOIN.
8. Write a query using LEFT JOIN.
9. Write a query using RIGHT JOIN.
10. Write a query using FULL OUTER JOIN.
11. Write a query using GROUP BY.
12. Write a query using HAVING.
13. Write a query using subquery.
14. Write a query using CTE.
15. Write a query using window functions.
16. Write a query using ROW_NUMBER.
17. Write a query using RANK.
18. Write a query using DENSE_RANK.
19. Write a query to calculate monthly revenue.
20. Write a query to find customers who ordered in the last 30 days.
21. Write a query to find top 5 products by sales.
22. Write a query to find inactive users.
23. Write a query to soft delete records.
24. Write a query to paginate records.
25. Write a query to filter by date range.
26. Write a query to calculate running total.
27. Write a query to find parent-child hierarchy.
28. Write a query to update records using join.
29. Write a query to delete duplicate rows.
30. Write a query to aggregate JSON data.

---

# Database-Specific Questions

## MySQL

1. What is MySQL?
2. What is InnoDB?
3. What is MyISAM?
4. InnoDB vs MyISAM?
5. What is auto increment?
6. What is MySQL storage engine?
7. What is MySQL indexing?
8. What is composite index in MySQL?
9. What is full-text index in MySQL?
10. What is `EXPLAIN` in MySQL?
11. How do you optimize slow MySQL queries?
12. What is MySQL query cache?
13. What are MySQL isolation levels?
14. What is gap lock?
15. What is next-key lock?
16. What is deadlock in MySQL?
17. How do you debug MySQL deadlocks?
18. What is MySQL replication?
19. What is binlog?
20. What is master-slave replication?
21. What is read replica?
22. What is connection pool in MySQL?
23. How do you handle migrations in MySQL?
24. How do you store JSON in MySQL?
25. What are MySQL JSON functions?
26. What is `VARCHAR` vs `TEXT`?
27. What is `DATETIME` vs `TIMESTAMP`?
28. What is collation?
29. What is charset?
30. How do you backup and restore MySQL database?

## PostgreSQL

1. What is PostgreSQL?
2. PostgreSQL vs MySQL?
3. What are PostgreSQL data types?
4. What is `SERIAL`?
5. What is `BIGSERIAL`?
6. What is UUID in PostgreSQL?
7. What is JSONB?
8. JSON vs JSONB?
9. What is GIN index?
10. What is GiST index?
11. What is B-tree index?
12. What is partial index?
13. What is expression index?
14. What is full-text search in PostgreSQL?
15. What is `EXPLAIN ANALYZE`?
16. How do you optimize slow PostgreSQL queries?
17. What is VACUUM?
18. What is autovacuum?
19. What is MVCC?
20. What is transaction isolation in PostgreSQL?
21. What is row-level locking?
22. What is advisory lock?
23. What is UPSERT?
24. What is `ON CONFLICT`?
25. What are CTEs?
26. What are window functions?
27. What are materialized views?
28. What are database views?
29. What is partitioning in PostgreSQL?
30. What is logical replication?
31. What is streaming replication?
32. What is connection pooling with PgBouncer?
33. What is PostGIS?
34. How do you store arrays in PostgreSQL?
35. How do you query JSONB fields?

## MongoDB

1. What is MongoDB?
2. SQL vs NoSQL?
3. What is a collection?
4. What is a document?
5. What is BSON?
6. What is ObjectId?
7. How is MongoDB schema designed?
8. Embedding vs referencing?
9. When should you embed documents?
10. When should you reference documents?
11. What is MongoDB indexing?
12. What is compound index?
13. What is text index?
14. What is TTL index?
15. What is sparse index?
16. What is partial index?
17. How do you optimize MongoDB queries?
18. What is aggregation pipeline?
19. What is `$match`?
20. What is `$group`?
21. What is `$lookup`?
22. What is `$project`?
23. What is `$unwind`?
24. What is `$sort`?
25. What is `$limit`?
26. What is `$skip`?
27. What is replica set?
28. What is sharding?
29. What is write concern?
30. What is read concern?
31. What are MongoDB transactions?
32. When should you avoid MongoDB transactions?
33. How do you model many-to-many relationships?
34. How do you handle pagination in MongoDB?
35. How do you avoid slow `$lookup` queries?

---

# Backend Libraries and Runtimes

## SQLAlchemy

1. What is SQLAlchemy?
2. What is ORM?
3. ORM vs raw SQL?
4. What is SQLAlchemy Core?
5. What is SQLAlchemy ORM?
6. What is declarative model?
7. What is session in SQLAlchemy?
8. How do you create a database session?
9. How do you manage session lifecycle?
10. What is connection pool?
11. How do you define relationships?
12. One-to-one relationship?
13. One-to-many relationship?
14. Many-to-many relationship?
15. What is lazy loading?
16. What is eager loading?
17. What is N+1 query problem?
18. How do you solve N+1 query problem?
19. What is `joinedload`?
20. What is `selectinload`?
21. What is transaction handling in SQLAlchemy?
22. How do you rollback transactions?
23. How do you use Alembic?
24. How do you create migrations?
25. How do you handle schema changes?
26. How do you write raw SQL in SQLAlchemy?
27. How do you do bulk inserts?
28. How do you optimize SQLAlchemy queries?
29. How do you handle soft deletes?
30. How do you implement audit columns?

## Mongoose

1. What is Mongoose?
2. Why use Mongoose with MongoDB?
3. What is a schema?
4. What is a model?
5. What is a document?
6. What are schema types?
7. What are validators?
8. What are custom validators?
9. What are virtuals?
10. What are getters and setters?
11. What are middleware hooks?
12. What is pre-save hook?
13. What is post-save hook?
14. What is populate?
15. What is lean query?
16. Why use `.lean()`?
17. What is discriminator?
18. How do you define indexes in Mongoose?
19. How do you handle unique fields?
20. How do you handle timestamps?
21. How do you implement soft delete?
22. How do you hash password before saving user?
23. How do you validate nested schemas?
24. How do you handle references?
25. How do you optimize Mongoose queries?
26. How do you prevent N+1 queries with populate?
27. What is aggregation in Mongoose?
28. How do you handle transactions in Mongoose?
29. How do you handle connection errors?
30. How do you structure Mongoose models?

## Node.js

1. What is Node.js?
2. How does Node.js work?
3. What is V8?
4. What is libuv?
5. What is Node.js event loop?
6. Browser event loop vs Node.js event loop?
7. What are event loop phases?
8. What is `process.nextTick`?
9. What is `setImmediate`?
10. `process.nextTick` vs `setImmediate`?
11. What is callback queue?
12. What is microtask queue?
13. What is non-blocking I/O?
14. What is blocking code?
15. How do you avoid blocking Node.js?
16. What are streams?
17. What are readable streams?
18. What are writable streams?
19. What are transform streams?
20. What is backpressure?
21. How do you handle large file uploads?
22. What is Buffer?
23. What is EventEmitter?
24. What is cluster module?
25. What are worker threads?
26. Cluster vs worker threads?
27. How do you scale Node.js app?
28. How do you handle uncaught exceptions?
29. How do you handle unhandled promise rejections?
30. How do you manage environment variables?

## Express.js

1. What is Express.js?
2. How does Express middleware work?
3. What is request-response lifecycle in Express?
4. How do you define routes?
5. How do you split routes?
6. How do you create middleware?
7. What is error-handling middleware?
8. How do you handle async errors in Express?
9. How do you validate request body?
10. How do you handle file uploads?
11. How do you serve static files?
12. How do you implement JWT authentication?
13. How do you implement role-based authorization?
14. How do you implement refresh tokens?
15. How do you hash passwords?
16. How do you use cookies in Express?
17. How do you handle CORS?
18. How do you rate-limit APIs?
19. How do you secure Express app?
20. What is Helmet?
21. How do you prevent NoSQL injection?
22. How do you prevent XSS?
23. How do you handle logs?
24. How do you structure a large Express app?
25. How do you implement global error handling?
26. How do you implement pagination?
27. How do you implement search?
28. How do you handle transactions?
29. How do you test Express APIs?
30. How do you deploy Express app?

---

# Auth, Security, Performance, and Operations

## Authentication and authorization

1. What is authentication?
2. What is authorization?
3. Session-based auth vs token-based auth?
4. JWT vs session?
5. What are access tokens?
6. What are refresh tokens?
7. Where should access tokens be stored?
8. Where should refresh tokens be stored?
9. Why is localStorage risky for tokens?
10. What are HttpOnly cookies?
11. What is SameSite cookie?
12. What is Secure cookie?
13. How do you implement login?
14. How do you implement logout?
15. How do you implement refresh token rotation?
16. What is token revocation?
17. How do you invalidate JWT?
18. How do you handle password hashing?
19. bcrypt vs argon2?
20. What is salt?
21. What is RBAC?
22. What is ABAC?
23. Role-based authorization vs permission-based authorization?
24. How do you protect admin routes?
25. How do you prevent privilege escalation?
26. What is OAuth2?
27. What is OpenID Connect?
28. How does Google login work?
29. What is MFA?
30. How do you secure forgot-password flow?

## Security

1. What is XSS?
2. What is CSRF?
3. What is SQL injection?
4. What is NoSQL injection?
5. What is command injection?
6. What is path traversal?
7. What is SSRF?
8. What is CORS misconfiguration?
9. What is clickjacking?
10. What is open redirect?
11. What is prototype pollution?
12. How do you prevent SQL injection?
13. How do you prevent NoSQL injection?
14. How do you prevent XSS?
15. How do you prevent CSRF?
16. How do you secure cookies?
17. How do you secure headers?
18. What is CSP?
19. What is Helmet?
20. What is input validation?
21. What is output encoding?
22. What is rate limiting?
23. What is brute-force protection?
24. How do you prevent password enumeration?
25. How do you store passwords securely?
26. How do you store secrets?
27. What is secrets rotation?
28. How do you protect APIs from abuse?
29. What should never be logged?
30. How do you handle sensitive data in errors?

## Performance

1. How do you debug a slow API?
2. How do you optimize API response time?
3. How do you optimize database queries?
4. How do you identify N+1 query problem?
5. How do you reduce payload size?
6. How do you implement caching?
7. Redis cache vs database cache?
8. What is cache invalidation?
9. What is lazy loading?
10. What is eager loading?
11. How do you handle large datasets?
12. How do you handle 100k records?
13. How do you implement efficient pagination?
14. How do you handle high traffic?
15. How do you optimize file uploads?
16. How do you optimize image uploads?
17. How do you handle background jobs?
18. How do you avoid blocking Node.js event loop?
19. How do you avoid blocking FastAPI workers?
20. How do you scale read-heavy systems?
21. How do you scale write-heavy systems?
22. How do you use connection pooling?
23. How do you tune database indexes?
24. How do you reduce cold start time?
25. How do you measure backend performance?

## Caching and Redis

1. What is Redis?
2. Why use Redis?
3. What data types does Redis support?
4. What is cache-aside pattern?
5. What is write-through cache?
6. What is write-behind cache?
7. What is cache invalidation?
8. What is TTL?
9. What is distributed cache?
10. What is Redis pub/sub?
11. What is Redis stream?
12. What is Redis lock?
13. What is distributed lock?
14. How do you cache API responses?
15. How do you cache database queries?
16. How do you prevent cache stampede?
17. How do you prevent stale cache?
18. How do you handle cache eviction?
19. What is LRU?
20. Redis vs in-memory cache?

## Background jobs and queues

1. What is background job?
2. Why use background jobs?
3. What is message queue?
4. What is producer-consumer pattern?
5. What is RabbitMQ?
6. What is Kafka?
7. What is Celery?
8. What is BullMQ?
9. What is delayed job?
10. What is scheduled job?
11. What is retry mechanism?
12. What is dead-letter queue?
13. What is idempotent job?
14. How do you process emails asynchronously?
15. How do you process file uploads asynchronously?
16. How do you process video/image conversion?
17. How do you handle failed jobs?
18. How do you prevent duplicate job processing?
19. How do you monitor queues?
20. How do you scale workers?

## WebSocket and real-time

1. What is WebSocket?
2. WebSocket vs HTTP?
3. WebSocket vs SSE?
4. WebSocket vs long polling?
5. How do you authenticate WebSocket connections?
6. How do you handle disconnected users?
7. How do you scale WebSocket servers?
8. How do you broadcast messages?
9. How do you implement one-to-one chat?
10. How do you implement group chat?
11. How do you track online users?
12. How do you store chat messages?
13. How do you handle message delivery status?
14. How do you handle typing indicator?
15. How do you handle reconnect logic?
16. How do you prevent duplicate messages?
17. How do you handle ordering of messages?
18. How do you handle socket rooms?
19. How do you handle socket authorization?
20. How do you debug WebSocket issues?

---

# Testing, Deployment, and Observability

## Testing

1. What is unit testing?
2. What is integration testing?
3. What is end-to-end testing?
4. What is contract testing?
5. What should be mocked in backend tests?
6. What should not be mocked?
7. How do you test APIs?
8. How do you test database queries?
9. How do you test authentication?
10. How do you test authorization?
11. How do you test validation errors?
12. How do you test file uploads?
13. How do you test background jobs?
14. How do you test WebSockets?
15. How do you test FastAPI with TestClient?
16. How do you test Express APIs with Supertest?
17. How do you use pytest fixtures?
18. How do you use Jest mocks?
19. How do you seed test database?
20. How do you run tests in CI?

## Deployment and DevOps

1. How do you deploy FastAPI?
2. How do you deploy Express.js?
3. What is Docker?
4. What is Dockerfile?
5. What is Docker Compose?
6. How do you containerize backend app?
7. How do you manage environment variables?
8. How do you run database migrations in deployment?
9. What is CI/CD?
10. How do you build a backend CI/CD pipeline?
11. What is reverse proxy?
12. What is Nginx?
13. What is Gunicorn?
14. Gunicorn vs Uvicorn?
15. What are Uvicorn workers?
16. What is PM2?
17. How do you run Node.js app in production?
18. How do you handle logs in production?
19. How do you monitor APIs?
20. How do you handle zero-downtime deployment?
21. How do you rollback deployment?
22. How do you configure health checks?
23. How do you handle SSL certificates?
24. How do you configure CORS in production?
25. How do you secure production secrets?

## Logging, monitoring, and debugging

1. How do you debug a production API issue?
2. What logs should backend services produce?
3. What should not be logged?
4. What is structured logging?
5. What is request ID?
6. What is correlation ID?
7. How do you trace a request across services?
8. What is distributed tracing?
9. What is metrics monitoring?
10. What is alerting?
11. What is Sentry?
12. What is Prometheus?
13. What is Grafana?
14. How do you monitor API latency?
15. How do you monitor error rate?
16. How do you monitor database performance?
17. How do you monitor memory usage?
18. How do you monitor CPU usage?
19. How do you debug memory leaks?
20. How do you debug high CPU usage?
21. How do you debug connection pool exhaustion?
22. How do you debug deadlocks?
23. How do you debug slow queries?
24. How do you debug timeout errors?
25. How do you debug CORS errors?

---

# Full-Stack Integration

## Questions to add

1. How does frontend call backend APIs?
2. How do you handle auth from React to backend?
3. How do you handle protected routes?
4. How do you handle expired tokens?
5. How do you refresh access tokens?
6. How do you handle API errors globally in frontend?
7. How do you handle validation errors from backend?
8. How do you design frontend and backend contracts?
9. How do you prevent breaking frontend when backend changes?
10. How do you share types between frontend and backend?
11. How do you handle CORS in local development?
12. How do you handle cookies across domains?
13. How do you handle file upload from React?
14. How do you display upload progress?
15. How do you handle optimistic updates?
16. How do you avoid duplicate API calls?
17. How do you cancel stale API requests?
18. How do you implement infinite scroll with backend?
19. How do you implement search with debounce and cancellation?
20. How do you handle WebSocket connection from React?

---

# Backend System Design

## Systems to practice

1. Design a URL shortener.
2. Design a file upload service.
3. Design an image upload and resize service.
4. Design an authentication system.
5. Design a role-based access system.
6. Design a notification system.
7. Design an email delivery system.
8. Design a real-time chat system.
9. Design a logging system.
10. Design an audit log system.
11. Design a payment system.
12. Design an order management system.
13. Design an inventory management system.
14. Design a booking system.
15. Design a ride booking backend.
16. Design a food delivery backend.
17. Design a social media feed.
18. Design a search autocomplete system.
19. Design a rate limiter.
20. Design a recommendation backend.
21. Design a multi-tenant SaaS backend.
22. Design a webhook processing system.
23. Design a background job system.
24. Design a report generation system.
25. Design an analytics dashboard backend.
26. Design a comments system.
27. Design a like/follow system.
28. Design a scalable REST API.
29. Design a cache layer.
30. Design a distributed notification service.

---

# Backend Coding Questions

## Implementations to add

1. Implement JWT authentication middleware.
2. Implement role-based authorization middleware.
3. Implement request validation middleware.
4. Implement global error handler.
5. Implement pagination helper.
6. Implement sorting and filtering helper.
7. Implement password hashing and comparison.
8. Implement refresh token flow.
9. Implement forgot password flow.
10. Implement file upload API.
11. Implement CSV upload parser.
12. Implement bulk insert API.
13. Implement transaction-safe order creation.
14. Implement retry function.
15. Implement rate limiter.
16. Implement LRU cache.
17. Implement Redis cache wrapper.
18. Implement background job processor.
19. Implement email queue.
20. Implement webhook signature verification.
21. Implement idempotency key handling.
22. Implement audit logging.
23. Implement soft delete.
24. Implement search API.
25. Implement autocomplete API.
26. Implement nested comments API.
27. Implement tree/category API.
28. Implement many-to-many relationship API.
29. Implement chat message API.
30. Implement notification API.

---

# Senior-Level Scenario Questions

## Scenarios to add

1. API is slow in production. How will you debug it?
2. Database CPU is high. How will you debug it?
3. One endpoint randomly times out. How will you debug it?
4. Users are getting logged out randomly. How will you debug it?
5. Duplicate orders are getting created. How will you fix it?
6. Payment webhook is called multiple times. How will you handle it?
7. Search API returns old results. How will you debug it?
8. File upload fails for large files. How will you fix it?
9. MongoDB query is slow. How will you optimize it?
10. PostgreSQL query is slow. How will you optimize it?
11. MySQL deadlock occurs. How will you debug it?
12. Node.js server memory keeps increasing. How will you debug it?
13. FastAPI server workers are blocked. How will you debug it?
14. API works locally but fails in production. How will you debug it?
15. CORS works in Postman but fails in browser. Why?
16. JWT works for some users but fails for others. Why?
17. Refresh token rotation causes logout issues. How will you fix it?
18. Backend has high traffic spikes. How will you scale it?
19. How will you migrate a large table without downtime?
20. How will you deploy a breaking schema change safely?
21. How will you handle multi-tenant data isolation?
22. How will you prevent one tenant from accessing another tenant's data?
23. How will you handle large reports?
24. How will you process 1 million records efficiently?
25. How will you design a backend that supports mobile and web clients?

---

# Highest ROI Topics

Study these first:

1. REST API design
2. HTTP status codes
3. Authentication and authorization
4. JWT and refresh tokens
5. Cookies and sessions
6. SQL joins
7. SQL indexes
8. SQL transactions
9. PostgreSQL/MySQL query optimization
10. MongoDB schema design
11. Mongoose models and queries
12. FastAPI dependency injection
13. FastAPI validation
14. SQLAlchemy relationships
15. Express middleware
16. Node.js event loop
17. Error handling
18. File upload
19. Caching with Redis
20. Background jobs
21. WebSockets
22. Security
23. Docker deployment
24. Logging and monitoring
25. System design basics
