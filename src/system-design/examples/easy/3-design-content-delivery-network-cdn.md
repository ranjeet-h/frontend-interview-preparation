# 3. Design Content Delivery Network (CDN)

[← Easy examples](index.md)

**Why interviewers ask:** CDNs appear in almost every scale story. This problem checks whether you understand edge caching, origin offload, geo routing, and the hard part — invalidation when content changes.

**Core insight:** Push static assets to edge nodes near users; on request, serve from edge if fresh, otherwise fetch from origin once and cache — DNS/geo routing picks the nearest edge.

**Architecture**

```txt
User → GeoDNS / Anycast → Edge server (region)
                              ↓ cache hit → response
                              ↓ miss
                         Origin server (authoritative content)
                              ↓
                         Cache fill at edge + TTL headers
         Ops plane: invalidation API, health checks, real-time monitoring
```

- **Origin servers:** Authoritative source for HTML, images, JS, video; not hit on every user request once edge is warm.
- **Edge servers:** Distributed globally; hold cached copies keyed by URL + cache headers; terminate TLS close to users.
- **GeoDNS / routing:** Maps client to nearest healthy edge — latency reduction is the primary win.
- **Invalidation mechanism:** Purge by URL, path prefix, or cache tag when content updates — stale edges are the main consistency risk.
- **Monitoring:** Per-edge hit ratio, origin load, latency p99 — alerts when origin spikes (cache miss storm).

**Key decisions**

- **Push vs pull CDN:** Pull (edge fetches on miss) is default for web assets; push (pre-upload to all edges) for large static bundles or live event prep.
- **TTL vs active purge:** Long TTL + purge on publish for news sites; short TTL for semi-dynamic content — balances freshness vs origin load.
- **Cache key design:** Include host, path, query variants (or normalize) — wrong keys cause duplicate cache entries or wrong content served.

**Scale & failure:** Origin overload when many edges miss simultaneously (cache stampede) breaks first. Mitigation: stale-while-revalidate, request coalescing at edge, and shield origin behind a mid-tier cache layer.

**Memory hook:** CDN is a photocopy shop at every city — users grab the local copy; only call headquarters (origin) when the shelf is empty or the page changed.
