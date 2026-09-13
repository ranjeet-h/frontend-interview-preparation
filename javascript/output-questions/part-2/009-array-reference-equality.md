# JavaScript Output Question 9: Array Reference Equality

## 1. The Code

```javascript
let x = [1, 2, 3];
let y = [1, 2, 3];
let z = y;

console.log(x == y);
console.log(x === y);
console.log(z == y);
console.log(z == x);
```

## 2. The Answer

```text
false
false
true
false
```

The first two comparisons are false because `x` and `y` are two different array objects. They contain the same values, but they were created by two separate array literals, so they have different identities.

`z` is different: `let z = y` does not create another array. It copies the reference to the array that `y` already refers to. That makes `z` and `y` two names for the same object, so both equality operators return `true` for that pair.

## 3. Execution — Walk Through It Like the JS Engine

JavaScript executes this code synchronously from top to bottom.

1. `let x = [1, 2, 3]` creates an array object and stores a reference to it in `x`. Imagine that object as Array A.
2. `let y = [1, 2, 3]` evaluates a new array literal. Even though it has the same elements, it creates a different object, Array B, and stores its reference in `y`.
3. `let z = y` reads the reference currently stored in `y` and copies that reference into `z`. Now `y` and `z` both refer to Array B. No third array is created.
4. `x == y` compares two objects. Because both operands are already objects, loose equality does not compare their elements or serialize them into strings. It checks whether they are the same object. Array A and Array B are different, so it logs `false`.
5. `x === y` also compares the object references. Strict equality does not make arrays equal just because their contents match. The references still point to Array A and Array B, so it logs `false`.
6. `z == y` compares two references to Array B. They identify the same object, so loose equality logs `true`.
7. `z == x` compares Array B with Array A. They are different objects, so it logs `false`.

The important distinction is between a value and an object identity. The sequence of elements `[1, 2, 3]` describes the contents of each array, while the reference identifies the particular array object that owns those contents. JavaScript's ordinary equality operators use identity for objects; they do not perform deep comparison.

## 4. The Concept This Question Tests

This tests reference identity, also called reference equality, for objects and arrays.

Arrays are objects in JavaScript. A variable holding an array does not contain the entire array inline; it holds a reference to an array object. An array literal creates a new object each time it is evaluated:

```javascript
const first = [1, 2, 3];
const second = [1, 2, 3];

console.log(first === second); // false: two objects

const alias = first;
console.log(alias === first); // true: one object, two references
```

The same rule applies to ordinary objects and functions. Two independently created objects are not equal merely because their properties match, while two variables assigned from the same object reference are equal.

If the requirement is to compare array contents, equality operators are the wrong tool. You need an explicit content comparison, such as checking lengths and comparing each corresponding element, or a deliberately chosen deep-equality utility for nested data.

## 5. The Trap — Why Most People Get It Wrong

The common mistake is to read `[1, 2, 3]` as if it were a primitive value, like the number `3` or the string `"hello"`. That leads people to expect two identical array literals to compare as equal. But arrays are mutable objects, and JavaScript must distinguish two independent objects that happen to start with the same contents.

```javascript
const x = [1, 2, 3];
const y = [1, 2, 3];

y.push(4);

console.log(x); // [1, 2, 3]
console.log(y); // [1, 2, 3, 4]
```

Because `x` and `y` are separate objects, mutating one does not mutate the other. By contrast, aliases share mutations:

```javascript
const original = [1, 2, 3];
const alias = original;

alias.push(4);
console.log(original); // [1, 2, 3, 4]
console.log(original === alias); // true
```

Another interview trap is claiming that `==` compares object contents while `===` compares references. That is not the right distinction here. For these two array operands, both operators produce the same result because both use object identity. The practical rule is: `==` allows coercion in cases where coercion applies, but neither operator performs a deep comparison of arrays.

## 6. 🧠 The Memory Hook

An array variable is a name tag, not the box itself. Two separately built boxes can contain identical things and still be different boxes; two name tags copied from the same variable point to one box, so they compare equal.
