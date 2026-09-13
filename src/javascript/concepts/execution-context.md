# Execution Context

## 1. Why This Exists — The Problem First

You log `count` inside a click handler and it shows one value. You log `count` in another function and it shows a different value. Then someone asks why `this` is `window` in one place, `undefined` in another place, and an object in a method call. If you do not understand execution contexts, JavaScript feels like it is making up rules on the fly.

This concept exists because JavaScript needs a precise runtime setup every time code starts running. The language has to know which names are available right now, what `this` means for this call, and where to look if a name is not local. Execution context is the runtime frame that makes those answers consistent.

## 2. The Analogy — Make It Obvious

Think of a movie set.

The whole production has a main studio floor. That is like the global execution context. The lights, props, and shared equipment live there. Then every time the crew shoots a scene, they open a scene folder for that specific shot. That folder lists the actors in the scene, the props brought in for that shot, who the camera should follow, and which shared studio resources the crew can still use.

That scene folder is the execution context for that piece of code. Before the scene starts, the crew prepares the folder. During the scene, everyone works from it. When the scene ends, the folder is closed and the crew moves on. If the editor later needs one clip from that scene, some data from the folder may still stay reachable. That is the same idea behind closures keeping outer bindings alive.

The important mapping is:

- The studio floor is the global context.
- A scene folder is one execution context.
- The people and props listed in that folder are the bindings available for that run.
- The “follow this actor” instruction is like the current `this` value.
- The link back to shared studio resources is like the outer lexical environment.

## 3. How It Actually Works — The Full Explanation

An execution context is the runtime setup JavaScript creates before it runs a chunk of code. The big job of that setup is simple: decide what names exist here, what `this` means here, and where to keep looking if a name is not found locally.

JavaScript starts with a global execution context. In a browser, top-level script code runs there first. In modern JavaScript, modules also have a top-level context, but their top-level `this` behavior is different from classic scripts. The important idea is the same: before JavaScript runs that top-level code, it prepares a runtime environment for it.

Function calls create new execution contexts. Not function definitions, but function calls. Writing a function puts reusable code in place. Calling that function creates a fresh runtime context for that particular invocation. If you call the same function three times, you get three separate executions and therefore three separate contexts.

Each new function context gets its own local bindings. Parameters are bound to the argument values for that call. Local `let`, `const`, `var`, and function declarations belong to that invocation, not to every other invocation. That is why recursion works. Each recursive call gets a fresh context with its own `n`, its own temporary values, and its own place in the call stack.

There is also an important “before line-by-line execution” step. JavaScript does not just start at line 1 with an empty table. It first prepares the environment for that context. That is why function declarations are callable before their definition line, why `var` exists early as `undefined`, and why `let` and `const` exist but cannot be used before initialization. People often call all of that “hoisting,” but the useful mental model is: the context is prepared first, then the statements run.

The context also carries the `this` binding for that run. This is runtime behavior, not lexical scope lookup. A regular function gets its `this` from how it is called. A method call like `user.print()` usually makes `this` point at `user`. A plain function call behaves differently, and strict mode changes that behavior again. Arrow functions are special because they do not create their own `this`; they reuse `this` from the surrounding context.

Execution context and scope are related, but they are not the same thing. Scope is the visibility rule created by where code is written. Execution context is the runtime frame created when that code actually runs. Scope answers, “where can this name be found in theory?” Execution context answers, “what bindings and `this` are active right now for this specific run?”

When code looks up a name, JavaScript first checks the current context's local environment. If the name is not there, it follows the outer lexical links until it finds a match or reaches the end. That chain is why a function can read values from where it was defined, not from wherever it is later called.

This is also why closures work. When an inner function is created, it keeps access to the outer environment where it was defined. Later, even after the outer function has returned and its execution has finished, JavaScript can still keep the needed bindings alive because some inner function still references them. The outer execution context is no longer active on the call stack, but data from its environment can remain reachable.

While a function is running, its execution context is active on the call stack. When it finishes, that context is removed from the stack. If nothing still references its environment, it becomes eligible for garbage collection later. If a closure still needs it, some part of that environment stays alive. So the right model is not “all contexts stay forever” and not “everything disappears immediately.” Active execution lives on the stack; still-referenced data can outlive the active call.

One subtle point matters in interviews: execution contexts are a real way to reason about runtime behavior, but you should not invent engine-specific promises that the language does not guarantee. Different engines optimize aggressively. The stable part is the language behavior: code runs in contexts, calls create fresh contexts, identifier lookup follows lexical rules, and `this` depends on call form except for arrows and a few special cases.

## 4. Real Code — See It Working

```js
const taxRate = 0.18;

function calculateTotal(price) {
  const fee = 10;

  // This call can read taxRate because identifier lookup walks outward
  // from the current function context to the outer environment.
  return price + fee + price * taxRate;
}

console.log(calculateTotal(100)); // 128
console.log(calculateTotal(200)); // 246
```

Each call to `calculateTotal` creates a fresh function execution context. The parameter `price` and local `fee` belong to that call. `taxRate` is not local, so JavaScript resolves it from the outer environment.

```js
function makeCounter(start) {
  let count = start;

  return function increment() {
    count += 1;
    return count;
  };
}

const counterA = makeCounter(0);
const counterB = makeCounter(10);

console.log(counterA()); // 1
console.log(counterA()); // 2
console.log(counterB()); // 11
```

`makeCounter` finishes running, so its execution context is no longer active on the call stack. But each returned `increment` function still keeps access to the `count` binding from its own outer environment. That is why `counterA` and `counterB` do not share state.

