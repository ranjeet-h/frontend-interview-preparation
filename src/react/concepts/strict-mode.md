# React Strict Mode

## 1. Why This Exists — The Problem First

An application can look correct while its components are quietly doing unsafe work. A render function might push into an array received through props. An effect might add a `window` listener but never remove it. A ref callback might register a third-party widget without destroying it. Each mistake can survive a simple “open the page once” test, then appear as duplicate events, stale data, leaked timers, or inconsistent UI after navigation.

React also cannot promise that every render calculation will be committed. Rendering may be restarted, interrupted, or abandoned as React prioritizes other work. Code that sends a request or mutates shared data during render cannot be undone if that render never reaches the DOM.

Strict Mode is React’s local stress test for these assumptions. In development, it deliberately repeats selected render-phase work and performs extra setup/cleanup cycles so that impure rendering and incomplete resource ownership become visible while the developer still has the code open. It is not a second production lifecycle; it is a diagnostic pressure test.

## 2. The Analogy — Make It Obvious

Imagine a hotel training room. A guest checks in, the staff connects the room’s services, the guest changes rooms, and eventually checks out. A competent room-service procedure must connect exactly the services this guest needs and disconnect exactly those services when the guest leaves. It cannot rely on “this room is checked into only once,” because real hotels move guests, close rooms temporarily, and reopen them.

Strict Mode is the hotel’s training drill. During development, React asks the component to prepare its room more than once, and it briefly checks the room out before checking it back in. If setup opened a socket, cleanup must close that socket. If setup registered a listener, cleanup must remove that listener. If rendering merely described the room, repeating the description should not alter the hotel, the guest ledger, or any other room.

The mapping is direct:

- The component body is the room plan. It must be a pure calculation of props, state, and context.
- The commit is the room becoming real in the DOM.
- An effect or ref callback is a connection to an outside service.
- Cleanup is the exact undo operation for that connection.
- Component identity is the room assignment that owns local state. A remount is a new assignment; a temporary effect teardown can preserve the guest’s state for a later return.

The drill feels more active than ordinary production use because its purpose is to reveal procedures that only work by accident.

## 3. How It Actually Works — The Full Explanation

`<StrictMode>` is an invisible boundary. It renders no extra DOM element and applies its checks to the components below it. You can wrap the whole root or only a subtree, which is useful when migrating a legacy area gradually.

**Development-only render stress.**

In development, Strict Mode may call render-phase code twice to find impurity. This includes function component bodies and certain functions supplied to Hooks, such as lazy initializers and updater functions. It also affects relevant class render-phase methods. The important rule is not “never see a function called twice”; it is “rendering must be safe to repeat.”

A pure render can calculate the same JSX repeatedly without changing anything outside its own calculation. Reading props, deriving a value, and creating a new array for displayed data are fine. Mutating a prop object, incrementing a module-level counter, writing to a store, sending analytics, or starting a request is not. An event handler is an explicit user action; an effect is synchronization after commit. Those are different ownership points.

**Extra effect setup and cleanup.**

For an initial mount in development, React may run an effect as:

```text
setup → cleanup → setup
```

The first setup represents connecting to an external system. The cleanup represents React testing whether that connection can be removed. The second setup represents continuing with the component active. In React 18 and later, this check is designed to expose code that is not resilient to a subtree being removed and later re-added while its state is preserved for future rendering features.

When `<StrictMode>` wraps only a subtree instead of the root, React does not perform this initial extra Effect setup+cleanup cycle for that subtree. Running child Effects twice without also running the parent Effects would describe a sequence that cannot happen in production. Other checks that are possible for a subtree can still run.

The same setup/cleanup idea applies to `useLayoutEffect`, with its normal layout timing, and to callback ref functions. A callback ref has a setup side when it receives a node. In the traditional contract, React calls the callback with `null` when that node is detached; in modern React (React 19+), the callback can instead return a cleanup function, which React calls when the ref is detached. If no cleanup function is returned, the `null` callback remains the backward-compatible cleanup path. Strict Mode adds an extra ref setup/cleanup cycle in development to exercise that contract. A ref is not only a way to read a DOM node—it can also own an imperative resource, so it needs the same ownership discipline.

**Purity, cleanup, and reusable state.**

State belongs to a component identity in the rendered tree, not to one invocation of the function body. React can preserve that state while effect resources are disconnected and later reconnected. Therefore, a correct component does not equate “the effect ran again” with “all local state must be reset.” It reconnects the external resource using the current props and retains state when React retains the identity.

