# What Are MySQL JSON Functions

## 1. The Real-World Problem — When You Actually Hit This

Your app has been live for six months. You have an `orders` table and you needed to store flexible stuff — discount codes, gift messages, shipping preferences — without migrating the schema every sprint. So someone created a `metadata` column as `TEXT` and dumped JSON strings into it. It worked great in dev with 200 rows.

Now you have 800,000 orders. Product wants a report: "all orders where gift wrap is true and shipping priority is express." Your query does `SELECT *` and filters in Node.js because you cannot query inside that TEXT column. The API times out. You try `WHERE metadata LIKE '%"gift_wrap": true%'` and it matches the wrong rows, breaks on spacing, and misses the rows where the JSON key order is different. Someone inserted `'{not json'` into the TEXT column and nothing complained until your `JSON.parse()` crashed in production at 2am.

This is the exact moment MySQL JSON functions matter. You needed a column that validates JSON on write, lets you reach inside the JSON with SQL, and lets you index the fields you actually filter on — without pulling everything into the app.

## 2. The Analogy — Make the Mechanic Obvious

Think of a MySQL `JSON` column like a bank vault where each row has one locker. Inside each locker are labeled boxes stacked inside other boxes.

A value like `{"user": {"theme": "dark", "email": true}, "tags": ["vip", "beta"]}` is a locker that contains a box labeled `user`, inside that are boxes labeled `theme` and `email`, and another box labeled `tags` that holds a list.

The JSON functions are the tools the bank gives you:

- `JSON_EXTRACT` with path `$.user.theme` and its shorthand `->` is like asking the clerk to photocopy whatever is in that nested compartment and hand you the copy still inside a clear plastic sleeve. You get `"dark"` with quotes — it is still wrapped as JSON.
- `JSON_UNQUOTE` and its shorthand `->>` is the clerk opening the sleeve and handing you the plain item: `dark` with no quotes. Same compartment, but unwrapped.
- `JSON_SET`, `JSON_INSERT`, `JSON_REPLACE`, `JSON_REMOVE` are the clerk opening the locker and swapping, adding only if empty, replacing only if something is already there, or removing a compartment.
- `JSON_CONTAINS` is asking "does this locker contain this exact item somewhere inside?" without dumping every box on the floor.
- A generated column with an index is like sticking a labeled sticker on the outside of the locker that mirrors what is inside `$.user.theme`. Now you can find the right locker by scanning stickers instead of opening every locker.

If you remember lockers, boxes, photocopies in sleeves, and stickers on the outside, you already understand how MySQL handles JSON.

## 3. The Full Explanation — How It Actually Works

In plain words: MySQL has a native `JSON` type that stores real JSON, not just a text blob that happens to look like JSON. When you insert into a `JSON` column, MySQL validates it, normalizes it, and stores it in a binary format that is fast to search. If you try to insert broken JSON, the statement fails. That alone saves you from the 2am `JSON.parse` crash you got with `TEXT`.

Once the data is in there, you need a way to point inside it. MySQL uses a path language that starts with `$` meaning the root. `$.shipping.priority` means root -> `shipping` -> `priority`. `$.tags[0]` means the first item of the `tags` array. `$.user.*` wildcards exist but you rarely need them in interview queries.

On top of that path language sit the functions you actually use.

`JSON_EXTRACT(column, '$.path')` reaches in and returns the value as JSON. The shorthand is `column -> '$.path'`. They are the same thing. The critical detail is the return type is still JSON. If the value is a string, you get `"dark"` with quotes. If it is a number or boolean, you get `42` or `true` without quotes, but it is still typed as JSON internally. That distinction trips almost everyone.

`JSON_UNQUOTE(JSON_EXTRACT(...))` unwraps that JSON value into a plain SQL string. The shorthand for that whole combo is `column ->> '$.path'`. So `->` gives you photocopy in sleeve, `->>` gives you unwrapped text. When you compare in a `WHERE` clause like `WHERE metadata->>'$.shipping.priority' = 'express'`, you usually want `->>` because you are comparing to a normal string.

