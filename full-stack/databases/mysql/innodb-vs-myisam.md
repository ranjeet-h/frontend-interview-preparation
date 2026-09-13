# InnoDB vs MyISAM

## 1. The Real-World Problem — When You Actually Hit This

Your app has been live for a few months on MySQL. The `orders` table uses MyISAM because someone said it is faster for reads. Traffic is still low, so everything feels fine.

Then a sale hits. Two users place orders at the same second. One user updates their address. An admin runs a report that scans the table. Suddenly every request that touches `orders` hangs for seconds. The page spinner just sits there. What happened? One write locked the entire table. Every other read and write had to wait in line behind it.

It gets worse. The server crashes mid-update — power cut, OOM kill, whatever. You restart MySQL and the `orders` table is marked as crashed. Some rows from the half-finished update are there, some are not. Customers are charged but their orders are missing. There is no undo. MyISAM has no transaction log to replay, so you run `REPAIR TABLE` and hope you do not lose more.

This is exactly why MySQL switched defaults. You need an engine that lets many people write different rows at the same time, groups related changes so they either all happen or none do, and can recover cleanly after a crash without corrupting the table. InnoDB does that. MyISAM does not.

## 2. The Analogy — Make the Mechanic Obvious

Think of your table as a big filing room full of lockers. Each row is one locker.

MyISAM gives you one key for the whole room. If anyone wants to open any locker — even just to change one file in locker 42 — they have to lock the entire room, walk in, do their work, and unlock the door on the way out. Everyone else waits outside, even if they wanted a completely different locker. Readers also need the room. If one person is reading, a writer waits. If one person is writing, every reader waits. One slow job blocks everyone.

InnoDB gives you a key for each locker. If you want locker 42, you lock only locker 42. Someone else can open locker 43 at the same time with no conflict. That is row-level locking.

InnoDB also adds three things the room was missing:

First, a receipt book for grouped work. You can say "I am going to move money from account A to account B — both lockers must change together or neither changes." You do the work, then stamp it committed. If anything fails halfway, you tear up the receipt and both lockers go back to how they were. That is a transaction with ACID guarantees.

Second, a photocopier. When you start reading, InnoDB hands you a snapshot copy taken at that moment. Writers can keep changing the real lockers while you read your copy, so readers never block writers and writers never block readers. That is MVCC.

Third, a fireproof journal by the door. Before InnoDB changes a locker, it writes "I am about to change locker 42 from X to Y" in the journal and makes sure that journal hits disk. If the power dies mid-change, on restart InnoDB replays the journal and finishes or undoes the work so the room is never half-baked. That is the redo log and crash recovery. MyISAM has no journal — if it crashes mid-write, the room is left messy.

One more detail: the building manager enforces rules like "every package in the delivery locker must have a matching customer locker." InnoDB enforces that — those are foreign keys. MyISAM lets you write the rule on the door but never checks it.

## 3. The Full Explanation — How It Actually Works

Start with plain facts, then the names.

MyISAM is old and simple. It locks the whole table for any write. A `UPDATE`, `INSERT`, or `DELETE` takes an exclusive table lock. While that lock is held, no other session can read or write that table — they queue. Even a `SELECT` takes a shared table lock that blocks writers. Under concurrent writes, this becomes a bottleneck fast. There are no transactions, so you cannot group statements. There is no rollback. There is no write-ahead log, so a crash can leave the `.MYD` and `.MYI` files corrupt. There are no foreign keys — MySQL parses the `FOREIGN KEY` clause for MyISAM but silently ignores it. There is no MVCC. Historically MyISAM had two small speed edges: it stored the exact row count for `COUNT(*) WITHOUT WHERE` so that one query was instant, and it had full-text indexes before InnoDB did. Neither matters now.

InnoDB is the modern engine and the default since MySQL 5.5. In MySQL 8.0, even the system tables are InnoDB. It is built for real concurrent apps.

Row-level locking is the first big difference. InnoDB locks only the rows you touch, not the whole table. Two transactions can update different rows at the same time with no waiting. Under the hood it uses row locks plus gap locks and next-key locks to prevent phantom rows in certain isolation levels, but the key idea is simple: the lock scope is tiny, so concurrency is high. Table locks still exist for DDL like `ALTER TABLE`, but normal DML does not block the whole table.

ACID transactions are the second. You wrap related statements in `BEGIN` / `COMMIT`. Atomic means all statements in the group succeed or none do. Consistent means the database moves from one valid state to another. Isolated means concurrent transactions do not see each other's half-done work. Durable means once you get `COMMIT OK`, the data survives a crash. If you call `ROLLBACK` or the server dies before commit, InnoDB undoes everything using its undo log.

