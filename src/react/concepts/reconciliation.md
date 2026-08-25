# Reconciliation: How React Diffs and Updates the Tree

## 1. Why This Exists — The Problem First

Imagine you are building a complex web application with forms, shopping carts, and dynamic data tables. If every time a piece of state changed you had to wipe out the entire DOM and rebuild it from scratch (`container.innerHTML = ...`), the user experience would be unusable. Form inputs would lose focus mid-typing, selected text would disappear, scroll positions would jump to the top, and ongoing CSS animations would instantly stutter and restart.

To avoid that nightmare in vanilla JavaScript, you would have to write hundreds of lines of manual DOM manipulations: find this specific `<span>`, update its text content, add a CSS class to that `<button>`, and insert a `<tr>` after the third row. As your app grows, this manual approach falls apart. One missed edge case leaves your UI showing stale data that does not match your application state.

React solves this by letting you write declarative code: you describe what the UI should look like for any given state, and React figures out the rest. But computing the exact differences between two nested object trees is mathematically expensive. A general tree-diffing algorithm runs in $O(n^3)$ time complexity. If your page has 1,000 elements, comparing two trees would take a billion operations on every single state change.

Reconciliation is React's diffing engine. It is the intelligent comparison process that turns an impossible $O(n^3)$ mathematical problem into an ultrafast $O(n)$ linear operation, figuring out the absolute minimum number of DOM mutations needed to keep the screen in sync with your state without destroying user context.

## 2. The Analogy — Make It Obvious

Think of React reconciliation like an experienced building renovation inspector working with blueprints.

When an architect sends over a revised floor plan (a new React element tree produced by a render), the building inspector does not order the demolition of the entire skyscraper. Instead, the inspector walks through the building with the old blueprints in one hand and the new blueprints in the other, following three simple inspection rules:

First, **Different Room Types**: If the blueprint replaces an open-concept kitchen with a closed ceramic-tiled bathroom at the same location, the inspector does not try to salvage the wooden kitchen cabinets or appliances. The crew tears down the entire kitchen to the concrete slab, throws everything out, and builds a brand new bathroom from scratch. Any items left in that kitchen are destroyed.

Second, **Same Room, Updated Paint**: If the conference room is still a conference room, but the blueprint asks for a blue accent wall instead of grey, the inspector keeps the room, doors, and tables intact. The crew only repaints that one wall.

Third, **Office Desks with Name Tags**: If five employees swap desks, the inspector looks at their desk name tags (keys). When Alice moves from desk 1 to desk 5, the movers simply roll Alice's chair and desk to spot 5. If there were no name tags, the crew would look only at desk positions, clear out whatever was sitting on desk 1, rewrite Alice's name on Bob's personal notebook, and leave Alice's coffee cup on someone else's desk.

In React, the blueprint comparison is **reconciliation**, the inspector's notes are **Fiber effect tags**, and the construction crew executing the changes on the physical building is the **commit phase** updating the real DOM.

## 3. How It Actually Works — The Full Explanation

When a state or prop change occurs, React calls your component functions to produce a new tree of React elements (lightweight JavaScript objects describing what the UI should look like). React must compare this new element tree with the existing tree (the current Fiber tree) to determine what actually changed.

Because generic tree comparison algorithms take $O(n^3)$ time, React relies on two practical heuristics based on how web applications behave in real life:

1. Two elements of different types will produce fundamentally different trees.
2. The developer can hint at which child elements remain stable across renders using a unique `key` prop.

These heuristics reduce the diffing process to $O(n)$ linear time. React walks both trees level-by-level (breadth-first at each node level) and applies four core rules.

**Rule 1: Elements of Different Types Produce Different Trees**

Whenever the root element type changes between renders (e.g., changing from `<div>` to `<section>`, or from `<Header>` to `<Sidebar>`), React does not attempt to match their children.

