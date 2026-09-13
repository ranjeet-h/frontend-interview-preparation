# Full-Text Indexing in MySQL: Inverted Indexes, `MATCH() AGAINST()`, and Search Modes

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce search worked fine for months. Local dev has 200 products, the search endpoint does `WHERE description LIKE '%wireless headphones%'`, returns in 3ms, everyone ships it.

Then you hit two million products. On Black Friday, thirty shoppers search at the same time. Every search takes eight seconds. MySQL CPU hits 100 percent. The buffer pool fills with disk pages you immediately throw away. The API gateway starts returning 504s.

The cause is not a slow server. It is `LIKE '%term%'` with a leading wildcard. A normal B-Tree index is sorted by the start of the string. It can answer `LIKE 'wireless%'` with a range scan. But with `'%wireless%'` it has no idea where inside each string the word sits, so it must read every row, parse every description in memory, and check substring by substring. That is a full table scan. It gets worse as you grow.

And even when it finishes, `LIKE` only says yes or no. A product that mentions "wireless headphones" ten times in the title ranks the same as one that mentions it once in a footnote. There is no relevance. No ranking. No phrase handling. No prefix boost. You need a way to find words inside text instantly and return the best matches first. That is exactly what a `FULLTEXT` index is for.

## 2. The Analogy — Make the Mechanic Obvious

Think of a 1,000-page medical encyclopedia and two ways to find every page that talks about "headache".

The slow way is to start at page one and read every sentence until page one thousand. That is what `LIKE '%headache%'` does. It scans everything.

The fast way is to flip to the index at the back of the book. Under H you find "headache -> pages 42, 118, 503, 721". You jump straight to those four pages. You touched three seconds of work instead of six hours.

A MySQL `FULLTEXT` index is that back-of-the-book index, built at write time so reads are instant.

Here is how the parts line up. A row in your table is one page of the encyclopedia. Tokenization is breaking a sentence like "noise-cancelling wireless headphones!" into separate words `noise`, `cancelling`, `wireless`, `headphones` and throwing away punctuation and lowercasing. Stopwords are words like "and", "the", "with" that appear on almost every page — keeping them in the index would make the index huge and useless, so MySQL drops them. The inverted index itself is the alphabetical list at the back — it maps one word to the list of document IDs that contain it. That list is called the posting list. So `headphones -> [row 1, row 2]` means only rows 1 and 2 need to be read when someone searches for headphones.

Once you see this, the rest of MySQL full-text search is just naming those pieces and deciding how to rank them.

## 3. The Full Explanation — How It Actually Works

In plain words, a `FULLTEXT` index does not store the whole text sorted like a B-Tree. It stores a dictionary from word to row list. When you search, MySQL looks up your words in the dictionary and merges the posting lists. No full scan, no substring parsing.

For InnoDB tables, MySQL builds this inverted index in auxiliary tables behind the scenes. When you insert a row like "High fidelity noise cancelling wireless headphones with mic", this is what happens. MySQL assigns a unique 64-bit document ID called `FTS_DOC_ID`. If your table does not have a column named `FTS_DOC_ID` with a unique index, InnoDB creates a hidden one. Then a parser splits the text into tokens on whitespace and punctuation and lowercases them. Then it drops tokens shorter than `innodb_ft_min_token_size` (default 3) or longer than `innodb_ft_max_token_size` (default 84), and drops stopwords. Then it buffers the token-to-DocID pairs in memory in `innodb_ft_cache_size` (default 32MB) so every insert does not hit disk. On commit or when the cache fills, it flushes those pairs into six auxiliary tables named `FTS_*_INDEX_1` through `FTS_*_INDEX_6`, partitioned by the first hex character of the token to reduce lock contention. A query then just looks up tokens in those tables and fetches the matching rows.

InnoDB vs MyISAM matters for interviews. Before MySQL 5.6, `FULLTEXT` only worked on MyISAM. That engine is non-transactional, does table-level locking, and is effectively deprecated for new work. Since 5.6, InnoDB supports `FULLTEXT` natively with transactional consistency — the index updates inside your transaction and is visible after commit. Today you should always use InnoDB. If someone says "FULLTEXT does not work on InnoDB", they are repeating a pre-5.6 truth that is now a myth.

