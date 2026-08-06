# One-to-one relationship

## Detailed explanation

One-to-one relationship is a core SQLAlchemy topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand one-to-one relationship by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, one-to-one relationship affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is a one-to-one relationship in SQLAlchemy?
- **The Engine Mechanism (Why it behaves this way):** A one-to-one relationship means each row in table A is associated with exactly one row in table B, and vice versa. In SQLAlchemy, you implement it as a many-to-one relationship with `uselist=False` on the `relationship()`. The database enforces it with a UNIQUE constraint on the foreign key column. For example, a User has one Profile: `profile = relationship('Profile', back_populates='user', uselist=False)` and `user_id = mapped_column(ForeignKey('users.id'), unique=True)`. The `uselist=False` tells SQLAlchemy to return a single object instead of a collection. The UNIQUE constraint ensures no two profiles reference the same user.
- **The Unforgettable Mental Model:** The **Marriage Certificate**. One person, one spouse. The foreign key is the marriage license, and the UNIQUE constraint ensures you can't be married to two people at once. uselist=False means you refer to "my spouse" (singular), not "my spouses" (plural).
- **The Trap:** Forgetting the UNIQUE constraint on the foreign key. Without it, the database allows multiple rows to reference the same parent, making it a many-to-one relationship at the database level even if the ORM treats it as one-to-one.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A one-to-one relationship is a many-to-one with uselist=False on the relationship and a UNIQUE constraint on the foreign key. The UNIQUE constraint is critical — it enforces the one-to-one at the database level. uselist=False tells the ORM to return a single object, not a collection. I use this for User-Profile, Order-ShippingAddress, or any case where each entity has exactly one associated entity of another type."

#### How do you implement a one-to-one relationship?
- **The Engine Mechanism (Why it behaves this way):** On the child model, define the foreign key column with `unique=True`: `user_id = mapped_column(ForeignKey('users.id'), unique=True)`. On the parent model, define the relationship with `uselist=False`: `profile = relationship('Profile', back_populates='user', uselist=False)`. On the child model, define the reverse relationship: `user = relationship('User', back_populates='profile')`. The `unique=True` on the FK column creates a UNIQUE index in the database. `uselist=False` makes the parent's relationship attribute return a single object (or None) instead of a list.
- **The Unforgettable Mental Model:** The **Assigned Parking Spot**. Each employee (User) gets exactly one parking spot (Profile). The spot has the employee's ID on it (FK), and no two spots can have the same ID (UNIQUE). The employee refers to "my spot" (singular, uselist=False).
- **The Trap:** Defining uselist=False on both sides. It should only be on the side that returns a single object (the parent side pointing to the child). The child's reverse relationship to the parent is naturally single-valued since it's a many-to-one.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I define the FK on the child with unique=True, the relationship on the parent with uselist=False, and the reverse relationship on the child. For example: Profile has user_id = mapped_column(ForeignKey('users.id'), unique=True), User has profile = relationship('Profile', back_populates='user', uselist=False), and Profile has user = relationship('User', back_populates='profile'). The UNIQUE constraint enforces one-to-one at the DB level, and uselist=False makes the ORM return a single object."

#### When should you use one-to-one vs embedding data in the same table?
- **The Engine Mechanism (Why it behaves this way):** Use one-to-one when: (1) The related data has a different lifecycle (Profile can be updated independently of User). (2) The related data is large/rarely accessed (storing it separately avoids loading it with every user query). (3) The related data has its own relationships (Profile has its own FK to other tables). (4) You need to enforce optionality at the schema level (Profile can be NULL for some users). Embed in the same table when: the data is always accessed together, small in size, and shares the same lifecycle. The tradeoff is query complexity (JOIN vs single table) vs. data organization.
- **The Unforgettable Mental Model:** The **Attached Garage vs. the Detached Studio**. An attached garage (embedded columns) is convenient — you access it directly from the house. A detached studio (one-to-one table) is separate — you walk outside to get there, but it has its own utilities and can be rented independently.
- **The Trap:** Creating one-to-one relationships for data that's always accessed together. This adds JOIN overhead without benefit. If you always load User and Profile together, embed Profile fields in the User table.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use one-to-one when the related data has a different lifecycle, is large/rarely accessed, or has its own relationships. I embed data in the same table when it's always accessed together and small. For example, User password_hash is embedded (always needed with user), but User profile bio is a separate table (large, rarely accessed). The key question is: do I ever query the parent without the child? If yes, separate table. If no, embed."

#### Can a one-to-one relationship be optional?
- **The Engine Mechanism (Why it behaves this way):** Yes. A one-to-one relationship is optional when the foreign key column is nullable (`nullable=True`, which is the default). This means a User can exist without a Profile — the profile attribute returns None. To make it mandatory, set `nullable=False` on the foreign key column, which requires a Profile to exist when the User is created. You can also enforce it at the application level with validation, but the database constraint (`NOT NULL`) is the authoritative enforcement.
- **The Unforgettable Mental Model:** The **Optional Accessory**. A phone case (Profile) is optional for a phone (User). Some phones have cases, some don't. The case has the phone's model number on it (FK), but not every phone needs one (nullable).
- **The Trap:** Assuming the ORM enforces optionality. The ORM doesn't prevent you from accessing a None relationship — it returns None. You must handle None in your code or use nullable=False for database-level enforcement.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Yes, one-to-one relationships are optional by default — the FK column is nullable, so the parent can exist without a child. The relationship attribute returns None. To make it mandatory, I set nullable=False on the FK column, which the database enforces. I always handle None in application code even for mandatory relationships, because there's a window between creating the parent and creating the child where the relationship is temporarily None."

## 8. Active recall test

1. **What is a one-to-one relationship?**
   - **Explanation:** Each row in table A associates with exactly one row in table B and vice versa. Implemented as many-to-one with uselist=False on relationship() and UNIQUE constraint on the foreign key column.

2. **How to implement it?**
   - **Explanation:** Child: FK column with unique=True. Parent: relationship with uselist=False and back_populates. Child: reverse relationship with back_populates. UNIQUE enforces at DB level, uselist=False makes ORM return single object.

3. **One-to-one vs embedding in same table?**
   - **Explanation:** Use one-to-one when data has different lifecycle, is large/rarely accessed, or has its own relationships. Embed when data is always accessed together and small. Key question: do I ever query parent without child?

4. **Can one-to-one be optional?**
   - **Explanation:** Yes — FK is nullable by default, so parent can exist without child (relationship returns None). Make mandatory with nullable=False on FK column. Always handle None in application code.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain One-to-one relationship in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define One-to-one relationship in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
