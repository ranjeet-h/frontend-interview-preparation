# Immutability in React State

## 1. Why This Exists — The Problem First

Imagine a shopping cart stored in React state. A developer wants to add one item:

The following two short snippets are illustrative contrasts; the complete runnable version follows them.

```text
cart.items.push(newItem);
setCart(cart);
```

The array really does contain the item after this code runs. The problem is that `cart` is still the same object, and `cart.items` is still the same array. The state setter receives the same root reference it already held. React can compare the old and next state with `Object.is`, notice that they are identical, and bail out of the update. The badge may stay stale until an unrelated render happens.

The safer update creates a new reference at every changed level:

```text
setCart((previousCart) => ({
  ...previousCart,
  items: [...previousCart.items, newItem],
}));
```

```tsx
import { useState } from "react";

type CartItem = { id: number; name: string };
type Cart = { items: CartItem[] };

export function CartExample() {
  const [cart, setCart] = useState<Cart>({ items: [] });
  const newItem: CartItem = { id: 1, name: "Notebook" };

  const addItem = () => {
    setCart((previousCart) => ({
      ...previousCart,
      items: [...previousCart.items, newItem],
    }));
  };

  return (
    <section>
      <button onClick={addItem}>Add {newItem.name}</button>
      <p>Items: {cart.items.length}</p>
    </section>
  );
}
```

This is not a rule about copying everything. It is a rule about preserving the meaning of a render: each render should be able to read a stable snapshot, and a changed state path should be represented by new identities. React, `React.memo`, `useMemo`, dependency arrays, external stores, and many developer tools all use identity as a fast signal.

The same discipline matters in React + TypeScript. TypeScript can describe and sometimes protect an immutable boundary with `readonly`, but it does not freeze a runtime object. The update pattern and the ownership model still have to be correct.

## 2. The Analogy — Make It Obvious

Think of a restaurant's order board. At 12:00, the kitchen receives a photographed order sheet. At 12:05, a customer changes one item. The reliable process is to issue a new sheet that shares the unchanged order details and records the new item. The old sheet remains a truthful record of what the kitchen was preparing at 12:00.

Direct mutation is like erasing the old sheet while the kitchen is still reading it. A manager looking only at the sheet number cannot tell that its contents changed. A second kitchen, a delayed printer, or an audit log may see a contradictory version of the same order.

Immutable React state uses the sheet identity as a quick change signal and treats each render as a dated copy of the order. A new root object says, “inspect this update”; reused child references say, “this branch is unchanged.” This is structural sharing: a new path for the changed data, shared references for untouched data.

## 3. How It Actually Works — The Full Explanation

**Referential equality is the fast signal.** JavaScript primitives compare by value. Objects, arrays, and functions compare by identity:

```tsx
const first = { role: "admin" };
const second = first;
second.role = "editor";

console.log(Object.is(first, second)); // true: one object, two names
console.log(first.role); // "editor": the original object was mutated

const third = { ...first, role: "viewer" };
console.log(Object.is(first, third)); // false: a new object identity
```

React does not recursively deep-compare every state property after every setter call. Identity comparisons are cheap, so immutable updates give React a useful signal. A new reference means the value may have changed; it does not mean every descendant must render. An unchanged reference can allow a bailout, but a parent render, context update, or other reason can still cause work elsewhere.

**Structural sharing follows the changed path.** A shallow spread copies only one level. For `state.account.preferences.theme`, the root, `account`, and `preferences` references must be new; unrelated branches can remain shared:

```text
previous root ── account ── preferences ── "light"
      │             │             │
      └── reports ──┘             └── theme branch

next root      ── new account ── new preferences ── "dark"
      │
      └── same reports reference
```

This makes `next.reports === previous.reports` true while the changed path has new identities. It is usually less work and less memory than deep-cloning the entire state tree.

**A render is a snapshot.** During one render, props and state variables are values for that render. Event handlers and asynchronous callbacks close over that snapshot. An immutable update makes the previous snapshot remain readable and prevents a later event from changing what an earlier render appeared to contain. If an async callback needs the latest state to calculate the next value, use a functional updater rather than expecting a closed-over variable to change.

