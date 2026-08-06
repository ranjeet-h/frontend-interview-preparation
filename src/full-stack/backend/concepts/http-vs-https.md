# HTTP vs HTTPS

## Detailed explanation

HTTP is the application protocol used to transfer requests and responses between clients and servers. HTTPS is HTTP over TLS, which encrypts traffic, verifies server identity, and protects requests from tampering. For production APIs, HTTPS is mandatory because tokens, cookies, personal data, and request bodies must not travel as readable text.

## 1. One-line mental model

HTTPS is HTTP wrapped in encryption and identity verification.

## 2. Problem it solves

Plain HTTP exposes traffic to interception, modification, and credential theft on shared or compromised networks.

## 3. Core idea

- HTTP defines request/response semantics.
- HTTPS uses TLS before HTTP data is exchanged.
- TLS encrypts data in transit.
- Certificates prove the server owns the domain.
- HTTPS enables secure cookies, modern browser APIs, and safer authentication.

## 4. Visual / analogy

```txt
HTTP:
Client -> readable request -> Server

HTTPS:
Client -> TLS encrypted tunnel -> Server
```

HTTP is a postcard. HTTPS is a sealed envelope sent to a verified address.

## 5. Minimal example

```txt
http://api.example.com/users
https://api.example.com/users
```

The API shape may be identical, but HTTPS protects the transport.

## 6. Real-world example

Production login APIs must use HTTPS:

```txt
POST https://api.example.com/auth/login
Cookie: session=...
```

With HTTP, credentials and session cookies can be captured in transit.

## 7. Common interview questions

#### What is the difference between HTTP and HTTPS?
- **The Engine Mechanism (Why it behaves this way):** HTTP transmits data as plaintext over TCP port 80. HTTPS wraps HTTP inside a TLS (Transport Layer Security) encrypted tunnel over TCP port 443. Before any HTTP data is exchanged, the client and server perform a TLS handshake: they negotiate a protocol version, agree on cipher suites, exchange certificates, and derive shared encryption keys. All subsequent HTTP requests and responses are encrypted with these keys.
- **The Unforgettable Mental Model:** HTTP is a **postcard** — anyone handling it can read the message. HTTPS is a **sealed armored truck** — only the sender and receiver have the keys to open it.
- **The Trap:** Thinking HTTPS makes your application secure from all attacks. HTTPS only protects data in transit. It does not prevent XSS, SQL injection, CSRF, or server-side breaches.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: HTTP sends data as plaintext over the network, meaning anyone intercepting the traffic can read credentials, tokens, and request bodies. HTTPS wraps HTTP inside a TLS encrypted tunnel. Before any data is exchanged, the client and server perform a TLS handshake that verifies the server's identity via a certificate and establishes shared encryption keys. All subsequent communication is encrypted, protecting data from eavesdropping and tampering in transit."

#### What does TLS provide?
- **The Engine Mechanism (Why it behaves this way):** TLS provides three guarantees: confidentiality (encryption prevents eavesdropping), integrity (MAC/hMAC detects tampering), and authentication (certificates verify server identity). During the handshake, the server presents its X.509 certificate signed by a Certificate Authority. The client validates the certificate chain, checks expiry and revocation, then uses the server's public key to establish a shared symmetric session key for encrypting all subsequent traffic.
- **The Unforgettable Mental Model:** TLS is a **three-lock security system**. Lock 1 (confidentiality): only you and the recipient can read the message. Lock 2 (integrity): if anyone changes even one letter, the seal breaks. Lock 3 (authentication): you know you're talking to the real person, not an impostor.
- **The Trap:** Confusing TLS with application-level authentication. TLS authenticates the server's identity (domain ownership), not the user's identity. User auth still requires tokens, passwords, or sessions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: TLS provides three core guarantees: confidentiality through encryption so data cannot be read in transit, integrity through message authentication codes so tampering is detected, and authentication through certificate-based server identity verification. The TLS handshake establishes these guarantees before any application data is exchanged, creating a secure channel that HTTP then uses for its request-response cycle."

