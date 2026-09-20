## `setTimeout(..., 0)` still waits for the rest of the script

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log("A");
setTimeout(() => console.log("B"), 0);
console.log("C");
```

### Output

```text
A
C
B
```

### Explanation

`setTimeout` never runs its callback inline — it hands the callback to the host and keeps
executing the script. `A` logs synchronously, the timer is scheduled, then `C` logs
synchronously. Only when the script finishes and the call stack is empty does the event
loop pick up the timer callback and log `B`.

```text
1. synchronous execution: A logs; setTimeout schedules B; C logs.
2. call stack: empty after C.
3. scheduled microtasks: [].
4. scheduled macrotasks: [B].
5. microtask execution order: none queued, nothing runs.
6. next macrotask: B runs.
7. final output: A, C, B.
```

### The Rule

`setTimeout(..., 0)` means "eligible to run as a macrotask after the current synchronous
work finishes", never "run now". The delay is a minimum wait, and the callback cannot
interrupt the script that scheduled it.

### How to Rewrite It Safely

Nothing is broken — this is the baseline ordering to internalise. The dangerous variation
is assuming the timer callback sees state set *after* the `setTimeout` call as it was at
scheduling time; it sees whatever the state is when the macrotask finally runs.

### Takeaway

A zero-delay timer always loses to the synchronous code that follows it. Delay `0` defers;
it does not preempt.

## A resolved promise's `.then` still runs after sync code

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log("A");
Promise.resolve().then(() => console.log("B"));
console.log("C");
```

### Output

```text
A
C
B
```

### Explanation

`Promise.resolve()` creates an already-fulfilled promise, but `.then` never invokes its
callback synchronously — it queues a microtask. `A` logs, the microtask for `B` is
scheduled, then `C` logs. Once the script ends, the microtask queue drains and `B` logs.

```text
1. synchronous execution: A logs; .then schedules microtask B; C logs.
2. call stack: empty after C.
3. scheduled microtasks: [B].
4. scheduled macrotasks: [].
5. microtask execution order: B runs (queue drains fully before any macrotask).
6. next macrotask: none scheduled.
7. final output: A, C, B.
```

### The Rule

Promise reactions (`.then`/`.catch`/`.finally`) are always asynchronous microtasks, even
when the promise is already settled. "Already resolved" skips the *waiting*, not the
*queueing*.

### How to Rewrite It Safely

Nothing is broken here — this demonstrates the correct mental model. The variation that
breaks is reading a value set inside `.then` on the very next synchronous line; sequence
with `await` or chain the dependent work inside the callback instead.

### Takeaway

Fulfilled does not mean synchronous. Every `.then` callback, without exception, runs in a
later microtask — after the current script finishes.

## Sync first, then microtasks, then the timer

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log("A");
setTimeout(() => console.log("B"), 0);
Promise.resolve().then(() => console.log("C"));
console.log("D");
```

### Output

```text
A
D
C
B
```

### Explanation

`A` logs synchronously and the timer callback `B` is scheduled as a macrotask. The `.then`
schedules `C` as a microtask. `D` logs synchronously. After the script, the microtask
checkpoint runs `C` before the event loop is allowed to take the next macrotask, `B`.

```text
1. synchronous execution: A logs; setTimeout schedules macrotask B; .then schedules microtask C; D logs.
2. call stack: empty after D.
3. scheduled microtasks: [C].
4. scheduled macrotasks: [B].
5. microtask execution order: C runs (microtask queue drains fully before any macrotask).
6. next macrotask: B runs.
7. final output: A, D, C, B.
```

### The Rule

The event loop drains the microtask queue completely after each macrotask (and after the
initial script) before running the next macrotask. Promise callbacks and
`queueMicrotask` always beat `setTimeout`, regardless of registration order or timeout
length.

### How to Rewrite It Safely

Nothing is broken here — this is the canonical ordering to internalise. The dangerous
variation is *relying* on it for correctness across semantically unrelated work; sequence
explicitly with `await` instead.

### Takeaway

Sync first, then every queued microtask, then one macrotask. `setTimeout(..., 0)` means
"next macrotask at the earliest", never "run now".

## A `.then` chain drains fully before any timer

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log("A");
setTimeout(() => console.log("D"), 0);
Promise.resolve()
  .then(() => console.log("B"))
  .then(() => console.log("C"));
console.log("E");
```

