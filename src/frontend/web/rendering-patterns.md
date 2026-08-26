# Rendering Patterns (CSR, SSR, SSG, ISR)

## 1. Why This Exists — The Problem First

You ship a React SPA. Google sees an empty `<div id="root">` until JavaScript downloads, parses, and runs. Users on slow phones stare at white. Marketing wants a blog that updates daily but ops doesn't want to rebuild 10,000 pages every time someone fixes a typo.

**Where and when HTML is produced** changes everything: first paint speed, SEO, hosting cost, freshness of data, and complexity of your stack. Picking "React" without picking a rendering pattern is how teams accidentally build the slowest possible version of their product.

## 2. The Analogy — Make It Obvious

A restaurant menu can reach customers four ways:

**CSR (Client-Side Rendering)** — You get a **blank menu cover** and a phone number. You call (download JS), wait on hold (parse/execute), then they **read you the entire menu over the phone**. Rich interactions possible once you're on the call — but you're hungry now.

**SSR (Server-Side Rendering)** — You walk in; they **hand you a printed menu** fresh off the printer for today's specials (HTML per request). Instant read. Kitchen still busy if you order something custom (hydration + client JS for interactivity).

**SSG (Static Site Generation)** — Menus were **printed at closing time yesterday** and stacked at the door. Grab one — fastest, cheapest. Bad if today's special isn't on yesterday's print.

**ISR (Incremental Static Regeneration)** — Mostly yesterday's stack, but the **printer reprints one page** when a dish sells out or every hour — without reprinting the whole book.

## 3. How It Actually Works — The Full Explanation

**CSR — Client-Side Rendering**

Server sends minimal HTML + large JS bundle. Browser executes JS, fetches data, builds DOM (React `createRoot`, Vue `mount`).

Pros: rich interactivity, simpler deploy (static hosting + API), fast *subsequent* navigations in SPA.

Cons: slow **first contentful paint** and **LCP** if JS-heavy; SEO harder (improved with dynamic rendering but not free); blank shell until JS runs.

Typical: internal dashboards, apps behind login, highly interactive tools.

**SSR — Server-Side Rendering**

Server runs React (or similar) per request → full HTML string → browser displays immediately → JS **hydrates** (attaches event listeners, reconciles).

Pros: fast first paint, good SEO for dynamic content, social previews work.

Cons: server cost and complexity, TTFB can rise, full page navigation unless paired with client routing, hydration mismatch bugs if server/client differ.

Typical: e-commerce product pages, personalized content, Next.js `getServerSideProps` / App Router dynamic server components.

**SSG — Static Site Generation**

HTML generated **at build time** for each route. Deployed as static files (CDN).

Pros: fastest delivery, cheap scale, secure (no server runtime for pages), great SEO for stable content.

Cons: stale until rebuild, not for highly personalized or real-time data without client fetch.

Typical: blogs, docs, marketing sites. Next.js `output: 'export'`, Gatsby, Astro static.

**ISR — Incremental Static Regeneration**

Hybrid: static pages with **background revalidation**. Serve cached HTML; after `revalidate` seconds (or on-demand), regenerate one path.

Pros: SSG speed + fresher data without full rebuild.

Cons: complexity, brief stale windows, platform-specific (Next.js `revalidate`).

Typical: large product catalogs, news sites with thousands of pages.

**Hydration** — SSR/SSG HTML is not interactive until client JS hydrates. **React Server Components** push further: server components never hydrate; client components do.

**Choosing:**

| Need | Lean toward |
|---|---|
| SEO + dynamic per-user | SSR or RSC |
| SEO + same for everyone | SSG |
| Huge site, occasional updates | ISR |
| App behind auth, interactivity first | CSR (+ code splitting) |
| Mix | Next.js App Router: static + dynamic routes per page |

## 4. Real Code — See It Working

CSR entry (Vite + React):

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
```

```javascript
createRoot(document.getElementById('root')).render(<App />);
```

Next.js SSG (pages router style):

```javascript
export async function getStaticProps() {
  const posts = await fetchPosts();
  return { props: { posts } };
}

export default function Blog({ posts }) {
  return posts.map((p) => <article key={p.id}>{p.title}</article>);
}
```

ISR with revalidation:

```javascript
export async function getStaticProps() {
  const product = await fetchProduct();
  return {
    props: { product },
    revalidate: 60, // regenerate at most once per 60 seconds when requested
  };
}
```

SSR pattern (conceptual):

```javascript
// Server
const html = renderToString(<App url={req.url} />);
res.send(`<!DOCTYPE html><body><div id="root">${html}</div><script src="client.js"></script></body>`);

// Client hydrates
hydrateRoot(document.getElementById('root'), <App />);
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Compare CSR, SSR, SSG, and ISR.**

CSR: HTML shell, render in browser. SSR: HTML per request on server, hydrate. SSG: HTML at build time, CDN. ISR: static with timed/on-demand regeneration. Tradeoffs: freshness, speed, cost, SEO, complexity.

**Q: Pros and cons of CSR?**

Pros: interactive SPA, simple CDN deploy. Cons: slow initial load, SEO challenges, blank until JS.

**Q: Why SSR for SEO?**

Crawlers and link previews get meaningful HTML immediately without executing JS. Dynamic personalized content can be in first response.

**Q: When SSG over SSR?**

Content identical for all users and changes infrequently — docs, marketing. Cheaper and faster at scale.

**Q: What is hydration?**

Attaching client-side JS to server-rendered HTML so components become interactive. Mismatch if server HTML ≠ client first render.

## 6. The Traps — What Goes Wrong

**CSR for public marketing site** — bad LCP and SEO unless you add prerender/SSR.

**SSR everything** — server load and cost when SSG would suffice.

**SSG for real-time dashboard** — stale or huge client fetch anyway — pick CSR or SSR.

**Hydration mismatch** — `Date.now()`, `Math.random()`, browser-only APIs in initial render break SSR.

**Ignoring TTFB on SSR** — fast LCP but slow server = still feels broken.

**Assuming ISR is magic** — stale content windows need product acceptance.

## 7. Compare With Related Concepts

**Rendering pattern vs hosting.** SSG on S3/Cloudflare Pages; SSR needs Node/serverless runtime.

**SSR vs React Server Components.** RSC renders some components only on server, zero client JS for those parts — evolution of "where work runs."

**SPA routing vs MPA.** SPA = CSR navigation without full reload. SSR can still be SPA with client router after hydrate.

**Streaming SSR.** Send HTML in chunks as ready — improves TTFB and perceived speed (React 18 `renderToPipeableStream`).

## 8. 🧠 The Memory Hook — What Sticks

CSR: blank menu until the phone call (JS) finishes. SSR: fresh print per visitor. SSG: menus printed last night. ISR: reprint one page when it goes stale. Pick where HTML is born based on SEO, freshness, and who waits for JavaScript.
