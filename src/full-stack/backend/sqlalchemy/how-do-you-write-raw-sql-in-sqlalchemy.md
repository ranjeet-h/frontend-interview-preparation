# Writing Raw SQL in SQLAlchemy 2.0: `text()`, Parameter Binding, and Result Mappings

## 1. Why This Exists — The Problem First

An Object-Relational Mapper (ORM) gives you productive abstractions: clean Python queries, automatic table joins, change tracking, and lifecycle management. In standard application flows, writing `select(User).where(User.is_active.is_(True))` is all you need.

Then your application scales, and production realities hit.

You are tasked with building a hierarchical organization rollup requiring a PostgreSQL recursive Common Table Expression (CTE), a complex reporting query with custom window framing (`ROWS BETWEEN 3 PRECEDING AND CURRENT ROW`), a vendor-specific `DISTINCT ON` clause, or a query requiring specific database query optimizer hints. The high-level ORM query builder either cannot cleanly express the syntax or generates an inefficient query plan with unnecessary table scans.

When developers hit this wall, junior or rushed engineers frequently reach for standard Python string formatting:

```python
# Fatal production mistake: SQL Injection and broken query plans
email_input = request.json.get("email")
query = f"SELECT * FROM users WHERE email = '{email_input}'"
session.execute(query)  # Crashes in SQLAlchemy 2.0, fatal vulnerability in 1.4
```

This approach introduces two severe failures:
1. **Catastrophic SQL Injection**: An input such as `admin@corp.com' OR '1'='1` bypasses authorization or allows attackers to execute arbitrary database commands.
2. **SQLAlchemy 2.0 Hard Failure**: SQLAlchemy 2.0 strictly disallows passing raw string primitives directly to `session.execute()` or `conn.execute()`. It requires an explicit executable clause construct to prevent accidental unparameterized execution.
3. **Data Hydration Fragility**: Developers consuming raw database rows often index values positionally by tuple index (`row[0]`, `row[3]`). The moment a database migration adds or reorders columns in the `SELECT` clause, downstream code silently assigns the wrong data types or corrupts application state.

SQLAlchemy provides the `text()` construct alongside parameter binding, result mappings (`result.mappings()`), and entity hydration (`from_statement()`) to solve this exact dilemma. It gives you the full, unconstrained power of raw SQL while retaining automated parameter sanitization, transaction management, and safe mapping into Python dictionaries or ORM models.

---

## 2. The Analogy — Make It Obvious

Think of an automated smart home control system versus a direct electrical breaker panel with safety interlocks.

```txt
┌────────────────────────────────────────────────────────────────────────┐
│                        Application Workload                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────┐                         ┌───────────────────────┐
│     Standard ORM      │                         │     Raw SQL text()    │
│  "Living Room On"     │                         │  Custom High-Voltage  │
│  Standard Switch      │                         │  Industrial Terminal  │
└──────────┬────────────┘                         └──────────┬────────────┘
           │                                                 │
           │ (Automated Protocol)                            │ (Safe Parameter Ports:
           │                                                 │  :user_id, :status)
           ▼                                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Main Circuit Panel & Power Grid (Database)               │
│               - Managed Transaction Boundary (Session / Unit of Work)  │
│               - Metering, Query Plan Caching, and Safety Relays        │
└────────────────────────────────────────────────────────────────────────┘
```

Most of the time, you tap predefined buttons on your smart home touchscreen: "Living Room Lights to 50%". The central controller (the ORM) handles the voltage steps, manages power state tracking (the Identity Map), and coordinates all connected appliances.

One day, you install a specialized 10,000-watt industrial laser for a stage show (a database-specific recursive CTE or custom window aggregation). The standard home automation screen has no button for it. You must tap directly into the main breaker panel.

