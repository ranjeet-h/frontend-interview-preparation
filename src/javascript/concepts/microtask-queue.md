# Microtask Queue

## 1. Why This Exists — The Problem First

Imagine a click handler that updates state and then starts a promise chain. If the promise callback waited behind every timer, network callback, and input task already waiting, a later piece of the same logical operation could run much later and in an unpredictable place. JavaScript needs a small, ordered hand-off point for work that must happen after the current synchronous turn but before the runtime starts another task.

That hand-off is useful, but it has a sharp edge. A promise callback that looks harmless can run before a zero-delay timer, and a chain that keeps adding promise callbacks can delay input and painting. Understanding the microtask queue explains both the predictable ordering and the freezes that otherwise look mysterious.

## 2. The Analogy — Make It Obvious

Picture a restaurant with one waiter. The waiter is currently finishing one table's order. During that work, customers at the table write follow-up requests on small priority slips: “bring the corrected bill” and then “split that bill again.” Those slips go into a priority tray. Other work—answering a new phone booking, seating the next table, or checking a scheduled reservation—waits in the normal task list.

When the waiter finishes the current table, the restaurant's rule is: empty the priority tray completely before taking the next normal job. If handling one slip creates another slip, the new slip goes to the back of the priority tray, and the waiter keeps processing slips in FIFO order. The waiter is still the same person on the same shift; the priority tray is not a second worker or a background thread.

In JavaScript, the waiter is the single JavaScript execution thread, the current table is the active task, promise reactions and `queueMicrotask` callbacks are priority slips, and timers or user-input callbacks are normal tasks. The “empty the tray” rule is the microtask checkpoint: keep running queued microtasks, including newly queued ones, until the queue is empty before moving on.

## 3. How It Actually Works — The Full Explanation

The runtime separates two ideas that are often both called “asynchronous”:

1. Synchronous code runs now on the call stack.
2. A microtask runs later, after the current task finishes, but at the next microtask checkpoint.
3. A task callback such as a timer or click handler runs in a later task turn.

The key ordering rule is not “microtasks run immediately.” It is more precise: once the current task has finished, the runtime drains the microtask queue before it takes the next task. The initial JavaScript file itself is a task, so a promise reaction created while that file runs waits until the file's synchronous statements finish.

Promise reactions are queued only when they are ready to run. Calling `.then()` on a pending promise registers a reaction; when the promise settles, the reaction is queued as a microtask. Calling `.then()` on an already fulfilled promise still does not call the handler inline—the handler is queued asynchronously. The same scheduling model applies to `.catch()`, `.finally()`, and the continuation after `await`.

The queue is FIFO, with one important detail: a callback can append more work while the queue is draining.

```text
current task finishes
        |
        v
run first microtask -> append any new microtasks to the back
        |
        v
repeat until the microtask queue is empty
        |
        v
browser may render, or the host chooses the next task
```

`queueMicrotask(callback)` is the direct API for putting a callback in this queue. Promise handlers use the same general microtask scheduling behavior, but their error semantics differ. In a browser, `MutationObserver` callbacks are also delivered as microtasks. `fetch()` starts host-controlled network work; after its promise settles, the reaction created by `fetch(...).then(...)` is queued as a microtask. The network completion itself is not a microtask. DOM event listeners and timer callbacks begin as host tasks; code inside one of those callbacks may then queue microtasks.

There is no promise that a browser paints after every task. The useful rule is that a browser cannot perform its rendering opportunity while the current microtask checkpoint is still draining. A finite microtask batch may finish before a paint, and an endless chain can starve painting and input completely.

Node.js has an extra ordering detail. `process.nextTick()` uses a special next-tick queue that Node drains before the regular promise/`queueMicrotask` queue. It is therefore more urgent than ordinary microtasks in Node, even though people often group both under “microtasks.” Use it sparingly: recursive `nextTick` work can starve promise callbacks and I/O. Node's timers, `setImmediate`, and I/O callbacks also depend on the event-loop phase and where they were scheduled, so do not transfer a browser “promise always beats every timer in every situation” slogan to every Node scenario.

Error behavior is another part of the model. An exception thrown inside a promise handler rejects the promise returned by that handler, allowing a later `.catch()` to observe it. An exception thrown inside a `queueMicrotask` callback is reported as an uncaught exception unless the callback catches it itself. Both callbacks still run on the same thread and can block everything else while their synchronous body executes.

## 4. Real Code — See It Working

**Basic ordering in a browser or Node main module**

