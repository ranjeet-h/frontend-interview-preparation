# How do you implement search

## Detailed explanation

How do you implement search is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you implement search by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply Express.js rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you implement search affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you implement search in Express with MongoDB?
- **The Engine Mechanism (Why it behaves this way):** For basic search, use MongoDB's `$regex` operator: `Model.find({ name: { $regex: query, $options: 'i' } })`. The `i` option makes it case-insensitive. For multi-field search, use `$or`: `Model.find({ $or: [{ name: { $regex: query, $options: 'i' } }, { description: { $regex: query, $options: 'i' } }] })`. For better performance, create text indexes: `db.collection.createIndex({ name: 'text', description: 'text' })` and use `$text` operator: `Model.find({ $text: { $search: query } })`. Text indexes are faster than regex but don't support partial word matching.
- **The Unforgettable Mental Model:** The **Library Search Desk**. Regex search is like scanning every book title letter by letter (slow but flexible). Text index search is like using the library's catalog system (fast but requires pre-built index).
- **The Trap:** Using `$regex` without indexes on large collections — it performs a full collection scan. Also, unescaped regex patterns can cause ReDoS (Regular Expression Denial of Service) attacks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For basic search, I use MongoDB $regex with case-insensitive matching. For multi-field search, I use $or with regex on each field. For better performance on large collections, I create text indexes and use the $text operator, which is much faster than regex. I always escape user input before using it in regex to prevent ReDoS attacks. For production-grade search, I consider dedicated search engines like Elasticsearch or Algolia."

#### How do you prevent ReDoS attacks in search?
- **The Engine Mechanism (Why it behaves this way):** ReDoS (Regular Expression Denial of Service) occurs when malicious input causes regex to take exponential time. Prevention: (1) **Escape special regex characters**: `const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`. (2) **Limit query length**: `if (query.length > 100) return res.status(400).json(...)`. (3) **Use text indexes instead of regex** for production search. (4) **Set query timeout**: MongoDB's `maxTimeMS()` limits query execution time. (5) **Use dedicated search libraries** that handle escaping internally.
- **The Unforgettable Mental Model:** The **Regex Speed Bump**. Normal search queries drive smoothly. Malicious queries are like putting spikes on the road — they slow everything to a crawl. Escaping removes the spikes.
- **The Trap:** Passing user input directly to `$regex` without escaping. Characters like `.*+?^${}()|[]\` have special meaning in regex and can be exploited.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I always escape user input before using it in regex by escaping special characters like ., *, +, ?, ^. I also limit query length to 100 characters and set MongoDB's maxTimeMS to prevent long-running queries. For production search, I prefer text indexes or dedicated search engines like Elasticsearch, which handle these concerns internally. ReDoS is a real threat — a carefully crafted input can make a regex take minutes to process."

#### How do you implement full-text search?
- **The Engine Mechanism (Why it behaves this way):** Create a text index on searchable fields: `db.products.createIndex({ name: 'text', description: 'text', category: 'text' })`. Query with `$text`: `Model.find({ $text: { $search: query } }, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } })`. Text search supports word stemming (searching "running" matches "run"), stop word removal (ignores "the", "and"), and relevance scoring. Limitations: only one $text query per query, no partial word matching, language-specific stemming.
- **The Unforgettable Mental Model:** The **Smart Index**. Instead of reading every page (collection scan), the smart index (text index) knows exactly which pages contain each word. It also understands that "running" and "run" are related (stemming).
- **The Trap:** Creating text indexes on too many fields — each text index is large and slows down writes. Only index fields that users actually search.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create text indexes on the fields users search and query with the $text operator. Text search provides stemming, stop word removal, and relevance scoring out of the box. I sort by textScore for relevance-ranked results. The limitations are one $text query per query and no partial word matching. For more advanced search needs — fuzzy matching, autocomplete, faceted search — I use Elasticsearch or Algolia."

#### When should you use a dedicated search engine?
- **The Engine Mechanism (Why it behaves this way):** Use Elasticsearch, Meilisearch, or Algolia when you need: (1) **Fuzzy matching** — "recieve" matches "receive". (2) **Autocomplete** — prefix matching with typo tolerance. (3) **Faceted search** — filter by category, price range, etc. (4) **Relevance tuning** — boost certain fields, custom scoring. (5) **High-performance search** on large datasets. (6) **Synonyms and language support**. MongoDB's text search is sufficient for simple use cases, but dedicated search engines provide significantly better UX for search-heavy applications.
- **The Unforgettable Mental Model:** The **Specialist vs. Generalist**. MongoDB text search is a generalist — it does search adequately. Elasticsearch is a specialist — it does search exceptionally well with features like fuzzy matching, autocomplete, and relevance tuning.
- **The Trap:** Over-engineering with Elasticsearch for a simple search feature. If you only need basic keyword matching on a small collection, MongoDB text search is sufficient.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use MongoDB text search for simple keyword matching on moderate datasets. When the app needs fuzzy matching, autocomplete, faceted search, or relevance tuning, I switch to a dedicated search engine like Elasticsearch or Meilisearch. The tradeoff is added infrastructure complexity — you need to sync data between MongoDB and the search engine. I only make this jump when the search experience justifies the added complexity."

#### How do you implement search with filters and sorting?
- **The Engine Mechanism (Why it behaves this way):** Combine search with filter and sort: `const query = { $text: { $search: searchTerm } }; if (category) query.category = category; if (minPrice) query.price = { $gte: minPrice }; const results = await Model.find(query, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } }).skip(skip).limit(limit);`. For regex search, combine with $and: `Model.find({ $and: [{ $or: [{ name: { $regex: escaped } }] }, { category }] })`. Always validate and sanitize filter values. Paginate results.
- **The Unforgettable Mental Model:** The **Funnel**. Search is the wide top of the funnel (find all matching items). Filters narrow it down (specific category, price range). Sort orders the results. Pagination shows a window.
- **The Trap:** Applying filters after fetching results instead of in the query. This loads unnecessary data and is inefficient. Always combine search, filters, and sort in a single database query.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I combine search, filters, and sort in a single database query. The search term builds the base query ($text or $regex), filters add additional conditions, and sort orders by relevance or specified field. I paginate with skip/limit or cursor. Everything happens in one query — I never fetch all results and filter in JavaScript. I validate all filter values and sanitize search terms before using them in queries."

## 8. Active recall test

1. **How do you do case-insensitive search in MongoDB?**
   - **Explanation:** Use `$regex` with `$options: 'i'`: `{ name: { $regex: query, $options: 'i' } }`. For multi-field search, combine with `$or`.

2. **What is ReDoS and how do you prevent it?**
   - **Explanation:** Regular Expression Denial of Service — malicious input causes regex to take exponential time. Prevent by escaping special regex characters, limiting query length, and using text indexes.

3. **How do you create a text index in MongoDB?**
   - **Explanation:** `db.collection.createIndex({ field1: 'text', field2: 'text' })`. Query with `$text: { $search: query }` and sort by `$meta: 'textScore'` for relevance.

4. **When should you use Elasticsearch instead of MongoDB text search?**
   - **Explanation:** When you need fuzzy matching, autocomplete, faceted search, relevance tuning, or high-performance search on large datasets. MongoDB text search is sufficient for simple keyword matching.

5. **How do you combine search with filters?**
   - **Explanation:** Build a single query object combining the search condition ($text or $regex) with filter conditions (category, price range, etc.). Apply sort and pagination in the same query.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you implement search in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you implement search in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
