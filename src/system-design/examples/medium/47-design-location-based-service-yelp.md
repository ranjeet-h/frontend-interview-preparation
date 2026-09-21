# 47. Design Location-Based Service (Yelp)

[← Medium examples](index.md)

**Why interviewers ask** — Geospatial nearest-neighbor queries over millions of POIs with filters, reviews, and real-time updates.

**Core insight** — Lat/long queries need spatial indexing (geohash, quadtree, or R-tree) — not brute-force scan.

**Architecture**

```txt
Client → Search API (lat, lng, radius, filters) → geospatial index
       → business profile service → reviews + photos (CDN)
       → ranking (distance + rating + popularity)
```

- **Storage** — Businesses with coordinates; partitioned by geohash prefix.
- **Index** — Elasticsearch geo_point or custom geohash sorted sets; query nearby cells plus neighbors.
- **Updates** — Business hours, closures stream to index async.

**Key decisions** — Geohash prefix sharding for even distribution; cache popular city queries; filter by open-now requires fresh hours data.

**Scale & failure** — Replicate index; stale review count OK; geohash boundary cases query adjacent cells; CDN for images.

**Deep link** — [Search autocomplete](../../backend-designs/design-a-search-autocomplete-system.md)

**Memory hook** — Geohash turns "near me" into a string prefix lookup.
