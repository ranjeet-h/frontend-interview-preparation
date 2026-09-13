# How Do You Query JSONB Fields

## 1. The Real-World Problem — When You Actually Hit This

Your team stores product details in an `attributes jsonb` column because different categories need different fields — shoes have sizes, phones have storage, courses have lesson counts. It worked beautifully for months. Then someone builds an admin dashboard with a filter: "show me products where `specs.waterproof` is true and price is over 100."

On your laptop with 500 seeded rows, the query comes back instantly. In production with 40 million rows, the dashboard spins until it times out, and the DBA pings you: every request for this page is doing a full sequential scan of the biggest table in the database. So a teammate "fixes" the price filter by writing `attributes ->> 'price' > 100`. Now it runs — and quietly returns wrong rows, because that comparison compares two pieces of text, and the text `'99'` sorts after `'100'`.

This is the exact moment most developers discover that querying JSONB is really three skills bundled together: knowing which operator pulls data out versus which asks a yes/no question, knowing that extracted values come back as text unless you intervene, and knowing that none of these queries go fast without the right index. Get all three right and JSONB is one of Postgres's best features. Miss one and you get silent wrong results or a production outage.

## 2. The Analogy — Make the Mechanic Obvious

Picture a warehouse where every product ships in a box, and inside each box there are smaller labeled compartments — "brand", "price", "specs" — some holding further nested compartments. Each database row is one sealed box sitting on a shelf. Nothing inside is visible from outside; the label on the shelf just says which row it is.

Now meet the workers who answer your questions:

**The picker (`->`)** opens a compartment and hands you whatever is inside *exactly as packed* — still wrapped in its own packaging. If the compartment held a small box (a nested object) or a bundle (an array), you receive that box or bundle, packaging included.

**The unpacker (`->>`)** does the same trip but unwraps the item before handing it over. What reaches your hands is always the bare item described on a slip of paper — plain text, no packaging. Handy for reading, useless if you needed the original box.

**The route-list runner (`#>`)** takes an itinerary like "specs → weight" in one instruction and follows the whole route in a single trip, instead of opening one level per request.

**The manifest checker (`@>`)** answers a different kind of question entirely: "does your box contain this exact smaller packing list?" You hand them a mini-manifest — brand Acme, specs says waterproof — and they check whether that complete structure sits somewhere inside their box, nested compartments and all. Not "do these values appear anywhere" — the structure has to match as a unit.

**The label checker (`?`)** answers the cheapest possible question: "is there a compartment with this label?" They don't open anything. They just glance at whether the label exists.

And then there are two ways the warehouse finds boxes without opening all forty million of them. **The front-desk ledger (the GIN index)** records every single label and value found inside any box, so a question like "which boxes contain waterproof specs?" becomes a lookup in the ledger instead of opening every carton. Separately, **printing one hot attribute on the outside of each box (an expression index)** lets the sorting machine find and order boxes by that one attribute — something the ledger can't do, because the ledger knows what's *inside* boxes but doesn't keep them sorted.

Keep this warehouse in mind — every operator below is one of these workers.

## 3. The Full Explanation — How It Actually Works

Every JSONB query you will ever write is one of two kinds: **extraction** ("hand me what's inside") or **matching** ("yes/no, does this row qualify"). Postgres splits the operators cleanly along that line, and mixing them up is the source of almost every JSONB bug.

Start with extraction. The `->` operator takes a key name and returns the value *as JSON* — if the value is an object or array, you get the actual nested structure back, so you can chain another `->` onto it: `attributes -> 'specs' -> 'waterproof'`. The `->>` operator (two arrows) does the identical lookup but converts the final result to **text**. One arrow keeps the parcel wrapped; two arrows unwrap it. Because `->>` output is text, a number stored as `129.99` arrives as the *string* `'129.99'`, and comparing strings is not comparing numbers — `'99'` sorts lexicographically after `'100'`. This is the single most common JSONB mistake in production code. When you need math or ordering, you must cast: `(attributes ->> 'price')::numeric`. The `#>` and `#>>` variants take a whole path as an array — `attributes #>> '{specs,weight_g}'` — which is just `->>` with the intermediate steps folded into one argument. Two details worth memorizing: paths in `#>` form use zero-based array indices (unlike normal Postgres arrays, which are one-based), and a missing key never throws an error — it returns SQL NULL, silently.