MVCC is how InnoDB gives you isolation without blocking. Each row keeps hidden version pointers. When you start a transaction (in the default `REPEATABLE READ` isolation), you see a snapshot of the database as of your start time. Other transactions can keep writing new versions of rows, but you keep seeing your snapshot until you commit. Readers do not block writers. Writers do not block readers. MyISAM has no versions — readers wait for writers and writers wait for readers.

Crash recovery is the third. InnoDB is a write-ahead log engine. Before it changes a data page in the buffer pool, it writes the change to the redo log on disk and ensures it is flushed at commit. It also keeps an undo log to roll back uncommitted changes and a doublewrite buffer to protect against half-written pages. On restart after a crash, InnoDB automatically replays the redo log to redo committed changes that had not yet reached the data files, and rolls back anything uncommitted. You get a consistent database without manual repair. MyISAM just flushes to its files directly — a crash mid-write can corrupt the table and you must run `REPAIR TABLE` or restore from backup.

Foreign keys are enforced only in InnoDB. You can declare `FOREIGN KEY (customer_id) REFERENCES customers(id)` and InnoDB will reject inserts that point nowhere, and can cascade deletes or updates. In MyISAM the same `CREATE TABLE` succeeds but the constraint does nothing, which silently breaks data integrity.

A few practical details interviewers expect you to know: InnoDB tables are clustered by primary key — the primary key defines the physical order of rows, so choose it intentionally and keep it small. InnoDB caches data and indexes in the buffer pool in memory. InnoDB supports `SELECT ... FOR UPDATE` and `SELECT ... LOCK IN SHARE MODE` to take explicit row locks. MyISAM does not.

When to use which? Almost always InnoDB. The only semi-reason for MyISAM today is a legacy read-only archive you inherited and never write to, and even there InnoDB is usually still better because it is crash-safe. MySQL itself has moved on — do not pick MyISAM for a new table because you heard it is faster. Under any real write load it is much slower due to table locking, and it risks data loss.

## 4. See It In Practice — Real Code or Queries

These examples are MySQL dialect. Run them in MySQL 8.0.

Check which engines your server supports and what your tables use:

```sql
-- What engines are available and which is default
SHOW ENGINES;

-- How a table was created
SHOW CREATE TABLE orders\G

-- Create the same table with each engine
CREATE TABLE orders_innodb (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  INDEX idx_customer (customer_id),
  CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB;

CREATE TABLE orders_myisam (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  INDEX idx_customer (customer_id)
  -- This FOREIGN KEY is parsed but silently ignored for MyISAM
) ENGINE=MyISAM;
```

Transactions work in InnoDB and do nothing useful in MyISAM:

```sql
-- InnoDB: either both updates happen or neither does
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
-- If the second update fails, you can undo the first
COMMIT;  -- or ROLLBACK if something went wrong

-- MyISAM: each statement commits immediately, ROLLBACK does nothing
-- If the server crashes after the first UPDATE, the money is gone
BEGIN;
UPDATE accounts_myisam SET balance = balance - 100 WHERE id = 1;
UPDATE accounts_myisam SET balance = balance + 100 WHERE id = 2;
ROLLBACK; -- MyISAM ignores this — first update is already permanent
```

Row-level locking lets concurrent writes succeed in InnoDB:

```sql
-- Session A: lock one row for update (InnoDB locks only that row)
BEGIN;
SELECT * FROM orders_innodb WHERE id = 42 FOR UPDATE;
-- Session B can still update a different row at the same time
-- This would block in MyISAM because the whole table is locked
-- Session B:
UPDATE orders_innodb SET status = 'shipped' WHERE id = 43; -- succeeds immediately in InnoDB

-- In MyISAM, any write blocks everything
UPDATE orders_myisam SET status = 'shipped' WHERE id = 43;
-- While this runs, even SELECT * FROM orders_myisam WHERE id = 99 waits
```

Foreign keys are enforced in InnoDB, ignored in MyISAM:

```sql
-- InnoDB rejects an order for a customer that does not exist
INSERT INTO orders_innodb (customer_id, amount, status) VALUES (99999, 50.00, 'new');
-- ERROR 1452: Cannot add or update a child row: a foreign key constraint fails

-- MyISAM accepts it without error — your data is now inconsistent
INSERT INTO orders_myisam (customer_id, amount, status) VALUES (99999, 50.00, 'new');
-- Query OK — no error, but customer 99999 does not exist
```

