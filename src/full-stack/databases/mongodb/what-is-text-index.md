# What is text index

## 1. The Real-World Problem — When You Actually Hit This

Your product search box runs `db.products.find({ description: /wireless headphones/i })`. It works in staging with 500 products. In production you have 2 million SKUs. Every search scans the whole collection, CPU spikes, p95 latency hits four seconds, and the regex cannot use a normal B-tree index because it is not anchored to the start of the string.

You need real full-text search: tokenization, stemming, relevance scoring, and an index that supports it. That is what a MongoDB text index is for.

## 2. The Analogy — Make the Mechanic Obvious

A normal index is like an alphabetized phone book sorted by one exact key — great when you know the exact name.

A text index is like a library catalog that has already broken every book into words, thrown away punctuation, normalized spelling, and built a separate lookup table for each word pointing back to the documents that contain it. When someone searches "wireless noise cancelling," the catalog finds documents that mention those terms and ranks the best matches instead of reading every page.

## 3. The Full Explanation — How It Actually Works

A text index supports the `$text` query operator. MongoDB tokenizes indexed string fields (and arrays of strings), applies language-specific stemming and stop-word rules, and stores the tokens in a special inverted index structure.

**Rules that matter in production:**

- Only **one text index per collection**. You can index multiple fields in that single index (`title`, `body`, `tags`), but you cannot create a second text index on the same collection.
- Text indexes are **compound-aware only in limited ways**. You can combine text with other index types in one compound index in specific patterns, but the common pattern is one dedicated text index on the fields users search.
- Queries use `$text: { $search: "..." }` and optionally `$text: { $search: "...", $language: "en" }`.
- Results include a relevance `score` via `{ score: { $meta: "textScore" } }` in projection and sort.
- Text search is **case-insensitive** for Latin languages. It is not a substring regex — it matches whole tokens (with stemming), not arbitrary partial matches inside a token unless you use phrase or negation syntax in `$search`.
- Text indexes carry **write overhead** like any index, and they do not replace dedicated search engines (Elasticsearch, Atlas Search) when you need fuzzy matching, synonyms, or heavy analytics on search.

**When to use it:** in-app search over modest collections, admin search, internal tools, prototypes, or when Atlas Search is not available.

**When not to use it:** high-scale consumer search with ranking tuning, autocomplete at scale, or heavy fuzzy/semantic search — use a dedicated search layer.

## 4. See It In Practice — Real Code or Queries

```javascript
// mongosh — blog articles collection
db.articles.drop();
db.articles.insertMany([
  {
    title: "MongoDB indexing guide",
    body: "Compound indexes and text indexes solve different problems.",
    tags: ["mongodb", "performance"]
  },
  {
    title: "Wireless headphones review",
    body: "These wireless noise cancelling headphones are great for travel.",
    tags: ["audio", "review"]
  },
  {
    title: "SQL vs NoSQL",
    body: "Choose the database based on access patterns, not hype.",
    tags: ["databases"]
  }
]);

// One text index across title, body, and tags
db.articles.createIndex(
  { title: "text", body: "text", tags: "text" },
  { weights: { title: 10, body: 5, tags: 3 }, name: "articles_text" }
);

// Basic search — matches stemming/token rules, not regex
db.articles.find(
  { $text: { $search: "wireless headphones" } },
  { score: { $meta: "textScore" }, title: 1 }
).sort({ score: { $meta: "textScore" } });

// Exclude a term with minus
db.articles.find({ $text: { $search: "mongodb -SQL" } });

// Phrase search (terms must appear together)
db.articles.find({ $text: { $search: "\"noise cancelling\"" } });
```

**Combining `$text` with other filters** — `$text` must be the only operator at the top level of the query document unless you wrap equality filters alongside it:

```javascript
db.articles.find({
  $text: { $search: "index" },
  tags: "mongodb"
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a text index in MongoDB?**

It is a special index type that tokenizes string fields so you can run `$text` queries with relevance scoring. It supports stemming and stop words per language instead of scanning every document with regex.

**Q: How is it different from a regex query on an indexed field?**

Regex only uses a normal index when it is anchored to the start (`/^prefix/`). Most regex patterns force a collection scan. Text search uses an inverted index built from tokens, so lookup cost scales with matching terms, not total document count.

**Q: Can you have multiple text indexes on one collection?**

No. One text index per collection. Put every searchable string field into that single index and use `weights` to rank title above body.

**Q: How do you sort by relevance?**

Project `score: { $meta: "textScore" }` and sort with `{ score: { $meta: "textScore" } }`. Without that, MongoDB does not guarantee best-match ordering.

**Q: When would you not use a text index?**

When you need autocomplete, heavy fuzzy search, synonym dictionaries, or search analytics at scale. Move to Atlas Search or an external search engine.

## 6. The Traps — What Goes Wrong in Production

**Using regex and expecting text-index performance.** `/headphones/` in `find()` does not use the text index. Use `$text` or a dedicated search product.

**Creating a second text index.** `createIndex` fails or you must drop the existing text index first. Plan one index up front.

**Forgetting weights.** Without weights, a match in `tags` counts the same as a match in `title`. Users see irrelevant results at the top.

**Searching for substrings inside tokens.** Text search matches tokens, not arbitrary substrings. Searching `wire` may not match `wireless` depending on tokenizer rules — test with your data.

**Mixing `$text` with `$or` at the top level incorrectly.** `$text` has strict query shape rules. Complex boolean logic often needs `$search` phrase/negation syntax or aggregation `$match` after restructuring.

**Assuming instant consistency on writes.** Like any index, writes update the text index asynchronously in the background; heavy write load plus search can show brief staleness on secondaries with non-primary read preference.

## 7. Compare With Related Concepts

**Text index vs normal single-field index:** Normal indexes support equality and range on the full field value. Text indexes support tokenized `$text` search and scoring. Use normal indexes for exact lookups (`sku: "ABC-123"`).

**Text index vs compound index:** Compound indexes optimize multi-field equality/sort/range patterns. A text index optimizes word search. They solve different access patterns.

**Text index vs Atlas Search / Elasticsearch:** MongoDB text index is built-in and simple. Atlas Search and Elasticsearch give analyzers, facets, autocomplete, and tuning knobs for product search at scale.

**Rule:** Built-in text index for moderate internal search; dedicated search stack when search is a core product feature.

## 8. 🧠 The Memory Hook

One text index per collection, `$text` not regex, tokens not substrings — relevance comes from `textScore`, not from scanning every document with `/pattern/i`.
