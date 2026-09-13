# How Will You Process 1 Million Records Efficiently

## 1. The Real-World Problem — When You Actually Hit This

Your app has been live for a year. One night you need to backfill a new field for every user, send a re-engagement email to everyone who hasn't logged in for 90 days, or export a CSV for finance. You write the obvious code: `const users = await db.users.findAll()` and loop. It worked with 2,000 test rows.

With 1.2 million rows in production, the same code never finishes. The Node process hits 1.5 GB and gets killed by OOM. The Postgres connection sits open for four minutes and times out. The API gateway returns 504. You restart the job and it starts from zero again, re-sending 400,000 emails it already sent. While your big transaction is running, other users see slow orders because you are holding locks on the same table. Your on-call dashboard shows no progress — just a stuck job and angry Slack messages.

This is the exact moment every senior engineer learns: you cannot treat 1 million records like a big array. You need a way to move through the data in small, safe, observable pieces without blowing memory, without locking everyone else out, and without losing your place if something crashes.

## 2. The Analogy — Make the Mechanic Obvious

Think of a warehouse with 1 million books that need to be stamped and moved to a new building.

If you try to load all 1 million books onto one truck, the truck collapses. That is `SELECT *` into memory. Memory is the truck bed. It has a hard limit.

Instead, you use three ideas that map directly to the backend mechanics.

The manifest with bookmarks is pagination. You don't say "give me books 500,001 to 501,000" by counting from the start every time — that is offset pagination, like recounting all previous boxes to find the next one. You put a bookmark at the last book you stamped: "continue after book ID 500,000." That is cursor pagination. The bookmark never moves even if someone adds books while you work.

The conveyor belt is streaming. Instead of stacking books in a pile and then stamping, you put them on a moving belt. One book arrives, you stamp it, it leaves. Only a few books are on the belt at once. That is how a readable stream works — little memory, steady flow.

The loading dock with workers and clipboards is the queue. You don't make the person who requested the move stand and wait for 1 million books. You hand the job to the dock manager. He breaks it into small carts — batches — and assigns each cart to a worker. Each cart is a transaction: stamp 1,000 books, mark them done, go back for the next cart. If a cart tips over, only that cart is redone, not the whole warehouse. The clipboard is observability — how many carts done, how many failed. If the stamping table gets full and yells "stop sending," that pause signal is backpressure.

And the card catalog is the index. Without it, finding the next batch means walking every shelf to find the next book. With it, you walk straight to the right aisle.

## 3. The Full Explanation — How It Actually Works

Processing 1 million records is not a query problem. It is a flow control problem. You are controlling how data moves from storage through your app without breaking memory, locks, time, or correctness.

Start with what fails when you load everything at once. Node keeps every row as a JavaScript object. 1 million rows at even 1 KB each is a gigabyte before overhead, plus the database driver buffer, plus V8 overhead — you are well past typical 512 MB to 2 GB container limits. The garbage collector thrashes, the event loop stalls, and the process gets OOM-killed. On the database side, one long statement holds a connection from the pool for minutes. Other requests queue. If you wrapped it in one transaction, you hold locks for minutes and block writes. If that transaction rolls back, you lost all work.

So you chunk the work. Everything below is how to chunk safely.

Batching means you touch rows in small groups — 500, 1,000, 2,000 at a time — and finish each group completely before starting the next. The right batch size balances round-trips against lock time and retry cost. Tiny batches mean many round-trips and slow throughput. Huge batches mean long locks and painful retries when one batch fails. For Postgres or MySQL, 500 to 2,000 is a common sweet spot for row updates, and you tune it with timing, not guessing.

Pagination is how you get the next batch. Offset pagination — `LIMIT 1000 OFFSET 500000` — gets slower the further you go because the database still scans and discards 500,000 rows. It also skips or duplicates rows if someone inserts or deletes while you paginate. Cursor pagination — `WHERE id > last_id ORDER BY id LIMIT 1000` or `WHERE (created_at, id) > (?, ?)` — stays fast because it seeks directly using an index. It is stable across inserts. You need an index on the cursor column or you are back to scanning.

Streaming is batching without ever holding the whole result. Instead of asking for 1,000 rows, waiting, asking for 1,000 more, you open a cursor or a readable stream and the database pushes rows in chunks. Your code handles `data` events one chunk at a time. Memory stays flat because you only hold what you are currently processing, plus a small buffer. Streaming shines for exports, CSV generation, and ETL where you transform and write somewhere else row by row. It needs backpressure handling, otherwise you buffer faster than you can write.

