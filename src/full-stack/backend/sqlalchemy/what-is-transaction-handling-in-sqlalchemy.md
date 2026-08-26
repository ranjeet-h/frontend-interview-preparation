# Transaction Handling in SQLAlchemy 2.0: Autobegin, Commit Lifecycles, and Isolation Levels

## 1. Why This Exists — The Problem First

Imagine you are running a financial ledger service. User Alice transfers $500 to Bob. Your backend executes the first SQL statement: `UPDATE accounts SET balance = balance - 500 WHERE id = 1`. Immediately after that line executes, your service attempts an external fraud check or encounters an unhandled zero-division error before it can execute `UPDATE accounts SET balance = balance + 500 WHERE id = 2`. If your database operations are not enclosed in a strictly managed atomic transaction, Alice loses $500, Bob receives $0, and your database is left in a corrupted, half-applied state.

Now consider an even subtler production disaster that brings down high-traffic microservices: an API endpoint queries a user table, fetches the data, and then spends 8 seconds formatting a massive PDF report before returning the HTTP response. In SQLAlchemy 2.0, the moment that initial `SELECT` query fired, SQLAlchemy quietly acquired a physical database connection from the connection pool and issued a `BEGIN` statement. For the next 8 seconds while Python generated the PDF, that database connection sat completely frozen in PostgreSQL's dreaded `idle in transaction` state. When 100 concurrent users hit that endpoint, your connection pool was starved within seconds, PostgreSQL table locks prevented background schema migrations from running, and the entire database grinded to an absolute standstill.

Relational databases promise ACID (Atomicity, Consistency, Isolation, Durability) guarantees, but the database cannot guess your business boundaries. Transaction handling in SQLAlchemy is the bridge that governs how connections are checked out, when transaction boundaries open and close, how partial failures recover without destroying whole operations, and how concurrent operations avoid reading each other's dirty drafts.

## 2. The Analogy — Make It Obvious

Think of SQLAlchemy transaction handling like a **Private Escrow Conference Room with a Notary and Draft Checkpoints**.

When you walk into the conference room, nobody outside knows what you are doing. 

**The Room Entry (The 2.0 Autobegin):** The moment you touch any document on the table (running your first query or modifying a record), the door automatically locks behind you and an official escrow session begins (`BEGIN`). You did not have to shout "open the room"; the room opened the instant you started interacting.

**The Notary Review (`session.flush()`):** While in the room, you draft several contracts: you deduct balance here, add balance there, and create an audit log. You hand these drafts to the notary standing inside the room. The notary checks every clause against the legal rules (verifying foreign key constraints, column types, and unique indexes) and stamps each contract with an official sequential document number (auto-increment primary keys). The draft is now staged and validated inside the room, but **no one outside the room can see or act on these contracts yet**.

**Post-It Checkpoints (`session.begin_nested()` / Savepoints):** You are drafting an optional addendum (like sending a promotional welcome credit). You place a Post-It bookmark on the desk (`SAVEPOINT`). If the addendum is invalid or rejected, you crumble up only the pages drafted after the Post-It bookmark (`ROLLBACK TO SAVEPOINT`). You don't have to burn down the entire conference room; your primary contracts remain intact.

**The Master Seal (`session.commit()`):** Once all contracts and addenda are verified, you press the master seal. The room door unlocks, the contracts are published to the public registry simultaneously, all locks on real property are released, and the changes become permanent.

**The Shredder (`session.rollback()`):** If a core clause fails or an unexpected error occurs, you throw all drafts into the industrial shredder. Every modification disappears as if you never set foot in the room.

**Walking Away Without Sealing (`idle in transaction`):** If you take a seat, draft half a line, and then leave the building to eat lunch while leaving the room locked and the notary waiting, you prevent anyone else in the city from buying or selling those assets. The entire registry office freezes because you held an open transaction while doing non-database work.

## 3. How It Actually Works — The Full Explanation

