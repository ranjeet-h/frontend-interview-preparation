# 28. Design Google Maps

[← Medium examples](index.md)

**Why interviewers ask** — Massive geospatial data, sub-second routing, live traffic fusion, and tile rendering at global scale.

**Core insight** — Roads are a weighted graph; routing is preprocessing plus fast query; maps are pre-rendered tiles on CDN, not drawn per request.

**Architecture**

```txt
Client → Tile CDN (precomputed map tiles)
      → Places API → geospatial index (geohash / S2 cells)
      → Routing engine (preprocessed graph, A* / contraction hierarchies)
      → Traffic service (probe data + ML) → edge weights
```

- **Map data** — Road graph stored in shards by region; intersections as nodes, roads as edges with distance/time cost.
- **Routing** — Preprocess hub labels or CH for fast point-to-point; reweight edges with live traffic.
- **Search** — Autocomplete on place names with geo bias toward user location.
- **Tiles** — Zoom-level pyramid; CDN cache by tile coordinates.

**Key decisions** — Precompute what you can (tiles, routing overlays); traffic updates edge weights, not the whole graph; geospatial index choice (geohash vs quadtree) drives nearby search.

**Scale & failure** — Regional graph shards; stale traffic better than no route; tile CDN absorbs render load; fallback to static weights if probes sparse.

**Deep link** — [Search autocomplete](../../backend-designs/design-a-search-autocomplete-system.md)

**Memory hook** — Tiles are pictures, routing is a weighted graph, traffic rewrites the weights.
