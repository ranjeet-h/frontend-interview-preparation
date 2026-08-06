# Product CRUD APIs

## Detailed explanation

Design create, read, update, delete, list, filter, and validation contracts for products. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

CRUD APIs are predictable resource operations plus domain constraints.

## 2. Problem it solves

This design prevents inconsistent client behavior, duplicated backend logic, unclear errors, security gaps, and production-only workflow bugs.

## 3. Core idea

- Define the resource or workflow clearly.
- Validate input at the API boundary.
- Enforce authentication, authorization, and ownership checks.
- Return consistent success and error shapes.
- Plan idempotency, retries, logging, and monitoring for production behavior.

## 4. Visual / analogy

```txt
Client request
  -> auth/validation
  -> domain rules
  -> database/cache/queue
  -> serialized response/error
  -> frontend behavior
```

## 5. Minimal example

```txt
REQUEST  /api/example
CHECK    auth + validation + domain rules
WRITE    database or enqueue job
RETURN   status code + response body
```

## 6. Real-world example

In production, product crud apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for product CRUD?
- **The Engine Mechanism (Why it behaves this way):** RESTful endpoints: `POST /api/products` (create), `GET /api/products` (list with pagination/filtering), `GET /api/products/:id` (read), `PUT /api/products/:id` or `PATCH /api/products/:id` (update), `DELETE /api/products/:id` (delete). Admin-only mutations, public read for published products. Optional: `POST /api/products/:id/publish` for state transitions.
- **The Unforgettable Mental Model:** The **Warehouse Management System**. New items arrive (POST), the catalog is browsed (GET list), individual items are inspected (GET by ID), labels are updated (PUT/PATCH), and discontinued items are removed (DELETE).
- **The Trap:** Using GET for mutations or not separating admin vs public access — product creation should never be publicly accessible.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I follow RESTful conventions: POST for creation, GET for listing and reading, PUT/PATCH for updates, DELETE for removal. Listing supports pagination and filtering. Mutations require admin authorization. Reads are public for published products but may require auth for drafts. I also add a publish endpoint for controlled state transitions."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Create/Update request: `{ name, description, price, currency, sku, categoryId, images[], status, inventory }`. List response: `{ success: true, data: { items: [...], pagination: { page, perPage, total, totalPages } } }`. Single item response: `{ success: true, data: { id, name, ... } }`. Delete response: `{ success: true, message: "Product deleted" }` with 200 or 204.
- **The Unforgettable Mental Model:** The **Product Spec Sheet**. Every product has a standardized form with required fields, optional fields, and validation rules — just like a manufacturing specification.
- **The Trap:** Returning the full product object on delete — a 204 No Content or minimal confirmation is sufficient. Also, not including pagination metadata in list responses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Create and update requests accept the product fields with server-side validation. List responses include items plus pagination metadata (page, perPage, total, totalPages). Single item responses return the full product object. Delete returns 204 No Content or a minimal success confirmation. All responses follow a consistent envelope structure."

#### What validations are required for product CRUD?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Required fields — name, price, SKU; (2) Price must be positive with correct decimal precision; (3) SKU uniqueness — no duplicate SKUs; (4) Category must exist; (5) Image URLs must be valid; (6) Inventory must be non-negative integer; (7) Status transitions must follow allowed flow (draft → published → archived); (8) Currency must be a valid ISO code.
- **The Unforgettable Mental Model:** The **Quality Control Line**. Every product passes through inspection stations: label check (required fields), price verification, barcode scan (SKU uniqueness), category assignment, and photo review (image validation).
- **The Trap:** Not validating price as a decimal with proper precision — floating-point arithmetic can cause pricing errors (e.g., $19.99 becoming $19.98999999).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate required fields, ensure price is positive with correct decimal precision (stored as integer cents or Decimal type), enforce SKU uniqueness with a database constraint, verify category existence, validate image URLs, and ensure inventory is non-negative. Status transitions follow a defined flow. Price precision is critical — I use integer cents or a Decimal type, never floating point."

#### What status codes can product CRUD APIs return?
- **The Engine Mechanism (Why it behaves this way):** Create: `201 Created`. Read: `200 OK` or `404 Not Found`. Update: `200 OK` or `404 Not Found`. Delete: `204 No Content` or `200 OK` with `404 Not Found`. List: `200 OK`. Validation errors: `400 Bad Request`. Authorization errors: `403 Forbidden`. Duplicate SKU: `409 Conflict`.
- **The Unforgettable Mental Model:** The **Warehouse Traffic System**. New shipment arrives (201), item found on shelf (200), item not found (404), shelf is empty after removal (204), duplicate barcode detected (409).
- **The Trap:** Returning 200 for creation instead of 201 — 201 specifically indicates a new resource was created and may include a Location header.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Create returns 201 with a Location header pointing to the new resource. Read returns 200 or 404. Update returns 200 or 404. Delete returns 204 or 200. List returns 200 with pagination. Validation errors return 400, authorization errors return 403, and duplicate SKUs return 409. Each status code maps to a specific frontend behavior."