- **String interpolation (`f"..."`)** is like stripping live high-voltage copper wires with your bare hands and jamming them into an open electrical socket. You cause an electrical fire that burns the building down (SQL injection).
- **SQLAlchemy's `text()` construct** is an industrial junction box with insulated, labeled terminal blocks (`:params`). You write the exact raw voltage commands you need, but every dynamic input is plugged into a protected, insulated port.
- The breaker panel (the Engine / Session) safely routes the current through the building's safety relays (transactions), tracks total power consumption (connection pooling), and delivers the output either as raw meter readings (`result.mappings()`) or directly feeds the data back into your home console as recognized smart appliances (`from_statement()` ORM models).

---

## 3. How It Actually Works — The Full Explanation

### The `text()` Construct as an Executable Expression

In SQLAlchemy 2.0, execution methods require an explicit `Executable` object. Passing a raw Python string to `session.execute("SELECT 1")` raises an `ArgumentError`.

When you wrap a SQL string with `text("SELECT * FROM users WHERE id = :id")`, SQLAlchemy parses the string into a `TextClause`. This object integrates directly into SQLAlchemy's compilation and execution pipeline:
- It identifies named bind parameter placeholders prefixed with a colon (`:param_name`).
- It allows the underlying database dialect (e.g., PostgreSQL, SQLite, MySQL, Oracle) to translate parameter placeholders into the database driver's native wire format (`%s` for `psycopg2`/`psycopg`, `?` for `sqlite3`, `$1` for `asyncpg`).
- It enables database engines to compile and cache the query execution plan once and reuse it across different parameter values, improving database throughput.

### Safe Parameter Binding

Parameter binding ensures user inputs are never parsed as SQL syntax. SQLAlchemy sends the SQL statement structure and the parameter payload across separate channels to the DBAPI driver:

```txt
Client Code
  │
  ├── 1. SQL Template ────► text("SELECT * FROM users WHERE email = :email")
  └── 2. Parameter Dict ──► {"email": "user@example.com"}
        │
        ▼
   DBAPI Driver (psycopg/sqlite3) ──► Sends Query Structure & Binds Separately
        │
        ▼
   Database Engine (PostgreSQL/SQLite)
   - Parses & prepares query plan
   - Evaluates :email strictly as literal data
   - SQL Injection is mathematically impossible
```

You bind parameters in two primary ways:

1. **Passing a parameter dictionary at execution time**:
   ```python
   session.execute(
       text("SELECT * FROM users WHERE status = :status AND role = :role"),
       {"status": "active", "role": "admin"},
   )
   ```
2. **Binding parameters directly on the `TextClause` via `.bindparams()`**:
   ```python
   stmt = text(
       "SELECT * FROM users WHERE id = :user_id"
   ).bindparams(user_id=42)
   session.execute(stmt)
   ```

#### Handling Dynamic `IN` Clauses with `expanding=True`

Standard SQL cannot bind a Python list directly to a single parameter placeholder like `:ids` because SQL syntax expects a comma-separated list of individual placeholders (`IN (?, ?, ?)`).

SQLAlchemy solves this cleanly using `bindparam("ids", expanding=True)`:

```python
stmt = text(
    "SELECT id, email FROM users WHERE id IN :user_ids"
).bindparams(bindparam("user_ids", expanding=True))

result = session.execute(stmt, {"user_ids": [10, 20, 30]})
```
At runtime, SQLAlchemy inspects the length of the list and dynamically expands `:user_ids` into `:user_ids_1, :user_ids_2, :user_ids_3` while maintaining parameter safety.

### Result Consumption & Mapping Mechanics

When `session.execute(text(...))` executes, it returns a `CursorResult`. Consuming rows correctly is vital for application stability:

```txt
                           CursorResult
                                │
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
  result.all()          result.scalars()        result.mappings()
  List of `Row`         First column only       List of `RowMapping`
  tuples (row[0],       (IDs, counts, or        dict-like access
  row.email)            single values)          (row["email"])
```

1. **`result.all()`**: Returns a list of `Row` objects. `Row` behaves like a named tuple supporting positional indexing (`row[0]`) and attribute lookup (`row.email`).
2. **`result.scalars()`**: Extracts the first column of every row. Used for scalar queries like `SELECT count(*) FROM users` or `SELECT email FROM users`.
3. **`result.mappings()`**: Returns a `MappingResult` where each row is accessible as a `RowMapping` (a read-only dictionary-like interface).
   - Accessing columns by name (`row["email"]`) eliminates ordering bugs.
   - You can convert mappings directly into standard Python dictionaries (`dict(row)`) for immediate serialization into Pydantic models or JSON responses.
