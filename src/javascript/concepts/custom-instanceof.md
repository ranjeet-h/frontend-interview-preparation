# Custom instanceof

## Detailed explanation
`instanceof` checks whether constructor's prototype exists in object's prototype chain. Custom implementation walks `Object.getPrototypeOf(obj)` upward until it finds `Ctor.prototype` or reaches `null`.

This tests prototype chain understanding.

## 1. One-line mental model
`instanceof` asks: is constructor prototype in object prototype chain?

## 2. Problem it solves
Code sometimes needs know whether object was created from a prototype lineage.

## 3. Core idea
- Right side must be function/object with prototype behavior.
- Start from object's prototype.
- Walk prototype chain.
- Match against constructor prototype.
- Stop at `null`.

## 4. Visual / analogy
Climb family tree looking for ancestor.

```txt
obj -> ProtoA -> ProtoB -> Ctor.prototype
```

## 5. Minimal example

```js
function myInstanceOf(value, Ctor) {
  let proto = Object.getPrototypeOf(value);
  const target = Ctor.prototype;
  while (proto) {
    if (proto === target) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}
```

## 6. Real-world example

```js
myInstanceOf([], Array); // true
```

## 7. Common interview questions
- How does `instanceof` work?
- Implement custom `instanceof`.
- What is prototype chain?
- Why primitives fail?
- How can `Symbol.hasInstance` affect behavior?

## 8. Active recall test
1. What prototype is searched?
2. How move up chain?
3. When stop?
4. Why `[] instanceof Array` true?
5. What about primitives?

## 9. Mistakes / traps
- Comparing constructor directly to object.
- Not walking chain.
- Ignoring null prototype.
- Forgetting cross-realm issues in browsers.

## 10. Compare with related concepts
- **`instanceof` vs `typeof`:** prototype lineage vs primitive type string.
- **`instanceof` vs `Array.isArray`:** general prototype check vs robust array check.
- **Prototype vs constructor:** object link vs function used to create.

## 11. Summary from memory
Explain why `arr instanceof Array` checks prototype chain.

## 12. Spaced revision prompts
- 1 day: Define `instanceof`.
- 3 days: Implement custom version.
- 7 days: Explain prototype walk.
- 14 days: Compare with `typeof`.

