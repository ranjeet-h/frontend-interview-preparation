# Load Balancing: Algorithms, Health Checking, and Layer 4 vs Layer 7 Routing

## 1. Why This Exists — The Problem First

Picture launching a major marketing campaign or surviving a Black Friday traffic surge. To prepare, your team deploys four identical backend API servers. But your domain's DNS record (`api.example.com`) directly maps to the single IP address of Server 1.

The moment traffic spikes, Server 1's CPU hits 100%, its memory fills up, the Node.js event loop blocks, and it begins dropping incoming TCP connections with timeouts. Meanwhile, Servers 2, 3, and 4 sit completely idle at 0.5% CPU utilization because no traffic ever reaches them.

When Server 1 inevitably crashes under the load, your entire platform goes dark. Because client browsers and ISP recursive resolvers cache DNS records for minutes to hours (based on TTL), updating your DNS record to point to Server 2 takes agonizingly long to propagate across the globe. Thousands of users continue hammering the dead IP address. Furthermore, every single software update requires taking Server 1 offline, forcing scheduled downtime.

Without an intelligent traffic distributor sitting between your clients and your compute nodes, you have no horizontal scalability, zero high availability, and no way to deploy software updates without breaking active user requests. A load balancer exists to solve these three critical problems.

## 2. The Analogy — Make It Obvious

Think of an international airport security checkpoint.

Imagine an airport terminal where arriving passengers rush directly toward 10 individual X-ray scanner lanes. Without any coordination, a family traveling with 10 heavy suitcases crowds into Lane 1, causing a 45-minute jam, while Lane 5 next to it sits completely empty with security officers waiting idly.

To prevent this chaos, the airport places a unified entrance with a **Chief Queue Dispatcher** standing at the front:

- **The Arriving Passengers:** Incoming client HTTP requests.
- **The 10 Security Screening Lanes:** Your pool of backend application servers.
- **The Chief Queue Dispatcher:** The Load Balancer.

The dispatcher holds all arriving passengers in a quick staging area and distributes them intelligently:

- **Round Robin:** The dispatcher directs Passenger 1 to Lane 1, Passenger 2 to Lane 2, and Passenger 3 to Lane 3, regardless of how much luggage each passenger carries.
- **Least Connections:** The dispatcher looks at the physical lines and sends the next passenger to whichever lane currently has the fewest people standing in it.
- **Weighted Routing:** Lane 3 has a high-speed 3D scanner that processes twice as fast as the older machines. The dispatcher sends two passengers to Lane 3 for every one passenger sent to Lane 1.
- **Health Checks:** If the X-ray belt in Lane 4 jams or the officer steps away, Lane 4 flips a red warning light. The dispatcher immediately stops routing passengers to Lane 4. Once the belt is fixed and passes three consecutive test scans (the healthy threshold), the dispatcher resumes sending passengers there.

Now consider the difference between a **Layer 4** and a **Layer 7** dispatcher:

- **A Layer 4 Dispatcher:** Looks only at the color of your boarding pass barcode (standard passenger vs. flight crew / TCP port and IP) and points you to a lane in 0.1 seconds without opening your luggage. It is blazing fast and handles thousands of people per minute, but cannot see what you are carrying.
- **A Layer 7 Dispatcher:** Stops you, opens your itinerary, inspects your ticket class, checks your luggage contents, and routes oversized musical instruments to a specialized inspection scanner (`/api/upload`) and first-class ticket holders to VIP priority lanes (`/api/checkout`). It takes slightly more time per passenger, but enables sophisticated routing logic.

## 3. How It Actually Works — The Full Explanation

A load balancer acts as a reverse proxy sitting at the edge of your infrastructure. It presents a single Virtual IP address (VIP) or public domain to the outside world, receives client traffic, selects an optimal backend instance from a registered server pool, forwards the request, and relays the response back to the client.

```txt
                       ┌──────────────────────────────────────────────┐
                       │                LOAD BALANCER                 │
                       │  - SSL Termination                           │
                       │  - Health Checking (/healthz)                │
                       │  - Algorithm: Least Connections / Hash       │
                       └──────┬───────────────┬───────────────┬───────┘
                              │               │               │
                     Forward  │       Forward │       Forward │
                     Request  │       Request │       Request │
                              ▼               ▼               ▼
                        ┌───────────┐   ┌───────────┐   ┌───────────┐
                        │ Backend A │   │ Backend B │   │ Backend C │
                        │  (Healthy)│   │  (Healthy)│   │ (Unhealthy│
                        │ 2 Conn    │   │ 8 Conn    │   │  - NO TRAFFIC)
                        └───────────┘   └───────────┘   └───────────┘
```

### Layer 4 (Transport Layer) vs Layer 7 (Application Layer) Load Balancing

Load balancers operate primarily at two distinct layers of the OSI model:

#### Layer 4 Load Balancing (L4 — Transport Layer)
- **Protocols:** TCP, UDP, TLS passthrough.
- **Examples:** AWS Network Load Balancer (NLB), Linux IPVS, HAProxy (TCP mode), F5 BIG-IP.
- **How It Works:** L4 load balancers make routing decisions at the packet level using only the source IP, source port, destination IP, destination port, and protocol (TCP/UDP). They do not inspect application-layer payloads or decrypt HTTP/HTTPS data.
- **Packet Forwarding Techniques:**
  - *Network Address Translation (NAT):* The LB rewrites the destination IP of incoming packets to the backend's IP, and rewrites the source IP on response packets back to the LB's IP.
  - *Direct Server Return (DSR):* The LB forwards incoming packets to backends without modifying the client source IP, and backend servers send responses directly back to the client over the internet, completely bypassing the load balancer on egress. This unlocks massive throughput for media streaming and downloads.
- **Strengths:** Ultra-high throughput (millions of requests per second), sub-millisecond latency, minimal CPU and memory consumption.
- **Limitations:** Cannot inspect URLs, headers, or cookies; cannot perform path-based routing (e.g., routing `/auth` to an auth service and `/orders` to an order service); cannot terminate TLS while performing application-level inspection.

#### Layer 7 Load Balancing (L7 — Application Layer)
- **Protocols:** HTTP, HTTPS, HTTP/2, HTTP/3, WebSockets, gRPC.
- **Examples:** AWS Application Load Balancer (ALB), NGINX, Envoy, Traefik, HAProxy (HTTP mode), Cloudflare.
- **How It Works:** L7 load balancers terminate the incoming client TCP and TLS connection, fully parse the HTTP request (URL path, headers, query parameters, cookies, request body), and make routing decisions based on the content. They open a separate backend TCP/HTTP connection to the chosen server.
- **Capabilities:**
  - *Path-based routing:* Route `/api/v1/users` to the User Service and `/api/v1/payments` to the Payment Service.
  - *Host-based routing:* Route `api.example.com` to backend APIs and `static.example.com` to object storage.
  - *Header and cookie routing:* Route mobile clients (`User-Agent: iOS`) to optimized endpoints, or canary users (`Cookie: beta=true`) to a newly deployed staging pool.
  - *TLS Termination & Offloading:* Decrypt SSL/TLS at the load balancer, relieving backend application instances of expensive cryptographic CPU overhead.
  - *Header Enrichment:* Inject `X-Forwarded-For` (client IP), `X-Forwarded-Proto` (https/http), and `X-Request-ID` (distributed tracing).
- **Trade-offs:** Higher CPU and memory footprint, higher latency per request (due to full packet reassembly, TLS decryption, and proxying).

### Load Balancing Algorithms and Trade-offs

The algorithm determines how the load balancer picks the next target from a pool of healthy servers:

1. **Round Robin & Weighted Round Robin:**
   - *Mechanic:* Iterates sequentially through the list of servers (`server[i = (i + 1) % N]`). Weighted Round Robin assigns an integer weight to each server (e.g., Server A = 3, Server B = 1), sending three requests to Server A for every one request to Server B.
   - *Best For:* Homogeneous server pools where all requests take roughly the same amount of time to execute (e.g., serving static assets or uniform read queries).
   - *Limitation:* Performs poorly when request processing times vary significantly (e.g., one request takes 10ms, while another takes 8,000ms generating a PDF report).

2. **Least Connections & Weighted Least Connections:**
   - *Mechanic:* Tracks the number of active, in-flight connections per backend and routes new requests to the instance currently servicing the fewest active connections.
   - *Best For:* Dynamic workloads with variable request durations, long-lived connections (WebSockets, SSE), or database-heavy endpoints where some queries hold connections longer than others.
   - *Why It Wins in Modern Systems:* It naturally balances out slow or struggling nodes without requiring explicit latency tracking.

3. **IP Hash & Consistent Hashing:**
   - *Mechanic:* Hashes the client's IP address (`hash(client_ip) % N`) or a session token to deterministically assign the client to a specific server.
   - *Consistent Hashing:* Maps both servers and request keys onto a virtual hash ring (0 to $2^{32}-1$). When a server is added or removed from the pool, only $1/N$ of the keys need to be reassigned to a different server, rather than remapping 100% of keys as standard modulo hashing does.
   - *Best For:* Stateful caching layers (e.g., Redis / Memcached clusters, in-memory API caching) where maintaining cache locality on specific nodes is crucial.

4. **Least Response Time (Latency-Based Routing):**
   - *Mechanic:* Combines the number of active connections with the running average response time (TTFB / Round Trip Time) of each backend server to direct traffic to the fastest-responding node.
   - *Best For:* Geographically distributed backends or heterogeneous server clusters where network jitter or hardware differences make some instances significantly faster than others.

