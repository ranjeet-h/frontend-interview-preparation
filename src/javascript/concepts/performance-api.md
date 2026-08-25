# Performance API

## 1. Why This Exists — The Problem First

“The page feels slow” is not a diagnosis. A search screen can spend 40 ms fetching data, 8 ms running JavaScript, and another 180 ms waiting for rendering work. A local laptop may hide that; a phone on a busy network may make it obvious. Without timestamps tied to meaningful events, an optimization is just a guess and a regression is easy to miss.

The Performance API gives browser code a common timeline for answering questions such as: How long did this render take? Which resource was slow? When did the first paint happen? How many long tasks blocked the main thread? It can record measurements made by the browser and measurements that the application adds itself, then let code inspect or report them.

## 2. The Analogy — Make It Obvious

Imagine a parcel depot with one shared wall clock and a tracking ledger.

- The monotonic clock is the depot’s stopwatch. It only measures elapsed time for this depot session; somebody changing the town clock cannot make a delivery appear to finish before it started.
- A `PerformanceMark` is a named stamp in the ledger: “package scanned” or “truck departed.”
- A `PerformanceMeasure` is the calculated interval between two stamps: “sorting took 42 ms.”
- Browser-created entries are automatic tracking events: a script request, a paint, a navigation, or a long task.
- `PerformanceObserver` is the supervisor’s notification subscription. Instead of repeatedly asking for the entire ledger, the supervisor receives new entries of the types they requested.
- The performance timeline is the ledger. DevTools can display it, and a real-user-monitoring system can send selected measurements to a server.

The analogy has an important limit: the ledger records timing; it does not make the work faster. A measure can tell us that rendering took 180 ms, but it cannot explain every cause by itself. We still need the browser trace, application logs, and the entry’s additional fields to find the bottleneck.

## 3. How It Actually Works — The Full Explanation

The browser exposes `performance` in window and worker contexts. It uses a `timeOrigin` and high-resolution timestamps measured in milliseconds. In a window, the origin is associated with the start of the navigation; in a worker, it belongs to that worker’s start. `performance.now()` returns elapsed time from that origin, while `Date.now()` returns wall-clock milliseconds since the Unix epoch.

That difference is the first rule:

```text
duration = performance.now() after - performance.now() before
```

Use `performance.now()` for durations because it is based on a monotonic clock and does not move backward when the system clock is corrected. Its precision can be reduced by the browser for security, so “high resolution” does not mean that every environment exposes unlimited microsecond accuracy. `performance.timeOrigin + performance.now()` is useful when an application needs to relate a high-resolution reading to an epoch-like timestamp, but do not treat that derived value as a server-synchronized clock.

The Performance Timeline stores `PerformanceEntry` objects. Every entry has a `name`, `entryType`, `startTime`, and `duration`; specialized entry types add their own fields. Some entries are created by the browser, including:

- `navigation`: document navigation phases.
- `resource`: network timing for scripts, images, stylesheets, and fetches, including fields such as `fetchStart`, `responseStart`, and `responseEnd`.
- `paint`: milestones such as `first-paint` and `first-contentful-paint` where supported.
- `longtask`: main-thread tasks that occupy at least 50 ms.
- `event`: event timing data used to understand interaction latency where supported.
- `layout-shift` and `largest-contentful-paint`: signals used in page-experience measurements where supported.

The exact set varies by browser and context. Check `PerformanceObserver.supportedEntryTypes` before relying on an optional entry type.

Application code contributes User Timing entries:

1. `performance.mark("search-start")` creates a point-in-time `PerformanceMark`.
2. The application does work, such as applying data to the DOM.
3. `performance.mark("search-end")` creates another point.
4. `performance.measure("search-render", "search-start", "search-end")` creates a `PerformanceMeasure` whose `duration` is the difference.
5. Code can read the result with `performance.getEntriesByName()` or receive it through an observer.

Marks are points, not durations. Measures are the named intervals derived from points. Calling `performance.clearMarks()` and `performance.clearMeasures()` removes entries that the application no longer needs; otherwise a frequently repeated interaction can leave unnecessary timeline data around. Resource entries have their own buffer-management rules, so a resource-heavy application should also understand the resource timing buffer rather than assuming that every old resource remains available forever.

