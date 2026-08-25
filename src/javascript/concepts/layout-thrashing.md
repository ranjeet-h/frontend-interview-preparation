# Layout Thrashing

## 1. Why This Exists — The Problem First

A drag interaction can feel smooth with ten cards and become visibly jerky with a hundred. One common cause is a loop that changes a card, immediately asks the browser for its new geometry, changes the next card, and asks again. The browser keeps stopping JavaScript to make its layout answer current, so the main thread spends the frame recalculating boxes instead of responding to input and painting the next frame.

The fix is not “never read layout.” Measurement is necessary for grids, tooltips, drag-and-drop, and responsive components. The real problem is interleaving layout-invalidating writes with geometry reads, especially when the same work could have been measured in one phase and applied in another.

## 2. The Analogy — Make It Obvious

Imagine a tailor fitting ten customers. In the bad workflow, the tailor measures Customer A, cuts fabric, measures Customer B, cuts fabric, and keeps switching between the measuring tape and scissors. Every switch requires putting one tool away and setting up the other.

In the better workflow, the tailor measures every customer first and writes the measurements down. Then the tailor cuts every piece. The measurements are the browser’s layout reads, the cuts are style or DOM writes, and the repeated tool setup is the browser flushing style and layout work again and again. The notebook is important: once a measurement is stored in JavaScript, the tailor does not need to ask the customer—or the browser—for it again during that batch.

The analogy has one useful limit: the browser may optimize or skip work, so every read-after-write is not guaranteed to cause a full-document layout. The pattern is dangerous because it creates a dependency that can force the browser to make pending geometry current at exactly the point where the script asks for it.

## 3. How It Actually Works — The Full Explanation

The browser’s rendering pipeline can be simplified to:

```text
JavaScript / DOM mutation
        ↓
style calculation → layout → paint → compositing
```

Style calculation decides which CSS values apply. Layout, also called reflow, calculates the sizes and positions of boxes. Paint creates drawing work for text, backgrounds, borders, and other pixels. Compositing combines painted layers into the final frame. A single mutation may invalidate only some stages, and the browser is free to optimize the exact amount of work.

**The bad sequence**

Suppose a loop does this:

```text
write width of item 0
read item 0's width
write width of item 1
read item 1's width
...
```

The write can mark style and geometry as dirty. The browser normally prefers to postpone recalculation until it needs to render. But when JavaScript asks for current geometry, it cannot return a stale answer. It may synchronously flush pending style and layout work before returning the value. The next write dirties the result again, and the next read may force another flush.

This is called forced synchronous layout. When it repeats in a loop, the pattern is commonly called layout thrashing. The important cost is not that a property has the word “width” in it; it is that a read needs up-to-date geometry after a mutation invalidated it. The amount of work depends on the DOM, CSS, containment, dirty subtree, browser, and device.

**Reads that may require current layout**

These APIs ask for rendered geometry or scroll metrics and can force pending work when layout is dirty:

- `offsetWidth`, `offsetHeight`, `offsetTop`, and `offsetLeft`
- `clientWidth` and `clientHeight`
- `scrollWidth`, `scrollHeight`, `scrollTop`, and `scrollLeft` in cases where current layout is needed
- `getBoundingClientRect()` and `getClientRects()`
- `getComputedStyle()` when the requested value depends on layout or the browser must flush pending style first

A read is not automatically expensive. If layout is already clean, the browser may answer from existing data. The risk is the dependency between a write and the following read, repeated often enough to make the main thread miss frame deadlines.

**Writes that can invalidate layout**

Changing `width`, `height`, `margin`, `padding`, `top`, `left`, `display`, classes, or DOM structure can affect geometry. A write does not necessarily calculate layout immediately; it usually marks work as pending. The next geometry read—or the browser’s later rendering opportunity—may be where that work is performed.

**The better sequence**

The usual repair is to separate the phases:

```text
read item 0, read item 1, read item 2
write item 0, write item 1, write item 2
```

The reads can share one layout calculation, and the browser can process the writes together. If another measurement is needed after those writes, schedule it for a later deliberate phase rather than hiding it inside the mutation loop. Libraries such as `fastdom` formalize read and write queues, but the underlying rule is still the same.

`requestAnimationFrame` is useful for frame-oriented work. It does not magically prevent thrashing: a callback can still read, write, read, and write in the wrong order, and it still runs on the main thread. A good animation callback normally reads the state it needs, then performs its writes, and lets the browser render afterward.

For motion, `transform` and `opacity` are often safer than `top`, `left`, `width`, or `margin` because they commonly avoid changing layout. They can still require paint or layer setup, and a compositor-friendly property is not a promise that the whole page will use the GPU or skip every rendering stage. Verify the real page in DevTools.

