# Handling Schema Changes in SQLAlchemy: Zero-Downtime Migrations, Expand/Contract, and Backward Compatibility

## 1. Why This Exists — The Problem First

You have twenty Kubernetes pods running a FastAPI and SQLAlchemy service handling 5,000 requests per second. You decide to clean up a legacy column on the `users` table: changing `phone_number` to an E.164-standardized `phone_e164`. You generate an Alembic migration with `op.drop_column('users', 'phone_number')` and `op.add_column('users', sa.Column('phone_e164', sa.String(30)))`, commit the code, and trigger your CI/CD pipeline.

The CI/CD pipeline runs `alembic upgrade head` immediately before initiating a rolling deployment across your cluster. In fifty milliseconds, PostgreSQL drops `phone_number` and adds `phone_e164`.

Within three seconds, your alerting dashboard turns red.

Pods 1 through 18 are still running the old application version while Kubernetes slowly replaces them. When those running pods handle incoming user profile requests, SQLAlchemy issues its standard mapped query: `SELECT users.id, users.name, users.phone_number FROM users WHERE users.id = :id`. PostgreSQL immediately aborts the transaction with:

```text
psycopg2.errors.UndefinedColumn: column users.phone_number does not exist
LINE 1: SELECT users.id, users.name, users.phone_number FROM users...
                                     ^
```

Every user request hits an HTTP 500 Internal Server Error. The on-call engineer panics and triggers an immediate deployment rollback. But the rollback fails to recover the site because the older container image *still* expects `users.phone_number` in the database, and that column is already gone. What should have been a routine column rename becomes a fifteen-minute production outage requiring manual database intervention.

In modern distributed architectures, **application code deployments and database schema updates never happen at the exact same millisecond**. During rolling updates, blue-green cutovers, or canary releases, older code (Version $N$) and newer code (Version $N+1$) run concurrently against the exact same database. If a database schema modification breaks backward compatibility with the currently running application version, an outage is guaranteed.

---

## 2. The Analogy — Make It Obvious

Imagine a busy two-lane highway bridge carrying thousands of cars per hour over a deep river gorge. City planners need to replace the aging two-lane bridge with a modern four-lane suspension bridge.

```txt
WRONG (Instant Cutover Outage):
[Old Bridge Carrying 5,000 Cars/hr] ──💥 DYNAMITE! ──> [Cars Plunge Into River] ──> [Start Building New Bridge]

RIGHT (Expand & Contract Zero-Downtime):
Step 1 (Expand):       [Old Bridge Active] ── [New Bridge Built in Parallel]
Step 2 (Dual Route):   [Old Bridge Active] <─ Traffic Split ─> [New Bridge Active]
Step 3 (Switch Flow):  [Old Bridge Empty]  <── 100% Traffic ── [New Bridge Active]
Step 4 (Contract):     [Old Bridge Demolished Safely] ──────── [New Bridge Carrying All Traffic]
```

If the construction crew detonates dynamite on the old bridge before the new one is built and certified, every car currently on the road falls into the river.

Instead, civil engineers use a staged transition:
1. **Expand**: Build the new four-lane bridge parallel to the old one without touching the old bridge.
2. **Dual-Route**: Open the on-ramps to the new bridge while keeping the old bridge active. Vehicles can cross on either bridge.
3. **Switch Traffic**: Repaint highway lane lines and redirect 100% of vehicles across the new suspension bridge.
4. **Contract / Demolish**: Once sensors confirm zero cars are on the old bridge, safely dismantle the old structure.

In database engineering:
- The **Bridge** is your database schema and column definition.
- The **Vehicles** are active user HTTP requests handled by application pods.
- The **Highway Signage** is your SQLAlchemy ORM model mapping.
- The **Parallel Construction** is the **Expand / Contract (Parallel Run)** design pattern.

---

## 3. How It Actually Works — The Full Explanation

Zero-downtime schema evolution requires decoupling database schema changes from application code changes across multiple, backward-compatible deployment phases.