#### Why are certificates needed?
- **The Engine Mechanism (Why it behaves this way):** Certificates bind a domain name to a public key and are signed by a trusted Certificate Authority (CA). Without certificates, a man-in-the-middle attacker could impersonate any server during the TLS handshake. The certificate chain of trust works because operating systems and browsers ship with a store of trusted root CA certificates. When a server presents its certificate, the client verifies it was signed by a trusted CA, matches the requested domain, and has not expired or been revoked.
- **The Unforgettable Mental Model:** A certificate is a **government-issued passport**. It proves you are who you claim to be, it's issued by a trusted authority, it has an expiry date, and it can be revoked if compromised.
- **The Trap:** Using self-signed certificates in production or ignoring certificate validation on the client side. Self-signed certs provide encryption but no identity verification — an attacker could present their own self-signed cert.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Certificates are needed to prevent man-in-the-middle attacks during the TLS handshake. They bind a domain name to a cryptographic public key and are signed by a trusted Certificate Authority. When a client connects, it verifies the certificate chain against its trusted root store, confirms the domain matches, and checks that the certificate hasn't expired or been revoked. Without this verification, encryption alone cannot guarantee you're communicating with the intended server."

#### Can HTTPS prevent XSS?
- **The Engine Mechanism (Why it behaves this way):** No. HTTPS encrypts data between the client and server, but XSS (Cross-Site Scripting) executes malicious JavaScript inside the user's browser after the page has been delivered. The browser decrypts the HTTPS response, renders the HTML, and executes any scripts — including injected malicious ones. XSS is an application-layer vulnerability that HTTPS cannot detect or prevent.
- **The Unforgettable Mental Model:** HTTPS is a **secure delivery truck** that protects the package during transit. XSS is a **poisoned letter inside the package** — the truck delivered it safely, but the contents are still dangerous.
- **The Trap:** Assuming HTTPS eliminates all security concerns. HTTPS protects the transport layer only. Application-layer attacks like XSS, CSRF, and SQL injection require separate defenses (input sanitization, CSP headers, CSRF tokens, parameterized queries).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: No, HTTPS cannot prevent XSS. HTTPS protects data in transit between the client and server, but XSS is an application-layer attack where malicious scripts execute in the user's browser after the page is delivered. The browser decrypts the HTTPS response and runs the scripts regardless. Preventing XSS requires application-level defenses like input sanitization, output encoding, Content Security Policy headers, and avoiding dangerouslySetInnerHTML or equivalent patterns."

#### Why should login APIs never use HTTP?
- **The Engine Mechanism (Why it behaves this way):** Login APIs transmit credentials (passwords, OTP codes) and receive session tokens or JWTs. Over plain HTTP, these travel as readable text through every network hop — ISP routers, public WiFi access points, corporate proxies. An attacker on the same network can use packet sniffing tools (Wireshark, tcpdump) to capture credentials and tokens in real-time, enabling account takeover and session hijacking.
- **The Unforgettable Mental Model:** Sending credentials over HTTP is like **shouting your bank PIN through a megaphone in a crowded room**. Everyone nearby can hear it, write it down, and use it.
- **The Trap:** Thinking internal services or "trusted networks" make HTTP acceptable for auth. Any network can be compromised, and insider threats exist. Modern best practice is HTTPS everywhere, including internal service-to-service communication.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Login APIs must never use HTTP because credentials and session tokens travel as plaintext through every network hop. On public WiFi, corporate networks, or compromised infrastructure, attackers can capture passwords and tokens using simple packet sniffing tools. This enables immediate account takeover and session hijacking. HTTPS encrypts this traffic end-to-end, making intercepted data useless without the session keys. Modern security standards and browser features like Secure cookies also require HTTPS."

