# Soft Deletes in SQLAlchemy: Architecture, Global Query Filtering, and Unique Constraint Strategies

## 1. Why This Exists — The Problem First

Imagine running an e-commerce platform where a customer clicks "Delete My Account." If your backend executes a physical `DELETE FROM users WHERE id = 42;`, two catastrophic things happen immediately. First, because your database foreign keys on `orders`, `invoices`, and `ledger_entries` are configured with `ON DELETE CASCADE`, you have just permanently destroyed three years of financial audit records, violating federal tax and accounting laws. If the foreign keys were instead set to `RESTRICT`, the deletion crashes with a 500 error because active historical orders still reference that user.

To prevent this data loss, teams introduce soft deletes. A junior developer adds `is_deleted: bool = False` to the user model. Everything seems solved until three weeks later:
- Across 40 API endpoints, two developers forget to append `.where(User.is_deleted.is_(False))` to their queries. Soft-deleted users start receiving automated marketing emails, appear in public search directories, and their private draft posts are returned in social feeds.
- Alice deletes her account associated with `alice@example.com`. Two weeks later, she decides to return and attempts to register again with `alice@example.com`. The database violently crashes with an `IntegrityError` duplicate key violation because the standard `UNIQUE(email)` constraint cannot distinguish between active and deleted rows.
- Alice is marked as soft-deleted, but her 500 published blog posts and 2,000 comments still sit in the database with `is_deleted = False`. A public post-search endpoint queries the `posts` table directly without joining `users`, exposing content from deleted accounts to the public.

Soft delete is not merely a database flag. It is a full architectural pattern that requires automated query filtering across all relationships, partial unique indexing, cascading strategy design, and scheduled purge lifecycles.

## 2. The Analogy — Make It Obvious

Think of an enterprise accounting office with a physical filing room containing thousands of client folders:

- **Hard Deleting** is walking over to the industrial paper shredder and feeding the client's folder into the blades. The contracts, invoices, tax IDs, and signed receipts turn into dust. If a state tax auditor visits next month asking for proof of a $50,000 wire transfer from that client, your business faces massive legal penalties because the proof no longer exists.
- **Naive Soft Deleting** is writing "Cancelled" with a pencil on the front cover and sliding the folder right back onto the active client shelf. When an intern is told to "mail monthly invoices to all folders on the shelf," they grab every folder in sight, ignore the small pencil mark, and send confidential bills to cancelled clients.
- **Architectural Soft Deleting with Global Filtering and Partial Indexes** introduces three strict operational rules:
  1. **The Date-Time Stamp:** The archivist stamps the exact moment of closure (`CLOSED: 2026-08-26 14:30`) instead of a binary checkmark. This timestamp tells the team exactly when the 30-day accidental deletion recovery window expires and when legal document retention clocks begin.
  2. **The Polarized Glass Filter:** The filing shelf is fitted with automated polarized glass. Unless a senior archivist explicitly turns an "Auditor Override Key," any employee searching the room, pulling related sub-files, or counting active accounts can only see active folders. The closed folders are invisible by default.
  3. **The Active-Only Name Slot:** The metal label slot on the drawer only enforces unique client names among folders currently on the active shelf. As soon as a folder is stamped and moved behind the archival separator, that name slot is instantly released, allowing a new client with the same name to open a fresh file without conflict.

## 3. How It Actually Works — The Full Explanation

Handling soft deletes properly in modern SQLAlchemy 2.0 requires solving five interconnected challenges: schema modeling, unique constraint handling, global query interception, cascading relationships, and compliance purges.

**1. The Schema Pattern: Why Timestamp Beats Boolean**

Never use a boolean `is_deleted = Column(Boolean, default=False)`. Always use a nullable timestamp:

`deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None, nullable=True)`

