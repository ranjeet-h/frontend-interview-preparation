# The Code

```javascript
console.log(typeof null);
console.log(typeof undefined);
console.log(null == undefined);
console.log(null === undefined);
```

# The Answer

The output is:

```text
object
undefined
true
false
```

The first line is JavaScript’s famous **typeof null** historical quirk. **null** means “an intentional absence of an object value,” but its typeof result is the string **"object"**. **undefined** is a different primitive that commonly means a value was not provided, so its typeof result is **"undefined"**.

The last two lines compare the values themselves. Loose equality (**==**) has one deliberately narrow rule that treats null and undefined as equal to each other. Strict equality (**===**) does not use that coercion, and the values are different types, so it returns false.

# Execution — Walk Through It Like the JS Engine

There is no declaration or asynchronous work to prepare here. JavaScript executes the four console.log calls synchronously from top to bottom. Each expression is evaluated before its surrounding console.log runs.

First, JavaScript evaluates **typeof null**. Null is a primitive value representing an explicit “no object” value. The typeof operator returns a string describing the operand’s category, and for historical compatibility its result for null is the string **"object"**. The console prints **object**.

This does not turn null into an object. It only means that this particular operator reports that result.

Next, JavaScript evaluates **typeof undefined**. Undefined is also a primitive, but it has its own typeof result. The console prints **undefined**.

The third expression is **null == undefined**. The == operator uses the language’s Abstract Equality Comparison algorithm. It has a special case for this exact pair: null and undefined are considered equal to each other. The result is the boolean true, so JavaScript prints **true**.

Finally, JavaScript evaluates **null === undefined**. Strict equality does not apply the loose-equality coercion rules. Null and undefined are distinct primitive values, so the comparison is false and the console prints **false**.

The key separation is this: typeof produces strings about values, while == and === compare values. The fact that typeof null produces **"object"** has no effect on whether null and undefined are the same value.

# The Concept This Question Tests

This question combines three JavaScript rules that are easy to mix together.

Null and undefined both represent absence, but they communicate different intent. Null is normally assigned deliberately: “there is currently no object/value here.” Undefined commonly means “no value was supplied,” “this property does not exist,” or “a function did not return a value.” They are both falsy, but falsiness is not identity; false, 0, an empty string, null, and undefined are all different values.

Typeof is an operator that returns a string. For most primitives it gives the intuitive answer: typeof 1 is **"number"**, typeof true is **"boolean"**, and typeof undefined is **"undefined"**. Typeof null is **"object"** because of a mistake in JavaScript’s original type-tag implementation. Changing it now would break old code that depends on the behavior, so it remains part of the language.

Loose equality has a specific compatibility rule for the absence pair:

```javascript
null == undefined; // true
```

That rule does not make every falsy value interchangeable with them:

```javascript
null == 0;       // false
undefined == 0;  // false
null == false;   // false
undefined == ""; // false
```

Strict equality is usually easier to reason about because it does not apply the conversion rules of ==:

```javascript
null === undefined; // false
```

When checking whether a value is specifically either null or undefined, the intentional loose-equality idiom can be useful:

```javascript
if (value == null) {
  // Runs only for null or undefined.
}
```

In most application code, an explicit check is clearer to teams that avoid ==:

```javascript
if (value === null || value === undefined) {
  // Same two-value check, with no coercion rules to remember.
}
```

# The Trap — Why Most People Get It Wrong

**Trap: assuming typeof null is "null".** The name null makes that result feel obvious, but JavaScript never returns "null" from typeof. The actual result is "object", and null itself is still not an object. A safe object check needs the null exclusion:

```javascript
function isObject(value) {
  return typeof value === "object" && value !== null;
}
```

**Trap: assuming typeof null === typeof undefined because both represent absence.** The left side is "object" and the right side is "undefined", so comparing those strings gives false. Similar intent does not make their runtime categories or values identical.

**Trap: assuming null == 0 or null == false.** Loose equality does not compare all falsy values as equal. The special relationship is between null and undefined; null is not loosely equal to zero, false, or an empty string.

**Trap: saying null === undefined is true because === “checks the value only.”** Strict equality checks type and value without applying the coercions used by ==. These are distinct primitives, so strict equality returns false.

**Trap: treating undefined as the only possible missing value.** A property can exist and explicitly contain undefined, or be absent entirely:

```javascript
const user = { nickname: undefined };

console.log(user.nickname);       // undefined
console.log("nickname" in user);  // true
console.log("email" in user);     // false
```

Reading both missing and explicitly undefined properties produces undefined, but the object shape is different. Use an ownership or existence check when that distinction matters.

**Trap: using truthiness for an absence check.** A value of 0, false, or an empty string may be valid data. if (!value) treats all of those as absent. Check value == null or use explicit === null / === undefined checks when absence is the actual requirement.

# 🧠 The Memory Hook

Null is the intentional empty box; undefined is the box nobody filled—but JavaScript’s old typeof label on the empty box says **"object"**. Remember the one narrow == exception: null and undefined are loose-equal, but never strictly equal.
