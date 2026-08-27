# Duplicate Orders Are Getting Created — How Will You Fix It

## 1. The Real-World Problem — When You Actually Hit This

Your checkout has been working fine for months. Then finance pings you on a Monday morning: a customer was charged twice for the same cart. You check the database and there are two rows in `orders`, same user, same items, same amount, created 800 milliseconds apart. Same thing starts showing up for other users, but only a few times a day.

Nobody deployed a bug that creates two orders on purpose. What actually happened is more boring and more real. A user double-clicked "Pay" because the button felt stuck. A mobile network timed out so the app retried the same `POST /orders` automatically. A load balancer sent the same request to two servers during a retry storm. Each of those retries looked like a brand-new request to your backend, so your code did what it always does: it created a new order, called the payment provider, decremented stock, and sent two confirmation emails.

The logs for each request look completely normal. The query works fine with 100 rows in dev, but now you have side effects you cannot undo easily — money moved, inventory wrong, support tickets, and manual refunds. You cannot fix this by telling users to click slowly. You need the server to recognize "I already handled this exact request" and safely return the same answer without doing the work twice.

## 2. The Analogy — Make the Mechanic Obvious

Think of a busy restaurant kitchen.

Every order that comes in gets a small paper ticket with a number on it — say, ticket #842. The ticket gets pinned to the board. The cooks only ever cook what is pinned on the board.

Now the waiter is standing at the pass shouting orders. The kitchen is loud, so sometimes he shouts the same order twice because he did not hear "got it." If the kitchen just listened and cooked every shout, you would get two plates for one table.

A good kitchen does not do that. When a shout comes in, someone checks the board first. Is ticket #842 already pinned there? If yes, they do not cook again. They just say "already cooking" or "here is your plate, it is already done." If the ticket is not on the board, they pin it, cook once, and keep the finished plate reference clipped to that ticket so they can hand over the same plate if someone shouts again.

Here is how it maps to orders:

The customer clicking "Pay" is the table ordering. The `Idempotency-Key` you generate in the browser or mobile app is the ticket number. You generate it once per intent to buy, not per network attempt. The Redis or database table where you store those keys is the board. The unique index on that board is the rule that you physically cannot pin two tickets with the same number. Checking the board before cooking is deduplication. Shouting again is a retry, and it is safe because the board makes the retry do nothing extra. The little debounce on the "Pay" button — disabling it after the first click — is like the waiter telling the table "I got your order, please do not wave again." It helps, but the kitchen board is the real safety net when shouting still happens.

## 3. The Full Explanation — How It Actually Works

In plain words: an idempotency key is a ticket number the client picks for "this one thing I want to happen." If the same ticket shows up again, the server promises to not do the work a second time and to return the same result as the first time.

That promise is what we mean by idempotent. Calling it once and calling it five times has the same effect on the system as calling it once. It does not mean the request is blocked or ignored silently — it means the second, third, and fourth calls safely get back the original order as if the retry had worked the first time.

Here is the flow that makes that true, step by step.

First, the client owns the key. When the user hits "Place Order," the frontend creates a UUID like `ord_9f3a2c...` and sends it with the request, usually as a header `Idempotency-Key: ord_9f3a2c...` or as a field in the body. The key must be created before the network call and reused for every retry of that same intent. If the server creates the key, retries become useless because each retry would generate a new ticket number.

Second, the server checks the idempotency store before doing any side effect. This check must be atomic. Checking "does this key exist?" and then inserting it in two separate steps creates a race where two servers can both think the key is new and both create orders. You need an atomic "insert if not exists" — in Redis that is `SET key value NX`, in Postgres that is an `INSERT` that fails on a unique violation. No payment call, no order insert, no inventory decrement happens until that insert succeeds.

Third, you save the result alongside the key. When the order is created successfully, you store the response — order ID, status code, and body — keyed by the idempotency key, often with a TTL like 24 hours. If the same key comes again later, you do not re-run business logic. You just return the stored response. That is the deduplication part.

Fourth, you make the order creation itself safe. The atomic key insert stops most duplicates, but you still wrap the real work — insert into `orders`, call payment, update `inventory` — in a database transaction so you either do all of it or none of it. The idempotency row and the order row should commit together when you use the database as the store. If you use Redis as the fast store, the database still needs a unique constraint on `idempotency_key` in the `orders` table as a final safety net, because Redis can evict or fail over.