Cleanup must mirror setup one-for-one. If setup calls `addEventListener`, cleanup calls `removeEventListener` with the same target, event type, and function reference. If setup starts an interval, cleanup clears that interval. If setup starts a fetch, cleanup aborts or invalidates that request. Cleanup should not clear a shared resource that another component owns.

**Deprecated APIs and concurrency readiness.**

Strict Mode warns about legacy patterns such as string refs, `findDOMNode`, legacy context APIs, and unsafe class lifecycles. These APIs make ownership and timing less explicit and are poor foundations for interruptible rendering. Replace them with object or callback refs, direct DOM refs, `createContext`/`useContext`, and commit-safe lifecycle patterns.

Strict Mode does not turn on Concurrent React, guarantee that an application is ready for every future API, or prove that every asynchronous race is solved. It gives a useful simulation of the properties concurrent and reusable-subtree features require: render work can be repeated, and external connections can be torn down and recreated without corruption.

**Production behavior and TypeScript context.**

Strict Mode’s extra render calls, extra effect/ref cycles, and development warnings are development behavior. A production build does not perform those diagnostic repetitions. The wrapper also does not change the TypeScript types of props, state, events, refs, or context; TypeScript checks the code statically, while Strict Mode exercises runtime behavior. You still need types for the resource contract and tests for real user flows.

## 4. Real Code — See It Working

The following examples are labeled by the behavior they demonstrate. They are valid TSX snippets for a React + TypeScript project; each can be placed in a component file and rendered below a `StrictMode` root.

**Example A — Runnable pure render and event update.** The component derives its visible list without mutating the incoming array. The state updater creates a new array, so repeated updater calls are safe.

```tsx
import { StrictMode, useState } from "react";

type Task = { id: number; title: string };

export function PureTaskList({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);

  function addTask() {
    setTasks((previous) => [
      ...previous,
      { id: previous.length + 1, title: "Read the Strict Mode note" },
    ]);
  }

  return (
    <section>
      <button type="button" onClick={addTask}>
        Add task
      </button>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
    </section>
  );
}

export function App() {
  return (
    <StrictMode>
      <PureTaskList initialTasks={[{ id: 1, title: "Open the app" }]} />
    </StrictMode>
  );
}
```

**Example B — Runnable symmetrical effect.** The listener is created inside the setup so cleanup closes over the exact function reference. Strict Mode can add and remove it during its drill without leaving a duplicate listener.

```tsx
import { useEffect, useState } from "react";

export function WindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <output>Window width: {width}px</output>;
}
```

**Example C — Runnable request cancellation with a typed response.** The `AbortController` belongs to one effect setup. When the dependency changes or Strict Mode tests cleanup, the old request is aborted and cannot compete with the new request.

