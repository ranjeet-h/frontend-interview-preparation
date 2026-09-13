# The React Diffing Algorithm: Heuristics and Optimizations

## 1. Why This Exists — The Problem First

Every time state updates in a React application, components re-render and return a brand-new tree of React elements. If React discarded the entire browser DOM and rebuilt it from scratch on every user interaction, web applications would be unusable. Text inputs would drop cursor focus, CSS transitions would snap and restart, scroll positions would reset, embedded videos would reload, and the browser's layout engine would trigger expensive reflows and repaints on every single keystroke.

To prevent unnecessary DOM destruction, React must compare the previous Virtual DOM tree against the newly returned Virtual DOM tree and calculate the minimum set of DOM mutations needed to bring the screen up to date.

In computer science, finding the minimum number of edit operations to transform one arbitrary tree into another is known as the Tree Edit Distance problem. The best-known general algorithms (such as the Zhang-Shasha or Demaine algorithms) run in **$O(N^3)$ time complexity**, where $N$ is the total number of nodes in the tree.

Consider what $O(N^3)$ means in a real browser:
If a modest web page contains 1,000 DOM elements, calculating a mathematically optimal diff would take $1,000^3 = 1,000,000,000$ (one billion) comparison operations on **every single state change**. At 60 frames per second, a browser only has a 16.6-millisecond window to run JavaScript, recalculate styles, lay out geometry, and paint pixels. Performing one billion comparisons would freeze the main thread for hundreds of milliseconds or seconds, locking the entire browser tab.

React could not exist as a responsive UI framework if it used a general tree diffing algorithm. To make real-time updates viable, React introduced an $O(N)$ linear-time heuristic diffing algorithm. For a 1,000-node tree, React performs roughly 1,000 comparisons instead of one billion, finishing in less than a single millisecond.

## 2. The Analogy — Make It Obvious

Imagine you manage a large corporate office with hundreds of desks across multiple floors. At the start of the quarter, HR sends you a revised seating chart.

A mathematically "perfect" approach would analyze every single employee against every single desk on every floor, calculating whether swapping a desk between the 4th-floor engineering team and the 1st-floor marketing department saves two steps of walking distance. Running that exhaustive analysis would take weeks of paperwork while the entire company sits in limbo.

Instead, a sensible facility manager relies on two practical shortcuts:

1. **The Room Purpose Rule:** If Room 302 was previously an Accounting Office and the new chart designates it as a Server Room, you do not inspect whether the accountants' rolling chairs can stay in place. You clear the room completely, discard the office furniture, and install server racks. When the fundamental type of a room changes, you gut the space and build the new setup from scratch.
2. **The Employee Badge Rule:** When checking a row of 30 software engineers, you do not identify people by their desk position (Desk 1, Desk 2, Desk 3). If a new hire joins at Desk 1, you do not force all 30 engineers to move their personal belongings one desk to the right. Instead, you check their employee badge IDs. If employee #408 was at Desk 1 yesterday and sits at Desk 2 today, they keep their laptop, monitor, and personal notes — they simply roll their chair to the adjacent desk.

React works the exact same way:
- The **room purpose** is the element or component type (`<div>` vs `<span>`, or `<UserProfile>` vs `<AdminDashboard>`). If the type changes at the same position, React tears down the old subtree and mounts a fresh one.
- The **employee badge ID** is the `key` prop on sibling elements. It allows React to match an existing Fiber node and preserve its internal state across renders, even when its position in the list changes.

## 3. How It Actually Works — The Full Explanation

React achieves $O(N)$ linear diffing by replacing general tree comparison with two foundational heuristic assumptions:

**Heuristic 1: Two elements of different types will produce different trees.**
If a parent element changes from `<Header>` to `<Sidebar>`, or from `<div>` to `<section>`, React does not recursively inspect their children to find matching subtrees. It assumes the subtrees have nothing in common, destroys the entire old subtree, and mounts the new one from scratch.

**Heuristic 2: The developer can hint at which child elements remain stable across renders using a `key` prop.**
When diffing dynamic lists of siblings, React relies on unique keys to match elements across renders instead of comparing them by index position.

**Level-by-Level Traversal (No Cross-Tree Matching)**
React walks both the previous Fiber tree (the `current` tree) and the newly returned JSX elements level by level, starting at the root. React strictly compares nodes that share the same parent at the same hierarchical depth.

