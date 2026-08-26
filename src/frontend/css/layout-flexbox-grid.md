# Flexbox and Grid

## 1. Why This Exists — The Problem First

Centering something used to be a meme — `position: absolute`, `top: 50%`, `transform: translate`, pray. Building responsive columns meant float hacks and clearfix soup. Equal-height cards in a row? Table display or JavaScript measuring heights.

Flexbox and Grid ended the layout dark ages. But teams still pick the wrong one — Grid for a single row of buttons, Flexbox for a full page with rows and columns — and wonder why the CSS feels like fighting the tool.

## 2. The Analogy — Make It Obvious

**Flexbox** is organizing books on a **single shelf** — one row or one column. You decide how books line up along that shelf (left, center, spaced out) and how tall they stretch.

**Grid** is **shelving units in a library** — rows and columns at once. You define the aisles and slots; items slot into cells. Some items can span multiple shelves.

Need to line up items in a toolbar? Shelf → Flexbox. Need a page with header, sidebar, main, footer in a template? Library aisles → Grid.

## 3. How It Actually Works — The Full Explanation

**Flexbox — one-dimensional layout**

Apply to a **container**: `display: flex` (or `inline-flex`).

Main axis — direction items flow:
- `flex-direction: row` (default) or `column`

Cross axis — perpendicular to main.

Key **container** properties:
- `justify-content` — alignment along main axis (`flex-start`, `center`, `space-between`, `space-around`)
- `align-items` — alignment on cross axis for all items (`stretch`, `center`, `flex-start`)
- `flex-wrap` — wrap to next line or squeeze one line
- `gap` — space between items

Key **item** properties:
- `flex-grow` — how much extra space to absorb (0 = don't grow)
- `flex-shrink` — shrink when cramped
- `flex-basis` — starting size before grow/shrink
- Shorthand: `flex: 1` → `flex: 1 1 0%` (grow, shrink, basis)
- `align-self` — override cross-axis alignment for one item
- `order` — visual reorder (doesn't change tab order — accessibility trap)

Flexbox is ideal for: nav bars, card footers with buttons, vertical centering, distributing space in a component, holy-grail component internals.

**Grid — two-dimensional layout**

Container: `display: grid`.

Define tracks:
```css
grid-template-columns: 250px 1fr 1fr;
grid-template-rows: auto 1fr auto;
gap: 1rem;
```

Place items:
- `grid-column: 1 / 3` — span columns
- `grid-area: header` with named areas:

```css
grid-template-areas:
  "header header"
  "sidebar main"
  "footer footer";
```

`fr` unit — fraction of free space. `minmax(200px, 1fr)` — responsive columns that don't shrink below 200px.

`auto-fill` / `auto-fit` with `repeat()` — responsive card grids without media queries:

```css
grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
```

Grid is ideal for: page layouts, dashboards, image galleries, anything needing row AND column alignment simultaneously.

**Rule of thumb:** Flexbox for components (1D). Grid for layouts (2D). They combine — a grid cell can be a flex container.

**Both** replace float-based layout for new work. Floats remain valid for text wrapping around images.

## 4. Real Code — See It Working

Navbar with Flexbox:

```css
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0 1.5rem;
}

.nav-links {
  display: flex;
  gap: 1.5rem;
  list-style: none;
}
```

Classic centering:

```css
.modal-overlay {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}
```

Page layout with Grid:

```css
.app {
  display: grid;
  min-height: 100vh;
  grid-template-rows: auto 1fr auto;
  grid-template-columns: 240px 1fr;
  grid-template-areas:
    "header header"
    "sidebar main"
    "footer footer";
}

header { grid-area: header; }
aside  { grid-area: sidebar; }
main   { grid-area: main; }
footer { grid-area: footer; }

@media (max-width: 768px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-areas:
      "header"
      "main"
      "footer";
  }
  aside { display: none; } /* or off-canvas drawer */
}
```

Responsive card grid without breakpoints:

```css
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.5rem;
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between Flexbox and Grid?**

Flexbox lays out along one axis at a time — a row OR a column. Grid lays out in two dimensions — rows AND columns together. Flexbox for component alignment; Grid for page-level or complex 2D templates.

**Q: When would you use `justify-content` vs `align-items`?**

In default `flex-direction: row`, `justify-content` aligns horizontally (main axis), `align-items` vertically (cross axis). They swap when `flex-direction: column`. Always identify the main axis first.

**Q: What does `flex: 1` do?**

Shorthand for `flex: 1 1 0%` — item can grow and shrink, basis 0, so siblings share available space equally (simplified). Common for sidebars and filling remaining space.

**Q: Explain `1fr` in Grid.**

One fraction of leftover space after fixed tracks are laid out. `1fr 2fr` splits free space 1:2.

**Q: Can you use Flexbox and Grid together?**

Yes — typical pattern: Grid for page shell, Flexbox inside each region for internal alignment.

## 6. The Traps — What Goes Wrong

**Using `order` for visual reorder without thinking keyboard/screen reader order.** DOM order still drives focus. Don't put "Submit" before "Cancel" in DOM and flip with `order`.

**Flex children default `min-width: auto`** — prevents shrinking below content size, causes overflow. Fix: `min-width: 0` on flex child that should truncate.

**Grid without explicit rows** — content defines row height; fine until you need sticky footer. Use `min-height: 100vh` and `1fr` row.

**Overusing Grid for a single row** — works, but Flexbox is simpler. Don't over-engineer.

**Forgetting `gap` replaced margin hacks** — `gap` on flex/grid is clean spacing between items.

## 7. Compare With Related Concepts

**Flexbox/Grid vs floats.** Floats were for text wrap and legacy columns. No `clearfix`, no equal-height hacks with modern layout. Floats still valid for `float: left` on images in articles.

**Grid vs CSS frameworks (Bootstrap grid).** Frameworks compile to flex/grid under the hood. Native CSS removes dependency and class soup.

**Subgrid.** `grid-template-columns: subgrid` — child grid inherits parent tracks. Useful for aligned rows across nested components. Growing support — know it exists for senior interviews.

## 8. 🧠 The Memory Hook — What Sticks

One direction → Flexbox (the shelf). Two directions → Grid (the library). Component guts flex; page skeleton grids.
