# How do you protect frontend routes

## 1. The Real-World Problem — When You Actually Hit This

Your MERN app has an admin dashboard at `/admin` that regular users should never see. In development, everything looks fine — the admin link only appears for users with the admin role, and clicking it shows the admin panel. Then one day in production, a regular user opens Chrome DevTools, goes to the Network tab, and manually sends `GET /api/admin/users`. The server returns a JSON list of every user's email and role because you only protected the React route, not the API endpoint.

A second problem shows up on page refresh. When a logged-in admin refreshes `/admin`, the app briefly flashes the login screen before the session check finishes and redirects them back. This creates a jarring experience and can break deep links that users share.

The real issue is that frontend route protection and backend authorization are two different problems. React can improve the user experience, but Express is the only thing that can actually stop a malicious request.

## 2. The Analogy — Make the Mechanic Obvious

Think of a hotel. The lobby has a sign that says "Pool on floor 3, gym on floor 4, rooftop bar restricted to guests only." An elevator might even have buttons that only light up for your floor. That's your React router guard — it guides the guest to the right place and prevents them from accidentally walking into a restricted area through normal navigation.

But the actual door to each room has a physical lock. Every time someone tries to open a door, the lock checks their key card. That's your Express middleware. It doesn't matter if the guest ignored the lobby sign, took the stairs instead of the elevator, or climbed through a window — the lock still checks the key before the door opens.

The lobby sign makes the hotel pleasant to use. The lock makes it secure. You need both, but only the lock actually protects anything.

## 3. The Full Explanation — How It Actually Works

Frontend route protection in React is about three things: preventing accidental navigation, avoiding confusing loading states, and optimizing bundle loading. It is not about security.

When your app starts, the user's session could be in one of three states: still loading from the server, authenticated, or unauthenticated. Most React apps only handle two states — logged in or logged out — and that's where the refresh flash comes from. The app renders, doesn't immediately know the session state, assumes logged out, redirects to login, then the session check finishes and redirects back. The fix is to explicitly represent "loading" as a third state and render a stable loading skeleton while you wait for `/api/auth/me` to respond.

React Router v6 data routers make this pattern easier. A loader function runs before the route renders, so you can check the session and redirect before the component even mounts. This gives you a clean loading state through the router's fallback UI and lets you preserve the original URL as a `returnTo` parameter so the user lands back where they started after login.

For role-based routes like `/admin`, React can avoid loading the admin bundle for non-admin users. This is a performance optimization, not a security feature. The admin JavaScript is still in your build output — someone could download it manually if they wanted to. The real security check happens on the server.

Express middleware is where the actual protection lives. Every protected endpoint needs at least two checks: authentication first, then authorization. Authentication answers "who is this?" by verifying a session cookie, JWT, or other credential. Authorization answers "is this person allowed to do this specific thing?" by checking their role, their ownership of the resource, or both.

Your API should return different status codes for different failures. A `401 Unauthorized` means "I don't know who you are" — the client should prompt for login or refresh the session. A `403 Forbidden` means "I know who you are, but you're not allowed here" — refreshing the token won't help, the user genuinely lacks permission. A `404 Not Found` is sometimes appropriate for sensitive resources — revealing that a resource exists can itself leak information.

If you use HTTP-only cookies for session management, you also need CSRF protection. The browser automatically sends cookies with requests, so a malicious site could trick the user's browser into sending a request to your API. Protect state-changing requests with CSRF tokens, SameSite cookie attributes, origin checks, or double-submit cookies.

## 4. See It In Practice — Real Code or Queries

Here's a React Router v6 data router setup that checks the session before rendering protected routes. The loader waits for the auth check, so the router can show a loading fallback while the request is in flight:

```jsx
// client/src/auth/session.js
export async function getCurrentUser() {
	const response = await fetch("/api/auth/me", {
		credentials: "include", // Send HTTP-only cookies
		headers: { Accept: "application/json" },
	});

	// 401 means no valid session — return null, not an error
	if (response.status === 401) return null;
	if (!response.ok) throw new Error("Could not restore the session");
	return response.json();
}
```

