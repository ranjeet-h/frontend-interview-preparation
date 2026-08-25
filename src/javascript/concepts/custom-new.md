# Custom `new` Operator

## 1. Why This Exists — The Problem First

An interview or a legacy JavaScript codebase may ask you to recreate `new` without using the keyword. The easy answer—“make an object and call the function”—is incomplete. A correct implementation must preserve three observable behaviors: the instance delegates to the constructor’s prototype, the constructor runs with that instance as `this`, and an explicitly returned object or function can replace the instance.

If any step is missed, the bug is concrete. Methods defined on the prototype disappear when `{}` is used, constructor fields are written to the wrong object when `this` is not bound, and factory-style constructors return the wrong value when object returns are ignored. The useful interview skill is therefore not memorizing a snippet; it is tracing what `new Constructor(args)` makes visible to the caller.

## 2. The Analogy — Make It Obvious

Think of `new` as a workshop order for a reusable product template. First, the workshop gives the product an empty shell and attaches the template’s shared instruction manual—the constructor’s `prototype`. Then a worker runs the constructor while holding that shell as `this`, filling in instance data such as `name` or `id`. Finally, the shipping desk checks the worker’s explicit return: a non-null object or function is shipped instead; a primitive return is ignored and the prepared shell is shipped.

The instruction manual is shared by instances, while the shell is private to one call. Also, the constructor’s `.prototype` property and the instance’s internal `[[Prototype]]` link are different things: the first is a property on the constructor function, and the second is the link used during property lookup.

```txt
new Ctor(args)
    │
    ├─ create shell with [[Prototype]] = Ctor.prototype
    ├─ call Ctor with shell as this
    └─ return object/function result, otherwise shell
```

## 3. How It Actually Works — The Full Explanation

For an ordinary constructable function, `new Ctor(...args)` follows this observable sequence:

1. Create a fresh object. Its prototype is the object in `Ctor.prototype`. If that property is not an object, the native operation uses the default object prototype instead.
2. Call `Ctor` with the fresh object as `this`, forwarding the arguments.
3. If the constructor returns a non-null object or a function, return that value. Otherwise—including `undefined`, `null`, numbers, strings, and booleans—return the fresh object.

`Object.create(Ctor.prototype)` performs the first step when `Ctor.prototype` is a valid object. `Ctor.apply(instance, args)` performs the second step for an ordinary function. The final test must treat functions as objects for this rule, and must exclude `null` because `typeof null` is the historical string `"object"`.

There is one important observable difference that this helper does not reproduce: `Ctor.apply(instance, args)` is an ordinary function call, so `new.target` inside `Ctor` is `undefined`. Native `new Ctor(...args)` invokes the constructor through construct semantics, so `new.target` is `Ctor` (or the derived constructor when construction is delegated). A userland helper cannot replace the built-in `new.target` binding while still using `apply`; preserving it requires a construct operation such as `Reflect.construct`, which changes the manual shell-and-`apply` algorithm and brings native construction boundaries with it.

```js
function myNew(Ctor, ...args) {
  if (typeof Ctor !== "function") {
    throw new TypeError("Ctor must be a constructor function");
  }

  const proto = Ctor.prototype;
  const instance = Object.create(
    proto !== null && (typeof proto === "object" || typeof proto === "function")
      ? proto
      : Object.prototype,
  );
  const result = Ctor.apply(instance, args);

  return result !== null &&
    (typeof result === "object" || typeof result === "function")
    ? result
    : instance;
}
```

That helper intentionally targets ordinary function constructors. It is not a universal replacement for the language operator: ES classes cannot be invoked with `.apply`, and native construction also involves internal construct behavior that user code cannot reproduce for every built-in or exotic callable. A production API should normally use `new` directly; `myNew` is a teaching and interview implementation.

Prototype lookup explains why the link matters. If `instance.describe` is absent as an own property, JavaScript checks the object referenced by `Ctor.prototype`, then continues up that object’s prototype chain. Reassigning `Ctor.prototype` later changes the prototype used by future constructions; it does not retroactively change existing instances.

## 4. Real Code — See It Working

Run this complete fixture with `node custom-new-demo.js` (or paste it into Node). It verifies instance fields, shared prototype methods, forwarded arguments, primitive and `null` returns, object replacement, function replacement, invalid input, and the native fallback when `.prototype` is not an object.

