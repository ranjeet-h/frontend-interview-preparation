# State in React

## 1. Why This Exists — The Problem First

Imagine a counter component whose button appears to work, but the number on screen never changes. A local variable such as `let count = 0` is recreated every time the component function runs, so an increment disappears on the next render. Moving the variable to module scope keeps the value alive, but now every mounted copy shares it, and changing it still gives React no signal that the UI needs to be rendered again.

React state solves both failures together. It gives one component instance persistent memory, and its setter queues an update that tells React to render again. That distinction matters in real code: state is not a normal mutable variable, and a setter is not a synchronous assignment.

## 2. The Analogy — Make It Obvious

Think of a component function as an actor returning to a stage for a series of takes. At the start of every take, the actor has a fresh local script. Anything written only on that script disappears when the take ends. That is a render: React calls the function again, and the function gets new local bindings.

React is the stage manager. For each mounted component instance, it keeps a private locker backstage. A `useState` call is a numbered drawer in that locker. On the first take, drawer 1 is filled with `0`; on later takes, React opens drawer 1 and gives the function the value currently stored there.

The value handed to the actor is a photograph of that take, not a live whiteboard. A click can give the stage manager a request slip—`setCount(count + 1)`—but it cannot rewrite the photograph already in the actor's hands. React processes the slip and calls the function for a later take, where the actor receives a new photograph.

The numbered drawers explain the Rules of Hooks: React knows which state belongs to which `useState` call by call order. The request slips explain update queues and functional updaters. The separate locker explains why state belongs to a mounted component instance rather than to a module-global variable.

## 3. How It Actually Works — The Full Explanation

When React renders a function component, it executes the function from top to bottom. Local variables exist only for that execution. React stores hook state outside the function, on the internal Fiber data for that component instance. A useful mental model is a linked list of hook records; each record stores the current value and an update queue. The exact internal fields are implementation details, but the important contract is stable: the hook's position is matched by call order.

On mount, the first `useState` call creates the first hook record and returns its initial value. The second call creates the second record. On an update, React walks those records in the same order and returns their latest values. That is why hooks must be called at the top level, never conditionally, in a loop, or inside a nested function. If the order changes, React can no longer match a call with the right stored record.

**State is a render snapshot.** Suppose a render returns `count = 0`. Every handler created by that render closes over `0`. `setCount(1)` queues an update; it does not mutate the `count` binding in the already-running handler. Code after the setter in that same handler still reads `0`. After React renders again, handlers created by the new render close over the new value.

**A setter schedules work.** Calling a setter creates an update action and marks the relevant work for React's scheduler. React may batch several actions before rendering, and concurrent rendering means an update should be treated as a request rather than as an immediate DOM command. The component must remain safe to call more than once and must not depend on render-time side effects.

**Strict Mode is a development-time purity check.** When a subtree is wrapped in `<StrictMode>`, React may call a component's render logic more than once and may call queued updater functions more than once while checking the result. These extra calls are not extra user actions and are not a promise that production renders exactly once; they are a probe for code that mutates data, performs I/O, increments counters, or otherwise causes effects while React is calculating the next UI. Render functions and state updaters must therefore be pure: given the same inputs, they return the same result and do not change anything outside their calculation. Put external work in an event handler or an Effect with correct cleanup.

**Direct values and updater functions are different actions.** `setCount(count + 1)` calculates `count + 1` using the current render's snapshot, then queues that value. Two such calls from the same handler usually queue the same value. `setCount(previous => previous + 1)` queues a transformation. During the next render, React applies updater functions in order, passing each result to the next one. Starting at `0`, two increment updaters produce `1`, then `2`.

**React 18 batching.** With a React 18 `createRoot`, React batches updates from React event handlers and updates that happen in common asynchronous callbacks such as timers, promise continuations, and native event handlers. Batching reduces intermediate renders; it does not change the snapshot seen by the current callback. `flushSync` is an escape hatch for a narrow case where code must force a DOM update before continuing, not a default state-management technique.

**Identity and immutability.** State updates are compared with `Object.is` semantics. If the next value is the same primitive or the same object reference, React can skip work because no new state identity was supplied. Mutating an array or object in place and passing its original reference back is therefore unsafe: the data changed behind React's back, but the reference did not tell React that it changed. Create a new array or object for every changed level instead.

**State should be minimal.** Store the changing facts that cannot be reconstructed. Calculate values such as totals, filtered lists, and formatted labels during render. Duplicating a value in state creates two sources of truth and usually requires synchronization code that can briefly show stale UI. For an expensive pure calculation, `useMemo` may cache the calculation; it does not turn derived data into independent state.

**Ownership determines placement.** Keep state in the smallest component that owns and uses it. If siblings must coordinate, move it to their lowest common parent and pass the value and event callbacks down; this is lifting state up. A value needed across distant branches may belong in context or an external store, but broad reach is not automatically a reason to make every value global.

## 4. Real Code — See It Working

