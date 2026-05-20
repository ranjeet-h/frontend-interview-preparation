# Avoiding Infinite Re-renders

## Detailed explanation
Infinite re-renders happen when rendering or effect logic updates state in a way that immediately triggers the same logic again. The app gets stuck in a loop: render, update state, render again, update state again.

Common causes include calling setters during render, effects that update their own dependencies every run, unstable object/function dependencies, and derived state stored unnecessarily.

## 1. One-line mental model
An infinite re-render is a feedback loop where rendering keeps scheduling itself again.

## 2. Problem it solves
Understanding the loop helps debug "Too many re-renders" errors and runaway effects.

## 3. Core idea
- Do not call state setters during render.
- Effects should not update dependencies without a guard.
- Avoid unnecessary derived state.
- Stabilize dependencies only when the design needs it.
- Move user-triggered updates to event handlers.

## 4. Visual / analogy
It is like a microphone too close to a speaker: output feeds input until it screams.

```mermaid
flowchart LR
  Render --> SetState["setState"]
  SetState --> Render
```

## 5. Minimal example

```tsx
// Wrong
function Bad() {
  const [count, setCount] = React.useState(0);
  setCount(count + 1);
  return <p>{count}</p>;
}
```

## 6. Real-world example

```tsx
React.useEffect(() => {
  if (status !== "ready") setStatus("ready");
}, [status]);
```

Guarding prevents repeated updates.

## 7. Common interview questions
#### What causes infinite re-renders?
- **The Engine Mechanism (Why it behaves this way):** React's rendering cycle is triggered by state updates. When a state update occurs during the render phase or inside an effect that runs without a guard, React schedules another render. If that render triggers the same state update again, the Fiber scheduler enters an infinite loop. React detects this after a threshold and throws the "Too many re-renders" error to prevent the browser from freezing.
- **The Unforgettable Mental Model:** The **Domino Circle**. Each domino (render) knocks over the next one (state update), which sets up the first domino again. Without breaking the chain, the dominos fall forever until someone stops the game.
- **The Trap:** Thinking only `setState` in render causes loops. Effects with unconditional state updates, unstable dependency objects, and derived state stored in `useState` are equally common culprits.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Infinite re-renders happen when a render or effect triggers a state update that causes the same render or effect to run again. Common causes include calling setters during render, effects that unconditionally update their own dependencies, creating new object references on every render and using them as dependencies, or storing derived values in state instead of computing them directly."

#### Why can't you call setState during render?
- **The Engine Mechanism (Why it behaves this way):** The render phase in React's Fiber architecture must be pure and idempotent. React may call component functions multiple times during rendering (especially in StrictMode and Concurrent Mode) to compute the new Virtual DOM tree. If `setState` is called during render, it schedules a new render while the current one is still in progress, creating a recursive loop. React's scheduler detects synchronous re-renders and throws an error to prevent stack overflow.
- **The Unforgettable Mental Model:** The **Painter Who Repaints Mid-Stroke**. Imagine a painter who, while painting a wall, decides the wall needs a different color and starts over — forever. The painting never finishes because each attempt triggers a new attempt.
- **The Trap:** Accidentally calling a setter by invoking it in JSX instead of passing it as a callback: `onClick={setCount(0)}` instead of `onClick={() => setCount(0)}`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The render phase must be pure because React may invoke component functions multiple times to compute the Virtual DOM. Calling `setState` during render schedules another render before the current one completes, creating an infinite loop. React detects this and throws an error. State updates should happen in event handlers or guarded effects, not during the render phase itself."

#### How can effects create loops?
- **The Engine Mechanism (Why it behaves this way):** Effects run after the commit phase. If an effect updates a value that's listed in its own dependency array, React schedules a re-render, which triggers the effect again. Without a conditional guard, this creates a render → effect → state update → render cycle. The Fiber scheduler tracks effect dependencies, and any change to a dependency triggers the effect to re-run after the next commit.
- **The Unforgettable Mental Model:** The **Echo Chamber**. You speak (effect runs), the echo comes back (state updates), you hear the echo and speak again (effect re-runs), creating an endless loop of your own voice bouncing back.
- **The Trap:** Adding a state update to an effect "just to initialize" something without checking whether it's already initialized. The fix is usually a conditional guard or moving the initialization to lazy state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Effects create loops when they update a value that's in their own dependency array without a conditional guard. For example, an effect that depends on `status` and unconditionally calls `setStatus('ready')` will re-run forever. The fix is to add a conditional check — only update if the value isn't already what you need — or to move the logic to lazy state initialization."

#### How do unstable dependencies cause loops?
- **The Engine Mechanism (Why it behaves this way):** React compares dependency array values using `Object.is` (referential equality for objects/functions). If you create an object or function inline during render — like `useEffect(() => {...}, [{ id: 1 }])` — a brand-new reference is created every render. React sees a "changed" dependency every time, re-runs the effect, and if that effect triggers a state update, you get an infinite loop.
- **The Unforgettable Mental Model:** The **Shape-Shifting Key**. Every time you try to unlock a door (run the effect), the key (dependency) changes shape slightly. The lock thinks it's a new key every time, so it keeps opening the door, which forges a new key, forever.
- **The Trap:** Memoizing everything to "fix" unstable dependencies. Often the real fix is to extract the primitive value you actually need from the dependency array, or restructure the logic.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Unstable dependencies cause loops because React compares references, not content. An inline object like `{ id: 1 }` creates a new reference every render, so the effect sees a 'changed' dependency each time. If the effect updates state, this triggers another render, creating a loop. The fix is to stabilize the reference with `useMemo` or extract the primitive values you actually depend on."

