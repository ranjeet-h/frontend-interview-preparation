# What Are PostgreSQL Data Types

## 1. The Real-World Problem — When You Actually Hit This

It's month-end. Your finance team runs reconciliation between your database and the payment gateway, and the books are off by a few cents. Not dollars — cents. Every invoice looks fine on screen. But order #8817 totals $19.99 in the gateway and $19.989999999999998 in your totals report, and once you sum thousands of orders those invisible fractions become a mismatch nobody can explain.

You dig in and find the column was created as `double precision`. Someone picked "a number type" during a migration thirty seconds before lunch and moved on. That one choice is now eating engineering days, because floating-point math physically cannot store most decimal amounts exactly, and no amount of application-side rounding fixes a value that was already wrong the moment it was written.

This is what data types are actually about. A type isn't a label on a column. It's a contract the database enforces at the door: what values are allowed in, how much space they take, and what questions you can ask them later. Choose well and invalid data never enters the building. Choose carelessly and you find out months later through a reconciliation spreadsheet.

## 2. The Analogy — Make the Mechanic Obvious

Think about opening a bank account with paper forms. Every field on the form has printed boxes shaped for its contents.

The amount fields have exactly two cells after the decimal point. You physically cannot write $0.30000000000000004 on that form — the boxes don't exist. That's `numeric`: exact decimal storage where the shape of the field guarantees the value.

There's a checkbox for "is this account joint?" It's either ticked, unticked, or the applicant skipped it. Tick, untick, blank — that's `true`, `false`, and `NULL`. Three states, and the blank genuinely means "unknown," not "no."

The date-of-birth field has separate cells for day, month, and year. Nobody can write "sometime in March." Because every form writes dates identically, the clerk can sort ten thousand forms by birthday instantly. Uniform shape is what makes sorting and comparison cheap — that's why typed columns can be indexed and range-scanned fast.

Each form also gets a serial number in a strict format — fixed length, fixed characters, always validated. That's `uuid`: an identifier that can never be malformed and always occupies the same space.

And there's one clear plastic sleeve stapled to the back: "additional documents go here." Handy for oddball stuff the form didn't anticipate. But the bank can't validate what's inside the sleeve, can't sort by it, and two sleeves almost never contain the same kinds of things. That's `jsonb` — genuinely useful for unpredictable payloads, terrible as a replacement for the actual form fields.

That's the whole mechanic. The boxes aren't decoration. They decide what gets accepted at the counter, how much cabinet space each record takes, and whether the clerk can answer "sum all amounts" or "sort by issue date" without opening a single envelope. A form where every field says "write anything here" feels flexible for one week and becomes unusable the first time someone asks a real question.

## 3. The Full Explanation — How It Actually Works

In our analogy, the printed boxes are the data types and the clerk who refuses malformed forms is Postgres itself. When you declare a column `numeric(12,2)` or `timestamptz`, Postgres checks every incoming value against that contract and rejects violations outright — no matter which application, script, or analyst tries to sneak bad data in. That's the core idea most people miss: **validation lives in the database, so it protects you from every writer, including the intern's one-off SQL script.** An API-level validator only protects you from the API.

Now the families that actually come up in interviews.

**Numbers: int, bigint, numeric — and why floats are off-limits for money.**

An `integer` is 4 bytes and holds roughly ±2.1 billion. A `bigint` is 8 bytes and holds about ±9.2 quintillion — effectively "never runs out." The trap is that 2.1 billion sounds enormous until you're counting events, likes, or log lines on a growing product; YouTube famously overflowed its 32-bit view counter when Gangnam Style blew past the limit in 2014. The senior instinct: if a number *grows* — IDs, counters, event totals — start with `bigint`. The cost is 4 extra bytes per row; the cost of an overflow migration on a live table is weeks of pain.

`numeric` is Postgres's exact-decimal type. It stores digits the way you'd write them on paper, so `0.1 + 0.2` comes out as exactly `0.3`. The price is speed: integers and floats are handled with single CPU instructions, while `numeric` math is done digit-by-digit in software. You pay a little compute for guaranteed correctness. For money that trade is a no-brainer, and you have two acceptable designs: store minor units as an integer (`total_cents bigint`) or store the amount itself as `numeric(12,2)`. Both are exact. Teams doing heavy aggregation often prefer cents-as-bigint because integer math is faster and nobody is ever tempted to mix dollars-and-cents decimals into tax multiplication.

