## Integer-like keys sort first in `Object.keys`

`Difficulty: Easy` `Probability: Medium`

### The Code

```javascript
const obj = { 2: "two", 1: "one", b: "bee", a: "ay" };
console.log(Object.keys(obj));
```

### Output

```text
[ '1', '2', 'b', 'a' ]
```

### Explanation

`Object.keys` does not return keys in insertion order for all keys. Property keys are split into two groups. First, integer-like keys (canonical numeric strings such as `"1"`, `"2"`) are listed in ascending numeric order, regardless of insertion order. Then string keys follow in insertion order. Here `"2"` was inserted before `"1"`, but `"1"` sorts first. `"b"` and `"a"` keep insertion order after them. Symbols, if present, would come last and are excluded by `Object.keys` anyway.

### The Rule

Ordinary object property ordering is: integer indices in ascending numeric order, then string keys in insertion order, then symbols in insertion order. `"01"` or `"1.5"` are not integer indices, so they stay in the string group.

### How to Rewrite It Safely

This code demonstrates correct ordering behaviour. The variation that breaks expectations is relying on insertion order for numeric-like keys, or using an object as an ordered map with integer keys. Use a `Map` when insertion order must be preserved exactly.

### Takeaway

Integer-like keys always sort numerically first; only non-integer string keys follow insertion order.

## Destructuring defaults apply to `undefined`

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
function getA({ a = 10 } = {}) {
  return a;
}
console.log(getA({ a: undefined }));
```

### Output

```text
10
```

### Explanation

Destructuring with a default works like: read property `a` from the argument, then if the result is exactly `undefined`, substitute `10`. The argument `{ a: undefined }` has the property present, but its value is `undefined`, so the default kicks in and the function returns `10`. The outer `= {}` default is not used here because an argument was supplied; it only applies when the whole parameter is `undefined`.

### The Rule

Destructuring defaults (like parameter defaults) trigger only on `undefined`, never on `null`, `0`, `""`, or `false`. A missing property and an explicit `undefined` behave identically.

### How to Rewrite It Safely

This demonstrates the correct mental model. The breaking variation is passing `null` and expecting the default; guard that case explicitly with `??` if both should map to the default.

### Takeaway

A destructuring default means "use this when the value is `undefined`", not "when it is falsy or null".

## Destructuring defaults ignore `null`

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
function getA({ a = 10 } = {}) {
  return a;
}
console.log(getA({ a: null }));
```

### Output

```text
null
```

### Explanation

The parameter receives `{ a: null }`, so `a` binds to `null`. The default `= 10` is checked with a strict "is it `undefined`?" test. `null` is not `undefined`, so the default is skipped and the function returns `null`. This is the direct counterpart to the previous question: `undefined` triggers the default, `null` passes through untouched.

### The Rule

`null` is a deliberate empty value, not a missing value. Defaults, optional chaining short-circuits aside, treat only `undefined` as missing; `??` treats both `null` and `undefined` as missing, which is why `value ?? 10` differs from destructuring `= 10`.

### How to Rewrite It Safely

If `null` should also fall back to `10`, normalise after destructuring: `return a ?? 10;`. Otherwise keep the code as is and document that callers must pass `undefined` (or omit the key) to get the default.

### Takeaway

Defaults fire on `undefined` only; `null` is a real value that survives destructuring defaults.

## An elision hole skips one element when destructuring

`Difficulty: Easy` `Probability: Medium`

### The Code

```javascript
const [a, , b] = [1, 2, 3];
console.log(a, b);
```

### Output

```text
1 3
```

### Explanation

Array destructuring binds by position using the iterator. Pattern position 0 binds `1` to `a`. Position 1 has an elision (the empty slot between the commas), which advances the iterator past `2` without binding it. Position 2 binds `3` to `b`. The middle element is consumed and discarded, so only `1` and `3` print.

### The Rule

Each comma in an array pattern consumes one element; an elision consumes one without creating a binding. This is positional skipping, unrelated to holes in the source array.

### How to Rewrite It Safely

This demonstrates the idiom for skipping. The variation that breaks it is assuming the skipped value is gone from the array — it is not; the source array is unchanged. Use named indices or slicing if the intent is unclear to readers.

