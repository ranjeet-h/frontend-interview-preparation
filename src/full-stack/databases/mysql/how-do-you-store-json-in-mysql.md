# How do you store JSON in MySQL

## 1. The Real-World Problem — When You Actually Hit This

Your product table has been stable for months: `id`, `name`, `price`. Then product asks for flexible attributes. One product needs `{"color": "red", "size": "XL"}`, another needs `{"warranty_months": 24, "bundle_items": [101, 102]}`, a third needs `{"dimensions": {"w": 10, "h": 20}}`. You could keep adding columns — `color`, `size`, `warranty_months` — but every new attribute is a migration, and most rows stay NULL.

So someone stores it as a string: `attributes TEXT` with `JSON.stringify(obj)` from Node. It works until two things break in production at once. First, a bug inserts `'{"color": red}'` — missing quotes — and MySQL happily saves it because TEXT never checks what is inside. Your app crashes later when `JSON.parse` fails on read. Second, product asks to "find all red XL products" and your query becomes `WHERE attributes LIKE '%"color": "red"%'`. That is a full table scan, it matches wrong data, it cannot use an index, and it gets slower with every row.

This is the moment you hit MySQL's JSON type. You want flexibility without giving up validation, querying, and indexing.

## 2. The Analogy — Make the Mechanic Obvious

Think of a filing cabinet drawer.

Storing JSON in a TEXT column is like tossing a handwritten note into the drawer. The cabinet does not read it. It does not know if the handwriting is valid, it does not organize it, and if you want to find "all notes that mention color red" you have to pull out every note and read it yourself.

Storing JSON in a JSON column is like putting the same note into a labeled pouch that the cabinet understands. When you slide it in, the clerk at the desk checks it — "is this valid JSON?" — and refuses it if not. Inside, the pouch is not just paper; it is filed in a compact binary filing system so the clerk can jump straight to `color` or `size` without re-reading the whole note.

Want to find things fast? You cannot put an index on the whole pouch. Instead you add a tab that sticks out of the pouch — a generated virtual column that says "this pouch's color is red." You put the index on the tab, not on the pouch. MySQL can then use that index to find red products instantly, just like finding files by tab in a cabinet.

And `JSON_TABLE` is the clerk taking one pouch that contains a list — say `bundle_items: [101, 102]` — and laying it out on the table as separate rows so you can JOIN it like a normal table.

## 3. The Full Explanation — How It Actually Works

**What the JSON column actually is.** MySQL added a native `JSON` type in 5.7.8. Before that, everyone used TEXT and parsed in the app. The JSON type looks like text when you SELECT it, but it is not stored as plain text.

On every INSERT or UPDATE, MySQL validates the value. If it is not valid JSON, the statement fails with an error. No more `'{"color": red}'` sneaking into the database.

Internally, MySQL stores JSON in a binary format, not as the raw string you sent. Since 8.0.13, this binary format is much more efficient for partial updates and for reading a single path without parsing the whole document. You still write normal JSON text in your queries — MySQL converts it on the way in and converts it back on the way out.

That binary storage is why JSON functions are fast. You do not need to pull the whole document into Node and `JSON.parse` it just to check one field. MySQL can navigate the binary structure directly.

**The core functions you actually use:**

- `JSON_EXTRACT(col, '$.color')` or the shorthand `col -> '$.color'` — gets a JSON value (keeps quotes for strings).
- `col ->> '$.color'` — same but unwraps quotes, so you get `red` not `"red"`. This is the one you use for comparisons and indexes.
- `JSON_SET(col, '$.color', 'blue')` — sets a path, creates it if missing.
- `JSON_INSERT(col, '$.color', 'blue')` — only inserts if the path does not exist.
- `JSON_REPLACE(col, '$.color', 'blue')` — only replaces if the path already exists.
- `JSON_REMOVE(col, '$.size')` — removes a key.
- `JSON_CONTAINS(col, '"red"', '$.color')` — checks if a value exists at a path.
- `JSON_SEARCH(col, 'one', 'red')` — searches for a string anywhere inside.
- `JSON_ARRAY_APPEND(col, '$.tags', 'new')` — appends to an array inside the document.

**TEXT vs JSON — the real difference:**

With TEXT, MySQL treats the value as an opaque string. No validation, no binary optimization, no JSON functions that can use structure, and no way to index a field inside without a full scan or pulling everything into the app.

