# Same-Origin Policy

## Detailed explanation

Same-Origin Policy is a browser rule that restricts scripts from reading data from a different scheme, host, or port.

## 1. One-line mental model

Frontend scripts can freely read only same-origin resources unless policy allows otherwise.

## 2. Problem it solves

Without same-origin restrictions, any website could read private data from another site where the user is logged in.

## 3. Core idea

- Origin is scheme plus host plus port.
- SOP limits reads, not all sends.
- CORS is a controlled exception to SOP.
- Cookies may be sent depending on cookie settings.
- Postman is not bound by SOP.

## 4. Visual / analogy

```txt
A website can mail a request, but cannot open another site’s private reply.
```

## 5. Minimal example

```txt
https://app.example.com and https://api.example.com are different origins.
```

## 6. Real-world example

A malicious site cannot read your banking API response because of SOP.

## 7. Common interview questions

1. What is Same-Origin Policy?
2. Why does Same-Origin Policy matter in backend systems?
3. How would you explain Same-Origin Policy in an interview?
4. What bugs happen when Same-Origin Policy is handled poorly?
5. How does Same-Origin Policy affect frontend clients?
6. How would you test Same-Origin Policy?

## 8. Active recall test

1. Explain Same-Origin Policy without looking at notes.
2. Give one production bug related to Same-Origin Policy.
3. Give one API or backend example where Same-Origin Policy matters.
4. Explain how a frontend client should react to Same-Origin Policy.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Same-Origin Policy is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Same-Origin Policy in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Same-Origin Policy in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
