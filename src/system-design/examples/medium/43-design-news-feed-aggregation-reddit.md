# 43. Design News Feed Aggregation (Reddit)

[← Medium examples](index.md)

**Why interviewers ask** — Community-based feeds with voting, ranking algorithms (hot/best/top), and threaded comments at scale.

**Core insight** — Posts belong to subreddits; score is function of votes + time decay; ranking is computed or precomputed per sort mode.

**Architecture**

```txt
Post → subreddit partition → vote service (atomic counters)
Feed → hot/best/new/top rankers (different formulas) → cache per subreddit + user home
Comments → tree structure (parent_id), depth limits, collapse threads
Moderation → spam ML + human mod queue
```

- **Voting** — Up/down per user per post; prevent double vote; aggregate score async or sync.
- **Hot ranking** — Log score + time decay (e.g. Reddit's hot algorithm).
- **Comments** — Store adjacency list or path enumeration; load top-level then lazy-fetch replies.

**Key decisions** — Eventual consistency on vote counts OK for display; strong dedup on user votes; separate read path for controversial/live threads.

**Scale & failure** — Shard posts by subreddit; cache hot threads; vote storms buffered in Redis; spam detection async before front page.

**Deep link** — [Comments system](../../backend-designs/design-a-comments-system.md) · [Social media feed](../../backend-designs/design-a-social-media-feed.md)

**Memory hook** — Subreddit shards posts, votes feed the ranker, comments are trees.
