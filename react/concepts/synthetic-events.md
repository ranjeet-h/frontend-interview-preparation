# Synthetic Events and Event Delegation in React

## 1. Why This Exists — The Problem First

Imagine building a high-traffic e-commerce dashboard in vanilla JavaScript. You have a table with 5,000 product rows, each containing edit, delete, and duplicate buttons. If you attach direct event listeners to every single button, your application instantiates 15,000 listener closures in memory. As rows mount, update, and unmount during live filtering, your garbage collector struggles with memory churn. If a developer forgets to unbind a listener before removing a node, you create a memory leak.

On top of the memory overhead, browsers historically couldn't agree on how events should behave. Firefox used `e.which` while Internet Explorer used `e.keyCode`. Chrome provided `e.target` while older browsers gave you `e.srcElement`. Scrolling and mouse-wheel events delivered wildly inconsistent delta values depending on whether your user was on Safari, Windows Edge, or macOS Chrome.

Writing defensive normalization code inside every single handler across a massive codebase is exhausting and error-prone. React created the Synthetic Event system to solve both problems simultaneously: it delivers a single, perfectly normalized W3C-compliant event interface across every browser, and it routes all events through an automatic event delegation architecture.

## 2. The Analogy — Make It Obvious

Think of React's event system as an **International Airport Central Dispatch and Customs Hub**.

Imagine thousands of travelers arriving from dozens of different countries (raw browser events originating from Safari, Chrome, Firefox, or mobile WebViews). Each traveler speaks a different dialect and carries a differently formatted domestic identity card with inconsistent fields.

Instead of every individual shop, restaurant, and boarding gate in the terminal hiring its own multilingual security guard at every doorway (direct element listeners):

1. **The Single Checkpoint:** All travelers pass through a single centralized customs checkpoint at the main terminal entrance (the React root container).
2. **The Universal Travel Pass:** The customs officer inspects the domestic ID and immediately hands the traveler a standardized international travel document with identical fields across all languages (`SyntheticEvent`). The original domestic passport is tucked neatly into a back pocket (`e.nativeEvent`) in case someone needs to inspect raw stamps.
3. **The Flight Manifest Walk:** The central dispatcher checks the traveler's ticket destination. Instead of checking every room randomly, dispatch follows the exact terminal corridor map from the main gate down to the specific seat, and then walks back up (Fiber tree capturing and bubbling).
4. **The Old Recycling Rule vs The Modern Rule:** Under strict austerity rules years ago (React 16 event pooling), customs officers immediately wiped the international pass clean with whiteout the moment the traveler reached their seat so the plastic badge could be reused for the next passenger. If a passenger tried to read their pass five minutes later in a coffee shop, it was completely blank unless they explicitly paid for a permanent stamp (`e.persist()`). In modern airports (React 17+), paper is cheap: every traveler gets their own permanent digital pass that never gets erased.

## 3. How It Actually Works — The Full Explanation

React's event system operates in three distinct phases: event normalization, root-level delegation, and Fiber tree traversal.

**Event Normalization with SyntheticEvent**

When a user interacts with the screen (such as clicking a button or typing into an input), the browser engine generates a native DOM event. React intercepts this event and wraps it in a `SyntheticEvent` instance.

This wrapper implements the standard W3C UI Events specification. Whether a user clicks in Safari on iOS or Firefox on Linux, properties like `e.target`, `e.currentTarget`, `e.bubbles`, `e.preventDefault()`, and `e.stopPropagation()` work identically. If you ever need browser-specific or cutting-edge properties that React does not normalize (such as `TouchEvent.touches` or `e.dataTransfer`), React preserves the untouched original browser event on `e.nativeEvent`.

**Event Delegation at the Root Container**

React does not attach `addEventListener` calls to individual DOM nodes when you write `<button onClick={handleClick}>`. Instead, React registers a single listener for each known event type at the top of your React tree.

In React 16 and earlier, React attached these top-level listeners to the global `document` node. This created severe bugs in multi-version architectures, micro-frontends, or nested React widgets: an inner React app calling `e.stopPropagation()` could not stop outer React apps or host-page listeners from firing, because all events had to travel all the way up to `document`.

In React 17 and later, React attaches event listeners directly to the DOM container element where your app is mounted (`rootNode`, the element passed to `ReactDOM.createRoot(container)`). This ensures:
- Multiple React applications on the same page live in complete isolation.
- An event stopped inside one React root never leaks into an enclosing React root.
- React plays nicely with other frameworks or vanilla DOM libraries embedded in the page.

React registers listeners for both the capturing phase and the bubbling phase at this root container.

**Fiber Tree Event Propagation Simulation**

Because listeners live at the root and not on the actual DOM elements, native DOM bubbling alone cannot trigger your React component handlers in the expected order. React simulates capturing and bubbling through your component tree using the Fiber hierarchy:

1. **Native Bubble to Root:** The user clicks a `<button>`. The native browser event bubbles up the DOM until it hits the React root container listener.
2. **Fiber Target Lookup:** React extracts the native event target (`e.target`) and reads its internal Fiber reference (stored on the DOM node under properties like `__reactFiber$...`). This identifies the exact leaf component in React's virtual tree where the click occurred.
3. **Dispatch Path Construction:** React walks up the Fiber tree from the target component to the root, collecting all matching handlers along the ancestry: capture handlers (`onClickCapture`) on the way down, and bubble handlers (`onClick`) on the way up.
4. **Synthetic Execution:** React creates the `SyntheticEvent` object and executes the collected capture handlers from root to target, followed by the bubble handlers from target back to root.
5. **Propagation Control:** When a handler calls `e.stopPropagation()`, React sets an internal flag on the `SyntheticEvent`. React immediately halts its traversal loop across the Fiber ancestry, preventing parent component handlers from running.

**The Removal of Event Pooling in React 17**

In React 16 and earlier, React used a technique called Event Pooling to reduce garbage collection overhead. React allocated a single pool of `SyntheticEvent` instances. When an event finished firing, React cleared all properties on the object (setting them to `null`) and returned the instance to the pool for reuse.

This caused notorious bugs whenever a developer tried to read an event property inside an asynchronous operation like a `setTimeout`, `Promise`, or `requestAnimationFrame`:

```javascript
// React 16 Trap:
function handleChange(e) {
  setTimeout(() => {
    // Threw TypeError or logged null because `e` was recycled!
    console.log(e.target.value);
  }, 100);
}
```

To prevent the wipe in React 16, you had to manually call `e.persist()`.

In React 17, the React team removed event pooling entirely. Modern JavaScript engines optimize short-lived object allocations so effectively that recycling event objects provided negligible performance benefits while causing endless developer confusion. Today, `SyntheticEvent` objects are garbage-collected normally. You can read event properties inside asynchronous callbacks without calling `e.persist()`. `e.persist()` still exists on the interface, but it is a complete no-op.

**Understanding the Three Event Targets**

- `e.target`: The deepest DOM element where the event physically originated (e.g., an `<i>` icon clicked inside a button).
- `e.currentTarget`: The DOM element whose React handler is currently executing (the `<button>` that holds the `onClick` prop).
- `e.nativeEvent`: The actual browser-level event object (`MouseEvent`, `KeyboardEvent`, `InputEvent`) created by the browser engine.

## 4. Real Code — See It Working

Here are real-world examples demonstrating event delegation, target resolution, asynchronous access, and interaction with native listeners.

**Example 1: Handling Nested Elements with `target` vs `currentTarget`**

When building complex interactive components like buttons with icons and badges, clicking the child element must not break data extraction.

```tsx
import React from "react";

interface ActionButtonProps {
  actionId: string;
  label: string;
  icon: string;
  onAction: (id: string) => void;
}

export function ActionButton({ actionId, label, icon, onAction }: ActionButtonProps) {
  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    // event.target can be the <span> or <i> depending on where the user's cursor landed
    // event.currentTarget is ALWAYS the <button> that owns this onClick handler
    const button = event.currentTarget;
    const boundId = button.getAttribute("data-action-id");

    if (boundId) {
      onAction(boundId);
    }
  }

  return (
    <button
      type="button"
      data-action-id={actionId}
      onClick={handleClick}
      className="action-btn"
    >
      <i className={`icon-${icon}`} aria-hidden="true" />
      <span className="btn-label">{label}</span>
    </button>
  );
}
```

**Example 2: Asynchronous Event Access in Modern React (No `e.persist()` needed)**

In modern React (17+), event objects retain their data inside async callbacks, debounce timers, and API pipelines.

```tsx
import React, { useState } from "react";

export function SearchFilter() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("idle");

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    // In React 16, e.target.value inside setTimeout would crash because e was wiped.
    // In React 17+, event pooling is gone. This is completely safe:
    setStatus("typing...");

    setTimeout(() => {
      // Accessing event properties asynchronously works out of the box
      console.log("Async log of search value:", e.target.value);
      setStatus(`Saved: "${e.target.value}"`);
    }, 400);

    setQuery(e.target.value);
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        placeholder="Type to search..."
      />
      <p>Status: {status}</p>
    </div>
  );
}
```

**Example 3: Event Delegation with Dynamic Lists and Stopping Propagation**

Demonstrating how parent containers handle delegated actions while child elements selectively stop propagation.

