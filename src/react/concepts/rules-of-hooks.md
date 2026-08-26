# Rules of Hooks

## 1. Why This Exists — The Problem First

Picture a component that renders a profile page. On the first render it calls `useState` for the name, `useEffect` for a subscription, and `useState` for an editable note. Then the subscription is disabled. If the component simply skips that effect on the next render, the note state moves into the effect's old position. React can no longer tell which stored value belongs to which call.

That is the failure the Rules of Hooks prevent. They are not formatting preferences. They preserve the one stable fact React uses to reconnect a function component with its state between renders: the order in which its hooks are called.

## 2. The Analogy — Make It Obvious

Think of a component as a customer walking through a bank every time it renders. The bank gives the customer three numbered service windows:

```txt
window 1: useState for name
window 2: useEffect for subscription
window 3: useState for note
```

The bank does not identify a window by reading its JavaScript variable name. It remembers that the first hook call owns the first hook record, the second call owns the second record, and so on. On the next visit, the customer must walk past the same windows in the same order so each record goes back to the same job.

If the customer skips window 2 only when a feature flag is off, the old window 3 is now mistaken for window 2. The bank has not lost the records; it has lost the meaning of their positions. Calling a custom hook is like walking through several pre-arranged windows as one route: its internal hooks still occupy positions in the same route. Calling a hook from an event handler is different: that is the customer trying to open a new service window after leaving the bank, when there is no render visit to associate it with.

## 3. How It Actually Works — The Full Explanation

React function components are called again when their inputs or state produce an update. Each call is a new render snapshot: local variables are recreated, but React must reconnect hook calls in that new snapshot to the state, refs, effects, and memoized values from the component's Fiber.

React keeps hook records associated with that Fiber. In the React 18 implementation, the records are traversed in call order while the component is rendering. A simplified render looks like this:

```txt
render Component
  first hook call  -> first hook record
  second hook call -> second hook record
  third hook call  -> third hook record
```

The exact internal data structures and dispatcher functions are implementation details, but the observable contract is stable: React uses position, not the variable name on the left side, to match a hook call with its record. The Rules of Hooks make that positional lookup deterministic.

This contract also matters outside a simple, uninterrupted browser render. During server-side rendering, React still evaluates the component with a render dispatcher, and the server output must be compatible with the client's first render so hydration can attach to the same structure. Do not branch around ordinary hooks based on server-only versus browser-only conditions; make the initial render consistent and move browser-only work into an effect or an explicit client boundary. In concurrent rendering, React may pause, interrupt, restart, or discard a render before committing it. Render code—including hook calls—must therefore be pure and repeatable: do not perform subscriptions, mutations, or other one-time work while the component function is executing. Effects belong to the commit phase, after React accepts a render.

There are two rules.

First, call hooks only at the top level of a React function component or a custom hook. “Top level” means that every render reaches the call site in the same order. Do not put a hook inside an `if`, a loop, a `try`/`catch`, a nested function, or after an early return that can change between renders. A component may contain conditional rendering; the hook calls themselves must remain unconditional.

Second, call hooks only from React function components or custom hooks. A normal utility function does not run as part of React's render dispatcher. An event handler runs later, outside the render dispatcher. By contrast, an `Array.prototype.map` callback invoked while a component renders runs synchronously during that render; putting a hook in it is still an unsupported looped or nested call site because the number or order of iterations can change. That violates hook order, but it does not inherently mean React will report an invalid-hook-call error. Invalid-hook-call errors are about calls made outside a valid React render context, such as an event handler or ordinary utility invocation.

Custom hooks do not create a separate state store. A custom hook is an ordinary JavaScript function whose name starts with `use` and which calls hooks. When a component calls it, the custom hook's built-in hook calls participate in that component's one ordered sequence. Two components can call the same custom hook and still receive independent state because their Fibers are different.

The `use` prefix is a tooling convention, not a magic runtime registration step. `eslint-plugin-react-hooks` uses naming conventions to find custom hooks and check their call sites. React DevTools also presents hook-like functions more usefully when they follow the convention. A function that calls hooks but is named `readFeatureFlag` may appear to work, yet it makes static analysis less reliable and misleads the next person reading it.

When conditional behavior is needed, keep the hook call fixed and move the condition inside it. For an effect, the dependency list must also include the reactive values that decide whether the effect should run. For a custom hook, call the custom hook every time and let it return a value that the component uses conditionally.

React's development build also checks for changes in the number or order of hooks across renders and reports errors such as “Rendered fewer hooks than expected” or “Rendered more hooks than during the previous render.” Strict Mode can make render and cleanup problems easier to notice by deliberately re-running certain development behaviors, but Strict Mode is not what makes the Rules of Hooks necessary. The positional contract applies to ordinary React rendering too. The lint rule is valuable because it catches many violations before the component executes.