Where you store the key is a trade-off you should be able to talk about. Redis is fast and gives you TTL cleanup for free, which is nice at high traffic. But Redis is not your source of truth — if it restarts and loses keys, duplicates can come back. A Postgres or Mongo table is durable and can live in the same transaction as your order, but it is slower and you need a cleanup job to delete old keys. Many teams do both: Redis for the fast check with a TTL, Postgres unique index as the durable guarantee. The cost you pay for safety is one extra write and one extra lookup per mutating request, plus storage for keys until they expire.

UI debouncing is part of the picture but it is not the fix. Disabling the "Pay" button after the first click and debouncing for 300 to 500 milliseconds stops the accidental double-click case, which is the most common source of duplicates. But it does nothing for network retries, browser reload after a timeout, mobile SDK retries, or a queue consumer redelivering the same job. Backend idempotency covers all of those. You need both layers.

A few boundaries that matter in production:

Consistency: the check and the insert must be linearizable for that key. A unique index gives you that. Application-level `if (!exists) { create() }` does not.

Transactions: if order creation fails halfway, you need to mark the key as failed or delete it so a retry can try again, or mark it as `processing` and make concurrent retries wait or return `409 Conflict` or `425 Too Early`.

Security: keys are scoped to a user or account. User A should not be able to replay User B's key and get User B's order. Validate ownership before returning a cached response.

Observability: log the `idempotencyKey` with every request ID, emit a counter for `idempotency.hit` versus `idempotency.miss`, and expose how long keys stay in `processing` state. That is how you know whether duplicates are from the UI or from retries.

Error handling: if the same key arrives with a different payload — same ticket number but different items or amount — return `422 Unprocessable Entity` and do not create a second order. Silently returning the first order for a different cart hides a bug.

When do you use it? Any mutating endpoint where a retry would cause real damage if it ran twice: `POST /orders`, `POST /payments`, `POST /refunds`, `POST /transfers`. You do not need it for `GET`, `PUT`, or `DELETE` that are already idempotent by definition, and you do not need it for endpoints where creating a duplicate is harmless.

## 4. See It In Practice — Real Code or Queries

These examples show the full shape: how the key moves from client to server, how the server stores it atomically, and how the order write is protected.

Client — generate the key once per intent:

```javascript
// React checkout button - the key is created once when the user decides to pay
import { v4 as uuid } from 'uuid';

function CheckoutButton({ cart }) {
  const [loading, setLoading] = useState(false);

  async function placeOrder() {
    if (loading) return; // debounce: do not let a second click start a second call
    setLoading(true);

    // create the ticket number ONCE for this intent, reuse it on retries
    const idempotencyKey = uuid(); // e.g. "9f3a2c1e-..."
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({ cart })
      });

      // if the request times out, retry with the SAME key, not a new one
      if (!res.ok) throw new Error(await res.text());
      const order = await res.json();
      return order;
    } finally {
      setLoading(false);
    }
  }

  return <button onClick={placeOrder} disabled={loading}>Pay</button>;
}
```

Database — durable store with a unique index and response cache:

```sql
-- Postgres: idempotency table lives in the same DB as orders
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  response_status INT,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- every order remembers which ticket created it - final safety net
ALTER TABLE orders ADD COLUMN idempotency_key TEXT UNIQUE;
CREATE UNIQUE INDEX orders_idempotency_key_uidx ON orders (idempotency_key);

-- optional: clean up old keys once a day, keys are only needed for the retry window
-- DELETE FROM idempotency_keys WHERE expires_at < now();
```

Server — Node and Express with an atomic check before any side effect:

```javascript
// Node / Express - atomic dedup before doing any real work
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { Pool } from 'pg';

const redis = new Redis(process.env.REDIS_URL);
const pg = new Pool({ connectionString: process.env.DATABASE_URL });

// idempotency middleware - tries to claim the key atomically
async function idempotencyGuard(req, res, next) {
  const key = req.header('Idempotency-Key');
  if (!key) return res.status(400).json({ error: 'Idempotency-Key header required' });

  const userId = req.user.id;
  const storeKey = `idemp:${userId}:${key}`;

  // SET NX is atomic - only one server can win for this key
  const wasSet = await redis.set(storeKey, JSON.stringify({ status: 'processing' }), 'NX', 'EX', 60 * 60 * 24);
  if (!wasSet) {
    // someone already claimed this ticket - return the cached answer
    const cached = await redis.get(storeKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.status === 'completed') {
        return res.status(parsed.responseStatus).json(parsed.responseBody);
      }
      if (parsed.status === 'processing') {
        // another request is still working on this ticket - tell client to wait, not retry blindly
        return res.status(409).json({ error: 'Request already processing, retry with same key' });
      }
    }
    // fallback to DB if Redis lost the value but the order already exists
    const existing = await pg.query('SELECT id, status FROM orders WHERE idempotency_key = $1 AND user_id = $2', [key, userId]);
    if (existing.rows.length) {
      return res.status(200).json({ orderId: existing.rows[0].id, status: existing.rows[0].status });
    }
  }

  // claim succeeded - stash key for the handler to finalize
  req.idempotencyKey = key;
  req.idempotencyStoreKey = storeKey;
  next();
}

app.post('/api/orders', idempotencyGuard, async (req, res) => {
  const { cart } = req.body;
  const { idempotencyKey, idempotencyStoreKey } = req;
  const userId = req.user.id;

  const client = await pg.connect();
  try {
    await client.query('BEGIN');

    // try to insert idempotency row - unique index makes this the durable atomic claim
    await client.query(
      `INSERT INTO idempotency_keys (key, user_id, status, expires_at)
       VALUES ($1, $2, 'processing', now() + interval '24 hours')`,
      [idempotencyKey, userId]
    );

    // validate payload shape and check cached payload mismatch inside same transaction
    // if same key was used with different amount/items, fail rather than silently returning old order
    // (store a hash of the request body on first insert and compare here - omitted for brevity)

    // real work: create order and adjust inventory transactionally
    const orderId = randomUUID();
    await client.query(
      `INSERT INTO orders (id, user_id, amount, status, idempotency_key)
       VALUES ($1, $2, $3, 'confirmed', $4)`,
      [orderId, userId, cart.total, idempotencyKey]
    );
    await client.query(
      `UPDATE inventory SET stock = stock - 1 WHERE sku = ANY($1)`,
      [cart.skus]
    );

    await client.query('COMMIT');

    const responseBody = { orderId, status: 'confirmed' };
    // cache the successful response so retries get the same 200 + body
    await redis.set(
      idempotencyStoreKey,
      JSON.stringify({ status: 'completed', responseStatus: 200, responseBody }),
      'EX', 60 * 60 * 24
    );
    await pg.query(
      `UPDATE idempotency_keys SET status = 'completed', response_status = 200, response_body = $2 WHERE key = $1`,
      [idempotencyKey, JSON.stringify(responseBody)]
    );

    return res.status(200).json(responseBody);
  } catch (err) {
    await client.query('ROLLBACK');
    // Postgres unique_violation (23505) means another server already inserted this key
    if (err.code === '23505') {
      const existing = await pg.query('SELECT id FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
      if (existing.rows.length) {
        return res.status(200).json({ orderId: existing.rows[0].id, status: 'confirmed' });
      }
    }
    // mark failed so a retry with same key can try again
    await redis.del(idempotencyStoreKey);
    await pg.query(`UPDATE idempotency_keys SET status = 'failed' WHERE key = $1`, [idempotencyKey]).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});
```

What to notice in that code: the `SET NX` and the `INSERT` with the unique index are the only two lines that actually prevent a race. Everything else — the transaction, the cached response, the `processing` state, the payload hash check — is there to make retries safe and predictable. Without the atomic insert, none of the rest matters.

## 5. Interview Questions — All of Them, Done Properly

**Q: What actually causes duplicate orders in production? Is it just users double-clicking?**

Double-clicking is the most visible cause, but it is only one of several. The bigger bucket is retries. When the server is slow, the client times out and retries the same `POST` with the same intent. Mobile SDKs retry automatically on flaky networks. A reverse proxy can retry a request that looked like it failed. If the request is delivered through a message queue, the queue guarantees at-least-once delivery, so the consumer can see the same message twice. Each retry looks like a new request if the server has no way to recognize it as a duplicate. That is why you see two orders created 500 milliseconds apart with no error in the logs — both requests thought they were the first and both succeeded.

**Q: What is an idempotency key and who should create it?**

An idempotency key is a unique ticket number the client generates for one logical action — one tap of "Pay" for one cart. The client must create it, usually a UUID v4, and send it as a header like `Idempotency-Key` or as a field in the body. The client must reuse the same key for every retry of that same action. If the server generated the key, each retry would get a new key and the server would have no way to know they are retries. The server's job is to treat the key as the identity of the intent: first time with this key, do the work and remember the result; any later time with the same key, return the remembered result.

**Q: Where do you store the key, and why not just keep it in memory?**