```jsx
// client/src/routes.js
import {
	createBrowserRouter,
	Navigate,
	Outlet,
	redirect,
	useLoaderData,
} from "react-router-dom";
import { getCurrentUser } from "./auth/session";

// This loader runs before any protected route renders
async function requireUser({ request }) {
	const user = await getCurrentUser();
	if (!user) {
		// Preserve the original URL so we can redirect back after login
		const requestedUrl = new URL(request.url);
		const returnTo = `${requestedUrl.pathname}${requestedUrl.search}`;
		// Prevent open redirect attacks by validating the path
		const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//")
			? returnTo
			: "/dashboard";
		throw redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
	}
	return user;
}

function ProtectedLayout() {
	const user = useLoaderData();
	// Pass user to child routes via context
	return <Outlet context={{ user }} />;
}

export const router = createBrowserRouter([
	{ path: "/login", element: <LoginPage /> },
	{
		element: <ProtectedLayout />,
		loader: requireUser,
		children: [
			{ path: "/dashboard", element: <Dashboard /> },
			{ path: "/admin", element: <AdminPage /> },
		],
	},
	{ path: "*", element: <Navigate to="/dashboard" replace /> },
]);
```

The admin page itself should still handle API failures. Even if the route loader passed, the user's session could expire while they're on the page, or they might not have admin role for specific operations:

```js
// client/src/features/admin/api.js
export async function loadAdminUsers() {
	const response = await fetch("/api/admin/users", {
		credentials: "include",
		headers: { Accept: "application/json" },
	});

	// Distinguish between session issues and permission issues
	if (response.status === 401) throw new Error("sign-in-required");
	if (response.status === 403) throw new Error("admin-role-required");
	if (!response.ok) throw new Error("admin-users-request-failed");
	return response.json();
}
```

On the Express side, middleware handles the actual security. The authentication middleware verifies the session, the role middleware checks permissions, and the handler applies any resource-specific rules:

```js
// server/middleware/auth.js
export function requireAuth(req, res, next) {
	// This assumes you have session middleware that sets req.user
	if (!req.user) {
		return res.status(401).json({ error: "Authentication required" });
	}
	next();
}

export function requireRole(role) {
	return (req, res, next) => {
		if (!req.user || req.user.role !== role) {
			return res.status(403).json({ error: "Insufficient permissions" });
		}
		next();
	};
}
```

```js
// server/routes/admin.js
import express from "express";
import { User } from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// This endpoint is protected by both auth and role middleware
router.get("/users", requireAuth, requireRole("admin"), async (req, res, next) => {
	try {
		// Only return the fields the client actually needs
		const users = await User.find({}, "email role")
			.sort({ _id: 1 })
			.limit(100)
			.lean();
		res.json({ data: users });
	} catch (error) {
		next(error);
	}
});

export default router;
```

For resources that belong to specific users, add ownership checks after role checks:

```js
// server/routes/invoices.js
router.get("/invoices/:id", requireAuth, async (req, res, next) => {
	try {
		// Even authenticated users can only see their own invoices
		const invoice = await Invoice.findOne({
			_id: req.params.id,
			userId: req.user._id, // Ownership constraint
		});

		if (!invoice) {
			// Return 404 instead of 403 to avoid leaking that the invoice exists
			return res.status(404).json({ error: "Invoice not found" });
		}

		res.json({ data: invoice });
	} catch (error) {
		next(error);
	}
});
```

If you're using cookies, configure CSRF protection for state-changing requests:

```js
// server/middleware/csrf.js
import csrf from "csurf";

// Use double-submit cookie pattern for CSRF protection
const csrfProtection = csrf({ cookie: true });

export function csrfMiddleware(req, res, next) {
	// Skip CSRF for GET requests and API reads
	if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
		return next();
	}
	csrfProtection(req, res, next);
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Is a React protected route a security feature?**

No, it's a UX feature. It prevents users from accidentally navigating to protected pages through the normal UI and avoids loading screens they can't use. But anyone can open DevTools, construct an HTTP request directly to your API, or write a script that calls your endpoints. React runs on the client, so the user has full control over it. Express middleware on the server is the only place where you can reliably enforce security rules.

**Q: How do you avoid the login flash on page refresh?**

The flash happens because your app renders before it knows the session state. Fix this by representing three states instead of two: loading, authenticated, and unauthenticated. Either check the session before rendering the app, or use React Router's loader functions to block route rendering until the auth check completes. Show a stable loading skeleton while the request is in flight, and only redirect after the server definitively returns a 401.

**Q: Where should the frontend get the user's role from?**

From the server, never from client storage. Call an endpoint like `/api/auth/me` on app startup and use that response to populate your auth state. The frontend can use the role for UI decisions like which links to show or which bundles to lazy-load, but the server must derive the role from a verified session and check it again on every request. Never trust `localStorage.isAdmin` or a decoded JWT payload — the user can edit both.

**Q: What's the difference between 401 and 403 in this context?**

401 means "I don't know who you are" — there's no valid session or token. The client should prompt the user to log in or refresh their session. 403 means "I know who you are, but you're not allowed to do this" — the session is valid but the user lacks the required role or permission. Repeatedly refreshing the token won't fix a 403; the user genuinely doesn't have access.

**Q: Should admin routes be code-split?**

Yes, but for performance, not security. Code-splitting reduces the initial bundle size by not downloading admin code for regular users. But the split JavaScript is still in your build output — someone could download it manually if they wanted to. Security comes from server-side authorization, not from which JavaScript files the browser loads.

**Q: Do you need CSRF protection if you use HTTP-only cookies?**

Yes. HTTP-only cookies prevent JavaScript from reading the cookie, which protects against XSS token theft. But the browser still automatically sends the cookie with every request to your domain, including requests triggered by malicious sites. CSRF protection like SameSite cookies, CSRF tokens, or origin checks prevents those cross-site requests from being accepted.

## 6. The Traps — What Goes Wrong in Production

**Only protecting the React route.** This is the most common security mistake. Anyone can call your API directly with curl, Postman, or a script. If your Express endpoint doesn't have authentication and authorization middleware, it's not protected. Test every protected endpoint by calling it directly without the browser UI.

**Treating "session unknown" as "logged out."** On refresh, the app might render before the session check finishes, causing a brief flash of the login screen or a broken deep link. Always represent session restoration as a loading state and redirect only after you have a definitive answer from the server.

**Trusting localStorage or a decoded JWT.** Both are completely under the user's control. They can open DevTools and change `localStorage.isAdmin` to `true` or modify a JWT payload. The server must verify every credential and derive the user's identity and role from that verification, not from what the client claims.

**Checking role but not ownership.** An authenticated user with the right role might still try to access someone else's data by changing an ID in the URL. After checking authentication and role, always authorize the specific resource — for example, ensure the invoice's `userId` matches the authenticated user's ID.

**Returning the same error for everything.** If you treat 401, 403, and 500 errors the same way, you create confusing UX. A user with an expired session gets "go to login" when they should get "session expired, please refresh." A user who genuinely lacks permission gets stuck in a login loop. Align client behavior with the actual HTTP status codes.

**Using cookies without CSRF protection.** HTTP-only cookies protect against XSS but not against CSRF. A malicious site can trick the user's browser into sending a cookie-backed request to your API. Protect state-changing operations with CSRF tokens, SameSite=Strict/Lax cookies, origin checks, or double-submit cookies.

**Putting tokens in redirect URLs.** Anything in a URL query parameter can end up in browser history, server logs, analytics tools, or referrer headers. Never put tokens or secrets in `returnTo` or other redirect parameters. Use only the path you want to return to, and keep credentials in cookies or headers.

**Revealing resources with 403 instead of 404.** Returning 403 for a private resource tells an attacker that the resource exists. For sensitive data like user profiles or private documents, return 404 instead — this makes it harder to enumerate resources.

## 7. Compare With Related Concepts

**Frontend guard vs backend authorization:** The frontend guard controls what the current UI renders and provides a better user experience. Backend authorization controls whether a request is allowed and is the actual security boundary. Use both, but only trust the backend for security decisions.

**Authentication vs authorization:** Authentication is about identity — "who is this?" Authorization is about permission — "may this person do this thing?" Always authenticate first, then authorize. You can't authorize someone you don't know.

**Role-based access vs ownership-based access:** Roles handle broad permissions like "admin can do anything." Ownership handles row-level permissions like "users can only see their own data." Use both when appropriate — a user might have the right role to access invoices, but should only see their own invoices.

**HTTP-only cookies vs storage tokens:** HTTP-only cookies are harder for XSS attacks to steal, but they're automatically sent with requests, which requires CSRF protection. Tokens in memory or localStorage don't auto-send, which avoids CSRF, but they're vulnerable to XSS and require careful storage and refresh logic. Choose based on your threat model, not just convenience.

**Route loaders vs component guards:** Route loaders in React Router v6 run before rendering, which gives you a clean loading state and prevents the component from mounting at all. Component guards run inside the component, which can be simpler but may cause a brief render before redirecting. Both are UX improvements; neither replaces backend authorization.

**Session-based auth vs token-based auth:** Sessions store the user ID on the server and send a cookie reference. Tokens store the user ID and claims in the token itself. Sessions are easier to revoke (just delete the server record) but require server storage. Tokens are stateless and scale horizontally but are harder to revoke and must be carefully validated.

## 8. 🧠 The Memory Hook — What Sticks

The React guard is the hotel lobby sign — it guides guests politely and prevents awkward moments. The Express middleware is the room lock — it checks the key every single time, even if someone ignored the sign and climbed through the window. Use the sign for UX, but only the lock for security.
