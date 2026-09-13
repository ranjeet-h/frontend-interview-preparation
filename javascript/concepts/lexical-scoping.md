# Lexical Scoping

## 1. Why This Exists — The Problem First

You move a helper function into a shared utility, call it from a different part of the app, and suddenly it throws `ReferenceError: userId is not defined`. That bug usually comes from one wrong assumption: "this function is being called here, so it should see variables from here." JavaScript does not work like that. A function does not look around the room where it is called. It only knows the rooms that were around it when it was written.

That rule is why nested helpers are predictable, why closures work at all, and why React event handlers can accidentally read stale values from an older render. If you miss this one idea, scope, closures, shadowing, and even some `var` bugs all feel random.

## 2. The Analogy — Make It Obvious

Think of every function as carrying an address card from the day it was created.

If you wrote a function inside your house, the card says: "When you need a variable, first check your own pocket, then this room, then the hallway, then the house entrance." Later, someone may invite that function to run in an office, a cafe, or a stadium. The location changed, but the address card did not. When the function needs `theme` or `count`, it still follows the route written on that card.

Nested scopes fit this analogy cleanly. An inner function is like a person standing in a smaller room inside a larger house. They can walk outward and read labels on doors in the hallway or at the entrance. But someone standing at the entrance cannot magically see notes pinned inside the inner room. Shadowing is just putting a new label in the inner room with the same name as one in the hallway. The person finds the inner label first and stops there.

That is lexical scoping. "Lexical" just means the lookup path comes from the structure of the source code, not from runtime movement.

## 3. How It Actually Works — The Full Explanation

JavaScript resolves identifiers by following where code was defined. When the engine creates a function, it remembers the surrounding scope chain from that definition point. Later, when the function runs and needs a name like `discount`, it starts in its own local scope. If the name is not there, it walks outward through the scopes that existed around the function when it was written.

That lookup rule gives you a few important behaviors.

First, inner code can read outer bindings. If a function is written inside another function, it can use names from the outer function because that outer scope is part of its lookup path.

Second, outer code cannot read inner locals. Lookup only walks outward, never inward. A parent scope has no reverse tunnel into a child's local variables.

Third, the nearest matching name wins. If you declare `const status = "draft"` outside and `const status = "published"` inside, the inner one shadows the outer one. JavaScript stops at the first match.

Fourth, block scope and function scope are different. `let` and `const` belong to the nearest block, so an `if`, `for`, or plain `{}` can create a new scope. `var` ignores block boundaries and lives in the nearest function scope instead. That difference is why `var` in loops has caused so many closure bugs.

Fifth, JavaScript is not dynamically scoped. A dynamically scoped language would let a function read variables from whoever called it. JavaScript does not. The caller affects arguments and, for normal functions, `this`, but not lexical variable lookup.

That last point matters because people often mix up scope with `this`. They are different systems. Lexical scope answers, "Where does this variable name come from?" `this` answers, "What object is this function being called against?" One is mostly definition-based. The other is usually call-site-based.

Closures are built on top of lexical scoping, but they are not the same thing. Lexical scoping is the rule. A closure is what you get when a function keeps using outer bindings after the outer function has already finished. The reason that works is that the lookup path was fixed at definition time.

## 4. Real Code — See It Working

Example 1 shows the most common misunderstanding: the call site does not donate its variables.

```js
const taxRate = 0.18;

function printTotal(amount) {
  // WHY: this name is resolved from printTotal's definition scope, not its caller.
  console.log(amount + amount * taxRate);
}

function checkout() {
  const taxRate = 0.05;
  printTotal(100);
}

checkout(); // 118, not 105
```

`printTotal` was written in the global scope, so it uses the global `taxRate`. The `taxRate` inside `checkout` is irrelevant because `printTotal` was not defined there.

Example 2 shows nested lookup and shadowing.

```js
const label = "global";

function outer() {
  const label = "outer";

  function inner() {
    const label = "inner";
    // WHY: lookup stops at the nearest binding with this name.
    console.log(label);
  }

  inner();
  console.log(label);
}

outer();
// inner
// outer
```

Inside `inner`, JavaScript finds the local `label` first and stops. After `inner` finishes, `outer` still uses its own `label`.

Example 3 shows block scope versus function scope.

```js
function compareScopes() {
  if (true) {
    // WHY: var ignores this block and belongs to compareScopes.
    var functionScoped = "I escape the block";
    const blockScoped = "I stay inside the block";

    console.log(functionScoped);
    console.log(blockScoped);
  }

  console.log(functionScoped);
  console.log(typeof blockScoped);
}

compareScopes();
// I escape the block
// I stay inside the block
// I escape the block
// undefined
```

