## `defineProperty` value lands but stays invisible to `Object.keys`

`Difficulty: Medium` `Probability: Medium`

### The Code

```javascript
const obj = {};
Object.defineProperty(obj, "score", { value: 10 });

console.log(obj.score);
console.log(Object.keys(obj));
console.log(Object.getOwnPropertyDescriptor(obj, "score"));
```

### Output

```text
10
[]
{ value: 10, writable: false, enumerable: false, configurable: false }
```

### Explanation

Statement 1 creates an empty object. Statement 2 defines `score` with only `value` supplied, so every missing flag defaults to `false`: the property exists and reads back `10`, but it is non-enumerable, non-writable, and non-configurable. `Object.keys` only lists **enumerable own string keys**, so it returns `[]` even though `obj.score` is `10`. The descriptor dump confirms all three flags are `false`.

### The Rule

`Object.defineProperty` defaults `writable`, `enumerable`, and `configurable` to `false` when they are omitted. Assignment-style creation (`obj.x = 1`) defaults all three to `true`. Enumerability controls `Object.keys`, `for...in`, `JSON.stringify`, and spread — not readability.

### How to Rewrite It Safely

Pass the flags explicitly whenever you use `defineProperty`:

```javascript
const obj = {};
Object.defineProperty(obj, "score", {
  value: 10,
  writable: true,
  enumerable: true,
  configurable: true,
});
console.log(Object.keys(obj)); // => ["score"]
```

### Takeaway

With `defineProperty`, unspecified flags are `false`: the value is there, but the property is read-only, hidden from enumeration, and locked against reconfiguration unless you opt in.

## `freeze` vs `seal` vs `preventExtensions`

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const frozen = Object.freeze({ x: 1 });
const sealed = Object.seal({ x: 1 });
const nonExt = Object.preventExtensions({ x: 1 });

frozen.x = 2; delete frozen.x; frozen.y = 3;
sealed.x = 2; delete sealed.x; sealed.y = 3;
nonExt.x = 2; delete nonExt.x; nonExt.y = 3;

console.log(frozen.x, "y" in frozen);
console.log(sealed.x, "y" in sealed);
console.log(nonExt.x, "y" in nonExt);
```

### Output

```text
1 false
2 false
undefined false
```

### Explanation

All three stop **adding** new properties (`y` never lands anywhere). Beyond that they differ. `frozen.x = 2` silently fails in sloppy mode, so `frozen.x` stays `1` and the delete fails too. `sealed.x = 2` succeeds because sealing keeps existing properties writable but makes them non-configurable, so the delete fails while the write sticks. `nonExt.x = 2` succeeds and the delete also succeeds because `preventExtensions` only blocks additions — existing properties stay fully configurable — leaving `nonExt.x` as `undefined`.

### The Rule

| Operation | `preventExtensions` | `seal` | `freeze` |
|---|---|---|---|
| Add property | blocked | blocked | blocked |
| Delete property | allowed | blocked | blocked |
| Modify existing value | allowed | allowed | blocked |
| Reconfigure descriptor | allowed | blocked | blocked |

All three are **shallow**: nested objects stay fully mutable. In strict mode, a blocked write or delete throws `TypeError` instead of failing silently.

### How to Rewrite It Safely

Pick the weakest lock that fits, and deep-freeze when nesting matters:

```javascript
function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}
```

### Takeaway

`preventExtensions` blocks adds, `seal` adds delete-protection, `freeze` adds write-protection — and none of them reach into nested objects.

## `new Array(3)` has length but nothing to map over

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
const arr = new Array(3);
console.log(arr.length);

let calls = 0;
const mapped = arr.map(() => {
  calls += 1;
  return 1;
});
console.log(calls);
console.log(mapped.length);
```

### Output

```text
3
0
3
```

### Explanation

`new Array(3)` creates an array with `length` set to `3` but **no elements** — three holes, not three `undefined` values. `map` visits only present indices (it checks `index in array`), so the callback runs zero times and `calls` stays `0`. The result keeps the same length (`3`) with the holes preserved.

