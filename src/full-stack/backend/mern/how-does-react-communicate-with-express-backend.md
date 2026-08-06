# How does React communicate with Express backend

## Detailed explanation

How does React communicate with Express backend is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how does react communicate with express backend affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How does React communicate with an Express backend?
- **The Engine Mechanism (Why it behaves this way):** React sends HTTP requests to Express API endpoints using `fetch` or `axios`. Express receives the request, processes it through middleware (auth, validation), queries the database via Mongoose, and returns a JSON response. React receives the response, updates state, and re-renders. The communication is stateless — each request is independent. React manages the async nature with data fetching libraries (TanStack Query) that handle loading states, error states, caching, and background refetching. CORS must be configured on Express to allow requests from React's development server.
- **The Unforgettable Mental Model:** The **Drive-Thru Window**. React (customer) places an order (HTTP request) at the window (Express API). The kitchen (database) prepares it. The window hands back the food (JSON response). Each order is independent — the window doesn't remember previous orders.
- **The Trap:** Not handling CORS during development — React dev server (localhost:3000) and Express (localhost:5000) are different origins, so browsers block requests without CORS configuration.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: React communicates with Express through HTTP requests — typically REST APIs with JSON responses. I use axios or fetch for the HTTP layer and TanStack Query for state management, caching, and error handling. Express handles the request through middleware, queries MongoDB, and returns JSON. CORS must be configured on Express to allow requests from React's dev server. In production, both are served from the same origin or CORS is configured for the production frontend domain."

#### What is the role of an API client layer?
- **The Engine Mechanism (Why it behaves this way):** An API client layer (axios instance or fetch wrapper) centralizes HTTP configuration: base URL, default headers (Authorization with JWT), request/response interceptors, error handling, and timeout settings. Example: `const api = axios.create({ baseURL: import.meta.env.VITE_API_URL }); api.interceptors.request.use(config => { const token = localStorage.getItem('token'); if (token) config.headers.Authorization = `Bearer ${token}`; return config; }); api.interceptors.response.use(res => res.data, err => Promise.reject(normalizeError(err)));`. All React components use this single `api` instance instead of raw fetch calls.
- **The Unforgettable Mental Model:** The **Universal Remote**. Instead of each TV component having its own remote (raw fetch), there's one universal remote (API client) that handles all the complex settings (auth headers, error handling, base URL) so components just press "play" (api.get('/users')).
- **The Trap:** Making raw fetch/axios calls directly in components — this scatters configuration, auth logic, and error handling across the codebase. Centralize in an API client.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create an API client layer using an axios instance with interceptors. The request interceptor attaches the JWT token to every request. The response interceptor normalizes errors into a consistent format. All components import and use this single client instead of making raw fetch calls. This centralizes auth, error handling, base URL configuration, and timeout settings. It also makes it easy to add request logging, retry logic, or token refresh in one place."

#### How do you handle authentication in API requests?
- **The Engine Mechanism (Why it behaves this way):** Attach the JWT token to every request via the Authorization header: `Authorization: Bearer <token>`. The API client's request interceptor reads the token from storage (httpOnly cookie or secure storage) and adds it. On the Express side, auth middleware extracts and verifies the token. For token refresh, the response interceptor catches 401 errors, calls the refresh endpoint, retries the original request with the new token, and only then rejects if refresh also fails. This is transparent to the component making the request.
- **The Unforgettable Mental Model:** The **VIP Pass**. Every request shows its VIP pass (JWT token) at the door (auth middleware). If the pass is expired, the bouncer (response interceptor) gets a new one from the VIP desk (refresh endpoint) and retries entry.
- **The Trap:** Storing tokens in localStorage and attaching them manually in every component. Use an API client interceptor for consistent, centralized token management.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle auth through an API client interceptor that attaches the JWT token to every request. On 401 responses, the interceptor attempts a token refresh, retries the original request, and only fails if refresh also fails. This is completely transparent to components — they just make API calls and the auth layer handles token management. For storage, I prefer httpOnly cookies for security, but if using localStorage, the interceptor reads from there."

#### How do you handle loading and error states?
- **The Engine Mechanism (Why it behaves this way):** With TanStack Query: `const { data, isLoading, isError, error } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users') })`. React renders based on state: `if (isLoading) return <Skeleton />; if (isError) return <ErrorState message={error.message} />; return <UserList data={data} />`. Without TanStack Query, manage manually: `const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(null);`. TanStack Query eliminates boilerplate and handles edge cases like background refetching and stale-while-revalidate.
- **The Unforgettable Mental Model:** The **Traffic Light System**. Red (loading) — wait, data is coming. Yellow (error) — something went wrong, here's what happened. Green (success) — data is ready, display it.
- **The Trap:** Only handling the success state. Every API call has three possible outcomes: loading, error, and success. All three need UI representations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Every API call has three states: loading, error, and success. I use TanStack Query which provides isLoading, isError, and data out of the box. I render a skeleton for loading, an error state with retry for errors, and the actual content for success. Without TanStack Query, I manage these states manually with useState. The key is to never leave the user wondering — always show loading indicators, meaningful error messages, and a retry option."

#### How do you prevent duplicate API calls?
- **The Engine Mechanism (Why it behaves this way):** TanStack Query deduplicates identical requests — if multiple components request the same queryKey simultaneously, only one HTTP request is made and the result is shared. For manual fetching, use a ref to track in-flight requests: `const fetchingRef = useRef(false); const fetchData = async () => { if (fetchingRef.current) return; fetchingRef.current = true; try { const data = await api.get('/users'); setData(data); } finally { fetchingRef.current = false; } };`. For search inputs, use debouncing: delay the API call until the user stops typing for 300ms.
- **The Unforgettable Mental Model:** The **Group Ticket**. Instead of each person buying their own ticket (duplicate API calls), one person buys for the whole group (deduplication). Everyone gets the same result from a single purchase.
- **The Trap:** Making API calls in useEffect without proper dependency arrays — causes duplicate calls on every render. Also, not debouncing search inputs causes an API call per keystroke.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: TanStack Query automatically deduplicates identical requests — multiple components requesting the same data share a single HTTP call. For manual fetching, I use a ref to track in-flight requests and prevent duplicates. For search inputs, I debounce API calls by 300ms to avoid firing on every keystroke. I also use React's key prop to reset fetch state when filters change, preventing stale data from previous searches."

## 8. Active recall test

1. **How does React send requests to Express?**
   - **Explanation:** Through HTTP requests (fetch or axios) to Express API endpoints. Express processes the request and returns JSON. CORS must be configured for cross-origin requests.

2. **What is the purpose of an API client layer?**
   - **Explanation:** Centralizes HTTP configuration — base URL, auth headers, error handling, interceptors. All components use the same client instead of raw fetch/axios calls.

3. **How do you attach JWT tokens to API requests?**
   - **Explanation:** Via a request interceptor in the API client that reads the token from storage and adds `Authorization: Bearer <token>` header to every request.

4. **Why use TanStack Query for data fetching?**
   - **Explanation:** It handles loading/error states, caching, request deduplication, background refetching, optimistic updates, and retry logic automatically — eliminating boilerplate.

5. **How do you prevent duplicate API calls for search?**
   - **Explanation:** Use debouncing — delay the API call until the user stops typing for 300ms. TanStack Query also deduplicates identical requests automatically.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How does React communicate with Express backend in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How does React communicate with Express backend in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
