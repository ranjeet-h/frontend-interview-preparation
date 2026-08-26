# `useCallback`: Function Identity Across Render Snapshots

## 1. Why This Exists — The Problem First

You have a page with a search box and a large list of rows. Typing in the search box changes only the query, but the parent renders again. Every render creates a new `onArchive` function. A row wrapped in `React.memo` compares its old props with its new props, sees a different function object, and renders again even though that row's data did not change. With hundreds of rows, a tiny input update becomes visible work.

The tempting fix is worse when it is applied mechanically. A developer writes `useCallback(() => save(user, draft), [])` to keep the function stable, then discovers that the callback keeps saving the first `user` and first `draft`. The UI looks current; the callback is operating from an old render snapshot. That is a correctness bug disguised as an optimization.

`useCallback` exists for one narrow job: preserve a callback's reference while the values that callback is meant to close over stay the same. It does not make the callback body faster, and it does not stop its owner from rendering. It becomes useful when another system observes function identity, such as a memoized child, a hook dependency list, or an external subscription API.

## 2. The Analogy — Make It Obvious

Imagine a building where a security desk checks visitors' badges. The desk does not compare the text printed on two badges character by character; it recognizes the physical badge token. A new badge is a new visitor to the desk, even if it has exactly the same name and permissions.

The parent render is the office producing today's badge. An inline function creates a fresh badge each time the render runs. `React.memo` is the security desk: it can skip admitting a child only when the relevant prop tokens are the same. `useCallback` is the badge office's rule saying, “Reuse yesterday's badge until one of the permissions used by this person changes.” Those permissions are the dependency array.

The important limit is also visible in the analogy. Reusing the badge does not change what the employee says when admitted; it only preserves the token by which the desk identifies them. If the badge is reused while its printed permissions are stale, the employee still has the old permissions. In React terms, omitting a value from the dependencies can preserve identity while preserving the wrong closure too.

## 3. How It Actually Works — The Full Explanation

Every function component call is a fresh execution. A render creates a new lexical environment containing that render's props, state values, local variables, and functions. If a callback reads `count`, it reads the `count` belonging to the render that created the callback. This is why a React render is best understood as a snapshot: an event handler does not see a magical mutable component instance; it sees the variables captured by its own render.

An ordinary inline callback therefore has a new identity on each render:

```ts
const first = () => 1;
const second = () => 1;
console.log(first === second); // false: same behavior, different objects
```

On mount, `useCallback(callback, dependencies)` stores the callback and its dependency values in the hook slot belonging to that component instance. On a later render, JavaScript still evaluates the new callback expression. React then compares each new dependency with the previous dependency using `Object.is`. If every item matches, the dependencies make the previous callback eligible for reuse; if any item differs, React stores and returns the newly created callback. This is a reuse rule, not an absolute identity guarantee: React may discard its memoization cache, including if a component suspends during its initial mount or if its file is edited in development. Code must remain correct when the callback is recreated.

That means the dependency array is not a list of “when to run the function” conditions. The function runs only when something calls it. The array says when React may return a different function identity, and therefore when the callback should receive a new closure with current values.

The comparison is shallow and positional. Primitive values compare by value under `Object.is`; objects, arrays, and functions compare by reference. A freshly created object is different even when its fields are equal:

```ts
const previousOptions = { limit: 20 };
const nextOptions = { limit: 20 };
console.log(Object.is(previousOptions, nextOptions)); // false
console.log(Object.is(NaN, NaN)); // true
console.log(Object.is(-0, 0)); // false
```

The dependency list must include reactive values read by the callback: props, state, and variables declared in the component that can change between renders. Stable state setter functions supplied by React do not need to be listed. A functional state update often removes a state dependency because React supplies the latest pending value to the updater:

```tsx
import { useCallback, useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  const incrementFromSnapshot = useCallback(() => {
    setCount(count + 1);
  }, [count]);

  const incrementFromLatestState = useCallback(() => {
    setCount((previousCount) => previousCount + 1);
  }, []);

  return (
    <section>
      <p>Count: {count}</p>
      <button type="button" onClick={incrementFromSnapshot}>
        Increment from snapshot
      </button>
      <button type="button" onClick={incrementFromLatestState}>
        Increment from latest state
      </button>
    </section>
  );
}
```

