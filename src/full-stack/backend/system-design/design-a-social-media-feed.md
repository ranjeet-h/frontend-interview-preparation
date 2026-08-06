# Design a social media feed

## Detailed explanation

Design a social media feed is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, design a social media feed affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you generate a personalized feed for each user?
- **The Engine Mechanism (Why it behaves this way):** Two main approaches: pull-based (fan-out on read) and push-based (fan-out on write). Pull-based: when the user loads their feed, query posts from all people they follow, sorted by timestamp or score. Simple but slow for users who follow many people. Push-based: when a user posts, push the post to all followers' feed caches (Redis lists). Fast reads but expensive for users with millions of followers (celebrities). Hybrid approach: push for normal users, pull for celebrities (users with >N followers). A ranking algorithm scores posts by recency, engagement, relationship strength, and content type to order the feed.
- **The Unforgettable Mental Model:** The **Newspaper Delivery**. Push-based: when an author publishes, a copy is delivered to every subscriber's mailbox (fast to read, expensive to deliver). Pull-based: subscribers go to the newsstand and pick from all available papers (cheap to publish, slow to browse). Hybrid: regular authors get delivery, celebrities' papers are picked up at the newsstand.
- **The Trap:** Using pure push-based for celebrities. If a user with 10M followers posts, you'd need to write to 10M feed caches — extremely expensive. Always use hybrid: push for normal users, pull for celebrities.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use a hybrid fan-out approach. For normal users (<50K followers), I use fan-out on write — when they post, the post is pushed to all followers' feed caches in Redis. For celebrities (>50K followers), I use fan-out on read — their posts are pulled at feed generation time. The feed is ranked by a scoring algorithm considering recency, engagement (likes, comments), relationship strength (how often they interact), and content type. This balances write cost with read performance across all user types."

#### How do you rank feed posts for relevance?
- **The Engine Mechanism (Why it behaves this way):** A scoring function combines multiple signals: recency (newer posts score higher), engagement (posts with more likes/comments score higher), relationship strength (posts from users you interact with frequently score higher), content type preference (if you engage more with videos, video posts score higher), and diversity (avoid showing too many posts from the same user). The score = w1*recency + w2*engagement + w3*relationship + w4*content_preference + w5*diversity. Weights are tuned via A/B testing. Machine learning models (collaborative filtering, neural networks) can replace the linear scoring function for more personalized ranking.
- **The Unforgettable Mental Model:** The **Restaurant Recommendation**. You prefer restaurants that are: nearby (recency), popular (engagement), recommended by friends (relationship), serve your favorite cuisine (content preference), and offer variety (diversity). The recommendation engine weights these factors to suggest the best options.
- **The Trap:** Ranking purely by recency. This shows all posts in chronological order, including low-quality content from accounts the user doesn't care about. Engagement and relationship signals are essential for a relevant feed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use a multi-signal scoring function: recency (decay over time), engagement (likes, comments, shares), relationship strength (interaction frequency), content type preference (learned from behavior), and diversity (limit posts from same user). Weights are tuned via A/B testing. For advanced systems, I'd use ML models — collaborative filtering for 'users like you also liked' and neural networks for complex pattern recognition. The ranking runs on the candidate set (posts from followed users) before pagination."

#### How do you handle feed pagination efficiently?
- **The Engine Mechanism (Why it behaves this way):** Cursor-based pagination is used instead of offset-based. The feed is stored as a sorted list (Redis ZSET or database with score column). The client sends the last post's score (cursor) and the server returns the next N posts with scores less than the cursor. This is O(log n) regardless of page depth. For the hybrid approach, push-based feeds are stored in Redis ZSET (score = ranking score, value = post_id), and pull-based feeds are generated by querying the posts table with a WHERE clause on the cursor. The cursor encodes the score and post_id for stable ordering (same score posts are ordered by ID).
- **The Unforgettable Mental Model:** The **Book Bookmark**. Instead of saying "show me page 50" (offset), you say "show me what comes after this bookmark" (cursor). It's always fast because you start from the bookmark, not from page 1. The bookmark includes both the page number and line number for exact positioning.
- **The Trap:** Using offset-based pagination (LIMIT 20 OFFSET 1000). This becomes slower as the offset increases because the database scans and skips rows. Always use cursor-based pagination for feeds.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use cursor-based pagination with a sorted data structure. For push-based feeds, Redis ZSET stores posts sorted by ranking score. The client sends the last post's score as a cursor, and ZREVRANGEBYSCORE returns the next batch. For pull-based feeds, the query uses WHERE score < cursor ORDER BY score DESC LIMIT 20. The cursor encodes both score and post_id for stable ordering. This is O(log n) regardless of page depth, unlike offset pagination which degrades to O(n)."

