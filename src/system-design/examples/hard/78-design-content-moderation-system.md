# 78. Design Content Moderation System

[← Hard examples](index.md)

**Why interviewers ask** — Billions of posts, harmful content, false positives, and human reviewer burnout — automated + human + community layers.

**Core insight** — Tiered moderation: fast automated filters catch obvious violations; edge cases go to human review queues; community reports feed the training loop.

**Architecture**

```txt
Upload → hash check (CSAM/perceptual) → ML classifiers (image, text, video frames)
      → score → auto-action (block / label / queue for review)
Human review UI → priority queue by severity × virality
Appeals → re-review → label correction → model retrain
```

- **Automated** — Perceptual hashing for known-bad content; NLP for hate speech; video frame sampling.
- **Human review** — SLA by severity; reviewer wellness (rotation, blur tools); inter-rater agreement tracking.
- **Community** — User reports weighted by reporter trust score; voting on borderline content.
- **Feedback** — False positive appeals improve model; shadow mode before rule deploy.

**Key decisions** — Fail closed for CSAM (hash match); fail open vs closed for spam varies; regional policy differences need geo-specific models.

**Scale & failure** — Pre-filter reduces human queue volume 90%+; viral content fast-tracked to front of queue; model rollback on precision drop.

**Memory hook** — Machines filter the obvious, humans judge the edge, appeals teach the machine.
