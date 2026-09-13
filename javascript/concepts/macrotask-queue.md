# Macrotask Queue

## 1. Why This Exists — The Problem First

You click a button, start a timer, and receive a message from another window, yet JavaScript still has one main thread to run the callbacks. If a callback could interrupt another callback halfway through, shared state would become unpredictable. If the thread never yielded, the page could not paint or respond to input.

The task model gives each piece of host-scheduled work a complete turn. That lets JavaScript finish one callback before starting another, while the event loop can place rendering and user input between turns when it gets a chance. Understanding this is what explains why `setTimeout(fn, 0)` is delayed, why a long loop freezes a page, and why splitting work can improve responsiveness.

## 2. The Analogy — Make It Obvious

Imagine a receptionist handling a queue of visitors. One visitor is one task: the receptionist completes that visitor's request without another visitor taking over the desk. A timer that becomes due, a click, or a cross-window message is like a visitor arriving at an appropriate waiting line.

After finishing the visitor, the receptionist immediately handles every small note already placed on the desk before accepting another visitor. Those notes are microtasks. The receptionist may then give the display board a chance to refresh, which represents rendering, before choosing another waiting visitor.

There is not necessarily one physical line. A browser has different task sources, such as timers, user interaction, and posted messages, and the browser can prioritize them. The useful analogy is therefore “several waiting lines and one desk,” not “one perfectly fair FIFO queue.”

## 3. How It Actually Works — The Full Explanation

The HTML standard usually calls a macrotask simply a **task**. A task is a host-scheduled unit of JavaScript work. Common sources include:

- The initial script or a script inserted by the page.
- Timer callbacks from `setTimeout` and `setInterval` after their delay has elapsed.
- DOM event dispatch, such as a `click`, `keydown`, or `input` handler.
- Message delivery from `window.postMessage`, `MessageChannel`, and worker messages.

The important ordering is:

1. JavaScript runs the current synchronous task until the call stack is empty. It does not pause that callback just because another event arrives.
2. The host performs a microtask checkpoint. Promise reactions and `queueMicrotask` callbacks run, including microtasks added by earlier microtasks, until the microtask queue is empty.
3. The browser may take a rendering opportunity. A paint is not promised after every task; the browser chooses when a frame is due. `requestAnimationFrame` callbacks run in the browser's rendering update before that frame is painted.
4. The event loop chooses another eligible task from a task source.

That is why this does not print `timer` during the current script:

```js
console.log("script start");

// WHY: the zero delay schedules a later task; it cannot interrupt this script.
setTimeout(() => console.log("timer task"), 0);

// WHY: this must run at the current task's microtask checkpoint before the timer task.
queueMicrotask(() => console.log("microtask"));

console.log("script end");
// script start
// script end
// microtask
// timer task
```

The timer's delay is a lower bound, not a reservation for a clock time. When the timer becomes eligible, its callback is added to a timer task source. The current task must finish first, and the microtask checkpoint runs before a later task can begin. A busy main thread or a long chain of microtasks can delay it much longer.

Task sources also explain why “the macrotask queue is strictly FIFO” is an unsafe interview answer. The browser preserves ordering rules within relevant sources, but the HTML event loop can choose among sources and user-agent scheduling may favor input or other urgent work. Treat task boundaries as an ordering and yielding model, not as a promise that every source shares one global queue.

Node.js uses a related but different host loop. Timers, pending callbacks, poll, check (`setImmediate`), and close callbacks are handled in phases. Node drains `process.nextTick` and microtasks between callbacks, and `process.nextTick` is ahead of ordinary promise microtasks. Therefore browser rules should not be pasted onto Node: for example, `setImmediate` versus `setTimeout(0)` can depend on where they were scheduled, especially inside an I/O callback.

