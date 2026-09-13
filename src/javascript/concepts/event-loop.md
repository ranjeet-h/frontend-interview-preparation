# Event Loop

## 1. Why This Exists — The Problem First

A browser must respond to a click, finish a network request, run JavaScript, and keep painting pixels even though a page's main JavaScript execution lane can run only one piece of JavaScript at a time. If a search handler spends 500 ms filtering a large table, keystrokes wait, animation frames are missed, and the page feels frozen. If a promise callback and a timer are both ready, the runtime also needs a deterministic rule for which one gets a turn first.

The event loop is the scheduling system that coordinates those turns. It does not make JavaScript callbacks run simultaneously. It lets the host wait for external work, queue callbacks, and give the JavaScript engine another callback only at a safe scheduling boundary.

That distinction matters in production: a promise can run before a zero-delay timer, a long microtask chain can delay painting, and `async` code can still block the UI before its first `await`.

## 2. The Analogy — Make It Obvious

Imagine one cashier serving a busy shop.

- The cashier is the JavaScript call stack: only one customer interaction is actively being served at a time.
- The shop's stockroom, phone line, and kitchen are host APIs: work such as a timer, network request, or file operation can be handled outside the cashier's current conversation.
- The regular queue at the door is the task queue: each waiting customer represents an independent event such as a click, timer callback, or script task.
- A small tray beside the cashier is the microtask queue: once the cashier finishes the current customer, every item on that tray must be handled before the next regular customer is admitted.
- In a browser, the display refresh is a scheduled opportunity to repaint the shop window. The cashier must finish the current customer and empty the tray before the shop can present the latest state.

The cashier does not pull a customer out of the regular queue while still serving someone. When the current interaction ends, the cashier drains the small tray, may allow the window to be repainted, and then accepts another regular customer. A tray that keeps receiving new items can prevent the regular queue—and, in a browser, the display—from getting a turn.

This analogy also shows the boundary: the cashier is not the phone line or the kitchen. The JavaScript engine executes the active work; the browser or Node.js host decides how external work becomes runnable callbacks.

## 3. How It Actually Works — The Full Explanation

The event loop is a host-runtime scheduling model built around a few distinct pieces:

1. **The call stack executes JavaScript.** A function call creates a frame. The current task keeps running until its synchronous JavaScript returns and the stack is empty. No timer or click callback can interrupt the middle of that JavaScript.
2. **Host APIs perform or wait for external work.** Browsers provide timers, networking, DOM events, workers, and rendering. Node.js provides timers, filesystem and network I/O, and libuv's event-loop phases. These are not JavaScript functions secretly running on the call stack in parallel; they are host facilities that later make callbacks or promise settlements ready.
3. **Tasks start independent turns.** A browser task can come from initial script execution, a timer, a user interaction, or a completed host operation. The HTML specification defines task sources and scheduling rules; “macrotask” is common interview shorthand, while “task” is the more precise browser term. A task runs to completion before another task starts.
4. **Microtasks finish the current turn.** Promise reactions (`then`, `catch`, and `finally`), `queueMicrotask`, and browser `MutationObserver` callbacks are jobs/microtasks. When the current task ends, the host performs a microtask checkpoint and keeps taking microtasks until the queue is empty—including microtasks added by other microtasks.
5. **Browsers may render between turns.** After the current task and its microtasks, the browser can take a rendering opportunity. It may run `requestAnimationFrame` callbacks, update styles and layout, paint, and composite. Rendering is not guaranteed after every task: the browser can skip an opportunity when no paint is needed or when scheduling policy says to do so. The important ordering rule is that a task and the microtasks it causes must finish before that opportunity.
6. **The host chooses another task.** Once the checkpoint (and any applicable browser rendering work) is complete, the host selects a runnable task. A timer's `0` means “eligible after the minimum delay and scheduling conditions,” not “put this callback on the stack immediately.”

The engine/host boundary is a frequent source of wrong explanations. ECMAScript specifies execution contexts, the call stack, promises, and jobs. The browser supplies the page event loop, task sources, DOM events, timers, networking, and rendering integration. Node.js embeds an engine such as V8 and adds its own host loop around libuv. Node has no browser paint phase, and browser claims about rendering do not transfer to Node.

