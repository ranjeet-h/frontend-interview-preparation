# Async/Await

## 1. Why This Exists — The Problem First

A dashboard loads a user profile, permissions, and several independent widgets. If every request is written as a separate callback, the dependency order becomes hard to see. If every request is awaited one after another, the page works but waits through a needless waterfall. If a rejection is ignored, the function quietly returns a rejected promise and the UI may never receive a useful error.

`async` and `await` solve the readability problem, not the laws of asynchronous work. They let us write promise-based control flow in a sequential-looking form while keeping the JavaScript thread available between waits. The important engineering question is still: which operation depends on which other operation?

## 2. The Analogy — Make It Obvious

Imagine a restaurant with one waiter and several kitchen stations. You order a meal. The waiter writes down the order, gives it to the kitchen, and can serve another table while the kitchen works. When the meal is ready, the waiter returns to your table and continues the conversation.

The waiter is the current JavaScript execution path. Calling an asynchronous function places an order and gives you a promise: a ticket that will eventually represent either a result or a failure. `await` means, “pause this table’s conversation until this ticket is settled.” It does not make the waiter stand motionless and stop serving every other table.

If the dessert order needs the meal number, the waiter must wait for the meal before placing the dessert order. That is a sequential dependency. If two side dishes are unrelated, the waiter can place both orders first and wait for both together. That is the shape of `Promise.all`.

There is one limit to the analogy: a promise is not a worker cooking by itself. The operation that backs it may use browser or Node.js facilities, another service, a timer, or CPU work elsewhere. `await` only coordinates the promise; it does not automatically move synchronous CPU work off the JavaScript thread.

## 3. How It Actually Works — The Full Explanation

An `async` function always produces a promise for its caller. A plain return value becomes a fulfilled promise, and a thrown error becomes a rejected promise. Returning another promise makes the outer promise follow that promise’s eventual state; the caller still receives a promise boundary.

```js
async function answer() {
  return 42;
}

async function fail() {
  throw new Error("network unavailable");
}

answer().then((value) => console.log(value)); // 42
fail().catch((error) => console.log(error.message)); // network unavailable
```

When execution reaches `await expression`, JavaScript first evaluates `expression` and treats its result as a promise-like value. If it is already fulfilled, the async function still resumes asynchronously; the code after `await` runs in a later promise reaction rather than continuing as ordinary synchronous code. If it is pending, the function suspends at that point. Its current local state is retained, the current call stack is released, and other synchronous work can run.

When the promise fulfills, a microtask resumes the function with the fulfillment value. When it rejects, resumption behaves like a `throw` at the `await` line. A surrounding `try/catch` can handle it. If no catch handles it, the async function’s own promise becomes rejected and the rejection travels to its caller.

Suspension is not cancellation. The request, timer, or other operation that produced the promise normally continues. There is no general way for `await` to stop it. Cancellation must be designed by the operation, commonly with `AbortController` for APIs such as `fetch`, and the callee must actually observe the abort signal.

Cleanup belongs in `finally`, but its timing and return rules matter. A promise's `finally` callback runs after the promise fulfills or rejects, so it does not run immediately and it does not cancel work that is still pending. Its callback's fulfilled return value is normally ignored so the original value or error passes through; if the callback throws or returns a rejected promise, that cleanup failure replaces the original outcome. In an `async` function's `try/finally`, however, an explicit `return` or `throw` in the `finally` block can replace the original return value or error while the function is unwinding.

The order of `await` statements expresses dependencies:

```js
const user = await fetchUser();
const permissions = await fetchPermissions(user.id);
```

The second call cannot start until the first result supplies `user.id`, so the sequential order is required. But this is a waterfall when the calls are independent:

```js
const profile = await fetchProfile();
const notifications = await fetchNotifications();
```

Start independent work before waiting for it:

```js
const profilePromise = fetchProfile();
const notificationsPromise = fetchNotifications();
const [profile, notifications] = await Promise.all([
  profilePromise,
  notificationsPromise,
]);
```

`Promise.all` rejects as soon as one input rejects, but it does not cancel the other inputs. Use `Promise.allSettled` when every outcome matters, such as rendering whichever optional widgets succeeded. Use a concurrency limit when starting everything at once would overload a service; “parallel” is a choice about overlap, not permission to create unlimited work.

An awaited promise resumes through the microtask queue. That is why code after an `await Promise.resolve()` runs after the current synchronous function finishes, before a timer scheduled for a later task. The event loop can run other work between a pending await and its resumption, but a long synchronous loop before or after the await still blocks the thread.

## 4. Real Code — See It Working

This example can run in Node.js 18 or newer. The fake request uses a timer so the overlap and failure behavior are visible without a network dependency.

