# MySQL Replication: Architecture, Replication Types, GTID, and Replication Lag

## 1. Why This Exists — The Problem First

A single MySQL instance running on powerful hardware can easily handle thousands of requests per second. But the moment your application scales, a single database server becomes both a hard compute bottleneck and a single point of failure.

Picture this production disaster: You run an e-commerce platform with a single database instance handling all reads and writes. During a Black Friday flash sale, millions of concurrent shoppers browse the catalog, search inventory, and read reviews. Database CPU spikes to 100%, disk I/O saturates, and read queries crawl to a 10-second response time. Crucial checkout transactions time out because write locks are waiting in the same overwhelmed engine queue. The entire business goes down simply because read traffic starved critical write traffic.

Now picture the second failure mode: You introduce a read-only replica to distribute read traffic. A customer navigates to their profile, updates their delivery address, clicks "Save", and is immediately redirected to the order confirmation page. The update went to the primary database, but the confirmation page reads from a replica that is lagging by just 800 milliseconds. The confirmation screen displays their old address. The user panics, updates it a second time, triggers duplicate billing charges, or cancels the order.

Finally, imagine the primary database host suffers an unexpected hardware power loss. You need to promote a replica to become the new primary immediately. If your replica was using traditional binary log coordinate offsets (`binlog-000042`, position `1048576`) without global transaction tracking, identifying which replica is freshest and re-pointing sibling replicas requires manual, error-prone offset math under extreme incident pressure. One wrong coordinate leads to primary key collisions, missing data, and silent split-brain corruption.

MySQL replication exists to solve two fundamental requirements: horizontal read scalability (distributing read query load across multiple nodes) and high availability/disaster recovery (keeping warm copies ready for immediate failover). Understanding how data flows from the primary's binary log into the replica's storage engine—and how to handle replication modes, GTID tracking, and replication lag—is the difference between a resilient distributed system and catastrophic data loss.

## 2. The Analogy — Make It Obvious

Think of MySQL replication like a Head Architect and a team of Regional Construction Offices.

The Head Architect at headquarters (the Primary database) is the only person authorized to make design decisions, approve blueprints, and stamp new building permits (writes, updates, deletes). Every time the Head Architect approves a change, they write the exact modification into a permanent master ledger called the Binary Log.

Next to the Head Architect stands the Headquarters Courier (the Binlog Dump Thread). The courier's only job is to watch the master ledger. Whenever a new blueprint page is signed, the courier broadcasts a copy over a dedicated radio frequency to all registered regional offices.

At each regional office sits a two-person team:

The Regional Receiver (the I/O Receiver Thread): This person sits by the radio receiver all day. The moment a blueprint broadcast comes in from headquarters, the receiver writes it down immediately onto a local clipboard called the Relay Log. The receiver does not construct anything or interpret the blueprints; their sole responsibility is to grab incoming transmissions as fast as the network allows and write them to local disk.

The Regional Builder (the SQL Applier Thread): This person picks up blueprint pages from the clipboard (Relay Log) one by one, interprets the architectural instructions, and performs the actual physical construction on the local building (the Replica Storage Engine).

Why decouple this into two separate roles and a clipboard? If the regional office had only one worker who had to listen to the radio and lay bricks simultaneously, a complex bricklaying task would cause them to miss incoming radio broadcasts. Or a momentary radio disruption would stall construction. By having the Receiver dump everything to the Relay Log clipboard first at network speed, the Builder can work through the tasks systematically at local engine speed.

The Replication Modes in this analogy:
- Asynchronous Replication: The Head Architect approves the blueprint, files it in headquarters, and immediately tells the client "Construction started!", without waiting to see if regional offices even received the radio message. If headquarters burns down a millisecond later, regional offices may never receive that blueprint.
- Semi-Synchronous Replication: The Head Architect approves the blueprint, broadcasts it, and pauses until at least one regional receiver confirms: "Received and written to our clipboard!" Only then does the Head Architect tell the client "Success!"
- Group Replication: A council of architects across multiple cities uses a formal voting protocol (Paxos) to agree on every single blueprint before any office writes it to disk.

## 3. How It Actually Works — The Full Explanation

MySQL replication is a master-to-replica (or source-to-replica) mechanism where data modification events recorded on a primary server are streamed over a network connection, buffered locally on one or more replicas, and executed against their local storage engines.

The architecture relies on three primary threads coordinating across two physical database engines:

1. Binlog Dump Thread (Primary): When a replica connects, the primary spawns a dedicated dump thread for that replica. This thread acquires a read lock on the primary's binary log in memory/disk, reads new transaction events as they are committed, and pushes them sequentially over the TCP socket to the replica.
2. I/O (Receiver) Thread (Replica): Initiates the TCP connection to the primary, authenticates, and requests events starting from a specific log coordinate or GTID set. As raw binary log events arrive over the network, this thread writes them sequentially to the replica's local Relay Log files and updates the replica's receiver state.
3. SQL (Applier) Thread (Replica): Reads events sequentially from the Relay Log, parses the transaction operations, and executes them against the replica's local storage engine (InnoDB). Once an event is applied, it advances the applier position and purges old relay log files that have been fully executed.

Binary Log (Binlog) Formats dictate how changes are recorded and applied:

1. Statement-Based Replication (SBR / `binlog_format=STATEMENT`): The primary logs the exact SQL statements executed by the client (e.g., `UPDATE orders SET status = 'shipped' WHERE created_at < '2026-01-01'`). While it keeps log files compact, non-deterministic queries lead to silent data drift. Functions like `NOW()`, `UUID()`, `RAND()`, or `UPDATE ... LIMIT 1` without an explicit `ORDER BY` produce different results when re-executed on the replica, causing primary and replica tables to hold conflicting values without any error.
2. Row-Based Replication (RBR / `binlog_format=ROW`): The primary logs the exact binary diff of each modified row (before-image and after-image) rather than the query text. This is 100% deterministic and safe against non-deterministic SQL functions. Although bulk updates generate larger binary log files, RBR prevents data drift and is the standard default in MySQL 8.0+.
3. Mixed-Based Replication (MBR / `binlog_format=MIXED`): Uses Statement-Based logging by default for compactness, but automatically switches to Row-Based logging whenever an unsafe, non-deterministic statement, trigger, stored procedure, or temporary table is detected.

Replication Modes dictate data durability and latency:

1. Asynchronous Replication (Default): The primary executes and commits transactions locally, writes to the binary log, and immediately returns success to the client without waiting for any replica. This offers the highest write throughput and lowest write latency, but risks data loss (RPO > 0) if the primary crashes before the dump thread transmits committed events.
2. Semi-Synchronous Replication (`rpl_semi_sync_master_enabled` / `rpl_semi_sync_source_enabled`): The primary writes the transaction to its binary log, sends it to the replica, and pauses client response until at least one replica's I/O thread acknowledges writing the event to its local relay log (`AFTER_SYNC`). This guarantees zero data loss on primary crash at the cost of one network round-trip time (RTT) added to write latency. If replicas fail to respond within `rpl_semi_sync_master_timeout`, it temporarily falls back to async mode to avoid freezing client applications.
3. Group Replication (MySQL InnoDB Cluster): Built on Paxos consensus, all nodes participate in distributed transaction certification. Transactions are validated across a majority of nodes before committing, providing automated high availability, multi-node conflict detection, and automated failover.

Global Transaction Identifiers (GTID):

In legacy MySQL replication, replicas tracked progress by binary log file name and byte offset (`mysql-bin.000004`, position `482910`). Failover required manual offset calculation and coordinate tracking across all nodes.

GTID replaces manual file coordinates with a globally unique identifier assigned to every committed transaction: `source_uuid:transaction_sequence_number` (e.g., `3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-1045`).

With GTID and auto-positioning (`SOURCE_AUTO_POSITION = 1`), failover is seamless. Replicas track their executed transaction sets in `gtid_executed`. When connecting to a new primary, the replica sends its executed set, and the new primary automatically computes the delta and streams only the missing transactions.

Replication Lag: Root Causes and Architectural Mitigations:

Replication lag is the delay between a transaction committing on the primary and that transaction taking effect on a replica (`Seconds_Behind_Source`).

Common causes of lag include:
- Single-Threaded SQL Applier: The primary handles writes across dozens of concurrent client threads, but a traditional replica replays them through a single sequential SQL thread.
- Monolithic Transactions: A single transaction modifying 500,000 rows blocks the replica's applier thread for minutes, stalling all subsequent transactions.
- Long-running analytical queries or unindexed reads on the replica acquiring metadata locks or row locks that block the SQL applier.
- Disk I/O saturation on the replica.

