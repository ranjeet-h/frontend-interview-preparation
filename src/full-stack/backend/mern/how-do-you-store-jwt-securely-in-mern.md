# How do you store JWT securely in MERN

## Detailed explanation

How do you store JWT securely in MERN is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Make frontend and backend agree on auth, data contracts, errors, retries, and state.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define frontend-backend contract.
- Handle auth, cookies/tokens, CORS, and errors.
- Prevent duplicate or stale requests.
- Map backend validation to frontend UX.
- Keep contracts versioned and testable.

## 4. Visual / analogy

```txt
React UI -> API client -> backend endpoint -> response/error contract -> UI state
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply MERN backend rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you store jwt securely in mern affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you store JWT securely in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** Best practice: store access tokens in memory (React state) and refresh tokens in httpOnly cookies. On login, Express sets the refresh token as an httpOnly, secure, sameSite cookie: `res.cookie('refreshToken', token, { httpOnly: true, secure: true, sameSite: 'strict' })`. The access token is returned in the response body and stored in React state (context/Zustand). The browser automatically sends the httpOnly cookie with requests to the refresh endpoint. JavaScript cannot read httpOnly cookies, protecting against XSS. The access token in memory is lost on page refresh but is quickly re-obtained via the refresh token.
- **The Unforgettable Mental Model:** The **Two-Safe System**. The access token is in a desk drawer (memory) — easy to reach but disappears if the building resets (page refresh). The refresh token is in a bank vault (httpOnly cookie) — harder to access but survives building resets and can't be stolen by burglars (XSS).
- **The Trap:** Storing access tokens in localStorage — any XSS vulnerability exposes the token. httpOnly cookies are the secure choice for token storage.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store access tokens in React state (memory) and refresh tokens in httpOnly, secure, sameSite cookies. The access token is short-lived (15 min) and stored in memory — it's lost on page refresh but quickly re-obtained via the refresh token. The refresh token is long-lived (7 days), stored in an httpOnly cookie that JavaScript can't read, protecting against XSS. The browser sends the cookie automatically with refresh requests. This combination gives both security and convenience."

#### Why are httpOnly cookies more secure than localStorage?
- **The Engine Mechanism (Why it behaves this way):** httpOnly cookies cannot be accessed via `document.cookie` or any JavaScript API. If an XSS attack injects malicious JavaScript, it cannot read httpOnly cookies. localStorage is fully accessible to JavaScript — any script on the page can read `localStorage.getItem('token')`. XSS attacks are common (through third-party scripts, compromised dependencies, user-generated content). httpOnly cookies provide a hardware-level defense that no JavaScript can bypass. The tradeoff is that httpOnly cookies are only sent to the server that set them (same origin or configured domain).
- **The Unforgettable Mental Model:** The **Glass Vault**. You can see what's inside (browser sends it with requests), but you can't touch it (JavaScript can't read it). localStorage is an open shelf — anyone who enters the room (any script) can take what they want.
- **The Trap:** Thinking "my app doesn't have XSS vulnerabilities so localStorage is fine." Third-party dependencies can introduce XSS without your knowledge. Defense in depth means protecting against unknown vulnerabilities.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: httpOnly cookies are more secure because JavaScript cannot read them — they're inaccessible to XSS attacks. localStorage is fully readable by any JavaScript on the page, including malicious scripts from compromised dependencies. XSS is one of the most common web vulnerabilities, and httpOnly cookies provide a defense that no JavaScript can bypass. I always use httpOnly cookies for sensitive tokens, even if I believe my app is XSS-free."

#### How do you handle token storage for cross-origin MERN apps?
- **The Engine Mechanism (Why it behaves this way):** For cross-origin (frontend on different domain), configure: (1) **CORS** — `cors({ origin: 'https://frontend.com', credentials: true })`. (2) **Cookie** — `res.cookie('refreshToken', token, { sameSite: 'none', secure: true })`. (3) **Frontend** — `fetch(url, { credentials: 'include' })` or `axios({ withCredentials: true })`. `sameSite: 'none'` allows cross-origin cookie sending but requires `secure: true` (HTTPS). The frontend domain must exactly match the CORS origin. Subdomains don't match — `https://app.example.com` is different from `https://example.com`.
- **The Unforgettable Mental Model:** The **International Visa**. For domestic travel (same origin), a standard ID works (sameSite: 'strict'). For international travel (cross-origin), you need a visa (sameSite: 'none') and it must be verified through secure channels (secure: true, HTTPS).
- **The Trap:** Setting `sameSite: 'none'` without `secure: true` — browsers reject this. Also, using wildcard CORS origin with credentials — browsers reject `origin: '*'` with `credentials: true`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For cross-origin MERN apps, I set sameSite: 'none' and secure: true on the cookie, configure CORS with the specific frontend origin and credentials: true, and ensure the frontend sends requests with credentials: 'include'. All three must align. I prefer same-origin deployment when possible — serving frontend and backend from the same domain lets me use sameSite: 'strict', which is more secure."

