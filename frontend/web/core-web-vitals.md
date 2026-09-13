# Core Web Vitals

## 1. Why This Exists — The Problem First

Your site loads. Technically. But users bounce because the hero image pops in three seconds late and shifts the "Buy" button under their thumb. Or they tap "Add to cart" and nothing happens for half a second while JavaScript is still chewing through a bundle.

Google noticed users hate that. So did product teams watching conversion charts. **Core Web Vitals** are Google's way of naming the three user-perceived failures that show up in data: slow main content, sluggish first interaction, and layout jumping around. They're not academic metrics — they're proxies for "does this site feel broken?"

## 2. The Analogy — Make It Obvious

A restaurant with three ways to ruin dinner:

1. **LCP (Largest Contentful Paint)** — How long until the main dish hits the table? If guests stare at an empty plate for five minutes, they're leaving. LCP is "when does the biggest visible thing actually appear?"

2. **INP (Interaction to Next Paint)** — formerly centered on FID. You raise your hand for the waiter. How long until they acknowledge you and something changes? Slow INP = taps that feel ignored.

3. **CLS (Cumulative Layout Shift)** — Does the table jump while you're eating? Menu slides under your elbow, salt shaker teleports. CLS measures unexpected layout movement.

Good restaurant on all three: food arrives, staff responds, table stays stable. Bad on any one: reviews tank — and so do rankings and revenue.

## 3. How It Actually Works — The Full Explanation

**LCP — loading**

Measures when the **largest contentful element** in the viewport finishes rendering. Usually a hero image, large text block, or video poster — not the whole page.

**Good:** ≤ 2.5 seconds (75th percentile of visits)  
**Needs improvement:** 2.5–4s  
**Poor:** > 4s

What helps: fast server (TTFB), compress images, preload LCP image (`<link rel="preload" as="image">`), don't lazy-load above-the-fold hero, inline critical CSS, reduce render-blocking JS.

What hurts: huge unoptimized images, slow APIs blocking render, client-only rendering with empty shell until JS runs.

**INP — interactivity** (replaced FID as a Core Web Vital)

Measures responsiveness across **all** interactions on a page — worst (or high percentile) delay from input until the next frame paints. FID only measured the *first* interaction; INP catches ongoing jank.

**Good:** ≤ 200ms  
**Needs improvement:** 200–500ms  
**Poor:** > 500ms

What helps: less main-thread work, code splitting, web workers for heavy tasks, avoid long tasks (>50ms), optimize event handlers.

What hurts: massive JS bundles parsing on main thread, synchronous layout thrashing, third-party scripts.

**CLS — visual stability**

Sum of **unexpected** layout shift scores when elements move without user action. Reserved space for ads/images prevents shifts. Animating `transform` instead of `top`/`height` doesn't count as CLS.

**Good:** ≤ 0.1  
**Needs improvement:** 0.1–0.25  
**Poor:** > 0.25

What helps: `width`/`height` on images and video, `aspect-ratio`, skeleton placeholders matching final size, `font-display: swap` with matched fallback metrics.

What hurts: injecting banners without reserved space, web fonts causing FOIT/FOUT reflow, dynamically inserted content above existing content.

**How they're measured:** Real User Monitoring (Chrome UX Report, field data) and lab tools (Lighthouse, WebPageTest). Google Search uses field data for ranking signals. DevTools Performance panel shows individual metrics.

**Other vitals you'll hear:** TTFB (server), FCP (first paint), TBT (lab proxy for interactivity). Know CWV trio first.

## 4. Real Code — See It Working

Prevent image-related CLS:

```html
<img
  src="/hero.webp"
  alt="Product in use"
  width="1200"
  height="630"
  fetchpriority="high"
>
```

```css
.hero-img {
  aspect-ratio: 1200 / 630;
  width: 100%;
  height: auto;
}
```

Preload LCP candidate:

```html
<link rel="preload" as="image" href="/hero.webp" fetchpriority="high">
```

Measure in production with web-vitals library:

```javascript
import { onLCP, onINP, onCLS } from 'web-vitals';

function sendToAnalytics({ name, value, id }) {
  // your RUM endpoint
  console.log(name, value, id);
}

onLCP(sendToAnalytics);
onINP(sendToAnalytics);
onCLS(sendToAnalytics);
```

Reserve space for dynamic ad slot:

```css
.ad-slot {
  min-height: 250px; /* matches ad unit size */
  contain: layout;   /* isolate layout impact */
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are the Core Web Vitals?**

Three user-centric metrics: LCP (loading — largest content visible), INP (interactivity — input to next paint), CLS (visual stability — unexpected layout shift). Google uses them as page experience signals.

**Q: What is a good LCP score?**

2.5 seconds or less at the 75th percentile of real user visits. Measure field data, not just Lighthouse on your laptop.

**Q: What's the difference between FID and INP?**

FID measured delay only on the first interaction. INP reflects responsiveness across the whole visit — more representative of ongoing jank. INP is the current Core Web Vital for interactivity.

**Q: What causes high CLS?**

Images/embeds without dimensions, late-loading fonts shifting text, ads or banners injected without reserved space, DOM inserted above existing content.

**Q: How do you improve Core Web Vitals on a React SPA?**

SSR/SSG for faster LCP, code splitting and defer non-critical JS for INP, explicit image dimensions and font fallbacks for CLS, measure with RUM, fix the actual bottleneck (often images + JS main thread).

## 6. The Traps — What Goes Wrong

**Optimizing Lighthouse score only on fast WiFi.** Field data on mid-range Android tells the truth.

**Lazy-loading the LCP image.** Disastrous for LCP — never lazy-load hero.

**Chasing 100 Lighthouse while UX still feels slow.** Lab ≠ field. Users on 3G matter.

**Ignoring third-party scripts.** Analytics, chat widgets, ads often dominate INP.

**Animating width/height/margin** causing layout shifts — use `transform` and `opacity`.

**Assuming CWV are the only SEO factor.** Content and relevance still dominate; CWV are tie-breakers and UX guardrails.

## 7. Compare With Related Concepts

**Core Web Vitals vs Lighthouse score.** Lighthouse is lab diagnostic; CWV are field thresholds on real users. Use both.

**Performance vs perceived performance.** Fast TTFB with blank screen until JS hydrates feels slow — LCP captures visible progress.

**CWV vs business metrics.** Correlate INP/CLS with conversion; helps prioritize fixes with product.

## 8. 🧠 The Memory Hook — What Sticks

Three dinner killers: main dish late (LCP), waiter ignores you (INP), table keeps moving (CLS). Fix what users feel, not just what your build timer says.