A timestamp provides critical advantages:
- **Point-in-time Auditability:** You know precisely when the entity was deactivated without querying separate audit log tables.
- **Grace-Period Restorations:** You can implement automated "undo" features (e.g., "Your account is scheduled for permanent deletion in 30 days; log in before October 1st to reactivate").
- **Lifecycle Retention Policies:** A background worker can safely find and hard-purge records where `deleted_at < NOW() - INTERVAL '90 days'` to satisfy data minimization requirements.
- **Index Efficiency:** In PostgreSQL and SQLite, `NULL` values in partial indexes consume negligible space and offer high selectivity compared to low-cardinality booleans.

**2. The Unique Constraint Dilemma and Partial Indexes**

If your `users` table has a standard `UNIQUE(email)` constraint, soft deleting a user blocks that email address forever. If Alice deletes her account, neither Alice nor anyone else can ever register with `alice@example.com` again.

Attempting to fix this with a composite unique index `UNIQUE(email, is_deleted)` creates a worse bug:
1. Alice registers `(alice@example.com, False)`.
2. Alice soft-deletes: row becomes `(alice@example.com, True)`.
3. Alice re-registers: new row `(alice@example.com, False)`.
4. Alice deletes her account a second time: database attempts to set `(alice@example.com, True)` and crashes on duplicate key violation because a row with `(alice@example.com, True)` already exists.

**The Solution: Partial Unique Indexes (Filtered Indexes)**

In PostgreSQL and SQLite, you define a partial unique index that only enforces uniqueness among rows where `deleted_at IS NULL`:

```sql
CREATE UNIQUE INDEX uq_users_active_email ON users (email) WHERE deleted_at IS NULL;
```

With this index in place:
- You can have only one active row with `alice@example.com` (`deleted_at IS NULL`).
- You can have infinite soft-deleted rows with `alice@example.com` (`deleted_at IS NOT NULL`) without any constraint violations.
- When an active user attempts to register an email already taken by another active user, the database immediately blocks it.

*(Note for MySQL/MariaDB: Because MySQL does not support partial indexes directly, developers either use generated virtual columns that evaluate to `IF(deleted_at IS NULL, email, NULL)` with a unique index, or composite indexes relying on SQL `NULL != NULL` uniqueness semantics).*

**3. Global Query Filtering in SQLAlchemy 2.0 via `with_loader_criteria`**

Manually appending `.where(Model.deleted_at.is_(None))` to every repository call is unsustainable. Developers will eventually forget a filter on a joined query or an aggregation.

SQLAlchemy 2.0 provides `with_loader_criteria()`, an execution option that automatically modifies the AST (Abstract Syntax Tree) of compiled SQL statements. When attached to the `do_orm_execute` event hook of a `Session` or `sessionmaker`, SQLAlchemy intercepts every ORM query and dynamically injects `WHERE entity.deleted_at IS NULL` into:
- Primary `select(User)` queries.
- Eager relationship loads (`joinedload()`, `selectinload()`, `subqueryload()`).
- Lazy-loaded relationship traversals (`user.posts`).
- Queries involving subclasses or joined table inheritance.

**Bypassing the Filter for Admin and Restore Operations:**
When building customer support tools, audit logs, or restore endpoints, you need to view soft-deleted records. You do this by passing a custom execution option on the statement:

`session.execute(select(User).execution_options(include_deleted=True))`

The `do_orm_execute` hook checks `execute_state.execution_options.get("include_deleted", False)`. If `True`, it skips injecting the filter.

**4. The Cascading Dilemma: Application-Level vs Schema-Level**

A critical trap in database architecture is confusing database foreign key cascades with soft deletes:
- Database-level `ON DELETE CASCADE` only fires on physical SQL `DELETE` operations.
- Setting `user.deleted_at = datetime.now(timezone.utc)` is an SQL `UPDATE`, not a `DELETE`. The database engine does not touch child records (`posts`, `comments`, `api_tokens`).

To handle child entities under soft delete, you have two primary architectural choices:

