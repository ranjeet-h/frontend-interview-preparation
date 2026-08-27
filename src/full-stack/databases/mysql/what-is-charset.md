# What is Charset in MySQL

## 1. The Real-World Problem — When You Actually Hit This

Your app has been live for months. Users sign up, post comments, everything looks fine. Then someone pastes a 😀 emoji into their display name and your insert blows up:

```
ERROR 1366 (HY000): Incorrect string value: '\xF0\x9F\x98\x80' for column 'name' at row 1
```

Or worse, it does not blow up — it silently saves as `????`. The user sees four question marks where their emoji was. Another user with a name like José sees `JosÃ©`. Support tickets come in: "my name looks broken."

You check the code. You definitely sent the emoji. You check the API. It definitely received UTF-8. So where did the data get mangled?

That moment is when you learn what a charset actually is. Until then it feels like a setting you ignore. After that error, you realize MySQL does not just store "text." It stores bytes, and it needs a rulebook to turn those bytes into characters and back. If the rulebook on the client, the connection, and the table do not agree, data gets corrupted — sometimes loudly with error 1366, sometimes silently with ????.

## 2. The Analogy — Make the Mechanic Obvious

Think of charset as a dictionary that translates between bytes and human letters.

Bytes are just numbers like `65` or `240 159 152 128`. By themselves they mean nothing. A charset is the dictionary that says "when you see `65`, that means `A`" and "when you see `240 159 152 128`, that means `😀`."

Different dictionaries cover different alphabets. `latin1` is a tiny pocket dictionary — it only knows 256 Western characters. It has no entry for emoji, so when you hand it an emoji it shrugs and writes `?`.

`utf8mb3` is a bigger dictionary but still incomplete — it knows up to 3-byte characters (most languages) but still has no entry for 4-byte emoji. `utf8mb4` is the complete dictionary — it knows every Unicode character up to 4 bytes, including emoji, math symbols, and rare scripts.

Collation is the companion rule: if charset is the dictionary, collation is the sorting and comparison rulebook. The dictionary tells you what `a` and `A` and `é` are. The collation tells you whether `a` equals `A` when you search, and whether `é` sorts next to `e`.

MySQL lets you pick a different dictionary at every layer — server, database, table, column, and even the wire between your app and MySQL. If any layer uses the wrong dictionary, translation breaks.

## 3. The Full Explanation — How It Actually Works

**Charset is bytes to characters. Collation is how to compare them.**

A charset (character set) defines the encoding: which byte sequences map to which characters. A collation defines the ordering and equality rules for that charset: is the comparison case-sensitive, accent-sensitive, and how are characters sorted. Every charset has one or more collations, and every collation belongs to exactly one charset. You cannot mix them arbitrarily — `utf8mb4_0900_ai_ci` only makes sense with `utf8mb4`.

The `_ci`, `_cs`, `_bin` suffixes tell you the rule: `_ci` is case-insensitive (`a` = `A`), `_cs` is case-sensitive, `_bin` compares raw bytes, `_ai` is accent-insensitive (`e` = `é`), `_as` is accent-sensitive.

**The five levels where charset is set.**

MySQL does not have one global charset. It has a hierarchy, and more specific levels override broader ones:

1. Server — `character_set_server` and `collation_server`. Default for new databases if you do not specify one.
2. Database — `CHARACTER SET` and `COLLATE` on `CREATE DATABASE`. Default for new tables in that database.
3. Table — `CHARACTER SET` on `CREATE TABLE`. Default for new string columns in that table.
4. Column — `CHARACTER SET` on the column itself. This is what actually decides how that column's bytes are interpreted. It always wins.
5. Connection — `character_set_client`, `character_set_connection`, `character_set_results`. This is the wire. Your app says "I am sending you bytes encoded as X" (client/connection) and "please send results back encoded as X" (results). `SET NAMES utf8mb4` sets all three at once.

