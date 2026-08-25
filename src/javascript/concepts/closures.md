# Closures

## 1. Why This Exists — The Problem First

Suppose an application creates a separate formatter for each customer. The formatter must remember that customer's currency and tax rate when a request arrives later. A global variable would let one customer overwrite another customer's settings, and passing the settings through every callback would make the API noisy and easy to misuse.

JavaScript needs a way for a function to carry the small piece of state it depends on. Without that behavior, factories, event handlers, debouncers, memoized functions, and private module state would either lose their configuration or fall back to shared global state. Closures solve this by letting a later function call use the variables that were in scope when the function was created.

## 2. The Analogy — Make It Obvious

Think of a function as a worker leaving a workshop with a locked folder. The folder is not a photocopy of every document in the workshop. It is a link to the particular shared documents the worker may need. The worker can return later, read the current contents, and in some cases update them.

The workshop is the outer lexical environment. A variable such as `count` is a document in that workshop. The inner function is the worker, and the closure is the function plus its retained access to that environment. When the outer function finishes, the workshop no longer needs to remain on the call stack, but it stays reachable if the worker still has the folder. Two workers created in the same workshop can therefore edit the same document, while workers from separate workshops have separate state.

This also explains retention: if the folder still points to a large document, the cleanup crew cannot discard that document. In JavaScript, the garbage collector keeps an outer environment alive while a reachable function can still reach it.

## 3. How It Actually Works — The Full Explanation

When JavaScript evaluates a function expression or declaration, the function gets the lexical context in which it was created. That context is the chain of bindings JavaScript searches when the function reads an identifier. The function does not need to be returned for this relationship to exist; passing it as a callback or storing it in an event system is enough.

Consider this sequence:

1. `makeCounter` runs and creates a lexical environment containing the binding `count`.
2. The returned `increment` function is created while that binding is in scope, so it retains access to the environment.
3. `makeCounter` returns. Its call frame is gone, but the environment is still reachable through `increment`.
4. Each later call to `increment` looks up `count` in that retained environment, changes the same binding, and returns the new value.

The important word is binding. A closure normally retains access to a live binding, not a frozen copy of the value. If another closure changes that binding, the next call observes the change. This is why two methods returned by one factory can share private state.

Each call to the outer function creates a new environment. `makeCounter()` called twice produces two independent `count` bindings. The functions from those two calls may have identical source code, but their retained environments are different.

Closures and `var` in loops expose the binding-versus-value distinction. `var` is function-scoped, so a loop creates one shared binding for all iterations. `let` creates a fresh per-iteration binding, so each callback gets the iteration's binding. Neither callback is secretly copying a number; the difference is which binding it can reach.

Closures are also the source of many stale-value bugs. A callback created during one render or request can run later with the bindings from that earlier execution. In React, each render has its own state bindings. A timer or subscription created from an old render can therefore read old state unless the callback is recreated with the needed dependencies, uses a functional updater, or reads deliberately mutable current state through an appropriate ref.

The garbage collector works from reachability. A closure is not automatically a leak. It becomes a retention problem when a long-lived object—such as an interval, event subscription, cache, or global registry—keeps the function reachable, and the retained environment includes objects that are no longer needed. Releasing the long-lived registration is the real fix; merely setting a local variable to `null` does not help if another reachable path still points to the object.

## 4. Real Code — See It Working

Counter factory: private, shared state.

```js
function makeCounter(start = 0) {
  let count = start;

  return {
    increment() {
      // We mutate the retained binding so every method from this factory sees the same count.
      count += 1;
      return count;
    },
    read() {
      // The state stays private because callers receive behavior, not the binding itself.
      return count;
    },
  };
}

const first = makeCounter(10);
const second = makeCounter(10);

console.log(first.increment()); // 11
console.log(first.read());      // 11
console.log(second.read());     // 10
```

`first` and `second` use the same function source but different environments. There is no global `count`, and outside code cannot directly assign to either counter's binding.

Function factory: configuration remembered for later work.

```js
function createPriceFormatter(currency, locale) {
  return function formatPrice(amount) {
    // The closure keeps configuration near the behavior, so callers only pass the changing value.
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(amount);
  };
}

const formatInr = createPriceFormatter("INR", "en-IN");
console.log(formatInr(1250)); // ₹1,250.00 in a runtime with en-IN locale data
```

The returned function retains access to `currency` and `locale` after `createPriceFormatter` returns. Exact display can vary with the runtime's internationalization data, but the configuration remains isolated.

Module-style exports: expose behavior, keep bindings private.

The following is a source-level ESM example split into two files. Save the first as `counter-module.mjs` and the second as `consumer.mjs`; `.mjs` tells Node to parse them as ESM, so this is not claiming that an unconfigured `.js` file can use `export` in every Node project.

