# How do you implement search

## 1. The Real-World Problem — When You Actually Hit This

You ship a products page with a search bar. In development it feels instant. Your seed data has 300 products and you write `Product.find({ name: { $regex: q, $options: 'i' } })` and it works.

Two months later you have 180,000 products. A user types `star` and the page hangs for four seconds. MongoDB CPU spikes to 100 percent. Another user pastes `.*.*.*.*.*(` into the search box and the request never returns. Your logs show a single query running for 28 seconds. Meanwhile the frontend sends `?q=` with an empty string and your API happily returns the first 10,000 products, blowing up the response size. You add pagination with `skip` and the first few pages are fine, but page 2,000 takes eight seconds. Search results come back in random order so the most relevant product is on page six.

Every one of those failures comes from the same place. Search looks simple but it touches query parameter handling, database indexing, input escaping, ranking, and pagination all at once. Get any one wrong and production search feels broken or falls over.

## 2. The Analogy — Make the Mechanic Obvious

Picture a huge city flea market with thousands of stalls and a single info booth at the entrance.

A shopper walks up and hands the booth clerk a scrap of paper with a word on it. That scrap is your `?q` query parameter. The clerk has to read it carefully first. Is it blank? Is it 500 characters of scribble? Did the shopper write wild symbols that will confuse the search? That careful reading is query parameter handling.

Now the clerk has two ways to find matching stalls.

Option one is to walk every aisle and read every price tag letter by letter, case insensitive, looking for a substring. That is a MongoDB `$regex` search. It is flexible. It can find `star` inside `Starlight` or `allstar` because it checks substrings. But the clerk has to visit every single stall. On a market with thousands of stalls that walk takes forever.

Option two is to use the giant word board the market built overnight. Every word that appears in any stall title or description is written on the board with a list of stalls that contain it. The words are reduced to their base form so `running` and `run` point to the same list, and tiny words like `the` are left off. That board is a MongoDB text index. The clerk just looks up the word and gets an instant list. It is fast but it only works for whole words, not partial substrings, and the board had to be built ahead of time and kept updated.

Before using either method the clerk scrubs the shopper's note to neutralize wild symbols like `.*+?^$`. Without scrubbing, a malicious note can make the aisle-walk search take exponential time. That scrubbing is escaping user input to prevent ReDoS.

The board also writes a small number next to each stall saying how strongly that word matters there. A stall with the word in its name gets a higher number than one where it only appears in the fine print. Sorting by that number is relevance ranking with `textScore`.

Finally the clerk does not dump all 400 matching stalls on the shopper at once. They hand back 20 at a time and keep a bookmark for the next batch. That is pagination. Flipping to page 500 by counting from the start every time is slow, which is why deep `skip` gets expensive.

In our system the shopper is the browser, the scrap is `req.query.q`, the clerk is your Express route handler, the aisle walk is `$regex`, the word board is the text index, scrubbing is escaping, the number is `$meta: 'textScore'`, and the 20-at-a-time handoff is `limit` plus `skip` or a cursor.

## 3. The Full Explanation — How It Actually Works

Search in an Express plus MongoDB app is a small pipeline. Express pulls the raw strings out of the URL, you clean and validate them, you translate them into a MongoDB query, MongoDB uses an index or a full scan to find matches, you sort by relevance, slice a page, and return it. Every step has a decision that affects security or speed.

Query parameter handling comes first. In Express every `?q=hello&page=2` value arrives in `req.query` as a string, or as an array if the client repeats the key. It is never a number or a boolean until you parse it. You need to trim whitespace, treat a missing or empty `q` as a deliberate case, cap the length, and parse numbers like `page` and `limit` with an allowlist. A common pattern is to coerce `page` and `limit` to integers, clamp `limit` to a maximum such as 50, and default `q` to an empty string. You also allowlist filter fields like `category` or `minPrice` so a client cannot inject an arbitrary MongoDB operator. If validation fails you return 400 right away rather than hitting the database.

