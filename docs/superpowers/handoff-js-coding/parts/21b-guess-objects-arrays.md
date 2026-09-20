## `map` with a braced arrow and no `return` collects `undefined`

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
const result = [1, 2, 3].map((x) => {
  x * 2;
});
console.log(result);
```

### Output

```text
[ undefined, undefined, undefined ]
```

### Explanation

`map` builds a new array by storing whatever the callback *returns* at each index — it does not inspect the callback body. Here the arrow uses a block body (`{ ... }`), and a block-bodied arrow returns `undefined` unless a `return` statement executes. So: index 0 computes `1 * 2` then discards it and returns `undefined`; index 1 does the same; index 2 does the same. `map` has no filtering behaviour, so all three slots are filled and the result is `[undefined, undefined, undefined]`.

### The Rule

Arrow functions have two bodies with different return contracts: a concise body (`(x) => x * 2`) implicitly returns its expression value, while a block body (`(x) => { x * 2; }`) returns `undefined` unless an explicit `return` runs. `map` records the return value verbatim — including `undefined` — at every visited index.

### How to Rewrite It Safely

Either use the concise body or add the missing `return`. The dangerous variation is the same bug inside `filter` or `find`, where returning `undefined` silently filters everything out instead of producing `undefined` entries.

```javascript
console.log([1, 2, 3].map((x) => x * 2)); // => [ 2, 4, 6 ]
console.log(
  [1, 2, 3].map((x) => {
    return x * 2;
  })
); // => [ 2, 4, 6 ]
```

### Takeaway

Braces on an arrow turn off the implicit return; `map` keeps whatever the callback returns, so a missing `return` maps everything to `undefined`.

## `filter(x => x)` keeps only truthy values

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
const values = [0, 1, "", "hi", null, undefined, NaN, [], {}];
console.log(values.filter((x) => x));
```

### Output

```text
[ 1, 'hi', [], {} ]
```

### Explanation

`filter` keeps an element when the callback's return value is *truthy* — it applies `ToBoolean` to the result, it does not require the callback to return `true`. Tracing each element: `0`, `""`, `null`, `undefined`, and `NaN` are falsy and dropped; `1` and `"hi"` are truthy and kept. Crucially, `[]` and `{}` are *objects*, and every object is truthy, so both survive even though they look "empty". The survivors, in original order, are `[1, 'hi', [], {}]`.

### The Rule

There are exactly six falsy values — `false`, `0` (and `-0`), `""`, `null`, `undefined`, `NaN` — plus `0n`. Everything else is truthy, including every object and array regardless of contents. `filter` tests `ToBoolean(callbackResult)`, so an identity callback partitions an array into truthy survivors and falsy rejects.

### How to Rewrite It Safely

This code is the idiom itself — `filter(Boolean)` is the standard compact-and-clean form. The variation that breaks it is expecting `[]` or `{}` to be dropped; handle emptiness explicitly instead.

```javascript
console.log(values.filter(Boolean)); // same result
console.log([[], {}, ""].filter((x) => x.length > 0)); // drops empties by intent
```

### Takeaway

`filter` keeps truthy callback results, and all objects are truthy — identity filtering removes the six falsy values but never removes `[]` or `{}`.

## `["1", "2", "3"].map(parseInt)` passes the index as the radix

`Difficulty: Medium` `Probability: Very High`

### The Code

```javascript
console.log(["1", "2", "3"].map(parseInt));
```

### Output

```text
[ 1, NaN, NaN ]
```

### Explanation

`map` calls its callback with **three** arguments — `(value, index, array)` — and `parseInt` accepts **two** meaningful parameters — `(string, radix)`. So the index slides into the radix slot: `parseInt("1", 0)` → radix `0` means "default to base 10", giving `1`; `parseInt("2", 1)` → radix `1` is not a valid base (valid range is 2–36), giving `NaN`; `parseInt("3", 2)` → binary `"3"` contains a digit illegal in base 2, giving `NaN`. Final result: `[1, NaN, NaN]`.

### The Rule

Array iterators always pass `(value, index, array)` to the callback, even when the callback was designed for fewer arguments. Passing a multi-parameter function like `parseInt` directly as a callback lets the extra iterator arguments leak into its later parameters — here, the index becomes the radix.

### How to Rewrite It Safely

