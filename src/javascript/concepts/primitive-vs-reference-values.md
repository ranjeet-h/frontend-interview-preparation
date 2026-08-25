# Primitive vs Reference Values

## 1. Why This Exists — The Problem First

A settings panel copies a user object before changing the draft, but saving the draft also changes the data shown in the profile. A memoized component receives a new-looking object on every render and keeps doing expensive work. A function changes a property on its parameter, and the caller sees the change even though the function “only received a copy.”

These bugs are not random. They come from confusing two separate ideas: copying a primitive value and copying the identity of an object. Once that distinction is clear, mutation, reassignment, function parameters, React updates, and equality all become predictable.

## 2. The Analogy — Make It Obvious

Imagine a library with two kinds of things.

A short note such as “blue” is printed on a card. If you photocopy the card, you have another card with the same information. Writing “red” on your new card does not change the first card. That is the useful analogy for a primitive: an assignment gives the new binding its own value.

Now imagine a large book that stays on one library shelf. Instead of carrying the book around, you write its catalog number on a card. If two people copy that catalog number, they have two cards that identify the same book. Either person can annotate the shared book, so the other person sees the annotation too. If one person throws away their card and writes down a different catalog number, they have changed their own route, not the book and not the other person’s card.

The cards are variable bindings. The book is the object. Copying the catalog number is copying object identity. Mutating the book is different from replacing a card with a new catalog number: mutation changes the shared object; reassignment changes only one binding.

## 3. How It Actually Works — The Full Explanation

JavaScript has primitive values: `string`, `number`, `bigint`, `boolean`, `undefined`, `symbol`, and `null`. A primitive value is immutable. That means an operation cannot edit the existing primitive in place. For example, `name.toUpperCase()` produces another string; it does not alter the original string.

Objects include ordinary objects, arrays, functions, dates, maps, sets, and many other object instances. An object has identity in addition to its contents. Two objects can contain the same properties and still be different objects.

Every JavaScript assignment copies the value held by the source expression. For a primitive, that copied value is the primitive itself:

```js
let firstScore = 10;
let secondScore = firstScore;

secondScore = 20; // Reassignment changes only secondScore's binding.
console.log(firstScore, secondScore); // 10 20
```

For an object, the value copied by the assignment is the object reference. Both bindings identify the same object:

```js
const original = { count: 1 };
const alias = original;

alias.count = 2; // Mutation reaches the one shared object.
console.log(original.count); // 2

// Reassignment would only change alias, if alias were declared with let.
let otherAlias = original;
otherAlias = { count: 99 };
console.log(original.count, otherAlias.count); // 2 99
```

The language guarantee is about observable behavior: the two bindings can reach the same object, and a mutation through either binding is visible through the other. JavaScript does not require a particular physical layout such as “primitives are on the stack and objects are on the heap.” Engines may use stacks, heaps, registers, tagged representations, optimizations, and garbage collection strategies internally. Those implementation choices must not be used as the explanation for the language rule.

Function arguments follow the same assignment rule. JavaScript passes the argument value. When that value is an object reference, the parameter receives another reference to the same object. The parameter is not an alias for the caller’s variable, so reassigning the parameter does not reassign the caller’s variable:

```js
function editAndReplace(user) {
  user.name = "Mina"; // Mutation is visible because user reaches the caller's object.
  user = { name: "New object" }; // Reassignment changes only the local parameter.
}

const user = { name: "Asha" };
editAndReplace(user);
console.log(user); // { name: "Mina" }
```

An object spread makes a new outer object, but it copies each property value. Primitive properties are independent values; nested object properties remain references to their existing objects:

```js
const account = {
  name: "Asha",
  preferences: { theme: "light" },
};
const draft = { ...account }; // New outer object; nested values are copied as values.

draft.name = "Mina"; // Independent primitive property.
draft.preferences.theme = "dark"; // Shared nested object is mutated.

console.log(account.name); // "Asha"
console.log(account.preferences.theme); // "dark"
```

To update nested data without sharing the nested object, copy each changed level. This is structural sharing: unchanged branches may be reused, while every changed path gets a new object.

```js
const account = {
  name: "Asha",
  preferences: { theme: "light" },
};

const nextAccount = {
  ...account,
  preferences: {
    ...account.preferences,
    theme: "contrast",
  },
};

console.log(nextAccount !== account); // true: new outer identity
console.log(nextAccount.preferences !== account.preferences); // true: new nested identity
```

Equality exposes the same distinction. Primitive strict equality compares their values, with the usual JavaScript rules such as `NaN !== NaN` and `Object.is(NaN, NaN) === true`. Object strict equality compares identity, not recursively equal contents:

```js
console.log("ready" === "ready"); // true: same primitive value
console.log({ id: 1 } === { id: 1 }); // false: two object identities

const settings = { theme: "dark" };
const sameSettings = settings;
console.log(settings === sameSettings); // true: same object identity
```

This is why immutable update patterns help UI libraries and memoization. If a consumer checks the outer reference, mutating an existing object keeps that reference unchanged. Creating a new reference makes the changed boundary observable. That does not mean every new object is automatically better: unnecessary new objects can also invalidate memoization. The goal is to create new identities exactly where the data changed and preserve identities for data that did not change.

## 4. Real Code — See It Working

The following complete example can be pasted into a browser console or saved as any `.js` file and run with Node.js:

```js
function changePrimitive(value) {
  value = value + 1; // The local binding gets a new number value.
}

function mutateObject(value) {
  value.count += 1; // The local reference reaches the caller's shared object.
}

function replaceObject(value) {
  value = { count: 100 }; // Only the local parameter is redirected.
}

let score = 1;
const counter = { count: 1 };

changePrimitive(score);
mutateObject(counter);
replaceObject(counter);

console.log(score); // 1
console.log(counter); // { count: 2 }
```

This example shows why the shorthand that an object argument is “a reference” is incomplete. The function receives a copied argument value in every case. The copied value is a number for `score`, and it is an object reference for `counter`. Mutation through the copied reference reaches the shared object; parameter reassignment does not reach the caller’s binding.

Use identity checks when the question is “is this the exact same object?” Use a value comparison when the question is “do these values represent the same data?”

```js
const first = { id: 7, role: "admin" };
const second = { id: 7, role: "admin" };

console.log(first === second); // false: distinct objects
console.log(first.id === second.id && first.role === second.role); // true: selected fields match

const stable = first;
console.log(first === stable); // true: identity is shared
```

For deep data, choose a deliberate comparison strategy rather than relying on JSON text. Property order, unsupported values, cycles, prototypes, and special objects can make JSON serialization an unsuitable equality algorithm. A domain-specific comparison, a trusted deep-equality utility, or stable immutable identities is usually clearer.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What happens when a JavaScript function receives an object argument?**

JavaScript passes the argument value. When that value is an object reference, the parameter receives a copy of that reference. Therefore a function can mutate the object the caller can see, but reassigning the parameter does not replace the caller’s variable. The shorthand that objects are references predicts the mutation case but hides the reassignment case.

**Q: What is copied by `const copy = original` when `original` is an object?**

The assignment copies the object reference, so `copy` and `original` identify the same object. No independent object contents are created by that assignment. Mutating through either binding is visible through the other. `const` prevents rebinding the variable; it does not make the object immutable.

**Q: Why is `{}` === `{}` false?**

Each object literal creates a distinct object identity. Strict equality for objects asks whether both operands identify the same object, not whether their properties are recursively equal. The two literals have equal-looking contents but different identities, so the result is `false`.

**Q: Why does `const a = { ...b }` not fully clone `b`?**

Spread creates a new outer object and copies its property values. A nested object or array is itself a reference value, so the nested reference is copied and remains shared. Use another copy at each changed nesting level, `structuredClone` for supported data that needs a deep copy, or a domain-specific cloning method when class instances, functions, cycles, or special values matter.

**Q: How do mutation and reassignment differ?**

Mutation changes the state of an existing object, such as `user.name = "Mina"`; every binding that identifies that object can observe the change. Reassignment changes which value one binding holds, such as `user = { name: "Mina" }`; other bindings are unaffected. A `const` binding cannot be reassigned, but its object can still be mutated unless the object is otherwise protected.

**Q: How do primitives behave differently from objects?**

Primitives are immutable values. Assigning one gives another binding the same value, and later reassignment does not couple the bindings. Objects have identity and mutable properties by default. Assigning one copies the reference, so mutation can be shared while reassignment remains local.

**Q: How should equality be chosen for objects?**

Use `===` or `Object.is` when identity matters, such as checking whether a state object or cached input is the exact same value. Use a field comparison or a deep-equality strategy when the domain asks whether contents match. Do not use `JSON.stringify` as a universal deep-equality rule; it is sensitive to key order and does not represent every JavaScript value safely.

**Q: Why does this matter for React state or memoization?**

