# What is logical replication

## 1. The Real-World Problem — When You Actually Hit This

Your main Postgres database has been running fine for a year. Now two things happen in the same quarter.

First, your analytics team says "we just need `orders` and `users` in our warehouse Postgres, not the whole 800 GB database with sessions, logs, and temp tables." Second, your infra team says "we need to upgrade from Postgres 14 to Postgres 16 and we cannot take a 3-hour downtime window for `pg_upgrade`."

If your only tool is physical (streaming) replication, you are stuck. Streaming replication copies the entire cluster byte-for-byte — every database, every table, every block. You cannot say "just these three tables." And the standby has to be the exact same major version and it stays read-only. You cannot cherry-pick, you cannot stay writable, and you cannot replicate across versions.

That exact moment — "I need to copy *selected* tables to another database that stays writable, maybe on a different version, with no downtime" — is why logical replication exists.

## 2. The Analogy — Make the Mechanic Obvious

Think of two ways to copy a newspaper.

**Photocopy (physical / streaming replication):** You put the whole newspaper on the copier and get an identical clone. Same paper size, same stains, same everything. Fast and exact, but you cannot photocopy just the sports section, you cannot photocopy it into a different language, and you cannot scribble your own notes on the copy without it getting overwritten next time you photocopy. That is streaming replication — it ships every byte of the WAL, block for block.

**Subscription (logical replication):** You subscribe to the newspaper. The publisher decides what sections to offer — "sports and business" — and every time a new article is written, they mail you the *meaning* of the change: "new row in sports section, page 3, here is the text." Your copy at home is your own newspaper. You can highlight it, add your own local sections, put it in a different binder, even subscribe from an older edition to a newer one. You just get the *logical* change — inserts, updates, deletes — and you apply them yourself.

That maps directly:

- Publisher = the source database that decides what to share. It defines a **publication** — a named list of tables (and optionally row filters).
- Subscriber = the target database that signs up. It creates a **subscription** — "connect to that publisher and keep me in sync."
- The mail system = WAL plus logical decoding. Postgres writes every change to its journal (WAL). A decoder (`pgoutput`) reads that journal and turns "block 482 changed" into "row 102 in `orders` was inserted with these values."
- Your home newspaper stays writable = the subscriber is a normal, writable Postgres. It can have its own tables, its own indexes, its own writes that never go back to the publisher.
- You don't get layout changes in the mail = DDL like `ALTER TABLE` is not mailed. You have to change the layout on both ends yourself.

Once you see subscription vs photocopy, the whole feature clicks.

## 3. The Full Explanation — How It Actually Works

In plain words, logical replication says: pick some tables on one Postgres, and have their row changes appear in another Postgres automatically, even if that other Postgres is a different version or has extra data of its own.

Here is how Postgres actually pulls it off.

**It starts from the same journal everything else uses.** Every write in Postgres goes into the Write-Ahead Log (WAL). Streaming replication ships that WAL as raw bytes. Logical replication does one extra step: it runs a decoder on the WAL stream that translates low-level block changes back into logical rows — "this was an INSERT into `orders` with id 42." The built-in decoder is called `pgoutput`. This is called logical decoding.

**You choose what to publish, table by table.** On the source (publisher), you create a publication:

- `FOR TABLE orders, users` — just these tables
- `FOR ALL TABLES IN SCHEMA public` — everything in a schema
- Since Postgres 15, you can add a row filter: `FOR TABLE orders WHERE (status = 'paid')` — only paid orders replicate
- Since Postgres 15, you can also limit columns

If a table is not in the publication, its changes never get decoded or sent. That is the whole point — selective copying.

**The target subscribes and stays writable.** On the destination, you create a subscription with a connection string back to the publisher. That creates a replication slot on the publisher (which tells the publisher "don't throw away WAL until the subscriber has read it") and a background worker on the subscriber (the apply worker) that executes the inserts, updates, and deletes as if a normal client sent them. Because the subscriber is just applying SQL-level changes, it is a perfectly normal writable database. You can write to it, add extra indexes, add extra tables that are not replicated, run analytics on it.

**Initial sync then steady stream.** When you create the subscription, Postgres first copies the existing data in those tables (initial table sync, one table at a time), then switches to streaming changes continuously. So you do not need to do a manual dump first unless you want to for very large tables.

**What it deliberately does not do — and this matters a lot in interviews.**

