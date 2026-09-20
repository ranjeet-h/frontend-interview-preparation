# Guess the Output: `this`

`this` is decided at the call site, never at the definition site. Method call, plain call, nested function, arrow, extraction, and `bind` each answer "who is the receiver?" differently, and one bound-constructor question tests the special `new`-ignores-the-bound-receiver rule.

## Method call sets `this` to the receiver

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
const obj = {
  value: 10,
  getValue() {
    return this.value;
  },
};

console.log(obj.getValue());
```

### Output

```text
10
```

### Explanation

Setup: `obj` is created with an own property `value` (`10`) and an own method `getValue`. Reading `obj.getValue` yields the function object stored on `obj`; the call expression has the shape `receiver.method(...)`.

Execution: because the function is invoked as a property of `obj` (`obj.getValue()`), implicit binding applies — `this` inside `getValue` is set to the receiver `obj`. `this.value` reads `obj.value`, which is `10`. The `console.log` prints `10`.

### The Rule

When a function is called as `receiver.method(args)`, `this` is the receiver — the object before the dot at the call site. This is implicit binding, and it is determined by how the function is called, not where it is defined.

### How to Rewrite It Safely

Nothing is broken — this is the baseline correct pattern. The variation that breaks it is detaching the method (`const fn = obj.getValue; fn()`), which drops the receiver; keep the receiver attached or bind explicitly (covered below).

### Takeaway

`obj.method()` makes `this` inside the method equal `obj`; always read `this` from the call site.

## A nested plain function loses the method's `this`

`Difficulty: Medium` `Probability: Very High`

### The Code

```javascript
var value = "global";

const obj = {
  value: 10,
  getValue() {
    function inner() {
      return this.value;
    }
    return inner();
  },
};

console.log(obj.getValue());
```

### Output

```text
global
```

### Explanation

Setup: the script runs sloppy (non-strict), and `var value = "global"` creates a property `value` on `globalThis`. `obj.getValue` is a method whose body defines a plain nested function `inner`.

Execution: `obj.getValue()` sets `this` to `obj` for the outer method (implicit binding). But `inner()` is then called as a bare call — no receiver. A bare call triggers default binding: in sloppy mode `this` inside `inner` becomes `globalThis`, so `this.value` reads `globalThis.value`, which is `"global"`. The log prints `global`. In strict mode (or inside a module, which is always strict) the same bare call sets `this` to `undefined`, and `this.value` would throw `TypeError: Cannot read properties of undefined`.

### The Rule

Every plain-function call gets its own `this` from its own call site: `receiver.fn()` binds the receiver, but a bare `fn()` falls back to default binding (`globalThis` in sloppy mode, `undefined` in strict mode). Nesting a function inside a method does not inherit the method's `this`.

### How to Rewrite It Safely

Capture the outer `this` or avoid a new `this` entirely:

```javascript
const obj = {
  value: 10,
  getValue() {
    const inner = () => this.value; // arrow inherits this (see next question)
    return inner();
  },
};
```

Alternatively `const self = this;` then use `self.value` inside `inner`, or `inner.call(this)`.

### Takeaway

A nested `function` starts `this` over from its own call site; in a method, a bare inner call sees the global object (sloppy) or `undefined` (strict) — never the outer `this` automatically.

## An arrow inner function keeps the method's `this`

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
const obj = {
  value: 10,
  getValue() {
    const inner = () => this.value;
    return inner();
  },
};

console.log(obj.getValue());
```

### Output

```text
10
```

### Explanation

Setup: `obj.getValue` is a normal method; `inner` is an arrow function created inside it. Arrow functions have no `this` slot of their own — they close over the `this` of the enclosing scope at creation time.

Execution: `obj.getValue()` sets `this` to `obj` for the method body. When `const inner = () => this.value` is evaluated, the arrow captures that `this` (`obj`). Calling `inner()` as a bare call does not rebind anything — there is no `this` to rebind — so `this.value` still reads `obj.value`, `10`. The log prints `10`, in both sloppy and strict mode.

### The Rule

Arrows use lexical `this`: they inherit `this` from the surrounding scope where they are defined, and no call pattern (`inner()`, `.call(x)`, `.bind(x)`) can change it. A plain nested function rebinds `this` per call; an arrow never does.

### How to Rewrite It Safely

This is the safe rewrite of the previous trap — prefer an arrow (or `call`/`bind`) for callbacks nested inside methods. The variation that breaks it is converting `inner` back to `function inner() {...}`, which reintroduces default binding.

### Takeaway

