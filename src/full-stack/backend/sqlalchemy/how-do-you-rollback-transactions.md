# Rolling Back Transactions in SQLAlchemy: Error Boundaries, In-Memory State Reset, and Savepoints

## 1. Why This Exists — The Problem First

Imagine you are building a user registration endpoint in FastAPI. A user signs up, and your code inserts a new user record, stages an invitation token, and queues a welcome notification. When a user submits an email that already exists, PostgreSQL throws a unique constraint violation (`IntegrityError`). 

You wrap the query in a Python `try...except IntegrityError:` block because you want to return a clean `409 Conflict` JSON response. But inside the exception handler, you log the failure by attempting to insert a row into an `audit_logs` table using the same database session, or you return early without touching the session.

The moment your code tries to run the audit query—or the next time that same session is used later in the request—your application crashes with:

```text
sqlalchemy.exc.PendingRollbackError: This Session's transaction has been rolled back by a sub-transaction, but will remain until the parent transaction is rolled back. Point your transaction boundary at a higher level or call session.rollback().
```

Your entire HTTP worker fails, returning a generic 500 Internal Server Error. 

This happens because a database transaction is an all-or-nothing error domain. When PostgreSQL hits a constraint violation, the database engine aborts the transaction on the wire. But SQLAlchemy's Python `Session` is an in-memory Unit of Work holding dirty objects, pending inserts, and tracked entity state. Catching the exception in Python does not fix the broken transaction in PostgreSQL, nor does it clean up the phantom objects in Python memory. Unless you explicitly roll back, Python and PostgreSQL disagree on reality, and the session is poisoned.

## 2. The Analogy — Make It Obvious

Think of working with SQLAlchemy like an architect designing a building with a master vault builder:

The permanent database is the **Master Vault**, where the final blueprints are stamped in stone.

The SQLAlchemy `Session` is the **Architect's Tracing Paper**. When you create new objects (`session.add()`) or modify fields on existing records (`user.name = "Alice"`), you are drawing pencil sketches and moving walls on your transparent tracing paper. The vault builder hasn't touched the stone yet.

When you flush or commit, you hand the tracing paper to the vault builder to chisel the changes into stone. If the vault builder hits an impossible instruction—like "place a window where a load-bearing column is already registered" (a unique key collision)—the builder drops their chisel and shouts: **"Construction halted! This entire batch is illegal."** The vault enters a lockdown state.

If the architect ignores the builder's shout, catches the error, and immediately tries to sketch another room on that exact same dirty, invalid sheet of tracing paper, the vault builder will flatly refuse to even look at it. The blueprint site is frozen.

Calling `session.rollback()` performs two distinct actions at the same time:
1. **To the Vault Builder (Database Tier):** You radio the builder to discard today's uncommitted cuts, unlock all the rooms and cranes they were holding (`RELEASE LOCKS`), and reset the vault to the last approved state.
2. **To the Tracing Paper (Python Memory Tier):** You crumple up the ruined tracing paper, throw away the failed pencil sketches, restore modified models to their previous clean state, and mark all loaded blueprints as "expired" so the next time you look at a room, you fetch the fresh, verified reality from the vault.

A **Savepoint** (`session.begin_nested()`) is like taking a Polaroid snapshot of your tracing paper before attempting an experimental sketch. If the experimental sketch causes a conflict, you don't throw away the entire day's work; you just erase back to the Polaroid snapshot and keep working on the rest of the building.

## 3. How It Actually Works — The Full Explanation

A rollback in SQLAlchemy is not just a single SQL command. It is a synchronized dual-tier reset spanning both the remote database engine over the network and the local Python memory state.

