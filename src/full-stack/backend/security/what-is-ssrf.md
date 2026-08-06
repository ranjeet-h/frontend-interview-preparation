# What is SSRF

## Detailed explanation

What is SSRF is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is ssrf by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what is ssrf affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is SSRF (Server-Side Request Forgery)?
- **The Engine Mechanism (Why it behaves this way):** SSRF is a vulnerability where an attacker tricks the server into making HTTP requests to internal or external resources that the attacker cannot access directly. The server acts as a proxy, making requests on behalf of the attacker. This can expose internal services, cloud metadata endpoints, and databases that are only accessible from within the network.
- **The Unforgettable Mental Model:** The **Trusted Messenger**. You (attacker) can't enter the secure building (internal network), but you can send a message to the receptionist (server) asking them to fetch something from inside. The receptionist has access, so they retrieve it and bring it back to you.
- **The Trap:** Thinking SSRF only affects URL-fetching features. Any feature that makes server-side requests based on user input (webhooks, image fetching, PDF generation, URL previews) is vulnerable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SSRF is a vulnerability where an attacker tricks the server into making requests to internal or external resources. The server acts as a proxy, making requests the attacker can't make directly. This can expose internal services, cloud metadata (like AWS EC2 metadata at 169.254.169.254), and databases. SSRF affects any feature that makes server-side requests based on user input — webhooks, image fetching, URL previews, and PDF generation."

#### How does SSRF work?
- **The Engine Mechanism (Why it behaves this way):** Example: URL preview feature `fetch(userInput)`. Attacker sends `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (AWS metadata). The server fetches the URL and returns the response, exposing AWS credentials. SSRF can also target internal services: `http://localhost:6379` (Redis), `http://internal-api:8080/admin` (internal admin panel), or `file:///etc/passwd` (local file access via file:// protocol).
- **The Unforgettable Mental Model:** The **Internal Phone Line**. The attacker can't call the internal phone system directly, but they can ask the receptionist (server) to call internal extensions. The receptionist dials, listens, and reports back.
- **The Trap:** Only blocking external URLs while allowing localhost or internal IPs. SSRF targets internal resources — blocking only external URLs misses the most dangerous attacks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SSRF works by having the server make requests to attacker-specified URLs. The attacker targets internal services (localhost, internal IPs), cloud metadata endpoints (169.254.169.254), or uses protocols like file:// to read local files. For example, a URL preview feature that fetches user-supplied URLs can be tricked into fetching AWS metadata, exposing credentials. The attack exploits the server's network access, which is typically broader than what's available externally."

#### How do you prevent SSRF?
- **The Engine Mechanism (Why it behaves this way):** Prevention: (1) Use an allowlist of permitted domains/IPs instead of accepting arbitrary URLs, (2) Block requests to internal IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x), (3) Disable unnecessary protocols (file://, gopher://, dict://), (4) Use a dedicated proxy service that enforces URL validation, (5) Validate the resolved IP address (not just the URL) to prevent DNS rebinding attacks, (6) Set timeouts and response size limits to prevent resource exhaustion.
- **The Unforgettable Mental Model:** The **Bouncer's Guest List + ID Check**. The bouncer (URL validator) checks both the name on the list (allowlist) and the ID (resolved IP). Even if the name looks legitimate, if the ID shows they're from the restricted area (internal IP), they're turned away.
- **The Trap:** Only validating the URL hostname without checking the resolved IP. DNS rebinding attacks change the DNS resolution after validation, pointing an allowed domain to an internal IP.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent SSRF through multiple layers: an allowlist of permitted domains, blocking internal IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x), disabling unnecessary protocols (file://, gopher://), and validating the resolved IP address to prevent DNS rebinding. I also use timeouts and response size limits to prevent resource exhaustion. The key insight is that URL validation alone isn't sufficient — you must also validate the resolved IP, because DNS rebinding can point an allowed domain to an internal address."

#### What is DNS rebinding in SSRF?
- **The Engine Mechanism (Why it behaves this way):** DNS rebinding is an SSRF bypass where the attacker controls a domain that initially resolves to an external IP (passes validation) but then changes to resolve to an internal IP (127.0.0.1). When the server makes the request, the DNS has been rebound to the internal IP, and the request goes to an internal service. The URL looks legitimate, but the destination has changed.
- **The Unforgettable Mental Model:** The **Bait and Switch**. The attacker shows you a legitimate address (external IP) during the inspection, but when you actually go there, the address has changed to a restricted location (internal IP).
- **The Trap:** Only validating the URL at request time without re-validating the resolved IP. DNS can change between validation and request execution.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: DNS rebinding is an SSRF bypass where the attacker's domain initially resolves to an external IP (passes validation) but then changes to resolve to an internal IP. When the server makes the request, DNS has been rebound, and the request goes to an internal service. I prevent this by validating the resolved IP address, not just the URL hostname, and by using a dedicated proxy that enforces IP-level validation."

#### What would you monitor for SSRF?
- **The Engine Mechanism (Why it behaves this way):** Monitor: outbound request patterns (requests to internal IPs, cloud metadata endpoints), URL validation rejection rates, DNS resolution anomalies (domains resolving to internal IPs), and unusual response patterns (metadata responses, internal service responses). Alert on requests to internal IP ranges and cloud metadata endpoints.
- **The Unforgettable Mental Model:** The **Outbound Traffic Monitor**. You're watching where the server is making requests — whether it's reaching out to the public internet (expected) or trying to reach internal services (suspicious).
- **The Trap:** Not monitoring outbound requests to cloud metadata endpoints. These are the most common SSRF targets and the most dangerous — they expose cloud credentials.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor SSRF through outbound request patterns (requests to internal IPs, cloud metadata endpoints), URL validation rejection rates, DNS resolution anomalies, and unusual response patterns. Requests to 169.254.169.254 (AWS metadata) or internal IP ranges are the clearest SSRF indicators. I also monitor for DNS rebinding patterns — domains that resolve to different IPs between validation and request. All SSRF attempts are logged with full URL and resolved IP context."

## 8. Active recall test

1. **What is SSRF?**
   - **Explanation:** Server-Side Request Forgery — an attacker tricks the server into making requests to internal or external resources, exposing internal services, cloud metadata, and databases.
2. **How does SSRF work?**
   - **Explanation:** Attacker supplies a URL to a server-side feature (webhook, image fetch, URL preview). Server fetches the URL, potentially accessing internal services, cloud metadata (169.254.169.254), or local files (file://).
3. **How do you prevent SSRF?**
   - **Explanation:** Allowlist of permitted domains, block internal IP ranges, disable unnecessary protocols (file://, gopher://), validate resolved IP (prevent DNS rebinding), use dedicated proxy, set timeouts and size limits.
4. **What is DNS rebinding?**
   - **Explanation:** An SSRF bypass where the attacker's domain initially resolves to an external IP (passes validation) but then changes to resolve to an internal IP. The URL looks legitimate but the destination changes.
5. **Which IP ranges should you block for SSRF prevention?**
   - **Explanation:** 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (private), 127.0.0.0/8 (localhost), 169.254.0.0/16 (cloud metadata), 0.0.0.0/8.
6. **Why is cloud metadata a common SSRF target?**
   - **Explanation:** Cloud metadata endpoints (169.254.169.254) contain sensitive information like IAM credentials, instance details, and configuration. Accessing them gives the attacker cloud-level access.
7. **What should you monitor for SSRF?**
   - **Explanation:** Outbound requests to internal IPs and cloud metadata, URL validation rejections, DNS resolution anomalies, and unusual response patterns. Alert on internal IP requests.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is SSRF in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is SSRF in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
