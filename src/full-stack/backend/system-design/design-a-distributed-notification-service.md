# Design a Distributed Real-Time Notification & Pub/Sub Service

## 1. Understand the Problem First — Clarify Before Designing

Building a notification system looks trivial on paper: someone sends a message, you write a record to a database, and you trigger a mobile push notification. But imagine what happens when your platform grows to 50 million daily active users with 10 million clients holding open persistent connections simultaneously.

A breaking news alert or a flash sale drops. Suddenly, your system needs to push an event to 5 million subscribers in under 100 milliseconds. If you iterate through a database table and synchronously call external push gateways (like Apple APNs or Google FCM), your API servers freeze under I/O bottlenecks. If you maintain persistent WebSockets on monolithic web servers, a deployment or node crash severs 100,000 live connections at once, triggering an avalanche of reconnection requests that takes down your entire infrastructure.

Before sketching any boxes on a whiteboard, a senior engineer pins down the exact scope, scale, and operational invariants with clarifying questions:

**Key Clarifying Questions:**
- **What types of notifications and delivery channels must we support?** We need to support real-time in-app delivery (persistent WebSockets or Server-Sent Events), mobile push (APNs for iOS, FCM for Android), SMS (Twilio), and transactional email (SendGrid/AWS SES).
- **What is the delivery latency target?** Sub-100ms for active connected in-app users; under 2 seconds for mobile push and external channels.
- **What are the scale requirements?** 50 million Daily Active Users (DAU), 10 million concurrent persistent WebSocket connections, an average ingestion rate of 100,000 events/second, spiking to 500,000 events/second during peak broadcast alerts.
- **What fan-out patterns exist?** We must support 1-to-1 transactional notifications (order confirmation, password reset), 1-to-few group notifications (chat rooms, team collaboration), and 1-to-many broadcast alerts (platform announcements to millions of users).
- **What delivery guarantees are required?** At-least-once delivery with client-side deduplication. When users lose cell service or close their laptops, we must store their messages in an offline mailbox so they can sync missed notifications upon reconnecting without data loss.
- **What user preferences and rate limits apply?** Users can mute specific channels, define quiet hours, and configure channel priority. The system must also debounce and throttle duplicate alerts so a user isn't spammed with 50 notifications in 10 seconds.

## 2. The Core Insight — The Decision Everything Else Flows From

The single most critical architectural insight is the **strict separation of the stateful connection tier from the stateless message processing tier**.

WebSockets and persistent TCP connections are inherently **stateful**. A single physical server holds a long-lived socket for a specific client in its operating system file descriptor table and memory. In contrast, notification ingestion, user preference evaluation, template rendering, and channel fan-out are inherently **stateless** and benefit from horizontal, elastic autoscaling.

If you let your ingestion API or business logic touch client sockets directly, you tightly couple your entire system to specific machines. When a gateway node restarts or a worker slows down, the blast radius takes down the entire ingestion pipeline.

The architecture solves this by splitting the system into three independent planes:
1. **The Stateful Edge (Connection Gateways):** Ultra-lean, high-concurrency servers whose only job is to maintain open client connections using non-blocking I/O (epoll/kqueue), handling 100,000+ idle connections per node with minimal memory.
2. **The Distributed Connection Registry:** An in-memory, ultra-fast distributed routing table (Redis Cluster) that tracks which user device is currently connected to which specific Gateway server instance (`user_id -> [gateway_id, socket_id]`).
3. **The Stateless Processing Backbone:** Ingestion services and worker pools that receive events, buffer them in a partitioned message stream (Kafka), resolve fan-out and user preferences, and push ready-to-deliver payloads either to the target Gateway server via internal pub/sub queues or to third-party push providers (APNs/FCM).

Stateless workers never need to know *how* to talk to a client; they simply look up the Gateway ID from the registry and forward the payload. If the user is offline, the message is routed to an offline mailbox database and queued for mobile push notification.

## 3. High-Level Architecture — Components and Why Each Exists

Here is the end-to-end architecture showing how an event travels from ingestion to live delivery across multiple channels:

```txt
[ Internal Services ] (Payments, Chat, Feed, Alerts)
         │
         ▼
[ Ingestion API & Rate Limiter ] ─── (Auth, Validation, Idempotency Check)
         │
         ▼
[ Ingestion Message Broker (Apache Kafka) ]
         │
         ├────────────────────────────────────────┐
         ▼                                        ▼
[ Fan-Out & Routing Workers ]           [ Offline Mailbox Store ]
   │ (User Preferences, Dedup)             (Cassandra / ScyllaDB)
   │
   ├──────────────────────────────┬──────────────────────────────┐
   │ [Online WebSocket Path]      │ [Mobile Push Path]           │ [Email / SMS Path]
   ▼                              ▼                              ▼
[ Query Connection Registry ]  [ Push Worker Pool ]          [ Email/SMS Worker Pool ]
     (Redis Cluster)              │                              │
   │                              ▼                              ▼
   │ (Route to Node 42)        [ APNs / FCM Gateways ]        [ SendGrid / Twilio ]
   ▼                              │                              │
[ Gateway Internal Broker ]       ▼                              ▼
   (NATS / Redis Streams)      [ Mobile Device ]             [ Inbox / Phone ]
   │
   ▼
[ WebSocket Gateway Node 42 ] ──(epoll write)──▶ [ Active Browser / App Client ]
   │
   └──────◀── (Client ACK) ────▶ [ Delivery & Read Receipt Service ]
```

**Component Breakdown:**

- **Ingestion API Gateway:** The entry point for internal backend microservices. It validates API tokens, applies rate limiting to prevent rogue services from overwhelming the system, validates payloads against defined schemas, and assigns a globally unique, time-sortable `notification_id` (Snowflake ID) to enforce idempotency.
- **Ingestion Message Broker (Apache Kafka):** Serves as the high-throughput shock absorber. It buffers hundreds of thousands of incoming events per second, decouples ingestion from delivery processing, and provides a durable, replayable log partitioned by `user_id` or `channel_id`.
- **Fan-Out & Routing Workers:** Stateless consumer services that pull events from Kafka. They perform three critical tasks:
  1. *Membership Resolution:* If an event is targeted at a group or channel, workers expand the channel into individual recipient user IDs.
  2. *Preference & Do-Not-Disturb (DND) Filtering:* Checks cached user preferences (e.g., user disabled marketing emails, or user is in night mode) and mutes or redirects notifications accordingly.
  3. *Channel Selection & Splitting:* Decides whether to send via WebSocket, APNs/FCM, SMS, or Email based on user presence, urgency, and configuration.
- **Distributed Connection Registry (Redis Cluster):** An in-memory distributed hash store that maps every active `user_id` to their currently connected Gateway server ID, socket descriptor, device type, and heartbeat timestamp.
- **Gateway Topic Dispatcher (NATS JetStream / Redis Streams):** A lightweight internal pub/sub layer. Each Gateway node listens to its own dedicated mailbox topic (e.g., `gateway.node-42`). Routing workers push outgoing client payloads to these specific topics.
- **WebSocket Connection Gateway Cluster:** Stateful, lightweight edge nodes written in Go or Rust (or Java with Netty). They maintain millions of long-lived, encrypted WebSocket/TLS connections from client browsers and mobile apps. They handle heartbeat pings, decrypt incoming client traffic, and stream outgoing notification frames.
- **Third-Party Push & External Channel Adapters:** Worker pools dedicated to integrating with external APIs (APNs, FCM, SendGrid, Twilio). They implement persistent HTTP/2 connection pooling, token-bucket rate limiters per provider, circuit breakers, and automatic retry queues.
- **Offline Mailbox Store (Cassandra / ScyllaDB):** A distributed wide-column database partitioned by `user_id` and clustered by `created_at DESC`. It stores all historical notifications and unread alerts so clients can query missed messages upon reconnecting.
- **Delivery & Read Receipt Service:** Ingests client acknowledgments (ACKs) when a notification is displayed or clicked, updating message state across all connected devices belonging to that user.

