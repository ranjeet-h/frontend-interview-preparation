# Designing Production Product CRUD APIs: REST Semantics, Filtering Pipelines, and Soft Deletes

## 1. Why This Exists — The Problem First

A junior engineer builds a straightforward product CRUD API for an e-commerce platform. Everything looks clean in staging with twenty test items. Two weeks after launch, a merchant deletes a seasonal winter jacket from their catalog. The backend executes a direct database delete: `DELETE FROM products WHERE id = 402`. 

Instantly, production breaks across multiple services. Ten thousand historical customer orders referencing product ID `402` fail to render in customer dashboards. The fulfillment pipeline crashes on missing foreign keys. Nightly financial reconciliation reports fail because the revenue ledger can no longer join order items to their historical product metadata.

At the same time, customers browsing the storefront notice the product search page grinding to a halt. The listing endpoint `GET /api/v1/products?category=apparel&min_price=2000&sort=price_desc&page=500` takes twelve seconds to respond. The backend concatenates raw query parameters into dynamic SQL, triggering unindexed full-table scans, and an `OFFSET 10000` clause forces the database engine to read and discard ten thousand rows from disk for every single page request.

Production Product CRUD is not basic database scaffolding. It is a mission-critical domain interface requiring strict HTTP semantics, non-destructive soft-delete lifecycles that preserve historical referential integrity, compound indexes that handle active-versus-deleted uniqueness, parent-variant SKU hierarchies, dynamic filter pipelines that resist injection and query explosions, and conditional caching with ETags.

---

## 2. The Analogy — Make It Obvious

Think of a production product API like the operations of a **Luxury Department Store and its Master Inventory Archive**.

