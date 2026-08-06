# API Filtering and Sorting

## Detailed explanation

Filtering and sorting define how clients narrow records and control order without custom endpoints for every view.

## 1. One-line mental model

Let clients ask for the slice and order they need through safe query parameters.

## 2. Problem it solves

Without a filtering/sorting contract, APIs multiply endpoints and frontend tables become slow or inconsistent.

## 3. Core idea

- Whitelist allowed filter and sort fields.
- Validate operators and values.
- Use indexed fields for common filters.
- Provide stable default sorting.
- Avoid exposing raw SQL or database field internals directly.

## 4. Visual / analogy

```txt
Search shelf: filter by category, sort by newest.
```

## 5. Minimal example

```txt
GET /products?category=books&sort=-createdAt&limit=20
```

## 6. Real-world example

Admin reports API supports `status`, `createdFrom`, `createdTo`, and `sort=-amount`.

## 7. Common interview questions

#### What is API filtering and sorting?
- **The Engine Mechanism (Why it behaves this way):** API filtering and sorting allow clients to narrow result sets and control record order through query parameters. Filtering uses parameters like `?status=active&category=books` to apply WHERE clauses in the database query. Sorting uses parameters like `?sort=-createdAt` to apply ORDER BY clauses. The backend parses these parameters, validates them against a whitelist of allowed fields, maps them to database columns, and constructs the query. This avoids creating custom endpoints for every possible view (e.g., `/active-books`, `/recent-books`, `/books-by-author`) and lets clients compose their own queries.
- **The Unforgettable Mental Model:** Filtering and sorting are like **a library's search system**. Filter by genre, author, or year; sort by newest, title, or popularity — all from one search bar.
- **The Trap:** Allowing arbitrary filter and sort fields from the client. This exposes internal database structure, enables SQL injection if not parameterized, and allows sorting on unindexed columns that cause full table scans.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: API filtering and sorting let clients narrow results and control order through query parameters. Filtering applies WHERE clauses — `?status=active&category=books`. Sorting applies ORDER BY — `?sort=-createdAt`. The backend validates parameters against a whitelist of allowed fields, maps them to database columns, and constructs the query. This avoids creating custom endpoints for every view and lets clients compose their own queries. I always whitelist allowed fields, validate operators, and ensure common filters use indexed columns."

#### Why does API filtering and sorting matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Without filtering and sorting, APIs either return all records (slow, expensive) or create a custom endpoint for every view (unmaintainable). Filtering and sorting provide a flexible, composable API contract that serves many use cases from a single endpoint. They reduce the number of endpoints, simplify the API surface, and let frontend tables, reports, and dashboards request exactly the data they need. Properly implemented with indexed columns, filtering and sorting are efficient database operations that scale well.
- **The Unforgettable Mental Model:** Filtering and sorting are like **a Swiss Army knife** — one tool that adapts to many tasks, instead of carrying a separate tool for each job.
- **The Trap:** Creating separate endpoints for every filter combination (`/active-users`, `/active-users-by-name`, `/inactive-users-by-date`). This explodes the API surface and becomes unmaintainable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Filtering and sorting matter because they provide a flexible API contract from a single endpoint. Without them, you either return all records or create custom endpoints for every view — both are unsustainable. Filtering and sorting let frontend tables, reports, and dashboards request exactly the data they need. I implement them with whitelisted fields, validated operators, and indexed columns for common filters. This keeps the API surface small while serving many use cases."

#### What bugs happen when filtering and sorting are handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor filtering/sorting causes several issues. Allowing arbitrary sort fields lets clients sort on unindexed columns, causing full table scans and slow queries. Not validating filter values enables injection attacks or invalid queries. Exposing internal database column names leaks implementation details. Not providing a default sort order returns records in undefined order, causing inconsistent pagination. Allowing filter combinations that the database can't optimize (e.g., filtering on two unindexed columns with OR) causes slow queries. Not limiting the number of filter parameters leads to overly complex queries.
- **The Unforgettable Mental Model:** Poor filtering is like **letting anyone rearrange the library shelves**. Without rules, books end up in random order and finding anything takes forever.
- **The Trap:** Passing client filter parameters directly to the database query without validation. `?sort=DROP TABLE users` is a real risk if parameters aren't sanitized.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor filtering causes slow queries from unindexed sort columns, injection risks from unvalidated parameters, and inconsistent results from missing default sort order. The most dangerous bug is passing client parameters directly to database queries without validation — this enables SQL injection. I always whitelist allowed fields, validate operators and values, provide a default sort order, and ensure common filters use indexed columns. I also limit the number of filter combinations to prevent overly complex queries."

