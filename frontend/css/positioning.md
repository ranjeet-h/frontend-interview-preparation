# CSS Positioning

## 1. Why This Exists — The Problem First

You need a dropdown under a button. You use `position: absolute` and it flies to the corner of the page. You need a sticky header. You use `fixed` and it covers content underneath with no spacing. You stack modals and z-index wars begin — `99999` vs `999999`.

Positioning takes elements out of normal document flow — or shifts them within it. Get the containing block or stacking context wrong and layout looks like random placement. Every senior frontend dev has been burned by "position absolute" without understanding **what it's absolute to**.

## 2. The Analogy — Make It Obvious

Normal document flow is people standing in a **queue** — everyone takes their spot in order, shoulder to shoulder.

- **`static`** — you're in the queue, can't step sideways (`top`/`left` do nothing).
- **`relative`** — you stay in your queue spot but **lean** left or right without leaving the line. You still occupy your original space in the queue.
- **`absolute`** — you leave the queue and stick yourself to a **wall** — the nearest wall that's been designated (a positioned ancestor). If no wall, you stick to the building (viewport or initial containing block).
- **`fixed`** — you're taped to the **window glass** — scrolling the page doesn't move you.
- **`sticky`** — you're in the queue until you hit a line on the floor (`top: 0`), then you're taped to the glass until your section scrolls away.

The wall matters. That's `position: relative` on a parent.

## 3. How It Actually Works — The Full Explanation

**`position: static` (default)**  
Normal flow. `top`, `right`, `bottom`, `left`, `z-index` have no effect.

**`position: relative`**  
Element stays in flow (original space reserved). Offset with `top`/`left`/etc. relative to where it *would* have been. Creates a **positioning context** for absolute descendants. Also can create a stacking context with `z-index` other than `auto`.

**`position: absolute`**  
Removed from flow — no space reserved. Positioned relative to **nearest ancestor** with `position` not `static` (or `fixed`/`sticky` in some cases). If none, initial containing block (often `<html>`). Use for dropdowns, tooltips, badges on avatars — with a `relative` parent.

**`position: fixed`**  
Removed from flow. Positioned relative to **viewport** (or browser UI in some mobile cases). Stays put on scroll. Headers, FABs, modals. `transform`/`filter` on ancestor can make fixed behave like absolute (containing block changes) — common bug.

**`position: sticky`**  
Hybrid. Treated as `relative` until scroll threshold (`top`, `bottom`, `left`, or `right` set). Then "sticks" like fixed within its **scroll container**. Parent `overflow: hidden` often breaks sticky. Must have room to stick within parent bounds.

**`z-index`** — only works on positioned elements (`relative`, `absolute`, `fixed`, `sticky`) or flex/grid children. Higher stacks on top within the same **stacking context**. New stacking context from `opacity < 1`, `transform`, `filter`, `isolation: isolate`, etc. — children can't escape parent's layer to beat outside siblings.

**Containing block** — defines percentage `top`/`left` and absolute positioning reference. Know what establishes it (positioned ancestor, transform on ancestor changes fixed behavior).

## 4. Real Code — See It Working

Dropdown anchored to button:

```html
<div class="menu-wrapper">
  <button type="button">Options</button>
  <ul class="menu">
    <li>Edit</li>
    <li>Delete</li>
  </ul>
</div>
```

```css
.menu-wrapper {
  position: relative; /* the wall */
  display: inline-block;
}

.menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  min-width: 160px;
  z-index: 10;
}
```

Sticky section header:

```css
.section-heading {
  position: sticky;
  top: 0;
  background: white;
  z-index: 1;
  padding: 0.5rem 0;
}
```

Fixed header with content offset:

```css
.site-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 64px;
  z-index: 100;
}

main {
  padding-top: 64px; /* reserve space — fixed doesn't push content */
}
```

Badge on avatar:

```css
.avatar-wrap {
  position: relative;
  width: 48px;
  height: 48px;
}

.unread-badge {
  position: absolute;
  top: -4px;
  right: -4px;
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Explain the CSS position values.**

`static` — normal flow, no offsets. `relative` — in flow, offset from natural position, positioning context for children. `absolute` — out of flow, relative to positioned ancestor. `fixed` — out of flow, relative to viewport. `sticky` — relative until scroll threshold, then fixed within scroll container.

**Q: What does absolute position relative to?**

Nearest ancestor with `position` not `static`. Not necessarily the direct parent — walks up until found. If none, initial containing block.

**Q: Why doesn't `z-index: 9999` always win?**

Stacking contexts. A high z-index inside a low context can't beat elements in a sibling context with higher parent stacking. Fix structure, not bigger numbers.

**Q: When use sticky vs fixed?**

Sticky stays within parent section — table headers, section titles. Fixed for global UI (site nav, chat widget) relative to viewport. Sticky needs `top`/`bottom` set and appropriate overflow on ancestors.

**Q: Does `position: absolute` remove the element from flow?**

Yes. Following siblings move up as if it weren't there. Parent may collapse if it has no other in-flow content — parent needs height strategy or explicit dimensions.

## 6. The Traps — What Goes Wrong

**Absolute without positioned parent** — element positions against viewport or html, not the button you thought.

**Fixed broken by `transform: translateZ(0)` on parent** — creates containing block; "fixed" scrolls with parent.

**Sticky not sticking** — missing `top`, ancestor with `overflow: hidden`, or insufficient parent height.

**Forgetting to reserve space for fixed headers** — content hidden underneath.

**z-index arms race** — redesign stacking with isolated layers (`isolation: isolate` on modal root).

**Absolute for entire page layout** — use flex/grid instead; absolute for overlays and micro-placement.

## 7. Compare With Related Concepts

**Position vs flex/grid centering.** Center modal overlay with flex on parent — often simpler than absolute + transform centering. Absolute still right for dropdowns relative to triggers.

**`inset: 0` shorthand** — sets `top/right/bottom/left: 0` for full-bleed overlays.

**Portal (React) for modals** — render at `document.body` to escape overflow/transform traps while using fixed positioning.

**Logical properties** — `inset-inline-start` instead of `left` for RTL-aware positioning.

## 8. 🧠 The Memory Hook — What Sticks

Absolute asks "relative to which wall?" — answer is the nearest positioned ancestor, not the button you clicked. Fixed is taped to the viewport until a `transform` on a parent lies to you. Sticky is relative until the scroll line, then glue.
