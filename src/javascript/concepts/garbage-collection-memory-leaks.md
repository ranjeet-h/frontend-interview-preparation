# Garbage Collection and Memory Leaks

## 1. Why This Exists — The Problem First

A single-page app can open and close the same screen all day without a page reload. The screen disappears, but the tab becomes slower and its memory grows after every cycle. The confusing part is that “no longer visible” does not mean “no longer reachable.”

Garbage collection reclaims objects that the running program can no longer reach. A memory leak is application data that is no longer useful but is still reachable through a live reference, such as a global cache, timer callback, event listener, subscription, closure, or detached DOM node. The browser cannot infer business intent; if a path remains, the object must be treated as live.

The interview answer starts here: garbage collection is automatic reclamation based on reachability, while a leak is unintended retention over time. Cleanup code breaks the ownership path; it does not synchronously force collection.

## 2. The Analogy — Make It Obvious

Imagine a theatre striking a temporary stage set. Removing the set from the stage makes it invisible to the audience. That is like removing a DOM element from its parent.

Now imagine the props manager has kept a key to the set in a permanent inventory drawer. The set is off stage, but the theatre still has a path to it. The cleanup crew can discard only sets with no remaining key. That is garbage collection: it can reclaim unreachable objects, not objects that are merely unused according to a human.

In the mapping, the inventory drawer is a long-lived array or `Map`, the key is a strong reference, the temporary set is the short-lived view, and teardown is the work that removes the key, listener, timer, or subscription. A `WeakMap` is a special inventory whose object keys do not keep those keys alive solely because of the entry; it is not a general-purpose weak container for every value.

## 3. How It Actually Works — The Full Explanation

JavaScript engines manage objects using reachability analysis. The implementation details and collection schedule belong to the engine, but the developer-facing rule is stable:

```text
live root → reference → object
```

If a live root can follow references to an object, that object is reachable and cannot be reclaimed. If every path to it is gone, it becomes eligible for collection. “Eligible” does not mean that memory is freed on that exact line; collection is scheduled by the engine and may happen later.

The root set includes long-lived program and host state such as global objects, active execution state, scheduled work, and browser-managed objects. The exact retaining path is what DevTools should confirm. A cycle does not keep itself alive: two objects that reference each other but are unreachable from the roots can be collected.

Common retention paths in frontend applications include:

- A `window` or `document` listener whose callback closes over a component, DOM node, or large response.
- An interval that keeps its callback alive until `clearInterval` is called.
- A pending timeout that retains its callback until it runs or is cancelled.
- A subscription, observer, worker message handler, or third-party widget that outlives the view that created it.
- An unbounded array, `Map`, or singleton cache that keeps appending old data.
- A closure intentionally returned for a counter, or accidentally retained by a long-lived registry.
- A DOM node removed from the document but still referenced by JavaScript.

Removing a node, hiding it, and releasing it are different operations. `element.remove()` disconnects the node from its parent; `display: none` leaves it in the document; deleting the last strong reference makes collection possible. Setting one variable to `null` helps only if that variable was the last path.

Cleanup should follow ownership: stop work, unregister the exact listener or abort its signal, unsubscribe, disconnect observers, remove strong cache entries, and destroy widgets. A heap snapshot can then verify whether repeated mount-and-unmount cycles still leave instances retained. A leak diagnosis needs repeated growth and a retaining path, not merely one object appearing in one snapshot.

## 4. Real Code — See It Working

Save this complete file as `memory-leak-fixture.html` and open it in a browser. Click **Create leak** several times, then inspect the page with DevTools Memory. The removed panels remain reachable through `leakedPanels` and through the uncleaned `window` listeners. **Release leak** performs the matching cleanup; collection itself is not synchronous.

```html
<!doctype html>
<meta charset="utf-8" />
<title>Garbage collection and memory leak fixture</title>
<button id="leak">Create leak</button>
<button id="release">Release leak</button>
<output id="status" aria-live="polite">No panels created</output>
<main id="mount"></main>

<script>
  const mount = document.querySelector("#mount");
  const status = document.querySelector("#status");
  const leakedPanels = [];
  const cleanups = [];

  function createPanel() {
    const panel = document.createElement("section");
    panel.innerHTML = "<h2>Temporary report</h2><p>Resize the window.</p>";
    mount.append(panel);

    const onResize = () => {
      // The callback closes over panel, so the listener retains panel.
      panel.dataset.width = String(window.innerWidth);
    };
    window.addEventListener("resize", onResize);

    return {
      panel,
      cleanup() {
        window.removeEventListener("resize", onResize);
        panel.remove();
      },
    };
  }

  document.querySelector("#leak").addEventListener("click", () => {
    const instance = createPanel();
    instance.panel.remove();
    leakedPanels.push(instance.panel);
    // The listener and array are both intentional leak owners for this demo.
    cleanups.push(instance.cleanup);
    status.textContent = `${leakedPanels.length} removed panel(s) retained`;
  });

  document.querySelector("#release").addEventListener("click", () => {
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
    leakedPanels.length = 0;
    status.textContent = "Owners released; reclamation may happen later";
  });
</script>
```

