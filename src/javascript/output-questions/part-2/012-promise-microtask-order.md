# The Code

```javascript
console.log("A");

setTimeout(() => console.log("B"), 0);

Promise.resolve().then(() => console.log("C"));

console.log("D");
```

# The Answer

```text
A
D
C
B
```

The surprising part is that the timer was registered first, but `B` is printed last. `A` and `D` run immediately as part of the current script. The Promise callback becomes a microtask, while the timer callback becomes a later task. JavaScript drains microtasks after the current script finishes and before it starts the timer task, so `C` beats `B`.

# Execution — Walk Through It Like the JS Engine

There is no interesting `var`, `let`, or `const` hoisting here. The declarations are all inline expressions, so JavaScript starts executing the top-level script from the first line.

First, JavaScript calls `console.log("A")`. That is synchronous work, so `A` is printed immediately while the main script is still running.

Next, JavaScript evaluates `setTimeout(() => console.log("B"), 0)`. The timer function is handed to the host environment—the browser or Node.js runtime. The `0` does not mean “run now”; it means “make this callback eligible as soon as the timer rules allow.” Its callback is placed in the task queue later, after the current script yields.

Then JavaScript evaluates `Promise.resolve().then(() => console.log("C"))`. `Promise.resolve()` creates an already-fulfilled Promise. Calling `.then()` does not run the callback immediately. Instead, JavaScript schedules that callback as a **microtask**.

The script has not finished yet, so JavaScript continues to the final line and calls `console.log("D")`. `D` is printed synchronously, giving the output so far:

```text
A
D
```

Now the main script is complete and the call stack is empty. Before taking another task, the runtime drains the microtask queue. The Promise callback runs and prints `C`:

```text
A
D
C
```

Only after all currently queued microtasks have finished does the event loop take the timer callback from the task queue. That callback prints `B`, producing the final order:

```text
A
D
C
B
```

The complete timeline is:

```text
main script:       print A → schedule timer B → queue microtask C → print D
microtask checkpoint:                                      print C
next timer task:                                                       print B
```

# The Concept This Question Tests

This question tests the relationship between synchronous code, the **microtask queue**, and the **task queue**—often called the macrotask or callback queue.

Synchronous code has first priority because it runs directly on the call stack. JavaScript does not pause the current script to execute a timer or Promise callback. It finishes the current stack of work first.

Promise reactions such as `.then(...)`, `.catch(...)`, and `.finally(...)` are microtasks. A timer callback from `setTimeout` is a task. Once the current script finishes, the runtime performs a microtask checkpoint: it runs microtasks until the microtask queue is empty. Only then can it begin the next task, such as the timer callback.

This priority is why a resolved Promise can run before a zero-delay timer:

```javascript
setTimeout(() => console.log("timer"), 0);
Promise.resolve().then(() => console.log("promise"));

// promise
// timer
```

“Microtasks run before timers” is useful, but the deeper rule is more precise: after the current synchronous work ends, the runtime drains microtasks before it selects the next task. If a microtask queues another microtask, that new microtask is also processed before the runtime moves to the timer queue.

# The Trap — Why Most People Get It Wrong

**Trap: reading callbacks in registration order.** The timer is registered before the Promise callback, but registration order does not make them equal. They enter different queues, and microtasks are drained before the next task.

**Trap: treating `setTimeout(..., 0)` as immediate.** Zero is a minimum delay request, not a command to interrupt the current script. The callback cannot run until the current stack has finished and the event loop reaches that timer task.

**Trap: assuming `Promise.resolve().then(...)` runs synchronously.** The Promise is already fulfilled, but `.then()` still schedules its reaction asynchronously as a microtask. The callback cannot print `C` before the later synchronous `console.log("D")`.

**Trap: saying the event loop runs Promise callbacks before synchronous code.** The event loop does not preempt the current JavaScript stack. `A` and `D` must finish first; the microtask checkpoint happens afterward.

**Trap: calling the timer queue a higher-priority queue because it was registered first.** The queue type matters more than the timestamp. The timer becomes a task, and the runtime gives the microtask checkpoint a chance before starting that task.

**Trap: assuming browser and Node.js timing details are identical in every complex example.** Both environments preserve the core rule demonstrated here—synchronous work first, Promise reactions before a zero-delay timer in this simple script—but their complete event-loop phases differ. Do not generalize this small example into an absolute ordering rule for every Node.js API.

# 🧠 The Memory Hook

Think of the runtime as finishing the person currently speaking, then letting the **microtask express lane** clear, and only afterward opening the **timer line**. So the script says `A`, `D`; the Promise slips through next with `C`; the timer waits and says `B`.