Escaping user input is the security step for regex search. MongoDB regex runs inside the database engine. If you build it from raw user input, characters like `. * + ? ^ $ { } ( ) | [ ] \` have special meaning. A string like `a{1000}` or a nested `.*.*.*(` pattern can make the regex engine backtrack for a very long time. That is ReDoS, short for Regular Expression Denial of Service. The fix is to escape those characters before you create the regex, to cap `q` length to something like 100 characters, and to put a time limit on the query with `maxTimeMS`. For production search the better fix is to avoid regex entirely and use a text index, because text search does not run a regex at all.

The trade-off between regex and text index is the core database decision. A `$regex` query with `$options: 'i'` does a case-insensitive substring match. Without help it scans every document. MongoDB can only use a B-tree index for a regex when it is anchored to the start like `^star` and even then only with a case-sensitive match or a case-insensitive index. Everything else is a full collection scan. That is why it feels fine with 300 documents and terrible with 180,000. It does support partial matching though, so `sta` matches `star`.

A text index is an inverted index. At index build time MongoDB tokenizes each indexed string field, stems each word to its root, drops stop words, and stores a map from word to the documents that contain it. At query time `$text: { $search: "star running" }` looks up whole words, handles stemming so `running` matches `run`, and calculates a relevance score based on how often the word appears and how rare it is. It is far faster than a regex scan and gives ranking for free. The price is that you can only have one text index per collection, you can use only one `$text` clause per query, it does not do substring or prefix matching, it is language sensitive, and it adds write cost and storage. You choose the fields at index creation time and you should only index fields users actually search.

Ranking falls out of that choice. A text search produces a `textScore` on each result. You project it with `{ score: { $meta: 'textScore' } }` and sort with `.sort({ score: { $meta: 'textScore' } })`. A regex search has no relevance score. If you need ordering you have to sort by something explicit like `createdAt` or name, which is not relevance. Mixing a text score sort with other sorts needs care because MongoDB sorts by the single sort document you give it.

Pagination slices results into pages so you never return everything at once. Offset with `skip` and `limit` is simple for the first few pages, but cost grows with the offset, and a cursor with a stable field like `_id` stays fast and consistent on deep or real-time lists. For the full trade-off, stable ordering, index needs, and when to pick each, see [pagination](./how-do-you-implement-pagination.md). With text search, relevance scores are not stable cursors, so teams often keep `skip` for shallow ranked pages and use a cursor for time-ordered feeds.

Combining search with filters and sort happens in one database query, not in JavaScript after the fetch. You build a filter object, add the `$text` clause at the top level if you are using it, then add allowlisted equality or range filters for things like `category` or `price`. With regex search you typically combine with `$and` and `$or` for multi-field matching. All of it is one `find`. You validate every filter value before adding it, because an unvalidated `minPrice` coming in as a string can break a range query or be used for injection — see [NoSQL injection prevention](./how-do-you-prevent-nosql-injection.md).

When this should move to a dedicated engine is a scale and product question. MongoDB text search covers basic keyword matching, stemming, and simple ranking on moderate data. When you need fuzzy matching so `recieve` finds `receive`, typo tolerance, autocomplete that completes as the user types, faceted counts like how many results in each category, field boosting so a match in `name` outranks `description`, or search that stays fast at millions of documents, you move to Elasticsearch, Meilisearch, or Algolia. The trade-off is operational complexity and keeping the search index in sync with MongoDB.

For observability, log the normalized `q`, the parsed filters, the result count, and slow queries caught by `maxTimeMS`. For reliability, enforce timeouts and never return an unbounded result set when `q` is empty. Search has no transactional concerns, but any async handler that waits for MongoDB needs to make sure a rejection does not crash the process. In Express 5 a rejected promise in an async handler is forwarded to the error handler automatically, but wrapping with an async handler helper keeps behavior consistent across versions and avoids unhandled rejections.

## 4. See It In Practice — Real Code or Queries

The examples below are runnable Express and Mongoose. Each snippet includes its imports and handles async errors explicitly. `maxTimeMS` and input limits are included where they matter.

Mongoose schema with a text index and a regular index for the regex fallback:

```js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  description: { type: String, required: true },
  category: { type: String, required: true, index: true },
  price: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

// One text index per collection. Only index fields users search.
productSchema.index({ name: 'text', description: 'text' });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
```

Small helper that escapes regex special characters. Reuse this anywhere you build a regex from user input:

```js
function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = escapeRegExp;
```

Express route that handles query parameters, escapes input, uses regex search for partial matches, validates pagination, and protects against ReDoS. Any async handler awaiting IO is wrapped so rejections go to the error handler:

```js
const express = require('express');
const Product = require('./product-model');
const escapeRegExp = require('./escape-regexp');

const router = express.Router();

// Tiny async wrapper so rejected promises reach Express error handling.
// If you are on Express 5 this forwarding already happens, but the wrapper is still safe.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

router.get('/products/search', asyncHandler(async (req, res) => {
  // Query params arrive as strings. Normalize and validate before querying.
  const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (rawQ.length === 0) {
    return res.status(400).json({ error: 'Missing search query: provide ?q=' });
  }
  if (rawQ.length > 100) {
    return res.status(400).json({ error: 'Query too long: max 100 characters' });
  }

  const escaped = escapeRegExp(rawQ);
  const pattern = new RegExp(escaped, 'i');
  const { page, limit, skip } = parsePagination(req.query);

  // Allowlisted filters only. Never spread req.query directly into a Mongo query.
  const andClauses = [];
  andClauses.push({
    $or: [
      { name: { $regex: pattern } },
      { description: { $regex: pattern } }
    ]
  });

  if (typeof req.query.category === 'string' && req.query.category.trim()) {
    andClauses.push({ category: req.query.category.trim() });
  }
  if (req.query.minPrice !== undefined) {
    const minPrice = Number(req.query.minPrice);
    if (Number.isFinite(minPrice)) {
      andClauses.push({ price: { $gte: minPrice } });
    }
  }

  const filter = { $and: andClauses };

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).maxTimeMS(2000).lean(),
    Product.countDocuments(filter).maxTimeMS(2000)
  ]);

  res.json({ items, page, limit, total });
}));