Understanding transaction management in SQLAlchemy 2.0 requires understanding five interconnected architectural layers: autobegin, the commit/flush cycle, transactional context managers, nested savepoints, and isolation levels.

**1. The 2.0 Autobegin Paradigm (Removal of Legacy Autocommit)**

In legacy SQLAlchemy 1.x, developers frequently used confusing modes like `autocommit=True` or had to manually call `session.begin()`. SQLAlchemy 2.0 completely removed `autocommit=True` and standardized on **autobegin**.

When you instantiate a `Session` (e.g., `session = Session(engine)`), it does not immediately hold a database connection or start a transaction. It stays purely in Python memory. The exact millisecond your application executes its first database operation—whether an ORM query, raw SQL `session.execute()`, or an explicit flush—the `Session` checks out a connection from the Engine's connection pool and emits a database `BEGIN` transaction. 

Once started, this transaction remains open until your code explicitly terminates it via `session.commit()`, `session.rollback()`, or `session.close()`. After the transaction ends, the `Session` returns the underlying DBAPI connection back to the connection pool. If you execute another query on that same `Session` later, autobegin triggers again, starting a brand-new transaction.

**2. The Commit and Flush Lifecycle**

The distinction between `flush()` and `commit()` is the single most important operational concept in SQLAlchemy ORM:

- **`session.flush()` (In-Transaction Synchronization):** Translates all pending Python object changes (new records added, attributes modified, rows marked for deletion) into SQL `INSERT`, `UPDATE`, and `DELETE` statements and sends them across the wire to the database server. The database executes these statements inside the current open transaction. Database constraints are validated, defaults are computed, and generated IDs are populated back into your Python model instances. However, **the transaction is not committed**. Other concurrent database connections cannot see these changes, and a rollback will still wipe them out completely.
- **`session.commit()` (Permanent Finalization):** Calls `flush()` first (if any pending changes exist), and then sends the SQL `COMMIT` command to the database engine. The database makes the changes permanent and releases all acquired row and table locks. Finally, SQLAlchemy automatically expires all attributes on loaded model instances by default (`expire_on_commit=True`), ensuring that subsequent attribute accesses re-query fresh state from the database.
- **`session.rollback()` (Total Abort):** Sends `ROLLBACK` to the database, discards all pending un-flushed changes from the session's internal memory, and expires all loaded objects so that stale or invalid in-memory data is not accidentally reused.

**3. Transaction Context Managers (`with session.begin():`)**

The gold standard pattern in SQLAlchemy 2.0 is using the transaction context manager `with session.begin():`. This pattern eliminates boilerplate `try/except/rollback` blocks and enforces clean transactional boundaries:

When Python enters the `with session.begin():` block, the session ensures a transaction is active. If the block finishes without an uncaught exception, SQLAlchemy automatically calls `session.commit()`. If an unhandled exception is raised anywhere inside the block, SQLAlchemy catches the error, calls `session.rollback()`, and re-raises the original exception so your outer API error handlers can respond accordingly.

At the engine level, you can also use `with engine.begin() as conn:`, which acquires a connection, opens a transaction, yields the connection, and auto-commits or rolls back upon exit.

**4. Nested Transactions and Savepoints (`session.begin_nested()`)**

Standard SQL databases do not support true physical nested transactions on a single connection. However, business workflows often require partial rollbacks: you want to attempt an operation (like charging a secondary credit card or inserting a batch row), and if it fails, undo only that specific step while keeping the surrounding transaction alive.

SQLAlchemy implements this via **Savepoints** through `session.begin_nested()`.

When you call `session.begin_nested()`:
- SQLAlchemy issues a SQL `SAVEPOINT <savepoint_name>` statement to the database.
- If the nested block succeeds, SQLAlchemy releases the savepoint marker via `RELEASE SAVEPOINT <savepoint_name>` (on databases that support release) or simply leaves the changes staged in the outer transaction.
- If an exception occurs inside the nested block and you catch it, calling `rollback()` on the nested transaction emits `ROLLBACK TO SAVEPOINT <savepoint_name>`. The database reverts only the modifications made after that savepoint was created. The outer transaction remains healthy and un-aborted.

