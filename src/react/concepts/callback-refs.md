# Callback Refs in React

## 1. Why This Exists — The Problem First

Almost every React developer starts by reaching for `useRef` whenever they need to touch a DOM node. You create a ref object, attach it with `<div ref={myRef} />`, and access `myRef.current` in an effect or an event handler. For simple actions like focusing an input when a button is clicked, that works fine.

Then you run into real-world production layouts and everything falls apart.

Imagine you have an accordion or modal that mounts conditionally: `{isOpen && <ModalContent ref={modalRef} />}`. You need to measure the modal's exact rendered height the moment it appears so you can animate it or position a floating tooltip relative to it. You write a `useEffect`:

```tsx
useEffect(() => {
  if (modalRef.current) {
    const height = modalRef.current.getBoundingClientRect().height;
    setHeight(height);
  }
}, []); // ❌ modalRef.current is null on initial render because isOpen is false!
```

When your component first mounts, `isOpen` is `false`, so `modalRef.current` is `null`. Later, when the user clicks a button and `isOpen` flips to `true`, React re-renders and attaches the DOM element to `modalRef.current`. But mutating a ref's `.current` property does **not** trigger a re-render, and `useEffect` has no idea `modalRef.current` changed. Your effect never re-runs, and your measurement never happens.

Now consider another common nightmare: you are rendering a dynamic chat feed or search result list with 50 items. You need to hold a reference to each item so you can scroll to any arbitrary message by ID. You cannot call `useRef` inside a loop or `.map()` because that violates the fundamental Rules of Hooks.

This is why **Callback Refs** exist. Instead of handing React a passive box (`{ current: null }`) and hoping you check it at the right time, you hand React a **function**. React promises to call that function the exact millisecond the DOM node is attached to the page or detached from it.

---

## 2. The Analogy — Make It Obvious

Think of `useRef` like a **physical mailbox** outside your house. 

Letters (DOM nodes) get dropped inside the mailbox by the mail carrier (React). But the mailbox never makes a sound. If you want to know whether a package has arrived, you have to walk outside and physically open the lid (`myRef.current`). If you look too early, the box is empty. If a package arrives five minutes after you checked, you have no idea it is sitting there until you happen to check again.

A **Callback Ref** is like an **automated doorbell camera with direct courier handoff**.

Instead of dropping the package in a silent box, the courier walks up to your door and rings the bell. The moment they arrive, they hand the package directly into your hands (`callback(domNode)`). You immediately know what it is, how big it is, and what to do with it. When the package is recalled or picked up for return, the courier rings the bell again to take it away (`callback(null)` or cleanup).

You never have to poll, guess, or synchronize with a timer. You are notified immediately upon arrival and departure.

---

## 3. How It Actually Works — The Full Explanation

### The Core Mechanic
Instead of passing a ref object from `useRef()` to a JSX element, you pass a plain JavaScript function:

```tsx
<div ref={(node) => {
  // React calls this function when the DOM node is created or destroyed
}} />
```

During React's **Commit Phase**—after React has calculated the virtual DOM diff and physically mutated the browser's real DOM tree:
1. **On Mount / Update:** React calls your function and passes the underlying real DOM element as the argument: `callback(domNode)`.
2. **On Unmount:** React calls your function and passes `null` as the argument: `callback(null)`.

Because this callback executes synchronously during the commit phase before layout effects and passive effects fire, you are guaranteed that the DOM element is live, styled, and measurable in the document tree.

```
Render Phase (JSX evaluated)
       │
       ▼
Commit Phase (Real DOM nodes created/inserted)
       │
       ├──► React calls callback ref with: (domNode)
       │
       ├──► useLayoutEffect runs
       │
Browser Paint
       │
       ▼
Passive Effects (useEffect runs)
```

---

### The Inline Function Quirk (Why It Fires Twice)
A classic interview trap involves passing an inline arrow function directly in JSX:

```tsx
<div ref={(node) => console.log('Ref called with:', node)} />
```

If the parent component re-renders (due to state change or prop update), you will notice something surprising in your console logs:
1. `Ref called with: null`
2. `Ref called with: <div>...</div>`

Why does React call it with `null` first if the `<div>` never left the screen?

On every render, JavaScript creates a **new function instance** in memory for `(node) => ...`. React compares the previous `ref` prop to the new `ref` prop by reference (`oldRef !== newRef`). Because the memory addresses differ, React cannot assume the new function has the same closures or logic as the old one. 

