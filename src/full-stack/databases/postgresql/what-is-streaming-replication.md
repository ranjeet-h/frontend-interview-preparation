# What Is Streaming Replication

## 1. The Real-World Problem — When You Actually Hit This

You have one PostgreSQL server. It holds all user data, orders, everything. One morning the disk dies. Or AWS kills the instance. Or you need to restart for a security patch. Your app is completely down until you restore the last backup onto a new machine. That restore takes an hour, maybe four. You lose every write since the last backup. Customers see 500 errors the whole time.

Even if you have nightly backups, you have two problems that backups cannot solve: a single database is a single point of failure, and failover is slow. You need a second machine that already has the data, stays almost perfectly up to date, and can take over in seconds or minutes. And you might also want to spread read traffic so your primary is not crushed by dashboards and reports.

Streaming replication is how PostgreSQL does that. One server keeps writing. A second server follows it byte for byte by streaming its internal write diary. If the first dies, you promote the second. If you need scale, you let the second answer read queries.

## 2. The Analogy — Make the Mechanic Obvious

Think of a notebook and a photocopier that copies pages while you write.

You are writing in the original notebook. That is the primary. Every time you finish a line, you do not photocopy the entire notebook. You just send the new ink strokes to a second notebook. That second notebook is the standby. It reproduces each stroke in order. When you are done writing a full page and you close it, the copy is right behind you.

In this analogy:

- The ink strokes are WAL records. WAL stands for Write-Ahead Log — a sequential diary PostgreSQL writes before it even updates the table files. Every INSERT, UPDATE, DELETE, and COMMIT becomes WAL.
- Sending strokes as they happen is streaming. The primary has a sender process, the standby has a receiver process, and they stay connected over TCP.
- Replaying strokes in the copy notebook is redo. The standby does not run SQL. It just replays the physical changes block by block so its data files become identical.
- If you stop sending strokes for an async copy, the copy falls slightly behind. If you require the copy to acknowledge each page before you consider your work done, that is synchronous replication — slower, but you know the copy has it.
- Reading the copy while it is still catching up is hot standby. You can let someone read the copy even though more strokes are still arriving.
- The photocopier tray that holds pages until the copy acknowledges them is a replication slot. It stops the original from throwing away pages the copy has not yet received.
- If you lose the original notebook, you declare the copy as the new original and start writing there. That is promotion and failover. You now have a new timeline.

This maps exactly. Streaming replication does not copy tables. It ships and replays the physical WAL.

## 3. The Full Explanation — How It Actually Works

Start with the simplest version, then add the options that matter in production.

At its core, PostgreSQL writes every change to the WAL first. The WAL is append-only. Each record says something like "in file 123, block 45, change these bytes from X to Y" plus the transaction commit marker. Crash recovery, backups, and replication all depend on this log.

With streaming replication configured, here is what happens step by step.

The primary runs normally and generates WAL. For each standby, the primary starts a `walsender` process. The standby runs a `walreceiver` process that connects to the primary using a replication connection string. As soon as WAL is written on the primary, the walsender streams it. The walreceiver writes it to the standby's own WAL files and then a startup process replays it into the standby's data files. This replay is continuous and in order.

That gives you two roles. The primary can read and write. The standby is in recovery mode. By default it cannot write, but with `hot_standby = on` it can answer read-only queries while still replaying. Your app can send `SELECT` traffic to standbys and keep writes on the primary.

Now the critical choice: asynchronous versus synchronous.

Asynchronous is the default and what most teams start with. The primary commits a transaction as soon as its own WAL is flushed locally. It does not wait for the standby. It still streams the WAL right after, usually milliseconds behind. This means writes are fast. The cost is that if the primary dies before that last chunk of WAL reaches the standby, those last committed transactions are gone. The standby promotes without them. This is async data loss on failover, and it surprises people who assumed replication means zero loss.

Synchronous fixes that by making the primary wait. You set `synchronous_standby_names` to list which standbys must acknowledge. Then `synchronous_commit` controls how strictly it waits:

- `on` is the normal synchronous mode. The primary waits until the standby has received and flushed the WAL to its disk. The data is safe on both machines before the client gets COMMIT success. This is durable but adds network round-trip latency to every commit.
- `remote_apply` goes one step further. The primary waits until the standby has not just flushed but actually replayed the WAL so the change is visible to readers. This removes stale reads right after a write but adds even more latency.
- `remote_write` is looser. Wait only until the standby has received the WAL in memory, not yet flushed to disk. Less latency, less safety.
- `local` or `off` effectively makes it async even if a synchronous standby is named. Useful if you want the standby name configured but not pay the latency for most transactions. You can even set `synchronous_commit` per transaction.

