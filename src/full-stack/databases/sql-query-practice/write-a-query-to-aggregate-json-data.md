# Write a Query to Aggregate JSON Data in SQL

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to aggregate JSON data in SQL, they are testing whether you understand modern hybrid databases that bridge relational tables and semi-structured documents. Specifically, they want to know if you understand the two opposite directions of JSON data processing in SQL:

1. **Relational to JSON (Packaging / Nesting):** Combining multiple relational rows across 1-to-many joins into nested JSON arrays and objects directly inside the database query. This eliminates the classic "N+1 query" problem and avoids shipping duplicate joined columns across the wire to your Node.js or Python backend.
2. **JSON to Relational (Shredding / Unnesting):** Extracting nested arrays or key-value structures stored inside a `JSON` or `JSONB` column, flattening them into tabular rows, and computing standard aggregates like `SUM`, `AVG`, `COUNT`, and `GROUP BY`.

Beyond basic syntax, interviewers are listening for dialect awareness between PostgreSQL (`jsonb_build_object`, `jsonb_agg`, `jsonb_array_elements`, `->`, `->>`) and MySQL (`JSON_OBJECT`, `JSON_ARRAYAGG`, `JSON_TABLE`, `->`, `->>`), operator precision (the difference between extracting a raw JSON element versus a scalar string), and whether you know how to index JSON paths so queries do not degrade into full table scans.

## 2. Think Before You Code — The Senior Dev Thought Process

When I see a JSON aggregation problem in an interview, my thought process follows a structured sequence before writing a single line of SQL:

First, I clarify the direction of the aggregation:
- Are we starting with standard relational tables and packaging the output into a nested JSON structure for a REST or GraphQL API?
- Or do we have raw JSON payloads sitting in a database column that need to be unpacked, filtered, and aggregated?

If the goal is **packaging relational data into nested JSON**:
- The naive approach in many backend applications is to execute a `LEFT JOIN` between `users` and `orders`, stream all redundant parent columns over the network, and write a manual `.reduce()` loop in JavaScript or a dictionary loop in Python to group orders under each user.
- That wastes network bandwidth and application memory.
- The optimal approach is using aggregate functions like `jsonb_agg()` (PostgreSQL) or `JSON_ARRAYAGG()` (MySQL) combined with object constructors (`jsonb_build_object` / `JSON_OBJECT`).
- I immediately watch out for the `LEFT JOIN` empty array trap: if a user has zero orders, a naive `jsonb_agg()` returns `[null]` or `[{"order_id": null}]` instead of a clean empty array `[]`. I must guard this with `COALESCE` or a `FILTER` clause.

If the goal is **aggregating data trapped inside JSON columns**:
- The naive approach is pulling millions of JSON blobs into Node.js memory with `SELECT payload FROM events`, parsing them with `JSON.parse()`, and calculating sums in application code. That destroys server memory and fails pagination.
- The optimal approach is unnesting the array inside the database engine. In PostgreSQL, that means using `CROSS JOIN LATERAL jsonb_array_elements()` or `jsonb_to_recordset()`. In MySQL 8.0+, it means using `JSON_TABLE()` to turn the JSON array into an on-the-fly virtual relational table.
- I must be careful with operators: `->` returns a JSON object or quoted string, whereas `->>` returns pure text. If I use `->` inside a `SUM()` or `WHERE` clause without casting, the query will fail or produce incorrect string comparisons.

## 3. The Solution — Fully Explained Code

Here are the complete, production-ready solutions for both directions across PostgreSQL and MySQL.

### Problem 1: Constructing Nested JSON API Payloads from Relational Tables

Given a `users` table and an `orders` table, aggregate each user's profile and their complete list of orders into a single nested JSON object per user.

#### PostgreSQL Solution (`jsonb_build_object` + `jsonb_agg`)

```sql
SELECT 
    u.id AS user_id,
    jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'email', u.email,
        -- Guard against null order rows on users with zero orders
        'orders', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'order_id', o.id,
                    'amount', o.total_amount,
                    'status', o.status,
                    'created_at', o.created_at
                )
            ) FILTER (WHERE o.id IS NOT NULL),
            '[]'::jsonb
        ),
        'total_spent', COALESCE(SUM(o.total_amount), 0)
    ) AS user_profile_json
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name, u.email;
```