A queue makes the job durable and asynchronous. You never run a 1 million record job inside an HTTP request. The request has a 30 second timeout and the user is not going to wait. You enqueue a job — "backfill users" — and a worker process picks it up. The queue splits it into child jobs, each handling one batch. Queues like BullMQ, SQS, or Cloud Tasks give you retries, dead-letter handling for poison records, concurrency control, and persistence across restarts. If the pod crashes at record 743,000, the queue knows which child jobs finished and resumes from there. The HTTP path just returns `202 Accepted` with a job ID the frontend can poll.

Transaction chunking is the correctness rule inside each batch. Each batch gets its own short transaction — update 1,000 rows, commit, move on. Short transactions hold locks for milliseconds, not minutes, and a failure rolls back only that batch. You also make each batch idempotent, so retrying it is safe. That usually means tracking progress in a side table — `UPDATE users SET migrated=true WHERE id BETWEEN ? AND ?` — or writing the last cursor to durable storage after each commit. Never wrap the whole 1 million in one transaction unless you can prove the failure cost is acceptable. In most production systems that means you never do.

Backpressure is the pause button between a fast producer and a slow consumer. If your database can push 50,000 rows per second but your email service can send 500 per second, those unread rows pile up in memory until you OOM. Backpressure means the consumer tells the producer "I am full, wait." In Node streams, `readable.pipe(writable)` does this automatically — `write()` returns false and the readable stops until `drain`. If you are hand-rolling a loop, you `await` each batch write before fetching the next. In queues, you set concurrency limits and prefetch counts. Without it, streaming is just a slower way to OOM.

Indexes are what keep the whole pipeline from crawling. Every batch query must hit an index on the filter and the order column. `WHERE migrated = false ORDER BY id LIMIT 1000` without an index on `(migrated, id)` will seq-scan 1 million rows for every batch. Filter on an indexed high-cardinality cursor first — `WHERE id > ?` with an index on `id` is a seek, not a scan. For updates, the `WHERE id IN (...)` also benefits from the primary key index. After you add an index, check `EXPLAIN` to confirm an Index Scan or seek, not a Sequential Scan.

Observability is how you know it is working and how you recover when it is not. Long jobs run blind without metrics. You need progress — records processed, batches completed, percent done — logged as structured JSON with a job ID, not just `console.log("done")`. You need a row count or `COUNT(*) FILTER` for total, a gauge for current cursor, a counter for retries, and histograms for batch latency. You need a heartbeat or lease so you can detect a stalled worker, and an idempotency marker so restarts don't double-process. Alert on error rate, not just failure. In production, the scariest outcome is not a crash — it is a silent half-finished job that reports success.

Put together, the safe shape is this: HTTP triggers a job and returns 202. A durable queue fans out cursor-paginated batches of 1,000 from an indexed column. Each batch runs inside its own short transaction, streams rows without buffering the whole table, respects backpressure, marks progress durably, and retries idempotently. Metrics and logs expose progress so you can watch, pause, and resume.

## 4. See It In Practice — Real Code or Queries

These examples are intentionally production-shaped, not toy loops. Pick the slice that fits your stack.

The naive version that crashes — and why you avoid it:

```js
// BAD — loads everything into memory, holds one connection for minutes
// Node OOMs around 500k-1M rows; HTTP times out; one rollback loses all work
app.post('/backfill', async (req, res) => {
  const users = await db.query('SELECT * FROM users'); // 1.2M rows into RAM
  for (const u of users) {
    await processUser(u); // held transaction, no backpressure
  }
  res.send('done');
});
```

Cursor-paginated batching with transaction per chunk and resumable progress. This is the default safe pattern for updates:

