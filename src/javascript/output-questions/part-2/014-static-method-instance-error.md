# Why a Static Method Is Not Available on an Instance

## The Code

```javascript
class Chameleon {
  static colorChange(newColor) {
    this.newColor = newColor;
    return this.newColor;
  }

  constructor({ newColor = "green" } = {}) {
    this.newColor = newColor;
  }
}
const freddie = new Chameleon({ newColor: "purple" });
console.log(freddie.colorChange("orange"));
```

## The Answer

The code throws a `TypeError` because `freddie.colorChange` is not a function.

The `static` keyword puts `colorChange` on the `Chameleon` class itself. It does not put the method on `Chameleon.prototype`, which is where ordinary instance methods live. `freddie` is an instance, so its lookup checks Freddie first and then `Chameleon.prototype`; it never finds the static method on the class constructor.

The constructor does run successfully and gives Freddie an instance property:

```text
freddie.newColor === "purple"
```

The failure happens only when JavaScript tries to call `freddie.colorChange(...)`.

## Execution — Walk Through It Like the JS Engine

JavaScript first evaluates the class declaration. That creates the `Chameleon` constructor function and its related prototype object. The class has two different places where methods can be attached:

- `Chameleon.colorChange` refers to the static method on the constructor itself.
- `Chameleon.prototype` contains methods that instances can inherit, but it does not contain `colorChange` here.

The constructor's default parameter is prepared so that calling `new Chameleon(...)` can accept an options object. Next, JavaScript evaluates:

```javascript
const freddie = new Chameleon({ newColor: "purple" });
```

`new` creates a fresh object, links that object to `Chameleon.prototype`, and calls the constructor with the options object. The constructor assigns `"purple"` directly to the new object's own `newColor` property. The resulting object is stored in `freddie`.

Then JavaScript evaluates the final line. Property lookup for `freddie.colorChange` proceeds like this:

1. Check Freddie's own properties. There is `newColor`, but no `colorChange`.
2. Follow Freddie's prototype link to `Chameleon.prototype`. There is no `colorChange` there either.
3. Continue up the prototype chain. No inherited instance method named `colorChange` is found.

The static method is located at `Chameleon.colorChange`, beside the constructor's other class-level properties. It is not part of Freddie's prototype chain. The lookup therefore produces `undefined`, and attempting to call `undefined` as a function throws the `TypeError` before the static method body can run. The string `"orange"` is never assigned.

If the call were written for the class itself, it would work:

```javascript
console.log(Chameleon.colorChange("orange")); // orange
console.log(Chameleon.newColor); // orange
```

That call also shows what `this` means inside a static method: when called as `Chameleon.colorChange(...)`, `this` is the `Chameleon` constructor object, not a `Chameleon` instance.

## The Concept This Question Tests

This tests the difference between static methods and instance methods, plus how property lookup follows the prototype chain.

An instance method is declared without `static`:

```javascript
class Chameleon {
  colorChange(newColor) {
    this.newColor = newColor;
    return this.newColor;
  }
}

const freddie = new Chameleon();
freddie.colorChange("orange"); // works
```

That method is stored on `Chameleon.prototype`, so every instance can find it through inheritance. The method is shared rather than copied into every instance.

A static method is for the class as a whole:

```javascript
class Chameleon {
  static colorChange(newColor) {
    return newColor;
  }
}

Chameleon.colorChange("orange"); // works
```

Static methods are useful for factories, validation, parsing, or utilities that do not need one particular instance's state. Instance methods are for behavior that operates on the object created by `new`.

The two namespaces are separate. `Chameleon.colorChange` and `freddie.colorChange` are different property lookups, even though both expressions begin with the same class concept.

## The Trap — Why Most People Get It Wrong

The common mistaken assumption is that a method declared inside a class automatically becomes available on every object created from that class. That is true only for ordinary methods. `static` deliberately opts the method out of instance inheritance.

Another trap is confusing the class with its instances. `Chameleon` is the constructor object; `freddie` is an object created by that constructor. The class can have properties and methods of its own, just as Freddie can have properties and inherited methods of his own.

The fix depends on the intended owner:

```javascript
// Class-level behavior.
Chameleon.colorChange("orange");

// Per-instance behavior: remove `static` from the method declaration.
class AnotherChameleon {
  colorChange(newColor) {
    this.newColor = newColor;
    return this.newColor;
  }
}

const another = new AnotherChameleon();
another.colorChange("orange");
```

Calling `freddie.colorChange` cannot be repaired by changing `this` inside the static method, because the method body is never entered. The failure occurs earlier, during property lookup and the attempted call.

## 🧠 The Memory Hook

Think of the class as the office and each instance as a customer: `static` leaves the method in the office, while a normal class method puts it on the shared customer-service desk (`prototype`) that every customer can reach. `Class.method()` is a class call; `instance.method()` can only find instance methods.
