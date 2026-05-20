# Rules of Hooks

## Detailed explanation
The Rules of Hooks are constraints that keep React's hook state mapping predictable. Hooks must be called at the top level of React function components or custom hooks, not inside conditions, loops, nested functions, or after early returns.

React relies on call order to associate each hook call with its stored state. If hook order changes between renders, React can attach the wrong state to the wrong hook.

## 1. One-line mental model
Hooks must run in the same order on every render.

## 2. Problem it solves
React needs a stable way to match hook calls to stored hook state across renders.

## 3. Core idea
- Call hooks only at top level.
- Call hooks only from React components or custom hooks.
- Do not call hooks conditionally.
- Move conditions inside the hook body when needed.
- Use lint rules to catch violations.

## 4. Visual / analogy
Hook order is like numbered lockers: if you skip locker 2, everyone after it gets the wrong locker.

```txt
Render 1: useState -> useEffect -> useMemo
Render 2: useState ->            useMemo  // broken order
```

## 5. Minimal example

```tsx
function Component({ enabled }: { enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled) return;
    start();
  }, [enabled]);
}
```

## 6. Real-world example

```tsx
function useFeatureFlag(name: string) {
  const flags = React.useContext(FeatureFlagContext);
  return Boolean(flags[name]);
}
```

The custom hook follows the rules and can be reused safely.

## 7. Common interview questions
#### What are the Rules of Hooks?
- **The Engine Mechanism (Why it behaves this way):** The Rules of Hooks are two constraints: (1) Only call hooks at the top level of React function components or custom hooks — not inside loops, conditions, or nested functions. (2) Only call hooks from React function components or custom hooks — not from regular JavaScript functions. React enforces these rules because it uses a linked list of hook objects on each Fiber node, and the position in this list determines which hook gets which state. If hooks are called conditionally, the list order changes between renders, and React attaches the wrong state to the wrong hook call.
- **The Unforgettable Mental Model:** The **Numbered Lockers**. Each hook call is assigned a locker number based on its position: first call gets locker 1, second gets locker 2, etc. If you skip locker 2 on one visit (conditional call), locker 3's contents go to locker 2's owner. Chaos ensues.
- **The Trap:** Thinking the rules are arbitrary style guidelines. They are hard requirements enforced by React's internal data structure. Violating them causes state to be attached to the wrong hooks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The Rules of Hooks are two constraints that React requires for hooks to work correctly. First, hooks must be called at the top level of function components or custom hooks — never inside conditions, loops, or nested functions. Second, hooks can only be called from React components or custom hooks, not from regular functions. These rules exist because React uses call order to map each hook call to its stored state. If the order changes between renders, React attaches state to the wrong hook, causing bugs that are extremely difficult to debug."

#### Why can't hooks be called conditionally?
- **The Engine Mechanism (Why it behaves this way):** React stores hooks as a singly linked list on the Fiber node: `workInProgressHook`. During render, React traverses this list, matching each hook call in the component with its corresponding stored state. The matching is purely positional — the first hook call in the component maps to the first hook in the list, the second call to the second hook, and so on. If a hook is called conditionally, the positions shift. For example, if `useEffect` is inside an `if` block that's false on render 2, the `useMemo` that was third is now second, and React reads `useEffect`'s state for `useMemo`, causing type mismatches and corrupted state.
- **The Unforgettable Mental Model:** The **Train Car Coupling**. Each hook call is a train car coupled in order. If you remove car 2 (conditional skip), car 3 couples to car 1's connector. The cargo (state) that belonged to car 3 is now on car 2's track. The train derails.
- **The Trap:** Putting a hook after an early return: `if (!data) return null; const [loading, setLoading] = useState(false)`. When `data` is null, the hook is skipped, breaking the order.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Hooks can't be called conditionally because React uses call order to map each hook to its stored state. Hooks are stored as a linked list on the Fiber node, and React matches hook calls to list entries by position. If a hook is skipped on one render but called on another, the positions shift, and React reads the wrong state for each hook. This causes state corruption — a `useState` might read an effect's data, or a `useMemo` might read a ref's value. The fix is to always call hooks unconditionally and put conditions inside the hook body instead."

