# Transactions in FastAPI

## Detailed explanation

Transactions group database changes so they commit together or rollback together. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Transactions make multi-step writes atomic.

## 2. Problem it solves

It keeps FastAPI applications predictable by making contracts, shared logic, validation, or runtime behavior explicit instead of scattering framework code across handlers.

## 3. Core idea

- Use Python type hints as API contracts.
- Keep route handlers thin and delegate business logic to services.
- Use dependencies for shared request-time behavior.
- Return explicit response models and status codes.
- Test behavior through HTTP calls and dependency overrides.

## 4. Visual / analogy

```txt
Request -> dependency resolution -> validation -> endpoint -> service/database -> response model -> response
```

## 5. Minimal example

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str

@app.post("/items")
def create_item(item: Item):
    return {"data": item}
```

## 6. Real-world example

A production FastAPI service uses routers per domain, Pydantic schemas for input/output, dependencies for auth and DB sessions, exception handlers for consistent errors, and tests with dependency overrides.

## 7. Common interview questions

#### What are database transactions and why use them?
- **The Engine Mechanism (Why it behaves this way):** A transaction groups multiple database operations into a single atomic unit — either all operations succeed (commit) or all fail (rollback). This ensures data consistency: if transferring money from A to B, both the debit from A and credit to B must succeed together. If the credit fails, the debit is rolled back. In SQLAlchemy, transactions are managed by the session: `db.add(order); db.add(payment); db.commit()` — both are committed together. If an exception occurs before commit, the session's changes are discarded.
- **The Unforgettable Mental Model:** The **All-or-Nothing Bet**. You either win everything (commit) or lose everything (rollback). There's no "win half the bet." Transactions ensure multi-step operations are atomic.
- **The Trap**: Assuming each individual operation is automatically committed. Without explicit commit(), changes are pending and discarded when the session closes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Transactions group multiple database operations into an atomic unit — all succeed or all fail. This ensures data consistency for multi-step operations. In SQLAlchemy, the session manages the transaction — changes are pending until commit(), and discarded on rollback or session close."

#### How do you manage transactions in FastAPI with SQLAlchemy?
- **The Engine Mechanism (Why it behaves this way):** The session's transaction covers all operations within a request. By default, SQLAlchemy sessions start a transaction on the first operation. `db.commit()` persists all changes; `db.rollback()` undoes them. For explicit transaction control, use `with db.begin():` (SQLAlchemy 2.0) which auto-commits on success and auto-rollbacks on exception: `with db.begin(): db.add(order); db.add(payment)`. This is cleaner than manual commit/rollback — the context manager handles both paths.
- **The Unforgettable Mental Model:** The **Safety Net**. The context manager (db.begin()) is a safety net — if everything goes well, you land safely (commit). If you fall (exception), the net catches you (rollback).
- **The Trap**: Mixing manual commit/rollback with context managers. Choose one approach — either explicit commit/rollback or context managers. Mixing them creates confusion about who controls the transaction.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use SQLAlchemy 2.0's db.begin() context manager for explicit transaction control — it auto-commits on success and auto-rollbacks on exception. This is cleaner than manual commit/rollback. The session's transaction covers all operations within the request."

#### What is the ACID property of transactions?
- **The Engine Mechanism (Why it behaves this way):** ACID stands for: **Atomicity** — all operations in a transaction succeed or all fail (no partial commits). **Consistency** — transactions bring the database from one valid state to another (constraints are enforced). **Isolation** — concurrent transactions don't interfere with each other (controlled by isolation level). **Durability** — committed transactions survive system crashes (written to disk). These properties ensure reliable data processing even under concurrent access and system failures.
- **The Unforgettable Mental Model:** The **Bank Transfer**. Atomicity: money leaves A AND arrives at B, or neither happens. Consistency: total money in the system stays the same. Isolation: two simultaneous transfers don't double-spend. Durability: once confirmed, the transfer survives a power outage.
- **The Trap**: Assuming isolation means "no concurrent access." Isolation levels control how much concurrent transactions can see of each other — not whether they run concurrently.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: ACID ensures reliable transactions: Atomicity (all or nothing), Consistency (valid state transitions), Isolation (concurrent transactions don't interfere), and Durability (committed data survives crashes). These properties are fundamental to relational databases and ensure data integrity under concurrent access."

#### How do you handle nested transactions?
- **The Engine Mechanism (Why it behaves this way):** SQLAlchemy supports nested transactions via savepoints: `with db.begin_nested(): db.add(sub_order)`. A savepoint creates a checkpoint within the outer transaction. If the nested transaction rolls back, only changes after the savepoint are undone — the outer transaction continues. This is useful for partial operations: try to process a sub-order, if it fails, rollback just that sub-order but continue with the main order. Savepoints are database-specific — not all databases support them.
- **The Unforgettable Mental Model:** The **Checkpoint in a Video Game**. The main game (outer transaction) is running. You create a checkpoint (savepoint). If you die in the next level (nested transaction fails), you respawn at the checkpoint — the main game continues from before the level.
- **The Trap**: Assuming nested transactions are independent. They're not — if the outer transaction rolls back, all nested transactions are also rolled back, even if they committed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use savepoints for nested transactions — with db.begin_nested(). If the nested transaction rolls back, only changes after the savepoint are undone. But if the outer transaction rolls back, all nested transactions are also rolled back. Savepoints are database-specific — check support for your database."

#### How do transactions affect concurrent requests?
- **The Engine Mechanism (Why it behaves this way):** Transactions isolate concurrent requests through isolation levels. **Read Committed** (default) — each query sees only committed data. **Repeatable Read** — queries in the same transaction see consistent data. **Serializable** — transactions run as if sequential (strictest). Higher isolation levels prevent more concurrency issues (dirty reads, phantom reads) but reduce throughput. Long-running transactions hold locks, blocking other requests. Keep transactions short — do minimal work within the transaction boundary.
- **The Unforgettable Mental Model:** The **Library Study Room**. Read Committed: you see books others have finished returning. Repeatable Read: you see the same shelf arrangement throughout your visit. Serializable: you have the room to yourself — no one else can enter.
- **The Trap**: Doing heavy computation or external API calls within a transaction. This holds locks longer than necessary, blocking other requests. Keep transactions short — only database operations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Transactions isolate concurrent requests through isolation levels. I keep transactions short — only database operations within the transaction boundary. Heavy computation and external API calls happen outside the transaction. Long transactions hold locks and block other requests."

#### How do you test transaction behavior?
- **The Engine Mechanism (Why it behaves this way):** Test commit: create data within a transaction, commit, verify data persists. Test rollback: create data, raise an exception before commit, verify data is not persisted. Test nested transactions: create outer data, create nested data, rollback nested, verify outer data persists but nested doesn't. Test concurrent transactions: two requests modify the same data, verify isolation level behavior. Use TestClient with test database for transaction tests.
- **The Unforgettable Mental Model:** The **Fire Drill**. Test both the normal procedure (commit) and the emergency procedure (rollback). Verify that the building (database) is in the correct state after each scenario.
- **The Trap**: Only testing the happy path (commit). Transaction rollback behavior is equally important — it's what prevents data corruption when things go wrong.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test both commit and rollback paths. For commit, I verify data persists. For rollback, I raise an exception before commit and verify data is not persisted. I test nested transactions and concurrent access. Rollback testing is critical — it's what prevents data corruption."

## 8. Active recall test

1. **What are database transactions?**
   - **Explanation:** Atomic units of database operations — all succeed (commit) or all fail (rollback). Ensures data consistency for multi-step operations.

2. **How do you manage transactions in FastAPI with SQLAlchemy?**
   - **Explanation:** Use db.begin() context manager (SQLAlchemy 2.0) for auto-commit on success and auto-rollback on exception. Or manual db.commit()/db.rollback().

3. **What does ACID stand for?**
   - **Explanation:** Atomicity (all or nothing), Consistency (valid state transitions), Isolation (concurrent transactions don't interfere), Durability (committed data survives crashes).

4. **How do nested transactions work?**
   - **Explanation:** Via savepoints (db.begin_nested()). Nested rollback undoes only changes after the savepoint. But outer rollback undoes all nested transactions too.

5. **How do transactions affect concurrent requests?**
   - **Explanation:** Through isolation levels. Higher levels prevent more concurrency issues but reduce throughput. Keep transactions short to minimize lock holding.

6. **How do you test transaction behavior?**
   - **Explanation:** Test commit (data persists), rollback (data not persisted after exception), nested transactions, and concurrent access. Test both happy and error paths.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Transactions in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Transactions in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Transactions in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