To prevent memory leaks and stale closures, React cleanly detaches the old ref by calling the old function with `null`, and then attaches the new ref by calling the new function with the DOM node.

To prevent this double-invocation on re-renders, you wrap the callback in `useCallback`:

```tsx
const setNodeRef = useCallback((node: HTMLDivElement | null) => {
  if (node) {
    // Setup / measurement
  } else {
    // Cleanup
  }
}, []); // Stable identity: only fires on actual mount (node) and unmount (null)
```

With a stable function identity, React skips the detach/attach cycle across standard re-renders.

---

### Dynamic Lists of Refs (The `Map` Pattern)
Because hooks cannot be called inside loops, you cannot create 20 distinct `useRef` instances for 20 list items. With a callback ref, you store all references inside a single `Map` held in a ref:

```tsx
const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

return (
  <ul>
    {items.map((item) => (
      <li
        key={item.id}
        ref={(node) => {
          if (node) {
            itemRefs.current.set(item.id, node);
          } else {
            itemRefs.current.delete(item.id);
          }
        }}
      >
        {item.label}
      </li>
    ))}
  </ul>
);
```

When an item mounts, it adds itself to the `Map`. When an item is deleted or filtered out, React passes `null` to that item's ref callback, which removes it from the `Map`. You get an up-to-date registry of every rendered DOM node with zero wasted memory.

---

### The React 19 Evolution: Cleanup Functions
Historically (React 16 through React 18), callback refs could not return a value. Cleanup had to be written imperatively inside the single callback by checking if `node === null`:

```tsx
// React 18 style:
const refCallback = (node) => {
  if (node) {
    // setup
  } else {
    // cleanup
  }
};
```

Starting in **React 19**, callback refs support returning a cleanup function, matching the familiar ergonomics of `useEffect`:

```tsx
// React 19 style:
<div
  ref={(node) => {
    const observer = new ResizeObserver((entries) => {
      console.log('Resized:', entries[0].contentRect);
    });
    observer.observe(node);

    // Return a cleanup function!
    return () => {
      observer.disconnect();
    };
  }}
/>
```

When you return a cleanup function in React 19, React automatically invokes it when the DOM element unmounts or when the ref callback identity changes. React will **not** call your callback ref with `null` if you return a cleanup function.

---

## 4. Real Code — See It Working

### Example 1: Reliable Node Measurement on Conditional Mount
Measuring a conditionally rendered element using `useCallback` ref to avoid missing initial layout:

```tsx
import React, { useState, useCallback } from 'react';

export function MeasuredTooltip() {
  const [show, setShow] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  // useCallback guarantees the ref function identity stays stable
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      // The DOM node is guaranteed to be in the document and styled
      const rect = node.getBoundingClientRect();
      setDimensions({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
  }, []); // Empty deps: function reference never changes

  return (
    <div style={{ padding: '24px' }}>
      <button onClick={() => setShow((prev) => !prev)}>
        {show ? 'Hide Info Box' : 'Show Info Box'}
      </button>

      {show && (
        <div
          ref={measureRef}
          style={{
            marginTop: '16px',
            padding: '16px',
            background: '#1e293b',
            color: '#f8fafc',
            borderRadius: '8px',
          }}
        >
          <p>I am a dynamically rendered box.</p>
          {dimensions && (
            <p style={{ fontSize: '12px', color: '#38bdf8' }}>
              Measured Size: {dimensions.width}px × {dimensions.height}px
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

---

### Example 2: Dynamic List Scrolling via Ref Map
Managing an arbitrary number of DOM references without breaking the Rules of Hooks:

```tsx
import React, { useRef } from 'react';

interface LogEntry {
  id: string;
  message: string;
  level: 'info' | 'warn' | 'error';
}

const SAMPLE_LOGS: LogEntry[] = Array.from({ length: 40 }, (_, i) => ({
  id: `log-${i + 1}`,
  message: `Server event log message #${i + 1}`,
  level: i % 10 === 0 ? 'error' : i % 5 === 0 ? 'warn' : 'info',
}));