#### Why must custom hooks start with `use`?
- **The Engine Mechanism (Why it behaves this way):** The `use` prefix is not enforced by React at runtime — it's a convention for tooling. The `eslint-plugin-react-hooks` linter scans for functions starting with `use` and applies the Rules of Hooks to their call sites. It ensures these functions are only called at the top level of components or other hooks. React DevTools also uses the prefix to identify and display custom hooks in the component inspector. Without the prefix, the linter treats the function as a regular function and won't catch hook rule violations.
- **The Unforgettable Mental Model:** The **Hazard Label**. The `use` prefix is like a hazard label on a chemical container — it tells the safety inspector (linter) "handle with special rules." Without the label, the inspector treats it as a regular item and doesn't apply the safety protocols.
- **The Trap:** Naming a function that calls hooks without the `use` prefix. The code works at runtime, but the linter won't catch violations, and bugs can slip through to production.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The `use` prefix is a convention that enables tooling. The ESLint plugin uses it to identify custom hooks and enforce the Rules of Hooks at their call sites. React DevTools uses it to display hook state in the component inspector. While React doesn't enforce the prefix at runtime, omitting it means the linter won't catch violations, and DevTools won't display the hook properly. It's a critical convention for code safety and developer experience."

#### What catches hook rule violations?
- **The Engine Mechanism (Why it behaves this way):** Two mechanisms catch violations: (1) The `eslint-plugin-react-hooks` ESLint plugin performs static analysis at build time, scanning code for hook calls inside conditions, loops, or non-component functions. It flags violations before the code runs. (2) React's development build includes runtime checks that verify hook call consistency. In StrictMode, React double-invokes components and compares the hook list between the two invocations. If the number or order of hooks differs, React throws an error: "Rendered more hooks than during the previous render."
- **The Unforgettable Mental Model:** The **Two-Layer Security**. The ESLint plugin is the metal detector at the entrance (catches issues before they enter). React's runtime check is the guard inside (catches anything that slipped through). Together, they provide defense in depth.
- **The Trap:** Disabling the ESLint rule instead of fixing the violation. The rule exists to prevent state corruption bugs that are extremely difficult to debug at runtime.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Hook rule violations are caught by two mechanisms. First, the `eslint-plugin-react-hooks` ESLint plugin catches them at build time through static analysis — it flags conditional hook calls, hooks in loops, and hooks in regular functions. Second, React's development build includes runtime checks that verify hook consistency between renders, especially in StrictMode. If the hook count or order changes, React throws an error. I never disable these rules — they prevent state corruption bugs that are nearly impossible to debug."

#### Can hooks be called in normal functions?
- **The Engine Mechanism (Why it behaves this way):** No. Hooks rely on the `currentlyRenderingFiber` global variable that React sets during component rendering. When a component function executes, React sets this variable to the component's Fiber node. Hook calls read this variable to know which Fiber to attach their state to. Normal JavaScript functions are called outside of React's rendering context, so `currentlyRenderingFiber` is `null` or points to a different component. Calling a hook in a normal function either throws an error ("Invalid hook call") or attaches state to the wrong component.
- **The Unforgettable Mental Model:** The **Power Outlet**. Hooks need to plug into React's rendering context (the power outlet). Normal functions don't have access to this outlet — they're running in a different room. Without power, the hook can't function.
- **The Trap:** Calling a hook inside an event handler, callback, or utility function: `function handleClick() { const [state, setState] = useState() }`. This throws "Invalid hook call."
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: No, hooks can only be called from React function components or custom hooks. Hooks rely on React's internal rendering context — specifically, the `currentlyRenderingFiber` variable that points to the component being rendered. Normal functions don't have this context, so calling a hook in them throws an 'Invalid hook call' error. If you need hook-like behavior in a normal function, you'd need to pass the state and setters as arguments instead."

