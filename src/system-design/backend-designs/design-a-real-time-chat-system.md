# Design a Real-Time Chat System

## 1. Understand the Problem First — Clarify Before Designing

Imagine deploying a chat service where everything works smoothly during local development with 10 users. Then in production, a single rolling restart drops 80,000 active WebSocket connections simultaneously. The resulting reconnect storm crashes your authentication database within seconds. Worse, Alice sends a message to Bob, but because Alice is connected to Gateway Instance 3 and Bob is on Gateway Instance 19 with no central session routing, Bob never sees the message until he manually reloads his screen. Messages display out of order because two distributed server clocks drifted by 150 milliseconds, and a company-wide announcement in a 5,000-person channel amplifies into 5,000 individual database writes that exhaust the connection pool.

Designing a production-grade real-time chat system requires solving stateful connection management, distributed message routing, deterministic sequencing, and high-frequency presence tracking under massive concurrency.

Before drawing architecture boxes on the whiteboard, establish the operational boundaries by clarifying these exact requirements with the interviewer:

- **Chat Modality & Group Size:** Are we designing direct 1-on-1 messaging, small group chats (e.g., Slack channels or WhatsApp groups with up to 500 members), or massive live broadcast rooms (e.g., Twitch/Discord with 100,000+ members)? *Assumption: 1-on-1 and small-to-medium group chats up to 1,000 members, with a dedicated fanout strategy for large channels.*
- **Scale & Traffic Profile:**
  - 50 Million Daily Active Users (DAU).
  - 10 Million peak concurrent online connections.
  - Average of 40 messages per active user daily = 2 Billion messages/day.
  - Average write throughput = 2,000,000,000 / 86,400 ≈ 23,000 messages/sec.
  - Peak write throughput (3x–4x multiplier) ≈ 70,000 to 100,000 messages/sec.
  - Storage volume: At ~500 bytes per message payload (text + metadata), 2 Billion messages generate ~1 TB of raw text data per day (365 TB/year).
- **Latency & Reliability SLAs:** Sub-100ms end-to-end delivery latency for active online recipients. Zero message loss (strict durability). Messages within a single conversation must render in strict chronological order.
- **Feature Scope:** Real-time messaging, offline message synchronization on reconnect, presence tracking (online/offline), typing indicators, message read receipts, and media attachments (images/videos uploaded via object storage).
- **Security & Privacy:** End-to-end transport encryption over TLS/WSS and encryption-at-rest. Media files accessible only via time-limited presigned URLs.

## 2. The Core Insight — The Decision Everything Else Flows From

The single defining architectural challenge of real-time chat is that **WebSockets are stateful, long-lived TCP connections tied to specific physical server memory, while modern backend services are stateless**.

In standard REST APIs, any server instance can handle any incoming HTTP request because every request carries its own authentication and state. In real-time chat, User A holds an open socket on Gateway Server 1, and User B holds an open socket on Gateway Server 42. Gateway Server 1 cannot directly write bytes to User B's network interface because it has no access to Server 42's file descriptors.

Every successful real-time chat architecture flows from one foundational separation: **decouple the stateful edge connection layer from the stateless business logic and storage layer using a distributed Session Registry and a partitioned Pub/Sub message broker**.

The edge connection gateways do almost zero heavy business logic. They maintain lightweight TCP/WebSocket sessions and push frames to clients. A distributed in-memory registry (Redis Cluster) tracks which gateway server currently hosts each user. When a message is sent, stateless chat workers persist the message, look up the recipient's gateway location, and publish the message to that specific gateway over internal pub/sub queues.

## 3. High-Level Architecture — Components and Why Each Exists

To handle 10 million concurrent persistent connections and 100,000 peak writes per second without bottlenecks, the system separates into discrete functional tiers:

```txt
                              +------------------------+
                              |   Load Balancer (L4)   |
                              +-----------+------------+
                                          |
                 +------------------------+------------------------+
                 | (WebSocket Upgrade / WSS)                       | (HTTPS REST Traffic)
                 v                                                 v
      +---------------------+                           +---------------------+
      |  WebSocket Gateway  |                           |   REST API Server   |
      | (Connection Nodes)  |                           |  (Auth/Upload/Sync) |
      +----------+----------+                           +----------+----------+
                 |                                                 |
                 +-------------------+             +---------------+
                                     |             |
                                     v             v
                        +-----------------------------+
                        |      Session Registry &     |
                        |    Presence Store (Redis)   |
                        +--------------+--------------+
                                       |
                                       v
                        +-----------------------------+
                        |     Chat Routing Service    |
                        |      (Stateless Logic)      |
                        +--------------+--------------+
                                       |
         +-----------------------------+-----------------------------+
         | (Durable Ingestion)                                       | (Real-Time Fanout)
         v                                                           v
+------------------+                                       +--------------------+
|  Message Store   |                                       |   Message Broker   |
| (ScyllaDB / NoSQL|                                       | (Kafka / Streams)  |
+------------------+                                       +---------+----------+
                                                                     |
                           +-----------------------------------------+
                           |                                         |
                           v (Online Dispatch)                       v (Offline Push)
                +---------------------+                   +---------------------+
                |  Delivery Workers   |                   | Push Notification   |
                | (Push to Gateways)  |                   | Service (APNs/FCM)  |
                +----------+----------+                   +---------------------+
                           |
                           v
                    Target Gateway
                           |
                           v (WebSocket Frame)
                    Recipient Client
```

- **L4 Load Balancers (HAProxy / AWS NLB):** Terminates TCP connections and routes initial WebSocket upgrade requests across gateway nodes using consistent IP hashing or least-connections distribution.
- **WebSocket Gateways (Connection Managers):** Lightweight, asynchronous servers (written in Go, Rust, or Node.js via uWebSockets) dedicated exclusively to maintaining open client sockets, decoding incoming frames, performing ping/pong heartbeats, and writing outgoing frames.
- **REST API Servers:** Stateless microservices handling non-socket operations: user authentication, group management, profile settings, cold-start conversation history queries, and generating presigned AWS S3 URLs for media uploads.
- **Session Registry (Redis Cluster):** Global distributed key-value store mapping `user_id -> { gateway_node_id, connection_id, last_heartbeat }`. Allows any service to locate a user's active socket in sub-millisecond time.
- **Chat Routing Service:** Stateless engine that validates channel permissions, generates globally monotonic sequence IDs, coordinates database writes, and decides whether a message routes to online gateways or the offline push queue.
- **Message Store (ScyllaDB / Cassandra):** Distributed wide-column database that stores append-only message history partitioned by conversation ID and clustered by chronological sequence number.
- **Presence & Ephemeral State Store (Redis Cluster):** Manages high-churn transient data: online/offline status, typing indicators, and real-time unread badges with automatic TTL expiration.
- **Message Broker (Apache Kafka / Redis Streams):** Event pipeline buffering messages between ingestion and delivery, guaranteeing at-least-once delivery and protecting connection nodes from traffic spikes.
- **Push Notification Service:** Worker fleet that formats and dispatches background push notifications via Apple Push Notification service (APNs) and Firebase Cloud Messaging (FCM) when a recipient is not actively connected to any gateway.

### End-to-End Message Flow

1. **Submission:** Alice types "Hello Bob" and her client dispatches a WebSocket frame containing `{ client_msg_id, conversation_id: "conv_123", content: "Hello Bob" }`.
2. **Gateway Ingestion:** Alice's connected Gateway Node validates the session token, attaches Alice's `user_id`, and forwards the payload to the Chat Routing Service.
3. **ID Assignment & Persistence:** The Chat Routing Service assigns a monotonic time-ordered message ID (e.g. Snowflake or per-conversation sequence number), writes the record to ScyllaDB, and immediately emits an acknowledgment frame (`{ client_msg_id, server_msg_id, timestamp, status: "SENT" }`) back to Alice over her WebSocket. Alice's UI updates the message from pending to sent (single checkmark).
4. **Recipient Routing Lookup:** The service queries the Redis Session Registry for `conv_123` participants (Bob).
5. **Path A — Bob is Online:** Redis returns Bob's active location on `gateway_node_19`. The Chat Routing Service publishes the message payload to the internal channel for `gateway_node_19`. Gateway 19 writes the message frame down Bob's open WebSocket connection.
6. **Path B — Bob is Offline:** Redis returns no active connection for Bob. The service pushes a job to the Push Notification Queue, which triggers an APNs/FCM push notification to Bob's mobile device with the message preview.
7. **Delivery & Read Receipts:** When Bob's client receives the payload, it automatically transmits a lightweight `delivery_ack` frame back through its gateway. When Bob opens the chat view, a `read_receipt` frame is sent, updating the message status to read (double blue checkmarks) and notifying Alice's gateway in real time.

