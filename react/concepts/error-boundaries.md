# Error Boundaries in React

## 1. Why This Exists — The Problem First

Imagine a dashboard with a header, navigation, checkout form, and a small recommendations widget. The API returns one recommendation with `metadata: null`, and the widget renders `item.metadata.badge.toLowerCase()`. That one property access throws while React is rendering.

The failure is not confined to the widget automatically. Without an Error Boundary, React cannot safely finish the affected render tree. An uncaught render error reaches the root and React unmounts the root tree, which can look like a blank page. A user may lose the visible checkout form, navigation, and every unrelated widget even though only one component had bad data.

An ordinary `try...catch` around JSX does not solve this:

```tsx
try {
  return <Recommendations items={items} />;
} catch {
  return <p>Recommendations unavailable</p>;
}
```

The parent is creating a React element description. React later executes descendants during reconciliation. The `try...catch` has already finished by then. An Error Boundary is the React-native solution: it is an ancestor component that gives React a declared recovery point in the rendered tree.

The goal is not to hide every problem. Expected API states such as `404`, a validation failure, an empty result, or a temporarily offline request should normally be modeled as data and rendered intentionally. A boundary is for unexpected exceptions that interrupt React’s ability to render or commit a subtree. It limits the blast radius, gives the user a usable fallback, and supplies an observability hook.

## 2. The Analogy — Make It Obvious

Think of the UI as a submarine divided by watertight bulkheads. Each compartment is a meaningful subtree: the whole app, a route, a checkout panel, or one third-party chart.

The boundary is the bulkhead. A render crash is a hull breach. React searches upward for the nearest boundary, abandons the damaged child subtree, and renders the boundary’s fallback in its place. The rest of the tree can keep its own state and remain interactive. A root boundary is the final bulkhead; a widget boundary is a smaller, more useful compartment.

The analogy also shows why placement matters. A boundary placed around the entire application can prevent a white screen, but a chart failure may still replace the whole dashboard. Boundaries around independent routes and high-risk widgets usually produce a smaller failure domain. A fallback should be a lifeboat, not another complicated compartment: keep it small, defensive, accessible, and able to offer a meaningful next action.

The two class methods have different jobs. `getDerivedStateFromError` closes the bulkhead during React’s render work by switching state to fallback mode. `componentDidCatch` records the damage after React commits the fallback. Resetting the boundary is reopening the compartment, but reopening without changing the cause simply lets the same breach happen again.

## 3. How It Actually Works — The Full Explanation

**Render-time errors.** During the render phase, React calls function components, class `render()` methods, and render-time computations to calculate the next UI. A descendant may throw any JavaScript value, not only an `Error`; React unwinds the work and looks for the nearest ancestor class component that qualifies as an Error Boundary. Normalize that value at the boundary before reading `.message`, recording telemetry, or exposing it to fallback UI. React’s recovery is tree-relative: the nearest boundary owns the failed subtree, while ancestors outside that subtree can remain mounted.

The official boundary primitive is a class component with `static getDerivedStateFromError` and/or `componentDidCatch`. In practice, implement both. The static method is a pure render-phase state transition. It cannot read `this`, and it should not log, mutate a store, call a network service, or show a notification. Render work can be restarted or discarded, especially with concurrent rendering, so side effects in this method can duplicate or happen for work the user never sees.

`componentDidCatch(error, errorInfo)` runs during the commit-side lifecycle after React has selected the fallback. `errorInfo.componentStack` is a React component stack, useful alongside the JavaScript stack for telemetry. This is the appropriate place to report the error, attach route or release metadata, and increment a diagnostic counter. Logging must still be resilient: if the logger or fallback throws, an outer boundary is needed.

**What boundaries catch.** A boundary catches errors thrown by descendants during synchronous React-managed work, including:

- a function component body or class `render()` method;
- a descendant constructor;
- descendant class lifecycle methods such as `componentDidMount`, `componentDidUpdate`, or `componentWillUnmount`;
- a render-time helper called by a component, including a calculation performed while producing JSX; and
- errors raised by a descendant during client commit work, such as an effect callback, when React routes that commit error through the tree.

