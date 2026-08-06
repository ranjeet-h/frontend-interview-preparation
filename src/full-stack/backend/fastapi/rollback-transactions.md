# Rollback Transactions

## Detailed explanation

Rollback undoes uncommitted transaction changes when validation, domain rules, or database errors fail. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Rollback protects consistency after failure.

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

#### When should you rollback a transaction?
- **The Engine Mechanism (Why it behaves this way):** Rollback when any operation within the transaction fails: database errors (constraint violations, deadlocks), validation errors (business rule failures), or external service failures (payment gateway errors). The rollback undoes all uncommitted changes, returning the database to its pre-transaction state. In SQLAlchemy, `db.rollback()` discards all pending changes. With context managers (`db.begin()`), rollback happens automatically on exception. The key principle: if any part of a multi-step operation fails, the entire operation should be undone.
- **The Unforgettable Mental Model:** The **Undo Button**. You're editing a document (transaction) — you make several changes. If something goes wrong, you hit Ctrl+Z (rollback) and everything returns to how it was before you started editing.
- **The Trap**: Rolling back only part of a transaction. Rollback undoes ALL uncommitted changes in the transaction — you can't selectively rollback some operations. Use savepoints for partial rollback.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I rollback when any operation in the transaction fails — database errors, validation failures, or external service errors. Rollback undoes ALL uncommitted changes, returning the database to its pre-transaction state. With context managers, rollback happens automatically on exception."

#### How does automatic rollback work with context managers?
- **The Engine Mechanism (Why it behaves this way):** SQLAlchemy 2.0's `db.begin()` context manager automatically commits on successful exit and rolls back on exception: `with db.begin(): db.add(order); db.add(payment)`. If any line raises an exception, the context manager catches it, rolls back the transaction, and re-raises the exception. This eliminates manual commit/rollback boilerplate. The pattern is: enter context → do work → exit (commit on success, rollback on error). This is the recommended approach for transaction management in modern SQLAlchemy.
- **The Unforgettable Mental Model:** The **Automatic Door**. The door opens (transaction starts). If you walk through successfully (no exception), it closes behind you (commit). If you trip (exception), it closes and locks (rollback) — you can't get back in.
- **The Trap**: Catching exceptions inside the context manager without re-raising. If you catch and swallow the exception, the context manager thinks everything succeeded and commits. Always re-raise or let exceptions propagate.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use db.begin() context manager for automatic transaction management. It commits on success and rolls back on exception. I never catch and swallow exceptions inside the context — that would cause a commit when a rollback is needed. Exceptions must propagate for automatic rollback to work."

#### How do you handle rollback with partial success scenarios?
- **The Engine Mechanism (Why it behaves this way):** For partial success (some operations succeed, others fail), use savepoints: `with db.begin(): db.add(order); try: with db.begin_nested(): db.add(payment); except PaymentError: pass # payment failed, but order continues`. The outer transaction continues even if the nested transaction rolls back. Alternatively, handle the failure at the application level — catch the exception, log it, and decide whether to continue or rollback the entire transaction. The decision depends on business requirements: is the order valid without payment, or should the entire operation be undone?
- **The Unforgettable Mental Model:** The **Multi-Course Meal**. The appetizer (order) is served. The main course (payment) has an issue. You can either skip the main course and continue with dessert (savepoint rollback) or cancel the entire meal (full rollback). It depends on the restaurant's policy (business rules).
- **The Trap**: Assuming partial success is always acceptable. In financial transactions, partial success is usually NOT acceptable — if payment fails, the order should be rolled back too.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For partial success, I use savepoints to rollback specific operations while continuing the outer transaction. But for critical operations like payments, I prefer full rollback — if payment fails, the entire order is undone. The decision depends on business requirements, not technical convenience."

