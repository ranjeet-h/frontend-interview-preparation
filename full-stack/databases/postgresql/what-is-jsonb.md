# What is JSONB

## 1. The Real-World Problem — When You Actually Hit This

Your product table has been live for six months. Every product has different attributes — shoes have sizes, phones have storage, courses have lesson counts — so someone made a pragmatic early call: add a `TEXT` column called `attributes` and store `JSON.stringify(details)` in it.

It works. The API writes a string, reads a string, does `JSON.parse` in Node, and sends it to the frontend. No complaints in code review.

Then three things happen in the same week. A teammate ships a dashboard filter "show waterproof products" and writes `WHERE attributes LIKE '%waterproof\":true%'` — it matches a product whose *description* mentions waterproof, misses one where the JSON has a space before the colon, and takes four seconds because no index can help a `LIKE` over a blob. A second bug report comes in: one row has `{"price": 19.990, "price": 0}` because a supplier sent duplicate keys and your `TEXT` column accepted it without blinking — you charged someone 0. And a third failure is quiet: half the rows have `price` as a number, half as a string `"19.99"`, because nothing ever validated the shape, so sorting by price in the app gives different answers than sorting in SQL.

You realize the column you thought was "flexible" is actually just unchecked text with all the work pushed to every read and every application bug left to be discovered by customers. That exact moment — flexible attributes crammed into `TEXT` and now you need validation, real filtering, and sane performance — is why `jsonb` exists.

## 2. The Analogy — Make the Mechanic Obvious

Think of a busy restaurant that takes reservations on whatever paper customers hand over.

Storing JSON as `TEXT` is letting the host stuff every original paper slip into a drawer exactly as written. No one checks whether the slip is even readable. One says `party: 4`, another says `party: "four"`, a third says `party: 4, party: 2` with the same field written twice. Finding "all parties of 4" means dumping the whole drawer on the table and reading every slip character by character, every single time. There is no alphabetizing, no de-duplication, no spell-check, and nothing about the drawer helps you search it.

`jsonb` is hiring a host who processes every slip at the door. The host reads it once, rejects it if it is not valid JSON, throws away duplicates keeping only the last value, rewrites keys in a fixed sorted order, discards extra whitespace, and stores the result not as paper but as a set of labeled, typed cards in a catalog tree. The original handwriting is gone. What you get instead is that every future question — "does this reservation include a high chair?", "which reservations are for more than six?" — is answered by walking a tidy structure, not re-reading raw handwriting. The price is the work at the door and losing the exact original slip; the payoff is that everything after the door is fast, searchable, and trustworthy.

In that analogy: `TEXT` is the drawer of raw slips, `json` is the drawer plus a bouncer who checks legibility but still stores the slip as-is, and `jsonb` is the catalog of normalized cards. Keep it in mind — every detail below is just naming parts of that intake desk.

## 3. The Full Explanation — How It Actually Works

In plain words: `jsonb` is PostgreSQL's way of storing semi-structured data — JSON documents — as a parsed, typed tree instead of as text, so the database can validate it, navigate it quickly, and index it.

Here is what PostgreSQL actually does.

**It validates on write and rejects bad JSON.** Try to insert `'{name: Ada}'` or `'{ "a": 1, }'` into a `jsonb` column and the insert fails. A `TEXT` column would happily store either string. That single guarantee — every value in the column is at least syntactically valid JSON — eliminates a whole class of app-layer `JSON.parse` crashes and inconsistent rows.

**It parses once at write time into a decomposed binary format.** The "b" in `jsonb` literally means binary. Instead of keeping your characters, PostgreSQL breaks the document apart: keys and values separated, each tagged with its type (string, number, boolean, null, array, object), arranged as a tree you can walk without re-parsing. A `TEXT` or even `json` column keeps the characters and re-parses them on every read; `jsonb` pays the parse cost once.

**Parsing normalizes the document, and normalization changes presentation without changing meaning.** Object keys are sorted by length then byte-by-byte (not alphabetical), duplicate keys are collapsed with last value winning, whitespace between tokens is discarded, and numbers are canonicalized — `19.990` becomes `19.99` because the value is stored as a numeric, not as characters. Arrays are untouched: their element order is preserved and duplicates are kept, because array order carries meaning. None of this loses the facts, but the original formatting is unrecoverable — you stored the data, not the document.