```tsx
import React from "react";

interface FileItem {
  id: string;
  name: string;
}

interface FileListProps {
  files: FileItem[];
  onSelectFile: (id: string) => void;
  onDeleteFile: (id: string) => void;
}

export function FileList({ files, onSelectFile, onDeleteFile }: FileListProps) {
  return (
    <ul className="file-list">
      {files.map((file) => (
        <li
          key={file.id}
          onClick={() => onSelectFile(file.id)}
          className="file-row"
        >
          <span>{file.name}</span>

          <button
            type="button"
            onClick={(e) => {
              // Prevents the row's onSelectFile from firing when clicking Delete
              e.stopPropagation();
              onDeleteFile(file.id);
            }}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a SyntheticEvent in React, and why does React use it instead of raw DOM events?**

A `SyntheticEvent` is React's cross-browser wrapper around the native browser event object. It adheres to the W3C UI Events specification, ensuring identical property names, event methods, and behavior across Chrome, Safari, Firefox, Edge, and mobile WebViews.

React uses Synthetic Events for two fundamental architectural reasons:
1. **Cross-Browser Consistency:** It eliminates browser-specific bugs and inconsistencies (e.g., standardizing mouse wheel deltas, key codes, and event propagation behaviors).
2. **Unified Event Delegation:** By wrapping native events into synthetic equivalents, React can capture events at the root container and simulate capturing and bubbling phases across the virtual Fiber tree rather than relying on direct DOM listener attachments.

**Q: How did event delegation change between React 16 and React 17?**

In React 16 and earlier, React attached all top-level event listeners to the global `document` object. In React 17 and later, React attaches event listeners to the root DOM container where the React application is mounted (`ReactDOM.createRoot(container)` or `ReactDOM.render(..., container)`).

This change was made to solve critical issues when embedding multiple React trees on the same page (such as micro-frontends or gradual React migration shells). In React 16, if an inner React tree called `e.stopPropagation()`, the event had already bubbled to `document`, which could trigger listeners in an outer React application or global scripts. In React 17+, stopping propagation inside an inner React container stops the event at that container's boundary, keeping micro-frontends completely isolated.

**Q: What was Event Pooling in React, why was it removed, and what is `e.persist()`?**

Event Pooling was a memory optimization in React 16 and earlier. React allocated a shared pool of `SyntheticEvent` objects. When an event handler finished executing synchronously, React cleared all properties on the event object (`e.target = null`, `e.type = null`, etc.) and returned the instance to the pool to prevent garbage collection spikes.

If you needed to access event properties inside an asynchronous callback (such as `setTimeout`, a Promise resolution, or an async/await block), the properties would be `null`. To retain the event, you had to call `e.persist()`, which detached the event object from the pool.

In React 17, event pooling was completely removed because modern JavaScript engines handle short-lived object allocations with negligible overhead, and pooling was one of the biggest sources of confusion for React developers. In React 17+, `e.persist()` is a no-op kept purely for backwards compatibility.

**Q: What is the exact difference between `e.target`, `e.currentTarget`, and `e.nativeEvent`?**

`e.target` is the deepest DOM element where the event originated (the actual node that was clicked, focused, or hovered).

`e.currentTarget` is the DOM element that has the React event handler attached to it. During event bubbling, `e.target` remains constant, while `e.currentTarget` always points to the component element currently handling the event.

`e.nativeEvent` is the raw browser-generated event instance underneath the synthetic wrapper. It provides direct access to underlying browser-specific properties and methods that React's synthetic wrapper does not expose directly.

**Q: How does React simulate event bubbling across the component tree?**

When a user triggers an event on a DOM node, the native event bubbles up through the real DOM until it reaches the React root container listener.

React catches the event at the root and checks the native `e.target`. Using internal properties on that DOM node (`__reactFiber$...`), React locates the corresponding Fiber node in the virtual DOM. React then walks up the Fiber tree to the root, constructing a synthetic dispatch path.

React then iterates through this path twice: first executing all capture handlers (`on[Event]Capture`) from the root down to the target Fiber, and second executing all bubble handlers (`on[Event]`) from the target Fiber back up to the root. If any handler calls `e.stopPropagation()`, React breaks the traversal loop, halting subsequent handlers in the synthetic path.

**Q: What happens when you call `e.stopPropagation()` in React vs `e.nativeEvent.stopImmediatePropagation()`?**

Calling `e.stopPropagation()` on React's `SyntheticEvent` instructs React to stop its synthetic traversal of the Fiber tree. It prevents parent React component event handlers from firing. However, because the native event has already bubbled up through the real DOM to reach React's root listener, `e.stopPropagation()` does not prevent native DOM listeners attached directly to child or ancestor elements outside React from running.

Calling `e.nativeEvent.stopImmediatePropagation()` stops other native event listeners attached to the current DOM node from executing. If you attach a native listener to the document, native `stopPropagation` and React's synthetic `stopPropagation` operate at different stages of the event lifecycle.

**Q: Why does returning `false` from a React event handler not prevent the browser default behavior?**

In older libraries like jQuery or inline HTML attributes (`onclick="return false"`), returning `false` automatically called both `preventDefault()` and `stopPropagation()`.

React strictly adheres to standard W3C event conventions. Returning `false` from a React event handler does nothing. To prevent default browser actions (such as navigating a link or reloading a page on form submission), you must explicitly invoke `e.preventDefault()`.

## 6. The Traps — What Goes Wrong

**Trap 1: Reading `e.target` Instead of `e.currentTarget` on Nested Elements**

When you place an icon, badge, or SVG inside a button, clicking the button often registers the SVG or `<span>` as `e.target`.

```tsx
// ❌ BROKEN: If user clicks the inner icon, e.target is the <i> tag, which lacks dataset.id
function ProductCard({ id }: { id: string }) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const target = e.target as HTMLElement;
    console.log(target.dataset.id); // undefined when clicking the icon!
  }

  return (
    <button data-id={id} onClick={handleClick}>
      <i className="icon-cart" />
      <span>Add to Cart</span>
    </button>
  );
}

