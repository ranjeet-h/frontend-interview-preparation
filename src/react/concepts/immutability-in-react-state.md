# Immutability in React State

## Detailed explanation
Immutability in React means you do not change existing state objects or arrays directly. Instead, you create a new value that includes the change. React uses object identity to decide whether values changed, and immutable updates make that identity meaningful.

This is especially important for arrays and objects. Mutating state can cause stale UI, broken memoization, hard-to-debug side effects, and incorrect assumptions about previous renders.

## 1. One-line mental model
Immutability means creating new state values instead of changing existing state objects or arrays in place.

## 2. Problem it solves
React relies on value identity to detect changes and schedule efficient updates. Mutating existing state can hide changes, create stale UI, and make previous renders impossible to reason about.

## 3. Core idea
- Do not mutate state objects or arrays directly.
- Create new arrays with methods like `map`, `filter`, and spread.
- Create new objects with object spread.
- Preserve unchanged nested values when updating deeply.
- Immer can make immutable updates easier.

## 4. Visual / analogy
Immutable updates are like submitting a revised document copy instead of scribbling on the archived original.

```mermaid
flowchart LR
  Old["Old state"] --> Copy["Create copy with change"]
  Copy --> New["New state reference"]
  New --> React["React sees changed identity"]
```

## 5. Minimal example

```tsx
setUser((user) => ({
  ...user,
  name: "Asha",
}));
```

## 6. Real-world example

```tsx
setTodos((todos) =>
  todos.map((todo) =>
    todo.id === id ? { ...todo, completed: !todo.completed } : todo,
  ),
);
```

The array and changed todo object are new, while unchanged todo objects keep their identity.

## 7. Common interview questions
#### Why should React state be immutable?
- **The Engine Mechanism (Why it behaves this way):** React uses object identity (reference equality via `Object.is`) to detect state changes. When you call `setState`, React compares the new state value with the previous one. If they're the same reference (`Object.is(oldState, newState) === true`), React assumes nothing changed and may skip the re-render. If you mutate the existing object (`state.name = "new"`), the reference stays the same, so React doesn't detect the change. By creating a new object (`{ ...state, name: "new" }`), you create a new reference, and React detects the change, schedules a re-render, and updates the DOM. Immutability also ensures that each render captures a snapshot of state at that moment — previous renders' state values remain unchanged, which is essential for React's concurrent rendering and time-travel debugging.
- **The Unforgettable Mental Model:** The **Photo Album**. Each render takes a photo (snapshot) of the current state. If you scribble on the photo (mutate), you've ruined that moment in time. If you take a new photo with changes (new reference), you preserve both moments. React needs the photos to stay intact to compare them.
- **The Trap:** Thinking `const` makes objects immutable. `const` only prevents reassignment of the variable — it doesn't prevent mutation of the object's properties. `const obj = { a: 1 }; obj.a = 2;` works fine.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: React state must be immutable because React uses reference equality to detect changes. When you create a new object or array, React sees a new reference and knows to re-render. If you mutate the existing object, the reference stays the same, and React may skip the update. Immutability also ensures that each render has a consistent snapshot of state, which is essential for concurrent rendering, debugging, and memoization."

#### What happens if you mutate state directly?
- **The Engine Mechanism (Why it behaves this way):** Direct state mutation causes several problems: (1) **Stale UI** — React compares the mutated object with itself (same reference), sees no change, and skips the re-render. The DOM shows old data. (2) **Broken memoization** — `React.memo`, `useMemo`, and `useCallback` use reference equality to decide whether to skip work. Mutated objects appear unchanged, so memoized components don't update. (3) **Stale closures** — effects and callbacks that captured the old state reference see the mutated value, which may be partially updated or inconsistent. (4) **Concurrent rendering bugs** — React's Fiber architecture may pause and resume render work. If state is mutated during a paused render, the resumed work sees corrupted state. (5) **Time-travel debugging breaks** — DevTools can't show previous state values because they were mutated in place.
- **The Unforgettable Mental Model:** The **Shared Diary**. If everyone writes directly in the same diary (mutates shared state), you can't tell who wrote what when, and you can't go back to read previous entries. If everyone writes in their own copy (immutable updates), the history is preserved.
- **The Trap:** Mutating state and seeing the UI update anyway. This sometimes happens because React's batching or other state updates trigger a re-render that happens to pick up the mutated value. But this is unreliable and breaks in production.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Direct state mutation causes stale UI because React doesn't detect the change — the object reference stays the same. It also breaks memoization, causes stale closures in effects, and creates bugs in concurrent rendering. Sometimes the UI appears to update because another state change triggers a re-render that picks up the mutated value, but this is unreliable. The fix is always to create a new object or array with the changes."

