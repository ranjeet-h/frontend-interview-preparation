# What is UUID in PostgreSQL

## 1. The Real-World Problem — When You Actually Hit This

You shipped your first Postgres app with `bigserial` primary keys. Everything worked. Then three things happened at once.

First, a customer noticed your API returns `/orders/1234` and tried `/orders/1235` — and saw someone else's order. Sequential IDs leak how many records you have and make enumeration trivial. You patch it with auth checks, but the IDs still tell competitors your growth rate.

Second, you split the monolith. Now the payments service and the orders service both create records. Both call `nextval('orders_id_seq')` on their own databases. When you try to merge or replicate data, IDs collide. You add a central sequence service, and now it is a single point of failure and a bottleneck.

Third, your mobile app needs offline creates. The phone cannot call home to get the next integer. It needs to create an ID locally that will never collide when it syncs later.

The moment you need IDs that any node, any service, any device can generate without talking to anyone else — and you never want collisions, never want leaking, never want a central counter — that is when UUID exists.

## 2. The Analogy — Make the Mechanic Obvious

Think of two ways to number packages at a warehouse.

With sequential IDs, you have one roll of numbered stickers at the front desk. Every package must walk to that desk to get the next number. If you open a second warehouse across town, packages there must call the first warehouse to get their sticker, or you risk giving two packages the same number. That roll of stickers is `bigserial` and a Postgres sequence. Fast at one desk, painful when distributed.

With UUIDs, every warehouse has its own stamp that prints a globally unique tracking number — part random, part timestamp — without calling anyone. The stamp is so large (128 bits) that two warehouses could stamp a billion packages a second for a century and still not collide. That stamp is `gen_random_uuid()` or `uuidv7()`.

The key difference carries over exactly:

* The sticker roll needs coordination. The stamp does not.
* The sticker roll tells you how many packages shipped (123, 124, 125). The stamp reveals nothing.
* But the sticker roll produces neat, ordered numbers that fit perfectly in a filing cabinet. The random stamp throws packages onto random shelves, so the cabinet needs more work to stay organized. That is the indexing cost of random UUIDs. A time-ordered stamp (UUIDv7) puts new packages near the end of the cabinet again, fixing most of that cost.

## 3. The Full Explanation — How It Actually Works

A UUID is a 128-bit value, stored in Postgres as the native `uuid` type. On disk it is 16 bytes. On screen it looks like 36 characters with dashes: `550e8400-e29b-41d4-a716-446655440000`. That text form is just for humans — inside Postgres it stays 16 bytes.

Do not store it as `text` or `varchar`. Text costs 36 bytes plus overhead, loses type checking, allows garbage like `'hello'`, and you lose the cheap binary comparison. Use the `uuid` type.

How you generate one:

`pgcrypto` is the modern default. Enable it once, then `gen_random_uuid()` gives you a version 4 UUID — 122 bits of cryptographic randomness. No coordination, no sequence call.

`uuid-ossp` is the older extension. It gives you `uuid_generate_v4()` (same random idea), plus `uuid_generate_v1()` (timestamp + MAC address), `uuid_generate_v3()` and `v5()` (hash-based). Most teams today just use `pgcrypto`. Keep `uuid-ossp` in mind because older codebases and interview questions still mention it.

Version matters a lot for performance:

* UUIDv4 is fully random. Great for uniqueness and unpredictability, terrible for locality. Each new row can land anywhere in a B-tree index, so the index gets fragmented and Postgres has to touch more pages. Inserts are scattered across the buffer.
* UUIDv7 is time-ordered. It starts with a millisecond timestamp, then random bits. New values sort after previous ones, almost like a sequence. That gives you global uniqueness without coordination plus B-tree locality — appends go to the right edge of the index, like `bigserial`. Postgres 18 added a built-in `uuidv7()` function; on earlier versions you install the `pg_uuidv7` extension or generate v7 in your app and cast to `uuid`.

Why storage and indexing cost matters:

A `bigint` primary key is 8 bytes. A `uuid` is 16 bytes. Every primary key value is also copied into every secondary index and every foreign key reference. If you have a table with three secondary indexes and two child tables referencing it, that extra 8 bytes is paid five times per row. At 100 million rows, that is real disk and RAM — less of your index fits in shared_buffers and OS cache, queries do more I/O.

