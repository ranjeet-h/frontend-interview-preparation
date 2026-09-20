## `typeof null` is `"object"`, and arrays are objects too

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log(typeof null);
console.log(typeof undefined);
console.log(typeof []);
console.log(typeof {});
console.log(typeof function () {});
```

### Output

```text
object
undefined
object
object
function
```

### Explanation

Each `typeof` evaluates its operand's type tag and returns a string. `null` carries the legacy object type tag, so the first line prints `"object"` even though `null` is a primitive with no properties. `undefined` has its own tag and prints `"undefined"`. Arrays are ordinary objects with extra array behaviour (`length`, indexed elements), so `typeof []` prints `"object"` — `typeof` never reports `"array"`. Plain objects print `"object"` as expected. Functions are the one callable exception: the operator special-cases callable objects and prints `"function"`, even though functions are objects underneath.

### The Rule

`typeof` returns one of eight strings (`"undefined"`, `"boolean"`, `"number"`, `"bigint"`, `"string"`, `"symbol"`, `"object"`, `"function"`). Two historical quirks are permanent: `typeof null === "object"`, and every non-callable object — arrays, plain objects, dates, regexes — reports `"object"`. Only callable values report `"function"`. To distinguish further, use `Array.isArray` for arrays and `value === null` for null.

### How to Rewrite It Safely

This tests the correct mental model. The safe pattern is a precise type guard rather than bare `typeof`:

```javascript
function getType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

console.log(getType(null)); // => "null"
console.log(getType([])); // => "array"
```

The variation that breaks is assuming `typeof x === "object"` means a usable object — it is also true for `null`, so guard against `null` before touching properties.

### Takeaway

`typeof` answers "which broad slot does this value sit in", not "what exactly is it" — `null` and arrays both land in `"object"`, and only functions get their own label.

## `typeof NaN` is `"number"` — NaN is a numeric value

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log(typeof NaN);
console.log(typeof Infinity);
console.log(typeof 42);
```

### Output

```text
number
number
number
```

### Explanation

`NaN` stands for "Not-a-Number", but the name describes how the value was produced (a failed numeric operation), not its type. It is a value of the Number type — specifically the IEEE 754 "not a number" bit pattern — so `typeof NaN` prints `"number"`. `Infinity` is likewise a Number value (the overflow bit pattern), as is `42`. All three lines therefore print `"number"`. This is why `typeof` can never be used to detect `NaN`: it is deliberately a member of the type it claims not to be.

### The Rule

`NaN` and `Infinity` are both values of type Number. `NaN` means "this slot holds a Number, but no real numeric value survived the computation"; `Infinity` means "the magnitude overflowed". Type and value-validity are separate questions, so detecting an invalid number requires a value check (`Number.isNaN`), never a type check.

### How to Rewrite It Safely

This demonstrates the correct model: never use `typeof` to test for `NaN`. Use the non-coercing check:

```javascript
console.log(Number.isNaN(NaN)); // => true
console.log(Number.isNaN(42)); // => false
```

The variation that breaks is `typeof x === "number"` as a validity guard — it passes for `NaN` and `Infinity`, so range or finiteness checks (`Number.isFinite`) belong wherever real arithmetic is required.

### Takeaway

`NaN` failing to be a number is a value problem, not a type problem — it is typed `"number"` because that is the slot it occupies.

## `NaN` never equals itself, but `Object.is` says otherwise

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
console.log(NaN === NaN);
console.log(Object.is(NaN, NaN));
console.log(Number.isNaN(NaN));
```

### Output

```text
false
true
true
```

### Explanation

Line 1 uses strict equality (`===`), which applies the Strict Equality Comparison algorithm: for Numbers, it returns `false` whenever either operand is `NaN`, without exception. So `NaN === NaN` is `false`. Line 2 uses `Object.is`, which applies the SameValue algorithm instead: SameValue special-cases `NaN` and returns `true` when both sides are `NaN`. Line 3 calls `Number.isNaN`, which returns `true` exactly when its argument is a Number value whose bit pattern is NaN — no coercion, so `NaN` passes and everything else fails.

### The Rule

JavaScript has two nearby comparisons. Strict equality (`===`) treats `NaN` as unequal to everything including itself, and treats `+0` as equal to `-0`. `Object.is` (SameValue) does the opposite on both points: `NaN` equals `NaN`, and `+0` does not equal `-0`. `Number.isNaN(x)` is effectively "is x a genuine NaN value", with no type coercion.

### How to Rewrite It Safely

This tests the correct model. To detect `NaN` safely, always use the non-coercing form:

```javascript
if (Number.isNaN(value)) {
  console.log("not a usable number");
}
```

The variation that breaks is `value === NaN`, which is `false` for every value including `NaN` itself — it can never detect anything.

### Takeaway

`===` answers "are these the same usable value" (`NaN` never is); `Object.is` answers "are these the identical bit-level value" (`NaN` is). Reach for `Number.isNaN` when you mean the question literally.

## `Number.isNaN` does not coerce, the global `isNaN` does

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
console.log(Number.isNaN("hello"));
console.log(isNaN("hello"));
console.log(Number.isNaN(NaN));
console.log(isNaN(NaN));
```

