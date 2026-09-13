# How do you seed test database

## Detailed explanation

How do you seed test database is a core backend testing topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you seed test database by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you seed test database affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you seed a test database?
- **The Engine Mechanism (Why it behaves this way):** Database seeding inserts known data into a test database before tests run. You can seed programmatically (calling your ORM's create methods in test setup), using SQL scripts (INSERT statements run before tests), or using seeding libraries (Prisma seed, TypeORM seeds, factory libraries like factory_bot). The seed data should be minimal — only what each test needs — and isolated so tests don't interfere with each other.
- **The Unforgettable Mental Model:** The **Chess Setup**. Before each game (test), you place the pieces (seed data) in their starting positions. The game plays out from a known state, and the board is reset afterward.
- **The Trap:** Seeding too much data. A test that needs one user shouldn't seed 100 users. Excessive seeding slows tests and makes it unclear what data the test depends on.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I seed test databases with minimal, test-specific data using programmatic seeding (ORM create methods) or seeding libraries. Each test seeds only what it needs — one user for a user test, not 100 users. I use factories or builders for reusable seed data. The seed runs in the test setup, and the data is cleaned up via transaction rollback after the test."

#### Why seed a test database instead of using production data?
- **The Engine Mechanism (Why it behaves this way):** Production data is unpredictable, contains sensitive information, changes constantly, and may not include the edge cases you need to test. Seeded test data is controlled, deterministic, safe (no PII), and designed to cover specific scenarios. It also ensures tests are reproducible — the same test always runs against the same data.
- **The Unforgettable Mental Model:** The **Laboratory Sample**. Scientists don't test with random street water. They use purified, controlled samples with known composition. Seeded test data is the laboratory sample for your database tests.
- **The Trap:** Using production data dumps in tests. This exposes sensitive data, makes tests non-deterministic, and creates compliance issues (GDPR, HIPAA).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Seeded test data is controlled, deterministic, and safe. Production data is unpredictable, contains PII, and changes constantly. I never use production data in tests — it's a security and compliance risk, and it makes tests non-deterministic. Seeded data is designed to cover specific scenarios, including edge cases that may not exist in production."

#### What is a simple database seeding approach?
- **The Engine Mechanism (Why it behaves this way):** A basic seeding approach creates data using your ORM in test setup. Example with Prisma: `const user = await prisma.user.create({ data: { name: 'John', email: 'john@test.com' } })`. With factory libraries: `const user = await UserFactory.create({ name: 'John' })`. The seed returns the created records so tests can reference their IDs. For complex data graphs, use factories that create related records: `const user = await UserFactory.create({ withPosts: 3 })`.
- **The Unforgettable Mental Model:** The **Vending Machine**. You insert a coin (call the factory), and it dispenses exactly what you need (a user with specific attributes). You can customize: "user with 3 posts," "admin user," "user with expired token."
- **The Trap:** Hardcoding seed data in every test. Use factories or builders to create reusable, customizable seed data patterns.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I seed data using my ORM's create methods or factory libraries. A basic seed creates a user: `await prisma.user.create({ data: { name: 'John' } })`. For complex data, I use factories: `await UserFactory.create({ withPosts: 3 })`. Factories create reusable, customizable seed patterns. I avoid hardcoding seed data in every test — factories keep it DRY."

#### What edge cases can break database seeding?
- **The Engine Mechanism (Why it behaves this way):** Common edge cases include: unique constraint violations (seeding duplicate emails), foreign key constraint failures (seeding a post without a user), seed data ordering (seeding children before parents), seed data cleanup (orphaned records between tests), and seed data drift (seed data not matching production schema after migrations).
- **The Unforgettable Mental Model:** The **Jenga Tower**. If you place blocks (seed data) in the wrong order, the tower collapses (constraint violations). Each block must be placed on a stable foundation.
- **The Trap:** Not handling unique constraints in seed data. If two tests seed a user with the same email, the second test fails with a unique constraint violation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle edge cases like unique constraint violations (use unique emails per test), foreign key ordering (seed parents before children), cleanup (transaction rollback), and schema drift (update seeds after migrations). For unique constraints, I use dynamic values like `email: 'user-${Date.now()}@test.com'` or UUIDs to avoid collisions."

#### How do you manage seed data for complex test scenarios?
- **The Engine Mechanism (Why it behaves this way):** For complex scenarios, use factory libraries or builder patterns that create related data graphs. A `UserFactory` can create a user with posts, comments, and roles in one call: `UserFactory.create({ withPosts: 3, withComments: 5, role: 'admin' })`. Factories support traits (predefined configurations), associations (related records), and callbacks (post-creation hooks). This keeps test setup concise while creating rich test data.
- **The Unforgettable Mental Model:** The **Meal Combo**. Instead of ordering each item separately (creating each record individually), you order a combo (factory with traits) that includes the burger, fries, and drink (user, posts, comments) in one call.
- **The Trap:** Creating overly complex factories that are hard to understand. Factories should be simple and composable, not monolithic.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use factory libraries with traits and associations for complex scenarios. A UserFactory can create a user with posts, comments, and roles in one call. Factories support traits for common configurations and associations for related records. But I keep factories simple and composable — if a factory has 10 options, it's too complex and should be split."

#### What would you monitor for seed data health?
- **The Engine Mechanism (Why it behaves this way):** Key indicators include: seed execution time (slow seeds slow down tests), seed data freshness (seeds matching current schema), seed reuse rate (factories used across many tests), and seed-related test failures (constraint violations, orphaned records). You should also monitor for seed data duplication (same data seeded in multiple tests) and ensure seeds are updated when the schema changes.
- **The Unforgettable Mental Model:** The **Garden Irrigation System**. You monitor water flow (seed speed), plant health (data freshness), system reuse (factories across tests), and leaks (orphaned records, constraint violations).
- **The Trap**: Not updating seeds after schema changes. When you add a required column, all seeds that don't include it will fail.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor seed execution time, data freshness against the current schema, factory reuse rate, and seed-related test failures. When the schema changes, I update all affected seeds. I watch for seed data duplication across tests and consolidate into shared factories. Slow seeds slow down the entire test suite, so I optimize them regularly."

## 8. Active recall test

1. **How do you seed a test database?**
   - **Explanation:** Insert known data before tests using ORM create methods, SQL scripts, or factory libraries. Seed minimal, test-specific data. Clean up via transaction rollback after each test.

2. **Why not use production data in tests?**
   - **Explanation:** Production data is unpredictable, contains PII, changes constantly, and may not include needed edge cases. It's also a security and compliance risk (GDPR, HIPAA).

3. **What is a simple seeding approach?**
   - **Explanation:** Use ORM create methods in test setup: `await prisma.user.create({ data: { name: 'John' } })`. For complex data, use factories: `UserFactory.create({ withPosts: 3 })`.

4. **What edge cases break seeding?**
   - **Explanation:** Unique constraint violations, foreign key ordering, seed cleanup failures, orphaned records, and schema drift after migrations.

5. **How do you handle complex seed scenarios?**
   - **Explanation:** Use factory libraries with traits and associations. `UserFactory.create({ withPosts: 3, role: 'admin' })` creates a user with related posts in one call. Keep factories simple and composable.

6. **How do you avoid unique constraint violations in seeds?**
   - **Explanation:** Use dynamic values: `email: 'user-${Date.now()}@test.com'` or UUIDs. Each test gets unique seed data that doesn't collide with other tests.

7. **What indicates seed data health issues?**
   - **Explanation:** Slow seed execution, seeds not matching current schema, constraint violations, orphaned records between tests, and seed duplication across test files.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you seed test database in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you seed test database in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
