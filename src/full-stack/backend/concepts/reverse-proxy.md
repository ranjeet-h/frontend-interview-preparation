# Reverse Proxy: Perimeter Architecture, Traffic Routing, and Edge Protection

## 1. Why This Exists — The Problem First

Imagine deploying a web application by binding your Node.js, Python, or Ruby backend processes directly to public ports 80 and 443 on the open internet. In local development on your laptop, this seems fine. In production, this architecture collapses under real-world traffic within hours.

First, your backend runtimes are designed to execute application business logic, not handle raw internet socket churn. A malicious client on a slow 2G mobile connection can open an HTTP POST request and transmit one single byte of headers every 10 seconds. In a single-threaded runtime like Node.js or a pre-fork worker pool like Python Gunicorn, this Slowloris attack rapidly holds every available connection worker hostage, starving thousands of legitimate users without spiking your CPU or memory.

Second, consider scaling to 50 microservice instances across multiple availability zones. If each container terminates its own SSL/TLS encryption, you must securely distribute your private TLS keys to 50 separate pods, manage certificate renewal across all 50 instances without downtime, and force your application runtimes to burn 20% to 30% of their CPU cycles performing asymmetric cryptographic handshakes instead of serving API queries.

Third, you have zero architectural agility. You cannot perform a zero-downtime blue/green deployment, you cannot route `/api/v1/payments` to a dedicated service while routing `/static/` to an optimized asset disk, and you cannot inject global security headers or enforce centralized IP rate limiting before unvetted traffic hits your application memory.

The reverse proxy exists to solve this exact perimeter problem. It creates an isolated, hardened, high-throughput gateway between the hostile public internet and your private application cluster.

## 2. The Analogy — Make It Obvious

Think of a reverse proxy as the **concierge desk and security checkpoint in the grand lobby of a luxury hotel**.

When guests arrive at the hotel from the outside world (clients sending HTTP requests), they are never allowed to wander unescorted through employee hallways, private kitchens, or guest suites. They interact exclusively with the front desk concierge standing at the entrance.

The concierge inspects the guest's passport and decrypts their identity credentials right at the front counter (TLS termination and certificate management).

If a guest simply asks for a city map or tourist guide (static assets like images, CSS, or JS bundles), the concierge hands it to them directly from a stack behind the desk. The kitchen and housekeeping staff are never disturbed.

If a guest places a dinner order (a dynamic API request), the concierge checks which internal kitchen is currently open and least busy (load balancing and health checking). The concierge stamps the guest's room number and nationality on the back of the order ticket (header injection like `X-Forwarded-For` and `X-Forwarded-Proto`) and passes the ticket to the kitchen staff through a fast internal intercom.

If a guest speaks agonizingly slowly, taking 15 minutes to dictate a single sentence (a slow client or Slowloris attack), the concierge patiently listens at the counter until the entire sentence is finished. The concierge then delivers the complete, finalized order to the chef in two seconds flat (request buffering). The chef never stands waiting at the counter.

To the outside guest, the front desk **is** the hotel. To the internal staff, the front desk is an impenetrable shield that organizes, buffers, and distributes work.

## 3. How It Actually Works — The Full Explanation

A reverse proxy is an intermediate server or software appliance that sits in front of one or more origin backend servers, intercepts incoming client requests, and coordinates their fulfillment. 

To understand its inner workings, we must first contrast it with its mirror image: the forward proxy.

**Forward Proxy vs. Reverse Proxy**

A **Forward Proxy** sits in front of clients (users). It acts on behalf of the client to access external internet resources. A company uses a forward proxy to inspect employee outbound traffic, block restricted domains, or anonymize user requests through a VPN. The destination web server does not see the client's true IP; it only sees the forward proxy.

A **Reverse Proxy** sits in front of servers. It acts on behalf of the backend servers to receive incoming traffic from the internet. The client has no idea whether it is talking to a single server or a cluster of 500 microservices; to the client, the reverse proxy is the final destination.

**The Six Core Responsibilities of a Reverse Proxy**

1. **TLS Termination and Offloading:** Establishing an HTTPS connection requires an initial cryptographic handshake involving certificate verification, key exchange algorithms (such as ECDHE), and symmetric cipher initialization. Reverse proxies (written in C, C++, or Rust, such as NGINX, HAProxy, Envoy, or Traefik) use hardware-accelerated cryptographic instructions to handle thousands of TLS handshakes per second. The proxy terminates the encrypted connection, decrypts the HTTP payload, and forwards plain HTTP (or lightweight internal TLS) across the private VPC network to your application pods. This frees backend workers from cryptographic overhead and centralizes SSL certificate renewals at a single edge location.

