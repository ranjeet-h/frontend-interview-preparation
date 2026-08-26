# Primary-Replica (Master-Slave) Architecture in MySQL: Setup, Failover, and Read-Scale Topology

## 1. Why This Exists — The Problem First

Every growing application starts on a single database instance. In the beginning, this is simple and fast. But as traffic climbs, two fatal operational walls emerge:

1. **The Read-Write Resource Starvation Wall:** In most web applications, 90% to 99% of database queries are reads (product catalog browsing, profile lookups, feed fetching), while only 1% to 10% are writes (orders, balance updates, account creation). When an internal analytics dashboard or a heavy search query runs an unindexed multi-table `JOIN`, it consumes 100% of CPU and disk I/O. Because reads and writes share the same server, critical write transactions lock up, connection pools exhaust, and users cannot complete checkouts. Read traffic chokes write availability.
2. **The Single-Point-of-Failure Disaster:** When running on a standalone MySQL node, a dead power supply, kernel panic, or corrupted storage disk brings down your entire business. Without a live, synchronized standby, disaster recovery means provisioning a new host, downloading a 500 GB backup from object storage, replaying transaction logs, and reconfiguring application strings. This turns a routine hardware hiccup into 4 hours of catastrophic downtime and permanent data loss.

Primary-Replica (historically called Master-Slave) replication exists to solve both problems: it separates read throughput from write capacity by broadcasting changes to multiple read-only nodes, while maintaining warm standby nodes ready to take over writes the second the primary dies.

## 2. The Analogy — Make It Obvious

Imagine a world-famous Master Scribe running the central hall of a royal archive:

- **The Master Scribe (The Primary Database):** The only person with the royal authority to write new laws, update citizen titles, or cross out old decrees in the master parchment ledger.
- **The Public Reading Rooms (The Replicas):** Rooms in different parts of the city where thousands of citizens gather every minute to read and verify laws. The reading room staff are strictly forbidden from writing or altering decrees; they only display exact copies of what the Master has written.
- **The Master's Activity Diary (The Binary Log / Binlog):** Every time the Master writes or modifies a record, they write down a timestamped log entry describing the exact modification.
- **The Courier Runner (The Replica I/O Thread):** A dedicated runner assigned to each reading room who stands by the Master's desk. The moment a new entry appears in the Master's diary, the courier grabs a copy, runs back to their local reading room, and drops it into an in-tray.
- **The In-Tray (The Relay Log):** A local queue holding diary entries that arrived from the Master but have not yet been copied into the local reading room books.
- **The Local Assistant (The Replica SQL Thread):** A local scribe who reads each page from the in-tray in the exact order it arrived and diligently writes it into the local reading room ledger.
- **Emergency Succession (Failover):** If the Master Scribe suffers a heart attack, the royal council immediately identifies whichever reading room courier has the most up-to-date in-tray, crowns that assistant as the new Master Scribe, and points all other couriers to their new desk.

```txt
┌────────────────────────────────────────────────────────┐
│               PRIMARY NODE (Read-Write)                │
│  Client Writes ──► [ InnoDB Storage Engine ]           │
│                             │                          │
│                     Writes committed                   │
│                             ▼                          │
│                    [ Binary Log (Binlog) ]             │
│                             │                          │
│                    Binlog Dump Thread                  │
└─────────────────────────────┼──────────────────────────┘
                              │ Network Stream (TCP)
                              ▼
┌────────────────────────────────────────────────────────┐
│               REPLICA NODE (Read-Only)                 │
│                     Replica I/O Thread                 │
│                             │                          │
│                    Writes incoming events              │
│                             ▼                          │
│                    [ Relay Log ]                       │
│                             │                          │
│                    Replica SQL Thread                  │
│                             ▼                          │
│  Client Reads  ◄── [ InnoDB Storage Engine ]           │
└────────────────────────────────────────────────────────┘
```

## 3. How It Actually Works — The Full Explanation

MySQL Primary-Replica replication works by streaming the Primary instance's transaction logs across the network to one or more Replicas, which independently replay those transactions in sequential order.

### The Topology and Read-Write Splitting

