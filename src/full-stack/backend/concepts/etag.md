# ETag

## Detailed explanation

An ETag is a server-generated version identifier for a response that lets clients validate whether cached content is still fresh.

## 1. One-line mental model

ETag asks: did this representation change?

## 2. Problem it solves

Without validation, clients may redownload unchanged data or use stale data blindly.

## 3. Core idea

- Server returns `ETag` with response.
- Client sends `If-None-Match` later.
- Server returns 304 if unchanged.
- ETags can be strong or weak.
- Useful for bandwidth and cache validation.

## 4. Visual / analogy

```txt
Content fingerprint.
```

## 5. Minimal example

```txt
ETag: "user-123-v5"
```

## 6. Real-world example

Client revalidates a large settings JSON and receives 304 Not Modified.

## 7. Common interview questions

1. What is ETag?
2. Why does ETag matter in backend systems?
3. How would you explain ETag in an interview?
4. What bugs happen when ETag is handled poorly?
5. How does ETag affect frontend clients?
6. How would you test ETag?

## 8. Active recall test

1. Explain ETag without looking at notes.
2. Give one production bug related to ETag.
3. Give one API or backend example where ETag matters.
4. Explain how a frontend client should react to ETag.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

ETag is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain ETag in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define ETag in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
