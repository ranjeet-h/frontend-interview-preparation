# VARCHAR vs TEXT in MySQL

## 1. The Real-World Problem — When You Actually Hit This

Your team ships a catalog fast. Every string column becomes `TEXT` because “it never complains about length.” Product titles, summaries, vendor notes, tags — all `TEXT`. On your laptop with 50 rows, every query feels instant.

At 800,000 products the search page falls over. This query used to take 4 ms. Now it takes 400 ms and spikes CPU and disk:

```sql
SELECT product_id, title, summary, price
FROM products
WHERE category_id = 42
ORDER BY price DESC, title ASC
LIMIT 20;
```

You try to add an index on `summary` and MySQL throws `ERROR 1170: BLOB/TEXT column used in key specification without a key length`. You try to add three `VARCHAR(5000)` notes columns in `utf8mb4` and MySQL throws `ERROR 1118: Row size too large`. Both errors point to the same thing you never had to think about at small scale: where and how MySQL actually stores the string, how much inline space it takes, and whether it can be indexed or sorted in memory.

Knowing when to use `VARCHAR` versus `TEXT` is the difference between queries that stay in RAM and queries that spill to disk and chase pointers for every row.

## 2. The Analogy — Make the Mechanic Obvious

Think of an InnoDB 16 KB page as a drawer in a filing cabinet, and each row as a folder inside that drawer. The drawer has fixed space. If you want to scan 50 folders quickly, you want everything you need to see right inside the folder.

`VARCHAR` is a stretchy pocket sewn directly inside the folder. You declare how big the pocket can stretch — say 255 characters — but it only uses the space you actually put in. A title like “Mug” uses 3 characters of space plus a tiny tag that says how long it is. When you open the drawer and flip through folders, the title is right there. No extra trip.

`TEXT` is a claim ticket stapled to the folder. The folder does not hold the whole document because that document could be a 16 MB manual or a 4 GB dump. Instead the drawer holds a small 20-byte ticket that says “your real content is in warehouse crate #472, page 9, offset 128.” If you want to scan 50 rows and you asked for that `TEXT`, the assistant has to walk to the warehouse for every folder, open crates, and carry paper back.

The analogy maps directly. Inline pocket = stored on the clustered index page, fast sequential scan, cheap sort in memory. Claim ticket = 20-byte pointer on the page with payload on overflow pages, extra random I/O on read, trouble when you try to sort or group in memory because the engine cannot pack unbounded, off-page blobs into a tight RAM buffer. And just like a filing system, you cannot build a normal index tab for “every word inside every crate” without saying how many characters from the front you actually want to index — that is the prefix length.

## 3. The Full Explanation — How It Actually Works

`VARCHAR` and `TEXT` are both variable-length strings, but MySQL treats them as fundamentally different storage promises.

**VARCHAR is bounded, inline, and counted against the row size.** You declare `VARCHAR(N)` where `N` is a character count, not a byte count. `N` can be 0 to 65535. That number is a promise about characters, so MySQL can reason about it before any row is inserted. Under `utf8mb4`, one character can take up to 4 bytes. So `VARCHAR(255)` can be up to 1020 bytes on the wire, but a value like `'hi'` still only stores 2 characters plus a small length tag.

Every `VARCHAR` value carries a 1- or 2-byte length prefix. If the column’s maximum possible byte length is 255 or less, MySQL uses 1 byte to record the length. If it is more than 255, it uses 2 bytes. That is why `VARCHAR(60)` in `utf8mb4` (60 × 4 = 240 bytes) uses a 1-byte prefix, but `VARCHAR(100)` in `utf8mb4` (400 bytes) uses a 2-byte prefix. The prefix is why the absolute max for a single `VARCHAR` in `latin1` (1 byte per char) is `VARCHAR(65532)` — 65535 total row bytes minus 2 bytes prefix minus 1 byte null bitmap — and in `utf8mb4` it is `VARCHAR(16383)` (16383 × 4 = 65532).

The row itself cannot exceed 65535 bytes for all inline columns combined. This is the MySQL row limit, not the page limit. InnoDB pages are 16 KB, and for the B+ tree to stay valid each page must hold at least two rows, so in practice a single inline row past about 8 KB gets pushed outward. But the DDL check is strict: declare ten `VARCHAR(1000)` columns in `utf8mb4` and you have asked for 40,000 bytes. Add a few more and `CREATE TABLE` fails before any data is inserted. The engine checks the declared maximum, not the actual strings you plan to store.

