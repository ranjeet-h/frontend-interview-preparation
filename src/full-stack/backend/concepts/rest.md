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

#### What is REST?
- **The Engine Mechanism (Why it behaves this way):** REST (Representational State Transfer) is an architectural style defined by Roy Fielding's doctoral thesis. It constrains API design around resources identified by URIs, uniform interfaces using standard HTTP methods, stateless interactions where each request contains all necessary context, cacheable responses, layered system architecture, and optional code-on-demand. The backend implements these constraints by mapping domain entities to URL paths, using HTTP methods for CRUD semantics, returning appropriate status codes, and structuring responses in consistent representations like JSON.
- **The Unforgettable Mental Model:** REST is a **library catalog system**. Each book has a unique call number (URL), you use standard actions (borrow, return, reserve = HTTP methods), each transaction is independent (stateless), and the catalog card tells you everything you need (self-descriptive messages).
- **The Trap:** Calling any JSON-over-HTTP API "RESTful." True REST requires statelessness, cacheability, uniform interface, proper use of HTTP semantics, and hypermedia links (HATEOAS). Most "REST APIs" are actually just HTTP APIs with JSON.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: REST is an architectural style for designing network APIs that treats domain objects as resources identified by URLs. It uses standard HTTP methods to express operations — GET for reading, POST for creating, PUT/PATCH for updating, DELETE for removing. REST APIs are stateless, meaning each request carries all the context needed to process it. They use standard HTTP status codes for response semantics and return data in consistent representations like JSON. While strict REST includes hypermedia links, most practical APIs follow RESTful conventions for resource modeling and HTTP semantics."

#### What makes an API RESTful?
- **The Engine Mechanism (Why it behaves this way):** A RESTful API adheres to six constraints: client-server separation (decoupled concerns), statelessness (no server-side session state between requests), cacheability (responses declare themselves cacheable or not), uniform interface (consistent resource identification via URIs, manipulation through representations, self-descriptive messages, and HATEOAS), layered system (clients don't know if they're talking to the origin server or an intermediary), and optional code-on-demand. Practically, this means noun-based URLs, proper HTTP methods, standard status codes, and consistent response shapes.
- **The Unforgettable Mental Model:** RESTful is like **following traffic laws**. The rules (constraints) exist so every driver (client) can predict how every other driver (server) will behave at any intersection (endpoint).
- **The Trap:** Thinking RESTful means "uses JSON and HTTP." RESTful requires adherence to HTTP semantics — using the right methods, status codes, and resource modeling. `GET /deleteUser?id=1` is not RESTful regardless of returning JSON.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An API is RESTful when it follows REST's architectural constraints: resources are identified by URLs, HTTP methods express the operation intent, requests are stateless, responses use standard status codes, and the interface is uniform and predictable. Practically, this means noun-based resource URLs like `/users/123`, proper method usage — GET for reads, POST for creates — and consistent JSON response shapes. The key is that a client can understand and use the API by following HTTP conventions without needing custom documentation for each endpoint's behavior."

#### Why should URLs use nouns instead of verbs?
- **The Engine Mechanism (Why it behaves this way):** In REST, the HTTP method expresses the action (verb), and the URL identifies the resource (noun). Using verbs in URLs like `/getUser` or `/createOrder` duplicates the action information that the HTTP method already provides. This breaks the uniform interface constraint and makes the API harder to reason about. `GET /users/123` clearly says "read user 123" — the method is the verb, the URL is the noun.
- **The Unforgettable Mental Model:** URLs are **street addresses**, not **directions**. The address tells you where to go (the resource); the HTTP method tells you what to do there (read, write, delete).
- **The Trap:** Using verbs everywhere because it feels more natural. `POST /createUser` is redundant — POST already means "create." `GET /users/123` is cleaner and lets HTTP infrastructure (caches, proxies) understand the request semantics.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: In REST, the HTTP method is the verb and the URL is the noun. Using verbs in URLs like `/createUser` duplicates the action that the HTTP method already expresses. `POST /users` clearly means 'create a user' because POST is the creation method. This separation lets HTTP infrastructure — caches, proxies, and load balancers — understand request semantics and apply appropriate behavior. GET requests can be cached, POST requests cannot. Mixing verbs into URLs breaks this predictability."

