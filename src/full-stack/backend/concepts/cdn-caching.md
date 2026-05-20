# CDN Caching

## Detailed explanation

CDN caching stores responses near users at edge locations to reduce latency and backend load.

## 1. One-line mental model

Serve cacheable content from edge servers close to users.

## 2. Problem it solves

Global users experience slow responses if every static asset or public API response must travel to one origin server.

## 3. Core idea

- Best for static assets, images, public pages, and safe public API responses.
- Cache key may include path, query, headers, or locale.
- Invalidation/purging must be planned.
- Private personalized data needs careful rules.
- CDN can also protect from traffic spikes.

## 4. Visual / analogy

```txt
Mini warehouses near every city.
```

## 5. Minimal example

```txt
Cache-Control: public, s-maxage=300
```

## 6. Real-world example

Public product listing cached at CDN for 5 minutes.

## 7. Common interview questions

1. What is CDN Caching?
2. Why does CDN Caching matter in backend systems?
3. How would you explain CDN Caching in an interview?
4. What bugs happen when CDN Caching is handled poorly?
5. How does CDN Caching affect frontend clients?
6. How would you test CDN Caching?

## 8. Active recall test

1. Explain CDN Caching without looking at notes.
2. Give one production bug related to CDN Caching.
3. Give one API or backend example where CDN Caching matters.
4. Explain how a frontend client should react to CDN Caching.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

CDN Caching is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain CDN Caching in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define CDN Caching in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
