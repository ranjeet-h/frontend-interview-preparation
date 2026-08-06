# Design a notification system

## Detailed explanation

Design a notification system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, design a notification system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you design a notification system that supports multiple channels?
- **The Engine Mechanism (Why it behaves this way):** The system uses a channel-agnostic architecture: a notification event enters a queue, a dispatcher routes it to the appropriate channel handler (push, email, SMS, in-app, webhook), and each handler formats and delivers the message. The data model has: notifications (id, user_id, type, channel, status, payload, created_at), notification_templates (id, channel, type, template_body), and user_preferences (user_id, channel, type, enabled). The dispatcher reads user preferences to determine which channels to use, renders the template with payload data, and sends via the channel-specific provider (FCM for push, SendGrid for email, Twilio for SMS).
- **The Unforgettable Mental Model:** The **Post Office Sorting Facility**. Mail (notification events) arrives and is sorted by delivery method (channel). Each sorting line (handler) has its own delivery vehicle (provider) — trucks for packages (email), bikes for letters (SMS), drones for urgent (push). The recipient's preference card (user_preferences) determines which delivery methods they accept.
- **The Trap:** Hardcoding channel logic in the notification creation path. This makes adding new channels (e.g., Slack, WhatsApp) require code changes everywhere. Use a plugin architecture where each channel is a separate handler registered with the dispatcher.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use an event-driven, channel-agnostic architecture. Notifications enter as events with a type and payload. A dispatcher checks user preferences to determine which channels to use, renders the appropriate template for each channel, and routes to channel-specific handlers (FCM for push, SendGrid for email, Twilio for SMS). Each handler is a pluggable module, so adding a new channel like WhatsApp only requires registering a new handler. The data model separates notification events, templates, and user preferences for clean separation of concerns."

#### How do you handle notification delivery failures and retries?
- **The Engine Mechanism (Why it behaves this way):** Delivery failures are categorized as transient (network timeout, provider rate limit) or permanent (invalid phone number, unsubscribed email). Transient failures are retried with exponential backoff (1s, 5s, 30s, 2m, 10m) and jitter to avoid thundering herd. Permanent failures are marked as failed and not retried. A dead-letter queue holds notifications that exceed max retries (typically 3-5). The notification status is updated in the database (pending → sending → delivered/failed). Idempotency keys prevent duplicate deliveries when retries overlap with provider responses.
- **The Unforgettable Mental Model:** The **Persistent Delivery Driver**. First attempt: nobody home (timeout). Driver comes back in 5 minutes. Still nobody — comes back in 30 minutes. After 5 attempts, the driver marks it as undeliverable and returns to the depot (dead-letter queue). If the address is wrong (permanent failure), the driver knows immediately and doesn't bother retrying.
- **The Trap:** Retrying permanent failures. An invalid phone number will never become valid. Retrying wastes resources and can get your sender ID blocked by providers. Always classify errors and only retry transient ones.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd classify delivery errors as transient or permanent. Transient errors (timeouts, 5xx from providers, rate limits) are retried with exponential backoff and jitter — up to 5 attempts. Permanent errors (invalid recipient, unsubscribed, blocked) are marked as failed immediately. Failed notifications after max retries go to a dead-letter queue for investigation. Each notification has an idempotency key to prevent duplicates when retries overlap with delayed provider responses. Status transitions (pending → sending → delivered/failed) are tracked in the database."

#### How do you implement user notification preferences?
- **The Engine Mechanism (Why it behaves this way):** User preferences are stored as a matrix: user_id × notification_type × channel → enabled/disabled. For example, user 123 wants "order_shipped" via email and push but not SMS. The dispatcher checks this matrix before sending. Preferences can have granularity levels: global (all notifications off), type-level (no marketing notifications), channel-level (no SMS ever), and frequency-level (digest daily instead of instant). A notification preference service provides an API for users to manage their settings. Default preferences are applied on user registration.
- **The Unforgettable Mental Model:** The **TV Remote Control**. You can mute everything (global off), mute just commercials (type-level), turn off the sound but keep the picture (channel-level), or set a schedule (frequency-level — only notifications between 9am-9pm). Each user has their own remote.
- **The Trap:** Not having default preferences. New users receive all notifications by default, which can be overwhelming and lead to churn. Set sensible defaults (critical notifications on, marketing off) and let users opt in.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd store preferences as a user_id × type × channel matrix with four granularity levels: global, type, channel, and frequency. The dispatcher checks preferences before every send. New users get sensible defaults — critical notifications (security alerts, order confirmations) are on by default, marketing is off. Users can manage preferences through a settings API. For frequency control, I'd implement a digest system that batches non-urgent notifications into daily or weekly summaries instead of sending each one instantly."

