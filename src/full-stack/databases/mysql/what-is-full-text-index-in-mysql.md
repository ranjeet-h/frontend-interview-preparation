# Full-Text Indexing in MySQL: Inverted Indexes, `MATCH() AGAINST()`, and Search Modes

## 1. Why This Exists — The Problem First

Imagine you are running an e-commerce platform that just scaled past two million products. The product catalog team asks for a search feature so customers can type phrases like `noise cancelling wireless headphones` into a search bar.

A junior developer implements the backend search endpoint with a standard SQL query:

```sql
SELECT product_id, title, price, description 
FROM products 
WHERE description LIKE '%wireless headphones%';
```

In local development with 50 test products, the query returns in 2 milliseconds. But in production with two million rows, disaster strikes.

Standard B-Tree indexes store values in sorted, lexicographical order. They work brilliantly when searching for exact matches (`WHERE id = 42`) or prefixes (`WHERE title LIKE 'Sony%'`) because the database engine can perform a binary search down the tree structure to locate the range of matching leaf nodes. 

However, when a search pattern begins with a leading wildcard (`%wireless...`), a B-Tree index is completely useless. The database engine cannot know where the target substring starts inside any string. MySQL is forced to execute a **Full Table Scan**: it reads every single data page from disk into the InnoDB buffer pool, parses millions of text columns row by row, and evaluates the substring match in memory.

During peak holiday traffic, thirty concurrent shoppers execute searches simultaneously. MySQL locks up, CPU utilization hits 100%, the buffer pool is flooded with uncached disk reads, query execution times climb past 8 seconds, and your API gateway begins returning `504 Gateway Timeout` errors.

Even worse, `LIKE` queries provide binary results: a row either matches or it does not. There is no concept of **relevance ranking**. A product description mentioning "wireless headphones" once in a footnote is treated with the exact same priority as a product whose title and description feature the phrase ten times.

MySQL Full-Text Indexing exists to solve both problems: it eliminates full table scans for arbitrary text searches and ranks matching documents by calculated relevance.

---

## 2. The Analogy — Make It Obvious

Think of a 1,000-page medical encyclopedia.

If you want to find every disease related to "headache", you have two ways to search the book:

1. **The Forward Search (Like a Table Scan):** You open page 1 and read every sentence. Then page 2, page 3, all the way to page 1,000. By the time you finish, you have identified every page mentioning "headache". It took you six hours.
2. **The Inverted Index (The Index at the Back of the Book):** You flip directly to the alphabetical index at the back of the book, look under the letter **H**, locate the word **"headache"**, and see an entry: `pages 42, 118, 503, 721`. You immediately flip to those four specific pages. It took you three seconds.

```txt
Forward Index (Standard Rows):
Row 1 -> "Professional noise cancelling wireless headphones"
Row 2 -> "Budget wired headphones for studio recording"
Row 3 -> "Fast wireless charging dock for mobile devices"

Inverted Index (Full-Text Index):
"cancelling" -> [Row 1]
"charging"   -> [Row 3]
"headphones" -> [Row 1, Row 2]
"wireless"   -> [Row 1, Row 3]
```

Here is how each technical component maps to this real-world book index:

- **The Document:** Each database row (or text column value) is a single page in the encyclopedia.
- **Tokenization:** Breaking sentences down into individual distinct words (tokens) and discarding punctuation.
- **Stopword Filtering:** Common words like "the", "and", "is", "for", and "with" appear on almost every page. Including them in the back-of-the-book index would make the index massive while providing zero search value. They are filtered out.
- **The Inverted Index:** The alphabetical keyword listing at the back of the book that maps each individual word to the exact Document IDs (and word positions) where it appears.
- **Posting List:** The actual array of Row IDs `[Row 1, Row 3]` stored next to the word `wireless`.

---

## 3. How It Actually Works — The Full Explanation

### Inverted Index Architecture in InnoDB

When you create a `FULLTEXT` index on an InnoDB table (supported natively since MySQL 5.6), MySQL does not store the data inside a traditional B-Tree on the raw text string. Instead, it builds an inverted index backed by a collection of internal auxiliary tables.