#### MySQL 8.0+ Solution (`JSON_OBJECT` + `JSON_ARRAYAGG`)

```sql
SELECT 
    u.id AS user_id,
    JSON_OBJECT(
        'id', u.id,
        'name', u.name,
        'email', u.email,
        'orders', CASE 
            -- When user has no orders, return empty JSON array []
            WHEN COUNT(o.id) = 0 THEN JSON_ARRAY()
            ELSE JSON_ARRAYAGG(
                JSON_OBJECT(
                    'order_id', o.id,
                    'amount', o.total_amount,
                    'status', o.status,
                    'created_at', o.created_at
                )
            )
        END,
        'total_spent', COALESCE(SUM(o.total_amount), 0)
    ) AS user_profile_json
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name, u.email;
```

---

### Problem 2: Unnesting and Aggregating Data Stored Inside JSON Columns

Given an `events` table storing checkout payloads in a JSON column:
```json
{
  "session_id": "sess_982",
  "items": [
    {"sku": "LAPTOP-01", "qty": 1, "price": 1200.00},
    {"sku": "MOUSE-05", "qty": 2, "price": 25.00}
  ]
}
```
Calculate total units sold and total revenue grouped by `sku`.

#### PostgreSQL Solution (`CROSS JOIN LATERAL` + `jsonb_to_recordset`)

```sql
SELECT 
    item.sku,
    SUM(item.qty) AS total_units_sold,
    SUM(item.qty * item.price) AS total_revenue
FROM events e
-- Unnest the JSON array into relational rows with explicit SQL types
CROSS JOIN LATERAL jsonb_to_recordset(e.payload->'items') AS item(
    sku VARCHAR(50),
    qty INT,
    price NUMERIC(10, 2)
)
WHERE e.event_type = 'order_completed'
GROUP BY item.sku
ORDER BY total_revenue DESC;
```

#### MySQL 8.0+ Solution (`JSON_TABLE`)

```sql
SELECT 
    jt.sku,
    SUM(jt.qty) AS total_units_sold,
    SUM(jt.qty * jt.price) AS total_revenue
FROM events e,
-- JSON_TABLE transforms the JSON array path into a virtual table
JSON_TABLE(
    e.payload,
    '$.items[*]' COLUMNS (
        sku VARCHAR(50) PATH '$.sku',
        qty INT PATH '$.qty',
        price DECIMAL(10, 2) PATH '$.price'
    )
) AS jt
WHERE e.event_type = 'order_completed'
GROUP BY jt.sku
ORDER BY total_revenue DESC;
```

---

### Indexing & Performance Strategy

Extracting values from JSON columns without an index causes a sequential table scan on every query.

1. **PostgreSQL GIN Indexing:**
   ```sql
   -- Top-level containment search index (e.g. payload @> '{"session_id": "123"}')
   CREATE INDEX idx_events_payload_gin ON events USING GIN (payload);

   -- B-Tree index on a single extracted scalar field for fast equality & range lookups
   CREATE INDEX idx_events_session_id ON events ((payload->>'session_id'));
   ```

2. **MySQL Generated Stored Columns:**
   ```sql
   -- Extract scalar value into a virtual stored column and index it with standard B-Tree
   ALTER TABLE events 
   ADD COLUMN session_id VARCHAR(64) 
   GENERATED ALWAYS AS (payload->>'$.session_id') STORED;

   CREATE INDEX idx_events_session_id ON events (session_id);
   ```

### Complexity
- **Time Complexity:**
  - *Relational to JSON:* `O(U + O_total)` where `U` is number of users and `O_total` is total orders matched, dominated by the hash join and group-by aggregation.
  - *JSON Unnesting:* `O(E * K)` where `E` is filtered event rows and `K` is average items per JSON array. With an index on `event_type`, only matching rows are parsed.
- **Space Complexity:** `O(R)` working memory in database sort/hash buffers (`work_mem` in PostgreSQL, `sort_buffer_size` in MySQL) to assemble the grouped JSON structures before streaming the result cursor to the client.