`performance.getEntries()` is a snapshot query. It is fine for a small diagnostic or a one-time report, but repeatedly scanning the complete timeline is noisy and can create unnecessary work. `PerformanceObserver` lets the browser notify code when matching entries are recorded:

```text
browser records entry -> observer callback is queued -> callback receives a batch -> app filters and reports it
```

The callback is not a promise that the page is free of performance cost. Processing every entry, serializing large objects, or sending a network request for every callback can itself hurt the page. A production collector filters early, batches reports, and disconnects observers when their lifecycle ends.

Resource entries are also subject to a resource-timing buffer. `performance.setResourceTimingBufferSize(maxSize)` requests a larger maximum number of resource entries when a page expects many resources. `performance.clearResourceTimings()` removes the currently stored resource entries, which is useful after a report or before starting a new measurement window. The `resourcetimingbufferfull` event tells the page that the buffer reached its limit; a handler can report the condition, clear entries, or request more capacity. A `PerformanceObserver` does not make this storage unlimited: under buffering pressure, entries can be dropped before they are delivered or retained. Treat resource telemetry as best-effort, listen for the full-buffer signal, and aggregate reports instead of assuming that every resource will be present.

Where supported, configure the resource observer with `buffered: true` and inspect the callback's optional `droppedEntriesCount` option. It reports how many entries were lost because the performance buffer was full, so telemetry can count the loss instead of silently treating the delivered batch as complete:

```js
const performance = globalThis.performance;
const PerformanceObserver = globalThis.PerformanceObserver;

if (!performance || !PerformanceObserver) {
  throw new Error("Run this example in a browser with PerformanceObserver");
}

let droppedResourceEntries = 0;
const resourceObserver = new PerformanceObserver((list, observer, options) => {
  const droppedEntriesCount = options?.droppedEntriesCount ?? 0;
  droppedResourceEntries += droppedEntriesCount;

  if (droppedEntriesCount > 0) {
    console.warn(`Dropped ${droppedEntriesCount} resource timing entries`);
  }

  console.log(`Received ${list.getEntries().length} resource entries`);
  console.log(`Dropped total: ${droppedResourceEntries}`);
});

if (PerformanceObserver.supportedEntryTypes.includes("resource")) {
  resourceObserver.observe({ type: "resource", buffered: true });
}
```

Finally, measuring JavaScript is not the same as measuring user-perceived responsiveness. An event handler may finish quickly but trigger expensive style calculation, layout, paint, or a later task. Event timing and long-task entries can reveal those problems when supported; a custom mark around a handler only answers the narrower question “how long did this marked code run?”

## 4. Real Code — See It Working

**Measure an operation with `now()`.**

```js
const performance = globalThis.performance;
const products = [
  { name: "Keyboard" },
  { name: "Monitor" },
  { name: "Mouse" },
];
const searchInput = { value: "mo" };

if (!performance) {
  throw new Error("Run this example in a browser with the Performance API");
}

function filterProducts(products, query) {
  const normalizedQuery = query.trim().toLowerCase();
  return products.filter((product) =>
    product.name.toLowerCase().includes(normalizedQuery),
  );
}

const startedAt = performance.now();
const visibleProducts = filterProducts(products, searchInput.value);
const elapsedMs = performance.now() - startedAt;

console.log(`Filtering took ${elapsedMs.toFixed(2)} ms`);
```

The subtraction is meaningful even if the system clock is adjusted while the function runs. The result is a duration, not a timestamp that should be shown as a date.

**Add named marks and observe the measure.**

