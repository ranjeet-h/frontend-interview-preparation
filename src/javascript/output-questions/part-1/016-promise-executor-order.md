# Part 1 — Question 16: The Promise Executor Runs Immediately

## The Code

```javascript
console.log(1);
const promise = new Promise((resolve) => {
  console.log(2);
  resolve();
});
promise.then(() => console.log(4));
console.log(3);
```

## The Answer

```text
1
2
3
4
```

The first two logs are synchronous. `console.log(1)` runs immediately, and the function passed to `new Promise`—called the executor—runs immediately as part of constructing the promise, so it logs `2` before the constructor returns. The `.then()` callback does not run immediately, even though the promise has already been resolved. It is queued as a microtask, allowing the current script to continue and log `3`; only after the synchronous code finishes does the callback log `4`.

## Execution — Walk Through It Like the JS Engine

JavaScript starts executing the top-level script from the first statement.

1. `console.log(1)` runs on the call stack and prints `1`.
2. JavaScript begins evaluating `new Promise(...)`. The promise starts in the pending state, and the constructor calls the supplied executor immediately. This is not deferred work.
3. The executor runs `console.log(2)`, so `2` is printed while the promise constructor is still running.
4. The executor calls `resolve()`. The promise changes from pending to fulfilled. No `.then()` callback has been registered yet, so there is nothing to schedule at this exact moment.
5. The executor returns, the Promise constructor finishes, and the fulfilled promise is stored in `promise`.
6. `promise.then(() => console.log(4))` registers a reaction on an already-fulfilled promise. JavaScript schedules that reaction in the microtask queue; it does not call the callback inline.
7. The script continues to `console.log(3)`, which prints `3` synchronously.
8. The top-level script is now finished and the call stack is empty. JavaScript drains the microtask queue before moving on to later task work. The queued `.then()` callback runs and prints `4`.

The important split is between the executor and the reaction. The executor is part of promise construction and runs synchronously. A `.then()` handler is a promise reaction, and promise reactions always run asynchronously through the microtask queue—even when the promise was fulfilled before `.then()` was attached.

## The Concept This Question Tests

This tests the difference between synchronous promise construction and asynchronous promise reactions. A promise is an object that records a future result, but creating that object does not automatically make the code passed to its constructor asynchronous.

The executor receives `resolve` and `reject` and is invoked immediately by the Promise constructor. That is why `2` appears before `3`. Calling `resolve()` settles the promise, but it does not run future `.then()` callbacks on the current stack. Instead, the callback becomes a microtask.

Microtasks are run after the current synchronous job completes and before the event loop moves to timer callbacks or other task-queue work. That ordering gives promise chains predictable behavior: synchronous code finishes first, then promise reactions are processed.

## The Trap — Why Most People Get It Wrong

The most common wrong answer is `1, 3, 2, 4`, because people assume everything inside a Promise is asynchronous. Only the reaction is deferred here. The executor is called immediately, so `2` must appear before `3`.

Another mistake is expecting `1, 2, 4, 3` because `resolve()` appears before `console.log(3)`. Resolving a promise records its result; it does not interrupt the current JavaScript stack to run `.then()`. The callback waits until the current script yields.

Do not confuse a microtask with a timer. A `.then()` callback is not a macrotask, and it does not wait for a later event-loop turn in the same way a `setTimeout(..., 0)` callback does. Once synchronous execution ends, the microtask runs before timers.

Finally, “the promise is already resolved” does not make `.then()` synchronous. Promise APIs guarantee that reactions are queued, which prevents surprising re-entrant execution inside the statement that attaches the handler.

## 🧠 The Memory Hook

The Promise constructor calls its executor at the door, immediately; `.then()` waits in the microtask queue. Remember: building the promise is synchronous, reacting to its result is not.
