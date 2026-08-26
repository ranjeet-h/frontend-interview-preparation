# What Are Database Views

## 1. The Real-World Problem — When You Actually Hit This

Your team has an orders feature that's been running quietly for a year. To answer "show me this customer's active orders," somebody wrote a five-table join — orders joined to customers, shipping addresses, payments, and shipments. It worked. So they copy-pasted it. Into the customer dashboard service. Into the nightly CSV export job. Into the finance reconciliation script. Three copies, three files, nobody owns any of them.

Then one day finance calls: "Our monthly revenue number is off by 400K compared to the dashboard." You investigate and find out why. Last month someone added `AND deleted_at IS NULL` to the dashboard copy because soft-deleted test orders were leaking into production charts. They fixed the dashboard. They forgot the export job. They didn't even know the reconciliation script existed. Three services are now silently answering the same business question three different ways, and the only record of the "correct" answer lives in tribal knowledge.

That drift is the actual product this topic is selling. A database view lets you write that join **once**, give it a name, store the definition in the database itself, and have every service select from the name instead of maintaining their own private copy of the logic. And along the way it solves a second problem you've probably been solving badly with wide-open `GRANT SELECT ON orders TO everyone`: letting people query exactly the data they need, and nothing else.

## 2. The Analogy — Make the Mechanic Obvious

Think about a "House Special Platter" on a restaurant menu.

The platter has a name on the menu, and behind that name sits a written recipe: these appetizers, this main, that sauce, in these proportions. Here's the important part — the restaurant does **not** have a stack of finished platters sitting in a freezer. When you order it, the kitchen cooks it fresh, right then, using whatever ingredients came in this morning. If the fish supplier changed, tonight's platter reflects tonight's fish. If the head chef updates the recipe tomorrow, every platter ordered from tomorrow onward follows the new recipe. Nobody ever eats a stale platter, because no platter exists until it's ordered.

Now map every part:

- The name on the menu is the view name — `active_customer_orders`.
- The written recipe is the stored SQL definition — the database keeps the query, not the results.
- Cooking fresh on each order is the fact that every `SELECT` runs the underlying query against the live tables, right now.
- Updating the recipe is `CREATE OR REPLACE VIEW` — change it in one place, and every service that orders "the platter" gets the new logic instantly.
- The head chef letting a trainee cook *only* the special — without handing over the keys to the walk-in fridge — is granting access to the view without granting access to the base tables.
- And if the restaurant ever did pre-cook fifty platters and park them under a heat lamp, serving customers yesterday's food until someone remakes the batch — that's a materialized view, which is a different tool with a different trade-off ([its own page here](what-are-materialized-views.md)).

Keep the "cooked fresh on order" part in your head. Almost every interview question about views is secretly testing whether you understand that sentence.

## 3. The Full Explanation — How It Actually Works

In plain language first: a view is a **saved query**. You write a `SELECT` once, give it a name, and PostgreSQL stores that definition in its catalog. Crucially, it stores the *query*, not the rows. Zero data gets copied. A view takes essentially no space and holds no state.

So what happens when you run `SELECT * FROM active_customer_orders WHERE status = 'paid'`? PostgreSQL takes your query and the view's stored definition and merges them into one big statement — the planner effectively inlines the view, like you'd pasted the join inline yourself, then applies your `WHERE` to the combined thing and picks a plan. It reads the real `orders`, `customers`, `payments` tables at that moment. If a row was inserted a millisecond ago, you see it. If another transaction just changed a status, you see that. The view is **virtual** — it has no existence apart from the query that defines it, and it's always as fresh as the tables underneath it. That's the whole mechanic. Everything else follows from it.

