# How do you test database queries

## Detailed explanation

How do you test database queries is a core backend testing topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you test database queries by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend testing rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you test database queries affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you test database queries?
- **The Engine Mechanism (Why it behaves this way):** Database query testing involves verifying that your queries return correct results, handle edge cases, and perform efficiently. In unit tests, you mock the repository/ORM interface. In integration tests, you use a real test database (same type as production) with seeded data, execute queries, and assert on the results. You test CRUD operations, complex joins, transactions, constraints, indexes, and migration scripts. Tools like testcontainers provide isolated database instances for each test run.
- **The Unforgettable Mental Model:** The **Library Catalog Test**. You don't just check that the catalog system exists — you verify that searching by title returns the right books, that checking out a book updates availability, and that the system handles duplicate titles correctly.
- **The Trap:** Testing queries against SQLite when production uses PostgreSQL. SQLite doesn't support all PostgreSQL features (JSONB, array types, specific constraints), so tests pass locally but fail in production.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test database queries at two levels. In unit tests, I mock the repository interface to test service logic. In integration tests, I use a real test database — the same type as production — with seeded data. I verify CRUD operations, complex queries, transactions, constraints, and migrations. I use testcontainers for isolated database instances and wrap each test in a transaction that rolls back afterward."

#### Why does database query testing matter?
- **The Engine Mechanism (Why it behaves this way):** Database queries are the foundation of data integrity. A buggy query can return wrong data, leak sensitive information through missing WHERE clauses, cause deadlocks, or create performance bottlenecks through missing indexes. Query testing catches SQL syntax errors, constraint violations, N+1 query problems, and transaction isolation issues before they affect production data.
- **The Unforgettable Mental Model:** The **Foundation Inspection**. A building can have beautiful walls and a perfect roof, but if the foundation (database queries) is cracked, the whole structure is at risk. Query testing inspects the foundation before construction continues.
- **The Trap:** Assuming ORM queries are always correct. ORMs can generate inefficient SQL, miss constraints, or produce unexpected joins. The generated SQL should be verified.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Database queries are the foundation of data integrity. A buggy query can return wrong data, leak information through missing WHERE clauses, or cause performance issues. I test queries to catch SQL errors, constraint violations, N+1 problems, and transaction issues. Even with ORMs, I verify the generated SQL is correct and efficient — ORMs can produce unexpected behavior."

#### What is a simple database test implementation?
- **The Engine Mechanism (Why it behaves this way):** A basic database test seeds known data into a test database, executes the query, and asserts on the results. Example: seed 3 users, run `findAll()`, assert 3 users returned with correct fields. Then test filtering: run `findByRole('admin')`, assert only admin users returned. Test edge cases: query with no matching results returns empty array, not null. Use transactions to roll back changes after each test.
- **The Unforgettable Mental Model:** The **Lab Experiment**. You prepare a controlled sample (seed data), apply a reagent (query), and observe the reaction (results). The sample is reset after each experiment.
- **The Trap:** Not testing the empty case. Queries that return null instead of an empty array cause null pointer exceptions in the application layer.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A basic database test seeds known data, executes the query, and asserts on results. I test the happy path, filtering, sorting, pagination, and edge cases like empty results. I verify that queries return empty arrays instead of null, handle missing records gracefully, and respect constraints. Each test runs in a transaction that rolls back, ensuring clean state for the next test."

#### What edge cases can break database queries?
- **The Engine Mechanism (Why it behaves this way):** Common edge cases include: null values in columns, empty result sets, duplicate records, concurrent writes causing race conditions, transaction rollbacks, foreign key constraint violations, unique constraint conflicts, large datasets causing slow queries, and timezone mismatches in date columns. Queries should also be tested with special characters, Unicode, and very long strings.
- **The Unforgettable Mental Model:** The **Extreme Weather Test**. A bridge works fine in calm weather, but what about during a flood, earthquake, or blizzard? Database queries work fine with clean data, but what about nulls, duplicates, concurrent writes, and massive datasets?
- **The Trap:** Testing only with small datasets. A query that works with 10 rows might be catastrophically slow with 10 million rows due to missing indexes or inefficient joins.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test edge cases like null values, empty results, duplicates, concurrent writes, constraint violations, and timezone mismatches. I also test with large datasets to catch missing indexes and inefficient queries. A query that works with 10 rows might be unusable with 10 million rows. I use EXPLAIN ANALYZE to verify query plans and ensure indexes are being used correctly."

