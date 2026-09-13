# React Reconciliation: How React Preserves and Replaces UI

## 1. Why This Exists — The Problem First

React lets a component describe the whole UI for the current state:

```tsx
return <button disabled={isSaving}>Save</button>;
```

That description is cheap JavaScript data. The browser DOM is a stateful, expensive external system. Replacing the whole DOM whenever `isSaving` changes would throw away focus, selection, scroll position, media playback, browser-managed input state, and component state.

Reconciliation is React's process for comparing the result of a new render with the previously committed Fiber tree. It decides which existing elements can represent the same thing, which props or text need updating, and which nodes must be inserted, moved, or removed. The commit phase then applies the resulting host changes to the DOM.

The goal is not to find a mathematically perfect edit script for every possible tree. React uses practical assumptions about UI trees: a different type usually means a different subtree, and a stable key identifies a child across renders. Those assumptions make common updates approximately linear in the number of relevant nodes instead of requiring a general tree-edit search.

Reconciliation therefore protects two kinds of continuity at once:

- **Host continuity:** a matched DOM element can keep its node, focus, selection, and browser state.
- **Component continuity:** a matched component Fiber can keep its hooks, refs, and effect lifecycle.

The central interview question is: “At this rendered position, is this the same entity as before?” The answer comes from type, key, and parent/child position—not from whether two JSX objects happen to have the same shape.

## 2. The Analogy — Make It Obvious

Imagine a museum curator comparing yesterday's exhibit plan with today's plan.

The curator first checks the room assignment. If a room that held a **painting gallery** is now assigned to a **science lab**, the curator clears the room and installs the new exhibit. Nothing inside the old room is considered reusable merely because some objects look similar. This is a change of element type, so the old subtree is unmounted and the new subtree mounts.

If it is still a painting gallery but the wall color changed, the curator keeps the room, frames, and visitor position, and changes only the affected property. This is the same element type with new props.

For a row of exhibits, position alone is not enough. Each exhibit has a catalog number. If exhibit `A` moves from slot 1 to slot 3, the curator follows catalog number `A`; its local notes and condition record move with it. Those catalog numbers are React keys. If the curator labels every exhibit with its current slot number, inserting one exhibit at the front makes every later label lie, so notes stay attached to the wrong exhibit. That is the index-key bug.

The curator may prepare a new plan, pause, and discard it when a newer request arrives. Visitors see only an approved plan, never a half-installed one. That is Fiber's render-versus-commit boundary: render/reconciliation prepares work in memory; commit makes one synchronous visible transition. A discarded plan never runs its committed effects.

## 3. How It Actually Works — The Full Explanation

**React elements, Fibers, and identity**

JSX creates React element descriptions. They commonly contain `type`, `key`, and `props`; they are not DOM nodes and they do not hold hook state. A Fiber is React's internal work record for a component, host element, or other node. It links the current committed record with the work-in-progress record and stores information such as props, state, lanes, refs, and flags.

For a child at a given parent position, React can reuse the existing Fiber when the identity matches. In practical terms, identity is determined by:

1. **The parent and sibling slot:** children are reconciled under a particular parent. A component moved to a different owner/parent position is not automatically the same state location.
2. **The element type:** for a host element, `"button"` and `"div"` differ; for a component, the function or class reference matters. Two separately declared functions with identical bodies are different types.
3. **The key:** among siblings, a key distinguishes one child from another. A key is local to that sibling set; `key="42"` under one parent does not identify a child under a different parent.

The phrase “ownership” is useful at the component boundary: the component that returns JSX establishes the parent/child relationship in the rendered tree, and keys are interpreted within that parent's children. It is not a license to move state by moving a JavaScript variable. Internal fields such as an element's `_owner` are implementation details and should not be used as application identity.

**The matching rules**