**5. Two-Phase Commit (2PC) for Distributed Transactions**

When an enterprise workflow must mutate data across two completely separate database instances (for example, debiting a customer ledger in PostgreSQL and provisioning an account in MySQL), standard single-connection commits cannot guarantee atomicity. If database A commits and database B crashes before committing, data is permanently inconsistent.

SQLAlchemy supports Two-Phase Commit by configuring `Session(twophase=True)`. During 2PC:
- **Phase 1 (Prepare):** When `session.commit()` is called, SQLAlchemy iterates over all bound database engines and issues `PREPARE TRANSACTION '<transaction_id>'`. Each database validates constraints, writes to WAL (Write-Ahead Logging), locks resources, and guarantees that it can commit.
- **Phase 2 (Commit):** Once all participating databases successfully acknowledge the prepare phase, SQLAlchemy issues `COMMIT PREPARED '<transaction_id>'` to all engines. If any single database fails the prepare phase, SQLAlchemy issues `ROLLBACK PREPARED` to every participating engine, guaranteeing global atomicity.

**6. Database Isolation Levels**

Isolation levels dictate how concurrent transactions view each other's uncommitted or freshly committed modifications. SQLAlchemy lets you configure isolation levels globally at engine initialization or dynamically per connection.

The four standard ANSI SQL isolation levels represent a direct tradeoff between consistency and concurrency:

- **`READ UNCOMMITTED`:** Transactions can see uncommitted modifications written by other concurrent transactions. Suffers from dirty reads, non-repeatable reads, and phantom reads. Rarely used in production backend systems.
- **`READ COMMITTED` (Default for PostgreSQL, Oracle, SQL Server):** Each query inside a transaction only sees data committed before that specific query began. Prevents dirty reads. If Transaction A reads a row, Transaction B updates and commits that row, and Transaction A reads the row again within the same transaction, Transaction A will see the new value (non-repeatable read).
- **`REPEATABLE READ` (Default for MySQL InnoDB):** All queries within a transaction see a static snapshot of the database taken at the start of the transaction. If another transaction updates and commits rows, this transaction continues reading the original snapshot. Prevents dirty reads and non-repeatable reads.
- **`SERIALIZABLE`:** The strictest isolation level. Transactions execute as if they ran completely serially (one after another). The database engine monitors read/write dependencies or acquires range locks. If concurrent transactions conflict, the database engine aborts one of them with a serialization failure error (`OperationalError` / SQLSTATE `40001`), requiring the application to retry the entire transaction.

In SQLAlchemy 2.0, you configure isolation globally via `create_engine(url, isolation_level="REPEATABLE READ")` or dynamically per connection via `connection.execution_options(isolation_level="SERIALIZABLE")`.

## 4. Real Code — See It Working

Here is a complete, runnable example demonstrating atomic transactions, nested savepoint error recovery, and isolation level configuration in SQLAlchemy 2.0.