#### How do you build real-time in-app notifications?
- **The Engine Mechanism (Why it behaves this way):** Real-time in-app notifications use WebSockets or Server-Sent Events (SSE) to push notifications to connected clients. When a notification is created, it's published to a WebSocket channel (user-specific room). Connected clients receive it instantly and display a badge/toast. The server maintains a connection registry mapping user IDs to WebSocket connections. For horizontal scaling, use a pub/sub backend (Redis Pub/Sub, Kafka) so notifications published to one server instance are forwarded to all instances. Offline notifications are stored in the database and synced when the client reconnects. Unread count is maintained with a Redis counter.
- **The Unforgettable Mental Model:** The **Pager System**. When someone pages you (notification), your pager beeps instantly (WebSocket push). If your pager was off (offline), you check the message log when you turn it back on (sync on reconnect). The front desk (server) knows which room you're in (connection registry) and can page you there.
- **The Trap:** Storing the entire notification payload in the WebSocket message for offline users. If a user was offline for a week, they'd receive thousands of messages on reconnect. Instead, store notifications in the database and let the client fetch unread notifications on reconnect.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use WebSockets for real-time delivery with Redis Pub/Sub for horizontal scaling. Each user joins a WebSocket room keyed by their user ID. When a notification is created, it's published to the user's room via Redis Pub/Sub, and all server instances forward it to connected clients. For offline users, notifications are stored in the database. On reconnect, the client fetches unread notifications via a REST API. I'd maintain an unread count in Redis for fast badge updates. SSE is a simpler alternative if bidirectional communication isn't needed."

#### How do you prevent notification spam and rate limit per user?
- **The Engine Mechanism (Why it behaves this way):** Rate limiting is applied at multiple levels: (1) Per-user per-channel — max N notifications per hour via email, M per day via push; (2) Per-type — max N order updates per hour (consolidate into a single summary); (3) Global cooldown — minimum time between notifications of the same type to the same user; (4) Smart batching — group related notifications (e.g., "5 people liked your post" instead of 5 separate notifications). A rate limiter (token bucket or sliding window in Redis) tracks notification counts per user/channel/type. When the limit is exceeded, notifications are queued or dropped based on priority.
- **The Unforgettable Mental Model:** The **Spam Filter + Mailbox Limit**. Your mailbox (user) has a capacity limit. If too many letters arrive (notifications), the post office (rate limiter) holds extras in a warehouse (queue) and delivers them in batches. Urgent letters (security alerts) bypass the limit. Duplicate letters are combined into one.
- **The Trap:** Rate limiting without priority differentiation. A security alert ("your account was compromised") should never be rate-limited, while a marketing notification should be. Always classify notifications by priority and apply different rate limits.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement multi-level rate limiting using Redis token buckets. Each user has per-channel limits (e.g., 10 emails/hour, 50 push/day) and per-type limits (e.g., 5 order updates/hour). Critical notifications (security, payment failures) bypass rate limits entirely. For high-frequency events, I'd use smart batching — instead of sending 'X liked your post' 20 times, I'd wait 5 minutes and send '20 people liked your post.' When limits are exceeded, non-urgent notifications are queued for the next window or dropped based on priority."

