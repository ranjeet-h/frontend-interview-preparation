# Heap Snapshots

## 1. Why This Exists — The Problem First

You close a modal, navigate away from a view, or refresh a search result, but the page gets heavier every time you repeat the same flow. Looking at the screen cannot tell you whether an old DOM subtree, listener closure, cache entry, or request result is still reachable.

A heap snapshot is evidence for that question. It is a point-in-time view of objects retained in the JavaScript heap and the references between them. By comparing snapshots before and after a repeatable flow, you can find objects that remain when the feature should have released them, then inspect the retaining path that keeps them reachable.

The important distinction is this:

- A snapshot shows what is retained at one moment; it does not, by itself, prove a leak.
- A leak is a lifetime problem: data that is no longer needed remains reachable through a live reference.
- A snapshot helps locate the retained data and the reference path. Your code and feature lifecycle explain whether that retention is actually wrong.

## 2. The Analogy — Make It Obvious

Imagine taking an inventory photograph of a warehouse. The photograph records which boxes are still inside and which shelf, rope, or conveyor connects each box to the loading dock. It does not show the whole history of how the boxes arrived.

In this analogy:

- The warehouse is the engine-managed heap.
- A box is an object, array, closure-related value, or DOM wrapper.
- The loading dock is a garbage-collection root: a long-lived starting point from which the engine can reach objects.
- A rope is a reference edge.
- A retaining path is the connected route from a root to the box you are investigating.
- A snapshot comparison is two inventory photographs with the same flow performed between them.

If a modal's DOM node is removed from the document but a long-lived listener still reaches a closure that reaches the modal, the modal is like a box whose visible shelf was dismantled but whose rope is still tied to the dock. Removing it from the screen is not the same as removing every path to it.

```text
baseline snapshot -> repeat the user flow -> collect eligible garbage when possible
                  -> second snapshot -> compare retained objects -> inspect retainers
```

## 3. How It Actually Works — The Full Explanation

Chrome DevTools' **Memory** panel can take a **Heap snapshot**. The snapshot is a static graph: nodes represent retained values and edges represent references or relationships. Useful details include an object's constructor/class, shallow size, retained size, and the references that lead to it.

The two size columns answer different questions:

- **Shallow size** is the memory attributed to the object itself.
- **Retained size** is the memory that could become collectible if that object were released, subject to the rest of the graph.

The graph is about reachability. A value can be useless to the product but still retained because a global cache, active listener, timer, subscription, closure, or other long-lived object can reach it. Conversely, two objects may point at each other without leaking if no live root can reach that isolated cycle.

A reliable investigation follows a controlled sequence:

1. Open the same page and put it in a known baseline state.
2. If the browser/DevTools setup offers garbage collection controls, use them consistently before the baseline and after the test flow. This reduces noise from temporary values; it does not make memory numbers perfectly deterministic.
3. Take Snapshot A.
4. Repeat one flow several times, such as opening and closing the same modal.
5. Return the page to its expected post-flow state, collect eligible garbage when possible, and take Snapshot B.
6. Use the comparison view to look for retained instances or growing groups associated with the flow.
7. Select a suspicious object and follow its **Retainers** or retaining path toward the root. The path tells you which cache, listener, closure, DOM reference, or other owner still reaches it.
8. Fix the owner lifecycle, repeat the exact flow, and compare again.

Do not treat a larger second snapshot as proof by itself. Browser startup, DevTools, normal caches, strings, and unrelated page activity can change the heap. Repetition, a stable scenario, comparison, and a retaining path turn a size change into a useful hypothesis.

A snapshot is also not the same tool as a Performance recording. A snapshot explains the retained object graph at a selected moment. A Performance recording is better for timing, long tasks, frame drops, and allocation activity over time. Choose the tool based on whether the question is “what is still retained?” or “when is work and allocation happening?”

## 4. Real Code — See It Working