React destroys the old tree completely:
- It removes the old DOM nodes from the document.
- It unmounts all component instances in that subtree, running their cleanup functions (`useEffect` return callbacks or `componentWillUnmount`).
- All state held inside any component in that subtree is permanently destroyed.
- It mounts the new component subtree fresh, initializing state from scratch and running mount effects.

**Rule 2: DOM Elements of the Same Type Retain Their Node**

When comparing two React elements of the same built-in DOM type (e.g., `<div className="light" title="Hello" />` versus `<div className="dark" title="Hello" />`), React preserves the underlying DOM node.

React only compares their attributes and updates what changed:
- It removes old CSS classes or attributes and applies the new ones.
- When updating `style` objects, it only updates modified properties (e.g., modifying `color` while leaving `fontWeight` untouched).
- After updating the attributes on the current node, React moves down to reconcile that element's children.

**Rule 3: Component Elements of the Same Type Preserve Instance and State**

When a custom component updates (e.g., `<UserBadge role="viewer" />` changes to `<UserBadge role="admin" />`), React sees that the component type is identical (`UserBadge === UserBadge`).

React keeps the existing component instance and its internal state alive:
- React updates the props on the underlying Fiber node.
- React re-executes the component function with the new props.
- The component produces new React elements, and React recursively reconciles the returned subtree.

**Rule 4: Child Lists Are Reconciled Using Keys**

When a parent has a list of children, React iterates over the old list and the new list simultaneously:

If you append an item to the end of a list, React matches the first items positionally and inserts the last item at the end. That is fast and efficient.

However, if you insert an item at the beginning of a list without keys, React compares the first old child with the first new child. Seeing a mismatch, React mutates the existing first DOM node in place, mutates the second node in place, and inserts a new node at the bottom. This causes unnecessary DOM updates and causes any local component state (like focused inputs, open accordions, or checkbox checks) to stay pinned to the wrong position.

When you provide a stable, unique `key`, React creates an internal map of old keys. Instead of matching by array index, React looks up elements by key in $O(1)$ time. It knows immediately whether an item was moved, inserted, or removed, preserving the exact DOM nodes and local state associated with each item.

**Bailout Mechanisms: When React Skips Reconciliation Entirely**

Diffing has a cost. React provides multiple ways to bail out of diffing subtrees when nothing changed:

- **State Identity Bailout (`Object.is`)**: When you call `setState(newValue)`, React compares `newValue` with the existing state using `Object.is`. If they are identical, React bails out early without re-rendering the component or diffing its children.
- **Component Memoization (`React.memo`)**: Wrapping a component in `React.memo` tells React to perform a shallow comparison of its props. If all props are referentially equal to the previous render, React skips executing the component and reuses the previous rendered output.
- **Element Identity Bailout (`useMemo` and `children`)**: If a JSX element reference is identical to the previous render (for example, passed in as `children` from a parent that did not re-render, or memoized with `useMemo`), React knows the element's props and type have not changed, skipping reconciliation for that subtree.

**The Two Phases: Reconciliation vs Committing**

Reconciliation happens during the **Render Phase**. In this phase, React calls component functions and calculates what DOM changes are needed. In modern React (Fiber architecture), this phase is pure and can be split into chunks, paused, resumed, or discarded if higher-priority user events (like keystrokes) come in.

Once the entire tree has been diffed, React enters the **Commit Phase**. This phase is synchronous and uninterruptible: React applies all computed changes to the real browser DOM at once, ensuring the user never sees a half-updated or inconsistent UI.

## 4. Real Code — See It Working

Let us look at three practical scenarios showing how reconciliation operates under the hood.

### Example 1: Type Change Destroys State vs Same Type Preserves State