Node's scheduling details need their own boundary. Timers, pending callbacks, poll, check (`setImmediate`), and close-callback work are commonly described as libuv phases. After a callback, Node processes microtask work; `process.nextTick` has a Node-specific queue that is processed before promise microtasks, so recursive `nextTick` work can starve promise reactions and I/O. Promise microtasks are still not the same thing as a browser task queue. The portable rule is to use promises for continuation ordering and treat `process.nextTick`/`setImmediate` as Node-specific scheduling tools.

`async`/`await` does not create a second JavaScript thread. An `async` function runs synchronously until it reaches an `await` whose promise is not already fulfilled. Its continuation is then scheduled as a promise microtask. The work before that yield still occupies the call stack, and CPU-heavy work after the continuation still occupies it when the continuation runs.

The event loop therefore gives concurrency, not automatic parallelism. Many operations can be in flight because the host waits for them while JavaScript does other work. One JavaScript callback still runs at a time on a given thread. True parallel CPU work requires a browser Worker, Node worker thread, or another process, with the communication and ownership costs that come with it.

## 4. Real Code — See It Working

**Synchronous code, promise reactions, and timers**

```js
console.log("A");

setTimeout(() => console.log("timer"), 0);

Promise.resolve().then(() => {
  // WHY: a fulfilled promise queues its reaction as a microtask;
  // the current script must finish before this callback can run.
  console.log("promise");
});

console.log("B");
```

Output:

```text
A
B
promise
timer
```

The script task prints `A` and `B`. Its microtask checkpoint then runs the promise reaction. Only after that can the timer task run. The timer is not “late” because promises are faster; it is later because the scheduling categories have different ordering rules.

**`await` yields the continuation, not the function's prefix**

```js
async function loadLabel() {
  console.log("before await");
  await Promise.resolve();
  // WHY: resuming after await is a promise reaction, so it waits
  // for the current task and earlier microtasks to finish.
  console.log("after await");
}

console.log("start");
loadLabel();
console.log("end");
```

Output:

```text
start
before await
end
after await
```

Calling `loadLabel()` enters the function immediately and runs through `await`. The continuation is scheduled; it does not interrupt the surrounding script.

**Microtasks added by microtasks are drained in the same checkpoint**

```js
queueMicrotask(() => {
  console.log("microtask 1");
  queueMicrotask(() => {
    // WHY: the queue is drained until empty, including work added
    // while an earlier microtask is running.
    console.log("microtask 2");
  });
});

setTimeout(() => console.log("timer"), 0);
```

Output:

```text
microtask 1
microtask 2
timer
```

The same rule can become a bug when microtasks recursively schedule themselves forever. The task queue and browser rendering then remain starved.

**Browser rendering is a boundary, not another promise queue**

```js
button.addEventListener("click", () => {
  status.textContent = "Working";

  // WHY: this synchronous loop keeps the current task busy, so the
  // browser cannot paint "Working" until this loop returns.
  const end = performance.now() + 200;
  while (performance.now() < end) {}

  status.textContent = "Done";
});
```

In a browser, the user usually sees only `Done`: the DOM was changed to `Working` in memory, but the current task did not yield to a rendering opportunity. Splitting work across scheduled chunks, using `requestAnimationFrame` for visual updates, or moving CPU-heavy work to a Worker gives the browser a chance to respond. `await Promise.resolve()` alone is not enough for a long loop because it yields to another microtask and can still postpone rendering; a task boundary such as `setTimeout` or an appropriate browser scheduler is needed.

**Node-specific ordering must be tested in its context**

```js
setImmediate(() => console.log("immediate"));
setTimeout(() => console.log("timer"), 0);

Promise.resolve().then(() => console.log("promise"));
process.nextTick(() => console.log("nextTick"));
```