A B-tree on `uuid` works just like on any other type — equality lookups are O(log n), range scans work — but random v4 inserts cause more page splits than ordered inserts. Postgres uses a heap table, so the table itself is not clustered on the primary key (unlike MySQL InnoDB, which clusters the table by the PK). That means random UUIDs in Postgres hurt the index, not the heap layout. In MySQL, random UUID PKs hurt far more because the entire table is physically ordered by the PK and every random insert shuffles data pages. In Postgres the penalty is smaller but still there: a scattered PK index is larger and less cache-friendly.

When UUID wins anyway:

* You generate IDs in multiple services, regions, or on the client before the row exists.
* You expose IDs externally and do not want them enumerable. UUIDs are not a replacement for auth checks, but they remove the trivial `+1` attack.
* You need to merge, shard, or replicate data without remapping IDs.
* You need idempotent writes where the client picks the ID before retrying.

When bigserial still wins:

* Single Postgres primary, internal-only IDs, no sharding planned, and you care about smallest storage and fastest ordered scans.
* Heavy range pagination with `WHERE id > $last ORDER BY id LIMIT 100`. Random UUIDs have no meaningful order; you need a `created_at` column for ordering instead.
* Very large tables where index size is the bottleneck and you have no distribution need. Pick `bigint` and accept coordination.

Security, correctness, and observability notes: generating the UUID in the database with `DEFAULT gen_random_uuid()` keeps one source of truth, but generating in the app (Node `crypto.randomUUID()`) lets you know the ID before INSERT for logging, tracing, and idempotent retries. Either is fine — pick one and be consistent. Always validate incoming UUIDs with the `uuid` type; casting rejects malformed input early. Log the `uuid` as-is; do not truncate it in traces.

## 4. See It In Practice — Real Code or Queries

All SQL below is real Postgres. Run it in `psql`.

```sql
-- Enable generation. Pick ONE extension for v4.
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- provides gen_random_uuid()
-- or
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- provides uuid_generate_v4()

-- On Postgres 18+ you also get time-ordered v7 natively
-- On older versions: CREATE EXTENSION IF NOT EXISTS pg_uuidv7;

SELECT gen_random_uuid();        -- v4, random: e.g. f47ac10b-58cc-4372-a567-0e02b2c3d479
SELECT uuid_generate_v4();       -- same idea via uuid-ossp

-- Postgres 18+ time-ordered
SELECT uuidv7();                 -- v7: e.g. 0196a5c2-3b1e-7a00-9f11-3d4e5f6a7b8c (time prefix)
```

```sql
-- Table that owns its own IDs — no app coordination needed
CREATE TABLE orders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- v7 version when you want ordered inserts (better B-tree locality)
CREATE TABLE events (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  kind       text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Let the app provide the ID (useful for offline creates and idempotent retries)
INSERT INTO orders (id, user_id, total_cents)
VALUES ('0196a5c2-3b1e-7a00-9f11-3d4e5f6a7b8c', '550e8400-e29b-41d4-a716-446655440000', 2499);

-- Without specifying id, the DEFAULT fires
INSERT INTO orders (user_id, total_cents) VALUES ('550e8400-e29b-41d4-a716-446655440000', 1999)
RETURNING id;
```

```sql
-- Equality lookup — uses the PK B-tree, fast
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE id = '0196a5c2-3b1e-7a00-9f11-3d4e5f6a7b8c';

-- Common mistake: comparing as text prevents the index
-- This casts uuid to text and does a sequential scan
SELECT * FROM orders WHERE id::text = '0196a5c2-3b1e-7a00-9f11-3d4e5f6a7b8c';

-- Correct: compare as uuid, or cast the literal to uuid
SELECT * FROM orders WHERE id = '0196a5c2-3b1e-7a00-9f11-3d4e5f6a7b8c'::uuid;

-- v7 bonus: time-ordered range scan works naturally
SELECT * FROM events
WHERE id > uuidv7('2026-01-01'::timestamptz)
ORDER BY id LIMIT 100;
```

```sql
-- Indexing a foreign key — uuid FK index is just a normal B-tree
CREATE INDEX ON orders (user_id);

-- If you frequently look up by external id exposed to clients,
-- index it — an unindexed uuid filter is a full scan on a large table
CREATE INDEX ON orders (id); -- already there as PK, shown for emphasis
```

