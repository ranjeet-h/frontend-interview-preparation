# Functional Components vs Class Components in React

## 1. Why This Exists — The Problem First

Imagine a profile page where a user clicks “Follow Alice.” The request takes three seconds. Before it finishes, the user navigates to Bob’s profile. If the callback later reads `this.props.user` from a class instance, it can report Bob even though the action started for Alice. That is a correctness bug, not a cosmetic difference between two component styles.

Class components also made ordinary work harder to keep together. A WebSocket subscription might be created in `componentDidMount`, compared and replaced in `componentDidUpdate`, and cleaned up in `componentWillUnmount`, while unrelated concerns share those same methods. Event-handler binding, wrapper components for reusable stateful logic, and manual lifecycle bookkeeping added more places for a feature to drift out of sync.

React 16.8 introduced Hooks so a component could be a normal function while React still owned its state and scheduling. The important shift is not “functions are modern.” It is that a function render gives you a snapshot of values, while a class gives you a long-lived object whose fields can change.

## 2. The Analogy — Make It Obvious

Think of a class component as a live control room with one operator’s console. The console is the instance, `this`; its display is `this.props`, and its controls are `this.state`. When the selected profile changes, the same display is updated. A delayed operator who looks at the display later sees the latest profile, not necessarily the profile that was selected when the action began.

A functional component is closer to a camera taking one photograph per render. The Alice render produces a photograph containing Alice, its state values, and the callbacks created during that call. A later Bob render produces another photograph. A timer created by the Alice photograph closes over Alice’s values, so it does not silently turn into a Bob timer.

The analogy has one important qualification: React does not throw away the component’s identity on every function call. It keeps state and hook records on the component’s Fiber, then calls the function again to produce the next snapshot. The photograph describes the values visible to that render; the filing cabinet behind the camera is React’s retained component state.

## 3. How It Actually Works — The Full Explanation

**The execution model.** A class component is instantiated once for a mounted component identity. React calls its `render()` method again when it needs new UI and updates fields such as `this.props` before that render. A callback that later evaluates `this.props.user` follows the mutable instance reference at callback time. This behavior is not automatically a bug: a class can deliberately copy the value into a local variable before crossing an async boundary. The risk comes from assuming the instance field is a historical snapshot.

A function component is invoked again for each render. Its parameters and local variables belong to that invocation. An event handler created during the Alice invocation closes over Alice’s `user`; a handler created during Bob’s invocation closes over Bob’s `user`. This is the **render-snapshot** or **capture-value** model. It makes stale values visible as a dependency problem instead of hiding them behind a mutable object.

**Rendering can be replayed or abandoned.** In development Strict Mode, React deliberately calls render-phase code more than once and performs an extra setup/cleanup cycle for effects to expose impure rendering and missing cleanup. This is development-only checking, not two production user interactions. With concurrent rendering, render work may also be interrupted, restarted with newer data, or discarded before it commits. Render must therefore be pure: do not subscribe, mutate external objects, start timers, or perform other side effects while calculating JSX. Effects run after a render commits, so they belong to the commit-side synchronization step and must tolerate setup/cleanup being repeated in development.

**Where state lives.** Local variables disappear when the function returns, so `useState` cannot store state in the function’s stack frame. React keeps hook records associated with the component’s Fiber. During a render, React walks those records in hook-call order and returns the value for each call. A setter schedules work for that Fiber; the next render reads the updated record. This is why hooks cannot be called conditionally, inside loops, or inside nested functions: changing call order would make one hook call read another hook’s record.

Class state is stored on the instance, normally in `this.state`, and updates are requested with `this.setState`. A class field such as `this.timerId` can persist without causing a render. The functional counterpart is usually `useRef`, whose stable object contains a mutable `.current` value. React preserves that ref object across renders, but changing `.current` alone does not schedule a render.

**State ownership and identity.** State belongs to the component that owns the `useState`, `useReducer`, or class state—not to a particular function call or JSX element object. React preserves that state by the component’s position in the rendered tree when the element type and key stay the same. A `key` is part of identity, not merely a list warning: changing it tells React that the old component is different, so its state is discarded and a new instance/Fiber is mounted. This makes a keyed remount an explicit reset, while rendering the same component type in the same unkeyed position preserves its state even when its props change.

For example, `<Form key={userId} userId={userId} />` remounts and resets the form when `userId` changes, whereas `<Form userId={userId} />` keeps the existing form state in that position and updates its props. Conversely, rendering two `Form` elements in two stable positions gives each position its own state; swapping their data without changing keys does not transfer state to the other position. Lift state to their closest common parent when multiple components must coordinate, and use a deliberate key when a component should start fresh.

