# What Is a Read Replica

## 1. The Real-World Problem — When You Actually Hit This

Your app has been fine for months. Then launch day. The dashboard goes red: the primary database is pinned at 100% CPU, page loads are creeping past two seconds, and someone restarts it hoping that helps. It doesn't.

Then checkout starts timing out. And here's the part that confuses everyone the first time: nobody was *writing* that much. Orders were trickling in just fine. What drowned the database was reads — product pages, order history, search, dashboards, that reporting job polling every minute. In almost every real web app, reads outnumber writes by ten to one or more, and every one of those reads was standing in line at a single machine. Once the primary spends all its CPU and disk on answering `SELECT`s, the `INSERT`s waiting behind them in the queue start timing out too. Reads killed your writes.

Buying a bigger box delays this by weeks, not years. The actual fix for "one machine can't answer this many questions" is to make full copies of the database whose only job is answering questions. Those copies are read replicas.

## 2. The Analogy — Make the Mechanic Obvious

Think of how a bank works.

The head office keeps the one master ledger. Every deposit and withdrawal in the country must ultimately be written into that ledger first — it's the source of truth. But nobody wants to fly to head office just to check their balance, so the bank runs neighborhood branches. Each branch holds photocopies of the ledger pages, delivered by courier every few minutes.

Every part of the analogy maps:

- Head office's master ledger is the **primary** (also called master or writer) — the only node that accepts changes.
- The neighborhood branches are **read replicas** — full copies whose tellers can look anything up, but who never record transactions themselves.
- The courier run is the **replication stream** — head office mails out every ledger change as it happens.
- The minutes between "recorded at head office" and "delivered to your branch" is **replication lag**.

Now watch the analogy produce the exact problems the technology has. You deposit cash at head office, then walk into your local branch on the way home to check your balance. Today's courier hasn't arrived yet, so the teller shows you yesterday's number. You didn't do anything wrong and neither did the bank — the copy is simply a few minutes behind. That's the read-your-own-writes problem.

The bank's fixes map too. The teller sees on your receipt that you deposited two minutes ago, so she calls head office instead of trusting her photocopy — that's routing reads to the primary after a recent write. For mortgage decisions they *always* phone head office, because stale data there is unacceptable — that's sending critical reads straight to the primary. Modern branches stamp each photocopied page with a sequence number, so a teller can check "has my branch received page 4,712 yet?" before answering you — that's exactly what LSN/GTID checks do.

One last piece. If a clerk at head office accidentally spills ink over a page, the same ruined page arrives by courier at every branch within minutes. Copies copy mistakes faithfully. So branches are great for inspections (you can audit a branch without disturbing head office) but they are not archives — that's why replicas help with backups but are not backups themselves.

## 3. The Full Explanation — How It Actually Works

In plain words: a read replica is a second database server that stays almost perfectly in sync with the primary by replaying every change the primary makes, and that you point read queries at so the primary doesn't have to answer them all.

Here's what actually happens inside. When you run an `UPDATE` on the primary, the primary does two things: it applies the change to its tables, and it appends a description of that change to an ordered log. Postgres calls this log the WAL (write-ahead log); MySQL calls it the binary log (binlog). Each replica holds open a connection to the primary and streams these log entries as they appear, then replays them locally in order. Because "re-apply a change from a log" is cheaper than "serve traffic and generate the change," replicas usually keep up within milliseconds. But nothing guarantees it.

That gap is replication lag, and it spikes for very ordinary reasons: a big migration touches a million rows and generates a mountain of log entries; a heavy analytical query runs on the replica and slows down replay (the applier is effectively serial); network throughput dips; the replica's disk falls behind. Lag is normally invisible. The whole discipline of using replicas well is about the moments when it isn't.

So what can you safely send where? Writes go to the primary — always. A replica is not just discouraged from accepting writes, in most setups it physically cannot accept them while in read-only/standby mode. Reads can go anywhere, and that's the entire payoff: five replicas means roughly six times the read capacity, plus isolation (that nasty reporting query now slows down a replica, not checkout).

But "reads can go anywhere" needs three refinements for correctness.