**State ownership determines where the update belongs.** The component or store that owns a piece of state should perform the update. A child receiving `user` must not assign `user.role = ...`; it should call an `onRoleChange` callback supplied by the owner. Lifting state to the nearest common owner keeps one source of truth and makes the immutable transition explicit.

**Keys are identity for list positions.** Immutable array updates preserve item objects that did not change, while stable data keys tell React which child instance represents which item. A key is not a deep comparison and is not a substitute for immutability. Use a stable identifier from the data, not an array index when items can be inserted, removed, or reordered.

**Functional updates compose with batching.** When the next state depends on the previous state, use `setState((previous) => next)`. React can queue several updater functions and apply them in order. This avoids stale event-handler values and makes the update safe when React batches work or delays a transition.

**Effects are the external-systems boundary.** Immutability is needed while calculating React state; `useEffect` is for synchronizing with something outside React, such as a subscription, timer, DOM API, or network connection. Do not mutate state in an effect to “make React notice.” Compute the new immutable state in an event handler or updater, and use an effect only when an external system must be connected to that state. Cleanup must undo the setup.

**Strict Mode and concurrent rendering expose impurities.** In development, Strict Mode may call render-phase logic more than once and may perform an extra setup/cleanup cycle for effects. Concurrent rendering can start, pause, restart, or abandon render work before commit. Mutating an object read during render makes those operations observe shared, partially changed data. Immutable state keeps uncommitted versions separate from the committed snapshot. Strict Mode is a development diagnostic, not a reason to write code that depends on a single render call.

**TypeScript helps at the boundary.** `readonly` can reject common assignments during type-checking, while `as const` narrows literals. Neither performs a deep runtime freeze, and a cast can silence the compiler. Prefer immutable APIs and narrow ownership:

```tsx
type Settings = Readonly<{
  theme: "light" | "dark";
  alerts: boolean;
}>;

const settings: Settings = { theme: "light", alerts: true };
// settings.theme = "dark"; // TypeScript error: readonly property
const nextSettings: Settings = { ...settings, theme: "dark" };
```

## 4. Real Code — See It Working

**Example 1 — Runnable TSX: object and nested-object updates.** This component owns the profile and changes the root and nested identities intentionally:

```tsx
import { useState } from "react";

type Profile = {
  name: string;
  preferences: { theme: "light" | "dark"; email: boolean };
};

export function ProfileEditor() {
  const [profile, setProfile] = useState<Profile>({
    name: "Asha",
    preferences: { theme: "light", email: true },
  });

  const rename = (name: string) => {
    setProfile((previous) => ({ ...previous, name }));
  };

  const toggleTheme = () => {
    setProfile((previous) => ({
      ...previous,
      preferences: {
        ...previous.preferences,
        theme: previous.preferences.theme === "light" ? "dark" : "light",
      },
    }));
  };

  return (
    <section>
      <p>{profile.name}: {profile.preferences.theme}</p>
      <button onClick={() => rename("Mira")}>Rename</button>
      <button onClick={toggleTheme}>Toggle theme</button>
    </section>
  );
}
```

**Example 2 — Runnable TSX: array operations, functional updates, and stable keys.** `map` replaces one item, `filter` removes one, and spread adds one. The `key` comes from the todo, not its current position:

```tsx
import { useState } from "react";

type Todo = { id: number; text: string; done: boolean };

export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: "Read", done: false },
    { id: 2, text: "Practice", done: false },
  ]);

  const add = (text: string) => {
    setTodos((previous) => [
      ...previous,
      { id: Date.now(), text, done: false },
    ]);
  };

  const toggle = (id: number) => {
    setTodos((previous) => previous.map((todo) =>
      todo.id === id ? { ...todo, done: !todo.done } : todo,
    ));
  };

  const remove = (id: number) => {
    setTodos((previous) => previous.filter((todo) => todo.id !== id));
  };

  const sortByText = () => {
    setTodos((previous) => [...previous].sort((a, b) =>
      a.text.localeCompare(b.text),
    ));
  };

  return (
    <section>
      <button onClick={() => add("Ship")}>Add</button>
      <button onClick={sortByText}>Sort</button>
      {todos.map((todo) => (
        <div key={todo.id}>
          <button onClick={() => toggle(todo.id)}>
            {todo.done ? "Done" : "Open"}: {todo.text}
          </button>
          <button onClick={() => remove(todo.id)}>Remove</button>
        </div>
      ))}
    </section>
  );
}
```

The mutating array methods include `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, and `copyWithin`. Copy first when an operation mutates: `setItems((previous) => [...previous].sort(compare))`. Modern runtimes also provide non-mutating `toSorted`, `toReversed`, `toSpliced`, and `with`.

**Example 3 — Runnable TSX: state ownership and an effect boundary.** The owner changes state; the child requests a change; the effect synchronizes a document title and cleans up nothing because setting the title needs no subscription:

```tsx
import { useEffect, useState } from "react";

type User = Readonly<{ name: string; role: "member" | "admin" }>;

function UserCard({ user, onRoleChange }: {
  user: User;
  onRoleChange: (role: User["role"]) => void;
}) {
  return (
    <button onClick={() => onRoleChange("admin")}>
      {user.name}: {user.role}
    </button>
  );
}

