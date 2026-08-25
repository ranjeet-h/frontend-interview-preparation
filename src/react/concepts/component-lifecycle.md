# Component Lifecycle in React: Class Lifecycle vs Hooks Synchronization

## 1. Why This Exists — The Problem First

Imagine shipping a chat application where users navigate between conversation channels in a sidebar.

In the first release, a developer subscribes to incoming WebSocket messages when the component mounts. When a user clicks from "General" to "Engineering", nothing happens: the screen stays glued to the "General" channel because the developer forgot to inspect prop changes and re-subscribe in an update handler. Worse, when the user navigates away to the Settings page, the WebSocket listener keeps firing in the background. Every new message attempts to update state on a destroyed component, leaking memory, clogging the network, and spitting red warnings into the console.

Before structured lifecycle mechanisms existed, UI components had no reliable way to coordinate with the outside world. Modern web apps do not live in a vacuum—they start timers, measure DOM elements, listen to browser window events, and stream data over sockets. If you don't control the exact moments when these external connections are created, updated with fresh data, and cleanly severed, your application will suffer from stale data bugs, race conditions, and catastrophic memory leaks.

Understanding lifecycle isn't about memorizing legacy API names; it is about mastering how React transitions your UI from creation to updates to destruction, and how to synchronize external systems with those transitions without leaking resources.

---

## 2. The Analogy — Make It Obvious

Think of a React component as a **guest staying in a smart hotel suite**:

```
[ Check-In / Mount ]       --> Staff sets thermostat to 70°F & connects guest billing profile.
                                 │
                                 ▼
[ Mid-Stay Update ]        --> Guest requests 65°F & extra towels.
                                 Staff adjusts thermostat and delivers towels (no need to rebuild the room).
                                 │
                                 ▼
[ Check-Out / Unmount ]    --> Guest leaves. Staff resets thermostat, clears billing, and strips beds
                                 so the next guest gets a clean, fresh room.
```

1. **Mounting (Check-In & Initial Setup):** When the guest arrives, the hotel turns on the climate control to their preferred temperature, puts their name on the smart TV, and links their payment card. In React, this is when a component is first created and inserted into the browser DOM—it triggers initial data fetching, DOM measurements, and event listeners.
2. **Updating (Preference Changes & Room Service):** During their stay, the guest changes the AC temperature from 70°F to 65°F or orders extra pillows. The hotel doesn't demolish and rebuild the entire room; housekeeping simply adjusts the thermostat and delivers the pillows. In React, when props or state change, React re-renders the component, calculates the visual differences, updates only the affected DOM nodes, and resynchronizes external systems to match the new values.
3. **Unmounting (Check-Out & Full Reset):** When the guest checks out, housekeeping resets the thermostat, wipes the personal data from the TV, and disconnects the billing session. In React, when a component leaves the screen, it runs cleanup functions to kill active timers, close open WebSocket connections, and remove window listeners.

### The Mental Shift: Class Lifecycles vs Hooks Synchronization

In older class components, hotel staff had three separate, rigid binders organized by **calendar time**:
- Binder 1: *Things to do at Check-in*
- Binder 2: *Things to do on Every Day of the Stay*
- Binder 3: *Things to do at Check-out*

If you managed both the AC and the TV, AC instructions were chopped in half across all three binders.

In modern functional React with Hooks, staff uses **feature-based rule cards**:
- Rule Card A (Climate Control): *"Whenever target temperature is X, set AC to X. Whenever temperature changes or guest leaves, turn off the old setting."*
- Rule Card B (Smart TV): *"Whenever guest name is Y, display Y on TV. When leaving, clear the screen."*

Hooks organize your code by **what external resource is being synchronized**, rather than **what arbitrary time bucket it is**.

---

## 3. How It Actually Works — The Full Explanation

