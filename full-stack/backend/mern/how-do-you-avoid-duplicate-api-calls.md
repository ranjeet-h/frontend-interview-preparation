# How to Avoid Duplicate API Calls in MERN: Request Deduplication, Debouncing, and Backend Idempotency

## 1. Why This Exists — The Problem First

Imagine a user on a sluggish 3G connection trying to buy a $1,200 laptop on your e-commerce store. They click "Place Order." The page hangs for two seconds because the payment gateway is processing. Thinking the click did not register, the user frantically taps "Place Order" three more times. Without proper safeguards, the browser fires four identical `POST /api/orders` requests across the wire. 

Your Express server receives all four requests at virtually the same millisecond. Each worker thread reads the cart, verifies stock, contacts Stripe, charges the credit card, and creates an order document in MongoDB. The user is charged $4,800, four confirmation emails go out, and inventory drops by four units. 

Now consider a second scenario: a search typeahead bar. A user types "mongodb". As the user types `m -> mo -> mon -> mong -> mongo -> mongodb`, the frontend fires six rapid GET requests. Because of unpredictable database load and network jitter, the response for query `"mo"` takes 650ms, while the final query `"mongodb"` returns in 70ms. The UI resolves `"mongodb"` first, populates the dropdown, and then 500ms later the slow `"mo"` response lands and overwrites the state. The user sees search suggestions for `"mo"` despite having typed `"mongodb"`.

Duplicate API calls are not just a cosmetic UI glitch. In a full-stack MERN application, they cause:
- Financial loss through accidental duplicate charges.
- Data corruption and split-brain document states in MongoDB.
- Out-of-order race conditions that leave UI state out of sync with user intent.
- Wasted server CPU cycles, memory, and database connection pool exhaustion.

Preventing duplicate calls requires a coordinated, multi-tier defense spanning frontend event handlers, client-side network layers, backend middleware, and database schema constraints.

## 2. The Analogy — Make It Obvious

Think of a full-stack application as a high-end restaurant:

1. **Debouncing (The Patient Waiter):** When you sit down and start speaking your order, the waiter does not sprint to the kitchen after every single word you utter. They wait until you finish speaking and pause for a few seconds before writing down the final order and walking to the kitchen.
2. **In-Flight Request Deduplication (The Shared Whiteboard):** Three different waiters realize they all need to check today's chef specials for their respective tables. Instead of all three running into the kitchen and yelling the exact same question at the head chef, the first waiter walks in to ask, while the other two check the pass. Once the head chef answers, all three waiters get the answer from that single inquiry.
3. **Request Cancellation via AbortController (The Order Change):** You tell the waiter you want fish, but two seconds later, before the chef puts the fish on the fire, you shout, "Actually, make that steak!" The waiter rips up the fish ticket so the kitchen throws away the old order and only prepares the steak.
4. **Backend Idempotency Keys (The Pre-Numbered Ticket Stamp):** When you place a catering order, you are given a unique receipt number: `#88421`. If you accidentally submit the same slip twice, the head cashier checks the spindle. If `#88421` was already cooked and paid for, the kitchen does not cook a second meal. They hand you a copy of the receipt and point to the meal already packaged on the counter.
5. **Database Unique Constraints (The Kitchen Lockbox):** If two rogue assistants try to punch receipt `#88421` into the register at the exact same microsecond, the register's physical coin-lock rejects the second punch with a loud bell because that ticket number slot is already occupied.

## 3. How It Actually Works — The Full Explanation

A resilient MERN application avoids duplicate API calls by applying four distinct layers of defense. Relying on only one layer leaves massive security and reliability holes.

**Layer 1: UI Event Regulation (Debounce & Throttle)**

At the UI surface, user actions (keystrokes, button clicks, window scrolls) happen at human speed, while backend queries happen at network speed. 

