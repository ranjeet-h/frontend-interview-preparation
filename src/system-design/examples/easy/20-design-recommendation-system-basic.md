# 20. Design Recommendation System (Basic)

[← Easy examples](index.md)

**Why interviewers ask:** Even a "basic" recommender tests whether you can start simple — popularity baseline, then collaborative or content signals — without jumping to deep learning. Interviewers want offline batch compute, fast online serve, and cold-start handling.

**Core insight:** Precompute item similarities or user neighborhoods offline; online API returns top-N from precomputed lists with fallbacks for new users (popular items) and new items (content features).

**Architecture**

```txt
User events → Event log (clicks, purchases, views)
              ↓ batch (nightly)
         ML / batch job (collaborative filtering matrix)
              ↓
         Recommendation store (user_id → ranked item ids)
              ↓ online
         Rec API → merge with popularity fallback + filters
              ↓
         Cache hot users' lists in Redis
```

- **Event log:** Immutable click/purchase stream — training data source; at-least-once ingest from app analytics.
- **Batch job:** User-based CF ("users like you bought") or item-based CF ("similar items") — compute offline due to cost.
- **Recommendation store:** Per-user ranked list in DB or key-value — online read is lookup not matrix math.
- **Rec API:** Fetch precomputed list; apply business rules (exclude already purchased, in-stock filter); slice top 20.
- **Cache:** Redis for active users' lists — refresh after batch run or on significant new interaction.

**Key decisions**

- **User-based vs item-based CF:** Item-based scales better (fewer items than users); user-based can feel more personal for small catalogs.
- **Content-based fallback:** New items use category/tags similarity when interaction data missing — solves cold-start item side.
- **Popularity baseline:** New users get trending/popular until enough events exist — never return empty.

**Scale & failure:** Batch job delay means stale recommendations after trends shift — perceived quality drops first. Mitigation: hourly mini-batches for trending, real-time counter for "hot now," and explore slot in UI.

**Deep link:** [Design a recommendation backend](../../backend-designs/design-a-recommendation-backend.md)

**Memory hook:** Basic rec is homework done overnight — batch job writes cheat sheets per user, API just reads the cheat sheet and falls back to "most popular" for strangers.