### Takeaway

A bare comma in a destructuring pattern skips exactly one element by position.

## Parameter defaults fire on missing and `undefined`, not `null`

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
function test(x = 10) {
  return x;
}
console.log(test());
console.log(test(undefined));
console.log(test(null));
```

### Output

```text
10
10
null
```

### Explanation

Each call binds `x` separately. `test()` supplies no argument, so `x` is `undefined` and the default `10` applies. `test(undefined)` passes `undefined` explicitly, which is the same missing signal, so the default applies again. `test(null)` passes `null`, a concrete value, so the default is skipped and `null` is returned.

### The Rule

A default parameter evaluates only when the corresponding argument is `undefined` (including absent). It runs at call time, left to right, and may reference earlier parameters.

### How to Rewrite It Safely

This is the correct model to internalise. The dangerous variation is `test(null)` silently propagating `null` downstream; if both nullish values should default, write `function test(x) { x ??= 10; ... }` instead.

### Takeaway

No argument and `undefined` mean "missing, use the default"; `null` means "present, keep it".

## Spreading an array makes an independent top-level copy

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
const a = [1, 2, 3];
const b = [...a];
b.push(4);
console.log(a);
console.log(b);
```

### Output

```text
[ 1, 2, 3 ]
[ 1, 2, 3, 4 ]
```

### Explanation

`[...a]` iterates `a` and writes each element into a fresh array. `a` and `b` are then two distinct array objects holding the same three primitive values. `b.push(4)` mutates only `b` (and returns its new length, ignored here). Logging shows `a` still has three elements while `b` has four.

### The Rule

Spread into an array literal performs a shallow copy: a new outer container, with each element copied by value (primitives) or by reference (objects). Structural mutations to one container never affect the other.

### How to Rewrite It Safely

Spread is the safe way to duplicate a flat array before mutating it. The variation that breaks it is nested objects: element-level mutation of a shared object is still visible through both arrays.

### Takeaway

Spread copies the list, so pushing to the copy leaves the original untouched.

## Spread copies share nested object references

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const a = { x: { value: 1 } };
const b = { ...a };
b.x.value = 2;
console.log(a.x.value);
```

### Output

```text
2
```

### Explanation

`{ ...a }` creates a new outer object, but the copy is shallow. Property `x` is an object, so only its reference is copied: `a.x` and `b.x` point at the same inner object. Assigning `b.x.value = 2` mutates that shared inner object in place (it does not reassign `b.x`). Reading `a.x.value` therefore observes `2`.

### The Rule

Object spread copies own enumerable properties one level deep. Nested objects are aliased, not cloned. Reassigning `b.x = { value: 2 }` would diverge, but mutating `b.x.value` affects both sides.

### How to Rewrite It Safely

For a genuinely independent nested copy, deep-clone: `structuredClone(a)`. Keep shallow spread only when nested sharing is intended or nested values are primitives.

### Takeaway

Shallow spread clones the shell and shares the contents; mutating a nested object mutates it for every alias.

## `delete` removes an object property and returns `true`

`Difficulty: Easy` `Probability: Medium`

### The Code

```javascript
const obj = { a: 1, b: 2 };
console.log(delete obj.a);
console.log(obj.a);
```

### Output

```text
true
undefined
```

### Explanation

`delete obj.a` removes the own configurable property `a` from the object and evaluates to `true`. The object now holds only `b`. Reading `obj.a` afterwards is an ordinary missing-property read, which yields `undefined` rather than throwing.

### The Rule

On a configurable own property, `delete` removes it and returns `true`; subsequent reads give `undefined`. It returns `false` only in sloppy mode for non-configurable properties (and throws in strict mode).

### How to Rewrite It Safely

This demonstrates the intended use. The variation that breaks it is using `delete` to "clear" a value while keeping the key — use assignment (`obj.a = undefined`) for that, since `delete` also removes the key from `Object.keys` and can deoptimise hot objects.

### Takeaway

`delete obj.key` removes the key itself and reports success; the property then reads as `undefined`.

## `delete` on an array element leaves a hole and keeps `length`

`Difficulty: Medium` `Probability: Medium`

### The Code

```javascript
const arr = [1, 2, 3];
console.log(delete arr[1]);
console.log(arr);
console.log(arr.length);
```

### Output

```text
true
[ 1, <1 empty item>, 3 ]
3
```

### Explanation

Arrays are objects with a magical `length`. `delete arr[1]` removes the property `"1"` and returns `true`, but unlike `splice` it does not shift later elements or update `length`. Index `1` becomes a hole (`1 in arr` is now `false`), index `2` still holds `3`, and `length` stays `3`. Console output shows the hole as `<1 empty item>` (Node formatting; browsers may show `empty`).

### The Rule

`delete` on an array index unbinds that slot without reindexing; `length` is unchanged. Iteration methods like `map` skip the hole while `for` loops and index reads see `undefined` there.

### How to Rewrite It Safely

To remove an element and close the gap, use `arr.splice(1, 1)`. Reserve `delete` for turning a slot into a deliberate hole, which is almost never what application code wants.

### Takeaway

Never `delete` array elements to shrink an array; it empties the slot but leaves `length` and positions intact.

## `push` mutates the array and returns the new length

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
const arr = [1, 2, 3];
console.log(arr.push(4));
console.log(arr);
```