In practice many teams run async for speed and accept tiny loss, or they run synchronous with `synchronous_commit = on` for payment or order tables and keep the rest async by setting the parameter per transaction.

Two more mechanics decide whether this stays healthy.

Replication slots keep the primary honest. Without a slot, the primary recycles old WAL files once it no longer needs them locally and has no checkpoint holding them. If the standby disconnected for an hour, that WAL would be gone and the standby could never catch up — you would have to rebuild it from a fresh base backup. A physical replication slot says "do not remove any WAL until this standby has consumed it." That guarantees catch-up, but if the standby stays down, WAL piles up on the primary and can fill the disk. You must monitor `pg_replication_slots` and have an alert for a slot that is inactive and growing.

Hot standby reads are powerful but have a tension. The standby replays WAL that may conflict with long-running read queries. For example, the primary vacuums away old row versions that a standby query still needs. PostgreSQL has to choose: cancel the standby query or delay replay. Settings like `max_standby_archive_delay`, `max_standby_streaming_delay`, and `hot_standby_feedback` control this. Turning on `hot_standby_feedback` tells the standby to tell the primary "I still need these old rows," which prevents cancellations but can bloat the primary because vacuum cannot clean up. There is no free choice here. You pick between fresher replication and longer-running analytics on the replica.

Failover and promotion are the final piece. The standby has a `standby.signal` file that keeps it in recovery. To failover you remove that signal, either by running `SELECT pg_promote()` on the standby or `pg_ctl promote`. The standby finishes replaying whatever WAL it has, creates a new timeline, and becomes writable. Its `pg_is_in_recovery()` flips from true to false. At that moment you must not let the old primary come back and accept writes or you get split brain with two primaries. Fencing the old primary, updating connection strings or DNS, and re-pointing any remaining standbys to the new primary are part of a real failover, not just the promote command.

For observability, the primary exposes `pg_stat_replication` with one row per walsender showing `state` (startup, catchup, streaming), `sent_lsn`, `write_lsn`, `flush_lsn`, `replay_lsn`, and `sync_state`. The difference between the primary's current LSN and the standby's `replay_lsn` is the lag that matters to users. The standby side shows `pg_last_wal_replay_lag()` and `pg_is_in_recovery()`. These are what you alert on.

If you need table-level or selective replication, or replication between different PostgreSQL versions, that is not streaming replication. That is [logical replication](./what-is-logical-replication.md), its sibling. Streaming replication is physical, whole-instance, block-for-block.

## 4. See It In Practice — Real Code or Queries

These examples show the real settings and checks you use in production. Paths assume PostgreSQL 15+ where the standby uses `standby.signal` and `primary_conninfo`.

Primary setup — postgresql.conf:

```ini
# Write enough WAL for a standby to replay
wal_level = replica

# Allow standbys to connect and stream
max_wal_senders = 5
max_replication_slots = 5
wal_keep_size = 512MB        # safety buffer, but slots are the real guarantee

# Let standbys answer reads
hot_standby = on
listen_addresses = '*'
```

Primary — pg_hba.conf needs a replication entry:

```ini
# Allow replication user from standby IP
host replication replicator 10.0.1.20/32 scram-sha-256
```

Primary — create a replication user and a physical slot:

```sql
-- Run on primary as superuser
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'strong-password';

-- Create a slot that retains WAL for this standby
SELECT pg_create_physical_replication_slot('standby1_slot');

-- Check slots: active = t means standby is connected
SELECT slot_name, slot_type, active, restart_lsn, wal_status
FROM pg_replication_slots;
```

Standby setup — build it from a base backup of the primary:

```bash
# On standby machine, as postgres user
# pg_basebackup streams the data directory and sets up replication
pg_basebackup -h primary.example.internal -D /var/lib/postgresql/data \
  -U replicator -P -v -X stream -R -S standby1_slot

# -R writes primary_conninfo and creates standby.signal automatically
# Check what it wrote
cat /var/lib/postgresql/data/postgresql.auto.conf
# primary_conninfo = 'host=primary.example.internal user=replicator ...'
ls /var/lib/postgresql/data/standby.signal
```

