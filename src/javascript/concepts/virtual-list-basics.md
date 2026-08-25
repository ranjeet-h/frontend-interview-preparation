# Virtual List Basics

## 1. Why This Exists — The Problem First

Imagine a log viewer with 100,000 rows. A normal render creates every row, every cell, and every event boundary immediately—even though the user can see perhaps 20 rows. The browser must keep that large DOM tree in memory and consider it during style calculation, layout, paint, hit testing, and accessibility work. Scrolling then competes with all of that work for the main thread, so the list can stutter, take a long time to mount, and make input feel delayed.

The real problem is not the JavaScript array containing 100,000 records. An array can be useful and cheap to index. The problem is eagerly creating a DOM representation for records that are nowhere near the viewport.

List virtualization, also called windowing, keeps the scroll experience continuous while rendering only a small window of rows that can be seen, plus an overscan buffer just outside the viewport. The browser receives a small, bounded set of DOM nodes; the user still receives the illusion of one long list.

The one-line mental model is: **a virtual list is a small viewport moving across a large logical list.**

## 2. The Analogy — Make It Obvious

Think of a 100,000-page archive and a reading desk that can hold only 25 pages. The archive catalogue knows the position of every page, so the desk does not need to hold the entire archive. When the reader moves forward, the librarian removes pages that are far behind and brings the next pages to the desk. A few pages are prepared just beyond the reader’s current view so a quick movement does not expose an empty desk.

The mapping is direct:

- the archive is the full data array
- the desk is the scroll viewport
- the catalogue’s positions are the item indices and offsets
- the pages on the desk are mounted DOM rows
- the prepared extra pages are overscan
- the empty-looking space below the desk is represented by a spacer/runway, not by 100,000 empty row elements

The analogy has an important limit: virtualization does not automatically make data loading cheap. The full array may still be in memory, or a virtual list may fetch more data as the user approaches the end. Windowing controls rendered DOM work; it is separate from pagination and from network fetching.

## 3. How It Actually Works — The Full Explanation

For fixed-height rows, a virtualizer can calculate positions with simple arithmetic. Suppose:

```text
itemCount = 100000
rowHeight = 40px
viewportHeight = 600px
overscan = 3 rows
scrollTop = 800px
```

The logical list needs a scrollable runway of `itemCount * rowHeight`, or `4,000,000px`. That height gives the browser a correct scrollbar without creating 100,000 row elements.

The first row intersecting the scroll position is:

```js
const firstVisibleIndex = Math.floor(scrollTop / rowHeight);
```

The number of rows that can fit is approximately:

```js
const visibleCount = Math.ceil(viewportHeight / rowHeight);
```

The rendered window expands around that visible range:

```js
const start = Math.max(0, firstVisibleIndex - overscan);
const end = Math.min(itemCount, firstVisibleIndex + visibleCount + overscan);
```

At `scrollTop = 800`, `firstVisibleIndex` is `20`. With a 600px viewport and three overscan rows, the virtualizer may render indices `17` through `37`—21 rows, not 100,000. The exact boundary convention can vary by library, but the contract is the same: render a bounded slice and clamp it to the data range.

The rows must be placed at their logical location. A common structure is:

```text
scroll viewport (overflow-y: auto)
└── runway (height: itemCount × rowHeight)
    └── rendered window (translated to start × rowHeight)
        ├── row start
        ├── row start + 1
        └── ...
```

The runway establishes the total scrollable height. The rendered window is translated to `start * rowHeight`, so the row for index `start` appears where it would have appeared in the full list. As `scrollTop` changes, the virtualizer calculates a new range and updates the window. A library may reuse existing elements or mount/unmount rows; do not assume a particular recycling strategy unless its API promises one.

Virtualization reduces DOM work, but it does not eliminate row work. A row can still be expensive because of complex rendering, images, synchronous formatting, layout reads, or unnecessary React re-renders. Stable item identity is also essential: use a persistent record ID as the key when the library or framework asks for one, not a random value.

