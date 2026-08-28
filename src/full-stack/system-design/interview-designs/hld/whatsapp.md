# WhatsApp

A WhatsApp-like system is a real-time messaging system whose primary promise is that an accepted text message is not lost when a recipient, device, or gateway is offline. This design covers one-to-one and group text messages, history, online/offline delivery, delivery and read receipts, and multi-device synchronization. It does not design voice/video calls or a full end-to-end cryptographic protocol; both are future work. The central rule is: **persist once, assign an ordering position, then deliver at least once and deduplicate on clients.**

## 1. Clarify requirements

Functional requirements:

- A user can create or participate in a one-to-one or group conversation and send text messages from any registered device.
- Participants can load conversation history, receive messages while online, and catch up after a device reconnects.
- The system records sent, delivered, and read receipts per recipient device or per participant according to the product's receipt policy.
- A user's linked devices synchronize messages and receipt state without creating duplicate visible messages.
- Group membership changes are authorized and have a defined effective ordering boundary.

Non-functional interview assumptions: the send API acknowledges only after durable acceptance; delivery is at-least-once; clients deduplicate by immutable message ID; message order is guaranteed within one conversation, not across conversations; an online delivery target might be below 250 ms after durable acceptance. Presence is best-effort rather than a durable truth. Calls and the detailed end-to-end encryption key protocol are deliberately outside this chapter.

## 2. Estimate scale

Use explicit interview assumptions:

- Assume 100 million daily active users, 1 billion accepted text messages per day, and an average of 1.4 active devices per user.
- One billion divided by 86,400 seconds is about 11,600 messages per second on average. With a peak multiplier of 20, design the write path for about 230,000 messages per second.
- Assume a text message plus metadata averages 1 KB before replication. That is about 1 TB of new logical message data per day, excluding media and indexes.
- Assume a typical group has 20 recipients, while a small fraction have thousands. Fanout therefore dominates delivery work even though it does not multiply the durable message write.
- Assume online sockets number in the tens of millions, so connections are sharded across gateway fleets and connection state cannot live only in a gateway's memory.

These numbers prioritize conversation-partitioned durable writes, streaming fanout, and independent connection scaling over a single globally ordered log.

## 3. Define APIs

The client sends through a WebSocket after authenticating the device. A stateless HTTP API can use the same command contract for a fallback or initial sync.

```json
{
  "type": "message.send",
  "clientMessageId": "device-a:1842",
  "conversationId": "conv_81",
  "body": { "kind": "text", "text": "Are we still on for 7?" },
  "clientSentAt": "2026-08-28T10:00:00Z"
}
```

```json
{
  "type": "message.accepted",
  "messageId": "msg_01J...",
  "conversationId": "conv_81",
  "position": 483,
  "acceptedAt": "2026-08-28T10:00:00Z"
}
```

Clients receive `message.deliver` events containing `messageId`, `conversationId`, `position`, sender, body, and receipt state. They acknowledge a receipt with an idempotent event such as `receipt.update { messageId, deviceId, status: "delivered" | "read", cursor }`. History and reconnect use `GET /conversations/{conversationId}/messages?afterPosition=482&limit=100`; a device sync uses `GET /devices/{deviceId}/sync?cursor=...`. Presence events are advisory: `presence.changed { userId, state: "online" | "offline", observedAt }`.

## 4. Define the data model

The source of truth is a durable, conversation-partitioned message store. A conversation-local position provides the ordering contract.

```text
Conversation(
  conversationId, type: direct|group, homeRegion, nextPosition,
  createdAt, membershipVersion, metadata
)

Participant(
  conversationId, userId, role, joinedAtPosition, leftAtPosition,
  membershipVersion, state
)

Message(
  conversationId, position, messageId, senderId, senderDeviceId,
  clientMessageId, bodyCiphertext, bodyKind, createdAt, membershipVersion
)

Device(
  deviceId, userId, publicKeyReference, state, lastSyncCursor, lastSeenAt
)

DeliveryReceipt(
  messageId, recipientUserId, recipientDeviceId, status,
  deliveredAt, readAt, cursor
)
```

