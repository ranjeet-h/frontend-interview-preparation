# How do you handle loading/error states

## 1. The Real-World Problem — When You Actually Hit This

Your app has been working fine in development. Then you deploy it to production, and users start complaining. The page sits there blank for seconds while data loads. When the API finally responds with an error, the user sees nothing — or worse, a generic "Something went wrong" message with no way to recover. Someone clicks a submit button twice because nothing happened immediately, and now you have duplicate orders in your database. The auth check fails silently, and the app tries to render a dashboard without knowing who the user is.

This is the moment you realize that every API call has three possible states — loading, error, and success — and your UI needs to handle all three of them properly. Not just the happy path.

## 2. The Analogy — Make the Mechanic Obvious

Think of a traffic light system. Red means "wait" — the light is about to change, and you need to stop until it's safe to proceed. Yellow means "caution" — something unexpected happened, and you need to pay attention to what's going on. Green means "go" — everything is clear, and you can proceed.

In your app, every API call is like approaching an intersection. The request goes out, and while you're waiting for the response, you show a red light (loading state). If something goes wrong — network down, server error, auth expired — you show a yellow light (error state) that tells the user what happened and gives them a way to try again. Only when the response comes back successfully do you show the green light (success state) and display the actual data.

Just like a traffic light, you never skip the red or yellow. You don't let cars drive through a broken intersection, and you don't let users stare at a blank screen while your app does something in the background.

## 3. The Full Explanation — How It Actually Works

Every asynchronous operation in a full-stack app has three possible states. The request starts in a loading state — the user needs to know something is happening. Then the request either succeeds or fails. If it succeeds, you show the data. If it fails, you show an error message and ideally a way to recover.

The backend sends this information through HTTP status codes and response bodies. A 200-299 status means success, and the response body contains the data you asked for. A 4xx status means the client did something wrong — maybe bad credentials, invalid input, or a missing resource. A 5xx status means the server had a problem — maybe a database connection failed or an unhandled exception crashed the request. A network error means the request never even reached the server.

The frontend needs to map all of these possibilities to UI states. A loading state prevents the user from interacting with something that's about to change. An error state explains what went wrong and offers a path forward — retry, login again, fix the input, or contact support. A success state shows the actual content.

For data fetching (queries), you typically show a skeleton or spinner while loading, an error message with retry when it fails, and the list or detail view when it succeeds. For data mutations (form submissions), you disable the submit button while the request is in flight, show an error toast if it fails, and either navigate away or show a success message if it succeeds.

The key insight is that the backend contract and the frontend state machine must be designed together. The backend should send structured error messages that the frontend can display meaningfully. The frontend should handle every status code the backend can return, not just 200.

## 4. See It In Practice — Real Code or Queries

Here's how you handle loading and error states in a MERN app using TanStack Query:

```jsx
// Query example - fetching a list of users
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

function UserList() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users')
  });

  if (isLoading) {
    return <SkeletonList />; // Show placeholder while loading
  }

  if (isError) {
    return (
      <ErrorState
        message={getErrorMessage(error)}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <ul>
      {data.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}

// Mutation example - submitting a form
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

function CreateUserForm() {
  const { mutate, isPending } = useMutation({
    mutationFn: (userData) => api.post('/users', userData),
    onSuccess: () => {
      toast.success('User created!');
      resetForm();
    },
    onError: (error) => {
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
      <input name="name" disabled={isPending} />
      <input name="email" disabled={isPending} />
      <button type="submit" disabled={isPending}>
        {isPending ? <Spinner /> : 'Create User'}
      </button>
    </form>
  );
}

// Reusable error message helper
function getErrorMessage(error) {
  if (!error.response) {
    return 'Check your internet connection';
  }
  if (error.response.status === 401) {
    return 'Your session expired. Please log in again.';
  }
  if (error.response.status === 403) {
    return "You don't have permission to do this.";
  }
  if (error.response.status === 404) {
    return 'The requested resource was not found.';
  }
  if (error.response.status >= 500) {
    return 'Something went wrong on our end. Please try again.';
  }
  return error.response.data?.error || 'Something went wrong';
}

// Reusable ErrorState component
function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      <p>{message}</p>
      <button onClick={onRetry}>Try Again</button>
    </div>
  );
}
```

For the initial app load, you handle critical data first:

```jsx
function App() {
  const { user, loading: authLoading } = useAuth();
  const { isLoading: configLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.get('/config')
  });

  // Show branded loading screen while auth and config load
  if (authLoading || configLoading) {
    return <AppLoadingScreen />;
  }

  // Render app shell once critical data is ready
  return <Router />;
}
```

For skeleton screens, match the shape of the actual content:

```jsx
function SkeletonList() {
  return (
    <ul>
      {[1, 2, 3, 4, 5].map((i) => (
        <li key={i}>
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

Every API call has three states: loading, error, and success. I use TanStack Query because it gives me `isLoading`, `isError`, `error`, and `data` out of the box. For queries, I render a skeleton during loading, an error state with a retry button when it fails, and the actual content when it succeeds. For mutations, I show a loading spinner on the submit button and disable the form to prevent duplicate submissions. I create reusable components — Skeleton, ErrorState, EmptyState — so every screen has consistent loading and error behavior. The backend sends structured error messages, and the frontend maps different status codes to user-friendly messages.

**Q: What are skeleton screens and when should you use them?**

Skeleton screens are placeholder UI elements that mimic the shape of the content being loaded. Instead of showing a generic spinner, you show gray boxes where the avatar, text, and images will eventually appear. This reduces perceived load time because users see what's coming rather than just waiting. I use skeletons for content areas where the shape is predictable: list items, cards, profile sections, tables. I use spinners for small actions like button clicks and form submissions, and for full-page loads where the content shape isn't known yet. The key is matching the skeleton shape to the actual content so there's minimal layout shift when the real data loads.

**Q: How do you handle error states with retry functionality?**

I create a reusable ErrorState component that displays the error message and a retry button. With TanStack Query, I pass the `refetch` function as the `onRetry` handler. I customize error messages based on the error type — network errors get "check your connection," 401 gets "session expired," 404 gets "not found," and 5xx errors get "something went wrong on our end." For mutations, I show errors in toast notifications instead of blocking the whole screen. The important thing is giving users both information about what happened and agency to fix it — never leave them stuck with a generic error message and no way forward.

**Q: How do you handle loading states for form submissions?**

I use the `isPending` state from `useMutation` to show loading on the submit button and disable the entire form during submission. This prevents users from clicking submit multiple times and creating duplicate entries. I replace the button text with a spinner or change it to "Saving..." so users know their request is being processed. On success, I show a success toast and either reset the form or navigate away. On error, I show an error toast with the specific error message. For multi-step forms, I show a progress indicator so users know how far along they are. The UX principle is: never leave the user wondering whether their submission was received.

**Q: How do you handle loading states for initial app load?**

On app load, I show a branded loading screen while the auth check and critical configuration data load. Once those are ready, I render the app shell and load non-critical data in the background. I prioritize critical data — auth, user permissions, app configuration — over non-critical data like dashboard widgets or recommendations. I use React Suspense for component-level loading within the app so individual sections can show their own skeletons while loading. The key is never showing a blank white screen — always show some kind of loading indicator that matches the app's branding so users know the app is working.

## 6. The Traps — What Goes Wrong in Production

**Only handling the success state.** This is the most common mistake. Developers build the happy path and assume the API always responds quickly with correct data. In production, networks fail, servers go down, auth tokens expire, and requests time out. If you don't handle loading and error states, users see blank screens, broken UI, or no feedback at all. Every API call must have all three states handled.

**Not disabling forms during submission.** Users click submit, nothing happens immediately, so they click again. Now you have duplicate entries in your database. Or worse, duplicate payment charges. Always disable the submit button and the entire form during the mutation's `isPending` state. The button should visually indicate it's disabled.

**Showing generic "Something went wrong" messages.** This tells the user nothing and gives them no way to recover. Did their internet disconnect? Did their session expire? Did they send invalid data? Map specific error types to specific messages. Network errors should suggest checking the connection. 401 errors should prompt re-authentication. Validation errors should show which field is invalid. Always provide a retry button for transient errors.

**Using skeletons for everything.** Skeletons are great for content areas where the shape matters, but they're overkill for small actions. A button click doesn't need a skeleton — a small spinner is better. Skeletons for tiny actions feel heavy and can actually make the app feel slower. Use skeletons for lists, cards, and profiles. Use spinners for buttons, small form fields, and inline actions.

**Showing a blank screen on initial load.** When a user first opens your app, there's a moment while the auth check and initial data fetch happen. If you show nothing during this time, it looks like the app is broken. Show a branded loading screen with your logo or a simple animation. It reassures users that the app is working and loading.

**Not retrying transient errors.** Network glitches and temporary server hiccups happen. If you show an error but don't offer a retry, users have to refresh the whole page. Pass the `refetch` function to your ErrorState component so users can retry just the failed request without losing their place in the app.

**Forgetting about the backend contract.** The frontend can only handle errors well if the backend sends useful error information. Your API should return structured error responses with a message field that explains what went wrong in user-friendly language. Don't send stack traces to the frontend — those are for logs, not users.

## 7. Compare With Related Concepts

**Loading/error states vs optimistic updates.** Loading states show that something is happening while you wait for the server. Optimistic updates pretend the request already succeeded and update the UI immediately, then roll back if it fails. Use loading states when the operation is critical or when showing the wrong state briefly would be confusing — like payments or deletions. Use optimistic updates for actions that feel instant and are easy to undo, like liking a post or toggling a setting.

**Loading states vs suspense boundaries.** React Suspense is a declarative way to handle loading states at the component level. You wrap a component in `<Suspense fallback={<Skeleton />}>` and React shows the fallback while that component's data is loading. TanStack Query integrates with Suspense, so you can let React handle the loading state instead of manually checking `isLoading`. Use Suspense when you want component-level loading boundaries and want to reduce boilerplate. Use manual loading states when you need fine-grained control over the loading UI.

**Error states vs global error boundaries.** Error states handle expected failures like API errors and network issues. Error boundaries catch unexpected JavaScript crashes anywhere in the component tree. You need both — error states for graceful degradation when things fail predictably, error boundaries to prevent the whole app from white-screening when a bug crashes a component.

**Skeleton screens vs spinners.** Skeletons show the shape of content that's coming. Spinners just say "something is loading." Use skeletons when the content shape is predictable and you want to reduce perceived load time — lists, cards, profile pages. Use spinners when the content shape isn't known or the action is small — button clicks, form submissions, full-page loads. Skeletons are more work to implement but feel more polished for content-heavy screens.

## 8. 🧠 The Memory Hook

Every API call is a traffic light: red means wait (loading), yellow means caution with a retry button (error), green means go show the data (success). Never skip the red or yellow.
