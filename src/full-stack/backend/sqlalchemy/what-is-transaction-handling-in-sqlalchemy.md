# What is transaction handling in SQLAlchemy

## Detailed explanation

What is transaction handling in SQLAlchemy is a core SQLAlchemy topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is transaction handling in sqlalchemy by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply SQLAlchemy rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, what is transaction handling in sqlalchemy affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is transaction handling in SQLAlchemy?
- **The Engine Mechanism (Why it behaves this way):** SQLAlchemy manages transactions through the Session object. When you first execute a query or modify an object, the Session implicitly begins a database transaction (BEGIN). Changes are tracked in memory until you call `commit()`, which flushes pending changes to the database and commits the transaction (COMMIT). If an error occurs, you call `rollback()` to undo all changes (ROLLBACK). The transaction is tied to the underlying database connection — when the session closes, any uncommitted transaction is rolled back. SQLAlchemy also supports nested transactions via savepoints (`session.begin_nested()`), which allow partial rollbacks within a larger transaction.
- **The Unforgettable Mental Model:** The **Bank Transfer**. You debit one account and credit another — both must succeed or both must fail. The transaction is the guarantee that money doesn't disappear if the system crashes mid-transfer. commit() is the "confirm" button, rollback() is "cancel."
- **The Trap:** Not handling exceptions properly — if an error occurs and you don't rollback, the session enters a broken state and can't be used for further operations. The transaction remains open, holding locks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SQLAlchemy manages transactions through the Session. A transaction begins implicitly on first use. commit() flushes changes and commits the transaction. rollback() undoes all changes. I always use try/except/finally: try to commit, rollback on any exception, and close in finally. For nested operations, I use savepoints (begin_nested()) for partial rollbacks. The key discipline is: every transaction must end with either commit or rollback — never leave a transaction open."

#### What is the difference between flush and commit?
- **The Engine Mechanism (Why it behaves this way):** `flush()` translates pending changes (new objects, modified attributes, deleted objects) into SQL statements and executes them against the database, but does NOT commit the transaction. The changes are visible within the current transaction (subsequent queries in the same session see them) but not to other database connections. `commit()` calls `flush()` first, then commits the transaction, making changes permanent and visible to all connections. Flush is automatic before queries that might be affected by pending changes. You can call flush() manually to get database-generated values (auto-increment IDs, computed columns) before committing.
- **The Unforgettable Mental Model:** The **Draft vs. Published Article**. flush() is saving the draft to the CMS — you can preview it, but readers can't see it. commit() is hitting "Publish" — now everyone sees it. You can discard a draft (rollback), but once published, it's permanent.
- **The Trap:** Calling flush() thinking it commits. Changes are in the database but not committed — other connections can't see them, and a rollback will discard them. Also, flush can fail (constraint violations) without committing, leaving the transaction in an error state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: flush() sends pending changes as SQL to the database but doesn't commit — changes are visible within the session but not to other connections. commit() calls flush() then commits, making changes permanent and visible to everyone. I call flush() manually when I need database-generated values like auto-increment IDs before committing. Flush is also called automatically before queries that might be affected by pending changes. The key: flush ≠ commit."

#### What are savepoints and when do you use them?
- **The Engine Mechanism (Why it behaves this way):** Savepoints are nested transaction markers within a larger transaction, created with `session.begin_nested()`. They allow you to rollback part of a transaction without rolling back the entire thing. If a savepoint operation fails, you rollback to the savepoint (undoing only changes since the savepoint) while keeping earlier changes intact. Savepoints are implemented using the database's SAVEPOINT SQL command. They're useful for batch processing where individual items might fail but you want to continue processing the rest, or for trying an operation that might fail without aborting the entire transaction.
- **The Unforgettable Mental Model:** The **Video Game Checkpoint**. You save at checkpoint A, play through a difficult section, and if you die, you respawn at checkpoint A — not at the beginning of the game. The earlier progress (checkpoint A) is preserved.
- **The Trap:** Thinking savepoints work across sessions. Savepoints are tied to a single session's transaction. You can't create a savepoint in one session and rollback to it in another.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Savepoints are nested transactions created with session.begin_nested(). They let you rollback part of a transaction without undoing everything. I use them for batch processing — if one item fails, I rollback to the savepoint and continue with the next item. They're also useful for trying operations that might fail without aborting the entire transaction. The database implements them with SAVEPOINT SQL commands. Each savepoint can have its own try/except/rollback block within the larger transaction."

