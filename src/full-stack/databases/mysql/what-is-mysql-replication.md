# MySQL Replication: Architecture, Replication Types, GTID, and Replication Lag

## 1. The Real-World Problem — When You Actually Hit This

Your app starts fine on one MySQL server. Then traffic grows. During a big sale, millions of shoppers browse the catalog at the same time. Your single database hits 100% CPU. Reads block writes. Checkout queries time out. The whole site feels slow because one machine is doing everything.

So you add a read replica to spread the load. A customer updates their delivery address and clicks Save. The write goes to the primary. The next page loads from the replica — but the replica is 800 milliseconds behind. It still shows the old address. The customer panics, submits again, and you get duplicate writes or a canceled order.

Then the primary loses power at 2 AM. You need to promote a replica right now. If you tracked position with old file offsets like `mysql-bin.000042` position `1048576`, you have to do math by hand under pressure: which replica is most up to date, what offset to use, how to re-point the other replicas. One wrong number and you get duplicate keys, missing rows, or two servers both thinking they are the primary — a split brain where data silently diverges and there is no clean failover.

MySQL replication exists to fix these two jobs: scale reads by copying data to other machines, and keep a warm copy ready when the primary dies. The hard part is making the copy fast, consistent, and safe to fail over.

## 2. The Analogy — Make the Mechanic Obvious

Think of MySQL replication like a master binder and a set of photocopied mirrors.

The primary is the master binder. Only one person is allowed to write in it. Every time someone changes a page — writes, updates, deletes — the master binder person also writes exactly what changed into a separate change journal sitting next to the binder. That journal is the binary log (binlog).

A courier stands next to the journal. Whenever a new page of the journal is written, the courier picks up a photocopy of that page and delivers it to every mirror office. The courier does not think about the content. They just copy and deliver fast. That courier is the binlog dump thread.

Each mirror office has two people and a tray:

The Receiver sits by the door and catches every delivered photocopy, dropping it straight into an inbox tray. They do not file anything. They just make sure nothing is lost on the way in, even if the filing clerk is busy. The inbox tray is the relay log. The Receiver is the replica I/O thread.

The Filing Clerk picks up pages from the inbox tray, one by one, and actually files them into the local mirror binder, which is the replica's InnoDB data. That clerk is the replica SQL applier thread.

Why two people and a tray? If one person had to both catch deliveries and file pages, a big filing job would cause them to miss a delivery, or a network hiccup would stall filing. Splitting it means deliveries are buffered fast, filing happens at its own pace.

The modes map directly:

Asynchronous is like saying "done" to the customer as soon as the master binder is updated, without waiting for the courier to confirm delivery. Fast, but if the building burns down a second later, the mirrors never got that page.

Semi-synchronous is like waiting until at least one mirror office shouts back "got it in my inbox tray" before you tell the customer "done." One network round trip slower, but you know at least one copy is safe.

Row vs statement is about what you photocopy: the exact sentence "update these rows where..." (statement) versus a before-and-after photo of every row that actually changed (row). The photo is bigger but never ambiguous.

GTID vs file+position is how you number the photocopy pages: old way is "binder 4, page 482" (file + offset). New way is "every change gets a global passport stamp" (GTID) so any mirror can say "I have stamps 1-500, send me 501 onward" without manual math.

## 3. The Full Explanation — How It Actually Works

MySQL replication streams changes from one primary (also called source) to one or more replicas. The primary records every committed write, the replicas pull those records over TCP, buffer them, and replay them locally.

Three threads do the work, spread across two servers:

The binlog dump thread lives on the primary. When a replica connects and authenticates, the primary starts one dump thread for that replica. It reads committed events from the binary log and pushes them over the socket in order. You will see one dump thread per replica on the primary.

The I/O receiver thread lives on the replica. It opens the TCP connection, asks for events from a specific position or GTID set, receives raw binlog events, and writes them straight to the local relay log files on disk. It does not parse or apply anything. It just lands data fast.

The SQL applier thread also lives on the replica. It reads events from the relay log in order, parses each transaction, and executes it against the local InnoDB engine. When done, it moves its applier pointer forward and cleans up old relay files.

If the applier slows down, the I/O thread keeps buffering. That decoupling is what keeps a slow replica from blocking the primary.

