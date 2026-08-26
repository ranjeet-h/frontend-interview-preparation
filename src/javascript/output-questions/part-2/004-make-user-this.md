# `this` in a Plain Function Call: The Returned Reference

Source: Part 2, Question 4 from `03-javascript-coding-problems.md`.

## 1. The Code

```javascript
function makeUser() {
  return {
    name: "John",
    ref: this,
  };
}
let user = makeUser();
console.log(user.ref.name);
```

## 2. The Answer

There is no single environment-independent output. `makeUser()` is a plain call: no object appears before the call, and no explicit receiver is supplied. The result depends on whether `makeUser` is strict and on the host environment's global object.

| Environment for this exact source | What happens at `console.log(user.ref.name)` |
| --- | --- |
| Browser classic script, non-strict | `makeUser` receives the Window/global object, so `user.ref.name` reads `Window.name`, commonly the empty string. The console logs a blank line. |
| Browser ES module | Modules are strict. `makeUser` receives `undefined`, so `user.ref` is `undefined` and `.name` throws a `TypeError`. Nothing is logged. |
| Strict script or strict function body | `makeUser` receives `undefined`; `user.ref.name` throws a `TypeError`. |
| Node.js CommonJS file without strict mode | The CommonJS wrapper does not make this function strict. The plain call commonly falls back to Node's global object, whose `name` property is usually absent, so the console logs `undefined`. |
| Node.js CommonJS file made strict | The wrapper's strictness makes `makeUser` strict. `user.ref` is `undefined`, so the property access throws a `TypeError`. |
| Node.js ES module | ES modules are strict. `user.ref` is `undefined`, and `.name` throws a `TypeError`. |

So the browser-classic result is commonly a blank line, not a universal answer. In strict/module contexts the observable result is a `TypeError`, and in ordinary Node CommonJS the commonly observed value is `undefined`.

## 3. Execution — Walk Through It Like the JS Engine

1. During setup, JavaScript creates the `let user` binding in the environment for that source: the global lexical environment for a browser classic script, the module lexical environment for an ES module, or the CommonJS module wrapper's lexical environment for a Node CommonJS file. The binding exists, but it is uninitialized, so it is in the Temporal Dead Zone (TDZ) until the declaration's initializer runs. JavaScript also creates the `makeUser` function declaration, initializing that function binding before statement execution. The function is ordinary, not an arrow function. Its `this` will be selected when it is called.

2. Execution reaches `makeUser()`. This is a bare function call: there is no `user.makeUser()`, no `.call(...)`, no `.apply(...)`, and no `new`. The `user` binding is still uninitialized while this call is being evaluated; the initializer has not yet completed.

3. JavaScript creates the function execution context for `makeUser` and checks the strictness of the called function. The exact function body has no `'use strict'` directive, so it is non-strict when defined in a non-strict classic script or an ordinary CommonJS wrapper. A function defined in a strict script, strict wrapper, or module is strict.

4. For the non-strict plain call, JavaScript substitutes the host's global object for the missing receiver. In a browser Window realm this is commonly `window`/`globalThis`. In an ordinary Node CommonJS file it is commonly Node's `global`/`globalThis`. The CommonJS wrapper's top-level `this` is a separate issue: it is commonly `module.exports`, but that does not become the `this` of this bare function call.

5. The function returns a new object. Its `name` property is always the string `"John"`. Its `ref` property receives the current `this` value from the `makeUser()` call.

6. The right-hand side of `let user = makeUser()` has now produced its value, so JavaScript initializes the existing `user` binding in the corresponding global, module, or CommonJS-wrapper lexical environment with the returned object. The binding leaves the TDZ only at this initialization step; the earlier setup phase did not assign it a value.

7. In a browser classic non-strict script, the returned object is conceptually:

   ```javascript
   {
     name: "John",
     ref: window,
   }
   ```

   `user.ref.name` therefore reads `window.name`. The Window object commonly has a `name` property whose default value is the empty string, so `console.log` prints a blank line. It does not read `user.name`, because `user.ref` points to the global object.

8. In a strict script or module, the missing receiver remains `undefined`. The returned object is conceptually:

   ```javascript
   {
     name: "John",
     ref: undefined,
   }
   ```

   The final expression then evaluates `user.ref.name`. Since `user.ref` is `undefined`, reading `.name` throws a `TypeError` before `console.log` can print anything.

9. In an ordinary Node CommonJS file, the function is inside Node's module wrapper but is still non-strict unless strict mode is enabled. The plain-call fallback is therefore Node's global object, not the wrapper's `this` value. `global.name` is usually not defined, so `user.ref.name` evaluates to `undefined` and that value is logged.

10. In a Node CommonJS file made strict, or in a Node ES module, the function is strict. The same `undefined` reference is produced as in a browser module, and the final property access throws a `TypeError`.

The stable execution chain is:

```text
makeUser() → plain-call rule → this becomes global object or undefined
            → ref stores that value → user.ref.name reads from it or throws
```

## 4. The Concept This Question Tests

This tests default binding for an ordinary function, the difference between `this` and an object's other properties, and the importance of the execution environment.

For an ordinary function, the call form is the first thing to inspect:

- `makeUser()` is a plain call. It supplies no receiver.
- `someObject.makeUser()` supplies `someObject` as `this`.
- `makeUser.call(value)` or `makeUser.apply(value, args)` supplies `value` explicitly.
- `new makeUser()` supplies a new instance.

When a plain call supplies no receiver, the called function's strictness decides the result. A non-strict ordinary function receives the runtime's global object. A strict ordinary function receives `undefined`. The strictness of the caller does not rewrite a separately defined non-strict callee; the relevant question is whether `makeUser` itself is strict, including strictness inherited from the script, module, or enclosing function where it is defined.

The returned object's `name` property and the function's `this` are unrelated values. `name: "John"` creates `user.name`. `ref: this` copies the call-time `this` into `user.ref`. Therefore `user.ref.name` asks for the `name` property of the receiver captured in `ref`, not the `name` property already stored on `user`.

Node adds a wrapper distinction. CommonJS files execute inside a function wrapper, so their top-level `this` is commonly `module.exports`; however, `makeUser()` is still a plain call, and a non-strict ordinary function commonly falls back to `global`. Node ES modules do not use that CommonJS wrapper and are strict, so the plain call produces `undefined`.

## 5. The Trap — Why Most People Get It Wrong

The first trap is to answer `John`. That would require `this` inside `makeUser` to be the returned object or `user`, but the object does not exist until after the function starts returning, and the call is not `user.makeUser()`. `name: "John"` belongs to the new object; it does not control `this`.

The second trap is to memorize the browser-classic result as a universal empty string. That is only a common Window result when the function is non-strict. A strict script or ES module stores `undefined` in `user.ref`, and `user.ref.name` throws a `TypeError`. Ordinary Node CommonJS commonly logs `undefined` because Node's global object usually has no `name` property.

The third trap is to say that strict mode logs `undefined`. It does not in this exact source: strict mode makes `user.ref` equal to `undefined`, but the next `.name` dereference throws before `console.log` receives a value.

The fourth trap is to apply Node CommonJS top-level `this` directly to the function. The wrapper's top-level `this` and the default binding of a bare call are different rules. Trace the called function's strictness and the call syntax separately.

The safest interview trace is:

```text
call form → called-function strictness → value stored in ref → final property lookup
```

## 6. 🧠 The Memory Hook

`ref: this` stores the receiver of `makeUser()`, not the returned user. A bare ordinary-function call gives a non-strict function the host global object and a strict function `undefined`; then `user.ref.name` reads that object's `name` or throws when the reference is `undefined`.