**Lifecycle versus synchronization.** A class encourages a timeline: mount, update, unmount. Hooks encourage a relationship: “make this external system match the current `roomId`, and undo that relationship when it changes.” An effect with `[roomId]` runs after a committed render when the dependency is new, runs its previous cleanup before the next matching effect, and cleans up on unmount. The cleanup captures the old `roomId`, which is exactly what is needed to disconnect the old room.

| Class pattern | Functional pattern | What changes in the reasoning |
| --- | --- | --- |
| `this.state` and `this.setState` | `useState` or `useReducer` | React retains hook state outside the function and calls the function with the current snapshot. |
| `constructor` and `state = {}` | `useState` or `useReducer` | Initialize state in the class instance versus declaring retained state slots for the function component. |
| `componentDidMount` | `useEffect(..., [])` for a mount-time external synchronization | Setup runs after commit; the dependency list must match what the effect reads. It is not a general “run once” escape from stale closures. |
| `componentDidUpdate` | `useEffect(..., [deps])` | React reruns synchronization after a committed dependency change and cleans up the previous relationship first. |
| `componentWillUnmount` | The function returned from `useEffect` | Cleanup disconnects subscriptions, clears timers, and releases external resources on dependency replacement or unmount. |
| `componentDidMount` / `componentDidUpdate` for layout-sensitive work | `useLayoutEffect(..., [deps])` | Runs after DOM mutations but before paint, so it can measure or synchronously adjust layout; it blocks painting and should be used sparingly. It does not make render impure and still needs complete cleanup/dependencies. |
| `getSnapshotBeforeUpdate` | No direct hook equivalent; `useLayoutEffect` is the closest pattern for reading layout after the DOM update and before paint | `getSnapshotBeforeUpdate` reads the previous committed DOM immediately before React mutates it, while `useLayoutEffect` runs after those mutations. The timing is different, so `useLayoutEffect` is not a one-to-one replacement; redesign around the layout information the component actually needs. |
| `componentWillMount` / `UNSAFE_componentWillMount` | No direct equivalent; use a lazy `useState` initializer for pure initial state, or `useEffect` for committed external synchronization | These legacy pre-render methods could run more than once and are unsafe for side effects. Do not move their side effects into render; initialize pure data during render and synchronize external systems after commit. |
| `componentWillReceiveProps` / `UNSAFE_componentWillReceiveProps` | No direct equivalent; derive values during render, or use an effect when an external system must react after commit | Props are already available during a function render. Do not copy props into state by default; derive the value, reset with a deliberate `key`, or synchronize an external resource with an effect when that is the real requirement. |
| `componentWillUpdate` / `UNSAFE_componentWillUpdate` | No direct equivalent; use `useLayoutEffect` for post-commit layout work | This legacy pre-render hook ran before an update was committed, whereas layout effects run after DOM mutations. Treat `useLayoutEffect` as a closest post-commit pattern only when the goal is measuring or adjusting the committed layout, not as a lifecycle translation. |
| `shouldComponentUpdate` or `PureComponent` | `React.memo` with an optional comparator | Both are render bailouts; neither makes mutable data immutable. |
| Instance field such as `this.timerId` | `useRef()` | Both persist mutable data without making that mutation render. |
| `componentDidCatch` and `getDerivedStateFromError` | No equivalent hook in React core | Error boundaries remain the notable class-based escape hatch. |

**Effects are not generic lifecycle replacements.** `useEffect` is for synchronizing with an external system such as a socket, timer, subscription, or browser API. It is not a better place to derive `fullName` from `firstName` and `lastName`; derive that during render. It is also not a literal “run once after mount” switch. An empty dependency list says the effect does not depend on reactive values; if it reads changing state, it can retain an old closure.

**Error boundaries.** In React 19-era React APIs, class components are still the React-core mechanism for catching errors thrown while rendering a descendant tree, in a descendant lifecycle, or in a constructor. A reusable `ErrorBoundary` class can sit around a mostly functional tree. A library such as `react-error-boundary` can provide a friendlier API, but it still relies on the boundary capability rather than turning ordinary `try/catch` into a render boundary.

**Performance and bundles.** Functional components are often easier for compilers and bundlers to analyze because they use ordinary functions and local variables. Classes may require instance objects, prototype methods, and explicit bindings. Those are real implementation differences, but they are not a universal performance guarantee: render cost, reconciliation, allocations inside render, network work, and unnecessary child renders usually matter more. Choose `React.memo`, `useMemo`, or `useCallback` only when the identity or computation matters and measurement or a clear data-flow reason supports it.

## 4. Real Code — See It Working

**Example 1: snapshot capture versus a mutable instance.** The following is a contextual TSX example: place it in a React + TypeScript application with React 18 or later. The class version demonstrates the hazard; the local `user` variable in the function version is captured by that render.

