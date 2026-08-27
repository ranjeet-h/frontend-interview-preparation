# What Is Collation

## 1. The Real-World Problem — When You Actually Hit This

Your app has been live for six months. A user signs up with `Test@Example.com`. Later another user tries to sign up with `test@example.com` — and your `UNIQUE` check says that email already exists. Or the opposite: your login lets someone type `TeSt@Example.COM` and it matches `test@example.com` and logs them in, even though you thought email comparison would be exact. Nothing is broken in your code. The database just considers those two strings equal.

Then sorting breaks too. You have German users. Names like `Müller`, `Mueller`, and `Muller` show up in a weird order in an `ORDER BY name` list, and a search for `cafe` unexpectedly finds `café`. You go look at the schema and everything is `utf8mb4`, so the characters are stored correctly — but the rules for comparing and sorting them are not what you assumed.

That is the moment you meet collation. The characters are saved fine. The rules for whether two strings are equal, which one sorts first, and whether accents matter — those are the collation, and MySQL picked a default for you that you never noticed.

## 2. The Analogy — Make the Mechanic Obvious

Think of two printed dictionaries sitting side by side in a library.

Both dictionaries contain the same letters — A through Z, plus ä, ö, ü, é, and so on. That set of letters is like a charset. `utf8mb4` just means this dictionary contains pretty much every character in the world.

But the two dictionaries have different sorting rules printed on the first page. Dictionary One says: when you compare words, ignore whether a letter is uppercase or lowercase, and ignore accents. So `cafe` and `café` are the same word, `Apple` and `apple` are the same word, and they sit in the same place. Dictionary Two says: uppercase and lowercase are different, accents are different, compare the exact ink on the page. Now `cafe` and `café` are different words in different places.

Those sorting rules are collation. Same characters, different rules for equality and order. MySQL does the same thing. The charset says which characters can be stored. The collation says how to compare and sort them. Every column picks one dictionary of rules to live by, and every `WHERE`, `ORDER BY`, `GROUP BY`, and `UNIQUE` index follows those rules.

## 3. The Full Explanation — How It Actually Works

Collation is the set of rules MySQL uses to decide whether two strings are equal and which one sorts before the other. It only makes sense together with a charset. The charset defines the characters and how they are encoded on disk. The collation defines how those characters compare.

The name tells you both parts: `utf8mb4_0900_ai_ci`. Read it from left to right. `utf8mb4` is the charset — real UTF-8 that can store any Unicode character including emoji. `0900` means the rules follow Unicode 9.0. `ai` means accent-insensitive. `ci` means case-insensitive. So `utf8mb4_0900_ai_ci` means: use the full Unicode character set, and when you compare strings, treat `a` and `A` as the same and treat `e` and `é` as the same.

MySQL 8.0 changed the default to `utf8mb4_0900_ai_ci` precisely because most apps want friendly searching and sorting out of the box. Before 8.0 the default was `utf8mb4_general_ci` or `latin1_swedish_ci` depending on version, which used older, less accurate Unicode rules. If you create a database on MySQL 8.0 without saying anything, you get `utf8mb4` with `utf8mb4_0900_ai_ci` everywhere.

Suffixes matter and interviewers test them directly. `_ci` is case-insensitive so `'a' = 'A'` is true. `_cs` is case-sensitive so `'a' = 'A'` is false. `_bin` is binary so it compares the raw code-point values byte by byte — the strictest, fastest, but it knows nothing about language rules. `_ai` is accent-insensitive so `'cafe' = 'café'` is true. `_as` is accent-sensitive so that same comparison is false. You can mix them: `utf8mb4_0900_as_cs` is accent-sensitive and case-sensitive, `utf8mb4_bin` is pure binary with no language awareness.

Collation lives at four levels and the most specific one wins. The server has a default, the database has a default, the table has a default, and each column has its own collation. When you write `WHERE name = 'muller'` or `ORDER BY name`, MySQL uses the collation of the column you are comparing or sorting. You can also override it per query with `COLLATE`, like `WHERE email = 'Test@x' COLLATE utf8mb4_bin`. That is useful but it has a cost.

