# Virtual List Basics

## Detailed explanation
Virtual list renders only visible rows plus small buffer instead of thousands of DOM nodes. It keeps large lists fast by reducing DOM size and layout/paint work.

Frontend interviews use this for 100k rows, tables, infinite feeds, and dashboard performance.

## 1. One-line mental model
Virtual list shows small window of huge list.

## 2. Problem it solves
Rendering thousands of DOM nodes makes UI slow.

## 3. Core idea
- Know row height or measure rows.
- Calculate visible start/end indices.
- Render only visible slice.
- Use spacer height for scroll area.
- Recycle/update rows as scroll changes.

## 4. Visual / analogy
Window over long spreadsheet.

```txt
100000 rows total
only rows 200-240 rendered
```

## 5. Minimal example

```js
const start = Math.floor(scrollTop / rowHeight);
const end = start + visibleCount;
const visible = rows.slice(start, end);
```

## 6. Real-world example

```js
const offsetY = start * rowHeight;
```

Render visible rows in translated container.

## 7. Common interview questions

#### What is virtualization?
- **The Engine Mechanism (Why it behaves this way):** List virtualization (or windowing) is an advanced rendering optimization designed to bypass DOM limitations. In standard list rendering, adding 10,000 items creates 10,000 DOM elements. When the browser recalculates layout (Reflow) or repaints (Paint), the rendering engine must traverse the entire DOM tree, causing frame budget deficits and rendering lag (jank). Virtualization solves this by rendering *only* the subset of items that are currently within the visible viewport plus a small offscreen buffer (overscan). It keeps a constant DOM footprint (e.g., only 30 elements in the DOM regardless of whether the dataset contains 10 or 1,000,000 items). As the user scrolls, the virtualization engine intercepts the scroll event, dynamically calculates the new visible index boundaries, swaps out the slice of data being rendered, and shifts the relative coordinates of the active DOM rows to match the scroll position.
- **The Unforgettable Mental Model:** A physical film projector. A movie is composed of thousands of individual photo frames, but the projector does not display them all at once. Instead, it runs them through a tiny illuminated window (the viewport), displaying only one frame at a time. The audience experiences a seamless movie, but the projector's resource footprint is limited to the single frame sitting under the light.
- **The Trap:** Believing that using `display: none` or hiding elements offscreen counts as virtualization. Even if an element is hidden, it still resides in the DOM tree, occupying memory, increasing GC load, and slowing down traversal times during browser style calculations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: List virtualization is a powerful rendering strategy that maintains a constant DOM node count by only rendering items within the active viewport. Rather than forcing the browser's layout engine to traverse thousands of nodes, we dynamically mount and unmount elements as they enter and exit the scroll window, shifting their coordinates to simulate a continuous scroll and keeping our rendering performance strictly bounded."

#### How render 100k rows?
- **The Engine Mechanism (Why it behaves this way):** Rendering 100,000 rows requires a combination of three structural elements:
  1. **A Scroll Container (Viewport):** A wrapper element with fixed dimensions and `overflow-y: auto` to establish a scrollport.
  2. **A Total Height Spacer (Scroll Runway):** A zero-width absolute spacer element inside the viewport whose height is set to `totalRows * rowHeight` (e.g., 100,000 * 50px = 5,000,000px). This forces the browser's native scrollbar to reflect the true length of the list, providing a correct native scroll behavior.
  3. **A Translating Content Wrapper:** An absolutely positioned container inside the viewport that holds the sliced visible items. As the container scrolls, we calculate the `scrollTop` offset: `startIndex = Math.floor(scrollTop / rowHeight)` and `offsetY = startIndex * rowHeight`. We then set this `offsetY` on the wrapper (using `transform: translateY(offsetY)`) to position the active rows precisely in front of the viewer's eyes.