`Message` is keyed by `(conversationId, position)` and has a unique idempotency constraint on `(senderDeviceId, clientMessageId)`. The write transaction allocates `nextPosition`, inserts the message, and writes an outbox event. `Participant` records position-based membership boundaries: a new member does not automatically receive older history unless product policy explicitly grants it. Per-device receipts can be compacted into a participant-level summary after all linked devices advance, while preserving the data needed for multi-device synchronization.

## 5. Draw the high-level architecture

```text
Sender device
  -> WebSocket gateway -> stateless Message API
                              |
                              v
               conversation-partitioned message store + outbox
                              |
                              v
                        outbox relay / event stream
                              |
                              v
                         delivery workers
                    /              |              \
                   v               v               v
      connection directory     offline queue   media reference service
            |                     |                 |
            v                     v                 v
 WebSocket gateway fleet   sync/history API     object storage + CDN
            |
            v
 recipient devices -> receipt events -> receipt store + outbox
```

WebSocket gateways terminate long-lived authenticated device connections but keep no authoritative messaging state. Their ephemeral connection registrations live in a sharded connection directory keyed by user and device. The Message API and delivery workers are stateless; each consumes work for a conversation partition in order.

## 6. Walk through the main request flow

1. The sender device sends `message.send` with a stable `clientMessageId`. Its gateway authenticates the device, applies device and conversation rate limits, and forwards the command to the Message API.
2. The API validates membership, payload size, and the current group membership version. In one conversation-partition transaction, it deduplicates a retry, assigns the next `position`, writes `Message`, and writes an outbox record. Only then does it return `message.accepted`.
3. The outbox relay publishes the accepted message to an event stream partitioned by `conversationId`. A relay crash before publish is recoverable from the outbox; a crash after publish is safe because consumers are idempotent.
4. A delivery worker reads the ordered conversation event, resolves the participant snapshot appropriate for that position, and creates idempotent per-device delivery work. The durable message is written once; recipient fanout is asynchronous.
5. For an online device, the worker looks up the current gateway in the connection directory and asks it to send `message.deliver`. For an offline or unreachable device, it appends an idempotent item to that device's offline queue. A failed gateway write may also become offline work, because online delivery is not proof of durability.
6. The client stores the message by `messageId`, ignores a duplicate delivery, advances its per-conversation cursor only after it can render the ordered position, and sends delivered/read receipt events. Receipt processing is idempotent and streams updates to the sender's linked devices.
7. On reconnect, a device registers its new gateway connection and supplies its persisted cursor. The sync service reads all missing conversation positions after that cursor and drains any offline queue entries; client deduplication makes overlap between the two sources safe.

## 7. Identify bottlenecks

Connection gateways face millions of idle sockets, reconnect storms after a network event, and uneven device routing. Use load-balanced gateway fleets, heartbeat timeouts with jitter, bounded write buffers, and a sharded directory with short TTL registrations. A gateway must not block its event loop on a slow recipient.

The message store and event stream can see hot conversations. A normal conversation maps to one partition, which preserves order but caps its single-partition throughput. Detect hot groups, apply member and sender quotas, batch fanout, and use a dedicated high-capacity partitioning strategy for the group. Do not blindly split one ordered conversation across independent writers; that would break the ordering contract. Product policy may restrict extremely large groups or use a sequencer that remains the single position authority.

Fanout and receipt volume grow with group size and device count. Delivery workers use bounded batches, backpressure, and separate pools for real-time sends, offline materialization, and receipt aggregation so a large group cannot starve direct messages.

## 8. Scale each component