### The Rule

A single-number `Array` constructor sets `length` without creating elements. Iterative methods (`map`, `filter`, `forEach`, `every`) skip holes; `length` alone does not mean "has values".

### How to Rewrite It Safely

Fill first when you want real elements to iterate:

```javascript
const arr = new Array(3).fill(0).map((_, i) => i + 1);
console.log(arr); // => [1, 2, 3]
```

### Takeaway

`length: 3` with three holes is an empty three-slot shelf, not three `undefined` items — iteration methods walk items, not length.

## Holes are not `undefined`: `Array(3)` vs `Array.from` vs explicit `undefined`

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const holes = new Array(3);
const filled = Array.from({ length: 3 });
const explicit = [undefined, undefined, undefined];

console.log(0 in holes, 0 in filled, 0 in explicit);
console.log(holes.map(() => "x").join("|"));
console.log(filled.map(() => "x").join("|"));
console.log(explicit.map(() => "x").join("|"));
```

### Output

```text
false true true
||
x|x|x
x|x|x
```

### Explanation

`new Array(3)` creates holes: index `0` does not exist, so `0 in holes` is `false` and `map` skips every slot, leaving three holes whose `join` is just the two separators (`"||"`). `Array.from({ length: 3 })` **writes** `undefined` into each slot, so index `0` exists (`true`) and `map` visits all three, producing `"x|x|x"`. The literal `[undefined, undefined, undefined]` also has three present (explicit-`undefined`) elements, behaving exactly like the `Array.from` version.

### The Rule

`in` tests **presence**, not value: holes fail the check, explicit `undefined` passes it. `Array.from` (and `fill`) materialise slots; the single-number `Array` constructor only sets `length`.

### How to Rewrite It Safely

When you need an iterable N-slot array, build present elements deliberately:

```javascript
const rows = Array.from({ length: 3 }, (_, i) => i);
console.log(rows); // => [0, 1, 2]
```

### Takeaway

A hole is the absence of an element; `undefined` is an element whose value is `undefined`. `in` and every iterator method can tell the difference even when printing cannot.

## `for...in` yields keys, `for...of` yields values

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
const arr = ["A", "B"];

for (const key in arr) {
  console.log(key, typeof key);
}

for (const value of arr) {
  console.log(value);
}
```

### Output

```text
0 string
1 string
A
B
```

### Explanation

`for...in` enumerates **property keys**: for `["A", "B"]` that is `"0"` then `"1"`, and keys are always strings, hence `typeof key` is `"string"`. `for...of` consumes the array's **iterator**, which yields **values**: `"A"` then `"B"`. The two loops answer different questions — "what are the property names?" versus "what is the sequence?".

### The Rule

`for...in` walks enumerable string keys (including inherited ones, in an unspecified but usually ascending-index order) and is meant for objects. `for...of` walks any iterable's values via `[Symbol.iterator]` and is meant for arrays, strings, Maps, Sets, and generators.

### How to Rewrite It Safely

This snippet is correct as a demonstration. The variation that breaks is using `for...in` on arrays in real code — it picks up custom and inherited keys. Prefer indexes or iteration:

```javascript
const arr = ["A", "B"];
for (const [index, value] of arr.entries()) {
  console.log(index, value); // => 0 "A", then 1 "B"
}
```

### Takeaway

`for...in` asks an object for its keys; `for...of` asks an iterable for its values. Never use `for...in` to walk array elements.