```js
const performance = globalThis.performance;
const PerformanceObserver = globalThis.PerformanceObserver;
const document = globalThis.document;

if (!performance || !PerformanceObserver || !document) {
  throw new Error("Run this example in a browser with User Timing support");
}

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.entryType === "measure" && entry.name === "search-render") {
      console.log(`Search render: ${entry.duration.toFixed(2)} ms`);
    }
  }
});

observer.observe({ type: "measure" });

function renderSearchResults(results, container) {
  performance.mark("search-render-start");

  // This is the boundary we chose to measure: creating and attaching rows.
  container.replaceChildren(
    ...results.map((result) => {
      const item = document.createElement("li");
      item.textContent = result.name;
      return item;
    }),
  );

  performance.mark("search-render-end");
  performance.measure(
    "search-render",
    "search-render-start",
    "search-render-end",
  );

  // The names are reusable for the next render; clear old entries after the
  // measure has been created and delivered to the observer's queue.
  performance.clearMarks("search-render-start");
  performance.clearMarks("search-render-end");
  performance.clearMeasures("search-render");
}

const results = [{ name: "Monitor" }, { name: "Mouse" }];
const container = document.createElement("ul");
renderSearchResults(results, container);

// For a one-off read, retain the entry before clearing it instead.
const request = () => Promise.resolve({ ok: true });

void (async () => {
  performance.mark("request-start");
  await request();
  performance.mark("request-end");
  performance.measure("products-request", "request-start", "request-end");

  const [requestMeasure] = performance.getEntriesByName("products-request");
  console.log(requestMeasure.duration);

  performance.clearMarks();
  performance.clearMeasures();
})();
```

**Inspect built-in resource timing.**

```js
const performance = globalThis.performance;

if (!performance) {
  throw new Error("Run this example in a browser with Resource Timing support");
}

const slowResources = performance
  .getEntriesByType("resource")
  .filter((entry) => entry.duration > 300)
  .map((entry) => ({
    url: entry.name,
    durationMs: Math.round(entry.duration),
    transferBytes: entry.transferSize,
  }));

console.table(slowResources);
```

`duration` here covers the resource timing interval, not necessarily the time until the resource has affected the screen. A slow script download and a slow script execution are different measurements.

**Observe long tasks when the browser supports them.**

```js
const PerformanceObserver = globalThis.PerformanceObserver;

if (!PerformanceObserver) {
  throw new Error("Run this example in a browser with PerformanceObserver");
}

if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
  const longTaskObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.log(`Main-thread task blocked for ${entry.duration.toFixed(1)} ms`);
    }
  });

  longTaskObserver.observe({ type: "longtask", buffered: true });
}
```

`buffered: true` asks for matching entries that were recorded before the observer was created, where that option is supported for the entry type. It is useful when the observer starts after page startup, but the callback should still filter and bound what it reports.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the Performance API?**

It is a group of browser standards for collecting timing data. The browser creates entries for events such as navigation, resource loading, paint, long tasks, and interaction timing; application code can add User Timing marks and measures. Those entries are exposed through the `performance` object, can be inspected by code and DevTools, and can be sampled for real-user monitoring.

**Q: Why use `performance.now()` instead of `Date.now()` to measure duration?**

`Date.now()` is wall-clock time tied to the Unix epoch, so operating-system corrections or a user changing the clock can make two readings jump. `performance.now()` is elapsed time from a monotonic `timeOrigin`, so it is appropriate for subtracting start and end readings. `Date.now()` is still useful when the requirement is a calendar or epoch timestamp rather than an accurate short duration.

**Q: What is the difference between a mark and a measure?**

A mark is a named point on the performance timeline. A measure is a named duration calculated between marks, or between a mark and a supplied time boundary. Use marks to identify boundaries such as “request started” and “request finished,” then use a measure to answer “how long was that interval?”

**Q: What does a `PerformanceEntry` contain?**

The common fields are `name`, `entryType`, `startTime`, and `duration`. The concrete entry type determines the meaning of those fields and may add details. For example, a `PerformanceResourceTiming` entry includes network-phase timestamps, while a `PerformanceMeasure` represents an interval created by application code.

**Q: Why use `PerformanceObserver`?**

It is an event-driven way to receive new performance entries of selected types. It avoids repeatedly polling and scanning the whole performance timeline. It does not make collection free: the callback still runs in the page, so production code should select only needed entry types, process small batches, sample or aggregate data, and call `disconnect()` when observation is no longer needed.

**Q: How would you investigate a slow interaction?**