## 4. Key Technical Decisions — With Real Tradeoffs

### Transport Protocol: WebSockets vs HTTP Long-Polling vs Server-Sent Events (SSE)

- **Choice:** WebSockets for bidirectional real-time communication.
- **Considered & Rejected:** HTTP Long-Polling generates severe HTTP header overhead (500–1000 bytes per poll), creates high TCP connection churn, and introduces latency spikes under load. SSE provides clean server-to-client streaming, but client-to-server messaging still requires separate HTTP POST requests, creating two parallel transport paths, duplicate connection handshakes, and higher battery drain on mobile clients.
- **Tradeoff:** WebSockets require managing stateful connections at the load balancer and implementing custom application-layer heartbeat logic, but they provide sub-50ms latency and minimal per-message frame overhead (2–10 bytes).

### Message Storage Engine: Wide-Column NoSQL (ScyllaDB/Cassandra) vs Relational (PostgreSQL) vs Document (MongoDB)

- **Choice:** ScyllaDB / Cassandra for message history storage, combined with PostgreSQL for relational metadata (users, channel configurations, friendships).
- **Considered & Rejected:** Relational databases (PostgreSQL/MySQL) suffer severe index contention, lock escalation, and IOPS exhaustion under 100,000 sequential writes per second. Sharding relational tables manually across hundreds of instances introduces operational brittleness. MongoDB can handle document writes but requires complex sharding keys and consumes significantly more RAM for indexes on append-only time-series data.
- **Tradeoff:** Cassandra's Log-Structured Merge-tree (LSM) engine provides predictable, high-throughput sequential writes and ultra-fast range queries (`SELECT * FROM messages WHERE conversation_id = ? AND message_id < ? ORDER BY message_id DESC LIMIT 50`). We sacrifice ACID cross-table joins and multi-row transactions, which are unnecessary for immutable append-only chat logs.

### Ephemeral State Isolation: Redis In-Memory vs Primary Database

- **Choice:** Redis Cluster with aggressive TTLs for typing indicators, active presence, and unread counts.
- **Considered & Rejected:** Persisting typing status or heartbeat updates directly to ScyllaDB or PostgreSQL. Typing indicators produce 10x to 20x the volume of actual chat messages (a user typing a single sentence can generate 15 keystroke events). Writing these to disk burns disk bandwidth and bloats storage.
- **Tradeoff:** If Redis crashes without persistence, typing indicators and online badges temporarily reset until the next 15-second heartbeat refresh. This transient data loss is completely invisible to users and protects persistent database storage from saturation.

### Group Message Fanout Strategy: Fanout-on-Write vs Fanout-on-Read

- **Choice:** Hybrid fanout based on conversation membership size.
- **For Direct & Small Groups (under 500 members):** Fanout-on-write (Push Model). When a message is posted, the backend looks up all active members and publishes the payload directly to their corresponding gateway queues. Each client receives real-time pushes with minimal latency.
- **For Mega-Channels / Broadcast Rooms (10,000+ members):** Fanout-on-read (Pull Model) combined with shared channel pub/sub pools. Individual message duplication is bypassed; messages are appended once to the channel's stream, and connected clients pull increments or listen to a aggregated WebSocket room broadcast rather than individual user mailboxes.
- **Tradeoff:** Fanout-on-write maximizes real-time delivery speed for 99% of normal peer conversations, while dynamic switching to pull/broadcast models prevents the "celebrity fanout problem" from exhausting broker memory.

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Deterministic Message Sequencing Without Clock Skew

