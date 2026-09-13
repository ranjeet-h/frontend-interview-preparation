# Notification System

A notification system turns a product event into a message a person can act on. The hard part is not calling a push or email API; it is accepting the intent durably, honoring the recipient's choices, and continuing delivery when an external provider or a device is unavailable.

This interview design covers transactional and product notifications delivered through in-app inboxes, mobile push, email, and SMS. It deliberately does not design a marketing-campaign audience builder, a real-time chat protocol, or a provider's internal infrastructure. The central rule is: **persist the notification intent before asynchronous fanout.**

## 1. Clarify requirements

Functional requirements:

- Internal product services create notifications for one recipient or a defined recipient group.
- Recipients can read an in-app inbox while online or after reconnecting, receive push, email, or SMS when eligible, and mark an in-app item read.
- Recipients can control channel and category preferences, including quiet hours; urgent categories have an explicitly documented override policy.
- Senders select a versioned template and supply only its validated variables.
- The system records notification and per-channel delivery status, accepts provider callbacks, and safely retries eligible failures.

Non-functional interview assumptions: acceptance is durable before the API responds; delivery is at-least-once to a channel but effectively-once in the recipient experience through idempotency and deduplication; lower-priority notifications may be delayed during a provider incident; sensitive content is protected in transit and at rest.

## 2. Estimate scale

All values in this section are explicit interview assumptions:

- Assume 20 million daily active recipients and 50 million notification intents on an average day.
- Assume an average of 50 million divided by 86,400 seconds, or about 580 accepted intents per second; assume a peak multiplier of 20, giving about 12,000 accepted intents per second.
- Assume each accepted intent expands to an average of 1.5 enabled channels, so peak dispatch work is about 18,000 channel deliveries per second before retries.
- Assume a rendered payload and its durable metadata average 2 KB. At the assumed 50 million daily intents, that is roughly 100 GB of new logical data per day before replicas and indexes.
- Assume in-app inbox reads outnumber creates by 10:1, and assume the synchronous acceptance target is below 100 ms at the service boundary; provider delivery time is asynchronous and not part of that acceptance target.

These assumptions make durable write throughput and provider isolation more important than making every delivery synchronous.

## 3. Define APIs

An authenticated internal service creates a durable intent with an idempotency key:

```http
POST /notifications
Idempotency-Key: order-7281-paid
Content-Type: application/json

{
  "recipientId": "user-42",
  "category": "transactional",
  "templateId": "payment-receipt",
  "templateVersion": "v3",
  "variables": { "orderId": "order-7281", "amount": "499.00" },
  "priority": "high",
  "requestedChannels": ["in_app", "push", "email"]
}
```

```json
{
  "notificationId": "ntf_01J...",
  "status": "accepted",
  "acceptedAt": "2026-08-28T10:00:00Z"
}
```

`GET /users/{userId}/notification-preferences` reads a recipient's effective preferences. `PUT /users/{userId}/notification-preferences` replaces a validated preference document, including category settings, allowed channels, and quiet-hours timezone/range. The inbox client reads `GET /users/{userId}/notifications?cursor=...` and sends a read receipt with `POST /notifications/{notificationId}/read`.

Provider adapters receive signed callbacks or webhooks such as `POST /provider-callbacks/{provider}`. They verify the provider signature, map an opaque provider message ID to a `DeliveryAttempt`, and record provider-accepted, delivered, bounced, or permanently failed status. Provider callbacks are not trusted as proof that a user saw an in-app message; a client read receipt is separate.

## 4. Define the data model

The relational notification store is the source of truth for intent, preference, and delivery state. A wide-column or partitioned inbox projection is optimized for a recipient's time-ordered reads.

```text
Notification(
  notificationId, idempotencyScope, idempotencyKey, recipientId,
  category, priority, templateId, templateVersion, variablesCiphertext,
  requestedChannels, status, createdAt, expiresAt
)

DeliveryAttempt(
  attemptId, notificationId, channel, provider, providerMessageId,
  status, attemptNumber, scheduledAt, sentAt, completedAt,
  failureClass, failureDetail
)

UserPreference(
  recipientId, category, allowedChannels, quietHours, timezone,
  fallbackPolicy, version, updatedAt
)

Template(
  templateId, version, channel, locale, subject, body, variableSchema,
  active, createdAt
)

DeviceSubscription(
  subscriptionId, recipientId, platform, tokenCiphertext,
  tokenState, lastSeenAt, updatedAt
)
```

