# Open Redirects

## Detailed explanation
Open redirect happens when app redirects user to attacker-controlled URL because it trusts unvalidated `returnUrl`, `next`, or redirect parameter. It is common in login flows and phishing attacks.

Frontend can contribute by reading query param and assigning `window.location` without validation. Server should also validate redirects.

## 1. One-line mental model
Open redirect lets attacker choose where your app sends user.

## 2. Problem it solves
Redirect flows need safe destination validation.

## 3. Core idea
- Validate redirect target.
- Prefer relative paths.
- Allowlist trusted origins.
- Never trust query params blindly.
- Server-side validation also needed.

## 4. Visual / analogy
App becomes trusted signpost pointing to attacker site.

```txt
/login?next=https://evil.com -> redirect -> evil.com
```

## 5. Minimal example

```js
window.location.href = new URLSearchParams(location.search).get("next");
```

Dangerous without validation.

## 6. Real-world example

```js
function safeRedirect(next) {
  if (!next?.startsWith("/")) return "/";
  return next;
}
```

## 7. Common interview questions

#### What is an open redirect?
- **The Engine Mechanism (Why it behaves this way):** An open redirect is a security vulnerability that occurs when a web application accepts a user-controlled parameter (such as a query string parameter named `next`, `redirect_to`, or `returnUrl`) representing a target destination URL, and passes this string directly to a navigation execution sink (like `window.location.href`, `window.location.assign()`, or `window.location.replace()`) without verification. At the browser engine level, when a script updates the `window.location` object, the user-agent terminates active document rendering, issues a network request to the specified target address, and discards the origin's active DOM tree. If the input contains a fully qualified external URL (e.g., `https://attacker.com`), the browser will navigate directly to that external domain.
- **The Unforgettable Mental Model:** A friendly receptionist at a bank. If a bank customer asks, "Where is the bathroom?", and a prankster has replaced the hallway sign (the URL parameter) with one pointing to a back-alley trap door, the receptionist blindly points the customer to the trap door, sending them straight into the trap under the authority and trust of the bank.
- **The Trap:** Checking that a URL "contains" your domain name (e.g., `nextUrl.includes('mysite.com')`). An attacker can easily bypass this by passing a domain like `https://mysite.com.attacker.com` or `https://attacker.com/mysite.com`. The simple index check matches, but the browser parses the hostname as `attacker.com` or redirects the user off-site.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'An open redirect is a security vulnerability where client-side or server-side code reads a target URL from an unvalidated query parameter and passes it directly to a navigation sink like `window.location.href`. This enables attackers to craft high-trust links pointing to our application that silently redirect users to external, malicious phishing sites, compromising user credentials and trust.'"

#### Why is it dangerous?
- **The Engine Mechanism (Why it behaves this way):** Open redirects are dangerous because they act as a high-fidelity delivery mechanism for phishing, OAuth credential theft, and session hijacking. Because the initial domain in the address bar is the legitimate, highly trusted domain (e.g., `https://trustedbank.com/login?next=https://evil.com`), the user feels completely safe entering their password. The login succeeds, and the front-end application automatically redirects the browser. The user doesn't notice the address bar changing to `https://evil-bank.com/dashboard`, which mirrors the exact look and feel of the original site, prompting them to re-enter credentials or sign a rogue transaction.
- **The Unforgettable Mental Model:** A trusted tour bus. You board the bus labeled "Central Park Tour" (trusted site). After the tour starts, the driver (the open redirect URL parameter) drives the bus directly into an underground chop-shop (phishing site) and locks the doors. Since you trusted the bus operator, you never suspected you were being taken to a dangerous location.
- **The Trap:** Thinking open redirects are harmless since "no malicious script runs on our site". Phishing campaigns frequently target open redirects because they easily bypass email spam filters that block known phishing links, since the link sent in the email points to a legitimate, highly ranked domain.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Open redirects are a major catalyst for advanced phishing campaigns. Because the target link starts with our legitimate, trusted domain, it bypasses email spam filters and triggers zero security alerts for the user. The silent, automatic redirect to a malicious replica site completely tricks the user into entering credentials, leading to total account compromise.'"

#### How do we validate a return URL?
- **The Engine Mechanism (Why it behaves this way):** Safe validation relies on parsing URLs securely inside the browser's native engine to isolate hostnames.
  1. **Strict Relative Parsing:** Restrict all redirects strictly to relative paths. Ensure the string starts with a single slash `/` and is immediately followed by an alphanumeric character, specifically blocking protocol-relative URLs like `//attacker.com` which the browser's parser interprets as `https://attacker.com`.
  2. **Native URL Constructor parsing:** Create a native parser instance: `const parsed = new URL(nextUrl, window.location.origin)`. Then inspect `parsed.origin` and ensure it strictly matches `window.location.origin`. This leverages the C++ URL parser in the browser to accurately isolate the hostname and protocol, neutralizing trick parameters.
  3. **Allowlist matching:** Compare the parsed origin against a strict, hardcoded array of trusted origins.