React executes component lifecycles through a two-step engine architecture powered by React Fiber: the **Render Phase** and the **Commit Phase**, followed by the **Passive Effects Phase**.

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. RENDER PHASE (Pure computation — Pausable, abortable, no DOM side-effects) │
│    - Calls Component function (or class render())                      │
│    - Calculates Virtual DOM tree & reconciles diffs against previous Fiber│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. COMMIT PHASE (Synchronous DOM mutations)                           │
│    - React updates actual host DOM nodes                               │
│    - Synchronously invokes useLayoutEffect / componentDidMount/Update  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Browser paints screen pixels)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. PASSIVE EFFECTS PHASE (Post-paint asynchronous execution)           │
│    - React runs useEffect cleanup functions for changed dependencies   │
│    - React executes new useEffect setup functions                      │
└────────────────────────────────────────────────────────────────────────┘
```

### The Three Fundamental Phases

Every component instance goes through three lifecycle stages:

1. **Mounting:** The component is evaluated for the first time, its Fiber node is constructed, real DOM nodes are created and appended to the document, and setup effects run.
2. **Updating:** Triggered by changes to `props`, `state`, or consumed `context`. React re-evaluates the component, reconciles differences with the previous tree, applies minimal patches to the real DOM, and re-synchronizes effects whose dependencies changed.
3. **Unmounting:** The component is removed from the React hierarchy. React removes its real DOM nodes and executes all registered cleanup callbacks.

---

### Class Components: Imperative Time-Based Lifecycles

In React class components, lifecycle management was imperative. You wrote explicit hook methods that React invoked at specific points in time:

- **`constructor(props)`:** Initializes local state and binds method handlers before the component mounts.
- **`static getDerivedStateFromProps(props, state)`:** A rare, pure static method that calculates state updates derived directly from incoming props before rendering.
- **`render()`:** The mandatory pure function returning the JSX structure. Must never perform side effects or mutate state.
- **`componentDidMount()`:** Executes immediately after the initial commit. Safe for DOM manipulations, network requests, and external subscriptions.
- **`shouldComponentUpdate(nextProps, nextState)`:** Performance optimization gate returning a boolean. If `false`, React skips rendering this subtree.
- **`getSnapshotBeforeUpdate(prevProps, prevState)`:** Runs immediately before DOM mutations are committed. Reads layout information (e.g., scroll position) to pass to `componentDidUpdate`.
- **`componentDidUpdate(prevProps, prevState, snapshot)`:** Runs immediately after an update is committed to the DOM. Requires manual conditional checks (`if (prevProps.id !== this.props.id)`) to avoid infinite loops when updating state.
- **`componentWillUnmount()`:** Executes immediately before the component is destroyed. Used for tearing down subscriptions and timers.

---

### Functional Components: Declarative State Synchronization

Modern React replaces time-based lifecycle methods with **effects that synchronize the outside world with the current state snapshot**.

Instead of thinking "I want this code to run on mount," you think:
> *"I want this external system (WebSocket, DOM event, fetch call) to stay synchronized with this specific set of reactive values."*

```tsx
useEffect(() => {
  // 1. SETUP: Synchronize external system to current state/props snapshot
  const connection = chatApi.connect(roomId);

  // 2. CLEANUP: Undo previous synchronization before re-running or on unmount
  return () => {
    connection.disconnect();
  };
}, [roomId]); // 3. DEPENDENCY ARRAY: Re-sync whenever roomId changes
```

#### How Effect Execution Timing Works:
1. **On First Render (Mount):** Component renders $\rightarrow$ DOM is updated $\rightarrow$ Browser paints $\rightarrow$ Setup function executes.
2. **On Re-render (Update):** Component renders $\rightarrow$ DOM is updated $\rightarrow$ Browser paints $\rightarrow$ **Previous cleanup function executes** with old values $\rightarrow$ **New setup function executes** with new values.
3. **On Destruction (Unmount):** Component removed $\rightarrow$ DOM nodes detached $\rightarrow$ **Final cleanup function executes**.

---

### `useEffect` vs `useLayoutEffect`

The browser rendering pipeline determines the difference between these two hooks:

```
DOM Mutations Committed  -->  [useLayoutEffect runs synchronously]  -->  Browser Paints Pixels  -->  [useEffect runs asynchronously]
```

- **`useEffect` (Passive Effect):** Executes *asynchronously after* the browser has painted the screen. It avoids blocking user interaction or smooth animations. Use this for data fetching, subscriptions, logging, and state synchronization.
- **`useLayoutEffect` (Layout Effect):** Executes *synchronously immediately after* React updates the DOM, but *before* the browser paints the new pixels. Use this only when you must measure DOM dimensions (e.g., tooltip width, scroll offsets) or mutate the DOM directly to prevent visual flickering before the user sees the frame.

---

### React 18 StrictMode: Dev-Mode Double Invocation

In React 18+ development mode (`<React.StrictMode>`), React automatically simulates an immediate unmount and remount cycle:

$$\text{Mount (Setup)} \longrightarrow \text{Unmount (Cleanup)} \longrightarrow \text{Remount (Setup)}$$

This intentional stress-test ensures that:
1. Your effect setups have matching cleanup functions.
2. Your setup and cleanup logic are **idempotent** (running setup twice produces the exact same outcome as running it once).
3. The component can safely support future React features like concurrent offscreen rendering.

---

## 4. Real Code — See It Working

### 1. The Class Component Pattern (Imperative & Fragmented)

Notice how the WebSocket subscription logic is split across three disconnected lifecycle methods:

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

  state: ChatState = {
    messages: [],
  };

  // Phase 1: Mount - Establish connection
  componentDidMount() {
    this.connectToSocket(this.props.roomId);
  }

  // Phase 2: Update - Check if roomId changed, reconnect
  componentDidUpdate(prevProps: ChatProps) {
    if (prevProps.roomId !== this.props.roomId) {
      // Must manually clean up previous connection before starting new one
      this.disconnectSocket();
      this.setState({ messages: [] });
      this.connectToSocket(this.props.roomId);
    }
  }

  // Phase 3: Unmount - Sever connection to prevent memory leak
  componentWillUnmount() {
    this.disconnectSocket();
  }

  private connectToSocket(roomId: string) {
    this.socket = new WebSocket(`wss://chat.example.com/rooms/${roomId}`);
    this.socket.onmessage = (event) => {
      this.setState((prev) => ({
        messages: [...prev.messages, event.data],
      }));
    };
  }

  private disconnectSocket() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  render() {
    return (
      <div>
        <h3>Room: {this.props.roomId}</h3>
        <ul>
          {this.state.messages.map((msg, idx) => (
            <li key={idx}>{msg}</li>
          ))}
        </ul>
      </div>
    );
  }
}
```

---

### 2. The Modern Hook Pattern (Declarative & Cohesive)

The same WebSocket feature condensed into a single self-contained synchronization block:

```tsx
import React, { useState, useEffect } from 'react';

