# Guess the Output: Operators, Arguments & Functions

Short-circuit values (not booleans), optional chaining that stops at nullish, pre/post increment evaluation order, pass-by-value-of-the-reference, the `arguments` object that arrows don't have, and the named-function-expression name that only exists inside itself.

## `||` falls back on any falsy, `??` only on nullish

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log(0 || "A"); // => "A"
console.log(0 ?? "A"); // => 0
console.log(null || "A"); // => "A"
console.log(null ?? "A"); // => "A"
```

### Output

```text
A
0
A
A
```

### Explanation

Statement by statement. **Line 1:** `||` returns the left side if it is truthy, otherwise the right side. `0` is falsy, so the result is `"A"`. **Line 2:** `??` returns the left side unless it is nullish (`null` or `undefined`). `0` is not nullish, so the result is `0` — the trap. **Line 3:** `null` is falsy, so `||` yields `"A"`. **Line 4:** `null` is nullish, so `??` also yields `"A"`.

### The Rule

`||` tests truthiness (falls back on `0`, `""`, `NaN`, `false`, `null`, `undefined`); `??` tests only nullishness (`null`, `undefined`). Valid values like `0` and `""` survive `??` but not `||`.

### How to Rewrite It Safely

Use `??` for defaults where `0`, `""`, or `false` are legitimate values (counts, names, flags). Use `||` only when every falsy value should be replaced. The dangerous variation is `count || 10` when `count` can be `0` — it silently becomes `10`.

### Takeaway

`0 ?? "A"` is `0` because `??` cares only about `null`/`undefined`; `0 || "A"` is `"A"` because `||` cares about all falsy values.

## `&&` and `||` return operand values, not booleans

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log(false && "A"); // => false
console.log(true && "A"); // => "A"
console.log(false || "A"); // => "A"
console.log("B" || "A"); // => "B"
```

### Output

```text
false
A
A
B
```

### Explanation

**Line 1:** `&&` evaluates the left side first. `false` is falsy, so `&&` short-circuits and returns `false` itself — the right side never runs. **Line 2:** `true` is truthy, so `&&` evaluates and returns the right side, `"A"`. **Line 3:** `||` returns the left side if truthy, else the right side; `false` is falsy, so it returns `"A"`. **Line 4:** `"B"` is truthy, so `||` short-circuits and returns `"B"`.

### The Rule

`&&` returns the first falsy operand or the last operand; `||` returns the first truthy operand or the last operand. Both short-circuit: evaluation stops as soon as the result is determined, and the result is an operand value, never a coerced boolean.

### How to Rewrite It Safely

Nothing is broken — this value-returning behaviour is what makes `cond && <Component />` and `value || default` work. The variation that breaks is assuming a boolean result: `const ok = a && b` may hold `"A"`, so compare explicitly (`Boolean(a && b)`) when a real boolean is required.

### Takeaway

Logical operators select and return one of their operands; `&&` keeps going on truthy, `||` keeps going on falsy, and neither coerces the result to a boolean.

## Optional property chaining yields `undefined` instead of throwing

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
const obj = {};
console.log(obj.user?.address?.city); // => undefined
console.log(obj.user.address.city); // throws
```

### Output

```text
undefined
TypeError: Cannot read properties of undefined (reading 'address')
```

### Explanation

**Line 1:** a binding `obj` holds `{}`. Line 2 evaluates `obj.user` → `undefined`, then hits `?.`. Because the base is `null`/`undefined`, the entire remaining chain short-circuits to `undefined` without evaluating `address` or `city` — no property access happens, so nothing throws. **Line 3:** plain `.` access on `undefined` has no such guard, so `obj.user.address` throws a `TypeError` at the first step.

### The Rule

`?.` short-circuits the whole chain to `undefined` the moment it meets `null` or `undefined`; only nullish bases trigger the shortcut — other falsy values (`0`, `""`, `false`) continue normally.

### How to Rewrite It Safely

Use `?.` for data that may be absent (API payloads, nested config), paired with `??` for the fallback: `obj.user?.address?.city ?? "Unknown"`. The variation that breaks is over-using it to hide bugs — if `obj` itself should never be empty, a plain access that throws early is the better signal.

### Takeaway

`?.` turns "property of nothing" from a `TypeError` into `undefined`; it guards only against `null`/`undefined`, not against every falsy value.

## Optional call skips the call when the function is missing

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
const obj = { fn: null };
console.log(obj.fn?.()); // => undefined
```