```js
console.log("sync: start");

Promise.resolve().then(() => {
  console.log("microtask: promise reaction");
});

queueMicrotask(() => {
  console.log("microtask: direct callback");
});

setTimeout(() => {
  console.log("task: timer");
}, 0);

console.log("sync: end");

// WHY: synchronous statements finish before either queued callback can run.
// Output:
// sync: start
// sync: end
// microtask: promise reaction
// microtask: direct callback
// task: timer
```

The promise reaction was queued first, so it runs before the direct microtask. Both finish before the timer task is considered.

**Queue draining includes newly added work**

```js
console.log("A");

queueMicrotask(() => {
  console.log("C");
  queueMicrotask(() => console.log("E"));
  // WHY: this new callback joins the same checkpoint, behind existing work.
});

queueMicrotask(() => console.log("D"));
setTimeout(() => console.log("F"), 0);

console.log("B");

// Output: A, B, C, D, E, F
// WHY: the queue is drained completely; the timer cannot jump into the gap.
```

**Promise fulfillment and errors**

```js
Promise.resolve("ready")
  .then((value) => {
    console.log(value);
    throw new Error("broken reaction");
  })
  .catch((error) => {
    console.log(error.message);
  });

queueMicrotask(() => {
  // WHY: this is not converted into a rejected promise automatically.
  console.log("direct microtask");
});

// Output:
// ready
// direct microtask
// broken reaction
```

The first promise reaction and the direct microtask are queued during the same synchronous task, so they run in insertion order. The `catch` reaction is queued only after the first handler throws and the returned promise becomes rejected, so it runs after the direct microtask.

**`await` is a pause in one function, not a pause in the whole thread**

```js
async function loadLabel() {
  console.log("async: before await");
  await Promise.resolve();
  console.log("async: after await");
}

loadLabel();
console.log("script: after call");

// Output:
// async: before await
// script: after call
// async: after await
// WHY: the continuation after await is a promise reaction microtask.
```

**A starvation pattern to avoid**

```js
let completed = 0;

function keepTheQueueBusy() {
  completed += 1;
  if (completed < 3) {
    queueMicrotask(keepTheQueueBusy);
    // WHY: finite batching stays predictable; an unbounded version starves tasks.
  }
}

queueMicrotask(keepTheQueueBusy);
setTimeout(() => console.log("timer after", completed), 0);

// Output: timer after 3
// WHY: the timer waits until all three microtasks have finished.
```

For real long work, yield deliberately with a task boundary, split the work into small chunks, or move CPU-heavy work to a Web Worker. A recursive microtask is not a background thread.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a microtask?**

A microtask is a callback scheduled for a microtask checkpoint after the current task's synchronous work has finished. Promise reactions, `await` continuations, `queueMicrotask`, and browser `MutationObserver` delivery are common examples. It runs on the same JavaScript thread; “micro” describes scheduling priority and checkpoint behavior, not execution time or a separate thread.

**Q: Why does a resolved promise run before a zero-delay timer?**

The promise handler is a microtask and the timer callback is a task. After the current task ends, the host drains all available microtasks before selecting the next task. A zero delay makes a timer eligible as soon as the host permits; it does not make the timer run inline or outrank the microtask checkpoint.

**Q: Are promise callbacks called synchronously when the promise is already resolved?**

No. `.then()` always schedules its handler asynchronously, even if the promise is already fulfilled. This prevents code from having two different calling conventions depending on whether a promise settled before or after the `.then()` call.

**Q: Which APIs schedule microtasks?**

Promise `.then()`, `.catch()`, and `.finally()` reactions do; the continuation after `await` does as well. `queueMicrotask()` explicitly schedules one. `MutationObserver` callbacks use microtask delivery in browsers. `fetch()` network completion is host-controlled; once the fetch promise settles, a callback registered with `fetch(...).then(...)` is a promise reaction queued as a microtask. In Node, `process.nextTick()` is a separate, even-higher-priority queue rather than an ordinary promise microtask.

**Q: Does the queue drain one item or the whole queue?**

It drains until empty. If a callback adds another microtask, that callback is appended and is handled during the same checkpoint. This is why a finite chain completes before a timer or rendering opportunity, and why an infinite chain can freeze a page.

**Q: Can microtasks block rendering and user input?**

Yes. The browser cannot reach a rendering opportunity or process a later input task while the current microtask checkpoint is still running. A long synchronous callback has the same broad blocking problem, but recursive microtask scheduling is especially deceptive because every individual callback looks small while the checkpoint never ends.