Matching operators ask yes/no questions, and here the crucial distinction is **containment versus equality versus existence**. Whole-document equality (`attributes = '{"brand":"Acme"}'`) is true only when the two documents match completely — every key, every value, nothing extra on either side. Key order doesn't matter (JSONB normalizes that away), but any additional field makes it false. Nobody wants that for filtering; it's for exact snapshots. What you almost always want is **containment**, the `@>` operator: `attributes @> '{"specs":{"waterproof":true}}'` asks "is this structure nested somewhere inside yours?" — partial match allowed, nesting respected. It composes multiple conditions naturally: `@> '{"brand":"Acme","specs":{"waterproof":true}}'` means both facts must hold. One subtlety people learn the hard way: when the right side is an array, containment checks elements **as a subsequence in the listed order** — `'["a","b","c"]' @> '["a","c"]'` is true, but `@> '["c","a"]'` is false. Arrays are ordered structures in JSONB, so the checker honors order. The existence family is cheaper still: `attributes ? 'tags'` asks whether a top-level key (or a *string* element in a top-level array) merely exists — no content check at all — with `?|` meaning "any of these labels" and `?&` meaning "all of them".

When conditions get complicated — "any size greater than 9", "specs whose waterproof flag is true" — plain operators get clumsy, and Postgres offers its built-in query language for JSON, called **JSONPath**, available from PostgreSQL 12 onward. Functions like `jsonb_path_query(document, '$.sizes[*] ? (@ >= 10)')` walk the document with a path expression and apply filters *inside* the document, returning every match as a set of rows; `jsonb_path_query_first` stops at the first match; `jsonb_path_exists` (or its operator shorthand `payload @? '$.specs ? (@.waterproof == true)'`) just answers true/false. Inside JSONPath, strings use double quotes and equality is `==`. By default paths run in strict mode and error on type surprises, so for messy real-world documents prefix the path with `lax` to skip mismatches instead of failing.

Extraction and matching behave completely differently with indexes, and this is where the dashboard timeout story gets resolved. A **GIN index** (Generalized Inverted Index — the front-desk ledger) indexes *every key and value inside every document*; the internal inverted-index machinery that makes it possible gets full treatment on [what is a GIN index](./what-is-gin-index.md). Once `USING gin (attributes)` exists, Postgres can answer `@>`, `?`, `?|`, `?&`, and `@?` by looking up candidates in the ledger instead of opening all 40 million boxes. There are two flavors worth knowing: the default `jsonb_ops` class supports all those operators, while `jsonb_path_ops` indexes only enough to answer containment-style questions (`@>`, `@@`, `@?`) — it's noticeably smaller and faster for pure containment workloads, but it cannot answer `?` label checks at all. Here's the boundary that bites people: **GIN cannot serve extraction predicates**. A query like `WHERE attributes ->> 'brand' = 'Acme'` extracts text first and compares afterward, so the ledger is useless to it — that query still reads every row even with a GIN index present. Either rewrite the predicate as containment (`attributes @> '{"brand":"Acme"}'`) or build a **b-tree expression index**: `CREATE INDEX ON products ((attributes ->> 'brand'))`, which materializes that extracted value into an ordinary sortable index. B-trees give you what GIN can't — equality *and* range scans *and* `ORDER BY` — but only for the exact expressions you indexed.

That last point leads to the architectural judgment call interviewers actually probe: **when to promote hot keys out of JSONB into real columns**. The signals are concrete — a key appears in most queries against the table, you filter/sort/join on it, you need proper types (numeric comparisons, date arithmetic), you want constraints like NOT NULL or foreign keys, or the ORM and BI tools fight you on nested access. Then you either add a real column (backfilling with an `UPDATE ... SET brand = attributes->>'brand'` plus app-side writes) or a generated column — PostgreSQL 12+ supports `ADD COLUMN brand text GENERATED ALWAYS AS (attributes ->> 'brand') STORED` — which stays in sync automatically and can carry its own b-tree index. Keep genuinely schema-flexible data in the JSONB; promote the stable, hot spine of your model to columns. The costs you're balancing: GIN indexes grow large and make every write slower, because inserting or updating a row updates ledger entries for *every* key and value in the document — and updating even one key inside a JSONB document rewrites the whole value, leaving dead row versions behind for autovacuum to clean up. Deep storage-format mechanics live on the sibling [what is JSONB](./what-is-jsonb.md) page, the write-cost side effects connect to [what is vacuum](./what-is-vacuum.md), and reading plans to confirm which index fired is covered in [what is EXPLAIN ANALYZE](./what-is-explain-analyze.md).

