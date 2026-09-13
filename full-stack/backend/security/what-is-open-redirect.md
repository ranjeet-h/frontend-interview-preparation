# What is open redirect

## Detailed explanation

What is open redirect is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is open redirect by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what is open redirect affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is open redirect?
- **The Engine Mechanism (Why it behaves this way):** Open redirect is a vulnerability where an application redirects users to an arbitrary external URL provided in the input. Attackers craft links that appear to go to the trusted site but actually redirect to a malicious site. Users trust the trusted domain in the URL, click the link, and are redirected to a phishing site that steals credentials or installs malware.
- **The Unforgettable Mental Model:** The **Misdirected Taxi**. You tell the taxi driver (server) to take you to "the bank." The driver takes you to a fake bank (malicious site) that looks identical. You trusted the driver because you got in at the real bank's location (trusted domain).
- **The Trap:** Thinking open redirect is low-severity. While it doesn't directly compromise the server, it's a powerful phishing enabler. Users trust links that start with the legitimate domain.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Open redirect is a vulnerability where an application redirects users to an arbitrary external URL from user input. Attackers craft links that appear to go to the trusted site but redirect to a malicious site. Users trust the legitimate domain in the URL, click the link, and land on a phishing page. While it doesn't directly compromise the server, it's a powerful phishing enabler that exploits user trust in the legitimate domain."

#### How does open redirect work?
- **The Engine Mechanism (Why it behaves this way):** Example: Login page with `?redirect=https://myapp.com/dashboard`. Attacker changes it to `?redirect=https://evil.com/phishing`. After login, the app redirects to evil.com. The URL looks like `https://myapp.com/login?redirect=https://evil.com` — users see the trusted domain and click. More subtle attacks use URL encoding, subdomain tricks (`https://evil.com.myapp.com`), or protocol-relative URLs (`//evil.com`).
- **The Unforgettable Mental Model:** The **Detour Sign**. The road (login flow) normally leads to the destination (dashboard). The attacker places a detour sign (redirect parameter) that points to a different destination (malicious site). Drivers (users) follow the sign because it's on the trusted road.
- **The Trap**: Only checking if the redirect URL starts with the trusted domain. Subdomain tricks (`evil.com.myapp.com`) and URL encoding can bypass simple prefix checks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Open redirect works by manipulating redirect parameters in URLs. For example, a login redirect parameter can be changed from the intended dashboard URL to a malicious site. The URL still shows the trusted domain, so users click. Attackers use subdomain tricks, URL encoding, and protocol-relative URLs to bypass simple validation. The defense is to validate redirect URLs against an allowlist of permitted domains."

#### How do you prevent open redirect?
- **The Engine Mechanism (Why it behaves this way):** Prevention: (1) Use an allowlist of permitted redirect domains/paths, (2) Use relative paths instead of full URLs for redirects, (3) Parse and validate the redirect URL — ensure the hostname matches the application's domain, (4) Use token-based redirect validation (generate a token for each permitted redirect, validate the token instead of the URL), (5) Warn users when redirecting to external sites.
- **The Unforgettable Mental Model:** The **Approved Destinations List**. Instead of accepting any destination, the driver (server) only goes to addresses on the approved list. If the destination isn't on the list, the driver refuses to go.
- **The Trap**: Using string startsWith to check if the URL begins with the trusted domain. `https://myapp.com.evil.com` starts with `https://myapp.com` but is a different domain.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent open redirect by validating redirect URLs against an allowlist of permitted domains. I parse the URL and verify the hostname matches the application's domain — not just a string prefix check, which can be bypassed by subdomain tricks. For internal redirects, I use relative paths. For external redirects, I use token-based validation where each permitted redirect has a unique token. I also warn users when redirecting to external sites."

#### What would you monitor for open redirect?
- **The Engine Mechanism (Why it behaves this way):** Monitor: redirect parameter patterns (external URLs in redirect parameters), redirect rejection rates (invalid redirect URLs blocked), and user-reported phishing links using your domain. Alert on external URLs detected in redirect parameters and unusual redirect patterns.
- **The Unforgettable Mental Model:** The **Redirect Monitor**. You're watching where redirects are going (internal vs. external), how many are being blocked (rejection rates), and whether anyone is reporting phishing links using your domain.
- **The Trap**: Not monitoring redirect parameters. External URLs in redirect parameters are the clearest indicator of open redirect attempts.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor open redirect through redirect parameter patterns (external URLs in redirect fields), redirect rejection rates, and user-reported phishing links. External URLs in redirect parameters are the clearest attack indicator. I also monitor for subdomain tricks and URL encoding bypass attempts. All redirect validation failures are logged with the attempted URL for security investigation."

## 8. Active recall test

1. **What is open redirect?**
   - **Explanation:** A vulnerability where an application redirects users to an arbitrary external URL from user input, enabling phishing attacks that exploit user trust in the legitimate domain.
2. **How does open redirect work?**
   - **Explanation:** Attacker manipulates redirect parameter (e.g., ?redirect=) to point to a malicious site. The URL shows the trusted domain, so users click. After login/action, they're redirected to the malicious site.
3. **How do you prevent open redirect?**
   - **Explanation:** Validate redirect URLs against an allowlist of permitted domains. Parse URL and verify hostname matches application domain. Use relative paths for internal redirects. Use token-based redirect validation.
4. **Why is string startsWith insufficient for redirect validation?**
   - **Explanation:** Subdomain tricks bypass it: `https://myapp.com.evil.com` starts with `https://myapp.com` but is a different domain. Must parse the URL and check the actual hostname.
5. **What is token-based redirect validation?**
   - **Explanation:** Instead of accepting raw URLs, the server generates a token for each permitted redirect. The client sends the token, and the server maps it to the actual redirect URL. The user never controls the URL directly.
6. **Why is open redirect dangerous even though it doesn't compromise the server?**
   - **Explanation:** It's a powerful phishing enabler. Users trust links with the legitimate domain, click them, and land on phishing sites that steal credentials or install malware.
7. **What should you monitor for open redirect?**
   - **Explanation:** External URLs in redirect parameters, redirect rejection rates, user-reported phishing links, and subdomain/encoding bypass attempts. Alert on external redirect URLs.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is open redirect in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is open redirect in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
