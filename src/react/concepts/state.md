# State in React

## 1. Why This Exists — The Problem First

In vanilla JavaScript, persisting data is straightforward: you declare a variable like `let count = 0`. When a user clicks a button, you increment `count++` and manually update the DOM with `document.getElementById('counter').innerText = count`.

Modern component-based frameworks turn this upside down. In React, components are functions that run from top to bottom every single time the screen needs an update. If you declare a standard local variable inside a function component, that variable is re-created and re-initialized on every single render. The moment the function finishes executing, JavaScript garbage collection destroys the execution context, and your updated value vanishes into thin air.

Even if you try to work around this by moving the variable outside the component to module scope, you hit a worse wall: modifying a plain JavaScript variable sends zero signals to React. React has no idea the data changed, no render is scheduled, and the user continues looking at stale DOM nodes. If you then try to manually touch the DOM to force an update, you create a split-brain application where React's virtual representation and the real browser DOM disagree, leading to rendering glitches, lost event listeners, and race conditions.

React created State to solve both problems at once:
1. It gives function components a private, persistent memory that survives across renders without leaking into global scope.
2. It provides a formal dispatch mechanism that notifies React's scheduler to re-evaluate the component tree and synchronize the visual UI.

## 2. The Analogy — Make It Obvious

Think of a component function as an actor who has total amnesia between takes on a movie set. Every time the director yells "Action!" (a render), the actor walks on stage with no memory of what happened five minutes ago. If the actor scribbles notes on their arm during the scene, the makeup crew washes it completely clean before the next take.

To maintain continuity across scenes, the stage manager (React) keeps a secure locker backstage (the Fiber node). Inside this locker is an indexed tray of cards (the `memoizedState` hook list).

When Take 1 begins:
- The actor walks out and asks the stage manager: *"Give me item #1 from my locker. If it is empty, initialize it with 0."*
- The stage manager hands the actor a physical photograph stamped `count = 0`.
- During the scene, a user clicks a button. The actor drops a request slip into the stage manager's drop-box: *"For the next take, please increment item #1 to 1."*
- Crucially, during Take 1, the actor's current photograph still reads `0`. The actor cannot scratch out the number on the photograph they are holding. That frame is already filmed.

When the director calls "Cut!" and starts Take 2:
- The actor walks out, completely fresh, and asks for item #1 again.
- The stage manager checks the locker, processes the request slip, updates the ledger to `1`, and hands the actor a brand-new photograph stamped `count = 1`.

Each render is a distinct, immutable photograph. The actor never mutates the past; the stage manager simply prepares a new reality for the next take.

## 3. How It Actually Works — The Full Explanation

Functional components do not hold state on an instance property like `this.state`. They are plain JavaScript functions. React stores and manages state externally in the Fiber architecture.

**The Fiber Node and the `memoizedState` Linked List**

When React mounts a component, it creates an internal data structure called a `FiberNode`. On this Fiber node lives a property named `memoizedState`. For function components, `memoizedState` is a singly-linked list of hook objects.

Each time you call `useState` (or `useReducer`), React inspects the current hook pointer in that linked list:
- On initial mount, React creates a new hook record containing `{ memoizedState: initialValue, queue: null, next: null }` and appends it to the list.
- On subsequent renders, React walks the existing linked list in the exact order the hooks are called, reading the preserved `memoizedState` from the previous render.

Because React identifies which state belongs to which variable strictly by the order of hook execution, hooks must never be called inside conditional statements, loops, or nested functions. If a condition changes the call order, the hook pointer reads from the wrong node in the linked list, corrupting the component's state.

**State Snapshots and Closure Isolation**

When a component renders, React calls the function. During that specific execution, `const [count, setCount] = useState(0)` assigns a `const` variable `count` to the scalar value returned for that render.

`count` is not an observable proxy, a live pointer, or a two-way bound getter. It is a constant primitive or reference frozen in time for that particular render pass. Any event handler, timeout, or asynchronous callback created during that render captures that exact snapshot value within its lexical closure.

