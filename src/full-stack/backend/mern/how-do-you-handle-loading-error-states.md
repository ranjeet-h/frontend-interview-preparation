# How do you handle loading/error states

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app worked perfectly in development with test data. A week after launch, support tickets start flooding in. Users are clicking "Place Order" multiple times because nothing happens immediately — now you have duplicate charges on credit cards and angry customers. The product listing page shows a blank white screen for five seconds on mobile networks, and users think the app crashed. When the inventory service goes down, everyone sees a generic "Something went wrong" message with no indication that it's a temporary issue, so they refresh the page and lose their cart items.

The CEO is on your case about conversion rates dropping, and you realize the problem: you built the happy path and ignored the three real states every API call actually goes through. The network isn't instant, servers fail, and users don't wait patiently. Your UI needs to represent the actual state of every request, not pretend everything always succeeds.

## 2. The Analogy — Make the Mechanic Obvious

Think of an elevator button. When you press it, the button lights up immediately — that's your loading state. You know the elevator received your request and is on its way. If the elevator gets stuck between floors, a display shows "Floor 3 — Malfunction, call maintenance" — that's your error state with specific information and a recovery path. When the doors open on your floor, the light turns off and you walk in — that's your success state.

Now imagine an elevator with no lights. You press the button and nothing happens. You press it again. Still nothing. Is it broken? Is it coming? Did you even press it? You have no idea. That's what your app feels like without loading states.

Or imagine the elevator gets stuck but just shows a blank screen. You stand there waiting, not knowing if you should take the stairs, call for help, or keep waiting. That's your app with generic error messages.

Every API call in your app is an elevator ride. The user presses a button (makes a request), and you must show them the button lit up (loading), tell them if something went wrong and what to do (error), or let them through when it works (success).

## 3. The Full Explanation — How It Actually Works

Every network request in a browser goes through a lifecycle, and your UI must track this lifecycle to keep the user informed. When a request starts, you're in an indeterminate state — you don't know if it will succeed or fail. During this time, you must show something that tells the user "I'm working on it." That's the loading state.

The request then resolves in one of two ways. The backend responds with an HTTP status code and possibly a response body. Status codes in the 200-299 range mean success — the request worked and you have data to show. Status codes in the 400-499 range mean the client did something wrong — bad credentials (401), forbidden (403), not found (404), or invalid input (422). Status codes in the 500-599 range mean the server failed — database connection dropped, unhandled exception, or service unavailable. Or the request never reaches the server at all — network timeout, CORS failure, or the user went offline.

Each of these outcomes needs a corresponding UI state. For loading, you prevent the user from taking actions that would conflict with the in-flight request. If someone is submitting a form, disable the submit button so they can't submit twice. If you're loading a list, show a placeholder so the user knows content is coming.

For errors, you need to tell the user what went wrong AND what they can do about it. A 401 error means "log in again" — so your error state should include a login button or redirect. A 422 validation error means "fix your input" — so your error state should highlight the invalid fields. A 500 error means "try again later" — so your error state should include a retry button. A network error means "check your connection" — so your error state should suggest checking the internet.

For success, you show the actual data or confirm the action completed.

The distinction between queries (fetching data) and mutations (changing data) matters for how you handle these states. Queries typically show loading in the content area — skeletons for lists, spinners for individual items. Mutations typically show loading on the action trigger — disabling buttons, showing "Saving..." text, or displaying a progress indicator. Errors on queries usually block the content area with an error message. Errors on mutations usually appear as toast notifications since the rest of the page can still function.

Your backend API contract and frontend error handling must be designed together. If the backend returns a generic "error" string for every failure, the frontend can't give users helpful guidance. The backend should return structured error responses with a message field, a code field for programmatic handling, and optionally field-specific details for validation errors. The frontend should map each error code to a specific recovery action.

This state management isn't just UX — it's correctness. Without proper loading states, users create race conditions by clicking multiple times. Without proper error states, users can't recover from failures. Without proper success states, users don't know their action completed.

## 4. See It In Practice — Real Code or Queries

Here's how you handle loading and error states in a MERN app using TanStack Query. This pattern gives you the three states for every request without manual state management.

