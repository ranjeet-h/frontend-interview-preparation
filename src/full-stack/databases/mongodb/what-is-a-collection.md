# What is a collection

## 1. The Real-World Problem — When You Actually Hit This

You're new on a MongoDB project. Someone says "just throw it in the `users` collection." You open Compass and see documents where some have `phone`, some have `address.country`, one has `legacyId` from a migration, and a few have fields that look like they belong in `orders`.

You wonder: where is the schema? Is this one collection or three concepts mashed together? Queries get slower because you're filtering on fields that only half the documents have. Indexes bloat because they index sparse paths.

Understanding **collections** is the first step to not turning MongoDB into a junk drawer. A collection is the namespace where you group documents you query the same way — not "any JSON we feel like storing."

## 2. The Analogy — Make the Mechanic Obvious

A collection is a **labeled drawer** in a filing cabinet.

The label (`users`, `orders`, `products`) tells you what kind of packets belong inside. Every packet is a [document](what-is-a-document.md) — a complete folder. Unlike a SQL table, the drawers don't force every folder to use the same internal dividers. But you still wouldn't put invoices and HR records in the same drawer unless you enjoy never finding anything.

The database is the cabinet. [MongoDB](what-is-mongodb.md) can hold many databases per cluster; each database holds many collections.

## 3. The Full Explanation — How It Actually Works

A **collection** is a grouping of BSON [documents](what-is-a-document.md) within a database. Naming convention: lowercase plural (`users`, `order_events`). There is no `CREATE TABLE` with column definitions — collections are created implicitly on first insert.

**What collections are:**

- The unit you query: `db.users.find({ ... })`
- The unit you index: indexes are per collection ([indexing](what-is-mongodb-indexing.md))
- The unit of namespace in Atlas backups and permissions

**What collections are not:**

- A strict schema contract (unless you add [JSON Schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/))
- A one-to-one map with SQL tables — one logical "user" might span `users` and `sessions` collections, or one `users` document might [embed](when-should-you-embed-documents.md) addresses

**Collections vs SQL tables:**

| Tables | Collections |
|--------|-------------|
| Fixed columns | Flexible fields per document |
| Rows are uniform shape | Documents can differ |
| Joins across tables | Prefer embedding or `$lookup` |
| Schema in DDL | Schema in application + optional validation |

**Capped collections** — special type with fixed size, FIFO order, used for logs and queues. Rare in interviews unless asked.

**Naming and design:** One collection per entity type you query independently. Don't mix `users` and `orders` in one collection "because they're both JSON." Split by access pattern and lifecycle.

## 4. See It In Practice — Real Code or Queries

```javascript
// mongosh — switch database (creates it on first write)
use ecommerce

// Insert creates the collection if it doesn't exist
db.products.insertOne({
  name: "Desk Lamp",
  price: 49.99,
  category: "home"
})

// List collections
show collections
// products

// Explicit create (optional — usually you don't need this)
db.createCollection("audit_logs", {
  capped: true,
  size: 10485760,
  max: 5000
})

// Count documents
db.products.countDocuments({ category: "home" })

// Drop collection (destructive)
// db.products.drop()
```

Create an index on the collection:

```javascript
db.products.createIndex({ sku: 1 }, { unique: true })
```

Validation rules (production pattern):

```javascript
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "createdAt"],
      properties: {
        email: { bsonType: "string" },
        createdAt: { bsonType: "date" }
      }
    }
  }
})
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a collection in MongoDB?**

A named group of documents within a database, analogous to a table but without a fixed column schema. You query and index at the collection level.

**Q: How is a collection different from a table?**

Tables require defined columns and uniform row shape. Collections hold documents that may have different fields; structure is enforced by application code or optional validators, not by default at insert time.

**Q: When do you create multiple collections vs one big collection?**

Separate collections when entities have different lifecycles, query patterns, or security boundaries. Don't use one collection with a `type` discriminator unless you have a strong reason (polymorphism pattern) and indexes to match.

**Q: Does an empty collection take space?**

Minimal metadata. Collections grow with documents and indexes.

**Q: Collection naming conventions?**

Lowercase, plural nouns, no spaces (`order_items` or `orderItems` — pick one style per project). Avoid mixing semantics (`data`, `stuff`).

## 6. The Traps — What Goes Wrong in Production

**Kitchen-sink collections.** One `events` collection for clicks, errors, and audit trails with 200 optional fields — indexes become useless. Split by query pattern.

**Mirroring SQL table-per-entity without thinking.** Twelve collections with `$lookup` on every read recreates relational pain. See [schema design](how-is-mongodb-schema-designed.md).

**No indexes on new collections.** Copying dev data (small) hides missing indexes until production scale.

**Case-sensitive collection names.** `Users` and `users` are different collections on case-sensitive deployments.

**Huge documents in the wrong collection.** Storing 5 MB blobs inside `users` — use GridFS or object storage (S3), keep the collection lean.

## 7. Compare With Related Concepts

| Concept | Difference | When to use which |
|--------|------------|-------------------|
| [Document](what-is-a-document.md) | One record; collection holds many | Document = one row equivalent; collection = table equivalent |
| Database | Namespace above collections (`ecommerce.users`) | Separate apps or bounded contexts per database |
| [BSON](what-is-bson.md) | Wire/storage format of documents | Collection is organizational; BSON is encoding |
| SQL schema | Enforced structure | MongoDB collection + validator if you want enforcement |

## 8. 🧠 The Memory Hook

A collection is a labeled drawer for the same kind of folder — not a magic bucket where any JSON goes, but the place you query and index one family of [documents](what-is-a-document.md) together.
