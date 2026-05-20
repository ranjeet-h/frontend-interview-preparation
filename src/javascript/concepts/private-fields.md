# Private Fields

## Detailed explanation
Private fields are class fields prefixed with `#`. They are accessible only inside class body. They give real language-level privacy, unlike naming conventions such as `_value`.

Frontend use: encapsulate class internals in SDK clients, data structures, widgets, and utilities.

## 1. One-line mental model
`#field` is class-private state enforced by JavaScript.

## 2. Problem it solves
Classes need internal data that outside code cannot read or mutate.

## 3. Core idea
- Prefix with `#`.
- Access only inside class.
- Not available through bracket notation.
- Different from TypeScript `private`.
- Useful for encapsulation.

## 4. Visual / analogy
Private field = locked drawer inside class.

```txt
class owns #secret
outside cannot read it
```

## 5. Minimal example

```js
class Counter {
  #count = 0;
  inc() {
    return ++this.#count;
  }
}
```

## 6. Real-world example

```js
class ApiClient {
  #token;
  constructor(token) {
    this.#token = token;
  }
}
```

## 7. Common interview questions

#### What are private fields?
- **The Engine Mechanism (Why it behaves this way):** Private fields (marked with a `#` prefix) are a native JavaScript feature (ECMAScript 2020) that enforces structural, runtime-level encapsulation on class instances. When the JavaScript engine compiles a class declaration, it adds the private identifiers to an internal private name map associated with the class constructor. During instantiation, the engine allocates slots in the memory structure of the instance specifically for these private fields. Unlike public fields which are stored as string keys in the object's standard property descriptor table, private fields are stored in a separate, inaccessible internal slot array. Access to these slots is governed strictly by the static lexical scope of the class body; the engine performs compile-time syntactical checks to ensure that any code containing `#identifier` is located physically inside the class braces.
- **The Unforgettable Mental Model:** A secret safe built inside a hotel room's walls. Only the hotel room's built-in automation system (methods defined inside the class) has the mechanical keycard to open this safe. Guests (outside code) can scan, touch, or inspect the visible furniture (public properties), but they don't even have a keyhole to try and pick the safe.
- **The Trap:** Thinking private fields can be declared dynamically or added to instances later. Because the engine checks for the `#` prefix statically at parsing time, attempting to use a private field that was not declared in the class header (e.g., `this.#unknownField = 1` inside a method) will throw a fatal compile-time `SyntaxError` before a single line of your script even runs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Private fields, declared with the hash prefix, represent native runtime-enforced privacy in modern JavaScript. They are not stored as standard string keys on the object's property table, but in dedicated internal slots. The JS engine validates access statically at compile time, guaranteeing that no external code, including reflection, dynamically evaluated bracket notation, or child subclasses, can access or mutate these internal states.'"

#### How differ from `_field`?
- **The Engine Mechanism (Why it behaves this way):** The underscore prefix (`_field`) is purely a stylistic naming convention popularized in the ES5 era. From the engine's perspective, `_field` is an ordinary public property. It is added to the object's key-value property map, is fully enumerable by default, shows up in `Object.keys()` and `JSON.stringify()`, and can be read or modified by any outside script. In contrast, a `#field` has absolute runtime protection: it does not appear in property enumerations, it is skipped by `JSON.stringify()`, and any attempt to read or write to it from outside the class throws a fatal error.
- **The Unforgettable Mental Model:** A "Do Not Enter" sign hung on an unlocked screen door (`_field`) vs a 12-inch steel vault door with a biometric scanner (`#field`). Anyone can ignore the sign and walk through the screen door, but the vault door is physically impassable.
- **The Trap:** Forgetting that `_field` is visible to analytics tools, logging libraries, and testing frameworks. If you store sensitive data like API tokens or credit card information in `_field`, they will be dumped into telemetry logs or serializations. Native `#fields` are naturally protected from accidental serialization.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'The underscore prefix is a legacy developer convention that signals intent but offers zero actual privacy; the field remains fully public and enumerable. Native `#` private fields, on the other hand, provide bulletproof runtime isolation. They cannot be discovered via property traversal, they are ignored during JSON serialization, and any external access immediately throws a runtime error.'"

#### Can outside code access `#field`?
- **The Engine Mechanism (Why it behaves this way):** No, outside code cannot access private fields under any standard circumstances. The JavaScript engine strictly enforces that private names can only be evaluated within the class body they were declared in. Even standard meta-programming and reflection mechanisms—such as `Object.getOwnPropertyNames()`, `Reflect.ownKeys()`, `for...in` loops, or dynamic bracket notation (`instance['#field']`)—return `undefined` or fail to locate the field. The only way to access it is through public methods exposed by the class that internally read or return the private value.
- **The Unforgettable Mental Model:** A private island with no physical mapping or coordinates in standard navigation charts. Unless the island's governor decides to send a boat out with cargo (a public getter), there is no coordinate or path any explorer can use to find or land on it.
- **The Trap:** Thinking child subclasses can access private fields of their parent class. They cannot! Private fields are strictly private to the *declaring* class. If `class Child extends Parent` tries to call `this.#parentPrivate`, it throws a compile-time `SyntaxError`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'No, outside code has absolutely zero access to private fields. Reflection APIs like `Reflect.ownKeys()` and property selectors cannot discover them, and child subclasses cannot inherit or read them. They are accessible exclusively within the lexical scope of the parent class, ensuring total encapsulation.'"

