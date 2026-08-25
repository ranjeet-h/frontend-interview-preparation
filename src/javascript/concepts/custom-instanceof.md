# Custom `instanceof`

## 1. Why This Exists — The Problem First

An error handler receives a value from another module and needs to decide whether it is a `ValidationError`, a `TypeError`, or just an unrelated object. A check such as `value.constructor === ValidationError` is fragile: the constructor property can be shadowed, and the useful relationship is not “which function made this value?” but “does this value inherit from the constructor's prototype?”

That is the problem `instanceof` solves. If you do not understand the prototype walk, checks like `user instanceof User`, `[] instanceof Object`, and `value instanceof Error` look like special magic. They are a chain-membership test with a few important escape hatches, and a small custom implementation makes the core rule visible.

## 2. The Analogy — Make It Obvious

Imagine checking whether a visitor belongs to a particular organization by reading their chain of badges. Start with the visitor's current badge. If it is not the organization you want, read the badge that granted it, then the badge behind that one. The first matching badge proves membership; reaching the end without a match proves the visitor is not in that lineage.

The mapping is direct:

- The visitor is the value on the left of `instanceof`.
- The visitor's current badge is `Object.getPrototypeOf(value)`.
- Each next badge is the next `[[Prototype]]` in the chain.
- The organization badge is `Constructor.prototype` on the right-hand side.
- `null` means there is no next badge, so the search stops.

For `const dog = new Dog()`, the path usually looks like this:

```txt
dog → Dog.prototype → Animal.prototype → Object.prototype → null
```

`dog instanceof Animal` is true because `Animal.prototype` appears somewhere in that path. It does not require `dog` to have an own property named `constructor`, and it does not compare the constructor function directly with the object.

## 3. How It Actually Works — The Full Explanation

For the ordinary case, `value instanceof Constructor` asks whether `Constructor.prototype` is one of the objects in `value`'s prototype chain.

The simplified sequence is:

1. The right-hand side must be an object. In the normal form, it is a function with a `prototype` property.
2. If the left-hand side is a primitive or `null`, the ordinary check returns `false`. A primitive does not have an object prototype chain for this purpose.
3. Read the target object from `Constructor.prototype`.
4. Start with `Object.getPrototypeOf(value)`—the value's immediate prototype, not the value itself.
5. Compare the current prototype with the target using identity (`===`). If they are the same object, return `true`.
6. Otherwise move upward with `Object.getPrototypeOf(current)` and repeat.
7. If the chain reaches `null`, return `false`.

That explains both direct and inherited matches:

```js
function Animal() {}
function Dog() {}

Dog.prototype = Object.create(Animal.prototype);
Dog.prototype.constructor = Dog;

const dog = new Dog();

// dog → Dog.prototype → Animal.prototype → Object.prototype → null
console.log(dog instanceof Dog); // true
console.log(dog instanceof Animal); // true
console.log(dog instanceof Object); // true
```

The prototype link is an object identity link. Two separately created but identical-looking prototype objects are not the same target:

```js
function User() {}
const user = new User();

console.log(user instanceof User); // true
// `instanceof` requires a callable RHS in this ordinary case.
try {
  console.log(user instanceof {});
} catch (error) {
  console.log(error instanceof TypeError); // true
}
```

Native `instanceof` has two behaviors beyond this teaching loop. First, a right-hand object can define a callable `Symbol.hasInstance`; that method receives the left-hand value and decides the result. Second, a function's default `@@hasInstance` operation handles function-specific cases such as bound functions. Cross-realm objects are another practical boundary: an array made in an iframe has a different realm's `Array.prototype`, so `arrayFromIframe instanceof Array` can be false even though it is an array. `Array.isArray` is designed for that brand check.

## 4. Real Code — See It Working

Run this complete fixture with Node. The helper intentionally demonstrates the core ordinary-constructor algorithm. It validates the right-hand side, rejects primitives without trying to walk boxed prototypes, starts at the left value's prototype, and stops cleanly at `null`.

