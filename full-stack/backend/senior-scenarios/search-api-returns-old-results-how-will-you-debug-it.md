# Search API Returns Old Results — How Will You Debug It

## 1. The Real-World Problem — When You Actually Hit This

You ship a product rename. A seller changes "Blue Runner Shoes" to "Blue Runner Shoes — Waterproof". They hit save, the API returns 200, they search for "Waterproof" and get nothing. They search for the old name and it is still there. They refresh, wait 10 seconds, search again — now it shows up. Or worse, it shows up for them but not for a buyer on the other side of the country.

Support starts getting tickets. Users say search is broken. Your dashboard says the API is healthy — 99.9% success, p95 latency under 80ms. No errors in logs. The database has the new name. But the search endpoint keeps handing back yesterday's truth.

This is the worst kind of bug to debug. Nothing is crashing. Every layer is working exactly as it was configured to work. The problem is that three or four layers between the user typing and the database row are each holding onto an old answer a little too long, and you have to figure out which one is lying.

If you just clear the cache and call it fixed, it will come back next week. A senior answer shows you can tell the difference between a cache that lives too long, a search index that has not refreshed yet, a database replica that is behind, and a frontend bug that is showing the wrong response — and you can prove which one it is.

## 2. The Analogy — Make the Mechanic Obvious

Think of your search stack as a chain of people answering the same question: "Do you have Waterproof shoes?"

At the back is the warehouse manager. She has the real inventory list — that is your primary database. When a product is renamed, she updates her master sheet instantly.

But customers never ask her directly. They ask through a chain:

The receptionist at the front desk keeps a sticky note of the last answer she gave. If someone asks the same question within 5 seconds she just reads the sticky note instead of calling back. That is browser and in-memory cache with a TTL.

Behind her is a regional office that prints a catalog every 5 minutes and hands it to every store. Even if the warehouse updates, the regional catalog is out of date until the next print. That is Redis or CDN cache with a TTL of minutes.

Next is the card catalog room. A clerk copies every warehouse change onto index cards, but she only files the new cards on a schedule — say once per second. If you look up a card half a second after the warehouse changed, you get the old card. That is Elasticsearch and its `refresh_interval`.

Finally there is a branch warehouse that gets a truck delivery from the main warehouse every few seconds. If you ask the branch warehouse before the truck arrives, it gives you the old stock. That is a read replica lagging behind the primary.

And one more person makes it confusing: the customer on the phone keeps changing their question mid-sentence. "Blue... Blue run... Blue runner waterproof." The receptionist fires off three calls to the warehouse. The answer to "Blue run" is slow and comes back after the answer to "Blue runner waterproof" — so the customer sees the wrong answer last. That is a debounced search without aborting the old fetch — a classic race condition.

Every layer is helpful for speed. Every layer can serve stale data for a different reason and with a different fix.

## 3. The Full Explanation — How It Actually Works

Stale search is never one bug. It is a family of bugs that all look identical to the user. Your job in debugging is to narrow down which layer is stale and why.

Here is how each layer actually works and how it goes stale.

**Browser and HTTP cache.** If your search endpoint is `GET /api/search?q=shoes`, browsers and intermediate proxies may cache the response. An HTTP header like `Cache-Control: public, max-age=300` tells a CDN and browser to reuse that response for 5 minutes without ever hitting your server. That is great for a marketing page and terrible for search. You should normally send `Cache-Control: no-store` or `private, max-age=0, must-revalidate` for personalized or fast-changing search, or use a very short TTL with proper validation via `ETag`. If you see stale results only for users who repeat the same query and a hard refresh fixes it, suspect HTTP caching.

**Application cache — Redis, Memcached, CDN.** Most teams add a cache in front of search for speed: `GET /api/search?q=waterproof` -> check Redis key `search:q=waterproof` -> if miss, query Elasticsearch or DB, store result with TTL, return. If the TTL is 60 seconds, every search for that term for the next 60 seconds returns the old result even after a product update. CDN caching does the same but at the edge, often with longer TTLs and harder invalidation. The fix is not "remove caching". It is tighter TTLs for search (5–15 seconds not 5 minutes), cache key design that includes everything that affects the result, and explicit invalidation on write — delete or version the cache key when a product changes.