**Read-your-own-writes.** If a user updates their profile and their next request lands on a replica that hasn't replayed the change yet, they see old data and conclude the save failed. There are three standard fixes, often combined. First, sticky-after-write: once a user performs a write, route that user's reads to the primary for a short grace window (say 30–60 seconds), tracked in a cookie, session store, or Redis entry. Second, explicit critical reads: operations that must see fresh data — anything immediately following a mutation, plus things like auth checks, billing balances, and password verification — always hit the primary regardless of stickiness. Third, position checks: the write response returns a token marking how far the log had progressed (Postgres LSN, MySQL GTID), and before serving the follow-up read you ask the replica "have you replayed past this token?" If yes, serve it; if no, either wait briefly or fall back to the primary. This is precise instead of time-based — no guessing how long lag lasts.

**Routing logic lives somewhere deliberate.** Either the application decides — two connection pools, one to the primary and one to the replicas, with a small helper choosing per query — or a proxy decides transparently between app and databases (ProxySQL for MySQL, pgpool-II or HAProxy patterns for Postgres, and managed reader endpoints like Aurora's, which load-balance across replicas for you). App-level routing costs code but understands business meaning ("this endpoint just wrote"). Proxy-level routing centralizes the policy and every service gets it for free, but the proxy can't know that a GET endpoint is semantically a post-write read, so you end up configuring exceptions anyway. Most teams start app-level, move hot paths behind proxies later.

**Replicas multiply writes, never scale them.** Every write executes fully on the primary *and then again* on every replica. Add four replicas and each insert now happens five times across the cluster, and the primary spends extra effort feeding four streams. Write throughput is still bounded by the primary alone. Replicas scale reads. Scaling writes takes vertical growth of the primary or sharding (splitting data across multiple primaries).

Two operational notes people under-appreciate. First, replicas quietly give you failover: if the primary dies, you promote a replica to be the new primary in seconds-to-minutes, versus however long a restore-from-backup takes. With async replication, promotion may lose the last committed-but-not-yet-shipped transactions. You can shrink that risk with synchronous replication (`synchronous_commit = remote_apply` in Postgres, semi-sync in MySQL), paying slower writes and coupling availability to the replica. Second, backups: running your nightly dump against a replica offloads that heavy I/O from the primary — genuinely useful — but a replica is still not a backup, because replication propagates `DROP TABLE` to every copy as faithfully as it propagates inserts. Recovery-from-mistake needs point-in-time backups (WAL archiving / binlog retention), which let you restore to *before* the mistake. A replica only ever has the mistake.

Security-wise, remember a replica contains 100% of your data. Access controls, TLS on the replication connection, and audit logging apply to replicas with the same seriousness as the primary — reporting teams often get replica access precisely because it's "just a copy," which is exactly how copies leak.

Observability: watch replication lag as a first-class metric. On Postgres, `pg_stat_replication` on the primary shows `replay_lag` per connected standby; `now() - pg_last_xact_replay_timestamp()` on the replica gives the visible delay. On MySQL, `SHOW REPLICA STATUS` reports `Seconds_Behind_Source` plus whether the receiver and applier threads are alive — alert on thread death too, since a stopped replica silently serves increasingly ancient data.

## 4. See It In Practice — Real Code or Queries

First, seeing replication health from SQL. These are the two checks you'll actually run at 2am.

```sql
-- PostgreSQL, run ON THE PRIMARY:
-- one row per connected replica, with how far behind each phase is
SELECT client_addr, state,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication;

-- PostgreSQL, run ON THE REPLICA:
-- how stale the data users see actually is right now
SELECT now() - pg_last_xact_replay_timestamp() AS visible_delay;
```

```sql
-- MySQL 8.0.22+:
-- Receiver/Source_IO... threads show whether sync is alive;
-- Seconds_Behind_Source is the lag
SHOW REPLICA STATUS\G
```

Next, the LSN-based read-your-writes check in Postgres. The idea: the primary tells you *where in the log* your write landed; the replica tells you *how far it has replayed*. Compare the two positions.

```sql
-- After committing a write on the primary, capture the log position:
SELECT pg_current_wal_lsn();
-- e.g. returns 7E/9C2105A8 — hand this back to the client (or stash it server-side)

-- Later, ON THE REPLICA, before serving the read:
SELECT pg_last_wal_replay_lsn() >= '7E/9C2105A8' AS caught_up;
-- caught_up = true  → replica has replayed past your write, safe to serve
-- caught_up = false → wait briefly, retry, or route this read to the primary
```

MySQL has the same trick via GTIDs — on the replica, `SELECT WAIT_FOR_EXECUTED_GTID_SET('<gtid-set>', 1);` blocks up to 1 second until the replica has applied everything in that set, returning 0 on success.

Now the application side: read/write split with sticky reads after a write. Node.js with `pg`, but the shape is identical in any stack (two pools + a chooser):

```ts
import { Pool } from "pg";
import type { Request, Response, NextFunction } from "express";

// Two pools: every write goes through `writer`, most reads go through `reader`.
const writer = new Pool({ connectionString: process.env.PRIMARY_URL });
const reader = new Pool({ connectionString: process.env.REPLICA_URL });

// Grace window: after a user writes, their reads hit the primary for a while,
// so the profile page they visit 2 seconds later shows what they just saved.
// NOTE: an in-process Map only works with one app instance. With N instances,
// store this timestamp in Redis (or a signed cookie) so any instance sees it.
const lastWriteByUser = new Map<string, number>();
const GRACE_MS = 60_000;

export function pickDb(userId: string, isWrite: boolean) {
  if (isWrite) {
    lastWriteByUser.set(userId, Date.now());
    return writer; // writes ALWAYS go to the primary
  }
  const last = lastWriteByUser.get(userId);
  const recentlyWrote = last !== undefined && Date.now() - last < GRACE_MS;
  // Critical reads (auth, billing) should skip this helper entirely and use writer.
  return recentlyWrote ? writer : reader;
}

app.put("/users/me/profile", async (req: Request, res: Response) => {
  await writer.query(
    "UPDATE profiles SET display_name = $1 WHERE id = $2",
    [req.body.displayName, req.user.id]
  );
  res.json({ ok: true });
});

app.get("/users/me/profile", async (req: Request, res: Response) => {
  const db = pickDb(req.user.id, false);
  const { rows } = await db.query(
    "SELECT id, display_name FROM profiles WHERE id = $1",
    [req.user.id]
  );
  res.json(rows[0]);
});
```

One rule hides inside that code and matters more than it looks: never let a transaction span nodes. A transaction that reads on the replica then writes on the primary isn't a transaction — the read part got no locking and no atomicity. Inside an explicit transaction, use the primary pool for everything.

## 5. Interview Questions — All of Them, Done Properly

**Q: What exactly is a read replica?**

A second database server that maintains a near-real-time copy of the primary by continuously replaying the primary's change log, and serves read queries so the primary doesn't have to. Writes always go to the primary; replicas are read-only. The word to say next in an interview is "replication lag," because the honest version of this answer includes the fact that replicas are usually milliseconds behind, not magically identical.

**Q: Why add replicas instead of just upgrading the primary's hardware?**

Vertical scaling hits diminishing returns fast — the next box up costs multiples, not percentages, and there's a ceiling. More importantly, hardware doesn't fix the structural problem: one machine still answers every question, still fails as one unit, and still absorbs your heaviest reporting query. Five cheap-ish replicas give roughly 6x read capacity, isolate heavy analytics from customer traffic, provide a warm standby for failover, and a safe target for backup dumps. Hardware upgrades remain useful *alongside* replicas — the primary still has to handle all writes — but replicas are the lever that scales reads horizontally.

**Q: Walk me through how replication actually works under the hood.**

The primary records every change in an ordered log — WAL in Postgres, binlog in MySQL — as part of committing it. Each replica keeps a connection open to the primary and streams new log entries as they appear, then applies them locally in order. Since applying a logged change is cheaper than generating it under live traffic, replicas trail by milliseconds under normal conditions. In Postgres this is physical streaming replication — block-level changes, byte-for-byte identical copies. MySQL similarly ships binlog events to a receiver thread on the replica which hands them to applier thread(s). Worth knowing: older MySQL applied events serially, so one slow event delayed everything; modern versions support parallel appliers, but a giant single transaction still replays as one unit.

**Q: What is replication lag, and why does it happen even on good hardware?**

Lag is the delay between a change being committed on the primary and being replayed on a replica. It happens because replay competes for the replica's resources: a bulk update on the primary produces a burst of log entries faster than the replica can apply them; a long-running query on the replica conflicts with replay (in Postgres, replay may pause or cancel conflicting queries depending on settings like `max_standby_streaming_delay`); networks throttle; disks saturate. Good hardware makes lag small, not zero — which is why correct applications treat staleness as a design input, not an accident.

**Q: A user updates their profile, refreshes, and sees the old name. What happened and how do you fix it?**

Their update went to the primary, their immediate follow-up read was routed to a replica that hadn't replayed the change yet. Classic read-your-writes violation. Fixes, usually layered: route that user's reads to the primary for a short grace period after any write (sticky sessions backed by cookie/Redis); always send semantically-critical reads — post-write fetches, auth, billing — to the primary; or use a position token: capture the write's LSN/GTID, and on the next read have the replica confirm it has replayed past that position, else wait or fall back to the primary. The third option is the strongest because it measures catch-up instead of guessing a timeout.

**Q: Where should read/write routing live — application code or a proxy layer?**

App-level: two pools and a small chooser function. Pros: testable, explicit, understands business semantics ("this GET follows a write"), no extra hop. Cons: every service reimplements it, and it's easy for one new developer to bypass. Proxy-level (ProxySQL, pgpool-II, managed reader endpoints): policy lives in one place, apps connect without knowing the topology. Cons: another moving part to operate, and it routes on syntax, not intent — it can't tell that `/reports/latest` is semantically a post-write read, so you configure exceptions anyway. Honest answer: start in the app where semantics live, adopt a proxy when the number of services makes central policy worth its operational cost.

**Q: Are replicas a substitute for backups?**

No, and saying otherwise in an interview is disqualifying. Replication faithfully copies everything — including the bad deploy that dropped a table or deleted rows. Within seconds, every replica holds the same damage. A backup restores you to a chosen earlier moment (point-in-time recovery via WAL archiving or retained binlogs); a replica only ever mirrors the present, damaged state. What replicas legitimately contribute: you can take your dumps *from* a replica, sparing the primary the I/O storm, and a healthy lagging replica can sometimes save you from instant logical corruption (pause or promote it before it replays the fatal statement) — but that's luck and quick reflexes, not a backup strategy.

**Q: Do read replicas scale writes?**

No — the opposite, slightly. Every write runs fully on the primary and then again on each replica, and the primary spends resources streaming logs to all of them. Four replicas mean each commit happens five times cluster-wide. Total write throughput remains capped by the single primary. Replicas scale reads; scaling writes requires a bigger primary or sharding — splitting data across multiple primaries so different machines accept writes for different slices. Say that sentence in an interview and it separates you from most candidates.

**Q: How do you monitor replication in production?**

Track three signals. One, lag: Postgres `pg_stat_replication.replay_lag` on the primary, or `now() - pg_last_xact_replay_timestamp()` on the replica; MySQL `Seconds_Behind_Source`. Alert when it exceeds your staleness budget (say, 10 seconds). Two, aliveness: MySQL's receiver/applier thread status, Postgres's presence of the standby row in `pg_stat_replication` — a dead replication link means the replica serves ever-staler data while looking perfectly green to request monitors. Three, user-visible staleness in the app itself: some teams ping a canary write/read pair and measure round-trip consistency. Also watch disk on the primary — if a replica dies and the primary retains WAL/binlog waiting for it, the primary can fill its disk and take everything down.

**Q: What's the difference between synchronous and asynchronous replication here?**

Default everywhere is asynchronous: the primary commits without waiting, giving fast writes and possible brief divergence (and possible loss of the newest commits if you fail over mid-stream). Synchronous variants make the primary wait for the replica: Postgres `synchronous_commit` levels up to `remote_apply`, MySQL semi-sync waits for at least one replica to receive the event. You gain much tighter consistency and safer failover; you pay slower writes and a coupling problem — if the only synced replica goes down, either writes stall or you degrade back to async under pressure. Read-replica architectures almost always stay async and solve freshness at the read-routing layer instead, which is exactly why LSN/GTID checks exist.

## 6. The Traps — What Goes Wrong in Production

**Trap: "I updated it, so the next read shows my update."** The wrong assumption is that the database returning data means the data reflects all prior commits. Why it's wrong: with async replication, "committed" and "visible on every node" are different moments. What actually happens: the user saves, the GET hits a replica missing the last few hundred milliseconds of history, the UI shows old data, and you get a ticket saying saving is broken — worse, in flows like password-change-then-login, users get locked out thinking credentials failed. The fix: grace-window stickiness after writes, critical reads pinned to the primary, and LSN/GTID confirmation when you need certainty rather than a timer.

**Trap: treating replicas as backups.** The wrong assumption is "the data exists in five places, we're safe." Why it's wrong: all five places receive identical changes, including the destructive ones — replication is indiscriminate about intent. What actually happens: a bad migration deletes rows on the primary, propagation completes within seconds, and every copy agrees on the wrong reality. The fix: keep true point-in-time recovery (WAL archiving / binlog retention + periodic base backups), test restores, and use replicas as a low-impact source for taking those backups — not as the backups.

**Trap: assuming adding replicas relieves write pressure.** The wrong assumption is "more machines = more capacity overall." Why it's wrong: replicas add read capacity only; each one adds work to every write path and to the primary's outbound streaming. What actually happens: the team piles on replicas during a write-latency incident and latency gets marginally *worse*, because the primary now feeds eight subscribers while still executing every commit itself. The fix: diagnose write pain separately — slow queries, indexes, lock contention, batch sizes — and reach for sharding or a beefier primary when writes genuinely exceed one machine.

**Trap: letting a heavy reporting query loose on a replica and wondering why lag exploded.** The wrong assumption is that replicas are free compute for anything. Why it's wrong: replay on the replica competes with your queries for the same CPU/disk, and big scans can force replay to pause (or get cancelled) while they hold snapshots. What actually happens: lag climbs to minutes during business hours, every sticky/critical-read workaround starts firing constantly, and the "read scaling" you bought evaporates. The fix: dedicated reporting replica with tuned conflict settings, off-peak schedules for heavy jobs, and lag alerts wired to auto-investigation, not just graphs.

**Trap: pinning reads to the primary "for safety" everywhere.** The wrong assumption is the inverse overcorrection — if lag is scary, just read from the primary. Why it's wrong: that recreates the original overload that made you add replicas, now with extra code. What actually happens: replicas idle at 10% utilization while the primary melts again, and nobody remembers which endpoints were pinned and why. The fix: default reads to replicas, escalate deliberately (stickiness windows, critical-read lists, position checks), and review pinned reads periodically — many outlive the reason they were created.

## 7. Compare With Related Concepts

**Read replica vs replication generally.** Replication is the mechanism — copying changes from one database to others. A read replica is one *use* of that mechanism: a copy dedicated to serving reads. The same mechanism also builds hot standbys (a copy kept solely to take over if the primary dies, often synchronous) and geo-replicas (copies placed near users). Rule of thumb: replication is the plumbing; a read replica is what you call the copy when its day job is answering SELECTs.

**Read replicas vs sharding.** Replicas copy the *whole* dataset onto more machines to spread read load; shards *split* the dataset across machines so each one owns and writes a slice. Five replicas each hold every row; five shards hold one-fifth each. Rule of thumb: drowning in reads → replicas; drowning in writes or data size → sharding — and note sharded systems commonly also replicate each shard for safety.

**Read replica vs cache (Redis/app-level caching).** Both serve reads without touching the primary, but a cache stores selected hot results and is allowed to miss, expire, or be flushed; a replica stores the entire database and speaks full SQL. Cache misses fall back to the database; a replica being behind is a correctness issue, not a performance hiccup. Rule of thumb: cache a handful of expensive, frequently-identical queries; use replicas when the read volume is broad and varied enough that only a second full engine absorbs it.

## 8. 🧠 The Memory Hook

A read replica is the bank branch holding courier-delivered photocopies of head office's ledger: perfect for everyone who's just looking, a lie for the person who deposited five minutes ago. Copies scale looking, never recording — every copy still records everything — and because copies copy your mistakes just as faithfully, they are never your archive.
