# Where should access tokens be stored

## Detailed explanation

Where should access tokens be stored is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand where should access tokens be stored by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply auth rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, where should access tokens be stored affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### Where should access tokens be stored on the client?
- **The Engine Mechanism (Why it behaves this way):** Access tokens should be stored in httpOnly, secure, sameSite cookies when possible. This prevents JavaScript access (XSS protection), ensures HTTPS-only transmission, and mitigates CSRF. For mobile apps, use platform-secure storage (Keychain on iOS, Keystore on Android). localStorage and sessionStorage are vulnerable to XSS.
- **The Unforgettable Mental Model:** **Safe vs. Countertop**. httpOnly cookies are a safe — only the browser (not JavaScript) can open it. localStorage is the countertop — everything in the house (including burglars via XSS) can see and grab what's on it.
- **The Trap:** Storing tokens in localStorage because it's "easier to access from JavaScript." Convenience is not a security strategy. XSS is not a theoretical risk — it's one of the most common web vulnerabilities.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Access tokens should be stored in httpOnly, secure, sameSite cookies for web applications. httpOnly prevents JavaScript access, protecting against XSS. Secure ensures HTTPS-only transmission. sameSite mitigates CSRF. For mobile apps, I use iOS Keychain or Android Keystore. I avoid localStorage and sessionStorage because any XSS vulnerability exposes tokens immediately. The trade-off is that cookies require CSRF protection, but that's a solved problem with sameSite and anti-CSRF tokens."

#### What are the risks of storing tokens in localStorage?
- **The Engine Mechanism (Why it behaves this way):** localStorage is accessible to any JavaScript running on the page. If an attacker injects script via XSS (through a vulnerable dependency, user-generated content, or third-party script), they can read `localStorage.getItem('token')` and exfiltrate it. The attacker then uses the token to impersonate the user until it expires.
- **The Unforgettable Mental Model:** The **Glass Piggy Bank**. You can see exactly what's inside, and anyone who can reach it can break it open. localStorage is transparent to JavaScript — there's no barrier between your token and any script on the page.
- **The Trap:** Thinking "my app doesn't have XSS vulnerabilities so localStorage is fine." Third-party dependencies, CDN compromises, and future code changes can introduce XSS. Defense-in-depth means protecting tokens even if XSS occurs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: localStorage is fully accessible to JavaScript, which means any XSS vulnerability — whether from a vulnerable dependency, user-generated content, or a compromised third-party script — can read and exfiltrate tokens. The attacker gets full access until the token expires. I treat localStorage as public storage for non-sensitive data only. For tokens, httpOnly cookies are the standard because they're inaccessible to JavaScript, providing a security boundary even if XSS occurs."

#### How do httpOnly cookies protect tokens?
- **The Engine Mechanism (Why it behaves this way):** The httpOnly flag tells the browser to exclude the cookie from `document.cookie` and the `Cookie` API. JavaScript cannot read, write, or modify httpOnly cookies. The browser automatically attaches them to matching requests. This creates a security boundary: even if an attacker injects JavaScript via XSS, they cannot access the token.
- **The Unforgettable Mental Model:** The **One-Way Mirror**. The browser can see through it (sends cookies with requests), but JavaScript on the other side can't see in (can't read the cookie). The token is visible to the server but invisible to client-side scripts.
- **The Trap:** Thinking httpOnly cookies prevent all attacks. They protect against XSS token theft but not against CSRF (mitigated by sameSite) or network-level attacks (mitigated by HTTPS/secure flag).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: httpOnly cookies are inaccessible to JavaScript — they can't be read via document.cookie or any JS API. The browser automatically attaches them to matching requests, so the token is sent to the server without JavaScript involvement. This means even if an attacker successfully injects XSS, they can't steal the token. Combined with secure (HTTPS-only) and sameSite (CSRF protection) flags, httpOnly cookies provide comprehensive token protection for web apps."

#### What about sessionStorage for tokens?
- **The Engine Mechanism (Why it behaves this way):** sessionStorage is scoped to a single tab and cleared when the tab closes, which seems safer than localStorage. However, it's still accessible to JavaScript, so XSS can still steal tokens. The tab-scoping doesn't protect against XSS within that tab, which is where the attack happens.
- **The Unforgettable Mental Model:** The **Single-Room Safe**. sessionStorage is a safe that only exists in one room (tab). But if a burglar (XSS) is already in that room, they can still open it. The room boundary doesn't help when the threat is inside.
- **The Trap:** Choosing sessionStorage over localStorage thinking it's more secure. Both are equally vulnerable to XSS. The only difference is sessionStorage clears on tab close, which is a convenience feature, not a security feature.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: sessionStorage has the same XSS vulnerability as localStorage — both are fully accessible to JavaScript. The only difference is sessionStorage is scoped to a single tab and clears on tab close, which is convenient but not a security improvement against XSS. If I'm choosing between the two for non-sensitive data, sessionStorage is better for cleanup. But for tokens, neither is acceptable — httpOnly cookies are the right choice."