Floating-point types (`real`, `double precision`) exist for measurements, coordinates, and scientific data — places where "very close" is acceptable. They're binary fractions, and most human decimals like 0.1 simply have no exact binary representation, the same way 1/3 has no exact decimal representation. This is base-2 physics, not a Postgres bug — JavaScript's infamous `0.1 + 0.2 !== 0.3` fails for the identical reason. The difference is that a UI rounding glitch is cosmetic while a stored ledger total is forever.

**Text: varchar(n), char(n), text — mostly the same thing.**

Here's the fact that surprises people arriving from MySQL: in Postgres, `varchar(n)` and `text` have **identical performance and identical storage**. The length limit on `varchar(n)` is nothing but a check performed at write time. There is no tuning advantage to picking a clever length. `char(n)` is the odd one out — it blank-pads short values to exactly n characters, which causes subtle comparison surprises and is essentially never what you want.

So the practical rule flips the usual advice: default to `text`, and add a length only when a real business rule exists ("usernames max 30 characters"). If the rule changes later, a `CHECK (length(name) <= 30)` constraint drops trivially without a table rewrite. The famous `varchar(255)` cargo cult came from old MySQL, where row-size and temp-table behavior genuinely depended on declared lengths. Postgres never had that behavior. Copying `varchar(255)` into a Postgres schema is superstition, not engineering.

**Temporal: timestamp vs timestamptz.**

Postgres gives you `date`, `time`, `timestamp` (without time zone), `timestamptz` (with time zone), and `interval`. The timestamp-vs-timestamptz distinction is the single most common interview question in this family, and the name lies to you.

Neither type stores a time zone. Both are just 8-byte counters of microseconds. What differs is how they treat input and output:

`timestamptz` stores a *moment in history*. Hand it `2026-08-26 09:00:00+05:30` and it converts to the equivalent UTC instant before storing anything. Read it back and it renders that instant according to your session's `TimeZone` setting. Same moment, different wall clocks — deliberately.

`timestamp` stores a *wall-clock reading with no anchor*. Hand it `2026-08-26 09:00:00` and it stores exactly those digits. If the writer meant Tokyo time and the reader assumes London time, nothing in the data will ever reveal the mistake.

Back to the bank: head office keeps one master clock (UTC). Every branch records transactions against it, and each branch's statements print times in local terms. That's `timestamptz`. Plain `timestamp` is telling every branch to jot down whatever their wall clock says, with no reference clock anywhere. Two entries reading "09:00" might be six hours apart, and no query can detect it.

The rule seniors follow: **every column representing a real-world event uses `timestamptz`.** Order placements, audit trails, session expiries, log moments — all of it. Reserve bare `timestamp` for the rare case where the wall-clock reading *is* the data, like "the show starts at 20:00 venue-local time" — a recurring label, not a historical moment. Use `interval` for durations ("expires in 90 days") instead of hand-rolled date arithmetic that breaks whenever a month has 28 or 31 days.

**Boolean.**

One byte holding `true`, `false`, or `NULL`. The three-state reality matters in queries: `WHERE paid <> false` will *not* match rows where paid is unknown, because any comparison against `NULL` yields unknown, not true. Resist legacy `'Y'/'N'` character columns — they lose real boolean logic and invite `'y'`, `'yes'`, and empty-string garbage into the same column.

**uuid.**

A native 128-bit type: 16 bytes of storage, format-validated on every write, with `gen_random_uuid()` built in since PostgreSQL 13. Storing the same identifier as text costs more than twice the bytes, skips validation entirely, and compares slower. Generation strategies, index fragmentation, and the uuid-versus-bigserial decision are covered properly on the [UUID in PostgreSQL](what-is-uuid-in-postgresql.md) page.

**jsonb.**

Binary JSON storage that's indexable and queryable. It earns its place for genuinely unpredictable payloads — third-party webhook bodies, per-integration settings, feature-flag blobs. But it validates nothing inside, gets poor planner statistics on inner keys, and can't host foreign keys. The deep mechanics live on the [What is JSONB](what-is-jsonb.md), [JSON vs JSONB](json-vs-jsonb.md), and [querying JSONB fields](how-do-you-query-jsonb-fields.md) pages.