Use an arrow for a helper nested inside a method when the helper must see the method's `this`; lexical `this` survives any call shape.

## An arrow used as a method ignores the receiver

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
var value = "global";

const obj = {
  value: 10,
  getValue: () => this.value,
};

console.log(obj.getValue());
console.log(obj.getValue.call({ value: 99 }));
```

### Output

```text
global
global
```

### Explanation

Setup: the script is sloppy, so top-level `this` is `globalThis`, and `var value = "global"` puts `value` on `globalThis`. `getValue` is an arrow defined at the top level, so it captures the top-level `this` (`globalThis`) at creation time — not `obj`.

Execution: `obj.getValue()` looks like an implicit-binding call, but arrows have no `this` to bind, so the receiver `obj` is ignored and `this.value` reads `globalThis.value` → `"global"`. The second line tries explicit binding with `.call({ value: 99 })`, but `call`/`apply`/`bind` cannot rebind an arrow either, so it again reads the captured `globalThis` and prints `"global"`. In strict mode or a module, top-level `this` is `undefined`, so both lines would throw `TypeError: Cannot read properties of undefined` instead.

### The Rule

An arrow's `this` is fixed lexically where the arrow is written; the call site — receiver, `.call`, `.apply`, `.bind` — is irrelevant. Never use an arrow as an object method when the method needs the object.

### How to Rewrite It Safely

Use a concise (non-arrow) method, which gets a dynamic `this` from the call site:

```javascript
const obj = {
  value: 10,
  getValue() {
    return this.value;
  },
};
```

### Takeaway

Arrows capture `this` from their definition scope; as a method that makes them blind to the receiver, so method bodies that need `this` must be plain functions.

## Extracting a method drops its `this`

`Difficulty: Medium` `Probability: Very High`

### The Code

```javascript
var value = "global";

const obj = {
  value: 10,
  getValue() {
    return this.value;
  },
};

const fn = obj.getValue;
console.log(fn());
```

### Output

```text
global
```

### Explanation

Setup: sloppy script; `var value = "global"` lands on `globalThis`. `obj.getValue` is a normal method. `const fn = obj.getValue` copies only the function reference into `fn` — the connection to `obj` is not stored anywhere.

Execution: `fn()` is a bare call with no receiver, so default binding applies: `this` inside `getValue` becomes `globalThis` (sloppy mode), and `this.value` reads `"global"`. The log prints `global`. In strict mode (or a module) `this` would be `undefined` and `fn()` would throw `TypeError: Cannot read properties of undefined (reading 'value')`.

### The Rule

`this` is bound per call from the call-site shape, not from where the function was defined or fetched. Copying a method into a standalone variable and calling it bare loses the implicit binding.

### How to Rewrite It Safely

Reattach the receiver at the call site or permanently:

```javascript
console.log(fn.call(obj)); // 10 — explicit binding at the call
const bound = obj.getValue.bind(obj);
console.log(bound()); // 10 — permanently bound (see next question)
```

### Takeaway

A method reference without its `receiver.` prefix is just a function; calling it bare resets `this` to the default, so pass or bind the receiver deliberately.

## `bind` permanently restores the receiver

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
const obj = {
  value: 10,
  getValue() {
    return this.value;
  },
};

const fn = obj.getValue.bind(obj);
console.log(fn());
```

### Output

```text
10
```

### Explanation

Setup: `obj.getValue` is a normal method. `.bind(obj)` creates a new bound function that wraps the original and remembers `obj` as its bound `thisArg`.

Execution: `fn()` is syntactically a bare call, which would normally trigger default binding — but a bound function ignores the call-site `this` and invokes the original with the stored `thisArg` (`obj`). So `this.value` reads `obj.value`, `10`, in both sloppy and strict mode. Even `fn.call({ value: 99 })` would still print `10`, because explicit call-site binding cannot override a bound `thisArg` (only `new` can, as the last question shows).

### The Rule

`bind` returns an exotic function object with a permanently fixed `thisArg`: later bare calls, method calls on other objects, and `.call`/`.apply` cannot change the `this` it supplies to the target.

### How to Rewrite It Safely

This is the safe form of the previous trap — bind once when handing a method to code that will call it bare (event handlers, timers, callbacks). Note that bound functions also permanently prepend bound arguments; use that only deliberately.

### Takeaway

When a method must survive extraction, `bind` it once to its owner; the bound `this` wins over every later call shape except `new`.

## `call` and `apply` set `this` for one call

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
function print() {
  return this.name;
}

const person = { name: "A" };