Calling `setCount(count + 1)` does not alter the `count` variable in the currently running function execution. Instead, it creates an update action, attaches it to the hook's update queue on the Fiber, and requests React to schedule a re-render.

**Asynchronous Scheduling and Automatic Batching (React 18)**

State setters do not trigger synchronous re-renders. When `setState` is called, React puts the update into a queue. React delays running the render pass so it can collect multiple state updates from the same event loop task and process them together in a single pass. This prevents thrashing the DOM with intermediate paints.

In React 18, **Automatic Batching** is enabled by default via `createRoot`. React batches state updates regardless of where they originate:
- Inside synthetic React event handlers (like `onClick`)
- Inside native DOM event listeners
- Inside `setTimeout` or `setInterval` callbacks
- Inside `Promise.then` or `async/await` microtask continuations

React coalesces all state updates queued within the same microtask tick, calculates the final state tree, and executes a single reconciliation and commit cycle.

**The Functional Updater Pattern**

Because state is a snapshot, reading the state variable immediately after queueing an update will only return the old value. If you need to schedule multiple updates back-to-back within the same tick, or if an asynchronous callback needs to update state based on whatever the latest state will be rather than the closed-over snapshot, you pass an updater function: `setCount(prev => prev + 1)`.

When you pass a function to the setter, React does not evaluate the calculation immediately. It pushes the updater function into the hook's `queue`. When React processes the render phase, it iterates through the queue in order, feeding the output of the first updater function as the `prev` input to the next updater function:
`initial (0) -> updater(0) => 1 -> updater(1) => 2 -> final state (2)`.

**Immutability and `Object.is` Change Detection**

React uses shallow equality comparison via `Object.is` to decide whether a state update warrants a re-render.

When you invoke a state setter with a new value:
1. React compares `Object.is(currentState, newState)`.
2. If `Object.is` evaluates to `true` (meaning the primitive value is identical or the object memory address is unchanged), React bails out early. It will not re-render the component or its children.
3. If you mutate an object or array in place (such as `user.name = "Alice"` or `items.push(newItem)`) and pass the same reference to `setState(user)` or `setState(items)`, `Object.is` sees the exact same memory pointer and skips rendering.

Immutability ensures that every logical change produces a new object reference in memory. This allows React to perform instantaneous, $O(1)$ shallow checks instead of deeply traversing complex data structures to detect changes.

## 4. Real Code — See It Working

Here are the essential patterns for working with state correctly in production.

**Snapshot Closures vs. Functional Updaters**

This example demonstrates how state behaves as a snapshot and how the functional updater form ensures sequential updates succeed.

```tsx
import React, { useState } from 'react';

export function CounterBatchDemo() {
  const [count, setCount] = useState(0);

  const handleDirectUpdate = () => {
    // Both calls close over the exact same 'count' value (e.g. 0).
    // React receives: "set count to 0 + 1", then "set count to 0 + 1".
    // After re-render, count will be 1, NOT 2.
    setCount(count + 1);
    setCount(count + 1);
  };

  const handleFunctionalUpdate = () => {
    // Updaters are queued on the Fiber and evaluated sequentially during render.
    // React passes the result of the first function (0 => 1) as input to the second (1 => 2).
    setCount((prev) => prev + 1);
    setCount((prev) => prev + 1);
  };

  const handleAsyncAlert = () => {
    // Captures 'count' as it exists at the exact instant the button was clicked.
    setTimeout(() => {
      alert(`Count captured when clicked: ${count}`);
    }, 3000);
  };

  return (
    <div>
      <p>Current Count: {count}</p>
      <button onClick={handleDirectUpdate}>+1 Twice (Broken: increments by 1)</button>
      <button onClick={handleFunctionalUpdate}>+1 Twice (Correct: increments by 2)</button>
      <button onClick={handleAsyncAlert}>Alert Count in 3s (Inspect Snapshot)</button>
    </div>
  );
}
```

**Immutable Object and Array Updates**

State holding objects or arrays must be updated by creating new references using spread syntax, `map`, or `filter`.

