# Write a Query Using `GROUP BY` in SQL: Bucketing, Aggregation Pipeline, and `ONLY_FULL_GROUP_BY`

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to write an aggregation query using `GROUP BY`, they are rarely just checking whether you know the keyword syntax. They are evaluating four core database fundamentals:

1. **The SQL Logical Execution Pipeline:** Do you understand that SQL engines do not process queries in the lexical order you write them? While `SELECT` appears first in your editor, the engine evaluates `FROM` and `JOIN` first, applies row filters in `WHERE`, collapses rows into aggregate buckets in `GROUP BY`, filters aggregated groups in `HAVING`, and only then evaluates the expressions and aliases in `SELECT`, followed by `DISTINCT`, `ORDER BY`, and `LIMIT`.
2. **Relational Grain and the Determinism Invariant:** In an aggregated query, every column projected in the `SELECT` list must have a single deterministic value per bucket. If a column is neither in the `GROUP BY` clause nor wrapped in an aggregate function (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`), the database cannot know which row's value to return. Modern engines enforce this through the SQL standard and MySQL's `ONLY_FULL_GROUP_BY` mode (`Error 1055: Expression #N of SELECT list is not in GROUP BY clause and contains nonaggregated column`).
3. **Multi-Dimensional Grouping and Hierarchies:** Can you group by compound dimensions (such as `country` and `product_category`) and generate hierarchical subtotals and grand totals in a single pass using extensions like `WITH ROLLUP` or `GROUPING SETS` without writing repetitive `UNION ALL` statements?
4. **Physical Execution Mechanics and Indexing:** Do you understand what the engine has to do under the hood to group rows? Can you explain how an unindexed query forces a costly full-table scan and temporary hash table or filesort (`Using temporary; Using filesort`), whereas a well-designed composite B-Tree index allows a streaming index scan with $O(1)$ auxiliary memory?

---

## 2. Think Before You Code — The Senior Dev Thought Process

Let us look at a standard production scenario. We have a `Sales` table tracking e-commerce orders across different regions:

```sql
CREATE TABLE Sales (
    order_id    BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    country     VARCHAR(50) NOT NULL,
    category    VARCHAR(50) NOT NULL,
    amount      DECIMAL(10, 2) NOT NULL,
    order_date  DATETIME NOT NULL
);
```

**The Business Requirement:** Generate a regional performance report that outputs the total order volume (`order_count`), total gross revenue (`total_revenue`), and average order value (`avg_order_value`) broken down by `country` and `category`. Furthermore, management wants subtotal rows for each country and a grand total row across the entire dataset.

Here is the exact thought process of a senior database engineer tackling this problem:

### 1. Identify the Grain Transformation
The raw table is at the grain of **one row per individual order**. The target output must be at the grain of **one row per unique `(country, category)` pair**, plus hierarchical subtotal rows. Every row in the raw table must fall into exactly one base bucket.

### 2. Reject Naive Application-Layer and Multi-Query Approaches
- **Naive Trap 1: Grouping in application code.** Fetching millions of raw sales records over the network to Node.js or Python to run `.reduce()` saturates network bandwidth and causes high garbage collection pauses. Aggregation belongs inside the database engine, right next to the storage pages.
- **Naive Trap 2: Multiple queries with `UNION ALL`.** Writing one query for `(country, category)`, a second query for `country` subtotals, and a third query for the grand total, then stitching them together with `UNION ALL`, forces the database to scan the table three separate times.
- **The Senior Solution:** Use `GROUP BY country, category WITH ROLLUP`. This instructs the engine to compute base buckets, dimension subtotals, and the grand total in a single physical pass over the data.

### 3. Handle Aggregation Functions and Nullability
- **Volume:** We use `COUNT(order_id)` or `COUNT(*)`. `COUNT(*)` counts all rows in the bucket; `COUNT(order_id)` counts non-null primary keys. Both produce the identical row count here because `order_id` is a non-nullable primary key.
- **Revenue:** `SUM(amount)`.
- **Average Basket Size:** `AVG(amount)`. We use `ROUND(AVG(amount), 2)` to match monetary reporting precision.

### 4. Format Subtotal Labels Using `GROUPING()`
When `WITH ROLLUP` calculates a subtotal for a dimension, the engine puts a `NULL` in the collapsed column. For example, a country-level subtotal row has `country = 'US'` and `category = NULL`. The grand total row has `country = NULL` and `category = NULL`. 
Instead of returning ambiguous raw `NULL`s to API clients, we use the standard `GROUPING()` function or `COALESCE()` to replace rollup `NULL`s with descriptive labels like `'All Categories'` and `'Global Total'`.

### 5. Plan the Indexing Strategy
If the table has 10 million rows, running `GROUP BY country, category` without an index causes the engine to allocate an in-memory hash table (or spill to a temporary on-disk table) to accumulate running aggregates. 
By creating a composite covering index on `(country, category, amount)`, the database traverses pre-sorted index leaf pages. Because the rows arrive already sorted by `country` and `category`, the engine simply streams rows, accumulates totals, flushes each group result as soon as the key changes, and discards running state.

---

## 3. The Solution — Fully Explained Code

### Solution 1: Standard Multi-Column Grouping

This query computes the core aggregated metrics per `country` and `category`.

```sql
SELECT 
    country,
    category,
    COUNT(order_id)         AS order_count,
    SUM(amount)             AS total_revenue,
    ROUND(AVG(amount), 2)   AS avg_order_value
FROM Sales
GROUP BY 
    country,
    category
ORDER BY 
    country ASC,
    total_revenue DESC;
```

### Solution 2: Hierarchical Reporting with Subtotals & Grand Total (`WITH ROLLUP`)

This production-grade query generates the base category aggregates, country-level subtotals, and the final grand total in one scan, using `GROUPING()` to differentiate rollup `NULL` markers from actual data `NULL`s.

```sql
SELECT 
    -- If GROUPING(country) is 1, this is the grand total row
    -- If GROUPING(category) is 1, this is a country subtotal row
    CASE 
        WHEN GROUPING(country) = 1 THEN 'Global Total'
        ELSE country 
    END AS country,
    CASE 
        WHEN GROUPING(category) = 1 AND GROUPING(country) = 0 THEN 'All Categories (Subtotal)'
        WHEN GROUPING(category) = 1 AND GROUPING(country) = 1 THEN 'All Categories'
        ELSE category 
    END AS category,
    COUNT(order_id)         AS order_count,
    SUM(amount)             AS total_revenue,
    ROUND(AVG(amount), 2)   AS avg_order_value
FROM Sales
GROUP BY 
    country, 
    category WITH ROLLUP;
```

### Solution 3: Index Optimization (Covering Composite Index)

To execute this aggregation without temporary disk tables or filesorts, create a composite B-Tree index covering the grouping dimensions and aggregated payload:

```sql
-- MySQL / PostgreSQL / SQL Server
CREATE INDEX idx_sales_country_category_amount 
ON Sales (country, category, amount);
```

### Complexity and Performance Analysis

- **Time Complexity:**
  - **Without Index:** $O(N \log N)$ when using sort-based aggregation, or $O(N)$ with hash-based aggregation (where $N$ is the number of rows scanned in the table). Hash aggregation incurs high memory allocation and CPU overhead for hash collisions.
  - **With Composite Index `(country, category, amount)`:** $O(N)$ tight index scan. The engine reads pre-sorted index pages in sequential order without touching table heap pages (Index-Only / Covering Scan), eliminating all sorting overhead ($O(1)$ sort time).
- **Space Complexity:**
  - **Without Index:** $O(U)$ auxiliary memory, where $U$ is the number of unique `(country, category)` combinations that must be maintained simultaneously in the temporary aggregation hash table before emitting results.
  - **With Composite Index:** $O(1)$ auxiliary memory. The engine accumulates running totals for the current group and flushes the record the moment it encounters a different `(country, category)` key in the sorted stream.

---

## 4. Dry Run — Walk Through a Real Example

Let us trace how the engine processes a sample dataset step by step.

### Input Table: `Sales`

| order_id | customer_id | country | category | amount | order_date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `101` | `1` | `'US'` | `'Electronics'` | `300.00` | `2026-01-01` |
| `102` | `2` | `'US'` | `'Electronics'` | `700.00` | `2026-01-02` |
| `103` | `3` | `'US'` | `'Apparel'` | `150.00` | `2026-01-03` |
| `104` | `4` | `'DE'` | `'Electronics'` | `400.00` | `2026-01-04` |
| `105` | `5` | `'DE'` | `'Apparel'` | `200.00` | `2026-01-05` |
| `106` | `6` | `'DE'` | `'Apparel'` | `100.00` | `2026-01-06` |

---

### Step 1: Logical Pipeline Execution

1. **`FROM Sales`:** The storage layer feeds the 6 records into the execution pipeline.
2. **`GROUP BY country, category WITH ROLLUP`:** The engine partitions incoming rows into accumulator states based on the grouping keys.

```txt
Raw Rows Stream
  │
  ├── ('DE', 'Apparel')     ──► [Orders: 105, 106] ──► count=2, sum=300.00,  avg=150.00
  ├── ('DE', 'Electronics') ──► [Orders: 104]      ──► count=1, sum=400.00,  avg=400.00
  ├── ('US', 'Apparel')     ──► [Orders: 103]      ──► count=1, sum=150.00,  avg=150.00
  └── ('US', 'Electronics') ──► [Orders: 101, 102] ──► count=2, sum=1000.00, avg=500.00
```

---

### Step 2: Rollup Accumulation Pass

`WITH ROLLUP` computes the parent-level subtotal aggregates from the accumulated leaf buckets:

- **Country Subtotal for `'DE'`:** Combines `('DE', 'Apparel')` + `('DE', 'Electronics')` $\rightarrow$ count = $3$, sum = $700.00$, avg = $233.33$.
- **Country Subtotal for `'US'`:** Combines `('US', 'Apparel')` + `('US', 'Electronics')` $\rightarrow$ count = $3$, sum = $1150.00$, avg = $383.33$.
- **Global Grand Total:** Combines all records $\rightarrow$ count = $6$, sum = $1850.00$, avg = $308.33$.

---

### Step 3: Final Projection (`SELECT`)

The `CASE` and `GROUPING()` functions convert raw rollup markers into clean labels:

| country | category | order_count | total_revenue | avg_order_value |
| :--- | :--- | :--- | :--- | :--- |
| `'DE'` | `'Apparel'` | `2` | `300.00` | `150.00` |
| `'DE'` | `'Electronics'` | `1` | `400.00` | `400.00` |
| `'DE'` | `'All Categories (Subtotal)'` | `3` | `700.00` | `233.33` |
| `'US'` | `'Apparel'` | `1` | `150.00` | `150.00` |
| `'US'` | `'Electronics'` | `2` | `1000.00` | `500.00` |
| `'US'` | `'All Categories (Subtotal)'` | `3` | `1150.00` | `383.33` |
| `'Global Total'` | `'All Categories'` | `6` | `1850.00` | `308.33` |

---

## 5. Edge Cases — The Ones That Break Naive Solutions

### 1. `NULL` Values in the Grouping Column
- **The Behavior:** In SQL, `NULL` is not equal to `NULL` (`NULL = NULL` is `UNKNOWN`). However, for the purpose of `GROUP BY`, SQL standards dictate that all `NULL` values are grouped together into a **single aggregate bucket**.
- **The Trap:** If 5,000 customers have `country = NULL`, they will not be omitted; they will form a single output row with `country IS NULL`. If your frontend expects valid string identifiers, this will break deserialization.
- **The Fix:** Explicitly filter in `WHERE country IS NOT NULL` before grouping, or use `COALESCE(country, 'Unknown')` in the grouping key.

### 2. `COUNT(*)` vs `COUNT(column_name)` with Nullable Fields
- **The Behavior:** `COUNT(*)` counts total rows in the bucket, regardless of whether individual columns contain `NULL`. `COUNT(column_name)` counts only rows where `column_name` is non-null.
- **The Trap:** If a table has a nullable `discount_code` column, `COUNT(discount_code)` returns the number of discounted orders, whereas `COUNT(*)` returns total orders. Using `COUNT(discount_code)` when you meant total order volume returns understated numbers.

### 3. The `ONLY_FULL_GROUP_BY` Violation (Error 1055)
- **The Bug:** Writing a query like:
  ```sql
  -- FAILS in modern MySQL / PostgreSQL / Oracle
  SELECT country, category, customer_id, SUM(amount)
  FROM Sales
  GROUP BY country, category;
  ```
- **Why It Fails:** For the group `('US', 'Electronics')`, there are two rows with customer IDs `1` and `2`. The database has no mathematical rule to pick one over the other. 
- **The Fix:** If you need non-grouping attributes, either:
  1. Add the column to `GROUP BY` (if it defines the grain).
  2. Aggregate it explicitly (e.g. `GROUP_CONCAT(customer_id)`, `ARRAY_AGG(customer_id)`, `MIN(customer_id)`, or `ANY_VALUE(customer_id)`).
  3. Use window functions if you need individual row details preserved alongside group sums.

### 4. Filtering Aggregates in `WHERE` Instead of `HAVING`
- **The Bug:** Writing `WHERE SUM(amount) > 500`.
- **Why It Fails:** `WHERE` executes in Step 2 of the pipeline—before rows have been sorted into buckets. At Step 2, `SUM(amount)` does not exist yet. The database throws `Error 1111: Invalid use of group function`.
- **The Rule:**
  - Use `WHERE` to filter individual rows **before** grouping (reduces memory consumption).
  - Use `HAVING` to filter aggregated groups **after** aggregation.

```sql
-- Optimal: Filter rows first, then filter aggregate groups
SELECT country, SUM(amount) AS total_revenue
FROM Sales
WHERE order_date >= '2026-01-01'      -- WHERE filters raw rows before grouping
GROUP BY country
HAVING SUM(amount) >= 10000.00;       -- HAVING filters aggregated buckets
```

### 5. Aggregating Over Empty Result Sets
- **The Behavior:** 
  - An aggregate query **without** `GROUP BY` (`SELECT COUNT(*) FROM Sales WHERE 1=0;`) returns **1 row** containing `0`.
  - An aggregate query **with** `GROUP BY` (`SELECT country, COUNT(*) FROM Sales WHERE 1=0 GROUP BY country;`) returns **0 rows** (an empty result set).
- **The Trap:** Full-stack developers frequently assume a grouped query will return default zeroes for missing categories, causing frontend crashes when accessing `data[0].total_revenue`.

---

## 6. Variations and Follow-ups

### Variation 1: Preserving Row Detail — Window Functions vs `GROUP BY`
**Interviewer Follow-up:** *"What if we need to show every individual order with its transaction ID, but append the country's total revenue next to each row?"*

`GROUP BY` collapses $N$ rows into $K$ rows ($K \le N$). When you need to preserve all $N$ original rows while attaching group-level calculations, use `OVER (PARTITION BY ...)`:

```sql
SELECT 
    order_id,
    customer_id,
    country,
    category,
    amount,
    -- Window aggregation keeps all 6 rows intact
    SUM(amount) OVER (PARTITION BY country, category) AS category_revenue,
    SUM(amount) OVER (PARTITION BY country)           AS country_revenue
FROM Sales;
```

### Variation 2: Conditional Aggregation (Pivoting Without Extra Scans)
**Interviewer Follow-up:** *"How can you transform categories into separate columns (e.g. `electronics_rev`, `apparel_rev`) for each country in a single query?"*

Instead of multiple subqueries or joins, combine `SUM()` with `CASE WHEN` (or PostgreSQL's `FILTER` clause):

```sql
-- Standard SQL conditional aggregation
SELECT 
    country,
    SUM(CASE WHEN category = 'Electronics' THEN amount ELSE 0 END) AS electronics_revenue,
    SUM(CASE WHEN category = 'Apparel'     THEN amount ELSE 0 END) AS apparel_revenue,
    SUM(amount)                                                    AS total_revenue
FROM Sales
GROUP BY country;
```

### Variation 3: Declarative Multi-Level Grouping with `GROUPING SETS`
**Interviewer Follow-up:** *"What if we want category totals and country totals, but we do NOT want the grand total or intermediate cross-products?"*

In PostgreSQL, Oracle, and SQL Server, use `GROUPING SETS` to explicitly declare the exact combination of dimensions to compute:

```sql
-- PostgreSQL / SQL Server / Oracle
SELECT 
    country,
    category,
    SUM(amount) AS total_revenue
FROM Sales
GROUP BY GROUPING SETS (
    (country, category), -- Level 1: Country + Category
    (country),           -- Level 2: Country Subtotal
    ()                   -- Level 3: Grand Total (optional)
);
```

---

## 7. 🧠 The Memory Hook

Think of the SQL execution pipeline as a **recycling sorting facility**:

```txt
[ Raw Pile ] ──► [ WHERE ] ──► [ GROUP BY ] ──► [ HAVING ] ──► [ SELECT ]
  (All Rows)     (Shred Junk)    (Sort into      (Discard       (Label &
                                  Color Bins)    Light Bins)     Display)
```

> **The Golden Bucket Rule:**  
> If an item is stamped as the **label on the bin** (`GROUP BY`), you can read it directly.  
> If an item is **inside the bin**, you cannot grab a single one—you must **melt it down** into a single number (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`). Anything else violates `ONLY_FULL_GROUP_BY`.

