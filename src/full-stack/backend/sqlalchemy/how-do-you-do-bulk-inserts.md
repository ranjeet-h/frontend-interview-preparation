# Bulk Inserts in SQLAlchemy 2.0: `insert().values()`, Batching, and Core vs ORM Performance

## 1. Why This Exists — The Problem First

Imagine your team is tasked with ingesting a 100,000-row customer transaction CSV export into PostgreSQL. A developer on the team writes standard, idiomatic SQLAlchemy code:

```python
for row in csv_reader:
    user = User(name=row["name"], email=row["email"], balance=row["balance"])
    session.add(user)
session.commit()
```

Or slightly refactored with `session.add_all([User(...) for row in csv_reader])`.

When this hits staging or production, three severe failures occur simultaneously:

1. **Network Latency Death by 100,000 Round Trips**: If your application container has a modest 1ms round-trip ping to your managed database instance (RDS/Cloud SQL), 100,000 individual `INSERT INTO users ...` queries take at least 100 seconds purely waiting on TCP packets traveling across the network wire.
2. **Out-of-Memory (OOM) Container Crash**: SQLAlchemy's Unit of Work and Identity Map instantiate 100,000 complete Python model instances, attach attribute-level instrumentation listeners, create internal change-tracking state dictionaries, and retain every single object in memory. A 100,000-row dataset spikes process memory by 2 GB to 4 GB, causing the Linux OOM-killer to instantly terminate the container.
3. **Transaction Lock Contention & WAL Bloat**: Holding a database transaction open for several minutes while row-by-row statements trickle in locks table pages, delays garbage collection (autovacuum), and floods the Write-Ahead Log (WAL) with massive transaction metadata overhead.

Bulk operations exist because inserting 100,000 records must never be treated as 100,000 independent unit-of-work transactions. To achieve high throughput, your backend must bypass per-object state tracking, bundle records into multi-row batches, and leverage driver-level or database-native streaming protocols.

---

## 2. The Analogy — Make It Obvious

Imagine you run a logistics company and need to deliver 100,000 individual letters from your city warehouse to a distribution center across town.

- **Level 1 (Naive ORM `session.add` / `session.add_all`)**: You hire 100,000 separate couriers on bicycles. For every letter, a courier prints a detailed dossier, straps on a GPS tracking collar, drives across town alone, gets a signed physical receipt, drives back, and sits in your warehouse lobby waiting for further instructions. Your lobby runs out of chairs (RAM exhaustion), and the city highway is paralyzed by 100,000 individual trips (network latency).
- **Level 2 (ORM Bulk `insert()` with `returning`)**: You still want delivery confirmation receipts for every letter, but instead of 100,000 bicycles, you load 1,000 letters into each delivery van. You make 100 coordinated trips instead of 100,000.
- **Level 3 (SQLAlchemy Core `conn.execute(insert(), list_of_dicts)`)**: You do not need personal dossiers or real-time GPS tracking collars on every letter. You pack raw, unadorned cargo boxes into 18-wheeler freight trucks. The warehouse workers do not track the items after they leave the loading dock.
- **Level 4 (Database Native Stream — PostgreSQL `COPY`)**: You build a high-speed pneumatic tube directly between your warehouse and the sorting hub. Raw cargo streams continuously through the tube in binary format, bypassing highway checkpoints, traffic lights, and vehicle inspections entirely.

---

## 3. How It Actually Works — The Full Explanation

### The SQLAlchemy Unit of Work & Identity Map Overhead

To understand why naive ORM operations are slow, look at what happens inside the Python runtime when you instantiate a mapped class:

```txt
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PYTHON RUNTIME MEMORY                             │
│                                                                             │
│  User(name="Alice", ...)                                                    │
│    ├── InstanceState (_sa_instance_state)                                   │
│    ├── Attribute instrumentation & change listeners                         │
│    └── session.identity_map[(User, primary_key)]                            │
│                                                                             │
│  100,000 rows = 100,000 Python objects + state dicts (~2-4 GB heap RAM)     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ session.flush()
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TOPOLOGICAL DEPENDENCY GRAPH                      │
│                                                                             │
│  1. Iterates all 100,000 objects to detect dirty/pending attributes         │
│  2. Emits single-row INSERT statements to obtain database-generated PKs    │
│  3. Re-hydrates each Python instance with returned server values            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                         100,000 SQL statements
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │    DATABASE (Postgres)    │
                        │  Parse -> Plan -> Execute │
                        │  (100,000 round trips)    │
                        └───────────────────────────┘
```

