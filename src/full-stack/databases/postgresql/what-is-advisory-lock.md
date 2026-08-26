# What Is an Advisory Lock in PostgreSQL

## 1. The Real-World Problem — When You Actually Hit This

Your invoice recalculation job has run every night at 2 AM for a year, and it lives inside your app: a timer fires, the worker recalculates balances, everyone's happy. Then the team scales from one app instance to three behind a load balancer, and at 2 AM all three instances fire the same timer. Three workers recalculate the same invoices at once, writes interleave, totals come out doubled or torn, and you spend the morning explaining duplicate charges to support.

So you reach for the obvious fix: a row in a `jobs` table saying `running = true`, checked before starting. That has its own failure modes. Two instances can read `running = false` in the same instant and both proceed, because checking-and-setting isn't atomic unless you're very careful. And when the instance that set the flag crashes mid-job, the flag stays `true` forever and the job never runs again.

This exact situation — several processes need to agree that only one of them does something, and they only share a database — is what PostgreSQL's advisory locks were built for. The lock lives in the database server's memory, keyed by any number you choose, and no table, row, or schema change is involved.

## 2. The Analogy — Make the Mechanic Obvious

Picture an office building with a wall of identical lockers, numbered 1 to whatever. No locker belongs to any person or desk. The building doesn't care what you put in them, and nothing about locker 47 physically connects it to anything.

The entire system runs on one thing: agreement between teams. Your team agrees that "locker 47 means the nightly invoice job." Now the rule is simple — whoever holds the key to locker 47 is allowed to run that job.

Every part of the mechanic maps cleanly:

- If another instance walks up and wants to run the job, it checks locker 47. If the key is gone, it can stand there and wait for the key to come back (that's a blocking lock), or glance at the empty hook and go do something else (that's a try-lock that returns false).
- Returning the key when the work is done is `pg_advisory_unlock`. Forgetting to return it is the nightmare scenario: the key sits in your pocket, and everyone else waits — potentially forever.
- Building security has one mercy: when you leave the building entirely, they take the key back out of your pocket. In database terms, when the connection disconnects, the session's advisory locks vanish automatically.
- There's also a special kind of key you're only allowed to borrow for the length of one meeting. When the meeting ends — successfully or not — the key returns itself. That's the transaction-level lock: it dies at commit or rollback whether you remembered anything or not.

And the sharpest part of the analogy: locker 47 contains nothing about invoices. The number means nothing to the building. If another team independently decides locker 47 means "deploy step 3," their deploy and your invoice job will silently block each other, and nobody will see why. The lock is only as good as the team's numbering convention.

## 3. The Full Explanation — How It Actually Works

Strip the analogy away and an advisory lock is a named "busy flag" kept inside PostgreSQL's regular lock manager. You pick a number — technically a single 64-bit `bigint`, or a pair of 32-bit integers — and ask Postgres whether anyone holds that number right now. If yes, you either wait or get told no. If no, you become the holder until the lock's lifetime ends. No rows are read, written, or locked. The number never touches your schema. It exists purely so independent processes have something to agree on.

PostgreSQL gives you two lifetimes, and choosing between them is most of the practical skill:

**Session-level locks** — `pg_advisory_lock(key)` and friends. The lock is held by your *connection*, not by a transaction. It survives commits and rollbacks. You release it explicitly with `pg_advisory_unlock(key)`, which must be called on the *same connection* that took it. If you never unlock, the lock lives until the connection closes — and production connections, especially pooled ones, stay open for hours or days. These locks are also reentrant: if the same session asks twice, it succeeds twice (it doesn't block on itself), and you owe two unlocks before anyone else can get through.

**Transaction-level locks** — `pg_advisory_xact_lock(key)`. Take it inside a transaction and it releases automatically when that transaction ends, whether it commits or rolls back. There is deliberately no manual unlock function for it. This lifetime is immune to the forgotten-unlock problem, which makes it the default choice whenever the work you're protecting fits inside one transaction.

Within each lifetime there's a behavior choice. `pg_advisory_lock` and `pg_advisory_xact_lock` *block*: if someone else holds the key, your call waits in line until it's free — potentially forever, unless you've set `lock_timeout` to make the wait give up with an error. `pg_try_advisory_lock` and `pg_try_advisory_xact_lock` never wait: they return `true` if you got the lock and `false` immediately if someone else has it. Waiting is right when every waiter genuinely needs its turn (migrations); trying is right when the answer to "someone's already doing it?" is "great, I'll skip" (scheduled jobs). There are also `_shared` variants of each — many sessions may hold a shared lock at once, while an exclusive holder shuts everyone out — useful when you want "no one rebuilds the cache while I read it."

Two properties fall out of the design and matter constantly. First, because the key is arbitrary, coordination is *pure convention*. Nothing binds key 47 to invoices, to a table, or even to your application. Every process that participates must use the same number for the same purpose, chosen deliberately. The keyspace is one flat global namespace — not scoped per table, per schema, or even per database within the same Postgres cluster — so careless keys don't just risk collisions, they cause silent ones. Second, advisory locks ride on the same machinery as ordinary table locks: waiters line up in order, genuine deadlocks (A holds 47 wants 48, B holds 48 wants 47) are detected and one side gets aborted with an error, and everything currently held or awaited shows up in the `pg_locks` view under `locktype = 'advisory'`. You get battle-tested infrastructure for free.

What you gain versus rolling your own flag-table: atomicity you don't have to reason about, automatic cleanup when a process dies (disconnect releases the lock — a crashed worker can't strand the job the way a stuck `running = true` row can), and zero extra infrastructure, because every service already talks to the database. What you pay: a lock is only released by disconnect or explicit action, so a hung-but-alive connection blocks everyone; the flat namespace invites collisions; and a lock guarantees *exclusion*, never *correctness* — the winner can still crash mid-job, and the next run starts from whatever half-finished state was left behind.

One interaction bites people in production: these semantics assume your connection is *yours* for the lock's lifetime. Connection poolers that multiplex many clients over few physical connections break that assumption — details in the traps below, and the pooling mechanics live on the [PgBouncer page](./what-is-connection-pooling-with-pgbouncer.md).

Use advisory locks for coordinating *workers*, not protecting *data*: scheduler leader election across instances, ensuring one migration or backfill runs at a time, letting only one process rebuild a hot cache (single-flight). When you actually need to stop two transactions from editing the same row, that's what [row-level locking](./what-is-row-level-locking.md) is for.

## 4. See It In Practice — Real Code or Queries

**Leader election: only one instance runs the nightly job.** First in raw SQL so the mechanic is visible — imagine instance A and instance B each running this on their own connection:

```sql
-- Instance A, 02:00:00
SELECT pg_try_advisory_lock(47);
 pg_try_advisory_lock
----------------------
 t                     -- A holds the key, proceeds with the job

-- Instance B, 02:00:01
SELECT pg_try_advisory_lock(47);
 pg_try_advisory_lock
----------------------
 f                     -- B skips tonight instead of duplicating the work

-- Instance A, job finished
SELECT pg_advisory_unlock(47);
 pg_advisory_unlock
--------------------
 t                      -- key back on the hook; tomorrow someone new wins
```

If A crashes mid-job instead of finishing, its connection drops, Postgres releases the lock automatically, and tomorrow's run works. That self-healing property is the whole argument over a flag row.

In application code, the shape that survives production is try-lock plus `finally`:

```ts
import { Pool } from 'pg'

// Arbitrary number. Nothing about 47 relates to invoices — it only matters
// that every instance that might run this job agrees this number means it.
const NIGHTLY_INVOICE_RECALC_LOCK = 47n

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function recalcInvoicesNightly(): Promise<void> {
  const client = await pool.connect()

  // Try, don't wait: if another instance is already running the job,
  // skipping is success. A blocking lock here would pile up idle workers.
  const { rows } = await client.query(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [NIGHTLY_INVOICE_RECALC_LOCK],
  )
  if (!rows[0].locked) {
    client.release()
    return
  }

  try {
    await runRecalc(client)
  } finally {
    // This finally is the most important line on the page. If runRecalc
    // throws and we skip the unlock, the lock lives as long as this pooled
    // connection does — possibly days — and every instance skips forever.
    await client.query('SELECT pg_advisory_unlock($1)', [
      NIGHTLY_INVOICE_RECALC_LOCK,
    ])
    client.release()
  }
}
```

**Migration coordination: every waiter needs a turn, so block.** Two deploy pipelines racing to alter the same table shouldn't skip each other — the second should wait, and the work fits inside one transaction, so the transaction-level lock fits perfectly:

```sql
BEGIN;

-- Only one pipeline gets past this line; the other waits here.
SELECT pg_advisory_xact_lock(9001);

ALTER TABLE invoices ADD COLUMN tax_cents bigint NOT NULL DEFAULT 0;

COMMIT;  -- lock released here automatically. Rollback would release it too.
```