A common failure in distributed chat is relying on server system time (`System.currentTimeMillis()`) to order messages. Server clocks synchronize via NTP (Network Time Protocol), which experiences clock drift and can periodically step backward by tens of milliseconds. If Alice and Bob send messages concurrently to two different servers whose clocks differ by 50ms, a reply can be stamped with a timestamp older than the original question, causing disjointed message threads on client screens.

```txt
Conversation: conv_456
+-------------------------------------------------------------------------------+
| Message ID: 104928174920194                                                    |
| Timestamp: 2026-08-25T12:00:01.100Z (Clock Drifting Backward)                 |
| Channel Sequence Number: 42  <--- Absolute Deterministic Order                |
| Sender: Alice -> "Are you free for lunch?"                                    |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Message ID: 104928174920180                                                    |
| Timestamp: 2026-08-25T12:00:01.080Z (Appears older due to NTP skew!)          |
| Channel Sequence Number: 43  <--- Client uses this to render correctly        |
| Sender: Bob -> "Yes, let's go at noon!"                                       |
+-------------------------------------------------------------------------------+
```

To guarantee absolute ordering within a conversation:

1. **Per-Conversation Monotonic Sequence IDs:** Each conversation maintains an atomic monotonic counter (managed via Redis atomic `INCR` or a centralized sequence partition). Every message in `conv_123` receives `seq_id = 1, 2, 3, 4...`.
2. **Distributed 64-bit Snowflake IDs:** For globally unique message identification without a single bottleneck, generate Twitter Snowflake IDs composed of:
   - 41 bits: Epoch millisecond timestamp.
   - 10 bits: Machine/Node identifier (prevents cross-server ID collision).
   - 12 bits: Per-millisecond local sequence counter (supports 4,096 IDs per millisecond per machine).
3. **Frontend Gap Detection:** Because sequence numbers strictly increment by 1, if a client displaying `seq_id: 14` receives `seq_id: 16`, it instantly detects a network packet drop (`seq_id: 15` is missing) and immediately fires a background sync request: `GET /messages?conv_id=123&from_seq=14&to_seq=16`.

### Deep Dive 2: Offline Synchronization and Catch-Up Protocol

When a user switches from airplane mode or opens their laptop after days offline, naive implementations attempt to blast thousands of missed messages across the newly opened WebSocket, saturating the connection and freezing the client's UI thread.

```txt
Client (Reconnecting)                         Server (Chat Sync Service)
       |                                                 |
       | --- 1. WS Connect + Auth Handshake -----------> |
       | <--- 2. Connection Accepted ------------------- |
       |                                                 |
       | --- 3. Sync Request --------------------------> |
       |     { "active_conversations": {                 |
       |         "conv_A": { "last_seq_id": 450 },       |
       |         "conv_B": { "last_seq_id": 1100 }       |
       |     }}                                          |
       |                                                 |
       |                                                 | (Queries ScyllaDB:
       |                                                 |  WHERE conv_id = "conv_A"
       |                                                 |  AND seq_id > 450 LIMIT 50)
       |                                                 |
       | <--- 4. Paginated Sync Response --------------- |
       |     { "conv_A": [msgs 451..500], "has_more": true }
       |                                                 |
       | --- 5. Background Hydration (as needed) ------> |
```

The production sync protocol operates in prioritized tiers:

1. **Metadata & Unread Badges First:** Upon reconnecting, the client sends a dictionary of its known state: `{ conv_id -> last_synced_seq_id }`. The server responds immediately with a compact payload containing current unread counts and conversation summaries.
2. **Viewport-Priority Hydration:** The client requests full message payloads only for the currently active, visible conversation window using cursor-based pagination:
   ```sql
   SELECT message_id, seq_id, sender_id, content, created_at
   FROM messages_by_conversation
   WHERE conversation_id = 'conv_A' AND seq_id > 450
   ORDER BY seq_id ASC
   LIMIT 50;
   ```
