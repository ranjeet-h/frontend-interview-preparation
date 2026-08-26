# Functional State Updates

## 1. Why This Exists — The Problem First

You click “add” three times in one handler and expect a counter to move from 0 to 3. Instead it moves to 1. Or a timer keeps appending to an old array and silently loses items. The code looks reasonable because each setter says “use the current value,” but `current` is the value captured by the render that created the handler, not a live variable that changes after every setter call.

This is the gap functional state updates close: when the next state depends on the previous state, let React supply the previous state at the point where React processes the update. That matters for repeated updates, batched work, delayed callbacks, and any state transition where using a render snapshot could overwrite someone else’s update.

## 2. The Analogy — Make It Obvious

Imagine a bank with a queue of deposits. Each deposit instruction can either say “set the balance to ₹110” or “add ₹10 to whatever balance is on the ledger when you process me.” The first instruction contains a fixed answer. If three people independently write “set it to ₹110” while the opening balance is ₹100, the bank still ends at ₹110. The second kind of instruction is relative: the first adds to ₹100, the next adds to that new balance, and the third adds to the result again.

React’s state setter is the bank’s intake desk. A direct value such as `setBalance(110)` is a replacement instruction. A function such as `setBalance((balance) => balance + 10)` is an updater instruction. React puts those instructions in the state update queue and processes them in order during the next render. Each updater receives the result produced by the previous update, so it does not need to trust an old render’s snapshot.

## 3. How It Actually Works — The Full Explanation

React renders a component with a particular state snapshot. Every event handler, timer callback, and callback prop created during that render closes over that snapshot. Calling a setter does not mutate the `count` variable inside the already-running handler. It asks React to schedule a state update.

The setter accepts either a next value or an updater function:

```tsx
setCount(10);                    // replacement: next state is 10
setCount((previous) => previous + 1); // updater: derive next state from previous
```

For a boolean state value, the same pattern is an explicit toggle. This is a
fragment from a component that has already declared `const [open, setOpen] =
useState(false)`:

```tsx
setOpen((previous) => !previous);
```

For a `useState` hook, React stores the action in that hook’s pending update queue. When React renders the component again, it starts with the hook’s current state and reduces the queued actions in order. A function action is called with the state produced so far; a non-function action replaces that state.

```text
starting state: 0
setCount(count + 1)      -> replacement action: 1
setCount(count + 1)      -> replacement action: 1
result: 1

starting state: 0
setCount(previous => previous + 1) -> 1
setCount(previous => previous + 1) -> 2
result: 2

starting state: 0
setCount(5)                         -> replacement action: 5
setCount(previous => previous + 1) -> 6
result: 6

starting state: 0
setCount(previous => previous + 1) -> 1
setCount(5)                         -> replacement action: 5
result: 5
```

The first example uses `count` from the render snapshot. Both expressions evaluate to `1` before React processes the queue, so the later replacement does not mean “increment again”; it means “replace the result with 1 again.” In the second example, the functions are not evaluated when the handler creates them. React evaluates them while reducing the queue, passing 0 to the first and 1 to the second.

Mixed queues follow the same order. A direct `setCount(5)` establishes 5, so the later updater receives 5 and produces 6. If the order is reversed, the later direct replacement receives no updater result; it overwrites the earlier result with 5.

Batching changes when React renders, not what an updater means. In a React 18+ root, React generally batches updates from event handlers, promise callbacks, timers, and native event callbacks into one render when they occur in the same batch. Functional updates remain necessary because batching makes several actions wait together; it does not turn a render snapshot into a live value. `flushSync` can force an earlier render, but it does not make direct snapshot reads retroactively update inside the current JavaScript function.

The updater must return the complete next state for that `useState` slot. `useState` replaces the state value; it does not shallow-merge objects the way legacy class `setState` did. For arrays and objects, derive a new value without mutating the previous one. React uses identity to determine whether the state changed, and mutation also makes other queued updates and debugging much harder to reason about.

Functional updates solve one specific stale-read problem. They do not make every variable inside a callback fresh. If a timer uses both `count` and `userId`, an updater can make `count` current while `userId` is still the value captured by the timer’s closure. Effect dependencies, refs, cancellation, or a different design may be needed for the other value.

Updaters also need to be pure. They describe a state transition; they should not send analytics, mutate a module, issue a request, or update another state variable. In development Strict Mode, React may call an updater more than once to expose impure logic. The returned state should be the same for the same input, and any side effect belongs in an event handler or an effect that synchronizes with an external system.

## 4. Real Code — See It Working

**Repeated updates in one event**

This component is complete apart from the normal React application entry point. It shows why three direct replacements produce one increment while three updaters produce three increments.

```tsx
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  function incrementOnceFromSnapshot() {
    // All three expressions read the same render snapshot.
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
  }

  function incrementThreeTimes() {
    // React evaluates these in queue order, so each builds on the last result.
    setCount((previous) => previous + 1);
    setCount((previous) => previous + 1);
    setCount((previous) => previous + 1);
  }

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={incrementOnceFromSnapshot}>Direct +3 (actually +1)</button>
      <button onClick={incrementThreeTimes}>Functional +3</button>
    </div>
  );
}
```

