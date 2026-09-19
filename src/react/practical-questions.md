# React Machine Coding Interview Guide

> **Goal:** If you can independently solve every problem in this section, you are prepared for almost any React machine-coding or practical frontend interview.
>
> This is a **practice bank and pattern library**, not a list of snippets to memorize. Every problem teaches one reusable pattern, and every implementation is small enough to reproduce from scratch in 30&ndash;45 minutes.

## How to use this section

The material is split across focused pages so each study session is one topic, not one enormous scroll.

1. Start with the **Must Master** checklist below.
2. Open the page for the pattern you are practising.
3. For every problem, read **State Design** *before* looking at the code. Try to write the component from the state design alone.
4. Then read **Basic Version**, and work through the **Interview Follow-ups** out loud.
5. Rebuild the problem from scratch a day later. If you can, move on.

### Difficulty and probability markers

| Marker | Meaning |
|---|---|
| `Difficulty: Easy` | Reproducible in about 15 minutes. |
| `Difficulty: Medium` | 25&ndash;35 minutes; the realistic interview bar. |
| `Difficulty: Hard` | 45+ minutes; senior / deep-dive. |
| `Probability: Very High` | Asked constantly in React interviews. |
| `Probability: High` | Common. |
| `Probability: Medium` | Appears in product-focused or senior loops. |
| `Probability: Low` | Rare, but teaches a useful pattern. |

Probability describes how useful the pattern is in a real frontend interview, not a statistical claim.

### The structure of every major problem

Each guided problem follows the same order so you can study quickly:

1. **What are we building?**
2. **Example**
3. **What is the interviewer testing?**
4. **State Design**
5. **Basic Version**
6. **How It Works**
7. **Edge Cases**
8. **Interview Follow-ups**
9. **Production Version**
10. **Accessibility**
11. **Performance**
12. **Testing**
13. **Common Mistakes**
14. **Interview Takeaway**

Warm-up exercises omit sections that do not apply.

### Two rules that shape this section

- **Variants are merged.** Accordion, Tabs, Modal, Dropdown, Data Table, File Explorer, Progress/Task Scheduler, Carousel, and Tic-Tac-Toe are each a *single* problem whose follow-ups increase in difficulty. Accessibility and keyboard support are levels, not separate chapters.
- **No library shortcuts for the core logic.** Everything is built with React and browser APIs. Server-state libraries (TanStack Query, SWR) and state managers (Redux, Zustand) appear only in **Production Version** notes about how the architecture would change &mdash; never as the answer to the interview question.

## Must Master Before a React Interview

If time is short, master these first. Each links to the page that teaches it.

- [ ] 1. Todo / CRUD list (add, edit, toggle, delete, filter) &mdash; [Core State & UI](machine-coding/01-core-state.md)
- [ ] 2. Controlled form with validation &mdash; [Forms & User Input](machine-coding/02-forms.md)
- [ ] 3. Multi-step form / wizard &mdash; [Forms & User Input](machine-coding/02-forms.md)
- [ ] 4. Accordion (ARIA + keyboard) &mdash; [Interactive Components](machine-coding/03-components.md)
- [ ] 5. Tabs (ARIA + keyboard) &mdash; [Interactive Components](machine-coding/03-components.md)
- [ ] 6. Accessible Modal (portal, focus trap, focus restore) &mdash; [Interactive Components](machine-coding/03-components.md)
- [ ] 7. Dropdown / Select (keyboard + outside click) &mdash; [Interactive Components](machine-coding/03-components.md)
- [ ] 8. OTP / verification-code input &mdash; [Forms & User Input](machine-coding/02-forms.md)
- [ ] 9. Star Rating &mdash; [Interactive Components](machine-coding/03-components.md)
- [ ] 10. Autocomplete / Combobox (debounce + keyboard + async) &mdash; [Interactive Components](machine-coding/03-components.md)
- [ ] 11. Data Table (sort, filter, paginate, select) &mdash; [Lists, Trees & Complex State](machine-coding/04-lists-trees.md)
- [ ] 12. Transfer List &mdash; [Lists, Trees & Complex State](machine-coding/04-lists-trees.md)
- [ ] 13. File Explorer / Tree View (recursive + flat) &mdash; [Lists, Trees & Complex State](machine-coding/04-lists-trees.md)
- [ ] 14. Nested Checkboxes &mdash; [Lists, Trees & Complex State](machine-coding/04-lists-trees.md)
- [ ] 15. Carousel (a11y + autoplay) &mdash; [Interactive Components](machine-coding/03-components.md)
- [ ] 16. Toast system (provider + queue + a11y) &mdash; [Interactive Components](machine-coding/03-components.md)
- [ ] 17. Infinite Scroll (IntersectionObserver + cleanup) &mdash; [API / Async React](machine-coding/05-async.md)
- [ ] 18. Product Listing / Catalog &mdash; [Real-World Features](machine-coding/09-real-world.md)
- [ ] 19. Async API list (loading / empty / error / retry / race) &mdash; [API / Async React](machine-coding/05-async.md)
- [ ] 20. Drag-and-drop Kanban &mdash; [Lists, Trees & Complex State](machine-coding/04-lists-trees.md)
- [ ] 21. Task Scheduler / Progress Bars (queue + concurrency + pause) &mdash; [Timers & Scheduling](machine-coding/06-timers.md)
- [ ] 22. Virtualized List &mdash; [Performance & Large Data](machine-coding/07-performance.md)
- [ ] 23. Shopping Cart (Context + `useReducer`) &mdash; [Application State & Architecture](machine-coding/08-architecture.md)
- [ ] 24. Undo / Redo history &mdash; [Core State & UI](machine-coding/01-core-state.md)
- [ ] 25. Stopwatch / Countdown timer &mdash; [Timers & Scheduling](machine-coding/06-timers.md)
- [ ] 26. Memory Game or Tic-Tac-Toe &mdash; [Games / Logic-Heavy UI](machine-coding/10-games.md)
- [ ] 27. Custom hooks: `useDebounce`, `useThrottle`, `useInterval`, `useFetch` &mdash; [Custom Hooks](machine-coding/11-custom-hooks.md)
- [ ] 28. Race-condition handling (AbortController + stale responses) &mdash; [API / Async React](machine-coding/05-async.md)
- [ ] 29. Optimistic update with rollback &mdash; [API / Async React](machine-coding/05-async.md)
- [ ] 30. Component testing with React Testing Library &mdash; [Testing](machine-coding/12-testing.md)
- [ ] 31. Debugging: stale closure, missing cleanup, mutation, wrong keys &mdash; [Senior / Advanced](machine-coding/13-senior-debugging.md)

