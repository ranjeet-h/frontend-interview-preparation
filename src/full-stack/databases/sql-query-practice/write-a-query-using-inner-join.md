# Write a Query Using INNER JOIN

## 1. What the Interviewer Is Really Testing

This looks like a syntax question — do you know `INNER JOIN ... ON ...`? What the interviewer is actually testing is whether you understand that `INNER JOIN` keeps only matching rows and drops everything else, and whether you put the join condition in exactly the right place.

Anyone can write `FROM A JOIN B`. Strong candidates explain why a row disappeared. They know `ON` defines how two tables relate, `WHERE` filters the combined result, and `USING` is just shorthand when both tables share the exact same column name. They know the most common bug in this question is not syntax — it is joining on the wrong key, forgetting a condition and accidentally creating a cross product, or expecting unmatched rows to show up with NULLs. When the interviewer asks you to write an `INNER JOIN`, they are listening for whether you naturally think in matching versus non-matching rows.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice when I see "list customers with their completed orders and the products in them" is that the data lives in four places and I need to stitch it together without making extra trips to the database. My instinct might be to fetch customers, loop in code, fetch orders per customer, then fetch items per order — but that is N+1 queries, it hammers the database and it is slow even for a few hundred users.

So I think in sets. Each table is a set of rows. `INNER JOIN` gives me the overlap between two sets where a condition is true. If there is no match, that row is gone. That is the core decision here — do I want only customers who actually have completed orders and items, or do I want every customer even if they never ordered? The question says "using INNER JOIN", so the answer is only matches.

Next I map the relationships before writing SQL. Customers 1-to-many Orders on `Customers.id = Orders.customer_id`. Orders 1-to-many OrderItems on `Orders.id = OrderItems.order_id`. OrderItems many-to-1 Products on `OrderItems.product_id = Products.id`. The row level of the final result will be OrderItems — one row per line item — because that is the most granular child.

Now I pick the syntax. Explicit `INNER JOIN ... ON ...` keeps the relationship separate from the filter. `ON` says how tables connect. `WHERE` says which combined rows I keep, like `status = 'COMPLETED'`. If both tables happened to use the exact same column name, `USING(column)` is a shorter form that also merges the column into one, but most real schemas use `id` on one side and `customer_id` on the other, so `ON` is what you need. I also remind myself to add indexes on foreign keys if this were production — otherwise every join is a full scan.

The optimal shape is a single query chaining three inner joins from Customers through Orders and OrderItems to Products, filtering completed orders in the WHERE clause. That lets the optimizer pick hash or nested-loop joins and return exactly the matching rows in one round trip.

## 3. The Solution — Fully Explained Code

This example runs as-is in SQLite and works unchanged in PostgreSQL and MySQL. Paste it into `sqlite3 :memory:` to verify.

```sql
-- Setup: minimal schema you can run anywhere
CREATE TABLE Customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE Orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  order_date TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE Products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE OrderItems (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL
);

INSERT INTO Customers (id, name) VALUES
  (1, 'Alice'), (2, 'Bob'), (3, 'Charlie');

INSERT INTO Orders (id, customer_id, order_date, status) VALUES
  (101, 1, '2026-08-01', 'COMPLETED'),
  (102, 1, '2026-08-03', 'PENDING'),
  (103, 2, '2026-08-04', 'COMPLETED'),
  (104, 99, '2026-08-05', 'COMPLETED');

INSERT INTO Products (id, name) VALUES
  (201, 'Mechanical Keyboard'),
  (202, 'Wireless Mouse'),
  (203, 'Desk Mat');

INSERT INTO OrderItems (id, order_id, product_id, quantity, unit_price) VALUES
  (501, 101, 201, 2, 15.00),
  (502, 101, 202, 1, 45.00),
  (503, 103, 201, 3, 15.00),
  (504, 999, 202, 1, 45.00);

-- The query: only rows with a match on every join survive
SELECT
  c.id AS customer_id,
  c.name AS customer_name,
  o.id AS order_id,
  o.order_date,
  p.name AS product_name,
  oi.quantity,
  (oi.quantity * oi.unit_price) AS line_total
FROM Customers c
INNER JOIN Orders o ON c.id = o.customer_id        -- ON defines how customers relate to orders
INNER JOIN OrderItems oi ON o.id = oi.order_id     -- ON defines how orders relate to line items
INNER JOIN Products p ON oi.product_id = p.id      -- ON defines how line items relate to products
WHERE o.status = 'COMPLETED';                      -- WHERE filters the already-joined rows
```

