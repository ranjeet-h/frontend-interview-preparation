# How do you handle transactions

## Detailed explanation

How do you handle transactions is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you handle transactions by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply Express.js rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle transactions affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle database transactions in Express with MongoDB?
- **The Engine Mechanism (Why it behaves this way):** MongoDB supports multi-document transactions (v4.0+ for replica sets, v4.2+ for sharded clusters). Use Mongoose sessions: `const session = await mongoose.startSession(); session.startTransaction(); try { await User.create([{ name: 'Alice' }], { session }); await Order.create([{ userId: alice._id, total: 100 }], { session }); await session.commitTransaction(); } catch (err) { await session.abortTransaction(); throw err; } finally { session.endSession(); }`. All operations within the transaction either succeed together or fail together (atomicity). If any operation fails, the entire transaction is rolled back.
- **The Unforgettable Mental Model:** The **Group Photo**. Everyone must be in position (all operations succeed) for the photo to be taken (committed). If even one person isn't ready (operation fails), the photo is cancelled (rolled back) and nobody appears.
- **The Trap:** Not handling transaction errors properly — if commitTransaction fails, you must still abort and end the session. Always use try/catch/finally.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use Mongoose sessions for MongoDB transactions. I start a session, begin a transaction, perform all database operations with the session option, and commit. If any operation fails, I abort the transaction in the catch block. The finally block always ends the session. This ensures atomicity — either all operations succeed or none do. I use transactions for operations that must be consistent together, like creating a user and their default settings."

#### When should you use transactions vs. single-document operations?
- **The Engine Mechanism (Why it behaves this way):** MongoDB guarantees atomicity for single-document operations (update, insert, delete on one document). Use transactions only when you need to modify multiple documents atomically. Transactions have performance overhead — they lock resources and require replica sets. Design your schema to minimize the need for transactions: embed related data in a single document when possible (denormalization). Use transactions for cross-collection operations that must be atomic: transferring money between accounts, creating an order with inventory updates.
- **The Unforgettable Mental Model:** The **Single Envelope vs. Multiple Envelopes**. Single-document operations are like putting everything in one envelope — it's delivered together or not at all. Transactions are like coordinating multiple envelopes — they all must arrive together or none should.
- **The Trap:** Overusing transactions for operations that could be designed as single-document operations. Schema design should minimize transaction needs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use transactions only when I need atomic operations across multiple documents or collections. For single-document operations, MongoDB's built-in atomicity is sufficient. I design schemas to minimize transaction needs — embedding related data when possible. I use transactions for cross-collection operations like order creation with inventory updates, or money transfers between accounts. Transactions have performance overhead, so I use them judiciously."

#### How do you handle transactions with async/await?
- **The Engine Mechanism (Why it behaves this way):** Wrap the entire transaction in a try/catch/finally block: `const session = await mongoose.startSession(); try { session.startTransaction(); const user = await User.create([{ name: 'Alice' }], { session }); await Order.create([{ userId: user[0]._id }], { session }); await session.commitTransaction(); } catch (err) { await session.abortTransaction(); throw err; } finally { session.endSession(); }`. The key is that `commitTransaction` can also throw — if it fails (network issue, conflict), the transaction must be aborted. Mongoose also supports `session.withTransaction(async () => { ... })` which handles retry logic automatically.
- **The Unforgettable Mental Model:** The **Three-Step Dance**. Step 1: start the music (startTransaction). Step 2: dance together (all operations). Step 3: bow together (commitTransaction). If anyone trips (error), stop immediately (abortTransaction). The music always ends (endSession in finally).
- **The Trap:** Not wrapping commitTransaction in the try block — if commit fails, the catch block won't abort the transaction, leaving it in an inconsistent state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I wrap the entire transaction flow in try/catch/finally. Start session and transaction in try, perform all operations with the session option, commit in try, abort in catch, and end session in finally. I prefer session.withTransaction() because it handles retry logic for transient errors automatically. The critical detail is that commitTransaction can fail too — it must be inside the try block so failures trigger abort."

#### How do you handle transactions across multiple services?
- **The Engine Mechanism (Why it behaves this way):** Distributed transactions across services are complex. Approaches: (1) **Saga pattern** — break the transaction into steps, each with a compensating action. If step 3 fails, execute compensating actions for steps 2 and 1. (2) **Two-phase commit** — prepare all services, then commit or rollback. (3) **Eventual consistency** — use message queues to coordinate. For MERN apps, keep related operations within a single service/database to use native transactions. If you must coordinate across services, the saga pattern is the most practical approach.
- **The Unforgettable Mental Model:** The **Domino Chain**. Each service is a domino. If the chain completes, great. If one domino falls wrong (service fails), you need to set up the previous dominos back to their original position (compensating actions).
- **The Trap:** Trying to use MongoDB transactions across multiple database connections or services. MongoDB transactions only work within a single replica set or sharded cluster.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: MongoDB transactions only work within a single database. For cross-service operations, I use the saga pattern — each step has a compensating action that undoes it if a later step fails. For MERN apps, I try to keep related operations within a single service to use native transactions. If distributed transactions are unavoidable, I implement sagas with a coordinator that tracks the state of each step and executes compensations on failure."

#### How do you test transactional code?
- **The Engine Mechanism (Why it behaves this way):** Test three scenarios: (1) **Happy path** — all operations succeed, transaction commits, verify data exists. (2) **Failure mid-transaction** — mock an operation to throw, verify transaction aborts and no data is created. (3) **Commit failure** — mock commitTransaction to throw, verify abort is called. Use an in-memory MongoDB (mongodb-memory-server) for testing. Verify the database state after each test: `expect(await User.countDocuments()).toBe(0)` after aborted transaction.
- **The Unforgettable Mental Model:** The **Fire Drill**. You test the transaction's happy path (normal operation), the failure path (what happens when something goes wrong), and the recovery path (does everything roll back cleanly). Like a fire drill — you practice both the normal exit and the emergency procedures.
- **The Trap:** Only testing the happy path. Transaction bugs almost always occur in failure scenarios — ensuring rollback works correctly is more important than testing the success case.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test transactions in three scenarios: happy path (all succeed, data committed), mid-transaction failure (operation throws, data rolled back), and commit failure (commit throws, abort called). I use mongodb-memory-server for isolated testing. After each test, I verify the database state — no partial data should exist after an aborted transaction. Transaction testing is critical because bugs here cause data inconsistency."

## 8. Active recall test

1. **How do you start a MongoDB transaction with Mongoose?**
   - **Explanation:** `const session = await mongoose.startSession(); session.startTransaction();` Then pass `{ session }` to all operations. Commit with `await session.commitTransaction()`.

2. **What happens if an operation in a transaction fails?**
   - **Explanation:** The catch block should call `await session.abortTransaction()`, which rolls back all operations in the transaction. No partial data is committed.

3. **When should you use transactions in MongoDB?**
   - **Explanation:** Only when you need atomic operations across multiple documents or collections. Single-document operations are already atomic. Transactions have performance overhead.

4. **What is the saga pattern for distributed transactions?**
   - **Explanation:** Break a multi-service operation into steps, each with a compensating action. If a step fails, execute compensating actions for all previous steps to undo their effects.

5. **Why use session.withTransaction() instead of manual transaction handling?**
   - **Explanation:** withTransaction() automatically handles retry logic for transient errors (like temporary network issues), retries the transaction, and manages commit/abort automatically.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle transactions in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle transactions in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
