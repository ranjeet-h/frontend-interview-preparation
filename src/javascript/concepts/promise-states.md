# Promise States

## 1. Why This Exists — The Problem First

An API request can be neither complete nor failed when the function returns. If every caller had to inspect a mutable `isLoading` flag, remember which callback belongs to which request, and protect itself from both success and failure firing, ordinary async code would become fragile. Promises give that unfinished operation one stable identity: it is waiting now, and it will report exactly one eventual outcome.

This matters in real UI code. A screen may start a request, unmount before it finishes, and still need predictable success, error, and cleanup behavior. Interviewers use Promise states to see whether you understand that lifecycle, why a settlement cannot be undone, and how one handler's result creates the next Promise in a chain.

## 2. The Analogy — Make It Obvious

Think of a tracked package with one tracking record. While the courier is still working, the record says **pending**. When the package arrives, the record says **fulfilled** and stores the package. If delivery fails, it says **rejected** and stores the failure reason.

The tracking record can receive many people asking for updates, just as a Promise can have many `then`, `catch`, or `finally` handlers. Those people do not change the delivery result; they are merely notified after the result is known. Once the courier marks the package delivered or failed, the tracking record cannot be changed to the opposite outcome.

There is one important refinement: “resolved” means the tracking record has handed responsibility to another delivery. If the courier says, “follow this second tracking number,” the first record is resolved to that second Promise or thenable and waits for it. It is not necessarily fulfilled yet. That is why resolved and fulfilled are often the same in simple examples but are not synonyms.

## 3. How It Actually Works — The Full Explanation

Every Promise begins **pending**. It becomes **fulfilled** when it completes successfully with a value, or **rejected** when it completes with a reason. Fulfilled and rejected are both **settled** states. The state transition is one-way:

```text
pending ──success──> fulfilled
   └─────failure───> rejected
```

The original Promise has an internal state and result, but JavaScript does not expose them as readable properties. You observe them by attaching handlers or awaiting the Promise. A pending Promise does not mean its executor is currently running: the executor passed to `new Promise` runs immediately and synchronously; pending simply means no settlement has happened yet.

The first resolution attempt controls the Promise. Later calls to `resolve` or `reject` do not replace its result, and a fulfilled Promise cannot become rejected. This protects every consumer from the producer changing history after consumers have started reacting.

```js
const outcome = new Promise((resolve, reject) => {
  resolve("first result");
  reject(new Error("too late"));
  resolve("also too late");
});

outcome.then(console.log); // first result
```

The important nuance is that the first `resolve` call begins the resolution procedure. If it receives a Promise or thenable, the outer Promise adopts that object's eventual state instead of immediately becoming fulfilled.

Resolution answers, “What value should this Promise follow?” Fulfillment answers, “Did that value finally complete successfully?” A resolved Promise may therefore remain pending while it follows another asynchronous result.

```js
const inner = new Promise((resolve) => {
  setTimeout(() => resolve("server data"), 10);
});

const outer = new Promise((resolve) => {
  resolve(inner); // WHY: outer adopts inner instead of fulfilling with the Promise object.
});

outer.then((value) => console.log(value)); // server data
```

The same adoption rule handles thenables: any object with a callable `then` method can be treated as a Promise-like result. The resolution procedure calls that method and follows whether it fulfills or rejects. If the thenable's `then` method throws, the adopting Promise rejects with that thrown error. This is why `Promise.resolve(value)` is useful when a function may return either a plain value or a Promise.

```js
const maybeAsync = (useCache) =>
  useCache ? { id: 7 } : fetch("/api/user/7").then((response) => response.json());

Promise.resolve(maybeAsync(true)).then((user) => {
  // WHY: callers get one Promise-shaped interface for both cache and network paths.
  console.log(user.id);
});
```

`Promise.resolve(existingPromise)` adopts the existing Promise, and for a native Promise from the same constructor it returns that Promise itself. It does not force the work to run again.

Calling `.then(onFulfilled, onRejected)`, `.catch(onRejected)`, or `.finally(onFinally)` registers a reaction and returns a **new** Promise. The original Promise is not mutated by attaching a handler. If the source is already settled, the handler is still queued rather than called in the middle of the current synchronous line. Promise reactions run as microtasks after the current synchronous job finishes.

```js
const ready = Promise.resolve("ready");

console.log("A");
ready.then(() => console.log("C")); // WHY: reactions stay consistently asynchronous.
console.log("B");

// A
// B
// C
```

The new Promise returned by `.then()` follows the handler's result:

- returning a normal value fulfills the new Promise with that value;
- throwing an error rejects the new Promise;
- returning a Promise or thenable makes the new Promise adopt it;
- omitting the relevant handler passes the original fulfillment or rejection through.

That rule explains both chaining and error propagation. A rejection moves down the chain until a rejection handler handles it. A handler that returns normally can recover the chain; a handler that throws creates a new rejection for later handlers.

`finally` is for cleanup that should run for either outcome. It receives no fulfillment value or rejection reason. If it returns normally, the next Promise preserves the original outcome; if it throws or returns a rejected Promise, cleanup replaces the outcome with that new rejection.

## 4. Real Code — See It Working

```js
async function loadUser(showSpinner, hideSpinner, showError) {
  showSpinner();

  try {
    const response = await fetch("/api/user/7");

    if (!response.ok) {
      // WHY: fetch rejects for network failures, not ordinary HTTP 4xx/5xx responses.
      throw new Error(`Request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    showError(error);
    throw error; // WHY: rethrow so the caller still sees a rejected Promise.
  } finally {
    hideSpinner(); // WHY: loading cleanup belongs on both success and failure paths.
  }
}
```

An `async` function always returns a Promise. The `return` creates fulfillment, a thrown error creates rejection, and `finally` executes before the returned Promise exposes its final result to its caller.

```js
function withTimeout(work, milliseconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out")), milliseconds);

    work((value) => {
      clearTimeout(timer);
      resolve(value); // WHY: a late timeout or callback cannot change the first outcome.
    });
  });
}

withTimeout((done) => setTimeout(() => done("finished"), 5), 50)
  .then(console.log)
  .catch(console.error);
```

In production, also make the underlying operation abortable when possible. Promise immutability prevents a stale callback from changing the reported outcome, but it does not cancel the network request or timer that produced that callback.

```js
Promise.resolve("42")
  .then((text) => {
    const number = Number(text);
    if (Number.isNaN(number)) throw new Error("Not a number");
    return number + 1; // WHY: returning a value fulfills the next link in the chain.
  })
  .then((number) => console.log(number))
  .catch((error) => console.error("Could not parse:", error));
