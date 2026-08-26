# How do you backup and restore MySQL database

## 1. The Real-World Problem — When You Actually Hit This

It is 2am and someone just dropped the wrong table in production. Or a bad migration deleted half the orders. You go to restore and realize your nightly `mysqldump` has been failing silently for three weeks because the disk filled up. There is no restorable backup. That is lost data and a resume-updating incident.

The other way it fails is quieter. You run a plain `mysqldump` on a busy production database at noon, without any flags, and suddenly checkout starts timing out. The dump locked tables while it read them row by row, and every write had to wait. You got a backup, but you locked prod to do it and the dump itself is inconsistent — half the tables are from 12:00 and half from 12:15. Restoring that gives you foreign keys pointing at rows that did not exist at the same moment.

Backups exist for one reason: you must be able to lose the primary server and come back with minimal data loss and minimal downtime. If you cannot restore quickly to an exact point in time, you do not have a backup, you have a file.

## 2. The Analogy — Make the Mechanic Obvious

Think of MySQL as a busy office with filing cabinets where people are constantly pulling files out, writing in them, and putting them back.

A logical backup with `mysqldump` is like sending someone through the office to copy every file by hand — they open each drawer, read each page, and write down instructions to recreate it elsewhere: "create drawer called orders, put this page in, put that page in." It is portable and human-readable, but slow for a huge office and hard to do while people keep changing things.

`--single-transaction` is the trick that makes that hand-copy work without stopping the office. The copier says "freeze the view at 12:00" and then copies from that frozen view while everyone else keeps working on the real cabinets. In InnoDB this is a consistent snapshot — you get every cabinet as it looked at the same instant.

A physical backup with Percona XtraBackup is different. Instead of copying page by page, you photocopy the entire filing cabinets directly — the raw files on disk. You do it while the office is open, so you keep a notepad for any changes that happen during the copy, then merge those changes at the end to get a consistent set. It is much faster for a huge office, but the copy only works on the same kind of cabinets.

The binlog is the security camera that records every change anyone makes after the copy started — "at 12:01 Alice changed order 402 to shipped." Point-in-time recovery is taking yesterday's full copy and replaying the camera footage until one second before the mistake.

A filesystem or EBS snapshot is taking a photo of the whole room in one instant — fast, but you get everything or nothing and you depend on the building's system to freeze the moment correctly.

## 3. The Full Explanation — How It Actually Works

There are three families of MySQL backup, and you pick based on size, downtime tolerance, and how precisely you need to roll back.

Logical backups export SQL. `mysqldump` reads tables and writes `CREATE TABLE` and `INSERT` statements. The result is a plain text file you can restore on any MySQL version or move to another host with `mysql < dump.sql`. It is simple and flexible. It is also slow to take and slow to restore because MySQL has to re-execute every insert and rebuild every index. For a few GB it is fine. For 500GB it can take hours.

To make a logical backup consistent without locking the whole database, you use `--single-transaction`. That flag, only for InnoDB, starts a REPEATABLE READ transaction and then dumps from that snapshot. No `FLUSH TABLES WITH READ LOCK` for the whole dump. Writers keep writing. Without it, `mysqldump` locks table by table, so you can get orders from after payments — an inconsistent, unusable backup. If you have any MyISAM tables, `--single-transaction` does not protect them — those still need a lock.

`--quick` matters too. Without it, `mysqldump` buffers the whole table in memory before writing. For a big table that means OOM on the dumper or the server. `--quick` streams row by row.

Physical backups copy the InnoDB data files directly. Percona XtraBackup is the standard open-source tool. It copies `ibdata`, `.ibd` files while tracking changed pages from the redo log, then does a `prepare` step to apply those changes and produce a consistent data directory you can start MySQL from. It is a hot backup — no long locks — and restore is just copying files back, which is much faster than replaying SQL. The trade-off is the backup is tied to the MySQL version and InnoDB storage, and you need filesystem access, not just a SQL connection.

Binlog-based point-in-time recovery fills the gap between full backups. MySQL's binary log records every write in order. If you take a full backup Sunday at midnight and keep all binlogs, you can restore Sunday's backup and replay binlogs with `mysqlbinlog` up to "one second before the bad DROP" on Tuesday at 14:29:59. To make this work you need `log_bin` on, a non-`STATEMENT` binlog format that is deterministic, regular full backups, and binlog retention that is not purged too early. `mysqlbinlog` can filter by position, GTID, or datetime.

