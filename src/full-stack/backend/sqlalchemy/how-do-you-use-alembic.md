# Using Alembic with SQLAlchemy: Environment Setup, Configuration, and Async Migration Architecture

## 1. Why This Exists — The Problem First

When you build a greenfield SQLAlchemy service, you write your Python models, invoke `await conn.run_sync(Base.metadata.create_all)` inside your application startup hook, and everything feels complete. On day one with an empty database, `create_all()` creates all your tables cleanly.

Then comes month two in production. You have 100,000 active users and millions of rows. Your product team needs to add a `stripe_customer_id` column to the `users` table, add a unique index on `email`, and change an `account_status` column from `VARCHAR(20)` to a PostgreSQL `ENUM`.

You update your Python model definitions, commit to `main`, and deploy to production. You restart the backend containers, expecting SQLAlchemy to sync the database schema.

Nothing happens.

`Base.metadata.create_all()` queries the database catalog to check if a table name already exists. If the table exists, it skips it entirely. It will never issue an `ALTER TABLE`, it will never add a new column, and it will never alter a data type or index on an existing table. The moment incoming HTTP requests hit your new code, your application crashes with `UndefinedColumn: column users.stripe_customer_id does not exist`.

Desperate to restore service, an engineer connects directly to the production database via `psql` and runs a manual `ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR;`. But they forget to document it. The staging database never gets the change. A teammate working locally adds a different constraint with the same name. Within two weeks, local development, staging, and production have completely drifted apart. Nobody knows what state the database is actually in, automated tests pass locally but fail in CI, and deploying new code becomes a high-risk gamble.

Alembic exists because databases are stateful, long-lived infrastructure. You cannot manage evolving schemas through application startup hooks or unversioned manual SQL scripts. You need database schema changes tracked as deterministic, version-controlled migration scripts that can move schemas forward, roll them back, and synchronize across environments safely.

## 2. The Analogy — Make It Obvious

Think of Alembic as Git, but specifically built for your database schema.

When managing code with Git, you do not copy-paste raw files onto servers and hope they match. You maintain a linear chain of commits. Every commit has a unique SHA identifier, a reference to the commit that came before it (`parent`), and an exact diff (`+` additions, `-` deletions) describing how to move forward to the new state or revert backward to the previous state. A pointer called `HEAD` records where you currently are in that history.

Alembic mirrors this architecture 1-to-1:

1. **Migration Files are Commits:** Every migration file inside `alembic/versions/` is an immutable schema commit. It has a unique revision hash (`revision = 'b4f1c8...'`) and points directly to its parent (`down_revision = 'a3e2d1...'`).
2. **The `upgrade()` Function is the Forward Diff:** This contains the exact operations (`op.add_column`, `op.create_table`) needed to move the database schema from `down_revision` forward to `revision`.
3. **The `downgrade()` Function is the Reverse Diff:** This contains the exact inverse operations (`op.drop_column`, `op.drop_table`) needed to roll the schema backward from `revision` back to `down_revision`.
4. **The `alembic_version` Table is the `HEAD` Pointer:** Instead of guessing what version the database is running, Alembic creates a dedicated table in your database containing a single column and single row: the current revision hash.

When you run `alembic upgrade head`, Alembic reads the revision hash stored in `alembic_version`, inspects the chain of migration files on disk, calculates the path from the database's current position to the latest file, and runs each `upgrade()` step in sequential order inside a database transaction.

## 3. How It Actually Works — The Full Explanation

Alembic coordinates schema evolution across your Python codebase and live databases through four core components: configuration files, execution bridges, migration scripts, and an in-database state ledger.

**1. The alembic.ini Configuration File**

The `alembic.ini` file is the entry point for the Alembic CLI. It defines high-level settings such as:
- `script_location`: The directory where migration scripts and the environment runner live (typically `alembic`).
- `file_template`: The naming format for generated revision files (for example, `%%(year)d_%%(month).2d_%%(day).2d_%%(rev)s_%%(slug)s`).
- `sqlalchemy.url`: The fallback database connection string. In production applications, you should never hardcode credentials here; instead, you override this setting dynamically inside `env.py` using application settings or environment variables.