### Output

```text
A
E
B
C
D
```

### Explanation

Sync work first: `A` logs, the timer `D` is scheduled, the first `.then` queues its
microtask, and `E` logs. After the script, the microtask queue holds one entry. Running
it logs `B` and fulfils the chained promise, which queues the second `.then` — still a
microtask, so it runs in the same drain and logs `C`. Only when the microtask queue is
empty does the timer `D` run.

```text
1. synchronous execution: A logs; setTimeout schedules macrotask D; first .then schedules microtask B; E logs.
2. call stack: empty after E.
3. scheduled microtasks: [B] (C is not queued until B's handler runs).
4. scheduled macrotasks: [D].
5. microtask execution order: B runs, which queues C; C runs. The drain continues until the queue is empty.
6. next macrotask: D runs.
7. final output: A, E, B, C, D.
```

### The Rule

The microtask checkpoint does not stop after the microtasks that existed when it started:
each microtask can queue more microtasks, and all of them run before the next macrotask.
A `.then` chain of any length completes before a pending timer fires.

### How to Rewrite It Safely

Nothing is broken — this is the chained form of the canonical ordering. The variation that
breaks is an unbounded chain (each `.then` queueing another), which starves timers and
I/O forever; yield to the event loop (`await new Promise(setTimeout)`) if a chain can
grow without bound.

### Takeaway

Microtasks drain *completely*, including microtasks queued by microtasks. No timer can
interleave a `.then` chain.

## A microtask queued from a microtask still beats the timer

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
console.log("sync");
setTimeout(() => console.log("timeout"), 0);
Promise.resolve().then(() => {
  console.log("promise1");
  Promise.resolve().then(() => console.log("promise2"));
});
```

### Output

```text
sync
promise1
promise2
timeout
```

### Explanation

`sync` logs and the timer is scheduled. The outer `.then` queues a microtask. After the
script, that microtask runs: it logs `promise1` and queues the inner `.then` as a new
microtask. Because the drain continues until the queue is empty, the inner callback logs
`promise2` in the same checkpoint. The timer runs last.

```text
1. synchronous execution: sync logs; setTimeout schedules macrotask timeout; outer .then schedules microtask promise1.
2. call stack: empty after the script.
3. scheduled microtasks: [outer handler] (promise2 is not queued until the outer handler runs).
4. scheduled macrotasks: [timeout].
5. microtask execution order: outer handler runs (logs promise1, queues inner handler); inner handler runs (logs promise2).
6. next macrotask: timeout runs.
7. final output: sync, promise1, promise2, timeout.
```

### The Rule

Same drain rule as a `.then` chain, stated generally: work queued *during* the microtask
checkpoint joins the *same* checkpoint. Nesting depth does not change queue priority — a
microtask scheduled at any depth still runs before every pending macrotask.

### How to Rewrite It Safely

Nothing is broken — this demonstrates correct nesting intuition. The variation that breaks
is recursive microtask scheduling (`function tick() { queueMicrotask(tick); }`), which
never lets the loop reach timers or paint; use `setTimeout` recursion when the work must
be interruptible.

### Takeaway

"Queued later" and "nested deeper" never promote a microtask past a timer — but nothing
demotes it either. Any microtask queued before the drain ends runs before any macrotask.

## `queueMicrotask` and promise callbacks share one FIFO queue

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
console.log("A");
setTimeout(() => console.log("D"), 0);
queueMicrotask(() => console.log("B"));
Promise.resolve().then(() => console.log("C"));
console.log("E");
```

### Output

```text
A
E
B
C
D
```

### Explanation

Sync: `A` logs, timer `D` is scheduled, `queueMicrotask` enqueues `B`, `.then` enqueues
`C`, `E` logs. `queueMicrotask` and promise reactions feed the *same* microtask queue in
call order, so the drain runs `B` then `C`. The timer `D` runs after the queue empties.

```text
1. synchronous execution: A logs; setTimeout schedules macrotask D; queueMicrotask schedules B; .then schedules C; E logs.
2. call stack: empty after E.
3. scheduled microtasks: [B, C] in FIFO order.
4. scheduled macrotasks: [D].
5. microtask execution order: B runs, then C runs (same queue, first scheduled first).
6. next macrotask: D runs.
7. final output: A, E, B, C, D.
```