There's no `pg_advisory_xact_unlock` — that's a feature. You cannot leak this lock past the end of the transaction no matter how the code path unwinds.

**Waiting with a safety net.** A blocking lock with no bound hangs forever if a holder wedges. Give the wait a deadline:

```sql
SET lock_timeout = '10s';
SELECT pg_advisory_lock(47);  -- errors out after 10s instead of hanging eternally
RESET lock_timeout;
```

**Naming keys without magic numbers.** Hashing a readable name into the 64-bit key space keeps call sites self-documenting:

```sql
SELECT pg_advisory_xact_lock(hashtextextended('invoice-recalc-nightly', 0));
```

Collisions are still possible (hashes collide), which is why serious setups define keys once in a shared constants module instead of sprinkling literals everywhere.

**Finding out who currently holds or waits on advisory locks** — usually at 2 AM, wondering why nothing is moving:

```sql
SELECT l.pid,
       a.application_name,
       a.client_addr,
       l.granted,
       -- For single-bigint keys: classid holds the upper 32 bits, objid the lower
       (l.classid::bigint << 32) | l.objid::bigint AS advisory_key,
       a.state,
       a.query_start
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.locktype = 'advisory'
ORDER BY l.granted DESC;
```

Rows with `granted = false` are the queue. The oldest `granted = true` row is almost always your culprit.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is an advisory lock in PostgreSQL, and why does it exist?**

It's an application-defined lock: Postgres lets you acquire exclusivity on any number you choose — a `bigint`, or two integers — with no relationship to any table, row, or schema object. It exists for the coordination problem every multi-instance backend eventually hits: several processes need to agree that only one of them performs some action, and their only shared component is the database. Cron deduplication across instances, single-runner migrations, single-flight cache rebuilds. The word "advisory" is honest labeling — Postgres enforces who holds the key perfectly, but it advises rather than enforces what the key means, because the meaning lives entirely in your team's convention.

**Q: What's the difference between `pg_advisory_lock` and `pg_advisory_xact_lock`, and how do you choose?**

Lifetime. `pg_advisory_lock` is bound to the session: it survives transactions, must be released by calling `pg_advisory_unlock` on the same connection, and is released automatically when the connection ends. `pg_advisory_xact_lock` is bound to the transaction: taken inside one, released automatically at commit or rollback, with no manual unlock available at all. Choose xact-level whenever the protected work fits inside a single transaction — it's leak-proof by construction. Choose session-level when the work spans multiple transactions or lives outside any transaction (a long-running batch job that commits in chunks), and then accept the obligation: unlock in a `finally`-style path, because otherwise the lock lives as long as the connection does.

**Q: What happens if a session takes a session-level advisory lock and never unlocks it?**

Nothing dramatic immediately — which is the danger. The lock stays held until the session's connection closes. Locally, where connections close when your script exits, that's seconds. In production, applications borrow connections from pools that keep them alive for hours or days, so the lock effectively becomes permanent. Depending on your pattern, every other instance then blocks forever on `pg_advisory_lock` (jobs pile up) or skips forever on `pg_try_advisory_lock` (the job silently stops running — often noticed weeks later). The defenses, in order of preference: prefer `pg_advisory_xact_lock` when possible; wrap session-level usage in try/finally so exceptions still unlock; cap waits with `lock_timeout`; and alert on long-lived granted advisory locks via `pg_locks`.

**Q: How do advisory locks behave with connection poolers like PgBouncer?**

Badly, if you use session-level locks under transaction-mode pooling — and this is a real production incident generator. Transaction mode multiplexes many clients over a small set of physical connections, assigning a connection per transaction. Your session-level advisory lock gets attached to whichever physical connection ran the acquiring query, but your next statements may run on a *different* physical connection — including the unlock, which fails because a different session can't release someone else's lock. Result: leaked locks plus code that looks correct. With transaction pooling, use `pg_advisory_xact_lock`: the lock's lifetime matches the transaction, which matches the pooling model exactly. Alternatively, route locking work through a dedicated direct connection, or run the pooler in session mode. The general lesson: session-scoped anything requires a stable session, and you should know which guarantee your pooler actually provides.

**Q: Do advisory locks conflict with row locks, table locks, or normal queries?**

