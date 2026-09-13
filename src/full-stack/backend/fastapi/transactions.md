# Database Transactions in FastAPI: Unit of Work, Isolation Levels, and Distributed Sagas

## 1. Why This Exists — The Problem First

Imagine your e-commerce application is running a high-demand flash sale for a flagship smartphone with only 10 units left in stock. A customer clicks "Buy Now". Your FastAPI backend executes three sequential steps:

1. Creates an `orders` record with status `PENDING`.
2. Deducts 1 item from `inventory` (`stock = stock - 1`).
3. Generates an `invoices` ledger row and bills the customer.

Suppose your developers placed a separate database query and `await session.commit()` inside each repository method. Steps 1 and 2 execute and commit to PostgreSQL. But during step 3, a unique constraint error or invalid tax rate code crashes the invoice generation with an unhandled exception. 

FastAPI returns an HTTP 500 error to the customer. To the buyer, the order failed. But in your database, the order record exists, and the warehouse inventory count was permanently decremented from 10 to 9. The inventory is now locked away from real buyers, the financial records are completely desynchronized from the warehouse, and the database state is corrupt.

Even worse, imagine two customers click "Buy Now" at the exact same millisecond for the very last item (`stock = 1`). Both concurrent web requests query the database, both see `stock == 1`, both proceed to deduct 1, and both write back `stock = 0`. You just sold 2 items when you only had 1 in the warehouse.

Without strict transaction boundaries, atomic execution, and proper concurrency control, high-throughput web APIs will inevitably corrupt business data, create phantom inventory, and cause financial leakage. Database transactions exist to guarantee that multi-step state mutations execute as a single, atomic, perfectly isolated unit—or leave the database completely untouched.

## 2. The Analogy — Make It Obvious

Think of a database transaction as a **Real Estate Escrow Closing**.

When you buy a house, you do not hand a briefcase full of $500,000 cash to the seller on the sidewalk and pray they hand you the house keys and sign the deed over at the county clerk's office later that afternoon. If they take the money and speed away in their car, you have no house, no money, and no legal protection.

Instead, all parties use an **Escrow Officer**:

- You deposit the purchase money into an escrow account.
- The seller deposits the signed deed transfer.
- The title company deposits the title clearance guarantee.
- The mortgage lender deposits the loan disbursement.

The escrow officer places all four items into a secure, pending vault. Nothing is official yet. The seller does not have your cash, and you do not legally own the house.

If every document is verified and all funds clear, the escrow officer executes the **Commit**: simultaneously, the deed is filed with the county, the funds are wired to the seller, and the keys are placed in your hand. Everything changes state at the exact same instant.

If the lender's loan falls through at the final minute, the escrow officer executes a **Rollback**: the seller gets their deed back, the buyer gets their deposit back, and the property returns to the exact state it was in before anyone signed a contract. Nobody loses half an asset.

In web architecture:
- The **Escrow Officer** is your **Database Transaction / Unit of Work**.
- The **Pending Documents and Funds** are your **Uncommitted SQL Statements** staged in the database engine's transaction buffer.
- The **Simultaneous Closing** is the database **COMMIT**.
- The **Canceled Deal** is the database **ROLLBACK**.
- **Locking the House from other buyers during closing** is your database **Row Lock (`SELECT ... FOR UPDATE`)**.

## 3. How It Actually Works — The Full Explanation

A database transaction is an engine-level mechanism that wraps one or more SQL operations into an indivisible execution block governed by ACID guarantees.

**The Four Pillars of ACID in Web APIs**

- **Atomicity (All-or-Nothing):** Every SQL query inside the transaction block must succeed for any change to persist. The database engine maintains an internal Write-Ahead Log (WAL) and Undo Log. When an error occurs or the client issues a `ROLLBACK`, the engine uses the undo log to revert all modified data pages back to their initial state.
- **Consistency (Valid State Invariants):** A transaction can only transition the database from one valid state to another valid state. All foreign key constraints, unique indexes, check constraints (e.g., `CHECK (stock >= 0)`), and schema rules are strictly validated before the transaction is allowed to commit.
- **Isolation (Concurrency Control):** Determines how and when changes made by one transaction become visible to other concurrent transactions. Databases use Multi-Version Concurrency Control (MVCC) and locks so that multiple clients can read and write simultaneously without corrupting shared data.
- **Durability (Fault-Tolerant Persistence):** Once a transaction commits, its modifications are permanently recorded on non-volatile storage (via `fsync` writes to the WAL). Even if the physical server loses power one millisecond later, the committed state will be fully recovered on reboot.