Wrap the function so only the value is forwarded. The same trap applies to any callback whose later parameters accept numbers (`parseFloat` is safe only because it ignores its second argument — do not rely on that).

```javascript
console.log(["1", "2", "3"].map((s) => parseInt(s, 10))); // => [ 1, 2, 3 ]
console.log(["1", "2", "3"].map(Number)); // => [ 1, 2, 3 ]
```

### Takeaway

Never pass `parseInt` bare to `map` — the iterator's index becomes the radix; wrap it as `(s) => parseInt(s, 10)` or use `Number`.

## `reduce` without an initial value starts from the first element — and throws on empty

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
console.log([1, 2, 3].reduce((acc, x) => acc + x));
console.log([].reduce((acc, x) => acc + x));
```

### Output

```text
6
TypeError: Reduce of empty array with no initial value
```

### Explanation

`reduce` has two modes. **With** an initial value, the accumulator starts there and every element is visited. **Without** one, the accumulator starts as element 0 and iteration begins at element 1 — so `[1, 2, 3]` computes `((1 + 2) + 3) = 6` with only two callback calls. For `[]` there is no element 0 to seed the accumulator and nothing to return, so instead of yielding `undefined` the spec requires a `TypeError`.

### The Rule

`reduce` without an initial value seeds the accumulator from index 0 and starts visiting at index 1; a single-element array returns that element without ever calling the callback, and an empty array throws `TypeError` because no seed exists. Always pass an initial value unless non-emptiness is guaranteed.

### How to Rewrite It Safely

Provide the initial value explicitly — it also pins the accumulator's type for the empty case instead of letting the first element's type leak in.

```javascript
console.log([1, 2, 3].reduce((acc, x) => acc + x, 0)); // => 6
console.log([].reduce((acc, x) => acc + x, 0)); // => 0, no throw
```

### Takeaway

No initial value means "seed from element 0" — which works until the array is empty, when `reduce` throws; default to always passing one.

## Default `sort` compares strings, not numbers

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
const nums = [1, 10, 2, 20];
nums.sort();
console.log(nums);
```

### Output

```text
[ 1, 10, 2, 20 ]
```

### Explanation

With no comparator, `sort` converts each element to a string and orders by UTF-16 code-unit comparison, left to right. Comparing `"10"` and `"2"`: the first characters decide it — `"1"` (code unit 49) is less than `"2"` (code unit 50) — so `"10"` sorts *before* `"2"` without ever looking at the `"0"`. The resulting string order is `"1" < "10" < "2" < "20"`, and since `sort` mutates in place, `nums` itself becomes `[1, 10, 2, 20]`.

### The Rule

`Array.prototype.sort` without a comparator sorts the string coercions of the elements by code-unit order — effectively alphabetical, not numeric. Numbers, negative signs, and decimals all sort as text unless a comparator like `(a, b) => a - b` is supplied.

### How to Rewrite It Safely

Always pass a comparator for numbers. The dangerous variation is "it worked in my test" — small single-digit arrays sort identically under both orders, hiding the bug until a multi-digit value appears.

```javascript
const nums = [1, 10, 2, 20];
nums.sort((a, b) => a - b);
console.log(nums); // => [ 1, 2, 10, 20 ]
```

### Takeaway

Bare `sort()` is string sort — any numeric array needs a comparator, or `10` will always land before `2`.