### Output

```text
undefined
```

### Explanation

`obj.fn` evaluates to `null`. The `?.()` form checks the base before calling: because it is nullish, the call is skipped entirely and the whole expression evaluates to `undefined`. No attempt to invoke `null` as a function occurs, so no `TypeError` is thrown. If `fn` held a real function, it would be called normally with `this` set to `obj`.

### The Rule

`?.()` calls the function only when the base is neither `null` nor `undefined`; otherwise it short-circuits to `undefined`. Like property chaining, it guards only against nullish bases.

### How to Rewrite It Safely

This is the safe pattern for optional callbacks: `options.onDone?.(result)` replaces the verbose `if (typeof options.onDone === "function")` guard. The variation that breaks is `obj.fn()` with plain parentheses — that throws `TypeError: obj.fn is not a function` when `fn` is `null`.

### Takeaway

`?.()` means "call if callable, otherwise `undefined`"; prefer it over manual `typeof` guards for optional callbacks.

## Postfix returns the old value, prefix returns the new one

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
let a = 1;
console.log(a++); // => 1
console.log(a); // => 2
console.log(++a); // => 3
```

### Output

```text
1
2
3
```

### Explanation

**Line 2:** `a++` (postfix) reads the current value `1` as the expression result, then increments the binding to `2` — so `1` logs. **Line 3:** reads the binding, now `2`. **Line 4:** `++a` (prefix) increments first (`2` → `3`), then yields the new value — so `3` logs.

### The Rule

Postfix `a++`/`a--` evaluate to the value before the update; prefix `++a`/`--a` evaluate to the value after the update. Both mutate the binding exactly once, immediately.

### How to Rewrite It Safely

This snippet demonstrates the correct mental model, not a bug. The variation that breaks is using the result inside a larger expression (`arr[i++]` vs `arr[++i]`) without tracking which value is consumed — prefer a separate statement for the increment when readability matters.

### Takeaway

Postfix yields-then-increments, prefix increments-then-yields; never use one while assuming the other's timing.

## `x++ + ++x` evaluates strictly left to right

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
let x = 1;
const y = x++ + ++x;
console.log(x); // => 3
console.log(y); // => 4
```

### Output

```text
3
4
```

### Explanation

`+` evaluates its operands left to right, and each `++` takes effect immediately. **Left operand `x++`:** yields the current value `1`, then `x` becomes `2`. **Right operand `++x`:** increments `2` → `3`, then yields `3`. The addition is `1 + 3 = 4`, assigned to `y`. Final state: `x` is `3`, `y` is `4`.

### The Rule

JavaScript evaluates operands in strict left-to-right order, and each increment's side effect lands before the next operand is read. There is no unspecified or undefined evaluation order here, unlike C++.

### How to Rewrite It Safely

Never write this in real code — split it into separate statements so the order is visible: `const first = x++; x += 1; const y = first + x;` (or just avoid mixing). Interviewers ask it to test whether you can trace evaluation order, not to endorse the style.

### Takeaway

Operands run left to right with immediate side effects: `x++ + ++x` from `1` is `1 + 3`, leaving `x` at `3`.

## `a += a++` freezes the left value before the increment

`Difficulty: Hard` `Probability: Medium`

### The Code

```javascript
let a = 1;
a += a++;
console.log(a); // => 2
```

### Output

```text
2
```

### Explanation

Compound assignment captures the left-hand value **before** evaluating the right side. Step 1: evaluate the `a` reference and read its current value, `1` (saved as the left operand). Step 2: evaluate `a++` — yields `1` and increments `a` to `2`. Step 3: add the saved left (`1`) to the right (`1`) → `2`, and store `2` back into `a`, overwriting the increment. Final: `a` is `2`, not `3`.