In a normal Node.js CommonJS main-module run, `nextTick` is processed before the promise microtask, and both are processed before the event-loop callbacks. The relative order of `setImmediate` and a zero-delay timer can vary from the main module because it depends on when the timer becomes eligible and where the code was scheduled. Inside an I/O callback, `setImmediate` is generally preferred when work should run after the poll callback, while a timer expresses a delay. Do not use browser “microtasks before macrotasks” as a complete description of Node's phase ordering.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the event loop?**

It is the host-runtime scheduler that coordinates when runnable JavaScript callbacks get a turn. JavaScript on one thread executes one stack at a time; the host waits for timers, I/O, user input, and other external events, places resulting work into the appropriate queues, drains microtasks at checkpoints, and then selects another task. The event loop is not a magical parallel executor and is not simply a feature inside V8: the engine executes JavaScript, while the browser or Node.js supplies the surrounding scheduling environment.

**Q: Why does a promise callback usually run before `setTimeout(fn, 0)`?**

The promise reaction is a microtask. A timer callback is a task. After the current task finishes, the runtime drains the microtask queue before it selects a later task, so the promise reaction normally runs first. `0` only removes the requested timer delay; it does not give the timer priority over an already queued microtask.

**Q: Are promises themselves asynchronous?**

No. The executor passed to `new Promise` runs synchronously, and calling an `async` function starts its prefix synchronously. Promise reactions and `await` continuations are scheduled asynchronously as microtasks. This distinction explains why side effects inside a promise executor can happen before the next line, while `.then(...)` runs later.

**Q: What is the difference between a task and a microtask?**

A task is a larger host-scheduled turn such as initial script execution, a timer callback, or a user-input callback. A microtask is short follow-up work such as a promise reaction, `queueMicrotask`, or a browser `MutationObserver` callback. The host finishes the current task and then drains all microtasks before moving to another task; microtasks added during that drain join the same checkpoint.

**Q: Does the browser render after every task?**

No. The browser gets rendering opportunities between tasks, often coordinated with the display refresh rate, but it may skip a frame when no visual update is needed or when scheduling conditions differ. A task and its microtasks must finish before that opportunity, so a long task or an endlessly replenished microtask queue can delay painting. `requestAnimationFrame` schedules work for a future rendering opportunity; it is not a promise microtask.

**Q: Why does synchronous JavaScript block the UI?**

On the browser's main thread, JavaScript, input handling, and much of the rendering pipeline compete for turns. A long synchronous callback keeps the stack occupied, so the host cannot dispatch another callback or reach a paint opportunity. The fix depends on the work: break it into task-sized chunks, schedule visual updates with `requestAnimationFrame`, or move CPU-heavy work to a Worker. Marking a function `async` without yielding does not change this.

**Q: Is the event loop part of JavaScript or part of the browser?**

It is a boundary between the ECMAScript engine and the host. ECMAScript defines execution and promise jobs; the browser defines page tasks, DOM events, timers, networking, and rendering integration. Node.js embeds a JavaScript engine and supplies libuv phases, timers, I/O, and Node-specific queues. Saying “the engine sends work to Web APIs” is a useful browser shorthand, but it should not be presented as a universal ECMAScript rule.

**Q: How does Node.js differ from a browser event loop?**

Node has no rendering phase. Its libuv loop has phases such as timers, pending callbacks, poll, check, and close callbacks, and it processes Node's `process.nextTick` queue before promise microtasks. `setImmediate` is a Node-specific check-phase tool, while browser code commonly uses `requestAnimationFrame` for visual scheduling. The shared idea is stack completion followed by host scheduling; the queues and phase details are host-specific.

**Q: Can the event loop create parallelism?**

It creates concurrency by allowing external operations to progress while JavaScript handles other tasks. It does not execute two JavaScript callbacks simultaneously on the same thread. For parallel CPU work, use browser Workers, Node worker threads, or processes, then account for message-passing and data-transfer costs.

**Q: How can microtasks freeze a page?**

The runtime drains microtasks until the queue is empty. A microtask that continually queues another microtask means the checkpoint never finishes, so later tasks and rendering do not get a turn. Microtasks are useful for short state-consistency follow-ups; they are the wrong place for unbounded loops or large batches.

## 6. The Traps — What Goes Wrong

