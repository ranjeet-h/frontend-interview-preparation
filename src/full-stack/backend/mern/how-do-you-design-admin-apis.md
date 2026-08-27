# How do you design admin APIs

## 1. The Real-World Problem — When You Actually Hit This

Your app launched three months ago. Everything worked fine in development with 100 users. Now you have 50,000 users, and your support team needs to investigate complaints. They can't see user data. They can't moderate abusive content. They can't see system metrics. You start adding admin functionality by sprinkling role checks into existing user endpoints — "if admin, return all fields." Then a junior admin accidentally deletes 500 users through the user API because it didn't have proper safeguards. An attacker compromises an admin account and uses the same endpoints to scrape all user data because you didn't implement IP whitelisting or audit logging. You realize too late that admin APIs are not just "user APIs with more permissions" — they're a completely different security domain with different requirements, different failure modes, and different blast radius when things go wrong.

## 2. The Analogy — Make the Mechanic Obvious

Think of a bank. The customer service desk at the front handles routine transactions — checking balances, transferring money, updating addresses. The tellers have limited access and every interaction follows a standard script. Now think of the bank's back office: the vault room, the fraud investigation department, the system operations center. That's where employees can see every account, freeze assets, investigate transactions, and change system settings. The back office has multiple doors with different keys, cameras recording every action, strict procedures for destructive operations, and only authorized personnel can enter. Admin APIs are the back office of your application. User APIs are the customer service desk. They serve different purposes, have different security requirements, and when something goes wrong in the back office, the damage is much more severe.

## 3. The Full Explanation — How It Actually Works

Admin APIs are a separate set of endpoints that give trusted users privileged access to system data and operations. They're fundamentally different from user-facing APIs in three ways: authorization scope, data visibility, and accountability.

**Authorization scope:** User APIs limit what a user can do to their own data or shared resources they have access to. Admin APIs can operate on any entity in the system. This means the authorization layer is stricter — not just "is this user an admin?" but also "is this admin allowed to perform this specific destructive operation?" and "is this request coming from a trusted location?"

**Data visibility:** User APIs return only what that specific user needs to see — their own profile, their orders, their content. Admin APIs return full entity details, system metrics, aggregate analytics, and cross-user data. This different data shape means admin APIs need their own response contracts and validation rules. You can't just return "more fields" from the same endpoint because that creates information leakage and makes it harder to evolve the user-facing contract independently.

**Accountability:** When a regular user deletes their own account, it's a standard lifecycle event. When an admin deletes a user's account, it's a privileged action that needs to be recorded. Every admin action should create an audit log entry: who did it, what they changed, when they did it, from what IP, and what the data looked like before and after. This audit trail is how you investigate incidents, comply with regulations, and detect compromised admin accounts.

Structurally, admin APIs live in their own route group — typically `/api/admin` — with their own router, their own middleware stack, and their own error handling. This separation gives you defense in depth: even if you accidentally remove the admin role check from a user endpoint, that endpoint still can't be used for admin operations because it's not in the admin route group. It also lets you apply different rate limits, different logging, and different security policies to admin endpoints without affecting user-facing functionality.

Admin APIs also have different operational characteristics. Bulk operations are common in admin interfaces — banning 50 spam users at once, updating product prices across a catalog, changing feature flags. These operations need special handling: batch size limits, validation of all inputs before execution, transactions for multi-collection changes, and dry-run modes so admins can preview impact. Analytics endpoints in admin panels query large datasets and need pre-computed stats or caching to avoid overloading the database on every dashboard load.

The security model for admin APIs follows the principle of defense in depth. A single role check is not enough. You layer multiple protections: IP whitelisting so admin APIs only accept requests from trusted networks, 2FA for destructive operations so a stolen token can't be used for damage, stricter rate limits to prevent bulk abuse, shorter session timeouts to reduce the window of compromise, and explicit confirmation dialogs for destructive actions in the UI. Each layer protects against a different failure mode.

## 4. See It In Practice — Real Code or Queries

**Separate admin route structure:**

```javascript
// adminRoutes.js - separate router for admin operations
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// User management endpoints
router.get('/users', async (req, res) => {
  // Returns full user details, not filtered like user API
  const users = await User.find({})
    .select('-password -__v')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(users);
});

router.delete('/users/:userId', auditLog('delete-user'), async (req, res) => {
  const { userId } = req.params;
  
  // Check if user exists before deletion for audit trail
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  await User.findByIdAndDelete(userId);
  res.json({ message: 'User deleted' });
});

// Bulk operations with safety limits
router.post('/users/bulk-delete', auditLog('bulk-delete'), async (req, res) => {
  const { userIds } = req.body;
  
  // Validate input is an array
  if (!Array.isArray(userIds)) {
    return res.status(400).json({ error: 'userIds must be an array' });
  }
  
  // Cap batch size to prevent database overload
  if (userIds.length > 1000) {
    return res.status(400).json({ error: 'Cannot delete more than 1000 users at once' });
  }
  
  // Validate all IDs are valid ObjectId format
  const validIds = userIds.filter(id => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length !== userIds.length) {
    return res.status(400).json({ error: 'Invalid user IDs in request' });
  }
  
  const result = await User.deleteMany({ _id: { $in: validIds } });
  res.json({ deleted: result.deletedCount });
});

module.exports = router;

// In main app.js
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);
```