```python
from decimal import Decimal
from sqlalchemy import (
    create_engine,
    select,
    String,
    Numeric,
    Integer,
    ForeignKey,
    exc,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    Session,
    sessionmaker,
)

# 1. Define Declarative Schema
class Base(DeclarativeBase):
    pass

class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner: Mapped[str] = mapped_column(String(50), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("bank_accounts.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(255), nullable=False)

# 2. Configure Engine with explicit isolation level
# In SQLite / PostgreSQL, you can set the default isolation level on create_engine
engine = create_engine("sqlite:///:memory:", echo=False, isolation_level="SERIALIZABLE")
Base.metadata.create_all(engine)

SessionFactory = sessionmaker(bind=engine, expire_on_commit=False)

# 3. Seed initial test accounts
with SessionFactory() as session:
    with session.begin():
        alice = BankAccount(owner="Alice", balance=Decimal("1000.00"))
        bob = BankAccount(owner="Bob", balance=Decimal("200.00"))
        session.add_all([alice, bob])
    # The block exits: session automatically flushes and commits Alice and Bob

# 4. Atomic Money Transfer with Nested Savepoint Recovery
def transfer_funds(
    session_factory: sessionmaker[Session],
    from_account_id: int,
    to_account_id: int,
    amount: Decimal,
    simulate_audit_failure: bool = False,
) -> bool:
    """
    Transfers money atomically between two accounts.
    Uses an outer transaction for balance updates and a nested savepoint
    for audit logging so an audit failure does not abort the entire transfer.
    """
    with session_factory() as session:
        # with session.begin() enforces the outer transaction boundary
        with session.begin():
            # Load sender and receiver
            sender = session.scalar(
                select(BankAccount).where(BankAccount.id == from_account_id)
            )
            recipient = session.scalar(
                select(BankAccount).where(BankAccount.id == to_account_id)
            )

            if not sender or not recipient:
                raise ValueError("One or both account IDs do not exist.")

            if sender.balance < amount:
                raise ValueError(f"Insufficient funds. {sender.owner} has {sender.balance}")

            # Apply atomic balance adjustments
            sender.balance -= amount
            recipient.balance += amount

            # Manually flush so changes hit the database buffer within this transaction
            session.flush()

            # Nested Savepoint (session.begin_nested()):
            # If the audit log fails, we roll back ONLY the savepoint, preserving the transfer
            try:
                with session.begin_nested():
                    if simulate_audit_failure:
                        # Intentionally violate a foreign key or raise an exception
                        raise exc.SQLAlchemyError("Simulated disk failure on audit log write")

                    log = AuditLog(
                        account_id=sender.id,
                        action=f"Transferred ${amount} to {recipient.owner} (Account {recipient.id})"
                    )
                    session.add(log)
            except exc.SQLAlchemyError as savepoint_err:
                # The nested context manager automatically rolled back to SAVEPOINT
                print(f"[RECOVERY] Audit log failed ({savepoint_err}). Main transfer proceeds.")

        # Exiting the outer with session.begin() commits the transfer to the database
        return True

# 5. Execute Scenarios
print("--- Scenario 1: Successful Transfer with Working Audit Log ---")
transfer_funds(SessionFactory, from_account_id=1, to_account_id=2, amount=Decimal("150.00"), simulate_audit_failure=False)

with SessionFactory() as session:
    alice = session.scalar(select(BankAccount).where(BankAccount.id == 1))
    bob = session.scalar(select(BankAccount).where(BankAccount.id == 2))
    logs = session.scalars(select(AuditLog)).all()
    print(f"Alice Balance: ${alice.balance} (Expected 850.00)")
    print(f"Bob Balance:   ${bob.balance} (Expected 350.00)")
    print(f"Audit Logs Recorded: {len(logs)}")

print("\n--- Scenario 2: Transfer with Failed Audit Log (Savepoint Rollback) ---")
transfer_funds(SessionFactory, from_account_id=1, to_account_id=2, amount=Decimal("50.00"), simulate_audit_failure=True)

with SessionFactory() as session:
    alice = session.scalar(select(BankAccount).where(BankAccount.id == 1))
    bob = session.scalar(select(BankAccount).where(BankAccount.id == 2))
    logs = session.scalars(select(AuditLog)).all()
    print(f"Alice Balance: ${alice.balance} (Expected 800.00)")
    print(f"Bob Balance:   ${bob.balance} (Expected 400.00)")
    print(f"Audit Logs Recorded: {len(logs)} (Still 1, because the failed log was rolled back via Savepoint)")

# 6. Overriding Isolation Level Per Connection / Transaction
print("\n--- Scenario 3: Execution Option Isolation Override ---")
with engine.connect() as conn:
    # Set custom isolation level for a single isolated read transaction
    isolated_conn = conn.execution_options(isolation_level="READ COMMITTED")
    with isolated_conn.begin():
        accounts = isolated_conn.execute(select(BankAccount)).fetchall()
        print(f"Queried {len(accounts)} accounts under custom isolation.")
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is transaction handling in SQLAlchemy 2.0, and how does the autobegin mechanism work?**

In SQLAlchemy 2.0, transaction management centers on the `Session` acting as a Unit of Work bound to a database transaction. Legacy SQLAlchemy allowed an explicit `autocommit=True` mode, but 2.0 completely eliminated autocommit in favor of strict **autobegin**. 

When a `Session` is created, it remains decoupled from any physical database connection. The moment your code performs its first database operation (such as executing a `SELECT` query, flushing a new model instance, or issuing a raw SQL statement), the `Session` transparently requests a connection from the Engine's connection pool and emits a database `BEGIN` transaction. 

From that instant, the transaction remains open until you explicitly call `session.commit()`, `session.rollback()`, or exit a `with session.begin():` block. Once committed or rolled back, the underlying DBAPI connection is released back to the pool, and the session re-enters an idle state until the next query triggers autobegin again.

**Q: What is the exact operational difference between `session.flush()` and `session.commit()`?**

`session.flush()` communicates with the database within the current open transaction by translating pending in-memory Python object changes (inserts, updates, deletes) into SQL DML statements and executing them against the database server. Because the transaction remains open, database triggers fire, foreign keys and unique constraints are validated by the database engine, and server-generated defaults (such as auto-increment primary keys or timestamps) are populated back onto the Python model instances. However, no `COMMIT` command is issued. Other concurrent database connections cannot see these changes, and invoking `session.rollback()` will revert them completely.

`session.commit()`, on the other hand, makes all pending changes permanent and visible to all other database connections. It first invokes `session.flush()` to ensure any un-flushed in-memory changes are sent to the database, issues the SQL `COMMIT` command to the RDBMS, releases all acquired row/table locks, and by default expires all attributes on loaded Python model objects (`expire_on_commit=True`) so that future attribute reads fetch fresh state from the database.

**Q: What are savepoints in SQLAlchemy, and when should you use `session.begin_nested()`?**

Savepoints provide partial transaction rollbacks inside a single physical database connection. Standard relational databases do not support true nested `BEGIN / COMMIT` transactions. When you invoke `session.begin_nested()`, SQLAlchemy issues a SQL `SAVEPOINT <name>` command. 

If an operation inside the nested block raises an error and is caught, calling rollback on that nested transaction issues `ROLLBACK TO SAVEPOINT <name>`, undoing only the database modifications made since the savepoint was created, while leaving the parent transaction healthy and un-aborted. 

You use `session.begin_nested()` primarily in two scenarios:
1. **Batch data ingestion / processing:** When inserting 10,000 external records and you want to catch validation/constraint errors on record #452, log the failure, roll back only that single record, and continue processing the remaining 9,548 records without discarding the entire batch.
2. **Graceful feature degradation:** When attempting an optional secondary write (such as recording non-critical audit analytics or sending promotional credits) that must not prevent the primary business transaction (such as an order checkout) from succeeding if the secondary write encounters a constraint violation.

**Q: What happens when a query fails inside an active transaction, and what is `PendingRollbackError`?**

When a database query fails inside a transaction (for example, due to a unique key constraint violation, foreign key failure, or syntax error), the underlying database engine marks the entire physical transaction as aborted. 

In SQLAlchemy 2.0, the `Session` transitions into an inactive "rollback-only" error state. If your application code catches the database exception in a standard Python `try/except` block but attempts to execute another query on that same session without first calling `session.rollback()`, SQLAlchemy refuses to send the query and immediately raises `sqlalchemy.exc.PendingRollbackError` (or `InvalidRequestError`). 

This safety mechanism exists because the database engine will reject all subsequent SQL statements on an aborted transaction with errors like PostgreSQL's `current transaction is aborted, commands ignored until end of transaction block`. To recover, your code must either invoke `session.rollback()` to reset the session, use `session.begin_nested()` prior to the risky statement to isolate the error to a savepoint, or discard and close the session.

**Q: How do you configure and override database isolation levels in SQLAlchemy, and what are the concurrency trade-offs?**

You configure isolation levels at two distinct layers in SQLAlchemy:
1. **Engine Level (Global Default):** By passing `isolation_level` to `create_engine()`, such as `create_engine("postgresql+psycopg2://...", isolation_level="REPEATABLE READ")`. Every connection checked out of this engine's pool will default to this isolation level.
2. **Connection / Session Level (Per-Transaction Override):** By using `execution_options()`, such as `conn = engine.connect().execution_options(isolation_level="SERIALIZABLE")` or `session.connection(execution_options={"isolation_level": "SERIALIZABLE"})`.

The trade-off balances consistency against throughput:
- `READ COMMITTED` offers high concurrency with low lock contention and is the standard default for web services, but it permits non-repeatable reads and phantom reads.
- `REPEATABLE READ` guarantees a stable snapshot for analytical reads within a single transaction, but increases database memory overhead for MVCC undo logs.
- `SERIALIZABLE` completely eliminates all concurrency anomalies (dirty reads, non-repeatable reads, phantom reads, write skew), but severely degrades write concurrency and forces the database to abort conflicting transactions with serialization failure errors (`OperationalError` / SQLSTATE 40001). If you choose `SERIALIZABLE`, your application layer must implement exponential backoff retry loops.

**Q: How does Two-Phase Commit (2PC) work in SQLAlchemy for multi-database transactions?**

Two-Phase Commit (2PC) coordinates atomic transactions across multiple separate database servers. In standard SQLAlchemy, a session bound to multiple engines cannot guarantee that committing engine A and committing engine B will both succeed simultaneously. 

By enabling `twophase=True` on the `Session`, SQLAlchemy implements the XA/2PC protocol:
- In **Phase 1 (Prepare)**, SQLAlchemy calls `PREPARE TRANSACTION` on all bound database engines. Each engine writes the modifications to its WAL, locks required rows, checks constraints, and sends back a ready confirmation guaranteeing that it can commit.
- In **Phase 2 (Commit)**, if all engines returned success during Phase 1, SQLAlchemy issues `COMMIT PREPARED` to every database. If any single engine fails during the prepare phase (e.g. network timeout or constraint error), SQLAlchemy issues `ROLLBACK PREPARED` to all engines.

**Q: Why does leaving an uncommitted read query open cause major production database outages?**

Because of the 2.0 autobegin mechanic, executing a simple `SELECT` query starts a genuine database transaction and checks out a connection from the pool. If your endpoint runs a `SELECT` and then performs slow I/O (such as calling Stripe, generating an Excel file, or sending an email) before closing the session or committing/rolling back, the database connection sits in the `idle in transaction` state.

In production PostgreSQL environments, an `idle in transaction` connection holds an open transaction snapshot. This causes two fatal problems:
1. **Prevents Table Vacuuming (Table Bloat):** PostgreSQL's Autovacuum process cannot clean up dead row versions (tuples) updated or deleted anywhere in the database that are newer than the oldest running transaction snapshot. The database suffers massive disk and memory bloat.
2. **Blocks Schema Migrations (DDL Deadlocks):** When a deployment runs an `ALTER TABLE` or index creation, the DDL requires an `ACCESS EXCLUSIVE` lock. It queues behind your idle read transaction, and all subsequent read/write queries queue behind the DDL lock, cascading into total application downtime within seconds.

## 6. The Traps — What Goes Wrong

**1. The "Idle in Transaction" Connection Leak on Read Endpoints**

- **The Wrong Assumption:** Developers assume that because an endpoint only executes `SELECT` statements, no real database transaction is running, so they do not need to wrap read endpoints in transactional context managers or explicitly close the session.
- **Why It Is Wrong:** SQLAlchemy 2.0 autobegin starts a database transaction on the first `SELECT`. If your code queries the database, then waits for a 5-second third-party HTTP request or renders a template before exiting, that database connection remains locked in PostgreSQL's `idle in transaction` state.
- **What Happens Instead:** Your database connection pool runs out of available connections, incoming API requests hang, and background PostgreSQL `VACUUM` processes are blocked from cleaning dead tuples, causing severe performance degradation across the entire database.
- **The Fix:** Always scope database interactions tightly. In web frameworks like FastAPI or Flask, use dependency injection context managers that call `session.rollback()` or `session.close()` immediately once database work finishes, before executing external I/O:

```python
# BAD: Transaction opened on select and held during slow external API call
def export_user_report(session: Session, user_id: int):
    user = session.scalar(select(User).where(User.id == user_id))
    # Connection is now "idle in transaction" for 10 seconds!
    response = requests.post("https://slow-pdf-service.com/generate", json={"name": user.name})
    return response.content