How you search is `MATCH(col1, col2) AGAINST('query' IN mode)`. The column list inside `MATCH()` must exactly match the column list of a `FULLTEXT` index you created. If you created `FULLTEXT(title, content)`, you must query `MATCH(title, content)`. Querying `MATCH(title)` alone will fail with `Can't find FULLTEXT index matching the column list` because no such single-column index exists. You would need a separate index on `(title)` for that.

MySQL gives you three search modes and they behave very differently.

Natural Language Mode is the default if you do not specify a mode. You write `AGAINST('wireless headphones' IN NATURAL LANGUAGE MODE)` and MySQL treats your input as human prose. It computes a relevance score for each row using TF-IDF. Term Frequency is how often the word appears in that row. Inverse Document Frequency is how rare the word is across the whole table. A word that appears many times in this row but rarely in other rows scores high. Results come back sorted by that score. Special characters like `+`, `-`, `*` are treated as literal text in this mode, not as operators.

Boolean Mode is for when you want precise control. You write `AGAINST('+wireless +headphones -bluetooth' IN BOOLEAN MODE)`. Here `+` means must be present, `-` means must not be present, no operator means optional but boosts ranking, `*` is a prefix wildcard at the end of a word like `headphon*` which matches headphone, headphones, headphonics, double quotes `"noise cancelling"` mean the words must appear adjacent in that exact order, `>` and `<` raise or lower a word's contribution to relevance, `~` lowers rank of rows containing that word without excluding them, and parentheses group subexpressions like `+wireless +(headphones | earbuds)`. Boolean mode is fast because it does set membership on posting lists. Unless you ask for the score in the `SELECT` list, it does not compute full TF-IDF for every row.

Query Expansion is the third mode, `WITH QUERY EXPANSION`. It runs in two passes. Pass one does a natural language search for your terms. Pass two looks at the top results, finds the most common co-occurring words in those rows, adds them to the query, and searches again. Searching for `database` might automatically expand to `database MySQL PostgreSQL` because the best initial hits also contain those words. It can surface related content that missed your exact keyword, but it also drifts — if the first pass pulls in unrelated rows, the second pass amplifies that noise.

Parsing matters for non-English text. The default parser splits on whitespace and punctuation. That works for English but fails completely for Chinese, Japanese, and Korean, which do not use spaces between words. An entire CJK sentence would be indexed as one giant token and keyword lookup would fail. For those languages you use the ngram parser. Declare `FULLTEXT(content) WITH PARSER ngram`. It breaks text into overlapping n-grams of length `ngram_token_size` (default 2). So "北京欢迎你" becomes bigrams like "北京", "京欢", "欢迎", "迎你". For Japanese you can also use the MeCab parser if the plugin is installed, which does morphological analysis.

Limitations you need to be honest about. Only `CHAR`, `VARCHAR`, and `TEXT` columns can be indexed. Minimum and maximum token sizes silently drop short words. Stopwords silently drop common words, which can even make a phrase query like `"to be or not to be"` match nothing because every word is a stopword. You cannot search for a substring in the middle of a word — `*phone` does not work, only prefix `phone*` does. You cannot combine a B-Tree filter and a `FULLTEXT` filter in one index lookup — the optimizer picks one index and filters the rest row by row, so `WHERE tenant_id = 42 AND MATCH(notes) AGAINST(...)` can still be slow if either side is not selective. Write amplification is real — inserting a 500-word document inserts one B-Tree entry but dozens of entries across auxiliary FTS tables, buffered in `innodb_ft_cache_size`. And relevance ranking is TF-IDF, not BM25 or vector search — good for keyword search, not for typo tolerance, synonyms, or semantic meaning. For those you need an external engine.

When to use it is straightforward. Use MySQL `FULLTEXT` when your text already lives in MySQL, you have up to a few million rows, you need keyword, phrase, and boolean search with relevance, and you want transactional consistency with zero extra infrastructure. Do not use it when you need fuzzy typo tolerance, phonetic matching, rich stemming across many languages, faceted counts at scale, or sub-20ms distributed search over hundreds of millions of documents. That is when you move to Elasticsearch or OpenSearch and accept a sync pipeline.

