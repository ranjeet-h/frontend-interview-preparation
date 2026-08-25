# Global Execution Context

## 1. Why This Exists — The Problem First

You paste a quick variable into a browser script, and later some unrelated file can read it from `window`. Then you move the same code into `<script type="module">`, and suddenly `this` is `undefined` and `window.someName` is gone. Then you run a similar snippet in Node.js and discover there is no `window` at all.

That confusion is exactly why the global execution context matters. JavaScript needs one top-level runtime environment before any function call happens, but that environment is not identical across classic browser scripts, ES modules, and Node.js. If you do not understand that starting environment, hoisting, top-level `this`, accidental globals, and "why does this work here but not there?" all feel random.

## 2. The Analogy — Make It Obvious

Think of the global execution context like opening a building for the day.

- The building itself is the JavaScript runtime starting your file.
- The front desk is the global environment where top-level names are registered.
- The public notice board in the lobby is the global object: in browsers that is `window`, in modern cross-platform code you usually reach it through `globalThis`.
- The rulebook for the building decides what happens when you put a name at the top level.

In a classic browser script, the rulebook is loose: if you write `var companyName = "Acme"`, the front desk records that binding and also pins it to the lobby notice board, so `window.companyName` works. In an ES module, the building is still open, but your file gets its own private office. The name exists for the file, but it does not get pinned to the public board. In Node.js, the building is different again: there is still a top-level environment, but it is not a browser lobby, so `window` is not part of the picture.

That is the mental model: the global execution context is the first room JavaScript opens, and each environment has slightly different building rules.

## 3. How It Actually Works — The Full Explanation

The global execution context is the first execution context JavaScript creates for global code, such as a classic script. It is the base environment that exists before any function execution context is pushed on top of it. Module code is different: it is evaluated in a module execution context with its own module environment, while still using the realm's global environment and global object for things such as `globalThis` and shared platform APIs.

At a high level, JavaScript does two big things before it starts running your lines one by one:

1. It creates the top-level environment for the current file.
2. It registers top-level declarations so later execution knows where names live.

For this topic, the important pieces are:

- The global object
- The global environment
- How top-level declarations are registered
- What `this` means at the top level
- How scripts and modules differ

### The global object

The global object is the runtime-owned object that exposes global APIs and, in some environments, some top-level declarations.

- In browsers, the global object is `window`.
- `globalThis` is the standard cross-platform way to refer to the global object.
- In Node.js, the global object is available as `globalThis` and `global`.

The key detail: the global object is not the same thing as "all top-level variables." In classic browser scripts, some top-level declarations become properties on `window`. In modules, they do not.

### The global environment

The global environment is the top-level binding space for the current code. This is where JavaScript tracks names like functions, `var` variables, and block-scoped bindings.

You can think of it as having two behaviors that matter here:

- One part behaves like object-backed global state for classic-script `var` and function declarations.
- Another part behaves like lexical bindings for `let` and `const`.

That is why this difference exists in a browser classic script:

```js
var legacyFlag = true;
let requestId = 42;

console.log(window.legacyFlag); // true
console.log(window.requestId);  // undefined
```

`legacyFlag` became a property on `window`, but `requestId` did not. Both names exist at the top level of the script, but they were registered differently.

### What JavaScript sets up before execution

Before top-level statements run, JavaScript prepares the global execution context.

- Function declarations are available immediately.
- `var` declarations are registered and initialized to `undefined`.
- `let` and `const` declarations are registered too, but you cannot use them before their declaration line runs.

That is why this behaves the way it does:

```js
console.log(product); // undefined
// console.log(price); // ReferenceError if uncommented

var product = "Keyboard";
let price = 1200;
```

This is the same broad hoisting story you see in other contexts, but at the global level it also decides whether a name leaks onto the global object.

### Top-level `var`, `let`, and `const`

In a classic browser script:

- `var` creates a global binding and also a `window` property.
- Function declarations also become available globally.
- `let` and `const` create top-level bindings, but not `window` properties.

In an ES module:

- Top-level names stay inside the module.
- They do not become `window` properties.
- Top-level `this` is `undefined`.

In Node.js:

- There is still a top-level execution context.
- Browser assumptions like `window` do not apply.
- Whether a top-level name becomes truly global depends on the module system and runtime rules, so you should not teach yourself "top-level means global object property" outside classic browser scripts.

That last point is where many interview answers go wrong. "Top-level variable" and "global object property" are only the same in some environments.

### Top-level `this`

Top-level `this` depends on how the file is loaded.

- In a classic browser script, top-level `this === window`.
- In an ES module, top-level `this === undefined`.

That is deliberate. Modules are designed to avoid accidental global coupling.

### Strict mode and accidental globals

Another trap is undeclared assignment:

```js
function saveDraft() {
  draftCount = 1;
}
```

In old non-strict browser-style code, that can create a property on the global object, which is exactly the kind of silent leak that makes apps fragile. In strict mode, JavaScript throws instead. ES modules are always strict, which is one reason they are safer by default.

So the real picture is:

- Global code starts in the global execution context; module code starts evaluation in a module execution context.
- The exact top-level behavior depends on whether you are in a classic script, a module, or a host such as Node.js.
- The biggest observable differences are global object mapping, top-level `this`, and accidental global behavior.

## 4. Real Code — See It Working

### Example 1: Classic browser script behavior

Environment assumption: run this inside a normal browser `<script>` tag, not a module.

```html
<script>
  var version = "legacy";
  let build = "2026.08";

  function boot() {
    return "booted";
  }

  console.log(version);         // "legacy"
  console.log(window.version);  // "legacy"

  console.log(build);           // "2026.08"
  console.log(window.build);    // undefined

  console.log(boot());          // "booted"
  console.log(window.boot());   // "booted"
  console.log(this === window); // true at top level in a classic script
</script>
```

This is the environment where people learn the risky rule: top-level `var` and function declarations can become part of `window`.

### Example 2: Browser module behavior

Environment assumption: run this inside `<script type="module">` in a browser.

```html
<script type="module">
  var mode = "module";
  const apiBase = "/api";

  console.log(mode);             // "module"
  console.log(apiBase);          // "/api"
  console.log(window.mode);      // undefined
  console.log(window.apiBase);   // undefined
  console.log(this);             // undefined
</script>
```

The names exist for the module, but they do not leak onto `window`.

### Example 3: Node.js top-level behavior

Environment assumption: run this as a Node.js ES module file, for example `node demo.mjs`.

```js
const serviceName = "billing";

console.log(serviceName);                // "billing"
console.log(typeof window);              // "undefined"
console.log(globalThis.setTimeout !== undefined); // true
console.log(this);                       // undefined in Node ES modules
```

This example matters because it breaks the bad habit of explaining everything through `window`.

### Example 4: Why accidental globals are dangerous

Environment assumption: the first snippet is old non-strict script code; the second is strict mode or a module.

```js
// non-strict script behavior
function markReady() {
  readyState = "done"; // accidental global write
}

markReady();
console.log(globalThis.readyState); // "done" in old loose environments
```

```js
"use strict";

function markReady() {
  readyState = "done";
}

markReady(); // ReferenceError
```

The second version is better because it fails fast instead of silently polluting global state.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the global execution context?**

It is the first runtime context JavaScript creates for global code, before a classic script's top-level statements run. It sets up the global environment and access to the global object, and becomes the base context under later function calls. Module code has a separate module execution context and module environment, with the realm's global environment available outside it.

**Q: What does JavaScript create before top-level code starts executing?**

It prepares the top-level environment and registers declarations. Function declarations are ready immediately. `var` names are registered and initialized to `undefined`. `let` and `const` names are also registered, but they stay unavailable until execution reaches their declaration line. That is why `var` can read as `undefined` before assignment, while `let` and `const` throw.

**Q: Does top-level `var` always become a global object property?**

No. That is only reliably true for classic browser scripts. In that environment, top-level `var` maps onto `window`. In ES modules, top-level declarations stay inside the module. In Node.js, the rules are different again, so "top-level `var` equals global object property" is not a universal JavaScript rule.

**Q: Why does `let` not appear on `window`?**

Because top-level `let` and `const` create lexical bindings, not global object properties. They are available in the top-level scope of the file, but they are not attached to the browser's public global object.

**Q: What is the global object in JavaScript?**