- **Debouncing:** Delays the execution of a function until a specified idle time has passed since the last event. Every new event resets the countdown timer. If a user types ten letters in 500ms with a 300ms debounce delay, only one single API request fires 300ms after the tenth keystroke. Debouncing is ideal for search inputs, autocomplete, and auto-saving form drafts.
- **Throttling:** Enforces a maximum execution rate, ensuring a function runs at most once per fixed time window (e.g., once every 500ms), regardless of how many events fire. Throttling is ideal for infinite scroll pagination, window resizing, and drag-and-drop coordinates.
- **UI State Locks:** For button clicks (like form submissions), set a local pending state (`isPending = true`) or use a React `useRef` flag immediately on click to disable the button and block subsequent click handlers.

**Layer 2: Client-Side In-Flight Deduplication and AbortController**

Even with UI controls, multiple React components in the same tree often request the exact same data on mount.

- **In-Flight Promise Sharing:** Libraries like TanStack Query (React Query) and SWR maintain an internal in-memory cache keyed by query identifier (e.g., `['user', 'profile']`). When Component A and Component B mount simultaneously and both trigger `useQuery(['user', 'profile'])`, the query client checks if a network request for that key is already in progress. If yes, it attaches both components to the same active Promise instead of creating a second HTTP connection. When the response arrives, both components update from that single network roundtrip.
- **Race Condition Prevention with AbortController:** When an asynchronous fetch request is triggered before an older request finishes (such as typing a new query in a search bar or switching tabs), the client must cancel the stale request. Modern browsers provide the `AbortController` API. Passing `controller.signal` into `fetch()` or `axios` allows JavaScript to abort the underlying TCP/HTTP request when a new action occurs. If the old response eventually arrives, the browser discards it, preventing old asynchronous callbacks from setting stale state in React.

**Layer 3: Backend Gateway and Idempotency Middleware (Redis SETNX)**

Frontend guards are easily bypassed by network retries, browser reloads, flaky connections, or malicious scripts. Mutating operations (POST, PATCH) require backend idempotency.

An operation is **idempotent** if making the same request multiple times produces the exact same server state as making it once. GET, PUT, and DELETE are naturally idempotent by HTTP specification; POST is not.

To make POST operations idempotent:
1. The frontend generates a unique UUID (e.g., `crypto.randomUUID()`) representing that specific transaction intent and sends it in the `Idempotency-Key` HTTP header.
2. An Express idempotency middleware intercepts the request before it reaches business logic.
3. The middleware performs an atomic Redis command: `SET idempotency:<key> "IN_PROGRESS" EX 120 NX`.
4. The `NX` flag guarantees that the key is set only if it does not already exist:
   - **Case A (New Request):** Redis returns `OK`. The middleware allows the request to proceed to the controller. Once the controller finishes, an interceptor captures the final HTTP status code and response body, storing them in Redis with a 24-hour expiration: `SET idempotency:<key> <JSON_PAYLOAD> EX 86400`.
   - **Case B (Duplicate in-flight):** Redis returns `null` because the key already exists with value `"IN_PROGRESS"`. Express immediately halts processing and responds with `HTTP 409 Conflict` ("Request currently being processed, please wait") or holds the connection briefly.
   - **Case C (Duplicate completed):** Redis returns `null`, and the stored value contains the cached JSON payload. Express returns the cached status code (e.g., `201 Created`) and payload directly to the client without touching MongoDB or third-party APIs.

**Layer 4: Database-Level Guardrails (Unique Indexes & Atomic Conditional Updates)**

The database is the final source of truth. If two requests slip past Redis (for instance, during a Redis failover or network partition), MongoDB must enforce integrity at the storage engine level.

