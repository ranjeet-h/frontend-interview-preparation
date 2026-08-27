# How Will You Handle Large Reports

## 1. The Real-World Problem — When You Actually Hit This

It works perfectly in dev. You have 500 rows, the user clicks "Export to CSV," your API runs `SELECT * FROM orders`, builds a big array, turns it into a CSV string, and sends it back. Takes 400ms. Everyone is happy.

Then you ship it. Six months later you have 8 million orders. A finance user clicks "Export this year's sales report." Your API tries to load all 2 million matching rows into memory, convert them to CSV in one go, and hold the HTTP connection open.

What happens is ugly. The Node process hits 1.5 GB and dies with an out-of-memory crash. Or it doesn't crash but the database query holds a connection for 45 seconds while other requests pile up. The load balancer times out the request at 30 seconds and the user sees a blank error. They click Export again. And again. Now you have three giant queries running at once, all holding memory and DB connections. The whole API gets slow for everyone. This is not a report bug — it is an architecture bug. You tried to do minutes of work inside a single HTTP request.

Senior engineers don't fix this with a bigger server. They move the work out of the request entirely.

## 2. The Analogy — Make the Mechanic Obvious

Think of a busy print shop.

If you walk in and ask for one photocopy, the person at the counter makes it while you wait. That is a small report — a normal paginated API call. Sync is fine.

Now you walk in and ask for 10,000 bound booklets. If the shop tried to print them while you stood at the counter, nobody else could be served, the counter would be blocked, and you'd be standing there for hours. No print shop works like that.

Instead, they do this: they take your order, write a ticket number, say "we'll text you when it's ready," and send the job to the back room where big printers work through a queue one job at a time. They don't hold all 10,000 booklets on the counter at once — they print in stacks and box them as they go so the table doesn't collapse. They keep your finished box in a locker and give you a pickup code that expires in a day. You can call and ask "is my order ready?" or wait for the text.

That is exactly the large-report pattern:

The counter is your API. The ticket is a report job row in the database. The back room is a background worker queue like BullMQ or SQS. Printing in stacks without piling everything on the table is streaming the CSV row by row. Boxing and putting it in a locker is uploading to S3. The pickup code is a presigned URL. Calling to ask "is it ready?" is polling the job status. Getting a text is a webhook.

Once you see that, sync versus async stops being abstract. Sync is "make them wait at the counter." Async is "give them a ticket and let the back room do the work."

## 3. The Full Explanation — How It Actually Works

There are two different ways to handle reports, and picking the wrong one is what causes the outage above.

Sync generation means everything happens inside the single HTTP request that asked for it. The browser waits. The server holds memory, holds a DB connection, and holds the event loop. If anything takes more than the timeout window — usually 30 to 60 seconds — the connection drops but the work often keeps running and wasting resources. Sync only works when the result is small and fast, under a few thousand rows and under a couple seconds.

Async generation means the API only starts the job and returns immediately. A background worker does the heavy work, writes the file somewhere durable, and the user downloads it later. The HTTP request stays fast no matter how big the report is.

Here is how the async flow actually works, piece by piece:

You take the request and make a job. When the user hits `POST /reports/sales`, you don't run the query. You validate the filters, check that the user is allowed to see this data and only this tenant's data, create a row like `report_jobs(id, user_id, status: 'pending', filters, created_at)`, push a message with that job id into a queue, and return `202 Accepted` with `{ jobId, status: "pending" }`. The 202 is important — it tells the client "I accepted it, it's not done yet."

The queue is the traffic controller. Without it, ten users clicking Export at once would launch ten huge queries at the same time and crush the database. With a queue, you set concurrency — say two report workers at a time — and the rest wait their turn. If a worker crashes mid-report, the queue retries the job. You also make the job idempotent: if the user double-clicks Export, you either return the same pending job or check a unique key so you don't create duplicates.

The worker does not load everything into memory. This is where streaming matters. Instead of `const rows = await db.query("SELECT * ...")` which pulls millions of rows into one giant array, the worker opens a cursor or paginated stream. For SQL that is `CURSOR` or `LIMIT/OFFSET` in batches of 1,000 to 5,000, or better, keyset pagination with `WHERE id > lastId`. For MongoDB that is `.find().cursor()`. Each batch comes in, gets formatted into CSV lines, and is piped straight to S3 without ever holding the whole file in memory. In Node this is literally `queryStream.pipe(csvTransform).pipe(s3UploadStream)`. Memory stays flat at maybe 50 to 100 MB whether the file is 10 MB or 2 GB.

