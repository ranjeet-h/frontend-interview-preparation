# Preparation Strategy

[← System Design index](index.md)

System design interviews are not trivia. They test whether you can clarify a vague prompt, pick sensible defaults, explain trade-offs, and go deep on the two components that actually matter — all while talking to another human. This page is your study loop and mock checklist.

## 1. Why a structured plan exists — The Problem First

Most candidates either memorize diagrams ("Instagram uses Cassandra!") or jump straight to boxes without asking who uses the system and how often. Both fail. Interviewers want to see you **think in public**: scope the problem, state assumptions, design for the numbers you chose, and admit what you'd revisit with more time.

Without a plan, you re-read random blog posts, never finish a full mock, and panic when the prompt isn't URL shortener. A simple weekly rhythm fixes that.

## 2. The Analogy — Make It Obvious

Training for system design is like preparing for a technical presentation you haven't seen the title of yet. You don't memorize every slide — you practice **how to structure any talk**: hook, outline, three main points, Q&A. The foundations chapter is your outline template; each problem chapter is rehearsing a different audience question.

## 3. How It Actually Works — The Full Explanation

### 8–12 week study plan

| Weeks | Focus | Outcome |
|---|---|---|
| **1–2** | [Foundations](concepts.md) — CAP, proxies, scaling, Kafka, auth tokens, indexing, hashing | You can explain any foundation topic in under 90 seconds |
| **3–4** | [Easy problems](easy.md) — shortener, cache, auth, email, session, file upload | You finish a full easy prompt in 35–40 minutes with a diagram |
| **5–7** | [Medium problems](medium.md) — feeds, chat, payments, search | You identify fanout, cache, and async work without prompting |
| **8–10** | [Hard problems](hard.md) — global scale, transactions, geo | You handle "what breaks at 100×" follow-ups calmly |
| **11–12** | Mocks + [Specialist](specialist.md) skim | Timed 45–60 min sessions; record and review |

Adjust pace if you're full-time prepping — compress easy if you've built production systems; extend medium if feeds and real-time are weak.

### RESHADED-style flow (use in every mock)

Use this as your mental checklist during the interview — not a script to read aloud:

1. **Requirements** — functional (what users do) and non-functional (latency, availability, consistency, scale).
2. **Estimates** — DAU, QPS (peak >> average), storage per record × retention.
3. **Sketch** — clients → edge → API → services → cache/DB → async workers.
4. **Hot path** — walk one read and one write end-to-end.
5. **Deep dives** — pick 2 components the interviewer will probe (ID generation, feed fanout, payment idempotency).
6. **Scale & failure** — what breaks first; how you observe and degrade gracefully.

### Recommended resources

**Books (pick one, finish it):**

- *System Design Interview* — Alex Xu (Vol 1 & 2): interview-shaped, diagram-heavy.
- *Designing Data-Intensive Applications* — Martin Kleppmann: the "why" behind queues, logs, consistency.
- *Building Microservices* — Sam Newman: when and how to split services.

**Practice:** timed mocks with a peer or recorded solo; explain out loud even when alone.

**Reference while studying:** [Backend System Design](../backend/system-design/index.md) for full-depth classics (URL shortener, auth, payments, feeds).

## 4. Real Code — See It Working

You don't ship code in a system design round — but you **should** sketch numbers. Example capacity napkin for a read-heavy API:

```text
10M DAU × 10 reads/user/day ≈ 100M reads/day
100M / 86,400 ≈ 1,200 RPS average
Peak (3×) ≈ 3,600 RPS — design for ~5k RPS headroom

1KB per cached object × 20% hot set × 10M keys ≈ 2GB Redis working set (order of magnitude)
```

Practice one estimate per study session until QPS and storage feel automatic.

## 5. The Interview Questions — All of Them, Done Properly

**Q: How long should clarifying questions take?**

About five minutes — not twenty. Ask scale, read/write ratio, consistency needs, and latency targets. State defaults if the interviewer says "your call."

**Q: What if I don't know the company's exact stack?**

Say what you'd choose and why. "I'd use a managed queue like SQS or Kafka depending on replay needs" beats naming a tool without trade-offs.

**Q: How deep should I go?**

High-level boxes first, then two deep dives. Stop when the interviewer redirects — that's a signal, not a failure.

**Q: Do I need to draw every component?**

Draw the request path and data stores. Skip logo soup ("here's Kubernetes") unless it solves a stated problem.

## 6. The Traps — What Goes Wrong

| Trap | Why it hurts | Fix |
|---|---|---|
| Jumping to microservices | Operational cost with no scale benefit | Start monolith or modular monolith; split on evidence |
| Ignoring non-functionals | Design fits features but not latency or CAP | Ask consistency and availability explicitly |
| No failure story | "It scales" until Redis dies | Name one failure per tier and the user-visible effect |
| Buzzword boxes | "We'll add Kafka" with no events | Every box answers a requirement or bottleneck |
| Memorized Instagram | Wrong scale assumptions | Always re-derive QPS from your stated DAU |

## 7. Compare With Related Concepts

**System design vs coding rounds** — coding tests algorithmic correctness on one machine; system design tests judgment under uncertainty and scale.

**This guide vs backend deep dives** — chapter banks here are breadth (100 prompts); backend pages are depth on one product-shaped backend.

## 8. 🧠 The Memory Hook — What Sticks

Clarify → estimate → sketch → walk the hot path → deep-dive two things → say what breaks first. If you can do that loop on any prompt, you're interview-ready — the rest is practice reps.

### Quick reference: stacks by need

| Need | Common choices |
|---|---|
| Load balancing | nginx, HAProxy, cloud LB |
| API gateway | Kong, Envoy, cloud API GW |
| Cache | Redis, Memcached |
| Queue / stream | Kafka, RabbitMQ, SQS |
| RDBMS | PostgreSQL, MySQL |
| Wide-column / KV | Cassandra, DynamoDB |
| Search | Elasticsearch |
| CDN | CloudFront, Cloudflare |

### Latency anchors (order of magnitude)

| Operation | Typical |
|---|---|
| Redis read | &lt;1 ms |
| DB query (indexed) | 1–10 ms |
| Cross-AZ | 1–3 ms |
| Cross-region | 50–200 ms |

### Mock interview checklist

- [ ] Clarifying questions stated assumptions
- [ ] Capacity estimate (QPS, storage)
- [ ] Diagram with labeled data flow
- [ ] Read path and write path narrated
- [ ] Two components explained with trade-offs
- [ ] Failure mode + monitoring mentioned
- [ ] Responded to at least one "what if?" pivot
