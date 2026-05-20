# Middleware

## Detailed explanation

Middleware is reusable code that runs before or after route handlers to handle cross-cutting backend behavior.

## 1. One-line mental model

Middleware is a pipeline stage around request handlers.

## 2. Problem it solves

Auth, logging, parsing, CORS, and rate limiting should not be duplicated inside every route.

## 3. Core idea

- Middleware receives request, response, and next handler.
- It can modify request context.
- It can end the response early.
- Order matters.
- Error middleware centralizes failure handling.

## 4. Visual / analogy

```txt
Airport checkpoints before boarding.
```

## 5. Minimal example

```txt
app.use(auth); app.use(rateLimit); app.get("/me", handler);
```

## 6. Real-world example

JWT middleware attaches `req.user`; route uses it without revalidating token.

## 7. Common interview questions

1. What is Middleware?
2. Why does Middleware matter in backend systems?
3. How would you explain Middleware in an interview?
4. What bugs happen when Middleware is handled poorly?
5. How does Middleware affect frontend clients?
6. How would you test Middleware?

## 8. Active recall test

1. Explain Middleware without looking at notes.
2. Give one production bug related to Middleware.
3. Give one API or backend example where Middleware matters.
4. Explain how a frontend client should react to Middleware.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Middleware is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Middleware in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Middleware in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