On S3 you write to a private bucket, not a public one. The file name includes the job id and tenant id, never just a guessable path. When the upload finishes, the worker updates the job row to `status: 'ready'` with `s3_key` and `expires_at`.

Pre-aggregation is a separate optimization for reports people run over and over. If every finance report is "total sales per day per product for the last year," you don't scan 8 million order rows every time. You run a nightly job that aggregates into a small table like `daily_sales_summary(day, product_id, total_amount, order_count)`. Then the report query reads a few hundred summary rows instead of millions. You pay with a little staleness — the summary is up to last night — but you gain a 100x speedup. For real-time correctness you can union the summary with today's live rows.

Caching is the layer on top. If someone just generated the same report with the same filters, and the underlying data hasn't changed much, you can return the same S3 file for a short window instead of rebuilding it. Cache key is a hash of the filters plus tenant id plus a time bucket. Keep the TTL short for financial data, longer for analytics.

The user needs to know when it's done. Two options. Polling is the simplest: the frontend calls `GET /reports/:jobId` every 3 to 5 seconds, the API reads the job row and returns `{ status: "processing", progress: 42 }` or `{ status: "ready", downloadUrl: "https://...signed..." }`. Update progress every few thousand rows so the UI can show a bar. Webhook or WebSocket is nicer for long jobs: when the job flips to ready, you POST to the client's webhook URL or push via WebSocket. Most teams ship polling first, add webhook later. Either way, don't make the user keep the browser tab open.

The download itself is a presigned URL. The API generates `s3.getSignedUrl("getObject", { Key, Expires: 3600 })` and returns it. The browser then downloads directly from S3, so your API doesn't proxy a 2 GB file. The URL expires in an hour, and you still check on every request that the user who owns the job is the one asking.

Around all of this you need observability and safety. Every log line carries the `jobId` and `userId` so you can trace one report's life. You time the query, the transform, and the upload separately. You alert if jobs stay in `processing` for more than, say, 10 minutes or if the queue depth spikes. You enforce row-level auth in the query itself — `WHERE tenant_id = $1` — not just in the API layer, so a bug can't leak another tenant's orders into a CSV. And you clean up: a daily sweeper deletes S3 files older than 7 days and marks expired jobs.

## 4. See It In Practice — Real Code or Queries

These examples are Node/Express with BullMQ and AWS S3. The same pattern ports to Python/FastAPI with Celery or RQ.

Start the job. Return fast, do no heavy work here.

```js
// POST /reports/sales  -> 202 Accepted
import { Queue } from 'bullmq';
import { db } from './db.js';

const reportQueue = new Queue('reports', { connection: { host: 'localhost', port: 6379 } });

app.post('/reports/sales', async (req, res) => {
  const userId = req.user.id; // from auth middleware
  const tenantId = req.user.tenantId;
  const { from, to, productId } = req.body;

  // 1. validate and authorize
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  // 2. idempotency: same user + same filters within 5 mins -> return existing job
  const idempotencyKey = hash({ userId, tenantId, from, to, productId });
  const existing = await db.query(
    `SELECT id, status FROM report_jobs WHERE idempotency_key = $1 AND created_at > now() - interval '5 minutes'`,
    [idempotencyKey]
  );
  if (existing.rows[0]?.status === 'pending' || existing.rows[0]?.status === 'processing') {
    return res.status(202).json({ jobId: existing.rows[0].id, status: existing.rows[0].status });
  }

  // 3. create job row
  const { rows } = await db.query(
    `INSERT INTO report_jobs (tenant_id, user_id, type, status, filters, idempotency_key)
     VALUES ($1,$2,'sales','pending',$3,$4) RETURNING id`,
    [tenantId, userId, JSON.stringify({ from, to, productId }), idempotencyKey]
  );
  const jobId = rows[0].id;

  // 4. push to queue and return immediately
  await reportQueue.add('sales-report', { jobId, tenantId, filters: { from, to, productId } });

  res.status(202).json({ jobId, status: 'pending' });
});
```

The worker streams. No big array, no OOM. Memory stays flat even for millions of rows.

