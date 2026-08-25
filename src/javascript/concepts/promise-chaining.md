# Promise Chaining

## 1. Why This Exists — The Problem First

Imagine a checkout request that must load the cart, confirm inventory, charge the customer, create an order, and send a receipt. If every step starts immediately, later steps receive missing data; if every callback nests another callback, the success path drifts right and the error path becomes easy to miss. A promise chain gives each step a clear handoff and one predictable route for failures.

The important interview problem is not “how do I make async code look tidy?” It is: how does one result become the input to the next step, and what happens when a step returns a value, returns another promise, throws, recovers, or cleans up?

## 2. The Analogy — Make It Obvious

Think of a restaurant kitchen with a sequence of stations. The order ticket is the starting promise. The prep station receives the current order, does its work, and hands a finished dish to the next station. That handoff is the value returned from a `.then()` callback.

Each station also has a new ticket for the next station. A station can hand over a completed dish immediately, or hand over a ticket from a supplier and make the next station wait until the supplier finishes. That is thenable adoption: the next ticket follows the supplier’s eventual success or failure instead of containing a ticket inside a ticket.

If a station cannot complete the order, it sends an exception down the kitchen’s failure route. Ordinary success stations are skipped until an error handler takes over. An error handler can repair the order and send a valid dish forward, or fail again and keep the exception moving.

`finally` is the closing job—wipe the counter, release a lock, or stop a spinner—regardless of whether the dish succeeded. It observes completion but normally passes the original result or error onward. A forked copy of the order represents branching: both branches can observe the same settled promise, but they have separate downstream tickets and can produce different outcomes.

## 3. How It Actually Works — The Full Explanation

Calling `.then(onFulfilled, onRejected)`, `.catch(onRejected)`, or `.finally(onFinally)` immediately creates and returns a new promise. The callback does not return the original promise and does not return its eventual value synchronously. The new promise starts pending and is settled later when the callback runs as a promise reaction.

For a fulfillment handler, the settlement rule is the heart of chaining:

| Callback outcome | Promise returned by this link does |
| --- | --- |
| `return value` | Fulfills with that value, including `undefined` if there is no return. |
| `return promise` | Waits for that promise and adopts its fulfillment value or rejection reason. |
| `return thenable` | Reads its `then` behavior and assimilates it using the same promise-resolution procedure. |
| `throw error` | Rejects with that error. |

That rule is why `return` matters. In `return fetchOrders()`, the chain waits for the request. In `{ fetchOrders(); }`, the callback returns `undefined`, so the next link is allowed to run immediately with `undefined`; the detached request still runs, but its result is no longer connected to the outer chain.

The same rules apply to an error handler. A rejection skips fulfillment handlers until a rejection handler is found. `.catch(handleError)` is equivalent to `.then(undefined, handleError)`. If the handler returns a fallback value, the new promise is fulfilled and the next `.then()` runs. If it throws or returns a rejecting promise, the new promise remains rejected and the error continues downstream.

There is a subtle boundary around `.then(onFulfilled, onRejected)`: the two callbacks are siblings for the promise before that `.then()`. The `onRejected` callback handles a rejection already present on the input promise; it does not catch an exception thrown by that same `.then()` call’s `onFulfilled`. That thrown error rejects the new promise, so a later `.catch()` is the natural handler.

Returned promises are flattened by adoption. If a callback returns `Promise.resolve(Promise.resolve(42))`, consumers receive `42`, not an exposed nested promise. The same resolution procedure also adopts ordinary thenables such as `{ then(resolve) { resolve("ready"); } }`. This is useful for interoperability, but a badly behaved thenable can call its callbacks multiple times or throw while its `then` method is being read; the promise resolution procedure settles the new promise only once.

`.finally()` is cleanup, not a transformation of the successful value. If the original promise fulfills with `value` and the `finally` callback returns normally, the next link still receives `value`. If the original promise rejects with `reason` and cleanup returns normally, the next rejection handler still receives `reason`. If cleanup throws or returns a rejecting promise, that new failure replaces the earlier outcome. The returned promise waits for asynchronous cleanup before forwarding anything.

A chain is sequential only where links depend on one another. Multiple `.then()` calls attached to the same promise create branches; they do not form one shared linear queue. For independent operations, start them before awaiting or use `Promise.all()`. `Promise.all()` preserves input order in its fulfillment array, waits for all inputs to fulfill, and rejects when an input rejects; it is a coordination tool, not a replacement for a dependent chain.

## 4. Real Code — See It Working

Run these examples in Node.js. The first models a production-like order flow and shows value propagation, promise adoption, centralized failure handling, and cleanup.