What gets written to the binary log matters. The variable `binlog_format` controls this:

Statement-Based Replication (`STATEMENT`) logs the SQL text itself, like `UPDATE orders SET status='shipped' WHERE created_at < '2026-01-01'`. Logs stay small, but this drifts easily. Functions like `NOW()`, `UUID()`, `RAND()`, or `UPDATE ... LIMIT 1` without `ORDER BY` give different results when re-executed on the replica. The tables look fine and lag is zero, but the data is quietly different. That drift is very hard to find later.

Row-Based Replication (`ROW`) logs the before-image and after-image of every row that changed, as binary diffs. This is fully deterministic. `NOW()` on the primary becomes the actual timestamp bytes, not the function call. `UUID()` becomes the actual string bytes. It costs more space for huge bulk updates, but you never get mystery drift. This is the default in MySQL 8.0 and what you should use.

Mixed (`MIXED`) tries to use statement by default and switches to row when it sees something unsafe like a non-deterministic function, trigger, or temp table. It works, but most teams just set `ROW` and stop thinking about it.

How much the primary waits before telling the client "success" is the replication mode:

Asynchronous is the default. The primary commits locally, writes to the binlog, and returns to the client immediately. Zero extra latency, highest write speed. The risk is data loss: if the primary crashes before the dump thread sent the last few events, those transactions are gone. Recovery point objective (RPO) is greater than zero. Failover time depends on an outside tool like Orchestrator or ProxySQL.

Semi-synchronous (`rpl_semi_sync_source_enabled` / `rpl_semi_sync_replica_enabled`) makes the primary pause after writing the binlog until at least one replica's I/O thread confirms "I wrote it to my relay log." The wait point `AFTER_SYNC` means the primary has the binlog synced before it commits locally, so a crash right after cannot lose that transaction. You pay one network round trip on every write, but you get RPO = 0 on primary crash. If no replica answers within `rpl_semi_sync_source_timeout` (for example 5000 ms), the primary silently drops back to async so writes do not hang forever. You must alert on that fallback.

Group Replication is different. It uses Paxos consensus across at least three nodes. Every transaction is certified by a majority before it commits anywhere. You get automatic failure detection, automatic primary election, and built-in conflict detection. It costs more nodes and more cross-node chatter, but you get RPO = 0 and recovery time of a few seconds without an external orchestrator.

How replicas remember their place is either file+position or GTID:

File+position is the old way. A replica says "I am at `mysql-bin.000005` position `140582`." On failover you must compare file numbers and offsets across all replicas, find the most advanced one, and run `CHANGE REPLICATION SOURCE TO SOURCE_LOG_FILE=... SOURCE_LOG_POS=...` by hand. Under outage pressure this is slow and easy to get wrong.

GTID is the modern way. Every committed transaction gets a unique ID like `3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1052` — a UUID for the server plus a sequence number. Each replica stores the set of GTIDs it has already executed in `gtid_executed` (and `gtid_purged`). With `SOURCE_AUTO_POSITION = 1`, a replica just tells the new primary "I have 1-500," and the new primary sends only 501 onward automatically. Failover becomes "point this replica at that new host with auto-position" instead of manual offset math.

Lag is how far behind the mirror is. The classic counter is `Seconds_Behind_Source` (older name `Seconds_Behind_Master`). It is simply the difference between the timestamp in the binlog event header (when the transaction was created on the primary) and the clock time when the applier executes it on the replica. It is useful but misleading — more on that in the traps section.

Why lag happens: the primary can use many threads to commit writes in parallel, but a simple replica replays with one SQL thread. One huge transaction touching 500,000 rows blocks that single thread for minutes. A heavy report query on the replica can hold locks that stall the applier. Slow disk on the replica makes everything slower.

How to fix lag: turn on parallel workers. Set `replica_parallel_workers` to something like 8 or 16, with `replica_parallel_type = LOGICAL_CLOCK` and `replica_preserve_commit_order = ON`. This lets the replica replay in parallel all transactions that committed together in the same binlog group on the primary. Break giant mass updates and deletes into chunks of 1,000 to 5,000 rows in your app code. Keep heavy analytics off the operational replicas — send them to a dedicated reporting replica or to an OLAP store via change-data-capture. And make sure the replica hardware, especially disk IOPS, is at least as strong as the primary.