In a primary-replica cluster:
- **Primary Node:** Configured for read-write operations (`read_only = 0`). All `INSERT`, `UPDATE`, `DELETE`, and `ALTER TABLE` statements execute here.
- **Replica Nodes:** Configured to reject all direct client writes by enabling `read_only = 1` and `super_read_only = 1`. They serve `SELECT` traffic exclusively.
- **Connection Routing:** The application layer routes traffic using database middleware (such as ProxySQL, AWS Aurora Reader Endpoints, or HAProxy) or via dual application connection pools (e.g., routing `@Transactional(readOnly = true)` to replica pools and standard transactions to the primary pool).

### The Three Internal Replication Threads

Replication relies on three distinct asynchronous threads operating across the network boundary:

1. **Binlog Dump Thread (Runs on Primary):**
   When a replica connects, the primary spawns a Binlog Dump thread. This thread monitors the Primary's Binary Log (`mysql-bin.xxxxxx`). As the Primary commits transactions, this thread reads the newly written binary log events and pushes them over the TCP socket to the replica.
2. **Replica I/O Thread (Runs on Replica):**
   When replication starts (`START REPLICA`), the replica spawns an I/O thread. It establishes a persistent TCP connection to the Primary, authenticates with dedicated replication credentials, requests events starting from a specific log coordinate or GTID, receives the streamed events, and writes them sequentially to the local disk into the **Relay Log** (`relay-bin.xxxxxx`).
3. **Replica SQL (Applier) Thread (Runs on Replica):**
   The SQL thread reads events sequentially from the local Relay Log and executes them against the replica's local storage engine, modifying data files to match the primary. In MySQL 8.0+, this can be configured as a multi-threaded applier (`replica_parallel_workers > 0`) to execute non-conflicting transactions concurrently using dependency graphs (`LOGICAL_CLOCK`).

### Replication Formats: SBR vs RBR vs Mixed

The Binary Log can record events in three different formats:

- **Statement-Based Replication (SBR - `binlog_format = STATEMENT`):**
  The Primary logs the literal SQL query strings (e.g., `UPDATE users SET last_login = NOW() WHERE active = 1`).
  - *Risk:* Non-deterministic functions (`NOW()`, `UUID()`, `RAND()`, or `LIMIT` without `ORDER BY`) produce different results when replayed on the replica, leading to silent data corruption.
- **Row-Based Replication (RBR - `binlog_format = ROW`):**
  The Primary logs the exact before-and-after binary row images for every modified row.
  - *Advantage:* 100% deterministic and safe. Replicas always match the primary regardless of non-deterministic SQL functions or triggers. This is the modern MySQL default and industry standard.
  - *Trade-off:* Bulk updates modifying 1,000,000 rows generate large binlog files containing 1,000,000 individual row diffs.
- **Mixed Replication (`binlog_format = MIXED`):**
  MySQL uses Statement-Based by default, but automatically switches to Row-Based when it detects non-deterministic statements.

### Coordinates: Log File/Position vs GTID (Global Transaction Identifiers)

- **Legacy Position-Based Replication:** Tracks replication via file names and byte offsets (e.g., `File: mysql-bin.000042, Position: 107432`). If a primary crashes, finding the exact corresponding log offset on a sibling replica requires manual calculation, making automated failover error-prone.
- **GTID-Based Replication (Modern Standard):** Every committed transaction is assigned a globally unique identifier formatted as `UUID:Sequence_Number` (e.g., `3E11FA47-71CA-11E1-9E33-C80AA9E295A4:105`). When a replica connects, it simply sends its `Executed_Gtid_Set` (the list of all transaction IDs it has already run). The Primary automatically determines and streams missing transactions. This makes failover and topology reconfiguration seamless.

### Asynchronous vs Semi-Synchronous Replication

- **Asynchronous Replication (Default):**
  The Primary writes to its local storage engine and binlog, then immediately acknowledges success to the client application without waiting for any replica to receive the data.
  - *Trade-off:* Maximum write throughput and minimal latency. However, if the primary crashes before the binlog events leave its network buffer, those transactions are lost upon failover (Recovery Point Objective > 0).
