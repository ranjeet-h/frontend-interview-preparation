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

#### What are the main HTTP methods?
- **The Engine Mechanism (Why it behaves this way):** HTTP defines several methods (verbs) that indicate the intended action on a resource. The most common are GET (retrieve), POST (create/submit), PUT (replace), PATCH (partial update), DELETE (remove), HEAD (get headers only), and OPTIONS (discover allowed methods). Each method has defined semantics around safety (whether it modifies state) and idempotency (whether repeated calls produce the same result). Backend frameworks route requests to different handlers based on the method + URL combination.
- **The Unforgettable Mental Model:** HTTP methods are **traffic signs** on a road. GET is "look at the scenery," POST is "enter the building," PUT is "replace the entire room," PATCH is "repaint one wall," DELETE is "demolish the structure."
- **The Trap:** Thinking HTTP methods are just naming conventions. They have real semantic meaning that browsers, caches, proxies, and CDNs rely on. GET requests can be prefetched and cached; POST requests cannot.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The main HTTP methods are GET for reading data, POST for creating resources or triggering actions, PUT for replacing a resource entirely, PATCH for partial updates, and DELETE for removing resources. Each method has defined semantics — GET is safe and idempotent, POST is neither, PUT and DELETE are idempotent. These semantics matter because HTTP infrastructure like caches, proxies, and browsers use them to determine behavior like caching, prefetching, and retry safety."

#### Which methods are safe?
- **The Engine Mechanism (Why it behaves this way):** A safe HTTP method is one that does not modify server state. GET, HEAD, and OPTIONS are defined as safe by the HTTP specification. Safe methods can be called repeatedly without side effects — the server should not create, update, or delete resources. This allows browsers, crawlers, and proxies to call safe methods freely for prefetching, indexing, and caching without worrying about unintended mutations.
- **The Unforgettable Mental Model:** Safe methods are like **looking through a store window**. You can look as many times as you want without changing anything inside the store.
- **The Trap:** Using GET for actions that modify state, like `GET /delete?id=1` or `GET /transfer?amount=100`. This violates the safe method contract and can cause unintended mutations when browsers prefetch links or crawlers index URLs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Safe HTTP methods are those that don't modify server state — GET, HEAD, and OPTIONS. The HTTP specification guarantees that calling safe methods has no side effects on the server. This is why browsers can prefetch GET links, search engines can crawl them, and proxies can cache them without risk. Using GET for mutations violates this contract and can cause unexpected data changes when infrastructure treats the request as a safe read operation."

#### Which methods are idempotent?
- **The Engine Mechanism (Why it behaves this way):** An idempotent method produces the same server state whether called once or multiple times. GET, PUT, DELETE, HEAD, and OPTIONS are idempotent. GET is idempotent because reading doesn't change anything. PUT is idempotent because replacing a resource with the same data yields the same result. DELETE is idempotent because deleting an already-deleted resource has no additional effect. POST is not idempotent — calling it twice typically creates two resources.
- **The Unforgettable Mental Model:** Idempotent methods are like **light switches**. Flipping a light switch to "off" multiple times still leaves the light off. The end state is the same regardless of repetition.
- **The Trap:** Assuming idempotency is automatic. PUT is idempotent by convention, but if the server increments a counter or generates a new timestamp on every PUT, it breaks idempotency. The server implementation must honor the idempotency contract.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Idempotent methods are GET, PUT, DELETE, HEAD, and OPTIONS. Idempotency means calling the method multiple times produces the same final server state as calling it once. GET doesn't change state, PUT replaces with the same representation, and DELETE removes — deleting an already-deleted resource is a no-op. POST is not idempotent because each call typically creates a new resource. This matters for retries: idempotent methods can be safely retried on network failure, while POST retries risk duplicate side effects."

