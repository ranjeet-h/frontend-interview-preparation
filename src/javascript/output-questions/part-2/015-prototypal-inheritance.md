# Prototypal Inheritance in JavaScript

## The Code

```javascript
let animal = {
  eats: true,
  walk() {
    console.log("Animal walks");
  },
};

let rabbit = {
  jumps: true,
  __proto__: animal, // Sets 'animal' as the prototype of 'rabbit'
};

rabbit.walk(); // Output: "Animal walks"
console.log(rabbit.eats); // Output: true
```

## The Answer

The output is:

```text
Animal walks
true
```

`rabbit` does not define `walk` or `eats` itself. Its own property is `jumps`; the `__proto__` shorthand makes `animal` its prototype. When JavaScript cannot find a requested property on `rabbit`, it continues the lookup on `animal`, so `rabbit.walk()` finds and calls `animal.walk`, while `rabbit.eats` finds `animal.eats`.

That relationship is prototypal inheritance: an object reuses another object's properties and methods through a prototype link. The rabbit is not a copy of the animal, and `animal` does not become a parent class in the classical sense. The objects remain separate; `rabbit` simply delegates missing property lookups to `animal`.

## Execution — Walk Through It Like the JS Engine

JavaScript first creates the `animal` object with two own properties: `eats`, whose value is `true`, and `walk`, whose value is a function. It then creates the `rabbit` object with its own `jumps` property. The `__proto__: animal` syntax sets rabbit's internal `[[Prototype]]` link to the `animal` object.

When execution reaches `rabbit.walk()`, the engine checks rabbit's own properties first. Rabbit has `jumps`, but no `walk`. The engine follows rabbit's `[[Prototype]]` link to `animal`, finds `walk` there, and calls that function. The method logs `Animal walks`.

For `rabbit.eats`, the engine performs the same search. There is no own `eats` property on rabbit, so it checks animal and finds `eats: true`. The expression therefore evaluates to `true` and `console.log` prints it.

The lookup would continue through animal's prototype if animal did not contain the property. Eventually the chain reaches `null`; at that point JavaScript returns `undefined` for a missing read, or throws when the code tries to call a missing value as a function.

The method is found on animal, but its receiver is still rabbit because the call expression is `rabbit.walk()`. That means `this` inside `walk` would be rabbit, not animal. Property reuse and the object receiving the method call are separate ideas.

## The Concept This Question Tests

Every ordinary object has an internal `[[Prototype]]` reference to another object or to `null`. `Object.getPrototypeOf(rabbit)` returns `animal`. The older `__proto__` accessor exposes the same relationship, but production code should generally use `Object.getPrototypeOf` to inspect it and `Object.setPrototypeOf` or object construction APIs when a relationship must be created explicitly.

Property access follows this rule:

1. Check the object's own properties.
2. If the property is absent, check its prototype.
3. Repeat until a value is found or the prototype is `null`.

An own property wins over an inherited property. For example, `rabbit.eats = false` would create or replace an own property on rabbit; it would not change `animal.eats`. Likewise, assigning `rabbit.walk = function () {}` would shadow the inherited method for rabbit only.

This is also how constructor functions and classes share methods. A class method is normally stored on the class's `.prototype` object, so every instance can find that method through its own prototype link. The same lookup mechanism powers both the direct object example here and class-based code.

## The Trap — Why Most People Get It Wrong

The first trap is thinking inheritance copies values into the child object. It does not. `rabbit.eats` works because lookup reaches animal at the moment of access. If `animal.eats` changes later, rabbit sees the new value unless rabbit has its own `eats` property.

The second trap is confusing an inherited property with an own property:

```javascript
console.log(Object.hasOwn(rabbit, "jumps")); // true
console.log(Object.hasOwn(rabbit, "eats")); // false
console.log("eats" in rabbit); // true: own or inherited
```

`Object.hasOwn` asks only about rabbit itself. The `in` operator asks whether the property exists anywhere along the prototype chain.

Another common mistake is assuming the method's defining object becomes `this`. In `rabbit.walk()`, lookup finds the function on animal, but the call receiver is rabbit. A detached call such as `const walk = rabbit.walk; walk()` no longer has rabbit as its receiver, so its `this` behavior is different.

Finally, `__proto__` is not a normal data property containing a copied object. In an object literal it sets the prototype, and in many environments it is an accessor inherited from `Object.prototype`. Use it carefully; accidental prototype mutation can make code harder to reason about and can introduce security issues when untrusted keys are merged into objects.

## 🧠 The Memory Hook

Think of an object as a desk with its own drawers and a note saying, “If the drawer is missing, ask this other desk.” JavaScript checks the current desk first, then follows that chain until it finds the property—or reaches `null`.
