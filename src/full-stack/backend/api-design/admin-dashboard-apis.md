# Admin Dashboard APIs

## Detailed explanation

Serve aggregate metrics, tables, filters, and drilldowns for operational admin views. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Dashboard APIs optimize for summaries plus investigation paths.

## 2. Problem it solves

This design prevents inconsistent client behavior, duplicated backend logic, unclear errors, security gaps, and production-only workflow bugs.

## 3. Core idea

- Define the resource or workflow clearly.
- Validate input at the API boundary.
- Enforce authentication, authorization, and ownership checks.
- Return consistent success and error shapes.
- Plan idempotency, retries, logging, and monitoring for production behavior.

## 4. Visual / analogy

```txt
Client request
  -> auth/validation
  -> domain rules
  -> database/cache/queue
  -> serialized response/error
  -> frontend behavior
```

## 5. Minimal example

```txt
REQUEST  /api/example
CHECK    auth + validation + domain rules
WRITE    database or enqueue job
RETURN   status code + response body
```

## 6. Real-world example

In production, admin dashboard apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for admin dashboard?
- **The Engine Mechanism (Why it behaves this way):** `GET /api/admin/dashboard/overview` (aggregate metrics), `GET /api/admin/dashboard/recent-activity` (latest events), `GET /api/admin/dashboard/charts/:type` (time-series data), `GET /api/admin/dashboard/tables/:resource` (paginated table data). Each endpoint serves a specific dashboard widget, avoiding a single monolithic response.
- **The Unforgettable Mental Model:** The **Control Room Dashboard**. Each gauge (endpoint) shows a specific metric: overview (summary gauges), activity (event feed), charts (trend lines), tables (detailed lists). Each gauge updates independently.
- **The Trap:** Creating a single `/api/admin/dashboard` endpoint that returns everything — this is slow, inflexible, and wastes bandwidth when only some widgets are visible.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I expose separate endpoints for each dashboard widget: overview metrics, recent activity, chart data, and table data. Each endpoint is optimized for its specific data shape and caching strategy. This avoids a monolithic response and allows independent loading and caching of each widget."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Overview response: `{ success: true, data: { totalUsers, totalOrders, revenue, growthRates: { ... } } }`. Charts response: `{ success: true, data: { labels: [...], datasets: [{ label, data }] } }`. Tables response: `{ success: true, data: { items: [...], pagination: { ... } } }`. All responses include a `generatedAt` timestamp for cache freshness.
- **The Unforgettable Mental Model:** The **Widget Data Pack**. Each widget receives exactly the data it needs: numbers for metrics, arrays for charts, rows for tables — nothing more.
- **The Trap:** Not including a `generatedAt` timestamp — without it, the frontend can't determine if cached data is stale and needs refreshing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Each endpoint returns data shaped for its specific widget. Overview returns aggregate numbers with growth rates. Charts return label/data pairs ready for charting libraries. Tables return paginated items. All responses include a `generatedAt` timestamp so the frontend can manage cache freshness and decide when to refetch."

#### What validations are required for admin dashboard APIs?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Admin authorization — all endpoints require admin role; (2) Date range limits — chart queries limited to 1 year; (3) Chart type allowlist — only pre-defined chart types; (4) Resource type allowlist — only allowed table resources; (5) Pagination bounds — perPage limits; (6) Query complexity limits — prevent expensive aggregations.
- **The Unforgettable Mental Model:** The **Control Room Access Panel**. Only authorized operators (admin auth), limited time window for trends (date range), predefined gauge types (chart allowlist), and bounded data requests (pagination).
- **The Trap:** Not limiting chart date ranges — a query for "all time" on a large dataset can cause expensive aggregations that slow down the entire dashboard.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I enforce admin authorization on all endpoints, limit chart date ranges to 1 year, validate chart and resource types against allowlists, bound pagination, and limit query complexity. The date range limit is critical — unbounded aggregation queries on large datasets can cause severe performance degradation."

#### What status codes can admin dashboard APIs return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` for successful queries, `400 Bad Request` for invalid parameters, `403 Forbidden` for non-admin access, `404 Not Found` for invalid chart/table types, `500 Internal Server Error` for aggregation failures. Dashboard endpoints rarely return errors beyond 403 and 400 — they should degrade gracefully.
- **The Unforgettable Mental Model:** The **Dashboard Status Lights**. All good (200), bad input (400), not authorized (403), unknown widget (404), system error (500).
- **The Trap:** Returning 500 for a single widget failure — the dashboard should still load other widgets. Consider returning partial success with per-widget error status.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Standard status codes apply: 200 for success, 400 for invalid parameters, 403 for non-admin access, 404 for invalid widget types. For resilience, I design endpoints to degrade gracefully — if one metric fails, the endpoint returns partial data with an error flag for that specific metric rather than failing entirely."

