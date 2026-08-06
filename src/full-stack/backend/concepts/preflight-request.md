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

#### What is a preflight request?
- **The Engine Mechanism (Why it behaves this way):** A preflight request is an automatic HTTP OPTIONS request that the browser sends before certain cross-origin requests to check if the actual request is allowed. It's triggered by "non-simple" requests — those using methods other than GET/HEAD/POST, custom headers (Authorization, X-Custom-Header), or content types other than application/x-www-form-urlencoded, multipart/form-data, or text/plain. The preflight includes `Access-Control-Request-Method` (the method the actual request will use) and `Access-Control-Request-Headers` (the headers it will include). The server must respond with `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers` matching the requested values. Only if the preflight succeeds does the browser send the actual request.
- **The Unforgettable Mental Model:** A preflight is like **asking permission before entering a restricted area**. You knock (OPTIONS), the guard checks your request (headers/methods), and only if approved do you actually enter (actual request).
- **The Trap:** Not handling OPTIONS requests in the backend. If the server doesn't respond to OPTIONS with the correct CORS headers, the browser blocks the actual request — even if the actual request would have been accepted.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A preflight request is an automatic OPTIONS request the browser sends before certain cross-origin requests to check if they're allowed. It's triggered by non-simple requests — custom methods, custom headers, or non-standard content types. The preflight asks 'can I use this method and these headers?' The server must respond with allowed methods, headers, and origin. Only if the preflight succeeds does the browser send the actual request. I handle preflight by configuring CORS middleware to respond to OPTIONS with the correct headers."

#### Why do preflight requests matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Preflight requests matter because they're the gatekeeper for non-simple cross-origin requests. Without proper preflight handling, legitimate frontend requests with JSON bodies, auth headers, or custom methods fail before reaching route logic. The backend must respond to OPTIONS requests quickly (no database queries, no auth checks) with the correct CORS headers. Preflight responses can be cached with `Access-Control-Max-Age` to reduce the overhead of repeated preflights. Understanding preflight behavior is essential for debugging CORS issues that appear as "the request never reaches the server."
- **The Unforgettable Mental Model:** Preflight is like a **security checkpoint at an airport**. Before you board (actual request), you go through screening (OPTIONS). If screening passes, you board. If not, you're stopped before you even reach the gate.
- **The Trap:** Applying auth middleware to OPTIONS requests. Preflight requests don't include credentials, so auth middleware rejects them, causing the preflight to fail and the actual request to never be sent.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Preflight requests matter because they gatekeep non-simple cross-origin requests. Without proper handling, frontend requests with JSON bodies or auth headers fail before reaching route logic. The backend must respond to OPTIONS quickly with correct CORS headers — no auth checks, no database queries. I cache preflight responses with Access-Control-Max-Age to reduce overhead. The key insight is that preflight requests don't include credentials, so auth middleware must skip OPTIONS requests."

#### What bugs happen when preflight requests are handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor preflight handling causes several production issues. Not responding to OPTIONS causes the browser to block the actual request entirely — the frontend sees a CORS error and the request never reaches the route handler. Applying auth middleware to OPTIONS requests rejects the preflight because preflight requests don't include auth headers. Returning incorrect allowed methods or headers in the preflight response causes the browser to block the actual request. Not caching preflight responses causes an OPTIONS request before every actual request, doubling the number of requests and adding latency.
- **The Unforgettable Mental Model:** Poor preflight handling is like a **security guard who doesn't understand the rules**. They either let everyone through (no preflight) or stop everyone (rejecting valid preflights), but never apply the correct rules.
- **The Trap:** Thinking the actual request failed when it was the preflight that failed. The browser console shows a CORS error, but the server logs show no record of the actual request — because it was never sent.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor preflight handling blocks legitimate requests before they reach route logic. The most common bug is applying auth middleware to OPTIONS requests — preflight requests don't include credentials, so auth rejects them, and the actual request is never sent. Another bug is returning incorrect allowed methods or headers in the preflight response. I ensure CORS middleware handles OPTIONS before auth middleware, returns correct allowed methods and headers, and caches preflight responses with Max-Age to reduce overhead."