4. **Result Cardinality Helpers**:
   - `result.first()`: Returns the first row or `None`.
   - `result.one()`: Returns exactly one row. Raises `NoResultFound` if empty, or `MultipleResultsFound` if more than one row matched.
   - `result.one_or_none()`: Returns one row or `None`. Raises `MultipleResultsFound` if multiple rows matched.
5. **Column Typing via `.columns()`**:
   If raw SQL returns custom datatypes (like JSON, UUIDs, or Timestamps) that need SQLAlchemy type processing, you can attach column definitions:
   ```python
   stmt = text("SELECT id, metadata FROM logs").columns(
       id=Integer, metadata=JSON
   )
   ```

### Execution Boundaries: Core Connection vs ORM Session

Understanding the difference between executing raw SQL on a Core `Connection` versus an ORM `Session` determines transaction safety and overhead:

| Dimension | Core Connection (`engine.connect()` / `engine.begin()`) | ORM Session (`Session(engine)`) |
|---|---|---|
| **Target Use Case** | DDL migrations, high-throughput batch ETL, maintenance scripts. | Application business logic, transactional domain operations. |
| **Unit of Work** | Bypassed. Zero in-memory state or object tracking. | Integrated. Flushes dirty ORM objects before query execution. |
| **Transaction Model** | `engine.begin()` commits on context exit. `engine.connect()` requires manual `conn.commit()`. | Managed transaction. Requires `session.commit()` under "commit-as-you-go". |
| **Memory Overhead** | Minimal. Direct stream from the database cursor. | Moderate. Tracks session identity map and unit of work state. |

### Returning Full ORM Entities from Raw SQL (`from_statement`)

When you write complex raw SQL (such as a recursive hierarchy query) but still want full ORM model instances with relationship navigation, methods, and change tracking, use `select(Model).from_statement()`:

```python
# Raw SQL statement
raw_stmt = text("""
    WITH RECURSIVE org_tree AS (
        SELECT id, name, manager_id FROM employees WHERE id = :root_id
        UNION ALL
        SELECT e.id, e.name, e.manager_id
        FROM employees e
        INNER JOIN org_tree ot ON e.manager_id = ot.id
    )
    SELECT id, name, manager_id FROM org_tree
""")

# Hydrate directly into Employee ORM instances
employees = session.scalars(
    select(Employee).from_statement(raw_stmt),
    {"root_id": 1}
).all()
```

SQLAlchemy passes the raw SQL to the database, extracts the columns matching the mapped attributes of `Employee`, hydrates real Python `Employee` objects, registers them in the session's Identity Map, and attaches them to the current transaction.

---

## 4. Real Code — See It Working

Here is a complete, production-ready implementation demonstrating parameter binding, `expanding=True`, result mappings, Core DDL execution, and ORM entity hydration with SQLAlchemy 2.0.

