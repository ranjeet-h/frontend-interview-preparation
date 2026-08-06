# How do you design auth in MERN

## Detailed explanation

How do you design auth in MERN is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you design auth in mern affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you design authentication in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** Full auth flow: (1) **Register** — React sends POST /auth/register with email/password. Express validates, hashes password with bcrypt, creates user in MongoDB, returns JWT. (2) **Login** — React sends POST /auth/login. Express verifies password with bcrypt.compare(), generates JWT (access + refresh tokens), returns access token and sets refresh token in httpOnly cookie. (3) **Protected requests** — React includes access token in Authorization header. Express auth middleware verifies token, sets req.user. (4) **Token refresh** — on 401, React calls POST /auth/refresh. Express verifies refresh token, issues new access token. (5) **Logout** — React calls POST /auth/logout. Express invalidates refresh token in database.
- **The Unforgettable Mental Model:** The **Hotel System**. Register = getting a reservation. Login = checking in and getting a room key (access token) + reservation confirmation (refresh token). Protected areas = room key required. Key expired = use reservation to get new key. Checkout = return key and cancel reservation.
- **The Trap:** Storing access tokens in localStorage — XSS attacks can steal them. Use httpOnly cookies for refresh tokens and short-lived access tokens.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I design MERN auth with JWT-based authentication. Registration validates and hashes passwords with bcrypt. Login verifies credentials and returns a short-lived access token plus a refresh token stored in an httpOnly cookie. Protected routes verify the access token via middleware. When the access token expires, the frontend calls a refresh endpoint that validates the refresh token and issues a new access token. Logout invalidates the refresh token server-side. The frontend uses an API client interceptor to handle token attachment and automatic refresh."

#### What's the difference between authentication and authorization in MERN?
- **The Engine Mechanism (Why it behaves this way):** Authentication (who are you?) happens on both frontend and backend. Frontend checks if a token exists to show/hide UI elements. Backend verifies the token signature to confirm identity. Authorization (what can you do?) also happens on both layers. Frontend hides/disables UI elements based on user role. Backend enforces role checks in middleware before processing requests. Frontend auth is UX — backend auth is security. Frontend authorization can be bypassed; backend authorization cannot.
- **The Unforgettable Mental Model:** **ID Check vs. Access Level**. Authentication is checking your ID at the door (both frontend and backend verify who you are). Authorization is checking your clearance level — frontend hides restricted rooms from your view, backend locks the doors so you can't enter even if you know they exist.
- **The Trap:** Relying only on frontend auth/authorization. A user can bypass React's route protection and directly call API endpoints. Backend enforcement is the only real security.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Authentication verifies identity — frontend checks for a token to show the right UI, backend verifies the token signature to confirm identity. Authorization verifies permissions — frontend hides restricted UI elements, backend enforces role checks in middleware. Frontend auth is for UX, backend auth is for security. Frontend can be bypassed; backend cannot. I implement both: frontend for a good user experience, backend for actual security."

#### How do you handle auth state in React?
- **The Engine Mechanism (Why it behaves this way):** Use React Context or a state management library (Zustand) to track auth state globally: `const AuthContext = createContext(); const AuthProvider = ({ children }) => { const [user, setUser] = useState(null); const [loading, setLoading] = useState(true); useEffect(() => { const checkAuth = async () => { try { const res = await api.get('/auth/me'); setUser(res.data); } catch { setUser(null); } finally { setLoading(false); } }; checkAuth(); }, []); ... };`. The provider checks auth status on app load, provides login/logout functions, and makes user data available to all components. Protected routes check `user` state before rendering.
- **The Unforgettable Mental Model:** The **Building Directory**. The auth context is the directory at the entrance — it tells everyone who's in the building (user state), whether they're verified (authenticated), and what floors they can access (roles). Every room (component) checks the directory.
- **The Trap:** Checking auth state synchronously on app load — the check is async (API call), so you need a loading state to prevent showing unauthenticated UI briefly before the check completes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use React Context to manage auth state globally. On app load, I call /auth/me to verify the current session. I track user, loading, and isAuthenticated state. Protected routes check these states before rendering. Login sets the user state, logout clears it. The key is handling the loading state — without it, the app briefly shows unauthenticated UI while the auth check is in progress. I also handle token refresh failures by clearing auth state and redirecting to login."