## Section index

| Page | Problems |
|---|---|
| [1. Core React State & UI](machine-coding/01-core-state.md) | Counter with constraints · Todo / CRUD · Inline editable list · Like with optimistic updates · Undo / Redo · Theme switcher |
| [2. Forms & User Input](machine-coding/02-forms.md) | Controlled validation · Login / Signup · Multi-step wizard · Dynamic form from config · Dependent fields · OTP · File upload · File upload with progress |
| [3. Reusable Interactive Components](machine-coding/03-components.md) | Accordion · Tabs · Modal · Dropdown / Select · Multi-select · Autocomplete / Combobox · Command palette · Star rating · Tooltip / Popover · Toast · Carousel · Gallery / Lightbox · Pagination · Breadcrumb · Context menu · Menu / Menubar · Stepper |
| [4. Lists, Trees & Complex State](machine-coding/04-lists-trees.md) | Transfer list · Nested checkboxes · File explorer / tree · Nested comments · Sortable list · Kanban · Data table |
| [5. API / Async React](machine-coding/05-async.md) | API list · Debounced search · Cancellation & races · Cached search · API autocomplete · Load more · Infinite scroll · Retry · Polling · Optimistic mutation · Dependent requests · Parallel requests |
| [6. Timers, Scheduling & State Machines](machine-coding/06-timers.md) | Stopwatch · Countdown · Traffic light · Task scheduler / progress bars |
| [7. Performance & Large Data](machine-coding/07-performance.md) | Virtualized list · Windowed infinite list · Large searchable list · Lazy image gallery · Memoization & re-render optimization |
| [8. Application State & Architecture](machine-coding/08-architecture.md) | Shopping cart (Context + reducer) · Auth provider · Compound components · Controlled vs uncontrolled · Headless component · Reducer-based state |
| [9. Real-World Frontend Features](machine-coding/09-real-world.md) | Product catalog · URL-synced filters · Chat · WebSocket · Notification center · Dashboard · Calendar · Seat booking · Poll / vote · Profile / settings · Infinite feed |
| [10. Games / Logic-Heavy UI](machine-coding/10-games.md) | Tic-tac-toe N×N · Memory game · Connect Four · Grid lights · Wordle · Minesweeper |
| [11. Custom Hooks](machine-coding/11-custom-hooks.md) | `useDebounce` · `useThrottle` · `useLocalStorage` · `usePrevious` · `useClickOutside` · `useInterval` · `useTimeout` · `useFetch` · `useMediaQuery` · `useWindowSize` · `useIntersectionObserver` · `useOnlineStatus` |
| [12. Testing](machine-coding/12-testing.md) | Todo interactions · Modal keyboard / focus · Autocomplete · Debounced input with fake timers · Async states · Custom hooks · Accessibility |
| [13. Senior / Advanced Machine Coding](machine-coding/13-senior-debugging.md) | Resilient API-data component · Error boundary + retry · React debugging clinic · Capstone assembly |

## Coverage map

Use this to find a concept when revising. Each category maps to the pages that teach it.

