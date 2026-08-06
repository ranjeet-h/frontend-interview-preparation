# How do you avoid duplicate API calls

## Detailed explanation

How do you avoid duplicate API calls is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you avoid duplicate api calls affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you avoid duplicate API calls in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** TanStack Query automatically deduplicates identical requests — if multiple components request the same queryKey simultaneously, only one HTTP request is made and the result is shared. For manual fetching, use a ref to track in-flight requests: `const fetchingRef = useRef(false); const fetchData = async () => { if (fetchingRef.current) return; fetchingRef.current = true; try { const data = await api.get('/users'); } finally { fetchingRef.current = false; } };`. For search inputs, debounce API calls by 300ms. For mutations, disable the submit button during the mutation: `const { mutate, isPending } = useMutation({...}); <button disabled={isPending} onClick={() => mutate(data)}>Submit</button>`.
- **The Unforgettable Mental Model:** The **Group Ticket**. Instead of each person buying their own ticket (duplicate API calls), one person buys for the whole group (deduplication). Everyone gets the same result from a single purchase.
- **The Trap:** Making API calls in useEffect without proper dependency management — causes duplicate calls on every render. Use TanStack Query or proper dependency arrays.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I avoid duplicate API calls at multiple levels. TanStack Query deduplicates identical requests automatically — multiple components requesting the same data share a single HTTP call. For manual fetching, I use refs to track in-flight requests. For search, I debounce by 300ms. For form submissions, I disable the button during the mutation. I also use React's key prop to reset fetch state when filters change, preventing stale data from previous searches."

#### How does TanStack Query deduplicate requests?
- **The Engine Mechanism (Why it behaves this way):** When multiple components use `useQuery({ queryKey: ['users'] })` simultaneously, TanStack Query checks if a request for that queryKey is already in flight. If yes, it subscribes to the existing request instead of making a new one. When the response arrives, all subscribers receive the data. This works across the entire app — any component using the same queryKey shares the same request. The deduplication window is configurable via `staleTime` — requests within the staleTime window use cached data without any network request.
- **The Unforgettable Mental Model:** The **Shared Umbrella**. When it starts raining (data needed), the first person opens an umbrella (makes the request). Everyone else stands under the same umbrella (subscribes to the existing request). No one needs their own umbrella.
- **The Trap:** Using different queryKeys for the same data — `['users']` vs `['user-list']` — prevents deduplication. Standardize queryKeys across the app.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: TanStack Query deduplicates by checking if a request for a given queryKey is already in flight. If yes, new subscribers join the existing request instead of making a new one. When the response arrives, all subscribers get the data. I standardize queryKeys across the app so the same data always uses the same key. I also configure staleTime to use cached data within a time window, reducing network requests even further."

#### How do you prevent duplicate form submissions?
- **The Engine Mechanism (Why it behaves this way):** Disable the submit button during mutation: `const { mutate, isPending } = useMutation({ mutationFn: submitForm }); <button disabled={isPending} type="submit">Submit</button>`. For manual fetching, use a ref: `const submittingRef = useRef(false); const handleSubmit = async () => { if (submittingRef.current) return; submittingRef.current = true; try { await api.post('/form', data); } finally { submittingRef.current = false; } };`. On the backend, implement idempotency keys: `const idempotencyKey = req.headers['x-idempotency-key']; if (await redis.exists(idempotencyKey)) return res.json(await redis.get(idempotencyKey)); const result = await processForm(); await redis.setex(idempotencyKey, 3600, JSON.stringify(result));`.
- **The Unforgettable Mental Model:** The **One-Click Lock**. After the first click, the button locks (disabled) until the action completes. Even if the user clicks frantically, only the first click is processed.
- **The Trap:** Only disabling on the frontend — users can bypass this by making direct API calls. Backend idempotency keys prevent duplicate processing even with direct API calls.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent duplicate form submissions at two levels. Frontend: disable the submit button during the mutation using TanStack Query's isPending state. Backend: implement idempotency keys — the frontend sends a unique key with each request, and the backend checks if it's already processed. If yes, return the cached result. This prevents duplicates even if the user bypasses the frontend. Idempotency is critical for payments and other critical operations."

