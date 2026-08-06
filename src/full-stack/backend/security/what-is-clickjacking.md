# What is clickjacking

## Detailed explanation

What is clickjacking is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is clickjacking by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what is clickjacking affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is clickjacking?
- **The Engine Mechanism (Why it behaves this way):** Clickjacking (UI redressing) is an attack where a malicious website embeds the target site in an invisible iframe and tricks the user into clicking on elements of the target site. The user thinks they're clicking on the malicious site's content, but they're actually interacting with the target site — potentially performing actions like transferring money, changing settings, or granting permissions.
- **The Unforgettable Mental Model:** The **Invisible Overlay**. The attacker places a transparent sheet (invisible iframe) over a button on their page. When you think you're clicking "Play Video," you're actually clicking "Delete Account" on the transparent sheet underneath.
- **The Trap:** Thinking clickjacking is only a frontend concern. The backend prevents clickjacking by setting the `X-Frame-Options` and `Content-Security-Policy: frame-ancestors` headers, which tell browsers not to allow the page to be embedded in iframes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Clickjacking is an attack where a malicious site embeds the target site in an invisible iframe and tricks users into clicking on the target site's elements. The user thinks they're interacting with the malicious site, but they're actually performing actions on the target site. The backend prevents clickjacking by setting X-Frame-Options and CSP frame-ancestors headers, which tell browsers not to allow the page to be embedded in iframes."

#### How does clickjacking work?
- **The Engine Mechanism (Why it behaves this way):** Attack flow: (1) Attacker creates a malicious page with an invisible iframe loading the target site, (2) The attacker positions the iframe so the target's button (e.g., "Delete Account") aligns with a visible element on the malicious page (e.g., "Play Video"), (3) The user clicks "Play Video," but actually clicks the target's "Delete Account" button through the transparent iframe, (4) The action is performed in the context of the user's authenticated session.
- **The Unforgettable Mental Model:** The **Puppet Master's Stage**. The attacker sets up a stage (malicious page) where the visible props (buttons) are fake. The real controls (target site's buttons) are hidden behind a glass panel (iframe). When the audience (users) interacts with the props, they're actually operating the hidden controls.
- **The Trap:** Only protecting the main page while leaving API endpoints unprotected. Clickjacking can target any page that can be embedded in an iframe, including admin panels and settings pages.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Clickjacking works by embedding the target site in an invisible iframe and positioning it so the target's interactive elements align with the attacker's visible elements. When the user clicks what they think is the attacker's content, they're actually clicking the target site's elements. The attack works because the user is authenticated to the target site, so their clicks perform authenticated actions. The defense is to prevent the site from being embedded in iframes."

#### How do you prevent clickjacking?
- **The Engine Mechanism (Why it behaves this way):** Prevention: (1) Set `X-Frame-Options: DENY` (never allow embedding) or `X-Frame-Options: SAMEORIGIN` (only allow embedding from same origin), (2) Set `Content-Security-Policy: frame-ancestors 'none'` (modern replacement for X-Frame-Options) or `frame-ancestors 'self'`, (3) Use both headers for maximum browser compatibility, (4) Implement frame-busting JavaScript as defense-in-depth (but not as the primary defense).
- **The Unforgettable Mental Model:** The **No-Embedding Sign**. The page has a sign that says "don't put me in a frame." Browsers that understand the sign (X-Frame-Options, CSP) refuse to embed the page. The sign works at the server level — the page itself enforces it.
- **The Trap:** Relying solely on JavaScript frame-busting. Attackers can bypass frame-busting by disabling JavaScript, using sandboxed iframes, or employing double-iframe techniques.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent clickjacking by setting both X-Frame-Options and CSP frame-ancestors headers. X-Frame-Options: DENY prevents all embedding; SAMEORIGIN allows same-origin embedding. CSP frame-ancestors is the modern replacement and supports more granular control. I use both for maximum browser compatibility. JavaScript frame-busting is defense-in-depth but not the primary defense — it can be bypassed by disabling JavaScript or using sandboxed iframes."

#### What would you monitor for clickjacking?
- **The Engine Mechanism (Why it behaves this way):** Monitor: X-Frame-Options header presence and correctness, CSP frame-ancestors configuration, iframe embedding attempts (Referrer headers showing your site embedded in external domains), and unusual user action patterns (actions that seem inconsistent with normal user behavior). Alert on missing or incorrect framing headers.
- **The Unforgettable Mental Model:** The **Embedding Detector**. You're watching whether your pages are being embedded in external frames (Referrer analysis), whether the anti-embedding headers are set correctly, and whether user actions look suspicious.
- **The Trap:** Not monitoring header configuration. A deployment error could remove X-Frame-Options or CSP frame-ancestors headers, leaving the site vulnerable to clickjacking.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor clickjacking prevention through X-Frame-Options and CSP frame-ancestors header verification, Referrer header analysis (detecting your site embedded in external domains), and unusual user action patterns. I alert on missing or incorrect framing headers — a deployment error could remove these headers, leaving the site vulnerable. I also include header verification in automated deployment checks."

## 8. Active recall test

1. **What is clickjacking?**
   - **Explanation:** An attack where a malicious site embeds the target site in an invisible iframe, tricking users into clicking on the target site's elements while thinking they're interacting with the malicious site.
2. **How does clickjacking work?**
   - **Explanation:** Attacker creates invisible iframe with target site, positions it so target's button aligns with attacker's visible element. User clicks attacker's element, actually clicks target's button through iframe.
3. **How do you prevent clickjacking?**
   - **Explanation:** Set X-Frame-Options: DENY or SAMEORIGIN. Set CSP frame-ancestors 'none' or 'self'. Use both headers for browser compatibility. JavaScript frame-busting is defense-in-depth only.
4. **What is the difference between X-Frame-Options DENY and SAMEORIGIN?**
   - **Explanation:** DENY prevents all iframe embedding. SAMEORIGIN allows embedding only from pages on the same origin. Use DENY unless you legitimately need same-origin embedding.
5. **Why is JavaScript frame-busting insufficient?**
   - **Explanation:** Attackers can bypass it by disabling JavaScript, using sandboxed iframes, or double-iframe techniques. Server-side headers (X-Frame-Options, CSP) are the reliable defense.
6. **What is CSP frame-ancestors?**
   - **Explanation:** A CSP directive that replaces X-Frame-Options. It specifies which origins can embed the page in iframes. `frame-ancestors 'none'` blocks all embedding; `'self'` allows same-origin.
7. **What should you monitor for clickjacking?**
   - **Explanation:** X-Frame-Options and CSP frame-ancestors header presence/correctness, Referrer headers showing external embedding, and unusual user action patterns. Alert on missing headers.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is clickjacking in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is clickjacking in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