- **Unique Compound Indexes:** In MongoDB, creating a unique index on `{ userId: 1, idempotencyKey: 1 }` or `{ userId: 1, clientOrderId: 1 }` ensures that even if two Express workers attempt `db.orders.insertOne()` at the exact same microsecond, MongoDB's WiredTiger storage engine detects the duplicate key and rejects the second insert with error code `11000` (DuplicateKey).
- **Atomic Conditional Updates (`findOneAndUpdate`):** Rather than reading a document, modifying it in JavaScript, and saving it back (which is vulnerable to race conditions), use atomic operators with query conditions:
  ```javascript
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: 'PENDING' },
    { $set: { status: 'PROCESSING', processedAt: new Date() } },
    { new: true }
  );
  if (!order) {
    // Another request already transitioned the order out of PENDING
    return res.status(409).json({ message: "Order is already being processed" });
  }
  ```

## 4. Real Code — See It Working

**1. Frontend: React Search with Debounce, TanStack Query, and AbortController**

This component prevents search input spam, deduplicates queries, and automatically cancels stale in-flight HTTP requests when the user types a new character.

```tsx
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// Custom hook to debounce any fast-changing value
function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set a timer to update debounced value after the delay
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    // Clear the timer if the user types again before delayMs expires
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

export function ProductSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // TanStack Query automatically deduplicates identical queries across components
  // and passes an AbortSignal to cancel stale requests when debouncedSearch changes
  const { data: products, isLoading, isError } = useQuery({
    queryKey: ['products', debouncedSearch],
    queryFn: async ({ signal }) => {
      if (!debouncedSearch.trim()) return [];
      
      // Pass signal to axios so the browser cancels in-flight HTTP calls on new keystrokes
      const response = await axios.get(`/api/products?q=${encodeURIComponent(debouncedSearch)}`, {
        signal,
      });
      return response.data;
    },
    // Keep data considered fresh for 1 minute to avoid re-fetching on window refocus
    staleTime: 60 * 1000,
    // Only fire query when there is an active search string
    enabled: debouncedSearch.trim().length > 0,
  });

  return (
    <div className="search-container">
      <input
        type="text"
        placeholder="Search catalog..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      {isLoading && <p>Loading results...</p>}
      {isError && <p>Error loading products.</p>}
      <ul>
        {products?.map((item: { id: string; name: string; price: number }) => (
          <li key={item.id}>{item.name} — ${item.price}</li>
        ))}
      </ul>
    </div>
  );
}
```

**2. Frontend: Axios In-Flight Promise Deduplicator**

If your project does not use TanStack Query, you can deduplicate concurrent identical GET requests directly in an Axios interceptor using an in-memory Map of active Promises.

