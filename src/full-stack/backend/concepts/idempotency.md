# Idempotency

## Detailed explanation

Idempotency means repeating the same operation multiple times produces the same final result as running it once. Backend systems use idempotency to make retries safe, especially for payment, order creation, webhook processing, and unreliable networks. It is one of the highest-value API design topics for senior interviews.

## 1. One-line mental model

Idempotency makes duplicate requests safe by ensuring repeated attempts do not create repeated side effects.

## 2. Problem it solves

Networks fail, clients retry, users double-click, webhooks resend, and queues deliver at least once. Without idempotency, duplicate orders, charges, emails, or records can be created.

## 3. Core idea

- Safe retries need stable operation identity.
- `GET`, `PUT`, and `DELETE` are usually idempotent by design.
- `POST` is not automatically idempotent.
- Idempotency keys let the server recognize duplicate create/action requests.
- The server should return the original result for duplicate keys.

## 4. Visual / analogy

```txt
POST /orders
Idempotency-Key: abc-123

First request  -> creates order #500
Retry request  -> returns order #500 again
No duplicate order
```

It is like a receipt number: if the cashier already processed that receipt, they do not charge again.

## 5. Minimal example

```js
app.post("/orders", async (req, res) => {
  const key = req.header("Idempotency-Key");
  const existing = await idempotencyStore.find(key);

  if (existing) {
    return res.status(existing.status).json(existing.body);
  }

  const order = await createOrder(req.body);
  await idempotencyStore.save(key, 201, { data: order });

  res.status(201).json({ data: order });
});
```

## 6. Real-world example

Payment processors use idempotency keys so a retry of `POST /charges` does not charge the customer twice if the first response was lost.

## 7. Common interview questions

#### What is idempotency?
- **The Engine Mechanism (Why it behaves this way):** Idempotency is a property of an operation where performing it multiple times produces the same final result as performing it once. In backend systems, this means if a client sends the same request twice (due to network retry, double-click, or timeout), the server's state after both requests is identical to the state after just one. The server achieves this by recognizing duplicate requests — typically through idempotency keys — and returning the original result instead of re-executing the operation.
- **The Unforgettable Mental Model:** Idempotency is like **a receipt at a store**. If you show the same receipt twice, the cashier doesn't charge you again — they just show you the original transaction details.
- **The Trap:** Confusing idempotency with "no side effects." Idempotent operations CAN have side effects (creating a resource, charging a card) — the key is that repeating them doesn't create additional side effects.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Idempotency means that performing an operation multiple times produces the same final state as performing it once. In API design, this is critical for safe retries — if a request times out, the client can resend it without risking duplicate side effects like double charges or duplicate orders. The server recognizes duplicate requests through idempotency keys or inherent method semantics and returns the original result instead of re-executing the operation."

#### Which HTTP methods are idempotent?
- **The Engine Mechanism (Why it behaves this way):** GET, HEAD, OPTIONS, PUT, and DELETE are idempotent by HTTP specification. GET/HEAD/OPTIONS are safe (no side effects) and therefore trivially idempotent. PUT is idempotent because replacing a resource with the same data yields the same state. DELETE is idempotent because removing an already-removed resource is a no-op. POST is not idempotent — each call typically creates a new resource. PATCH is conditionally idempotent depending on the operation.
- **The Unforgettable Mental Model:** Idempotent methods are **light switches** — flipping them to the same position repeatedly doesn't change the light's state. Non-idempotent methods are **adding a coin to a piggy bank** — each addition changes the total.
- **The Trap:** Assuming the server automatically makes PUT and DELETE idempotent. If the server logs each DELETE or triggers notifications on every call, it breaks the idempotency contract even though the resource state is the same.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: GET, HEAD, OPTIONS, PUT, and DELETE are idempotent by HTTP specification. GET, HEAD, and OPTIONS are safe methods with no side effects, so they're trivially idempotent. PUT replaces a resource with the same representation each time, producing the same state. DELETE removes a resource — deleting an already-deleted resource has no additional effect. POST is not idempotent because each call typically creates a new resource. PATCH depends on the implementation — setting values is idempotent, but incrementing counters is not."

