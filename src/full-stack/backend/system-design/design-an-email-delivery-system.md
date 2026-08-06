# Design an email delivery system

## Detailed explanation

Design an email delivery system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, design an email delivery system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you ensure email deliverability and avoid spam folders?
- **The Engine Mechanism (Why it behaves this way):** Deliverability depends on sender reputation, authentication, and content quality. Authentication: SPF (DNS record listing authorized sending IPs), DKIM (cryptographic signature on each email), and DMARC (policy telling receivers what to do with unauthenticated mail). Reputation: warm up new IP addresses gradually (start with 50 emails/day, increase by 2x daily), maintain low bounce rates (<2%), low complaint rates (<0.1%), and high engagement (opens/clicks). Content: avoid spam trigger words, maintain text-to-image ratio, include unsubscribe links, and use consistent sending domains. Monitor sender score with tools like Google Postmaster Tools.
- **The Unforgettable Mental Model:** The **Reputable Mail Carrier**. A mail carrier with a uniform (SPF/DKIM/DMARC authentication), a good track record (sender reputation), and properly addressed letters (clean content) gets through the gate. A suspicious person in a hoodie with poorly written letters gets stopped at the checkpoint (spam folder).
- **The Trap:** Sending from a shared IP with poor reputation. If other users on the same IP send spam, your emails get blocked too. Always use a dedicated IP for transactional emails and warm it up gradually.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement all three authentication protocols: SPF, DKIM, and DMARC with a 'reject' policy. For new sending domains, I'd warm up IPs gradually over 4-6 weeks. I'd maintain separate sending domains for transactional and marketing emails to protect transactional reputation. Content-wise, I'd avoid spam triggers, include unsubscribe links, and maintain a healthy text-to-image ratio. I'd monitor deliverability with Google Postmaster Tools and bounce/complaint rates, removing hard-bounced addresses immediately."

#### How do you handle email templates and localization?
- **The Engine Mechanism (Why it behaves this way):** Templates are stored as parameterized files (Handlebars, MJML, React Email) with placeholders for dynamic content. A template engine renders the template with user-specific data (name, order details, etc.). Localization uses i18n files (JSON/YAML) keyed by locale and template variable. The system detects the user's locale from their profile or Accept-Language header, loads the appropriate template and translations, and renders. HTML and plain-text versions are generated from the same source (MJML compiles to both). Templates are versioned so changes don't affect in-flight emails.
- **The Unforgettable Mental Model:** The **Form Letter Factory**. The factory has master templates (template files) with blank spaces (placeholders). For each recipient, the machine fills in the blanks with their name and details. If the recipient speaks Spanish, the machine uses the Spanish version of the template. Both a fancy printed letter (HTML) and a simple typed version (plain text) are produced from the same master.
- **The Trap:** Storing templates as raw HTML in the database. This makes versioning, testing, and localization difficult. Store templates as code (version-controlled files) or use a template management service with versioning.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd store templates as version-controlled files using MJML, which compiles to responsive HTML and plain text. A template engine (Handlebars or React Email) renders templates with dynamic data. Localization is handled through i18n JSON files keyed by locale — the system detects the user's language preference and loads the appropriate template and translations. Templates are versioned so deploying a new version doesn't affect emails already in the queue. I'd also implement a preview API so the frontend can render template previews before sending."

#### How do you handle bounce and complaint processing?
- **The Engine Mechanism (Why it behaves this way):** Email providers send bounce notifications (via webhook or SNS) when an email can't be delivered. Hard bounces (invalid address, domain doesn't exist) mean the address should be permanently removed. Soft bounces (mailbox full, server down) are retried a few times before being treated as hard bounces. Complaints (user marks as spam) require immediate suppression. A suppression list table stores bounced/complained addresses with the reason and timestamp. Before sending, the system checks the suppression list and skips suppressed addresses. Bounce webhooks are processed asynchronously to avoid blocking the sending pipeline.
- **The Unforgettable Mental Model:** The **Returned Mail Desk**. When a letter can't be delivered, it comes back with a reason stamp: "No such address" (hard bounce — remove from list forever), "Mailbox full" (soft bounce — try again later), or "Recipient complained" (complaint — never send again). The mailroom maintains a do-not-send list updated from these returns.
- **The Trap:** Not processing bounces asynchronously. Bounce webhooks arrive in bursts and can overwhelm the system if processed synchronously. Always queue bounce processing and handle it with a dedicated worker.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd process bounces and complaints via webhooks from the email provider (SendGrid, SES). Hard bounces (invalid address) result in permanent suppression. Soft bounces are retried up to 3 times before suppression. Complaints trigger immediate suppression. All suppressed addresses are stored in a suppression list table with reason and timestamp. Before every send, the system checks the suppression list. Bounce processing is handled asynchronously via a queue to handle burst traffic. I'd also implement a bounce analytics dashboard to track rates by domain and campaign."

