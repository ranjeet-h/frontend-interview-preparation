# React Routing

## 1. Why This Exists — The Problem First

Imagine a dashboard where every screen is just a component selected by a few booleans: `showUsers`, `showSettings`, and `showUserDetails`. It may work during the first demo, but a refresh loses the current screen, a copied link cannot open the same view, and the browser Back button has no meaningful history to follow. Soon filters, selected records, authentication, loading states, and code splitting are all being reinvented around those booleans.

Routing gives navigation a durable address. A URL such as `/app/users/42?tab=roles` describes enough of the UI location for another browser, a bookmark, or the Back button to reproduce it: that is the URL-to-UI mapping. The router then coordinates the URL, the rendered component tree, data loading, and navigation history instead of making each page guess what the application means.

## 2. The Analogy — Make It Obvious

Think of a hotel with a front desk and a floor plan. The guest gives the front desk an address: “building app, floor users, room 42, with the roles view selected.” The front desk matches that address to a route, the hotel’s shared shell stays in place, and the room-specific content is put into the correct room slot.

The mapping is direct:

- The browser URL is the guest’s requested address.
- The route table is the hotel floor plan: static segments identify known areas, while `:userId` is a room number that can vary.
- A layout route is the building shell—navigation, header, and authorization boundary remain mounted while child content changes.
- An outlet is the room slot where the matched child page appears.
- A query string is a note attached to the address, such as “show roles” or “page 3.” It changes the view without usually identifying a different resource.
- A redirect is the front desk sending the guest to another address, for example from `/` to `/app` or from an unauthenticated private address to `/login`.
- A not-found route is the hotel’s answer when no room exists.
- Browser history is the guest’s sequence of addresses; Back and Forward revisit entries rather than merely toggling React state.

This is why routing is larger than “render component A for path B.” It is an address-matching system, a UI composition system, and a navigation/data lifecycle around that address.

## 3. How It Actually Works — The Full Explanation

The examples below assume React 18+ and React Router 7.x in Data mode. This version choice matters: `route.lazy` was introduced in React Router 6.9.0, while the replacement redirect utility is imported from `react-router`; the DOM `RouterProvider` is imported from `react-router/dom`. The same URL ideas apply to other routers, but loader, action, lazy-module, and error-boundary APIs differ by library and version.

**URL matching produces a branch.**

For `/app/users/42?tab=roles`, the router compares the pathname `/app/users/42` with route patterns. A route such as `app` matches the first segment, `users/:userId` matches the next two, and the dynamic segment produces `{ userId: "42" }`. The query string is not normally part of path matching; it is read separately as `tab=roles`.

The result is a branch of matched routes, not one isolated component. A parent route can render the application shell, its child can render a users layout, and the deepest match can render the user details page. Each matched layout renders an `<Outlet />` where its child branch belongs.

**Client-side navigation changes the location without replacing the document.**

With a browser router, clicking a router `<Link>` or calling `navigate()` prevents the browser’s default full-document request. The router updates the History API, usually with `history.pushState` for a new entry or `history.replaceState` when the current entry should be replaced. React then re-renders the branch matched by the new location.

The server is still involved on a hard load. A request for `/app/users/42` must return the SPA entry document, commonly `index.html`, so the client router can take over. Hosting must therefore configure a history fallback. Without it, in-app navigation works but refreshing a deep link returns a server 404. Hash routing (`/#/app/users/42`) avoids that server fallback requirement because the fragment is not sent in the HTTP request, but it gives up clean URLs and can complicate SEO and integrations.

**Parameters identify resources; query parameters describe a view.**

Route parameters are named parts of the path:

```tsx
// /users/42
{ path: "users/:userId", element: <UserDetails /> }
```

`useParams()` reads `userId`, which is normally required to locate a particular resource. Query parameters follow `?` and can be repeated or optional:

```tsx
// /users?status=active&page=2
const [searchParams, setSearchParams] = useSearchParams();
const status = searchParams.get("status") ?? "all";
const page = Number(searchParams.get("page") ?? "1");
```

