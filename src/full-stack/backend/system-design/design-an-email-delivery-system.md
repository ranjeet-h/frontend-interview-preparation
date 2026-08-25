# Design an Email Delivery System

## 1. Understand the Problem First — Clarify Before Designing

Imagine a flash sale kicks off at midnight. Millions of users rush to checkout, but one-time login passwords and order receipts are stalled in a massive queue behind a ten-million-recipient marketing campaign. Customers cannot log in, checkouts are abandoned, and support queues explode. Even worse, the marketing blast hit hundreds of spam traps because of a stale contact list. Destination mailboxes like Gmail and Outlook immediately flag your company's domain as a spam source, tanking your reputation. Suddenly, even critical password reset emails are routed straight to spam or dropped at the network boundary.

An email delivery system is not just an API wrapper around SMTP. It is a high-throughput, fault-tolerant infrastructure responsible for routing, rendering, authenticating, and delivering mission-critical messages while actively protecting domain and IP reputation.

Before sketching components on a whiteboard, a senior engineer clarifies the operational boundaries with the interviewer:

- **Throughput and Scale:** What volume are we targeting? Let us assume 100 million emails per day, with peak burst throughput reaching 10,000 to 20,000 emails per second during major promotional events.
- **Traffic Classification and Latency SLAs:** What is the breakdown between transactional messages (one-time passwords, purchase confirmations, password resets) and marketing campaigns (newsletters, promotional blasts)? Transactional emails demand P99 delivery under 5 seconds. Marketing campaigns require high throughput over a window of minutes to hours.
- **Delivery Scope and Protocol Boundary:** Are we building an internal distribution platform that integrates with external cloud email service providers (such as AWS SES, SendGrid, or Mailgun), or are we operating bare-metal Mail Transfer Agents (MTAs like Postfix, Haraka, or KumoMTA) opening direct port 25 SMTP connections to recipient MX servers? A modern enterprise design balances multi-provider cloud routing with dedicated IP pool orchestration.
- **Reliability and Guarantees:** We require at-least-once delivery with strict idempotency so no customer receives duplicate billing receipts or multiple password resets for a single user action.
- **Compliance and Deliverability:** We must support end-to-end authentication (SPF, DKIM, DMARC), template localization, engagement tracking (opens and clicks), automated bounce management, and an enforceable suppression list.

## 2. The Core Insight — The Decision Everything Else Flows From

The single most critical architectural insight in email delivery is that **delivery is a reputation and isolation problem, not a messaging throughput problem**.

Pushing millions of JSON objects through a message broker is straightforward. However, the destination mail servers run by Google, Microsoft, and Yahoo treat all inbound SMTP connections as potentially malicious. If your high-priority transactional emails share the same sending queues, IP addresses, or sending domains as bulk marketing campaigns, a single poorly vetted marketing list will poison your IP reputation. When that happens, destination providers throttle or blacklist your entire network, taking down business-critical login and transaction flows.

Every component in this system flows from two non-negotiable boundaries:

1. **Queue and Rate-Limiting Isolation:** Transactional traffic and marketing traffic must never contend for the same worker pools, rate-limit budgets, or queue partitions.
2. **Domain and IP Pool Segregation:** Transactional mail must originate from distinct subdomains and warmed, dedicated IP pools, isolated from the riskier reputation profile of bulk campaigns, backed by real-time bounce and complaint feedback loops.

## 3. High-Level Architecture — Components and Why Each Exists

The system is organized into modular services separated by asynchronous boundaries to ensure backpressure control and fault isolation:

- **API Gateway & Ingestion Layer:** Exposes RESTful endpoints for internal services. It validates payloads, authenticates client microservices, enforces per-tenant rate limits, and validates `Idempotency-Key` headers to prevent duplicate sends.
- **Suppression Filter & Pre-Flight Validator:** Performs an ultra-fast in-memory check against a global suppression list. If a recipient address has hard-bounced or unsubscribed in the past, the request is discarded immediately before consuming queue or rendering resources.
- **Template & Localization Engine:** Pulls versioned template definitions (written in responsive markup such as MJML or React Email) from a high-speed cache or object storage, merges dynamic recipient data, and produces both HTML and plain-text output.
- **Priority Message Broker:** Decouples ingestion from delivery. It separates traffic into three distinct streams: High-Priority Transactional, Scheduled/Delayed, and Bulk Marketing.
- **Dispatch Workers & Rate Orchestrators:** Consume jobs from the queues, apply per-domain token bucket rate limiting (to respect recipient ISP throttling rules), sign the message headers with DKIM cryptographic keys, and dispatch payloads to external providers or internal MTAs.
- **Multi-Provider Router:** Manages outbound traffic across multiple cloud providers (AWS SES, SendGrid) and internal MTAs with health-check-driven dynamic failover.
- **Webhook Ingestion Pipeline:** Receives asynchronous delivery, bounce, and spam complaint events from sending providers, forwarding them to the bounce processor.
- **Suppression Store & Metadata DB:** Maintains the authoritative record of message states, hard bounces, spam complaints, and user opt-outs across the organization.
- **Engagement & Tracking Service:** Handles link redirection for click tracking and serves 1x1 transparent GIFs for open detection, streaming event logs to an analytics data store.