`JSON_SET(column, '$.path', value)` is an upsert inside the JSON. If the path exists it overwrites, if it does not exist it creates it. `JSON_INSERT` only creates and never overwrites — if the path already exists it does nothing. `JSON_REPLACE` is the opposite: it only overwrites and never creates. `JSON_REMOVE(column, '$.path')` deletes the key or array element at that path. These four cover every mutation and the interview will test whether you know the insert vs replace vs set difference without guessing.

For searching, `JSON_CONTAINS(column, '"vip"', '$.tags')` asks whether the value at that path contains the given JSON value. The second argument must be valid JSON itself — so you pass `'"vip"'` with extra quotes for a string, or `'1'` for a number, or `'{"theme":"dark"}'` for an object match. There is also `JSON_CONTAINS_PATH(column, 'one', '$.user.theme')` which only checks whether the path exists at all, not what value it holds, and `JSON_SEARCH` which does a text-like search for a string inside the JSON.

Aggregation has two JSON builders. `JSON_ARRAYAGG(column)` turns many rows into one JSON array. `JSON_OBJECTAGG(key_expr, value_expr)` turns many rows into one JSON object. They are the inverse of extracting — instead of pulling apart JSON, you are building JSON from relational rows, often in reports or API responses so the app does not have to loop.

The CAST quirk is where MySQL gets annoying. Because `->` returns JSON, comparing `metadata->'$.priority' = 'express'` often fails silently — you are comparing a JSON string `"express"` to a SQL string `express` and they are not equal. You need `metadata->>'$.priority' = 'express'` or `CAST(metadata->'$.priority' AS CHAR)` or `JSON_UNQUOTE(metadata->'$.priority')`. Similarly, `JSON_EXTRACT` returning numbers can compare oddly. A value extracted as JSON `1` compared to SQL integer `1` may behave differently depending on context, so explicitly cast when the types feel fuzzy: `CAST(metadata->'$.count' AS UNSIGNED)`.

Indexing is the part that separates people who have used JSON in production from people who have only read about it. You cannot efficiently index inside a raw `JSON` column directly with a normal B-tree index in older MySQL. The pattern that actually works is a generated column. You create a virtual or stored column that mirrors the JSON path, then you index that column:

`promo_code VARCHAR(50) GENERATED ALWAYS AS (metadata->>'$.promoCode') VIRTUAL`

MySQL keeps that column in sync automatically. Now `WHERE promo_code = 'SAVE20'` uses a normal index. Use `VIRTUAL` when you want to save disk and the value is cheap to compute on read — it is not stored, it is computed when you read. Use `STORED` when the expression is expensive or you want the value physically on disk. MySQL 8.0.17+ also added multi-valued indexes that can index array elements directly, but the generated column pattern is still the one interviewers expect you to know.

When should you use JSON at all? Use it for sparse, flexible, or schemaless attributes that you rarely filter or sort on — user preferences, plugin config, audit metadata, product specs that vary by category. Do not use it for fields you filter, join, or aggregate heavily, for money, for anything that needs foreign keys, or for data that would clearly be another table. Every query that reaches inside JSON is harder to optimize, harder to validate with constraints, and harder for the next developer to discover. If you find yourself creating five generated columns on the same JSON document, that JSON probably wanted to be real columns or a child table.

Security and correctness details that matter: JSON columns reject non-UTF8 and malformed JSON on write, which is a feature. Always validate at the app layer too — do not trust the client to send well-formed JSON. Wrap mutations in transactions if you are reading and writing the same document, because `JSON_SET` is not magically immune to lost updates if two requests read-modify-write the same row. And log the full JSON path on errors — `column 'metadata' at path $.user.theme` tells the next on-call what broke, while `invalid JSON` tells them nothing.

## 4. See It In Practice — Real Code or Queries

These are real MySQL 8.0 queries. Paste them into a MySQL shell and they run.