Both are strings at the URL boundary. Parse and validate numbers, enums, and dates before using them. A route parameter usually means “which entity or route is this?” A query parameter usually means “how should this collection or page be viewed?” That is a convention, not a law: choose the shape that makes links understandable and stable.

URL state is different from ephemeral component state. A selected tab, filter, sort order, pagination cursor, or shareable search term belongs in the URL when it should survive refresh, be bookmarkable, be shared, or participate in Back/Forward. A temporary tooltip-open flag, uncontrolled draft, hover state, or animation phase usually belongs in a component because exposing it in the address would create noisy history and an awkward public contract. URL state is serialized, user-visible navigation state; component state is private, in-memory interaction state.

**Nested layouts preserve shared UI.**

Nested routes let a stable parent own common UI and let children own only the changing area:

```tsx
function AppLayout() {
  return (
    <>
      <GlobalNav />
      <main>
        <Outlet />
      </main>
    </>
  );
}
```

The parent route remains part of the matched branch as the child changes from dashboard to users. This reduces duplication and gives the router a natural place for shared loaders, error boundaries, breadcrumbs, and authorization checks.

**Redirects and not-found handling are explicit outcomes.**

A redirect can happen during a loader, after a form action, or in a component when a condition is known. Use `replace` for a canonicalization or guard where leaving the invalid/private location in history would be unhelpful; use a normal push when the user should be able to go Back to the previous address.

Not-found handling has two cases. A route with `path: "*"` catches a URL for which no route matched. A valid route can also return a resource-level 404 when `/users/999` matches the pattern but user 999 does not exist. Those should render different messages: “this page does not exist” versus “this requested resource was not found.”

**UI protection is not authorization.**

A protected route can decide whether to render a private screen:

```tsx
function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  if (auth.status === "loading") return <FullPageSpinner />;
  if (auth.status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
```

This improves user experience, but it is not a security boundary. A user can call an API directly, alter JavaScript, or construct a request without visiting the UI. Every protected API operation must authenticate the request and authorize the user for that resource on the server. Role checks in route elements are useful for navigation and early feedback; server checks decide whether the operation is allowed.

Be careful while authentication is unknown. Redirecting immediately because `user` is temporarily `null` creates a login flash and can discard the intended destination. Model `loading`, `authenticated`, and `anonymous` separately, and only redirect after the identity check has settled.

**Data loading and lazy modules follow the route.**

A data router can start a route loader when its branch is about to render. The loader can fetch the data needed by that route, expose pending UI, and surface errors through a route error boundary. A loader is a navigation-owned data dependency, not a reason to manually synchronize every URL change in an effect.

Lazy route modules split code at the route boundary. The dashboard bundle need not contain the settings screen if settings is loaded with `lazy: () => import("./routes/settings")`. Code splitting and data loading solve different problems: the dynamic import delays JavaScript; the loader obtains runtime data. A fast application often prefetches either one on an intentional hover or link visibility signal, but should measure the trade-off rather than eagerly loading every route.

**Browser history is part of the product behavior.**

`push` creates a new history entry; `replace` changes the current entry. A filter that updates on every keystroke with `push` can make Back press through every character. A search experience may debounce updates, use `replace` while typing, and use `push` when the user submits. A modal represented by a query parameter can be closed with Back because its visibility is a navigable state; a tooltip should not be.

The router listens to `popstate` so Back and Forward cause the UI to match the restored URL. It cannot restore arbitrary in-memory component state after a refresh, so values that matter across navigation must either be in the URL, persisted storage, or server state.

## 4. Real Code — See It Working

This is a compact React Router 7.x Data-mode example. It uses a parent layout, an auth loader, a dynamic resource route, query state, lazy modules, a replacement redirect, a resource-level 404, and a catch-all page.