**Elasticsearch refresh_interval — the most common surprise.** Elasticsearch is near-real-time, not real-time. When you index a document, it goes into an in-memory buffer. It only becomes searchable after a refresh, which by default happens every 1 second (`index.refresh_interval: 1s`). For one second after a write, search can return the old version. That is normal. If someone tuned the interval to `30s` for indexing speed, staleness lasts 30 seconds. You can force a refresh on critical writes (`?refresh=wait_for`) but that hurts throughput. In debugging, check whether staleness is always under ~1 second (expected) or longer (misconfiguration or overwhelmed indexing queue). Also check whether you are reading from a replica shard that has not refreshed.

**Database replica lag.** If your API writes to the primary but reads search data from a read replica, the replica replays the primary's write-ahead log with a delay — usually milliseconds, but under load it can be seconds or minutes. Query the replica right after a write and you get the old row. This looks exactly like a cache problem. The tell is that bypassing the cache still returns stale data when reading from the replica, but reading from the primary returns fresh data. Fix options: read-after-write consistency by routing the user's own recent writes to the primary for a short window, or use the primary for search freshness and replicas for analytics, or reduce replica lag with right-sized replicas.

**Race conditions from debounced requests.** On the frontend, search inputs are debounced — you wait 300ms after the user stops typing before firing the request. If you fire a fetch for "blue", then 200ms later fire for "blue waterproof", the first request may be slower and resolve last, overwriting the correct result. The UI ends up showing results for "blue" while the input says "blue waterproof". This has nothing to do with caches. It is a client bug. Fix it by aborting the previous fetch with `AbortController` or by tagging requests with a sequence number and ignoring responses that are not for the latest query.

**How a senior actually debugs it — evidence before guessing:**

Start by reproducing with proof. Do the write yourself, then immediately curl search with cache bypass headers and compare three paths: direct to primary DB, direct to Elasticsearch, and through the full API via CDN. Log request IDs end to end — browser `X-Request-Id`, CDN, API server, Elasticsearch, database — so you can trace one user action across layers. Check timestamps: when did the write commit, when did the search execute, what TTL or refresh was in effect.

Then isolate. Hit the API with `Cache-Control: no-cache` and `Pragma: no-cache` to bypass CDN. Hit it with a cache-busted query param or a Redis `DEL` to bypass app cache. Query Elasticsearch directly with `_search` and check `_seq_no` and version. Query the primary and the replica separately and compare `updated_at`. Open browser DevTools, look at the Network tab timing — does a later request finish earlier and overwrite? Is an `AbortSignal` actually wired?

Only then fix. The smallest safe fix might be reducing a TTL from 300s to 10s, or adding `AbortController`, or changing search reads to go to the primary for 5 seconds after a user's write. Ship that, then add the guardrails: metrics for replica lag, cache hit/miss ratios, Elasticsearch refresh lag, and frontend race detection, plus tests that assert freshness.

Tradeoffs are real. Shorter TTLs and `refresh=wait_for` make search fresher but increase load and p95 latency. CDN offloading saves origin cost but makes invalidation harder. Abort logic adds client complexity but prevents a whole class of UI bugs. You pick freshness where it matters — the user's own recent edits — and accept brief staleness where it does not — anonymous trending searches.

Security and correctness touches: never fix staleness by switching `GET` search to `POST` to dodge caches without thinking about CSRF and semantics. Validate and escape search input at the API, not just in Elasticsearch queries, to avoid injection. Log search queries with correlation IDs but redact PII.

## 4. See It In Practice — Real Code or Queries

These are small but runnable. Run the Node snippets with `node`, the browser snippet in DevTools, and the Elasticsearch example against any local ES instance.

