# HTML Meta Tags

## 1. Why This Exists — The Problem First

Your site looks perfect on your laptop. Open it on a phone and the text is microscopic. Share a link in Slack and the preview shows the wrong image — or nothing at all. Google shows your homepage title but the description is random body text scraped from the footer. Users in Japan see garbled characters because nobody set charset.

None of those are "CSS bugs." They're **metadata bugs**. The `<head>` is invisible on the page, but it tells the browser, search engines, and social platforms how to interpret and display your site. Skip it or get it wrong and the rest of your work ships broken for half your audience.

## 2. The Analogy — Make It Obvious

The visible webpage is the product on a store shelf. Meta tags are everything on the **packaging and shipping label** that the customer never reads while using the product but absolutely depends on before they do:

- **Charset** — which alphabet the instructions are written in
- **Viewport** — what size window the product expects to be viewed through
- **Title & description** — the name and blurb on the catalog listing
- **Open Graph / Twitter cards** — the photo and headline when someone texts the link to a friend

Bad packaging doesn't change what's inside the box. It changes whether people can open it, find it, or bother clicking.

## 3. How It Actually Works — The Full Explanation

Meta tags live in `<head>`. Most use `<meta name="..." content="...">` or `<meta property="..." content="...">`. They're **declarative instructions** — not displayed as body content.

**`<meta charset="UTF-8">`**
Tells the browser how to decode bytes into characters. UTF-8 covers essentially all written languages and emoji. Must appear early (within first 1024 bytes of the document). Without it, the browser guesses — often wrong for non-ASCII text.

**`<meta name="viewport" content="width=device-width, initial-scale=1.0">`**
Controls mobile layout viewport. Without it, mobile browsers assume a ~980px desktop width and scale down — tiny text. `width=device-width` matches the device screen. `initial-scale=1.0` sets starting zoom. Avoid `user-scalable=no` unless you have a very specific accessibility-reviewed reason — it blocks pinch-zoom.

**`<title>`** (not a meta tag, but head metadata)
Browser tab text, default bookmark name, primary search result headline. Unique per page. ~50–60 visible characters in Google before truncation — front-load keywords naturally, don't keyword-stuff.

**`<meta name="description" content="...">`**
Suggested snippet for search results. Not a ranking factor in the simple "more keywords = higher rank" sense, but it affects click-through rate. One per page, human-readable summary, ~150–160 characters.

**`<meta name="robots" content="noindex, nofollow">`**
Instructions for crawlers. `noindex` = don't list this page. `nofollow` = don't follow links on this page. Useful for staging, thank-you pages, internal search results.

**`<link rel="canonical" href="...">`**
Declares the preferred URL when duplicate content exists (www vs non-www, query params). Reduces SEO dilution.

**Open Graph (`og:*`) and Twitter Card tags**
Control link previews on social platforms:

```html
<meta property="og:title" content="Page title">
<meta property="og:description" content="Short summary">
<meta property="og:image" content="https://example.com/preview.jpg">
<meta property="og:url" content="https://example.com/page">
<meta name="twitter:card" content="summary_large_image">
```

Platforms fetch these when someone shares a URL. Image should be absolute URL, reasonable dimensions (often 1200×630 for OG).

**Theme and PWA-related**
`<meta name="theme-color" content="#1a1a2e">` — browser chrome color on mobile.
`<link rel="manifest" href="/manifest.json">` — PWA config (icons, name).

**`keywords` meta** — largely ignored by major search engines since the early 2000s. Don't waste time unless a niche system still reads it.

## 4. Real Code — See It Working

Head block you'd copy for a typical marketing/product page:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Pricing — Acme Analytics</title>
  <meta name="description" content="Simple pricing for teams of any size. Free tier available. No credit card required.">

  <link rel="canonical" href="https://acme.com/pricing">

  <!-- Social previews -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="Acme Analytics Pricing">
  <meta property="og:description" content="Simple pricing for teams of any size.">
  <meta property="og:image" content="https://acme.com/og/pricing.png">
  <meta property="og:url" content="https://acme.com/pricing">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Acme Analytics Pricing">
  <meta name="twitter:image" content="https://acme.com/og/pricing.png">

  <meta name="theme-color" content="#0f172a">
</head>
```

Staging environment that must not be indexed:

```html
<meta name="robots" content="noindex, nofollow">
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Explain common meta tags and what they do.**

Charset sets character encoding (UTF-8). Viewport configures mobile scaling. Description suggests search snippets. Robots controls crawlers. Canonical points to preferred URL. Open Graph and Twitter tags shape social link previews. Title defines the page name in tabs and search. Know which affect rendering (charset, viewport) vs discovery (description, OG) vs crawling (robots, canonical).

**Q: Why is the viewport meta tag essential?**

Mobile browsers default to a layout viewport wider than the screen, then scale the page down. Without `width=device-width`, your responsive CSS media queries fire at the wrong effective width and text looks tiny. Viewport meta bridges device pixels and CSS pixels for mobile layout.

**Q: Does meta description affect SEO ranking?**

Google has said it's not a direct ranking signal. It affects how your result looks in SERPs, which affects clicks. Write for humans, not keyword density. Missing description → Google may auto-generate a snippet from page content, often poorly.

**Q: What's the difference between `name` and `property` on meta tags?**

Historical convention: `name` for standard metadata (`description`, `viewport`, `robots`). `property` for Open Graph (`og:title`, etc.). Both are meta elements; parsers look at the attribute name to know which schema to use.

**Q: Where should charset be placed?**

As early as possible in `<head>`, ideally immediately after `<head>` opens. Late charset means the parser may misinterpret earlier characters in the file.

## 6. The Traps — What Goes Wrong

**Forgetting viewport on a responsive site.** #1 mobile layout bug. Always include it.

**Duplicate or conflicting meta tags.** Two descriptions, two canonicals — crawlers pick arbitrarily. One clear signal per page.

**Relative URLs in `og:image`.** Facebook/Slack can't resolve `/images/preview.jpg` without a origin. Use absolute URLs.

**Identical title and description on every page.** Hurts click-through; looks spammy. Each route gets unique metadata.

**Blocking zoom with `maximum-scale=1` or `user-scalable=no`.** Fails WCAG; angers users who need larger text. Avoid unless you truly know why.

**Expecting meta keywords to help SEO.** They don't, on Google/Bing. Spend time on title, description, content, performance.

**Relying on client-side JS for critical meta in SPAs.** Crawlers are better than they used to be, but title/description/OG should be in the initial HTML or SSR for reliable previews. Test with "View Source" and sharing debuggers (Facebook Sharing Debugger, Twitter Card Validator).

## 7. Compare With Related Concepts

**Meta tags vs HTTP headers.** Both carry metadata. `Content-Type` charset can be set in HTTP headers (preferred by some purists). `Cache-Control`, `Content-Security-Policy`, `X-Frame-Options` are headers, not meta — they must be set server-side. Meta viewport only exists in HTML — no header equivalent.

**Meta description vs on-page visible summary.** Description is for listings; visible `<p>` lede is for users who arrived. Often similar text, different jobs.

**SSR/SSG meta vs client-only React Helmet.** Frameworks like Next.js put meta in server-rendered head. Client-only updates may lag for crawlers and preview bots. Match delivery to how the page is rendered.

## 8. 🧠 The Memory Hook — What Sticks

Meta tags are the shipping label: charset so the text isn't gibberish, viewport so mobile isn't a postage stamp, title/description/OG so the link looks worth clicking before anyone sees your CSS.
