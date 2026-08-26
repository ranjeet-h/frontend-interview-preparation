# How do you protect backend routes in a MERN application?

## 1. The Real-World Problem — When You Actually Hit This

The React app hides the admin button from normal users, but a user can still send `DELETE /api/users/123` from Postman. If Express executes that request, the UI check was never security; it was only presentation. A similar bug appears when a profile endpoint trusts `req.body.userId`: a user changes that value and edits somebody else's document. That is an insecure direct object reference (IDOR).

The backend must make the access decision for every private request. In a MERN app, that means identifying the caller, checking the caller's permission, checking access to the specific MongoDB document, and only then running the handler.

## 2. The Analogy — Make the Mechanic Obvious

Treat the API as a building with a guarded records room. The browser is a sign in the lobby: it can hide links, but it cannot stop somebody from walking to the building with a different tool.

The guard performs three different checks. A valid JWT is the visitor's identity badge, which is authentication. A role such as `admin` is the access level printed on the badge, which is role-based authorization. The record's `ownerId` is the name written on a particular file, which is ownership authorization. A visitor may have a valid badge and still be forbidden from opening another customer's file.

The important mapping is the order: verify the badge first, inspect its permissions second, then compare it with the requested record. The records clerk, represented by the route handler, should never receive an unchecked visitor.

## 3. The Full Explanation — How It Actually Works

Express protects a route by running middleware before its handler. A typical private request follows this path:

```txt
request -> parse headers -> authenticate -> authorize -> validate input -> query MongoDB -> handler -> error handler
```

Authentication answers “who is calling?” For a JWT setup, `requireAuth` reads `Authorization: Bearer <token>`, calls `jwt.verify`, and rejects a missing, expired, malformed, or tampered token with `401 Unauthorized`. `jwt.decode` is not enough: it reads claims without proving that the server signed them. After verification, the middleware copies only the claims the application needs into `req.user`, commonly the subject (`sub`) and role.

Authorization answers “may this caller perform this action?” A `requireRole("admin")` middleware is useful for a whole admin router. It should run after `requireAuth`, because there is no trustworthy role until the token has been verified. A JWT role is a snapshot, not automatically the current policy: for revocation or membership changes that must take effect immediately, load current user or tenant policy (or check a revocation mechanism) before allowing the action. Role checks are coarse-grained; they do not prove that the caller owns a particular order or profile.

Ownership is fine-grained authorization. The handler loads the requested document and compares its server-side owner field with `req.user.id`. It must not use a user ID supplied in the body as the identity of the caller. For a multi-tenant application, the same idea applies to a tenant or organization boundary: query and authorize against the authenticated user's tenant, not a tenant ID chosen by the client.

Apply broad checks at the router boundary so a new admin endpoint does not accidentally omit them. Keep resource checks close to the query because they depend on the document. Public routes such as login, health checks, and public catalog reads should be mounted separately so “public” is an intentional exception.

The API contract should distinguish failures. Return `401` when the caller has no valid identity. Return `403` when the identity is valid but lacks the required role or resource permission. Return `404` when the resource genuinely does not exist. Do not send stack traces, token contents, password hashes, or authorization details in production errors. A centralized error handler should turn unexpected failures into a stable response and log the private diagnostic details server-side.

The frontend can use the contract to redirect a `401` to sign-in and show a `403` as a permission message, but it must never be the enforcement point. It should send the credential consistently, avoid putting access decisions in request bodies, and treat the server response as authoritative. If access can change while a page is open, a cached role in React is only a display hint; the API must check current policy on each request.

## 4. See It In Practice — Real Code or Queries

This CommonJS example assumes an Express application with `express`, `jsonwebtoken`, and Mongoose installed. The access token uses `sub` for the user ID and expires through the JWT `exp` claim.

```javascript
// middleware/auth.js
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.get("authorization");
  const [scheme, token] = header ? header.split(" ") : [];

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" }
    });
  }

  try {
    const claims = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"]
    });
    req.user = { id: claims.sub, role: claims.role, tenantId: claims.tenantId };
    return next();
  } catch (error) {
    return res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "Invalid or expired token" }
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required" }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Insufficient permissions" }
      });
    }

    return next();
  };
}

module.exports = { requireAuth, requireRole };
```

Mount the middleware where the security boundary is obvious. Every admin route inherits both checks, while user-owned routes still perform their document-level check.

```javascript
// app.js
const express = require("express");
const { requireAuth, requireRole } = require("./middleware/auth");
const orderRoutes = require("./routes/orders");
const adminRoutes = require("./routes/admin");

const app = express();
app.use(express.json());

app.use("/api/orders", requireAuth, orderRoutes);
app.use("/api/admin", requireAuth, requireRole("admin"), adminRoutes);

app.use((error, req, res, next) => {
  console.error({ requestId: req.get("x-request-id"), error });
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" }
  });
});

module.exports = app;
```

An ownership check belongs in the query path. Validate the route `ObjectId` before querying, then include the authenticated owner and tenant in the filter so an out-of-scope record is indistinguishable from a missing one.

```javascript
// routes/orders.js
const router = require("express").Router();
const mongoose = require("mongoose");
const Order = require("../models/Order");

router.patch("/:id", async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: { code: "INVALID_ID", message: "Invalid order ID" }
      });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      ownerId: req.user.id,
      tenantId: req.user.tenantId
    });

    if (!order) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Order not found" }
      });
    }

    // In production, allow-list fields instead of copying arbitrary input.
    if (typeof req.body.shippingAddress === "string") {
      order.shippingAddress = req.body.shippingAddress;
    }

    await order.save();
    return res.json({ data: order });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
```

