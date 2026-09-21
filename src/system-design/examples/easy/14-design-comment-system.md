# 14. Design Comment System

[← Easy examples](index.md)

**Why interviewers ask:** Comments combine threaded writes, paginated reads, and optional real-time updates — a common social feature pattern. Interviewers watch for tree modeling, hot-post read amplification, and moderation hooks.

**Core insight:** Store comments as rows with `parent_id` for threading; paginate by post + cursor; cache top threads on viral posts; push new comments via WebSocket only if live updates matter.

**Architecture**

```txt
Client → Comment API (post / list / reply)
              ↓
         Comments DB (post_id, parent_id, author, body, created_at)
              ↓ read hot posts
         Redis (cached thread pages)
              ↓ optional
         WebSocket fanout (new comment events)
              ↓ async
         Moderation queue (spam scan)
```

- **Comments table:** `parent_id` NULL for top-level; index on `(post_id, created_at)` for pagination; optional `path` materialization for deep trees.
- **API layer:** Create validates post exists and user permission; list returns cursor-based pages to avoid OFFSET cost on large threads.
- **Cache:** First page of popular posts — invalidate on new top-level comment or configurable TTL.
- **WebSocket layer:** Subscribe per post room; broadcast new comment id — clients fetch full body via API for consistency.
- **Moderation worker:** Async toxicity/spam scoring before or after publish depending on strictness.

**Key decisions**

- **Adjacency list vs closure table:** Adjacency (`parent_id`) is simple; closure table speeds "all descendants" but costs write complexity — adjacency + cursor pagination is enough for most feeds.
- **Sync moderation vs post-moderate:** Post-moderate faster UX; pre-moderate for regulated brands — queue holds comment until score passes.
- **Denormalized counts:** `reply_count` on parent updated async — avoids COUNT(*) on every render.

**Scale & failure:** Viral post comment reads hammer DB and cache on one `post_id` first. Mitigation: cache thread pages, read replicas, and rate limit writes per user per post.

**Deep link:** [Design a comments system](../../backend-designs/design-a-comments-system.md)

**Memory hook:** Comments are a tree in a table — parent_id points up, paginate by post, cache the flame war's first page.