Why each part is written this way:

- `INNER JOIN ... ON ...` keeps the join condition right next to the two tables it relates. That is easier to read than the old comma syntax `FROM Customers c, Orders o WHERE ...` where a missing condition silently becomes a cross product.
- `ON` versus `USING` (ON vs USING): `ON c.id = o.customer_id` is required here because the columns have different names. `USING` only works when both tables share the exact same column name, for example if both tables had `customer_id`, you could write `FROM Customers JOIN Orders USING (customer_id)` and the result would have a single merged `customer_id` column instead of two. When names differ, `ON` is the only correct choice.
- Table aliases `c`, `o`, `oi`, `p` prevent ambiguous column errors and keep `c.id` versus `o.id` clear. The `AS` renames like `c.id AS customer_id` avoid collisions when the result is turned into JSON in an API.
- The math `(quantity * unit_price) AS line_total` is done in the database so the application does not need a second loop to compute it.
- Join order does not change the result for `INNER JOIN` — `A JOIN B JOIN C` gives the same matching set as `C JOIN B JOIN A` — but the database optimizer may reorder joins internally based on table size and indexes. Write joins in the order that is clearest to a human, usually from parent toward child along the foreign key, and let `WHERE` do the filtering rather than hiding filters inside `ON`.

Time complexity: with indexes on the foreign keys (`Orders(customer_id)`, `OrderItems(order_id)`, `OrderItems(product_id)`), each join is an index lookup or hash probe, roughly O(M + N) for the matching rows. Without those indexes the engine scans whole tables, roughly O(M * N) and it gets painfully slow on large tables.

Space complexity: O(K) for the matching rows streamed to the client, plus a small hash or sort buffer the engine uses during the join.

For production, add the indexes the query actually uses:

```sql
CREATE INDEX idx_orders_customer_id ON Orders(customer_id);
CREATE INDEX idx_order_items_order_id ON OrderItems(order_id);
CREATE INDEX idx_order_items_product_id ON OrderItems(product_id);
CREATE INDEX idx_orders_status ON Orders(status);
```

## 4. Dry Run — Walk Through a Real Example

Use the data inserted above. Four tables, and we want only completed orders with real customers and real products.

Start with Customers and Orders joined on `c.id = o.customer_id`.

- Alice id 1 matches order 101 (COMPLETED) and order 102 (PENDING). Two partial rows so far.
- Bob id 2 matches order 103 (COMPLETED). One more partial row.
- Charlie id 3 has no orders at all. Because this is an `INNER JOIN`, Charlie is dropped right here. No match means no row.
- Order 104 has `customer_id = 99` which does not exist in Customers. That order is also dropped. Again, no match on the other side means the row disappears.

At this point we have (Alice,101), (Alice,102), (Bob,103). Now the `WHERE o.status = 'COMPLETED'` runs and removes (Alice,102) because it is PENDING. Left with (Alice,101) and (Bob,103).

Next join OrderItems on `o.id = oi.order_id`.

- Order 101 matches items 501 and 502. Alice's order fans out into two rows, one per line item.
- Order 103 matches item 503. Bob stays at one row.
- Item 504 has `order_id = 999` which matches no order. Dropped.

We now have three rows: (Alice,101, item 501), (Alice,101, item 502), (Bob,103, item 503).

Last join Products on `oi.product_id = p.id`.

- Item 501 product 201 finds Mechanical Keyboard. Keep.
- Item 502 product 202 finds Wireless Mouse. Keep.
- Item 503 product 201 finds Mechanical Keyboard again. Keep.
- Product 203 Desk Mat has no matching line item. Dropped, because `INNER JOIN` needs a match on both sides.

Final result from the `INNER JOIN`:

| customer_id | customer_name | order_id | order_date | product_name        | quantity | line_total |
|---|---|---|---|---|---:|---:|
| 1 | Alice | 101 | 2026-08-01 | Mechanical Keyboard | 2 | 30.00 |
| 1 | Alice | 101 | 2026-08-01 | Wireless Mouse      | 1 | 45.00 |
| 2 | Bob   | 103 | 2026-08-04 | Mechanical Keyboard | 3 | 45.00 |

Now see what changes if you switch just the first join to a `LEFT JOIN`:

```sql
SELECT c.name, o.id, o.status
FROM Customers c
LEFT JOIN Orders o ON c.id = o.customer_id;
```