```txt
+-----------------------------------------------------------------------+
|                             INSERT ROW                                |
|  "High fidelity noise cancelling wireless headphones with mic"        |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
| 1. TOKENIZATION & NORMALIZATION                                       |
|    - Split on whitespace & punctuation                                |
|    - Normalize to lowercase: ['high', 'fidelity', 'noise', ...]       |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
| 2. STOPWORD & LENGTH FILTERING                                        |
|    - Drop stopwords: ('with')                                         |
|    - Drop short tokens (< innodb_ft_min_token_size, default 3)        |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
| 3. IN-MEMORY CACHE (innodb_ft_cache_size)                             |
|    - Buffers new token-to-DocID mappings to avoid write bottlenecks   |
+-----------------------------------+-----------------------------------+
                                    |
                                    v (Flush on commit / batch limit)
+-----------------------------------------------------------------------+
| 4. INNODB FTS AUXILIARY TABLES (FTS_*_INDEX_1 to FTS_*_INDEX_6)        |
|    - Token: 'wireless'   -> DocID: 101 (pos: 4), DocID: 204 (pos: 1)  |
|    - Token: 'headphones' -> DocID: 101 (pos: 5), DocID: 155 (pos: 2)  |
+-----------------------------------------------------------------------+
```

When a write (`INSERT` or `UPDATE`) occurs on a full-text indexed column:

1. **Document ID Assignment (`FTS_DOC_ID`):** InnoDB requires a unique 64-bit integer identifier for each indexed document. If you do not explicitly define an `FTS_DOC_ID` column with a unique index, InnoDB creates a hidden column.
2. **Tokenization:** The text parser reads the column and segments it into discrete words based on delimiters (spaces, commas, periods).
3. **Filtering:**
   - Tokens shorter than `innodb_ft_min_token_size` (default: 3 characters) or longer than `innodb_ft_max_token_size` (default: 84 characters) are discarded.
   - Tokens matching MySQL's internal stopword list (or a user-defined stopword table) are discarded.
4. **Memory Buffering:** Writing directly to disk on every token insert would destroy write performance. InnoDB buffers token-to-DocID pairs in memory (`innodb_ft_cache_size`, default 32MB).
5. **Auxiliary Index Tables:** When the cache fills or the transaction commits, InnoDB flushes the tokens into six auxiliary index tables (`FTS_*_INDEX_1` through `FTS_*_INDEX_6`), partitioned by the hex value of the token's leading character. Partitioning avoids index lock contention across concurrent threads.

---

### Search Syntax: `MATCH() AGAINST()`

Full-text queries do not use standard comparison operators (`=`, `LIKE`, `IN`). They use the dedicated `MATCH()` and `AGAINST()` functions:

```sql
SELECT title, 
       MATCH(title, content) AGAINST('wireless headphones' IN NATURAL LANGUAGE MODE) AS relevance
FROM articles
WHERE MATCH(title, content) AGAINST('wireless headphones' IN NATURAL LANGUAGE MODE);
```

> **Strict Invariant:** The column list inside `MATCH(col1, col2)` must **identically match** the column definition of the `FULLTEXT` index. If your index was declared on `(title, content)`, calling `MATCH(title)` will result in a syntax error or a full table scan because no single-column full-text index exists for `title`.

---

### Search Modes

MySQL supports three search modes, each designed for different querying patterns:

#### 1. Natural Language Mode (`IN NATURAL LANGUAGE MODE`)
This is the default mode if no modifier is specified. It treats the search string as human prose.

- **Relevance Calculation (TF-IDF):** MySQL calculates a floating-point relevance score based on:
  - **Term Frequency (TF):** How many times the search term appears in this specific row.
  - **Inverse Document Frequency (IDF):** How rare the term is across the entire table. Common words across the corpus receive lower weight; rare words receive higher weight.
  - Number of matching words in the row vs total word count.
- Returns rows ordered naturally by descending relevance score.
- Does not recognize boolean operators (`+`, `-`, `*`). A search for `+wireless -wired` searches for the literal words "+wireless" and "-wired".

