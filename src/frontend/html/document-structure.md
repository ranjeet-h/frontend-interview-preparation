# HTML Document Structure

## 1. Why This Exists — The Problem First

You open an HTML file and the page renders… weird. The charset is wrong so emojis break. Mobile users have to pinch-zoom because there's no viewport meta tag. The browser falls into quirks mode because there's no doctype. Or worse — nothing renders at all because the parser hit malformed markup and gave up in unpredictable ways.

Every one of those bugs traces back to the same thing: the skeleton of the document. Before you write a single `<div>`, the browser needs to know what kind of document this is, what language it's in, and where the invisible setup lives versus the visible content. Get the structure wrong and everything built on top of it wobbles.

## 2. The Analogy — Make It Obvious

An HTML document is like an envelope for a letter.

The **doctype** is the postal classification — "this is a modern HTML5 letter, handle it with current rules." Without it, the post office (browser) might treat your letter like it's from 1997.

The **`<html lang="...">`** is the language stamp. It tells everyone handling the letter how to pronounce it, translate it, or read it aloud.

The **`<head>`** is everything printed on the envelope and routing slip — title, charset, stylesheets, scripts to load. The recipient doesn't display the envelope on their wall; it's metadata for delivery and setup.

The **`<body>`** is the actual letter inside — what the person sees and reads.

If you put the letter on the outside of the envelope, or forget to seal it, or write the address in the wrong place, delivery fails. Same with HTML structure.

## 3. How It Actually Works — The Full Explanation

When a browser receives HTML, it doesn't paint pixels immediately. It **parses** the bytes into a tree — the DOM — following HTML5 parsing rules. The document structure tells the parser how to interpret what follows.

**`<!DOCTYPE html>`** must be the first line. It triggers **standards mode** — the browser uses modern CSS and layout rules. Without it, you risk **quirks mode**, where old IE compatibility bugs resurface (weird box model math, inconsistent sizing). HTML5 simplified the doctype to one line; you never need the old XHTML verbosity.

**`<html lang="en">`** (or `lang="hi"`, etc.) sets the document language. Screen readers pick the right voice and pronunciation. Search engines understand content language. Browsers can offer translation. It's one attribute with outsized accessibility and SEO impact.

**`<head>`** holds non-visible metadata:
- **`<meta charset="UTF-8">`** — how bytes map to characters. UTF-8 handles virtually all human writing. Put charset early in `<head>` so the parser doesn't misread the rest of the file.
- **`<title>`** — tab text, bookmark name, often the search result headline.
- **`<meta name="viewport" ...>`** — mobile rendering (covered in depth on the meta tags page).
- **`<link rel="stylesheet">`** — external CSS.
- **`<script>`** — JS, with `defer` or `async` when you don't want blocking (see performance page).
- **`<base>`** — rare; sets default URL for relative links. One per document.

**`<body>`** holds everything visible: headings, paragraphs, images, forms, scripts that inject visible UI. Only one `<body>` per document.

**Parsing order matters.** The browser reads top to bottom. CSS in `<head>` loads before body content paints. Scripts without `defer`/`async` in `<head>` block parsing until they download and run — that's why we usually put non-critical scripts at the end of `<body>` or use `defer`.

**Valid nesting rules** still apply: block elements contain flow content; `<p>` cannot wrap `<div>`; interactive elements like `<a>` shouldn't wrap other interactive elements. Broken nesting doesn't always crash — browsers fix it with implicit tags — but your DOM may not match what you wrote, which breaks CSS selectors and JavaScript queries.

## 4. Real Code — See It Working

A production-ready minimal document — the baseline you'd start every page from:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order #4821 — Acme Shop</title>

  <!-- Critical CSS can go inline; everything else linked -->
  <link rel="stylesheet" href="/styles/main.css">

  <!-- defer: download in parallel, run after HTML is parsed -->
  <script src="/js/app.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  <header>...</header>
  <main id="main">...</main>
  <footer>...</footer>
