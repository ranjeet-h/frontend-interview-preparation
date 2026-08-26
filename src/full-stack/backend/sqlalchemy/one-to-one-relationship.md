# One-to-One Relationships in SQLAlchemy 2.0: Unique Constraints, `Mapped`, and Cascades

## 1. Why This Exists — The Problem First

Imagine you are building a user management service. You have a `User` table for authentication credentials (id, email, password hash) and a `UserProfile` table for optional profile details (bio, avatar URL, physical address). In your Python code, you declare a relationship so that each user has exactly one profile.

You push the code to production, and two catastrophic bugs immediately surface.

The first is a race condition that corrupts your data. A user on a spotty mobile connection taps "Save Profile" twice, firing two HTTP requests milliseconds apart. Because your database migration created a standard foreign key (`user_id REFERENCES users(id)`) without a database-level `UNIQUE` constraint, both SQL `INSERT` statements succeed. Now `user_id = 42` has two conflicting profile rows in the database. The next time the user logs in, your application attempts to load `user.profile`, and SQLAlchemy crashes with a `MultipleResultsFound` exception in production—or worse, silently loads the first row while profile updates write to the second row, creating ghost records.

The second is a silent N+1 query storm that cripples your database. An admin dashboard fetches the 50 most recent users with `select(User).limit(50)`. When the template or serializer accesses `user.profile.avatar_url` in a loop, SQLAlchemy's default lazy loading fires 50 individual `SELECT` queries across the network—one for every single user. A fast 5ms query turns into an 800ms bottleneck that exhausts database connection pools.

One-to-one relationships in SQLAlchemy 2.0 solve these problems by bridging relational database constraints with Python object semantics: enforcing strict database-level uniqueness, typing relationships as single objects rather than lists, orchestrating automated cascade deletions, and providing predictable eager loading.

## 2. The Analogy — Make It Obvious

Think of a citizen (`User`) and their official government passport (`UserProfile`).

A citizen is the primary entity. A person is born, receives a citizen ID, and exists in the national database whether or not they ever apply for a passport.

A passport is a child document. It cannot exist floating in empty space; it must belong to a verified citizen. To link them, the passport booklet has the citizen's national ID stamped onto its page—that is the **Foreign Key**.

The passport authority enforces an unbending law: no citizen may possess more than one active passport. Even if two passport application desks try to issue a passport to the same citizen at the exact same millisecond, the central registry rejects the second attempt immediately. That is the **Database `UNIQUE` Constraint**.

When the citizen checks their wallet, they find either a single passport or nothing (`None`). They never hold a list or array of passports. In SQLAlchemy 2.0, the type annotation `Mapped[Optional[Passport]]` represents this **Scalar ORM Mapping**—returning a single object rather than a collection.

Finally, consider the revocation rules: if a citizen's master record is expunged, their passport is instantly invalidated and destroyed. If the citizen surrenders their passport (`citizen.passport = None`), the booklet is shredded rather than left sitting in a file cabinet as an unowned ghost record. That is **Cascade Deletion (`cascade="all, delete-orphan"`)**.

## 3. How It Actually Works — The Full Explanation

A one-to-one relationship is not a distinct primitive in relational databases. Relational engines (PostgreSQL, MySQL, SQLite) only understand foreign keys, which by default represent Many-to-One relationships. Making a relationship strictly One-to-One requires orchestrating two distinct tiers: the relational database engine and the Python ORM mapping.

**The Relational Database Tier:**

At the database storage level, there are two ways to model a one-to-one relationship:

1. **Foreign Key with a Unique Constraint (Standard Pattern):** The child table (`user_profiles`) contains a foreign key column pointing to the parent table (`users.id`), and that column is marked with a `UNIQUE` constraint or unique index. The foreign key ensures referential integrity (the user must exist), and the `UNIQUE` constraint ensures that no two profile rows can ever reference the same `user_id`.
2. **Shared Primary Key (Alternative Pattern):** The child table's primary key is simultaneously its foreign key (`user_profiles.id` is both `PRIMARY KEY` and `FOREIGN KEY REFERENCES users(id)`). Because primary keys are unique by definition, this guarantees a 1-to-1 link without needing a separate `user_id` column.

**Parent vs. Child Table Placement:**

