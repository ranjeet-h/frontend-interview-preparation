# How do you design admin APIs

## Detailed explanation

How do you design admin APIs is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Make frontend and backend agree on auth, data contracts, errors, retries, and state.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define frontend-backend contract.
- Handle auth, cookies/tokens, CORS, and errors.
- Prevent duplicate or stale requests.
- Map backend validation to frontend UX.
- Keep contracts versioned and testable.

## 4. Visual / analogy

```txt
React UI -> API client -> backend endpoint -> response/error contract -> UI state
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply MERN backend rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you design admin apis affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you design admin APIs in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** Admin APIs are separate from user-facing APIs with stricter authorization. Structure: `app.use('/api/admin', authenticate, authorize('admin'), adminRouter)`. Admin routes have their own router with CRUD operations for all entities: user management, content moderation, analytics, system settings. Admin APIs return more data than user APIs (e.g., all user fields, system metrics). Implement audit logging for all admin actions: `await AuditLog.create({ adminId: req.user.id, action: 'delete-user', target: userId, timestamp: new Date() })`. Rate limit admin APIs more strictly to prevent abuse of powerful operations.
- **The Unforgettable Mental Model:** The **Control Room**. User APIs are the customer service desk — limited operations, standard responses. Admin APIs are the control room — full system access, detailed data, and every action is recorded in the logbook.
- **The Trap:** Reusing user-facing API endpoints for admin operations with a simple role check. Admin APIs should be separate with their own validation, response formats, and audit logging.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I design admin APIs as a separate route group with strict admin-only authorization. They have their own router under /api/admin with CRUD operations for all entities. Admin APIs return more detailed data than user APIs and implement audit logging for every action. I rate limit admin APIs more strictly and implement additional validation for destructive operations. Admin APIs are separate from user APIs — they have different response formats, validation rules, and security requirements."

#### How do you implement audit logging for admin actions?
- **The Engine Mechanism (Why it behaves this way):** Create an AuditLog model: `const auditLogSchema = new mongoose.Schema({ adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, target: String, targetType: String, changes: { before: Object, after: Object }, ip: String, userAgent: String, timestamp: { type: Date, default: Date.now } });`. Log in admin middleware or in each admin controller: `await AuditLog.create({ adminId: req.user.id, action: 'update-user', target: userId, targetType: 'User', changes: { before: oldData, after: newData }, ip: req.ip });`. Provide an admin UI to view audit logs with filtering by admin, action, date range, and target.
- **The Unforgettable Mental Model:** The **Security Camera**. Every admin action is recorded — who did it, what they changed, when, and from where. If something goes wrong, you can replay the footage (audit log) to see exactly what happened.
- **The Trap:** Not logging destructive actions (delete, bulk update). These are the most important actions to audit. Log before and after states for all mutations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement audit logging with an AuditLog model that records admin ID, action, target, before/after changes, IP, and timestamp. I log in admin controllers before and after mutations to capture the full change. I provide an admin UI to view and filter audit logs. Destructive actions (delete, bulk update) are always logged. Audit logs are immutable — once created, they can't be modified or deleted. This provides a complete trail of all admin activity."

#### How do you handle bulk operations in admin APIs?
- **The Engine Mechanism (Why it behaves this way):** Admin APIs often need bulk operations: bulk delete, bulk update, bulk status change. Implement with validation: `app.post('/api/admin/users/bulk-delete', authorize('admin'), async (req, res) => { const { userIds } = req.body; if (!Array.isArray(userIds) || userIds.length > 1000) return res.status(400).json({ error: 'Invalid request' }); const result = await User.deleteMany({ _id: { $in: userIds } }); await AuditLog.create({ adminId: req.user.id, action: 'bulk-delete', target: `${userIds.length} users`, targetType: 'User' }); res.json({ deleted: result.deletedCount }); });`. Limit batch size, validate all IDs, and use transactions for operations that affect multiple collections.
- **The Unforgettable Mental Model:** The **Bulk Processing Machine**. Instead of processing items one by one, the machine processes a batch at once. But it has safety limits (max batch size) and records everything it processes (audit log).
- **The Trap:** Not limiting batch size — a bulk delete with 1 million IDs can crash the database. Always cap the batch size and validate all IDs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For bulk operations, I validate the input (array of IDs), cap the batch size (max 1000), and use MongoDB's bulk operations (deleteMany, updateMany with $in). I wrap multi-collection operations in transactions for atomicity. I log bulk operations in the audit log with the count and target. I also implement a dry-run mode for destructive bulk operations so admins can preview the impact before executing."

#### How do you implement admin analytics APIs?
- **The Engine Mechanism (Why it behaves this way):** Use MongoDB aggregation pipelines for analytics: `const stats = await Order.aggregate([{ $match: { createdAt: { $gte: startDate, $lte: endDate } } }, { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }]);`. For large datasets, pre-compute analytics in a background job and store in a stats collection: `await DailyStats.create({ date, totalUsers, newUsers, totalOrders, revenue })`. Admin dashboard fetches pre-computed stats for fast loading. Use MongoDB's $facet for multiple aggregations in one query. Cache analytics results with Redis for frequently accessed dashboards.
- **The Unforgettable Mental Model:** The **Dashboard Instruments**. Real-time aggregation is like reading the gauges directly (accurate but slow for large datasets). Pre-computed stats are like a dashboard summary — calculated periodically and ready to display instantly.
- **The Trap:** Running complex aggregations on every dashboard load — this is slow for large datasets. Pre-compute analytics in background jobs for fast dashboard loading.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For admin analytics, I use MongoDB aggregation pipelines for real-time queries and pre-computed stats for large datasets. Background jobs calculate daily/weekly stats and store them in a stats collection. The admin dashboard fetches pre-computed stats for fast loading. I use $facet for multiple aggregations in one query and cache results with Redis for frequently accessed dashboards. The key is balancing accuracy (real-time) with performance (pre-computed)."

#### How do you secure admin APIs beyond role checks?
- **The Engine Mechanism (Why it behaves this way):** Additional security layers: (1) **IP whitelisting** — only allow admin access from specific IPs: `const allowedIPs = process.env.ADMIN_IPS.split(','); if (!allowedIPs.includes(req.ip)) return res.status(403).json({ error: 'Access denied' });`. (2) **2FA for admin actions** — require TOTP verification for destructive operations. (3) **Rate limiting** — stricter limits for admin APIs. (4) **Request logging** — log all admin requests with full details. (5) **Session timeout** — shorter session duration for admin users. (6) **CSRF protection** — admin panel should have CSRF tokens for all mutations. (7) **Action confirmation** — require explicit confirmation for destructive operations.
- **The Unforgettable Mental Model:** The **Vault System**. Role check is the first lock. IP whitelisting is the second lock. 2FA is the combination lock. Rate limiting is the alarm system. Request logging is the security camera. Each layer adds protection.
- **The Trap:** Relying only on role checks for admin APIs. Admin APIs have full system access and need multiple security layers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Beyond role checks, I secure admin APIs with IP whitelisting, 2FA for destructive operations, stricter rate limiting, full request logging, shorter session timeouts, CSRF protection, and action confirmation for destructive operations. Admin APIs have full system access, so defense in depth is critical. Each layer protects against different attack vectors — IP whitelisting prevents external access, 2FA prevents compromised token abuse, rate limiting prevents brute force, and logging provides accountability."

## 8. Active recall test

1. **How are admin APIs different from user APIs?**
   - **Explanation:** Admin APIs have stricter authorization (admin-only), return more detailed data, implement audit logging, and have additional security layers. They're in a separate route group (/api/admin).

2. **What should audit logs record?**
   - **Explanation:** Admin ID, action, target, before/after changes, IP, user agent, and timestamp. Audit logs are immutable — once created, they can't be modified or deleted.

3. **How do you handle bulk operations safely?**
   - **Explanation:** Validate input, cap batch size (max 1000), use MongoDB bulk operations, wrap multi-collection ops in transactions, log in audit log, and implement dry-run mode.

4. **How do you implement admin analytics?**
   - **Explanation:** Use MongoDB aggregation for real-time queries. Pre-compute stats in background jobs for large datasets. Cache with Redis. Use $facet for multiple aggregations in one query.

5. **What additional security layers should admin APIs have?**
   - **Explanation:** IP whitelisting, 2FA for destructive ops, stricter rate limiting, full request logging, shorter session timeouts, CSRF protection, and action confirmation.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you design admin APIs in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you design admin APIs in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