```js
const delay = (value, ms) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const api = {
  loadCart: () => delay({ id: "cart-42", sku: "keyboard", quantity: 1 }, 5),
  reserveInventory: (cart) => delay({ ...cart, reservationId: "reserve-7" }, 5),
  charge: (reservation) => delay({ ...reservation, paymentId: "pay-9" }, 5),
  createOrder: (payment) => delay({ orderId: "order-100", ...payment }, 5),
};

function placeOrder() {
  return api
    .loadCart()
    // WHY: returning this promise makes the next link wait for inventory.
    .then((cart) => api.reserveInventory(cart))
    // WHY: returning this promise is adopted, so the next link receives payment.
    .then((reservation) => api.charge(reservation))
    .then((payment) => api.createOrder(payment))
    .then((order) => ({ status: 201, body: order }))
    // WHY: a fallback value deliberately recovers this chain for the caller.
    .catch((error) => ({ status: 503, body: { message: error.message } }))
    .finally(() => {
      // WHY: cleanup runs for success and failure, but does not change the result.
      console.log("release request-scoped resources");
    });
}

placeOrder().then((response) => console.log(response));
```

The next example makes return-versus-throw visible. The first branch fulfills with a transformed value. The second rejects because a thrown error settles the promise returned by that `.then()`.

```js
Promise.resolve("invoice-7")
  .then((invoiceId) => `${invoiceId}:queued`)
  .then((status) => console.log("value:", status));

Promise.resolve("invoice-7")
  .then(
    () => {
      throw new Error("billing service unavailable");
    },
    () => console.log("same-link rejection handler is not used")
  )
  .catch((error) => console.log("caught later:", error.message));
```

Here a missing `return` detaches work from the chain, while returning it makes the outer chain adopt the inner result.

```js
const delay = (value, ms) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const readProfile = () => delay({ id: 7, name: "Mina" }, 5);
const readPermissions = (userId) => delay(["orders:read"], 5);

readProfile()
  .then((user) => {
    readPermissions(user.id); // WHY: without return, the next link gets undefined.
  })
  .then((permissions) => console.log("detached value:", permissions));

readProfile()
  .then((user) => readPermissions(user.id))
  // WHY: the returned promise is adopted, so permissions is the resolved array.
  .then((permissions) => console.log("connected value:", permissions));
```

Thenable adoption and `finally` can be tested without a network or framework:

```js
const thenable = {
  then(resolve) {
    setTimeout(() => resolve("from a thenable"), 5);
  },
};

Promise.resolve(thenable)
  .then((value) => value.toUpperCase())
  .finally(() => console.log("cleanup finished"))
  .then((value) => console.log(value));
```

For independent work, do not create an accidental waterfall:

```js
const delay = (value, ms) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const userPromise = delay({ id: 7 }, 20);
const featureFlagsPromise = delay({ checkoutV2: true }, 10);

Promise.all([userPromise, featureFlagsPromise]).then(([user, flags]) => {
  console.log(user.id, flags.checkoutV2);
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does `.then()` return?**

It returns a new promise immediately. That promise is initially pending, and its eventual state depends on the callback: a returned value fulfills it, a returned promise or thenable is adopted, and a thrown error rejects it. This new promise is what makes another `.then()` link possible.

**Q: Why must a promise be returned from a `.then()` callback?**

The return value is the only signal that connects the callback’s work to the next promise. Returning `fetchOrders()` tells the chain to wait and pass the orders onward. Calling `fetchOrders()` without returning it makes the current callback return `undefined`; the chain continues with `undefined` while the request runs independently.

**Q: What happens when a callback returns another promise?**

The promise created by the current `.then()` adopts the returned promise’s eventual state and value. It does not fulfill with the promise object itself, so the next callback receives the eventual data. If the returned promise rejects, the outer chain rejects too.

**Q: What is thenable adoption?**

A thenable is any object with promise-like `then` behavior; it does not have to be created by `Promise`. Promise resolution assimilates that object by calling its `then` method and following the first valid fulfillment or rejection. This allows promise chains to interoperate with promise-like libraries while still producing a real promise for downstream code.

**Q: How do errors propagate through a chain?**

A rejection skips fulfillment handlers and travels to the next rejection handler. An exception thrown inside a fulfillment or rejection callback also rejects the new promise returned by that link, so it can be handled by a later `.catch()`. The first matching handler can either recover with a value or create another rejection.

**Q: Can `.then(onFulfilled, onRejected)` catch an error thrown by `onFulfilled`?**

No. `onRejected` handles the input promise’s rejection, not errors produced while running its sibling `onFulfilled`. Use a following `.catch()` when you want one handler to cover both an earlier rejection and exceptions thrown in success callbacks.

**Q: How does `.catch()` recover a chain?**

`.catch(handler)` is shorthand for `.then(undefined, handler)`. If the handler returns a value or a fulfilled promise, the promise returned by `.catch()` fulfills and later `.then()` callbacks run. If the handler throws or returns a rejection, recovery did not happen and the error continues downstream.

**Q: What does `.finally()` receive and return?**

`finally` receives no fulfillment value or rejection reason because it is for unconditional cleanup. It returns a new promise that normally forwards the original outcome after cleanup completes. A thrown error or rejected cleanup promise replaces the original outcome, which is why cleanup should not casually fail or hide the primary error.

**Q: How can one promise have multiple downstream paths?**

Attach separate handlers to the same promise. Each `.then()` call creates its own downstream promise, so one branch can render cached data while another records telemetry. The branches share the input settlement but do not share later return values or errors unless you explicitly combine them.

**Q: When should you use a chain, `async`/`await`, or `Promise.all()`?**

Use a chain when a sequence reads naturally as transformations or when composing promise-returning functions. Use `async`/`await` for the same promise semantics when local variables and `try`/`catch` make the workflow clearer. Use `Promise.all()` for independent operations that should start together; use a dependent chain when step B needs step A’s result. A chain is not automatically “parallel” just because all calls are promises.

## 6. The Traps — What Goes Wrong

**Forgetting `return` inside braces.** `then((user) => { loadOrders(user.id); })` returns `undefined` because braces require an explicit return. The fix is `then((user) => loadOrders(user.id))` or `then((user) => { return loadOrders(user.id); })`.

**Mistaking a chain for a single mutable pipeline.** A promise is immutable after settlement, and each handler creates a separate promise. Reusing the original promise in two branches is safe; changing what one branch returns does not change the input seen by the other branch.

**Catching too early or swallowing the error.** A `.catch(() => null)` may turn a failed payment into data that looks valid. Recover only when a fallback is genuinely safe; otherwise log useful context and rethrow so the caller or boundary can decide what to do.

**Using the second argument to `.then()` as a broad catch.** `then(success, failure)` does not catch exceptions thrown by `success`. A later `.catch()` covers the whole preceding path and is usually the clearer choice when success work can itself fail.

**Assuming `finally` cannot change the result.** A normal `finally` callback preserves the result, but `finally(() => { throw error; })` replaces it with the new rejection. Cleanup must be reliable, and cleanup failures should be treated as real failures rather than silently ignored.

**Calling dependent work in parallel.** `Promise.all([loadUser(), loadOrders(user.id)])` cannot work if `user` is not available yet. Start independent calls together; keep dependent calls in a chain or sequential `await`.

**Calling the chain but not observing its final rejection.** A returned promise can still reject after the current function returns. Application boundaries, request handlers, jobs, and event callbacks need a deliberate final `.catch()` or `await` inside `try`/`catch`; otherwise the rejection may become unhandled.

## 7. Compare With Related Concepts

**Promise chain vs `async`/`await`:** both use the same promise settlement and propagation rules; `await` pauses the async function until adoption finishes, while `.then()` expresses the continuation directly. Use a chain for compact transformations and composition; use `async`/`await` when named intermediate values and structured `try`/`catch` improve readability.

**Sequential chain vs `Promise.all()`:** a chain starts the next dependent operation after the previous result is available; `Promise.all()` coordinates independent operations started together. Use the chain for dependencies and `Promise.all()` for independent work where all results are required.

**`Promise.all()` vs `Promise.allSettled()`:** `all()` fails fast with one rejection and is right when the batch is useful only if every operation succeeds. `allSettled()` waits for every operation and reports each status, so use it when partial success, cleanup, or per-item reporting matters.

**`.catch()` vs `then(undefined, onRejected)`:** they are behaviorally equivalent for handling the input rejection, but `.catch()` communicates intent and makes a long chain easier to scan. Use the second argument when you specifically need separate handlers attached to the same promise boundary and understand that it will not catch sibling success-handler errors.

**`.finally()` vs repeating cleanup in success and failure handlers:** `finally()` centralizes unconditional cleanup and preserves the original outcome when it succeeds. Use it for closing resources, stopping loading indicators, or releasing locks; use a normal `.then()` or `.catch()` when cleanup depends on the result or error.

## 8. 🧠 The Memory Hook — What Sticks

Every link is a new ticket: return a value to hand over a result, return a promise to make the next ticket wait, or throw to send the ticket down the failure route. `catch` can repair the route, `finally` can clean the kitchen, and `Promise.all` is the fork where independent tickets start together.