#### What does stateless mean in REST?
- **The Engine Mechanism (Why it behaves this way):** Statelessness means the server does not store any client context between requests. Every request must contain all information needed to process it — authentication credentials, resource identifiers, and operation parameters. The server processes each request independently, without relying on memory of previous interactions. This enables any server instance to handle any request, which is essential for horizontal scaling behind load balancers.
- **The Unforgettable Mental Model:** Stateless is like a **vending machine**. Every transaction is independent — you insert money, select a product, and get your item. The machine doesn't remember your previous purchases or hold any state about you between transactions.
- **The Trap:** Confusing stateless with "no database." Stateless means no per-client session state in server memory. The server can still use databases, caches, and external stores — it just doesn't remember which client made the previous request.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Stateless means the server doesn't store client context between requests. Every request carries all the information needed to process it — typically authentication tokens, resource IDs, and operation parameters. This allows any server instance to handle any request, which is critical for horizontal scaling. The server can still use databases and caches for persistent data; statelessness specifically means no in-memory session state that ties a client to a particular server instance."

#### Is every JSON API a REST API?
- **The Engine Mechanism (Why it behaves this way):** No. A JSON API simply means the response body uses JSON format. REST is an architectural style with specific constraints around resource modeling, HTTP method usage, statelessness, cacheability, and uniform interfaces. Many JSON APIs use POST for everything, embed actions in URLs, ignore HTTP status codes, or maintain server-side sessions — all of which violate REST principles. GraphQL, RPC-style APIs, and action-oriented endpoints are JSON APIs but not REST APIs.
- **The Unforgettable Mental Model:** All squares are rectangles, but not all rectangles are squares. All REST APIs can return JSON, but not all JSON APIs are REST.
- **The Trap:** Using "REST" as a synonym for "HTTP API that returns JSON." This is the most common misuse in interviews. A `POST /api/getUserData` endpoint returning JSON is not RESTful — it uses the wrong method and a verb-based URL.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: No, not every JSON API is a REST API. JSON is just a data format. REST is an architectural style with specific constraints: resource-based URLs, proper HTTP method semantics, statelessness, cacheable responses, and standard status codes. Many APIs return JSON but use POST for everything, embed actions in URLs, or ignore HTTP conventions — these are HTTP APIs, not REST APIs. GraphQL, gRPC-over-HTTP, and RPC-style endpoints are all JSON APIs that follow different architectural patterns."

#### How do REST and GraphQL differ?
- **The Engine Mechanism (Why it behaves this way):** REST exposes multiple fixed endpoints, each returning a predetermined data shape. Clients may need to make multiple requests to gather related data (the N+1 problem from the client side). GraphQL exposes a single endpoint with a typed schema, allowing clients to specify exactly what fields they need in one query. REST relies on HTTP caching at the network level; GraphQL typically requires application-level caching since all requests hit the same POST endpoint. REST is resource-oriented; GraphQL is graph-oriented with relationships expressed through nested queries.
- **The Unforgettable Mental Model:** REST is a **set menu** — each dish (endpoint) comes with fixed sides. GraphQL is a **buffet** — you pick exactly what you want on your plate in one trip.
- **The Trap:** Assuming GraphQL is always better. GraphQL adds complexity (schema management, N+1 query problems on the server, caching challenges) and may be overkill for simple CRUD APIs. REST is simpler to implement, cache, and monitor.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: REST exposes multiple resource-based endpoints with fixed response shapes, while GraphQL exposes a single endpoint with a typed schema where clients specify exactly what data they need. REST benefits from HTTP-level caching and is simpler to implement and debug. GraphQL reduces over-fetching and under-fetching but requires schema management, solves N+1 queries on the server with DataLoader patterns, and needs custom caching strategies. I choose REST for simple CRUD APIs and public integrations, and GraphQL when clients have diverse data needs and the overhead is justified."