```txt
┌────────────────────────────────────────────────────────────────────────┐
│                        PYTHON MEMORY TIER                              │
│                                                                        │
│   session.rollback()                                                   │
│   ├── 1. Pending objects (session.new)    ──► Discarded (Transient)   │
│   ├── 2. Deleted objects (session.deleted)──► Restored (Persistent)   │
│   ├── 3. Dirty objects (session.dirty)    ──► Reverted to clean state │
│   └── 4. Persistent objects               ──► Expired (force SELECT)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                           Issues "ROLLBACK"
                           over DBAPI connection
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                         DATABASE TIER (PostgreSQL / MySQL)             │
│                                                                        │
│   ROLLBACK Command Executed                                            │
│   ├── 1. Discard uncommitted WAL / Redo log transaction buffers        │
│   ├── 2. Release all row-level (FOR UPDATE) and table-level locks      │
│   └── 3. Transition connection state from ABORTED back to IDLE         │
└────────────────────────────────────────────────────────────────────────┘
```

The rollback mechanism operates across these core dimensions:

**The Database Tier: Over the Wire**
When an error occurs during query execution or a flush (such as a foreign key failure or check constraint violation), the database server marks the transaction as failed. In PostgreSQL, any subsequent command sent on that connection returns `ERROR: current transaction is aborted, commands ignored until end of transaction block`. When `session.rollback()` is called, SQLAlchemy sends a literal `ROLLBACK` instruction down the active DBAPI connection (e.g., `asyncpg` or `psycopg2`). The database engine purges all uncommitted modifications from its Write-Ahead Log (WAL) and memory buffers, releases all pessimistic row locks (`SELECT ... FOR UPDATE`) and table-level locks, and returns the physical database connection to an idle, reusable state.

**The Python Memory Tier: Unit of Work Reset**
SQLAlchemy tracks every entity in one of five states: *Transient*, *Pending*, *Persistent*, *Deleted*, or *Detached*. During normal operation, the `Session` maintains identity maps, dirty lists, and pending queues. If a rollback only sent a message to the database, your Python memory would be filled with corrupted models whose in-memory attributes no longer match database reality. To prevent this, `session.rollback()` executes a complete Unit of Work reset:
- **Pending Objects (`session.new`):** Objects that were added to the session with `session.add()` but never successfully committed are removed from the session entirely. Their state changes from *Pending* back to *Transient* (untracked, no database identity).
- **Deleted Objects (`session.deleted`):** Objects marked for deletion using `session.delete()` are restored to the session's identity map in the *Persistent* state.
- **Dirty Objects (`session.dirty`):** Objects already stored in the database whose attributes were modified in Python (e.g. `user.email = "new@example.com"`) have their modified attributes reverted back to their originally loaded snapshot values.
- **Instance Expiration (`session.expire_all()`):** SQLAlchemy marks all remaining persistent instances in the session as "expired" by clearing their internal attribute dictionaries (`__dict__`). The next time your application code accesses an attribute on any of these objects (e.g., `user.username`), SQLAlchemy automatically and transparently emits a fresh SQL `SELECT` query to reload the exact, authoritative data from the database.

**The PendingRollbackError State Machine**
When an exception occurs during a database flush, the internal `SessionTransaction` object transitions into an `INACTIVE` / `ERROR` state. SQLAlchemy knows that the database server has aborted the physical transaction while the in-memory session still contains un-reset changes. If SQLAlchemy allowed you to execute another `session.execute()` or `session.add()` without rolling back, the query would either fail on the wire or create silent data corruption. SQLAlchemy intentionally poisons the session. Until you explicitly acknowledge the failure by calling `session.rollback()` (or exiting a context manager block), the session refuses all operations and raises `PendingRollbackError`.

**Partial Rollbacks with Savepoints (`session.begin_nested()`)**
Relational databases do not support truly nested physical transactions. However, they do support **Savepoints**. A savepoint establishes a named marker inside an active transaction. In SQLAlchemy, you create a savepoint using `session.begin_nested()`. On the wire, SQLAlchemy issues `SAVEPOINT sa_savepoint_1`. If an exception occurs inside the `begin_nested()` block, calling `savepoint.rollback()` issues `ROLLBACK TO SAVEPOINT sa_savepoint_1` and resets only the in-memory state modified since the savepoint was created. The outer parent transaction remains healthy and active, allowing you to catch errors, execute recovery logic, and commit the overarching transaction cleanly.