**Audit logging middleware:**

```javascript
// models/AuditLog.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['create', 'update', 'delete', 'bulk-delete', 'bulk-update']
  },
  target: {
    type: String,
    required: true
  },
  targetType: {
    type: String,
    required: true
  },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  ip: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  timestamps: false
});

// Ensure audit logs can't be modified after creation
auditLogSchema.pre('save', function() {
  if (!this.isNew) {
    throw new Error('Audit logs cannot be modified');
  }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);

// middleware/auditLog.js
const AuditLog = require('../models/AuditLog');

function auditLog(action) {
  return async (req, res, next) => {
    // Store original data for before/after comparison
    const originalSend = res.send;
    let responseData;
    
    res.send = function(data) {
      responseData = data;
      originalSend.call(this, data);
    };
    
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await AuditLog.create({
          adminId: req.user.id,
          action,
          target: req.params.userId || req.params.id || 'bulk',
          targetType: req.path.split('/')[2] || 'unknown',
          changes: {
            before: req.originalData,
            after: responseData
          },
          ip: req.ip,
          userAgent: req.get('user-agent')
        });
      }
    });
    
    next();
  };
}

module.exports = auditLog;
```

**IP whitelisting middleware:**

```javascript
// middleware/ipWhitelist.js
function ipWhitelist(req, res, next) {
  const allowedIPs = process.env.ADMIN_IPS?.split(',') || [];
  
  // Skip whitelist check in development or if not configured
  if (process.env.NODE_ENV === 'development' || allowedIPs.length === 0) {
    return next();
  }
  
  // Check if request IP is in whitelist
  if (!allowedIPs.includes(req.ip)) {
    console.warn(`Admin access denied from IP: ${req.ip}`);
    return res.status(403).json({ error: 'Access denied from this location' });
  }
  
  next();
}

module.exports = ipWhitelist;

// Apply to admin routes
app.use('/api/admin', ipWhitelist, adminRoutes);
```

**Analytics with pre-computed stats:**