```sql
-- Create a table with a real JSON column, not TEXT
CREATE TABLE orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Index the field you actually filter on via a generated column
  promo_code VARCHAR(50)
    GENERATED ALWAYS AS (metadata ->> '$.promoCode') VIRTUAL,
  INDEX idx_promo_code (promo_code)
);

-- Inserts are validated. The second one would fail if JSON were malformed.
INSERT INTO orders (user_id, total, metadata) VALUES
(101, 59.90, '{"giftWrap": true, "shipping": {"priority": "express", "notes": null}, "promoCode": "SAVE20", "tags": ["vip", "beta"]}'),
(102, 12.00, '{"giftWrap": false, "shipping": {"priority": "standard"}, "tags": ["new"]}'),
(103, 120.00, '{"giftWrap": true, "shipping": {"priority": "express"}, "promoCode": "SAVE20", "tags": ["vip"]}');

-- JSON_EXTRACT (->) returns JSON, still quoted for strings
SELECT
  metadata -> '$.shipping.priority'      AS with_arrow,        -- "express" (JSON, with quotes)
  JSON_EXTRACT(metadata, '$.shipping.priority') AS same_thing  -- "express"
FROM orders WHERE id = 1;

-- JSON_UNQUOTE (->>) returns plain text, no quotes
SELECT
  metadata ->> '$.shipping.priority'                  AS unwrapped,  -- express
  JSON_UNQUOTE(metadata -> '$.shipping.priority')     AS same       -- express
FROM orders WHERE id = 1;

-- So filtering almost always wants ->> not ->
-- This uses the index on the generated column under the hood
SELECT id, total FROM orders WHERE promo_code = 'SAVE20';

-- Without the generated column, you would write it like this (no index, full scan):
SELECT id FROM orders WHERE metadata ->> '$.shipping.priority' = 'express';

-- Mutations: SET is upsert, INSERT only creates, REPLACE only overwrites, REMOVE deletes
-- Add or overwrite gift message
UPDATE orders
SET metadata = JSON_SET(metadata, '$.giftMessage', 'Happy Birthday!')
WHERE id = 1;

-- Try to insert promoCode, but it already exists so nothing changes
UPDATE orders
SET metadata = JSON_INSERT(metadata, '$.promoCode', 'SHOULD_NOT_APPEAR')
WHERE id = 1;

-- Replace only if it exists. This changes SAVE20 to SAVE30, but would do nothing on row 2
UPDATE orders
SET metadata = JSON_REPLACE(metadata, '$.promoCode', 'SAVE30')
WHERE id = 3;

-- Remove a key entirely
UPDATE orders
SET metadata = JSON_REMOVE(metadata, '$.shipping.notes')
WHERE id = 1;

-- Search: does the tags array contain "vip"?
SELECT id FROM orders
WHERE JSON_CONTAINS(metadata, '"vip"', '$.tags');

-- Does the path even exist? Useful for sparse JSON where some rows lack the key
SELECT id FROM orders
WHERE JSON_CONTAINS_PATH(metadata, 'one', '$.promoCode') = 1;

-- CAST quirk: extracted JSON string compared wrong without unquoting
-- This returns 0 rows because '"express"' != 'express'
SELECT id FROM orders WHERE metadata -> '$.shipping.priority' = 'express';

-- These both work correctly
SELECT id FROM orders WHERE metadata ->> '$.shipping.priority' = 'express';
SELECT id FROM orders WHERE CAST(metadata -> '$.shipping.priority' AS CHAR) = '"express"';
-- Better to just use ->> and compare to plain text

-- Numbers: cast explicitly when you do math or range filters
SELECT id FROM orders
WHERE CAST(metadata -> '$.totalItems' AS UNSIGNED) > 5;

-- Aggregation: build JSON from relational rows (great for API responses)
SELECT JSON_ARRAYAGG(id) FROM orders WHERE promo_code = 'SAVE20';
-- Returns [1, 3]

SELECT JSON_OBJECTAGG(id, metadata ->> '$.shipping.priority') AS id_to_priority
FROM orders;
-- Returns {"1": "express", "2": "standard", "3": "express"}

-- Creating the generated column after the table exists
ALTER TABLE orders
  ADD COLUMN shipping_priority VARCHAR(20)
    GENERATED ALWAYS AS (metadata ->> '$.shipping.priority') VIRTUAL,
  ADD INDEX idx_shipping_priority (shipping_priority);
```

