# Component Lifecycle in React: Class Lifecycle vs Hooks Synchronization

## 1. Why This Exists — The Problem First

Imagine shipping a chat application where a user switches from the `General` room to `Engineering`. The screen should stop listening to `General` immediately and start listening to `Engineering`. If the code only connects when the component first appears, the UI keeps showing old messages; if it never disconnects, hidden rooms continue consuming sockets and processing events.

The same problem appears with timers, browser event listeners, DOM measurements, media players, and in-flight requests. Each resource has a beginning, a period where it must reflect current props or state, and an end. React can render a component more than once, pause work, discard a render, or remove a subtree. Code that creates external work at the wrong moment can therefore produce duplicate subscriptions, stale closures, flicker, race conditions, or leaks.

The useful question is not “Which lifecycle method should I memorize?” It is “Which external system must match this render’s values, and what is the exact undo operation?” React’s lifecycle gives us the moments around mounting, updating, and unmounting; effects turn those moments into a synchronization contract.

## 2. The Analogy — Make It Obvious

Think of a React component as a guest staying in a smart hotel suite. **Mounting is check-in:** the hotel creates the room assignment, connects the guest’s billing profile, and sets the thermostat. **Updating is a change during the stay:** the guest changes the temperature or requests more towels, so staff adjusts the existing room instead of demolishing and rebuilding it. **Unmounting is check-out:** staff disconnects the billing session, resets the room, and removes the guest’s temporary settings.

The mapping is direct. A component’s props and state are the guest’s current preferences. The rendered DOM is the prepared room. A WebSocket, timer, or `window` listener is a service outside the room that must be connected while the guest needs it. Effect setup starts or updates that service; effect cleanup is the hotel’s exact reset procedure. When `roomId` changes, React cleans up the connection created for the old room before setting up the connection for the new room.

This also explains the difference between old class lifecycles and Hooks. Class code put instructions in three calendar binders: “at check-in,” “during an update,” and “at check-out.” A single feature such as a socket was split across those binders. Hooks let the feature keep one rule card: “For this `roomId`, connect this socket; when the `roomId` changes or the guest leaves, disconnect that socket.” The organization follows the resource being synchronized rather than an arbitrary time bucket.

## 3. How It Actually Works — The Full Explanation

React’s work is easiest to understand as a sequence with a strict boundary around side effects. **The render phase** calls function components or class `render()` methods and calculates what the next UI should be. It is a computation, not a safe place to open sockets, mutate the DOM, send requests, write to global state, or call `setState`. In concurrent rendering, React may pause, restart, or abandon this calculation before it ever becomes visible.

Every render creates an immutable snapshot of the props, state, and context read by that render. A function’s event handler or effect closes over that snapshot; it does not magically read values from a future render. This is why an effect must list the reactive values it reads, and why a functional state updater is useful when a callback needs the latest state. A later render creates new closures, while callbacks from an obsolete snapshot may still run unless cleanup or an explicit current-request guard prevents them from affecting the UI.

**The commit phase** applies the finished result to the host environment, such as the browser DOM. For an update, the relevant layout-effect cleanup runs first, React mutates the DOM and attaches refs, and then the new layout-effect setup runs—all before the browser paints the next frame. `getSnapshotBeforeUpdate` reads just before DOM mutation, while `componentDidUpdate` runs after it.

**Passive effects run after commit and generally after paint.** React flushes `useEffect` cleanup for effects whose dependencies changed, then runs the corresponding new setup. The interaction that caused the update can affect timing, including allowing React to flush passive work before paint, so “after paint” is a default rather than a universal guarantee. The old passive effect is still cleaned up before its replacement is set up.

There are three user-facing lifecycle stages. **Mounting** is the first committed appearance of a component instance. React renders it, commits its DOM, and then runs layout and passive effect setup. **Updating** happens when relevant props, state, or context change. React renders again, reconciles the result, commits the minimal DOM changes, and re-synchronizes only the effects whose dependency values changed. **Unmounting** removes the component from the rendered tree; layout cleanup runs during the commit before DOM removal, while passive cleanup runs after commit. External resources can then be released without assuming another render.

**Component identity controls state ownership.** React preserves local state when the same component type remains in the same position in the rendered tree. A different type, a different `key`, or a different position can create a different identity and reset that subtree’s state. State belongs to that identity—not to a particular function invocation. For example, changing rooms can intentionally reset chat history with a key remount:

```tsx
<ChatRoomHook key={roomId} roomId={roomId} />
```

Without the key, the same `ChatRoomHook` identity can preserve `messages` while its effect synchronizes the socket to the new room. Use a key when a fresh local state boundary is desired; otherwise keep the stable identity and update state deliberately.

**Class components use imperative, time-based callbacks.** `constructor(props)` initializes state and bindings before the first render. `static getDerivedStateFromProps` is a rare pure escape hatch for deriving state from props. `render()` must stay pure. `componentDidMount()` runs after the initial commit and is a place for subscriptions, requests, or DOM work. `shouldComponentUpdate(nextProps, nextState)` can skip an update as a performance optimization. `getSnapshotBeforeUpdate` reads information such as scroll position immediately before DOM mutations, and passes the snapshot to `componentDidUpdate`. `componentDidUpdate` runs after an update and often needs a comparison such as `prevProps.roomId !== this.props.roomId` before starting more work. `componentWillUnmount()` is the teardown point.

The weakness is not that those methods are incorrect. The weakness is that one external feature is commonly scattered across several methods, and the developer must manually keep the conditions symmetrical. A missed comparison reconnects too late; a missed unmount cleanup leaks; an unconditional `setState` in `componentDidUpdate` loops.

There is no one-to-one class-method-to-Hook conversion. The useful mapping is by responsibility, with caveats:

| Class API | Closest Hook-era approach | Caveat |
|---|---|---|
| `constructor` | `useState`/`useReducer` initializers; closures replace most bindings | Hooks have no constructor phase; keep initialization pure and do not use it to start external work. |
| `componentDidMount` | `useEffect` or `useLayoutEffect` with dependencies | The Hook is a synchronization declaration, not a mount-only callback; Strict Mode can run setup and cleanup again in development. |
| `componentDidUpdate` | An effect whose dependencies identify the synchronized values | Effects run after commit and combine setup with cleanup; use an explicit previous-value ref only when the distinction is genuinely needed. |
| `componentWillUnmount` | The cleanup function returned by an effect | Cleanup belongs to the resource setup and can run before replacement setup, not only on final unmount. |
| `getSnapshotBeforeUpdate` | `useLayoutEffect` plus a ref storing the previous measurement | There is no exact Hook equivalent with the same pre-mutation callback slot; a layout effect reads after DOM mutation, so design the measurement around that timing. |
| `shouldComponentUpdate` | `memo`, stable props, and measured component boundaries | `memo` is a render optimization, not a general lifecycle replacement, and it does not prevent state or context updates. |
| `getDerivedStateFromProps` | Usually derive during render; sometimes `useMemo`, controlled props, or a key boundary | There is no direct Hook equivalent; avoid duplicating props in state and use this pattern only for a real state-machine need. |

These are responsibility-level correspondences, not promises that Hooks reproduce class timing or semantics exactly.

**Function components use declarative synchronization.** An effect says, “When these reactive values describe this render, keep this external system configured for that snapshot.” The dependency array is not a timer or a command to “run once.” It describes which values can make the synchronization invalid. React compares dependency values with `Object.is`; if a dependency changed, it runs cleanup for the previous setup and then runs setup with the new render’s values.

```tsx
// Contextual but complete: the application supplies ./chatApi.
import { useEffect } from 'react';
import { chatApi } from './chatApi';

export function ChatRoom({ roomId }: { roomId: string }) {
  useEffect(() => {
    const connection = chatApi.connect(roomId);

    return () => {
      connection.disconnect();
    };
  }, [roomId]);

  return <h2>Room: {roomId}</h2>;
}
```

It runs when `./chatApi` exports `connect(roomId)` returning a connection with `disconnect()`.

On the first committed mount, the component renders, the DOM is committed, and the effect connects the current room. On a later render where `roomId` is unchanged, React does not re-run this effect. When `roomId` changes, the cleanup closes the old connection, then setup connects the new room. On unmount, the final cleanup closes whichever connection belongs to the last committed render. Each setup must therefore be paired with an idempotent cleanup that can safely run during development checks as well as normal navigation.

**`useEffect` and `useLayoutEffect` solve different timing problems.** Use `useEffect` by default for requests, subscriptions, timers, logging, and synchronization that does not need to block the first paint. Use `useLayoutEffect` only when the DOM must be measured or synchronously adjusted after React commits it but before the browser displays the frame. A tooltip that first renders at `(0, 0)` and jumps to its measured position is a layout-timing problem; a socket subscription is not.

