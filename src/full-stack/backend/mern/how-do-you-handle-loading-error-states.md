# How do you handle loading/error states

## Detailed explanation

How do you handle loading/error states is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you handle loading/error states affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle loading and error states in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** Every API call has three states: loading, error, and success. With TanStack Query: `const { data, isLoading, isError, error } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users') })`. Render based on state: `if (isLoading) return <Skeleton />; if (isError) return <ErrorState message={error.message} onRetry={() => refetch()} />; return <UserList data={data} />`. For mutations: `const { mutate, isPending, isError, error } = useMutation({...})`. Show loading spinner on button, error toast on failure. Standardize error states across the app with reusable components.
- **The Unforgettable Mental Model:** The **Traffic Light System**. Red (loading) — wait, data is coming. Yellow (error) — something went wrong, here's what happened and a retry button. Green (success) — data is ready, display it.
- **The Trap:** Only handling the success state. Every API call can fail or take time. All three states need UI representations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Every API call has three states: loading, error, and success. I use TanStack Query which provides isLoading, isError, error, and data out of the box. I render a skeleton for loading, an error state with retry for errors, and the actual content for success. I standardize these components across the app — Skeleton, ErrorState, EmptyState — so every screen has consistent loading and error behavior. For mutations, I show loading on the button and error toasts."

#### What are skeleton screens and when should you use them?
- **The Engine Mechanism (Why it behaves this way):** Skeleton screens are placeholder UI that mimics the shape of the content being loaded: `<div className="skeleton" style={{ width: '100%', height: '20px', borderRadius: '4px', backgroundColor: '#e0e0e0' }} />`. They provide visual feedback that content is coming, reducing perceived load time. Use skeletons for: list items, cards, profile sections, tables. Use spinners for: buttons, small actions, full-page loads. Skeletons are better than spinners for content areas because they show the user what's coming and reduce layout shift when content loads.
- **The Unforgettable Mental Model:** The **Architect's Sketch**. Before the building is complete, you see a wireframe showing where each room will be. It's not the final product, but it gives you a sense of what's coming.
- **The Trap:** Using skeletons for everything — spinners are better for small actions (button clicks, form submissions). Skeletons are for content areas where the shape matters.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Skeleton screens are placeholders that mimic the shape of loading content. I use them for list items, cards, and profile sections — anywhere the content shape is predictable. They reduce perceived load time and prevent layout shift. For small actions like button clicks, I use spinners instead. I create reusable Skeleton components that match my design system's spacing and typography. The key is matching the skeleton shape to the actual content shape."

#### How do you handle error states with retry functionality?
- **The Engine Mechanism (Why it behaves this way):** Create a reusable ErrorState component: `const ErrorState = ({ message, onRetry }) => (<div><p>{message}</p><button onClick={onRetry}>Retry</button></div>)`. With TanStack Query: `const { isError, error, refetch } = useQuery({...}); if (isError) return <ErrorState message={error.message} onRetry={refetch} />`. For network errors, show a specific message: `const getMessage = (error) => { if (!error.response) return 'Check your connection'; if (error.response.status === 401) return 'Session expired'; return error.response.data?.error || 'Something went wrong'; };`. For mutations, show error in a toast: `onError: (err) => toast.error(getMessage(err))`.
- **The Unforgettable Mental Model:** The **Detour Sign**. When the main road is blocked (error), the sign (ErrorState) tells you what happened and offers an alternate route (retry button).
- **The Trap:** Showing generic "Something went wrong" without a retry option. Users need to know what happened and have a way to fix it.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create a reusable ErrorState component that shows the error message and a retry button. With TanStack Query, I pass refetch as the onRetry handler. I customize error messages based on the error type — network errors show 'check your connection', 401 shows 'session expired', etc. For mutations, I show errors in toasts. The key is giving users both information (what happened) and agency (retry button) — never leave them stuck."

#### How do you handle loading states for mutations (form submissions)?
- **The Engine Mechanism (Why it behaves this way):** Use TanStack Query's isPending state: `const { mutate, isPending } = useMutation({ mutationFn: submitForm, onSuccess: () => { toast.success('Saved!'); reset(); }, onError: (err) => toast.error(getMessage(err)) });`. Show loading on the submit button: `<button disabled={isPending} type="submit">{isPending ? <Spinner /> : 'Submit'}</button>`. Disable the entire form during submission to prevent duplicate submissions. For multi-step forms, show a progress indicator. After success, show a success toast and reset the form or navigate away.
- **The Unforgettable Mental Model:** The **Processing Stamp**. When you submit a form, it gets stamped "Processing" (loading state). You can't submit again until the stamp is removed (success or error). The stamp tells you the system is working on it.
- **The Trap:** Not disabling the form during submission — users can click submit multiple times, creating duplicate entries. Always disable during isPending.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For form submissions, I use TanStack Query's isPending state to show loading on the submit button and disable the entire form. This prevents duplicate submissions. On success, I show a success toast and reset the form or navigate. On error, I show an error toast with the specific error message. For multi-step forms, I show a progress indicator. The key UX principle is: never leave the user wondering if their submission was received."

#### How do you handle loading states for initial app load?
- **The Engine Mechanism (Why it behaves this way):** On app load, show a full-page loading screen while auth check and initial data fetch: `const App = () => { const { user, loading } = useAuth(); const { isLoading: isConfigLoading } = useQuery({ queryKey: ['config'], queryFn: () => api.get('/config') }); if (loading || isConfigLoading) return <AppLoadingScreen />; return <Router />; };`. The loading screen should match the app's branding. For better UX, load critical data first (auth, config) and show the app shell while non-critical data loads in the background. Use React Suspense for component-level loading: `<Suspense fallback={<Skeleton />}><Dashboard /></Suspense>`.
- **The Unforgettable Mental Model:** The **Restaurant Opening**. Before the restaurant opens, customers see a "Coming Soon" sign (loading screen). Once the kitchen is ready (auth + config loaded), the doors open (app renders). Side dishes (non-critical data) can arrive after the main course.
- **The Trap:** Showing a blank white screen during initial load. Always show a branded loading screen so users know the app is working.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: On app load, I show a branded loading screen while auth check and critical config data load. Once those are ready, I render the app shell and load non-critical data in the background. I use React Suspense for component-level loading within the app. The key is never showing a blank screen — always show a loading indicator that matches the app's branding. I also prioritize critical data (auth, config) over non-critical data (dashboard widgets, recommendations)."

## 8. Active recall test

1. **What three states does every API call have?**
   - **Explanation:** Loading (data is being fetched), error (request failed), and success (data received). All three need UI representations.

2. **When should you use skeleton screens vs. spinners?**
   - **Explanation:** Skeletons for content areas (lists, cards, profiles) where the shape matters. Spinners for small actions (buttons, form submissions) and full-page loads.

3. **How do you handle error states with retry?**
   - **Explanation:** Create a reusable ErrorState component with message and retry button. Pass TanStack Query's refetch as the onRetry handler. Customize messages based on error type.

4. **How do you handle loading states for form submissions?**
   - **Explanation:** Use isPending from useMutation to show loading on the submit button and disable the form. Prevents duplicate submissions. Show success/error toasts after completion.

5. **How do you handle loading states for initial app load?**
   - **Explanation:** Show a branded loading screen while auth and critical config data load. Render the app shell once critical data is ready. Load non-critical data in the background. Use Suspense for component-level loading.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle loading/error states in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle loading/error states in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