```js
"use strict";

function myInstanceOf(value, Constructor) {
  if (
    Constructor === null ||
    (typeof Constructor !== "object" && typeof Constructor !== "function")
  ) {
    throw new TypeError("Right-hand side must be an object");
  }

  // Native instanceof returns false for null and primitives in the ordinary case.
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }

  // This helper models the usual function-constructor case, not custom @@hasInstance.
  if (typeof Constructor !== "function") {
    throw new TypeError("Right-hand side is not callable");
  }

  const targetPrototype = Constructor.prototype;
  if (targetPrototype === null || typeof targetPrototype !== "object") {
    throw new TypeError("Constructor.prototype must be an object");
  }

  let currentPrototype = Object.getPrototypeOf(value);

  while (currentPrototype !== null) {
    if (currentPrototype === targetPrototype) {
      return true;
    }
    currentPrototype = Object.getPrototypeOf(currentPrototype);
  }

  return false;
}

function Animal(name) {
  this.name = name;
}

function Dog(name) {
  Animal.call(this, name);
}

Dog.prototype = Object.create(Animal.prototype);
Dog.prototype.constructor = Dog;

const dog = new Dog("Milo");
const plainObject = { name: "not a dog" };
const nullPrototypeObject = Object.create(null);

console.log(myInstanceOf(dog, Dog)); // true: direct prototype match
console.log(myInstanceOf(dog, Animal)); // true: inherited prototype match
console.log(myInstanceOf(dog, Object)); // true: higher ancestor match
console.log(myInstanceOf(plainObject, Dog)); // false: different lineage
console.log(myInstanceOf(nullPrototypeObject, Object)); // false: chain starts at null
console.log(myInstanceOf(42, Number)); // false: primitive, no ordinary chain
console.log(myInstanceOf(null, Object)); // false: null has no prototype

try {
  myInstanceOf(dog, {});
} catch (error) {
  console.log(error instanceof TypeError); // true: RHS is not callable
}
```

For a built-in example, the same walk explains an array's ordinary lineage:

```js
function myInstanceOf(value, Constructor) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }

  let currentPrototype = Object.getPrototypeOf(value);
  const targetPrototype = Constructor.prototype;

  while (currentPrototype !== null) {
    if (currentPrototype === targetPrototype) {
      return true;
    }
    currentPrototype = Object.getPrototypeOf(currentPrototype);
  }

  return false;
}

const items = [];

console.log(myInstanceOf(items, Array)); // true
console.log(myInstanceOf(items, Object)); // true
console.log(myInstanceOf({}, Array)); // false
```

`Object.getPrototypeOf` can also be intercepted by a Proxy. A custom walk that starts with that operation observes the trap, so the proxy can present a different prototype lineage to the helper:

```js
function myInstanceOf(value, Constructor) {
  let currentPrototype = Object.getPrototypeOf(value);
  const targetPrototype = Constructor.prototype;

  while (currentPrototype !== null) {
    if (currentPrototype === targetPrototype) {
      return true;
    }
    currentPrototype = Object.getPrototypeOf(currentPrototype);
  }

  return false;
}

function Marker() {}

const proxiedValue = new Proxy({}, {
  getPrototypeOf() {
    return Marker.prototype;
  },
});

console.log(myInstanceOf(proxiedValue, Marker)); // true: the trap supplies Marker.prototype
console.log(proxiedValue instanceof Marker); // true: native instanceof also consults getPrototypeOf
```

Native behavior can intentionally be different from a raw prototype walk:

```js
function myInstanceOf(value, Constructor) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }

  let currentPrototype = Object.getPrototypeOf(value);
  const targetPrototype = Constructor.prototype;

  while (currentPrototype !== null) {
    if (currentPrototype === targetPrototype) {
      return true;
    }
    currentPrototype = Object.getPrototypeOf(currentPrototype);
  }

  return false;
}

class EvenNumber {
  static [Symbol.hasInstance](value) {
    return typeof value === "number" && value % 2 === 0;
  }
}

console.log(4 instanceof EvenNumber); // true
console.log(3 instanceof EvenNumber); // false
console.log(myInstanceOf(4, EvenNumber)); // false: 4 is a primitive
```

The last result is why a custom helper must state its contract. It is a prototype-chain teaching implementation; it is not a complete replacement for the language operator's `@@hasInstance` protocol.

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does `instanceof` work?**

In the ordinary case, it takes the right-hand constructor's `prototype` object and searches upward from the left-hand value's immediate prototype. If the exact same prototype object appears anywhere before `null`, the result is `true`; otherwise it is `false`. It is a prototype-lineage check, not a constructor-name or property-shape check.

**Q: Why does `[] instanceof Array` return `true`?**

An array literal creates an object whose immediate prototype is the current realm's `Array.prototype`. The operator compares that object with `Array.prototype`, finds the identity match immediately, and returns `true`.

**Q: Why does an array also satisfy `instanceof Object`?**

The array's chain continues from `Array.prototype` to `Object.prototype`. Because `Object.prototype` appears in the chain, `items instanceof Object` is also `true`. The check is about ancestry, so a match higher in the chain counts.

**Q: What happens for primitives and `null`?**

For the ordinary built-in behavior, `42 instanceof Number`, `"x" instanceof String`, and `null instanceof Object` are `false`. Primitives are values, not instances created with an object prototype chain for this test. Use `typeof` or a domain-specific predicate when the question is about primitive type.