```txt
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        THE 5-PHASE EXPAND / CONTRACT LIFECYCLE                         │
├──────────────┬──────────────────────────────┬───────────────────────────┬──────────────┤
│ Phase        │ Database Schema              │ Application Code          │ Pod State    │
├──────────────┼──────────────────────────────┼───────────────────────────┼──────────────┤
│ 1. Expand    │ Add new column (NULLABLE)    │ Reads & writes old column │ App V1 only  │
│ 2. Dual Write│ Both columns exist in DB     │ Writes to BOTH; reads old │ App V1 → V2  │
│    +Backfill │                              │ Background backfill worker│              │
│ 3. Switch Rd │ Both columns synchronized    │ Writes to BOTH; reads NEW │ App V2 → V3  │
│ 4. Stop Write│ Both columns exist in DB     │ Reads & writes NEW only   │ App V3 → V4  │
│ 5. Contract  │ Drop old column / add NOT NULL│ Reads & writes NEW only   │ App V4 only  │
└──────────────┴──────────────────────────────┴───────────────────────────┴──────────────┘
```

### The 5-Phase Expand / Contract Pattern

#### Phase 1: Expand (Database Migration 1)
- Apply an Alembic migration that creates the new column as `nullable=True` (or with a non-locking metadata `server_default`).
- Do not drop or rename any existing columns.
- The running application (Version 1) is completely unaffected because its SQLAlchemy models ignore unknown database columns.

#### Phase 2: Dual-Write & Historical Backfill (Application Release 1 + Background Worker)
- Deploy Application Version 2. This version writes incoming data to **both** `phone_number` (old) and `phone_e164` (new) on every `INSERT` and `UPDATE`.
- The application continues to read from `phone_number` so any un-backfilled legacy row remains readable.
- Launch an asynchronous batch worker (e.g., Celery task or standalone script) that scans historical records in chunks of 1,000 rows using cursor pagination and populates `phone_e164` from `phone_number`.

#### Phase 3: Switch Reads (Application Release 2)
- Once the backfill worker completes and automated data-verification queries confirm zero nulls or discrepancies, deploy Application Version 3.
- Application Version 3 reads from `phone_e164`.
- Application Version 3 continues dual-writing to `phone_number`. This guarantees that if a critical bug requires rolling back to Application Version 2 or 1, no data created during Version 3's window is lost.

#### Phase 4: Stop Writes to Old Column (Application Release 3)
- Deploy Application Version 4. All reads and writes target `phone_e164` exclusively.
- Remove the `phone_number` attribute from the SQLAlchemy model definition.
- The old database column `phone_number` is now dormant.

#### Phase 5: Contract (Database Migration 2)
- Apply the final Alembic migration.
- Drop the old column: `op.drop_column('users', 'phone_number')`.
- If the new column must be non-nullable, enforce the constraint now: `op.alter_column('users', 'phone_e164', nullable=False)`. Because every row was backfilled in Phase 2 and verified in Phase 3, this operation completes instantly without constraint violations.

---

### Safe vs Unsafe Schema Changes Matrix

Every database migration interacts with table locks. An unsafe migration acquires an `AccessExclusiveLock` on PostgreSQL or equivalent table locks on MySQL, blocking all concurrent `SELECT`, `INSERT`, `UPDATE`, and `DELETE` queries.

```txt
┌─────────────────────────┬──────────────┬────────────────────────────────────────────────────────┐
│ Schema Operation        │ Safety Level │ Production Risk & Mitigation Strategy                  │
├─────────────────────────┼──────────────┼────────────────────────────────────────────────────────┤
│ Add Nullable Column     │ ✅ Safe       │ Metadata-only operation. Instant execution.            │
│ Add NOT NULL (no default)│ ❌ Unsafe     │ Fails if table has rows; breaks older app INSERTs.      │
│                         │              │ Mitigation: Add nullable, backfill, alter to NOT NULL. │
│ Add NOT NULL with default│ ⚠️ Caution   │ Postgres <11 rewrites table. Postgres 11+ is metadata- │
│                         │              │ only, but older running apps will fail if they insert. │
│ Drop Column             │ ❌ Unsafe     │ Instantly breaks running code querying that column.    │
│                         │              │ Mitigation: Unmap from SQLAlchemy model first.         │
│ Rename Column           │ ❌ Unsafe     │ Breaks all queries from older application pods.        │
│                         │              │ Mitigation: Expand/Contract with hybrid_property.      │
│ Create Standard Index   │ ❌ Unsafe     │ Holds SHARE lock; blocks all concurrent writes.        │
│                         │              │ Mitigation: CREATE INDEX CONCURRENTLY (Postgres).      │
│ Add Foreign Key         │ ⚠️ Caution   │ Full table scan locks writes.                          │
│                         │              │ Mitigation: ADD CONSTRAINT ... NOT VALID, then VALIDATE│
└─────────────────────────┴──────────────┴────────────────────────────────────────────────────────┘
```