// ✅ FIXED: Use e.currentTarget to always reference the element holding the onClick prop
function ProductCardFixed({ id }: { id: string }) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const button = e.currentTarget;
    console.log(button.dataset.id); // Always correctly returns the id
  }

  return (
    <button data-id={id} onClick={handleClick}>
      <i className="icon-cart" />
      <span>Add to Cart</span>
    </button>
  );
}
```

**Trap 2: Assuming `e.stopPropagation()` Stops Native Listeners Outside React**

Because React 17+ listeners live on the root container, native event listeners attached to DOM elements inside the React tree will execute *before* React's root listener ever intercepts the event.

If you have a native `document.addEventListener("click", handleGlobalClick)` (for example, to close a modal or dropdown), calling `e.stopPropagation()` inside a React button handler will not stop the native listener if that native listener was attached to a child DOM element directly, or if the event bubbles past the React root to `document`.

To synchronize React events with document-level popover closers, attach your document listener using React's synthetic event system or use `ref.contains(e.target)` guards inside your global handler.

**Trap 3: Passing Form Submit Handlers Without `e.preventDefault()`**

A classic mistake in single-page applications is submitting a form without calling `e.preventDefault()`.

```tsx
// ❌ BROKEN: Triggers a full browser reload and loses all in-memory client state
function LoginForm() {
  function handleSubmit(e: React.FormEvent) {
    // Missing e.preventDefault()
    loginUser();
  }
  return <form onSubmit={handleSubmit}><button type="submit">Log in</button></form>;
}

// ✅ FIXED: Explicitly prevent browser default GET/POST navigation
function LoginFormFixed() {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    loginUser();
  }
  return <form onSubmit={handleSubmit}><button type="submit">Log in</button></form>;
}
```

**Trap 4: Assuming Event Pooling Still Applies in Modern React**

Many developers still defensively copy properties (`const value = e.target.value`) or call `e.persist()` before entering async logic because of outdated React 15/16 tutorials.

While copying primitive values (`const value = e.target.value`) remains clean practice for clarity, believing that `e.target` will be wiped to `null` in React 17+ is incorrect. Do not add `e.persist()` to modern codebases.

## 7. Compare With Related Concepts

| Concept | What It Is | Key Difference | When to Use |
|---|---|---|---|
| **SyntheticEvent vs Native DOM Event** | React's W3C wrapper vs the raw browser event object | `SyntheticEvent` normalizes cross-browser differences and Fiber propagation; native events represent the raw browser engine event | Use `SyntheticEvent` everywhere in React; use `e.nativeEvent` only when accessing non-standard browser properties |
| **`e.target` vs `e.currentTarget`** | Event originator vs Handler owner | `e.target` is the innermost clicked DOM element; `e.currentTarget` is the element where your React handler is attached | Use `e.currentTarget` to read attributes from the component with the listener; use `e.target` when inspecting the exact clicked child |
| **`e.preventDefault()` vs `e.stopPropagation()`** | Action blocker vs Propagation blocker | `preventDefault()` stops default browser behavior (form reload, link click); `stopPropagation()` stops React event bubbling up the Fiber tree | Use `preventDefault()` for forms/links; use `stopPropagation()` for nested interactive elements (e.g. delete button inside a clickable card) |
| **React 16 Delegation vs React 17+ Delegation** | Root listener at `document` vs Root listener at mount container | React 16 delegated everything to `window.document`; React 17+ delegates to the `rootNode` container | React 17+ enables safe multi-root apps and micro-frontend embedding |

## 8. 🧠 The Memory Hook

React doesn't attach listeners to your elements — it catches everything at your root container, normalizes the event into a standard W3C wrapper, and walks your virtual Fiber tree to simulate bubbling. In modern React (17+), pooling is dead, events live forever, and `e.currentTarget` is always your handler's true anchor.
