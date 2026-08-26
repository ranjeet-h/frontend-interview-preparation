# HTML5 Features

## 1. Why This Exists — The Problem First

Before HTML5, the web was held together with plugins, table layouts, and `<div>` soup. You wanted video? Flash. You wanted a date picker? Build it in JavaScript or accept a plain text field. You wanted the browser to understand that a block was navigation versus main content? Good luck — everything was a `<div>` with an `id` that only your team understood.

That worked until mobile exploded, accessibility became non-negotiable, and search engines started caring about structure, not just keywords. HTML5 gave the browser native building blocks for structure, forms, media, and client-side storage so you stop fighting the platform and start using it.

## 2. The Analogy — Make It Obvious

Think of an old office that ran on sticky notes and personal spreadsheets. Everyone had their own system. New hires had no idea where anything lived. Auditors couldn't follow the paper trail.

HTML5 is like renovating that office: labeled rooms (semantic elements), standard forms on every desk (new input types), a built-in projector in the conference room (video/audio tags), and a company filing cabinet with clear drawers (web storage). You still do the work — but the building finally matches what you're trying to do.

| HTML5 piece | Office analogy | What it actually does |
|---|---|---|
| `<header>`, `<nav>`, `<main>` | Labeled rooms | Browser and assistive tech know what each region is |
| `type="email"`, `type="date"` | Standard forms | Built-in validation and mobile-friendly keyboards |
| `<video>`, `<audio>` | Built-in projector | Media without Flash or a custom player |
| `<canvas>` | Whiteboard for drawing | Pixel graphics via JavaScript |
| `localStorage` | Filing cabinet | Persist data in the browser without round-trips to the server |
| Web Workers | Assistant in another room | Heavy work off the main thread so the UI stays responsive |

## 3. How It Actually Works — The Full Explanation

HTML5 isn't one feature — it's a bundle of specs that landed around the same era. What matters in interviews is knowing which problems each piece solves and when you'd reach for it.

**Semantic elements** (`<header>`, `<footer>`, `<nav>`, `<section>`, `<article>`, `<aside>`, `<main>`) describe the *role* of content, not just its box on the page. A screen reader can jump straight to `<nav>`. Google gets a clearer outline of your page. Your teammate opening the file six months later sees structure without reading every class name.

**New form controls** (`email`, `url`, `tel`, `number`, `range`, `color`, `date`, `time`, `datetime-local`, `search`) tell the browser what kind of data you expect. On mobile, that often means the right keyboard. In the browser, you get basic validation for free (`required`, `pattern`, `min`, `max`). You still validate on the server — never trust the client alone — but the UX and accessibility win is real.

**Native media** (`<video>`, `<audio>`) embed playback without plugins. You provide `<source>` elements with different formats; the browser picks the first one it supports. Attributes like `controls`, `poster`, `preload`, `muted`, and `playsinline` control behavior. Autoplay is often blocked unless the video is muted — browsers learned that users hate surprise sound.

**Canvas** is a bitmap drawing surface. You get a 2D (or WebGL) context and draw frames with JavaScript. Games, charts, image editors, signature pads — that's canvas territory. It's not for document text; it's for pixels you control.

**SVG** stays in the DOM as markup. Scale it to any size without blurring. Icons and illustrations that need to stay sharp at every breakpoint — SVG. Canvas redraws when you resize; SVG just scales.

**Geolocation** (`navigator.geolocation`) asks the user for permission, then gives you coordinates. Delivery apps, store finders, "show weather near me." Privacy-sensitive — always explain why you need it.

**Web Storage** (`localStorage`, `sessionStorage`) holds string key-value pairs in the browser. Same origin only. Much bigger than cookies. Not sent on every HTTP request. We'll compare storage options properly on the browser storage page — the HTML5 story is "the browser can remember things locally without cookies."

**Web Workers** run JavaScript on a background thread. No DOM access from the worker — you pass messages back and forth. Parsing a huge JSON file, crunching image data, running a simulation — if it would freeze the UI on the main thread, a worker is worth considering.

**Other HTML5 pieces** you'll hear in passing: `<details>`/`<summary>` for native disclosure widgets, `contenteditable` for in-place editing, `data-*` attributes for custom metadata, the History API for SPA-style navigation. Know they exist; go deep on the ones your page actually uses.

## 4. Real Code — See It Working

A small page that uses several HTML5 pieces together — the way you'd actually structure something:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Event signup</title>
</head>
<body>
  <header>
    <h1>Frontend Meetup</h1>
    <nav aria-label="Main">
      <a href="#signup">Sign up</a>
      <a href="#replay">Watch replay</a>
    </nav>
  </header>

  <main>
    <article>
      <h2>March talk: How browsers paint pixels</h2>

      <!-- Native video — browser picks supported format -->
      <video controls width="640" poster="/posters/march-talk.jpg" preload="metadata">
        <source src="/talk.webm" type="video/webm">
        <source src="/talk.mp4" type="video/mp4">
        <p>Your browser does not support embedded video. <a href="/talk.mp4">Download instead</a>.</p>
      </video>
    </article>

    <section id="signup">
      <h2>Reserve a seat</h2>
      <form>
        <!-- Browser validates shape; server must still validate -->
        <label>
          Email
          <input type="email" name="email" required autocomplete="email">
        </label>
        <label>
          Date you can attend
          <input type="date" name="date" required>
        </label>
        <button type="submit">Register</button>
      </form>
    </section>
  </main>

  <footer>
    <p>© 2026 Frontend Meetup</p>
  </footer>