# GOOD: Explicitly scope the read query and close/commit the transaction immediately
def export_user_report(session: Session, user_id: int):
    with session.begin():
        user_name = session.scalar(select(User.name).where(User.id == user_id))
    # Transaction is committed and connection returned to pool BEFORE slow I/O
    response = requests.post("https://slow-pdf-service.com/generate", json={"name": user_name})
    return response.content
```

**2. Reusing a Failed Session Without Rollback (The `PendingRollbackError`)**

- **The Wrong Assumption:** A developer catches an `IntegrityError` in a `try/except` block when inserting a duplicate user record and immediately attempts to query the database or insert a fallback record using the exact same session instance.
- **Why It Is Wrong:** When the database engine encounters a constraint violation, it marks the physical transaction as aborted. SQLAlchemy places the `Session` into an inactive rollback-only state.
- **What Happens Instead:** The subsequent query fails with `sqlalchemy.exc.PendingRollbackError: This Session's transaction has been rolled back due to a previous exception during flush`.
- **The Fix:** If you catch a database error on a top-level transaction, you must call `session.rollback()` before issuing further commands. If you want to handle individual statement failures without aborting the session, wrap the risky statement in `session.begin_nested()`:

```python
# BAD: Reusing session after caught error
try:
    session.add(User(email="existing@example.com"))
    session.flush()
except exc.IntegrityError:
    # Fails with PendingRollbackError on next line!
    user = session.scalar(select(User).where(User.email == "existing@example.com"))

# GOOD: Use session.begin_nested() for recoverable operations
try:
    with session.begin_nested():
        session.add(User(email="existing@example.com"))
        session.flush()
except exc.IntegrityError:
    # Savepoint was rolled back, outer transaction remains valid!
    user = session.scalar(select(User).where(User.email == "existing@example.com"))
```

