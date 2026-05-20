# Closure Memory Retention

## Detailed explanation
Closure memory retention happens when a function keeps access to variables from an outer scope after that outer function has finished running. Those captured values remain reachable through the closure, so the garbage collector cannot free them while the closure is still reachable.

This is useful for private state, memoization, debounce, and callbacks, but it can also cause memory leaks if closures accidentally retain large objects, DOM nodes, or caches longer than needed.

## 1. One-line mental model
A closure keeps captured outer variables alive as long as the closure is reachable.

## 2. Problem it solves
JavaScript functions need to remember outer variables for callbacks and returned functions.

## 3. Core idea
- Closures retain references to captured variables.
- Retained values stay in memory while the closure is reachable.
- This enables private state.
- It can retain large data accidentally.
- Clearing references or removing listeners allows cleanup.

## 4. Visual / analogy
A closure is like taking a backpack from a room. Even after leaving the room, everything in the backpack stays with you.

```mermaid
flowchart LR
  Outer["Outer scope value"] --> Closure["Returned function"]
  Closure --> Reachable["Still reachable"]
  Reachable --> Retained["Value retained in memory"]
```

## 5. Minimal example

```js
function createCounter() {
  let count = 0;
  return () => ++count;
}

const counter = createCounter();
```

`count` stays alive because `counter` closes over it.

## 6. Real-world example

```js
function attachHandler(largeData) {
  button.addEventListener("click", () => {
    console.log(largeData.id);
  });
}
```

The event handler retains `largeData` as long as the listener is attached.

## 7. Common interview questions
- How do closures preserve variables?
- Can closures cause memory leaks?
- What does it mean for a value to be reachable?
- How do event listeners retain memory?
- How do closures support private variables?
- How do you release closure-retained data?
- How does this appear in React hooks?

## 8. Active recall test
1. Why does `count` stay alive after `createCounter` returns?
2. What makes retained memory eligible for cleanup?
3. How can event handlers leak memory?
4. Why are closures useful despite retention risk?
5. What is one React stale closure example?

## 9. Mistakes / traps
- Thinking local variables always disappear immediately after return.
- Retaining large DOM nodes in long-lived closures.
- Forgetting to remove event listeners.
- Keeping unbounded memoization caches.
- Confusing closure retention with global variables.

## 10. Compare with related concepts
- **Closure retention vs memory leak:** retention is normal; leak is unwanted retention.
- **Closure vs object property:** both can hold references; closures hide values in function scope.
- **Garbage collection vs cleanup:** GC frees unreachable values; cleanup removes references.

## 11. Summary from memory
Explain how a click handler can keep a large object in memory.

## 12. Spaced revision prompts
- After 1 day: Define closure memory retention.
- After 3 days: Explain private counter memory.
- After 7 days: Describe event listener leak.
- After 14 days: Explain how to release closure-retained data.