No, and that's the point. An advisory lock touches no data structures at all — it's an entry in the lock manager keyed by your number. Readers and writers of any table sail through untouched; `SELECT`, `UPDATE`, `DDL` — nothing notices. The only contention is between sessions asking about the *same key*. That's also why an advisory lock protects nothing by itself: two processes that use different numbers, or skip the ceremony entirely, stomp on each other's rows freely while both believe they're "locked." Exclusion only exists between participants who agreed on the convention.

**Q: How do you choose keys so features don't collide?**

Treat the keyspace as one flat global namespace shared by everything connected to the cluster, and allocate from it deliberately. Practical schemes: use the two-integer form as a namespace pair, like `pg_advisory_lock(feature_id, resource_id)` where feature IDs are assigned centrally; derive keys from documented string names via `hashtextextended('invoice-recalc-nightly', 0)`; or define every key in one shared constants module so grepping finds owners. What causes incidents is scattered literals — two teams independently writing `pg_advisory_lock(42)` for unrelated jobs produce a bug that looks like random slowdowns and never points at either team's code. The senior move isn't a clever scheme; it's having *one* scheme.

**Q: Walk me through making sure only one instance runs the nightly job.**

Each instance runs the same scheduled task, which first attempts `pg_try_advisory_lock(<agreed key>)` on its database connection. The winner gets `true` and runs the job; losers get `false` and exit immediately — skipping *is* the correct outcome, not an error. Unlock happens in a finally clause after the job completes or throws. Failure handling comes free: if the winning instance dies mid-job, its connection drops, Postgres releases the lock automatically, and the next scheduled run proceeds normally — no stale flags to clean up, unlike a homegrown `running = true` row. Add `lock_timeout` if you ever switch to the blocking variant, and a dashboard query against `pg_locks WHERE locktype = 'advisory'` so a wedged holder is visible. The one remaining responsibility is yours, not the lock's: the job itself must tolerate retrying after a partial run, because exclusion doesn't make work resumable.

**Q: Can advisory locks deadlock? Does Postgres notice?**

Yes and yes. They flow through the same lock manager as ordinary locks, so the classic deadlock applies: session A holds key 47 and requests 48 while session B holds 48 and requests 47. Postgres's deadlock detector periodically scans the wait-for graph, detects the cycle, and aborts one of the sessions with a deadlock error, releasing its locks. So deadlocks aren't silent hangs — they're loud errors, and the usual hygiene applies: acquire multiple keys in a consistent global order everywhere. One subtlety worth knowing: a session holding a session-level advisory lock while blocked in a long transaction can pin things in ways that are harder to spot than transaction-level cycles, because the lock's owner isn't obviously "inside" anything.

**Q: How do you debug or monitor advisory locks in production?**

Query `pg_locks` filtered to `locktype = 'advisory'` and join `pg_stat_activity` on `pid` to attach human context — application name, client address, current state, when the last query started. `granted = true` rows are holders; `granted = false` rows are the waiting queue, and their age tells you how badly something is stuck. Reconstruct the key from `classid` and `objid` to identify which feature owns the contention. Useful standing alerts: any advisory lock granted longer than your longest legitimate job, and any nonzero wait queue older than a few minutes. Both catch the two real failure shapes — the forgotten unlock and the unexpectedly long holder.

**Q: What happens if the same session acquires the same session-level advisory lock twice?**

It succeeds both times. Session advisory locks are reentrant with a stack: each `pg_advisory_lock(47)` on a session that already holds 47 pushes another level instead of blocking, so nested code paths that each "take the lock" don't deadlock against themselves. The bill arrives at unlock time — each acquisition consumed one unlock, so you need two `pg_advisory_unlock(47)` calls before another session can acquire it; the first unlock returns `true`, and once the stack is empty, further unlocks return `false` harmlessly. It's a neat mechanism, but relying on it is usually a smell: if you can't easily tell how many levels deep you are, you're one missed unlock away from the leak scenario.

## 6. The Traps — What Goes Wrong in Production

**"The connection will clean up after me."** The wrong assumption: forgetting `pg_advisory_unlock` is okay because locks surely expire. Why it's wrong: session-level locks have no timeout and no expiry — their only automatic release is connection close. What happens: locally everything works because script exits close connections; in production the connection came from a pool that keeps it alive indefinitely, so the lock persists for days. With a blocking pattern, workers stack up waiting; with a try pattern, every instance silently skips the job forever. The fix is layered: prefer xact-level locks when the work fits one transaction; use try/finally around session locks; set `lock_timeout` on blocking acquisitions; alert on suspiciously old granted advisory locks in `pg_locks`.