Variable-height rows require a different index lookup. `scrollTop / rowHeight` works only when every row has the same height. A dynamic virtualizer starts with estimates, measures mounted rows, stores those measurements, and uses cumulative offsets—often a prefix-sum structure plus binary search—to find which item contains a scroll position. Updating measurements can change the estimated total height, so the implementation needs scroll anchoring to avoid visible jumps. Dynamic virtualization is possible, but it is more complex and more sensitive to late-loading content.

## 4. Real Code — See It Working

Save the following as `virtual-list.html` and open it directly in a browser. It is a complete local fixture: it creates 10,000 records, displays a fixed-height viewport, renders only the calculated window, shows the current range, and keeps the logical scrollbar height through a runway. There is no framework or network dependency.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fixed-height virtual list</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { margin: 24px; background: #111827; color: #f9fafb; }
      .shell { max-width: 760px; margin: auto; }
      .meta { min-height: 24px; margin: 0 0 12px; color: #cbd5e1; }
      #viewport { height: 480px; overflow-y: auto; border: 1px solid #475569; background: #0f172a; }
      #runway { position: relative; height: 0; }
      #window { position: absolute; inset: 0 0 auto; }
      .row { box-sizing: border-box; height: 40px; padding: 10px 14px; border-bottom: 1px solid #263449; }
      .row:focus { outline: 2px solid #60a5fa; outline-offset: -2px; }
      .row:nth-child(even) { background: #172033; }
      .id { display: inline-block; width: 84px; color: #93c5fd; }
    </style>
  </head>
  <body>
    <main class="shell">
      <h1>Virtual log viewer</h1>
      <p id="meta" class="meta" aria-live="polite"></p>
      <label for="jump-input">Jump to row</label>
      <input id="jump-input" type="number" min="0" max="9999" value="0" />
      <button id="jump-button" type="button">Focus row</button>
      <div id="viewport" aria-label="Virtualized log list" role="list">
        <div id="runway"><div id="window"></div></div>
      </div>
    </main>

    <script>
      const itemCount = 10000;
      const rowHeight = 40;
      const overscan = 4;
      const viewport = document.querySelector("#viewport");
      const runway = document.querySelector("#runway");
      const windowElement = document.querySelector("#window");
      const meta = document.querySelector("#meta");
      const jumpInput = document.querySelector("#jump-input");
      const jumpButton = document.querySelector("#jump-button");
      let activeRow = 0;
      let focusAfterRender = false;
      const rows = Array.from({ length: itemCount }, (_, id) => ({
        id,
        message: `Request ${String(id).padStart(5, "0")} completed`
      }));

      runway.style.height = `${itemCount * rowHeight}px`;

      function renderWindow() {
        const firstVisible = Math.floor(viewport.scrollTop / rowHeight);
        const visibleCount = Math.ceil(viewport.clientHeight / rowHeight);
        const start = Math.max(0, firstVisible - overscan);
        const end = Math.min(itemCount, firstVisible + visibleCount + overscan);

        windowElement.style.transform = `translateY(${start * rowHeight}px)`;
        const focusedRow = document.activeElement?.dataset?.rowId;
        const focusTargetRow = focusedRow === undefined ? activeRow : Number(focusedRow);
        if (focusedRow !== undefined) activeRow = focusTargetRow;
        const retainFocus = focusAfterRender || viewport.contains(document.activeElement);
        const nextFocusRow = Math.min(Math.max(focusTargetRow, start), end - 1);
        if (retainFocus) activeRow = nextFocusRow;
        windowElement.replaceChildren(
          ...rows.slice(start, end).map((row) => {
            const element = document.createElement("div");
            element.className = "row";
            element.setAttribute("role", "listitem");
            element.tabIndex = row.id === (retainFocus ? nextFocusRow : activeRow) ? 0 : -1;
            element.dataset.rowId = row.id;
            element.setAttribute("aria-posinset", row.id + 1);
            element.setAttribute("aria-setsize", itemCount);
            element.innerHTML = `<span class="id">#${row.id}</span>${row.message}`;
            return element;
          })
        );
        meta.textContent = `Rendering rows ${start}–${end - 1} of ${itemCount} (${end - start} DOM rows)`;
        if (retainFocus) {
          windowElement.querySelector(`[data-row-id="${nextFocusRow}"]`)?.focus({ preventScroll: true });
        }
        focusAfterRender = false;
      }

      function syncActiveRow(row) {
        activeRow = Number(row.dataset.rowId);
        windowElement.querySelectorAll(".row").forEach((element) => {
          element.tabIndex = element === row ? 0 : -1;
        });
      }

      viewport.addEventListener("pointerdown", (event) => {
        const row = event.target.closest?.(".row");
        if (!row || !viewport.contains(row)) return;
        syncActiveRow(row);
      });

      viewport.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        activeRow = Math.max(0, Math.min(itemCount - 1, activeRow + direction));
        const rowTop = activeRow * rowHeight;
        const rowBottom = rowTop + rowHeight;
        if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop;
        if (rowBottom > viewport.scrollTop + viewport.clientHeight) {
          viewport.scrollTop = rowBottom - viewport.clientHeight;
        }
        focusAfterRender = true;
        renderWindow();
      });
      jumpButton.addEventListener("click", () => {
        activeRow = Math.max(0, Math.min(itemCount - 1, Number(jumpInput.value) || 0));
        viewport.scrollTop = activeRow * rowHeight;
        focusAfterRender = true;
        renderWindow();
      });
      viewport.addEventListener("scroll", renderWindow, { passive: true });
      new ResizeObserver(renderWindow).observe(viewport);
      renderWindow();
    </script>
  </body>
</html>
```

The important sequence is not the particular HTML API. `runway.style.height` creates the logical scroll range; `firstVisible`, `start`, and `end` select a bounded slice; `transform` positions that slice; and `replaceChildren` updates the mounted rows. The example uses `innerHTML` only with locally generated, trusted text. Production code must use text nodes or escaping when row content can contain untrusted input.

The fixture also demonstrates accessibility behavior. The rendered row for `activeRow` is the only row with `tabIndex = 0`, so Tab enters the list at one predictable place and Arrow Up/Arrow Down move a roving focus target. When that target crosses the rendered window, the handler snapshots the logical focus target before replacement, clamps it to the new window if the old row was removed, rerenders, and focuses the resulting visible row. The jump control proves that a row such as 9,999 can be reached even though it was not initially mounted; `aria-posinset` and `aria-setsize` expose its position in the full logical list.

For a real application, measure the viewport rather than assuming it is always 480px, respond to resize, preserve focus and keyboard behavior, and profile row rendering. A virtual list with a bad row component can still be slow.

## 5. The Interview Questions — All of Them, Done Properly

**What is list virtualization?**

It is a rendering strategy that keeps the logical list large while mounting only the rows inside or near the viewport. The virtualizer calculates a visible range, places those rows at their logical offsets, and updates the range as scrolling changes. It primarily reduces DOM, layout, paint, and component-rendering work; it does not inherently reduce the size of the source data or the cost of fetching it.

**How would you render 100,000 fixed-height rows?**

Create a bounded scroll viewport and a spacer/runway whose height is `itemCount * rowHeight`. Compute `start` and `end` from `scrollTop`, viewport height, and overscan. Render `items.slice(start, end)` and translate the rendered wrapper to `start * rowHeight`. Clamp indices, use stable item identity, and measure the actual viewport dimensions.

**What is overscan, and how do you choose it?**

Overscan is a small buffer of rows rendered before and after the exact visible range. It reduces blank flashes when scrolling quickly because nearby rows are already mounted. More overscan costs more DOM and row work; too little can expose gaps. Start with a small value, then profile on the slowest target device and with realistic row content.

**Virtualization versus pagination?**

Pagination changes the data-navigation contract into discrete pages, which is useful for server-bounded data, shareable URLs, SEO, and reporting workflows. Virtualization preserves continuous scrolling while reducing mounted DOM nodes, but the data may still be in client memory. They solve different problems and can be combined: paginate or fetch chunks from the server, then virtualize the accumulated rows.

**Virtualization versus infinite scroll?**

Infinite scroll decides when to fetch or append more data. Virtualization decides how many of the currently available items are mounted. Infinite scroll without virtualization can eventually accumulate a huge DOM; virtualization without infinite scroll can window a dataset already loaded in memory.

**Fixed-height versus dynamic-height virtualization?**

Fixed height gives O(1) index calculations and straightforward total-height math. Dynamic height needs estimates, measurements, cached offsets, and a strategy for correcting scroll position when content changes. Use fixed-height rows when the product can support them; choose dynamic height when the content contract truly requires it, and test images, fonts, expansion, and late-loaded content.

**How would you test a virtual list?**

Test the pure range calculation at the top, middle, and end of the list; verify clamping for empty and short lists; assert that the runway height is correct; and verify that only the expected window is mounted. In a browser test, resize the viewport, scroll to known offsets, check the first and last rendered IDs, exercise keyboard focus, and ensure a row’s state follows its stable item ID rather than its screen position.

## 6. The Traps — What Goes Wrong

- **Hiding every row is not virtualization.** `display: none`, opacity, or off-screen positioning still leaves the full set of elements in the DOM and can retain memory and framework work. Virtualization changes the number of mounted rows.
- **A transform does not fix an oversized DOM.** `translateY` positions the active window; it does not make 100,000 already-rendered rows cheap.
- **Do not claim transforms always run on the GPU.** Transforms often avoid changing surrounding layout, but paint and compositing behavior depends on the page and browser. Measure the result.
- **Do not use `Math.floor(scrollTop / rowHeight)` for variable-height rows.** That formula is correct only when the fixed-height invariant holds.
- **Do not let the runway and rendered content participate in normal flow together.** Without deliberate positioning, the spacer and rows can add their heights and produce an incorrect scroll range.
- **Do not render too little overscan.** A fast scroll can outrun the update and show blank space. Do not solve that by setting overscan to hundreds of rows without measuring the cost.
- **Do not use unstable or positional identity for stateful rows.** Random keys remount everything; index keys can attach local state or focus to the wrong record after insertion, deletion, filtering, or sorting.
- **Do not forget accessibility.** A small DOM window still needs usable keyboard navigation, focus retention when rows unmount, meaningful roles and labels where appropriate, and an accessible way to reach or search content that is not currently mounted.
- **Do not confuse scroll performance with data performance.** Virtualization cannot make expensive filtering, sorting, network requests, or row formatting disappear. Profile each layer.

## 7. Compare With Related Concepts

| Concept | What it controls | Typical reason to use it |
|---|---|---|
| Normal list rendering | All available items are mounted | Small lists or content where full DOM presence matters |
| Virtualization/windowing | Number of mounted DOM rows | Large continuous lists, grids, logs, and tables |
| Pagination | Which data page is active | Reports, search results, shareable pages, and bounded server queries |
| Infinite scroll | When more data is fetched/appended | Continuous feeds or discovery flows |
| Overscan | Extra rows beyond the visible window | Hide gaps during rapid scrolling |
| Fixed-height virtualization | O(1) offset/index arithmetic | Uniform rows and predictable performance |
| Dynamic-height virtualization | Measured cumulative offsets | Rows whose real heights cannot be fixed |

The useful design rule is: **choose virtualization for DOM scale, pagination for navigation/data boundaries, and infinite scroll for acquisition timing.** None of those choices replaces profiling or accessibility work.

## 8. 🧠 The Memory Hook — What Sticks

Remember the **stage and runway**: the runway is as long as the whole list so the scrollbar knows the truth, but the stage holds only the visible rows plus a small buffer. On every scroll, calculate the window, move the stage to `start * rowHeight`, and render that slice. Virtualization makes a huge list look continuous without asking the browser to keep the whole list on stage.