**Arrays.**

Native columns like `text[]` with operators such as `= ANY(...)`, GIN-indexable for fast membership tests. Great for tag lists that never need rows of their own. Patterns and indexing live on the [arrays in PostgreSQL](how-do-you-store-arrays-in-postgresql.md) page.

**Enums.**

`CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'void')` gives you a compact validated label whose sort order follows declaration order, not alphabetical order. Adding values later is easy with `ALTER TYPE ... ADD VALUE`; removing one essentially means rebuilding the type. That rigidity is the price of the guarantee — decide accordingly.

**Why the rich type system beats bolting JSON everywhere.**

The temptation is real: make every column `jsonb` and never run another migration. Here's what that actually costs you. Write-time validation disappears — the database stops protecting you, so every writer must reimplement the same checks and one of them will eventually forget. Referential integrity disappears — foreign keys cannot reach inside JSON. Storage inflates — a typed `uuid` is 16 bytes, while the same ID inside JSON is a quoted string plus key overhead. Query planning degrades — Postgres collects per-column statistics to estimate row counts, and inner JSON keys get none unless you build expression indexes and extended statistics by hand. And operators vanish — range scans on dates, containment checks on arrays, correct ordering on numerics all exist because the type defines them. The sleeve is for genuinely unstructured extras. Everything with a known shape belongs in a typed column.

## 4. See It In Practice — Real Code or Queries

A production-shaped `invoices` table using the types we just covered:

```sql
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'void');

CREATE TABLE invoices (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  bigint NOT NULL REFERENCES customers(id),
    -- Exact money as integer minor units. Alternative: numeric(12,2).
    -- Both are exact; double precision is neither.
    total_cents  bigint NOT NULL CHECK (total_cents >= 0),
    -- text + an explicit business rule beats char(3)'s silent space-padding
    currency     text   NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    status       invoice_status NOT NULL DEFAULT 'draft',
    -- A moment in history: stored normalized to UTC, rendered per session zone
    issued_at    timestamptz NOT NULL DEFAULT now(),
    due_date     date   NOT NULL,
    paid         boolean NOT NULL DEFAULT false,
    tags         text[] NOT NULL DEFAULT '{}',
    metadata     jsonb  NOT NULL DEFAULT '{}'::jsonb
);
```

Every column here carries a decision: identity grows, so `bigint`; money must be exact, so integer cents with a positivity rule; currency has a real format, so `text` plus a regex check instead of a padded `char(3)`; the issue time is a historical event, so `timestamptz`; the due date is calendar-only, so plain `date` is correct and honest.

The float mistake, demonstrated rather than asserted:

```sql
SELECT 0.1::double precision + 0.2::double precision;
--      0.30000000000000004

SELECT 0.1::numeric + 0.2::numeric;
--      0.3
```

That first result is what lands in your ledger when money lives in a float column. It looks tiny per row — reconciliation failures are just this error summed over millions of rows.

Why `timestamptz` renders differently per session while staying one truth:

```sql
SET timezone = 'Asia/Kolkata';
SELECT '2026-08-26 09:00:00+05:30'::timestamptz;
--      2026-08-26 09:00:00+05:30

SET timezone = 'Europe/London';
SELECT '2026-08-26 09:00:00+05:30'::timestamptz;
--      2026-08-26 04:30:00+01   ← same instant, different wall clock
```

Both sessions read the identical stored value. Only the rendering changed, because the stored instant is UTC-based and each session asks for its local view.

What plain `timestamp` does with the same input string — silently keeps the digits, drops the meaning:

```sql
SELECT '2026-08-26 09:00:00+05:30'::timestamp;
--      2026-08-26 09:00:00   ← offset discarded; "which moment?" is now unanswerable
```

And the varchar/text equivalence, since it surprises people:

```sql
CREATE TABLE t1 (a varchar(255));
CREATE TABLE t2 (a text);
-- Same storage engine behavior, same speed, same operators.
-- The 255 is only a write-time check on t1. Nothing more.
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What's the difference between varchar(n) and text in Postgres?**

Functionally almost nothing, and that's the answer interviewers want. Both store variable-length strings with the same performance characteristics and the same storage layout — the Postgres documentation itself states there's no performance difference among the character types. The only difference is that `varchar(n)` enforces a maximum length at write time by raising an error. So the choice is purely about whether you want to *enforce* a business limit, not about efficiency. Mention that `char(n)` is the real outlier because it blank-pads values, and you've separated yourself from candidates who memorized MySQL rules that don't apply here.

**Q: How would you store monetary amounts, and why not floating point?**

Two exact options: integer minor units (`total_cents bigint`) or `numeric(precision, scale)` like `numeric(12,2)`. Floating point can't be made exact for money because types like `double precision` are binary fractions, and common decimal amounts like 0.1 have no finite binary form — the same reason `0.1 + 0.2 !== 0.3` in JavaScript. Every arithmetic operation accumulates representation error, and once wrong totals are stored, no downstream rounding recovers them. Integer cents make every operation exact and fast; `numeric` makes them exact at slightly higher compute cost because digit arithmetic runs in software rather than native CPU operations. I pick based on how much aggregation the system does, but I never pick float.

**Q: What's the actual difference between timestamp and timestamptz?**

Neither stores a time zone — that's the trick in the question. Both are 8-byte microsecond values. `timestamptz` stores an absolute instant: input with any offset gets normalized to UTC on the way in, and output renders according to the session's `TimeZone` setting, so Tokyo and London clients see different wall clocks for the same stored truth. Plain `timestamp` stores whatever wall-clock digits you gave it and ignores any offset entirely — the connection between those digits and real time is lost forever. Because of that, I use `timestamptz` for anything representing an event in history and reserve bare `timestamp` for zone-less labels like "showtime at the venue." The classic production failure is writing `'2026-08-26 09:00:00'` into a timestamp column from servers in different zones — the data shifts by hours depending on which machine wrote it, and nothing in the table can reveal it.

**Q: When do you choose int versus bigint?**

`int` spans about ±2.1 billion; `bigint` spans about ±9.2 × 10¹⁸. I default anything that *grows* — primary keys, counters, event IDs — to `bigint`, because the storage difference is trivial while converting a hot 4-byte key column to 8 bytes later means rewriting indexes across the whole schema under load. Fixed-domain numbers that physically cannot grow, like percentages or country codes mapped to small integers, are fine as `int`. There are famous outages from this exact mistake, including YouTube's view counter overflowing its 32-bit counter in 2014.

**Q: When should data live in jsonb instead of typed columns?**

Only when the shape genuinely isn't known ahead of time — third-party webhook payloads, vendor-specific settings, audit snapshots of external systems. Typed columns give me write-time validation enforced against every writer, foreign keys, compact storage, planner statistics that keep query plans sane, and purpose-built operators. jsonb gives me flexibility and takes all of those away: no internal validation, no FK support, weak statistics on inner keys, and indexing only through GIN and expression indexes. If a field has a known shape and answers business questions, it's a column. If I'm just archiving something opaque for later human inspection, jsonb is perfect.

**Q: What are the trade-offs of enum types?**

Enums buy compact storage (4 bytes), validation at write time, and declaration-order sorting. They cost flexibility: adding a value needs `ALTER TYPE ... ADD VALUE`, removing one effectively requires recreating the type, and the set is database-level state that migrations must manage. For short, stable vocabularies — order statuses, payment methods — that's a great trade. If the value set changes often or users define their own categories, I use a lookup table with a foreign key instead, because rows are cheap to add and soft-delete.

**Q: Why does Postgres's type system beat storing everything as text or JSON?**

Because the type is where correctness and performance come from. Validation happens at the boundary regardless of which client writes. Comparisons, range scans, and sorts use operators defined per type, which is why a b-tree on a `timestamptz` column can serve "last 7 days" instantly. Storage stays compact — a boolean is 1 byte, a uuid is 16. And the query planner builds its row estimates from per-column statistics, which simply don't exist for keys buried inside JSON. A text-everything schema turns the database into a dumb file store: it will hold your data, but it stops being able to promise anything about it.

**Q: What does char(n) do that varchar doesn't?**

It blank-pads every value to exactly n characters before storing. That padding leaks into comparisons and concatenations in surprising ways, and it buys you nothing — `char(2)` for country codes saves no space compared to `text` and adds a footgun. I avoid it and enforce fixed formats with `CHECK` constraints instead.

## 6. The Traps — What Goes Wrong in Production

**Float for money.**
Wrong assumption: "a number column is a number column, and doubles have plenty of precision." Why it's wrong: `double precision` stores binary fractions, and decimal amounts like 19.99 have no exact binary form, so the stored value is always slightly off. What actually happens: individual rows look fine, but sums drift by fractions of a cent until finance reports a reconciliation gap nobody can trace, and fixing it requires back-migrating every historical amount. The fix: `bigint` cents or `numeric(12,2)`, chosen at table creation — this is one of those decisions you get exactly one chance to make cheaply.

**timestamp without time zone.**
Wrong assumption: "`timestamptz` stores the time zone, so plain `timestamp` is 'safer' or more neutral." Why it's wrong: neither stores a zone — `timestamptz` stores a UTC-normalized instant and renders per session, while plain `timestamp` stores bare wall-clock digits with no anchor at all. What actually happens: application servers in different time zones insert `now()`-style strings that mean different moments; a batch job running during a daylight-saving transition writes times that never existed; reports drift by hours and the bug reproduces only in some regions some of the year. The fix: `timestamptz` for every real-world event, explicit offsets in inserted strings, and a deliberate session `TimeZone` setting rather than whatever the server defaults to.

**varchar(255) cargo cult.**
Wrong assumption: "255 is a magic performance-tuned length." Why it's wrong: that folklore comes from old MySQL, where declared length affected row-size math and temp tables. In Postgres, `varchar(n)` is just `text` plus a write-time length check — 255 performs identically to 25 or none. What actually happens: harmless-looking schemas accumulate arbitrary limits, then legit data — long emails, composed names, international addresses — hits insert errors in production, and changing the limit becomes a migration ceremony for zero benefit. The fix: `text` everywhere by default; add a length constraint only when a real business rule exists, and prefer a droppable `CHECK` constraint so the rule change is instant.

**NULL treated as a normal value.**
Wrong assumption: "paid = false finds everything unpaid." Why it's wrong: comparisons against `NULL` return unknown, so unknown-paid rows fall out of both sides of an ordinary comparison. What actually happens: dashboards quietly undercount, and rows created before a flag existed vanish from every report. The fix: decide per column whether `NULL` is meaningful; if it isn't, declare `NOT NULL DEFAULT ...`, and if it is, handle it explicitly with `IS NULL`.

## 7. Compare With Related Concepts

| Concepts | One-line rule |
|---|---|
| `numeric` vs `double precision` | Money and exactness → `numeric`; measurements and coordinates → `double precision`. |
| `int` vs `bigint` | Can the value ever grow past 2.1 billion? → `bigint`, no second thought. |
| `varchar(n)` vs `text` | Identical speed in Postgres → `text` unless you're enforcing a real business limit. |
| `timestamptz` vs `timestamp` | A moment in history → `timestamptz`; a zone-less wall-clock label → `timestamp`. |
| `uuid` vs `bigserial` | Generated anywhere / exposed publicly → `uuid`; simple monotonic internal ID → identity columns ([serial](what-is-serial.md), [bigserial](what-is-bigserial.md)). |
| Columns vs `jsonb` | Known shape, queried and validated → columns; truly unpredictable payload → `jsonb`. |
| `enum` vs lookup table | Short stable vocabulary → `enum`; user-managed or fast-changing list → FK'd lookup table. |
| Postgres vs MySQL typing | Postgres treats `varchar` and `text` alike; MySQL historically didn't — don't port superstitions ([PostgreSQL vs MySQL](postgresql-vs-mysql.md)). |

## 8. 🧠 The Memory Hook

A data type is a promise made at the door: it decides what gets in, how much room it takes up, and what questions you'll be able to ask later. Keep every promise honest — exact money in cents or numeric, real moments in `timestamptz`, free-form extras in the `jsonb` sleeve — and never let a float touch your balance.