The following are contextual TSX components. Each is self-contained at the component level and can be dropped into a React + TypeScript application rendered by that application's root.

**Snapshot closures and functional updaters**

```tsx
import { useState } from 'react';

export function CounterBatchDemo() {
  const [count, setCount] = useState(0);

  const handleDirectUpdate = () => {
    // Both expressions read the same snapshot from this render.
    setCount(count + 1);
    setCount(count + 1);
  };

  const handleFunctionalUpdate = () => {
    // Each updater receives the result produced by the previous updater.
    setCount((previous) => previous + 1);
    setCount((previous) => previous + 1);
  };

  const handleAsyncAlert = () => {
    // This callback intentionally demonstrates the clicked render's snapshot.
    window.setTimeout(() => {
      window.alert(`Count captured when clicked: ${count}`);
    }, 3000);
  };

  return (
    <div>
      <p>Current count: {count}</p>
      <button onClick={handleDirectUpdate}>Direct +1 twice</button>
      <button onClick={handleFunctionalUpdate}>Functional +1 twice</button>
      <button onClick={handleAsyncAlert}>Alert this snapshot in 3s</button>
    </div>
  );
}
```

After clicking the direct button once, the count increases from `0` to `1`, because both queued values were `1`. After clicking the functional button once from `1`, it becomes `3`, because the queued transformations are applied as `1 -> 2 -> 3`.

**Immutable object and array updates**

```tsx
import { useState } from 'react';

type Task = {
  id: number;
  title: string;
  completed: boolean;
};

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, title: 'Write unit tests', completed: false },
    { id: 2, title: 'Review pull request', completed: false },
  ]);

  const addTask = (title: string) => {
    const task: Task = { id: Date.now(), title, completed: false };
    // A new array identity tells React that the collection changed.
    setTasks((previous) => [...previous, task]);
  };

  const toggleTask = (id: number) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === id
          ? { ...task, completed: !task.completed }
          : task,
      ),
    );
  };

  const removeTask = (id: number) => {
    setTasks((previous) => previous.filter((task) => task.id !== id));
  };

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>
          <span>{task.completed ? '✓ ' : ''}{task.title}</span>
          <button onClick={() => toggleTask(task.id)}>Toggle</button>
          <button onClick={() => removeTask(task.id)}>Delete</button>
        </li>
      ))}
      <button onClick={() => addTask('New task')}>Add task</button>
    </ul>
  );
}
```

`map`, `filter`, and spread syntax create new identities. The unchanged task objects can be reused safely; only the task being toggled needs a new object. The important rule is not “copy every byte,” but “do not mutate the state object or any changed nested object in place.”

**Derived values belong in render**

```tsx
import { useState } from 'react';

type Item = { id: string; name: string; price: number };

export function ShoppingCart({ items }: { items: Item[] }) {
  const [discountCode, setDiscountCode] = useState('');
  const rawTotal = items.reduce((sum, item) => sum + item.price, 0);
  const finalTotal = rawTotal * (discountCode === 'SAVE10' ? 0.9 : 1);

  return (
    <div>
      <input
        value={discountCode}
        placeholder="Discount code"
        onChange={(event) => setDiscountCode(event.target.value)}
      />
      <p>Raw total: ${rawTotal.toFixed(2)}</p>
      <p>Final total: ${finalTotal.toFixed(2)}</p>
    </div>
  );
}
```

There is one source of truth for the editable fact, `discountCode`. The totals are always calculated from the current props and state in the same render, so there is no second render in which a copied `finalTotal` catches up.

**Effects synchronize with external systems**

An Effect is for making a committed React render agree with something React does not own: a browser subscription, timer, network connection, media element, or third-party widget. Its setup runs after commit, and its cleanup must undo the resource created by that setup before the dependencies change or the component unmounts. In development Strict Mode, React can test this contract with setup → cleanup → setup, so cleanup should remove the exact listener, cancel the exact timer, or disconnect the exact resource that setup created.

```tsx
import { useEffect, useState } from 'react';

// Runnable inside any React + TypeScript app rendered in a browser.
export function WindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <p>Window width: {width}px</p>;
}
```

The resize listener is an external resource: setup subscribes, and cleanup unsubscribes. By contrast, filtering `items`, formatting a label, or calculating a total is not synchronization. Derive those values during render (or memoize an expensive pure calculation); putting them in an Effect and copying them into state adds an avoidable render, creates a stale-value window, and introduces a synchronization path for data that already has a source of truth.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is state in React, and how does React remember it between function calls?**

State is persistent, component-instance-owned data that participates in rendering. A function component itself has no durable local variables between calls. React stores hook records on the component's internal Fiber data, matches each `useState` call by its stable call order, and processes setter actions from the hook's update queue before a later render.

**Q: Why does calling a setter not change the state variable on the next line?**

The variable belongs to the current render snapshot. A setter queues an update and requests another render; it does not rewrite the lexical binding in the handler that is already running. If the handler needs a value immediately, calculate it in a local variable and use that value for both the setter and the immediate work.