```typescript
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

// Map storing currently active in-flight promises by request fingerprint
const inFlightRequests = new Map<string, Promise<AxiosResponse>>();

// Generate a deterministic string key for GET requests
function getRequestKey(config: AxiosRequestConfig): string {
  const { method, url, params } = config;
  return `${method?.toUpperCase()}_${url}_${JSON.stringify(params || {})}`;
}

const apiClient = axios.create({ baseURL: '/api' });

apiClient.interceptors.request.use((config) => {
  // Only deduplicate safe, read-only GET requests
  if (config.method?.toLowerCase() !== 'get') {
    return config;
  }

  const key = getRequestKey(config);

  if (inFlightRequests.has(key)) {
    // An identical request is already active over the network.
    // Return a custom adapter that joins the existing in-flight Promise.
    config.adapter = () => {
      return inFlightRequests.get(key)!.then((res) => ({
        ...res,
        config,
      }));
    };
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const key = getRequestKey(response.config);
    inFlightRequests.delete(key);
    return response;
  },
  (error) => {
    if (error.config) {
      const key = getRequestKey(error.config);
      inFlightRequests.delete(key);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

**3. Backend: Express Idempotency Middleware with Redis**

This production Express middleware intercepts incoming requests with an `Idempotency-Key` header, locks the key atomically in Redis with `SET NX`, caches the resulting response, and prevents duplicate executions.

```javascript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export function idempotencyMiddleware(options = { expirySeconds: 86400 }) {
  return async (req, res, next) => {
    // Only apply idempotency to state-changing operations
    if (!['POST', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      // For financial/critical endpoints, you may choose to throw 400 Bad Request
      return next();
    }

    const redisKey = `idempotency:${req.baseUrl}${req.path}:${idempotencyKey}`;

    try {
      // Atomic SET with NX (set only if Not eXists) and short lock TTL (120s)
      const acquiredLock = await redis.set(redisKey, JSON.stringify({ status: 'IN_PROGRESS' }), 'EX', 120, 'NX');

      if (!acquiredLock) {
        // Key already exists. Fetch the existing record.
        const cachedRaw = await redis.get(redisKey);
        if (!cachedRaw) {
          return res.status(500).json({ error: 'Idempotency lock resolution error' });
        }

        const cached = JSON.parse(cachedRaw);

        if (cached.status === 'IN_PROGRESS') {
          // Another concurrent request is actively executing this exact transaction
          return res.status(409).json({
            error: 'Duplicate request in flight. Please wait for the current operation to complete.',
          });
        }

        // Return the cached response previously sent to the client
        res.setHeader('X-Cache-Lookup', 'IDEMPOTENT_HIT');
        return res.status(cached.statusCode).json(cached.body);
      }

      // We won the lock. Intercept res.json to capture and store the final response.
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        // Only cache successful or intentional business outcomes (not transient 500 server crashes)
        if (res.statusCode < 500) {
          const payloadToCache = {
            statusCode: res.statusCode,
            body: body,
          };
          // Persist the completed response with long TTL (e.g. 24 hours)
          redis.set(redisKey, JSON.stringify(payloadToCache), 'EX', options.expirySeconds);
        } else {
          // If server failed with 500, delete the lock so user can retry safely
          redis.del(redisKey);
        }

        return originalJson(body);
      };

      next();
    } catch (err) {
      console.error('Idempotency middleware error:', err);
      // Fail open or fail closed based on your risk profile (critical payments should fail closed)
      return res.status(500).json({ error: 'Internal idempotency check failure' });
    }
  };
}
```

**4. Backend: MongoDB Unique Compound Index and Controller Integration**

This Mongoose model and route handler ensure that even if the Redis lock is unavailable, the database engine guarantees atomic deduplication.

```javascript
import mongoose from 'mongoose';
import express from 'express';
import { idempotencyMiddleware } from './idempotencyMiddleware.js';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  idempotencyKey: { type: String, required: true },
  items: [{ productId: String, quantity: Number, price: Number }],
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' },
  createdAt: { type: Date, default: Date.now }
});

// Enforce unique compound constraint: a user can never insert the same idempotencyKey twice
orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

export const Order = mongoose.model('Order', orderSchema);

const router = express.Router();

router.post('/orders', idempotencyMiddleware(), async (req, res) => {
  const { userId, items, totalAmount } = req.body;
  const idempotencyKey = req.headers['idempotency-key'];

  try {
    const order = new Order({
      userId,
      idempotencyKey,
      items,
      totalAmount,
      status: 'PAID'
    });

    await order.save();
    return res.status(201).json({ success: true, order });
  } catch (error) {
    // Handle MongoDB duplicate key error (code 11000)
    if (error.code === 11000) {
      // Find existing order created by the earlier sibling request
      const existingOrder = await Order.findOne({ userId, idempotencyKey });
      return res.status(200).json({ success: true, order: existingOrder, duplicatePrevented: true });
    }

    console.error('Order creation error:', error);
    return res.status(500).json({ error: 'Failed to process order' });
  }
});

export default router;
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between debouncing and throttling, and when should you choose each for API calls?**

Debouncing and throttling both regulate the frequency of function execution over time, but their timing mechanisms serve different use cases:

- **Debouncing** groups a burst of sequential events into a single execution. It waits for a quiet period of silence (`delayMs`) before running. If a new event occurs during the waiting window, the timer resets to zero. You should choose debouncing whenever you only care about the *final resting state* of user input—such as search autocomplete, typeahead queries, form field validation on blur/idle, or window resize calculations.
- **Throttling** guarantees a regular, predictable cadence by executing a function at most once per fixed time interval (e.g., once every 300ms), ignoring any intermediate events until the window passes. You should choose throttling when you need *continuous feedback during an ongoing stream of events*—such as infinite scroll API requests as the user approaches the bottom of a page, tracking mouse move coordinates for real-time multiplayer cursors, or window scroll position meters.

