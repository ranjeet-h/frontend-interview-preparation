# How do you use cookies in Express

## Detailed explanation

How do you use cookies in Express is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you use cookies in express by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply Express.js rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you use cookies in express affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you use cookies in Express?
- **The Engine Mechanism (Why it behaves this way):** Express provides `res.cookie(name, value, options)` to set cookies and `req.cookies` to read them (requires `cookie-parser` middleware). Setting: `res.cookie('sessionId', 'abc123', { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 3600000 })`. Reading: `app.use(cookieParser()); app.get('/', (req, res) => { console.log(req.cookies.sessionId); })`. Clearing: `res.clearCookie('sessionId')`. Cookies are sent automatically by the browser with each request to the same domain. The `cookie-parser` middleware parses the `Cookie` header and populates `req.cookies`.
- **The Unforgettable Mental Model:** The **Name Tag**. The server gives the browser a name tag (cookie). The browser wears it on every subsequent visit. The server reads the name tag to recognize the visitor. Some name tags are visible to everyone (regular cookies), some are only readable by security (httpOnly).
- **The Trap:** Not using `cookie-parser` middleware — `req.cookies` will be undefined. Also, setting cookies after `res.send()` has been called — headers must be set before the body is sent.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use res.cookie() to set cookies with security options like httpOnly, secure, and sameSite. I use cookie-parser middleware to read cookies via req.cookies. For auth tokens, I always use httpOnly cookies so JavaScript can't access them, protecting against XSS. I set secure: true in production to ensure HTTPS-only transmission, and sameSite to prevent CSRF attacks."

