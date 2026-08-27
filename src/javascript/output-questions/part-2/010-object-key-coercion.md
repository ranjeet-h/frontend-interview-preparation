# JavaScript Output Question 10: Object Key Coercion

## 1. The Code

```javascript
let a = {};
let b = { key: "b" };
let c = { key: "c" };

a[b] = 123;
a[c] = 456;

console.log(a[b]);
```

## 2. The Answer

```text
456
```

Both `a[b]` and `a[c]` address the same property on `a`: `"[object Object]"`.

When a normal JavaScript object is used as a property key in another normal object, JavaScript converts it into a property key. The conversion eventually uses the object's default `toString()` result, which is `"[object Object]"` for both `b` and `c`. The second assignment therefore overwrites `123` with `456`, and the final lookup returns `456`.

## 3. Execution — Walk Through It Like the JS Engine

JavaScript runs the code synchronously from top to bottom.

1. `let a = {}` creates an empty ordinary object. `a` refers to that object, which will receive the properties.
2. `let b = { key: "b" }` creates one object. Its `key` property has no special effect on how the object itself becomes a property key.
3. `let c = { key: "c" }` creates a separate object. It is not the same object as `b`, but that distinction is about object identity, not about the string key produced by coercion.
4. JavaScript evaluates `a[b] = 123`. An object property name must be a string or a symbol, so the bracket expression applies the `ToPropertyKey` operation to `b`.
5. To turn `b` into a property key, JavaScript first tries to obtain a primitive value from it. With an ordinary object and the default methods, that produces the string `"[object Object]"`.
6. The first assignment is therefore equivalent to:

   ```javascript
   a["[object Object]"] = 123;
   ```

   The object `a` now has one string-keyed property with value `123`.
7. JavaScript evaluates `a[c] = 456`. `c` is a different object, but its default conversion produces the same string, `"[object Object]"`.
8. The second assignment is therefore equivalent to:

   ```javascript
   a["[object Object]"] = 456;
   ```

   That writes to the existing property and replaces `123` with `456`.
9. Finally, `a[b]` converts `b` to `"[object Object]"` again. It reads the property that now contains `456`, so `console.log` prints `456`.

The crucial detail is that an object literal used inside brackets is not retained as an object identity by an ordinary object. It is converted into a property key before the lookup or assignment happens.

## 4. The Concept This Question Tests

This tests `ToPropertyKey` coercion and the difference between an object key in a plain object and a key in a `Map`.

For a plain object, bracket notation accepts a property key. Property keys are strings or symbols. If the expression between the brackets is another object, JavaScript converts that object to a primitive first and then to a string unless the result is a symbol.

```javascript
const key = {};
const object = {};

object[key] = "stored";

console.log(Object.keys(object)); // ["[object Object]"]
console.log(object["[object Object]"]); // "stored"
```

The `key` object's identity is not used as a distinct plain-object property name. Custom conversion can change the result:

```javascript
const object = {};
const firstKey = { toString: () => "first" };
const secondKey = { toString: () => "second" };

object[firstKey] = 1;
object[secondKey] = 2;

console.log(object.first); // 1
console.log(object.second); // 2
```

If the requirement is to distinguish `b` and `c` by their object identities, use a `Map`. A `Map` keeps object references as keys instead of stringifying them:

```javascript
const values = new Map();
const b = { key: "b" };
const c = { key: "c" };

values.set(b, 123);
values.set(c, 456);

console.log(values.get(b)); // 123
console.log(values.get(c)); // 456
```

## 5. The Trap — Why Most People Get It Wrong

The usual wrong assumption is: “`b` and `c` are different objects, so `a[b]` and `a[c]` must be different properties.” That would be true for a `Map`, but not for a normal object. A normal object does not maintain a separate object-identity slot for every bracket expression; it stores string- or symbol-named properties.

Another common mistake is to look at `{ key: "b" }` and `{ key: "c" }` and assume the `key` fields control the conversion. They do not. The default conversion is performed on the whole object, and both objects inherit `Object.prototype.toString`, which returns `"[object Object]"`.

```javascript
const b = { key: "b" };
const c = { key: "c" };

console.log(String(b)); // "[object Object]"
console.log(String(c)); // "[object Object]"
console.log(b === c); // false: different objects
```

The objects can be different while their converted property names are identical. Object identity is used when comparing `b === c`; string conversion is used when either object becomes a key in `a`.

Do not “fix” this by serializing keys casually. JSON serialization can collide too, can be expensive, and does not replace the identity semantics a `Map` provides. Choose the data structure based on whether the key should be a property name or an object reference.

## 6. 🧠 The Memory Hook

A plain object has a keyhole that accepts labels, not object identities. Put two unlabeled objects through it and both get the same default label, `"[object Object]"`, so the second value overwrites the first; use `Map` when you need the objects themselves to remain distinct keys.