### Output

```text
false
true
true
true
```

### Explanation

`Number.isNaN` performs no conversion: it returns `true` only if the argument already is a Number value with the NaN bit pattern. The string `"hello"` is not a Number at all, so line 1 prints `false`. The legacy global `isNaN` coerces first — it applies `ToNumber` to its argument and then checks the result. `ToNumber("hello")` fails and yields `NaN`, so line 2 prints `true`. Lines 3 and 4 agree because `NaN` needs no coercion: both functions see a genuine NaN and print `true`.

### The Rule

The global `isNaN(x)` means "does `x` *become* NaN after numeric coercion" — any non-numeric string, `undefined`, or uncoercible object answers `true`. `Number.isNaN(x)` means "is `x` *already* the NaN value" — no coercion happens, so only a genuine `NaN` (of type Number) answers `true`. The global exists for history; the `Number.` static is the predicate to use.

### How to Rewrite It Safely

Prefer the non-coercing check everywhere, and convert explicitly when you mean to validate a string:

```javascript
const input = "hello";
console.log(Number.isNaN(Number(input))); // => true: explicit, visible coercion
```

The variation that breaks is `isNaN(value)` as an input validator — `isNaN("")` is `false` (empty string coerces to `0`) and `isNaN("  ")` is `false` too, so blank input silently passes as numeric.

### Takeaway

`Number.isNaN` asks what the value *is*; the global `isNaN` asks what the value *coerces to*. Implicit coercion in a test predicate is a bug source — coerce explicitly or not at all.

## `0.1 + 0.2` is not `0.3`

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log(0.1 + 0.2);
console.log(0.1 + 0.2 === 0.3);
```

### Output

```text
0.30000000000000004
false
```

### Explanation

JavaScript Numbers are IEEE 754 double-precision binary floats. Neither `0.1` nor `0.2` has an exact binary representation: the stored values are the closest doubles, each already off by ~1e-17. Adding those two approximations produces a third double, `0.30000000000000004`, which is the closest double to the true sum of the two stored inputs. The literal `0.3` parses to a *different* closest double (`0.29999999999999998898…`). Strict equality compares the two bit patterns exactly, finds them different, and returns `false`.

### The Rule

Decimal fractions that are not sums of powers of two (`0.1`, `0.2`, `0.3`) cannot be represented exactly in binary floating point. Every literal is rounded to the nearest double at parse time, and every operation rounds again. Equality on computed floats therefore compares accumulated rounding error, not mathematical truth — compare within an epsilon instead.

### How to Rewrite It Safely

Never compare computed floats with `===` in real code. Use an epsilon, or `Number.EPSILON` scaled to the magnitude:

```javascript
const sum = 0.1 + 0.2;
console.log(Math.abs(sum - 0.3) < Number.EPSILON); // => true
```

For money, the robust variation is to avoid floats entirely — count integer cents (`10 + 20 === 30`) and format on display.

### Takeaway

Floats approximate; `===` does not. Any equality test on computed decimals must tolerate the rounding the binary format guarantees.

## `+` associates left, so string position decides everything

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log(1 + "2" + 3);
console.log(1 + 2 + "3");
```

### Output

```text
123
33
```

### Explanation

`+` is left-associative: each expression groups as `(a + b) + c`, evaluated left to right, and each `+` independently decides between numeric addition and string concatenation. In `1 + "2" + 3`, the first operation is `1 + "2"` — one operand is a string, so `1` converts to `"1"` and the result is the string `"12"`. The second operation is `"12" + 3` — again a string operand, so `3` converts and the result is `"123"`. In `1 + 2 + "3"`, the first operation is `1 + 2` with two numbers, so plain addition gives the number `3`. Only then does `"3"` appear: `3 + "3"` has a string operand, so it concatenates to `"33"`.

### The Rule

