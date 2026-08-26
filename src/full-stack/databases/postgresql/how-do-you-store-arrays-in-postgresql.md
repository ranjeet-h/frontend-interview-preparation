# How do you store arrays in PostgreSQL

## 1. The Real-World Problem — When You Actually Hit This

Your product catalog has been running fine for months. Every product row has a `categories` column that holds a comma-separated string like `"electronics,audio,bluetooth"`. Then marketing asks for a simple report: show me every product in the `audio` category.

You write `WHERE categories LIKE '%audio%'`. Two things go wrong. First, the results are subtly wrong — a product categorized as `"audiobooks"` sneaks in because `'%audio%'` matches inside other words. Second, it takes four seconds, because a leading wildcard can never use an index, so Postgres reads every one of your two million rows, every time anyone runs this filter.

This exact pain is why PostgreSQL has a real array type. Most developers never learn it, so they either keep hacking strings (wrong results, slow scans) or jump straight to a full junction table (extra joins, extra boilerplate) even for cases where a simple list on the row was the right call. This page is about knowing which situation you're in.

## 2. The Analogy — Make the Mechanic Obvious

Think of each database row as a recipe card in a big box of recipes.

On each card, next to the title, there's an ingredients line written right on the card: "flour, eggs, milk". That line is the array column. When you want to see a recipe, you pull the card and everything is there in one glance — no trips anywhere else. That's why reading a row with an array column needs no join: the list physically lives on the row.

But now suppose you want "every recipe that uses saffron". Reading cards one by one is hopeless — you'd flip through the whole box. So you buy a proper index booklet at the back of the box: "saffron → cards 12, 44, 91". Each ingredient points straight to the cards that contain it. That booklet is a GIN index — it literally stands for Generalized Inverted Index, an ingredient-to-cards map instead of a cards-to-ingredients map.

There's a third option in the kitchen: instead of writing ingredients on cards, you keep a ledger at the front desk where every line pairs one card number with one ingredient from your approved supplier catalog. Want a recipe's ingredients? Cross-reference the ledger. Want all saffron recipes? Scan one section of the ledger. And crucially, because every ledger line points at the official catalog, nobody can write down an ingredient that doesn't exist. That ledger is the junction table.

Each part maps cleanly: the ingredients line is `text[]`, the index booklet is a GIN index, the ledger is a junction table, and the rule "handwriting on a card can't be checked against the supplier catalog" is exactly the rule "array elements can't have foreign keys".

## 3. The Full Explanation — How It Actually Works

