# What is Binlog

## 1. The Real-World Problem — When You Actually Hit This

It is 2:13 pm. Someone runs `DROP TABLE orders` on the production primary by mistake. Your last full backup was at midnight. Without anything else, you just lost 14 hours of orders, payments, and inventory updates. There is no undo button.

Or this one: you run a primary and a read replica for your product catalog. For weeks everything looks fine. Then a customer complains the replica shows a different price than the primary. No error in the app, no crash. The two databases have quietly drifted apart.

Both failures have the same root cause: MySQL had no reliable, replayable record of every data change. That is exactly what the binary log fixes. It is the only thing that lets you copy changes to a replica and replay history to a point in time after a disaster.

If binlog is off, misconfigured, or already purged, you have no replica and no point-in-time recovery. You are stuck with last night's backup.

## 2. The Analogy — Make the Mechanic Obvious

Think of the binlog as a captain's log on a ship.

The captain does not write down how the engine turns internally. She writes down what changed on the ship and when: "At 08:00 we loaded 200 crates. At 08:12 we changed course to 45 degrees. At 09:03 we renamed the cargo hold."

Every entry is ordered, timestamped, and written in ink so it can be copied and replayed later.

In MySQL, the binlog is that captain's log. Each entry is a data-changing event — an INSERT, UPDATE, DELETE, or DDL like CREATE TABLE — in the order it committed.

The pieces map like this:

- The logbook itself is the sequence of binlog files on the primary (`binlog.000001`, `binlog.000002`, and so on).
- A second ship that copies the logbook page by page is a replica. It reads the primary's binlog and replays it.
- If the ship sinks and you have a photo of it from the harbor last night (your full backup), you can get back to 2:12 pm by replaying the captain's log from harbor time up to one minute before the `DROP TABLE`.
- How the captain writes matters. Writing "we moved north by 10 miles" is like statement-based logging — short, but ambiguous if two ships start from different positions. Writing "we are now at latitude 42.36, longitude -71.05" is like row-based logging — exact, bigger, but always gives the same result when replayed.

The binlog is not the engine's private crash journal (that is the redo log) and it is not the copy the second ship keeps for itself (that is the relay log). It is the shared, replayable history of what changed.

## 3. The Full Explanation — How It Actually Works

In plain words, the binlog is a server-level log that records every data-changing event in order so you can replicate it and replay it later. It does not log SELECTs. It logs what changed, when, and in what transaction.

Internally, MySQL writes committed transactions to a set of binary files. When one file fills up (controlled by `max_binlog_size`, default 1 GB) it rotates to the next file and tracks the list in a `binlog.index` file. Each event has a position offset inside the file and belongs to a transaction. The log is logical — it describes the change — not a physical page image.

It exists for two jobs and nothing else does both:

1.  Replication. The primary writes to the binlog. Replicas connect, read the stream, and replay it. No binlog means no replication.
2.  Point-in-time recovery (PITR). You restore the last full backup, then replay binlog events up to just before the bad statement. No binlog means you can only restore to the last backup.

Those two jobs drive every setting below.

**The three formats.** This is the part interviewers push on.

Statement format logs the SQL text itself: `UPDATE users SET credits = credits + 10 WHERE id = 5`. It is compact and human-readable, but it is not deterministic. Functions like `NOW()`, `UUID()`, `RAND()`, or `UPDATE ... LIMIT 1` without `ORDER BY` can produce a different result on the replica than on the primary. That causes silent drift. That is why you hit the replica-price bug.

Row format logs the actual row changes — the before-image and after-image of each row touched. It is deterministic because the replica does not re-execute the SQL, it just applies the row diff. It is larger, but it is safe. MySQL 8.0 defaults to `binlog_format = ROW` for this reason.

Mixed format starts in statement mode and automatically switches to row mode for statements that are unsafe to replicate as SQL. It tries to get the best of both, but in practice most production systems just use ROW and accept the size cost.

**binlog_row_image.** When you use ROW format, this controls how much of the row is logged. `FULL` logs all columns for every changed row — safest and the default. `MINIMAL` logs only the primary key plus changed columns, which saves space and I/O but makes debugging and some tools harder. `NOBLOB` is in between. If someone says they switched to MINIMAL to save disk, ask how they debug a bad row change with no before-image.

