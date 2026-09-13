# How do you handle protected routes

## Detailed explanation

How do you handle protected routes is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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
Work   -> apply full-stack integration rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle protected routes affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is a protected route in a React application?
- **The Engine Mechanism (Why it behaves this way):** A protected route is a route that requires authentication (and sometimes specific permissions) before rendering its content. The frontend checks auth state (token existence, user object) before rendering the route's component. If unauthenticated, the user is redirected to login. The route guard acts as a middleware between the router and the page component.
- **The Unforgettable Mental Model:** The **Hotel Room Key Card**. The hallway (route) is public, but each room (protected page) requires a valid key card (auth token). The card reader (route guard) checks validity before the door unlocks. Even if someone knows the room number (URL), they can't enter without a valid key.
- **The Trap:** Thinking frontend route protection is security. It's UX — it prevents unauthenticated users from seeing protected UI. The backend must independently protect every API endpoint since frontend code can be bypassed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A protected route is a route wrapper that checks authentication state before rendering its child component. If the user is authenticated, it renders the page. If not, it redirects to login while preserving the intended destination URL so the user can be sent back after authentication. I implement this as a higher-order component or wrapper component that reads auth state from context and conditionally renders or redirects."

#### How do you implement a route guard in React Router?
- **The Engine Mechanism (Why it behaves this way):** In React Router v6, route guards are implemented as wrapper components that read auth state and use the `<Navigate>` component for redirects. The guard wraps protected route elements in the route configuration. During render, it checks auth state — if authenticated, it renders `children`; if not, it returns `<Navigate to="/login" state={{ from: location }} replace />`.
- **The Unforgettable Mental Model:** The **Bouncer at the Club Door**. The bouncer (guard component) checks your ID (auth state) before letting you in. If you're on the list, you enter (render children). If not, you're directed to the registration desk (login page) with a note about which club you wanted to enter (from location).
- **The Trap:** Not preserving the `from` location during redirect. Without it, after login the user lands on the homepage instead of the page they originally wanted, creating a frustrating experience.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create a `ProtectedRoute` component that reads auth state from context. If authenticated, it renders the children. If not, it returns `<Navigate to='/login' state={{ from: location }} />` to redirect while preserving the intended destination. In the route config, I wrap protected routes: `<Route element={<ProtectedRoute />}><Route path='/dashboard' element={<Dashboard />} /></Route>`. After login, I read `location.state?.from` and redirect the user back."

#### How do you handle role-based protected routes?
- **The Engine Mechanism (Why it behaves this way):** Role-based route guards extend basic auth guards by checking the user's role or permissions in addition to authentication. The guard compares the required role against the user's role from auth state. If the user lacks the required role, they're redirected to an "unauthorized" page or the homepage, even though they're authenticated.
- **The Unforgettable Mental Model:** The **Multi-Level Security Building**. Getting past the lobby (authentication) isn't enough — the executive floor (admin route) requires an executive badge (admin role). You're a legitimate employee, but you don't have clearance for this floor.
- **The Trap:** Using hardcoded role strings like `user.role === 'admin'`. This scatters role logic throughout the codebase. Use a permission-checking utility that maps roles to permissions for maintainability.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I extend the ProtectedRoute component to accept a `requiredRole` or `requiredPermission` prop. The guard checks both authentication and authorization — `if (!isAuthenticated) redirect to login; if (!hasPermission(requiredRole)) redirect to unauthorized`. I use a permission utility that maps roles to permissions rather than hardcoding role strings, making it easy to add new roles or change permission mappings without touching route definitions."

#### What happens during the initial page load when auth state is unknown?
- **The Engine Mechanism (Why it behaves this way):** On initial load, the app doesn't know if the user is authenticated until it checks for a token (in cookie, storage, or memory). During this check, the route guard should show a loading state rather than redirecting to login or rendering the protected page. This prevents the "flash of redirect" where authenticated users briefly see the login page before being redirected back.
- **The Unforgettable Mental Model:** The **Elevator Between Floors**. When the elevator (app) starts, it's between floors (auth unknown). It shouldn't open doors on either floor yet — it needs to check which floor was requested (auth check) before opening the right doors.
- **The Trap:** Redirecting to login immediately when auth state is `null` or `undefined`. This causes authenticated users to see a login flash on every page refresh while the app checks for existing sessions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle the unknown auth state with a three-state model: authenticated, unauthenticated, and loading. On initial load, auth state is 'loading' while the app checks for existing tokens. The route guard renders a loading spinner during this phase. Once the check completes, it transitions to authenticated (render protected content) or unauthenticated (redirect to login). This eliminates the login flash that authenticated users would otherwise see on page refresh."

