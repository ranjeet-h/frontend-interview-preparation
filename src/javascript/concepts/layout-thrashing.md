# Layout Thrashing

## Detailed explanation
Layout thrashing happens when JavaScript repeatedly reads layout and writes styles in alternating sequence, forcing browser to recalculate layout many times. It hurts performance and can cause jank.

Fix by batching reads before writes, using `requestAnimationFrame`, avoiding layout-triggering properties where possible, and animating transform/opacity.

## 1. One-line mental model
Layout thrashing = repeated read/write layout loop forcing reflow.

## 2. Problem it solves
Smooth UI requires avoiding unnecessary synchronous layout recalculation.

## 3. Core idea
- Layout reads can force calculation.
- Style writes invalidate layout.
- Alternating them causes repeated reflow.
- Batch reads, then writes.
- Prefer transform/opacity for animation.

## 4. Visual / analogy
Measure-cut-measure-cut one item at time wastes work; measure all, then cut all.

```txt
bad: read -> write -> read -> write
good: read -> read -> write -> write
```

## 5. Minimal example

```js
const width = el.offsetWidth;
el.style.width = `${width + 10}px`;
```

In loop, this can thrash.

## 6. Real-world example

```js
const rects = items.map((item) => item.getBoundingClientRect());
requestAnimationFrame(() => {
  items.forEach((item, i) => item.style.transform = `translateX(${rects[i].left}px)`);
});
```

## 7. Common interview questions
- What is layout thrashing?
- Which reads trigger layout?
- How avoid it?
- Why transform better?
- How DevTools shows layout cost?

## 8. Active recall test
1. What pattern causes thrashing?
2. What is forced reflow?
3. How batch reads/writes?
4. Which animation props safer?
5. Why use RAF?

## 9. Mistakes / traps
- Reading layout inside write loop.
- Animating `top/left/width`.
- Measuring after each DOM mutation.
- Ignoring DevTools performance trace.

## 10. Compare with related concepts
- **Reflow vs repaint:** layout geometry vs pixels.
- **Thrashing vs long task:** repeated layout vs long JS.
- **RAF vs timeout:** paint-aligned vs timer-based.

## 11. Summary from memory
Explain read/write batching to avoid layout thrashing.

## 12. Spaced revision prompts
- 1 day: Define layout thrashing.
- 3 days: List layout reads.
- 7 days: Fix loop.
- 14 days: Explain transform animation benefit.