`--master-data` and GTID handle replication coordinates. `--master-data=2` writes a commented `CHANGE MASTER TO` with the binlog file and position at the moment of the dump, so a new replica can start from exactly there. In GTID mode, `--set-gtid-purged=ON` (the default) adds `SET GTID_PURGED` so the restored server knows which transactions it already has. Get this wrong and a restore either replays duplicates or skips transactions.

Verification is not optional. An untested backup is not a backup. You must regularly restore to a throwaway instance — ideally automated nightly — and run checks: does MySQL start, does row count match, does the app boot against it, do checksums match.

MySQL 8.0 changes a few things you will get asked about. The default authentication plugin is `caching_sha2_password`, so old `mysqldump` clients can fail to connect unless updated. XtraBackup 8.x is required for MySQL 8.0; 2.4 will not work. `mysqlpump` was deprecated — use `mysqldump` or `mydumper` for parallel logical dumps. The default charset is `utf8mb4` and `utf8mb3` is deprecated, so dumps carry that. GTID is far more common in 8.0 setups, so `--set-gtid-purged` and `gtid_executed` handling comes up constantly. Clone plugin exists in 8.0 for provisioning replicas but is not a replacement for backups and PITR.

Put together, a solid production setup is usually: nightly logical or weekly physical full backup stored off-host and encrypted, continuous binlog archiving to object storage, automated restore test every day, and documented runbooks with measured restore time.

## 4. See It In Practice — Real Code or Queries

Logical backup that is safe for a busy InnoDB production database:

```bash
# consistent, streamed, includes routines/triggers, keeps GTID handling explicit
mysqldump --single-transaction --quick \
  --routines --triggers --events --hex-blob \
  --set-gtid-purged=OFF \
  -u backup_user -p myapp > myapp_$(date +%F).sql

# if this dump will be used to provision a replica, capture coordinates
mysqldump --single-transaction --quick --master-data=2 \
  -u backup_user -p --all-databases > full_with_pos.sql

# dump only schema or only data when you need it
mysqldump --single-transaction --no-data myapp > schema.sql
mysqldump --single-transaction --no-create-info myapp orders > orders_data.sql
```

Restore from a logical dump:

```bash
# create the empty database first if needed, then replay
mysql -u root -p -e "CREATE DATABASE myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -u root -p myapp < myapp_2026-08-25.sql

# for a full instance restore that contains GTID info, you may need to reset first
mysql -u root -p -e "RESET MASTER;"
mysql -u root -p < full_with_pos.sql
```

Point-in-time recovery with binlogs:

```bash
# 1. restore last full backup
mysql -u root -p < full_sunday_midnight.sql

# 2. find the bad transaction — search binlogs around the incident
mysqlbinlog --base64-output=DECODE-ROWS -vv binlog.000042 | grep -A 5 "DROP TABLE"

# 3. replay binlogs up to one second before the mistake
mysqlbinlog --stop-datetime="2026-08-25 14:29:59" binlog.000042 binlog.000043 | mysql -u root -p

# more precise: replay by GTID range if you know the bad GTID
mysqlbinlog --exclude-gtids="a1b2c3d4-...:12345" binlog.000042 | mysql -u root -p
```

Hot physical backup of a large InnoDB instance with XtraBackup:

```bash
# take the backup — hot, no long lock
xtrabackup --backup --user=backup --password="$PASS" --target-dir=/data/backups/base

# prepare it — replay redo log to make files consistent
xtrabackup --prepare --target-dir=/data/backups/base

# restore — stop MySQL, empty datadir, copy back, fix permissions, start
systemctl stop mysql
rm -rf /var/lib/mysql/*
xtrabackup --copy-back --target-dir=/data/backups/base
chown -R mysql:mysql /var/lib/mysql
systemctl start mysql

# incremental on top of base — common for large DBs to save time
xtrabackup --backup --target-dir=/data/backups/inc1 --incremental-basedir=/data/backups/base
xtrabackup --prepare --apply-log-only --target-dir=/data/backups/base
xtrabackup --prepare --target-dir=/data/backups/base --incremental-dir=/data/backups/inc1
```