2. **Buffer and Slow Client Shielding:** Public internet clients frequently experience packet loss, mobile latency, and bandwidth throttling. High-performance reverse proxies use asynchronous, event-driven I/O (such as Linux `epoll` or BSD `kqueue`) where a single OS thread can manage 10,000 idle or slow connections with negligible memory. The proxy reads incoming HTTP request headers and streaming request bodies into fast kernel and disk buffers. Only when the full request has been received does the proxy open a high-speed internal socket connection to your backend, delivering the entire payload in milliseconds. The backend processes the job and replies immediately. The proxy then holds the response buffer and trickles bytes back to the slow mobile client at its own pace.

3. **Request Routing and Path Rewriting:** Modern architectures split monolithic applications into microservices. The reverse proxy inspects incoming HTTP Host headers, paths, and HTTP methods to dispatch traffic to the correct internal service:
- `api.example.com/users/*` routes to the User Service cluster on internal port 5001.
- `api.example.com/orders/*` routes to the Order Service cluster on internal port 5002.
- `example.com/assets/*` routes to an object storage mount or local SSD cache.

4. **Load Balancing and Active Health Checking:** Reverse proxies distribute incoming request volume across an upstream pool of application instances using configured algorithms:
- *Round Robin:* Dispatches requests sequentially across all nodes.
- *Least Connections:* Routes traffic to the instance currently managing the fewest active requests.
- *IP Hash / Consistent Hashing:* Maps a client's IP to a specific instance to maintain session affinity without shared state.
The proxy constantly runs background health checks (sending periodic HTTP `GET /healthz` pings). If a container crashes or returns 500 errors, the proxy immediately evicts that node from the active upstream pool, routing subsequent requests to healthy nodes with zero client disruption.

5. **Static Asset Serving and Compression:** Backend runtimes (such as Node.js or Python) are notoriously inefficient at reading static files off disk and streaming them through application memory. A reverse proxy serves static HTML, CSS, JavaScript chunks, images, and fonts directly from the operating system's file system cache using the Linux `sendfile` zero-copy system call. Furthermore, the proxy handles on-the-fly Gzip or Brotli compression, shrinking payload sizes by up to 70% before sending them over the wire.

6. **Security, IP Sanitization, and Header Injection:** Because the reverse proxy establishes a new TCP connection to the backend server, the backend would naturally see the proxy's internal private IP (e.g., `10.0.1.5`) as the source of every request. To preserve provenance for logging, authentication, and rate limiting, the reverse proxy enriches incoming request headers before forwarding:
- `X-Forwarded-For`: A comma-separated list of IP addresses (`client, proxy1, proxy2`) tracing the request's origin.
- `X-Forwarded-Proto`: Indicates whether the original client connected via `http` or `https`.
- `X-Forwarded-Host`: Records the original `Host` header sent by the client.
- `X-Real-IP`: Represents the single immediate external client IP.

**Layer 4 vs. Layer 7 Reverse Proxies**

Reverse proxies operate at two distinct layers of the OSI model:

- **Layer 4 (Transport Layer):** Operates at the TCP/UDP level. The proxy forwards raw byte streams based on IP address and port without parsing HTTP protocols, headers, or cookies. It cannot inspect URL paths or terminate TLS while rewriting HTTP headers. Layer 4 proxies (such as AWS Network Load Balancer or HAProxy in TCP mode) offer ultra-low latency and massive packet-per-second throughput.
- **Layer 7 (Application Layer):** Operates at the HTTP/HTTPS/WebSocket level. The proxy fully parses the HTTP message envelope, inspecting headers, paths, query parameters, cookies, and HTTP methods. This enables content-based routing, header manipulation, TLS termination, path rewriting, and JWT validation, at the cost of slightly higher CPU utilization.

## 4. Real Code — See It Working

Here is a complete, production-grade setup: an **NGINX Reverse Proxy** configuration routing traffic to a **Node.js Express** backend that correctly parses proxy headers for IP-based rate limiting.

### 1. Production NGINX Reverse Proxy Configuration

