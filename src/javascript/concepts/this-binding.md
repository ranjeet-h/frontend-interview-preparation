# `this` Binding

## 1. Why This Exists — The Problem First

An object method often works perfectly until it is handed to a timer, an event listener, a promise callback, or another function. A click handler then reads from the wrong object, a class method throws because `this` is `undefined`, or a constructor call accidentally writes data somewhere unexpected. These bugs happen because a normal function does not carry its receiver with it just because it was written inside an object.

JavaScript needs a way for one function to work with different receivers at different call sites. That mechanism is `this`, and the first debugging question is always: “What exact syntax called this function?”

## 2. The Analogy — Make It Obvious

Imagine a customer-service phone number printed on a reusable card. The card is the function. The person who answers the phone at the moment of the call is `this`.

If you dial through a company’s switchboard—`account.print()`—the company is the receiver, so `this` is `account`. If you copy the number into your contacts and dial it as `print()` later, the company name is no longer part of the call; the receiver is missing. `call` and `apply` are instructions that say who should answer this call right now. `bind` makes a new contact with one receiver already saved.

An arrow function is different: it does not answer with its own receiver at all. It uses the person who answered the surrounding call when the arrow was created. A constructor call with `new` is a factory appointment: the factory creates a fresh object, makes that object the receiver, and then runs the function against it.

The analogy has one important boundary: the function card itself is reusable, but the receiver is chosen by the invocation form. Moving the card does not preserve the company switchboard.

## 3. How It Actually Works — The Full Explanation

For ordinary functions, `this` is a call-time value. The same function can see different objects on different calls because the call expression supplies the receiver.

```js
function describe() {
  return this.name;
}

const first = { name: "Asha", describe };
const second = { name: "Ravi", describe };

first.describe();  // WHY: the object before the dot supplies first as this. "Asha"
second.describe(); // WHY: the same function is called through second instead. "Ravi"
```

The main call-site rules are easiest to apply in this order:

1. A constructor call, `new Fn()`, creates an object, links it to `Fn.prototype`, calls `Fn` with the new object as `this`, and returns that object unless the constructor returns another object explicitly.
2. An explicit call, `fn.call(value)` or `fn.apply(value, args)`, supplies the receiver directly. A bound function created by `fn.bind(value)` remembers that receiver for later calls.
3. A method call, `object.fn()`, uses the object reference on the left of the dot. `obj["fn"]()` works the same way because the property reference is still used at the call site.
4. A plain call, `fn()`, has no receiver. In strict mode, `this` is `undefined`. In sloppy mode, JavaScript substitutes the global object, such as `globalThis`.

These rules describe the invocation, not the place where the function was declared. Assignment copies the function reference, not its connection to an object:

```js
"use strict";

const user = { name: "Asha", getName() { return this?.name; } };
const detached = user.getName; // the function moved; the receiver did not

user.getName(); // WHY: the property reference supplies user as this. "Asha"
detached();     // WHY: assignment removed the receiver, so this is undefined. undefined
```

The same loss happens when passing `user.getName` as a callback. Preserve the receiver with a wrapper—`() => user.getName()`—or with `bind`, depending on whether you want a fresh call expression or a reusable bound function. In a browser, a normal function used as a DOM event listener is called with the element as `this`; an arrow listener keeps its surrounding lexical `this`. Use `event.currentTarget` when you want the event target explicitly and consistently.

Strict mode changes only the fallback for a plain call. It does not change method calls, explicit binding, or constructor binding. Class bodies are strict automatically, which is why an extracted class method commonly throws when it reads `this`.

Arrow functions have no own `this`. They capture the surrounding `this` lexically, so `call`, `apply`, and `bind` cannot replace it. This makes arrows useful for callbacks that must keep an instance receiver, but it makes them unsuitable as object methods when the object should become the receiver. An arrow also cannot be used as a constructor with `new`, because it has no construct behavior.

`call`, `apply`, and `bind` differ in timing and argument shape:

| Form | Runs now? | Arguments | Receiver rule | When to use |
| --- | --- | --- | --- | --- |
| `fn.call(value, a, b)` | Yes | Separate arguments | Uses `value` for this call | A known, small argument list |
| `fn.apply(value, [a, b])` | Yes | Array or array-like value | Uses `value` for this call | You already have arguments in an array-like collection |
| `fn.bind(value, a)` | No | Optional pre-filled arguments | Returns a new function with saved `this` | A callback must retain its receiver later |

Binding is not a general-purpose escape hatch. `bind` returns a new function, so identity checks and event-listener removal need the same bound reference. A second `bind` cannot replace the receiver selected by the first one. If a bound normal function is called with `new`, the new instance wins as the constructor receiver; the bound arguments still remain useful.

