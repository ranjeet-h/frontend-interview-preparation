# Heap Snapshots

## Detailed explanation
Heap snapshots are Chrome DevTools memory captures showing objects currently retained in JavaScript heap. They help find leaks by comparing snapshots before and after user flows.

Senior frontend debugging uses snapshots to find retained DOM nodes, growing arrays/maps, closures, and unexpected references.

## 1. One-line mental model
Heap snapshot shows what memory is still reachable and why.

## 2. Problem it solves
Memory leaks need evidence of retained objects, not guesses.

## 3. Core idea
- Capture heap state.
- Repeat flow.
- Force GC if appropriate.
- Compare snapshots.
- Inspect retaining paths.

## 4. Visual / analogy
Heap snapshot = X-ray of memory.

```txt
Snapshot A -> run flow -> Snapshot B -> compare retained objects
```

## 5. Minimal example

```txt
Chrome DevTools -> Memory -> Heap snapshot -> Take snapshot
```

## 6. Real-world example

```txt
Open modal/close modal 20 times.
Take snapshots.
Look for retained detached modal nodes.
```

## 7. Common interview questions

#### What is heap snapshot?
- **The Engine Mechanism (Why it behaves this way):** When a heap snapshot is requested, the V8 engine pauses JavaScript execution, enters a safepoint, and traverses the entire memory heap starting from the "GC Roots" (such as the global execution context's lexical environment, active call stack frames, and DOM window/document hosts). It serializes every reachable object, closure, string, and DOM wrapper into a directed graph. Nodes in this graph represent allocated memory objects (with metadata like constructor type, ID, shallow size, and retained size), and edges represent pointer references (such as property names, scope variables, or internal engine slots).
- **The Unforgettable Mental Model:** A 3D constellation map where every star is an allocated object, and the light beams connecting them are reference pointers. Taking a snapshot is like freezing time and photographing this constellation to see which stars are anchored to the "Black Hole" (GC Roots) and cannot drift away.
- **The Trap:** Believing that a heap snapshot includes all allocated memory. It only includes memory managed by the V8 heap and specific DOM wrappers. It does not capture native browser C++ memory, raw GPU buffers, or memory allocated by web workers (unless snapshotted separately).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A heap snapshot is a serialized, static representation of all reachable objects and their reference relationships on the V8 heap at a single point in time. When triggered, the V8 engine stops the main thread to traverse the heap graph starting from the Garbage Collection Roots. By analyzing the snapshot, we can determine the exact retaining path keeping an object in memory, its individual shallow size, and its cumulative retained size."

#### How debug memory leak?
- **The Engine Mechanism (Why it behaves this way):** Debugging a leak relies on the mathematical comparison of two V8 heap graphs. The V8 garbage collector (GC) runs first (often forced manually) to clean up transient objects. Then, a baseline snapshot is taken. After executing the suspect user flow (e.g., opening and closing a view) and triggering another GC, a second snapshot is taken. By comparing Snapshot 2 against Snapshot 1 in the "Comparison" view, the engine filters for objects allocated *between* the snapshots that were not reclaimed. We trace their references upwards to find the specific root references holding them in memory.
- **The Unforgettable Mental Model:** Checking into a hotel. Snapshot 1 is the guest registry before a group arrives; Snapshot 2 is the registry after they checkout. If the guest count remains higher, someone forgot to check out. The retaining path tells you who paid for their room and won't let them leave.
- **The Trap:** Testing without triggering manual Garbage Collection. Transient objects that are *eligible* for GC but haven't been collected yet will show up in the comparison, leading to false positives. Always click the trash can icon in DevTools to force GC before taking each snapshot.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: To debug a memory leak systematically, I establish a clean baseline by forcing Garbage Collection and taking Snapshot 1. I then perform the suspicious user action multiple times to amplify the leak's signature, force Garbage Collection again to eliminate transient garbage, and take Snapshot 2. Using Chrome DevTools' Comparison view, I sort objects by the number of delta allocations, identify persisting objects that should have been freed, and inspect their Retainer tree to find the GC Root that is keeping them reachable."

#### What is retaining path?
- **The Engine Mechanism (Why it behaves this way):** The retaining path is the shortest chain of reference edges leading from a Garbage Collection Root (GC Root) to a target object in the V8 heap graph. In V8, an object is eligible for garbage collection if and only if it is completely unreachable from the root set. If even a single directed path of references (e.g., `window -> globalContext -> closureScope -> targetObject`) exists, the mark-and-sweep algorithm marks the target as active, preventing the sweep phase from reclaiming its memory block.
- **The Unforgettable Mental Model:** A safety lifeline connecting a diver (target object) to the boat deck (GC Root). No matter how deep or far the diver drifts, as long as the lifeline remains anchored to the boat, they cannot float away or be lost (garbage collected).
- **The Trap:** Retaining paths show multiple chains, but developers often focus on the wrong one. The engine displays the shortest path, but an object may be held by multiple reference chains. Severing one path might not free the object if another path is still active.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A retaining path is the chain of active references that connects an object in the heap to a Garbage Collection Root, such as the global object, active stack frames, or DOM elements. Since the V8 engine's GC operates via a mark-and-sweep algorithm, any object with an active retaining path is considered reachable and will not be garbage collected. Finding and breaking the specific link in this chain—often a global reference or an uncleaned event listener—is how we resolve the memory leak."

#### How find detached DOM nodes?
- **The Engine Mechanism (Why it behaves this way):** When a DOM node is removed from the active document tree using APIs like `element.remove()`, its reference from the C++ DOM tree is severed. However, if a JavaScript reference points to that element or any of its children (via variables, closures, or event listener targets), the C++ object cannot be deleted because V8 maintains a wrapper object (`HTMLDivElement`, etc.) with a strong reference to the underlying C++ DOM node. The V8 heap snapshot classifies these wrapper objects as "Detached" because they have active JS retainers but are no longer connected to the root `Document` node in the active DOM tree.
- **The Unforgettable Mental Model:** A balloon (DOM node) whose string has been cut from the ground (the active DOM document), but someone in a hovering helicopter (JavaScript scope) is still holding onto the string. The balloon is "detached" from the ground, yet it cannot float away and disappear because it is still being held.
- **The Trap:** Not realizing that keeping a reference to a single deep child element in a massive detached DOM subtree retains the *entire* subtree in memory because parent-child pointers are bidirectional in the DOM.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: To find detached DOM nodes, I take a heap snapshot and search for the constructor prefix `Detached` in the class filter. Chrome DevTools highlights these nodes in yellow. I then inspect their Retainers panel to identify the specific JavaScript references, such as a cached global variable, an active closure scope, or an uncleaned event listener, that are keeping the C++ DOM wrapper alive despite its removal from the active document tree."

#### Snapshot vs performance recording?
- **The Engine Mechanism (Why it behaves this way):** A heap snapshot is a point-in-time, static, high-fidelity serialization of the entire V8 heap graph, capturing the exact structural topology of memory. In contrast, a Performance allocation timeline/recording tracks time-series metadata. It monitors allocation events over time, recording *when* objects are allocated and *how frequently* memory is churning. It uses lightweight instrumentation (such as allocation sampling or tracking heap allocation timelines) that does not serialize the entire heap graph structure, enabling it to run during active user interactions with minimal performance overhead.
- **The Unforgettable Mental Model:** A heap snapshot is a high-resolution, static panoramic photo of a city's traffic at exactly 12:00 PM. A performance recording is a security camera video feed capturing the flow and speed of cars over a 10-minute window.
- **The Trap:** Using heap snapshots to debug frame-rate drops or jank. Jank is caused by frequent garbage collection runs (GC thrashing) or long tasks, which are best diagnosed using the Performance recording timeline to see "sawtooth" memory patterns, not a static heap snapshot.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A heap snapshot is a static, structurally detailed capture of the memory graph at a specific instant, ideal for finding the exact retaining paths of leaked objects or detached DOM nodes. A Performance recording, however, is a dynamic time-series log that tracks memory allocation, garbage collection cycles, and CPU task executions over time. Use Performance recordings to identify runtime memory churn and CPU bottlenecks, and use Heap Snapshots for pin-pointing the precise references causing persistent leaks."

## 8. Active recall test

#### 1. What does a V8 heap snapshot capture?
A V8 heap snapshot captures all reachable objects, closures, strings, numbers, and DOM wrappers on the V8 heap at a specific millisecond. It records their constructor names, IDs, shallow sizes, retained sizes, and the directed pointer reference edges connecting them back to the GC Roots.

#### 2. Why is it critical to compare snapshots rather than analyzing a single snapshot?
Analyzing a single snapshot only shows the state of memory but does not show memory growth or confirm a leak. Comparing snapshots allows developers to isolate the exact objects allocated during a specific user journey that failed to be collected by GC. By analyzing the delta (net increase in allocation count and size), we filter out noise and target the persistent leaked structures.

#### 3. What is a retaining path and how does V8's GC use it?
It is the active chain of references linking an object in the heap back to a Garbage Collection Root. V8's GC uses a mark-and-sweep algorithm. During the mark phase, it traverses from the roots. Any object reachable via a retaining path is marked as active. During the sweep phase, unmarked memory blocks are reclaimed. As long as a path exists, the object is considered reachable and will not be collected.

#### 4. How do you find detached DOM nodes in a snapshot?
Take a heap snapshot in Chrome DevTools, type `Detached` in the constructor class filter box to search for detached wrappers, select a node highlighted in yellow, and trace its reference chain up through the Retainers panel to locate the active JavaScript reference keeping the node alive.

#### 5. Why should you force GC before taking each snapshot?
To eliminate transient, short-lived garbage that is eligible for collection but has not yet been swept by V8's automatic scheduling. Forcing GC ensures that the snapshots only contain truly reachable objects, avoiding false positives during delta analysis.

## 9. Mistakes / traps
- Trusting one snapshot only.
- Ignoring normal cache growth.
- Not reproducing flow consistently.
- Confusing allocation timeline with snapshot.

## 10. Compare with related concepts
- **Heap snapshot vs Performance panel:** memory graph vs runtime timeline.
- **Retained size vs shallow size:** total kept alive vs object itself.
- **Leak vs cache:** unbounded unintended growth vs managed storage.

## 11. Summary from memory
Explain workflow to confirm modal memory leak.

## 12. Spaced revision prompts
- 1 day: Define heap snapshot.
- 3 days: Explain retaining path.
- 7 days: Compare snapshots.
- 14 days: Diagnose detached node leak.