```python
"""
SQLAlchemy 2.0 Raw SQL Mechanics Demonstration
Covers: text(), bindparams, expanding IN, mappings(), Core execution, and from_statement().
"""

from typing import List, Optional
from sqlalchemy import (
    create_engine,
    text,
    select,
    bindparam,
    Integer,
    String,
    ForeignKey,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    Session,
    relationship,
)


# --- 1. Model Definitions (SQLAlchemy 2.0 Syntax) ---

class Base(DeclarativeBase):
    pass


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    salary: Mapped[int] = mapped_column(Integer, nullable=False)
    manager_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("employees.id"), nullable=True
    )

    # Self-referential relationship
    subordinates: Mapped[List["Employee"]] = relationship(
        "Employee", backref="manager", remote_side=[id]
    )

    def __repr__(self) -> str:
        return f"<Employee(id={self.id}, name='{self.name}', role='{self.role}')>"


# --- 2. Database Initialization ---

# Using an in-memory SQLite engine for reproducible execution
engine = create_engine("sqlite:///:memory:", echo=False)
Base.metadata.create_all(engine)


# --- 3. Core Connection Execution (DDL / Direct Inserts) ---

def seed_database_via_core() -> None:
    """
    Demonstrates executing DDL and batch DML via a low-level Core connection
    using engine.begin() for automatic transaction management.
    """
    with engine.begin() as conn:
        # Batch insert with parameterized text clause
        insert_stmt = text("""
            INSERT INTO employees (id, name, role, salary, manager_id)
            VALUES (:id, :name, :role, :salary, :manager_id)
        """)

        # Passing a list of parameter dictionaries executes a batch executemany
        conn.execute(
            insert_stmt,
            [
                {"id": 1, "name": "Elena Rostova", "role": "VP of Engineering", "salary": 220000, "manager_id": None},
                {"id": 2, "name": "Marcus Chen", "role": "Staff Engineer", "salary": 180000, "manager_id": 1},
                {"id": 3, "name": "Sarah Miller", "role": "Senior Engineer", "salary": 150000, "manager_id": 2},
                {"id": 4, "name": "David Kim", "role": "Senior Engineer", "salary": 145000, "manager_id": 2},
                {"id": 5, "name": "Priya Patel", "role": "Infrastructure Lead", "salary": 190000, "manager_id": 1},
            ],
        )


# --- 4. Parameterized Raw SQL & Result Mappings ---

def query_high_earners(min_salary: int) -> List[dict]:
    """
    Demonstrates safe parameter binding with text() and converting
    rows to dictionary mappings via result.mappings().
    """
    with Session(engine) as session:
        stmt = text("""
            SELECT id, name, role, salary
            FROM employees
            WHERE salary >= :min_salary
            ORDER BY salary DESC
        """)

        # Execute with parameter dictionary
        result = session.execute(stmt, {"min_salary": min_salary})

        # result.mappings() returns dict-like RowMapping objects
        # We can unpack each row directly into standard Python dictionaries
        return [dict(row) for row in result.mappings()]


# --- 5. Expanding IN Clause for Dynamic Collections ---

def query_by_employee_ids(ids: List[int]) -> List[dict]:
    """
    Demonstrates bindparam with expanding=True to safely pass a variable-length list.
    """
    with Session(engine) as session:
        stmt = text("""
            SELECT id, name, role
            FROM employees
            WHERE id IN :emp_ids
            ORDER BY id ASC
        """).bindparams(bindparam("emp_ids", expanding=True))

        result = session.execute(stmt, {"emp_ids": ids})
        return [dict(row) for row in result.mappings()]


# --- 6. ORM Entity Hydration from Complex Raw SQL (Recursive CTE) ---

def get_reporting_tree_as_orm_models(root_manager_id: int) -> List[Employee]:
    """
    Executes a raw Recursive CTE and hydrates the results into fully managed
    ORM Employee instances using select(Model).from_statement().
    """
    with Session(engine) as session:
        recursive_cte = text("""
            WITH RECURSIVE management_chain AS (
                -- Base case: the root manager
                SELECT id, name, role, salary, manager_id
                FROM employees
                WHERE id = :root_id

                UNION ALL

                -- Recursive case: find all direct and indirect reports
                SELECT e.id, e.name, e.role, e.salary, e.manager_id
                FROM employees e
                INNER JOIN management_chain mc ON e.manager_id = mc.id
            )
            SELECT id, name, role, salary, manager_id
            FROM management_chain
        """)

        # from_statement routes raw SQL rows through the ORM hydration pipeline
        stmt = select(Employee).from_statement(recursive_cte)

        # session.scalars() unpacks the Employee model instances
        employees = session.scalars(stmt, {"root_id": root_manager_id}).all()
        return list(employees)


# --- 7. Execution and Verification ---

if __name__ == "__main__":
    # Seed the database
    seed_database_via_core()

    # 1. Test parameter binding and mappings
    print("--- High Earners (Salary >= 180,000) ---")
    high_earners = query_high_earners(180000)
    for emp in high_earners:
        print(f"ID: {emp['id']} | Name: {emp['name']} | Role: {emp['role']} | Salary: ${emp['salary']:,}")

    # 2. Test expanding list binding
    print("\n--- Filter by ID list [1, 3, 5] ---")
    selected_emps = query_by_employee_ids([1, 3, 5])
    for emp in selected_emps:
        print(f"ID: {emp['id']} | Name: {emp['name']} | Role: {emp['role']}")

    # 3. Test ORM Hydration via Recursive CTE
    print("\n--- Recursive Reporting Tree for Root Manager (ID: 1) ---")
    reporting_chain = get_reporting_tree_as_orm_models(root_manager_id=1)
    for member in reporting_chain:
        # Objects are true ORM entities with active attributes
        print(f"Hydrated Entity: {member} (Manager ID: {member.manager_id})")
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does SQLAlchemy 2.0 require wrapping raw SQL strings in `text()` instead of accepting plain strings in `execute()`?**

In SQLAlchemy 1.x, methods like `engine.execute("SELECT 1")` accepted plain string literals. This created design ambiguities: strings could not be distinguished from compiled clause elements, parameter parsing was inconsistent across different backends, and developers accidentally bypassed query compilation steps.

SQLAlchemy 2.0 enforces a unified, typed execution architecture where `session.execute()` and `conn.execute()` accept only instances of `Executable` (such as `Select`, `Insert`, `Update`, or `TextClause`). Wrapping your SQL in `text()` explicitly constructs a `TextClause`. This ensures every statement undergoes explicit bind parameter extraction, supports dialect-specific compilation (such as translating `:param` into `$1` or `?`), and participates in SQLAlchemy's execution hooks and caching systems.

---

**Q: How do you safely pass a Python list to an `IN (:ids)` clause in raw SQL without string formatting?**

Standard SQL grammar does not allow binding a single array or list directly to a scalar bind parameter in an `IN` clause. Attempting to pass `{"ids": [1, 2, 3]}` to `WHERE id IN :ids` causes DBAPI driver errors because the database expects multiple distinct placeholders (e.g., `WHERE id IN (?, ?, ?)`).

In SQLAlchemy, you declare the parameter as expanding using `bindparam()`:

```python
stmt = text(
    "SELECT * FROM users WHERE id IN :user_ids"
).bindparams(bindparam("user_ids", expanding=True))