**Security is where views earn their salary.** Suppose analysts need customer names and cities but should never see `password_hash` or payment tokens. You create a view exposing only the safe columns, then `GRANT SELECT` on the view — and nothing on the base tables. Here's the detail most people miss: when that user queries the view, PostgreSQL checks their permission to reach the base tables **against the view's owner**, not against the person running the query. The user never touches `users` directly, so they never need a grant on it. This is the standard pattern for column-level and row-filtered access in shops that don't run a separate masking layer. One caveat so you sound current: that owner-checking behavior is the default, and PostgreSQL 15 added a `WITH (security_invoker = true)` option that flips it back to checking the querying user's own rights — useful when the view owner having secret powers would surprise your audit team.

**Writes through views** surprise people. A *simple* view — one table in its `FROM`, no `GROUP BY`, no `DISTINCT`, no aggregates, no `UNION`, no `LIMIT` at the top level — is automatically updatable in PostgreSQL. You can `INSERT`, `UPDATE`, and `DELETE` through it, and the changes land in the base table. It behaves like a window onto one table. Complex views (joins, aggregations) are not automatically updatable; if you genuinely need writes through one, you attach `INSTEAD OF` triggers that translate the write into base-table statements yourself.

Which brings us to **WITH CHECK OPTION**, the guard rail people forget. Take a view `open_tickets` defined as `SELECT ... FROM tickets WHERE status IN ('open', 'in_progress')`. Through that view, nothing stops a user from running `UPDATE open_tickets SET status = 'done'` — the write succeeds against the base table, and the row instantly vanishes from the view, because it no longer matches the filter. Or worse, they `INSERT` a ticket with `status = 'backlog'` through the view and it lands in the table but never appears in the view they inserted it into — an invisible row they can't see, can't reason about, and will swear is a bug. Add `WITH CHECK OPTION` to the view and PostgreSQL rejects either operation with an error: you may not create or modify rows through this view in a way that makes them invisible to it. By default the check cascades down through any views this view sits on top of; `LOCAL` limits it to this view's own conditions.

**Now the performance truth, because interviews love it:** a view does not make anything faster. There is no cache, no precomputation, no shortcut. Querying the view costs exactly what the underlying query costs, because the planner expands it into that very query. Indexes live on the base tables — the view has none of its own, so if that five-table join needs a B-tree on `orders(customer_id, created_at)` to be fast, you build the index on `orders` ([B-tree basics](what-is-b-tree-index.md)) and the view benefits automatically. The one pleasant side effect of expansion is that the optimizer sees your outer filters together with the view's internals and can often push predicates down and pick better plans than a stale hand-copied version of the query would allow. But that's correctness-of-planning, not magic speed. If the join is slow, the view is slow — go look at the plan with [EXPLAIN ANALYZE](what-is-explain-analyze.md).

Two operational footnotes worth knowing. First, dependencies are tracked: PostgreSQL will refuse to drop a table or column that a view references unless you say `CASCADE` (which drops the view too), though renaming a referenced column updates the view automatically. Second, views are ordinary schema objects — migrations create and version them like tables, and ORMs can map models straight onto them, which makes them the natural home for read models shared across services.

## 4. See It In Practice — Real Code or Queries

First, the fix for the opening disaster — the five-table join lives in exactly one place now. Assumption: one order has at most one shipment row, so the join doesn't fan out.

```sql
CREATE VIEW active_customer_orders AS
SELECT
    o.id             AS order_id,
    o.status,
    o.total_cents,
    o.created_at,
    c.id             AS customer_id,
    c.name           AS customer_name,
    a.city,
    p.method         AS payment_method,
    s.carrier,
    s.tracking_number
FROM orders o
JOIN customers  c ON c.id = o.shipping_customer_id
JOIN addresses  a ON a.id = o.shipping_address_id
JOIN payments   p ON p.id = o.payment_id
JOIN shipments  s ON s.order_id = o.id
WHERE o.deleted_at IS NULL;   -- the filter someone forgot in the export job

-- Every service answers the business question identically,
-- and adding a filter here fixes dashboard, export, AND finance at once:
SELECT order_id, customer_name, total_cents
FROM active_customer_orders
WHERE status = 'paid'
ORDER BY created_at DESC
LIMIT 50;
```

