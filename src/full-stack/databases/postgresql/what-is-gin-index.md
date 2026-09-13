# What is GIN Index

## 1. The Real-World Problem — When You Actually Hit This

Your app stores user settings as `jsonb`. In development with 200 users, this is fast:

```sql
SELECT * FROM users WHERE data @> '{"plan": "pro"}';
```

You ship. Six months later you have 2 million users. That same query takes 8 seconds. The page that lists pro users times out. You check `EXPLAIN` and see `Seq Scan on users` — Postgres is opening every single row and parsing its JSON to check if it contains `{"plan":"pro"}`.

You try to fix it the way you always fix slow queries: add a B-tree index.

```sql
CREATE INDEX idx_users_data ON users USING btree (data);
```

Nothing changes. Still a sequential scan. B-tree can find rows where `data = '{"plan":"pro"}'` exactly, but you are not asking for exact equality. You are asking “does this big document *contain* this small piece?” B-tree has no idea how to answer that. That is the exact moment you need a different kind of index — one built for “does this composite value contain this element?”

## 2. The Analogy — Make the Mechanic Obvious

Think of the index at the back of a textbook.

A B-tree is like the table of contents. It is sorted by chapter title and tells you where one whole chapter starts. Great if you know the exact chapter name.

A GIN index is like the index at the back that lists every important term: `B-tree -> 12, 45, 88` , `GIN -> 42, 90, 112` , `jsonb -> 90, 91, 95`.

You do not flip through 400 pages to find “GIN”. You look up “GIN” in the index and jump straight to the pages.

Mapping to Postgres:

- The book is your table. Each row is a page.
- A composite value like `{"tags": ["postgres","gin","index"], "plan":"pro"}` is like a page with many terms on it. Postgres breaks it apart and pulls out every searchable term: `plan`, `pro`, `postgres`, `gin`, `index`.
- The alphabetical list at the back is the **entry tree** — a B-tree of every distinct term found anywhere in the table.
- Next to each term is the list of page numbers — the **posting list**. For `gin` it stores all the row IDs (TIDs) that contain `gin`.
- When you insert a new page, you could file every term immediately. That is slow. Instead Postgres sticks them on a pile of sticky notes on its desk — the **pending list**. Later it files them properly. That pile is `fastupdate`.

So a normal index maps `one row -> one index entry`. GIN flips it: `one term -> many rows`. That flipped map is why it is called a Generalized **Inverted** Index.

## 3. The Full Explanation — How It Actually Works

In plain words, GIN is Postgres’s inverted index for values that contain many things inside one column.

A B-tree expects one value per row per column. It sorts those values and can quickly answer equality and range: `where id = 5`, `where created_at > '2024-01-01'`. But a `jsonb` document, a `text[]` array, a `tsvector` document, or even a single text string broken into trigrams — all of these contain dozens of searchable pieces inside one cell. B-tree cannot index inside the cell.

GIN does. At index build time Postgres calls an extractor for that type. For `jsonb` it pulls out every key and value. For `text[]` it pulls out every array element. For `tsvector` it pulls out every lexeme. For `pg_trgm` it chops text into three-letter chunks. Then it builds two parts:

**Entry tree plus posting lists.** The entry tree is itself a B-tree, but not of table rows — of distinct keys. Under each key it stores a posting list or posting tree of row pointers (CTIDs) where that key appears. A query like `WHERE data @> '{"plan":"pro"}'` becomes two lookups: find `plan` and find `pro` in the entry tree, intersect their posting lists, fetch only those heap rows. You never scan the rest.

**What it accelerates.** GIN only helps if you use an operator the GIN operator class understands:

- `jsonb`: `@>` (contains), `?` (key exists), `?&` (all keys exist), `?|` (any key exists), `@?` and `@@` (jsonpath)
- arrays: `&&` (overlap), `@>` (contains), `<@` (is contained), `=` also uses GIN
- full-text: `@@` on `tsvector` / `tsquery`
- `pg_trgm`: `LIKE`, `ILIKE`, `~`, similarity with `gin_trgm_ops`

If you write `WHERE data = '{"a":1}'` or `WHERE tags::text LIKE '%gin%'` without the right opclass, GIN will not be used.

**The write price.** Because one row creates many index entries, GIN is bigger and slower to write than B-tree. Every `INSERT` or `UPDATE` must add that row’s TID to many posting lists. To keep writes tolerable Postgres has **fastupdate**.