- **Choice A: Inherited Mixin with Independent Filters (Recommended).** Every soft-deletable child model (`Post`, `Comment`) inherits `SoftDeleteMixin`. The global `with_loader_criteria` automatically hides deleted parents and deleted children independently. When a parent `User` is soft-deleted, their posts become unreachable through standard user relationships because the parent user is hidden. If posts are queried directly (e.g. global search), you either explicitly cascade the timestamp down to child rows during deletion, or join on the parent model where the parent's `deleted_at IS NULL` filter applies.
- **Choice B: Explicit Application-Level Cascade.** In your service/repository layer, wrapping the deletion in a database transaction that updates both the parent and related child records in a single atomic batch:
  ```python
  now = datetime.now(timezone.utc)
  user.deleted_at = now
  session.execute(
      update(Post).where(Post.user_id == user.id, Post.deleted_at.is_(None)).values(deleted_at=now)
  )
  ```

**5. Compliance, GDPR "Right to be Forgotten", and Data Lifecycle**

Soft deletion is a user-experience and operational recovery feature; it is **not** legal compliance. Under GDPR Article 17, retaining identifiable personal data (PII) indefinitely in soft-deleted rows is illegal.

A robust production lifecycle uses a two-tier data retention workflow:
- **Tier 1 (Instant Soft Delete):** User requests deletion. The record receives `deleted_at = NOW()`. The entity disappears instantly from all user interfaces and public APIs.
- **Tier 2 (Grace Period & Hard Purge / Anonymization):** A scheduled background worker (e.g., Celery beat task or cron job running nightly) queries for records where `deleted_at < NOW() - INTERVAL '30 days'`. The worker either:
  1. Anonymizes PII: Replaces `email` with `deleted_user_8921@anonymized.internal`, scrubs names, addresses, and phone numbers, but preserves foreign key links on transaction/order tables for tax accounting.
  2. Issues a true hard `DELETE` for non-regulatory data where statutory retention periods have lapsed.

## 4. Real Code — See It Working

Below is a complete, production-ready SQLAlchemy 2.0 implementation demonstrating the declarative mixin, partial unique index, automated `with_loader_criteria` session filtering, relationship handling, and filter-bypass logic.