Second, the security pattern — expose safe columns, grant on the view, keep base tables locked. This is PostgreSQL-specific behavior: base-table permission checks happen against the view owner by default (flip with `security_invoker = true` on PG 15+ if you want caller-based checks).

```sql
CREATE VIEW public_user_profiles AS
SELECT id, name, avatar_url, city, created_at
FROM users;   -- password_hash, email, tokens: simply not in the projection

CREATE ROLE analytics_readonly;
GRANT SELECT ON public_user_profiles TO analytics_readonly;
-- deliberately NO grant on users itself:
REVOKE ALL ON users FROM analytics_readonly;

-- Works: reads only the exposed columns, via owner rights on the base table.
SELECT name, city FROM public_user_profiles WHERE city = 'Pune';

-- Fails: ERROR:  permission denied for table users
SELECT password_hash FROM users;
```

Third, an updatable view guarded by `WITH CHECK OPTION`, showing the invisible-row bug it prevents.

```sql
CREATE VIEW open_tickets AS
SELECT id, subject, status, assigned_to
FROM tickets
WHERE status IN ('open', 'in_progress')
WITH CHECK OPTION;

-- REJECTED: ERROR:  new row violates check option for view "open_tickets"
-- (without the option, this succeeds and the row silently disappears from the view)
UPDATE open_tickets SET status = 'done' WHERE id = 42;

-- REJECTED: inserts a row the view itself could never show
INSERT INTO open_tickets (subject, status) VALUES ('Investigate', 'backlog');

-- Writes that stay visible work fine — simple views are automatically updatable:
UPDATE open_tickets SET assigned_to = 'ranjeet' WHERE id = 17;
```

Fourth, prove the performance claim to yourself instead of believing me — inspect the definition, then watch where the time goes.