```tsx
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Link,
  Outlet,
  replace,
  useLoaderData,
  useNavigation,
  useParams,
  useRouteError,
  useSearchParams,
} from "react-router";
import { RouterProvider } from "react-router/dom";
import { createRoot } from "react-dom/client";

type User = { id: string; name: string; roles: string[] };
type Session = { id: string };

// These local values make the example runnable without a backend or extra files.
const USERS: Record<string, User> = {
  "42": { id: "42", name: "Ada Lovelace", roles: ["reader", "admin"] },
};

async function getSession(): Promise<Session | null> {
  return { id: "demo-session" };
}

async function requireUser() {
  const session = await getSession();
  if (!session) {
    // replace() uses history.replaceState, so Back does not return to a page the user cannot use.
    throw replace(`/login?returnTo=${encodeURIComponent(location.pathname)}`);
  }
  return session;
}

async function userLoader({ params }: { params: Record<string, string | undefined> }) {
  const user = params.userId ? USERS[params.userId] : undefined;
  if (!user) {
    throw new Response("User not found", { status: 404 });
  }
  return user;
}

function GlobalNav() {
  return (
    <nav>
      <Link to="/app">Dashboard</Link>{" "}
      <Link to="/app/users/42">User 42</Link>{" "}
      <Link to="/app/settings">Settings</Link>
    </nav>
  );
}

function AppLayout() {
  const navigation = useNavigation();
  return (
    <>
      <nav><Link to="/app">Dashboard</Link> <Link to="/app/users/42">User 42</Link></nav>
      {navigation.state !== "idle" && <p aria-live="polite">Loading next screen…</p>}
      <Outlet />
    </>
  );
}

function UserDetails() {
  const user = useLoaderData() as User;
  const { userId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "roles" ? "roles" : "profile";

  function selectTab(nextTab: "profile" | "roles") {
    // This state is shareable and Back/Forward-worthy, so it belongs in the URL.
    setSearchParams({ tab: nextTab });
  }

  return (
    <section>
      <h1>{user.name} ({userId})</h1>
      <button onClick={() => selectTab("profile")}>Profile</button>
      <button onClick={() => selectTab("roles")}>Roles</button>
      {tab === "roles" ? <p>{user.roles.join(", ")}</p> : <p>Profile details</p>}
    </section>
  );
}

function Dashboard() {
  return <p>Dashboard. Open <Link to="/app/users/42">Ada’s profile</Link>.</p>;
}

function Settings() {
  return <p>Settings</p>;
}

function LoginPage() {
  return <p>Login page</p>;
}

function NotFound() {
  return <p>That page does not exist.</p>;
}

function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <p>The requested user was not found.</p>;
  }
  return <p>Something went wrong while loading this route.</p>;
}

// In production these can be () => import("./routes/dashboard"); local functions keep this file self-contained.
const lazyDashboard = async () => ({ Component: Dashboard });
const lazySettings = async () => ({ Component: Settings });
const lazyLogin = async () => ({ Component: LoginPage });

const router = createBrowserRouter([
  {
    path: "/app",
    loader: requireUser,
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: lazyDashboard },
      { path: "users/:userId", loader: userLoader, element: <UserDetails /> },
      { path: "settings", lazy: lazySettings },
    ],
  },
  { path: "/login", lazy: lazyLogin },
  { path: "*", element: <NotFound /> },
]);

// The host page only needs <div id="root"></div>; this mounts the router in a normal React app.
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
```

The local session and data table keep this block independently runnable in a React Router 7.x TypeScript app; replace them with the real session and API in production. The local `lazy*` functions show the route-module contract without requiring omitted files; production code can swap them for dynamic imports. The host must still return the SPA entry document for non-API deep links. `defer` is useful when a route can render its shell before all data arrives, but it is not needed for every loader. The important design is the ownership: the URL selects the branch, the loader owns route data, the layout owns shared chrome, and the server owns authorization.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is client-side routing?**