#### How do you secure product CRUD APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Admin-only mutations — create, update, delete require admin role; (2) Public reads for published products — no auth needed; (3) Draft products require auth — only visible to admins; (4) Input sanitization — prevent XSS in product descriptions; (5) Rate limiting — protect against scraping on list endpoint; (6) Image upload validation — file type, size, and content scanning.
- **The Unforgettable Mental Model:** The **Storefront vs. Stockroom**. Customers browse the storefront (public reads), but only staff can access the stockroom (admin mutations), and the security cameras watch everything (rate limiting, audit logs).
- **The Trap:** Not sanitizing product descriptions — rich text fields are a common XSS vector if user-generated content is allowed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Mutations require admin authorization. Published products are publicly readable, but drafts require auth. I sanitize all text inputs to prevent XSS, rate-limit the list endpoint to prevent scraping, and validate image uploads for file type, size, and content. Product descriptions that support rich text are sanitized through a whitelist of allowed HTML tags."

#### How do you avoid duplicate or unsafe product operations?
- **The Engine Mechanism (Why it behaves this way):** SKU uniqueness is enforced by a database unique constraint. Soft deletes prevent accidental data loss — `DELETE` sets `deletedAt` instead of removing the row. Optimistic locking with a `version` field prevents concurrent update conflicts. Idempotent create requests use client-supplied idempotency keys.
- **The Unforgettable Mental Model:** The **Library Catalog System**. Each book has a unique ISBN (SKU constraint). Removed books are marked "withdrawn" rather than destroyed (soft delete). If two librarians try to update the same record, the second one sees the version changed and retries (optimistic locking).
- **The Trap:** Hard deleting products — this breaks order history, analytics, and referential integrity. Soft deletes preserve data while hiding it from normal queries.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I enforce SKU uniqueness with a database constraint. I use soft deletes to preserve order history and analytics. Optimistic locking with a version field prevents concurrent update conflicts. For create operations, I accept idempotency keys to handle retries safely. Soft deletes mean the DELETE endpoint sets a deletedAt timestamp and excludes soft-deleted records from normal queries."

#### How do you test product CRUD APIs?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Create product → 201, product exists; (2) List products → paginated results; (3) Get product → 200 with full data; (4) Update product → 200, changes persisted; (5) Delete product → 204, soft-deleted; (6) Duplicate SKU → 409; (7) Invalid price → 400; (8) Admin-only mutation → 403 for non-admin; (9) Concurrent updates → optimistic locking prevents conflicts; (10) Filtering and sorting → correct results.
- **The Unforgettable Mental Model:** The **Full Warehouse Audit**. Every operation is tested: receiving, cataloging, updating, removing, and the edge cases like duplicates, invalid data, and unauthorized access.
- **The Trap:** Not testing pagination and filtering — these are the most complex queries and the most likely to have performance or correctness bugs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test all CRUD operations, pagination and filtering, duplicate SKU rejection, price validation, authorization enforcement, soft delete behavior, optimistic locking for concurrent updates, and public vs. draft visibility. Pagination and filtering tests are critical because they involve complex database queries that are prone to performance and correctness bugs."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: product created/updated/deleted (user ID, product ID, timestamp, changed fields), authorization failures, validation failures. Metrics: products created per day, list endpoint latency, cache hit rate, error rate by type, most-filtered fields. Alerts: sudden spike in deletions, high error rates, slow list queries.
- **The Unforgettable Mental Model:** The **Warehouse Operations Dashboard**. Inventory movements are tracked, processing times are monitored, and anomalies like mass deletions trigger alerts.
- **The Trap:** Not monitoring list endpoint latency — product listing is the most frequently called endpoint and a performance bottleneck if queries are unoptimized.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log all product mutations with user ID, product ID, timestamp, and changed fields. Metrics track creation rate, list endpoint latency, cache hit rate, and error rates. I alert on sudden deletion spikes, high error rates, and slow list queries. The list endpoint is the most critical to monitor since it's the highest-traffic endpoint and most likely to have performance issues."

## 8. Active recall test

1. **What HTTP method creates a new product?**
   - **Explanation:** `POST /api/products` — it creates a new resource and returns 201 Created with a Location header.

2. **What status code is returned when a product is not found?**
   - **Explanation:** `404 Not Found` — the requested product ID does not exist in the database.

3. **Why use soft deletes instead of hard deletes for products?**
   - **Explanation:** To preserve order history, analytics, and referential integrity — hard deletes would break existing orders that reference the deleted product.

4. **How is SKU uniqueness enforced?**
   - **Explanation:** A database-level unique constraint on the SKU column — this is the authoritative guard against duplicates, even under concurrent requests.

5. **Why store prices as integer cents instead of floating point?**
   - **Explanation:** Floating-point arithmetic causes precision errors (e.g., 0.1 + 0.2 ≠ 0.3). Integer cents or Decimal types ensure exact monetary calculations.

6. **What prevents concurrent update conflicts on products?**
   - **Explanation:** Optimistic locking with a version field — each update checks that the version hasn't changed since the client last read the product.

7. **Who can create or update products?**
   - **Explanation:** Only users with admin or product-manager roles — product mutations are restricted operations.

8. **What should list responses include besides the product array?**
   - **Explanation:** Pagination metadata: page, perPage, total items, and totalPages — so the frontend can render pagination controls.

9. **What is the most frequently called product endpoint?**
   - **Explanation:** `GET /api/products` (list) — it's used for catalog browsing, search results, and admin product management views.

10. **What metric would indicate a performance problem with product listing?**
    - **Explanation:** High p95 or p99 latency on the list endpoint — this suggests unoptimized queries, missing indexes, or N+1 query problems.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Product CRUD APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