Standby — postgresql.conf additions if you want to tune read conflicts:

```ini
hot_standby = on
max_standby_streaming_delay = 30s
hot_standby_feedback = on   # reduces query cancellations, can delay vacuum on primary
```

Checking health — run on primary:

```sql
-- Are standbys connected and how far behind are they?
SELECT client_addr, state, sync_state,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn))  AS send_lag,
       pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn))           AS replay_lag,
       replay_lag -- interval version on newer PG
FROM pg_stat_replication;

-- Which slots are holding WAL?
SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal
FROM pg_replication_slots;
```

Checking health — run on standby:

```sql
-- Am I still a standby?
SELECT pg_is_in_recovery();  -- true on standby, false on primary

-- How stale am I in time?
SELECT now() - pg_last_xact_replay_timestamp() AS replication_delay;
SELECT pg_last_wal_replay_lag();  -- interval lag if available
```

Making a standby handle reads in your app:

```javascript
// Node.js with pg — route reads to standby, writes to primary
import { Pool } from 'pg';

const primary = new Pool({ host: 'primary.example.internal', database: 'app' });
const replica = new Pool({ host: 'standby.example.internal', database: 'app', statement_timeout: 5000 });

async function getUserOrders(userId) {
  // Safe to read from standby — slight staleness is okay for history
  const { rows } = await replica.query(
    'SELECT id, total FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
    [userId]
  );
  return rows;
}

async function placeOrder(userId, total) {
  // Must go to primary
  const { rows } = await primary.query(
    'INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING id',
    [userId, total]
  );
  return rows[0];
}
```

Synchronous replication — only when you need zero loss for some commits:

```ini
# postgresql.conf on primary
synchronous_standby_names = 'standby1'
# or quorum: synchronous_standby_names = 'ANY 1 (standby1, standby2)'
```

```sql
-- Default is on. Set per transaction for hot path that needs safety
BEGIN;
SET LOCAL synchronous_commit = 'on';  -- wait for flush on standby
INSERT INTO payments (order_id, amount) VALUES (42, 1999);
COMMIT;  -- client blocks until standby flushes

-- For bulk load where you want speed, relax it just for this session
SET synchronous_commit = 'local';
COPY events FROM '/tmp/events.csv';
```

Failover — promote the standby:

```sql
-- On the standby, when primary is confirmed dead or fenced
SELECT pg_promote(wait => true);

-- Verify it is now writable
SELECT pg_is_in_recovery(); -- should be false
SHOW server_version;
```

After promotion, update `primary_conninfo` on any other standbys to point at the new primary and rebuild failed slots. Monitor `pg_stat_replication` on the new primary to confirm they reattached.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is streaming replication in PostgreSQL?**

Streaming replication is physical replication where the primary streams its WAL records over a TCP connection to one or more standbys as they are generated, and each standby continuously replays those records so its data files become a byte-for-byte copy of the primary. It gives you high availability and read scaling for the whole database instance, not just one table. The primary can read and write. The standby stays in recovery and, with hot standby enabled, can answer read-only queries. If the primary fails, you promote a standby to become the new primary. This is different from taking periodic backups. The standby is always minutes or milliseconds behind, not hours.

**Q: How does WAL shipping actually work? What are walsender and walreceiver?**

WAL is the Write-Ahead Log, an append-only journal PostgreSQL writes before touching heap files. Every change and every commit gets a WAL record with a Log Sequence Number (LSN) that marks its position. When a standby connects, the primary forks a `walsender` process per standby and the standby runs a `walreceiver`. The walsender reads WAL from memory or disk and pushes it. The walreceiver writes it to the standby's WAL and the standby's startup process replays it. You can see this in `pg_stat_replication` on the primary with columns like `sent_lsn`, `flush_lsn`, and `replay_lsn`. If the network breaks, the walreceiver reconnects using its replication slot and resumes from the last LSN it acknowledged.

**Q: What is the difference between asynchronous and synchronous streaming replication? What does synchronous_commit do?**

Asynchronous is the default. The primary commits as soon as its own WAL is durable and reports success to the client. Streaming to the standby happens right after but does not block the commit. This is fast, with usually tiny lag, but if the primary dies before the last WAL is sent, those transactions are lost on the promoted standby.

