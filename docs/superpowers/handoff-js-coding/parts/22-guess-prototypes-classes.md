## Method found on the prototype, not the instance

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
function Person(name) {
  this.name = name;
}
Person.prototype.sayHello = function () {
  return "Hello, " + this.name;
};

const p = new Person("A");
console.log(p.sayHello());
console.log(p.hasOwnProperty("sayHello"));
console.log(p.hasOwnProperty("name"));
```

### Output

```text
Hello, A
false
true
```

### Explanation

Setup: `Person.prototype` is an object created automatically with the function. Assigning `Person.prototype.sayHello` adds one function object shared by all instances. Execution: `new Person("A")` creates a fresh object, sets its internal `[[Prototype]]` to `Person.prototype`, runs the constructor with `this` bound to the fresh object, so the instance gets an own property `name = "A"` — nothing else. `p.sayHello()` resolves `p` first (no own `sayHello`, hence `hasOwnProperty` is `false`), then follows the link to `Person.prototype` and finds the method there. The call is still a method call on `p`, so inside `sayHello` the receiver `this` is `p`, and `this.name` reads the own property `"A"`.

### The Rule

Property lookup walks a chain: own properties first, then `[[Prototype]]`, then its prototype, until `Object.prototype` and finally `null`. Methods live once on the prototype and are shared; data assigned via `this.x = ...` in the constructor lives per instance. Lookup determines *where the function is found*; the call site determines `this`.

### How to Rewrite It Safely

Nothing is broken — this is the canonical pattern to internalise. The variation that breaks it is defining the method inside the constructor (`this.sayHello = function ...`), which works but allocates one closure per instance. Prefer prototype (or `class`) methods for shared behaviour and constructor assignment for per-instance state.

### Takeaway

If an instance lacks an own property, the engine walks the prototype chain; shared methods belong on the prototype while per-instance data belongs on the instance.

## `__proto__` points at the constructor's `prototype`, which points back

`Difficulty: Easy` `Probability: Medium`

### The Code

```javascript
function Person() {}
const person = new Person();

console.log(person.__proto__ === Person.prototype);
console.log(Person.prototype.constructor === Person);
console.log(person.constructor === Person);
```

### Output

```text
true
true
true
```

### Explanation

Setup: every function `Person` gets a `Person.prototype` object whose sole preinstalled own property is `constructor`, pointing back at `Person`. Execution: `new Person()` creates an object whose internal `[[Prototype]]` is set to exactly `Person.prototype`. `person.__proto__` is the legacy accessor for that internal slot, so the first comparison is `true` — same object identity, not a copy. The second line reads the back-pointer installed at setup, so it is `true`. The third line finds no own `constructor` on `person`, walks the chain to `Person.prototype.constructor`, and reaches `Person` — `true` without the instance storing anything.

### The Rule

`new F()` links the instance's `[[Prototype]]` to `F.prototype`, and `F.prototype.constructor` links back to `F`. `__proto__` exposes the instance side of that link (prefer `Object.getPrototypeOf` in real code). `instance.constructor` is inherited, not own, and breaks if the prototype object is replaced without restoring `constructor`.

### How to Rewrite It Safely

This demonstrates the correct mental model. The variation that breaks it is `Person.prototype = { sayHi() {} }` — a wholesale replacement that discards the `constructor` back-pointer, after which `person.constructor === Person` becomes `false` (it resolves to `Object`). Prefer `Object.getPrototypeOf(person) === Person.prototype` over `__proto__`, and reassign `Constructor.prototype.constructor` whenever you replace a prototype object.

### Takeaway

Construction wires two links — instance to `Constructor.prototype`, and `Constructor.prototype` back to `Constructor` — and every `instance.constructor` read after that is just inherited lookup through the first link.

## `Object.create` inherits, assignment shadows

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
const parent = { value: 10 };
const child = Object.create(parent);

console.log(child.value);
child.value = 20;
console.log(child.value);
console.log(parent.value);
console.log(child.hasOwnProperty("value"));
```

### Output

```text
10
20
10
true
```

### Explanation

Setup: `Object.create(parent)` makes an empty object whose `[[Prototype]]` is `parent`; `child` starts with zero own properties. Statement 1 reads `child.value`: no own property, so lookup continues to `parent` and yields `10`. Statement 2 assigns `child.value = 20`. Assignment writes an *own* property on the receiver — it never mutates the prototype — so `child` now has its own `value` that shadows the inherited one. Statement 3 reads `child.value`: the own property wins, `20`. Statement 4 reads `parent.value`, which was never touched, `10`. The final `hasOwnProperty` confirms the timeline: `false` before the assignment, `true` after.

