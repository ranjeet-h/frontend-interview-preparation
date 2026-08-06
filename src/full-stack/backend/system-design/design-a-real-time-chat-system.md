# Design a real-time chat system

## Detailed explanation

Design a real-time chat system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Design data flow, APIs, storage, scaling, failure handling, and observability together.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Clarify requirements and scale.
- Define APIs and data model.
- Choose storage, cache, queues, and workers.
- Plan consistency, failure handling, and security.
- Add observability and rollout strategy.

## 4. Visual / analogy

```txt
Clients -> API -> services -> database/cache/queue -> observability
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend system design rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, design a real-time chat system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you deliver messages in real-time to connected users?
- **The Engine Mechanism (Why it behaves this way):** Real-time delivery uses WebSockets for bidirectional persistent connections between client and server. When a user sends a message, the server receives it via WebSocket, persists it to the database, and publishes it to a pub/sub channel (Redis Pub/Sub, Kafka) keyed by the conversation ID. All server instances subscribed to that channel forward the message to connected clients in that conversation. For clients that aren't connected, messages are stored in the database and delivered when they reconnect. Connection state is tracked in a registry mapping user IDs to WebSocket connections, stored in Redis for horizontal scaling.
- **The Unforgettable Mental Model:** The **Conference Call Bridge**. Everyone dials into the same bridge (conversation channel). When someone speaks (sends a message), everyone on the bridge hears it instantly. If someone drops off (disconnects), they can call back and ask "what did I miss?" (message history sync). The bridge operator (server) keeps a list of who's connected (connection registry).
- **The Trap:** Storing the connection registry in local server memory. In a multi-server deployment, User A might be connected to Server 1 and User B to Server 2. Server 1 won't know about User B's connection. Use Redis for the shared connection registry.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use WebSockets for persistent bidirectional connections. When a message arrives, the server persists it to the database, then publishes it to a Redis Pub/Sub channel keyed by conversation ID. All server instances subscribed to that channel forward the message to their connected clients. The connection registry (user ID → WebSocket connection) is stored in Redis for horizontal scaling. Offline messages are stored in the database and synced when the client reconnects with a last_seen_message_id."

#### How do you handle message ordering and duplicates?
- **The Engine Mechanism (Why it behaves this way):** Messages are ordered by a monotonically increasing sequence number or timestamp. A distributed ID generator (Snowflake) provides globally unique, time-ordered IDs. Each message has a client-generated idempotency key to prevent duplicates when the client retries after a network error. The server checks if a message with the same idempotency key already exists before persisting. For ordering across servers, use a logical clock (Lamport timestamp) or a centralized sequence generator (Redis INCR). The client maintains a local message list and deduplicates by message ID.
- **The Unforgettable Mental Model:** The **Numbered Ticket System**. Each message gets a sequential number (Snowflake ID). If you submit the same request twice (network retry), the ticket machine recognizes the duplicate receipt (idempotency key) and doesn't issue a second ticket. Everyone in the room sees messages in ticket number order.
- **The Trap:** Relying solely on server timestamps for ordering. Clock skew between servers can cause messages to arrive out of order. Use a monotonic ID generator (Snowflake) or a centralized sequence counter for guaranteed ordering.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use Snowflake IDs for globally unique, time-ordered message IDs. Each message includes a client-generated idempotency key — the server checks for duplicates before persisting. For ordering within a conversation, the Snowflake ID's time component ensures chronological order. The client deduplicates by message ID and displays messages in ID order. For cross-server consistency, I'd use Redis INCR for per-conversation sequence numbers as a fallback if Snowflake clock skew becomes an issue."

#### How do you support offline message delivery and sync?
- **The Engine Mechanism (Why it behaves this way):** When a client reconnects, it sends its last_seen_message_id (or last_seen_timestamp). The server queries the database for all messages in the user's conversations after that point and sends them in batches. For large gaps (user offline for days), paginate the sync to avoid overwhelming the connection. Unread message counts are maintained in Redis (INCR on new message, DECR on read). The sync response includes messages, updated unread counts, and conversation metadata. Conflict resolution: if the user sent messages while offline that weren't acknowledged, the client re-sends them with idempotency keys.
- **The Unforgettable Mental Model:** The **Mail Pickup Counter**. When you return from vacation (reconnect), the post office (server) gives you all the mail that arrived since you left, starting from the last letter you received (last_seen_message_id). If there's a huge pile (long offline period), they give it to you in batches. They also tell you how many letters you haven't opened yet (unread count).
- **The Trap:** Sending all missed messages in a single WebSocket frame. This can be megabytes of data and crash the connection. Always paginate sync responses and send in batches of 50-100 messages.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: On reconnect, the client sends its last_seen_message_id. The server queries for messages after that ID across all the user's conversations and sends them in paginated batches of 50-100. Unread counts are maintained in Redis and included in the sync response. For very long offline periods, I'd implement incremental sync — first send conversation metadata and unread counts, then let the client request message history for specific conversations on demand. Idempotency keys handle any messages the client sent while offline."

#### How do you scale a chat system to millions of concurrent users?
- **The Engine Mechanism (Why it behaves this way):** Scaling involves: (1) WebSocket connection servers — stateless servers that handle WebSocket connections, backed by Redis for connection registry; (2) Message brokers — Kafka or Redis Streams for pub/sub message distribution; (3) Database sharding — shard messages by conversation_id or user_id; (4) Read replicas — for message history queries; (5) CDN for static assets (profile pictures, file attachments); (6) Connection load balancing — use a layer-7 load balancer that supports WebSocket sticky sessions or route based on user ID hashing. Each component scales independently: add more connection servers for more concurrent users, more Kafka partitions for higher message throughput.
- **The Unforgettable Mental Model:** The **City Phone Network**. Each neighborhood has a local exchange (connection server) handling phone lines (WebSockets). All exchanges connect through a central switching station (Kafka) that routes calls between neighborhoods. The phone book (database) is split by area code (sharding). If one neighborhood grows, you add another exchange. The system scales by adding more of each component independently.
- **The Trap:** Scaling the database before the connection layer. The bottleneck in chat systems is usually WebSocket connections, not message storage. A single server can handle ~10K-50K WebSocket connections. Scale connection servers first.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd scale horizontally at each layer. WebSocket connection servers are stateless and scale by adding more instances — each handles ~10K-50K connections. Redis manages the shared connection registry. Kafka handles message pub/sub with partitions scaled by throughput. The message database is sharded by conversation_id. Read replicas handle message history queries. A layer-7 load balancer distributes WebSocket connections using user ID hashing for sticky routing. Each layer scales independently based on its bottleneck."

#### How do you handle group chats and mention notifications?
- **The Engine Mechanism (Why it behaves this way):** Group chats are modeled as conversations with multiple participants. When a message is sent, the server publishes it to the conversation's pub/sub channel, and all online participants receive it. For @mentions, the server parses the message body for @username patterns, resolves them to user IDs, and sends push notifications to mentioned users (even if they have the conversation muted). Mention data is stored as a separate array on the message record for efficient querying ("messages that mention me"). Unread counts are per-user per-conversation. Mute settings are stored in a conversation_participants table with per-user preferences.
- **The Unforgettable Mental Model:** The **Town Square with Megaphone**. Everyone in the square (group chat) hears normal conversation. But when someone uses a megaphone to call your name specifically (@mention), you hear it even if you were wearing earplugs (muted). The town crier (server) keeps a log of who was called by name (mention array).
- **The Trap:** Not handling mention notifications for muted conversations. Users mute conversations to avoid noise but still want to know when someone specifically addresses them. Always deliver @mention notifications regardless of mute status.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Group chats are conversations with multiple participants in a many-to-many table. Messages are published to the conversation's pub/sub channel for all online participants. For @mentions, I'd parse the message body, resolve usernames to user IDs, and send push notifications to mentioned users regardless of their mute settings. Mentions are stored as a separate array on the message record for efficient 'messages mentioning me' queries. Unread counts and mute preferences are per-user per-conversation, stored in the participants table."

#### How do you store and retrieve message history efficiently?
- **The Engine Mechanism (Why it behaves this way):** Messages are stored in a time-series optimized database. Options: (1) Cassandra/ScyllaDB — partition by conversation_id, cluster by message timestamp, efficient range queries; (2) PostgreSQL with table partitioning by month — each partition is a separate table, queries automatically prune irrelevant partitions; (3) MongoDB with compound index on (conversation_id, created_at). Pagination uses cursor-based pagination (WHERE conversation_id = X AND created_at < last_seen ORDER BY created_at DESC LIMIT 50) instead of offset-based pagination for consistent performance. Old messages can be archived to cold storage (S3) after a retention period.
- **The Unforgettable Mental Model:** The **Filing Cabinet by Date**. Each drawer is a conversation. Inside, files are organized by date. When you want recent messages, you open to the latest folder. For old messages, you dig deeper. After a year, old files are moved to the basement archive (cold storage) but are still accessible if needed.
- **The Trap:** Using offset-based pagination (LIMIT 50 OFFSET 1000). This becomes slower as the offset increases because the database must scan and skip rows. Always use cursor-based pagination with a WHERE clause on the last seen message's timestamp or ID.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd store messages in Cassandra partitioned by conversation_id with clustering by timestamp, enabling efficient range queries for message history. Pagination is cursor-based — the client sends the last message ID, and the query uses WHERE conversation_id = X AND id < last_id ORDER BY id DESC LIMIT 50. For PostgreSQL, I'd use table partitioning by month. Old messages beyond the retention period are archived to S3. The compound index on (conversation_id, created_at) ensures queries are O(log n) regardless of conversation size."

#### How do you handle typing indicators and presence?
- **The Engine Mechanism (Why it behaves this way):** Typing indicators are ephemeral events published to the conversation's pub/sub channel with a short TTL (3-5 seconds). When a user starts typing, the client sends a "typing_start" event; the server publishes it to the conversation channel, and other clients display "User is typing..." When the user stops typing or sends a message, a "typing_stop" event is published. If no stop event arrives, the indicator auto-expires after the TTL. Presence (online/offline) is tracked via WebSocket connection state — when a user connects, their status is set to online in Redis; when the connection drops (with a heartbeat timeout), it's set to offline. Presence updates are published to all conversations the user is in.
- **The Unforgettable Mental Model:** The **Hand-Raising Signal**. Typing is like raising your hand to speak — others see it temporarily. If you don't lower your hand (typing_stop), it's automatically lowered after a few seconds (TTL). Presence is like a light on your desk — on when you're at your computer, off when you leave.
- **The Trap:** Not implementing heartbeat for presence detection. If a user's browser crashes without closing the WebSocket, the server thinks they're still online. Use periodic heartbeat pings — if no ping is received within 30 seconds, mark the user as offline.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Typing indicators are ephemeral events with a 3-second TTL published to the conversation's pub/sub channel. The client sends typing_start on keystroke and typing_stop on send or blur. If no stop event arrives, the indicator auto-expires. For presence, I track WebSocket connection state in Redis with heartbeat pings every 15 seconds. If no ping arrives within 30 seconds, the user is marked offline. Presence changes are published to all the user's active conversations so contacts see real-time status."

## 8. Active recall test

1. **How do you deliver messages to users connected to different servers?**
   - **Explanation:** Use Redis Pub/Sub or Kafka for message distribution. When a message arrives, publish it to a channel keyed by conversation ID. All server instances subscribed to that channel forward the message to their connected clients in that conversation.

2. **How do you prevent duplicate messages from network retries?**
   - **Explanation:** Each message includes a client-generated idempotency key. The server checks if a message with that key already exists before persisting. Snowflake IDs provide globally unique, time-ordered message identifiers.

3. **How do you sync messages when a user reconnects after being offline?**
   - **Explanation:** The client sends its last_seen_message_id. The server queries for messages after that ID across all conversations and sends them in paginated batches (50-100). Unread counts from Redis are included.

4. **What is the typical bottleneck when scaling a chat system?**
   - **Explanation:** WebSocket connections, not message storage. A single server handles ~10K-50K concurrent WebSocket connections. Scale connection servers first, then the message broker (Kafka partitions), then the database (sharding).

5. **How do you handle @mentions in muted conversations?**
   - **Explanation:** Parse the message body for @username patterns, resolve to user IDs, and send push notifications to mentioned users regardless of mute settings. Store mentions as a separate array on the message record for efficient querying.

6. **Why use cursor-based pagination instead of offset-based for message history?**
   - **Explanation:** Offset pagination (LIMIT 50 OFFSET 1000) becomes slower as offset increases because the database scans and skips rows. Cursor pagination (WHERE id < last_id LIMIT 50) is O(log n) regardless of position.

7. **How do you detect when a user goes offline if their browser crashes?**
   - **Explanation:** Use WebSocket heartbeat pings every 15 seconds. If no ping is received within 30 seconds, mark the user as offline. This handles cases where the connection drops without a proper close event.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a real-time chat system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a real-time chat system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