**Q: Why is `value.constructor === User` not equivalent?**

`constructor` is just a property lookup. It can be shadowed by an own property, inherited from a changed prototype, or missing entirely on an object created with `Object.create(null)`. `instanceof User` checks whether `User.prototype` is in the actual prototype chain, which is the relationship the operator is designed to test.

**Q: How can `Symbol.hasInstance` change `instanceof`?**

If the right-hand object has a callable `Symbol.hasInstance`, native `instanceof` calls it with the left-hand value and uses its boolean result. A class can therefore define membership by a rule such as “is an even number,” even though numbers do not inherit from that class's prototype. A loop that only reads `.prototype` cannot reproduce that customization.

**Q: Is a custom prototype walk equivalent to native `instanceof`?**

Only for the ordinary case it explicitly models. Native behavior also includes `Symbol.hasInstance`, callable and constructable checks, bound-function behavior, and realm-specific identities. In production code use native `instanceof` when you need its full contract; write a helper for teaching or for a clearly documented narrower predicate.

**Q: What is the difference between `instanceof` and `Array.isArray`?**

`instanceof` asks whether a prototype object appears in a particular realm's chain. `Array.isArray` asks whether the value has the array brand, so it remains reliable across realms such as an iframe. Use `instanceof` for a local class/prototype relationship and `Array.isArray` when the semantic requirement is “is an array.”

## 6. The Traps — What Goes Wrong

- **Comparing the constructor to the value.** `value === Constructor` asks whether both operands are the same reference, which is almost never the intended relationship. Compare the chain's prototype objects instead.

- **Starting at the value rather than its prototype.** `Constructor.prototype` is not normally the value itself. The search starts with `Object.getPrototypeOf(value)`, then moves upward one link at a time.

- **Checking only the immediate prototype.** A direct check can identify `Dog`, but it misses `Animal` and `Object`. Keep walking until a match or `null`.

- **Boxing primitives accidentally.** `Object.getPrototypeOf(42)` can expose a boxed-number prototype in modern runtimes, but native `42 instanceof Number` is still false. Explicitly return false for primitives before walking.

- **Treating `constructor` as proof.** An object can have `constructor: User` as an own property without inheriting from `User.prototype`. That property is metadata/convention, not the chain itself.

- **Forgetting the right-hand-side error.** `value instanceof 42` throws a `TypeError`; it does not return false. A custom helper should define and test the same invalid-input boundary it claims to support.

- **Ignoring `Symbol.hasInstance`.** A raw walk can disagree with native `instanceof` when the right-hand side customizes membership. If behavior must match the operator, call the protocol rather than bypassing it.

- **Assuming cross-realm constructors are interchangeable.** An iframe's `Array.prototype` is a different object from the main window's `Array.prototype`. Prototype identity is realm-local, so use brand checks such as `Array.isArray` when values can cross realms.

- **Mutating a constructor's prototype after construction.** Existing objects keep their current `[[Prototype]]` link. Reassigning `User.prototype` changes what future instances link to; it does not retroactively move old instances into the new chain.

## 7. Compare With Related Concepts

| Comparison | Key difference | When to use which |
| --- | --- | --- |
| `instanceof` vs `typeof` | `instanceof` checks object prototype lineage; `typeof` reports a coarse runtime category such as `"string"` or `"function"`. | Use `instanceof` for a class/prototype relationship; use `typeof` for primitive/function guards. |
| `instanceof` vs `Array.isArray` | `instanceof Array` depends on a particular `Array.prototype`; `Array.isArray` performs a cross-realm-safe array brand check. | Use `Array.isArray` when the requirement is specifically “an array,” especially at browser boundaries. |
| `instanceof` vs `constructor ===` | `instanceof` walks prototype links; `constructor` is an ordinary, mutable property that can be shadowed or repaired incorrectly. | Use `instanceof` for lineage; use a constructor property only as a convention you control and have validated. |
| `instanceof` vs `Object.getPrototypeOf` | `instanceof` answers whether a target appears anywhere in the chain; `Object.getPrototypeOf` returns one immediate link. | Use the first for membership; use the second when inspecting or deliberately building a prototype chain. |
| `instanceof` vs `in` | `instanceof` compares prototype identity; `in` searches for a named property anywhere in the property chain. | Use `instanceof` for type lineage; use `in` for property availability. |

## 8. 🧠 The Memory Hook — What Sticks

Picture `instanceof` climbing a ladder: start one rung above the value, compare each prototype rung to `Constructor.prototype`, and stop at the first match or at `null`. It is lineage by object identity—not a name check, not a shape check—with `Symbol.hasInstance` as the deliberate rule-change button.
