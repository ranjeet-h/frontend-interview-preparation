# Write a Query to Aggregate JSON Data in SQL

## 1. What the Interviewer Is Really Testing

Your frontend needs an endpoint that returns each user with a nested list of their orders, something like `{ id, name, orders: [{order_id, amount}, ...] }`. You could join users to orders, ship every duplicate user column over the wire, and group them in Node with a loop. That works for ten rows and falls apart at scale. The interviewer asks you to do it in SQL because they want to see if you know how modern databases package relational rows into JSON right where the data lives.

This is not a plain GROUP BY question. Anyone can write `GROUP BY user_id` and `SUM(amount)`. The skill here is JSON aggregation, which means constructing arrays and objects inside the database. There are two directions and you have to know which one the question is asking for. One direction is packaging rows up into JSON for an API, turning many child rows into one nested array per parent. The other direction is the reverse, tearing open a JSON column that already holds an array and flattening it back into rows so you can SUM or GROUP BY it. Interviewers also listen for dialect honesty. PostgreSQL spells it `jsonb_agg` and `jsonb_build_object` with `->` and `->>` operators, MySQL spells it `JSON_ARRAYAGG` and `JSON_OBJECT` with `JSON_TABLE`, and the null handling and empty array behavior is not the same. If you mix them up or forget the empty-array guard on a LEFT JOIN, the query looks right and ships broken JSON to the frontend.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice when I hear aggregate JSON is I have to figure out which direction the data needs to flow. Am I starting with normal tables and building JSON to send out, or am I starting with JSON already stored in a column and need to pull it apart to calculate something.

If it is building JSON from tables, my brute force instinct is the thing most juniors actually do in production. Join users to orders, get back flat rows where Alice appears twice, Bob once, Charlie once with all order columns null, send that over the network, then write a reduce in JavaScript that groups orders under each user. It feels simple but it wastes bandwidth because you repeat the user name and email on every row, it burns memory in the app server, and it is exactly the N plus one style problem people try to avoid. So I ask why not let the database do the grouping. The database already has the grouping engine. If it can return one row per user where the orders are already a JSON array, the app just forwards the JSON.

That insight points me to the right pattern. For packaging, I need an aggregate that collects many rows into one JSON array and a constructor that turns column values into a JSON object per row. In Postgres that is `jsonb_agg` wrapped around `jsonb_build_object`. In MySQL that is `JSON_ARRAYAGG` wrapped around `JSON_OBJECT`. The trick I have to remember is the LEFT JOIN with no orders. Without a guard, aggregating zero matches gives me a null array or worse an array with a single null object, which breaks the frontend loop. I will need a FILTER or a CASE that turns that into a clean empty array.

If the problem is the opposite direction, where the table has an `events` row with a `payload` column holding `{"items": [{"sku": "A", "qty": 2, "price": 10}, ...]}`, my brute force idea is to SELECT the payload, JSON.parse it in Node, and sum in memory. That dies when there are millions of events. The better move is to unnest inside the engine so the database sees a virtual table of items and I can run normal SUM and GROUP BY. In Postgres that means `CROSS JOIN LATERAL jsonb_to_recordset(payload->'items')` with typed columns, in MySQL that means `JSON_TABLE(payload, '$.items[*]' COLUMNS(...))`. And I have to be precise with operators. Arrow `->` keeps the value as JSON with quotes, double arrow `->>` gives me plain text I can compare or cast to numeric. If I SUM a `->` result without casting, I am summing JSON documents, not numbers.

So before I type, I decide the direction, pick the matching pair of functions for the dialect I am in, and plan the empty array and casting guards.

## 3. The Solution — Fully Explained Code

The classic interview version gives you two tables, `users(id, name, email)` and `orders(id, user_id, total_amount, status, created_at)`, and asks for one JSON object per user that includes an orders array and a total spent. One row per user, nested JSON ready to return from an API, with users who have no orders still returning an empty array.

Here is the complete solution in PostgreSQL. Every non-obvious line has a why comment, and the query runs as written.

```sql
-- PostgreSQL: build one nested JSON object per user
SELECT
    u.id AS user_id,
    jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'email', u.email,
        -- jsonb_agg collects many order objects into one array.
        -- FILTER drops the single null row that a LEFT JOIN creates for users with no orders.
        -- COALESCE turns the resulting NULL for those users into a clean empty JSON array.
        'orders', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'order_id', o.id,
                    'amount', o.total_amount,
                    'status', o.status,
                    'created_at', o.created_at
                )
            ) FILTER (WHERE o.id IS NOT NULL),
            '[]'::jsonb
        ),
        -- SUM sees NULL when there are no orders, so we default to 0 for a clean numeric field
        'total_spent', COALESCE(SUM(o.total_amount), 0)
    ) AS user_profile_json
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name, u.email;
```

