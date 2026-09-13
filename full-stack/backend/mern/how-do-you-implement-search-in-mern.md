# How do you implement search in MERN

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app launched last month with 500 products. Search worked fine — users typed "laptop" and got 15 results. Now you have 50,000 products. A user searches for "wireless headphones" and the page hangs for 8 seconds. The database is doing a full collection scan because you're using `$regex` without an index. Another user types a special character like `.*(` in the search box, and your Express server crashes with a ReDoS (regular expression denial of service) attack because you passed raw user input into `$regex`. Meanwhile, your React app is firing an API call on every keystroke, flooding your backend with unnecessary requests. This is the moment you realize search is not just "find stuff in the database" — it's a full-stack problem that requires frontend debouncing, backend validation, proper indexing, and security.

## 2. The Analogy — Make the Mechanic Obvious

Think of search like a library with a catalog system. When you walk into a library and ask the librarian for books about "JavaScript," they don't run through every shelf scanning every spine. They check the catalog index first — a pre-organized list that points to where relevant books are located. The catalog is faster because it's optimized for lookups.

Now imagine a library without a catalog. The librarian has to walk through every book, reading every title, to find matches. That's what `$regex` without an index does in MongoDB — it scans every document.

The librarian also checks your request before searching. If you hand them a note that says "find me books titled [blank blank blank everything explode]," they'd recognize that as suspicious and sanitize it. That's input validation — preventing malicious patterns from crashing the system.

On the frontend, imagine you ask the librarian a question, then change your mind and ask a different one before they finish the first. A good librarian stops the first search and starts the new one. That's request cancellation — abandoning stale requests so the UI always shows results for the current search term.

## 3. The Full Explanation — How It Actually Works

Search in MERN is a full-stack integration problem that spans four layers: the React frontend, the Express backend, the MongoDB database, and the network between them. Each layer has specific responsibilities, and they have to work together correctly.

**Frontend layer:** The search input in React needs debouncing. Without debouncing, typing "hello" fires 5 API calls (h, he, hel, hell, hello). Debouncing waits 300ms after the user stops typing before making the request. If they keep typing, the timer resets. This reduces server load from hundreds of requests to just one per actual search intent. The frontend also needs request cancellation — if the user types "lap" then quickly changes it to "laptop," the "lap" request might still be in flight. Without cancellation, "lap" could return after "laptop," showing stale results. Libraries like TanStack Query handle this automatically by canceling previous requests when a new one starts.

**Backend layer:** Express receives the search query and must validate it first. Validation means checking the query length (rejecting 10,000-character strings), escaping special regex characters (converting `.*(` to `\.\*\(`), and sanitizing input to prevent injection attacks. The backend then constructs the MongoDB query. For basic search, you might use `$regex` with case-insensitive matching. For production search, you use text indexes with the `$text` operator, which is faster and provides relevance scoring. The backend should always limit results (typically 20-50 per page) to prevent returning thousands of documents over the network.

**Database layer:** MongoDB offers two main search approaches. The first is `$regex`, which scans documents matching a pattern. It's flexible but slow without indexes and dangerous with unescaped user input. The second is text search with `$text`, which requires creating a text index on searchable fields. Text indexes are pre-built structures that MongoDB uses for fast lookups. They support word stemming (matching "run" when searching "running"), stop word removal (ignoring common words like "the"), and relevance scoring (ranking results by how well they match). The tradeoff is that text indexes are large and slow down write operations — every document insert or update must update the index.

**Security layer:** The biggest security risk in search is ReDoS — regular expression denial of service. Certain regex patterns (like nested quantifiers or backreferences) can take exponential time to evaluate. If a user crafts a malicious search string and you pass it directly to `$regex`, your server hangs. The fix is escaping special characters before using `$regex` or avoiding `$regex` entirely in favor of text search. Another risk is returning too much data — unlimited results can exhaust server memory and bandwidth.

**Integration layer:** The frontend and backend must agree on the contract. The URL structure (`/search?q=laptop&page=1`), the response format (array of results with metadata like total count), error handling (structured error responses for empty queries), and loading states all need to be coordinated. When you add filters (category, price range) and sorting, these become additional query parameters that the backend validates and applies to the database query.

## 4. See It In Practice — Real Code or Queries

Here's a complete implementation showing the full stack:

**Frontend — React with debounced search:**

```javascript
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from './api';

// Custom debounce hook
const useDebounce = (value, delay) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};

function SearchBar() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  // Only enable query when debounced value is non-empty
  const { data, isLoading, error } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => api.get(`/search?q=${debouncedQuery}`),
    enabled: !!debouncedQuery,
  });

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products..."
      />
      {isLoading && <p>Searching...</p>}
      {error && <p>Error searching</p>}
      {data && (
        <ul>
          {data.results.map((product) => (
            <li key={product._id}>{product.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Backend — Express with MongoDB text search:**

```javascript
const express = require('express');
const Product = require('./models/Product');
const escapeRegex = require('escape-string-regexp');

