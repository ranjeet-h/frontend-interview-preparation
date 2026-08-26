# useDebugValue

## 1. Why This Exists — The Problem First

Your component tree is easy to inspect until a shared hook starts doing real work. A hook such as `useAuthSession` may know whether a session is loading, expired, or authenticated, but DevTools can otherwise show only a pile of internal state and effects. A teammate trying to diagnose “why did this screen lose its user?” has to open the hook source instead of understanding the current state at a glance.

`useDebugValue` solves that inspection problem. It lets a custom hook publish a human-readable value for React DevTools without turning that value into application state, UI, logging, or a data-sharing channel.

## 2. The Analogy — Make It Obvious

Think of a custom hook as a sealed equipment case. Inside are the batteries, cables, and switches (`useState`, `useReducer`, `useEffect`, and subscriptions). The application uses the case through its public handle: the hook's return value.

`useDebugValue` is the label taped to the outside of the case for a technician. The label might say `Online`, `Refreshing`, or `Expired`. It helps the technician identify what is happening without opening the case, but it does not change the equipment inside or send a message to the application. React DevTools is the technician reading the label; the browser UI and `console` are not.

The optional formatter is an on-demand label printer. The hook gives React DevTools the raw value and a recipe for turning it into a readable label. The expensive recipe is used when DevTools asks to inspect the hook, instead of eagerly building a display string on every render.

## 3. How It Actually Works — The Full Explanation

Call `useDebugValue` at the top level of a custom hook, alongside the other hooks it uses:

```tsx
import React from "react";

const onlineStore = {
  subscribe(listener: () => void) {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
    };
  },
  getSnapshot() {
    return window.navigator.onLine;
  },
};

function useOnlineStore() {
  return React.useSyncExternalStore(
    onlineStore.subscribe,
    onlineStore.getSnapshot,
    () => true,
  );
}

function useOnlineStatus() {
  const online = useOnlineStore();
  React.useDebugValue(online ? "Online" : "Offline");
  return online;
}
```

During rendering, React records the debug value as metadata associated with that hook call. React DevTools can inspect that metadata and show it beside the custom hook in the Components panel. The value is not rendered into the DOM, returned to the component, written to the console, or sent to a server. If the value changes, `useDebugValue` does not schedule a render; some other state, context, or store update caused the render in which the new label was recorded.

The call belongs inside a custom hook because it describes that hook's internal state. A component can call hooks, but `useDebugValue` is not a general-purpose annotation API for arbitrary functions. Keep it at the same unconditional call position on every render, just like `useState` or `useMemo`, so the Rules of Hooks remain valid.

The first argument is the value DevTools should know about. The second argument is optional:

```tsx
import React from "react";

type Session = { user: { name: string } };
const session: Session | null = { user: { name: "Maya" } };

function useSessionDebugValue() {
  React.useDebugValue(session, (currentSession) =>
    currentSession ? `Signed in as ${currentSession.user.name}` : "Signed out",
  );
  return session;
}
```

The formatter is for presentation only. It does not transform the value returned by the hook, and it should be pure: do not fetch, update state, write analytics, or mutate the session from it. React DevTools can call the formatter while inspecting the hook, so the hook should not rely on the formatter running during ordinary application execution. Passing an already-formatted expression as the first argument defeats this deferral:

```tsx
import React from "react";

type Session = {
  user: { name: string };
};

const session: Session | null = {
  user: { name: "Maya" },
};

function expensiveSummary(currentSession: Session | null) {
  return currentSession ? `Signed in as ${currentSession.user.name}` : "Signed out";
}

function useEagerSessionDebugValue() {
  // This formatting runs whenever the hook renders, even if nobody inspects it.
  React.useDebugValue(expensiveSummary(session));

  return session;
}

function useDeferredSessionDebugValue() {
  // This gives DevTools the raw value and defers the summary calculation.
  React.useDebugValue(session, expensiveSummary);
  return session;
}
```

The feature is deliberately a developer-experience boundary. It has no effect on reconciliation, event handling, state updates, or the component's returned JSX. Production behavior should never depend on a debug label. Whether a particular production build retains or removes the metadata is an implementation/build detail; the stable contract is that it is not application-visible behavior.