**Strict Mode exposes lifecycle mistakes in development.** With React 18 and later, Strict Mode performs an extra effect setup and cleanup cycle on initial mount in development. The sequence is effectively setup, cleanup, setup, while state is preserved. This is not a production request to duplicate work. It is a stress test: a subscription without cleanup becomes visibly duplicated, and non-idempotent setup becomes easier to find. Code should remain correct if React temporarily removes and re-attaches a subtree in future rendering features.

## 4. Real Code — See It Working

**A class-based implementation.** This is a complete component example, but the WebSocket URL is contextual: it requires a real server in the browser. Notice that the same resource is managed in mount, update, and unmount methods. The manual comparison and cleanup pairing are the important teaching points.

```tsx
import React from 'react';

interface ChatProps {
  roomId: string;
}

interface ChatState {
  messages: string[];
}

export class ChatRoomClass extends React.Component<ChatProps, ChatState> {
  private socket: WebSocket | null = null;

  state: ChatState = { messages: [] };

  componentDidMount() {
    this.connectToSocket(this.props.roomId);
  }

  componentDidUpdate(prevProps: ChatProps) {
    if (prevProps.roomId !== this.props.roomId) {
      this.disconnectSocket();
      this.setState({ messages: [] });
      this.connectToSocket(this.props.roomId);
    }
  }

  componentWillUnmount() {
    this.disconnectSocket();
  }

  private connectToSocket(roomId: string) {
    this.socket = new WebSocket(`wss://chat.example.com/rooms/${roomId}`);
    this.socket.onmessage = (event: MessageEvent<string>) => {
      this.setState((previous) => ({
        messages: [...previous.messages, event.data],
      }));
    };
  }

  private disconnectSocket() {
    this.socket?.close();
    this.socket = null;
  }

  render() {
    return (
      <section>
        <h2>Room: {this.props.roomId}</h2>
        <ul>
          {this.state.messages.map((message, index) => (
            <li key={`${message}-${index}`}>{message}</li>
          ))}
        </ul>
      </section>
    );
  }
}
```

**The Hook-based implementation.** This keeps the setup and its undo operation together. The socket is created inside the effect so cleanup closes the exact socket created by that effect, even if a later render has a different `roomId`. The functional state updater avoids reading a stale `messages` value from the effect’s closure. The URL is again contextual and needs a WebSocket server to run.

```tsx
import { useEffect, useState } from 'react';

interface ChatProps {
  roomId: string;
}

export function ChatRoomHook({ roomId }: ChatProps) {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const socket = new WebSocket(`wss://chat.example.com/rooms/${roomId}`);

    socket.onmessage = (event: MessageEvent<string>) => {
      setMessages((previous) => [...previous, event.data]);
    };

    return () => {
      socket.close();
    };
  }, [roomId]);

  return (
    <section>
      <h2>Room: {roomId}</h2>
      <ul>
        {messages.map((message, index) => (
          <li key={`${message}-${index}`}>{message}</li>
        ))}
      </ul>
    </section>
  );
}
```

If messages must be cleared when the room changes, do that as part of the new room’s synchronization or render model rather than calling `setMessages` from cleanup. Cleanup can run during unmount, when a state update is unnecessary, and the cleanup belongs to the old room. A simple alternative is to render the component with `key={roomId}` so changing rooms creates a new component instance and resets its local state.

**An effect with a request cancellation boundary.** This is a contextual fragment because `/api/user/:id` is an application endpoint, but the browser code is runnable when that endpoint exists. Aborting the old request asks the transport to stop work; the `isCurrent` guard is the request-generation protection that prevents an obsolete completion from updating state even if abort races with resolution. The `AbortError` branch is intentionally ignored because cancellation is expected behavior during navigation.

```tsx
import { useEffect, useState } from 'react';

interface User {
  id: string;
  name: string;
}