MySQL also supports `JSON_SEARCH(metadata, 'one', 'vip') IS NOT NULL` as a text search inside JSON, but prefer `JSON_CONTAINS` for exact matches — `JSON_SEARCH` is slower and does LIKE-style `%vip%` matching which is rarely what you want in production.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is the MySQL JSON type and how is it different from TEXT that holds JSON?**

A `JSON` column validates on every write and stores the value in an optimized binary format. If you insert `'not json'` it throws an error instead of silently corrupting your data. A `TEXT` column accepts anything and leaves validation to the app, so broken strings pile up until something crashes on read. The binary format also makes extraction and path lookups faster than parsing text every time. Use `JSON` when the data is actually JSON — you get validation, faster access, and all the JSON functions work naturally. Use `TEXT` only if you truly never need to query inside it and you are storing an opaque blob the database should not understand.

**Q: What is the difference between `->` and `->>`?**

`->` is shorthand for `JSON_EXTRACT`. It returns a JSON value, which means strings come back with quotes: `"express"`. `->>` is shorthand for `JSON_UNQUOTE(JSON_EXTRACT(...))`. It returns a plain SQL string with the quotes stripped: `express`. In a `WHERE` clause you almost always want `->>` because you are comparing to a normal string literal. If you use `->` and compare to `'express'` you will get zero rows and no error — the values look the same when you glance at them but they are different types. Memorize it as arrow without extra line keeps the sleeve on, double arrow unwraps it.

**Q: Why does `JSON_EXTRACT` return a quoted string and why does that matter?**

Because its return type is JSON, not VARCHAR. A JSON string is defined as characters wrapped in double quotes. So extracting `"dark"` from `{"theme":"dark"}` correctly returns `"dark"` as JSON. It matters because `WHERE metadata -> '$.theme' = 'dark'` silently fails — you are comparing JSON `"dark"` to SQL `dark`. The fix is `WHERE metadata ->> '$.theme' = 'dark'` or `WHERE JSON_UNQUOTE(metadata -> '$.theme') = 'dark'`. This is the number one MySQL JSON bug in take-home assignments. If you see `->` in a `WHERE` with a string literal, that is almost certainly a bug.

**Q: What is the difference between `JSON_SET`, `JSON_INSERT`, `JSON_REPLACE`, and `JSON_REMOVE`?**

`JSON_SET` is upsert — if the path exists it overwrites, if it does not exist it creates. `JSON_INSERT` only creates — if the path already exists it leaves it alone. `JSON_REPLACE` only overwrites — if the path does not exist it does nothing. `JSON_REMOVE` deletes whatever is at the path. The interview check is whether you know that `JSON_INSERT` will not clobber existing data and `JSON_REPLACE` will not accidentally add a new key. If you just say "they all update JSON" you sound like you have never used them. If you say "SET is the safe default, INSERT is create-if-absent like an idempotency guard, REPLACE is update-if-present like a patch that should not create" you sound like you have.

**Q: How do you index a field inside a JSON column?**

You do not index the JSON path directly with a normal B-tree on the JSON column. You create a generated column that mirrors the path and index that column. For example `promo_code VARCHAR(50) GENERATED ALWAYS AS (metadata->>'$.promoCode') VIRTUAL` plus `INDEX idx_promo_code (promo_code)`. MySQL keeps it in sync automatically and your `WHERE promo_code = ?` query uses a normal index. Choose `VIRTUAL` when the expression is cheap and you want to save disk, `STORED` when it is expensive or you want to index a larger expression. MySQL 8.0.17+ also supports multi-valued indexes on JSON arrays with `INDEX idx ((CAST(col->'$.tags' AS CHAR(20) ARRAY)))` but interviewers still want the generated column answer first.

**Q: What does `JSON_CONTAINS` do and what is the gotcha with its value argument?**