#### How do you handle transaction isolation levels?
- **The Engine Mechanism (Why it behaves this way):** Transaction isolation levels control how concurrent transactions interact. SQLAlchemy supports: `READ UNCOMMITTED` (sees uncommitted changes from other transactions), `READ COMMITTED` (sees only committed changes — PostgreSQL default), `REPEATABLE READ` (same query returns same results within transaction — MySQL default), and `SERIALIZABLE` (transactions execute as if sequential). You set the isolation level at the engine level: `create_engine(url, isolation_level="READ COMMITTED")` or per-connection: `connection.execution_options(isolation_level="SERIALIZABLE")`. The choice affects concurrency and consistency: higher isolation prevents anomalies (dirty reads, non-repeatable reads, phantoms) but reduces concurrency.
- **The Unforgettable Mental Model:** The **Window Blinds**. READ UNCOMMITTED: blinds fully open — you see everything, even what others are still working on. READ COMMITTED: blinds open only on finished work. REPEATABLE READ: take a photo — what you see stays the same. SERIALIZABLE: you're the only one in the room — no one else can work while you're looking.
- **The Trap:** Using SERIALIZABLE for everything. It prevents all concurrency anomalies but serializes transactions — only one can run at a time, killing throughput. Use the lowest isolation level that meets your consistency requirements.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Isolation levels control how concurrent transactions interact. READ COMMITTED (PostgreSQL default) sees only committed changes — good for most cases. REPEATABLE READ ensures same query returns same results within a transaction. SERIALIZABLE prevents all anomalies but serializes transactions, reducing concurrency. I set isolation at the engine level for the default, and override per-connection for specific operations. I use READ COMMITTED for most operations and SERIALIZABLE only for critical financial operations where consistency is paramount."

#### What happens to a session after a failed transaction?
- **The Engine Mechanism (Why it behaves this way):** After a transaction fails (e.g., constraint violation, deadlock), the session enters an invalid state. The database marks the transaction as aborted, and any further operations on that session will fail until you call `rollback()`. SQLAlchemy raises `InvalidRequestError` if you try to use the session without rolling back first. The correct recovery pattern is: catch the exception, call `session.rollback()`, and then either retry the operation or close the session. The rollback clears the invalid transaction state and returns the session to a usable state.
- **The Unforgettable Mental Model:** The **Jammed Printer**. After a paper jam (transaction failure), the printer won't work until you clear the jam (rollback). Trying to print more pages (further operations) without clearing the jam just causes more errors.
- **The Trap:** Trying to continue using the session after an error without rolling back. This raises InvalidRequestError and can mask the original error. Always rollback before further operations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: After a transaction fails, the session enters an invalid state — the database marks the transaction as aborted. Any further operations raise InvalidRequestError until you call rollback(). My pattern is: try to commit, except: rollback and either retry or re-raise, finally: close. The rollback clears the invalid state and makes the session usable again. Never try to use a session after an error without rolling back first."

## 8. Active recall test

1. **What is transaction handling in SQLAlchemy?**
   - **Explanation:** Session manages transactions implicitly — begins on first use. commit() flushes changes and commits. rollback() undoes all changes. Always use try/except/finally: commit, rollback on error, close in finally. Supports nested transactions via savepoints.

2. **Difference between flush and commit?**
   - **Explanation:** flush() sends changes as SQL but doesn't commit — visible within session only. commit() calls flush() then commits, making changes permanent and visible to all. Use flush() to get DB-generated values (auto-increment IDs) before committing.

3. **What are savepoints?**
   - **Explanation:** Nested transactions via session.begin_nested(). Allow partial rollback without undoing the entire transaction. Useful for batch processing (skip failed items) or trying operations that might fail. Implemented with database SAVEPOINT SQL.

4. **How to handle isolation levels?**
   - **Explanation:** Set at engine level (create_engine(isolation_level=...)) or per-connection. READ COMMITTED (PostgreSQL default) for most cases. SERIALIZABLE for critical operations but reduces concurrency. Use lowest level that meets consistency requirements.

5. **What happens after a failed transaction?**
   - **Explanation:** Session enters invalid state. Further operations raise InvalidRequestError until rollback(). Pattern: catch exception, rollback(), then retry or re-raise. Never use session after error without rolling back first.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is transaction handling in SQLAlchemy in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is transaction handling in SQLAlchemy in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