```js
// counter-module.mjs
let total = 0;

export function record() {
  // The exported function closes over this module-scoped binding without exporting the binding itself.
  total += 1;
  return total;
}

export function readTotal() {
  // Both exports resolve the same live binding because they were created in this module scope.
  return total;
}
```

```js
// consumer.mjs
import { readTotal, record } from "./counter-module.mjs";

console.log(readTotal()); // 0
console.log(record());    // 1
console.log(readTotal()); // 1
```

The module exports functions, not direct write access to `total`. The module is evaluated once per module instance, so its exported functions share that instance's private binding; importing the same module does not create a fresh counter for each import statement.

Event handler: the listener registration controls the closure's useful lifetime.

```js
const button = new EventTarget();

function connectButton(button, label) {
  function handleClick() {
    // The handler reads the label from the connection's closure when the event is dispatched.
    console.log(`${label} clicked`);
  }

  button.addEventListener("click", handleClick);

  return function disconnect() {
    // WHY: removeEventListener needs the same function object that was registered.
    button.removeEventListener("click", handleClick);
  };
}

const disconnect = connectButton(button, "Save");
button.dispatchEvent(new Event("click")); // Save clicked
disconnect();
button.dispatchEvent(new Event("click")); // nothing is logged
```

While `button` keeps `handleClick` registered, the listener can reach the `label` binding through its closure. Calling `disconnect` removes that registration; if no other code retains `disconnect`, `handleClick`, or the button, the related objects become eligible for collection. Removing a listener is not a promise that garbage collection happens immediately, and assigning a different function to a local variable would not remove the originally registered function.

Debounce: retaining a timer handle.

```js
function debounce(task, waitMs) {
  let timerId;

  return function debounced(...args) {
    // Repeated calls share one handle, so only the final call survives the quiet period.
    clearTimeout(timerId);
    timerId = setTimeout(() => task(...args), waitMs);
  };
}

const saveSearch = debounce((query) => {
  console.log(`Saving ${query}`);
}, 20);

saveSearch("jav");
saveSearch("javas");
saveSearch("javascript");
// After about 20 ms, only "Saving javascript" is logged.
```

The closure is useful because `timerId` survives between calls, but belongs to this particular debounced function rather than to every caller in the application.

Loop bindings: live bindings, not copied values.

```js
const callbacks = [];

for (let index = 0; index < 3; index += 1) {
  callbacks.push(() => index);
}

console.log(callbacks.map((callback) => callback())); // [0, 1, 2]
```

`let` gives each iteration its own binding. Replacing it with `var` gives all callbacks one function-scoped binding, so after the loop they all read `3`.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a closure?**

A closure is a function together with access to the lexical environment where that function was created. That access lets the function use outer variables later, even after the outer function has returned. Closure behavior is ordinary lexical scoping; JavaScript does not require a special keyword to create one.

**Q: Does a closure copy values or keep references?**

It keeps access to bindings. If the binding is changed before the closure runs, the closure normally observes the new value. Be precise about what is shared: a closure does not magically make every object immutable or every variable globally shared. The exact binding and environment determine what is visible.

**Q: Why does returning a function keep local variables alive?**

The returned function is still reachable, and it has a link to the lexical environment needed for its identifier lookups. The outer call frame has finished, but the relevant environment cannot be collected while the returned function can reach it. Engines may optimize the representation, so describe the observable reachability rule rather than promise a particular heap layout.

**Q: Why are closures useful in real applications?**

They keep configuration and state next to the behavior that owns it. Factories can create independent clients, debouncing can retain one timer handle, memoization can retain a cache, and module patterns can expose methods without exposing internal bindings. This reduces global coupling, but retained state still needs a clear lifetime and cleanup policy.

**Q: How can a module export functions while keeping state private?**

An ES module can export functions declared alongside module-scoped bindings. Importers receive the exported functions, and those functions retain access to the module's live bindings; the binding itself is not automatically a writable public property. The module is evaluated once per module instance, so imports share that instance's state. Treat the example's `.mjs` filenames as part of its Node setup, rather than assuming every Node `.js` file accepts ESM syntax.

**Q: When does an event-handler closure stop retaining its outer state?**

It remains reachable while the event target retains the registered handler, or while some other reachable object retains the handler or its cleanup function. Remove it with `removeEventListener` using the exact same handler function object. After the registration and all other retaining paths are gone, the state becomes eligible for garbage collection; the JavaScript runtime does not promise when collection will occur.

**Q: How do two closures share private state?**