#### How do you design the email sending API?
- **The Engine Mechanism (Why it behaves this way):** The API has endpoints: POST /emails/send accepts { to, subject, template, variables, locale?, priority? } and returns { message_id, status }. POST /emails/bulk accepts an array of recipients for batch sending. GET /emails/{id}/status returns delivery status. The send endpoint validates the recipient against the suppression list, renders the template, queues the email for async delivery, and returns immediately with a message_id. Priority levels (high, normal, low) determine queue position. Idempotency keys prevent duplicate sends. Rate limiting applies per-recipient to prevent spam.
- **The Unforgettable Mental Model:** The **Mail Drop Box**. You drop your letter in the box (POST /emails/send), get a tracking number (message_id), and the postal service handles the rest. You can check the tracking number anytime (GET /status) to see if it was delivered. Bulk mail goes through a separate sorting line (bulk endpoint) optimized for volume.
- **The Trap:** Making the send endpoint synchronous and waiting for delivery confirmation. Email delivery can take seconds to minutes. The API should return immediately with a message_id and deliver asynchronously.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The API has POST /emails/send for single emails and POST /emails/bulk for batch sends. Both accept a template name, variables, and recipient list. The endpoint validates against the suppression list, renders the template, queues the email for async delivery, and returns a message_id immediately. GET /emails/{id}/status returns delivery status (queued, sent, delivered, bounced). I'd support priority levels for queue ordering and idempotency keys to prevent duplicates. Rate limiting prevents abuse — max N emails per recipient per hour."

#### How do you handle high-volume email sending without overwhelming providers?
- **The Engine Mechanism (Why it behaves this way):** Email providers have rate limits (e.g., SendGrid: 10,000 emails/minute on enterprise plans). A queue-based architecture manages throughput: emails are enqueued, workers consume at the provider's rate limit, and a token bucket algorithm controls the send rate. Multiple provider accounts can be used for load balancing and failover. Backpressure is applied when the queue grows beyond a threshold — new emails are accepted but delivery is delayed. Connection pooling reuses SMTP connections. For very high volume, use multiple sending domains and IPs to distribute load and protect reputation.
- **The Unforgettable Mental Model:** The **Dam and Turbine**. The reservoir (queue) holds all the water (emails). The turbine (worker) releases water at a controlled rate (provider limit). If the reservoir gets too full (backpressure), the dam operator slows incoming flow. Multiple turbines (provider accounts) can run in parallel for higher throughput.
- **The Trap:** Sending emails directly without a queue. If the provider goes down or rate-limits, emails are lost. Always queue emails so they can be retried and delivered when the provider recovers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use a queue-based architecture with rate-controlled workers. Emails are enqueued in SQS or Kafka, and workers consume at the provider's rate limit using a token bucket algorithm. For high volume, I'd use multiple provider accounts (SendGrid + SES) with automatic failover. Backpressure is applied when the queue depth exceeds a threshold. Connection pooling reuses SMTP/TLS connections. I'd also distribute sends across multiple domains and IPs to protect sender reputation and avoid single-point rate limits."

