# REST

## Detailed explanation

REST is an architectural style for designing network APIs around resources, standard HTTP methods, stateless requests, cacheability, and consistent representations. A REST API treats domain objects like users, orders, and products as resources identified by URLs, then uses HTTP methods to act on them.

## 1. One-line mental model

REST means modeling backend APIs as resources manipulated through standard HTTP semantics.

## 2. Problem it solves

Without REST-like conventions, every API invents its own action names, response patterns, and behavior, making clients harder to understand and maintain.

## 3. Core idea

- Resources are nouns: `/users`, `/orders/123`.
- HTTP methods express actions: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- Requests should be stateless.
- Responses use standard status codes and representations like JSON.
- APIs should be predictable, cacheable where possible, and backward compatible.

## 4. Visual / analogy

```txt
GET    /products       -> list products
POST   /products       -> create product
GET    /products/42    -> read product
PATCH  /products/42    -> update product fields
DELETE /products/42    -> delete product
```

REST is like a filing system: URL picks the file, HTTP method says what you want to do.

## 5. Minimal example

```http
GET /api/users/123 HTTP/1.1
Accept: application/json
```

```json
{
  "data": {
    "id": "123",
    "name": "Asha"
  }
}
```

## 6. Real-world example

An order API might expose:

```txt
GET /orders?status=paid&limit=20
POST /orders
GET /orders/:id
PATCH /orders/:id/status
POST /orders/:id/cancel
```

Some domain actions like canceling an order may use command-style subresources when plain CRUD does not express the business action cleanly.

## 7. Common interview questions

1. What is REST?
2. What makes an API RESTful?
3. Why should URLs use nouns instead of verbs?
4. What does stateless mean in REST?
5. Is every JSON API a REST API?
6. How do REST and GraphQL differ?
7. How do you version REST APIs?
8. How do you represent errors in REST?

## 8. Active recall test

1. Design REST routes for products.
2. Explain why `GET /deleteUser?id=1` is poor REST design.
3. What should `POST /orders` return after creation?
4. How would you model a non-CRUD action?

## 9. Mistakes / traps

- Calling any HTTP JSON API REST.
- Using verbs everywhere in URLs.
- Ignoring HTTP status codes.
- Making `GET` endpoints mutate server state.
- Treating REST as only CRUD.

## 10. Compare with related concepts

REST is not a protocol; HTTP is the protocol. REST is not GraphQL; GraphQL exposes a typed query language and usually one endpoint. REST is not RPC; RPC APIs focus on calling actions.

## 11. Summary from memory

Explain REST using users, orders, methods, status codes, and statelessness.

## 12. Spaced revision prompts

- Day 1: Define REST in one sentence.
- Day 3: Design REST routes for a product catalog.
- Day 7: Compare REST with RPC.
- Day 14: Explain how to handle non-CRUD actions.