**Q: Why are functional updaters needed?**

Use an updater when the next value depends on the previous value, especially when several updates can be queued together or when the callback may hold an old snapshot. The updater is a function that React applies to the latest accumulated state, so `setCount(previous => previous + 1)` composes correctly with another updater.

**Q: What does automatic batching do?**

Batching groups multiple queued updates into fewer render and commit cycles. In React 18 roots, batching covers React events and common asynchronous sources as well as timers and promise continuations. It improves scheduling efficiency but does not make state reads inside the current callback become live or immediate.

**Q: Why must state be treated immutably?**

React needs a changed identity to cheaply detect changed state. If `items.push(newItem)` mutates the existing array and `setItems(items)` passes that same array, the old and new references are identical. Returning a new array and new objects for changed nested values makes the update visible and avoids mutating data that an earlier render may still be reading.

**Q: What is derived state, and why is mirroring props in state risky?**

Derived data can be calculated from existing props and state during render, such as `items.length` or a cart total. Copying it into another state variable creates duplicate truth and a synchronization gap. `useState(initialValue)` uses its initial value on mount; a later prop change does not re-run that initialization. Store a value separately only when it is genuinely independent and has its own update rules.

**Q: Where should state live?**

Start with the narrowest owner that needs the state. If two siblings need the same value, lift it to their lowest common ancestor and pass data down with callbacks. Move it farther upward, into context, or into an external store only when the sharing boundary justifies the extra dependency and update fan-out.

**Q: What happens if a hook is called conditionally?**

React's hook matching depends on order, not on variable names. If one render skips a conditional hook, later calls shift positions and can read another hook's record. Keep hooks at the top level and put the condition inside the handler or inside the hook's logic, not around the hook call.

## 6. The Traps — What Goes Wrong

**Trap: reading state immediately after setting it.** The wrong assumption is that `setCount(next)` behaves like `count = next`. The current handler still owns the old snapshot, so logging `count` on the next line prints the old value. Calculate `const nextCount = count + 1`, pass it to `setCount(nextCount)`, and use `nextCount` for an immediate analytics call.

**Trap: using direct values for repeated updates.** `setCount(count + 1)` twice reads the same `count` twice and normally produces one increment. When the update is “based on whatever the latest count is,” use two functional updaters instead.

**Trap: mutating an array or object in place.** `user.age = 30; setUser(user)` leaves the reference unchanged. React may bail out, and even if another update later causes a render, older render code may have observed data that was mutated underneath it. Return `{ ...previousUser, age: 30 }` or the equivalent new array/object structure.

**Trap: assuming the `useState` initializer tracks props.** `useState(props.initialEmail)` does not reset `email` whenever `props.initialEmail` changes. If the value is only a projection, derive it. If it is editable state that should start over when the identity changes, render the editor with a key such as `<UserProfileEditor key={user.id} initialEmail={user.email} />`; the changed key gives that component a new identity and fresh initialization.

**Trap: expecting an old asynchronous callback to see new state.** A timer or event callback closes over the render that created it. It will keep reading that snapshot. If the callback needs to update state relative to the latest value, use a functional updater. If it needs to read the latest value for some other purpose, design an explicit synchronization boundary rather than assuming a closure is live.

**Trap: storing every calculation in state.** A `filteredItems` state variable synchronized from `items` and `query` can show stale results and costs an extra update path. Calculate `items.filter(...)` during render, and consider `useMemo` only when measurement shows the pure calculation is expensive.

**Trap: treating batching as a correctness guarantee for side effects.** Batching changes when React renders; it does not guarantee a particular number of renders in every environment, nor does it make an external system transactionally consistent. Keep user-event work in the event handler and make external synchronization explicit at the boundary where it belongs.

## 7. Compare With Related Concepts

| Comparison | Key difference | Rule of thumb |
|---|---|---|
| State vs. props | State is owned and updated by a component instance; props are inputs supplied by its parent. | Use state for changing local facts; use props for parent-controlled configuration or data flow. |
| State vs. `useRef` | State updates schedule rendering; changing `ref.current` persists a value without scheduling a render. | Use state when the value affects the screen; use a ref for an imperative handle or persistent value that should not paint. |
| State vs. derived value | State is stored across renders; a derived value is recalculated from current inputs. | Store the minimal facts; derive everything that can be computed reliably from them. |
| State vs. module variable | State is scoped to one mounted instance and tied to React's lifecycle; a module variable is shared by imports and does not notify React. | Use module scope for constants or deliberately shared infrastructure, not per-instance UI data. |
| State vs. context | State is a storage/update mechanism; context is a delivery mechanism for a value to descendants. | Keep ownership local, then use context when passing the value through many layers is the real problem. |

## 8. 🧠 The Memory Hook — What Sticks

Every render is a photograph, and every state setter is a request to print the next photograph. The handler cannot edit today's image; React's private numbered ledger applies the request, then hands the component a new image on the next render.