**3. Dispatching Background Jobs Before `session.commit()` Completes**

- **The Wrong Assumption:** A developer flushes a newly created `Order` record, gets its generated ID (`order.id`), and immediately enqueues an asynchronous Celery or RQ background worker (`process_payment.delay(order.id)`) before calling `session.commit()`.
- **Why It Is Wrong:** `flush()` writes data to the database socket within the current uncommitted transaction. The background worker runs in a completely separate process and database connection.
- **What Happens Instead:** Under standard `READ COMMITTED` isolation, the background worker queries `SELECT * FROM orders WHERE id = 123`, finds nothing because the web request has not yet committed the transaction, and throws an immediate "Order Not Found" exception (a classic race condition).
- **The Fix:** Enqueue background tasks only after the transaction has successfully committed, or attach event listeners to `after_commit`:

```python
# BAD: Enqueueing before commit
with session.begin():
    order = Order(user_id=1, total=99.00)
    session.add(order)
    session.flush()
    # Race condition: Celery worker runs before commit finishes!
    celery_task.delay(order.id)

# GOOD: Enqueueing after commit
with session.begin():
    order = Order(user_id=1, total=99.00)
    session.add(order)
# Block exits and commit completes
celery_task.delay(order.id)
```

**4. Assuming `session.close()` Commits Unsaved Modifications**