- **Semi-Synchronous Replication (`rpl_semi_sync_master_enabled`):**
  The Primary commits the transaction locally, but pauses client acknowledgment until at least one semi-sync replica confirms that it has written the transaction to its local Relay Log disk.
  - *Trade-off:* Adds a small network round-trip delay to write transactions, but guarantees zero committed data loss during sudden primary failover.

### High Availability, Failover Automation, and Split-Brain Prevention

When the primary hardware dies, an automated orchestration tool (such as **Orchestrator**, **MHA**, or **MySQL InnoDB Cluster**) executes a four-phase failover protocol:

1. **Failure Detection & Quorum:** Orchestrator probes the primary from multiple network vantage points to confirm the node is truly dead (avoiding false alarms due to transient network blips).
2. **Electing the Best Replica:** It compares the `Executed_Gtid_Set` across all candidate replicas and selects the one with the highest sequence number (the least replication lag).
3. **Applier Drain & Promotion:** The chosen replica finishes applying any remaining events in its Relay Log, disables `super_read_only` and `read_only`, and becomes the new Primary.
4. **Fencing (STONITH) & Traffic Migration:**
   - **Fencing:** The failed primary is strictly fenced off (power cut via IPMI/STONITH or forced into `super_read_only=1`) to prevent **Split-Brain**—a catastrophic state where two instances both accept writes and diverge permanently.
   - **Traffic Migration:** The cluster shifts write traffic to the new primary by repointing a Virtual IP (VIP via Keepalived), updating DNS records with low TTLs, or modifying ProxySQL hostgroup routing rules in memory without restarting application servers.
5. **Re-pointing Siblings:** Remaining replicas are redirected to the new primary using GTID auto-positioning (`CHANGE REPLICATION SOURCE TO SOURCE_AUTO_POSITION = 1`).

## 4. Real Code — See It Working

Here is the exact production setup sequence using modern MySQL 8.0+ syntax with GTID and strict read-only enforcement.

### 1. Primary Configuration (`/etc/mysql/mysql.conf.d/mysqld.cnf`)

```ini
[mysqld]
# Unique server identifier across the entire cluster
server_id               = 101

# Binary logging configuration
log_bin                 = /var/log/mysql/mysql-bin.log
binlog_format           = ROW
binlog_row_image        = FULL
expire_logs_days        = 7
max_binlog_size         = 1G

# GTID settings (Mandatory for safe automated failover)
gtid_mode               = ON
enforce_gtid_consistency = ON

# Crash-safe replication guarantees
sync_binlog             = 1
innodb_flush_log_at_trx_commit = 1
```

### 2. Primary: Create Replication User and Obtain Snapshot

```sql
-- Connect to Primary as root/admin
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'StrongReplPassword123!';
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;

-- Verify GTID status
SHOW MASTER STATUS;
-- Output shows current binlog file, position, and Executed_Gtid_Set:
-- File: mysql-bin.000001, Position: 450, Executed_Gtid_Set: 3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-15
```

Take a consistent snapshot using `mysqldump` (with `--single-transaction` and `--set-gtid-purged=ON` to capture GTID state) or Percona XtraBackup:

```bash
# Take backup on Primary
mysqldump --host=127.0.0.1 -u root -p \
  --single-transaction \
  --triggers \
  --routines \
  --set-gtid-purged=ON \
  --databases production_db > /tmp/backup_with_gtid.sql

# Restore snapshot onto the Replica host
mysql -h 127.0.0.1 -u root -p production_db < /tmp/backup_with_gtid.sql
```

### 3. Replica Configuration (`/etc/mysql/mysql.conf.d/mysqld.cnf`)

```ini
[mysqld]
# Must be unique from Primary and all other replicas
server_id               = 102

# Relay log configuration
relay_log               = /var/log/mysql/mysql-relay-bin.log
log_bin                 = /var/log/mysql/mysql-bin.log
binlog_format           = ROW

# Enable GTID
gtid_mode               = ON
enforce_gtid_consistency = ON

# Multi-threaded parallel applier (accelerates replay to eliminate lag)
replica_parallel_type   = LOGICAL_CLOCK
replica_parallel_workers = 8
replica_preserve_commit_order = ON

# CRITICAL: Prevent direct writes on the replica from any client or admin
read_only               = 1
super_read_only         = 1
```