#### How should mobile apps store access tokens?
- **The Engine Mechanism (Why it behaves this way):** Mobile apps should use platform-secure storage: iOS Keychain (encrypted storage backed by the Secure Enclave) and Android Keystore (hardware-backed key storage). These are encrypted at rest, protected by the OS, and not accessible to other apps or root-level attacks (on non-jailbroken devices).
- **The Unforgettable Mental Model:** The **Bank Safety Deposit Box**. Mobile secure storage is like a bank vault — encrypted, access-controlled, and protected by the operating system. Only your app (with the right credentials) can access its own stored items.
- **The Trap:** Storing tokens in plaintext in SharedPreferences (Android) or UserDefaults (iOS). These are not encrypted and can be read on rooted/jailbroken devices or through backup extraction.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Mobile apps should use platform-secure storage — iOS Keychain for iOS and Android Keystore/EncryptedSharedPreferences for Android. These provide encryption at rest, OS-level access control, and hardware-backed protection on modern devices. I never store tokens in plaintext in UserDefaults or SharedPreferences. For React Native, I use libraries like react-native-keychain or expo-secure-store that wrap these native APIs."

#### How does token storage affect CSRF protection?
- **The Engine Mechanism (Why it behaves this way):** Cookies are automatically sent with cross-origin requests, which enables CSRF attacks. When tokens are stored in cookies, you need CSRF protection: sameSite cookie attribute (Lax or Strict), anti-CSRF tokens (double-submit cookie pattern), or custom headers that browsers won't send cross-origin. Tokens in localStorage don't have CSRF risk (they're not auto-sent) but have XSS risk.
- **The Unforgettable Mental Model:** The **Automatic Mail Forwarding**. Cookies are like mail that's automatically forwarded to any address — including addresses attackers set up (CSRF). You need a filter (sameSite, anti-CSRF tokens) to stop unwanted forwarding.
- **The Trap:** Using sameSite=Strict and assuming CSRF is fully solved. Strict breaks cross-site navigation (clicking a link from another site won't include the cookie). Lax is the practical default but still allows top-level GET requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cookie-based token storage introduces CSRF risk because browsers automatically send cookies with cross-origin requests. I mitigate this with sameSite=Strict or Lax cookies, and for state-changing operations, I use anti-CSRF tokens or require custom headers that browsers won't send in cross-origin requests. The trade-off is clear: cookies protect against XSS but need CSRF mitigation; localStorage avoids CSRF but is vulnerable to XSS. I prefer cookies with proper CSRF protection because XSS is more common and harder to fully prevent."

#### What would you monitor for token storage?
- **The Engine Mechanism (Why it behaves this way):** Monitor: cookie delivery success rates (are cookies being set correctly?), CSRF failure rates (indicates CSRF protection is working or misconfigured), token missing rates (requests without tokens — indicates storage issues), and XSS detection events (CSP violations, suspicious script injection attempts).
- **The Unforgettable Mental Model:** The **Storage Health Dashboard**. You're watching whether tokens are being stored correctly (cookie set rates), whether they're being sent with requests (token present rates), and whether anyone is trying to steal them (XSS detection).
- **The Trap:** Not monitoring cookie delivery failures. If cookies fail to set (due to SameSite policy changes, domain mismatches, or browser restrictions), users silently lose authentication without knowing why.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor token storage health through cookie set success rates, token presence rates on authenticated requests, CSRF failure rates, and CSP violation reports that might indicate XSS attempts. I also monitor for cookie delivery failures caused by browser policy changes — SameSite policy updates have broken auth in production before. Alerting on sudden drops in token presence rates catches storage issues before they affect all users."

## 8. Active recall test

1. **Where is the safest place to store access tokens in a web app?**
   - **Explanation:** httpOnly, secure, sameSite cookies. httpOnly prevents XSS access, secure ensures HTTPS-only, and sameSite mitigates CSRF.
2. **Why is localStorage unsafe for tokens?**
   - **Explanation:** localStorage is accessible to any JavaScript on the page. XSS attacks can read and exfiltrate tokens, giving attackers full access until expiration.
3. **What does the httpOnly cookie flag do?**
   - **Explanation:** It prevents JavaScript from accessing the cookie via document.cookie or any JS API. The browser still sends it with matching requests, but scripts can't read or modify it.
4. **What is the CSRF risk with cookie-based token storage?**
   - **Explanation:** Browsers automatically send cookies with cross-origin requests, allowing attackers to make authenticated requests on behalf of users. Mitigated by sameSite attribute and anti-CSRF tokens.
5. **How should mobile apps store access tokens?**
   - **Explanation:** iOS Keychain and Android Keystore/EncryptedSharedPreferences. These provide encrypted, OS-protected storage that's not accessible to other apps or plaintext extraction.
6. **Is sessionStorage safer than localStorage for tokens?**
   - **Explanation:** No. Both are equally vulnerable to XSS. sessionStorage only differs in scope (single tab) and cleanup (clears on tab close), which doesn't protect against XSS within that tab.
7. **What is the trade-off between cookies and localStorage for tokens?**
   - **Explanation:** Cookies protect against XSS but need CSRF mitigation. localStorage avoids CSRF but is vulnerable to XSS. Cookies with proper CSRF protection are generally preferred because XSS is more common.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Where should access tokens be stored in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Where should access tokens be stored in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