One security note that belongs on every page about building queries: all of these operators parameterize normally — pass user input as bind parameters, never interpolate strings into the SQL, and don't concatenate user input into JSONPath strings either. That's ordinary injection discipline, applied to a fancier query shape.

## 4. See It In Practice — Real Code or Queries

All examples are PostgreSQL 12+ (JSONPath needs 12; everything else works on 9.4+). Setup first:

```sql
CREATE TABLE products (
    id          bigserial PRIMARY KEY,
    name        text NOT NULL,
    attributes  jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO products (name, attributes) VALUES
('Trail Shoe',   '{"brand":"Acme","price":129.99,"sizes":[8,9,10],
                   "specs":{"waterproof":true,"weight_g":310}}'),
('City Sneaker', '{"brand":"Acme","price":79.00,"sizes":[7,8],
                   "specs":{"waterproof":false,"weight_g":250}}'),
('Winter Boot',  '{"brand":"NorthPeak","price":199.50,"sizes":[9,10,11],
                   "tags":["winter","sale"],
                   "specs":{"waterproof":true,"weight_g":900}}');
```

**Extraction — one arrow keeps JSON, two arrows give text, `#>>` folds the path:**

```sql
-- Returns actual jsonb: {"waterproof": true, "weight_g": 310}
SELECT attributes -> 'specs' FROM products WHERE id = 1;

-- Chained, then unwrapped once at the end -> text: true
-- (only the LAST step needs ->>; intermediate steps stay ->)
SELECT attributes -> 'specs' ->> 'waterproof' FROM products WHERE id = 1;

-- Same result as the chain, one trip: 310
SELECT attributes #>> '{specs,weight_g}' FROM products WHERE id = 1;
```

**Filtering on numbers — cast, or compare garbage:**

```sql
-- Wrong: compares text. '99' > '100' is TRUE lexicographically.
SELECT name FROM products WHERE attributes ->> 'price' > '100';

-- Right: cast the extracted text to a number first.
SELECT name FROM products WHERE (attributes ->> 'price')::numeric > 100;
-- Trail Shoe (129.99) and Winter Boot (199.50)
```

**Containment — the structural yes/no question:**

```sql
-- Nested match: brand AND waterproof spec must BOTH hold.
SELECT name FROM products
WHERE attributes @> '{"brand":"Acme","specs":{"waterproof":true}}';
-- Trail Shoe only (City Sneaker is waterproof:false)

-- Array containment respects order (subsequence semantics):
SELECT '["a","b","c"]'::jsonb @> '["a","c"]';  -- true
SELECT '["a","b","c"]'::jsonb @> '["c","a"]';  -- false
```

**Existence — cheapest checks, no content inspection:**

```sql
-- Top-level key exists?
SELECT name FROM products WHERE attributes ? 'tags';            -- Winter Boot

-- Any of these keys exist?
SELECT name FROM products WHERE attributes ?| array['tags','sale'];

-- All of these keys exist?
SELECT name FROM products WHERE attributes ?& array['brand','price'];
```

**Numbers inside arrays — `?` won't help you, containment will:**

```sql
-- Does NOT work: ? matches STRING elements only, sizes holds numbers.
SELECT name FROM products WHERE attributes -> 'sizes' ? '9';

-- Works: scalar containment checks actual values.
SELECT name FROM products WHERE attributes -> 'sizes' @> '9';
-- Trail Shoe and Winter Boot

-- Conditional matching inside the array: JSONPath territory.
SELECT name, jsonb_path_query(attributes, '$.sizes[*] ? (@ >= 10)')
FROM products
WHERE attributes @? '$.sizes[*] ? (@ >= 10)';
-- Winter Boot -> 10, 11 ; Trail Shoe -> 10
```

**Making it fast — the index decides everything:**

