# React Fiber Architecture and Concurrent Rendering

## 1. Why This Exists — The Problem First

In React 15 and earlier, updating a large component tree was an all-or-nothing gamble with the browser's main thread. The old reconciliation engine—known as the Stack Reconciler—walked your component tree using deep, synchronous recursion. Once React started rendering an update, JavaScript hijacked the single main thread and would not let go until every single component in that branch was evaluated, diffed, and flushed.

If your component tree was massive or contained expensive calculations taking 100 milliseconds, the browser was completely paralyzed for those 100 milliseconds. 

The browser needs to produce a smooth frame every 16.67 milliseconds to hit 60 frames per second. During those 100 milliseconds of synchronous recursion, the browser could not process user clicks, could not register keystrokes, could not handle hover states, and could not paint running CSS animations. The result was visible jank: typing inside a search input stuttered, scroll positions jumped, and the UI felt frozen.

Even worse, React 15 had no concept of priority. A critical, urgent user interaction—like typing a character into an input field—was stuck in the exact same queue behind a low-priority background chart re-rendering 10,000 data points. React needed an engine architecture where rendering could be paused, broken into bite-sized chunks, prioritized based on user urgency, aborted if rendered data became stale, and resumed during idle browser frames. That ground-up rewrite is React Fiber.

## 2. The Analogy — Make It Obvious