result = session.execute(stmt, {"user_ids": [1, 2, 3]})
```

When compiled at execution time, SQLAlchemy inspects the length of the list, generates the corresponding number of positional or named bind parameters under the hood, and binds each element individually. If an empty list `[]` is passed, SQLAlchemy safely renders an empty-set expression (such as `SELECT 1 WHERE 1!=1`) to prevent database syntax errors.

---

**Q: What is the difference between `result.scalars()`, `result.all()`, and `result.mappings()` when consuming raw SQL results?**

When you execute a query, SQLAlchemy returns a `CursorResult`. The method you call determines how rows are structured:

1. `result.all()` returns a list of `Row` objects. Each `Row` acts like a named tuple with positional access (`row[0]`) and attribute access (`row.email`).
2. `result.scalars()` pulls the first column value from every row and returns a `ScalarResult`. If your query is `SELECT count(*) FROM users` or `SELECT id FROM users`, `scalars().all()` yields a list of integers rather than single-element tuples `[(1,), (2,)]`.
3. `result.mappings()` transforms the result set into a `MappingResult`, where every row is a `RowMapping` (a dict-like key-value structure). This is the safest way to consume multi-column raw SQL because it decouples application code from column position in the `SELECT` list and allows instant conversion to dictionaries (`dict(row)`).

---

**Q: How does executing raw SQL through `session.execute()` interact with the ORM Identity Map and pending in-memory changes?**

When you execute raw SQL via `session.execute(text(...))`:
1. **Autoflush**: By default, the session triggers an autoflush before executing the statement. Any pending in-memory insertions, updates, or deletions are written to the database transaction first so the raw SQL query sees the latest state.
2. **Identity Map Bypass for DML**: If your raw SQL executes an `UPDATE` or `DELETE` statement (e.g., `text("UPDATE users SET status = 'inactive' WHERE id = :id")`), the query runs directly in the database. However, **the session's Identity Map is not updated**. If you have an in-memory `User` instance already loaded with `id=1`, its `user.status` remains unchanged in Python memory.
3. **Mitigation**: To synchronize in-memory objects after running raw DML, you must call `session.expire(user)` to force a reload on next access, or `session.expire_all()` to invalidate the entire session cache.

---

**Q: How can you execute a database-specific raw SQL query and return fully tracked ORM model instances instead of raw row tuples?**

You use `select(Model).from_statement(text(...))` executed via `session.scalars()`:

```python
stmt = select(User).from_statement(
    text("SELECT * FROM users WHERE custom_search_vector @@ to_tsquery(:q)")
)
users = session.scalars(stmt, {"q": "backend & architect"}).all()
```

SQLAlchemy passes the raw SQL string directly to the database. The returned rows are then routed through the ORM mapper, which matches column names to mapped attributes, constructs genuine `User` instances, records them in the Identity Map, and attaches them to the active session.

---

**Q: When should you execute raw SQL using `engine.begin()` (Core) versus `Session.execute()` (ORM)?**

Use `engine.begin()` / `engine.connect()` when:
- Executing DDL statements (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`).
- Running batch ETL or bulk data migration scripts where ORM overhead (Identity Map, autoflush, object creation) creates memory pressure.
- Performing fast health checks (e.g., `SELECT 1`) in connection pools or readiness probes.