#### How do you update an object in state?
- **The Engine Mechanism (Why it behaves this way):** To update an object immutably, you create a new object that copies the existing properties and overrides the changed ones. The spread operator (`{ ...oldObject, changedProperty: newValue }`) creates a shallow copy — it copies all top-level properties to a new object reference. During the render phase, React's `useState` setter receives this new object, compares it with the previous state via `Object.is`, detects the new reference, and schedules a re-render. For nested objects, you must spread at each level of nesting: `{ ...user, address: { ...user.address, city: "New York" } }`. A shallow copy of the user object with a new `address` reference ensures React detects the change at both levels.
- **The Unforgettable Mental Model:** The **Document Revision**. You don't cross out words on the original document. You make a copy, change the words you need to, and submit the new version. The original stays archived for reference.
- **The Trap:** Shallow-copying an object but mutating a nested object. `{ ...user, address: user.address }` copies the address reference, not the address object. Mutating `newUser.address.city` still mutates the original.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I update objects immutably using the spread operator to create a shallow copy with the changed properties. For example, `setUser({ ...user, name: 'Asha' })` creates a new object with all of user's properties and an updated name. For nested objects, I spread at each level: `{ ...user, address: { ...user.address, city: 'New York' } }`. For deeply nested updates, I use Immer to write mutation-like code that produces immutable results."

#### How do you update an array in state?
- **The Engine Mechanism (Why it behaves this way):** To update an array immutably, you use non-mutating array methods that return new arrays: `map` (transform elements), `filter` (remove elements), `concat` or spread (add elements), `slice` (extract portions). These methods create new array references with the desired changes. During the render phase, React's setter receives the new array, detects the new reference via `Object.is`, and schedules a re-render. Mutating methods like `push`, `pop`, `splice`, `sort`, and `reverse` modify the existing array in place and should never be used directly on state. Instead, use spread to add (`[...arr, newItem]`), `filter` to remove (`arr.filter(item => item.id !== id)`), and `map` to transform (`arr.map(item => item.id === id ? { ...item, done: true } : item)`).
- **The Unforgettable Mental Model:** The **Photocopy Machine**. You don't write on the original document. You photocopy it (create new array), make your changes on the copy, and file the copy as the new version. The original stays untouched.
- **The Trap:** Using `sort()` or `reverse()` directly on state arrays. These methods mutate the array in place. Use `[...arr].sort()` to create a sorted copy.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I update arrays immutably using non-mutating methods. To add: spread or concat — `[...todos, newTodo]`. To remove: filter — `todos.filter(t => t.id !== id)`. To update an element: map — `todos.map(t => t.id === id ? { ...t, done: true } : t)`. I never use mutating methods like push, splice, sort, or reverse directly on state arrays. For complex updates, I use the functional updater form `setTodos(prev => ...)` to ensure I'm working with the latest state."

#### What is structural sharing?
- **The Engine Mechanism (Why it behaves this way):** Structural sharing is an optimization where immutable updates reuse unchanged parts of the data structure instead of copying everything. When you update one property of an object with spread (`{ ...user, name: "new" }`), JavaScript creates a new object for the top level, but the unchanged properties (like `user.address`, `user.preferences`) keep their original references. They're shared between the old and new objects. This is efficient because unchanged nested objects don't need to be copied. Libraries like Immutable.js and Immer use structural sharing extensively — they create new references only along the "path" of the change, sharing everything else. React benefits from this because memoized child components that receive unchanged nested objects skip re-rendering (their props' references haven't changed).
- **The Unforgettable Mental Model:** The **Tree Grafting**. When you graft a new branch onto a tree, you don't replant the entire tree. You keep the trunk and existing branches (shared structure) and only replace the one branch that changed (new reference).
- **The Trap:** Assuming structural sharing happens automatically for deep copies. JavaScript's spread operator only does shallow copies — it shares top-level properties but doesn't automatically share deeply nested structures. You must manually spread at each level.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Structural sharing is when immutable updates reuse unchanged parts of the data structure instead of copying everything. When I spread an object, the unchanged properties keep their original references — they're shared between old and new objects. This is efficient and helps React's memoization: child components receiving unchanged nested objects skip re-rendering because their prop references haven't changed. Libraries like Immer automate structural sharing for deeply nested updates."

