# Same-Origin Policy

## Detailed explanation

Same-Origin Policy is a browser rule that restricts scripts from reading data from a different scheme, host, or port.

## 1. One-line mental model

Frontend scripts can freely read only same-origin resources unless policy allows otherwise.

## 2. Problem it solves

Without same-origin restrictions, any website could read private data from another site where the user is logged in.

## 3. Core idea

- Origin is scheme plus host plus port.
- SOP limits reads, not all sends.
- CORS is a controlled exception to SOP.
- Cookies may be sent depending on cookie settings.
- Postman is not bound by SOP.

## 4. Visual / analogy

```txt
A website can mail a request, but cannot open another site’s private reply.
```

## 5. Minimal example

```txt
https://app.example.com and https://api.example.com are different origins.
```

## 6. Real-world example

A malicious site cannot read your banking API response because of SOP.

## 7. Common interview questions

#### What is the Same-Origin Policy?
- **The Engine Mechanism (Why it behaves this way):** The Same-Origin Policy (SOP) is a browser security rule that restricts JavaScript from reading responses from a different origin. An origin is defined as the combination of scheme (protocol), host (domain), and port. Two URLs have the same origin only if all three match: `https://app.example.com` and `https://app.example.com/dashboard` share the same origin, but `https://app.example.com` and `https://api.example.com` do not (different host), nor do `http://example.com` and `https://example.com` (different scheme). SOP allows scripts to send requests cross-origin but blocks reading the response — the request reaches the server, but JavaScript cannot access the response body. CORS is the controlled exception that allows specific cross-origin reads.
- **The Unforgettable Mental Model:** SOP is like **a one-way mirror**. You can send messages through it (requests reach the server), but you can't see what comes back (response blocked from JavaScript) unless the other side explicitly allows it (CORS).
- **The Trap:** Thinking SOP blocks all cross-origin communication. SOP blocks reading responses, not sending requests. Cross-origin form submissions, image loads, and script loads still work — only JavaScript read access is restricted.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The Same-Origin Policy is a browser security rule that restricts JavaScript from reading responses from a different origin. Origin is scheme plus host plus port — all three must match. SOP allows sending requests cross-origin but blocks reading the response. This prevents a malicious website from reading your banking data while you're logged in. CORS is the controlled exception that allows specific cross-origin reads when the server explicitly permits them. SOP is the foundation of web security — without it, any website could read data from any other website."

#### Why does the Same-Origin Policy matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** SOP matters because it's the foundation of web security that prevents cross-site data theft. Without SOP, a malicious website could make requests to your banking API while you're logged in and read your account balance, transfer history, and personal data. SOP ensures that only scripts from the same origin can read responses. For backend developers, SOP means understanding that CORS is the mechanism to selectively allow cross-origin access. It also means that server-to-server communication (APIs calling other APIs) is not bound by SOP — only browser-based JavaScript is restricted.
- **The Unforgettable Mental Model:** SOP is like **apartment building security**. Each apartment (origin) has its own lock. You can knock on any door (send requests), but you can only enter apartments where you have a key (same origin or CORS permission).
- **The Trap:** Confusing SOP with CORS. SOP is the restriction; CORS is the exception. SOP exists first, and CORS was added to allow controlled cross-origin access.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SOP matters because it's the foundation of web security — it prevents any website from reading data from another website where the user is authenticated. Without SOP, a malicious site could read your email, banking data, or social media while you're logged in. For backend developers, SOP means understanding that CORS is how we selectively allow cross-origin access. It also means that server-to-server communication isn't restricted by SOP — only browser JavaScript is. SOP is why CORS configuration is necessary for modern web apps with separate frontend and backend origins."

#### What bugs happen when Same-Origin Policy is misunderstood?
- **The Engine Mechanism (Why it behaves this way):** SOP misunderstandings cause several issues. Developers think CORS is a server-side security feature when it's actually a browser-side read permission. They configure CORS thinking it protects the API from unauthorized access, but CORS doesn't prevent server-to-server requests. They debug CORS errors as server errors when the server is working correctly — the browser is blocking the response. They use SOP as a security boundary for sensitive data, but SOP only affects browser JavaScript, not determined attackers using curl or custom scripts.
- **The Unforgettable Mental Model:** SOP misunderstandings are like **locking the front door but leaving the window open**. You think you're secure because the door is locked (CORS configured), but anyone can still enter through the window (server-to-server requests bypass SOP).
- **The Trap:** Relying on SOP/CORS as the primary security mechanism. CORS controls browser read access, not actual access. Authentication and authorization are the real security boundaries.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SOP misunderstandings lead to treating CORS as a security feature when it's just a browser read permission. CORS doesn't prevent unauthorized access — it only controls whether browsers let JavaScript read responses. Server-to-server tools bypass SOP entirely. The real security boundaries are authentication and authorization, not CORS. I design APIs to be secure regardless of CORS — proper auth, input validation, and rate limiting protect the API, while CORS controls browser read access for legitimate frontend clients."

