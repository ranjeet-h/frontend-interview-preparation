# How Do You Define Indexes in Mongoose

## 1. Why This Exists — The Problem First

Your users collection hits two million documents. Login searches `{ email: "ada@example.com" }` with no index — MongoDB scans every document, CPU spikes, and p99 latency jumps from 20 ms to 3 seconds. You add `{ email: 1 }` in a migration script but forget to call it in staging; production deploys, the index builds in the background, and for an hour every login still collscan's until the build finishes.

Indexes in Mongoose are declared on the **schema** so they travel with the model definition, sync via `Model.syncIndexes()` or migrations, and match what your queries actually filter and sort on. Defining them wrong — or only in the shell — is one of the most common production performance failures in MongoDB apps.

## 2. The Analogy — Make It Obvious

A MongoDB collection without indexes is a **phone book sorted by date of entry**. To find "Smith," you read every page from the start.

An index is the **alphabetical index at the back** — a separate, sorted structure pointing to the right page. Compound index `{ lastName: 1, firstName: 1 }` is like indexing by last name first, then first name within each last name — great for "Smith, Ada" but useless if you only search first name.

Mongoose schema indexes are the **blueprint** telling the database which index pages to maintain whenever data changes.

## 3. How It Actually Works — The Full Explanation

MongoDB indexes are **B-tree structures** (by default) stored separately from documents. Mongoose lets you declare them in three main ways:

**1. Field-level `index: true`**

```js
email: { type: String, index: true }
```

Creates a single-field ascending index. `unique: true` also creates an index.

**2. Schema-level `schema.index()`**

```js
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, createdAt: -1 });
```

Preferred for compound indexes, partial filters, TTL, text, and sparse options.

**3. `autoIndex` / `syncIndexes`**

- In development, Mongoose may auto-build indexes on model compile (`autoIndex: true` by default in dev).
- In production, `autoIndex` is usually **false** — indexes are built via migrations or `syncIndexes()` during deploy to avoid surprise load.

**Index types you declare in Mongoose:**

| Type | Purpose |
|---|---|
| Single / compound | Equality, sort, range on listed fields |
| Unique | Enforce uniqueness (email, slug) |
| Sparse | Index only docs where field exists |
| Partial | Index subset matching a filter expression |
| TTL | Auto-delete docs after `expireAfterSeconds` |
| Text | Full-text search on string fields |

**ESR rule for compound indexes:** Equality fields first, then Sort fields, then Range fields. Query `{ status: "active", createdAt: { $gte: date } }` with sort `createdAt: -1` → index `{ status: 1, createdAt: -1 }`.

**Mongoose vs MongoDB:** Mongoose sends `createIndex` commands. The index lives in MongoDB; the schema is the source of truth in your codebase.

## 4. Real Code — See It Working

**Field-level and schema-level indexes**

```js
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true, // WHY: unique implies an index on email
  },
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  lastLoginAt: Date,
});

// WHY: compound index matches tenant-scoped list sorted by recent login
userSchema.index({ tenantId: 1, lastLoginAt: -1 });

// WHY: partial index — only index active users, smaller and faster
userSchema.index(
  { tenantId: 1, email: 1 },
  { partialFilterExpression: { status: "active" } }
);

const User = mongoose.model("User", userSchema);
```

**TTL index for session cleanup**

```js
const sessionSchema = new mongoose.Schema({
  userId: ObjectId,
  expiresAt: { type: Date, required: true },
});

// WHY: MongoDB deletes documents when expiresAt is older than 0 seconds past that date
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

**Syncing indexes in production deploy**

```js
async function ensureIndexes() {
  await mongoose.connect(process.env.MONGODB_URI);
  // WHY: drops indexes not in schema, creates missing ones — use carefully in prod
  await mongoose.model("User").syncIndexes();
}
```

**Verify with `explain()`**

```js
const plan = await User.find({ tenantId, status: "active" })
  .sort({ lastLoginAt: -1 })
  .limit(20)
  .explain("executionStats");

console.log(plan.executionStats.executionStages.stage); // IXSCAN, not COLLSCAN
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you define an index in Mongoose?**

Use `index: true` or `unique: true` on a field for simple single-field indexes. For compound, partial, TTL, or text indexes, use `schema.index(keys, options)`. Build them in production with `syncIndexes()`, migration scripts, or DBA tooling — not relying on dev autoIndex behavior.

**Q: What is the difference between `createIndex` and Mongoose `schema.index()`?**

`schema.index()` registers intent in your ODM layer; Mongoose issues `createIndex` to MongoDB when indexes are built. The shell's `createIndex` works too, but schema-defined indexes stay versioned with your code.

**Q: When should you use a compound index?**

When queries filter or sort on multiple fields together. Order matters: `{ a: 1, b: 1 }` supports `{ a }` and `{ a, b }` but not `{ b }` alone efficiently.

**Q: What is a partial index?**

An index that only includes documents matching `partialFilterExpression`. Smaller index, faster writes, but queries must include the same predicate (or compatible) to use it.

**Q: Should `autoIndex` be true in production?**

Generally **no**. Index builds lock collection metadata and consume I/O. Build indexes in controlled deploy steps and monitor build progress on large collections.

## 6. The Traps — What Goes Wrong

**Indexing every field.** Each index slows writes and uses RAM. Index fields your queries actually use — check slow query logs and `explain()`.

**Wrong compound field order.** Index `{ createdAt: -1, status: 1 }` does not help `{ status: "active" }` alone. Put equality-filtered fields first.

**Duplicate indexes.** `unique: true` on a field **and** `schema.index({ email: 1 })` — redundant. MongoDB stores both until you drop one.

**Relying on `syncIndexes()` without review.** It **drops** indexes not declared in the schema. A DBA-added emergency index disappears on deploy.

**Building large indexes during peak traffic.** Background index builds on millions of docs still impact performance. Schedule off-peak or use rolling index builds on sharded clusters.

**Case-insensitive email without a plan.** Unique on raw `email` allows `Ada@x.com` and `ada@x.com`. Use collation `{ locale: 'en', strength: 2 }` on the index if you need case-insensitivity.

## 7. Compare With Related Concepts

**Schema index vs MongoDB Atlas suggested indexes**

Atlas suggests from slow queries; Mongoose schema indexes express **intended** design. Align both — schema is source of truth in code.

**Index vs `unique` validator**

`unique: true` creates an index and enforces at DB level. App-level validation alone cannot prevent race duplicates — two concurrent inserts both pass validation, only unique index stops the second.

**Mongoose `select: true` / projection vs index**

Projection reduces data returned; index reduces documents **examined**. You need both for fast large-collection reads.

**When to use text index vs Atlas Search**

Text indexes are basic full-text. Product search with facets and relevance scoring usually needs Atlas Search or Elasticsearch — not a single `text` index.

## 8. 🧠 The Memory Hook — What Sticks

Mongoose indexes are the **table of contents you commit to git** — `schema.index()` for compound and special cases, `unique` when duplicates must be impossible at the database. Declare what your queries filter and sort on, build in deploy, verify with `explain()` — **IXSCAN good, COLLSCAN on big collections bad**.