Failover is what you do when the primary is gone. With async replication and file+position, you must pick the most caught-up replica, promote it to writable, and re-point every other replica by hand — risky. With GTID and crash-safe tables (`master_info_repository = TABLE`, `relay_log_info_repository = TABLE`, `relay_log_recovery = ON`), you promote the best replica, point siblings at it with `SOURCE_AUTO_POSITION = 1`, and they auto-negotiate what they are missing. With semi-sync you know at least one replica has the last transaction. With Group Replication / InnoDB Cluster, failover is automatic: the group detects the failure and elects a new primary in seconds.

## 4. See It In Practice — Real Code or Queries

These examples use MySQL 8.0 syntax. For MySQL 5.7 replace `REPLICA` with `SLAVE` and `SOURCE_` with `MASTER_`.

Primary configuration — enable row-based GTID and durable commits:

```ini
[mysqld]
# Must be unique across every server in the topology
server-id = 1

# Binary log is on by default in MySQL 8.0
log-bin = mysql-bin

# Row-based is deterministic and safe
binlog_format = ROW

# GTID makes failover automatic
gtid_mode = ON
enforce_gtid_consistency = ON

# Sync binlog and InnoDB log on every commit — slower but crash-safe
sync_binlog = 1
innodb_flush_log_at_trx_commit = 1
```

Replica configuration — read-only, crash-safe, and parallel:

```ini
[mysqld]
# Unique for each replica
server-id = 2

relay-log = mysql-relay-bin

# Block normal app users from writing to the mirror
read_only = ON
super_read_only = ON

# Must match the primary
gtid_mode = ON
enforce_gtid_consistency = ON

# Parallel replay so one slow transaction does not block everything
replica_parallel_workers = 8
replica_parallel_type = LOGICAL_CLOCK
replica_preserve_commit_order = ON

# Store replication position in InnoDB so it moves atomically with data
master_info_repository = TABLE
relay_log_info_repository = TABLE
relay_log_recovery = ON
```

Create the replication user and start replication with GTID auto-position:

```sql
-- On the primary: user limited to the replica subnet
CREATE USER 'repl_user'@'10.0.1.%' IDENTIFIED BY 'StrongReplicationPassword123!';
GRANT REPLICATION SLAVE ON *.* TO 'repl_user'@'10.0.1.%';
FLUSH PRIVILEGES;
```

```sql
-- On the replica: point at the primary with auto-position
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST = '10.0.1.10',
  SOURCE_PORT = 3306,
  SOURCE_USER = 'repl_user',
  SOURCE_PASSWORD = 'StrongReplicationPassword123!',
  SOURCE_AUTO_POSITION = 1,
  SOURCE_SSL = 1;

-- Start both the I/O receiver and the SQL applier
START REPLICA;
```

Turn on semi-synchronous so at least one mirror confirms before the primary says success:

```sql
-- On the primary
INSTALL PLUGIN rpl_semi_sync_source SONAME 'semisync_source.so';
SET GLOBAL rpl_semi_sync_source_enabled = 1;
SET GLOBAL rpl_semi_sync_source_timeout = 5000;
SET GLOBAL rpl_semi_sync_source_wait_point = AFTER_SYNC;
```

```sql
-- On the replica
INSTALL PLUGIN rpl_semi_sync_replica SONAME 'semisync_replica.so';
SET GLOBAL rpl_semi_sync_replica_enabled = 1;
STOP REPLICA;
START REPLICA;
```

Check health and lag — run on the replica:

```sql
SHOW REPLICA STATUS\G
```

What to look for in the output:

```txt
Replica_IO_Running: Yes            -- receiver is connected and pulling
Replica_SQL_Running: Yes           -- applier is executing
Seconds_Behind_Source: 0           -- lag in seconds (see trap below)
Last_IO_Error:                     -- network or auth failure shows here
Last_SQL_Error:                    -- duplicate key or DDL error shows here
Retrieved_Gtid_Set: 3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-500
Executed_Gtid_Set: 3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-500
Auto_Position: 1
```