```javascript
// Background job to compute daily stats (runs via cron)
async function computeDailyStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const stats = await User.aggregate([
    { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
    {
      $group: {
        _id: null,
        newUsers: { $sum: 1 },
        totalUsers: { $sum: 1 }
      }
    }
  ]);
  
  const orderStats = await Order.aggregate([
    { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        revenue: { $sum: '$amount' }
      }
    }
  ]);
  
  await DailyStats.findOneAndUpdate(
    { date: today },
    {
      newUsers: stats[0]?.newUsers || 0,
      totalUsers: await User.countDocuments(),
      totalOrders: orderStats[0]?.totalOrders || 0,
      revenue: orderStats[0]?.revenue || 0
    },
    { upsert: true }
  );
}

// Admin analytics endpoint - fetches pre-computed stats
router.get('/analytics/daily', async (req, res) => {
  const { startDate, endDate } = req.query;
  
  const stats = await DailyStats.find({
    date: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).sort({ date: 1 });
  
  res.json(stats);
});

// Real-time aggregation for ad-hoc queries (with caching)
router.get('/analytics/orders', async (req, res) => {
  const { startDate, endDate } = req.query;
  const cacheKey = `analytics:orders:${startDate}:${endDate}`;
  
  // Check Redis cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  const stats = await Order.aggregate([
    { $match: { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        total: { $sum: '$amount' }
      }
    }
  ]);
  
  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(stats));
  res.json(stats);
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How are admin APIs different from user-facing APIs?**

Admin APIs are fundamentally a different security domain. User APIs operate on a single user's data with limited scope — a user can only see and modify their own resources. Admin APIs can operate on any entity in the system, which means they need stricter authorization, different data contracts, and comprehensive audit logging. Structurally, I keep admin APIs in a separate route group (`/api/admin`) with their own router and middleware stack. This separation lets me apply different rate limits, different security policies, and different logging without affecting user-facing functionality. Admin APIs also return more detailed data — full user profiles, system metrics, cross-user analytics — whereas user APIs return only what that specific user needs to see. The response contracts are different because the use cases are different.

**Q: How do you implement audit logging for admin actions?**

I create an AuditLog model that records the admin ID, action type, target entity, before/after state changes, IP address, user agent, and timestamp. The audit log is immutable — once created, records cannot be modified or deleted. I implement this as middleware that hooks into the response lifecycle, capturing the original data before the operation and the result after the operation. For destructive actions like delete or bulk operations, I capture the full state before deletion so you can see exactly what was removed. I also provide an admin UI to query and filter audit logs by admin, action type, date range, and target entity. This audit trail is critical for incident investigation, compliance, and detecting compromised admin accounts.

**Q: How do you handle bulk operations safely in admin APIs?**

Bulk operations are where admin APIs can cause the most damage, so I add multiple safety layers. First, I validate that the input is actually an array and that all IDs are valid ObjectId format. Second, I cap the batch size — typically max 1000 items per request — to prevent database overload. Third, I use MongoDB's bulk operations like `deleteMany` and `updateMany` with the `$in` operator for efficiency. Fourth, if the operation affects multiple collections, I wrap it in a transaction for atomicity. Fifth, I log the bulk operation in the audit log with the count and target type. Finally, for destructive bulk operations like bulk delete, I implement a dry-run mode where the API returns what would be deleted without actually deleting it, so admins can preview the impact before executing.

**Q: How do you implement admin analytics without slowing down the database?**

For analytics, I balance real-time accuracy with performance. For small datasets or ad-hoc queries, I use MongoDB aggregation pipelines directly. For large datasets or frequently accessed dashboards, I pre-compute stats in background jobs and store them in a separate stats collection. For example, a daily job computes user counts, order counts, and revenue for that day and stores it in a DailyStats collection. The admin dashboard then fetches from this pre-computed collection instead of running aggregations on millions of order documents. I also use Redis caching for analytics results with a short TTL (5-10 minutes) so repeated dashboard loads don't hit the database. For complex queries that need multiple aggregations, I use MongoDB's `$facet` operator to run them in a single query rather than making multiple round trips.

**Q: What security layers do you add beyond role checks for admin APIs?**

Role checks are the minimum, not the whole security model. I implement defense in depth with multiple layers: IP whitelisting so admin APIs only accept requests from trusted networks like the office VPN; 2FA requirement for destructive operations so a stolen JWT token can't be used for damage; stricter rate limits for admin endpoints to prevent bulk abuse; shorter session timeouts for admin users to reduce the window of compromise; full request logging for all admin API calls to detect suspicious patterns; CSRF protection for the admin panel since it's a web interface; and explicit confirmation dialogs in the UI for destructive operations like delete or bulk changes. Each layer protects against a different attack vector — IP whitelisting prevents external access, 2FA prevents token abuse, rate limiting prevents brute force, and logging provides accountability.

## 6. The Traps — What Goes Wrong in Production

**Reusing user endpoints with role checks:** The most common mistake is adding `if (req.user.role === 'admin') return fullData` to existing user endpoints. This couples admin functionality to user contracts, makes it hard to evolve user APIs independently, and increases the blast radius if there's a bug. Admin APIs should be completely separate with their own contracts.

**Missing audit logging for destructive actions:** Teams often log reads and updates but forget deletes and bulk operations. Deletes are irreversible and the most likely to cause problems when something goes wrong. If you don't log the before state, you can't investigate what was deleted or restore it.

**No batch size limits on bulk operations:** A bulk delete endpoint that accepts an unlimited array of IDs is a denial-of-service weapon. An attacker or compromised admin can send a request with a million IDs and crash your database. Always cap batch size and validate all inputs.

**Running aggregations on every dashboard load:** Complex aggregations on large datasets are slow. If your admin dashboard runs a heavy aggregation on every page load, you'll overload the database as the number of admins grows. Pre-compute stats or cache results.

**Relying only on JWT for admin security:** JWTs can be stolen via XSS, logged out sessions not being invalidated, or compromised developer machines. Admin APIs need additional layers like IP whitelisting and 2FA because the blast radius of a compromised admin account is the entire system.

**Not implementing dry-run for destructive operations:** When an admin wants to delete 500 users, they should be able to see exactly what will be deleted before confirming. Without a dry-run mode, mistakes are expensive and hard to recover from.

**Storing audit logs in the same database as application data:** If someone compromises your database, they can delete the audit logs to cover their tracks. Audit logs should ideally be in a separate database or a write-once storage system where they can't be tampered with.

## 7. Compare With Related Concepts

**Admin APIs vs User APIs:** User APIs operate on a single user's data with limited scope and standard response contracts. Admin APIs operate on any entity in the system with broader data visibility and additional security layers. Use user APIs for customer-facing features. Use admin APIs for internal operations, moderation, and system management.

**Admin APIs vs System Design:** Admin APIs are within a single application's backend, while system design questions cover distributed systems across multiple services. Admin APIs focus on authorization, audit logging, and data visibility within your existing architecture. System design focuses on scaling, consistency, and service boundaries across multiple components.

**Audit Logging vs Application Logging:** Application logging captures general system events, errors, and performance metrics for debugging. Audit logging captures specific user actions with before/after state for accountability and compliance. Audit logs are structured, queryable, and immutable. Application logs are often unstructured text files.

**Bulk Operations vs Batch Processing:** Bulk operations in admin APIs are synchronous HTTP requests that process multiple items in one transaction. Batch processing is typically asynchronous background jobs that process large volumes over time. Use bulk operations for interactive admin actions. Use batch processing for large-scale data migrations or periodic tasks.

**IP Whitelisting vs VPN:** IP whitelisting restricts which IP addresses can access admin APIs. A VPN provides a secure tunnel from a client to your network, but you still need IP whitelisting to ensure only VPN users can access admin endpoints. IP whitelisting is an access control mechanism. VPN is a network security mechanism.

## 8. 🧠 The Memory Hook — What Sticks

Admin APIs are the back office: separate entrance, multiple locks, cameras everywhere, and only trusted staff with special procedures.
