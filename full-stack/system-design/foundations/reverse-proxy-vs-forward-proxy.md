# Reverse Proxy vs Forward Proxy

## 1. Why This Exists — The Problem First

Your backend team deploys four app servers. Clients now need four different URLs, four TLS certificates, and they see your internal topology every time something breaks. Meanwhile, your company's employees are hitting blocked sites, leaking client IPs to every ad tracker, and IT has no audit trail of who accessed what.

Two proxy patterns solve two opposite problems — and interviewers love asking about them because candidates constantly mix up which side of the connection the proxy represents.

Get this wrong and you'll put a forward proxy where a reverse proxy belongs (breaking your CDN setup) or expose backend IPs because you thought "proxy" always means "hide the client."

## 2. The Analogy — Make It Obvious

Think about hiring someone to speak on your behalf.

A **forward proxy** is a **lawyer you send to the courthouse**. *You* hire them. *You* know the real client. The courthouse (the internet/server) only sees the lawyer's face. The server doesn't know who you are — it knows the proxy. The proxy works for the **client side**.

A **reverse proxy** is a **company spokesperson at a press conference**. *The company* hired them. Reporters (clients) talk to the spokesperson. They don't get the CEO's direct phone number or know there are five VPs behind the curtain handling different questions. The proxy works for the **server side**.

Same word — "proxy" — opposite direction of representation.

## 3. How It Actually Works — The Full Explanation

### Forward proxy — client-side intermediary

The client explicitly (or via corporate policy) sends requests **through** a forward proxy. The proxy fetches resources from the internet on the client's behalf.

```
Client → Forward Proxy → Internet → Origin Server
         (client knows        (server sees
          about proxy)          proxy's IP)
```

What it does:

- **Hides the client** from destination servers (privacy, anonymity)
- **Enforces corporate policy** — block social media, allowlist domains, DLP scanning
- **Caches** frequently requested external content (bandwidth savings)
- **Bypasses geo-restrictions** (when used as VPN/proxy services)
- **Centralized logging** — IT sees all outbound traffic

The origin server sees the proxy's IP, not the employee's laptop IP. The client must be configured to use the proxy (browser settings, `HTTP_PROXY` env var, PAC file).

Common in: corporate networks, Squid proxies, VPN egress, developer tools like Charles Proxy for debugging outbound calls.

### Reverse proxy — server-side intermediary

Clients send requests to what they think is **the** server. In reality, they hit a reverse proxy, which forwards to one or more backend servers the client never sees.

```
Client → Reverse Proxy → Backend Server(s)
         (client thinks          (real app
          this IS the server)     instances hidden)
```

What it does:

- **Hides backend topology** — one public IP/DNS, many internal servers
- **Load balancing** across app instances
- **TLS termination** — proxy handles HTTPS, backends speak HTTP internally
- **Caching** static responses at the edge
- **Compression, WAF, rate limiting** before traffic hits the app
- **WebSocket and HTTP/2 upgrade** handling

The client doesn't know (or need to know) a reverse proxy exists. DNS points to the proxy. nginx, Apache, HAProxy, Cloudflare, AWS CloudFront (for dynamic origins) — all reverse-proxy patterns.

### The direction rule