#### How do you test rollback behavior?
- **The Engine Mechanism (Why it behaves this way):** Test rollback by: (1) Trigger an exception during a transaction, (2) Verify the transaction was rolled back (data not persisted), (3) Verify the database is in its pre-transaction state. Use TestClient with a test database: `with pytest.raises(PaymentError): client.post("/orders", json={...}); assert db.query(Order).count() == 0`. Test various failure scenarios: constraint violations, validation errors, external service failures. Verify that partial changes are not persisted — no orphaned records.
- **The Unforgettable Mental Model:** The **Crash Test**. You intentionally crash the car (trigger exception) during the transaction and verify that the safety systems (rollback) work correctly — no debris (orphaned records) left behind.
- **The Trap**: Only testing rollback with database errors. Test rollback with validation errors, business rule failures, and external service errors too. Each should trigger a clean rollback.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test rollback by triggering exceptions during transactions and verifying no data is persisted. I test various failure scenarios — constraint violations, validation errors, external service failures. I verify no orphaned records remain. Rollback testing is as important as commit testing."

#### What happens if rollback itself fails?
- **The Engine Mechanism (Why it behaves this way):** Rollback rarely fails — it's a database-level operation that undoes uncommitted changes. However, if the database connection is lost during rollback, the transaction is automatically rolled back by the database (uncommitted transactions are rolled back on connection close). The session may be in an invalid state and should be discarded. Create a new session for subsequent operations. In production, log the rollback failure and alert — it indicates a serious infrastructure issue.
- **The Unforgettable Mental Model:** The **Emergency Brake**. If the regular brakes (rollback) fail, the emergency brake (database auto-rollback on connection close) kicks in. The car stops, but you need a new car (new session) to continue driving.
- **The Trap**: Trying to reuse a session after a rollback failure. The session is in an invalid state — discard it and create a new one.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Rollback rarely fails, but if the connection is lost, the database auto-rollbacks uncommitted transactions. The session becomes invalid — I discard it and create a new one. I log rollback failures and alert, as they indicate infrastructure issues."

#### How does rollback affect production reliability?
- **The Engine Mechanism (Why it behaves this way):** Proper rollback prevents: (1) **Data corruption** — partial writes leave the database in an inconsistent state, (2) **Orphaned records** — related records without their parent, (3) **Financial discrepancies** — money debited but not credited, (4) **Cascade failures** — one failed operation corrupts data that other operations depend on. Without rollback, errors compound — each failed request leaves the database slightly more corrupted. Rollback ensures that failed requests leave the database exactly as they found it.
- **The Unforgettable Mental Model:** The **Erasable Whiteboard**. Without rollback, mistakes are permanent marker — they accumulate and corrupt the board. With rollback, mistakes are erased — the board stays clean for the next person.
- **The Trap**: Not monitoring rollback frequency. High rollback rates indicate application bugs or infrastructure issues. Monitor and alert on abnormal rollback rates.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Proper rollback prevents data corruption, orphaned records, financial discrepancies, and cascade failures. Failed requests leave the database exactly as they found it. I monitor rollback frequency — high rates indicate bugs or infrastructure issues. Rollback is the safety net that keeps the database consistent under failure."

## 8. Active recall test

1. **When should you rollback a transaction?**
   - **Explanation:** When any operation fails — database errors, validation failures, or external service errors. Rollback undoes ALL uncommitted changes.

2. **How does automatic rollback work with context managers?**
   - **Explanation:** db.begin() commits on successful exit and rolls back on exception. Never catch and swallow exceptions inside — that prevents automatic rollback.

3. **How do you handle partial success scenarios?**
   - **Explanation:** Use savepoints (db.begin_nested()) for partial rollback within an outer transaction. For critical operations like payments, prefer full rollback.

4. **How do you test rollback behavior?**
   - **Explanation:** Trigger exceptions during transactions, verify no data is persisted, verify no orphaned records. Test various failure scenarios — DB errors, validation, external services.

5. **What happens if rollback itself fails?**
   - **Explanation:** The database auto-rollbacks on connection close. The session becomes invalid — discard it and create a new one. Log and alert on rollback failures.

6. **How does rollback affect production reliability?**
   - **Explanation:** Prevents data corruption, orphaned records, financial discrepancies, and cascade failures. Failed requests leave the database exactly as they found it.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Rollback Transactions should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Rollback Transactions, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Rollback Transactions.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