### Health Checking Mechanics

A load balancer is only as good as its health checker. If a server dies and the load balancer continues forwarding traffic to it, users experience widespread connection drops.

```txt
Load Balancer                   Backend Server
     │                                │
     ├─────── GET /healthz ──────────►│  (Poll every 5s)
     │◄────── 200 OK (50ms) ──────────┤  (Success 1/3)
     │                                │
     ├─────── GET /healthz ──────────►│
     │◄────── 200 OK (45ms) ──────────┤  (Success 2/3)
     │                                │
     ├─────── GET /healthz ──────────►│
     │◄────── 200 OK (40ms) ──────────┤  (Success 3/3 -> MARK HEALTHY)
     │                                │
  === CRASH / OUTAGE OCCURS ON BACKEND ===
     │                                │
     ├─────── GET /healthz ──────────►│
     │        [Timeout 2000ms]        │  (Failure 1/2)
     │                                │
     ├─────── GET /healthz ──────────►│
     │◄────── 500 Internal Error ─────┤  (Failure 2/2 -> MARK UNHEALTHY & EJECT)
```

- **Active Health Checks (Synthetic Polling):**
  The load balancer periodically issues out-of-band HTTP requests (e.g., `GET /healthz`) or TCP handshakes to every registered instance. If an instance responds with HTTP 200–299 within the timeout window (e.g., 2000ms), the check passes.
- **Passive Health Checks (Outlier Detection / Circuit Breaking):**
  The load balancer monitors live client traffic flowing through each instance. If an instance returns a burst of 502/503/504 errors or triggers TCP connection resets on live user requests, the load balancer immediately ejects that instance from the pool for a cool-down period.
- **Thresholds to Prevent Flapping:**
  To prevent a flapping server (a server that crashes, reboots, immediately gets overwhelmed, and crashes again) from rapidly entering and leaving the pool, load balancers enforce consecutive thresholds:
  - `Unhealthy Threshold (e.g., 2)`: Must fail two consecutive checks before being removed from the pool.
  - `Healthy Threshold (e.g., 3)`: Must pass three consecutive checks before receiving production traffic.
- **Shallow vs. Deep Health Checks:**
  - *Shallow Check:* Verifies that the local process and event loop are responsive (`/healthz` returns `{"status":"ok"}` immediately).
  - *Deep Check:* Executes database queries, cache lookups, and downstream service calls. **Warning:** Deep health checks can cause cascading cluster failures if a shared database slows down, causing all app servers to fail health checks simultaneously!

### Sticky Sessions (Session Affinity)

Sticky sessions instruct the load balancer to route all subsequent requests from a specific user to the exact same backend server that served their first request.

- **Cookie-Based Affinity (L7):** The load balancer inspects incoming requests. On the first request, it selects a backend and injects a set-cookie header (e.g., `AWSALB=server-01-hash; Path=/; HttpOnly`). On subsequent requests, the client includes this cookie, and the load balancer routes directly to `server-01`.
- **Trade-offs:**
  - *Advantage:* Allows legacy applications that store session data in local server RAM (e.g., in-memory session objects) to function across multiple servers.
  - *Disadvantage:* Causes severe load imbalances (hot-spotting). If one server receives several heavy users, it cannot offload them.
  - *Failure Impact:* When a server crashes or restarts during a deployment, all users pinned to that server lose their session state and are forcefully logged out.
- **The Modern Standard:** Build completely **stateless backends**. Store session tokens in an external distributed cache (Redis) or use signed JWTs so any backend server can fulfill any request.

### High Availability of the Load Balancer Itself

If all traffic flows through the load balancer, what happens when the load balancer machine itself crashes or suffers a hardware failure?

1. **Virtual IP (VIP) Failover with VRRP / Keepalived:**
   Two load balancers (Primary and Standby) share a single floating Virtual IP address. They communicate via the Virtual Router Redundancy Protocol (VRRP). The Primary sends periodic heartbeats. If the Primary fails, the Standby detects the missing heartbeat within milliseconds, claims the VIP using Gratuitous ARP (GARP), and continues routing traffic with zero client-visible downtime.
2. **DNS Anycast & BGP Routing:**
   In large-scale cloud providers and CDNs (Cloudflare, AWS Route 53), multiple load balancers in different data centers worldwide announce the exact same IP address via Border Gateway Protocol (BGP). Internet routers automatically route client packets to the topologically closest healthy load balancer.
3. **Multi-AZ Active-Active Pairs:**
   Cloud load balancers (such as AWS ALB/NLB) automatically provision redundant controller nodes across multiple Availability Zones, backed by redundant DNS A-records that distribute traffic across all active load balancer nodes.

## 4. Real Code — See It Working

