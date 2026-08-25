# Closures in Event Handlers

## 1. Why This Exists — The Problem First

A table row is rendered with an order ID, but the user clicks it seconds later. The click handler still needs to know which order was clicked. Passing that ID through a global variable is fragile: the next row can overwrite it, and multiple listeners can race to read it. A closure lets each handler keep the context it needs, but the same mechanism can make a handler use an old render's state or keep large data reachable for too long.

This matters in ordinary DOM listeners, delegated events, debounced callbacks, analytics hooks, and React components. The production question is not merely “does this function close over a value?” It is “which binding will it read when the event eventually fires, and how long will the listener keep that binding alive?”

## 2. The Analogy — Make It Obvious

Think of each row handler as a delivery envelope prepared for one package. When the row is created, the envelope is addressed with its row ID and handed to the browser's event desk. When a click arrives later, the desk opens that particular envelope and delivers the right ID to the handler. The envelope is the function; the address and helper functions inside it are the closed-over variables.

There is an important detail: the envelope can contain either a reference to a live notebook page or a photograph. In plain JavaScript, a handler that closes over one mutable `let` binding reads that binding's current contents. In React, each render creates a new set of bindings, so a handler from an earlier render behaves like a photograph of that render's values. Finally, if the event desk is a long-lived object such as `window`, it keeps the envelope registered until cleanup; anything reachable through the envelope can remain reachable too.

## 3. How It Actually Works — The Full Explanation

An event handler is just a function that will be called later. When JavaScript creates that function, the function retains access to the lexical environment where it was created. This retained access is the closure. The browser stores the function as a listener for a target and event type; when the event is dispatched, the browser calls the function, and normal lexical name lookup finds the outer bindings.

The closure does not automatically copy every outer value. It preserves access to bindings. In this example, both clicks read the same `count` binding, so the second click observes the mutation:

```js
let count = 0;
const button = document.querySelector("#increment");

button.addEventListener("click", () => {
  count += 1;
  console.log(count);
});
```

A different function invocation creates a different lexical environment. That distinction explains the classic loop bug. With `var`, all callbacks refer to one function-scoped binding that ends at `3`. With `let` in the loop header, JavaScript provides a distinct binding for each iteration, so each callback gets its own row number:

```js
for (var index = 0; index < 3; index += 1) {
  document.querySelector(`#row-${index}`).addEventListener("click", () => {
    console.log(index); // 3 for every click: one shared binding
  });
}

for (let index = 0; index < 3; index += 1) {
  document.querySelector(`#safe-row-${index}`).addEventListener("click", () => {
    console.log(index); // 0, 1, or 2: one binding per iteration
  });
}
```

Listener lifetime is separate from closure semantics. Removing an element from the document does not mean a listener registered on `window` or `document` is gone. If that long-lived target still reaches the handler, the handler can still reach its closed-over objects. A listener attached to a detached element may be collectible when the whole element/listener cycle is unreachable, so “every removed DOM node always leaks” is too strong. The reliable rule is to clean up listeners whose target outlives the UI that installed them.

Cleanup requires the same event type, the same function object, and the same capture flag. The passive, once, and other options do not need to match. Two identical arrow expressions create two different functions. An `AbortController` is useful when one operation owns several listeners because aborting its signal removes them together.

React adds a render boundary to the same rule. A component function runs again on every render, creating new bindings and new handler functions. A handler passed directly to JSX normally belongs to the current render. A native listener installed once, or a callback intentionally kept stable, can continue reading the binding from the render that created it. Use a complete dependency list when re-registering an effect, a functional state update when the next state depends on the previous state, or a ref when a stable listener must read the latest mutable value.

## 4. Real Code — See It Working

**Per-row context and exact cleanup**

```js
function bindRow(button, rowId) {
  const onClick = () => {
    console.log(`Opening order ${rowId}`);
  };

  button.addEventListener("click", onClick);

  return () => {
    // WHY: removeEventListener matches the exact function object registered above.
    button.removeEventListener("click", onClick);
  };
}

const stopListening = bindRow(document.querySelector("#order-42"), 42);
// Later, when the row is unmounted:
stopListening();
```

**One cleanup switch for a long-lived target**

```js
function watchPageClicks(pageName) {
  const controller = new AbortController();

  document.addEventListener(
    "click",
    (event) => {
      console.log({ pageName, target: event.target });
    },
    { signal: controller.signal },
  );

  return () => {
    // WHY: aborting releases this page-specific listener when the page changes.
    controller.abort();
  };
}