```tsx
import React, { useState } from 'react';

function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0);

  return (
    <div style={{ margin: '8px 0', padding: '8px', border: '1px solid #ccc' }}>
      <span>{label}: <strong>{count}</strong></span>
      <button onClick={() => setCount(c => c + 1)} style={{ marginLeft: '8px' }}>
        Increment
      </button>
    </div>
  );
}

export function ReconciliationDemo() {
  const [useWrapperSection, setUseWrapperSection] = useState(false);
  const [swapPosition, setSwapPosition] = useState(false);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '16px' }}>
      <h3>1. Changing Root Element Type</h3>
      {/* 
        When useWrapperSection toggles:
        React sees <div> vs <section>. Different element types!
        It completely unmounts the old subtree and destroys the Counter's state.
      */}
      {useWrapperSection ? (
        <section>
          <Counter label="Section Wrapper Counter" />
        </section>
      ) : (
        <div>
          <Counter label="Div Wrapper Counter" />
        </div>
      )}
      <button onClick={() => setUseWrapperSection(v => !v)}>
        Toggle Wrapper Type (Wipes Counter State)
      </button>

      <hr style={{ margin: '24px 0' }} />

      <h3>2. Preserving Type and Changing Props</h3>
      {/* 
        When swapPosition toggles:
        React sees <Counter> at the same tree position.
        Same component type! React preserves the instance and count state,
        only updating the 'label' prop.
      */}
      <Counter label={swapPosition ? 'Admin Counter' : 'User Counter'} />
      <button onClick={() => setSwapPosition(v => !v)}>
        Toggle Label Prop (Preserves Count State)
      </button>
    </div>
  );
}
```

### Example 2: List Diffing With Keys vs Index Keys

```tsx
import React, { useState } from 'react';

interface TodoItem {
  id: string;
  text: string;
}

function TodoRow({ text }: { text: string }) {
  // Local state representing user interaction (e.g. custom note or completion)
  const [checked, setChecked] = useState(false);

  return (
    <li style={{ margin: '6px 0' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => setChecked(e.target.checked)}
      />
      <span style={{ marginLeft: '8px' }}>{text}</span>
    </li>
  );
}

export function TodoListDiffDemo() {
  const [todos, setTodos] = useState<TodoItem[]>([
    { id: 'todo-1', text: 'Drink coffee' },
    { id: 'todo-2', text: 'Write documentation' },
  ]);

  const prependItem = () => {
    const newItem: TodoItem = {
      id: `todo-${Date.now()}`,
      text: `Task added at ${new Date().toLocaleTimeString()}`,
    };
    // Prepend to the top of the list
    setTodos(prev => [newItem, ...prev]);
  };

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '16px' }}>
      <button onClick={prependItem}>Prepend New Task to Top</button>

      <h4>Correct: Using Stable ID as Key</h4>
      {/* 
        React matches existing items by their stable 'id'.
        When a new item is added at index 0, React leaves existing TodoRow instances
        and their checked state untouched, simply inserting the new DOM node at index 0.
      */}
      <ul>
        {todos.map(todo => (
          <TodoRow key={todo.id} text={todo.text} />
        ))}
      </ul>
    </div>
  );
}
```

### Example 3: Subtree Bailout Using Element Identity (`children`)