```nginx
# /etc/nginx/nginx.conf

user nginx;
worker_processes auto;
pid /var/run/nginx.pid;

events {
    # Number of simultaneous connections per worker process
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Performance optimizations for file streaming
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;

    # Global compression
    gzip on;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript application/xml;

    # Upstream pool of backend application instances
    upstream nodejs_backend_cluster {
        least_conn; # Route to node with fewest active requests
        server 10.0.1.21:3000 max_fails=3 fail_timeout=10s;
        server 10.0.1.22:3000 max_fails=3 fail_timeout=10s;
        
        # Keepalive maintains open TCP connections to upstream backends
        # preventing TCP handshake exhaustion under high concurrency
        keepalive 64;
    }

    # Redirect all plain HTTP traffic to HTTPS
    server {
        listen 80;
        server_name api.example.com;
        return 301 https://$host$request_uri;
    }

    # Primary HTTPS Reverse Proxy Gateway
    server {
        listen 443 ssl http2;
        server_name api.example.com;

        # TLS Termination
        ssl_certificate     /etc/ssl/certs/api.example.com.crt;
        ssl_certificate_key /etc/ssl/private/api.example.com.key;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;
        ssl_session_cache   shared:SSL:10m;
        ssl_session_timeout 10m;

        # Slowloris Defense: Buffer request bodies before touching backends
        proxy_buffering on;
        proxy_buffer_size 8k;
        proxy_buffers 8 64k;
        client_body_buffer_size 128k;
        client_max_body_size 20m;

        # Aggressive connection timeouts to drop stalled clients
        client_body_timeout 10s;
        client_header_timeout 10s;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;

        # 1. Direct Static Asset Serving (Bypasses Node.js entirely)
        location /static/ {
            alias /var/www/static/;
            expires 30d;
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        # 2. Dynamic API Proxying to Node.js Cluster
        location /api/ {
            proxy_pass http://nodejs_backend_cluster;
            proxy_http_version 1.1;

            # Clear Connection header to enable HTTP/1.1 keepalive with backend
            proxy_set_header Connection "";

            # Essential Provenance Header Injection
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_set_header X-Forwarded-Port $server_port;

            # Security Headers passed to client
            add_header X-Content-Type-Options "nosniff" always;
            add_header X-Frame-Options "DENY" always;
        }
    }
}
```

### 2. Production Express Backend Reading Proxy Metadata

