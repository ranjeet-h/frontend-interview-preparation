# Reverse Proxy

## Detailed explanation

A reverse proxy sits in front of backend servers and forwards client requests to internal services.

## 1. One-line mental model

Reverse proxy is the public front door for private backend servers.

## 2. Problem it solves

Apps need TLS termination, routing, compression, buffering, static serving, and protection before traffic reaches app code.

## 3. Core idea

- Examples include Nginx, Envoy, HAProxy, and cloud load balancers.
- Can terminate TLS.
- Can route by host/path.
- Can add headers like request id or forwarded IP.
- Can serve static files and buffer slow clients.

## 4. Visual / analogy

```txt
Hotel front desk routes guests to rooms.
```

## 5. Minimal example

```txt
Nginx proxies `/api` to Node app and `/static` to static files.
```

## 6. Real-world example

Production Express app runs behind Nginx for TLS and routing.

## 7. Common interview questions

#### What is a reverse proxy?
- **The Engine Mechanism (Why it behaves this way):** A reverse proxy sits in front of backend servers and forwards client requests to internal services. Unlike a forward proxy (which acts on behalf of clients), a reverse proxy acts on behalf of servers. It receives client requests, applies rules (routing, TLS termination, compression, static file serving, buffering), and forwards them to the appropriate backend server. Examples include Nginx, Envoy, HAProxy, and cloud load balancers. The reverse proxy terminates TLS (decrypts HTTPS), routes requests by host/path headers, adds metadata headers (X-Request-ID, X-Forwarded-For), serves static files directly, buffers slow clients to protect backend servers, and can perform basic rate limiting and IP filtering. The backend server receives plain HTTP with enriched headers, never handling TLS or static files.
- **The Unforgettable Mental Model:** A reverse proxy is like a **hotel front desk**. Guests (clients) arrive at the desk, the desk checks their reservation (routing), handles their luggage (static files), and directs them to the right room (backend server). The rooms only handle the actual guest experience.
- **The Trap:** Thinking the reverse proxy provides authentication. It handles transport-level concerns (TLS, routing, compression), not application-level auth. Auth still needs to be implemented in the backend.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A reverse proxy sits in front of backend servers and forwards client requests to internal services. It terminates TLS, routes requests by host or path, serves static files, compresses responses, buffers slow clients, and adds metadata headers like request IDs and forwarded IPs. Examples include Nginx, Envoy, and cloud load balancers. The backend server receives plain HTTP with enriched context, offloading infrastructure concerns to the proxy. I use reverse proxies in production for TLS termination, routing, static file serving, and as a security layer before traffic reaches the application."

#### Why do reverse proxies matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Reverse proxies matter because they offload infrastructure concerns from the application server, improving performance, security, and maintainability. TLS termination at the proxy frees the app server from expensive cryptographic operations. Static file serving at the proxy avoids app server involvement for CSS, JS, and images. Request buffering protects the app server from slow clients that hold connections open. Routing enables multiple services behind a single public endpoint. Header enrichment provides request context (client IP, request ID) to the app server. Rate limiting and IP filtering at the proxy layer protect the app server before traffic reaches it. Reverse proxies also enable zero-downtime deployments by draining connections from old instances before routing to new ones.
- **The Unforgettable Mental Model:** Reverse proxies are like a **building's lobby and security system**. They handle visitor check-in (routing), package receiving (static files), security screening (rate limiting), and climate control (TLS) — so the offices inside can focus on actual work.
- **The Trap:** Putting application logic in the reverse proxy. Reverse proxies should handle infrastructure concerns, not business logic. Complex routing rules in Nginx config become unmaintainable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Reverse proxies matter because they offload infrastructure concerns from the application server. TLS termination frees the app from cryptographic overhead. Static file serving avoids app involvement. Request buffering protects against slow clients. Routing enables multiple services behind one endpoint. Header enrichment provides request context. Rate limiting at the proxy layer protects the app before traffic reaches it. I use reverse proxies for all production deployments — they're the first line of defense and the traffic manager for the entire backend."

#### What bugs happen when reverse proxies are handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor reverse proxy configuration causes several production issues. Not forwarding the real client IP (X-Forwarded-For) means the app server sees the proxy's IP instead, breaking IP-based rate limiting and geolocation. Not passing through required headers (Authorization, Content-Type) causes the app server to reject valid requests. Misconfigured TLS termination causes HTTPS to HTTP downgrade, exposing traffic on the internal network. Not buffering slow clients causes the app server to hold connections open, exhausting connection pools. Incorrect routing rules send requests to the wrong service. Not setting proper timeout values causes the proxy to timeout before the app server finishes processing, returning 504 Gateway Timeout to clients.
- **The Unforgettable Mental Model:** Poor reverse proxy config is like a **mail room that misroutes letters**. Wrong address (routing), missing stamps (headers), opened mail (TLS downgrade), and lost packages (timeouts).
- **The Trap:** Not configuring X-Forwarded-For correctly. The app server sees the proxy's IP for all requests, making IP-based features (rate limiting, geolocation, fraud detection) useless.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor reverse proxy configuration causes wrong client IPs breaking rate limiting, missing headers causing app rejections, TLS downgrade exposing internal traffic, slow clients exhausting app connections, and wrong routing sending requests to the wrong service. The most common bug is not forwarding X-Forwarded-For — the app sees the proxy's IP for all requests. I ensure the proxy forwards real client IPs, passes through required headers, terminates TLS correctly, buffers slow clients, and sets appropriate timeout values that match the app server's processing time."