#### What are the cookie security options?
- **The Engine Mechanism (Why it behaves this way):** Key options: (1) `httpOnly: true` — prevents JavaScript access (document.cookie can't read it), protecting against XSS. (2) `secure: true` — cookie only sent over HTTPS. (3) `sameSite: 'strict' | 'lax' | 'none'` — controls cross-origin sending. 'strict' blocks all cross-site requests, 'lax' allows top-level GET navigations, 'none' allows all (requires secure: true). (4) `maxAge` — expiration in milliseconds. (5) `domain` and `path` — scope the cookie to specific domains/paths. (6) `signed` — signs the cookie with a secret to detect tampering.
- **The Unforgettable Mental Model:** The **Security Settings on a Vault**. httpOnly is the glass cover (you can see it but can't touch it). secure is the armored transport (only travels safely). sameSite is the access list (who can request it). maxAge is the self-destruct timer.
- **The Trap:** Setting `sameSite: 'none'` without `secure: true` — browsers reject this combination. Also, using httpOnly cookies for data that the frontend JavaScript needs to read — httpOnly makes it inaccessible to JS.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For auth cookies, I set httpOnly: true (XSS protection), secure: true (HTTPS only), sameSite: 'strict' (CSRF protection), and a reasonable maxAge. httpOnly is critical for tokens — it prevents JavaScript from reading them, which is the primary defense against XSS token theft. sameSite: 'strict' is the safest but can break cross-origin flows; 'lax' is a good compromise for most apps."

#### How do you parse cookies in Express?
- **The Engine Mechanism (Why it behaves this way):** Use the `cookie-parser` middleware: `const cookieParser = require('cookie-parser'); app.use(cookieParser());`. This parses the `Cookie` header from incoming requests and populates `req.cookies` as an object. For signed cookies: `app.use(cookieParser(secret))` — then access via `req.signedCookies`. The middleware runs once per request, before route handlers. Without it, `req.cookies` is undefined and you'd need to manually parse `req.headers.cookie`.
- **The Unforgettable Mental Model:** The **Mail Opener**. Incoming mail (requests) arrives with sealed envelopes (Cookie header). cookie-parser opens each envelope, reads the contents, and places them in labeled folders (req.cookies) for the handlers to use.
- **The Trap:** Forgetting to register cookie-parser middleware before routes that need cookies. Also, trying to read cookies set in the same response — cookies set with res.cookie() aren't available in req.cookies until the next request.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use cookie-parser middleware to automatically parse incoming cookies into req.cookies. It's registered early in the middleware stack, before any routes that need cookie access. For signed cookies, I pass a secret to cookie-parser and read from req.signedCookies. One important detail: cookies set with res.cookie() in the current response aren't available in req.cookies until the browser sends them back in the next request."

#### How do you set cookies for cross-origin requests?
- **The Engine Mechanism (Why it behaves this way):** For cross-origin requests (frontend on different domain), configure: (1) **CORS** — `app.use(cors({ origin: 'https://frontend.com', credentials: true }))`. (2) **Cookie** — `res.cookie('token', value, { sameSite: 'none', secure: true })`. The frontend must send requests with `credentials: 'include'` (fetch) or `withCredentials: true` (axios). `sameSite: 'none'` allows cross-origin cookie sending, but requires `secure: true` (HTTPS). Without `credentials: true` on the frontend, cookies won't be sent with cross-origin requests.
- **The Unforgettable Mental Model:** The **International Passport**. For domestic travel (same origin), a driver's license (sameSite: 'strict') works. For international travel (cross-origin), you need a passport (sameSite: 'none') and it must be verified through secure channels (secure: true).
- **The Trap:** Setting `sameSite: 'none'` without `secure: true` — browsers reject it. Also, forgetting `credentials: true` on the frontend fetch call — cookies won't be sent.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For cross-origin cookies, I set sameSite: 'none' and secure: true on the cookie, configure CORS with credentials: true, and ensure the frontend sends requests with credentials: 'include'. All three pieces must align — the cookie settings, the CORS config, and the frontend fetch options. I prefer keeping frontend and backend on the same domain when possible to avoid this complexity and use sameSite: 'strict'."

#### How do cookies differ from localStorage?
- **The Engine Mechanism (Why it behaves this way):** Cookies are automatically sent with every HTTP request to the matching domain, have size limits (~4KB), can be httpOnly (JS-inaccessible), and have built-in expiration. localStorage is only accessible via JavaScript, has larger capacity (~5-10MB), is never sent automatically with requests, and persists until explicitly cleared. For auth tokens, cookies with httpOnly are more secure against XSS. localStorage is more convenient for non-sensitive data like UI preferences.
- **The Unforgettable Mental Model:** **Automatic Delivery vs. Self-Storage**. Cookies are like automatic mail delivery — every letter (request) includes the return address (cookie). localStorage is like a personal storage unit — you have to go get things yourself (JavaScript access), but you can store more.
- **The Trap:** Storing auth tokens in localStorage because it's "easier." XSS attacks can read localStorage and steal tokens. httpOnly cookies are the secure choice for authentication.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cookies are automatically sent with requests, have httpOnly protection against XSS, and are limited to 4KB. localStorage is JS-accessible, has more storage, but is vulnerable to XSS. For auth tokens, I always use httpOnly cookies — the XSS protection outweighs the convenience of localStorage. I use localStorage for non-sensitive data like UI preferences and cached data that doesn't need server transmission."

## 8. Active recall test

1. **How do you set a cookie in Express?**
   - **Explanation:** `res.cookie('name', 'value', { options })`. Options include httpOnly, secure, sameSite, maxAge, domain, and path. Must be called before res.send().

2. **How do you read cookies in Express?**
   - **Explanation:** Use cookie-parser middleware: `app.use(cookieParser())`, then access `req.cookies`. For signed cookies: `app.use(cookieParser(secret))` and `req.signedCookies`.

3. **What does httpOnly do?**
   - **Explanation:** Prevents JavaScript from accessing the cookie via document.cookie. This protects against XSS attacks that try to steal cookies containing sensitive data like auth tokens.

4. **How do you send cookies with cross-origin requests?**
   - **Explanation:** Set cookie with sameSite: 'none' and secure: true. Configure CORS with credentials: true. Frontend must use credentials: 'include' in fetch or withCredentials: true in axios.

5. **Why are httpOnly cookies preferred over localStorage for auth tokens?**
   - **Explanation:** httpOnly cookies are inaccessible to JavaScript, protecting against XSS token theft. localStorage is fully accessible to JavaScript, so any XSS vulnerability exposes stored tokens.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you use cookies in Express in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you use cookies in Express in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
