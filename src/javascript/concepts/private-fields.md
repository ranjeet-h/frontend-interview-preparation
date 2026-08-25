# JavaScript Private Fields and Methods

## 1. Why This Exists — The Problem First

An SDK client often has state that its users must not be able to corrupt: an access token, a retry counter, a socket, or a cache. If that state is stored as `this._token`, the underscore only asks callers to behave. They can still overwrite it, serialize it, or build code that depends on an implementation detail you wanted to change.

JavaScript private fields and methods solve that specific problem with language-enforced access. They let a class expose a small public API while keeping its internal state out of normal property access and reflection. That is useful for correctness and encapsulation; it is not a promise that a browser-held secret is safe from the person who controls the browser.

## 2. The Analogy — Make It Obvious

Think of a class as a workshop with a public counter and a locked workroom. Customers can use the services offered at the counter, but they cannot open the workroom door, rename a tool inside it, or ask the building directory for the hidden room. The workshop staff can use the tools because their instructions were written inside the workshop.

In JavaScript, public properties and methods are the counter. A `#token` field or `#refresh()` method is the locked workroom. The class body is the trusted set of instructions that has the key. A subclass is a new workshop that may inherit the parent’s public counter and may receive the parent’s locked room when it constructs a parent portion, but it does not receive the parent’s key name: the subclass cannot write `this.#token` unless it declared its own `#token`.

The analogy also explains a brand check. An object is allowed through a class’s private door only if that class initialized its private room on that object. A look-alike object with the same public shape is still refused.

## 3. How It Actually Works — The Full Explanation

The `#` is part of the identifier, not decoration. A class must declare `#count` before using that private name, and the name can be referenced only in the lexical body of the class that declared it. `account["#count"]` is a lookup for a public string property named `"#count"`; it does not mean the private field.

Private state is separate from ordinary object properties. It is not returned by `Object.keys`, `Object.getOwnPropertyNames`, `Reflect.ownKeys`, or `JSON.stringify`. There is no public property descriptor for a private field. A class can deliberately expose a value through a public method, but that exposure is an API decision rather than accidental property access.

Every private access checks a brand. When a constructor initializes `#count`, that instance receives the brand for the declaring class. Later, `this.#count` succeeds only when `this` carries that brand. Calling a method with the wrong receiver therefore throws a `TypeError`, even if the receiver has a public property with the same spelling. The check is about class identity, not about matching object shape.

Private methods and accessors use the same privacy rule. A private method is not placed on the public prototype as a callable string-keyed property. It can call other private names from the same class, while outside code can reach it only through a public method that chooses to delegate to it.

Inheritance has two easy-to-miss rules. First, constructing a derived instance runs the base constructor, so the object receives the base class’s private brand before the derived class initializes its own private fields. Second, private names are not inherited names. `Parent` can use `#value`, and `Child` can separately declare its own `#value`, but `Child` cannot use `Parent`’s `#value`. The two fields are independent even though their spelling is identical.

Static private members belong to the class constructor, not to instances. `#nextId` declared with `static` is available to static methods of the declaring class and is checked against the constructor object. Static private members are also not inherited as names. An inherited static method that uses `this.#secret` can fail when called with a subclass as `this`, because the subclass constructor does not carry the parent’s private brand; use the declaring class name when the operation must always target the parent’s static state.

Initialization order matters when private fields depend on one another. Within one class, instance fields initialize in source order before the constructor body continues. In a base class, fields initialize before the base constructor body. In a derived class, `super()` must run first; base initialization completes, then derived fields initialize, and only then does the rest of the derived constructor body run. Static fields initialize while the class definition is evaluated, in source order, before later code can use the class.

Native `#private` is runtime privacy, unlike TypeScript’s `private`, which primarily prevents type-checked source from accessing a member. Depending on compiler settings, TypeScript may emit an ordinary property or a helper-based representation; neither should be treated as a browser security boundary. Use `#` when the runtime object must reject accidental or direct access. Use a closure or `WeakMap` when the private state must live outside class syntax or be shared by functions that are not class methods.

## 4. Real Code — See It Working

This client keeps its token, retry state, and request construction private. The public `request` method is the only route that can use them, so callers cannot reset retries or replace the token by ordinary property access.