console.log(print.call(person));
console.log(print.apply(person));
```

### Output

```text
A
A
```

### Explanation

Setup: `print` is a standalone plain function; `person` is `{ name: "A" }`. Both `.call` and `.apply` invoke the function immediately with an explicitly supplied `thisArg`.

Execution: `print.call(person)` runs `print` with `this` set to `person`, so `this.name` is `"A"`. `print.apply(person)` does exactly the same thing — the only difference between the two is how trailing arguments are passed (`call` takes them one by one, `apply` takes an array-like), and here there are none. Both logs print `A`.

### The Rule

`call(thisArg, ...args)` and `apply(thisArg, argsArray)` perform explicit binding for a single invocation: they run the function now with `this` forced to `thisArg`, and differ only in argument passing style. Neither creates a reusable function — that is `bind`'s job.

### How to Rewrite It Safely

Nothing is broken — this demonstrates the correct mental model. The variation that breaks it is forgetting that in sloppy mode a `null`/`undefined` `thisArg` is substituted with `globalThis` (`print.call(null)` reads the global), whereas strict mode passes it through untouched.

### Takeaway

`call` and `apply` mean "run now with this exact `this`"; same binding, different argument shape — pick `call` for listed args, `apply` for an array of args.

## `bind` can preset leading arguments

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const obj = { sum: 10 };

function print(a, b) {
  console.log(this.sum, a, b);
}

const fn = print.bind(obj, 1);
fn(2);
```

### Output

```text
10 1 2
```

### Explanation

Setup: `print(a, b)` logs `this.sum`, `a`, and `b`. `print.bind(obj, 1)` creates a bound function with two things stored: the bound `thisArg` (`obj`) and a bound leading argument (`1`).

Execution: `fn(2)` invokes the bound function with call-time argument `2`. The bound function concatenates bound arguments before call-time arguments, so the target runs as `print.call(obj, 1, 2)`: `this` is `obj` (→ `this.sum` is `10`), `a` is the bound `1`, `b` is the call-time `2`. The single `console.log` prints `10 1 2`.

### The Rule

`bind` does partial application: `fn.bind(thisArg, ...boundArgs)` prepends `boundArgs` to whatever arguments the bound function later receives. The final argument list is `[...boundArgs, ...callTimeArgs]`, and `this` is always the bound `thisArg`.

### How to Rewrite It Safely

This is the correct pattern for presetting arguments (e.g. `btn.addEventListener("click", handler.bind(null, id))`). The dangerous variation is assuming later arguments replace bound ones — they append instead, so `fn(2, 3)` here would call `print(obj, 1, 2, 3)` with `3` ignored, not `print(obj, 2, 3)`.

### Takeaway

`bind` fixes both `this` and a prefix of the argument list; everything passed later is appended after the preset args.

## A bound function called with `new` ignores the bound `this`

`Difficulty: Hard` `Probability: Medium`

### The Code

```javascript
const obj = { value: 10 };

function Person() {
  this.value = 20;
}

const Bound = Person.bind(obj);
const x = new Bound();

console.log(obj.value);
console.log(x.value);
console.log(x instanceof Person);
```

### Output

```text
10
20
true
```

### Explanation

Setup: `obj` is `{ value: 10 }`. `Person` is a plain constructor that assigns `this.value = 20`. `Person.bind(obj)` creates a bound function `Bound` remembering `obj` as its `thisArg`.

Execution: `new Bound()` performs a construct call. The spec's rule for bound functions under `new` is special: the bound `thisArg` (`obj`) is ignored, and a fresh object with `Bound.prototype` (which forwards to `Person.prototype`) as its prototype becomes `this` instead. So the constructor body runs `freshThis.value = 20` on the new instance, leaving `obj` untouched. Hence `obj.value` stays `10`, `x.value` is `20`, and because the prototype chain still leads to `Person.prototype`, `x instanceof Person` is `true`.

### The Rule

`bind` fixes `this` for ordinary calls only. Under `new`, a bound function acts as a constructor: the stored `thisArg` is discarded, a new object is allocated, and bound arguments (if any) are still prepended. The instance inherits from the target's `prototype`, which is why `instanceof` still sees the original constructor.

### How to Rewrite It Safely

Do not `bind` a function you intend to use as a constructor — the binding silently does nothing for `this` under `new` and misleads readers. If you need preset constructor arguments, use a subclass or a factory instead:

```javascript
class SpecialPerson extends Person {
  constructor() {
    super(/* preset args here */);
  }
}
```

### Takeaway

`new` beats `bind`: a constructed bound function builds a fresh instance and throws the bound `this` away, while still keeping the target's prototype and any preset arguments.