interface ChatProps {
  roomId: string;
}

export function ChatRoomHook({ roomId }: ChatProps) {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    // Setup: Runs on mount AND whenever roomId changes
    const socket = new WebSocket(`wss://chat.example.com/rooms/${roomId}`);

    socket.onmessage = (event: MessageEvent) => {
      setMessages((prev) => [...prev, event.data]);
    };

    // Cleanup: Runs before re-synchronizing (if roomId changes) AND on unmount
    return () => {
      socket.close();
      setMessages([]); // Reset state for the incoming room
    };
  }, [roomId]); // Explicit synchronization dependency

  return (
    <div>
      <h3>Room: {roomId}</h3>
      <ul>
        {messages.map((msg, idx) => (
          <li key={idx}>{msg}</li>
        ))}
      </ul>
    </div>
  );
}
```

---

### 3. Preventing Visual Flickering with `useLayoutEffect`

When calculating DOM dimensions to position a floating tooltip, `useEffect` causes a visible flash (tooltip jumps from default position to calculated coordinates). `useLayoutEffect` fixes this by measuring and updating the DOM before the browser paints:

```tsx
import React, { useState, useRef, useLayoutEffect } from 'react';

export function Tooltip({ targetRef, text }: { targetRef: React.RefObject<HTMLElement>; text: string }) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    // Runs synchronously after DOM mutations, BEFORE the browser paints pixels to the screen
    if (targetRef.current && tooltipRef.current) {
      const targetRect = targetRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      // Position tooltip centered directly above target button
      setCoords({
        top: targetRect.top - tooltipRect.height - 8,
        left: targetRect.left + (targetRect.width - tooltipRect.width) / 2,
      });
    }
  }, [targetRef]);

  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        background: '#1e293b',
        color: '#fff',
        padding: '4px 8px',
        borderRadius: '4px',
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  );
}
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are the three fundamental phases of the React component lifecycle?**

