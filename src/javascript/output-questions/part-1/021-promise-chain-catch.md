# Promise Chain: Why `catch` Is Skipped

## The Code

```javascript
Promise.resolve(1)
  .then((res) => {
    console.log(res); // 1
    return 2;
  })
  .catch((err) => {
    return 3;
  })
  .then((res) => {
    console.log(res); // 2
  });
```

## The Answer

```text
1
2
```

The first `then` runs because `Promise.resolve(1)` is fulfilled. It logs `1` and returns the ordinary value `2`, so the promise created by that `then` becomes fulfilled with `2`.

The `catch` is not an unconditional middle step. It is shorthand for a `then` with only a rejection handler, so it runs only if the promise immediately before it is rejected. Since the previous handler returned `2` successfully, the rejection handler is skipped and the value `2` continues down the chain.

The final `then` receives that `2` and logs it.

## Execution — Walk Through It Like the JS Engine

JavaScript first evaluates `Promise.resolve(1)`. That creates an already-fulfilled promise whose value is `1`. The promise does not execute the callback passed to `.then()` immediately, though. Promise reactions always run asynchronously in a microtask, even when the promise is already settled.

The first `.then()` registers a fulfillment handler and returns a new promise for the next link in the chain. The original promise is fulfilled, so JavaScript queues the first handler as a microtask. The `.catch()` is attached to the promise returned by the first `.then()`, and the final `.then()` is attached to the promise returned by `.catch()`.

When the current synchronous work finishes, the microtask runs the first handler. `res` is `1`, so `console.log(res)` prints `1`. The handler then returns the plain value `2`. Returning a value is a successful completion, so the promise produced by this `.then()` becomes fulfilled with `2`.

That fulfillment settles the promise seen by `.catch()`. A `catch` supplies a rejection handler, not a handler for successful values. Because there is no rejection, its callback is skipped. The promise returned by `.catch()` adopts the successful value that passed through it, so it is fulfilled with `2` as well.

That fulfillment queues the final `.then()` callback as another microtask. It receives `2` and prints `2`. Its callback returns `undefined`, but nothing later in this example observes that final promise.

The important chain is:

```text
Promise.resolve(1)
        │ fulfilled with 1
        ▼
first then: logs 1, returns 2
        │ fulfilled with 2
        ▼
catch: skipped, passes 2 through
        │ fulfilled with 2
        ▼
final then: logs 2
```

Each `.then()` and `.catch()` creates and returns a new promise. A handler's return value controls the state and value of that next promise: returning a normal value fulfills it, throwing an error rejects it, and returning another promise makes it wait for that promise.

## The Concept This Question Tests

This tests promise-chain propagation and the difference between fulfillment handlers and rejection handlers.

`.then(onFulfilled, onRejected)` has two independent branches. The fulfillment callback handles a successful value; the rejection callback handles a failure. `.catch(onRejected)` is the clearer shorthand for the rejection-only form. It does not run merely because it appears in the chain.

There is also a value-propagation rule. If a handler is absent, or if the relevant handler is skipped, the promise keeps the same fulfillment value or rejection reason for the next link. That is why `2` travels through the skipped `catch`.

The chain can be understood as equivalent to this shape:

```javascript
Promise.resolve(1)
  .then((res) => {
    console.log(res);
    return 2;
  })
  .then(
    undefined,
    (err) => {
      return 3;
    },
  )
  .then((res) => {
    console.log(res);
  });
```

The second argument is not called because the preceding promise fulfilled. If the first handler had thrown instead, the chain would have become rejected and the `catch` would have had a chance to recover it by returning `3`.

All of these callbacks run through the microtask queue. The fact that the initial promise is already resolved changes when the reaction is queued, not the rule that promise callbacks are asynchronous.

## The Trap — Why Most People Get It Wrong

The most common mistake is reading `catch` as “always run this code after the previous step.” It actually means “run this code if the chain is rejected at this point.” A fulfilled value skips it completely.

Another mistake is assuming that `return 2` changes the value only inside the current callback. It changes the value of the next promise in the chain. The final `then` receives `2` because every link passes its successful return value forward.

Returning `3` from the `catch` would matter only if the first handler failed:

```javascript
Promise.resolve(1)
  .then(() => {
    throw new Error("failed");
  })
  .catch(() => 3)
  .then(console.log); // 3
```

A subtler trap is believing that a skipped `catch` leaves the next link with no value. It does not. A missing or skipped handler transparently passes the existing state onward. Fulfillment stays fulfillment; rejection stays rejection unless a handler changes it.

Finally, do not describe the output as synchronous just because `Promise.resolve(1)` is already settled. The promise callbacks run in microtasks after the current synchronous stack completes. That distinction matters when ordinary `console.log` calls or timers are mixed into the example.

## 🧠 The Memory Hook

`catch` is an emergency exit, not a scheduled stop: if the chain is healthy, the value walks straight past it. Here, `1` is logged, `2` is returned, the emergency exit is unused, and `2` reaches the final handler.