module.exports = router;
```

Same feature using a text index with relevance ranking. Notice the security and performance differences:

```js
const express = require('express');
const Product = require('./product-model');

const router = express.Router();

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

router.get('/products/search', asyncHandler(async (req, res) => {
  const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (rawQ.length === 0) {
    return res.status(400).json({ error: 'Missing search query: provide ?q=' });
  }
  if (rawQ.length > 100) {
    return res.status(400).json({ error: 'Query too long: max 100 characters' });
  }

  const { page, limit, skip } = parsePagination(req.query);

  // Build one query object. $text must be at the top level.
  // No regex escaping needed because $text does not run a regex.
  const filter = { $text: { $search: rawQ } };

  if (typeof req.query.category === 'string' && req.query.category.trim()) {
    filter.category = req.query.category.trim();
  }
  if (req.query.minPrice !== undefined) {
    const minPrice = Number(req.query.minPrice);
    if (Number.isFinite(minPrice)) {
      filter.price = { $gte: minPrice };
    }
  }

  const [items, total] = await Promise.all([
    Product.find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .skip(skip)
      .limit(limit)
      .maxTimeMS(2000)
      .lean(),
    Product.countDocuments(filter).maxTimeMS(2000)
  ]);

  res.json({ items, page, limit, total });
}));

module.exports = router;
```

Cursor pagination for time-ordered search results. This avoids the deep-offset cost by seeking past the last seen `_id`. For the complete pagination mechanics including encoding, total-count cost, and index setup, see [pagination](./how-do-you-implement-pagination.md):

```js
const express = require('express');
const mongoose = require('mongoose');
const Product = require('./product-model');
const escapeRegExp = require('./escape-regexp');

const router = express.Router();

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/products/search', asyncHandler(async (req, res) => {
  const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (rawQ.length === 0) {
    return res.status(400).json({ error: 'Missing search query: provide ?q=' });
  }
  if (rawQ.length > 100) {
    return res.status(400).json({ error: 'Query too long: max 100 characters' });
  }

  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;

  const escaped = escapeRegExp(rawQ);
  const pattern = new RegExp(escaped, 'i');

  const filter = {
    $or: [
      { name: { $regex: pattern } },
      { description: { $regex: pattern } }
    ]
  };

  // cursor is an _id from the previous page's last item
  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    filter._id = { $gt: new mongoose.Types.ObjectId(cursor) };
  }

  const items = await Product.find(filter)
    .sort({ _id: 1 })
    .limit(limit + 1)
    .maxTimeMS(2000)
    .lean();

  const hasMore = items.length > limit;
  if (hasMore) items.pop();
  const nextCursor = hasMore ? String(items[items.length - 1]._id) : null;

  res.json({ items, nextCursor, hasMore });
}));