Below is a complete, production-grade Layer 7 HTTP Load Balancer implemented in Node.js using native modules. It demonstrates:
- **Round Robin** and **Least Connections** selection algorithms.
- **Active Health Checking** with configurable intervals, timeouts, and consecutive failure/success thresholds.
- **In-flight request tracking** (`activeConnections`) for least-connection routing.
- **Header enrichment** (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`).
- **A runnable test harness** that spins up three backend servers (including a simulated crashing server) to demonstrate health check eviction and failover.

```javascript
// load-balancer.js
// Run with: node load-balancer.js

const http = require('node:http');
const url = require('node:url');

class Layer7LoadBalancer {
  /**
   * @param {Object} options
   * @param {Array<{host: string, port: number, weight?: number}>} options.backends
   * @param {'round-robin' | 'least-connections'} options.algorithm
   * @param {number} options.healthCheckIntervalMs
   * @param {number} options.healthCheckTimeoutMs
   * @param {number} options.healthyThreshold
   * @param {number} options.unhealthyThreshold
   */
  constructor(options) {
    this.algorithm = options.algorithm || 'least-connections';
    this.healthCheckIntervalMs = options.healthCheckIntervalMs || 3000;
    this.healthCheckTimeoutMs = options.healthCheckTimeoutMs || 1500;
    this.healthyThreshold = options.healthyThreshold || 2;
    this.unhealthyThreshold = options.unhealthyThreshold || 2;

    // Internal pool tracking
    this.backends = options.backends.map((b, index) => ({
      id: `backend-${index + 1}`,
      host: b.host,
      port: b.port,
      weight: b.weight || 1,
      isHealthy: true,
      activeConnections: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      totalRequestsServed: 0,
    }));

    this.rrIndex = 0; // Pointer for Round Robin
    this.healthCheckTimer = null;
  }

  /**
   * Selects the next available healthy backend instance based on the configured algorithm.
   * @returns {Object | null}
   */
  selectBackend() {
    const healthyBackends = this.backends.filter((b) => b.isHealthy);
    if (healthyBackends.length === 0) {
      return null;
    }

    if (this.algorithm === 'round-robin') {
      // Round Robin algorithm
      const selected = healthyBackends[this.rrIndex % healthyBackends.length];
      this.rrIndex = (this.rrIndex + 1) % healthyBackends.length;
      return selected;
    }

    if (this.algorithm === 'least-connections') {
      // Least Connections algorithm: pick backend with minimum active in-flight requests
      let minBackend = healthyBackends[0];
      for (let i = 1; i < healthyBackends.length; i++) {
        if (healthyBackends[i].activeConnections < minBackend.activeConnections) {
          minBackend = healthyBackends[i];
        }
      }
      return minBackend;
    }

    return healthyBackends[0];
  }

  /**
   * Proxies an incoming client HTTP request to the selected upstream backend.
   */
  handleRequest(clientReq, clientRes) {
    const target = this.selectBackend();

    if (!target) {
      // All backend servers are down or failing health checks
      clientRes.writeHead(503, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'Service Unavailable: No healthy backends' }));
      return;
    }

    // Increment active connection count for Least Connections tracking
    target.activeConnections++;
    target.totalRequestsServed++;

    const clientIp = clientReq.socket.remoteAddress || '';
    const existingXff = clientReq.headers['x-forwarded-for'];
    const xForwardedFor = existingXff ? `${existingXff}, ${clientIp}` : clientIp;

    const proxyHeaders = {
      ...clientReq.headers,
      'x-forwarded-for': xForwardedFor,
      'x-forwarded-proto': 'http',
      'x-forwarded-host': clientReq.headers.host || '',
      'x-routed-backend': target.id,
    };

    const proxyReqOptions = {
      host: target.host,
      port: target.port,
      path: clientReq.url,
      method: clientReq.method,
      headers: proxyHeaders,
      timeout: 5000,
    };

    // Forward the request to the upstream target
    const proxyReq = http.request(proxyReqOptions, (backendRes) => {
      // Forward the backend response headers and status code back to client
      clientRes.writeHead(backendRes.statusCode, backendRes.headers);

      // Stream the response body
      backendRes.pipe(clientRes);

      backendRes.on('end', () => {
        target.activeConnections = Math.max(0, target.activeConnections - 1);
      });
    });

    // Handle upstream socket errors (e.g. backend aborted connection during request)
    proxyReq.on('error', (err) => {
      target.activeConnections = Math.max(0, target.activeConnections - 1);
      console.error(`[LB] Error proxying to ${target.id} (${target.port}): ${err.message}`);

      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ error: 'Bad Gateway: Upstream failure' }));
      }
    });

    // Stream the incoming client request body to the upstream backend
    clientReq.pipe(proxyReq);
  }

  /**
   * Active Health Check loop that polls /healthz on every registered backend.
   */
  startHealthChecks() {
    const runCheck = () => {
      this.backends.forEach((backend) => {
        const checkOptions = {
          host: backend.host,
          port: backend.port,
          path: '/healthz',
          method: 'GET',
          timeout: this.healthCheckTimeoutMs,
        };

        const req = http.request(checkOptions, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            backend.consecutiveSuccesses++;
            backend.consecutiveFailures = 0;

            // Mark healthy if consecutive success threshold reached
            if (!backend.isHealthy && backend.consecutiveSuccesses >= this.healthyThreshold) {
              backend.isHealthy = true;
              console.log(`[HEALTH CHECK] ${backend.id} (${backend.port}) RECOVERED -> MARKED HEALTHY`);
            }
          } else {
            this._handleHealthFailure(backend, `HTTP status ${res.statusCode}`);
          }
          res.resume(); // Consume stream to free memory
        });

        req.on('timeout', () => {
          req.destroy();
          this._handleHealthFailure(backend, 'Request Timeout');
        });

        req.on('error', (err) => {
          this._handleHealthFailure(backend, err.message);
        });

        req.end();
      });
    };

    // Run initial health check immediately, then schedule periodic interval
    runCheck();
    this.healthCheckTimer = setInterval(runCheck, this.healthCheckIntervalMs);
  }

  _handleHealthFailure(backend, reason) {
    backend.consecutiveFailures++;
    backend.consecutiveSuccesses = 0;

    // Mark unhealthy if consecutive failure threshold reached
    if (backend.isHealthy && backend.consecutiveFailures >= this.unhealthyThreshold) {
      backend.isHealthy = false;
      console.warn(`[HEALTH CHECK] ${backend.id} (${backend.port}) FAILED (${reason}) -> EJECTED FROM POOL`);
    }
  }

  stop() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
}