Do not say that `useCallback` itself is caught as an effect. `useCallback` only stores a function; it does not execute that function. If the callback is called during render and throws, that is a render error. If it is called by a click handler, it is an event error and follows the event-handler rule below.

**What boundaries do not catch.** They do not automatically catch:

- exceptions thrown in event handlers such as `onClick` or `onSubmit`;
- exceptions in `setTimeout`, `requestAnimationFrame`, WebSocket callbacks, or other later browser callbacks;
- rejected promises from `fetch`, a query client, or arbitrary async work unless the error is represented in render or explicitly bridged back to a boundary;
- errors thrown while server-rendering HTML; the server request and streaming framework must handle those; or
- errors thrown by the boundary’s own `render`, fallback construction, `getDerivedStateFromError`, or `componentDidCatch` implementation.

The reason is execution ownership. Event and timer callbacks run after the React work that produced the handler has finished. A rejected promise is also not automatically a thrown value in a later React render. Use local `try...catch` and error state for imperative work, or deliberately store the error and throw it from a later render when a boundary-level fallback is truly appropriate.

**Render, commit, and effects.** A useful mental model is:

1. Render computes a candidate tree. React may pause, restart, or abandon it.
2. Commit applies the chosen tree to the host environment and runs commit-related lifecycle work.
3. Passive effects synchronize with external systems after commit; their callbacks are not a universal error transport for arbitrary async work.

The boundary’s state transition belongs to render; telemetry belongs to commit. A child that fails during rendering can be replaced before the failed subtree is committed. A child that fails during client lifecycle or effect work can be reported through the nearest boundary, but an error thrown later inside a promise continuation or timer has left that React call and must be bridged explicitly. This distinction explains why “Error Boundaries catch effects” is incomplete: React-managed commit execution may be routed, but arbitrary work started by an effect is not automatically covered forever.

**Fallback, reset, and recovery.** Once `hasError` is true, the boundary renders fallback instead of its children. A retry can call `setState({ hasError: false, error: null })`, but the child will immediately be attempted with the same inputs. The retry is useful only if the underlying condition may have changed, such as a refetch, a corrected cache entry, or a user action that changes the input.

A `key` is often the cleanest reset boundary. `<ErrorBoundary key={routeKey}>` gives React a new component identity when `routeKey` changes, so the old boundary and its failed child state are discarded together. The same technique works for a form or widget that must start fresh for a new entity. A custom `resetKeys` API can compare shallowly with `Object.is`, but it adds synchronization rules and should not reset merely because an unrelated render occurred.

**Identity and keys.** React preserves state when the same component type remains in the same position with the same key. Changing a key is not “updating an error flag”; it is asking React to unmount the old identity and mount a new one. That clears boundary state and descendant local state. Use a stable key for ordinary rerenders, and use an intentional route, document ID, or query key when a clean recovery scope is desired. Do not use an array index as a reset key when list order can change.

**SSR, event, and async limitations.** Server rendering has no browser commit in which a class boundary can display fallback UI. A server framework must catch the request/stream error, decide whether the stream can continue, and send an appropriate response. On hydration, a client boundary can handle a client-side render failure, but it does not retroactively repair a server request that already failed.

For an event or async error, first choose the owner. A form submission usually owns its error and should show inline feedback. A query library usually owns loading, retry, and server-error state. A truly fatal feature error can be bridged to a boundary by normalizing the thrown value, storing the resulting `Error` in state, and throwing it from the component’s next render. The bridge is explicit because it changes an imperative failure into a declarative render failure.

**Strict Mode and concurrency.** Strict Mode in development intentionally replays some work and mount/cleanup behavior to expose unsafe assumptions. Concurrent rendering can render a candidate more than once before committing it. Therefore, keep render and `getDerivedStateFromError` pure, make telemetry deduplicate when needed, and make cleanup and reset paths idempotent. A boundary is containment, not a guarantee that `componentDidCatch` runs exactly once for every underlying exception in every development or recovery scenario.