- Alice still matches 101 and 102, so she appears twice with real order data.
- Bob matches 103, appears once.
- Charlie has no match, but `LEFT JOIN` keeps the left row. He appears once with `o.id = NULL` and `o.status = NULL`.
- Order 104 still disappears because the left side is Customers and there is no customer 99. A `RIGHT JOIN` would keep it, but `RIGHT JOIN` is rare in practice — people swap table order and use `LEFT JOIN` instead.

The difference is the whole point of the interview test. `INNER JOIN` means "only where both sides match." `LEFT JOIN` means "keep every row from the left, fill NULLs when the right is missing." If you need a report that includes customers who never ordered, you must not use `INNER JOIN`.

## 5. Edge Cases — The Ones That Break Naive Solutions

**No matches returns empty — not a row of NULLs.** If a customer has no completed orders, or an order has no line items, an `INNER JOIN` returns zero rows for that parent. This surprises people who expect a placeholder row. If your API returns `{ orders: [] }` for one customer and you wrote an inner join expecting one row per customer, you will get an empty result set instead of a customer with empty orders. Use `LEFT JOIN` when you need parents without children; keep `INNER JOIN` when you intentionally want to exclude them.

**Duplicate keys fan-out — fan out and corrupt aggregates.** One order with three line items produces three joined rows for that one order. This duplicate-key fan-out is the classic reason aggregates get multiplied. If you then write `SUM(o.shipping_fee)` over the joined result, you sum the same shipping fee three times. The fix is to aggregate at the right grain before joining, for example summing line totals per order in a CTE and then joining that single-row-per-order result to Orders.

```sql
WITH ItemTotals AS (
  SELECT order_id, SUM(quantity * unit_price) AS items_total
  FROM OrderItems GROUP BY order_id
)
SELECT o.id, o.shipping_fee + t.items_total AS grand_total
FROM Orders o
INNER JOIN ItemTotals t ON o.id = t.order_id;
```

**NULL never matches, not even NULL to NULL.** In SQL, `NULL = NULL` is not true, it is unknown. So a row where `Orders.customer_id IS NULL` will never match any Customers row, even if Customers also has a `NULL` id, which it should not. An `INNER JOIN` silently drops those rows. If your data allows guest checkouts stored as `customer_id = NULL`, those orders vanish from an inner-joined report. Fix it by cleaning the data to use a real guest customer id, or by using `LEFT JOIN` and handling NULLs in application logic, not by writing `ON c.id = o.customer_id OR (c.id IS NULL AND o.customer_id IS NULL)` which is almost never what you want and kills index usage.

## 6. Variations and Follow-ups

**Multiple inner joins in a chain — the common production shape.** The example above already chains three inner joins: Customers to Orders to OrderItems to Products. The interviewer often extends it: "Now also show the shipping address from an Addresses table." You add one more `INNER JOIN Addresses a ON o.address_id = a.id`. Each additional `INNER JOIN` further narrows the result — a row must match every link to survive. If any link is optional, change that one link to `LEFT JOIN` while keeping the others as `INNER JOIN`. The shape stays the same, you just choose per-link whether non-matches should be kept.

**Self-join — joining a table to itself.** "Given an Employees table with `manager_id` pointing to `id` in the same table, list each employee with their manager's name." You alias the same table twice:

```sql
CREATE TABLE Employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id INTEGER
);

INSERT INTO Employees VALUES (1, 'Ava', NULL), (2, 'Ben', 1), (3, 'Cara', 1);

SELECT e.name AS employee, m.name AS manager
FROM Employees e
INNER JOIN Employees m ON e.manager_id = m.id;
```

This returns Ben -> Ava and Cara -> Ava. Ava the CEO has `manager_id = NULL`, so she has no matching manager row and `INNER JOIN` drops her. The follow-up is predictable: "Include the CEO with a NULL manager." The answer is to change that one join to `LEFT JOIN Employees m ON e.manager_id = m.id` so the left rows are kept.

**Follow-up: ON versus USING (ON vs USING) in an interview.** The interviewer might ask you to rewrite the same query with `USING`. You answer that you can only use `USING` when the column name is identical in both tables. A table design like `Customers(customer_id)` and `Orders(customer_id)` allows `FROM Customers JOIN Orders USING (customer_id)`. The real schema in this page uses `Customers.id` and `Orders.customer_id`, different names, so `USING` is not applicable and `ON c.id = o.customer_id` is correct. You also mention that `USING` merges the column into one in the result, while `ON` keeps both columns available.

## 7. 🧠 The Memory Hook

`INNER JOIN` is an AND — keep only the rows where both sides show up. No match means no row, NULL never matches, and one parent with three children becomes three rows.
