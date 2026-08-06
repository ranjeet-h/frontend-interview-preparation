# Search APIs

## Detailed explanation

Design query, filters, sorting, ranking, pagination, and performance boundaries for searching data. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Search APIs turn user intent into fast ranked results.

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

In production, search apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for search?
- **The Engine Mechanism (Why it behaves this way):** `GET /api/search?q=term&filters=...` for general search across resources. Resource-specific: `GET /api/products/search?q=...`, `GET /api/users/search?q=...`. Advanced: `POST /api/search` for complex queries with nested filters, facets, and sorting. Search is always GET (or POST for complex queries) — never POST for simple searches.
- **The Unforgettable Mental Model:** The **Library Catalog**. You type a query (search term), apply filters (genre, year, author), and get ranked results. The catalog supports simple lookups and advanced searches with multiple criteria.
- **The Trap:** Using POST for simple search queries — search is a read operation and should use GET with query parameters for cacheability and bookmarkability.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use `GET /api/search?q=term` for general search with query parameters for filters, sorting, and pagination. For resource-specific search, I use scoped endpoints like `GET /api/products/search`. For complex queries with nested filters, I use `POST /api/search` with a JSON body. Simple searches are always GET for cacheability."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** GET query params: `q`, `page`, `perPage`, `sort`, `filters[category]`, `filters[priceMin]`. POST body: `{ query, filters: { ... }, sort, page, perPage, facets: ["category", "brand"] }`. Response: `{ success: true, data: { items: [...], pagination: { ... }, facets: { category: [{ value, count }] }, meta: { query, took: 45 } } }`.
- **The Unforgettable Mental Model:** The **Search Result Page**. Your query, the results, the pagination controls, the filter sidebar with counts (facets), and the search time displayed at the top.
- **The Trap:** Not including facets in the response — facets (filter options with counts) are essential for building interactive search UIs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: GET requests use query parameters for the search term, pagination, sorting, and filters. POST requests accept a JSON body for complex queries. The response includes items, pagination metadata, facets (filter options with counts), and query metadata like execution time. Facets are critical for building interactive filter UIs."

#### What validations are required for search APIs?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Query length limits — minimum 2 chars, maximum 200; (2) Pagination bounds — page >= 1, perPage <= 100; (3) Filter value types — numeric filters must be numbers; (4) Sort field allowlist — only allow sorting on indexed fields; (5) SQL/NoSQL injection prevention — sanitize query input; (6) Rate limiting — prevent search abuse.
- **The Unforgettable Mental Model:** The **Search Query Filter**. The query is checked for length, pagination is bounded, filter values are type-checked, sort fields are validated against an allowlist, and the input is sanitized for injection.
- **The Trap:** Not limiting perPage — a client requesting perPage=1000000 can cause memory exhaustion and slow response times.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate query length (2-200 chars), pagination bounds (page >= 1, perPage <= 100), filter value types, sort fields against an allowlist, and sanitize input for injection. Rate limiting prevents abuse. The perPage limit is critical — unbounded pagination can cause memory exhaustion and denial of service."

#### What status codes can search APIs return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` always for valid queries (even with zero results), `400 Bad Request` for invalid query parameters, `413 Payload Too Large` for oversized POST bodies, `429 Too Many Requests` for rate limiting, `500 Internal Server Error` for search engine failures. Zero results is still 200 — it's a valid search outcome.
- **The Unforgettable Mental Model:** The **Search Engine Response**. Found results (200), bad query (400), query too complex (413), too many searches (429), engine broken (500). No results is still a successful search (200).
- **The Trap:** Returning 404 for zero results — 404 means the endpoint doesn't exist. Zero results is a valid search outcome and should return 200 with an empty items array.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Search always returns 200 for valid queries, even with zero results — that's a valid outcome. 400 for invalid parameters, 413 for oversized bodies, 429 for rate limiting, 500 for search engine failures. Never return 404 for zero results — the endpoint exists and the query was valid, it just found nothing."

#### How do you secure search APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Input sanitization — prevent injection attacks; (2) Rate limiting — queries per minute per user/IP; (3) Result filtering — only return records the user has permission to see; (4) Query complexity limits — prevent expensive regex or deep nested queries; (5) Caching — cache common queries to reduce load; (6) Query logging — monitor for abuse patterns.
- **The Unforgettable Mental Model:** The **Secure Reference Desk**. Questions are sanitized (input validation), asked within limits (rate limiting), only public books are shown (result filtering), and complex questions are simplified (query limits).
- **The Trap:** Not filtering search results by user permissions — a search could expose records the user shouldn't see if permission filtering is not applied at the query level.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I sanitize all input to prevent injection, rate-limit queries, filter results by user permissions at the query level, limit query complexity, cache common queries, and log query patterns for abuse detection. Permission filtering at the query level is critical — post-filtering results would leak information about record existence."

