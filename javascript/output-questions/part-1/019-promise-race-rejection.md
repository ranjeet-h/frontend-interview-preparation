# Part 1 — Question 19: `Promise.race()` Can Lose to an Immediate Rejection

## The Code

```javascript
const p1 = Promise.resolve("p1");
const p2 = new Promise((resolve, reject) => {
  setTimeout(() => resolve("p2"), 100);
});
const p3 = Promise.reject("p3 error");

Promise.race([p3, p1, p2]).then(
  (res) => console.log(res),
  (err) => console.log(err)
);
```

## The Answer

```text
p3 error
```

`Promise.race()` settles with whichever input promise settles first, whether that outcome is fulfillment or rejection. `p3` is already rejected when it is passed to the race, so the race becomes rejected with the reason `"p3 error"`. The rejection handler—the second callback passed to `.then()`—logs that reason.

`p1` is also already fulfilled, so it is not about the array position deciding the winner. The promise reaction for `p3` is registered first while `Promise.race()` is inspecting the iterable, and its rejection reaction wins before `p1`'s fulfillment reaction gets to settle the race. `p2` cannot win because its timer settles much later.

## Execution — Walk Through It Like the JS Engine

1. JavaScript evaluates `Promise.resolve("p1")`. `p1` is created already fulfilled with the value `"p1"`.
2. JavaScript creates `p2` with `new Promise(...)`. The executor runs immediately, schedules a 100-millisecond timer, and leaves `p2` pending. The timer is the only thing that will eventually resolve it.
3. JavaScript evaluates `Promise.reject("p3 error")`. `p3` is created already rejected with the rejection reason `"p3 error"`.
4. `Promise.race([p3, p1, p2])` creates a new pending promise, which we can call the race promise. It attaches settlement reactions to each input. The race promise is designed to adopt the first fulfillment or rejection that reaches it; later outcomes are ignored for the race's state.
5. While the iterable is processed, `p3` is encountered first. Because it is already rejected, its rejection reaction is queued as a promise microtask. `p1` is then encountered and its fulfillment reaction is also queued as a microtask. `p2` gets handlers too, but its resolution cannot happen until the timer fires.
6. The current synchronous JavaScript job finishes. The microtask queue runs in registration order. The reaction for `p3` runs first and tries to reject the race promise with `"p3 error"`. The race promise changes from pending to rejected.
7. The reaction for `p1` runs next, but the race promise is already settled. It cannot change the race to fulfilled, so `"p1"` is ignored as far as the race result is concerned.
8. The `.then(onFulfilled, onRejected)` call has attached both handlers to the race promise. Since the race is rejected, only `onRejected` is eligible. That handler logs `p3 error` in a following microtask.
9. After approximately 100 milliseconds, the timer resolves `p2`. Its reaction runs later, but the race has already rejected, so this result is ignored. The timer does not produce another log.

The key detail is that `race` is about the first settlement, not the first successful result. A rejection is a legitimate winner.

## The Concept This Question Tests

This tests the difference between promise settlement and promise fulfillment. A promise is settled once it becomes either fulfilled or rejected. `Promise.race()` listens for both kinds of settlement and adopts the first one it observes.

The returned race promise starts pending. Internally, each input is treated like a promise and gets fulfillment and rejection reactions that attempt to settle the same returned promise. The first reaction succeeds; every later reaction finds that the returned promise is already settled and has no effect on its state.

Already-settled promises still run handlers asynchronously. `p3` is rejected immediately, but its reaction does not run inline inside `Promise.race()` or `.then()`. It is queued as a microtask after the current synchronous job. When multiple already-settled inputs are processed, their reaction order follows the order in which those reactions are registered, which is why `p3` gets the opportunity to settle this race before `p1`.

The second argument to `.then()` is the rejection handler. It is not a `.catch()` call, but for this example it handles the race's rejection directly and receives the exact rejection reason.

## The Trap — Why Most People Get It Wrong

The biggest mistake is reading “race” as “first promise to fulfill.” That describes a successful-only race someone might build manually, not native `Promise.race()`. Native `Promise.race()` returns the first outcome, so an immediate rejection beats a slower fulfillment.

Another mistake is assuming `p1` wins because it is fulfilled and appears near the front of the list. Array order does not make a promise win synchronously. The inputs are observed in order, and their reactions are queued; the first queued settlement reaction here belongs to `p3`, which appears first.

Do not expect `p2`'s timer to be cancelled. `Promise.race()` stops waiting for the race result after it settles, but it does not cancel the underlying operations. The timer still fires and `p2` still resolves; its result simply cannot change the already-rejected race promise.

Finally, do not expect the output to be an `Error` object. The code rejects with the string `"p3 error"`, so the rejection handler receives and logs that string. Promise rejection reasons can be any JavaScript value.

## 🧠 The Memory Hook

`Promise.race()` is a finish line that accepts both winners and failures: the first promise to cross it—fulfilled or rejected—decides the result. Once the race has a winner, every later result arrives too late.
