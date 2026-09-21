# 66. Design Recommendation Algorithm

[← Hard examples](index.md)

**Why interviewers ask** — Connects ML theory to production: cold start, sparsity, latency budgets, and avoiding filter bubbles at scale.

**Core insight** — No single algorithm wins; hybrid retrieval (candidate generation) plus ranking (precision) runs offline for heavy compute and online for milliseconds.

**Architecture**

```txt
Offline: interaction logs → matrix factorization / embeddings → candidate index
Online:  user context → retrieve top-K candidates → ranker (ML) → diversity re-rank → serve
         ↓
    impression / click logging → feedback loop
```

- **Collaborative filtering** — User-user or item-item similarity; matrix factorization for latent factors.
- **Content-based** — Item features + user profile vectors for cold-start items.
- **Two-tower retrieval** — Embed user and item separately; ANN search (FAISS) for fast candidate pull.
- **Ranking** — GBDT or neural ranker on rich features; exploration slot for new items.

**Key decisions** — Candidate set size vs latency; re-rank for diversity to break filter bubble; separate models per surface (home vs search).

**Scale & failure** — Precompute item embeddings; fallback to popular/trending on cold users; A/B test ranker changes with guardrail metrics (retention, not just CTR).

**Deep link** — [Recommendation backend](../../backend-designs/design-a-recommendation-backend.md)

**Memory hook** — Retrieve wide, rank narrow, explore a little — cold users get content, warm users get collab.