`Notification` has a unique index on `(idempotencyScope, idempotencyKey)` and is retained according to product and compliance policy. `DeliveryAttempt` is indexed by `(notificationId, channel)` and `providerMessageId` for callbacks. The inbox projection is partitioned by `recipientId` and ordered by `createdAt`; it is a rebuildable read model, while `Notification` remains authoritative. Store templates by immutable version so a retry renders the same approved content rather than silently changing an already accepted message.

## 5. Draw the high-level architecture

```text
Product service / client
  -> API gateway -> Notification API -> durable notification store + outbox
                                      |
                                      v
                              event queue / relay
                                      |
                                      v
                       preference + template resolver
                                      |
                                      v
                  independently throttled channel workers
                    | in-app          | push/email/SMS
                    v                 v
             inbox projection     provider adapters -> providers
                    |                 |
                    +------> delivery attempts / status store <--- provider callbacks / webhooks
                                      ^
                                      | immediate provider response
                                      +----------- provider adapters
                                      |
                    retryable failure | permanent or exhausted failure | terminal state
                                      v                 v                         v
                              retry queue        dead-letter queue       final delivery status
                                      |                 |
                                      v                 v
                              channel workers    operator inspection / replay
                                                        |
                                                        +--> retry queue
```

The notification API is stateless. Its transaction writes both the durable intent and an outbox record; a relay publishes the outbox record to the event queue. This avoids the dual-write failure where an accepted row exists but no worker ever sees it.

## 6. Walk through the main request flow

1. A payment service calls `POST /notifications` with a stable idempotency key. The API authenticates the caller, validates recipient, template version, variables, category, priority, expiry, and allowed requested channels.
2. In one transaction, the API inserts `Notification(status=accepted)` and its outbox record. A duplicate key returns the original notification ID and status instead of creating a second intent. The API can now return `accepted`; it does not wait for any provider.
3. The outbox relay publishes the intent event. If it crashes after publish, the consumer's idempotent processing makes replay safe; if it crashes before publish, the stored outbox record remains available.
4. A resolver loads the current preference version, evaluates category permission and quiet hours in the recipient's timezone, loads the immutable template, creates the in-app inbox item, and produces eligible channel jobs. A suppressed channel is recorded as `suppressed`, not mistaken for a delivery failure.
5. Each channel worker creates or resumes a `DeliveryAttempt`, applies its own recipient and provider rate limits, and calls its adapter. In-app delivery writes the offline inbox first and may additionally publish to a connected-session gateway. Push, email, and SMS adapters translate the common job into their provider request.
6. The adapter records the immediate provider response. A retryable failure goes to a delayed retry queue with exponential backoff and jitter; a permanent failure becomes final. Signed callbacks may later advance a provider-accepted attempt to delivered, bounced, or failed.
7. When the configured primary channel ends permanently unavailable, the fallback policy may enqueue an eligible secondary channel. A final notification status summarizes per-channel outcomes without claiming a recipient read an external message.

## 7. Identify bottlenecks

Large broadcasts can turn one intent into a large recipient fanout. Expand audiences in bounded batches, partition fanout work, and isolate campaign traffic from transactional priority queues. A single busy recipient or tenant can also create a hot inbox partition; use bounded per-recipient write concurrency and an explicit product policy for coalescing low-priority alerts.

Provider quotas and outages are expected bottlenecks. Per-provider adapters need independent worker pools, token-bucket limits, bounded connection pools, and circuit breakers so a slow SMS provider cannot block push or in-app delivery. Preference lookups and template rendering can become read hotspots; cache versioned, bounded-size data and preserve a durable fallback read.

## 8. Scale each component