The same logic in MySQL 8.0 uses different names but the shape is identical. We have to guard the empty case a little differently because MySQL does not have FILTER on aggregates.

```sql
-- MySQL 8.0+: same result, MySQL dialect
SELECT
    u.id AS user_id,
    JSON_OBJECT(
        'id', u.id,
        'name', u.name,
        'email', u.email,
        -- When no orders matched, COUNT is 0 so we return an explicit empty array.
        -- Otherwise JSON_ARRAYAGG collects the per-row JSON_OBJECTs into one array.
        'orders', CASE
            WHEN COUNT(o.id) = 0 THEN JSON_ARRAY()
            ELSE JSON_ARRAYAGG(
                JSON_OBJECT(
                    'order_id', o.id,
                    'amount', o.total_amount,
                    'status', o.status,
                    'created_at', o.created_at
                )
            )
        END,
        'total_spent', COALESCE(SUM(o.total_amount), 0)
    ) AS user_profile_json
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name, u.email;
```

Why these choices and not something else. `jsonb_build_object` and `JSON_OBJECT` exist specifically to turn column values into a typed JSON object, so we do not build JSON by string concatenation which is unsafe and slow. The aggregate in the middle is the only way to collapse many child rows into one parent row without round-tripping to the app. The LEFT JOIN is intentional because we must keep users with zero orders. The empty array guard is not optional, it is the difference between `[]` and `[null]` or `[ {"order_id": null} ]` which crashes a frontend map.

Time and space in plain terms. Time is dominated by the join plus the group. If there are U users and O total orders, the engine touches roughly U plus O rows, hashes or sorts by user, and builds one JSON array per user, so think O(U plus O) with the group cost on top. Space is the working memory for that grouping, Postgres `work_mem` or MySQL `sort_buffer`, holding one array per group before streaming the cursor. And a quick indexing note that interviewers love to ask about. If you later filter on a field inside a JSON column, do not scan every payload. In Postgres create `USING GIN (payload)` for containment or an expression index like `((payload->>'session_id'))` for equality. In MySQL add a stored generated column `session_id VARCHAR(64) GENERATED ALWAYS AS (payload->>'$.session_id') STORED` and put a normal B-tree on it.

## 4. Dry Run — Walk Through a Real Example

Take three users and three orders where Charlie has no orders at all. This is the exact edge that breaks naive queries, so we trace it fully.

Users holds Alice id 1, Bob id 2, Charlie id 3. Orders holds 101 for Alice amount 120 completed, 102 for Alice amount 45.50 completed, 103 for Bob amount 300 pending. No row points to Charlie.

Step one is the LEFT JOIN before any aggregation. The engine pairs each user with matching orders. Alice appears twice, once with order 101 columns and once with 102 columns. Bob appears once with 103 columns. Charlie appears once with every order column null. So four intermediate rows flow into the next stage.

Step two packages each non-null order row into a small JSON object. Row for 101 becomes `{"order_id": 101, "amount": 120, "status": "completed"}`. Row for 102 becomes `{"order_id": 102, "amount": 45.50, "status": "completed"}`. Row for 103 becomes `{"order_id": 103, "amount": 300, "status": "pending"}`. The fourth row where Charlie had all nulls would build `{"order_id": null, ...}` but the FILTER clause sees `o.id IS NULL` and excludes that object from aggregation entirely.

Step three groups by user and aggregates. For Alice the two objects collect into `[{"order_id":101,...}, {"order_id":102,...}]` and SUM gives 165.50. For Bob the single object collects into `[{"order_id":103,...}]` and SUM gives 300. For Charlie there were zero objects after the filter, so `jsonb_agg` is null and COALESCE replaces it with `[]`, and SUM is null replaced with 0.

Step four assembles the outer object. Alice comes back as `{"id":1,"name":"Alice","email":"alice@example.com","orders":[...two items...],"total_spent":165.50}`. Bob comes back with one item and 300. Charlie comes back clean as `{"id":3,"name":"Charlie","email":"charlie@example.com","orders":[],"total_spent":0}`, which is exactly what a frontend expects to map over without an extra null check.

If you run the MySQL version the walk is the same. The only difference is the empty check happens via `COUNT(o.id) = 0` choosing between `JSON_ARRAY()` and `JSON_ARRAYAGG`.

## 5. Edge Cases — The Ones That Break Naive Solutions

