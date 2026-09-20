# Guess the Output: Equality & Coercion

`==` coerces by rule, `===` barely coerces at all, and `+` is two operators sharing one symbol. These questions reward knowing the abstract operations (`ToPrimitive`, `ToNumber`) over memorising tables — with the object-to-primitive cases worked mechanically.

## Primitive assignment copies the value

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
let a = 10;
let b = a;
b = 20;
console.log(a);
console.log(b);
```

### Output

```text
10
20
```

### Explanation

Primitives are stored by value, not by reference. `let a = 10` creates a binding `a` holding the number `10`. `let b = a` copies that value into a separate binding `b`, so `b` also holds `10` but shares nothing with `a`. Reassigning `b = 20` replaces only `b`'s slot. Reading `a` afterwards still yields `10`; reading `b` yields `20`.

### The Rule

Numbers, strings, booleans, `null`, `undefined`, symbols, and bigints are primitive values. Assignment and argument passing copy the value itself, so two variables holding the same primitive are fully independent.

### How to Rewrite It Safely

This code demonstrates the correct mental model. The variation that breaks it is repeating the same pattern with an object instead of a number — then `b` would alias `a` rather than copy it.

### Takeaway

Assigning a primitive copies the value. Later reassignment of the copy never affects the original.

## Object assignment copies the reference, not the object

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
const a = { value: 10 };
const b = a;
b.value = 20;
console.log(a.value);
```

### Output

```text
20
```

### Explanation

Objects live on the heap and variables hold references to them. `const a = { value: 10 }` creates one object and stores a reference in `a`. `const b = a` copies that reference, so `a` and `b` point at the same object — no second object is created. `b.value = 20` mutates the shared object through `b`. Reading `a.value` observes the same object, so it prints `20`.

### The Rule

Object assignment aliases: it copies the reference while the object itself stays singular. Mutation through any alias is visible through every alias; only reassignment (`b = {...}`) would detach one binding.

### How to Rewrite It Safely

This demonstrates aliasing. The variation that breaks expectations is assuming `b` is an independent copy. To get independence, copy explicitly: `const b = { ...a };` — but remember that is only a shallow copy.

### Takeaway

`const b = a` on an object creates two names for one object. Mutating through one is visible through the other.

## Spread copies top-level properties into a new object

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
const a = { value: 10 };
const b = { ...a };
b.value = 20;
console.log(a.value);
console.log(b.value);
```

### Output

```text
10
20
```

### Explanation

Spread into an object literal builds a fresh object and copies each own enumerable property of the source. `b` starts as a new object with its own `value` property holding `10`. Reassigning `b.value = 20` writes only to `b`'s own property. `a.value` is a separate property on a separate object, so it stays `10`.

### The Rule

`{ ...a }` performs a shallow copy: a new outer object whose top-level properties are copied by value (primitives) or by reference (objects). Top-level reassignment on the copy never touches the source.

### How to Rewrite It Safely

This is the safe version of the previous trap for flat objects. The variation that breaks it is a nested object — spread does not clone nested references, so `b.nested.x = ...` would still leak into `a`.

### Takeaway

Spread gives you a new outer object. For flat data, top-level writes on the copy are fully independent of the source.

## Nested spread still shares nested references

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const a = { user: { name: "A" } };
const b = { ...a };
b.user.name = "B";
console.log(a.user.name);
console.log(b.user.name);
```

### Output

```text
B
B
```

### Explanation

Spread is shallow. `{ ...a }` creates a new outer object, but the `user` property is an object, so only its reference is copied — `a.user` and `b.user` point at the same inner object. `b.user.name = "B"` mutates that shared inner object. Both `a.user.name` and `b.user.name` read the same mutated object, so both print `"B"`. Only the outer shell was duplicated; the interior was not.

### The Rule

Shallow copy means one level deep: primitives are duplicated, nested objects are aliased. Any depth beyond the first still shares references. True independence at every level requires a deep clone (`structuredClone(a)` or a recursive clone).

### How to Rewrite It Safely

For genuinely independent nested state, deep-clone: `const b = structuredClone(a);`. Then `b.user.name = "B"` leaves `a.user.name` as `"A"`.

### Takeaway

Spread protects the top level only. If the value contains nested objects, the copy and the source still share those interiors.

## `0 == false` coerces, `0 === false` compares types first

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log(0 == false);
console.log(0 === false);
```

### Output

```text
true
false
```

### Explanation

For `0 == false`, loose equality coerces. The abstract equality algorithm sees a boolean on the right, so it applies `ToNumber(false)` first, yielding `0`. The comparison becomes `0 == 0`, a numeric comparison of equal values → `true`. For `0 === false`, strict equality performs no coercion: it first checks types (`Number` vs `Boolean`), finds them different, and returns `false` immediately.

### The Rule

`==` converts operands toward a common type (booleans go through `ToNumber` first), while `===` returns `false` whenever the types differ, with no conversion at all.

### How to Rewrite It Safely

This demonstrates the two equality models. The variation that breaks intuition is relying on `==` with mixed types in real code — prefer `===` and convert explicitly (`Number(x) === 0`) so the conversion is visible.

### Takeaway

`==` coerces before comparing (`false` becomes `0`); `===` compares type first and never coerces.

## Empty string equals `false` loosely but not strictly

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
console.log("" == false);
console.log("" === false);
```