### 4. Replica: Connect to Source and Start Replication

```sql
-- Connect to Replica as root
-- Modern MySQL 8.0+ syntax (replaces older CHANGE MASTER TO)
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST = '10.0.1.10',
  SOURCE_PORT = 3306,
  SOURCE_USER = 'repl_user',
  SOURCE_PASSWORD = 'StrongReplPassword123!',
  SOURCE_AUTO_POSITION = 1,
  SOURCE_SSL = 1;

-- Start the background I/O and SQL threads
START REPLICA;
```

### 5. Verifying Health and Lag Status

```sql
-- Inspect replica thread health
SHOW REPLICA STATUS\G

-- Key fields to inspect in output:
-- *************************** 1. row ***************************
--              Replica_IO_State: Waiting for source to send event
--                   Source_Host: 10.0.1.10
--                   Source_User: repl_user
--              Source_Port: 3306
--             Replica_IO_Running: Yes
--            Replica_SQL_Running: Yes
--        Seconds_Behind_Source: 0
--               Last_IO_Errno: 0
--               Last_IO_Error: 
--              Last_SQL_Errno: 0
--              Last_SQL_Error: 
--         Retrieved_Gtid_Set: 3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-250
--          Executed_Gtid_Set: 3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-250
```

### 6. Emergency Manual Promotion (When Primary Fails)