## 4. See It In Practice — Real Code or Queries

Everything below runs on MySQL 8.0 with InnoDB and utf8mb4. The statements are runnable as written.

Create a table with a composite full-text index. The index is on `(title, content)` together, not two separate indexes.

```sql
CREATE TABLE articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FULLTEXT KEY ft_title_content (title, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO articles (title, category, content) VALUES
('Getting Started with MySQL Indexing', 'Databases', 'B-Tree indexes speed up equality and range queries dramatically.'),
('Optimizing Full-Text Search in MySQL', 'Databases', 'Full-Text indexes utilize inverted index structures for fast text matching and TF-IDF scoring with wireless headphones.'),
('Building Microservices with Node.js', 'Backend', 'Learn how to build asynchronous REST APIs and event-driven architectures with Express and Node.'),
('Advanced SQL Tuning and Execution Plans', 'Databases', 'Use EXPLAIN ANALYZE to identify full table scans, filesorts, and unindexed joins.'),
('Introduction to Full-Text Search Engines', 'Search', 'Comparing MySQL Full-Text capabilities with dedicated search engines like Elasticsearch and OpenSearch. Even a_budget wired headphones model is mentioned far from wireless.'),
('Bluetooth vs Wireless Audio', 'Devices', 'Wireless headphones often include Bluetooth. Wired headphones do not. A wireless charging dock is different from wireless audio.');
```

Natural language search with relevance. The `WHERE` clause filters matches, the `SELECT` expression returns the score so you can order and display it.

```sql
SELECT
  id,
  title,
  ROUND(MATCH(title, content) AGAINST('mysql full-text search' IN NATURAL LANGUAGE MODE), 4) AS score
FROM articles
WHERE MATCH(title, content) AGAINST('mysql full-text search' IN NATURAL LANGUAGE MODE)
ORDER BY score DESC;
```

This returns rows that share terms with your query, highest TF-IDF first. Rows with no shared token are not returned at all. Because `ft_title_content` covers both title and content, a match in either column counts.

Boolean mode for precise logic. Each query below shows one operator.

```sql
-- Must contain mysql and search, must NOT contain elasticsearch
SELECT id, title
FROM articles
WHERE MATCH(title, content) AGAINST('+mysql +search -elasticsearch' IN BOOLEAN MODE);

-- Exact phrase: words must be adjacent in this order
SELECT id, title
FROM articles
WHERE MATCH(title, content) AGAINST('"wireless headphones"' IN BOOLEAN MODE);

-- Prefix: matches indexing, indexes, index
SELECT id, title
FROM articles
WHERE MATCH(title, content) AGAINST('+mysql +index*' IN BOOLEAN MODE);

-- Rank boost and penalty without exclusion
SELECT id, title,
  MATCH(title, content) AGAINST('+headphones +(>bluetooth <charging)' IN BOOLEAN MODE) AS score
FROM articles
WHERE MATCH(title, content) AGAINST('+headphones +(>bluetooth <charging)' IN BOOLEAN MODE)
ORDER BY score DESC;
```

CJK support with the ngram parser. Use this when your content is Chinese, Japanese, or Korean. The ngram parser is chosen at index creation time.

```sql
CREATE TABLE cjk_articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  body TEXT NOT NULL,
  FULLTEXT KEY ft_body (body) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO cjk_articles (body) VALUES
('北京欢迎你'), ('全文搜索很重要'), ('MySQL ngram parser handles CJK');

SELECT id, body
FROM cjk_articles
WHERE MATCH(body) AGAINST('欢迎' IN BOOLEAN MODE);
```

Query expansion example. Use sparingly because it can add irrelevant results.

```sql
SELECT id, title
FROM articles
WHERE MATCH(title, content) AGAINST('database' WITH QUERY EXPANSION);
```

Verify the index is actually used. Look for `type: fulltext` and `key: ft_title_content`.