With JSON, you get validation on write, efficient binary storage, direct path extraction in SQL, and the ability to index extracted values. The price is that JSON documents have overhead — a very large document costs more to update because MySQL may rewrite the whole document on change, and you lose the strict schema guarantees that real columns give you.

**How you make JSON fast — generated columns and indexes:**

You cannot create a normal index directly on a JSON path. If you write `WHERE attributes ->> '$.color' = 'red'` with no index, MySQL does a full table scan and extracts `color` from every row.

The fix is a generated virtual column. It is a column whose value is automatically computed from the JSON, but it does not take extra storage unless you make it STORED.

```sql
-- VIRTUAL means computed on read, no extra storage
-- STORED means computed on write and saved to disk
```

You create it, then index it:

```sql
ALTER TABLE products
  ADD COLUMN color VARCHAR(50)
  GENERATED ALWAYS AS (attributes ->> '$.color') VIRTUAL,
  ADD INDEX idx_color (color);
```

Now `WHERE color = 'red'` or `WHERE attributes ->> '$.color' = 'red'` can use `idx_color`. For numbers or booleans, match the generated column type: `INT`, `BOOLEAN`, `DATETIME`, etc. Use `VIRTUAL` when reads dominate and you want to save space; use `STORED` when you filter heavily on that path and want to avoid recomputing.

**JSON_TABLE — turning JSON into rows:**

Since MySQL 8.0, `JSON_TABLE` lets you treat a JSON array as a relational table on the fly. This matters when a JSON field holds a list you need to JOIN or filter row-by-row.

```sql
SELECT jt.item_id
FROM products,
JSON_TABLE(products.attributes, '$.bundle_items[*]'
  COLUMNS (item_id INT PATH '$')
) AS jt
WHERE products.id = 42;
```

Without `JSON_TABLE`, you would pull the array into Node and loop there. With it, you keep the logic in SQL and can JOIN `jt.item_id` to an `items` table.

**When to use JSON vs normalized tables:**

Use JSON when the data is semi-structured, sparse, or varies per row — user preferences, product attributes, feature flags, audit metadata, third-party webhook payloads you need to keep verbatim. It saves you from constant migrations and a forest of NULL columns.

Use normalized tables when the data has relationships, needs foreign keys, needs to be JOINed often, needs strict constraints, or is queried independently. If `bundle_items` needs referential integrity to an `items` table, or you frequently query "all orders containing item 101," that belongs in a proper `order_items` join table, not buried in JSON.

A good rule: if you find yourself creating a generated column and index for almost every field inside the JSON, that JSON should probably have been real columns or a separate table. JSON is for the flexible edges, not the relational core.

## 4. See It In Practice — Real Code or Queries

```sql
-- 1. Create a table with a JSON column
CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  attributes JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Valid inserts work
INSERT INTO products (name, attributes) VALUES
  ('T-Shirt', '{"color": "red", "size": "XL", "tags": ["cotton", "summer"]}'),
  ('Laptop', '{"color": "silver", "warranty_months": 24, "specs": {"ram_gb": 16}}'),
  ('Bundle', '{"bundle_items": [101, 102, 103], "discount_pct": 10}');

-- This also works — MySQL accepts JSON from string or JSON_OBJECT
INSERT INTO products (name, attributes)
VALUES ('Mug', JSON_OBJECT('color', 'blue', 'capacity_ml', 350));

-- 3. Invalid JSON is rejected — TEXT would have allowed this
-- ERROR 3140 (22032): Invalid JSON text
INSERT INTO products (name, attributes) VALUES ('Bad', '{"color": red}');

-- 4. Query inside JSON — -> keeps quotes, ->> unwraps them
SELECT name, attributes -> '$.color' AS color_json,
              attributes ->> '$.color' AS color_text
FROM products;
-- T-Shirt | "red" | red

-- Filter with ->> (unwrapped) for normal comparison
SELECT name FROM products WHERE attributes ->> '$.color' = 'red';

-- Check if a key exists or an array contains a value
SELECT name FROM products WHERE JSON_CONTAINS(attributes, '"cotton"', '$.tags');
SELECT name FROM products WHERE JSON_EXTRACT(attributes, '$.specs.ram_gb') = 16;

-- 5. Update a single path without replacing the whole document
UPDATE products SET attributes = JSON_SET(attributes, '$.color', 'blue') WHERE id = 1;
UPDATE products SET attributes = JSON_REMOVE(attributes, '$.discount_pct') WHERE id = 3;
UPDATE products SET attributes = JSON_ARRAY_APPEND(attributes, '$.tags', 'new-arrival') WHERE id = 1;

-- 6. Make it fast — generated column + index on extracted value
ALTER TABLE products
  ADD COLUMN color VARCHAR(50) GENERATED ALWAYS AS (attributes ->> '$.color') VIRTUAL,
  ADD INDEX idx_products_color (color);

-- Now this uses the index instead of scanning every row
EXPLAIN SELECT * FROM products WHERE color = 'red';
EXPLAIN SELECT * FROM products WHERE attributes ->> '$.color' = 'red';

-- For numeric fields, use the right type
ALTER TABLE products
  ADD COLUMN warranty INT GENERATED ALWAYS AS (attributes ->> '$.warranty_months') VIRTUAL,
  ADD INDEX idx_warranty (warranty);

-- 7. JSON_TABLE — expand an array into rows you can JOIN
SELECT p.name, jt.item_id
FROM products p,
JSON_TABLE(p.attributes, '$.bundle_items[*]' COLUMNS (item_id INT PATH '$')) AS jt
WHERE p.id = 3;
-- Bundle | 101
-- Bundle | 102
-- Bundle | 103

-- You can JOIN that derived table to a real table
-- SELECT p.name, i.title FROM products p
-- JOIN JSON_TABLE(p.attributes, '$.bundle_items[*]' COLUMNS (item_id INT PATH '$')) AS jt
-- JOIN items i ON i.id = jt.item_id
-- WHERE p.id = 3;

-- 8. What the TEXT approach would have looked like (and why it hurts)
-- CREATE TABLE products_text (attributes TEXT);
-- SELECT * FROM products_text WHERE attributes LIKE '%"color": "red"%';
-- No validation, no index, false positives, full scan every time
```