Imagine a busy restaurant kitchen with one head chef (the browser's single JavaScript thread).

Under the old Stack Reconciler model, when a customer ordered 50 pounds of diced onions (a massive, low-priority background tree render), the chef pulled out a cutting board and chopped continuously for 20 straight minutes. If a VIP customer walked in and ordered an urgent medium-rare steak (a user typing into an input), the chef refused to look up, speak, or touch the stove until all 50 pounds of onions were finished. The steak waited, the customer was furious, and the kitchen looked completely frozen.

Fiber redesigns the chef's entire workflow into an interruptible step-by-step prep list with a kitchen timer:

1. **The Prep Checklist (The Fiber Linked List):** Instead of one giant recipe block, the onion task is broken into individual recipe index cards linked in order: "Chop Onion #1", "Chop Onion #2", "Chop Onion #3".
2. **The 5ms Kitchen Timer (Cooperative Time Slicing):** The chef chops one onion (a single unit of work), glances at the kitchen timer, and checks the front counter. If time remains in the current 5ms window, the chef chops Onion #2.
3. **Emergency Triage (The Lanes Priority Model):** If the VIP steak order arrives, the chef places a bookmark on Onion #14, immediately sets the onions aside, fires up the grill, cooks and plates the steak in 30 seconds (urgent render and commit), and only then returns to Onion #15 right where they left off.
4. **The Prep Counter vs. The Serving Counter (Double Buffering):** The chef builds and arranges the entire multi-course meal on a hidden prep counter (`workInProgress` tree). The customer at the dining table (`current` tree on screen) never sees half-chopped parsley or half-cooked broth. Only when every dish on the prep tray is 100% complete does the chef slide the finished tray onto the serving counter in a single, instant motion.

## 3. How It Actually Works — The Full Explanation

React Fiber is both an execution engine and a persistent data structure. It turns the process of rendering from an uncontrollable recursive call stack into a heap-allocated, cooperatively scheduled virtual stack machine.

**The Fiber Node Structure**

Every React element you declare in JSX corresponds to an internal Fiber node. A Fiber node is a plain JavaScript object that holds the component's type, its current state, its props, and crucially, structural pointers that assemble the tree into a singly linked list.

Unlike a standard tree where a parent holds an array of references to all its children (`node.children = [A, B, C]`), a Fiber node uses three specific structural pointers:

- `child`: Points directly to its first immediate child only.
- `sibling`: Points to its immediate next sibling.
- `return`: Points back to its parent Fiber node (the node it must "return" to once processing of this branch completes).

This three-pointer design allows React to traverse the entire component tree iteratively using a simple `while` loop without recursion.

Beyond structural pointers, a Fiber node stores:

- `memoizedState`: A singly linked list of hook records (`useState`, `useEffect`, `useMemo`) for functional components.
- `memoizedProps` and `pendingProps`: The props used in the previous render versus the incoming props for the new render.
- `lanes` and `childLanes`: A 31-bit bitmask indicating the priority level of pending work on this node or its descendants.
- `flags` and `subtreeFlags`: Bitmask flags (previously called `effectTag`) marking what DOM mutations must occur (e.g., `Placement`, `Update`, `Deletion`, `Passive` for `useEffect`).
- `alternate`: A direct pointer to the corresponding Fiber node in the alternate tree (used for double buffering).

**Virtual Call Stack vs. Native JS Call Stack**

In standard JavaScript, when function `A()` calls `B()`, the V8 engine pushes a frame onto the native execution call stack. You cannot pause the native call stack midway, execute another event, and resume it later. You either let the call stack run to completion or throw an error to unwind it.

Fiber solves this by moving call stack frames from the JavaScript engine's execution stack onto the JavaScript heap. Each Fiber node is essentially a stack frame saved as a heap object. Because the "stack" is just a linked list of objects in memory, React can stop executing after any individual Fiber node, yield control back to the browser's event loop, save the pointer to `workInProgress`, and pick up the traversal later on the exact node where it paused.

**The Two-Phase Architecture: Render vs. Commit**

Fiber splits every update cycle into two distinct, fundamentally different phases:

1. **The Render Phase (Reconciliation — Asynchronous and Interruptible):**
   React starts at the root of the tree and traverses downward, processing one Fiber node per unit of work. For each node, it executes `beginWork()`, which runs your functional component body or class `render()` method, calculates new props, diffs children against previous fibers, and flags needed DOM operations. When it reaches a leaf node with no children, it calls `completeWork()`, which bubbles up DOM nodes, creates instances for new host elements, and aggregates `subtreeFlags`.
   
   Because this phase performs pure computation and touches zero real DOM elements, React can pause it, yield to the browser, re-prioritize it, or throw the whole tree away if an incoming update makes the calculation obsolete.

2. **The Commit Phase (DOM Mutation — Synchronous and Atomic):**
   Once the render phase finishes and the entire `workInProgress` tree is fully constructed and flagged, React enters the commit phase. React takes all the accumulated `flags` (`Placement`, `Update`, `ChildDeletion`) and writes the changes to the real browser DOM in one uninterrupted pass.
   
   The commit phase is strictly synchronous. It can never be paused or time-sliced because presenting a half-updated DOM to the user would cause visual tearing and broken UI states. The commit phase runs in sub-phases: `before mutation` (reads DOM snapshots via `getSnapshotBeforeUpdate`), `mutation` (applies DOM insertions, updates, deletions, and unmounts), and `layout` (executes `useLayoutEffect` and `componentDidMount`/`componentDidUpdate`). Finally, it schedules passive effects (`useEffect`) to run asynchronously on the next frame.

**Double Buffering**

To ensure rendering is butter-smooth and immune to visual flickering, React uses double buffering—a technique borrowed from graphics engines and game development.

React maintains two complete Fiber trees in memory at all times:
- `current`: The Fiber tree that matches the UI currently rendered on the user's screen.
- `workInProgress` (WIP): The scratchpad Fiber tree that React constructs and mutates during the render phase.

When a state update occurs, React does not modify the `current` tree. Instead, it creates or recycles a matching node in the `workInProgress` tree via `createWorkInProgress()`, copying over the existing props and state while linking them via the `alternate` property.

React does all its diffing, hook execution, and layout calculations entirely inside the `workInProgress` tree. Once the commit phase finishes applying the DOM changes, React executes a single, atomic pointer swap:

`fiberRoot.current = workInProgress;`

Instantly, the `workInProgress` tree becomes the new `current` tree, and the old `current` tree becomes the scratchpad for the next update cycle. No memory allocation thrashing, zero screen tearing.

**Time Slicing and Cooperative Scheduling**

How does React know when to pause during the render phase?

At the heart of Fiber's work loop is cooperative multitasking. Inside `workLoopConcurrent`, React evaluates units of work in a loop:

```javascript
while (workInProgress !== null && !shouldYield()) {
  performUnitOfWork(workInProgress);
}
```

The function `shouldYield()` is governed by React's internal `Scheduler`. Every frame, the scheduler assigns React a time budget (typically 5 milliseconds per slice). After processing each Fiber node, `shouldYield()` compares the current high-resolution timestamp (`performance.now()`) against the deadline.

If the 5ms budget is exhausted and there are pending browser tasks (like user inputs or paint requests), `shouldYield()` returns `true`. React saves its current position in `workInProgress`, yields control back to the browser's event loop, and schedules a task on the browser's `MessageChannel` macro-task queue.

Why `MessageChannel` instead of `setTimeout` or `requestIdleCallback`?
- `setTimeout(fn, 0)` enforces a minimum 4ms clamp after 4 nested levels, wasting up to 25% of a 16.6ms frame budget.
- `requestIdleCallback` sounds ideal in theory, but in practice, browsers fire it unpredictably (often throttled to once per second on inactive tabs or during heavy scrolling), and Safari does not support it consistently.
- `MessageChannel` posts macro-tasks that fire immediately after the browser finishes its layout and paint cycles without artificial timer throttling.

**The Lanes Priority Model**

In React 16, update priority was managed using simple timestamp numbers ("expiration times"). In React 17 and 18, the core team replaced expiration times with the **Lanes model**—a 31-bit integer bitmask architecture.

Each update is assigned one or more bits (lanes) representing its priority level and category:

- `SyncLane` (Bit 1): Synchronous, un-interruptible work (discrete clicks, controlled inputs).
- `InputContinuousLane` (Bits 2-4): Continuous user interactions (scrolling, dragging, mouse moves).
- `DefaultLane` (Bits 5-16): Normal state updates triggered by HTTP responses, timers, or standard events.
- `TransitionLane` (Bits 17-22): Transitions created via `startTransition` or `useTransition` (interruptible background renders).
- `IdleLane` (Bits 29-30): Lowest priority off-screen work or telemetry.

Because priorities are expressed as 32-bit bitmasks, React uses lightning-fast bitwise operations (`&`, `|`, `~`) to check, merge, and filter work:
- Check if a Fiber has urgent work: `(fiber.lanes & UrgentLanes) !== NoLanes`
- Combine priority lanes: `fiber.lanes |= newLane`
- Remove processed lanes: `fiber.lanes &= ~completedLane`

When React starts rendering, it selects the highest-priority non-empty lane. If a low-priority `TransitionLane` is currently rendering in the `workInProgress` tree and the user suddenly clicks a button generating a `SyncLane` update, React immediately interrupts the transition, discards or pauses the WIP tree, renders the `SyncLane` update directly to the DOM, and then restarts or resumes the transition update.

## 4. Real Code — See It Working

Let's look at two practical code examples: first, how to harness Fiber's concurrent scheduling in a production React component, and second, a pure JavaScript simulation of how Fiber's linked-list work loop functions under the hood.

**Example 1: Concurrency in Action (`useTransition` vs. Blocking State)**

```tsx
import React, { useState, useTransition, useDeferredValue } from 'react';

// Generates an array of 15,000 items to simulate a heavy component tree
const bigDataset = Array.from({ length: 15000 }, (_, i) => `Transaction #${i + 1} - Verified`);

export function SearchDashboard() {
  // Urgent state: controls the text input directly
  const [inputValue, setInputValue] = useState('');
  
  // Non-urgent state: controls the massive filtered list
  const [filteredQuery, setFilteredQuery] = useState('');
  
  // isPending indicates whether Fiber is currently calculating the transition in the background
  const [isPending, startTransition] = useTransition();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    
    // 1. URGENT UPDATE: Handled immediately via SyncLane
    // Input displays the typed character with 0ms delay
    setInputValue(nextValue);

    // 2. NON-URGENT TRANSITION: Assigned to TransitionLane
    // Fiber will time-slice this calculation and interrupt it if the user keeps typing
    startTransition(() => {
      setFilteredQuery(nextValue);
    });
  };

  const filteredItems = bigDataset.filter(item => 
    item.toLowerCase().includes(filteredQuery.toLowerCase())
  );

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h2>Fiber-Powered Responsive Search</h2>
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder="Type quickly to test responsiveness..."
        style={{ padding: '8px 12px', width: '320px', fontSize: '16px' }}
      />

      {isPending && <span style={{ marginLeft: '12px', color: '#666' }}>Recalculating list...</span>}

      <div style={{ opacity: isPending ? 0.6 : 1.0, transition: 'opacity 0.15s ease' }}>
        <p>Displaying {filteredItems.length} records</p>
        <ul style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #ccc' }}>
          {filteredItems.slice(0, 100).map(item => (
            <li key={item} style={{ padding: '4px 8px' }}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

**Example 2: A Minimal Executable Simulator of the Fiber Work Loop**

To truly grasp how Fiber navigates a tree without recursion and yields to the event loop, look at this standalone pure JavaScript simulation of the Fiber crawler:

```javascript
// A minimal Fiber Node representation
class FiberNode {
  constructor(name) {
    this.name = name;
    this.child = null;    // First child
    this.sibling = null;  // Next sibling
    this.return = null;   // Parent
    this.flags = 'None';  // Effect tag
  }
}

// Constructing a sample Fiber tree:
//       App
//      /
//   Header -> Main
//             /
//          Content -> Sidebar
const root = new FiberNode('App');
const header = new FiberNode('Header');
const main = new FiberNode('Main');
const content = new FiberNode('Content');
const sidebar = new FiberNode('Sidebar');

root.child = header;
header.return = root;
header.sibling = main;
main.return = root;
main.child = content;
content.return = main;
content.sibling = sidebar;
sidebar.return = main;

// The simulated Work Loop
let nextUnitOfWork = root;

function beginWork(fiber) {
  console.log(`[beginWork] Processing and diffing node: ${fiber.name}`);
  // In real React, this calls the component function and reconciles children
  return fiber.child; // Return child to dive deeper down the tree
}

function completeWork(fiber) {
  console.log(`[completeWork] Assembled DOM & collected effects for: ${fiber.name}`);
  return null;
}

function performUnitOfWork(unitOfWork) {
  // Step 1: Process current fiber and get its first child
  let next = beginWork(unitOfWork);

  if (next !== null) {
    return next; // Go down to child
  }

  // Step 2: No child found. We've reached the bottom of this branch.
  // Complete this node and move across siblings or back up to parent.
  let current = unitOfWork;
  while (current !== null) {
    completeWork(current);

    if (current.sibling !== null) {
      return current.sibling; // Move to sibling
    }

    // No sibling; move up to parent and complete it
    current = current.return;
  }

  return null; // Entire tree is complete!
}

// Simulating cooperative time slicing
function workLoop() {
  console.log('--- Starting Fiber Work Loop ---');
  while (nextUnitOfWork !== null) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
  }
  console.log('--- Render Phase Done: Commit Phase Starts Atomically ---');
}

workLoop();
// Execution order printed:
// [beginWork] Processing and diffing node: App
// [beginWork] Processing and diffing node: Header
// [completeWork] Assembled DOM & collected effects for: Header
// [beginWork] Processing and diffing node: Main
// [beginWork] Processing and diffing node: Content
// [completeWork] Assembled DOM & collected effects for: Content
// [beginWork] Processing and diffing node: Sidebar
// [completeWork] Assembled DOM & collected effects for: Sidebar
// [completeWork] Assembled DOM & collected effects for: Main
// [completeWork] Assembled DOM & collected effects for: App
// --- Render Phase Done: Commit Phase Starts Atomically ---
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is React Fiber, and why was React's reconciler completely rewritten in React 16?**

React Fiber is the internal reconciliation engine and scheduling architecture introduced in React 16. The original reconciler (the Stack Reconciler) relied on synchronous, recursive tree traversal. When rendering a component tree, it locked the single JavaScript main thread until the entire tree was evaluated, causing dropped frames, unresponsive user input, and sluggish animations during large updates. 

Fiber was built to solve this main-thread blocking problem. It replaces recursive call stacks with a heap-allocated singly linked-list data structure (`child`, `sibling`, `return`). This structural overhaul gives React the superpower to break rendering into fine-grained units of work, pause rendering to allow the browser to paint or handle user clicks, prioritize urgent work (like typing) over non-urgent work (like background filtering), and abort obsolete renders before they touch the DOM.

**Q: How does Fiber's linked-list structure differ from the old Stack Reconciler's recursive execution model?**

The Stack Reconciler used JavaScript's native execution call stack. When a component rendered child components, it called nested functions recursively. In JavaScript, you cannot pause or step out of a native call stack frame without completing or crashing it. 

Fiber turns the call stack into a linked-list data structure stored on the heap. Each Fiber node acts as an explicit virtual stack frame. Because the entire traversal state is stored in pointers (`child`, `sibling`, `return`), React can stop its execution loop at any arbitrary Fiber node, return control to the browser event loop, preserve its position in the `workInProgress` pointer, and resume later from the exact same node.

**Q: What is Double Buffering in React, and how does it prevent UI tearing and visual glitches?**

Double buffering is a graphics rendering technique where updates are drawn onto an off-screen buffer before being displayed all at once on screen. React applies this to Fiber by maintaining two trees in memory: the `current` tree (what is currently displayed in the DOM) and the `workInProgress` tree (the scratchpad tree being constructed during the render phase).

During an update, React creates or reuses nodes in the `workInProgress` tree, calculating diffs, running component logic, and attaching mutation flags without touching the real DOM. If the user interacts or if rendering is interrupted, the `current` tree remains completely unaffected on screen. Only when the `workInProgress` tree is 100% computed does React enter the commit phase and perform an instant, atomic pointer swap: `fiberRoot.current = workInProgress`. This guarantees that the user never sees intermediate, partial, or broken visual states (known as UI tearing).

**Q: What is the difference between the Render Phase and the Commit Phase in Fiber architecture? Why can Render be paused while Commit cannot?**

The **Render Phase** is the calculation stage. React traverses the Fiber tree, invokes component functions, runs diffing algorithms, evaluates hooks, and builds the `workInProgress` tree with effect flags. Because this phase is purely computational and produces no side effects or DOM mutations, it is completely asynchronous, interruptible, and restartable.

The **Commit Phase** is the application stage. React iterates through the flagged nodes in the `workInProgress` tree and executes real DOM operations (inserting nodes, updating attributes, removing elements) and runs lifecycle methods/layout effects. The commit phase is strictly synchronous and non-interruptible. If the commit phase were paused midway, the browser would paint a half-updated DOM where some elements are updated and others are missing, breaking layout integrity and user experience.

**Q: How does React schedule work without blocking the main thread? Why did React choose `MessageChannel` over `requestIdleCallback` or `setTimeout`?**

React uses a custom scheduling module (`Scheduler`) that implements cooperative multitasking. Inside its work loop, React checks `shouldYield()` after processing each Fiber node. The scheduler allocates a 5ms time slice per frame. If 5ms elapses and the browser has pending tasks, React pauses the work loop and schedules a macro-task callback to continue during the next tick.

React chose `MessageChannel` over alternatives for specific performance reasons:
1. `setTimeout(fn, 0)` suffers from a browser-enforced 4ms clamping penalty after 4 nested calls, wasting critical frame time.
2. `requestIdleCallback` is not supported in all major browsers (notably Safari), and browsers fire it unpredictably—often throttling it heavily when users switch tabs or rapidly scroll.
3. `MessageChannel.port.postMessage` schedules an immediate macro-task that runs directly after the browser completes its layout and paint cycles, providing maximum frame utilization.

**Q: What is the Lanes model, and why did React switch to 31-bit bitmasks for update prioritization?**

Before React 17, update priority was managed using linear timestamps called "expiration times." This model treated priority as a one-dimensional spectrum where higher numbers meant higher urgency, making it difficult to batch disjointed updates or express complex groupings (like "render all data from transition A together without waiting for transition B").

The Lanes model represents priorities as a 31-bit integer bitmask. Each bit corresponds to a distinct "lane" (such as `SyncLane`, `InputContinuousLane`, `DefaultLane`, `TransitionLanes`, and `IdleLane`). Bitmasks allow React to perform ultra-fast bitwise math (`&`, `|`, `~`) to:
- Combine multiple independent priority categories in a single variable.
- Check if a Fiber node has pending work in O(1) CPU cycles.
- Selectively include, exclude, or suspend specific categories of work during a render cycle without being constrained by linear priority ordering.

**Q: Does React Fiber make React rendering multi-threaded? How does concurrency work in a single-threaded runtime?**

No. React Fiber is entirely single-threaded and runs on the browser's standard JavaScript main thread. 

Concurrency in React does not mean parallel threads executing on multiple CPU cores simultaneously. It means **cooperative interleaving of tasks on a single thread**. Just like an operating system on a single-core CPU switches rapidly between multiple programs to create the illusion of simultaneous execution, Fiber interleaves low-priority rendering with high-priority user events within the same JavaScript execution context by slicing work into 5ms intervals.

**Q: Why are React component functions called twice in Strict Mode under Concurrent React?**

In Concurrent React, the render phase is interruptible and can be restarted multiple times before reaching the commit phase. If a component function contains side effects (such as mutating a global variable, adding a manual DOM listener, or making an unhandled API call), running the render phase multiple times will cause subtle bugs and memory leaks.

To help developers detect unsafe side effects early in development, React `StrictMode` deliberately invokes component render functions, `useState` initializers, and `useMemo` callbacks twice. If your component is a pure function (as React architecture requires), running it twice produces identical results with zero side effects. If running it twice changes behavior, you have introduced an illegal side effect into the render phase.

## 6. The Traps — What Goes Wrong

**Trap 1: Executing Side Effects During the Render Phase**

- **The Wrong Assumption:** Assuming that because a component function is executing, its output will definitely be mounted to the DOM, so it is safe to fire telemetry, mutate external variables, or dispatch store actions directly inside the component body.
- **Why It Fails:** In Fiber's concurrent world, the render phase can be started, paused, interrupted, abandoned, or restarted from scratch. If an update is aborted because a higher-priority keystroke arrived, your component function ran, but its DOM mutations never happened. Any side effect in the component body has now fired for an aborted ghost render.
- **The Fix:** Keep the component body strictly pure. All side effects must reside inside `useEffect`, `useLayoutEffect`, or event handlers, which only execute during or after the guaranteed commit phase.

```tsx
// ❌ WRONG: Side effect in render phase (fires multiple times or on abandoned renders)
function UserProfile({ userId }: { userId: string }) {
  analytics.trackPageView(userId); // Illegal!
  return <div>User Profile</div>;
}

// ✅ CORRECT: Side effect deferred to the commit phase
function UserProfile({ userId }: { userId: string }) {
  useEffect(() => {
    analytics.trackPageView(userId);
  }, [userId]);
  return <div>User Profile</div>;
}
```

**Trap 2: Believing Fiber Makes Raw Heavy Calculations Faster**

- **The Wrong Assumption:** Believing that wrapping a CPU-intensive algorithm in `useTransition` or upgrading to React 18 makes the calculation itself execute in fewer milliseconds.
- **Why It Fails:** Fiber does not reduce raw CPU calculation time. Filtering 100,000 items takes the exact same number of CPU cycles. In fact, due to the bookkeeping overhead of time-slicing and `shouldYield()` checks, the total wall-clock time may be slightly longer.
- **What Actually Happens:** Fiber does not improve raw computation throughput; it improves **main-thread responsiveness**. Instead of locking the browser for 200ms straight, it chops the 200ms into forty 5ms chunks, allowing keystrokes and animations to slip between the chunks. For raw calculation speed, offload heavy crunching to a Web Worker or memoize with `useMemo`.

**Trap 3: Using `useTransition` to Control Controlled Form Inputs**

- **The Wrong Assumption:** Wrapping an input's primary `onChange` state updater in `startTransition` to prevent typing lag.
- **Why It Fails:** Controlled inputs require synchronous, instant state updates. If you defer the text input's state update inside a transition, the user types a character, but the input value does not update immediately. The cursor jumps to the end of the field, characters appear out of order, and the input feels completely broken.
- **The Fix:** Split your state into an urgent local state for the input field and a deferred transition state for the slow consumer tree:

```tsx
// ❌ WRONG: Laggy input with broken cursor positioning
function Search() {
  const [text, setText] = useState('');
  const [, startTransition] = useTransition();

  return (
    <input
      value={text}
      onChange={e => startTransition(() => setText(e.target.value))} // Broken!
    />
  );
}

// ✅ CORRECT: Synchronous input state + deferred query state
function Search() {
  const [text, setText] = useState('');
  const [deferredText, setDeferredText] = useState('');
  const [, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value); // Urgent sync update
    startTransition(() => {
      setDeferredText(e.target.value); // Non-urgent deferred update
    });
  };

  return <input value={text} onChange={handleChange} />;
}
```

**Trap 4: Mutating State or Props Directly**

- **The Wrong Assumption:** Modifying an array or object in-place (`items.push(newItem)`) and passing it to `setState(items)`.
- **Why It Fails:** Fiber relies heavily on shallow reference equality checks (`oldProps !== newProps` or `oldState !== newState`) during `beginWork()` to quickly bail out of rendering subtrees that haven't changed (`bailoutOnAlreadyFinishedWork`). When you mutate state in-place, the previous Fiber's `memoizedState` and the incoming `pendingState` reference the exact same memory address. Fiber assumes nothing changed, skips the unit of work entirely, and fails to update the UI.

## 7. Compare With Related Concepts

**Fiber vs. Virtual DOM**
- **The Difference:** Virtual DOM is a conceptual model—a lightweight tree of plain JavaScript objects (React elements) describing what the UI should look like. Fiber is the underlying runtime engine, stateful tree graph, and cooperative scheduling architecture that reconciles those elements, tracks component state/effects, and manages the execution pipeline.
- **When to Use Which:** Virtual DOM is the *what* (the descriptive blueprint); Fiber is the *how* (the execution worker that builds it).

**Fiber vs. Stack Reconciler**
- **The Difference:** The Stack Reconciler (React 15) used native JavaScript recursion to traverse trees synchronously and un-interruptibly. Fiber (React 16+) uses a heap-allocated singly linked list (`child`, `sibling`, `return`) to traverse trees iteratively in interruptible, time-sliced units of work.
- **One-line Rule:** Stack Reconciler locked the thread until completion; Fiber yields the thread to keep the browser responsive.

**Fiber vs. Web Workers**
- **The Difference:** Web Workers run code on a separate operating system background thread with its own isolated memory space, communicating strictly via serialized messages, with zero access to the DOM. Fiber provides cooperative concurrency on the single main UI thread, preserving direct access to React state, component instances, and the browser DOM.
- **One-line Rule:** Use Web Workers for off-thread pure number crunching; use Fiber for prioritized, responsive UI rendering on the main thread.

**Render Phase vs. Commit Phase**
- **The Difference:** The Render Phase is asynchronous, pure calculation, interruptible, and touches zero real DOM nodes. The Commit Phase is synchronous, atomic, non-interruptible, and applies all accumulated mutations to the real DOM.
- **One-line Rule:** Render phase calculates the diffs; commit phase applies the diffs to the screen.

**`useTransition` vs. Debouncing / Throttling**
- **The Difference:** Debouncing forces an artificial delay (e.g., waiting 300ms of silence before doing anything). `useTransition` starts rendering immediately on the very next frame at low priority, executing as fast as the user's hardware allows while instantly pausing if the user interacts.
- **One-line Rule:** Debounce when you need to prevent network request spam; use `useTransition` when you want immediate, interruptible UI rendering without arbitrary millisecond delays.

## 8. 🧠 The Memory Hook

Fiber turns React's rendering engine from a rigid, unstoppable **recursive function call stack** into a flexible, **heap-allocated linked-list checklist**. Because every component is an independent unit of work with priority lanes, React can pause what it's building on the hidden prep counter, handle urgent keystrokes instantly, and swap the completed work to the real DOM in a single atomic breath.
