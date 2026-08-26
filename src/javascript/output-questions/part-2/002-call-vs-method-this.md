# `call()` versus Method Extraction: Who Becomes `this`?

Source: Part 2, Question 2 from `03-javascript-coding-problems.md`.

## 1. The Code

```javascript
var obj = {
  name: "John",
  getName: function () {
    return this.name;
  },
};

var obj2 = {
  name: "Ranjeet",
};

var newf = obj.getName.call(obj2);
console.log(newf);

var c = obj.getName;
console.log(c());
```

## 2. The Answer

The first line is always:

```text
Ranjeet
```

The second result is not universal because `c()` is a plain function call. It depends on the strictness of `getName` and on the host's global object:

| Environment for this exact code | What happens at `console.log(c())` |
| --- | --- |
| Browser classic script, non-strict function | Usually logs the global object's `name`, commonly `""` for a Window; a host without that property commonly produces `undefined` |
| Node.js CommonJS, non-strict function | Commonly logs `undefined`, because Node's global object usually has no `name` property |
| Strict function, including code defined in a module or under strict mode | `this` is `undefined`, so `this.name` throws a `TypeError`; no second value is logged |

Therefore, the environment-independent answer is: `Ranjeet` first, followed by a host- and strictness-dependent result or error. Do not claim one universal second output.

## 3. Execution — Walk Through It Like the JS Engine

1. JavaScript creates `obj`. Its `name` property contains `"John"`, and its `getName` property contains an ordinary function. The function is not permanently attached to `obj`; the object merely stores a reference to it.

2. JavaScript creates `obj2`. Its `name` property contains `"Ranjeet"`.

3. Execution evaluates `obj.getName.call(obj2)`. The expression `obj.getName` retrieves the function. The `.call` method then invokes that function while explicitly supplying `obj2` as its `this` value.

4. A function execution context is created for `getName`. Inside that call, `this` is `obj2`, so `this.name` reads `obj2.name`, which is `"Ranjeet"`. The function returns that string.

5. The returned string is assigned to `newf`. The next statement logs `newf`, so the first printed value is:

   ```text
   Ranjeet
   ```

6. Execution evaluates `var c = obj.getName`. This copies the function reference into `c`; it does not call the function and does not carry `obj` along with the reference. `c` and `obj.getName` point to the same function.

7. Execution reaches `c()`. There is no object before the call's parentheses, and no `.call`, `.apply`, `.bind`, or `new`. This is a plain function call, so the method receiver from the earlier expression is gone.

8. JavaScript now applies the ordinary-function default-binding rule. If `getName` is non-strict, a missing `this` is substituted with the host's global object. In a browser classic script that is generally the Window/global object; in Node.js CommonJS it is Node's global object. The function then reads that object's `name` property, so the result depends on whether the host provides one and what value it has.

9. If `getName` is strict, the missing receiver remains `undefined`. Evaluating `this.name` then attempts to read a property from `undefined`, which throws a `TypeError`. Because the function call throws, `console.log` never receives a second argument to print.

The important sequence is:

```text
obj.getName.call(obj2)  -> this is obj2       -> "Ranjeet"
c()                     -> plain-call rule    -> host global or undefined
```

## 4. The Concept This Question Tests

This tests call-site binding for ordinary functions, the difference between a method call and a detached function call, and the explicit receiver supplied by `call`.

For an ordinary function, read the call expression before reading the function's definition:

- `obj.getName()` uses the object before the final dot as `this`.
- `obj.getName.call(obj2)` explicitly invokes the same function with `obj2` as `this`.
- `obj.getName.apply(obj2)` follows the same receiver rule while accepting arguments as an array-like value.
- `obj.getName.bind(obj2)` creates another function whose future calls keep `obj2` as `this`.
- `var c = obj.getName; c()` is a plain call. The assignment preserves the function reference, not the original method receiver.

`call` changes the receiver for one invocation. It does not mutate `obj.getName`, move the function into `obj2`, or permanently bind the function. After the first call finishes, `c()` is evaluated independently.

Strictness controls what happens when a plain call supplies no receiver. A non-strict ordinary function receives the host's global object as its default receiver. A strict ordinary function receives `undefined`. The strictness of the called function is the relevant question; a caller being strict does not magically rewrite a separately defined non-strict function.

The global-object fallback is a hazard because a property lookup such as `this.name` can appear to work while silently reading unrelated host state. In a browser Window realm, `name` is a known global property and is commonly an empty string by default. In another host, the property may be absent and the result may be `undefined`, or it may have been set by unrelated code.

## 5. The Trap — Why Most People Get It Wrong

The first trap is to say that both calls use `obj` because the function came from `obj`. A function reference does not remember the object property through which it was retrieved. `call(obj2)` deliberately chooses `obj2` for the first invocation; `c()` has no receiver at all.

The second trap is to say that the second output is always `undefined`. That answer ignores the non-strict global-object fallback and the browser's global `name` property. A browser classic script can commonly print an empty string, while Node.js CommonJS commonly prints `undefined`. A different host or earlier global assignment can change it again.

The third trap is to describe strict mode as merely changing the second value to `undefined`. In this exact code, strict mode makes `this` equal to `undefined`, but `return this.name` immediately tries to dereference it. The observable result is a `TypeError`, not a successfully logged `undefined`.

The safest interview trace is to ask two separate questions for every call: “What is the call form?” and “What is the called function's strictness?” Then distinguish the receiver from the property value:

```text
receiver (`this`) -> property lookup (`this.name`) -> returned/logged value
```

## 6. 🧠 The Memory Hook

`this` follows the call site, not the function's storage location: `call` chooses the receiver once, a dot supplies a receiver, and extraction removes it. For `c()`, non-strict code may fall back to a host global while strict code keeps `this` as `undefined`—and `this.name` then throws.