Crash behavior is not a query you run, but you can see the mechanism:

```sql
-- InnoDB has a redo log and doublewrite buffer — visible in status
SHOW ENGINE INNODB STATUS\G
-- Look for "Log sequence number" and "Pages flushed"

-- MyISAM after a crash may need manual repair
CHECK TABLE orders_myisam;
REPAIR TABLE orders_myisam; -- you should never need this with InnoDB
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is the main difference between InnoDB and MyISAM?**

MyISAM locks the whole table for writes, has no transactions, no crash recovery, and no foreign keys. InnoDB locks only the rows it touches, supports full ACID transactions, recovers cleanly after a crash using its redo log, and enforces foreign keys. In plain terms, MyISAM is a single-key room where one person blocks everyone; InnoDB is per-locker keys with receipts, snapshots, and a journal. Since MySQL 5.5 InnoDB has been the default, and in MySQL 8.0 it is the only engine for system tables. For any new table that handles concurrent writes or needs correctness, you pick InnoDB.

**Q: How does locking work in each engine and why does it matter?**

InnoDB uses row-level locking. When you update row 42, only row 42 is locked, so another transaction can update row 43 at the same time. It also uses gap and next-key locks to prevent new rows from appearing in a range you are reading, which matters for preventing phantom reads at `REPEATABLE READ`. MyISAM uses table-level locking. Any `INSERT`, `UPDATE`, or `DELETE` takes an exclusive lock on the whole table, and even `SELECT` takes a shared lock that blocks writers. Under concurrent writes, MyISAM serializes everything — throughput collapses and latency spikes. This is why a MyISAM queue or counter table freezes your app under load.

**Q: What is MVCC and how does InnoDB use it?**

MVCC stands for Multi-Version Concurrency Control. Instead of blocking readers while writers work, InnoDB keeps multiple versions of each row. When your transaction starts, you see a snapshot of the database as of that moment. Other transactions can create newer versions of rows, but you keep seeing your snapshot until you commit. That is why readers never block writers and writers never block readers in InnoDB. MyISAM has no MVCC — it has only the one current copy of each row, so it must block. InnoDB's default isolation level is `REPEATABLE READ`, which uses MVCC to give each transaction a stable view; `READ COMMITTED` gives a fresh snapshot per statement.

**Q: How does crash recovery differ?**

InnoDB is a write-ahead log engine. Before it modifies a data page in memory, it writes the change to the redo log on disk. At commit it ensures the redo entry is durable. It also keeps an undo log to roll back uncommitted work and a doublewrite buffer to avoid half-written pages. After a crash, InnoDB replays the redo log to restore committed changes and undoes anything uncommitted — no manual step needed. MyISAM writes directly to its `.MYD`/`.MYI` files with no log. A crash mid-write can leave the table corrupt with half-written rows. You have to run `CHECK TABLE` and `REPAIR TABLE` and you may still lose data because there is no log to replay.

**Q: Do MyISAM tables support transactions and foreign keys?**

No. MyISAM has no transactions. `BEGIN`, `COMMIT`, and `ROLLBACK` are accepted by the parser but have no effect — each statement auto-commits. You cannot atomically update two rows. Foreign keys are also not enforced. MySQL will let you write `FOREIGN KEY` in a `CREATE TABLE ... ENGINE=MyISAM` statement without error, but it silently ignores the constraint. You can insert child rows that point to nonexistent parents and MySQL will not complain. Only InnoDB actually enforces foreign keys and supports `ON DELETE CASCADE` / `ON UPDATE` actions.

**Q: Why was MyISAM once considered faster, and is that still true?**

Two historical reasons. First, MyISAM has no transaction or MVCC overhead, so a single-threaded bulk read could be slightly faster. Second, `COUNT(*) WITHOUT WHERE` was instant on MyISAM because it stored the row count in metadata, while InnoDB had to scan. Both edges are gone in practice. Under any concurrent write load, InnoDB is dramatically faster because row locks do not serialize the whole table. `COUNT(*) WITHOUT WHERE` is a narrow case — any `WHERE` clause makes both engines scan, and InnoDB's buffer pool, clustered primary key, and better caching usually win. InnoDB also got full-text indexes in MySQL 5.6, removing MyISAM's last feature advantage. The speed myth now hurts you: picking MyISAM for speed makes your app slower and less safe.

**Q: Which engine should I choose for a new table?**

InnoDB, always, unless you are stuck with a legacy read-only dump you cannot convert. It is the default since 5.5, it is crash-safe, it handles concurrency, and it enforces integrity. MyISAM is effectively obsolete. If you need a fast in-memory table for ephemeral data, the `MEMORY` engine or Redis is the right comparison, not MyISAM. If you see `ENGINE=MyISAM` in a dump or tutorial, change it to InnoDB unless you have a very specific reason not to.

**Q: What happens if the server crashes in the middle of a transaction?**

In InnoDB, if the crash happens before `COMMIT`, the transaction is rolled back using the undo log on restart — the database is as if the transaction never started. If the crash happens after `COMMIT` but before dirty pages are flushed to the data files, the redo log replays the committed changes — nothing is lost. In MyISAM, there is no transaction boundary. Whatever statements already flushed to disk stay, whatever was mid-write may be half-written and corrupt. You get a partially applied update with no way to roll it back cleanly.

## 6. The Traps — What Goes Wrong in Production

Picking MyISAM because it is "faster for reads" is the classic trap. It comes from old blog posts that benchmarked a single thread doing `SELECT COUNT(*)` on a quiet table. Real production has concurrent writes. The moment you have two writes at the same time, MyISAM locks the whole table and your p99 latency explodes. InnoDB handles the same load with row locks and MVCC and stays flat. If you need read speed, add the right index and size the InnoDB buffer pool — do not switch to MyISAM.

Thinking your foreign keys protect you when the table is MyISAM. MySQL does not error when you declare a foreign key on a MyISAM table — it just ignores it. You deploy, tests pass because they run on InnoDB locally, and in production MyISAM silently lets orphan rows in. Check `SHOW CREATE TABLE` in production and make sure every table that needs referential integrity is `ENGINE=InnoDB`.

Assuming `ROLLBACK` will save you on MyISAM. It will not. Each statement auto-commits. If you write a transfer that debits one account and credits another and the second statement fails, the debit is already permanent. With InnoDB you wrap both in a transaction and roll back; with MyISAM you have to write manual compensation logic and you still risk a crash between statements.

Using MyISAM for a queue, counter, or session table with lots of writes. These tables get hit on every request. Table-level locking turns them into a global bottleneck. A simple `UPDATE counters SET value = value + 1 WHERE id = ?` blocks every other counter update in MyISAM, but only that one row in InnoDB. If you inherited a MyISAM hot table, convert it: `ALTER TABLE counters ENGINE=InnoDB;`.

Mixing engines in the same transaction or across a foreign key. You cannot have a transaction that atomically updates an InnoDB table and a MyISAM table — the MyISAM part cannot roll back, so your transaction is no longer atomic. You also cannot create a foreign key between an InnoDB table and a MyISAM table. Keep all tables in a service on InnoDB.

Forgetting to check the engine when importing a dump. Old dumps often contain `ENGINE=MyISAM` from before 5.5. If you import without checking, you silently create MyISAM tables and lose crash safety and transactions. Always search the dump for `MyISAM` or set `default_storage_engine=InnoDB` and review `SHOW TABLE STATUS WHERE Engine = 'MyISAM'`.

## 7. Compare With Related Concepts

InnoDB vs MyISAM is the direct comparison. InnoDB gives you row locks, ACID, MVCC, redo log recovery, and foreign keys. MyISAM gives you table locks and none of the rest. The one-line rule is simple: if the table will ever be written to concurrently, needs transactions, or must survive a crash cleanly, use InnoDB — which is almost every table.

InnoDB vs MEMORY engine: MEMORY keeps all data in RAM, is very fast for ephemeral lookups, but loses everything on restart and also uses table-level locking. Use MEMORY only for small temporary data you can rebuild, like a scratch cache. For anything you need to keep, InnoDB with a warm buffer pool is both safe and fast.

MyISAM vs Aria: Aria is MariaDB's crash-safe replacement for MyISAM with better recovery, but it is not MySQL's InnoDB. If you are on MySQL, the comparison that matters is still InnoDB vs MyISAM, and InnoDB wins. On MariaDB, Aria is still not a substitute for InnoDB's transactions and row locking for OLTP.

Engine choice vs indexing: people sometimes blame InnoDB for being slow when the real problem is a missing index. Both engines need the right index. The engine decides locking and safety; the index decides how fast a query finds rows. Fix the index first, then confirm the engine is InnoDB.

## 8. 🧠 The Memory Hook

MyISAM locks the whole library to change one book and keeps no journal, so a crash leaves torn pages. InnoDB locks only the book you touch, hands readers a snapshot copy so nobody waits, writes every change to a fireproof journal before touching the shelf, and makes sure every reference points to a real book — and that is why it has been the default since MySQL 5.5 and the only real choice in MySQL 8.0.