## A numeric comparator makes `sort` order by value

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
const nums = [1, 10, 2, 20];
nums.sort((a, b) => a - b);
console.log(nums);
nums.sort((a, b) => b - a);
console.log(nums);
```

### Output

```text
[ 1, 2, 10, 20 ]
[ 20, 10, 2, 1 ]
```

### Explanation

A comparator replaces string comparison with a numeric contract: return negative to place `a` first, positive to place `b` first, zero to keep their relative order. With `(a, b) => a - b`, a smaller `a` yields a negative difference, so smaller values sink to the front — ascending `[1, 2, 10, 20]`. With `(a, b) => b - a` the sign flips: a smaller `a` yields a positive difference, pushing smaller values to the back — descending `[20, 10, 2, 1]`. Both calls mutate `nums` in place and return it.

### The Rule

`sort(compareFn)` orders by the sign of the comparator's return: negative means `a` first, positive means `b` first, zero means equivalent (stable sort preserves their original order). `(a, b) => a - b` is ascending, `(a, b) => b - a` is descending, for finite numbers.

### How to Rewrite It Safely

This is the correct pattern for numbers. The variation that breaks it is returning a boolean (`(a, b) => a > b`), which coerces to `1`/`0` — never negative — so `a`-first is inexpressible and the order is wrong; always return a signed number.

```javascript
const users = [{ age: 30 }, { age: 20 }];
users.sort((a, b) => a.age - b.age); // sort by a derived key, same contract
console.log(users); // => [ { age: 20 }, { age: 30 } ]
```

### Takeaway

The comparator's return sign is the order — negative `a`-first, positive `b`-first — so `a - b` ascends and `b - a` descends.

## `Set` dedupes primitives, and spreading it gives a unique array

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
const unique = [...new Set([1, 2, 2, 3, 1])];
console.log(unique);
console.log(new Set([1, 2, 2, 3, 1]).size);
```

### Output

```text
[ 1, 2, 3 ]
3
```

### Explanation

A `Set` holds each value once, judged by `SameValueZero` equality (`NaN` equals `NaN`; `+0` and `-0` count as equal). Inserting `1, 2, 2, 3, 1` stores `1`, then `2`, then ignores the second `2`, stores `3`, and ignores the second `1` — three members in first-insertion order. Spreading a `Set` iterates it in that insertion order into a new array, so `unique` is `[1, 2, 3]`, and the `Set`'s own `size` is `3`.

### The Rule

`Set` keeps one copy of each `SameValueZero`-equal value in insertion order, and it is iterable — so `[...new Set(arr)]` is the canonical primitive dedupe. It compares by value for primitives but by identity for objects: two distinct `{}` literals are two different members.

### How to Rewrite It Safely

This snippet is the safe idiom for primitives. The variation that breaks it is deduping objects by content — `Set` will keep every distinct reference, so dedupe by a key instead.

```javascript
console.log([...new Set([1, 2, 2, 3, 1])]); // => [ 1, 2, 3 ]
const byId = [...new Map([{ id: 1 }, { id: 1 }].map((o) => [o.id, o])).values()];
console.log(byId); // => [ { id: 1 } ] — dedupe objects by key
```

### Takeaway

`[...new Set(arr)]` dedupes by `SameValueZero` in insertion order — exact for primitives, useless for "equal-looking" objects, which are distinct identities.

## A `Map` keeps two `{}` keys distinct, where a plain object collides them

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const keyA = {};
const keyB = {};

const plain = {};
plain[keyA] = "A";
plain[keyB] = "B";
console.log(plain);

const map = new Map();
map.set(keyA, "A");
map.set(keyB, "B");
console.log(map.size);
console.log(map.get(keyA));
console.log(map.get(keyB));
```

### Output

```text
{ '[object Object]': 'B' }
2
A
B
```

### Explanation

Plain-object keys must be strings or symbols, so each `{}` is coerced with `toString()` to the same key `"[object Object]"` — the second assignment overwrites the first, leaving one property holding `"B"`. `Map` keys have no such coercion: entries are matched with `SameValueZero` on the original values, so `keyA` and `keyB` are different identities and occupy two separate slots. `size` is therefore `2`, and each `get` retrieves its own value.

### The Rule

Object property keys collapse to strings (`ToPropertyKey`), so all plain objects share the key `"[object Object]"` — contrast Q46's collision. `Map` keys keep their identity and are compared with `SameValueZero`, so distinct objects, `NaN` (`NaN` equals itself here), and mixed-type keys like `1` vs `"1"` behave as separate, retrievable entries.

### How to Rewrite It Safely

Use a `Map` (or `WeakMap` for garbage-collectable object keys) whenever keys are objects. The variation that reintroduces the collision is serialising the key yourself (`map.set(JSON.stringify(key), v)`) — two structurally equal objects then collide again, which is correct only if key-by-content is what you want.

```javascript
const cache = new Map();
function cached(obj) {
  if (!cache.has(obj)) cache.set(obj, compute(obj));
  return cache.get(obj);
}
```

### Takeaway

Plain objects stringify their keys (every `{}` becomes `"[object Object]"`); `Map` compares keys by identity, so distinct objects stay distinct.