- If a rendered position has no old child, React creates a new Fiber and marks the needed host work for insertion.
- If old and new children have different types, React replaces that subtree. Descendant state and refs are lost; unmount cleanups run for the old subtree, and mount behavior runs for the new one after it commits.
- If type and key match, React reuses the Fiber. A function component runs again with new props, and its hook state remains associated with that Fiber. A host element keeps its DOM node while React updates changed props and then reconciles its children.
- If a matching keyed child appears at a different sibling index, React can preserve the Fiber and arrange its host nodes at the new position. A move is not the same as a remount.

For unkeyed children, React primarily matches by position. This is often fine for an append-only list of identical stateless rows. It is unsafe when insertion, deletion, filtering, or sorting changes which data item occupies a position. A key should be stable, unique among the current siblings, and derived from the item's identity—not generated during render.

The array algorithm uses a fast sequential pass while old and new children line up, then map-like lookup for remaining keyed children. The exact internal implementation is version-dependent, so “$O(n)$ diffing” is a useful heuristic description, not a promise that every render costs exactly one operation per node. Matching also does not mean React skips all work: new props can still cause a component render or host-property update.

**State preservation and remounting**

State belongs to a position in the rendered tree as identified by its parent relationship, type, and key. Keeping the same component function at the same keyed position preserves its hooks. Changing the key deliberately creates a new identity:

```tsx
<ProfileForm key={selectedUserId} userId={selectedUserId} />
```

When `selectedUserId` changes, the old form unmounts and the new form mounts, which is a useful way to reset form state. Conversely, changing only a prop preserves state, so a component must explicitly synchronize or reset state when that is what the product behavior requires.

**Render, reconciliation, and commit**

These terms describe related but distinct work:

- **Render:** React calls components and evaluates JSX to calculate the next React element output.
- **Reconciliation:** React matches that output with the current Fiber tree, reuses or creates Fibers, and records changes such as placement, update, or deletion. This is in memory; it is not a DOM mutation.
- **Commit:** React synchronously applies the finished host changes and makes the work-in-progress tree current. The user never sees a partially committed tree.

In concurrent React, render/reconciliation work can be interrupted, restarted, reprioritized, or discarded. A component body must therefore be pure: do not mutate external systems, start subscriptions, or assume that every render call becomes visible. A render can happen without a commit, so render-time logging is not a reliable “the user saw this” signal.

Effects belong to the commit lifecycle. Cleanup for an old committed effect runs when that effect is replaced or its component unmounts. `useLayoutEffect` runs after DOM mutations and before the browser paints the committed update, making it suitable for layout measurement that must happen before paint. `useEffect` is a passive effect scheduled after commit; React generally lets the browser paint first, but its exact scheduling should not be treated as a timer contract.

Strict Mode in development intentionally exercises purity and cleanup. In a Strict Mode tree, React may call render logic more than once and may perform an extra setup/cleanup cycle for effects on initial mount. This is a development diagnostic, not evidence that production has two durable component instances. Concurrent discarded renders likewise do not run effects from an uncommitted tree.

React's memoization features change how much work is attempted, not the identity rules:

- `React.memo` can skip a parent-driven function-component render when its props compare equal, but local state and context updates can still render it.
- `useMemo` caches a calculated value; it does not make a component type stable or guarantee a permanent cache.
- Reusing the same React element object can allow React to reuse that subtree, but creating a new element object is not itself a remount when type, key, and position still match.
- A state update with an `Object.is`-equal value may be ignored, but mutating an object in place is still a correctness bug because React cannot observe the intended changed reference.

**React and TypeScript context**

TypeScript checks the props supplied to a component; it does not participate in runtime reconciliation. `key` is special React metadata and is not received as a normal prop, so declare a separate `id` when the child needs the identifier:

```tsx
type RowProps = { id: string; label: string };

function Row({ id, label }: RowProps) {
  // `id` is available here. `key` would not be.
  return <li data-row-id={id}>{label}</li>;
}

function Rows({ rows }: { rows: RowProps[] }) {
  return (
    <ul>
      {rows.map((row) => (
        <Row key={row.id} id={row.id} label={row.label} />
      ))}
    </ul>
  );
}
```

