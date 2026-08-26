# How do you handle permissions

## 1. The Real-World Problem — When You Actually Hit This

Your app has been running fine for months. Users can create posts, edit their own content, and everything works. Then one day you get a panicked message from a customer: "A regular editor just deleted another user's post and there's no way to recover it." You check the logs and realize the truth: your permission check only verified that the user had the "editor" role. It never checked whether they actually owned the post they were deleting. Anyone with editor privileges could wipe out the entire content database.

This is the moment permission systems stop being abstract and start being critical. A poorly designed permission model isn't just inconvenient — it's a data leak waiting to happen. The real problem is that permissions exist at multiple levels: what your role allows you to do in general, what specific permissions you've been granted, and whether you actually own the specific resource you're trying to touch. Get any of these wrong and users can access or destroy data they shouldn't.

## 2. The Analogy — Make the Mechanic Obvious

Think of permissions like keys in a hotel.

**Role-based access (RBAC)** is like having a master key based on your job. The housekeeping master key opens every guest room. The front desk master key opens the lobby and office but not guest rooms. Your role determines which master key you get when you're hired.

**Permission-based access (PBAC)** is like having a key card programmed for specific doors. Instead of a job title, you have a card that opens room 101, the gym, and the pool — but not room 102 or the restaurant. Each permission is a specific door you can open.

**Resource ownership** is like having the key to your own rented apartment. Even if you have a building key (role), you can't walk into someone else's apartment. You need the specific key for that unit, or you need to be the building manager (admin).

**Permission inheritance** is like corporate hierarchy. A VP can do everything a manager can do, and a manager can do everything an intern can do. Higher positions automatically include all lower-level access.

The guard at each door is your middleware — they check your key before letting you through. If you don't have the right key, you don't get in, period.

## 3. The Full Explanation — How It Actually Works

Permissions in a MERN app work in layers, and you need to check each layer at the right time.

**Layer 1: Authentication — Are you who you say you are?**

Before any permission check, you need to know who the user is. This happens first in your middleware chain. The user sends a JWT token, you verify it with your secret, and you attach the decoded user object to `req.user`. This object contains their ID, role, and any permissions baked into the token. If this fails, return 401 immediately — no point checking permissions for someone you can't identify.

**Layer 2: Role-based access — What's your general clearance level?**

This is the coarsest check. Users have roles like `admin`, `editor`, `viewer`, or `moderator`. Roles are simple and easy to reason about. An admin can do everything. A viewer can only read. This check happens fast because you can store the role in the JWT payload and check it without hitting the database.

The pattern looks like: if the user's role isn't in the allowed list for this route, return 403. This is your first line of defense, but it's not enough on its own.

**Layer 3: Permission-based access — What specific actions can you perform?**

Roles are too coarse for complex apps. You might have users who can delete posts but not users, or who can edit their own profile but not others. This is where explicit permissions come in. Instead of checking roles, you check specific permission strings like `post:delete`, `user:write`, or `admin:access`.

These permissions live in the user document in MongoDB. You can bake them into the JWT for fast reads, but you need to re-check the database for sensitive operations because permissions can change during a user's session. If an admin revokes someone's permissions, that change should take effect immediately, not when their current JWT expires.

**Layer 4: Resource ownership — Do you own this specific thing?**

This is the layer most people miss. Just because you're an editor doesn't mean you can edit every post. You should only edit posts you created. This check requires fetching the resource from the database and comparing its `authorId` or `ownerId` field with `req.user.id`.

Here's the critical decision: if the resource doesn't exist, do you return 404 or 403? Return 404. This prevents information leakage — unauthorized users shouldn't even know the resource exists. Only return 403 if the resource exists but the user can't access it.

**Layer 5: Shared resources — Team and organizational access**

Some resources belong to teams or organizations, not individuals. A project might have multiple collaborators who can all edit it. In this case, you check team membership instead of direct ownership. Fetch the team document, check if the user's ID is in the members array, and allow access if they're a member or an admin.

**The middleware chain matters.** Authentication runs first, then role checks, then permission checks, then ownership checks. Each layer can short-circuit the request. If authentication fails, don't bother checking permissions. If the role check fails, don't fetch the resource for an ownership check. This ordering keeps your app fast — you only do expensive database work when the user has passed the cheaper checks.

**Performance trade-off:** You can store roles and permissions in the JWT to avoid database hits on every request. But this means stale data if permissions change during a session. The solution is hybrid: store the basics in JWT for speed, but re-check the database for destructive operations like deletes or permission changes themselves.

## 4. See It In Practice — Real Code or Queries

Here's how this looks in a real Express/Mongoose application.

First, the authentication middleware that runs before everything else:

```javascript
const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify the token and decode the user object
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Contains { id, role, permissions }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

Role-based middleware for simple cases:

```javascript
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
};