```txt
[Client Request] ─────────────────────────────────────────────────────────────┐
                                                                              │
1. POST /products (Receiving Dock)                                            │
   └─► Log item, stamp barcode/SKU, return receipt with shelf location        │
       (HTTP 201 Created + Location: /api/v1/products/8492)                  │
                                                                              │
2. GET /products (Showroom Browsing)                                          │
   └─► Shopper filters by rack, size, price bracket                           │
       (Dynamic Pipeline + Composite B-Tree Index + Cursor Pagination)        │
                                                                              │
3. PUT vs PATCH /products/:id (Merchandising Updates)                         │
   ├─► PUT: Strip the mannequin bare and rebuild the entire outfit from scratch│
   └─► PATCH: Swap out only the sale price sticker on the jacket collar       │
                                                                              │
4. DELETE /products/:id (Discontinuing Items)                                 │
   └─► Never burn the ledger or shred past receipts!                          │
       Stamp "ARCHIVED" (deleted_at), move off display rack, keep record      │
       (Soft Delete + Partial Unique Index on active SKUs)                    │
                                                                              │
5. GET /products/:id with ETag (VIP Quick Check)                              │
   └─► Stylist checks if display price tag changed                            │
       "Seal unchanged? Don't read the catalog again." (HTTP 304 Not Modified)│
                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Receiving Dock (`POST /products`):** When new inventory arrives, receiving staff do not just throw it on a pile. They inspect required fields, assign a globally unique Barcode/SKU, record the item in the master ledger, and hand the clerk a receipt indicating the exact warehouse location (`Location: /api/v1/products/8492`).
- **Showroom Floor Browsing (`GET /products`):** Shoppers walk through aisles filtering by department, price range, and color. The floor manager arranges aisles so shoppers can grab items in ordered sequence using bookmarks (Cursor Pagination) without having to walk past every single item in the entire warehouse from item zero every time (Offset Pagination).
- **Full Display Overhaul vs. Price Tag Update (`PUT` vs `PATCH`):** If a window display is replaced entirely, the decorator clears out every prop and installs a complete new specification (`PUT` — complete idempotent replacement). If the store simply runs a flash sale on shoes, an associate changes only the price tag without altering the shoes, laces, or display card (`PATCH` — atomic partial update).
- **Discontinuing an Item vs. Shredding the Records (`DELETE`):** When a shoe style is discontinued, management does not incinerate historical sales slips or purge supplier receipts from the filing cabinet. They mark the item as "Archived" (`deleted_at`), pull it from the active sales floor, and archive the SKU. If a customer walks in with a two-year-old receipt, the store ledger instantly verifies what was purchased.
- **The Display Case Seal (`ETags` / Conditional Requests):** A personal shopper calls the front desk every ten minutes asking if a designer handbag's details have changed. Instead of re-reading the five-page certificate over the phone, the clerk compares the seal ID (`ETag`). If the seal matches the caller's token, the clerk says "No change" (`304 Not Modified`), saving everyone time and voice bandwidth.

---

## 3. How It Actually Works — The Full Explanation

### The RESTful CRUD Lifecycle and Status Semantics

A production API enforces standard HTTP semantics so clients, API gateways, reverse proxies, and CDN edge caches behave predictably.

| Operation | HTTP Method & URI | Success Status | Idempotent | Key Headers & Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Create Product** | `POST /api/v1/products` | `201 Created` | No | Returns `Location: /api/v1/products/{id}` and the created entity. |
| **List Products** | `GET /api/v1/products` | `200 OK` | Yes | Accepts query filters, sorting parameters, and cursor pagination tokens. |
| **Get Product by ID** | `GET /api/v1/products/:id` | `200 OK` | Yes | Returns `ETag` and `Cache-Control`. Returns `404 Not Found` if missing or soft-deleted. |
| **Full Replace** | `PUT /api/v1/products/:id` | `200 OK` | Yes | Overwrites the entire resource. Unspecified optional fields reset to default or `NULL`. |
| **Partial Update** | `PATCH /api/v1/products/:id` | `200 OK` | No (standard) / Yes (atomic fields) | Updates only supplied attributes. Validates nested objects and prevents accidental resets. |
| **Soft Delete** | `DELETE /api/v1/products/:id`| `204 No Content`| Yes | Sets `deleted_at = NOW()`. Returns no response body. |

### Parent Products vs. SKU Variants

In real-world retail, a "Product" represents the high-level marketing entity (e.g., "Classic Oxford Cotton Shirt"), while a "Stock Keeping Unit (SKU) Variant" represents the purchasable physical inventory item with concrete attributes (e.g., "Size: M, Color: Navy Blue, SKU: OXF-BLU-M").

```txt
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PARENT PRODUCT (Logical Entity)                      │
│  ID: prod_99182                                                             │
│  Title: "Heritage Heavyweight Tee"                                          │
│  Brand: "Acme Apparel"                                                      │
│  Category ID: cat_442                                                       │
│  Status: "active" | deleted_at: NULL                                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                    1-to-Many Database Relationship
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐
│      SKU VARIANT 1     │   │      SKU VARIANT 2     │   │      SKU VARIANT 3     │
│ ID: var_01             │   │ ID: var_02             │   │ ID: var_03             │
│ SKU: HHT-BLK-S         │   │ SKU: HHT-BLK-M         │   │ SKU: HHT-WHT-L         │
│ Attributes: {S, Black} │   │ Attributes: {M, Black} │   │ Attributes: {L, White} │
│ Price: 4500 (cents)    │   │ Price: 4500 (cents)    │   │ Price: 4500 (cents)    │
│ Stock Quantity: 120    │   │ Stock Quantity: 85     │   │ Stock Quantity: 0      │
│ deleted_at: NULL       │   │ deleted_at: NULL       │   │ deleted_at: NULL       │
└────────────────────────┘   └────────────────────────┘   └────────────────────────┘
```

When designing the API:
1. `POST /api/v1/products` accepts the parent product fields alongside an array of initial variants inside a single ACID database transaction. If variant creation fails (such as a duplicate SKU), the entire parent record rolls back.
2. Prices must never be stored as floating-point numbers (`FLOAT` or `DOUBLE`). Binary floating-point representation causes rounding drift (such as `$19.99` becoming `19.989999999999998`). Always store currency as integer minor units (e.g., cents: `1999` for `$19.99`) or database-native `DECIMAL(12, 2)` with an explicit ISO currency code (`USD`, `EUR`).

### The Soft Delete Architecture and The Unique Index Trap

Soft deletion means setting a `deleted_at` timestamp rather than issuing an SQL `DELETE`. This preserves foreign key integrity with historical `orders`, `order_items`, and `shipments`.

However, soft deletes introduce a critical database indexing conflict with unique constraints:

If your database schema has a standard unique index:
```sql
-- DANGEROUS WITH SOFT DELETES:
CREATE UNIQUE INDEX uq_products_sku ON product_variants(sku);
```
When an admin deletes variant `SKU-100` (`deleted_at = '2026-08-25 10:00:00'`), and later attempts to create a new, active variant with `SKU-100`, the database throws a duplicate key violation (`HTTP 409 Conflict`) because the deleted row still occupies that unique index slot.

#### The Architectural Solution: Filtered / Partial Unique Indexes

In PostgreSQL, create a **partial unique index** that enforces uniqueness only across active (non-deleted) records:

```sql
-- PostgreSQL Partial Unique Index:
CREATE UNIQUE INDEX uq_variants_active_sku 
ON product_variants (sku) 
WHERE deleted_at IS NULL;
```

With this index:
1. Multiple soft-deleted rows may share the SKU `SKU-100` (preserving full audit logs).
2. Exactly **one** active row (`deleted_at IS NULL`) can possess `SKU-100`.
3. An active insert with a duplicate SKU fails immediately at the database layer with zero race conditions.

In databases without partial index support (like standard MySQL InnoDB before version 8.0.13), standard practice creates a computed virtual column `active_sku AS (IF(deleted_at IS NULL, sku, NULL))` and applies the unique index to `active_sku`, since SQL allows multiple `NULL` values in a unique index.

### Query Pipeline: Filtering, Sorting, and Pagination

A production listing endpoint `GET /api/v1/products` must process complex client queries safely and deterministically without causing database meltdown.

```txt
Incoming Request Query:
?category_id=cat_12&min_price=2000&max_price=8000&status=active&sort=price:desc&cursor=eyJpZCI6NDgyLCJwcmljZSI6NTUwMH0=&limit=20
                                  │
                                  ▼
 1. Query Whitelist Validation (Reject unapproved fields; sanitize SQL)
                                  │
                                  ▼
 2. Scope Injection (Append `deleted_at IS NULL` and tenant/visibility scopes)
                                  │
                                  ▼
 3. Predicate Construction (Map `min_price` to `price >= 2000`, `category_id` to `IN (...)`)
                                  │
                                  ▼
 4. Cursor Token Decoding (Extract last seen `(price, id)` tuple for index seeking)
                                  │
                                  ▼
 5. Index-Accelerated SQL Execution (Utilize composite index on `(category_id, status, price, id)`)
                                  │
                                  ▼
 6. Response Serialization (Attach next cursor token + ETag header)
