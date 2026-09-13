# Part 1 — Question 20: Promise.all() Keeps Input Order

## The Code

```javascript
const p1 = new Promise((res) => setTimeout(() => res("one"), 500));
const p2 = new Promise((res) => setTimeout(() => res("two"), 100));

Promise.all([p1, p2]).then((res) => console.log(res));
```

## The Answer

```text
["one", "two"]
```

p2 finishes first because its timer is only 100 milliseconds. That does not make "two" the first item in the result, though. Promise.all() stores each fulfillment value in the position belonging to its input promise, then fulfills only after every input has finished. Because the inputs were [p1, p2], the final array is ["one", "two"].

In Node.js, console.log may display the same array as [ 'one', 'two' ], with single quotes. That is only the console's formatting; the values and their order are the same.

## Execution — Walk Through It Like the JS Engine

1. JavaScript evaluates the first new Promise(...). The promise executor runs immediately, so a 500-millisecond timer is registered. p1 remains pending until that timer calls res("one").
2. JavaScript evaluates the second new Promise(...). Its executor also runs immediately and registers a 100-millisecond timer. p2 remains pending until that timer calls res("two").
3. JavaScript calls Promise.all([p1, p2]). It creates a new pending promise—the promise returned by Promise.all()—and attaches fulfillment and rejection reactions to both inputs. It also remembers each input's position: p1 is position 0, and p2 is position 1.
4. JavaScript attaches the then callback to the returned Promise.all() promise. Nothing is logged yet because that promise is still waiting for both inputs.
5. The synchronous script finishes. The event loop can now process the timers. After roughly 100 milliseconds, p2 fulfills with "two". Its reaction runs in a microtask and stores "two" at result position 1. One input is complete, but p1 is still pending, so Promise.all() stays pending.
6. After roughly 500 milliseconds, p1 fulfills with "one". Its reaction runs and stores "one" at result position 0. Now both inputs are complete, so Promise.all() fulfills with the result array ["one", "two"].
7. Fulfilling the Promise.all() promise queues the callback from then. That callback runs as a microtask and logs the completed array.

The important distinction is between completion order and result order. Completion happens as p2, then p1; collection happens by input position, so the result is p1, then p2.

## The Concept This Question Tests

This tests the contract of Promise.all(): it waits for every input to fulfill and returns one array whose positions match the input iterable. It is an aggregation operation, not a stream of results in the order they happen to arrive.

Internally, the returned promise keeps a count of unfinished inputs and a results array. When an input fulfills, its value is written to the slot associated with that input. The completion counter is separate from the slot number. That separation is what lets p2 finish first without moving "two" to the front.

Promise.all() is fail-fast for rejection. If any input rejects, the returned promise rejects with that reason and its fulfillment handler never runs. In this example both promises fulfill, so the returned promise waits until the slower p1 is done.

The then callback still runs asynchronously. Even when all inputs are already fulfilled, promise reactions run in a microtask after the current synchronous JavaScript job, not inline while Promise.all() is being called.

## The Trap — Why Most People Get It Wrong

The common wrong answer is ["two", "one"], because "two" is produced first. That confuses the time a promise settles with the index assigned to its value. Promise.all() preserves the input order, so the first argument stays at index 0 even if it is the last one to finish.

Another mistake is saying that Promise.all() starts p1 and p2 one after another. The promises have already been created before Promise.all() receives them, and both timer executors ran synchronously during construction. Promise.all() observes and combines those existing promises; it does not control when their underlying work starts.

Do not say that Promise.all() cancels p1 after p2 finishes. It cannot produce a result until p1 settles, and it does not cancel either timer. If one input rejects, the returned promise rejects early, but other operations may continue running in the background.

Finally, do not treat the array as a set of independent then logs. Promise.all() produces one new promise and one combined array. The callback receives that array only after every input has fulfilled.

## 🧠 The Memory Hook

Promise.all() has two clocks: promises finish whenever they finish, but their values sit in numbered seats assigned by the input list. The slow promise may arrive last, yet its value still belongs in its original seat.