**GTID.** Without GTID, a replica tracks its position as a filename and byte offset like `binlog.000042:1943`. If you fail over to a new primary, you have to figure out the correct file and position by hand, and it is easy to skip or duplicate transactions. A GTID (Global Transaction ID) gives every committed transaction a unique ID like `3E11FA47-...:12345` that is the same on every server in the topology. Replicas can say "I have executed everything up to GTID X, send me what comes next" and failover becomes auto-positioning. Modern MySQL topologies use `GTID_MODE = ON` and `enforce_gtid_consistency`.

**Purging and retention.** Binlogs grow forever unless you purge them. The old variable `expire_logs_days` is gone in MySQL 8.0. The new one is `binlog_expire_logs_seconds`, default 2592000 (30 days). MySQL automatically deletes files older than that. You can also purge manually with `PURGE BINARY LOGS BEFORE NOW() - INTERVAL 3 DAY`. Never delete binlog files with `rm` on the filesystem — MySQL will think they still exist and replication will break. If you set expiry too short, a replica that was offline for a week can never catch up, and you lose your PITR window. If you set it too long or never purge, you fill the disk and the primary stops accepting writes.

**The mysqlbinlog tool.** Binlog files are binary, not text. `mysqlbinlog` decodes them into readable SQL so you can inspect or replay them. You use it to do PITR: decode from a start time to just before the accident and pipe the output into MySQL.

**Durability knob.** `sync_binlog` controls how often MySQL flushes the binlog to disk. `sync_binlog = 1` flushes every commit — safest, a bit slower. `sync_binlog = 0` lets the OS decide — faster but you can lose the last few transactions on a crash. Most production systems use `1` because losing committed data is worse than a little extra fsync cost.

To go deeper on how replicas actually consume this log, see [What is MySQL replication](./what-is-mysql-replication.md).

## 4. See It In Practice — Real Code or Queries

These are the commands you actually run on a MySQL 8.0 primary.

Check whether binlog is on and what format you are using:

```sql
-- Is binlog enabled? Should be ON on any production primary
SHOW VARIABLES LIKE 'log_bin';

-- Current format: ROW, STATEMENT, or MIXED. Expect ROW on 8.0
SHOW VARIABLES LIKE 'binlog_format';

-- How much of the row is logged in ROW mode
SHOW VARIABLES LIKE 'binlog_row_image';

-- GTID mode
SHOW VARIABLES LIKE 'gtid_mode';

-- How long MySQL keeps binlog files before auto-purging
SHOW VARIABLES LIKE 'binlog_expire_logs_seconds';

-- List binlog files and sizes
SHOW BINARY LOGS;

-- Where you are right now — file and position
SHOW MASTER STATUS;
```

Typical production configuration in `my.cnf`:

```ini
[mysqld]
# Enable binlog (on by default in 8.0, but be explicit)
log_bin = binlog
binlog_format = ROW
binlog_row_image = FULL
binlog_expire_logs_seconds = 2592000  # 30 days, tune for disk and PITR needs
sync_binlog = 1
gtid_mode = ON
enforce_gtid_consistency = ON
server_id = 101  # must be unique per server in the topology
```

Inspect a binlog file without replaying it:

```bash
# Decode to text and page through it
mysqlbinlog --base64-output=decode-rows -vv binlog.000042 | less

# Decode only events from a time window
mysqlbinlog --start-datetime="2026-08-26 00:00:00" \
            --stop-datetime="2026-08-26 02:12:59" \
            binlog.000042 > /tmp/replay.sql
```

Purge old logs the safe way:

```sql
-- Automatic purging is handled by binlog_expire_logs_seconds,
-- but you can purge manually when you need space:

-- Keep only the last 3 days
PURGE BINARY LOGS BEFORE NOW() - INTERVAL 3 DAY;

-- Or purge up to a specific file (deletes everything before it)
PURGE BINARY LOGS TO 'binlog.000048';
```

Point-in-time recovery after a `DROP TABLE` at 02:13:00:

```bash
# 1. Restore last full backup to a new instance (example with mysql CLI)
mysql < /backups/full_backup_2026-08-26_0000.sql

# 2. Replay binlog from backup time up to one second before the accident
mysqlbinlog --start-datetime="2026-08-26 00:00:00" \
            --stop-datetime="2026-08-26 02:12:59" \
            binlog.000042 binlog.000043 | mysql

# With GTID, you can also use ranges:
mysqlbinlog --include-gtids="3E11FA47-...:1-4829" binlog.000042 | mysql
mysqlbinlog --exclude-gtids="3E11FA47-...:4830" binlog.000043 | mysql
```

If you use replication, the replica side is just pointing at the binlog stream:

```sql
-- On the replica (MySQL 8.0 syntax)
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='primary.example.com',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='...',
  SOURCE_AUTO_POSITION=1,  -- GTID auto-positioning, no file:pos needed
  GET_MASTER_PUBLIC_KEY=1;

START REPLICA;
SHOW REPLICA STATUS\G
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is the binlog and why does MySQL need it?**

The binlog is MySQL's server-level binary log of every data-changing event — writes and DDL — in commit order. MySQL needs it for two things nothing else provides: replication and point-in-time recovery. The primary writes to the binlog, replicas read it and replay it to stay in sync, and after a restore you replay binlogs to get from the backup time to just before a mistake. The redo log cannot do this — it is a physical crash-recovery log for InnoDB, not a logical history you can ship to another server.

**Q: What are statement, row, and mixed binlog formats, and why is ROW the default in MySQL 8.0?**

Statement format logs the SQL text. It is small but unsafe — non-deterministic functions like `NOW()`, `UUID()`, `RAND()`, user-defined functions, and `LIMIT` without `ORDER BY` can produce different results on a replica, causing drift.

Row format logs the actual before and after images of each changed row. The replica applies the row diff directly without re-executing the SQL, so it is deterministic.

Mixed format uses statement by default and switches to row for statements the server knows are unsafe.

ROW is the default in 8.0 because correctness beats compactness. Drift from statement format is silent and hard to detect. Disk is cheap, data divergence is not.

**Q: What is binlog_row_image and when would you change it?**

In ROW mode, `binlog_row_image` controls which columns are written for each row change. `FULL` writes every column (default, safest for debugging and flashback tools). `MINIMAL` writes only the primary key and changed columns, which reduces binlog size and I/O. `NOBLOB` is a middle ground for tables with large blobs. You might switch to MINIMAL on a write-heavy table with wide rows to cut binlog volume, but you lose full before-images, so point-in-time debugging and some audit tools become harder.

**Q: What is a GTID and why is it better than file name plus position?**

A GTID is a globally unique ID for each committed transaction, like `server_uuid:sequence_number`. With old file:position replication, a replica says "I am at binlog.000042 offset 1943." After a failover, you have to manually find the matching position on the new primary, which is error-prone. With GTIDs, a replica says "I have executed GTIDs 1 through 4829, send me 4830 onward." MySQL handles positioning automatically, avoids duplicate or skipped transactions, and makes failover and re-cloning much safer. That is why `SOURCE_AUTO_POSITION=1` exists.

**Q: How do you do point-in-time recovery with the binlog?**

You need a full backup plus the binlogs from backup time forward. Steps: restore the backup to a new instance, use `mysqlbinlog` to decode binlogs from the backup timestamp up to just before the bad event (use `--start-datetime` and `--stop-datetime`, or `--include-gtids` / `--exclude-gtids`), and pipe that SQL into MySQL. To find the bad event, decode the binlog with `mysqlbinlog --base64-output=decode-rows -vv` and search for the `DROP`, then stop one second before it. Without binlogs covering that window, PITR is impossible.

**Q: How does binlog purging work and what happens if you get it wrong?**

MySQL 8.0 auto-purges using `binlog_expire_logs_seconds` (default 30 days). You can also run `PURGE BINARY LOGS BEFORE ...` or `PURGE BINARY LOGS TO ...`. Never use `rm` on the filesystem. If you purge too aggressively or set expiry too short, two things break: a replica that was down for a few days cannot rejoin because its needed binlogs are gone, and you lose your PITR window so the `DROP TABLE` recovery fails. If you never purge, binlogs fill the disk and MySQL stops accepting writes. Monitor disk and `SHOW BINARY LOGS` size.

**Q: How do you inspect a binlog file?**

Binlogs are binary, so you use `mysqlbinlog`. For row events, use `--base64-output=decode-rows -vv` to see the before and after row images as pseudo-SQL with comments. Filter by time with `--start-datetime` / `--stop-datetime` or by GTID with `--include-gtids`. You can also run `SHOW BINLOG EVENTS IN 'binlog.000042' LIMIT 20` from the MySQL client for a quick look without shell access.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Binlog is disabled, so you have no replica and no PITR.**

On a dev laptop this feels harmless, so people ship to staging with `skip-log-bin` or forget to enable it on a new primary. Then you try to add a replica or recover from a bad migration and there is nothing to read. Fix: treat `log_bin = ON` as a production baseline. Verify with `SHOW VARIABLES LIKE 'log_bin'` in your deploy check and your backup runbook. MySQL 8.0 enables it by default, but do not assume — check.

**Trap 2: Statement format causes silent replica drift.**

You use `STATEMENT` because the binlogs are smaller. Then someone writes `UPDATE leaderboard SET score = score + FLOOR(RAND() * 10) LIMIT 5` or `INSERT INTO logs SELECT * FROM staging ORDER BY created_at LIMIT 100` without a deterministic `ORDER BY`. The primary and replica execute the same SQL but get different rows or different random values. No error, just diverging data you discover weeks later. Fix: use `ROW` in production. If you must use `MIXED`, understand it still logs some statement events and can surprise you. `ROW` is boring and correct.

**Trap 3: Deleting binlog files with rm instead of PURGE.**

Disk is full at 3 am, someone runs `rm binlog.0000*` to free space. MySQL still lists those files in its index, replicas still request them, and replication breaks with "could not find log file" errors. PITR also breaks because the chain is incomplete. Fix: always use `PURGE BINARY LOGS ...` from inside MySQL. Set an alert on disk usage well before it fills.

**Trap 4: Expiry is too short, or too long.**

A team sets `binlog_expire_logs_seconds = 86400` (one day) to save disk. A replica goes down for a weekend. When it comes back, its needed binlogs are already purged — it needs a full rebuild. Or the opposite: expiry is 90 days on a write-heavy primary, binlogs grow to hundreds of gigabytes, and the disk fills. Fix: size expiry from your real needs — replica downtime tolerance plus PITR window plus disk headroom — and monitor both `SHOW BINARY LOGS` total size and free disk.

**Trap 5: sync_binlog set to 0 for speed, then a crash loses committed data.**

`sync_binlog = 0` lets the OS buffer binlog writes, which is faster. If MySQL crashes, the last few committed transactions were acknowledged to the app but never made it to the binlog, so replicas never get them and PITR cannot recover them. Fix: use `sync_binlog = 1` on production. The fsync cost is the price of durability. If you need more throughput, tune elsewhere before weakening this.

**Trap 6: Filtering the binlog so replicas are missing data.**

Settings like `binlog_do_db` or `binlog_ignore_db` filter what gets written to the binlog based on the current database, not the table. `USE reporting; UPDATE production.orders SET ...` can be silently excluded. Then your replica is missing writes with no obvious error. Fix: do not filter on the primary's binlog unless you fully understand the `USE` pitfall. Filter on the replica side if you must, and test with cross-database statements.

## 7. Compare With Related Concepts

**Binlog vs redo log.** People mix these up because both are logs and both involve durability, but they solve different problems. The binlog is a server-level logical log — "row 5 changed from A to B." It is used for replication and PITR, it is written once per committed transaction, and you can ship it to another server. The redo log is an InnoDB storage-engine physical log — "page 42, offset 128, write these bytes." It is used to recover unflushed pages after a crash, it is fixed-size and circular, and it never leaves the server. They work together: on commit, InnoDB prepares the redo log, MySQL writes the binlog, then InnoDB commits. Crashes need redo; replicas and time travel need binlog. Rule: if someone asks how to replicate or recover to 2:12 pm, the answer is binlog. If they ask how MySQL survives a power cut without losing a committed transaction, the answer is redo log plus `sync_binlog = 1` and `innodb_flush_log_at_trx_commit = 1`.

**Binlog vs relay log.** The binlog lives on the primary. The relay log lives on the replica. The replica's I/O thread copies events from the primary's binlog into its own relay log files, and then the SQL/applier thread reads the relay log and executes the events. Think captain's log versus the second ship's photocopy. You configure and purge the binlog on the primary; you monitor relay log lag and `SHOW REPLICA STATUS` on the replica. If replication is lagging, the relay log is where the queue builds up.

**Binlog vs undo log.** The undo log lets InnoDB roll back an uncommitted transaction and provides old row versions for MVCC reads. It is per-transaction and short-lived. The binlog only records committed work and is kept for days. You never use undo to replicate or do PITR.

**Row vs statement vs mixed — quick rule.** Use ROW unless you have a proven reason not to. Use STATEMENT only for tiny, fully deterministic workloads where binlog size is the bottleneck. Treat MIXED as legacy — ROW has made it mostly unnecessary.

For the full replication flow that consumes the binlog, read [What is MySQL replication](./what-is-mysql-replication.md) next.

## 8. 🧠 The Memory Hook

The binlog is the captain's log — the ordered, replayable history of every committed change. Lose the log, lose the ability to copy the ship or rewind time.