#### How do you handle race conditions with search inputs?
- **The Engine Mechanism (Why it behaves this way):** Use debouncing + request cancellation: `const debouncedQuery = useDebounce(query, 300); const { data } = useQuery({ queryKey: ['search', debouncedQuery], queryFn: ({ signal }) => api.get(`/search?q=${debouncedQuery}`, { signal }), enabled: !!debouncedQuery });`. TanStack Query automatically cancels the previous request when a new query is made (via AbortController signal). The backend should also handle aborted requests gracefully — check `req.aborted` or use a signal-aware database driver. For manual fetching, use AbortController: `const controller = new AbortController(); const fetchData = async () => { controller.abort(); controller = new AbortController(); const res = await api.get(`/search?q=${query}`, { signal: controller.signal }); };`.
- **The Unforgettable Mental Model:** The **Fastest Runner**. Multiple runners (API calls) start at different times. The last one to start (latest search term) is the one that matters. Previous runners are stopped mid-race (cancelled).
- **The Trap:** Not canceling previous requests — if the user types "hello" quickly, 5 API calls fire. The last one might return before earlier ones, showing stale results for "h" instead of "hello".
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle search race conditions with debouncing and request cancellation. Debouncing delays the API call by 300ms after the user stops typing. TanStack Query automatically cancels the previous in-flight request when a new query is made via AbortController. This ensures only the latest search term's results are displayed. The backend should also handle aborted requests gracefully to avoid unnecessary database queries."

#### How do you cache API responses to avoid redundant calls?
- **The Engine Mechanism (Why it behaves this way):** TanStack Query caches responses by queryKey. Configure cache behavior: `useQuery({ queryKey: ['users'], queryFn: fetchUsers, staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000 })`. `staleTime` — data is fresh for 5 minutes, no refetch during this window. `gcTime` — cached data is garbage collected after 30 minutes of inactivity. For HTTP-level caching, set Cache-Control headers on the backend: `res.set('Cache-Control', 'public, max-age=300')`. The browser caches the response and doesn't make a request for 5 minutes. For API client-level caching, axios-cache-interceptor provides request/response caching.
- **The Unforgettable Mental Model:** The **Pantry Storage**. Fresh food (recent data) is in the pantry (cache) and ready to eat. After the expiration date (staleTime), you check if it's still good (background refetch). After the discard date (gcTime), you throw it out (garbage collection).
- **The Trap:** Caching dynamic data that changes frequently — users see stale data. Set appropriate staleTime based on how often the data changes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I cache at multiple levels. TanStack Query caches by queryKey with configurable staleTime and gcTime. For static data, I set long staleTime (5+ minutes). For dynamic data, I set short staleTime or 0 (always refetch). I also set HTTP Cache-Control headers on the backend for browser-level caching. The key is matching the cache duration to the data's volatility — static data can be cached longer, dynamic data needs frequent refetching."

## 8. Active recall test

1. **How does TanStack Query prevent duplicate API calls?**
   - **Explanation:** It deduplicates identical requests by queryKey. If multiple components request the same data simultaneously, only one HTTP request is made and the result is shared.

2. **How do you prevent duplicate form submissions?**
   - **Explanation:** Disable the submit button during mutation (isPending). On the backend, use idempotency keys to prevent duplicate processing even with direct API calls.

3. **How do you handle race conditions in search?**
   - **Explanation:** Debounce input (300ms) and cancel previous requests. TanStack Query automatically cancels in-flight requests when a new query is made via AbortController.

4. **How do you configure TanStack Query caching?**
   - **Explanation:** Use staleTime (how long data is fresh) and gcTime (how long cached data is kept). Set staleTime based on data volatility — longer for static data, shorter for dynamic.

5. **What are idempotency keys?**
   - **Explanation:** Unique keys sent with each request. The backend checks if the key was already processed and returns the cached result instead of processing again. Prevents duplicate operations.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you avoid duplicate API calls in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you avoid duplicate API calls in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