It is matching the current browser location to a React component tree and changing that tree without requesting a new HTML document for every navigation. The router still updates the History API and may fetch route code or data. A hard refresh remains a server request, which is why browser-history deployments need an SPA fallback to `index.html`.

**Q: How does a router turn `/users/42` into a page?**

It compares the pathname with route patterns, selects the matching branch, extracts `42` into the `userId` parameter, runs any route data dependencies, and renders the matched elements from parent to child. Nested elements appear through each parent’s `<Outlet />`. A query such as `?tab=roles` is parsed separately and normally does not change which path pattern matches.

**Q: What is the difference between browser routing and hash routing?**

Browser routing uses the History API and clean paths such as `/settings`; the server must serve the application entry point for those paths. Hash routing stores the route after `#`, which the browser does not send to the server, so it works on simpler static hosting without a fallback. Choose browser routing when clean URLs, normal server observability, and SEO integration matter; choose hash routing when deployment constraints outweigh those benefits.

**Q: When should a value be a route parameter instead of a query parameter?**

Use a route parameter for a required identity or hierarchy, such as `/projects/:projectId/issues/:issueId`. Use a query parameter for optional representation or collection controls, such as `/issues?status=open&sort=oldest`. The rule is to make the URL read like an address: path segments identify what is being viewed, while the query describes how it is being viewed.

**Q: Why use nested routes?**

They let a parent own stable UI and shared behavior while a child changes inside an outlet. That prevents duplicated navigation shells and gives the parent a place for shared loading, errors, breadcrumbs, and access checks. Nested routes are a composition boundary, not merely a folder naming convention.

**Q: How do protected routes work, and are they secure?**

A UI guard waits for auth state, renders a loading state while identity is unknown, redirects anonymous users, and renders the private branch for an authenticated user. It is not security: a caller can bypass the UI and invoke an API directly. Server endpoints must validate credentials and authorize each operation against the requested resource. Use the route guard for UX; use server authorization for trust.

**Q: How should role-based routing be implemented?**

Keep coarse navigation decisions in the UI—for example, hide an admin link or render an admin route only for an admin role—but enforce the role again on every server operation. If a role is loaded asynchronously, show an indeterminate state until it is known. For a forbidden but valid route, a 403-style page is usually clearer than pretending the route does not exist; avoid leaking sensitive resource existence where that is a concern.

**Q: What are loaders and actions?**

In React Router’s data APIs, a loader supplies data needed by a matched route during navigation, while an action handles a route-associated mutation such as a form submission. They tie data work to the route lifecycle and can return redirects or errors. They are not universal React concepts; the exact APIs and cancellation behavior depend on the router and version.

**Q: How does route-based code splitting work?**

The route imports its module dynamically, so the bundler emits a separate chunk. The router loads that chunk when the route is entered, often showing pending UI while it arrives. A loader can fetch data independently. Use route boundaries for large or rarely visited screens, and consider intentional prefetching for likely next destinations.

**Q: How do redirects differ from links?**

A link is an explicit user action that requests another address. A redirect is a programmatic consequence of a condition, such as a canonical URL, completed submission, or missing session. `replace` is appropriate when the old location should not remain in history; a normal navigation is appropriate when the prior location is a meaningful place to return to.

**Q: How do you handle not-found pages?**

Use a catch-all route for a pathname with no matching pattern. Separately, a matching loader should produce a resource-level 404 when the route exists but its entity does not. Both should be observable and accessible, and error boundaries should distinguish expected not-found results from network or server failures.

**Q: When should state live in the URL?**

Put state in the URL when users should be able to refresh, bookmark, share, or revisit it with Back/Forward—filters, sort, pagination, selected tabs, and search terms are common examples. Keep transient state such as hover, an open tooltip, or an unsaved local draft in the component. URL state is a public serialized contract, so validate it and avoid filling history with noisy intermediate values.

**Q: How does browser history interact with routing?**