#### What is Immer?
- **The Engine Mechanism (Why it behaves this way):** Immer is a library that lets you write mutation-like code that produces immutable updates. It works by creating a "draft" — a Proxy object that wraps your current state. When you mutate the draft (`draft.user.name = "Asha"`), Immer tracks which properties changed. When you finish, Immer produces a new state object that shares unchanged parts with the original (structural sharing) and has new references only for the changed path. Under the hood, Immer uses JavaScript Proxies to intercept property access and mutations, building a change tree. The final `produce` call applies these changes immutably. In React, `useImmer` provides a `setState`-like API where the updater function receives a draft and can mutate it directly.
- **The Unforgettable Mental Model:** The **Magic Tracing Paper**. You place tracing paper (draft) over the original document (state). You draw changes on the tracing paper (mutate the draft). When you lift it, Immer creates a new document that combines the original with your changes, leaving the original untouched.
- **The Trap:** Overusing Immer for simple updates. For shallow object or array updates, spread operator is simpler and has no dependency. Immer shines for deeply nested state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Immer is a library that lets you write mutation-like code while producing immutable updates. It creates a draft Proxy of your state, tracks your mutations, and produces a new immutable state with structural sharing. I use it for deeply nested state updates where manual spread becomes unreadable. For simple shallow updates, the spread operator is sufficient. Immer's `useImmer` hook provides a clean API: `updateUser(draft => { draft.name = 'Asha' })`."

#### How does immutability help memoization?
- **The Engine Mechanism (Why it behaves this way):** Memoization (`React.memo`, `useMemo`, `useCallback`) uses reference equality (`Object.is`) to decide whether to skip re-computation. If the input references haven't changed, the memoized result is reused. Immutability makes reference equality meaningful: if state is updated immutably, a new reference means the data changed, and a same reference means it didn't. If state were mutable, the reference could stay the same even though the data changed, causing memoized components to show stale data. With immutable updates, `React.memo` can safely skip re-rendering when props haven't changed, because a same reference guarantees the data is identical. This is the foundation of React's performance optimization strategy.
- **The Unforgettable Mental Model:** The **Sealed Envelope System**. Each envelope (object reference) contains a document (data). If the seal is unbroken (same reference), you know the document hasn't changed. If you get a new envelope (new reference), you know to check the new document. Without seals (mutable state), you can't trust the envelope — the document inside might have been swapped.
- **The Trap:** Memoizing everything without understanding what changed. Memoization only helps when the memoized value is expensive to compute and the inputs change infrequently.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Immutability is the foundation of memoization because memoization relies on reference equality to detect changes. When state is updated immutably, a new reference means the data changed, and the same reference means it didn't. This allows React.memo to safely skip re-rendering when props haven't changed, and useMemo to skip re-computation when inputs are the same. Without immutability, reference equality is meaningless — the data could have changed while the reference stayed the same, causing stale UI."

## 8. Active recall test
1. **Why is `state.push(item)` wrong?**
   - **Explanation:** `push()` mutates the existing array in place — the array reference stays the same. React compares the new state with the old state using `Object.is`, sees the same reference, and skips the re-render. The UI doesn't update. Use `[...state, item]` instead to create a new array reference.
2. **How do you remove an item immutably?**
   - **Explanation:** Use `filter()` to create a new array excluding the item: `setItems(items.filter(item => item.id !== idToRemove))`. Filter returns a new array reference containing only the elements that pass the test, leaving the original array unchanged.
3. **How do you update one object inside an array?**
   - **Explanation:** Use `map()` to create a new array where the matching element is replaced with a new object: `setItems(items.map(item => item.id === id ? { ...item, completed: true } : item))`. This creates a new array reference and a new object for the changed item, while sharing references for unchanged items.
4. **What does new reference mean?**
   - **Explanation:** A new reference means a new object or array in memory — a different memory address. React uses `Object.is()` to compare references. A new reference signals to React that the state has changed and a re-render is needed. The same reference signals no change.
5. **How does immutability help debugging?**
   - **Explanation:** Each render captures a snapshot of state that never changes. You can log state at any point and trust it represents that moment. React DevTools can show state history, time-travel debugging works, and you can't have stale data from partially completed mutations.

## 9. Mistakes / traps
- Using mutating array methods like `push`, `splice`, `sort`, or `reverse` directly on state.
- Shallow-copying an object but mutating a nested object.
- Thinking `const` makes an object immutable.
- Mutating props because they are objects.
- Over-copying large structures without considering normalized state.

## 10. Compare with related concepts
- **Immutability vs `const`:** `const` prevents reassignment, not object mutation.
- **Immutability vs deep clone:** immutable updates copy only the changed path, not always the entire tree.
- **Immutability vs Immer:** Immer lets you write mutation-like code that produces immutable updates.
- **Immutability vs memoization:** immutability supports memoization by making identity meaningful.

## 11. Summary from memory
Explain how to toggle a todo item without mutating state and why React cares about the new references.

## 12. Spaced revision prompts
- After 1 day: Define immutability.
- After 3 days: Update an array immutably.
- After 7 days: Explain shallow copy vs nested mutation.
- After 14 days: Compare manual immutable updates and Immer.