</body>
</html>
```

Saving draft form data without a server round-trip:

```javascript
const KEY = 'meetup-signup-draft';

const emailInput = document.querySelector('input[name="email"]');
const saved = localStorage.getItem(KEY);

if (saved) {
  emailInput.value = saved;
}

emailInput.addEventListener('input', () => {
  // localStorage only stores strings — objects need JSON.stringify
  localStorage.setItem(KEY, emailInput.value);
});
```

Offloading heavy work so the page stays clickable:

```javascript
// main.js
const worker = new Worker('/hash-worker.js');

document.getElementById('hash-btn').addEventListener('click', () => {
  worker.postMessage({ text: document.getElementById('input').value });
});

worker.onmessage = (event) => {
  document.getElementById('result').textContent = event.data.hash;
};

// hash-worker.js — no document, no window, no DOM
self.onmessage = (event) => {
  const hash = slowHashFunction(event.data.text); // CPU-heavy
  self.postMessage({ hash });
};
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are the most important HTML5 features for a frontend developer?**

The ones you touch constantly: semantic elements for structure and accessibility, modern form input types for better UX and basic client-side validation, native `<video>` and `<audio>` for media, and web storage (`localStorage` / `sessionStorage`) for client-side persistence. Canvas and Web Workers matter when you have graphics or CPU-heavy work that would block the main thread. Geolocation when location is core to the product. You don't need to recite every HTML5 API — group them by problem: structure, forms, media, storage, background compute.

**Q: How is HTML5 different from HTML4?**

HTML4 treated most things as generic blocks (`<div>`, `<span>`) and leaned on plugins for media. HTML5 adds meaningful elements, richer forms, native audio/video, canvas, APIs like storage and workers, and stricter parsing rules (browsers handle malformed markup more consistently). The doctype simplified to `<!DOCTYPE html>`. Practically: you can build modern apps with less JavaScript glue for things the browser should have done natively years ago.

**Q: When would you use canvas instead of SVG?**

Canvas when you're drawing lots of pixels that change every frame — games, live charts, photo filters. You repaint the bitmap. SVG when shapes are declarative, scalable, and part of the DOM — icons, logos, diagrams you might style with CSS or hit-test with events. Canvas is a painting; SVG is a blueprint the browser can zoom forever.

**Q: What is the difference between localStorage and cookies?**

Both store data in the browser, but cookies ride along on every HTTP request to your domain (small ~4KB limit, server-visible). `localStorage` stays on the client, holds more data (~5–10MB depending on browser), and doesn't automatically hit the server. Use cookies when the server needs the value on each request (session IDs with `HttpOnly`). Use `localStorage` for client-only preferences — with the understanding it's not secure for secrets.

**Q: Can Web Workers access the DOM?**

No. Workers run on a separate thread with no `document` or `window`. They communicate with the main thread via `postMessage`. That's intentional — shared DOM access across threads would be a synchronization nightmare. Main thread owns the UI; workers own heavy computation.

## 6. The Traps — What Goes Wrong

**Treating HTML5 input validation as security.** `type="email"` and `required` help users catch mistakes. Attackers send requests directly to your API. Always validate and sanitize on the server.

**Autoplaying video with sound.** Most browsers block it. If you need autoplay, mute the video and often add `playsinline` on iOS. Better: let the user press play.

**Stuffing everything into `<div>` still.** HTML5 semantics only help if you use them. A `<div class="nav">` is not the same as `<nav>` for screen readers or SEO.

**Storing tokens in localStorage.** Convenient, but any XSS on your site can read it. Session cookies with `HttpOnly` and `Secure` are the usual choice for auth tokens — that's a security topic, but interviewers connect it to "HTML5 storage."

**Assuming Web Workers make everything faster.** Starting a worker and shipping data back and forth has overhead. Small tasks are slower on a worker. Use them when main-thread blocking is the real problem.

**Forgetting fallback content.** `<video>` and `<canvas>` should have text or links for users whose browsers or assistive setups don't get what you intended.

## 7. Compare With Related Concepts

**HTML5 semantic elements vs ARIA roles.** Semantics first: use `<button>`, `<nav>`, `<main>`. ARIA (`role="navigation"`) fills gaps when you're stuck with a non-semantic element or building custom widgets. Rule: don't slap `role="button"` on a `<div>` when a real `<button>` works.

**HTML5 form types vs JavaScript validation libraries.** Built-in types handle common cases cheaply. Libraries (Zod on the server, React Hook Form on the client) handle complex rules, async checks, and cross-field logic. Use both layers — browser for UX, your code for correctness.

**Canvas vs CSS animations.** CSS is cheaper for moving elements you already have in the DOM. Canvas when you're drawing arbitrary pixels every frame. If `transform` and `opacity` can do the job, prefer CSS.

**Web Workers vs `requestIdleCallback` / chunking on the main thread.** Workers for sustained CPU work. Chunking with `setTimeout(0)` or `requestIdleCallback` for lighter jobs where thread overhead isn't worth it.

## 8. 🧠 The Memory Hook — What Sticks

HTML5 is the browser growing up: labeled rooms instead of div soup, native forms and media instead of plugins, a filing cabinet and a back office (storage and workers) so the main thread can stay responsive. Reach for the native feature that matches the problem before you bolt on a library.