- **The Wrong Assumption:** A developer mutates attributes on a loaded ORM object inside a helper function, assumes that calling `session.close()` or exiting the function will save the modifications, and moves on.
- **Why It Is Wrong:** When a `Session` closes, it releases its database connection back to the connection pool. To prevent uncommitted, dirty state from polluting the connection pool for subsequent requests, SQLAlchemy issues a `ROLLBACK` on any active transaction.
- **What Happens Instead:** All uncommitted in-memory attribute changes are silently discarded without throwing an error.
- **The Fix:** Never rely on session teardown to persist data. Always use explicit transaction boundaries: `with session.begin():` or `session.commit()`.

## 7. Compare With Related Concepts

**`session.flush()` vs. `session.commit()`**
- **Key Difference:** `flush()` translates in-memory Python object mutations into SQL statements and sends them to the database engine within the open transaction (populating primary keys and checking constraints), but leaves changes uncommitted and invisible to other connections. `commit()` invokes `flush()`, sends the SQL `COMMIT` command to make changes permanent and visible to everyone, and releases row/table locks.
- **One-Line Rule:** Use `flush()` when you need intermediate database-generated values (like auto-increment IDs) inside the same transaction; use `commit()` when your business unit of work is 100% finished.

**Unit of Work Pattern vs. Database Transaction**
- **Key Difference:** The Unit of Work is an in-memory design pattern managed by SQLAlchemy's `Session` that tracks object identity, state transitions (transient, pending, persistent, deleted), and calculates the minimal set of SQL queries required upon flush. A Database Transaction is a physical ACID boundary managed by the underlying database engine (PostgreSQL, MySQL) that guarantees atomicity and isolation on disk.
- **One-Line Rule:** The Unit of Work tracks what changed in Python; the Database Transaction ensures those changes apply atomically in SQL.