```tsx
import React, { useState } from 'react';

function ExpensiveVisualizer() {
  // Imagine this component renders a massive chart or svg tree
  const renderTime = new Date().toLocaleTimeString();
  return (
    <div style={{ padding: '12px', background: '#f5f5f5', marginTop: '8px' }}>
      <strong>Expensive Tree Rendered at:</strong> {renderTime}
    </div>
  );
}

// Parent component that manages frequent timer updates
export function OptimizedShell({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: '16px', border: '2px dashed #007acc' }}>
      <p>Parent Click Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment Parent Count</button>
      
      {/* 
        Because 'children' was passed in from the outer caller,
        its element reference (React.createElement output) is identical across parent re-renders.
        React detects Object.is(prevChildren, nextChildren) and completely bails out
        of diffing or re-rendering the ExpensiveVisualizer!
      */}
      {children}
    </div>
  );
}

export function App() {
  return (
    <OptimizedShell>
      <ExpensiveVisualizer />
    </OptimizedShell>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is reconciliation in React, and why is it needed?**

Reconciliation is the process React uses to compare two trees of React elements (the previous render and the newly returned render) to determine what changes need to be made to the actual host environment (like the browser DOM). 

It is needed because directly re-creating the entire DOM tree on every state update is devastating for performance and destroys user state like input focus and scroll positions. At the same time, manual DOM querying and patching is error-prone and hard to maintain. Reconciliation enables React's declarative programming model: developers write components as pure projections of state, and React efficiently computes the exact minimum DOM mutations required.

**Q: How does React achieve an O(n) diffing algorithm instead of the traditional O(n³) tree comparison?**

General tree-to-tree transformation algorithms calculate the minimum edit distance across all possible permutations, which has an $O(n^3)$ time complexity. React avoids this by making two practical assumptions:
1. **Type heuristic**: If two elements have different types (e.g., `<div>` vs `<span>` or `<ComponentA>` vs `<ComponentB>`), they will generate completely different subtrees. React immediately unmounts the old subtree and mounts the new one without attempting to diff children.
2. **Key heuristic**: For lists of sibling elements, developers provide a `key` prop that acts as a stable identifier. React builds a lookup map by key, matching old and new elements in $O(1)$ time rather than comparing every old child to every new child.

Because React only compares nodes level-by-level at the same tree depth and uses keys for siblings, it visits each node a constant number of times, resulting in $O(n)$ complexity.

**Q: What is the exact difference between rendering, reconciliation, and committing?**

These represent three distinct stages in React's update pipeline:
- **Rendering**: React executes component functions (or class `render` methods) to produce a new tree of React elements (virtual descriptions of the UI).
- **Reconciliation**: React compares the newly rendered element tree against the current Fiber tree to identify differences. It flags Fiber nodes with effect tags (like Placement, Update, ChildDeletion). This is still in memory and does not touch the DOM.
- **Committing**: React takes the list of effect tags produced during reconciliation and synchronously applies the actual changes to the real DOM (via ReactDOM). After DOM mutations are applied, React runs layout effects and passive effects (`useEffect`).

A component can render and undergo reconciliation without any commit work taking place if the returned output is identical to the previous render.

**Q: What happens when the root element type changes between renders (e.g., from `<div>` to `<section>` or `<ComponentA>` to `<ComponentB>`)?**

When the element type changes at a given tree position, React executes a full subtree replacement:
1. The entire old subtree is torn down.
2. All DOM nodes in that subtree are removed from the browser document.
3. Component instances in that subtree are unmounted, running their respective cleanup functions (`useEffect` return callbacks).
4. All local state held anywhere inside that subtree is permanently destroyed.
5. The new element subtree is mounted from scratch with initial state, creating brand-new DOM nodes.

Even if the children of the new element are visually and structurally identical to the old children, changing the parent container's type destroys all child component state.

**Q: Why is using array index as a `key` considered an anti-pattern when rendering dynamic lists?**

When you use an array index as a key (`key={index}`), the key is tied to the item's position in the array, not to the item's actual data identity.

If you insert, delete, or sort items in the list:
- An item moved from index 0 to index 1 receives the key `1`.
- React compares the new item at index 0 with the old item at key `0`.
- Because the keys match (`0 === 0`), React assumes the component at position 0 did not move and merely received updated props.
- React reuses the existing DOM node and preserves local component state (such as uncontrolled `<input>` text, checkbox toggle states, or CSS transitions).
- As a result, the UI will display the new text props over the old component's local state, causing severe visual bugs and unnecessary DOM re-renders.

**Q: Does reconciliation always result in real DOM mutations?**

No. Reconciliation merely calculates whether differences exist. If a parent component re-renders, all of its child components re-render by default, producing new React elements. 

React reconciles those new child elements against the previous Fiber nodes. If React discovers that the attributes, styles, and text content returned by a child are identical to what is already on the screen, React generates zero DOM mutations for that child. The render and reconciliation cost was incurred in JavaScript, but the commit phase performs no browser DOM operations.

**Q: How does React Fiber relate to the reconciliation process?**

React Fiber is the internal engine and data structure that powers reconciliation. Before Fiber (in React 15 and earlier), reconciliation used a synchronous recursive walk down the tree (the "Stack Reconciler") that could not be interrupted once started.

Fiber represents every component and DOM element as an individual unit of work—a JavaScript object called a Fiber node linked via `child`, `sibling`, and `return` pointers. This linked-list architecture allows React to pause reconciliation work after any individual node, yield execution back to the browser to handle high-priority user input or animations, and resume reconciliation later without dropping frames.

**Q: How can you deliberately force React to reset a component's state without unmounting the parent?**

You can change the component's `key` prop. 

When React reconciles two renders and notices that a component at the same tree position has a different `key` than before (e.g., `<UserProfile key={userId} />`), React treats the component as a completely different entity. It unmounts the old component instance, discards its existing state, and mounts a fresh instance with clean initial state. This is the idiomatic React way to reset forms, video players, or detail views when switching selected items.

## 6. The Traps — What Goes Wrong

### Trap 1: Declaring Components Inside Another Component's Render Function

**The Wrong Assumption:** Developers sometimes define a helper sub-component inside a parent component's body for convenience or to capture parent scope variables.

```tsx
// ❌ BROKEN: Nested component declaration
function UserDashboard() {
  const [text, setText] = useState('');

  // This creates a brand new function reference (new component type) on EVERY render!
  function ProfileInput() {
    const [localValue, setLocalValue] = useState('');
    return <input value={localValue} onChange={e => setLocalValue(e.target.value)} />;
  }

  return (
    <div>
      <input value={text} onChange={e => setText(e.target.value)} />
      <ProfileInput />
    </div>
  );
}
```

**Why It Fails:** On every keystroke in the outer input, `UserDashboard` re-renders. A new `ProfileInput` function is created in memory. During reconciliation, React checks `oldElement.type === newElement.type`. Because the function reference changed, React sees a different component type! React tears down the old `ProfileInput`, destroys its state, and remounts a new input. The input loses focus after every single character typed.

**The Fix:** Always declare components at the module root level and pass required data via props.

```tsx
// ✅ FIXED: Declared at module scope
function ProfileInput() {
  const [localValue, setLocalValue] = useState('');
  return <input value={localValue} onChange={e => setLocalValue(e.target.value)} />;
}

