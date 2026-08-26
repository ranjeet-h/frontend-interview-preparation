# How do you protect frontend routes

## 1. The Real-World Problem — When You Actually Hit This

An `/admin` page is hidden from normal users, so the team assumes it is protected. Then a user opens DevTools and sends `GET /api/admin/users` directly. If Express only checked whether a React page rendered, the request can still return private data. A second failure appears on refresh: the app briefly treats an unknown session as logged out, redirects to `/login`, and then sends the user back after the session check finishes.

The fix has two separate jobs. React protects navigation and avoids confusing flashes. Express authenticates and authorizes every request, including requests made without the React app.

## 2. The Analogy — Make the Mechanic Obvious

Think of a hotel. The lobby sign says which floors a guest may visit, and the elevator can guide them away from restricted floors. That is the frontend guard: useful for navigation, but visible code that a guest can ignore.

The room lock checks the guest's key every time the door opens. That is Express middleware. It verifies the credential and the permission for this exact resource. A lobby sign improves the experience; only the lock protects the room.

## 3. The Full Explanation — How It Actually Works

On application startup, the client must represent three states, not two: session check in progress, authenticated, and unauthenticated. While the session is unknown, render a stable loading shell. Once `/api/auth/me` succeeds, render the requested route; on a `401`, redirect to login and preserve the original path.

Use an HTTP-only refresh cookie when possible. The browser sends it to a refresh endpoint, which can issue a short-lived access token or establish a server-recognized session. Do not trust `localStorage.isAdmin`; the user can edit it. The server's `/api/auth/me` response is the source for display decisions such as `user.role`.

For a role route, the client can avoid loading an admin bundle for a non-admin user, but that check is only an optimization. The API must independently run authentication, authorization, and resource-level checks. For example, `requireRole("admin")` answers "may this user use this endpoint?" while an ownership check answers "may this user use this particular record?"

An API should make these outcomes distinct: `401 Unauthorized` means there is no valid identity, `403 Forbidden` means the identity lacks permission, and `404 Not Found` is often appropriate when revealing that a resource exists would leak information. The client should treat a `401` as a session problem, not as proof that a user is an admin or not an admin.

## 4. See It In Practice — Real Code or Queries

This React Router data-router example resolves the session before the protected element renders. The loader's promise makes the loading state explicit through `RouterProvider`'s fallback, and the redirect preserves the requested URL.