#### How do you implement protected routes in React?
- **The Engine Mechanism (Why it behaves this way):** Create a wrapper component: `const ProtectedRoute = ({ children }) => { const { user, loading } = useAuth(); if (loading) return <Spinner />; if (!user) return <Navigate to="/login" replace />; return children; };`. Use in router: `<Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />`. For role-based protection: `const AdminRoute = ({ children }) => { const { user } = useAuth(); if (user?.role !== 'admin') return <Navigate to="/" replace />; return children; };`. The `replace` prop prevents the user from navigating back to the protected page after redirect.
- **The Unforgettable Mental Model:** The **Security Gate**. Before entering a restricted area (protected route), the gate (ProtectedRoute) checks your credentials (auth context). If valid, you pass through (children render). If not, you're redirected to the lobby (login page).
- **The Trap:** Not handling the loading state — if loading is true and user is null, the route redirects to login even though the user might be authenticated (the check hasn't completed yet).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create a ProtectedRoute component that checks auth state from context. If loading, show a spinner. If not authenticated, redirect to login. If authenticated, render the children. For role-based protection, I create AdminRoute that additionally checks the user's role. I use the replace prop on Navigate to prevent back-navigation to protected pages. The critical detail is handling the loading state — without it, users get redirected to login during the initial auth check."

#### How do you handle session persistence across page refreshes?
- **The Engine Mechanism (Why it behaves this way):** On app load, call a /auth/me or /auth/session endpoint that verifies the current session (via httpOnly cookie or stored token) and returns user data. The auth provider runs this check in a useEffect on mount. If the session is valid, set user state. If invalid or expired, clear auth state. For httpOnly cookies, the browser sends them automatically — no token storage needed. For localStorage tokens, read the token on load and include it in the /auth/me request. The loading state prevents UI flicker during the check.
- **The Unforgettable Mental Model:** The **Memory Test**. After a nap (page refresh), you check your pockets (session) to see if you still have your ID (auth). If yes, you continue. If no, you go back to get a new one (login).
- **The Trap:** Assuming the user is still authenticated after a page refresh without verifying with the backend. Tokens can expire or be invalidated server-side.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: On app load, I call /auth/me to verify the current session. For httpOnly cookies, the browser sends them automatically. For stored tokens, I include them in the request. If the session is valid, I set the user state. If not, I clear auth state and redirect to login. I track a loading state during this check to prevent showing unauthenticated UI briefly. This ensures session persistence across page refreshes while always verifying with the backend."

## 8. Active recall test

1. **What is the full MERN auth flow?**
   - **Explanation:** Register (hash password, create user), Login (verify password, issue JWT), Protected requests (verify token), Token refresh (validate refresh token, issue new access token), Logout (invalidate refresh token).

2. **Why is backend auth enforcement more important than frontend?**
   - **Explanation:** Frontend auth can be bypassed by directly calling API endpoints. Backend auth is the security boundary — it's the only enforcement that actually protects data.

3. **How do you manage auth state in React?**
   - **Explanation:** Use React Context or Zustand. On app load, call /auth/me to verify session. Track user, loading, and isAuthenticated state. Provide login/logout functions globally.

4. **What does a ProtectedRoute component do?**
   - **Explanation:** Checks auth state — if loading, shows spinner; if not authenticated, redirects to login; if authenticated, renders children. For role-based protection, additionally checks user role.

5. **How do you handle session persistence after page refresh?**
   - **Explanation:** Call /auth/me on app load to verify the current session. Use a loading state during the check. If valid, restore user state. If invalid, clear auth and redirect to login.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you design auth in MERN in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you design auth in MERN in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
