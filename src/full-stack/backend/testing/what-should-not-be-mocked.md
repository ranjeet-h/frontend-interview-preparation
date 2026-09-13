# What should not be mocked

## Detailed explanation

What should not be mocked is a core backend testing topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what should not be mocked by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what should not be mocked affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What should NOT be mocked in backend tests?
- **The Engine Mechanism (Why it behaves this way):** You should not mock: your own business logic (that's what you're testing), serialization/deserialization logic (JSON parsing, data transformation), validation rules (input sanitization, schema validation), database queries in integration tests (use a real test database), authentication middleware in E2E tests (verify real auth flows), and error handling code (test that errors are actually caught and handled). Mocking these creates a false sense of security — tests pass but the real code is untested.
- **The Unforgettable Mental Model:** The **Car Engine Test**. You can mock the road conditions and the driver, but you must test the actual engine. Mocking the engine itself means you never know if the car will start.
- **The Trap:** Mocking the code under test. If you mock your service layer while testing your service layer, you're testing the mock, not your code.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I never mock my own business logic, serialization, validation, or error handling — that's the code I need to verify. In integration tests, I don't mock the database; I use a real test database. In E2E tests, I don't mock authentication; I verify real auth flows. The rule is: mock what you don't own, test what you do own."

#### Why shouldn't you mock your own business logic?
- **The Engine Mechanism (Why it behaves this way):** Business logic is the code you're responsible for — the calculations, rules, state transitions, and decisions that make your application unique. If you mock it, you're not testing it. The test will pass regardless of whether the logic is correct. Business logic should be the primary subject of unit tests, with real inputs and real assertions on outputs.
- **The Unforgettable Mental Model:** The **Chef's Recipe**. You can mock the ingredients (external dependencies), but you must test the actual cooking (business logic). If you mock the cooking process, you never know if the dish tastes right.
- **The Trap:** Mocking helper functions that contain business logic. A function like `calculateDiscount()` might look like a utility, but if it contains pricing rules, it needs real testing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Business logic is the code I'm responsible for — the rules and calculations that make the application work. If I mock it, I'm not testing it. I mock external dependencies so I can focus the test on the business logic itself. The test should exercise real logic with real inputs and assert on real outputs."

#### Why shouldn't you mock serialization and validation?
- **The Engine Mechanism (Why it behaves this way):** Serialization (JSON parsing, data transformation) and validation (input sanitization, schema checks) are critical security and correctness layers. If you mock them, you miss bugs like: incorrect date formats, missing required fields, injection vulnerabilities, and type coercion errors. These bugs are common in production and are exactly what tests should catch.
- **The Unforgettable Mental Model:** The **Airport Security Scanner**. You don't mock the scanner — you test that it actually catches prohibited items. Mocking it means weapons slip through undetected.
- **The Trap:** Assuming the framework's validation is perfect. Framework validation can be misconfigured, and custom validators always need testing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Serialization and validation are critical security layers. I never mock them because bugs in these areas cause production incidents — incorrect date formats, missing fields, injection vulnerabilities. I test them with real inputs, including malformed data, to verify they catch errors correctly. Framework validation can be misconfigured, and custom validators always need real testing."

#### When should you use a real database instead of a mock?
- **The Engine Mechanism (Why it behaves this way):** In integration tests, you use a real database (test PostgreSQL, SQLite in-memory, or testcontainers) to verify that your queries, migrations, transactions, and constraints work correctly. Real databases catch SQL syntax errors, constraint violations, transaction isolation issues, and index performance problems that mocks can't simulate. In unit tests, you mock the repository layer; in integration tests, you use the real database.
- **The Unforgettable Mental Model:** The **Swim Test**. You can practice strokes on land (mock), but you need water (real database) to know if you can actually swim. The water reveals things land never will — buoyancy, resistance, breathing rhythm.
- **The Trap:** Using SQLite in-memory to test PostgreSQL-specific features. SQLite doesn't support all PostgreSQL data types, constraints, or query syntax, so tests pass locally but fail in production.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: In integration tests, I use a real database — the same type as production (PostgreSQL, MySQL) — to catch SQL errors, constraint violations, and transaction issues. I use testcontainers or a dedicated test instance, not SQLite to test PostgreSQL features. In unit tests, I mock the repository layer. The key is matching the test database to the production database."

