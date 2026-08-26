# What is TTL index

## 1. The Real-World Problem — When You Actually Hit This

Your API stores session documents, password-reset tokens, and API audit logs in MongoDB. Nobody deletes them. After six months the `sessions` collection is 40 GB. Backup windows stretch, replication lag grows, and someone asks why expired sessions from last year are still queryable.

You do not want a cron job that runs `deleteMany` and locks the collection at 2 a.m. You want the database to drop stale rows automatically. That is a TTL (time-to-live) index.

## 2. The Analogy — Make the Mechanic Obvious

TTL is an expiration date sticker on perishable goods in a warehouse.

Each document carries a date field (`expiresAt`, `createdAt`). The TTL index tells MongoDB: "Anything past its expiration date should be thrown out." A background worker walks the index periodically and deletes expired documents — not the moment they expire, but on the next cleanup pass.

You still choose what date means "expired." The index only automates removal.

## 3. The Full Explanation — How It Actually Works

A TTL index is a special single-field index on a **BSON date** field, created with `expireAfterSeconds`.

MongoDB's TTL monitor thread runs about **every 60 seconds** and deletes documents where:

`indexedDate + expireAfterSeconds <= current time`

Two common patterns:

1. **Absolute expiry** — store `expiresAt` as the moment the row should die and set `expireAfterSeconds: 0`. Delete when `expiresAt` is in the past.
2. **Relative expiry** — store `createdAt` and set `expireAfterSeconds: 86400` (24 hours). Delete 24 hours after `createdAt`.

**Constraints:**

- TTL indexes must be on a **date** field (or array of dates — rare).
- TTL deletion is **not real-time**. Expect up to ~60 seconds (sometimes more under load) after the logical expiry before the document disappears.
- Deletion is a normal remove operation — it shows up in oplog, triggers change streams, and counts toward delete throughput.
- TTL indexes are **single-field** (not compound with other keys in the TTL sense — you create one TTL index on one date field).
- Documents missing the indexed date field are **not** removed by TTL.

**Not for:** immediate enforcement ("user must be logged out the second token expires" — enforce in app logic), precise scheduling, or legal retention where you must archive before delete.

## 4. See It In Practice — Real Code or Queries

```javascript
// mongosh — session tokens with absolute expiry
db.sessions.drop();
db.sessions.insertMany([
  { userId: "u1", token: "abc", expiresAt: new Date(Date.now() - 3600 * 1000) }, // already expired
  { userId: "u2", token: "def", expiresAt: new Date(Date.now() + 3600 * 1000) }  // still valid
]);

db.sessions.createIndex(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "sessions_ttl" }
);

// After the TTL monitor runs (~60s), expired doc is removed automatically
db.sessions.find();
```

**Relative TTL on `createdAt`:**

```javascript
db.audit_logs.drop();
db.audit_logs.insertOne({
  action: "login",
  createdAt: new Date()
});

// Delete each log 7 days after createdAt
db.audit_logs.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60, name: "audit_logs_ttl" }
);
```

**Verify index definition:**

```javascript
db.sessions.getIndexes().filter((idx) => idx.name === "sessions_ttl");
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What does a TTL index do?**

It automatically deletes documents when a date field plus `expireAfterSeconds` is less than or equal to the current time. MongoDB runs a background TTL monitor to perform the deletes.

**Q: How is `expireAfterSeconds: 0` different from `86400`?**

Zero means "delete when the date value itself is in the past" — the field holds the absolute expiry instant. `86400` means "delete 86,400 seconds after the date in this field" — the field usually holds creation time.

**Q: Is deletion immediate at the exact expiry second?**

No. The TTL thread runs on a ~60-second interval. Treat TTL as lazy cleanup, not a real-time timer.

**Q: Can you TTL on a string timestamp?**

No. The indexed field must be a BSON date. Store `new Date()` or convert before insert.

**Q: What happens to documents without the date field?**

They are not removed by TTL. They also may not appear in a sparse TTL index the way you expect — missing dates mean no automatic expiry.

## 6. The Traps — What Goes Wrong in Production

**Using TTL for instant auth enforcement.** A token may remain valid in the database for another minute after logical expiry. Validate expiry in application code for security-sensitive paths; use TTL for storage hygiene.

**Wrong date type.** ISO strings in JSON are not BSON dates until parsed. `expiresAt: "2026-01-01"` does not TTL-delete.

**Expecting TTL on compound indexes.** TTL is a single-field date index with `expireAfterSeconds`. You cannot TTL-expire based on two fields.

**Huge burst deletes.** Millions of documents expiring at the same second create a delete storm — replication lag and disk I/O spike. Stagger expiry timestamps if you control writes.

**Forgetting change streams and backups.** TTL deletes are real deletes. Downstream consumers and retention policies must account for data disappearing without an app-level `deleteMany`.

**Sharding nuance.** TTL works on sharded clusters, but monitor per-shard delete load; uneven shard keys can concentrate expiry on one shard.

## 7. Compare With Related Concepts

**TTL index vs cron `deleteMany`:** Cron gives precise schedule control and batch sizing; TTL is hands-off but coarse-grained (~60s) and less controllable under load.

**TTL index vs application-level expiry check:** App checks enforce correctness at read time; TTL reclaims disk. Use both for sessions — validate on read, TTL for cleanup.

**TTL index vs capped collections:** Capped collections drop oldest documents by size/order, not by calendar time. TTL is time-based per document.

**Rule:** TTL for automatic data aging; app logic for "is this still valid right now?"

## 8. 🧠 The Memory Hook

TTL = date field + `expireAfterSeconds`, background janitor every ~60 seconds — great for cleaning stale rows, not for millisecond-precise security expiry.