3. **Chunked Delivery:** Messages are delivered in batches of 50. If a conversation has 2,000 missed messages, the client fetches the initial 50 to render the viewport, while older historical records remain accessible on scroll-up via backward pagination (`WHERE seq_id < 450 ORDER BY seq_id DESC LIMIT 50`).

### Deep Dive 3: Presence Engine and the Zombie Connection Problem

Mobile devices regularly enter dead zones, drop into subways, or deplete their batteries without cleanly transmitting a TCP `FIN` or `RST` teardown packet. From the operating system's perspective, the server socket remains open in an active state indefinitely—creating a "zombie connection" where the system believes an unreachable user is online.

```txt
Mobile Client                             Gateway Node                  Redis Presence
     |                                          |                              |
     | --- 1. Heartbeat Ping (0x9 frame) -----> |                              |
     |                                          | --- 2. SETEX presence:user_1 |
     |                                          |        TTL=30s "online" ---> |
     | <--- 3. Heartbeat Pong (0xA frame) ----- |                              |
     |                                          |                              |
  [User drives into tunnel / battery dies]      |                              |
     x                                          |                              |
     . . . (30 seconds pass with no ping) . . . |                              |
                                                | --- 4. Timer expires         |
                                                |     Closes socket descriptor |
                                                |     Publishes "offline" ---> |
```

1. **Application-Layer Heartbeats:** The client initiates a small heartbeat ping frame (e.g., standard WebSocket ping `0x9` or custom 1-byte opcode) every 15 seconds.
2. **TTL Leases in Redis:** When the gateway receives a ping, it refreshes a Redis key: `SETEX presence:{user_id} 35 "online"`. The TTL is calibrated to roughly 2x the heartbeat interval.
3. **Automated Reaper:** If no heartbeat frame arrives within 30 seconds, the gateway terminates the underlying TCP socket descriptor, cleans up connection memory, and explicitly executes `DEL presence:{user_id}`, publishing an offline state change event to the user's active contacts.

### Deep Dive 4: End-to-End Idempotency and Deduplication

When a client transmits a message over poor mobile connectivity, the gateway may persist the message and route it successfully, but the network drops the return ACK frame before it reaches the sender. The mobile client, detecting an ACK timeout, automatically retries sending the message. Without idempotency guards, duplicate messages appear in the chat history.

1. **Client-Generated UUIDs:** Before sending, the client assigns a unique identifier (`client_msg_id`) to the message.
2. **Distributed Deduplication Guard:** When the Chat Service receives an incoming message, it attempts an atomic in-memory lock in Redis:
   ```txt
   SET idemp:{conversation_id}:{client_msg_id} {server_msg_id} NX EX 86400
   ```
3. **Resolution:**
   - If the key was **newly set** (`NX` succeeded), the message is unique: process, write to ScyllaDB, and cache the resulting `server_msg_id`.
   - If the key **already existed**, the server detects a duplicate retry: bypass database insertion, retrieve the existing `server_msg_id`, and immediately return an ACK to the client so its pending UI state resolves cleanly.

## 6. Failure Modes and Resilience

### 1. WebSocket Gateway Crash and the Reconnect Storm (Thundering Herd)

- **Failure Scenario:** A gateway node hosting 100,000 active WebSocket connections crashes or undergoes a deployment restart. 100,000 disconnected clients simultaneously attempt to re-establish connections and authenticate against the backend in the same second, overwhelming the L4 load balancers, Auth Service, and Redis session store.
- **Mitigation:**
  - **Client-Side Exponential Backoff with Full Jitter:** Clients must calculate reconnect delays using:
    $$\text{delay} = \text{random}(0, \min(\text{max\_delay}, \text{base\_delay} \times 2^{\text{attempt}}))$$
    This flattens the sharp reconnection spike across a broad multi-minute curve.
  - **Pre-Signed Reconnect Tickets:** When the client initially logs in, the Auth Service issues a short-lived, lightweight cryptographic reconnect ticket (HMAC-signed). Gateway nodes validate this ticket locally using their public key without executing database queries to the primary Auth store.
  - **Rate Limiting at L4/L7 Ingress:** Enforce per-IP connection rate limits using Envoy or NGINX token buckets to prevent gateway starvation.