Synchronous makes the primary wait. You set `synchronous_standby_names` to name which standby must acknowledge. `synchronous_commit` then controls how strictly it waits. With `on`, it waits until the standby has flushed the WAL to disk. With `remote_apply`, it waits until the standby has replayed it and made it visible to readers — no stale reads, but highest latency. With `remote_write`, it waits only until the standby has it in memory. With `local`, it does not wait for the standby at all. You can set `synchronous_commit` per transaction, so many teams keep replication async in general but use `SET LOCAL synchronous_commit = on` for critical payments commits.

**Q: Can you read from a standby? What is hot standby?**

Yes, when `hot_standby = on`, a standby can answer read-only queries while it is still replaying WAL. That is called hot standby. You point reporting, dashboards, or read-heavy API routes at the standby to offload the primary. The trade-off is staleness and conflicts. The standby always lags slightly, so a read immediately after a write on the primary can return old data. And long-running queries on the standby can conflict with replay, for example when the primary vacuums rows the standby query still needs. PostgreSQL will either cancel the standby query after `max_standby_streaming_delay` or, if you enable `hot_standby_feedback`, delay vacuum on the primary instead. You choose between query stability on the replica and bloat on the primary.

**Q: What is a replication slot and why can it fill up your disk?**

A physical replication slot is a marker on the primary that says "do not delete WAL until this standby has consumed it." Without a slot, the primary recycles WAL once checkpoints allow it. If the standby is disconnected, that WAL is gone and the standby can never catch up without a full rebuild. With a slot, the WAL is retained. The danger is that if the standby stays down for a long time, or a slot is left behind after a decommissioned standby, the primary keeps every WAL file. Disk fills, writes stop. You must monitor `pg_replication_slots` for slots where `active = false` and `restart_lsn` is far behind `pg_current_wal_lsn()`, and alert on retained WAL size.

**Q: How does failover and promotion work? What is a timeline?**

Failover means declaring a standby as the new primary. The standby has a file called `standby.signal` that keeps it in recovery. Promotion removes it. You run `SELECT pg_promote()` on the standby or `pg_ctl promote`. The standby finishes replaying any WAL it has, exits recovery, increments its timeline, and becomes writable. A timeline is PostgreSQL's version history for a server. Every promotion creates a new timeline so forks are tracked. After promotion you must fence the old primary so it cannot accept writes and create a split brain. You also need to repoint apps and any other standbys to the new primary, and rebuild or recreate replication slots because the old primary's slots are invalid on the new timeline. If you are doing planned switchover rather than emergency failover, you normally shut down writes on the old primary, wait for the standby to catch up to the same LSN, then promote so there is no loss.

**Q: When should you use streaming replication versus logical replication?**

Use streaming replication when you want a whole-instance, byte-for-byte copy for high availability and read scaling. It is physical, simple, replicates everything including DDL, and keeps the standby identical. It cannot filter tables, cannot replicate between major versions, and the standby is read-only until promoted. Use [logical replication](./what-is-logical-replication.md) when you need selective table-level replication, want to transform data, replicate between different versions, or need a writable subscriber that can also have its own writes. Logical replication decodes WAL into logical changes and replays them via SQL, so it is more flexible but more complex and does not replicate DDL or sequences in the same way. Many real setups use both: streaming for HA of the whole cluster and logical for sharing specific tables to another service.

**Q: How do you know the standby is lagging? What do you monitor?**

On the primary, `pg_stat_replication` shows `sent_lsn`, `write_lsn`, `flush_lsn`, and `replay_lsn` per standby. The gap between `pg_current_wal_lsn()` and `replay_lsn` is the end-to-end lag in bytes, which you can turn into time with `pg_last_xact_replay_timestamp()` on the standby. Alert on replay lag in seconds and on bytes of retained WAL per slot. Also alert on `state` not being `streaming`, on `sync_state` changes if you expect synchronous, and on disk usage for the WAL directory. On the standby, monitor `pg_is_in_recovery()` to be sure it is still a standby, and watch replay conflicts or query cancellations in the logs if you use hot standby heavily.

## 6. The Traps — What Goes Wrong in Production

**Async data loss on failover.** The most common surprise. Teams assume replication means every committed transaction is safe on the standby. With async, it is not. If the primary crashes a few milliseconds after acknowledging a COMMIT, that WAL may never have reached the standby. When you promote, those rows are gone. The fix is to either accept that window for non-critical data or use `synchronous_standby_names` with `synchronous_commit = on` for the transactions where loss is unacceptable, and test failover by actually killing the primary and counting rows.