First separate the stages: input delay before the handler starts, handler and other JavaScript work, rendering work, and the time until the next visible update. Use browser traces and, where supported, `PerformanceObserver` for `event` and `longtask` entries to capture real interaction and main-thread evidence. Use custom marks around a known application boundary to explain one part of the interaction. Do not claim that a mark around the event handler alone is an INP measurement; INP is about the interaction’s latency to the next paint and is collected through the Event Timing model and browser tooling.

**Q: Are performance timestamps universally comparable?**

Not automatically. `performance.now()` readings in the same global context are suitable for subtraction. Window and worker contexts can have different time origins, and timestamps from different documents are not interchangeable without an explicit conversion strategy. Also, browser precision can be coarsened for security. Send a clearly defined duration or a timestamp plus its origin rather than silently mixing unrelated clocks.

## 6. The Traps — What Goes Wrong

- **Using `Date.now()` for a short duration.** A wall clock can be adjusted while the operation runs. Subtract `performance.now()` readings when elapsed time is the question.

- **Calling a handler measurement “the user’s wait.”** A handler’s JavaScript duration ends before all style, layout, paint, and compositor work necessarily finishes. Measure the boundary you actually care about, and use event timing or a browser trace for interaction-to-paint questions.

- **Assuming `performance.now()` is an epoch timestamp.** Its number is relative to `timeOrigin`. Do not render it as a date or compare it directly with a server’s Unix timestamp without conversion and clock-skew awareness.

- **Assuming “high resolution” means exact microseconds everywhere.** Browsers deliberately reduce timestamp precision in some contexts. Treat measurements as observations with a resolution, not as laboratory instruments.

- **Polling the complete timeline forever.** `getEntries()` returns a snapshot and can cause repeated scanning and allocations in a hot path. Observe the entry types you need, or query at a deliberate reporting boundary.

- **Expecting an observer to replay everything by default.** An observer receives entries recorded after it starts unless the entry type and options support buffered delivery and `buffered: true` is requested. If startup metrics matter, install the observer early or use the appropriate buffered option.

- **Clearing entries before using them.** `clearMarks()` and `clearMeasures()` remove your custom entries. Read, report, or retain the relevant values first. Clear by name when several independent features share the page.

- **Treating a missing entry type as a failure in your application.** Support varies by browser and context. Check `PerformanceObserver.supportedEntryTypes`, feature-detect the API, and make telemetry optional rather than blocking the feature being measured.

- **Reporting every event immediately.** A telemetry callback that serializes a large object and performs a network request for each entry can become the performance problem. Aggregate, sample, and send asynchronously in bounded batches.

## 7. Compare With Related Concepts

| Concept | Key difference | Use it when |
|---|---|---|
| `performance.now()` | Monotonic elapsed time relative to a context’s `timeOrigin` | Measuring a duration inside one window or worker |
| `Date.now()` | Wall-clock milliseconds since the Unix epoch | Recording a calendar/epoch timestamp or correlating loosely with external systems |
| `performance.mark()` | Adds a named point to the timeline | Marking an application boundary |
| `performance.measure()` | Adds a named interval between points or timestamps | Measuring one operation with a reusable timeline entry |
| `performance.getEntries()` | Takes a synchronous snapshot of stored entries | One-time diagnostics or a deliberate report |
| `PerformanceObserver` | Receives selected entries as they are recorded | Streaming metrics and avoiding repeated full-timeline polling |
| DevTools Performance panel | Interactive lab inspection of a trace | Finding rendering, scripting, and browser-pipeline causes during investigation |
| Real-user monitoring | Production telemetry collected from actual users | Learning how devices, networks, and real interactions behave at scale |

The practical rule is: use `now()` for a local stopwatch, marks and measures for application-owned boundaries, built-in entries for browser-owned milestones, and an observer plus careful aggregation for production telemetry. A lab profile explains a reproduction; RUM tells you whether the same problem exists for real users.

## 8. 🧠 The Memory Hook — What Sticks

Think of the Performance API as a parcel depot’s stopwatch and tracking ledger: `now()` times the trip, marks stamp the important moments, measures draw the interval, and observers deliver selected new records. The ledger gives you evidence, not a diagnosis—always name the exact boundary you measured and distinguish JavaScript time from the user’s time until the screen updates.