---

## 4. Real Code — See It Working

### 1. The SQLAlchemy Model with Dual-Write Bridge (`hybrid_property`)

During Phases 2 and 3, your SQLAlchemy model must bridge the old and new column names so application service layers remain clean while writing to both columns.

```python
# models/user.py
import sqlalchemy as sa
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.ext.hybrid import hybrid_property

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)

    # Phase 2/3: Both columns exist in the database.
    # Old legacy column (retained for backward compatibility and rollback safety)
    phone_number: Mapped[str | None] = mapped_column(sa.String(30), nullable=True)

    # New standardized column (added during Expand phase)
    phone_e164: Mapped[str | None] = mapped_column(sa.String(30), nullable=True)

    @hybrid_property
    def phone(self) -> str | None:
        """
        Read preference bridge:
        Prefers the new standardized column; falls back to legacy if not yet backfilled.
        """
        if self.phone_e164 is not None:
            return self.phone_e164
        return self.phone_number

    @phone.setter
    def phone(self, value: str | None) -> None:
        """
        Dual-write bridge:
        When application code sets user.phone = "+14155552671",
        both old and new columns are updated simultaneously.
        """
        self.phone_number = value
        self.phone_e164 = value
```

---

### 2. Phase 1: Expand Migration (Alembic + PostgreSQL Concurrent Index)

Standard Alembic migrations run inside a transaction block. However, PostgreSQL's `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. We use `op.get_context().autocommit_block()` and set a short `lock_timeout`.

```python
# alembic/versions/20260826_01_expand_user_phone.py
"""Phase 1: Expand - Add new nullable column and concurrent index

Revision ID: 20260826_01
Revises: 20260801_00
Create Date: 2026-08-26 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "20260826_01"
down_revision = "20260801_00"
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 1. Protect against lock queue starvation: abort if lock cannot be acquired in 2s
    op.execute("SET lock_timeout = '2s'")

    # 2. Expand: Add new column as NULLABLE so running pods can continue inserting
    op.add_column(
        "users",
        sa.Column("phone_e164", sa.String(length=30), nullable=True)
    )

    # 3. Create index CONCURRENTLY without blocking concurrent table writes
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_users_phone_e164",
            "users",
            ["phone_e164"],
            postgresql_concurrently=True
        )

def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "ix_users_phone_e164",
            table_name="users",
            postgresql_concurrently=True
        )
    op.drop_column("users", "phone_e164")
```

---

### 3. Batched Historical Backfill Script (Keyset Pagination)

Never run a single massive `UPDATE users SET phone_e164 = phone_number`. It locks millions of rows, bloats the write-ahead log (WAL), and causes severe replication lag on read replicas. Use chunked keyset pagination with brief pause intervals.

```python
# scripts/backfill_user_phone.py
import time
import sqlalchemy as sa
from sqlalchemy.orm import Session

def backfill_phone_e164(engine: sa.Engine, batch_size: int = 1000, sleep_delay: float = 0.05) -> int:
    """
    Backfills historical rows in bounded batches using keyset pagination (id > last_id).
    Prevents table locks, WAL spikes, and replica lag.
    """
    total_updated = 0
    last_id = 0

    while True:
        with Session(engine) as session:
            # 1. Fetch primary keys of the next chunk needing migration
            fetch_query = (
                sa.text("""
                    SELECT id, phone_number
                    FROM users
                    WHERE id > :last_id
                      AND phone_e164 IS NULL
                      AND phone_number IS NOT NULL
                    ORDER BY id ASC
                    LIMIT :batch_size
                """)
                .bindparams(last_id=last_id, batch_size=batch_size)
            )
            rows = session.execute(fetch_query).fetchall()

            if not rows:
                break  # All historical rows have been migrated

            last_id = rows[-1][0]
            ids_to_update = [row[0] for row in rows]

            # 2. Update the specific batch in a short-lived transaction
            update_stmt = (
                sa.text("""
                    UPDATE users
                    SET phone_e164 = phone_number
                    WHERE id = ANY(:ids)
                """)
                .bindparams(ids=ids_to_update)
            )
            session.execute(update_stmt)
            session.commit()

            total_updated += len(rows)

        # 3. Yield execution to let concurrent user queries proceed and replicas sync
        time.sleep(sleep_delay)

    return total_updated
```

