# 11. Design Email Service

[← Easy examples](index.md)

**Why interviewers ask:** Email is async reliable delivery with external dependencies (SMTP, spam reputation). Interviewers want queue-based sending, retry policy, bounce handling, and separation of compose API from delivery workers.

**Core insight:** Accept send request fast, persist outbound mail, deliver through workers with retries — never block the API on SMTP round trips or provider throttles.

**Architecture**

```txt
Client → Email API (compose + enqueue)
              ↓
         Outbound queue (high throughput)
              ↓
         Email workers → SMTP / provider API (SES, SendGrid)
              ↓ status webhooks
         Delivery DB (sent, delivered, bounced, complained)
              ↓
         Bounce handler (suppress bad addresses)
              ↓
         Analytics (open/click optional)
```

- **Email API:** Validates recipients, attachments size, templates; writes row + queue message; returns message id immediately.
- **Outbound queue:** Decouples API from delivery rate; workers pull batches respecting provider rate limits.
- **SMTP integration:** TLS to provider; handle 4xx retry, 5xx fail or DLQ depending on code; idempotent send using message id.
- **Bounce handling:** Parse provider webhook — hard bounce marks address undeliverable; soft bounce retries with backoff.
- **Analytics:** Optional tracking pixels and link redirects — separate from core delivery path.

**Key decisions**

- **Transactional vs marketing streams:** Separate IPs/domains and queues — marketing spam complaints should not kill password-reset email.
- **At-least-once delivery:** Queue + retries — consumers must dedupe by message id if provider lacks native idempotency.
- **Attachment storage:** Store in object storage; queue holds pointer — keeps queue messages small.

**Scale & failure:** Provider rate limits or IP reputation degradation throttle throughput first. Mitigation: multiple sending domains, exponential backoff, and bounce suppression lists.

**Deep link:** [Design an email delivery system](../../backend-designs/design-an-email-delivery-system.md)

**Memory hook:** Email API is the post office counter — take the letter, stamp it, workers actually drive the trucks; bounces update the do-not-send list.