Push navigation adds an entry, replace navigation edits the current entry, and `popstate` tells the router that Back or Forward selected an existing entry. This means navigation policy is part of UX. For example, replace while a user types a filter, but push when they submit a meaningful search; otherwise Back may replay every keystroke.

## 6. The Traps — What Goes Wrong

**Treating a component switch as routing.** A boolean can render another component but cannot provide a durable address, deep-link refresh, route-level data lifecycle, or browser history. If the screen is a navigable destination, model it as a URL and route.

**Putting shareable filters only in local state.** The first visit looks correct, but refresh and copied links lose the result. Encode validated filter values in search parameters, and keep only temporary input details local until the user commits them.

**Assuming a route guard protects data.** Hiding an admin screen does not stop a modified client from calling `/api/admin`. Authorize on the server for every sensitive operation, including object-level access such as whether this user may read user 42.

**Redirecting while authentication is still loading.** `null` can mean “not checked yet,” not “anonymous.” Redirect only after the auth state is settled; otherwise users see a flicker and may lose their original destination.

**Forgetting the deep-link server fallback.** In-app links work because the SPA is already loaded, but refreshing `/app/users/42` asks the server for that path. Configure the host to serve `index.html` for application routes while letting real API and asset 404s remain 404s.

**Confusing a missing route with a missing resource.** `/users/999` can match perfectly and still have no user. Give route-level no-match and data-level 404s distinct handling so the user and telemetry get an accurate explanation.

**Using `push` for every keystroke.** A search box that writes a new history entry for each character makes Back painful. Debounce, replace intermediate edits, or commit a meaningful search with push.

**Reading URL values without validation.** `page=banana`, duplicate keys, stale enum values, and huge limits are normal inputs, not impossible cases. Parse them into safe defaults or reject them before using them in a request.

**Loading every route in the first bundle.** A route table can look declarative while static imports still pull all screens into the initial chunk. Use lazy route modules for meaningful boundaries and test the production bundle rather than assuming route syntax splits code.

**Putting everything into the URL.** URL state is public and navigable. Encoding a transient tooltip, half-written secret, or large editor draft creates privacy, history, and length problems. Expose only stable navigation state; use component state, storage, or server persistence for the rest.

## 7. Compare With Related Concepts

**Client-side routing vs server-side routing:** client-side routing changes the React tree after one document is loaded; server-side routing chooses which document or server response to return for each request. Use client-side routing for SPA navigation, but configure the server because refreshes and direct links still arrive there.

**Route parameters vs query parameters:** a route parameter identifies a required path resource; a query parameter modifies a representation or collection view. Use `/orders/123` for the order identity and `/orders?status=paid` for a filter.

**URL state vs component state:** URL state is serialized, shareable, and history-aware; component state is private, ephemeral memory. Use the URL for navigational meaning and component state for transient interaction.

**Routing vs state management:** routing models location and the UI branch implied by it; a state manager models shared client data and transitions that are not addresses. Do not put every application value in the router just because the router can carry it.

**UI route protection vs authorization:** a route guard controls what the current client displays; authorization controls what a trusted server permits. Use both, but never treat the first as a substitute for the second.

**Route-level lazy loading vs data loading:** lazy loading downloads JavaScript when a route is needed; a loader fetches runtime data for that route. Use code splitting to control bundle cost and data loading to control when remote state is requested.

**Redirect vs replace vs push:** a redirect describes the destination caused by a condition; push records a new meaningful place; replace rewrites the current place. Use push for user-created navigation, replace for canonicalization and guards, and choose based on what Back should do.

**Not-found vs forbidden:** not-found means no route or resource is available at that address; forbidden means the resource may exist but the caller lacks permission. Use the distinction when it is safe to reveal it, and let server policy decide how much existence information to expose.

## 8. 🧠 The Memory Hook — What Sticks

Picture the URL as the address on an envelope: the router opens the right nested building, puts the right page in the outlet, and records the trip in history. Path parameters name the place, query parameters describe the view, and guards control the welcome screen—but only the server controls who is truly allowed inside.