**Step-by-Step Request Lifecycle:**
1. The Payment Service publishes a `Payment_Successful` event to the Ingestion API.
2. The Ingestion API validates the request, stamps it with an idempotency key and Snowflake ID, and pushes it to the Kafka `notification-events` topic.
3. A Fan-Out Worker consumes the event, checks the user's preference cache, and confirms the user has enabled both In-App and Push alerts.
4. The worker writes the message to the Offline Mailbox Store (Cassandra) with status `UNREAD`.
5. The worker queries the Redis Connection Registry for `user_123`.
6. **Case A (User is Online):** Redis returns `[Gateway_Node_42, socket_987]`. The worker publishes the payload to internal topic `gateway.node-42`. Gateway Node 42 receives the payload and writes it directly to `socket_987` via non-blocking epoll. The client UI renders the pop-up and sends back an ACK over the socket.
7. **Case B (User is Offline or No ACK within 3s):** Redis indicates no active socket. The worker dispatches a job to the Mobile Push Worker Pool, which batches the notification and sends it via HTTP/2 to Apple APNs / Google FCM.

## 4. Key Technical Decisions — With Real Tradeoffs

**1. Connection Gateway I/O Model: Non-Blocking Epoll (Go/Rust/Netty) vs Thread-per-Connection (Traditional Java/Python)**
- *Choice:* Non-blocking event loops using OS primitives (`epoll` on Linux, `kqueue` on macOS/BSD), implemented via Go goroutines, Rust Tokio, or Java Netty.
- *Rejected Alternative:* Traditional thread-per-connection architectures (like standard Apache Tomcat or Python WSGI).
- *Tradeoff:* In thread-per-connection models, 100,000 idle connections require 100,000 OS threads. With default 1MB thread stack sizes, that demands 100GB of RAM just for idle thread stacks, triggering massive CPU context switching. Non-blocking epoll multiplexes thousands of sockets over a handful of worker threads. Each connection in Go uses only ~2KB to 4KB of memory, allowing a single 16GB server to comfortably manage 100,000 to 200,000 idle connections. The tradeoff is asynchronous programming complexity and the need for strict write-buffer management.

**2. Distributed Routing Registry: Redis Cluster vs Consistent Hashing Gateway Routing**
- *Choice:* Centralized Redis Cluster storing hash sets (`user:connections:{user_id}`).
- *Rejected Alternative:* Consistent hashing ring where a client connects to a Gateway server derived strictly from `hash(user_id) % N`, eliminating the need for a central registry.
- *Tradeoff:* Consistent hashing avoids a Redis lookup, but when a Gateway server crashes or the cluster scales up/down, thousands of clients must reconnect to different servers. This reshuffles the hash ring, triggering widespread connection drops and thundering herd reconnect storms. Redis Cluster adds a minimal 1ms network hop during routing, but it allows any client to connect to *any* healthy Gateway server behind a standard Layer 4 Load Balancer, providing seamless failover and dynamic scaling.

**3. Ingestion & Fan-Out Queue: Apache Kafka vs RabbitMQ vs Redis Pub/Sub**
- *Choice:* Apache Kafka for the primary ingestion and fan-out stream, paired with lightweight NATS JetStream or Redis Streams for internal gateway dispatch.
- *Rejected Alternative:* Redis traditional Pub/Sub (`SUBSCRIBE / PUBLISH`).
- *Tradeoff:* Standard Redis Pub/Sub is fire-and-forget; if a worker or gateway restarts, all in-flight messages are lost permanently with zero persistence or consumer offset replay. RabbitMQ supports durable queues but experiences severe memory bloat and degraded throughput when queues back up under sudden 500k event/sec spikes. Kafka provides rock-solid disk-backed persistence, linear partition scaling, and consumer offset management, allowing workers to replay messages from any point in time during downstream failures.

**4. Notification History Storage: Wide-Column NoSQL (Cassandra/ScyllaDB) vs Relational Database (PostgreSQL)**
- *Choice:* Cassandra or ScyllaDB with partition key `user_id` and clustering key `created_at DESC`.
- *Rejected Alternative:* Relational database (PostgreSQL / MySQL) with table partitioning.
- *Tradeoff:* A relational database allows flexible multi-table SQL queries, but at 50M DAU generating hundreds of millions of notifications daily, write throughput and B-tree index maintenance degrade performance. High-concurrency vacuuming and WAL write bottlenecks become severe operational burdens. Cassandra's LSM-tree storage engine provides append-only, sequential disk writes with zero read-before-write overhead, making writes blisteringly fast. Fetching a user's notification feed (`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`) executes as a single, sequential partition read. The cost is lack of ad-hoc JOINs, requiring full data denormalization.

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Connection Management at Scale & The C10M Problem

