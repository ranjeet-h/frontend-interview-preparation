# 65. Design Spam Detection System

[← Hard examples](index.md)

**Why interviewers ask** — High-volume classification at low latency with evolving adversaries — rules for speed, ML for nuance, humans for edge cases.

**Core insight** — Layered defense: cheap rules catch obvious spam instantly; ML scores the rest; feedback loop retrains on new attack patterns.

**Architecture**

```txt
Inbound message → rule engine (keywords, URL reputation, IP blocklist)
               → feature extractor → ML model (gradient boosting / transformer)
               → score + action (allow / quarantine / block)
User reports → label queue → retrain pipeline → shadow deploy → promote
```

- **Rule layer** — Regex, domain blacklists, SPF/DKIM failures for email; sub-millisecond.
- **ML layer** — Features: n-grams, sender history, link entropy; batch train, online scoring.
- **Real-time inference** — Model served on GPU pool or optimized CPU; cache scores per content hash.
- **Feedback** — User "mark spam" and false-positive appeals feed labeled dataset.

**Key decisions** — Fail open vs closed depends on product (email quarantine vs social post); ensemble rules + ML; separate models per channel (SMS vs email).

**Scale & failure** — Horizontal scoring workers; model version rollback on precision drop; adversarial attacks trigger emergency rule deploys before retrain completes.

**Memory hook** — Rules catch knives, ML catches knives dressed as spoons, users teach both.