### The Rule

`a += rhs` is `a = <value of a read before rhs runs> + <rhs>`. The pre-read left value plus the post-increment yield combine, and the final store discards the intermediate increment.

### How to Rewrite It Safely

Use this snippet sparingly — only to demonstrate evaluation order, never as a pattern. Any real code mixing assignment to `a` with `a++` in one statement should be split across two lines so no value is silently overwritten.

### Takeaway

In `a += a++`, the left side is snapshotted before the right side runs, so with `a = 1` the store is `1 + 1 = 2`.

## Reassigning a primitive parameter never touches the caller

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
let x = 10;
function update(num) {
  num = 20;
}
update(x);
console.log(x); // => 10
```

### Output

```text
10
```

### Explanation

**Setup:** global binding `x` holds `10`; function `update` is declared. **Execution:** `update(x)` copies the *value* `10` into a fresh local binding `num` — `num` and `x` are two independent slots. Assigning `num = 20` writes only the local slot. When the call returns, the global `x` still holds `10`.

### The Rule

Primitives are passed by value: the parameter is a new binding initialised with a copy. Reassigning it is invisible to the caller. (This is the first of the must-understand trio: reassign-primitive, mutate-object, reassign-object.)

### How to Rewrite It Safely

Nothing is broken — this demonstrates correct value semantics. The variation that breaks is expecting the function to "return through" the parameter; instead `return` the new value explicitly: `x = update(x)`.

### Takeaway

A primitive parameter is an independent copy; assigning to it affects only the local binding.

## Mutating an object parameter is visible to the caller

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
const obj = { value: 10 };
function update(item) {
  item.value = 20;
}
update(obj);
console.log(obj.value); // => 20
```

### Output

```text
20
```

### Explanation

`update(obj)` copies the *reference* into the local binding `item` — now `item` and `obj` point at the same heap object. `item.value = 20` follows that shared reference and writes into the object's slot. The binding `obj` was never touched, but the object it points to changed, so `obj.value` reads `20`.

### The Rule

Objects pass a copy of the reference: two bindings, one shared object. Mutations through either binding are visible through both. (Second of the trio: contrast with reassigning a primitive, and with reassigning the parameter itself next.)

### How to Rewrite It Safely

Nothing is broken — shared-reference mutation is how methods like `arr.push(x)` and `Object.assign(target, ...)` work. The dangerous variation is mutating a caller's object by accident; defensively copy first (`{ ...item }`, `structuredClone`) when the function should not have side effects.

### Takeaway

Copying a reference still shares the object: writes through the parameter land on the caller's object.

## Reassigning an object parameter leaves the caller untouched

`Difficulty: Medium` `Probability: Very High`

### The Code

```javascript
const obj = { value: 10 };
function replace(item) {
  item = { value: 20 };
}
replace(obj);
console.log(obj.value); // => 10
```

### Output

```text
10
```

### Explanation

`replace(obj)` copies the reference into local `item`, so both start pointed at the same object. But `item = { value: 20 }` re-points only the *local* binding at a brand-new object; the caller's `obj` binding still points at the original. The original object is never written to, so `obj.value` stays `10` and the new object is garbage once the call returns.

### The Rule

Reassigning a parameter only swaps which object the local binding points at — it cannot re-point the caller's binding. Mutation (previous question) changes the shared object; reassignment changes only the local arrow. (Third of the trio — the one candidates must be able to state cold.)

### How to Rewrite It Safely

This demonstrates the model, not a bug. The variation that breaks is writing a "reset" or "replace" helper that reassigns its parameter and expecting the caller to see it — either mutate the passed object (`item.value = 20`) or `return` the new object (`obj = replace(obj)`).

### Takeaway

Mutation reaches the caller through the shared object; reassignment only redirects the local binding and is lost on return.