const router = express.Router();

// Create text index (run once during setup)
// db.products.createIndex({ name: 'text', description: 'text', category: 'text' })

router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;

    // Validate input
    if (!q || q.length > 100) {
      return res.status(400).json({ error: 'Invalid search query' });
    }

    const skip = (page - 1) * limit;

    // Use text search for production (requires text index)
    const results = await Product.find(
      { $text: { $search: q } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments({ $text: { $search: q } });

    res.json({
      results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// Alternative: basic regex search (escape input to prevent ReDoS)
router.get('/search-basic', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length > 100) {
      return res.status(400).json({ error: 'Invalid search query' });
    }

    // Escape special regex characters to prevent ReDoS
    const escapedQuery = escapeRegex(q);

    const results = await Product.find({
      name: { $regex: escapedQuery, $options: 'i' },
    }).limit(20);

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
```

**Backend — Search with filters and sorting:**

```javascript
router.get('/search', async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, sort = 'relevance', page = 1, limit = 20 } = req.query;

    // Build base query
    const query = { $text: { $search: q } };

    // Add filters
    if (category) {
      query.category = category;
    }
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Build sort object (validate against allowlist)
    const allowedSortFields = ['price', 'name', 'createdAt'];
    const sortObj = {};

    if (sort === 'relevance') {
      sortObj.score = { $meta: 'textScore' };
    } else if (allowedSortFields.includes(sort)) {
      sortObj[sort] = -1; // descending
    }

    const skip = (page - 1) * limit;

    const results = await Product.find(query, { score: { $meta: 'textScore' } })
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});
```

**Backend — Autocomplete suggestions:**

```javascript
router.get('/suggestions', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const escapedQuery = escapeRegex(q);

    // Anchored regex (^) for prefix matching
    const suggestions = await Product.find({
      name: { $regex: `^${escapedQuery}`, $options: 'i' },
    })
      .limit(10)
      .select('name'); // Only return the name field

    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: 'Suggestions failed' });
  }
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you implement search in a MERN app?**

The full flow starts on the frontend with a debounced search input. When a user types, we wait 300ms after they stop typing before making the API call. This prevents firing a request on every keystroke. I use TanStack Query to manage the API call — it automatically cancels previous in-flight requests when a new one starts, so the UI never shows stale results from an earlier search term.

On the backend, Express receives the query parameter and validates it first. I check the query length (rejecting anything over 100 characters) and escape special regex characters if using `$regex`. For production search, I create a text index on the searchable fields in MongoDB and use the `$text` operator. Text search is faster than regex because it uses a pre-built index, and it provides relevance scoring. I limit results to 20 per page and return metadata like total count and page numbers for pagination.

I always escape user input before using `$regex` to prevent ReDoS attacks — certain regex patterns can hang the server. For basic apps, `$regex` with escaped input works. For production apps with complex search needs, I'd consider Elasticsearch or Algolia.

**Q: How do you implement debounced search in React?**

I create a custom debounce hook that stores the debounced value in state. Inside a `useEffect`, I set a timeout that updates the debounced value after a delay (typically 300ms). The cleanup function clears the timeout if the value changes before the delay expires — this is what creates the debounce behavior. When the user types "hello" quickly, the timeout resets after each character, and only the final value triggers the API call.

I use the debounced value in a TanStack Query hook, enabling the query only when the debounced value is non-empty. TanStack Query handles request cancellation automatically — when a new query starts, it aborts the previous one. This prevents the race condition where an earlier request returns after a later one, showing stale results.

**Q: How do you implement full-text search with MongoDB?**

First, I create a text index on the fields I want to search: `db.products.createIndex({ name: 'text', description: 'text', category: 'text' })`. This builds a special index structure optimized for text search. Then I query using the `$text` operator: `Model.find({ $text: { $search: query } })`.

Text search has several advantages over regex: it supports word stemming (searching "run" matches "running"), stop word removal (ignores common words like "the"), and relevance scoring. I can sort results by relevance using `{ score: { $meta: 'textScore' } }`. The limitations are that you can only have one `$text` query per search, it doesn't support partial word matching (only full words), and it's language-specific. For apps that need fuzzy matching, autocomplete, or faceted search, I'd use a dedicated search engine like Elasticsearch.

**Q: How do you implement search with filters and sorting?**