### Output

```text
true
false
```

### Explanation

For `"" == false`, the boolean side drives coercion: `ToNumber(false)` is `0`, so the comparison becomes `"" == 0`. Now a string meets a number, so the string is converted: `ToNumber("")` is `0`. The comparison reduces to `0 == 0` → `true`. For `"" === false`, strict equality sees `String` vs `Boolean` and returns `false` with no conversion.

### The Rule

Loose equality with a boolean always converts the boolean via `ToNumber` first, then continues: string-vs-number goes through `ToNumber` on the string. Empty string, like `false`, numeric-converts to `0`, but they are different types, so `===` rejects them.

### How to Rewrite It Safely

Nothing is broken — this shows why truthiness checks (`if (x)`) and explicit comparisons (`x === ""`) are clearer than `x == false`, which silently equates `""`, `0`, and `false`.

### Takeaway

`"" == false` is `true` only because both sides numeric-convert to `0`. Strict equality never performs that journey.

## `null` loosely equals only `undefined`, nothing else

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
console.log(null == undefined);
console.log(null === undefined);
```

### Output

```text
true
false
```

### Explanation

`null == undefined` is `true` by a special-case rule in the abstract equality algorithm: `null` and `undefined` are loosely equal to each other and to nothing else — no `ToNumber` or `ToPrimitive` conversion runs. `null == 0` and `null == false` are both `false` for the same reason. `null === undefined` is `false` because strict equality requires identical types (`Null` vs `Undefined`).

### The Rule

`==` treats `null` and `undefined` as a pair: they equal each other and coerce to nothing else. `===` distinguishes them by type, so they are never strictly equal.

### How to Rewrite It Safely

This pair is the one widely accepted use of `==`: `x == null` intentionally matches both `null` and `undefined` in a single check. Otherwise use `===` and test each case explicitly.

### Takeaway

`null == undefined` is a deliberate special case — the only loose equality involving `null` that is `true`. Strict equality still separates them.

## An empty array loosely equals `false` via the empty string

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
console.log([] == false);
console.log([] === false);
```

### Output

```text
true
false
```

### Explanation

Work `[] == false` mechanically. The right side is a boolean, so `ToNumber(false)` → `0`, giving `[] == 0`. Now an object meets a number, so the object goes through `ToPrimitive` with the default hint: `[].toString()` is `""` (join of zero elements), giving `"" == 0`. A string meets a number, so `ToNumber("")` → `0`, giving `0 == 0` → `true`. The full chain is `[]` → `""` → `0`. `[] === false` is `false` because strict equality sees `Object` vs `Boolean` and stops before any conversion.

### The Rule

When `==` meets an object operand, it calls `ToPrimitive` (for arrays, effectively `join`/`toString`) before any numeric comparison. An empty array becomes `""`, which numeric-converts to `0` — the same endpoint as `false`.

### How to Rewrite It Safely

Never compare arrays with `==` in real code; check what you mean instead — length (`arr.length === 0`) or explicit string form (`String(arr) === ""`).

### Takeaway

`[] == false` is `true` through a three-step path: `false` → `0`, `[]` → `""`, `""` → `0`. Each step is mechanical, not magical.

## `[] == ![]` is `true` because both sides reach the empty string

`Difficulty: Medium` `Probability: Medium`

### The Code

```javascript
console.log([] == ![]);
```

### Output

```text
true
```

### Explanation

Evaluate both sides. `![]` applies logical NOT: an array is an object, and all objects are truthy, so `![]` is `false`. The comparison is now `[] == false` — the previous question. Mechanically: the boolean converts via `ToNumber(false)` → `0`, giving `[] == 0`. The object converts via `ToPrimitive([])` → `""` (`join` of no elements), giving `"" == 0`. The string converts via `ToNumber("")` → `0`, giving `0 == 0` → `true`. Both operands independently collapse to the same endpoint: the left via `""`, the right via `0`.

### The Rule

`!` tests truthiness (objects are always truthy), while `==` tests coerced equality. The two operators use different conversions, which is why `[]` is truthy yet `[] == false` holds: truthiness never stringifies the array, but `==` does.

### How to Rewrite It Safely

This demonstrates the interaction, not a pattern to use. The dangerous variation is `if (x == false)` on a possibly-array value — write `if (x.length === 0)` or `if (!x.length)` so emptiness is tested directly.

### Takeaway

`![]` is `false` (objects are truthy), then `[] == false` follows the `[] → "" → 0` path. Truthiness and loose equality are two different conversions — do not mix them.