#### When should you use POST?
- **The Engine Mechanism (Why it behaves this way):** POST is used for creating new resources when the server assigns the ID (the client doesn't know the URL yet), for triggering non-idempotent actions, and for submitting data that doesn't fit the CRUD model. POST requests typically include a request body with the data to process. The server responds with 201 Created and a Location header for new resources, or 200/202 for accepted actions. POST is neither safe nor idempotent.
- **The Unforgettable Mental Model:** POST is like **submitting an application form**. You don't know the outcome yet — the server processes it, assigns it a reference number, and tells you the result.
- **The Trap:** Using POST for everything because it "works." This loses the semantic benefits of HTTP methods — caches can't optimize, retries are unsafe, and the API becomes harder to understand and document.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use POST for creating new resources when the server assigns the identifier, for triggering non-idempotent actions like processing a payment or sending an email, and for operations that don't fit standard CRUD. POST tells the server 'process this data' without implying a specific CRUD operation. The server responds with 201 Created for new resources, including a Location header with the new resource URL, or 200/202 for accepted actions."

#### When should you use PUT?
- **The Engine Mechanism (Why it behaves this way):** PUT replaces the entire resource at a known URL. The client sends the complete desired representation, and the server overwrites the existing resource with it. PUT is idempotent — sending the same PUT request multiple times produces the same result. It's used when the client knows the resource URL (either assigned by the client or previously returned by the server) and wants to ensure the resource matches the sent representation exactly.
- **The Unforgettable Mental Model:** PUT is like **replacing a document in a filing cabinet**. You take out the old one and put in a new complete version. Doing it again with the same document changes nothing.
- **The Trap:** Using PUT for partial updates. If you only send `{ "name": "New" }` with PUT, the server may interpret omitted fields as "clear them," resulting in data loss. For partial updates, use PATCH.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use PUT when the client wants to replace an entire resource at a known URL. The client sends the complete desired representation, and the server overwrites the existing resource. PUT is idempotent — repeating the same request produces the same result. It's appropriate for full-resource updates like saving a complete profile form. If the resource doesn't exist, some APIs create it at the specified URL, which is also idempotent."

#### When should you use PATCH?
- **The Engine Mechanism (Why it behaves this way):** PATCH applies a partial update to a resource. The client sends only the fields that need to change, and the server merges them with the existing resource. PATCH is used when updating specific fields without sending the entire representation. Unlike PUT, omitted fields in PATCH are left unchanged. PATCH can be idempotent if designed carefully (e.g., setting a field to a specific value), but isn't automatically idempotent like PUT.
- **The Unforgettable Mental Model:** PATCH is like **editing specific lines in a document** with a red pen. You only change what needs changing; everything else stays as-is.
- **The Trap:** Not validating PATCH payloads properly. Since PATCH sends partial data, you can't use the same "all fields required" validation as create. You need optional field validation that only checks provided fields.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use PATCH for partial updates where the client sends only the fields that need to change. The server merges these fields with the existing resource, leaving omitted fields untouched. PATCH is ideal for targeted updates like changing a user's email or updating an order's status. Validation for PATCH differs from create — only provided fields are validated, and required fields are only checked if included in the payload."

#### Can DELETE be idempotent?
- **The Engine Mechanism (Why it behaves this way):** Yes, DELETE is defined as idempotent by the HTTP specification. Deleting a resource that already exists removes it (first call). Deleting the same resource again returns 404 Not Found or 200/204 with no additional effect — the resource is still gone. The final state (resource doesn't exist) is the same regardless of how many times DELETE is called. However, the response status code may differ between the first and subsequent calls.
- **The Unforgettable Mental Model:** DELETE is like **shredding a document**. The first shred destroys it. Shredding again does nothing — it's already gone.
- **The Trap:** Making DELETE non-idempotent by logging each deletion as a new record or triggering side effects on every call. If DELETE sends an email notification every time, retrying a failed DELETE sends duplicate emails.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Yes, DELETE is idempotent by HTTP specification. The first call removes the resource; subsequent calls have no additional effect because the resource is already gone. The server may return 204 on the first call and 404 on subsequent calls, but the end state is the same. This means DELETE can be safely retried on network failure. However, I ensure the implementation doesn't trigger side effects like notifications on every call — those should only happen on the actual deletion."

#### Should GET ever change data?
- **The Engine Mechanism (Why it behaves this way):** No, GET should never change server-side data. The HTTP specification defines GET as a safe method, meaning it must not have side effects. HTTP infrastructure — browsers, proxies, CDNs, crawlers — relies on this guarantee to prefetch, cache, and index GET requests. If a GET endpoint modifies data, it can cause unexpected mutations when infrastructure calls it automatically. Server-side logging, analytics, and cache updates are acceptable side effects because they don't change the resource state visible to clients.
- **The Unforgettable Mental Model:** GET is a **read-only mirror**. Looking in a mirror doesn't change your appearance — it only shows what's already there.
- **The Trap:** Using GET for actions like `GET /increment-view-count` or `GET /mark-as-read`. These mutate state and violate the safe method contract. Use POST for mutations, even if they seem read-adjacent.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: GET should never change server-side data. The HTTP specification defines GET as a safe method, and all HTTP infrastructure — browsers, proxies, CDNs, search crawlers — relies on this guarantee. They prefetch and cache GET requests assuming no mutations occur. If a GET endpoint modifies data, it can cause unexpected side effects when infrastructure calls it automatically. The only acceptable side effects are internal logging, analytics, and cache updates that don't change the resource state visible to clients."

## 8. Active recall test

1. **Pick the right method for creating an order.**
   - **Explanation:** POST /orders. POST is used for creating resources when the server assigns the ID. The response should be 201 Created with a Location header pointing to the new order.

2. **Pick the right method for replacing a user profile.**
   - **Explanation:** PUT /users/:id. PUT replaces the entire resource at a known URL. The client sends the complete profile representation, and the server overwrites the existing profile.

3. **Pick the right method for changing only an order's status.**
   - **Explanation:** PATCH /orders/:id with `{ "status": "shipped" }`. PATCH applies a partial update, changing only the specified field while leaving all other order fields unchanged.

4. **Explain safe vs idempotent.**
   - **Explanation:** Safe methods don't modify server state at all (GET, HEAD, OPTIONS). Idempotent methods produce the same final state whether called once or many times (GET, PUT, DELETE, HEAD, OPTIONS). All safe methods are idempotent, but not all idempotent methods are safe — DELETE is idempotent but not safe because it modifies state.

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