React never attempts to match a node that moved to a different parent or a different depth in the tree. For example, if a `<span>` moves from inside `<div><header><span>Title</span></header></div>` to `<div><footer><span>Title</span></footer></div>`, React unmounts the `<span>` inside the header and creates a brand-new `<span>` inside the footer. Because real-world UIs rarely move elements across unrelated subtrees without structural redesigns, avoiding cross-level comparisons eliminates massive combinatorial overhead.

**Diffing Rules by Element Category**

**1. Elements of Different Types**
Whenever the root elements at the same tree position have different types (e.g., changing `<a>` to `<button>`, or `<CommentView>` to `<CommentEdit>`):
- React marks the old Fiber node and all of its descendants for deletion.
- It unmounts old component instances, runs all `useEffect` cleanup functions (and `componentWillUnmount`), and removes the corresponding real DOM nodes.
- All local component state inside that subtree is destroyed.
- React creates fresh Fiber nodes and mounts brand-new real DOM elements.

**2. DOM Elements of the Same Type**
When React compares two native DOM elements of the same type (e.g., `<div className="idle" title="Panel" />` vs `<div className="active" title="Panel" />`):
- React retains the underlying real DOM node instance without destroying it.
- It compares the props and only mutates the specific HTML attributes that changed (in this case, updating `className` from `"idle"` to `"active"` while leaving `title` untouched).
- For style objects, React only updates the specific CSS properties that changed (e.g., changing `{ color: 'red', fontWeight: 'bold' }` to `{ color: 'blue', fontWeight: 'bold' }` only mutates `node.style.color`).
- After applying attribute updates, React proceeds to diff the element's children.

**3. Component Elements of the Same Type**
When a custom component updates (e.g., `<ProfileCard role="viewer" />` to `<ProfileCard role="editor" />`):
- React keeps the existing component instance and its Fiber node mounted in place.
- All internal component state (`useState`, `useReducer`, `useRef`) is preserved.
- React passes the new props to the component, executes its render function, and recursively diffs the newly returned JSX tree against the previous one.

**Multi-Child Diffing: The Two-Pass Algorithm (`reconcileChildrenArray`)**
Diffing a single child node is an $O(1)$ check. However, diffing an array of sibling children requires handling insertions, deletions, reordering, and prop modifications without quadratic nested loops.

React's list reconciliation algorithm (`reconcileChildrenArray`) uses a two-pass strategy:

**Pass 1: Fast Sequential Scan (The Common Case)**
Most UI updates simply modify props in place or append new items at the end of a list. React iterates through the old Fiber children linked list and the new JSX array simultaneously from index `0` upward.
For each position `i`, React checks if the old Fiber child's key and element type match the new child at index `i`. If they match, React updates the Fiber node with the new props and advances to index `i + 1`.
The moment React encounters a key mismatch (for example, an item was inserted at the front or deleted from the middle), the sequential alignment breaks and Pass 1 terminates immediately.

**Pass 2: Map-Based Lookup (Handling Moves, Insertions, and Deletions)**
If unmatched children remain after Pass 1, React switches to a hash-map strategy:
1. React collects all remaining old Fiber siblings and places them into a JavaScript `Map<Key, FiberNode>` (keyed by their `key` prop, or by index if no key was provided).
2. React loops through the remaining new JSX children. For each child, it performs an $O(1)$ lookup in the Map by key.
3. If a match is found in the Map, React pulls the old Fiber node out of the Map, updates its props, and checks its position. React maintains a pointer called `lastPlacedIndex`, which tracks the highest index in the old list that has been placed so far. If the matched old node was originally located at an index smaller than `lastPlacedIndex`, it means the node has moved to the right relative to other items and receives a `Placement` flag so the commit phase can move the DOM node.
4. If the new child's key is not in the Map, React creates a brand-new Fiber node with a `Placement` flag to insert it into the DOM.
5. After processing all new children, any old Fiber nodes remaining in the Map were not present in the new list. React marks them with a `Deletion` flag to unmount them and remove their DOM nodes during the commit phase.

Because map lookups run in $O(1)$ average time, diffing $N$ children completes in strict $O(N)$ linear time.

## 4. Real Code — See It Working

Here is how React's diffing behavior operates across different component structures and list scenarios.

**Example 1: Type Replacement vs Prop Mutation**