`functionScoped` is still available after the `if` because `var` attaches to the function scope. `blockScoped` disappears outside the block because `const` is block-scoped. `typeof blockScoped` is used here so the demo can show the missing binding without stopping the script.

Example 4 shows why loop bugs used to happen with `var`.

```js
for (var i = 0; i < 3; i += 1) {
  // WHY: every callback closes over the same function-scoped i binding.
  setTimeout(() => console.log("var loop:", i), 0);
}

for (let j = 0; j < 3; j += 1) {
  // WHY: let gives each iteration a binding that its callback can retain.
  setTimeout(() => console.log("let loop:", j), 0);
}

// var loop: 3
// var loop: 3
// var loop: 3
// let loop: 0
// let loop: 1
// let loop: 2
```

All `var` callbacks share one function-scoped binding, so they all read the final value. `let` creates a fresh block-scoped binding for each loop iteration, so each callback gets the value from its own iteration.

Example 5 shows closure retention after the creating function returns.

```js
function createCounter() {
  let count = 0;

  return function increment() {
    // WHY: the returned function keeps this binding reachable after createCounter returns.
    count += 1;
    return count;
  };
}

const nextCount = createCounter();
console.log(nextCount()); // 1
console.log(nextCount()); // 2
```

Example 6 models a frontend search handler. The handler retains the latest request id so an older response can be ignored.

