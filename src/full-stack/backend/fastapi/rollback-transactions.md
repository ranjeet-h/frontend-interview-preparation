# Rollback and Transaction Safety in FastAPI: Atomic Blocks, Savepoints, and Exception Boundaries

## 1. Why This Exists — The Problem First

Picture an e-commerce checkout route in your FastAPI backend. A customer clicks "Place Order" on a $500 purchase. Your code starts executing: it queries the customer's wallet balance, subtracts $500, creates an invoice record, and then attempts to insert three line items into the `order_items` table. On the third item, the database rejects the insert because the SKU violates a foreign key constraint or exceeds inventory limits. 

If your database session is running without an explicit, atomic transaction boundary, or if you catch the exception at the endpoint level and return an error without rolling back, the wallet debit and invoice record remain written to disk. The customer lost $500, but no order exists in the system. The next morning, customer support is flooded with tickets, accounting reports phantom revenue, and your database state is permanently out of sync.

In production distributed systems, partial writes are fatal. You cannot leave a database in a half-finished state when a Python runtime error, database constraint violation, or network timeout occurs midway through a business operation. Rollback mechanisms and transaction boundaries exist to guarantee absolute atomicity: either every single state change across the entire operation succeeds and commits, or every pending mutation is completely wiped clean, leaving the database exactly as if the request never happened.

## 2. The Analogy — Make It Obvious

Think of an atomic database transaction like a bank teller executing a wire transfer with an erasable carbon ledger.

When you step up to the teller window, the teller opens a fresh transaction slip (the `BEGIN` command). They write down the first step: "Debit Account A by $500." Next, they write: "Credit Account B by $500." Next: "Record $5 transaction fee." None of these changes are permanent yet; they are written in erasable ink on the staging slip.

If the teller's pen runs out of ink, the counter system crashes, or they discover Account B is frozen before finishing, the teller does not stamp and file the half-filled slip. Instead, they crumple the entire paper and toss it into the shredder (the `ROLLBACK` command). Account A never loses money, the fee is never billed, and the ledger remains untouched. Only when every single line item is verified does the teller stamp the slip with an indelible wax seal (the `COMMIT` command), making the ledger changes permanent and visible to the rest of the world.

A **Savepoint** is like bookmarking your progress with a pencil tick on that ledger slip. Suppose the bank wants to offer you an optional branded promotional voucher during the transfer. The teller marks a pencil checkpoint (the `SAVEPOINT`). They try to generate the voucher. If the voucher printer jams, the teller erases only the pencil mark back to the checkpoint (rolling back to the savepoint). The main wire transfer of $500 from Account A to Account B remains intact on the slip and proceeds to final stamping without canceling your entire bank visit.

## 3. How It Actually Works — The Full Explanation

Database transactions follow the ACID model, where Atomicity dictates that a series of database operations either execute as a single indivisible unit or do nothing at all. At the database protocol level (such as PostgreSQL or MySQL), this is governed by sending SQL control commands over the active connection: `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT <name>`, and `ROLLBACK TO SAVEPOINT <name>`.

In modern asynchronous FastAPI applications using SQLAlchemy 2.0 and `asyncpg`, managing these transactions requires understanding the difference between the **Session lifecycle** and the **Transaction lifecycle**.

An `AsyncSession` is an in-memory workspace and Unit of Work. It tracks changes to Python model instances, maintains an Identity Map (ensuring one Python object per database row), and flushes SQL statements to the database socket when queried. However, the session itself is not the transaction. When an `AsyncSession` communicates with the database, it checks out a physical connection from the connection pool and starts a transaction boundary.

SQLAlchemy 2.0 provides the `async with session.begin():` context manager to define an explicit transaction boundary. When Python enters this context block, SQLAlchemy ensures a transaction is active by emitting `BEGIN` on the underlying database connection. As you execute ORM queries, inserts, and updates within the block, SQLAlchemy flushes SQL statements to the server. If the block finishes without any unhandled exceptions, the context manager automatically calls `await session.commit()`, sending `COMMIT` to the database and making the writes durable.

If any exception occurs inside the block—whether a database `IntegrityError`, a Python `ZeroDivisionError`, a custom domain `InsufficientFundsException`, or a raised FastAPI `HTTPException`—the context manager intercepts the exception before it escapes. It immediately executes `await session.rollback()`, sending `ROLLBACK` over the connection to discard all uncommitted changes on the server, clears the session's internal pending state, and then re-raises the original exception so your outer error handlers or FastAPI exception middleware can convert it into an appropriate HTTP response.

