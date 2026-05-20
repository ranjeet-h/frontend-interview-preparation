# Write a query to find customers who ordered in the last 30 days

## Detailed explanation

Write a query to find customers who ordered in the last 30 days is a practical SQL exercise that checks whether you can translate a data question into a correct, readable query. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Start from the required result set, then choose joins, filters, grouping, ranking, or pagination.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Identify the tables and target output.
- Choose joins and filters before aggregation.
- Use grouping/window functions when needed.
- Check duplicates and null behavior.
- Verify with edge cases.

## 4. Visual / analogy

```txt
SELECT ...
FROM ...
WHERE ...
GROUP BY ...;
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply SQL query practice rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, write a query to find customers who ordered in the last 30 days affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

1. What is Write a query to find customers who ordered in the last 30 days?
2. Why does it matter in backend/full-stack systems?
3. What is a simple implementation or design?
4. What edge cases can break it?
5. How would you test it?
6. How does it affect frontend clients?
7. What would you monitor in production?

## 8. Active recall test

1. Explain Write a query to find customers who ordered in the last 30 days without notes.
2. Give one concrete API/database/service example.
3. Name one failure mode.
4. Name one test case.
5. Name one production metric or log that helps debug it.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Write a query to find customers who ordered in the last 30 days in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Write a query to find customers who ordered in the last 30 days in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