The second callback does not read `count` from its closure. It asks React to apply a transformation to the latest queued state, so its identity can remain stable while the count changes.

TypeScript checks the callback's parameter and return types, while React supplies the hook's runtime behavior. Let inference handle simple callbacks when the surrounding types are clear, but annotate parameters at the boundary where inference cannot help and use an explicit function type when the callback is part of a component API:

```tsx
import { useCallback, useState } from "react";
import type { ChangeEvent } from "react";

type SearchBoxProps = { onSearch: (query: string) => void };

export function SearchBox({ onSearch }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.currentTarget.value;
    setQuery(nextQuery);
    onSearch(nextQuery);
  }, [onSearch]);

  return <input value={query} onChange={handleChange} />;
}
```

Common TypeScript traps are using the browser's global `MouseEvent` instead of React's `React.MouseEvent<HTMLButtonElement>` for JSX handlers, leaving an `id` or event parameter implicitly `any`, and declaring a prop as `() => void` when the child actually needs `(id: string) => void`. Type the function at the prop boundary and type event parameters with React's event types. If an event handler is asynchronous, wrap the call when the project's lint rules reject a promise-returning handler: `onClick={() => void save()}`. These are type-contract issues; `useCallback` does not infer a missing domain parameter or repair a stale dependency list.

A callback can still be created on every render even when React returns the cached callback. The JavaScript expression is evaluated before the hook receives it; React can reuse the previous result, but it cannot prevent the source expression from being written or evaluated. Memoization is worthwhile only when the stable identity allows meaningful downstream work to be skipped.

`React.memo` and `useCallback` solve different halves of a pipeline. `React.memo` lets a child skip a render when its props compare equal. `useCallback` can make one function prop compare equal. The child still renders if another prop is new, if its own state changes, if it consumes changed context, or if its parent deliberately changes its key. A non-memoized child renders when its parent renders; a stable callback alone cannot change that.

State ownership matters more than callback caching. If a child owns state, a parent update need not change that child's state. If a parent owns state, the parent must receive the update and will render; a callback can reduce work below the parent, but cannot move ownership or prevent the state transition. Keys are identity boundaries for component instances, not callback-dependency tools. Changing a key remounts the subtree and resets its hooks; a stable callback from the old instance is not carried into the new instance.

Effects and external synchronization need a separate distinction. If a custom hook subscribes to an external system and includes a callback in its setup dependencies, a new callback can cause unsubscribe/subscribe churn. A stable callback can make that contract quiet, but it does not make the external system correct by itself. The effect must still clean up, and every value that controls the subscription must be represented honestly. For values that should be read latest without changing the subscription, use the React API intended for that purpose (where available) or isolate the ref-based policy inside a custom hook; do not lie about dependencies in a component.

Strict Mode may invoke render logic more than once in development to expose impure work. Concurrent rendering may start a render, pause it, restart it, or discard it before commit. A callback produced during a discarded render is never a guarantee that an external system observed it. Do not perform side effects while creating a callback, and do not use callback identity as a signal that a render committed. Event handlers run from committed UI, while speculative render values can disappear.

Server Components cannot call interactive hooks such as `useCallback`; put that logic in a Client Component marked with the framework's client boundary (for example, `"use client"`). A Client Component may still be prerendered to HTML during SSR, but its callback is not serialized into that HTML. Hydration runs the Client Component again in the browser, creates client-side closures, and attaches event behavior there. The server render and hydrated client render therefore do not share callback identity, and `useCallback` is not a server/client identity bridge.

## 4. Real Code — See It Working

**Example 1: a complete memoized list with honest dependencies**

This example is self-contained TSX. Toggling the theme rerenders `TaskBoard`, but the memoized rows can skip because their task objects and callback props remain stable. Toggling a task changes only the affected task object; the other rows keep their previous object references.