The generic `ReactNode` type is appropriate for arbitrary `children`, while a specific element type is appropriate when an API requires one particular component shape. Neither type annotation changes how React matches the resulting runtime elements.

## 4. Real Code — See It Working

**Example 1: same type preserves state; a key or type change resets it**

This complete TSX example can run in a React + TypeScript app. Increment the counter, then change its label, its key, and its wrapper type.

```tsx
import { useState } from 'react';

function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0);

  return (
    <p>
      {label}: {count}{' '}
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        increment
      </button>
    </p>
  );
}

export default function IdentityDemo() {
  const [label, setLabel] = useState('first label');
  const [counterKey, setCounterKey] = useState('stable');
  const [useSection, setUseSection] = useState(false);

  const counter = <Counter key={counterKey} label={label} />;

  return (
    <main>
      <button type="button" onClick={() => setLabel('new label')}>
        Change prop: preserve count
      </button>{' '}
      <button type="button" onClick={() => setCounterKey((key) => `${key}!`)}>
        Change key: reset count
      </button>{' '}
      <button type="button" onClick={() => setUseSection((value) => !value)}>
        Change wrapper type: reset descendant
      </button>

      {useSection ? <section>{counter}</section> : <div>{counter}</div>}
    </main>
  );
}
```

Changing `label` keeps the `Counter` identity. Changing `counterKey` changes its identity. Changing the wrapper from `div` to `section` replaces that wrapper subtree, so the counter also remounts even though its own JSX looks similar.

**Example 2: stable data keys keep state with the item**

```tsx
import { useState } from 'react';

type Todo = { id: string; text: string };

function TodoRow({ todo }: { todo: Todo }) {
  const [checked, setChecked] = useState(false);

  return (
    <li>
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />{' '}
        {todo.text}
      </label>
    </li>
  );
}

export default function KeyDemo() {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 'a', text: 'Read' },
    { id: 'b', text: 'Practice' },
  ]);

  return (
    <section>
      <button
        type="button"
        onClick={() =>
          setTodos((items) => [{ id: 'new', text: 'New first task' }, ...items])
        }
      >
        Prepend
      </button>
      <ul>
        {todos.map((todo) => (
          <TodoRow key={todo.id} todo={todo} />
        ))}
      </ul>
    </section>
  );
}
```

Check `Read`, prepend, and observe that its checked state stays with `Read`. Replacing `key={todo.id}` with `key={index}` makes state follow positions instead of todos. The stable key does not prevent the new row from rendering; it tells React which existing row the old Fiber belongs to.

**Example 3: render can be discarded, but effects require a commit**

```tsx
import { StrictMode, useEffect, useState } from 'react';

function ConnectionStatus({ roomId }: { roomId: string }) {
  useEffect(() => {
    const connection = openRoomConnection(roomId);
    connection.connect();
    return () => connection.disconnect();
  }, [roomId]);

  return <output>Room: {roomId}</output>;
}

type Connection = { connect(): void; disconnect(): void };

function openRoomConnection(roomId: string): Connection {
  return {
    connect: () => console.log(`connected to ${roomId}`),
    disconnect: () => console.log(`disconnected from ${roomId}`),
  };
}

export default function EffectsDemo() {
  const [roomId, setRoomId] = useState('general');

  return (
    <StrictMode>
      <button type="button" onClick={() => setRoomId('interviews')}>
        Switch room
      </button>{' '}
      <ConnectionStatus roomId={roomId} />
    </StrictMode>
  );
}
```

The component body can be evaluated during a render that React later abandons. The connection belongs in an effect because React runs that setup only for a committed result and runs its cleanup when the committed effect is replaced or removed. In development Strict Mode, the setup/cleanup cycle may be deliberately repeated to expose missing cleanup.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is reconciliation?**