**Q: How does TanStack Query (React Query) deduplicate identical API calls under the hood?**

TanStack Query manages a centralized `QueryCache` attached to a `QueryClient`. When a component mounts and calls `useQuery({ queryKey: ['users'] })`:

1. It creates a deterministic hash of the `queryKey` array.
2. It looks up the hash in the internal cache map.
3. If an existing `Query` instance with that hash is already in the `fetching` state (an HTTP request is currently in-flight), TanStack Query does not create a new `queryFn` Promise. Instead, it subscribes the new component to the existing in-flight Promise.
4. When the network response resolves, TanStack Query updates the cached data once and notifies all subscriber components simultaneously, causing them to re-render with the identical result.
5. If a query is not currently in-flight but has cached data within its configured `staleTime`, TanStack Query returns the cached data immediately from memory without initiating a network request at all.

**Q: Why is disabling a submit button on the frontend insufficient for preventing duplicate payment or order requests?**

Disabling a button (`<button disabled={isPending}>`) is a visual UX courtesy, not a security or reliability guarantee. It fails in numerous real-world production scenarios:
- **Network Glitches and Retries:** Mobile browsers on spotty networks or HTTP client libraries with automated retry logic (like Axios retry interceptors) will re-send HTTP requests if a TCP socket drops, even if the user only clicked once.
- **Browser Navigation:** A user can click submit, hit the browser "Back" button, and click submit again.
- **Direct API Access & Scripts:** Anyone can inspect the network tab, copy the `curl` command, and post directly to `/api/orders` from a terminal or automated bot.
- **React State Lag:** In React, state updates (`setIsPending(true)`) are asynchronous. If a user double-clicks rapidly within a single animation frame (16ms), both click events can enter the handler before the disabled attribute applies to the DOM.

Because the frontend cannot be trusted, the backend must implement idempotency checks and the database must enforce unique constraints.

**Q: How do you design and implement backend idempotency using Redis and the `Idempotency-Key` header?**

The standard pattern follows the IETF Idempotency-Key specification:
1. The client generates a unique UUID (v4) for every mutation intent and sends it via `Idempotency-Key: <uuid>`.
2. The Express server passes the request through an idempotency middleware.
3. The middleware performs an atomic Redis `SET idempotency:<uuid> "IN_PROGRESS" EX 120 NX`.
4. If Redis returns `null`, the key already exists:
   - If the stored value is `"IN_PROGRESS"`, return `HTTP 409 Conflict` to indicate a concurrent duplicate is executing.
   - If the stored value contains a completed response object, return the cached HTTP status and body directly with an `X-Cache-Lookup: HIT` header, bypassing business logic and DB writes.
5. If Redis returns `OK`, the lock was acquired. The controller executes, creates records in MongoDB, and processes payments.
6. A response wrapper captures the controller's `res.json()` output and saves `{ statusCode, body }` into Redis with a 24-hour TTL.
7. If the controller throws a fatal 500 error, the middleware deletes the Redis key so the client is allowed to retry the operation.

**Q: What happens if a duplicate request arrives at the backend while the first request with the same Idempotency-Key is still processing?**

This is an **in-flight collision**. The first request has acquired the lock (`"IN_PROGRESS"` in Redis), but has not yet finished its database write or payment gateway call.

There are two primary architectures to handle this:
1. **Fast-Fail with HTTP 409 Conflict (Recommended for HTTP APIs):** The backend immediately returns `409 Conflict` with a payload like `{ error: "Transaction currently processing" }`. The client UI handles this by keeping the loading spinner active and polling or waiting.
2. **Short-Lived Polling / Mutex Wait (Backend Holding):** The middleware does not fail immediately. It enters a sleep loop (polling Redis every 100ms for up to 2–3 seconds) waiting for the `"IN_PROGRESS"` flag to flip to a completed payload. Once the first request completes and writes the final response to Redis, the second connection unblocks and returns the finished result. If the timeout expires before completion, it returns `409 Conflict` or `504 Gateway Timeout`.