In almost all business domains, the child table (`UserProfile`) must hold the foreign key pointing to the parent (`User`), not the other way around.

If the `users` table held a `profile_id` foreign key, a user could never register without creating a profile in the same transaction (or `profile_id` would have to be nullable). If the user later needed other 1-to-1 attachments (like `UserSettings`, `BillingAccount`, `UserSecurity`), adding foreign keys to the `User` table would cause the parent table schema to bloat and introduce circular dependency gridlocks during table creation and row insertion. Keeping foreign keys on child tables preserves the parent as a clean, independent aggregate root.

**The Python ORM Tier in SQLAlchemy 2.0:**

In legacy SQLAlchemy 1.x, developers had to explicitly pass `uselist=False` to `relationship()` to prevent SQLAlchemy from returning a Python list.

In modern SQLAlchemy 2.0 using `DeclarativeBase`, type annotations drive the relationship structure. When you type an attribute with a scalar `Mapped[UserProfile]` or `Mapped[Optional[UserProfile]]`, SQLAlchemy automatically infers that the relationship is single-valued:

```python
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    # Scalar annotation automatically sets single-object loading
    profile: Mapped[Optional["UserProfile"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
```

On the child model, the foreign key column is defined with `unique=True` and linked back:

```python
class UserProfile(Base):
    __tablename__ = "user_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    user: Mapped["User"] = relationship(back_populates="profile")
```

**Cascade Deletion (Session vs. Database Engine):**

Handling the deletion of parent and child records requires understanding two complementary cascade systems:

1. **ORM-Level Cascade (`cascade="all, delete-orphan"`):** Configured on the Python `relationship()`. When you delete a user in the Python session (`session.delete(user)`), SQLAlchemy tracks the loaded profile and generates a `DELETE` statement for it. If you break the link by assigning `user.profile = None`, SQLAlchemy detects that the profile has lost its parent and automatically deletes the orphaned profile row from the database during the next `flush()`.
2. **Database-Level Cascade (`ondelete="CASCADE"`):** Configured inside `ForeignKey("users.id", ondelete="CASCADE")`. This tells the PostgreSQL or MySQL engine directly: "If a row in `users` is deleted via raw SQL or bulk ORM operations, delete any referencing row in `user_profiles` immediately."

Production systems should configure both: `ondelete="CASCADE"` guarantees referential integrity inside the database engine, while `cascade="all, delete-orphan"` synchronizes Python session state and cleans up dissociated objects.

**Eager Loading Strategies for One-to-One Relationships:**

By default, relationships use lazy loading (`lazy="select"`), which emits a separate SQL query whenever `user.profile` is accessed.

For one-to-one relationships, the optimal loading strategy is almost always `joinedload`:

- **`joinedload(User.profile)`:** SQLAlchemy issues a single SQL query with a `LEFT OUTER JOIN`. Because a one-to-one relationship has at most one child row per parent row, joining does not cause row multiplication (unlike one-to-many relationships, where joining duplicates parent columns across multiple child rows). `joinedload` fetches parent and child in a single database round-trip with zero duplication overhead.
- **`selectinload(User.profile)`:** SQLAlchemy issues two queries: one for parents, and one for children using `WHERE user_id IN (...)`. This is useful when the child table has massive JSON or text columns where combining them into one wide row is undesirable, or in specific asynchronous query pipelines.

## 4. Real Code — See It Working

Here is a complete, runnable SQLAlchemy 2.0 setup demonstrating declarative models, database-enforced unique constraints, cascade deletion, and eager loading.