#### How do you handle feed cache invalidation when a post is deleted?
- **The Engine Mechanism (Why it behaves this way):** When a post is deleted, it must be removed from all followers' feed caches. For push-based feeds, this requires iterating through all followers' Redis lists and removing the post — O(n) where n is the follower count. For large follower counts, this is expensive. Optimization: use a tombstone approach — mark the post as deleted in a separate table, and filter deleted posts at read time. The feed cache is cleaned up asynchronously by a background job. For pull-based feeds, deletion is automatic — the post is filtered out at query time. A hybrid approach: for users with <10K followers, remove from cache immediately; for larger, use tombstones.
- **The Unforgettable Mental Model:** The **Recall Notice**. When a product is recalled (post deleted), the manufacturer can: (1) Go to every store and remove it (cache removal — expensive for many stores), or (2) Put a "do not sell" sign on it (tombstone — cheap but the product still sits on the shelf). The manufacturer uses approach 1 for small distributors and approach 2 for large ones.
- **The Trap:** Not handling post deletion in feed caches. Deleted posts continue appearing in followers' feeds until the cache expires. Always implement either immediate removal or tombstone filtering.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For users with <10K followers, I remove the deleted post from all followers' feed caches immediately. For larger accounts, I use a tombstone approach — mark the post as deleted in a separate table and filter at read time. A background job asynchronously cleans up feed caches. For pull-based feeds, deletion is automatic since posts are queried fresh. The tombstone table has a TTL — after 30 days, deleted posts are permanently removed and tombstones expire."

#### How do you handle feed generation for a new user (cold start)?
- **The Engine Mechanism (Why it behaves this way):** New users have no follow graph and no engagement history, so personalized ranking is impossible. Cold start strategies: (1) Show trending/popular posts globally; (2) Ask the user to select interests during onboarding and show posts from those categories; (3) Show posts from suggested accounts (verified, popular, or matching signup source); (4) Use geographic proximity — show posts from nearby users; (5) As the user starts following and engaging, gradually transition to personalized ranking. The cold start feed uses a simpler scoring function (trending score + recency) until enough engagement data is collected.
- **The Unforgettable Mental Model:** The **New Student at School**. On the first day, you don't know anyone. The teacher (system) introduces you to popular students (trending), asks about your interests (onboarding), suggests clubs to join (suggested accounts), and seats you near your neighborhood (geographic). As you make friends (follow/engage), your social circle becomes personalized.
- **The Trap:** Showing an empty feed to new users. An empty feed gives no reason to stay. Always populate with trending, suggested, or interest-based content to engage the user immediately.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For new users, I'd show a mix of trending posts, interest-based content (from onboarding selections), suggested accounts, and geographically relevant posts. The scoring function uses trending score + recency instead of personalized signals. As the user follows accounts and engages with content, the system gradually transitions to personalized ranking. I'd track the cold start transition point — when the user has followed N accounts and engaged with M posts — and switch to the full ranking algorithm. This ensures a engaging experience from day one."

#### How do you handle media-rich posts (images, videos) in the feed?
- **The Engine Mechanism (Why it behaves this way):** Media is stored separately from post metadata. The post record contains media_references (array of media IDs), and the media service serves optimized versions. For the feed, only media thumbnails are included (not full-resolution images) to reduce payload size. The frontend lazy-loads full-resolution media when the post enters the viewport. Videos are transcoded into multiple resolutions and served via adaptive bitrate streaming (HLS). A CDN caches media thumbnails globally. The feed API returns media URLs with size parameters (GET /media/{id}?size=thumb) so the frontend requests the appropriate size for each context.
- **The Unforgettable Mental Model:** The **Magazine Layout**. The table of contents (feed) shows thumbnail images and headlines. When you turn to a page (scroll to post), the full-resolution image loads. The magazine uses smaller images in the index to save paper (bandwidth) and loads the full image only when you're looking at that page.
- **The Trap:** Including full-resolution media URLs in the feed response. A feed with 20 posts, each with a 5MB image, is 100MB — too large for mobile networks. Always include thumbnail URLs in the feed and lazy-load full resolution.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Media is stored separately from post metadata. The feed API returns only thumbnail URLs (size=thumb) to keep the response small. The frontend lazy-loads full-resolution media when posts enter the viewport. Videos are transcoded to multiple resolutions and served via HLS for adaptive streaming. A CDN caches thumbnails globally. The media service supports size parameters so the frontend can request the right size for each context (thumbnail for feed, medium for post detail, full for fullscreen). This reduces feed payload by 80-90%."