## 4. Real Code — See It Working

This complete TypeScript/React example has a small external online-status store, a custom hook, a component that consumes it, and a browser entry point. Install React and React DOM 18 or newer, place the markup below in `index.html`, and compile the file as `main.tsx` with the repository's normal React toolchain. With React DevTools installed, inspect `StatusPanel` and expand `useOnlineStatus` to see the label change as the browser goes online or offline.

```tsx
import React from "react";
import { createRoot } from "react-dom/client";

type Listener = () => void;

const onlineStatusStore = {
  subscribe(listener: Listener) {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
    };
  },
  getSnapshot() {
    return window.navigator.onLine;
  },
};

function useOnlineStatus() {
  const online = React.useSyncExternalStore(
    onlineStatusStore.subscribe,
    onlineStatusStore.getSnapshot,
    // The server snapshot keeps SSR output deterministic.
    () => true,
  );

  // This label helps a DevTools user without becoming part of the page UI.
  React.useDebugValue(online ? "Online" : "Offline");
  return online;
}

function StatusPanel() {
  const online = useOnlineStatus();

  return (
    <main>
      <h1>Connection status</h1>
      <p>{online ? "You can sync changes." : "Changes will wait to sync."}</p>
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Expected <div id=\"root\"></div>");

createRoot(rootElement).render(
  <React.StrictMode>
    <StatusPanel />
  </React.StrictMode>,
);
```

Here the browser events and `useSyncExternalStore` cause the component to update. The debug call merely records `Online` or `Offline` during that render. Removing it leaves the page behavior unchanged; it only makes the custom hook less informative in DevTools.

For a hook with a larger object, expose a short status while preserving the object itself for application code. The formatter below avoids eagerly serializing the complete session on every render:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";

type Session = {
  user: { id: string; name: string };
  expiresAt: number;
};

const AuthSessionContext = React.createContext<Session | null>(null);

function formatSession(session: Session | null) {
  if (session === null) return "Signed out";
  const expiresInSeconds = Math.max(
    0,
    Math.round((session.expiresAt - Date.now()) / 1000),
  );
  return `Signed in as ${session.user.name} (${expiresInSeconds}s left)`;
}

function useAuthSession() {
  const session = React.useContext(AuthSessionContext);

  // DevTools can request this readable summary; consumers still receive the raw object.
  React.useDebugValue(session, formatSession);
  return session;
}

function AccountName() {
  const session = useAuthSession();
  return <p>{session ? session.user.name : "Guest"}</p>;
}

const session: Session = {
  user: { id: "u-42", name: "Maya" },
  expiresAt: Date.now() + 15 * 60 * 1000,
};

