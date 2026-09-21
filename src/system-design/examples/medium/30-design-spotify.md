# 30. Design Spotify

[← Medium examples](index.md)

**Why interviewers ask** — Audio streaming with playlists, cross-device sync, offline mode, and discovery — latency-sensitive reads plus social graph.

**Core insight** — Music files are CDN assets; playlists and listening state are metadata; recommendations keep users in the app.

**Architecture**

```txt
Client → Streaming CDN (audio segments) ← catalog service
      → Playlist / library service → user collections DB
      → Playback state sync (device handoff)
      → Recommendation engine (collaborative + editorial)
      → Search index (artists, tracks, podcasts)
```

- **Catalog** — Rights-managed track metadata; regional availability like Netflix.
- **Playlists** — User-curated and algorithmic; stored as ordered track IDs.
- **Playback** — Buffer ahead; quality adapts to bandwidth; offline = encrypted local cache.
- **Discovery** — Daily mixes from taste profile + session context.

**Key decisions** — Separate bytes (CDN) from rights (catalog API); playlist edits are cheap metadata writes; recommendations batch-computed, refreshed incrementally.

**Scale & failure** — CDN for playback spikes; rights check on every stream start; sync conflicts on playlist rare — last-write-wins with version; recommendation lag acceptable.

**Deep link** — [Recommendation backend](../../backend-designs/design-a-recommendation-backend.md)

**Memory hook** — Tracks are CDN files, playlists are ID lists, discovery is ML on those lists.