Application-level read-your-own-writes with GTID waiting — guarantee the mirror has your write before you read it:

```sql
-- Step 1 (on primary): write and grab the GTID that was created
UPDATE users SET address = '742 Evergreen Terrace' WHERE id = 42;
SELECT @@GLOBAL.gtid_executed;
-- returns something like '3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1052'

-- Step 2 (on replica): wait up to 1 second for that GTID to appear
-- returns 0 if it arrived in time, 1 if timeout
SELECT WAIT_FOR_EXECUTED_GTID_SET('3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1052', 1.0);

-- Step 3 (on replica): now it is safe to read fresh data
SELECT id, name, address FROM users WHERE id = 42;
```

Simpler alternative many teams use: after a write, pin that user's reads to the primary for a few seconds with a session flag, while all other reads still go to replicas.

## 5. Interview Questions — All of Them, Done Properly

**Q: What are the three threads in MySQL replication and what does each do?**

The binlog dump thread runs on the primary. One dump thread per replica reads committed events from the binary log and pushes them over TCP to that replica.

The replica I/O thread connects to the primary, receives the stream, and writes it straight to the local relay log on disk. It does not parse or execute anything. Its only job is to land data fast so nothing is lost if the applier is slow.

The replica SQL applier thread reads events from the relay log, parses them, and executes them against the local InnoDB engine. When it finishes a transaction it moves its pointer forward and can clean up old relay files.

The split between I/O and SQL matters. The I/O thread can keep buffering at network speed while the applier is stuck on a heavy transaction. If you had only one thread doing both, a long filing job would cause you to miss deliveries.

**Q: What is the difference between statement-based, row-based, and mixed binlog formats, and why is row-based the default now?**

Statement-based logs the SQL text. It makes small log files, but non-deterministic functions break it. `NOW()` evaluates at execution time, so the replica gets a different timestamp. `UUID()` generates a different value. `RAND()` gives a different random number. `UPDATE ... LIMIT 10` without `ORDER BY` can pick a different 10 rows on each server. Everything looks healthy — zero errors, zero lag — but the tables have quietly diverged.

Row-based logs the actual row changes: the before-image and after-image of every row touched. It is deterministic because you are copying bytes, not re-running logic. A bulk update of 100,000 rows creates more binlog volume, but modern disks and networks handle that fine. Correctness beats compactness.

Mixed tries to be clever and uses statement most of the time, switching to row when it sees something unsafe. In practice teams just set `binlog_format = ROW` everywhere and keep reasoning simple. MySQL 8.0 defaults to row for this reason.

**Q: How does GTID work and why did it replace file+position?**

File+position says "I am at `mysql-bin.000004` offset `482910`." To fail over you must compare those numbers across all replicas, find the most advanced one, and re-point each sibling with manual math. Under an outage this is slow and error-prone.

GTID gives every transaction a global passport: `source_uuid:sequence` like `3E11FA47-71CA-11E1-9E33-C80AA9E295A4:45`. Each server tracks the set it has executed in `gtid_executed`. When a replica connects to a new primary with `SOURCE_AUTO_POSITION = 1`, it sends its set. The new primary computes the difference and streams only what is missing. No hand-calculated offsets. You can point a replica at a newly promoted primary and replication just resumes.

**Q: What is the difference between asynchronous, semi-synchronous, and group replication for latency, data loss, and failover?**

Asynchronous commits on the primary and returns to the client immediately. No extra latency. But if the primary crashes before the dump thread sent the last events, that data is lost. Failover is manual or handled by an outside tool. Good for cheap read scaling where a little loss is acceptable.

Semi-synchronous writes to the binlog, sends it, and waits until at least one replica's I/O thread says "wrote it to my relay log" before returning to the client. You add one network round trip to every write, but you get zero data loss on primary crash because at least one other machine has the transaction. If replicas do not answer within `rpl_semi_sync_source_timeout`, it falls back to async so your app does not freeze. You must monitor and alert when that fallback happens.

Group Replication uses Paxos consensus across three or more nodes. Every transaction is certified by a majority before it is considered committed. You get zero data loss, automatic failure detection, and automatic primary election in seconds. The cost is you need at least three nodes and more network chatter. Use it when you want the database to handle failover itself.