In Node.js, keep using parameterized queries — never interpolate JSON strings:

```js
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({ host: 'localhost', user: 'app', database: 'shop' });

// Insert — send a real object as a JSON string via a placeholder
const attrs = { color: 'red', size: 'XL', tags: ['cotton'] };
await conn.execute(
  'INSERT INTO products (name, attributes) VALUES (?, ?)',
  ['T-Shirt', JSON.stringify(attrs)]
);

// Query by JSON path — still parameterized
const [rows] = await conn.execute(
  "SELECT * FROM products WHERE attributes ->> '$.color' = ?",
  ['red']
);

// Update one field inside JSON without fetching the whole document
await conn.execute(
  "UPDATE products SET attributes = JSON_SET(attributes, '$.color', ?) WHERE id = ?",
  ['blue', 1]
);
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you store JSON in MySQL?**

Use the native `JSON` column type. You define it like `attributes JSON` in `CREATE TABLE`, and you insert valid JSON text or use `JSON_OBJECT` / `JSON_ARRAY`. MySQL validates on write — invalid JSON is rejected — and stores it in an efficient binary format (significantly improved since 8.0.13 for partial updates and path reads). You then query with `->`, `->>`, `JSON_EXTRACT`, `JSON_SET`, and similar functions. If the data were stored in TEXT, you would get no validation and no server-side JSON querying. The tradeoff is that JSON columns are flexible but have no strict schema per key — you still need application-level validation for required fields.

**Q: What is the difference between TEXT and JSON columns?**

TEXT stores the value as a plain string. MySQL never checks if it is valid JSON, stores it exactly as you sent it, and has no idea what is inside. Any "query" inside the JSON has to be a string hack like `LIKE '%"color": "red"%'` or pulling everything into the app and parsing.

JSON stores the value as validated, binary-encoded JSON. It rejects invalid JSON on INSERT/UPDATE, lets you use path operators like `->>` and functions like `JSON_CONTAINS` directly in SQL, and allows indexing through generated columns. Choose TEXT only if you truly never need to query inside the JSON and just store and return the blob. If you need to filter, sort, or update inside the document, use JSON.

**Q: How does MySQL store JSON internally? Is it just text?**

No. Since 5.7.8 it is binary, and since 8.0.13 the binary format is much more efficient. MySQL parses the JSON text you send, validates it, and converts it to an internal binary representation that allows quick path navigation without reparsing the whole document. Reads of a single path like `attributes ->> '$.color'` are fast because MySQL can jump to that key in the binary structure. Partial updates with `JSON_SET` on a large document are also more efficient in 8.0.13+ because MySQL can avoid rewriting the entire binary when only a small part changed. You still write and read normal JSON text — the binary part is invisible to the app.

**Q: How do you query and filter data inside a JSON column?**

Use the path operators. `col -> '$.a.b'` extracts a JSON value (strings stay quoted), `col ->> '$.a.b'` unwraps it to a plain SQL value. For a products table with `attributes JSON`:

```sql
SELECT * FROM products WHERE attributes ->> '$.color' = 'red';
SELECT * FROM products WHERE attributes ->> '$.specs.ram_gb' = 16;
SELECT * FROM products WHERE JSON_CONTAINS(attributes, '"cotton"', '$.tags');
```

You can also use `JSON_EXTRACT`, `JSON_CONTAINS`, `JSON_SEARCH`, and `JSON_OVERLAPS` depending on what you need. The key point for interviews: `->>` removes quotes so you can compare to normal strings and numbers, while `->` keeps JSON typing and is useful when you want to keep the JSON structure.

**Q: How do you index JSON data? Can you just put an index on the JSON column?**

You cannot create a useful index directly on the full JSON document for arbitrary path queries. An index on `attributes` alone will not help `WHERE attributes ->> '$.color' = 'red'`.

Instead you create a generated virtual column that extracts the path and index that column:

```sql
ALTER TABLE products
  ADD COLUMN color VARCHAR(50) GENERATED ALWAYS AS (attributes ->> '$.color') VIRTUAL,
  ADD INDEX idx_color (color);