```txt
Upstream Microservices (Auth, Checkout, Marketing)
                    │ (POST /v1/email/send with Idempotency-Key)
                    ▼
┌────────────────────────────────────────────────────────┐
│                   API Gateway Layer                    │
│      [Auth]  [Validation]  [Idempotency Check]         │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│             Template & Suppression Filter              │
│   • Render MJML/HTML via Template Registry (S3/Cache)  │
│   • Check Global Suppression List (Redis Bloom/Set)    │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│                 Priority Message Queues                │
│  ├── High-Priority Queue (Transactional / OTP / P99<5s)│
│  ├── Scheduled Queue (Redis ZSET score=send_at UTC)    │
│  └── Bulk / Marketing Queue (Batch campaigns)          │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│               Delivery Workers & Routers               │
│     [Token Bucket Rate Limiter]  [DKIM Signer]         │
│     [Provider Router: Primary SES / Secondary SendGrid]│
└───────────────┬────────────────────────┬───────────────┘
                │ (SMTP / REST API)      │ (Webhooks)
                ▼                        ▼
┌──────────────────────────────┐   ┌─────────────────────┐
│  External Providers / MTAs   │   │ Webhook Collector   │
│  (AWS SES / SendGrid / MTAs) │   │ (Deliveries/Bounces)│
│  ├── Dedicated Transaction IP│   └──────────┬──────────┘
│  └── Dedicated Marketing IP  │              ▼
└───────────────┬──────────────┘   ┌─────────────────────┐
                ▼                  │ Bounce & Complaint  │
┌──────────────────────────────┐   │ Processor Worker    │
│ Destination Inboxes          │   └──────────┬──────────┘
│ (Gmail, Outlook, Yahoo)      │              ▼
└──────────────────────────────┘   ┌─────────────────────┐
                                   │  Suppression Store  │
                                   │  & Analytics DB     │
                                   └─────────────────────┘
```

A standard request executes through this lifecycle:

1. An upstream service (such as Checkout) calls `POST /v1/email/send` passing recipient details, template ID, parameters, and an idempotency key.
2. The Gateway validates inputs and checks Redis for an active idempotency lock.
3. The Suppression Filter verifies that the recipient email is not blocked.
4. The Template Engine compiles the HTML and plain-text bodies with the supplied variables.
5. The message is pushed to the High-Priority Queue.
6. A delivery worker pulls the message, checks the recipient domain (e.g. `gmail.com`), queries the Token Bucket to ensure sending limits are not exceeded, signs the email with the domain's DKIM private key, and calls the primary cloud provider API over a dedicated transactional IP pool.
7. The provider transmits the email to Gmail's MX servers over TLS.
8. Gmail returns an initial acceptance response. Later, if the mailbox does not exist, Gmail generates an asynchronous bounce notification, which arrives at our Webhook Collector to update the Suppression Store.

## 4. Key Technical Decisions — With Real Tradeoffs

**Multi-Provider Cloud APIs vs Self-Hosted Mail Transfer Agents (MTAs)**
- *Decision:* Use a multi-provider cloud abstraction layer (primary AWS SES with secondary SendGrid fallback) rather than maintaining self-hosted MTAs from the beginning.
- *Rejected:* Operating self-hosted Postfix or Haraka MTAs on bare-metal virtual machines.
- *Tradeoff:* Cloud providers charge a per-email fee and enforce sending quotas, but they offload the massive operational burden of managing TLS handshakes, maintaining ISP feedback loops, handling IP pool cycling, and negotiating deliverability whitelisting. Self-hosting saves money only at hyper-scale (over 500 million emails per month), but requires a dedicated team of deliverability engineers to debug reverse DNS records, TLS cipher suites, and sudden blocklists.