**Q: How do promise-handler errors differ from `queueMicrotask` errors?**

Throwing in a promise handler rejects the promise returned by that handler, so a later `.catch()` can handle it. Throwing in a `queueMicrotask` callback is an uncaught exception unless the callback catches it. Choose the API based on the error and chaining semantics you need, not only on their similar ordering.

**Q: How does Node.js change the picture?**

Node drains `process.nextTick()` before its regular microtask queue, which includes promise reactions and `queueMicrotask` callbacks. After that, Node continues through event-loop phases such as timers, poll, and check. `setImmediate` versus `setTimeout(0)` ordering can depend on whether they were scheduled from the main module or an I/O callback, so state the scheduling context before predicting it.

**Q: When should I use `queueMicrotask` instead of `Promise.resolve().then(...)`?**

Use `queueMicrotask` when you need a direct same-checkpoint deferral and do not need a promise to represent completion or rejection. Use a promise chain when the callback is part of an async value pipeline, when callers need to await the result, or when rejection should flow through `.catch()`. Neither should be used to hide long CPU work from the UI.

## 6. The Traps — What Goes Wrong

- **“Asynchronous means another thread.”** Microtasks do not run in parallel. Their callback executes on the same thread and blocks other JavaScript, input, and painting until it returns.

- **“Zero-delay means immediately.”** `setTimeout(fn, 0)` asks the host to make a timer task eligible after the minimum delay rules. It still waits for the current stack and the entire microtask checkpoint.

- **“Only the microtasks present at the first checkpoint run.”** A microtask can enqueue another one. The runtime keeps draining, so new work can postpone every later task.

- **“The browser paints between every callback.”** Painting is a host decision and cannot interrupt a draining microtask checkpoint. A page may skip a paint even after a short batch, while an endless batch prevents the opportunity altogether.

- **“Every callback related to a promise is a microtask.”** The reaction created by `fetch(...).then(...)` is a microtask after the fetch promise settles, but the network completion that settles it is host-controlled and is not itself a microtask. Separate the settlement source from the reaction scheduling.

- **“`process.nextTick` is interchangeable with `queueMicrotask` in Node.”** Node gives `nextTick` its own queue and drains it first. Recursive use can starve regular promise reactions, so prefer ordinary microtasks unless the Node-specific priority is intentional.

- **“A thrown error always behaves the same.”** A throw in a `.then()` handler becomes a rejection of the next promise; a throw in `queueMicrotask` is reported as an uncaught exception. Test or catch the behavior you actually intend.

- **“Promise chains are a safe way to chunk heavy work.”** A chain that schedules the next chunk as a microtask still runs all chunks before the next task. Use a task boundary such as a timer for cooperative yielding, or a worker for CPU-heavy work.

## 7. Compare With Related Concepts

- **Microtask vs task (often called macrotask):** A microtask runs at the checkpoint before the next task; a task is a host-scheduled unit such as a timer, click callback, or many I/O completions. Use a microtask to finish a small piece of logically related bookkeeping before the next task; use a task boundary when you deliberately need to yield to input, rendering, or other work.

- **Promise reaction vs `queueMicrotask`:** Both use microtask ordering, but a promise reaction participates in a chain and turns thrown errors into rejections, while `queueMicrotask` is a direct callback whose throw is an uncaught exception. Use promises for value/error composition; use `queueMicrotask` for a small standalone deferred callback.

- **`process.nextTick` vs ordinary microtasks in Node:** `nextTick` has a Node-specific queue that runs before promise reactions and can starve them; `queueMicrotask` follows the standard microtask behavior. Use `nextTick` only when you need Node's stronger “after this operation, before other queues” guarantee; otherwise use `queueMicrotask` or a promise.

- **Microtask vs `setTimeout(fn, 0)`:** The former runs before the next task and may starve the host; the latter creates a later task boundary and gives the host a chance to process other work first. Use a microtask for short consistency work; use a timer or another task API to yield between chunks.

- **Microtask vs Web Worker:** A microtask is deferred work on the current thread; a worker is a separate execution context that can perform CPU work without blocking the page's main thread, subject to message and data-transfer costs. Use a worker for substantial CPU-bound work, not merely because the work is asynchronous.

## 8. 🧠 The Memory Hook — What Sticks

Think of the microtask queue as the waiter’s priority tray: finish the current table, empty every priority slip—including slips created while emptying it—then take the next normal job. Promises are not background threads; they are same-thread follow-ups that win the race against later tasks, which is exactly why they make ordering reliable and starvation possible.