```sql
-- See exactly what the view stores (the query, nothing else):
SELECT pg_get_viewdef('active_customer_orders'::regclass);
-- or in psql: \d+ active_customer_orders

-- The plan shows scans of the BASE tables with your predicate pushed in.
EXPLAIN ANALYZE
SELECT order_id FROM active_customer_orders WHERE customer_id = 991;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a view, and what problem does it actually solve?**

A view is a named, stored query. PostgreSQL saves the `SELECT` definition in its catalog and stores none of the results. Its two real jobs: first, giving shared query logic a single home, so the five-table join exists once instead of drifting apart across three services — change the view and every consumer changes with it. Second, access control: you can grant users permission on a narrow view without ever granting them the base tables, hiding both sensitive columns and rows outside the filter. The mistake candidates make is framing it as a convenience alias. It's a governance tool — one definition of a business concept ("active order"), enforced by the database.

**Q: Does a view store data? What literally happens when I select from one?**

No. When you query a view, the planner merges its stored definition into your statement — roughly as if you'd inlined the query — and executes the merged statement against the live base tables right then. Fresh rows, current values, every time, because there's nothing cached to be stale. The proof is trivial: run the same view query twice with a commit in between and the results move with the data. The one exception in the family is the materialized view, which *does* store its result set on disk and serves possibly-stale rows until you `REFRESH` it — that's a deliberate trade, covered on its own page.

**Q: How exactly do views provide security? Doesn't the user still need table access?**

This is the part that separates people who've used views from people who've administered them. When a user selects from a view, PostgreSQL checks the base-table permissions against the **view's owner**, not the calling user. So you create a view projecting only safe columns, grant `SELECT` on the view alone, and revoke everything on the base table — the user can read the projection and physically cannot reach `password_hash`, both because it's not in the view and because they hold no grant on the table. The same mechanism handles row filtering: a `WHERE tenant_id = current_tenant` view gives a tenant-scoped lens without exposing other tenants' rows. Caveat worth volunteering: that owner-checking is the historical default, and PostgreSQL 15 added `WITH (security_invoker = true)` to check the caller's rights instead, which matters for audit-sensitive setups.

**Q: Can you INSERT or UPDATE through a view?**

Yes, when the view is "simple": a single table in the `FROM`, no top-level `DISTINCT`, `GROUP BY`, `HAVING`, `LIMIT`, `UNION`/`INTERSECT`/`EXCEPT`, and no aggregates or window functions in the select list. Such views are automatically updatable — writes pass through to the base table. Computed columns in the select list are read-only even in updatable views. Once the view involves joins or aggregation, PostgreSQL stops doing it for you; you either write to the base tables directly or attach `INSTEAD OF` triggers that translate each write into explicit base-table statements. Knowing where the automatic line sits — and naming `INSTEAD OF` triggers as the escape hatch past it — is usually the follow-up.

**Q: What does WITH CHECK OPTION do, and what breaks without it?**

It forbids writes through a filtered view that produce rows invisible to that view. Without it, on `open_tickets` (`status IN ('open','in_progress')`), a user can `UPDATE` a row's status to `'done'` — the write commits, and the row instantly disappears from the view, because it no longer matches the filter. They can also `INSERT` a `'backlog'` ticket through the view and never see it again. Both look like application bugs and waste real debugging hours. With `WITH CHECK OPTION`, PostgreSQL rejects both with "new row violates check option for view." Rule of thumb: any filtered, updatable view that users write through should have it. The default scope is `CASCADED` — the check walks down through stacked views too; `LOCAL` checks only the outermost view's own condition.

**Q: Is querying a view faster than running the underlying join myself?**

No — and saying otherwise sinks the answer. A view adds zero performance: no storage, no cache, no precomputation. At planning time it's expanded into your statement, so the cost equals the underlying query's cost, and all indexing still happens on the base tables. If anything, expansion occasionally helps *planning*, because the optimizer sees your filters alongside the view's internals and can push predicates down into a cleaner plan than an old hand-copied query would produce — but that's a correctness and maintenance win, not raw speed. When someone wants a view to "go faster," the honest moves are: index the base tables for the access pattern, simplify the join, or switch to a materialized view and pay for it with staleness and refresh jobs. Verify with `EXPLAIN ANALYZE`, not vibes.

**Q: View versus CTE versus materialized view — how do you choose?**

Scope and freshness. A CTE (`WITH ... AS`) names a query inside one statement — great for readability and recursion, gone the moment the statement ends; nobody else can use it. A view persists the definition at the database level — reusable by every service, always live, ideal for shared business logic and access control. A materialized view persists the *results* to disk — fast to read, stale until `REFRESH MATERIALIZED VIEW` runs (with `CONCURRENTLY` if readers can't tolerate a lock), the right call for heavy aggregations where seconds-old data is acceptable. Since PostgreSQL 12, CTEs are generally inlined into the outer query much like views, so they're no longer the automatic optimization fence they once were — mention that and you sound like you've kept up.

**Q: What happens to a view when the underlying schema changes?**

PostgreSQL tracks the dependency, so it protects you from silent breakage. Dropping a table or column that a view references fails outright unless you add `CASCADE` — which also drops the view, loudly, where you'll notice it. Renaming a referenced column is handled gracefully: the view's definition is rewritten to the new name automatically. The practical takeaway for migrations: treat views as first-class schema objects in your migration tooling, check `pg_depend` or just try the migration against a staging dump, and remember that a `CASCADE` in a migration script can quietly remove views other teams rely on.

## 6. The Traps — What Goes Wrong in Production

**Trap: "A view is a snapshot — it stores the data."**
The wrong assumption: creating a view freezes the rows, like copying a table. It's wrong because a view stores only the query definition; there is no data anywhere. What actually happens: someone builds `daily_revenue` expecting yesterday's number to stay put, runs a report at 9am and again at 2pm, and the numbers differ — or worse, a hard-delete on the base table makes rows vanish from every consumer of the view simultaneously. Auditors ask which number was true "as of" the report date and nobody can answer. The fix: know that views are always live, and when you truly need frozen-at-a-moment results, reach for a [materialized view](what-are-materialized-views.md) and schedule its refresh deliberately.

**Trap: "Wrapping my slow query in a view will speed it up."**
The wrong assumption: a view is some kind of optimization layer. It's wrong because views add indirection for humans, not for the machine — the planner expands the view into the same join you started with, and execution touches the same base tables with the same indexes (which live on those tables, not on the view). What actually happens: the team wraps the 4-second five-table join in a view, the dashboard stays at 4 seconds, and now debugging is *harder* because the query text lives in the catalog instead of the code. The fix: profile with `EXPLAIN ANALYZE`, add the index the plan is begging for (often a composite on the join-plus-filter columns), and treat the view purely as shared-logic and security infrastructure. If precomputation is genuinely needed, materialize it consciously.

**Trap: Filtered, updatable views without WITH CHECK OPTION.**
The wrong assumption: "if I can only see open tickets through this view, I can only ever affect open tickets." Wrong because PostgreSQL will happily execute a write whose result falls outside the view's filter. What actually happens: `UPDATE open_tickets SET status = 'done'` commits and the row evaporates from the user's screen mid-workflow; or an insert with a filtered-out status lands invisibly in the base table, and support spends an afternoon hunting a "missing" ticket that exists. The fix: declare `WITH CHECK OPTION` on every filtered view users write through, so illegal transitions fail loudly at the database instead of confusingly in the UI.

**Trap: Expecting writes through a complex view to just work.**
The wrong assumption: views behave like tables for DML across the board. Wrong because PostgreSQL's automatic updatability stops at simple single-table views — a view with `GROUP BY` or joins has no unambiguous way to map an update onto rows. What actually happens: the ORM mapped a model onto the aggregated view, a save fires, and production returns `ERROR: cannot insert into view "..."` with a hint about views containing `GROUP BY`. The fix: map writable entities to base tables, reserve views for reads, or write explicit `INSTEAD OF` triggers when writes-through-the-view is genuinely the contract.

**Trap: Granting the view but leaving old table grants in place.**
The wrong assumption: creating the secure view secures things by itself. Wrong because column hiding only holds if the base table is unreachable — anyone with a leftover `GRANT SELECT ON users TO analytics_readonly` walks around your beautiful view with one direct query. What actually happens: the audit finds the "hidden" `password_hash` was readable all along, and the view was theater. The fix: after introducing access views, actually `REVOKE` the base-table grants and verify with `has_table_privilege` (or by attempting the direct query as that role) that the only road in is the road you paved.

## 7. Compare With Related Concepts

These three get conflated constantly because all of them are "a named query." The differences are scope and whether results are stored.

**View vs materialized view.** A view stores the query and computes fresh on every select; a materialized view stores the *result rows* on disk and serves them as-is until you run `REFRESH MATERIALIZED VIEW`. Same definition, opposite freshness guarantees — one is the cooked-fresh platter, the other is the heat lamp. Rule: use a plain view for shared logic and access control where live data matters; use a materialized view for expensive aggregations read far more often than the data changes, and budget a refresh strategy ([full page here](what-are-materialized-views.md)).

**View vs CTE.** A view is defined once in the schema and usable by every connection, service, and human until someone drops it; a CTE (`WITH x AS (...)`) is defined inside one statement and dies with it. Since PostgreSQL 12, CTEs are normally inlined by the planner just like views, so they even share the "no free speed" property. Rule: a CTE is for organizing a single query (and recursive queries); a view is for logic that more than one consumer must share ([CTEs](what-are-ctes.md)).

**View vs table.** A table owns its rows; a view owns only its definition and borrows rows from tables at read time. Writes to a simple view are really writes to the base table; there is no "view storage" to back up, vacuum, or size independently. Rule: if the data must exist independent of other tables, it's a table; if it's always derived, it's a view.

## 8. 🧠 The Memory Hook

A view is a saved question, not a saved answer. Order the platter and the kitchen cooks it fresh from today's ingredients — which is why it's never stale, never faster than its recipe, and perfectly safe to serve to guests you don't trust with the fridge keys.