## 4. Real Code — See It Working

**Example 1 — a reusable class boundary.** This self-contained TSX example can run in a React + TypeScript app. The fallback accepts the error and a reset callback, while `componentDidCatch` owns logging. The default fallback deliberately avoids complex rendering.

```tsx
import React, { ErrorInfo, ReactNode } from "react";

type FallbackProps = {
  error: Error;
  reset: () => void;
};

type BoundaryProps = {
  children: ReactNode;
  fallback?: (props: FallbackProps) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type BoundaryState = {
  error: Error | null;
};

function normalizeError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class ErrorBoundary extends React.Component<
  BoundaryProps,
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    // Render phase: pure state transition only.
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Commit phase: side effects such as telemetry belong here.
    this.props.onError?.(normalizeError(error), info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;

    if (error) {
      return this.props.fallback?.({ error, reset: this.reset }) ?? (
        <section role="alert">
          <p>Something went wrong in this section.</p>
          <button type="button" onClick={this.reset}>
            Try again
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
```

**Example 2 — placement, identity, and a render crash.** The widget throws only when `broken` is true. The chart’s failure replaces the chart fallback, not the stable transactions panel. `broken` belongs to `RevenuePanel`, inside the keyed boundary subtree, so changing `reportId` remounts the owner and clears that state too.

```tsx
import React, { useState } from "react";

type FallbackProps = {
  error: Error;
  reset: () => void;
};

type BoundaryProps = {
  children: React.ReactNode;
  fallback?: (props: FallbackProps) => React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
};

type BoundaryState = { error: Error | null };

function normalizeError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

class ErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    this.props.onError?.(normalizeError(error), info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return this.props.fallback?.({
        error: this.state.error,
        reset: this.reset,
      }) ?? <p role="alert">This section is unavailable.</p>;
    }

    return this.props.children;
  }
}

function RevenueChart({ broken }: { broken: boolean }) {
  if (broken) {
    throw new Error("Revenue data has an invalid shape");
  }

  return <p>Revenue chart rendered successfully.</p>;
}

function RevenuePanel() {
  const [broken, setBroken] = useState(false);

  return (
    <section>
      <button type="button" onClick={() => setBroken(true)}>
        Simulate chart failure
      </button>
      <RevenueChart broken={broken} />
    </section>
  );
}

export function Dashboard({ initialReportId = "report-1" }: {
  initialReportId?: string;
}) {
  const [reportId, setReportId] = useState(initialReportId);

  return (
    <main>
      <h1>Financial overview</h1>
      <button type="button" onClick={() => setReportId(`${reportId}-next`)}>
        Open another report
      </button>

      <ErrorBoundary
        key={reportId}
        onError={(error, info) => {
          console.error("reportId", reportId, error, info.componentStack);
        }}
        fallback={({ reset }) => (
          <section role="alert">
            <p>Chart unavailable. Check the report and try again.</p>
            <button
              type="button"
              onClick={() => {
                setReportId(`${reportId}-retry`);
                reset();
              }}
            >
              Retry with a fresh report identity
            </button>
          </section>
        )}
      >
        <RevenuePanel />
      </ErrorBoundary>

      <aside>Recent transactions remain available.</aside>
    </main>
  );
}
```

**Example 3 — intentionally bridge an async error.** This runnable example defines the wrapper and usage site in the same TSX block. It uses ordinary state to make an async failure visible to render; the boundary catches the `throw` on the next render. For routine request failures, prefer a query or form state model; use this when the feature should enter the same fatal fallback as a render bug.