```sql
-- The ledger: serves @> ? ?| ?& and @?. Default jsonb_ops class.
CREATE INDEX idx_products_attributes ON products USING gin (attributes);

-- Leaner variant for pure-containment workloads: smaller and faster
-- for @>/@@/@?, but CANNOT answer ? label checks.
CREATE INDEX idx_products_attributes_path
    ON products USING gin (attributes jsonb_path_ops);

-- Hot attribute printed on the outside of the box: btree expression
-- index. Serves ->> 'brand' equality AND range scans AND ORDER BY —
-- things GIN structurally cannot do.
CREATE INDEX idx_products_brand ON products ((attributes ->> 'brand'));

-- Cast-aware variant so numeric range filters hit an index too.
CREATE INDEX idx_products_price ON products (((attributes ->> 'price')::numeric));

-- Verify the plan changed from Seq Scan to Bitmap Index Scan:
EXPLAIN ANALYZE SELECT name FROM products
WHERE attributes @> '{"specs":{"waterproof":true}}';
```

**Promoting a hot key without a painful migration — generated column:**

```sql
ALTER TABLE products
  ADD COLUMN brand text GENERATED ALWAYS AS (attributes ->> 'brand') STORED;

CREATE INDEX idx_products_brand_col ON products (brand);
```

Application frameworks reach these operators through raw fragments (Prisma `queryRaw`, TypeORM raw where clauses, Sequelize `where(jsonb_path_query(...))`) — the SQL above is the part worth internalizing; the wrapper syntax varies per ORM.

## 5. Interview Questions — All of Them, Done Properly

**Q: What's the difference between `->` and `->>`, and when do you use each?**

`->` returns the value as JSON, preserving its type and structure — objects stay objects, arrays stay arrays — which is what you need when chaining deeper lookups or when the caller genuinely wants structured output. `->>` returns the value as text, which is what you need when the value crosses into the SQL world: comparisons, casts, concatenation, output to a client expecting scalars. The rule I use: chain with `->` down to the last hop, then unwrap with `->>` exactly once — `attributes -> 'specs' ->> 'waterproof'`. And the moment a value is headed for math or ordering, `->>` alone isn't enough; you cast the result, because text comparison of numbers is silently wrong.

**Q: How do you safely filter on a number stored inside JSONB?**

Extract with `->>`, then cast: `WHERE (attributes ->> 'price')::numeric > 100`. Without the cast, Postgres compares two text values character by character, so `'99'` sorts after `'100'` and your result set is subtly wrong — the worst kind of bug because nothing errors. If that filter runs often, index the cast expression directly — `((attributes ->> 'price')::numeric)` — so range scans use a b-tree instead of touching every row. Worth adding: rows where the key is missing produce NULL through the cast, and `NULL > 100` is not true, so those rows drop out silently; decide deliberately whether that's the behavior you want.

**Q: Explain `=` versus `@>` versus `?` for JSONB.**

They answer three progressively looser questions. `=` asks "is the entire document exactly this?" — every key and value must match, nothing extra on either side; almost never what filtering wants. `@>` asks "does my smaller structure appear nested intact inside yours?" — extra fields are fine, nesting is honored, multiple conditions compose naturally; this is the workhorse for "has these properties" queries. `?` asks only "does this label exist at the top level (or as a string element of a top-level array)?" — no content inspection at all, the cheapest check. A senior tell is knowing they differ sharply in indexing too: GIN serves `@>` and `?`, while `=` on the whole document benefits from neither GIN nor much else — it's a snapshot-comparison tool, not a search tool.

**Q: Your JSONB query is slow on a large table. Walk me through fixing it.**

First I'd confirm the diagnosis with `EXPLAIN ANALYZE` rather than guess — nine times out of ten it says Seq Scan, meaning Postgres opened every row. If the predicate is containment or existence (`@>`, `?`, `?|`, `@?`), the fix is a GIN index on the column; Postgres then looks up matching rows in the inverted index instead of scanning. If the predicate is extraction-based (`->> 'x' = 'y'`), a GIN index won't fire — extraction happens per row after retrieval — so I either rewrite the predicate as containment (`attributes @> '{"x":"y"}'`) or add a b-tree expression index on the exact extraction expression, which also unlocks range filters and `ORDER BY` that GIN fundamentally can't serve. If the workload is heavy on both styles, I use both index types and accept the write cost, or better, promote the hottest keys to real columns and leave the long tail in JSONB. The choice between `jsonb_ops` and `jsonb_path_ops` GIN classes comes down to whether I ever need `?`-style label checks — `jsonb_path_ops` is smaller and faster but can't answer them.