Holding open 10 million concurrent WebSocket connections across a fleet of Gateway servers is primarily an operating system resource tuning and memory footprint optimization challenge.

**Linux Kernel & Socket Tuning:**
- By default, Linux restricts open file descriptors per process to 1,024. Every TCP connection requires one file descriptor. We tune `/etc/security/limits.conf` and `sysctl` to allow up to 1,048,576 open files (`nofile`) per Gateway node.
- Socket memory allocation must be tightly controlled. The default Linux TCP read/write buffers (`net.ipv4.tcp_rmem` and `net.ipv4.tcp_wmem`) can allocate up to 128KB per socket. For 100,000 connections, that equals 12.8GB of RAM just for TCP buffers! We tune minimum and default buffer sizes down to 4KB (`4096 4096 16384`) because notification frames are small (typically < 1KB).
- Epoll multiplexing monitors thousands of descriptors in constant O(1) time per active event rather than scanning all sockets in O(N) like legacy `select()` or `poll()`.

**Heartbeats, Connection Eviction, and Zombie Sockets:**
- Mobile devices constantly lose connectivity (e.g., entering an elevator, airplane mode, switching between Wi-Fi and 5G) without sending TCP `FIN` or `RST` packets. To the server, the socket appears open indefinitely (a "zombie socket"), leaking memory and file descriptors.
- *Solution:* The Gateway enforces a strict ping/pong heartbeat protocol. The client sends a lightweight `PING` frame every 30 seconds. If the Gateway does not receive a `PING` within 60 seconds, it forcefully closes the socket, reclaims the file descriptor, and deletes the socket entry from the Redis Connection Registry.
- *Lease Renewal in Redis:* When a user connects, the Gateway registers the mapping with a 90-second Time-To-Live (TTL):
  ```redis
  HSET user:connections:user_123 socket_987 "gateway_node_42|ios|v2.1"
  EXPIRE user:connections:user_123 90
  ```
  Every successful heartbeat executes a pipelined `EXPIRE` command to refresh the lease. If a Gateway node abruptly loses power, all its connection records in Redis automatically expire within 90 seconds without requiring manual cluster cleanup.

### Deep Dive 2: The Fan-Out Engine & The "Celebrity Broadcast" Problem

When an event is published, the Fan-Out Engine must route it to all target subscribers. The strategy changes completely based on the recipient cardinality:

**1. Point-to-Point (1:1) and Group (1:N up to 1,000 members):**
- For direct messages or small groups, the fan-out worker fetches the subscriber list, issues an `MGET` against Redis to find their Gateway locations, and publishes individual messages to the corresponding Gateway internal queues.

**2. Massive Broadcasts (1 to 5,000,000+ users — The Breaking News Problem):**
- If an alert is sent to 5 million users simultaneously, naive fan-out creates 5 million distinct messages and floods Kafka and Redis, causing multi-minute ingestion lag and worker queue exhaustion.
- *The Solution: Two-Tier Hierarchical Gateway Fan-Out.*
  1. The Fan-Out Worker does *not* expand 5 million user records. Instead, it publishes **one single broadcast payload** to a special global broadcast topic (e.g., `gateway.broadcast.all`).
  2. Every Gateway node in the fleet consumes this single broadcast message.
  3. Each Gateway node inspects its own **local in-memory active connection table** and writes the payload to all currently connected local sockets in parallel across its CPU worker pool.
  4. Network bandwidth between workers and gateways drops from 5,000,000 transmissions to just N transmissions (where N is the number of Gateway servers, e.g., 100 servers).