One important version boundary: this repository's React material assumes React 18. React versions that support the special `use` API have separate rules for that API, but that exception does not make ordinary `useState`, `useEffect`, `useRef`, `useMemo`, or custom hooks safe to call conditionally. Do not generalize a special API's behavior to all hooks.

## 4. Real Code — See It Working

This complete TypeScript/React 18 fixture models a feature flag, a subscription, and two independent pieces of state. The effect is always registered in the same position; only its work is conditional.

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type FeatureFlags = Record<string, boolean>;
const FeatureFlagContext = createContext<FeatureFlags>({});

export function FeatureFlagProvider({
  children,
  flags,
}: {
  children: ReactNode;
  flags: FeatureFlags;
}) {
  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

function useFeatureFlag(name: string) {
  const flags = useContext(FeatureFlagContext);
  return Boolean(flags[name]);
}

function useRoomSubscription(roomId: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const connection = {
      connect() {
        console.log(`connected to room ${roomId}`);
      },
      disconnect() {
        console.log(`disconnected from room ${roomId}`);
      },
    };

    connection.connect();
    return () => connection.disconnect();
  }, [enabled, roomId]);
}

export function RoomEditor({ roomId }: { roomId: string }) {
  const liveUpdatesEnabled = useFeatureFlag("live-room-updates");
  useRoomSubscription(roomId, liveUpdatesEnabled);
  const [title, setTitle] = useState("Launch checklist");
  const [notes, setNotes] = useState("");

  return (
    <main>
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <p>Live updates: {liveUpdatesEnabled ? "on" : "off"}</p>
    </main>
  );
}

export function App() {
  return (
    <FeatureFlagProvider flags={{ "live-room-updates": true }}>
      <RoomEditor roomId="room-42" />
    </FeatureFlagProvider>
  );
}
```

The common broken version is deceptively short:

```tsx
type Props = { roomId: string; liveUpdatesEnabled: boolean };