| | Forward Proxy | Reverse Proxy |
|---|---|---|
| **Represents** | The client | The server |
| **Configured by** | Client / IT department | Server / ops team |
| **Server sees** | Proxy IP | Proxy IP (thinks it's the client) |
| **Client sees** | Thinks it's talking to origin | Thinks proxy *is* the origin |
| **Typical goal** | Privacy, policy, caching outbound | Scale, security, hide internals |

### Can you have both?

Yes. A corporate employee's browser → **forward proxy** (company policy) → internet → CDN **reverse proxy** → origin servers. Each hop serves a different owner's interests.

## 4. Real Code — See It Working

### Forward proxy — client configuration

```bash
# curl through a forward proxy (Squid on localhost:3128)
curl -x http://localhost:3128 https://httpbin.org/ip
```

```json
{
  "origin": "203.0.113.50"
}
```

That IP is the **proxy's** egress IP, not your laptop's. The origin server logged the proxy.

```bash
# Environment variable — many CLI tools respect this
export HTTP_PROXY=http://proxy.corp.example.com:8080
export HTTPS_PROXY=http://proxy.corp.example.com:8080
npm install   # traffic goes through corporate forward proxy
```

### Reverse proxy — nginx in front of app servers

```nginx
# /etc/nginx/conf.d/app.conf
upstream backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    listen 443 ssl;
    server_name www.example.com;

    ssl_certificate     /etc/ssl/certs/example.crt;
    ssl_certificate_key /etc/ssl/private/example.key;

    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Client hits one hostname — nginx picks a backend
curl -i https://www.example.com/api/health
# HTTP/1.1 200 OK
# (response came from one of :3001, :3002, or :3003 — client has no idea)
```

### Side-by-side flow

```
FORWARD PROXY (employee browsing):
  Laptop ──► corp-proxy.internal:8080 ──► https://github.com
  GitHub logs IP of corp-proxy, not laptop

REVERSE PROXY (customer hitting your API):
  Phone ──► api.example.com (nginx) ──► app-pod-7.internal:8080
  Phone thinks api.example.com IS the app
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between a forward proxy and a reverse proxy?**

A forward proxy sits near the client and acts on behalf of clients — hiding them from servers and enforcing outbound policy. A reverse proxy sits near the server and acts on behalf of servers — hiding backend topology from clients and handling TLS, load balancing, caching. Forward = client-side. Reverse = server-side.

**Q: Who configures each?**

Forward proxy: the client organization (IT sets browser proxy or PAC file). Reverse proxy: the server organization (DNS points to nginx/Cloudflare, backends are internal).

**Q: Does the origin server know about a forward proxy?**

It sees the proxy's IP as the client. It doesn't automatically know a proxy is involved unless the proxy adds headers like `Via` or `X-Forwarded-For` (uncommon for forward proxies on outbound corporate traffic).

**Q: Does the client know about a reverse proxy?**

Usually no. The client resolves `api.example.com`, gets the reverse proxy's IP, and believes that's the application. Transparent to end users by design.

**Q: What are common real-world examples?**

Forward: corporate Squid/Blue Coat proxies, VPN egress, Charles Proxy for debugging. Reverse: nginx, HAProxy, AWS ALB, Cloudflare, Varnish in front of origin, Kubernetes Ingress controllers.

**Q: How do CDNs relate to reverse proxies?**

CDNs are reverse proxies at global scale. They terminate TLS at edge PoPs, cache static assets, and forward dynamic requests to your origin. "Reverse proxy used at CDNs" is a standard interview pairing.

**Q: Can a reverse proxy also be a load balancer?**

Yes — that's the most common deployment. nginx reverse-proxying to an upstream block *is* load balancing. The reverse proxy pattern is about representation; load balancing is one of its jobs.

## 6. The Traps — What Goes Wrong

**"Proxy always means VPN."** VPNs tunnel all traffic; forward proxies handle HTTP(S) at the application layer. Related but different tools.

**Assuming `X-Forwarded-For` is trustworthy on a forward proxy path.** On reverse proxies, backends use `X-Forwarded-For` to learn the real client IP — but only if you trust the proxy. Clients can spoof it if they hit backends directly. Lock down backend access to only accept traffic from the reverse proxy.

**Putting a forward proxy in front of your own API.** Your API customers don't configure a forward proxy to reach you — they hit your public endpoint (reverse proxy). Forward proxies are for outbound client traffic, not inbound API design.

**Confusing reverse proxy with API gateway.** A reverse proxy forwards requests. A gateway adds API policy (auth, rate limits). Gateways are reverse proxies with extra responsibilities — see the API Gateway vs Load Balancer page.

**SSL modes in Cloudflare/similar.** "Flexible" SSL (HTTPS client → Cloudflare, HTTP Cloudflare → origin) is a reverse proxy pattern that exposes plaintext inside if misconfigured. Know where TLS ends.

## 7. Compare With Related Concepts

**Reverse Proxy vs Load Balancer.** Nearly all production load balancers are reverse proxies. LB emphasizes distribution; reverse proxy emphasizes hiding backends. Same box, different emphasis.

**Forward Proxy vs NAT.** NAT translates IP addresses at the network layer for all traffic. Forward proxy is application-layer, understands HTTP, can filter by URL, cache, authenticate users.

**Reverse Proxy vs API Gateway.** Gateway = reverse proxy + auth + rate limiting + routing policy. If you only need TLS termination and upstream distribution, a plain reverse proxy is enough.

**Transparent Proxy vs Explicit Forward Proxy.** Transparent proxy intercepts traffic without client config (common in corporate networks via router rules). Explicit proxy requires client configuration. Both are forward proxies.

## 8. 🧠 The Memory Hook — What Sticks

Forward proxy: **you** send a lawyer so the courthouse never sees you. Reverse proxy: **the company** sends a spokesperson so reporters never see the CEO. Same mechanism — opposite side of the conversation you're hiding.