- **No DDL replication.** `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX`, schema changes — none of that is replicated. If you add a column on the publisher, you must add it on the subscriber yourself. If you forget, replication will error when it tries to apply a row with a column the subscriber does not have.
- **Sequences are not replicated.** A sequence on the publisher advancing from 100 to 101 does not move the subscriber's sequence. After a while the two sides have different sequence values, which can cause duplicate-key errors on failover. You have to sync sequences manually (for example, `setval` on the subscriber) especially during upgrades.
- **Every replicated table needs a way to identify rows for updates and deletes.** Ideally a primary key. If a table has no primary key, Postgres needs `REPLICA IDENTITY FULL` (which ships the whole old row) or it cannot reliably apply updates/deletes. Without it, updates may fail or do the wrong thing, and deletes will be skipped.
- **It is one-way by default.** Publisher to subscriber. If you write a row on the subscriber, it does not flow back. You can make it two-way by creating publications on both sides (sometimes called bi-directional), but then *you* own conflict resolution — if both sides update the same row, the last writer wins and someone's change is silently lost unless you build handling for it.

**How it interacts with the rest of the system.** Because it is WAL-based, it is transactional and ordered within a transaction — a transaction that commits on the publisher appears as a whole on the subscriber, in commit order. It works across major versions (that is exactly how zero-downtime upgrades work: publish from 14, subscribe on 16, let it catch up, cut over). It also works across different operating systems or architectures. And because the subscriber is writable, teams use it for use cases streaming replication cannot do: replicating a few tables to an analytics replica, aggregating tables from multiple publishers into one warehouse, or doing rolling upgrades.

For the byte-for-byte clone that copies everything and stays read-only, see the sibling page on [streaming (physical) replication](./what-is-streaming-replication.md) — the two are complements, not replacements.

## 4. See It In Practice — Real Code or Queries

These examples use Postgres 14+ syntax. Run publisher SQL on the source database and subscriber SQL on the target.

```sql
-- =============================================
-- Publisher side (source database)
-- =============================================

-- Publication that shares only two tables
CREATE PUBLICATION orders_pub FOR TABLE orders, users;

-- With a row filter (Postgres 15+) — only paid orders
-- Useful when analytics only needs completed orders
CREATE PUBLICATION paid_orders_pub FOR TABLE orders WHERE (status = 'paid');

-- With a column list (Postgres 15+) — hide sensitive column from replica
CREATE PUBLICATION users_safe_pub FOR TABLE users (id, email, created_at);

-- Publish everything in a schema
CREATE PUBLICATION app_pub FOR TABLES IN SCHEMA public;

-- Add a table later without recreating the publication
ALTER PUBLICATION orders_pub ADD TABLE payments;

-- Check what is published
SELECT pubname, pubinsert, pubupdate, pubdelete FROM pg_publication;
SELECT pubname, schemaname, tablename FROM pg_publication_tables;

-- Make sure wal_level is correct (needs restart if changed)
SHOW wal_level; -- must be 'logical' for logical replication

-- Tables without a primary key need replica identity for updates/deletes
ALTER TABLE audit_log REPLICA IDENTITY FULL;
-- Prefer adding a primary key instead when you can
```

```sql
-- =============================================
-- Subscriber side (target database)
-- =============================================

-- Create the subscription — this starts the initial copy plus streaming
-- The user in the connection string needs REPLICATION privilege on publisher
CREATE SUBSCRIPTION orders_sub
  CONNECTION 'host=publisher.db.internal port=5432 dbname=app user=replicator password=secret'
  PUBLICATION orders_pub;

-- Common options worth knowing
-- copy_data = false — skip initial copy if you already loaded the data yourself
-- create_slot = false — if you manage the slot manually
-- enabled = false — create it paused, enable later

-- Example: you did a manual pg_dump restore for a 500 GB table, now just stream changes
CREATE SUBSCRIPTION big_table_sub
  CONNECTION 'host=publisher.db.internal dbname=app user=replicator password=secret'
  PUBLICATION orders_pub
  WITH (copy_data = false, create_slot = true);

-- Monitor on the subscriber — is it keeping up?
SELECT subname, status, received_lsn, latest_end_lsn, last_msg_receipt_time
FROM pg_stat_subscription;

-- Monitor on the publisher — is WAL piling up?
-- If a slot is inactive, pg_wal can fill your disk
SELECT slot_name, slot_type, active, restart_lsn, wal_status
FROM pg_replication_slots;

-- Pause and resume
ALTER SUBSCRIPTION orders_sub DISABLE;
ALTER SUBSCRIPTION orders_sub ENABLE;

-- Refresh when you added tables to the publication
ALTER SUBSCRIPTION orders_sub REFRESH PUBLICATION;

-- Clean up
DROP SUBSCRIPTION orders_sub;  -- also drops the slot on publisher if it created it
DROP PUBLICATION orders_pub;
```