#### How do you track email engagement (opens, clicks)?
- **The Engine Mechanism (Why it behaves this way):** Open tracking uses a 1x1 transparent pixel image embedded in the HTML email. When the email client loads the image, it makes a request to the tracking server, which logs the open event. Click tracking rewrites all URLs in the email to point to a redirect service that logs the click before redirecting to the original URL. Both methods store events in a time-series database for analytics. Privacy concerns: Apple's Mail Privacy Protection (MPP) pre-loads images, inflating open rates. Modern systems use multiple signals (clicks, link engagement time) to estimate true engagement.
- **The Unforgettable Mental Model:** The **Store Security Camera**. The tracking pixel is a camera at the entrance — it counts who walks in (opens). Click tracking is a camera at each product aisle — it tracks what people look at (clicks). But some people send robots to browse (MPP), so the camera counts need adjustment.
- **The Trap:** Relying solely on open rates after Apple's MPP. MPP pre-loads images for all Apple Mail users, making open rates artificially high. Use click rates and engagement time as more reliable metrics.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Open tracking uses a 1x1 tracking pixel that fires when the email is opened. Click tracking rewrites all URLs through a redirect service that logs clicks before forwarding. Both events are stored in a time-series database. However, Apple's MPP inflates open rates by pre-loading images, so I'd supplement with click-through rates and engagement time as more reliable metrics. I'd also implement unique tracking IDs per recipient to attribute engagement to specific users and campaigns."

#### How do you handle email queuing and scheduling?
- **The Engine Mechanism (Why it behaves this way):** Scheduled emails are stored in a database with a send_at timestamp. A scheduler (cron job or delayed queue) scans for emails where send_at <= now and moves them to the delivery queue. For time-zone-aware scheduling, store send_at in the user's local time and convert to UTC at send time. Priority queues separate transactional emails (password reset, order confirmation) from marketing emails. Transactional emails bypass the queue or use a high-priority queue with dedicated workers. Retry queues handle failed sends with exponential backoff.
- **The Unforgettable Mental Model:** The **Train Schedule**. Scheduled emails are like trains with departure times (send_at). The station master (scheduler) checks the clock and dispatches trains when it's their time. Express trains (transactional) get priority tracks. Delayed trains (failed sends) wait at the station and retry later.
- **The Trap:** Using a simple cron job that scans the entire scheduled emails table. This becomes slow as the table grows. Use an indexed query (WHERE send_at <= NOW() AND status = 'scheduled') or a delayed queue (Redis ZSET with score = timestamp) for efficient scheduling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use a delayed queue (Redis ZSET or SQS delayed messages) where the score is the send_at timestamp. A worker polls for messages where score <= current time and moves them to the delivery queue. For time-zone scheduling, I'd store the user's timezone and convert send_at to UTC at queue time. Transactional emails use a separate high-priority queue with dedicated workers to ensure sub-minute delivery. Marketing emails use the standard queue with rate limiting. Failed sends go to a retry queue with exponential backoff."

## 8. Active recall test

1. **What three authentication protocols improve email deliverability?**
   - **Explanation:** SPF (lists authorized sending IPs), DKIM (cryptographic signature on each email), and DMARC (policy for handling unauthenticated mail). Together they prove the email is legitimately from your domain.

2. **What is the difference between hard and soft bounces?**
   - **Explanation:** Hard bounces are permanent failures (invalid address, domain doesn't exist) — the address should be permanently suppressed. Soft bounces are temporary (mailbox full, server down) — retry up to 3 times before suppressing.

3. **Why use MJML for email templates?**
   - **Explanation:** MJML is a markup language that compiles to responsive HTML email that works across all email clients. It also generates plain-text versions. It handles the complexity of email client quirks (Outlook, Gmail, Apple Mail) automatically.

4. **How do you prevent overwhelming email providers with high-volume sends?**
   - **Explanation:** Use a queue-based architecture with rate-controlled workers (token bucket algorithm). Distribute across multiple provider accounts and sending domains. Apply backpressure when queue depth exceeds thresholds.

5. **Why are open rates unreliable after Apple's MPP?**
   - **Explanation:** Apple's Mail Privacy Protection pre-loads all images in emails, causing tracking pixels to fire even when the user doesn't open the email. This artificially inflates open rates. Use click rates and engagement time instead.

6. **How do you ensure transactional emails are delivered faster than marketing emails?**
   - **Explanation:** Use separate priority queues. Transactional emails go to a high-priority queue with dedicated workers that bypass rate limiting. Marketing emails use the standard queue with rate-controlled delivery.

7. **What is the most efficient way to schedule emails for future delivery?**
   - **Explanation:** Use a delayed queue (Redis ZSET with timestamp as score, or SQS delayed messages). Workers poll for messages where the timestamp has passed and move them to the delivery queue. This is O(log n) vs. O(n) for table scanning.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design an email delivery system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design an email delivery system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