#### How do you handle conditional effects?
- **The Engine Mechanism (Why it behaves this way):** Instead of conditionally calling `useEffect`, you always call it unconditionally and put the condition inside the effect callback. React will always register the effect in the same position in the hook list, maintaining order. Inside the effect, you check the condition and return early if it's not met. The dependency array still controls when the effect re-runs, but the condition inside controls whether the effect's body actually executes. This preserves hook order while achieving conditional behavior.
- **The Unforgettable Mental Model:** The **Always-Open Store with a Bouncer**. The store (useEffect) is always open (called unconditionally), but the bouncer (condition inside) decides who gets in. The store's location on the street (hook position) never changes.
- **The Trap:** Writing `if (condition) useEffect(() => {...}, [dep])`. This conditionally calls the hook, breaking the order. Instead, write `useEffect(() => { if (!condition) return; ... }, [dep, condition])`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle conditional effects by always calling `useEffect` unconditionally and putting the condition inside the effect body. Instead of `if (enabled) useEffect(...)`, I write `useEffect(() => { if (!enabled) return; ... }, [enabled, ...deps])`. This keeps the hook call order consistent while achieving the conditional behavior. The dependency array includes the condition variable so the effect re-runs when the condition changes, and the early return inside prevents unnecessary work when the condition isn't met."

#### What happens if hook order changes?
- **The Engine Mechanism (Why it behaves this way):** When hook order changes between renders, React's linked list traversal produces mismatches. Hook call A (position 1) reads state from list entry 1, but if a hook was skipped before it on this render, list entry 1 now contains state that belonged to a different hook call. This causes type mismatches — a `useState` might read a `useEffect`'s memoized state, a `useRef` might read a `useMemo`'s cached value. The result is unpredictable behavior: state values appearing in the wrong places, effects firing with wrong dependencies, and in the worst case, runtime crashes when React tries to process data of the wrong type.
- **The Unforgettable Mental Model:** The **Wrong Prescription**. If the pharmacist (React) gives you the medication (state) meant for patient B because your position in line changed, you get the wrong treatment. The consequences range from ineffective (wrong value) to dangerous (crash).
- **The Trap:** Thinking the bug will be obvious. Hook order bugs often manifest as subtle, intermittent issues — a value that's sometimes wrong, an effect that fires at the wrong time — making them extremely difficult to trace.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: If hook order changes, React attaches the wrong state to the wrong hook call. Hooks are stored in a linked list and matched by position, so shifting the order means a `useState` might read a `useEffect`'s data, or a `useRef` might read a `useMemo`'s value. The result is unpredictable — wrong values, effects firing incorrectly, or runtime crashes. In development, React's StrictMode catches this with an error about rendered hook count mismatch. In production, the bug manifests as subtle, intermittent issues that are very hard to debug. That's why the Rules of Hooks are non-negotiable."

## 8. Active recall test
1. **Why does hook order matter?**
   - **Explanation:** React stores hooks as a linked list on the Fiber node and matches each hook call to its state by position. If order changes, the wrong state is attached to the wrong hook, causing corruption.
2. **Where can hooks be called?**
   - **Explanation:** Only at the top level of React function components or custom hooks. Every call site must be unconditional and in the same order on every render.
3. **Where can hooks not be called?**
   - **Explanation:** Inside conditions, loops, nested functions, event handlers, or regular JavaScript functions. Also not after early returns in a component.
4. **How do you conditionally run effect logic?**
   - **Explanation:** Call `useEffect` unconditionally and put the condition inside: `useEffect(() => { if (!condition) return; ... }, [condition, ...deps])`.
5. **Why does linting matter?**
   - **Explanation:** The `eslint-plugin-react-hooks` plugin catches hook rule violations at build time through static analysis. It prevents state corruption bugs that are extremely difficult to debug at runtime.

## 9. Mistakes / traps
- Calling a hook after an early return.
- Calling hooks inside event handlers.
- Calling hooks in normal utility functions.
- Conditionally calling a custom hook.
- Disabling hook lint rules instead of fixing structure.

## 10. Compare with related concepts
- **Rules of Hooks vs dependency rules:** call-order rules decide where hooks run; dependency rules decide when effects/memos update.
- **Custom hook vs utility:** custom hooks can call hooks and must follow rules.
- **Conditional hook vs conditional logic:** hook call stays unconditional; logic inside can be conditional.

## 11. Summary from memory
Explain why React requires hooks to be called in the same order every render.

## 12. Spaced revision prompts
- After 1 day: List the two Rules of Hooks.
- After 3 days: Fix a conditional hook call.
- After 7 days: Explain hook order.
- After 14 days: Compare hook rules and dependency arrays.