export function UserDetails({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    async function loadUser() {
      try {
        const response = await fetch(`/api/user/${userId}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        const nextUser = (await response.json()) as User;
        if (!isCurrent) return;
        setUser(nextUser);
        setError(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (!isCurrent) return;
        setError(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    void loadUser();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [userId]);

  if (error) return <p role="alert">{error}</p>;
  return <p>{user ? user.name : 'Loading…'}</p>;
}
```

**A layout measurement.** This example is also contextual because it expects a parent to pass a ref to a mounted target element. `useLayoutEffect` is appropriate because the tooltip’s position depends on the DOM geometry that React just committed. It should not be the default for ordinary data work because it can delay paint.

```tsx
import { RefObject, useLayoutEffect, useRef, useState } from 'react';

export function Tooltip({
  targetRef,
  text,
}: {
  targetRef: RefObject<HTMLElement | null>;
  text: string;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const target = targetRef.current;
    const tooltip = tooltipRef.current;
    if (!target || !tooltip) return;

    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    setPosition({
      top: targetRect.top - tooltipRect.height - 8,
      left: targetRect.left + (targetRect.width - tooltipRect.width) / 2,
    });
  }, [targetRef, text]);

  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        background: '#1e293b',
        color: 'white',
        padding: '4px 8px',
        borderRadius: 4,
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are the three fundamental phases of the React component lifecycle?**

**Mount** is the first committed appearance. React renders the component, creates or updates its host DOM, and runs the effect setup associated with that committed instance. **Update** follows a relevant prop, state, or context change. React renders a new description, reconciles it with the previous one, commits the necessary DOM changes, and re-synchronizes effects whose dependencies changed. **Unmount** removes the component from the tree and runs cleanup so subscriptions, timers, sockets, and other external resources do not outlive the component.

**Q: What is the difference between the render phase and the commit phase?**

During render, React calculates the next result by calling components and reconciling their output. That work must be pure because React may restart or abandon it. During commit, React applies the chosen result to the DOM and runs commit-time lifecycle work. The commit is the point at which the calculated UI becomes observable; it is also why DOM mutation and external synchronization must not be hidden in the component body.

**Q: Why is `useEffect` not a one-to-one replacement for three class methods?**

`componentDidMount`, `componentDidUpdate`, and `componentWillUnmount` are separate time-based callbacks. An effect is a synchronization unit. Its setup describes how to connect the current render to an external system, and its cleanup describes how to undo that exact connection before the next setup or on unmount. An empty dependency array can model “after mount” in many cases, but it does not make the effect conceptually identical: passive effects are scheduled differently, and Strict Mode may perform an extra development setup-cleanup cycle.

**Q: When should you choose `useLayoutEffect` over `useEffect`?**

Choose `useLayoutEffect` when you must read layout after React has committed DOM changes and synchronously adjust something before the user sees the frame, such as positioning a tooltip from `getBoundingClientRect()` or restoring a scroll offset. Choose `useEffect` for requests, subscriptions, timers, analytics, and other work that does not need to block paint. If an ordinary effect is moved to `useLayoutEffect` without a visual requirement, it can make rendering less responsive.

**Q: Why does Strict Mode run effects more than once in development?**

It intentionally checks whether setup and cleanup form a reversible pair. A missing `removeEventListener`, `clearInterval`, `close`, or abort becomes obvious when setup is followed immediately by cleanup and setup again. This is a development diagnostic, not a reason to add a “run only once” flag. The durable fix is idempotent setup and complete cleanup.

**Q: How do you prevent request races and leaks inside an effect?**

Create an `AbortController` inside the effect and pass its signal to `fetch`. Return cleanup that marks the request generation inactive and calls `abort()`. The signal asks the transport to stop, while the current-generation guard prevents an obsolete response or error from updating state if the transport resolves during the cleanup race. Still handle non-abort errors, check `response.ok`, and use a request library’s cancellation mechanism when the library owns the transport.

**Q: Why must the render phase be pure?**

React is allowed to call rendering code without committing it. A request sent, global variable mutated, or subscription opened during a discarded render cannot be rolled back by React. State updates in render can also cause an infinite loop. Put external work in an effect or event handler, where its lifetime and cleanup are explicit.

**Q: What belongs in an effect dependency array?**

Include every reactive value read by the effect that can change between renders: props, state, and values declared in the component body. If a value does not need to be reactive, move it outside the component; if an object or function is recreated unnecessarily, stabilize or restructure it rather than suppressing the dependency rule. The goal is not to minimize effect executions. The goal is to ensure the external system always matches the values the effect actually uses.

## 6. The Traps — What Goes Wrong

**Stale closures caused by an incomplete dependency list.** This code captures the `count` from the first render, so it repeatedly calculates `0 + 1`:

```tsx
// Wrong: count is read but omitted from the dependency list.
useEffect(() => {
  const id = window.setInterval(() => {
    setCount(count + 1);
  }, 1000);
  return () => window.clearInterval(id);
}, []);
```

The better fix is a functional updater when the next value depends only on the previous value. It lets the interval ask React for the latest state without recreating the interval every tick:

```tsx
useEffect(() => {
  const id = window.setInterval(() => {
    setCount((previous) => previous + 1);
  }, 1000);
  return () => window.clearInterval(id);
}, []);
```

**Using an effect to calculate derived data.** If `totalPrice` is completely determined by `items`, storing it separately creates a stale intermediate frame and an extra render:

```tsx
// Wrong: the first render uses the old total, then the effect schedules another render.
const [totalPrice, setTotalPrice] = useState(0);
useEffect(() => {
  setTotalPrice(items.reduce((sum, item) => sum + item.price, 0));
}, [items]);
```

Calculate it during render. Use `useMemo` only when the calculation is expensive and the dependency identity is meaningful:

```tsx
const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
```

**Missing cleanup.** Adding a listener in an effect without removing it creates a new listener whenever the effect runs and leaves listeners behind after unmount:

```tsx
useEffect(() => {
  function handleResize() {
    console.log(window.innerWidth);
  }
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

The cleanup must use the same function reference passed to `addEventListener`. Apply the same pairing rule to `clearInterval`, socket `close`, observer `disconnect`, and request `abort`.

**Assuming asynchronous responses arrive in request order.** If `User 1` takes 800ms and `User 2` takes 200ms, the older request can resolve last and overwrite the newer screen. A cleanup flag can ignore obsolete responses, but `AbortController` is usually better because it also asks the transport to stop work. Neither technique should hide real errors.

**Setting state from cleanup.** Cleanup is for releasing the old external resource, not for forcing a local state transition during unmount. `setMessages([])` in a socket cleanup can schedule work while the component is leaving, and it mixes the old room’s teardown with the new room’s state policy. Reset state through the new synchronization setup, an event handler, or a deliberate `key` boundary.

**Putting side effects in the component body.** A request or `window.addEventListener` call in the function body runs on every render and may run for work React never commits. The code can duplicate resources or create an infinite update loop. Keep the render body as a description of UI and place external work behind a lifecycle-aware effect.

**Treating an empty dependency array as a universal “componentDidMount.”** `[]` says that the effect does not use changing reactive values, not that the effect is exempt from lifecycle rules. It still needs cleanup, it still runs after commit as a passive effect, and it is still checked by Strict Mode. If the effect reads `roomId`, omitting `roomId` is a correctness bug even if the effect “should only run once.”

## 7. Compare With Related Concepts

| Concept pair | Key difference | Rule of thumb |
|---|---|---|
| Class lifecycles vs Hook synchronization | Class methods organize code by when React calls them; an effect keeps one external resource synchronized with the values it reads. | Use Hooks in new function components; understand class methods for legacy components and error boundaries. |
| `useEffect` vs `useLayoutEffect` | `useEffect` is passive and normally runs after paint; `useLayoutEffect` runs after DOM mutation before paint and can block the frame. | Default to `useEffect`; use layout effects only for pre-paint measurement or visual correction. |
| `useEffect` vs `useInsertionEffect` | `useInsertionEffect` runs at an earlier commit point for style insertion and is intended for CSS-in-JS library authors. | Application code almost never needs `useInsertionEffect`. |
| Unmounting vs CSS hiding | Unmounting removes the component and runs cleanup; `display: none` keeps the component, its state, and its effects mounted. | Unmount when the resource should stop; hide when state and resource continuity are intentional. |
| `useEffect` vs `useSyncExternalStore` | An effect can subscribe to many external systems; `useSyncExternalStore` gives React a synchronous snapshot-and-subscribe contract that prevents tearing for external stores. | Use `useSyncExternalStore` for a store or browser source that must provide consistent snapshots during concurrent rendering. |
| Derived data vs synchronized state | Derived data can be calculated from current props/state; synchronized state represents a separate external system. | Calculate values in render; use an effect only when something outside React must be connected or updated. |

## 8. 🧠 The Memory Hook — What Sticks

Picture a hotel room: **render plans the room, commit makes the room real, setup connects the guest’s services, and cleanup checks them out.** Class lifecycles scatter that rule by calendar time; Hooks keep the resource’s setup and undo operation together. Whenever a dependency changes, React closes the old room service before opening the new one.