You store it somewhere that all servers can see and that survives a restart, with a TTL. The two common choices are Redis and the primary database. Redis is fast and its TTL cleans up old keys automatically, but it is not durable — a failover can lose keys. A Postgres or Mongo table is durable and can participate in the same transaction as the order, but you need a periodic job to delete expired keys. Keeping it in local server memory does not work because the retry often lands on a different server, and a restart wipes the memory. Many production setups use both: Redis for the fast path and a unique index in the database as the durable guarantee.

**Q: Why do you need a unique index? Cannot the app just check if the key exists?**

An app-level check like `if (await exists(key)) return cached; else create()` has a race. Two requests with the same key can both run the check at the same time, both see "not exists," and both go on to create orders. The unique index makes the "claim this key" step atomic at the database level — only one `INSERT` succeeds, the other gets a unique violation error that you catch and turn into "return the existing order." In Redis, `SET key value NX` is the equivalent atomic operation. The business logic after that — charging, inventory, order row — only runs for the winner.

**Q: How should the server handle retries from the client?**

The server should make retries safe, not just possible. First attempt: claim the key atomically, run the transaction, store the response with the key, return `200` and the order. Second attempt with the same key: skip all business logic and return the stored `200` and the same body, including the same order ID. If a retry arrives while the first attempt is still running, return `409 Conflict` or `425 Too Early` and tell the client to retry the same key after a short backoff, or hold the request briefly and return the result when the first attempt finishes. Never create a second order and never return a different order ID for the same key.

**Q: Do you debounce on the frontend, fix it on the backend, or both?**

Both, for different reasons. Frontend debouncing — disabling the button on click, ignoring a second tap for a short window, using a loading state — is a great user experience fix and it eliminates the accidental double-click duplicates that make up most of the noise. But the frontend alone is not reliable because the duplicates that matter most come from outside the button: network timeouts, browser reloads, mobile retries, and queue redeliveries. Those still hit the backend as duplicate `POST`s even with perfect button logic. Backend idempotency is the correctness fix. Think of it this way: debouncing reduces how often duplicates arrive, idempotency guarantees duplicates do not cause damage when they do arrive.

**Q: What should happen if the same idempotency key is sent with a different payload?**

That is a client bug or a key-reuse bug, and you must not hide it. If the first call was `{ items: ["A"], amount: 50 }` with key `k1` and the second call is `{ items: ["A", "B"], amount: 80 }` with the same `k1`, returning the first order silently gives the user the wrong order. The correct behavior is to store a hash of the request body with the key on the first insert and, on a duplicate key arrival, compare the hash. If it differs, return `422 Unprocessable Entity` with a message like "idempotency key already used with different payload." That makes the bug visible instead of silently wrong.

**Q: How long should you keep idempotency keys?**

Long enough to cover the retry window, short enough to not bloat storage. For a checkout API, 24 hours is a common default because retries happen within seconds to minutes, but a user might retry after a timeout a few hours later and you still want to protect them. For payments, some teams keep keys for 7 days because reconciliation happens later. Use a TTL in Redis and an `expires_at` column plus a daily delete job in Postgres. Whatever you pick, document it and return a clear error if a key is reused after expiry — at that point it is a new intent and needs a new key.

**Q: What does the idempotency key need to be scoped to?**

To the actor and the resource. A key generated by user A should not be usable to fetch user B's order. Always store and look up keys as `(user_id, key)` or `(account_id, key)`, and validate ownership before returning a cached response. Also scope by endpoint — a key used for `POST /orders` should not be accepted for `POST /refunds`. Some teams include the endpoint path or a separate key namespace per operation.

## 6. The Traps — What Goes Wrong in Production

Relying only on the UI fix. Teams disable the button and think the problem is solved. Then a network timeout causes the fetch to retry automatically, or a user reloads the page and the browser replays the `POST`, or a message queue delivers the same job twice. All of those bypass the button completely. The UI debounce is helpful and you should ship it, but it is not a correctness guarantee. Only a server-side atomic key claim is.

Doing a check-then-insert without an atomic guarantee. Code that reads `SELECT ... WHERE key = ?`, sees nothing, and then does `INSERT` is not safe under concurrency. Two requests can interleave between the read and the write. The fix is to let the database enforce uniqueness and handle the violation. Write the `INSERT` first and catch `23505` in Postgres or `E11000` in MongoDB, or use `SET NX` in Redis. That one pattern eliminates the whole class of race-condition duplicates.

Generating the key on the server. If the server creates the key inside the handler and returns it to the client, a retry that never reached the server — the classic timeout case — will generate a second key on the retry and create a second order. The key must be generated on the client before the first network call and reused for every retry. If you see a design where the server generates the key, ask "what happens when the first request times out before the server responds?"