// ==========================================
// TEST HARNESS & DEMO
// ==========================================

function createMockServer(id, port, behavior = 'healthy') {
  return new Promise((resolve) => {
    let state = behavior; // 'healthy', 'slow', or 'failing'

    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);

      // Health check endpoint
      if (parsedUrl.pathname === '/healthz') {
        if (state === 'failing') {
          res.writeHead(500);
          return res.end('UNHEALTHY');
        }
        res.writeHead(200);
        return res.end('OK');
      }

      // Endpoint to dynamically trigger failure for demo
      if (parsedUrl.pathname === '/simulate-crash') {
        state = 'failing';
        res.writeHead(200);
        return res.end(`${id} set to FAILING state`);
      }

      // Normal application endpoint
      const delay = state === 'slow' ? 200 : 20;
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          server: id,
          port: port,
          handledPath: req.url,
          receivedXff: req.headers['x-forwarded-for'],
        }));
      }, delay);
    });

    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

async function runDemo() {
  console.log('=== Starting 3 Upstream Backend Servers ===');
  await createMockServer('backend-1 (Normal)', 8001, 'healthy');
  await createMockServer('backend-2 (Normal)', 8002, 'healthy');
  await createMockServer('backend-3 (Simulated Crash)', 8003, 'healthy');

  console.log('Backends running on ports 8001, 8002, and 8003.\n');

  const lb = new Layer7LoadBalancer({
    algorithm: 'least-connections',
    backends: [
      { host: '127.0.0.1', port: 8001 },
      { host: '127.0.0.1', port: 8002 },
      { host: '127.0.0.1', port: 8003 },
    ],
    healthCheckIntervalMs: 2000,
    healthCheckTimeoutMs: 1000,
    healthyThreshold: 2,
    unhealthyThreshold: 2,
  });

  const lbServer = http.createServer((req, res) => {
    lb.handleRequest(req, res);
  });

  lbServer.listen(8000, '127.0.0.1', async () => {
    console.log('=== Load Balancer listening on http://127.0.0.1:8000 ===\n');
    lb.startHealthChecks();

    // Helper to send HTTP requests to LB
    const sendRequest = (reqNum) => new Promise((resolve) => {
      http.get('http://127.0.0.1:8000/api/users', (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          console.log(`Req #${reqNum} -> Status: ${res.statusCode} | Handled by: ${res.headers['x-routed-backend']}`);
          resolve();
        });
      });
    });

    // 1. Send initial batch of requests (distributed across all 3)
    console.log('--- Phase 1: Sending 6 requests across all healthy servers ---');
    for (let i = 1; i <= 6; i++) {
      await sendRequest(i);
    }

    // 2. Trigger crash on backend-3
    console.log('\n--- Phase 2: Simulating crash on backend-3 (Port 8003) ---');
    await new Promise((resolve) => {
      http.get('http://127.0.0.1:8003/simulate-crash', resolve);
    });

    // Wait for health check loop to detect failure and eject backend-3
    console.log('Waiting 5 seconds for health checker to eject backend-3...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 3. Send second batch of requests (only routed to backend-1 and backend-2)
    console.log('\n--- Phase 3: Sending 6 requests after backend-3 ejection ---');
    for (let i = 7; i <= 12; i++) {
      await sendRequest(i);
    }

    console.log('\n=== Demo Complete: Flawless Failover Verified ===');
    process.exit(0);
  });
}

