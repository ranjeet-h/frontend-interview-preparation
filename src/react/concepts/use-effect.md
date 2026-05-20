# useEffect

## Detailed explanation
`useEffect` lets a component synchronize with systems outside React after rendering, such as subscriptions, timers, browser APIs, analytics, or manual network requests. It runs after React commits updates to the DOM.

The most important point is that effects are not for deriving render data. If something can be calculated from props or state during render, it usually should not be placed in an effect. Effects should connect React to external systems and clean up after themselves when needed.

## 1. One-line mental model
`useEffect` synchronizes a component with something outside React after commit.

## 2. Problem it solves
Components sometimes need to start or update external work after React has rendered the UI.

## 3. Core idea
- Effects run after commit.
- Dependencies tell React when to re-run the effect.
- Cleanup runs before the effect re-runs and when the component unmounts.
- Effects should be idempotent and cleanup-safe.
- Avoid effects for pure derived state.

## 4. Visual / analogy
An effect is like plugging in equipment after the room is built, then unplugging it when leaving.

```mermaid
flowchart LR
  Render["Render"] --> Commit["Commit DOM"]
  Commit --> Effect["Run effect"]
  Effect --> Cleanup["Cleanup before next run/unmount"]
```

## 5. Minimal example

```tsx
function Title({ title }: { title: string }) {
  React.useEffect(() => {
    document.title = title;
  }, [title]);

  return <h1>{title}</h1>;
}
```

## 6. Real-world example

```tsx
function OnlineStatus() {
  const [online, setOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return <p>{online ? "Online" : "Offline"}</p>;
}
```

## 7. Common interview questions
- What is `useEffect` used for?
- When does `useEffect` run?
- What is the dependency array?
- What is cleanup?
- Why does `useEffect` run twice in StrictMode development?
- When should you not use `useEffect`?
- How do you handle async logic in effects?

## 8. Active recall test
1. Does `useEffect` run during render?
2. What does cleanup prevent?
3. What happens with an empty dependency array?
4. Why is derived state usually not an effect?
5. How do you cancel a fetch in an effect?

## 9. Mistakes / traps
- Using effects to compute values that can be derived during render.
- Missing dependencies and creating stale closures.
- Adding unstable dependencies that cause loops.
- Forgetting cleanup for subscriptions or timers.
- Making the effect callback itself `async`.

## 10. Compare with related concepts
- **`useEffect` vs `useLayoutEffect`:** effect runs after paint; layout effect runs before paint.
- **Effect vs event handler:** effects react to rendering; handlers react to user actions.
- **Effect vs render:** render calculates UI; effect synchronizes external systems.

## 11. Summary from memory
Explain when you would use `useEffect`, what dependencies do, and why cleanup matters.

## 12. Spaced revision prompts
- After 1 day: Define `useEffect`.
- After 3 days: Explain dependency arrays.
- After 7 days: Fix a stale closure effect.
- After 14 days: Explain when not to use effects.