Storing only "key exists" without storing the response. Some teams check the key, create the order, and on a duplicate just return `200 OK` with an empty body or a new order ID. That breaks client expectations and makes retries unsafe — the client does not know which order ID is the real one. Always store the response status and body alongside the key so a retry gets back exactly what the first call returned, including the same `orderId`.

Treating "processing" and "completed" as the same state. If a retry arrives while the first request is still running, returning "already exists" with no order ID or returning a 500 causes the client to retry again and pile up. Keep three states: `processing`, `completed`, and `failed`. A duplicate that arrives during `processing` should get a `409` with a `Retry-After` header or a short wait, not a success and not a duplicate order. A `failed` key should allow a retry to try again rather than being stuck forever.

Using the same key for different payloads and silently returning the old order. This hides bugs and can charge the wrong amount. Store a hash of the request body on first insert and compare on every duplicate arrival. If the hash differs, return `422`. It is better to surface a clear error than to silently give the user the wrong order.

Keeping keys forever or deleting them too early. No TTL means your table grows without bound and every `POST` pays for a bigger index. Too short a TTL — say 60 seconds — means a user who retries after 5 minutes creates a duplicate. Pick a window that matches your real retry behavior, usually 24 hours for orders, and enforce it with Redis `EX` and a daily cleanup query. Also make sure the cleanup does not delete `processing` keys that are still in flight.

Not having the database unique constraint as a backup when using Redis. Redis can evict keys under memory pressure or lose them during a failover. If the only dedup check is in Redis, that loss window creates duplicates. The `UNIQUE` constraint on `orders.idempotency_key` is the last line of defense — even if Redis forgets, the second `INSERT` still fails. Ship both layers.

## 7. Compare With Related Concepts

**Idempotency vs exactly-once delivery.** These sound similar but they are not the same, and mixing them up causes real design mistakes. True exactly-once delivery — where a message is delivered to a consumer exactly one time and never repeated — does not exist in most distributed systems. What networks, queues, and browsers actually give you is at-least-once delivery: a message will be delivered one or more times, and it may be retried. Idempotency is how you get the effect of exactly once without needing a guarantee that the network cannot provide. You accept that the request may arrive twice and you make the second arrival harmless. The rule to remember: do not promise exactly-once delivery, promise at-least-once delivery plus idempotent handling, which looks exactly once to the user.

**Idempotency vs debouncing or throttling.** Debouncing and throttling control how often a function runs — "ignore extra clicks for 300 milliseconds" or "allow 10 requests per second." They reduce duplicate arrivals and they are worth shipping on the frontend for user experience. Idempotency controls what happens when a duplicate does arrive — "if this ticket already created an order, return that order." Debouncing is about timing and UI, idempotency is about correctness and state. Use debouncing to reduce noise, use idempotency to guarantee safety. One does not replace the other.

**Idempotency vs a plain unique constraint alone.** A `UNIQUE` constraint on `idempotency_key` stops duplicate rows, which is essential, but it does not by itself make the API idempotent. Without a key, the database can still happily insert two different rows for two identical intents because they have different auto-generated IDs. And without storing and returning the cached response, the client on retry may still get an error instead of the original success. The unique index is a building block of an idempotency implementation, not the whole implementation. You need the key generation, the atomic claim, and the response cache around it.

**Idempotency vs consumer-side deduplication in a queue.** When a queue delivers a job like `process_order { orderId, idempotencyKey }` at least once, the consumer still needs to deduplicate. The pattern is the same ticket idea but at the consumer boundary: before processing the job, try to claim the `jobId` or `idempotencyKey` with `SET NX` or a unique insert. If the claim fails, acknowledge the duplicate and skip. The difference from API idempotency is mostly where the key lives — the API deduplicates on the incoming HTTP request, the queue consumer deduplicates on the job delivery. Both solve the same problem: the network may give you the same work twice.

**Idempotency vs optimistic concurrency or transactions alone.** A database transaction makes the order creation plus inventory update atomic — either both happen or neither does. That protects against partial failures, but it does not stop two separate transactions from both succeeding and creating two orders. Transactions give you all-or-nothing within one attempt, idempotency gives you at-most-once across many attempts. You need both: the idempotency key decides whether to run the transaction at all, the transaction decides whether the work inside that one run is consistent.

## 8. 🧠 The Memory Hook

Every tap of "Pay" gets one ticket number, and the kitchen board can only hold one ticket with that number. If the waiter shouts the same ticket again, the kitchen does not cook again — it hands back the same plate. Click once or retry five times: one ticket, one order, same answer every time.