#### How do you fix derived-state loops?
- **The Engine Mechanism (Why it behaves this way):** Derived state happens when you store a value in `useState` that could be computed from existing props or state. If an effect syncs props into this derived state, and the derived state is used in rendering, you create a render → effect → setState → render loop. The engine keeps cycling because the effect always sees a "new" prop value (or the derived state triggers a re-render that re-runs the effect).
- **The Unforgettable Mental Model:** The **Photocopier Loop**. You photocopy a document (derive state), then photocopy the photocopy (effect syncs again), and keep making copies of copies instead of just reading the original.
- **The Trap:** Thinking you need an effect to sync props to state. Most derived state should be computed directly during render: `const filtered = items.filter(...)` instead of storing `filtered` in state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Derived-state loops happen when you store a computed value in `useState` and use an effect to sync it from props. The fix is usually to eliminate the derived state entirely and compute the value directly during render. If you must store it, use a conditional guard in the effect that only updates when the source value actually changed, not on every render."

#### How does StrictMode affect debugging?
- **The Engine Mechanism (Why it behaves this way):** StrictMode double-invokes component functions and effects in development. For infinite re-render bugs, this means the loop runs twice as fast and the error surfaces immediately. However, StrictMode can also mask certain bugs by making effects run twice — if your effect has a side effect that's idempotent, the double-run hides the problem. Conversely, if your effect has non-idempotent side effects (like appending to an array), StrictMode makes the bug obvious.
- **The Unforgettable Mental Model:** The **Stress Test Machine**. StrictMode puts your code through double the workload to see if it breaks under pressure. If it survives double-mounting, it'll handle Concurrent Mode's unpredictable scheduling.
- **The Trap:** Blaming StrictMode for bugs it didn't cause. StrictMode reveals existing bugs — it doesn't create them. Disabling it hides problems that will surface in production under Concurrent Mode.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: StrictMode double-invokes renders and effects in development, which makes infinite re-render loops surface faster and more reliably. It also exposes non-idempotent side effects and missing cleanup. Rather than disabling it, I use StrictMode as an early warning system — if my code works correctly under double-invocation, it's robust enough for Concurrent Mode's interruptible rendering."

#### What does "Too many re-renders" mean?
- **The Engine Mechanism (Why it behaves this way):** React has an internal safety mechanism that counts synchronous re-renders within a single event loop tick. When this count exceeds a threshold (typically 50), React throws the "Too many re-renders" error. This prevents the JavaScript event loop from being monopolized by an infinite render cycle, which would freeze the entire browser tab. The error includes a stack trace pointing to the component and line where the loop originates.
- **The Unforgettable Mental Model:** The **Circuit Breaker**. Like an electrical circuit breaker that trips when current overloads, React's re-render limit trips when the render cycle overloads, preventing a total system freeze.
- **The Trap:** Assuming the error message points to the exact line. It points to the component, but the actual cause might be a dependency object created several lines above, or a parent component passing unstable props.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The 'Too many re-renders' error is React's circuit breaker — it detects when a component has rendered more than 50 times synchronously and throws to prevent the browser from freezing. The root cause is always a state update that triggers another render, which triggers another state update. I debug by checking for setters called during render, unguarded effect state updates, and unstable dependency references."

## 8. Active recall test
1. **What is the simplest infinite render bug?**
   - **Explanation:** Calling a state setter directly during the render phase — like `setCount(count + 1)` at the top of a component function. This schedules a re-render before the current render completes, creating an immediate loop that React detects and throws.
2. **Why do effects loop?**
   - **Explanation:** When an effect updates a value that's in its own dependency array without a conditional guard, it creates a cycle: render → effect runs → state updates → re-render → effect runs again. The effect must have a condition that prevents unnecessary updates.
3. **How can object dependencies be unstable?**
   - **Explanation:** Objects and functions created inline during render get a new memory reference each time. React's dependency comparison uses `Object.is`, which returns `false` for two separate objects even with identical content. This makes the effect think the dependency changed every render.
4. **Why should derived values stay in render?**
   - **Explanation:** Derived values computed from existing state/props don't need their own state. Computing them during render (e.g., `const filtered = items.filter(...)`) avoids the render → effect → setState → render loop that occurs when you try to sync derived values with `useEffect` and `useState`.
5. **Where should user-triggered state updates happen?**
   - **Explanation:** In event handlers (`onClick`, `onChange`, `onSubmit`). Event handlers run outside React's render phase, so state updates inside them schedule a new render cleanly without creating loops. They're the boundary between user intent and React's rendering cycle.

## 9. Mistakes / traps
- Calling event handlers immediately in JSX.
- Updating state unconditionally inside effects.
- Creating new objects and using them as dependencies.
- Storing derived state in effects.
- Silencing dependencies instead of fixing logic.

## 10. Compare with related concepts
- **Infinite render vs stale closure:** loop updates too often; stale closure reads old data.
- **Render loop vs effect loop:** setter in render vs setter in effect.
- **Derived value vs derived state:** calculation during render vs stored state.

## 11. Summary from memory
Explain why `setState` inside render causes a loop and how to fix it.

## 12. Spaced revision prompts
- After 1 day: Define infinite re-render.
- After 3 days: Fix setter-in-render bug.
- After 7 days: Fix effect dependency loop.
- After 14 days: Explain derived-state loops.

