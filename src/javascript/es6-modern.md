# ES6 & Modern JavaScript: Arrow Functions, Destructuring, Modules, Generators, and More

## 1. Why This Exists — The Problem First

Here's a bug that actually hurts. You have a button click handler that calls a method on an object. The method uses `this.userName` to build a greeting. Works perfectly in the console. Deploy to production and some users get `"Hello, undefined!"`. You spend two hours hunting it. Turns out you wrote the handler as an arrow function on the object literal, which means `this` doesn't refer to the object at all — it captures the outer `this`, which in strict mode is `undefined`. Silent. Runtime-only. Users are affected before you even notice.

Or this one: you write a `for` loop with `var i = 0`. Three callbacks are registered inside that loop, each one supposed to capture a different value of `i`. They all log `5`. Because `var` is function-scoped, not block-scoped — by the time any callback runs, the loop has finished and `i` is already `5`. This is one of the most classic JavaScript bugs in existence, and ES6 killed it with `let`.

Or the `const` confusion: you declare `const config = { apiUrl: '...' }` at the top of your module, feeling safe. Then somewhere deep in your code, `config.apiUrl = 'http://localhost:3000'` — and it sticks. No error. `const` doesn't make objects immutable. It only locks the binding, not the value.

ES6 didn't add complexity. It added tools that eliminate an entire category of these bugs when used correctly. The features below aren't syntax sugar — each one exists because something was genuinely broken before it.

## 2. The Analogy — Make It Obvious

Think of a variable declaration like a hotel room key card.

`var` is the old-style skeleton key that works anywhere in the building (the function). It's cut before you even check in (hoisting), so it exists the moment the function starts — but the room it unlocks is just a storage closet (`undefined`) until you actually put something in it.

`let` and `const` are modern key cards that only work on your specific floor (the block `{}`). They're also issued at check-in time (hoisting), but unlike the skeleton key, they're not activated yet — the hotel system throws an error if you try to swipe them before you've been formally issued them (the Temporal Dead Zone). `const` is a key card that the front desk welds shut after issuing — you can't hand it to a different room, but whatever's inside that room you can still rearrange.

Arrow functions are like a contractor who works inside your office. When they say "I work here," they mean your company, not their own. They don't have their own organizational identity (`this`) — they operate under yours. That's exactly what lexical `this` means.

Generators are like a pause button on a recipe. You're making soup, the recipe says "now wait for it to boil." You press pause, do other things, come back, press play. The recipe resumes exactly where it left. The ingredients are still in the pot (`yield` preserves the execution state).

## 3. How It Actually Works — The Full Explanation

### `var`, `let`, and `const` — what the engine actually does

When JavaScript parses your code, before any line executes, it does a preparation pass. Every `var` declaration gets hoisted to the top of its containing function and initialized to `undefined` immediately. This is why you can reference a `var` before its line in the code and get `undefined` instead of a crash.

`let` and `const` are also hoisted — the engine knows they exist — but it deliberately does not initialize them. The stretch of code between where the scope starts and where the `let`/`const` declaration actually appears is called the **Temporal Dead Zone (TDZ)**. Inside the TDZ, any access throws a `ReferenceError`. This is intentional. It forces you to declare before you use.

The scoping difference is more fundamental. `var` respects function boundaries. If you declare `var x` inside an `if` block, it leaks out to the surrounding function. `let` and `const` respect `{...}` block boundaries — an `if`, a `for` loop, a bare `{}`, anything with braces. This is why the `for` loop bug disappears with `let`: each iteration of the loop gets its own fresh binding of `i`.

`const` makes one additional guarantee: the binding itself cannot be reassigned. You can't do `const x = 1; x = 2`. But if the value is an object or array, the contents of that object are completely mutable. `const` binds the reference, not the data at that reference.

### Arrow Functions — lexical `this` in detail

