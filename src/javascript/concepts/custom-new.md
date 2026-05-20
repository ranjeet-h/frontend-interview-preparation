# Custom new Operator

## Detailed explanation
Custom `new` implementation tests prototype, constructor calls, `this`, and object return rules. `new Fn(args)` creates object linked to `Fn.prototype`, calls `Fn` with that object as `this`, and returns constructor's object return if present.

Frontend relevance lower, but common senior JS coding exercise.

## 1. One-line mental model
`new` creates object, links prototype, calls constructor, returns object.

## 2. Problem it solves
Explains constructor behavior and prototype chain.

## 3. Core idea
- Create object with constructor prototype.
- Call constructor with object as `this`.
- Pass arguments.
- If constructor returns object/function, use it.
- Otherwise return created object.

## 4. Visual / analogy
`new` builds house shell, lets constructor furnish it, then hands back house.

```mermaid
flowchart LR
  Create --> LinkProto --> CallCtor --> ReturnObj
```

## 5. Minimal example

```js
function myNew(Ctor, ...args) {
  const obj = Object.create(Ctor.prototype);
  const result = Ctor.apply(obj, args);
  return result !== null && (typeof result === "object" || typeof result === "function")
    ? result
    : obj;
}
```

## 6. Real-world example

```js
function Person(name) {
  this.name = name;
}
const p = myNew(Person, "Asha");
```

## 7. Common interview questions

#### What does `new` do?
- **The Engine Mechanism (Why it behaves this way):** When the `new` operator is invoked with a constructor function (e.g. `new Foo(...)`), the V8 engine executes the following internal sequence defined in the ECMAScript spec:
  1. It allocates a brand-new, empty, plain JavaScript object in the heap memory.
  2. It links this newly created object's internal prototype pointer (`[[Prototype]]`, accessible via `__proto__` or `Object.getPrototypeOf`) to the constructor function's `prototype` property object. If `Constructor.prototype` is not an object (e.g., it is `null`), it defaults to linking to the standard `Object.prototype`.
  3. It executes the constructor function, binding the newly created object as the `this` execution context for that stack frame. It passes any constructor arguments as parameters.
  4. It evaluates the return value of the constructor: if the constructor returns a non-null object reference (like `{}` or `[]`) or a function object, the engine discards the created object and returns the constructor's returned reference instead. Otherwise (if it returns a primitive, `null`, or undefined), it returns the newly created object.
- **The Unforgettable Mental Model:** A specialized assembly line at a car factory. The factory first builds a standard, empty metal chassis (`Object.create`). Next, they stamp the official brand logo and engineering schematics onto the engine frame (`Ctor.prototype`). Then, they send the chassis to the assembly mechanics (`Ctor.apply`) to bolt on seats and doors (`this.name = ...`). Finally, the supervisor checks if the customer brought their own custom sports car inside a box (an object return)—if yes, they hand them that box; if not, they hand them the shiny new car they just assembled.
- **The Trap:** Believing that classes and constructors are identical under the hood. While a class constructor behaves similarly, you *cannot* call a class constructor directly without the `new` operator (doing so throws a `TypeError: Class constructor cannot be invoked without 'new'`), whereas standard ES5 constructors can be called directly, in which case `this` silently pollutes the global scope or evaluates to `undefined` in strict mode.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The `new` operator executes four distinct phases under the hood. First, it instantiates an empty object in memory. Second, it configures the object's `[[Prototype]]` link to point to the constructor's `prototype` object. Third, it executes the constructor, binding the new object as the `this` context. Finally, it evaluates the return value: returning the constructor's return value if it is a non-null object or function, otherwise defaulting to the newly constructed object instance."

#### How implement custom `new`?
- **The Engine Mechanism (Why it behaves this way):** Implementing a custom `new` (e.g., `myNew`) requires replicating all four steps of the ES specification. We achieve this by:
  1. Creating the new object and establishing the prototype linkage in a single step using `Object.create(Ctor.prototype)`.
  2. Calling the constructor using `Ctor.apply(obj, args)` to explicitly bind the newly created object as `this` and pass the arguments.
  3. Inspecting the returned value `result` using a rigorous typeof check: `result !== null && (typeof result === 'object' || typeof result === 'function')`. If this evaluates to `true`, we return `result`. Otherwise, we return the instantiated `obj`.
