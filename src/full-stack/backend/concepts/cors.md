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

#### What is CORS?
- **The Engine Mechanism (Why it behaves this way):** CORS (Cross-Origin Resource Sharing) is a browser security mechanism that controls whether frontend JavaScript from one origin (scheme + host + port) may read responses from a different origin. When a browser makes a cross-origin request, it sends the request to the server. If the response includes `Access-Control-Allow-Origin` header matching the requesting origin, the browser allows the JavaScript to read the response. If the header is missing or doesn't match, the browser blocks the response from JavaScript — the request still reaches the server, but the response is invisible to the frontend code. CORS is enforced by browsers only, not by server-to-server tools like curl or Postman.
- **The Unforgettable Mental Model:** CORS is like a **VIP list at a club**. The bouncer (browser) checks if your website is on the list (Access-Control-Allow-Origin). If yes, you get in. If no, you can knock on the door (request reaches server), but you can't enter (response blocked from JavaScript).
- **The Trap:** Thinking CORS prevents the request from reaching the server. The request always reaches the server — CORS only controls whether the browser lets JavaScript read the response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CORS is a browser security mechanism that controls whether frontend JavaScript from one origin can read responses from another origin. The browser sends the request, and if the response includes Access-Control-Allow-Origin matching the requesting origin, the browser allows JavaScript to read it. If not, the browser blocks the response from JavaScript — but the request still reaches the server. CORS is enforced by browsers only, not by server-to-server tools. It's not authentication — it controls cross-origin reads, not who can access the resource."

#### Why does CORS matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** CORS matters because modern web apps often have the frontend and backend on different origins — React on `localhost:5173`, API on `localhost:8000`, or frontend on `app.example.com`, API on `api.example.com`. Without CORS configuration, the browser blocks all cross-origin responses, making the API unusable from the frontend. CORS also controls credential sharing — cookies and auth headers require explicit `Access-Control-Allow-Credentials: true` and a specific origin (not wildcard). Proper CORS configuration is essential for development (localhost), production (different domains), and security (restricting which origins can access the API).
- **The Unforgettable Mental Model:** CORS is like a **bridge between two islands**. Without the bridge, people on one island can't access resources on the other — even though the resources exist and are accessible from the island itself.
- **The Trap:** Using `Access-Control-Allow-Origin: *` with credentials. Browsers reject this combination — wildcard origins and credentials are mutually exclusive for security reasons.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CORS matters because modern web apps often have frontend and backend on different origins. Without CORS, the browser blocks cross-origin responses, making the API unusable from the frontend. CORS also controls credential sharing — cookies and auth headers require explicit origin and Allow-Credentials. I configure CORS with specific allowed origins in production, enable credentials when needed, and never use wildcard with credentials. In development, I allow localhost origins for the frontend dev server."

#### What bugs happen when CORS is handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor CORS causes several production issues. Missing CORS headers block all frontend requests in the browser, showing confusing network errors. Using wildcard origin with credentials causes browsers to reject the response entirely. Not handling preflight OPTIONS requests causes non-simple requests (with JSON body or auth headers) to fail before reaching route logic. Not including `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` in preflight responses causes the browser to block the actual request. Overly permissive CORS (allowing all origins) enables cross-site data theft if the API returns sensitive data.
- **The Unforgettable Mental Model:** Poor CORS is like a **bridge with the wrong permits**. The bridge exists, but the authorities (browser) won't let anyone cross it because the paperwork (headers) is wrong.
- **The Trap:** Debugging CORS errors as server errors. CORS errors are browser-side — the server may be working perfectly, but the browser blocks the response from JavaScript.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor CORS blocks frontend requests with confusing browser errors, rejects credential requests from wildcard origins, and fails preflight checks for non-simple requests. The most common bug is not handling OPTIONS preflight requests — when the frontend sends JSON or auth headers, the browser preflights with OPTIONS, and if the server doesn't respond correctly, the actual request is never sent. I use CORS middleware that handles both simple and preflight requests, configure specific allowed origins, and never use wildcard with credentials."