**Q: What causes replication lag and how do you find and fix it?**

Lag is when the replica cannot keep up with the primary. The classic cause is a single-threaded applier: the primary uses many threads, the replica replays with one, so writes pile up. A single transaction that touches 500,000 rows blocks the applier for minutes. A long report query on the replica can hold a lock that stalls the applier. A slow disk on the replica makes every apply slower.

To diagnose, check `SHOW REPLICA STATUS` on the replica. Confirm both `Replica_IO_Running` and `Replica_SQL_Running` are `Yes`. Look at `Seconds_Behind_Source`, but do not trust it alone. Check `Last_SQL_Error` for a stuck DDL or duplicate key, and watch disk I/O and CPU on the replica.

To fix, enable parallel workers with `replica_parallel_workers = 8` or higher, `replica_parallel_type = LOGICAL_CLOCK`, and `replica_preserve_commit_order = ON` so group-committed transactions run in parallel. Break huge updates and deletes into chunks of 1,000 to 5,000 rows in app code. Move heavy analytics off operational replicas. Use an online schema tool like `gh-ost` or `pt-online-schema-change` for DDL instead of long blocking `ALTER TABLE`. Make sure replica hardware matches the primary.

**Q: How do you solve read-your-own-writes when reads go to replicas?**

If a user writes to the primary and the next read goes to a lagging replica, they see stale data. Three common fixes:

First, pin that user's reads to the primary for a short window after a write — for example set a cookie or session flag for three seconds so their immediate reads stay fresh, while everyone else still reads from replicas.

Second, use GTID waiting. The primary returns the GTID in the write response. Before reading from a replica, run `WAIT_FOR_EXECUTED_GTID_SET(gtid, timeout)` on that replica so it blocks until it has that transaction.

Third, route critical reads straight to the primary. Checkout verification, password changes, and billing status should always read from the primary. Product catalog or public profiles can safely read from replicas.

**Q: What is crash-safe replication and why do we need it?**

The old way stored replication positions in flat files `master.info` and `relay-log.info`. Those file writes were not part of the InnoDB transaction. If the machine lost power after InnoDB committed a transaction but before the file was updated, the replica would think it had not applied that transaction and try to apply it again — duplicate key error and replication stops.

Crash-safe replication sets `master_info_repository = TABLE`, `relay_log_info_repository = TABLE`, and `relay_log_recovery = ON`. Now the position lives in InnoDB tables `mysql.slave_master_info` and `mysql.slave_relay_log_info`, and the applier updates the position inside the same atomic transaction as the data change. On restart with `relay_log_recovery = ON`, the replica discards any relay log tail it had not fully committed and fetches fresh from the primary at the last safe position.

## 6. The Traps — What Goes Wrong in Production

**Trap: Trusting `Seconds_Behind_Source` as truth.**

`Seconds_Behind_Source` is not a network measurement. It is `current replica clock minus timestamp in the binlog event header`. If the I/O thread loses its connection, no new events arrive, the relay log empties, and the applier is idle — so the value shows `0`. An on-call engineer sees zero and thinks replication is perfect while it is actually disconnected. If clocks drift because NTP is broken, you can even see negative numbers. Always check `Replica_IO_Running`, `Replica_SQL_Running`, and a real heartbeat like `pt-heartbeat`, which writes a one-second tick row on the primary and measures when that tick reaches the replica.

**Trap: Replica drift from statement-based replication.**

Running with `binlog_format = STATEMENT` and executing `UPDATE users SET last_login = NOW(), token = UUID() WHERE status = 'pending' LIMIT 10` picks 10 rows on the primary and generates specific values. The replica re-executes the same SQL and picks a different 10 rows with different `UUID()` values. `SHOW REPLICA STATUS` shows zero errors and zero lag. You only notice weeks later when logins fail. Fix it by using `binlog_format = ROW`.

**Trap: Writing directly to a replica.**

Someone logs into a replica to fix a typo and runs an `UPDATE`. Normal `read_only = ON` still allows users with `SUPER` or `SYSTEM_VARIABLES_ADMIN` to write. That split-brain write sits quietly until the primary sends its own update for the same row — then the applier hits a duplicate key or foreign key conflict and replication stops with `Replica_SQL_Running = No`. Always set `super_read_only = ON` on every replica so even privileged users cannot write. Only replication threads should change replica data.