- **The Unforgettable Mental Model:** An open-heart surgeon replicating a native biological organ (the native keyword `new`) using a custom artificial pump (`myNew`). Every step (linkage, context binding, and return checks) must be perfectly calibrated to match the natural body's mechanics, otherwise the patient's cells (the calling code) will reject the synthetic organ and crash the system.
- **The Trap:** Using `typeof result === 'object'` without verifying that `result` is not `null`. In JavaScript, `typeof null` evaluates to `"object"` due to a historical V8 memory layout bug where object pointers were labeled with a type tag of 0, which `null` also shared. If your constructor returns `null` and you do not filter it out, your custom `new` will incorrectly return `null` instead of the instantiated object.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A custom `new` implementation, which we can call `myNew`, must take a constructor function and rest parameters. We use `Object.create(Ctor.prototype)` to instantiate the object and link its prototype in a single, high-performance operation. We then execute the constructor utilizing `Ctor.apply`, capturing the returned value. Finally, we execute a strict type check to ensure that if the constructor returns a non-null object or function, we return that reference; otherwise, we default to returning our constructed instance."

```js
function myNew(Ctor, ...args) {
  const obj = Object.create(Ctor.prototype);
  const result = Ctor.apply(obj, args);
  const isObject = result !== null && typeof result === "object";
  const isFunction = typeof result === "function";
  return isObject || isFunction ? result : obj;
}
```

#### What if constructor returns object?
- **The Engine Mechanism (Why it behaves this way):** If a constructor function explicitly returns a non-null object (such as an object literal `{ ... }`, an array `[ ... ]`, a regex `/.../`, or another function), the JavaScript engine respects this return value as an override. The engine immediately discards the newly created instance that was bound to `this` during the constructor call. The V8 heap allocation remains for the discarded object until it is swept by garbage collection (since no references point to it), and the calling code receives the returned object instead.
- **The Unforgettable Mental Model:** Going to a tailor to custom-fit a suit (`this`). You stand there while the tailor measures you and stitches the fabric onto your body. But just before you pay, the tailor says: "Actually, look at this ready-made designer tuxedo over here on the rack instead." They hand you the rack tuxedo (the returned object), and dump the custom suit they just stitched for you directly into the trash bin.
- **The Trap:** Thinking that returning a primitive (like a string, boolean, or number) will also override the return value. It does not. If a constructor returns a primitive (e.g. `return 42` or `return "hello"`), the engine completely ignores the return value and returns the constructed `this` object.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: If a constructor explicitly returns a non-null object or function, the JS engine bypasses its default behavior and returns that reference directly, discarding the newly instantiated object that was bound to `this`. However, if the constructor returns a primitive value, the return statement is silently ignored by the runtime, and the newly created instance is returned instead."

#### How prototype linked?
- **The Engine Mechanism (Why it behaves this way):** Prototype linkage is established via the internal `[[Prototype]]` property of an object. When an object is created via `new Ctor()`, the engine links the object's `[[Prototype]]` to point directly to the object currently referenced by `Ctor.prototype`. This forms a node-and-pointer network. When you query a property on the instance (e.g. `obj.hasOwnProperty` or `obj.someMethod`), V8 first checks the instance's own properties. If not found, it traverses the `[[Prototype]]` pointer to check the constructor's prototype, recursively walking up the chain until it either finds the property or reaches `Object.prototype.__proto__`, which is `null`, and returns `undefined`.
- **The Unforgettable Mental Model:** A train chain coupler. Each object instance is a train car. When you search for a snack (a method), you look inside your own cabin (instance properties) first. If you don't find it, you walk through the coupler door (`[[Prototype]]` pointer) into the next train car (the prototype object) and check there, repeating this until you either find the snack or reach the caboose.
- **The Trap:** Confusing `Ctor.prototype` with the actual instance's prototype (`Object.getPrototypeOf(obj)` or `__proto__`). `Ctor.prototype` is a standard, public property on the constructor *function* that acts as a blueprint. The actual *instance* does not have a `.prototype` property; its prototype is hidden under the internal `[[Prototype]]` link.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Prototype linkage is established by setting the internal `[[Prototype]]` pointer of the newly created object to reference the constructor's public `prototype` object. This forms a chain of reference delegations. When a property lookup occurs, V8 traverses this pointer chain recursively to find inherited methods. We can inspect this link on the client using `Object.getPrototypeOf(instance)` or `__proto__`."