#### How does preflight affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Preflight requests add an extra round-trip latency before the actual request is sent. The browser sends OPTIONS, waits for the response, then sends the actual request. This doubles the number of HTTP requests for non-simple cross-origin calls. The frontend cannot control or skip preflight — it's automatic browser behavior. The frontend experiences preflight as slightly slower API calls and, when preflight fails, as CORS errors that appear as network failures. The `Access-Control-Max-Age` header reduces preflight frequency by caching the preflight result.
- **The Unforgettable Mental Model:** Preflight for the frontend is like a **two-step door**. First you knock (OPTIONS), wait for approval, then you actually enter (actual request). It takes longer than a door that's always open.
- **The Trap:** The frontend trying to "fix" preflight latency by switching to simple requests. Removing auth headers or changing content types to avoid preflight compromises security and functionality.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Preflight adds an extra round-trip latency because the browser sends OPTIONS before the actual request. The frontend can't control this — it's automatic browser behavior. When preflight fails, the frontend sees CORS errors that appear as network failures. I reduce preflight overhead by setting Access-Control-Max-Age to cache preflight results. I don't try to avoid preflight by removing auth headers — that compromises security. Instead, I ensure the backend handles preflight correctly and efficiently."

#### How would you test preflight behavior?
- **The Engine Mechanism (Why it behaves this way):** Testing preflight involves sending OPTIONS requests with the same headers and methods the actual request will use, and verifying the response includes correct CORS headers. Test that OPTIONS returns 200 with Access-Control-Allow-Origin, Allow-Methods, and Allow-Headers matching the actual request's requirements. Test that OPTIONS from disallowed origins doesn't include the allow header. Test that OPTIONS doesn't require authentication. Test that Access-Control-Max-Age is set for caching. Test the full flow — preflight succeeds, then actual request succeeds. Test that a failed preflight prevents the actual request.
- **The Unforgettable Mental Model:** Testing preflight is like **testing a door's intercom system**. Press the button (OPTIONS), verify the right person responds with the right answer, then verify the door opens (actual request).
- **The Trap:** Only testing the actual request without testing the preflight. The actual request may work in Postman (no preflight) but fail in the browser (preflight required).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test preflight by sending OPTIONS requests with the same headers and methods the actual request uses. I verify the response includes correct Access-Control-Allow-Origin, Allow-Methods, and Allow-Headers. I test that OPTIONS doesn't require auth, that Max-Age is set for caching, and that disallowed origins are rejected. I also test the full flow — preflight succeeds then actual request succeeds. The key is testing in a browser context, not just with curl, because only browsers send preflight requests."

## 8. Active recall test

1. **Explain preflight requests without looking at notes.**
   - **Explanation:** A preflight is an automatic OPTIONS request the browser sends before non-simple cross-origin requests (custom methods, headers, or content types). It asks the server if the actual request is allowed. The server must respond with allowed origin, methods, and headers. Only then does the browser send the actual request.

2. **Give one production bug related to preflight requests.**
   - **Explanation:** Auth middleware applied to OPTIONS requests rejects preflight because preflight doesn't include auth headers. The browser blocks the actual request, and the frontend sees a CORS error. The server logs show no record of the actual request because it was never sent.

3. **Give one API example where preflight matters.**
   - **Explanation:** A frontend sends `POST /api/orders` with `Content-Type: application/json` and `Authorization: Bearer token`. The browser first sends OPTIONS to check if POST with these headers is allowed. The server responds with allowed methods and headers, then the browser sends the actual POST.

4. **Explain how a frontend client experiences preflight.**
   - **Explanation:** The frontend experiences preflight as extra latency (two round-trips instead of one) and, when preflight fails, as CORS network errors. The frontend cannot control preflight — it's automatic browser behavior. Max-Age caching reduces preflight frequency.

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