### The Rule

There is one microtask queue. `queueMicrotask`, promise reactions, and `await`
continuations all enqueue into it, and it drains strictly first-in-first-out (apart from
new entries appended during the drain). No API gives its microtasks priority over
another's — only scheduling order matters.

### How to Rewrite It Safely

Nothing is broken — this is the ordering rule to memorise. The variation that breaks is
using `queueMicrotask` to "jump ahead" of a promise continuation scheduled earlier; it
cannot — it lands at the back. If ordering between unrelated async steps matters, chain
them explicitly instead of racing two scheduling APIs.

### Takeaway

`queueMicrotask` is not a VIP lane; it is the same lane. Between microtasks, earlier
scheduled always runs earlier.

## `await` splits an async function into sync head and microtask tail

`Difficulty: Medium` `Probability: Very High`

### The Code

```javascript
console.log(1);
setTimeout(() => console.log(2), 0);
async function greet() {
  console.log(3);
  await null;
  console.log(4);
}
greet();
Promise.resolve().then(() => console.log(5));
console.log(6);
```

### Output

```text
1
3
6
4
5
2
```

### Explanation

Sync phase: `1` logs, the timer `2` is scheduled, then `greet()` is *called* — and an
async body runs synchronously up to its first `await`, so `3` logs. `await null` suspends
`greet` and queues its continuation (the `console.log(4)` part) as a microtask. Back in
the script, `.then` queues `5` behind it, then `6` logs. Drain: `4` (scheduled first),
then `5`. The timer `2` runs last.

```text
1. synchronous execution: 1 logs; setTimeout schedules macrotask 2; greet() runs its head synchronously (3 logs) and await queues continuation 4; .then schedules microtask 5; 6 logs.
2. call stack: empty after 6.
3. scheduled microtasks: [continuation 4, callback 5].
4. scheduled macrotasks: [2].
5. microtask execution order: 4 runs (suspended await resumes), then 5 runs.
6. next macrotask: 2 runs.
7. final output: 1, 3, 6, 4, 5, 2.
```

### The Rule

Calling an async function executes its body synchronously until the first `await` (or
return/throw). The remainder becomes a promise reaction — a microtask ordered against all
other microtasks by *when the `await` was reached*, not by where the function was
defined. `await` on an already-settled value (even `null`) still defers; it never
continues inline.

### How to Rewrite It Safely

Nothing is broken — this is the async/await ordering to internalise. The variation that
breaks is assuming `greet()` "runs later" in its entirety and reading state between the
call and the continuation; remember the head has already run. Keep side effects before
the first `await` idempotent and cheap.

### Takeaway

An async call is two events: a synchronous head and a microtask tail. The tail queues
exactly where the `await` executes — ahead of any microtask scheduled after the call.

## A timer scheduled inside a microtask queues behind existing timers

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
console.log("A");
setTimeout(() => console.log("B"), 0);
Promise.resolve().then(() => {
  console.log("C");
  setTimeout(() => console.log("D"), 0);
});
console.log("E");
```

### Output

```text
A
E
C
B
D
```

### Explanation

Sync: `A` logs, timer `B` is scheduled, the `.then` queues microtask `C`, `E` logs. The
drain runs `C`, which logs and schedules timer `D` — but timer `B` was registered
earlier, so `B` is already ahead in the timer queue. Macrotasks run in registration
order: `B`, then `D`.

```text
1. synchronous execution: A logs; setTimeout schedules macrotask B; .then schedules microtask C; E logs.
2. call stack: empty after E.
3. scheduled microtasks: [C].
4. scheduled macrotasks: [B] (D is not scheduled until C runs).
5. microtask execution order: C runs, logs, and schedules macrotask D behind B.
6. next macrotask: B runs, then D runs (timer FIFO).
7. final output: A, E, C, B, D.
```

### The Rule

Running earlier (microtask `C`) does not let a callback cut the macrotask line: timers
fire in the order their `setTimeout` calls executed. Scheduling a timer from inside a
microtask places it *behind* every timer scheduled during the earlier synchronous code.

### How to Rewrite It Safely

Nothing is broken — this is timer-queue FIFO in action. The variation that breaks is
assuming "the microtask runs first, so its timer fires first"; if `D` must precede `B`,
schedule `D` first or chain `D` off `B`'s completion instead of racing two timers.

### Takeaway

Microtask priority schedules the *`setTimeout` call*, not the *timer firing*. Once
scheduled, timers obey their own first-in-first-out queue.

## `await` on a pending promise suspends until the timer resolves it

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
async function fetchData() {
  console.log("start-fetch");
  await new Promise((resolve) => setTimeout(resolve, 0));
  console.log("data");
}
console.log("A");
fetchData();
Promise.resolve().then(() => console.log("B"));
console.log("C");
```