Load balance stateless API and resolver workers horizontally. Partition event-queue topics by recipient ID for a recipient's ordering-sensitive notifications; a broadcast fanout topic uses an audience or campaign key so a single partition is not overwhelmed. Preserve ordering only where the product needs it, such as payment-state notifications for one recipient; do not impose a global order across unrelated users.

Shard the authoritative notification store by recipient or tenant scope once a single primary is insufficient, with replicas for failover and read scaling. Partition the inbox projection by recipient ID and split exceptionally active recipients by a bounded time bucket if measurements require it. Deploy separate queues and worker pools for in-app, push, email, and SMS, then autoscale from lag, processing duration, and provider quota headroom.

## 9. Caching strategy

Use cache-aside for `UserPreference` with key `preference:{recipientId}`, value the versioned effective preference document, a bounded TTL, and invalidation after a successful preference update. A cache miss reads the authoritative store; briefly stale preferences are acceptable only for non-urgent notifications, while a high-risk category can require a fresh read.

Use cache-aside for immutable `Template` versions with key `template:{templateId}:{version}:{locale}`. Its value is the validated compiled template and variable schema; it can use a long bounded TTL because the version is immutable. A miss reads the template store, and an inactive or missing version rejects a new intent rather than guessing content.

Do not treat cached device subscriptions as authoritative. A cache may speed token lookup, but an expired-token response updates the durable `DeviceSubscription` to disabled and invalidates the cache. Delivery status is written through to the authoritative store, never deferred in a write-back cache.

## 10. Database scaling and consistency

The acceptance transaction needs strong consistency: the idempotency record, `Notification`, and outbox record either commit together or none does. Delivery-attempt state transitions use conditional updates so a late callback cannot overwrite a newer terminal state. The outbox can be read from the primary or a safely replicated change stream, but the relay must reconcile unpublished rows.

Inbox entries, analytics aggregates, provider dashboards, and search indexes can be eventually consistent projections. Read replicas can serve preferences and templates when replication lag is within the chosen risk policy; preference changes publish invalidations and the resolver records the version it used for auditability. Archive expired notification bodies and attempt detail under the documented retention policy while retaining minimal audit metadata only as long as required.

## 11. Handle concurrency

The invariant is: **one accepted idempotency key creates one notification intent, and no channel sends the same logical delivery twice without the duplicate being identifiable.** A unique database constraint is the first defense for concurrent API retries. Consumers use `notificationId + channel` as their idempotent delivery key and create attempts with a conditional insert or compare-and-set transition.

At-least-once queue processing means a worker can crash after the provider call but before recording success. Pass the provider an idempotency reference when it supports one; otherwise store the request fingerprint and provider message ID, reconcile ambiguous timeouts through callbacks or provider lookup, and prefer a delayed retry over an immediate duplicate. Clients deduplicate in-app notifications by `notificationId`.

Quiet hours are evaluated at dispatch time and rechecked before a delayed send. The resolver records the preference version and planned channel so a concurrent preference edit is auditable; an explicit product policy decides whether an already queued non-urgent job is canceled, re-evaluated, or allowed to continue.

## 12. Reliability and failure handling

Use short timeouts, exponential backoff with jitter, and a retry budget for transient provider errors, network failures, and recoverable rate-limit responses. Delay jobs until the provider's indicated retry window when available. Open a circuit breaker after sustained provider failure; route work to the retry queue and protect other channels from connection-pool exhaustion.

After the bounded retry policy is exhausted, put the job and failure context in a dead-letter queue. Operators can inspect, repair, replay, or permanently suppress it without blocking a queue partition. Reconcile notification rows that remain nonterminal too long, outbox rows that were never published, and provider callbacks that arrive before or after a worker records its response.

An expired or unregistered push token is a permanent channel failure: disable that `DeviceSubscription`, invalidate its cache entry, and consider the configured fallback. A bounced email, invalid phone, or user opt-out is likewise terminal for that channel. Never use fallback to bypass an explicit channel opt-out or quiet-hours rule; use it only where the recipient policy and notification category allow it.

## 13. Availability versus consistency trade-offs