```txt
[ Broadcast Event ] ──▶ [ Kafka Broadcast Topic ]
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
        [ Gateway Node 1 ] [ Gateway Node 2 ] [ Gateway Node N ]
               │               │               │
        (Iterate Local) (Iterate Local) (Iterate Local)
          100k Sockets    100k Sockets    100k Sockets
```

### Deep Dive 3: Delivery Receipts, Idempotency, and Offline Message Catch-Up

Network drops and process restarts guarantee that messages will occasionally be retried. The system must guarantee at-least-once delivery over the wire while providing **effectively-once processing** to the user.

**Message Lifecycle & State Machine:**
```txt
[ CREATED ] ──▶ [ SENT_TO_GATEWAY ] ──▶ [ DELIVERED_TO_CLIENT ] ──▶ [ READ_BY_USER ]
                       │
             (No ACK in 3s / Offline)
                       ▼
             [ ROUTED_TO_PUSH_APNS_FCM ]
```

**Client-Side Idempotency:**
- Every notification carries a monotonically increasing 64-bit Snowflake ID (composed of `timestamp_ms + worker_id + sequence_num`).
- The client application maintains the `highest_received_notification_id` in local device storage (SQLite/IndexedDB).
- If network jitter causes the server to retransmit an alert, the client checks the ID: if `incoming_id <= highest_received_id`, the client silently ACKs the message and discards the duplicate UI pop-up.

**Offline Delta Synchronization Protocol:**
- When a client reconnects after being offline for 2 hours, it must not receive a chaotic flood of 200 individual push frames over the WebSocket.
- Instead, upon establishing a new WebSocket handshake, the client sends a `SYNC` frame containing its last known checkpoint:
  ```json
  { "action": "SYNC", "last_received_id": "179283748291028371", "channel": "user_inbox" }
  ```
- The Gateway queries the Cassandra Offline Mailbox Store:
  ```sql
  SELECT * FROM user_notifications
  WHERE user_id = 'user_123' AND notification_id > 179283748291028371
  ORDER BY notification_id ASC LIMIT 50;
  ```
- The missed messages are packaged into a single, compressed historical sync batch. Once the client receives and renders the batch, it resumes normal real-time event streaming.

## 6. Failure Modes and Resilience

**1. The Gateway Crash & Thundering Herd Reconnect Storm**
- *The Failure:* A Gateway server hosting 150,000 active WebSocket connections crashes or undergoes a rolling deployment. 150,000 clients instantly detect a TCP disconnect and simultaneously attempt to reconnect to the remaining load balancers, causing CPU saturation from TLS handshakes, overwhelming the connection registry, and crashing subsequent nodes in a cascading failure.
- *Prevention & Recovery:*
  - *Client SDK Reconnection Policy:* Clients must implement **Exponential Backoff with Full Jitter**:
    ```text
    reconnect_delay = min(max_delay, base_delay * 2^attempt) + uniform_random(0, jitter)
    ```
    This spreads the 150,000 reconnect requests smoothly across a 60-to-120 second window rather than a single 1-second spike.
  - *Graceful Shutdown (Drain Phase):* During deployments, the Gateway initiates a SIGTERM drain mode. It stops accepting new connections, sends a WebSocket Close Frame with code `1001 (Going Away)` to 5,000 sockets per second over a 30-second window, and allows clients to cleanly migrate to peer servers without a sudden cliff drop.
  - *TLS Session Resumption:* Load balancers enable TLS session tickets so reconnected clients skip the expensive asymmetric cryptography handshake.

**2. Slow Consumer & Gateway Write Buffer Memory Bloat**
- *The Failure:* A mobile browser is connected over an unstable 2G cellular link with severe packet loss. The Gateway server continues pushing real-time notification frames to the socket, but the OS TCP send buffer is full. If the Gateway buffers these unwritten frames in user-space application memory without limits, the Gateway process rapidly runs out of memory (OOM) and crashes, terminating connections for all other healthy 99,999 users on that node.
- *Prevention & Recovery:*
  - *Bounded Per-Socket Ring Buffer:* Every connected socket is allocated a fixed-capacity ring buffer (e.g., maximum 64 messages or 256KB).
  - *Backpressure Eviction Policy:* If the buffer fills up because the client is too slow to acknowledge, the Gateway drops ephemeral low-priority notifications (e.g., typing indicators, view counts). If high-priority alerts overflow the buffer, the Gateway forcefully terminates the slow connection, evicts the socket, and relies on the Offline Mailbox Store when the client reconnects on a better network.

