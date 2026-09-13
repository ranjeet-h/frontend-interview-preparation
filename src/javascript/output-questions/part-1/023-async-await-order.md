# Part 1 — Question 23: `await` Pauses Only the Async Function

## The Code

```javascript
async function f() {
  console.log("A");
  await new Promise((res) => setTimeout(res, 1000));
  console.log("B");
}
console.log("C");
f();
console.log("D");
```

## The Answer

```text
C
A
D
B
```

The important detail is that `await` pauses `f`, not the entire JavaScript program. `f()` starts running immediately, prints `A`, and then pauses while its Promise waits for the timer. Control returns to the surrounding script, so `D` is printed next. About one second later, the timer resolves the Promise, `f` resumes, and prints `B`.

## Execution — Walk Through It Like the JS Engine

1. JavaScript registers the `async function f` declaration. The function exists, but its body has not executed yet.
2. The script reaches `console.log("C")`, so it prints `C` synchronously.
3. The script calls `f()`. An async function begins executing synchronously until it reaches an `await` or returns. It prints `A` immediately.
4. `new Promise(...)` creates a Promise. Its executor runs immediately, so `setTimeout(res, 1000)` registers a timer with the host environment. The timer has not resolved the Promise yet.
5. `await` sees that Promise and suspends the rest of `f`. The continuation containing `console.log("B")` is attached to the Promise. `f()` itself immediately returns a pending Promise to its caller.
6. The JavaScript call stack is now clear enough for the surrounding script to continue. The next statement is `console.log("D")`, so it prints `D`.
7. After at least 1000 milliseconds, the timer callback calls `res`. That fulfills the awaited Promise. The host schedules `f`'s continuation as a microtask; it does not insert `B` directly into the middle of the timer callback.
8. When the current task finishes, JavaScript drains the microtask queue. The suspended function resumes after `await`, and `console.log("B")` prints `B`.

There are two timelines here: the outer script continues after `f` yields, while the inner function waits and later resumes. `await` is a pause button for one async function, not a stop button for the event loop.

## The Concept This Question Tests

This tests the interaction between `async` functions, `await`, timers, the call stack, tasks, and microtasks.

An `async` function always returns a Promise. Calling it does not automatically make its whole body asynchronous. The code before the first `await` runs as part of the current synchronous call. Once execution reaches `await`, JavaScript suspends that function and gives control back to its caller. The caller does not wait unless it also uses `await` or otherwise observes the returned Promise.

`setTimeout` is handled by the host environment, such as the browser or Node.js. When the delay expires, its callback becomes eligible as a task. Resolving the Promise then schedules the continuation after `await` as a microtask. Microtasks run after the current task completes and before the event loop takes the next task, which is why the continuation is described as Promise work rather than as another timer callback.

The one-second delay is a minimum delay, not a promise that `B` appears at an exact timestamp. If the thread is busy, the timer callback and therefore `B` can happen later.

## The Trap — Why Most People Get It Wrong

The most common wrong answer is `C`, `A`, `B`, `D`, as if calling `f()` made the caller wait. It does not. The `await` belongs to `f`; the top-level script keeps executing and reaches `D` while `f` is suspended.

Another mistake is saying `A` is delayed because it is inside an async function. Async functions start synchronously. Only the code after the first `await` is deferred in this example, so `A` appears immediately after `C`.

It is also inaccurate to say that `setTimeout` resolves the Promise by itself. The timer invokes `res`, and calling `res` fulfills the Promise. That fulfillment schedules the async continuation as a microtask.

Finally, do not treat `1000` milliseconds as an exact execution time. It means the timer cannot run before roughly that delay; operating-system scheduling, other work, and event-loop congestion can make `B` later.

## 🧠 The Memory Hook

`await` closes the door only on the function that reached it—the hallway outside stays open. So `f` prints `A`, steps aside, the outer script prints `D`, and only then does `f` come back to print `B`.