#### How does CORS affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients experience CORS as browser-enforced restrictions on cross-origin reads. When CORS is misconfigured, the frontend sees network errors in the console — "CORS policy: No Access-Control-Allow-Origin header" — even though the server responded successfully. The frontend cannot distinguish between a CORS error and a network error programmatically. For credentialed requests, the frontend must set `withCredentials: true` (axios) or `credentials: 'include'` (fetch), and the backend must respond with the specific origin and `Allow-Credentials: true`. Preflight requests add an extra round-trip latency before the actual request is sent.
- **The Unforgettable Mental Model:** CORS for the frontend is like a **glass wall**. You can see the server exists (the request reaches it), but you can't touch what's behind the glass (the response is blocked from JavaScript).
- **The Trap:** The frontend trying to handle CORS errors like regular HTTP errors. CORS errors don't produce HTTP responses in JavaScript — they produce opaque network errors that can't be inspected.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend experiences CORS as browser-enforced restrictions. When misconfigured, the frontend sees network errors in the console even though the server responded. CORS errors can't be distinguished from network errors programmatically in JavaScript. For credentialed requests, the frontend sets withCredentials and the backend responds with specific origin and Allow-Credentials. Preflight requests add latency. I design the frontend to handle CORS gracefully — proper error messages, retry logic, and development proxy configuration to avoid CORS during local development."

#### How would you test CORS?
- **The Engine Mechanism (Why it behaves this way):** Testing CORS involves sending requests from different origins and verifying the correct headers are returned. Test simple GET requests from allowed origins — should include Access-Control-Allow-Origin. Test requests from disallowed origins — should not include the header. Test credentialed requests — should include specific origin (not wildcard) and Allow-Credentials. Test preflight OPTIONS requests with custom methods and headers — should return allowed methods and headers. Test that non-browser tools (curl, Postman) can access the API regardless of CORS headers. Use browser-based tests to verify actual browser behavior.
- **The Unforgettable Mental Model:** Testing CORS is like **testing a club's VIP list**. Try different guests (origins) and verify the bouncer (browser) lets the right ones in and keeps the wrong ones out.
- **The Trap:** Only testing with curl or Postman. These tools aren't bound by CORS — only browser-based tests reveal actual CORS behavior.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test CORS by sending requests from different origins and verifying headers. Allowed origins get Access-Control-Allow-Origin, disallowed origins don't. Credentialed requests get specific origin and Allow-Credentials. Preflight OPTIONS returns allowed methods and headers. I also test with curl to verify the API works server-side regardless of CORS. The key is browser-based testing — CORS is a browser mechanism, so server-side tools like curl won't reveal CORS issues."

## 8. Active recall test

1. **Explain CORS without looking at notes.**
   - **Explanation:** CORS is a browser security mechanism that controls whether frontend JavaScript from one origin can read responses from another origin. The browser checks Access-Control-Allow-Origin in the response. If it matches the requesting origin, JavaScript can read the response. If not, the browser blocks it. CORS is enforced by browsers only, not by server tools.

2. **Give one production bug related to CORS.**
   - **Explanation:** Not handling OPTIONS preflight requests causes the frontend's POST with JSON body to fail. The browser sends OPTIONS first, the server doesn't respond with allowed methods, and the browser blocks the actual POST request — the frontend sees a CORS error.

3. **Give one API example where CORS matters.**
   - **Explanation:** A React app on localhost:5173 calling an API on localhost:8000. Without CORS middleware, the browser blocks all responses. With `cors({ origin: 'http://localhost:5173' })`, the browser allows the frontend to read API responses.

4. **Explain how a frontend client experiences CORS.**
   - **Explanation:** The frontend sees CORS as browser-enforced restrictions. Misconfigured CORS produces network errors in the console that can't be distinguished from real network errors. For credentials, the frontend sets withCredentials and the backend must respond with specific origin. Preflight adds latency.

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