**Q: When would you promote frequently-used JSONB keys to real columns?**

When a key stops being "flexible metadata" and starts being part of the table's identity: it shows up in most queries, gets filtered, sorted, or joined on, needs real typing (numeric ranges, timestamps with arithmetic), or needs constraints — NOT NULL, unique, foreign keys. At that point JSONB is paying flexibility tax without buying flexibility. The migration is low-risk with a generated column (`GENERATED ALWAYS AS (attributes ->> 'tenant_id') STORED`), which backfills, stays synchronized, and takes its own b-tree index. The counter-rule matters too: keys that vary per category, arrive from external payloads, or exist purely for display belong in the JSONB. Promote the stable spine; keep the long tail flexible.

**Q: How do you query with conditions inside nested arrays — like "orders containing an item priced over 100"?**

That's what JSONPath is for. `jsonb_path_query(order_data, '$.items[*] ? (@.price > 100)')` walks every element of the items array and returns each match as a row; `jsonb_path_query_first` returns one; `order_data @? '$.items[*] ? (@.price > 100)'` answers pure yes/no and — importantly — is GIN-indexable, so the expensive-sounding query stays fast at scale. Syntax gotchas I'd name in an interview: strings inside JSONPath use double quotes, equality is `==`, and paths run strict by default, so on heterogeneous documents I prefix with `lax` to skip mismatches instead of erroring. For simple cases the older operators still work — `data -> 'items' -> 0 ->> 'price'` grabs the first item — but anything involving "any element such that…" belongs to JSONPath.

**Q: What happens when you UPDATE a single key inside a large JSONB document?**

There's no in-place patch. JSONB is stored as a decomposed binary tree of the whole document, and Postgres rewrites the entire value — even changing one tiny key produces a brand-new row version under MVCC, queues the old version for vacuuming, and updates every GIN ledger entry for every key in the document, not just the changed one. On a high-write table with big documents and a GIN index, that's triple write amplification: table churn, index churn, autovacuum pressure. The senior response is architectural: split huge mutable documents (move volatile parts to their own table), avoid GIN on write-hot tables unless reads demand it, and promote truly hot keys to columns so updates touch narrow values. It connects directly to why autovacuum tuning matters on JSONB-heavy schemas.

## 6. The Traps — What Goes Wrong in Production

**Comparing extracted numbers as text.** The wrong assumption: `attributes ->> 'price' > 100` compares prices. Why it's wrong: `->>` returns text, and text comparison goes character by character — `'9'` outranks `'1'`, so `'99' > '100'` is true. What happens: the query returns wrong rows with no error, dashboards show inflated numbers, and nobody notices for weeks. The fix: always cast — `(attributes ->> 'price')::numeric` — and index the cast expression if the filter is common. Same warning applies to dates stored as ISO strings: `'2026-01-05' > '2025-12-30'` happens to sort correctly only because ISO format is designed that way; any format drift or timezone suffix breaks it, so cast timestamps properly.

**Adding a GIN index and staying slow anyway.** The wrong assumption: "I indexed the column, all my JSONB queries are fast now." Why it's wrong: GIN answers membership questions — `@>`, `?`, `@?` — but a predicate written as `attributes ->> 'email' = 'x@example.com'` performs extraction first and compares afterward, giving the planner nothing to look up. What happens: `EXPLAIN ANALYZE` still shows Seq Scan, CPU pegs during peak traffic, and the team concludes "indexes don't work on JSONB." The fix is either rewriting the predicate as containment (`attributes @> '{"email":"x@example.com"}'`) or creating a b-tree expression index on `(attributes ->> 'email')`. The systematic version of this workflow — read the plan, find the missing index, re-measure — is the subject of [how do you optimize slow PostgreSQL queries](./how-do-you-optimize-slow-postgresql-queries.md). And the inverse trap is equally real: no GIN index at all means every `@>`/`?` query is a full-table scan — the dashboard-timeout story from the top of this page.