```sql
-- =============================================
-- Zero-downtime upgrade pattern (the classic use case)
-- =============================================

-- 1. Publisher is Postgres 14 in production
-- 2. Bring up a new Postgres 16 instance
-- 3. On 16, create subscription to 14 (yes, cross-version works)
--    CREATE SUBSCRIPTION upgrade_sub CONNECTION 'host=pg14 ...' PUBLICATION app_pub;
-- 4. Let pg_stat_subscription show it is caught up (received_lsn == publisher current LSN)
-- 5. Brief write pause on 14, verify sequences, point app to 16, done
-- 6. Sync sequences manually — they were not replicated!
SELECT setval('orders_id_seq', (SELECT max(id) FROM orders));
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is logical replication in PostgreSQL?**

It is a way to copy row changes — inserts, updates, deletes — for selected tables from one Postgres database to another by decoding the WAL into logical rows and replaying them. You define what to share with a publication on the source, and the target subscribes to it. The target stays a normal writable database, can be a different major version, and only gets the tables you chose. Under the hood it uses WAL plus the `pgoutput` plugin to turn block-level changes into row-level changes, in commit order, transaction by transaction.

**Q: How is logical replication different from streaming (physical) replication?**

Streaming replication copies the entire cluster at the byte/block level. Same major version, every database and table, read-only standby, very fast, used for high availability and read scaling. Logical replication copies at the row level for chosen tables. Can be selective, can cross versions, subscriber stays writable, slower per byte because each row is decoded and applied via workers, used for selective sharing, aggregation, and zero-downtime upgrades. If you want a hot failover clone, you want streaming — see [streaming replication](./what-is-streaming-replication.md). If you want "just these tables on a different version that I can also write to," you want logical.

**Q: Does logical replication replicate DDL like ALTER TABLE?**

No. This is the single most-tested gotcha. If you run `ALTER TABLE orders ADD COLUMN note text` on the publisher, the subscriber does not get that change at all. The next insert that includes `note` will fail to apply on the subscriber with a column mismatch error. You must apply DDL on both sides, and the safe order is: add the column on the subscriber first, then on the publisher, so replication never tries to insert into a missing column.

**Q: Can the subscriber be written to? Can you write to both sides?**

Yes, the subscriber is writable by default — that is a core difference from a physical standby. You can insert into the subscriber freely and those rows stay local. You can also set up publications on both databases subscribing to each other for two-way sync, but Postgres does not do conflict resolution for you. If both sides update the same row at the same time, one change silently overwrites the other. True multi-master with safe conflicts needs extra logic or an external tool.

**Q: Are sequences replicated?**

No. Sequence values are not WAL-logged the same way as table rows, so `nextval` advances on the publisher do not move the subscriber's sequence. After cutover, inserts on the new primary can collide with existing keys. Before switching over during an upgrade, you must manually sync every sequence, for example `SELECT setval('orders_id_seq', (SELECT max(id) FROM orders))` on the new database. Forgetting this is a classic production outage.

**Q: What does a table need for updates and deletes to replicate correctly?**

A primary key or a usable replica identity. For `UPDATE` and `DELETE` to find the right row on the subscriber, the WAL must include enough to identify the old row. If the table has a primary key, that is enough by default. If it has no key at all, you need `ALTER TABLE ... REPLICA IDENTITY FULL`, which ships the entire old row, and that costs more WAL volume. Tables without a key and without `REPLICA IDENTITY FULL` will replicate inserts fine but fail or silently skip updates and deletes.

**Q: How does the initial data get to the subscriber?**

When you run `CREATE SUBSCRIPTION`, Postgres spawns a table-sync worker for each table that copies existing rows, then the main apply worker streams ongoing changes. If the table is huge and you already loaded it with `pg_dump`, you can use `WITH (copy_data = false)` to skip the initial copy and just stream new changes. Either way, changes are applied transactionally and in commit order after the initial sync finishes.

**Q: What happens if the subscriber goes down or falls behind?**

The publisher keeps WAL around for as long as the subscriber's replication slot needs it. That is both the safety net and the danger. If the subscriber is down for a long time and the publisher keeps writing, `pg_wal` can grow until the publisher runs out of disk. You monitor this via `pg_replication_slots` on the publisher (`restart_lsn` drifting far behind current LSN) and `pg_stat_subscription` on the subscriber. Fix it by bringing the subscriber back, or if it is truly gone, drop the slot with `SELECT pg_drop_replication_slot('slot_name')` — but that means you need a fresh initial sync later.

## 6. The Traps — What Goes Wrong in Production

**Forgetting that DDL does not replicate.** You add a column or change a type on the publisher, replication breaks an hour later when the first row with the new shape arrives. The error shows up on the subscriber side as a column-mismatch, and replication stops for that table. Fix: treat every schema change as a two-step deploy — apply DDL to the subscriber first, then the publisher. Automate it or it will be forgotten.

**Sequences drifting and causing duplicate key errors after cutover.** Everything looks fine during replication, then you fail over and new inserts immediately hit `duplicate key value violates unique constraint`. That is a sequence that was never synced. Fix: before cutover, run `setval` for every sequence to at least `max(id)` on the new primary. Add it to your runbook.

**Tables without a primary key silently mishandling updates.** Inserts flow fine so you think replication works. Then updates and deletes either error or do nothing. People blame the network. The real cause is missing replica identity. Fix: give every replicated table a primary key, or explicitly set `REPLICA IDENTITY FULL` and accept the extra WAL cost.

**Letting a dead replication slot fill the publisher's disk.** A subscriber gets decommissioned but nobody dropped its slot. Weeks later the publisher fills its disk with retained WAL and the primary goes down. This is one of the most common post-mortems. Fix: alert on `pg_replication_slots` where `active = false` and on `pg_wal` size, and have a runbook to drop dead slots.

**Replicating a high-churn table without thinking about row filters or volume.** A table with constant updates and a `WHERE` filter on the publication still decodes every change — only to throw most of them away when they do not match the filter. You pay the decode cost anyway. For very high-churn filtered tables, consider whether you actually need logical replication or a change-data-capture tool with more filtering options.

**Writing on the subscriber and colliding with published rows.** Because the subscriber is writable, it is tempting to write to replicated tables on both sides. Without conflict handling, one side's change disappears. Fix: only write to replicated tables on the publisher, or use separate tables for subscriber-local writes. If you truly need two-way, build explicit conflict rules.

**Forgetting to refresh the subscription after adding tables to the publication.** You run `ALTER PUBLICATION ... ADD TABLE new_table` and wonder why nothing appears on the subscriber. You need `ALTER SUBSCRIPTION ... REFRESH PUBLICATION` (or wait for the next refresh cycle) and the new table will start its initial sync.

## 7. Compare With Related Concepts

**Logical replication vs streaming (physical) replication — the sibling you must know together.**
Streaming replication ships the whole cluster byte-for-byte, stays read-only, needs the same major version, and is fast and simple — ideal for failover and read replicas. Logical replication ships chosen tables as decoded rows, stays writable, can cross versions, and is selective — ideal for partial copies, cross-version upgrades, and aggregating tables from multiple sources. If an interviewer asks "which replication and why," the one-line rule is: need an identical hot standby → streaming ([streaming replication](./what-is-streaming-replication.md)); need selected tables, writable target, or cross-version → logical.

**Logical replication vs dump and restore (`pg_dump` / `pg_restore`).**
Dump is a one-time snapshot — you get the data as it was at dump time and then you are on your own. Logical replication is continuous — you get the snapshot plus every change after it. Rule: one-time migration or backup → dump; ongoing sync → logical.

**Logical replication vs trigger-based replication (like Debezium or custom triggers).**
Trigger-based tools also capture row changes, but they do it with triggers or by tailing the WAL externally, which adds overhead on the write path or needs extra infrastructure. Built-in logical replication uses the native `pgoutput` decoder with no trigger overhead and is managed inside Postgres. Rule: need Postgres-to-Postgres table sync with minimal extra infrastructure → built-in logical; need to stream changes to Kafka or to a non-Postgres system → Debezium or similar.

**Logical replication vs `postgres_fdw` (foreign data wrapper).**
FDW lets you query a remote table live over the network without copying data — every query hits the remote. Logical replication copies the data locally so queries are fast and work when the remote is down. Rule: need live remote queries without copying → FDW; need a local, queryable, available copy of the data → logical replication.

## 8. 🧠 The Memory Hook

Streaming is a photocopy of the whole book that you cannot write in; logical is a subscription to just the sections you chose, delivered as readable articles you paste into your own writable notebook — great for sharing and upgrades, but you have to sync the page numbers (sequences) and rewrite the chapter headings (DDL) yourself.