Other tools reduce the amount of layout that can be affected. `contain: layout` can isolate layout dependencies when the component’s contract allows it. `content-visibility: auto` can skip work for off-screen content, but it changes measurement and rendering behavior and needs careful testing. These are architectural options, not substitutes for fixing an accidental read/write loop.

## 4. Real Code — See It Working

**The interleaved version**

This example creates its own cards before measuring them:

```js
document.body.innerHTML = `
  <div class="card" style="width: 200px">Card 1</div>
  <div class="card" style="width: 220px">Card 2</div>
`;

const cards = [...document.querySelectorAll(".card")];

for (const card of cards) {
  card.style.width = "240px"; // Invalidates geometry for the next measurement.

  // This read needs current geometry. In a dirty layout, the browser may
  // synchronously flush style and layout before returning the width.
  const width = card.getBoundingClientRect().width;
  card.style.width = `${width + 8}px`;
}
```

The exact cost is browser- and page-dependent, but the dependency is clear: each iteration mutates layout and then immediately asks for geometry.

**Batch reads before writes**

```js
document.body.innerHTML = `
  <div class="card" style="width: 200px">Card 1</div>
  <div class="card" style="width: 220px">Card 2</div>
`;

const cards = [...document.querySelectorAll(".card")];

// Measurement phase: collect all values before changing layout.
const nextWidths = cards.map((card) => {
  const currentWidth = card.getBoundingClientRect().width;
  return currentWidth + 8;
});

// Mutation phase: apply the previously calculated values together.
cards.forEach((card, index) => {
  card.style.width = `${nextWidths[index]}px`;
});
```

This is useful when each new value depends on the old geometry. It does not claim that the writes are free; it prevents the loop from forcing a fresh measurement after every write.

**Schedule visual work with `requestAnimationFrame`**

```js
document.body.innerHTML = '<div class="box" style="width: 80px">Moving box</div>';

const box = document.querySelector(".box");
let x = 0;
let startTime;

function animate(timestamp) {
  startTime ??= timestamp;
  const elapsed = timestamp - startTime;
  x = Math.min(300, elapsed / 3);

  // transform changes visual position without asking layout to reposition
  // surrounding boxes on every frame in the usual case.
  box.style.transform = `translateX(${x}px)`;

  if (x < 300) {
    requestAnimationFrame(animate);
  }
}

requestAnimationFrame(animate);
```

The timestamp makes the animation depend on elapsed time rather than assuming every display refresh is exactly 16.67 ms. A long callback can still miss frames; `requestAnimationFrame` coordinates timing, it does not move work off the main thread.

**Measure after a deliberate frame boundary**

```js
document.body.innerHTML = `
  <style>
    .panel { height: 40px; }
    .panel.expanded { height: 80px; }
  </style>
  <div class="panel">Panel content</div>
`;

const panel = document.querySelector(".panel");

panel.classList.add("expanded");

requestAnimationFrame(() => {
  // The browser has had a chance to process the class change before this
  // deliberate measurement. This is still a synchronous read if layout is
  // dirty, but it is no longer hidden inside a write/read loop.
  const height = panel.getBoundingClientRect().height;
  console.log(`Expanded panel height: ${height}px`);
});
```

Use this when an application genuinely needs the geometry after a visual state change. If the class change can be expressed as a CSS transition, letting CSS handle the transition may be simpler than measuring every frame.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is layout thrashing?**

It is a performance problem caused by repeatedly alternating layout-invalidating writes and geometry reads. The browser may have to synchronously flush style and layout at each read so the script receives current dimensions. Repeating that work in one task can consume the frame budget, delay input, and create visible jank.

**Q: What is forced synchronous layout, and how is it related to reflow?**

Layout or reflow is the browser calculating box geometry. Forced synchronous layout is when JavaScript makes that calculation happen immediately—usually by reading geometry while earlier work is still dirty—instead of letting the browser do it at its normal rendering opportunity. Layout thrashing is the repeated read/write pattern that can cause many such forced calculations.

**Q: Which reads are likely to trigger layout?**

Geometry APIs such as `offsetWidth`, `clientHeight`, `scrollHeight`, and `getBoundingClientRect()` may require current layout. `getComputedStyle()` may also flush style and, depending on the property and document state, layout. They are not unconditionally slow: a clean layout can often be read cheaply. The safe rule is to be suspicious of them after a write, especially inside a loop.

**Q: How do you fix layout thrashing?**

Separate measurement from mutation. Read all required geometry first and store it, then apply all style or DOM writes. For frame-driven work, put the visual update in `requestAnimationFrame`, but keep reads before writes within that callback. If a component must measure after a mutation, make that boundary explicit and profile it rather than assuming it is free.

