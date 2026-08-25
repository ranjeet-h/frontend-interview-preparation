# Error Boundaries in React

## 1. Why This Exists — The Problem First

Picture an e-commerce dashboard on Black Friday. The page contains a top navigation bar, an active shopping cart with three high-value items, a checkout form where the user is typing their payment details, and at the bottom, a small "Recommended Accessories" carousel. 

A backend API unexpectedly returns a single recommendation product where the `metadata` property is `null` instead of an object. The carousel component attempts to execute `item.metadata.badge.toLowerCase()`. In vanilla JavaScript, a failure inside a utility function or event handler might log an unhandled exception to the browser console while the rest of the webpage remains usable. 

In React 16 and later, unhandled errors thrown during the render cycle trigger a destructive fail-safe: React unmounts the entire component tree from the DOM. The user's screen instantly flashes to a stark, blank white page—the dreaded "White Screen of Death." The user loses their active checkout form, their filled address inputs, and their shopping cart context. They cannot even click the navigation menu or the customer support widget.

Standard JavaScript `try...catch` blocks cannot solve this problem across your UI. When you write `<RecommendationCarousel />` in a parent component, you are not invoking the component's rendering logic at that moment; you are simply creating a lightweight React element descriptor (`React.createElement`). React executes the actual component function and constructs the DOM later during its internal Fiber reconciliation pass. By the time the crash occurs, the parent's `try...catch` block has already finished executing and exited the call stack.

Error Boundaries exist to introduce declarative, hierarchical fault tolerance into the React tree. They allow you to draw containment zones around unstable or third-party widgets, catch rendering crashes before they bubble to the root, log telemetry to monitoring services, and render graceful fallback UI without taking down the rest of the application.

## 2. The Analogy — Make It Obvious

Think of an Error Boundary as a submarine's watertight bulkhead door.

A modern submarine is not built as one giant, continuous hollow tube. It is engineered with sealed compartments separated by heavy, automated bulkhead doors. Under normal cruising conditions, crew members and air circulate freely across all sections. 

If a collision punctures a hull breach in the rear auxiliary storage room, water immediately rushes in. Instead of allowing the floodwaters to sweep through the entire vessel and drag the submarine to the ocean floor, the bulkhead doors on either side of the storage room slam shut. That single compartment is flooded and sealed off, but the navigation bridge, the nuclear reactor, the propulsion engines, and the life support systems in every other compartment remain completely dry, powered, and operational. 

Here is how each piece maps to React:

- **The Watertight Compartment:** A subtree of child components wrapped inside an `<ErrorBoundary>` tag.
- **The Hull Breach:** An uncaught JavaScript runtime error (such as a null pointer or undefined property access) thrown during component rendering.
- **The Bulkhead Door Slamming Shut:** `static getDerivedStateFromError` intercepting the error and switching the boundary's state to render fallback UI.
- **The Damage Report Sent to the Bridge:** `componentDidCatch` capturing the error object and component stack trace to send to telemetry systems like Sentry or Datadog.
- **Pumping Out the Water and Opening the Door:** Resetting the error boundary state via user action (a "Try Again" button) or a route transition to restore the original UI.
- **An Uncompartmentalized Ship Sinking:** An unhandled error in a React app without boundaries, causing React to unmount the entire application tree and leave a blank screen.

## 3. How It Actually Works — The Full Explanation

React builds and updates user interfaces using a two-phase architecture: the **Render Phase** (reconciliation where React computes virtual DOM changes and executes component functions) and the **Commit Phase** (where React mutates the actual browser DOM and executes layout/mount effects).

When a component throws an unhandled exception during rendering, in a constructor, or during a lifecycle method, React halts normal work on that fiber node and begins unwinding the Fiber work loop (`throwException` in React Fiber internals). React inspects the current fiber's parent chain, walking upward through the tree toward the root container to locate the nearest ancestor component configured as an Error Boundary.

To qualify as an Error Boundary, a component must be a Class Component that defines one or both of two special lifecycle methods:

**1. `static getDerivedStateFromError(error)` (Render Phase):**
This is a pure static method invoked synchronously during the render phase immediately after an error is thrown in a descendant. It receives the thrown error and must return a state object (for example, `{ hasError: true, error }`). Because it executes during the render phase, it must not perform side effects. Its sole responsibility is updating state so React can render the fallback UI in the very same render pass.