#### How do you handle token storage in mobile apps (React Native)?
- **The Engine Mechanism (Why it behaves this way):** React Native doesn't have cookies in the same way as browsers. Use secure storage: `expo-secure-store` (Expo) or `react-native-keychain` (bare React Native). These use the device's secure enclave (iOS Keychain, Android Keystore). Store the refresh token in secure storage and the access token in memory (React state). Secure storage is encrypted at rest and requires device authentication (biometrics, passcode) to access. Unlike localStorage, secure storage is not accessible to other apps or JavaScript injection.
- **The Unforgettable Mental Model:** The **Phone's Fingerprint Lock**. The token is stored in the phone's most secure vault (Keychain/Keystore), protected by the device's biometric authentication. Even if someone gets the phone, they can't access the vault without the fingerprint.
- **The Trap:** Using AsyncStorage for tokens — it's unencrypted and accessible to any code running in the app. Always use secure storage for sensitive data.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: In React Native, I use expo-secure-store or react-native-keychain for token storage. These use the device's secure enclave (iOS Keychain, Android Keystore), which is encrypted and protected by biometric authentication. I store the refresh token in secure storage and the access token in memory. I never use AsyncStorage for tokens — it's unencrypted and accessible to any code. The secure storage API is slightly different from cookies but provides equivalent or better security."

#### How do you clear tokens on logout?
- **The Engine Mechanism (Why it behaves this way):** Frontend: clear React state (set user to null), clear memory token. Backend: clear the httpOnly cookie: `res.clearCookie('refreshToken')`, and remove the refresh token from the database (or add to blocklist). The frontend calls POST /auth/logout, which triggers the backend cleanup. On success, the frontend clears its auth state and redirects to login. For cross-origin, ensure the cookie's domain and path match when clearing: `res.clearCookie('refreshToken', { domain: '.example.com', path: '/' })`.
- **The Unforgettable Mental Model:** The **Hotel Checkout**. You return the room key (clear memory token), the front desk cancels your reservation (clear cookie and database token), and you leave the building (redirect to login).
- **The Trap:** Only clearing frontend state without calling the backend logout endpoint. The refresh token remains valid in the database and cookie, meaning the session could be reused.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Logout is a two-step process. The frontend calls POST /auth/logout. The backend clears the httpOnly cookie, removes the refresh token from the database, and returns success. The frontend then clears its auth state (user, token) and redirects to login. I never just clear frontend state without calling the backend — the refresh token must be invalidated server-side to prevent reuse. For cross-origin apps, I ensure the cookie's domain and path match when clearing."

## 8. Active recall test

1. **Where should access tokens be stored in a MERN app?**
   - **Explanation:** In React state (memory). They're short-lived (15 min) and re-obtained via refresh token on page refresh. Memory storage protects against XSS since the token isn't in persistent storage.

2. **Where should refresh tokens be stored?**
   - **Explanation:** In httpOnly, secure, sameSite cookies. httpOnly prevents JavaScript access (XSS protection), secure ensures HTTPS-only, sameSite prevents CSRF attacks.

3. **Why is localStorage insecure for tokens?**
   - **Explanation:** localStorage is fully accessible to JavaScript. Any XSS vulnerability allows attackers to read tokens via localStorage.getItem(). httpOnly cookies are inaccessible to JavaScript.

4. **How do you store tokens in React Native?**
   - **Explanation:** Use expo-secure-store or react-native-keychain, which leverage the device's secure enclave (iOS Keychain, Android Keystore). Never use AsyncStorage for tokens.

5. **What happens during logout?**
   - **Explanation:** Frontend calls POST /auth/logout. Backend clears the httpOnly cookie and removes the refresh token from the database. Frontend clears auth state and redirects to login.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you store JWT securely in MERN in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you store JWT securely in MERN in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