#### What is `this` inside constructor?
- **The Engine Mechanism (Why it behaves this way):** Inside the constructor, `this` is a reference pointing directly to the empty object allocated in the heap memory during step 1 of the `new` process. During the execution of the constructor's call frame, this object is dynamic and active. Properties and methods attached to `this` (e.g. `this.name = name`) are written directly to the object's own property descriptor map in memory. If you execute a constructor *without* the `new` operator in non-strict mode, `this` defaults to the global `window` or `globalThis` object, causing accidental global variable pollution. In strict mode (`"use strict"`), `this` evaluates to `undefined`, and attempting to attach properties (like `this.name = name`) will immediately throw a `TypeError`.
- **The Unforgettable Mental Model:** A blank sheet of paper handed to you when you enter a room. Inside the room (the constructor scope), the paper is labeled `this`. You write your name, address, and age directly onto the paper. When you leave the room, you take the paper with you, and that paper is now your custom identity document.
- **The Trap:** Using arrow functions as constructor functions. Arrow functions do not possess their own dynamic `this` context or a public `.prototype` property. If you try to invoke `new MyArrowFunction()`, the engine throws a `TypeError: MyArrowFunction is not a constructor`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Inside a constructor, `this` is a dynamic reference to the newly created, uninitialized object instance allocated in the heap. If the function is invoked with the `new` operator, properties assigned to `this` write directly to that specific instance. However, if the function is invoked without `new`, `this` will default to `undefined` in strict mode or the global object in non-strict mode, which can lead to accidental global state mutation."

## 8. Active recall test

#### 1. What is the very first step the JavaScript engine performs when executing a function with the new operator?
It allocates a brand-new, empty, plain object in heap memory.

#### 2. How is prototype linkage established under the hood in a custom new implementation?
By setting the internal `[[Prototype]]` link of the new object to reference the constructor's public `.prototype` object, which is most cleanly accomplished via `Object.create(Ctor.prototype)`.

#### 3. What does the keyword "this" resolve to during constructor execution?
It points directly to the newly allocated, empty object instance that is currently being initialized by the constructor function call frame.

#### 4. Detail the constructor return override rules when returning primitives vs objects.
If the constructor returns a non-null object or function, that reference is returned to the caller, completely discarding the newly instantiated `this` object. If it returns a primitive value (like a number, string, boolean, or `null`), the return statement is ignored, and the initialized `this` object is returned instead.

#### 5. Why is Object.create preferred over setting obj.__proto__ directly in modern JavaScript?
Because `__proto__` is a legacy accessor property that carries heavy performance penalties in modern V8 engines when modified after creation. `Object.create` configures the prototype relationship atomically at instantiation time, allowing the engine to optimize object shape compilation.

## 9. Mistakes / traps
- Ignoring constructor object return.
- Using `{}` without prototype link.
- Not passing args.
- Forgetting functions can be returned too.

## 10. Compare with related concepts
- **`new` vs Object.create:** constructor call + prototype link vs object creation only.
- **Constructor vs class:** classes use constructor semantics with syntax.
- **Prototype vs instance:** shared methods vs created object.

## 11. Summary from memory
Explain custom `new` in four steps.

## 12. Spaced revision prompts
- 1 day: List `new` steps.
- 3 days: Implement `myNew`.
- 7 days: Explain return object rule.
- 14 days: Compare with Object.create.