## `const` forbids reassignment, not mutation

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
const obj = { count: 10 };
obj.count = 20;
console.log(obj.count);
obj = { count: 30 };
```

### Output

```text
20
TypeError: Assignment to constant variable.
```

### Explanation

`const obj` binds the **name** `obj` to one object reference permanently. Statement 2 mutates the object behind that reference (`count` becomes `20`), which is allowed, so `20` logs. Statement 3 tries to point the name at a different object, which the `const` binding forbids — evaluation throws `TypeError: Assignment to constant variable` and nothing after it runs.

### The Rule

`const` protects the **binding** (which value the name points to), not the **value** (what you can do through it). Object properties, array elements, and Map/Set contents behind a `const` remain fully mutable.

### How to Rewrite It Safely

Mutate deliberately through the one binding, and reach for `Object.freeze` when you truly want the contents locked:

```javascript
const obj = { count: 10 };
obj.count = 20; // intended mutation of a const-held object
console.log(obj.count); // => 20
```

### Takeaway

`const` means "this name always points here", never "this value never changes". Mutation goes through the binding; reassignment replaces it.

## `JSON.stringify` throws on circular structures

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const obj = { name: "a" };
obj.self = obj;
console.log(JSON.stringify(obj));
```

### Output

```text
TypeError: Converting circular structure to JSON
```

### Explanation

`obj.self = obj` makes the object reference itself. `JSON.stringify` walks the structure depth-first: it serialises `obj`, enters `self` (which is `obj` again), enters `self` again, and so on forever. The serializer tracks the ancestor chain, detects the cycle, and throws `TypeError: Converting circular structure to JSON` instead of recursing infinitely. No partial output is produced.

### The Rule

JSON is a tree format — it cannot represent reference cycles. Any object reachable from itself (directly or through a longer loop) is unstringifiable by the default serializer.

### How to Rewrite It Safely

Break the cycle with a replacer that has seen each ancestor, or clone with a cycle-aware cloner:

```javascript
function safeStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (key, val) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    return val;
  });
}

const obj = { name: "a" };
obj.self = obj;
console.log(safeStringify(obj)); // => {"name":"a","self":"[Circular]"}
```

### Takeaway

A self-referencing object is a graph, and `JSON.stringify` only draws trees — expect the circular-structure `TypeError` and serialise with a `WeakSet`-guarded replacer.

## `Date` methods mutate the instance

`Difficulty: Easy` `Probability: Medium`

### The Code

```javascript
const d = new Date(2026, 0, 15);
const same = d;
d.setMonth(5);
console.log(d === same);
console.log(d.getMonth());
```

### Output

```text
true
5
```

### Explanation

`setMonth(5)` does not return a new date — it **mutates** `d` in place (June, since months are 0-based) and returns the new timestamp. `same` still points at the identical object, so `d === same` is `true`, and reading `getMonth()` shows the mutation (`5`).

### The Rule

`Date` is a mutable object: every `set*` method (`setFullYear`, `setMonth`, `setDate`, `setHours`, and so on) rewrites the instance it is called on. Copying the reference copies nothing.

### How to Rewrite It Safely

Clone before adjusting when the original must survive:

```javascript
const d = new Date(2026, 0, 15);
const shifted = new Date(d.getTime());
shifted.setMonth(5);
console.log(d.getMonth()); // => 0 (untouched)
console.log(shifted.getMonth()); // => 5
```

### Takeaway

A `Date` is a mutable timestamp holder: `set*` edits the object in place, so clone with `new Date(d.getTime())` before deriving a new date.

## Date-string parsing depends on format and time zone

`Difficulty: Easy` `Probability: Medium`

### The Code

```javascript
console.log(new Date("2026-01-05").toISOString());
console.log(Number.isNaN(Date.parse("hello")));
console.log(new Date("hello").toString());
```

### Output

```text
2026-01-05T00:00:00.000Z
true
Invalid Date
```

### Explanation

Only the ISO-8601 form is reliably specified: `"2026-01-05"` parses as UTC midnight, so `toISOString()` deterministically prints `"2026-01-05T00:00:00.000Z"`. Anything else (`"hello"`, locale-specific orders like `"01/05/2026"`) is implementation-dependent — here `Date.parse` returns `NaN` and the `Date` stringifies as `"Invalid Date"`. Slash formats and missing offsets additionally shift between UTC and local time depending on the engine and host time zone.