Between 60% and 80% of total runtime in naive ORM inserts is spent inside the Python interpreter performing object bookkeeping, not in the database engine.

---

### The Hierarchy of Bulk Operations in SQLAlchemy 2.0

SQLAlchemy 2.0 establishes four distinct levels of bulk insertion performance:

```txt
   SPEED / THROUGHPUT (Rows/sec)
      ▲
      │                                                     [Level 4: Native COPY]
      │                                                     ~200,000+ rows/sec
      │                                                     (Bypasses SQL parser)
      │
      │                                [Level 3: Core Bulk]
      │                                ~15,000 - 50,000 rows/sec
      │                                (DBAPI executemany / multi-VALUES)
      │
      │           [Level 2: ORM Bulk 2.0]
      │           ~2,000 - 10,000 rows/sec
      │           (insert(Model) + list of dicts)
      │
      │   [Level 1: session.add_all]
      │   ~100 - 500 rows/sec
      │   (Full hydration + Identity Map)
      └────────────────────────────────────────────────────────────────────────► ARCHITECTURAL LEVEL
```

#### Level 1: Standard ORM `session.add_all()` (Slowest)
- **Mechanism**: Every record is a hydrated `Model` instance registered in `session.identity_map`.
- **Memory Overhead**: $O(N)$ full Python objects.
- **Throughput**: ~100 to 500 rows per second.
- **When to use**: Only when inserting a handful of records ($<50$) where you immediately need relationship cascades and active model instances in current application logic.

#### Level 2: Modern 2.0 ORM Bulk Insert (`session.scalars(insert(Model), list_of_dicts)`)
- **Mechanism**: Replaces the legacy SQLAlchemy 1.x `session.bulk_insert_mappings()`. You construct an `insert(Model)` statement and pass a list of plain Python dictionaries directly to `session.execute()` or `session.scalars()`.
- **Identity Map Behavior**: If you do not request `returning()`, SQLAlchemy skips instantiating ORM objects entirely. If you use `.returning(Model)`, SQLAlchemy streams the returned database rows into newly constructed ORM objects in batches.
- **Throughput**: ~2,000 to 10,000 rows per second.
- **When to use**: When your business logic requires ORM model definitions and optional `RETURNING` objects, but you want to avoid per-row unit-of-work overhead.

#### Level 3: SQLAlchemy Core Bulk Insert (`conn.execute(insert(table), list_of_dicts)`) (Fast)
- **Mechanism**: Operates at the Core layer using `Table` metadata or `Model.__table__`. SQLAlchemy passes parameter dictionaries directly to the underlying DBAPI driver (`psycopg2`, `psycopg3`, `asyncpg`) using `cursor.executemany()` or multi-row compiled `VALUES (...), (...)` clauses.
- **Memory Overhead**: $O(\text{chunk size})$ raw dictionaries.
- **Throughput**: ~15,000 to 50,000 rows per second.
- **When to use**: High-performance API endpoints, bulk event recording, and scheduled ingestion jobs where ORM identity tracking is unnecessary.

#### Level 4: Database-Specific Streaming Loaders (PostgreSQL `COPY`) (Fastest)
- **Mechanism**: Utilizes PostgreSQL's native `COPY FROM STDIN` streaming protocol via raw DBAPI connections (`asyncpg.copy_records_to_table` or `psycopg.cursor().copy()`).
- **Engine Optimization**: Completely bypasses the database SQL parser, query planner, and per-statement transaction overhead. Data is written directly to disk storage pages.
- **Throughput**: ~150,000 to 500,000+ rows per second.
- **When to use**: Massive ETL pipelines, initial database seed migrations, and multi-gigabyte data imports.

---

### The Physics of Batching: Why Chunking is Mandatory