#### 2. Boolean Mode (`IN BOOLEAN MODE`)
Boolean mode gives developers and advanced users direct control over search logic using specialized operators.

| Operator | Meaning | Example | Behavior |
| :--- | :--- | :--- | :--- |
| `+` | Must be present | `+wireless +headphones` | Both words must exist in the row. |
| `-` | Must NOT be present | `+wireless -bluetooth` | Must contain "wireless", cannot contain "bluetooth". |
| *(no operator)* | Optional (boosts rank) | `+headphones sony` | Must contain "headphones"; ranks higher if "sony" is present. |
| `*` | Prefix wildcard | `headphon*` | Matches "headphone", "headphones", "headphonics". |
| `""` | Exact phrase matching | `"noise cancelling"` | Words must appear adjacent and in this exact sequence. |
| `>` / `<` | Increase / decrease weight | `+wireless +(>bluetooth <wifi)` | Boosts relevance if "bluetooth" is present, penalizes if "wifi" is present. |
| `~` | Negation operator | `+headphones ~studio` | Does not exclude "studio", but lowers the relevance rank of rows containing it. |
| `()` | Subexpression grouping | `+wireless +(headphones \| earbuds)` | Must contain "wireless" and either "headphones" or "earbuds". |

**Key distinction in Boolean Mode:** Boolean queries evaluate fast binary inclusion/exclusion. Unless you explicitly request `MATCH() AGAINST()` in the `SELECT` list, Boolean Mode does not compute expensive TF-IDF ranking for every row.

#### 3. Query Expansion Mode (`WITH QUERY EXPANSION`)
Also known as blind query expansion. It operates in two passes:

1. **Pass 1:** Runs a standard Natural Language search for the initial query terms.
2. **Pass 2:** Examines the most relevant rows returned from Pass 1, extracts the most prominent co-occurring words, adds them to the query, and executes a second search.

*Example:* A search for `"database"` in Pass 1 finds documents containing `"database"`, `"MySQL"`, and `"PostgreSQL"`. Pass 2 automatically re-queries for `"database MySQL PostgreSQL"`, surfacing related content that may not contain the exact word "database".

*Trade-off:* High risk of returning irrelevant results ("query drift") if the first-pass documents contain unrelated topics.

---

### Configuration Parameters

| Parameter | Scope | Default | Description |
| :--- | :--- | :--- | :--- |
| `innodb_ft_min_token_size` | Global (Static) | `3` | Minimum length of words indexed by InnoDB. Words like "AI", "db", "go" are ignored unless changed. |
| `innodb_ft_max_token_size` | Global (Static) | `84` | Maximum word length indexed. |
| `innodb_ft_enable_stopword` | Global / Session | `ON` | Toggles whether built-in stopwords are discarded during indexing. |
| `innodb_ft_user_stopword_table` | Global / Session | `NULL` | Points to a custom user table to replace the default stopword list. |
| `innodb_ft_cache_size` | Global (Static) | `32MB` | In-memory buffer size for pending full-text index updates before flushing to disk. |

> Changing `innodb_ft_min_token_size` requires restarting `mysqld` and executing `ALTER TABLE <table> DROP INDEX <ft_index>, ADD FULLTEXT INDEX <ft_index>(...);` to rebuild existing inverted indexes.

---

## 4. Real Code — See It Working

### Step 1: Schema Setup with Full-Text Indexing

```sql
-- Create an articles table with full-text search capabilities
CREATE TABLE articles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Composite Full-Text Index on title and content
    FULLTEXT KEY ft_title_content (title, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample documentation records
INSERT INTO articles (title, category, content) VALUES
('Getting Started with MySQL Indexing', 'Databases', 'B-Tree indexes speed up equality and range queries dramatically.'),
('Optimizing Full-Text Search in MySQL', 'Databases', 'Full-Text indexes utilize inverted index structures for fast text matching and TF-IDF scoring.'),
('Building Microservices with Node.js', 'Backend', 'Learn how to build asynchronous REST APIs and event-driven architectures with Express and Node.'),
('Advanced SQL Tuning and Execution Plans', 'Databases', 'Use EXPLAIN ANALYZE to identify full table scans, filesorts, and unindexed joins.'),
('Introduction to Full-Text Search Engines', 'Search', 'Comparing MySQL Full-Text capabilities with dedicated search engines like Elasticsearch and OpenSearch.');
```