#### How do you version REST APIs?
- **The Engine Mechanism (Why it behaves this way):** API versioning maintains backward compatibility when contracts change. Common approaches include URL versioning (`/api/v1/users`), header versioning (`Accept: application/vnd.myapi.v1+json`), and query parameter versioning (`/api/users?version=1`). URL versioning is the most visible and widely adopted. The key principle is additive changes don't require versioning — adding new optional fields or new endpoints is backward compatible. Versioning is needed when removing fields, changing types, or altering behavior.
- **The Unforgettable Mental Model:** API versioning is like **road construction with detours**. The old road (v1) stays open while the new road (v2) is built. Drivers can choose when to switch, and eventually the old road closes with advance notice.
- **The Trap:** Versioning too early or for every minor change. Additive changes (new optional fields, new endpoints) are backward compatible and don't need a new version. Version only when breaking changes are unavoidable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I version REST APIs when backward-incompatible changes are necessary — removing fields, changing types, or altering response structures. The most common approach is URL versioning like `/api/v1/users` because it's explicit and easy to route. I prefer additive changes whenever possible — adding new optional fields or endpoints — since these don't break existing clients. When a new version is needed, I deprecate the old version with a sunset header, provide migration documentation, and maintain both versions during a transition period."

#### How do you represent errors in REST?
- **The Engine Mechanism (Why it behaves this way):** REST error responses use appropriate HTTP status codes (400 for bad request, 401 for unauthenticated, 404 for not found, 422 for validation errors, 500 for server errors) combined with a consistent JSON error body. A standard error shape includes an error code or type, a human-readable message, and optionally field-level details for validation errors. This allows clients to programmatically handle different error types while displaying user-friendly messages.
- **The Unforgettable Mental Model:** Error responses are like **traffic signals with explanation boards**. The status code is the color (red = stop/error), and the error body is the sign explaining why.
- **The Trap:** Returning 200 OK with an error message in the body. This breaks HTTP semantics — clients and proxies rely on status codes to determine success or failure. A validation failure must return 4xx, not 200.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: REST error responses combine the appropriate HTTP status code with a consistent JSON error body. The status code communicates the category — 400 for malformed requests, 401 for auth issues, 404 for missing resources, 422 for validation failures, 500 for server errors. The JSON body includes a machine-readable error code, a human-readable message, and field-level details for validation errors. This dual approach lets clients handle errors programmatically using status codes while displaying meaningful messages to users from the response body."

## 8. Active recall test

1. **Design REST routes for a product catalog.**
   - **Explanation:** `GET /products` (list), `POST /products` (create), `GET /products/:id` (read), `PATCH /products/:id` (partial update), `PUT /products/:id` (full replace), `DELETE /products/:id` (remove), `GET /products/:id/reviews` (nested resource).

2. **Explain why `GET /deleteUser?id=1` is poor REST design.**
   - **Explanation:** It uses GET (a safe, cacheable read method) to perform a mutation (delete). It uses a verb in the URL instead of a noun. The correct design is `DELETE /users/1` — the HTTP method expresses the action, the URL identifies the resource.

3. **What should `POST /orders` return after creation?**
   - **Explanation:** HTTP 201 Created with the created order in the response body and a `Location` header pointing to the new resource (e.g., `/orders/500`). The response body should be serialized to exclude internal fields.

4. **How would you model a non-CRUD action like canceling an order?**
   - **Explanation:** Use a subresource or command endpoint: `POST /orders/:id/cancel` or `PATCH /orders/:id` with `{ "status": "cancelled" }`. The subresource approach is clearer for domain-specific actions that don't map to standard CRUD.

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