Use `Session.execute()` when:
- The query is part of an ongoing business transaction involving ORM entities.
- You need the query to see uncommitted in-memory changes via autoflush.
- You are hydrating ORM models via `from_statement()`.

---

## 6. The Traps — What Goes Wrong

### Trap 1: The PostgreSQL Double-Colon Typecast Collision (`::type`)

In PostgreSQL, typecasting is frequently written using double colons: `SELECT payload::jsonb` or `SELECT created_at::date`.

In SQLAlchemy's `text()` construct, a colon indicates a named bind parameter. When SQLAlchemy sees `::jsonb`, it attempts to parse `:jsonb` as a bind parameter name. If no parameter named `jsonb` is passed, SQLAlchemy crashes with `KeyError: 'jsonb'` or fails during statement compilation.

```python
# ❌ BROKEN: SQLAlchemy treats :jsonb as a bind parameter
stmt = text("SELECT id, data::jsonb FROM events WHERE id = :id")
session.execute(stmt, {"id": 1})  # Raises KeyError / StatementError!

# ✅ FIX 1: Escape the double colon with backslashes
stmt = text("SELECT id, data\\:\\:jsonb FROM events WHERE id = :id")
session.execute(stmt, {"id": 1})

# ✅ FIX 2: Use ANSI standard CAST syntax
stmt = text("SELECT id, CAST(data AS jsonb) FROM events WHERE id = :id")
session.execute(stmt, {"id": 1})
```

---

### Trap 2: Lost Writes Due to the Removal of 1.x Autocommit

In SQLAlchemy 1.x, executing raw DML on an engine or connection sometimes auto-committed depending on dialect settings. In SQLAlchemy 2.0, "commit-as-you-go" is the universal rule. Transactions do not commit automatically.

```python
# ❌ BROKEN: Changes are rolled back when the session context exits
with Session(engine) as session:
    session.execute(
        text("UPDATE accounts SET balance = balance + 100 WHERE id = :id"),
        {"id": 42},
    )
# Context closes -> transaction is rolled back -> balance change is lost!

# ✅ FIX: Explicitly commit the transaction
with Session(engine) as session:
    session.execute(
        text("UPDATE accounts SET balance = balance + 100 WHERE id = :id"),
        {"id": 42},
    )
    session.commit()

# ✅ OR use engine.begin() for Core connections
with engine.begin() as conn:
    conn.execute(
        text("UPDATE accounts SET balance = balance + 100 WHERE id = :id"),
        {"id": 42},
    )
    # Automatically commits on successful exit
```

