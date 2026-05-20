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
- What is virtualization?
- How render 100k rows?
- Pagination vs virtualization?
- Fixed vs dynamic row height?
- What is overscan?

## 8. Active recall test
1. Why not render all rows?
2. How compute start index?
3. What is spacer height?
4. What is overscan?
5. When pagination better?

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