#### How does SOP affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients are directly affected by SOP when the frontend and backend are on different origins. The browser blocks JavaScript from reading cross-origin responses unless the server includes CORS headers. This means the frontend developer must ensure the backend is configured with the correct CORS settings. During local development, the frontend dev server (localhost:5173) and backend server (localhost:8000) are different origins, requiring CORS configuration. In production, `app.example.com` and `api.example.com` are different origins, also requiring CORS. SOP is why frontend developers encounter CORS errors and why they need to understand the backend's CORS configuration.
- **The Unforgettable Mental Model:** SOP for the frontend is like a **language barrier**. You can speak to someone (send requests), but you can't understand their reply (read response) unless you share a common language (same origin or CORS).
- **The Trap:** The frontend developer trying to fix CORS errors on the client side. CORS errors can only be fixed on the server side — the backend must send the correct headers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend is affected by SOP when frontend and backend are on different origins — which is the norm in modern development. The browser blocks cross-origin reads unless the backend sends CORS headers. During local development, the dev server and API server are different origins. In production, app and API domains are different origins. CORS errors can only be fixed on the server side — the backend must send correct headers. During development, I use a dev server proxy to avoid CORS locally, and I ensure the backend is properly configured for production CORS."

#### How would you test Same-Origin Policy behavior?
- **The Engine Mechanism (Why it behaves this way):** Testing SOP involves verifying browser behavior with same-origin and cross-origin requests. Test same-origin requests succeed and responses are readable. Test cross-origin requests without CORS headers — the request reaches the server but the browser blocks the response from JavaScript. Test cross-origin requests with correct CORS headers — the browser allows reading the response. Test that server-to-server tools (curl, Postman) can access the API regardless of CORS. Use browser-based tests to verify actual SOP enforcement. Test with different origin combinations (different scheme, host, port) to verify SOP's three-component origin definition.
- **The Unforgettable Mental Model:** Testing SOP is like **testing a security system**. Try accessing from inside the building (same origin — works), from outside without permission (cross-origin without CORS — blocked), and from outside with permission (cross-origin with CORS — works).
- **The Trap:** Testing only with server-side tools. SOP is a browser mechanism — curl and Postman won't reveal SOP behavior. Only browser-based tests show actual enforcement.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test SOP by verifying browser behavior with same-origin and cross-origin requests. Same-origin requests succeed and responses are readable. Cross-origin without CORS headers reaches the server but the browser blocks the response. Cross-origin with correct CORS headers allows reading. I test with different origin combinations — different scheme, host, and port. I also verify that server-side tools bypass SOP. The key is browser-based testing — SOP is enforced by browsers, so server-side tools won't reveal the actual behavior."

## 8. Active recall test

1. **Explain the Same-Origin Policy without looking at notes.**
   - **Explanation:** SOP is a browser security rule that restricts JavaScript from reading responses from a different origin (scheme + host + port). It allows sending requests cross-origin but blocks reading the response. This prevents malicious websites from reading data from other sites where the user is authenticated. CORS is the controlled exception.

2. **Give one production bug related to SOP misunderstanding.**
   - **Explanation:** Treating CORS as a security boundary — configuring CORS to restrict origins but not implementing proper authentication. An attacker bypasses the browser entirely using curl and accesses the API without credentials, because CORS only affects browser JavaScript, not server-to-server tools.

3. **Give one example where SOP matters.**
   - **Explanation:** A malicious website at evil.com makes a fetch request to your-bank.com/api/balance while you're logged in. SOP blocks evil.com's JavaScript from reading the response, preventing the attacker from stealing your account balance.

4. **Explain how the frontend experiences SOP.**
   - **Explanation:** The frontend encounters SOP as CORS errors when frontend and backend are on different origins. The browser blocks cross-origin reads unless the backend sends CORS headers. During development, localhost dev server and API server are different origins. CORS errors can only be fixed on the server side.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Same-Origin Policy is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Same-Origin Policy in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Same-Origin Policy in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