```js
"use strict";

function myNew(Ctor, ...args) {
  if (typeof Ctor !== "function") {
    throw new TypeError("Ctor must be a constructor function");
  }

  const proto = Ctor.prototype;
  const instance = Object.create(
    proto !== null && (typeof proto === "object" || typeof proto === "function")
      ? proto
      : Object.prototype,
  );
  const result = Ctor.apply(instance, args);

  return result !== null &&
    (typeof result === "object" || typeof result === "function")
    ? result
    : instance;
}

function User(name, role) {
  this.name = name;
  this.role = role;
  return "ignored primitive";
}

User.prototype.label = function label() {
  return `${this.name} (${this.role})`;
};

const user = myNew(User, "Asha", "admin");
console.log(user.label()); // Asha (admin)
console.log(Object.getPrototypeOf(user) === User.prototype); // true

function ReturnsObject() {
  this.discarded = true;
  return { kind: "replacement" };
}

function ReturnsFunction() {
  return function replacement() {};
}

function ReturnsNull() {
  this.kept = true;
  return null;
}

console.log(myNew(ReturnsObject)); // { kind: "replacement" }
console.log(typeof myNew(ReturnsFunction)); // function
console.log(myNew(ReturnsNull).kept); // true

function LoosePrototype() {}
LoosePrototype.prototype = null;
const fallback = myNew(LoosePrototype);
console.log(Object.getPrototypeOf(fallback) === Object.prototype); // true

function ReadsNewTarget() {
  this.seenNewTarget = new.target;
}

const customTarget = myNew(ReadsNewTarget);
const nativeTarget = new ReadsNewTarget();
console.log(customTarget.seenNewTarget === undefined); // true: apply is an ordinary call
console.log(nativeTarget.seenNewTarget === ReadsNewTarget); // true: native new supplies new.target

try {
  myNew({});
} catch (error) {
  console.log(error instanceof TypeError); // true
}
```

The discarded `this` in `ReturnsObject` is not observable after the constructor returns because the replacement object is the value the caller receives. The assignments made before the return still happened on the temporary instance; the return rule determines which reference escapes.

A native class shows an important boundary:

```js
class Account {
  constructor(id) {
    this.id = id;
  }
}

const account = new Account("acct-7");
console.log(account.id); // acct-7

// Account.apply({}, ["acct-8"]); // TypeError: class cannot be invoked this way
```

Classes are constructable through `new`, but their constructors deliberately reject ordinary calls. A custom helper based on `apply` cannot faithfully invoke them.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are the four steps of `new`?**

Create a fresh object, link it to the constructor’s prototype, call the constructor with that object as `this`, and return a non-null object/function returned by the constructor; otherwise return the fresh object. Prototype linkage and constructor execution are separate steps even though `Object.create` and `apply` make the custom version compact.

**Q: Why use `Object.create` instead of `{}`?**

`{}` creates an object whose prototype is `Object.prototype`. It does not connect the result to `Ctor.prototype`, so inherited constructor methods and `instanceof Ctor` behavior are lost. `Object.create(Ctor.prototype)` establishes the intended `[[Prototype]]` link at creation time.

**Q: Why is `result !== null` required?**

Because `typeof null` is `"object"`. Without the explicit null check, a constructor that returns `null` would incorrectly replace the fresh instance. Native `new` ignores `null` for the return override rule.

**Q: What happens when a constructor returns a primitive?**

The primitive is ignored and the object created by `new` is returned. This includes `undefined`, `null`, numbers, strings, and booleans. Only a non-null object or a function replaces the created instance.

**Q: Why must functions count as replacement objects?**

The specification’s replacement category includes objects and functions. A constructor returning a function therefore returns that function. Checking only `typeof result === "object"` would be incomplete.

**Q: What is the difference between `Ctor.prototype` and `Object.getPrototypeOf(instance)`?**

`Ctor.prototype` is a normal property on the constructor function. `Object.getPrototypeOf(instance)` reads the instance’s `[[Prototype]]` link. For a normal construction they initially refer to the same object, but they are different locations and can be changed independently.

**Q: Why can’t the helper call an ES class with `apply`?**

An ES class constructor has construct behavior but rejects ordinary function calls. `Ctor.apply(instance, args)` is an ordinary call, so it throws for a class. Matching all native constructable values would require runtime-internal behavior unavailable to a simple userland helper.

**Q: Does `myNew` preserve `new.target`?**

