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

1. What is the difference between HTTP and HTTPS?
2. What does TLS provide?
3. Why are certificates needed?
4. Can HTTPS prevent XSS?
5. Why should login APIs never use HTTP?
6. What is TLS termination?
7. Why do Secure cookies require HTTPS?

## 8. Active recall test

1. What three protections does HTTPS provide?
2. What role does a certificate play?
3. Does HTTPS protect data after it reaches the server?
4. What happens when TLS terminates at a load balancer?

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