During a queue or provider partition, the API still accepts a notification if it can durably commit the intent and outbox record; the user may observe delayed delivery rather than a lost request. This favors availability at the acceptance boundary while protecting the durable-intent invariant.

If the authoritative preference store is unavailable, delaying a non-urgent external channel is safer than sending against an unknown opt-out or quiet-hours setting. The in-app inbox can remain available from a previously persisted eligible item only when product policy permits it. A globally exact ordering of every notification would reduce availability and throughput, so the design provides per-recipient ordering only for categories that need it.

## 14. Security

Authenticate internal callers with scoped service identities and authorize which categories, templates, and recipient scopes they may use. Authenticate end users before reading inboxes or changing preferences; authorize access by recipient ID rather than trusting a path parameter. Rate-limit the create endpoint by caller and tenant to stop an abused service from becoming a spam source.

Validate template variables against an allowlisted schema, encode rendered output for its channel, and prevent URL, header, or SMS-content injection. Encrypt provider credentials and device tokens, redact message bodies and phone/email identifiers from logs, use TLS for every hop, and encrypt sensitive durable fields at rest. Verify webhook signatures and replay windows, keep provider secrets in a secrets manager, audit preference changes and privileged sends, and honor consent/deletion requirements.

## 15. Monitoring and observability

Trace a notification ID from acceptance through outbox publish, preference resolution, each attempt, provider callback, and final status. Structured logs include the notification ID, channel, template version, preference version, provider, failure class, and correlation ID, but not raw message bodies or destination secrets.

Monitor API acceptance latency and errors, transactional-write health, outbox age, queue lag by priority and channel, worker saturation, cache hit rate, database replication lag, retry depth, dead-letter growth, and circuit-breaker state. Domain dashboards show delivery success by provider and channel, suppression reasons, expired-token rate, duplicate-prevention events, fallback rate, time-to-provider-acceptance, time-to-deliver, and the share of notifications that reach a final status. Alert on rising queue lag, unexpected opt-out violations, provider failure concentration, and a growing population of nonterminal intents.

## 16. Discuss trade-offs

| Choice | Why | Alternative | Trade-off |
|---|---|---|---|
| Transactional outbox before fanout | Durable acceptance cannot be lost between database write and queue publish | Direct database and queue dual write | Adds relay and reconciliation work, but removes an unrecoverable gap |
| Per-channel workers and adapters | Provider limits, credentials, and failures stay isolated | One generic synchronous sender | More operational components, but no slow provider blocks every channel |
| At-least-once delivery with idempotency | Works with retried queues and unreliable provider calls | Exactly-once external delivery | Duplicates remain possible at the network edge, so clients and providers need deduplication |
| Durable inbox plus optional live in-app push | Offline users can read missed notifications | WebSocket-only delivery | Extra storage and read-model maintenance, but no loss on disconnect |
| Preference resolution at dispatch | Current opt-outs and quiet hours are honored | Resolve only at acceptance | A queued job can be delayed or suppressed later, which complicates final status |
| Fallback only by explicit policy | Improves reachability without becoming spam | Always send all channels | Some alerts remain undelivered, but user consent and channel intent are respected |

## 17. Future improvements

Add multi-region active delivery with recipient-home-region routing and tested disaster recovery. Introduce digesting, category-level coalescing, send-time optimization, and accessibility/localization checks for non-urgent messages. Build stronger compliance controls, auditable retention/deletion workflows, provider-cost routing, and a replay sandbox for safely testing templates and adapter changes against scrubbed events.

## Likely follow-ups

- How would you deliver a broadcast without expanding every recipient at once or starving transactional work?
- How would you prove whether a timeout after a provider call created a duplicate delivery?
- When should a payment confirmation bypass quiet hours, and which fallback channels may it use?

## Interview recap

The answer is: **persist notification intent first, then deliver through independently throttled channel workers.** The durable intent and transactional outbox make acceptance recoverable; preferences, templates, adapters, delivery attempts, retries, dead-letter handling, and explicit fallback policies make multi-channel delivery safe to operate.

For a longer real-time and connection-oriented discussion, see the existing [distributed notification service deep dive](../../../backend/system-design/design-a-distributed-notification-service.md).