**The Unit of Work (UoW) Pattern in FastAPI**

In a layered FastAPI architecture, business logic is split across repositories (e.g., `OrderRepository`, `InventoryRepository`, `PaymentRepository`). If each repository receives a separate database session or executes its own `session.commit()`, you have completely broken atomicity. 

The Unit of Work pattern maintains a single database session across multiple repositories for the duration of a business use case. It acts as the transaction coordinator. When a FastAPI route calls a service layer, the Unit of Work manages the lifecycle:

1. Opens a new database transaction.
2. Passes the single transaction session to all participating repositories.
3. If the entire business operation completes without error, calls `await session.commit()`.
4. If any repository raises an exception, the context manager catches it, immediately triggers `await session.rollback()`, and lets the error bubble up to FastAPI's exception handlers.

**Database Isolation Levels & Concurrency Phenomena**

When thousands of requests hit FastAPI concurrently, transactions run side-by-side. The SQL standard defines four transaction isolation levels based on which concurrency anomalies they prevent:

- **Dirty Read:** Transaction A modifies a row but has not committed yet. Transaction B reads the modified row. Transaction A rolls back. Transaction B acted on data that never officially existed.
- **Non-Repeatable Read (Fuzzy Read):** Transaction A reads a row. Transaction B updates that same row and commits. Transaction A reads the row again and sees different column values.
- **Phantom Read:** Transaction A queries a range of rows matching a condition (e.g., `WHERE status = 'PENDING'`). Transaction B inserts a new row that matches that condition and commits. Transaction A re-runs the query and finds a new "phantom" row.
- **Serialization Anomaly (Write Skew):** Two concurrent transactions read overlapping datasets, make decisions based on what they read, and perform writes that are individually valid but together violate a global business invariant.

Here is how the four standard SQL isolation levels handle these phenomena:

- **Read Uncommitted:** Allows dirty reads, non-repeatable reads, and phantom reads. Writers don't block readers, and transactions can see uncommitted memory buffers. Almost never used in production.
- **Read Committed (PostgreSQL Default):** Each query inside a transaction sees a snapshot of committed data taken at the start of that specific query. Prevents dirty reads. However, two consecutive `SELECT` statements in the same transaction can return different data if another transaction committed changes in between.
- **Repeatable Read (MySQL InnoDB Default):** The database takes a transaction-level snapshot at the moment the first read query executes. Every subsequent read within that transaction sees the exact same point-in-time snapshot, regardless of what other transactions commit. In PostgreSQL and MySQL InnoDB, MVCC and next-key locks prevent dirty reads, non-repeatable reads, and phantom reads.
- **Serializable:** The highest isolation level. The engine guarantees that concurrent transactions produce the exact same outcome as if they were executed serially (one strictly after another). It uses Serializable Snapshot Isolation (SSI) or Strict Two-Phase Locking (S2PL). If a conflict or overlapping write is detected, the database engine aborts the conflicting transaction with a serialization failure (`SQLSTATE 40001`), requiring the web application to catch the error and retry.

**Locking Strategies: Pessimistic vs Optimistic Locking**

When multiple requests attempt to update the same row (like stock inventory or account balance), you must choose how to prevent lost updates:

- **Pessimistic Locking (`SELECT ... FOR UPDATE`):**
  The application assumes conflict will happen. When querying the record, it issues a `SELECT ... FOR UPDATE`. The database engine places an exclusive row-level lock on that record. Any other concurrent transaction attempting to read that row with `FOR UPDATE` or write to it is put to sleep, waiting in a queue until the first transaction executes `COMMIT` or `ROLLBACK`.
  - *Best for:* High-contention, low-latency financial balances, ticket reservations, and limited inventory drops.
  - *Trade-off:* Lower concurrency throughput and potential deadlocks if locks are acquired in different orders across endpoints.