I design the API to accept query parameters for search, filters, and sorting: `GET /api/search?q=laptop&category=electronics&minPrice=100&sort=-price&page=1`. On the backend, I build the MongoDB query dynamically. The base query uses `$text` for the search term. Then I conditionally add filter conditions — if `category` is provided, I add `query.category = category`. If price range is provided, I add a `$gte` and `$lte` condition on the price field.

For sorting, I validate the sort field against an allowlist to prevent abuse (users shouldn't be able to sort by arbitrary fields). If the sort is "relevance," I sort by the text score. Otherwise, I sort by the specified field. I apply skip and limit for pagination in the same database query — never fetch all results and filter in JavaScript, which is inefficient. I return metadata (total count, current page, total pages) so the frontend can build pagination controls.

**Q: How do you implement autocomplete/search suggestions?**

I create a dedicated suggestions endpoint separate from the main search. The frontend calls this with a shorter debounce (200ms) as the user types. On the backend, I use an anchored regex pattern (`^query`) to match prefixes — this finds names that start with what the user typed. I limit results to 10 and only select the fields needed for display (typically just the name and maybe an image). Returning full documents wastes bandwidth.

For large datasets, I might maintain a separate suggestions collection with common search terms — this is faster than querying the main collection. On the frontend, I display suggestions in a dropdown below the search input. When the user selects a suggestion, I populate the search input and trigger the full search. This pattern provides a responsive autocomplete experience without overloading the database.

## 6. The Traps — What Goes Wrong in Production

**Using `$regex` without escaping user input** is the most dangerous trap. If a user types a malicious regex pattern like `((a+)+)+$`, it can cause catastrophic backtracking and hang your server. This is a ReDoS attack. Always escape special characters before using `$regex`, or better yet, use text search which doesn't have this vulnerability.

**Not limiting results** causes performance problems at scale. Returning 10,000 documents over the network wastes bandwidth and memory. Always apply a limit (typically 20-50) and use pagination for larger result sets.

**Creating text indexes on too many fields** slows down write operations. Every insert or update must update the index, and text indexes are large. Only index fields that users actually search against.

**Not debouncing the frontend** floods your backend with unnecessary requests. Typing "hello" fires 5 API calls without debouncing. At scale, this can overwhelm your server. Debounce to 300ms to wait until the user stops typing.

**Not canceling previous requests** causes stale results. If a user types "lap" then quickly changes to "laptop," both requests are in flight. If "lap" returns after "laptop," the UI shows results for the wrong term. TanStack Query handles this automatically with request cancellation.

**Filtering in JavaScript after fetching** is inefficient. Fetching 1,000 documents and then filtering by category in JavaScript loads unnecessary data from the database. Always apply filters in the database query itself.

**Not validating sort fields** allows users to sort by any field, which can expose sensitive data or cause performance issues. Validate sort fields against an allowlist before applying them to the query.

**Forgetting pagination metadata** makes it impossible to build pagination controls on the frontend. Always return total count, current page, and total pages along with the results.

## 7. Compare With Related Concepts

**Search vs. filtering:** Search finds items matching a text query across multiple fields. Filtering restricts results based on exact field values (category, price range). Search uses text indexes or regex; filtering uses standard equality or range queries. Use search when the user is looking for something by name or description. Use filters when the user wants to narrow down results by specific attributes.

**Text search vs. regex search:** Text search uses pre-built indexes, supports stemming and relevance scoring, and is faster at scale. Regex search scans documents, supports partial matching and complex patterns, but is slower without indexes and vulnerable to ReDoS. Use text search for production search functionality. Use regex only for simple, low-volume search or when you need pattern matching that text search doesn't support.

**Client-side search vs. server-side search:** Client-side search fetches all data once and filters in the browser. Server-side search queries the database with each request. Client-side works for small datasets (under a few thousand items) and provides instant results. Server-side is necessary for large datasets and when you need advanced features like relevance scoring. Use client-side search only when the dataset is small and changes infrequently.

**Debouncing vs. throttling:** Debouncing waits until the user stops typing before triggering the action. Throttling triggers the action at most once per time interval (e.g., once per second). For search, debouncing is better because you only want to search when the user finishes their thought. Throttling is better for scroll events or resize handlers where you want continuous updates at a controlled rate.

**Pagination vs. infinite scroll:** Pagination divides results into discrete pages with page numbers. Infinite scroll automatically loads more results as the user scrolls down. Pagination gives users control and lets them jump to specific pages. Infinite scroll provides a smoother experience but makes it hard to reach the end of results. Use pagination for e-commerce where users want to jump to later pages. Use infinite scroll for social feeds where the content is constantly updating.

## 8. 🧠 The Memory Hook — What Sticks

Search is a library catalog, not a shelf scan. Build the index first, validate the request, debounce the patron, and never let a single query walk the entire collection.