```js
// worker.js - runs in a separate process / container
import { Worker } from 'bullmq';
import { db } from './db.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { PassThrough } from 'node:stream';
import { stringify } from 'csv-stringify';

const s3 = new S3Client({ region: 'us-east-1' });

const worker = new Worker('reports', async (job) => {
  const { jobId, tenantId, filters } = job.data;

  await db.query(`UPDATE report_jobs SET status='processing', started_at=now() WHERE id=$1`, [jobId]);

  // a pass-through stream that we will pipe CSV rows into
  const passThrough = new PassThrough();

  // start S3 multipart upload from the stream — does not buffer whole file
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: 'my-reports-private',
      Key: `reports/${tenantId}/${jobId}.csv`,
      Body: passThrough,
      ContentType: 'text/csv',
    },
  });

  // csv transform: converts JS objects -> CSV lines
  const csv = stringify({ header: true, columns: ['order_id', 'total', 'created_at'] });
  csv.pipe(passThrough);

  // stream rows in batches using keyset pagination (no OFFSET for large tables)
  let lastId = 0;
  let totalRows = 0;
  const BATCH = 2000;

  try {
    while (true) {
      const { rows } = await db.query(
        `SELECT id, total, created_at FROM orders
         WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
           AND ($4::text IS NULL OR product_id = $4)
           AND id > $5
         ORDER BY id ASC LIMIT $6`,
        [tenantId, filters.from, filters.to, filters.productId || null, lastId, BATCH]
      );
      if (rows.length === 0) break;

      for (const r of rows) {
        // back-pressure is handled: if S3 is slow, this will pause
        if (!csv.write({ order_id: r.id, total: r.total, created_at: r.created_at })) {
          await new Promise((resolve) => csv.once('drain', resolve));
        }
      }

      totalRows += rows.length;
      lastId = rows[rows.length - 1].id;

      // update progress every batch so polling can show a bar
      if (totalRows % 10000 === 0) {
        await db.query(`UPDATE report_jobs SET progress=$1 WHERE id=$2`, [totalRows, jobId]);
        await job.updateProgress(Math.min(95, totalRows / 1000)); // example progress
      }
    }

    csv.end();
    await upload.done(); // wait for S3 to finish

    await db.query(
      `UPDATE report_jobs SET status='ready', s3_key=$1, row_count=$2, finished_at=now() WHERE id=$3`,
      [`reports/${tenantId}/${jobId}.csv`, totalRows, jobId]
    );
  } catch (err) {
    // mark failed so the API can tell the user what happened
    await db.query(`UPDATE report_jobs SET status='failed', error=$1 WHERE id=$2`, [err.message, jobId]);
    throw err; // let BullMQ handle retry / dead-letter
  }
}, { connection: { host: 'localhost', port: 6379 }, concurrency: 2 });
```

Let the user check progress, and hand them a temporary download link.

```js
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// GET /reports/:jobId  -> polling endpoint
app.get('/reports/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const { rows } = await db.query(
    `SELECT id, status, progress, row_count, s3_key FROM report_jobs
     WHERE id=$1 AND tenant_id=$2`, // tenant isolation — never skip this
    [jobId, req.user.tenantId]
  );
  const job = rows[0];
  if (!job) return res.status(404).json({ error: 'report not found' });

  if (job.status === 'ready') {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: 'my-reports-private', Key: job.s3_key }),
      { expiresIn: 3600 } // 1 hour, then it stops working
    );
    return res.json({ status: 'ready', rowCount: job.row_count, downloadUrl: url });
  }

  // pending / processing / failed
  res.json({ status: job.status, progress: job.progress, error: job.error || undefined });
});
```

Pre-aggregated alternative for daily repeated reports.

```sql
-- Nightly job fills this summary once, report then reads hundreds of rows not millions
CREATE TABLE daily_sales_summary (
  day date NOT NULL,
  tenant_id uuid NOT NULL,
  product_id uuid,
  total_amount numeric NOT NULL,
  order_count integer NOT NULL,
  PRIMARY KEY (day, tenant_id, product_id)
);

-- nightly refresh (run at 2am)
INSERT INTO daily_sales_summary (day, tenant_id, product_id, total_amount, order_count)
SELECT date_trunc('day', created_at)::date, tenant_id, product_id,
       sum(total), count(*)
FROM orders
WHERE created_at >= current_date - interval '1 day'
  AND created_at < current_date
GROUP BY 1, 2, 3
ON CONFLICT (day, tenant_id, product_id) DO UPDATE
  SET total_amount = EXCLUDED.total_amount, order_count = EXCLUDED.order_count;

-- report query then becomes cheap: summary + today's live rows
SELECT day, sum(total_amount) FROM daily_sales_summary
WHERE tenant_id = $1 AND day BETWEEN $2 AND $3
GROUP BY day
UNION ALL
SELECT date_trunc('day', created_at)::date, sum(total) FROM orders
WHERE tenant_id = $1 AND created_at >= current_date
GROUP BY 1;
```