**Q: Does `requestAnimationFrame` prevent layout thrashing?**

No. It schedules a callback near a rendering opportunity, but the callback still runs on the main thread and can contain the same bad pattern. It helps coordinate visual work and can give the browser a clean boundary between frames; it does not make a write/read/write loop cheap.

**Q: Why are `transform` and `opacity` usually preferred for animation?**

They often change how an already-laid-out element is displayed without changing the geometry of surrounding elements. That can avoid repeated layout and sometimes allow compositing to handle the change efficiently. The result depends on the page and browser: transforms may still need paint or layer setup, and `will-change` can waste memory if applied broadly.

**Q: How would you prove that layout thrashing is the bottleneck?**

Record the interaction in the browser’s Performance panel and inspect the main-thread timeline for repeated layout or forced-layout work. Correlate the events with the JavaScript call site that performed the geometry read. Use the Rendering tools, such as paint flashing or layer borders, only as supporting evidence; they show visual work, not a complete diagnosis. Then compare a batched version on the same device and interaction.

**Q: Is a long task the same thing as layout thrashing?**

No. A long task is a broad main-thread scheduling symptom: continuous work lasting more than 50 ms. Layout thrashing is one possible cause, alongside expensive JavaScript, large DOM updates, parsing, or other rendering work. A short page can thrash without crossing 50 ms, and a long task can contain no layout reads at all.

**Q: Can React or a virtual DOM prevent layout thrashing?**

No. A framework can batch some state updates, but code that reads a DOM ref after a style mutation can still force layout. The browser only sees the final DOM and the order of reads and writes that reach it. Keep measurement and mutation phases separate whether the code is written in React, another framework, or plain JavaScript.

## 6. The Traps — What Goes Wrong

- **“Every layout read is slow.”** A geometry read against a clean layout may be cheap. The expensive case is a read that must flush pending work, especially when the same dependency repeats in a loop. Profile the actual interaction instead of banning all measurement.

- **“Batching means writes never cause layout.”** Writes still invalidate style or geometry, and the browser must eventually process them. Batching reduces repeated flushes and lets the browser do the work at a sensible boundary; it does not remove the work.

- **“`requestAnimationFrame` runs on a rendering thread.”** Its callback normally runs on the main thread. A 40 ms calculation inside rAF still blocks input and misses the frame it was meant to prepare. Use rAF for scheduling visual work, not for offloading computation.

- **“`transform` always skips layout, paint, and the GPU.”** Transform is often compositor-friendly, but layer promotion, paint invalidation, filters, blending, and browser heuristics can change the result. Check the Performance and Layers tools when the optimization matters.

- **“`setTimeout(fn, 16)` is equivalent to rAF.”** A timer is a minimum-delay task and is not tied to a particular repaint. It can run late, run when no frame is due, or be throttled. Choose rAF for frame-by-frame visual updates and a timer for delay-oriented work.

- **“A framework’s batching solves it.”** Framework batching can reduce the number of DOM commits, but it cannot make a synchronous geometry read after a pending mutation return a current value without doing the necessary work. DOM measurement remains a browser-rendering concern.

- **“Use `will-change` everywhere.”** `will-change` can help the browser prepare for a change, but broad or long-lived use can consume memory and create too many layers. Apply it narrowly, for a real upcoming change, and remove it when the interaction ends if appropriate.

## 7. Compare With Related Concepts

| Concept | Key difference | Use it when |
|---|---|---|
| Reflow/layout | One calculation of element geometry | The browser must determine sizes and positions |
| Repaint | Redrawing pixels after visual content changes | Colors, text, backgrounds, or other painted content changes |
| Layout thrashing | Repeated forced layout caused by an alternating dependency | A read/write loop is causing repeated main-thread layout work |
| Long task | More than 50 ms of continuous main-thread work | Diagnosing blocked input or delayed rendering, regardless of cause |
| `requestAnimationFrame` | A frame-oriented scheduling callback | JavaScript must calculate a visual update before a repaint |
| `setTimeout` | A minimum-delay task with no frame guarantee | Delays, retries, debouncing, or non-visual scheduling |
| `transform`/`opacity` | Often compositor-friendly visual properties | Moving or fading an element without changing surrounding layout |
| CSS containment | Limits how far layout or paint dependencies can spread | A component boundary allows isolated rendering work |

## 8. 🧠 The Memory Hook — What Sticks

Do not make the browser measure, cut, measure, cut: take all measurements first, then make all changes. A layout read after a dirtying write is the browser stopping the tailor mid-job to measure again; repeated inside a loop, that interruption becomes layout thrashing.
