# What Is AUTO_INCREMENT

## 1. The Real-World Problem — When You Actually Hit This

Your app has been running fine for months. Users sign up, you insert a row into `users`, everything works. Then you launch a marketing campaign and two people sign up at the exact same millisecond.

Your code does what felt obvious in development: `SELECT MAX(id) + 1` to pick the next id, then `INSERT` with that id. In production those two requests both read `MAX(id) = 1042`, both try to insert `1043`, and one of them crashes with `Duplicate entry '1043' for key 'PRIMARY'`. The user sees a 500. You retry, now it says duplicate again, and you are stuck.

So you think, fine, let the database handle it. You add `AUTO_INCREMENT`. It works. Six months later a different failure appears: an admin deletes a few test users and expects the next real user to fill the gap, but the id jumps from 1045 to 1049 instead. Or worse, your `orders` table was defined as `INT` and after 2.1 billion rows every new insert suddenly fails with `Failed to read auto-increment value from storage engine` — you have hit integer overflow and the table is effectively write-locked in production. Inserts that worked for years now all fail.

That is why `AUTO_INCREMENT` exists and why understanding its guarantees matters. It is not just "auto numbering." It is MySQL's answer to "how do we give every row a unique id safely under concurrency, restarts, rollbacks, and without the app ever guessing."

## 2. The Analogy — Make the Mechanic Obvious

Think of the ticket dispenser at a deli counter.

There is one red dispenser bolted to the wall. You pull the lever, it gives you the next number, then it clicks forward and never goes back. If someone takes ticket 42 and then walks out without ordering, ticket 42 is gone — the next person still gets 43. The shop does not rewind and hand out 42 again. If the power goes out and comes back on, the dispenser remembers where it was — it does not start back at 1 and hand out duplicates. And there is only one dispenser per counter. You cannot bolt two dispensers to the same wall and expect them to agree on whose turn it is.

MySQL's `AUTO_INCREMENT` works exactly the same way:

- The dispenser is the `AUTO_INCREMENT` counter, one per table, no more.
- It has to be mounted on something solid — that is the index requirement. MySQL will not let you create an `AUTO_INCREMENT` column unless it is the first column of an index, usually the `PRIMARY KEY`, so it can find the max quickly and enforce uniqueness.
- Pulling the lever is an `INSERT` without a value for that column. MySQL gives you `next_value` atomically, even if 100 inserts happen at once.
- A rolled-back transaction or a deleted row is the customer who walked out. The number is burned. There will be a gap.
- Since MySQL 8.0 the dispenser writes its current number to disk (in the redo log). Before 8.0 it only kept it in memory and recalculated `MAX(id)+1` after a restart, which could silently reuse numbers if you had deleted the highest rows.
- `ALTER TABLE ... AUTO_INCREMENT = N` is you trying to turn the dial by hand. You can turn it forward, but if you try to turn it backward past the highest ticket already handed out, MySQL just ignores you.

Once you see the dispenser, the rules stop feeling random.

## 3. The Full Explanation — How It Actually Works

In plain words, `AUTO_INCREMENT` means "if I don't give you an id, you give me the next one, and you promise it will be unique and bigger than any you gave before." You declare it on an integer column and MySQL owns the numbering after that.

Here is the full mechanic.

There can only be one `AUTO_INCREMENT` column per table, and it must be indexed. It has to be an integer type — `TINYINT`, `SMALLINT`, `MEDIUMINT`, `INT`, or `BIGINT` — and it is almost always `NOT NULL` and the `PRIMARY KEY`. MySQL enforces the "must be indexed" rule because it needs to check uniqueness fast and to know the current maximum without scanning the whole table. If you try to add a second `AUTO_INCREMENT` column, MySQL rejects it.

When you insert, if you pass `NULL`, `0` (unless `NO_AUTO_VALUE_ON_ZERO` is set), or just omit the column, MySQL atomically reserves the next value and uses it. If you pass an explicit value, MySQL uses that value instead and then moves the counter forward if that value was larger than the current counter. That is how migrations that import old ids work without breaking future inserts.

Under the hood for InnoDB, the counter is protected by a lock or mutex so two concurrent inserts never get the same number. The `innodb_autoinc_lock_mode` setting controls how aggressive that lock is for bulk inserts, but for normal single-row inserts you can think of it as "one at a time at the dispenser." Crucially, the number is handed out *before* the transaction commits. If that transaction later rolls back, the number is not returned to the pool. That is why gaps are normal and expected. Deletes also do not cause reuse. `DELETE FROM users WHERE id = 5` leaves a hole at 5 forever. Only `TRUNCATE` or an explicit `ALTER TABLE ... AUTO_INCREMENT` forward jump changes the next value in a way that could fill low numbers, and even then only if those numbers were never used.