- **Optimistic Locking (Version / Timestamp Columns):**
  The application assumes conflicts are rare. It reads the record without taking any database locks, noting the row's `version` number (e.g., `version = 4`). When writing changes, it executes an atomic conditional update:
  `UPDATE products SET stock = stock - 1, version = version + 1 WHERE id = :id AND version = 4;`
  The database updates the row only if the version still matches. If another request updated the row first, the version in the database is now 5. The query updates 0 rows (`rowcount == 0`). The application detects this, rolls back, and either returns an HTTP 409 Conflict or transparently retries the entire operation.
  - *Best for:* Low-contention systems, user profile edits, collaborative document editing, and long-running workflows where holding a database lock would exhaust the connection pool.

**Distributed Transactions: Two-Phase Commit (2PC) vs Distributed Sagas**

When your system scales into microservices where the Order Service, Inventory Service, and Payment Gateway each own their own independent databases, local database transactions are impossible. ACID does not work over network boundaries without massive trade-offs.

- **Two-Phase Commit (2PC):**
  A central transaction coordinator asks all participating databases to prepare for a commit (Phase 1: Voting). If every service replies "OK", the coordinator broadcasts a commit command (Phase 2: Commit). If any service fails or times out, the coordinator broadcasts an abort.
  - *The Failure Mode:* 2PC is a blocking protocol. If the coordinator or network fails during Phase 2, participating databases must hold row locks indefinitely to preserve consistency, causing system-wide cascading outages. Because of this, 2PC is rarely used in modern cloud microservices.

- **The Saga Pattern (Eventual Consistency with Compensating Actions):**
  A Saga is a sequence of local transactions. Each step executes a local database transaction and emits a message or event to trigger the next step. If step 3 fails, the Saga executes **Compensating Transactions** in reverse order to undo the business impact of earlier successful steps (e.g., refund payment, restore reserved inventory, mark order as canceled).
  
  Sagas come in two flavors:
  - **Choreography (Event-Driven):** Services listen to events published to a message broker (e.g., Kafka or RabbitMQ) and independently decide what to do next. There is no central controller. It is fast and loosely coupled, but complex workflows can lead to cyclic event storms and difficult debugging.
  - **Orchestration (Command-Driven):** A dedicated orchestrator (like Temporal, AWS Step Functions, or a centralized worker) explicitly sends commands to each service, waits for responses, tracks state machines in a persistent store, and coordinates compensating rollbacks on failure. Highly recommended for complex multi-step financial or e-commerce workflows.

## 4. Real Code — See It Working

Here is a production-grade implementation of the Unit of Work pattern and Pessimistic Locking using FastAPI and SQLAlchemy 2.0 async engine.