#### Why is POST not idempotent by default?
- **The Engine Mechanism (Why it behaves this way):** POST is designed for creating new resources or triggering actions, and each call typically produces a new result — a new database row, a new charge, a new email. The server has no built-in mechanism to recognize that two POST requests are "the same" because POST doesn't target a specific resource URL (the resource doesn't exist yet). Without an idempotency key, the server processes each POST independently, creating duplicates on retry.
- **The Unforgettable Mental Model:** POST is like **dropping a letter in a mailbox**. Each letter you drop creates a new delivery. Dropping the same letter twice means two deliveries.
- **The Trap:** Relying on frontend debouncing to prevent duplicate POST requests. Network failures happen after the request leaves the browser — the frontend has no way to know if the server received it. Only server-side idempotency is reliable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: POST is not idempotent because each call typically creates a new resource or triggers a new action, and the server has no way to know if two POST requests represent the same intended operation. Without an idempotency mechanism, retrying a POST that timed out creates duplicates — two orders, two charges, two emails. This is why critical POST endpoints like payments and order creation should support idempotency keys, allowing the server to recognize and deduplicate retry attempts."

#### What is an idempotency key?
- **The Engine Mechanism (Why it behaves this way):** An idempotency key is a unique identifier (usually a UUID) that the client generates and sends with a request, typically in a header like `Idempotency-Key: abc-123`. The server stores this key along with the response it produced. When a subsequent request arrives with the same key, the server recognizes it as a duplicate and returns the stored response without re-executing the operation. The key must be scoped to the user or context to prevent key collisions across different clients.
- **The Unforgettable Mental Model:** An idempotency key is like a **claim ticket at a coat check**. You hand in your coat (request) and get a ticket (key). If you show the same ticket again, you get the same coat back — they don't take another coat.
- **The Trap:** Using non-unique keys or keys that don't include user context. If two users send the same key, the server might incorrectly treat them as duplicates. Keys should be scoped per-user or per-session.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An idempotency key is a unique identifier the client generates and sends with a request, typically as a header. The server stores the key along with the response it produced. When a duplicate request arrives with the same key, the server returns the stored response instead of re-executing the operation. The key must be scoped to the user or context to prevent collisions. I store keys in Redis or a database with a TTL, and I save the key and response atomically with the side effect to prevent race conditions."

#### How do you prevent duplicate payment processing?
- **The Engine Mechanism (Why it behaves this way):** Payment endpoints use idempotency keys to prevent double charges. When a `POST /charges` request arrives with an idempotency key, the server checks if the key exists in the idempotency store. If it does, the server returns the original charge result. If not, the server processes the payment, stores the key with the response, and returns the result. The key storage and payment processing must be atomic — typically using a database transaction — to prevent race conditions where concurrent duplicate requests both pass the key check.
- **The Unforgettable Mental Model:** Payment idempotency is like a **stamp on a passport**. Once a page is stamped, showing the same passport again doesn't get you a second stamp — the border agent sees the existing one.
- **The Trap:** Storing the idempotency key after processing the payment instead of atomically with it. If the server crashes between processing and storing the key, a retry creates a duplicate charge.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent duplicate payment processing using idempotency keys. The client generates a unique key and sends it with the payment request. The server checks if the key exists — if so, it returns the original result. If not, it processes the payment and stores the key with the response atomically in a database transaction. This prevents race conditions where concurrent retries both pass the key check. The key has a TTL matching the payment retry window, typically 24-48 hours."

#### How do you handle webhook retries?
- **The Engine Mechanism (Why it behaves this way):** Webhook providers retry deliveries when they don't receive a 2xx response. The receiving server must handle these retries idempotently. Each webhook event includes a unique event ID. The server checks if the event ID has already been processed — if yes, it returns 200 immediately. If no, it processes the event, stores the event ID, and returns 200. The event ID check and processing must be atomic. Additionally, the server should verify the webhook signature to ensure the event is authentic.
- **The Unforgettable Mental Model:** Webhook idempotency is like **a package delivery signature**. If the delivery person already has your signature, they don't deliver the package again — they just note it was already received.
- **The Trap:** Processing the webhook before checking if the event ID was already handled. If the server crashes after processing but before returning 200, the provider retries and the event is processed twice.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle webhook retries by checking the event ID before processing. Each webhook delivery includes a unique event ID. The server first checks if this ID has already been processed — if yes, return 200 immediately. If no, process the event atomically with storing the event ID, then return 200. I also verify the webhook signature to authenticate the sender. This ensures that even if the provider retries due to a timeout, the event is only processed once."