**1. The race condition you ship without noticing — and the abort fix**

```js
// BAD: debounced search without abort — old response can overwrite new one
let timer;
const input = document.querySelector('#search');
input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(input.value)}`);
    const data = await res.json();
    renderResults(data); // danger: response for "blue" may arrive after "blue waterproof"
  }, 300);
});
```

```js
// GOOD: debounce + AbortController + sequence guard — runnable in any browser
let timer;
let controller = null;
let latestSeq = 0;

const input = document.querySelector('#search');
input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    // Cancel the previous in-flight search
    if (controller) controller.abort();
    controller = new AbortController();
    const seq = ++latestSeq;
    const q = input.value;

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }, // ask CDN/browser to revalidate
        cache: 'no-store',
      });
      const data = await res.json();
      // Only render if this is still the latest query the user asked for
      if (seq === latestSeq) renderResults(data);
    } catch (err) {
      if (err.name === 'AbortError') return; // expected — a newer search replaced this one
      console.error('search failed', err);
    }
  }, 300);
});

function renderResults(data) {
  console.log('rendering', data);
}
```

**2. Express search endpoint with Redis cache — correct TTL and invalidation**

```js
// npm i express redis
import express from 'express';
import { createClient } from 'redis';

const app = express();
const redis = createClient({ url: 'redis://localhost:6379' });
await redis.connect();

// Search — short TTL, no-store for freshness-critical queries
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ hits: [] });

  const cacheKey = `search:q=${q}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    res.set('Cache-Control', 'private, max-age=10'); // short CDN/browser cache
    return res.json(JSON.parse(cached));
  }

  // Replace with real Elasticsearch / DB query
  const hits = await fakeSearch(q);

  // 15 seconds for search — not 5 minutes. Tune by traffic and freshness need.
  await redis.setEx(cacheKey, 15, JSON.stringify({ hits }));

  res.set('X-Cache', 'MISS');
  res.set('Cache-Control', 'private, max-age=10');
  return res.json({ hits });
});

// On product update — invalidate affected search keys
app.put('/api/products/:id', express.json(), async (req, res) => {
  const { id } = req.params;
  // ... write to primary DB and reindex in Elasticsearch ...

  // Simple invalidation: delete known search keys that could contain this product
  // In production, use versioned keys or a pub/sub invalidation channel
  const keysToDelete = await redis.keys('search:*');
  if (keysToDelete.length) await redis.del(keysToDelete);

  res.json({ ok: true, id });
});

async function fakeSearch(q) {
  return [{ id: 1, name: `Result for ${q}`, updatedAt: new Date().toISOString() }];
}

app.listen(3000, () => console.log('listening on :3000'));
```

Key decisions in comments: `15` second TTL instead of `300`, `X-Cache` header so you can see cache vs origin in debugging, and explicit delete on write. A more precise system version-keys by product category instead of `keys('search:*')`.

**3. Elasticsearch refresh_interval — see the 1-second staleness**

```js
// Create index with default 1s refresh
// PUT /products
// {
//   "settings": { "index": { "refresh_interval": "1s" } },
//   "mappings": { "properties": { "name": { "type": "text" } } }
// }

// Index a product, then search immediately — may return old doc for up to 1s
// POST /products/_doc/1
// { "name": "Blue Runner Shoes" }

// GET /products/_search?q=Waterproof  -> 0 hits (stale for <1s)

// For critical write-then-search flows, wait for refresh instead of tuning global interval
// POST /products/_doc/1?refresh=wait_for
// { "name": "Blue Runner Shoes — Waterproof" }
// GET /products/_search?q=Waterproof  -> 1 hit (refresh waited before responding)
```

Rule: keep `refresh_interval` at `1s` for search workloads. Use `refresh=wait_for` only on the few writes where the same user immediately searches, not on bulk imports.

**4. Replica lag check — read from primary after your own write**