```python
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    create_engine,
    select,
    update,
    event,
    Index,
    ForeignKey,
    String,
    DateTime,
    text,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    Session,
    sessionmaker,
    with_loader_criteria,
    ORMExecuteState,
    selectinload,
)

# ---------------------------------------------------------------------------
# 1. Base Class and Reusable Soft-Delete Mixin
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


class SoftDeleteMixin:
    """Provides a timestamp-based soft delete pattern and helper methods."""
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=None,
        nullable=True,
        index=True,  # Indexed to accelerate purge queries and filtered joins
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        self.deleted_at = datetime.now(timezone.utc)

    def restore(self) -> None:
        self.deleted_at = None


# ---------------------------------------------------------------------------
# 2. Domain Models with Partial Unique Index
# ---------------------------------------------------------------------------

class User(SoftDeleteMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50))
    email: Mapped[str] = mapped_column(String(255))

    posts: Mapped[List["Post"]] = relationship(
        back_populates="author",
        cascade="save-update, merge",  # No DB delete cascades on soft deletes
    )

    __table_args__ = (
        # Partial unique index: email must be unique ONLY among active accounts.
        # This allows multiple soft-deleted records to share an email address.
        Index(
            "uq_user_active_email",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
    )


class Post(SoftDeleteMixin, Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    author: Mapped["User"] = relationship(back_populates="posts")


# ---------------------------------------------------------------------------
# 3. Global Query Filtering via SQLAlchemy 2.0 ORM Execution Hook
# ---------------------------------------------------------------------------

def enable_soft_delete_filtering(session_factory: sessionmaker[Session]) -> None:
    """
    Registers an event listener that automatically injects 'WHERE deleted_at IS NULL'
    into all SELECT statements, eager loads, and relationship queries.
    """
    @event.listens_for(Session, "do_orm_execute")
    def _add_soft_delete_filtering_criteria(execute_state: ORMExecuteState):
        # Apply criteria only to SELECT queries where 'include_deleted' is not explicitly set to True
        if (
            execute_state.is_select
            and not execute_state.execution_options.get("include_deleted", False)
        ):
            execute_state.statement = execute_state.statement.options(
                with_loader_criteria(
                    SoftDeleteMixin,
                    lambda cls: cls.deleted_at.is_(None),
                    include_aliases=True,
                )
            )


# ---------------------------------------------------------------------------
# 4. Verification and Execution Workflow
# ---------------------------------------------------------------------------

def run_demonstration():
    # Set up SQLite database in memory
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)

    SessionLocal = sessionmaker(bind=engine)
    enable_soft_delete_filtering(SessionLocal)

    with SessionLocal() as session:
        # Step A: Create User Alice and Post
        alice = User(username="alice", email="alice@example.com")
        alice.posts.append(Post(title="SQLAlchemy 2.0 Deep Dive"))
        session.add(alice)
        session.commit()

        print(f"Created active user ID {alice.id}: {alice.email}")

        # Step B: Soft-delete Alice
        alice.soft_delete()
        session.commit()
        print("Alice has been soft-deleted.")

    with SessionLocal() as session:
        # Step C: Querying users without any manual filters
        # with_loader_criteria automatically injects 'WHERE deleted_at IS NULL'
        active_users = session.scalars(select(User)).all()
        print(f"Active users returned by standard query: {len(active_users)}")  # 0

        # Step D: Re-registration with the same email succeeds because of the partial unique index
        new_alice = User(username="alice_new", email="alice@example.com")
        session.add(new_alice)
        session.commit()
        print(f"Re-registered user with same email (ID: {new_alice.id}) successfully.")

        # Step E: Admin query bypassing the soft delete filter
        all_users = session.scalars(
            select(User).execution_options(include_deleted=True)
        ).all()
        print(f"Admin query (including deleted): {len(all_users)} users found.")  # 2

        # Step F: Restore the original Alice
        original_alice = session.scalar(
            select(User)
            .where(User.id == 1)
            .execution_options(include_deleted=True)
        )
        # To restore, email collision must be handled if new_alice exists.
        # Here we rename old record or demonstrate restore mechanic:
        original_alice.email = "alice_archived@example.com"
        original_alice.restore()
        session.commit()
        print(f"Restored original user: is_deleted={original_alice.is_deleted}")


if __name__ == "__main__":
    run_demonstration()
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why is a timestamp `deleted_at` strongly preferred over a boolean `is_deleted` flag?**

A boolean `is_deleted` column only tells you *if* a record is inactive, discarding essential temporal context. A nullable `deleted_at` timestamp records *when* the deletion occurred. This temporal data enables four critical production features:
1. **Accidental Deletion Recovery:** You can implement self-service restoration windows (e.g., "Restore account within 30 days").
2. **Automated Purging and GDPR Compliance:** Background retention workers can execute deterministic queries (`WHERE deleted_at < NOW() - INTERVAL '90 days'`) to permanently erase or anonymize stale records.
3. **Database Indexing:** In engines like PostgreSQL, `deleted_at IS NULL` works cleanly with partial indexes, maintaining small, fast index sizes for active records while ignoring historical dead rows.
4. **Audit and Diagnostics:** When investigating customer support tickets or billing discrepancies, you know the exact order of events relative to other timestamped actions.

**Q: How do you enforce unique constraints (e.g., unique email) on tables that use soft deletes?**

Standard table-level unique constraints (`UNIQUE(email)`) check every row in the table, preventing a user from re-registering with an email that belonged to a soft-deleted account. Composite unique keys on `(email, is_deleted)` fail because a user cannot delete and re-register more than once without triggering a collision on `(email, True)`.

The industry-standard solution is a **partial unique index** (also known as a filtered index). In PostgreSQL and SQLite, you write:

```sql
CREATE UNIQUE INDEX uq_users_active_email ON users (email) WHERE deleted_at IS NULL;
```

This enforces uniqueness exclusively on active rows where `deleted_at IS NULL`. Multiple soft-deleted rows can coexist with the same email without conflicting.

**Q: How does SQLAlchemy 2.0's `with_loader_criteria` provide global query filtering, and how does it compare to custom query wrappers?**

Custom repository wrappers require developers to remember to call specific helper methods (e.g., `repo.find_active()`) instead of standard SQLAlchemy queries. If a developer uses a raw `select()`, a joined load, or traverses a relationship property (`user.posts`), the filter is skipped, leaking deleted records.

`with_loader_criteria` operates at the engine/session compilation level. Attached to the `do_orm_execute` event hook, it inspects the AST of every executed ORM query. Whenever an entity matching the specified class (or mixin) appears—whether as the primary query target, an aliased join, a `selectinload()`, or a lazy-loaded relationship—SQLAlchemy automatically appends the `WHERE entity.deleted_at IS NULL` condition. It guarantees zero leakage across the entire application without boilerplate.

**Q: How do you bypass global soft delete filters when building admin audit dashboards or undelete endpoints?**

You pass custom execution options on the executable statement:

```python
stmt = select(User).where(User.id == user_id).execution_options(include_deleted=True)
user = session.scalar(stmt)
```

Inside your `do_orm_execute` event listener, you inspect `execute_state.execution_options.get("include_deleted", False)`. If the flag is set to `True`, the event handler skips attaching `with_loader_criteria`, allowing the query to compile without the soft-delete filter.

**Q: What happens to foreign key cascades (`ON DELETE CASCADE`) during a soft delete, and how should child records be handled?**

Database-level `ON DELETE CASCADE` constraints are triggered exclusively by physical SQL `DELETE` operations. Because soft deletion is executed as an SQL `UPDATE` setting `deleted_at = NOW()`, the database engine never fires foreign key cascade actions.

To handle child entities, you have two approaches:
1. **Mixin-level Automatic Filtering (Declarative):** Ensure child tables (`Post`, `Comment`) also inherit `SoftDeleteMixin`. The global `with_loader_criteria` automatically excludes deleted children. If you query child items through the parent relationship (`user.posts`), the parent filter prevents the parent from being loaded in the first place.
2. **Explicit Bulk Update (Transactional Service Layer):** For child records that must explicitly track their own deletion timestamp when a parent is deleted, your service layer runs a batch update in the same database transaction:
   ```python
   session.execute(
       update(Post)
       .where(Post.user_id == user.id, Post.deleted_at.is_(None))
       .values(deleted_at=datetime.now(timezone.utc))
   )
   ```

**Q: What are the long-term database performance implications of soft deletes, and how do you mitigate them?**

Over several years, soft-deleted rows can outnumber active rows by 10x or 100x. If standard B-Tree indexes are used on columns like `created_at` or `status`, the index tree becomes bloated with dead rows, increasing disk I/O, cache churn in the buffer pool, and sequential scan times.

Mitigation strategies include:
- **Partial B-Tree Indexes:** Include `WHERE deleted_at IS NULL` on all secondary query indexes so the index only stores pointers to active rows.
- **Table Partitioning:** Partition tables by active status or time ranges, moving soft-deleted records into separate physical partitions.
- **Scheduled Retention Purges:** Run off-peak background jobs to hard-delete or archive records whose statutory or policy retention windows have elapsed.

## 6. The Traps — What Goes Wrong

**Trap 1: Forgetting that Database Cascades Do Not Trigger on Soft Delete**
Developers configure `relationship("Post", cascade="all, delete-orphan")` or database foreign keys with `ON DELETE CASCADE`, assuming child records will be handled automatically. When `user.soft_delete()` is called, SQLAlchemy issues an `UPDATE users SET deleted_at = ...` statement. The database foreign key cascade never triggers. If a public search endpoint queries `select(Post)` directly without joining `User` or checking post-level soft deletion, private posts from deactivated users appear publicly.
*The Fix:* Either apply `SoftDeleteMixin` to child entities with `with_loader_criteria`, or issue an explicit transactional `update()` on child tables during deletion.

**Trap 2: Using Standard Unique Constraints or Boolean Flags for Unique Fields**
Using a standard `UNIQUE(email)` constraint causes immediate database crashes when a deleted user attempts to re-register. Attempting to fix this with `UNIQUE(email, is_deleted)` causes a crash the second time a user account with that email is deleted.
*The Fix:* Use partial unique indexes (`CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`) so uniqueness is evaluated only across active records.

**Trap 3: Aggregation and Count Leakage in Reporting Queries**
Raw SQL queries, direct `func.count(User.id)` calls that bypass the ORM session hook, or subqueries can inadvertently count millions of soft-deleted rows. A metric calculating "Monthly Active Users" or "Total Registered Customers" can report numbers that are 40% higher than reality.
*The Fix:* Ensure analytics and reporting queries explicitly filter for `deleted_at IS NULL` or rely on standardized database views (`CREATE VIEW active_users AS SELECT * FROM users WHERE deleted_at IS NULL;`).

**Trap 4: Believing Soft Delete Satisfies GDPR "Right to be Forgotten"**
Treating soft delete as a permanent state violates data privacy regulations like GDPR and CCPA. Retaining plain-text PII (names, emails, credit card hashes, IP addresses) indefinitely in a database exposes the company to severe regulatory fines and data breach liability.
*The Fix:* Implement a two-tier lifecycle. Soft delete acts as a temporary 30-day quarantine/recovery period. After 30 days, an automated worker either executes an anonymization routine (replacing PII with randomized hashes) or permanently hard-deletes the record.

**Trap 5: Table and Buffer Pool Bloat**
Accumulating millions of soft-deleted records causes database tables and secondary indexes to swell in physical size. Read queries that scan tables load cold, dead rows into RAM buffer pools, evicting active data and degrading query latency.
*The Fix:* Create partial indexes for all frequent lookup queries and implement automated archiving strategies (e.g., copying stale deleted rows to cold storage tables like `users_archive` before hard-purging them from the OLTP table).

## 7. Compare With Related Concepts

| Concept | How It Works | Primary Use Case | Key Trade-off / Limitation |
| :--- | :--- | :--- | :--- |
| **Soft Delete (`deleted_at`)** | Sets a nullable timestamp on the active record; global filter hides it from queries. | User-facing deactivation with an undo grace period and reference preservation. | Causes table bloat over time; requires partial indexes and automated query filtering. |
| **Hard Delete (`DELETE FROM`)** | Physically removes the row and associated disk pages immediately. | Permanent cleanup, transient records, GDPR compliance after grace periods. | Irreversible; cascades can destroy historical accounting and audit records. |
| **Archival Tables (`users_archive`)** | Moves the row from the primary table into a dedicated historical archive table in a single transaction. | High-volume OLTP systems where active tables must stay lean and fast. | Requires managing two schemas and synchronizing migrations across both tables. |
| **Audit Logs / CDC (Temporal Tables)** | Emits an immutable log entry or snapshot (via Change Data Capture or triggers) on every change. | Strict compliance, forensic auditing, historical timeline reconstruction. | High storage overhead; rebuilding past state requires specialized temporal querying. |
| **Boolean Flag (`is_deleted`)** | Sets a binary `True`/`False` indicator on the row. | Simple internal flags on non-unique, low-volume configuration tables. | Lacks time context, complicates retention purges, and breaks unique constraint indexing. |

**Rule of Thumb:**
- Use **Soft Delete (`deleted_at`)** for primary business entities (users, teams, documents) where accidental deletion recovery and foreign key preservation are required.
- Use **Hard Delete** for ephemeral data (session tokens, cache entries, verification codes) and for final GDPR purges after a 30-day retention window.
- Use **Archival Tables** when high transaction volumes mean soft-deleted rows would degrade database buffer pool performance.

## 8. 🧠 The Memory Hook

**`deleted_at IS NULL` keeps the row invisible, a partial unique index keeps the email reusable, and `with_loader_criteria` keeps you from writing the filter a thousand times.**
