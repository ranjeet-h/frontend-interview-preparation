# 67. Design Email Delivery System

[← Hard examples](index.md)

**Why interviewers ask** — Reliable async delivery at scale: queues, retries, bounces, reputation, and the difference between sending and receiving mail.

**Core insight** — Email is an async pipeline with unreliable downstream SMTP peers; partition queues by recipient domain, retry with backoff, and track reputation as a first-class metric.

**Architecture**

```txt
App → outbound API → per-domain queue → SMTP workers → recipient MX servers
                  → delivery status DB (sent / deferred / bounced)
Bounce handler ← webhook / IMAP ← parse hard vs soft bounce → suppression list
```

- **Queue** — Partition by recipient domain to isolate slow domains; priority lanes for transactional vs marketing.
- **SMTP client** — Connection pooling per domain; exponential backoff on 4xx; stop on 5xx hard bounce.
- **Deliverability** — SPF, DKIM, DMARC alignment; warm up new IPs gradually; monitor blocklist status.
- **Suppression** — Hard bounces and unsubscribes never re-sent; global suppression list checked before enqueue.

**Key decisions** — Separate transactional and marketing sending domains/IPs; idempotent send IDs prevent duplicates on retry; throttle per domain to avoid reputation damage.

**Scale & failure** — Workers scale per queue depth; greylisting causes temporary 4xx — retry, don't suppress; provider outage buffers in durable queue for hours.

**Deep link** — [Email delivery system](../../backend-designs/design-an-email-delivery-system.md)

**Memory hook** — Queue by domain, retry soft bounces, suppress hard ones — reputation is the real inbox key.