**Automatic Exception Boundaries**
In modern production code (SQLAlchemy 2.0+ and FastAPI), manual `try / except / session.rollback()` blocks are replaced by context manager boundaries: `with session.begin():` or `async with session.begin():`. A transaction context manager guarantees two invariants: if the block finishes without an exception, it automatically calls `session.commit()`; if any exception escapes the block, it automatically calls `session.rollback()` before propagating the exception up the call stack.

## 4. Real Code — See It Working

**1. Reproducing the Bug: The Poisoned Session and `PendingRollbackError`**

This example demonstrates what happens when an `IntegrityError` is caught in Python but the session is not rolled back.

```python
from sqlalchemy import create_engine, String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session
from sqlalchemy.exc import IntegrityError, PendingRollbackError

class Base(DeclarativeBase):
    pass

class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(100), unique=True)

engine = create_engine("sqlite:///:memory:", echo=False)
Base.metadata.create_all(engine)

# Seed an initial account
with Session(engine) as session:
    session.add(Account(email="dev@example.com"))
    session.commit()

# BUGGY ENDPOINT SIMULATION
session = Session(engine)
try:
    # Attempt to insert a duplicate email
    session.add(Account(email="dev@example.com"))
    session.flush()  # Forces SQL execution, triggers unique constraint failure
except IntegrityError:
    print("Caught IntegrityError! Trying to continue without session.rollback()...")
    
    # Attempting to run another query on the poisoned session
    try:
        stmt = select(Account).where(Account.email == "dev@example.com")
        existing_user = session.scalar(stmt)
    except PendingRollbackError as e:
        print("\n💥 CRASH: SQLAlchemy refused the query:")
        print(f"Error Type: {type(e).__name__}")
        print("Reason: The transaction failed, but session.rollback() was never called.")
finally:
    session.close()
```

**2. The Canonical Manual Pattern: `try / except / finally`**

When managing transactions manually without a high-level context manager, always roll back on error and close the session in a `finally` block.

```python
from sqlalchemy import create_engine, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session
from sqlalchemy.exc import SQLAlchemyError

class Base(DeclarativeBase):
    pass

class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(50), unique=True)
    amount: Mapped[int]

engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)

session = Session(engine)
try:
    payment = Payment(reference="PAY-1001", amount=5000)
    session.add(payment)
    session.flush()

    # If everything succeeded, commit the transaction to disk
    session.commit()
    print("Payment successfully committed.")

except SQLAlchemyError as exc:
    # 1. Rollback on database wire (releases locks, drops WAL buffer)
    # 2. Rollback in Python memory (discards pending payment, resets session)
    session.rollback()
    print(f"Transaction aborted and rolled back due to error: {exc}")
    raise

finally:
    # Return the DBAPI connection back to the connection pool
    session.close()
```

**3. Context Manager Error Boundaries (`session.begin()`)**

The cleanest, most idiomatic way to manage transactions in SQLAlchemy 2.0.

```python
from sqlalchemy import create_engine, String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session

class Base(DeclarativeBase):
    pass

class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(30), unique=True)
    stock: Mapped[int]

engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)

# session.begin() opens a transaction boundary.
# On normal exit -> issues session.commit()
# On unhandled exception -> issues session.rollback() and re-raises
try:
    with Session(engine) as session:
        with session.begin():
            item = Product(sku="KEYBOARD-01", stock=10)
            session.add(item)
            # No explicit session.commit() needed!
            # If an error happens here, session.rollback() runs automatically.
except Exception as e:
    print(f"Handled error at top level: {e}")

# Verify item was committed
with Session(engine) as session:
    saved = session.scalar(select(Product).where(Product.sku == "KEYBOARD-01"))
    print(f"Verified product in DB: {saved.sku}, Stock: {saved.stock}")
```

**4. Nested Savepoints: Recovering from Partial Failures (`begin_nested()`)**

Use savepoints when an individual operation might fail (e.g., unique slug collision), but you want to catch the error, recover, and still commit the surrounding outer transaction.