### The Rule

Reads walk the prototype chain; writes (plain `=` outside a setter) create or update an own property on the receiver. That own property then *shadows* the inherited one for all future reads on that object, while the prototype's value is unchanged for every other inheritor.

### How to Rewrite It Safely

This is the behaviour to internalise, not a bug. The dangerous variation is assuming spread or assignment clones the chain — `child.value = 20` looks like it "updates the shared value" but it forks it. If the intent is to update shared state, write to the prototype explicitly (`parent.value = 20`); if the intent is per-object state, keep the shadowing and check ownership with `hasOwnProperty` or `Object.hasOwn`.

### Takeaway

Inherited reads are shared but plain assignments are always own: writing `child.x` never changes `parent.x`, it shadows it.

## `super()` builds the instance, then the subclass overrides it

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
class Parent {
  constructor() {
    this.value = 10;
  }
  print() {
    console.log(this.value);
  }
}

class Child extends Parent {
  constructor() {
    super();
    this.value = 20;
  }
}

const c = new Child();
c.print();
console.log(c instanceof Parent);
console.log(c instanceof Child);
```

### Output

```text
20
true
true
```

### Explanation

Setup: `Child.prototype` links to `Parent.prototype`, so `print` is found one step up the chain. Execution of `new Child()`: the derived constructor starts with no usable `this` — accessing it before `super()` throws. `super()` runs `Parent`'s constructor with the new receiver, creating own property `value = 10`. Control returns to `Child`'s constructor, which assigns `this.value = 20` on the same object, overwriting the own property. `c.print()` finds `print` on `Parent.prototype` via the chain, calls it with `this = c`, and reads the current own `value`, `20`. Both `instanceof` checks walk `c`'s chain and each find the respective `prototype` object, so both are `true`.

### The Rule

In a derived class, `super()` must run before `this` is touched: it is the base constructor that initialises the instance. Later assignments in the subclass constructor overwrite the same own properties. Methods remain shared up the chain; `instanceof` simply tests whether a constructor's `prototype` appears anywhere in the object's chain.

### How to Rewrite It Safely

This demonstrates the correct pattern. The variations that break it: omitting `super()` (a derived constructor without `super()` throws `ReferenceError: Must call super constructor before accessing 'this'`), or assigning before `super()`. If the subclass needs no extra initialisation, omit the constructor entirely — the default derived constructor just forwards arguments to `super(...args)`.

### Takeaway

`super()` creates the base state, the subclass constructor then specialises it; method lookup still flows up the chain while `this` stays the single instance.

## A `static` field lives on the class, an instance field lives on the object

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
class Test {
  static value = 10;
  constructor() {
    this.value = 20;
  }
}

console.log(Test.value);
console.log(new Test().value);
console.log(new Test().hasOwnProperty("value"));
```

### Output

```text
10
20
true
```

### Explanation

Setup: `static value = 10` defines an own property `value` on the *constructor object* `Test` itself — it is `Test.value`, never on `Test.prototype` and never on instances. Execution: `Test.value` reads that constructor-own property directly, `10`. `new Test()` creates an instance whose chain is `instance -> Test.prototype -> Object.prototype`; the constructor body assigns an own property `value = 20` on the instance. Reading `(new Test()).value` checks the instance first, finds the own `20`, and never consults the class object — statics are not in any instance's lookup chain. `hasOwnProperty` confirms the `20` is the instance's own data.

### The Rule

`static` properties belong to the constructor (accessed as `ClassName.prop`, inherited through the constructor chain via `extends`, visible as `this.constructor.prop` but not as `this.prop`). Instance properties assigned in the constructor belong to each object. Same name, two namespaces — neither shadows the other through normal instance reads because instances never delegate to the constructor object.

### How to Rewrite It Safely

This demonstrates two coexisting namespaces. The bug-shaped variation is reading `this.value` inside an instance method expecting the static (`10`) and getting the instance field (`20`), or vice versa. Be explicit: use `Test.value` (or `this.constructor.value` for inherited statics) for class-level data and `this.value` for per-instance data, and do not reuse the same name for both unless the duality is deliberate.

### Takeaway

Statics live on the class object, instance state lives on each instance; `instance.value` never sees `Class.value` because the constructor is not in the instance's prototype chain.