// Uncomment to run directly:
// runDemo();

module.exports = { Layer7LoadBalancer };
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between Layer 4 and Layer 7 load balancing, and when would you choose one over the other?**

Layer 4 (L4) operates at the transport layer (TCP/UDP). It does not decrypt or parse application data; it routes raw packets based solely on IP addresses and TCP/UDP port tuples using techniques like NAT or Direct Server Return (DSR). Because it avoids payload inspection, L4 delivers extreme throughput (millions of packets per second) with sub-millisecond latency and minimal CPU consumption.

Layer 7 (L7) operates at the application layer. It terminates TCP and TLS connections, parses HTTP/HTTPS headers, cookies, URL paths, and payloads, and opens separate connections to backend targets. This unlocks intelligent capabilities like path-based microservice routing (`/users` vs. `/orders`), cookie-based sticky sessions, header manipulation (`X-Forwarded-For`), and WAF security filtering, but at the cost of higher CPU, memory, and latency overhead.

You choose Layer 4 for high-throughput packet routing, gaming UDP servers, massive database connection proxies, or when raw networking speed is the primary constraint (e.g., AWS NLB at the outer perimeter). You choose Layer 7 for web applications, microservice API gateways, and systems requiring path routing, SSL termination, and cookie management (e.g., AWS ALB or NGINX).

---

**Q: Why does Round Robin fail in production workloads with mixed request durations, and how does Least Connections solve this?**

Round Robin distributes requests strictly by turn (`request_count % N`), under the flawed assumption that all requests cost the same amount of time and compute.

In real-world applications, request durations vary drastically:
- Request A is a cached user profile fetch taking 5 milliseconds.
- Request B is a complex financial report generation taking 7,000 milliseconds.

If Server 1 happens to receive three heavy 7-second requests in a row, its CPU saturates and its connection thread pool fills up. If the load balancer uses Round Robin, it blindly sends Request #4 to Server 1 anyway, pushing it into an unresponsive state and dropping connections.

Least Connections solves this by maintaining an active counter of in-flight open connections for each backend. When a new request arrives, it directs it to the server with the fewest active connections. If Server 1 is bogged down with 3 long-running tasks while Server 2 has 0 active connections, the next request automatically goes to Server 2, creating self-balancing traffic distribution.

---

**Q: What is the danger of putting database or downstream dependency queries inside your load balancer health check endpoint?**

Putting downstream dependencies (e.g., executing `SELECT 1 FROM users` or checking Redis) inside your primary HTTP health check endpoint (`/healthz`) creates a fatal vulnerability known as a **cascading outage death spiral**.

Here is what happens in production:
1. Your database experiences a brief spike in write load or a table lock, causing query latencies to jump from 2ms to 2,500ms.
2. The load balancer polls `/healthz` on Server 1, Server 2, and Server 3. Because the database query inside `/healthz` exceeds the health check timeout (e.g., 2,000ms), all three servers fail their checks.
3. The load balancer assumes all three app servers are dead and removes all of them from the routing pool.
4. The entire website immediately returns 503 Service Unavailable to 100% of global users, even though all your Node.js application servers were completely healthy and capable of serving cached or non-database requests.

The correct architectural pattern is to split health checks into two distinct concepts:
- **Liveness Probe (Load Balancer Target):** A lightweight, shallow check that confirms the local process is alive, listening on the socket, and not deadlocked. It touches zero external dependencies.
- **Readiness / Dependency Probe:** Used internally for monitoring dashboards, alerts, and graceful service startup checks, but never as an automatic trigger for sudden load balancer pool ejection.

---

**Q: What is Connection Draining (Graceful Deregistration) and why is it critical during deployments?**

When deploying new code or scaling down an auto-scaling group, backend instances must be stopped and replaced. Without connection draining, the deployment runner instantly terminates the old container or VM. Any client with an active, in-flight HTTP request (such as a 3-second file upload or a credit card payment authorization) immediately has their TCP socket severed, resulting in broken transactions and 502 Bad Gateway errors.

**Connection Draining (or Graceful Deregistration)** prevents this via a three-phase shutdown:
1. **Deregistration:** When an instance is marked for termination, the load balancer immediately stops sending new incoming requests to that instance.
2. **Draining Window:** The load balancer allows a configured grace period (e.g., 30 to 60 seconds) for existing in-flight connections to complete their work and cleanly return responses to clients.
3. **Termination:** Once active connections reach zero (or the draining timeout expires), the container/VM is safely shut down.

---

**Q: How do you prevent the Load Balancer itself from becoming a single point of failure (SPOF)?**

