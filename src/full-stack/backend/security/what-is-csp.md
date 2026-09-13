# What is CSP

## Detailed explanation

What is CSP is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is csp by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend security rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, what is csp affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is CSP (Content Security Policy)?
- **The Engine Mechanism (Why it behaves this way):** CSP is an HTTP response header that restricts where the browser can load resources from — scripts, styles, images, fonts, frames, and more. It's defined through directives like `script-src`, `style-src`, `img-src`, `frame-ancestors`. A strict CSP like `script-src 'self'` allows only same-origin scripts, blocking all inline and external scripts. CSP is the most effective defense-in-depth measure against XSS.
- **The Unforgettable Mental Model:** The **Resource Allowlist**. CSP is like a bouncer with a guest list for every resource type. Scripts? Only from these sources. Styles? Only from these. Images? Only from these. Anything not on the list is turned away.
- **The Trap**: Thinking CSP prevents XSS injection. CSP doesn't prevent injection — it prevents the injected script from executing. It's defense-in-depth, not the primary defense.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CSP is an HTTP header that restricts where the browser can load resources from — scripts, styles, images, and more. It's defined through directives like script-src, style-src, and img-src. A strict CSP like `script-src 'self'` allows only same-origin scripts, blocking inline and external scripts. CSP doesn't prevent XSS injection — it prevents the injected script from executing. It's the most effective defense-in-depth measure against XSS."

#### What are the key CSP directives?
- **The Engine Mechanism (Why it behaves this way):** Key directives: `script-src` (script sources), `style-src` (style sources), `img-src` (image sources), `font-src` (font sources), `connect-src` (fetch/XHR destinations), `frame-ancestors` (iframe embedding), `default-src` (fallback for unspecified directives), `object-src` (plugin sources), `base-uri` (base tag restriction), `form-action` (form submission targets). Each directive specifies allowed sources: `'self'`, specific domains, `'none'`, `'unsafe-inline'`, `'unsafe-eval'`, nonces, or hashes.
- **The Unforgettable Mental Model:** The **Department-Specific Rules**. Each directive is a rule for a different department: scripts department (script-src), styles department (style-src), images department (img-src). Each department has its own approved vendor list.
- **The Trap**: Using `default-src *` as a catch-all. This allows all resource types from all sources, essentially disabling CSP. Each directive should be explicitly configured.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CSP has directives for each resource type: script-src for scripts, style-src for styles, img-src for images, connect-src for fetch/XHR, frame-ancestors for iframe embedding, and more. Each directive specifies allowed sources — 'self', specific domains, 'none', or nonces/hashes. I configure each directive explicitly rather than relying on default-src. The most important directives are script-src (XSS prevention) and frame-ancestors (clickjacking prevention)."

#### How do CSP nonces and hashes work?
- **The Engine Mechanism (Why it behaves this way):** CSP nonces and hashes allow specific inline scripts while blocking others. A nonce is a random value generated per request, included in the CSP header (`script-src 'nonce-abc123'`) and in the script tag (`<script nonce="abc123">`). The browser only executes scripts with matching nonces. Hashes work similarly — the CSP header includes the hash of the inline script content (`script-src 'sha256-abc...'`), and the browser only executes scripts matching the hash.
- **The Unforgettable Mental Model:** The **Event Wristband**. Each legitimate script gets a wristband (nonce) that's unique to the event (request). The bouncer (browser) checks wristbands — no wristband, no entry. Hashes are like a fingerprint check — only scripts matching the registered fingerprint are allowed.
- **The Trap**: Reusing nonces across requests. Nonces must be unique per request — reusing them allows attackers to capture and reuse the nonce. Generate a fresh cryptographic nonce for each response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CSP nonces and hashes allow specific inline scripts while blocking all others. A nonce is a random value generated per request, included in both the CSP header and the script tag. The browser only executes scripts with matching nonces. Hashes work similarly — the CSP includes the hash of the inline script content. I prefer nonces for dynamic content and hashes for static inline scripts. Nonces must be unique per request — I generate a fresh cryptographic nonce for each response."

#### What would you monitor for CSP?
- **The Engine Mechanism (Why it behaves this way):** Monitor: CSP violation reports (sent via `report-uri` or `report-to` directives), violation rates by directive (which resource types are being blocked), violation sources (which domains are being blocked), and CSP header configuration changes. Alert on high violation rates (indicates misconfiguration or attack) and new violation sources (indicates new attack patterns).
- **The Unforgettable Mental Model:** The **CSP Violation Log**. Every time the bouncer (CSP) turns someone away, it logs the incident. You review the logs to understand who's being blocked and why — legitimate resources blocked by misconfiguration or malicious resources blocked by the policy.
- **The Trap**: Not setting up CSP violation reporting. Without `report-uri` or `report-to`, CSP violations are silently blocked with no visibility into what's being blocked or why.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor CSP through violation reports sent via the report-uri or report-to directives. These reports tell me which resources are being blocked, by which directive, and from which source. I alert on high violation rates (misconfiguration or attack) and new violation sources (new attack patterns). CSP reporting is essential — without it, violations are silently blocked with no visibility. I use the reports to refine my CSP policy, blocking legitimate resources that should be allowed and catching malicious resources that should be blocked."

## 8. Active recall test

1. **What is CSP?**
   - **Explanation:** Content Security Policy — an HTTP header that restricts where the browser can load resources from (scripts, styles, images, etc.). Most effective defense-in-depth against XSS.
2. **What are the key CSP directives?**
   - **Explanation:** script-src (scripts), style-src (styles), img-src (images), connect-src (fetch/XHR), frame-ancestors (iframe embedding), default-src (fallback), object-src (plugins), base-uri (base tag).
3. **How do CSP nonces work?**
   - **Explanation:** Random value generated per request, included in CSP header and script tag. Browser only executes scripts with matching nonce. Must be unique per request.
4. **How do CSP hashes work?**
   - **Explanation:** Hash of inline script content included in CSP header. Browser only executes scripts matching the hash. Good for static inline scripts.
5. **What does script-src 'self' do?**
   - **Explanation:** Allows only scripts from the same origin. Blocks all inline scripts, external scripts, and eval(). Most restrictive and safest script policy.
6. **Why is CSP report-uri important?**
   - **Explanation:** It sends violation reports to a specified endpoint, providing visibility into what resources are being blocked. Without it, violations are silent.
7. **What should you monitor for CSP?**
   - **Explanation:** Violation reports (by directive, source, rate), CSP header configuration changes. Alert on high violation rates and new violation sources.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is CSP in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is CSP in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