### Output

```text
4
[ 1, 2, 3, 4 ]
```

### Explanation

`push` appends its arguments in order to the end of the receiver, updates `length`, and returns the new `length` — not the array. Here appending `4` grows the array from length 3 to length 4, so the first log prints `4` and the second shows the mutated array `[1, 2, 3, 4]`.

### The Rule

`push(...items)` is in-place: it mutates the receiver, sets `length += items.length`, and evaluates to the new length. Ignoring the return value is normal when only the mutation matters.

### How to Rewrite It Safely

This demonstrates correct usage. The variation that breaks it is chaining `arr.push(4)` as if it returned the array; for an immutable append, use `[...arr, 4]` or `arr.concat(4)` instead.

### Takeaway

`push` answers "how long is the array now?", not "what is the array?".

## `splice` mutates the array and returns what it removed

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const arr = [1, 2, 3];
console.log(arr.splice(1, 1));
console.log(arr);
```

### Output

```text
[ 2 ]
[ 1, 3 ]
```

### Explanation

`splice(1, 1)` starts at index 1, removes one element, shifts everything after it down, and decrements `length`. The removed elements are collected into a new array, which is the return value: `[2]`. The receiver is left as `[1, 3]`. Start index, delete count, and any inserted items all operate in one pass, which is why `splice` doubles as delete, insert, and replace.

### The Rule

`splice` is the mutating Swiss-army operation: it changes the receiver in place and returns an array of removed elements (empty when only inserting). Omitted delete count removes everything from the start index onward.

### How to Rewrite It Safely

Use `splice` when in-place removal or insertion is intended. For a non-mutating equivalent, use `toSpliced` (modern) or `slice` plus spread to build a new array.

### Takeaway

`splice` edits the array in place and hands back the removed slice; check both the return value and the receiver.

## `slice` returns a copy and leaves the original intact

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
const arr = [1, 2, 3];
console.log(arr.slice(1));
console.log(arr);
```

### Output

```text
[ 2, 3 ]
[ 1, 2, 3 ]
```

### Explanation

`slice(1)` builds a new array containing elements from index 1 up to (excluding) the end, without touching the receiver. The returned copy `[2, 3]` prints first; the original `arr` still prints `[1, 2, 3]`. Negative indices count back from `length`, and `slice()` with no arguments copies the whole array shallowly.

### The Rule

`slice` is non-mutating and shallow: it selects a range by start/end and returns a fresh array. Like spread, nested objects in the range are still shared by reference.

### How to Rewrite It Safely

Prefer `slice` (or `toSpliced`/`toSorted` counterparts) whenever the original must survive. The breaking variation is confusing it with `splice`: one letter changes a pure copy into an in-place edit.

### Takeaway

`slice` copies a range out; `splice` edits in place — similar names, opposite mutation contracts.