module.exports = router;
```

These three routes cover the decisions you explain in an interview. The first shows raw query handling and safe regex, the second shows when and how to use a text index with ranked results, and the third shows a cursor-based alternative to offset pagination — for the full pagination pattern including stable sort and opaque cursors, see [pagination](./how-do-you-implement-pagination.md).

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you implement search in Express with MongoDB?**

You read `req.query.q`, normalize it to a trimmed string, validate length, and then build a MongoDB query. For substring search you use `Model.find({ $or: [{ name: { $regex: escaped, $options: 'i' } }, { description: { $regex: escaped, $options: 'i' } }] })` where `escaped` is the user input after escaping regex specials. For keyword search you create a text index with `productSchema.index({ name: 'text', description: 'text' })` and query with `Model.find({ $text: { $search: q } }, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } })`. In both cases you add validated filters like `category` and `price` to the same query, apply `skip` and `limit` or a cursor, set `maxTimeMS`, and return JSON with the items plus pagination info. You never spread `req.query` directly into the filter because that can inject operators.

**Q: What is the difference between a regex search and a text index search?**

A regex search checks for a substring pattern inside a field. It is flexible and does partial matching so `sta` finds `star`, but it usually scans every document unless the regex is a prefix anchored with `^` that can use a normal B-tree index. It has no notion of relevance, is case sensitive unless you pass `i`, and is vulnerable to ReDoS if you do not escape input. A text index is an inverted index built ahead of time. It tokenizes and stems words so `running` matches `run`, drops stop words, and maps each word to the documents that contain it. Queries are whole-word lookups that are very fast, give you a relevance score you can sort by, and are case insensitive by default. The limits are that you can only have one text index per collection, you can only use one `$text` clause per query, it does not do substring matching, and it costs storage and write time.

**Q: How do you prevent ReDoS attacks in search?**

ReDoS happens when a crafted pattern makes the regex engine backtrack exponentially. You prevent it at three levels. First, escape the user input with `input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` so specials become literals. Second, cap the input length to something like 100 characters and reject longer inputs with 400. Third, put a time bound on the database work with `maxTimeMS(2000)` so a slow query is killed. The strongest prevention is to not use regex for general search at all and use a text index or a dedicated search engine, because those paths do not evaluate user-controlled regex.

**Q: How do you handle query parameters safely in Express?**

Treat everything in `req.query` as untrusted strings. Trim `q`, normalize missing values, and enforce a length limit. Parse numeric params with `parseInt` or `Number` and clamp them to a safe range, for example `limit` between 1 and 50 and `page` at least 1. Allowlist any filter keys so only `category`, `minPrice`, `maxPrice` and similar known fields can affect the query. Reject unknown or malformed values with 400. For an empty or whitespace-only `q`, return 400 or a defined empty result rather than running a query that matches everything. Always validate before building the Mongo filter.

**Q: How do you rank search results by relevance?**

With a text index MongoDB computes a `textScore` per document that reflects how well it matches the search terms. You ask for it in the projection and sort by it: `Product.find({ $text: { $search: q } }, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } })`. Documents where the term appears in a heavily weighted field or appears multiple times score higher. With regex search there is no built-in relevance, so you either sort by a proxy like `createdAt` or implement your own scoring, which is a sign you should switch to text search or a search engine. If you need field boosting in MongoDB text search you can set weights in the index: `schema.index({ name: 'text', description: 'text' }, { weights: { name: 10, description: 2 } })`.

**Q: How do you combine search with filters, sorting, and pagination?**

Build a single filter object. Start with the search clause, either `{ $text: { $search: q } }` or an `$or` of regex conditions, then add validated filter fields directly: `if (category) filter.category = category`. Range filters add operators like `filter.price = { $gte: minPrice }`. Then chain `.sort()`, `.skip()`, `.limit()` and `maxTimeMS` on the same `find`. Do not fetch all documents and filter in JavaScript. For pagination, `skip` and `limit` work for shallow pages but get slow deep. Cursor pagination with `{ _id: { $gt: lastId } }` and `limit` stays fast. Remember that `$text` must be at the top level of the query and only one `$text` is allowed per query, so you cannot put it inside an `$or`.

**Q: When should you move from MongoDB text search to a dedicated search engine?**

Stay with MongoDB text search when you need simple keyword matching, stemming, stop word handling, and basic relevance ranking on a moderate dataset and you want to avoid extra infrastructure. Move to Elasticsearch, Meilisearch, or Algolia when the product requires fuzzy or typo-tolerant matching, autocomplete as the user types, faceted counts and filtering, synonyms, language-specific analysis, tunable relevance with field boosting and custom scoring, or search that stays fast at millions of documents with high query volume. The cost is running and syncing another system, so you make the switch when the search experience directly impacts the product and MongoDB can no longer deliver it cleanly.

## 6. The Traps — What Goes Wrong in Production

Passing raw user input into `$regex` without escaping. Characters like `.*+?^${}()|[]\` turn a simple search into a complex pattern. An attacker can send a string that makes the engine backtrack for seconds and block the event loop or the database. Escape every search term before building a regex and cap the length.

Running regex search on a large collection with no usable index. An unanchored regex forces a full collection scan. It works in development with a few hundred documents and becomes a multi-second query in production. Either anchor the pattern with `^` where the product allows it, or switch to a text index for keyword search.

Treating an empty `q` as match everything. If `?q=` or `?q= ` builds an empty regex or an empty `$text` query or you fall back to `find({})`, you return a huge unbounded result set. Validate that `q` is a non-empty trimmed string after length checks, and return 400 or a defined no-result response when it is not.

Using `skip` and `limit` for deep pagination and assuming it stays fast. Deep offsets get slower and unstable as data shifts. Prefer a bounded `skip` for shallow pages and a cursor for large or real-time lists — the mechanics and index requirements are covered in detail in [pagination](./how-do-you-implement-pagination.md).

Creating a text index on too many fields because it seems convenient. Every indexed field adds tokens to the inverted index. That index costs storage and slows down every write that touches those fields. Only include fields users actually search and set weights if some matter more.

Assuming text search does substring or prefix matching. It does not. Searching for `sta` will not match `star` in a text index. That surprises teams that switch from regex and then file a bug about missing results. If the product needs partial matching you need regex with safe limits or a search engine with edge ngrams or autocomplete support.

Forgetting to validate pagination parameters. `parseInt(undefined)` is `NaN`, a client can send `?page=-5` or `?limit=1000000`. Unclamped `skip` can be negative or enormous and cause slow queries or huge memory use. Always parse, clamp, and default pagination before using it.

Not bounding database work. Even with safe regex, a very common word like `a` on a big collection can match many documents. Without `maxTimeMS` and a reasonable `limit` that query can run for a long time and hold resources. Set `maxTimeMS` and a hard max `limit` on every search path.

Putting `$text` inside an `$or` or using two `$text` clauses. MongoDB requires `$text` at the top level and allows only one per query. Nesting it or combining two searches in one query throws an error. Structure the filter so `$text` is a top-level key and additional filters sit alongside it.

Spreading `req.query` directly into the Mongo filter. An attacker can send `?price[$gt]=0` or similar bracket syntax that some parsers turn into an operator object. That is a NoSQL injection path — see [NoSQL injection prevention](./how-do-you-prevent-nosql-injection.md) for the full operator allowlist pattern. Allowlist fields and validate types rather than passing raw query objects to Mongoose.

## 7. Compare With Related Concepts

**Regex search versus text index versus dedicated search engine.** Regex scans and checks substrings, flexible but slow on large data and hard to rank. Text index uses a prebuilt inverted index, fast whole-word search with relevance but no substring. A dedicated engine builds a richer inverted index with analyzers, fuzzy matching, autocomplete, facets, and tunable scoring. Rule of thumb: regex for tiny data or admin prefix lookups on indexed fields, text index for moderate keyword search inside MongoDB, dedicated engine when search is a core product feature.

**Search versus filter.** Search is a relevance-ranked, tokenized, language-aware match against free text, where ordering by `textScore` matters. Filter is an exact or range match like `category === 'books'` or `price >= 20`, where correctness matters and ordering is separate. In code, search drives the `$text` or `$or` regex clause, filter adds exact fields beside it. Mixing them is normal but you should keep the mental distinction so sorting and pagination decisions are clear.

**MongoDB `$text` versus Atlas Search versus Elasticsearch or Meilisearch.** MongoDB `$text` is built in, zero extra infrastructure, covers stemming and basic ranking. Atlas Search provides Lucene-based indexing inside Atlas with richer features like autocomplete and facets without self-hosting. Elasticsearch and Meilisearch are standalone engines with the most control over analyzers, relevance tuning, and scale but require running and syncing another system. Choose MongoDB `$text` when you want the simplest in-database search, Atlas Search when you are on Atlas and need more without operating a cluster, and Elasticsearch or Meilisearch when search is central to the product at scale.

**Skip and limit versus cursor pagination.** Both slice results but with different costs. The full comparison — offset cost, cursor seek, stable sorting, and when each fits ranked versus time-ordered results — is covered in [pagination](./how-do-you-implement-pagination.md). In search, keep `skip` for shallow ranked pages and prefer a cursor for deep or live feeds.

## 8. 🧠 The Memory Hook

If regex is walking every aisle to read every tag, a text index is the word board at the market entrance. Scrub the shopper's scribble, look up the word on the board, sort stalls by the number next to them, and hand back 20 at a time. Skip the board and you walk every aisle with a pattern that can trap you.