Placing all traffic behind a single load balancer server introduces a single point of failure. Modern architectures eliminate this through redundancy at multiple layers:

1. **Active-Passive High Availability with Virtual IP (VRRP / Keepalived):** Two load balancer nodes share a single floating Virtual IP. Node 1 is Active; Node 2 is Standby. If Node 1's hardware fails, Node 2 detects the heartbeat loss and claims the VIP via Gratuitous ARP in milliseconds.
2. **DNS Round Robin / Multi-AZ:** Cloud load balancers (AWS ALB/NLB) provision multiple controller instances across separate physical Availability Zones (AZs). The public DNS name resolves to multiple A-records (one per AZ), so client traffic is distributed across distinct physical data centers.
3. **BGP Anycast Routing:** Edge load balancers worldwide advertise the exact same IP address via Border Gateway Protocol. If a data center in London goes offline, internet transit providers automatically route packets to the next closest healthy point of presence (e.g., Frankfurt) at the network routing layer.

---

**Q: How does Consistent Hashing work, and why is it superior to standard modulo hashing (`hash(key) % N`) when scaling server pools?**

With naive modulo hashing, a client request key or IP is mapped to a server using `server_index = hash(key) % N`, where $N$ is the number of servers.
- If you have 4 servers ($N = 4$), a key with hash 17 maps to Server 1 (`17 % 4 = 1`).
- If one server dies or you scale up to 5 servers ($N = 5$), the same key now maps to Server 2 (`17 % 5 = 2`).

In modulo hashing, adding or removing a single node causes almost **100% of all existing keys to remap to different servers**, destroying cache hit rates and causing a massive cache stampede across the entire cluster.

**Consistent Hashing** solves this by mapping both the servers and the request keys onto a 360-degree circular ring (from $0$ to $2^{32} - 1$):
1. Servers are hashed by their identifier and placed at specific positions on the ring.
2. To balance the distribution, each physical server is assigned multiple **virtual nodes** (e.g., 100 points on the ring).
3. When a request arrives, its key is hashed to find its position on the ring. The request is routed to the first server encountered moving clockwise along the ring.
4. When a server is added or removed, **only $1/N$ of keys are moved** to adjacent nodes on the ring. All other client mappings remain completely untouched.

---

**Q: What are Sticky Sessions, and why are they considered a scalability anti-pattern in modern architectures?**

Sticky sessions (session affinity) force the load balancer to route all subsequent HTTP requests from a specific user to the same backend server that handled their initial request, typically by setting an encrypted tracking cookie (like `AWSALB`).

While sticky sessions allow legacy stateful applications (which store user login state or shopping carts in local server memory) to work across multiple nodes, they are considered an anti-pattern in modern cloud architectures for three reasons:
1. **Severe Load Imbalance (Traffic Skew):** If a high-volume user (e.g., a batch processing script, a large corporate office behind a single NAT proxy, or a web scraper) gets pinned to Server 2, Server 2 will run at 95% CPU while Servers 1 and 3 sit idle.
2. **Brittle Fault Tolerance:** When Server 2 crashes or is replaced during an auto-scaling event, all users pinned to Server 2 lose their session data and are abruptly logged out or encounter errors.
3. **Blocks Auto-Scaling & Fast Deploys:** Rolling updates cannot cleanly drain servers because users remain glued to instances for the duration of the cookie lifespan.

**The Solution:** Build stateless application servers. Store session state in an external low-latency distributed store (like Redis) or encode session data in signed JWTs so that any server in the fleet can process any request at any moment.

## 6. The Traps — What Goes Wrong

### Trap 1: The Deep Health Check Thundering Herd (Cascading Death Spiral)
- **The Mistake:** Developers configure their load balancer health check to query `/healthz`, which internally executes a SQL query (`SELECT 1 FROM users`) or tests an external microservice.
- **Why It Fails:** If the database experiences temporary connection contention or a slow query lock, `/healthz` calls begin taking 2.5 seconds instead of 10ms. The load balancer's health checker times out (2.0s limit) and marks 2 out of your 5 app servers as dead.
- **The Disaster:** The remaining 3 app servers must now absorb 100% of incoming user traffic. This sudden 66% traffic surge overwhelms their database connection pools, causing their `/healthz` endpoints to timeout as well. The load balancer marks the remaining 3 servers dead, ejecting the entire fleet. Your system enters a complete platform outage that requires manual intervention to reboot.
- **The Fix:** Keep load balancer health checks completely shallow. Test only local process health and event loop responsiveness. Monitor database connectivity via dedicated metrics and alerting pipelines, not automated LB ejection triggers.