Partition the authoritative message store and event stream by `conversationId`; route all writes for a conversation to its home region and ordered partition. Add replicas for history reads and regional failover, while keeping the position allocator single-writer per conversation partition. Hash-shard the connection directory by user or device ID, with a gateway-owned registration refreshed by heartbeat.

Scale WebSocket gateways by concurrent connections and outbound-buffer pressure, not CPU alone. Scale delivery workers by event lag and fanout cost, with per-conversation fairness. Store offline queues by recipient device or user, but treat them as a convenience projection: reconnect cursors plus durable history remain the correctness backstop. Put media bytes in object storage and send only an authorized media reference in `Message`; uploads, virus scanning, retention, and CDN delivery are separate from text-message ordering.

## 9. Caching strategy

Cache active conversation membership with a versioned key such as `conversation:{conversationId}:members:{membershipVersion}`. Invalidate or publish a newer version after a membership transaction; the write path falls back to the authoritative store on a miss. Cache only bounded, authenticated membership data and revalidate authorization for a send.

The connection directory is already ephemeral state and can use a TTL-backed in-memory or distributed cache. A stale entry causes a failed live send followed by offline enqueue; it never makes a message disappear. Cache recent conversation metadata and media authorization metadata carefully, but do not use a cache as the source of truth for message history, ordering positions, or receipts.

## 10. Database scaling and consistency

The critical transaction is strongly consistent within one conversation partition: validate idempotency, allocate the next position, insert the message, and insert the outbox event atomically. This prevents an accepted message with no order or a durable message with no delivery event. The message history read path can be served by a replica only when its cursor is sufficiently caught up; otherwise read from the partition leader for a just-sent message.

Delivery queues, connection registrations, search indexes, analytics, and receipt summaries are eventually consistent projections. They may replay events, so every consumer uses `messageId` or a derived delivery key for idempotency. Do not promise a globally serial order: two different conversations can advance independently, and a participant may see their events interleaved.

## 11. Handle concurrency

The invariant is: **a sender retry creates at most one durable message, and each durable message has exactly one immutable position within its conversation.** The `(senderDeviceId, clientMessageId)` unique key turns a resend after timeout into the original `messageId` and position. Conditional update or a per-partition sequencer protects `nextPosition` from concurrent senders.

At-least-once event delivery means a worker can send to a gateway and crash before recording progress. Delivery jobs, offline-queue rows, and receipt updates use idempotency keys, while clients deduplicate by `messageId`. Clients buffer a later position until a missing earlier one arrives or request history after the last contiguous cursor; this preserves per-conversation presentation order despite retries and multi-device races.

For groups, the worker uses the membership version captured at acceptance. A concurrent leave applies only from its effective position onward, so the system can explain whether a message belongs to a recipient's history and fanout set.

## 12. Reliability and failure handling

The outbox relay continuously scans unpublished rows and publishes with retry and backoff. Consumers commit their stream offset only after their idempotent side effect is durable. Reconciliation jobs compare message rows, outbox records, offline queues, and delivery state for stranded work; a dead-letter queue preserves poison events for inspection and controlled replay.

A gateway disconnect, directory timeout, or client acknowledgement timeout is handled as an uncertain online delivery, not message loss. The worker retries bounded live delivery or records offline work. When a device reconnects, durable history queried by cursor repairs any missing delivery even if an offline-queue write failed. Receipt events can be retried safely; a later `read` state must not regress to `delivered`.

Use rate limits and quotas to protect storage and fanout. Shed nonessential presence updates before rejecting durable sends, and expose explicit retryable errors when the conversation partition cannot accept a write. Back up message data, test restore and regional failover procedures, and retain messages and receipts according to product and legal policy.

## 13. Availability versus consistency trade-offs

For a conversation whose home partition is unavailable, reject or retry a new send rather than accept it without a durable ordered position. This chooses consistency and no-loss semantics over write availability for that conversation. Other conversations remain available because they use independent partitions.