#### How does a reverse proxy affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients interact with the reverse proxy as if it were the backend server — the proxy is the public-facing endpoint. The proxy affects the frontend through response headers (CORS headers added by the proxy), response compression (gzip/brotli applied by the proxy), static asset delivery (served directly by the proxy), and error responses (502 Bad Gateway when the backend is down, 504 Gateway Timeout when the backend is slow). The frontend may also experience the proxy's rate limiting and IP filtering. TLS termination at the proxy means the frontend's HTTPS connection ends at the proxy, not the backend.
- **The Unforgettable Mental Model:** The reverse proxy for the frontend is like a **restaurant's host stand**. You interact with the host (proxy) first — they seat you, handle your coat, and manage the waitlist. You never see the kitchen (backend) directly.
- **The Trap:** The frontend not handling proxy-generated error responses. 502 and 504 are proxy errors, not app errors — the frontend should display appropriate messages for infrastructure failures.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend interacts with the reverse proxy as the public endpoint. The proxy affects the frontend through CORS headers, compression, static asset delivery, and error responses like 502 and 504. TLS termination means the frontend's HTTPS connection ends at the proxy. I design the frontend to handle proxy-generated errors — 502 means the backend is down, 504 means it's slow. The frontend should display appropriate messages for infrastructure failures, not just app-level errors."

#### How would you test reverse proxy configuration?
- **The Engine Mechanism (Why it behaves this way):** Testing reverse proxy configuration involves verifying routing, header forwarding, TLS termination, static file serving, and error handling. Test that requests are routed to the correct backend service based on host/path. Test that X-Forwarded-For contains the real client IP. Test that required headers (Authorization, Content-Type) are passed through. Test that TLS termination works correctly — HTTPS at the proxy, HTTP to the backend. Test that static files are served directly by the proxy. Test that slow clients are buffered. Test timeout behavior — the proxy should wait long enough for the app server to respond. Test error responses — 502 when backend is down, 504 when backend is slow.
- **The Unforgettable Mental Model:** Testing reverse proxy is like **testing a building's front desk**. Verify guests are directed to the right rooms (routing), their messages are delivered correctly (headers), the door locks work (TLS), and the desk handles emergencies properly (errors).
- **The Trap:** Only testing the happy path. Test error scenarios — backend down, backend slow, invalid routing — to verify the proxy handles failures gracefully.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test reverse proxy configuration by verifying routing, header forwarding, TLS termination, static file serving, and error handling. Requests route to the correct backend. X-Forwarded-For contains real client IP. Required headers pass through. TLS terminates correctly. Static files served by proxy. Slow clients buffered. Timeouts match app processing time. Error responses are correct — 502 for down backend, 504 for slow backend. I also test under load to verify the proxy handles concurrent connections correctly."

## 8. Active recall test

1. **Explain reverse proxy without looking at notes.**
   - **Explanation:** A reverse proxy sits in front of backend servers, forwarding client requests to internal services. It terminates TLS, routes by host/path, serves static files, compresses responses, buffers slow clients, and adds metadata headers. Examples: Nginx, Envoy, HAProxy. The backend receives plain HTTP with enriched context.

2. **Give one production bug related to reverse proxy.**
   - **Explanation:** Not forwarding X-Forwarded-For causes the app server to see the proxy's IP for all requests. IP-based rate limiting, geolocation, and fraud detection break because every request appears to come from the same IP.

3. **Give one API example where reverse proxy matters.**
   - **Explanation:** Nginx proxies /api to a Node app and /static to static files. It terminates TLS, adds X-Request-ID headers, compresses responses with gzip, and buffers slow clients. The Node app receives plain HTTP with request context.

4. **Explain how a frontend client experiences a reverse proxy.**
   - **Explanation:** The frontend interacts with the proxy as the public endpoint. It receives CORS headers, compressed responses, and static assets from the proxy. Proxy errors (502, 504) indicate infrastructure issues. TLS connection ends at the proxy, not the backend.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Reverse Proxy is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Reverse Proxy in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Reverse Proxy in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
