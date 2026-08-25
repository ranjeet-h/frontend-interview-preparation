# Scope Chain

## 1. Why This Exists — The Problem First

You ship a pricing fix, test it once, and everything looks right. Then a user reports that one screen still shows the wrong currency symbol even though you updated the global config. The bug turns out to be a local variable with the same name hiding the outer one, so the function never read the value you thought it would.

This is why the scope chain matters. JavaScript needs a deterministic rule for answering one simple question every time code reads a name like `price`, `user`, or `token`: "which exact variable do you mean?" If you do not understand that lookup path, nested functions, closures, and shadowing feel random when they are actually very strict.

## 2. The Analogy — Make It Obvious

Think of scope chain lookup like asking for a file in an office building.

You first check your own desk drawer. If the file is not there, you ask your team cabinet. If it is still not there, you ask the building archive room. The search always starts with the closest place to you and moves outward one level at a time. The first match wins, and once you find the file, you stop searching.

That maps directly to JavaScript:

- Your desk drawer is the current local scope.
- The team cabinet is the immediately outer scope.
- The building archive is the global or module scope.

If your desk has a file named `config`, you use that one even if the archive also has a file named `config`. The outer file still exists, but the closer one blocks it from view. That is shadowing.

## 3. How It Actually Works — The Full Explanation

The scope chain is the lookup path JavaScript uses when code reads a variable name. The rule is lexical, which means it depends on where the code was written, not where the function was called from.

When JavaScript evaluates an identifier, it does this:

1. It checks the current scope first.
2. If the name is not there, it checks the parent scope.
3. It keeps moving outward until it finds a match or runs out of scopes.
4. If the name does not exist anywhere in that chain, reading it throws a `ReferenceError`.

The important part is that the chain is created by nesting in the source code.

Ordinary nested lexical lookup is not prototype-chain or object-property lookup: it follows lexical environments to resolve an identifier, while property lookup follows an object and its prototypes to find a property. One global-environment detail is easy to miss: in a classic script, top-level `var` and function declarations can be backed by properties of the global object, while `let` and `const` use separate global lexical bindings. That global-object mapping is a property of the classic-script global environment; it does not make ordinary nested lexical lookup a prototype lookup.

```js
const appName = "Storefront";

function checkout() {
  const taxRate = 0.18;

  function formatTotal(amount) {
    return `${appName}: ${amount + amount * taxRate}`;
  }

  return formatTotal(100);
}
```

Inside `formatTotal`:

- `amount` is found locally.
- `taxRate` is not local, so JavaScript looks one scope out and finds it in `checkout`.
- `appName` is not in either inner scope, so JavaScript keeps walking outward until it reaches the top-level scope.

That is local -> outer -> global lookup in action.

Closures work because functions keep access to the scope where they were created. If an inner function escapes and runs later, it still uses the same lookup chain from its definition site.

```js
function createFormatter(currency) {
  return function format(amount) {
    return `${currency} ${amount}`;
  };
}

const formatInr = createFormatter("INR");
console.log(formatInr(250)); // INR 250
```

`createFormatter` has already finished, but `format` still resolves `currency` from the outer scope it closed over. The outer scope is not copied as a frozen snapshot. The function still has access to that binding.

Shadowing is different from mutation.

- Shadowing means you created a new variable with the same name in a nearer scope.
- Mutation means you changed the value of an existing variable that both scopes can still reach.

```js
let theme = "light";

function shadowExample() {
  const theme = "dark";
  return theme;
}

function mutationExample() {
  theme = "dark";
  return theme;
}

console.log(shadowExample()); // dark
console.log(theme); // light

console.log(mutationExample()); // dark
console.log(theme); // dark
```

In `shadowExample`, the inner `theme` is a different variable. In `mutationExample`, there is no new local `theme`, so JavaScript walks outward, finds the outer one, and updates it.

One more subtle point: top-level lookup is not always the browser global object. In modern JavaScript modules, top-level variables live in module scope, not on `window`. The lookup idea is the same, but the outermost scope is the module, not shared script globals.

## 4. Real Code — See It Working

**Example 1: Basic lookup from inner to outer**

```js
const region = "India";

function getInvoiceLabel(orderId) {
  const prefix = "INV";

  function buildLabel() {
    // orderId and prefix come from outer scopes.
    // region comes from the top-level scope.
    return `${prefix}-${orderId}-${region}`;
  }

  return buildLabel();
}

console.log(getInvoiceLabel(42)); // INV-42-India
```

**Example 2: Closure keeps access after the outer function ends**

```js
function makeCounter(start) {
  let count = start;

  return function increment() {
    // This mutates the same count binding each call.
    count += 1;
    return count;
  };
}

const counter = makeCounter(10);

console.log(counter()); // 11
console.log(counter()); // 12
```

**Example 3: Shadowing versus mutation**

