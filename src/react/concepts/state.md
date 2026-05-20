# State in React

## Detailed explanation
State is data a component owns and remembers between renders. When state changes, React schedules another render so the UI can reflect the new value. Examples include input text, selected tab, open modal state, expanded rows, and local counters.

State should be minimal, colocated, and immutable. If a value can be calculated from props or existing state, it usually should not be stored separately. This avoids duplicated state and keeps rendering predictable.

## 1. One-line mental model
State is component-owned data that can change over time and cause React to render updated UI.

## 2. Problem it solves
Interactive UIs need to remember things: input values, open panels, selected tabs, fetched results, and user choices. State gives React a structured way to store changing data and update the screen when it changes.

## 3. Core idea
- State belongs to the component that owns the behavior.
- Updating state schedules a re-render.
- State should be treated immutably.
- Derived values should usually be calculated during render, not duplicated in state.
- State should live as close as possible to where it is used.

## 4. Visual / analogy
State is the component's memory.

```mermaid
flowchart LR
  Event["User clicks"] --> Setter["setState"]
  Setter --> Render["Component renders again"]
  Render --> UI["Updated UI"]
```

## 5. Minimal example

```tsx
function Counter() {
  const [count, setCount] = React.useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

## 6. Real-world example

```tsx
function Tabs({ tabs }: { tabs: Tab[] }) {
  const [activeId, setActiveId] = React.useState(tabs[0].id);

  return (
    <>
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => setActiveId(tab.id)}>
          {tab.label}
        </button>
      ))}
      <TabPanel tab={tabs.find((tab) => tab.id === activeId)} />
    </>
  );
}
```

The selected tab is state because it changes through interaction.

## 7. Common interview questions
#### What is state in React?
- **The Engine Mechanism (Why it behaves this way):** State is data that a component owns, remembers between renders, and can update over time. In functional components, state is created with `useState` or `useReducer`. React stores state values in the component's Fiber node, indexed by the order of hook calls. When a state setter is called, React schedules a re-render — it doesn't update the variable immediately. During the next render, `useState` returns the new value. State is local to the component instance; each instance of a component has its own independent state.
- **The Unforgettable Mental Model:** The **Component's Memory**. State is what a component remembers between visits. Like a person's memory, it persists across interactions but is private to that individual — one component's state doesn't affect another's.
- **The Trap:** Thinking state updates are synchronous. Calling `setState(newValue)` doesn't change the state variable immediately — the new value is available on the next render.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: State is data that a component owns and manages internally. It persists between renders and triggers re-renders when updated. In functional components, I use useState to create state variables. When I call the setter function, React schedules a re-render, and on the next render, the state variable holds the new value. State is local to each component instance — two instances of the same component have independent state."

#### How is state different from props?
- **The Engine Mechanism (Why it behaves this way):** State is owned and managed by the component itself, while props are received from a parent component. State changes are initiated by the component through setter functions; props change when the parent passes new values. In React's Fiber architecture, state is stored on the Fiber node of the component instance, while props are stored on the element object that describes the component. Both trigger re-renders when they change, but the ownership and control flow are inverted: the component controls its own state but has no control over its props.
- **The Unforgettable Mental Model:** The **Puppet vs. the Puppeteer**. Props are the strings the puppeteer (parent) pulls to control the puppet (child). State is the puppet's own internal mechanisms — like a wind-up toy that moves on its own.
- **The Trap:** Duplicating props in state. When you do `const [name, setName] = useState(props.name)`, you create two sources of truth. If the parent updates `props.name`, the local state won't update automatically.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: State is data a component owns and manages itself, while props are data received from a parent. State changes through the component's own setter functions; props change when the parent passes new values. A simple rule: if the parent controls the value, it's a prop. If the component controls it, it's state. And if a value can be derived from props or existing state, it shouldn't be stored at all — calculate it during render instead."

#### Why should state be immutable?
- **The Engine Mechanism (Why it behaves this way):** React relies on reference equality to detect state changes. When you call a state setter, React compares the new state value with the previous one using `Object.is`. If you mutate an object or array in place (e.g., `state.items.push(newItem)`), the reference doesn't change, so React may skip the re-render or render with stale data. By creating new objects/arrays (e.g., `setState({ ...state, items: [...state.items, newItem] })`), you guarantee a new reference, which ensures React detects the change and schedules a re-render. Immutability also enables time-travel debugging, undo/redo patterns, and memoization optimizations.
- **The Unforgettable Mental Model:** The **Photocopy vs. the Eraser**. Immutable updates are like making a photocopy and writing changes on the copy — the original stays intact. Mutable updates are like erasing and rewriting on the original — you lose the history and React can't tell anything changed.
- **The Trap:** Using `push`, `splice`, or direct property assignment on state objects/arrays. These mutate in place and don't trigger re-renders reliably.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: State should be immutable because React detects changes through reference comparison. If I mutate an object or array in place, the reference stays the same and React may not re-render. By creating new objects — spreading, using map/filter, or immutable update patterns — I guarantee a new reference that React can detect. Immutability also makes state predictable: I can reason about what the state was at any point in time, which simplifies debugging and enables optimizations like memoization."

#### Why does state not update immediately?
- **The Engine Mechanism (Why it behaves this way):** When you call a state setter, React doesn't update the state variable synchronously. Instead, it queues the update and schedules a re-render. During the render phase, React processes all queued state updates and computes the new state values. This batching behavior allows React to combine multiple state updates into a single render pass, improving performance. In React 18, automatic batching extends this to updates inside promises, setTimeout, and native event handlers. The state variable in the current render closure retains its old value because closures capture values at creation time, not at execution time.
- **The Unforgettable Mental Model:** The **Restaurant Kitchen**. When you place an order (call setState), the kitchen doesn't instantly produce the meal. It queues your order, batches it with other orders, and serves everything together. You can't eat the meal until the next course (next render).
- **The Trap:** Reading state immediately after calling the setter and expecting the new value. The variable in the current closure still holds the old value.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: State doesn't update immediately because React batches state updates for performance. When I call a setter, React queues the update and schedules a re-render. The state variable in the current render closure keeps its old value because closures capture values at creation time. The new value is available on the next render. If I need to compute something based on the new state, I can either do it in the next render or use a functional update pattern: `setState(prev => prev + 1)`."

#### What is derived state?
- **The Engine Mechanism (Why it behaves this way):** Derived state is a value that can be calculated from existing props or state during render, rather than stored separately. For example, `const fullName = firstName + ' ' + lastName` is derived from two state variables. React recomputes derived values on every render, which is typically inexpensive. Storing derived values in separate state variables creates duplication and synchronization bugs — you'd need to update both source and derived state whenever the source changes. For expensive computations, `useMemo` caches the derived value and only recomputes when dependencies change.
- **The Unforgettable Mental Model:** The **Shadow**. Derived state is like a shadow — it's entirely determined by the object (source state) that casts it. You don't store the shadow separately; it exists as a natural consequence of the object's position.
- **The Trap:** Storing derived values in state with `useState`, then trying to keep them in sync with `useEffect`. This creates a "derived state anti-pattern" where two sources of truth can diverge.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Derived state is a value calculated from existing props or state during render, rather than stored separately. For example, if I have firstName and lastName in state, fullName should be derived as `firstName + ' ' + lastName` during render, not stored in its own state variable. Storing derived values creates two sources of truth that can get out of sync. For expensive calculations, I use useMemo to cache the result and only recompute when dependencies change."

#### Where should state live?
- **The Engine Mechanism (Why it behaves this way):** State should live in the lowest common ancestor of all components that need it — a principle called "state colocation." If only one component needs a value, state lives in that component. If a parent and child both need it, state lives in the parent. If siblings need to share it, state lives in their common parent. This minimizes the number of components that re-render when state changes, because React only re-renders the component that owns the state and its descendants. Lifting state too high causes unnecessary re-renders across the entire tree; keeping state too low forces prop drilling or duplication.
- **The Unforgettable Mental Model:** The **Library Branch**. State should live in the branch closest to the readers who need it. If only one neighborhood needs a book, keep it in the local branch. If the whole city needs it, put it in the central library. Don't put every book in the national archive.
- **The Trap:** Putting all state in a global store (Redux, Zustand) by default. This causes every state change to potentially affect every component that subscribes to the store, even when the change is only relevant to one small part of the UI.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: State should live as close as possible to where it's used — this is called state colocation. If only one component needs a value, state lives there. If multiple components need it, I lift it to their lowest common ancestor. I avoid putting state too high in the tree because it causes unnecessary re-renders, and I avoid global stores for local state because it adds complexity and performance overhead. The goal is to minimize the surface area affected by each state change."

#### What is state colocation?
- **The Engine Mechanism (Why it behaves this way):** State colocation means placing state in the component that uses it, rather than in a parent or global store. When state is colocated, only that component re-renders when the state changes, because React's re-render cascade starts from the state owner and flows downward. If the same state were lifted to a parent, the parent and all its children would re-render, even those that don't use the state. Colocation is a performance optimization that also improves code organization — related state and behavior live together, making the component easier to understand and maintain.
- **The Unforgettable Mental Model:** The **Tool Belt**. A carpenter keeps the tools they use most often on their belt (colocated), not in a warehouse across town. This minimizes travel time (re-renders) and keeps related tools together.
- **The Trap:** Over-colocating state that should be shared. If two sibling components need the same state, colocating it in one of them forces the other to receive it through props or context, which can be more complex than lifting it to the parent.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: State colocation means keeping state in the component that actually uses it, rather than lifting it higher than necessary. This minimizes re-renders because only the component that owns the state and its descendants are affected by changes. It also improves code organization — state and the logic that uses it live together. I start with state colocated in the component that needs it, and only lift it when I discover that other components genuinely need access to the same data."

#### When should state be lifted up?
- **The Engine Mechanism (Why it behaves this way):** State should be lifted up when multiple sibling components need to read or modify the same data, or when a parent needs to coordinate behavior between children based on shared state. Lifting state means moving it from a child component to their common parent, which then passes the state down as props and provides callbacks for children to request changes. This creates a single source of truth for the shared data. The trade-off is that the parent and all its children re-render when the lifted state changes, so lifting should only be done when necessary.
- **The Unforgettable Mental Model:** The **Shared Whiteboard**. When two team members need to reference the same information, they put it on a shared whiteboard (parent's state) instead of each keeping their own notebook (local state).
- **The Trap:** Lifting state prematurely. If only one component needs the state, lifting it adds unnecessary prop passing and re-renders. Lift only when you actually have multiple consumers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I lift state up when multiple sibling components need to share the same data, or when a parent needs to coordinate children based on shared state. Lifting creates a single source of truth in the common parent, which passes the state down as props and provides callbacks for children to request changes. I don't lift state preemptively — I start with it colocated and only lift when I discover that other components genuinely need access. This keeps the component tree lean and minimizes unnecessary re-renders."

## 8. Active recall test
1. **What happens when state is updated?**
   - **Explanation:** React queues the state update, schedules a re-render, and during the next render phase, `useState` returns the new value. The current render closure still holds the old value. React batches multiple state updates into a single render pass for performance.
2. **Why should arrays and objects in state not be mutated?**
   - **Explanation:** React detects state changes through reference comparison (`Object.is`). Mutating an array or object in place doesn't change the reference, so React may skip the re-render or render with stale data. Creating new objects/arrays guarantees a new reference that React can detect.
3. **What is duplicated state?**
   - **Explanation:** Duplicated state occurs when the same data is stored in multiple places — for example, storing both `firstName` and `fullName` in state when `fullName` can be derived from `firstName` and `lastName`. This creates multiple sources of truth that can diverge, causing bugs.
4. **When should state move to a parent?**
   - **Explanation:** State should move to a parent (lift up) when multiple sibling components need to read or modify the same data, or when a parent needs to coordinate behavior between children based on shared state. The parent becomes the single source of truth and passes state down as props.
5. **Why is state called component memory?**
   - **Explanation:** Like human memory, state persists between interactions (renders) and influences how the component behaves and appears. Each component instance has its own independent "memory" — one component's state doesn't affect another's. State is what the component remembers from one render to the next.

## 9. Mistakes / traps
- Mutating state directly.
- Storing values that can be derived from existing state or props.
- Putting all state in a global store.
- Expecting state variables to change immediately after calling the setter.
- Keeping state too high in the tree and causing extra re-renders.

## 10. Compare with related concepts
- **State vs props:** state is owned locally; props are received.
- **State vs ref:** state changes re-render; ref changes do not.
- **State vs derived value:** state is stored; derived value is calculated.
- **State vs server cache:** server cache mirrors backend-owned data.

## 11. Summary from memory
Explain how state drives a tab component and why the active tab should not be hardcoded in the DOM.

## 12. Spaced revision prompts
- After 1 day: Define state and props.
- After 3 days: Explain immutable updates.
- After 7 days: Identify duplicated state in an example.
- After 14 days: Explain state colocation and lifting state up.
