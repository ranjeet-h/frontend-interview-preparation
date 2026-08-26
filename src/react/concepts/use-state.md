# `useState`: Managing Local Component State

## 1. Why This Exists — The Problem First

A function component runs, returns JSX, and finishes. Its local variables belong to that one execution. If a component uses `let count = 0`, a click can change that variable, but React does not know that the screen should be rendered again. If a parent update causes the component to run again, the declaration starts over at `0`.

Moving the variable to module scope is not a solution: every mounted copy would share one value, and changing it still would not tell React which component should update. React needs a value that is both persistent for one component instance and connected to rendering.

`useState` provides that connection. It returns the state value for the current render and a setter that queues a state update. React can then render the component again with the resulting value. The important mental correction is that the setter is not a synchronous assignment to the variable already in the current function call. It is a request for a future render.

```tsx
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  function increment() {
    setCount(count + 1);
    // `count` here is still this render's value.
  }

  return <button onClick={increment}>Clicked {count} times</button>;
}
```

The component instance owns this state. Two `<Counter />` elements get two independent state slots because React tracks them as two mounted instances. When an instance is removed, its state is removed with its identity; when a new instance mounts, its initial state is used again.

## 2. The Analogy — Make It Obvious

Imagine an actor filming a scene in separate takes. In every take, the actor receives a fresh script and performs it from the beginning. The local variable `count` is a line on that script: it is fixed for the duration of that take. Event handlers created in that take remember the same value because they close over that particular script.

React is the continuity supervisor. It keeps a private numbered ledger for each component instance. The first `useState` call is slot 1, the second is slot 2, and so on. On the first take, React fills a slot with the initial value. On later takes, it gives the component the value produced by the queued updates for that slot.

Calling a setter is handing the supervisor an instruction for a later take. `setCount(count + 1)` says, “using this take's `count`, queue the value `count + 1`.” It does not edit the script currently in the actor's hands. `setCount(previous => previous + 1)` says, “when the queued instructions are processed, transform the value that comes immediately before this instruction.”

This analogy explains the major rules:

- A render is a snapshot, not a live mutable view.
- A setter schedules state work; it does not synchronously rewrite the current render.
- Hook calls need stable order so ledger slot 1 is always matched with slot 1.
- A component's position and `key` determine which instance owns the ledger.
- React may start, pause, retry, or discard a render, so render code must be pure.

## 3. How It Actually Works — The Full Explanation

When React renders a function component, it calls the function from top to bottom. The function's locals disappear when that call ends. React stores hook state outside that call, associated with the component instance's internal Fiber data. A useful conceptual model is an ordered list of hook records, each with a current value and a queue of pending actions. The exact Fiber fields are implementation details, not an application API.

**Hook order is identity.** On mount, the first `useState` call receives the first state record, the next call receives the second, and so on. On update, React walks the records in the same order. React does not match hooks by variable names. Therefore hooks must be called unconditionally at the top level of a component or custom hook, never inside a condition, loop, or nested function.

**State is a render snapshot.** If a render reads `count` as `0`, all handlers returned by that render close over `0`. After `setCount(1)`, code later in that same handler still reads `0`. A later render creates a new `count` binding and new handlers. This is why logging immediately after a setter shows the old value without implying that React failed to queue the update.

**Direct values and functional updates are different queue actions.** In `setCount(count + 1)`, JavaScript evaluates `count + 1` immediately using the current snapshot, then React queues the resulting value. In `setCount(previous => previous + 1)`, React queues a function and applies it to the pending state when the queue is processed. If the next state depends on previous state, use the functional form. It composes correctly when updates are queued from one handler, several handlers, or an asynchronous callback.

For example, if the snapshot is `0`:

```tsx
import { useState } from "react";

export function QueueExample() {
  const [count, setCount] = useState(0);

  function directTwice() {
    setCount(count + 1);
    setCount(count + 1);
  }

  function functionalTwice() {
    setCount((previous) => previous + 1);
    setCount((previous) => previous + 1);
  }

  return (
    <div>
      <p>Count: {count}</p>
      <button type="button" onClick={directTwice}>
        Direct value twice
      </button>
      <button type="button" onClick={functionalTwice}>
        Functional update twice
      </button>
    </div>
  );
}
```

The first handler normally queues `1` and `1`, so the next state is `1`. The second queues two transformations, so the next state is `2` higher. The word “normally” matters: React may optimize scheduling, but correctness should come from the action semantics, not from counting renders.

**Batching reduces render work, not snapshot rules.** React can process multiple state updates together and commit fewer intermediate results. React 18's `createRoot` enables automatic batching for updates from React events and common asynchronous callbacks such as timers, promise continuations, and native event callbacks. Exact boundaries depend on the root and scheduling context; updates separated by different turns or an `await` boundary should not be described as universally one batch. Batching does not make a current callback read newly queued state. `flushSync` is a narrow escape hatch for code that must force a synchronous DOM commit, such as a carefully justified layout measurement.

**Lazy initialization avoids repeated setup work.** `useState(expensive())` evaluates `expensive()` every time the component function runs because JavaScript evaluates arguments before calling `useState`. React uses the resulting value only for initialization on a mount. `useState(() => expensive())` passes an initializer function; React calls it during initial state setup and stores its result. It is not rerun for ordinary updates, but it can run again for a genuine remount and may be invoked more than once by development Strict Mode checks. Keep it pure and synchronous.

**State objects and arrays need new identities.** React compares state values using `Object.is` semantics when deciding whether a state transition is observably different. In-place mutation such as `items.push(item); setItems(items)` changes data while retaining the same array reference. React may treat the next state as unchanged, and older renders can also observe data changed underneath them. Return a new array or object, and copy each nested level that changes. `useState` replaces the state value; it does not shallow-merge object fields like class `setState` did.

**Identity, keys, and ownership determine continuity.** State belongs to a component at a particular identity in the rendered tree. A stable `key` lets React associate an item with the same component instance when list order changes. Changing a key intentionally gives that subtree a new identity and fresh state. Keep state in the narrowest owner that needs it. Lift it to the lowest common parent when siblings must coordinate, and use context or an external store only when the sharing boundary justifies the wider update fan-out.

**Effects are the boundary for external systems.** An Effect is not a second way to calculate render data. Use it to synchronize a committed render with something React does not own: a subscription, timer, network connection, media element, or imperative widget. Setup belongs in the Effect and cleanup must undo the exact resource. Filtered arrays, totals, formatted labels, and other pure derivations belong during render, with `useMemo` only as a measured performance optimization.

**Strict Mode and concurrent rendering require purity.** In development, Strict Mode may call render logic, lazy initializers, or updater functions more than once to expose mutation and side effects. Concurrent rendering may begin a render, pause it, retry it, or discard it before commit. A discarded render has no committed UI and must not have caused observable work. Do not mutate state, increment external counters, write storage, start requests, or touch the DOM while calculating JSX or inside a state updater. Event handlers and Effects are the appropriate boundaries for those actions.

**SSR adds an environment boundary.** A lazy initializer still executes while the component is rendered on the server. `window`, `document`, and `localStorage` are not guaranteed to exist there. Guarding access prevents a crash, but a browser-only initial value can still differ from the server HTML and cause hydration problems. Prefer a deterministic server-safe initial value, then synchronize a browser preference after hydration when that is the intended design.

**TypeScript describes the state contract.** Type inference works well for literals and initial values, but annotate empty collections and nullable values when the intended domain is broader:

```tsx
import { useState } from "react";

type User = { id: string; name: string };

export function UserEditor() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  function selectFirstUser() {
    setSelectedUser(users[0] ?? null);
  }

  return (
    <div>
      <p>Status: {status}</p>
      <p>Selected: {selectedUser?.name ?? "none"}</p>
      <button type="button" onClick={selectFirstUser}>
        Select first user
      </button>
      <button type="button" onClick={() => setStatus("saving")}>
        Mark saving
      </button>
      <button
        type="button"
        onClick={() => setUsers((previous) => [...previous, { id: "1", name: "Asha" }])}
      >
        Add user
      </button>
    </div>
  );
}
```