`JSON_CONTAINS(column, value, path)` returns 1 if the JSON at that path contains the given value. The gotcha is that `value` must be valid JSON, not a raw SQL string. To search for the string `vip` you must pass `'"vip"'` — a JSON string with quotes inside a SQL string. To search for the number `42` you pass `'42'`. To search for an object you pass `'{"theme":"dark"}'`. If you write `JSON_CONTAINS(metadata, 'vip', '$.tags')` without the inner quotes, it is not valid JSON for a string search and it will not match. Also `JSON_CONTAINS` does exact containment, not substring. It will not match `"vip-user"` when you search for `"vip"`.

**Q: When should you NOT use MySQL JSON columns?**

Do not use JSON for data you need to join on, filter heavily, sort on, aggregate with `SUM`/`AVG`, enforce with foreign keys, or validate with `CHECK` constraints. Do not use it for money, for audit trails that need strict schema, or as an excuse to avoid designing real tables. Every field you put inside JSON is a field you cannot index without extra work, cannot constrain without extra work, and cannot make obvious to the next developer reading the schema. The rule is: if you query it, join it, or constrain it, it deserves a real column. If it is truly flexible, sparse, or schemaless and you rarely filter on it, JSON is perfect.

**Q: What are the CAST quirks with JSON functions?**

Two quirks. First, `JSON_EXTRACT` keeps numeric values as JSON numbers, so `WHERE metadata->'$.count' > 5` can behave surprisingly because you are comparing JSON to integer — always cast: `WHERE CAST(metadata->'$.count' AS UNSIGNED) > 5` or better `WHERE CAST(metadata->>'$.count' AS UNSIGNED) > 5`. Second, comparing an extracted string without unquoting compares `"express"` to `express` and returns no rows without an error, so you must use `->>` or `CAST(... AS CHAR)` or `JSON_UNQUOTE`. As a habit, extract with `->>` when you want text or numbers as text for comparison, and only use `->` when you want to keep the result as JSON to pass to another JSON function.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Comparing `->` to a string literal and getting zero rows with no error.** You write `WHERE metadata->'$.status' = 'paid'` and it returns nothing even though you can see `paid` rows. The extracted value is `"paid"` with quotes, the literal is `paid` without, and MySQL does not warn you. The fix is `WHERE metadata->>'$.status' = 'paid'`. In an interview, if you see `->` in a WHERE without `JSON_UNQUOTE` or `CAST`, call it out immediately — that is often the intended bug.

**Trap 2: Forgetting that `JSON_INSERT` does not overwrite and `JSON_REPLACE` does not create.** A developer uses `JSON_INSERT` to update a user's theme and nothing changes because the path already exists. Or they use `JSON_REPLACE` to add a new feature flag and it silently does nothing because the flag did not exist yet. Always ask "should this create, should this overwrite, or both?" If both, use `JSON_SET`. If you want create-only semantics to prevent clobbering, use `JSON_INSERT` intentionally.

**Trap 3: Storing everything as JSON and losing the ability to index and constrain.** The team puts `user_id`, `amount`, and `status` inside a JSON `data` column because it feels flexible. Now every query is `WHERE data->>'$.status' = ?` with a full table scan, foreign keys are impossible, and `CHECK` constraints cannot guard `amount`. The fix is to promote heavily queried fields to real columns and keep only the truly flexible leftovers in JSON. If you see more than two generated columns mirroring the same JSON document, that JSON wanted to be a table.

**Trap 4: Treating JSON null as SQL NULL.** In MySQL, `JSON null` is a real value inside the document, while SQL `NULL` means the column has no value at all. `JSON_EXTRACT('{"a": null}', '$.a')` returns JSON `null`, not SQL `NULL`. `WHERE metadata->'$.notes' IS NULL` will not match a row where notes is JSON `null`, because the extraction succeeded and returned a value. You need `WHERE JSON_TYPE(metadata->'$.notes') = 'NULL'` or `WHERE metadata->'$.notes' = CAST('null' AS JSON)` to test for JSON null specifically. This confuses almost everyone the first time.