Tasks are also a fairness tool. One 500 ms calculation blocks input and painting for roughly 500 ms. Ten 50 ms chunks are still 500 ms of CPU work, but a task boundary between chunks gives the host opportunities to process input and render. Chunking is not magic: a microtask loop can starve tasks, and repeatedly queueing work can still consume the whole machine. Use a scheduler that yields, cap each chunk, and stop or cancel when the work is no longer needed.

## 4. Real Code — See It Working

This browser example shows the ordering around one real user action. Save it as an HTML file and open it in a browser:

```html
<button id="run">Run work</button>
<pre id="log"></pre>
<script>
  const log = (message) => {
    document.querySelector("#log").textContent += `${message}\n`;
  };

  const channel = new MessageChannel();
  channel.port1.onmessage = () => log("message task");

  document.querySelector("#run").addEventListener("click", () => {
    log("click task start");

    // WHY: a promise reaction runs at the microtask checkpoint before another task.
    Promise.resolve().then(() => log("promise microtask"));

    // WHY: zero means “no intentional minimum delay,” not “interrupt this task.”
    setTimeout(() => log("timer task"), 0);

    // WHY: posting a message creates host-scheduled work that yields to the loop.
    channel.port2.postMessage("continue");

    log("click task end");
  });
</script>
```

The click handler logs its start and end first. Then the promise reaction runs at the checkpoint. The timer and message callbacks run in later tasks; their relative order is not a portable promise across browsers, so code must not depend on it.

To keep a UI responsive during work-like processing, yield between bounded chunks:

```js
async function processRows(rows, consume, signal) {
  const chunkSize = 200;

  for (let index = 0; index < rows.length; index += chunkSize) {
    if (signal?.aborted) return;

    const end = Math.min(index + chunkSize, rows.length);
    for (let cursor = index; cursor < end; cursor += 1) {
      consume(rows[cursor]);
    }

    // WHY: a timer task gives the browser a task boundary for input and painting.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
```

In production, measure the chunk duration instead of assuming 200 items always fit a frame. For animation-aligned visual work, use `requestAnimationFrame`; for non-visual background work, consider `scheduler.yield()` where supported or a timer/message fallback. If the work is CPU-heavy enough that yielding is insufficient, move it to a Web Worker; a worker removes the computation from the page's main thread but still communicates through message tasks.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a macrotask, and what creates one?**

A macrotask is the common interview name for an HTML task: one host-scheduled unit that runs to completion on the JavaScript thread. Initial script execution, timer callbacks, DOM event handlers, and message delivery are common examples. “Runs to completion” means another callback cannot enter the same call stack halfway through it.

**Q: Is `setTimeout` a macrotask or a microtask?**

Its callback is scheduled as a timer task, so it is a macrotask in common terminology. The timer itself is managed by the host; once eligible, the callback waits for the event loop to select it. A promise reaction and `queueMicrotask` are microtasks instead.

**Q: Why does `setTimeout(fn, 0)` not run immediately?**

The current script or event handler is already running. The callback cannot interrupt it. After the current task ends, all pending microtasks run, and the browser may take a rendering opportunity before selecting the timer task. The zero is only a request for the shortest permitted delay.

**Q: Is there one global FIFO macrotask queue?**

No. Browsers have task sources and scheduling choices. Ordering within a particular source can be meaningful, but a timer, input event, and message do not form a portable single FIFO sequence. If correctness depends on order, encode that order in your own state or promise chain rather than relying on source priority.

**Q: What happens after a task finishes?**

The host reaches a microtask checkpoint and drains microtasks until none remain. In a browser, a rendering opportunity may follow, then the loop chooses another eligible task. Rendering is conditional, so “paint after every task” is also too strong.

**Q: How can microtasks starve tasks?**

Each microtask can enqueue another microtask, and the checkpoint keeps draining. Until it ends, the event loop cannot start a timer, click, or message task. Use a task boundary for repeated or unbounded work; use a microtask only for a small follow-up that should happen before the host moves on.

**Q: How does Node.js differ?**