The cost is performance. An index is built in the sort order of the column's collation. Think of it like a phone book printed using one dictionary's rules. If you query using that same collation, MySQL can do an indexed lookup or sorted scan. If you force a different collation in the `WHERE` or `JOIN` — `WHERE email COLLATE utf8mb4_bin = 'Test@x'` when the column is `ai_ci` — MySQL cannot use that index efficiently. It has to convert every value on the fly, which means a full scan or a filesort. In a `JOIN` between two columns with different collations, MySQL may even throw `Illegal mix of collations` and refuse to run.

The same rule affects correctness. A `UNIQUE` index on `email` with `ai_ci` treats `Test@Example.com` and `test@example.com` as duplicates — the second insert fails. With `utf8mb4_bin`, they are different rows and both inserts succeed. `GROUP BY` and `DISTINCT` also follow the collation, so `GROUP BY name` with `ai_ci` merges `Müller` and `Muller` into one group when you probably wanted two.

Practical rule: keep one collation consistently across related columns, set the strictness per column for intent, and avoid per-query `COLLATE` on indexed columns in hot queries. A common pattern is `name` or `search_text` stays `utf8mb4_0900_ai_ci` so users find things regardless of case or accents, while `email` or `username` uses `utf8mb4_bin` or `utf8mb4_0900_as_cs` when you need exact matching. You set that per column at creation time and change it later with `ALTER TABLE ... CONVERT TO CHARACTER SET` or `MODIFY COLUMN ... COLLATE`, which rebuilds the table.

## 4. See It In Practice — Real Code or Queries

MySQL 8.0 assumed. All examples run in the MySQL shell.

Check defaults and create a table with per-column collation:

```sql
-- What MySQL is using right now
SHOW VARIABLES LIKE 'character_set_server';
SHOW VARIABLES LIKE 'collation_server';
SHOW VARIABLES LIKE 'collation_database';

-- See all collations for utf8mb4 and their language rules
SHOW COLLATION WHERE Charset = 'utf8mb4';

-- Create a table where each column picks the right strictness
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  -- friendly search: case and accent do not matter
  display_name VARCHAR(100)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  -- exact identity: case and accent DO matter
  email VARCHAR(255)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  -- German-aware example if you need proper German sorting
  -- city VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_de_pb_0900_ai_ci
  UNIQUE KEY uniq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SHOW CREATE TABLE users \G
```

Equality changes with the collation:

```sql
-- ai_ci: these are equal (case-insensitive + accent-insensitive)
SELECT 'cafe' = 'café' COLLATE utf8mb4_0900_ai_ci;  -- 1 (true)
SELECT 'Test@Example.com' = 'test@example.com' COLLATE utf8mb4_0900_ai_ci;  -- 1

-- as_cs or bin: they are NOT equal
SELECT 'cafe' = 'café' COLLATE utf8mb4_0900_as_cs;  -- 0 (false)
SELECT 'cafe' = 'café' COLLATE utf8mb4_bin;          -- 0
SELECT 'Test@Example.com' = 'test@example.com' COLLATE utf8mb4_bin;  -- 0

-- Per-query override on an ai_ci column (correct, but watch the index)
SELECT * FROM users WHERE display_name = 'muller' COLLATE utf8mb4_0900_ai_ci;
SELECT * FROM users WHERE email = 'Test@Example.com' COLLATE utf8mb4_bin;
```

Sorting changes with the collation:

```sql
CREATE TABLE words (w VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci);
INSERT INTO words VALUES ('cafe'), ('café'), ('Cafe'), ('apple');

-- ai_ci: cafe variants group together, case ignored
SELECT w FROM words ORDER BY w COLLATE utf8mb4_0900_ai_ci;
-- one possible order: apple, cafe, Café, café  (all cafe forms treated as equal)

-- bin: strict code-point order, uppercase before lowercase, accents separate
SELECT w FROM words ORDER BY w COLLATE utf8mb4_bin;
-- order is by numeric code point: Cafe, apple, cafe, café
```

Index and collation mismatch — the performance gotcha:

```sql
-- Column is ai_ci, so the index is sorted using ai_ci rules
CREATE INDEX idx_display_name ON users(display_name);

-- Uses the index (same collation as the column)
EXPLAIN SELECT * FROM users WHERE display_name = 'Müller';
-- type: ref, key: idx_display_name

-- Forces a different collation -> index cannot be used efficiently
EXPLAIN SELECT * FROM users WHERE display_name COLLATE utf8mb4_bin = 'Müller';
-- type: ALL, Extra: Using where  (full scan, no index)

-- JOIN with mismatched collations can error
-- Illegal mix of collations (utf8mb4_0900_ai_ci,IMPLICIT) and (utf8mb4_bin,IMPLICIT)
-- Fix by making both columns the same collation at the schema level.
```

Changing collation on a large table:

```sql
-- Rebuilds the table and re-creates indexes — expensive, needs a low-traffic window
ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Change just one column
ALTER TABLE users MODIFY email VARCHAR(255)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is collation?**

Collation is the set of rules that tells MySQL how to compare and sort strings for a given charset. If charset is the set of characters you can store — like all of Unicode with `utf8mb4` — collation is the rulebook for whether `a` equals `A`, whether `cafe` equals `café`, and whether `Müller` sorts before `Mueller`. Every `=`, `<`, `ORDER BY`, `GROUP BY`, `DISTINCT`, and `UNIQUE` check follows the column's collation. You can set it at the server, database, table, or column level, with the column winning.

**Q: What is the difference between charset and collation?**

Charset is what you can store and how it is encoded on disk. `utf8mb4` means you can store any Unicode character and each character takes one to four bytes. Collation is how you compare what you stored. You cannot have a collation without a charset — `utf8mb4_0900_ai_ci` literally says `utf8mb4` charset plus `0900` Unicode rules plus accent-insensitive plus case-insensitive comparison. Fixing a garbled emoji is a charset problem. Getting wrong matches for `Test@x` vs `test@x` or wrong sort order is a collation problem.

**Q: What do ci, cs, bin, ai, and as mean?**

They are suffixes on the collation name. `ci` is case-insensitive so `a = A`. `cs` is case-sensitive so `a != A`. `ai` is accent-insensitive so `cafe = café` and `resume = résumé`. `as` is accent-sensitive so those are not equal. `bin` is binary — it ignores language entirely and compares raw numeric code-point values, so only byte-identical strings are equal. `utf8mb4_0900_ai_ci` is the MySQL 8.0 default and is both accent- and case-insensitive. `utf8mb4_bin` is the strictest and fastest but has no language-aware sorting.

**Q: What is the default charset and collation in MySQL 8.0?**

`utf8mb4` with `utf8mb4_0900_ai_ci`. The `0900` means Unicode 9.0 sorting rules, which handles accents and special characters much more accurately than the old `utf8mb4_general_ci` from MySQL 5.7. If you create a MySQL 8.0 database without specifying anything, every new table and `VARCHAR` column inherits that default unless you override it per column.

**Q: How does collation affect indexes and query performance?**

An index is sorted using the column's collation. If your query uses the same collation, MySQL can seek the index. If you wrap the column with `COLLATE utf8mb4_bin` or join two columns that have different collations, MySQL cannot use the index sort order — it must convert values row by row and often falls back to a full table scan or filesort, or throws an illegal mix of collations error. The fix is to define the right collation on the column itself at schema time so hot queries do not need a per-query override.

**Q: Can you set collation per column or per query? When would you?**

Yes both. Per column is the normal choice: `email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin` for exact matching, `display_name VARCHAR(100) COLLATE utf8mb4_0900_ai_ci` for forgiving search. That keeps indexes healthy. Per query with `WHERE col COLLATE utf8mb4_bin = ?` is for one-off needs, like a case-sensitive admin search on an otherwise case-insensitive column. Use it sparingly because it defeats the index on that column for that query.

**Q: Why does ORDER BY sometimes return surprising order?**

Because `ORDER BY` follows the column's collation. With `utf8mb4_0900_ai_ci`, `café` sorts as if it were `cafe`, `Apple` and `apple` intermingle, and German `ä` may sort like `a` instead of like `ae`. With `utf8mb4_bin`, order is pure numeric code-point order where all uppercase letters sort before lowercase. If you need German phone-book order where `ä` sorts as `ae`, MySQL ships `utf8mb4_de_pb_0900_ai_ci` specifically for that. The surprise is never a bug — it is the wrong collation for the language expectation.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Login or dedup that matches when it should not.** You have `email VARCHAR(255) COLLATE utf8mb4_0900_ai_ci` with a `UNIQUE` index and you write `WHERE email = 'Test@Example.com'`. It matches `test@example.com` because `ci` says they are equal. A signup for `Test@Example.com` gets rejected as a duplicate, or a lookup returns the wrong row. If email identity must be exact, the column should be `utf8mb4_bin` or `utf8mb4_0900_as_cs` and you should lowercase at the application level only if that is the product rule you actually want.

**Trap 2: ORDER BY looks random to users.** You add `ORDER BY display_name` expecting alphabetical order and German or French names land in a strange place. With `ai_ci`, `Müller`, `Mueller`, and `Muller` may cluster as if they were the same. With `bin`, accented names get pushed to the end by code-point value. The fix is not to sort in JavaScript after fetching — it is to pick the collation that matches the user's language on that column.

**Trap 3: Adding COLLATE in the WHERE kills the index.** You correctly notice the matching is too loose and add `WHERE email COLLATE utf8mb4_bin = ?` to a hot login query. Correctness is fixed, performance dies. `EXPLAIN` flips from `ref` on the index to `ALL` with `Using where` because the index was built for `ai_ci`. Fix the schema, not the query: change the column's collation so the index matches what you filter on.

**Trap 4: Illegal mix of collations in a JOIN.** Table `users.email` is `utf8mb4_0900_ai_ci` but table `invites.email` was created earlier with `utf8mb4_bin`. Running `JOIN ON users.email = invites.email` throws `Illegal mix of collations`. MySQL will not guess which rules to use. You have to make the two columns share a collation, either with `ALTER TABLE` or by casting one side consistently (which again defeats indexes).

**Trap 5: Changing collation on a big table without planning.** Running `ALTER TABLE huge_table CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci` on a table with millions of rows rebuilds the entire table and every index. It locks or copies the table, spikes I/O, and breaks replication lag. Test on a copy, measure the time, run during a low-traffic window, and use online DDL tools or MySQL's `ALGORITHM=INPLACE` where possible. Do not run it first time in production.

## 7. Compare With Related Concepts

**Collation vs charset.** Charset is the alphabet you can store. Collation is the rulebook for comparing and sorting that alphabet. You change charset when characters are missing or garbled — for example switching from `latin1` to `utf8mb4` so emoji saves correctly. You change collation when comparison or sorting is wrong — for example switching from `ai_ci` to `as_cs` so `cafe` no longer matches `café`. Every collation belongs to exactly one charset, so you always set them together.

**_ci / _cs / _bin at the same charset.** Same characters, different strictness. `utf8mb4_0900_ai_ci` is friendly for user-facing search — it forgives case and accents. `utf8mb4_0900_as_cs` is strict for humans but still language-aware — it knows how accents sort. `utf8mb4_bin` is exact and fastest — it only matches byte-identical strings and sorts by raw code-point number with no language quality. Rule of thumb: use `ai_ci` for names and search text, `as_cs` or `bin` for identifiers like email or username where exactness matters, and do not handle case by calling `LOWER()` in SQL if a collation already expresses the rule cleanly.

**Collation vs application-level LOWER() / accent stripping.** Doing `WHERE LOWER(email) = LOWER(?)` or stripping accents in JavaScript also forces case-insensitive matching, but it defeats indexes the same way `COLLATE` does and it moves a database concern into every query and every app. A column collation expresses the intent once, keeps the index usable, and keeps `UNIQUE`, `GROUP BY`, and `ORDER BY` consistent without repeating logic in application code.

## 8. 🧠 The Memory Hook

Charset is the letters you own. Collation is the rules you compare them by. If your query matches the wrong rows or sorts them funny, you picked the wrong rulebook, not the wrong letters.