The frontend contract is deliberately small and predictable:

```javascript
const response = await fetch("/api/orders/64f...", {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`
  },
  body: JSON.stringify({ shippingAddress: "10 Main Street" })
});

if (response.status === 401) {
  // Clear stale auth state and send the user through sign-in/refresh flow.
} else if (response.status === 403) {
  // Keep the user signed in, but show that this action is not permitted.
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you protect backend routes in a MERN application?**

Put enforcement in Express middleware and in the resource query path. Verify the access token, attach a small trusted identity to `req.user`, apply role or permission middleware, validate the request, and then check ownership or tenant scope against MongoDB before changing data. The React app may hide controls, but a direct HTTP client must receive the same authorization decision.

**Q: What is the difference between authentication and authorization?**

Authentication establishes identity: `jwt.verify` proves that the token is valid and identifies its subject. Authorization evaluates that identity against a policy: an admin role may access an admin router, while an ordinary user may access only an order whose `ownerId` matches the subject. Authentication normally precedes authorization because authorization needs a trustworthy identity.

**Q: What is the difference between `401` and `403`?**

`401` means the request has no acceptable authentication, such as a missing, expired, or invalid token. The client may need to sign in or obtain a fresh token. `403` means the server knows who the caller is, but the caller is not allowed to perform this action. Refreshing the same user's token should not turn a real permission failure into success.

**Q: How do you prevent IDOR in a MongoDB route?**

Ignore client-supplied identity fields and derive the caller from verified authentication. Validate the route parameter, then include its `_id`, the authenticated `ownerId`, and tenant ID in the MongoDB filter. A random or non-sequential ID can reduce enumeration, but it is not an authorization check; the scoped query is essential.

**Q: Where should route middleware be applied?**

Use router-level middleware for a shared boundary, such as `requireAuth` and `requireRole("admin")` on `/api/admin`. Use route or handler-level logic for checks that require the specific resource, such as ownership. Mount genuinely public routes separately. This makes the default protection visible and reduces the chance that a new route silently bypasses it.

**Q: Why is `jwt.verify` required instead of `jwt.decode`?**

`decode` parses claims but does not validate the signature or expiry, so an attacker could change a decoded role to `admin`. `verify` checks the signature against the configured secret or public key and validates registered claims such as expiration. Only verified claims should influence authorization.

## 6. The Traps — What Goes Wrong in Production

**Protecting only the React route:**

Client-side guards improve navigation, but curl, Postman, mobile clients, and scripts can bypass them. The fix is to enforce the policy in Express for every private operation, including read endpoints and destructive actions.

**Trusting `req.body.userId`:**

That value is controlled by the caller. Using it in a MongoDB filter lets one user select another user's records. Use the verified subject in `req.user` and allow-list mutable fields so the caller cannot also rewrite `ownerId` or `role`.

**Checking a role without checking ownership:**

“User” can be a valid role for accessing orders, but it does not mean every order belongs to that user. Combine broad RBAC with a resource or tenant check whenever the route addresses a particular document.

**Calling `decode` or accepting an unsigned token:**

Parsing a token is not validating it. Always restrict accepted algorithms through the JWT library configuration and verify with a secret or public key kept outside source control. Do not put sensitive data in the payload; signed JWT claims are readable by their holder.

**Forgetting the router boundary:**

Adding `requireRole("admin")` to one handler and forgetting it on the next creates an accidental public endpoint. Put common checks on the router mount and keep the handler focused on resource-specific policy.

**Returning inconsistent or leaky errors:**

Stack traces and database errors expose internals, while returning `200` with an error forces every client to guess what happened. Use stable JSON error codes, `401` for missing identity, `403` for denied permission, and a centralized `500` response that logs details privately.

**Treating the frontend's cached role as current truth:**

Roles and memberships can change while a page is open. The UI can optimistically hide a button, but each request still needs a server-side check. A `403` should update the UI rather than trigger an endless retry.

## 7. Compare With Related Concepts

**Authentication vs authorization:** Authentication proves who the caller is; authorization decides what that caller may do. Use `requireAuth` for identity and role, ownership, or tenant checks for permission.

**RBAC vs ownership or ABAC:** RBAC maps roles to broad capabilities. Ownership and attribute-based access control inspect facts such as `resource.ownerId`, `tenantId`, department, or project membership. Use RBAC for stable route boundaries and attribute checks for resource-specific or multi-tenant policy.

**Middleware checks vs database-enforced filters:** Middleware is good for reusable identity and role checks. A database query that includes the authenticated owner, such as `{ _id: id, ownerId: req.user.id }`, narrows the resource lookup itself and reduces the chance of a check-then-use mistake. Use both when the route's policy is simple enough to express in the query.

**JWT access tokens vs sessions:** JWTs let services validate a signed identity without a session lookup, but revocation and claim freshness require extra design. Sessions make server-side revocation straightforward but require shared session storage when Express runs on multiple instances. Choose based on revocation, deployment, and client constraints rather than treating JWTs as automatically more secure.

**`401` vs `403` vs `404`:** `401` is “no valid identity,” `403` is “identity is known but policy denies the action,” and `404` is “the resource does not exist.” Some systems intentionally return `404` for unauthorized resource lookups to reduce resource-existence leakage, but that is a documented information-disclosure choice, not a replacement for the ownership check.

## 8. 🧠 The Memory Hook

The frontend is the lobby sign, not the guard. Before MongoDB opens a record, Express must verify the badge, check the access level, and match the record to the badge holder.