```tsx
import { memo, useCallback, useState } from "react";

type Task = { id: string; title: string; done: boolean };

const TaskRow = memo(function TaskRow({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: (id: string) => void;
}) {
  return (
    <li>
      <button type="button" onClick={() => onToggle(task.id)}>
        {task.done ? "Undo" : "Complete"}
      </button>{" "}
      <span>{task.title}</span>
    </li>
  );
});

export function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: "a", title: "Review metrics", done: false },
    { id: "b", title: "Ship the fix", done: true },
  ]);
  const [dark, setDark] = useState(false);

  // The callback uses only the stable setter and the event argument.
  const toggleTask = useCallback((id: string) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    );
  }, []);

  return (
    <main data-theme={dark ? "dark" : "light"}>
      <button type="button" onClick={() => setDark((current) => !current)}>
        Theme: {dark ? "dark" : "light"}
      </button>
      <ul>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={toggleTask} />
        ))}
      </ul>
    </main>
  );
}
```

**Example 2: a stale closure and its correction**

The first component intentionally demonstrates the bug: `message` is read but omitted, so the function created by the first render is reused. The corrected component includes the value. The callback identity now changes when the message changes, which is the correct trade-off.

```tsx
import { useCallback, useState } from "react";

export function HonestSaveButton() {
  const [message, setMessage] = useState("first draft");

  const save = useCallback(() => {
    // This closure must see the current message.
    console.log("Saving:", message);
  }, [message]);

  return (
    <section>
      <input value={message} onChange={(event) => setMessage(event.target.value)} />
      <button type="button" onClick={save}>Save</button>
    </section>
  );
}

export function StaleSaveButtonForContrast() {
  const [message, setMessage] = useState("first draft");
  const save = useCallback(() => {
    console.log("Incorrectly saves:", message);
  }, []); // message is missing: this is intentionally unsafe

  return (
    <section>
      <input value={message} onChange={(event) => setMessage(event.target.value)} />
      <button type="button" onClick={save}>Save</button>
    </section>
  );
}
```

**Example 3: `useCallback` as part of an external-sync contract**

The direct `useEffect` call is isolated inside a custom hook because synchronization is the hook's responsibility. The component passes a stable callback so the subscription does not restart when unrelated component state changes. The cleanup is still essential; stability is not cleanup.

```tsx
import { useCallback, useEffect, useState } from "react";

function useRoomSubscription(roomId: string, onMessage: (text: string) => void) {
  useEffect(() => {
    const timer = window.setInterval(() => onMessage(`message from ${roomId}`), 1000);
    return () => window.clearInterval(timer);
  }, [roomId, onMessage]);
}

export function RoomPanel() {
  const [roomId, setRoomId] = useState("frontend");
  const [lastMessage, setLastMessage] = useState("none");

  const handleMessage = useCallback((text: string) => {
    setLastMessage(text);
  }, []);

  useRoomSubscription(roomId, handleMessage);

  return (
    <section>
      <button type="button" onClick={() => setRoomId("backend")}>Join backend</button>
      <p>Room: {roomId}</p>
      <p>Latest: {lastMessage}</p>
    </section>
  );
}
```

**Example 4: stable identity does not mean latest closure data**

`useRef` is sometimes the right companion when an external callback must keep one identity but read mutable latest data. That is a different semantic choice from `useCallback`: the ref deliberately opts out of render-snapshot capture. Encapsulate that policy and document it.