### Output

```text
A
start-fetch
C
B
data
```

### Explanation

Sync: `A` logs, then `fetchData()` runs its head synchronously — logging `start-fetch`.
The promise executor also runs synchronously: `setTimeout(resolve, 0)` schedules a timer
and the promise stays pending, so `await` suspends `fetchData` with no continuation
queued yet. Back in the script, `.then` queues `B`, and `C` logs. Drain: `B` runs. Then
the timer fires, resolving the awaited promise, which queues the suspended continuation
as a microtask — `data` logs last.

```text
1. synchronous execution: A logs; fetchData() head runs synchronously (start-fetch logs, executor schedules timer); .then schedules microtask B; C logs.
2. call stack: empty after C.
3. scheduled microtasks: [B] (fetchData's continuation is not queued — its promise is still pending).
4. scheduled macrotasks: [timer].
5. microtask execution order: B runs; nothing else is queued.
6. next macrotask: timer runs, resolves the awaited promise, which queues fetchData's continuation; the continuation runs and logs data.
7. final output: A, start-fetch, C, B, data.
```

### The Rule

`await` queues a continuation only when the awaited promise *settles*. Awaiting a pending
promise suspends silently — no microtask is scheduled at the `await` line itself. And a
promise executor runs synchronously during construction, so the `setTimeout` inside it is
registered before the surrounding script continues.

### How to Rewrite It Safely

Nothing is broken — this is the canonical "async over a timer" shape. The variation that
breaks is forgetting the executor is synchronous: heavy work inside `new Promise(...)`
blocks the caller. Keep executors to wiring (`resolve`/`reject` hookup) and put real work
in the timer callback or a worker.

### Takeaway

Two half-rules combine: executors run now, continuations run when settled. An `await` on
a pending promise schedules nothing — the settlement (here, the timer) decides when the
rest of the function runs.

## Interleaved awaits and nested microtasks resolve in queue order

`Difficulty: Hard` `Probability: Medium`

### The Code

```javascript
console.log("1");
queueMicrotask(() => {
  console.log("2");
  Promise.resolve().then(() => console.log("3"));
});
async function task() {
  console.log("4");
  await null;
  console.log("5");
  await null;
  console.log("6");
}
task();
Promise.resolve().then(() => console.log("7"));
console.log("8");
```

### Output

```text
1
4
8
2
5
7
3
6
```

### Explanation

Sync: `1` logs; `queueMicrotask` enqueues callback `2`; `task()` runs its head (`4`
logs) and its first `await` queues continuation `5`; `.then` queues `7`; `8` logs. The
drain, strictly FIFO: callback `2` runs (logs, and queues nested `3` at the back);
continuation `5` runs (logs, and its second `await` queues continuation `6` at the
back); `7` runs (queued before `3`, so it wins); nested `3` runs; continuation `6` runs.

```text
1. synchronous execution: 1 logs; queueMicrotask schedules callback 2; task() head logs 4 and await queues continuation 5; .then schedules callback 7; 8 logs.
2. call stack: empty after 8.
3. scheduled microtasks: [2, 5, 7] (3 and 6 are queued only when 2 and 5 run).
4. scheduled macrotasks: [].
5. microtask execution order: 2 runs (queues 3) → 5 runs (queues 6) → 7 runs → 3 runs → 6 runs.
6. next macrotask: none scheduled.
7. final output: 1, 4, 8, 2, 5, 7, 3, 6.
```

### The Rule

