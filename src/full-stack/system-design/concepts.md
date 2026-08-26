# Foundations

[← System Design index](index.md)

These fifteen topics are the vocabulary every system design answer depends on — proxies, scaling, partitioning, messaging, auth, and consistency. Read each page once; you should be able to explain the trade-off in a sentence without memorizing a script.

Deep dives live in individual pages below. Problem chapters (Easy → Hard) assume you already know this material.

## Topics

| # | Topic | What you'll nail |
|---|---|---|
| 1 | [API Gateway vs Load Balancer](foundations/api-gateway-vs-load-balancer.md) | Layer 7 policy vs Layer 4 distribution |
| 2 | [Reverse Proxy vs Forward Proxy](foundations/reverse-proxy-vs-forward-proxy.md) | Who you're hiding — client or server |
| 3 | [Horizontal vs Vertical Scaling](foundations/horizontal-vs-vertical-scaling.md) | Bigger machine vs more machines |
| 4 | [Microservices vs Monolith](foundations/microservices-vs-monolith.md) | When to split deployables |
| 5 | [Vertical vs Horizontal Partitioning](foundations/vertical-vs-horizontal-partitioning.md) | Split columns vs split rows |
| 6 | [Rate Limiter (algorithms)](foundations/rate-limiter.md) | Token bucket, leaky bucket, windows |
| 7 | [Single Sign-On (SSO)](foundations/single-sign-on.md) | One login, many apps |
| 8 | [Apache Kafka](foundations/apache-kafka.md) | Log, partitions, why it's fast |
| 9 | [Kafka vs RabbitMQ vs ActiveMQ](foundations/kafka-vs-rabbitmq-vs-activemq.md) | Stream log vs task queue |
| 10 | [JWT vs OAuth vs SAML](foundations/jwt-vs-oauth-vs-saml.md) | Token format vs auth framework vs enterprise SSO |
| 11 | [CAP Theorem](foundations/cap-theorem.md) | Consistency vs availability during partition |
| 12 | [PACELC Theorem](foundations/pacelc-theorem.md) | Latency vs consistency when healthy |
| 13 | [Strong vs Eventual Consistency](foundations/strong-vs-eventual-consistency.md) | Freshness vs correctness |
| 14 | [Database Indexing](foundations/database-indexing.md) | B-tree, hash, composite — query-shaped |
| 15 | [Consistent Hashing](foundations/consistent-hashing.md) | Minimal key movement when nodes change |

## How to study this chapter

1. Pick one topic. Read the whole page out loud as if you're in an interview.
2. Close the tab. Explain the **problem it solves** and the **failure mode** if you ignore it.
3. Move to [Easy problems](easy.md) only after you can do that for most of this list.

Question numbering is continuous across chapters: **Easy Q16–35**, **Medium Q36–70**, **Hard Q71–95**, **Specialist Q96–100**. Each question appears in exactly one chapter.

Several classics also have a deeper standalone page under [Backend System Design](../backend/system-design/index.md) — linked from the chapter banks where applicable.
