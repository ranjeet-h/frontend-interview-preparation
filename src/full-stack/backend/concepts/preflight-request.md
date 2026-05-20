# Preflight Request

## Detailed explanation

A preflight request is an automatic browser `OPTIONS` request that checks whether a cross-origin request is allowed before sending the real request.

## 1. One-line mental model

Browser asks permission before risky cross-origin requests.

## 2. Problem it solves

Without preflight handling, legitimate frontend requests with JSON, auth headers, or non-simple methods fail before reaching route logic.

## 3. Core idea

- Triggered by non-simple methods, headers, or content types.
- Uses `OPTIONS`.
- Server must return allowed methods, headers, and origin.
- The real request is sent only if preflight succeeds.
- Can be cached with `Access-Control-Max-Age`.

## 4. Visual / analogy

```txt
Knock first, enter only if allowed.
```

## 5. Minimal example

```txt
OPTIONS /api/orders Access-Control-Request-Method: POST
```

## 6. Real-world example

Frontend sends `Authorization` header, so browser preflights the request.

## 7. Common interview questions

1. What is Preflight Request?
2. Why does Preflight Request matter in backend systems?
3. How would you explain Preflight Request in an interview?
4. What bugs happen when Preflight Request is handled poorly?
5. How does Preflight Request affect frontend clients?
6. How would you test Preflight Request?

## 8. Active recall test

1. Explain Preflight Request without looking at notes.
2. Give one production bug related to Preflight Request.
3. Give one API or backend example where Preflight Request matters.
4. Explain how a frontend client should react to Preflight Request.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Preflight Request is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Preflight Request in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Preflight Request in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
