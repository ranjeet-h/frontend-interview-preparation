# What is declarative model

## Detailed explanation

What is declarative model is a core SQLAlchemy topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is declarative model by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply SQLAlchemy rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, what is declarative model affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is the declarative model in SQLAlchemy?
- **The Engine Mechanism (Why it behaves this way):** The declarative model is a way of defining ORM models by combining table definition and class mapping in a single step. You create a base class with `declarative_base()` (or `registry().generate_base()` in 2.0), then subclass it. Each subclass defines `__tablename__` and column attributes, and SQLAlchemy automatically creates the corresponding `Table` object and configures the mapper. This eliminates the need to separately define `Table` objects and `mapper()` calls. In SQLAlchemy 2.0, the declarative model uses `Mapped[T]` type annotations with `mapped_column()` for better IDE support and type checking.
- **The Unforgettable Mental Model:** The **Self-Assembling Furniture**. Instead of buying the wood, cutting it, drilling holes, and assembling separately (classical mapping), declarative models come as a kit where the instructions are built into the pieces — define the class and the table appears automatically.
- **The Trap:** Thinking declarative is the only way to define models. SQLAlchemy also supports classical mapping (separate Table and mapper) and hybrid approaches. Declarative is the most common but not the only option.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The declarative model combines table definition and class mapping in one step. You subclass a declarative base, define __tablename__ and columns as class attributes, and SQLAlchemy automatically creates the Table and configures the mapper. In SQLAlchemy 2.0, I use Mapped type annotations with mapped_column() for better type checking. It's the most common approach because it's concise and keeps schema and model logic together."

#### How do you define a model using the declarative base?
- **The Engine Mechanism (Why it behaves this way):** You import `declarative_base`, create a base instance, then subclass it. Each model class defines `__tablename__` as a string, and columns as `mapped_column()` calls with type, constraints, and defaults. Relationships are defined with `relationship()`. The base's `MetaData` collects all table definitions, and `Base.metadata.create_all(engine)` creates all tables in the database. In SQLAlchemy 2.0 style: `class User(Base): __tablename__ = 'users'; id: Mapped[int] = mapped_column(primary_key=True); name: Mapped[str] = mapped_column(String(50))`.
- **The Unforgettable Mental Model:** The **Recipe Card**. Each model class is a recipe: the table name is the dish name, columns are ingredients with quantities and types, and relationships are serving suggestions. The base is the cookbook that collects all recipes.
- **The Trap:** Forgetting `__tablename__` — SQLAlchemy can't create a table without it. Or defining columns without types, which SQLAlchemy can't map to database column types.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I subclass the declarative base, define __tablename__, and add columns using mapped_column() with type annotations. For example: id as Mapped[int] with primary_key=True, name as Mapped[str] with String(50). Relationships use relationship() with back_populates for bidirectional navigation. Then Base.metadata.create_all(engine) creates all tables. I keep models in a models.py file and import them where needed for queries."

#### What is the difference between declarative and classical mapping?
- **The Engine Mechanism (Why it behaves this way):** Declarative mapping combines table definition and class mapping in a single class definition. Classical mapping separates them: you define a `Table` object explicitly, then call `mapper()` to link it to a plain Python class. Declarative is more concise and is the standard approach. Classical mapping is useful when you need to map to existing classes (e.g., classes from a third-party library) or when you want to separate schema definition from model logic. Both produce the same runtime behavior — the difference is purely in how you define the mapping.
- **The Unforgettable Mental Model:** The **Pre-built vs. Custom House**. Declarative is a pre-built house — walls, plumbing, and electrical are all designed together. Classical is a custom build — you design the blueprint (Table) separately, then hire a contractor (mapper) to fit it to an existing structure (class).
- **The Trap:** Thinking classical mapping is deprecated. It's fully supported and occasionally necessary, but declarative is the recommended default for new projects.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Declarative mapping combines table and class definition in one step — you subclass a base and define columns as attributes. Classical mapping separates them — you define a Table object, then call mapper() to link it to a class. Both produce identical runtime behavior. I use declarative for new projects because it's concise. Classical mapping is useful when mapping to existing classes you don't control, or when you want to keep schema definition separate from model logic."

