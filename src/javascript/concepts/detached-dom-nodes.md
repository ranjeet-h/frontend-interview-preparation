# Detached DOM Nodes

## Detailed explanation
Detached DOM node is node removed from document but still referenced by JavaScript. Because reference remains reachable, garbage collector cannot free node or its subtree.

Common causes: caches, closures, event listeners, old component refs, third-party widgets.

## 1. One-line mental model
Detached DOM node is removed from page but still kept alive by JS reference.

## 2. Problem it solves
Explains memory leaks where DOM appears gone but heap keeps growing.

## 3. Core idea
- Node removed from DOM.
- JS still references it.
- GC cannot collect it.
- Subtree/listeners may stay alive.
- Clear references/listeners on cleanup.

## 4. Visual / analogy
Taking sign off wall but keeping it tied with rope.

```txt
document removed node
cache still points to node
node not collected
```

## 5. Minimal example

```js
let saved = document.querySelector("#panel");
saved.remove();
// saved still keeps node alive
```

## 6. Real-world example

```js
return () => {
  widget.destroy();
  widgetRef.current = null;
};
```

## 7. Common interview questions

#### What is a detached DOM node?
- **The Engine Mechanism (Why it behaves this way):** A detached DOM node is a DOM element (an instance of the C++ `Node` class in the browser's rendering engine, such as Blink or WebKit) that has been programmatically removed from the active document layout tree (e.g., via `element.remove()` or `parent.removeChild(element)`), but is still kept alive in memory because it remains reachable from the JavaScript runtime heap. In the V8 engine, standard garbage collection is based on *reachability analysis* starting from roots (like the global `window` object, the Call Stack frames, or active closure scopes). If a JavaScript object (such as a variable, a cache array, or a closure scope) holds a direct or indirect reference to a DOM node, the GC must assume the node is still in use and cannot reclaim it.
- **The Unforgettable Mental Model:** A balloon tied to a post in a park. If you cut the string tying the balloon to the post (removing the node from the document body), the balloon should float away (be garbage collected). But if you are still holding onto a separate string attached to the balloon in your hand (a JavaScript variable reference), the balloon remains trapped on the ground next to you.
- **The Trap:** Believing that because you removed a parent container from the DOM, all of its child elements are automatically freed. If your JavaScript code holds a reference to even a *single* deeply nested child span (e.g., `const span = parent.querySelector('span')`), the entire parent tree structure above that child is pinned in memory because the child maintains a C++ pointer to its parent (`parentNode`), preventing the GC from collecting *any* node in that entire subtree.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'A detached DOM node is a DOM element that has been disconnected from the active document tree, but remains pinned in memory because it is still reachable from the JavaScript execution context. Because the browser’s engine links DOM nodes bidirectionally to JS wrappers, holding a reference to any single element prevents the garbage collector from reclaiming that element, its children, or its entire parent DOM subtree.'"

#### How does it cause a memory leak?
- **The Engine Mechanism (Why it behaves this way):** A memory leak occurs when memory that is no longer needed by the application is not returned to the operating system. When a DOM node is detached but retained by JS, the browser engine must preserve the C++ DOM object representation, the matching JavaScript wrapper object in the V8 heap, and all associated inline styles, event listener structures, and children. In large applications (like Single Page Applications with infinite scrolling or heavy dashboard grids), creating, detaching, and leaking thousands of nodes (and their nested subtrees) during route changes causes the browser process's resident set size (RSS) memory to climb exponentially, eventually leading to extreme tab sluggishness and an "Out of Memory" crash.
- **The Unforgettable Mental Model:** Renting hotel rooms. When a guest checks out, they leave their luggage in the room, but the hotel fails to clear it. If this happens with every guest, eventually all rooms in the hotel (available heap memory) are packed full of old luggage (detached DOM nodes), and new guests can no longer be checked in, forcing the hotel to shut down (tab crash).
- **The Trap:** Storing references to elements inside global lookup tables or event handlers without clearing them. For example, a global caching system that indexes elements by ID to speed up access, but never deletes the entries when those elements are removed from the layout.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Detached DOM nodes cause memory leaks because they prevent the Garbage Collector from freeing the substantial memory footprints of the elements, their subtrees, and their styles. If we continually mount and unmount components—such as modals, grids, or charts—while keeping active JS references to them in caches, closures, or event handlers, our heap allocation will grow monotonically, leading to severe performance degradation and ultimate browser process crashes.'"

#### How do we find them in DevTools?
- **The Engine Mechanism (Why it behaves this way):** We detect detached DOM nodes by analyzing heap snapshots inside the **Chrome DevTools Memory Panel**:
  1. Open Chrome DevTools, navigate to the **Memory** tab, and select **"Heap snapshot"**.
  2. Take an initial snapshot, perform the suspicious action (e.g., opening and closing a modal multiple times), run Garbage Collection manually by clicking the trash can icon, and take a second snapshot.
  3. Filter the second snapshot's class list by typing **"Detached"** in the class filter box. Look for constructor names like `Detached HTMLDivElement` or `Detached HTMLElement`.
  4. Expand the entry and inspect the **Retainers panel** at the bottom. This displays the reachability chain, showing the exact JavaScript reference (such as a variable inside a closure, an item in an array, or a property on a global object) that is actively holding the node in memory.
- **The Unforgettable Mental Model:** A high-precision X-ray machine. When you scan the patient (heap snapshot), you see a foreign object inside them (a detached node). The retainer trace is like tracing the physical wire that runs from the foreign object directly to the battery pack (the JS root variable) keeping it powered.
- **The Trap:** Forgetting to run garbage collection manually before taking the second heap snapshot. Modern engines run GC lazily. If you don't force a GC cycle, you may see "detached" nodes that are actually just waiting for the next scheduled GC pass and are not true memory leaks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'To identify detached DOM nodes, we capture Heap Snapshots in Chrome DevTools before and after executing a component lifecycle. After manually forcing garbage collection, we filter the snapshot for the term `Detached`. DevTools will list all detached nodes. We then analyze the Retainers panel for the yellow-highlighted variables to trace the exact allocation path and identify the closure or global reference anchoring the node in memory.'"

#### How do we clean them up?
- **The Engine Mechanism (Why it behaves this way):** To clean up detached DOM nodes, you must break the reachability chain from the GC roots to the DOM object:
  1. **Nullify References:** Explicitly set any variable, object property, or array index holding the element to `null` or `undefined` (e.g., `elementRef = null`) once the element is removed.
  2. **Unbind Event Listeners:** Call `element.removeEventListener()` to release closures that reference the element, or rely on automated framework cleanup hooks (like React's `useEffect` cleanup or Vue's `onUnmounted`).
  3. **Use Weak References:** When caching elements or binding data, use `WeakMap` or `WeakSet`. Because `WeakMap` keys are held *weakly*, they do not prevent garbage collection: if a DOM node is removed from the document and has no other strong references, V8 automatically reclaims the node and sweeps the entry from the WeakMap.
- **The Unforgettable Mental Model:** Cutting the physical cables holding a suspension bridge. Once you cut the steel cables (nullify references and clear event handlers), the bridge immediately collapses and falls into the river (is swept away by GC).
- **The Trap:** Relying on `WeakMap` values instead of keys. In a `WeakMap`, only the *keys* are weakly referenced. If you store the DOM node as a *value* (e.g., `map.set(id, domNode)`), the reference remains strong, and the node will leak. You must store the DOM node as the *key* (e.g., `map.set(domNode, metadata)`).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'We clean up detached DOM nodes by systematically breaking the reference paths that link GC roots to our elements. This means nullifying DOM-referencing variables in our destructors, unbinding event listeners, and using `WeakMap` or `WeakSet` instead of strong objects for caching. This ensures that as soon as a node is removed from the DOM, it becomes unreachable and is instantly swept in the next garbage collection cycle.'"

#### How do event listeners relate to this?
- **The Engine Mechanism (Why it behaves this way):** Event listeners are a major source of detached DOM node leaks due to *closures*. When you call `element.addEventListener('click', handler)`, the browser engine creates a listener binding. If `handler` is a closure that captures outer variables (such as an active component instance or outer scope states), those outer variables are retained. Conversely, if a parent container is removed, but an outer global variable is still listening to a child's event, the event listener registry retains a reference to the child element to dispatch events. The reference from the event registry to the element's callback acts as a strong retainer link, keeping the node alive in memory even if it has been removed from the DOM.
- **The Unforgettable Mental Model:** A walkie-talkie connection. If you leave the walkie-talkie turned on and tuned to a channel (the event listener registration), the power remains active and drains the battery (retains memory), even if you have walked away from the walkie-talkie itself.
- **The Trap:** Creating anonymous inline event handlers on global elements, such as `window.addEventListener('resize', () => this.handleResize())` inside a component. When the component unmounts and its DOM is removed, the global `window` object still retains the anonymous function in its listener array, which in turn retains `this` (the component instance), causing the entire component DOM tree to leak.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Event listeners are a primary vector for detached DOM leaks because of closure retention. When an event listener is registered, the callback retains its lexical scope, which often includes references to parent components or sibling nodes. If we fail to remove listeners from global objects like `window` or `document` when a local element is destroyed, the global listener keeps the callback—and consequently the entire local DOM tree—alive in memory forever.'"

## 8. Active recall test

#### 1. Is the node in the document?
- **Explanation/Answer:** No, it has been removed from the active layout document tree, so it is no longer visible or rendered on the page.

#### 2. Why is it not collected?
- **Explanation/Answer:** Because a JavaScript object, variable, closure, or event listener registry still holds a reachable reference to it, preventing the Garbage Collector from freeing its memory.

#### 3. What references can retain it?
- **Explanation/Answer:** References stored in global variables, caches, class properties, closures, active call stack frames, or un-removed event listeners.

#### 4. How do we clean up a widget?
- **Explanation/Answer:** By calling its destroy method, unbinding all event listeners, and setting any DOM element references or instance pointers to `null`.

#### 5. What tool finds them?
- **Explanation/Answer:** The Chrome DevTools Memory Panel, specifically by capturing Heap Snapshots and searching for the class term `Detached`.

## 9. Mistakes / traps
- Assuming `.remove()` frees memory instantly.
- Keeping DOM nodes in global arrays.
- Forgetting third-party widget cleanup.
- Ignoring retained listeners.

## 10. Compare with related concepts
- **Detached node vs hidden node:** removed from document vs still in DOM.
- **Memory leak vs normal cache:** unintended retention vs bounded useful storage.
- **GC vs cleanup:** GC needs unreachable data; cleanup removes refs.

## 11. Summary from memory
Explain how removed modal DOM can leak through stored ref.

## 12. Spaced revision prompts
- 1 day: Define detached node.
- 3 days: Give leak example.
- 7 days: Cleanup widget refs.
- 14 days: Use heap snapshot idea.