If two functions are created in the same invocation of an outer function, both can retain the same environment. A factory can return `get` and `set`; both resolve their identifiers against the same private `value` binding. Calling the factory again creates a different environment, so the second pair does not share the first pair's state.

**Q: What is a stale closure?**

A stale closure is a callback that runs later but reads bindings from an earlier execution. In a React component, each render creates a new set of state bindings. A timer or subscription created by an older render keeps the older bindings, so it can log an old value even though the screen has rendered newer state. Correct dependencies, functional state updates, or an intentionally mutable current-value reference address different versions of this problem.

**Q: Can closures cause memory leaks?**

A closure can retain memory, but the closure itself is not automatically a leak. The problem is a long-lived reference to the function—such as an interval or subscription—combined with an environment that retains large data or DOM-related objects longer than intended. Remove the subscription or cancel the timer when its owner is done. Garbage collection then has a chance to reclaim the function, environment, and objects reachable only through them.

## 6. The Traps — What Goes Wrong

- **“A closure only happens when a function is returned.”** A callback passed to `setTimeout`, an event API, or another function can close over outer bindings even when nobody returns it. The useful question is whether the function uses names from an outer lexical scope, not whether `return` appears.

- **“The callback stores a snapshot.”** A closure reads a binding when it runs. If sibling code changes that binding, the result can change. A snapshot can be made deliberately by copying a value into a new local or passing it as an argument, but that is a different operation.

- **Using `var` in a loop and expecting one value per callback.** All callbacks can resolve the same function-scoped binding. Use `let` for a per-iteration binding, or pass the current value into a factory when supporting older code patterns.

  ```js
  const wrong = [];
  for (var index = 0; index < 3; index += 1) {
    wrong.push(() => index);
  }
  console.log(wrong.map((callback) => callback())); // [3, 3, 3]
  ```

- **Calling every retained function “a memory leak.”** Retaining state is often the purpose of a closure. It is a leak only when its lifetime is accidental or longer than the owning feature's lifetime. Find the root that keeps the callback reachable, then clean up that root.

- **Assuming `null` clears all retained data.** Nulling one variable does not break other references. If a closure still reaches an outer object, or an interval still reaches the closure, the object remains reachable. Cleanup must remove the actual listener, interval, cache entry, or registry reference.

- **Removing an event listener with a new function.** `button.removeEventListener("click", () => {})` does not match the handler that was registered earlier. Keep the original handler in the closure and return cleanup that passes that same function object; otherwise the event target can keep the closure reachable.

- **Treating an export as exported mutable state.** Exporting a function that reads a module binding exposes behavior over that binding, not an unrestricted assignment API. Check whether the module should expose a command such as `record`, a read method such as `readTotal`, or an explicit setter before calling its state “public.”

- **Treating a React callback as if it sees future renders automatically.** An existing callback still points at the render environment in which it was created. Recreate it when its inputs change, use a functional updater when the next state depends on previous state, or choose an explicit current-value mechanism when the design needs one.

- **Overusing closures for state that needs inspection or serialization.** Hidden state is valuable for invariants, but it can make debugging, persistence, and cross-instance coordination harder. Choose an explicit object or state store when those capabilities matter.

## 7. Compare With Related Concepts

- **Closure vs lexical scope:** Lexical scope is the rule that says where an identifier can be found in source code. A closure is the runtime function that retains access to an outer scope for later calls. Use lexical scope to reason about name lookup; use closures when behavior must carry that lookup context forward.

- **Closure vs object state:** Both can preserve state across calls. Closure state is private to the functions that retain the environment, while object state is exposed through properties unless access is restricted. Use a closure for a small invariant-owned state capsule; use an object when callers need inspection, serialization, or a conventional data shape.

- **Closure vs class private fields:** A closure hides bindings through lexical access, and each factory invocation creates its own environment. A class with `#privateField` gives instances private fields with class syntax and prototype-based methods. Use closures for focused factories and function composition; use private fields when you need an instance-oriented API, inheritance choices, or many methods on a shared prototype.

- **Closure vs a snapshot:** A closure normally reads a live binding, while a snapshot is a deliberately copied value captured at a point in time. Use a live binding for evolving state; create a snapshot when later work must use the historical value.

- **Closure vs global state:** A closure limits ownership to the functions that receive access, while global state is reachable by unrelated code and creates hidden coupling. Use a closure by default for per-instance configuration or private state; use shared global state only when the shared lifetime and synchronization rules are explicit.

## 8. 🧠 The Memory Hook — What Sticks

A closure is a worker leaving a workshop with a link to the live documents it still needs—not a photocopy, and not the whole workshop. When the worker remains reachable, those documents remain reachable too: that single picture explains private state, changing values, stale callbacks, and memory retention.