#### What is TLS termination?
- **The Engine Mechanism (Why it behaves this way):** TLS termination is the process of decrypting HTTPS traffic at a reverse proxy, load balancer, or API gateway before forwarding it as plain HTTP to backend servers. The termination point holds the TLS certificate and private key, performs the handshake with clients, decrypts incoming requests, and encrypts outgoing responses. Backend servers receive unencrypted HTTP on an internal network, reducing their computational overhead since TLS handshake cryptography is CPU-intensive.
- **The Unforgettable Mental Model:** TLS termination is like a **building's mail room**. All sealed letters (HTTPS) arrive here, get opened and sorted, then forwarded as regular mail (HTTP) to individual offices inside the building.
- **The Trap:** Forgetting that traffic between the TLS terminator and backend servers is unencrypted. If the internal network is not isolated, this creates a vulnerability. Some architectures use mutual TLS (mTLS) between internal services to address this.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: TLS termination is the process where a reverse proxy or load balancer decrypts HTTPS traffic before forwarding it to backend servers as plain HTTP. The termination point holds the SSL certificate and handles the computationally expensive TLS handshake, freeing backend servers to focus on application logic. The tradeoff is that traffic between the terminator and backend is unencrypted, so it should run on an isolated internal network. For higher security, some architectures use mutual TLS between internal services."

#### Why do Secure cookies require HTTPS?
- **The Engine Mechanism (Why it behaves this way):** The `Secure` attribute on cookies instructs the browser to only send the cookie over HTTPS connections. If a cookie is marked `Secure` and the connection is HTTP, the browser silently omits it from the request. This prevents session tokens from being transmitted in plaintext where they could be intercepted. Browsers enforce this at the network layer — even if JavaScript tries to set a `Secure` cookie on an HTTP page, modern browsers reject it.
- **The Unforgettable Mental Model:** A Secure cookie has a **built-in GPS lock** — it only travels on encrypted highways (HTTPS). If the road is unencrypted (HTTP), the cookie refuses to leave the browser.
- **The Trap:** Setting the `Secure` flag in development over HTTP, which causes cookies to never be sent and auth to silently fail. Use environment-specific cookie configuration: `Secure` in production, optional in local development.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The Secure cookie attribute tells the browser to only transmit the cookie over HTTPS connections. This prevents session tokens and auth cookies from being sent in plaintext where they could be intercepted by network sniffers. If a page is served over HTTP, the browser simply won't send Secure cookies, which is why they require HTTPS. This is a critical defense against session hijacking on untrusted networks."

## 8. Active recall test

1. **What three protections does HTTPS provide?**
   - **Explanation:** Confidentiality (encryption prevents eavesdropping), integrity (tampering is detected via message authentication codes), and authentication (certificates verify the server's identity through a trusted CA chain).

2. **What role does a certificate play?**
   - **Explanation:** A certificate binds a domain name to a public key and is signed by a trusted Certificate Authority. It prevents man-in-the-middle attacks by allowing the client to verify it's communicating with the legitimate server, not an impostor.

3. **Does HTTPS protect data after it reaches the server?**
   - **Explanation:** No. HTTPS only protects data in transit. Once the server decrypts the request, the data is in plaintext in server memory. Protection at rest requires encryption of databases, file systems, and proper access controls.

4. **What happens when TLS terminates at a load balancer?**
   - **Explanation:** The load balancer decrypts HTTPS traffic and forwards it as plain HTTP to backend servers. This reduces computational overhead on app servers but means internal traffic is unencrypted. The internal network must be isolated, or mTLS should be used between services.

## 9. Mistakes / traps

- Saying HTTPS secures the application from all attacks.
- Forgetting that HTTPS protects only data in transit.
- Using HTTP for internal services without understanding network risk.
- Sending secure cookies over HTTP.

## 10. Compare with related concepts

HTTPS is not authentication. It verifies the server and encrypts the channel, but users still need auth. HTTPS is not hashing. Encryption is reversible by the intended receiver; hashing is one-way.

## 11. Summary from memory

Explain why HTTPS is required for auth-heavy APIs even when the frontend and backend are both yours.

## 12. Spaced revision prompts

- Day 1: Define HTTP and HTTPS.
- Day 3: Explain TLS handshake at a high level.
- Day 7: Explain TLS termination.
- Day 14: Explain what HTTPS does not protect against.