#### What is Mapped and mapped_column in SQLAlchemy 2.0?
- **The Engine Mechanism (Why it behaves this way):** In SQLAlchemy 2.0, `Mapped[T]` is a type annotation that declares a column's Python type, and `mapped_column()` replaces the older `Column()` syntax for declarative models. Together, they provide full type checking support: IDEs can autocomplete column names, type checkers can verify query filters, and the ORM can infer SQL types from Python types. For example, `name: Mapped[str] = mapped_column(String(50))` tells both the type checker (it's a str) and SQLAlchemy (it's a VARCHAR(50)). This eliminates the disconnect between Python types and SQL types that existed in 1.x.
- **The Unforgettable Mental Model:** The **Bilingual Label**. Mapped[str] tells Python "this is a string." mapped_column(String(50)) tells the database "this is VARCHAR(50)." Together, they're a label that both languages understand.
- **The Trap:** Mixing 1.x and 2.0 syntax in the same model. Use either `Column()` (1.x style) or `mapped_column()` with `Mapped` (2.0 style), not both.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SQLAlchemy 2.0 introduces Mapped type annotations and mapped_column() for declarative models. Mapped[str] declares the Python type for type checking, and mapped_column(String(50)) declares the SQL column. Together, they give full IDE autocomplete and type checker support. For example: name: Mapped[str] = mapped_column(String(50), nullable=False). This replaces the 1.x style of Column(String(50)) without type annotations. I always use 2.0 style in new projects for better type safety."

#### How does the declarative model handle relationships?
- **The Engine Mechanism (Why it behaves this way):** Relationships in declarative models are defined using the `relationship()` function as a class attribute. You specify the target class (as a string or class reference), the loading strategy (lazy, joined, selectin), cascade rules, and `back_populates` for bidirectional navigation. SQLAlchemy resolves string references lazily, so you can reference classes defined later in the file. The relationship doesn't create a database column — the foreign key is defined on the child model's `mapped_column(ForeignKey('parent.id'))`. The relationship creates a Python-level attribute that loads related objects on access.
- **The Unforgettable Mental Model:** The **Phone Contact List**. The foreign key is the phone number stored in the database. The relationship is the contact entry in your phone — it lets you call the person by name instead of dialing the number manually. back_populates means both people have each other in their contacts.
- **The Trap:** Forgetting `back_populates` — without it, the relationship is unidirectional. Or confusing `backref` (legacy, creates the reverse automatically) with `back_populates` (explicit, requires definition on both sides).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Relationships in declarative models use relationship() as a class attribute. You specify the target class, loading strategy, cascade rules, and back_populates for bidirectional navigation. The foreign key is defined on the child model with ForeignKey(), not in the relationship. String references are resolved lazily, so order of class definition doesn't matter. I always use back_populates (not the legacy backref) for explicit bidirectional relationships, and configure the loading strategy based on access patterns."

## 8. Active recall test

1. **What is the declarative model?**
   - **Explanation:** A way of defining ORM models by combining table definition and class mapping in a single step. Subclass declarative_base(), define __tablename__ and columns, and SQLAlchemy auto-creates the Table and configures the mapper.

2. **How do you define a declarative model?**
   - **Explanation:** Subclass the base, define __tablename__, add columns with mapped_column() and Mapped type annotations, define relationships with relationship(). Then call Base.metadata.create_all(engine) to create tables.

3. **Declarative vs classical mapping?**
   - **Explanation:** Declarative combines table and class definition in one step. Classical separates them — define Table explicitly, then call mapper() to link to a class. Both produce identical runtime behavior. Declarative is the recommended default.

4. **What are Mapped and mapped_column in SQLAlchemy 2.0?**
   - **Explanation:** Mapped[T] is a type annotation declaring the Python type. mapped_column() replaces Column() for declarative models. Together they provide full type checking — IDE autocomplete and type checker support. Example: name: Mapped[str] = mapped_column(String(50)).

5. **How are relationships defined in declarative models?**
   - **Explanation:** Using relationship() as a class attribute with target class, loading strategy, cascade rules, and back_populates for bidirectional navigation. The foreign key is defined on the child model with ForeignKey(), not in the relationship. String references are resolved lazily.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is declarative model in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is declarative model in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