---

### Trap 3: In-Memory State De-synchronization After Raw DML

Executing raw `UPDATE` or `DELETE` statements modifies database rows directly on the connection, completely bypassing the session's in-memory model instances.

```python
with Session(engine) as session:
    user = session.get(User, 1)
    print(user.role)  # "editor"

    # Raw SQL updates the database row directly
    session.execute(
        text("UPDATE users SET role = 'admin' WHERE id = :id"),
        {"id": 1},
    )
    session.commit()

    # ❌ PITFALL: The in-memory user object still holds the stale "editor" value!
    print(user.role)  # Still prints "editor"!

    # ✅ FIX: Expire the object so SQLAlchemy refreshes it from the database
    session.expire(user)
    print(user.role)  # Correctly fetches and prints "admin"
```

---

### Trap 4: Tuple Index Drift in Multi-Column Queries

Relying on positional tuple indexing (`row[0]`, `row[1]`) breaks silently during refactoring or schema updates.

```python
# Query originally: SELECT id, email FROM users
row = session.execute(text("SELECT id, email FROM users")).first()
email = row[1]  # Works today

# Later, someone updates the query to: SELECT id, username, email FROM users
# ❌ SILENT CORRUPTION: row[1] is now the username, not the email!
row = session.execute(text("SELECT id, username, email FROM users")).first()
email = row[1]  # Contains username!

# ✅ FIX: Always consume via result.mappings()
result = session.execute(text("SELECT id, username, email FROM users"))
for row in result.mappings():
    email = row["email"]  # Always correct regardless of column position
```

---

## 7. Compare With Related Concepts

### `text()` Raw SQL vs ORM `select()` vs Core SQL Expression Language

| Feature | `text("SELECT ...")` | ORM `select(Model)` | Core `table.select()` |
|---|---|---|---|
| **Syntax Style** | Plain SQL string wrapped in `text()`. | Pythonic object-oriented builder. | Relational algebra Python builder (`table.c.col`). |
| **Type Safety & Autocomplete** | None (plain SQL in string). | High (IDE autocomplete on model attributes). | Moderate (table column references). |
| **Dialect Portability** | Low (uses engine-specific SQL features). | High (SQLAlchemy translates to any target database). | High (abstract AST compiled per dialect). |
| **Complex / Proprietary SQL Support** | Maximum (any valid SQL supported by the database engine). | Moderate (restricted to supported ORM constructs). | High (supports most SQL clauses via functions). |
| **Result Type** | `CursorResult` (tuples/mappings). | `ScalarResult` (hydrated ORM model instances). | `CursorResult` (table rows). |
| **When to Choose** | Complex vendor CTEs, window frames, optimizer hints, or emergency hotfix queries. | Standard CRUD, domain entities, business transactions. | Dynamic query builders, migrations, non-ORM data pipelines. |

---

### `result.mappings()` vs `select(Model).from_statement(text(...))`

| Dimension | `result.mappings()` | `select(Model).from_statement(...)` |
|---|---|---|
| **Return Value** | `RowMapping` (dict-like key/value objects). | Full ORM Model instances (`User`, `Order`). |
| **Session Overhead** | Zero. Pure read-only data structures. | Standard ORM overhead (Identity Map registration). |
| **Change Tracking** | No. Modifying a dict does not generate updates. | Yes. Modifying attributes tracks changes for `session.commit()`. |
| **Relationship Navigation** | No. Cannot lazy-load child collections. | Yes. Standard relationships can be accessed. |
| **When to Choose** | High-performance reporting, read-only API endpoints, fast JSON serialization. | Complex raw queries that need downstream ORM updates or relationship traversal. |

---

## 8. 🧠 The Memory Hook

> **Wrap in `text()`, bind dicts for `:params`, expand lists with `expanding=True`, consume with `.mappings()` for dicts or `.from_statement()` for models. Escape double colons (`\\:\\:`) in Postgres, and remember: raw DML bypasses the Identity Map until you `expire()`.**