</body>
</html>
```

What happens without a doctype — don't do this, but know why interviewers ask:

```html
<!-- No doctype — browser may enter quirks mode -->
<html>
<head><title>Broken baseline</title></head>
<body>
  <div style="width: 100px; padding: 10px; border: 1px solid black;">
    <!-- In quirks mode, width calculations can differ from standards mode -->
  </div>
</body>
</html>
```

Charset in the wrong place — a common real bug:

```html
<head>
  <title>Emoji test</title>
  <!-- Parser may already have misread bytes above this line -->
  <meta charset="UTF-8">
</head>
<body>Price: ₹499 🎉</body>
```

Fix: charset should be within the first 1024 bytes, ideally first child of `<head>`.

## 5. The Interview Questions — All of Them, Done Properly

**Q: Explain the basic structure of an HTML document.**

Start with `<!DOCTYPE html>` to declare HTML5 and standards mode. Wrap everything in `<html lang="...">`. Split into `<head>` (metadata, title, links, scripts) and `<body>` (visible content). The head configures how the page loads and how other systems describe it; the body is what users interact with. Mention charset and viewport as non-negotiable head entries for modern pages.

**Q: What does `<!DOCTYPE html>` do?**

It's not an HTML tag — it's an instruction to the browser: parse this as HTML5 in standards mode. One line, no version number, must be first. Missing or wrong doctype → quirks mode → inconsistent layout especially around width, box model, and form styling.

**Q: Why is `lang` on `<html>` important?**

Accessibility: screen readers select pronunciation rules. SEO: search engines know the page language. UX: browsers can offer translation. It's a single attribute that helps machines and humans interpret the content correctly.

**Q: What's the difference between `<head>` and `<body>`?**

Head = setup the browser and external systems need; not painted as main page content. Body = what renders in the viewport. CSS and JS can live in either, but convention puts configuration in head and visible markup in body. Scripts at end of body or with `defer` avoid blocking first paint.

**Q: Can you have multiple `<head>` or `<body>` tags?**

HTML allows only one of each. If you duplicate them, the parser merges or ignores extras in browser-specific ways. Write one clean structure — don't rely on error recovery.

## 6. The Traps — What Goes Wrong

**Omitting viewport meta on mobile.** Page renders at desktop width then shrinks. Users get tiny text. Fix: `width=device-width, initial-scale=1`.

**Charset declared too late.** Mojibake — `Ã©` instead of `é`, broken emoji. Charset meta should be first in `<head>`.

**Putting visible content in `<head>`.** Browsers may still show it somewhere weird, or hide it. Title and meta only in head.

**Blocking scripts in `<head>` without `defer`/`async`.** Page stays blank until JS downloads. Use `defer` for app code that needs the full DOM.

**Relying on implicit `<html>`, `<head>`, `<body>`.** Browsers insert missing tags, but your source becomes ambiguous. Explicit structure is maintainable structure.

**Wrong doctype for the era.** XHTML strict doctypes with HTML5-style markup confuse tooling. Modern web: `<!DOCTYPE html>`.

## 7. Compare With Related Concepts

**Document structure vs semantic structure.** Document structure is the envelope (`html`, `head`, `body`, doctype). Semantic structure is what goes *inside* body (`header`, `nav`, `main`). You need both — envelope first, labeled rooms inside.

**HTML structure vs DOM.** HTML is the source text. DOM is the in-memory tree the browser builds. JavaScript mutates the DOM; `innerHTML` changes can fix or break implied structure. `document.documentElement` is `<html>`; `document.head` and `document.body` map directly.

**Inline styles/scripts in head vs external files.** Inline is fine for tiny critical CSS or one-off pages. External files cache across pages and keep HTML readable. Production apps almost always link CSS and defer JS.

## 8. 🧠 The Memory Hook — What Sticks

Doctype first, language on `<html>`, setup in `<head>`, content in `<body>`. The envelope isn't the letter — but mail doesn't arrive without it.