Node has phases rather than the browser's rendering-oriented loop. Timers and `setImmediate` belong to different phases, and their relative order can depend on context. Node also drains `process.nextTick` before promise microtasks, so recursive `nextTick` scheduling can starve I/O. Say which host you mean before making an ordering claim.

**Q: When should I use a timer, a message task, `requestAnimationFrame`, or a worker?**

Use a timer for a minimum-delay retry or a coarse yield. Use `MessageChannel` or another message mechanism when you need to enqueue cooperative continuation work without pretending it is a precise clock. Use `requestAnimationFrame` when the next step reads or updates visual state for a frame. Use a worker when the computation itself is too expensive for the page's main thread; a task boundary alone cannot make CPU work parallel.

## 6. The Traps — What Goes Wrong

**Trap: “Zero delay means zero milliseconds.”**

It does not. The callback waits behind the current task and the microtask checkpoint, and browsers may apply timer clamping. Treat the delay as “not before this point,” never as a deadline.

**Trap: “Every macrotask is followed by a paint.”**

The browser can skip a paint when no frame is due, and a long task can prevent the rendering opportunity from being reached. A task boundary creates a chance to render; it does not guarantee a frame.

**Trap: “Promises are faster because they are asynchronous.”**

Promises avoid running synchronously at the call site, but their reactions are microtasks. A large promise chain can keep the browser from reaching timers, input, and rendering. Choose a task boundary when fairness matters.

**Trap: “All task sources have the same priority and order.”**

The browser can choose among task sources, and user input may be favored over background work. Never build a protocol around a guessed timer-versus-message ordering. Add an explicit sequence number, queue, or state machine when order matters.

**Trap: “Chunking automatically fixes jank.”**

Chunks that each take 200 ms still cause visible pauses. Also, scheduling the next chunk as a microtask removes the yield entirely. Measure chunks, keep them bounded, allow cancellation, and use a worker for genuinely heavy CPU work.

**Trap: “Browser event-loop rules exactly describe Node.”**

Node has phases, `process.nextTick`, and no browser paint step. A snippet that is deterministic in a browser can have a different result in Node. Identify the runtime before answering an ordering question.

## 7. Compare With Related Concepts

**Macrotask versus microtask:** A task is a larger host turn such as a timer, event, or message; a microtask is a small follow-up drained before the next task. Use a microtask to finish a bounded promise-related update; use a task to yield to input and rendering.

**Task queue versus call stack:** The queue stores callbacks waiting for a turn; the call stack contains code running now. Use the queue to reason about “later,” and the stack to reason about what must finish before anything later can start.

**Timer task versus `requestAnimationFrame`:** A timer expresses a minimum delay and is not aligned to a paint. `requestAnimationFrame` runs during the browser's rendering update before a frame. Use a timer for deferred non-visual work; use `requestAnimationFrame` for visual reads and writes tied to the next frame.

**Message task versus timer task:** Both create later host work, but neither gives a universal ordering guarantee against the other. Use messages for cooperative continuation or cross-context communication; use timers when delay or retry timing is the actual requirement.

**Yielding versus a Web Worker:** Yielding splits work on the same main thread, improving opportunities for other work but not reducing total CPU cost. A worker moves computation to another thread and communicates asynchronously. Use yielding for modest work that must stay near the UI; use a worker for sustained CPU-heavy work.

**Browser tasks versus Node phases:** Browser reasoning centers on task sources, microtask checkpoints, and rendering opportunities. Node reasoning includes event-loop phases, `process.nextTick`, poll, and check. Use the host's own model whenever an ordering answer involves more than synchronous code.

## 8. 🧠 The Memory Hook — What Sticks

Picture one desk, several waiting lines, and a receptionist who never abandons the current visitor: finish the task, clear every note (microtask), offer the screen a refresh, then choose the next line. A zero-delay timer is not an express interrupt; it is simply the next visitor waiting for the desk.
