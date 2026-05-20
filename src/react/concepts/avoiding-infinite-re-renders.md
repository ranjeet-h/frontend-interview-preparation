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
- What causes infinite re-renders?
- Why can't you call setState during render?
- How can effects create loops?
- How do unstable dependencies cause loops?
- How do you fix derived-state loops?
- How does StrictMode affect debugging?
- What does "Too many re-renders" mean?

## 8. Active recall test
1. What is the simplest infinite render bug?
2. Why do effects loop?
3. How can object dependencies be unstable?
4. Why should derived values stay in render?
5. Where should user-triggered state updates happen?

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