Persistence across restarts changed in MySQL 8.0. Before 8.0, InnoDB kept the counter only in memory. On every restart it recalculated `MAX(id) + 1`. If you had deleted the row with the highest id, a restart would silently move the counter backward and the next insert could reuse an old id that might still be referenced elsewhere. Since 8.0, InnoDB persists the counter to the redo log on every change. Restarts keep the monotonic guarantee — the counter never goes backward on its own. This is a common interview detail: "Is AUTO_INCREMENT persistent?" The correct answer is "yes since 8.0, no before 8.0."

The type you choose determines when you run out of numbers. An `INT SIGNED` goes from -2147483648 to 2147483647 — but `AUTO_INCREMENT` only uses the positive side, so you effectively get about 2.1 billion values. `INT UNSIGNED` doubles that to about 4.2 billion because it uses 0 to 4294967295. `BIGINT` gives you 9 quintillion signed, `BIGINT UNSIGNED` gives about 18 quintillion. Running out does not wrap around — inserts just start failing with a duplicate-key or auto-increment read error. That is why for almost any table that could grow for years — users, orders, events, logs — the default senior choice is `BIGINT UNSIGNED`. The cost is 8 bytes versus 4 bytes per row, which is nothing compared to a production outage from overflow.

Resetting is explicit and one-directional. `ALTER TABLE users AUTO_INCREMENT = 100;` says "the next insert should be 100 if nothing larger already exists." If the current max id is 500, that statement does nothing — MySQL keeps the next value at 501. You can only move the counter forward, never backward past the max. `TRUNCATE TABLE users` both deletes all rows and resets the counter to 1. `DELETE FROM users` without a where clause deletes rows but does not reset the counter.

Other interactions worth knowing: `LAST_INSERT_ID()` returns the id generated for *your* connection's last insert, not the global max. That is what makes it safe under concurrency — you will never get another user's id. And `SELECT MAX(id)` is never a substitute for either `AUTO_INCREMENT` or `LAST_INSERT_ID()`.

## 4. See It In Practice — Real Code or Queries