If you want push instead of polling, notify on completion:

```js
// at the end of the worker, after marking status='ready'
await fetch(user.webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jobId, status: 'ready', downloadUrl: presignedUrl }),
});
// or via WebSocket: io.to(`user:${userId}`).emit('report:ready', { jobId });
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What happens if you generate a large report synchronously inside the API request?**

You hold the HTTP connection open for as long as the query and CSV building take. That means you hold a Node event loop thread and a DB connection. With a few thousand rows it's fine. With hundreds of thousands, the response takes longer than the load balancer timeout (usually 30 seconds) and the client gets a 504 even though the server is still working. Worse, the server builds the whole result in memory — an array of rows plus a giant CSV string — so a few concurrent exports can push the process over its memory limit and crash it. The fix is to not do the work in the request: insert a job row, push to a queue, return 202 immediately, and let a worker do the heavy work outside the request cycle.

**Q: How do you handle a 5 million row CSV without running out of memory?**

You never hold all rows at once. You stream them. The worker opens a cursor or paginated query that fetches 1,000 to 5,000 rows at a time. Each batch gets turned into CSV lines and piped straight into the S3 upload stream. Node's streams handle back-pressure — if S3 is slow, the database reading pauses. Memory stays constant because you only ever hold one batch plus a small buffer. Keyset pagination with `WHERE id > lastId ORDER BY id` is better than `OFFSET` here because offset gets slower as you go deeper into a large table. For MongoDB you would use `find().cursor()` the same way.

**Q: How does the frontend know when the report is ready?**

The simplest approach is polling. After `POST /reports` returns `{ jobId }`, the frontend calls `GET /reports/:jobId` every 3 to 5 seconds. The API reads the `report_jobs` table and returns the status and progress count. When it flips to `ready`, the API also returns a presigned S3 URL and the frontend triggers the download. For a nicer experience you can also push: emit a WebSocket event or POST to a webhook URL that the client registered. Polling is easier to ship and debug first. Push is better when reports take many minutes and you don't want the user to keep the tab open.

**Q: What is pre-aggregation and when should you use it?**

Pre-aggregation means you compute the summary ahead of time and store it, so reports don't scan raw rows. For example, a nightly job sums orders into `daily_sales_summary` per day per product. A yearly sales report then reads 365 summary rows instead of 8 million order rows — it's orders of magnitude faster. You use it when the same grouped queries run repeatedly and you can tolerate a little staleness. The trade-off is freshness: the summary is only as current as the last run. For "up to yesterday" reports that is perfect. For "up to right now" you union the summary with today's live rows. Don't pre-aggregate if the filters are wildly different every time — then there's nothing to reuse.

**Q: How do you make the report download secure?**

Three layers. First, authz on the job itself: the `GET /reports/:jobId` query always includes `WHERE tenant_id = $1 AND user_id = $2` so one tenant can never fetch another's job. Second, the S3 bucket stays private. You never make the file public and never use a guessable URL. You generate a presigned URL with a short expiry like 15 to 60 minutes, only after verifying the user owns that job. Third, you don't leak data in the job polling response before it's ready, and you clean up old files with a TTL so stale reports don't sit around forever. Also validate filters strictly — a `productId` that doesn't belong to the tenant should be rejected, not silently queried.

**Q: Do you use pagination, streaming, or both?**

Both, for different parts. Pagination controls how you read from the database — batches of rows so you don't exhaust the DB cursor or hold its connection forever. Streaming controls how you write the output — piping rows through a CSV transform into S3 without buffering the whole file. You page on the way in, you stream on the way out. If you page but then append to a giant string before uploading, you still OOM. If you stream but try to read all rows in one query, you still OOM on the database driver side. You need both halves.

## 6. The Traps — What Goes Wrong in Production

**Building the whole file in memory.** The classic trap. `const rows = await db.query("SELECT * FROM orders")` followed by `rows.map(toCsv).join("\n")`. It passes code review with 100 test rows and crashes with 1 million. The fix is always cursor/stream + pipe to S3. If your code has `await` that returns all rows at once for a report path, it is wrong for large data.

**Doing it synchronously on the request.** Generating inside the HTTP handler with no queue. It seems simpler, so people do it. Then one large export blocks the event loop and holds a DB connection for minutes. Add two concurrent users and the whole API is down. The tell is an endpoint with no job table, no queue, and a `res.send(csvString)` at the end. If the work can take more than a couple seconds, it must be async.

**Using OFFSET for deep pagination.** `LIMIT 1000 OFFSET 1000000` makes the database still read and throw away a million rows. It gets slower page by page. Last page can take seconds. Use keyset pagination — `WHERE id > $lastId ORDER BY id LIMIT 1000` — or a server cursor that keeps position.

**No back-pressure.** Writing batches to the CSV stream faster than S3 can accept them. In Node, `csv.write()` returns false when the buffer is full; you must wait for `drain`. Ignoring the return value means you buffer unboundedly in memory and get the same OOM you were trying to avoid.

**Public S3 bucket or permanent link.** Uploading to a public bucket or returning a permanent `https://s3.amazonaws.com/bucket/report.csv` leaks every report to anyone who guesses the path. Always use a private bucket and a presigned URL that expires. And always check `tenant_id` before signing.