With `fastupdate = on` (the default), new entries first go to an unsorted **pending list** in memory, up to `gin_pending_list_limit` (default 4 MB per index). Reads must scan both the main structure *and* this pending list, so a huge pending list makes reads slower. When the limit is hit, or when you run `VACUUM`, or when you call `gin_clean_pending_list('idx_name')`, Postgres bulk-merges the list into the main index. For bulk loads you often want `fastupdate = off` or you end every load with a vacuum.

**`jsonb_ops` vs `jsonb_path_ops` — the big choice.**

- `jsonb_ops` is the default (`USING GIN (data)`). It creates a separate entry for every key and every value, independently. It supports every jsonb GIN operator (`@>`, `?`, `?&`, `?|`, `@?`, `@@`). It is larger and slower to update because a document with 20 keys creates 20+ entries.

- `jsonb_path_ops` (`USING GIN (data jsonb_path_ops)`) hashes the full path to each value together, like `hash("a->1")`. It creates far fewer, smaller entries — often 3 to 7 times smaller and faster to write. But it only supports `@>`. If you need `?` or `?&` it will not be used and you will fall back to a scan.

Pick `jsonb_path_ops` only when every query you need is a containment check.

**When to use it and when not to.** Use GIN when one column holds many queryable pieces and your query is “contains / exists / matches”. Do not use it when you need sorted scans, range queries, or exact equality on the whole value — that is B-tree work. Do not add it to a 500-row table and expect a win; Postgres will correctly ignore it and seq scan anyway. And remember MVCC: GIN points to heap rows, so Postgres still checks visibility. A GIN lookup plus heap fetch is fast, but it is not index-only unless you have a covering trick.

## 4. See It In Practice — Real Code or Queries

These are real Postgres queries. Run them in `psql` or any Postgres client with `pg_trgm` available.

```sql
-- A table with composite values
CREATE TABLE users (
  id serial PRIMARY KEY,
  tags text[],
  data jsonb,
  body tsvector
);

CREATE TABLE products (
  id serial PRIMARY KEY,
  name text,
  data jsonb
);

-- Enable trigram extension for LIKE support
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. GIN on jsonb with the default opclass (supports all operators)
CREATE INDEX idx_users_data ON users USING GIN (data);

-- 2. Smaller, faster GIN that only supports @>  — use when you ONLY do containment
-- CREATE INDEX idx_users_data_path ON users USING GIN (data jsonb_path_ops);

-- 3. GIN on arrays
CREATE INDEX idx_users_tags ON users USING GIN (tags);

-- 4. GIN on full-text search vectors
CREATE INDEX idx_users_body ON users USING GIN (body);

-- 5. GIN on text with trigrams for LIKE / ILIKE
CREATE INDEX idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);
```

Queries that now use the index:

```sql
-- jsonb containment: all pro users (uses idx_users_data with either opclass)
EXPLAIN ANALYZE SELECT * FROM users WHERE data @> '{"plan":"pro"}';

-- jsonb key existence: users who have an email key (only works with jsonb_ops, NOT jsonb_path_ops)
EXPLAIN ANALYZE SELECT * FROM users WHERE data ? 'email';

-- jsonb multiple keys: must have both keys
SELECT * FROM users WHERE data ?& array['email','plan'];

-- array overlap: users who have at least one of these tags
SELECT * FROM users WHERE tags && ARRAY['postgres','gin'];

-- array containment: tags must contain both values
SELECT * FROM users WHERE tags @> ARRAY['postgres','gin'];

-- full-text search: documents containing both lexemes
SELECT * FROM users WHERE body @@ to_tsquery('postgres & indexing');

-- trigram LIKE: name contains gin (needs gin_trgm_ops)
EXPLAIN ANALYZE SELECT * FROM products WHERE name ILIKE '%gin%';
```

What you see in `EXPLAIN`:

```txt
-- without GIN
Seq Scan on users  (cost=0.00..18334.00 rows=100 width=...)

-- with GIN and a selective query
Bitmap Index Scan on idx_users_data  (cost=0.00..8.12 rows=100 width=0)
  Index Cond: (data @> '{"plan": "pro"}'::jsonb)
Bitmap Heap Scan on users
```

Housekeeping for the pending list:

```sql
-- see the limit (bytes)
SHOW gin_pending_list_limit; -- typically 4194304 (4 MB)

-- how big is the pending list right now (requires pgstatginindex)
SELECT * FROM pgstatginindex('idx_users_data');

-- manually flush after a bulk load
SELECT gin_clean_pending_list('idx_users_data');

-- or let VACUUM do it, and consider turning fastupdate off for bulk loads
CREATE INDEX idx_users_data_fast ON users USING GIN (data) WITH (fastupdate = off);

-- check size
SELECT pg_size_pretty(pg_relation_size('idx_users_data'));
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a GIN index and when would you use it?**

GIN is Postgres’s inverted index for columns that hold many values inside one cell — `jsonb` documents, arrays, `tsvector`, or trigrams for `LIKE`. A normal B-tree indexes one value per row and answers equality or range. GIN breaks the composite value into its parts, builds a map from each distinct part to every row that contains it, and answers “does this column contain this piece?” Use it when your query is containment or existence: `jsonb @>`, `?`, arrays `&&`/`@>`, full-text `@@`, or `LIKE '%term%'` with `pg_trgm`. Do not use it for `where id = 5` or `order by created_at`.

**Q: How does GIN store data internally? How is that different from B-tree?**

B-tree stores sorted copies of the column value itself, one entry per row, and walks the sorted tree to find a value. GIN stores an inverted map. It builds a B-tree of *distinct keys or elements* extracted from all rows, and under each key a posting list of row IDs where it appears. So `WHERE tags @> ARRAY['gin']` looks up `gin` in the entry tree, gets its posting list, and fetches only those rows. That is why one row insertion touches many GIN entries — one per element — which is why GIN writes are heavier and indexes are larger.

**Q: What operators and types does GIN actually accelerate?**

Only the operators its operator class was built for. With `jsonb_ops`: `@>`, `?`, `?&`, `?|`, `@?`, `@@`. With `jsonb_path_ops`: only `@>`. For arrays: `&&`, `@>`, `<@`, `=`. For `tsvector`: `@@`. For `pg_trgm` with `gin_trgm_ops`: `LIKE`, `ILIKE`, `~`, `%` similarity. If you use a different operator, Postgres will not consider the index at all. Always check `EXPLAIN` to confirm a `Bitmap Index Scan`.

**Q: What is fastupdate and the pending list? Why does it matter?**

`fastupdate` is a write optimization on by default. Instead of inserting each new element into the main GIN structure immediately, Postgres appends it to an unsorted pending list. This batches writes and is much faster for inserts and updates. The trade-off is that every read must scan the pending list in addition to the main index. If you bulk-load 1 million rows and never vacuum, that list grows huge and queries get slower. It flushes automatically when it hits `gin_pending_list_limit` (4 MB), on `VACUUM`, or when you call `gin_clean_pending_list()`. For bulk loads many teams create the index with `WITH (fastupdate = off)` or run a vacuum right after loading.

**Q: What is the difference between `jsonb_ops` and `jsonb_path_ops`?**

`jsonb_ops` is the default when you write `USING GIN (data)`. It indexes every key and every value separately. It supports all jsonb GIN operators and is flexible, but each document creates many index entries so it is larger and has higher write cost. `jsonb_path_ops` hashes the full path plus value together (so `{"a":{"b":1}}` gets one hash for `a->b->1` instead of three entries). It is 3 to 7 times smaller and faster to write and to search, but it only supports the containment operator `@>`. If you need `data ? 'email'` or `data ?& array['a','b']`, `jsonb_path_ops` will be ignored and you will get a sequential scan.

**Q: GIN vs GiST — when would you pick one over the other?**

Both handle composite and geometric types, but they trade differently. GIN is an inverted index that stores every key and is exact. It is larger, slower to build and update, but much faster to search when selectivity is good — the right choice for `jsonb` containment, array overlap, and full-text where you want fast lookups. GiST is a balanced tree of bounding or lossy summaries. It is smaller, faster to update, supports nearest-neighbor (`<->`) and is required for some geometric types, but searches may be lossy and need a heap recheck. If your workload is write-heavy with occasional searches and needs KNN, pick GiST. If it is read-heavy containment, pick GIN.

**Q: When would you *not* create a GIN index?**

Do not create one when B-tree is the right tool — exact equality, range, `ORDER BY`, unique constraints. Do not create one on tiny tables where a sequential scan is already faster than an index lookup. Do not create a GIN on a column you mostly update if write latency matters and you can restructure the data into normalized columns instead. And do not create a GIN and then query with an unsupported operator and assume it helps — always verify with `EXPLAIN ANALYZE`.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Adding a B-tree to a jsonb column and expecting `@>` to get faster.**

Wrong assumption: every index speeds up every WHERE.
Why people do it: B-tree is the default they know, and `CREATE INDEX ... USING btree (data)` succeeds without error.
What actually happens: Postgres never uses it for `@>`, `?`, or `&&`. The planner sees the operator does not match the opclass and chooses a sequential scan. The query stays at 8 seconds.
Fix: use `USING GIN (data)` for containment. Verify with `EXPLAIN` that you see `Bitmap Index Scan on idx_users_data`.

**Trap 2: Creating `jsonb_path_ops` then wondering why `?` queries still scan.**

Wrong assumption: a smaller GIN is just a faster version of the same index.
Why people do it: blogs say `jsonb_path_ops` is 5x smaller, so they use it everywhere.
What actually happens: `SELECT * FROM users WHERE data ? 'email'` cannot use a `jsonb_path_ops` index at all. It only supports `@>`. You get a seq scan and think GIN is broken.
Fix: use `jsonb_ops` (the default) if you need `?`, `?&`, `?|`, or jsonpath. Reserve `jsonb_path_ops` for cases where every query is `data @> '{...}'`.

**Trap 3: Bulk-loading a million rows and leaving a massive pending list.**

Wrong assumption: writes are done, so reads should be fast now.
Why people do it: `fastupdate = on` hides the cost during the load, so the load looks quick.
What actually happens: the pending list holds hundreds of thousands of unmerged entries. Every subsequent `SELECT ... WHERE data @> ...` must scan that unsorted pile plus the main index. P99 latency spikes until the next autovacuum.
Fix: after a bulk load run `SELECT gin_clean_pending_list('idx_users_data')` or `VACUUM users`, or build the index with `WITH (fastupdate = off)` and build it after the load.

**Trap 4: Creating a GIN index and the planner still ignores it.**

Wrong assumption: if an index exists the planner will use it.
Why people do it: they test on a small table or with a non-selective query like `WHERE tags && ARRAY['common_tag']` that matches 80 percent of rows.
What actually happens: Postgres correctly estimates that reading 80 percent of the table via random I/O from a bitmap scan is slower than just scanning sequentially. `EXPLAIN` shows `Seq Scan` and they think the index is broken.
Fix: GIN helps when the condition is selective. Test with realistic data volume and selective values. For non-selective queries, restructure the query or accept the scan.

**Trap 5: Forgetting that GIN indexes are large and need maintenance.**

Wrong assumption: storage and vacuum are free.
Why people do it: they add GIN to several jsonb and array columns without checking size.
What actually happens: each GIN can be larger than the table itself. Autovacuum works harder, writes are slower, and bloat after heavy updates makes the index double in size. Unmonitored disk usage grows.
Fix: check `pg_relation_size` and `pgstatginindex` regularly, vacuum tables with heavy jsonb updates more aggressively, and only index the columns you actually query with containment operators. Consider `jsonb_path_ops` to cut size when ` @>` is enough.

## 7. Compare With Related Concepts

**GIN vs B-tree:** B-tree maps one row to one sorted entry and answers equality, range, and ordering. GIN maps one element inside a value to many rows and answers containment. One-line rule: if your WHERE is `col = X` or `col > X` or `ORDER BY col`, use B-tree; if it is `col @> X` or `col ? X` or `col && ARRAY[X]`, use GIN.

**GIN vs GiST:** Both handle composite and full-text types, but GIN is an exact inverted index and GiST is a tree of lossy summaries. GIN is bigger and slower to write but faster to search for containment. GiST is smaller, faster to update, and the only one that does nearest-neighbor (`ORDER BY geom <-> point`) and some geometric operators. One-line rule: for fast `@>`, `&&`, `@@` reads pick GIN; for write-heavy, lossy-tolerant, or KNN needs pick GiST.

**GIN vs BRIN:** BRIN stores tiny min-max summaries per block range and is almost free in size. It excels when rows are physically ordered (like an append-only `created_at`). GIN stores an entry per distinct element and is large. One-line rule: for naturally ordered terabytes where you filter by the ordered column, use BRIN; for “does this jsonb/array contain X” regardless of physical order, use GIN.

**`jsonb_ops` vs `jsonb_path_ops` (both GIN, but worth contrasting):** `jsonb_ops` indexes every key and value separately and supports all GIN jsonb operators. `jsonb_path_ops` hashes the full path and only supports `@>`, but is much smaller and faster. One-line rule: need `?` or flexible jsonpath — `jsonb_ops`; only ever query `data @> '{...}'` and care about size — `jsonb_path_ops`.

## 8. 🧠 The Memory Hook

B-tree is the table of contents — it finds one exact chapter. GIN is the index at the back of the book — it lists every term and every page it appears on, so “contains this term?” jumps straight to the answer.