Inline also means indexable in the normal way. InnoDB can build a B-tree index on a `VARCHAR` directly, up to the index key limit of 3072 bytes in `DYNAMIC` row format. In `utf8mb4` that is about 768 characters. If your declared length fits inside that limit, you can index the whole column with `INDEX (slug)`. If it is larger, MySQL will tell you the key is too long and you must use a prefix like `INDEX (title(191))` — where 191 × 4 = 764 bytes — or rethink the type.

`VARCHAR` also supports simple literal defaults. `status VARCHAR(20) NOT NULL DEFAULT 'draft'` works in every supported version. That matters for ORM models and migrations.

**TEXT is unbounded, off-page, and barely counted against the row size.** The family is `TINYTEXT` (up to 255 bytes, 1-byte prefix), `TEXT` (up to 64 KB, 2-byte prefix), `MEDIUMTEXT` (up to 16 MB, 3-byte prefix), and `LONGTEXT` (up to 4 GB, 4-byte prefix). Those limits are bytes, not characters. In `utf8mb4`, a `TEXT` that can hold 65535 bytes will hold about 16383 four-byte characters but 65535 one-byte ASCII characters.

In the default `DYNAMIC` row format (MySQL 5.7+ with Barracuda), InnoDB tries to keep rows inline, but once a row would not fit on the 16 KB page, it moves the entire `TEXT` payload to overflow pages and leaves only a 20-byte pointer on the clustered index page. That pointer holds space id, page number, offset, and length. So a table with four `LONGTEXT` columns only reserves about 80 bytes on the main page, which is why you can create it even though four “4 GB” columns would never fit in 65 KB.

In the old `COMPACT` or `REDUNDANT` format, InnoDB kept the first 768 bytes of every `TEXT` inline and put the rest off-page. That wasted page space and caused more splits and less cache density. You still see `ROW_FORMAT=COMPACT` on legacy tables, which is why two tables with identical schemas can have very different performance.

Because `TEXT` is unbounded, MySQL cannot safely build a B-tree key from the whole value. You must give a prefix length: `INDEX (summary(100))`. That index only knows about the first 100 characters. It can narrow a search but cannot answer exact equality or ordering alone — MySQL must fetch the full row and compare the real payload. Prefix indexes also cannot be used as covering indexes and cannot satisfy `ORDER BY`. If you need search across the whole body, you want `FULLTEXT`, not a longer prefix.

Default values are also different. Before MySQL 8.0.13, `TEXT` and `BLOB` could not have defaults at all. Since 8.0.13 they can, but only as expressions in parentheses: `summary TEXT DEFAULT ('')` or `DEFAULT (CONCAT('draft ', CURRENT_DATE()))`. A bare `DEFAULT 'draft'` is rejected for `TEXT` but accepted for `VARCHAR`. ORMs that generate bare defaults will fail on `TEXT` if you do not know this.

**utf8mb4 bytes versus characters is where people get burned.** `VARCHAR(N)` counts characters, `TEXT` limits count bytes. Declaring `VARCHAR(255)` promises 255 characters. In `latin1` that is 255 bytes. In `utf8mb4` that is up to 1020 bytes. The index limit, the row limit, and the sort buffer all care about bytes. When you size a column you must multiply by the charset max. When you see `ERROR 1118`, multiply. When you see `Specified key was too long`, multiply.

**When to choose which** follows directly from those mechanics. Choose `VARCHAR` when the value is bounded and you read it often on list and filter queries: titles, slugs, emails, usernames, status, short bios under a known max like 5000. It stays inline, it sorts in RAM without a warehouse trip, it takes a simple default, and it takes a normal index. Choose `TEXT` and its siblings when the value is truly unbounded or large — article bodies, markdown docs, logs, JSON dumps over several KB — and you normally fetch it only on a detail view by primary key, not on every filtered list. If adding another big `VARCHAR` would push the table past 65535 declared bytes, switching that column to `TEXT` removes it from the inline budget. If you are constantly filtering or ordering by that column, that is a signal you actually want `VARCHAR` with an index, not `TEXT`.

## 4. See It In Practice — Real Code or Queries

**VARCHAR defaults, length prefix, and row limit in utf8mb4**