```python
from sqlalchemy import create_engine, String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session
from sqlalchemy.exc import IntegrityError

class Base(DeclarativeBase):
    pass

class Article(Base):
    __tablename__ = "articles"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(100), unique=True)

engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)

with Session(engine) as session:
    # Outer master transaction begins
    with session.begin():
        # Pre-seed an article with slug "python-tips"
        session.add(Article(title="First Post", slug="python-tips"))
        session.flush()

        # Now we want to insert a second article with the preferred slug "python-tips"
        # If it collides, we want to fallback to "python-tips-v2" WITHOUT aborting the whole transaction.
        preferred_slug = "python-tips"
        fallback_slug = "python-tips-v2"

        # 1. Establish a Savepoint on the database wire: SAVEPOINT sa_savepoint_1
        savepoint = session.begin_nested()
        try:
            colliding_article = Article(title="Second Post", slug=preferred_slug)
            session.add(colliding_article)
            session.flush()  # This will trigger an IntegrityError
            savepoint.commit()
        except IntegrityError:
            # 2. Issues: ROLLBACK TO SAVEPOINT sa_savepoint_1
            # Resets only the colliding_article in memory without breaking the outer transaction!
            savepoint.rollback()
            print(f"Slug '{preferred_slug}' collided! Recovering with '{fallback_slug}'...")

            # 3. Insert with fallback slug in the healthy outer transaction
            safe_article = Article(title="Second Post", slug=fallback_slug)
            session.add(safe_article)

    # Outer transaction commits both the first article and the recovered second article

# Verify both articles exist in database
with Session(engine) as session:
    articles = session.scalars(select(Article)).all()
    for art in articles:
        print(f"Stored Article ID: {art.id} | Slug: {art.slug}")
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What happens internally in Python memory versus on the database wire when `session.rollback()` is called?**

On the database wire, SQLAlchemy transmits a raw `ROLLBACK` SQL command down the DBAPI connection. The database server drops all uncommitted writes from its Write-Ahead Log (WAL) or redo log buffers, releases all held table and row locks (such as `FOR UPDATE` pessimistic locks), and marks the connection as clean and idle.

In Python memory, SQLAlchemy resets the Unit of Work. It discards newly added objects (`session.new`) by reverting them to the transient state, restores deleted objects (`session.deleted`) back into the session, reverts modified attributes on dirty objects (`session.dirty`) to their clean snapshot values, and calls `expire_all()`. Expiring all persistent instances empties their attribute dictionaries so that any future access automatically triggers a fresh SQL `SELECT` query, ensuring your application code never operates on stale or phantom data from the aborted transaction.

**Q: Why does SQLAlchemy raise `PendingRollbackError`, and what is the exact lifecycle state of the session when it occurs?**

`PendingRollbackError` is raised when you attempt to execute a query or modify data on a session whose underlying transaction previously encountered an exception during flush or execution, but was never explicitly rolled back. 

When a database error occurs, SQLAlchemy transitions the internal `SessionTransaction` into an `INACTIVE` or `ERROR` state. The database engine has already aborted the transaction on the wire. If SQLAlchemy allowed subsequent queries to proceed, the database would reject them, or Python would read inconsistent in-memory objects. SQLAlchemy deliberately "poisons" the session until `session.rollback()` is called or the transaction context manager exits, protecting the application from silent state corruption.

**Q: How do Savepoints work in SQLAlchemy, and how does `session.begin_nested()` differ from `session.begin()`?**

Relational databases do not support nested physical transactions on a single connection. Calling `session.begin()` when a transaction is already active will raise an `InvalidRequestError`. 

`session.begin_nested()` uses database **Savepoints** (`SAVEPOINT <name>` in SQL). It creates a logical checkpoint within the existing outer transaction. If an error occurs inside a nested block, calling `rollback()` on that nested transaction emits `ROLLBACK TO SAVEPOINT <name>` on the database wire and resets only the in-memory state modified since the savepoint was created. The outer parent transaction remains fully functional and un-aborted, allowing you to catch errors, implement fallback logic, and commit the rest of your operations.

**Q: What is instance expiration on rollback, and why can it cause a `DetachedInstanceError` if not handled properly?**

When `session.rollback()` runs, SQLAlchemy marks all persistent instances as expired by removing their loaded column values from their internal state dictionary. This ensures that any subsequent property read (like `user.email`) will emit a new SQL query to fetch the latest committed database values.

However, if you close the session (`session.close()`) immediately after a rollback and then attempt to access an attribute on that object (for example, in a template or API response serializer), SQLAlchemy attempts to emit a lazy-loading `SELECT` query. Because the session is closed and detached from any database connection, it cannot emit the query and crashes with `sqlalchemy.orm.exc.DetachedInstanceError: Instance <User at 0x...> is not bound to a Session; attribute refresh operation cannot proceed`.

**Q: In a web framework like FastAPI, how should transaction rollback and session lifecycle be managed per request?**

In FastAPI, database sessions should be managed using an asynchronous or synchronous dependency with a generator (`yield` pattern):

```python
async def get_db():
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