#### How do you handle nested protected routes?
- **The Engine Mechanism (Why it behaves this way):** Nested protected routes allow a layout (like a dashboard shell) to be protected once, with child routes inheriting the protection. In React Router v6, this is done by placing the guard on the parent route element. All child routes automatically require authentication. Individual child routes can add additional role checks.
- **The Unforgettable Mental Model:** The **Gated Community**. The main gate (parent route guard) checks everyone entering the community. Once inside, all streets (child routes) are accessible. But some houses (specific child routes) have their own locks (additional role checks) on top of the community gate.
- **The Trap:** Adding guards to every child route individually. This duplicates auth checks and makes it easy to forget protecting a new route. Protect the parent layout once.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I protect the parent layout route once, and all child routes inherit the protection. In React Router, I set the ProtectedRoute as the parent element: `<Route element={<ProtectedRoute />}><Route path='dashboard' element={<DashboardLayout />}><Route path='settings' element={<Settings />} /></Route></Route>`. This way, every route under dashboard requires auth. For routes needing additional role checks, I wrap those specific children with a RoleGuard component."

#### How do you test protected routes?
- **The Engine Mechanism (Why it behaves this way):** Testing protected routes involves three scenarios: (1) unauthenticated user should be redirected to login, (2) authenticated user should see the protected content, (3) authenticated user without required role should see unauthorized page. Tests mock the auth context/provider and use React Router's memory router to simulate navigation without a real browser.
- **The Unforgettable Mental Model:** The **Fire Drill**. You test the security system by trying to enter as different types of people: a stranger (unauthenticated), a regular employee (authenticated), and a regular employee trying to enter the server room (wrong role). Each should get the appropriate response.
- **The Trap:** Testing protected routes with a real browser and real auth flow. This makes tests slow, flaky, and dependent on external services. Use mocked auth context and memory router instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test protected routes using React Testing Library with a mocked auth context. I write three test cases: unauthenticated users are redirected to login (assert navigation to /login), authenticated users see protected content (assert element is rendered), and users without required roles see an unauthorized page. I use MemoryRouter from React Router to simulate navigation without a real browser, keeping tests fast and deterministic."

#### What would you monitor for protected routes in production?
- **The Engine Mechanism (Why it behaves this way):** Protected route monitoring tracks unauthorized access attempts (403s from frontend redirects), redirect loops (login → protected → login cycle), auth check latency (time to verify session on load), and the ratio of protected-to-public page views. These metrics reveal auth configuration issues and UX problems.
- **The Unforgettable Mental Model:** The **Security Camera Logs**. How many people tried to enter restricted areas (unauthorized attempts), how many got stuck in the lobby going back and forth (redirect loops), and how long the ID check takes (auth latency).
- **The Trap:** Not monitoring redirect loops. A misconfigured auth check can trap users in an infinite login → redirect → login cycle, making the app completely unusable for affected users.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor unauthorized access attempts to find permission misconfigurations, redirect loop detection to catch auth flow bugs, and auth check latency to ensure the initial load experience is fast. I also track the ratio of login redirects to successful page loads — a spike suggests auth token issues or session expiration problems. I set up alerts for redirect loops since they make the app completely unusable."

## 8. Active recall test

1. **What is the difference between frontend route protection and backend authorization?**
   - **Explanation:** Frontend route protection is a UX convenience that hides protected pages from unauthenticated users. Backend authorization is the actual security layer that validates permissions on every API request. Frontend protection can be bypassed (user can modify JS or call APIs directly), so backend authorization is mandatory.

2. **How do you prevent the "login flash" on page refresh for authenticated users?**
   - **Explanation:** Use a three-state auth model: authenticated, unauthenticated, and loading. On initial load, show a loading spinner while checking for existing tokens (in cookies or storage). Only redirect to login or render protected content after the auth check completes, preventing the flash of the login page.

3. **Why should you preserve the `from` location when redirecting to login?**
   - **Explanation:** Preserving the intended destination URL (`location.state.from`) allows the app to redirect the user back to their original page after successful login. Without it, users land on the homepage after login even though they wanted to access a specific protected page, creating a frustrating experience.

4. **How do you implement role-based route guards efficiently?**
   - **Explanation:** Create a reusable guard component that accepts a `requiredRole` or `requiredPermission` prop. Check both authentication and authorization: redirect to login if unauthenticated, redirect to unauthorized if lacking the required role. Use a permission utility that maps roles to permissions rather than hardcoding role strings.

5. **What is the best way to protect multiple routes under a shared layout?**
   - **Explanation:** Place the ProtectedRoute guard on the parent layout route element in the route configuration. All child routes automatically inherit the protection. This avoids duplicating guards on every child route and ensures new routes added under the layout are protected by default.

6. **How do you test protected routes without a real browser?**
   - **Explanation:** Use React Testing Library with a mocked auth context provider and MemoryRouter from React Router. Test three scenarios: unauthenticated users redirect to login, authenticated users see protected content, and users without required roles see an unauthorized page. MemoryRouter simulates navigation without needing a real browser.

7. **What production metric indicates a broken auth flow?**
   - **Explanation:** Redirect loop rate — when users are caught in an infinite cycle of login → protected page → redirect to login. This indicates a misconfigured auth check, token validation failure, or session persistence bug. It makes the app completely unusable and should trigger immediate alerts.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle protected routes in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle protected routes in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