function UserDashboard() {
  const [text, setText] = useState('');
  return (
    <div>
      <input value={text} onChange={e => setText(e.target.value)} />
      <ProfileInput />
    </div>
  );
}
```

### Trap 2: Using Non-Deterministic Keys (Like `Math.random()`)

**The Wrong Assumption:** To silence the React list warning, a developer writes `key={Math.random()}` or `key={uuid()}` directly inside the JSX map callback.

```tsx
// ❌ BROKEN: Generating new keys on every render
<ul>
  {items.map(item => (
    <ListItem key={Math.random()} item={item} />
  ))}
</ul>
```

**Why It Fails:** On every render, every item gets a brand-new key. During reconciliation, React cannot match any key from the previous render. It unmounts all existing DOM nodes and instances, rebuilds them from scratch, and runs all mount effects again. This destroys scrolling performance, resets local state, and causes visual flickering.

**The Fix:** Use stable identifiers from your data model (e.g., `item.id` from the database).

```tsx
// ✅ FIXED: Stable identifier
<ul>
  {items.map(item => (
    <ListItem key={item.id} item={item} />
  ))}
</ul>
```

### Trap 3: Mutating State Directly and Expecting Reconciliation to Detect It

**The Wrong Assumption:** Developers push an item into an existing array or mutate an object property, then pass that same object to state.

```tsx
// ❌ BROKEN: Direct mutation
const [user, setUser] = useState({ name: 'Alice', role: 'user' });