| Category | Covered in |
|---|---|
| State: `useState`, `useReducer`, derived state, immutable updates, nested state | 1, 2, 4, 8 |
| Effects: `useEffect`, cleanup, dependency arrays, stale closures | 5, 6, 7, 9, 11, 13 |
| Refs: `useRef`, DOM focus, timers, previous values | 3, 6, 11 |
| Events: mouse, keyboard, clipboard, drag/drop, scroll | 3, 4, 9, 10 |
| Forms: controlled, validation, dynamic fields, multi-step, submission | 2 |
| Async: fetch, loading/errors, retries, cancellation, races, parallel, pagination, caching, optimistic | 5, 9, 13 |
| Components: composition, controlled/uncontrolled, reusable APIs, portals, Context, reducers, compound | 3, 8 |
| Data structures: arrays, Sets, Maps, tree recursion, matrices, queues, history stacks | 1, 4, 6, 10 |
| Browser APIs: localStorage, AbortController, IntersectionObserver, WebSocket, portals/focus | 4, 5, 6, 7, 9, 11 |
| Performance: re-renders, memoization, virtualization, large lists | 7 |
| Accessibility: semantics, ARIA, focus, keyboard navigation | 2, 3, 4, 9, 12 |
| Testing: interaction, async, timers, hooks, accessibility | 12 |
| Debugging: stale closures, mutation, infinite effects, missing cleanup, keys, races | 13 |

## Warm-up / Extra Practice

These are valid but low-complexity. Do not spend a full study session here. They exist so the earlier version of this section keeps its useful material without crowding out the high-value problems above.

### Dice Roller

`Difficulty: Easy` `Probability: Low`

**What to build:** Roll `N` six-sided dice and show the roll and its sum.

**State Design:** `count` and `rolls: number[]`. The sum is derived with `.reduce()`, never stored.

```ts
const [rolls, setRolls] = useState<number[]>([]);
const roll = () =>
  setRolls(Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1));
const sum = rolls.reduce((a, b) => a + b, 0);
```

**Takeaway:** Random output is state; the sum is derived.

### Mortgage Calculator

`Difficulty: Easy` `Probability: Low`

**What to build:** Monthly payment from principal, annual rate, and years.

```ts
const monthly = useMemo(() => {
  const r = annualRate / 12 / 100;
  const n = years * 12;
  return r === 0 ? principal / n : (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
}, [principal, annualRate, years]);
```

**Edge case:** rate `0` &rarr; simple division. Guard against `NaN` from empty inputs.

### Temperature Converter

`Difficulty: Easy` `Probability: Low`

**What to build:** Two inputs, Celsius and Fahrenheit, that stay in sync.

**State Design:** The classic trap is storing both values and syncing them, which causes loops. Store **one** canonical value (`celsius`) plus which field is being edited, and derive the other.

```ts
const [celsius, setCelsius] = useState("0");
const fahrenheit = (Number(celsius || 0) * 9) / 5 + 32;
```

**Takeaway:** Never store two representations of the same data. Pick one source of truth.

### Tweet / Social Card

`Difficulty: Easy` `Probability: Low`

**What to build:** A reusable presentational card (avatar, name, handle, body, actions).

**State Design:** None &mdash; pure props. This is a composition and semantic-HTML exercise (`<article>`, `<time>`, alt text).

**Takeaway:** Not every component needs state. Prefer presentational components and lift state only when necessary.

### Generate Table

`Difficulty: Easy` `Probability: Low`

**What to build:** A table of `rows &times; cols` numbers.

```ts
Array.from({ length: rows }, (_, r) => (
  <tr key={r}>
    {Array.from({ length: cols }, (_, c) => <td key={c}>{r * cols + c + 1}</td>)}
  </tr>
));
```

**Edge case:** keys must be stable (`r`, `c`), not the generated value. Very large grids should be virtualized.

### Analog / Digital Clock

`Difficulty: Easy` `Probability: Low`

**What to build:** A live clock. Digital updates text; analog rotates hands.

**State Design:** `now: Date`, updated on an interval; hand angles are derived.

```ts
useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 1000);
  return () => clearInterval(id);          // always clean up the interval
}, []);
```

**Takeaway:** An interval without a cleanup is the most common timer bug in interviews.

### Birth Year Histogram

`Difficulty: Easy` `Probability: Low`

**What to build:** Fetch numbers and render frequency bars.

**State Design:** `years: number[]`. Counts and the max are derived:

```ts
const counts = useMemo(
  () => years.reduce<Record<number, number>>((acc, y) => ({ ...acc, [y]: (acc[y] ?? 0) + 1 }), {}),
  [years],
);
```

**Takeaway:** Derive aggregates; add loading / error states like every other fetch.

### Holy Grail Layout

`Difficulty: Easy` `Probability: Low`

**What to build:** Header, left sidebar, main, right sidebar, footer.

**Takeaway:** Pure CSS exercise. Use `display: grid` with `grid-template-areas`; no JavaScript and no state required.

### Flight Booker

`Difficulty: Easy` `Probability: Low`

**What to build:** One-way vs return booking with date validation.

**State Design:** `tripType`, `start`, `end`; `isValid` is derived, and the return field is disabled for one-way.

**Takeaway:** Derived validation (`type === "one-way" || end >= start`) beats manually synchronizing an `isValid` state.