No. The constructor is reached through `Ctor.apply(instance, args)`, which is an ordinary call, so `new.target` is `undefined` inside it. Native `new Ctor()` sets `new.target` to `Ctor`. `Reflect.construct(Ctor, args, Ctor)` can request native construct semantics, but that changes the helper from a manual emulation into a wrapper around the runtime’s construction operation.

**Q: Is `myNew` equivalent to native `new` for every constructor?**

No. It models ordinary user-defined function constructors. Native `new` supports built-ins and internal slots, enforces constructor-specific behavior, and invokes internal `[[Construct]]` semantics. State the scope of the helper instead of claiming a complete replacement.

## 6. The Traps — What Goes Wrong

- **Using `{}` for the shell.** Wrong assumption: any empty object is enough. Why it fails: the result will not delegate to `Ctor.prototype`. What actually happens: own fields may work, but prototype methods and the expected prototype identity do not.

- **Calling `Ctor(...args)` without binding `this`.** Wrong assumption: the constructor will automatically initialize the shell. Why it fails: ordinary function calls choose `this` from their call site. What actually happens: strict constructors see `undefined`, while sloppy constructors can write to the global object.

- **Checking only `typeof result === "object"`.** Wrong assumption: functions cannot be constructor replacements. Why it fails: the return rule includes functions. What actually happens: a function result is incorrectly discarded.

- **Forgetting `null`.** Wrong assumption: every value reported as an object is a valid replacement. Why it fails: `typeof null` is `"object"`. What actually happens: `null` escapes instead of the initialized instance.

- **Treating a primitive return as an override.** Wrong assumption: any explicit `return` wins. Why it fails: native construction only honors non-null object/function returns. What actually happens: the fresh instance is still returned.

- **Claiming the helper supports classes.** Wrong assumption: every constructor function accepts `.apply`. Why it fails: class constructors reject ordinary calls. What actually happens: `TypeError` is thrown, even though `new ClassName()` works.

- **Assuming `apply` preserves `new.target`.** Wrong assumption: binding a fresh object as `this` makes the call equivalent to construction. Why it fails: `apply` performs an ordinary call, where `new.target` is `undefined`. What actually happens: constructors that branch on `new.target` can observe different behavior under `myNew` and native `new`; use native construction when that distinction matters.

- **Ignoring a non-object `.prototype`.** Wrong assumption: `Object.create(Ctor.prototype)` always matches native behavior. Why it fails: native construction falls back to `Object.prototype` when the prototype property is not an object. What actually happens: a naive helper can throw or create the wrong prototype.

- **Confusing the constructor property with an instance method.** Wrong assumption: every instance has its own `.prototype`. Why it fails: `.prototype` is normally a property of the constructor function. What actually happens: inspect `Object.getPrototypeOf(instance)` to examine the instance link.

## 7. Compare With Related Concepts

| Compared ideas | Key difference | When to use |
| --- | --- | --- |
| `new` vs `Object.create` | `new` links a prototype, runs a constructor, forwards arguments, and applies return rules; `Object.create` only creates an object with a chosen prototype. | Use `Object.create` when no constructor side effects or initialization call is wanted. |
| `new` vs a factory function | `new` supplies a fresh `this` and prototype linkage; a factory explicitly creates and returns its result. | Prefer factories when explicit return values, composition, or private closures are clearer than prototype construction. |
| `Ctor.prototype` vs instance own properties | Prototype properties can be shared through lookup; assignments such as `this.name = name` create own properties on each instance. | Put shared methods on the prototype and per-instance state on `this`. |
| constructor call vs ordinary call | `new Ctor()` invokes construct behavior and supplies a new receiver; `Ctor()` is a normal call whose `this` depends on strictness and call site. | Use `new` only for constructable functions designed to initialize instances. |
| function constructor vs class | Both support `new`, but a function constructor can also be called ordinarily; a class constructor rejects ordinary calls. | Use classes for modern syntax, while remembering that userland `apply` cannot emulate class construction. |
| native `new` vs `myNew` | Native `new` uses engine-level `[[Construct]]` behavior for all supported constructors; the helper models ordinary function constructors. | Use `myNew` to demonstrate mechanics or solve a constrained interview exercise, not as a general production replacement. |

## 8. 🧠 The Memory Hook — What Sticks

`new` is a four-stop workshop: make the shell, attach the prototype manual, run the constructor with the shell as `this`, then ship a non-null object/function return—or the shell if the return is primitive. Remember **shell → prototype → `this` → return**, and a custom `myNew` becomes a traceable sequence instead of a magic snippet.