#### How do you avoid duplicate or unsafe search operations?
- **The Engine Mechanism (Why it behaves this way):** Search is inherently idempotent and safe — the same query always returns the same results (assuming no data changes). Caching prevents redundant search engine queries. Query deduplication tracks in-flight queries to avoid duplicate processing. Pagination tokens (cursors) prevent offset-based duplication issues.
- **The Unforgettable Mental Model:** The **Photocopier**. Pressing the same button (query) always produces the same copy (results). If someone's already making that copy, you wait for theirs (deduplication). The copier keeps recent copies on hand (cache) for quick reuse.
- **The Trap:** Using offset-based pagination for large result sets — offset pagination becomes slower with deeper pages and can skip/duplicate records when data changes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Search is naturally idempotent. I cache common queries to reduce search engine load, deduplicate in-flight queries to avoid redundant processing, and use cursor-based pagination instead of offset-based pagination for large result sets. Cursor pagination is more efficient and doesn't skip or duplicate records when data changes between pages."

#### How do you test search APIs?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Basic search → relevant results; (2) Empty query → all results or error; (3) No results → empty array with 200; (4) Filters → filtered results; (5) Sorting → correctly ordered results; (6) Pagination → correct page, total count; (7) Facets → correct counts; (8) Permission filtering → only accessible records; (9) Query injection → sanitized; (10) Performance → response time under threshold.
- **The Unforgettable Mental Model:** The **Search Quality Lab**. Every search scenario is tested: basic, filtered, sorted, paginated, permission-restricted, and the relevance and performance of results are verified.
- **The Trap:** Not testing search relevance — returning results is easy; returning the *right* results in the *right* order is the real challenge.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test basic search relevance, empty queries, no-results handling, filtering, sorting, pagination, facet counts, permission filtering, injection prevention, and performance. Search relevance testing is the hardest — I use a set of known queries with expected top results to verify the ranking algorithm produces relevant results."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: search query (sanitized query, filters, result count, latency, user ID), zero-result queries, slow queries, errors. Metrics: searches per minute, average latency, zero-result rate, click-through rate, popular queries, cache hit rate. Alerts: latency spike, zero-result rate increase, search engine errors, rate limit triggers.
- **The Unforgettable Mental Model:** The **Search Analytics Dashboard**. Query volume, response times, popular searches, zero-result queries (indicating content gaps), and click-through rates (indicating relevance quality).
- **The Trap:** Not tracking zero-result queries — these reveal content gaps and user intent mismatches that are valuable for product improvement.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log search queries with sanitized input, result count, latency, and user ID. Metrics track search volume, latency, zero-result rate, click-through rate, popular queries, and cache hit rate. I alert on latency spikes, zero-result rate increases, and search engine errors. Zero-result queries are particularly valuable — they reveal content gaps and user intent mismatches."

## 8. Active recall test

1. **What HTTP method should simple search use?**
   - **Explanation:** `GET` — search is a read operation, and GET allows caching, bookmarking, and sharing of search URLs.

2. **When should POST be used for search?**
   - **Explanation:** For complex queries with nested filters, large request bodies, or when the query parameters exceed URL length limits.

3. **What status code is returned for zero search results?**
   - **Explanation:** `200 OK` — zero results is a valid search outcome. 404 means the endpoint doesn't exist, not that no results were found.

4. **Why use cursor-based pagination instead of offset-based?**
   - **Explanation:** Cursor pagination is more efficient for large result sets and doesn't skip or duplicate records when data changes between page requests.

5. **Why filter search results by permissions at the query level?**
   - **Explanation:** Post-filtering would leak information about record existence — if a filtered-out record affects the total count, the user can infer it exists.

6. **What is the most important perPage validation?**
   - **Explanation:** Setting a maximum limit (e.g., 100) — unbounded perPage can cause memory exhaustion and denial of service.

7. **What metric indicates search relevance quality?**
   - **Explanation:** Click-through rate — if users aren't clicking on results, the ranking algorithm may not be returning relevant results.

8. **Why cache search queries?**
   - **Explanation:** To reduce search engine load and improve response times for common queries — many users search for the same popular terms.

9. **What do zero-result queries reveal?**
   - **Explanation:** Content gaps and user intent mismatches — users are searching for things that don't exist in the system, indicating potential product opportunities.

10. **What prevents search query injection attacks?**
    - **Explanation:** Input sanitization and parameterized queries — search input is never directly concatenated into database or search engine queries.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Search APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
