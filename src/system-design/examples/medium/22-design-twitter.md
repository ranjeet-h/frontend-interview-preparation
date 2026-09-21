# 22. Design Twitter

[← Medium examples](index.md)

**Why interviewers ask** — The classic fanout problem: one tweet from a celebrity must not write to 10 million follower timelines synchronously.

**Core insight** — Tweets are append-only and immutable; feed generation is the bottleneck, solved with hybrid push/pull and aggressive caching of hot timelines.

**Architecture**

```txt
Client → Tweet API → Cassandra (tweets by tweet_id, user timeline)
                  → Fanout service → Redis (precomputed home feeds)
                  → Trending service (Kafka + time windows)
                  → Elasticsearch (search)
```

- **Write path** — Persist tweet, enqueue fanout job; for users under follower threshold, push tweet ID into each follower's feed cache.
- **Read path** — Merge cached home feed with on-demand fetch for high-fanout authors.
- **Trending** — Count hashtags in sliding windows via stream processing.

**Key decisions** — Hybrid fanout (push for regular users, pull for celebrities); Cassandra for time-ordered tweets; cache top-K tweets per user; separate search index from timeline store.

**Scale & failure** — Partition tweets by ID; fanout workers scale horizontally; stale feed cache is OK briefly; trending can lag seconds; rate-limit posting to stop abuse.

**Deep link** — [Social media feed](../../backend-designs/design-a-social-media-feed.md) · [Like/follow](../../backend-designs/design-a-like-follow-system.md)

**Memory hook** — Immutable tweets, hybrid fanout — push the small fish, pull the whales.