It is React's in-memory matching process: React compares newly rendered element descriptions with the current Fiber tree and records what can be reused, inserted, moved, updated, or deleted. Commit is the separate synchronous step that applies host changes. Reconciliation is not a synonym for “the browser painted.”

**Q: What determines whether state is preserved?**

The rendered position under the same parent, the same element type, and the same key. Same props are not required; changing props normally preserves state. A different type or key creates a new identity and resets descendant state at that replaced position.

**Q: Does React compare JSX object references?**

Not as the primary identity rule. New JSX objects can still match an existing Fiber when their type, key, and position match. Conversely, the same-looking component function created anew inside a render is a different function reference and therefore a different type. Stable element references can enable a bailout, but element reference equality is an optimization detail, not the general state-preservation rule.

**Q: Why are keys required for lists?**

Keys identify siblings across renders when their order changes. They let React preserve the correct Fiber, DOM node, and local state for an item that moves. Keys must be unique among siblings and stable for the lifetime of that data identity; they do not need to be globally unique.

**Q: Why is an array index a risky key?**

An index describes a slot, not an item. After a prepend or deletion, the same index refers to different data, so React reuses the old row's state for the new item at that slot. Index keys can be acceptable for a truly static, never-reordered list whose items have no local state, but an ID from the data model is the safer default.

**Q: What happens when a type changes?**

React does not recursively search for visually similar descendants. It replaces the old subtree at that position. Old effects clean up, refs detach, state is discarded, and the new subtree mounts. Changing a wrapper from `div` to `section` can therefore reset a form nested below it.

**Q: What is the difference between render and commit?**

Render executes component logic and reconciliation builds a candidate Fiber tree in memory. Commit applies the finished mutation work to the host environment and makes that tree current. Render can be interrupted or discarded in concurrent React; commit is synchronous and a discarded render has no committed effects.

**Q: When do `useLayoutEffect` and `useEffect` run?**

Both are tied to a committed update, not to an arbitrary render call. Layout effects run after DOM mutations and before paint. Passive effects run after commit and are generally deferred until after paint. Each effect's cleanup runs before the next committed setup for that effect when dependencies change, or on unmount.

**Q: Does Strict Mode mean React mounts production UI twice?**

No. In development, Strict Mode intentionally re-invokes render logic and exercises effect setup/cleanup to reveal impure rendering and missing cleanup. Code must tolerate this, but it should not use development-only invocation counts to infer production behavior.

**Q: Can `React.memo` or `useMemo` stop reconciliation?**

They can reduce work in specific cases. `React.memo` compares parent-provided props for a component, while local state or context can still schedule it. `useMemo` caches a value between renders when dependencies compare equal. Neither changes type/key identity, makes effects run during render, or guarantees that React never evaluates a component.

**Q: What does TypeScript have to do with keys?**

Nothing at runtime. TypeScript validates props, but `key` is consumed by React and is not passed into the component's props. Pass an `id` separately when the component needs to read it. A type such as `ReactNode` describes allowed children; it does not control Fiber matching.

**Q: How do you intentionally reset state?**

Give the component a new key, or render a different component type/position. The explicit-key approach is usually clearest:

```tsx
<Editor key={documentId} documentId={documentId} />
```

Use it when switching documents should create a fresh editor. Do not change keys merely to force an update; that also destroys focus, pending local state, and effect continuity.

## 6. The Traps — What Goes Wrong

**Trap: defining a component inside another component**

```tsx
function Dashboard() {
  function SearchBox() {
    const [query, setQuery] = useState('');
    return <input value={query} onChange={(event) => setQuery(event.target.value)} />;
  }

  return <SearchBox />;
}
```

`SearchBox` is a new function type on every `Dashboard` render. React can remount it and lose its state. Define component types at module scope and pass values through typed props.

**Trap: generating keys during render**

```tsx
items.map((item) => <Row key={crypto.randomUUID()} item={item} />);
```