// Usage: only admins and editors can create posts
app.post('/posts', authenticate, requireRole('admin', 'editor'), createPost);
```

Permission-based middleware for fine-grained control:

```javascript
const requirePermission = (permission) => {
  return (req, res, next) => {
    // Check if user has the specific permission
    // Permissions are stored as an array: ['post:read', 'post:write', 'user:read']
    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Usage: only users with post:delete permission can delete posts
app.delete('/posts/:id', authenticate, requirePermission('post:delete'), deletePost);
```

Resource ownership middleware — this is where most bugs happen:

```javascript
const requireOwnership = (Model) => {
  return async (req, res, next) => {
    try {
      const resource = await Model.findById(req.params.id);

      // Return 404 if resource doesn't exist — don't leak information
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      // Check ownership: user must own it OR be an admin
      const isOwner = resource.authorId.toString() === req.user.id;
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Attach resource to req so the handler doesn't fetch it again
      req.resource = resource;
      next();
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  };
};

// Usage: users can only edit their own posts, admins can edit any
app.put('/posts/:id', authenticate, requireOwnership(Post), updatePost);
```

Team-based ownership for shared resources:

```javascript
const requireTeamMembership = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id).populate('team');

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if user is a team member or admin
    const isMember = project.team.members.some(
      member => member.toString() === req.user.id
    );
    const isAdmin = req.user.role === 'admin';

    if (!isMember && !isAdmin) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    req.project = project;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};
```

Permission inheritance with hierarchy:

```javascript
// Define permission hierarchy — higher permissions include lower ones
const permissionHierarchy = {
  'post:delete': ['post:write', 'post:read'],
  'post:write': ['post:read'],
  'user:delete': ['user:write', 'user:read'],
  'user:write': ['user:read'],
  'admin:access': ['*'] // Wildcard for everything
};

const hasPermission = (userPermissions, required) => {
  // Direct match or wildcard
  if (userPermissions.includes('*') || userPermissions.includes(required)) {
    return true;
  }

  // Check if any of the user's permissions imply the required one
  for (const perm of userPermissions) {
    const implied = permissionHierarchy[perm];
    if (implied && (implied.includes('*') || implied.includes(required))) {
      return true;
    }
  }

  return false;
};

// Role hierarchy with numeric levels
const roleLevels = {
  admin: 3,
  editor: 2,
  viewer: 1
};

const hasRoleLevel = (userRole, minRole) => {
  return roleLevels[userRole] >= roleLevels[minRole];
};
```

The Mongoose user schema with permissions:

```javascript
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'editor', 'viewer'],
    default: 'viewer'
  },
  // Explicit permissions for PBAC
  permissions: [{
    type: String,
    enum: [
      'user:read', 'user:write', 'user:delete',
      'post:read', 'post:write', 'post:delete',
      'admin:access'
    ]
  }]
});