```

#### Why Cursor-Based Pagination Is Mandatory

Offset-based pagination (`LIMIT 20 OFFSET 50000`) forces database engines to execute a full index or table scan to locate and skip 50,000 rows before returning row 50,001 through 50,0020. Under heavy traffic, pages past page 50 degrade exponentially in CPU and disk I/O. Furthermore, if a new product is added to page 1 while a user pages through the catalog, items shift positions, causing duplicates or skipped items.

Cursor-based (keyset) pagination relies on deterministic column values from an index. For sorting by `price DESC, id DESC`:
1. The client passes an opaque Base64 cursor containing the last item's `price` and `id`.
2. The database executes an immediate `O(log N)` B-Tree search:
   ```sql
   WHERE (price < :cursor_price) OR (price = :cursor_price AND id < :cursor_id)
   ORDER BY price DESC, id DESC
   LIMIT 21;
   ```
3. Fetching `limit + 1` rows determines whether a next page exists without running an expensive `COUNT(*)` across millions of records.

### Conditional Reads and ETag Caching

Product listing and detail endpoints experience the highest read traffic in an application. To reduce database load and network egress costs, the API computes an HTTP entity tag (`ETag`) based on the product's ID, updated timestamp, and version hash:

```txt
Client                                            API Server / Cache
  │                                                       │
  ├─────── GET /api/v1/products/8492 ────────────────────►│ (Computes response)
  │                                                       │ (Generates ETag: "w/prod-8492-v4")
  │◄────── 200 OK [ETag: "w/prod-8492-v4", Body] ─────────┤
  │                                                       │
  │ (5 minutes later: re-validates item)                  │
  ├─────── GET /api/v1/products/8492 ────────────────────►│
  │        Header: If-None-Match: "w/prod-8492-v4"        │ (Checks DB updated_at)
  │                                                       │ (Hash matches "w/prod-8492-v4")
  │◄────── 304 Not Modified (No body payload!) ───────────┤
