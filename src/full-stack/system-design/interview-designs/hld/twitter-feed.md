# Twitter Feed

A Twitter-like feed must make a user's home timeline feel fast even when authors publish at very different follower scales. This design covers posting, following, home-timeline reads, cursor pagination, basic ranking, and eventually consistent like/repost counts. It does not design direct messages, full-text search, ads, or a complete recommendation system. The central rule is: **keep authoring and privacy authoritative; treat each user's feed as a rebuildable projection.**

## 1. Clarify requirements

Functional requirements:

- A user can create a post, follow or unfollow another user, and read a personalized home timeline.
- A home timeline returns posts from followed accounts, supports cursor pagination, and applies a basic relevance ranking while preserving a useful chronological fallback.
- A viewer sees only posts they are authorized to see: public posts, their own posts, or posts from accounts they were permitted to follow when the projection is read.
- Like and repost actions update visible engagement counts asynchronously; a count can lag without changing whether the underlying action was accepted.

Non-functional interview assumptions: posting must be durable before success is returned; the first page of a warm home feed targets p95 below 200 ms; feeds may be seconds behind a new post, follow, unfollow, or ranking-signal change; privacy blocks and protected-account access are checked against authoritative state at read time. The design offers at-least-once fanout with idempotent entries, not global exactly-once delivery.

## 2. Estimate scale

Use explicit interview assumptions:

- Assume 100 million daily active users, 500 million posts per day, and 10 billion home-timeline reads per day.
- Assume 500 million posts divided by 86,400 seconds is about 5,800 average posts per second; with an explicit 20x peak assumption, design post ingestion for about 116,000 posts per second.
- Assume 10 billion reads divided by 86,400 seconds is about 116,000 average reads per second; with an explicit 10x peak assumption, design home reads for about 1.16 million requests per second.
- Assume an ordinary author has 300 followers, a celebrity threshold is 100,000 followers, and a rare celebrity has tens of millions. A one-size fanout would turn one celebrity post into an unsafe burst of millions of writes.
- Assume a `FeedEntry` needs 100 bytes of IDs, timestamps, and lightweight features. With an explicit 7-day inbox retention assumption, ordinary fanout is substantial but bounded; post bodies and media remain stored once elsewhere.

These assumptions make the system read-heavy, but celebrity write amplification—not raw post storage—the decisive design problem.

## 3. Define APIs

Posting is an idempotent authenticated write:

```http
POST /posts
Idempotency-Key: device-7:1842
Content-Type: application/json

{ "text": "Ship the small thing today.", "mediaIds": ["media_42"] }
```

```json
{ "postId": "post_01J...", "status": "accepted", "createdAt": "2026-08-28T10:00:00Z" }
```

Following and unfollowing use `PUT /users/{targetUserId}/follow` and `DELETE /users/{targetUserId}/follow`. Both return the effective follow-state version. A home read uses `GET /home?cursor=opaqueCursor&limit=50`; the cursor encodes the last `(rankBucket, createdAt, postId)` boundary, not an offset. The response contains hydrated posts, a `nextCursor`, and `asOf` projection time. `POST /posts/{postId}/likes` and `POST /posts/{postId}/reposts` accept the action durably; their displayed counts are not synchronous read-after-write guarantees.

## 4. Define the data model

`User`, `Post`, and authorization state are authoritative; feed inboxes and counts are projections that can be rebuilt.

```text
User(userId, handle, accountVisibility, status, createdAt)

Post(postId, authorId, text, mediaReferences, visibility, createdAt,
     deletedAt, authoringVersion)

FollowEdge(followerId, followeeId, state, version, createdAt, updatedAt)

FeedEntry(viewerId, postId, authorId, createdAt, source, featureVersion,
          candidateScore, fanoutVersion)

EngagementCounter(postId, likeCount, repostCount, replyCount, updatedAt)
```