**Double-click duplicates.** The user clicks Export twice and you create two identical jobs that both scan millions of rows. Use an idempotency key derived from the user plus filters plus a short time window, and return the existing pending job if it already exists.

**No progress, no timeout, no cleanup.** Jobs that get stuck in `processing` forever because the worker crashed without marking `failed`. Users have no idea if it's 10% or 90% done. Old files fill S3 forever. Fix with a heartbeat or progress update every batch, a timeout that marks stuck jobs as failed after, say, 15 minutes, and a sweeper that deletes S3 files after a retention window.

**Missing tenant isolation in the query.** The API checks `req.user.tenantId` but the report query itself forgets the `WHERE tenant_id = $1`. One missing filter and tenant A gets tenant B's sales data in their CSV. Always enforce the tenant boundary in the SQL itself, and test it explicitly with two tenants.

## 7. Compare With Related Concepts

**Sync vs async generation.** Sync means the HTTP request waits for the file. Async means the request creates a job and returns. Use sync only when you know the result is small and fast — a paginated API page or a download under a few thousand rows with a sub-second query. Use async for anything that can grow without bound, anything over a few seconds, or anything shared by many users. Rule: if you can't guarantee the query finishes in 2 seconds at 10x today's data size, make it async.

**Streaming vs buffering.** Buffering holds the whole report in memory before sending. Streaming sends each batch as it arrives. Buffering is fine for small JSON responses. Streaming is required for large files. Rule: if you can describe the file size as "could be gigabytes," you must stream on both ends — cursor out of the DB, stream into the destination.

**Offset pagination vs cursor/keyset pagination.** Offset skips N rows and gets slower as N grows. Cursor walks forward using the last id and stays constant time. Use offset only for user-facing pages where you need "go to page 47" and the pages are shallow. Use keyset or a DB cursor for report workers that will walk through millions of rows sequentially. Rule: report workers never use OFFSET.

**Pre-aggregation vs on-demand generation.** Pre-aggregation computes summaries on a schedule and makes reads cheap. On-demand runs the raw query each time and is always fresh. Use pre-aggregation for common grouped reports with similar filters. Use on-demand when filters are unpredictable or real-time freshness is mandatory. You can mix them: summary plus today's live rows.

**Polling vs webhook/push.** Polling is the client asking "ready yet?" on a loop. Webhook/push is the server saying "it's ready." Polling is simpler, works everywhere, and is easier to retry. Push is nicer for long jobs but needs the client to expose a URL or hold a WebSocket. Rule: ship polling first, add push when users actually leave the page before reports finish.

**S3 presigned URL vs proxying the download through the API.** Proxying means the API reads the file from S3 and streams it to the client. That burns API bandwidth and ties up a server for the download. A presigned URL lets the browser download directly from S3. Rule: generate a short-lived presigned URL for large files; proxy only for tiny files where you need to inspect contents on the fly.

## 8. 🧠 The Memory Hook

Don't make the customer wait at the counter while you print 10,000 pages. Hand them a ticket, print in stacks in the back room so the table never collapses, put the box in a locker, and give them a code that expires. That ticket is a job row, the stacks are streaming batches, the locker is S3, the code is a presigned URL.