Every regular function creates its own `this` when it's called. What `this` is depends on *how* the function is called, not where it's defined. Called as a method: `this` is the object. Called as a standalone function: `this` is `undefined` (strict mode) or `globalThis`. Called with `new`: `this` is the new instance. Called with `.call()` / `.apply()` / `.bind()`: `this` is whatever you pass in.

Arrow functions opt out of this entire system. They have no `this` at all. When they refer to `this`, the engine walks up the scope chain and uses whatever `this` is in the nearest enclosing *regular* function or global scope — captured at the moment the arrow function is *defined*, not when it's called. This is lexical `this`, and it never changes no matter how you call the arrow function.

Arrow functions also have no `arguments` object. If you need the arguments list, use rest parameters (`...args`). They also cannot be called with `new` — there's no internal `[[Construct]]` method, so `new () => {}` throws a `TypeError`.

The implicit return rule: if the function body is a single expression (no curly braces), the result of that expression is returned automatically. If you use curly braces, you need an explicit `return`.

When NOT to use arrows: object methods (because `this` won't point to the object), `addEventListener` callbacks where you need `this` to be the DOM element, prototype methods, anything that needs its own `arguments`, and constructor functions.

### Destructuring — unpacking without the ceremony

Destructuring is pattern matching on the left side of an assignment. You describe the shape of what you expect, and JavaScript extracts the matching values.

For arrays, position matters. The first variable gets the first element, the second gets the second. You can skip elements with an empty comma, capture the rest with `...rest`, and supply defaults for cases where the array is shorter than expected.

For objects, names matter. You write the property name you want, and JavaScript looks it up on the object. If you want to rename it as you extract, you write `{ oldName: newName }` — the left side is the source key, the right side is the local variable name. Defaults follow the same pattern: `{ name = 'anonymous' }` kicks in only when the value is `undefined`.

The critical failure mode: if you try to destructure `undefined` or `null`, JavaScript throws a `TypeError` immediately. This catches people out all the time when destructuring function return values or API responses that might not have arrived yet.

### Template Literals — more than string interpolation

The basic use is familiar: backticks, `${}` for expressions. But the less-known feature is **tagged templates**. When you put a function name directly before a template literal (no parentheses), that function receives two things: an array of the static string parts, and then each interpolated value as a separate argument. This is how libraries like `styled-components` and `gql` work — they parse the template and construct something entirely different from the raw string.

### JavaScript Modules — ESM vs CommonJS

ESM (`import`/`export`) is static. The imports are resolved before any code runs. The bundler (webpack, Rollup, Vite) can read the whole import graph at build time and remove unused exports — this is tree-shaking. You cannot have an `import` inside an `if` statement.

CommonJS (`require`) is dynamic. `require()` is just a function call, executed at runtime, and you can call it from anywhere, including conditionally. This makes it impossible for bundlers to reliably tree-shake CommonJS modules.

Named exports let you export multiple things from one file and import exactly what you need by name. Default exports let you export one primary thing per file, and the importer can name it whatever they want. You can have both in one file.

**Barrel files** are `index.js` files that re-export things from many files: `export { Button } from './Button.js'; export { Input } from './Input.js';`. They make import paths cleaner but can hurt tree-shaking if not handled carefully.

**Dynamic `import()`** is a function that returns a Promise and loads a module lazily at runtime. This is how code splitting works: the chunk isn't downloaded until the user actually needs it.

### `Set` and `Map` — when plain objects aren't right

A `Set` stores unique values. If you add the same value twice, it's stored once. The `.has()` method is O(1) — it's a hash lookup, not a linear scan. Sets maintain insertion order. They're iterable, so you can use `for...of` on them.

A `Map` is a key-value store where the keys can be *anything* — strings, numbers, objects, functions. Plain objects only accept string (or Symbol) keys; anything else gets converted to a string. `Map` maintains insertion order, has a `.size` property, and is directly iterable. When you frequently add and remove keys, `Map` also performs better than a plain object because it doesn't have to manage prototype chain properties.

**WeakMap** and **WeakSet** hold *weak references*. If an object stored as a key in a WeakMap has no other references to it, the garbage collector can collect it — the WeakMap won't prevent that. Because of this, WeakMaps have no size, aren't iterable, and you can't enumerate their keys. The primary use case is caching metadata about DOM nodes or objects without causing memory leaks.

### `for...of` — the universal iteration tool

`for...of` works on anything that implements the **iterable protocol** — it has a `[Symbol.iterator]` method. Arrays, strings, Maps, Sets, generators, NodeLists, and `arguments` objects are all iterable. Plain objects are not (unless you implement the protocol yourself).

It gives you the **values**, not the indices or keys. If you need indices alongside values, use `array.entries()` which yields `[index, value]` pairs.

You can `break`, `continue`, and `return` inside a `for...of` loop. You cannot do this inside `forEach` — `forEach` doesn't know how to stop mid-iteration.

### Generators — lazy execution on demand

A generator function uses `function*` syntax. Calling it does not run any code. It returns a **generator object** — an object that implements both the iterable and iterator protocols. Every call to `.next()` on that object runs the function body until it hits a `yield`, pauses there, and returns `{ value: theYieldedValue, done: false }`. When the function returns (or reaches the end), `.next()` returns `{ value: returnValue, done: true }`.

The key word is **lazy**. The values are computed on demand, not all upfront. This makes generators ideal for:
- Infinite sequences (you can yield forever without blowing up memory)
- Expensive computations you only want to trigger when needed
- Async iteration (the foundation of `for await...of`)

The `yield` expression itself can receive a value: if you call `.next(someValue)`, that value becomes the result of the `yield` expression inside the generator. This bidirectional communication is how async generators coordinate work.

### Spread and Rest — two sides of the same syntax

The `...` syntax in JavaScript means two opposite things depending on where it appears.

**Rest parameters** appear in function definitions and collapse multiple arguments into a single array. It must be the last parameter. It replaces the old `arguments` object (which was array-like but not a real array).

**Spread** appears in array literals, object literals, or function calls and explodes an iterable into individual elements. In function calls, `fn(...arr)` is equivalent to `fn.apply(null, arr)`. In array literals, `[...a, ...b]` creates a new array with all elements of both. In object literals, `{ ...obj }` creates a shallow copy of `obj`.

**Object spread vs `Object.assign`:** both create shallow copies. The difference is that `Object.assign` mutates the first argument (the target) and returns it. Object spread always creates a new object. Object spread does not copy non-enumerable properties or prototype chain entries — same as `Object.assign`.

## 4. Real Code — See It Working

```javascript
// ─── var / let / const ───────────────────────────────────────────────────────

// The classic var loop bug
function classicBug() {
  const callbacks = [];
  for (var i = 0; i < 3; i++) {
    callbacks.push(() => console.log(i)); // all capture the same `i`
  }
  callbacks.forEach(fn => fn()); // logs 3, 3, 3 — not 0, 1, 2
}

// Fixed with let — each iteration gets its own block-scoped `i`
function fixed() {
  const callbacks = [];
  for (let i = 0; i < 3; i++) {
    callbacks.push(() => console.log(i)); // each closes over its own `i`
  }
  callbacks.forEach(fn => fn()); // logs 0, 1, 2
}

// const doesn't mean immutable
const config = { env: 'production', port: 3000 };
config.port = 9999; // no error — the object is mutable
// config = {}; // TypeError: Assignment to constant variable

// TDZ in action
// console.log(myVar); // undefined — var is hoisted and initialized
// console.log(myLet); // ReferenceError — TDZ, let is hoisted but not initialized
var myVar = 1;
let myLet = 2;
```

```javascript
// ─── Arrow Functions ─────────────────────────────────────────────────────────

const timer = {
  seconds: 0,
  start() {
    // Arrow function captures `this` from start() at definition time
    // No matter how setInterval calls this function, `this` is always the timer object
    setInterval(() => {
      this.seconds++;
      console.log(this.seconds); // correctly increments
    }, 1000);
  }
};

// When NOT to use an arrow — object method
const counter = {
  count: 0,
  // BAD: arrow function, `this` is not the counter object
  incrementArrow: () => {
    this.count++; // `this` is the outer scope (globalThis or undefined in strict mode)
  },
  // GOOD: regular function, `this` is the counter object when called as a method
  increment() {
    this.count++;
  }
};

// No arguments object in arrows
function regularFn() {
  console.log(arguments); // Arguments object — works
}

const arrowFn = (...args) => {
  console.log(args); // must use rest params instead
};

// Implicit return — expression body, no braces
const double = x => x * 2;
const add = (a, b) => a + b;

// Returning an object literal — wrap in parens to avoid ambiguity with block {}
const makeUser = name => ({ name, createdAt: Date.now() });
```

```javascript
// ─── Destructuring ───────────────────────────────────────────────────────────

// Array destructuring
const [first, , third, fourth = 'default'] = [10, 20, 30];
console.log(first);   // 10
console.log(third);   // 30
console.log(fourth);  // 'default' — position 3 didn't exist, used default

// Rest in arrays
const [head, ...tail] = [1, 2, 3, 4];
console.log(head); // 1
console.log(tail); // [2, 3, 4]

// Object destructuring with rename + default
const { name: userName, role = 'viewer', address: { city } } = {
  name: 'Ranjeet',
  address: { city: 'Bangalore' }
};
console.log(userName); // 'Ranjeet'
console.log(role);     // 'viewer' — wasn't in the object, used default
console.log(city);     // 'Bangalore' — nested destructuring

// Function parameter destructuring — very common in React
function renderCard({ title, subtitle = 'No subtitle', tags = [] }) {
  return `${title} — ${subtitle} [${tags.join(', ')}]`;
}
renderCard({ title: 'Hello', tags: ['news', 'tech'] });

// The trap: destructuring undefined throws
function dangerousDestructure(response) {
  const { data } = response; // TypeError if response is undefined/null
}
// Safe version:
function safeDestructure(response = {}) {
  const { data = null } = response;
  return data;
}
```

```javascript
// ─── Template Literals ───────────────────────────────────────────────────────

// Basic interpolation and multiline
const user = { name: 'Ranjeet', points: 1200 };
const message = `
  Welcome back, ${user.name}!
  You have ${user.points > 1000 ? 'Gold' : 'Silver'} status.
`;

// Tagged templates — the function receives the raw parts and interpolated values
function highlight(strings, ...values) {
  // strings: ['Hello, ', '! You have ', ' points.']
  // values: ['Ranjeet', 1200]
  return strings.reduce((result, str, i) => {
    const val = values[i] !== undefined ? `<strong>${values[i]}</strong>` : '';
    return result + str + val;
  }, '');
}

const html = highlight`Hello, ${user.name}! You have ${user.points} points.`;
// 'Hello, <strong>Ranjeet</strong>! You have <strong>1200</strong> points.'
```

```javascript
// ─── Modules (ESM) ───────────────────────────────────────────────────────────

// utils.js — named exports
export const API_URL = 'https://api.example.com';
export function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Button.js — default export
export default function Button({ label, onClick }) {
  // ...
}

// consumer.js — importing both
import Button from './Button.js';              // default — can rename freely
import { API_URL, formatDate } from './utils.js'; // named — must match exactly

// Re-export (barrel file pattern)
// index.js
export { Button } from './Button.js';
export { API_URL, formatDate } from './utils.js';

// Dynamic import — loads the module only when needed (code splitting)
async function loadChart() {
  const { Chart } = await import('./Chart.js');
  // Chart is only downloaded when this function runs
  return new Chart();
}
```

```javascript
// ─── Set and Map ─────────────────────────────────────────────────────────────

// Set — deduplication and O(1) membership test
const seen = new Set();
const items = [1, 2, 2, 3, 3, 3];
const unique = [...new Set(items)]; // [1, 2, 3]

seen.add('user_123');
seen.has('user_123'); // true — O(1), not a linear scan
seen.has('user_999'); // false

// Map — any type as key, ordered, better than plain objects for dynamic data
const cache = new Map();
const keyObj = { id: 1 }; // an object as a key — impossible with plain objects
cache.set(keyObj, { data: 'some result', timestamp: Date.now() });
cache.get(keyObj); // retrieves by reference equality

console.log(cache.size); // 1

// Iterating a Map
for (const [key, value] of cache) {
  console.log(key, value);
}

// WeakMap — won't prevent GC of the key object
const nodeMetadata = new WeakMap();
function attachData(domNode, data) {
  nodeMetadata.set(domNode, data); // if domNode is removed from the DOM and
  // dereferenced everywhere else, it gets GC'd — the WeakMap won't hold it alive
}
```

```javascript
// ─── for...of ────────────────────────────────────────────────────────────────

// Works on arrays, strings, Maps, Sets, generators, NodeLists
for (const char of 'hello') {
  console.log(char); // 'h', 'e', 'l', 'l', 'o'
}

const scores = new Map([['Alice', 95], ['Bob', 87], ['Carol', 92]]);
for (const [name, score] of scores) {
  if (score > 90) {
    console.log(`${name} passed with ${score}`);
    // Can break — unlike forEach, this stops the loop immediately
  }
}

// Array with index — entries() gives [index, value] pairs
const fruits = ['apple', 'banana', 'cherry'];
for (const [i, fruit] of fruits.entries()) {
  console.log(`${i}: ${fruit}`);
}
```

```javascript
// ─── Generators ──────────────────────────────────────────────────────────────

// Infinite sequence — produces values only on demand
function* naturals(start = 1) {
  let n = start;
  while (true) {
    yield n++; // pauses here, returns n, resumes on next .next()
  }
}

const gen = naturals(5);
console.log(gen.next()); // { value: 5, done: false }
console.log(gen.next()); // { value: 6, done: false }
// The loop body hasn't run beyond the second yield — nothing computed eagerly

// Take first N values from any generator
function take(gen, n) {
  const result = [];
  for (const val of gen) {
    result.push(val);
    if (result.length === n) break; // break stops the generator cleanly
  }
  return result;
}

console.log(take(naturals(), 5)); // [1, 2, 3, 4, 5]

// Generator with return — done becomes true
function* limited() {
  yield 1;
  yield 2;
  return 'finished'; // { value: 'finished', done: true }
  yield 3;           // never reached
}
```

```javascript
// ─── Spread and Rest ─────────────────────────────────────────────────────────

// Rest parameters — collect remaining args into an array
function logAll(label, ...items) {
  // items is a real Array — has .map, .filter, etc.
  console.log(label, items.join(', '));
}
logAll('Fruits', 'apple', 'banana', 'cherry');
// "Fruits apple, banana, cherry"

// Spread in function calls
const nums = [3, 1, 4, 1, 5, 9];
console.log(Math.max(...nums)); // 9 — same as Math.max(3,1,4,1,5,9)

// Merge arrays
const a = [1, 2];
const b = [3, 4];
const merged = [...a, ...b, 5]; // [1, 2, 3, 4, 5]

// Shallow copy and merge objects
const defaults = { theme: 'light', lang: 'en', notifications: true };
const userPrefs = { theme: 'dark', lang: 'en' };
// Later properties win when keys collide
const finalPrefs = { ...defaults, ...userPrefs };
// { theme: 'dark', lang: 'en', notifications: true }

// Object spread is a SHALLOW copy
const original = { a: 1, nested: { b: 2 } };
const copy = { ...original };
copy.nested.b = 99; // also mutates original.nested.b — same reference!
console.log(original.nested.b); // 99
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the Temporal Dead Zone?**

The Temporal Dead Zone is the period between when JavaScript enters a scope (and hoists the `let`/`const` declaration) and when execution actually reaches the line where that variable is declared. During that period, the variable exists in the engine's records, but accessing it throws a `ReferenceError`. The reason for this behavior is intentional: the designers wanted `let` and `const` to catch the programming error of using a variable before declaring it, rather than silently giving you `undefined` like `var` does. The TDZ is what makes `let` and `const` safer — you can't accidentally rely on the hoisted-but-uninitialized state.

**Q: Why doesn't `const` make objects immutable?**

`const` creates an immutable *binding*. The variable name is permanently bound to one value. For primitives (numbers, strings, booleans), the value itself can't change. But for objects and arrays, the value is a *reference* — a memory address. `const` prevents you from pointing that name at a different memory address. It says nothing about what's stored at that address. The object's properties are part of the data at that address, not the binding itself. To truly freeze an object, use `Object.freeze()`, which shallowly prevents property additions and modifications.

**Q: What does "lexical `this`" mean in arrow functions?**

"Lexical" means "determined by where the code is written," not by how it's called. A regular function's `this` is dynamic — it changes based on the call site. An arrow function's `this` is fixed at the moment the arrow function is defined, and it's whatever `this` is in the enclosing code at that moment. The arrow function has no `this` of its own — it literally looks up the scope chain to find the nearest `this` binding from a surrounding regular function or the global scope. You cannot override it with `.bind()`, `.call()`, or `.apply()`. Those methods work on regular functions by setting `this` before calling. Arrow functions ignore that entirely.

**Q: When should you NOT use an arrow function?**

Four situations: (1) Object methods — if you write `const obj = { greet: () => this.name }`, `this` won't be `obj`. (2) `addEventListener` callbacks where you need `this` to be the DOM element that triggered the event — arrow functions won't give you that. (3) Prototype methods — same reason as object methods, `this` won't be the instance. (4) Generator functions — you can't write `const gen = *() => {}`, it's a syntax error. Arrow functions and generators are fundamentally incompatible.

**Q: What's the difference between a named export and a default export?**

A named export must be imported with its exact name (or aliased with `as`). A file can have unlimited named exports. A default export can be imported with any name the consumer chooses, but a file can have only one. The mental model: default export is "the main thing this file is about," named exports are "specific utilities this file provides." In practice, components are usually default exports, utility functions are usually named. Mixing both in one file is valid and common. Tree-shaking works better with named exports because bundlers can statically identify which exports are actually used.

**Q: How does dynamic `import()` differ from static `import`?**

Static `import` is a statement, not an expression, and it's processed before any code runs. The module is loaded synchronously as part of the initial bundle. Dynamic `import()` is a function that returns a Promise — it loads the module at runtime, on demand, and the module can be in a completely separate chunk that's downloaded lazily. This is the mechanism behind route-based code splitting: the bundle for the `/dashboard` page is only downloaded when the user navigates there. Static imports enable tree-shaking more reliably because bundlers can analyze the import graph at build time. Dynamic imports are resolved at runtime so they're harder to statically analyze, but they're essential for performance when a feature is rarely used.

**Q: When would you use a `Map` instead of a plain object?**

Four clear reasons: (1) Your keys aren't strings — Map accepts anything, including objects, DOM nodes, or functions as keys. (2) You need insertion order guaranteed — Map always iterates in insertion order; plain objects mostly do too for string keys, but it's not guaranteed by spec for all key types. (3) You're frequently adding and deleting keys — Map is optimized for this; plain objects carry prototype chain overhead and performance can degrade. (4) You need the size — `map.size` is O(1); `Object.keys(obj).length` requires building an array. Use a plain object when the keys are static strings known ahead of time and you just want a simple lookup — that's where objects shine.

**Q: What is a generator and why would you use one?**

A generator is a function that can pause its own execution midway through and be resumed later from the exact same point. It doesn't compute everything upfront — it computes one value at a time, yielding each one when `.next()` is called. This is called lazy evaluation. You'd use one when: you need an infinite sequence (you can't store infinity in memory, but you can produce it on demand), you're working with large datasets and want to process them one chunk at a time without loading everything, or you're building custom iteration logic. Generators are also the foundation of `async`/`await` — the original spec for `async` functions was implemented by transpiling them to generators.

**Q: What's the difference between `for...of` and `for...in`?**

`for...of` iterates over **values** of an iterable — arrays give you elements, strings give you characters, Maps give you `[key, value]` pairs, Sets give you the values. It requires the iterable protocol (`[Symbol.iterator]`). `for...in` iterates over **enumerable property keys** of an object — for an array, that means `'0'`, `'1'`, `'2'`, etc., as strings, but it also walks up the prototype chain and includes inherited properties. `for...in` on arrays is a well-known footgun because of prototype pollution. Use `for...of` for iteration, `for...in` only when you genuinely want to enumerate an object's keys and are certain the prototype is clean.

**Q: What's the difference between rest and spread?**

They use the same `...` syntax but do opposite things. Spread expands — it takes one array/object and explodes it into individual elements. Rest collects — it takes multiple individual values and collapses them into one array. The position in the code tells you which one it is: if `...` is in a function definition's parameter list, it's rest. If `...` is in a function call, array literal, or object literal, it's spread.

**Q: How do tagged template literals work?**

When you write `fn\`hello ${name}\``, JavaScript calls `fn` with two kinds of arguments: first, an array of all the static string segments (the parts between the interpolations), and then each interpolated value as a separate argument. So for `fn\`Hello, ${name}! You have ${count} items\``, the call is effectively `fn(['Hello, ', '! You have ', ' items'], name, count)`. The function can do anything with these pieces — reconstruct a string, sanitize values, build SQL queries, create styled CSS. This is how `styled-components` works: the tagged function receives your CSS string pieces and interpolated dynamic values, processes them, and generates a class name.

## 6. The Traps — What Goes Wrong

**Trap: `const` objects feel safe when they aren't.**

The mistake is declaring a config or options object with `const` and assuming it can't be mutated. But `const` only prevents reassignment — `config.apiUrl = 'http://localhost'` works with zero error. In module scope, where other files import your config, this can cause hard-to-trace bugs where different parts of the app see different config values. The fix: `Object.freeze(config)` for true immutability (shallow), or use a proper constants module that never exports mutable state.

**Trap: Arrow function as an object method.**

```javascript
// This looks fine. It is not.
const user = {
  name: 'Alice',
  greet: () => {
    console.log(`Hello, ${this.name}`); // `this` is NOT the user object
    // In strict mode: this is undefined → TypeError
    // In non-strict mode: this is globalThis → logs "Hello, undefined"
  }
};
user.greet(); // Silent failure — no error, wrong output
```

The fix is a regular method: `greet() { console.log(this.name); }` — which is shorthand for `greet: function() {...}`.

**Trap: Destructuring undefined throws, not returns undefined.**

```javascript
function fetchUser() {
  return null; // API returned nothing
}

const { name } = fetchUser(); // TypeError: Cannot destructure property 'name' of null
```

Always guard: `const { name } = fetchUser() ?? {};` or `const result = fetchUser(); const name = result?.name;`.

**Trap: Object spread is shallow — nested objects are still shared.**

```javascript
const state = { user: { name: 'Alice', settings: { theme: 'dark' } } };
const newState = { ...state, loading: false };
// newState.user is the SAME reference as state.user
newState.user.name = 'Bob';
console.log(state.user.name); // 'Bob' — you mutated the original
```

For true deep copy: `JSON.parse(JSON.stringify(state))` (loses Dates, functions, undefined), or `structuredClone(state)` (modern, handles most types), or a library like Immer.

**Trap: Forgetting that `for...of` doesn't work on plain objects.**

```javascript
const obj = { a: 1, b: 2 };
for (const val of obj) { ... } // TypeError: obj is not iterable
```

Plain objects don't implement `[Symbol.iterator]`. Use `Object.entries(obj)` to get iterable `[key, value]` pairs, or `Object.keys()` / `Object.values()`.

**Trap: Default export vs named import mismatch.**

```javascript
// button.js
export default function Button() {}

// consumer.js — WRONG
import { Button } from './button.js'; // undefined — no named export called Button
// CORRECT
import Button from './button.js';
```

The error here isn't always a build-time crash — in some bundler configs, you get `undefined` at runtime. Always match the export style to the import style.

**Trap: Generators must be advanced manually — they're not self-running.**

```javascript
function* gen() {
  console.log('start');
  yield 1;
  console.log('middle');
  yield 2;
}

const g = gen();
// Nothing printed yet — calling gen() just creates the generator object
g.next(); // "start" is printed, returns { value: 1, done: false }
g.next(); // "middle" is printed, returns { value: 2, done: false }
g.next(); // returns { value: undefined, done: true }
```

The generator body is dead until you call `.next()`. Forgetting to advance it is a common source of "why isn't this running?"

**Trap: Rest must be last in a destructuring pattern.**

```javascript
const { a, ...rest, b } = obj; // SyntaxError
const { a, b, ...rest } = obj; // correct

const [first, ...middle, last] = arr; // SyntaxError — rest must be last
```

## 7. Compare With Related Concepts

**`let` vs `const` — choose by mutation intent, not habit.**

Use `const` by default. Switch to `let` only when you know the binding will be reassigned (loop counters, accumulator variables). This isn't a style rule — it's a communication tool. `const` tells every reader "this binding won't change." When you see `let`, you know to look out for where it's reassigned. The rule: `const` unless you need to reassign, then `let`, never `var`.

**Arrow functions vs regular functions — choose by `this` behavior.**

If the function needs its own `this` (constructors, methods, event handlers needing the target), use a regular function. If the function doesn't need its own `this` and you want lexical binding (callbacks inside methods, array methods, promise chains), use an arrow. Arrow functions aren't "better" — they solve a different problem.

**`Map` vs plain object — choose by key type and mutation pattern.**

Plain object: static, string keys, known structure, rarely add/remove keys. `Map`: dynamic keys, non-string keys, frequently add/remove, need the size, need to iterate reliably.

**`for...of` vs `forEach` — choose by control flow needs.**

`forEach` is clean for simple iteration with no early exits. `for...of` is necessary when you need `break`, `continue`, `return`, or when iterating non-array iterables. `for...of` also works inside `async` functions with `await` inside the body (async `forEach` with `await` doesn't do what most people think).

**ESM (`import`/`export`) vs CommonJS (`require`/`module.exports`).**

ESM is static — parsed at load time, enables tree-shaking, native in browsers. CommonJS is dynamic — evaluated at runtime, universally supported in Node.js, but can't be tree-shaken reliably. In 2024+, ESM is the default for new Node.js projects and all browser code. CommonJS is still common in older Node.js codebases. They don't mix cleanly — you can't `import` from a CommonJS module that uses `module.exports` without interop handling.

**Spread vs `Object.assign`.**

`{ ...source }` and `Object.assign({}, source)` produce identical results for simple cases. The difference is that `Object.assign` mutates its first argument and can accept multiple sources in one call. Object spread creates a fresh object every time and reads slightly more clearly. For merging into an existing object (mutation intended), `Object.assign(target, patch)` is explicit. For creating new objects, prefer spread.

**Generator vs regular function returning an array.**

A regular function that builds an array computes all values upfront. A generator computes values on demand. For small datasets, it doesn't matter. For large or infinite sequences, generators use constant memory while the array version would run out of heap. Generators also let the consumer decide how many values to take without the producer needing to know in advance.

## 8. 🧠 The Memory Hook — What Sticks

`var` escapes blocks and arrives pre-initialized as `undefined`. `let`/`const` stay inside their block and will bite you (TDZ) if you reach for them too early. `const` locks the *label*, not the *box* — the object inside is still free to change.

Arrow functions are scope borrowers — they don't have their own `this`, they borrow it from wherever they were written. The moment you write the arrow, `this` is already decided and can never be changed.

Generators are functions with a pause button. Calling them creates the remote control — nothing plays until you press `.next()`.