### Step 2: Querying with Natural Language Mode & Relevance Ranking

```sql
-- Compute relevance score and return matching articles
SELECT 
    id, 
    title,
    ROUND(MATCH(title, content) AGAINST('mysql full-text search' IN NATURAL LANGUAGE MODE), 4) AS score
FROM articles
WHERE MATCH(title, content) AGAINST('mysql full-text search' IN NATURAL LANGUAGE MODE)
ORDER BY score DESC;
```

**Expected Output:**

| id | title | score |
| :--- | :--- | :--- |
| 2 | Optimizing Full-Text Search in MySQL | 1.8412 |
| 5 | Introduction to Full-Text Search Engines | 0.9234 |
| 1 | Getting Started with MySQL Indexing | 0.2451 |

---

### Step 3: Complex Boolean Mode Queries

```sql
-- 1. Must contain "mysql", must contain "search", but MUST NOT contain "elasticsearch"
SELECT id, title
FROM articles
WHERE MATCH(title, content) AGAINST('+mysql +search -elasticsearch' IN BOOLEAN MODE);

-- 2. Exact phrase search
SELECT id, title
FROM articles
WHERE MATCH(title, content) AGAINST('"full table scans"' IN BOOLEAN MODE);

-- 3. Prefix matching: matches "index", "indexing", "indexes"
SELECT id, title
FROM articles
WHERE MATCH(title, content) AGAINST('+mysql +index*' IN BOOLEAN MODE);
```

---

### Step 4: Verifying Index Usage with EXPLAIN

```sql
EXPLAIN SELECT id, title 
FROM articles 
WHERE MATCH(title, content) AGAINST('+mysql +indexing' IN BOOLEAN MODE);
```

**Query Execution Plan Result:**

| id | select_type | table | type | possible_keys | key | key_len | ref | rows | Extra |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | SIMPLE | articles | **fulltext** | ft_title_content | **ft_title_content** | 0 | const | 1 | Using where; Ft_hints: no_ranking |

Notice the access type is `fulltext` and the key utilized is `ft_title_content`. The query bypasses scanning all table rows and directly accesses the posting lists in the `FTS_*` auxiliary tables.

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does an inverted index differ fundamentally from a standard B-Tree index in MySQL?**

A B-Tree index stores complete column values in a sorted tree structure. It is optimized for exact matches (`WHERE status = 'ACTIVE'`) and forward range scans (`WHERE age BETWEEN 20 AND 30` or `WHERE name LIKE 'Alice%'`). However, a B-Tree cannot find words buried inside sentences without scanning every character of every row.

An Inverted Index breaks text into individual tokenized words (terms) and builds a reverse lookup dictionary. Instead of mapping `Row -> Content`, it maps `Word -> [List of Document IDs and Character Positions]`. When searching for a word, MySQL looks up the word in the dictionary in $O(1)$ or $O(\log K)$ time (where $K$ is the unique vocabulary size) and retrieves the exact list of matching rows without reading non-matching rows from disk.

---

**Q: Why does `SELECT * FROM articles WHERE MATCH(title) AGAINST('mysql')` fail with an error when the table has `FULLTEXT(title, content)` defined?**

MySQL requires an exact 1-to-1 match between the column list passed into `MATCH()` and the columns defined in an existing `FULLTEXT` index. 

When you define `FULLTEXT(title, content)`, MySQL combines both fields into a single token stream and builds an index over the composite document. It does not create separate single-column inverted indexes for `title` and `content`. If you run `MATCH(title)`, MySQL cannot find a dedicated full-text index on `(title)` alone and throws: `ERROR 1191 (HY000): Can't find FULLTEXT index matching the column list`. To fix this, you must either query `MATCH(title, content)` or create an additional `FULLTEXT(title)` index.

---