Save this complete fixture as `heap-snapshot-fixture.html` and open it in Chrome. It intentionally contains a bad cleanup path and a good cleanup path. The page does not force a garbage collection or pretend that a browser will reclaim memory synchronously; the DevTools workflow is the experiment.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Heap snapshot fixture</title>
    <style>
      body { font: 16px system-ui, sans-serif; margin: 2rem; }
      button { margin: 0.25rem; }
      .modal { border: 1px solid #888; padding: 1rem; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <h1>Modal lifecycle fixture</h1>
    <button id="bad-open">Open bad modal</button>
    <button id="good-open">Open good modal</button>
    <main id="app"></main>

    <script>
      const app = document.querySelector("#app");

      function createModal(label) {
        const modal = document.createElement("section");
        modal.className = "modal";
        modal.innerHTML = `
          <strong>${label}</strong>
          <button type="button" data-close>Close</button>
          <p>${"retained row ".repeat(1000)}</p>
        `;
        app.append(modal);
        return modal;
      }

      function mountBadModal() {
        const modal = createModal("Bad cleanup");
        const onResize = () => {
          // The closure reaches modal, even after modal is removed.
          modal.dataset.width = String(window.innerWidth);
        };

        window.addEventListener("resize", onResize);
        modal.querySelector("[data-close]").onclick = () => modal.remove();
        // BUG: the window listener is never removed.
      }

      function mountGoodModal() {
        const modal = createModal("Good cleanup");
        const onResize = () => {
          modal.dataset.width = String(window.innerWidth);
        };

        window.addEventListener("resize", onResize);
        modal.querySelector("[data-close]").onclick = () => {
          window.removeEventListener("resize", onResize);
          modal.remove();
        };
      }

      document.querySelector("#bad-open").onclick = mountBadModal;
      document.querySelector("#good-open").onclick = mountGoodModal;
    </script>
  </body>
</html>
```

To investigate the intentional bad path:

1. Open DevTools, choose **Memory**, and take Snapshot A.
2. Open and close the bad modal several times.
3. Take Snapshot B after returning to the same page state. Use the available collection control consistently if your setup provides one.
4. Compare B with A. Search for the fixture's modal text or inspect detached DOM-related entries, then open the retaining path.
5. The useful question is not “is there a detached node?” It is “which `window` listener reaches the modal?”
6. Repeat the same steps with the good button. Its close path removes the exact `onResize` function that it registered, so the feature has an explicit ownership boundary.

The fixture is production-like in the relevant way: a long-lived browser target owns a callback, and the callback closes over feature-owned DOM. It is still a diagnostic fixture, not a promise about exact object counts or exact DevTools labels in every Chrome version.

## 5. The Interview Questions — All of Them, Done Properly

**What is a heap snapshot?**

It is a static DevTools capture of retained objects and reference relationships in the JavaScript heap at a point in time. It is used to investigate memory retention; one snapshot alone does not establish that a product bug is a leak.

**How do you use snapshots to investigate a suspected leak?**

Create a stable baseline, take Snapshot A, repeat one user flow, return to the expected state, take Snapshot B, compare the snapshots, and follow the retaining path for objects that remain unexpectedly. Then fix the owning lifecycle and repeat the same experiment.

**What is a retaining path?**

It is the chain of references from a live root or long-lived owner to the object being investigated. It explains why the object is still reachable. Breaking the correct owner reference is more useful than merely setting an unrelated local variable to `null`.

**What is a detached DOM node?**

It is a DOM node no longer connected to the active document tree. It can still remain retained when JavaScript has another live reference to it, such as a closure, cache entry, or listener. Detachment is a clue to investigate, not proof that every removed node leaks.

**Why compare snapshots instead of reading one?**

One snapshot describes a state and includes normal page noise. A comparison shows what changed across a controlled flow, making repeated retention easier to separate from objects that were merely present once.

**Shallow size or retained size: which should you inspect?**

Use shallow size to understand the object's own attributed memory. Use retained size to ask what memory may become collectible if that object were released. Neither number alone identifies the bug; the retaining path and expected ownership do.

**How is a heap snapshot different from an allocation timeline?**

A snapshot is a structural point-in-time graph. An allocation timeline or performance recording is time-oriented and helps show when allocation or runtime work occurs. Use the snapshot for “what retains this?” and the timeline/performance tools for “when does allocation or work happen?”

## 6. The Traps — What Goes Wrong

- **Declaring a leak from one large snapshot.** A large heap can be normal. Reproduce the same flow and compare snapshots.
- **Assuming removal from the DOM is cleanup.** `modal.remove()` changes the document relationship; it does not remove a listener registered on `window` or clear a cache entry.
- **Assuming collection is synchronous.** Releasing a reference makes an object eligible when no other path remains; it does not guarantee that the engine immediately reclaims or reports the memory.
- **Forcing collection inconsistently.** A manual collection control can reduce temporary-garbage noise, but it is a diagnostic aid, not a universal “make the number zero” button.
- **Following only the shortest-looking path.** An object can have more than one retaining path. Removing one reference is not enough if another live owner still reaches it.
- **Treating every detached node as a bug.** Inspect whether a live JavaScript reference retains it and whether the feature still intends to own it.
- **Confusing retained size with a leak.** A large retained subtree may be an intentional cache or active application state. Business lifetime still matters.
- **Using a snapshot to diagnose jank.** A snapshot can explain retained memory, but frame drops and long tasks require runtime timing evidence.

## 7. Compare With Related Concepts

| Concept | What it answers | Best use |
| --- | --- | --- |
| Heap snapshot | What objects and references are retained now? | Inspect object identity, sizes, and retainers. |
| Snapshot comparison | What remains or grows across this flow? | Isolate repeated retention against a baseline. |
| Performance recording / allocation timeline | When do work, allocation, and timing changes occur? | Investigate jank, long tasks, and runtime activity. |
| Shallow size | How much memory is attributed to this object itself? | Understand the object’s direct footprint. |
| Retained size | What could become collectible if this object were released? | Prioritize owners whose references keep subgraphs alive. |
| Memory leak | Is unused data still reachable longer than intended? | Decide whether retention violates the feature lifecycle. |
| Cache | Is retained data intentionally stored under a bounded or managed policy? | Distinguish expected retention from unbounded growth. |

The practical chain is: use a comparison to find a suspicious object, use its retaining path to identify the owner, then use the feature's lifecycle to decide whether that owner is correct.

## 8. 🧠 The Memory Hook — What Sticks

**A heap snapshot is a warehouse photograph; a retaining path is the rope keeping a box tied to the dock.** Compare the warehouse before and after the same user flow, then cut the rope owned by the feature—not merely the rope that is easiest to see.