```sql
-- 1. The normal, production-safe definition
-- One AUTO_INCREMENT per table, must be indexed, BIGINT UNSIGNED avoids overflow
CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email)
) ENGINE=InnoDB;

-- 2. Let MySQL pick the id (the 99% case)
INSERT INTO users (email) VALUES ('a@example.com'); -- id = 1
INSERT INTO users (email) VALUES ('b@example.com'); -- id = 2

-- Omitting the column, passing NULL, or DEFAULT all do the same thing
INSERT INTO users (id, email) VALUES (NULL, 'c@example.com'); -- id = 3
INSERT INTO users (email) VALUES ('d@example.com'); -- id = 4

-- 3. Get back the id you just created — connection-safe, no race
INSERT INTO users (email) VALUES ('e@example.com'); -- gets 5
SELECT LAST_INSERT_ID(); -- returns 5 on YOUR connection, not someone else's
-- In application code you use the driver's equivalent:
-- Node mysql2: result.insertId
-- Python: cursor.lastrowid

-- 4. Gaps are normal: rollbacks burn numbers
START TRANSACTION;
INSERT INTO users (email) VALUES ('temp@example.com'); -- reserves 6
ROLLBACK; -- row never appears, but 6 is burned forever

INSERT INTO users (email) VALUES ('f@example.com'); -- gets 7, gap at 6

-- Same with failed inserts
INSERT IGNORE INTO users (email) VALUES ('a@example.com'); -- duplicate email, fails
-- MySQL already reserved 8 before checking the unique constraint, so 8 is burned
INSERT INTO users (email) VALUES ('g@example.com'); -- gets 9, gap at 8

-- 5. Deletes do not fill gaps, and resetting backward is ignored
DELETE FROM users WHERE id = 9; -- gap remains

-- Try to rewind the counter — MySQL silently ignores it because MAX(id) is 7
ALTER TABLE users AUTO_INCREMENT = 2;
INSERT INTO users (email) VALUES ('h@example.com'); -- still gets 10, not 2

-- Moving it forward does work
ALTER TABLE users AUTO_INCREMENT = 100;
INSERT INTO users (email) VALUES ('i@example.com'); -- gets 100

-- 6. Check the next value without guessing from MAX(id)
SELECT AUTO_INCREMENT
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users';
-- Shows 101 (the next value, not the max)

-- 7. TRUNCATE vs DELETE — very different for the counter
TRUNCATE TABLE users; -- deletes all rows AND resets AUTO_INCREMENT to 1
-- DELETE FROM users; -- would delete rows but keep AUTO_INCREMENT at 101

-- 8. Explicit id moves the counter forward automatically
INSERT INTO users (id, email) VALUES (500, 'migrated@example.com'); -- force id 500
INSERT INTO users (email) VALUES ('j@example.com'); -- gets 501, not 101
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is AUTO_INCREMENT and why not just use MAX(id) + 1 in the app?**

`AUTO_INCREMENT` is a table property that tells MySQL to generate a unique, monotonically increasing integer for a column when you insert without providing one. You use it because `MAX(id)+1` in the app has a race condition — two concurrent transactions can read the same MAX and try to insert the same id, causing a duplicate-key error. `AUTO_INCREMENT` reserves numbers atomically inside the engine so even with thousands of concurrent inserts every row gets a unique id without the app coordinating.

**Q: Can a table have two AUTO_INCREMENT columns?**

No. MySQL allows exactly one `AUTO_INCREMENT` column per table, and it must be the first column of an index, typically the primary key. If you try to define a second one MySQL throws an error. If you need multiple independent sequences, you need separate tables or an external sequence/UUID approach.

**Q: Why must an AUTO_INCREMENT column be indexed?**

Because MySQL needs to enforce uniqueness and find the current maximum efficiently, and to locate the counter's state. The index (usually `PRIMARY KEY`) guarantees that every generated value is unique and lets InnoDB check and update the counter without scanning the whole table. Without an index there would be no efficient way to guarantee "no duplicates" under concurrency.

**Q: Why does AUTO_INCREMENT have gaps? Will DELETE or ROLLBACK reuse numbers?**

Gaps are by design. MySQL hands out the number early, before the transaction commits. If the transaction rolls back, the row never appears but the number is already burned. The same happens with `INSERT IGNORE` or a duplicate-key failure — the number is reserved before the uniqueness check fails. `DELETE` also never reuses numbers; it just removes the row and leaves a hole. Only `TRUNCATE` resets the counter, and `ALTER TABLE ... AUTO_INCREMENT = N` can only move it forward. If you need gapless numbers for invoices or legal sequences, do not use `AUTO_INCREMENT` — build a separate gapless counter with explicit locking.

**Q: What happens to AUTO_INCREMENT after a MySQL restart?**

Since MySQL 8.0, InnoDB persists the counter to the redo log so it survives restarts and keeps going forward. Before 8.0 it was held only in memory and recalculated as `MAX(id)+1` on restart, so if you had deleted the highest id, the next insert after a restart could reuse that id and cause duplicates or foreign-key confusion. This is a favorite follow-up: the correct nuance is "persistent since 8.0, not before."

**Q: INT vs BIGINT vs UNSIGNED — what should I pick?**

`INT SIGNED` gives ~2.1B positive values. `INT UNSIGNED` doubles to ~4.2B. `BIGINT SIGNED` gives ~9 quintillion, `BIGINT UNSIGNED` ~18 quintillion. When the counter exceeds the type's max, every further insert fails — MySQL does not wrap. The storage difference is 4 bytes vs 8 bytes per row, trivial compared to an outage. Rule: if a table could ever grow beyond a few million or must live for years, use `BIGINT UNSIGNED`. For small lookup tables like `countries` you can use `INT`, but the safe default for `users`, `orders`, `events` is `BIGINT UNSIGNED`.

**Q: How do you reset or change the next AUTO_INCREMENT value?**

Use `ALTER TABLE users AUTO_INCREMENT = 100;`. It sets the next value only if it is larger than the current max id + 1. If you set it lower than the max, MySQL ignores it and keeps `MAX+1`. To reset to 1 you either `TRUNCATE TABLE users` (which also deletes all data) or delete all rows and then alter with a value that is genuinely larger than the new max. There is no way to make it automatically fill old gaps.

**Q: How do you safely get the id you just inserted in a concurrent app?**

Do not use `SELECT MAX(id)`. Use `LAST_INSERT_ID()` in SQL or the driver's `insertId` / `lastrowid` property. It is per-connection, so even if 1000 other inserts happen between your `INSERT` and your `SELECT LAST_INSERT_ID()`, you still get your own id. `MAX(id)` gives you the global max, which might be someone else's row.

## 6. The Traps — What Goes Wrong in Production

**Expecting gapless, sequential ids.** The most common mistake is treating `AUTO_INCREMENT` as a business sequence. You build invoice numbers, queue positions, or display ordering on the assumption that ids will be 1, 2, 3 with no gaps, and then a rolled-back transaction or a failed `INSERT IGNORE` leaves a hole and your accounting or UI logic breaks or you get support tickets about "missing order 1043." The fix is to accept gaps for primary keys and build a separate gapless sequence — usually a dedicated counter table with `SELECT ... FOR UPDATE` — only where the business truly needs gapless numbers.

**Resetting the counter to a lower number thinking it will reuse ids.** You delete some rows, run `ALTER TABLE users AUTO_INCREMENT = 1` expecting the next insert to be 1 again, and nothing changes — MySQL silently keeps `MAX+1`. Or you run it with a value between existing ids and get duplicates later. Remember: you can only move the dial forward, and MySQL will correct you if you try to move it backward.

**Using MAX(id)+1 in application code.** It looks harmless in local testing with one user. Under load it produces duplicate-key errors and requires retry logic that is itself racy. The trap is "it worked in development so it must be safe." Use `AUTO_INCREMENT` and `LAST_INSERT_ID()` instead, or a sequence/UUID if you need distributed generation.

**Choosing INT for a table that will outgrow it.** A team picks `INT` for `events` because "we will never have 2 billion events," then three years later the nightly batch job starts failing at 2:00 AM with auto-increment errors and no writes are possible until you do a painful `ALTER TABLE ... MODIFY id BIGINT` that rewrites the whole table. The price of `BIGINT UNSIGNED` from day one is 4 extra bytes per row; the price of guessing wrong is an outage.

**Assuming DELETE and TRUNCATE are the same.** `DELETE FROM users` keeps the counter where it was, `TRUNCATE TABLE users` resets it to 1. In tests this difference causes flaky id assertions. In production, a cleanup `DELETE` that you expected to reset ids will not, and your integration that hard-coded `id = 1` for an admin user will break.

**Inserting 0 expecting it to be stored as 0.** By default MySQL treats `0` as "give me the next auto value," just like `NULL`. So `INSERT INTO users (id, email) VALUES (0, 'x')` does not store 0, it stores the next counter value. This surprises people migrating data with legitimate 0 ids. The behavior changes only if you enable `NO_AUTO_VALUE_ON_ZERO`.

**Relying on AUTO_INCREMENT order as business order without ORDER BY.** People assume rows come back in insert order because ids are increasing. Without an explicit `ORDER BY id`, MySQL is free to return rows in any order, especially after deletes, replication, or index changes. Always add `ORDER BY`.

## 7. Compare With Related Concepts

**AUTO_INCREMENT vs SEQUENCE (MySQL vs Postgres style).** `AUTO_INCREMENT` is glued to one table and one column — you cannot share it, you cannot call `NEXTVAL` without inserting, and you cannot easily reserve a batch of ids ahead of time. A `SEQUENCE` (native in Postgres and Oracle, emulated in MySQL via a helper table) is an independent object. You can do `SELECT nextval('order_seq')` to get an id before you insert, you can share one sequence across multiple tables, and you can set increment and caching options separately from any table. Rule: if you need a simple per-table surrogate key and you are on MySQL, `AUTO_INCREMENT` is perfect. If you need a shared counter, pre-allocation, or gap-controlled numbering across tables or services, reach for a sequence or an explicit counter table.

**AUTO_INCREMENT vs UUID / ULID.** An auto-increment id is small (4 or 8 bytes), sequential, index-friendly, and reveals rough insertion order and table size — which is good for debugging but bad if you expose it in URLs and do not want users guessing ` /users/1044` after `1043`. A UUID (UUIDv4 random or UUIDv7 time-ordered) is 128-bit, globally unique without any coordination, so two services can generate ids offline without talking to MySQL at all. The trade-off is size (16 bytes binary, 36 characters as text), random index fragmentation with v4 which hurts InnoDB write performance, and no natural ordering unless you use UUIDv7 or ULID. Rule: use `AUTO_INCREMENT BIGINT UNSIGNED` for internal primary keys where performance and compactness matter and a single MySQL instance owns the writes. Use UUIDv7/ULID when you need distributed generation across many services, need unguessable ids in public URLs, or do writes in disconnected environments.

**AUTO_INCREMENT vs Snowflake IDs (Twitter-style).** Snowflake gives you 64-bit time-ordered, roughly sequential ids generated in the app layer with machine-id bits, needing no database round trip and staying sortable by time. `AUTO_INCREMENT` needs a database call and is the bottleneck if you shard. If you are sharding MySQL or need time-sortable ids at massive write scale, Snowflake/ULID wins. For a single primary MySQL table, `AUTO_INCREMENT` is simpler and faster.

## 8. 🧠 The Memory Hook

`AUTO_INCREMENT` is a one-per-table ticket dispenser that only clicks forward, never backward, burns a ticket if you walk away, and since MySQL 8.0 remembers its number even after the power goes out — so never expect it to be gapless and never let it run out of numbers by picking a too-small type.