```sql
-- On the chosen Replica (Server ID 102):
-- 1. Stop replication threads
STOP REPLICA;

-- 2. Reset replication coordinates so it acts as an independent source
RESET REPLICA ALL;

-- 3. Open the database for client writes
SET GLOBAL super_read_only = 0;
SET GLOBAL read_only = 0;

-- 4. Now point your application write connection pool or ProxySQL to this node's IP
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is replication lag, what causes it, and how do you mitigate it?**

Replication lag is the time delay between a transaction committing on the Primary and that same transaction becoming visible on the Replica (`Seconds_Behind_Source > 0`).

*Causes:*
1. **Concurrency Mismatch:** The Primary handles hundreds of concurrent client write connections using multiple CPU cores, but historically the Replica SQL thread replayed transactions serially in a single thread.
2. **Long-Running Queries/Transactions:** If a single query takes 60 seconds on the Primary (like a large batch `UPDATE` or unindexed table scan), the single-threaded replica applier blocks for 60 seconds replaying that one event, causing all subsequent transactions to queue up.
3. **Heavy DDL Migrations:** Running `ALTER TABLE` locks tables or monopolizes I/O on the replica.
4. **Missing Indexes on Replica:** If a table has an index on the primary but not on the replica, row-based replication will execute a full table scan for every updated row during replay.

*Mitigations:*
- Enable Multi-Threaded Replication in MySQL 8: `replica_parallel_type = LOGICAL_CLOCK` and `replica_parallel_workers = 8`.
- Chunk large batch operations into small transactions (e.g., deleting 1,000,000 rows in batches of 2,000 with short pauses).
- Use tools like `pt-online-schema-change` or `gh-ost` for zero-downtime schema changes.
- Ensure all tables have explicit Primary Keys.

---

**Q: What is the "Read-Your-Own-Writes" consistency problem, and how do you solve it in application architecture?**

Because replication is asynchronous, there is always a non-zero propagation delay (even a few milliseconds). If a user updates their profile name to "Alice" on the primary and is immediately redirected to a profile view page served by a replica, the replica might not have applied that transaction yet. The user sees their old name "Bob", assumes the save failed, and submits the form again.

*Solutions:*
1. **Read-After-Write Routing Pinning:** After any write request, set a temporary session flag or timestamp in the user's cookie/JWT (e.g., `last_write_timestamp = NOW()`). Route all reads for that specific user to the Primary for the next 3–5 seconds, while other users continue reading from replicas.
2. **GTID Causal Consistency (Session Track GTIDs):** When the primary commits, it returns the committed GTID in the response header. Before executing a read, the application or database proxy checks if the chosen replica's `Executed_Gtid_Set` includes that GTID using `SELECT WAIT_FOR_EXECUTED_GTID_SET('...', 2.0)`. If not caught up within the timeout, the proxy routes the read to the primary.
3. **Direct Primary Pinning for Critical Paths:** Sensitive pages (checkout balances, authentication tokens, password resets) are hardwired to read directly from the Primary.

---

**Q: Why should you always set `super_read_only = 1` instead of just `read_only = 1` on a replica?**

Setting `read_only = 1` blocks write operations from standard database users, but **it allows users with the `SUPER` or `SYSTEM_VARIABLES_ADMIN` privilege to execute writes**.

In production, DBAs, automated maintenance scripts, or application connection pools connecting as `root` or an admin user can still accidentally run `INSERT`, `UPDATE`, or `DELETE` on the replica. This causes the replica's local data to drift from the primary. When the primary later tries to update or insert that same row, the replica's SQL applier thread encounters a key conflict error (e.g., Error 1062 `Duplicate entry`) and halts replication entirely.

`super_read_only = 1` strictly forbids writes from everyone—including users with `SUPER` privileges. The only threads allowed to write are the internal replication applier threads.

---

**Q: What is a Split-Brain scenario during failover, and how is it prevented?**

A Split-Brain occurs when a network partition temporarily isolates the Primary from the cluster. The monitoring orchestrator assumes the primary is dead and promotes a replica to become the new primary. However, the old primary is still alive and reachable by some application servers.

Now two independent databases believe they are the authoritative Primary. Application writes hit both nodes, generating conflicting Auto-Increment IDs and divergent data sets. Re-merging divergent relational databases after a split-brain is one of the most painful manual operations in engineering.

*Prevention Strategies:*
1. **Strict Fencing (STONITH):** "Shoot The Other Node In The Head." The orchestration system cuts the old primary's power via IPMI/PDU or shuts down its network interface before promoting a replica.
2. **Automated Read-Only Enactment:** If the old primary detects it has lost quorum with its orchestrator or network gateway, it automatically sets `super_read_only = 1`.
3. **Dynamic Proxy Routing:** Applications never connect directly to database IP addresses; they connect through ProxySQL or HAProxy. The orchestrator updates the proxy configuration atomically so traffic only ever reaches the designated active primary.

---

**Q: How does GTID auto-positioning simplify replica recovery compared to binlog coordinates?**

In legacy binlog replication, if you wanted to repoint Replica B to a new Primary (Replica A), you had to inspect Replica B's relay log, map the corresponding byte position in Replica A's binary log file, and manually issue `CHANGE MASTER TO MASTER_LOG_FILE='...', MASTER_LOG_POS=...`. A single miscalculation meant lost or duplicate transactions.

With GTID auto-positioning (`SOURCE_AUTO_POSITION = 1`), every transaction has a globally unique ID (e.g., `UUID:101`). When Replica B connects to the new Primary, it sends its range of executed GTIDs (`UUID:1-95`). The new Primary checks its own binlog, sees it has `UUID:1-120`, and automatically streams transactions `96` through `120`. No manual log file or byte offset calculations are required.

## 6. The Traps — What Goes Wrong

### 1. Accidental Writes on Replicas Breaking Replication
- **The Mistake:** Relying on application discipline instead of database engine enforcement (`read_only = 0` left on replica).
- **What Happens:** A developer connects to a replica to debug an issue and updates a row directly. Days later, the primary executes an `UPDATE` on that same row and logs the change. The replica's SQL applier thread encounters a row mismatch and crashes with `HA_ERR_KEY_NOT_FOUND` (Error 1032). Replication stops cold.
- **The Fix:** Always configure `read_only = 1` and `super_read_only = 1` in the replica's `my.cnf`.

### 2. Giant Batch Transactions Stalling the Entire Cluster
- **The Mistake:** Running `DELETE FROM audit_logs WHERE created_at < '2025-01-01'` (affecting 5,000,000 rows) in a single statement.
- **What Happens:** On the Primary, the transaction holds locks for 45 seconds. On the Replica, the SQL worker cannot commit any intermediate progress; it must replay all 5,000,000 row modifications inside one atomic transaction. During this entire time, replication lag spikes to hundreds of seconds, and any reads touching that table on the replica hang waiting for metadata locks.
- **The Fix:** Always process mass deletions or updates in small transactional batches:
  ```sql
  -- Safe batch deletion pattern
  REPEAT
    DELETE FROM audit_logs WHERE created_at < '2025-01-01' LIMIT 2000;
    DO SLEEP(0.05); -- Yield I/O to allow replication applier to keep pace
  UNTIL ROW_COUNT() = 0
  END REPEAT;
  ```

### 3. DNS Caching Preventing Failover
- **The Mistake:** Using DNS hostnames (e.g., `db-primary.internal`) for application database connections with default JVM or Node.js DNS configurations.
- **What Happens:** When the primary crashes and failover updates the DNS A-record to point to the new primary, application instances continue sending writes to the dead IP address for 30 minutes because their runtime environment cached the DNS resolution indefinitely (`networkaddress.cache.ttl = -1`).
- **The Fix:** Use database-aware connection proxies (ProxySQL) or configure your application runtime with a 1-second DNS TTL.

### 4. Overloading Replicas with Heavy Analytics Queries
- **The Mistake:** Treating replicas as free dump sites for unindexed 10-minute BI reports while simultaneously routing user-facing web traffic to them.
- **What Happens:** The heavy analytical query consumes 100% of the replica's CPU and disk bandwidth. The replica's SQL applier thread starves for I/O, causing `Seconds_Behind_Source` to escalate. The application starts serving stale data to regular users.
- **The Fix:** Dedicate a specific "Reporting Replica" outside the production web read pool, and monitor replication lag alerts on all user-facing replicas.

## 7. Compare With Related Concepts

### Primary-Replica vs Master-Master (Multi-Primary) Replication
- **Primary-Replica:** Exactly one node accepts writes (`read_only=0`), while all other nodes are strictly read-only copies. There are zero write conflicts, locking is straightforward, and failover is clear.
- **Master-Master:** Two or more nodes accept concurrent writes and replicate bidirectionally. If clients update the same row simultaneously on both masters, write conflicts occur, requiring complex auto-increment offsets (`auto_increment_increment`) and conflict resolution algorithms.
- **Rule of Thumb:** Use Primary-Replica for 99% of web workloads. Only reach for Multi-Primary (such as MySQL Group Replication or Galera Cluster) when high-availability multi-datacenter active-active write capability is an explicit business requirement.

### Primary-Replica vs Database Sharding (Horizontal Partitioning)
- **Primary-Replica:** Replicates the *entire dataset* to multiple nodes. It scales **read throughput** and provides high availability, but **does not scale write throughput or disk storage capacity** (every node still holds 100% of the data).
- **Sharding:** Splits the dataset into distinct subsets (shards) across multiple independent database clusters (e.g., User IDs 1–1,000,000 on Shard 1; 1,000,001–2,000,000 on Shard 2). It scales both write throughput and total storage volume.
- **Rule of Thumb:** Always scale vertically and add read replicas first. Only introduce sharding when write IOPS or dataset size exceeds what a single large primary server can physically handle.

### Asynchronous vs Semi-Synchronous vs Fully Synchronous (Galera / Group Replication)
- **Asynchronous:** Primary commits without waiting. Fastest performance, but risk of small data loss on sudden primary crash (RPO > 0).
- **Semi-Synchronous:** Primary waits until at least one replica writes the transaction to its Relay Log. Balances high performance with zero committed data loss.
- **Fully Synchronous:** Primary waits until a quorum of nodes applies the transaction before committing. Highest consistency guarantee, but write latency is constrained by the slowest node.

## 8. 🧠 The Memory Hook

One King writes the laws; many Scribes distribute the copies. Keep the scribes strictly read-only (`super_read_only=1`), stream the diary (`Binlog` to `Relay Log`), and when the King falls, crown the scribe with the most complete diary—never let two kings rule at once.

