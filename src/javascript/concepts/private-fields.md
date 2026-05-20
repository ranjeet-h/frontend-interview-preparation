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
- What are private fields?
- How differ from `_field`?
- Can outside code access `#field`?
- TypeScript `private` vs JS `#private`?
- Where useful?

## 8. Active recall test
1. What symbol marks private field?
2. Can bracket access read it?
3. Is `_name` private?
4. Where can `#field` be used?
5. Why useful in SDKs?

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