#### Where do you store idempotency keys?
- **The Engine Mechanism (Why it behaves this way):** Idempotency keys are stored in a fast, durable store accessible to all server instances. Redis is the most common choice because it provides atomic operations (SETNX, Lua scripts), TTL support, and sub-millisecond lookups. For single-instance apps, in-memory stores work but lose keys on restart. For distributed systems, a database table with a unique constraint on the key column also works but is slower. The store must support atomic check-and-set to prevent race conditions between concurrent duplicate requests.
- **The Unforgettable Mental Model:** The idempotency key store is like a **guest list at a club**. The bouncer checks the list before letting anyone in — if your name is already there, you've been processed.
- **The Trap:** Using a local in-memory store in a multi-instance deployment. If instance A stores the key but instance B receives the retry, instance B won't find the key and will process the duplicate.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store idempotency keys in Redis for distributed systems because it provides atomic operations, fast lookups, and TTL support. For single-instance apps, an in-memory Map works but loses keys on restart. The critical requirement is that the store is shared across all server instances and supports atomic check-and-set operations to prevent race conditions. I use Redis SETNX or a Lua script to atomically check if the key exists and set it in one operation, preventing concurrent duplicates from both passing the check."

#### How long should keys be retained?
- **The Engine Mechanism (Why it behaves this way):** Idempotency keys should be retained long enough to cover the maximum retry window of clients and network infrastructure. For payment APIs, Stripe recommends 24 hours. For general APIs, 24-48 hours is typical. The TTL should be set when storing the key so expired keys are automatically cleaned up. Retaining keys indefinitely wastes storage and creates unnecessary lookup overhead. The retention period should be documented so clients know how long they can safely retry.
- **The Unforgettable Mental Model:** Key retention is like a **return policy window**. The store keeps your receipt valid for 30 days — after that, they can't process the return even with the receipt.
- **The Trap:** Setting the TTL too short (e.g., 5 minutes) when clients may retry for hours. Or setting it too long (e.g., 30 days) which wastes storage and increases the chance of key collisions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I set idempotency key TTL based on the expected retry window. For payment APIs, 24 hours covers most retry scenarios. For general APIs, 24-48 hours is reasonable. The TTL is set when storing the key so expired entries are automatically cleaned up by Redis or the database. I document the retention period so clients know how long they can safely retry. Setting it too short risks duplicate processing on late retries; setting it too long wastes storage."

## 8. Active recall test

1. **Explain why retries can create duplicate orders.**
   - **Explanation:** When a POST request times out, the client doesn't know if the server received it. Retrying sends a second POST, which the server processes as a new request, creating a second order. Without idempotency keys, the server has no way to recognize the retry as a duplicate of the original request.

2. **Design an idempotent payment callback.**
   - **Explanation:** The client sends `POST /charges` with header `Idempotency-Key: uuid`. The server checks Redis for the key. If found, returns the stored response. If not, processes the payment atomically with storing the key and response in Redis with a 24-hour TTL, then returns the result. Uses a Redis Lua script for atomic check-and-set.

3. **What should the server return for a duplicate idempotency key?**
   - **Explanation:** The exact same response (status code and body) that was returned for the original request. If the original returned 201 with the created order, the duplicate returns 201 with the same order. This ensures the client gets a consistent result regardless of whether it's the first attempt or a retry.

4. **Why must key scope include user or route context?**
   - **Explanation:** Without scoping, two different users could generate the same idempotency key (e.g., both use UUID v4 with a collision, or both use a simple counter). The server would incorrectly treat User B's request as a duplicate of User A's. Scoping the key with user ID or route (e.g., `user:123:abc-123`) ensures uniqueness per context.

## 9. Mistakes / traps

- Saying idempotency means "no side effects."
- Trusting the frontend to prevent duplicates.
- Storing the idempotency key after the side effect without a transaction.
- Using a non-unique key across users.
- Ignoring concurrent duplicate requests.

## 10. Compare with related concepts

Idempotency is not debouncing. Debouncing delays calls; idempotency makes repeated calls safe. Idempotency is not exactly-once delivery; it is a practical design for tolerating duplicate delivery.

## 11. Summary from memory

Explain how you would prevent duplicate order creation when a user double-clicks checkout.

## 12. Spaced revision prompts

- Day 1: Define idempotency.
- Day 3: List idempotent HTTP methods.
- Day 7: Design idempotency keys for payments.
- Day 14: Explain race conditions in idempotent APIs.