`Post` is partitioned by `postId` or time-ordered author shard and indexed by `(authorId, createdAt DESC)`. `FollowEdge` is materialized in both directions: follower-to-followees for reads and followee-to-followers for ordinary fanout. `FeedEntry` is partitioned by `viewerId` and sorted by candidate time. The post acceptance transaction inserts `Post` and an outbox event atomically; a unique `(authorId, idempotencyKey)` prevents duplicate posts.

## 5. Draw the high-level architecture

```text
Post client -> API gateway -> Post service -> Post store + transactional outbox
                                                   |
                                                   v
                                            event stream / relay
                                                   |
                       +---------------------------+---------------------------+
                       |                                                       |
                       v                                                       v
             follow-graph lookup                                      engagement aggregator
                       |                                                       |
          ordinary author | celebrity author                         counter store / cache
                       v                                                       |
            fanout workers -> per-viewer feed inbox/cache                       |
                       |                                                       |
                       +-------------------+-----------------------------------+
                                           v
Home client -> Home API -> feed cache/inbox -> celebrity candidate fetch -> ranker
                              |                    |                 |
                              +-> cache invalidation+-> post store ---+-> privacy/author state
                                           |
                                           v
                                  cursor page + hydrated posts
```

The post path publishes one durable event. The fanout classifier uses the follow graph to choose ordinary push fanout or celebrity pull candidates. The home path assembles both sources, ranks them, rechecks authorization, and emits a stable cursor boundary.

## 6. Walk through the main request flow

1. The post client sends `POST /posts` with a stable idempotency key. The Post service authenticates the author, validates content and visibility, writes `Post` plus an outbox row atomically, then returns `accepted`.
2. The outbox relay publishes `PostCreated(postId, authorId, authoringVersion)` to a stream partitioned by author. A replay is safe because downstream keys include `viewerId + postId`.
3. A fanout classifier reads the authoritative follower count and classifies the author using the explicit 100,000-follower interview threshold. For an ordinary author, it reads followee-to-follower shards and fanout workers insert an idempotent `FeedEntry` into each follower's inbox.
4. For a celebrity, workers do not write millions of inbox rows. They append the post to the author's time-ordered author timeline, invalidate only bounded celebrity-candidate caches, and mark the author as a pull source.
5. A follow or unfollow changes the authoritative `FollowEdge` version first. It asynchronously adds/removes ordinary future fanout eligibility and invalidates the affected viewer's feed cache; a home read still checks the current edge before displaying a candidate.
6. On `GET /home`, the Home API reads the viewer inbox/cache, fetches recent posts for followed celebrity pull sources, removes duplicates, applies basic ranking, hydrates posts and engagement counters, and filters deleted, blocked, protected, or no-longer-followed content.
7. The API returns the top 50 candidates after the cursor boundary and signs the final candidate's sort fields as `nextCursor`. A like or repost is accepted as an event; an aggregator later updates `EngagementCounter`, so the next feed read can show a newer count.

## 7. Identify bottlenecks

Celebrity follower lists are hot keys, and fanout-on-write creates write amplification proportional to follower count. Classify celebrities before expanding the graph, shard large follower lists, bound page size, and apply per-author quotas so one viral account cannot consume all fanout workers.

The home path can become hot for active viewers and popular celebrity timelines. Keep a bounded inbox per viewer, cache only short feed pages, and merge a capped number of recent celebrity candidates rather than scanning every followed author's history. Ranking services must have a simple recency fallback when features are unavailable or stale.

Cache misses can create stampedes against feed inboxes, post hydration, or celebrity timelines. Use request coalescing/single-flight, TTL jitter, stale-while-revalidate, per-key rate limits, and a bounded fallback page. Do not let a cache refill fan out into an unbounded graph query.

## 8. Scale each component

Shard posts by author/time and serve post hydration through replicas and a post cache. Shard follower-to-followee and followee-to-follower edge tables independently; the latter is cursor-scanned by fanout workers so one large followee does not require one oversized record.

Partition the event stream by author and scale ordinary fanout workers from lag and writes per second. Partition `FeedEntry` storage and its cache by viewer ID; cap retained candidates by time and count. Isolate celebrity candidate workers from ordinary fanout workers so pull-heavy traffic cannot delay ordinary posts.