If your table is `utf8mb4` but your connection is `latin1`, MySQL will transcode every string on the way in and out. If that transcoding is wrong, you get corruption even though the table is correct.

**utf8mb3 vs utf8mb4 — the MySQL naming trap.**

In MySQL, `utf8` does not mean real UTF-8. It is an alias for `utf8mb3` — a 3-byte implementation that only covers the Basic Multilingual Plane. It cannot store any character that needs 4 bytes, which includes most emoji (😀 is `F0 9F 98 80`, four bytes), some Chinese characters, and musical symbols.

`utf8mb4` is real UTF-8. Four bytes max per character, full Unicode. This is what you almost always want.

MySQL 8.0 finally fixed the default: new servers, databases, and tables default to `utf8mb4` with collation `utf8mb4_0900_ai_ci`. Before 8.0 (5.7 and earlier) the default was `latin1` with `latin1_swedish_ci`, which is why so many older apps hit the ???? problem — they never explicitly chose a charset.

**LENGTH vs CHAR_LENGTH — bytes are not characters.**

This trips people up in interviews and in production. `LENGTH('😀')` returns 4 because it counts bytes in the current encoding. `CHAR_LENGTH('😀')` returns 1 because it counts characters. A `VARCHAR(10)` with `utf8mb4` means 10 characters, but it can need up to 40 bytes on disk. This matters for index limits — InnoDB's old 767-byte index limit means `VARCHAR(255)` with `utf8mb4` needs 1020 bytes, which overflows. That is why you see `Specified key was too long` errors when converting to utf8mb4 and need `DYNAMIC` row format and `innodb_large_prefix`.

**Conversion pitfalls — why ALTER TABLE can corrupt data.**

Changing charset is not just flipping a label. MySQL has two very different commands:

- `ALTER TABLE t CONVERT TO CHARACTER SET utf8mb4` — re-encodes every string value from the old charset to the new one. Use this when the old data was stored correctly and you want to truly convert it.
- `ALTER TABLE t MODIFY col VARCHAR(100) CHARACTER SET utf8mb4` — changes the label without re-encoding, or re-encodes depending on context. Dangerous if the data was already mis-stored.

The classic disaster: data was inserted as UTF-8 bytes but the column was `latin1`. MySQL stored the UTF-8 bytes as if they were latin1 characters. On screen it looks like `JosÃ©` instead of `José`. If you now run `CONVERT TO utf8mb4`, MySQL thinks the data is latin1 and converts that already-wrong data again — double-encoding it into even more garbage like `JosÃÂ©`. To fix mis-stored data you have to first tell MySQL what the bytes actually are (convert to `BINARY`, then to the correct charset) without transcoding.

Always back up, test conversion on a copy, and check `SHOW CREATE TABLE` and `SHOW VARIABLES LIKE 'character_set%'` before touching production.

## 4. See It In Practice — Real Code or Queries

All examples are MySQL / InnoDB.