**Updating an array without losing a concurrent change**

The updater receives the latest array and returns a new array. The callback below is safe even when another queued update adds a different todo before React renders.

```tsx
import { useState } from "react";

type Todo = { id: number; title: string; done: boolean };

export function TodoActions({ id }: { id: number }) {
  const [todos, setTodos] = useState<Todo[]>([]);

  function addTodo(title: string) {
    setTodos((previousTodos) => [
      ...previousTodos,
      { id: Date.now(), title, done: false },
    ]);
  }

  function toggleTodo() {
    setTodos((previousTodos) =>
      previousTodos.map((todo) =>
        todo.id === id ? { ...todo, done: !todo.done } : todo,
      ),
    );
  }

  function removeTodo() {
    setTodos((previousTodos) =>
      previousTodos.filter((todo) => todo.id !== id),
    );
  }

  return <button onClick={toggleTodo}>Toggle ({todos.length} items)</button>;
}
```

In a real application, `Date.now()` is not a durable unique ID under high-frequency creation or across clients; the example uses it only to keep the component self-contained. A server ID or collision-resistant client ID would be the production choice.

**A timer that increments current state**

The component below assumes React 18+ and demonstrates the state part of an interval. The empty dependency list keeps one interval alive; the functional updater keeps `count` current without putting `count` in the dependency list.

```tsx
import { useEffect, useState } from "react";

export function ElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      // React supplies the latest pending value when this callback runs.
      setSeconds((previousSeconds) => previousSeconds + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  return <p>Elapsed: {seconds}s</p>;
}
```

The updater does not solve every timer problem. If the callback also needs a changing `rate`, the effect must either resubscribe when `rate` changes, read the latest rate through a carefully managed ref, or use another synchronization strategy.

**A reducer when transitions have become a protocol**

Functional updates are excellent for a small local transition. If many events update related fields and each event has a name and payload, a reducer makes the transition rules explicit while still receiving the latest state.

```tsx
type State = { quantity: number; submitted: boolean };
type Action =
  | { type: "increase"; amount: number }
  | { type: "submit" };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "increase":
      return { ...state, quantity: state.quantity + action.amount };
    case "submit":
      return { ...state, submitted: true };
  }
}
```

The important connection is that both forms are state transitions. A setter updater is an inline transition for one state slot; a reducer is a named transition function for a state machine.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a functional state update?**

It is a function passed to a state setter instead of a direct next value: `setCount((previous) => previous + 1)`. React stores that function as an update and calls it with the latest pending state when it processes the queue. This makes the update relative to the state at processing time rather than dependent on the value captured by the render that created the callback.

**Q: Why do three `setCount(count + 1)` calls usually produce only one increment?**

The handler reads one render snapshot. If `count` is 0, all three expressions become the replacement action `1`. React may batch them, but batching does not reinterpret `1` as “increment.” Each later replacement overwrites the previous result with the same value. Three updater functions instead produce a chain: 0 → 1 → 2 → 3.

**Q: Does a functional update immediately change the state variable in the current handler?**

No. Setters schedule work, and the current handler continues to see the snapshot from the render that created it. The updater function is evaluated later while React calculates the next render’s state. If code needs to know the next value immediately, calculate it in a local variable for that event or move the follow-up work to the appropriate render/effect boundary; do not expect the setter to mutate the current closure.

**Q: When should you use a functional update, and when is a direct value clearer?**

Use an updater whenever the next value depends on the previous value: incrementing, toggling, appending, removing, merging based on current content, or applying repeated queued changes. Use a direct value for an independent replacement such as `setName("Asha")` or `setOpen(false)`. Passing `setOpen(() => false)` is valid but hides the fact that the new value does not depend on the old one.

**Q: How does a functional update fix a stale closure?**

It avoids reading the stale state variable from the closure for that particular state slot. React calls the updater with the pending state it is currently reducing. It does not refresh the whole closure. Other captured props, state variables, and ordinary local values can still be stale, so the callback may still need correct effect dependencies, a ref, cancellation, or a different data flow.

**Q: How do functional updates behave with automatic batching?**

React queues the updates and can commit one render for the batch. Direct-value actions are evaluated from the caller’s snapshot before queue processing, while updater actions are evaluated in queue order during processing. Automatic batching therefore reduces renders; functional updates preserve the correctness of several dependent changes inside those queued actions. The exact batching boundary depends on the React root and APIs involved, so “React always batches everything” is too broad.

**Q: Can functional updates update arrays and objects?**

Yes. The state type can be a primitive, array, or object. The updater must return the complete next value and should create a new array or object: `setItems((previous) => [...previous, item])`. Do not push into `previous` and return it. `useState` replaces rather than merges object state, and returning the same mutated reference can prevent React from observing a meaningful identity change.

**Q: Can you use a functional update inside an effect with an empty dependency array?**