## 4. Dry Run — Walk Through a Real Example

Let's trace Problem 1 (Relational to Nested JSON) step-by-step with three sample users.

### Sample Input Rows

**`users` Table:**

| id | name | email |
|---|---|---|
| 1 | Alice | alice@example.com |
| 2 | Bob | bob@example.com |
| 3 | Charlie | charlie@example.com |

**`orders` Table:**

| id | user_id | total_amount | status | created_at |
|---|---|---|---|---|
| 101 | 1 | 120.00 | completed | 2026-01-10 |
| 102 | 1 | 45.50 | completed | 2026-01-15 |
| 103 | 2 | 300.00 | pending | 2026-02-01 |

*(Note: Charlie has 0 orders).*

### Step-by-Step Query Execution

1. **Step 1: The `LEFT JOIN` Phase:**
   The engine matches users to orders.
   - User 1 produces 2 joined rows (order 101, order 102).
   - User 2 produces 1 joined row (order 103).
   - User 3 produces 1 joined row with all `o.*` columns set to `NULL`.

2. **Step 2: Item Packaging (`jsonb_build_object` / `JSON_OBJECT`):**
   For each order row, the engine creates an individual JSON object:
   - Row 1: `{"order_id": 101, "amount": 120.00, "status": "completed", ...}`
   - Row 2: `{"order_id": 102, "amount": 45.50, "status": "completed", ...}`
   - Row 3: `{"order_id": 103, "amount": 300.00, "status": "pending", ...}`
   - Row 4 (Charlie): `o.id` is `NULL`. The `FILTER (WHERE o.id IS NOT NULL)` discards this row from array aggregation.

3. **Step 3: Group Aggregation (`jsonb_agg` / `JSON_ARRAYAGG`):**
   The engine groups rows by `u.id`:
   - Alice: aggregates the 2 objects into a JSON array: `[{"order_id": 101, ...}, {"order_id": 102, ...}]`. `SUM` is `165.50`.
   - Bob: aggregates 1 object into: `[{"order_id": 103, ...}]`. `SUM` is `300.00`.
   - Charlie: 0 matching order rows pass the filter. `jsonb_agg` evaluates to `NULL`, but `COALESCE(..., '[]'::jsonb)` safely turns it into `[]`. `SUM` evaluates to `0`.

4. **Step 4: Top-Level Object Assembly:**
   The outer `jsonb_build_object` packs everything into the final JSON output:

```json
{
  "id": 1,
  "name": "Alice",
  "email": "alice@example.com",
  "orders": [
    {"order_id": 101, "amount": 120.00, "status": "completed", "created_at": "2026-01-10"},
    {"order_id": 102, "amount": 45.50, "status": "completed", "created_at": "2026-01-15"}
  ],
  "total_spent": 165.50
}
```
Charlie's result is clean and API-ready:
```json
{
  "id": 3,
  "name": "Charlie",
  "email": "charlie@example.com",
  "orders": [],
  "total_spent": 0
}
```

## 5. Edge Cases — The Ones That Break Naive Solutions

### 1. The `[null]` Array Bug in `LEFT JOIN` Aggregations
- **The Trap:** Running `jsonb_agg(jsonb_build_object('id', o.id))` on a `LEFT JOIN` without filtering out NULLs.
- **Why it breaks:** When Charlie has no orders, `o.id` is NULL. `jsonb_build_object('id', NULL)` evaluates to `{"id": null}`. `jsonb_agg()` then wraps that into `[{"id": null}]`. Frontend code expecting an empty array `[]` will iterate over a single corrupt object and crash when reading `order.id.toString()`.
- **The Fix:** In PostgreSQL, use `jsonb_agg(...) FILTER (WHERE o.id IS NOT NULL)`. In MySQL, use `CASE WHEN COUNT(o.id) = 0 THEN JSON_ARRAY() ELSE JSON_ARRAYAGG(...) END`.