Classes package these rules with prototype methods and constructor calls. A class method is still an ordinary method and can be detached. Arrow fields, such as `handleClick = () => { ... }`, capture the instance receiver and create one function per instance, which trades memory for convenient callback identity.

## 4. Real Code — See It Working

Run this whole block with Node.js. The explicit strict and sloppy functions make the environment difference visible without relying on browser globals.

```js
"use strict";

function readName() {
  return this.name;
}

const user = { name: "Asha", readName };
const otherUser = { name: "Ravi" };

console.log(user.readName()); // WHY: the property reference supplies user.
console.log(readName.call(otherUser)); // WHY: call chooses the receiver now.
console.log(readName.apply(otherUser, [])); // WHY: apply is immediate and takes an array.

const later = readName.bind(otherUser); // WHY: callbacks need the receiver preserved later.
console.log(later());

const detached = user.readName;
console.log(detached.call(user)); // WHY: detachment is repaired explicitly at the call site.

function makeCounter(start) {
  this.value = start;
}

const counter = new makeCounter(3);
console.log(counter.value); // WHY: new created counter and made it this.

const sloppyThis = Function("return this === globalThis;");

console.log(sloppyThis()); // WHY: Function creates a non-strict function, so a bare call falls back to globalThis.

function strictThis() {
  "use strict";
  return this;
}

console.log(strictThis()); // WHY: a plain strict call has undefined this.

const service = {
  prefix: "OK",
  makeReader() {
    return () => this.prefix; // WHY: the arrow keeps service as the surrounding receiver.
  },
};

const reader = service.makeReader();
console.log(reader.call({ prefix: "NO" })); // WHY: arrow this cannot be rebound.

class Greeter {
  constructor(name) {
    this.name = name;
  }

  greet() {
    return `Hello ${this.name}`;
  }
}

const greeter = new Greeter("Mina");
console.log(greeter.greet());
const boundGreet = greeter.greet.bind(greeter);
console.log(boundGreet()); // WHY: the callback keeps the class instance.
```

A practical callback choice looks like this:

```js
class SearchBox {
  constructor(api) {
    this.api = api;
    this.onInput = this.onInput.bind(this); // WHY: one stable function can be added and removed.
  }

  onInput(query) {
    return this.api.search(query);
  }
}

const box = new SearchBox({ search: (query) => `searching for ${query}` });
console.log(box.onInput("bind"));
```

Use a normal method when the caller should choose the receiver. Use an arrow callback when it should inherit the surrounding receiver. Use `bind` when a callback API needs a stable, reusable function whose receiver is fixed.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the first thing you inspect when predicting `this`?**

Inspect the exact call site, not the declaration. Decide whether the function is called with `new`, with `call`/`apply` or as a bound function, through an object property, or as a plain function. Then check whether the function is an arrow, because arrows use their surrounding `this` instead of these ordinary call-site rules.

**Q: Why does `const fn = obj.method; fn()` lose `obj`?**

The assignment copies a reference to the function object. It does not copy the property-reference relationship that existed in `obj.method()`. The later call is a plain call, so strict code gets `undefined` and sloppy code gets `globalThis`. Wrap or bind the call when the original receiver matters.

**Q: What is the difference between `call`, `apply`, and `bind`?**

`call` and `apply` invoke immediately and differ only in how arguments are supplied. `bind` returns another function and postpones invocation, while saving a receiver and optionally leading arguments. Choose based on timing and argument shape, not on a vague idea that one form is “stronger.”

**Q: Can `call`, `apply`, or `bind` change an arrow function’s `this`?**

No. An arrow captures `this` from the surrounding function or module context and has no own receiver to replace. Those methods still call or wrap the arrow, but the arrow continues to read its captured value.

**Q: What does `new` do to `this`?**

`new` creates a fresh object, links its prototype to the constructor’s `prototype`, calls the constructor with that object as `this`, and returns it unless the constructor returns a non-null object. A bound constructor keeps its pre-filled arguments, but the newly created instance becomes `this`.

**Q: Why do extracted class methods fail so often?**

Class methods are ordinary functions, but class bodies run in strict mode. `const greet = instance.greet; greet()` therefore calls the method with `this === undefined`. Bind the method once, call it through the instance, or use an arrow field when per-instance function allocation is an acceptable trade-off.

**Q: How should `this` be handled in event callbacks?**

Know the API’s callback contract. A browser’s normal DOM listener receives the element as `this`, while an arrow listener keeps its lexical `this`; either can use `event.currentTarget` for the element. For a class callback, bind the method or wrap it so the instance is not lost.

## 6. The Traps — What Goes Wrong

- **Assuming declaration location chooses `this`.** Wrong assumption: a method written inside `user` must keep `user`. Why it fails: normal functions read the receiver from the call site, not from their declaration. What actually happens: `user.method()` uses `user`, `method.call(other)` uses `other`, and a detached `method()` has no receiver.