---

### 4. Phase 5: Contract Migration (Alembic Cleanup)

Executed only after Application Version 4 is running everywhere and no queries reference `phone_number`.

```python
# alembic/versions/20260830_02_contract_user_phone.py
"""Phase 5: Contract - Drop legacy column and enforce constraints

Revision ID: 20260830_02
Revises: 20260826_01
Create Date: 2026-08-30 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "20260830_02"
down_revision = "20260826_01"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("SET lock_timeout = '2s'")

    # 1. Enforce NOT NULL constraint on the new column (safe because backfill is complete)
    op.alter_column(
        "users",
        "phone_e164",
        nullable=False,
        existing_type=sa.String(length=30)
    )

    # 2. Drop the old legacy column
    op.drop_column("users", "phone_number")

def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("phone_number", sa.String(length=30), nullable=True)
    )
    op.alter_column(
        "users",
        "phone_e164",
        nullable=True,
        existing_type=sa.String(length=30)
    )
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does a standard SQLAlchemy query fail immediately if you drop a database column before updating and deploying the application code?**

SQLAlchemy compiles its SQL queries at runtime based on the Python model's class attributes defined at startup. When you query `session.query(User).all()` or `session.scalars(select(User))`, SQLAlchemy does not execute `SELECT *`. It explicitly enumerates every mapped column in the generated SQL: `SELECT users.id, users.name, users.phone_number FROM users`.

If the database column `phone_number` is dropped while the application process is running, PostgreSQL cannot resolve the column identifier in the SQL statement. The database aborts the transaction with an `UndefinedColumn` error. Because the Python process has already mapped the attribute in its mapper registry, every subsequent query touching that model will fail until the application process is restarted with updated model definitions.

---

**Q: How do you safely add a `NOT NULL` column to a 50-million-row production table in PostgreSQL without locking out user traffic?**

In PostgreSQL 11+, adding a column with a constant `server_default` and `NOT NULL` is a metadata-only operation and does not rewrite the table:

```python
op.add_column(
    'orders',
    sa.Column('status', sa.String(20), nullable=False, server_default=sa.text("'pending'"))
)
```

However, if you are on an older database engine, or if the default value is dynamic (e.g., computed per row), you must follow the three-step pattern:
1. Add the column as `nullable=True` (instant metadata update, no table lock).
2. Deploy the application code that populates the column for new records, and run a batched background worker to populate historical rows in chunks of 1,000.
3. Once all historical rows have non-null values, add a `CHECK (status IS NOT NULL) NOT VALID` constraint (instant), validate it asynchronously with `VALIDATE CONSTRAINT` (does not lock writes), and finally alter the column to `nullable=False`.

---

**Q: What is the risk of running a standard `CREATE INDEX` statement in production, and how do you execute it safely with Alembic in PostgreSQL?**

A standard `CREATE INDEX` acquires a `SHARE` lock on the target table. While reads (`SELECT`) can continue, all write operations (`INSERT`, `UPDATE`, `DELETE`) are blocked until the entire index build finishes. On a table with 50 million rows, building an index can take twenty minutes, causing application connection pools to saturate and taking down the service.

The solution in PostgreSQL is `CREATE INDEX CONCURRENTLY`. This builds the index across two scans without acquiring a `SHARE` lock, allowing normal writes to proceed.

To run this in Alembic:
1. `CREATE INDEX CONCURRENTLY` cannot run inside an active database transaction block. You must escape Alembic's transactional migration wrapper using `with op.get_context().autocommit_block():`.
2. Pass `postgresql_concurrently=True` to `op.create_index()`.

---

**Q: How do you rename a database column in a high-traffic system without taking scheduled maintenance downtime?**

Never execute `ALTER TABLE table RENAME COLUMN old_col TO new_col;` directly in production. This immediately breaks any running application pod executing queries with the old column name.

You execute the 5-phase Expand / Contract sequence:
1. **Expand**: Add `new_col` as a nullable column via Alembic.
2. **Dual-Write + Backfill**: Deploy application code where the SQLAlchemy model uses a `@hybrid_property` bridge to write incoming data to both `old_col` and `new_col`, while reading from `old_col`. Run a keyset-paginated worker to backfill historical rows.
3. **Switch Reads**: Deploy updated code switching the read path to `new_col` while maintaining dual writes.
4. **Stop Writes**: Deploy code that removes `old_col` from the SQLAlchemy model and writes only to `new_col`.
5. **Contract**: Apply the final Alembic migration dropping `old_col`.

---

**Q: What is "lock queue starvation" during DDL migrations, and how do you prevent a fast `ALTER TABLE` from taking down the database?**

Even if an `ALTER TABLE` operation takes only two milliseconds to execute (such as adding a nullable column), it requires an `AccessExclusiveLock` on the table.

If a slow analytical query or long-running transaction is currently reading from that table, it holds an `AccessShareLock`. The `ALTER TABLE` must wait behind that slow query. In PostgreSQL, lock requests are queued in First-In, First-Out (FIFO) order. Once the `ALTER TABLE` enters the queue requesting an exclusive lock, **all subsequent incoming `SELECT` queries are blocked behind the `ALTER TABLE`**.

```txt
[Long SELECT (running)] ──> [ALTER TABLE (waiting for lock)] ──> [Incoming SELECTs 1..500 (BLOCKED)]
                                                                   └──> Connection Pool Exhaustion (Outage)