Many UI and memoization decisions use reference identity as a fast signal. Mutating an existing state object leaves its outer identity unchanged, which can hide the update from code that compares the old and new references. Creating a new object along the changed path makes the change visible while preserving unchanged branches. Conversely, creating a fresh equivalent object on every render can make memoized consumers think something changed, so stable identities should be preserved when the data is unchanged.

**Q: What are the primitive types, and what is the `typeof null` trap?**

The primitive types are `string`, `number`, `bigint`, `boolean`, `undefined`, `symbol`, and `null`. `typeof null` returns `"object"` for historical compatibility, but `null` is still a primitive. Check `value === null` when that distinction matters.

## 6. The Traps — What Goes Wrong

**Trap: teaching a mandatory stack-versus-heap rule.**

The claim that primitives always live on the call stack and objects always live on the heap is an implementation story, not a JavaScript language guarantee. It breaks with engine optimizations and does not explain the observable rules. Teach assignment, identity, mutation, and reassignment first; mention storage only as an engine-dependent implementation detail.

**Trap: treating `const` as deep immutability.**

`const` protects a binding from reassignment. It does not freeze the object stored in that binding:

```js
const user = { name: "Asha" };
user.name = "Mina"; // Valid: the object was mutated.
// user = { name: "New binding" }; // TypeError: the binding cannot be reassigned.
```

Use `Object.freeze` for a shallow runtime freeze, recursively freeze when that is truly needed, or use immutable update conventions. Freezing and copying solve different problems.

**Trap: calling a shallow copy a deep copy.**

`{ ...source }` protects only the new outer object. If a nested branch is mutated, the original sees it too. Copy every level that will be changed, or choose a deep-copy method whose data-type limitations match the data.

**Trap: confusing mutation with reassignment in a parameter.**

`function f(options) { options = {}; }` does not replace the caller’s object. `function f(options) { options.enabled = true; }` does mutate the object reached by the caller. Test both cases whenever someone says a function “changes an argument.”

**Trap: using `===` for structural equality.**

Two separately created arrays with the same entries are not identical:

```js
console.log([1, 2] === [1, 2]); // false
console.log([1, 2].length === [1, 2].length); // true, but this checks only length
```

Choose the comparison required by the domain instead of assuming identity and content are interchangeable.

**Trap: assuming every non-mutating-looking API makes a deep copy.**

Object spread, `Object.assign`, array spread, `slice`, `map`, and `filter` create new outer containers but do not recursively clone nested objects. Verify the depth of the copy before using it to isolate editable state.

**Trap: ignoring special primitive equality cases.**

`NaN !== NaN`, and `0 === -0` even though `Object.is(0, -0)` is `false`. Use `Object.is` when its exact SameValue semantics are what the application needs; otherwise use the equality operator whose behavior you intend.

## 7. Compare With Related Concepts

**Primitive copying vs object-reference copying.** Primitive assignment gives the new binding an independent immutable value; object assignment gives it another path to the same identity. Use primitive-style reasoning for strings, numbers, booleans, and the other primitives; use identity-and-mutation reasoning for objects, arrays, and functions.

**Mutation vs reassignment.** Mutation changes an existing object and can be observed through every reference to it; reassignment changes one binding’s value. Use mutation only when shared in-place change is intentional; prefer reassignment or immutable updates when callers, state owners, or memoized consumers need clear change boundaries.

**Shallow copy vs deep copy.** A shallow copy creates a new outer container but shares nested references; a deep copy recursively creates independent nested data within its supported data model. Use a shallow copy when only top-level data changes, and copy each changed nested level or use an appropriate deep-copy strategy when nested data must be isolated.

**Identity equality vs structural equality.** `===` and `Object.is` can answer whether two references identify the same object; structural equality asks whether selected or all contents match. Use identity for caches, ownership checks, and change detection; use structural or domain-specific comparison for independently created records that should be considered equivalent.

**`Object.freeze` vs copying.** Freezing keeps one object identity and rejects or prevents some mutations; copying creates another identity and lets the new value evolve independently. Use freezing to enforce a shallow read-only boundary, and copying to produce a separate version of data.

**`structuredClone` vs JSON round-tripping.** `structuredClone` supports more built-in data types and cycles than JSON serialization, but it still cannot clone every value, such as functions. JSON round-tripping is a narrow serialization technique that drops or transforms some values. Use `structuredClone` when its supported data model fits; use a domain-specific serializer for application data with explicit rules.

## 8. 🧠 The Memory Hook — What Sticks

An assignment always copies what is on the card: a primitive note gives you another note, while an object gives you another card for the same library book. Changing the book is shared; replacing your card is private. Once you ask “did I mutate the object or reassign the binding?”, the behavior stops being mysterious.