**Trap 5: Forgetting to handle missing paths that return SQL NULL silently.** If the path does not exist, `JSON_EXTRACT` returns SQL `NULL`, not an error. So `WHERE metadata->>'$.nonExistent' = 'something'` simply never matches, and an `UPDATE` with `JSON_SET` on a missing intermediate object may create unexpected nested structures. Always guard with `JSON_CONTAINS_PATH(metadata, 'one', '$.field')` when missing vs present matters, especially for sparse documents where older rows lack new keys.

**Trap 6: Choosing VIRTUAL vs STORED without thinking.** VIRTUAL generated columns cost nothing on write but compute on every read, STORED costs disk and write time but reads fast. If you index a VIRTUAL column MySQL still builds an index structure, but the value is recomputed. For a simple `->> '$.code'` it barely matters. For a complex path with nested arrays it can matter. Interviewers like asking "when would you pick STORED?" — answer: when the expression is expensive, when you want the value materialized for backups or for a composite index that needs stable storage.

## 7. Compare With Related Concepts

**MySQL JSON vs TEXT holding JSON:** TEXT is a dumb bucket — any string goes in, no validation, every query must `LIKE` or parse in the app, and indexes are useless. JSON is a typed column — it validates on write, stores binary, and gives you `->`, `->>`, `JSON_CONTAINS`, and generated column indexes. Rule: if you ever query inside it, use JSON. If you truly never query inside and just store and return an opaque blob, TEXT is fine but you are still giving up validation.

**MySQL JSON vs PostgreSQL JSONB:** Both validate and store binary. Postgres JSONB has richer operators (`@>`, `?`, GIN indexes) and you can create a GIN index directly on the JSONB column to search many paths without generated columns. MySQL requires generated columns or multi-valued indexes for indexing. Postgres also distinguishes `JSON` (stores raw text) from `JSONB` (binary) while MySQL has only one `JSON` type which is always binary. Rule: expect the generated column question in MySQL and the GIN index question in Postgres — do not mix the answers.

**`->` vs `->>` vs `CAST(... AS CHAR)`:** `->` keeps JSON typing and quotes, good when the result feeds another JSON function. `->>` unwraps to plain text, good for WHERE comparisons and display. `CAST(x AS CHAR)` forces a string conversion but is verbose and easy to get wrong with the extra quotes. Rule: use `->` inside JSON-to-JSON pipelines, use `->>` when you want a normal value to compare or return to the app.

**`JSON_SET` vs `JSON_INSERT` vs `JSON_REPLACE`:** SET is upsert, INSERT is create-only, REPLACE is update-only. Rule: default to SET unless you have a reason to guard against overwriting or against creating. Use INSERT when you must not clobber existing data like an initial default, use REPLACE when you must not invent a key that was never there.

**Generated column index vs MySQL multi-valued index:** A generated column index creates a normal B-tree on one scalar value extracted from JSON, great for `WHERE promo_code = ?`. A multi-valued index (`INDEX idx ((CAST(col->'$.tags' AS CHAR(30) ARRAY)))`) indexes every element of a JSON array so `WHERE JSON_CONTAINS(tags, '"vip"')` or `WHERE MEMBER OF(tags)` can use an index without a generated column. Rule: use generated columns for known scalar fields, use multi-valued indexes when you need to index array membership in MySQL 8.0.17+.

**MySQL JSON vs normalized child table:** JSON keeps related flexible data close, one row fetch gets everything, migrations are free. A child table gives you real columns, foreign keys, constraints, and indexes on every field, but requires joins and migrations. Rule: if the data has a stable shape and you query it often, normalize it. If it is sparse, varied, and rarely filtered, JSON saves you complexity.

## 8. 🧠 The Memory Hook

MySQL JSON columns are lockers with labeled boxes inside. `->` hands you a photocopy still in the plastic sleeve with quotes, `->>` unwraps it to plain text. `SET` is upsert, `INSERT` only creates, `REPLACE` only overwrites. And if you filter on something inside the locker, stick a label on the outside — a generated column with an index — so you do not have to open every locker.