- **Assuming a detached method still remembers its object.** Wrong assumption: `const fn = user.getName; fn()` is equivalent to `user.getName()`. Why it fails: assignment copies only the function reference, not the property reference. What actually happens: the later plain call gets `undefined` in strict code or `globalThis` in sloppy code, so bind or wrap it when `user` must survive.

- **Treating strict mode as a universal change.** Wrong assumption: strict mode changes every `this` value. Why it fails: strict mode changes only the fallback for a plain call. What actually happens: `obj.method()` and explicit binding still use their supplied receivers; a bare call gets `undefined` in strict code and `globalThis` in sloppy code.

- **Using an arrow as an object method that needs the object.** Wrong assumption: the object literal becomes an arrow’s `this`. Why it fails: arrows do not create a receiver and cannot capture the object literal as an enclosing function. What actually happens: `{ value: 1, get: () => this.value }` reads `this` from the surrounding scope, so use method syntax when the object should be the receiver.

- **Expecting `call`, `apply`, or `bind` to replace an arrow’s `this`.** Wrong assumption: explicit binding always wins. Why it fails: an arrow has lexical `this` and no own binding to replace. What actually happens: those methods may invoke or wrap the arrow, but it continues reading the surrounding `this`.

- **Thinking `bind` mutates the original function.** Wrong assumption: after `method.bind(user)`, every use of `method` is bound. Why it fails: `bind` creates and returns a separate function object. What actually happens: only the returned function keeps `user`, so retain that exact reference for callback removal or identity checks.

- **Assuming a second `bind` overrides the first.** Wrong assumption: `method.bind(first).bind(second)` changes the receiver to `second`. Why it fails: the first bound function’s receiver is already fixed. What actually happens: the second wrapper still calls with `first`; bind the original function again if a different receiver is needed.

- **Saying `new` always returns the blank object.** Wrong assumption: the object created by `new` is always the final result. Why it fails: constructor return rules allow an explicitly returned object to replace it, while primitive returns are ignored. What actually happens: `new` supplies a fresh instance as `this`, but the final value is that instance unless the constructor returns another object.

- **Forgetting that `new` changes the receiver even for a bound function.** Wrong assumption: a bound receiver always wins over construction. Why it fails: constructor invocation has higher precedence for `this`. What actually happens: `new (Constructor.bind(saved, arg))()` uses the new instance as `this` and keeps the pre-filled argument.

- **Confusing `this` with lexical scope.** Wrong assumption: because an arrow captures `this`, every name inside it behaves like `this`. Why it fails: lexical variable lookup and receiver lookup are separate mechanisms. What actually happens: `name` comes from lexical scope, while `this.name` reads a property from the captured or call-site receiver.

- **Creating a new bound callback every render or registration.** Wrong assumption: two identical `obj.handle.bind(obj)` expressions produce the same callback. Why it fails: each `bind` call creates a new function identity. What actually happens: removal with a separately created bound function fails, so bind once and retain the result or use a stable wrapper.

## 7. Compare With Related Concepts

| Compared ideas | Key difference | When to use |
| --- | --- | --- |
| `this` vs lexical scope | `this` is selected by invocation for normal functions; lexical scope controls name lookup from where code was written. | Use `this` for a receiver supplied by an API; use closure variables for data that should not change with the caller. |
| Normal function vs arrow | A normal function owns call-site `this`; an arrow captures surrounding `this` and cannot be rebound or constructed. | Use a normal method when the caller supplies the receiver; use an arrow callback when the surrounding receiver must survive detachment. |
| Method call vs detached call | `obj.fn()` supplies `obj`; `const fn = obj.fn; fn()` supplies no object. | Keep the property call when possible; bind or wrap when passing the function elsewhere. |
| `call`/`apply` vs `bind` | The first two run immediately; `bind` creates a later-use function. `call` takes separate arguments; `apply` takes an array-like argument. | Use `call`/`apply` for one immediate invocation; use `bind` for a callback contract or stable receiver. |
| Bound function vs arrow callback | A bound function can choose a receiver and leading arguments; an arrow only captures the surrounding receiver and has no constructor behavior. | Use `bind` when you need a reusable method reference; use an arrow for a short callback inside the scope that owns the receiver. |
| Class method vs arrow class field | A class method lives on the prototype and can lose `this`; an arrow field creates a per-instance function that captures the instance. | Prefer prototype methods for shared behavior; choose an arrow field when callback ergonomics and stable instance `this` justify the per-instance cost. |

## 8. 🧠 The Memory Hook — What Sticks

`this` is the person who answers the phone, so inspect who made the call—not who printed the number. A dot supplies a receiver, a bare call does not, `call`/`apply` choose one now, `bind` saves one for later, `new` creates one, and arrows keep the surrounding answerer.
