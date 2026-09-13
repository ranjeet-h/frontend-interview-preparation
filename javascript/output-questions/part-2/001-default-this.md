# Default `this` in a Plain Function Call

Source: Part 2, Question 1 from `03-javascript-coding-problems.md`.

## 1. The Code

```javascript
function doSomething() {
  console.log(this);
}
doSomething();
```

## 2. The Answer

There is no single environment-independent output. `doSomething()` is a plain call: no object appears before the dot, and nothing explicitly supplies `this`. For an ordinary function, the default-binding fallback is determined by whether the called function is strict, not by whether its caller is strict.

| Where this exact code runs | Result of `console.log(this)` |
| --- | --- |
| Browser classic script in a Window realm, with no strict directive | The browser global object, usually shown as `Window` (the same object as `globalThis`) |
| Node.js CommonJS file or non-strict `node -e` execution | Node's global object, `global` (the same object as `globalThis`) |
| Browser module (`<script type="module">`) | `undefined` |
| Node.js ES module (`.mjs` or a package configured with `"type": "module"`) | `undefined` |
| A classic script with `'use strict';` in its directive prologue before this function | `undefined` |

The browser console may display a large, expandable object rather than a short string. The important value is which object it is, not the console's formatting.

## 3. Execution — Walk Through It Like the JS Engine

1. JavaScript created the global execution context for the surrounding script or module. The surrounding kind of code matters: a browser classic script and a Node CommonJS file are non-strict by default, while modules are always strict. A string only enables strict mode when it is the exact directive `'use strict'` in the script's or function's directive prologue; an arbitrary string appearing before the function does not.

2. During setup, JavaScript hoisted the `doSomething` function declaration. The complete function was available before execution reached the call. Hoisting did not decide the function's `this`; it only made the function binding available.

3. Execution reached `doSomething()`. The call syntax was a bare function call. There was no `object.doSomething()`, no `new`, and no `call`, `apply`, or `bind`.

4. JavaScript created the function execution context and evaluated `console.log(this)` inside it. For an ordinary function, this is where the call-site rule applies. The function's definition location does not provide a permanent receiver.

5. JavaScript checked the strictness of `doSomething` itself. In the exact code, its body has no `'use strict'` directive, so the function is non-strict even if some other function later calls it from strict code. Its bare call therefore applies non-strict default binding: the missing receiver becomes the surrounding runtime's global object, `window` in a browser Window realm or Node's `global` object. Both are also available through `globalThis`.

6. If `doSomething` is strict—because its own body has a directive-prologue `'use strict'`, because the containing script's directive prologue makes the script strict, or because it is defined in a module—JavaScript does not substitute a global object. The function's `this` remains `undefined`. Strictness in the caller alone does not change a non-strict called function.

7. `console.log` printed that environment-qualified value, and the function returned. Nothing else was logged.

## 4. The Concept This Question Tests

This tests `this` default binding for an ordinary function.

For ordinary functions, `this` is selected when the function is called. Read the invocation first, then check the called function's strictness:

- `object.method()` gives the object before the dot as `this`.
- `method.call(value)` or `method.apply(value, args)` supplies `value` explicitly.
- `new Constructor()` supplies a new instance.
- `method()` is a plain call, so it uses default binding: `globalThis` when the called function is non-strict and `undefined` when the called function is strict.

`'use strict'` is not a magic string that activates strict mode wherever it appears. It is a directive only when it is a string-literal expression in the directive prologue: the run of string-literal expression statements at the beginning of a script or function body, before any other statement. For example, this is a strict script:

```javascript
'use strict';
function doSomething() {
  console.log(this);
}
doSomething(); // undefined
```

But this is not a strict script, because the string comes after another statement:

```javascript
const note = 'before';
'use strict';
function doSomething() {
  console.log(this);
}
doSomething(); // the global object in a non-strict browser classic script or CommonJS file
```

The caller's strictness is also separate from the callee's. A strict caller can call a non-strict function, and that function still receives the global object on a bare call. A non-strict caller can call a strict function, and that function still receives `undefined`:

```javascript
function nonStrict() {
  return this;
}

function strictCaller() {
  'use strict';
  return nonStrict();
}

function strictCallee() {
  'use strict';
  return this;
}

console.log(strictCaller() === globalThis); // true
console.log(strictCallee()); // undefined
```

The function declaration does not lock `this` to any object. The same function can be called as a method, as a plain function, or with an explicitly chosen receiver. A module is strict by definition, so a bare call in a browser or Node module produces `undefined` even though the code looks the same.

## 5. The Trap — Why Most People Get It Wrong

The common mistake is to memorize “a normal function gets `window`” as if it were universal. That is only the non-strict default-binding result, and even then the global object differs by runtime. A browser classic script in a Window realm commonly uses `window`; Node CommonJS uses Node's global object. Browser and Node modules are strict automatically, so they produce `undefined` for this bare call.

Another mistake is to think that any `'use strict'` string before the declaration makes the function strict, or that a strict caller makes its callee strict. The string must be in the relevant script or function directive prologue, and the callee's own strictness controls a bare call. Definition location alone is not the deciding factor here; the empty receiver in `doSomething()` and the called function's strictness are. Change only the call to `globalThis.doSomething()` or `someObject.doSomething()`, and the receiver rule changes with it.

## 6. 🧠 The Memory Hook

`this` answers the call, not the definition: a dot supplies a receiver; a bare call supplies none. With no receiver, a non-strict callee falls back to the runtime's global object, while a strict callee keeps `this` as `undefined`; the caller cannot change that strictness.