The setter accepts either a value of the state type or a function from the previous state to the next state. `setSelectedUser(null)` is valid because the state type includes `null`; `useState([])` without a useful contextual type can infer an unusably narrow empty-array type. TypeScript checks the state contract, but it does not make mutation safe or change React's runtime snapshot model.

## 4. Real Code — See It Working

The examples below are complete TSX components. They assume a normal React + TypeScript application and can be rendered from that application's entry point.

**Immutable object and array updates**

```tsx
import { useState } from "react";

type Profile = {
  name: string;
  preferences: { theme: "light" | "dark"; emailUpdates: boolean };
  tags: string[];
};

export function ProfileEditor() {
  const [profile, setProfile] = useState<Profile>({
    name: "Asha",
    preferences: { theme: "light", emailUpdates: true },
    tags: ["react"],
  });

  function toggleTheme() {
    setProfile((previous) => ({
      ...previous,
      preferences: {
        ...previous.preferences,
        theme: previous.preferences.theme === "light" ? "dark" : "light",
      },
    }));
  }

  function addTag() {
    setProfile((previous) => ({ ...previous, tags: [...previous.tags, "typescript"] }));
  }

  return (
    <section>
      <p>{profile.name}'s theme: {profile.preferences.theme}</p>
      <p>Tags: {profile.tags.join(", ")}</p>
      <button type="button" onClick={toggleTheme}>Toggle theme</button>
      <button type="button" onClick={addTag}>Add tag</button>
    </section>
  );
}
```

Only the changed nested object is copied. Unchanged values may retain their identity. A shallow copy is enough at each level that changes; a deep clone on every update is usually unnecessary and can make identity-based optimizations less useful.

**Lazy initialization and derived data**

```tsx
import { useState } from "react";

type Task = { id: number; title: string; done: boolean };

function readInitialTasks(): Task[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem("tasks");
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Task[]) : [];
  } catch {
    return [];
  }
}

export function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>(() => readInitialTasks());
  const [query, setQuery] = useState("");

  const visibleTasks = tasks.filter((task) =>
    task.title.toLowerCase().includes(query.toLowerCase()),
  );

  function toggleTask(id: number) {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    );
  }

  return (
    <section>
      <input
        value={query}
        placeholder="Filter tasks"
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul>
        {visibleTasks.map((task) => (
          <li key={task.id}>
            <button type="button" onClick={() => toggleTask(task.id)}>
              {task.done ? "Done" : "Open"}: {task.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

The saved tasks are initial state, so the read is lazy and does not repeat when `query` changes. `visibleTasks` is derived during render, so it cannot become out of sync with `tasks` and `query`. A real application should validate persisted data more strictly than this compact teaching example.

**Effects synchronize external resources**

```tsx
import { useEffect, useState } from "react";

