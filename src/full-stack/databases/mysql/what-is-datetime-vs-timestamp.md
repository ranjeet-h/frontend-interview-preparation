# What is DATETIME vs TIMESTAMP

## 1. The Real-World Problem — When You Actually Hit This

Your app stores a meeting as `2024-03-10 02:30:00`. In Los Angeles that time never existed — clocks jumped forward for DST. You inserted it, no error, and now when you read it back from a server set to `America/Los_Angeles` versus one set to `UTC`, you get two different moments. Or the opposite bug: you stored every event as `TIMESTAMP` because someone said "always use TIMESTAMP for time." It worked for years, then a user tries to set a reminder for 2040 and MySQL rejects it. Or worse, your `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` starts auto-updating on every row update and you silently overwrite history.

These are not edge cases. MySQL gives you two types that look identical in a SELECT but mean completely different things. If you pick wrong, DST, time zones, and 2038 will break you quietly.

## 2. The Analogy — Make the Mechanic Obvious

Think of DATETIME as a photo of a wall clock.

You walk into a room, the clock says 3:15, you write down "3:15" on a sticky note. You do not write where the room was or what time zone it was in. If someone in Tokyo reads that note later, they just see "3:15." It never changes. It is exactly what you wrote.

TIMESTAMP is a UTC stopwatch.

When you write down a time, the stopwatch secretly converts it to UTC and stores that UTC moment. When someone reads it later, the stopwatch converts that UTC moment into whatever time zone the reader is currently sitting in. Same stored moment, different wall-clock display depending on who is reading.

That is the whole difference. DATETIME stores what you gave it. TIMESTAMP stores a UTC point-in-time and translates it per session.

## 3. The Full Explanation — How It Actually Works

DATETIME stores the calendar value as-is. No time zone. No conversion on write, no conversion on read. What you insert is what you get back, byte for byte. Range is `1000-01-01 00:00:00` to `9999-12-31 23:59:59`. Storage is 5 bytes for `DATETIME` without fractional seconds, plus up to 3 bytes for fractional seconds (0 to 6 digits), so 5 to 8 bytes total. It is great for future dates — birthdays, anniversaries, expiry dates in 2050, scheduling far ahead — because it does not hit 2038. But it does not know what moment in time it represents. `2024-06-01 10:00:00` could be 10am in Mumbai or 10am in New York — MySQL cannot tell. You have to track the zone yourself if it matters.

TIMESTAMP stores a real moment on the global timeline. Internally MySQL converts the value you insert from your current `time_zone` session setting into UTC and stores that UTC value. On SELECT it converts back from UTC into the reader's current `time_zone`. So the same row shows `2024-06-01 10:00:00` to a client in `+00:00` and `2024-06-01 15:30:00` to a client in `Asia/Kolkata`. Range is `1970-01-01 00:00:01 UTC` to `2038-01-19 03:14:07 UTC`. Storage is 4 bytes (plus fractional seconds storage), which is why it stops in 2038 — a signed 32-bit seconds counter overflows. That is the Year 2038 problem. To go beyond 2038 you need `DATETIME`, a `BIGINT` of epoch, or a MySQL version that widens `TIMESTAMP` internally. Until then, do not use `TIMESTAMP` for any date that could be after Jan 2038.

Auto-update quirks trip everyone. Before MySQL 5.6, the first `TIMESTAMP` column in a table automatically got `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` even if you did not ask for it. That meant an accidental `UPDATE users SET name = 'A' WHERE id = 1` would silently change `created_at`. Since MySQL 5.6 and especially in MySQL 8.0, with `explicit_defaults_for_timestamp = ON` (the default), nothing is automatic — you must write `DEFAULT CURRENT_TIMESTAMP` and `ON UPDATE CURRENT_TIMESTAMP` explicitly, and `DATETIME` can use them too. Always declare exactly what you want. If you only want creation time, use `DATETIME DEFAULT CURRENT_TIMESTAMP` with no ON UPDATE. If you want a last-modified column, add `ON UPDATE CURRENT_TIMESTAMP` intentionally.

Performance and indexing is essentially the same for both — they are indexed and compared as numbers internally. The difference is correctness, not speed. Choose based on meaning: if the column is "when did this happen in the real world?" use `TIMESTAMP`. If it is "what did the user write on the form?" or "a future local time that must not shift with zone changes," use `DATETIME` (and store zone separately if needed).

MySQL 8.0 defaults to keep in mind: `explicit_defaults_for_timestamp = ON`, time zone tables are not loaded by default so named zones like `America/Los_Angeles` only work after `mysql_tzinfo_to_sql`, and fractional seconds are supported for both types up to 6 digits with indexed queries still working.

## 4. See It In Practice — Real Code or Queries

Storing as-is versus storing as UTC point-in-time:

```sql
-- DATETIME keeps exactly what you insert
-- TIMESTAMP converts to UTC on write and back to session zone on read
CREATE TABLE events (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(100),
  happens_at_datetime DATETIME,              -- 5-8 bytes, range 1000-9999, no tz
  happens_at_timestamp TIMESTAMP,            -- 4 bytes, range 1970-2038, UTC internally
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- no auto-update unless you add ON UPDATE
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Declare intent explicitly: creation vs last-modified
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- set once
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP -- changes every update
);
```

How `TIMESTAMP` conversion surprises you:

```sql
-- Session A inserts in Kolkata time
SET time_zone = 'Asia/Kolkata';
INSERT INTO events (title, happens_at_datetime, happens_at_timestamp)
VALUES ('launch', '2024-06-01 10:00:00', '2024-06-01 10:00:00');

-- Same row, two readers, two different displays for TIMESTAMP
SET time_zone = 'Asia/Kolkata';
SELECT happens_at_datetime, happens_at_timestamp FROM events;
-- DATETIME: 2024-06-01 10:00:00 | TIMESTAMP: 2024-06-01 10:00:00

SET time_zone = '+00:00';
SELECT happens_at_datetime, happens_at_timestamp FROM events;
-- DATETIME: 2024-06-01 10:00:00 | TIMESTAMP: 2024-06-01 04:30:00  -- same UTC moment, shifted display

-- DATETIME never shifts
SET time_zone = 'America/Los_Angeles';
SELECT happens_at_datetime FROM events;
-- still 2024-06-01 10:00:00 no matter the session zone
```

Range and 2038 failure:

```sql
-- DATETIME handles far future, TIMESTAMP does not
INSERT INTO events (title, happens_at_datetime) VALUES ('expiry', '2040-12-01 00:00:00'); -- ok
INSERT INTO events (title, happens_at_timestamp) VALUES ('expiry', '2040-12-01 00:00:00'); -- ERROR 1292: Incorrect datetime value

-- Common workaround: store future local time as DATETIME, or epoch as BIGINT
ALTER TABLE events ADD COLUMN happens_at_epoch BIGINT; -- store UNIX timestamp in app code if you must go beyond 2038
```

Check what defaults you actually got:

```sql
SHOW CREATE TABLE users\G
-- Look for DEFAULT CURRENT_TIMESTAMP and ON UPDATE CURRENT_TIMESTAMP
-- If you see ON UPDATE on created_at, fix the DDL

-- See current session zone that will affect TIMESTAMP reads
SELECT @@global.time_zone, @@session.time_zone;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is the core difference between DATETIME and TIMESTAMP in MySQL?**

DATETIME stores exactly what you insert — a calendar date and wall-clock time with no time zone. TIMESTAMP stores a UTC point-in-time. On insert MySQL converts your input from the session's `time_zone` to UTC, and on SELECT it converts back to whatever `time_zone` the reader is using. So DATETIME says "the clock said 10:00" and TIMESTAMP says "this instant happened, shown as 10:00 in your zone."

**Q: What are their ranges and storage sizes?**

DATETIME covers `1000-01-01` to `9999-12-31` and takes 5 bytes without fractional seconds, up to 8 bytes with up to 6 digits of fractional seconds. TIMESTAMP covers `1970-01-01 00:00:01 UTC` to `2038-01-19 03:14:07 UTC` and takes 4 bytes plus fractional storage. That 4-byte limit is why TIMESTAMP dies in 2038 — it is a signed 32-bit count of seconds since epoch overflowing. MySQL 8.0 still uses 4 bytes for TIMESTAMP.

**Q: When should you use DATETIME vs TIMESTAMP?**

Use TIMESTAMP when the column means a real instant — `created_at`, `updated_at`, `logged_in_at`, audit logs, anything where ordering across zones matters. The UTC storage guarantees everyone is comparing the same moment. Use DATETIME when the column means a local wall-clock time that must stay fixed even if zones shift — a meeting set for "March 10 at 9am in New York" stored as what the user typed, a birthday, a store opening hour, or any date past 2038. If you use DATETIME for an instant, you must also store the zone or always treat it as UTC in your app.

**Q: Does changing `time_zone` affect data already stored?**

For TIMESTAMP, yes on read. The stored UTC value does not change, but every SELECT now renders it in the new zone, so the same row displays differently. For DATETIME, no — it is just a string of numbers, MySQL never converts it, so changing `time_zone` does nothing to its output. This is why a TIMESTAMP table looks "wrong" after you move your app server to a different region.

**Q: What is the `ON UPDATE CURRENT_TIMESTAMP` trap?**

Old MySQL gave the first TIMESTAMP column that behavior automatically, silently updating it on any row UPDATE. In MySQL 8.0 with `explicit_defaults_for_timestamp = ON` it only happens if you write it, but DATETIME can also declare `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` now. The bug is still common: people put `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` on `created_at` by copy-paste and then wonder why creation time keeps changing. Fix it by declaring `created_at DATETIME DEFAULT CURRENT_TIMESTAMP` with no ON UPDATE, and only put ON UPDATE on `updated_at`.

**Q: How do indexes and comparisons work? Do time zones affect WHERE clauses?**

Both types index the same way and compare quickly. But TIMESTAMP WHERE clauses are zone-sensitive. `WHERE happens_at_timestamp = '2024-06-01 10:00:00'` is converted from your session zone to UTC before comparison, so two sessions with different zones querying the same string find different rows. With DATETIME the string is compared as-is with no conversion. For correctness, many teams set the application connection to `time_zone = '+00:00'` and handle zone display in code, so TIMESTAMP queries are always in UTC.

**Q: How do you handle the 2038 limit and fractional seconds in MySQL 8.0?**

For 2038, do not use TIMESTAMP for any column that could hold a date after Jan 2038. Use DATETIME or BIGINT epoch. There is no flag that magically widens TIMESTAMP to 64-bit on disk in 8.0. For fractional seconds, both types support `(0)` to `(6)` — for example `DATETIME(3)` for milliseconds or `TIMESTAMP(6)` for microseconds. Each adds 0-3 bytes. Index size grows slightly but queries like `WHERE created_at > '2024-06-01 10:00:00.123'` work as expected.

## 6. The Traps — What Goes Wrong in Production

The session zone silently changes the meaning of reads and writes. A developer inserts with `time_zone = 'Asia/Kolkata'`, later a cron job runs with `time_zone = '+00:00'` and selects the same TIMESTAMP expecting 10:00 but gets 04:30. People assume the database stores "10:00" — it stored UTC. Fix it by fixing the connection zone to `+00:00` everywhere and converting to user zones in application code, not in MySQL sessions.

Using TIMESTAMP for future dates. Someone stores a subscription expiry of `2045-01-01` in a TIMESTAMP column. MySQL rejects it or wraps past 2038, and the customer loses access years early. If the date can be beyond 2038, it must be DATETIME.

Putting ON UPDATE on the wrong column. `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` looks harmless, then every profile edit rewrites the user's signup date and audit reports go wrong. Declare creation and update columns separately and verify with `SHOW CREATE TABLE`.

Assuming DATETIME knows the time zone. A team stores event times as DATETIME thinking MySQL remembers it was "PST." It does not. After a DST change the event shows one hour off. If the local time matters, store DATETIME plus a separate zone column like `event_zone VARCHAR(64)` or store TIMESTAMP as the true instant and render in the event's zone in the app.

Forgetting that MySQL time zone names may be missing. On many 8.0 installs, `SET time_zone = 'America/Los_Angeles'` fails until you run `mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql mysql`. Without that, you fall back to offsets like `+05:30` which do not handle DST correctly.

## 7. Compare With Related Concepts

DATETIME vs TIMESTAMP vs BIGINT epoch. DATETIME is a wall-clock photo with no zone, range 1000-9999, no conversion, best for future local times. TIMESTAMP is a UTC instant with per-session conversion, range 1970-2038, 4 bytes, best for "when did this happen" that must compare across zones. BIGINT epoch (like `1704067200`) is what the app converts entirely outside MySQL — sortable and zone-free but not human-readable in SQL and needs app logic for every query. One-line rule: if it is a past instant everyone must agree on, use TIMESTAMP; if it is a future local time or must survive past 2038, use DATETIME (plus zone); if you need full control and portability, use BIGINT epoch and convert in code.

DATETIME / TIMESTAMP vs MySQL `DATE` and `TIME`. DATE is calendar date only, TIME is time-of-day or duration. One-line rule: use DATE when zone and time never matter (birthdays), use DATETIME/TIMESTAMP when an exact moment matters.

MySQL `TIMESTAMP` vs PostgreSQL `timestamptz`. MySQL TIMESTAMP always stores UTC and always converts per session. PostgreSQL `timestamp with time zone` also stores UTC but its display logic is similar — yet its plain `timestamp without time zone` behaves like MySQL DATETIME. One-line rule: in MySQL there are two types; in Postgres remember that `timestamptz` is the UTC instant and plain `timestamp` is the wall clock.

## 8. 🧠 The Memory Hook

DATETIME is a sticky note that says "the clock said 3:15" — it never changes. TIMESTAMP is a UTC stopwatch that tells each reader "that moment was 3:15 where YOU are."

If someone wakes you at 3am: wall clock photo versus UTC instant, 2038 kills TIMESTAMP not DATETIME, and ON UPDATE only happens if you wrote it.