#### How do you secure admin dashboard APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Admin-only access — strict role checking; (2) Data aggregation — return summaries, not raw data; (3) Rate limiting — prevent dashboard scraping; (4) Caching — reduce database load; (5) Query optimization — use pre-computed aggregates where possible; (6) Audit logging — log all dashboard access.
- **The Unforgettable Mental Model:** The **Executive Briefing Room**. Only executives enter (admin auth), they see summaries not raw data (aggregation), the briefing is scheduled (rate limiting), and previous briefings are reused when relevant (caching).
- **The Trap:** Returning raw data in dashboard responses — dashboards should show aggregated summaries, not individual records that could be scraped.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I enforce strict admin authorization, return aggregated summaries rather than raw data, rate-limit to prevent scraping, cache responses aggressively, use pre-computed aggregates for performance, and audit-log all access. Returning aggregated data is a security measure — it prevents the dashboard from being used as a data extraction tool."

#### How do you avoid duplicate or unsafe dashboard operations?
- **The Engine Mechanism (Why it behaves this way):** Dashboard APIs are read-only and idempotent — the same query always returns the same data (for a given point in time). Caching prevents redundant database queries. Pre-computed aggregates are updated on a schedule, not per-request. Stale-while-revalidate caching serves cached data while refreshing in the background.
- **The Unforgettable Mental Model:** The **Scheduled Report System**. Reports are generated on a schedule (pre-computed), cached for quick access, and refreshed in the background. Multiple people reading the same report get the cached version.
- **The Trap:** Computing aggregates on every request — this causes redundant database load and slow response times. Pre-computation and caching are essential.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Dashboard APIs are naturally idempotent read operations. I use aggressive caching with stale-while-revalidate patterns, pre-compute aggregates on a schedule, and serve cached data while refreshing in the background. Computing aggregates on every request is the anti-pattern — pre-computation and caching are essential for dashboard performance."

#### How do you test admin dashboard APIs?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Admin access → data returned; (2) Non-admin access → 403; (3) Overview metrics → correct aggregations; (4) Chart data → correct time-series; (5) Table data → correct pagination; (6) Invalid chart type → 404; (7) Date range limit → enforced; (8) Cache behavior → stale data served while refreshing; (9) Performance → response time under threshold; (10) Data accuracy → aggregates match raw data.
- **The Unforgettable Mental Model:** The **Dashboard Quality Assurance**. Every widget is tested: access control, data accuracy, performance, caching behavior, and error handling.
- **The Trap:** Not testing data accuracy — dashboard metrics must match the underlying data. Incorrect aggregates erode trust in the entire system.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test admin access control, data accuracy (aggregates match raw data), chart time-series correctness, table pagination, date range enforcement, cache behavior, and response time. Data accuracy testing is the most important — I compare dashboard aggregates against direct database queries to ensure they match. Incorrect metrics erode user trust."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: dashboard access (user ID, endpoint, timestamp, cache hit/miss), aggregation query performance, errors. Metrics: dashboard views per day, average response time, cache hit rate, most-viewed widgets, aggregation query duration. Alerts: response time spike, cache hit rate drop, aggregation query timeout.
- **The Unforgettable Mental Model:** The **Dashboard Usage Monitor**. Which widgets are viewed most, how fast they load, how often cache serves data, and when performance degrades.
- **The Trap:** Not monitoring aggregation query duration — slow aggregations indicate missing indexes or growing data that needs pre-computation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log dashboard access with user ID, endpoint, and cache status. Metrics track view volume, response time, cache hit rate, popular widgets, and aggregation query duration. I alert on response time spikes, cache hit rate drops, and aggregation timeouts. Aggregation query duration is the key performance indicator — it signals when pre-computation or indexing needs improvement."

## 8. Active recall test

1. **Why use separate endpoints for each dashboard widget?**
   - **Explanation:** To avoid monolithic responses, enable independent loading and caching, and optimize each endpoint for its specific data shape and performance requirements.

2. **What status code is returned for non-admin dashboard access?**
   - **Explanation:** `403 Forbidden` — the user is authenticated but doesn't have the admin role required for dashboard access.

3. **Why pre-compute dashboard aggregates?**
   - **Explanation:** Computing aggregates on every request causes redundant database load and slow response times. Pre-computation on a schedule keeps responses fast.

4. **What caching pattern works best for dashboards?**
   - **Explanation:** Stale-while-revalidate — serve cached data immediately while refreshing in the background, ensuring fast responses with eventual consistency.

5. **Why include a generatedAt timestamp in responses?**
   - **Explanation:** So the frontend can determine cache freshness and decide whether to refetch data or use the cached response.

6. **What is the maximum recommended date range for chart queries?**
   - **Explanation:** 1 year — longer ranges require expensive aggregations on large datasets and should use pre-computed data instead.

7. **Why return aggregated summaries instead of raw data?**
   - **Explanation:** For security and performance — aggregated data prevents the dashboard from being used as a data extraction tool and reduces response size.

8. **What metric indicates dashboard performance issues?**
   - **Explanation:** Aggregation query duration and response time — increases indicate growing data or missing indexes that need optimization.

9. **How should dashboard APIs handle partial failures?**
   - **Explanation:** Degrade gracefully — return partial data with error flags for failed metrics rather than failing the entire response.

10. **Why audit-log dashboard access?**
    - **Explanation:** For compliance and security monitoring — knowing who accessed what dashboard data and when is essential for accountability and detecting unusual access patterns.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Admin Dashboard APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