## `arguments.length` counts what was passed, not what was declared

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
function test(a, b) {
  console.log(arguments.length); // => 1
}
test(1);
```

### Output

```text
1
```

### Explanation

`test` declares two parameters, but `arguments` reflects the actual call. Called with one argument, `arguments` is an array-like holding `[1]`: `arguments.length` is `1`, `a` is `1`, and `b` is `undefined`. The declared arity (`test.length`, which is `2`) plays no role in what `arguments` contains.

### The Rule

`arguments.length` is the number of arguments actually passed at the call site; missing parameters simply become `undefined`. (Declared count lives separately on `fn.length`.)

### How to Rewrite It Safely

Prefer rest parameters (`...args`) in modern code — a real array with `map`/`length` and no `this`-sensitivity. The variation that breaks is relying on `arguments` inside an arrow function (it has none; see the next question) or treating it as an array (`arguments.map` throws).

### Takeaway

`arguments.length` answers "how many did the caller pass?", never "how many did I declare?".

## Arrows have no `arguments`, `this`, `new`, or `prototype`

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
function normal(a, b) {
  console.log("args:", arguments.length, "| new:", new.target === undefined);
}
normal(1, 2);
console.log("proto:", typeof normal.prototype); // => "object"

const arrow = (...args) => {
  console.log("args:", args.length);
};
arrow(1, 2);
console.log("proto:", typeof arrow.prototype); // => "undefined"
try {
  new arrow();
} catch (error) {
  console.log(error.constructor.name); // => "TypeError"
}
```

### Output

```text
args: 2 | new: true
proto: object
args: 2
proto: undefined
TypeError
```

### Explanation

**Normal function:** called with two arguments, so `arguments.length` is `2`; called without `new`, so `new.target` is `undefined`. Every normal function gets a `prototype` object for constructor use. **Arrow:** has no own `arguments` (hence the `...args` rest parameter, length `2`) and no `prototype` property (`typeof` is `"undefined"`). `new arrow()` throws a `TypeError` because arrows cannot be constructed. Arrows also capture `this` lexically instead of receiving it from the call — which is why extracting a method as an arrow (or binding it) behaves differently from a plain function.

### The Rule

Normal functions get four things arrows never do: their own `arguments` object, dynamic `this` from the call site, constructibility via `new` (backed by `prototype`), and `new.target`. Arrows inherit `this`/`arguments` lexically from the enclosing scope and are permanently non-constructible.

### How to Rewrite It Safely

Use arrows for callbacks that need the outer `this` (`.then`, array methods, event handlers in classes) and normal functions (or methods) for anything constructed, borrowed with `call`/`apply`, or relying on `arguments`. The variation that breaks is `new` on an arrow or `arguments` inside one — both fail, the first loudly, the second by silently reading the outer scope's.

### Takeaway

Arrows are lightweight closures — no `arguments`, no own `this`, no `prototype`, no `new`; reach for a normal function whenever any of those four is needed.

## A named function expression's name exists only inside itself

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const foo = function bar() {
  console.log(typeof bar); // => "function"
};
foo();
console.log(typeof bar); // => "undefined"
```

### Output

```text
function
undefined
```

### Explanation

**Setup:** only `foo` is bound in the outer scope; `bar` is not created there. **Execution:** calling `foo()` runs the function body, where the expression's name `bar` is visible as a read-only binding referring to the function itself — so `typeof bar` is `"function"` (the standard recursion trick). After the call, the outer `console.log` looks up `bar` in the global scope, finds no binding, and `typeof` on an undeclared name safely yields `"undefined"` instead of throwing.

### The Rule

A named function expression binds its name only inside its own body (for self-reference/recursion); the outer scope sees only the variable it was assigned to. `typeof` on a missing name returns `"undefined"` rather than throwing, which is why the probe is safe.

### How to Rewrite It Safely

This demonstrates the correct pattern: name the expression (`function bar`) so it can recurse and appear in stack traces, while calling it through `foo`. The variation that breaks is calling `bar()` from outside — that throws `ReferenceError: bar is not defined`; use a function *declaration* if the name must be visible externally.

### Takeaway

The inner name is for recursion and stack traces; the outer variable is for callers — never confuse the two scopes.