### 2. `->` (Extract JSON) vs `->>` (Extract Text)
- **The Trap:** Writing `WHERE payload->'status' = 'completed'` or `SUM(payload->'price')`.
- **Why it breaks:**
  - `payload->'status'` returns `"\"completed\""` (a JSON scalar string, including the quotes).
  - Comparing `"\"completed\""` with SQL string `'completed'` evaluates to `FALSE`.
  - In math operations, `SUM(payload->'price')` attempts to sum JSON objects rather than numbers.
- **The Fix:** Use `->>` to extract unquoted SQL text, and cast to numeric types when aggregating:
  ```sql
  WHERE payload->>'status' = 'completed'
  -- and
  SUM((payload->>'price')::numeric)
  ```

### 3. SQL `NULL` vs JSON `null`
- **The Trap:** Assuming `payload->'field' IS NULL` checks whether the field has a JSON null value.
- **Why it breaks:** If a column has `{"discount": null}`, `payload->'discount'` returns `'null'::jsonb`, which is **not** SQL `NULL`. `payload->'discount' IS NULL` evaluates to `FALSE`.
- **The Fix:** Check with `payload->>'discount' IS NULL` (because `->>` coerces JSON null to SQL NULL) or use `jsonb_typeof(payload->'discount') = 'null'`.

### 4. Floating Point Precision Loss in Aggregations
- **The Trap:** Extracting currency or pricing data from JSON and relying on default database type coercion.
- **Why it breaks:** JSON numeric values without explicit database typing default to double precision floats, leading to rounding discrepancies (e.g. `$0.0000000000004` errors).
- **The Fix:** Always cast extracted numeric paths to explicit fixed-point types like `NUMERIC(10, 2)` or `DECIMAL(10, 2)`.

## 6. Variations and Follow-ups

### Variation 1: Dynamic Key-Value Aggregation with `JSON_OBJECTAGG` / `jsonb_object_agg`
What if the interviewer asks you to pivot rows into a dynamic key-value dictionary? For example, turning user preference rows (`user_id`, `pref_key`, `pref_value`) into `{"theme": "dark", "notifications": "enabled"}`.

- **PostgreSQL:**
  ```sql
  SELECT 
      user_id,
      jsonb_object_agg(pref_key, pref_value) AS preferences
  FROM user_preferences
  GROUP BY user_id;
  ```
- **MySQL:**
  ```sql
  SELECT 
      user_id,
      JSON_OBJECTAGG(pref_key, pref_value) AS preferences
  FROM user_preferences
  GROUP BY user_id;
  ```

### Variation 2: Deep Path Extraction on Complex Nested Payloads
What if the target data is nested 3 levels deep: `{"customer": {"address": {"geo": {"lat": 37.77, "lng": -122.41}}}}`?
- **PostgreSQL path operator (`#>>`):**
  ```sql
  SELECT payload #>> '{customer, address, geo, lat}' AS latitude
  FROM checkouts;
  ```
- **MySQL JSON path expression:**
  ```sql
  SELECT payload->>'$.customer.address.geo.lat' AS latitude
  FROM checkouts;
  ```

### Variation 3: When to Stop Using JSON in SQL and Normalize
Interviewers frequently follow up with: *"When should we NOT store this as JSON in PostgreSQL/MySQL?"*
- **Keep in JSON:** Dynamic polymorphic attributes (e.g. custom user fields), third-party webhook payloads stored for auditing, and read-heavy sub-documents always fetched together.
- **Normalize to Relational Tables:** Any data requiring foreign key integrity constraints, fields updated frequently with high concurrency (modifying a deeply nested key locks and rewrites the whole JSON column), and columns frequently involved in relational joins or composite multi-column indexes.

## 7. 🧠 The Memory Hook

> **Double arrow (`->>`) pulls out plain text; `BUILD` + `AGG` packages rows up into JSON; `TABLE` / `LATERAL` shreds JSON down into rows.**

If you are packing relational data up for an API, use `jsonb_build_object` + `jsonb_agg` (or `JSON_OBJECT` + `JSON_ARRAYAGG`). If you are tearing open a JSON array to calculate metrics, use `jsonb_to_recordset` / `LATERAL` in PostgreSQL or `JSON_TABLE` in MySQL.
