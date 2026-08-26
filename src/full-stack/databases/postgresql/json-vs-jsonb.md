# JSON vs JSONB

## 1. The Real-World Problem — When You Actually Hit This

Your team stores third-party webhook payloads in a PostgreSQL column typed as `json`. For months nobody queried it — you just wrote rows and showed them in an admin panel. Then product asks for a filter: "show me every failed refund event from last week."

You write `WHERE payload->>'status' = 'failed'` and the dashboard times out. Two reasons, and both come from the same decision. First, there's no index that can help — `json` columns can't be indexed for content searches. Second, and worse: PostgreSQL re-parses the entire JSON text of every single row, every time you touch it. Ten thousand rows means ten thousand fresh parses of documents that might be hundreds of kilobytes each. The query isn't slow because the data is big. It's slow because the column type made every read do full parsing work.

You migrate the column to `jsonb`, add an index, and the query drops from seconds to milliseconds. But then your API snapshot tests start failing — the stored JSON comes back with keys in a different order than what the provider sent — and nobody on the team can explain why. That's the moment you realize `json` and `jsonb` are not "two spellings of the same thing." They are two completely different storage contracts, and picking between them blind costs you a bad incident either way: pick `json` and reads rot, pick `jsonb` without understanding it and your data quietly gets rewritten behind your back.

## 2. The Analogy — Make the Mechanic Obvious

Imagine an office that receives paper forms from customers every day, and you have two ways to file them.

**Option A — staple the original paper into a folder.** Whatever the customer wrote, goes in exactly as written: their messy spacing, the order they filled the fields, even that time they wrote "phone: 555-0100" twice with two different numbers. Filing takes zero effort. But every time anyone asks "what's this customer's phone number?", a clerk pulls the sheet out and reads the whole thing top to bottom looking for the answer. Ask about ten thousand customers, and the clerk reads ten thousand full forms. Nothing about the paper helps you search it.

**Option B — have a clerk re-enter the form onto standardized index cards at the front desk.** One card per field, sorted in a fixed order, duplicate entries thrown away keeping whichever was written last, stray marks and empty space discarded. Now "find everyone whose status is failed" is instant — the cards are organized and you can build a cross-reference cabinet over them. The price: the clerk spends real time processing each form at intake, and the customer's original handwriting, field order, and duplicates are gone forever. You stored the *facts*, not the *document*.

That's the whole topic. `json` is Option A: PostgreSQL staples your exact text into the row and does nothing else. `jsonb` is Option B: at insert time it processes your JSON into organized internal structures, trades a bit of write effort and the original formatting for fast, searchable, indexed reads. Once you see the two filing systems, every technical detail below is just naming parts of the analogy.

## 3. The Full Explanation — How It Actually Works

Both types store valid JSON — PostgreSQL validates the syntax on insert for both, and rejects malformed input either way. Everything interesting happens after validation.

**The `json` type stores your exact input text, verbatim.** Key order preserved. Duplicate keys kept, all of them. Whitespace and formatting preserved. PostgreSQL treats it almost like a string with a validity check attached. The consequence shows up on every read: whenever you call any function or operator on a `json` value — `->`, `->>`, anything — PostgreSQL parses the full text again, right then, to find your answer. Read the same row five times in one query with five different operators, and that document gets parsed five times. There is no pre-built structure to consult, because none exists. And because there's no structure, there's nothing meaningful to index: a database index needs a normalized, ordered representation of values to organize, and raw text blobs don't give it one.

**The `jsonb` type parses your JSON at write time into a decomposed binary format** — literally "binary JSON," hence the b. Instead of text, the column holds a tree structure: keys and values broken apart, tagged with types, arranged so PostgreSQL can navigate them directly. During that conversion the document gets *normalized*, meaning several things change:

Duplicate keys disappear — if `"amount"` appears three times, only the last value survives. Key order is rebuilt — object keys are sorted internally, first by length and then byte-by-byte, not alphabetically and not in your original order. Whitespace between tokens is dropped. Number formatting is canonicalized — `19.990` becomes `19.99`, because the value is stored as PostgreSQL's exact numeric type, not as text. None of this loses semantic information: the parsed data means the same thing. But the original presentation is unrecoverable.