The ranker is stateless and horizontally scalable. It receives a fixed candidate budget—for example, an explicit interview assumption of 500 inbox plus celebrity candidates—then ranks only that set. Engagement aggregation uses a separate stream keyed by `postId`, with hot-post counters striped or batched before being compacted to the displayed counter store.

## 9. Caching strategy

Cache a rendered first page at `home:{viewerId}:{followVersion}:{privacyVersion}` with a short TTL and stale-while-revalidate. A follow, unfollow, block, protected-account approval, post delete, or visibility change increments or invalidates the relevant versioned key. The cache speeds presentation; it is never authorization proof.

Cache post hydration at `post:{postId}:{authoringVersion}` and counters at `engagement:{postId}`. Post edits, deletes, or visibility changes publish invalidations. Batch counter updates with a short TTL because eventual counts are acceptable; never use a stale counter to authorize a post.

For celebrity pulls, cache bounded recent IDs at `author-timeline:{authorId}`. Randomize expiration, coalesce concurrent refreshes, and serve a slightly stale candidate list when safe. The Home API always performs the final privacy/relationship filter, preventing a stale cache from reviving an unauthorized post.

## 10. Database scaling and consistency

The strong boundary is authoring and privacy: a successful post write, delete, visibility change, block, protected-follow approval, and `FollowEdge` state change commit in authoritative storage with their version/outbox event. A read must not display a post that fails the current authoritative privacy or block rule, even if an older `FeedEntry` exists.

Feed inboxes, ranking features, cache pages, celebrity candidate lists, search indexes, and engagement counters are eventually consistent projections. They can lag, replay, or be rebuilt from posts and edges. A just-posted ordinary tweet may take seconds to arrive in followers' feeds; a newly unfollowed account may leave stale candidates that the read-time filter removes.

Use idempotent outbox consumers and periodic reconciliation: compare recent post events with fanout completion, expire deleted entries, and rebuild a viewer inbox from follow edges plus author timelines if needed. Do not require a distributed transaction across every follower inbox; that would make a popular author's availability depend on all readers' partitions.

## 11. Handle concurrency

The core invariant is: **one idempotency key creates at most one authoritative post, and current privacy state wins over every feed projection.** The post transaction deduplicates retries. Fanout entries use a unique `(viewerId, postId)` key, so at-least-once stream delivery does not create duplicate feed cards.

A concurrent follow and post has a defined projection boundary: the follow-edge version captured by the worker decides whether the new edge receives ordinary fanout, while the home read checks the newest relationship state. Therefore a follower might briefly miss a post around the race, but never gains access after an unfollow or block takes effect.

Cursor pagination uses a compound, signed boundary such as `(rankingEpoch, scoreBucket, createdAt, postId)`. Within one ranking epoch, request the next page strictly after that boundary and deduplicate post IDs on the client. If a ranking refresh changes the epoch, return a fresh first page rather than claiming offset-like stable pages across changing scores.

## 12. Reliability and failure handling

The transactional outbox ensures a committed post is eventually published even if the relay fails between database and stream. Fanout workers retry with exponential backoff and record per-shard progress; duplicate inserts are harmless. A dead-letter queue retains malformed or repeatedly failing work for inspection and controlled replay.

If a feed inbox partition or cache is unavailable, serve a degraded chronological merge from recent followed-author timelines with a smaller candidate limit, after authorization filtering. If ranking is unavailable, use recency; if engagement aggregation lags, show older counts or omit them. A failed projection must never cause loss of the authoritative post.

Privacy changes are higher priority than convenience. Publish invalidations immediately, tombstone known feed entries asynchronously, and enforce a read-time policy check until cleanup completes. Reconciliation jobs detect fanout lag, projection gaps, stale tombstones, and counters that disagree with source events.

## 13. Availability versus consistency trade-offs

Accept a post only after its authoritative row and outbox record commit; reject or retry if that store is unavailable. This favors durable authoring over accepting a post that could disappear. Feed reads stay available from caches, inboxes, and degraded merges even when some projections lag.