```javascript
// Node.js app generating the UUID before INSERT
// Good for tracing, logging, and retry idempotency
import { randomUUID } from 'node:crypto';

const orderId = randomUUID(); // v4, matches Postgres uuid type
console.log(orderId); // 6ba7b810-9dad-11d1-80b4-00c04fd430c8

// Send it with the INSERT so a retry does not create a duplicate row
await pool.query(
  `INSERT INTO orders (id, user_id, total_cents) VALUES ($1, $2, $3)
   ON CONFLICT (id) DO NOTHING`,
  [orderId, userId, 2499]
);
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a UUID in PostgreSQL and why would you use it over an integer?**

A UUID is a 128-bit globally unique identifier that Postgres stores as a native 16-byte `uuid` type. You use it when you need IDs that can be generated anywhere — different services, different regions, the client — without calling a central sequence. It avoids collisions on merge or sharding, and it does not leak row counts or ordering like `bigserial` does. The cost is double the storage of `bigint`, larger indexes, and with random v4, worse B-tree locality. You trade a little storage and index cache efficiency for distributed safety and external opacity.

**Q: How does Postgres store a UUID? Is it a string?**

It is not a string internally. It is 16 bytes. The `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` form is just how Postgres displays it. If you store it as `text` or `varchar(36)`, you pay 36+ bytes, lose type validation, and comparisons get slower. Always use the `uuid` type and let Postgres validate the format on cast.

**Q: What is the difference between `gen_random_uuid()` and `uuid_generate_v4()`?**

Both generate UUIDv4 — 122 bits of randomness. `gen_random_uuid()` comes from `pgcrypto`, the modern default and what most new projects use. `uuid_generate_v4()` comes from `uuid-ossp`, the older extension that also provides v1, v3, and v5 generators. Functionally v4 from either extension is interchangeable. For new code, enable `pgcrypto` and use `gen_random_uuid()`. Expect to recognize `uuid-ossp` in legacy code and interviews.

**Q: What is the difference between UUIDv4 and UUIDv7, and why should I care?**

v4 is fully random, v7 is time-ordered. v7 embeds a millisecond timestamp as its first bits, then random bits, so newer UUIDs sort after older ones. For a B-tree index, v4 inserts land randomly and fragment the index. v7 inserts append to the right edge like a sequence, so the index stays compact and more of it stays in cache. If your primary key is a UUID and you care about insert throughput and index size at scale, v7 is the better default. Use `gen_random_uuid()` for v4, `uuidv7()` on Postgres 18+ (or the `pg_uuidv7` extension / app-side generation) for v7.

**Q: What is the indexing and storage cost of UUID vs bigint?**

A `bigint` is 8 bytes, a `uuid` is 16. That difference gets multiplied: the PK value is copied into every secondary index and every foreign key column that references it. A table with three secondary indexes effectively stores the PK four times. Random v4 PKs also produce larger, more fragmented B-tree indexes than sequential `bigint` because of scattered inserts, so fewer index pages fit in memory. Equality lookups (`WHERE id = $1`) are still O(log n) and fast — the cost is paid on writes and cache efficiency, not on single-key reads.

**Q: Does using random UUID hurt Postgres the same way it hurts MySQL?**

No, and this distinction is an interview favorite. MySQL InnoDB clusters the table rows physically by the primary key. A random UUID PK means every insert can move rows around on disk. Postgres uses a heap: the table is an unordered bag of rows, and the PK is just a separate B-tree index pointing into the heap. Random UUIDs still fragment that PK B-tree in Postgres, but the heap itself is not reorganized. So the penalty in Postgres is real but smaller — an inflated index — versus MySQL where the whole table gets shuffled.

**Q: Should you expose UUIDs to the frontend or keep them internal?**

Exposing UUIDs is common and generally fine — they are opaque and not enumerable, which is better than exposing sequential integers. But a UUID is not an authorization check. A user must not see another user's order just by guessing a UUID, because UUIDs can still leak via URLs, logs, and referrals. Always enforce ownership checks on every request. For internal high-frequency joins and large fact tables where no external exposure is needed, keeping a `bigint` internally and exposing a separate `public_id uuid` can give you both small storage and opaque external IDs.

**Q: Can you use `ORDER BY id` to paginate UUIDs?**

Not with random v4. `ORDER BY id` on random UUIDs gives a random order with no time meaning, and using it for keyset pagination (`WHERE id > $last`) will skip and duplicate rows from a user's perspective. If you need chronological pagination, order by `created_at` (with a tie-breaker `id`) or use v7 UUIDs where the ordering is chronological by construction. Bigserial gives free chronological order; UUIDv4 does not.

## 6. The Traps — What Goes Wrong in Production

**Random v4 without thinking about the write path.** Teams switch every table to `gen_random_uuid()` because it feels modern. At small scale it is fine. At millions of rows with heavy inserts, the PK B-tree keeps splitting. Index size grows 20 to 40 percent larger than an ordered key, buffer hit rate drops, and write latency climbs. Fix: use UUIDv7 for high-insert tables, or keep `bigint` where distribution is not needed and expose UUIDs only at the API edge.

**Forgetting the MySQL vs Postgres difference in the interview.** Saying "random UUID PK fragments the table" is half-true for Postgres. The table (heap) is not ordered by PK, only the PK index is. If you claim the heap gets reordered, the interviewer will correct you. Name both systems: MySQL clusters, Postgres does not, so the cost in Postgres is index fragmentation, not heap reshuffling.

**Doing an unindexed lookup on a UUID.** A common slow query is `WHERE external_id = $1` where `external_id` is a `uuid` with no index. On a table with 2 million rows, that is a sequential scan and an 8-second response. Every UUID you filter or join on needs a B-tree index, just like any other column. Also watch for `WHERE id::text = $1` — casting the column prevents index use. Cast the parameter instead: `WHERE id = $1::uuid`.

**Storing UUIDs as `text` or `varchar`.** It looks convenient because JSON and URLs are text anyway. But you lose validation (any string is accepted), pay double storage, and comparisons are slower. Use `uuid` for storage, convert to text only at serialization boundaries.

**Generating in both places inconsistently.** The app generates a UUID for tracing, but the table also has `DEFAULT gen_random_uuid()` and sometimes the INSERT omits the column. Now some rows have app-generated IDs and some have DB-generated IDs, and retry logic cannot be idempotent because it does not know which ID will exist. Pick one authoritative path: either the app always provides the ID (good for offline/idempotent flows) or the DB always does (simpler). Enforce it with `NOT NULL` and document it.

**Using UUID as a sort or pagination key without a timestamp.** `ORDER BY id` with v4 shuffles results every page. Users report "my order disappeared between pages." Store `created_at` and paginate on `(created_at, id)`, or switch the PK to v7.

**Forgot to enable the extension.** `SELECT gen_random_uuid()` without `CREATE EXTENSION pgcrypto` throws `function gen_random_uuid() does not exist`. New database, CI pipeline, or a replica rebuilt from scratch will hit this. Put the `CREATE EXTENSION` in your migration, not just in a manual `psql` session.

**Treating UUID as a security boundary.** Non-enumerable is not the same as authorized. A UUID in a URL is still a capability if you forget the `WHERE user_id = $currentUser` check. UUIDs reduce scraping, they do not replace access control.

## 7. Compare With Related Concepts

**uuid vs bigserial (serial/bigint).** Bigserial is a 64-bit integer backed by a Postgres sequence — one central counter per database. It is 8 bytes, ordered, compact, and fastest for single-node workloads. But it requires coordination: only the DB with the sequence can generate the next value, and values leak counts and order. UUID is 16 bytes, decentralized, opaque, works offline and across shards, but costs storage and has random-write overhead with v4. Rule: one primary, small-to-large single-node table with no external exposure — use bigserial. Multiple writers, sharding, offline creates, or public IDs — use uuid (prefer v7).

**uuid vs text/varchar(36).** `uuid` is 16 bytes with binary validation and fast comparison. `text` holding the same value is at least 36 characters plus varlena overhead, allows invalid strings, bypasses type safety, and prevents efficient operators like `uuid = $1`. Rule: always define the column as `uuid`. Cast to text only when serializing to JSON or URLs.

**uuid vs ULID / Snowflake / NanoID.** All solve decentralized generation. ULID and UUIDv7 are both time-ordered 128-bit IDs, good for B-tree locality; ULID is not an RFC UUID but stores as text or bytea. Snowflake IDs are 64-bit integers (Twitter's design): timestamp + machine ID + sequence, ordered and small like bigserial but requiring machine coordination. NanoID is just a random string, not a typed UUID. Rule: if you need Postgres-native typing and tooling, use UUIDv7. If you need 64-bit ordered integers with machine IDs managed centrally, Snowflake fits. Do not invent a string ID and store it as text when Postgres already types UUIDs.

## 8. 🧠 The Memory Hook

A sequence is a single ticket roll at one desk — neat, tiny, but every desk must call home. A UUID is a passport stamp every warehouse can print alone and never duplicates. In Postgres it is a native 16-byte `uuid` — use `gen_random_uuid()` for random v4, `uuidv7()` for time-ordered appends. Remember: random scatters the B-tree, ordered hugs the right edge, and Postgres heap scatters less than MySQL — but an unindexed UUID still scans.