PostgreSQL lets any column hold an array of almost any type: `text[]`, `integer[]`, `uuid[]`, even two-dimensional arrays like `integer[][]` (rarely useful, but they exist). An array column is one value inside the row, just like a `text` column — except that value holds an ordered list of elements. Order is preserved and duplicates are allowed, which matters more than people expect: a list of steps or a ranked list of preferences is trivial with an array and awkward with a junction table (you'd need a position column and careful constraint work).

Writing and reading uses curly braces or the `ARRAY[...]` constructor, and access starts at 1, not 0 — `tags[1]` is the first element. That 1-based indexing surprises everyone coming from JavaScript or Python, and it's a classic interview gotcha.

Querying inside arrays is where the real decisions live. There are three operators worth memorizing alongside the membership check:

- `@>` (contains): left side holds all elements of the right side — `tags @> ARRAY['sql','perf']`
- `<@` (contained by): left side is inside the right side — `my_tags <@ allowed_tags`
- `&&` (overlaps): the two arrays share at least one element

Plus the plain membership form `'postgres' = ANY(tags)`, which reads naturally as "does any element equal postgres?".

Here's the catch that connects back to our analogy: without an index, every one of these checks opens the card and reads the ingredients line. On a large table that's a sequential scan — Postgres examines every row's array. A regular B-tree index doesn't help here, because a B-tree indexes one sortable value per entry, not "which rows contain element X somewhere inside their list". This is precisely the problem GIN indexes solve. A GIN index flips the structure: it stores one entry per element, pointing to the rows that contain it. Create it with `USING gin (tags)` and suddenly `@>`, `<@`, and `&&` become fast lookups instead of full scans. There's a dedicated page on [GIN indexes](what-is-gin-index.md) if you want the internal layout; for this topic the key fact is that array containment queries and GIN indexes are made for each other.

The escape hatch from "list-shaped data stuck inside one value" is `unnest()`. It takes an array and explodes it into one row per element, so the list temporarily becomes a table you can join, group, and aggregate. Want to know which tags appear most across all products? Unnest every product's tags into rows and count them. This function is usually the moment arrays "click" for people — the data isn't trapped; you can flatten it whenever relational tools are the better shape.

Now the honest trade-offs, because this is where senior answers separate from junior ones.

First, normalization. First normal form in its strict reading says every attribute holds atomic values, and a queried-inside array is not atomic. So yes, an array column technically bends 1NF. But "atomic" is about how you use the data, not the storage format. If a list of tags is treated as one attribute of the row — always read together, filtered by membership, never joined against other tables — it behaves atomically in practice and an array is fine. The moment you're running rich queries inside the list, enforcing rules per element, or joining elements to other tables, the list has stopped being an attribute and started being a hidden table. Put it in a real table.

Second, integrity. Array elements can't carry foreign keys. Write `assigned_to uuid[]` full of user IDs and nothing stops a deleted user's ID from living there forever. There's also no unique constraint on elements — `ARRAY['a','a']` is legal. Junction-table rows get both for free.

Third, write cost. Under MVCC (Postgres's mechanism where updates create a new row version rather than editing in place), changing one element rewrites the entire array value — and the row version along with it. Update one tag on a row whose array is large enough to be TOASTed out of the main row, and you pay to rewrite the whole stored value. High-frequency single-element writes are junction-table territory, where updating one membership touches one tiny row.

So the decision rule is: arrays win when the list is truly atomic — smallish, stable-ish, tag-like, read whole, filtered by membership. Junction tables win when elements need integrity, metadata, uniqueness, or frequent individual updates. JSONB wins when it isn't really a list of values at all but a blob of nested, keyed, heterogeneous data — that comparison has its own page at [JSON vs JSONB](json-vs-jsonb.md).

One practical note for full-stack work: modern ORMs handle array columns well — Django has `ArrayField`, SQLAlchemy has `ARRAY`, Prisma calls them scalar lists — so choosing arrays doesn't mean dropping out of your ORM. Just check how your layer serializes empty arrays versus NULLs before shipping.

## 4. See It In Practice — Real Code or Queries

All of this runs as-is in any recent PostgreSQL.

```sql
-- Declare the array column. Default '{}' means "empty list", not NULL.
CREATE TABLE articles (
  id    bigserial PRIMARY KEY,
  title text    NOT NULL,
  tags  text[]  NOT NULL DEFAULT '{}'
);

-- Two equivalent ways to insert. ARRAY[...] is preferred in app code
-- because it quotes elements normally instead of nesting quotes in a string.
INSERT INTO articles (title, tags) VALUES
  ('Why N+1 queries happen', ARRAY['postgres', 'performance', 'sql']),
  ('Intro to Redis streams', ARRAY['redis', 'streams']);

INSERT INTO articles (title, tags)
VALUES ('Legacy style', '{"postgres","beginner"}');
```

```sql
-- Membership: "does any element equal postgres?"
-- Reads left-to-right as: postgres equals SOME element of tags.
SELECT * FROM articles WHERE 'postgres' = ANY(tags);

-- Containment: tags must include BOTH sql AND performance.
-- This is the form a GIN index serves fastest for multi-element filters.
SELECT * FROM articles WHERE tags @> ARRAY['sql', 'performance'];

-- Overlap: shares AT LEAST ONE element with the given list.
SELECT * FROM articles WHERE tags && ARRAY['redis', 'performance'];

-- Reverse containment: my search terms fully cover this article's tags.
SELECT * FROM articles WHERE tags <@ ARRAY['postgres', 'performance', 'sql'];

-- Element access is 1-based. tags[0] is silently NULL, not an error.
SELECT title, tags[1] AS first_tag FROM articles;

-- Size of the list.
SELECT title, cardinality(tags) AS tag_count FROM articles;
```

```sql
-- Without this index, every @>/&&/<@ above is a sequential scan.
-- With it, Postgres looks up "rows containing element X" directly,
-- like the ingredient booklet in the analogy.
CREATE INDEX idx_articles_tags ON articles USING gin (tags);
```

```sql
-- unnest(): explode the list into rows, then use normal SQL on it.
-- Implicit LATERAL: unnest sees the current row's tags.
SELECT tag, count(*) AS usage_count
FROM articles, unnest(tags) AS tag
GROUP BY tag
ORDER BY usage_count DESC;

-- Whole-list updates: append, remove, or replace.
UPDATE articles SET tags = array_append(tags, 'draft')      WHERE id = 1;
UPDATE articles SET tags = array_remove(tags, 'deprecated') WHERE id = 1;
UPDATE articles SET tags = ARRAY['final', 'v2']             WHERE id = 1;
```

That last replace-style update is the honest one to remember: even a positional change like `SET tags[2] = 'x'` produces a whole new array value and a new row version. Arrays are cheap to read and filter; they're not designed for surgical in-place edits.

## 5. Interview Questions — All of Them, Done Properly

**Q: How would you model "each product has a list of tags" — and when would you refuse the array?**

I'd reach for a `text[]` column with a GIN index when the tags are pure labels on the product: read together with the product, filtered with `@>`, no lifecycle of their own. I'd switch to a junction table the moment any of these becomes true: tags are shared entities managed elsewhere (so I need a foreign key from product-tag to tag), I need per-relationship data like `added_by` or `added_at`, I need to guarantee a tag appears at most once per product, or tags mutate individually at high frequency. The array optimizes the read of the whole list with the row; the junction table optimizes integrity and per-element operations. Saying both halves — not just picking one — is what the interviewer is listening for.

**Q: What's the difference between `= ANY()` and `@>` for querying arrays?**

`'postgres' = ANY(tags)` asks a yes/no question per row: does some element equal exactly this one value? `tags @> ARRAY['postgres', 'sql']` asks whether the array contains all of several values, and it generalizes to the family of containment operators (`<@`, `&&`) that GIN indexes serve efficiently. In practice: single-element membership can use either, though `= ANY` reads more naturally; multi-element conditions need `@>`. There's a second meaning of `ANY` worth knowing too: `id = ANY(ARRAY[1, 2, 3])` is the same shape as `IN (1, 2, 3)` — there the array is the search set, not the stored column. Same keyword, both directions of the "is this in that?" question.

**Q: Can you index an array column? Why GIN and not a normal B-tree?**

Yes — with a GIN index: `CREATE INDEX ... USING gin (tags)`. A B-tree stores one entry per row keyed by one comparable value, which fits "salary = 50000" but can't answer "which rows contain 'postgres' somewhere inside their list" without scanning entries. A GIN index inverts that: one entry per distinct element, each pointing to the rows containing it, like the index at the back of a book mapping a word to page numbers. After creating it, `@>`, `<@`, and `&&` go from sequential scans to direct lookups. Worth adding: verify with `EXPLAIN ANALYZE` that the planner actually chose the index, and know that GIN indexes are bigger and slower to update than B-trees — the usual trade of write cost for read speed.

**Q: Doesn't an array column violate first normal form?**

In the strict textbook reading, yes — 1NF says attribute values are atomic, and a list you query inside is not atomic. My practical answer is that atomicity depends on how the data is used, not how it's stored. If the list is only ever consumed as one unit — displayed with the row, filtered by membership, aggregated via `unnest` occasionally — it functions as a single attribute and the denormalization is deliberate and safe. If I find myself needing per-element constraints, joins from elements to other tables, or element-level updates in hot paths, the list has effectively become a relation wearing a disguise, and I normalize it into a real table. Interviewers ask this to see whether you know the rule and know when it's a trade-off rather than a law.

**Q: What does `unnest()` do? Give a real use case.**

It expands an array into one row per element, turning the list into something ordinary SQL can group, join, and sort. Real example: our analytics wanted "top 20 tags across all articles". No amount of `WHERE` clauses does that — you need every element as its own row. `SELECT tag, count(*) FROM articles, unnest(tags) AS tag GROUP BY tag ORDER BY count(*) DESC LIMIT 20;` does it in one query. It also shines for joins: unnest a `product_ids` array and join to the products table when you consciously accept the no-FK trade-off and just need a read-time expansion.

**Q: What actually happens internally when you UPDATE one element of an array?**

Postgres doesn't edit values in place — MVCC creates a new row version for every update. Since the array is one value, changing element 3 means constructing the entire new array and writing it as part of the new row version; the old version stays until vacuum cleans it up. For small arrays this is negligible. For big arrays — thousands of elements, possibly TOASTed into out-of-line storage — one logical "change one item" becomes an expensive physical rewrite, plus WAL volume, plus table bloat. That's the mechanical reason high-frequency single-element mutations belong in a junction table, where an update touches a small dedicated row.

**Q: Array column or JSONB — how do you choose for a list of values?**

Ask whether the data is a list of typed values or a structure with named parts. `text[]` gives you real elements of one declared type, order, duplicates, array operators, and GIN support — right for `tags`, `permissions`, `steps`. JSONB gives you arbitrary nesting, mixed types, and keys — right for `{"sizes": {"us": 10, "eu": 42}, "meta": {...}}` blobs whose shape the schema can't promise. If you catch yourself storing JSONB arrays of scalars like `[\"a\", \"b\"]` just to hold strings, you've lost the type and gained nothing — that's `text[]` territory. The fuller comparison lives on the JSON vs JSONB page, but the one-liner is: same-type list → array; keyed structure → JSONB; elements with identity → junction table.

## 6. The Traps — What Goes Wrong in Production

**Storing IDs in an array that later need referential integrity.** The wrong assumption: "`team_members uuid[]` is simpler than a junction table, and I can always migrate later." It's wrong because array elements can't have foreign keys — nothing stops a member row from holding user IDs that were deleted last week, and nothing enforces that an ID exists at insert time. What happens: months later the profile page renders "Unknown user" for ghosts, reporting counts drift from reality, and the cleanup migration everyone postponed is now a data-repair project. The fix: if elements reference other tables, they're relationships — give them rows in a junction table with a real FK. Keep arrays for self-contained label-like data.

**Writing `WHERE ANY(tags) = 'postgres'`.** People translate "does any element match?" literally into SQL and put `ANY` first. Postgres rejects it with a syntax error, because `ANY` constructs aren't standalone operands on the left. The working forms are `'postgres' = ANY(tags)` (value compared against each element) or `tags @> ARRAY['postgres']` (containment). Small thing, but fumbling it in a live coding round costs confidence — know both directions cold.

**Assuming zero-based indexing.** Every mainstream language indexes from zero, so developers write `tags[0]` expecting the first element and get `NULL` back — no error, just silence. The bug then hides until a UI shows blank first-tags or a check like `WHERE tags[0] IS NOT NULL` filters wrongly. PostgreSQL arrays are 1-based: `tags[1]`. Out-of-range indexes return NULL rather than raising an error, which is exactly why this fails quietly instead of loudly.

**Filtering with `@>` on a big table and wondering why it's slow.** The wrong assumption: "it's a proper column, so it's indexed." Nothing is indexed until you create an index, and a plain B-tree won't serve containment anyway. What actually happens: every query does a sequential scan, reading and checking every row's array — fine at ten thousand rows, painful at ten million. The fix is `CREATE INDEX ... USING gin (tags)`, then confirm with `EXPLAIN ANALYZE` that plans changed. If someone tells you "we indexed the tags column" in an interview, the follow-up question "with which index type?" is where this trap gets exposed.

**Treating array updates as cheap surgical edits.** The wrong assumption: changing one element touches one element. Reality: the whole array value is rewritten and a new row version created (the MVCC behavior from above), so hot loops doing `array_append` per event cause bloat, WAL churn, and vacuum pressure that shows up days later as mysterious slowdown. The fix is architectural, not a tweak: per-element mutation at high frequency means the list wants to be rows. Related silent surprise: arrays allow duplicates and can't enforce uniqueness on elements — deduplication is your application's job, or another argument for the junction table.

## 7. Compare With Related Concepts

**Array column vs junction table.** The array keeps the list on the row itself — one read, no join, order and duplicates preserved, but no foreign keys, no per-element constraints, and whole-value rewrite on update. The junction table gives each element a row — real FKs, uniqueness, metadata like timestamps, cheap per-element updates, at the cost of joins and more code. Rule: self-contained labels → array; elements that reference other entities or have their own lifecycle → junction table.

**Array column vs JSONB.** An array is typed and flat: every element is the declared type, queried with array operators. JSONB is schemaless: nested objects, mixed shapes, queried with path operators, compared in detail on the [JSON vs JSONB](json-vs-jsonb.md) page. Rule: list of same-type values → `text[]`; nested keyed document with unpredictable shape → JSONB.

**Array vs comma-separated string.** The string is the anti-pattern from the opening story: substring matching gives false positives (`'%api%'` matches "rapid"), no type safety, no real operators, no indexable containment. Rule: never encode a list in a delimited string when the database offers a native array — the array is the same convenience with correctness built in.

## 8. 🧠 The Memory Hook

An array is a list written right on the recipe card — perfect when you always read the whole card, painful the moment you need to interrogate the ingredients. The day you catch yourself asking "but does this value still *exist*?", that value has stopped being an ingredient and become an entity — move it off the card and into its own table.