Even better, if route handlers wrap their mutations in `async with session.begin():`, commits and rollbacks are handled automatically at the transaction boundary. If any unhandled exception bubbles out of the route handler, the dependency's `except` block ensures `session.rollback()` runs before the connection is returned to the pool, preventing poisoned connections from leaking across requests.

**Q: What is the difference between an error during `session.flush()` versus `session.commit()`?**

`session.flush()` communicates pending changes to the database by sending SQL `INSERT`, `UPDATE`, and `DELETE` statements, but it does *not* end the transaction. If a constraint fails during `flush()`, the database errors, but you can catch it, roll back to a savepoint (if using `begin_nested()`), or roll back the whole transaction before the commit step.

`session.commit()` first performs a `flush()` (if dirty objects exist) and then sends the SQL `COMMIT` command to finalize the transaction permanently. If `commit()` fails (e.g. during a deferred constraint check or network drop during commit), the transaction is completely dead and must be rolled back to clean up in-memory state and release connection pool locks.

## 6. The Traps — What Goes Wrong

**Trap 1: Swallowing Exceptions Without Rolling Back**

The most common production bug: catching a database exception in Python and returning a response or attempting another query without calling `session.rollback()`.

```python
# BROKEN: The session is poisoned for the rest of the request
try:
    session.add(new_user)
    session.flush()
except IntegrityError:
    # Caught the error, but forgot session.rollback()!
    log_to_database(session, "Failed signup attempt")  # 💥 Crashes with PendingRollbackError
    return {"error": "User exists"}
```

*The Fix:* Always call `session.rollback()` immediately inside the `except` block before performing any other database operation, or use `session.begin_nested()`.

**Trap 2: Accessing Expired Objects After Session Closure (`DetachedInstanceError`)**

Because rollback expires all objects in the session, their attributes become lazy-load triggers. If the session closes, those objects become detached.

```python
# BROKEN
try:
    session.add(order)
    session.commit()
except SQLAlchemyError:
    session.rollback()
finally:
    session.close()

# Later in the code:
print(order.id)  # 💥 DetachedInstanceError! Object is expired and session is closed.
```

*The Fix:* If you need object attributes after a failed or successful transaction when the session closes, access them before closing, or configure `expire_on_commit=False` on the session maker (though note that `rollback()` will still expire instances to guarantee correctness).

**Trap 3: Autoflush Re-triggering the Failed Query in an Error Handler**

By default, SQLAlchemy has `autoflush=True`. If you catch an exception, do not call `session.rollback()`, and then attempt a `session.execute(select(...))` query, SQLAlchemy's autoflush mechanism will try to flush the dirty/pending objects again before running the SELECT query, re-triggering the original failure before your new query even runs.

*The Fix:* Always roll back before running subsequent queries in error handlers, or disable autoflush temporarily using `with session.no_autoflush:`.

**Trap 4: Assuming `session.rollback()` Resets External Python Side Effects**