export function LogViewer() {
  // Store all dynamic element references in one stable Map
  const rowRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  const scrollToLog = (id: string) => {
    const targetNode = rowRefsMap.current.get(id);
    if (targetNode) {
      targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetNode.style.outline = '2px solid #38bdf8';
      setTimeout(() => {
        targetNode.style.outline = 'none';
      }, 1500);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button onClick={() => scrollToLog('log-1')}>Jump to First (#1)</button>
        <button onClick={() => scrollToLog('log-20')}>Jump to Middle (#20)</button>
        <button onClick={() => scrollToLog('log-40')}>Jump to Last (#40)</button>
      </div>

      <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #334155' }}>
        {SAMPLE_LOGS.map((log) => (
          <div
            key={log.id}
            ref={(node) => {
              // Callback ref populates or cleans up the Map on mount/unmount
              if (node) {
                rowRefsMap.current.set(log.id, node);
              } else {
                rowRefsMap.current.delete(log.id);
              }
            }}
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid #1e293b',
              transition: 'outline 0.2s ease',
            }}
          >
            <strong>[{log.id}]</strong> {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### Example 3: Attaching a `ResizeObserver` (React 18 vs React 19 pattern)

```tsx
import React, { useCallback, useRef } from 'react';

export function AutoResizingCard() {
  // Storing observer instance across cleanup in React 18
  const observerRef = useRef<ResizeObserver | null>(null);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      // Element attached: instantiate and observe
      observerRef.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          console.log('Width changed to:', entry.contentRect.width);
        }
      });
      observerRef.current.observe(node);
    } else {
      // Element detached (node is null): disconnect to prevent leaks
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        resize: 'horizontal',
        overflow: 'auto',
        border: '1px solid #64748b',
        padding: '16px',
      }}
    >
      Drag bottom-right corner to resize me and check console logs.
    </div>
  );
}
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a callback ref in React, and how does its execution lifecycle work?**

A callback ref is a function passed to an element's `ref` prop instead of an object created by `useRef`. React invokes this callback during the commit phase of rendering. When the element is mounted and its real DOM node is attached to the page, React calls `refCallback(domNode)`. When the element unmounts, React calls `refCallback(null)` (or invokes the returned cleanup function in React 19). Because it runs synchronously after DOM mutations but before browser paint and passive effects, it gives you immediate, guaranteed access to the physical DOM node.

---

**Q: Why does an inline callback ref execute twice on every component re-render?**

When you pass an inline arrow function like `ref={(el) => ...}`, JavaScript allocates a new function object in memory on every single render. React checks `prevRef !== nextRef`. Because the function identity changed, React assumes the old ref callback may hold stale closures or obsolete handlers. To be safe, React first executes the previous callback with `null` to tear down any old references, and then executes the new callback with the current DOM node to initialize the new reference. You can eliminate this behavior by stabilizing the callback's identity with `useCallback(..., [])`.

---

**Q: Why is a callback ref superior to `useEffect` with `useRef` when measuring DOM elements?**

With `useRef`, you pass an object `{ current: null }`. If the element is rendered conditionally (e.g., `{isOpen && <Modal ref={myRef} />}`), `myRef.current` starts as `null`. When `isOpen` becomes `true`, React updates `myRef.current` to point to the DOM node. However, mutating a ref does not trigger a re-render or notify React's dependency tracker. A `useEffect` with `[]` or `[myRef.current]` will either not run when the node mounts, or fail linting rules because refs are not valid effect dependencies. A callback ref with `useCallback` fires automatically the exact moment the element mounts, ensuring your measurement logic always runs without synchronization bugs.

---

**Q: How do you manage DOM refs for a dynamic, variable-length list of elements?**

You cannot call `useRef` inside a loop or `.map()` because React requires hook calls to remain in the exact same order on every render. Instead, you create a single ref holding a JavaScript `Map`: `const itemsRef = useRef<Map<string, HTMLElement>>(new Map());`. Inside the `.map()` loop, each item receives an inline callback ref: `ref={(node) => { if (node) itemsRef.current.set(id, node); else itemsRef.current.delete(id); }}`. This gives you safe O(1) access to any rendered element by key without violating the Rules of Hooks or leaking memory when items are removed.

---

**Q: What changed with callback refs in React 19?**

In React 18 and earlier, callback refs were strictly `(node: T | null) => void`. Cleanup was handled exclusively by checking if `node === null`. In React 19, callback refs can return a cleanup function, identical to `useEffect`: `ref={(node) => { setup(); return () => cleanup(); }}`. When a cleanup function is returned, React executes it when the element is removed from the DOM or when the ref callback identity changes, rather than calling the callback with `null`.

---

**Q: Can calling `setState` inside a callback ref cause an infinite render loop?**

Yes, if you use an **unstable inline callback ref** and update state unconditionally. If you write `ref={(node) => { if (node) setWidth(node.offsetWidth); }}`, the state update triggers a component re-render. The re-render creates a new inline ref function. React calls the old one with `null`, then calls the new one with the node. The new callback calls `setWidth` again, causing another re-render, creating an infinite loop. To fix this, either wrap the callback in `useCallback` with stable dependencies, or check whether the measured value actually changed before calling `setState`.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Setting State Inside an Inline Callback Ref
* **The misconception:** Assuming you can quickly grab element dimensions inline without extra boilerplate.
* **Why it breaks:** An inline function gets a new memory reference on every render. React calls it with `null`, then with the node. If your callback calls `setState` without stabilizing the function with `useCallback`, you trigger an instant infinite re-render loop.
* **The fix:** Always wrap measurement callbacks in `useCallback(..., [])` and ensure state is only set if the value actually differs.

```tsx
// ❌ CRASH: Infinite loop on render
<div ref={(node) => {
  if (node) setHeight(node.getBoundingClientRect().height);
}} />

// ✅ FIXED: Stable callback identity
const measureRef = useCallback((node: HTMLDivElement | null) => {
  if (node) {
    setHeight(node.getBoundingClientRect().height);
  }
}, []);

<div ref={measureRef} />
```

---

### Trap 2: Putting `ref.current` in a `useEffect` Dependency Array
* **The misconception:** Believing `useEffect(() => { ... }, [myRef.current])` will re-run when the DOM node attaches.
* **Why it breaks:** Mutating `ref.current` is an in-place property change on a plain JavaScript object. React does not use Proxies or property setters to track ref mutations. React's effect scheduler has no way of knowing `ref.current` changed, so the effect will not run when a conditional child mounts.
* **The fix:** Replace `useRef` + `useEffect` with a `useCallback` ref.

---

### Trap 3: Memory Leaks in Dynamic List Ref Maps
* **The misconception:** Storing elements in a `Map` or array on mount, but ignoring the `null` unmount call.
* **Why it breaks:** When items are removed from a list (e.g. filtered or deleted), DOM nodes unmount. If you only write `itemsMap.current.set(id, node)` when `node` is truthy, your `Map` retains references to detached DOM nodes forever, causing major memory leaks.
* **The fix:** Always implement the `else` branch:

```tsx
ref={(node) => {
  if (node) {
    itemsMap.current.set(item.id, node);
  } else {
    itemsMap.current.delete(item.id); // 👈 Critical cleanup
  }
}}
```

---

### Trap 4: Forgetting the `null` Guard in Pre-React 19 Code
* **The misconception:** Assuming the `node` parameter is always an `HTMLElement`.
* **Why it breaks:** On unmount, React passes `null`. If your callback starts with `node.focus()` or `node.getBoundingClientRect()` without checking `if (!node) return;`, your app will throw an uncaught `TypeError: Cannot read properties of null` during unmount.
* **The fix:** Always verify `if (node !== null)` before accessing properties.

---

## 7. Compare With Related Concepts

| Concept | What It Is | When To Use |
| :--- | :--- | :--- |
| **Callback Ref** | A function passed to `ref` that React calls with the DOM node on mount and `null` / cleanup on unmount. | When you must react immediately to DOM attachment/detachment (measuring dimensions, attaching observers, collecting dynamic list refs). |
| **Object Ref (`useRef`)** | A plain mutable object `{ current: T }` that persists across renders without triggering re-renders. | Passive DOM access needed inside user events (e.g., clicking a button to call `.focus()`, `.play()`, or reading scroll position). |
| **`useEffect` with DOM** | An asynchronous hook running after paint to synchronize with external systems. | Listening to global window/document events, fetching data, or setting timers once the full component tree is already painted. |
| **`useImperativeHandle`** | A hook used inside child components to customize the ref handle exposed to parent components. | When authoring reusable UI components (like a custom Video Player or Modal) that want to expose a restricted public API (e.g., `.open()`, `.close()`) rather than the raw DOM node. |

---

## 8. 🧠 The Memory Hook

An object ref (`useRef`) is a **mailbox** you have to remember to check; a callback ref is a **doorbell** that rings the exact millisecond a DOM node arrives or leaves.