#### How do database tests affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Database queries determine what data the API returns to the frontend. If a query returns wrong data, missing fields, or incorrect relationships, the frontend displays incorrect information. Database tests verify that queries return the exact data shape the API contract specifies — including nested relations, computed fields, and pagination metadata. This ensures the frontend receives consistent, correct data.
- **The Unforgettable Mental Model:** The **Water Supply**. The database is the reservoir, the query is the pipe, and the frontend is the faucet. If the pipe leaks or delivers contaminated water, the faucet outputs bad water regardless of how nice the faucet looks.
- **The Trap:** Assuming the API layer transforms data correctly. If the database query returns wrong data, the API transformation can't fix it.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Database queries determine what data reaches the frontend. If a query returns wrong data or missing relationships, the frontend displays incorrect information. I test queries to verify they return the exact data shape the API contract specifies — including nested relations, computed fields, and pagination. The database is the source of truth; if it's wrong, everything downstream is wrong."

#### What would you monitor for database query health?
- **The Engine Mechanism (Why it behaves this way):** Key metrics include: query execution time (slow query log), connection pool usage, deadlock frequency, cache hit ratio, index usage statistics, and row count growth rates. You should also monitor migration success rates, replication lag (for read replicas), and the number of full table scans. Alerting should trigger on slow query spikes, connection pool exhaustion, and deadlock increases.
- **The Unforgettable Mental Model:** The **Engine Dashboard**. You monitor oil pressure (connection pool), temperature (query time), fuel efficiency (cache hit ratio), and warning lights (deadlocks) to keep the engine running smoothly.
- **The Trap:** Only monitoring query success rate. A query can succeed but be catastrophically slow — success rate doesn't capture performance.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor query execution time via slow query logs, connection pool usage, deadlock frequency, cache hit ratio, and index usage. I track migration success rates and replication lag for read replicas. Alerts trigger on slow query spikes, connection pool exhaustion, and deadlock increases. Success rate alone isn't enough — a query can succeed but be too slow to be useful."

## 8. Active recall test

1. **How do you test database queries?**
   - **Explanation:** Use a real test database (same type as production) with seeded data. Execute queries and assert on results. Test CRUD, joins, transactions, constraints, and migrations. Use testcontainers for isolation.

2. **Why not test queries against SQLite when production uses PostgreSQL?**
   - **Explanation:** SQLite doesn't support PostgreSQL-specific features like JSONB, array types, and certain constraints. Tests pass locally but fail in production due to feature mismatches.

3. **What should a basic database test verify?**
   - **Explanation:** Happy path, filtering, sorting, pagination, empty results (return array not null), constraint handling, and edge cases like null values and duplicates.

4. **What edge cases break database queries?**
   - **Explanation:** Null values, empty results, duplicates, concurrent writes, constraint violations, timezone mismatches, large datasets, special characters, and missing indexes.

5. **How do database tests protect frontend clients?**
   - **Explanation:** They verify queries return the exact data shape the API contract specifies — correct fields, nested relations, computed values, and pagination metadata that the frontend depends on.

6. **What production metrics indicate database health?**
   - **Explanation:** Query execution time (slow query log), connection pool usage, deadlock frequency, cache hit ratio, index usage, migration success rates, and replication lag.

7. **Why test with large datasets?**
   - **Explanation:** A query that works with 10 rows might be catastrophically slow with 10 million rows due to missing indexes or inefficient joins. Performance testing catches this before production.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you test database queries in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you test database queries in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