**2. The env.py Execution Bridge**

Every time you execute an Alembic command in your terminal (`alembic upgrade`, `alembic revision`), Alembic executes `alembic/env.py`. This script is the bridge connecting Alembic's migration engine to your application's SQLAlchemy metadata.

The two most critical responsibilities of `env.py` are:
- Registering Metadata: You import your application's `Base` model and assign `target_metadata = Base.metadata`. This allows Alembic to inspect your Python classes and compare them against the database.
- Orchestrating Migration Modes: `env.py` defines two distinct modes of execution:
  - **Offline Mode (`run_migrations_offline`):** Runs when the `--sql` flag is passed. Alembic does not connect to the database. Instead, it inspects migration files and writes raw, dialect-specific SQL DDL statements directly to `stdout` or a file. This is essential for enterprise deployments where DBAs must review and approve raw SQL before execution.
  - **Online Mode (`run_migrations_online`):** Opens a real database connection, acquires locks, inspects the `alembic_version` table, and applies DDL directly within transactional boundaries.

**3. Async Alembic Architecture in SQLAlchemy 2.0**

Modern backend applications built with FastAPI and SQLAlchemy 2.0 use asynchronous database drivers such as `asyncpg` or `aiomysql`. However, Alembic's internal migration operations (`op.create_table`, `op.add_column`) are synchronous DDL function calls.

To bridge this gap without running two separate database configurations:
- Alembic uses `async_engine_from_config` or `create_async_engine` to build an `AsyncEngine`.
- An event loop is started with `asyncio.run(run_async_migrations())`.
- Inside `run_async_migrations()`, an asynchronous connection is established via `async with connectable.connect() as connection:`.
- Alembic invokes `await connection.run_sync(do_run_migrations)`. The `run_sync` helper allows synchronous migration operations (`context.run_migrations()`) to run against the underlying raw connection without blocking the async event loop.

**4. Migration File Anatomy and Dependency Graphs**

When a migration is created, Alembic writes a new Python script into `alembic/versions/`. Every file contains:
- `revision`: A unique string identifier (e.g., `'1a2b3c4d5e6f'`).
- `down_revision`: The revision string of the parent migration (or `None` if it is the base migration).
- `branch_labels` and `depends_on`: Optional pointers used for managing complex branches and merges across teams.
- `def upgrade() -> None`: The forward migration operations using the `alembic.op` module.
- `def downgrade() -> None`: The reverse migration operations.

These parent-child references form a Directed Acyclic Graph (DAG). Alembic walks this graph to determine the exact sequence of SQL operations required to travel between any two points in your migration history.

**5. The alembic_version Database Table**

When Alembic executes its first migration against a target database, it creates a table:

```sql
CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);
```

This table holds exactly one row representing the active `HEAD` revision hash. When you run `alembic upgrade head`, Alembic:
1. Queries `SELECT version_num FROM alembic_version;`.
2. Locates the active revision in its local DAG on disk.
3. Identifies all unapplied migrations between the active revision and the DAG leaf (`head`).
4. Wraps each migration's `upgrade()` call in a transaction, executes the DDL, and updates `version_num` upon commit.

**6. Autogenerate Diffing Mechanics**

When you execute `alembic revision --autogenerate -m "add_columns"`, Alembic performs live schema comparison:
1. It connects to the database and uses SQLAlchemy's schema reflection (`Inspector`) to inspect existing tables, columns, constraints, and indexes.
2. It reads `target_metadata` from `env.py` to inspect what your Python models declare.
3. It computes the diff and generates corresponding `op.create_table`, `op.add_column`, or `op.drop_column` calls.

Autogenerate is a diffing tool, not a psychic engine. It reliably detects added/removed tables, added/removed columns, and nullability changes. However, it cannot distinguish a column rename from a drop-and-add (it will drop the old column with all its data and create a new empty one), nor does it detect custom check constraints or table renames unless manually adjusted.

