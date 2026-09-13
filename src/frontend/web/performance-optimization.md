# Web Performance Optimization

## 1. Why This Exists — The Problem First

The site works on your M3 MacBook on office WiFi. A user on a three-year-old Android phone on a train waits eight seconds staring at a white screen, then gives up. Your API is fast but the frontend ships a 2MB JavaScript bundle and unoptimized PNG heroes. Sales says "the site feels slow." Marketing blames engineering. Engineering blames the CDN. Nobody measured the right thing.

Performance isn't one knob. It's the whole path from server to painted pixels — and most wins come from doing less work and doing it in the right order.

## 2. The Analogy — Make It Obvious

Shipping a package across the country:

- **Fewer packages** — combine files, remove unused code (fewer HTTP requests, less download)
- **Smaller boxes** — minify, compress, resize images (less weight per trip)
- **Closer warehouse** — CDN (shorter distance)
- **Express lane for essentials** — critical CSS first, defer the rest (open the important box first)
- **Don't block the driveway** — render-blocking scripts stop the truck from unloading (async/defer)

Slow delivery is never one broken step — it's the chain. Fix the bottleneck you can measure.

## 3. How It Actually Works — The Full Explanation

**Network layer**

- **Reduce requests** — bundle wisely (but don't over-bundle), sprite icons sparingly, HTTP/2+ multiplexing reduces penalty for many small files
- **Compression** — Gzip/Brotli on text assets (HTML, CSS, JS, SVG, JSON). Server config, not frontend-only
- **CDN** — cache static assets geographically close to users; cache bust with hashed filenames (`main.a3f2c1.js`)
- **HTTP caching** — `Cache-Control: max-age=31536000, immutable` for hashed assets; shorter for HTML

**Asset weight**

- **Minification** — strip whitespace/comments from CSS/JS/HTML in production builds
- **Tree shaking** — bundler removes unused exports (requires ES modules, side-effect-free code)
- **Code splitting** — dynamic `import()` loads routes/features on demand
- **Images** — WebP/AVIF, responsive `srcset`/`sizes`, correct dimensions (don't ship 4000px for 400px display), lazy-load below fold
- **Fonts** — subset fonts, `font-display: swap`, preload only critical weights

**Critical rendering path**

Browser sequence roughly: HTML → parse DOM → discover CSS → parse CSSOM → discover JS → (block?) → layout → paint.

Optimizations:
- **Critical CSS inline** in `<head>` for above-fold styles (advanced; often build-tool handled)
- **Defer non-critical CSS** — load async with `media="print" onload` pattern or split chunks
- **Scripts:** `defer` (runs after HTML parsed, order preserved), `async` (downloads parallel, runs when ready, order not guaranteed), avoid blocking scripts in head without these
- **Preconnect** to API/font origins: `<link rel="preconnect" href="https://api.example.com">`
- **Preload** critical assets: fonts, LCP image

**Runtime / JavaScript**

- Reduce main-thread work — smaller bundles, avoid long tasks
- Virtualize long lists
- Debounce/throttle expensive handlers
- Web Workers for heavy computation
- Avoid layout thrashing — batch DOM reads/writes

**Server / delivery**

- Fast TTFB — SSR caching, edge functions, database query optimization
- SSR/SSG vs pure CSR for content-heavy pages (faster first paint)

**Measurement**

- Lighthouse (lab), WebPageTest, Chrome DevTools Performance
- RUM: web-vitals, your analytics
- Fix what field data shows, validate in lab

## 4. Real Code — See It Working

Responsive image:

```html
<img
  src="product-800.webp"
  srcset="product-400.webp 400w, product-800.webp 800w, product-1200.webp 1200w"
  sizes="(max-width: 600px) 100vw, 50vw"
  alt="Blue running shoes"
  width="800"
  height="600"
  loading="lazy"
  decoding="async"
>
```

Defer app bundle, preload font:

```html
<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles/critical.css">
<script src="/js/app.js" defer></script>
```

Route-based code splitting (React):

```javascript
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./Dashboard'));

function App() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Dashboard />
    </Suspense>
  );
}
```

Cache-friendly build output:

```
/assets/main.a3f2c1.js   → Cache-Control: max-age=31536000, immutable
/index.html              → Cache-Control: no-cache (revalidate each visit)
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are key web performance optimization strategies?**

Reduce bytes (minify, compress, optimize images, tree-shake), reduce round trips (bundle, HTTP/2, CDN), cache aggressively with correct headers, optimize critical rendering path (defer JS, prioritize CSS, preload LCP), measure with field + lab data, fix main-thread long tasks for interactivity.

**Q: What is the critical rendering path?**

Sequence browser takes from HTML/CSS/JS to first paint. Blocking CSS and synchronous JS delay it. Optimize by minimizing blocking resources and size of what's needed for first paint.

**Q: defer vs async?**

`defer` — download parallel, execute after document parsed, preserves order. Best for app scripts. `async` — download parallel, execute immediately when ready, order not guaranteed. Good for independent third-party snippets.

**Q: How do you optimize images?**

Modern formats, compression, serve correct size via srcset, explicit dimensions for CLS, lazy-load below fold, preload LCP image, CDN.

**Q: What is tree shaking?**

Dead code elimination at build time — unused exports dropped from bundle. Requires static `import`/`export` and side-effect-free modules.

## 6. The Traps — What Goes Wrong

**One giant bundle "because HTTP/2".** Still parses on main thread — hurts INP.

**Lazy-loading everything including hero.** Kills LCP.

**Caching HTML aggressively.** Users see stale app shell. Hash assets; revalidate HTML.

**Micro-optimizing images while shipping 500KB of lodash.** Profile bundle first.

**No cache headers on static assets.** CDN helps less if browser re-downloads every visit.

**Measuring only on desktop.** Mobile CPUs and networks are the real test.

## 7. Compare With Related Concepts

**Performance vs Core Web Vitals.** CWV are three user-centric outcomes; optimization is the toolkit to improve them and overall UX.

**CDN vs browser cache.** CDN reduces latency to first byte from edge; browser cache avoids re-download on repeat visits. Both matter.

**SSR vs performance.** SSR adds server work but can improve LCP for content sites. CSR can win for highly interactive apps after first load — choose per product.

## 8. 🧠 The Memory Hook — What Sticks

Ship less, ship it closer, show something important first, don't block the parser with JS. Measure on a slow phone, not your laptop.