#### How do you scale feed generation for millions of users?
- **The Engine Mechanism (Why it behaves this way):** Scaling involves: (1) Feed partitioning — each user's feed is stored on a specific Redis shard based on user_id hash; (2) Write fan-out distribution — when a user posts, fan-out writes are distributed across Redis shards in parallel; (3) Read replicas — feed reads are served from Redis, database reads go to replicas; (4) Asynchronous fan-out — fan-out writes are queued in Kafka and processed by workers, so the post creation is fast; (5) Feed pre-computation — for active users, pre-compute the next page of the feed in the background; (6) Sharding by geography — users in the same region are on the same shard for lower latency. The fan-out worker pool scales based on queue depth.
- **The Unforgettable Mental Model:** The **Postal Sorting Network**. Each neighborhood (user shard) has its own sorting facility (Redis shard). When mail is sent (post), it's distributed to all relevant neighborhoods in parallel (fan-out). The sorting facilities work independently. If one neighborhood gets a lot of mail, more sorters are added (worker scaling). Mail for distant neighborhoods goes through regional hubs (geographic sharding).
- **The Trap:** Doing fan-out synchronously during post creation. If a user has 10K followers, fan-out takes seconds and blocks the post creation. Always queue fan-out writes and process asynchronously.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd partition feeds across Redis shards by user_id hash. Fan-out writes are queued in Kafka and processed by a scalable worker pool — post creation returns immediately. Reads are served from Redis (push-based) or database replicas (pull-based). For active users, I'd pre-compute the next feed page in the background. Geographic sharding keeps users in the same region on the same shard for lower latency. The fan-out worker pool auto-scales based on Kafka queue depth. Celebrity posts use pull-based generation to avoid massive fan-out."

## 8. Active recall test

1. **What is the hybrid fan-out approach for feed generation?**
   - **Explanation:** Push-based (fan-out on write) for normal users (<50K followers) — posts are pushed to followers' feed caches. Pull-based (fan-out on read) for celebrities (>50K followers) — posts are pulled at feed generation time. Balances write cost with read performance.

2. **How do you rank feed posts for relevance?**
   - **Explanation:** Multi-signal scoring: recency, engagement, relationship strength, content preference, and diversity. Weights tuned via A/B testing. ML models (collaborative filtering, neural networks) can replace linear scoring for more personalization.

3. **Why use cursor-based pagination for feeds?**
   - **Explanation:** Cursor pagination (WHERE score < cursor ORDER BY score DESC LIMIT 20) is O(log n) regardless of page depth. Offset pagination (LIMIT 20 OFFSET 1000) degrades to O(n) as offset increases. The cursor encodes score + post_id for stable ordering.

4. **How do you handle post deletion in feed caches?**
   - **Explanation:** For <10K followers, remove from all feed caches immediately. For larger accounts, use tombstones (mark deleted, filter at read time). A background job asynchronously cleans up caches. Pull-based feeds auto-filter deleted posts.

5. **How do you handle the cold start problem for new users?**
   - **Explanation:** Show trending posts, interest-based content (from onboarding), suggested accounts, and geographic posts. Use a simpler scoring function (trending + recency). Transition to personalized ranking after the user follows N accounts and engages with M posts.

6. **How do you optimize media-rich posts in the feed?**
   - **Explanation:** Include only thumbnail URLs in the feed response. Lazy-load full-resolution media when posts enter the viewport. Videos use adaptive bitrate streaming (HLS). CDN caches thumbnails globally. Reduces feed payload by 80-90%.

7. **How do you scale feed generation for millions of users?**
   - **Explanation:** Partition feeds across Redis shards by user_id hash. Queue fan-out writes in Kafka for async processing. Serve reads from Redis or database replicas. Pre-compute next feed page for active users. Scale fan-out workers based on queue depth.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a social media feed in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a social media feed in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