You cannot take 500,000 records and pass them in a single `conn.execute(insert(table), records)` call. Two hard physical boundaries enforce chunking:

1. **Database Bind Parameter Limits**:
   - PostgreSQL allows a maximum of **65,535** ($2^{16} - 1$) bind parameters per query.
   - If your table has 15 columns, inserting just 5,000 rows produces $5,000 \times 15 = 75,000$ bind parameters. Attempting this in a single multi-values statement crashes with:
     ```txt
     psycopg2.errors.ProgramLimitExceeded: cannot pass more than 65535 parameters
     ```
   - SQLite historically enforced a limit of 999 parameters (increased to 32,766 in version 3.32.0).
2. **Socket Buffer & Memory Thrashing**:
   - Compiling a multi-megabyte SQL string inside Python creates massive temporary string allocations and risks socket timeout disconnects.

**The Golden Rule of Batching**: Chunk your input dataset into batches of **1,000 to 10,000 rows** (or ensure $\text{batch\_size} \times \text{column\_count} \le 30,000$).

```txt
  Stream of 100,000 Dicts
           │
           ▼
  ┌──────────────────┐
  │ Chunk Generator  │ ──► Yields slices of 5,000 dicts
  └──────────────────┘
           │
     ┌─────┴─────────────────────────┐
     ▼                               ▼
[Batch 1: 5,000 rows]       [Batch 2: 5,000 rows]  ... (20 database round trips)
  conn.execute(insert)        conn.execute(insert)
```

---

## 4. Real Code — See It Working

Here is a complete, runnable script demonstrating all four tiers of bulk inserts using SQLAlchemy 2.0 and PostgreSQL/SQLite, including chunking generators and timing comparisons.