```javascript
// server.js - Node.js Express Application
const express = require('express');
const app = express();

app.use(express.json());

// ============================================================================
// CRITICAL: Trust Proxy Configuration
// Setting 'trust proxy' tells Express to trust the X-Forwarded-* headers 
// injected by the reverse proxy.
// '1' indicates Express should trust the 1st immediate hop (our NGINX instance).
// When enabled:
// - req.ip evaluates to the original client IP from X-Forwarded-For
// - req.protocol and req.secure reflect the client-to-proxy protocol ('https')
// ============================================================================
app.set('trust proxy', 1);

// Sliding Window In-Memory Rate Limiter using real client IPs
const rateLimitWindowMs = 60 * 1000; // 1 minute
const maxRequestsPerWindow = 60;
const ipRequestHistory = new Map();

function ipRateLimiterMiddleware(req, res, next) {
    // req.ip correctly yields the real user IP because 'trust proxy' is 1
    const clientIp = req.ip;
    const now = Date.now();

    const timestamps = ipRequestHistory.get(clientIp) || [];
    const validTimestamps = timestamps.filter(ts => now - ts < rateLimitWindowMs);

    if (validTimestamps.length >= maxRequestsPerWindow) {
        return res.status(429).json({
            error: 'Too Many Requests',
            clientIp: clientIp,
            retryAfterSeconds: Math.ceil((validTimestamps[0] + rateLimitWindowMs - now) / 1000)
        });
    }

    validTimestamps.push(now);
    ipRequestHistory.set(clientIp, validTimestamps);
    next();
}

app.use(ipRateLimiterMiddleware);

// Sample Protected Route
app.get('/api/v1/user/session', (req, res) => {
    res.json({
        status: 'authenticated',
        clientIp: req.ip,
        isEncrypted: req.secure, // true if client connected via HTTPS
        protocol: req.protocol,
        host: req.hostname,
        headersReceived: {
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-forwarded-proto': req.headers['x-forwarded-proto'],
            'x-real-ip': req.headers['x-real-ip']
        }
    });
});

app.listen(3000, () => {
    console.log('Internal Express server listening on port 3000');
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between a Forward Proxy and a Reverse Proxy?**

A forward proxy sits in front of client devices to govern, inspect, and anonymize outbound requests to the internet (e.g., a corporate firewall, an ISP cache, or a VPN tunnel). The internet destination does not know the identity of the original client.

A reverse proxy sits in front of backend servers to protect, load balance, decrypt, and route inbound requests from the internet (e.g., NGINX, HAProxy, Envoy, AWS ALB). The client does not know which internal server instance ultimately processes the request; the client only communicates with the reverse proxy as the single entry point.

**Q: What is TLS Termination, and why do we terminate TLS at the reverse proxy instead of on application servers?**

TLS termination is the practice of completing the SSL/TLS cryptographic handshake and decrypting the incoming ciphertext stream at the reverse proxy boundary. 

We terminate TLS at the proxy for three primary reasons:
1. *Cryptographic Offloading:* TLS handshakes rely on heavy asymmetric mathematical computations (like RSA or elliptic curve cryptography). Specialized proxies written in C/C++ handle these operations with extreme efficiency, saving 20–30% CPU overhead on application servers.
2. *Operational Simplicity:* Managing SSL/TLS certificates and automated renewals (such as Let's Encrypt ACME challenges) on a single proxy or load balancer cluster avoids having to synchronize certificates and private keys across dozens of ephemeral container pods.
3. *Inspection and Routing:* An application-layer (Layer 7) reverse proxy must decrypt the HTTP envelope to inspect headers, cookies, and URL paths for intelligent routing and security filtering.

**Q: How does a reverse proxy protect application servers against Slowloris attacks?**

A Slowloris attack opens hundreds of HTTP connections to a server and transmits HTTP request headers at an agonizingly slow pace (e.g., one byte every 10 seconds), never completing the request. In thread-per-connection or event-loop backend architectures (like Apache, Gunicorn, or Node.js), this exhausts connection pools and worker processes.

A reverse proxy like NGINX uses an asynchronous, non-blocking I/O model (via Linux `epoll`) that can hold tens of thousands of simultaneous slow connections with virtually zero CPU and minimal memory overhead. When configured with `proxy_buffering on`, the proxy patiently buffers the entire HTTP request headers and body before opening an upstream socket to the backend application. The backend only receives requests that are 100% complete, processing them in milliseconds and avoiding thread starvation.

**Q: Why does a backend application see `127.0.0.1` or a private IP for all users when deployed behind a reverse proxy, and how is it resolved?**

Because the client establishes a TCP connection to the reverse proxy, and the reverse proxy establishes a separate, new TCP connection to the backend application, the TCP socket source IP observed by the backend kernel is the proxy's IP address.

To resolve this, the reverse proxy must inject headers containing the original client address: `X-Forwarded-For: <client-ip>` and `X-Real-IP: <client-ip>`. In addition, the backend framework must be explicitly configured to trust those headers (such as `app.set('trust proxy', 1)` in Express or setting `forwarded_allow_ips` in Uvicorn/FastAPI). If the backend is not configured to trust upstream headers, it ignores them to prevent IP spoofing attacks.

**Q: What is the operational difference between a 502 Bad Gateway and a 504 Gateway Timeout error?**

Both errors are generated and returned to the client by the reverse proxy, not the application server:
- **502 Bad Gateway:** The reverse proxy attempted to connect to the upstream backend server, but the backend refused the connection (e.g., the backend process crashed, the port is closed, or the backend immediately sent a TCP RST or invalid HTTP response).
- **504 Gateway Timeout:** The reverse proxy successfully established a connection to the upstream backend server and forwarded the request, but the backend failed to return an HTTP response within the proxy's configured timeout window (`proxy_read_timeout`). This usually indicates slow database queries, deadlocks, or blocked event loops in the application code.

**Q: What is the difference between a Layer 4 and a Layer 7 reverse proxy, and when should you choose each?**

A Layer 4 proxy operates at the transport layer (TCP/UDP). It routes raw packets based on IP address and port without parsing the application protocol. It cannot read HTTP headers, modify cookies, or route by URL path, but it delivers massive packet throughput with sub-millisecond latency. Choose Layer 4 for high-throughput database replication, real-time gaming, VoIP, or as an edge balancer in front of a cluster of Layer 7 proxies.

A Layer 7 proxy operates at the application layer (HTTP/HTTPS/gRPC). It fully parses the protocol stream, enabling TLS termination, path-based routing (`/api` vs `/static`), header injection, cookie inspection, compression, and authentication validation. Choose Layer 7 for modern microservice architectures, API gateways, and web applications.

## 6. The Traps — What Goes Wrong

**Trap 1: Blindly Trusting `X-Forwarded-For` and Permitting IP Spoofing**

If your backend unconditionally reads the leftmost IP in the `X-Forwarded-For` header without configuring proxy trust boundaries, an attacker can send a raw request with a forged header: `X-Forwarded-For: 1.1.1.1`. If your proxy appends the real IP to create `X-Forwarded-For: 1.1.1.1, <attacker-ip>`, and your backend naively splits by comma and picks the first entry, the attacker successfully bypasses IP-based rate limits and geo-fencing. 

*The Fix:* In Express, set `app.set('trust proxy', 1)` so the framework counts hops backward from the rightmost (trusted proxy) connection, or configure your reverse proxy to overwrite `X-Real-IP` with `$remote_addr`.

**Trap 2: The NGINX `proxy_pass` Trailing Slash Route Mutation**

In NGINX, placing a trailing slash at the end of a `proxy_pass` URI completely alters path forwarding behavior:
```nginx
# CASE A: No trailing slash on proxy_pass
location /api/ {
    proxy_pass http://backend:3000;
}
# Request to "/api/v1/users" is forwarded as "/api/v1/users"