// When creating a JWT, include role and permissions
userSchema.methods.generateToken = function() {
  const payload = {
    id: this._id,
    role: this.role,
    permissions: this.permissions // Bake in for fast checks
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you handle permissions in a MERN app?**

I handle permissions in layers, starting with authentication and then moving through role checks, permission checks, and finally resource ownership. First, I verify the JWT token and attach the decoded user to `req.user`. Then I use middleware to check if the user's role is allowed for the route — for example, only admins and editors can create posts. For finer control, I use explicit permission strings like `post:delete` stored in the user document, checked with a `requirePermission` middleware. Most importantly, I always check resource ownership for destructive operations — users can only edit or delete resources they created, unless they're admins. I store roles and permissions in the JWT for fast reads, but I re-check the database for sensitive operations to catch permission changes that happen during a session.

**Q: What's the difference between role-based and permission-based access control?**

Role-based access control (RBAC) ties permissions to user roles like admin, editor, or viewer. It's simple and easy to understand — if you're an admin, you can do everything. Permission-based access control (PBAC) gives users explicit permission strings like `post:write` or `user:delete` instead of broad roles. RBAC is great for simple apps with clear role boundaries. PBAC is better for complex apps where you need fine-grained control — like a user who can delete posts but not users, or who can edit their own profile but not others. In practice, I often use both: roles for default permissions and individual permission overrides for special cases.

**Q: How do you implement resource-level permissions?**

I create a `requireOwnership` middleware that fetches the resource from the database using the ID from the request params. If the resource doesn't exist, I return 404 to avoid leaking information. If it does exist, I compare the resource's `authorId` or `ownerId` with `req.user.id`. If they match, or if the user is an admin, I attach the resource to `req` and call `next()`. Otherwise, I return 403. Attaching the resource to `req` is important because it prevents the handler from fetching the same resource again — this saves a database query and keeps the code DRY. For shared resources like team projects, I check team membership instead of direct ownership by fetching the team document and verifying the user's ID is in the members array.

**Q: How do you handle permission inheritance?**

I define a hierarchy map where higher-level permissions imply lower-level ones. For example, `post:delete` implies `post:write` and `post:read`, and `post:write` implies `post:read`. When checking permissions, I look for direct matches first, then check if any of the user's permissions imply the required one through the hierarchy. For roles, I assign numeric levels like admin=3, editor=2, viewer=1, and check if the user's level meets or exceeds the minimum required level. This makes it easy to add new roles or permissions without updating every route handler — I just add the new role to the hierarchy map and the checks work automatically.

**Q: How do you test permissions?**

I test permissions using a matrix approach — for each endpoint, I test every combination of user type and resource ownership. I test: no authentication (expect 401), wrong role or permission (expect 403), correct role but not the owner (expect 403), correct role and owner (expect 200), and admin accessing any resource (expect 200). I mock `jwt.verify()` to simulate different user types and use supertest to make HTTP requests. Permission bugs are almost always in the denial paths, so I focus on making sure unauthorized users are properly blocked. I also test permission changes mid-session by mocking the database to return different permissions after the JWT was issued, ensuring that sensitive operations re-check the database instead of trusting the stale JWT.

## 6. The Traps — What Goes Wrong in Production

**Only checking roles, not ownership**

This is the most common and dangerous mistake. If you only check that a user is an "editor" before letting them delete a post, any editor can delete any post — including posts they don't own. This leads to data destruction and angry users. Always check both role and ownership for destructive operations.

**Returning 403 instead of 404 for non-existent resources**

When an unauthorized user tries to access a resource that doesn't exist, returning 403 tells them the resource exists but they can't see it. This leaks information. Return 404 instead — pretend the resource doesn't exist at all. The only exception is when you want to explicitly tell authorized users they lack access, but even then, 404 is often safer.

**Fetching the resource twice**

A common pattern is fetching the resource in the ownership middleware, then fetching it again in the route handler. This doubles your database load. Attach the resource to `req` in the middleware so the handler can use `req.resource` directly. This is both faster and keeps your code DRY.

**Storing permissions in JWT without database re-checks**

If you bake permissions into the JWT and never re-check the database, a user whose permissions were revoked will continue to have access until their token expires. This is a security risk for sensitive operations. Store permissions in the JWT for fast reads on non-sensitive endpoints, but always re-check the database for deletes, permission changes, and other destructive actions.

**Hardcoding permission checks in every route**

Writing `if (role === 'admin' || role === 'editor')` in every route handler makes your code brittle. When you add a new role, you have to update every check. Use middleware factories and hierarchy systems instead. Centralize your permission logic so adding a new role or permission is a one-line change in a single file.

**Forgetting to test the denial paths**

Most developers test the happy path — an authorized user accessing their own resource. Permission bugs almost always happen in the denial paths. Make sure you test that unauthorized users are actually blocked, not just that authorized users are allowed.

**Not handling team and shared resources**

If your app has team projects or shared documents, checking individual ownership isn't enough. You need to check team membership or organization access. Forgetting this means collaborators can't access resources they should be able to, or worse, people can access shared resources they shouldn't.

## 7. Compare With Related Concepts

**Permissions vs Authentication**

Authentication is about identity — proving who you are. Permissions are about authorization — proving what you're allowed to do. Authentication always comes first. You can't check permissions until you know who the user is. In Express, this means your authentication middleware runs before any permission middleware.

**RBAC vs ABAC (Attribute-Based Access Control)**

RBAC uses roles like admin or editor. ABAC uses attributes like department, location, or time of day. RBAC is simpler and works for most apps. ABAC is more flexible but more complex — you might allow access only if the user is in the sales department, accessing during business hours, from a corporate IP. Most MERN apps don't need ABAC unless they have complex regulatory requirements.

**Middleware-based vs Inline Permission Checks**

Middleware-based checks are reusable and composable — you write the check once and apply it to any route. Inline checks are written directly in the route handler. Middleware is better for most cases because it keeps your route handlers clean and makes permission logic easy to test. Inline checks are only appropriate for one-off permissions that don't apply anywhere else.

**Backend Permissions vs Frontend Permission UI**

Backend permissions are the real security boundary. Frontend permission UI — hiding buttons, disabling menus — is just UX. Never rely on frontend checks for security. A user can always open the browser dev tools and make API calls directly. The backend must enforce permissions regardless of what the frontend shows.

## 8. 🧠 The Memory Hook

**Permissions are layers of keys: first prove who you are (auth), then show your role badge, then your specific permission slip, then the key to the specific resource you're trying to touch. Each layer can stop you — and each layer must be checked.**