```python
import time
import itertools
from typing import Iterable, Generator, Dict, Any, List
from sqlalchemy import (
    create_engine,
    insert,
    select,
    Table,
    Column,
    Integer,
    String,
    Float,
    MetaData,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session

# ---------------------------------------------------------------------------
# 1. Schema Definition (SQLAlchemy 2.0 Declarative)
# ---------------------------------------------------------------------------
class Base(DeclarativeBase):
    pass

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[str] = mapped_column(String(255), nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False)

# Setup in-memory engine (or postgresql+psycopg:// for production)
engine = create_engine("sqlite:///:memory:", echo=False)
Base.metadata.create_all(engine)

# ---------------------------------------------------------------------------
# 2. Production Chunking Utility
# ---------------------------------------------------------------------------
def chunked_iterable(
    iterable: Iterable[Dict[str, Any]], 
    chunk_size: int = 5000
) -> Generator[List[Dict[str, Any]], None, None]:
    """
    Splits any large stream or generator into fixed-size lists.
    Prevents memory exhaustion and stays within database bind-parameter limits.
    """
    iterator = iter(iterable)
    while True:
        chunk = list(itertools.islice(iterator, chunk_size))
        if not chunk:
            break
        yield chunk

def generate_mock_data(total_rows: int) -> Generator[Dict[str, Any], None, None]:
    """Generates mock audit event dictionaries lazily without loading all into RAM."""
    for i in range(total_rows):
        yield {
            "user_id": i % 1000,
            "action": "USER_LOGIN" if i % 2 == 0 else "USER_LOGOUT",
            "payload": f"client_ip=192.168.1.{i % 255};status=OK",
            "latency_ms": (i % 50) + 0.12,
        }

# ---------------------------------------------------------------------------
# 3. Level 1: Standard ORM add_all (Anti-pattern for bulk)
# ---------------------------------------------------------------------------
def benchmark_orm_add_all(engine, num_rows: int = 5000):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    start = time.perf_counter()
    with Session(engine) as session:
        # Instantiating 5,000 ORM instances tracks them in the Identity Map
        instances = [
            AuditLog(
                user_id=d["user_id"],
                action=d["action"],
                payload=d["payload"],
                latency_ms=d["latency_ms"],
            )
            for d in generate_mock_data(num_rows)
        ]
        session.add_all(instances)
        session.commit()
    elapsed = time.perf_counter() - start
    print(f"[Level 1] ORM add_all:       {num_rows} rows in {elapsed:.3f}s ({num_rows/elapsed:.0f} rows/sec)")

# ---------------------------------------------------------------------------
# 4. Level 2: Modern 2.0 ORM Bulk Insert with session.execute(insert())
# ---------------------------------------------------------------------------
def benchmark_orm_bulk_20(engine, num_rows: int = 50000, chunk_size: int = 5000):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    start = time.perf_counter()
    with Session(engine) as session:
        # Bypasses ORM instance creation while still referencing the AuditLog model
        data_stream = generate_mock_data(num_rows)
        for chunk in chunked_iterable(data_stream, chunk_size=chunk_size):
            session.execute(insert(AuditLog), chunk)
        session.commit()
    elapsed = time.perf_counter() - start
    print(f"[Level 2] Modern ORM insert: {num_rows} rows in {elapsed:.3f}s ({num_rows/elapsed:.0f} rows/sec)")

# ---------------------------------------------------------------------------
# 5. Level 3: SQLAlchemy Core Bulk Insert (Direct Table metadata)
# ---------------------------------------------------------------------------
def benchmark_core_bulk(engine, num_rows: int = 50000, chunk_size: int = 5000):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    start = time.perf_counter()
    audit_table: Table = AuditLog.__table__
    
    with engine.begin() as conn:
        data_stream = generate_mock_data(num_rows)
        for chunk in chunked_iterable(data_stream, chunk_size=chunk_size):
            # Directly invokes DBAPI executemany with parameterized multi-values
            conn.execute(insert(audit_table), chunk)
            
    elapsed = time.perf_counter() - start
    print(f"[Level 3] Core insert():     {num_rows} rows in {elapsed:.3f}s ({num_rows/elapsed:.0f} rows/sec)")

# ---------------------------------------------------------------------------
# 6. Level 4: PostgreSQL Native COPY Pattern (Production Architecture)
# ---------------------------------------------------------------------------
def postgres_copy_from_buffer(pg_engine, csv_buffer, table_name: str, columns: List[str]):
    """
    High-performance Level 4 PostgreSQL ingestion pattern.
    Requires psycopg2 / psycopg3 raw connection.
    """
    raw_conn = pg_engine.raw_connection()
    try:
        with raw_conn.cursor() as cursor:
            # psycopg2 copy_expert streams raw CSV/TSV data directly to Postgres WAL
            sql = f"COPY {table_name} ({', '.join(columns)}) FROM STDIN WITH (FORMAT csv, HEADER false)"
            cursor.copy_expert(sql, csv_buffer)
        raw_conn.commit()
    finally:
        raw_conn.close()

# ---------------------------------------------------------------------------
# Run Benchmarks
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    benchmark_orm_add_all(engine, num_rows=5000)
    benchmark_orm_bulk_20(engine, num_rows=50000, chunk_size=5000)
    benchmark_core_bulk(engine, num_rows=50000, chunk_size=5000)
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the architectural difference between `session.add_all()` and SQLAlchemy 2.0's `session.execute(insert(Model), list_of_dicts)`?**

`session.add_all()` accepts hydrated Python class instances. When you pass objects to `session.add_all()`, SQLAlchemy inserts each object into its internal Identity Map, sets up attribute event tracking, and runs topological dependency checks during `session.flush()`. This creates $O(N)$ Python memory overhead and produces single-row `INSERT` statements unless specific batching conditions are met.

In contrast, `session.execute(insert(Model), list_of_dicts)` bypasses object hydration. You pass raw dictionaries that match column names. SQLAlchemy compiles the query into a single multi-row parameterized `INSERT INTO ... VALUES (), (), ()` or utilizes DBAPI `executemany`. No `InstanceState` wrappers are created, the Identity Map is untouched, and throughput increases by $10\times$ to $50\times$.

---

**Q: Why does passing a 100,000-item dictionary list to `conn.execute(insert(table), records)` fail in PostgreSQL?**

PostgreSQL has an engine-level limit of **65,535 ($2^{16} - 1$) bind parameters** in a single prepared statement. 

When SQLAlchemy compiles a multi-values insert statement for 100,000 rows across a table with 5 columns, it generates a query with $500,000$ bind parameters (`:param_1, :param_2, ... :param_500000`). The PostgreSQL backend immediately rejects this query with a parameter count overflow error.

To avoid this, you must partition the dataset into chunks of $1,000$ to $5,000$ rows before passing them to `conn.execute()`, ensuring the product of `chunk_size * number_of_columns` remains safely below 65,535.

---

**Q: How do you retrieve auto-generated IDs when performing bulk inserts in SQLAlchemy 2.0?**

In SQLAlchemy 2.0, you chain `.returning()` to the `insert()` construct:

```python
stmt = insert(User).returning(User.id, User.email)
result = session.execute(stmt, list_of_user_dicts)
inserted_rows = result.all()  # Returns list of (id, email) tuples
```

When using `session.scalars(insert(User).returning(User), list_of_user_dicts)`, SQLAlchemy uses the database's `RETURNING` clause to stream back returned columns and construct populated ORM instances without running individual `SELECT` queries. 

Note that SQLite support for `RETURNING` requires SQLite version 3.35.0+, while PostgreSQL has supported it natively since version 8.2. MySQL does not support `RETURNING` for multi-row inserts.

---

**Q: How do you implement high-speed Bulk Upserts (ON CONFLICT DO UPDATE) in SQLAlchemy 2.0?**

Bulk upserts are handled using dialect-specific insert constructs, such as `sqlalchemy.dialects.postgresql.insert`:

```python
from sqlalchemy.dialects.postgresql import insert as pg_insert

