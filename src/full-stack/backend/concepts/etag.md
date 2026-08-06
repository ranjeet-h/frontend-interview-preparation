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

#### What is an ETag?
- **The Engine Mechanism (Why it behaves this way):** An ETag (Entity Tag) is a server-generated identifier that represents a specific version of a response body. It's typically a hash of the response content or a version identifier like `"user-123-v5"`. The server includes `ETag` in the response header. On subsequent requests, the browser sends `If-None-Match` with the previously received ETag. The server compares the incoming ETag with the current version of the resource. If they match (content hasn't changed), the server returns 304 Not Modified with no body, saving bandwidth. If they differ (content changed), the server returns 200 with the new body and a new ETag. ETags can be strong (exact byte match) or weak (semantic match, prefixed with `W/`).
- **The Unforgettable Mental Model:** An ETag is a **content fingerprint**. Just like a fingerprint identifies a person, an ETag identifies a specific version of a response.
- **The Trap:** Generating ETags that change on every request even when content hasn't changed. If the ETag includes a timestamp or random value, the browser never gets a 304 and always downloads the full response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An ETag is a server-generated identifier representing a specific version of a response. The server sends it with the response, and the browser includes it in subsequent requests via If-None-Match. If the ETag matches the current version, the server returns 304 Not Modified with no body, saving bandwidth. If it differs, the server returns the new content with a new ETag. ETags enable efficient cache validation — the browser checks if content changed without downloading the full response. I generate ETags from content hashes or version numbers that only change when the actual content changes."

#### Why do ETags matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** ETags matter because they enable efficient cache validation without relying solely on time-based expiry. With `max-age` alone, the cache serves stale data until the TTL expires, or re-downloads the full response on every request after expiry. With ETags, the cache can revalidate by sending a lightweight conditional request — the server responds with 304 (no body) if unchanged, or 200 with the new body if changed. This saves bandwidth for large responses (JSON APIs, images, documents) and ensures clients always have fresh data without unnecessary downloads. ETags also work well with CDNs and reverse proxies that support conditional requests.
- **The Unforgettable Mental Model:** ETags are like a **library's edition check**. Instead of re-reading the entire book to see if it's updated, you check the edition number. Same edition = skip it. New edition = read it.
- **The Trap:** Not using ETags for large API responses. Without ETags, clients re-download the full response on every request after cache expiry, wasting bandwidth and increasing latency.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: ETags matter because they enable efficient cache validation. Instead of re-downloading the full response after cache expiry, the client sends a lightweight conditional request with If-None-Match. The server returns 304 with no body if unchanged, saving bandwidth. This is especially valuable for large API responses, images, and documents. ETags complement max-age — max-age handles freshness within the TTL, ETags handle validation after expiry. I use ETags for all cacheable responses to minimize bandwidth usage."

#### What bugs happen when ETags are handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor ETag handling causes several issues. ETags that change on every request (e.g., including timestamps) prevent 304 responses entirely — the browser always downloads the full response, defeating the purpose. Not generating ETags for dynamic content means clients can't validate cache and always re-download. Strong ETags for responses that vary by Accept-Encoding cause mismatches when the compressed and uncompressed versions have different ETags. Not handling weak ETags correctly causes validation failures. ETag generation that's computationally expensive (hashing large responses on every request) adds server overhead that negates the bandwidth savings.
- **The Unforgettable Mental Model:** Poor ETags are like a **fingerprint that changes every time you touch something**. If the fingerprint is never stable, you can't use it to identify anything.
- **The Trap:** Including response timestamps in the ETag. `ETag: "user-123-2026-05-20T10:30:00Z"` changes every second, so the browser never gets a 304.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor ETags cause 304 responses to never occur because the ETag changes on every request. The most common bug is including timestamps in the ETag — it changes every second, so the browser always downloads the full response. Another bug is not generating ETags for dynamic content, forcing full re-downloads. I generate ETags from content hashes or version numbers that only change when content actually changes. For large responses, I compute ETags efficiently — using database version columns instead of hashing the full response body."

