# What Is Optimistic Locking

## 1. The Real-World Problem — When You Actually Hit This

Your support app has been running fine for months. Then one day a customer complains that the promised follow-up never happened. You dig into ticket #4821 and find this story in the audit log:

Priya opened the ticket at 2:14 PM and spent twenty minutes writing careful root-cause notes. At 2:16 PM, Dan opened the same ticket, saw nothing new (Priya hadn't saved yet), marked it resolved, and hit save. At 2:34 PM, Priya hit save on her notes. The app ran `UPDATE tickets SET notes = ?, status = ? WHERE id = 4821` — using the values from Dan's screen load, which included the old empty notes. Both saves returned success. Priya's twenty minutes of work is gone. The database has no complaint because, technically, every write did exactly what it was told.

This is called a **lost update**: two people read the same row, both write, and the last writer silently erases the first writer's change. No error, no exception, nothing in the logs — just data quietly disappearing. Optimistic locking is the standard fix for exactly this situation.

## 2. The Analogy — Make the Mechanic Obvious

Picture a shared kitchen whiteboard that a whole team uses, with one sticky note stuck in the corner that always shows "last updated: 3rd revision."

The workflow everyone follows: when you want to change something on the board, you first copy the board's content **and** read the sticky note ("revision 3"). Then you walk back to your desk and draft your changes on your own notepad — taking as long as you like. Nobody stands guard at the board while you draft; other people can still walk up and write whenever they want.

When you're ready to write, you walk back to the board and do one check first: does the sticky note still say "revision 3"?

- If yes — nobody touched it since you copied it. Wipe the section, write your changes, and update the sticky note to "4th revision."
- If no — someone wrote after you copied. You do **not** wipe their changes. You re-copy the board (now at revision 5), redo your edit on top of what's there now, and try again with the new number.

Every part of this maps to the real mechanic:

| Whiteboard | Database |
|---|---|
| Copying the board + sticky note | `SELECT` the row, including its version |
| Drafting at your desk | Your application logic running between read and write |
| The sticky note counter | The `version` column |
| Checking the note before writing | `WHERE ... AND version = ?` in the UPDATE |
| Updating the note to the next revision | `SET version = version + 1` |
| Walking back to re-copy and redo | Retrying after a conflict |

And here's the key property: nobody ever blocked anyone. There was never a guard posted at the board. The conflict was caught *at write time* by comparing numbers — not prevented by waiting. That's why it's called **optimistic**: you optimistically assume nobody will get in your way, and you only verify when you actually write. Its opposite, pessimistic locking, would be taping a "DO NOT ERASE — IN USE" sign across the board for your entire twenty minutes of drafting, forcing everyone else to stand and wait.

## 3. The Full Explanation — How It Actually Works

The whole scheme fits in one sentence: give every row a small counter that goes up each time the row changes, and make writers prove they saw the current count before they're allowed to overwrite.

Here's the mechanic step by step:

**The schema.** Add a column to the table you want to protect:

```sql
ALTER TABLE tickets ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
```

Every read now returns the row *plus* its current version. Every successful write must bump the version by one. That bumped number becomes the fingerprint of "the state I produced."

**The guarded write.** Instead of writing blind:

```sql
UPDATE tickets
SET status = 'resolved',
    notes  = 'Root cause: stale JWT...',
    version = version + 1          -- must bump, or the guard does nothing
WHERE id = 4821
  AND version = 7;                 -- "only if still the state I read"
```

Then check how many rows were affected. This is the part people miss: **the database does not throw an error on a conflict.** If another writer already moved the version to 8, your `WHERE version = 7` matches nothing, the UPDATE simply touches zero rows, and SQLite/PostgreSQL/MySQL all report success with an affected-row count of 0. Your application code must treat `affected rows == 0` as "someone wrote before me — my snapshot is stale." Affected rows == 1 means you won.

**Why no locks are involved.** Between the SELECT and the UPDATE, your connection holds no lock on the row. Other sessions can read and even write that row freely while you're thinking, rendering, waiting for user input. Detection happens purely by value comparison at write time. Compare that to pessimistic locking (`SELECT ... FOR UPDATE`), which holds a row lock from read until commit — including across a human's think time if you're careless. With optimistic locking, the only cost of concurrency is the occasional failed write, which is why it fits web apps so well: two support agents editing the same ticket in the same second almost never happens, but when it does, you catch it instead of silently destroying data.

**The `updated_at` variant.** A common shortcut: skip the version column and use `WHERE id = ? AND updated_at = ?`. It works, and ORMs often let you plug a timestamp in the same way. But it's weaker than a counter: timestamps have limited resolution, so two writes within the same clock tick can produce the same `updated_at`, letting a stale writer slip through the guard. Timezone round-trips and format changes through JSON can also mangle the comparison. A plain integer version is monotonic and exact — prefer it unless the column already exists.

**What to do when the conflict fires.** Two legitimate strategies, and good systems use both depending on context:

- *Retry automatically.* Re-read the row, re-run your decision against the fresh data, attempt the guarded write again, with a small retry cap. Right for background jobs and machine-to-machine writes where conflicts are rare and the decision is cheap to redo.
- *Surface it to the user.* Return HTTP 409 Conflict (or 412 Precondition Failed), and show "someone else changed this ticket while you were editing — here's the latest version." Right for interactive editors, because the human may genuinely need to merge their intent with the new state, and silently retrying could overwrite meaning.

At the HTTP layer this same idea exists as ETags: the server hands back an `ETag` (often derived from the version), the client echoes it back in `If-Match`, and a mismatched tag gets a 412. Same whiteboard, stickier note, different protocol.

**Where ORMs do this for you.** Most major ORMs have first-class support, which tells you how standard this pattern is:

- SQLAlchemy: set `__mapper_args__ = {"version_id_col": version}` on the model — the session then adds the version predicate to every UPDATE and raises `StaleDataError` when zero rows come back.
- JPA/Hibernate: annotate a field with `@Version` — flushes emit `UPDATE ... WHERE id = ? AND version = ?` and throw `OptimisticLockException` on conflict.
- Ruby on Rails: add a `lock_version` integer column and ActiveRecord handles it automatically, raising `ActiveRecord::StaleObjectError`.
- Django: no built-in flag, but the idiom is `Ticket.objects.filter(id=..., version=seen).update(...)` and checking the returned row count.

**When optimism stops paying off.** The pattern wins when contention is low: many rows, few simultaneous writers per row, conflicts rare. Under hot contention — a flash-sale stock row, a shared counter, a seat map — nearly every writer loses, retries pile on top of each other, and throughput collapses. That's the signal to switch tools: atomic updates (`SET stock = stock - 1 WHERE stock > 0`) or pessimistic locks. More on that below.

## 4. See It In Practice — Real Code or Queries

First, watch the lost update get caught. This demo is runnable as-is with plain SQLite — paste it into `sqlite3 :memory:`:

```sql
-- Run: sqlite3 :memory: < optimistic_demo.sql

CREATE TABLE tickets (
  id      INTEGER PRIMARY KEY,
  title   TEXT NOT NULL,
  status  TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

INSERT INTO tickets (id, title, status) VALUES (1, 'Login broken on iOS', 'open');

-- Both agents SELECT the row and see status='open', version=1.

-- Agent B saves first: the guard passes (version still 1), row is written.
UPDATE tickets
SET status  = 'resolved',
    version = version + 1
WHERE id = 1 AND version = 1;
SELECT changes() AS b_affected_rows;   -- 1  -> B's write landed

-- Agent A saves late, still holding version=1 from the earlier read.
-- Someone else already bumped it, so the WHERE matches NOTHING.
UPDATE tickets
SET status  = 'closed',
    version = version + 1
WHERE id = 1 AND version = 1;
SELECT changes() AS a_affected_rows;   -- 0  -> A's stale write was rejected

SELECT id, status, version FROM tickets;  -- 1|resolved|2  (A did NOT clobber B)
```

That final output is the entire payoff: A's late write didn't error, but `changes()` returning 0 told the application honestly that it lost the race.

Now contrast with the naive code that causes lost updates in production:

```sql
-- NO GUARD: this succeeds unconditionally, no matter who wrote since we read.
UPDATE tickets SET status = 'closed' WHERE id = 1;
-- Always reports 1 row affected. Priya's erased notes looked exactly like this.
```

And here's the application-side shape — a retry loop keyed off affected rows. This runs as-is with Python's built-in sqlite3:

```python
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE tickets (id INTEGER PRIMARY KEY, status TEXT, "
           "version INTEGER NOT NULL DEFAULT 1)")
db.execute("INSERT INTO tickets (id, status) VALUES (1, 'open')")

def save_with_retry(ticket_id, new_status, max_tries=3):
    # Each attempt re-reads, so we always retry against the FRESH state.
    for attempt in range(max_tries):
        cur = db.execute(
            "SELECT status, version FROM tickets WHERE id = ?", (ticket_id,))
        status, version = cur.fetchone()

        cur = db.execute(
            "UPDATE tickets SET status = ?, version = version + 1 "
            "WHERE id = ? AND version = ?",
            (new_status, ticket_id, version),
        )
        db.commit()

        if cur.rowcount == 1:
            return True      # our write landed
        # rowcount == 0 -> another writer bumped the version between our
        # read and our write. Loop back, re-read the new state, try again.
    return False             # give up; caller turns this into a 409
```

In a real service this runs inside a transaction and the two agents sit on separate connections — the interleaving above happens exactly the same way. And if you'd rather not hand-roll it, the ORM versions are tiny:

```python
# SQLAlchemy: one mapper option arms the guard on every update.
class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(Integer, primary_key=True)
    status = Column(String)
    version = Column(Integer, nullable=False, default=1)

    __mapper_args__ = {"version_id_col": version}
# On flush it emits UPDATE ... WHERE id=? AND version=?
# and raises StaleDataError when 0 rows are affected.
```

```java
// JPA/Hibernate: @Version arms the same guard.
@Entity
class Ticket {
    @Id Long id;
    String status;

    @Version Long version;   // conflict at flush -> OptimisticLockException
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is optimistic locking and how would you implement it in SQL?**

It's a way to stop lost updates without holding any locks. You add a `version` column to the table, read the row together with its version, and perform every write as a conditional update: `UPDATE ... SET ..., version = version + 1 WHERE id = ? AND version = ?`. The version predicate is the contract — the write only lands if the row is still in the state you read. After executing, you check the affected-row count: 1 means you won, 0 means another writer got there first and your snapshot is stale. No locks are taken between read and write; detection happens entirely at write time by comparing values.

**Q: If the database doesn't raise an error on conflict, how does the application know one happened?**

Through the affected-row count. A conflicting UPDATE isn't an error — it's a perfectly legal statement that happened to match zero rows. So the driver's equivalent of `cursor.rowcount` (or `changes()` in SQLite, `SQL%ROWCOUNT` in PL/pgSQL, the result of `QuerySet.update()` in Django) is the actual signal. This trips people up: code that ignores the rowcount looks successful while doing nothing. Any framework that offers optimistic locking (SQLAlchemy's `version_id_col`, JPA's `@Version`) is essentially automating this check and turning "zero rows" into an exception like `StaleDataError` or `OptimisticLockException`.

**Q: Why is it called "optimistic"? When does that optimism stop being justified?**

Optimistic because it bets conflicts are rare: it lets everyone read and write freely and only checks for collisions at write time, rather than blocking people upfront. The bet pays off in typical web workloads — millions of rows, and the odds of two users editing the *same* row in the same second are tiny. The bet fails under hot contention: a flash-sale inventory row, a shared counter, a seat map. There, N concurrent writers all read the same version, N−1 fail, all retry simultaneously, and most fail again — lots of wasted work, little progress. When a row is that hot, switch to atomic single-statement updates or pessimistic locking, where waiting is the mechanism rather than the failure mode.

**Q: Can I use `updated_at` instead of a dedicated version column?**

Yes — `WHERE id = ? AND updated_at = ?` detects the same class of conflict, and it's attractive when the column already exists. But it's strictly weaker. Timestamps have finite resolution, so two writes landing within the same clock tick produce identical values and a stale writer sneaks past the guard. Round-tripping timestamps through JSON can also shift formats or timezones so the comparison mismatches or falsely matches. An integer version is monotonic and exact: every write produces a brand-new value, period. Use the timestamp variant only when you must; prefer the counter.

**Q: Doesn't a normal transaction already prevent this?**

No — and this is the misconception that separates candidates who've been bitten from those who haven't. A transaction guarantees atomicity (all statements commit together or none do), but under the default READ COMMITTED isolation, two transactions can both read the same row, both compute a change, and both commit — the second overwrites the first, atomically. The lost update survives the transaction perfectly intact. To get protection *from the database itself* you need stronger isolation (SERIALIZABLE, or locking reads like `SELECT ... FOR UPDATE`), and those carry throughput costs. Optimistic locking is application-level concurrency control layered on top of ordinary transactions — you still wrap the guarded UPDATE in a transaction; the version predicate is what catches the conflict the transaction doesn't.

**Q: How do you handle a detected conflict — auto-retry or error out?**

Depends on who can resolve the conflict intelligently. For background jobs and machine-to-machine writes, retry automatically: re-read the row, re-apply your decision against the fresh data, attempt again, capped at a few tries with maybe a small backoff. The decision logic usually converges because the underlying facts barely changed. For interactive flows — a human editing a form — don't blindly retry: return HTTP 409 Conflict (or 412 with an ETag/If-Match scheme) and let the UI tell the person "this changed underneath you," ideally showing both versions so they can merge intent. Blindly replaying a human's stale decisions can be worse than asking them.

**Q: How does this surface to the frontend?**

As a non-2xx response the client must handle deliberately: typically 409 Conflict with a message like "someone updated this ticket — reload to see the latest." The frontend shows a merge/refresh prompt instead of a fake success. The HTTP-native version uses ETags: the server returns `ETag: "v7"` with the resource, the client sends `If-Match: "v7"` on update, and the server answers 412 Precondition Failed when the tag is stale. Frontend teams should treat a 409/412 from an optimistic-locking endpoint as an expected state to design for, not an error to dump in a toast.

**Q: Which ORMs give you this out of the box?**

SQLAlchemy arms it with `__mapper_args__ = {"version_id_col": version}` and raises `StaleDataError` on conflict. JPA/Hibernate uses `@Version` on a numeric field and throws `OptimisticLockException`. Rails activates it automatically when a `lock_version` column exists, raising `ActiveRecord::StaleObjectError`. Django has no flag — the idiom is a filtered `.update()` plus checking the returned row count. Knowing these names matters in interviews because it shows you've shipped this, not just read about it.

**Q: How would you test it?**

You have to force the race deterministically. In a test, load the same row into two sessions (or two connections). Write through session B and commit. Then attempt the stale write through session A without reloading. Assert three things: A's statement reported zero affected rows (or raised the ORM's stale exception), B's data survived intact, and A's retry path (if any) recovers against the new state. Don't rely on threads and sleeps to create the race — interleave explicitly. Also test the API contract: a conflicting request returns 409/412, not a silent 200.

**Q: What would you monitor in production?**

Track the conflict rate: count occurrences of affected-rows-zero / stale exceptions / 409 responses per endpoint or table. A low steady rate means the design is working; a rising rate tells you a row or entity type has become contended and needs a different strategy (atomic update, queueing, pessimistic lock). Log enough context on conflict to debug merges later — entity id, both versions, and the user ids. And alert on retry-loop exhaustion: it means users are hitting repeated failures and losing work.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Read-modify-write with no version check.** The wrong assumption is "I wrapped it in a transaction, so I'm safe" — or worse, dev never thought about it at all. Why it's wrong: a transaction groups and commits statements; it does not stop two transactions from both reading version 7 and both writing. What actually happens: the classic sequence — SELECT the row, compute changes in application code, run an unconditional `UPDATE ... WHERE id = ?` — succeeds every time, and whichever write comes last silently erases the other. This is the worst category of bug: data is destroyed, logs are clean, tests pass, and customers find it for you weeks later. The fix: put the version (or `updated_at`) in every competing UPDATE's WHERE clause, bump the version in SET, check the affected-row count everywhere, or turn on your ORM's built-in versioning so the guard is impossible to forget. Related subtle bug: adding the version to WHERE but forgetting `version = version + 1` in SET — then the version never moves, every subsequent stale writer also passes the guard, and you've built a lock that guards nothing.

**Trap 2: Retry storms on hot rows.** The wrong assumption is "conflicts are rare, so always retry until success." That's true for the average row and catastrophically false for hot ones. Why it's wrong: on a contended row (stock quantity during a drop, a shared aggregate counter, the last seat), dozens of clients hold the same stale version, all fail together, all immediately retry against the same new version — and again N−1 fail. What actually happens: a thundering herd. Database CPU burns on doomed writes, p99 latency explodes, most requests exhaust their retry cap anyway, and throughput is *worse* than a simple queue would have been — all while the optimistic machinery works exactly as designed. The fix is recognizing that retry-based optimistic locking serializes losers into wasted work: replace it for hot paths with a truly atomic update (`UPDATE inventory SET stock = stock - 1 WHERE sku = ? AND stock > 0` — one statement, no retry needed), or take a pessimistic `SELECT ... FOR UPDATE` so contenders wait in line instead of crashing into each other, or funnel writes through a single-threaded worker/queue.

## 7. Compare With Related Concepts

**vs. Pessimistic locking.** Pessimistic locking grabs the row lock upfront (`SELECT ... FOR UPDATE`) and holds it until commit, so other writers block and wait; conflict prevention happens *before* the fact. Optimistic locking blocks nobody and detects collisions *after* the fact via the version check. Pessimistic costs you lock wait time, deadlock risk, and held locks across slow code; optimistic costs you occasional failed work and retry logic. One-line rule: low contention → optimistic; high contention or must-succeed-now → pessimistic.

**vs. Transactions themselves.** A transaction makes a group of statements all-or-nothing and isolates them to some degree — but at READ COMMITTED it will happily let two committed transactions overwrite each other's reads. Optimistic locking is not an alternative to transactions; it's an additional rule you enforce *inside* them, answering a question transactions don't ask: "is the world still the way I found it?" One-line rule: wrap the work in a transaction for atomicity; add version-checked writes when correctness depends on nobody having modified the row since you read it.

**vs. MVCC (as implemented in PostgreSQL).** Databases like Postgres already keep multiple row versions internally so readers never block writers. That solves *readers vs. writers*, not *writer vs. writer*: MVCC still lets the last committer win on conflicting writes. Application-level optimistic locking borrows the version idea and enforces it where the database leaves off — between two concurrent writers.

## 8. 🧠 The Memory Hook

The whiteboard with the sticky note: copy the board and its revision number, draft as long as you like with nobody guarding the board, then write only if the note still shows your number — `UPDATE ... WHERE version = <what I read>`. One row affected means you won; zero means the world moved on while you were thinking, so re-read, re-decide, and go again.