```sql
-- VARCHAR uses character length, but limits are checked in bytes for utf8mb4
CREATE TABLE articles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- simple literal default works for VARCHAR
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- 255 chars × 4 bytes = 1020 bytes + 2 byte prefix on disk
  slug VARCHAR(255) NOT NULL,
  -- TEXT needs expression syntax for a default since 8.0.13
  summary TEXT DEFAULT (''),
  -- LONGTEXT is fully off-page under DYNAMIC; only 20-byte pointer lives on the main page
  body LONGTEXT NOT NULL,
  UNIQUE KEY uq_slug (slug)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index the whole VARCHAR because 255 chars × 4 = 1020 bytes fits under 3072
CREATE INDEX idx_status ON articles(status);

-- If you need longer: pick a prefix that fits the 3072 byte key limit
-- 191 chars × 4 = 764 bytes, so this is safe for utf8mb4
CREATE INDEX idx_slug_prefix ON articles(slug(191));
```

**Why 65535 bytes matters before any row is inserted**

```sql
-- FAILS at DDL time: declared max exceeds MySQL's 65535 row size
-- col1 10000 chars × 4 = 40000, col2 7000 chars × 4 = 28000 → 68000 > 65535
CREATE TABLE oversized_varchar (
  col1 VARCHAR(10000) NOT NULL,
  col2 VARCHAR(7000) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- ERROR 1118 (42000): Row size too large. The maximum row size ... is 65535.

-- SUCCEEDS: TEXT only reserves a 20-byte pointer per column on the main page
CREATE TABLE multiple_large_texts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  body1 LONGTEXT,
  body2 LONGTEXT,
  body3 LONGTEXT,
  body4 LONGTEXT
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4;
-- OK: about 80 bytes on the clustered page, payload lives off-page
```

**Prefix index is mandatory for TEXT, and FULLTEXT is the alternative**

```sql
-- FAILS: cannot index a TEXT without telling MySQL how many chars to index
-- CREATE INDEX idx_summary ON articles(summary);
-- ERROR 1170 (42000): BLOB/TEXT column 'summary' used in key specification without a key length

-- OK: index the first 100 characters only
CREATE INDEX idx_summary_prefix ON articles(summary(100));

-- For real search across the whole body, use FULLTEXT instead of a longer prefix
CREATE FULLTEXT INDEX idx_body_fts ON articles(body);

-- Prefix index helps narrow, but cannot sort or cover:
-- This still needs to fetch the full TEXT to compare the rest of the string
SELECT id FROM articles WHERE summary = 'a very long string that diverges only at the very end ...';
```

**TEMP tables and sorting: the performance cliff**