```js
// Node + pg: route fresh reads to primary for a short window after write
import { Pool } from 'pg';

const primaryPool = new Pool({ host: 'db-primary.internal', database: 'app' });
const replicaPool = new Pool({ host: 'db-replica.internal', database: 'app' });

// After a user updates their product, remember they need fresh reads for ~5s
const freshUntil = new Map(); // userId -> timestamp

async function updateProduct(userId, productId, name) {
  await primaryPool.query('UPDATE products SET name=$1, updated_at=now() WHERE id=$2', [name, productId]);
  freshUntil.set(userId, Date.now() + 5000);
}

async function searchProducts(userId, q) {
  const needsFresh = (freshUntil.get(userId) || 0) > Date.now();
  const pool = needsFresh ? primaryPool : replicaPool;

  // Add request logging so you can compare primary vs replica in debugging
  console.log(`search q=${q} using ${needsFresh ? 'primary' : 'replica'}`);

  const { rows } = await pool.query(
    "SELECT id, name FROM products WHERE name ILIKE '%' || $1 || '%' ORDER BY updated_at DESC LIMIT 20",
    [q]
  );
  return rows;
}
```

To prove replica lag is the culprit during debugging, run the same `SELECT` against both pools and compare `updated_at` and row counts. If replica is stale but primary is fresh, you have found the layer.

**5. Cache-Control headers that prevent CDN staleness for search**

```js
// For anonymous trending searches — short shared cache is OK
// res.set('Cache-Control', 'public, max-age=10, s-maxage=10, stale-while-revalidate=30');

// For personalized or freshness-critical search — do not cache at edge
// res.set('Cache-Control', 'private, no-store');
// res.set('Vary', 'Authorization, Cookie');
```

`public` lets CDNs cache. `private, no-store` tells CDNs and browsers not to store search results. `Vary` prevents a cached response for one user being served to another.

## 5. Interview Questions — All of Them, Done Properly

**Q: A user updates a product and search returns the old name for a few seconds. Where do you start debugging?**

You start by proving which layer is stale, not by guessing. Reproduce the issue yourself and capture timestamps. Then test each layer in isolation. Bypass the browser cache with a hard refresh and `Cache-Control: no-cache`. Bypass CDN and app cache by calling the origin directly or flushing the Redis key. Query Elasticsearch directly with `GET /index/_search` and check the document version. Query the primary database and the read replica separately. Watch the browser Network tab — are there two overlapping fetches and does the older one finish last? Each test eliminates one layer. The layer where freshness returns is the layer that was serving stale data. Add a correlation ID header so one user action can be traced through CDN, API, cache, search engine, and database logs.

**Q: How do you tell a Redis/CDN cache problem apart from an Elasticsearch refresh_issue?**

Look at timing and scope. A cache problem is tied to the cache TTL and key — the same query `q=waterproof` returns stale for exactly the TTL window (say 60 seconds), while a different query or a cache-busted key returns fresh immediately. Clearing Redis or adding a random query param fixes it instantly. An Elasticsearch refresh issue is tied to the refresh interval — staleness lasts up to about 1 second by default, regardless of query, and `GET /index/_doc/id` returns the new document even though `_search` does not yet. If `refresh=wait_for` on the write makes staleness disappear, the index refresh was the cause. If flushing cache makes it disappear, caching was the cause. Often both contribute, so test one layer at a time.

**Q: What is Elasticsearch `refresh_interval` and why does it make search return old results?**

When you index or update a document, Elasticsearch writes it to an in-memory buffer and the transaction log. The document only becomes visible to search after a refresh, which builds a new tiny segment from the buffer. By default `refresh_interval` is `1s`, so there is up to a one-second window where a `GET` by ID shows the new document but a `_search` still returns the old one. That is by design — it batches segment creation for speed. If someone sets `refresh_interval` to `30s` to improve bulk indexing throughput, search can be stale for 30 seconds. You can set `refresh=wait_for` on important writes to make the request wait until the next refresh, but doing that on every write hurts throughput. For debugging, check `GET /index/_settings` for the interval and look at indexing pressure metrics — an overloaded cluster can fall behind on refreshes.