**7. Essential CLI Command Workflow**

- `alembic init -t async alembic`: Initializes an async-ready migration environment with template files.
- `alembic revision --autogenerate -m "create user table"`: Inspects model diffs and generates a new migration file.
- `alembic revision -m "backfill legacy customer ids"`: Generates an empty migration template for manual DDL or data manipulation.
- `alembic upgrade head`: Migrates the database to the latest available revision.
- `alembic upgrade +1`: Advances the database forward by exactly one revision.
- `alembic downgrade -1`: Rolls the database backward by exactly one revision.
- `alembic downgrade base`: Reverts all migrations back to a completely blank database.
- `alembic current`: Inspects and displays the revision hash currently recorded in `alembic_version`.
- `alembic history --verbose`: Displays the full revision history chain including revision hashes, down-revisions, and messages.
- `alembic merge heads -m "merge branch heads"`: Generates a merge revision joining two conflicting branch heads created by concurrent git merges.

## 4. Real Code — See It Working

Here is a complete, production-ready async Alembic architecture for PostgreSQL and SQLAlchemy 2.0.

**1. Declarative Base with Explicit Naming Conventions (`app/models/base.py`)**

PostgreSQL generates auto-named constraints (like indexes, foreign keys, and unique checks) with arbitrary names unless explicitly configured. Without standardized names, Alembic cannot reliably generate `op.drop_constraint()` calls across different environments. Defining a naming convention on your metadata fixes this permanently.

```python
from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Explicit naming convention prevents anonymous constraint errors during drops
POSTGRES_NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=POSTGRES_NAMING_CONVENTION)

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    full_name: Mapped[str] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
```

**2. Production Async `alembic/env.py`**

This `env.py` dynamically resolves the database connection string from environment variables, configures model reflection metadata, supports offline SQL generation, and bridges synchronous DDL execution over an asyncpg connection pool.

