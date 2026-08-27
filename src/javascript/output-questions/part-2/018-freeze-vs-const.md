# Object.freeze() vs const: Binding Immutability and Shallow Freezing

## The Code

```javascript
const person = { name: "John" };
person.name = "Doe"; // This is allowed
// person = {}; // This would throw a TypeError

const frozenPerson = Object.freeze({ name: "John" });
frozenPerson.name = "Doe"; // This will fail silently in non-strict mode.
console.log(frozenPerson.name); // Output: "John"
```

## The Answer

```text
John
```

`const` and `Object.freeze()` protect different things.

`const` protects the variable binding. After `person` has been made to refer to one object, the name `person` cannot be made to refer to a different object. It does not make the object itself read-only, so `person.name = "Doe"` is allowed.

`Object.freeze()` protects the object’s own structure and data properties. Once the object is frozen, changing `frozenPerson.name`, adding a property, or deleting a property has no effect in non-strict mode. The logged value therefore remains `John`.

The freeze is shallow. If the object contained another object, the outer object would be frozen but the nested object could still be changed unless it was frozen separately.

## Execution — Walk Through It Like the JS Engine

JavaScript first creates the `const` bindings and then executes the statements from top to bottom. A `const` binding must receive its value during initialization, so `person` is initialized to point at a newly created object:

```text
person ─────► { name: "John" }
```

The next line changes a property inside that object. It does not assign a new value to the `person` binding; it follows the reference and mutates the object it points to:

```text
person ─────► { name: "Doe" }
```

The commented line would attempt a different operation. `person = {}` would replace the binding’s reference with a new object. That is exactly what `const` forbids, so uncommenting it produces a `TypeError`.

Next, JavaScript creates another object and passes it to `Object.freeze()`. The method marks the object’s own properties as non-writable and non-configurable and prevents new own properties from being added. `frozenPerson` then receives the reference to that same, now-frozen object:

```text
frozenPerson ─────► { name: "John" }  [frozen]
```

The assignment `frozenPerson.name = "Doe"` still tries to reach the object through its reference. The important difference is that the property descriptor for `name` no longer permits a write. In ordinary, non-strict JavaScript, that failed write is ignored rather than reported as an exception. The object remains unchanged, so `console.log` prints `John`.

In strict mode, the same failed write throws a `TypeError` instead of failing silently. Freezing does not make the attempted assignment valid; it only changes how the runtime reports the invalid operation depending on the mode.

`Object.freeze()` also does not recursively walk every value reachable from the object. For example, freezing `{ settings: { darkMode: false } }` freezes the `settings` property itself, but not the nested settings object. The outer reference cannot be replaced, while `settings.darkMode` can still be changed.

## The Concept This Question Tests

This question tests the difference between a variable binding and the value held by that binding.

A binding is the association between an identifier and a value. `const person` makes the association stable: the identifier cannot be reassigned. The object is a separate thing in memory. Stability of the arrow from the name to the object does not automatically make the object’s contents stable.

`Object.freeze(value)` changes the object’s own property descriptors. Existing own properties become non-writable and non-configurable, and the object becomes non-extensible. This is a runtime operation on an object, not a declaration form for a variable. The object can still be referenced through a `let`, `var`, or `const` binding; the binding choice and the object’s frozen state are independent.

The word “immutable” needs precision here. A frozen object is shallowly immutable: its direct properties cannot be changed through normal JavaScript operations, but nested objects, arrays, Maps, Sets, and other referenced values are separate mutable objects unless they receive their own protection. A truly deeply immutable structure requires a recursive strategy with deliberate handling for cycles and special object types.

## The Trap — Why Most People Get It Wrong

The most common mistake is saying that `const` makes `person` immutable. It does not. It prevents this:

```javascript
const person = { name: "John" };
person = { name: "Doe" }; // TypeError
```

It does not prevent this:

```javascript
person.name = "Doe"; // Allowed: the object is still mutable
```

The opposite mistake is saying that `Object.freeze()` prevents reassignment of the variable. It does not. The binding determines that:

```javascript
let person = Object.freeze({ name: "John" });
person = { name: "Doe" }; // Allowed: `let` permits reassignment
```

Another trap is treating a frozen object as deeply frozen. In this example, only the outer object is frozen:

```javascript
const user = Object.freeze({ preferences: { theme: "light" } });
user.preferences.theme = "dark"; // Allowed: the nested object is not frozen
```

Finally, “fails silently” is mode-dependent. A write to a frozen property is ignored in non-strict mode, but strict mode throws a `TypeError`. The source example uses the non-strict behavior described in its comment; production code should not rely on silent failure to detect accidental mutations.

## 🧠 The Memory Hook

`const` locks the label to one box; `Object.freeze()` locks the box’s top-level contents. The label can be fixed while the box changes, and a frozen box can still contain smaller boxes that remain mutable.