const stopTracking = watchPageClicks("checkout");
stopTracking();
```

**A React stale-value shape and two fixes**

```jsx
function SaveButton({ draft }) {
  const [savedCount, setSavedCount] = React.useState(0);

  function saveCurrentDraft() {
    saveDraft(draft);
    setSavedCount((count) => count + 1);
  }

  return <button onClick={saveCurrentDraft}>Save {savedCount}</button>;
}
```

The JSX handler above is recreated with the render, so it uses that render's `draft`. For a native listener that must stay registered once, keep the listener stable but update a ref:

```jsx
function NativeSaveButton({ draft }) {
  const draftRef = React.useRef(draft);
  draftRef.current = draft;

  const buttonRef = React.useRef(null);

  React.useEffect(() => {
    const button = buttonRef.current;
    const onClick = () => saveDraft(draftRef.current);

    button.addEventListener("click", onClick);
    return () => button.removeEventListener("click", onClick);
  }, []);

  return <button ref={buttonRef}>Save</button>;
}
```

The effect owns one listener and cleans it up. The ref is the deliberate mutable “latest value” channel; without it, the stable listener would keep reading the initial render's `draft`.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does an event-handler closure retain?**

It retains access to the lexical environment where the function was created. It does not necessarily freeze every variable into a copied value. If the same binding is later mutated, the handler can observe the mutation; if a new function invocation creates a new binding, an old handler cannot jump to that new environment.

**Q: Why can a click handler run after the function that created it has returned?**

The browser retains the handler as an event listener, and the handler retains access to its outer environment. The outer function call has finished, but the bindings needed by the reachable handler remain available. The call stack is gone; the closure's environment is not necessarily collectible.

**Q: Why do `var` loop handlers often print the same value?**

`var` creates one function-scoped loop binding. The callbacks run later, after the loop has finished, so they all read that one binding's final value. A `let` loop binding gives each iteration its own binding, which is why each handler sees its intended index.

**Q: Is every closed-over value a snapshot?**

No. A closure captures bindings, not a universal snapshot. A mutable object closed over by a handler can be changed through another reference, and a mutated `let` binding can be read with its new value. React often feels snapshot-like because each render creates new bindings; that is a consequence of separate render environments, not a different closure definition.

**Q: How do stale handlers appear in React?**

A handler registered only during an earlier render keeps that render's bindings. If it reads `count` or `draft`, later renders do not rewrite those old bindings. Re-register with correct dependencies, use a functional updater for state derived from prior state, or use a ref when a stable external listener must read the latest value.

**Q: Can an event listener cause a memory leak?**

Yes, especially when a long-lived target such as `window` or `document` retains listeners across mounts. Those listeners can keep their closures and reachable objects alive, and repeated mounting can also cause duplicate work. A detached DOM subtree is not automatically a leak if the entire graph is unreachable, but a global listener that still points into it is a real retention path.

**Q: Why does this cleanup fail?**

```js
window.addEventListener("resize", () => renderLayout());
window.removeEventListener("resize", () => renderLayout());
```

The two arrow expressions create different function objects. Store the first function in a variable and pass that same reference to `removeEventListener`, or register with an `AbortSignal` and abort the controller.

**Q: What is the difference between a closure and the event object?**

The closure is the handler's surrounding lexical context, such as `rowId` or `pageName`. The event object is the browser-created description of this particular dispatch, such as `target`, `currentTarget`, and pointer data. A handler can use both, but they answer different questions: “what context did this handler keep?” versus “what happened now?”

## 6. The Traps — What Goes Wrong

**Treating closures as frozen copies**

The wrong assumption is that defining a handler copies the current value. In plain JavaScript, the handler usually accesses the binding itself:

```js
let status = "draft";
const onClick = () => console.log(status);
status = "published";
onClick(); // "published"
```

The fix is to ask whether the handler is reading the same binding or an older invocation's binding. React renders commonly create the latter.

**Re-registering without cleanup**

Adding a `window` listener during every mount or update without removing the previous one causes duplicate callbacks and retention of old closures. The visible symptom may be “the request fires three times,” while the deeper issue is listener lifetime. Pair each registration with cleanup and make the ownership boundary explicit.

**Removing with a look-alike function**

Function identity matters. An identical body is not an identical reference, so cleanup silently fails. Keep a named `onClick` reference, return a cleanup function, or use an `AbortController` for grouped ownership.

**Assuming removing a node always leaks or always cleans up**

Neither blanket statement is accurate. A listener on an unreachable node can be collected with that node, but a listener on `document` can keep page-specific data reachable after the page is gone. Inspect the retaining path: identify the long-lived target first.

**Confusing `event.target` with `event.currentTarget`**

In delegated handling, `event.target` is the deepest element that initiated the event, while `event.currentTarget` is the element whose listener is currently running. A closure's `rowId` is separate from both. Use the captured ID when it is the authoritative application identity; use `currentTarget` when reading the listener's DOM element.

**Using a stable listener when the value must be current**

Stability and freshness are different requirements. A one-time native listener is not automatically connected to later React renders. Decide whether to recreate the listener when dependencies change or keep it stable and read a deliberately updated ref.

## 7. Compare With Related Concepts

**Event-handler closure vs timer closure**

Both are functions retained for later execution and both can access their creation environment. The difference is the trigger: an event listener can run many times for user-driven dispatches, while a timeout is normally scheduled for one timer firing. Use the same closure reasoning for both, but clean up repeating event listeners and cancel timers according to their separate lifetimes.

**Closure data vs `data-*` attributes**

A closure keeps JavaScript context private to the function; a `data-*` attribute stores metadata on the DOM where selectors, debugging tools, and other code can inspect it. Use a closure for behavior-specific state or helpers that should not be part of the markup. Use `data-*` when the identifier genuinely belongs to the DOM and event delegation needs to discover it from the clicked element.

**Closure vs event object**

The closure provides context from handler creation, while the event object provides facts from the current dispatch. Use the closure for stable application context such as the row's model ID, and use the event object for current pointer, keyboard, target, and propagation information.

**React render handler vs native long-lived listener**

A JSX handler is associated with the current React render and React manages its registration. A native listener on `window` or `document` is your responsibility and can outlive a component unless cleaned up. Use JSX handlers for events on rendered elements; use a native listener only when the browser target or event behavior requires it, with explicit ownership and cleanup.

## 8. 🧠 The Memory Hook — What Sticks

An event handler is an envelope handed to the browser: it carries access to the bindings from its birth environment and may be opened much later. Always ask two questions—“which envelope/render is this?” and “who still owns it?”—because the first explains stale values and the second explains leaks.