```python
import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Import your application's declarative Base (and ensure all models are imported)
from app.models.base import Base

# Alembic Config object provides access to alembic.ini values
config = context.config

# Interpret the config file for Python logging if present
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Provide Alembic access to our model metadata for autogenerate support
target_metadata = Base.metadata

def get_database_url() -> str:
    """
    Fetch the database URL from environment variables in production,
    falling back to alembic.ini for local development.
    """
    return os.getenv(
        "DATABASE_URL",
        config.get_main_option(
            "sqlalchemy.url",
            "postgresql+asyncpg://postgres:postgres@localhost:5432/production_db",
        ),
    )

def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode (--sql flag).
    Generates raw SQL statements without opening a live database connection.
    """
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,  # Detect column type modifications
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection: Connection) -> None:
    """
    Synchronous callback executed inside connection.run_sync().
    Configures the Alembic context on the underlying DBAPI connection.
    """
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    """
    Create an AsyncEngine, acquire an async connection, and delegate
    DDL execution to the synchronous runner via run_sync.
    """
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_database_url()

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # NullPool ensures migrations do not hold idle connections
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode using the async event loop."""
    asyncio.run(run_async_migrations())

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

**3. Curated Migration File with Safe Data Backfill (`alembic/versions/20260826_add_tier_to_users.py`)**

This script demonstrates adding a column, running a safe batched data backfill, altering the column to `NOT NULL`, and providing an exact rollback implementation.

```python
"""add tier column to users with data backfill

Revision ID: 7c8d9e0f1a2b
Revises: 1a2b3c4d5e6f
Create Date: 2026-08-26 14:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# Revision identifiers used by Alembic
revision: str = "7c8d9e0f1a2b"
down_revision: Union[str, None] = "1a2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Step 1: Add new column as nullable to prevent table locking and insert failures
    op.add_column(
        "users",
        sa.Column("tier", sa.String(length=32), nullable=True),
    )

    # Step 2: Backfill existing rows with default data using raw SQL execution
    op.execute(
        "UPDATE users SET tier = 'standard' WHERE tier IS NULL"
    )

    # Step 3: Now that all rows have values, enforce NOT NULL and add server default
    op.alter_column(
        "users",
        "tier",
        existing_type=sa.String(length=32),
        nullable=False,
        server_default="standard",
    )

    # Step 4: Add index for query performance
    op.create_index(
        op.f("ix_users_tier"),
        "users",
        ["tier"],
        unique=False,
    )

def downgrade() -> None:
    # Reverse all operations in exact opposite order
    op.drop_index(op.f("ix_users_tier"), table_name="users")
    op.drop_column("users", "tier")
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does Alembic track which migrations have already been applied to the database?**

Alembic creates a table named `alembic_version` in the target database with a single column `version_num VARCHAR(32)`. This table holds a single row containing the revision hash of the most recently executed migration.

When you run `alembic upgrade head`, Alembic queries `alembic_version` to obtain the active hash. It loads all migration scripts from the `versions/` directory, builds a directed acyclic graph by linking each file's `revision` to its `down_revision`, and determines the path from the current hash to the target `head`. As each migration executes within a transaction, Alembic updates `version_num` to match the newly applied revision hash upon commit.

**Q: Why does `alembic revision --autogenerate` fail on column renames, and what happens if you run it blindly?**

Autogenerate works by comparing the database catalog reflection against your Python `target_metadata`. It does not track git history or code refactoring intent.

When you rename `full_name` to `display_name` in your SQLAlchemy model, Alembic sees that `full_name` is missing from your Python model and `display_name` is newly present. Autogenerate emits two operations:
1. `op.drop_column('users', 'full_name')`
2. `op.add_column('users', sa.Column('display_name', ...))`

If you run this in production, PostgreSQL immediately drops the `full_name` column, permanently destroying customer data, and creates an empty `display_name` column.

To handle renames safely, you must manually edit the autogenerated migration file, replacing the drop and add operations with `op.alter_column('users', 'full_name', new_column_name='display_name')`.

**Q: What are migration merge conflicts (multiple heads), and how do you resolve them?**

A multiple heads conflict occurs when two engineers create new migrations on separate git feature branches that branch off the same base commit.
- Developer A creates migration `rev_a` with `down_revision = 'rev_base'`.
- Developer B creates migration `rev_b` with `down_revision = 'rev_base'`.

When both branches are merged into `main`, the migration graph contains two heads (`rev_a` and `rev_b`). If you run `alembic upgrade head`, Alembic refuses to execute and raises `CommandError: Multiple head revisions are present for given argument 'head'`.

To resolve this:
1. Run `alembic heads` to view the competing revision hashes.
2. Run `alembic merge heads -m "merge branch heads"`.
3. Alembic generates a new merge migration file with `down_revision = ('rev_a', 'rev_b')`.
4. Running `alembic upgrade head` will now apply both branches and terminate at the unified merge head.

**Q: How do you handle schema migrations in high-traffic zero-downtime production environments (the Expand/Contract pattern)?**

In a zero-downtime rolling deployment, old application containers and new application containers run concurrently against the same database for a period of time. Applying a breaking schema change in a single migration (such as dropping or renaming a column) immediately crashes the old application replicas still running in production.

Senior engineers use the Expand/Contract (Parallel Run) pattern across multiple releases:
1. **Phase 1 (Expand):** Add the new column or table as nullable via Alembic (`op.add_column`). Deploy new application code that writes to both old and new columns, but still reads from the old column.
2. **Phase 2 (Backfill):** Run a background worker or an Alembic data migration to backfill legacy data from the old column into the new column.
3. **Phase 3 (Switch):** Deploy application code that reads and writes exclusively from the new column.
4. **Phase 4 (Contract):** Once all old container instances are terminated and traffic is fully shifted, run an Alembic migration to drop the legacy column (`op.drop_column`) and apply strict `NOT NULL` constraints.

**Q: What is the difference between online mode and offline mode in Alembic?**

Online mode is the standard execution path (`alembic upgrade head`). Alembic establishes a live connection to the database, reads `alembic_version`, begins a transaction, and executes DDL directly over the wire.

Offline mode is triggered using the `--sql` flag (e.g., `alembic upgrade head --sql`). Alembic does not connect to the database. Instead, it reads the migration files on disk, compiles the DDL operations against the configured database dialect (e.g., PostgreSQL or MySQL), and outputs the raw SQL statements as a script.

Offline mode is required in regulated enterprise environments where developers do not have direct DDL access to production databases and changes must be reviewed and executed by dedicated Database Administrators (DBAs).

**Q: How do you perform a data migration inside an Alembic script without starving connection pools or locking tables?**

For small datasets, you can execute raw SQL within the migration using `op.execute("UPDATE users SET tier = 'standard' WHERE tier IS NULL")`.

For tables containing millions of rows, running a single unbounded `UPDATE` locks the table and bloats the PostgreSQL write-ahead log (WAL), causing application query timeouts. The safe approach is:
1. Use `op.get_bind()` to acquire the active database connection.
2. Chunk the updates into batches (e.g., 5,000 rows per iteration) filtering by primary key ranges.
3. Commit after each batch to release row locks and keep transaction durations negligible.

## 6. The Traps — What Goes Wrong

**Trap 1: Blindly trusting autogenerate on column renames**
- *The Mistake:* Renaming a column in Python and executing `alembic revision --autogenerate` without inspecting the generated code.
- *Why It Breaks:* Autogenerate treats renames as a `drop_column` followed by `add_column`.
- *The Consequence:* Complete and irrecoverable production data loss for that column.
- *The Fix:* Always inspect every autogenerated file before committing. Manually replace dropped/added column pairs with `op.alter_column(..., new_column_name=...)`.

**Trap 2: Adding a `NOT NULL` column without a `server_default` on an existing table**
- *The Mistake:* Running `op.add_column('users', sa.Column('status', sa.String(), nullable=False))` on a table with 1,000,000 rows.
- *Why It Breaks:* PostgreSQL must populate every existing row with a value. Without a default, it attempts to insert `NULL`, violating the constraint and failing the migration immediately. In older database engines, adding a default without careful handling rewrites the entire table under an exclusive `ACCESS EXCLUSIVE` lock, stalling all application reads and writes.
- *The Fix:* Add the column as nullable first, backfill the data, and then alter the column to `nullable=False` with a server default.

**Trap 3: Omitting explicit MetaData naming conventions**
- *The Mistake:* Creating declarative models using standard `Base = declarative_base()` without a custom `MetaData` naming convention.
- *Why It Breaks:* Relational databases assign internal generated names (like `users_email_key` or random hash identifiers) to constraints and unique indexes. When Alembic generates a downgrade or alter operation, it references the constraint by an expected name that does not match the database catalog.
- *The Consequence:* Downgrades and constraint alterations fail with `ConstraintDoesNotExist` errors in staging and production.
- *The Fix:* Always pass an explicit naming convention dictionary (`"ix"`, `"uq"`, `"ck"`, `"fk"`, `"pk"`) to `MetaData` on your root `Base` class.

**Trap 4: Running migrations inside multiple application container replicas on startup**
- *The Mistake:* Adding `alembic upgrade head` into the Docker entrypoint script of your backend service when deploying on Kubernetes or AWS ECS with 10 replicas.
- *Why It Breaks:* When all 10 containers boot concurrently, each container attempts to execute `alembic upgrade head` simultaneously.
- *The Consequence:* Race conditions, concurrent schema lock conflicts, deadlocks on `alembic_version`, and corrupted migration states.
- *The Fix:* Decouple migration execution from web server startup. Run migrations in a dedicated one-off CI/CD deployment step, a Kubernetes `Job` / `initContainer`, or an AWS ECS release task before the web application replicas are launched.

**Trap 5: Missing model imports in `env.py`**
- *The Mistake:* Creating a new model file `app/models/payment.py` but forgetting to import it into `env.py` (or into `app/models/__init__.py`).
- *Why It Breaks:* Alembic inspects `Base.metadata`. If `payment.py` has never been imported anywhere in Python execution, SQLAlchemy's metaclass never registers the `Payment` table in `Base.metadata`.
- *The Consequence:* Autogenerate sees the `payments` table in the database but finds no matching model in Python metadata. It assumes you deleted the table and generates `op.drop_table('payments')`.
- *The Fix:* Ensure `app/models/__init__.py` imports all model modules, and import that package in `env.py`.

**Trap 6: Long-running DDL operations without lock timeouts**
- *The Mistake:* Running `op.create_index` or `op.add_column` on high-traffic production tables without configuring a `lock_timeout`.
- *Why It Breaks:* PostgreSQL DDL requires exclusive table locks. If an active analytics query or slow transaction holds a read lock, the migration waits in queue. In PostgreSQL, all subsequent read and write queries queue up behind the waiting DDL, exhausting the application connection pool within seconds.
- *The Fix:* Set a short lock timeout before DDL operations: `op.execute("SET lock_timeout = '3s';")` and use concurrent index creation (`op.create_index(..., postgresql_concurrently=True)` outside of transaction blocks).

## 7. Compare With Related Concepts

**1. Alembic vs `Base.metadata.create_all()`**
- *The Core Difference:* `create_all()` is a static, one-time initializer. It inspects existing table names and creates only tables that are completely absent. It has zero awareness of schema changes, column additions, indexes, or history. Alembic is an incremental, bidirectional migration engine that tracks schema diffs over time and allows upgrades and rollbacks across environments.
- *When to Use Which:* Use `create_all()` only in ephemeral unit tests with in-memory SQLite databases. Use Alembic for all real applications, staging environments, and production systems.

**2. Alembic vs Django Migrations**
- *The Core Difference:* Django migrations are tightly integrated into the Django ORM and framework lifecycle, generating migrations automatically as part of `manage.py makemigrations`. Alembic is decoupled from any web framework, designed specifically for SQLAlchemy, and offers fine-grained manual control over connection pooling, async drivers, and custom DDL execution scripts.
- *When to Use Which:* Use Django Migrations when building inside the Django ecosystem. Use Alembic when using SQLAlchemy, FastAPI, Flask, Litestar, or standalone Python microservices.

**3. Alembic vs Raw SQL Migration Tools (Flyway / Liquibase / dbmate)**
- *The Core Difference:* Flyway and Liquibase operate strictly on raw `.sql` files or XML/YAML definitions, independent of application code. Alembic is deeply integrated with SQLAlchemy's Python object model, allowing automatic schema diff generation from Python classes (`--autogenerate`) and programmatic Python data backfills.
- *When to Use Which:* Use raw SQL tools (like Flyway or dbmate) in multi-language environments where Go, Java, and Python services share the same database. Use Alembic when your data layer is defined in Python using SQLAlchemy.

**4. Synchronous DDL Execution vs Zero-Downtime Expand/Contract Migrations**
- *The Core Difference:* Standard synchronous migrations assume the database schema and application code can change atomically together (requiring maintenance downtime for breaking changes). The Expand/Contract pattern splits schema evolution into additive (expand) and destructive (contract) phases across multiple releases so active application traffic is never interrupted.
- *When to Use Which:* Use simple single-step migrations during early development or planned maintenance windows. Use the Expand/Contract multi-phase pattern for production systems with strict SLA uptime requirements.

## 8. 🧠 The Memory Hook

Alembic is Git for your database schema: revision files are commits, `upgrade()` and `downgrade()` are your forward and reverse diffs, and the `alembic_version` table is your `HEAD` pointer. Never deploy an autogenerated file without inspecting it for drop-and-recreates, never add an unbacked `NOT NULL` on live data, and never let multiple application replicas race to run migrations on boot.