A component transitions through three phases:
1. **Mount:** The initial creation where React renders the component for the first time, constructs the internal Fiber tree, inserts host DOM nodes into the document, and runs layout and passive effects.
2. **Update:** Occurs when the component's `props`, internal `state`, or subscribed `context` change. React re-executes the component function, diffs the new Virtual DOM against the previous Fiber tree (reconciliation), patches changed DOM nodes, and runs cleanup/setup cycles for effects whose dependencies changed.
3. **Unmount:** The component is removed from the DOM hierarchy. React unbinds DOM nodes, tears down refs, and executes all registered effect cleanup functions to free system resources.

---

**Q: What is the difference between the Render Phase and the Commit Phase in React?**

React divides its internal work into two distinct phases:
- **Render Phase:** React executes component functions (or class `render()` methods) to compute what the UI should look like and calculates the diff between the old and new Fiber trees. This phase is purely computational, has no observable DOM side-effects, and can be paused, split across frames, or aborted entirely by React's Concurrent Scheduler.
- **Commit Phase:** React takes the computed diff and synchronously writes the changes to the real browser DOM. This phase cannot be interrupted. Once DOM nodes are updated, React synchronously runs `useLayoutEffect` (and class `componentDidMount`/`componentDidUpdate`), allows the browser to paint the screen, and then triggers `useEffect` callbacks asynchronously during the passive effects phase.

---

**Q: Why is `useEffect` not a 1:1 replacement for `componentDidMount`, `componentDidUpdate`, and `componentWillUnmount`?**

Class lifecycle methods were imperative, time-bound hooks (`componentDidMount` = "code to run on day 1"). Hooks represent **declarative state synchronization**. 
- `useEffect` with an empty dependency array (`[]`) runs after the initial mount, but unlike `componentDidMount`, it runs *asynchronously after paint* rather than synchronously after commit. In development under React 18 StrictMode, it also runs twice.
- An effect with dependencies does not just represent "update"; it represents maintaining synchronization between an external system and a specific snapshot of values over time.
- The return function of `useEffect` runs not just on unmount, but *before every single re-execution of the effect* whenever dependencies change, ensuring the previous state's connection is dismantled before a new one is wired up.

---

**Q: When should you choose `useLayoutEffect` over `useEffect`?**

You should default to `useEffect` for 99% of use cases (data fetching, subscriptions, timers, analytics) because it runs asynchronously after the browser paints, keeping your application responsive and unblocking frame rendering.

Use `useLayoutEffect` only when your side effect directly inspects or mutates the layout of the DOM before the user sees the screen. Common scenarios include:
- Measuring DOM element dimensions (`getBoundingClientRect()`, `offsetWidth`, `scrollHeight`) to calculate positions for tooltips, modals, or popovers.
- Synchronizing scroll positions before paint.
- Performing immediate DOM mutations that would otherwise cause an unpleasant visual flicker/layout jump if deferred until after the browser paint.

---

**Q: Why does React 18 StrictMode run effects twice in development?**

React 18 StrictMode intentionally mounts your component, immediately runs its cleanup, and remounts it in development mode (`Mount -> Cleanup -> Mount`). 

React does this to expose two critical production failure modes:
1. **Missing Cleanup Logic:** If an effect opens a subscription or attaches an event listener without cleaning it up, the developer will immediately notice duplicate API requests, duplicated event handlers, or memory leaks in development.
2. **Non-Idempotent Effects:** Future React features (like Offscreen/Activity API) preserve component state while detaching DOM nodes when a tab or view is hidden, and re-attaching them when revisited. Double-invoking effects verifies that your component can cleanly leave and re-enter the DOM without corrupting state.