```jsx
// Query example - fetching a list of users
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

function UserList() {
  // TanStack Query tracks the request lifecycle automatically
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['users'],  // Unique key for caching and refetching
    queryFn: () => api.get('/users')  // The actual fetch function
  });

  // Early return for loading - we check this FIRST
  // This prevents rendering the list with undefined data
  if (isLoading) {
    return <SkeletonList />;
  }

  // Early return for error - we check this SECOND
  // The user sees a helpful message instead of broken UI
  if (isError) {
    return (
      <ErrorState
        message={getErrorMessage(error)}
        onRetry={() => refetch()}  // Pass the retry function so user can recover
      />
    );
  }

  // Only render the actual data when we know it exists
  // This is the success state - we know data is not undefined
  return (
    <ul>
      {data.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

For mutations (form submissions, delete actions, any state change), the pattern is different. Loading happens on the button, not the whole screen.

```jsx
// Mutation example - submitting a form
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

function CreateUserForm() {
  const { mutate, isPending } = useMutation({
    mutationFn: (userData) => api.post('/users', userData),
    onSuccess: () => {
      // Success feedback - user knows the action completed
      toast.success('User created!');
      resetForm();  // Clear the form so they can add another
    },
    onError: (error) => {
      // Error feedback - user knows what went wrong
      toast.error(getErrorMessage(error));
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    mutate(Object.fromEntries(formData));
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Disable all inputs during submission - prevents modification while saving */}
      <input name="name" disabled={isPending} />
      <input name="email" disabled={isPending} />
      {/* Disable button and show loading state - prevents double submission */}
      <button type="submit" disabled={isPending}>
        {isPending ? <Spinner /> : 'Create User'}
      </button>
    </form>
  );
}
```

The error message helper is where you map backend error codes to user-friendly messages. This is the frontend-backend contract in action.

```jsx
// Reusable error message helper
function getErrorMessage(error) {
  // No response means the request never reached the server
  // This is a network error - user needs to check their connection
  if (!error.response) {
    return 'Check your internet connection';
  }

  // 401 means the user's token expired - they need to log in again
  if (error.response.status === 401) {
    return 'Your session expired. Please log in again.';
  }

  // 403 means the user is logged in but not allowed to do this
  if (error.response.status === 403) {
    return "You don't have permission to do this.";
  }

  // 404 means the resource doesn't exist - maybe it was deleted
  if (error.response.status === 404) {
    return 'The requested resource was not found.';
  }

  // 5xx means the server crashed - this is a temporary issue
  if (error.response.status >= 500) {
    return 'Something went wrong on our end. Please try again.';
  }

  // Fall back to whatever the backend sent, or a generic message
  return error.response.data?.error || 'Something went wrong';
}

// Reusable ErrorState component - consistent error UI across the app
function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      <p>{message}</p>
      {/* Retry button gives the user agency to recover */}
      <button onClick={onRetry}>Try Again</button>
    </div>
  );
}
```

For the initial app load, you handle critical data first. This prevents showing a broken app before you know if the user is even authenticated.

```jsx
function App() {
  const { user, loading: authLoading } = useAuth();
  const { isLoading: configLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.get('/config')
  });

  // Show branded loading screen while auth and config load
  // This is better than a blank screen - user knows the app is working
  if (authLoading || configLoading) {
    return <AppLoadingScreen />;
  }

  // Render app shell once critical data is ready
  // Non-critical data can load in the background
  return <Router />;
}
```

For skeleton screens, match the shape of the actual content. This reduces perceived load time because users see what's coming.

```jsx
function SkeletonList() {
  return (
    <ul>
      {/* Render 5 skeleton items to match the expected list length */}
      {[1, 2, 3, 4, 5].map((i) => (
        <li key={i}>
          {/* Match the actual structure: avatar, name, preview text */}
          <div className="skeleton-avatar" />
          <div className="skeleton-text" />
          <div className="skeleton-text-short" />
        </li>
      ))}
    </ul>
  );
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you handle loading and error states in a MERN app?**

Every network request has three possible states, and the UI must represent all three. I use TanStack Query because it tracks the request lifecycle automatically and gives me `isLoading`, `isError`, `error`, and `data` as booleans and values. For queries — fetching lists, details, any data read — I check `isLoading` first and return a skeleton component, then check `isError` and return an error state with a retry button, and finally render the actual data when both checks pass. For mutations — form submissions, delete actions, any state change — I use the `isPending` state to disable the submit button and show a loading indicator on the button itself. I create reusable components like `SkeletonList`, `ErrorState`, and `EmptyState` so every screen in the app has consistent loading and error behavior. The backend sends structured error responses with a message field, and I have a helper function that maps different HTTP status codes to user-friendly messages. The key is that the user always knows what's happening — they see loading when waiting, they see specific errors when something fails, and they see success when it works.

**Q: What are skeleton screens and when should you use them?**

Skeleton screens are placeholder UI elements that mimic the shape and layout of the content that will eventually load. Instead of showing a generic spinner in the center of the screen, you show gray boxes where the avatar, text lines, and images will appear. This reduces perceived load time because users see the structure of what's coming rather than just waiting for something to appear. I use skeletons for content areas where the shape is predictable and consistent: list items, cards, profile sections, table rows, and dashboard widgets. I use spinners for small actions where showing a skeleton would feel heavy: button clicks, form submissions, and inline actions. I also use spinners for full-page loads where the content shape isn't known yet, like after navigation to a new route. The key is matching the skeleton structure to the actual content structure so there's minimal layout shift when the real data loads — if the skeleton has three lines of text but the actual content has one, the jump is jarring.

**Q: How do you handle error states with retry functionality?**

I create a reusable `ErrorState` component that takes an error message and an `onRetry` callback. With TanStack Query, the `useQuery` hook returns a `refetch` function that I pass as the retry handler. The error message isn't generic — I have a helper function that checks the error type and returns specific guidance. Network errors (no response from the server) get "Check your internet connection." 401 errors get "Your session expired. Please log in again." 403 errors get "You don't have permission to do this." 404 errors get "The requested resource was not found." 5xx errors get "Something went wrong on our end. Please try again." For mutations, I show errors as toast notifications instead of blocking the whole screen, since the rest of the page can still function. The important thing is giving users both information about what happened and agency to recover — they should never be stuck with a generic error message and no way forward. The retry button is critical for transient errors like network glitches or temporary server issues.

**Q: How do you handle loading states for form submissions?**

For form submissions, I use the `isPending` state from `useMutation` to control the submit button and form inputs. I disable the entire form during submission by setting the `disabled` attribute on all inputs and the submit button when `isPending` is true. This prevents users from modifying their input while the request is in flight, which could cause confusion about what was actually submitted. I also change the submit button text to show a spinner or "Saving..." so users have visual confirmation that their request was received. On success, I show a success toast notification and either reset the form for another entry or navigate away to the next screen. On error, I show an error toast with the specific error message from the backend. For multi-step forms or long-running operations, I show a progress indicator so users know how far along the process is. The UX principle is that the user should never wonder whether their submission was received — the loading state must be immediate and unambiguous.

**Q: How do you handle loading states for initial app load?**

When the app first loads, there's a critical moment while authentication and configuration data are being fetched. I show a branded loading screen with the app logo or a simple animation during this time instead of a blank white screen. This reassures users that the app is working and loading. I prioritize critical data — auth check, user permissions, app configuration, feature flags — and wait for those to complete before rendering the app shell. Non-critical data like dashboard widgets, recommendations, or analytics can load in the background after the app shell is visible. Within the app, I use React Suspense for component-level loading boundaries so individual sections can show their own skeletons while loading their specific data. The key is that the user always sees something that looks intentional — a branded loading screen on initial load, skeletons for content areas, and spinners for small actions. A blank screen looks like a crash; a loading screen looks like the app is working.

## 6. The Traps — What Goes Wrong in Production

**Only handling the success state.** This is the most common and damaging mistake. Developers build the happy path in development where the API always responds quickly with correct data, and they ship without loading or error handling. In production, mobile networks are slow, servers go down, auth tokens expire, and requests time out. Users see blank screens, broken UI, or no feedback at all. They click buttons multiple times, refresh pages, and eventually leave. Every API call must have all three states handled — loading, error, and success. The production failure mode is that your app looks broken when it's actually just waiting or failed.

**Not disabling forms during submission.** Users click submit, nothing happens immediately because the request takes a few hundred milliseconds, so they click again. Now you have duplicate entries in your database. In e-commerce, this means duplicate orders and duplicate credit card charges. In social apps, this means duplicate posts. Always disable the submit button and the entire form during the mutation's `isPending` state. The button should visually indicate it's disabled — grayed out, changed text, or a spinner. The production failure mode is data corruption and angry customers who were charged twice.

**Showing generic "Something went wrong" messages.** This tells the user nothing and gives them no way to recover. Did their internet disconnect? Did their session expire? Did they send invalid data? Is the server down? Users can't fix what they don't understand. Map specific error types to specific messages. Network errors should suggest checking the connection. 401 errors should prompt re-authentication with a login button. 422 validation errors should highlight which field is invalid. 5xx errors should offer a retry button. The production failure mode is users giving up and contacting support when they could have self-recovered.

**Using skeletons for everything.** Skeletons are great for content areas where the shape matters, but they're overkill for small actions. A button click doesn't need a skeleton — a small spinner is better. Skeletons for tiny actions feel heavy and can actually make the app feel slower because the user sees more UI change than necessary. Use skeletons for lists, cards, profiles, and tables. Use spinners for buttons, small form fields, and inline actions. The production failure mode is the app feeling sluggish and over-engineered.

**Showing a blank screen on initial load.** When a user first opens your app, there's a moment while the auth check and initial data fetch happen. If you show nothing during this time, it looks like the app crashed or failed to load. Users on slow connections think something is broken and refresh or close the tab. Show a branded loading screen with your logo or a simple animation. It reassures users that the app is working and loading. The production failure mode is high bounce rate and users thinking the app is broken.

**Not retrying transient errors.** Network glitches and temporary server hiccups happen constantly in production. If you show an error but don't offer a retry, users have to refresh the whole page, which loses their place and any unsaved state. Pass the `refetch` function to your ErrorState component so users can retry just the failed request without losing their place in the app. The production failure mode is frustrated users refreshing the page repeatedly when a single retry would have worked.

**Forgetting about the backend contract.** The frontend can only handle errors well if the backend sends useful error information. If your API returns a generic 500 error with "Internal Server Error" for every failure, the frontend can't give users helpful guidance. Your API should return structured error responses with a message field in user-friendly language, a code field for programmatic handling, and optionally field-specific details for validation errors. Don't send stack traces to the frontend — those are for logs, not users. The production failure mode is a frontend that can't distinguish between different error types and shows generic messages to everyone.

**Loading state race conditions.** If you set loading state to true, make the request, but don't handle the case where the component unmounts before the request completes, you'll get "can't perform a React state update on an unmounted component" warnings. With TanStack Query, this is handled automatically. With manual state management, you need cleanup. The production failure mode is console errors and potential memory leaks in React DevTools, though it doesn't usually break the user experience.

## 7. Compare With Related Concepts

**Loading/error states vs optimistic updates.** Loading states show that something is happening while you wait for the server to respond. Optimistic updates pretend the request already succeeded and update the UI immediately, then roll back if the server returns an error. Use loading states when the operation is critical or when showing the wrong state briefly would be confusing or misleading — like payments, deletions, or any action where being wrong briefly is worse than being slow. Use optimistic updates for actions that feel instant and are easy to undo if they fail — like liking a post, toggling a setting, or reordering a list. The tradeoff is user perception (optimistic feels faster) vs correctness risk (loading is safer).

**Loading states vs suspense boundaries.** React Suspense is a declarative way to handle loading states at the component level. You wrap a component in `<Suspense fallback={<Skeleton />}>` and React shows the fallback while that component's data is loading, without you manually checking `isLoading`. TanStack Query integrates with Suspense, so you can let React handle the loading state instead of writing if statements. Use Suspense when you want component-level loading boundaries and want to reduce boilerplate in your components. Use manual loading states when you need fine-grained control over the loading UI — like showing different loading states for different error types, or when you need to coordinate loading across multiple related requests.

**Error states vs global error boundaries.** Error states handle expected failures like API errors, network issues, and authentication problems — things you know can happen and plan for. Error boundaries catch unexpected JavaScript crashes anywhere in the component tree — null reference errors, undefined property access, bugs in your code. You need both in a production app. Error states provide graceful degradation when things fail predictably, so users can continue using parts of the app. Error boundaries prevent the whole app from white-screening when a bug crashes a component, so the rest of the app stays functional. Error states are for expected failures; error boundaries are for unexpected crashes.

**Skeleton screens vs spinners.** Skeletons show the shape and layout of content that will eventually load. Spinners just indicate that something is loading without showing what. Use skeletons when the content shape is predictable and you want to reduce perceived load time — lists, cards, profile pages, tables. The skeleton tells users what's coming, so the wait feels shorter. Use spinners when the content shape isn't known yet or the action is small — button clicks, form submissions, full-page loads after navigation. Skeletons are more work to implement because you have to match the actual structure, but they feel more polished for content-heavy screens. Spinners are simpler and work better for small, isolated actions.

## 8. 🧠 The Memory Hook

Every API call is an elevator: press the button and it lights up (loading), if it gets stuck the display tells you what's wrong and what to do (error with recovery), when the doors open you walk through (success). Never leave users pressing a button that doesn't light up.