**3. Third-Party Push Provider (APNs / FCM) Outage or Rate Limiting**
- *The Failure:* Apple APNs or Google FCM returns HTTP `429 Too Many Requests` or experiences a multi-region outage. Workers calling push APIs synchronously block, exhausting their HTTP connection pools and causing upstream Kafka consumer queues to back up indefinitely.
- *Prevention & Recovery:*
  - *Asynchronous Worker Pools with Circuit Breakers:* Push workers operate strictly asynchronously with circuit breakers (e.g., Netflix Hystrix pattern). If error rates exceed 15%, the circuit trips open and diverts notifications directly to a retry queue.
  - *Priority-Tiered Queues:* Ingestion queues are partitioned by priority. Transactional alerts (OTPs, payment confirmations) live on high-priority topics with dedicated workers; marketing campaigns and social media likes live on low-priority topics. A push outage on social notifications never blocks critical banking alerts.
  - *Dead Letter Queues (DLQ):* After 5 failed retry attempts with exponential backoff, messages are routed to a DLQ for manual inspection and replay, preventing poison-pill messages from blocking consumer offsets.

**4. Redis Connection Registry Partition or Split-Brain**
- *The Failure:* A network partition isolates the primary Redis Cluster node holding a subset of connection hash keys, causing write errors when users connect and routing failures when workers attempt to locate target gateways.
- *Prevention & Recovery:*
  - Redis Cluster runs in a Multi-AZ master-replica configuration with automated failover via Raft-based consensus.
  - *Fallback Routing Strategy:* If a worker cannot reach Redis to locate a user, it checks if the notification is critical. For critical alerts, the worker falls back to publishing to the global gateway broadcast channel with the target `user_id` in the header; the Gateway holding the user's socket picks it up locally, ensuring 99.999% delivery continuity during transient infrastructure hiccups.

## 7. What Makes a Great Answer vs an Average One

| Dimension | Average / Junior Candidate | Great / Senior Architect Candidate |
|---|---|---|
| **System Boundary** | Treats notifications as a simple helper function calling Firebase/APNs synchronously in a web request. | Designs an asynchronous, decoupled pipeline with dedicated ingestion, fan-out, stateful connection, and offline persistence tiers. |
| **Connection Scaling** | Assumes standard web servers can hold millions of WebSockets without discussing OS limits or memory costs. | Details non-blocking epoll event loops, calculates memory per connection (4KB buffers), and tunes OS limits (`nofile`, `tcp_rmem`). |
| **Routing Mechanism** | Confused about how a message on Server A reaches a client connected to Server B; suggests broadcasting everything to every server. | Implements a centralized Distributed Connection Registry in Redis (`user -> gateway_id`) and uses dedicated per-node internal message topics. |
| **Broadcast / Fan-Out** | Naively duplicates 5 million messages into the message queue when a breaking news alert occurs, causing system collapse. | Uses Two-Tier Hierarchical Gateway Fan-Out: sends 1 broadcast payload to each Gateway server, which fans out locally across in-memory sockets. |
| **Network Transitions & Reliability** | Ignores offline users or assumes the WebSocket connection never drops; lacks a sync protocol. | Designs a robust Offline Mailbox Store (Cassandra), monotonic Snowflake IDs, client-side idempotency, and delta synchronization on reconnect. |
| **Failure Handling** | Mentions generic "retries" without considering reconnect storms or downstream backpressure. | Outlines Exponential Backoff with Jitter, graceful connection draining during rolling deployments, and bounded per-socket write buffers to prevent OOM. |

## 8. 🧠 The Memory Hook

**Separate the Socket from the Message:**
> **"Gateway servers hold the physical wires; the Message Broker buffers the bytes; the Connection Registry tells the workers which wire belongs to which user."**

If you remember this mental image, every other architectural decision—from epoll non-blocking I/O at the edge to Redis routing lookups and two-tier broadcast fan-out—snaps naturally into place.