```python
from typing import Optional
from sqlalchemy import ForeignKey, String, select, create_engine
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    Session,
    joinedload,
)
from sqlalchemy.exc import IntegrityError

# 1. Base class for SQLAlchemy 2.0 Declarative Models
class Base(DeclarativeBase):
    pass

# 2. Parent Model
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    # 1-to-1 relationship: Mapped[Optional['UserProfile']] sets scalar semantics.
    # cascade='all, delete-orphan' ensures that deleting the user or setting
    # user.profile = None deletes the associated profile row.
    profile: Mapped[Optional["UserProfile"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"

# 3. Child Model
class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    
    # Database-level 1-to-1 enforcement:
    # unique=True creates a UNIQUE constraint on user_id in SQL.
    # ondelete='CASCADE' lets the DB engine clean up profiles on user deletion.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    bio: Mapped[Optional[str]] = mapped_column(String(500))
    avatar_url: Mapped[Optional[str]] = mapped_column(String(255))

    # Reverse relationship back to User
    user: Mapped["User"] = relationship(back_populates="profile")

    def __repr__(self) -> str:
        return f"<UserProfile id={self.id} user_id={self.user_id} bio={self.bio!r}>"

# -----------------------------------------------------------------------------
# Demonstration & Verification
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    # Use an in-memory SQLite engine with foreign keys enabled
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        # Step A: Create a User and associate a Profile via scalar attribute
        alice = User(email="alice@example.com")
        alice.profile = UserProfile(
            bio="Distributed systems engineer",
            avatar_url="https://example.com/avatars/alice.png",
        )
        session.add(alice)
        session.commit()
        print(f"Created User: {alice} with Profile: {alice.profile}")

    with Session(engine) as session:
        # Step B: Eager loading using joinedload (1 single query, zero N+1)
        stmt = (
            select(User)
            .options(joinedload(User.profile))
            .where(User.email == "alice@example.com")
        )
        user = session.scalar(stmt)
        assert user is not None
        # Accessing user.profile requires no extra SQL query because it was joined
        print(f"Eagerly Loaded User: {user.email}, Profile Bio: {user.profile.bio}")

    with Session(engine) as session:
        # Step C: Prove database-level UNIQUE constraint prevents duplicate profiles
        user_id = session.scalar(select(User.id).where(User.email == "alice@example.com"))
        
        duplicate_profile = UserProfile(
            user_id=user_id,
            bio="Intruder profile attempting duplicate link",
        )
        session.add(duplicate_profile)
        
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            print("Successfully caught IntegrityError: UNIQUE constraint blocked duplicate profile row.")

    with Session(engine) as session:
        # Step D: Demonstrate orphan deletion (setting profile to None deletes the row)
        stmt = select(User).options(joinedload(User.profile)).where(User.email == "alice@example.com")
        user = session.scalar(stmt)
        assert user is not None
        
        # Disassociate profile
        user.profile = None
        session.commit()

        # Verify the profile row was deleted from the database
        remaining_profiles = session.scalars(select(UserProfile)).all()
        print(f"Profiles remaining in database after orphan removal: {len(remaining_profiles)}")
        assert len(remaining_profiles) == 0
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How is a one-to-one relationship physically implemented in a relational database, and how does SQLAlchemy 2.0 map it?**

Relational databases do not have a dedicated 1-to-1 table constraint keyword. They implement 1-to-1 relationships as a Foreign Key constraint placed on the child table combined with a `UNIQUE` constraint or unique index on that foreign key column. The Foreign Key guarantees that the referenced parent row exists, and the `UNIQUE` constraint guarantees that no two child rows can point to the same parent.

SQLAlchemy 2.0 maps this relationship on the Python side using type annotations on the `Mapped[]` wrapper. Defining `profile: Mapped[Optional[UserProfile]] = relationship(back_populates="user")` on the parent model signals to the ORM that the attribute holds a single object (or `None`), rather than a collection. On the child model, `user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)` defines the foreign key and database uniqueness constraint.

**Q: What is the difference between legacy `uselist=False` and SQLAlchemy 2.0 type annotations?**

In SQLAlchemy 1.x, `relationship()` defaulted to returning a list unless explicitly instructed otherwise with `uselist=False`. If you omitted `uselist=False`, accessing `user.profile` would return `[<UserProfile>]` instead of `<UserProfile>`.

In SQLAlchemy 2.0's declarative system, the ORM inspects Python type annotations at configuration time. If the type is a scalar type (`Mapped[UserProfile]` or `Mapped[Optional[UserProfile]]`), SQLAlchemy automatically configures the relationship as single-valued (`uselist=False` is inferred). If the type is a collection (`Mapped[list[Post]]`), SQLAlchemy configures it as a collection. While `uselist=False` is still accepted for backwards compatibility, idiomatic 2.0 code relies on type annotations.

**Q: Why does the child table hold the foreign key in a one-to-one relationship instead of the parent?**

The child table holds the foreign key to maintain domain independence and prevent initialization deadlocks. 

If the parent `users` table held `profile_id`, you could not create a `User` at registration without either creating a dummy `UserProfile` in the exact same step or allowing `profile_id` to be nullable. Furthermore, if you later added other 1-to-1 attachments (such as `UserSettings` or `BillingDetails`), putting foreign keys on `users` would force you to alter the `users` table for every new feature. By placing `user_id` on `UserProfile`, `User` remains an independent core entity, and child tables can be added, migrated, or deleted without modifying the parent table's schema.

**Q: What is the difference between `cascade="all, delete-orphan"` and `ondelete="CASCADE"`?**

They operate at two completely different layers of the stack:

`cascade="all, delete-orphan"` operates inside the Python SQLAlchemy ORM session. When you delete a parent object via `session.delete(user)`, or when you disassociate a child by setting `user.profile = None`, the ORM issues a `DELETE` statement for the child row on the next flush. However, it only works for objects loaded into and managed by the active SQLAlchemy session.

`ondelete="CASCADE"` is a DDL-level constraint configured directly in the database engine via SQL (`FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`). If a parent row is deleted via raw SQL, a database stored procedure, or a bulk query (`delete(User)` without loading objects), the database engine handles the deletion of the child row atomically.

Senior engineers configure both: `ondelete="CASCADE"` protects the database against direct SQL operations, while `cascade="all, delete-orphan"` handles in-memory disassociations and session synchronization.

**Q: Which loading strategy should you use for one-to-one relationships (`joinedload` vs `selectinload` vs lazy loading)?**

`joinedload` is the standard choice for one-to-one relationships. 

Because a 1-to-1 relationship guarantees that a parent has at most one child, an SQL `LEFT OUTER JOIN` returns exactly one row per parent entity. There is no row multiplication or duplicated parent data across the network. `joinedload` fetches both entities in a single database round trip.

By contrast, for one-to-many relationships (e.g., `User` to `Posts`), `joinedload` causes a cartesian explosion where the parent user's columns are duplicated for every post, making `selectinload` (which uses `WHERE user_id IN (...)`) preferable. For 1-to-1 relationships, `joinedload` gives you optimal single-query performance without cartesian penalties.

**Q: When should you separate data into a 1-to-1 table versus keeping all columns in a single table?**

Keep data in the same table when the fields are small, always accessed together, and share the exact same lifecycle (e.g., `email`, `password_hash`, `created_at`).

Separate data into a 1-to-1 table when:
1. **Access Patterns Differ:** The profile contains large text fields (`bio`, `resume_text`) or binary blobs that are rarely needed during standard authentication and lightweight user lookups.
2. **Security & Authorization Boundaries:** Sensitive data (e.g., `UserTaxInfo` or `TwoFactorSecrets`) requires stricter table-level database permissions than public profile data.
3. **Sparse / Optional Data:** Only 10% of users fill out extended merchant or developer profiles. Storing them in a separate table avoids wide, sparsely populated tables with hundreds of `NULL` columns.
4. **Independent Evolution:** The secondary table is owned by a different domain or microservice team.

## 6. The Traps — What Goes Wrong

**Trap 1: Forgetting `unique=True` on the Foreign Key Column**

Developers often configure the Python relationship with scalar typing and assume SQLAlchemy will magically enforce uniqueness in the database.

```python
# BROKEN: Missing unique=True on the column
class UserProfile(Base):
    __tablename__ = "user_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id")) # OOPS! Allows duplicates