```tsx
import React, { useState } from 'react';

interface Task {
  id: number;
  title: string;
  completed: boolean;
}

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, title: 'Write unit tests', completed: false },
    { id: 2, title: 'Review pull request', completed: false },
  ]);

  const addTask = (title: string) => {
    const newTask: Task = { id: Date.now(), title, completed: false };
    // Create a new array reference containing all previous items plus the new item.
    setTasks((prevTasks) => [...prevTasks, newTask]);
  };

  const toggleTask = (id: number) => {
    // Map returns a brand-new array. When matching id is found, return a new object reference.
    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const removeTask = (id: number) => {
    // Filter creates a new array without mutating the original.
    setTasks((prevTasks) => prevTasks.filter((task) => task.id !== id));
  };

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>
          <span style={{ textDecoration: task.completed ? 'line-through' : 'none' }}>
            {task.title}
          </span>
          <button onClick={() => toggleTask(task.id)}>Toggle</button>
          <button onClick={() => removeTask(task.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

**Calculating Derived State On-the-Fly**

Avoid mirroring props or storing redundant computations in state. Calculate them directly during the render pass.

```tsx
import React, { useState } from 'react';

interface Item {
  id: string;
  name: string;
  price: number;
}

export function ShoppingCart({ items }: { items: Item[] }) {
  const [discountCode, setDiscountCode] = useState('');

  // Derived state: computed synchronously during render from props and state.
  // No need for a separate 'totalPrice' state or a useEffect to keep it in sync.
  const rawTotal = items.reduce((sum, item) => sum + item.price, 0);
  const discountMultiplier = discountCode === 'SAVE10' ? 0.9 : 1.0;
  const finalTotal = rawTotal * discountMultiplier;

  return (
    <div>
      <input
        placeholder="Discount code"
        value={discountCode}
        onChange={(e) => setDiscountCode(e.target.value)}
      />
      <p>Raw Total: ${rawTotal.toFixed(2)}</p>
      <p>Final Total: ${finalTotal.toFixed(2)}</p>
    </div>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is state in React, and how does React remember state between function calls?**

State is component-owned data that changes over time and triggers UI re-renders when updated. Because function components are re-invoked on every render, local function variables are re-created each time. 

React preserves state by storing it outside the function instance on an internal data structure called the Fiber node. On each component's Fiber node, React maintains a singly-linked list of hook records under `fiber.memoizedState`. When `useState` executes, React reads the current hook record from that linked list based on the order of invocation. When a setter is called, React records the update on that hook's update queue and schedules a re-render. During the subsequent render pass, React walks the linked list in the exact same sequence and returns the newly computed state value.

**Q: How does React's state snapshot model work, and why doesn't `setState` update the variable immediately?**

When React renders a component, it calls the component function, which evaluates with a specific set of props and state values. The state variable returned by `useState` is a plain `const` value frozen for that specific render pass.

When you call `setState(newValue)`, React does not mutate the variable in your current function scope. Instead, it registers an update on the Fiber and schedules a future render. Any code running inside the current event handler or function scope continues to see the snapshot value captured at the start of that render. The updated value only becomes active when React re-executes the component function in the next render cycle.

**Q: Why does React require state to be treated as immutable? What happens under the hood if you mutate state directly?**

React uses shallow reference equality (`Object.is`) to determine if state has changed before performing reconciliation. If you mutate an object or array directly (e.g., `state.todos.push(newTodo)`), the memory reference pointing to `state.todos` remains identical.

When you pass that mutated object back into `setState(state)`, `Object.is(prevState, nextState)` evaluates to `true`. React assumes nothing changed and bails out of rendering, resulting in missed updates. Treating state immutably by generating fresh object and array references (using spread syntax, `map`, `filter`, etc.) guarantees distinct memory pointers, allowing React to perform an instant $O(1)$ reference check to reliably trigger reconciliation, enable time-travel debugging, and prevent accidental side effects across render closures.

**Q: What is automatic batching in React 18, and how did it change from React 17?**

Batching is the process where React groups multiple state update calls into a single re-render pass to prevent unnecessary visual repaints and improve performance.

In React 17 and earlier, React only batched updates made inside React's synthetic event handlers (like `onClick` or `onChange`). Updates triggered inside native DOM event handlers, `setTimeout`, `setInterval`, or `Promise` chains were not batched; each state setter call triggered an immediate, synchronous re-render.

In React 18 with `createRoot`, React applies **Automatic Batching** everywhere. Whether state updates are called inside a React click handler, a `fetch` promise resolution, a `setTimeout`, or a native event listener, React coalesces all state updates queued within that event loop task into a single render cycle. If a developer strictly requires synchronous DOM flushing before the batch completes, they can opt out using `ReactDOM.flushSync()`.

**Q: When should you use the functional updater form `setState(prev => prev + 1)` instead of `setState(value)`?**

You should use the functional updater form whenever the next state depends directly on the previous state, especially in two scenarios:
1. **Multiple updates in the same tick:** If an event handler or function triggers multiple state updates in succession (e.g., calling `setCount` three times), passing raw values `setCount(count + 1)` causes each call to close over the same stale snapshot. Using `setCount(c => c + 1)` queues pure transformation functions that React evaluates sequentially against the rolling accumulator.
2. **Asynchronous closures:** When state updates occur inside `setTimeout`, `setInterval`, or long-running `async` operations where the outer closure's state variable is stale, passing an updater function ensures the update is calculated against the fresh value present in the Fiber queue at the moment of application.

**Q: What is derived state, and why is copying props or existing state into a new state variable considered an anti-pattern?**

Derived state is any value that can be computed synchronously during render using existing props or state (for example, computing `fullName` from `firstName` and `lastName`, or computing `itemCount` from `items.length`).

Storing derived values in separate `useState` variables creates duplicated state and multiple sources of truth. When the parent prop or primary state changes, the duplicated state variable retains its old value until an explicit synchronization step (such as an effect) runs. This leads to out-of-sync UI bugs, race conditions, and redundant render passes. Derived values should simply be calculated as plain variables inside the component body during render. If the computation is CPU-intensive, it can be memoized using `useMemo`.

**Q: Where should state live, and what is the difference between state colocation and lifting state up?**

State should live as close as possible to where it is consumed—a principle known as **state colocation**. If only a single child component needs a piece of state, holding that state locally ensures that only that subtree re-renders when the value changes.

When two or more sibling components need access to the same state (or when a parent needs to coordinate children based on that state), you **lift state up** to their lowest common ancestor. The ancestor component owns the state and passes the value down as props along with callback handlers that allow children to request updates. Placing state higher than necessary causes unnecessary re-render cascades across unaffected sibling branches, while placing it too low makes sharing impossible.

## 6. The Traps — What Goes Wrong

**Trap 1: Reading state immediately after calling its setter**

- **The Wrong Assumption:** Developers often assume `setState(x)` behaves like a synchronous assignment `this.x = x`, expecting the variable to hold the new value on the very next line.
- **Why It's Wrong:** `setState` only requests a future re-render and enqueues an update action. The current function execution retains its original snapshot value.
- **What Actually Happens:** Logging or reading the state variable immediately after calling the setter outputs the old value.
- **The Fix:** If you need the new value immediately in that same function, store it in a local variable first, then pass that variable to both the setter and any subsequent logic:

```tsx
const handleSave = () => {
  const nextCount = count + 1;
  setCount(nextCount);
  sendAnalyticsReport(nextCount); // Use the local variable, not stale 'count'
};
```

**Trap 2: In-place mutation of objects or arrays**

- **The Wrong Assumption:** Developers believe modifying an array via `arr.push(item)` or an object via `obj.name = 'Bob'` and then passing that variable to `setArr(arr)` or `setObj(obj)` will trigger an update.
- **Why It's Wrong:** React compares previous and next state using `Object.is`. Because the object reference in memory has not changed, `Object.is(prev, next)` returns `true`.
- **What Actually Happens:** React bails out of rendering. The UI remains unchanged until some unrelated state update forces a render elsewhere, causing unpredictable and laggy UI behavior.
- **The Fix:** Always return new references using spread operators or immutable methods:

```tsx
// WRONG:
user.age = 30;
setUser(user);

// CORRECT:
setUser((prevUser) => ({ ...prevUser, age: 30 }));
```

**Trap 3: Mirroring props in state without a reset strategy**

- **The Wrong Assumption:** Writing `const [email, setEmail] = useState(props.initialEmail)` will keep `email` updated whenever `props.initialEmail` changes.
- **Why It's Wrong:** The initial value passed to `useState(initialValue)` is only evaluated on the very first mount of the component. Subsequent re-renders with new props completely ignore the argument passed to `useState`.
- **What Actually Happens:** If a parent component switches to a new user profile, the child component continues showing the previous user's email address.
- **The Fix:** If the state is entirely derived, calculate it directly during render. If it is genuinely editable local state that needs to reset when the identity changes, tell React to re-mount the component cleanly by passing a dynamic `key`:

```tsx
// In parent component:
<UserProfileEditor key={user.id} initialEmail={user.email} />
```

**Trap 4: Stale closures in asynchronous timers and event listeners**

- **The Wrong Assumption:** A `setInterval` or `setTimeout` callback that references a state variable `count` will always access the latest value as time moves forward.
- **Why It's Wrong:** The callback closes over the lexical scope of the render pass in which it was instantiated. If the interval is not re-created or does not use a functional updater, it is forever locked to the snapshot value from that single initial render.
- **What Actually Happens:** An interval running `setCount(count + 1)` repeatedly sets count to `0 + 1 = 1` on every tick, freezing the counter at `1`.
- **The Fix:** Use the functional updater form so the timer receives the freshest value from the Fiber queue on each iteration:

```tsx
useEffect(() => {
  const interval = setInterval(() => {
    // Functional updater accesses the latest accumulator regardless of closure age
    setCount((prevCount) => prevCount + 1);
  }, 1000);
  return () => clearInterval(interval);
}, []); // Empty dependency array is safe when using functional updaters
```

## 7. Compare With Related Concepts

**State vs. Props**
- **The Difference:** State is private, internal memory managed and updated by the component itself. Props are external configuration inputs passed down from a parent component that are read-only to the recipient.
- **When to Use Which:** Use **State** when data needs to change as a result of user interactions within the component. Use **Props** when a parent needs to configure, pass data into, or control the behavior of a child.

**State vs. Refs (`useRef`)**
- **The Difference:** Updating state triggers a component re-render and UI update. Mutating `ref.current` modifies a persistent container object synchronously without notifying React and without triggering a re-render.
- **When to Use Which:** Use **State** for any data that affects the rendered visual output. Use **Refs** for data that needs to persist across renders but should not trigger visual updates (such as timer IDs, previous values, or direct DOM node references).

**State vs. Derived Values (Local Render Variables)**
- **The Difference:** State stores raw, foundational data persistently across renders in the Fiber tree. Derived values are temporary variables calculated on the fly during a single execution of the render function.
- **When to Use Which:** Use **State** for the minimal set of raw, changing values. Use **Derived Values** for anything that can be computed from existing state or props (such as filtered lists, totals, or formatted strings).

**State vs. Module-Level Global Variables**
- **The Difference:** State is strictly scoped to an individual component instance on the Fiber tree and automatically participates in React's render lifecycle. Module-level variables are shared globally across all mounted instances of that component and across server requests in SSR, and mutating them never alerts React to re-render.
- **When to Use Which:** Use **State** for all instance-specific component data. Use **Module-Level Variables** only for truly static, immutable constants that never change during the application's runtime.

## 8. 🧠 The Memory Hook

State is not a live variable; it is an entry in React's backstage Fiber ledger. Every render is a frozen photograph of that ledger at one moment in time, and calling `setState` never alters today's photograph—it orders tomorrow's print.

