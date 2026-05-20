# API Versioning

## Detailed explanation

API versioning is the practice of evolving APIs without breaking existing clients by keeping old contracts available while introducing new ones.

## 1. One-line mental model

Versioning lets APIs change without forcing all clients to update at once.

## 2. Problem it solves

Mobile apps, third-party clients, and deployed frontends cannot always update immediately when backend contracts change.

## 3. Core idea

- Common approaches: URL versioning, header versioning, and media type versioning.
- Version only when the contract changes incompatibly.
- Prefer additive changes when possible.
- Deprecate old versions with dates and migration docs.
- Keep response and error shapes stable inside a version.

## 4. Visual / analogy

```txt
v1 is old road; v2 is new road. Both may exist during migration.
```

## 5. Minimal example

```txt
/api/v1/users and /api/v2/users
```

## 6. Real-world example

A mobile app using v1 keeps working while web frontend adopts v2 response fields.

## 7. Common interview questions

1. What is API Versioning?
2. Why does API Versioning matter in backend systems?
3. How would you explain API Versioning in an interview?
4. What bugs happen when API Versioning is handled poorly?
5. How does API Versioning affect frontend clients?
6. How would you test API Versioning?

## 8. Active recall test

1. Explain API Versioning without looking at notes.
2. Give one production bug related to API Versioning.
3. Give one API or backend example where API Versioning matters.
4. Explain how a frontend client should react to API Versioning.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

API Versioning is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain API Versioning in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define API Versioning in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