Normalization is exactly why `jsonb` reads fast and `json` doesn't. Keys live in sorted order inside the binary tree, so finding `"status"` is a quick navigation, not a text scan — done once, with no re-parsing, no matter how many times or how many ways you query the row. Normalization is also why `jsonb` can be indexed: the decomposed, sorted representation gives index structures something orderly to organize. Build a GIN index over a `jsonb` column and PostgreSQL can answer "which rows contain this key?" or "which rows contain this key-value pair?" by consulting the index instead of opening every document — see [What is a GIN Index](what-is-gin-index.md) for how that index works internally. `jsonb` also unlocks the richer operator set: containment (`@>`), key existence (`?`), and the jsonpath functions all require the decomposed form and simply don't exist for `json`.

So what do you pay? **The write.** Every insert and update converts the document — parsing, deduplicating, sorting, building the tree. On a workload writing thousands of small documents per second, that CPU cost is real, though usually dwarfed by what you'd spend re-parsing on reads. The bigger operational cost hides in how updates work: there is no in-place edit of one key inside a document. Changing a single field creates an entirely new version of the entire document under PostgreSQL's MVCC model, and the old version hangs around as dead space until autovacuum cleans it up (see [What is VACUUM](what-is-vacuum.md)). Churn a multi-hundred-KB `jsonb` document twenty times a minute and you're rewriting megabytes and generating bloat to update a few bytes. Hot, frequently-updated fields belong in regular columns, not buried in a big blob.

One nuance people miss: **arrays behave differently from objects.** Only object *keys* get sorted and deduplicated. Array element order is fully preserved in `jsonb`, and duplicate array elements stay too. If you store `["step-a", "step-b", "step-c"]`, it comes back in exactly that order.

And the practical default, stated plainly: **use `jsonb`.** It's faster to query, richer to operate on, indexable, and its normalization quirks are things you should understand rather than fear. Reach for `json` only in the narrow case where the exact original text is itself the data — archiving payloads byte-for-byte for audit or legal replay, where you must be able to prove precisely what arrived, duplicates and all. Even then, ask whether a plain `TEXT` column serves you better, because `json`'s only advantage over `TEXT` is upfront validation.

## 4. See It In Practice — Real Code or Queries

First, watch the two types disagree about the *same* literal:

```sql
-- Duplicate keys: json keeps everything, jsonb keeps the last value
SELECT '{"amount": 100, "currency": "usd", "amount": 0}'::json;
-- {"amount": 100, "currency": "usd", "amount": 0}

SELECT '{"amount": 100, "currency": "usd", "amount": 0}'::jsonb;
-- {"amount": 0, "currency": "usd"}
```

```sql
-- Key order and formatting: json preserves input, jsonb normalizes it
SELECT '{"zip": 94107, "id": 5, "name": "Ada"}'::json;
-- {"zip": 94107, "id": 5, "name": "Ada"}        (exactly as written)

SELECT '{"zip": 94107, "id": 5, "name": "Ada"}'::jsonb;
-- {"id": 5, "name": "Ada", "zip": 94107}
```

Notice `jsonb`'s sort is *not* alphabetical — it's shortest-key-first, then bytewise. Prove it to yourself:

```sql
SELECT '{"b": 1, "c": 2, "aaa": 3}'::jsonb;
-- {"b": 1, "c": 2, "aaa": 3}
```

Numbers get canonicalized too, because `jsonb` stores them as exact numerics, not text:

```sql
SELECT '{"price": 19.990}'::json;    -- {"price": 19.990}
SELECT '{"price": 19.990}'::jsonb;   -- {"price": 19.99}
```

Now the production shape of the problem from section 1. Here's the schema choice, and the index that fixes the filter:

```sql
CREATE TABLE webhook_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source      text        NOT NULL,
  payload     jsonb       NOT NULL,           -- deliberate default: jsonb, not json
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Answers "which rows contain this key-value pair?" without touching every document
CREATE INDEX webhook_events_payload_gin ON webhook_events USING gin (payload);

-- Containment: uses the GIN index, returns rows whose payload includes this fragment
SELECT id, created_at
FROM webhook_events
WHERE payload @> '{"event": "refund", "status": "failed"}'
ORDER BY created_at DESC;

-- Key existence: also GIN-supported (with the default jsonb_ops operator class)
SELECT * FROM webhook_events WHERE payload ? 'refund_id';
```

If your query always targets one known field, an expression index over that field is leaner and supports range predicates, which GIN cannot:

```sql
-- B-tree over the extracted text value: perfect for equality and ranges on one field
CREATE INDEX webhook_events_status_idx
  ON webhook_events ((payload->>'status'));

SELECT * FROM webhook_events WHERE payload->>'status' = 'failed';
```

Finally, the equality asymmetry that surprises people — `jsonb` knows when two documents are equal, `json` fundamentally cannot:

```sql
SELECT '{"a": 1}'::jsonb = '{"a":  1}'::jsonb;   -- true (normalized forms compared)
SELECT '{"a": 1}'::json  = '{"a": 1}'::json;     -- ERROR: operator does not exist: json = json
```

For the full operator toolbox and query patterns built on top of this, see [How Do You Query JSONB Fields](how-do-you-query-jsonb-fields.md), and for the deep dive on the type itself see [What is JSONB](what-is-jsonb.md).

## 5. Interview Questions — All of Them, Done Properly

**Q: What is the actual difference between `json` and `jsonb` in PostgreSQL?**

They differ in when the JSON gets parsed and what gets stored. `json` stores your exact input text after validating it — nothing more. Every operation on it re-parses the text from scratch, and the original key order, duplicate keys, and whitespace all survive. `jsonb` parses the document once at write time and stores a decomposed binary tree instead of text. That conversion normalizes the data: duplicate keys collapse to the last value, object keys get re-sorted, whitespace disappears, numbers get canonicalized. The payoff for giving up the original formatting is that reads never re-parse, the operator set is much richer (containment, key existence, jsonpath), and the column becomes indexable with GIN. The one-line summary I'd give: `json` preserves the document, `jsonb` preserves the data — and in almost every application you care about the data.

**Q: Why can you index `jsonb` but not `json`?**

Because indexing requires an ordered, normalized representation of values, and `json` never creates one — it's validated text, sitting in the row as-is. There's no canonical form to say "these two values are equal" or "this value sorts here," which is exactly what an index organizes. `jsonb`'s write-time conversion produces that canonical form: a binary tree with sorted keys and typed values. A GIN index can walk every key-value pair in every document and build inverted lists saying "this pair appears in these rows," turning containment and existence checks into index lookups. You can also build regular B-tree indexes on expressions extracted from `jsonb`, like `(payload->>'status')`. Neither is possible on `json` — the closest you get is indexing a cast, which defeats the purpose.

**Q: What happens to duplicate keys and key order in each type?**

In `json`, both survive untouched — if the incoming text had `"amount": 100` early and `"amount": 0` later, both stay in the stored text, in that order, and lookup operators return the first match. In `jsonb`, duplicates are removed during normalization with the last occurrence winning, and key order is rebuilt by the internal sort (length first, then bytewise — not alphabetical). The critical implication is silent: neither type ever raises an error on duplicates. `json` will hand your code the *first* value while `jsonb` hands it the *last*, so if a producer upstream emits duplicate keys, migrating between the types can change which value your application sees — with no warning anywhere.

**Q: When would you deliberately choose `json` over `jsonb`?**

Only when the exact original text is itself the thing you're storing. The honest examples: an audit or compliance archive where you must be able to reproduce byte-for-byte what a third party sent — including their duplicate keys, ordering, and whitespace — perhaps to re-verify a signature computed over the raw body; or a pure append-only landing zone where data is written once, rarely read analytically, and you want to skip the conversion CPU entirely. Both cases are rarer than people think, and the second one is often better served by a `TEXT` column anyway, since `json`'s only real feature over `TEXT` is validation. If someone tells me their general-purpose application column is `json`, my first question is "what breaks if it's `jsonb`?" — and the answer is almost always nothing, while plenty breaks the other direction.