### The Rule

Parse only ISO-8601 strings you constructed yourself, and supply an explicit offset (`Z` or `+05:30`) whenever the instant matters. Non-standard formats may parse, misparse, or return `NaN` across browsers.

### How to Rewrite It Safely

Construct dates from numbers, or validate the parse instead of trusting it:

```javascript
const t = Date.parse(input);
if (Number.isNaN(t)) throw new Error(`Unparseable date: ${input}`);
const d = new Date(t);
```

### Takeaway

`new Date(string)` is deterministic only for well-formed ISO strings with an explicit zone — treat every other format as untrusted input.

## Compare dates by timestamp, not by reference

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
const a = new Date(2026, 0, 1);
const b = new Date(2026, 0, 1);
console.log(a === b);
console.log(a == b);
console.log(a.getTime() === b.getTime());
```

### Output

```text
false
false
true
```

### Explanation

`a` and `b` hold the same instant but are two distinct objects, so both `===` and `==` compare **references** (no coercion happens when both operands are objects) and return `false`. `getTime()` unwraps each date to its millisecond number, and the numbers are equal, so the third comparison is `true`.

### The Rule

`Date` instances are objects: equality operators test identity, never the instant. Ordering operators (`<`, `>`, `-`) do coerce via `valueOf`, but equality does not — compare `getTime()` values (or subtract) explicitly.

### How to Rewrite It Safely

This is the correct pattern; the broken variation is `a === b` for "same day":

```javascript
const a = new Date(2026, 0, 1);
const b = new Date(2026, 0, 1);
console.log(a.getTime() === b.getTime()); // => true
console.log(a - b === 0); // => true (subtraction coerces via valueOf)
```

### Takeaway

Two `Date`s for the same instant are still two objects — equality is reference identity, so compare instants with `getTime()`.

## `"2026-01-01"` is UTC midnight; `(2026, 0, 1)` is local midnight

`Difficulty: Medium` `Probability: Medium`

### The Code

```javascript
const utc = new Date("2026-01-01");
const local = new Date(2026, 0, 1);
console.log(utc.toISOString());
console.log(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
console.log(local.getFullYear(), local.getMonth(), local.getDate());
```

### Output

```text
2026-01-01T00:00:00.000Z
2026 0 1
2026 0 1
```

### Explanation

The date-only ISO string `"2026-01-01"` is specified as **UTC midnight**, so its ISO rendering is always `"2026-01-01T00:00:00.000Z"` — in time zones behind UTC it displays as 31 December in local time. The multi-argument constructor `new Date(2026, 0, 1)` builds **local midnight** in the host time zone, so its local components are always `2026 0 1` while its UTC instant shifts with the offset. Same calendar text, two different instants for most of the world.

### The Rule

Date-only ISO strings parse as UTC; numeric-argument construction uses the local zone. Mixing the two without thinking in offsets produces off-by-a-day bugs.

### How to Rewrite It Safely

Say which midnight you mean, explicitly:

```javascript
const utcMidnight = new Date(Date.UTC(2026, 0, 1));
const localMidnight = new Date(2026, 0, 1);
```

### Takeaway

A bare `"YYYY-MM-DD"` string means midnight UTC, but `new Date(y, m, d)` means midnight local — never mix them without converting through UTC or local getters deliberately.

## Module imports are live read-only views, not copies

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
// counter.js
export let count = 0;
export function inc() {
  count += 1;
}

// main.js
import { count, inc } from "./counter.js";
console.log(count); // => 0
inc();
console.log(count); // => 1
// count = 99; // TypeError: Assignment to constant variable.
```

### Output

```text
0
1
```

### Explanation

`main.js` does not receive a snapshot of `count` — it receives a **live binding** to the variable inside `counter.js`. The first log reads the current value `0`; calling `inc()` mutates the exporter's variable; the second log re-reads it and sees `1`. The commented-out line would throw because an importer may read a live binding but never write to it.

### The Rule

Named imports are read-only references to the exporter's live variables, resolved at module-link time and evaluated once (modules are singletons). Updates made by the exporter are visible to every importer.

### How to Rewrite It Safely

Nothing is broken here — this is the pattern for shared mutable module state. The variation that breaks is expecting a copy: if you need a snapshot, copy it yourself:

```javascript
import { count } from "./counter.js";
const snapshot = count; // plain number, frozen at import-read time
```

### Takeaway

An import names the exporter's variable, not its current value — reads track the source module, writes from the importer are forbidden.

## Default imports take any name; named imports must match

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
// utils.js
export default function add(a, b) {
  return a + b;
}
export const PI = 3.14159;

// main.js
import add from "./utils.js";
import total, { PI as circlePI } from "./utils.js";
console.log(add(1, 2));
console.log(total(3, 4));
console.log(circlePI);
```

### Output

```text
3
7
3.14159
```

### Explanation

`utils.js` has one **default** export (the `add` function) and one **named** export (`PI`). The default may be imported under any local name — `add` and `total` both bind the same function, so the calls log `3` and `7`. Named imports must name the export (`PI`), optionally renamed with `as` (`circlePI`), and log `3.14159`. Omitting the braces asks for the default; using braces asks for names.

### The Rule

A module has at most one default export (imported without braces, any local name) and any number of named exports (imported with braces by exact exported name, `as` for aliasing). Mixing the syntaxes mixes which export you get.

### How to Rewrite It Safely

This is the correct form. The breaking variations are `import { add } from "./utils.js"` (there is no named export `add` — binds `undefined` at link time, actually a `SyntaxError` at instantiation: the requested export is missing) and `import PI from "./utils.js"` (the default is the function, not `PI`).

### Takeaway

Braces choose the lookup rule: no braces takes the single default under any name you like; braces take named exports by their exact exported names.

## Each module gets its own scope, not the global scope

`Difficulty: Easy` `Probability: Medium`

### The Code

```javascript
// widget.js (a module)
var hidden = 42;
console.log(typeof window !== "undefined" ? window.hidden : globalThis.hidden);

// page.js (classic script, for contrast)
// var shown = 42; // => window.shown / globalThis.shown would be 42
```

### Output

```text
undefined
```

### Explanation

Top-level `var` in a **classic script** creates a property on the global object, but `widget.js` is a **module**, and module top-level declarations live in module scope. `hidden` is visible only inside `widget.js`; `globalThis.hidden` stays `undefined`. The commented-out classic-script line shows the contrast: there, `var shown` would attach to the global object.

### The Rule

Module code runs in its own scope with its own imports/exports: top-level `let`, `const`, `var`, `function`, and `class` never leak to `globalThis`. Sharing happens only through explicit `export`/`import`.

### How to Rewrite It Safely

Export what others need instead of relying on globals:

```javascript
// widget.js
export const hidden = 42;

// main.js
import { hidden } from "./widget.js";
console.log(hidden); // => 42
```

### Takeaway

A module's top level is private by default — nothing lands on the global object, and cross-file access requires an explicit export and import.

## Modules are always strict, with `undefined` top-level `this`

`Difficulty: Medium` `Probability: Medium`

### The Code

```javascript
// strict-demo.js (a module)
console.log(this);
try {
  undeclaredVar = 1;
} catch (error) {
  console.log(error instanceof ReferenceError);
  console.log(typeof undeclaredVar);
}
```

### Output

```text
undefined
true
undefined
```

### Explanation

Modules are strict-mode code with no opt-out: top-level `this` is `undefined` (not the global object), so the first log prints `undefined`. Assigning to `undeclaredVar` without declaring it would silently create a global in sloppy scripts, but in strict mode it throws `ReferenceError`, caught here — hence `true` — and the variable is never created, so `typeof undeclaredVar` remains `"undefined"`.

### The Rule

Module code implies `"use strict"`: undeclared assignments throw, `this` at the top level is `undefined`, and silent sloppy-mode behaviours (global leaks, octal literals, duplicate-parameter tolerance) become errors.

### How to Rewrite It Safely

Declare everything and never rely on top-level `this` being global:

```javascript
// strict-demo.js (a module)
let declaredVar = 1;
console.log(declaredVar); // => 1
console.log(globalThis); // explicit when you truly mean the global object
```

### Takeaway

A module is strict by construction: no implicit globals, and top-level `this` is `undefined` — reach for `globalThis` when the global object is really what you want.

## Circular imports see partially initialised live bindings

`Difficulty: Hard` `Probability: Low`

### The Code

```javascript
// a.js
import { bValue } from "./b.js";
export const aValue = "A";
console.log("a sees b as:", bValue);

// b.js
import { aValue } from "./a.js";
export const bValue = "B";
console.log("b sees a as:", aValue);

// entry point: import "./a.js"
```

### Output

```text
b sees a as: undefined
a sees b as: B
```

### Explanation

Entering through `a.js`, the loader starts evaluating `a.js`, hits the import of `b.js`, and suspends `a.js` to evaluate `b.js` first. `b.js` imports `aValue` — a live binding that exists (linking finished before evaluation) but is still uninitialised because `a.js` never reached its `export const` line — so `b.js` reads `undefined` (a `let`/`const` export read too early would instead throw a TDZ `ReferenceError`). `b.js` finishes, defining `bValue = "B"`; control returns to `a.js`, which now reads the initialised `bValue` and logs `"B"`. Swapping the entry point flips which side sees the uninitialised value.

### The Rule

Circular imports link all bindings first but evaluate modules depth-first exactly once, so at least one side of the cycle necessarily observes the other mid-initialisation. Function declarations (hoisted and initialised early) survive cycles; `const`/`let` state read during the cycle does not.

### How to Rewrite It Safely

Break the cycle: move the shared state to a third module both import, or defer the read until after evaluation (inside a function called later):

```javascript
// b.js — safe version: read the binding lazily
import * as a from "./a.js";
export const bValue = "B";
export function describe() {
  return `a is ${a.aValue}`; // read after both modules finished evaluating
}
```

### Takeaway

In an import cycle, bindings are linked before any code runs but initialised in entry-dependent order — never read a cyclically imported `let`/`const` during module evaluation.

## Dynamic `import()` loads a module lazily and returns a Promise

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
async function loadFormatter(locale) {
  if (locale === "in") {
    const module = await import("./formatter-in.js");
    return module.format(1234567);
  }
  const module = await import("./formatter-us.js");
  return module.format(1234567);
}

console.log(typeof import("./formatter-us.js"));
loadFormatter("us").then((text) => console.log(typeof text));
```

### Output

```text
object
string
```

### Explanation

`import()` is an operator-like function callable from anywhere — unlike static `import`, which must sit at the top level. It starts loading the target module (fetch + link + evaluate, cached after the first load) and returns a **Promise** for the module namespace object, hence `typeof` the promise is `"object"`. Awaiting it yields the namespace; `.format(...)` runs and resolves `text` to a string, so the second log prints `"string"` after the synchronous `"object"` line.

### The Rule

Static `import` is hoisted, unconditional, and evaluated before the importer runs; dynamic `import(specifier)` is an expression returning `Promise<namespace>` that enables conditional, lazy, and computed-specifier loading (the basis of route-level code splitting).

### How to Rewrite It Safely

Await the namespace and handle load failure — the network can say no:

```javascript
async function loadFormatter(locale) {
  try {
    const module = await import(`./formatter-${locale}.js`);
    return module.format(1234567);
  } catch {
    const fallback = await import("./formatter-us.js");
    return fallback.format(1234567);
  }
}
```

### Takeaway

`import()` turns module loading into a runtime `Promise` for the module namespace — use it for anything conditional or deferred, and `await` plus `try/catch` it like any async I/O.