```tsx
import { useEffect, useState } from "react";

type User = { id: number; name: string };

export function UserCard({ userId }: { userId: number }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setUser(null);
    setError(null);

    fetch(`/api/users/${userId}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<User>;
      })
      .then((nextUser) => setUser(nextUser))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setError(reason instanceof Error ? reason.message : "Request failed");
      });

    return () => controller.abort();
  }, [userId]);

  if (error) return <p role="alert">{error}</p>;
  if (!user) return <p>Loading…</p>;
  return <p>{user.name}</p>;
}
```

For ref callbacks, the same contract is explicit: create a resource when a node arrives, return cleanup when the node is detached, and never assume the callback receives a node only once.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is React Strict Mode?**

It is a development-time diagnostic boundary that enables warnings and stress tests for a subtree. It checks assumptions about pure rendering, reversible effects, ref callback cleanup, and legacy APIs. It does not add a visible wrapper element and is not a production error boundary.

**Q: Why does my component render twice?**

In development under Strict Mode, React intentionally repeats selected render-phase work to expose mutations and other impure logic. A component body should be a repeatable calculation. If repeating it sends a request or changes shared data, move that work to an event handler or a properly cleaned-up effect.

**Q: Why does an effect run, clean up, and run again?**

React is testing whether the effect’s setup and cleanup form a complete reversible pair. It is a signal to inspect ownership, not a signal to suppress the second call. If setup subscribes, cleanup must unsubscribe; if setup starts asynchronous work, cleanup must cancel or invalidate it.

**Q: Does Strict Mode make two production API calls?**

No. The extra development cycle is not performed in production. A development Network panel can still show an initial request being started and then aborted, depending on timing. If an application needs caching or deduplication, use an appropriate server-state solution; do not hide the diagnostic with a ref flag.

**Q: Is Strict Mode the same as Concurrent React?**

No. Concurrent rendering is a runtime capability that lets React schedule interruptible work. Strict Mode is a development test harness that checks whether code remains safe when rendering is repeated and external connections are restarted. Passing Strict Mode is evidence of useful properties, not proof of complete concurrency readiness.

**Q: How do reusable state and identity relate to Strict Mode?**

React preserves state when the same component identity remains in the same tree position with the same relevant key and type. Strict Mode’s extra effect cycle asks whether external resources can be disconnected and reconnected while that state remains coherent. Changing a `key` intentionally creates a new identity and resets that subtree; Strict Mode does not itself mean “reset all state.”

**Q: What does TypeScript add here?**

TypeScript can describe the boundary: `userId` can be a number, a response can be parsed as `User`, and a cleanup contract can be represented by a function returning `void`. It cannot prove that `removeEventListener` uses the same function reference or that a render is free of side effects. Static types and runtime stress testing cover different failure classes.

**Q: Should I remove Strict Mode because a third-party library logs warnings?**

First identify whether the warning comes from the library or your own code. Removing the boundary may hide valuable evidence. Upgrade or replace the library, isolate the legacy subtree temporarily if migration requires it, and keep the rest of the application under Strict Mode while the ownership or deprecated-API issue is addressed.

## 6. The Traps — What Goes Wrong

**Trap: using a `hasMounted` ref to defeat the second effect.** A guard such as `if (ran.current) return` silences the drill but can leave a genuinely remounted component without its subscription or request. Make setup and cleanup correct instead.

**Trap: calling `fetch` in the component body.** The body can run for a render React later abandons, and it can run again for ordinary state changes. The request has no lifecycle owner. Start it from an event or an effect and define cancellation or stale-result handling.

**Trap: assuming “empty dependencies” means “runs exactly once.”** `[]` means the effect reads no changing reactive values. It still runs after commit, still needs cleanup, and is still subject to the development setup/cleanup check. If an effect reads `roomId`, omitting `roomId` creates a stale synchronization even if the code seems intended to run once.

**Trap: treating duplicate logs as duplicate user behavior.** A render log is diagnostic evidence that render code was invoked; it is not proof that a user clicked twice. An effect log may reflect the extra development cycle. Use event-level logging and inspect cleanup before concluding that production behavior is duplicated.

**Trap: making cleanup too broad.** A component that removes every listener from a shared event bus can “clean up” another component’s subscription. Cleanup should release only the resource created by that setup, using an ownership-specific handle or function reference.

**Trap: believing Strict Mode validates everything.** It does not replace TypeScript, ESLint, unit tests, integration tests, error handling, accessibility checks, or production observability. It is especially valuable for render purity and lifecycle ownership, but a successful drill cannot prove that an API returns valid data or that every race is handled.

**Trap: confusing hiding with unmounting.** CSS such as `display: none` normally keeps a component mounted, so its effects and state continue. Unmounting removes the identity and runs cleanup. Choose deliberately based on whether the external resource should remain connected.

## 7. Compare With Related Concepts

| Concept | Key difference | Rule of thumb |
| --- | --- | --- |
| Strict Mode vs production mode | Strict Mode adds development diagnostics; production does not perform those extra repetitions. | Keep it enabled during development; never design behavior around the duplicate calls. |
| Strict Mode vs Concurrent React | Strict Mode is a test harness; Concurrent React is a scheduling/runtime capability. | Treat Strict Mode feedback as preparation, not as a concurrency guarantee. |
| Strict Mode vs ESLint | Strict Mode exercises runtime behavior; ESLint analyzes source statically. | Use both: static rules catch dependency patterns, runtime checks catch ownership bugs. |
| Strict Mode vs TypeScript | Strict Mode detects runtime lifecycle mistakes; TypeScript checks types before runtime. | Type resource contracts, then test their actual setup and cleanup. |
| Strict Mode vs Error Boundaries | Strict Mode exposes design problems during development; an error boundary renders fallback UI after child render errors. | Use Strict Mode to find bugs and boundaries to contain eligible runtime failures. |
| `useEffect` cleanup vs `AbortController` | Cleanup is React’s lifecycle hook; `AbortController` is one cancellation mechanism for abortable work such as `fetch`. | Return cleanup from the effect and use the right cancellation API inside it. |
| Remount vs effect re-synchronization | A remount creates a new component identity and normally resets local state; dependency changes re-run an effect for the same identity. | Use a changing `key` only when a fresh state boundary is intended. |

## 8. 🧠 The Memory Hook — What Sticks

Picture Strict Mode as a hotel fire drill: React repeats the room plan to catch impurity, checks the room out to test cleanup, then checks it back in without trusting “it only happens once.” If setup owns a resource, cleanup must release that exact resource; if rendering changes the outside world, the bug existed before Strict Mode exposed it.