```js
function createSearchController() {
  let latestRequestId = 0;

  return function startSearch(query) {
    latestRequestId += 1;
    const requestId = latestRequestId;
    // WHY: the callback needs this render/request's id when the async work finishes.
    return Promise.resolve({ query, requestId }).then((result) => ({
      ...result,
      isCurrent: result.requestId === latestRequestId,
    }));
  };
}

const search = createSearchController();
Promise.all([search("re"), search("react")]).then(console.log);
// [{ query: "re", requestId: 1, isCurrent: false },
//  { query: "react", requestId: 2, isCurrent: true }]
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is lexical scoping?**

Lexical scoping means variable access is decided by where code is written, not where it is called. When JavaScript resolves an identifier inside a function, it starts in that function's local scope and then walks outward through the scopes that surrounded the function when it was defined.

**Q: How is scope decided in JavaScript?**

Scope is decided by the structure of the source code. Functions create scopes. Blocks also create scopes for `let`, `const`, `class`, and `catch` bindings. That structure exists before the function is called, which is why the lookup rules stay predictable.

**Q: Why can inner functions access outer variables?**

Because the outer scope is part of the inner function's lookup chain. When the inner function asks for a variable and does not find it locally, JavaScript keeps walking outward. That is normal scope lookup, not a special exception.

**Q: Can an outer function access variables inside an inner function?**

No. Scope lookup only goes outward from the current scope. The outer function does not have a path into locals created inside the inner function. Once you are outside that inner scope, those bindings are invisible.

**Q: What is the scope chain?**

The scope chain is the ordered path JavaScript follows while resolving a variable name: current scope first, then parent scope, then the next parent, and so on until the global or module scope. Lexical scoping decides what that chain is.

**Q: What is shadowing?**

Shadowing happens when an inner scope declares a variable with the same name as one in an outer scope. The inner binding hides the outer one for code running inside that inner scope because lookup stops at the first match.

**Q: What is the difference between block scope and function scope?**

`let` and `const` are block-scoped, so they belong to the nearest `{}` block. `var` is function-scoped, so it ignores plain block boundaries and belongs to the nearest function body. That is why `var` can leak out of an `if` block and why `let` usually behaves more safely in loops.

**Q: Is JavaScript lexically scoped or dynamically scoped?**

JavaScript is lexically scoped. The caller does not change which variables a function can read. If JavaScript were dynamically scoped, a function could read the caller's locals just because it was invoked there. That is not how identifier lookup works in JavaScript.

**Q: How is lexical scope related to closures?**

Closures depend on lexical scoping. Lexical scoping decides which outer bindings a function is allowed to use. A closure is what you observe when that function keeps using those bindings later, even after the outer function has returned.

**Q: How does this show up in React?**

Every render creates new bindings for that render's props and state. An event handler or effect closes over whichever bindings existed when that function was created. If you keep an old callback around, it will keep reading the old render's values. That bug is usually called a stale closure, but the root rule underneath it is lexical scoping.

**Q: Is lexical scope the same thing as the call stack?**

No. The call stack is the temporary list of functions currently executing; it answers “what is running right now?” Lexical scope is the definition-based path used to resolve names; it answers “where can this function find `count`?” A caller's stack frame can pass arguments, but it does not become the callee's outer lexical scope.

**Q: What is module scope?**

Each ES module has its own top-level lexical scope. A top-level `const`, `let`, or function is private to that module unless the module explicitly exports it, and an imported binding is a live read-only view of the exporter’s binding. This prevents unrelated files from accidentally sharing names through the global object.

**Q: Does a closure keep the whole call stack alive?**

No. When the outer call returns, its execution frame leaves the call stack. A returned or otherwise retained inner function can keep the specific outer bindings it references reachable, so those bindings remain available in the heap. Unreferenced bindings and unrelated stack frames can still be collected.

**Q: What is a concrete frontend use case for lexical scope?**

A debounced search, event handler, or request callback can retain the query, request id, or component-render values that belong to the callback's creation. That is useful for associating an async result with the action that started it, but it also explains stale React handlers when an old callback is retained accidentally.

## 6. The Traps — What Goes Wrong

The biggest trap is thinking the caller shares its locals with the callee. That is why people expect `printTotal` to use `taxRate` from `checkout` in the earlier example. It feels intuitive, but JavaScript does not borrow scope from the caller.

Another trap is confusing lexical scope with `this`. People learn that `this` changes based on how a function is called, then incorrectly assume ordinary variables behave the same way. They do not. `this` can be dynamic. Lexical variable lookup is not.

Shadowing causes quiet bugs when an inner variable accidentally reuses a meaningful outer name. You think you are updating a shared value, but you are only reading or changing the inner binding. This often happens with names like `data`, `error`, `result`, or `status`.

`var` inside blocks is another classic failure mode. Developers expect `if` and `for` blocks to isolate it, but `var` leaks to the nearest function scope. In asynchronous loops, that creates one shared binding, so every callback sees the same final value.

There is also a React-specific version of this mistake. A handler created during one render keeps the bindings from that render. If you assume it always sees the latest state automatically, you end up with stale reads. The code looks fine because the variable name is right, but the function is still attached to an older lexical scope.

Closure retention can also become a memory problem. If a long-lived event listener, timer, cache, or subscription retains a closure, every object reachable through its captured bindings can stay alive. The fix is to remove the listener, cancel the timer, or release the subscription when the frontend feature unmounts; changing the variable name does not release the reference.

Module scope has a related trap: importing a binding does not copy a one-time value into a new local variable. ES module imports are live bindings, while assigning the value to another local creates a separate binding. Also, module scope is private to the module, not a magical shared application-wide state container.

The call stack trap is treating a returned closure as if its outer function were still executing. The frame is gone, but the closure can still reach captured bindings because the function object retains the needed lexical environment. Conversely, a function that is not retained after a call cannot be invoked later merely because its old stack frame once existed.

## 7. Compare With Related Concepts

Lexical scoping and closures are closely related, but they are not interchangeable. Lexical scoping is the rule that defines lookup based on where code is written. A closure is the runtime result of a function still using that outer scope later.

**When to use which:** Use lexical scope to reason about where a name resolves; use a closure deliberately when a callback must retain private state after its creator returns.

Lexical scoping and the scope chain are also different levels of the same story. Lexical scoping is the policy. The scope chain is the actual lookup path JavaScript follows because of that policy.

**When to use which:** Use lexical scope to explain the definition-based rule; use the scope chain to trace a particular identifier from its local binding outward.

Lexical scope and `this` are easy to confuse because both affect what code can access. The difference is simple: variables come from definition location, while `this` for a normal function comes from call style. If the interview question is about `count`, think scope. If it is about `this.count`, think binding rules too.

**When to use which:** Use lexical variables for values a function should capture from its definition context; use `this` when an API intentionally supplies a receiver at call time.

Lexical scope and dynamic scope are opposites. In a dynamically scoped model, a function could read names from whoever called it. In JavaScript, moving the call site does not change the function's variable lookup path. Only moving where the function is defined changes that.

**When to use which:** In JavaScript, rely on lexical scope for predictable name lookup; do not design code around caller-provided locals as if the language were dynamically scoped.

Module scope is a file-level lexical boundary, not the same as global scope. A module's top-level names stay inside that module unless exported, while a classic script can place top-level `var` declarations on the global object.

**When to use which:** Use module scope to keep feature internals private and expose only an explicit API; use global scope only when a genuinely global browser integration requires it.

Lexical scope and the call stack describe different dimensions. The call stack changes as functions enter and return, while a function's lexical parent remains based on where it was defined.

**When to use which:** Use the call stack to debug execution order and recursion depth; use lexical scope to debug `ReferenceError`, shadowing, and stale captured values.

## 8. 🧠 The Memory Hook — What Sticks

A function reads variables from where it was born, not from where it was called. If you picture every function carrying its own address card back to its definition site, lexical scoping stops feeling abstract and starts feeling obvious.