**Q: `jsonb` is said to make writes slower. Why, and when does that cost matter?**

Two mechanisms. First, the conversion itself: every insert and update parses the document, deduplicates keys, sorts them, and builds the binary tree. That's straightforward CPU work proportional to document size. Second, and heavier in practice: `jsonb` documents are not edited in place. Under MVCC, changing one small key creates an entirely new physical version of the whole document — and if the document is large enough to be TOAST-ed out of line, the whole compressed value gets rewritten. The old copy becomes dead tuples that autovacuum must reclaim. So the cost that actually hurts isn't the parse on a bulk load; it's high-churn updates to large documents, which generate write amplification and table bloat. The fix is architectural: keep `jsonb` documents reasonably small and read-mostly, and promote hot, frequently-updated fields into real columns.

**Q: How would you index a `jsonb` column for a query like `WHERE payload->>'status' = 'failed'`?**

An expression index: `CREATE INDEX ... ON events ((payload->>'status'))`. Since `->>` returns text, PostgreSQL builds an ordinary B-tree over the extracted values, and that exact predicate becomes an index scan — with equality and range support, which GIN doesn't offer for scalar comparisons. I'd choose GIN on the whole column when the access pattern is open-ended containment and existence checks over unpredictable keys — `payload @> '{...}'`, `payload ? 'key'`. Rule of thumb: one known field queried with equality or ranges gets an expression B-tree; arbitrary sub-document search gets GIN. They're not exclusive — a busy table commonly carries both.

**Q: Does `jsonb` preserve the order of elements inside a JSON array?**

Yes. Only object keys are subject to normalization — sorted, deduplicated. Array elements keep their exact order, and duplicate array elements are kept as well. `["authored", "reviewed", "published"]` comes back in precisely that sequence. This distinction matters in designs like event step-lists or priority queues stored as arrays. The trap runs in both directions: people assume key order survives (it doesn't) or avoid arrays believing order is destroyed (it isn't).

**Q: What happens if you run `SELECT '{"a":1}'::json = '{"a":1}'::json;`?**

It errors: `operator does not exist: json = json`. Equality needs a canonical form — a way to decide that two differently-formatted texts represent the same value — and `json` deliberately refuses to compute one; it's committed to preserving input exactly, so it can't even define what "equal" means beyond string identity. `jsonb` compares fine because every document has been reduced to one normalized binary representation, so equality is structural. Same reason `jsonb` supports grouping, `DISTINCT`, sorting, and hashing while `json` largely doesn't. If a candidate knows this asymmetry, they've genuinely understood the storage model, not just memorized "jsonb is faster."

## 6. The Traps — What Goes Wrong in Production

**Expecting PostgreSQL to reject duplicate keys.** The wrong assumption: feeding `{"amount": 100, "amount": 0}` into a `jsonb` column will raise an error or at least warn someone. It won't. Both types accept duplicates silently — `json` stores both, `jsonb` discards all but the last. What happens in production is the nasty version: a producer with a buggy serializer appends a corrected field instead of replacing it, `jsonb` quietly keeps the new value, and months later someone auditing the raw feed against the database finds "mismatched" records and can't tell who lied. The fix: treat duplicate keys as an input-validation problem, not a storage problem. If key uniqueness matters to your contract, reject duplicates at the application boundary before insert, and document explicitly that `jsonb` semantics are last-write-wins.

**Comparing display strings instead of values.** The wrong assumption: that `psql` output is the data, so if two documents print differently they are different. After a `json` → `jsonb` migration, output changes — keys reordered, whitespace gone, `19.990` printed as `19.99` — and suddenly snapshot tests fail, CSV exports stop matching fixtures, and diffs light up everywhere despite zero semantic change. What's happening is you're comparing presentation, and `jsonb` guarantees a canonical presentation, not *your* presentation. The fix: never assert on serialized text of a `jsonb` value. Assert with `=` for whole-document equality, `@>` for containment, or extract and compare specific fields. Update test fixtures to normalized form once, deliberately.