#### Why shouldn't you mock error handling code?
- **The Engine Mechanism (Why it behaves this way):** Error handling is the code that runs when things go wrong — try/catch blocks, error middleware, retry logic, circuit breakers, and fallback mechanisms. If you mock error handling, you never verify that errors are actually caught, logged, and responded to correctly. You should trigger real errors (via mocked dependencies) and verify that your error handling code responds appropriately.
- **The Unforgettable Mental Model:** The **Emergency Exit Drill**. You don't mock the emergency exit — you actually walk through it to verify it opens, the alarm sounds, and people can evacuate. Mocking it means you discover it's blocked only during a real fire.
- **The Trap:** Testing that an error is thrown but not that it's handled. Throwing is easy; handling correctly (logging, responding, cleaning up) is the hard part.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I never mock error handling code. I trigger real errors through mocked dependencies and verify that my error handling catches them, logs them, responds with the correct status code, and cleans up resources. Error handling is where production incidents are prevented or caused — it needs real testing, not mocks."

#### What edge cases reveal over-mocking?
- **The Engine Mechanism (Why it behaves this way):** Signs of over-mocking include: tests that pass but production breaks, mocks that are more complex than the code being tested, tests that assert on mock calls instead of real outputs, and test suites where every test mocks everything. If a test has more mock setup than actual test code, it's probably over-mocked. The test should be simpler than the code it tests.
- **The Unforgettable Mental Model:** The **Scaffolding That Outweighs the Building**. If the scaffolding (mocks) is bigger and more complex than the building (code under test), something is wrong. The scaffolding should support, not overshadow.
- **The Trap:** Mocking to make tests pass instead of fixing the underlying design. If testing is hard, the code might need refactoring, not more mocks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Signs of over-mocking include tests that pass but production breaks, mocks more complex than the code being tested, and tests that assert on mock calls instead of real outputs. If a test has more mock setup than actual test code, it's over-mocked. When testing is hard, I refactor the code for better testability rather than adding more mocks."

#### What would you monitor to detect over-mocking?
- **The Engine Mechanism (Why it behaves this way):** Indicators include: the ratio of mocked calls to real assertions in tests, production bugs that tests should have caught, test complexity (lines of mock setup vs. lines of test logic), and the frequency of "tests passed but production broke" incidents. Code review should flag tests that mock the code under test or have excessive mock setup. Mutation testing also reveals over-mocking — if mutants survive, the mocks may be hiding real behavior.
- **The Unforgettable Mental Model:** The **Quality Audit**. An auditor doesn't just check if the books balance (tests pass). They check whether the books reflect reality (tests verify real behavior) and whether any fraud (over-mocking) is hiding the truth.
- **The Trap:** Measuring test quality only by coverage percentage. High coverage with over-mocking is a dangerous illusion.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I watch for production bugs that tests should have caught — that's the biggest red flag for over-mocking. I also review test complexity: if mock setup outweighs test logic, it's a smell. I use mutation testing to verify that tests actually catch bugs, and I flag over-mocked tests in code review. Coverage percentage alone is misleading if the tests are mocking everything."

## 8. Active recall test

1. **What should NOT be mocked?**
   - **Explanation:** Your own business logic, serialization/deserialization, validation rules, database queries in integration tests, auth middleware in E2E tests, and error handling code.

2. **Why shouldn't you mock business logic?**
   - **Explanation:** Business logic is the code you're responsible for. Mocking it means you're not testing it — the test passes regardless of whether the logic is correct.

3. **Why test serialization and validation with real code?**
   - **Explanation:** They're critical security layers. Mocking them misses bugs like incorrect date formats, missing fields, injection vulnerabilities, and type coercion errors.

4. **When should you use a real database?**
   - **Explanation:** In integration tests, use a real database (same type as production) to catch SQL errors, constraint violations, transaction issues, and index problems that mocks can't simulate.

5. **Why test error handling with real errors?**
   - **Explanation:** Error handling prevents production incidents. You should trigger real errors and verify that they're caught, logged, responded to correctly, and resources are cleaned up.

6. **What are signs of over-mocking?**
   - **Explanation:** Tests pass but production breaks, mocks more complex than the code under test, tests asserting on mock calls instead of real outputs, and more mock setup than test logic.

7. **How do you detect over-mocking?**
   - **Explanation:** Monitor production bugs tests should have caught, review test complexity ratios, use mutation testing to verify tests catch real bugs, and flag excessive mocking in code review.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What should not be mocked in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What should not be mocked in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
