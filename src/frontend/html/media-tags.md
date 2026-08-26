# HTML Media Tags

## 1. Why This Exists — The Problem First

You need video on your site. In 2010 that meant Flash — a plugin users had to install, that drained batteries, that iPhones refused to run at all. Audio players were custom JavaScript widgets built on top of hidden plugins. Every team reinvented the same play/pause button.

HTML5 killed that mess with `<video>` and `<audio>`: native playback in the browser, keyboard accessible by default, no plugin updates, no security holes in abandoned Flash builds. If you don't understand these tags, you'll either reach for a heavy library when you don't need one, or ship broken playback on half your users' devices because you picked one codec and called it done.

## 2. The Analogy — Make It Obvious

Think of `<video>` and `<audio>` as **built-in TV and radio sets** in the browser wall.

You (the developer) supply the **channels** (`<source>` files in different formats). The TV picks the first channel it can tune. You can hand users the **remote** (`controls`), hang a **poster frame** on the screen before the show starts, and decide whether the show **auto-starts** when someone walks in (usually you shouldn't — browsers often block that).

The fallback text inside the tag is the note you leave when someone's TV can't receive the signal: "Sorry, here's a download link instead."

## 3. How It Actually Works — The Full Explanation

**`<video>`** embeds video with a built-in playback pipeline. The browser handles decode, render to a surface, and UI (if `controls` is present).

**`<audio>`** is the same idea without a picture — music, podcasts, sound effects.

**Multiple `<source>` children** let you offer format options:

```html
<source src="clip.webm" type="video/webm">
<source src="clip.mp4" type="video/mp4">
```

The browser tries sources **in order** and uses the first format it can decode. You don't pick for the user — the browser does.

**Common video attributes:**

| Attribute | What it does |
|---|---|
| `controls` | Native play/pause, timeline, volume, fullscreen |
| `width` / `height` | Player dimensions (video scales inside) |
| `poster` | Image shown before playback starts |
| `preload` | `none`, `metadata`, or `auto` — how much to buffer before play |
| `autoplay` | Start automatically (often blocked unless `muted`) |
| `muted` | No sound; often required for autoplay to work |
| `loop` | Restart when finished |
| `playsinline` | Play inline on iOS instead of forcing fullscreen |

**Common audio attributes:** `controls`, `autoplay`, `loop`, `preload` — same ideas, no `poster` or `playsinline`.

**Codec reality:** MP4 (H.264 + AAC) has the widest support for video. WebM (VP9/AV1 + Opus) is smaller and open but Safari lagged for years — always provide MP4 as fallback. For audio, MP3 and AAC cover most browsers; Ogg Vorbis/WebM as optional second source.

**Captions and accessibility:** Use `<track kind="captions" src="en.vtt" srclang="en" label="English" default>` inside `<video>`. Screen reader users and anyone in a quiet room depend on it. `kind` can also be `subtitles`, `descriptions`, `chapters`.

**JavaScript API:** `video.play()`, `video.pause()`, `video.currentTime`, events (`play`, `pause`, `ended`, `timeupdate`). `play()` returns a Promise — autoplay policies can reject it.

**`autoplay` policy:** Browsers block autoplay with sound to protect users. Pattern for hero videos: `autoplay muted playsinline loop`. Still test — don't assume.

**Don't use media tags for ads you can't control** without considering performance — video decode is expensive. Lazy-load below-the-fold media (`preload="none"`, Intersection Observer to set `src`).

## 4. Real Code — See It Working

Accessible video with multiple formats, poster, and captions:

```html
<video
  controls
  width="800"
  height="450"
  poster="/images/talk-poster.jpg"
  preload="metadata"
>
  <source src="/video/talk.webm" type="video/webm">
  <source src="/video/talk.mp4" type="video/mp4">
  <track
    kind="captions"
    src="/video/talk-en.vtt"
    srclang="en"
    label="English"
    default
  >
  <p>
    Your browser cannot play this video.
    <a href="/video/talk.mp4">Download the MP4</a>.
  </p>
</video>
```

Background hero loop (muted autoplay pattern):

```html
<video
  autoplay
  muted
  loop
  playsinline
  preload="auto"
  aria-hidden="true"
  class="hero-video"
>
  <source src="/hero.webm" type="video/webm">
  <source src="/hero.mp4" type="video/mp4">
</video>
```

```css
.hero-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

Audio podcast player:

```html
<audio controls preload="metadata">
  <source src="/podcast/episode-12.mp3" type="audio/mpeg">
  <source src="/podcast/episode-12.ogg" type="audio/ogg">
  <p><a href="/podcast/episode-12.mp3">Download episode 12</a></p>
</audio>
```

Programmatic play with error handling:

```javascript
const video = document.querySelector('video');

async function safePlay() {
  try {
    await video.play();
  } catch (err) {
    // Autoplay blocked or media not ready — show a play button
    showPlayOverlay();
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you use `<audio>` and `<video>` tags?**

Add the element with `controls` for native UI. Nest multiple `<source>` elements with different formats and correct `type` attributes. Include fallback text or a download link inside the tag. Use `poster` on video, `track` for captions, and `preload` to balance startup vs bandwidth.

**Q: Why provide multiple source formats?**

Browsers support different codecs. You list sources in preference order; the browser picks the first it can play. Typically WebM first (better compression), MP4 second (universal fallback). One format is simpler but risks "video doesn't work" on some devices.

**Q: Why doesn't autoplay work?**

Browser autoplay policies block sound without user gesture. `autoplay` alone often fails. `autoplay muted playsinline` usually works for silent background video. Always provide controls or a visible play affordance as fallback.

**Q: What's the difference between `preload="none"` and `preload="auto"`?**

`none` — don't fetch until user plays (saves data). `metadata` — fetch duration/dimensions only. `auto` — browser may buffer the whole file. Use `none` or `metadata` for below-fold media; `auto` only when playback is likely immediately.

**Q: How do you make video accessible?**

Captions via `<track kind="captions">`. Don't rely on autoplay with sound. Ensure keyboard access to controls (native `controls` handle this). Provide transcript for important content. If custom UI, replicate focus and ARIA patterns.

## 6. The Traps — What Goes Wrong

**Single format only (WebM on Safari-heavy audience).** Black box or download fallback. Always test Safari/iOS with MP4.

**Huge files without compression or adaptive streaming.** `<video src="4k-raw.mp4">` on mobile burns data and stalls. Compress, offer multiple resolutions, or use HLS/DASH for long content.

**Autoplay with sound.** Blocked and annoying. Mute or wait for user click.

**Missing `playsinline` on iOS.** Video jumps to fullscreen unexpectedly.

**Custom player skin with no keyboard support.** Native `controls` are free accessibility. Custom means you own focus, ARIA, and shortcuts.

**Forgetting fallback content.** Empty tag when unsupported — bad UX. Always include text or link.

**Using `<video>` for GIF-like animations.** A looping muted MP4/WebM is often smaller than GIF, but for tiny icons consider CSS/SVG/Lottie instead.

## 7. Compare With Related Concepts

**`<video>` vs embedded YouTube iframe.** iframe is easier for hosting/bandwidth but less control, tracking, privacy (third-party cookies), and styling. Self-hosted `<video>` when you own the file and need custom UX.

**`<video>` vs CSS `background-video`.** Background via CSS can't use native captions easily and is decorative — hide from AT with `aria-hidden`. Meaningful content belongs in `<video>` with controls and tracks.

**Media tags vs Web Audio API.** Media tags for playback of files. Web Audio API for processing sound (effects, visualization, precise scheduling). Different layers.

**`<track>` captions vs burned-in subtitles.** Burned-in can't be toggled off, don't scale well, fail accessibility. WebVTT tracks are the right default.

## 8. 🧠 The Memory Hook — What Sticks

Video and audio tags are a TV with multiple tuners: give the browser format choices, hand users the remote (`controls`), mute autoplay if you want it to actually run, and never ship without captions and a fallback link.