**Q: How does database replica lag cause stale search, and how do you fix it?**

Your API writes to the primary database, but search queries read from a replica that replays the primary's log asynchronously. Under normal load the lag is a few milliseconds. Under heavy writes or an undersized replica it can be seconds. A search that runs on the replica within that window reads the old row. The proof is querying both: `SELECT updated_at FROM products WHERE id=123` on primary returns the new timestamp, on replica returns the old one. Fixes in order of common use: for read-after-write consistency, route that user's search reads to the primary for a short window after their write (5 to 10 seconds). Or make search read from the primary entirely if freshness matters more than read scaling. Or fix the replication bottleneck — bigger replica, less heavy writes on primary, check `pg_stat_replication` on Postgres for `replay_lag`. Avoid the trap of adding more cache on top of a lagging replica; you just add another stale layer.

**Q: What is the debounced race condition and how do you fix it with `AbortController`?**

When a user types quickly, a debounced input fires multiple fetches: for "bl", "blue", "blue waterproof". Network is not ordered — the fetch for "blue" might take 400ms while "blue waterproof" takes 120ms. If you just set state on every response, the slower older response arrives last and overwrites the correct newer results. The UI shows results that do not match the input. The fix has two parts. First, debounce so you do not fire on every keystroke — wait about 250 to 350ms after typing stops. Second, abort previous fetches with `AbortController` so only the latest request can resolve, and also guard with a sequence number so a late response that was not aborted is ignored. Always handle `AbortError` separately — it is expected, not a failure to show the user.

**Q: When should search use `Cache-Control: public, max-age=60` versus `private, no-store`?**

Use `public` with a short `s-maxage` only for anonymous, non-personalized, and not freshness-critical search — like trending products or public catalog browsing where serving a 10-second-old result to everyone is fine and saves origin load. The CDN can cache it and serve many users from one origin fetch. Use `private, no-store` when search is personalized, filtered by the user's data, or when the user just edited something and expects to see their change immediately. In that case caching at the edge does more harm than good — you want every request to reach the origin and hit fresh data. You can also split the difference: `public, max-age=10, stale-while-revalidate=30` serves slightly stale while revalidating in the background, which trades a little freshness for much lower latency.

**Q: How do you prevent this class of bug from coming back after you fix one instance?**

You add observability and tests around freshness. Emit metrics for cache hit ratio by endpoint, Redis TTLs, CDN cache status via `X-Cache` headers, Elasticsearch refresh lag and indexing queue depth, and database replica `replay_lag`. Alert when replica lag exceeds a threshold like 2 seconds. Add request logging with a correlation ID that ties the write and the subsequent search. In tests, write an integration test that does write then search and asserts the result is fresh within an expected bound — for example, write a product and assert search finds it within 2 seconds. Test the frontend race by mocking slow and fast fetches and asserting only the latest result renders. Make cache invalidation part of the write path tests, not an afterthought.

## 6. The Traps — What Goes Wrong in Production

**Trap: You clear Redis and declare victory, but CDN still serves stale.** You flushed the app cache, tested with `curl` directly to the origin, saw fresh results, and shipped the incident report. But users behind a CDN edge cache still get stale for the CDN's TTL because you never purged the CDN or set proper `Cache-Control`. Always check every cache layer — browser, CDN, Redis, and Elasticsearch's own request cache. Purge or version each layer that caches search, and add `X-Cache` headers so debugging can tell hit from miss.

**Trap: You tune Elasticsearch `refresh_interval` to 30 seconds for bulk import speed and forget to put it back.** Bulk indexing is faster with a long refresh interval because fewer segments are built. Someone set it to `30s` during a migration and left it. Now every product edit takes 30 seconds to appear in search. Fix by resetting to `1s` after bulk jobs, or set the interval only for the duration of the import and use `refresh=wait_for` selectively, not globally.

