# HTTP Status Codes

## Detailed explanation

Status codes are the backend response vocabulary that tells clients whether a request succeeded, failed because of the client, failed because of the server, or needs another action.

## 1. One-line mental model

Use status codes to make API results machine-readable and predictable.

## 2. Problem it solves

Without status code discipline, clients parse random messages and cannot reliably handle auth, validation, retries, or not-found states.

## 3. Core idea

- 2xx means success, such as 200, 201, 204.
- 3xx means redirect or cache validation, such as 304.
- 4xx means client-side problem, such as 400, 401, 403, 404, 409, 422, 429.
- 5xx means server-side or upstream problem, such as 500, 502, 503, 504.
- Use one consistent error body shape with status codes.

## 4. Visual / analogy

```txt
Client sends request -> server returns status class -> client decides next behavior.
```

## 5. Minimal example

```txt
res.status(201).json({ data: createdUser })
```

## 6. Real-world example

A form submit returns 422 with field errors; a missing order returns 404; a rate-limited request returns 429.

## 7. Common interview questions

1. What is HTTP Status Codes?
2. Why does HTTP Status Codes matter in backend systems?
3. How would you explain HTTP Status Codes in an interview?
4. What bugs happen when HTTP Status Codes is handled poorly?
5. How does HTTP Status Codes affect frontend clients?
6. How would you test HTTP Status Codes?

## 8. Active recall test

1. Explain HTTP Status Codes without looking at notes.
2. Give one production bug related to HTTP Status Codes.
3. Give one API or backend example where HTTP Status Codes matters.
4. Explain how a frontend client should react to HTTP Status Codes.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

HTTP Status Codes is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain HTTP Status Codes in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define HTTP Status Codes in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
