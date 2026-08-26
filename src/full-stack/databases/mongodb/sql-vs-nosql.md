# SQL vs NoSQL

## 1. The Real-World Problem — When You Actually Hit This

The CTO says "we need a database" and half the team votes PostgreSQL, half votes MongoDB, and nobody can articulate why except "I've used it before" or "Netflix uses it."

You pick MongoDB for a billing system with strict ledger rules, or PostgreSQL for a social feed where every post is a different JSON shape. Six months later you're fighting the database: migrations vs `$lookup` hell, or missing foreign keys vs rigid ALTER TABLE pain.

SQL vs NoSQL is not a religion. It is a decision about **data shape**, **consistency needs**, **query patterns**, and **how the system will grow**. The interview question — and the real job — is knowing which tradeoffs you're buying, not reciting "SQL is ACID, NoSQL is scalable."

## 2. The Analogy — Make the Mechanic Obvious

**SQL** is a warehouse with labeled bins on fixed shelves. Every item type has a slot. Finding "all red widgets in aisle 3" is easy because everything is sorted and cross-referenced. Adding a new attribute for one product type means relabeling shelves or adding a new aisle — structured, but deliberate.

**NoSQL (document stores like MongoDB)** is a room of complete project binders. Each binder holds everything about one project — client, tasks, notes — in one place. Grab one binder, you're done. Finding "every project where task 7 is overdue across all binders" is harder than in the warehouse.

Neither room is wrong. The mistake is storing loose screws in binders or storing entire kitchen renovations on a single pegboard hook.

## 3. The Full Explanation — How It Actually Works

"SQL" usually means relational databases: PostgreSQL, MySQL, SQL Server. Data lives in tables with typed columns. Relationships use foreign keys. You query with SQL — `JOIN`, `GROUP BY`, transactions across rows.

"NoSQL" is a bucket of different systems:

| Type | Examples | Model |
|------|----------|--------|
| Document | [MongoDB](what-is-mongodb.md), CouchDB | JSON/BSON documents in collections |
| Key-value | Redis, DynamoDB | Opaque key → value |
| Wide-column | Cassandra, HBase | Rows with dynamic columns |
| Graph | Neo4j | Nodes and edges |

When people say "SQL vs NoSQL" in a MongoDB interview, they mean **relational SQL vs document NoSQL**.

**SQL strengths:**

- Strong schema enforcement and migrations as a feature.
- Complex queries across many entities via joins.
- Mature tooling for reporting, BI, ad-hoc analytics.
- ACID transactions as the default mental model.

**Document NoSQL strengths (MongoDB):**

- Flexible [documents](what-is-a-document.md) — nested objects and arrays without join tables.
- Schema evolution without ALTER for every new optional field.
- Horizontal scaling via [sharding](what-is-sharding.md) when designed for partition keys.
- Read patterns that fetch one document per screen/API call.

**Myths to kill:**

- "NoSQL can't do transactions." MongoDB has multi-document transactions (4.0+). Many SQL systems scale reads with replicas too.
- "SQL can't scale." PostgreSQL and MySQL run huge workloads; sharding and read replicas are common.
- "Pick one for the whole company." Polyglot persistence is normal: Postgres for money, MongoDB for catalogs, Redis for cache.

The real decision framework:

1. **Shape of data** — fixed relational graph vs document-per-aggregate?
2. **Queries** — ad-hoc joins and reports vs known access patterns?
3. **Consistency** — ledger-grade invariants vs eventual OK on some reads?
4. **Team and ops** — who runs it, what you already know?

## 4. See It In Practice — Real Code or Queries

Same "user with recent orders" — two models.

**SQL (PostgreSQL):**

```sql
SELECT u.id, u.email, o.id AS order_id, o.total
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE u.email = 'alice@example.com'
ORDER BY o.created_at DESC
LIMIT 5;
```

Normalized. Order line items live in another table. One source of truth per fact.

**MongoDB (embedded — one read):**

```javascript
db.users.findOne(
  { email: "alice@example.com" },
  { projection: { email: 1, orders: { $slice: -5 } } }
)
// Document might look like:
// { email: "...", orders: [ { id, total, items: [...] }, ... ] }
```

**MongoDB (referenced — two reads or `$lookup`):**

```javascript
const user = db.users.findOne({ email: "alice@example.com" })
db.orders.find({ userId: user._id }).sort({ created_at: -1 }).limit(5)
```

See [embedding vs referencing](embedding-vs-referencing.md) for when each MongoDB shape wins.

## 5. Interview Questions — All of Them, Done Properly

**Q: SQL vs NoSQL — how do you decide?**

Start with access patterns and data shape, not buzzwords. If entities are highly relational, you need complex ad-hoc queries, and schema stability is a feature — SQL. If aggregates are naturally nested, fields vary by record, and the app reads whole objects — document store. Then layer consistency, scale, and team expertise.

**Q: Is MongoDB eventually consistent?**

In a [replica set](what-is-replica-set.md), reads from secondaries can be stale depending on read concern. Reads from the primary are strongly consistent for that node. It's not "eventually consistent only" — it's configurable.

**Q: Can MongoDB replace PostgreSQL for everything?**

No sensible team tries. Money, inventory ledgers, and heavy relational reporting often stay in SQL. Product catalogs, CMS content, and user session profiles often fit documents well.

**Q: What does ACID mean in this comparison?**

SQL databases traditionally guarantee ACID across transactions by default. MongoDB guarantees atomicity on a single document always; multi-document ACID requires transactions and replica set deployment. Design single-document updates when you can.

**Q: What is the CAP theorem angle?**

Under partition, you trade consistency vs availability. MongoDB replica sets prioritize availability with configurable read/write concerns; SQL primaries often favor consistency on the primary. Don't recite CAP without tying it to the product's tolerance for stale reads.

## 6. The Traps — What Goes Wrong in Production

**Choosing NoSQL for "speed" without modeling.** MongoDB without [indexes](what-is-mongodb-indexing.md) and [schema design](how-is-mongodb-schema-designed.md) is slower than well-indexed Postgres.

**Choosing SQL for rapidly evolving nested UI state.** You'll serialize JSON into a column anyway — ask if that's Postgres `jsonb` or a real document store.

**Big bang migration between paradigms.** Moving Postgres → Mongo (or reverse) because of hype destroys quarters. Migrate bounded contexts.

**Ignoring operational cost.** Managed Atlas vs self-hosted Postgres vs DynamoDB pricing and backup stories matter at scale.

**Treating "schemaless" as no validation.** Both sides need application or database-level validation.

## 7. Compare With Related Concepts

| Concept | Difference | Rule of thumb |
|--------|------------|---------------|
| [MongoDB](what-is-mongodb.md) | One document NoSQL system, not all of NoSQL | SQL vs NoSQL is the category; MongoDB is one option |
| PostgreSQL `jsonb` | Relational DB with JSON column type | Use when mostly relational with some flexible blobs |
| NewSQL (CockroachDB, Spanner) | SQL interface with distributed storage | SQL semantics at global scale — different tradeoff than MongoDB |
| [Embedding vs referencing](embedding-vs-referencing.md) | MongoDB-specific modeling inside NoSQL | SQL vs NoSQL picks the store; embed vs reference picks the document shape |

## 8. 🧠 The Memory Hook

SQL organizes facts in shared shelves for questions you haven't written yet; document NoSQL packs one complete story per folder for questions you already know you'll ask. Pick the room that matches how your app actually opens the data.