**Trap: One giant transaction or DDL that blocks everything.**

A single `DELETE FROM audit_logs WHERE created_at < '2025-01-01'` deleting 5 million rows under row-based replication produces 5 million row events. The applier must process them as one big blocking chunk, and no other transaction can make progress. `ALTER TABLE` without an online tool does the same. Split mass operations into loops of 1,000 to 5,000 rows, and use `gh-ost` or `pt-online-schema-change` for schema changes.

**Trap: Semi-sync silently falling back to async.**

You set up semi-sync for zero loss, but a 10-second network blip means the primary gets no ACK within `rpl_semi_sync_source_timeout = 5000`. MySQL quietly degrades to async so writes keep flowing. Ten minutes later the primary crashes — now you are in async and data is lost, even though you thought you were protected. Monitor `Rpl_semi_sync_source_status`. If it flips from `ON` to `OFF`, page someone immediately. Do not let degraded state sit.

## 7. Compare With Related Concepts

**MySQL async replication vs semi-sync vs Group Replication vs InnoDB Cluster**

Async is fire-and-forget. Fastest writes, but RPO greater than zero and failover needs an external tool. Use it for cheap read scaling where occasional loss is tolerable.

Semi-sync guarantees at least one replica has the transaction on disk before the client is told success. You pay one round trip, but you get RPO = 0 as long as you monitor the fallback to async. This is the standard enterprise pair setup.

Group Replication is MySQL's Paxos-based consensus for three or more nodes. Every transaction is certified by a majority before commit. You get RPO = 0, automatic failure detection, and automatic election without a third-party orchestrator. It needs more nodes and more inter-node bandwidth, and rolling deploys need group awareness.

InnoDB Cluster is not a different replication protocol. It is the product that bundles Group Replication with MySQL Shell, MySQL Router, and admin APIs. Think of Group Replication as the engine and InnoDB Cluster as the car. Choose Group Replication when you are reasoning about the protocol. Choose InnoDB Cluster when you want the managed high-availability stack with Router doing read/write splitting and automatic routing to the new primary after failover.

Rule: use async for raw speed, semi-sync for a classic primary-plus-replica pair with durability, Group Replication / InnoDB Cluster when you want the cluster to elect its own primary automatically.

**MySQL replication vs sharding**

Replication copies the same full dataset to many machines to spread reads and survive a failure. Sharding splits different slices of data to different machines, like users 1 to 1,000,000 on node A and 1,000,001 to 2,000,000 on node B, to scale writes and storage beyond one machine.

Rule: need more read throughput or fast failover without rewriting queries — add replicas. Need more write throughput or data larger than one disk — shard, and accept that cross-shard joins and transactions get harder.

**Logical binlog replication vs physical storage replication like Aurora**

Traditional MySQL replication is logical: it ships row diffs or statements and each replica replays them through its own InnoDB engine and its own storage. Aurora's shared-storage model keeps six copies of each data page across three availability zones in the storage layer itself; replicas attach to the same storage and mostly replay buffer pool changes, not full SQL. Logical replication works anywhere — VMs, on-prem, cross-region, cross-cloud — and you keep control. Physical shared storage gives lower replica lag and no duplicated storage but ties you to that platform.

Rule: on vanilla MySQL, RDS, or self-hosted, you are doing logical binlog replication. On Aurora you get shared-storage physical replication. Know which you are debugging.

**Read replicas vs caching with Redis or Memcached**

Replicas answer full SQL — joins, filters, aggregations — with ACID guarantees, but each query still hits disk and the engine.

A cache answers precomputed key lookups from RAM in sub-milliseconds but only for what you put there.

Rule: hot, repeated, key-shaped reads go to Redis. Dynamic relational queries that are hard to precompute go to replicas. Many teams use both: replicas for correctness, cache on top for speed.

## 8. 🧠 The Memory Hook

Primary writes the change to its binlog journal, the dump thread photocopies it, the I/O thread drops the copy in the relay tray, and the applier files it into the mirror binder — GTID is the passport stamp that lets any mirror find its place after a failover, and parallel workers keep the filing clerk from falling behind.