Savepoints allow granular failure recovery without throwing away prior valid operations. When you use `async with session.begin_nested():` inside an existing transaction, SQLAlchemy emits `SAVEPOINT <savepoint_name>` to the database. If an exception occurs inside that nested block and you catch it outside the nested context, SQLAlchemy rolls back only the operations executed since that savepoint was created by sending `ROLLBACK TO SAVEPOINT <savepoint_name>`. The outer transaction remains active, healthy, and eligible to commit its own prior operations.

Architecturally, senior engineers face a critical decision: where should the transaction boundary live in a FastAPI codebase?

1. **Middleware Level:** Opening a transaction in an ASGI middleware for every incoming HTTP request is an anti-pattern. If a route performs slow external network calls (such as calling Stripe, OpenAI, or sending an email) or streams a large response back to the client, the database connection and open transaction remain locked for seconds, exhausting the connection pool. Furthermore, non-database exceptions during response serialization can trigger unexpected rollbacks.
2. **Dependency Level (`get_db` with `yield`):** Providing an `AsyncSession` via FastAPI's `Depends(get_db)` using a generator is standard for managing session allocation and cleanup (`session.close()`). While you can commit inside the dependency after `yield`, doing so binds transaction boundaries to HTTP request completion rather than business logic boundaries.
3. **Service Layer Level (Recommended):** The cleanest design isolates transaction boundaries inside dedicated service methods or use cases using `async with session.begin():`. The service layer controls the exact sequence of database mutations, keeping external HTTP calls outside the atomic block and ensuring that transactions are held open only for the few milliseconds needed to execute database queries.

## 4. Real Code — See It Working

Here is a production-ready implementation of an atomic checkout flow in FastAPI using SQLAlchemy 2.0 async sessions, illustrating atomic transaction blocks, savepoints for non-critical operations, and clean exception handling.

```python
# database.py
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Integer, ForeignKey, select

DATABASE_URL = "postgresql+asyncpg://app_user:secret@localhost:5432/store_db"

engine = create_async_engine(DATABASE_URL, pool_size=20, max_overflow=10)
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Prevent expired attributes after commit
    autoflush=False,
)

class Base(DeclarativeBase):
    pass

class UserWallet(Base):
    __tablename__ = "user_wallets"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    balance_cents: Mapped[int] = mapped_column(Integer, nullable=False)

class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    stock: Mapped[int] = mapped_column(Integer, nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)

class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    has_bonus_gift: Mapped[bool] = mapped_column(default=False)

# FastAPI session dependency: handles session lifecycle ONLY, not the transaction boundary
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()
```

Now, we implement the service layer where atomic transaction boundaries and savepoints protect database integrity:

```python
# service.py
import logging
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from database import UserWallet, Product, Order

logger = logging.getLogger("store.checkout")

class InsufficientBalanceError(Exception):
    pass

class OutOfStockError(Exception):
    pass

class CheckoutService:
    @staticmethod
    async def process_checkout(
        session: AsyncSession,
        user_id: int,
        product_id: int,
        apply_promo_gift: bool,
    ) -> Order:
        # Atomic Transaction Boundary: commits on success, automatically rolls back on ANY exception
        async with session.begin():
            # Step 1: Lock and fetch wallet (SELECT ... FOR UPDATE prevents race conditions)
            wallet_stmt = (
                select(UserWallet)
                .where(UserWallet.user_id == user_id)
                .with_for_update()
            )
            wallet_res = await session.execute(wallet_stmt)
            wallet = wallet_res.scalar_one_or_none()

            # Step 2: Lock and fetch product inventory
            prod_stmt = (
                select(Product)
                .where(Product.id == product_id)
                .with_for_update()
            )
            prod_res = await session.execute(prod_stmt)
            product = prod_res.scalar_one_or_none()

            if not product or product.stock < 1:
                # Raising here exits session.begin(), triggering an immediate ROLLBACK
                raise OutOfStockError("Selected product is out of stock.")

            if not wallet or wallet.balance_cents < product.price_cents:
                # Raising here ensures zero mutations are persisted
                raise InsufficientBalanceError("Insufficient wallet balance.")

            # Step 3: Perform primary mutations
            wallet.balance_cents -= product.price_cents
            product.stock -= 1

            new_order = Order(
                user_id=user_id,
                total_cents=product.price_cents,
                has_bonus_gift=False,
            )
            session.add(new_order)
            await session.flush()  # Assigns primary key to new_order.id without committing

            # Step 4: Optional Savepoint for non-critical promotional bonus
            if apply_promo_gift:
                try:
                    # session.begin_nested() creates a SAVEPOINT
                    async with session.begin_nested():
                        promo_stmt = (
                            select(Product)
                            .where(Product.id == 9999)  # Special bonus SKU
                            .with_for_update()
                        )
                        promo_res = await session.execute(promo_stmt)
                        promo_item = promo_res.scalar_one_or_none()

                        if not promo_item or promo_item.stock < 1:
                            raise OutOfStockError("Promo gift is depleted.")

                        promo_item.stock -= 1
                        new_order.has_bonus_gift = True
                        logger.info(f"Attached bonus gift to order {new_order.id}")
                except OutOfStockError:
                    # Caught locally! SQLAlchemy rolls back ONLY to the savepoint.
                    # The main order, wallet deduction, and primary stock decrease survive.
                    logger.warning("Bonus item unavailable; proceeding with main order only.")

            # End of session.begin() block:
            # If we reach here without unhandled exceptions, SQLAlchemy sends COMMIT to database.
            return new_order
```

