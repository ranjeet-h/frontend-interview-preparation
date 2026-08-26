# What is full-text search in PostgreSQL

## 1. The Real-World Problem — When You Actually Hit This

You ship a simple search. Your products table has 2,000 rows, and this works fine:

```sql
SELECT * FROM products WHERE name ILIKE '%running shoes%';
```

A few months later you have 2 million products. Search takes 4 seconds, the page spins, and users complain that "runner shoes" finds nothing but "Running Shoes" does, and searching for "run" does not find "running". You check the database and see sequential scans in `EXPLAIN`. Your `ILIKE '%term%'` cannot use a normal B-tree index because the wildcard is on both sides — Postgres has to read every single row and check the string character by character. There is no stemming, so "run", "running", "runners" are three different strings. There is no ranking, so an exact title match is buried under random description matches. There is no language awareness, so "the" and "a" pollute results.

This is the exact moment Postgres full-text search exists for. You need to stop scanning raw text and start searching a prepared, indexed form of the text that understands words, not just characters.

## 2. The Analogy — Make the Mechanic Obvious

Think of a library with no catalog.

`ILIKE '%term%'` is walking down every aisle, opening every book, and scanning every page to see if those letters appear anywhere. It works when you have 20 books. It collapses when you have 2 million.

Full-text search is hiring a librarian who builds a card catalog before anyone asks a question.

For every book, the librarian does three things: she breaks the text into words, she throws away useless filler words like "the" and "is", and she reduces words to their root form so "running", "runner", and "runs" all become the same card: "run". She writes those roots on index cards, notes where they appear and how important they are (title vs footnote), and then files the cards alphabetically in a giant drawer. That drawer is sorted so she can jump straight to "run" without walking the aisles.

When you walk in and ask for "running shoes", she does the same normalization to your question — "running" becomes "run" — then she goes straight to the drawer, pulls the cards for "run" and "shoe", finds which books have both, and hands you the best matches first.

In Postgres terms: the librarian preparing cards is `to_tsvector`. Your normalized question is `to_tsquery`. The drawer that lets her jump straight to a word is a `GIN` index on that `tsvector`. The act of pulling matching cards is the `@@` operator. Putting the best matches on top is `ts_rank`.

## 3. The Full Explanation — How It Actually Works

Full-text search in Postgres is a pipeline. Raw text goes in one end, normalized tokens come out, queries are normalized the same way, and an index makes the match fast.

**Step 1 — Documents become `tsvector`.** A `tsvector` is not text. It is a sorted list of lexemes — the root forms of words — plus their positions and weights. When you call `to_tsvector('english', 'Running runners run quickly')`, Postgres does this: it parses the string, lowercases everything, removes stop words like "is" or "the" according to the language config, stems words using the dictionary for that language ("running" → "run"), and records where each lexeme appeared. The same sentence with the `english` config becomes `'quick':4 'run':1,2,3`. Three different surface forms collapsed to one lexeme. That is why "run" can find "running".

The `'english'` part is the language configuration. It tells Postgres which parser, which stop-word list, and which stemming dictionary to use. `'simple'` does almost nothing — it just lowercases and splits. `'english'` knows English grammar. `'french'` knows French. If you index with `english` and query with `simple`, they will not match, because the lexemes were built differently. Language config must be the same on both sides.

You can also add weight — `setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', body), 'B')` — so a match in the title counts more than a match in the body. That weight flows into ranking later.

**Step 2 — Queries become `tsquery`.** A `tsquery` is also not text. It is lexemes combined with boolean logic. `to_tsquery('english', 'running & shoes')` becomes `'run' & 'sho'`. It supports `&` (AND), `|` (OR), `!` (NOT), and `<->` (followed by, for phrase search). `to_tsquery` expects you to write that syntax correctly. If a user types raw text like "running shoes!", `to_tsquery` will throw a syntax error. That is why you almost never feed raw user input to `to_tsquery` in production.

Postgres gives you two safer parsers for user input: `plainto_tsquery('english', 'running shoes')` turns the whole string into `'run' & 'sho'` automatically, inserting `&` between words. `websearch_to_tsquery('english', 'running shoes -cheap "red shoes"')` is even nicer — it understands quotes for phrases and `-` for NOT, like a web search box.

**Step 3 — Match with `@@`.** The `@@` operator asks "does this tsvector satisfy this tsquery?" It returns true or false. That is the WHERE clause:

```sql
WHERE search_vector @@ plainto_tsquery('english', 'running shoes')
```