**Q: How do you prevent out-of-order race conditions in search typeaheads using `AbortController`?**

When asynchronous API calls complete out of order, older responses can overwrite newer responses in React state. 

To prevent this:
1. Maintain an active `AbortController` instance.
2. Whenever the search input changes, call `controller.abort()` on the previous controller instance. This sends an abort signal to the browser's underlying fetch API, instantly canceling the network socket or discarding the returned packet.
3. Instantiate a fresh `controller = new AbortController()`.
4. Pass `controller.signal` into `fetch(url, { signal })` or `axios.get(url, { signal })`.
5. Wrap the fetch call in a `try...catch` block that specifically ignores errors where `error.name === 'AbortError'` or `axios.isCancel(error)`.
6. When using TanStack Query, the `queryFn` receives `{ signal }` automatically in its context parameter. Whenever the `queryKey` changes, TanStack Query aborts the previous signal automatically.

**Q: How do database unique compound indexes and conditional updates act as the ultimate safety net against duplicate writes?**

Even if frontend debouncing, in-flight deduplication, and Redis idempotency all fail simultaneously (for example, if Redis crashes or runs out of memory), the database engine provides mathematical ACID guarantees:

1. **Unique Compound Index (`{ userId: 1, idempotencyKey: 1 }`):** When two server pods execute `insertOne()` with the same keys at the exact same microsecond, MongoDB's storage engine locks the index bucket. Only one document succeeds; the second receives an unrecoverable E11000 duplicate key error. The application catches E11000 and gracefully queries the existing record to return it.
2. **Conditional Atomic Updates (`findOneAndUpdate`):** By including the expected current state in the query filter (e.g., `{ _id: invoiceId, status: 'UNPAID' }`), MongoDB guarantees that only the first thread to execute `$set: { status: 'PAID' }` matches the document. The second thread finds 0 matching documents and is blocked from applying duplicate logic.

## 6. The Traps — What Goes Wrong

**Trap 1: Caching 500 Internal Server Errors in the Idempotency Store**
- *The Mistake:* Writing the idempotency response to Redis inside a generic `finally` block or without checking `res.statusCode`.
- *Why it breaks:* If the database is momentarily overloaded or a third-party payment API times out, Express sends a `500 Internal Server Error`. If this 500 response is saved in Redis with a 24-hour TTL under the user's `Idempotency-Key`, every subsequent retry by the user will instantly replay the cached 500 error forever, completely locking them out of completing their purchase.
- *The Fix:* Only cache responses with status codes `< 500` (e.g. 200, 201, 400, 422). If a request fails due to an unexpected 500 crash or network timeout, explicitly call `redis.del(redisKey)` so the user can safely retry.

**Trap 2: Using Non-Atomic Redis Check-Then-Set Commands**
- *The Mistake:* Checking if a key exists with `await redis.exists(key)` and then calling `await redis.set(key, val)` in a separate line.
- *Why it breaks:* In Node.js, asynchronous I/O allows two concurrent requests to both execute `redis.exists(key)` before either has executed `redis.set()`. Both find that the key does not exist, both proceed past the check, and both execute the payment logic in parallel.
- *The Fix:* Always use atomic commands. Use `redis.set(key, value, 'EX', ttl, 'NX')`. The `NX` option guarantees atomic evaluation on the Redis single-threaded engine.

