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
#### Why does `var` loop print final value?
- **The Engine Mechanism (Why it behaves this way):** `var` is function-scoped (or globally scoped). When the engine compiles a loop containing `var i = 0`, it hoists the variable declaration `i` to the top of the enclosing function environment. During the loop execution, the variable `i` is mutated in-place in that *single* environment record. The loop sets up three asynchronous callback functions (e.g., `setTimeout` handlers) whose internal `[[Environment]]` properties reference the enclosing scope's Variable Environment. Because these callbacks are asynchronous, they are sent to the Web APIs container and then queued in the Macrotask Queue. They do not run until after the synchronous loop execution has completed entirely. By the time the call stack is clear and the Event Loop processes the callbacks, the single, shared variable `i` in the heap has already mutated to its final value, `3`. When the callbacks execute and look up `i`, they all resolve to the same memory slot containing `3`.
- **The Unforgettable Mental Model:** The **Single Shared Whiteboard**. Three children (the callbacks) are told to look at a whiteboard (the variable `i`) at the end of the class. The teacher writes `0`, then erases it and writes `1`, then erases it and writes `2`, and finally writes `3`. When the class ends and the kids look at the board, they all see `3`.
- **The Trap:** Thinking that the loop callbacks execute synchronously or that `i` is frozen at the moment of the callback's registration.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The `var` loop prints the final value because `var` is function-scoped, meaning only one instance of the loop variable `i` is created and allocated in the environment record. Since the callbacks are asynchronous and execute after the synchronous loop finishes, they all resolve the identifier `i` by pointing back to the exact same, single memory address. By that time, the loop has completed and left that variable holding the value `3`."

#### How does `let` fix closures in loops?
- **The Engine Mechanism (Why it behaves this way):** Unlike `var`, `let` is block-scoped. In modern JS engines, when a `for` loop is compiled with `let i = 0`, a brand-new Declarative Environment Record is created for **each and every iteration** of the loop. When the loop steps forward, the engine creates a new block environment, binds a new, distinct variable `i`, and initializes it with the value of the previous iteration's `i` plus 1. Therefore, when the inner callback function is declared inside the loop iteration, its `[[Environment]]` property points to the *unique block environment record* of that specific iteration. When the event loop later pushes the callbacks onto the Call Stack, each callback accesses its own independent, immutable environment record containing the value of `i` captured at that precise moment.
- **The Unforgettable Mental Model:** The **Photocopied Notepad**. Instead of a single whiteboard, the teacher takes a fresh sheet of paper for each iteration, writes down the current value of `i` (e.g., `0`, `1`, `2`), and hands it specifically to that iteration's callback. When they are asked to look at their note later, each callback is holding a completely different piece of paper.
- **The Trap:** Thinking that `let` is re-bound dynamically at runtime. The engine actually handles this by spinning up a new lexical scope for each iteration, which does have a minor runtime CPU/memory cost, though optimized away by modern V8.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `let` solves this issue because it is block-scoped. During a `for` loop execution, the JS engine creates a new, distinct lexical environment record for every single iteration. When a closure is declared, it captures the binding of `let i` specific to that particular iteration's scope. Therefore, each callback references its own separate variable in memory, preserving the values sequentially from `0` to `n`."

#### What does closure capture?
- **The Engine Mechanism (Why it behaves this way):** A closure captures **bindings (references to variables)**, not static values or snapshots. When a function is created, it establishes a live reference to the surrounding environment records in the Heap. It does not copy or store the state of the values at the time of creation. If the value at a bound memory location is altered later, any closure pointing to that Lexical Environment will see the updated value upon execution.
- **The Unforgettable Mental Model:** A closure is like a **shortcut to a folder** on your desktop, not a duplicate copy of the folder. If you open the shortcut (execute the closure) and the files inside the folder have changed, you see the updated files, not the ones that were there when you made the shortcut.
- **The Trap:** Developers often assume closures "snapshot" variables at the exact instant the inner function is defined. This leads to profound bugs in async flows and React hooks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A closure captures live variable bindings, not values. It retains a direct memory pointer to the lexical environment records of its outer scopes. If a variable is mutated in that scope, all closures sharing that lexical environment will resolve the variable to its newly updated value when they run."

#### How do timers affect loop output?
- **The Engine Mechanism (Why it behaves this way):** Timers (like `setTimeout` or `setInterval`) are executed asynchronously via the event loop. When `setTimeout(callback, 0)` is evaluated, the JS call stack registers the call and delegates it to the browser's Web APIs container. The timer immediately expires (since delay is `0`), and the callback is pushed to the Macrotask Queue. The Event Loop will not move this callback to the Call Stack until the Call Stack is completely empty. Since the loop is synchronous, it must run to completion first. Consequently, all timer callbacks are executed only *after* the loop is finished, making the timing of their execution highly relevant to which value of the loop variable they read.
- **The Unforgettable Mental Model:** The **Ticket Line**. The `setTimeout` puts the callback at the back of the queue. The loop is currently at the counter processing all its iterations. The callbacks in line have to wait until the loop has completely finished its business before they can step up and read the current time.
- **The Trap:** Believing `setTimeout(fn, 0)` executes immediately. It is always deferred until the synchronous execution of the script has fully completed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Timers defer the execution of their callbacks to the Macrotask Queue. Because the event loop will not process this queue until the call stack is empty, the synchronous loop is guaranteed to run to completion first. This separation of declaration time and execution time is what exposes the scoping bug when using function-scoped variables like `var`."