Finally, the FastAPI route handler remains thin, orchestrating request parsing and converting domain exceptions into clear HTTP status codes:

```python
# main.py
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db_session
from service import CheckoutService, InsufficientBalanceError, OutOfStockError

app = FastAPI(title="Atomic Checkout API")

class CheckoutRequest(BaseModel):
    user_id: int
    product_id: int
    apply_promo: bool = False

class CheckoutResponse(BaseModel):
    order_id: int
    user_id: int
    total_cents: int
    has_bonus_gift: bool

@app.post(
    "/checkout",
    response_model=CheckoutResponse,
    status_code=status.HTTP_201_CREATED,
)
async def checkout_endpoint(
    payload: CheckoutRequest,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        order = await CheckoutService.process_checkout(
            session=session,
            user_id=payload.user_id,
            product_id=payload.product_id,
            apply_promo_gift=payload.apply_promo,
        )
        return CheckoutResponse(
            order_id=order.id,
            user_id=order.user_id,
            total_cents=order.total_cents,
            has_bonus_gift=order.has_bonus_gift,
        )
    except InsufficientBalanceError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=str(exc),
        )
    except OutOfStockError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    except Exception as exc:
        # Any unexpected error was already cleanly rolled back by session.begin()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing the order.",
        )
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: When should you rollback a database transaction, and what actually happens inside the database engine during a rollback?**

You must rollback a transaction whenever any step within an atomic unit of work fails. This includes low-level database errors (unique constraint violations, foreign key errors, serialization failures, or deadlocks), business validation failures (insufficient account funds, inventory depletion), or failures when communicating with external required systems before finalization.

Internally, relational database engines like PostgreSQL use Multi-Version Concurrency Control (MVCC) and Write-Ahead Logging (WAL). When your session modifies rows during an active transaction, the database records the changes in WAL buffers and tags row versions with your transaction's unique identifier (`XID`). When a `ROLLBACK` command is issued, the database engine simply marks that `XID` as aborted in the transaction status log (`pg_xact`). The uncommitted row versions immediately become invisible to all other database connections. The engine does not have to spend time rewriting the disk back to its old state; future queries ignore the aborted `XID`, and background vacuum processes eventually clean up the dead tuples.

**Q: How does SQLAlchemy 2.0's `async with session.begin():` context manager manage automatic commit and rollback?**

The `session.begin()` context manager implements Python's asynchronous context manager protocol (`__aenter__` and `__aexit__`). When entering the block, it checks out a database connection if one isn't already active and emits `BEGIN`.

When code execution exits the context block, `__aexit__` inspects whether an exception caused the exit:
1. If no exception occurred (the exception argument is `None`), it executes `await session.commit()`. This flushes pending objects, sends `COMMIT` to the database, and closes the transaction.
2. If an unhandled exception was raised inside the block, `__aexit__` catches it, executes `await session.rollback()` to discard all pending mutations, resets the session's internal state, and re-raises the original exception so outer handlers can catch it.

This eliminates manual `try... except... session.rollback()` boilerplate and guarantees that an unhandled error can never leave a dangling, uncommitted transaction open.

**Q: What are Savepoints (`session.begin_nested()`), and when should you use them instead of rolling back the entire transaction?**

A Savepoint creates a named checkpoint inside an existing, outer database transaction by issuing the SQL command `SAVEPOINT <name>`. It allows you to attempt a speculative or non-critical operation and roll back only that specific operation if it fails, without aborting or rolling back the outer transaction.

In SQLAlchemy, you create a savepoint using `async with session.begin_nested():`. If an exception occurs inside this nested context and is caught outside of it, SQLAlchemy issues `ROLLBACK TO SAVEPOINT <name>`, restoring the session and database state to the exact moment the nested block began. The outer transaction remains active and can proceed to commit.

You should use savepoints when handling optional enhancements (such as attempting to apply a promotional credit or logging an analytics event in the database) or when recovering from recoverable database errors (such as catching a unique constraint violation when attempting an insert, and falling back to an update). You should avoid savepoints for core transactional operations where partial execution invalidates the business contract (e.g., you must never use a savepoint to keep an order if the payment debit step fails).

**Q: Where is the best place to manage transaction boundaries in a FastAPI application: Middleware, Dependency (`get_db`), or Service Layer?**

The Service Layer is the best place to manage transaction boundaries.

Managing transactions at the Middleware level holds database connections open across the entire HTTP lifecycle, including request body parsing, authentication, third-party API calls, and response serialization. This causes database connection pool starvation under load.

Managing transactions inside the FastAPI Dependency (`get_db`) using `yield` and `await session.commit()` after the yield is convenient for simple CRUD apps, but it couples your transaction boundary to the HTTP layer. If a route handler returns data but response serialization fails in FastAPI, or if you run background tasks, the commit has already happened or executes outside the expected boundary.

Placing `async with session.begin():` inside the Service Layer creates clear, explicit Units of Work. The transaction boundary opens only when database mutations begin and closes immediately when they finish, keeping external HTTP calls (such as Stripe or external webhooks) strictly outside the database transaction window.

**Q: How do you properly test rollback behavior in FastAPI integration tests?**

To test rollback behavior thoroughly, you must write integration tests that intentionally inject failures and assert that the database state was not modified.

Using `pytest-asyncio` and `httpx.AsyncClient`:
1. Seed the test database with baseline records (e.g., a user wallet with $50 and a product with 5 items in stock).
2. Trigger an endpoint call with invalid data or mock an internal service failure halfway through the request (e.g., pass a payload that causes a database constraint violation on step 2 of a 3-step checkout).
3. Verify that the endpoint returns the expected error HTTP status code (e.g., 409 Conflict or 422 Unprocessable Entity).
4. Query the test database directly in the test function using a fresh session to assert that no rows were added to the `orders` table, the wallet balance remains exactly $50, and the product stock remains 5.

Testing both the HTTP error status and direct database state proves that no orphaned or partial records survived the failure.

**Q: What happens if an exception occurs during the rollback itself, or if the database connection drops mid-transaction?**

If the physical network connection drops while a transaction is active, the database server's socket detects a disconnect (or times out via TCP keepalives). The database server automatically aborts the transaction and rolls back all uncommitted changes on the server side. On the FastAPI side, SQLAlchemy detects the broken connection, invalidates that connection in the pool, and raises an `OperationalError` or `InterfaceError`.

If an explicit `await session.rollback()` fails (for example, if the database host dies at the exact moment rollback is called), the `AsyncSession` marks itself as closed or invalid. You must never attempt to reuse a session that experienced a connection or rollback error; the session should be closed and garbage-collected, and subsequent requests must obtain a fresh session from the session factory.

**Q: Why is it dangerous to make third-party HTTP API calls (like Stripe, SendGrid, or AWS S3) inside a database transaction block?**

Making external network requests inside an active database transaction creates three critical production risks:

1. **Connection Pool Exhaustion:** Database transactions hold a dedicated connection from your pool. If an external API call takes 2 seconds due to network latency, your database connection is tied up doing zero database work for 2 full seconds. Under modest concurrency, your pool exhausts and incoming requests queue up and time out.
2. **Extended Row Locks and Deadlocks:** If your transaction performed updates (such as `SELECT ... FOR UPDATE` or updating stock), those database rows remain locked until `COMMIT` or `ROLLBACK`. Holding row locks while waiting for an external HTTP response blocks all other concurrent transactions trying to touch those rows.
3. **Dual-Write Inconsistency:** You cannot roll back an external HTTP request with a database rollback. If your code calls Stripe's charge API inside a transaction, and the subsequent SQL insert fails, your database transaction rolls back, but Stripe already charged the customer's credit card. Always place external HTTP calls outside database transaction blocks, using patterns like the Outbox Pattern or idempotency keys to coordinate state across external boundaries.

## 6. The Traps — What Goes Wrong

### Trap 1: Swallowing Exceptions Inside `session.begin()`
* **The Wrong Assumption:** A developer writes a `try...except` block directly inside `async with session.begin():` to catch a constraint violation or business error and return a custom message, but forgets to re-raise the exception.
* **Why It Fails:** The `session.begin()` context manager determines whether to commit or roll back based on whether an exception escapes the block. If you catch and swallow the exception, the context manager assumes the block finished successfully and sends `COMMIT` to the database, persisting whatever half-finished mutations occurred before the error.
* **The Fix:** If you catch an exception inside `session.begin()`, you must either re-raise it or handle partial rollbacks using `session.begin_nested()`.

```python
# BROKEN: Swallowing exception causes accidental commit of partial state
async with session.begin():
    wallet.balance_cents -= 500
    try:
        # Suppose this fails with a unique constraint error
        await session.execute(insert_order_item_stmt)
    except Exception as e:
        logger.error("Failed item insert, but moving on...")
        # BUG: Exception swallowed! session.begin() will COMMIT the wallet deduction!