```sql
-- Clean counters, then run two similar ORDER BY queries
FLUSH STATUS;

-- VARCHAR sort: engine can allocate a bounded buffer and sort in RAM
SELECT id, status, slug FROM articles ORDER BY status, slug;
SHOW STATUS LIKE 'Created_tmp%';
-- Created_tmp_tables small or 0, Created_tmp_disk_tables 0 on healthy sizes

-- TEXT in the select with GROUP BY / ORDER BY: higher chance of spill
SELECT summary, COUNT(*) FROM articles GROUP BY summary ORDER BY COUNT(*) DESC;
SHOW STATUS LIKE 'Created_tmp%';
-- Created_tmp_tables 1, Created_tmp_disk_tables often 1
-- In MySQL 5.7 the MEMORY engine could not hold TEXT at all and went straight to disk.
-- In MySQL 8.0 TempTable holds it in RAM until temptable_max_ram (default 1 GB) then spills to disk.

-- Fix the list view: do not drag TEXT into the sort if the UI only shows the title
SELECT id, title, created_at
FROM articles
WHERE user_id = 100
ORDER BY created_at DESC
LIMIT 50;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is the real difference between how MySQL stores VARCHAR and TEXT?**

`VARCHAR` is stored inline on the InnoDB clustered index page with a 1- or 2-byte length prefix. As long as the whole row fits on the page, reading it is a single sequential page read. `TEXT` payloads live off-page in overflow pages under `DYNAMIC` row format, with only a 20-byte pointer on the main page. That keeps the main page dense but means every read of that column is a pointer dereference and potentially extra random I/O. If you select a `TEXT` on every list query you pay that cost for every row scanned.

**Q: Why is N in VARCHAR(N) characters but TEXT limits are bytes?**

MySQL wanted `VARCHAR(50)` to guarantee 50 characters regardless of charset, whether they are ASCII or emoji. That promise is measured in characters. `TEXT` types are defined by the size of the length prefix integer that stores them: `TINYTEXT` uses 1 byte so 2^8-1 = 255 bytes, `TEXT` uses 2 bytes so 2^16-1 = 65535 bytes, `MEDIUMTEXT` 2^24-1 = 16 MB, `LONGTEXT` 2^32-1 = 4 GB. So how many characters fit in a `TEXT` depends on encoding. In `utf8mb4` a `TEXT` holds about 16k four-byte characters but 65k one-byte characters.

**Q: Why does ORDER BY or GROUP BY get slow when the query touches TEXT?**

Sorting and grouping need to materialize rows in a sort buffer or temp table. With `VARCHAR`, MySQL knows the declared max and can reserve a fixed slot per row in `sort_buffer_size`. With `TEXT`, the value is unbounded and off-page. In MySQL 5.7 the `MEMORY` temp table engine did not support `TEXT` at all, so any temp table that contained a `TEXT` went straight to an on-disk MyISAM/InnoDB temp table. In MySQL 8.0 the `TempTable` engine supports `TEXT` in RAM, but large payloads quickly exhaust `temptable_max_ram` and spill to memory-mapped or InnoDB temp files on disk. Sorting `TEXT` also cannot use a simple single-pass fixed buffer and may fall back to sorting row ids and then re-fetching rows by id, doubling I/O.

**Q: Why does MySQL require a prefix length to index a TEXT column, but not always for VARCHAR?**

A B-tree index stores key copies inside 16 KB index pages. If it stored whole `TEXT` payloads that can be 64 KB to 4 GB, each index page would hold one key and the tree would collapse. MySQL enforces a key length limit of 3072 bytes for `DYNAMIC`. For `VARCHAR` MySQL checks declared bytes — if `N × charset_max ≤ 3072` it allows `INDEX (col)`. For `TEXT` it cannot prove the value fits, so it forces you to declare `INDEX (col(100))`. That prefix only indexes the first N characters, cannot be used for `ORDER BY`, and cannot be a covering index.

**Q: How does the 65535-byte row limit work for each type?**

MySQL refuses to create a table whose declared inline columns could exceed 65535 bytes. `INT`, `BIGINT`, `CHAR`, and `VARCHAR` all count at declared max bytes against that limit. `TEXT` and `BLOB` barely count — roughly the length prefix plus the 20-byte pointer. That is why ten `VARCHAR(1000)` columns in `utf8mb4` (40,000 bytes) can already push you over the limit, while ten `TEXT` columns barely register. The limit is checked at `CREATE TABLE` and `ALTER TABLE` time from the declaration, not from actual data.

**Q: How does ROW_FORMAT change TEXT storage?**

In `COMPACT` and `REDUNDANT` (legacy), InnoDB kept the first 768 bytes of each `TEXT` inline on the main page and the remainder off-page. Five `TEXT` columns immediately burned 3840 bytes of page space, fitting fewer rows per page and causing more splits. In `DYNAMIC` and `COMPRESSED` (default since MySQL 5.7), InnoDB stores only a 20-byte pointer if the row overflows and moves the whole payload off-page. That is denser for the clustered index and better for buffer pool hit rate. This is why the same schema can perform very differently after a row format change.

**Q: Can TEXT have a DEFAULT value?**

Not before MySQL 8.0.13 — any `DEFAULT` on `TEXT` was a syntax error. Since 8.0.13 it can, but only as an expression in parentheses: `TEXT DEFAULT ('draft')` or `DEFAULT (UUID())`. `VARCHAR` accepts a plain literal `DEFAULT 'draft'`. Many ORMs generate the plain form, so migrations that switch a `VARCHAR` to `TEXT` break on default clauses unless you wrap them.

**Q: When should I use VARCHAR(5000) versus TEXT?**

Use `VARCHAR(5000)` when the field is bounded and hot: you read it on list views, filter or sort by it, update it inline, and want a normal index and literal default. The extra bytes are inline but accounted for. Use `TEXT` or `MEDIUMTEXT` when the content is unbounded or large and you fetch it only by primary key on a detail view: article bodies, logs, or markdown where listing pages should never `SELECT` it. If `VARCHAR(5000)` would push the table past 65535 declared bytes, prefer `TEXT` for the rarely-queried large columns and keep the hot columns as `VARCHAR`.

## 6. The Traps — What Goes Wrong in Production

**The VARCHAR(255) cargo cult.** Teams copy `VARCHAR(255)` everywhere because it “feels safe” and early MySQL examples used it. On disk `VARCHAR` only stores what you put in, but in memory for sorts MySQL reserves based on the declared maximum multiplied by the charset. In `utf8mb4`, `VARCHAR(255)` reserves 1020 bytes per row in the sort buffer. A `country_code` that holds `'US'` would reserve 1020 bytes as `VARCHAR(255)` but only 8 bytes as `VARCHAR(2)`. Sort 100k rows and the first reserves 100 MB in the sort buffer while the second needs under 1 MB. The first spills to disk; the second stays in RAM. Fix it by sizing `VARCHAR` to the real domain — `VARCHAR(2)` for codes, `VARCHAR(100)` for names, not 255 for everything.

**SELECT * that drags TEXT into every list view.** An API that returns `SELECT * FROM articles WHERE user_id = ? ORDER BY created_at DESC LIMIT 50` forces InnoDB to chase off-page pointers for every `TEXT` column even if the feed only renders the title. If the secondary index is on `(user_id, created_at)`, the engine still must fetch the clustered row and then the overflow page. The fix is to project only what the view needs, or do a deferred join: fetch ids from the covering index, then join back for the one row the user actually opens.

**Prefix indexes that look indexed but are not.** Creating `INDEX (body(20))` feels like you indexed `body`, but MySQL can only use those 20 characters to narrow the scan. For `WHERE body = 'https://example.com/very/long/url/that/diverges/at/char/80'` it finds all rows with the same first 20 bytes, then fetches each full `TEXT` to compare the rest. The index also cannot answer `ORDER BY body` or serve as a covering index. The fix is to index a truly bounded `VARCHAR` column for filtering and sorting, and use `FULLTEXT` for whole-body search, not a wider prefix.

**Row size rejection that blocks a migration.** Adding `initial_notes VARCHAR(5000), agent_feedback VARCHAR(5000), resolution_summary VARCHAR(5000)` in `utf8mb4` asks for 60,000 declared bytes plus whatever the table already has. Even if every note will be 20 characters, MySQL checks the declaration at `ALTER TABLE` time and throws `ERROR 1118`. Teams then panic and make everything `TEXT`. The right fix is to keep small hot fields as `VARCHAR` with tight bounds and move only the unbounded prose fields to `TEXT`, so the inline budget stays under 65535.

**Forgetting utf8mb4 math.** `VARCHAR(191)` fits a 3072-byte index key in `utf8mb4` (191 × 4 = 764). `VARCHAR(255)` does not (255 × 4 = 1020) for a multi-column key. `VARCHAR(1000)` in `utf8mb4` is 4000 bytes of declared row size, not 1000. Every sizing decision — row limit, index key, sort buffer — multiplies by 4. Forgetting that multiplication produces the two most common MySQL DDL errors.

## 7. Compare With Related Concepts

**CHAR vs VARCHAR vs TEXT.** `CHAR(N)` is fixed length up to 255, padded with spaces, always inline, always reserves `N × charset` bytes even for `'hi'`. Best for truly fixed tokens like `CHAR(2)` country codes or `CHAR(36)` UUIDs where every value is the same length and you want no length prefix. `VARCHAR(N)` is variable length with a 1- or 2-byte prefix, inline, best for bounded but varying strings like emails and titles. `TEXT` is variable length with a 2- to 4-byte prefix plus a 20-byte pointer, mostly off-page, best for unbounded prose. One-line rule: fixed shape → `CHAR`, bounded varying → `VARCHAR`, unbounded large → `TEXT`.

**TEXT vs BLOB.** Same storage mechanics and family sizes, but `TEXT` has a charset and collation so comparisons follow language rules and case sensitivity follows `utf8mb4_unicode_ci` versus `utf8mb4_bin`. `BLOB` is raw bytes with `binary` collation and bytewise comparison. Use `TEXT` for articles and logs, `BLOB` for images, PDFs, or encrypted bytes. One-line rule: human-readable string → `TEXT`, binary payload → `BLOB`.

**MEMORY vs TempTable vs InnoDB temp.** On the execution side, MySQL 5.7’s `MEMORY` temp table engine stored `VARCHAR` as fixed `CHAR` in RAM and did not support `TEXT` at all, forcing an immediate spill to disk. MySQL 8.0’s `TempTable` engine stores `VARCHAR` variable-length and supports `TEXT` in RAM until `temptable_max_ram` fills, then spills to disk via InnoDB temp files. One-line rule: if your query must use `TEXT` and `GROUP BY` or `DISTINCT`, expect a disk spill sooner and fetch `TEXT` only when needed.

## 8. 🧠 The Memory Hook

**VARCHAR lives in the drawer; TEXT hands you a ticket to the warehouse.** If you filter, sort, group, or index the column on every query, keep it in the drawer with a tight `VARCHAR`. If it is a long article you only open by id, staple a `TEXT` ticket to the folder and leave the warehouse alone until the detail page.