**Trap: You debounce on the frontend but do not abort, so fast typists see flicker and stale results.** Debounce alone reduces the number of requests but does not prevent out-of-order responses. Without `AbortController` or a sequence guard, the UI still flickers as older requests land. Test this by throttling the network in DevTools to "Slow 3G" and typing quickly — if results jump back to an earlier query, you have the race.

**Trap: You switch `GET /api/search` to `POST` to dodge CDN caching.** It works — most CDNs do not cache POST — but you lose HTTP caching semantics, browser back button behavior, and you introduce CSRF considerations. It also hides the intent of the API. Fix the caching headers instead of changing the verb to work around them. Search should be `GET` with correct `Cache-Control`.

**Trap: You cache search results without including all inputs in the cache key.** The cache key is `search:q=shoes` but the query also filters by `category`, `userId`, or `locale`. User A searches for shoes in category "running" and that result is cached. User B searches for shoes in "formal" and gets the cached running shoes. Include every parameter that changes the result in the key, or version the cache by the data it depends on.

**Trap: You read from a replica for search and never measure replica lag.** Everything works in staging with tiny data. In production, the primary handles heavy writes, the replica falls behind by 4 seconds during peak, and every search after a write looks stale. The team blames the search index for weeks. Add replica lag monitoring (`pg_stat_replication` on Postgres, `SHOW SLAVE STATUS` on MySQL) and alert on it. Route freshness-critical reads to the primary.

**Trap: You add aggressive caching to fix latency and create a freshness regression.** Search was slow at p95, so you add a 5-minute Redis TTL. Latency drops, and a week later support reports stale results. Performance and freshness trade off — measure both. A short TTL like 10 to 15 seconds often gives most of the latency benefit with acceptable staleness, and explicit invalidation on writes removes the worst cases.

## 7. Compare With Related Concepts

**Cache TTL staleness versus replica lag — both serve old data but for different reasons.** A cache serves old data because you told it to keep the answer for N seconds to save work. The data is fresh in the database the whole time — the cache just chooses not to look. Replica lag serves old data because the replica genuinely does not have the new data yet — the replication truck has not arrived. The tell during debugging is what fixes it instantly. If deleting the cache key fixes it, it was cache TTL. If querying the primary fixes it but deleting the cache does not, it is replica lag. The rule: use short TTL plus explicit invalidation for cache staleness; use primary reads or a bounded freshness window for replica lag. Do not add more caching to hide replica lag.

**Elasticsearch refresh staleness versus application cache staleness — one second versus tens of seconds.** Refresh staleness is built into the search engine and bounded by `refresh_interval`, usually about 1 second. It affects only search, not direct document fetch. Application cache staleness is your own TTL choice, often 15 to 300 seconds, and affects the full API response. The rule: tune refresh only when 1 second is truly too slow for your product, and use `refresh=wait_for` surgically. Tune cache TTL as your main freshness knob.

**Debounced race condition versus any server-side staleness — the stale answer comes from the client, not the server.** With a race condition the server returned the correct answer for each query — the client just displayed the wrong one last. No amount of cache purging fixes it. The proof is the Network tab: every response body is correct for its own `q` param, but the rendered UI matches an older `q`. The rule: if server logs show correct responses per query, fix the client with abort and sequence guards. If server responses are stale, fix the server layers.

**CDN edge cache versus Redis app cache — same idea at different distances.** CDN cache lives at the edge close to the user and is hard to invalidate per-key globally. Redis cache lives next to your API and is easy to `DEL`. CDN staleness affects users by geography — one edge is fresh while another is stale. Redis staleness affects all users of that API instance equally. The rule: keep CDN TTLs very short or `no-store` for search; use Redis for search caching where you control invalidation directly.

## 8. 🧠 The Memory Hook

Stale search is not one bug — it is every person in the answer chain holding an old photocopy for a different reason. The warehouse has the truth. The sticky note, the printed catalog, the card file, and the delivery truck each hold it back on their own schedule. Debug by asking each person the same question and seeing who still has last week's answer.