```js
class ApiClient {
  #token;
  #retries = 0;

  constructor(token) {
    // WHY: the token belongs to the client instance, not to the public API.
    this.#token = token;
  }

  #buildHeaders() {
    // WHY: keeping header construction private prevents callers from
    // depending on how authentication is represented internally.
    return { Authorization: `Bearer ${this.#token}` };
  }

  request(path) {
    this.#retries += 1;
    return {
      path,
      headers: this.#buildHeaders(),
      attempt: this.#retries,
    };
  }
}

const client = new ApiClient("demo-token");
console.log(client.request("/orders"));
console.log(client["#token"]); // undefined: this asks for a public key.
console.log(Object.keys(client)); // []: private fields are not enumerable.
```

The next example makes the brand check visible without trying to access a private name from outside the class. The `static has` method is allowed to ask whether an object carries this class’s private brand.

```js
class Vault {
  #value;

  constructor(value) {
    this.#value = value;
  }

  static hasBrand(candidate) {
    // WHY: `#value in` checks class identity, not whether a public key exists.
    return #value in candidate;
  }

  read() {
    return this.#value;
  }
}

const vault = new Vault(42);
console.log(Vault.hasBrand(vault)); // true
console.log(Vault.hasBrand({})); // false
console.log(Vault.hasBrand({ "#value": 42 })); // false
```

Parent and child private state can coexist, but the child cannot use the parent’s private name. The `super()` call creates the parent portion first, then the child’s own field is initialized.

```js
class Parent {
  #label = "parent";

  parentLabel() {
    return this.#label;
  }
}

class Child extends Parent {
  #label = "child";