- **Treating “async” as parallel JavaScript.** An `async` function still runs its synchronous prefix on the current stack. Only the operation it awaits may be external, and its continuation still runs as one JavaScript callback later.

- **Calling every queue a “macrotask queue.”** Browser specifications talk about tasks and task sources, not one universal FIFO queue containing every host event. The interview shorthand is fine if it is followed by the actual rule: microtasks drain at a checkpoint, while the host chooses among eligible tasks according to its scheduling rules.

- **Assuming `setTimeout(fn, 0)` means immediate execution.** The callback cannot run until the current task and its microtasks finish, and the delay is a minimum eligibility time. A busy stack, a microtask chain, or other ready work can make it later.

- **Assuming a DOM write paints immediately.** A DOM mutation changes the browser's in-memory document state. The visible pixels change at a later rendering opportunity, so a long task can overwrite several intermediate states before any of them is painted.

- **Using `await Promise.resolve()` to make a heavy loop responsive.** This yields to a microtask, and microtasks are drained before rendering and the next task. For large work, yield through task scheduling or move the work to a Worker; choose based on whether you need a paint opportunity or true parallel CPU execution.

- **Saying rendering is guaranteed between every two callbacks.** Rendering is an opportunity, not a promise. The browser can skip a frame. The safe performance statement is that rendering cannot happen while the current task or its microtask checkpoint is still running.

- **Applying browser ordering rules directly to Node.** Node's `process.nextTick`, promise microtasks, libuv phases, and `setImmediate` have Node-specific behavior. Ask where the code runs before predicting an order.

- **Forgetting that microtasks can enqueue more microtasks.** “Microtasks run before the next task” means the queue is drained, not that only the items present at the initial checkpoint run. Recursive scheduling can starve input, I/O, timers, and paint.

- **Calling `process.nextTick` a standard browser microtask.** It is a Node-specific queue with stronger priority than promise microtasks in Node. Portable libraries should avoid relying on it unless they intentionally target Node behavior.

## 7. Compare With Related Concepts

| Compare | Key difference | When to use which |
| --- | --- | --- |
| Call stack vs event loop | The stack is executing the current synchronous frames; the event loop/host decides what runnable work gets a future turn. | Inspect the stack to explain what is running now; inspect scheduling to explain why a callback has not started yet. |
| Task vs microtask | A task starts an independent host turn; microtasks are follow-up jobs drained after the current task and before another task. | Use a microtask for a short “after this synchronous change” continuation; use a task when work should yield to input, timers, or a browser paint. |
| `queueMicrotask` vs `setTimeout` | `queueMicrotask` runs at the next microtask checkpoint; `setTimeout` waits for a later task and minimum delay. | Use `queueMicrotask` for ordering/state finalization; use a timer only when a task boundary or delay is intentional. |
| `requestAnimationFrame` vs `setTimeout` | `requestAnimationFrame` is aligned with a browser rendering opportunity; a timer is a general task with delay-based eligibility. | Use `requestAnimationFrame` for DOM reads/writes tied to the next frame; use a timer for deferred non-visual work or a delay. |
| Concurrency vs parallelism | Concurrency interleaves progress across turns; parallelism runs work at the same time on separate execution resources. | Use the event loop for waiting and coordination; use Workers, worker threads, or processes for CPU parallelism. |
| Browser tasks vs Node libuv phases | Browsers coordinate tasks with DOM and rendering; Node schedules timers and I/O through libuv and has no paint phase. | Identify the host before explaining an order; use browser APIs for UI scheduling and Node APIs for server/I/O scheduling. |
| `process.nextTick` vs promise microtasks | Both are Node follow-up queues, but `nextTick` is processed before promise microtasks and can starve them. | Use promise reactions for portable continuation ordering; use `nextTick` only for deliberate Node-internal compatibility or API timing needs. |

## 8. 🧠 The Memory Hook — What Sticks

Picture one cashier: the call stack serves one customer, the host brings outside work to the queues, and the cashier empties every tiny priority tray before taking the next regular customer. Promises live in that tray, timers and input wait in the regular line, and in a browser the shop window cannot repaint until the cashier finishes the current interaction and empties the tray.