**2. `componentDidCatch(error, errorInfo)` (Commit Phase):**
This lifecycle method runs during the commit phase, after React has committed the fallback UI to the browser DOM. It receives the original `error` object and an `errorInfo` object containing a `componentStack` string. The component stack traces the exact React component hierarchy that led to the crash (e.g., `in CommentList > in CommentCard > in div`). This is the designated location for side effects, such as dispatching diagnostic reports to Sentry, DataDog, or internal logging endpoints.

If React walks up the entire Fiber tree and reaches the root without finding any Error Boundary, it treats the application state as corrupted and unmounts the entire host root container.

### What Error Boundaries Catch vs What They Miss

Understanding the exact boundaries of what Error Boundaries capture is essential:

**What Error Boundaries DO Catch:**
- Errors thrown inside the body of functional components during rendering.
- Errors thrown inside class component `render()` methods.
- Errors thrown inside component constructors.
- Errors thrown inside lifecycle methods (`componentDidMount`, `componentDidUpdate`, `componentWillUnmount`).
- Errors thrown inside `useMemo`, `useCallback`, and `useLayoutEffect` hooks during execution.
- Errors thrown inside child component `useEffect` callbacks during the commit phase.

**What Error Boundaries DO NOT Catch:**
- **Event Handlers (e.g., `onClick`, `onSubmit`):** Event handlers do not run during React's render phase. They execute in the browser's JavaScript event loop triggered by user events long after React has finished rendering. An unhandled error in an `onClick` handler will log to the console, but it will not crash the component tree or trigger an Error Boundary. To catch these, use standard `try...catch` inside the handler.
- **Asynchronous Code (e.g., `setTimeout`, `setInterval`, `requestAnimationFrame`):** Callbacks scheduled on the browser task queue execute outside React's Fiber execution context.
- **Async/Promise Rejections in Data Fetching:** Unhandled promise rejections inside `fetch` or `axios` calls do not trigger Error Boundaries unless bridged explicitly.
- **Server-Side Rendering (SSR):** Errors thrown during Node.js streaming or server-side string rendering must be handled by the server framework's request/response stream handlers.
- **Errors Inside the Error Boundary Itself:** An Error Boundary catches errors in its *children*, not errors thrown inside its own `render()` or `getDerivedStateFromError()` methods. If a boundary crashes, the error bubbles up to the next outer boundary.

### Resetting and Error Recovery

A well-designed Error Boundary does not leave the user stranded on a dead fallback screen. Recovery typically follows three patterns:

- **State-driven Reset:** The fallback UI renders a "Try Again" button that calls `this.setState({ hasError: false, error: null })`.
- **Key-based Reset:** Changing a `key` prop on the `<ErrorBoundary key={currentRoute}>` causes React to unmount the failed instance and mount a fresh boundary with pristine initial state.
- **Prop-driven Reset Keys (`resetKeys`):** The boundary accepts an array of dependencies (such as a search query or URL parameter). In `componentDidUpdate`, if any dependency in `resetKeys` changes, the boundary automatically clears its error state and attempts to re-render the children.

### Strategic Placement: The Multi-Layer Blast Radius

Senior frontend architecture structures Error Boundaries in concentric defensive layers:

- **Global / Root Layer:** Wraps the entire application. Acts as the safety net of last resort. If an uncaught bug escapes all inner boundaries, this prevents the white screen and displays a branded "Something went wrong — please reload" page with a contact support link.
- **Route / Page Layer:** Wraps individual page routes (e.g., `/dashboard`, `/settings`, `/checkout`). A crash in the settings panel will display a page-level error state while keeping the global header, sidebar navigation, and user authentication session fully operational.
- **Feature / Widget Layer:** Wraps isolated, complex, or data-volatile widgets (e.g., third-party charting libraries, real-time comment streams, user-generated content feeds). A failure in one chart renders a clean "Chart unavailable" placeholder card while the rest of the dashboard remains completely interactive.

## 4. Real Code — See It Working

Here is a production-grade, reusable TypeScript Error Boundary implementation supporting fallback rendering, side-effect logging, and automatic reset keys:

```tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

export interface FallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackRender?: (props: FallbackProps) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
  resetKeys?: Array<unknown>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Pure function: update state so the next render shows fallback UI
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Commit phase: safe for side effects, telemetry, and external error logging
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  public componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    const { hasError } = this.state;
    const { resetKeys } = this.props;

    // If we are in an error state and resetKeys changed, automatically reset
    if (hasError && prevProps.resetKeys && resetKeys) {
      const hasKeyChanged = resetKeys.some(
        (key, index) => !Object.is(key, prevProps.resetKeys?.[index])
      );

      if (hasKeyChanged) {
        this.resetErrorBoundary();
      }
    }
  }

  public resetErrorBoundary = (): void => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  public render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, fallbackRender } = this.props;

    if (hasError && error) {
      if (fallbackRender) {
        return fallbackRender({
          error,
          resetErrorBoundary: this.resetErrorBoundary,
        });
      }
      if (fallback) {
        return fallback;
      }
      return (
        <div style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <h3>Something went wrong in this section.</h3>
          <button onClick={this.resetErrorBoundary}>Try Again</button>
        </div>
      );
    }

    return children;
  }
}
```

Now, let us see how this boundary is deployed in a granular dashboard architecture to isolate widget failures:

```tsx
import React, { useState } from 'react';
import { ErrorBoundary, FallbackProps } from './ErrorBoundary';

// Volatile component that might throw on corrupt data
function RevenueChart({ currency }: { currency: string }) {
  const [data] = useState<{ rates: Record<string, number> } | null>(null);

  // Intentional runtime crash if data is null
  if (!data) {
    throw new Error(`Failed to load exchange rates for ${currency}`);
  }

  return <div>Chart rendering for {currency}: {data.rates[currency]}</div>;
}

// Resilient, isolated widget fallback
function WidgetErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #f87171', padding: '16px', borderRadius: '6px' }}>
      <h4 style={{ margin: '0 0 8px 0', color: '#991b1b' }}>Widget Error</h4>
      <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#7f1d1d' }}>{error.message}</p>
      <button
        onClick={resetErrorBoundary}
        style={{ padding: '6px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        Retry Widget
      </button>
    </div>
  );
}

export function AnalyticsDashboard() {
  const [selectedCurrency, setSelectedCurrency] = useState('USD');

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <header style={{ marginBottom: '20px', borderBottom: '1px solid #ccc', paddingBottom: '12px' }}>
        <h2>Financial Overview</h2>
        <select value={selectedCurrency} onChange={(e) => setSelectedCurrency(e.target.value)}>
          <option value="USD">USD ($)</option>
          <option value="EUR">EUR (€)</option>
          <option value="GBP">GBP (£)</option>
        </select>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Isolated Boundary 1: Chart Widget */}
        <section>
          <h3>Revenue Projections</h3>
          <ErrorBoundary
            fallbackRender={WidgetErrorFallback}
            resetKeys={[selectedCurrency]} // Automatically retries when user picks another currency
            onError={(error, info) => console.error('Logged to telemetry:', error, info.componentStack)}
          >
            <RevenueChart currency={selectedCurrency} />
          </ErrorBoundary>
        </section>

        {/* Stable Section: Remains 100% operational even if the chart crashes */}
        <section style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '16px', borderRadius: '6px' }}>
          <h3 style={{ margin: '0 0 8px 0' }}>Recent Transactions</h3>
          <ul>
            <li>Payment from Acme Corp: +$12,450.00</li>
            <li>Subscription renewal: +$99.00</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
```

### Bridging Asynchronous Errors into an Error Boundary

Because Error Boundaries do not catch async exceptions by default, we can use a custom hook or state bridge that re-throws the error during the next render cycle:

```tsx
import { useState, useCallback } from 'react';

// Custom hook to bridge async errors into the nearest Error Boundary
export function useAsyncError() {
  const [, setError] = useState();

  return useCallback(
    (error: Error) => {
      setError(() => {
        // Throwing inside a state updater causes React to re-render
        // and catch the error in the nearest ancestor Error Boundary
        throw error;
      });
    },
    []
  );
}

// Usage inside an async component
export function UserProfileCard({ userId }: { userId: string }) {
  const throwAsyncError = useAsyncError();

  const handleDownloadReport = async () => {
    try {
      const res = await fetch(`/api/users/${userId}/report`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to generate report`);
      const data = await res.json();
      console.log('Report ready:', data);
    } catch (err) {
      // Forward the async network error to the nearest Error Boundary
      throwAsyncError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  return (
    <div>
      <h4>User Profile</h4>
      <button onClick={handleDownloadReport}>Download Statement</button>
    </div>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a React Error Boundary, and what exact problem does it solve?**

An Error Boundary is a React component that intercepts JavaScript runtime errors thrown anywhere within its child component tree during rendering, lifecycle methods, and constructors. Instead of allowing an unhandled exception to crash and unmount the entire application into a blank white screen, the Error Boundary catches the error, logs diagnostic details (such as the component stack trace) to an observability service, and renders a localized fallback UI. It introduces declarative fault containment zones into the React Fiber tree.

**Q: What categories of errors do Error Boundaries catch, and what categories do they miss? Why?**

Error Boundaries catch errors that occur synchronously during React's internal execution phases:
1. Component function bodies and class `render()` methods during JSX evaluation.
2. Component constructors.
3. Lifecycle methods like `componentDidMount`, `componentDidUpdate`, and `componentWillUnmount`.
4. Standard and custom hooks during render (`useMemo`, `useCallback`, `useLayoutEffect`, and `useEffect` callbacks during commit).

They do NOT catch:
1. **Event handlers (`onClick`, `onChange`):** These run in the browser event loop outside of React's render/commit cycle.
2. **Asynchronous callbacks (`setTimeout`, `Promise.catch`, `fetch`):** These execute on the event loop queues after the current render pass has finished.
3. **Server-Side Rendering (SSR):** SSR errors happen on the server stream before client-side hydration.
4. **Errors within the boundary itself:** A boundary cannot catch exceptions thrown inside its own `render()` or `getDerivedStateFromError()`.

The reason for this distinction is architectural: Error Boundaries are wired into React's Fiber work loop (`throwException`). When code runs outside that work loop (like a user click or a resolved `setTimeout`), React is not executing its reconciliation pipeline, so the error does not pass through the Fiber tree walker.

**Q: Why are Error Boundaries still implemented as Class Components rather than Function Components with Hooks?**

React requires two specific lifecycle methods for error containment: `static getDerivedStateFromError` (which must run synchronously during the render phase to compute fallback state without causing side effects) and `componentDidCatch` (which runs during the commit phase for telemetry side effects). 

In React's internal architecture, hook state is stored as a linked list attached to the fiber. When a component throws an error during rendering, its hook list execution is aborted mid-flight, making it unsafe to rely on subsequent hook calls within that same failing fiber. While the React core team has explored a potential `useErrorBoundary` hook, coordinating clean phase separation and fallback rendering within functional fibers without breaking pure render invariants remains challenging. Therefore, Class Components remain the official core primitive, though libraries like `react-error-boundary` wrap this class in convenient functional wrappers.

**Q: What is the difference between `static getDerivedStateFromError` and `componentDidCatch`? Why do both exist?**

They exist to separate pure state calculation from impure side effects across React's two-phase lifecycle:

- `static getDerivedStateFromError(error)` runs during the **Render Phase**. It is a pure, static method with no access to `this`. It receives the thrown error and returns a state update (`{ hasError: true }`). React calls this immediately upon catching the crash so it can schedule a re-render with the fallback UI. Because the render phase may be aborted or restarted by React (especially in Concurrent Mode), side effects here are strictly prohibited.
- `componentDidCatch(error, errorInfo)` runs during the **Commit Phase**. It runs after React has successfully mounted the fallback UI to the real DOM. It receives the error and an `errorInfo` object containing the `componentStack`. This method has access to `this` and is the designated place to trigger side effects, such as sending log payloads to monitoring platforms or triggering external alerts.

**Q: How do you capture and route asynchronous errors (like failed `fetch` calls or `setTimeout`) into an Error Boundary?**

Because async operations run outside the Fiber work loop, you must bridge them back into React's render phase. The standard pattern is to use a state updater function that throws inside the React dispatch loop:

```tsx
function useAsyncError() {
  const [, setError] = useState();
  return useCallback((err: Error) => {
    setError(() => {
      throw err; // Throws during React's state transition, routing it to the boundary
    });
  }, []);
}
```

Alternatively, when using the popular `react-error-boundary` library, you can invoke the `useErrorBoundary` hook's `showBoundary(error)` method, which executes this exact mechanism internally.

**Q: How do you design an Error Boundary reset strategy so users can recover without refreshing the whole page?**

A robust recovery strategy utilizes three coordinated mechanisms:
1. **Interactive Reset:** Expose a `resetErrorBoundary` function to the fallback UI that clears the boundary's error state (`{ hasError: false, error: null }`), allowing the user to click a "Try Again" button.
2. **Prop Dependency Reset (`resetKeys`):** Pass an array of values (like the current URL pathname, search query, or active entity ID) into the boundary. When `componentDidUpdate` detects that any `resetKey` has changed via shallow comparison, it automatically invokes `resetErrorBoundary()`.
3. **Key Remounting:** In routing setups, assign the route path as the boundary's `key` (`<ErrorBoundary key={location.pathname}>`). Navigating to a new route destroys the old boundary fiber and mounts a brand-new instance with initial clean state.

**Q: How should you structure Error Boundaries in a large-scale production application?**

Apply a multi-tiered containment strategy:
- **Tier 1 (Root Level):** Wrap the entire app at the root provider level. Shows a global disaster recovery screen if critical layout/root context crashes.
- **Tier 2 (Route / Layout Level):** Wrap each major page view inside your router layout (e.g., in Next.js `error.tsx` or React Router `errorElement`). If the `/settings` page crashes, the navigation sidebar, header, and active session remain interactive.
- **Tier 3 (Widget / Feature Level):** Wrap complex, high-risk, or third-party components (e.g., analytics charts, rich-text editors, video players, ad slots, comment feeds). If a chart fails to render due to unexpected data format, only that 300px card renders a fallback placeholder while the rest of the page remains 100% usable.

**Q: How do Error Boundaries interact with React Suspense and Server Components?**

Error Boundaries and Suspense are designed to be complementary structural wrappers in the Fiber tree:
- `<Suspense>` catches **Promises** thrown by child components during rendering to display temporary loading spinners.
- `<ErrorBoundary>` catches **Errors** thrown by child components during rendering to display fallback error views.

When using React Suspense for data fetching (or React 19's `use()` hook), if the fetched promise rejects, Suspense does not handle the rejection; instead, it bubbles the rejected error up to the nearest enclosing `<ErrorBoundary>`. The standard production pattern is nesting Suspense inside an Error Boundary:
```tsx
<ErrorBoundary fallback={<ErrorCard />}>
  <Suspense fallback={<LoadingSkeleton />}>
    <AsyncDataWidget />
  </Suspense>
</ErrorBoundary>
```

## 6. The Traps — What Goes Wrong

### Trap 1: Expecting Error Boundaries to Catch `onClick` and Form Submission Errors
- **The Mistake:** Wrapping a form in an Error Boundary and assuming that an uncaught exception inside `handleSubmit` or `button.onClick` will display the boundary's fallback UI.
- **Why It Fails:** Event handlers execute in the browser's JavaScript event loop after React has already completed its render and commit phases. React is not reconciling the virtual DOM when you click a button.
- **What Happens:** The error logs to the browser console as an `Uncaught Error`, but the Error Boundary does not trigger, and no fallback UI is displayed.
- **The Fix:** Handle event errors with traditional `try...catch` blocks to display inline validation messages, or use `showBoundary(error)` to intentionally route it to the boundary.

### Trap 2: Relying Solely on a Single Root-Level Error Boundary
- **The Mistake:** Adding one Error Boundary around the `<App />` component in `index.tsx` and calling error handling complete.
- **Why It Fails:** An error in a non-critical component (such as an optional footer banner or avatar badge) bubbles all the way to the top. The root boundary catches it and unmounts the *entire* application.
- **What Happens:** The user experiences a full-page crash over a trivial widget failure, destroying active form state and blocking navigation.
- **The Fix:** Implement granular boundaries around independent widgets and page-level routes so failures are contained to their smallest possible blast radius.

### Trap 3: Crashing Inside the Fallback UI or the Boundary's Own Methods
- **The Mistake:** Writing complex rendering logic or accessing nullable properties inside the Error Boundary's own `render()` method or fallback component without defensive safeguards.
- **Why It Fails:** An Error Boundary only catches errors in its *children*. It cannot catch errors thrown within its own `render()` function or `getDerivedStateFromError()`.
- **What Happens:** The secondary error bubbles to the next ancestor boundary. If none exists, the entire application unmounts.
- **The Fix:** Keep fallback components minimal, statically styled, and defensive. Avoid complex data transformations or risky hooks inside fallback UI.

### Trap 4: Conflating API Business Errors with Render Crashes
- **The Mistake:** Using Error Boundaries as the primary mechanism to display expected HTTP states (such as a 404 Not Found, 401 Unauthorized, or 422 Form Validation error).
- **Why It Fails:** Expected API responses are normal data-fetching states, not software bugs. Forcing them through Error Boundaries conflates operational telemetry (logging actual code crashes to Sentry) with standard user interface states.
- **What Happens:** Sentry gets flooded with thousands of benign 404/validation errors, and you lose fine-grained control over contextual UI feedback (like displaying red text under an input field).
- **The Fix:** Model expected API responses using server-state tools (TanStack Query, RTK Query) with standard `isError` / `error` properties. Reserve Error Boundaries for unexpected exceptions and rendering crashes.

### Trap 5: Triggering an Infinite Reset Loop on Retry
- **The Mistake:** Rendering a "Try Again" button that calls `resetErrorBoundary()` without fixing or changing the underlying data or props that caused the crash.
- **Why It Fails:** When the boundary resets `hasError: false`, React immediately re-renders the exact same child component with the exact same corrupt props or state.
- **What Happens:** The child throws immediately during the retry render. The boundary catches it and shows the fallback again within milliseconds. If automated, this can lock the main thread in an infinite render loop.
- **The Fix:** Combine reset buttons with state invalidation (e.g., refetching clean data, clearing cached inputs) or use `resetKeys` so retries only execute when input parameters change.

## 7. Compare With Related Concepts

### Error Boundary vs JavaScript `try...catch`
- **The Difference:** `try...catch` is an imperative JavaScript construct that catches synchronous exceptions occurring within its immediate execution block on the active call stack. An Error Boundary is a declarative React component that catches exceptions occurring anywhere in its descendant component tree during React's asynchronous reconciliation and commit phases.
- **When to Use Which:** Use `try...catch` for imperative code: event handlers, asynchronous utilities, `JSON.parse` operations, and data transformation scripts. Use Error Boundaries for declarative UI trees to prevent rendering exceptions from unmounting parent components.

### Error Boundary vs API Error State (`isLoading` / `isError`)
- **The Difference:** API error states manage *expected* operational responses from the network (e.g., invalid passwords, empty search results, HTTP 500 server downtime) as standard reactive state. Error Boundaries handle *unexpected* software bugs and syntax/null errors (e.g., `TypeError: Cannot read property of undefined`) that interrupt React rendering.
- **When to Use Which:** Use API error state to render user-friendly guidance for expected network outcomes. Use Error Boundaries as a defensive net for unhandled bugs and corrupt data structures.

### Error Boundary vs React Suspense (`<Suspense fallback={...}>`)
- **The Difference:** Both use the same Fiber tree unwinding mechanic, but Suspense intercepts thrown **Promises** to manage asynchronous loading states, whereas Error Boundaries intercept thrown **Exceptions (Errors)** to manage failure states.
- **When to Use Which:** Use Suspense to coordinate pending asynchronous operations (code-splitting, React 19 `use()`, server component streaming). Wrap Suspense boundaries inside Error Boundaries to catch rejected promises and render failures.

### Error Boundary vs Global Window Handlers (`window.onerror` / `window.onunhandledrejection`)
- **The Difference:** `window.onerror` is a browser-level global event listener that captures unhandled runtime errors across all scripts on the page for raw telemetry. It cannot alter React's Fiber tree or render replacement DOM elements. An Error Boundary operates directly on React's Fiber reconciliation loop and can substitute a broken subtree with fallback React components.
- **When to Use Which:** Use `window.onerror` and `window.onunhandledrejection` as the ultimate observability safety net to ship uncaught global crashes to your monitoring platform. Use Error Boundaries inside React to keep your user interface alive and interactive.

## 8. 🧠 The Memory Hook

Think of an Error Boundary as a submarine's watertight bulkhead door: when an unhandled render error punctures a child component, the bulkhead slams shut instantly to isolate the flood to that single room, keeping the rest of the ship powered, interactive, and afloat instead of dragging the entire app to the bottom of the ocean.