**That normalized tree is why reads and indexes are fast.** Keys already sorted means finding `"status"` is a quick walk down the tree regardless of how many keys the document has. That same orderly representation is what indexes need. A GIN index on a `jsonb` column builds an inverted ledger of every key and value inside every document, turning "which rows contain this fragment?" into an index lookup — the mechanics are covered on [What is a GIN Index](what-is-gin-index.md). A B-tree expression index like `((payload->>'status'))` materializes one extracted field into a sortable index for equality and range scans. Neither is possible on raw `TEXT`, and `json` cannot be meaningfully indexed for content searches either.

**Updates rewrite the whole document.** There is no patching one key in place. Under MVCC, `UPDATE t SET data = jsonb_set(data, '{status}', '"shipped"')` creates a completely new row version holding a completely new copy of the entire document, and the old version sits as dead space until autovacuum reclaims it (see [What is VACUUM](what-is-vacuum.md)). If the document is large enough to be stored out-of-line via TOAST, the whole compressed value gets rewritten. Doing that many times per minute to a big document creates write amplification, table bloat, and vacuum pressure — which is the main operational cost of `jsonb`.

**When it is the right tool, and when it is the wrong one.** `jsonb` is right when structure varies per row, fields are sparse, or the shape comes from outside (webhook payloads, product attributes, user preferences, feature flags) and the data is mostly read. It is wrong when a field is hot — filtered, sorted, or joined in most queries, needs a `NOT NULL` or foreign key, or is updated constantly. Those fields deserve their own typed columns with real constraints and cheap in-place updates; keep `jsonb` for the genuinely variable tail.

Two boundary notes so this page does not repeat its siblings: the full byte-for-byte comparison of storage formats, parsing cost, and equality semantics lives on [JSON vs JSONB](json-vs-jsonb.md) — read that before debating `json` versus `jsonb`. The complete operator and JSONPath toolbox for actually querying the tree lives on [How Do You Query JSONB Fields](how-do-you-query-jsonb-fields.md) — this page stays on the storage contract and trade-offs that make those queries cheap or expensive.

## 4. See It In Practice — Real Code or Queries

All examples are PostgreSQL 12+.

Start with the table that fixes the `TEXT` problem from section 1:

```sql
CREATE TABLE products (
  id         bigserial PRIMARY KEY,
  name       text  NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Valid JSON is accepted
INSERT INTO products (name, attributes)
VALUES ('Trail Shoe', '{"brand":"Acme","price":129.99,"specs":{"waterproof":true}}');

-- Invalid JSON is rejected at the door — TEXT would have stored this
INSERT INTO products (name, attributes) VALUES ('Broken', '{name: Ada}');
-- ERROR: invalid input syntax for type json

-- Wrong types are still JSON-valid but semantically inconsistent;
-- keep shape validation in app code or CHECK constraints (see traps)
```

Watch normalization on the same literal — `TEXT` would keep all three exactly as written:

```sql
-- Duplicate keys: last value wins, no error raised
SELECT '{"price": 100, "price": 0}'::jsonb;
-- {"price": 0}

-- Key order rebuilt (shortest key first, then bytewise — not alphabetical)
SELECT '{"zip": 94107, "id": 5, "name": "Ada"}'::jsonb;
-- {"id": 5, "name": "Ada", "zip": 94107}

-- Whitespace and number formatting gone — value preserved, presentation not
SELECT '{"price":  19.990 }'::jsonb;
-- {"price": 19.99}

-- Arrays keep order and duplicates — only object keys are normalized
SELECT '["c","a","b","a"]'::jsonb;
-- ["c", "a", "b", "a"]
```

Why the `TEXT` + `LIKE` filter is both wrong and slow, and what replaces it:

```sql
-- TEXT approach: fragile and unindexed
-- Misses '{"waterproof" : true}' (space), matches description text, scans every row
SELECT * FROM products WHERE attributes::text LIKE '%waterproof":true%';

-- jsonb approach: structural match, indexable
SELECT * FROM products WHERE attributes @> '{"specs":{"waterproof":true}}';
```

Indexing — pick the shape that matches your predicate:

```sql
-- GIN ledger: serves containment and existence — @>  ?  ?|  ?&  @?
CREATE INDEX idx_products_attributes_gin ON products USING gin (attributes);

-- B-tree on one hot extracted field: serves equality, ranges, ORDER BY
CREATE INDEX idx_products_brand ON products ((attributes->>'brand'));
CREATE INDEX idx_products_price ON products (((attributes->>'price')::numeric));

SELECT * FROM products WHERE attributes @> '{"brand":"Acme"}';          -- GIN
SELECT * FROM products WHERE (attributes->>'price')::numeric > 100;     -- B-tree
```

Updating a single key rewrites the whole document — keep documents small and hot fields out of the blob:

```sql
-- Rewrites the entire jsonb value as a new row version (MVCC)
UPDATE products
SET attributes = jsonb_set(attributes, '{specs,waterproof}', 'false')
WHERE id = 1;

-- Hot mutable field promoted to a real column instead — cheap in-place update
ALTER TABLE products ADD COLUMN brand text
  GENERATED ALWAYS AS (attributes->>'brand') STORED;
CREATE INDEX idx_products_brand_col ON products (brand);
-- Now WHERE brand = 'Acme' is a normal indexed column lookup

-- Confirm which index fires — never guess about jsonb performance
EXPLAIN ANALYZE SELECT * FROM products WHERE attributes @> '{"specs":{"waterproof":true}}';
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is `jsonb` in PostgreSQL?**

It is a column type for storing JSON documents as a parsed binary tree rather than as text. PostgreSQL validates every value on insert so malformed JSON never gets stored, parses the document once into typed keys and values, normalizes it — sorting object keys, dropping duplicate keys with last-write-wins, stripping whitespace, canonicalizing numbers — and stores that structure. The result is that reads never re-parse, the rich JSON operators work natively, and the column can be indexed. Conceptually, `jsonb` trades the exact original formatting for fast, searchable, trustworthy semi-structured storage.

**Q: How does `jsonb` storage differ from storing JSON as `TEXT` or as `json`?**

`TEXT` stores whatever characters you hand it with no validation — invalid JSON, duplicate keys, inconsistent number-as-string — all accepted, and every filtering attempt is string matching (`LIKE`) with no index help and re-parsing in the application. `json` adds one thing: validation on write, but still stores the exact input text and re-parses it on every read, and it cannot be usefully indexed for content searches. `jsonb` validates and then replaces the text with a decomposed binary tree, so reads walk a structure, normalization gives a canonical form, and GIN and expression indexes become possible. The cost ladder is clear: `TEXT` is cheapest to write and most expensive to read correctly, `jsonb` pays at write to make every later read cheap.

**Q: Does `jsonb` validate? What happens with invalid JSON or duplicate keys?**

Invalid syntax is rejected with an error on insert or update — that is the first guarantee. Duplicate keys are not rejected; they are normalized silently. If the input has `{"price":100,"price":0}`, `jsonb` stores `{"price":0}` with no warning. `TEXT` would keep both occurrences as text, `json` would preserve both in the stored text but return the first on lookup — each gives a different answer for the same input. If key uniqueness matters to your contract, validate and deduplicate before the insert; do not rely on the storage type to raise an error.

**Q: What changes when JSON goes into `jsonb` — key order, whitespace, numbers?**

Object keys are re-sorted by length then bytewise, whitespace disappears, duplicate keys collapse to the last value, and numbers are canonicalized (`19.990` → `19.99`) because they are stored as exact numerics. Presentation is lost, semantics are preserved. Arrays are the exception: element order is fully preserved and duplicates are kept, because array position is meaningful — `["a","b","c"]` comes back in that order.

**Q: Why is `jsonb` faster to read but slower to write?**

Reads are faster because the document is already parsed — navigating to a key is a tree walk, not a text scan, and it is done once no matter how many operators touch the row. Writes are slower for two reasons: the one-time parse/sort/dedup to build the tree proportional to document size, and the bigger cost of MVCC — updating one key rewrites the entire document as a new row version, and any GIN index on the column must update ledger entries for every key and value in the document. On a table churning large documents many times per minute that second cost dominates, causing bloat and autovacuum pressure.

**Q: How do you index `jsonb`? When do you use GIN versus an expression B-tree?**

A GIN index on the whole column (`USING gin (attributes)`) indexes every key and value and serves containment and existence operators — `@>`, `?`, `?|`, `?&`, `@?`. It answers "which rows contain this structure or label?" without scanning rows. An expression B-tree like `((attributes->>'brand'))` materializes one extracted field as a normal sortable index and serves `->>` equality, ranges, and `ORDER BY` on that field — things GIN structurally cannot do. Heavy tables often carry both: GIN for open-ended payload search, B-trees on two or three hot fields. The choice between `jsonb_ops` (default, supports `?`) and `jsonb_path_ops` (smaller, faster, containment-only) depends on whether you need label-existence checks — the full trade-off is detailed on [What is a GIN Index](what-is-gin-index.md).

**Q: When should you use `jsonb`, and when should you use regular columns instead?**

Use `jsonb` when the shape varies per row or is sparse — different product categories with different specs, user preferences, integration payloads — and the data is read-mostly with occasional structural filters. Promote a key to a real typed column the moment it is filtered, sorted, or joined in most queries, needs constraints (`NOT NULL`, `UNIQUE`, foreign keys), or needs real type arithmetic (numeric ranges, timestamps). The migration is low risk with a generated column: `ADD COLUMN brand text GENERATED ALWAYS AS (attributes->>'brand') STORED` — it backfills, stays in sync, and takes its own B-tree index. Keep `jsonb` for the flexible tail, columns for the stable spine.

**Q: When is `jsonb` actively the wrong choice?**

When you need byte-exact preservation of the original document — signature verification over raw payloads, legal audit trails where duplicates and field order are evidence — `jsonb`'s normalization destroys what you need. When documents are huge and updated constantly, the whole-document rewrite tax makes `jsonb` punitive. When almost every query touches the same three fields with ranges and joins, those fields should be columns, not keys buried in a blob. And when you never query inside the structure and only store and retrieve it opaque, plain `TEXT` avoids all conversion and index cost.

## 6. The Traps — What Goes Wrong in Production

**Cramming JSON into `TEXT` and filtering with `LIKE`.** The wrong assumption is that `TEXT` is "good enough for JSON" because the app can parse it. Why it is wrong is that `TEXT` provides no validation — malformed rows accumulate — and string search is structural guessing: `LIKE '%"price": 100%'` misses `' "price" :100'` and matches a product description that happens to contain the substring. What happens is silent wrong results plus a sequential scan on every filter because no index can organize unstructured text by key. The fix is `jsonb` with structural predicates — `attributes @> '{"price":100}'` or `(attributes->>'price')::numeric = 100` — backed by the right index.

**Expecting `jsonb` to keep key order, whitespace, or raw number formatting.** The wrong assumption is that what you inserted is what you will dump. Why it is wrong is normalization — keys are re-sorted, whitespace dropped, `19.990` becomes `19.99`. What happens is snapshot tests fail after a `TEXT` → `jsonb` migration, export diffs light up, and someone concludes data was corrupted. The fix is to never assert on serialized `jsonb` text. Assert with structural equality (`a = b` on `jsonb` values) or field extraction, and regenerate fixtures in normalized form once.

**Expecting duplicate keys to error.** The wrong assumption is that `{"amount":100,"amount":0}` will be rejected. Why it is wrong is that JSON itself does not forbid duplicates and PostgreSQL accepts them silently — `jsonb` keeps the last, `json` keeps both in text but returns the first. What happens is a buggy upstream serializer that appends a corrected field instead of replacing it changes which value your database keeps, and after migrating between types the application silently reads a different number. The fix is input validation at the application boundary — reject or deduplicate before insert — and documenting last-write-wins semantics explicitly.

**Updating one key and paying for a full rewrite.** The wrong assumption is that `jsonb_set` patches a field in place. Why it is wrong is that `jsonb` is stored as one binary tree representing the whole document, and MVCC means any modification writes a whole new row version plus GIN maintenance for every key. What happens is a table holding 200 KB documents updated twenty times a minute generates gigabytes of churn, table bloat, and autovacuum warnings that look unrelated to the feature that caused them. The fix is architectural: keep documents small and move hot, frequently mutated fields into regular columns so updates touch narrow values.

**Adding `jsonb` without an index and calling it slow.** The wrong assumption is that changing the type alone makes filtering fast. Why it is wrong is that the storage format makes indexing *possible*; it does not create an index by itself. What happens is `WHERE attributes->>'brand' = 'Acme'` still scans every row because extraction predicates do not use GIN, or `WHERE attributes @> '...'` scans because no GIN exists, and the team concludes "jsonb is slow." The fix is to create the matching index — GIN for containment/existence, expression B-tree for extracted equality and ranges — and verify with `EXPLAIN ANALYZE` every time.

**Modeling everything as `jsonb` because it feels flexible.** The wrong assumption is that flexibility is always valuable. Why it is wrong is that fields living in `jsonb` cannot carry `NOT NULL`, `UNIQUE`, foreign keys, or meaningful planner statistics, and they lose cheap in-place updates and tight B-tree range scans. What happens is reports that should be a simple indexed `WHERE price > 100` become cast-heavy extraction predicates, joins on JSON keys cannot use foreign keys, and BI tools struggle with nested access. The fix is promotion — the moment a key becomes part of your query spine, give it a typed column (or a `GENERATED ALWAYS AS` column) and reserve `jsonb` for the sparse, varying remainder.

**Storing huge documents and joining the vacuum problem.** The wrong assumption is that a single `jsonb` column can hold an ever-growing log or nested history per row. Why it is wrong is TOAST stores large values out-of-line, and every update rewrites the whole out-of-line value, leaving large dead tuples. What happens is write latency grows, tables bloat, and autovacuum runs constantly trying to reclaim space — the failure appears weeks after launch. The fix is to split growing collections into child tables, keep `jsonb` documents reasonably bounded, and only GIN-index write-hot tables when read performance demands it.

## 7. Compare With Related Concepts

**`jsonb` vs `TEXT` holding JSON strings:** `TEXT` stores unchecked characters with string-matching searches, `jsonb` stores validated typed trees with structural operators and indexes. Rule: anything you intend to inspect structurally should be `jsonb`; `TEXT` is for opaque payloads you never query inside.

**`jsonb` vs `json`:** `json` preserves exact input text and re-parses on every read with no indexable canonical form, `jsonb` normalizes to a binary tree with fast reads and indexes but loses original formatting. Rule: default to `jsonb`; see [JSON vs JSONB](json-vs-jsonb.md) for the full side-by-side and reach for `json` only when byte-exact preservation is the requirement.

**`jsonb` vs regular typed columns:** typed columns give constraints, statistics, cheap updates, and optimal indexes per field, `jsonb` gives per-row flexibility. Rule: stable, hot, constrained fields get columns; sparse, varying, read-mostly shape gets `jsonb`.

**`jsonb` vs EAV (entity-attribute-value) tables:** EAV spreads attributes into rows with joins per attribute, `jsonb` keeps them as one document per row. Rule: many sparse attributes queried together favor `jsonb` with GIN; attributes needing individual constraints and cross-row aggregation per attribute often favor EAV or real columns despite the extra joins.

**GIN index vs B-tree expression index on `jsonb`:** GIN indexes every key/value for containment and existence across the whole document, expression B-trees accelerate equality, ranges, and ordering on one extracted field. Rule: open-ended payload search uses GIN, one known hot field uses a B-tree on its extraction expression — they coexist on busy tables.

**PostgreSQL `jsonb` vs MongoDB documents:** `jsonb` puts flexible documents inside a relational engine with transactions, joins, and SQL, MongoDB makes documents the primary model with native sharding and document-native queries. Rule: relational core with a flexible edge stays on `jsonb`; document-first domain expected to shard horizontally leans Mongo — decide on the trade-off explicitly, not by accident.

**This page vs [How Do You Query JSONB Fields](how-do-you-query-jsonb-fields.md):** this page explains the storage contract, validation, normalization, and indexing trade-offs; the sibling teaches the operator and JSONPath vocabulary for actually querying the tree.

## 8. 🧠 The Memory Hook

`TEXT` is a drawer of un-checked paper slips — every search dumps the drawer. `jsonb` is a host at the door who validates, normalizes to typed cards, and catalogs them so every later question is a lookup, not a scan. You pay at intake and lose the original handwriting — you gain trust, structure, and indexes. Default to `jsonb`; keep it small and read-mostly, promote hot fields to columns, and index the questions you actually ask.