**Trap 3: Generating the Idempotency Key on the Backend**
- *The Mistake:* Generating a UUID inside the Express route handler or middleware when the request arrives.
- *Why it breaks:* If the server creates the key, every retry sent by a flaky client or duplicate button click receives a brand-new UUID. The backend treats each retry as an independent transaction, completely defeating the purpose of idempotency.
- *The Fix:* The client origin (browser, mobile app) must generate the `Idempotency-Key` when the user initiates the business action, reusing that exact same key if it re-sends the payload due to a network timeout.

**Trap 4: Query Key Mismatches in TanStack Query**
- *The Mistake:* Using inconsistent query keys for the same endpoint across different components, such as `['user', userId]` in the Navbar and `['user-profile', { id: userId }]` in the Settings page.
- *Why it breaks:* TanStack Query serializes keys to compute cache hashes. Because the strings and object structures differ, it treats them as two completely unrelated queries, firing two simultaneous network calls for the exact same resource.
- *The Fix:* Create centralized query key factories:
  ```typescript
  export const userKeys = {
    all: ['users'] as const,
    detail: (id: string) => [...userKeys.all, 'detail', id] as const,
  };
  ```

**Trap 5: Unhandled `AbortError` Rejections in Fetch / React Components**
- *The Mistake:* Aborting a fetch request via `AbortController` without catching the resulting rejection.
- *Why it breaks:* Calling `controller.abort()` causes the fetch Promise to reject with a DOMException named `AbortError`. If your `catch` block treats this like a standard network failure, your app will trigger global error toasts ("Failed to fetch data") every time a user types a letter in a search bar.
- *The Fix:* Explicitly inspect the error in your catch handler:
  ```javascript
  try {
    const res = await fetch(url, { signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      // Intentionally aborted by user action; ignore silently
      return;
    }
    showErrorToast(err.message);
  }
  ```

## 7. Compare With Related Concepts

**Debouncing vs. Throttling**
- *The Difference:* Debouncing delays execution until a quiet period of inactivity occurs (resetting the timer on every event). Throttling enforces a steady maximum execution rate over time (executing at most once per interval).
- *Rule of Thumb:* Use debouncing when you only need the result after the user *stops* acting (search typing, auto-saving forms). Use throttling when you need steady periodic execution *while* the user is actively acting (infinite scrolling, canvas drawing).

**In-Flight Request Deduplication vs. Response Caching (staleTime / HTTP Cache-Control)**
- *The Difference:* In-flight deduplication shares a single *active, pending HTTP socket* among simultaneous callers mounting at the exact same moment. Response caching stores *already-completed data* in memory or disk to serve future requests over an extended period.
- *Rule of Thumb:* In-flight deduplication eliminates concurrent network spikes during page load; response caching eliminates subsequent network calls over time.

**Client-Side Request Cancellation (`AbortController`) vs. Server-Side Execution Cancellation**
- *The Difference:* `AbortController` closes the client-side socket and tells the browser to ignore the incoming response. It does not automatically stop Node.js or MongoDB from completing an already-dispatched database query unless your backend server explicitly listens to `req.on('close')` and propagates the abort signal to the database driver.
- *Rule of Thumb:* Use `AbortController` to prevent client-side UI race conditions; use backend idempotency and short database query timeouts to protect server resources.

**Backend Idempotency Keys vs. Distributed Locking (Redlock)**
- *The Difference:* Idempotency keys are designed to return a cached *business outcome* for repeated requests over hours or days. Distributed locks (like Redlock in Redis) are short-lived mutexes (milliseconds to seconds) designed to serialize concurrent access to a shared resource across multiple server instances.
- *Rule of Thumb:* Use idempotency keys for HTTP API safety and payment replay prevention; use distributed locks inside background worker jobs or queue processors to prevent two workers from processing the same queue item simultaneously.

## 8. 🧠 The Memory Hook

Debounce the trigger, share the in-flight flight with TanStack Query, cancel stale responses with `AbortController`, lock the door with a Redis `Idempotency-Key` using atomic `SET NX`, and anchor the floor with a MongoDB Unique Compound Index. If an API call can cost money or corrupt data, client-side guards are only polite suggestions—the backend idempotency key is the law.