Verification you should automate nightly:

```bash
# restore to a throwaway container and sanity check
docker run -d --name mysql-restore -e MYSQL_ROOT_PASSWORD=test mysql:8.0
cat myapp_2026-08-25.sql | docker exec -i mysql-restore mysql -uroot -ptest myapp
docker exec mysql-restore mysql -uroot -ptest -e "CHECK TABLE myapp.orders; SELECT COUNT(*) FROM myapp.orders;"

# checksum a critical table before and after
mysql -u root -p -N -e "CHECKSUM TABLE myapp.orders;" > before.txt
# after restore on test host, compare
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you backup and restore a MySQL database in production?**

Start with the two families. For small to medium DBs, `mysqldump --single-transaction --quick` gives a consistent logical dump without long locks on InnoDB. You restore with `mysql < dump.sql`. For large InnoDB DBs where dump and restore would take hours, use Percona XtraBackup for a hot physical backup and `xtrabackup --prepare` plus `--copy-back` to restore. In both cases you keep binlogs and use `mysqlbinlog` for point-in-time recovery between full backups. And you verify by actually restoring to a staging host nightly — otherwise you do not know it works.

**Q: What does `--single-transaction` actually do and when does it not work?**

It starts a transaction with REPEATABLE READ and dumps every InnoDB table from that single snapshot. That means all tables are consistent as of the same instant without locking writes. It works because InnoDB is MVCC — readers do not block writers. It does not work for MyISAM — MyISAM has no MVCC, so those tables still get locked with `FLUSH TABLES WITH READ LOCK` unless you use `--lock-all-tables`. Also, if your dump runs a long time and the undo history grows huge, it can add pressure on the server. Alternatives like `mydumper` do parallel consistent dumps for large InnoDB.

**Q: What is the difference between `--master-data` and GTID handling?**

Both record where the backup sits in the replication stream so a replica or PITR can continue exactly. `--master-data=2` writes a commented `CHANGE MASTER TO MASTER_LOG_FILE=..., MASTER_LOG_POS=...` line. GTID mode instead records executed GTID sets with `SET GTID_PURGED`. If you restore a dump with GTIDs onto a server that already has different `gtid_executed`, MySQL will refuse or skip. That is why `--set-gtid-purged=OFF` is common when you just want data without GTID metadata, and `ON` or `AUTO` when you are cloning a replication topology.

**Q: How do you do point-in-time recovery?**

You need a full backup plus all binlogs since that backup. Restore the full backup to a new instance, then use `mysqlbinlog` to replay binlogs up to the moment before the bad statement. You filter by `--stop-datetime`, `--stop-position`, or `--exclude-gtids`. After replay, you point the app at the recovered instance or dump the repaired tables back to prod. The key prerequisite is that binlogs were retained — if `expire_logs_days` or `binlog_expire_logs_seconds` already purged them, PITR is impossible.

**Q: How do you backup a 500GB production MySQL with minimal downtime?**

A single `mysqldump` would take hours to take and even longer to restore, and it would still put load on prod. Use XtraBackup for a hot physical full backup plus daily incrementals, stream the backup directly to object storage like S3, and keep binlogs archived continuously. Test restore time — with physical files a 500GB restore is copy plus prepare, maybe 30-60 minutes depending on IOPS, versus many hours replaying inserts. For logical portability you can still take a weekly `mydumper` parallel dump off a replica, not the primary.

**Q: How do you verify a backup is restorable?**

You automate a restore every night to an isolated host or container, start MySQL on it, run `CHECK TABLE`, compare row counts and checksums for critical tables, and boot the app's health checks against it. You also measure how long restore and PITR take so you can give a real RTO. Fail the pipeline if any step fails and alert. Storing a checksum of the dump file itself catches corruption in transit to S3.

**Q: What changed in MySQL 8.0 that affects backups?**

Three things interviewers expect. One, `caching_sha2_password` is the default, so you need a MySQL 8.0-compatible client for `mysqldump` and `mysqlbinlog`. Two, XtraBackup 8.x is required — the 2.4 branch does not support MySQL 8.0 data files. Three, `utf8mb4` is the default and `utf8` now means `utf8mb3`, so dumps and restores should be explicit about charset to avoid collation surprises. Clone plugin is new but is for fast replica provisioning, not a substitute for off-host backups with PITR.

## 6. The Traps — What Goes Wrong in Production

Running `mysqldump` without `--single-transaction` on a live InnoDB database. It feels like it worked, but each table was read at a different time while writes kept happening. Orders and payments no longer line up. The fix is always `--single-transaction --quick` for InnoDB, and if you have MyISAM, plan a maintenance window or migrate those tables.

Forgetting `--quick` on a large table. Without it the client buffers the whole table in memory. On a 20 million row table the dumper gets OOM-killed and you get a truncated file that looks like a successful backup until you try to restore. Stream with `--quick` and monitor dump exit codes.

Restoring a dump with GTID on a server that already has data. The dump contains `SET GTID_PURGED` and MySQL refuses with "GTID_PURGED can only be set when GTID_EXECUTED is empty." People then manually edit the dump and break replication. Fix it by restoring to an empty `RESET MASTER` instance, or dump with `--set-gtid-purged=OFF` when GTID metadata is not needed, and understand whether you want to keep or discard the source's GTID history.

Binlogs already purged before you need them. `binlog_expire_logs_seconds` defaults to 30 days in 8.0, but many teams set it to 3 days to save disk and then cannot do PITR for last week. Archive binlogs to S3 or similar immediately with `mysqlbinlog --read-from-remote-server --raw` or a sidecar, and monitor `SHOW BINARY LOGS` size.

Storing backups on the same host or same AZ as the primary. The host dies and the backup dies with it. Always stream off-host, encrypt at rest, test cross-region restore, and keep at least one verified copy outside the primary's failure domain.

Locking prod during backup because of MyISAM or `--lock-all-tables`. If any table is MyISAM, `--single-transaction` will still acquire a global read lock. Check `SELECT TABLE_SCHEMA, TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE ENGINE='MyISAM';` and either convert to InnoDB or schedule accordingly. For pure InnoDB, `--single-transaction` avoids that lock.

Not testing restore and not measuring restore time. Teams check that the dump file exists and is non-zero and call it done. Months later restore takes 9 hours and the RTO is blown. Automate a full restore and PITR drill, record duration, and keep a one-page runbook.

## 7. Compare With Related Concepts

**Logical backup (mysqldump / mydumper) vs physical backup (XtraBackup) vs filesystem snapshot (LVM / EBS snapshot).** Logical is SQL text — portable across versions and hosts, easy to restore a single table or database, but slow to take and very slow to restore because indexes are rebuilt. Physical is raw InnoDB files — fast to take hot and fast to restore by copying files, but tied to MySQL version and requires filesystem access and a prepare step. Snapshot is the storage layer freezing the disk in one instant — fastest to take and consistent if you do `FLUSH TABLES WITH READ LOCK` plus `FLUSH BINARY LOGS` briefly, but it is all-or-nothing for the whole disk, depends on the infrastructure, and still needs binlogs for PITR. Rule: use logical for small DBs and portability, physical for large InnoDB where speed matters, and snapshot as a complement, not a replacement, for off-host SQL or physical backups.

**mysqldump vs mydumper.** `mysqldump` is single-threaded and simple, included with MySQL. `mydumper` dumps tables in parallel with consistent snapshots and restores in parallel with `myloader`, which is dramatically faster for large DBs. Rule: if your dump takes more than an hour, try `mydumper`.

**Binlog PITR vs delayed replica.** PITR replays binlogs onto a restored backup to reach an arbitrary second. A delayed replica lags by say one hour and lets you quickly stop replication before a bad write propagates, then promote. Pitr can go back days if you have binlogs, delayed replica only protects within its lag window. Rule: use a delayed replica as a fast undo for recent human errors, and binlog archiving plus full backups as the general PITR safety net.

**Clone plugin vs backup.** `CLONE INSTANCE` copies a live MySQL 8.0 instance to another host quickly for provisioning. It is not a backup — it has no history, no PITR, and nothing off-host after the source is gone. Rule: Clone to add a replica fast, backup plus binlogs to survive data loss.

## 8. 🧠 The Memory Hook

A backup you have never restored is just a file you hope is useful. Dump consistently with `--single-transaction`, keep every binlog so you can replay to one second before the mistake, and prove it works by restoring to a different machine every night.