Mitigation strategies include:
- Multi-Threaded Applier / Parallel Replication: Configure `replica_parallel_workers = 16` and `replica_parallel_type = LOGICAL_CLOCK` with `replica_preserve_commit_order = ON`. This allows transactions committed concurrently in the same binary log group commit on the primary to replay in parallel on the replica.
- Batching Write Operations: Break massive updates or deletes into chunks of 1,000 to 5,000 rows in application code.
- Dedicated Reporting Nodes: Isolate reporting workloads from operational read replicas to a dedicated analytics instance or an OLAP store via Change Data Capture (Debezium/Kafka).
- Read-Your-Own-Writes Application Routing: Temporarily route read queries for a specific user to the primary for a few seconds following a write (session stickiness), or use GTID waiting (`WAIT_FOR_EXECUTED_GTID_SET()`) to guarantee fresh data.

## 4. Real Code — See It Working

**Example 1: Configuring Primary and Replica for GTID and Row-Based Replication**

Primary server configuration (`/etc/my.cnf` on Primary):
```ini
[mysqld]
# Unique server ID across the entire replication topology
server-id = 1

# Enable binary logging (default in MySQL 8.0)
log-bin = mysql-bin

# Enforce row-based replication for deterministic safety
binlog_format = ROW

# Enable GTID mode and enforce consistency
gtid_mode = ON
enforce_gtid_consistency = ON

# Ensure binlog and InnoDB redo log are synced on every commit
sync_binlog = 1
innodb_flush_log_at_trx_commit = 1
```

Replica server configuration (`/etc/my.cnf` on Replica):
```ini
[mysqld]
# Unique server ID distinct from primary and all other replicas
server-id = 2

# Enable relay logging for replica buffering
relay-log = mysql-relay-bin

# Enforce read-only mode so normal application users cannot write directly to replica
read_only = ON
super_read_only = ON

# Enable GTID mode (must match primary)
gtid_mode = ON
enforce_gtid_consistency = ON

# Multi-Threaded Parallel Replication settings to eliminate lag
replica_parallel_workers = 8
replica_parallel_type = LOGICAL_CLOCK
replica_preserve_commit_order = ON

# Enable crash-safe replication info repositories in InnoDB tables
master_info_repository = TABLE
relay_log_info_repository = TABLE
relay_log_recovery = ON
```

**Example 2: Creating the Replication User and Starting Replication**

On the Primary database, create a dedicated replication account:
```sql
-- Create a dedicated replication user restricted to the replica subnet
CREATE USER 'repl_user'@'10.0.1.%' IDENTIFIED BY 'StrongReplicationPassword123!';

-- Grant REPLICATION SLAVE privilege (needed for binlog streaming)
GRANT REPLICATION SLAVE ON *.* TO 'repl_user'@'10.0.1.%';
FLUSH PRIVILEGES;
```

On the Replica database, configure the replication channel with GTID auto-positioning and start the threads:
```sql
-- Configure connection parameters to the primary (MySQL 8.0 syntax)
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST = '10.0.1.10',
  SOURCE_PORT = 3306,
  SOURCE_USER = 'repl_user',
  SOURCE_PASSWORD = 'StrongReplicationPassword123!',
  SOURCE_AUTO_POSITION = 1,
  SOURCE_SSL = 1;

-- Start both the I/O receiver thread and the SQL applier thread
START REPLICA;

-- Note: For MySQL 5.7, use CHANGE MASTER TO and START SLAVE instead
```

**Example 3: Enabling Semi-Synchronous Replication**

On the Primary database:
```sql
-- Install the semi-sync source plugin
INSTALL PLUGIN rpl_semi_sync_source SONAME 'semisync_source.so';

-- Enable semi-synchronous replication on the primary
SET GLOBAL rpl_semi_sync_source_enabled = 1;

-- Set timeout (in ms) before falling back to async if replica is unresponsive
SET GLOBAL rpl_semi_sync_source_timeout = 5000;

-- Wait after syncing to relay log before committing locally (guarantees zero data loss)
SET GLOBAL rpl_semi_sync_source_wait_point = AFTER_SYNC;
```

On the Replica database:
```sql
-- Install the semi-sync replica plugin
INSTALL PLUGIN rpl_semi_sync_replica SONAME 'semisync_replica.so';

-- Enable semi-synchronous acknowledgment on the replica
SET GLOBAL rpl_semi_sync_replica_enabled = 1;

-- Restart replication threads to apply the plugin
STOP REPLICA;
START REPLICA;
```