function BrokenRoomEditor({ roomId, liveUpdatesEnabled }: Props) {
  if (liveUpdatesEnabled) {
    useRoomSubscription(roomId, true); // ❌ hook call changes between renders
  }

  const [notes, setNotes] = useState("");
  return <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />;
}
```

The fix is to call `useRoomSubscription(roomId, liveUpdatesEnabled)` on every render. The custom hook itself decides whether to subscribe. The same principle applies to early returns:

```tsx
function Profile({ userId }: { userId: string | null }) {
  const [isSaving, setIsSaving] = useState(false);

  // The hook runs before the conditional return on every render.
  if (userId === null) return <p>Select a user.</p>;

  return <button disabled={isSaving}>{isSaving ? "Saving…" : `Edit ${userId}`}</button>;
}
```

An event handler is a normal function invoked by an event, not a new place to create hook state:

```tsx
function SaveButton() {
  const [saved, setSaved] = useState(false);

  function handleClick() {
    setSaved(true);
  }

  return <button onClick={handleClick}>{saved ? "Saved" : "Save"}</button>;
}
```

If reusable code needs no React state, make it a utility and pass its inputs. If it needs React state, context, or effects, make it a custom hook and call it from the component's top level.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are the two Rules of Hooks, and why do they exist?**

Hooks must be called at the top level of React function components or custom hooks, and hooks must not be called from ordinary JavaScript functions. React relies on the stable order of hook calls to match the current render to hook records associated with the component's Fiber. The rules preserve that order and ensure a hook is called while React has the component render context it needs.

**Q: Why can't a hook be called conditionally?**

A condition can make a call exist on one render and disappear on another. Every later hook then shifts position, so React may read the record belonging to a different hook call. This is a hook-order violation; it is not automatically an invalid-hook-call error, which usually means a hook ran outside React's render context. The safe shape is `useEffect(() => { if (!enabled) return; ... }, [enabled])`, not `if (enabled) useEffect(...)`.

**Q: Does “top level” forbid conditional rendering?**

No. It forbids conditional hook calls. This is fine: `const value = useValue(); return enabled ? <Panel value={value} /> : <Empty />`. The component can choose different JSX after all its hooks have been called. It can also render a different child component, because each child has its own hook sequence and Fiber.

**Q: Why can a custom hook call other hooks?**

A custom hook is executed during its caller's render. Its internal hook calls become part of the caller's ordered hook sequence. This is composition, not a second state machine. Therefore the custom hook must also call its hooks unconditionally and in a stable order.

**Q: Why should a custom hook name start with `use`?**

The prefix tells humans and hook-aware tooling that the function follows hook rules. React does not need a `registerCustomHook` call, and the prefix alone does not make an invalid call legal. It is a convention that helps `eslint-plugin-react-hooks` analyze the function and helps DevTools present it as hook logic.

**Q: What happens when hook order changes?**

In development, React usually detects the changed hook count or order and throws a diagnostic. The underlying problem is still positional mismatch: the render has asked for a different sequence than the Fiber's stored records describe. Never rely on the error as the design; keep the sequence stable so production behavior is correct too.

**Q: Can hooks be called in event handlers, callbacks, or utility functions?**

No. Event handlers and ordinary utility callbacks run outside the component's render context. A callback passed to `rows.map(...)` during render is synchronous, but a hook there is still a looped/nested call whose order can change; that is a Rules of Hooks violation rather than an inherently invalid-hook-call error. A utility function can receive values and return a calculation, but it cannot create React state by calling a hook. If reusable code needs hooks, expose it as a custom hook and call that custom hook at the component's top level.

**Q: Which tool catches violations?**

Use `eslint-plugin-react-hooks` as the first line of defense. It performs static analysis and catches many conditional, nested, and incorrectly placed calls. React's development runtime also checks hook consistency while rendering. These checks complement each other; neither changes the rule that the call order must be stable.

## 6. The Traps — What Goes Wrong

**Putting a hook after an early return.** This fails when the return condition changes. On a loading render, React might stop before the hook; on a loaded render, it reaches the hook. Move every hook above the return, or split the loaded view into a child component whose hook sequence is independent.

**Calling a custom hook conditionally.** The fact that the call looks like one function call hides all the hooks inside it. `if (enabled) useSearchParams()` can shift several internal hook records at once. Call it every render and let the custom hook handle `enabled`, or render a separate child component when the feature is enabled.

**Calling a component function directly.** `Panel()` is just a normal function call. If `Panel` contains hooks, those hooks execute inside the parent's render sequence and can break the parent's order when the call is conditional or inside a loop. `<Panel />` gives React a separate component boundary and a separate Fiber.

**Calling a hook inside a loop or `map`.** The callback passed to `rows.map(...)` runs synchronously during the render; “later” describes event handlers, not `map`. The number or order of iterations can change as data changes, so a hook there violates the stable sequence even though the call is happening during a valid render and does not inherently produce an invalid-hook-call error. Do not call `useRef` or a custom hook once per row inside `rows.map(...)`. Render a child component for each row, or use one hook holding a `Map` keyed by row ID.

**Confusing hook rules with dependency rules.** The Rules of Hooks answer “where and in what order may this hook call happen?” A dependency array answers “when should this effect, memo, or callback be recalculated?” A component can obey call order and still have stale effect dependencies, or have a complete dependency list while illegally calling the effect conditionally.

**Assuming Strict Mode is the cause of the error.** Strict Mode may expose impure rendering and missing cleanup by repeating development behavior, but it does not invent the hook contract. A component that only works when Strict Mode is removed is still broken. Fix the unstable call structure or the side-effect cleanup instead of disabling the diagnostic.

**Disabling the lint rule.** The warning often points to a real structural problem that can become a render-dependent crash. If the code is hard to express without a conditional hook, the design usually needs a child component, an unconditional custom hook, or plain JavaScript passed explicit inputs.

## 7. Compare With Related Concepts

**Rules of Hooks vs dependency arrays:** call-order rules keep hook records aligned; dependency arrays control when an effect or cached calculation responds to changed values. Use the first to structure calls and the second to describe reactive inputs honestly.

**Custom hook vs utility function:** a custom hook may call React hooks and must be called from a component or another custom hook; a utility function must not call hooks and should receive all data as parameters. Use a utility for a pure calculation and a custom hook for behavior tied to React state, context, or lifecycle.

**Custom hook vs component:** a hook returns data and actions; a component returns UI. Use a hook when the caller should own the markup, and a component when you need a separate rendering boundary and lifecycle.

**Conditional hook vs conditional hook logic:** `if (enabled) useThing()` changes the hook sequence and is invalid. `useThing({ enabled })`, with the condition handled inside the hook, keeps the sequence fixed. Use the second form when the same component owns both modes; use separate child components when the modes have different lifecycles.

**Calling `Component()` vs rendering `<Component />`:** direct invocation executes the function in the caller's render context; JSX creates a React element that React renders as its own component. Use `<Component />` for components that contain hooks, especially inside conditions or lists.

## 8. 🧠 The Memory Hook — What Sticks

React gives hook state to numbered seats, not named variables: every render must walk past the same seats in the same order. Keep the hook calls fixed; put conditions inside the hook or behind a child component boundary.
