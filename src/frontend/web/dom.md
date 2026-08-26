# The DOM

## 1. Why This Exists — The Problem First

You change a button's text in JavaScript but the page doesn't update. You query `document.getElementById('save')` and get `null` because the script ran before the HTML existed. You update the DOM in a loop and the page freezes because each change triggers a reflow.

The DOM is the bridge between your HTML and your code. React, Vue, and jQuery all sit on top of it. If you don't understand what the browser actually builds when it parses HTML — and what happens when you touch it — you'll fight mysterious bugs whether you're writing vanilla JS or debugging a framework.

## 2. The Analogy — Make It Obvious

HTML is the **blueprint**. The DOM is the **live building** the construction crew (browser) actually built from that blueprint.

The blueprint says "put a door here." The live building has a real door you can open (`click`), repaint (`style`), or replace (`innerHTML`). JavaScript is the facilities manager walking the building — moving furniture (nodes), repainting walls (styles), adding rooms (appendChild).

If the blueprint changes after construction (rare — `document.write`), the building gets weird. Usually you modify the **live building**, not re-read the blueprint from disk.

## 3. How It Actually Works — The Full Explanation

When the browser parses HTML, it builds the **DOM tree** — a tree of **nodes**:

- **Document** — root
- **Element nodes** — `<div>`, `<p>`, etc.
- **Text nodes** — text inside elements
- **Comment nodes**, etc.

Each node has properties (`nodeName`, `childNodes`) and methods for traversal and mutation.

**Parsing flow:** Bytes → characters (encoding) → tokens → DOM tree. CSS parsing builds **CSSOM**. Combined → **render tree** → layout → paint. JavaScript can block parsing if synchronous `<script>` without `defer` runs during parse.

**Accessing elements:**
- `document.getElementById('id')` — one element, fast
- `document.querySelector('.class')` — first match, CSS selector syntax
- `document.querySelectorAll('div.item')` — NodeList of all matches
- `element.children`, `parentElement`, `nextElementSibling` — traversal

**Modifying content:**
- `textContent` — text only, escapes HTML (safe for user data display)
- `innerHTML` — parses HTML string (**XSS risk** if string contains user input)
- `insertAdjacentHTML`, `append`, `prepend`, `remove`, `replaceWith`

**Attributes vs properties:** `getAttribute('href')` vs `element.href` — can differ (boolean attributes, reflected properties). Form values use `.value` property.

**Events:** DOM Level — `addEventListener('click', handler)`. Events bubble (child → parent) and capture (parent → child). `event.target` vs `event.currentTarget`.

**Reflow and repaint:** Changing layout-affecting styles (`width`, `height`, `display`) triggers **reflow** (layout) — expensive. Changing `color` often **repaint** only. Batch DOM reads/writes; read layout properties (`offsetHeight`) force layout — "layout thrashing" if interleaved with writes in a loop.

**Shadow DOM:** Web components encapsulate internal DOM — `element.shadowRoot`. Light DOM vs shadow DOM for component architecture.

**Virtual DOM (React):** In-memory representation; diffed and patched to real DOM in batches. Real DOM still what users see — framework optimizes how often and how much you touch it.

## 4. Real Code — See It Working

Safe vs unsafe update:

```javascript
const name = userInput; // could be "<img src=x onerror=alert(1)>"

// Safe — renders as text
el.textContent = name;

// Dangerous — executes injected HTML
el.innerHTML = name;
```

Event delegation — one listener for many items:

```javascript
document.querySelector('#list').addEventListener('click', (event) => {
  const item = event.target.closest('[data-id]');
  if (!item) return;
  console.log('Clicked', item.dataset.id);
});
```

Wait for DOM ready:

```javascript
document.addEventListener('DOMContentLoaded', () => {
  // HTML parsed; defer scripts run here
  initApp();
});
```

Avoid layout thrashing:

```javascript
// Bad — read/write/read/write forces reflow each loop
for (const el of elements) {
  el.style.width = el.offsetWidth + 10 + 'px';
}

// Better — read all, then write all
const widths = elements.map((el) => el.offsetWidth);
elements.forEach((el, i) => {
  el.style.width = widths[i] + 10 + 'px';
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the DOM?**

The Document Object Model — a tree representation of the HTML document that programming languages (JavaScript) can read and modify. The browser builds it during parsing; changes reflect in what users see.

**Q: What is the difference between HTML and the DOM?**

HTML is the source markup. DOM is the live in-memory tree. They start aligned but diverge when JS mutates nodes, or when the browser fixes invalid HTML during parsing.

**Q: innerHTML vs textContent?**

`textContent` sets/gets text, no HTML parsing. `innerHTML` parses HTML — powerful but XSS vector with untrusted input.

**Q: What is event bubbling?**

Events propagate from target element up through ancestors. Use delegation on parent. `stopPropagation()` stops it.

**Q: How does the DOM relate to React?**

React maintains a virtual DOM, computes diffs, updates real DOM efficiently. You usually don't touch DOM directly in React — but React still updates the same DOM under the hood.

## 6. The Traps — What Goes Wrong

**Script before element exists** — null reference. Use `defer`, bottom of body, or `DOMContentLoaded`.

**innerHTML with user data** — XSS.

**Heavy DOM loops** — use DocumentFragment or batch updates.

**Confusing live vs static NodeLists** — `querySelectorAll` is static; `getElementsByClassName` is live and updates when DOM changes.

**Forgetting `closest` for delegation** — `event.target` might be a child inside the clicked button.

## 7. Compare With Related Concepts

**DOM vs BOM (Browser Object Model).** DOM is document tree. BOM is `window`, `location`, `history`, `navigator` — browser chrome around the page.

**DOM vs accessibility tree.** Assistive tech uses a semantic accessibility tree derived from DOM + ARIA — not identical (e.g., `display:none` removed).

**Imperative DOM vs declarative UI.** React: describe UI(state); framework patches DOM. Easier reasoning at scale.

## 8. 🧠 The Memory Hook — What Sticks

HTML is the blueprint; the DOM is the live building JavaScript walks through. Touch the building carefully — `textContent` for text, `innerHTML` only when you trust the string, and batch your changes or the building keeps getting re-measured.