```sql
EXPLAIN SELECT id, title
FROM articles
WHERE MATCH(title, content) AGAINST('+mysql +search' IN BOOLEAN MODE);
```

Changing minimum token size. If you need to index 2-letter terms like "AI" or "Go", you must change the server variable and rebuild the index. This requires a restart and is not dynamic.

```sql
-- In my.cnf: innodb_ft_min_token_size = 2  then restart mysqld
-- Then rebuild:
ALTER TABLE articles DROP INDEX ft_title_content, ADD FULLTEXT KEY ft_title_content (title, content);
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Why can't a B-Tree index speed up `WHERE description LIKE '%wireless%'`?**

A B-Tree keeps values sorted by their beginning. It can jump to "wireless..." quickly for `LIKE 'wireless%'` because it knows where that prefix lives. With `LIKE '%wireless%'` the interesting part is somewhere in the middle. The B-Tree has no pointer to "somewhere in the middle of every string", so it must read every row and scan the whole text character by character. That is a full table scan. A `FULLTEXT` inverted index solves this by indexing individual words, not whole strings. It maps `wireless -> [row 1, row 3]` and answers the query by dictionary lookup, not by scanning.

**Q: What is a FULLTEXT index and how do you query it?**

A `FULLTEXT` index is an inverted index built on `CHAR`, `VARCHAR`, or `TEXT` columns. At write time MySQL tokenizes each document into words, filters stopwords and short tokens, and stores each word with the list of document IDs that contain it in hidden auxiliary tables. You query it only with `MATCH(columns) AGAINST('terms' IN mode)`, not with `=`, `LIKE`, or `IN`. The critical rule is the column list in `MATCH()` must exactly match the column list of a `FULLTEXT` index. If the index is `FULLTEXT(title, content)`, you must write `MATCH(title, content) AGAINST(...)`. Writing `MATCH(title)` will error with `Can't find FULLTEXT index matching the column list` because no such single-column index exists. You need a separate `FULLTEXT(title)` if you want to search title alone.

**Q: What is the difference between Natural Language Mode and Boolean Mode?**

Natural Language Mode treats the query as human prose, ignores boolean operators, computes a TF-IDF relevance score per row, and returns rows sorted by relevance. Searching for `+wireless -bluetooth` in natural language mode actually searches for the literal strings "+wireless" and "-bluetooth". Boolean Mode parses operators. `+` is required, `-` is excluded, bare word is optional but boosts relevance, `*` is prefix only at the end, quotes are exact phrase, `>` and `<` adjust weight, `~` lowers rank of rows containing that word, and parentheses group. Boolean mode also skips relevance scoring unless you ask for it in the `SELECT` list, so it is often faster when you just need filtering. The old MyISAM 50 percent threshold where words appearing in more than half the rows were ignored does not apply to InnoDB.

**Q: Does FULLTEXT work on InnoDB or only on MyISAM?**

Today it works on both. Before MySQL 5.6, `FULLTEXT` only existed for MyISAM, which has table-level locks and no transactions. That history is why older posts say "FULLTEXT does not work with InnoDB". Since 5.6, InnoDB has a fully transactional implementation. Inserts are buffered in `innodb_ft_cache_size` and flushed to six auxiliary `FTS_*` tables on commit. You should use InnoDB for all new tables. MyISAM is deprecated and you lose crash safety and row-level locking if you choose it just for full-text search.

**Q: What does the ngram parser do and when do you need it?**

The default parser splits text on whitespace and punctuation. That fails for Chinese, Japanese, and Korean, which do not use spaces between words — a whole sentence would be indexed as one token. The ngram parser fixes this by chopping text into overlapping substrings of length `ngram_token_size`, default 2. So "北京欢迎你" is indexed as bigrams. You enable it per index with `WITH PARSER ngram`. For Japanese you can also use the MeCab parser for morphological analysis if the plugin is installed. If you create a `FULLTEXT` index on CJK text without `WITH PARSER ngram`, every search will return empty or wrong results.

**Q: I search for "AI" and get zero rows even though the data has "AI" everywhere. Why?**