**"My number is mine."** The wrong assumption: key 47 refers to your invoice feature, so only invoice code contends on it. Why it's wrong: the key carries no scoping whatsoever — not your table, not your schema, not your feature, and not even your database within the cluster. It's one giant flat namespace where 47 is just 47. What happens: months later another team picks 47 for their export job, and suddenly the invoice recalc and the export serialize each other. Symptoms look like random, unexplainable slowness or jobs that "sometimes don't run" — and nothing in either codebase connects them. The fix is organizational as much as technical: assign keys from one central place (constants module, two-int namespace pairs, or hashed canonical names), and treat a bare literal in a call site as a review flag.

**"It worked in dev, so it'll work behind our transaction-mode pooler."** The wrong assumption: session-level advisory locks are portable across deployment configurations. Why it's wrong: dev runs direct connections, but production routes through PgBouncer in transaction mode, where "session" is an illusion — each query can land on a different physical connection. What happens: the lock attaches to one physical connection, later queries (including the unlock) land on others, the unlock fails or targets the wrong holder, and locks leak while logs show code executing in the "right" order. The fix: match lock lifetime to pooling model — `pg_advisory_xact_lock` pairs correctly with transaction pooling because both are transaction-scoped — or dedicate a direct, unpooled connection for locking work. Know your pooler's mode before shipping session-scoped anything.

**"The lock makes the job safe."** The wrong assumption: holding the advisory lock means the protected work is correct. Why it's wrong: the lock provides mutual exclusion, nothing more. The winner can still crash halfway through; the transaction-level lock releases at commit even if the job failed logically; and exclusion says nothing about the state left behind. What happens: a killed run leaves half-updated aggregates, the next night's run happily acquires the lock and builds on garbage, and the corruption compounds quietly. The fix: design the protected job to be idempotent or resumable — wrap units of work in transactions, track progress explicitly, and treat the advisory lock as solving *who runs* while your job design solves *what running twice means*. Related boundary: if the actual requirement is preventing concurrent edits to specific rows, that's [row-level locking](./what-is-row-level-locking.md) territory, and an advisory lock is the wrong tool even though it superficially "works" when everyone cooperates.

## 7. Compare With Related Concepts

**vs. row-level locks (`SELECT ... FOR UPDATE`).** Row locks bind to existing rows and participate in data correctness — conflicting transactions block or error regardless of conventions. Advisory locks bind to nothing and only affect processes that opt in. Rule: protecting specific rows' data during a transaction → row locks; coordinating which process runs a job → advisory lock ([details](./what-is-row-level-locking.md)).

**vs. table locks (`LOCK TABLE`).** Table locks are coarse and collateral — taking one affects every unrelated query touching that table. Advisory locks never touch tables at all. Rule: need to freeze a table for maintenance → `LOCK TABLE`; need workers to take turns without disturbing traffic → advisory lock.

**vs. MVCC.** MVCC gives readers consistent snapshots without blocking writers, but it does nothing to stop three instances from all *deciding* to run the same job — they'll each get a valid snapshot and duplicate the damage. Rule: MVCC solves read/write interference; advisory locks solve worker duplication ([MVCC mechanics](./what-is-mvcc.md)).

**vs. a Redis mutex (`SET NX PX`).** Redis offers TTL-based expiry — handy when holders die without cleanup — but a TTL that fires mid-job lets a second worker start while the first still runs, and adds a second system to keep consistent. Postgres advisory locks cost zero extra infrastructure, release deterministically on disconnect, and are visible in `pg_locks`. Rule: already have Postgres and want crash-safe coordination → advisory lock; need expiry-based leases or coordination beyond the database's lifetime → Redis mutex.

**vs. a job-lease table (unique insert + expiry column).** Inserting a lease row with a unique constraint is a durable, auditable lock that survives restarts and supports time-based expiry via timestamps. It costs more code and careful cleanup logic compared to a one-line function call. Rule: need lock history, TTL semantics, or coordination visible to non-database tooling → lease table; need simple, immediate mutual exclusion → advisory lock.

## 8. 🧠 The Memory Hook

An advisory lock is a locker whose number means nothing to Postgres and everything to your team: the building guards the key perfectly, but the meaning is pure agreement — and whoever pockets the key owns that number until they leave the building. Session lock = key till you leave; xact lock = key that returns itself when the meeting ends.