```tsx
import { Component, useState } from 'react';

type UserProps = { user: string };

class ClassProfileViewer extends Component<UserProps> {
  showMessage = () => {
    setTimeout(() => {
      // The instance is still alive, so this reads the latest props.
      alert(`[class] Followed: ${this.props.user}`);
    }, 3000);
  };

  render() {
    return <button onClick={this.showMessage}>Follow {this.props.user}</button>;
  }
}

function FunctionalProfileViewer({ user }: UserProps) {
  const showMessage = () => {
    setTimeout(() => {
      // This callback closes over the value from this render.
      alert(`[function] Followed: ${user}`);
    }, 3000);
  };

  return <button onClick={showMessage}>Follow {user}</button>;
}

export function Demo() {
  const [currentUser, setCurrentUser] = useState('Alice');
  const switchUser = () => {
    setCurrentUser((previous) => (previous === 'Alice' ? 'Bob' : 'Alice'));
  };

  return (
    <>
      <p>Selected user: {currentUser}</p>
      <button onClick={switchUser}>Switch user</button>
      <ClassProfileViewer user={currentUser} />
      <FunctionalProfileViewer user={currentUser} />
    </>
  );
}
```

Click a Follow button for Alice, switch to Bob immediately, and wait. The class callback reads the current instance prop, so it reports Bob. The function callback keeps the Alice value from the render that created it. A class can avoid the problem by capturing `const { user } = this.props` before `setTimeout`; the difference is the default model, not a claim that classes cannot be written safely.

**Example 2: one synchronization unit.** This is also a contextual TSX example requiring React. The socket object is deliberately tiny so the setup/cleanup pairing is visible.

```tsx
import { useEffect } from 'react';

const chatSocket = {
  subscribe(roomId: string, onMessage: (message: string) => void) {
    console.log(`connected: ${roomId}`);
    return () => console.log(`disconnected: ${roomId}`);
  },
};

export function ChatRoom({ roomId }: { roomId: string }) {
  useEffect(() => {
    const stop = chatSocket.subscribe(roomId, (message) => {
      console.log(`[${roomId}] ${message}`);
    });

    // This cleanup belongs to the roomId captured above.
    return stop;
  }, [roomId]);

  return <p>Connected to {roomId}</p>;
}
```

When `roomId` changes from `general` to `support`, React cleans up the `general` subscription before creating the `support` subscription. In a class, the same invariant must be maintained manually across `componentDidMount`, a guarded `componentDidUpdate`, and `componentWillUnmount`.

**Example 3: the class escape hatch for render errors.** This is a contextual TSX component requiring React’s `Component`, `ErrorInfo`, and `ReactNode` types.

```tsx
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type BoundaryProps = { fallback: ReactNode; children: ReactNode };
type BoundaryState = { hasError: boolean };

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    // The next render switches to fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crash', error, info);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
```

A `try/catch` around `return <Child />` is not a substitute: creating the element does not execute the child’s render work inside the parent function’s `try` block.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between functional and class components under the hood?**

A class component has one persistent instance for a mounted identity. React updates fields on that instance and calls `render()`. A function component is called again to create each render snapshot. Its props, state values returned by hooks, and local variables are values for that invocation, while React retains hook state on the component’s Fiber between calls. Therefore an async callback that reads `this.props` observes a mutable instance field, while a callback that reads a function parameter observes the closure from the render that created it.

**Q: Why did the ecosystem move toward functions and Hooks?**

Hooks put reusable stateful logic in custom hooks without adding HOC or render-prop wrapper layers. They let subscription setup and cleanup live together, avoid most `this` binding mistakes, and make the render-snapshot model explicit. The move is not because every class is broken or because functions automatically render faster; it is because the composition and data-flow model is easier to maintain for most new UI code.

**Q: Can a functional component hold state, and where does it live?**

Yes. `useState` and `useReducer` ask React to retain state on the component’s Fiber. Hook records are matched by call order during rendering. The function’s local variable is only the value returned for the current snapshot; it is not the storage location. Calling a setter queues an update and causes React to render the component again with the new value.

**Q: Is `useEffect` a one-to-one replacement for the three class lifecycle methods?**

No. It can express the common setup/cleanup relationship that used to be split across those methods, but its meaning is synchronization with dependencies. With `[roomId]`, React reruns it when `roomId` changes and cleans up the old relationship first. An effect with `[]` can retain stale values if it reads changing props or state, and many values should be derived during render instead of put in an effect.

**Q: Are class components deprecated, and when are they still required?**

They are supported for existing applications and are not a reason to rewrite stable code automatically. New application components are usually functions, but React core still uses class components for error boundaries. A team can isolate that class boundary and keep the rest of the tree functional.

