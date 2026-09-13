# Pseudo-classes and Pseudo-elements

## 1. Why This Exists — The Problem First

You want a button to look different when hovered. A form field to show an error state when invalid. The first paragraph of an article to have a drop cap. The last item in a list to have no bottom border.

You could add classes with JavaScript on every mouseenter, or duplicate markup for decorative flourishes. That's fragile and noisy. Pseudo-classes and pseudo-elements let CSS react to **state** and style **parts** of an element without extra HTML or JS — if you know which colon to use and what each one actually selects.

## 2. The Analogy — Make It Obvious

Think of an element as a **person in a room**.

**Pseudo-classes** describe the person's **current situation** — `:hover` (someone's pointing at them), `:focus` (they're being talked to), `:nth-child(3)` (they're third in line). One colon `:` — a state or position filter on real elements.

**Pseudo-elements** are **ghost copies** of parts of that person — `::before` (a speech bubble that isn't really them), `::first-line` (only the first sentence highlighted). Double colon `::` — styling a slice of the element or generated content that isn't a separate DOM node.

States vs phantom parts. That's the split.

## 3. How It Actually Works — The Full Explanation

**Pseudo-classes** — select elements in a particular state or position. Syntax: `selector:pseudo-class`.

Common **user action** states:
- `:hover` — pointer over element
- `:focus` — element has keyboard/focus (critical for accessibility)
- `:focus-visible` — focus ring only when keyboard-like focus (not every mouse click)
- `:active` — being activated (mouse down)

**Form states:**
- `:checked`, `:disabled`, `:invalid`, `:valid`, `:required`, `:placeholder-shown`

**Structural:**
- `:first-child`, `:last-child`, `:nth-child(n)`, `:nth-of-type(n)`, `:only-child`
- `:not(.excluded)` — exclusion

**Other useful:**
- `:is(h1, h2, h3)` — group selectors, specificity of most specific arg
- `:where(...)` — same but zero specificity
- `:has(.child)` — parent selector ("card that contains an image")

**Pseudo-elements** — style a specific part or generate content. Syntax: `selector::pseudo-element`.

- `::before`, `::after` — generate a box as first/last child; need `content` property (even `content: ''` for decorative boxes)
- `::first-line`, `::first-letter` — typographic hooks
- `::placeholder` — style input placeholder text
- `::selection` — highlighted text
- `::marker` — list bullet/number styling

**Single vs double colon:** CSS2 used `:before`/`:after` with one colon. CSS3 added `::` to distinguish pseudo-elements from pseudo-classes. Browsers accept both for legacy pseudo-elements; use `::` in new code.

**`::before`/`::after` gotchas:**
- Inline elements need `display: inline-block` or `block` for dimensions
- Generated content is not in the DOM — screen readers may ignore decorative `content`, but don't put essential text only in `::before`
- `content: attr(data-label)` can pull from attributes

**Specificity:** Pseudo-classes count like classes (0,0,1,0). Pseudo-elements count like elements (0,0,0,1).

## 4. Real Code — See It Working

Accessible focus without ugly mouse clicks:

```css
.button {
  outline: none;
}

.button:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
```

Striped table rows without classes on every `<tr>`:

```css
tbody tr:nth-child(even) {
  background: #f8fafc;
}
```

Validation styling without JS:

```css
input:user-invalid {
  border-color: #dc2626;
}

input:user-valid {
  border-color: #16a34a;
}
```

Decorative arrow with `::after` (not essential content):

```css
.external-link::after {
  content: " ↗";
  font-size: 0.85em;
}
```

Required field indicator:

```css
label:has(+ input[required])::after {
  content: " *";
  color: #dc2626;
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between a pseudo-class and a pseudo-element?**

Pseudo-class selects an element in a state (`:hover`, `:nth-child(2)`). Pseudo-element styles or creates a part of an element (`::before`, `::first-line`). One colon vs two (for modern pseudo-elements).

**Q: Give examples of each.**

Pseudo-class: `:hover`, `:focus`, `:disabled`, `:nth-child(3)`. Pseudo-element: `::before`, `::after`, `::placeholder`, `::selection`.

**Q: What is `:nth-child` vs `:nth-of-type`?**

`:nth-child(2)` — element is the 2nd child of its parent among all siblings. `:nth-of-type(2)` — 2nd among siblings **of the same tag name**. Difference matters when mixed elements (`div`, `p`, `div`).

**Q: Can pseudo-elements contain text screen readers announce?**

Decorative `content` in `::before`/`::after` is inconsistently exposed. Don't hide critical info there only. Use real DOM text for accessibility.

**Q: What is `:has()`?**

Parent selector — matches an element if it contains a descendant matching the argument. `form:has(:invalid)` styles the form when any field is invalid. Powerful but check browser support for your targets.

## 6. The Traps — What Goes Wrong

**`:hover` only on desktop.** Touch devices don't hover. Don't hide essential UI behind hover-only menus without tap alternative.

**Removing `:focus` outline without replacement.** Keyboard users lost. Use `:focus-visible` with visible ring.

**`:nth-child` off-by-one** when DOM has unexpected nodes (text nodes in old IE; comment nodes rare). Test with real markup.

**Essential icons only in `::before`.** AT may skip them.

**`::before` on inline `<span>` without display change** — sizing doesn't work as expected.

**Overusing `:not()` chains** — specificity and readability suffer.

## 7. Compare With Related Concepts

**Pseudo-classes vs real classes toggled by JS.** Classes (`.is-open`) give explicit state in DOM — good for complex state machines. Pseudo-classes for native states (`:checked`, `:hover`) without JS.

**Pseudo-elements vs extra `<span>` in HTML.** Pseudo-elements reduce DOM noise for pure decoration. Real elements when you need events, ARIA, or reliable screen reader access.

**`:focus` vs `:focus-within`.** `:focus-within` matches when the element or any descendant has focus — style a card when input inside is focused.

## 8. 🧠 The Memory Hook — What Sticks

One colon `:` = what's happening to the element (state/position). Two colons `::` = a phantom slice of the element (before, after, first line). States react; phantoms decorate.
