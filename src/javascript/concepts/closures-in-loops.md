# Closures in Loops

## Detailed explanation
Closures in loops are a classic interview topic because they reveal the difference between `var` function scope and `let` block scope. When `var` is used in a loop, all callbacks close over the same variable. When `let` is used, each iteration gets a new binding.

This appears in frontend code with timers, event handlers, asynchronous callbacks, and old codebases. Modern JavaScript usually avoids the bug by using `let`, array methods, or passing values explicitly.

## 1. One-line mental model
Closures in loops capture variables, and `var` shares one loop variable while `let` creates one per iteration.

## 2. Problem it solves
Developers need to predict why delayed callbacks in loops sometimes all see the final loop value.

## 3. Core idea
- `var` is function-scoped.
- `let` is block-scoped.
- Closures capture bindings, not snapshots.
- Async callbacks run after the loop completes.
- Use `let` or create a new scope per iteration.

## 4. Visual / analogy
With `var`, every callback points to one shared whiteboard. With `let`, each callback gets its own note card.

```txt
var: callback -> same i -> final value
let: callback -> per-iteration i -> correct value
```

## 5. Minimal example

```js
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}

// 3, 3, 3
```

## 6. Real-world example

```js
for (let index = 0; index < buttons.length; index++) {
  buttons[index].addEventListener("click", () => {
    console.log(index);
  });
}
```

Each listener captures its own `index`.

## 7. Common interview questions
- Why does `var` loop print final value?
- How does `let` fix closures in loops?
- What does closure capture?
- How do timers affect loop output?
- How did developers fix this before `let`?
- What is an IIFE loop fix?
- How does this affect event handlers?

## 8. Active recall test
1. What does `var` loop output for timers?
2. Why does `let` output `0,1,2`?
3. Do closures capture values or bindings?
4. How can an IIFE fix old code?
5. Where can this bug appear in UI code?

## 9. Mistakes / traps
- Saying closures copy the value at creation time.
- Forgetting async callbacks run after the loop.
- Using `var` in modern loop callbacks.
- Assuming `forEach` and `for` have identical scoping behavior.
- Fixing with global variables instead of per-iteration binding.

## 10. Compare with related concepts
- **`var` vs `let`:** function scope vs block scope.
- **Closure vs event loop:** closure captures variable; event loop decides when callback runs.
- **IIFE vs `let`:** both can create per-iteration scope; `let` is simpler.

## 11. Summary from memory
Explain why `var` prints `3,3,3` but `let` prints `0,1,2` in timer loops.

## 12. Spaced revision prompts
- After 1 day: Predict `var` loop timer output.
- After 3 days: Explain `let` per-iteration binding.
- After 7 days: Write an IIFE fix.
- After 14 days: Connect closures in loops to event handlers.