#### How does filtering and sorting affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients use filtering and sorting parameters to power table columns, search forms, and report builders. The client constructs query strings based on user interactions — clicking a column header adds `?sort=name`, selecting a filter dropdown adds `?status=active`. The frontend must handle the API's allowed filter fields, supported operators, and sort directions. Advanced clients combine multiple filters (`?status=active&category=books&sort=-createdAt`) to create complex views. The frontend also handles error responses when invalid filter values are rejected.
- **The Unforgettable Mental Model:** The frontend is like a **control panel** with dials and switches for each filter and sort option. Each adjustment changes the query sent to the backend.
- **The Trap:** Assuming all fields are filterable and sortable. The backend whitelists specific fields, and the frontend must only offer those in the UI.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend uses filtering and sorting parameters to power table columns, search forms, and report builders. User interactions — clicking headers, selecting dropdowns — construct query strings sent to the API. The frontend must respect the backend's whitelist of allowed fields and supported operators. I design the UI to only show filterable and sortable fields that the backend supports, and I handle error responses when invalid values are rejected. For complex views, the client combines multiple filter parameters."

#### How would you test API filtering and sorting?
- **The Engine Mechanism (Why it behaves this way):** Testing filtering and sorting involves verifying correct query construction and results for various parameter combinations. Test single filters return correct subsets. Test combined filters return the intersection. Test sort directions (ascending/descending) return correct order. Test invalid filter values return 400 errors. Test unauthorized filter fields are rejected. Test performance with indexed vs. unindexed columns. Test edge cases — empty results, single result, all results matching. Test that the default sort order is stable and documented.
- **The Unforgettable Mental Model:** Testing filtering is like **testing a sieve with different mesh sizes**. Each filter combination should catch exactly the right items — no more, no less.
- **The Trap:** Only testing happy-path filters. The error paths — invalid values, unauthorized fields, unsupported operators — are where security bugs hide.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test filtering by verifying single filters return correct subsets, combined filters return intersections, and sort directions produce correct order. I test invalid values return 400 errors, unauthorized fields are rejected, and unsupported operators fail gracefully. I test performance with indexed vs. unindexed columns to ensure common filters are fast. I test edge cases — empty results, single results, all matching. I also verify the default sort order is stable and documented. The key is testing both the happy path and the error paths."

## 8. Active recall test

1. **Explain API filtering and sorting without looking at notes.**
   - **Explanation:** Filtering and sorting let clients narrow results and control order via query parameters. Filtering applies WHERE clauses (?status=active), sorting applies ORDER BY (?sort=-createdAt). The backend validates against a whitelist of allowed fields, maps to database columns, and constructs the query. This avoids custom endpoints for every view.

2. **Give one production bug related to filtering and sorting.**
   - **Explanation:** Allowing clients to sort on an unindexed column causes full table scans. A dashboard sorting by a computed field like `?sort=engagementScore` takes 30 seconds because the database must calculate the score for every row and sort without an index.

3. **Give one API example where filtering and sorting matter.**
   - **Explanation:** An admin orders endpoint: `GET /admin/orders?status=paid&sort=-createdAt&limit=20` returns the 20 most recent paid orders. The frontend uses this to power a sortable, filterable orders table.

4. **Explain how a frontend client should use filtering and sorting.**
   - **Explanation:** The frontend constructs query strings based on user interactions — column header clicks add sort parameters, filter dropdowns add filter parameters. It only offers fields that the backend whitelists, handles 400 errors for invalid values, and combines multiple filters for complex views.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

API Filtering and Sorting is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain API Filtering and Sorting in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define API Filtering and Sorting in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