#### How did developers fix this before `let`?
- **The Engine Mechanism (Why it behaves this way):** Before ES6 introduced `let`, developers had to manually create a new execution context and lexical environment for each iteration of the loop. Since functions were the only way to create a new scope, developers either used an Immediately Invoked Function Expression (IIFE) inside the loop, or wrapped the async call in a helper function that returned a new function. When the IIFE was invoked, a new execution context was pushed to the stack, and a new Lexical Environment was created with the current iteration's value passed as an argument (which is bound as a local parameter inside the new scope).
- **The Unforgettable Mental Model:** **Laminating the Paper**. Since we couldn't create block scope, we wrapped each iteration inside a function "lamination" (IIFE), sealing the current value inside a fresh, airtight container before passing it to the timer callback.
- **The Trap:** Forgetting to pass the variable as an argument to the IIFE, which would result in the IIFE still looking up the same outer `var` reference.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Prior to ES6, developers created a separate scope for each iteration by wrapping the callback in an IIFE or helper function. Passing the loop variable as an argument to the function forced the engine to create a new execution context and bind the current value to a local parameter, effectively isolating it for that iteration's callback."

#### What is an IIFE loop fix?
- **The Engine Mechanism (Why it behaves this way):** An IIFE loop fix looks like this:
  ```js
  for (var i = 0; i < 3; i++) {
    (function(index) {
      setTimeout(() => console.log(index), 0);
    })(i);
  }
  ```
  During compilation and execution, the IIFE function is immediately executed for each iteration. The engine pushes the IIFE's execution context onto the Call Stack, creating a new Lexical Environment. The current value of `i` is passed as an argument and bound to the parameter `index` inside this new Lexical Environment. The inner callback's `[[Environment]]` property points to this IIFE Lexical Environment, preserving the specific value of `index` (which never changes) even though `i` continues to mutate in the outer scope.
- **The Unforgettable Mental Model:** A **Time Capsule Factory**. In each loop step, we immediately manufacture a small time capsule (IIFE), put the current value of `i` inside it under the name `index`, seal it, and hand it to the `setTimeout`.
- **The Trap:** Accidentally referencing `i` inside the IIFE instead of the parameter `index`, which defeats the purpose.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An IIFE fix wraps the async operation inside a self-invoking function that takes the loop variable as an argument. This forces the JS engine to establish a new execution context with a unique lexical environment per iteration, capturing the current value as a local parameter. The nested callback then closes over this static parameter rather than the mutable outer loop variable."

#### How does this affect event handlers?
- **The Engine Mechanism (Why it behaves this way):** If event handlers are attached in a loop using `var` to track the current element index (e.g. `buttons[i].addEventListener('click', ...)`), all handlers share the same variable `i`. When a user clicks a button, the event handler runs asynchronously on the call stack. The engine looks up the variable `i` in the lexical scope chain and resolves it to its final value (usually `buttons.length`). As a result, clicking *any* button will always print the final index, causing severe functional bugs.
- **The Unforgettable Mental Model:** The **Identical twins calling the same phone number**. All buttons are programmed to dial a single extension `i`. By the time the user clicks, the extension has been rewired to point only to the final room.
- **The Trap:** Assuming that event listeners behave differently from `setTimeout`. Both are asynchronous and run their callbacks long after the synchronous loop execution has terminated.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Event handlers attached inside a loop using `var` suffer from the exact same scoping bug as timers. Since the event handler is executed asynchronously when the user interacts with the UI, it resolves the loop index variable long after the loop has run. If the index is function-scoped with `var`, every single button click will resolve to the final index. Switching to `let` or using an array method like `forEach` resolves this because it binds a unique index variable to each individual callback scope."

## 8. Active recall test
1. **What does `var` loop output for timers?**
   - **Explanation:** It outputs the final index (e.g. `3, 3, 3` for a loop running 3 times). This is because `var` is function-scoped, creating a single mutable variable in the environment record that is shared by all asynchronous callbacks.
2. **Why does `let` output `0,1,2`?**
   - **Explanation:** `let` is block-scoped. The JavaScript engine creates a new Declarative Environment Record for every iteration of the loop, binding a unique copy of `i` for that iteration. The callbacks close over their respective block-scoped variables, outputting `0, 1, 2`.
3. **Do closures capture values or bindings?**
   - **Explanation:** Closures capture variable bindings (references to the memory locations of the variables in the lexical environment), not snapshots of their values at creation time.
4. **How can an IIFE fix old code?**
   - **Explanation:** By wrapping the body of the loop iteration in a self-invoking function and passing the loop variable as an argument, it creates a new function execution context and a new lexical environment for each iteration, securing the value as a local parameter.
5. **Where can this bug appear in UI code?**
   - **Explanation:** This bug commonly appears when attaching event listeners to lists of elements in a loop, or when scheduling multiple sequential AJAX requests/animations in a loop using `var` index counters.

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

