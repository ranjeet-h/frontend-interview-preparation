# Part 1 — Question 17: A Rejected Promise Can Recover

## The Code

```javascript
const promise = new Promise((resolve, reject) => {
  reject("Error");
});

promise
  .then(() => console.log("Success 1"))
  .catch(() => console.log("Error 1"))
  .then(() => console.log("Success 2"));
```

## The Answer

```text
Error 1
Success 2
```

`promise` is rejected, so the first `.then()` handler is skipped. The rejection travels to `.catch()`, which logs `Error 1`. That catch handler does not throw a new error or return a rejected promise, so the promise produced by `.catch()` is fulfilled. The final `.then()` sees that fulfilled promise and logs `Success 2`.

## Execution — Walk Through It Like the JS Engine

JavaScript evaluates the code from top to bottom, but it treats promise reactions as microtasks rather than running them immediately.

1. JavaScript evaluates `new Promise(...)`. The promise begins as pending, and the executor function passed to the constructor runs immediately.
2. The executor calls `reject("Error")`. The promise changes from pending to rejected with the reason `"Error"`. Rejecting it does not throw the error out of this script; it records the rejected outcome for promise reactions.
3. The executor returns, and the rejected promise is stored in `promise`.
4. `promise.then(successHandler)` attaches a fulfillment handler. Because `promise` is rejected, that handler is not eligible to run. JavaScript creates a new promise for the result of this `.then()` and carries the rejection forward to it.
5. `.catch(errorHandler)` is shorthand for `.then(undefined, errorHandler)`. It attaches a rejection handler to the new rejected promise, so JavaScript schedules that handler as a microtask. The current synchronous script still finishes first.
6. When the microtask runs, the catch handler executes and prints `Error 1`. It returns normally and does not explicitly return a rejected promise. A handler that completes normally recovers the chain, so the promise returned by `.catch()` becomes fulfilled with the handler's return value, which is `undefined` here.
7. The final `.then()` is attached to that newly fulfilled promise. Its fulfillment handler is therefore scheduled as the next promise reaction. It runs after the catch reaction and prints `Success 2`.

The chain is not one promise being mutated in place. Each `.then()` and `.catch()` returns a new promise. The first promise is rejected, the catch handler handles that rejection, and the next promise represents the recovered state.

## The Concept This Question Tests

This tests promise propagation and recovery. A promise chain has two paths: fulfillment handlers respond to successful promises, while rejection handlers respond to failed promises. A rejection skips fulfillment handlers until it finds a rejection handler such as the second argument to `.then()` or `.catch()`.

The important rule is what a handler returns. If a handler returns a normal value—or simply reaches the end without throwing—the promise created for that chain link becomes fulfilled. If the handler throws or returns a rejected promise, the next link remains rejected. In this example, `.catch()` handles the original rejection and returns normally, so it converts the chain back to fulfillment.

`catch` is not a magical final stop. It is another promise-chain link, equivalent to `.then(undefined, onRejected)`. That is why a `.then()` placed after it can run: the catch handler successfully completed and produced a fulfilled promise.

The callbacks still run asynchronously as promise reactions. The executor itself runs synchronously during `new Promise(...)`, but the `.then()` and `.catch()` handlers are queued as microtasks after the current JavaScript job finishes.

## The Trap — Why Most People Get It Wrong

The first trap is assuming the first `.then()` prints `Success 1` because the chain starts with `.then()`. It does not. A fulfillment handler only runs when the promise immediately before it is fulfilled. This promise is rejected, so that handler is skipped entirely.

Another common mistake is expecting the rejection to stop the whole chain after `Error 1`. A catch handler is allowed to recover. Because this handler only logs and returns normally, the next promise is fulfilled and the final `.then()` runs.

People also sometimes think `catch` reuses the original promise and changes its state. It does not. Promise states are settled permanently. The original promise stays rejected; `.catch()` returns a different promise whose state is fulfilled because the rejection handler completed successfully.

Finally, do not assume the catch handler runs inline while `.catch()` is being called. Promise reactions are always asynchronous microtasks, even when the promise is already rejected. The exact output order here is still `Error 1`, then `Success 2`, because the second reaction is chained after the first one.

## 🧠 The Memory Hook

Picture a rejection as a ball rolling downhill past every success-only handler until it reaches `catch`. If `catch` catches it and does not throw it again, the ball changes direction: the rest of the chain is back on the success path.