---

**Q: How do you prevent race conditions and memory leaks when fetching data inside `useEffect`?**

When fetching data inside `useEffect`, fast-changing props (like rapid user search keystrokes or ID changes) can cause network responses to return out of order—a slow request for Query A might resolve *after* a fast request for Query B, leaving the UI showing stale data.

To prevent this, use native `AbortController` in the cleanup function:

```tsx
useEffect(() => {
  const controller = new AbortController();

  async function fetchData() {
    try {
      const response = await fetch(`/api/user/${userId}`, { signal: controller.signal });
      const data = await response.json();
      setUser(data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    }
  }

  fetchData();

  // Cleanup aborts in-flight request if userId changes or component unmounts
  return () => {
    controller.abort();
  };
}, [userId]);
```

---

**Q: Why must the Render Phase be pure and free of side effects?**

In React's Fiber architecture, rendering can be paused, restarted, or discarded before changes ever reach the DOM (for example, if higher-priority user input interrupts low-priority background rendering, or during React 18 StrictMode double-rendering).

If you trigger side effects in the render body (such as sending HTTP requests, writing to external stores, mutating global variables, or updating state):
- Those side effects will fire multiple times unpredictably.
- State updates in render trigger infinite render loops (`Too many re-renders`).
- Discarded renders will still leave mutated global state behind, causing memory leaks and UI desynchronization.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Stale Closures and Lying in the Dependency Array

**The Mistake:** Suppressing the `react-hooks/exhaustive-deps` linter rule with comments to prevent an effect from re-running.

```tsx
// ❌ BROKEN: Lying to React about dependencies
useEffect(() => {
  const interval = setInterval(() => {
    // count is captured from the initial render scope (always 0)
    console.log('Current count:', count);
    setCount(count + 1); // 0 + 1 = 1 forever!
  }, 1000);

  return () => clearInterval(interval);
}, []); // Lying: 'count' is used inside but omitted here!
```

**Why it fails:** JavaScript closures capture variable values from the exact render pass in which they were created. If you omit `count` from dependencies, the interval closure permanently references `count` as `0`. Every second it sets state to `0 + 1 = 1`.

**The Fix:** Use functional state updaters when the new state depends on the previous state, or include all referenced reactive values in the dependency array:

```tsx
// ✅ FIXED: Functional updater removes dependency on count variable
useEffect(() => {
  const interval = setInterval(() => {
    setCount((prev) => prev + 1); // Reads latest state at runtime
  }, 1000);

  return () => clearInterval(interval);
}, []);
```

---

### Trap 2: Using `useEffect` to Compute Derived State

**The Mistake:** Syncing props to local state using an effect.

```tsx
// ❌ ANTI-PATTERN: Double-render and redundant state
function OrderSummary({ items }: { items: Item[] }) {
  const [totalPrice, setTotalPrice] = useState(0);

  useEffect(() => {
    const total = items.reduce((sum, item) => sum + item.price, 0);
    setTotalPrice(total);
  }, [items]);

  return <div>Total: ${totalPrice}</div>;
}
```

**Why it fails:** This causes an unnecessary extra render cycle. React renders with stale `totalPrice`, commits the DOM, fires the effect, calls `setTotalPrice`, and is forced to perform a second full re-render.

**The Fix:** Calculate derived state directly during the render phase. If the computation is expensive, wrap it in `useMemo`:

```tsx
// ✅ FIXED: Calculated synchronously during render (1 render cycle, zero lag)
function OrderSummary({ items }: { items: Item[] }) {
  const totalPrice = useMemo(() => {
    return items.reduce((sum, item) => sum + item.price, 0);
  }, [items]);

  return <div>Total: ${totalPrice}</div>;
}
```

---

### Trap 3: Missing Cleanup on Event Listeners and Subscriptions

**The Mistake:** Attaching window or document listeners inside an effect without returning a removal callback.