**Stale reads from the standby.** You write to the primary, then immediately read from the standby and do not see your write. This breaks flows like "create order then redirect to order detail" if the detail query hits the replica. The lag can be milliseconds normally but seconds under load. Fixes include reading your own writes from the primary, adding a small retry with backoff, using `synchronous_commit = remote_apply` for that specific read-after-write, or routing the follow-up read to the primary for a short session window.

**Replication slot retaining WAL until disk fills.** An inactive slot is a time bomb. Someone decommissions a standby but forgets to run `SELECT pg_drop_replication_slot('standby1_slot')` on the primary. The primary keeps every WAL since that slot's `restart_lsn`. Disk fills overnight, the primary stops accepting writes. Always have a dashboard for `pg_replication_slots` with retained WAL size and an alert if a slot is inactive for more than a few minutes. Automate slot cleanup when a standby is removed.

**Long queries on the standby getting cancelled or blocking vacuum on the primary.** A dashboard runs `SELECT ...` for two minutes on the standby. The primary vacuums the same table and needs to remove dead rows. PostgreSQL must either delay replay or cancel the standby query. With default settings the query gets `ERROR: canceling statement due to conflict with recovery`. If you turn on `hot_standby_feedback` to avoid cancellations, the primary cannot vacuum and tables bloat. Pick one. For heavy analytics, consider a separate logical replica or a delayed reporting pipeline instead of hammering the hot standby.

**Promoting without fencing the old primary.** You promote the standby while the old primary is still accepting writes because the network partitioned. Now two primaries accept orders with overlapping IDs. Reconciling is painful. Real HA does fencing: stop the old primary, block its traffic at the load balancer, or use a consensus tool like Patroni or repmgr that handles leader election. Never allow two writable primaries without a plan for conflict resolution, which streaming replication does not provide.

**Thinking lag is always small.** WAL replay can stall for reasons that do not show obvious errors. A huge transaction, a large DDL that rewrites a table, or a checkpoint spike can cause replay to pause. A single `VACUUM FULL` or `REINDEX` can generate massive WAL. Monitor lag as both bytes and time, not just connection state.

## 7. Compare With Related Concepts

**Streaming vs logical replication.** Both ship data from a primary, but streaming is physical and whole-instance while logical is table-level and decoded into SQL. Streaming keeps the standby block-identical, replicates everything including DDL, and requires the same major version. The standby is read-only. Logical lets you filter tables, add columns on the subscriber, replicate across versions, and keep the subscriber writable, but it does not replicate DDL automatically and adds decoding overhead. Rule: need HA and read scale for the whole database, choose streaming. Need to share specific tables to another database or service, choose [logical replication](./what-is-logical-replication.md).

**Streaming vs file-based WAL archiving (log shipping).** Old PostgreSQL shipped WAL files every time a 16MB segment filled or an archive timeout hit. Streaming replaced that for low-lag HA because it pushes records as they are generated instead of waiting for file completion. Archiving is still useful as a backup method alongside streaming, but alone it means minutes of lag. Rule: use streaming for HA and low lag, keep archiving for point-in-time recovery.

**Streaming vs shared-storage failover.** Some setups put the data directory on shared storage and just restart PostgreSQL on another node pointing at the same disk. That avoids WAL shipping but the storage itself becomes the single point of failure and you get no read scaling. Streaming gives you independent copies on independent disks and lets you put standbys in another availability zone. Rule: shared storage is simpler for single-zone restart, streaming is correct for real cross-machine HA.

**Physical standby vs hot standby.** A physical standby is what streaming creates. Hot standby is the mode where that standby also answers reads. The terms get mixed. You always have a physical standby with streaming. You only get read queries when you enable hot standby, and then you accept the lag and conflict trade-offs above.

**Replication vs backups.** Replication is not a backup. A `DROP TABLE` on the primary replays on the standby in milliseconds. Both copies lose the table. Replication protects against machine failure. Backups with WAL archiving protect against human error and corruption by letting you restore to a point before the mistake.

## 8. 🧠 The Memory Hook

Streaming replication is a photocopier that copies ink strokes as you write. The primary writes the WAL diary, walsender streams it, walreceiver replays it. Async is fast but the last page can be lost on failover. Sync waits for the copy to acknowledge before it tells the client done. A replication slot is the tray that holds pages until the copy catches up — forget to clear it and the tray overflows the disk. If the original is lost, you promote the copy to be the new original and never let two originals write at once.