```tsx
import { useCallback, useRef, useState } from "react";

export function StableLatestLogger() {
  const [label, setLabel] = useState("initial");
  const latestLabel = useRef(label);
  latestLabel.current = label;

  const logLatest = useCallback(() => {
    // The identity is stable; the ref supplies an intentionally mutable read.
    console.log(latestLabel.current);
  }, []);

  return (
    <section>
      <input value={label} onChange={(event) => setLabel(event.target.value)} />
      <button type="button" onClick={logLatest}>Log latest</button>
    </section>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does `useCallback` actually memoize?**

It memoizes the function reference returned to the component. Conceptually, `useCallback(fn, deps)` is similar to `useMemo(() => fn, deps)`. React compares the dependencies and returns either the previously stored function or the newly supplied one. It does not memoize the result of calling the function.

**Q: Does `useCallback` prevent a component from rerendering?**

No. The component that calls `useCallback` still runs whenever its state, props, or context require it. The hook can help a memoized child receive an equal function prop, but `React.memo` must be present and all relevant props must compare equal. The callback itself is not a render shield.

**Q: Why can an inline function break `React.memo`?**

Functions are objects, and two separately evaluated function expressions have different references. `React.memo` performs a shallow prop comparison by default, so a new function prop is unequal even when both functions would do the same thing. Stabilize the callback only if skipping that child render is valuable.

**Q: Why is the dependency array about closures rather than invocation?**

The array controls when React may replace the callback with a callback created by a newer render. The callback may be invoked at any later time, but it reads the lexical values captured when its particular function was created. Dependencies therefore describe which captured values make a new closure necessary; they do not schedule calls.

**Q: When can a dependency be removed with a functional update?**

When the callback only needs state to calculate the next state, pass an updater such as `setItems((items) => nextItems(items))`. The updater receives the latest state from React, so the outer callback need not capture that state. This does not remove dependencies for unrelated props, configuration, or values read for side effects.

**Q: How does `useCallback` differ from `useMemo`, `useRef`, and an inline function?**

`useCallback` preserves a function identity according to dependencies. `useMemo` preserves a computed value, which may be an object or array. `useRef` preserves one mutable container whose `.current` changes without rendering; it is not a dependency-aware closure cache. An inline function is simplest and creates a new identity each render. Choose based on the observer that cares, not on a blanket rule that every function should be memoized.

**Q: Why might a callback still cause a memoized child to render?**

Another prop may be new, such as `style={{ color: "blue" }}` or `items={items.filter(...)}`. The child may have changed state, consume changed context, or receive a changed key. A custom comparison function may also define different equality rules. Function stability is one link in the comparison chain, not the whole chain.

**Q: What should a custom hook promise about callback identity?**

It should make stability intentional and document it if consumers are expected to place the returned callback in dependency arrays or pass it to memoized children. A hook should not memoize merely to hide a design problem. It must also expose the right dependencies: an API callback that reads a changing endpoint, token, or options value must update when that value changes.

**Q: Can `useCallback` make an effect run only once?**

No. It can keep a function dependency stable, but an external synchronization routine still runs according to its own dependency contract and lifecycle. Development Strict Mode can exercise setup and cleanup more than once, and a changing room ID should restart a room subscription. The goal is correct synchronization and cleanup, not a fragile “once” illusion.

**Q: What changes under Strict Mode and concurrent rendering?**

Development Strict Mode may repeat render-phase work to reveal impure code. Concurrent React may prepare a render that is later abandoned. A memoized callback from an abandoned render is not committed UI and must not be used to perform work during render. Treat callbacks as descriptions attached to committed elements; put external work in event handlers or correctly managed synchronization code.

**Q: Does `useCallback` have meaningful server-rendering identity?**

Server Components cannot call `useCallback`, and no cross-request identity should be assumed. A Client Component can be prerendered during SSR, but its callback is not serialized into the HTML. Hydration runs that Client Component again in the browser, creates client closures, and attaches event behavior. Use the hook for client-side comparison behavior, not as a serialization or server/client identity mechanism.

**Q: Is `useCallback` always a performance improvement?**

No. React still evaluates the callback expression, allocates dependency arrays, compares dependencies, and retains the cached value. If the consumer is a native element or a cheap non-memoized child, there may be no skipped work. Measure expensive render paths and prefer clear code until a stable identity has a concrete consumer.

## 6. The Traps — What Goes Wrong

**Trap: using `[]` to force permanent stability**

The wrong assumption is that an empty dependency list means “this callback should always be safe.” It actually means “this callback may keep the closure from its initial render forever.” If it reads `userId`, `draft`, `locale`, or any other changing value, it can act on stale data. Include the value, or redesign the callback around a functional updater or an explicitly documented latest-value mechanism.

**Trap: memoizing the callback but not the other props**

This looks optimized but still creates new references:

```tsx
import { memo, useCallback, useState } from "react";

type Row = { id: string; open: boolean };
type PanelProps = {
  onRefresh: () => void;
  filters: { status: string };
  rows: Row[];
};

const MemoizedPanel = memo(function MemoizedPanel({
  onRefresh,
  filters,
  rows,
}: PanelProps) {
  return (
    <section>
      <button type="button" onClick={onRefresh}>Refresh</button>
      <p>{filters.status}: {rows.length} rows</p>
    </section>
  );
});