It is the runtime-provided object that exposes global APIs. In browsers that object is `window`. Across environments, `globalThis` is the standard reference. The important nuance is that the global object is not the same as the entire top-level scope.

**Q: What is top-level `this` in a browser script vs a module?**

In a classic browser script, top-level `this` is `window`. In an ES module, top-level `this` is `undefined`. Modules do this on purpose so the file behaves like an isolated unit instead of implicitly talking to the global object through `this`.

**Q: How is the global execution context related to hoisting?**

Hoisting is one visible result of how the global execution context is prepared before execution. JavaScript registers declarations before it starts walking through statements. That preparation is why functions are callable early, `var` reads as `undefined`, and `let` or `const` are known but still unavailable until their line runs.

**Q: Why are accidental globals considered dangerous?**

Because they create shared mutable state at the widest possible scope. One file can overwrite another file's data, debugging becomes harder, and the bug often starts as a silent typo instead of a clear error. Strict mode and modules help because they turn that silent leak into an immediate failure.

## 6. The Traps — What Goes Wrong

### Trap 1: Assuming every top-level variable becomes `window.someName`

That is only true for classic browser-script `var` and some function declarations. It is not true for `let`, `const`, ES modules, or Node.js.

```js
var a = 1;
let b = 2;

console.log(window.a); // 1
console.log(window.b); // undefined
```

The fix is mental, not syntactic: stop treating "top-level" and "global object property" as synonyms.

### Trap 2: Explaining JavaScript globals only through the browser

A lot of answers sound right until you run them in Node.js. If your explanation depends on `window`, it is incomplete. Use `globalThis` when you mean the cross-platform global object, and explicitly say when an example assumes a browser classic script.

### Trap 3: Forgetting that modules change the rules

People often move code from a classic script into a module and expect `this` and `window.name` checks to keep working. They do not.

```js
// inside a module
var featureFlag = true;

console.log(this);               // undefined
console.log(window.featureFlag); // undefined
```

The code is not broken. The loading mode changed.

### Trap 4: Thinking `let` and `const` are "not hoisted"

They are registered before execution too. The difference is that they are not initialized for early access. Saying "not hoisted" hides the real behavior and makes later temporal dead zone questions harder to explain.

### Trap 5: Creating accidental globals through undeclared assignment

This usually starts as a typo or a rushed debug variable:

```js
function submit() {
  statusMesage = "sent"; // typo: missing declaration and misspelled name
}
```

In loose old code, that can create global state by mistake. In strict mode or modules, it throws, which is exactly what you want.

## 7. Compare With Related Concepts

### Global execution context vs execution context

An execution context is the general runtime container JavaScript uses whenever it runs code. The global execution context is the very first one, created for top-level code before any function runs.

Rule of thumb: "execution context" is the category; "global execution context" is the first instance.

### Global execution context vs function execution context

The global execution context exists for global code. A module execution context handles module evaluation, while a function execution context is created each time a function is called and usually disappears when that call finishes.

Rule of thumb: global starts the program; function contexts handle individual calls.

### Global object vs global scope

The global object is a runtime object like `window` or `globalThis`. Global scope is the top-level binding area JavaScript uses for names. In classic scripts they overlap more; in modules they are much more clearly separate.

Rule of thumb: the global object is an object; global scope is a binding space.

### Classic script vs ES module

This is a comparison of loading modes, not a claim that both kinds of code run in the global execution context. A classic script is global code: top-level `var` can leak to `window`, and top-level `this` is `window`. An ES module is evaluated in a module execution context with a separate module environment; it can still use the realm's global object and environment, but its top-level names stay in the module, modules are strict by default, and top-level `this` is `undefined`.

Rule of thumb: if you want predictable top-level behavior, think in modules first.

### Hoisting vs global execution context

Hoisting is not a separate room in the runtime. It is one visible effect of JavaScript setting up the global execution context before execution begins.

Rule of thumb: hoisting is one consequence; the global execution context is the environment that makes it happen.

## 8. 🧠 The Memory Hook — What Sticks

The global execution context is JavaScript opening the building before work starts: it sets up the lobby, registers the names, and decides which ones stay private versus which ones get pinned to the public board. If you remember only one thing, remember this: top-level does not always mean global object, and modules changed that forever.