**Q: How do you deliberately read the latest value from an async callback in a function component?**

Use a ref when the requirement is genuinely “latest mutable value,” not when the value affects rendered output. The ref object is stable, so a callback can read `latest.current` at execution time. Update it in an effect that runs after the render commits, rather than during render: an abandoned concurrent render must not mutate a shared ref that belongs to the last committed UI. If the value belongs in the UI, use state instead; mutating a ref does not render.

The following contextual fragment assumes `useRef` is imported from React and `user` is a prop or local value in the component:

```tsx
const latestUser = useRef(user);
useEffect(() => {
  // Only a committed render may publish a value to this shared ref.
  latestUser.current = user;
}, [user]);

const logLatestUser = () => {
  setTimeout(() => console.log(latestUser.current), 3000);
};
```

**Q: Which approach is faster or smaller?**

There is no honest universal number. Classes can allocate instances and bound methods; functions are straightforward for many compiler and bundler analyses. But a functional component with expensive render work can still be slower than a well-designed class. Discuss measured render cost, prop identity, memoization, and external work instead of promising that one syntax wins every benchmark.

**Q: What is the difference between `React.memo` and `PureComponent`?**

`PureComponent` is a class base type that supplies a shallow comparison for props and state. `React.memo` wraps a function component and compares its props, optionally with a custom comparator. Neither performs a deep comparison, and neither prevents a component from updating when its own state or context requires it.

## 6. The Traps — What Goes Wrong

**Mutable instance fields are mistaken for event-time snapshots.** Reading `this.props.id` after an await or timer reads the field then, not necessarily when the event began. Capture the needed value in a local before the async boundary, or use a function render’s closure when snapshot semantics are what the operation needs.

**`useEffect(fn, [])` is treated as “componentDidMount, but safer.”** The callback still closes over its initial render. An interval that reads `count` can keep seeing zero forever. Include reactive dependencies, use a functional update when only the previous state is needed, or use a ref for a deliberately latest mutable value.

**A ref is used for visible state.** `ref.current = nextValue` changes storage but does not notify React. The model and the screen can diverge. Use `useState` or `useReducer` for anything that changes the returned JSX; reserve refs for DOM nodes, timer handles, imperative handles, and other non-visual data.

**A new callback is created on every render and then blamed on “functional components.”** Inline functions are normal and often harmless. They become relevant when an identity-sensitive child such as a memoized component receives the callback. In that case, stabilize the callback with `useCallback` only when its dependencies and the measured child-render cost justify it. In classes, binding in `render()` has the same identity issue; bind once or use a class-field arrow function.

**A parent `try/catch` is expected to catch child render errors.** JSX creates element descriptions; React evaluates the child later in its own reconciliation work. Put a real error boundary around the subtree and use event-handler error handling separately, because error boundaries do not replace `try/catch` for ordinary event callbacks.

**“Functions are faster” becomes a design rule.** Syntax alone does not solve unnecessary renders, unstable object props, expensive calculations, or network waterfalls. First identify the work, then choose a state boundary, memoization boundary, or data-fetching strategy that addresses that work.

## 7. Compare With Related Concepts

| Comparison | Key difference | Rule of thumb |
| --- | --- | --- |
| Functional component with Hooks vs class component | Snapshot closures and hooks versus one mutable instance and lifecycle methods | Use functions for new ordinary UI; retain classes where an existing boundary or legacy integration needs them. |
| `React.memo` vs `React.PureComponent` | Memo wraps a function and compares props; PureComponent supplies a class shallow bailout for props and state | Use the one matching the component style, and verify that prop identity makes the bailout useful. |
| `useRef` vs `this.someField` | Both persist mutable non-visual data; a ref stores it in `.current` and neither mutation renders | Use state for visible data; use a ref or instance field for imperative bookkeeping. |
| Custom hook vs HOC | A custom hook shares logic inside the existing component; an HOC shares behavior by wrapping the component | Prefer a custom hook when the logic is hook-compatible; use an HOC for a legacy or explicitly wrapper-shaped API. |
| `useEffect` vs `useLayoutEffect` | Both synchronize after commit, but layout effects run before browser paint and can block it | Use `useEffect` by default; use layout effects only for work such as measuring layout that must happen before paint. |
| Error boundary vs `try/catch` | An error boundary handles descendant render/lifecycle errors; `try/catch` handles code executing inside its synchronous `try` block | Use a boundary for a React subtree and `try/catch` around ordinary imperative work. |

## 8. 🧠 The Memory Hook — What Sticks

Classes are one live control room: delayed code can look at the console as it exists now. Functions are snapshots: each render gives its callbacks a photograph of that render’s values, while React keeps the component’s state in the filing cabinet behind the camera.
