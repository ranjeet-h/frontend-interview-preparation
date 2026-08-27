# Part 1 — Question 18: A Promise Chain Transforms Its Value

## The Code

```javascript
Promise.resolve("A")
  .then((res) => {
    console.log(res);
    return Promise.resolve("B");
  })
  .then(console.log);
```

## The Answer

```text
A
B
```

The first `.then()` receives the fulfillment value `"A"`, so it logs `A`. It then returns another promise, this one fulfilled with `"B"`. The promise created by the first `.then()` waits for that returned promise and adopts its fulfillment value. The second `.then(console.log)` therefore receives `"B"` and logs it.

## Execution — Walk Through It Like the JS Engine

The promise callbacks do not run while JavaScript is merely building the chain. The promise executor work and the chain setup happen synchronously; the handlers run later as microtasks.

1. JavaScript evaluates `Promise.resolve("A")`. This creates an already-fulfilled promise whose value is `"A"`.
2. JavaScript calls `.then(...)` on that promise. The first handler is registered for fulfillment, and `.then()` immediately returns a new promise representing the result of that handler. The handler itself is not called inline.
3. JavaScript attaches `.then(console.log)` to the new promise and then finishes the synchronous script. At this point, nothing has been printed yet.
4. The microtask for the first fulfillment handler runs. Its parameter `res` is `"A"`, so `console.log(res)` prints `A`.
5. The handler returns `Promise.resolve("B")`. Returning a promise is special: the promise produced by the first `.then()` does not become fulfilled with the promise object itself. It adopts that promise's eventual state and value. Here, the returned promise is already fulfilled with `"B"`.
6. Because the first chain link has now fulfilled with `"B"`, JavaScript schedules the second `.then()` handler as another microtask. The `console.log` function receives `"B"` as its argument and prints `B`.

The chain is a value pipeline. `"A"` enters the first link, that link logs it and transforms it into `"B"`, and the next link receives the transformed value. Every `.then()` creates a new promise, which is why the later link can wait for and consume the earlier link's result.

## The Concept This Question Tests

This tests promise chaining and promise resolution. A `.then()` callback can return either a normal value or another promise. If it returns a normal value, the next promise in the chain fulfills with that value. If it returns a promise, the next promise waits for it and adopts its fulfillment or rejection.

That adoption rule is what makes asynchronous pipelines composable. A function can return a promise without forcing the caller to add a separate nested callback. The chain flattens the returned promise by one level, so the next handler receives `"B"`, not a promise that the caller must unwrap manually.

The final `.then(console.log)` is valid because `then` calls its fulfillment handler with the resolved value. Passing the function reference means it behaves like `value => console.log(value)` for this example. It is not called during chain construction; it runs when the preceding promise fulfills.

Even though both promises are already fulfilled, promise reactions are asynchronous. The first handler runs in a microtask after the current synchronous job, and the second handler runs in a later microtask after the first handler settles the promise it returned.

## The Trap — Why Most People Get It Wrong

The most common mistake is expecting `A` to print immediately when `.then()` is attached. `.then()` registers a reaction and returns; it does not invoke the callback synchronously. Already-fulfilled promises still schedule their handlers asynchronously.

Another mistake is thinking the second handler receives the promise object returned by the first handler. Promise resolution follows returned promises. Since the first callback returns `Promise.resolve("B")`, the next link receives the inner promise's value, `"B"`.

It is also easy to confuse `then(console.log)` with `then(console.log())`. The first passes a function reference for JavaScript to call later. The second calls `console.log` immediately while constructing the chain and passes its return value—usually `undefined`—as the handler, which changes the behavior completely.

Finally, the two `.then()` calls do not share one mutable promise. Each call creates a new promise. The original promise remains fulfilled with `"A"`; the first derived promise fulfills with `"B"`; and the second handler observes that derived result.

## 🧠 The Memory Hook

Think of `.then()` as a conveyor-belt station: it receives one value, does its work, and sends the next value down the belt. Returning a promise means the belt waits for that promise and sends its result—not the wrapper—to the next station.