```tsx
import React, { useState } from "react";

function normalizeError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback: (error: Error) => React.ReactNode;
};

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: normalizeError(error) };
  }

  render(): React.ReactNode {
    return this.state.error
      ? this.props.fallback(this.state.error)
      : this.props.children;
  }
}

export function ReportDownload({ userId }: { userId: string }) {
  const [asyncError, setAsyncError] = useState<Error | null>(null);

  if (asyncError) {
    throw asyncError;
  }

  async function download(): Promise<void> {
    try {
      const response = await fetch(`/api/users/${userId}/report`);
      if (!response.ok) {
        throw new Error(`Report request failed: HTTP ${response.status}`);
      }
      await response.blob();
    } catch (error) {
      setAsyncError(normalizeError(error));
    }
  }

  return (
    <button type="button" onClick={() => void download()}>
      Download report
    </button>
  );
}

export function App() {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <p role="alert">Download failed: {error.message}</p>
      )}
    >
      <ReportDownload userId="42" />
    </ErrorBoundary>
  );
}
```

In production, do not expose stack traces or sensitive request data in the fallback. Add a request ID or safe error code for support, report the original error with release and route metadata, and decide whether retry invalidates data before resetting. A boundary protects rendering; it does not validate API schemas, cancel requests, or make a broken dependency healthy.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is an Error Boundary?**

An Error Boundary is a class component that catches errors thrown by descendants during React-managed rendering and relevant lifecycle/commit work, records a fallback state, and renders replacement UI for that subtree. It is a fault-containment mechanism, not a replacement for all JavaScript error handling.

**Q: Why does React need a boundary when JavaScript has `try...catch`?**

`try...catch` only covers the synchronous call stack inside its block. JSX creates an element description; React later executes descendants during reconciliation. A boundary participates in that tree traversal and gives React a recovery ancestor.

**Q: What is the difference between the two boundary methods?**

`static getDerivedStateFromError` runs during render and returns state for fallback selection, so it must be pure. `componentDidCatch` runs after React has handled the failure during commit and is the place for telemetry or other side effects. The first decides what to render; the second records what happened.

**Q: Why are boundaries class-based?**

React’s built-in boundary contract is expressed through class lifecycle methods. Function components can be used for the fallback and for a wrapper API, and libraries can hide the class implementation, but a normal function component with Hooks does not itself become an Error Boundary merely by using state.

**Q: Do boundaries catch event-handler and `fetch` errors?**

Not automatically. The handler or promise continuation runs outside the render traversal. Catch those errors where the imperative work is initiated, model them as local/server state, or store an error and throw it during a later render to intentionally bridge it.

**Q: How do you reset one?**

Expose a retry callback that clears the boundary state only after the cause may have changed. For route or entity changes, give the boundary a changing `key`; React then creates a new identity. A retry that renders the same corrupt input will fail again.

**Q: Where should boundaries be placed?**

Use a root boundary as a last resort, route boundaries around independently navigable pages, and feature boundaries around high-risk widgets such as charts, editors, media players, plugin content, or user-generated renderers. Choose the smallest subtree whose replacement still gives the user a useful experience.

**Q: How do boundaries relate to Suspense?**

Suspense handles a pending thenable by showing its loading fallback. An Error Boundary handles an error. A rejected promise used by Suspense becomes an error that an enclosing boundary can handle, so a common shape is `ErrorBoundary` outside `Suspense`: error fallback outside, loading fallback inside.

**Q: What happens on the server?**

A client Error Boundary cannot render a server fallback during SSR. The server renderer or framework must catch the request/stream error. Client boundaries still help after hydration or during later browser renders.

**Q: What should telemetry contain?**

Send the original error, `errorInfo.componentStack`, route or feature name, application version, and a correlation/request ID when safe. Redact user data and deduplicate noisy retries. Keep the fallback useful even when telemetry is unavailable.

## 6. The Traps — What Goes Wrong

**Trap 1: saying “boundaries catch all errors.”** They do not catch ordinary event callbacks, later timer/promise work, server-rendering failures, or errors in the boundary itself. State the execution context, not just a memorized list.