const promoteUser = () => {
  user.role = 'admin'; // Mutating existing object
  setUser(user);       // Passing the same reference
};
```

**Why It Fails:** When React begins reconciliation, the first thing it checks in `useState` is `Object.is(prevState, nextState)`. Because `user` is the exact same object reference in memory, React bails out immediately and skips diffing the component and its children altogether. The UI does not update.

**The Fix:** Always return a new object reference using the spread operator or immutable update patterns.

```tsx
// ✅ FIXED: New object reference
const promoteUser = () => {
  setUser(prev => ({ ...prev, role: 'admin' }));
};
```

### Trap 4: Assuming `React.memo` Stops All Re-Renders in Subtrees

**The Wrong Assumption:** Wrapping a child component in `React.memo` guarantees it will never re-render unless its props change.

**Why It Fails:** `React.memo` only checks incoming props from the parent. If the memoized component internally subscribes to a React Context (`useContext`) or manages its own state (`useState`), any change to that context or local state will bypass the prop memoization and trigger reconciliation for that component.

**The Fix:** Understand that `React.memo` optimizes parent-driven prop updates only. To prevent context-driven renders, split contexts into smaller providers or use memoized selectors.

### Trap 5: Changing Tag Wrappers Conditionally and Losing Form State

**The Wrong Assumption:** Conditionally wrapping an input form with a styled card or raw container based on a layout toggle without realizing it wipes child inputs.

```tsx
// ❌ DANGEROUS: Type mismatch destroys child form state
{isCardView ? (
  <div className="card-container">
    <CheckoutForm />
  </div>
) : (
  <section className="plain-container">
    <CheckoutForm />
  </section>
)}
```

**Why It Fails:** React sees `div` vs `section` at the root of that branch. It treats it as an entirely different tree, unmounting `CheckoutForm` and losing whatever the user had already typed into the inputs.

**The Fix:** Keep the element type identical and toggle the CSS class or style instead.

```tsx
// ✅ FIXED: Same element type preserves CheckoutForm instance and state
<div className={isCardView ? 'card-container' : 'plain-container'}>
  <CheckoutForm />
</div>
```

## 7. Compare With Related Concepts

| Concept | What It Is | How It Relates to Reconciliation | One-Line Decision Rule |
| :--- | :--- | :--- | :--- |
| **Reconciliation vs Rendering** | Rendering is the execution of component functions to produce React elements. | Rendering produces the new blueprint; reconciliation compares the new blueprint with the old one to find differences. | Use *rendering* when talking about producing UI descriptions; use *reconciliation* when talking about computing the diff between renders. |
| **Reconciliation vs Virtual DOM** | Virtual DOM is the in-memory tree data structure of JavaScript objects representing the UI. | Virtual DOM is the data format; reconciliation is the algorithm that diffs two Virtual DOM / Fiber trees. | Virtual DOM is the noun (the tree structure); reconciliation is the verb (the comparison process). |
| **Reconciliation vs Commit Phase** | Commit is the phase where React applies calculated mutations to the actual browser DOM. | Reconciliation calculates what needs to change; commit actually applies those changes to the screen. | Reconciliation is pure and interruptible in memory; committing is synchronous and touches the real DOM. |
| **Reconciliation vs Browser Reflow/Repaint** | Browser Reflow/Repaint is the browser layout and pixel rendering pipeline. | Reconciliation calculates the minimal DOM mutations so the browser runs as few reflows and repaints as possible. | Reconciliation runs inside JavaScript engine memory; reflow/repaint runs inside the browser's layout/rendering engine. |

## 8. 🧠 The Memory Hook

Reconciliation is React's blueprint inspector: if the room type changes, it demolishes the whole room; if only the paint changed, it touches only the paint; and if list items have name tags, it moves the furniture instead of throwing it away.
