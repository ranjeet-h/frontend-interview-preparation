# HTTP Methods

## Detailed explanation

HTTP methods describe the intended action for a request. Backend APIs use them to make behavior predictable: `GET` reads, `POST` creates or triggers actions, `PUT` replaces, `PATCH` partially updates, and `DELETE` removes. Understanding safety and idempotency is more important than memorizing method names.

## 1. One-line mental model

HTTP methods are verbs that tell the server what kind of operation the client wants.

## 2. Problem it solves

Without standard methods, clients cannot reason about caching, retries, side effects, or API behavior.

## 3. Core idea

- `GET` retrieves data and should not mutate state.
- `POST` creates resources or runs non-idempotent actions.
- `PUT` replaces a resource at a known URL.
- `PATCH` updates part of a resource.
- `DELETE` removes or marks a resource as removed.

## 4. Visual / analogy

```txt
GET    = read
POST   = create / submit command
PUT    = replace
PATCH  = modify fields
DELETE = remove
```

Methods are traffic signs for API behavior.

## 5. Minimal example

```http
POST /api/products
Content-Type: application/json

{
  "name": "Keyboard",
  "price": 1200
}
```

## 6. Real-world example

```txt
GET /users/me
POST /orders
PUT /users/me/profile
PATCH /orders/123/status
DELETE /sessions/current
```

## 7. Common interview questions

1. What are the main HTTP methods?
2. Which methods are safe?
3. Which methods are idempotent?
4. When should you use POST?
5. When should you use PUT?
6. When should you use PATCH?
7. Can DELETE be idempotent?
8. Should GET ever change data?

## 8. Active recall test

1. Pick the right method for creating an order.
2. Pick the right method for replacing a profile.
3. Pick the right method for changing only order status.
4. Explain safe vs idempotent.

## 9. Mistakes / traps

- Using `POST` for every endpoint.
- Mutating data with `GET`.
- Treating `PUT` and `PATCH` as identical.
- Forgetting retries depend on idempotency.

## 10. Compare with related concepts

HTTP methods are not status codes. Methods describe the request intent; status codes describe the response result. HTTP methods are also not route names; `/users` is the resource, `GET` is the action.

## 11. Summary from memory

Explain `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` with one real endpoint each.

## 12. Spaced revision prompts

- Day 1: List common HTTP methods.
- Day 3: Explain safe methods.
- Day 7: Explain idempotent methods.
- Day 14: Design CRUD endpoints for products.