```

Within seconds, hundreds of application threads block waiting for database connections, leading to complete pool exhaustion and 504 Gateway Timeouts.

To prevent this:
1. Always set a strict lock timeout before running DDL: `SET lock_timeout = '2s';`.
2. If the lock cannot be acquired within two seconds, the migration immediately aborts and rolls back rather than stalling the queue.
3. The CI/CD deploy pipeline can retry the migration with exponential backoff.

---

**Q: Why is running `alembic upgrade head` inside container entrypoint scripts (e.g., Docker `CMD` or Kubernetes pod startup) dangerous in production?**

When deploying twenty container replicas concurrently during a Kubernetes rollout, every single pod boots up and attempts to execute `alembic upgrade head` simultaneously.

This causes:
1. **Migration Race Conditions**: Multiple processes compete to acquire locks on the `alembic_version` table.
2. **Deadlocks**: Multiple DDL transactions attempt to alter identical tables in parallel, resulting in transaction aborts and crash-looping containers (`CrashLoopBackOff`).
3. **Corrupted Migration State**: If one pod crashes halfway through a non-transactional DDL statement, other pods read inconsistent migration version stamps.

Migrations must be decoupled from application startup. In Kubernetes, execute migrations inside a dedicated, single-pod `PreSync` hook or Kubernetes `Job` that runs to completion before initiating the rolling pod rollout.

---

## 6. The Traps — What Goes Wrong

### Trap 1: The SQLAlchemy Model-Mapper Desynchronization
- **The Mistake**: Dropping a column in the database before deploying code that removes the attribute from the SQLAlchemy model class.
- **Why It Fails**: Developers assume that if their application endpoints don't explicitly use `user.phone_number`, dropping the column is harmless. But SQLAlchemy generates `SELECT` queries containing all mapped columns defined on the model class.
- **What Happens**: Every query on that model raises `psycopg2.errors.UndefinedColumn`.
- **The Fix**: Remove the column attribute from the Python SQLAlchemy model first, deploy that code to 100% of pods, and only then drop the column from the database.

---

### Trap 2: Unbounded Batch Updates During Backfills
- **The Mistake**: Running `UPDATE users SET phone_e164 = phone_number WHERE phone_e164 IS NULL;` in a single SQL statement on a table with 20 million rows.
- **Why It Fails**: This single statement places row-level write locks on millions of rows, accumulates millions of tuple changes in a single database transaction, generates enormous Write-Ahead Log (WAL) volume, and stalls streaming replication to read replicas.
- **What Happens**: Concurrent user updates deadlock with the migration script, replica lag spikes to hours, and the database server may run out of disk space due to WAL retention.
- **The Fix**: Use keyset pagination (`WHERE id > :last_id ORDER BY id ASC LIMIT 1000`) inside a loop with explicit short transactions and a `time.sleep(0.05)` delay between iterations.

---

### Trap 3: Adding Foreign Key Constraints Directly to Massive Tables
- **The Mistake**: Running `ALTER TABLE orders ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id);` in one command.
- **Why It Fails**: Standard foreign key creation requires a full table validation scan while holding an exclusive lock on `orders` and a share lock on `users`.
- **What Happens**: On large tables, the entire orders and users tables are locked against concurrent writes for minutes.
- **The Fix**: In PostgreSQL, split the operation into two phases:
  ```sql
  -- Step 1: Add constraint without validating existing rows (instant metadata operation)
  ALTER TABLE orders ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;

  -- Step 2: Validate existing rows in the background (does not block writes)
  ALTER TABLE orders VALIDATE CONSTRAINT fk_user_id;
  ```

---

### Trap 4: Missing `existing_type` in Alembic Column Alterations
- **The Mistake**: Writing `op.alter_column('users', 'status', nullable=False)` without supplying the `existing_type` parameter.
- **Why It Fails**: Unlike raw SQL, Alembic needs to know the existing column type to generate valid DDL for certain dialects (such as MySQL or SQLite).
- **What Happens**: Alembic generates malformed SQL or fails during migration generation with `ArgumentError: An existing_type is required for alter_column`.
- **The Fix**: Always provide `existing_type=sa.String(50)` when calling `op.alter_column`.

---

## 7. Compare With Related Concepts

### Expand / Contract Pattern vs Online Schema Change (OSC) Tools (gh-ost / pt-online-schema-change)
- **Expand / Contract**: Orchestrated at the application and ORM level across multiple releases. Best for logical changes: renaming columns, restructuring fields, transforming data formats, and splitting/merging tables.
- **Online Schema Change Tools (e.g., GitHub's gh-ost, Percona pt-osc)**: Operates at the database infrastructure level by creating a ghost/shadow table, copying historical data, and streaming binary logs (binlog/WAL) before atomic cutover. Best for heavy physical DDL alterations (such as changing column data types or rebuilding table primary keys on massive MySQL/Postgres tables).
- **Rule of Thumb**: Use Expand/Contract for application-driven model refactoring; use OSC tools for database-level physical table rewrites that cannot be handled with zero locks.

---

### PostgreSQL Transactional DDL vs MySQL Non-Transactional DDL
- **PostgreSQL**: Supports transactional DDL. If a multi-step migration fails on statement 4 of 5, the entire transaction rolls back, leaving the schema in its clean initial state (unless using `autocommit_block()` for concurrent indexing).
- **MySQL**: DDL statements cause an **implicit commit**. If a migration fails halfway through, the database cannot roll back the preceding statements, leaving your schema in an unpredictable "half-migrated" state.
- **Rule of Thumb**: When targeting MySQL, keep Alembic migration files strictly single-operation to avoid unrecoverable partial migration states.

---

### Alembic Versioned Migrations vs SQLAlchemy `Base.metadata.create_all()`
- **SQLAlchemy `create_all()`**: Inspects existing tables and issues `CREATE TABLE IF NOT EXISTS`. It never alters existing tables, adds missing columns, modifies column types, or creates indexes on existing tables.
- **Alembic**: A dedicated schema revision management tool that tracks historical version deltas (`alembic_version` table) and generates incremental, reversible DDL scripts.
- **Rule of Thumb**: Use `create_all()` exclusively in isolated, disposable in-memory SQLite unit test suites. Use Alembic for all staging, production, and persistent local development environments.

---

## 8. 🧠 The Memory Hook

> **Never change the database out from under running code.**
> First **Expand** what the database can accept, teach all running application pods to use the new shape, and only then **Contract** the old schema away.