export function Account() {
  const [user, setUser] = useState<User>({ name: "Asha", role: "member" });

  useEffect(() => {
    document.title = `${user.name} (${user.role})`;
  }, [user.name, user.role]);

  return (
    <UserCard
      user={user}
      onRoleChange={(role) => setUser((previous) => ({ ...previous, role }))}
    />
  );
}
```

For very deep domain state, a reducer or a library such as Immer can make immutable transitions easier to read. Immer lets a recipe mutate a draft proxy and produces a structurally shared immutable result; the state contract is still immutable outside the recipe. Use that trade-off deliberately rather than assuming every nested object needs a deep clone.

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does React care about immutable state?** React uses identity as an efficient change signal, and immutable updates preserve stable render snapshots. A changed path gets new references; unchanged paths can remain shared. This supports predictable updates, memoization, dependency comparisons, debugging history, and interruptible rendering.

**Q: Does React always re-render when I pass a new object?** No. A new state reference can schedule work, but React may bail out at other boundaries, and a memoized child may skip rendering when its props are unchanged. A new reference is a signal, not a promise that every component renders.

**Q: Why can direct mutation appear to work?** The mutation changes the object in memory, but `setState(sameObject)` may not produce a visible update because the identity is unchanged. Later, a parent, context, timer, or unrelated state update may render the component and expose the mutated value. That accidental success is not a valid state transition and becomes less likely behind `React.memo` or an isolated test.

**Q: What is structural sharing?** It is reusing references for unchanged branches while creating new objects and arrays along the changed path. It avoids duplicating the whole state tree and lets identity-sensitive consumers quickly recognize unchanged data.

**Q: How do you update deeply nested state without a bug?** In native JavaScript, spread every level from the root to the changed field. For complex transitions, use `useReducer` or Immer with a clear immutable boundary. A shallow root copy alone is not enough if a nested object is then mutated.

**Q: Why use a functional updater?** Use `setCount((previous) => previous + 1)` or its object equivalent when the next value depends on the previous value. React queues updater functions and applies them against the latest queued state, so multiple updates compose correctly under batching and delayed rendering.

**Q: How do keys relate to immutability?** Immutable arrays describe which item objects changed; stable keys describe which child identity belongs to each item. Both matter. A new array with index keys can still associate local child state with the wrong item after reordering.

**Q: Where do effects fit?** Effects synchronize React with external systems after commit. They are not a replacement for immutable event updates, a place to mutate state objects, or a general mechanism for deriving values that can be calculated during render.

**Q: What do Strict Mode and concurrent rendering change?** Strict Mode intentionally stresses render purity and effect cleanup in development. Concurrent rendering may abandon an in-progress render. Code that mutates shared state during render can leak work across attempts; immutable snapshots keep abandoned work from changing committed data.

**Q: Can TypeScript enforce immutability?** `readonly` and `Readonly<T>` catch assignments through that type, and recursive utility types can describe deeper readonly shapes. They are compile-time checks, not runtime freezing. Runtime discipline, ownership, and immutable update functions remain necessary.

## 6. The Traps — What Goes Wrong

**Trap 1: “`const` makes the object immutable.”** `const user = {...}` prevents rebinding `user`; it does not prevent `user.role = "admin"`. Use immutable updates, `readonly` types, or a deliberate runtime freeze when appropriate.

**Trap 2: “A shallow copy copied the whole tree.”** `{ ...state }` creates a new root but shares nested references. `next.details.active = false` still mutates `previous.details`. Copy each object or array on the path being changed.

**Trap 3: Mutating an array before setting it.** `items.sort()`, `items.splice()`, or `items.push()` changes the existing state array. Use `setItems((previous) => [...previous, item])`, `filter`, `map`, or a copy before sorting.

**Trap 4: Mutating props in a child.** Props are inputs owned by another component. A child must call an owner-provided callback instead of assigning into `user`, `config`, or an array received through props.

**Trap 5: Using an index key after changing an array.** If a list is filtered or reordered, index keys can preserve the wrong child's local state. Stable keys and immutable item updates solve different identity problems.

**Trap 6: Believing an effect fixes a state mutation.** An effect that runs after an unrelated render may hide the original bug. Update state immutably where the event occurs; keep effects for external synchronization and make their dependencies and cleanup honest.

**Trap 7: Assuming Strict Mode means production renders twice.** Development-only extra calls are a purity test. Do not add flags to suppress them or depend on mutation surviving between render attempts.

**Trap 8: Overusing deep clones.** `structuredClone` and JSON serialization duplicate every branch, can lose types or values, and destroy useful reference stability. Prefer structural sharing; normalize state or use a reducer when the shape is difficult to update.

## 7. Compare With Related Concepts

| Concept A | Concept B | Key difference | Rule of thumb |
| --- | --- | --- | --- |
| Immutability | `const` | Immutability describes data updates; `const` protects only a variable binding. | Treat state data as read-only even when its variable is `const`. |
| Structural sharing | Deep cloning | Structural sharing copies the changed path and reuses untouched branches; deep cloning copies everything. | Create only the identities that changed. |
| Manual spread | Immer | Spread is dependency-free and clear for shallow updates; Immer uses draft proxies for complex recipes. | Use the simplest approach that keeps the immutable boundary obvious. |
| Referential equality | Deep equality | `Object.is` compares identity in constant time; deep equality traverses values. | Make identity meaningful instead of asking React to inspect the whole tree. |
| State setter | `useRef` | State updates schedule a render; changing `ref.current` does not. | Use state for displayed data and refs for mutable values that do not drive UI. |
| Event update | Effect update | An event is caused by a user/system action; an effect synchronizes after commit with an external system. | Prefer the event handler for the state transition; reserve effects for external synchronization. |
| State ownership | Context | Ownership says where a value is changed; context says how a distant consumer receives it. | Keep the updater with the owner, and stabilize context values when appropriate. |
| Stable key | Object reference | A key identifies a component instance in a list; an object reference identifies a JavaScript value. | Use stable data IDs for keys and immutable references for data change detection. |

## 8. 🧠 The Memory Hook — What Sticks

**React checks the identity of the sheet, not every word on the sheet.** Keep each render's sheet frozen, make a new sheet along the changed path, reuse untouched branches, and let the owner perform the update. Functional updaters handle the latest sheet; stable keys identify the right row; effects speak only to the outside world.

**Interview sentence:** “I never mutate React state in place: I use a functional immutable update, create new references along the changed path, preserve structural sharing elsewhere, and keep ownership, keys, and effects aligned with their separate jobs.”