export function WindowWidth() {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const updateWidth = () => setWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);

    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  return <p>Width: {width === null ? "measuring" : String(width) + "px"}</p>;
}
```

The state is the value displayed by React; the resize subscription is owned by the browser and therefore belongs in an Effect. The cleanup makes the setup safe under unmounting and Strict Mode's development setup-cleanup-setup probe. The initial `null` is also safe for SSR because the browser global is read only after commit.

## 5. The Interview Questions — All of Them, Done Properly

**What does `useState` return?** It returns a pair: the value for the current render and a setter function. Array destructuring permits any local names. The setter returns `undefined`; it does not return the next state.

**Where does state live between function calls?** React associates hook records and their pending update queues with the component instance, conceptually in ordered hook slots on its internal Fiber data. The function's local variables are recreated; React's stored hook state is not.

**Why does `console.log(count)` after `setCount(count + 1)` show the old value?** The handler belongs to the current render and closes over that render's `count` binding. The setter queues work for a later render; it does not mutate the binding in the already-running function. To use the intended value immediately, calculate `const next = count + 1` and use `next` locally as well as passing it to the setter.

**When should I use a functional updater?** Use it whenever the next value depends on the previous value: counters, toggles based on current state, accumulated results, or updates that may be queued by callbacks holding old snapshots. It is especially important for multiple dependent updates. It is not a magic refresh for other captured props or state values.

**What is the result of calling a setter three times?** It depends on the actions. Three `setCount(count + 1)` calls from a `0` snapshot queue the value `1` three times, so the result is normally `1`. Three `setCount(previous => previous + 1)` calls queue transformations and produce `3`. Batching may reduce render passes, but the queue still applies actions in order.

**What does batching mean?** React groups compatible updates so it can render and commit less often. It is a scheduling optimization, not an immediate-assignment guarantee and not a promise that every update anywhere becomes one render. Do not use a render count as application correctness logic.

**Does `useState` merge objects?** No. The setter replaces the whole state value. For object state, return the fields you want to keep: `setUser(previous => ({ ...previous, name: "Mina" }))`. For nested changes, copy every changed level.

**Why is mutation unsafe?** Mutation keeps the same reference and can make `Object.is(previous, next)` true even though a property was changed. It also changes data that an older render may still be reading. New identities make the state transition explicit and preserve snapshot reasoning.

**What is lazy initialization?** `useState(() => createInitialValue())` gives React an initializer to call during initial state setup. It avoids running the setup expression on every component execution. It runs again for a new mount and may be checked more than once in development Strict Mode, so it must be pure.

**Is lazy initialization the same as `useMemo`?** No. Lazy initialization supplies the starting value of state; later changes happen through the setter. `useMemo` caches a derived calculation and may recompute it when dependencies change. Neither is a license for render-time side effects.

**How can state itself be a function?** React interprets a function passed as the initial argument or setter argument as code to call. To store a function as the initial value, use `useState(() => handler)`. To store a new function value through a setter, use `setHandler(() => nextHandler)`. This wrapper distinguishes a function value from an updater function.

**How do keys affect state?** A stable key lets React preserve a child's identity when its position in a list changes. Changing the key tells React that it is a different component instance, so its state initializes again. Do not use an array index as a key when insertion, deletion, or reordering can associate a row's state with the wrong item.

**Where should state live?** Put it in the smallest owner that needs to change and render it. Lift it to the lowest common parent for coordinating siblings. Props are a delivery mechanism, context is a delivery mechanism across a subtree, and an external store is a broader ownership choice; none replaces the need to identify the actual owner.

**When should I avoid `useState`?** Avoid it for values that can be derived during render, values that must not trigger a render (often `useRef`), complex action-driven transitions (often `useReducer`), and server cache data (a query/cache library may be more appropriate). These are design choices, not absolute prohibitions.

**Can I fetch data in a lazy initializer or state updater?** No. Both execute during render-time state calculation and must be pure. Start asynchronous work from an event handler or an Effect, with cancellation or stale-result protection when needed. Prefer a server-state library for caching and request lifecycle concerns.

**What changes with SSR?** State initialization runs while rendering on the server, so browser-only APIs can crash. Even guarded browser reads can produce different server and client markup. Use a deterministic initial value and reconcile browser-only data after hydration when necessary.

**What does Strict Mode prove?** It helps reveal impure rendering by replaying selected work in development. It does not mean production renders exactly once, and it does not mean an event happened twice. Code should be correct if a render or updater is started and discarded without commit.

## 6. The Traps — What Goes Wrong

**Trap: treating a setter like assignment.** `setOpen(true); if (open) ...` still sees the old snapshot. Decide the immediate branch from a local `nextOpen` value, or let the next render decide from state.

**Trap: using a stale direct value in a repeated update.** `setCount(count + 1)` twice uses the same snapshot twice. Use `setCount(previous => previous + 1)` when both operations are meant to accumulate.

**Trap: assuming a functional updater refreshes every closure.** It receives the latest pending value for that one state slot. It does not make captured props, another state variable, or a local variable current. Fix the surrounding data flow, dependencies, or ownership separately.

**Trap: mutating before calling the setter.** `profile.preferences.theme = "dark"; setProfile(profile)` mutates an existing snapshot and returns the same top-level identity. Copy the changed path with spread syntax or a carefully chosen immutable helper.

**Trap: forgetting that object state is replaced.** `setForm({ email })` removes other fields unless they are copied. Use `setForm(previous => ({ ...previous, email }))`, or use separate state values or a reducer when fields have complex transitions.

**Trap: using an unstable list key.** Index keys can preserve the wrong row's local state after insertion or reorder. Use a stable identifier from the data. A key is not a prop delivered to the child; pass the identifier separately if the child needs it.

**Trap: mirroring props into state without a policy.** `useState(props.value)` reads the prop only for initial state setup. Later prop changes do not reset that state. Use the prop directly if it is not independently editable, or intentionally reset by changing the child's key when the component identity changes.

**Trap: storing derived state through an Effect.** Keeping `filteredItems` in state and synchronizing it from `items` and `query` creates a stale interval and an extra update path. Derive it during render; memoize only if profiling shows the pure calculation is expensive.

**Trap: putting side effects in render, an initializer, or an updater.** A render can be retried or abandoned, and Strict Mode can replay it. Do not write storage, mutate a module cache, send analytics, start a request, or modify the DOM there. Use an event handler or an Effect with cleanup.

**Trap: claiming that React 18 always produces exactly one render.** Batching usually reduces compatible updates, but render counts vary with update boundaries, priorities, bailouts, Strict Mode, and the root/API in use. Explain the state result and scheduling semantics separately.

**Trap: reading `window` during SSR initialization.** A browser-only lazy initializer can throw on the server or disagree with server HTML. Use a server-safe initial value and a post-hydration synchronization plan.

## 7. Compare With Related Concepts

| Concept | Difference from `useState` | Good default |
|---|---|---|
| Props | Inputs owned by the parent; the child reads them and asks the parent to change them through callbacks. | Use props for parent-controlled data and configuration. |
| `useRef` | A persistent mutable box whose `.current` changes do not schedule a render. | Use it for DOM nodes, timer IDs, or latest imperative values that do not paint. |
| `useReducer` | Centralizes transitions as actions and a reducer instead of exposing several direct setters. | Use it when state transitions are interdependent, numerous, or action-oriented. |
| Derived value | Recomputed from current props/state rather than stored as an independent source of truth. | Derive totals, filters, and labels during render. |
| `useMemo` | Caches a calculation and may recalculate when dependencies change; it is not state ownership. | Use only for an expensive pure calculation supported by measurement. |
| Context | Delivers a value through a subtree; it is not itself a replacement for state ownership. | Use when prop passing across many layers is the real problem. |
| External store | Owns state outside one component tree and can coordinate many consumers. | Use when the domain genuinely outgrows local ownership. |
| Module variable | Shared JavaScript memory with no per-instance lifecycle or automatic render notification. | Use for constants or infrastructure, not per-instance UI state. |
| Effect | Synchronizes a committed render with an external system. | Do not use it to calculate values already derivable from render inputs. |

## 8. 🧠 The Memory Hook — What Sticks

Every render is a photograph. The `count` in that photograph never changes, and every handler from that render remembers that photograph. A setter does not edit it; it queues an instruction for React's private, ordered state ledger. React applies queued actions, renders a new photograph, and commits it if that render is still the one it wants.

Remember the compact rule:

> Store minimal changing facts. Read state as a snapshot. Use functional updaters for previous-state logic. Return new identities for changed objects and arrays. Keep side effects outside render. Let keys and ownership define continuity.
