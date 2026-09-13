# API Gateway vs Load Balancer

## 1. Why This Exists — The Problem First

Your API is getting hammered. You spin up three more app servers behind a load balancer — traffic spreads evenly, instances stay healthy, life is good. Then product asks for JWT validation at the edge, per-client rate limits, and routing `/v1/users` to the user service while `/v1/orders` goes to the order service. You bolt auth middleware into every service. Now a token format change requires redeploying six teams.

Or you go the other way: you deploy an API gateway with rich routing and rate limiting, but one backend instance dies and the gateway keeps sending traffic to it because nothing is doing health-checked distribution at the transport layer.

These are two different problems sitting at two different layers. Confusing them is one of the most common system design interview mistakes — and one of the most expensive production mistakes.

## 2. The Analogy — Make It Obvious

Picture a busy office building.

The **load balancer** is the **reception desk on the ground floor**. A visitor walks in. The receptionist doesn't read their ID badge or check which department they're visiting — they just look at which elevator banks are open and send the next person to the shortest queue. If elevator bank 2 is out of service, stop sending people there. Pure traffic distribution based on capacity and health.

The **API gateway** is the **security desk on each floor**. Before you enter the engineering wing, someone checks your badge, logs your visit, enforces "no more than 10 visitors per hour from this company," and directs you to the right team room based on what you said you're here for. It understands *what* you're trying to do, not just *how many* of you showed up.

Real buildings have both: ground-floor distribution plus floor-level access control. Real systems usually need both too.

## 3. How It Actually Works — The Full Explanation

### Load balancer — distribute connections, keep backends alive

A load balancer sits between clients and your servers and answers one question: **which backend instance should handle this connection or request?**

It operates primarily at **Layer 4 (TCP/UDP)** or **Layer 7 (HTTP)**, but even an L7 load balancer is mostly about distribution — host header, path-based routing to backends, SSL passthrough or termination. Its core jobs:

- **Distribute** incoming traffic across multiple instances (round-robin, least connections, weighted, consistent hash)
- **Health-check** backends and stop sending traffic to dead ones
- **Terminate TLS** (optional) so backends don't each manage certificates
- **Provide a single entry IP/DNS** so clients don't need to know about individual servers

Popular examples: AWS ALB/NLB, HAProxy in pure LB mode, nginx as upstream distributor, GCP Cloud Load Balancing.

What it does *not* typically do: OAuth token validation, request transformation, API key management, per-tenant quotas, or aggregating responses from five microservices into one.

### API gateway — enforce API policy at the edge

An API gateway sits at the **application/API layer (Layer 7)** and answers: **is this request allowed, and where should it go based on API semantics?**

Its core jobs:

- **Authentication and authorization** — validate JWT, API keys, mTLS
- **Rate limiting and throttling** — per client, per API key, per endpoint
- **Routing** — `/api/v2/*` → new service cluster, `/legacy/*` → monolith
- **Request/response transformation** — header injection, payload mapping, protocol translation (REST → gRPC)
- **Aggregation** — one client call fans out to multiple backend services (BFF pattern)
- **Observability** — centralized logging, metrics, tracing at the API boundary

Popular examples: Kong, AWS API Gateway, Apigee, Envoy with rich filter chains, nginx with auth modules.

### Where they sit in the stack

Typical production layout:

```
Client → DNS → Load Balancer → API Gateway → Microservices → Database
```

Sometimes the gateway *is* the load balancer (nginx/Kong handling both). Sometimes you have multiple LBs (external LB → gateway cluster → service LBs). The interview point is the **responsibility split**, not a rigid one-box-per-layer mandate.

### The one-sentence invariant

**Load balancer = "which server gets this traffic?"**
**API gateway = "what API rules apply before this reaches a service?"**

## 4. Real Code — See It Working

### nginx as a load balancer (distribution only)

```nginx
upstream api_backends {
    least_conn;
    server 10.0.1.10:8080;
    server 10.0.1.11:8080;
    server 10.0.1.12:8080;
}

server {
    listen 443 ssl;
    server_name api.example.com;

    location / {
        proxy_pass http://api_backends;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Every request goes to whichever backend has the fewest active connections. No auth check, no rate limit — just distribution.

### Kong API gateway route with rate limiting and JWT

```yaml
# kong.yml (declarative config)
_format_version: "3.0"

services:
  - name: user-service
    url: http://user-svc.internal:8080
    routes:
      - name: users-v1
        paths:
          - /v1/users
        plugins:
          - name: rate-limiting
            config:
              minute: 100
              policy: local
          - name: jwt
            config:
              claims_to_verify:
                - exp
```

```bash
# Without a valid JWT — gateway rejects before the service sees the request
curl -i https://api.example.com/v1/users
# HTTP/1.1 401 Unauthorized

# With JWT — gateway validates, then forwards
curl -i -H "Authorization: Bearer eyJhbG..." \
  https://api.example.com/v1/users