```js
let retries = 1;

function runShadowCase() {
  let retries = 5;
  return retries;
}

function runMutationCase() {
  retries += 1;
  return retries;
}

console.log(runShadowCase()); // 5
console.log(retries); // 1

console.log(runMutationCase()); // 2
console.log(retries); // 2
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the scope chain in JavaScript?**

It is the ordered path JavaScript uses to resolve variable names. Lookup starts in the current scope and moves outward through parent scopes until it finds the name or reaches the outermost scope. The first match wins. This is why nested functions can use variables declared outside them.

**Q: Is scope decided by where a function is called or where it is defined?**

It is decided by where the function is defined. JavaScript uses lexical scoping, so the lookup path is based on source-code nesting. A function carries access to the scopes around its definition, not the scopes around its caller. That is why calling the same function from two different places does not change which outer variables it can see.

**Q: How does the scope chain relate to closures?**

Closures are functions that keep access to outer bindings after the outer function has finished. They work because the inner function still resolves names through the same outer scope chain it had at creation time. The scope chain is the lookup rule; a closure is a function that still uses that rule later.

**Q: What is variable shadowing?**

Shadowing happens when an inner scope declares a variable with the same name as one in an outer scope. Because lookup starts from the inside, the inner variable is found first and hides the outer one for that part of the code. The outer variable is still there; it is just not the one being resolved.

**Q: What happens if JavaScript never finds a variable in the scope chain?**

If code tries to read a name that does not exist in any reachable scope, JavaScript throws a `ReferenceError`. That usually means the variable was misspelled, declared in a different scope than expected, or never declared at all.

**Q: Does the scope chain look through objects too?**

Not in ordinary lexical lookup. Variable lookup and object property lookup are different systems. Scope chain lookup answers "where is the variable named `user`?" Prototype chain lookup answers "where is the property named `name` on this object?" People confuse them because both involve walking outward, but they walk different structures for different reasons. Special constructs such as `with` can add object-backed lookup behavior, but that does not make scope lookup and prototype lookup the same mechanism.

**Q: How do modules affect scope chain behavior?**

Modules add their own top-level scope. A variable declared at the top of an ES module is available to code inside that module, but it does not automatically become `window.someName` in the browser. The lookup still walks outward the same way, but the top-level boundary is module scope instead of old-style shared script global scope.

## 6. The Traps — What Goes Wrong

One common mistake is thinking callers decide scope. They do not. This confusion usually comes from mixing up variable lookup with `this`. `this` can depend on how a function is called. Scope does not. If a function was written inside `outer`, it can see `outer`'s variables even when some completely different function calls it later.

Another trap is mixing up shadowing and mutation. If you declare `const status = "idle"` inside a function while an outer `status` already exists, you did not update the outer variable. You created a brand new local one. This is a common source of bugs in reducers, event handlers, and nested callbacks where the code "looks" like it changed shared state but actually only hid it.

`var` adds another trap. Because `var` is function-scoped, not block-scoped, declaring `var count` inside an `if` block does not create a block-local shadow the way `let` or `const` would. Developers expect the block to isolate it, but `var` leaks to the surrounding function scope.

Assignment has a separate undeclared-name trap. In non-strict mode, assigning to a name that was never declared can create a property on the global object. In strict mode, the same assignment throws a `ReferenceError`; ES modules are strict by default. Declare the binding explicitly instead of relying on this legacy behavior.

Closures create their own misunderstanding too. Many people say a closure stores a copy of an outer value. That is not the right mental model. A closure keeps access to the binding, so if that binding changes, later reads see the updated value.

```js
function makeLogger() {
  let value = 1;

  const log = () => value;
  value = 2;

  return log;
}

const log = makeLogger();
console.log(log()); // 2
```

The closure did not capture `1` as a frozen snapshot. It kept access to `value`, and `value` later became `2`.

## 7. Compare With Related Concepts

Scope chain vs closure: scope chain is the lookup path itself. A closure is a function that still uses outer scopes after the outer function has returned. **When to use which:** reason about the scope chain when explaining name resolution; use a closure when a function must retain access to outer bindings later.

Scope chain vs prototype chain: scope chain resolves variable names in nested code. Prototype chain resolves properties on objects. They are separate mechanisms even though both involve walking upward. **When to use which:** use scope-chain reasoning for identifiers in code; use prototype-chain reasoning for missing properties on objects.

Shadowing vs mutation: shadowing creates a new inner variable with the same name. Mutation changes an existing variable's value. If the outer value stayed unchanged, you probably shadowed instead of mutated. **When to use which:** use shadowing when a nested operation needs an intentionally separate name; use mutation when it should update the existing binding.

Lexical scope vs dynamic scope: JavaScript uses lexical scope, so visibility comes from where code is written. In a dynamically scoped language, caller context would matter. In JavaScript, it does not. **When to use which:** use lexical scope for predictable access based on source nesting; use dynamic scope only when a language explicitly defines caller-based lookup.

## 8. 🧠 The Memory Hook — What Sticks

The scope chain is just JavaScript asking, "Do I have this name here? If not, who is my parent?" The first answer it finds wins, which is why inner variables can hide outer ones and why closures can still reach back into the scopes they were born in.
