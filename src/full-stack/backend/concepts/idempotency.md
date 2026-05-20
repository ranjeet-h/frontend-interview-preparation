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

1. What is idempotency?
2. Which HTTP methods are idempotent?
3. Why is POST not idempotent by default?
4. What is an idempotency key?
5. How do you prevent duplicate payment processing?
6. How do you handle webhook retries?
7. Where do you store idempotency keys?
8. How long should keys be retained?

## 8. Active recall test

1. Explain why retries can create duplicate orders.
2. Design an idempotent payment callback.
3. What should the server return for a duplicate idempotency key?
4. Why must key scope include user or route context?

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