One queue, one discipline: every microtask — `queueMicrotask` callbacks, `.then`
reactions, `await` continuations — joins the back of the same FIFO, including ones queued
mid-drain. To predict interleavings, list the queue after the sync phase, then repeatedly
take the front and append whatever it schedules. `7` before `3` falls out mechanically:
`7` was enqueued during the sync phase, `3` only during the drain.

### How to Rewrite It Safely

This code is correct but unreadable if the order matters — and that is the lesson. Do not
coordinate sequential steps through rival scheduling APIs; chain them (`await step()`)
so the order is explicit. Use this trace technique only for debugging, never as a design
tool.

### Takeaway

When microtask sources interleave, simulate the single FIFO on paper: sync phase first,
then front-to-back, appending as you go. Scheduling time — not API, not nesting — decides.

## Combined start, timers, promises, microtask and async ordering

`Difficulty: Hard` `Probability: Medium`

### The Code

```javascript
console.log("start");
setTimeout(() => {
  console.log("timeout");
  Promise.resolve().then(() => console.log("timeout-microtask"));
}, 0);
Promise.resolve().then(() => {
  console.log("promise-1");
  queueMicrotask(() => console.log("microtask"));
});
Promise.resolve()
  .then(() => {
    console.log("promise-2");
    return Promise.resolve();
  })
  .then(() => console.log("promise-3"));
async function one() {
  console.log("async-1");
  await Promise.resolve();
  console.log("async-2");
  await Promise.resolve();
  console.log("async-3");
}
one();
console.log("end");
```

### Output

```text
start
async-1
end
promise-1
promise-2
async-2
microtask
async-3
promise-3
timeout
timeout-microtask
```

### Explanation

Sync phase: `start` logs; the timer is scheduled; three microtask entries are queued in
order — the `promise-1` handler, the `promise-2` handler, and (via the `one()` head,
which logs `async-1` synchronously) the `async-2` continuation; `end` logs. The drain:
`promise-1` logs and appends `microtask`; `promise-2` logs, but returning an
already-resolved promise forces the engine through extra adopt-the-state microtask jobs,
so `promise-3` is *not* appended immediately; `async-2` logs and its second `await`
appends `async-3`; `microtask` logs; `async-3` logs; finally the adopted `promise-3`
reaction runs. The timer fires after the drain: `timeout` logs and queues
`timeout-microtask`, which runs in the post-timer checkpoint.

```text
1. synchronous execution: start logs; setTimeout schedules macrotask timeout; .then schedules promise-1 handler; chained .then schedules promise-2 handler; one() head logs async-1 and await queues async-2 continuation; end logs.
2. call stack: empty after end.
3. scheduled microtasks: [promise-1 handler, promise-2 handler, async-2 continuation].
4. scheduled macrotasks: [timeout].
5. microtask execution order: promise-1 runs (queues microtask) → promise-2 runs (returning a resolved promise costs extra adopt-state jobs, so promise-3 waits) → async-2 runs (queues async-3) → microtask runs → async-3 runs → promise-3 runs.
6. next macrotask: timeout runs, logs, and queues timeout-microtask; the post-timer checkpoint runs it.
7. final output: start, async-1, end, promise-1, promise-2, async-2, microtask, async-3, promise-3, timeout, timeout-microtask.
```

### The Rule

Three rules compose here. One queue: every microtask source shares a single FIFO. Adoption
costs ticks: `return promise` inside `.then` does not schedule the next handler directly —
the engine unwraps the inner promise's state through extra microtask jobs, so the chained
handler lands *behind* microtasks queued meanwhile (`async-3` beats `promise-3`). And a
macrotask's own microtasks (`timeout-microtask`) run in the checkpoint right after that
macrotask, not merged into the earlier drain.

### How to Rewrite It Safely

Never ship ordering like this on purpose — it is a debugging exercise, not a pattern. If
steps must run in sequence, `await` them in one async function; if they are independent,
do not assert any relative order in tests (flush with `await Promise.resolve()` loops or
fake timers instead of hard-coding interleavings).

### Takeaway

Build the three queues on paper — call stack, microtask FIFO, macrotask FIFO — advance
them in loop order, and remember that adopting a promise spends extra microtask ticks.
Any interleaving, however tangled, reduces to that simulation.