- **The Unforgettable Mental Model:** A theatrical stage set. The stage is small and can only hold a few actors (rendered DOM rows). Behind the stage, there is a massive scrolling background canvas (the scroll runway spacer) that is miles long. When the stage manager scrolls the background canvas, they slide the active stage set (using CSS transform translateY) up and down to match, making the audience believe they are traveling miles across the countryside.
- **The Trap:** Animating row positioning using top-relative styling (e.g. `top: ${offsetY}px`) instead of `transform: translateY()`. Relative top positioning forces a full browser layout reflow on every single pixel scrolled, causing immediate frame rate drops. CSS transforms run off the main thread on the GPU, avoiding reflow and keeping scrolling silky smooth.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: To render 100k rows performantly, we establish a scrollable viewport containing an absolute spacer element styled to the full, calculated height of the entire dataset. Client-side, we intercept scrolling to compute the start index based on `scrollTop` divided by row height. We slice the dataset to render only the visible range, and shift the active container using GPU-accelerated `translateY` transforms to align the rendered items exactly with the viewport, maintaining 60fps."

#### Pagination vs virtualization?
- **The Engine Mechanism (Why it behaves this way):**
  - **Pagination:** Splits data into distinct, chunked pages. The client requests a specific sub-array, completely replacing the active layout. This is highly performant because the DOM size is tiny and static, and memory consumption is strictly bound to the single page's dataset. The trade-off is user experience, as it breaks the flow of exploration.
  - **Virtualization:** Creates the illusion of a single, continuous, infinitely scrolling list. The dataset is loaded in bulk or appended incrementally, and the DOM is dynamically updated in real-time as the user scrolls. Memory is highly optimized for DOM rendering, but the client JavaScript heap must store the complete, uncompressed dataset of items to allow instant indexing.
- **The Unforgettable Mental Model:** Pagination is a traditional book: if you want to read more, you must physically flip the page, pausing your reading for a brief moment. Virtualization is a long ancient scroll: you roll it smoothly from top to bottom, seeing a continuous stream of text, but your eyes only focus on a small section in the middle.
- **The Trap:** Choosing virtualization for text-rich search engine results or SEO-critical pages. Infinite scroll and virtualization are highly problematic for web crawlers, which struggle to trigger scroll events to discover and index deeper content. For highly searchable, SEO-indexed data, paginated URLs (e.g. `/results?page=3`) are much more reliable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Pagination is a discrete pagination strategy that keeps both DOM and memory footprints exceptionally small, which is excellent for SEO-friendly navigation and structured analysis. Virtualization is a continuous infinite scrolling strategy that optimizes DOM size while keeping the dataset accessible in client memory. For transactional portals or heavy social feeds, virtualization offers an immersive UX, whereas pagination is preferred for search results and SEO crawlers."

#### Fixed vs dynamic row height?
- **The Engine Mechanism (Why it behaves this way):**
  - **Fixed Row Height:** The calculation is mathematically trivial. Finding the active index is a constant-time O(1) operation: `startIndex = Math.floor(scrollTop / rowHeight)`, and total spacer height is `totalItems * rowHeight`.
  - **Dynamic Row Height:** The heights of individual items are unknown beforehand (e.g., comments of varying lengths). The engine must:
    1. Estimate a baseline height for all items to construct an approximate total spacer height.
    2. Maintain an internal dictionary mapping item indices to their measured heights.
    3. Mount the visible items, and then use `ResizeObserver` or post-render hooks to measure their actual heights in the DOM.
    4. Update the dictionary, recalculate the cumulative height prefix-sum array, and adjust the total scroll spacer height and translation offsets on-the-fly. This requires O(log N) binary search operations to find the active visible indices.
- **The Unforgettable Mental Model:** Fixed height is a standard brick wall where every brick is exactly 2 inches tall—you can tell how high the wall is just by counting the bricks. Dynamic height is a stone wall built of unique, irregular rocks—you have to measure every stone with a ruler as you place it to know the true height of the wall.
- **The Trap:** Not accounting for scrollbar "jumping" or "jitter" in dynamic layouts. When the user scrolls down, and estimated heights are replaced with larger measured heights, the total height shifts, causing the scrollbar handle to bounce violently. The engine must implement smooth scroll anchor logic to adjust the viewport's `scrollTop` dynamically to compensate for the measurement differential.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Fixed row height makes virtualization simple and performant, enabling O(1) mathematical index calculations. Dynamic row virtualization requires a highly complex estimation, caching, and post-render measurement lifecycle. We must estimate initial heights, monitor actual heights using `ResizeObserver` or DOM measurements, maintain a prefix-sum array for binary-search index lookups, and dynamically adjust scroll offsets to prevent scrollbar jumping."

