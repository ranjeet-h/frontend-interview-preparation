# Design a search autocomplete system

## Detailed explanation

Design a search autocomplete system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Design data flow, APIs, storage, scaling, failure handling, and observability together.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Clarify requirements and scale.
- Define APIs and data model.
- Choose storage, cache, queues, and workers.
- Plan consistency, failure handling, and security.
- Add observability and rollout strategy.

## 4. Visual / analogy

```txt
Clients -> API -> services -> database/cache/queue -> observability
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend system design rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, design a search autocomplete system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you implement fast prefix-based search for autocomplete?
- **The Engine Mechanism (Why it behaves this way):** Autocomplete uses a Trie (prefix tree) or a FST (Finite State Transducer) data structure where each node represents a character and paths from root represent search terms. Each terminal node stores the term's popularity score and associated metadata. For large datasets, use an inverted index (Elasticsearch, Typesense) with edge-ngram tokenization — "iphone" generates tokens: "i", "ip", "iph", "ipho", "iphon", "iphone". Queries match the prefix against the index and return results sorted by popularity. Redis can cache top autocomplete results for common prefixes. The response time target is <50ms.
- **The Unforgettable Mental Model:** The **Dictionary's Index**. When you look up "autocomp," you don't scan the whole dictionary — you flip to the "A" section, then "Au," then "Aut," and quickly find all words starting with that prefix. The dictionary is pre-sorted so prefix lookups are fast. Popular words (high frequency) appear first.
- **The Trap:** Using SQL LIKE 'prefix%' for autocomplete. This requires a full table scan or index range scan and is slow for large datasets with millions of terms. Use a Trie, FST, or search engine with edge-ngrams.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use a search engine like Elasticsearch with edge-ngram tokenization for prefix matching. Each search term is tokenized into prefixes (i, ip, iph, ipho...), and queries match against these tokens. Results are sorted by popularity score and returned in <50ms. For the top 10K most-searched prefixes, I'd cache results in Redis for sub-millisecond responses. For even larger scale, I'd use a FST (like Lucene's suggester) which is memory-efficient and supports fuzzy matching. The Trie approach works well for smaller datasets."

#### How do you rank and personalize autocomplete suggestions?
- **The Engine Mechanism (Why it behaves this way):** Suggestions are ranked by a composite score: popularity (search frequency), recency (trending searches), personalization (user's past searches and behavior), and business rules (promoted products). Personalization uses the user's search history, purchase history, and browsing behavior to boost relevant suggestions. For example, if a user frequently searches for "running shoes," typing "run" prioritizes "running shoes" over "rune." Trending searches get a temporary boost. A/B testing determines the optimal weighting of ranking signals. The ranking happens in-memory for speed — no database queries during the autocomplete request.
- **The Unforgettable Mental Model:** The **Smart Librarian**. The librarian (ranking system) knows which books are most borrowed (popularity), which are newly popular (trending), and what you've read before (personalization). When you ask for books starting with "H," they suggest "Harry Potter" first because it's popular and you've read it before, even though "Hamlet" is also available.
- **The Trap:** Over-personalizing autocomplete. If personalization is too strong, users get stuck in a filter bubble and can't discover new things. Always blend personalized results with global popularity and trending signals.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd rank suggestions using a composite score: popularity (search frequency), recency (trending boost), personalization (user's search/purchase history), and business rules (promoted items). Personalization boosts terms related to the user's past behavior — if they search for "running" often, "running shoes" ranks higher than "running events." Trending searches get a temporary time-decayed boost. All ranking is done in-memory using pre-computed scores — no database queries during the request. A/B testing optimizes the signal weights."

#### How do you handle typos and fuzzy matching in autocomplete?
- **The Engine Mechanism (Why it behaves this way):** Fuzzy matching allows 1-2 character edits (insertion, deletion, substitution, transposition) from the query. Elasticsearch supports fuzzy queries with the `fuzziness` parameter (AUTO = 0 edits for 1-2 chars, 1 edit for 3-5 chars, 2 edits for 5+ chars). The Levenshtein distance algorithm calculates edit distance. For performance, fuzzy matching is limited to the first character being correct (prefix + fuzzy). A phonetic algorithm (Soundex, Metaphone) handles phonetic typos ("fone" → "phone"). Synonym expansion handles conceptual typos ("sneakers" matches "running shoes"). Fuzzy matching is more expensive than exact prefix matching, so it's used as a fallback when exact matches are insufficient.
- **The Unforgettable Mental Model:** The **Forgiving Spell-Checker**. You type "iphnoe" and the system says "did you mean iphone?" It allows one letter swap (transposition). If you type "ipone," it allows one missing letter (deletion). But it requires the first letter to be correct — "xpone" won't match "iphone" because the starting point is too different.
- **The Trap:** Enabling fuzzy matching on every query. Fuzzy matching is 5-10x slower than exact prefix matching. Use exact prefix matching first, and only fall back to fuzzy if fewer than N results are found.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use exact prefix matching as the primary strategy for speed. If fewer than 5 results are found, I'd fall back to fuzzy matching with 1-2 edits (Levenshtein distance). The first character must match exactly to limit the search space. For phonetic typos, I'd use a phonetic algorithm like Metaphone. Synonym expansion handles conceptual variations. Fuzzy matching is more expensive, so it's a fallback, not the default. The response includes both exact and fuzzy matches, with exact matches ranked higher."

#### How do you keep the autocomplete index up to date?
- **The Engine Mechanism (Why it behaves this way):** The autocomplete index is updated asynchronously from the source of truth (product catalog, search logs). When a new product is added, it's indexed for autocomplete within seconds via an event-driven pipeline: product created → event published to Kafka → indexing worker consumes and adds to the search index. Search term popularity is updated from query logs — a batch job runs every hour to recalculate popularity scores from the last 24 hours of search data. Deleted products are removed from the index via the same event pipeline. The index is versioned — a new index is built in parallel and swapped atomically when ready.
- **The Unforgettable Mental Model:** The **Living Dictionary**. New words (products) are added as they're invented. Word popularity (search frequency) is updated based on how often people use them. Obsolete words (deleted products) are removed. The dictionary is always being edited, but readers always see a consistent version — the editor works on a draft and swaps it in when ready.
- **The Trap:** Updating the index synchronously during product creation. This adds latency to the product creation flow and couples the two systems. Always update the index asynchronously via events.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The autocomplete index is updated asynchronously via an event pipeline. Product changes (create, update, delete) publish events to Kafka, and indexing workers update the search index within seconds. Popularity scores are recalculated hourly from query logs — a batch job aggregates the last 24 hours of search data. The index is versioned — a new version is built in parallel and swapped atomically when ready. This keeps the index fresh without impacting the product creation flow."

#### How do you handle autocomplete for multi-language and multi-region?
- **The Engine Mechanism (Why it behaves this way):** Each language/region has its own autocomplete index with language-specific tokenization, stemming, and stop words. The user's language is detected from the Accept-Language header or user profile, and the appropriate index is queried. For multi-script languages (Chinese, Japanese, Arabic), use language-specific analyzers that handle character segmentation. Cross-language search maps transliterations (pinyin → Chinese characters). Region-specific results boost local products (searching "football" returns soccer in Europe, American football in the US). A shared infrastructure (same Elasticsearch cluster) hosts multiple language indices for operational efficiency.
- **The Unforgettable Mental Model:** The **Multilingual Concierge**. The concierge (autocomplete system) speaks multiple languages. When you approach in French, they respond in French with French-appropriate suggestions. When you approach in Japanese, they switch to Japanese. They also know that "football" means different things in different regions and adjusts accordingly.
- **The Trap:** Using a single index for all languages. English stemming (running → run) doesn't work for Chinese (no word boundaries) or Arabic (root-based morphology). Always use language-specific analyzers and separate indices.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Each language/region has its own autocomplete index with language-specific analyzers — stemming for English, character segmentation for Chinese, root-based analysis for Arabic. The user's language is detected from headers or profile, and the appropriate index is queried. Cross-language search supports transliteration (pinyin → Chinese). Region-specific boosting returns locally relevant results. All indices run on the same Elasticsearch cluster for operational efficiency. I'd also support mixed-language queries for bilingual users."

#### How do you design the autocomplete API?
- **The Engine Mechanism (Why it behaves this way):** The API is a simple GET endpoint: GET /autocomplete?q=running&limit=10&locale=en-US. Parameters: q (query string, required), limit (max results, default 10, max 20), locale (language/region), types (filter by result type: product, category, brand), and personalization (boolean, default true). The response is a lightweight JSON array: [{ id, type, text, highlight, image_url?, score }]. The API is heavily cached — CDN caches responses for common queries with short TTLs (30 seconds). Rate limiting prevents abuse (100 requests/minute per user). The API responds in <50ms with a 200 status even if the search engine is slow (returns cached or empty results).
- **The Unforgettable Mental Model:** The **Quick Reference Card**. You ask a quick question (GET /autocomplete?q=...), and you get a short list of answers (JSON array) with just enough info to choose one. The card is pre-printed for common questions (CDN cache). If the librarian is busy (search engine slow), you get the last printed version (cached results) rather than waiting.
- **The Trap:** Returning heavy payloads with full product details. Autocomplete responses should be minimal — just enough for the user to identify and select a suggestion. Full details are fetched when the user selects an item.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The API is GET /autocomplete?q=...&limit=10&locale=en-US&types=product,category. The response is a lightweight JSON array with id, type, text, highlight, and optional image. Results are CDN-cached with 30-second TTL for common queries. Rate limiting prevents abuse at 100 req/min per user. The API targets <50ms response time — if the search engine is slow, it returns cached results or an empty array rather than timing out. Personalization is opt-in via a query parameter. The API is designed to be called on every keystroke, so it must be fast and lightweight."

#### How do you measure and improve autocomplete quality?
- **The Engine Mechanism (Why it behaves this way):** Quality metrics: (1) Click-through rate (CTR) — percentage of autocomplete sessions where the user clicks a suggestion; (2) Zero-result rate — percentage of queries returning no suggestions; (3) Query refinement rate — percentage of users who modify their query after seeing suggestions; (4) Conversion rate — percentage of autocomplete clicks that lead to a purchase/action. A/B testing compares ranking algorithms. Search query logs are analyzed to identify gaps (frequent queries with no results). User feedback (thumbs up/down on suggestions) provides direct quality signals. Offline evaluation uses a held-out query set to measure precision@k and recall@k.
- **The Unforgettable Mental Model:** The **Restaurant Menu Tester**. The restaurant tracks: how often customers order from the suggested specials (CTR), how often customers say "nothing looks good" (zero-result rate), how often customers ask for modifications (query refinement), and how many special orders lead to satisfied customers (conversion). They test new menu items (A/B testing) and analyze what customers actually order (query logs).
- **The Trap:** Only measuring response time without measuring quality. A fast autocomplete that returns irrelevant suggestions is worse than a slightly slower one with great suggestions. Always measure both performance and quality.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I track CTR (click-through rate on suggestions), zero-result rate, query refinement rate, and conversion rate from autocomplete clicks. A/B testing compares ranking algorithms. Query log analysis identifies gaps — frequent queries with no results indicate missing index entries. User feedback (thumbs up/down) provides direct quality signals. Offline evaluation uses a held-out query set to measure precision@k. I'd also track latency percentiles to ensure performance doesn't degrade as the index grows. Quality and performance are equally important."

## 8. Active recall test

1. **What data structure is best for prefix-based autocomplete?**
   - **Explanation:** A Trie (prefix tree) or FST (Finite State Transducer) for small-to-medium datasets. For large datasets, use Elasticsearch with edge-ngram tokenization. Redis caches top results for common prefixes. Target response time is <50ms.

2. **How do you rank autocomplete suggestions?**
   - **Explanation:** Composite score: popularity (search frequency), recency (trending boost), personalization (user history), and business rules (promoted items). All ranking is in-memory using pre-computed scores. A/B testing optimizes signal weights.

3. **When should you use fuzzy matching vs. exact prefix matching?**
   - **Explanation:** Use exact prefix matching as the primary strategy (fast). Fall back to fuzzy matching (1-2 edits, Levenshtein distance) only when fewer than 5 exact results are found. First character must match exactly to limit search space.

4. **How do you keep the autocomplete index fresh?**
   - **Explanation:** Event-driven pipeline: product changes publish to Kafka, indexing workers update the search index within seconds. Popularity scores recalculated hourly from query logs. Index is versioned and swapped atomically.

5. **How do you handle multi-language autocomplete?**
   - **Explanation:** Separate indices per language with language-specific analyzers (stemming for English, character segmentation for Chinese). Detect user language from headers/profile. Support transliteration for cross-language search. Shared cluster for efficiency.

6. **What should the autocomplete API response look like?**
   - **Explanation:** Lightweight JSON array: [{ id, type, text, highlight, image_url?, score }]. CDN-cached with 30-second TTL. Rate limited at 100 req/min. Returns cached or empty results if search engine is slow — never timeout.

7. **How do you measure autocomplete quality?**
   - **Explanation:** CTR (click-through rate), zero-result rate, query refinement rate, and conversion rate. A/B test ranking algorithms. Analyze query logs for gaps. Offline evaluation measures precision@k on held-out query sets.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a search autocomplete system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a search autocomplete system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