```js
import { pool } from './db.js';

// requires: CREATE INDEX ON users(id) — usually the PK, and ON users(migrated)
// caller enqueues this, it does not run inside the HTTP request
export async function backfillUsers({ batchSize = 1000 } = {}) {
  let lastId = 0; // cursor — last processed PK, persisted after each commit
  let totalDone = 0;

  while (true) {
    // fetch next batch via indexed seek, not OFFSET
    const { rows } = await pool.query(
      `SELECT id, email, migrated
       FROM users
       WHERE id > $1
       ORDER BY id
       LIMIT $2`,
      [lastId, batchSize]
    );
    if (rows.length === 0) break;

    // short transaction per batch — locks released quickly
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        // make it idempotent — skip if already migrated
        if (row.migrated) continue;
        await client.query(
          `UPDATE users SET migrated = true, updated_at = now() WHERE id = $1`,
          [row.id]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      // log with job context so you can retry this batch only
      console.error(JSON.stringify({ msg: 'batch_failed', lastId, err: e.message }));
      throw e;
    } finally {
      client.release();
    }

    lastId = rows[rows.length - 1].id;
    totalDone += rows.length;

    // observability — cheap and durable
    console.log(JSON.stringify({ msg: 'batch_done', lastId, totalDone }));
    // also persist lastId to a job table/redis so a crash resumes here
    await saveCheckpoint({ jobId: 'backfill-2026-08', lastId, totalDone });

    // backpressure-friendly: we awaited the batch commit before fetching next
  }
}
```

Streaming for read-transform-write without holding 1M rows, with real backpressure via pipe. Good for exports and ETL:

```js
import { pipeline } from 'node:stream/promises';
import QueryStream from 'pg-query-stream';
import { Transform } from 'node:stream';

// producer: database cursor as a readable stream — rows flow in 1k chunks
async function exportUsersToCSV(writeStream) {
  const client = await pool.connect();
  try {
    const qs = new QueryStream(
      `SELECT id, email, created_at FROM users ORDER BY id`,
      [],
      { batchSize: 1000 } // driver fetches 1k at a time behind the stream
    );
    const dbStream = client.query(qs);

    const toCSV = new Transform({
      objectMode: true,
      transform(row, _enc, cb) {
        // row-by-row transform — never hold all rows
        cb(null, `${row.id},${row.email},${row.created_at.toISOString()}\n`);
      }
    });

    // pipe handles backpressure: if CSV write is slow, dbStream pauses automatically
    await pipeline(dbStream, toCSV, writeStream);
  } finally {
    client.release();
  }
}

// also check the plan — you want an Index Scan on ORDER BY id, not a sort
// EXPLAIN SELECT id FROM users ORDER BY id LIMIT 1000;
```

Queue-based fan-out for HTTP-triggered work. The request never waits for 1M rows:

```js
import { Queue, Worker } from 'bullmq';

const backfillQueue = new Queue('backfill', { connection: redis });

// HTTP handler — enqueue and return immediately
app.post('/admin/backfill', async (req, res) => {
  const job = await backfillQueue.add('backfill-users', { batchSize: 1000 }, {
    jobId: `backfill-${Date.now()}`, // idempotent job key
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100
  });
  res.status(202).json({ jobId: job.id, status: 'queued' });
  // frontend polls GET /admin/backfill/:jobId which reads BullMQ job state + checkpoint
});

// worker — concurrency controls backpressure and DB load
new Worker('backfill', async (job) => {
  // reuse the cursor-pagination function above, but now with retries and concurrency limits
  await backfillUsers({ batchSize: job.data.batchSize });
}, { connection: redis, concurrency: 2 }); // 2 batches at a time, tune with DB pool size
```

Python/FastAPI variant — same shape, different runtime:

```python
from fastapi import BackgroundTasks
import asyncpg

# HTTP returns fast; real work runs in background and checkpoints to a table
async def backfill_batch(pool: asyncpg.Pool, last_id: int, batch_size: int = 1000) -> int:
    rows = await pool.fetch(
        "SELECT id FROM users WHERE id > $1 ORDER BY id LIMIT $2",
        last_id, batch_size
    )
    if not rows:
        return last_id
    # transaction per batch — asyncpg transaction context
    async with pool.acquire() as conn:
        async with conn.transaction():
            ids = [r["id"] for r in rows]
            await conn.execute(
                "UPDATE users SET migrated = true WHERE id = ANY($1::bigint[])",
                ids
            )
    return rows[-1]["id"]
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Why can't you just do `SELECT *` and loop over 1 million rows?**

Three reasons, all hard limits. Memory — every row becomes a JS object and sits in RAM at once, so 1M rows easily exceeds container memory and triggers OOM. Time — one request holding a connection for minutes will hit HTTP, proxy, and statement timeouts. Correctness — one long transaction holds locks and a single error rolls back everything with no way to resume. The senior answer is not "it is slow" — it is memory, lock duration, and lack of resumability.

**Q: Offset vs cursor pagination — which one for 1M records and why?**

Use cursor pagination (`WHERE id > $lastId ORDER BY id LIMIT n`) for large scans. Offset pagination scans and discards all prior rows every page, so `OFFSET 500000` is dramatically slower than `OFFSET 1000` and gets slower as you go. It also duplicates or skips rows if inserts or deletes happen mid-run. Cursor pagination does an index seek to the bookmark and stays equally fast on page 1 and page 500. It requires a stable, indexed, monotonic column — usually `id` or `(created_at, id)` — and you must always include `ORDER BY` to make the cursor deterministic.

**Q: How do you choose a batch size?**

Start at 1,000 and tune with real numbers. Measure batch latency, lock wait time, and failure cost. If batches take 200 ms and your database handles it comfortably, you can try 2,000. If you see lock waits or statement timeouts, go smaller. Consider what the batch does — a simple `UPDATE` per row tolerates bigger batches than calling an external email API per row where throughput is limited. Also consider pool size and queue concurrency: `batchSize * concurrency` is your in-flight pressure on the database.

**Q: How do you keep it from holding locks for a long time?**

One short transaction per batch, then commit. Never one transaction for the whole million. Each batch's `BEGIN` to `COMMIT` touches at most 1,000 rows, holds row-level locks for milliseconds, and releases them before the next batch. If a batch fails, only that batch rolls back. You also avoid `SELECT FOR UPDATE` across batches and keep transaction isolation at the default `READ COMMITTED` unless you have a specific reason to raise it.

**Q: What is backpressure and how do you handle it in this job?**

Backpressure is the consumer saying "slow down, I am full." It happens when the database can produce rows faster than you can transform, write, or send them. Without handling, the unread rows buffer in Node memory until you OOM. In streams, you get it for free with `pipeline`/`pipe` — `write()` returns false and the readable pauses until `drain`. In manual loops, you handle it by awaiting each batch's side effects before fetching the next — don't fire 1,000 `fetchNextBatch()` calls concurrently. In queues, you set concurrency and prefetch so only N batches are in flight.

**Q: Do I need an index for this to be fast?**

Yes, and it is the first thing to check. Cursor pagination must have an index on the cursor column. `WHERE id > $1 ORDER BY id` uses the primary key index — that is a seek. `WHERE migrated = false ORDER BY id` needs a composite index on `(migrated, id)` or it will seq-scan. For updates, `WHERE id = $1` uses the PK. Run `EXPLAIN` after you write the query. Look for `Index Scan` or `Index Only Scan`. If you see `Seq Scan` on a 1M row table inside a per-batch loop, that is your bottleneck regardless of batch size.

**Q: What happens if the job crashes halfway?**

Nothing durable is lost if you designed for resume. You persist the last successful cursor after each committed batch — in a job table, in Redis, or as the queue child's completion marker. On restart, you read the checkpoint and continue from `WHERE id > checkpoint`. Because each batch is committed and idempotent — reprocessing the same batch twice has the same effect — you can retry safely. Without a checkpoint and idempotency, a crash means starting over and double-processing records, which is how users get duplicate emails or double charges.

**Q: Why use a queue instead of just running the batches in the API handler?**

An HTTP request is the wrong lifetime for a long job. Proxies and load balancers time out after 30 to 60 seconds. The user's browser gives up. Auto-scaling can kill the pod. A queue gives you durability — the job survives restarts — plus retries with backoff, dead-letter queues for poison rows, rate limiting, concurrency caps, and visibility into progress. The HTTP handler's job is just to validate, enqueue, and return 202 with a job ID. A separate worker owns the slow, retryable work.

**Q: How do you make this observable and safe to operate?**

Three layers. Structure — log JSON with `jobId`, `lastId`, `batchSize`, `duration_ms` after every batch, plus counters for processed, succeeded, and failed. Metrics — expose a gauge for current cursor and counters for retries and dead-lettered records to Prometheus, and a progress endpoint the frontend can poll. Guardrails — set statement timeouts per batch, pool timeouts, and a lease or heartbeat so a stalled worker is detected and retried. Without this, the most common production failure is not a crash but a job that silently processed 60% and reported success.

## 6. The Traps — What Goes Wrong in Production

The most common mistake is using `OFFSET` for a large job because it worked in local dev with 500 rows. With 1M rows, each later page pays the cost of scanning all prior rows. The page that fetches `OFFSET 900000` can take seconds and hold a connection that whole time. Switch to cursor pagination on an indexed column and measure with `EXPLAIN`. The performance wall at large offsets surprises people who think `LIMIT` makes any query cheap.

Forgetting to persist progress is the next trap. A loop that keeps `lastId` only in a local variable restarts from zero when the pod restarts or the process is killed. You redo 400,000 records and create duplicate side effects. Always write the checkpoint durably after each commit — update a `job_checkpoints` row or store the cursor in Redis — and make each batch idempotent so replaying it is harmless.

Opening one big transaction around the whole million is a classic backend mistake. It feels safer because "all or nothing" sounds correct, but it holds locks for minutes, bloats `pg_wal` or undo logs, risks statement timeouts, and means one bad row rolls back an hour of work. Use one short transaction per batch. If you truly need all-or-nothing semantics for 1M rows, that is a design smell — rethink the requirement, because no real system can hold that transaction open under load.

Ignoring backpressure looks like success until memory climbs. A common Node pattern is `rows.forEach(r => queue.add(() => sendEmail(r)))` without awaiting — it enqueues 1M tasks instantly and blows the heap. Or reading from a database stream without piping through a backpressure-aware writable. Always `await` the consumer, use `pipeline`, or cap concurrency. If you are not sure you handle backpressure, watch heap usage under load — a steady sawtooth is normal, a steady climb is the leak.

Skipping the index is invisible with small data and catastrophic with large. Your staging table with 10,000 rows returns cursor pages in 5 ms without an index, so you ship it. In production with 1M, the same queries take 300 ms and the job never catches up. Create the index before the job runs, and keep writes in mind — an extra index slows writes a little, so index the cursor you scan on and drop temporary job-specific indexes after.

Making the side effect non-idempotent creates double-processing on retry. If each row triggers `sendEmail(user.email)` and the email service times out but actually sent, a retry sends two emails. Guard every side effect with an idempotency key: store `processed_email[userId]` in the same transaction as the row update, or use the email provider's idempotency key header. Queues retry by design — if retries are not safe, retries are a bug.

Treating N+1 as acceptable inside the batch — fetching 1,000 IDs then looping `SELECT * FROM orders WHERE user_id = ?` per user — turns 1,000 batches into 1M queries. Inside each batch, batch your reads too: `SELECT * FROM orders WHERE user_id = ANY($1)`. The same N+1 that hurts a single request kills a bulk job proportionally.

## 7. Compare With Related Concepts

**Batching vs streaming.** Batching pulls a known chunk, processes it, then asks for the next. Streaming opens a continuous flow and handles rows as they arrive. Use batching when each chunk needs a transaction boundary or you want explicit retry per chunk. Use streaming when you are transforming and piping data somewhere else — file export, ETL to another store, CSV generation — and you want minimal memory with automatic backpressure. A job that updates rows in place is usually batching. A job that reads and writes to S3 is usually streaming.

**Cursor pagination vs offset pagination.** Offset says "skip N rows." Cursor says "continue after this value." Offset is fine for page 1 to 20 of a UI where N is small. It is the wrong choice for scanning 1M rows because its cost grows with N and it is unstable under writes. Cursor pagination needs a stable order and an index, but it stays O(log n) per batch and is stable. Rule: if a human is paging, offset is tolerable for small pages. If a job is scanning, always use cursor.

**Queue vs direct batch loop.** A direct loop — `while (hasMore) { fetchBatch; process }` — works for one-off scripts you run locally and watch. A queue is for anything triggered by HTTP, needs retries, survives restarts, or runs longer than a request timeout. If the work must finish even if the HTTP pod restarts, use a queue. If it is a manual migration you run from a screened shell with a checkpoint file, a loop with durable checkpoints is enough.

**Transaction per batch vs one big transaction.** Per batch commits progress incrementally, releases locks early, and limits rollback scope to 1,000 rows. One big transaction gives atomicity for all 1M — either everything migrates or nothing does — but at the cost of long locks, large WAL, and miserable recovery. Rule: use per-batch transactions for operational jobs. Reserve single giant transactions for rare migrations where partial state is truly worse than a long outage, and even then pair it with a maintenance window.

**Inline processing vs background worker pool.** Inline means the same process that received the request does the work. It blocks the event loop, starves the connection pool, and couples request latency to job length. A worker pool separates concerns: web pods handle requests, worker pods handle bulk CPU and I/O with independent scaling and pool sizes. Rule: if it touches 1M rows, it is not web-tier work. Put it on workers.

## 8. 🧠 The Memory Hook

One million records never belongs in one truck. Put a bookmark on an indexed column, move one cart at a time, commit each cart before grabbing the next, let the belt pause when the table is full, and write down where you stopped. Bookmark, cart, commit, pause, checkpoint — that is the whole trick.
