# One-to-many relationship

## Detailed explanation

One-to-many relationship is a core SQLAlchemy topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand one-to-many relationship by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, one-to-many relationship affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is a one-to-many relationship in SQLAlchemy?
- **The Engine Mechanism (Why it behaves this way):** A one-to-many relationship means each row in table A can be associated with zero or more rows in table B, but each row in B is associated with exactly one row in A. In SQLAlchemy, the parent model defines `children = relationship('Child', back_populates='parent')` which returns a collection (list). The child model defines `parent_id = mapped_column(ForeignKey('parents.id'))` and `parent = relationship('Parent', back_populates='children')`. The foreign key is on the "many" side (child). SQLAlchemy loads the collection according to the configured loading strategy — lazy (separate query on access), joined (JOIN in original query), or selectin (second query with WHERE IN).
- **The Unforgettable Mental Model:** The **Tree and Its Branches**. One tree (parent) has many branches (children). Each branch belongs to exactly one tree. The tree holds a list of its branches. The branch points back to its tree via the trunk (foreign key).
- **The Trap:** Putting the foreign key on the parent instead of the child. In one-to-many, the FK always goes on the "many" side. Putting it on the parent would make it a many-to-one from the parent's perspective.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A one-to-many relationship means one parent has many children, and each child belongs to one parent. The foreign key is on the child (the 'many' side). The parent defines a relationship() that returns a collection, and the child defines a relationship() that returns a single parent. I configure the loading strategy based on access patterns — lazy for rarely accessed collections, selectin for collections I iterate over, and joined for collections I always need."

#### How do you implement a one-to-many relationship?
- **The Engine Mechanism (Why it behaves this way):** On the parent model: `children = relationship('Child', back_populates='parent', lazy='selectin')`. On the child model: `parent_id = mapped_column(ForeignKey('parents.id'))` and `parent = relationship('Parent', back_populates='children')`. The `back_populates` creates bidirectional navigation — `parent.children` returns a list of children, and `child.parent` returns the parent. The `lazy` parameter controls when the collection is loaded. Without back_populates, the relationship is unidirectional — you can access children from parent but not parent from child.
- **The Unforgettable Mental Model:** The **Class Roster**. A teacher (parent) has a roster of students (children). Each student has the teacher's ID on their enrollment form (FK). The teacher can look up all their students (parent.children), and each student can look up their teacher (child.parent).
- **The Trap:** Not configuring the loading strategy. The default lazy loading causes N+1 queries when you iterate over multiple parents and access their children collections.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The parent defines children = relationship('Child', back_populates='parent') returning a collection. The child defines parent_id = ForeignKey('parents.id') and parent = relationship('Parent', back_populates='children') returning a single object. I always set the loading strategy explicitly — selectin for collections I iterate over to avoid N+1. The back_populates on both sides creates bidirectional navigation."

#### How do you add or remove items from a one-to-many collection?
- **The Engine Mechanism (Why it behaves this way):** Adding: `parent.children.append(child)` or `child.parent = parent`. Both work because of the bidirectional relationship — SQLAlchemy's relationship instrumentation synchronizes both sides automatically. Removing: `parent.children.remove(child)` or `child.parent = None`. If cascade='all, delete-orphan' is set, removing a child from the collection deletes it from the database. Without delete-orphan, removing sets the FK to NULL. When you commit, SQLAlchemy generates the appropriate INSERT or UPDATE statements.
- **The Unforgettable Mental Model:** The **Playlist**. Adding a song: either drag it into the playlist (parent.children.append) or set the song's playlist field (child.parent = parent). Both work because the playlist and the song are linked. Removing a song: either remove it from the playlist or set its playlist to none.
- **The Trap:** Modifying the collection without committing. Changes are tracked by the session but not persisted until commit(). Or modifying only one side of the relationship without back_populates, causing the other side to be out of sync.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: With bidirectional relationships (back_populates), I can add via parent.children.append(child) or child.parent = parent — both synchronize automatically. I remove via parent.children.remove(child) or child.parent = None. With cascade='all, delete-orphan', removing deletes the child. Without it, the FK is set to NULL. Changes are tracked by the session and persisted on commit(). I prefer the parent-side operations (append/remove) for clarity."

#### What happens to children when you delete a parent?
- **The Engine Mechanism (Why it behaves this way):** It depends on the cascade configuration. With `cascade='all, delete-orphan'`, deleting the parent also deletes all children. With `cascade='all'` (without delete-orphan), deleting the parent deletes children but doesn't handle orphans (children removed from the collection). With no cascade, deleting the parent fails if there are children with foreign key constraints (RESTRICT), or the children's FK is set to NULL (if the FK is nullable). You can also use database-level `ON DELETE CASCADE` on the foreign key, which handles deletion at the database level regardless of ORM cascade settings.
- **The Unforgettable Mental Model:** The **Domino Effect**. cascade='all, delete-orphan' is like tipping the first domino — all the connected dominoes (children) fall too. No cascade is like a fire wall — the parent falls but children stand alone (or the deletion is blocked).
- **The Trap:** Relying only on ORM cascade without database-level ON DELETE CASCADE. If someone deletes a parent row directly in the database (bypassing the ORM), orphaned children remain.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: It depends on cascade settings. With cascade='all, delete-orphan', children are deleted when the parent is deleted. With no cascade, the deletion may fail due to FK constraints or leave orphaned children. I prefer combining ORM cascade with database-level ON DELETE CASCADE on the FK — this ensures children are deleted even when the parent is deleted outside the ORM (direct SQL, admin tools). Defense in depth."

## 8. Active recall test

1. **What is a one-to-many relationship?**
   - **Explanation:** One parent has many children; each child belongs to one parent. FK is on the child (many side). Parent defines relationship() returning a collection; child defines relationship() returning a single parent.

2. **How to implement it?**
   - **Explanation:** Parent: children = relationship('Child', back_populates='parent'). Child: parent_id = ForeignKey('parents.id') and parent = relationship('Parent', back_populates='children'). Set loading strategy explicitly to avoid N+1.

3. **How to add/remove items from the collection?**
   - **Explanation:** Add: parent.children.append(child) or child.parent = parent (both sync with back_populates). Remove: parent.children.remove(child) or child.parent = None. With delete-orphan cascade, removing deletes the child. Changes persist on commit().

4. **What happens to children when parent is deleted?**
   - **Explanation:** Depends on cascade. cascade='all, delete-orphan' deletes children. No cascade may fail (FK constraint) or orphan children. Best practice: combine ORM cascade with database-level ON DELETE CASCADE for defense in depth.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain One-to-many relationship in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define One-to-many relationship in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