```

Without `unique=True`, the generated SQL schema creates a standard foreign key index. Under concurrent HTTP requests, two separate threads can insert `UserProfile(user_id=1)`. Both inserts succeed in SQL. When your application later queries `user.profile`, SQLAlchemy crashes with `sqlalchemy.exc.MultipleResultsFound`.

Always specify `unique=True` on the foreign key column:
```python
user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
```

**Trap 2: Relying on Application-Level Checks to Enforce 1-to-1 Uniqueness**

A developer writes an endpoint that checks `if user.profile is not None: raise HTTPException(...)` before inserting a new profile.

This is a classic Time-of-Check to Time-of-Use (TOCTOU) race condition. If two requests execute the `if` check simultaneously before either transaction commits, both pass the check and both write to the database. Application code cannot prevent concurrency race conditions; only a database `UNIQUE` index can provide atomic serialization.

**Trap 3: The Silent N+1 Query in API Serialization**

When building a REST or GraphQL API that returns a list of users, developers often write:

```python
# Endpoint code
users = session.scalars(select(User).limit(100)).all()
return [{"id": u.id, "email": u.email, "bio": u.profile.bio if u.profile else None} for u in users]
```

In 1-to-many relationships, developers immediately notice N+1 problems because they see loops over collections. In 1-to-1 relationships, `u.profile.bio` looks like a simple attribute lookup. In reality, it triggers an individual `SELECT` query across the network for every user in the loop (101 total queries).

Always apply `joinedload` on the query when reading 1-to-1 relationships:
```python
stmt = select(User).options(joinedload(User.profile)).limit(100)
users = session.scalars(stmt).unique().all()
```

**Trap 4: Mismatched Cascade Settings**

A developer sets `cascade="all, delete-orphan"` on the ORM relationship, but leaves `ondelete` off the database foreign key. Later, a data cleanup script runs raw SQL: `DELETE FROM users WHERE last_login < '2023-01-01';`.

The raw SQL execution bypasses the SQLAlchemy session entirely. The database engine tries to delete the user row, hits the foreign key reference in `user_profiles`, and aborts with a foreign key constraint violation error.

Mirror ORM cascades with database foreign key cascade definitions:
```python
# Both tiers configured together
user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
profile: Mapped[Optional["UserProfile"]] = relationship(back_populates="user", cascade="all, delete-orphan")
```

**Trap 5: Bidirectional Foreign Keys Causing Insertion Deadlocks**

A developer tries to enforce 1-to-1 symmetry by placing a `profile_id` foreign key on `User` and a `user_id` foreign key on `UserProfile`.

Neither table can be inserted first without violating a non-null foreign key constraint, and dropping the tables requires breaking circular foreign key references. Keep the foreign key exclusively on the child table, and use `relationship(back_populates=...)` on both models for bidirectional Python traversal.

## 7. Compare With Related Concepts

**One-to-One vs. One-to-Many Relationships**

In database storage, both use a Foreign Key pointing from child to parent. The sole difference in SQL is the `UNIQUE` constraint on the child's foreign key column.

In SQLAlchemy 2.0, One-to-One maps to a scalar type (`Mapped[Optional[Child]]`), whereas One-to-Many maps to a collection type (`Mapped[list[Child]]`).

Rule: If a parent entity can ever logically have more than one child row (even in future roadmaps, like multiple shipping addresses), use One-to-Many. If domain invariants strictly limit the association to at most one (like a user avatar profile), use One-to-One with `unique=True`.

**One-to-One Relationship vs. Single-Table Embedded Columns**

Single-table storage places all profile columns directly inside the `users` table (`users.bio`, `users.avatar_url`). One-to-one creates two distinct tables joined by a foreign key.

Rule: If the related fields are small, always queried together during user authentication, and share the exact same access permissions, embed them in the main table. If the fields are large, rarely accessed, optional, or have independent security/domain boundaries, split them into a 1-to-1 table.

**ORM Cascade (`cascade="all, delete-orphan"`) vs. Database Cascade (`ondelete="CASCADE"`)**

ORM cascades work in Python memory when manipulating entities through `Session.delete()` or `user.profile = None`. Database cascades work at the storage engine level when running bulk SQL statements or direct database scripts.

Rule: Use `cascade="all, delete-orphan"` on the `relationship()` for session lifecycle management, and pair it with `ondelete="CASCADE"` on `mapped_column(ForeignKey(...))` for storage-level data integrity.

**`joinedload` vs. `selectinload` for 1-to-1 Relationships**

`joinedload` combines parent and child into a single SQL query using an outer join. `selectinload` fires two separate queries, fetching child rows using an `IN` clause.

Rule: For 1-to-1 relationships, default to `joinedload` because there is zero row multiplication overhead. Switch to `selectinload` only if the child table contains massive text or binary payloads or in specific async workflows.

## 8. 🧠 The Memory Hook

A 1-to-1 relationship is just a Many-to-One with a database `UNIQUE` padlock on the child's foreign key. In SQLAlchemy 2.0, declare the child's FK column as `unique=True`, type the parent attribute as scalar `Mapped[Optional[Child]]`, and pair `joinedload` with `cascade="all, delete-orphan"` to prevent N+1 queries and ghost records.