The system deliberately accepts eventual consistency for feed presence, order, ranking, and engagement counts. A user can see a post seconds late, a briefly stale rank, or an old like count. It does not accept eventual consistency for whether the author owns a post or whether the viewer is currently blocked, allowed by visibility, or approved to follow a protected account.

## 14. Security

Authenticate every write and bind idempotency keys to the author. Authorize post edits/deletes, follows, and engagement actions against the acting user; rate-limit posting, follows, and engagement events to limit spam and counter manipulation. Validate media references before publishing them and keep signed media URLs short-lived.

Enforce visibility, block, mute, and protected-account policy in the authoritative relationship service and again at the Home API's final filter. Encrypt sensitive account data at rest, use TLS in transit, redact post text and social-graph identifiers from logs where possible, and audit privacy-policy changes. Cache keys must be viewer-scoped; never place a protected feed page in a shared public cache.

## 15. Monitoring and observability

Trace `postId` from API acceptance through outbox publication, follow-graph lookup, ordinary fanout or celebrity handling, inbox write, cache invalidation, home assembly, ranking, hydration, and engagement aggregation. Log viewer and author identifiers only under the platform's privacy-safe observability policy.

Monitor post acceptance latency/errors, outbox age, stream lag, follower-shard scan duration, fanout writes per post, celebrity classification changes, inbox write failures, cache hit rate, cache-refresh coalescing, stampede suppression, post-hydration latency, candidate counts, ranking latency/fallback rate, cursor error rate, privacy-filter removals, and engagement aggregation lag. Alert on a hot author, a growing projection backlog, a privacy-invalidation delay, or a feed-cache miss storm.

## 16. Discuss trade-offs

| Choice | Why | Alternative | Trade-off |
|---|---|---|---|
| Fanout-on-write for ordinary authors | Warm inbox reads are fast | Read every followed author at request time | Pays follower-count writes on each post, but bounds normal read work |
| Fanout-on-read for celebrities | Avoids a massive write burst | Push every celebrity post to every inbox | Adds home-read merge and latency, but protects write capacity |
| Hybrid assembly | Combines warm ordinary entries with celebrity candidates | One global strategy | More paths to operate, but matches work to social-graph skew |
| Read-time privacy filter | A stale feed projection cannot bypass a new block/unfollow | Trust cache/inbox authorization | Adds a relationship lookup, but preserves the privacy invariant |
| Cursor pagination | Works with inserts and avoids expensive deep offsets | Offset pagination | Pages shift with ranking epochs, so the cursor carries a stable boundary |
| Eventual counters and ranking | Keeps engagement writes and feature updates off the post critical path | Synchronous global count/rank updates | Users may see stale counts or ordering, but authoring remains fast |

## 17. Future improvements

Add personalized machine-learned ranking, topic and quality features, recommendation candidates, ads with separate policy controls, and safe experimentation by ranking epoch. Introduce multi-region viewer routing with explicit replication-lag budgets and a feed rebuild pipeline tested from immutable post and follow events.

Further work includes richer moderation and abuse controls, deletion/retention workflows, muted-word filtering, accessibility-aware media processing, and audience controls beyond a simple public/protected model. Revisit the celebrity threshold continuously from measured write amplification and home-read latency rather than treating 100,000 followers as a universal production constant.

## Likely follow-ups

- How would you guarantee a delete or block takes effect globally within a defined maximum time?
- When would you push a celebrity post to a small subset of highly engaged followers instead of pulling for everyone?
- How would you rebuild one corrupted viewer inbox without replaying all historical posts?

## Interview recap

The answer is: **fan out ordinary authors on write, pull celebrity posts on read, and assemble both sources in a bounded ranked home query.** Keep posts, follow edges, and privacy rules authoritative; let inboxes, caches, ranking, and engagement counts be eventual, rebuildable projections.

For a longer feed-focused discussion, see the existing [social media feed deep dive](../../../backend/system-design/design-a-social-media-feed.md).