```tsx
// ❌ LEAK: Attaches listener on every render without cleaning up
useEffect(() => {
  function handleResize() {
    console.log('Window width:', window.innerWidth);
  }
  window.addEventListener('resize', handleResize);
  // Missing return () => window.removeEventListener('resize', handleResize);
});
```

**Why it fails:** Every time the component re-renders, a new listener is added to `window`. After 50 re-renders, 50 duplicate functions run on every resize event, severely degrading browser performance. When the component unmounts, the listeners remain attached indefinitely.

**The Fix:** Always return an explicit cleanup function that tears down every resource created during setup.

---

### Trap 4: Fetching Data Without Abort Handling (Race Condition)

**The Mistake:** Assuming responses from asynchronous requests will arrive in the order they were triggered.

```tsx
// ❌ RACE CONDITION: Fast clicks trigger out-of-order resolution
useEffect(() => {
  fetchUserDetails(userId).then((data) => {
    setUser(data);
  });
}, [userId]);
```

**Why it fails:** If a user rapidly clicks from User 1 to User 2, request 1 might take 800ms while request 2 takes 200ms. Request 2 completes and displays User 2. 600ms later, Request 1 finally resolves and overwrites the screen with User 1's data.

**The Fix:** Use a cleanup flag or `AbortController` to ignore obsolete responses:

```tsx
// ✅ FIXED: Ignore stale responses
useEffect(() => {
  let isCurrent = true;

  fetchUserDetails(userId).then((data) => {
    if (isCurrent) {
      setUser(data);
    }
  });

  return () => {
    isCurrent = false; // Invalidates this request if userId changes before resolution
  };
}, [userId]);
```

---

## 7. Compare With Related Concepts

| Concept Pair | Core Distinction | When to Use Which |
|---|---|---|
| **Class Lifecycles vs Hook Synchronization** | Class methods (`componentDidMount`, `componentDidUpdate`) organize logic by *time of execution*; Hooks (`useEffect`) organize logic by *the resource being synchronized*. | Use functional components and Hooks for all modern React development. Use class lifecycles only when maintaining legacy codebases or implementing Error Boundaries (`componentDidCatch`). |
| **`useEffect` vs `useLayoutEffect`** | `useEffect` runs asynchronously *after* the browser paints pixels. `useLayoutEffect` runs synchronously *before* the browser paints pixels. | Default to `useEffect` for 99% of effects (data fetching, events, subscriptions). Use `useLayoutEffect` only when reading DOM geometry (width, height, scroll position) to adjust layout without visual flicker. |
| **`useEffect` vs `useInsertionEffect`** | `useInsertionEffect` runs before DOM mutations are even attached to the Fiber tree (before `useLayoutEffect`). | `useInsertionEffect` is exclusively reserved for CSS-in-JS library authors (like styled-components or Emotion) to inject `<style>` tags before computing layout. Do not use in application code. |
| **Unmounting vs Hiding with CSS (`display: none`)** | Unmounting destroys the Fiber node, removes DOM elements, resets local state, and fires cleanup effects. CSS hiding (`display: none` or hidden attribute) keeps the component mounted in memory with state intact. | Unmount when a feature is completely inactive to free memory. Hide via CSS when the component holds expensive-to-recreate state (e.g., a complex rich-text editor or video player) that must retain state while temporarily offscreen. |
| **`useEffect` vs `useSyncExternalStore`** | `useEffect` manages generic asynchronous synchronization. `useSyncExternalStore` is a specialized, synchronous subscription hook for external data stores that prevents tearing in Concurrent React. | Use `useSyncExternalStore` when subscribing to non-React global stores, Redux/Zustand internals, or browser APIs like `navigator.onLine` and `window.matchMedia`. |

---

## 8. 🧠 The Memory Hook

> **Class components organized code by WHEN things happened (Mount, Update, Unmount); Hooks organize code by WHAT external system needs to be kept in sync.**
> 
> Every `useEffect` is a two-way synchronization contract: **Setup** wires the external world to the current state snapshot, and **Cleanup** provides the exact undo button to tear it down before the next change or departure.