#### How do ETags affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients benefit from ETags through reduced bandwidth usage and faster responses. When the browser has a cached response with an ETag, it sends `If-None-Match` on the next request. If the server returns 304, the browser uses its cached copy — the response is instant with zero body download. HTTP libraries like fetch and axios handle 304 responses transparently — the cached response is returned to the application code. The frontend doesn't need to implement ETag logic manually; the browser handles it automatically based on the headers. However, the frontend should be aware that 304 responses mean the data may be from cache, not a fresh server response.
- **The Unforgettable Mental Model:** ETags for the frontend are like a **quick glance at a bulletin board**. If nothing changed since your last look, you don't need to read everything again.
- **The Trap:** The frontend not handling 304 responses in custom HTTP clients. Some libraries may treat 304 as an error instead of a successful cache validation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend benefits from ETags automatically through browser caching. When the browser has a cached response with an ETag, it sends If-None-Match and receives 304 if unchanged — the cached copy is used instantly. HTTP libraries handle 304 transparently. The frontend doesn't need to implement ETag logic manually. However, I ensure custom HTTP clients handle 304 correctly and don't treat it as an error. For service workers, I handle 304 responses in the cache strategy to ensure offline functionality."

#### How would you test ETag behavior?
- **The Engine Mechanism (Why it behaves this way):** Testing ETags involves verifying the ETag header is present, that conditional requests return 304 when content hasn't changed, and that they return 200 when content has changed. Test the first request returns 200 with an ETag header. Test the second request with If-None-Match returns 304 with no body. Test that modifying the resource causes the next conditional request to return 200 with a new ETag. Test that ETags are stable — the same content produces the same ETag across multiple requests. Test strong vs. weak ETag behavior. Test that ETags work correctly with CDN and proxy caches.
- **The Unforgettable Mental Model:** Testing ETags is like **testing a version control system**. Check out a file (first request), verify the version hash (ETag), check again without changes (304), make a change and check again (200 with new hash).
- **The Trap:** Only testing that ETags are present without testing conditional request behavior. The ETag header alone doesn't prove caching works — test the 304 response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test ETags by verifying the header is present, conditional requests return 304 when content hasn't changed, and 200 when it has. First request returns 200 with ETag. Second request with If-None-Match returns 304 with no body. After modifying the resource, the next conditional request returns 200 with a new ETag. I verify ETags are stable — same content produces same ETag. I also test with CDN and proxy caches to ensure they respect ETag validation. The key test is the 304 response — without it, the ETag isn't working."

## 8. Active recall test

1. **Explain ETag without looking at notes.**
   - **Explanation:** An ETag is a server-generated identifier representing a specific version of a response. The browser sends it back via If-None-Match on subsequent requests. If the content hasn't changed, the server returns 304 Not Modified (no body), saving bandwidth. If changed, it returns 200 with new content and ETag.

2. **Give one production bug related to ETags.**
   - **Explanation:** Including timestamps in the ETag causes it to change on every request. The browser never receives a 304 response and always downloads the full response body, wasting bandwidth and increasing latency — the exact opposite of what ETags are designed to prevent.

3. **Give one API example where ETags matter.**
   - **Explanation:** A large settings JSON endpoint: first request returns 200 with `ETag: "settings-v5"`. Subsequent requests send `If-None-Match: "settings-v5"` and receive 304 with no body. When settings change, the ETag becomes `"settings-v6"` and the client receives the new body.

4. **Explain how a frontend client experiences ETags.**
   - **Explanation:** The browser handles ETags automatically — it stores the ETag from the response, sends If-None-Match on subsequent requests, and uses the cached copy when receiving 304. The frontend doesn't need manual ETag logic, but should ensure HTTP clients handle 304 correctly.

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