### Trap 2: Unbounded Retries on Non-Idempotent Endpoints
- **The Mistake:** Configuring the load balancer to automatically retry failed or timed-out requests on the next healthy backend instance.
- **Why It Fails:** If a client submits a `POST /api/v1/checkout/charge` request and Server A successfully writes the database transaction but crashes or experiences a network hiccup before sending the HTTP 200 response header, the load balancer considers the request failed and immediately resends the exact same `POST` payload to Server B.
- **The Disaster:** Server B processes the request anew, charging the customer's credit card twice or creating duplicate inventory orders.
- **The Fix:** Only permit load balancers to retry strictly **idempotent** HTTP methods (`GET`, `HEAD`, `PUT`, `DELETE`). For `POST` endpoints, enforce server-side Idempotency Keys (stored in Redis with atomic `SETNX`) so duplicate forwarded requests are safely recognized and deduplicated.

### Trap 3: Missing Connection Draining on Rolling Deployments
- **The Mistake:** Triggering a continuous deployment pipeline that kills old container tasks immediately as soon as new containers pass initial boot checks.
- **Why It Fails:** When a container is killed without a draining window, active HTTP connections carrying multi-second database queries, report exports, or file uploads are instantly terminated mid-stream.
- **The Disaster:** Users receive random bursts of `502 Bad Gateway` and `ECONNRESET` errors during every single software release.
- **The Fix:** Enable Connection Draining (Deregistration Delay) with a minimum window of 30–60 seconds. Ensure the application traps `SIGTERM`, stops accepting new requests, finishes in-flight requests, and calls `process.exit(0)`.

### Trap 4: Loss of Real Client IP (The Rate-Limiter Blunder)
- **The Mistake:** Installing an IP-based rate limiting middleware (e.g., `express-rate-limit`) in a backend app sitting behind a Layer 7 load balancer without configuring reverse proxy header trust.
- **Why It Fails:** In a standard L7 proxy setup, the TCP source IP seen by the backend server is the **private IP address of the Load Balancer**, not the client's public IP. The client's true IP is forwarded in the `X-Forwarded-For` header.
- **The Disaster:** If your rate limiter inspects `req.socket.remoteAddress` directly, it sees all 50,000 global users as originating from a single IP address (the Load Balancer). Within 10 seconds of traffic, the rate limiter triggers and returns `429 Too Many Requests` to every single user on the internet.
- **The Fix:** Always configure your application framework to trust reverse proxy headers (e.g., `app.set('trust proxy', true)` in Express) and ensure the load balancer sanitizes incoming `X-Forwarded-For` headers to prevent client IP spoofing.

## 7. Compare With Related Concepts

| Dimension | Load Balancer | Reverse Proxy | API Gateway | DNS Round Robin |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Purpose** | Distribute traffic evenly across multiple backend instances | Sit in front of web servers to provide caching, compression, and SSL | Manage, authenticate, and orchestrate microservice APIs | Map a single domain name to multiple IP addresses |
| **OSI Layer** | Layer 4 (Transport) or Layer 7 (Application) | Layer 7 (Application) | Layer 7 (Application) | Application / DNS Layer |
| **Health Checking** | Real-time, active polling with automatic instant failover (seconds) | Configurable active/passive upstream checks | Advanced circuit breaking and upstream health monitoring | None (or slow TTL-based propagation taking minutes/hours) |
| **Routing Granularity** | Per-connection (L4) or Per-request (L7) | Per-request URL path/header mapping | Complex API composition, auth, rate limiting, and transformations | Per-DNS lookup (cached by client OS and ISP resolvers) |
| **State Handling** | Best with stateless backends; supports sticky sessions | Stateless caching and proxying | Token validation, JWT claims extraction, rate limits | Completely unaware of server state or active connections |
| **When to Use** | Whenever you run 2+ instances of a service that need high availability | When you need caching, compression, and TLS termination for a server cluster | At the front door of microservice architectures requiring authentication and rate limiting | Basic, low-cost distribution across geographically distributed data center VIPs |

### Quick Selection Rules
- **Use a Layer 4 Load Balancer (NLB):** When extreme throughput, ultra-low latency, or non-HTTP protocols (TCP/UDP/WebSockets) are required.
- **Use a Layer 7 Load Balancer (ALB / NGINX):** When you need path-based routing, cookie management, SSL termination, and HTTP header inspection across a fleet of web servers.
- **Use an API Gateway:** When you need client authentication, JWT verification, rate limiting, and request transformation in addition to basic routing.
- **Never use DNS Round Robin alone:** DNS cannot detect crashed servers in real time due to ISP-level TTL caching; always point DNS to a Load Balancer Virtual IP.

## 8. 🧠 The Memory Hook

> **The Dispatcher Never Guesses:** A load balancer is an airport queue dispatcher. **Layer 4** checks your boarding pass barcode in milliseconds without touching your luggage; **Layer 7** opens your bag to route fragile items to special handlers. And health checks must only check if the worker is breathing—never ask them to solve a puzzle before letting someone in line.