Every render gives every row a new identity, so React cannot reuse the old rows. This causes remounts, effect churn, lost local state, and avoidable DOM work. Create an ID when the item is created, not while it is being displayed.

**Trap: confusing a key with a prop**

```tsx
function Row(props: { id: string }) {
  return <li>{props.id}</li>;
}

// `key` selects identity; `id` supplies application data.
<Row key={item.id} id={item.id} />;
```

`props.key` is not how a child reads the key. Explicitly pass `id` when needed.

**Trap: assuming same output means no component render**

React may execute a component and then discover that the host output needs no mutation. Render cost and DOM mutation cost are different. Use profiling and appropriate memoization when render work matters; do not infer component execution from a lack of visible DOM changes.

**Trap: performing side effects in render**

```tsx
function BadAnalytics({ userId }: { userId: string }) {
  analytics.track('view', { userId }); // may run for a discarded render
  return <p>{userId}</p>;
}
```

Concurrent rendering and Strict Mode make this unsafe. Keep render pure. Put synchronization with an external system in an effect, or perform a user-caused action in its event handler.

**Trap: using `React.memo` as a state boundary**

A memoized component can still update because its own state or a context subscription changed. `React.memo` only addresses eligible parent-prop updates; it does not freeze a subtree or prevent reconciliation from reaching a context consumer.

**Trap: changing a wrapper to change styling**

```tsx
return isCard ? (
  <div className="card"><CheckoutForm /></div>
) : (
  <section className="plain"><CheckoutForm /></section>
);
```

The wrapper type change replaces the subtree. Prefer one stable element type with a conditional class when the layout semantics do not actually require a different element.

**Trap: claiming that keys move arbitrary state**

Keys preserve state only within the same relevant sibling set. Moving a child under a different parent, changing its type, or changing its key intentionally changes the identity relationship. A key is not a global database ID for React state.

## 7. Compare With Related Concepts

| Concept | What it answers | Relationship to reconciliation | Interview distinction |
| :--- | :--- | :--- | :--- |
| **Rendering** | What React elements does component code return for this update? | Produces the candidate output that reconciliation will compare. | A component can render without a visible commit. |
| **Reconciliation** | Which old Fibers match the new elements, and what work is needed? | Uses parent position, type, and key to preserve or replace identity. | It is in-memory matching, not DOM mutation. |
| **Fiber** | What internal work record and tree structure represent the update? | Stores the current and work-in-progress records used during reconciliation. | Fiber is the architecture/data structure; reconciliation is the matching work. |
| **Commit** | What changes become visible in the host environment? | Applies the completed flags and finalizes the new current tree. | Commit is synchronous; an abandoned render never commits. |
| **Virtual DOM / React elements** | What lightweight JavaScript descriptions represent UI? | The new element descriptions are inputs to reconciliation. | Elements are descriptions, not DOM nodes and not component state. |
| **Component state** | What local data survives between renders? | It is attached to a preserved Fiber identity. | Same props do not reset it; a changed key/type can. |
| **`key`** | Which sibling data identity is this? | Enables matching across insertions, deletions, and moves. | It is sibling-scoped metadata, not a normal prop. |
| **`React.memo`** | Can a parent-driven render be skipped for this component? | Reduces render work after identity is established. | It does not override state, context, type, or key behavior. |
| **`useEffect`** | How should committed UI synchronize with an external system? | Setup and cleanup run around committed effect lifecycles. | It does not run for a render that React discards. |
| **TypeScript** | Are the props and children statically valid? | It has no runtime role in Fiber matching. | A TS `key` type cannot make unstable runtime keys correct. |

## 8. 🧠 The Memory Hook

**Same parent position + same type + same key = keep the identity.** React may render a new plan, but only a committed plan reaches the screen. A type change demolishes the subtree; a key names the right sibling so state travels with the item; a prop change usually keeps state; an effect belongs to commit, not render. In TypeScript, remember: `key` tells React who the child is, while `id` tells the child what the data is.