**Hybrid Queue Architecture (Kafka/SQS vs Redis Sorted Sets)**
- *Decision:* Use standard message queues (such as AWS SQS FIFO or Kafka) for real-time transactional and marketing streams, and Redis Sorted Sets (ZSET) for scheduled future deliveries.
- *Rejected:* Relational database polling using SQL queries like `SELECT * FROM emails WHERE send_at <= NOW() AND status = 'SCHEDULED' FOR UPDATE SKIP LOCKED`.
- *Tradeoff:* Database polling causes severe index bloat, table lock contention, and high disk I/O when millions of future emails are queued. Redis ZSET stores timestamps as scores, enabling fast logarithmic time complexity `ZREVRANGEBYSCORE` queries. A lightweight scheduler worker moves ready messages from Redis to SQS partitions without placing load on the primary transactional database.

**Dual-Storage Strategy for Message State vs Analytics Events**
- *Decision:* Store core transactional state and suppression records in a relational database (PostgreSQL) paired with a Redis cache, while routing high-volume tracking events (opens, clicks, delivery timestamps) to an append-only analytical column store (ClickHouse).
- *Rejected:* Storing all event logs and open/click streams directly in the primary relational database.
- *Tradeoff:* PostgreSQL provides ACID guarantees and strong consistency required for suppression lists and deduplication, but writing billions of click and open events would exhaust its connection pool and lock tables. ClickHouse handles massive insert throughput and offers efficient columnar compression for aggregation queries across marketing campaigns.

## 5. Deep Dives — The Parts That Actually Matter

### Email Authentication Protocols (SPF, DKIM, DMARC, and Subdomain Isolation)

Email spoofing and spam filtering are governed by three cryptographic and DNS-based standards. Without these properly configured, destination inbox providers will reject or spam-box your messages:

- **SPF (Sender Policy Framework):** A DNS TXT record published on your domain listing the authorized IP addresses and provider hostnames permitted to send mail on your behalf (e.g. `v=spf1 include:amazonses.com ~all`). When an email arrives, the destination MX server looks up the sender domain's SPF record and checks if the connecting IP matches.
- **DKIM (DomainKeys Identified Mail):** Uses asymmetric public-key cryptography to guarantee message integrity. The delivery worker computes a cryptographic hash of the email headers and body, signs it using a private key, and attaches the signature in the `DKIM-Signature` header. The receiving mail server retrieves the public key from the sender's DNS records (`selector._domainkey.example.com`) and verifies that the content was not altered in transit.
- **DMARC (Domain-based Message Authentication, Reporting, and Conformance):** Links SPF and DKIM together. It verifies domain alignment (ensuring the `From:` header matches the SPF and DKIM domains) and specifies a strict policy for handling failures: `p=none` (monitor only), `p=quarantine` (send to spam), or `p=reject` (block outright). It also configures receiving servers to send daily XML diagnostic reports back to the sender.
- **Subdomain Isolation Strategy:** Never send all email from the apex domain `example.com`. High-performing architectures isolate reputation by assigning distinct subdomains: `auth.example.com` for transactional logins and receipts, and `news.example.com` for promotional broadcasts. A spam penalty applied to marketing campaigns on `news` will not damage the inbox placement of OTPs sent from `auth`.

### IP Pool Warming and Adaptive Rate Limiting

A new dedicated IP address starts with zero reputation. If an un-warmed IP suddenly transmits 500,000 emails in an hour, receiving ISPs will flag the surge as botnet spam and throttle all traffic with `421` or `451` SMTP temporary failure codes.

To establish sender trust, sending workers adhere to a gradual warming schedule over 4 to 6 weeks:

- **Day 1 to 3:** Max 50 to 100 emails/day per target domain.
- **Day 4 to 7:** Max 250 to 500 emails/day per target domain.
- **Weeks 2 to 4:** Increase volume by 1.5x to 2x daily, prioritizing high-engagement transactional users.

Sending workers run local token bucket algorithms keyed by `(sending_ip, destination_mx_domain)`. When delivering to Gmail (`gmail-smtp-in.l.google.com`), the worker restricts concurrent connections to Google's accepted thresholds. If the destination server returns a `421 4.7.0 [IP] Our system has detected an unusual rate of unsolicited mail`, the worker enters a backoff state, reduces sending rate on that specific IP, and reschedules affected messages with randomized exponential jitter.

### Bounce Classification and the Automated Suppression Engine

Handling bounces correctly is mandatory to avoid domain blacklisting:

- **Hard Bounces (5xx Permanent SMTP Errors):** Triggered when an address is invalid, the mailbox does not exist (`550 5.1.1 User unknown`), or the domain has no MX record. Action: The address is immediately written to the permanent Suppression Store with an immutable lock. Any future send request targeting this address is aborted at the API gateway.
- **Soft Bounces (4xx Temporary SMTP Errors):** Caused by full recipient mailboxes (`452 4.2.2 Mailbox full`), server timeouts, or transient rate limits. Action: The message is placed into a delayed retry queue with exponential backoff (e.g., retries at 5 minutes, 30 minutes, 2 hours, and 8 hours). If an address soft-bounces continuously across 5 attempts over 72 hours, it is promoted to a hard bounce and suppressed.
- **Spam Complaints (Feedback Loops):** Major providers (Yahoo, Microsoft) supply Feedback Loop (FBL) webhooks when a user clicks "Report Spam". Action: The worker instantly flags the address for marketing suppression and cancels all active drip campaigns for that recipient.

## 6. Failure Modes and Resilience

**Downstream Provider Outage or Regional Blackout**
- *Failure Scenario:* AWS SES experiences an availability drop or rate-limit throttling in a major region, causing outbound delivery calls to fail with 5xx server errors.
- *Mitigation:* The delivery layer employs a dynamic circuit breaker pattern. If the error rate for AWS SES exceeds 5% over a 30-second window, the router trips the circuit and automatically shifts outbound transactional traffic to SendGrid. A secondary fallback queue buffers outgoing marketing jobs with backpressure alerts to prevent memory exhaustion.

**Poison Pill Payloads Crashing Rendering Workers**
- *Failure Scenario:* A corrupted template containing an infinite loop or malformed dynamic JSON payload causes the rendering process to crash repeatedly, preventing workers from acknowledging and clearing queue jobs.
- *Mitigation:* Every message carries a delivery attempt counter. If a worker crashes or fails to process a message after 3 attempts, the message is automatically routed to a Dead Letter Queue (DLQ). The main queue continues moving unimpeded, while an alert triggers on-call engineers to inspect the malformed payload in the DLQ.

**Suppression Cache Invalidation and Legal Compliance Failures**
- *Failure Scenario:* The Redis cache holding suppression records crashes or loses synchronization, causing workers to send emails to users who explicitly unsubscribed or reported spam, violating CAN-SPAM and GDPR regulations.
- *Mitigation:* The system uses a two-tier suppression validation model. The API Gateway performs a quick pre-flight check against an in-memory Redis Bloom filter and cached set. Right before actual dispatch, the worker checks an authoritative read-replica database if the cache returns a miss or is unreachable. In the event of a total cache failure, the worker fails closed for marketing traffic by falling back directly to the primary database.

**Duplicate Sends from Network Timeouts**
- *Failure Scenario:* A worker dispatches an email to the cloud provider, but the HTTP response times out before the worker can record success in the database. The queue re-delivers the message, causing the recipient to receive duplicate billing receipts.
- *Mitigation:* Distributed idempotency keys are enforced at both our API layer and the cloud provider layer. When making external calls, our worker supplies an `Idempotency-Key` or `X-Entity-Ref-ID` header derived from the original transaction. If the provider already received the message, it returns the existing delivery confirmation without re-sending the email.

## 7. What Makes a Great Answer vs an Average One

An average answer treats email delivery like a generic background task: it draws an API endpoint, an SQS queue, and a worker that calls the SendGrid API, assuming the problem is solved once HTTP status 200 is returned.

A senior answer recognizes that the hard engineering challenges happen downstream from the API:

- **Reputation-First Architecture:** Proactively explains SPF, DKIM, and DMARC alignment, and insists on physical domain and IP pool separation between transactional and marketing streams.
- **Deep Understanding of Deliverability:** Details ISP warming schedules, destination-specific concurrency limits, and how to handle 4xx temporary throttling versus 5xx permanent delivery failures.
- **Asynchronous Feedback Loops:** Explains the necessity of webhook ingestion pipelines to maintain real-time suppression lists and prevent spam-trap penalties.
- **Graceful Degradation:** Accounts for provider outages using circuit-breaker failover routing, and explains idempotency mechanisms to eliminate duplicate sends during network timeouts.

## 8. 🧠 The Memory Hook

Email delivery is a strict border control system: **SPF and DKIM are your verified passport and cryptographic signature, DMARC is the border entry policy, and your IP reputation is your clean travel history.** Always give your diplomatic couriers (transactional OTPs) their own dedicated express lane so an unruly tour bus (marketing campaign) never gets your entire country blacklisted at the border.