```

MySQL can then use `idx_color` for `WHERE color = 'red'` and, with the optimizer, often for `WHERE attributes ->> '$.color' = 'red'` too because it recognizes they are the same expression. Use `VIRTUAL` to save space (computed on read) or `STORED` to save CPU on heavy filtering (computed on write). If you skip this step, every filter on a JSON path is a full table scan — fast with 100 rows, painful with 2 million.

**Q: What is JSON_TABLE and when would you use it?**

`JSON_TABLE` turns a JSON array into a relational result set you can query like a table. It was added in MySQL 8.0. If a row has `{"bundle_items": [101, 102, 103]}`, you can expand it:

```sql
SELECT jt.item_id FROM products,
JSON_TABLE(products.attributes, '$.bundle_items[*]' COLUMNS (item_id INT PATH '$')) AS jt;
```

Use it when you need to JOIN array elements to another table, filter them with `WHERE`, or aggregate them — things that are awkward when the array is trapped inside one JSON cell. Without `JSON_TABLE`, you would fetch the JSON to the app and loop. With it, the work stays in SQL and can use indexes on the JOINed table.

**Q: When should you use JSON vs a normalized table?**

Use JSON for semi-structured, sparse, or per-row-varying data that you read mostly as a whole — product attributes, user preferences like `{"theme": "dark", "notifications": {"email": true}}`, configuration blobs, or preserved webhook payloads. It avoids constant `ALTER TABLE` and many NULLs.

Use normalized tables when the data has relationships, needs `JOIN`s, foreign keys, or frequent independent queries. If you are constantly extracting the same five JSON paths, indexing each one, and JOINing on them, that is a signal those fields want to be real columns or a separate table like `product_attributes` or `order_items`. A simple test: if you need `FOREIGN KEY`, `UNIQUE`, or `JOIN` on the data, normalize it. If you just need "store this flexible bag and sometimes peek at one key," JSON is fine.

**Q: Can you enforce a schema on JSON? Does MySQL validate keys or types?**

MySQL validates that the document is syntactically valid JSON, but it does not enforce which keys exist or what types they have. `{"color": 123}` and `{"color": "red"}` both pass. If you need required keys or type checks, you have three options: validate in the app before insert, add a `CHECK` constraint with `JSON_SCHEMA_VALID` patterns in MySQL 8.0.17+, or use generated columns with type constraints. For example:

```sql
ALTER TABLE products
  ADD CONSTRAINT chk_color_is_string
  CHECK (JSON_TYPE(attributes -> '$.color') IN ('STRING', 'NULL'));
