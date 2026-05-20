# Rate Limiting

## Detailed explanation

Rate limiting restricts how many requests a client can make in a time window to protect APIs from abuse and overload.

## 1. One-line mental model

Allow only a fixed amount of traffic per identity per time window.

## 2. Problem it solves

Public APIs can be abused, brute-forced, scraped, or accidentally overloaded without request limits.

## 3. Core idea

- Limit by IP, user id, API key, route, or tenant.
- Common algorithms include fixed window, sliding window, leaky bucket, and token bucket.
- Return 429 when limit is exceeded.
- Use Redis or distributed storage for multi-instance apps.
- Apply stricter limits to login and expensive endpoints.

## 4. Visual / analogy

```txt
Turnstile that allows only N people per minute.
```

## 5. Minimal example

```txt
if (tooManyRequests) return res.status(429).json({ error: "rate_limited" });
```

## 6. Real-world example

Login endpoint allows 5 failed attempts per minute per account/IP.

## 7. Common interview questions

1. What is Rate Limiting?
2. Why does Rate Limiting matter in backend systems?
3. How would you explain Rate Limiting in an interview?
4. What bugs happen when Rate Limiting is handled poorly?
5. How does Rate Limiting affect frontend clients?
6. How would you test Rate Limiting?

## 8. Active recall test

1. Explain Rate Limiting without looking at notes.
2. Give one production bug related to Rate Limiting.
3. Give one API or backend example where Rate Limiting matters.
4. Explain how a frontend client should react to Rate Limiting.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Rate Limiting is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Rate Limiting in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Rate Limiting in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