**Q: What is the difference between Natural Language Mode and Boolean Mode regarding relevance scoring and operators?**

Natural Language Mode (default) assumes normal human language input. It ignores boolean operators (`+`, `-`, `*`), calculates a relevance score using TF-IDF (how frequently the word appears in the document vs how rare it is in the corpus), and returns results sorted by relevance.

Boolean Mode parses query operators (`+word` for required, `-word` for excluded, `word*` for prefix wildcards, `"phrase"` for exact sequence). It performs strict boolean logic. Unless explicitly placed in the `SELECT` projection, Boolean Mode skips calculating TF-IDF scores to execute faster. Furthermore, Boolean Mode does not enforce the 50% threshold rule found in older MyISAM natural language searches.

---

**Q: A user searches for "AI in healthcare" or "C programming", but MySQL returns 0 rows even though hundreds of matching records exist. What is happening?**

Two separate full-text parsing filters are causing this behavior:

1. **Minimum Token Size (`innodb_ft_min_token_size`):** By default in InnoDB, words with fewer than 3 characters (e.g., "AI", "C", "Go", "DB") are stripped out during tokenization and never added to the index. Searching for them matches nothing.
2. **Stopword Filtering:** Common words like "in", "the", "with", "and" are on MySQL's built-in stopword list and are discarded.

To support short acronyms, the database administrator must configure `innodb_ft_min_token_size = 2` (or 1) in `my.cnf`, restart the MySQL server, and rebuild the full-text indexes using `OPTIMIZE TABLE` or `ALTER TABLE ... ADD FULLTEXT`.

---

**Q: What is the write performance and operational penalty of maintaining Full-Text indexes on high-throughput OLTP tables?**

Full-text indexing carries a much higher write amplification penalty than B-Tree indexing. When inserting a 500-word blog post:
- A standard B-Tree index inserts one entry.
- A Full-Text index parses 500 words, filters stopwords, normalizes tokens, and inserts dozens of distinct token-to-DocID entries across six internal auxiliary tables (`FTS_*_INDEX_*`).

To mitigate write bottlenecks, InnoDB writes new tokens to an in-memory cache (`innodb_ft_cache_size`) and flushes in batches. However, under high-concurrency `INSERT`/`UPDATE` workloads, full-text maintenance can cause memory pressure, index fragmentation, table lock contention on internal FTS tables, and delayed visibility of newly inserted text until the cache is flushed.

---

**Q: When should an architecture transition from MySQL Full-Text search to Elasticsearch or OpenSearch, and what are the synchronization trade-offs?**

MySQL Full-Text Search is best when search needs are moderate (< 5–10 million rows), queries are straightforward keyword/boolean lookups, and the system benefits from strict ACID consistency with zero extra infrastructure.

You should transition to Elasticsearch/OpenSearch when you require:
1. Advanced search features (fuzzy typo tolerance, phonetic matching, synonyms, rich multilingual stemmers, deep faceted search).
2. Ultra-high scale (distributed sharding across terabytes of text data).
3. Sub-20ms search latency without placing CPU load on the primary transactional database.

The trade-off is architectural complexity: you must build and maintain a synchronization pipeline (e.g., Change Data Capture via Debezium/Kafka or application dual-writes). This introduces **eventual consistency** (a small delay before new database records appear in search results) and failure modes where the search index drifts out of sync with the primary database.

---

## 6. The Traps — What Goes Wrong

### Trap 1: The Invisible 2-Letter Keyword Bug
Developers build search features for technical terms (e.g., "AI", "Go", "OS", "Rx") and find that queries return empty result sets.
- **Why it happens:** `innodb_ft_min_token_size` defaults to `3`. MySQL silently discards any token with length < 3 during both indexing and query parsing.
- **The Fix:** Set `innodb_ft_min_token_size = 2` in `my.cnf`, restart MySQL, and execute `ALTER TABLE articles DROP KEY ft_title_content, ADD FULLTEXT KEY ft_title_content(title, content);`.

---

### Trap 2: Full-Text + Relational Index Conflict
Running queries that combine full-text search with relational filters:

```sql
SELECT * FROM orders 
WHERE tenant_id = 1042 
  AND status = 'COMPLETED' 
  AND MATCH(notes) AGAINST('damaged item' IN BOOLEAN MODE);
```

- **The Problem:** MySQL query optimizer cannot merge a B-Tree index on `(tenant_id, status)` with a Full-Text index on `(notes)` in a single index lookup.
- **What happens:** MySQL chooses either the B-Tree index (and scans text across matching orders) or the Full-Text index (and filters `tenant_id` afterward). If tenant 1042 has 500,000 orders, or if "damaged" appears in millions of orders across all tenants, performance degrades rapidly.
- **The Fix:** If filtering by tenant produces a small subset, use the B-Tree index. If full-text search is primary, evaluate moving multi-tenant search workloads to a dedicated search cluster.

---

### Trap 3: Stopword Silencing in Exact Phrase Searches
A user searches for the exact phrase `"to be or not to be"`.
- **The Problem:** Every single word in that phrase ("to", "be", "or", "not") is in the default stopword list.
- **What happens:** MySQL strips every word out of the query, leaving an empty search string. The query returns zero results.
- **The Fix:** Disable the default stopword list by setting `innodb_ft_enable_stopword = OFF` or configure a domain-specific custom stopword table (`innodb_ft_user_stopword_table`).

---

### Trap 4: Non-Spaced Languages (CJK Support)
Attempting to full-text index Chinese, Japanese, or Korean text with the default tokenizer.
- **The Problem:** The default full-text parser relies on whitespace and punctuation to delimit tokens. CJK languages do not use whitespace between words.
- **What happens:** Entire sentences are treated as a single massive token, making keyword lookups fail completely.
- **The Fix:** Use MySQL's built-in N-gram parser by declaring the index with `WITH PARSER ngram`:

```sql
CREATE FULLTEXT INDEX ft_cjk ON articles(content) WITH PARSER ngram;
```

---

## 7. Compare With Related Concepts

| Feature / Dimension | MySQL Full-Text Index | Standard B-Tree (`LIKE '%...'`) | Dedicated Search Engine (Elasticsearch / OpenSearch) |
| :--- | :--- | :--- | :--- |
| **Underlying Data Structure** | Inverted Index (`FTS_*` auxiliary tables) | Balanced Tree (B+ Tree) | Distributed Inverted Index (Apache Lucene) |
| **Search Mechanism** | Keyword / Phrase token matching | Sequential substring scan across rows | Tokenization, N-grams, BM25 scoring, vectors |
| **Leading Wildcard Query** | Instant lookup via inverted index | Forces Full Table Scan | Instant lookup across tokenized terms |
| **Relevance Scoring** | Built-in TF-IDF / Boolean weight | None (Binary boolean match only) | Advanced BM25, field boosting, decay functions |
| **Typo Tolerance / Fuzzy** | None (Exact token / prefix only) | None (Requires `%` wildcard) | Native Levenshtein distance & fuzzy matching |
| **Infrastructure Overhead** | Zero (Built right into MySQL database) | Zero | High (Separate cluster, CDC pipeline, syncing) |
| **ACID & Consistency** | Immediate transactional consistency | Immediate transactional consistency | Eventual consistency (indexing latency ~1s) |

### Decision Rules:
- Use **MySQL Full-Text Indexing** when your data lives in MySQL, text volume is under a few million rows, search requirements are standard keyword/boolean lookups, and you want zero extra infrastructure or data synchronization pipelines.
- Use **Dedicated Search Engines (Elasticsearch/OpenSearch)** when you need typo tolerance, fuzzy matching, multi-language stemming, faceted filtering at scale, or sub-50ms search over tens of millions of documents.

---

## 8. 🧠 The Memory Hook

A standard B-Tree index is an alphabetically sorted filing cabinet: lightning-fast when you know how the title begins, but useless if you are searching for a word hidden in the middle of a paragraph. 

A Full-Text index is the index at the back of a textbook: it chops every document into individual words, maps each word to its exact row IDs, and lets you find `"wireless"` in 2 milliseconds without reading a single page.
