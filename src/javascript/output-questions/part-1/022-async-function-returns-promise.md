# Part 1 — Question 22: An `async` Function Returns a Promise

## The Code

```javascript
async function greet() {
  return "Hello";
}
console.log(greet());
```

## The Answer

The function does not log the string `Hello` directly. It logs the Promise returned by `greet()`.

The source bank documents the host/console representation like this:

```text
Promise {<fulfilled>: 'Hello'}
```

This text is a host/console representation, not a JavaScript language-level string that every runtime must print identically. Current Node and browser consoles may instead show `Promise { 'Hello' }` or an expandable fulfilled Promise. Those are different representations of the same runtime fact: the promise is already fulfilled, and its fulfillment value is the string `Hello`.

If the code wanted to print the value itself, it would have to observe the promise asynchronously:

```javascript
async function greet() {
  return "Hello";
}

greet().then((message) => console.log(message));
// Hello
```

The important answer is therefore: `greet()` returns an already-fulfilled Promise, not the plain string.

## Execution — Walk Through It Like the JS Engine

1. JavaScript processes the `async function greet` declaration. The function is available to call, but its body has not run yet.
2. Execution reaches `console.log(greet())`, so JavaScript calls `greet`.
3. Calling an `async` function immediately creates and returns a Promise. The function body starts running synchronously far enough to evaluate its `return` statement; no timer, network request, or Web API is involved here.
4. The expression `"Hello"` is evaluated. Because the function is async, JavaScript does not return that string directly. It fulfills the function's Promise with `"Hello"`.
5. The call expression `greet()` therefore produces a Promise object. That object is passed as the argument to `console.log`.
6. `console.log` inspects the object and prints an environment-specific representation of the Promise. The representation may include its fulfilled state and value, but it is still an object—not the output of a later `.then` callback.
7. If a `.then` handler had been attached, that handler would run in a microtask after the current synchronous JavaScript job finishes. The original code attaches no handler, so there is no later `Hello` log.

There are two separate ideas here: the Promise settles with the value `Hello`, while `console.log` prints the Promise object itself. Confusing those two levels is what produces the common wrong answer.

## The Concept This Question Tests

This tests the return contract of an `async` function. An async function always returns a Promise. A normal return value is automatically used to fulfill that Promise, so `return "Hello"` behaves conceptually like returning a fulfilled promise containing `"Hello"`.

That does not mean the function must perform asynchronous work. This function has no `await` and no external operation, yet its public return type is still a Promise. The `async` keyword changes the function's interface: callers must use `.then` or `await` to receive the fulfillment value.

The Promise is settled before `greet()` gives control back to the caller, but promise reactions still run asynchronously. For example:

```javascript
async function greet() {
  return "Hello";
}

const result = greet();
console.log(result instanceof Promise); // true

result.then((message) => console.log(message));
console.log("after calling then");

// true
// after calling then
// Hello
```

The `.then` callback is placed in the microtask queue. It does not run in the middle of the current synchronous statement sequence, even though the Promise has already fulfilled.

If an async function throws instead of returning, JavaScript turns that throw into a rejected Promise. The same wrapper rule applies to both success and failure: callers receive a Promise and must handle its settlement.

## The Trap — Why Most People Get It Wrong

The first trap is answering `Hello`. That would be correct for `console.log(greet())` only if `greet` were a normal function. The `async` keyword wraps the returned value, so the immediate argument to `console.log` is a Promise.

The second trap is treating `async` as meaning “the body always waits for real asynchronous work.” This function runs without `await`, but it still returns a Promise. `async` defines the return contract; it does not require a timer, fetch, or other slow operation.

Another mistake is expecting `console.log(greet())` to wait for the Promise and print its fulfillment value. `console.log` does not automatically await arbitrary objects. It receives the Promise and displays that object. Use `await greet()` inside an async context or `greet().then(...)` to get `Hello`.

Finally, do not treat the exact text `Promise { 'Hello' }` as a portable language-level output guarantee. Promise state and fulfillment value are the meaningful semantics; Node, browsers, and DevTools can format the object differently. In an interview, state both the semantic answer and the environment-specific display caveat.

## 🧠 The Memory Hook

An `async` function always hands you a sealed envelope—a Promise—even when it puts `Hello` inside immediately. `console.log` prints the envelope; `await` or `.then` opens it and gives you the value.