stmt = pg_insert(User)
upsert_stmt = stmt.on_conflict_do_update(
    index_elements=[User.email],  # Unique constraint column
    set_={
        "name": stmt.excluded.name,
        "updated_at": stmt.excluded.updated_at,
    }
)

with engine.begin() as conn:
    for chunk in chunked_iterable(records, chunk_size=5000):
        conn.execute(upsert_stmt, chunk)
```

The `stmt.excluded` namespace represents the incoming values proposed for insertion. By executing this statement with a list of dictionaries, PostgreSQL performs conflict resolution row-by-row inside the database engine within a single multi-row network round trip.

---

**Q: What is the fastest possible way to ingest 10,000,000 rows into PostgreSQL from Python, and what trade-offs does it introduce?**

The fastest approach is PostgreSQL's binary or CSV `COPY` protocol via `asyncpg.copy_records_to_table()` or `psycopg.cursor().copy()`.

**The Trade-offs**:
1. **No ORM Validation**: Python-level model validators, property setters, and `before_insert` lifecycle hooks are completely bypassed.
2. **Index and Trigger Tax**: Every active B-Tree index and foreign key constraint forces PostgreSQL to update index trees per row. For massive migrations (e.g., 10M rows), the standard production recipe is:
   - Drop non-primary indexes and foreign key constraints.
   - Stream data using `COPY`.
   - Recreate indexes concurrently (`CREATE INDEX CONCURRENTLY`).
   - Run `ANALYZE table_name` to update query planner table statistics.
3. **Transaction Rollback Size**: Streaming 10M rows in a single transaction generates tens of gigabytes of WAL. If the operation fails at row 9,999,999, rolling back takes significant time and I/O.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Assuming `insert().values(huge_list)` Automatically Batches
- **The Mistake**: Writing `conn.execute(insert(table).values(records))` where `records` contains 200,000 dicts.
- **Why It Fails**: SQLAlchemy does not guess chunk boundaries. It attempts to compile a single monolithic SQL statement containing millions of positional parameters, causing Python memory exhaustion, socket write timeouts, or DBAPI parameter overflow errors.
- **The Fix**: Wrap your collection or stream in a chunk generator (`chunked_iterable(records, chunk_size=5000)`) and execute within a single transaction loop.

---

### Trap 2: Missing Python-Side Defaults in Core Inserts
- **The Mistake**: Defining `created_at = Column(DateTime, default=datetime.utcnow)` and relying on it during Core bulk inserts: `conn.execute(insert(user_table), [{"name": "Alice"}])`.
- **Why It Fails**: A `default=func` parameter on a Column is a **Python-side** default executed by the ORM during instance compilation. When executing Core `insert()` with dictionaries, SQLAlchemy does not invoke Python-side default callbacks for missing keys in the dictionary. If the column is `NOT NULL` without a database-level `server_default=func.now()`, the query fails with a database `NotNullViolation`.
- **The Fix**: Always use `server_default=func.now()` for database-managed defaults, or ensure your dictionary generator explicitly includes all required keys before executing bulk statements.

---

### Trap 3: Executing Core Bulk Inserts inside an Active Dirty Session
- **The Mistake**: Modifying ORM objects in `session`, and then calling `session.connection().execute(insert(table), chunk)` without flushing.
- **Why It Fails**: The Core insert statement talks directly to the database connection over the current transaction. The database has not seen the dirty ORM objects sitting in `session.dirty`. If the bulk insert references foreign keys or updates rows that were modified only in Python memory, you encounter constraint violations or stale reads.
- **The Fix**: Explicitly call `session.flush()` before dropping down to Core connection operations, or keep bulk ingestion pipelines in isolated connection contexts.

---

### Trap 4: Memory Leaks from Materializing Generators
- **The Mistake**: Reading a 5GB CSV or JSON line file using `[json.loads(line) for line in f]` before passing it to the chunker.
- **Why It Fails**: Materializing a list of 5,000,000 dictionaries inside Python consumes 4GB+ of heap RAM before the first SQL statement is even generated.
- **The Fix**: Use Python generator functions (`(json.loads(line) for line in f)`) and pair them with `itertools.islice` so only one chunk of 5,000 items exists in memory at any given millisecond.

---

## 7. Compare With Related Concepts

| Mechanism | Abstraction Level | Memory Overhead | Relative Speed | Identity Map Hydration | Best Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`session.add()` in a loop** | High ORM | High ($O(N)$ objects) | $1\times$ (Baseline: ~100 rows/s) | Yes (Full tracking) | Single-record CRUD in API routes |
| **`session.add_all()`** | High ORM | High ($O(N)$ objects) | $2\times$ (~300–500 rows/s) | Yes (Full tracking) | Small cascades ($<50$ items) with child relationships |
| **`session.execute(insert(Model))`** | Modern 2.0 ORM | Low ($O(\text{chunk})$ dicts) | $20\times$ (~5,000–10,000 rows/s) | Optional (Only with `.returning()`) | Bulk operations needing ORM model validation/RETURNING |
| **`conn.execute(insert(Table))`** | SQLAlchemy Core | Minimal ($O(\text{chunk})$ dicts) | $50\times$ (~20,000–50,000 rows/s) | No (Bypasses ORM) | High-volume backend ingestion & audit pipelines |
| **PostgreSQL `COPY FROM STDIN`** | Database Driver / Native | Minimal (Stream buffer) | $500\times$ (~200,000+ rows/s) | No (Raw binary/text) | ETL pipelines, DB seeding, multi-million CSV imports |

---

### Bulk Insert vs Bulk Upsert vs Bulk Update

```txt
┌──────────────────────────┬──────────────────────────────────────────┬────────────────────────────────────────┐
│ OPERATION                │ SQL MECHANISM                            │ KEY TRADE-OFF                          │
├──────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────┤
│ Bulk Insert              │ INSERT INTO t (a,b) VALUES (), (), ()    │ Fails entirely on unique key collision │
├──────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────┤
│ Bulk Upsert              │ INSERT ... ON CONFLICT DO UPDATE /       │ Requires unique constraint; higher WAL │
│                          │ ON DUPLICATE KEY UPDATE                  │ lock overhead per row                  │
├──────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────┤
│ Bulk Update              │ UPDATE t SET val = v.val FROM (VALUES    │ Requires indexing on join keys; row-   │
│                          │ (...)) AS v WHERE t.id = v.id            │ lock contention during concurrent tx   │
└──────────────────────────┴──────────────────────────────────────────┴────────────────────────────────────────┘
```

---

## 8. 🧠 The Memory Hook

> **If you need tracking collars and passports, hire the ORM; if you need shipping crates, load Core `insert()`; if you need a firehose, open a `COPY` pipe. Never dispatch 100,000 couriers across town when you can lay down a pipeline in chunks of 5,000.**