```js
"use strict";

const team = {
  name: "Platform",
  regularMethod() {
    return this.name;
  },
  arrowMethod: () => this
};

console.log(team.regularMethod()); // "Platform"
console.log(team.arrowMethod()); // top-level this from surrounding context
```

The regular method gets `this` from the call `team.regularMethod()`. The arrow function does not create its own `this`, so it reuses the surrounding top-level context instead of pointing at `team`.
In Node CommonJS that surrounding top-level `this` is `{}`. In a browser script it is usually `window`. The key point is the same in both environments: it is not `team`.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is an execution context in JavaScript?**

It is the runtime environment JavaScript creates before running code. That environment tracks the bindings available for that run, the current `this` value, and the outer lexical link used for identifier lookup. The easiest way to explain it is: scope tells you what code is allowed to see, execution context is the actual runtime frame that makes that visibility work for one specific execution.

**Q: When does JavaScript create execution contexts?**

It creates a top-level context before running top-level code, and it creates a new function execution context every time a function is called. The key word is called. Defining a function does not create a new active execution context for that function body. Invoking it does.

**Q: What gets prepared before the code in a context starts running line by line?**

JavaScript prepares the bindings for that context first. Function declarations are available immediately. `var` bindings exist early and start as `undefined`. `let` and `const` bindings also exist for the scope, but they cannot be used before their initialization line runs. That preparation step is the reason hoisting questions behave the way they do.

**Q: What is the difference between global execution context and function execution context?**

The global context is the first runtime context for top-level code. It is created once for that script or module entry point. A function execution context is created per call, so the same function can produce many different contexts over time. Function contexts usually carry parameters, local variables, and a call-specific `this` binding. They are pushed onto the call stack while active and removed when the call completes.

**Q: How is execution context different from scope?**

Scope is about where a variable is declared and which parts of the code are allowed to access it. That is a lexical rule based on source code structure. Execution context is about what runtime frame is active right now. Scope is static. Execution context is created dynamically when code runs. They work together, but they are not interchangeable terms.

**Q: How does execution context relate to the call stack?**

The call stack keeps track of active execution contexts. When a function is called, its context is pushed onto the stack. When it returns, that context is popped off. If one function calls another, the newer context sits on top and runs first. That is why deeply nested synchronous calls build a deeper stack.

**Q: How do closures fit into this?**

A closure happens when a function keeps access to bindings from the environment where it was created. The outer function's execution may have finished already, so its context is no longer active on the stack. But the needed bindings can still remain reachable because the inner function still references them. That is the important distinction: active execution ends, but reachable environment data can live on.

**Q: Does every execution context have its own `this`?**

Regular functions have their own `this` binding based on how they are called. Arrow functions are the exception that trips people up: they do not create their own `this`, so they inherit it from the surrounding context. That is why arrow functions are useful when you want to preserve the outer `this`, and a bad choice when you actually need a method-style `this`.

## 6. The Traps — What Goes Wrong

The first trap is treating execution context and scope as the same thing. They are connected, but one is a runtime frame and the other is a lexical visibility rule. If you blur them together, closure and `this` questions start sounding random because you are mixing two different mechanisms.

The second trap is thinking the function body starts with nothing and JavaScript just discovers variables as it goes. It does not. The environment is prepared first. That is why some names exist before their line runs, while others exist but cannot be touched yet.

The third trap is saying a function “gets a new context when it is declared.” It does not. The function object is created when the declaration or expression is evaluated, but the function body gets a new execution context only when the function is invoked.

The fourth trap is assuming `this` comes from where the function was written. That is true for lexical variables, but not for regular-function `this`. `this` for regular functions comes from the call site. That one confusion is behind a huge number of broken callbacks and interview mistakes.

```js
"use strict";

const user = {
  name: "Ria",
  print() {
    return this.name;
  }
};

const detached = user.print;

console.log(user.print()); // "Ria"
console.log(detached()); // throws TypeError in strict mode
```

The function body is the same in both calls. The execution context is not. The second call is a plain function call, so strict mode makes its `this` value `undefined`; reading `this.name` therefore throws a `TypeError`.

The fifth trap is believing the whole outer function context stays alive forever when a closure exists. The useful answer is narrower: the inner function keeps the outer environment data it still needs reachable. Do not oversell this as “the stack frame stays there forever.” Active stack frames do not stay active after return.

The sixth trap is explaining everything with one specific engine's internals as if the language spec promised every low-level detail. In interviews, stay grounded in guaranteed behavior: fresh call contexts, prepared bindings, lexical lookup, stack push/pop, and closure reachability.

## 7. Compare With Related Concepts

Execution context vs lexical scope: lexical scope is decided by where code is written; execution context is created when that code runs. Use “scope” when discussing visibility rules, and “execution context” when discussing what is active during a specific call.

Execution context vs call stack: an execution context is the runtime frame itself; the call stack is the structure that keeps track of active frames. Use “call stack” when you care about ordering of active calls, and “execution context” when you care about the bindings inside one call.

Execution context vs lexical environment: the lexical environment is the binding-and-outer-link part used for name resolution. The execution context is broader: it includes that environment plus other runtime state like `this`. Use “lexical environment” when the discussion is specifically about variable lookup and closures.

Global context vs function context: the global context is the top-level starting frame; function contexts are created over and over for each invocation. Use the global context to reason about top-level behavior, and function contexts to reason about calls, recursion, local variables, and per-call `this`.

## 8. 🧠 The Memory Hook — What Sticks

An execution context is JavaScript's “scene folder” for one run of code: who is in this scene, what names exist here, what `this` means here, and which outer scene we can still borrow from. Every call opens a new folder, runs with it, then closes it when the scene ends.