Two filters likely removed it at index time and at query time. First, `innodb_ft_min_token_size` defaults to 3, so any word shorter than three characters like "AI", "Go", "C", "DB" is never indexed and never searched. Second, if you used the default stopword list, words like "in", "the", "and" are also discarded. So `AGAINST('AI in healthcare')` can become an empty query after filtering. Fix short words by setting `innodb_ft_min_token_size = 2` or even 1 in `my.cnf`, restarting MySQL, and rebuilding the index with `ALTER TABLE ... DROP INDEX ... ADD FULLTEXT ...`. Fix stopwords by setting `innodb_ft_enable_stopword = OFF` or pointing `innodb_ft_user_stopword_table` to your own table.

**Q: What are the real limitations of MySQL FULLTEXT?**

It only indexes `CHAR`, `VARCHAR`, and `TEXT`. It has a minimum and maximum token length, so very short or very long tokens are silently ignored. Only prefix wildcard `word*` works, not `*word` or `*word*`. Stopwords can silently empty your query, even for phrase queries like `"to be or not to be"` where every word is a stopword. The optimizer cannot merge a B-Tree index and a `FULLTEXT` index in one lookup, so a query like `WHERE tenant_id = 42 AND MATCH(notes) AGAINST(...)` will use one index and filter the other condition row by row. Writes are heavier than B-Tree — a 500-word insert creates dozens of auxiliary index entries. And ranking is TF-IDF only. There is no fuzzy matching, no typo tolerance, no synonym expansion, and no semantic search.

**Q: When should we move from MySQL FULLTEXT to Elasticsearch or OpenSearch?**

Stay on MySQL when your text lives in MySQL, you have up to a few million rows, your queries are keyword, phrase, and boolean, and you value transactional consistency and zero extra infrastructure. Move to a dedicated engine when you need typo tolerance and fuzzy matching, language-specific stemming and synonyms, facets and aggregations at scale, per-field boosting and BM25 tuning, vector or semantic search, or distributed sub-50ms search across hundreds of millions of documents. The price is complexity. You must sync data from MySQL to the search cluster through dual writes or change data capture like Debezium and Kafka. That means eventual consistency — a new row may not appear in search for a second or two — and a new failure mode where the search index drifts from the primary database.

## 6. The Traps — What Goes Wrong in Production

**The pre-5.6 InnoDB myth.** The trap is believing FULLTEXT still does not work on InnoDB because a Stack Overflow answer from 2012 said so. Teams either avoid FULLTEXT entirely or create MyISAM tables just for search. Both are mistakes today. MyISAM has no crash recovery, no transactions, and table-level locks. Since MySQL 5.6, InnoDB supports FULLTEXT transactionally. Use InnoDB and stop quoting the old limitation.

**Stopwords empty your query without warning.** The default InnoDB stopword list has about 36 English words like "about", "are", "with", "within". If you search for `"to be or not to be"` in boolean mode, every word is a stopword, MySQL strips them all, and you get zero rows. The query looks correct and the data exists, but the index never contained those tokens. This also bites phrase queries and mixed queries where the only distinctive words are stopwords. The fix is to disable the built-in list with `innodb_ft_enable_stopword = OFF` or to supply your own table via `innodb_ft_user_stopword_table`. For domain search where every word matters, a custom short stopword list is usually better than the default.

**The invisible two-letter keyword bug.** Developers add search for products tagged "AI", for exams tagged "Go" and "C", for databases tagged "DB". Queries return empty. The reason is `innodb_ft_min_token_size = 3` by default. Every two-letter token was discarded during indexing. The query also discards the same tokens, so they never meet. The fix is not in SQL. You must change `innodb_ft_min_token_size` in `my.cnf`, restart `mysqld`, and rebuild every relevant index with `ALTER TABLE ... DROP INDEX ... ADD FULLTEXT ...`. Until you rebuild, existing rows stay unsearchable even after the setting change.