export function Parent() {
  const [query, setQuery] = useState("");
  const rows: Row[] = [
    { id: "a", open: true },
    { id: "b", open: false },
  ];
  const stableRefresh = useCallback(() => {
    console.log("refresh", query);
  }, [query]);

  return (
    <div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} />
      <MemoizedPanel
        onRefresh={stableRefresh}
        filters={{ status: "open" }}
        rows={rows.filter((row) => row.open)}
      />
    </div>
  );
}
```

The object and filtered array are new on every render, so shallow comparison still fails. Derive them outside the frequently changing owner, memoize an expensive/stability-sensitive value with its own honest dependencies, or let the child render if the work is cheap.

**Trap: expecting a stable callback to update a stale value**

Identity and freshness are separate axes. A callback can be stable and intentionally read a ref, or it can be recreated when its closure values change. Do not claim that `useCallback(..., [])` reads current state; it reads the initial snapshot unless the callback uses a different source of truth.

**Trap: putting mutable ref contents in dependencies**

`ref.current` is a mutable value, not a reactive signal. Mutating an object in place does not give React a new reference or schedule a render. A dependency list cannot make React observe arbitrary mutations. Use state for values the UI must react to, immutable replacements for reactive objects, and refs only for non-rendering mutable ownership.

**Trap: adding `useCallback` to every DOM handler**

The browser button does not skip React work because its `onClick` reference stayed equal. If no memoized child or dependency consumer observes identity, the hook adds code and comparison overhead without a useful payoff. An inline handler is often the clearest choice.

**Trap: using callback identity as an effect guard**

A changing callback may reveal that an effect is coupled to a value it reads; freezing it to suppress reruns hides the coupling and risks stale data. Keep the dependency contract truthful. If the effect is really a subscription, isolate the subscription policy in a custom hook with cleanup and an explicit latest-value strategy.

**Trap: confusing keys with callback stability**

A key tells React which child instance is which among siblings. Changing it can destroy and recreate state, refs, and callback closures. It is appropriate when a new identity should start fresh, not as a way to make an existing callback stable or to force dependency arrays to behave differently.

**Trap: trusting development render counts as production behavior**

Strict Mode's extra development checks are not proof that production will render the same number of times. They are a test of purity and cleanup. Write render logic and callback creation so repeated or discarded evaluation is harmless; measure production-like performance separately.

## 7. Compare With Related Concepts

| Concept | What remains stable | What it is for | Choose it when |
| --- | --- | --- | --- |
| `useCallback(fn, deps)` | A function reference eligible for reuse while dependencies match | Supplying a stable callback to an observer | A memoized child or dependency consumer benefits from equality |
| `useMemo(() => value, deps)` | A calculated value/reference until dependencies change | Caching expensive work or a stable object/array | The value computation or downstream reference matters |
| `useRef(initialValue)` | One ref object; `.current` is mutable | Non-rendering instance memory or DOM handles | The latest value must be mutable without scheduling a render |
| `React.memo(Component)` | A child render can be skipped when props compare equal | Memoizing a component boundary | The child is expensive and often receives equal props |
| Inline function | Nothing; a new function object per render | Clear local event behavior | No consumer benefits from referential equality |
| Functional state updater | The callback can avoid capturing current state | Applying a transition to the latest state | Next state depends only on previous state |
| `key` | Component instance identity while the key is unchanged | Matching or intentionally remounting children | A changed identity should reset state and refs |

The practical decision is a chain: first decide who observes identity, then stabilize only the value that observer compares. For a cheap native button, use an inline function. For a costly memoized row, stabilize the callback and every other prop that should remain equal. For an expensive derived array, consider `useMemo` rather than `useCallback`. For mutable bookkeeping that should not render, use `useRef`. For state transitions based on prior state, use a functional updater.

## 8. 🧠 The Memory Hook — What Sticks

`useCallback` keeps the badge, not the behavior: it makes a function eligible for reuse while dependencies match, but React may discard that cache, and the function still carries the render snapshot that created it. `React.memo` is the desk that can use the badge, and functional updates are the escape hatch from capturing changing state.
