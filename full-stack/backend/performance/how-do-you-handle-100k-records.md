# How do you handle 100k records

## Detailed explanation

How do you handle 100k records is a senior backend scenario that checks how you debug, reason, prioritize, and design a safe fix under production constraints. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Diagnose with evidence first, then isolate cause, reduce impact, fix safely, and prevent recurrence.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Confirm symptoms with logs, metrics, and traces.
- Find blast radius and reduce user impact.
- Form hypotheses and test them with data.
- Ship the smallest safe fix.
- Add monitoring, tests, or process guardrails.

## 4. Visual / analogy

```txt
Symptom -> evidence -> hypothesis -> fix -> prevention
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend performance rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle 100k records affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle 100k records in a single API response?
- **The Engine Mechanism (Why it behaves this way):** Returning 100k records in a single response is almost always an anti-pattern. It causes: massive payload size (megabytes of JSON), memory exhaustion (loading all records into memory), slow serialization (converting 100k objects to JSON), network timeout (transmission takes too long), and frontend rendering issues (browser can't render 100k DOM nodes). The correct approach is pagination — return 20-100 records per page with cursor-based navigation. If the client truly needs all data, use asynchronous export (background job → file → download link).
- **The Unforgettable Mental Model:** The **Fire Hose**. Trying to drink from a fire hose (100k records at once) is impossible and dangerous. Instead, you use a cup (pagination) — manageable sips that you can actually consume.
- **The Trap:** Thinking "the client needs all the data." Clients rarely need all 100k records at once. They need to search, filter, and browse — which pagination supports better than a single massive response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I never return 100k records in a single API response. It causes memory exhaustion, massive payloads, serialization overhead, and frontend rendering issues. Instead, I use cursor-based pagination to return 20-100 records per page. If the client needs all data for processing, I implement an asynchronous export — a background job generates a file, uploads it to object storage, and provides a download link. This keeps the API responsive and the frontend performant."

#### How do you efficiently query 100k records from a database?
- **The Engine Mechanism (Why it behaves this way):** Querying 100k records efficiently requires: proper indexes on filter/sort columns (avoid full table scans), LIMIT/OFFSET or cursor-based pagination (return chunks), covering indexes (index-only scans avoid table lookups), and query optimization (EXPLAIN ANALYZE to verify the execution plan). For bulk operations (updating 100k records), use batch updates (UPDATE ... WHERE id IN (...)) instead of individual updates, or use bulk copy operations for inserts.
- **The Unforgettable Mental Model:** The **Conveyor Belt Sorting**. Instead of dumping 100k items on the floor and searching through them (full table scan), you use a labeled conveyor belt (index) that delivers only the items you need, in the order you want them.
- **The Trap:** Using OFFSET for deep pagination on 100k records. OFFSET 90000 requires scanning and skipping 90,000 rows. Use cursor-based pagination instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I query 100k records efficiently by ensuring proper indexes on filter and sort columns, using cursor-based pagination to return chunks, and verifying the execution plan with EXPLAIN ANALYZE. For bulk operations, I use batch updates with IN clauses instead of individual updates. The key is never loading all 100k records into application memory at once — I stream or paginate them."

#### How do you process 100k records without blocking the application?
- **The Engine Mechanism (Why it behaves this way):** Processing 100k records synchronously blocks the worker process, causing request timeouts and degraded performance for other users. Solutions: background jobs (enqueue the processing task, process asynchronously), streaming (process records one at a time as they arrive), batch processing (process in chunks of 1000, yielding between batches), and worker scaling (use multiple workers to process in parallel). For real-time progress, report progress via WebSocket or polling.
- **The Unforgettable Mental Model:** The **Restaurant Kitchen**. If one chef tries to cook 100 meals simultaneously, everything burns. Instead, the kitchen processes orders in sequence, with multiple chefs working in parallel, and reports progress to the waiters.
- **The Trap:** Processing 100k records in a web request handler. This blocks the worker for minutes, causing timeouts and preventing the worker from handling other requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I never process 100k records synchronously in a web request. I enqueue the work as a background job, which processes records in batches (e.g., 1000 at a time) using streaming to keep memory usage constant. I scale workers horizontally for parallel processing, and I report progress to the user via WebSocket or polling. This keeps the web tier responsive and allows the processing to take as long as it needs."

#### What memory considerations apply when handling 100k records?
- **The Engine Mechanism (Why it behaves this way):** Memory usage depends on record size and loading strategy. 100k records at 1KB each = 100MB raw data, but ORM objects can be 5-10x larger due to metadata, relations, and object overhead. Loading all 100k records as ORM objects could consume 500MB-1GB of memory. Mitigation: stream records instead of loading all at once, select only needed columns, use raw queries instead of ORM objects for bulk operations, and set memory limits with monitoring.
- **The Unforgettable Mental Model:** The **Suitcase Weight**. 100 t-shirts weigh 20kg. But if you pack them in individual boxes with padding (ORM objects), the same 100 t-shirts weigh 100kg. The content is the same, but the packaging multiplies the weight.
- **The Trap:** Underestimating ORM overhead. A database row of 1KB can become a 10KB ORM object with metadata, lazy-loading proxies, and relation tracking.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'm careful about ORM overhead — a 1KB database row can become a 10KB ORM object. For 100k records, loading as ORM objects could consume 500MB-1GB of memory. I mitigate this by streaming records, selecting only needed columns, using raw queries for bulk operations, and monitoring memory usage. I set memory limits and alert on thresholds to catch issues before they cause OOM errors."

#### How do you handle concurrent processing of 100k records?
- **The Engine Mechanism (Why it behaves this way):** Concurrent processing splits the workload across multiple workers. Strategies: partition the data (each worker processes a different range of IDs), use a job queue with multiple consumers (workers pull jobs from a shared queue), or use map-reduce patterns (split → process → combine). Key challenges: avoiding duplicate processing (idempotent jobs), handling failures (retry with dead letter queue), and coordinating results (aggregate from multiple workers). Use distributed locks or atomic operations to prevent race conditions.
- **The Unforgettable Mental Model:** The **Ant Colony**. A single ant can't carry a large crumb, but 100 ants working in parallel can. Each ant takes a piece, carries it to the nest, and the colony reassembles the result.
- **The Trap:** Not handling duplicate processing. If two workers process the same record, you get duplicate results or conflicting updates. Use idempotent operations and distributed locks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle concurrent processing by partitioning the data across workers — each worker processes a different range of IDs or pulls jobs from a shared queue. I ensure idempotent operations so duplicate processing doesn't cause issues, implement retry logic with dead letter queues for failures, and use distributed locks for operations that require coordination. I also monitor worker health and auto-scale based on queue depth."

#### How do you handle 100k records for real-time dashboards?
- **The Engine Mechanism (Why it behaves this way):** Real-time dashboards can't query 100k raw records on every refresh. Solutions: pre-aggregate data (compute summaries every minute/hour), use materialized views (pre-computed query results), implement incremental updates (only process new/changed records), and cache aggregated results. The dashboard queries the aggregated data (thousands of rows instead of 100k), which is fast enough for real-time refresh. For true real-time, use streaming aggregation (process events as they arrive and update aggregates incrementally).
- **The Unforgettable Mental Model:** The **Stock Ticker**. The ticker doesn't recalculate the entire market history on every update. It maintains running totals and updates them incrementally as new trades arrive.
- **The Trap:** Querying raw data on every dashboard refresh. 100k records × refresh every 5 seconds = database overload.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For real-time dashboards, I pre-aggregate data instead of querying 100k raw records on every refresh. I use materialized views for complex aggregations, incremental updates for new data, and cache the aggregated results. The dashboard queries the pre-computed data, which is fast enough for real-time refresh. For true real-time, I use streaming aggregation — processing events as they arrive and updating aggregates incrementally."

#### How do you decide between pagination and infinite scroll for 100k records?
- **The Engine Mechanism (Why it behaves this way):** Pagination (numbered pages) is best when users need to navigate to specific pages, bookmark results, or share page URLs. Infinite scroll (load more on scroll) is best for browsing, feeds, and mobile experiences. Both use cursor-based pagination under the hood for performance. The choice is UX-driven, not technical. For 100k records, both approaches load data in chunks — the difference is how the user triggers the next chunk.
- **The Unforgettable Mental Model:** The **Book vs. Scroll**. Pagination is like a book with page numbers — you can jump to any page. Infinite scroll is like a continuous scroll — you keep unrolling to see more. Both contain the same content, just different navigation.
- **The Trap:** Using offset-based pagination with infinite scroll. As the user scrolls deeper, offset degrades. Always use cursor-based pagination for infinite scroll.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The choice between pagination and infinite scroll is UX-driven. Pagination is best when users need to navigate to specific pages or bookmark results. Infinite scroll is best for browsing and mobile. Both use cursor-based pagination under the hood for performance with large datasets. I always use cursor-based (not offset-based) for infinite scroll because offset degrades as the user scrolls deeper."

## 8. Active recall test

1. **Should you ever return 100k records in a single API response?**
   - **Explanation:** No. It causes memory exhaustion, massive payloads, serialization overhead, network timeouts, and frontend rendering issues. Use pagination (20-100 per page) or asynchronous export for bulk data needs.

2. **How do you efficiently query 100k records from a database?**
   - **Explanation:** Use proper indexes on filter/sort columns, cursor-based pagination for chunks, covering indexes for index-only scans, and verify execution plans with EXPLAIN ANALYZE. For bulk operations, use batch updates with IN clauses.

3. **How do you process 100k records without blocking the application?**
   - **Explanation:** Use background jobs for asynchronous processing, stream records in batches, scale workers horizontally for parallel processing, and report progress via WebSocket or polling. Never process synchronously in a web request.

4. **What memory issues arise with 100k records?**
   - **Explanation:** ORM objects can be 5-10x larger than raw database rows. 100k records at 1KB each could consume 500MB-1GB as ORM objects. Mitigate with streaming, column selection, raw queries, and memory monitoring.

5. **How do you handle concurrent processing of 100k records?**
   - **Explanation:** Partition data across workers, use job queues with multiple consumers, ensure idempotent operations to prevent duplicates, implement retry with dead letter queues, and use distributed locks for coordination.

6. **How do you handle 100k records for real-time dashboards?**
   - **Explanation:** Pre-aggregate data (compute summaries periodically), use materialized views, implement incremental updates, and cache aggregated results. Query aggregated data instead of 100k raw records on every refresh.

7. **Pagination vs. infinite scroll for 100k records?**
   - **Explanation:** UX-driven choice. Pagination for navigation/bookmarking, infinite scroll for browsing/mobile. Both should use cursor-based pagination under the hood — never offset-based for infinite scroll due to degradation.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle 100k records in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle 100k records in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