# HTTP/1.1 200 OK (from user-service via gateway)
```

### Combined stack (pseudo-architecture)

```
                    ┌─────────────────┐
  Internet ────────►│  AWS ALB (L7)   │  ← health checks, TLS, spread across AZs
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         ┌─────────┐   ┌─────────┐   ┌─────────┐
         │ Kong #1 │   │ Kong #2 │   │ Kong #3 │  ← auth, rate limit, route
         └────┬────┘   └────┬────┘   └────┬────┘
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    ┌─────────────────┐
                    │  Service mesh   │  ← per-service LB inside cluster
                    │  (K8s Services) │
                    └─────────────────┘
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between an API gateway and a load balancer?**

A load balancer distributes traffic across healthy backend instances — it's about capacity and availability. An API gateway enforces application-level policy at the API edge: authentication, rate limiting, routing by API path/version, request transformation. A load balancer asks "which server?"; a gateway asks "is this API call allowed and where does it belong?"

**Q: Can one product do both?**

Yes. nginx, HAProxy, and Envoy can act as load balancers, reverse proxies, and API gateways depending on configuration. Kong is gateway-first but also load-balances upstreams. In interviews, name the *responsibility* you're solving, then pick the tool. Don't say "we need Kong" when you only need round-robin across three VMs.

**Q: Where does each sit in a typical architecture?**

Clients hit DNS, then usually an external load balancer (for HA and TLS), then optionally an API gateway cluster (for policy), then internal load balancers or service mesh routing to individual pods/instances. Small startups might skip the dedicated gateway and put auth in the app. Large multi-team orgs almost always have a gateway layer.

**Q: Layer 4 vs Layer 7 — which is which?**

NLB/classic L4 load balancers route based on IP and port — fast, protocol-agnostic, no HTTP awareness. L7 load balancers and API gateways understand HTTP: host, path, headers, cookies. API gateways are always L7. Load balancers can be L4 or L7. L7 LB routing by path is still distribution, not full API management.

**Q: When would you use both?**

When you need horizontal scale *and* centralized API policy. Example: ALB spreads traffic across three Kong instances (LB job). Kong validates OAuth tokens and rate-limits per API key (gateway job). Without the LB, one dead Kong instance gets traffic. Without the gateway, every microservice reimplements auth.

**Q: What breaks first at scale?**

Load balancers fail when health checks are wrong (flapping backends, thundering herd on recovery) or when session affinity pins too much traffic to one node. Gateways fail when they become a bottleneck (every request passes through), when rate-limit state isn't shared across gateway instances, or when gateway config sprawl makes deployments risky. Both are single points of failure unless you run them in clusters behind another LB.

## 6. The Traps — What Goes Wrong

**"We'll use a load balancer for auth."** An ALB can attach a Cognito authorizer (AWS-specific), but that's not what people usually mean. Bolting OAuth into HAProxy with Lua is painful. If you need real API policy, use a gateway — don't stretch the LB into an app server.

**"We deployed Kong, so we don't need a load balancer."** Your gateway instances themselves need distribution and failover. A single Kong VM behind DNS is not highly available.

**Putting business logic in the gateway.** Gateways should enforce cross-cutting edge concerns. If your gateway has 2,000 lines of order-calculation Lua, you've built a distributed monolith with worse debugging.

**Rate limiting without shared state.** Two gateway instances each allowing 100 req/min means a client gets 200 req/min by hitting both. Use Redis or a centralized policy store for distributed rate limits.

**SSL termination in the wrong place.** Terminating TLS at the LB and sending plain HTTP to the gateway might be fine inside a VPC. Terminating at the gateway and sending plain HTTP to backends is also common. Terminating nowhere and making every microservice manage certs is operational pain.

## 7. Compare With Related Concepts

**API Gateway vs Reverse Proxy.** A reverse proxy sits in front of servers and forwards requests (nginx → app). An API gateway is a *policy-rich* reverse proxy specialized for APIs. All gateways are reverse proxies; not all reverse proxies are gateways.

**Load Balancer vs Service Mesh (e.g., Istio).** External LB gets traffic into the cluster. Service mesh LBs/route between internal services with mTLS, retries, circuit breaking. Gateway = north-south (client → system). Mesh = east-west (service → service).

**API Gateway vs BFF (Backend for Frontend).** BFF is an app that shapes APIs for a specific client (mobile vs web). It can run behind a gateway. Gateway enforces policy; BFF implements client-specific aggregation logic.

**CDN vs Gateway.** CDN caches static content at the edge and accelerates delivery. Gateway handles dynamic API requests. Cloudflare and similar products blur the line, but the responsibilities differ: cache hit vs auth/routing decision.

## 8. 🧠 The Memory Hook — What Sticks

Reception desk vs security desk. The load balancer doesn't care what your badge says — it just finds an open elevator. The API gateway reads your badge, checks the visitor log, and sends you to the right room. Most real buildings — and real systems — need both.
