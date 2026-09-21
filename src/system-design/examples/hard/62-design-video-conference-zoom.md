# 62. Design Video Conference (Zoom)

[← Hard examples](index.md)

**Why interviewers ask** — Real-time media at 100+ participants tests UDP/WebRTC knowledge, SFU vs MCU tradeoffs, and graceful degradation under packet loss.

**Core insight** — Use an SFU (Selective Forwarding Unit) so each client uploads once and the server forwards streams — far cheaper than transcoding every stream in an MCU.

**Architecture**

```txt
Client ↔ Signaling server (WebSocket) — join, ICE, SDP exchange
Client ↔ SFU media server — WebRTC RTP streams (audio/video/screen)
       ↔ TURN relay (fallback when NAT blocks P2P)
Recording → subscribe all streams → encode → object storage
```

- **Signaling** — Room state, participant list, mute/kick, screen-share token.
- **SFU** — Forwards packets without decode; simulcast layers let server pick resolution per receiver bandwidth.
- **Adaptation** — TWCC/BWE lowers bitrate on congestion; prioritize audio over video.
- **Recording** — Server-side compositor or per-participant tracks stored separately.

**Key decisions** — SFU for large meetings, MCU only for heavy compositing/recording; regional media servers for latency; E2E encryption complicates server-side features.

**Scale & failure** — Horizontal SFU pools per region; participant migrates on node failure via ICE restart; TURN bandwidth is expensive — monitor and cap.

**Deep link** — [Real-time chat](../../backend-designs/design-a-real-time-chat-system.md)

**Memory hook** — Signaling sets up the room, SFU forwards streams — upload once, download many.