#### TypeScript `private` vs JS `#private`?
- **The Engine Mechanism (Why it behaves this way):**
  - **TypeScript `private`:** Is a compile-time type-checking construct. Once the TypeScript compiler compiles the code to standard JavaScript, the `private` keyword is stripped away entirely, and the field is compiled into a standard, fully public property in the output bundle. At runtime, anyone can read and write to it.
  - **JavaScript `#private`:** Is a native ECMAScript standard. The `#` symbol is preserved in the compiled JS output, and the browser's JavaScript engine enforces privacy at runtime.
- **The Unforgettable Mental Model:** TypeScript `private` is like a cardboard security guard standing at a gate during a blueprint review; once the building is actually built (runtime), the guard is gone. JavaScript `#private` is a solid concrete wall that remains standing long after construction is complete.
- **The Trap:** Relying on TypeScript's `private` keyword to hide sensitive credentials in front-end code from user inspection. Since it compiles to a public property, any user can open their browser's devtools console, inspect the object instance, and read the sensitive key. Using native `#private` fields ensures the key is completely hidden from inspection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'TypeScript’s `private` keyword is a static analyzer mechanism that only protects access during compilation; it compiles down to standard public properties that are fully visible at runtime. In contrast, native JS `#` private fields are enforced at the engine runtime level, providing absolute security and separation even after compilation.'"

#### Where useful?
- **The Engine Mechanism (Why it behaves this way):** Private fields are exceptionally useful in complex object-oriented patterns where internal state must remain highly stable, secure, and decoupled. Key areas include:
  1. **SDK and Library APIs:** Hiding internal state machines, connection tokens, and raw credentials from library consumers so they cannot create dependencies on internal implementation details.
  2. **Data Structures:** Restricting access to internal tree/graph pointers to guarantee that public operations (like push/pop/balance) are the only mechanisms that alter the underlying data nodes, preserving structural integrity.
  3. **Event Emitter / Web Sockets wrappers:** Keeping connection states and heartbeats private to prevent outside code from manually firing triggers or corrupting the timing frames.
- **The Unforgettable Mental Model:** The engine of a modern automobile. The driver has access to a simple, public API: the steering wheel, gas pedal, and brake. The complex pistons, timing belts, and fuel injection systems (private fields) are locked under the hood so the driver doesn't accidentally tinker with them and blow up the engine.
- **The Trap:** Over-engineering simple functional code or stateful objects by wrapping everything in large, heavy classes with private fields, which can increase memory overhead and complexity compared to simple closures or standard objects.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Private fields are invaluable when building third-party SDKs, complex utility libraries, and data structures. By strictly hiding configuration details—like API tokens, connection sockets, or internal pointer networks—we prevent external developers from creating brittle dependencies on internal implementations, allowing us to safely refactor our class internals without introducing breaking changes.'"

## 8. Active recall test

#### 1. What symbol marks private field?
- **Explanation/Answer:** The hash symbol `#` prefixed to the variable name (e.g., `#privateField`).

#### 2. Can bracket access read it?
- **Explanation/Answer:** No, bracket notation like `instance['#privateField']` will return `undefined`. Private fields are completely omitted from property tables.

#### 3. Is `_name` private?
- **Explanation/Answer:** No, `_name` is an ordinary public property. The underscore is just a developer naming convention; it is fully accessible and mutable from outside the class.

#### 4. Where can `#field` be used?
- **Explanation/Answer:** It can be used anywhere inside the lexical body of the class declaration where it was defined, including in its constructors, methods, and getters/setters.

#### 5. Why useful in SDKs?
- **Explanation/Answer:** It hides sensitive state (like tokens, socket instances, or raw request queues) from developers consuming the SDK, preventing them from corrupting the internal state or depending on non-public APIs that might change in future updates.

## 9. Mistakes / traps
- Thinking `_field` is private.
- Mixing TS `private` with JS runtime privacy.
- Trying `obj["#field"]`.
- Overusing classes when objects/functions simpler.

## 10. Compare with related concepts
- **`#private` vs closure private:** class syntax vs function closure.
- **`#private` vs TypeScript `private`:** runtime enforced vs compile-time.
- **Private field vs WeakMap:** native syntax vs external private storage.

## 11. Summary from memory
Explain why `#token` cannot be read from outside an API client.

## 12. Spaced revision prompts
- 1 day: Define private field.
- 3 days: Compare with `_field`.
- 7 days: Compare with TS private.
- 14 days: Build class with `#cache`.