This complete second fixture shows weak metadata. Save it as `weak-metadata-fixture.html` and open it independently:

```html
<!doctype html>
<meta charset="utf-8" />
<title>WeakMap metadata fixture</title>
<button id="run">Create and remove node</button>
<output id="status" aria-live="polite"></output>

<script>
  const metadataByNode = new WeakMap();
  const status = document.querySelector("#status");

  document.querySelector("#run").addEventListener("click", () => {
    const node = document.createElement("button");
    node.textContent = "Temporary action";
    metadataByNode.set(node, { source: "temporary-toolbar" });
    node.remove();
    status.textContent =
      "The node is no longer used here; WeakMap is not enumerable and collection is not observable synchronously.";
  });
</script>
```

For a production investigation, repeat the same open/close flow, force collection when DevTools allows it, take a baseline heap snapshot, repeat the flow, take another snapshot, compare retained instances, and follow **Retainers** back to the owner that should have released them.

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does garbage collection decide what to reclaim?**

It follows references from the engine's live roots. Reachable objects are retained; objects with no path from those roots become eligible for collection. The engine chooses when and how to perform the collection.

**Q: Is every unused object a memory leak?**

No. An object is a leak when the application no longer needs it but a live reference retains it, especially when the retained set grows across repeated lifecycles. A bounded cache or a returned counter closure can be intentional retention.

**Q: Why does removing a DOM node not necessarily free it?**

Removal disconnects the node from its document parent. A cache, closure, listener, observer, or widget can still reach it, so it remains retained until those paths are released and collection later occurs.

**Q: How do event listeners and timers cause leaks?**

Long-lived event targets and active timers retain their callbacks. If a callback closes over a short-lived view or data, that retained callback preserves the reference path until the listener is removed or the timer is cleared or completes.

**Q: When is `WeakMap` useful?**

Use it for metadata keyed by objects when the metadata table should not, by itself, extend the key object's lifetime. It has object keys only, is not enumerable, has no `size`, and does not notify application code when a key is collected.

**Q: How would you prove a frontend memory leak?**

Reproduce one controlled lifecycle repeatedly, compare heap snapshots after comparable collection points, identify objects that accumulate, and inspect their retaining paths. Fix the owning cleanup and repeat the same measurement.

## 6. The Traps — What Goes Wrong

**“Garbage collection prevents memory leaks.”** Garbage collection removes unreachable objects. It cannot know that a reachable cache entry or listener is no longer useful.

**“Setting everything to `null` immediately frees memory.”** It removes only the references you clear, and collection is not synchronous. Find every owner in the retaining path.

**“Every detached DOM node is a leak.”** A detached node can be intentional or merely awaiting collection. Repeated growth and the retaining path establish the diagnosis.

**“`WeakMap` makes values weak.”** Only object keys receive weak-key behavior. A node stored as a value in an ordinary `Map` is still strongly retained.

**“A new function removes the old listener.”** `removeEventListener("resize", () => {})` creates a different function. Keep the original callback, match the event type and capture setting, or use an `AbortSignal` for teardown.

**“One heap snapshot proves a leak.”** One snapshot is a point-in-time graph. Compare consistent before-and-after flows and inspect retainers to separate normal allocations from unintended retention.

## 7. Compare With Related Concepts

| Concept | What it means | Practical distinction |
|---|---|---|
| Garbage collection | Reclamation of unreachable objects | Break strong references; do not expect immediate freeing |
| Memory leak | Unneeded memory retained over time | Confirm repeated growth and the retaining owner |
| Detached DOM node | Node removed from its document parent | It is a symptom to investigate, not automatic proof of a leak |
| Hidden DOM node | Node still in the document but not visibly rendered | Use when preserving the live node is intentional |
| `Map` | Strongly retains keys and values | Add eviction or explicit deletion for bounded ownership |
| `WeakMap` | Weakly holds object keys | Use for object metadata that should not extend key lifetime |
| Heap snapshot | Point-in-time retained-object graph | Use comparison and retainers to locate ownership |
| Performance recording | Time series of tasks, allocations, and runtime activity | Use it for churn, jank, and timing rather than exact retainers |

## 8. 🧠 The Memory Hook — What Sticks

Removing a panel from the stage is not throwing it away. Garbage collection can clear only what has no remaining key. Find the key—listener, timer, closure, cache, subscription, or widget—remove it during teardown, and let the engine reclaim the now-unreachable objects later.