- **The Unforgettable Mental Model:** A high-tech customs agent checking passports. Instead of looking at a printed text sheet, they scan the passport through an electronic reader (native `new URL()`) to isolate the citizenship field (hostname/origin), verifying it matches a pre-approved list of friendly nations before opening the gate.
- **The Trap:** Doing partial string parsing on the protocol-relative slash `//`. If you only check `nextUrl.startsWith('/')`, an input like `//evil.com` starts with a slash, but the browser interprets it as an absolute URL matching the current page's protocol, leading to an open redirect. You must ensure the second character is NOT another slash (i.e., `^\/(?!\/)`).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'We validate return URLs by first feeding the target string into the browser’s native `URL` constructor to perform robust, standardized parsing. If external redirection is not required, we enforce a strict relative-path check, ensuring the URL starts with a single slash and is not protocol-relative. If external domains are permitted, we check the parsed URL’s origin against a strict whitelist of pre-approved origins before modifying `window.location`.'"

#### Why do we prefer relative paths?
- **The Engine Mechanism (Why it behaves this way):** Relative paths (e.g., `/profile/settings`) do not contain a protocol (like `https://`) or a hostname (like `evil.com`). When the browser's engine receives a relative path via `window.location`, it is forced by specification to resolve it against the *current document's origin* (`window.location.origin`). Because there is no syntax inside a true relative path that can force the engine to cross domain boundaries, the redirect is guaranteed to stay within the security sandbox of the current application domain.
- **The Unforgettable Mental Model:** Walking from one room to another inside your own house. You can go to the kitchen (a relative sub-path), but you can't walk through a doorway and suddenly find yourself in a completely different city (external domain) unless you step outside the house completely.
- **The Trap:** Thinking that all strings starting with a slash are safe. As mentioned, double-slash links (`//evil.com`) are protocol-relative URLs, which represent valid absolute paths that redirect out-of-site. You must strictly sanitize the string to ensure it matches the pattern `/` followed by an alphanumeric character, not `/` followed by another `/`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'We prefer relative paths because they naturally lack a domain component. The browser engine is forced to resolve the path relative to the current origin, making it structurally impossible to redirect the user to an external domain. By enforcing relative paths, we eliminate the need to maintain domain whitelists and prevent protocol-relative bypasses.'"

#### Is a frontend check enough?
- **The Engine Mechanism (Why it behaves this way):** No, frontend-only validation is never sufficient. The frontend is a client-controlled environment. While frontend checks protect innocent users from clicking malicious links, they do not prevent attackers from targeting backend API endpoints that issue HTTP redirects (via `302 Found` or `301 Moved Permanently` headers) during server-side operations (like OAuth logins). A backend API that blindly issues a `Location` header based on a query parameter is fully vulnerable, regardless of how secure the React application is.
- **The Unforgettable Mental Model:** A security guard stationed at the front gate of a fortress, but the back loading dock (backend API) has no guard, and the back door is left wide open. Anyone can bypass the front gate entirely and carry out assets through the back.
- **The Trap:** Assuming that since "our login page is in React", the backend doesn't need to check the `next` redirect query parameter. If the backend processes the login credentials and outputs a raw redirect header to an unvalidated URL, the browser will follow the redirect immediately, rendering the client-side checks completely useless.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'No, a frontend-only check is never enough. Security must be implemented in depth. While frontend checks secure client-side routing and navigations, the backend must independently validate redirect parameters for all HTTP 3xx redirect headers to prevent credential leakage and OAuth flow hijackings, ensuring that every layer of the application enforces the same strict validation policy.'"

## 8. Active recall test

#### 1. Which params are often risky?
- **Explanation/Answer:** Query parameters used for navigation flow routing, such as `next`, `redirect`, `returnUrl`, `goto`, `target`, or `url`.

#### 2. What is the safest redirect form?
- **Explanation/Answer:** A strict relative path (e.g., `/dashboard`) that starts with a single slash followed by an alphanumeric character, which forces the browser to resolve it within the current origin.

#### 3. Why should we allowlist origins?
- **Explanation/Answer:** To restrict external redirects strictly to pre-approved partner domains or subdomains, preventing attackers from injecting arbitrary malicious external hostnames.

#### 4. How does phishing use this?
- **Explanation/Answer:** Phishers craft links pointing to your trusted login page, appending a redirect parameter to their malicious clone site. Once the victim logs in successfully, they are automatically sent to the phishing clone, where their session is hijacked.

#### 5. Why must the backend also validate?
- **Explanation/Answer:** Because the backend issues server-side redirects via `302 Location` headers during login or API operations, which bypass frontend code entirely. Both layers must validate destinations to be fully secure.

## 9. Mistakes / traps
- Trusting `next` param.
- Allowing `//evil.com`.
- Only checking string contains domain.
- Doing only frontend validation.

## 10. Compare with related concepts
- **Open redirect vs XSS:** navigation abuse vs script injection.
- **Allowlist vs blocklist:** known safe targets vs fragile bad list.
- **Frontend vs backend validation:** UX guard vs security enforcement.

## 11. Summary from memory
Explain safe login redirect handling.

## 12. Spaced revision prompts
- 1 day: Define open redirect.
- 3 days: Validate relative URL.
- 7 days: Explain phishing risk.
- 14 days: Compare frontend/backend validation.