**Trap 2: logging in `getDerivedStateFromError`.** Render can restart or be abandoned. Put telemetry in `componentDidCatch`, and make the logger tolerant of duplicate development reports and failed network delivery.

**Trap 3: wrapping only the root.** A root boundary prevents an empty root, but it gives a small widget a full-page blast radius. Add boundaries where users can continue meaningful work.

**Trap 4: treating a 404 or validation response as a render crash.** Expected server outcomes belong in query, route, or form state. Sending every expected response to crash telemetry obscures real defects and produces worse contextual UI.

**Trap 5: retrying without changing the cause.** Clearing `hasError` immediately reruns the same child with the same props. Refetch, invalidate, change the input, or show a reload/support action; otherwise the fallback will reappear.

**Trap 6: assuming a key is a harmless prop.** Changing a key remounts the identity and discards descendant state, focus, subscriptions, and unsaved local input. Use it deliberately and place it at the scope that should actually reset.

**Trap 7: making fallback UI fragile.** A fallback that dereferences optional data, imports a broken feature, or depends on the failed provider can throw too. Keep it static and defensive, and put an outer last-resort boundary around it when the product needs one.

**Trap 8: overclaiming effect coverage.** React may route an error thrown during a descendant’s client commit work to a boundary, but a promise or timer started by that effect is not automatically covered. Track the async operation explicitly and decide who owns its error state.

**Trap 9: confusing an Error Boundary with a security boundary.** It contains rendering failure, not privileges, network access, or untrusted code. Validate data, authorize requests, sanitize content, and isolate third-party execution separately.

## 7. Compare With Related Concepts

| Concept | Owns | Does not replace |
| --- | --- | --- |
| Error Boundary | Unexpected descendant render/lifecycle failure and subtree fallback | Event `try...catch`, API state, SSR request handling |
| JavaScript `try...catch` | Synchronous imperative code in its call stack | Declarative descendant tree recovery |
| Query/form error state | Expected HTTP, validation, loading, retry, and empty states | Unexpected component bugs |
| Suspense | Pending thenables and loading fallback | Rejected errors; pair with an Error Boundary |
| `window.onerror` / `unhandledrejection` | Global browser-level observability | Replacing a React subtree with fallback UI |
| Router error boundary | Route-level loader/render/action failure, depending on router | Feature-level containment inside a route |

**Boundary versus `try...catch`.** Use a boundary when React should replace a descendant subtree. Use `try...catch` when code is imperative: parse a payload, submit a form, process a file, or await a request. They can cooperate: catch an event error, update local state for ordinary feedback, or deliberately bridge it to a boundary.

**Boundary versus API error state.** A server returning `401`, `404`, `422`, or `503` is a product state with context and often a retry policy. A `TypeError` because a component assumed the wrong shape is a programming/data-integrity failure. Keep those channels separate so users get the right message and telemetry remains actionable.

**Boundary versus Suspense.** Suspense answers “is this subtree still pending?” A boundary answers “did this subtree fail?” Put the error boundary outside the Suspense boundary when both a loading fallback and an error fallback are needed.

**Boundary versus global handlers.** Global handlers are valuable last-resort telemetry for failures that escape React, but they have no component-tree ownership and cannot decide which React subtree to replace. A boundary has local ownership and user-facing recovery; global handlers provide broader visibility.

**Boundary versus a router’s route error UI.** A router can own route loaders, actions, and route rendering. A feature boundary remains useful inside the route for a chart or editor whose failure should not discard the route shell. Use the owner closest to the work that can recover it.

## 8. 🧠 The Memory Hook — What Sticks

Remember **BULKHEAD**: **B**ound descendants, **U**nderstand the render context, **L**og after commit, **K**ey-remount for a clean identity, **H**andle events and async work explicitly, **E**nclose the smallest useful feature, **A**void fragile fallbacks, and **D**o not confuse bugs with normal API states.

An Error Boundary is a watertight door in the React tree: it contains a child render failure, records the damage after commit, and gives that compartment a safe way to recover while the rest of the application stays afloat.