`session.rollback()` only resets database state and SQLAlchemy-tracked models. It cannot undo external Python actions, in-memory caches, or network calls made during the transaction.

```python
# DANGEROUS PATTERN
try:
    user.credits -= 50
    send_stripe_charge(user.stripe_id, amount=50) # External API call!
    session.add(user)
    session.commit()
except Exception:
    session.rollback()
    # Stripe charged the customer $50, but the database rolled back the credits deduction!
```

*The Fix:* Perform external, non-transactional side effects (Stripe charges, email dispatches, message queue pushes) *after* the database transaction has successfully committed, or use an Outbox pattern.

**Trap 5: Attempting to Nest `session.begin()` Instead of `session.begin_nested()`**

Developers often assume calling `with session.begin():` inside an existing `with session.begin():` block creates a sub-transaction. It does not. SQLAlchemy will raise an `InvalidRequestError: A transaction is already begun on this Session.`

*The Fix:* For sub-transaction checkpoints and partial rollbacks, use `session.begin_nested()` (savepoints), never nested `session.begin()`.

## 7. Compare With Related Concepts

**`session.rollback()` vs `session.close()`**
- `session.rollback()` terminates the current transaction, issues `ROLLBACK` on the wire to release locks and discard uncommitted writes, and resets in-memory objects (`session.new`, `session.dirty`) while keeping the session open and bound to its connection or engine for future queries.
- `session.close()` completely tears down the session's resources, expunges all objects, and returns the physical DBAPI connection back to the connection pool. A `close()` will implicitly trigger a rollback if an uncommitted transaction was still open, but you should not rely on `close()` for explicit transaction boundary logic.
- *Rule of thumb:* Call `rollback()` to recover from errors inside an active workflow; call `close()` when you are completely finished with the session at the end of a request.

**`session.rollback()` vs `session.begin_nested()` (Savepoint Rollback)**
- `session.rollback()` aborts the entire top-level transaction. All operations performed since the beginning of the transaction are wiped out.
- `savepoint.rollback()` (via `session.begin_nested()`) issues `ROLLBACK TO SAVEPOINT` and resets only the in-memory changes made since the savepoint was created. The parent transaction remains active and healthy.
- *Rule of thumb:* Use `session.rollback()` when a fatal error occurs and the entire request must abort; use `session.begin_nested()` when a specific operation might fail and you have a fallback strategy.

**`session.rollback()` vs `session.expire_all()`**
- `session.expire_all()` only marks in-memory instances as expired, forcing subsequent attribute reads to emit SELECT queries. It does *not* send a `ROLLBACK` command to the database, does not release database locks, and does not discard pending inserts in `session.new`.
- `session.rollback()` sends the `ROLLBACK` command to the database, releases database locks, discards pending inserts, reverts dirty modifications, *and* automatically calls `expire_all()`.
- *Rule of thumb:* Use `session.rollback()` to recover from transaction failures; use `session.expire_all()` only when you know external processes modified database rows and you want to force fresh reads within a valid, running transaction.

**Database-Level `ROLLBACK` vs ORM `session.rollback()`**
- Database-Level `ROLLBACK` (SQL command) only resets the server-side transaction buffer and locks in PostgreSQL/MySQL. The database knows nothing about Python objects.
- SQLAlchemy `session.rollback()` is the orchestrator: it issues the database `ROLLBACK` SQL command over the wire *and* synchronizes the local Python Unit of Work (clearing `session.new`, reverting `session.dirty`, and expiring loaded instances).
- *Rule of thumb:* Never issue raw `session.execute(text("ROLLBACK"))`; always call `session.rollback()` so SQLAlchemy can clean up its in-memory state.

## 8. 🧠 The Memory Hook

A database rollback drops the server's uncommitted logs and releases locks, but SQLAlchemy's `session.rollback()` does double-duty: it sends the `ROLLBACK` signal down the wire **and** scrubs Python's in-memory scratchpad clean—discarding pending objects, restoring dirty fields, and expiring loaded state so your session isn't poisoned by the ghosts of failed queries.