This is not a string comparison. It is a lexeme containment check. It is fast because it compares small normalized tokens, not raw text.

**Step 4 — Rank with `ts_rank` / `ts_rank_cd`.** Matching alone is not enough. If 50,000 rows match "shoes", which one goes first? `ts_rank(vector, query)` and `ts_rank_cd` (cover density) score each row based on how often the terms appear, how close they are, and their weight. A row where "running" and "shoes" appear next to each other in the title scores higher than a row where they appear far apart in a long body. You always `ORDER BY rank DESC`. Without ranking, full-text search feels broken — users see random results.

**Step 5 — Make it fast with a GIN index on the `tsvector`.** A B-tree index is useless here — it sorts raw text alphabetically, but you are searching for lexemes inside the text. A `GIN` (Generalized Inverted Index) is the drawer from the analogy. It stores every lexeme → list of rows that contain it. Looking up `'run'` is a direct jump, not a scan. You index the `tsvector`, not the raw text:

```sql
CREATE INDEX idx_articles_search ON articles USING GIN (search_vector);
```

GIN is preferred for FTS because lookups are very fast. The tradeoff is writes are slower and the index is larger, because changing one row may require updating many lexeme entries. `GiST` is the alternative — smaller, faster to update, but slower to search and it can return false positives that need rechecking. For most search workloads where reads dominate, GIN wins.

**Step 6 — Keep the `tsvector` fresh with a generated column.** The `tsvector` must stay in sync with the text. The cleanest way in modern Postgres (12+) is a stored generated column:

```sql
search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))
) STORED
```

It recomputes automatically on insert or update, you can index it directly, and you never forget to update it. On older versions you do the same with a trigger or you create an expression index `USING GIN (to_tsvector('english', title || ' ' || body))`, but a stored column is easier to query and to inspect.

**Step 7 — Know when to stay in Postgres and when to leave.** Postgres FTS is excellent when your data is already in Postgres, your scale is millions of rows (not billions), you need simple relevance and boolean/phrase queries, and you want transactions — a new article is searchable the moment you commit, no sync lag. Move to an external engine like Elasticsearch, OpenSearch, or Typesense when you need faceted search at huge scale, typo tolerance and fuzzy matching out of the box, complex analyzers for many languages at once, autocomplete as-you-type at high throughput, or distributed search across many nodes with dedicated relevance tuning. External search is powerful but it is a second system — you now have to sync data, handle lag, monitor another cluster, and deal with consistency gaps.

## 4. See It In Practice — Real Code or Queries

All of this runs in plain PostgreSQL 12+.

The problem — why ILIKE collapses:

```sql
-- Cannot use a B-tree index. Forces a sequential scan on every row.
EXPLAIN ANALYZE
SELECT id, title FROM products WHERE title ILIKE '%running%';
-- Seq Scan on products (cost=... rows=... ) Filter: (title ~~* '%running%'::text)

-- Also misses linguistic matches: this finds nothing if the row says "runners"
SELECT * FROM products WHERE title ILIKE '%run%';
-- "Runners shoes" matches by luck, but "running shoes" needs exact substring
```

The core pipeline — see what Postgres actually stores:

```sql
-- to_tsvector normalizes documents; to_tsquery normalizes queries
SELECT to_tsvector('english', 'Running runners run quickly');
-- 'quick':4 'run':1,2,3   <- three forms collapsed to one lexeme

SELECT to_tsvector('simple', 'Running runners run quickly');
-- 'quickly':4 'run':3 'runners':2 'running':1  <- simple does no stemming

SELECT to_tsquery('english', 'running & shoes');
-- 'run' & 'sho'

SELECT websearch_to_tsquery('english', 'running shoes -cheap');
-- 'run' & 'sho' & !'cheap'
```

A production table with a generated column and GIN index:

```sql
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Automatically stays in sync with title + body. Stored on disk, indexable.
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) STORED
);

-- The index is on the tsvector, not on title/body directly
CREATE INDEX idx_articles_search ON articles USING GIN (search_vector);

-- Insert — search_vector is computed for you
INSERT INTO articles (title, body) VALUES
  ('Getting started with Postgres', 'Full-text search is fast and built in.'),
  ('Running tips for beginners', 'Runners should run quickly at first.'),
  ('Shoes for runners', 'The best running shoes for daily runs.');

-- Search — same language config on both sides, rank best matches first
SELECT
  id,
  title,
  ts_rank(search_vector, query) AS rank,
  ts_headline('english', body, query, 'StartSel=<mark>, StopSel=</mark>') AS highlight
FROM articles,
     websearch_to_tsquery('english', 'running shoes') AS query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 10;
-- "Running tips" and "Shoes for runners" both match because "running"/"runners" -> "run"

-- Phrase search — words must be adjacent
SELECT * FROM articles
WHERE search_vector @@ to_tsquery('english', 'run <-> shoe');
```