#### What is overscan?
- **The Engine Mechanism (Why it behaves this way):** Overscan is the practice of rendering a buffer of invisible rows directly above and below the active visible viewport. If the viewport fits 10 items, and the overscan is set to 5, the virtual list will render 20 items in the DOM. This buffer is critical because scroll events are fired asynchronously by the browser's UI thread and processed by the JavaScript main thread. During rapid scrolls, if the user moves the viewport faster than JavaScript can execute the slice calculation and render the new DOM nodes, the user will see a flash of empty, unrendered white space. The overscan buffer acts as a defensive padding, ensuring there are already rendered rows ready to slide into view while the JS thread works to catch up.
- **The Unforgettable Mental Model:** A theater spotlight. If the spotlight is focused strictly on the lead actor, a sudden step to the side will plunge them into darkness before the light operator can react. By widening the spotlight beam slightly (overscan buffer), the actor can move freely, and the operator has a comfortable window of time to pan the light without breaking the illusion.
- **The Trap:** Setting the overscan buffer too high. If you set overscan to 100 items, you are rendering 200 items in the DOM, which increases layout and paint times on scroll, negating the performance benefits of virtualization in the first place.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Overscan is a performance buffer that renders a calculated number of additional items immediately outside the visible viewport limits. Because browser scroll events are fired asynchronously, rapid scrolling can easily outrun V8 DOM reconciliation, causing users to see empty blank spaces. Overscan solves this by providing pre-rendered padding rows that slide in instantly, hiding layout latency and ensuring a seamless, high-performance scroll experience."

## 8. Active recall test

#### 1. Why is rendering a massive list of thousands of raw DOM nodes highly detrimental to browser performance?
Because large DOM trees consume significant memory, and force the browser's rendering engine to execute heavy style, reflow (layout), and repaint calculations, causing frame drops and visual UI lag (jank).

#### 2. How do you mathematically compute the startIndex of visible items in a fixed-height virtual list?
By dividing the viewport's current vertical scroll offset (`scrollTop`) by the height of a single row (`rowHeight`) and rounding down: `startIndex = Math.floor(scrollTop / rowHeight)`.

#### 3. What is the purpose of the "spacer height" or "runway" element inside a virtual list viewport?
It establishes an absolute child element with a height matching the theoretical full length of the dataset (`totalItems * rowHeight`), which tricks the browser's native layout engine into displaying correct native scrollbars.

#### 4. What is the critical role of the overscan buffer in list virtualization?
It pre-renders a small set of items just outside the visible bounds of the viewport. This padding handles scroll events asynchronously, providing instant frames to slide in while the main JS thread catches up to recalculate DOM slices.

#### 5. When is standard pagination structurally superior to dynamic list virtualization?
For search-engine indexed layouts (SEO) where web crawlers need unique static pages to index content, or in scenarios with severe client-side heap memory limits where storing massive data arrays in JS variables is unacceptable.

## 9. Mistakes / traps
- Rendering all rows hidden.
- Ignoring keyboard/accessibility.
- Bad dynamic height measurement.
- Forgetting stable keys.

## 10. Compare with related concepts
- **Virtualization vs pagination:** same scroll illusion vs page chunks.
- **Virtualization vs infinite scroll:** DOM windowing vs data loading.
- **Overscan vs visible range:** buffer vs exact viewport.

## 11. Summary from memory
Explain how fixed-height virtual list calculates visible rows.

## 12. Spaced revision prompts
- 1 day: Define virtual list.
- 3 days: Calculate visible indices.
- 7 days: Explain overscan.
- 14 days: Compare with pagination.