Sometimes. If the effect only needs to increment `count`, `setCount((previous) => previous + 1)` removes the need for the effect to read `count`, so `count` need not be a dependency for that part. It does not justify an empty dependency list when other effect logic reads changing values. The dependency decision must account for every reactive value the effect captures.

**Q: Why must an updater be pure?**

React treats the updater as a calculation from previous state to next state. It may defer, replay, or invoke that calculation more than once in development to detect unsafe assumptions. A network request or mutation inside it could happen twice or at an unexpected time. Keep the updater limited to deriving and returning state; perform side effects in the event that caused the action or in an effect that explicitly synchronizes with an external system.

**Q: Are functional updates the same as `useReducer`?**

They share the idea of reducing a transition from previous state, but they serve different scales. A setter updater is concise for one local state value. `useReducer` centralizes named actions and transition rules, which is easier to test and extend when several fields change together. A reducer does not make side effects safe inside the reducer either; reducers should also be pure.

**Q: Are functional updates the same as refs?**

No. A functional updater gives React a safe way to calculate state that should drive a render. A ref gives a mutable container whose `.current` can change without causing a render. Use state for visible UI state and refs for values such as an interval ID, DOM node, or latest non-visual value when avoiding a render is intentional.

## 6. The Traps — What Goes Wrong

**Reading the state variable again after calling the setter.**

The assumption is that `setCount(count + 1)` mutates `count`. It does not; the variable belongs to the current render snapshot, so a log immediately after the setter prints the old value. The next render receives the new state. If you need a value for the same event, derive it explicitly rather than treating a setter as a synchronous assignment.

**Using a direct value for a repeated or delayed transition.**

`setItems([...items, item])` can lose an item when several callbacks use the same captured `items`. Each callback constructs a replacement from its own snapshot. `setItems((previous) => [...previous, item])` applies each append to the queue’s latest result.

**Mutating the previous value.**

This is wrong:

```tsx
setTodos((previous) => {
  previous.push(todo);
  return previous;
});
```

It changes an object React still considers the previous state and returns the same array reference. The safe version is `setTodos((previous) => [...previous, todo])`. Immutable updates also prevent one queued calculation from unexpectedly seeing mutations made by another calculation.

**Forgetting that object state is replaced.**

`setProfile((previous) => ({ name: "Asha" }))` drops every other field because the returned object is the complete new state. Preserve fields deliberately: `setProfile((previous) => ({ ...previous, name: "Asha" }))`. This is different from class component `setState`, which historically merged object updates shallowly.

**Forgetting to return from an updater.**

These setter fragments assume a numeric `count` state. The bad updater uses a
block body but forgets `return`, so its result is `undefined` and it violates
the state contract by replacing the count with a non-number:

```tsx
// Bad: the updater returns undefined.
setCount((previous) => {
  previous + 1;
});

// Fixed: return the complete next state.
setCount((previous) => {
  return previous + 1;
});
```

**Putting side effects in the updater.**

An updater such as `setCount((previous) => { analytics.track("increment"); return previous + 1; })` couples an external action to a calculation React may replay. The analytics event can be duplicated or happen even when work is abandoned. Keep the state calculation pure and track the user event outside the updater.

**Assuming functional updates repair every stale callback.**

`setCount((previous) => previous + step)` makes `count` current but may still use a stale `step` captured by an old interval. Fix the other dependency instead of declaring the whole callback fresh. This distinction is especially important in effects, subscriptions, and asynchronous request callbacks.

**Adding every setter call to an effect dependency list.**

The setter returned by `useState` has stable identity and does not need to be listed. The state value may need to be listed if the effect reads it. A functional updater can remove a dependency only when it replaces that read; it is not a blanket escape hatch from exhaustive-dependency reasoning.

## 7. Compare With Related Concepts

**Functional update vs direct state replacement:** An updater says “calculate from whatever state React gives you”; a direct value says “replace this state with this value.” Use the updater for previous-state-dependent changes and direct replacement for independent values.

**Functional update vs `useReducer`:** Both express transitions from previous state, but an updater is a small inline transition while a reducer is a named action-driven state machine. Use the updater for a focused state slot; use a reducer when multiple fields and event types form a protocol.

**Functional update vs `useRef`:** An updater schedules visible React state and a render; a ref changes `.current` without rendering. Use state for UI output and a ref for mutable, non-visual coordination such as a timer handle.

**Functional update vs an effect dependency array:** The updater controls how a queued state transition derives its next value. Dependencies control when an effect is synchronized again with values it reads. Use both when both concerns exist; solving one does not solve the other.

**Functional update vs a stale-closure fix using a ref:** The updater is the right tool when the callback’s job is to produce new React state. A ref is useful when the callback must read the latest value without scheduling state, but it adds manual synchronization responsibility. Choose based on whether the value is an input to a render or merely a callback’s current coordination data.

## 8. 🧠 The Memory Hook — What Sticks

Direct state values are sealed envelopes from one render: several envelopes can all say “replace the balance with 1.” A functional update is a bank instruction that says “add one to whatever is on the ledger when you open this instruction,” so React can safely process a queue of changes without losing the changes before it.