**Expecting `?` to find numbers in arrays.** The wrong assumption: `attributes -> 'sizes' ? '9'` checks whether size 9 is offered. Why it's wrong: `?` matches top-level object keys and *string* array elements only — numeric array elements are invisible to it. What happens: the query returns zero rows forever, silently, even though size 9 exists everywhere. The fix: scalar containment (`attributes -> 'sizes' @> '9'`) or JSONPath (`$.sizes[*] ? (@ == 9)`).

**Treating array containment as a set operation.** The wrong assumption: `'["a","b","c"]' @> '["c","a"]'` is true because both elements exist. Why it's wrong: arrays are ordered in JSON, so containment checks that the right-hand elements appear in the left-hand array **in the same listed order** (as a subsequence). What happens: queries return fewer rows than expected, and worse, results depend on insertion order of tags in your documents. The fix: for unordered membership of many values, use `?&` (all of these labels exist) or JSONPath with explicit logic; reserve `@>` on arrays for cases where order genuinely carries meaning.

**Silent NULLs from missing keys.** The wrong assumption: a missing key behaves like an empty value. Why it's wrong: extracting a missing key yields SQL NULL — no error, no warning — and NULL poisons comparisons: `(data ->> 'discount')::numeric > 0` simply excludes every row lacking a discount. What happens: filters quietly return incomplete result sets, and if dirty data sneaks in (`"price": "N/A"`), the cast throws mid-query and breaks the endpoint intermittently — only for the rows that trigger it. The fix: guard intentionally with `attributes ? 'key'` or `->> 'key' IS NOT NULL` when absence is meaningful, validate JSON shape on write (CHECK constraints or app-layer validation), and remember `lax` JSONPath mode skips type mismatches instead of erroring.

**Ignoring what JSONB costs on writes.** The wrong assumption: JSONB is free-form storage with no downside beyond read speed. Why it's wrong: every insert or update maintains GIN ledger entries for *all* keys and values in the document, and updating one key rewrites the entire document as a new row version. What happens: write-heavy tables with fat JSONB documents develop slow writes, bloated indexes, and aggressive autovacuum activity — the failure surfaces weeks after the feature ships. The fix: keep documents small, think twice before GIN-indexing write-hot tables, and promote hot keys to columns. The full storage-format trade-offs live on the [what is JSONB](./what-is-jsonb.md) page and the vacuum consequences on [what is autovacuum](./what-is-autovacuum.md).

## 7. Compare With Related Concepts

**`->` versus `->>`.** Wrapped parcel versus unwrapped item: JSON structure preserved versus plain text handed over. Rule: chain with `->`, unwrap once with `->>`, and cast immediately whenever the value is numeric or temporal.

**Whole-document `=` versus containment `@>`.** Exact snapshot match versus "this structure fits inside yours." Rule: use `=` only for comparing stored copies; use `@>` for every "has these properties" filter.

**`?` versus `@>`.** Label check versus content check. Rule: `?` when existence alone answers the question; `@>` when the *value* matters.

**GIN versus b-tree expression index.** Ledger of everything-inside-boxes versus sortable spine printed on the box. Rule: GIN for containment/existence across arbitrary keys; b-tree on extracted expressions for equality, ranges, and `ORDER BY` on specific hot keys — and they coexist happily.

**Flexible JSONB attributes versus promoted/generated columns.** Schema-free long tail versus typed, constrained, indexed spine. Rule: promote a key the moment it's filtered, sorted, joined, or constrained in most queries; leave the rest flexible.

**`@?` / `jsonb_path_exists` versus `jsonb_path_query`.** Boolean gate versus row-producing extractor. Rule: filter with the boolean forms (they're indexable); use `jsonb_path_query` when you need the matching fragments themselves returned as rows.

**This page versus [JSON vs JSONB](./json-vs-jsonb.md).** That page covers the storage formats and why JSONB's parse-once binary layout is what makes all these operators cheap; this page assumes JSONB and teaches how to drive it.

## 8. 🧠 The Memory Hook

One arrow (`->`) hands you the sealed parcel, two arrows (`->>`) hand you the unwrapped item on paper — so numbers need casting before they'll compare honestly. `@>` asks "does my whole mini-manifest fit inside your box?", `?` just checks the label — and until you put a GIN ledger on the column, Postgres answers all of these by opening every single box in the warehouse.