# FIXED: Use savepoints if partial failure is allowed, or re-raise
async with session.begin():
    wallet.balance_cents -= 500
    async with session.begin_nested():  # Savepoint protects the inner operation
        try:
            await session.execute(insert_order_item_stmt)
        except Exception:
            logger.warning("Item failed; rolling back only to savepoint.")
```

### Trap 2: Reusing a Poisoned `AsyncSession` After a Rollback
* **The Wrong Assumption:** After catching an exception from a failed query, the developer immediately tries to execute a new query using the exact same session instance without rolling back or resetting the session state.
* **Why It Fails:** Once a database error (like a syntax error or constraint violation) occurs on a PostgreSQL connection, PostgreSQL places the entire transaction into an error state (`current transaction is aborted, commands ignored until end of transaction block`). Any subsequent SQL command sent on that connection fails immediately with this error until an explicit `ROLLBACK` is issued.
* **The Fix:** Always ensure a failed transaction is rolled back before attempting any recovery queries, or discard the session and request a fresh one from the session factory.

### Trap 3: Putting External Network I/O Inside the Transaction Block
* **The Wrong Assumption:** Placing payment gateway calls, email dispatch, or file uploads inside `async with session.begin():` so everything happens "in one function."
* **Why It Fails:** If the external API times out after 10 seconds, the database connection is held hostage, database row locks are retained, and other requests stall. If the external call succeeds but a subsequent SQL query fails, the database rolls back while the external side effect remains executed.
* **The Fix:** Execute external calls before or after the database transaction block. Use the Transactional Outbox pattern if an external event must be guaranteed alongside database writes.

### Trap 4: Auto-Committing in the Dependency While Raising `HTTPException` in Route Handlers
* **The Wrong Assumption:** Relying on `await session.commit()` placed after `yield` inside a `get_db` dependency without proper exception boundaries.
* **Why It Fails:** In some versions and custom setups of FastAPI, raising an `HTTPException` inside a route handler is caught by FastAPI's exception handlers before the dependency's `finally` block runs. If the dependency blindly calls `await session.commit()` in its exit block without checking for exceptions, an error route might accidentally commit dirty state.
* **The Fix:** Use explicit `async with session.begin():` blocks in the service layer where the scope of the transaction is strictly bound to the business operation.

## 7. Compare With Related Concepts

| Concept | Scope & Mechanism | Best Used For | Key Trade-off / Rule |
| :--- | :--- | :--- | :--- |
| **Atomic Transaction (`session.begin`)** | Single database connection boundary. Issues `BEGIN` and `COMMIT`/`ROLLBACK`. | Core multi-step mutations where all operations must succeed or all fail together. | Hold for milliseconds only. Never include external HTTP calls or heavy CPU work inside. |
| **Savepoint (`session.begin_nested`)** | Nested checkpoint inside an active transaction (`SAVEPOINT` / `ROLLBACK TO SAVEPOINT`). | Speculative, optional, or recoverable operations within a larger transaction. | Slower than memory checks; rolled back completely if the outer transaction aborts. |
| **Compensating Transaction (Saga Pattern)** | Application-level reversal across multiple independent services/databases. | Distributed systems and microservices where a single ACID database transaction is impossible. | Eventual consistency only; complex rollback logic must be coded manually for every step. |
| **Unit of Work (`AsyncSession`)** | In-memory tracking of objects, identity map, and pending state changes. | Managing Python object lifecycles and staging SQL flushes during a request. | The session is the workspace; the transaction is the lock and database boundary. |
| **Transactional Outbox Pattern** | Saving an event to a database table within the same transaction as business data. | Reliable event publishing to message brokers (Kafka/RabbitMQ) without dual-write bugs. | Requires a separate background worker or polling process to relay messages to the broker. |

## 8. 🧠 The Memory Hook

An atomic transaction is a sealed envelope: every letter goes in together, or the whole envelope is shredded before posting. If you need to try inserting an optional coupon without risking the envelope, make a pencil savepoint; but never hold the envelope open while waiting for the mail carrier to drive across town.