```

When a client sends `If-None-Match: "w/prod-8492-v4"`, the server compares the incoming hash against the current record. If identical, the server immediately returns `304 Not Modified` with zero response body, cutting bandwidth consumption to near zero.

---

## 4. Real Code — See It Working

Here is an architectural implementation in Node.js and TypeScript showing the complete product lifecycle: DTO validation, transaction management, partial index handling, dynamic query filtering with cursor pagination, and conditional ETag caching.

### 1. Database Migration (PostgreSQL)

```sql
-- Create parent products table
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    brand VARCHAR(100),
    category_id INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

-- Create SKU variants table
CREATE TABLE product_variants (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    sku VARCHAR(64) NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}',
    price_cents INT NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    inventory_quantity INT NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

-- CRITICAL: Filtered unique index allows duplicate SKUs only when soft-deleted
CREATE UNIQUE INDEX uq_variants_active_sku 
ON product_variants (sku) 
WHERE deleted_at IS NULL;

-- Composite index for catalog filtering, sorting, and cursor seek
CREATE INDEX idx_products_catalog_search 
ON products (category_id, is_active, id DESC) 
WHERE deleted_at IS NULL;
```

### 2. Validation Schemas & Types

```typescript
import { z } from "zod";

// Create Product Schema: Validates parent entity + nested initial variants
export const CreateProductSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().optional(),
  brand: z.string().max(100).optional(),
  categoryId: z.number().int().positive(),
  variants: z.array(z.object({
    sku: z.string().trim().min(3).max(64).regex(/^[A-Z0-9_-]+$/, "SKU must be alphanumeric"),
    attributes: z.record(z.string()),
    priceCents: z.number().int().nonnegative("Price in minor units cannot be negative"),
    currency: z.string().length(3).default("USD"),
    inventoryQuantity: z.number().int().nonnegative().default(0)
  })).min(1, "Product must have at least one SKU variant")
});

// Partial Update Schema for PATCH: All fields optional
export const PatchProductSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().optional(),
  brand: z.string().max(100).optional(),
  categoryId: z.number().int().positive().optional(),
  isActive: z.boolean().optional()
});

// Listing Filter Query Schema
export const ListProductsQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  minPriceCents: z.coerce.number().int().nonnegative().optional(),
  maxPriceCents: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional() // Base64 encoded cursor token
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type PatchProductInput = z.infer<typeof PatchProductSchema>;
export type ListProductsQuery = z.infer<typeof ListProductsQuerySchema>;
```

### 3. Production Service & Controller

```typescript
import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { Pool, PoolClient } from "pg";
import { 
  CreateProductSchema, 
  PatchProductSchema, 
  ListProductsQuerySchema 
} from "./product.schemas";

export class ProductController {
  constructor(private readonly db: Pool) {}