### 2. Message Broker Lag and Partition Imbalance

- **Failure Scenario:** A celebrity or massive organization posts to a channel containing 50,000 users. The message broker partition handling that channel becomes saturated, consumer lag increases to several minutes, and all other conversations assigned to that same Kafka partition experience delayed delivery.
- **Mitigation:**
  - **Priority Topic Isolation:** Segregate message types into distinct Kafka topics. Heavy ephemeral events (typing indicators, read receipts) run on low-priority topics with aggressive message dropping under lag, ensuring persistent text messages always retain dedicated throughput.
  - **Dynamic Sharding for High-Volume Channels:** Channels exceeding 1,000 members are routed to dedicated high-capacity worker pools rather than sharing standard consumer partitions.

### 3. Redis Session Store Failure

- **Failure Scenario:** The primary Redis node holding the active session registry (`user_id -> gateway_id`) fails or experiences network partition.
- **Mitigation:**
  - Deploy Redis in a multi-shard Cluster topology with multi-AZ read replicas and automated failover via Redis Sentinel / Raft orchestration.
  - **Gateway Self-Healing:** Each gateway node retains its local memory mapping of its own connected sockets. In the event of a Redis cluster recovery, gateways execute asynchronous background batch pipelines (`MSET`) to repopulate their live connection mappings into Redis within seconds.

### 4. Database Partition Split-Brain

- **Failure Scenario:** A network split occurs between database availability zones, risking inconsistent message logs or divergent sequence numbers across replicas.
- **Mitigation:**
  - Configure ScyllaDB/Cassandra with `LOCAL_QUORUM` consistency for both reads and writes:
    $$\text{Quorum} = \left\lfloor \frac{N}{2} \right\rfloor + 1$$
  - With a replication factor of 3 ($N=3$), any write must be acknowledged by at least 2 nodes before being marked successful, guaranteeing strong read-your-writes consistency across the cluster.

## 7. What Makes a Great Answer vs an Average One

| Dimension | Average Answer | Great / Senior Answer |
|---|---|---|
| **Architecture Boundaries** | Treats the system as a monolithic Node.js server with WebSockets that broadcasts by looping over all in-memory sockets. | Strictly separates stateful WebSocket Gateways from stateless Chat Routing Services using an in-memory Session Registry and Kafka message broker. |
| **Message Ordering** | Relies on auto-incrementing SQL primary keys or client-provided timestamps, ignoring distributed clock drift. | Explains NTP clock skew risks; implements 64-bit Snowflake IDs and monotonic per-conversation sequence counters to enable frontend gap detection. |
| **Presence & Ephemeral State** | Writes typing indicators and online/offline status directly to the primary database, exhausting disk IOPS. | Isolates ephemeral state in Redis with short TTLs; handles zombie connections via client-side heartbeats and automated server-side socket reap cycles. |
| **Offline Synchronization** | Dumps the entire missed message backlog down the WebSocket pipe upon reconnect, freezing the client. | Implements a two-phase sync protocol: lightweight metadata and unread counts first, followed by cursor-paginated message batches for visible channels. |
| **Reliability & Edge Cases** | Assumes the network is reliable; misses reconnect storms, network retries, and duplicate message delivery. | Details client-side exponential backoff with jitter, pre-signed connection tickets, and distributed idempotency keys (`client_msg_id`) in Redis. |
| **Group Fanout** | Uses a naive fanout-on-write model for all channels regardless of size. | Categorizes fanout by channel scale: uses fanout-on-write (push) for small groups (<500) and fanout-on-read (pull/broadcast) for mega-channels. |

## 8. 🧠 The Memory Hook

**"Sockets at the edge, sessions in Redis, append-only in Scylla: route by conversation ID, sequence with monotonic numbers, and never let high-frequency presence traffic touch your database disk."**