```tsx
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}

export function TypeDiffingDemo() {
  const [isSpecial, setIsSpecial] = useState(false);

  return (
    <div>
      <button onClick={() => setIsSpecial(prev => !prev)}>
        Toggle Layout
      </button>

      {/* 
        CASE A: Different wrapper element type (div vs section).
        React detects a type change at this tree position. It destroys the old <div>,
        unmounts the nested Counter (wiping count state back to 0), and mounts a new <section>.
      */}
      {isSpecial ? (
        <section className="highlighted">
          <Counter />
        </section>
      ) : (
        <div className="normal">
          <Counter />
        </div>
      )}

      {/* 
        CASE B: Same element type (div vs div), only className changes.
        React preserves the <div> DOM node, updates the className attribute,
        and keeps the Counter mounted with its count state fully intact.
      */}
      <div className={isSpecial ? 'highlighted' : 'normal'}>
        <Counter />
      </div>
    </div>
  );
}
```

**Example 2: How Keys Protect State During Multi-Child Diffing**

```tsx
import React, { useState } from 'react';

interface TodoItem {
  id: string;
  text: string;
}

function TodoRow({ text }: { text: string }) {
  // Local state represents user input in progress (e.g. notes on this task)
  const [draftNote, setDraftNote] = useState('');

  return (
    <li style={{ marginBottom: '8px' }}>
      <strong>{text}</strong>
      <input
        value={draftNote}
        onChange={(e) => setDraftNote(e.target.value)}
        placeholder="Type a personal note..."
        style={{ marginLeft: '12px' }}
      />
    </li>
  );
}

export function ListDiffingComparison() {
  const [todos, setTodos] = useState<TodoItem[]>([
    { id: 'task-1', text: 'Buy Groceries' },
    { id: 'task-2', text: 'Clean Kitchen' },
  ]);

  const prependUrgentTask = () => {
    const newTask: TodoItem = {
      id: `task-${Date.now()}`,
      text: 'Urgent: Answer Client Call',
    };
    // Adding an item to the front shifts every existing element down by one position
    setTodos([newTask, ...todos]);
  };

  return (
    <div style={{ padding: '16px' }}>
      <button onClick={prependUrgentTask}>Add Urgent Task to Top</button>

      {/* 
        BROKEN LIST (Index as key):
        When a new item is prepended, index 0 now holds the new task, but React matches
        index 0 to the OLD index 0 Fiber node. The old draftNote state remains attached
        to index 0, corrupting the UI so the user's note appears on the wrong task.
      */}
      <h3>Broken: Index as Key</h3>
      <ul>
        {todos.map((item, index) => (
          <TodoRow key={index} text={item.text} />
        ))}
      </ul>

      {/* 
        CORRECT LIST (Stable ID as key):
        React's reconcileChildrenArray uses the Map lookup to match 'task-1' with its
        previous Fiber node. 'task-1' retains its draftNote state, and the new item
        gets a fresh Fiber node at the top.
      */}
      <h3>Correct: Stable ID as Key</h3>
      <ul>
        {todos.map((item) => (
          <TodoRow key={item.id} text={item.text} />
        ))}
      </ul>
    </div>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is React's diffing algorithm and why is it $O(N)$ instead of $O(N^3)$?**

React's diffing algorithm is the comparison engine used during reconciliation to compute differences between the previous Fiber tree and the newly returned React element tree.

A general mathematical tree edit distance algorithm has a complexity of $O(N^3)$ because it compares every node against every other node across all levels of both trees to find the globally optimal set of transformations. For a 1,000-node DOM tree, $O(N^3)$ requires one billion comparisons per render, which would freeze the browser.

React reduces this complexity to $O(N)$ linear time by using two domain-specific heuristics:
1. It assumes elements of different types produce completely different trees and tears down the old subtree immediately.
2. It relies on developer-provided `key` props to match sibling elements across renders in $O(1)$ time via a hash map.
Combined with level-by-level traversal that never compares nodes across different parent subtrees, React visits each node a constant number of times, diffing 1,000 nodes in approximately 1,000 operations.

**Q: What are the two core heuristic assumptions behind the diffing algorithm?**

The two core heuristic assumptions are:
1. **Type-Based Subtree Replacement:** Two elements of different types produce fundamentally different trees. When an element's type changes (e.g., from `<div>` to `<section>`, or from `<Header>` to `<Nav>`), React does not attempt to match their children. It unmounts the entire old subtree, destroys its DOM nodes and state, and mounts a new subtree.
2. **Key-Based Identity for Sibling Lists:** Sibling elements can be uniquely identified across renders using a stable `key` prop. Instead of matching children purely by their index position in an array, React matches them by key, preserving component state and DOM nodes even when elements are reordered, inserted, or removed.

**Q: What happens under the hood when an element's type changes during diffing?**

When React encounters a different element type at the same position in the tree:
1. React marks the entire old Fiber node and all of its child Fiber nodes for deletion.
2. During the commit phase, React runs cleanup functions for all `useEffect` and `useLayoutEffect` hooks (or `componentWillUnmount` in class components) from the bottom of the unmounted tree upward.
3. React removes the corresponding DOM nodes from the document.
4. All internal component state (`useState`, `useReducer`, `useRef`) in that subtree is discarded and garbage collected.
5. React creates brand-new Fiber nodes for the new element type and its children, initializes fresh state, creates new real DOM nodes, and mounts them to the parent DOM container.

**Q: How does React diff lists of children, and how does `reconcileChildrenArray` work under the hood?**

React diffs arrays of children using a two-pass algorithm in `reconcileChildrenArray`:

In **Pass 1**, React iterates through the old Fiber siblings and the new child array in parallel from left to right. As long as the keys and types match at each index, React reuses the Fiber node in place and updates its props. The first pass breaks as soon as a key mismatch is encountered.

If all new children were processed in Pass 1, excess old children are marked for deletion and diffing completes.

If Pass 1 broke early, React enters **Pass 2**. It builds a `Map<Key, FiberNode>` from the remaining unmatched old Fiber siblings. React then scans the remaining new children and looks up each child's key in the Map in $O(1)$ time:
- If a matching Fiber is found in the Map, React reuses it and removes it from the Map. React compares its old position against `lastPlacedIndex` to determine if the node moved to the right in the DOM.
- If no match is found in the Map, React creates a new Fiber node with a `Placement` effect.
- Any Fiber nodes left in the Map after the loop finishes are marked with a `Deletion` effect to be removed from the DOM.

**Q: Why does using an array index as a `key` cause silent state corruption in dynamic lists?**

When you use array indices as keys (`key={index}`), you tell React that element identity is strictly bound to array position rather than the underlying data entity.

If you prepend an item to the beginning of an array:
- The new item receives index `0`.
- The item that was previously at index `0` now sits at index `1`.
- React compares the new tree with the old tree by key. It sees key `0` existed before, so it reuses the Fiber node at index `0` for the new item.
- React updates the component's props with the new data, but the component's internal state (such as input text, open dropdown toggles, or active animations) is preserved on that Fiber node.
- As a result, the state belonging to the old first item is displayed inside the new first item. Meanwhile, the last item in the array receives a brand-new component instance with empty state.

This leads to visual glitches, wrong form inputs, and subtle production bugs whenever lists are sorted, filtered, or prepended.

**Q: How does diffing differ from reconciliation?**

Reconciliation is the entire end-to-end process React uses to synchronize component state changes with the user interface. It encompasses:
1. Triggering a render when state or props change.
2. Executing component functions to produce a new React element tree.
3. Diffing the new tree against the current Fiber tree to identify mutations.
4. Scheduling and committing the resulting DOM operations (inserts, updates, deletes).

Diffing is specifically step 3 — the tree-comparison algorithm that calculates the minimal set of changes during the render phase. In short: reconciliation is the entire update pipeline, and diffing is the comparison algorithm inside that pipeline.

**Q: Does React diff elements across different levels of the tree?**

No. React diffs strictly level-by-level within the same parent node. If an element moves from one parent container to another (e.g., from a modal dialog to a page sidebar), React will not detect that the element moved. It will unmount the element from its old parent, destroy its DOM node and internal state, and mount a brand-new element in the new parent.

## 6. The Traps — What Goes Wrong

**Trap 1: Defining Components Inside the Body of Another Component**

```tsx
// WRONG: Defining a component inside another component's render function
function ParentContainer() {
  const [count, setCount] = useState(0);

  // Every time ParentContainer renders, a NEW ChildComponent function reference is created in memory
  function ChildComponent() {
    return <input placeholder="Type here..." />;
  }

  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>Rerender: {count}</button>
      <ChildComponent />
    </div>
  );
}
```

When a component is declared inside another component's render function, JavaScript allocates a brand-new function object on every render. To React, the component type at `<ChildComponent />` is a different function reference on every single state update. React treats this as a type change, completely destroying and remounting the subtree on every keystroke or parent render. The text input loses focus after every single character typed.

**The Fix:** Always declare components at the top level of the module so their function identity remains stable across renders.

**Trap 2: Generating Dynamic or Random Keys on the Fly**

```tsx
// WRONG: Generating a new key on every render
<UserCard key={Math.random()} user={user} />
<UserCard key={Date.now()} user={user} />
```

Passing random numbers or timestamps as keys tricks React into believing that every single render contains completely new elements. React bypasses all DOM reuse, destroys the previous Fiber nodes, unmounts all children, and recreates every DOM element from scratch. This ruins rendering performance, causes visible screen flashing, and drops all local state.

**The Fix:** Use stable, unique IDs from your data (such as database primary keys or UUIDs).

**Trap 3: Assuming Same JSX Structure Preserves State Across Wrapper Changes**

```tsx
// Subtle bug: toggling isCard wipes out FormFields state
{isCard ? (
  <div className="card-wrapper">
    <FormFields />
  </div>
) : (
  <FormFields />
)}
```

Developers often assume that because `<FormFields />` exists in both branches of a ternary operator, its state will be preserved when toggling `isCard`. However, in the first branch, `<FormFields />` is a child of `<div>`, while in the second branch, `<FormFields />` is a direct child of the parent container. Because the tree depth and parent structure changed, React cannot match the two positions. It destroys the first instance and mounts a fresh one, clearing all form inputs.

**The Fix:** Keep the parent container structure identical and toggle classes on the wrapper, or lift state to a common ancestor.

**Trap 4: Expecting React to Track Cross-Container Moves**

```tsx
// Moving a component from a drawer to a modal resets its state
{isExpanded ? (
  <ModalContainer>
    <VideoPlayer src={url} />
  </ModalContainer>
) : (
  <SidebarContainer>
    <VideoPlayer src={url} />
  </SidebarContainer>
)}
```

React never compares across different parent branches. When `isExpanded` toggles, the `<VideoPlayer>` inside `<SidebarContainer>` is unmounted (pausing video playback and resetting playback time) and a new player is mounted inside `<ModalContainer>`.

**The Fix:** Keep the stateful component mounted in a single persistent location in the React tree and use CSS or a React Portal (`createPortal`) to reposition its visual container in the DOM.

## 7. Compare With Related Concepts

**Diffing vs Reconciliation**
Reconciliation is the complete end-to-end framework pipeline for updating the UI, including component rendering, tree comparison, effect scheduling, and DOM mutations. Diffing is specifically the in-memory tree comparison algorithm that runs during the render phase of reconciliation.
*Rule:* Reconciliation is the whole factory; diffing is the inspection station comparing the new blueprint against the old one.

**Diffing vs Virtual DOM**
The Virtual DOM is the in-memory tree of JavaScript objects (and Fiber nodes) that represent the UI structure. Diffing is the algorithm that operates on those Virtual DOM trees to detect changes between renders.
*Rule:* The Virtual DOM is the data structure; diffing is the algorithm that processes that data structure.

**Diffing vs `React.memo` / `useMemo`**
`React.memo` and `useMemo` prevent a component from re-rendering in the first place by skipping its render function when props do not change. Diffing only occurs when a component *does* render and React must inspect its returned JSX output against the previous Fiber tree.
*Rule:* Memoization prevents rendering work before it starts; diffing resolves the differences after rendering occurs.

**Diffing vs Browser Reflow and Repaint**
Diffing is pure JavaScript execution in memory comparing lightweight object trees. Browser reflow (layout calculation) and repaint (drawing pixels to the screen) are browser engine operations that run when real DOM nodes are inserted, removed, or restyled.
*Rule:* Diffing happens in React's JavaScript runtime; reflow and repaint happen in the browser's C++ rendering engine.

## 8. 🧠 The Memory Hook

**Different type? Gut the room and rebuild. Moving in a list? Show your badge ID.**
React's $O(N)$ speed comes from two rules: change the tag and the whole subtree dies; keep the tag and use stable `key` IDs so React can roll existing DOM nodes and state into their new positions.