Every binary `+` asks one question: "is either operand a string (or an object that becomes one)?" If yes, both sides convert with `ToString` and concatenate; otherwise both convert with `ToNumber` and add. Because evaluation is strictly left to right, the *position* of the first string operand determines which operations add and which concatenate.

### How to Rewrite It Safely

This demonstrates the correct model, not broken code. The dangerous variation is mixing user input (always a string) into arithmetic — parenthesise or convert explicitly:

```javascript
const input = "2";
console.log(1 + Number(input) + 3); // => 6: numeric intent is explicit
console.log(`${1 + 3}${input}`); // => "42": string intent is explicit
```

Reading `a + b + c` without checking operand types left to right is the review smell.

### Takeaway

`+` re-decides add-vs-concatenate at every step, left to right — find the first string operand and everything from that point on concatenates.

## Unary `+` coerces anything to a number

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
console.log(+true);
console.log(+false);
console.log(+"");
console.log(+"123");
```

### Output

```text
1
0
0
123
```

### Explanation

Unary `+` is shorthand for `ToNumber(value)` — the same abstract operation the global `Number()` applies. `ToNumber(true)` is defined as `1` and `ToNumber(false)` as `0`, so the first two lines print `1` and `0`. `ToNumber("")` is the special-cased empty-string rule: whitespace-only and empty strings convert to `0`, so line 3 prints `0`. `ToNumber("123")` parses the numeric literal grammar, succeeds, and yields the number `123`. No arithmetic happens in any line — the operator exists purely to run this conversion.

### The Rule

Unary `+` converts its single operand with `ToNumber`: `true` → `1`, `false` → `0`, `""` (and whitespace-only strings) → `0`, `null` → `0`, numeric strings → their number, non-numeric strings and `undefined` → `NaN`. It is exactly `Number(x)` without the call overhead, and it throws for nothing — unconvertible input yields `NaN`, and `BigInt` mixing aside it never throws.

### How to Rewrite It Safely

This demonstrates the correct model. Prefer `Number(x)` in shared code for readability — unary `+` is idiomatic but cryptic to newcomers:

```javascript
console.log(Number(true)); // => 1
console.log(Number("")); // => 0
```

The variation that breaks is relying on `+value` to validate input: `+""` is `0` and `+"  "` is `0`, so empty form fields silently become zero instead of failing validation — check for emptiness first.

### Takeaway

Unary `+` is `ToNumber` in operator form — memorise its four constants (`true`→`1`, `false`→`0`, `""`→`0`, `null`→`0`) and everything else follows the numeric-literal grammar or becomes `NaN`.

## Plain objects stringify their keys, so two objects collide

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const a = {};
const b = {};
const store = {};
store[a] = "A";
store[b] = "B";
console.log(store[a]);
console.log(Object.keys(store).length);

const map = new Map();
map.set(a, "A");
map.set(b, "B");
console.log(map.get(a));
console.log(map.size);
```

### Output

```text
B
1
A
2
```

### Explanation

Plain-object property keys can only be strings or symbols. When `store[a]` uses an object as a key, the engine applies `ToPropertyKey`, which calls `a.toString()` — the default `Object.prototype.toString` returns `"[object Object]"`. So `store[a] = "A"` creates the key `"[object Object]"`. Then `store[b] = "B"` stringifies `b` to the identical `"[object Object]"` and overwrites the same slot. Reading `store[a]` returns `"B"`, and the store holds exactly one key. A `Map` has no such restriction: it compares keys with SameValueZero without stringifying, and `a` and `b` are different references, so both entries survive — `map.get(a)` is `"A"` and `map.size` is `2`.

### The Rule

Object keys coerce via `ToPropertyKey` (objects → `toString` → usually `"[object Object]"`), so distinct objects collide unless they define distinct `toString`/`Symbol.toPrimitive` results. `Map` keys keep object identity: lookup uses SameValueZero on the reference itself, so two structurally identical but referentially distinct objects never collide — and unlike `===`, SameValueZero also treats `NaN` keys as equal to each other.

### How to Rewrite It Safely

Use a `Map` (or `WeakMap` when the keys should not keep values alive) whenever keys are objects:

```javascript
const cache = new Map();
function getUser(profile) {
  if (!cache.has(profile)) cache.set(profile, fetchUser(profile.id));
  return cache.get(profile);
}
```

The variation that breaks is `JSON.stringify(obj)` as a cache key — key order, `undefined` values, and cycles all make it unreliable compared with identity-keyed Maps.

### Takeaway

An object used as a plain-object key stops being itself and becomes the string `"[object Object]"` — identity-keyed storage means `Map`, full stop.