When you cannot use a generated column (older Postgres or computed from a join), use a trigger or expression index:

```sql
-- Expression index — no extra column, but harder to inspect
CREATE INDEX idx_articles_expr ON articles
  USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')));

-- Then you must repeat the exact expression in the query
SELECT * FROM articles
WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')) @@
      plainto_tsquery('english', 'postgres search');
```

Weighted search — make title matches outrank body matches:

```sql
-- Add a separate weighted vector if you need fine control per field
ALTER TABLE articles ADD COLUMN weighted_vector tsvector;

UPDATE articles SET weighted_vector =
  setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
  setweight(to_tsvector('english', coalesce(body,'')), 'B');

CREATE INDEX idx_articles_weighted ON articles USING GIN (weighted_vector);

SELECT id, title, ts_rank(weighted_vector, query) AS rank
FROM articles, plainto_tsquery('english', 'postgres') AS query
WHERE weighted_vector @@ query
ORDER BY rank DESC;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Why not just use LIKE or ILIKE for search?**

Because `LIKE '%term%'` and `ILIKE '%term%'` are substring scans. With a wildcard on both sides Postgres cannot use a B-tree index and must read every row. That is fine for a few thousand rows and terrible for millions. They also have no understanding of language — "run" will not find "running", "Runner" is a different string because of case, and there is no way to say "find documents that have both 'postgres' and 'search' but rank the one where they appear together higher." ILIKE is a filter, not a search engine. Full-text search replaces that scan with normalized tokens and an inverted index.

**Q: Walk me through the full pipeline — what do to_tsvector, to_tsquery, @@, and ts_rank each do?**

`to_tsvector` takes raw text and a language config and produces a `tsvector` — a sorted list of lexemes with positions and weights. It handles parsing, lowercasing, stop-word removal, and stemming. `to_tsquery` takes a query string and the same language config and produces a `tsquery` — lexemes combined with `&`, `|`, `!`, `<->`. `@@` is the match operator that returns true if the tsvector satisfies the tsquery. `ts_rank` and `ts_rank_cd` score how well a matching row satisfies the query, using frequency, proximity, and weight, so you can `ORDER BY rank DESC` and show the best results first. Indexing ties it together: a `GIN` index on the `tsvector` makes `@@` fast.

**Q: How do you make full-text search fast? What do you index?**

You never index the raw text column. You index the `tsvector`. The standard approach in Postgres 12+ is a stored generated column `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || body)) STORED` and then `CREATE INDEX ... USING GIN (search_vector)`. GIN stores lexeme → posting list, so lookup is a direct index scan, not a sequential scan. The index is used automatically when you write `WHERE search_vector @@ query`. If you use an expression index `USING GIN (to_tsvector(...))` instead, the WHERE clause must repeat the exact same expression to hit the index.

**Q: What is a generated column and why is it the preferred way to store the tsvector?**

A generated column is a column whose value Postgres computes from other columns and keeps in sync automatically. `STORED` means it is written to disk and can be indexed. For FTS this is ideal because the tsvector always reflects the current title and body — no trigger to forget, no application code to update it, no stale index entries after an UPDATE. Before generated columns, you had to use a trigger function that called `to_tsvector` on insert/update, which worked but was more moving parts and easier to misconfigure.

**Q: What are language configurations and why do they matter? What happens if they do not match?**

A text search configuration names the parser, the dictionaries, and the stop-word list. `english` knows to stem "running" to "run" and to ignore "the". `simple` just lowercases. `french` has different stemming rules. When you build the tsvector with `english` but query with `simple`, the lexemes do not line up — the query looks for "running" but the index stores "run", so you get zero matches even though the document is right there. The rule is simple: the configuration in `to_tsvector` and in `to_tsquery` / `plainto_tsquery` / `websearch_to_tsquery` must be the same. Pick one per column and stick to it, or store a separate tsvector per language if you need multilingual search.

**Q: How do you handle raw user input safely? What is the difference between to_tsquery, plainto_tsquery, and websearch_to_tsquery?**

`to_tsquery` expects you to write the boolean syntax yourself. If a user types `hello )` or an unbalanced quote, it throws a syntax error and your query crashes. Never pass unchecked user input to it. `plainto_tsquery` treats the entire input as plain text, splits it into lexemes, and ANDs them together — `plainto_tsquery('english', 'hello world')` becomes `'hello' & 'world'`. It never crashes on user input. `websearch_to_tsquery` does the same but also understands web conventions: quoted phrases (`"red shoes"` → `red <-> shoe`), `-` for NOT, and `OR`. In production, `websearch_to_tsquery` is usually the right default for a search box. Use `to_tsquery` only when you are building the query programmatically and control the syntax.

**Q: How does ranking work? Do you need it?**

Yes — without ranking, search feels random. `ts_rank(vector, query)` returns a float based on how many times the query lexemes appear, how rare they are, how close together they are, and the weight you assigned with `setweight`. A title match with weight `'A'` scores higher than a body match with weight `'D'`. `ts_rank_cd` (cover density) additionally rewards documents where the query terms appear close together. Neither score is an absolute relevance percentage — it is only meaningful for ordering results for the same query. Always `ORDER BY ts_rank(...) DESC` and combine it with `ts_headline` to show highlighted snippets.

**Q: GIN vs GiST for full-text search — which do you pick?**

GIN is the default for FTS. It is larger and slower to update because each lexeme points to many rows, but lookups are very fast and results are exact. GiST is smaller and faster to write, but lookups are slower and may return false positives that Postgres has to recheck against the heap. For a search-heavy table where reads dominate, use GIN. If your table has extremely high write throughput and you can tolerate slower searches, GiST is worth measuring. Most teams choose GIN and accept the write cost.

**Q: When should you stay with Postgres FTS and when should you move to Elasticsearch or similar?**

Stay in Postgres when your data already lives there, your corpus is up to a few million to low tens of millions of rows, you need transactional consistency (a row is searchable the instant you commit), and your requirements are boolean queries, phrase search, simple ranking, and highlighting. The operational cost is near zero — it is just an index. Move to an external engine when you need typo tolerance and fuzzy matching, autocomplete at very high throughput, faceting and aggregations across large result sets, per-field analyzers in many languages, or horizontal scaling beyond what one Postgres instance can handle. The price of an external engine is a second system to sync, monitor, and keep consistent — new rows have a lag before they appear in search, and you have to handle that gap in your application.

## 6. The Traps — What Goes Wrong in Production

**Trap 1 — Thinking LIKE with a B-tree index will save you.**
The mistake is adding `CREATE INDEX idx_name ON products (name)` and assuming `WHERE name ILIKE '%run%'` will use it. It will not. A B-tree sorts by the full string value, but `%run%` can appear anywhere inside the string, so the index cannot narrow the scan. Postgres falls back to a sequential scan every time. The symptom is search that was instant with 10K rows becomes seconds with 1M rows and your `EXPLAIN` always shows `Seq Scan`. Fix it by switching to a `tsvector` + `GIN` index and querying with `@@`, or if you truly need substring search (not word search), use the `pg_trgm` extension with a GIN trigram index — but recognize that is a different tool with different relevance behavior.

**Trap 2 — Creating the GIN index on the raw text column.**
You write `CREATE INDEX ... USING GIN (title)` or `USING GIN (title gin_trgm_ops)` and wonder why `search_vector @@ query` is still slow. That index is on the wrong thing. FTS only uses a GIN index built on a `tsvector`. The query `WHERE search_vector @@ query` can only use an index on `search_vector`. If you indexed `title` directly, Postgres ignores it for FTS and scans anyway. Fix it by indexing the generated `tsvector` column or the exact `to_tsvector(...)` expression, and verify with `EXPLAIN` that you see `Bitmap Index Scan on idx_articles_search`.

**Trap 3 — Indexing with one language and querying with another.**
You build the vector with `to_tsvector('english', body)` but search with `plainto_tsquery('simple', 'running')`. The vector stores `'run'`, the query looks for `'running'`, nothing matches, and you conclude FTS is broken. This is especially common when you rely on the default `default_text_search_config` and different sessions have different defaults. The fix is to always pass the config explicitly on both sides and keep them identical: `to_tsvector('english', ...)` and `plainto_tsquery('english', ...)` together. If you support multiple languages, store one tsvector per language or use a language column to choose the config per row.

**Trap 4 — Passing raw user input to `to_tsquery` and crashing.**
You do `to_tsquery('english', userInput)` where `userInput` is `"hello &"` typed by a user. Postgres throws `syntax error in tsquery: "hello &"` and your API returns a 500. Users can break your search with any special character. The fix is to never feed unchecked input to `to_tsquery`. Use `plainto_tsquery` or `websearch_to_tsquery` for anything that comes from a user, and reserve `to_tsquery` for queries you build in code where you control the operators.

**Trap 5 — Forgetting to rank, or treating `ts_rank` as an absolute score.**
You write `WHERE search_vector @@ query` without `ORDER BY` and users see a random matching row first — sometimes the worst result is on top. Or you try to filter with `WHERE ts_rank(...) > 0.5` thinking 0.5 means "relevant enough", but rank is not a probability. It is only comparable within the same query. A score of 0.1 might be the best result for one query and a terrible result for another. The fix is to always `ORDER BY ts_rank(search_vector, query) DESC` and paginate, and never use rank as a threshold without measuring on your actual data. If you need a cutoff, add a separate signal like a minimum term count.

**Trap 6 — Stale tsvectors because you stored the vector manually without a generated column or trigger.**
You add a `tsvector` column, populate it once with `UPDATE ... SET search_vector = to_tsvector(...)`, create the GIN index, and everything looks great. A week later users complain that updated articles are not found under their new titles. The tsvector was never updated after the initial backfill. On insert and on every UPDATE to the source columns, the vector must be recomputed. The clean fix is a `GENERATED ALWAYS AS (...) STORED` column. If you are on an older Postgres without that feature, add a `BEFORE INSERT OR UPDATE` trigger that recomputes the vector.

**Trap 7 — Expecting Postgres FTS to give you fuzzy search and typo tolerance for free.**
You assume searching for "runing" (typo) will find "running" because FTS does stemming. It will not. FTS normalizes correct words to lexemes, but it does not correct misspellings or do edit-distance matching. A typo produces a different lexeme that does not match. If you need "did you mean" or typo tolerance, you need `pg_trgm` with similarity, or an external engine with fuzzy queries, or a separate spell-correction step. Knowing this boundary keeps you from promising search behavior Postgres FTS was never built to deliver.

## 7. Compare With Related Concepts

**ILIKE / LIKE vs Postgres FTS**
ILIKE scans raw characters and checks substrings — it has no concept of words. FTS parses words, stems them, and matches lexemes via an inverted index. Use ILIKE only for exact substring checks on small tables or for prefix searches with a trigram index; use FTS for any real word-based search with ranking.
Rule: if the user typed words and expects "run" to find "running" with best results first, that is FTS, not ILIKE.

**GIN vs GiST for FTS**
Both can index tsvectors. GIN is larger and slower to update but gives very fast, exact lookups. GiST is smaller and faster to update but lookups are slower and may need rechecking. Rule: use GIN for FTS unless you have proven write-throughput pain and have measured that GiST helps.

**to_tsquery vs plainto_tsquery vs websearch_to_tsquery**
`to_tsquery` is for developer-controlled boolean syntax — powerful but crashes on bad input. `plainto_tsquery` is for safe plain user text — splits and ANDs. `websearch_to_tsquery` is for a search box that should understand quotes and `-` like a web search. Rule: user input goes to `websearch_to_tsquery` or `plainto_tsquery`; `to_tsquery` is only for queries you build yourself.

**Postgres FTS vs pg_trgm (trigram) search**
FTS is word-aware with stemming, ranking, and phrase queries. `pg_trgm` is character-aware — it finds similar strings by overlapping 3-character chunks, which gives substring and fuzzy matching but no linguistic understanding. Rule: use FTS for natural-language word search; use `pg_trgm` when you need `ILIKE '%substring%'` to be fast or need typo-tolerant similarity.

**Postgres FTS vs Elasticsearch / OpenSearch / Typesense**
Postgres FTS runs inside your database, is transactionally consistent, and costs almost nothing operationally. An external engine scales further, handles typos, facets, and complex analyzers better, but is a second distributed system with sync lag and its own failure modes. Rule: stay in Postgres until you can name a specific capability you need that it cannot deliver at your scale.

## 8. 🧠 The Memory Hook

ILIKE scans every page. FTS builds a card catalog first: `to_tsvector` makes the cards, `to_tsquery` asks the question the same way, `@@` matches, `ts_rank` sorts the best to the top, and a `GIN` index on the `tsvector` is the drawer that makes the whole thing instant.