**Example 4: Inspecting and Diagnosing Replication Health**

Run this command on the replica to inspect real-time thread health, GTID positions, and lag:
```sql
SHOW REPLICA STATUS\G
```

Key output fields to monitor:
```txt
*************************** 1. row ***************************
             Replica_IO_State: Waiting for source to send event
                  Source_Host: 10.0.1.10
                  Source_User: repl_user
                  Source_Port: 3306
                Connect_Retry: 60
              Source_Log_File: mysql-bin.000005
          Read_Source_Log_Pos: 140582
               Relay_Log_File: mysql-relay-bin.000008
                Relay_Log_Pos: 48291
        Relay_Source_Log_File: mysql-bin.000005
           Replica_IO_Running: Yes          <-- I/O receiver thread is healthy
          Replica_SQL_Running: Yes          <-- SQL applier thread is healthy
        Seconds_Behind_Source: 0            <-- Replication lag in seconds
                Last_IO_Error:              <-- Check if network/auth failed
               Last_SQL_Error:              <-- Check if duplicate key / DDL broke applier
           Retrieved_Gtid_Set: 3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-500
            Executed_Gtid_Set: 3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-500
                Auto_Position: 1
```

**Example 5: Application-Level Read-Your-Own-Writes with GTID Waiting**

When a user writes to the primary, grab the executed GTID and ensure the replica has applied it before querying:
```sql
-- Step 1 (On Primary): Perform user profile update and retrieve the generated GTID
UPDATE users SET address = '742 Evergreen Terrace' WHERE id = 42;
SELECT @@GLOBAL.gtid_executed; 
-- Returns: '3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1052'

-- Step 2 (On Replica): Before executing read query, wait up to 1 second for GTID to replicate
-- Returns 0 if GTID was already executed or reached within timeout, 1 if timeout exceeded
SELECT WAIT_FOR_EXECUTED_GTID_SET('3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1052', 1.0);

-- Step 3 (On Replica): Safe to read fresh user profile without seeing stale data
SELECT id, name, address FROM users WHERE id = 42;
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are the three core threads involved in MySQL replication and what exact roles do they play?**

MySQL replication coordinates three distinct threads across the primary and replica instances:
1. The Binlog Dump Thread runs on the primary server. When a replica connects, the dump thread reads data modification events from the primary's binary log and transmits them across the network socket to the replica.
2. The I/O (Receiver) Thread runs on the replica server. It connects to the primary, receives the continuous stream of binary log events over TCP, and immediately writes them sequentially to the local disk in the Relay Log. It does not parse or execute the data changes.
3. The SQL (Applier) Thread runs on the replica server. It reads events from the local Relay Log, parses the transactions, and executes the actual SQL statements or row changes against the replica's local storage engine (InnoDB).

This two-thread design on the replica completely decouples network reception from local execution. If the SQL applier slows down due to heavy table updates, the I/O thread can continue buffering incoming network events into the relay log without stalling the primary's dump thread or losing network position.

**Q: What is the difference between Statement-Based, Row-Based, and Mixed Replication, and why is Row-Based the modern standard?**

Statement-Based Replication (SBR) records the raw SQL text executed on the primary (`binlog_format=STATEMENT`). While SBR produces small log files, it suffers from non-deterministic behavior: queries containing `NOW()`, `UUID()`, `RAND()`, or `UPDATE ... LIMIT 1` without an explicit `ORDER BY` evaluate differently on the primary and replica, resulting in silent data drift where primary and replica tables hold conflicting values without any error being raised.

Row-Based Replication (RBR) records the exact before-and-after binary images of individual rows modified by each transaction (`binlog_format=ROW`). Because RBR logs the raw byte changes rather than the query logic, it is 100% deterministic and completely immune to non-deterministic functions, trigger side-effects, or execution order variances. While mass updates generate larger binary log files under RBR, modern disk speeds and network bandwidth make deterministic correctness vastly more important than log compression.

Mixed-Based Replication (MBR) defaults to Statement-Based logging for compactness but automatically switches to Row-Based logging on a per-statement basis whenever MySQL detects non-deterministic functions, stored procedures, or temporary tables. Row-Based replication remains the default and industry best practice in MySQL 8.0+.

**Q: How does GTID (Global Transaction Identifier) work, and why did it replace binlog file and offset coordinates?**

In legacy MySQL replication, a replica tracked its position using a file name and byte position (e.g., `File: mysql-bin.000004, Position: 452810`). If the primary crashed, an operator had to inspect every replica's log coordinates, manually identify the most advanced replica, calculate the offset differences, and re-point sibling replicas using manual `CHANGE MASTER TO` commands.

GTID assigns a globally unique, immutable identifier to every transaction committed in the replication topology, formatted as `source_uuid:transaction_sequence_number` (e.g., `3E11FA47-71CA-11E1-9E33-C80AA9E295A4:45`).

When GTID is enabled with auto-positioning (`SOURCE_AUTO_POSITION = 1`), failover becomes fully automated:
1. Replicas record every transaction they have executed in their internal `gtid_executed` set.
2. When connecting to a new primary, the replica sends its `gtid_executed` set.
3. The new primary computes the set difference (`Primary_GTID_Set - Replica_GTID_Set`) and automatically streams only the missing transactions.
4. Sibling replicas can be pointed to newly promoted primaries without any manual coordinate calculation, eliminating human error during disaster recovery.

**Q: What is the difference between Asynchronous, Semi-Synchronous, and Group Replication regarding latency, RPO, and RTO?**

- Asynchronous Replication: The primary commits transactions to its local engine and returns success to the client without waiting for any replica to receive the data. Latency overhead is zero, but Recovery Point Objective (RPO) is greater than zero: if the primary hardware crashes, unstreamed transactions are permanently lost. Recovery Time Objective (RTO) depends on manual or external orchestrator (Orchestrator, ProxySQL) failover time.
- Semi-Synchronous Replication: The primary writes the transaction to its binary log, sends it to the replica, and pauses client response until at least one replica's I/O thread acknowledges writing the event to its local relay log (`AFTER_SYNC`). This guarantees RPO = 0 (zero data loss on primary crash) at the cost of one network round-trip time (RTT) added to write latency. If replicas become unresponsive, it falls back to async after a configured timeout to prevent system outages.
- Group Replication (InnoDB Cluster): Synchronous multi-node consensus using Paxos. Every transaction is certifiably agreed upon by a majority of nodes before committing. Provides RPO = 0, automatic node failure detection, and automatic primary election with RTO measured in single-digit seconds, but requires at least 3 nodes and higher cross-node network bandwidth.

**Q: What causes replication lag in production, and how do you systematically diagnose and resolve it?**

Replication lag occurs when the replica cannot apply incoming changes as fast as the primary produces them.

Common Causes:
1. Single-Threaded SQL Applier: The primary processes writes across 32 concurrent client threads, while the replica replays them through a single sequential SQL thread.
2. Monolithic Transactions: A single transaction updating 500,000 rows blocks the replica's applier thread for minutes, preventing all subsequent transactions from executing.
3. Long-running analytical queries or unindexed reads on the replica acquiring metadata locks or row locks that block the applier thread.
4. Storage I/O bottleneck on the replica.

Resolution Strategy:
1. Enable Multi-Threaded Workers: Set `replica_parallel_workers = N` (e.g., matching CPU core count) and `replica_parallel_type = LOGICAL_CLOCK` with `replica_preserve_commit_order = ON`. This allows transactions committed in the same binary log group commit on the primary to replay in parallel on the replica.
2. Break large writes into small batches (`LIMIT 1000`) in application code.
3. Route heavy reporting and analytics away from operational read replicas to a dedicated reporting node or an OLAP data warehouse via Debezium/Kafka.
4. Ensure replica hardware (especially NVMe storage and I/O IOPS) matches or exceeds primary hardware.

**Q: How do you solve the "Read-Your-Own-Writes" consistency problem when using read replicas in a web application?**

When a user writes data to the primary database and immediately reads it back, routing the read to an asynchronous replica can show stale data due to replication lag.

There are three primary architectural solutions:
1. Session-Based Primary Pinning (Time-Window Routing): When a user performs a write operation (e.g., `POST /api/user/profile`), the application server sets a short-lived token or cookie in the user's session (e.g., `pinned_to_primary_until = timestamp + 3000ms`). For the next 3 seconds, all read requests from that specific user session are routed to the primary database. All other read requests continue going to replicas.
2. GTID-Based Replica Synchronization: The primary returns the committed GTID in the write response header. When the client performs a subsequent read against a replica pool, the application proxy runs `SELECT WAIT_FOR_EXECUTED_GTID_SET(gtid, timeout)` on the chosen replica before serving the query, ensuring the replica has caught up to that specific transaction.
3. Critical Read Routing: Business-critical endpoints (checkout verification, password updates, billing state) are explicitly hardcoded to read only from the primary database, while non-critical reads (product catalog, public user profiles, search results) are routed to replicas.

**Q: What is Crash-Safe Replication and how does it prevent replica corruption upon an abrupt reboot?**

In legacy MySQL, the replica tracked its replication progress (Relay Log position and Master Binlog position) in flat text files on disk (`master.info` and `relay-log.info`). Because flat file writes are not atomic with InnoDB transaction commits, an unexpected operating system crash or power outage could result in the InnoDB table committing a transaction while the info file had not yet updated its pointer—or vice versa. Upon reboot, the replica would attempt to re-execute already committed transactions, throwing duplicate key errors (`HA_ERR_FOUND_DUPP_KEY`) and halting replication.

Crash-safe replication fixes this by setting `master_info_repository = TABLE` and `relay_log_info_repository = TABLE`. In MySQL 8.0, replication coordinates are stored inside transactional InnoDB tables (`mysql.slave_master_info` and `mysql.slave_relay_log_info`). When the SQL applier applies a transaction, the coordinate update is committed in the exact same atomic ACID transaction as the data change. Furthermore, setting `relay_log_recovery = ON` instructs the replica upon restart to automatically discard any unapplied relay logs and fetch fresh copies from the primary using the last atomically committed position.

## 6. The Traps — What Goes Wrong

**Trap 1: Trusting `Seconds_Behind_Master` as a Guaranteed Real-Time Metric**

The `Seconds_Behind_Master` (or `Seconds_Behind_Source`) metric displayed in `SHOW REPLICA STATUS` does not measure network round-trip latency. It simply calculates the difference between the timestamp recorded in the binary log header when the transaction was originally created on the primary and the current clock timestamp on the replica when the SQL applier executes it.

Why this is a trap:
- If the I/O receiver thread loses network connectivity to the primary, no new events arrive in the relay log. Because the SQL applier has finished executing everything in the relay log, `Seconds_Behind_Master` displays `0`! An on-call engineer looking only at this metric believes replication is perfectly caught up, when in reality replication is completely broken and disconnected.
- If server clocks between primary and replica drift (NTP misconfiguration), `Seconds_Behind_Master` can report negative numbers or artificially inflated lag.
- Always monitor both `Replica_IO_Running = Yes` and `Replica_SQL_Running = Yes`, and use heartbeat tools like `pt-heartbeat` (which writes active timestamp rows to a dedicated table on the primary every second) to measure true end-to-end replication latency.

**Trap 2: Allowing Direct Writes on a Replica (`read_only` vs `super_read_only`)**

A developer logs into a read replica to fix a minor data typo or run a local script, unaware that their user account has `SUPER` privileges. Because standard MySQL `read_only = ON` allows users with `SUPER` or `SYSTEM_VARIABLES_ADMIN` privileges to bypass read-only constraints, the write succeeds on the replica.

Later, when the primary executes an update on that same row, the replica's SQL applier attempts to apply the primary's change. It encounters unexpected data, conflicts with foreign keys, or throws a duplicate primary key error (`Error 1062`), crashing the SQL applier thread (`Replica_SQL_Running = No`).

The Fix: Always enable `super_read_only = ON` on all replicas. This blocks even users with `SUPER` privileges from executing direct write queries, guaranteeing that only replication threads can modify replica data.

**Trap 3: Monolithic DDL Statements and Mass Deletes**

Executing an unindexed `ALTER TABLE` or a massive `DELETE FROM audit_logs WHERE created_at < '2025-01-01'` (deleting 5 million rows in one statement) on the primary will commit on the primary, but on the replica:
- Under Row-Based Replication, 5 million individual row deletion events arrive in the relay log. The replica's SQL thread must process all 5 million events in a single massive transaction block, locking the table on the replica and causing replication lag to climb into hours.
- While the replica is processing this monster transaction, no other application transactions can be applied.
- The Fix: Use online schema change tools (`gh-ost` or `pt-online-schema-change`) for DDL, and batch all massive deletes into chunks of 1,000 to 5,000 rows in a loop.

**Trap 4: Non-Deterministic Statements under Statement-Based Replication**

If you use `binlog_format = STATEMENT` and execute:
```sql
UPDATE users SET last_login = NOW(), verification_token = UUID() WHERE status = 'pending' LIMIT 10;
```
On the primary, 10 arbitrary rows are updated, and `NOW()` and `UUID()` evaluate to specific values. On the replica, the SQL statement is re-executed. Because there is no `ORDER BY`, the replica updates a completely different set of 10 rows, and generates brand-new `UUID()` tokens. The primary and replica now have divergent data, but `SHOW REPLICA STATUS` shows 0 errors and 0 seconds lag. You only discover the corruption when a customer attempts to log in and authentication fails.

The Fix: Always set `binlog_format = ROW`.

**Trap 5: Failing Over with Semi-Sync Timeouts Silently Falling Back to Async**

You configure Semi-Synchronous replication to achieve zero data loss. However, during a brief 10-second network switch hiccup, the primary fails to receive ACKs from replicas within `rpl_semi_sync_master_timeout = 5000` (5 seconds).

MySQL silently degrades semi-sync replication to asynchronous replication to keep client writes flowing. If the primary database hardware crashes 10 minutes later while still running in degraded async mode, committed transactions will be lost during failover.

The Fix: Set up automated Prometheus/Alertmanager monitoring on the metric `Rpl_semi_sync_source_status`. If it transitions from `ON` to `OFF`, alert on-call engineering immediately.

## 7. Compare With Related Concepts

**MySQL Replication vs Database Sharding**

- The Difference: MySQL Replication copies the exact same complete dataset to multiple nodes (1 primary, N replicas) to scale read capacity and provide high availability. Database Sharding splits different partitions of data across different independent database nodes (e.g., Users 1–1,000,000 on Node A, Users 1,000,001–2,000,000 on Node B) to scale write throughput and storage capacity beyond a single server's limits.
- The Rule: Use Replication when your bottleneck is read query volume or failover resilience. Use Sharding only when your write volume, connection count, or dataset size exceeds what a single primary node can physically write to disk.

**Asynchronous vs Semi-Synchronous vs Group Replication**

- The Difference: Asynchronous replication prioritizes write speed and returns immediately, risking data loss on primary failure (RPO > 0). Semi-Synchronous replication guarantees at least one replica has buffered the transaction to disk before client confirmation, providing zero data loss (RPO = 0) with a 1 RTT write penalty. Group Replication uses active Paxos consensus across 3+ nodes, providing automated fault tolerance and multi-node certification.
- The Rule: Use Asynchronous for non-critical, high-throughput read scaling. Use Semi-Synchronous as the standard enterprise production configuration for high-availability pairs. Use Group Replication (InnoDB Cluster) when you require automated zero-downtime failover without third-party management agents.

**Logical Binlog Replication vs Physical Storage Replication (AWS Aurora / Shared Disk)**

- The Difference: Traditional MySQL replication is logical: the primary logs SQL statements or row diffs, and the replica re-executes them against its own independent CPU and storage engine. AWS Aurora uses physical storage replication: a single distributed storage fleet stores 6 copies of data blocks across 3 availability zones; read replicas share the exact same underlying storage layer and only replicate in-memory buffer pool state.
- The Rule: Use Logical Binlog Replication when running on standard Linux VMs, on-premises bare metal, cross-region replication, or cross-cloud synchronization. Use Physical/Aurora Shared Storage when operating fully managed on AWS to eliminate replica SQL applier lag and storage duplication.

**Read Replicas vs Read-Through Caching (Redis / Memcached)**

- The Difference: Read replicas scale relational SQL queries that require joins, aggregations, and transactional ACID properties across secondary database instances. Caching stores pre-computed key-value objects or serialized JSON strings in memory (RAM) to bypass the database entirely.
- The Rule: Use Redis Caching for hot, repetitive, sub-millisecond key lookups. Use Read Replicas for dynamic, complex, or relational SQL queries that cannot be easily cached or structured as simple key-value lookups.

## 8. 🧠 The Memory Hook

**Primary writes to Binlog -> Dump Thread streams over the wire -> I/O Receiver buffers to Relay Log -> SQL Applier lays the bricks.**

*GTID gives every transaction a permanent passport number so replicas never lose their place during failover, and `LOGICAL_CLOCK` parallel workers keep the builder fast enough to prevent replication lag.*