```

The first Promise remains fulfilled with `"42"`. If the first handler throws, the Promise returned by that first `.then()` becomes rejected, so the later `.catch()` can handle it. A separate sibling handler attached to the original Promise does not automatically receive that derived rejection.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are the states of a Promise, and what does settled mean?**

A Promise starts pending, then becomes fulfilled with a value or rejected with a reason. Fulfilled and rejected are settled states. Settled means it is no longer waiting; it does not mean the result was successful.

**Q: Can a settled Promise change state?**

No. The first resolution procedure determines the outcome, and later resolve or reject calls are ignored. This immutability lets multiple consumers trust that they are observing one result rather than racing against a producer that can rewrite it.

**Q: Is resolved the same as fulfilled?**

No. A Promise is resolved when its outcome has been fixed, including when it adopts another Promise or thenable. It can be resolved-to-a-pending thenable and therefore still not be fulfilled. Fulfilled specifically means the final adopted result completed successfully.

**Q: What happens when `resolve` receives another Promise?**

The outer Promise adopts the inner Promise. It fulfills with the inner value if the inner Promise fulfills and rejects with the inner reason if it rejects. It does not fulfill with the inner Promise object as a normal value.

**Q: Does the Promise executor run asynchronously?**

No. The executor passed to `new Promise` runs synchronously during construction. The operation it starts may be asynchronous, and handlers attached with `.then`, `.catch`, or `.finally` run later as microtasks.

**Q: Do handlers run synchronously for an already fulfilled Promise?**

No. Even `Promise.resolve("x").then(handler)` queues `handler` for a later microtask. This keeps timing predictable: adding a handler does not cause it to run halfway through the current synchronous function.

**Q: What determines the state of the Promise returned by `.then()`?**

The handler's result determines it. A returned value fulfills the derived Promise, a thrown error rejects it, and a returned thenable or Promise is adopted. If the corresponding handler is missing, the source outcome passes through unchanged.

**Q: How do errors move through a Promise chain?**

A rejection skips fulfillment handlers until it finds a rejection handler such as the second argument to `.then()` or `.catch()`. A rejection handler that returns normally recovers the derived Promise into fulfillment; one that throws creates a new rejection. A `catch` only handles failures in the chain leading to that `catch`, not failures in unrelated sibling chains.

**Q: What does `finally` do?**

It runs after either fulfillment or rejection and is meant for cleanup. It receives no result or error. If it completes normally, the next Promise keeps the original value or reason; if it throws or returns a rejected Promise, the cleanup failure becomes the new rejection.

**Q: Does `fetch` reject when the server returns 404 or 500?**

Usually no. `fetch` rejects for failures such as a network error or an aborted request, but an HTTP error response still fulfills with a `Response`. Check `response.ok` or `response.status` and throw your own error when application code should treat that response as failure.

**Q: What can a Promise rejection reason be?**

JavaScript permits any value, including a string, number, or object. Rejecting with an `Error` is the practical rule because it preserves a message and stack trace that make debugging and logging useful.

## 6. The Traps — What Goes Wrong

- **Treating `resolved` as a fourth state.** The observable states are pending, fulfilled, and rejected. Resolved describes a Promise whose eventual outcome has been fixed, even if it is waiting for an adopted thenable. Use “settled” when you specifically mean fulfilled or rejected.

- **Assuming the executor is asynchronous.** Side effects inside `new Promise((resolve) => { ... })` happen immediately. Only reactions such as `.then()` are deferred. Put asynchronous work in the executor only when creating the Promise is the right ownership boundary; otherwise a function that returns a Promise is usually clearer.

- **Expecting `resolve(innerPromise)` to produce the inner Promise as a value.** Resolution adopts the inner outcome. If you need the Promise object itself as data, wrap it in another value, such as `{ promise: innerPromise }`.

- **Using a Promise as cancellation.** Settlement is immutable, but it does not stop work already started. Use `AbortController` for fetch, a clearable timer for timeouts, or an explicit cancellation protocol for other operations.

- **Forgetting that each `.then()` returns a separate Promise.** A handler can throw and reject its derived Promise while the original Promise stays fulfilled. Return the chain or attach a catch to the chain you actually want to observe.

- **Assuming `finally` receives the result.** It does not. Use `.then(value => cleanup(value))` when cleanup needs the value, or keep the value in surrounding scope carefully. Use `finally` when the same cleanup should happen without depending on the outcome.

- **Expecting every HTTP failure to reach `catch`.** A 500 response is still a fulfilled `fetch` Promise. Check the response status and throw an `Error` if the application contract treats non-2xx responses as failures.

- **Rejecting with a bare string.** `reject("failed")` is legal but loses the standard error metadata. Prefer `reject(new Error("failed"))`, and preserve the original error when adding context.

- **Attaching only a rejection handler as a second `.then()` argument too early.** `promise.then(success, failure)` handles rejection of `promise`, but it does not catch an error thrown inside `success` in the same call. Use `promise.then(success).catch(failure)` when `failure` should also handle errors from `success`.

## 7. Compare With Related Concepts

- **Promise vs callback:** A callback is a function an API chooses to call; a Promise is a result object that can be observed and chained. Use a Promise for composable one-result async work; use callbacks for APIs built around repeated events or streaming notifications.

- **Fulfilled vs resolved:** Fulfilled means final success; resolved means the outcome is fixed, possibly by adopting another thenable. Use “fulfilled” when you know the final operation succeeded; use “resolved” when explaining adoption or the resolution procedure.

- **Settled vs completed:** Settled means the Promise has a final fulfilled or rejected state. “Completed” can casually imply success, so use “settled” when failure is also included.

- **Thrown error vs rejected Promise:** A synchronous throw interrupts the current call; a rejection is the failure outcome of a Promise and is observed by a later rejection handler. Use `throw` inside an async function or Promise handler when you want the returned/derived Promise to reject; use `try/catch` around synchronous code when no Promise boundary exists.

- **`then` vs `catch`:** `.then(onFulfilled, onRejected)` can handle the source Promise's two outcomes, while `.catch(onRejected)` is clearer for handling failures from the whole chain before it. Use `.catch()` at the end of a chain when downstream handler errors should also be covered.

- **`finally` vs duplicated success/error cleanup:** `finally` expresses one cleanup action for either outcome and preserves the result when cleanup succeeds. Use separate handlers when the cleanup differs or needs the success value/error reason.

- **Promise settlement vs cancellation:** Settlement answers what result won; cancellation asks the underlying work to stop. Use both when a UI no longer needs a request: abort the work, then handle the resulting rejection according to the API's cancellation contract.

## 8. 🧠 The Memory Hook — What Sticks

A Promise is a one-way tracking record: pending is “still delivering,” fulfilled is “delivered,” and rejected is “delivery failed.” Remember the sharper rule: resolving to another Promise hands that record to a second courier, so the first record can be resolved while it is still waiting and only becomes fulfilled or rejected when the adopted courier finishes.