## `+` stringifies while `-` and `*` numeric-convert

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log("5" + 2);
console.log("5" - 2);
console.log("5" * 2);
```

### Output

```text
52
3
10
```

### Explanation

`+` is overloaded: if either operand is a string after `ToPrimitive`, it performs string concatenation. `"5" + 2` becomes `"5" + "2"` → `"52"`. `-` and `*` have no string branch — they always apply `ToNumber` to both operands. `ToNumber("5")` is `5`, so `"5" - 2` is `5 - 2` → `3`, and `"5" * 2` is `5 * 2` → `10`.

### The Rule

Binary `+` prefers strings: string-plus-anything concatenates. Every other arithmetic operator (`-`, `*`, `/`, `%`) converts both sides with `ToNumber` first, so numeric strings behave as numbers there.

### How to Rewrite It Safely

This is correct-operator behaviour, not a bug. The variation that breaks code is an unintended string operand reaching `+` (e.g. from an input field), silently switching addition to concatenation — convert at the boundary with `Number(x)`.

### Takeaway

`+` concatenates when either side is a string; `-` and `*` always compute numerically. The operator decides the conversion, not the value.

## Booleans numeric-convert to `1` and `0` in addition

`Difficulty: Easy` `Probability: Medium`

### The Code

```javascript
console.log(true + true);
console.log(true + false);
```

### Output

```text
2
1
```

### Explanation

Neither operand is a string, so `+` takes the numeric branch and applies `ToNumber` to both sides. `ToNumber(true)` is `1` and `ToNumber(false)` is `0`. Hence `true + true` is `1 + 1` → `2`, and `true + false` is `1 + 0` → `1`.

### The Rule

In a numeric context, `true` converts to `1` and `false` converts to `0`. This is the same `ToNumber`-on-booleans step that drives `==` comparisons against booleans.

### How to Rewrite It Safely

This demonstrates the conversion. Code that sums booleans (`count += flag`) works but hides intent — prefer an explicit conversion (`count += Number(flag)` or a conditional) so readers see the `1`/`0` mapping.

### Takeaway

Outside string concatenation, `true` counts as `1` and `false` as `0` because `+` numeric-converts both operands.

## `null` becomes `0` but `undefined` becomes `NaN`

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
console.log(null + 1);
console.log(undefined + 1);
```

### Output

```text
1
NaN
```

### Explanation

Neither operand is a string, so `+` numeric-converts both. `ToNumber(null)` is `0` (empty/missing value defaults to zero), so `null + 1` is `0 + 1` → `1`. `ToNumber(undefined)` is `NaN` (no value, not even zero), so `undefined + 1` is `NaN + 1` → `NaN`, since any arithmetic with `NaN` stays `NaN`.

### The Rule

`null` and `undefined` diverge under `ToNumber`: `null` → `0`, `undefined` → `NaN`. That is also why `Number(null)` is `0` while `Number(undefined)` is `NaN`, and why missing-object access that yields `undefined` poisons arithmetic.

### How to Rewrite It Safely

Default at the boundary instead of relying on this split: `value ?? 0` converts both `null` and `undefined` to `0` explicitly, so later `+ 1` cannot produce a surprise `NaN`.

### Takeaway

`null` numeric-converts to `0`; `undefined` numeric-converts to `NaN`. Arithmetic on a possibly-`undefined` value silently becomes `NaN`.

## Array and object `+` goes through strings, and statement position changes parsing

`Difficulty: Hard` `Probability: Medium`

### The Code

```javascript
console.log([] + []);
console.log([] + {});
console.log({} + []);
```

### Output

```text

[object Object]
[object Object]
```

### Explanation

First, `[] + []`: neither operand is already a string, but both are objects, so each goes through `ToPrimitive` with the default hint. `[].toString()` joins zero elements → `""`. With two strings, `+` concatenates: `"" + ""` → `""` (the first output line is an empty string). Second, `[] + {}`: `ToPrimitive([])` → `""` as before; `ToPrimitive({})` calls `toString()` on a plain object → `"[object Object]"`. Concatenation gives `"" + "[object Object]"` → `"[object Object]"`. Third, `({} + [])` as an expression follows the same path: `"[object Object]" + ""` → `"[object Object]"`. The parsing caveat: at statement start, `{}` is read as a block, not an object literal, so a bare line `{} + []` parses as an empty block followed by the unary expression `+[]`, which is `ToNumber("")` → `0`. That `0` is why consoles sometimes show `0` for `{} + []` — it is a different parse of different code, not a different coercion rule.

### The Rule

`+` on objects stringifies each side via `ToPrimitive` (arrays join, plain objects produce `"[object Object]"`) and then concatenates. Separately, JavaScript parses `{}` in statement position as a block and in expression position as an object literal, so `{} + []` has two meanings depending on where it appears — always disambiguate with parentheses.

### How to Rewrite It Safely

Nothing here is a pattern to use — implicit object-to-string conversion is almost never what code wants. Convert explicitly (`String(x)`, `Number(x)`) and wrap object literals in parentheses (`({}) + []`) whenever an object starts an expression, so the parse is unambiguous.

### Takeaway

`+` on arrays and objects concatenates their `ToPrimitive` string forms. For a leading `{}`, position decides the parse — block versus object — so parenthesise and convert explicitly.