**Choosing `json` "because we only write, never query."** The wrong assumption: skipping write-time conversion saves enough to justify losing everything else. What actually happens: requirements arrive — there is always a filter, a report, a debugging session — and now every one of those queries re-parses every document with no index possible, on a column that also can't do equality, containment, or existence checks. The write savings were measured; the read tax wasn't. The fix: default to `jsonb` and let profiling argue you out of it. The reverse mistake exists too — keeping a genuinely cold, append-only archive as `jsonb` pays conversion cost for nothing — but that's an optimization decision made with measurements, not a starting position.

**Updating one key and rewriting the world.** The wrong assumption: `UPDATE events SET payload = jsonb_set(payload, '{status}', '"failed"')` touches just that field. It replaces the entire document — new row version, full new copy of the payload, dead space left behind for autovacuum. On a table where a large document mutates constantly (counters, statuses, progress markers living inside a big blob), you get write amplification, bloat, and vacuum pressure that looks mysterious in monitoring. The fix: keep mutating fields in regular columns and reserve `jsonb` for the genuinely variable, read-mostly structure around them — or keep documents small enough that whole-document rewrites are cheap.

**Building a `jsonb_path_ops` GIN index, then running existence checks.** The wrong assumption: all GIN indexes on `jsonb` behave alike. PostgreSQL offers two operator classes: the default `jsonb_ops` supports containment and key-existence operators; `jsonb_path_ops` supports only containment-style matches, in exchange for a much smaller index. Run `payload ? 'key'` against a `jsonb_path_ops` index and you get an error, or worse, the planner falls back to a sequential scan and you wonder why the index "isn't being used." The fix: pick the operator class from your actual query mix — containment-only, high-volume tables earn `jsonb_path_ops`; anything touching `?` stays on the default.

**Assuming `jsonb` scrambles array order too.** The wrong assumption cuts both ways: teams either rely on original object key order surviving (it doesn't — it's rebuilt by the internal sort) or refuse to use arrays for ordered data believing `jsonb` destroys order (it doesn't — array sequences are exact). The first assumption corrupts logic that depended on insertion order; the second pushes people into ugly workarounds like numbered wrapper objects. The fix is knowing the precise boundary: normalization touches object keys only; arrays are untouchable.

## 7. Compare With Related Concepts

**`json` vs `jsonb`:** exact-text preservation with slow re-parsed reads versus normalized binary with fast indexed reads. Rule: `jsonb` by default; `json` only when byte-exact provenance of the original document is the requirement.

**`jsonb` column vs plain `TEXT` column:** both can hold raw JSON text, but `jsonb` validates syntax on insert and gives you operators and indexes; `TEXT` gives you zero overhead and zero guarantees. Rule: dumping opaque payloads you'll never query — `TEXT`; anything you'll inspect structurally — `jsonb`; the niche where `json` beats both barely exists.

**`jsonb` column vs regular typed columns:** typed columns give you constraints, statistics, tight indexes, and cheap in-place updates; `jsonb` gives you flexibility for structure that varies per row. Rule: stable, hot, business-critical fields get real columns; `jsonb` is for the long tail you don't filter on critically.

**GIN index vs B-tree expression index on `jsonb`:** GIN indexes the whole document for containment and existence searches across arbitrary keys; a B-tree expression index accelerates equality and range on one extracted field with far less size and maintenance. Rule: unpredictable sub-document search — GIN; one known field compared with `=` or ranges — expression B-tree.

**PostgreSQL `jsonb` vs MongoDB documents:** `jsonb` puts flexible documents inside a relational engine — transactions, joins, foreign keys, SQL; MongoDB makes documents the primary model with native horizontal sharding and a document-native query language. Rule: relational core with a flexible edge — `jsonb`; document-first domain expected to shard horizontally — Mongo, and know that trade-off before an interviewer forces you to pick.

## 8. 🧠 The Memory Hook

`json` staples the original letter into the folder; `jsonb` rebuilds it as sorted index cards. You lose the handwriting — key order, duplicates, whitespace — and gain instant, indexed search, so default to `jsonb` and reach for `json` only when the exact handwriting *is* the point.