```python
from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Protocol
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

# --- 1. Database Models ---

class Base(DeclarativeBase):
    pass

class ProductModel(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    stock = Column(Integer, nullable=False, default=0)

class OrderModel(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, nullable=False)
    quantity = Column(Integer, nullable=False)
    status = Column(String(50), nullable=False, default="CONFIRMED")


# --- 2. Repositories (Receive an active AsyncSession) ---

class ProductRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_and_lock(self, product_id: int) -> ProductModel | None:
        # SELECT ... FOR UPDATE acquires a row-level exclusive lock.
        # Concurrent transactions attempting to lock this row will wait until this transaction finishes.
        query = (
            select(ProductModel)
            .where(ProductModel.id == product_id)
            .with_for_update()
        )
        result = await self._session.execute(query)
        return result.scalar_one_or_none()

    async def update_stock(self, product: ProductModel, new_stock: int) -> None:
        product.stock = new_stock


class OrderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_order(self, product_id: int, quantity: int) -> OrderModel:
        order = OrderModel(product_id=product_id, quantity=quantity, status="CONFIRMED")
        self._session.add(order)
        # We do NOT call session.commit() here! The Unit of Work manages commit boundaries.
        return order


# --- 3. Unit of Work Pattern ---

class UnitOfWorkProtocol(Protocol):
    products: ProductRepository
    orders: OrderRepository

    async def __aenter__(self) -> UnitOfWorkProtocol: ...
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None: ...
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...


class SqlAlchemyUnitOfWork:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None

    async def __aenter__(self) -> SqlAlchemyUnitOfWork:
        # Create a fresh session for this specific business use case
        self._session = self._session_factory()
        # Instantiate repositories sharing the exact same session
        self.products = ProductRepository(self._session)
        self.orders = OrderRepository(self._session)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._session is None:
            return

        if exc_type is not None:
            # If an unhandled exception escaped the block, automatically roll back all mutations
            await self.rollback()
        
        # Always close the session to release connection back to pool
        await self._session.close()

    async def commit(self) -> None:
        if self._session:
            await self._session.commit()

    async def rollback(self) -> None:
        if self._session:
            await self._session.rollback()


# --- 4. Database Setup & Dependency Injection ---

DATABASE_URL = "sqlite+aiosqlite:///:memory:"
engine: AsyncEngine = create_async_engine(DATABASE_URL, echo=False)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)

async def get_uow() -> AsyncGenerator[SqlAlchemyUnitOfWork, None]:
    # Yields the Unit of Work to the route handler
    uow = SqlAlchemyUnitOfWork(async_session_maker)
    yield uow


# --- 5. FastAPI Application & Route Handler ---

app = FastAPI(title="Transactions & Unit of Work Demo")

class OrderRequest(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)

class OrderResponse(BaseModel):
    order_id: int
    product_id: int
    quantity: int
    remaining_stock: int
    status: str

@app.post("/orders/checkout", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def checkout_order(
    request: OrderRequest,
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> OrderResponse:
    # All database modifications are contained within this single transaction context
    async with uow:
        # Step 1: Query and lock product row using SELECT ... FOR UPDATE
        product = await uow.products.get_and_lock(request.product_id)
        if product is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with ID {request.product_id} not found."
            )

        # Step 2: Validate domain invariants
        if product.stock < request.quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Insufficient inventory. Available: {product.stock}, Requested: {request.quantity}"
            )

        # Step 3: Mutate state across multiple repositories
        new_stock = product.stock - request.quantity
        await uow.products.update_stock(product, new_stock)
        order = await uow.orders.create_order(request.product_id, request.quantity)

        # Step 4: Flush and commit atomically
        # If an error happens before this line, uow.__aexit__ automatically calls rollback()
        await uow.commit()

        # Step 5: Construct response model
        return OrderResponse(
            order_id=order.id or 1,
            product_id=order.product_id,
            quantity=order.quantity,
            remaining_stock=new_stock,
            status=order.status,
        )
```

**Optimistic Locking Example (Version Column Approach)**

When you do not want to hold exclusive database row locks, implement optimistic locking using a version integer:

```python
from sqlalchemy import update

async def deduct_inventory_optimistic(
    session: AsyncSession,
    product_id: int,
    quantity: int,
    expected_version: int,
) -> bool:
    # Atomic conditional update. If another worker incremented version in the meantime,
    # 0 rows will be updated.
    stmt = (
        update(ProductModel)
        .where(
            ProductModel.id == product_id,
            ProductModel.version == expected_version,
            ProductModel.stock >= quantity,
        )
        .values(
            stock=ProductModel.stock - quantity,
            version=ProductModel.version + 1,
        )
    )
    result = await session.execute(stmt)
    # result.rowcount == 1 means success; 0 means conflict occurred
    return result.rowcount == 1
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does SQLAlchemy 2.0 manage transactions in FastAPI, and what is the danger of calling `session.commit()` inside repository methods?**

In SQLAlchemy 2.0, the `AsyncSession` manages transactions automatically in "autobegin" mode: the moment you execute your first SQL statement, the session transparently starts a transaction. Changes accumulate in memory and are staged in the database engine's transaction buffer. When you call `session.commit()`, the session flushes dirty objects and issues the SQL `COMMIT`. If an exception occurs, calling `session.rollback()` discards pending changes and rolls back the database transaction.

The danger of calling `session.commit()` inside individual repository methods is that it destroys transaction boundaries and violates Atomicity. If an `OrderRepository.create()` calls commit, and the subsequent `InventoryRepository.deduct()` fails, your database is left with a half-completed business operation that cannot be automatically rolled back. Repositories should only add, update, or query entities within the provided session; the Unit of Work or service orchestrator must retain sole ownership of the `commit()` and `rollback()` lifecycle.

**Q: What is Write Skew, and why does Repeatable Read fail to prevent it while Serializable or `SELECT ... FOR UPDATE` succeeds?**

Write Skew occurs when two concurrent transactions read overlapping data, verify a common constraint independently, and then make updates to separate, non-overlapping rows that together violate the global constraint.

A classic example is a doctor on-call rotation system with a rule: "At least one doctor must be on call at all times." Doctors Alice and Bob are currently on call. Both simultaneously request to go off-call.
1. Transaction A (Alice) checks: `SELECT COUNT(*) WHERE on_call = true`. Result is 2. Alice updates her own record to `on_call = false`.
2. Transaction B (Bob) checks: `SELECT COUNT(*) WHERE on_call = true`. Under Repeatable Read snapshot isolation, Bob's snapshot also returns 2. Bob updates his own record to `on_call = false`.
3. Both transactions commit. Now 0 doctors are on call, violating the safety invariant.

Repeatable Read fails to prevent this because Alice and Bob modified different rows, so no direct row-lock conflict occurred, and their reads came from valid MVCC snapshots. To prevent Write Skew, you must either use **Serializable Isolation** (which detects the overlapping dependency graph and aborts one transaction) or use **Pessimistic Locking (`SELECT ... FOR UPDATE`)** or explicit lock tables to force the reads to serialize.

**Q: When should you choose Optimistic Locking over Pessimistic Locking in a high-traffic FastAPI API?**

Choose **Optimistic Locking** when:
- Contention on any individual record is relatively low (e.g., users updating their own profiles, blog post edits).
- User interaction or external operations take noticeable time (e.g., a user opens an edit form in a browser for 30 seconds before hitting "Save"). Holding a database lock for 30 seconds would exhaust the connection pool and freeze the database.
- You are operating in a distributed environment where holding open database transactions across multiple microservices or network hops is an anti-pattern.

Choose **Pessimistic Locking (`SELECT ... FOR UPDATE`)** when:
- Contention on a single hot row is very high (e.g., ticket booking for a stadium concert, flash sales with thousands of concurrent checkout requests for 10 units).
- The cost of retrying under optimistic failure is expensive (e.g., running complex inventory calculations or executing authorization workflows).
- Operations are strictly server-side and complete within a few milliseconds, so locks are held for an imperceptible fraction of time.

**Q: How do database deadlocks happen in FastAPI, and how should your application handle them?**

A deadlock occurs when two transactions hold locks on separate resources and each waits to acquire the lock held by the other, creating a circular dependency:
- Transaction 1 locks Row A (Product #1) and requests a lock on Row B (Product #2).
- Transaction 2 locks Row B (Product #2) and requests a lock on Row A (Product #1).
Neither transaction can proceed. The database engine's deadlock detector runs periodically (e.g., every 1 second), detects the circular cycle in the lock wait-graph, chooses one transaction as the "deadlock victim", and forcibly aborts it with an error (e.g., PostgreSQL error code `40P01: deadlock_detected`).

To prevent deadlocks:
1. **Consistent Lock Ordering:** Always acquire locks in a globally deterministic order (e.g., sort product IDs in ascending order: `sorted_ids = sorted(requested_product_ids)` before issuing `SELECT ... FOR UPDATE`).
2. **Application-Level Retries:** Catch serialization and deadlock exceptions (`DBAPIError` with SQLSTATE `40P01` or `40001`) in a FastAPI middleware or decorator with exponential backoff and jitter (e.g., using the `tenacity` library).
3. **Keep Transactions Short:** Never perform slow I/O, file uploads, or external HTTP calls inside the transaction block.

**Q: Why is Two-Phase Commit (2PC) considered an anti-pattern in cloud microservices, and how does the Saga pattern solve it?**

Two-Phase Commit requires all participating databases to lock rows and hold network connections open during both the Prepare and Commit phases. If the network partitions, a microservice crashes, or the central coordinator becomes unreachable, all participant nodes hold row locks indefinitely. This causes connection pool exhaustion, cascades latency across independent services, and makes the system availability equal to the product of every participant's availability ($99.9\% \times 99.9\% \times 99.9\% = 99.7\%$).

The Saga pattern solves this by trading strict ACID consistency for **Eventual Consistency (BASE: Basically Available, Soft state, Eventual consistency)**. Each service executes only a short-lived local ACID transaction against its own private database and immediately commits. If a downstream step fails later, compensating transactions are triggered asynchronously to reverse the business effects. No cross-network locks are ever held, ensuring services remain highly available and decoupled.

**Q: What is the difference between Choreography-based Sagas and Orchestration-based Sagas?**

In a **Choreography-based Saga**, there is no central controller. Microservices publish and listen to domain events via an event bus (e.g., Apache Kafka). For example, the Order Service creates an order and emits `OrderCreated`. The Payment Service consumes this event, charges the card, and emits `PaymentSucceeded`. The Inventory Service consumes `PaymentSucceeded` and deducts stock.
- *Pros:* Simple to start, loosely coupled, no single point of failure.
- *Cons:* Difficult to track system state, hard to visualize business flows, and debugging failure scenarios or cyclic event dependencies becomes complex as the number of services grows.

In an **Orchestration-based Saga**, a central orchestrator service (e.g., Temporal, Camunda, or a custom state machine) controls the workflow. It sends explicit command messages to each service ("Charge $50", "Deduct 2 units") and receives acknowledgement replies. If a step fails, the orchestrator directly commands the preceding services to run their compensating workflows.
- *Pros:* Centralized visibility, explicit timeouts, easy monitoring, and simple error recovery logic.
- *Cons:* Adds an additional infrastructure component that must be maintained and scaled.

**Q: What happens if an external HTTP call (like Stripe payment or SendGrid email) is placed inside a database transaction block?**

Placing an external HTTP network call inside a database transaction block is a critical production failure mode. A database transaction holds an open connection from the connection pool and holds exclusive row-level locks on any touched records.

If Stripe or SendGrid experiences a 5-second latency spike or network timeout:
1. Your database transaction remains open for 5+ seconds.
2. The database connection is held hostage, rapidly draining the FastAPI connection pool (`pool_size = 20` will saturate in under 100 concurrent requests).
3. Other transactions attempting to modify the locked rows will queue up, creating cascading request timeouts across unrelated endpoints.
4. If the payment succeeds on Stripe, but your database crashes immediately afterward before `commit()`, the customer has been billed, but your database has zero record of the payment, creating impossible state reconciliation issues.

*The Solution:* Always separate external I/O from database transactions. Use the **Transactional Outbox Pattern**: save the domain changes and an "outbox event" inside the local database transaction atomically. A separate background worker reads committed outbox events and executes the external HTTP calls with idempotent retries.

## 6. The Traps — What Goes Wrong

**Trap 1: Network Calls and External Third-Party APIs Inside Database Transactions**
- *The Wrong Assumption:* Developers write `async with uow: await uow.orders.create(); await stripe_client.charge(); await uow.commit();` assuming this makes the payment and the database write atomic.
- *What Actually Happens:* External HTTP calls cannot be rolled back by SQL. If the database crashes after the HTTP call succeeds, the money is taken with no DB record. Furthermore, third-party network latency holds open database connections and row locks, exhausting the connection pool and causing site-wide HTTP 504 Gateway Timeouts.
- *The Fix:* Keep transactions strictly constrained to database queries. Use asynchronous background tasks, Celery, or the Transactional Outbox Pattern to trigger external side effects after the transaction commits.

**Trap 2: Read-Modify-Write Without Locking (Lost Updates)**
- *The Wrong Assumption:* Querying a record with standard `select(Product).where(Product.id == 1)`, modifying its value in Python (`product.stock -= 1`), and calling `session.commit()` is safe under default isolation levels.
- *What Actually Happens:* Under Read Committed or Repeatable Read, two concurrent requests can read `stock = 5` simultaneously. Both compute `5 - 1 = 4`. Both write back `stock = 4`. Two items were purchased, but stock only decreased by 1 (Lost Update anomaly).
- *The Fix:* Use `select(...).with_for_update()` to place an exclusive row lock, use an atomic SQL decrement statement (`UPDATE products SET stock = stock - 1 WHERE id = 1 AND stock >= 1`), or use optimistic locking with version checks.

**Trap 3: Inconsistent Lock Acquisition Order Causing Deadlocks**
- *The Wrong Assumption:* Locking multiple rows in the order they arrive in the incoming HTTP payload is harmless.
- *What Actually Happens:* Request 1 receives transfer `[Account A -> Account B]` and locks Account A first, then Account B. Request 2 receives transfer `[Account B -> Account A]` and locks Account B first, then Account A. Under concurrent load, both requests lock their first account and wait forever for the second account, triggering a database deadlock crash.
- *The Fix:* Enforce deterministic sorting on resource IDs before acquiring locks: `for account_id in sorted([from_id, to_id]): await lock_account(account_id)`.

**Trap 4: Leaking Dirty Sessions Across Async Requests**
- *The Wrong Assumption:* Sharing a single global `AsyncSession` object across FastAPI requests or storing a session in a global variable improves performance.
- *What Actually Happens:* SQLAlchemy's `AsyncSession` is strictly non-thread-safe and non-concurrency-safe. When multiple async coroutines interact with the same session simultaneously, uncommitted objects from Request A leak into Request B, queries intertwine over the single underlying connection, and the driver raises `InvalidRequestError: Transaction is already begun` or corrupts connection stream state.
- *The Fix:* Use FastAPI's dependency injection (`Depends(get_session)`) with `async_sessionmaker` to ensure every incoming HTTP request receives a dedicated, request-scoped session that is strictly closed in a `finally` block.

**Trap 5: Assuming Sagas Provide Complete Isolation**
- *The Wrong Assumption:* Breaking a distributed workflow into a Saga provides the same ACID safety as a monolithic database transaction.
- *What Actually Happens:* Sagas provide Atomicity, Consistency, and Durability, but they **lack Isolation** (the "I" in ACID). Because each local transaction commits immediately, intermediate state is visible to other users. For example, a customer might see a hotel room marked as "Reserved" for 30 seconds before the payment fails and compensation un-reserves it.
- *The Fix:* Design application states to be semantic and explicit (e.g., `status = "PENDING_PAYMENT"` instead of `"CONFIRMED"`), use semantic locks, and implement idempotent consumers for all compensating actions.

## 7. Compare With Related Concepts

| Pattern / Concept | Core Mechanic | Concurrency Cost | Best Used For |
|---|---|---|---|
| **Unit of Work (UoW)** | Tracks business mutations across multiple repositories within a single database session and commits/rolls back as one unit. | Zero additional lock overhead; shares one connection lifecycle. | Multi-repository coordination in layered architectures. |
| **Pessimistic Locking (`FOR UPDATE`)** | Database engine takes an exclusive lock on queried rows; competitors wait in queue. | High latency under heavy contention; risk of deadlocks. | Hot records, financial transfers, seat allocations, critical counters. |
| **Optimistic Locking (Version Column)** | No locks held during read; updates conditionally verify version has not changed. | Zero lock overhead; CPU/retry cost on conflict. | Low-contention workflows, long user forms, distributed updates. |
| **Two-Phase Commit (2PC)** | Central coordinator holds distributed locks across nodes through Prepare and Commit phases. | Extreme; blocking locks held over network hops. | Legacy monolithic databases with distributed tables; avoid in microservices. |
| **Distributed Saga** | Sequence of local transactions where failures trigger reverse compensating actions. | No cross-service locking; intermediate state is visible (no Isolation). | Multi-service business workflows (e-commerce checkout, travel booking). |

**Quick Selection Rules:**
- Need multi-repository atomic commits in a single database? Use **Unit of Work**.
- Need to prevent lost updates on high-contention rows (inventory drop, balance deduction)? Use **Pessimistic Locking (`SELECT ... FOR UPDATE`)**.
- Need conflict prevention for user-facing edit screens or low-contention tables? Use **Optimistic Locking (Version column)**.
- Need atomic transactions spanning multiple independent microservices? Use **Saga Pattern (Orchestration for complex flows, Choreography for simple events)**. Never use 2PC in cloud microservices.

## 8. 🧠 The Memory Hook

A database transaction is an **Escrow Closing**: every contract, deed, and dollar must be verified in the pending vault before anything changes hands—if a single document fails, every asset returns to its original owner as if the meeting never happened. When scaling across microservices, you trade the escrow vault for a **Saga Flight Itinerary**: each leg of the trip is booked independently, and if your connecting flight is canceled, you execute pre-planned cancellation refunds step-by-step in reverse.