```jsx
// client/src/auth/session.js
export async function getCurrentUser() {
	const response = await fetch("/api/auth/me", {
		credentials: "include",
		headers: { Accept: "application/json" },
	});

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

async function requireUser({ request }) {
	const user = await getCurrentUser();
	if (!user) {
		const requestedUrl = new URL(request.url);
		const returnTo = `${requestedUrl.pathname}${requestedUrl.search}`;
		const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//")
			? returnTo
			: "/dashboard";
		throw redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
	}
	return user;
}

function ProtectedLayout() {
	const user = useLoaderData();
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

In a real app, the admin page may render a loading boundary while its data request is pending, but it must still handle an API denial. A guard is not a substitute for checking the response:

```js
export async function loadAdminUsers() {
	const response = await fetch("/api/admin/users", {
		credentials: "include",
		headers: { Accept: "application/json" },
	});

	if (response.status === 401) throw new Error("sign-in-required");
	if (response.status === 403) throw new Error("admin-role-required");
	if (!response.ok) throw new Error("admin-users-request-failed");
	return response.json();
}
```

Express remains the security boundary. The authentication middleware verifies the session or token; the role middleware checks the verified identity; the handler applies any record-level rule and returns only fields the caller needs.

```js
// server/routes/admin.js
import express from "express";
import { User } from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/users", requireAuth, requireRole("admin"), async (req, res, next) => {
	try {
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

The API contract is deliberately small: `/api/auth/me` returns the server-derived user or `401`; protected resources return `401` for no identity and `403` for insufficient permission. A cookie-based design also needs CSRF protection for state-changing requests, such as an origin check or CSRF token, because cookies are sent automatically.

## 5. Interview Questions — All of Them, Done Properly

**Q: Is a React protected route a security feature?**

It is a navigation and presentation feature. It prevents guests from reaching screens through normal client navigation and prevents flashes while auth is loading. It cannot stop a caller from constructing an HTTP request, editing JavaScript, or calling an API from another client. Express must verify identity and permission on every protected endpoint.

**Q: How do you avoid redirecting users incorrectly on a page refresh?**

Represent session restoration as a loading state. Resolve `/api/auth/me` before rendering protected content or let a route loader do that work. Render a stable loading shell while the result is unknown; redirect only after the server has returned `401`. Preserve the original path so successful login can return the user to it.

**Q: Where should the frontend get the user's role?**

From a server response such as `/api/auth/me`, not from a client-controlled flag. The frontend can use the role to choose navigation and lazy loading, but the server must derive it from a verified session and check it again for every request.

**Q: What is the difference between `401` and `403` here?**

`401` means the request did not establish a valid identity, so the client may start login or session refresh. `403` means the identity is known but lacks the required permission, so repeatedly refreshing the token will not grant access.

**Q: Should admin routes be code-split?**

Usually yes, because it reduces the initial bundle and avoids downloading screens most users never visit. It is not a security boundary: downloaded code and hidden links do not protect admin data. Authorization still belongs in Express.

## 6. The Traps — What Goes Wrong in Production

**Only guarding the React route.** A caller can bypass the UI with curl, a script, or a modified client. Put authentication and authorization middleware on the API route itself, then test the endpoint without the browser UI.

**Treating "session unknown" as "logged out."** A refresh can race the first render and cause a login flash or a lost deep link. Use an explicit loading state or a router loader and redirect only after the auth request completes.

**Trusting `localStorage` or a JWT payload without verification.** Both are client-readable, and a decoded token is not a verified token. Let the server verify the credential and use its identity and role for the authorization decision.

**Checking a role but not ownership.** A logged-in user may still request another user's invoice by changing an ID in the URL. After authentication and broad role checks, authorize the specific resource and query it with the caller's ownership constraint where possible.

**Returning the same response for every failure.** Treating `401`, `403`, and transient `5xx` errors as "go to login" creates loops and hides outages. Keep the client behavior aligned with the API contract.

**Using cookies without considering CSRF.** An HTTP-only cookie blocks JavaScript from reading the cookie, but it does not stop a malicious site from causing the browser to send it. Protect mutations with an appropriate CSRF defense and configure `SameSite`, `Secure`, CORS, and allowed origins deliberately.

**Putting tokens in redirect URLs.** Query strings can appear in browser history, logs, and analytics. Put only a validated return path in `returnTo`, and keep credentials in cookies or headers according to the chosen auth design.

## 7. Compare With Related Concepts

**Frontend guard vs Express authorization:** the guard controls what the current UI renders; Express controls whether a request is allowed. Use both, but trust only the server for security.

**Authentication vs authorization:** authentication answers "who is this?" Authorization answers "may this identity perform this action on this resource?" Run them in that order.

**Role-based access vs ownership-based access:** roles handle broad capabilities such as admin versus member. Ownership or policy checks handle row-level rules such as "only the invoice owner may read it." Use both when a role alone is too broad.

**HTTP-only cookie vs browser storage token:** an HTTP-only cookie is harder for injected JavaScript to steal, but it introduces CSRF considerations. A token in memory or browser storage avoids automatic sending, but storage and XSS exposure require careful handling. Choose the complete threat model, not just the storage location.

**Route loader vs component guard:** a loader can block route data and rendering until auth is known; a component guard can be simpler in a declarative router. Either improves UX only; neither replaces API authorization.

## 8. 🧠 The Memory Hook — What Sticks

The React guard is the hotel's lobby sign: it guides guests and prevents an awkward flash. Express middleware is the room lock: it checks every request, even when the guest walks around the lobby entirely. A sign can improve UX, but only the lock enforces access.
