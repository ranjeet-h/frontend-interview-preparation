# CORS

## Detailed explanation

CORS is a browser security mechanism that controls whether frontend JavaScript from one origin may read responses from another origin.

## 1. One-line mental model

CORS is server permission for cross-origin browser reads.

## 2. Problem it solves

Browsers block frontend code from reading cross-origin responses unless the backend explicitly allows it.

## 3. Core idea

- CORS is enforced by browsers, not Postman.
- Backend sends `Access-Control-Allow-Origin`.
- Credentials require explicit origin and `Access-Control-Allow-Credentials`.
- Non-simple requests trigger preflight.
- CORS is not backend authentication.

## 4. Visual / analogy

```txt
Reception desk asks: is this website allowed to read this response?
```

## 5. Minimal example

```txt
app.use(cors({ origin: "https://app.example.com", credentials: true }));
```

## 6. Real-world example

React app on `localhost:5173` calling API on `localhost:8000` needs CORS in development.

## 7. Common interview questions

1. What is CORS?
2. Why does CORS matter in backend systems?
3. How would you explain CORS in an interview?
4. What bugs happen when CORS is handled poorly?
5. How does CORS affect frontend clients?
6. How would you test CORS?

## 8. Active recall test

1. Explain CORS without looking at notes.
2. Give one production bug related to CORS.
3. Give one API or backend example where CORS matters.
4. Explain how a frontend client should react to CORS.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

CORS is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain CORS in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define CORS in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