  labels() {
    // WHY: these are two different private names owned by two classes.
    return [super.parentLabel(), this.#label];
  }
}

console.log(new Child().labels()); // ["parent", "child"]
```

Static private state is attached to the declaring constructor. The public static method uses `Counter.#next` instead of `this.#next`, so calling it through a subclass still updates the same private counter.

```js
class Counter {
  static #next = 0;

  static allocate() {
    // WHY: the declaring class is the guaranteed owner of this static brand.
    Counter.#next += 1;
    return Counter.#next;
  }
}

class SpecialCounter extends Counter {}

console.log(Counter.allocate()); // 1
console.log(SpecialCounter.allocate()); // 2
```

Finally, field order is observable when one field reads another. The initializer for `#snapshot` sees the earlier field, while a later field cannot be used until its own initializer runs.

```js
class Session {
  #user = "ada";
  #snapshot = `${this.#user}:ready`;

  describe() {
    return this.#snapshot;
  }
}

console.log(new Session().describe()); // "ada:ready"
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What makes a JavaScript `#field` genuinely private?**

The hash-prefixed name is a language-level private name. It is not a string key in the object’s ordinary property space, and the engine rejects references from outside the declaring class body. An object can have a public property named `"#field"` without that property having any connection to the private field.

**Q: What is a brand check?**

A brand check asks whether the receiver was initialized by the class that declared the private name. `this.#value` performs that check before reading or writing. Inside the declaring class, `#value in candidate` exposes the check as a boolean. A plain object with the right public keys fails because private access depends on class identity, not duck typing.

**Q: Can a subclass access a parent’s private field?**

No. The parent’s private name is available only in the parent class body. A derived instance normally carries the parent brand because `super()` constructs the parent portion, so a parent method called on that instance can still read the parent field. The subclass itself must use a public method supplied by the parent or declare a separate private field.

**Q: Are private fields inherited or overridden?**

The private name is not inherited, and it cannot be overridden by a public property. A child may declare its own `#value`; that is a distinct name and distinct storage from the parent’s `#value`. Both can exist on the same instance without colliding.

**Q: How do private methods differ from private fields?**

Both use the same lexical access and brand rules. A private field stores per-instance data; a private method supplies an implementation detail that the class can call. Neither is available through bracket notation or ordinary reflection. Choose a private method when the hidden thing is behavior rather than state.

**Q: How do static private members differ from instance private members?**

An instance private member is branded onto each constructed object. A static private member is branded onto the class constructor during class evaluation. Instance methods use it through an instance receiver; static methods use it through the declaring constructor. Static private members are useful for class-wide counters, registries, or caches that should not become public constructor properties.

**Q: What happens if a method using `#value` is detached?**

The method can lose its receiver just like any other normal method. Calling a detached method may make `this` undefined or point to the wrong object, and the private access then throws. Bind the method, call it with the correct receiver, or expose an arrow-function wrapper when preserving the receiver is part of the API design.

**Q: Is `#private` a way to hide a frontend secret?**

It hides a field from direct object access, accidental mutation, and ordinary reflection. It does not make a token secret from the user who owns the browser, from code that can call the client’s public methods, or from a debugger controlling the runtime. Put real authorization secrets on a server; use `#` to protect object invariants and implementation details.

**Q: When would you choose a closure or `WeakMap` instead?**

Use `#` for a class-native API with clear per-instance hidden state. Use a closure when the state belongs to one factory-produced object and no class syntax is needed. Use `WeakMap` when several functions or classes need coordinated private storage, when supporting older targets through a deliberate compatibility strategy, or when you need private data without changing the class’s declared names. Each option changes ergonomics, tooling, and memory behavior, so choose from the API boundary rather than from the word “private” alone.

## 6. The Traps — What Goes Wrong

**Treating `_value` as protection.** An underscore is a convention. `object._value = 0` works, and `_value` can appear in keys and JSON. Use `_value` only when public-but-internal-by-convention is acceptable; use `#value` when direct runtime access must fail.

**Trying bracket notation.** `object["#value"]` looks plausible but searches for a public string property. It returns `undefined` unless somebody explicitly created that public property. There is no computed private access such as `object[name]` where `name` is `"#value"`.

**Calling a private method with the wrong receiver.** A method borrowed from one instance and called on another object can throw a `TypeError` because the receiver lacks the declaring class’s brand. The same applies to `Reflect.apply`; changing the call mechanism does not bypass privacy.

**Assuming a child’s same-spelled field is the parent field.** In `Parent` and `Child`, `#value` in each class names two different private names. A parent method reads the parent slot; a child method reads the child slot. If the child needs controlled access to parent state, the parent must expose a public method.

**Reading a later field during initialization.** Field initializers run in source order. A field cannot rely on a later private field being initialized, and a derived field cannot run before `super()`. Arrange dependencies in declaration order or make initialization explicit in the constructor.

**Using `this.#staticValue` for inherited static calls.** A static private brand belongs to the declaring constructor, not every subclass constructor. In a static method inherited by a child, `this` may be the child constructor and fail the brand check. Use `Base.#staticValue` when the parent owns the state, or deliberately declare separate static state in each class.

**Treating privacy as security.** Private fields prevent object-shape access; they do not encrypt data or protect a frontend from its operator. Do not put server-only credentials in a browser bundle merely because the value sits behind `#`.

## 7. Compare With Related Concepts

**`#private` vs `_private`:** `#private` is runtime-enforced and absent from ordinary reflection; `_private` is a normal public property with a naming convention. Use `#` when outside code must be rejected. Use `_` when a public convention is enough and serialization/debugging visibility is useful.

**`#private` vs TypeScript `private`:** `#private` remains a JavaScript runtime feature; TypeScript `private` mainly constrains type-checked source and its emitted representation depends on the compiler target. Use `#` when the JavaScript runtime itself must enforce the boundary. Use TypeScript `private` when the main goal is editor/type feedback and the emitted object shape is acceptable.

**`#private` vs closure privacy:** `#private` keeps state next to class methods and gives a natural per-instance object model. A closure hides variables in a factory’s lexical scope and can avoid class syntax. Use `#` for class inheritance and explicit private methods; use a closure for a small factory with no need for class identity.

**`#private` vs `WeakMap`:** `#private` is concise native syntax and has direct brand checks. A `WeakMap` stores private data outside the instance and can be shared by code that has the map, but it requires more bookkeeping. Use `WeakMap` when multiple cooperating functions need the same hidden store or when the class cannot declare the private names; otherwise prefer `#` for clarity.

**Instance private vs static private:** Instance private state is one copy per object; static private state is one hidden slot on the declaring constructor. Use instance state for object-specific invariants such as a client token. Use static state for class-wide coordination such as an ID allocator, while keeping inheritance behavior explicit.

## 8. 🧠 The Memory Hook — What Sticks

`#name` is not a secret spelling for a property; it is a private door with a class-specific key. An object must carry the declaring class’s brand to open that door, which is why reflection, bracket notation, look-alike objects, and subclasses cannot sneak through.