**Savepoint (`session.begin_nested()`) vs. Autonomous Transactions**
- **Key Difference:** A Savepoint is an internal checkpoint within a single database transaction on one connection; rolling it back only reverts changes back to that savepoint marker without affecting the parent transaction. An Autonomous Transaction is a completely independent transaction executing on a second, isolated database connection whose commit or rollback has zero dependency on the caller's transaction.
- **One-Line Rule:** Use `session.begin_nested()` to attempt a query that might fail without ruining the parent transaction; use a separate `Session` on a second connection if you need an audit log or event to commit even if the main transaction rolls back.

**Two-Phase Commit (2PC) vs. Saga Pattern (Distributed Transactions)**
- **Key Difference:** 2PC is a synchronous, blocking protocol managed at the database engine level (using `PREPARE TRANSACTION`) across multiple database instances on a shared local network. A Saga is an asynchronous architectural pattern where multiple independent microservices execute local transactions and publish events, relying on compensating transactions (undo actions) if a downstream service fails.
- **One-Line Rule:** Use 2PC only for tightly coupled multi-database setups where drivers natively support XA/PREPARE; use Sagas for distributed microservices communicating over REST, gRPC, or message queues.

**Optimistic Locking vs. Pessimistic Locking vs. Database Isolation**
- **Key Difference:** Database Isolation levels (`SERIALIZABLE`, `REPEATABLE READ`) are RDBMS-level concurrency settings. Pessimistic Locking explicitly locks rows at query time using SQL `SELECT ... FOR UPDATE`, blocking other transactions until commit. Optimistic Locking does not acquire database locks; instead, it checks a `version_id` column during `UPDATE` and raises `StaleDataError` if another transaction updated the row first.
- **One-Line Rule:** Use Pessimistic Locking (`with_for_update()`) for high-contention operations like balance deductions; use Optimistic Locking (`version_id_col`) for low-contention editing forms with long user think-time.

## 8. 🧠 The Memory Hook

In SQLAlchemy 2.0, the `Session` is an escrow room that locks the moment you touch a document: `flush()` drafts the contracts with the notary, `begin_nested()` sets a rollback bookmark, and nothing is real until `commit()` stamps the master seal. If you walk away to do slow work without sealing or shredding, you leave the database hostage in `idle in transaction`.