#### How do you design the notification data model?
- **The Engine Mechanism (Why it behaves this way):** Core tables: notifications (id, user_id, type, channel, status, payload JSON, created_at, delivered_at, read_at), notification_templates (id, channel, type, subject_template, body_template, locale), user_preferences (user_id, type, channel, enabled, frequency), and notification_batches (id, user_id, type, status, count, first_notification_id, last_notification_id) for grouped notifications. The payload is stored as JSON to accommodate different notification types. Indexes on (user_id, status) for unread queries, (user_id, created_at) for notification history, and (type, channel) for analytics. Partition the notifications table by created_at for large-scale systems.
- **The Unforgettable Mental Model:** The **Filing Cabinet**. Each drawer is a user. Inside, folders are notification types. Each document is a notification with its content (payload), delivery method stamp (channel), and status sticker (pending/delivered/read). The template book (notification_templates) has the standard forms for each type. The preference card (user_preferences) on top says which folders the user wants to receive.
- **The Trap:** Storing rendered notification content instead of templates + payload. This wastes storage and makes it impossible to re-render notifications in different languages or with updated templates. Always store the template reference and payload separately.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The core table is notifications with id, user_id, type, channel, status, payload (JSON), and timestamps. I'd store templates separately so notifications can be re-rendered in different languages. User preferences control delivery. For high-volume systems, I'd partition the notifications table by month and use batch records for grouped notifications. Indexes on (user_id, status) support unread queries, and (user_id, created_at) supports the notification feed. The payload is JSON to accommodate varying notification structures."

#### How do you monitor notification delivery health?
- **The Engine Mechanism (Why it behaves this way):** Key metrics: delivery rate (delivered/sent), latency (time from creation to delivery), failure rate by channel and type, retry rate, dead-letter queue depth, user engagement (open rate, click-through rate), and preference opt-out rate. Dashboards show real-time delivery status, channel health (provider uptime, rate limit hits), and user impact (users not receiving notifications). Alerts fire on: delivery rate dropping below 95%, latency exceeding SLA, provider errors, and dead-letter queue growth. Per-provider metrics track FCM, SendGrid, Twilio health independently.
- **The Unforgettable Mental Model:** The **Hospital Vital Signs Monitor**. Each notification channel has its own vital signs: heart rate (delivery rate), blood pressure (latency), temperature (error rate). If any vital sign goes abnormal, alarms sound. The doctor (on-call engineer) can see which patient (channel) is sick and diagnose the issue.
- **The Trap:** Only tracking sent vs. delivered without tracking latency. A notification that arrives 2 hours late is effectively not delivered for time-sensitive use cases (OTP, security alerts). Always track delivery latency percentiles.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd track delivery rate, latency percentiles (p50/p95/p99), failure rate by channel and type, and dead-letter queue depth. Per-provider dashboards show FCM, SendGrid, and Twilio health independently. User engagement metrics (open rate, CTR) help identify content issues. Alerts fire when delivery rate drops below 95%, latency exceeds SLA thresholds, or the dead-letter queue grows beyond a threshold. I'd also track preference opt-out rates — a spike indicates notification spam."

## 8. Active recall test

1. **What is the channel-agnostic notification architecture?**
   - **Explanation:** Notifications enter as events with type and payload. A dispatcher checks user preferences, renders channel-specific templates, and routes to pluggable channel handlers (FCM, SendGrid, Twilio). Adding new channels requires only registering a new handler.

2. **How do you handle transient vs. permanent delivery failures?**
   - **Explanation:** Transient failures (timeouts, rate limits) are retried with exponential backoff and jitter (up to 5 attempts). Permanent failures (invalid recipient, unsubscribed) are marked as failed immediately. Exhausted retries go to a dead-letter queue.

3. **What are the four granularity levels for notification preferences?**
   - **Explanation:** Global (all notifications off), type-level (no marketing), channel-level (no SMS), and frequency-level (digest daily instead of instant). Users can control notifications at each level independently.

4. **How do you deliver real-time in-app notifications at scale?**
   - **Explanation:** WebSockets with Redis Pub/Sub for horizontal scaling. Each user joins a WebSocket room. Notifications are published to the user's room via Redis. Offline notifications are stored in the database and synced on reconnect.

5. **How do you prevent notification spam?**
   - **Explanation:** Multi-level rate limiting (per-user, per-channel, per-type), smart batching (combine related notifications), priority differentiation (critical notifications bypass limits), and minimum cooldown between same-type notifications.

6. **Why store templates and payloads separately instead of rendered content?**
   - **Explanation:** Separating templates from payloads enables re-rendering in different languages, updating templates without changing stored notifications, and reducing storage. The payload is the data; the template is the presentation.

7. **What metrics are critical for monitoring notification health?**
   - **Explanation:** Delivery rate, latency percentiles, failure rate by channel/type, dead-letter queue depth, user engagement (open rate, CTR), and preference opt-out rate. Track per-provider health independently.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a notification system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a notification system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