```js
function request(name, delay, shouldFail = false) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error(`${name} failed`));
        return;
      }
      resolve(`${name} ready`);
    }, delay);
  });
}

async function loadDashboard() {
  try {
    // These requests do not depend on one another, so start both clocks now.
    const profilePromise = request("profile", 30);
    const alertsPromise = request("alerts", 10);

    // One await gives one clear failure boundary for the dashboard load.
    const [profile, alerts] = await Promise.all([
      profilePromise,
      alertsPromise,
    ]);
    return { profile, alerts };
  } catch (error) {
    // The caller receives a useful fallback instead of an unhandled rejection.
    return { error: error.message };
  }
}

loadDashboard().then(console.log);
```

For dependent work, keep the await between the operations. Here the second request needs the first response, so starting it early would be incorrect:

```js
async function loadAccount(accountId) {
  const account = await request(`account-${accountId}`, 10);

  // WHY: the account result determines which id the next operation needs.
  const permissions = await request(`${account}-permissions`, 10);
  return { account, permissions };
}

loadAccount("a-17").then(console.log).catch(console.error);
```

A cancellable fetch needs an explicit signal. The `await` does not provide this control on its own:

```js
async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

const controller = new AbortController();
const loading = fetchJson("https://example.com/data.json", controller.signal);

// WHY: abort() asks fetch to stop; merely abandoning the promise would not.
controller.abort();

loading.catch((error) => {
  if (error.name === "AbortError") console.log("request cancelled");
});
```

To see suspension without a browser, run this Node.js example:

```js
async function order() {
  console.log("before");
  await Promise.resolve();
  console.log("after");
}

order();
console.log("outside");
// before
// outside
// after
```

The call runs synchronously until the await. The continuation is queued as a microtask, so the current script prints `outside` before the continuation prints `after`.

`finally` observes settlement; it is not a cancellation switch:

```js
function delayedWork() {
  return new Promise((resolve) => {
    setTimeout(() => resolve("work finished"), 15);
  });
}

(async () => {
  let settled = false;
  const observed = delayedWork().finally(() => {
    // WHY: cleanup runs only after the timer settles the promise; it cannot stop that timer.
    settled = true;
  });

  console.log(settled); // false: the work is still pending.
  console.log(await observed); // work finished
  console.log(settled); // true: finally ran after fulfillment.

  const passedThrough = await Promise.resolve("original").finally(() => {
    // WHY: a fulfilled return from Promise.prototype.finally preserves the original value.
    return "ignored cleanup value";
  });
  console.log(passedThrough); // original

  async function tryFinallyReturn() {
    try {
      return "original";
    } finally {
      // WHY: try/finally is different: this return replaces the pending return value.
      return "replacement";
    }
  }

  console.log(await tryFinallyReturn()); // replacement

  try {
    await Promise.reject(new Error("original error")).finally(() => {
      // WHY: a cleanup throw is a new rejection, so it replaces the original error.
      throw new Error("cleanup error");
    });
  } catch (error) {
    console.log(error.message); // cleanup error
  }
})();
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does an `async` function return?**

It always returns a promise. `return value` produces a fulfilled promise for `value`; throwing inside the function produces a rejected promise. A caller must use `await`, `.then`, or another promise operation to observe the result. The value is never available synchronously just because the function body contains a normal-looking `return`.

**Q: Does `await` block the main thread?**

No. It suspends only the current async function and gives the runtime a chance to run other work. Once the awaited promise settles, a microtask resumes the function. Synchronous CPU work is different: a large loop still occupies the JavaScript thread even if it is inside an async function.

**Q: What happens when an awaited promise rejects?**

The rejection is raised at the await point as if that line threw. A nearby `try/catch` can handle it. If the error escapes the function, the promise returned by the async function rejects, so the caller must catch it or deliberately propagate it.

**Q: How should errors be handled in async code?**

Put a `try/catch` around the group of operations that can be handled together, and preserve enough context when translating the error. At a boundary such as an event handler or request route, catch the final rejected promise as well. Do not catch an error merely to return a misleading success value; decide whether the caller should retry, show a fallback, or fail.

**Q: How do you run independent async work in parallel?**

Call each operation first, store the resulting promises, and then await `Promise.all` or another combinator. `await Promise.all([fetchA(), fetchB()])` starts both function calls while building the array. `await Promise.all([await fetchA(), await fetchB()])` is sequential because each inner await completes before `Promise.all` is even called.

**Q: When is sequential `await` the right choice?**

Use it when the next operation needs the previous result, when order is a business rule, or when starting the next operation early would create an unwanted side effect. Do not turn every sequence into `Promise.all` for speed; parallelizing dependent or rate-sensitive work can be incorrect or harmful.

**Q: Does `Promise.all` cancel unfinished promises after one rejects?**

No. It settles its own promise early, but the input operations keep running unless they support separate cancellation. If the operations are cancellable, pass a shared `AbortSignal` and abort it when the group should stop. Otherwise, design the result handling so late work cannot corrupt current UI or business state.

**Q: Can `await` cancel a request?**

No. It only waits for the promise’s settlement. Cancellation is an opt-in protocol between caller and operation, such as `AbortController` with `fetch`. Even then, cancellation is a request to stop and the operation must honor the signal; code must still handle the resulting rejection or abort outcome.

**Q: What does `finally` do in async code, and can it change the result?**

It runs after the awaited or chained promise fulfills or rejects, which makes it useful for cleanup such as resetting loading state. It does not cancel pending work. With `Promise.prototype.finally`, a normal return from the cleanup callback preserves the original value or error, but a thrown error or rejected promise from cleanup replaces that outcome. With a `try/finally` block inside an async function, an explicit `return` or `throw` in `finally` can also replace what the `try` block was about to return or throw.

**Q: What is top-level `await`?**

In an ES module, `await` may appear at module scope. Module evaluation waits for that promise before dependent modules can finish evaluating. It can be useful for startup configuration, but a slow or never-settling top-level await delays module consumers, so it should be used deliberately.

**Q: Is `async/await` a different asynchronous system from promises?**

No. It is language syntax for coordinating promises. It changes how the control flow is written and how errors look, but promise settlement, microtasks, and combinators such as `Promise.all` still determine the behavior. It is also inaccurate to describe modern JavaScript as literally compiling every async function into a generator at runtime; implementations may optimize it differently while preserving the promise semantics.

## 6. The Traps — What Goes Wrong

The biggest trap is confusing a paused function with a paused program. `await` releases the current stack, but code that runs before the await and code that resumes afterward are still ordinary JavaScript. A CPU-heavy loop in either place blocks other JavaScript work; move that work to a worker or redesign it if it must not block.

Another trap is creating a waterfall by awaiting independent calls immediately. The fix is to start the promises first and await their combined result. This changes latency from roughly the sum of the independent durations toward the longest duration, subject to server, connection, and resource limits.

It is also easy to forget the return. This function catches an error but returns `undefined` on success because it never returns `user`:

```js
async function getUser() {
  const user = await request("user", 10);
  console.log(user);
  // Fix: return user when callers need the value.
}
```

An empty catch is worse than no catch: it converts a visible failure into an unexplained fallback. Catch only where the code can make a decision, and otherwise rethrow with context or let the caller handle it.

Do not confuse a promise with the value it represents. `const user = getUser()` stores a promise, so `user.name` is not the response field. Use `const user = await getUser()` inside async code, or `getUser().then((user) => ...)` at a promise boundary.

Finally, do not assume “parallel” means “unlimited.” Launching 10,000 requests at once can exhaust sockets, memory, server quotas, or rate limits. Use a queue or concurrency limiter when the number of inputs is large, and use `allSettled` when partial success is expected.

Another subtle trap is treating `finally` as cancellation or as a place to return a replacement value unconditionally. It runs only after settlement, so the underlying request or timer may already have completed and it keeps running unless it has a separate cancellation protocol. A return from `Promise.prototype.finally` is ignored for the original fulfilled value, while a throw or rejection replaces the original outcome; a return or throw in an async function's `try/finally` does replace the original control-flow result. Interviewers often test this distinction because both forms are called “finally” but have different override rules.

## 7. Compare With Related Concepts

**`async/await` vs `.then()` chains:** Both coordinate promises and use the same settlement model. `await` often makes branching and `try/catch` easier to read; `.then()` can be convenient for composing a short expression or attaching a handler at a boundary. Use the style that keeps one error and ownership story clear; do not mix styles inside one small flow without a reason.

**Sequential awaits vs `Promise.all`:** Sequential awaits express dependency or required order. `Promise.all` overlaps independent work and fails the group when any input rejects. Use sequential awaits for dependent steps; use `Promise.all` for independent work whose all-or-nothing result is useful.

**`Promise.all` vs `Promise.allSettled`:** `all` gives values only when every input fulfills and rejects early on the first failure. `allSettled` waits for every input and reports each status. Use `all` for a required bundle; use `allSettled` for optional widgets, batch reports, or partial-success UIs.

**Awaiting vs blocking:** Awaiting yields between promise settlement and resumption. Blocking keeps the JavaScript thread busy and prevents other JavaScript from running. Use `await` for I/O coordination; use workers, chunking, or a different algorithm for expensive CPU work.

**Suspension vs cancellation:** Suspension changes when this function continues. Cancellation asks the underlying operation to stop. Use `AbortController` or an API-specific cancellation mechanism when abandoned work has a real cost.

## 8. 🧠 The Memory Hook — What Sticks

Think of `await` as putting one order on a restaurant ticket, not closing the restaurant: this conversation pauses, the waiter serves other tables, and a microtask returns when the ticket settles. Start independent tickets together, keep dependent tickets in order, and remember that leaving the table does not cancel the kitchen.