  /**
   * POST /api/v1/products
   * Atomic parent + variant creation with Location header
   */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const client: PoolClient = await this.db.connect();
    try {
      const payload = CreateProductSchema.parse(req.body);

      await client.query("BEGIN");

      // 1. Insert parent product
      const productInsertSql = `
        INSERT INTO products (title, description, brand, category_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id, title, description, brand, category_id, is_active, version, created_at
      `;
      const productResult = await client.query(productInsertSql, [
        payload.title,
        payload.description || null,
        payload.brand || null,
        payload.categoryId
      ]);
      const product = productResult.rows[0];

      // 2. Insert all variants within the same transaction
      const variants = [];
      const variantInsertSql = `
        INSERT INTO product_variants (product_id, sku, attributes, price_cents, currency, inventory_quantity)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, sku, attributes, price_cents, currency, inventory_quantity
      `;

      for (const v of payload.variants) {
        const vResult = await client.query(variantInsertSql, [
          product.id,
          v.sku,
          JSON.stringify(v.attributes),
          v.priceCents,
          v.currency,
          v.inventoryQuantity
        ]);
        variants.push(vResult.rows[0]);
      }

      await client.query("COMMIT");

      // REST requirement: Point to new resource via Location header
      res.setHeader("Location", `/api/v1/products/${product.id}`);
      res.status(201).json({
        data: {
          ...product,
          variants
        }
      });
    } catch (err: any) {
      await client.query("ROLLBACK");
      // Handle partial unique index collision gracefully
      if (err.code === "23505" && err.constraint === "uq_variants_active_sku") {
        res.status(409).json({
          error: {
            code: "DUPLICATE_SKU",
            message: "One or more SKUs are already in use by an active product variant."
          }
        });
        return;
      }
      next(err);
    } finally {
      client.release();
    }
  };

  /**
   * GET /api/v1/products/:id
   * Detail read with ETag caching and soft-delete filtering
   */
  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productId = parseInt(req.params.id, 10);
      if (Number.isNaN(productId)) {
        res.status(400).json({ error: { code: "INVALID_ID", message: "Product ID must be an integer." } });
        return;
      }

      // Fetch parent product only if not soft-deleted
      const productQuery = `
        SELECT p.id, p.title, p.description, p.brand, p.category_id, p.is_active, 
               p.version, p.updated_at
        FROM products p
        WHERE p.id = $1 AND p.deleted_at IS NULL
      `;
      const productRes = await this.db.query(productQuery, [productId]);
      if (productRes.rowCount === 0) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Product not found or has been archived." } });
        return;
      }
      const product = productRes.rows[0];

      // Fetch active variants
      const variantsQuery = `
        SELECT id, sku, attributes, price_cents, currency, inventory_quantity, updated_at
        FROM product_variants
        WHERE product_id = $1 AND deleted_at IS NULL
        ORDER BY id ASC
      `;
      const variantsRes = await this.db.query(variantsQuery, [productId]);

      const responsePayload = {
        data: {
          ...product,
          variants: variantsRes.rows
        }
      };

      // Construct ETag from updated_at timestamp and version
      const etagSource = `${product.id}-${product.version}-${product.updated_at.toISOString()}`;
      const etag = `W/"${crypto.createHash("sha1").update(etagSource).digest("hex")}"`;

      // Conditional HTTP Check: If client cache matches, return 304
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }

      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=60");
      res.status(200).json(responsePayload);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/products
   * Filtered pipeline with cursor-based pagination
   */
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ListProductsQuerySchema.parse(req.query);
      const params: any[] = [];
      const whereConditions: string[] = ["p.deleted_at IS NULL", "p.is_active = TRUE"];

      // 1. Dynamic safe filtering
      if (query.categoryId) {
        params.push(query.categoryId);
        whereConditions.push(`p.category_id = $${params.length}`);
      }

      // 2. Cursor decoding for deterministic O(log N) seeking
      if (query.cursor) {
        const decoded = Buffer.from(query.cursor, "base64").toString("utf-8");
        const lastId = parseInt(decoded, 10);
        if (!Number.isNaN(lastId)) {
          params.push(lastId);
          whereConditions.push(`p.id < $${params.length}`);
        }
      }

      // Fetch limit + 1 to determine if there is a next page
      params.push(query.limit + 1);
      const limitParamIdx = params.length;

      const sql = `
        SELECT p.id, p.title, p.brand, p.category_id, p.created_at
        FROM products p
        WHERE ${whereConditions.join(" AND ")}
        ORDER BY p.id DESC
        LIMIT $${limitParamIdx}
      `;

      const result = await this.db.query(sql, params);
      const hasNextPage = result.rows.length > query.limit;
      const items = hasNextPage ? result.rows.slice(0, query.limit) : result.rows;

      // Generate next cursor from the last item
      let nextCursor: string | null = null;
      if (hasNextPage && items.length > 0) {
        const lastItem = items[items.length - 1];
        nextCursor = Buffer.from(String(lastItem.id)).toString("base64");
      }

      res.status(200).json({
        data: items,
        pagination: {
          limit: query.limit,
          hasNextPage,
          nextCursor
        }
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/products/:id
   * Partial atomic mutation with optimistic locking check
   */
  patch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productId = parseInt(req.params.id, 10);
      const updates = PatchProductSchema.parse(req.body);

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: { code: "EMPTY_PATCH", message: "No update fields provided." } });
        return;
      }

      const setClauses: string[] = ["updated_at = NOW()", "version = version + 1"];
      const params: any[] = [productId];

      if (updates.title !== undefined) {
        params.push(updates.title);
        setClauses.push(`title = $${params.length}`);
      }
      if (updates.description !== undefined) {
        params.push(updates.description);
        setClauses.push(`description = $${params.length}`);
      }
      if (updates.brand !== undefined) {
        params.push(updates.brand);
        setClauses.push(`brand = $${params.length}`);
      }
      if (updates.categoryId !== undefined) {
        params.push(updates.categoryId);
        setClauses.push(`category_id = $${params.length}`);
      }
      if (updates.isActive !== undefined) {
        params.push(updates.isActive);
        setClauses.push(`is_active = $${params.length}`);
      }

      const updateSql = `
        UPDATE products
        SET ${setClauses.join(", ")}
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, title, description, brand, category_id, is_active, version, updated_at
      `;

      const result = await this.db.query(updateSql, params);
      if (result.rowCount === 0) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Product not found or archived." } });
        return;
      }

      res.status(200).json({ data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/products/:id
   * Safe soft-delete marking deleted_at on parent and variants
   */
  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const client = await this.db.connect();
    try {
      const productId = parseInt(req.params.id, 10);

      await client.query("BEGIN");

      // Soft-delete parent product
      const productRes = await client.query(
        `UPDATE products SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
        [productId]
      );

      if (productRes.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Product does not exist or was already deleted." } });
        return;
      }

      // Cascade soft-delete to variants so they are excluded from inventory lookups
      await client.query(
        `UPDATE product_variants SET deleted_at = NOW() WHERE product_id = $1 AND deleted_at IS NULL`,
        [productId]
      );

      await client.query("COMMIT");

      // REST convention for successful deletion with no body
      res.status(204).end();
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  };
}
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact architectural and semantic difference between PUT and PATCH in a product catalog API?**

`PUT` is defined by RFC 9110 as a complete replacement of the target resource state. When a client sends a `PUT /api/v1/products/42` with `{ "title": "New Title", "categoryId": 5 }`, the server must replace the entire resource representation. Any optional fields omitted from the request (such as `description`, `brand`, or `tags`) must be cleared, reset to their schema defaults, or set to `NULL`. Because `PUT` sends the complete state, repeating the identical request multiple times produces the exact same server state, making `PUT` strictly idempotent.

`PATCH` is designed for partial mutations (RFC 5789). When sending `PATCH /api/v1/products/42` with `{ "brand": "Nike" }`, the server updates only the `brand` attribute while leaving all other existing fields untouched. In modern web architectures, frontend applications should use `PATCH` for field-level updates (such as changing an inventory quantity or updating a product price) to avoid race conditions where two concurrent editors overwrite and wipe out each other's changes.

---

**Q: How do you implement soft deletes without breaking unique database constraints like unique SKUs?**

A standard unique constraint across `product_variants(sku)` causes hard conflicts when an item is soft-deleted and a new item is created with that same SKU. The production solution is a **partial / filtered unique index**:

```sql
CREATE UNIQUE INDEX uq_variants_active_sku 
ON product_variants (sku) 
WHERE deleted_at IS NULL;
```

This ensures the database enforces uniqueness strictly across records where `deleted_at IS NULL`. You can have ten soft-deleted historical rows with SKU `SHOE-BLK-10`, but only one active row. Database queries on write operations enforce this constraint automatically at the engine level without requiring application-side table locking.

---

**Q: Why is cursor-based pagination preferred over OFFSET/LIMIT for high-scale product catalogs?**

Offset pagination (`OFFSET 50000 LIMIT 20`) requires the storage engine to perform a full index walk or table scan to skip the first 50,000 rows before reading 20 rows. As the offset increases, query execution time and disk I/O grow linearly ($O(N)$), causing database performance to degrade on deep pages. Additionally, if products are inserted or deleted while a customer navigates between pages, items shift positions, causing users to see duplicate items or miss items entirely.

Cursor pagination uses indexed, ordered columns as a seek predicate (`WHERE (price, id) < (:cursor_price, :cursor_id) ORDER BY price DESC, id DESC LIMIT 21`). The database uses B-Tree index traversal ($O(\log N)$) to jump directly to the target node regardless of whether you are on page 1 or page 5,000, ensuring constant-time latency and zero item duplication.

---

**Q: How should parent products and SKU variants be modeled in API payloads and database transactions?**

A product should be modeled as a 1-to-many relationship:
1. **Parent Product Table (`products`):** Stores marketing and grouping attributes (title, description, brand, category, active status).
2. **Variant Table (`product_variants`):** Stores discrete stock keeping units (SKU, color, size, price in minor currency units, stock quantity).

When executing `POST /api/v1/products`, the request payload accepts both parent attributes and an array of nested variants. The backend wraps the parent insert and variant inserts in a single database transaction (`BEGIN ... COMMIT`). If any variant violates a validation rule or unique SKU constraint, the entire transaction rolls back, preventing orphaned parent products without inventory.

---

**Q: How do ETags and conditional HTTP requests optimize read-heavy catalog endpoints?**

An ETag is a digest token representing the state of a resource (e.g., a SHA-1 hash of `id + version + updated_at`). When a client requests `GET /api/v1/products/42`, the server calculates the ETag and attaches it to the response header: `ETag: W/"prod-42-v3"`.

When the client or CDN re-validates the product later, it includes the header `If-None-Match: W/"prod-42-v3"`. The server queries the product's version/timestamp. If unchanged, the server returns `304 Not Modified` with zero body bytes. This eliminates database payload serialization, cuts network egress costs by over 90%, and accelerates page load times for returning shoppers.

---

**Q: How do you prevent SQL injection and accidental full-table scans when designing dynamic filtering pipelines?**

1. **Whitelisting:** Reject or strip any query parameters not explicitly defined in a strict schema (such as Zod or Pydantic). Never allow client input to dictate column names in `ORDER BY` or `WHERE` clauses directly.
2. **Parameterized Queries:** Always bind values using query placeholders (`$1, $2` in Postgres, `?` in MySQL) rather than string interpolation.
3. **Composite Indexing:** For multi-faceted queries (e.g., `category_id = 10 AND is_active = TRUE AND price_cents BETWEEN 2000 AND 5000`), establish composite B-Tree indexes matching the query predicate order: `(category_id, is_active, price_cents, id)`.
4. **Complexity Caps:** Enforce strict query parameter bounds (e.g., `limit` capped at 100) and query timeouts to prevent malicious denial-of-service queries.

---

## 6. The Traps — What Goes Wrong

### Trap 1: The Hard Delete Domino Effect
- **The Wrong Assumption:** Deleting an obsolete product directly via `DELETE FROM products WHERE id = 10` is clean and frees up database space.
- **What Actually Happens:** The database either rejects the query due to foreign key constraints on `order_items`, or if configured with `ON DELETE CASCADE`, silently deletes thousands of historical customer orders and financial line items, corrupting accounting and auditing records.
- **The Fix:** Implement soft deletes using a `deleted_at TIMESTAMPTZ NULL` column. Automatically inject `WHERE deleted_at IS NULL` into all public-facing query scopes.

---

### Trap 2: Floating-Point Currency Drift
- **The Wrong Assumption:** Storing prices as `FLOAT` or `DOUBLE` (e.g., `$19.99` as `19.99`) is sufficient for e-commerce.
- **What Actually Happens:** Floating-point arithmetic introduces IEEE 754 precision loss. Adding 10% tax to `19.99` produces `21.989000000000004`. When aggregating sales reports across a million transactions, discrepancies amount to thousands of dollars in accounting errors.
- **The Fix:** Store prices in integer minor units (e.g., `1999` cents) or database-native `DECIMAL(12, 2)` types, and always track the ISO currency code explicitly.

---

### Trap 3: The PUT Payload Overwrite Wipeout
- **The Wrong Assumption:** Using `PUT /products/:id` interchangeably with `PATCH` and passing only `{ "priceCents": 2500 }`.
- **What Actually Happens:** Strict REST semantics dictate that `PUT` replaces the entire record. If the backend accepts partial fields in a `PUT` handler, unspecified columns (`description`, `brand`, `images`) get overwritten with `NULL` or default values, destroying existing product data.
- **The Fix:** Reserve `PUT` for complete resource overwrites where all required schema fields are provided. Use `PATCH` for partial attribute updates.

---

### Trap 4: Memory Leaks and Unbounded Offset Scanning
- **The Wrong Assumption:** Relying on `OFFSET :page * :limit` for catalog browsing across deep product inventories.
- **What Actually Happens:** At `page = 2000` with `limit = 50`, the database reads 100,000 records from disk and discards them before returning 50 rows. CPU utilization spikes to 100%, query latency exceeds 10 seconds, and concurrent requests exhaust the database connection pool.
- **The Fix:** Enforce cursor-based keyset pagination for high-volume listing endpoints.

---

### Trap 5: Leaking Soft-Deleted Rows in Joins and Aggregations
- **The Wrong Assumption:** Adding `WHERE deleted_at IS NULL` on the primary `products` table query is enough.
- **What Actually Happens:** When querying inventory counts or categories via `JOIN`, deleted variants or products are included in `SUM(inventory_quantity)` or `COUNT(*)` aggregates, displaying out-of-stock or phantom products on the frontend storefront.
- **The Fix:** Apply soft-delete filters to every joined relation in database queries:
  ```sql
  SELECT p.id, SUM(v.inventory_quantity) AS total_stock
  FROM products p
  LEFT JOIN product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
  WHERE p.deleted_at IS NULL
  GROUP BY p.id;
  ```

---

## 7. Compare With Related Concepts

### Soft Delete (`deleted_at`) vs. Hard Delete (`DELETE FROM`) vs. State Machine (`status = 'archived'`)

- **Soft Delete (`deleted_at`):** Sets a timestamp when an entity is removed from the active catalog. The item is hidden from normal client queries but remains intact for historical foreign keys and audit reports.
- **Hard Delete (`DELETE FROM`):** Physically purges the row from storage. Only appropriate for GDPR compliance ("Right to be Forgotten") or temporary scratch data.
- **Status State Machine (`status = 'draft' | 'active' | 'archived'`):** Manages explicit business lifecycles. A product can be in `draft` mode before publishing, `active` on the storefront, and `archived` when seasonal demand ends. Often used in conjunction with `deleted_at` (where `deleted_at` represents deletion from the management interface).
- **Rule of Thumb:** Use `status` for normal business lifecycle transitions; use `deleted_at` for non-destructive removal; never use hard deletes for commercial transactional records.

---

### PUT vs. PATCH vs. POST Sub-Resource Action

- **`PUT /products/:id`:** Replaces the entire resource state idempotently.
- **`PATCH /products/:id`:** Mutates specific fields of an existing resource.
- **`POST /products/:id/publish` or `POST /products/:id/archive`:** An RPC-over-REST pattern used when an operation triggers complex business workflows (such as notifying search indexers, sending webhooks, and checking inventory gates) that represent an explicit state transition rather than a simple field update.
- **Rule of Thumb:** Use `PATCH` for simple field updates; use sub-resource action endpoints (`POST /.../action`) for multi-step domain workflows.

---

### REST Query Parameter Filtering vs. GraphQL Dynamic Filtering

- **REST Query Parameters (`GET /products?category=1&min_price=20`):** Relies on standard HTTP GET requests with cacheable URLs, straightforward CDN caching, standard HTTP status codes, and deterministic composite database indexes.
- **GraphQL (`query { products(filter: {...}) { id, title } }`):** Allows clients to request arbitrary nested fields and filter combinations. Flexible for frontend consumers, but requires complex query depth limiting, custom cache keys, and careful N+1 query mitigations (DataLoader).
- **Rule of Thumb:** Use REST with query pipelines for public, high-traffic catalog browsing where CDN edge caching is essential; use GraphQL for complex, internal, data-dense client dashboards.

---

## 8. 🧠 The Memory Hook — What Sticks

> **A production Product API never destroys history and never guesses intent.** Store money in integer cents, update specific fields with `PATCH`, retire records with `deleted_at` protected by partial unique indexes, and navigate millions of items using index-anchored cursors rather than offsets.