The empty array trap is the first one every interviewer watches for. If you write `jsonb_agg(jsonb_build_object('order_id', o.id))` with no filter on a LEFT JOIN, Charlie does not disappear. The join still produces one row for him with all order fields null, building one object `{"order_id": null}` and wrapping it into `[{"order_id": null}]`. Your app loops once, tries to render an order that does not exist, and crashes. The fix is the FILTER in Postgres or the COUNT check in MySQL and coalescing to `[]`.

The arrow confusion traps people second. Single arrow `->` returns a JSON value that still has quotes around strings. Double arrow `->>` returns plain SQL text without quotes. So `payload->'status' = 'completed'` compares a JSON document `"completed"` including the quotes to a SQL string and is always false. You need `payload->>'status' = 'completed'`. And for math you must cast, something like `SUM((payload->>'price')::numeric)` in Postgres or casting the extracted column in MySQL, otherwise you are trying to sum JSON documents and the engine throws or silently does string logic.

SQL null versus JSON null is a subtler third trap. A column holding `{"discount": null}` does not have a SQL null. `payload->'discount'` is the JSON value null, which is not SQL null, so `payload->'discount' IS NULL` is false. If you want to know if the key is missing or explicitly null, check the text extraction `payload->>'discount' IS NULL` which coerces JSON null to SQL null, or use `jsonb_typeof(payload->'discount') = 'null'` in Postgres.

Floating point precision is the fourth trap. JSON numbers come in without a type. If you extract a price and let the database treat it as double, cents can drift by tiny fractions when you SUM a lot of rows. Always cast extracted money to a fixed type like `NUMERIC(10,2)` in Postgres or `DECIMAL(10,2)` in MySQL, which is what the `jsonb_to_recordset` and `JSON_TABLE` examples do by declaring typed columns upfront.

A final small trap is ordering. `jsonb_agg` without an ORDER BY inside gives you orders in whatever order the group happened to see them. If the API contract cares about newest first, write `jsonb_agg(... ORDER BY o.created_at DESC)` in Postgres or `JSON_ARRAYAGG(... ORDER BY o.created_at DESC)` where your MySQL version supports it, otherwise order the rows before aggregation.

## 6. Variations and Follow-ups

What if the data starts trapped inside a JSON column and you need to calculate from it instead of building it. That is the shredding direction. Suppose `events(payload jsonb, event_type text)` holds `{"items": [{"sku":"LAPTOP-01","qty":1,"price":1200},{"sku":"MOUSE-05","qty":2,"price":25}]}` and you need total units and revenue per sku. You cannot GROUP BY inside JSON. You turn the array into rows first. In Postgres you would cross join a lateral unnest with `jsonb_to_recordset(e.payload->'items') AS item(sku varchar, qty int, price numeric)` then GROUP BY item.sku and SUM. In MySQL you would comma join `JSON_TABLE(e.payload, '$.items[*]' COLUMNS(sku varchar PATH '$.sku', qty int PATH '$.qty', price decimal PATH '$.price')) AS jt` then GROUP BY jt.sku. The approach change is from constructing with agg to unnesting into a virtual table so normal relational aggregates work, and the complexity becomes proportional to events times average items per event rather than users plus orders.

What if the interviewer pivots rows into a dynamic dictionary. You have `user_preferences(user_id, pref_key, pref_value)` and need `{"theme":"dark","notifications":"enabled"}` per user. You switch from array aggregation to object aggregation. In Postgres that is `jsonb_object_agg(pref_key, pref_value)` grouped by user_id, in MySQL that is `JSON_OBJECTAGG(pref_key, pref_value)`. Same grouping idea, different aggregate because the output shape is an object not an array.

What if the payload is deeply nested like `{"customer":{"address":{"geo":{"lat":37.77}}}}`. You do not chain text extractions by hand forever. Postgres gives you the path operator `#>>` so `payload #>> '{customer,address,geo,lat}'` returns the scalar directly. MySQL gives you a JSON path `payload->>'$.customer.address.geo.lat'`. The mental move is the same, pick the dialect path syntax and remember double arrow for text.

What if the interviewer asks when you should stop using JSON in the database at all. Keep data in JSON when it is schemaless and you always fetch it together, like custom user fields or a stored webhook payload you audit. Normalize it into real tables when you need foreign keys, when you update one field often and do not want to rewrite the whole document, or when you constantly join or index on that field with composite indexes. That answer shows you know JSON in SQL is a tool with a cost, not a default.

## 7. 🧠 The Memory Hook

Double arrow pulls out plain text, BUILD plus AGG packs rows up into nested JSON, TABLE or LATERAL shreds JSON back down into rows. If the interviewer wants JSON out, you build and aggregate. If the JSON already holds the data, you unnest then aggregate like normal SQL. And on a LEFT JOIN, always guard the empty group or you ship `[null]` to the frontend.