function App() {
  return (
    <AuthSessionContext.Provider value={session}>
      <AccountName />
    </AuthSessionContext.Provider>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Expected <div id=\"root\"></div>");
createRoot(rootElement).render(<App />);
```

The provider and root make the fixture independently mountable; a real app would replace the fixed session with its session manager. The formatter is intentionally a pure display function. The timestamp means its label can become stale between renders, which is fine: a debug label describes the value at the render/inspection boundary; it is not a live countdown or a source of truth.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is `useDebugValue`?**

It is a React Hook for adding a custom display value to a custom hook in React DevTools. A hook can expose a compact status such as `Offline` or `Refreshing` while continuing to return its normal application value. It is metadata for developers inspecting a component, not a mechanism for rendering or communication between hooks.

**Q: Does `useDebugValue` affect rendering or trigger a re-render?**

No. Calling it does not update state, schedule work, change JSX, or alter reconciliation. The component still re-renders only because some actual input changed, such as state, props, context, or an external store snapshot. During that render, React records the new debug metadata for DevTools to inspect.

**Q: Where can you see its value?**

In the React DevTools Components panel, while inspecting a component that uses the custom hook. It is not a DOM attribute, browser-console log, network payload, or value returned to the component. DevTools owns the presentation of the metadata.

**Q: Why is it mainly used in custom hooks?**

Custom hooks package several primitive hooks behind a meaningful abstraction, and DevTools cannot know what that abstraction's internal values mean. The author of `useAuthSession` knows that three internal values together mean `Refreshing`; `useDebugValue` lets the author provide that meaning. Built-in hooks already have DevTools-aware representations, so adding labels to every simple wrapper usually adds noise.

**Q: What is deferred formatting?**

It is passing a formatter as the second argument: `useDebugValue(value, format)`. React gives DevTools the raw value and the formatter, allowing the tooling to create a readable representation when the hook is inspected. This is useful when formatting is expensive or the raw value is large. An inline expression such as `useDebugValue(makeSummary(value))` performs `makeSummary` during the hook's render instead.

**Q: Should every custom hook call it?**

No. Add it when a shared or library hook has meaningful internal state that is hard to understand from the returned value alone. A `useToggle` hook returning a boolean is already obvious. A data-fetching, authentication, subscription, or cache hook may benefit from a status label. The criterion is diagnostic value, not a rule that every hook must carry a label.

**Q: Can the formatter perform side effects?**

It should not. Treat it as a pure presentation function because DevTools controls when it is called and may call it during inspection rather than normal rendering. Fetching, logging business events, mutating objects, or setting state there makes debugging change application behavior and can produce surprising results.

## 6. The Traps — What Goes Wrong

**Mistaking it for `console.log`.** A debug value is not printed to the console and is not a production log. If an operational event must be recorded, use the application's logging/observability path. If a developer needs an inspected hook to have a readable label, use `useDebugValue`.

**Expecting it to appear in the UI.** The label is not rendered text. A component that needs to tell the user “Offline” must render that state explicitly, as the `StatusPanel` example does. The DevTools label is for the person diagnosing the app.

**Using it as state or communication.** A parent cannot read a child's debug value, and one hook cannot consume another hook's debug value. Return data, pass props, use context, or use a shared store for application communication.

**Doing expensive work before React can defer it.** `useDebugValue(expensiveSummary(data))` computes on every render. Prefer `useDebugValue(data, expensiveSummary)` when the summary is only useful during inspection. The formatter still needs to be cheap enough for an inspection and safe to call more than once.

**Adding labels to every tiny hook.** A noisy Components panel is harder to use. A label should compress complicated state into a useful status, not repeat an obvious hook name or boolean. Prefer no call when it contributes no diagnostic information.

**Calling it conditionally.** This is still a Hook call. `if (enabled) React.useDebugValue(value)` can change the hook order between renders and violate the Rules of Hooks. Call it unconditionally and choose a safe value to display.

**Relying on it in production logic.** Build modes and DevTools availability are not application contracts. A feature must work if React DevTools is absent and must not depend on whether a debug value was retained by a production build.

## 7. Compare With Related Concepts

**`useDebugValue` vs `console.log`:** The former is structured, hook-specific inspection metadata; the latter writes a runtime message. Use `useDebugValue` to make a custom hook understandable in the Components panel, and logging to record an event or diagnose a timeline.

**`useDebugValue` vs React DevTools:** The Hook supplies metadata; DevTools reads and displays it. Adding the Hook does not install DevTools, and installing DevTools does not make the value part of the application API.

**`useDebugValue` vs rendered state:** Rendered state is user-visible output that can affect layout and behavior. A debug value is developer-visible metadata with no rendering authority. Use JSX for user feedback; use the debug value for inspection context.

**`useDebugValue` vs `useMemo`:** `useMemo` can cache a calculation used by the application, subject to React's memoization semantics. The formatter passed to `useDebugValue` is only a display recipe for DevTools and does not cache or alter the hook's returned data. Use `useMemo` when the result is needed by the app; use the formatter when it is only for inspection.

**`useDebugValue` vs `useEffect`:** `useEffect` synchronizes with an external system after commit and may produce side effects. `useDebugValue` describes a hook for tooling and should be side-effect free. Use an effect for subscriptions or imperative synchronization, not for publishing a label.

## 8. 🧠 The Memory Hook — What Sticks

Picture a sealed equipment case with a technician's label: `useDebugValue` labels the custom hook for DevTools without touching what the application does. Give DevTools the raw value plus a pure formatter when the label is expensive; never make the app depend on the label.
