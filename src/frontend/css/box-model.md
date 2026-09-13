# CSS Box Model

## 1. Why This Exists — The Problem First

You set a sidebar to `width: 200px`. It overflows the layout. You add `padding: 16px` and suddenly it's 232px wide and breaks the grid. Two developers fight for an hour because one swears `width: 100%` should include padding and the other says it shouldn't.

Welcome to the box model — the single most common source of "CSS is broken" bugs. Every element on a page is a rectangle with layers. If you don't know which layer `width` applies to, you'll keep guessing and losing.

## 2. The Analogy — Make It Obvious

Every HTML element is a **framed picture on a wall**.

- **Content** — the photograph itself
- **Padding** — the mat board between photo and frame (still part of the piece, inside the frame)
- **Border** — the actual frame
- **Margin** — empty wall space between this frame and the next one

When someone says "I want the whole thing 200px wide," you have to ask: **200px photo, or 200px including mat and frame?** That's exactly the `content-box` vs `border-box` question.

## 3. How It Actually Works — The Full Explanation

The CSS box model defines how an element's size and spacing are calculated.

**Layers from inside out:**

1. **Content box** — text, images, children (for block containers)
2. **Padding** — space inside the border, background extends into padding
3. **Border** — line around padding
4. **Margin** — space outside the border, transparent, can collapse with adjacent margins

**`width` and `height` by default apply to the content box only** (`box-sizing: content-box`). Total horizontal space on screen:

```
margin-left + border-left + padding-left + width + padding-right + border-right + margin-right
```

So `width: 200px` + `padding: 20px` each side + `border: 2px` each side = **244px** occupied. That's why `%` widths "overflow" when you add padding.

**`box-sizing: border-box`** changes the rule: `width` and `height` include content + padding + border. Margin is still outside. Set `width: 200px` with `padding: 20px` → content area shrinks to fit inside 200px total. This matches how most people intuit sizing.

**Industry default today:** Many codebases set globally:

```css
*, *::before, *::after {
  box-sizing: border-box;
}
```

Or the older normalize pattern on `html { box-sizing: border-box }` with inheritance. Know both models — third-party CSS might assume `content-box`.

**Margin collapse:** Vertical margins between block elements sometimes **collapse** into one margin (the larger wins), not add. Two siblings with `margin-bottom: 20px` and `margin-top: 30px` → 30px gap, not 50px. Doesn't happen horizontally. Padding and borders block collapse. Flex/grid items don't collapse margins the same way. This surprises people debugging spacing.

**`display` changes the box:** `inline` elements ignore vertical margin and width/height (mostly). `inline-block` respects box model but sits in a line. `block` takes full width by default. Flex/grid children have their own sizing rules on top of the box model.

## 4. Real Code — See It Working

The classic overflow bug:

```css
/* content-box (default) */
.card {
  width: 300px;
  padding: 24px;
  border: 2px solid #333;
  /* Actual width on screen: 300 + 48 + 4 = 352px */
}
```

Fixed with border-box:

```css
.card {
  box-sizing: border-box;
  width: 300px;
  padding: 24px;
  border: 2px solid #333;
  /* Total width: exactly 300px; content area is smaller */
}
```

Two-column layout that breaks without border-box:

```css
.column {
  width: 50%;
  padding: 1rem;
  box-sizing: border-box; /* without this, 50% + padding > 100% */
  float: left;
}
```

Visualizing layers in DevTools: Chrome/Firefox show content/padding/border/margin in the computed panel — use it in interviews when explaining "I'd inspect the box model."

Margin collapse demo:

```html
<p style="margin-bottom: 24px">First</p>
<p style="margin-top: 32px">Second</p>
<!-- Gap is 32px, not 56px -->
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Explain the CSS box model.**

Every element is a box with content, padding, border, and margin layers. Width and height default to the content box. Padding sits inside the border; margin outside. Total space an element occupies includes all layers plus margin. `box-sizing: border-box` makes width/height include padding and border.

**Q: What is `box-sizing: border-box` and why use it?**

It makes declared `width`/`height` the outer size of the border box (content + padding + border). Easier mental math for layouts — especially percentages and grids. Most design systems enable it globally.

**Q: What is margin collapse?**

Adjacent vertical margins of block-level boxes can merge into a single margin equal to the largest individual margin. Horizontal margins don't collapse. Understanding this prevents "mystery gaps" when debugging spacing.

**Q: Does padding affect element width?**

With `content-box`, yes — padding adds to total width. With `border-box`, padding eats into the content area inside the fixed width. Border adds similarly in content-box mode.

**Q: Difference between padding and margin?**

Padding is inside the border, affects background, clickable area of the element. Margin is outside, creates space between elements, doesn't get background color from the element. Margin can be negative (pull elements closer); padding cannot.

## 6. The Traps — What Goes Wrong

**`width: 100%` + padding without border-box.** Horizontal scrollbar guaranteed. Fix: border-box or use `max-width` with calc (worse).

**Assuming margins always add.** Collapse makes spacing smaller than expected. Fix: padding on parent, `display: flow-root`, or flex/grid.

**Forgetting borders in mental math.** `1px` border each side is easy to miss in content-box layouts.

**Applying width to inline elements.** `span { width: 100px }` does nothing until you change display.

**Universal `border-box` breaking third-party widgets** that expect content-box. Rare but possible — scope your reset.

## 7. Compare With Related Concepts

**Box model vs flex/grid sizing.** Box model is the element's own layers. Flex `flex-grow`/`flex-basis` and grid `fr` distribute space in a container — they sit on top of box model math.

**`outline` vs `border`.** Outline doesn't affect layout — drawn outside border, no box model space. Good for focus rings.

**`box-shadow`.** Also doesn't affect layout (unless you count paint). Multiple shadows can look like borders without changing size.

**Logical properties (`padding-inline`, `margin-block`).** Same box model, but relative to writing direction (LTR/RTL) instead of physical left/right. Prefer in internationalized apps.

## 8. 🧠 The Memory Hook — What Sticks

Picture a framed photo: content, mat, frame, wall space. Default CSS measures only the photo; `border-box` measures the whole framed piece. When widths "don't add up," check which layer `width` is talking about.