After the durable transaction succeeds, delivery can be asynchronous and temporarily unavailable. A user might not receive an online socket event immediately, but history and reconnect synchronization will eventually expose the message. Thus **message durability is a stronger guarantee than online delivery**. Best-effort presence may be stale; treating it as authoritative would create unnecessary failed-send or privacy problems.

## 14. Security

Authenticate each device during WebSocket connection and bind its session to a user and device ID. Authorize every command against current membership and roles; do not trust a client-supplied recipient list for a group. Use TLS in transit, encrypt sensitive message and device metadata at rest, apply payload-size and abuse limits, and redact message bodies, tokens, and contact identifiers from logs and traces.

This chapter leaves full end-to-end encryption protocol design out of scope, but its boundary is explicit: the message service stores and routes opaque ciphertext plus the metadata needed for ordering and delivery. Future work must address key lifecycle, device verification, group membership key changes, backup semantics, and metadata minimization. Media uploads receive short-lived scoped authorization and are scanned before becoming downloadable; object storage access must be authorized independently of a guessed URL.

## 15. Monitoring and observability

Trace `messageId` from gateway acceptance through durable write, outbox publish, stream consumption, per-device delivery, offline enqueue, reconnect sync, and receipt transition. Structured logs include correlation IDs, conversation partition, position, event attempt, gateway ID, and failure class, but omit plaintext bodies and credentials.

Monitor send acceptance latency and errors, position-allocation contention, outbox age, stream lag, per-conversation skew, hot-group fanout duration, gateway connections, heartbeat failures, outbound buffer saturation, directory staleness, offline-queue depth, sync latency, duplicate-drop rate, receipt lag, and replica lag. Alert on a growing gap between durable messages and delivery work, a stuck conversation partition, reconnect storms, or a cohort whose cursor stops advancing.

## 16. Discuss trade-offs

| Choice | Why | Alternative | Trade-off |
|---|---|---|---|
| Conversation-local sequence | Gives a clear ordering contract where users need it | Global sequence | Higher global coordination and lower availability are avoided, but cross-conversation order is undefined |
| Transactional outbox | Makes accepted messages recoverable for fanout | Direct store-plus-stream dual write | Adds relay and reconciliation work, but removes a lost-event gap |
| At-least-once delivery plus client deduplication | Tolerates retries and ambiguous gateway failures | Exactly-once network delivery | Clients must retain message IDs and handle duplicate events |
| Offline queue plus cursor-based history | Speeds reconnect while durable history remains authoritative | WebSocket-only delivery | Adds a projection to operate, but disconnects do not lose messages |
| Best-effort connection directory | Enables fast online routing | Durable synchronous presence system | A stale route adds a fallback attempt, but does not affect durability |
| Object storage for media | Keeps large bytes out of ordered message partitions | Store media inline with messages | Requires upload and authorization flow, but protects text write throughput |

## 17. Future improvements

Add multi-region active routing with tested conversation-home failover, stronger group membership audit controls, searchable local or server-side history subject to privacy requirements, and retention/deletion workflows. Improve hot-group handling with adaptive fanout, fairness controls, and product limits based on measured partition saturation.

Future work also includes voice/video call signaling and media relays, as well as a complete end-to-end cryptographic protocol: identity verification, per-device and group key management, forward secrecy, secure backup recovery, and privacy-preserving metadata handling.

## Likely follow-ups

- How would you migrate a conversation to another region without changing its ordering semantics?
- How would you prevent a 100,000-member group from delaying one-to-one messages?
- What does the server know and not know when the message body is end-to-end encrypted?

## Interview recap

The answer is: **persist once, assign an ordering position, then deliver at least once and deduplicate on clients.** A durable conversation-partitioned message and outbox establish the truth; live gateways, offline queues, receipts, and reconnect cursors make that truth reach every linked device despite disconnections and retries.

For a longer connection-oriented discussion, see [Design a Real-Time Chat System](../../../backend/system-design/design-a-real-time-chat-system.md).