**MATCH column list must equal the index, or you get an error or a scan.** If you have `FULLTEXT(title, content)` and you write `WHERE MATCH(title) AGAINST('mysql')`, MySQL cannot use the composite index for a single-column search. It either throws error 1191 or, in some MySQL versions, falls back to a full scan depending on context. The solution is to create exactly the index you need for each query shape. If you need to search title alone and title plus content, create two indexes: `FULLTEXT(title)` and `FULLTEXT(title, content)`.

**FULLTEXT plus a B-Tree filter does not use both indexes.** A query like `WHERE tenant_id = 1042 AND MATCH(notes) AGAINST('damaged' IN BOOLEAN MODE)` looks like it should merge the tenant filter and the text index. The MySQL optimizer cannot do that. It will pick either the B-Tree on `tenant_id` and then evaluate `MATCH` on those rows, or use the FULLTEXT index and filter `tenant_id` row by row. If one side is not selective, this is still slow. Mitigations are to make the B-Tree the primary filter when it is highly selective, to denormalize search into a tenant-scoped search table, or to move multi-tenant text search to a dedicated engine where you can filter and search in one distributed index.

**CJK text indexed with the wrong parser.** Creating a normal FULLTEXT index on Chinese, Japanese, or Korean text and wondering why nothing matches is a common first deployment bug. The default parser sees "全文搜索很重要" as one token, not four words, because there are no spaces. Always use `WITH PARSER ngram` for CJK. For Japanese where accurate word boundaries matter more than overlapping grams, evaluate the MeCab parser plugin.

## 7. Compare With Related Concepts

**FULLTEXT vs `LIKE '%term%'`.** `LIKE` with a leading wildcard is a brute-force substring scan. It reads every row, parses every string, has no relevance, and is guaranteed to be slow at scale. It has one advantage: it finds substrings anywhere, including inside words, and needs no index at all. `FULLTEXT` is an inverted word index. It looks up whole tokens via a dictionary, never scans non-matching rows, and ranks by TF-IDF. It is dramatically faster for word and phrase search. But it only matches whole tokens or prefix tokens, not mid-word substrings, and it silently ignores short words and stopwords. Rule: use `LIKE 'prefix%'` with a B-Tree when you need prefix matching on a small filtered set. Use `FULLTEXT` when you need natural language or boolean keyword search inside long text. Never use `LIKE '%word%'` on a large table in production.

**FULLTEXT vs external search (Elasticsearch/OpenSearch).** MySQL FULLTEXT is built in, transactional, and consistent the moment you commit. There is nothing extra to deploy, monitor, or sync. It handles keyword, boolean, and phrase queries well up to a few million rows. An external engine builds a distributed inverted index on Lucene with BM25 scoring, per-field boosting, stemming, fuzzy typo tolerance, synonyms, phonetic matching, aggregations and facets, and optional vector search. It scales horizontally to hundreds of millions of documents and stays fast under heavy search load without burdening your primary database. The cost is a separate cluster, operational overhead, and eventual consistency — new writes must be shipped to the search cluster and can lag by a second or more. Rule: start with MySQL FULLTEXT when your needs are moderate and your data already lives in MySQL. Move to Elasticsearch or OpenSearch when search is a product feature that needs fuzzy, faceted, multilingual, or very large-scale behavior, and budget for a CDC or dual-write pipeline and drift detection.

**InnoDB FULLTEXT vs MyISAM FULLTEXT.** InnoDB is transactional, crash-safe, uses row-level locking, supports the ngram and MeCab parsers, and buffers writes in `innodb_ft_cache_size`. MyISAM had FULLTEXT first historically but has table-level locking, no crash recovery, and is deprecated. There is no reason to choose MyISAM for new FULLTEXT work in 2026.

**Natural Language Mode vs Boolean Mode vs Query Expansion.** Natural Language is for humans typing phrases — it ranks automatically. Boolean is for power search and filters — you control must, must not, prefix, and phrase. Query Expansion is for discovery — it widens your query with co-occurring terms. It is the least used because it can reduce precision.

## 8. 🧠 The Memory Hook

`LIKE '%word%'` reads every page of the book. `FULLTEXT` is the index at the back — it cuts every document into words, maps each word to the rows that contain it, and lets `MATCH() AGAINST()` find and rank those rows by dictionary lookup instead of by scanning.