```

That keeps the flexibility but catches the worst mistakes at the database level.

## 6. The Traps — What Goes Wrong in Production

**No index on extracted paths means full scans at scale.** The most common mistake is writing `WHERE attributes ->> '$.color' = 'red'` with no generated column index and assuming it is fast because "it uses the JSON type." It is not. Every query reads and extracts from every row. It feels fine with 500 rows in development and collapses with 2 million in production. Fix it by adding a virtual generated column and indexing it, or by moving that frequently-filtered field to a real column.

**Storing relational data in JSON because it feels flexible.** Teams put `order_items`, `user_ids`, or anything that should be JOINed into a JSON array to avoid a join table. Then they need "all orders containing product 101" — that is a scan with `JSON_CONTAINS` or `JSON_TABLE` on every row, no foreign key to prevent orphaned IDs, and no way to enforce uniqueness. If you JOIN it, need constraints on it, or query it independently, it belongs in a normalized table. JSON is for the flexible edges, not the relational core.

**Replacing the whole document to change one field.** Doing `SELECT attributes`, modifying in Node, then `UPDATE products SET attributes = ?` with the full string causes race conditions — two concurrent updates can overwrite each other. Use `JSON_SET`, `JSON_REPLACE`, or `JSON_REMOVE` to update a single path atomically in the database. And for very large documents, full replacements rewrite more bytes even with 8.0.13+ optimizations.

**Assuming JSON is schemaless means no validation needed.** MySQL only checks syntax, not semantics. Without app validation or a `CHECK` constraint, you get `{"price": "cheap"}`, `{"price": 0}`, `{"Price": 19.99}` — same key, different types and casing — and every consumer has to handle all variants. Define the expected shape in your API layer and add `CHECK (JSON_TYPE(...))` or `JSON_SCHEMA_VALID` for critical fields.

**Updating huge JSON documents frequently.** A JSON column with a 100 KB payload that gets updated 50 times per second becomes a bottleneck — every update may rewrite the document and contend on the row. If one nested field is hot and updated often, pull it out to a real column. Keep the stable, sparse data in JSON.

**Collation and type surprises.** `->>` returns a string, so `WHERE attributes ->> '$.count' = 10` does a string comparison unless you cast. Use `CAST(attributes ->> '$.count' AS UNSIGNED)` or a generated `INT` column. Also, `JSON_TYPE` and strict equality matter — `JSON_EXTRACT` returns JSON `true` not MySQL `1`.

**Using JSON to avoid thinking about schema evolution.** Adding keys freely without a plan leads to "which keys actually exist?" sprawl. Keep a lightweight JSON schema document in your repo, version the shape when consumers depend on it, and consider `JSON_TABLE` or generated columns as explicit evidence of which paths your system actually relies on.

## 7. Compare With Related Concepts

**JSON column vs TEXT column:** TEXT is a dumb string bucket — no validation, no path operators, no indexing of contents. JSON is a validated, binary-stored document with path query support and indexability via generated columns. Choose JSON if you ever need to query or update inside the document. Choose TEXT only if you truly treat the value as an opaque blob you never filter on — like storing a raw webhook body you just return as-is. If you find yourself doing `LIKE` on TEXT that holds JSON, switch to JSON.

**JSON column vs normalized tables / columns:** Normalized tables give you strong guarantees — foreign keys, unique constraints, efficient JOINs, and one index per real column without extra machinery. JSON gives you schema flexibility — sparse or varying fields without migrations and without many NULLs. The tradeoff is that normalized data is faster and safer for frequent filters and relationships, while JSON requires generated columns to be indexed and cannot enforce relational integrity. Rule of thumb: if you filter or JOIN on it often, make it a column or a table. If it is sparse, varies per row, and is read mostly together, JSON is the right fit.

**JSON column vs EAV (Entity-Attribute-Value) pattern:** EAV stores flexible attributes as rows in a table like `product_attributes(product_id, key, value)` instead of as JSON. EAV lets you index `key` and `value` naturally and query with standard SQL, but every attribute access becomes a JOIN or pivot, and queries get verbose fast. JSON keeps related attributes together in one read, needs fewer JOINs, and is simpler for the app to produce and consume. Pick EAV when you need to query across attributes uniformly or enforce per-attribute constraints heavily. Pick JSON when you want the whole attribute bag together and only occasionally peek at specific keys.

**MySQL JSON vs PostgreSQL JSONB:** Both offer binary JSON storage and path querying, but the names differ: MySQL has one `JSON` type (binary since day one, more efficient since 8.0.13), PostgreSQL has `JSON` (text) and `JSONB` (binary, indexable via GIN). PostgreSQL's GIN index can index many paths at once, while MySQL indexes specific extracted paths via generated columns. The mental model is the same — raw text is cheap but useless for querying, binary plus indexes is what makes JSON fast — the indexing mechanism is just dialect-specific.

## 8. 🧠 The Memory Hook

TEXT is a note the database never reads. JSON is a pouch the database validates, packs in binary, and can peek inside. If you filter on what is inside, pull a tab out — a generated column — and index the tab. Flexible bag for sparse edges, real tables for relationships.