```sql
-- Check every level — run this first when debugging garbled text
SHOW VARIABLES LIKE 'character_set%';
SHOW VARIABLES LIKE 'collation%';
-- Typical healthy 8.0 output: all utf8mb4 / utf8mb4_0900_ai_ci

-- See what a specific database/table/column actually uses
SHOW CREATE DATABASE myapp;
SHOW CREATE TABLE users;
SHOW FULL COLUMNS FROM users;

-- Create with explicit charset — never rely on server defaults
CREATE DATABASE myapp
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  bio TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  -- Column charset overrides table/database charset
  legacy_code VARCHAR(20) CHARACTER SET latin1 COLLATE latin1_bin
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert emoji — succeeds only if column AND connection are utf8mb4
SET NAMES utf8mb4;
INSERT INTO users (name, bio) VALUES ('Asha 😀', 'Loves café and naïve sorting');

-- The bug: connection is still latin1/utf8mb3
SET NAMES latin1;
-- This either throws ERROR 1366 or stores ???? depending on sql_mode
INSERT INTO users (name) VALUES ('Test 😀');

-- Fix the connection from your app (Node.js mysql2 example)
-- const pool = mysql.createPool({ charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' });
-- Always use utf8mb4 in the connection string, not utf8

-- LENGTH vs CHAR_LENGTH — bytes vs characters
SELECT
  CHAR_LENGTH('😀') AS chars,  -- 1
  LENGTH('😀') AS bytes_utf8mb4, -- 4
  CHAR_LENGTH('café') AS cafe_chars, -- 4
  LENGTH('café') AS cafe_bytes;      -- 5 (é is 2 bytes in utf8mb4)

-- Collation affects comparison and sorting
SELECT 'a' = 'A' COLLATE utf8mb4_0900_ai_ci; -- 1 (equal, case-insensitive)
SELECT 'a' = 'A' COLLATE utf8mb4_0900_as_cs; -- 0 (not equal, case-sensitive)
SELECT 'e' = 'é' COLLATE utf8mb4_0900_ai_ci; -- 1 (accent-insensitive)
SELECT 'e' = 'é' COLLATE utf8mb4_0900_as_cs; -- 0 (accent-sensitive)
SELECT * FROM users ORDER BY name COLLATE utf8mb4_0900_ai_ci;

-- Correctly convert a table that was stored properly as latin1/utf8mb3
ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Fix data that was mis-stored: UTF-8 bytes stuffed into a latin1 column
-- Step 1: convert to BINARY to preserve raw bytes without transcoding
-- Step 2: convert to real charset so bytes are interpreted correctly
ALTER TABLE users MODIFY name VARBINARY(400);
ALTER TABLE users MODIFY name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Check max index length before converting large VARCHARs
-- VARCHAR(255) * 4 bytes = 1020 bytes > 767, needs DYNAMIC + large prefix
SET GLOBAL innodb_file_format = 'Barracuda';
-- Ensure ROW_FORMAT=DYNAMIC (default in 8.0) to avoid "key too long"
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a charset and how is it different from a collation?**

A charset is the dictionary that maps byte sequences to characters. It decides how `F0 9F 98 80` becomes `😀`. A collation is the rulebook for comparing and sorting characters within that charset — whether `a` equals `A`, whether `é` equals `e`, and what order results come back in. Every collation belongs to one charset. You pick the charset for what you can store, and the collation for how you want to search and sort.

**Q: Why does MySQL have `utf8` and `utf8mb4`? Which one should you use?**

`utf8` in MySQL is really `utf8mb3` — it stores at most 3 bytes per character and cannot hold emoji or any character outside the Basic Multilingual Plane. It exists for historical reasons. `utf8mb4` stores up to 4 bytes and is real UTF-8. Always use `utf8mb4` for any new table. If you see `utf8` in a schema, assume it is 3-byte and will break on emoji unless proven otherwise.

**Q: What happens when you try to insert an emoji into a `utf8` (utf8mb3) column?**

You get `ERROR 1366: Incorrect string value: '\xF0\x9F\x98\x80'` and the insert fails. The 4-byte sequence has no entry in the 3-byte dictionary. In non-strict mode or with certain client settings it may silently truncate or replace the character with `?`, which is even harder to debug because the app thinks it succeeded.

**Q: What are the different levels where charset is configured?**

Server, database, table, column, and connection. Each level is a default for the next. The column charset is the final truth for storage — it decides how bytes on disk are interpreted. The connection charset (`character_set_client` / `connection` / `results`, set together with `SET NAMES`) decides how bytes are transcoded on the wire between your app and MySQL. A mismatch between connection and column causes corruption even if the column itself is correct.

**Q: What is the default charset in MySQL 8.0 and why does it matter?**

MySQL 8.0 defaults to `utf8mb4` with `utf8mb4_0900_ai_ci`. Before 8.0 the default was `latin1` / `latin1_swedish_ci`. That is why older tutorials and migrated databases often still run on latin1 or utf8mb3. If you deploy to 8.0 without ever specifying a charset, you get utf8mb4 by luck. If you migrate an old dump without checking, you inherit whatever the dump declared.

**Q: What is `SET NAMES` and why do ORMs sometimes get it wrong?**

`SET NAMES utf8mb4` tells MySQL "my client will send utf8mb4, treat incoming bytes as utf8mb4, and send results back as utf8mb4." It sets `character_set_client`, `connection`, and `results` together. If your ORM or connection string says `charset: utf8` (which is utf8mb3) while your table is utf8mb4, MySQL will transcode and strip or mangle 4-byte characters. The fix is to set the connection charset to `utf8mb4` in your pool config.

**Q: What is the difference between `LENGTH()` and `CHAR_LENGTH()`?**

`LENGTH()` counts bytes, `CHAR_LENGTH()` counts characters. For `utf8mb4`, `'😀'` has `LENGTH = 4` and `CHAR_LENGTH = 1`, `'café'` has `LENGTH = 5` and `CHAR_LENGTH = 4`. Use `CHAR_LENGTH` for user-visible limits and `LENGTH` when reasoning about storage and index size. `VARCHAR(100)` limits characters, not bytes.

**Q: How do you safely convert a table from `latin1` or `utf8mb3` to `utf8mb4`?**

If the data was stored correctly, run `ALTER TABLE t CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci` — this re-encodes every value. Test on a copy first, because the table will be rebuilt and large tables will lock or take time (use `pt-online-schema-change` or `gh-ost` online). Watch for index length errors — `VARCHAR(255)` with utf8mb4 needs 1020 bytes, so you may need to shorten indexed columns or ensure `ROW_FORMAT=DYNAMIC`. If the data was mis-stored (UTF-8 bytes inserted into a latin1 column and now showing as `Ã©`), you must go through `BINARY` to preserve raw bytes before converting, otherwise you double-encode the garbage.

**Q: How does collation affect queries?**

Collation decides equality and ordering. With `utf8mb4_0900_ai_ci`, `WHERE name = 'john'` matches `John`, `JOHN`, and `john`, and `ORDER BY name` groups `e` and `é` together. With `utf8mb4_bin` or `0900_as_cs`, those are distinct. This affects `UNIQUE` constraints too — a `UNIQUE` index with `_ci` collation treats `a@x.com` and `A@x.com` as duplicates, while `_bin` does not. Pick `_ci` for most user-facing text and `_bin` or `_cs` when exact byte identity matters like API keys or email canonical storage.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Thinking `utf8` means real UTF-8.**

It does not in MySQL. `utf8` is an alias for `utf8mb3`, which is 3-byte and breaks on emoji. The error message looks confusing because you thought you were already on UTF-8. Fix by using `utf8mb4` everywhere and searching your schema for any remaining `utf8` without `mb4` — `SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE CHARACTER_SET_NAME = 'utf8'`.

**Trap 2: Data that looks correct but is stored as latin1 bytes.**

The app sends UTF-8, the connection says latin1, MySQL stores the UTF-8 bytes as latin1 characters. The app reads it back through the same wrong connection and it looks right in the app but is actually `JosÃ©` on disk. Backups, replicas, or a fixed connection then expose the corruption. You catch this by comparing `LENGTH` and `CHAR_LENGTH`, checking `SHOW CREATE TABLE`, and querying with a correct `SET NAMES utf8mb4` connection — if the data suddenly looks broken, it was mis-stored.

**Trap 3: Double-encoding when fixing the previous trap.**

Running `CONVERT TO utf8mb4` on already mis-stored data converts the latin1-interpreted garbage again, turning `Ã©` into `ÃÂ©`. Recovery requires the two-step through `VARBINARY`/`BINARY` to freeze the raw bytes first. Always test conversion on a dump copy and verify sample rows with emoji and accented characters.

**Trap 4: Connection charset does not match column charset.**

Column is `utf8mb4` but the app connects with `SET NAMES latin1` or a pool config of `charset: utf8`. Every read and write transcodes. Writes corrupt emoji to `?`, reads may mojibake. Set `charset=utf8mb4` in the connection string and verify with `SHOW VARIABLES LIKE 'character_set_connection'` from the app itself, not just from the MySQL CLI.

**Trap 5: Index too long after converting to utf8mb4.**

`VARCHAR(255)` with `utf8mb3` needs 765 bytes (fits 767 limit), with `utf8mb4` needs 1020 bytes (does not fit). Converting an old table fails with `Specified key was too long`. Fix by using `ROW_FORMAT=DYNAMIC`, enabling `innodb_large_prefix` (default on in 8.0), shortening the indexed prefix (`VARCHAR(191)` fits 764 bytes), or using a prefix index `INDEX(name(191))`.

**Trap 6: Using `LENGTH()` to enforce user-visible limits.**

`LENGTH('😀😀😀')` is 12 but it is only 3 characters. If you validate with `LENGTH` you reject valid short strings and allow visually long strings that are short in bytes. Validate character count with `CHAR_LENGTH` or in application code, and size `VARCHAR` for characters while sizing storage and indexes for bytes.

**Trap 7: Assuming collation does not affect uniqueness and search.**

Creating a `UNIQUE` email column with `utf8mb4_0900_ai_ci` means `Test@Example.com` and `test@example.com` collide — sometimes desired, sometimes not. Searching with `LIKE` or `=` under `_ai_ci` silently matches accent variants. If you need exact matching for tokens or canonical emails, use `utf8mb4_bin` or `utf8mb4_0900_as_cs` for that column.

## 7. Compare With Related Concepts

**Charset vs collation.**

Charset is what you can store — the byte-to-character dictionary. Collation is how you compare and sort what you stored. You cannot fix a missing emoji by changing collation, and you cannot fix case-insensitive duplicates by changing charset. Rule: pick charset for coverage (`utf8mb4` unless you have a proven reason for `latin1` or `ascii`), pick collation for search behavior (`_ai_ci` for forgiving user search, `_as_cs` or `_bin` for exact matching).

**utf8mb3 vs utf8mb4.**

Both are UTF-8 encodings, but `utf8mb3` is capped at 3 bytes and `utf8mb4` at 4 bytes. `utf8mb3` is smaller per row for BMP text but incomplete. `utf8mb4` is complete and is the only correct default today. The storage cost difference is small — only characters that need 4 bytes use the extra byte. Rule: never create new columns with `utf8`/`utf8mb3`. Migrate old ones.

**MySQL `utf8` vs real UTF-8 in other systems.**

In Postgres, Python, and the browser, `utf8` means 4-byte UTF-8. In MySQL it means 3-byte. This mismatch bites when you export from Postgres to MySQL or when a Node.js app assumes `utf8` is safe everywhere. Rule: whenever you see `utf8` near MySQL, read it as `utf8mb3` and change it to `utf8mb4`.

**Column charset vs connection charset.**

Column charset is the on-disk truth. Connection charset is the wire agreement. Changing the column without changing the connection (or vice versa) still corrupts. Rule: after migrating columns to `utf8mb4`, grep every connection string, ORM config, and `SET NAMES` in the codebase and change them too.

**`VARCHAR` length vs byte length.**

`VARCHAR(100)` is 100 characters, not 100 bytes. Indexes, row size, and `LENGTH()` care about bytes. Rule: use `CHAR_LENGTH` for product limits, `LENGTH` for capacity planning, and remember `chars × max_bytes_per_char` for index sizing.

## 8. 🧠 The Memory Hook

Charset is the dictionary, collation is the sorting rule. MySQL's `utf8` is a fake 3-byte dictionary that has no word for 😀 — `utf8mb4` is the real one. The column decides what is on disk, the connection decides what travels on the wire, and if they disagree you get `????` or `ERROR 1366`.
