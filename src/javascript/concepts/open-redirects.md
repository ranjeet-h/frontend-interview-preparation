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
- What is open redirect?
- Why dangerous?
- How validate return URL?
- Why prefer relative paths?
- Frontend check enough?

## 8. Active recall test
1. Which params often risky?
2. What is safest redirect form?
3. Why allowlist origins?
4. How phishing uses this?
5. Why backend also validate?

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