# CASE B: Trailing slash present on proxy_pass
location /api/ {
    proxy_pass http://backend:3000/;
}
# Request to "/api/v1/users" STRIPS "/api/" and is forwarded as "/v1/users"
```
Developers frequently lose hours debugging 404 errors caused by an accidental trailing slash that strips the matched URI prefix.

**Trap 3: Disabling Request Buffering on Single-Threaded Runtimes**

Turning off request buffering (`proxy_buffering off;` or `proxy_request_buffering off;`) to stream file uploads directly to backend applications exposes single-threaded or worker-limited servers (Node.js, Flask, Django) directly to slow network transfer rates. A 100MB file uploaded over 3G locks an application worker thread for 5 minutes.

*The Fix:* Leave request buffering enabled at the proxy, upload large assets directly to S3/Cloud Storage using pre-signed URLs, or use dedicated streaming gateway runtimes for multipart uploads.

**Trap 4: Silent Header Dropping (Underscore Headers)**

By default, NGINX silently drops any HTTP header containing underscores (e.g., `auth_token: xyz` or `custom_user_id: 123`) to prevent namespace collisions with CGI environment variables. 

*The Fix:* Always use standard hyphenated HTTP headers (e.g., `X-Auth-Token`, `X-Custom-User-Id`), or explicitly enable `underscores_in_headers on;` in your NGINX HTTP block.

**Trap 5: Timeout Mismatches and Zombie Backend Execution**

If your reverse proxy has a read timeout of 10 seconds (`proxy_read_timeout 10s;`), but your backend database query takes 25 seconds to execute, the proxy will cut the connection and return a `504 Gateway Timeout` to the client at second 10. However, the backend server often continues executing the expensive 25-second database query to completion, wasting database CPU and memory on an orphaned response that no client will ever receive.

*The Fix:* Align proxy read timeouts with backend request abort handlers, or use cancellation propagation (such as `req.on('close')` in Node.js or `context.Context` cancellation in Go) to terminate backend queries when the proxy closes the downstream connection.

## 7. Compare With Related Concepts

| Architecture Concept | Primary Boundary | Layer | Core Problem It Solves | Key Distinction |
| :--- | :--- | :--- | :--- | :--- |
| **Reverse Proxy** | Sits in front of servers | L4 / L7 | Perimeter protection, TLS offload, request routing, client buffering | Protects and unifies backend servers; client thinks proxy is the origin. |
| **Forward Proxy** | Sits in front of clients | L4 / L7 | Outbound filtering, employee monitoring, VPN privacy, client caching | Protects and anonymizes client devices; server sees proxy IP, not user IP. |
| **API Gateway** | Sits between clients & microservices | L7 | Auth token verification, rate limiting policies, API versioning, orchestration | A specialized reverse proxy that executes application-level business logic. |
| **Load Balancer (L4)** | Sits at infrastructure edge | L4 (TCP/UDP)| Distributes raw network packets across server pools with maximum throughput | Operates on IP/port packets without inspecting HTTP payloads or URL paths. |
| **CDN (Content Delivery Network)** | Geographically distributed edge network | L7 | Low-latency caching of static/dynamic content close to global users | A globally distributed reverse proxy cluster with edge storage and caching. |

**Decision Rules:**
- Use a **Reverse Proxy** when you need a resilient entry point to handle TLS termination, request buffering, and path routing for one or more backend applications.
- Use a **Forward Proxy** when you need to inspect, restrict, or route outbound traffic originating from internal clients out to the public internet.
- Use an **API Gateway** when your routing logic requires application-layer intelligence such as JWT validation, payload transformation, or per-user rate limit tiers.
- Use a **CDN** when your assets or API responses must be cached geographically close to users across the globe to reduce network latency.

## 8. 🧠 The Memory Hook

A forward proxy is a **trench coat for the client** (hides who is asking). A reverse proxy is a **concierge for the server** (shields who is answering, checks coats at the door, and directs traffic to the right room).
