# JavaScript Coding Section Revamp — Handoff / Continuation Plan

> **Read this first.** This file is the complete state, plan, and instructions for the
> JavaScript coding-section revamp. A previous agent ran out of usage mid-task. Everything
> needed to finish the work without that agent is here.
>
> **Canonical style guide (READ IT):** `docs/superpowers/handoff-js-coding/BRIEF.md`
> **Verified exemplar output (READ IT):** `docs/superpowers/handoff-js-coding/07-this-call-bind-new.md`
> — 1,115 lines, 8 problems, produced by a subagent using the brief. Match this quality.

---

## 1. End goal

The book (`frontend-interview-preparation`, mdBook) has a good **theory** JavaScript
section but the **coding/practical** JavaScript section is disorganised: it is spread
across legacy files that `{{#include}}` slices of giant root files, duplicates topics, and
does not cover the full question bank.

**Goal:** Replace it with a clean, organised, comprehensive practical JavaScript bank that
covers ~360 problems across three parts, matching the quality of the React
machine-coding section that was previously built and merged.

Source spec: the detailed user prompt listing every coding question, guess-the-output
question, and debugging challenge. The problem lists are reproduced in **§8** below.

Three parts:

1. **Part 1 — JavaScript Coding Questions** (~224 problems, 15 categories)
2. **Part 2 — Guess the Output / Explain the Behavior** (~120 questions, 47 topics)
3. **Part 3 — JavaScript Debugging Questions** (15 challenges)

---

## 2. Locked decisions (already confirmed with the user — do not re-litigate)

| Decision | Choice |
|---|---|
| Page structure | **Section pages under `src/javascript/coding-questions/`**, plus a landing page `src/javascript/coding-questions.md`. Problems are `##`, subsections are `###`. |
| Legacy files | **Replace them; migrate unique content.** Old URLs should be turned into short redirect stubs so links don't 404. |
| Delivery | **Phased with checkpoints:** Part 1 → build + user review → Part 2 → review → Part 3. User approves each phase. Commit per phase. |
| Numbering | Problems are **NOT numbered in source**; CSS auto-numbers them (reuse the React `machine-coding` class). |
| Templates | Coding template (10 subsections), guess-output template (output + why + rule + safe rewrite), debugging template. See BRIEF.md. |
| Libraries | No library shortcut as the core answer (lodash/redux only in follow-ups). |

---

## 3. Current state

### Done
- ✅ **Landing page written:** `src/javascript/coding-questions.md` (goal, how-to, difficulty
  legend, coding template, Must Master checklist of 40 items with links, Part 1 section
  index table, empty Part 2/Part 3 sections, coverage map). It is currently **not** in
  `SUMMARY.md` yet.
- ✅ **Generation brief written and copied into the repo:**
  `docs/superpowers/handoff-js-coding/BRIEF.md`
- ✅ **Pilot page fragment generated and verified:**
  `docs/superpowers/handoff-js-coding/07-this-call-bind-new.md`
  (8 problems: custom call/apply/bind, bind+new, custom new, custom instanceof, permanent
  binding, method borrowing). This is a **fragment** — it has `##` problems only, no H1.

### Not started
- ❌ Pages 01–06, 08–15 (coding) — the rest of Phase 1.
- ❌ Per-page H1 + intro header files (the "assembler" headers).
- ❌ Assembling fragments into final pages under `src/javascript/coding-questions/`.
- ❌ SUMMARY.md wiring for new pages + legacy stubs.
- ❌ `theme/head.hbs` generalization (currently only activates on `/react/machine-coding/`).
- ❌ Phase 2 (guess-the-output) and Phase 3 (debugging).
- ❌ Build verification, commit, push.

### Verified technical facts (from the React work — save time, don't rediscover)
- mdBook root font-size is `62.5%` → **1rem = 10px**. Never set heading `font-size` in rem
  assuming 16px.
- Bundled highlight.js supports: `javascript`, `typescript`, `json`, `bash`, `python`,
  `sql`, `xml`(html), `plaintext`, `css`, etc. It does **NOT** support `tsx`.
  → **Use ``` ```javascript ``` fences for all JS.**
- The theme already has scoped CSS keyed on `html.machine-coding` in `theme/custom.css`
  (numbered `##` headings, top border separation, hidden `hr`, and `.mc-problem-index`
  jump list). `theme/head.hbs` injects the class + jump list, but its regex currently only
  matches `/react/machine-coding/`.
- `mdbook build` is slow and warns the search index is ~98 MB (pre-existing; 1,141 pages).
- Static preview: `python3 -m http.server 8899 --directory book` (port 8765 was occupied
  on this machine; pick a free port). There is **no desktop browser connected** in this
  session, so verify via generated HTML/CSS + `node` against `book/highlight.js` rather
  than screenshots.

### Git state (as of handoff)
- Working tree has uncommitted work: the new `src/javascript/coding-questions.md`,
  `docs/superpowers/handoff-js-coding/`, and (from a prior unrelated task) possibly
  middleware/password-gate files already committed in `fbbdfe3`/`8a42308`.
- Last commits on `master`: `8a42308` (React machine-coding revamp) and `fbbdfe3`
  (Vercel Basic Auth gate). Deployed to prod via GitHub integration.
- **Do not commit until the user approves the phase.** When committing, stage explicit
  paths (never `git add -A`; `STUDY-BOOK-AGENT-PLAYBOOK*.md` and scratch files should not
  be committed unless intended).

---

## 4. Phase 1 plan — Coding Questions (do this first)

### 4.1 Final page files

Create under `src/javascript/coding-questions/`:

| File | Title (H1) | Problems |
|---|---|---|
| `01-strings.md` | Strings | 24 |
| `02-arrays.md` | Arrays | 32 |
| `03-array-polyfills.md` | Array Method Polyfills | 11 |
| `04-objects.md` | Objects | 20 |
| `05-functions-closures.md` | Functions & Closures | 16 |
| `06-debounce-throttle.md` | Debounce & Throttle | 13 |
| `07-this-call-bind-new.md` | this, call, apply, bind & new | 8 **(fragment done)** |
| `08-promises.md` | Promises | 23 |
| `09-async-await.md` | Async/Await Practical | 12 |
| `10-event-emitter-pubsub.md` | Event Emitter & Pub-Sub | 8 |
| `11-data-structures.md` | Data Structures | 13 |
| `12-iterators-generators.md` | Iterators & Generators | 7 |
| `13-serialization-parsing.md` | Serialization & Parsing | 8 |
| `14-browser-javascript.md` | Browser JavaScript | 16 |
| `15-utility-library.md` | Utility / Library Questions | 12 |

Exact problem lists per page are in **§8.1**.

### 4.2 Assembly model (important)

Subagents write **fragments containing only `##` problems** (no H1). The orchestrator then
writes a small **header file** per page (H1 + 2–4 sentence intro) and concatenates:

```bash
# header + one or more fragments -> final page
cat docs/superpowers/handoff-js-coding/headers/01-strings.md \
    docs/superpowers/handoff-js-coding/parts/01-strings.a.md \
    docs/superpowers/handoff-js-coding/parts/01-strings.b.md \
  > src/javascript/coding-questions/01-strings.md
```

Header template (keep to ~4 lines):

```markdown
# Strings

<2–4 sentences: what this page covers and the patterns it teaches.>

---
```

(One `---` at the top of the page is fine as a separator; do NOT put `---` between problems.)

Suggested fragment split for large pages (keeps each subagent bounded, ~8–12 problems):

| Page | Fragments |
|---|---|
| 01 strings | `01-strings.a.md` (reverse/palindrome/frequency), `.b.md` (compression/parsing) |
| 02 arrays | `.a` `.b` `.c` (~11/11/10) |
| 03 polyfills | `.a` (iteration methods), `.b` (reduce/flat/flatMap/includes) |
| 04 objects | `.a` `.b` |
| 05 functions | `.a` `.b` |
| 06 debounce/throttle | `.a` (debounce), `.b` (throttle) |
| 07 this/bind | single (ALREADY DONE) |
| 08 promises | `.a` `.b` `.c` |
| 09 async | `.a` `.b` |
| 10 emitter | single |
| 11 data structures | `.a` `.b` |
| 12 iterators | single |
| 13 serialization | single |
| 14 browser | `.a` `.b` |
| 15 utility | `.a` `.b` |

Put fragments in `docs/superpowers/handoff-js-coding/parts/` and headers in
`docs/superpowers/handoff-js-coding/headers/`. The temp scratch originals are at
`/private/var/folders/yw/fxb37zcs5tx_839zp1yj7zfc0000gn/T/opencode/js-coding/` but treat the
in-repo `docs/superpowers/handoff-js-coding/` copies as canonical (temp may be wiped).

### 4.3 Subagent dispatch instructions

For each fragment, dispatch `subagent` (agent: `general`) with a prompt like:

```
You are writing one page fragment for a JavaScript interview-prep book written in mdBook.

FIRST read the generation brief in full:
docs/superpowers/handoff-js-coding/BRIEF.md
Also skim the verified exemplar:
docs/superpowers/handoff-js-coding/07-this-call-bind-new.md

Then WRITE ONLY the file:
docs/superpowers/handoff-js-coding/parts/<FRAGMENT-FILENAME>

It must contain exactly these problems, each as a `## ` heading, in this order, each using
the full per-problem template from the brief (Problem, Examples, Approach, Implementation,
Walkthrough, Complexity, Edge Cases, Interview Follow-ups, Common Mistakes, Takeaway):

<numbered problem list>

Rules: no H1, do not number headings, no `---` between problems, ```javascript fences,
`Difficulty:`/`Probability:` tag line right after each `##` heading. ~70–140 lines/problem.
High quality, no padding. Reply with the file path and line count.
```

Run in batches of ~5–6 (foreground is simplest; background also works if you keep working
on headers/SUMMARY meanwhile). **Verify each fragment's heading structure before
assembling** — `grep -n '^## ' parts/<fragment>` should show the exact expected count and
each problem should contain all 10 `###` headings.

### 4.4 Theme change (small)

In `theme/head.hbs`, the `initMachineCoding` function currently starts with:

```js
if (!/\/react\/machine-coding\//.test(window.location.pathname)) return;
document.documentElement.classList.add("machine-coding");
```

Generalize the regex to also match the JS pages, e.g.:

```js
if (!/\/(react\/machine-coding|javascript\/coding-questions)\//.test(window.location.pathname)) return;
document.documentElement.classList.add("machine-coding");
```

Reusing the `machine-coding` class means no CSS changes are required. (Optionally rename
the class to something neutral like `problem-bank` and update `theme/custom.css` +
the regex, but that also touches the already-merged React pages — only do it if you update
both places.)

Also consider changing the jump-list label text "Problems on this page" — it is generic
enough to reuse as-is.

### 4.5 SUMMARY.md + legacy stubs

Current JS SUMMARY block (around lines 37–200) has:

```
- [JavaScript](javascript/index.md)
  - [JavaScript Concept Pages](javascript/concepts/index.md)   <-- KEEP (theory)
    ...
  - [Legacy Chapters & Practice](javascript/core-concepts.md)
    - [Prototypes & Loops](javascript/prototypes-loops.md)
    - [ES6 & Modern JavaScript](javascript/es6-modern.md)
    - [Browser, DOM & Performance](javascript/browser-dom-perf.md)
    - [Coding Problems](javascript/coding-problems.md)          <-- REPLACE
    - [Output Questions – Part 1](javascript/output-questions.md) <-- REPLACE (+ its part-1 children)
    - [Polyfills](javascript/polyfills.md)                      <-- REPLACE (migrate into 03)
    - [Output Questions – Part 2](javascript/output-questions-2.md) <-- REPLACE (+ part-2 children)
    - [Output Questions – Part 3](javascript/output-questions-3.md) <-- REPLACE
```

Plan:
1. Add a new tree under JavaScript:
   ```
   - [JavaScript Coding Interview Guide](javascript/coding-questions.md)
     - [Strings](javascript/coding-questions/01-strings.md)
     - [Arrays](javascript/coding-questions/02-arrays.md)
     ... (all 15 for now; 16–26 added in later phases)
   ```
   Place it right after the theory chapters (before or replacing the legacy "Coding" block).
2. Remove the legacy coding entries (`coding-problems.md`, `output-questions*.md`,
   `polyfills.md`, and the `output-questions/part-*` children) from SUMMARY.
3. To preserve old URLs, **turn the legacy files into redirect stubs** and KEEP their
   SUMMARY entries (a stub page is cheap and avoids 404s). Stub content:

   ```markdown
   # Moved

   This page has been reorganised. See [JavaScript Coding Interview Guide](coding-questions.md).

   <meta http-equiv="refresh" content="0; url=./coding-questions.html">
   ```

   For the `output-questions/part-N/*.md` lessons, redirect each to the relevant guess-the-output
   page (Phase 2) or delete them once their unique content is migrated.

   Which legacy content to migrate:
   - `polyfills.md` (good quality) → page 03 (array polyfills) and 07/08 (bind/promise polyfills).
   - `coding-problems.md` (03 L1712–2190) → distributed into pages 01/02/04.
   - `output-questions.md`, `output-questions-2.md`, `output-questions-3.md`, and the
     `output-questions/part-1..3/` lessons → Part 2 guess-the-output pages, reorganised by
     topic (not by "part").

> Note: the actual source of the `{{#include}}` slices is at repo root:
> `03-javascript-coding-problems.md` and `06-javascript-coding-DSA-problems.md`. Those root
> files are OUTSIDE `src/` and are not built by mdBook; only the `src/javascript/*.md`
> include wrappers are. Don't delete the root files.
>
> `src/dsa/*` (built from `06`) already overlaps with pure algorithm drills. Keep DSA as
> the algorithmic reference; the JS coding pages should cross-link to DSA where a problem
> is really an algorithm drill, and focus their depth on JS-specific behaviour.

### 4.6 Verification for Phase 1

```bash
cd /Users/ranjeetharishchandre/Documents/Personal/frontend-interview-preparation
mdbook build 2>&1 | tail -3                 # expect only the large-search-index warning
grep -rl 'language-tsx' book/ | wc -l        # expect 0
printf 'js pages built: '; ls book/javascript/coding-questions/ | wc -l
grep -c 'machine-coding' book/theme/head.hbs  # sanity
git diff --check                             # expect clean
```

Then start the static server and (if a browser tool is available) check one page:
`python3 -m http.server 8899 --directory book` and open
`http://localhost:8899/javascript/coding-questions/01-strings.html`.
If no desktop browser: verify statically (heading counts, `language-javascript` present,
`initMachineCoding` regex updated) and with `node` against `book/highlight.js`:

```bash
node -e 'const h=require("./book/highlight.js");const hl=h.default||h;
console.log((hl.highlight("javascript","const x = 1; // hi").value.match(/hljs-/g)||[]).length);'
```

### 4.7 Commit + checkpoint

After build passes and the user has reviewed, commit Phase 1 (ask first):

```bash
git add src/javascript/coding-questions.md src/javascript/coding-questions \
        src/SUMMARY.md theme/head.hbs theme/custom.css \
        src/javascript/<legacy-stub-files> docs/superpowers/handoff-js-coding
git commit -m "docs(javascript): rebuild coding section — Part 1 coding questions"
git push origin master
```

Then **stop and ask the user to review before Phase 2.** Do not start Phase 2 unrequested.

---

## 5. Phase 2 plan — Guess the Output

Create pages under the same directory:

| File | Topic | Spec section |
|---|---|---|
| `16-guess-scope-hoisting.md` | `var`/`let`/`const`, scope, hoisting, function hoisting | Part 2 §1–2 (Q1–12) |
| `17-guess-closures.md` | Closures + loop closures | §3 (Q13–16) |
| `18-guess-this.md` | `this` binding, call/apply/bind | §4–5 (Q17–25) |
| `19-guess-coercion.md` | Primitive vs reference, equality, coercion | §6–7 (Q26–38) |
| `20-guess-types.md` | `typeof`, `NaN`, numbers, objects as keys | §8–11 (Q39–46) |
| `21-guess-objects-arrays.md` | property order, destructuring, defaults, spread, delete, array mutation, map/filter/reduce, sort, Set/Map | §12–20 (Q47–66) |
| `22-guess-prototypes-classes.md` | prototypes, inheritance, classes | §21–22 (Q67–71) |
| `23-guess-promises.md` | async/await, promise chaining, finally, executor, error handling | §26–31 (Q78–90) |
| `24-guess-event-loop.md` | event loop basics, nested microtasks, `queueMicrotask`, async+timer, **§47 combined challenges (≥5)** | §23–27 + §47 (Q72–77, 81) |
| `25-guess-misc.md` | short-circuit, optional chaining, increment/assignment, function args/`arguments`, function names/recursion, descriptors, freeze/seal/preventExtensions, sparse arrays, `for...in`/`for...of`, const refs, circular refs, Date, modules | §32–46 (Q91–120) |

**Guess-the-output template** (per question). Each question is an `##` heading too, and the
page gets auto-numbered. Suggested subsections:

```
## <one-line description of the trap>

`Difficulty: Easy|Medium|Hard` `Probability: ...`

### The Code
```javascript
<the exact snippet>
```

### Output
```text
<exact output, one line per console.log>
```

### Explanation
<mechanically why, step by step — not just "because hoisting">

### The Rule
<name the language rule: TDZ, implicit binding, ToPrimitive, SameValueZero, ...>

### How to Rewrite It Safely
<if the behaviour is surprising, show the safer version>

### Takeaway
<one or two sentences>
```

**Mandatory for every event-loop question** — show the full trace explicitly:

```
1. synchronous execution
2. call stack
3. scheduled microtasks
4. scheduled macrotasks
5. microtask execution order
6. next macrotask
7. final output
```

The user's rule: *"For every Guess-the-Output problem, the answer page should explain the
execution mechanically rather than only printing the final result."*

> **Where the code snippets come from:** the original user prompt contains the exact
> snippets (Q1–Q120) and the combined event-loop challenge. If the verbatim prompt is
> available, reproduce those snippets exactly. Otherwise use the standard, well-known
> snippet for each topic (the snippets are conventional interview puzzles). The section
> list in **§8.2** tells you which question numbers map to which topic.

---

## 6. Phase 3 plan — Debugging Challenges

One page: `src/javascript/coding-questions/26-debugging.md`, 15 problems.

Template per problem (brief, since these are "find the bug"):

```
## <Bug name>

`Difficulty: ...` `Probability: ...`

### The Broken Code
```javascript
<exact broken snippet>
```

### What's Wrong
<the bug, precisely: stale closure / lost this / mutation / missing await / race /
leak / coercion / sort comparator>

### The Fix
```javascript
<corrected code>
```

### Why It Works
<one paragraph>

### How You'd Catch It
<the test / DevTools technique / code review smell>

### Takeaway
<one sentence>
```

The 15 challenges (code snippets in **§8.3**): closure bug in `for (var)`, lost `this` in
`setTimeout`, shallow-copy bug, `forEach(async …)`, sequential-but-independent awaits,
unhandled promise rejection, search race condition, memory leak (listeners/timers/
observers), mutation bug, wrong array sort, `map(parseInt)`, floating-point money bug,
forgotten `return` in a `.then()`, missing `await`, unhandled rejection path.

After Phase 3, extend the landing page's Part 2 / Part 3 sections with real links and
tables, and add the new pages to `SUMMARY.md`.

---

## 7. House rules recap (full detail in BRIEF.md)

- Output markdown only; `##` problems, no H1 in fragments, **do not number headings**.
- No `---` between problems.
- Tag line immediately after each `##`: `` `Difficulty: X` `Probability: Y` ``.
- Fences: ``` ```javascript ``` for code, ``` ```text ``` for output, ``` ```html ``` for HTML.
- Use `// => result` comments to show concrete outputs.
- State the **contract** before code (`this`, callback args, holes, ordering, mutation,
  NaN/`SameValueZero`, async scheduling, host-API limits).
- Cover empty/single/null/undefined/NaN/holes/large/Unicode/float/mutation/rejection as
  applicable; be honest when something cannot be truly polyfilled.
- No library shortcuts in the core answer.
- Each problem ~70–140 lines (hard/Must-Master can be longer). No padding.

---

## 8. The problem bank (from the user's original prompt)

### 8.1 Part 1 — JavaScript Coding Questions (15 categories)

**1. Strings (→ `01-strings.md`, 24):** reverse without `reverse`; reverse each word keeping
order; reverse word order; palindrome; anagrams; first non-repeating char; first repeating
char; count char occurrences; most frequent char; remove duplicate chars; compress
(`aaabbccccd`→`a3b2c4d1`); expand (`a3b2c4`→`aaabbcccc`); longest substring without repeats;
all duplicate chars; longest common prefix; rotation check; capitalize each word;
camelCase→snake_case; snake_case→camelCase; template interpolator
(`template("Hello {{name}}", {name:"John"})`); truncate with ellipsis; count words without
`split(" ")`; balanced parentheses/brackets; decode nested `3[a2[c]]`→`accaccacc`.

**2. Arrays (→ `02-arrays.md`, 32):** remove duplicates; dedupe objects by property; find
duplicates; intersection; union; difference; symmetric difference; second largest;
kth largest; move zeros to end; rotate left by k; rotate right by k; chunk; flatten
recursive; flatten to depth; find missing numbers; pairs summing to target; unique pairs
summing to target; max subarray sum; merge two sorted arrays; sort without `.sort()`;
shuffle; Fisher–Yates; partition by predicate; group by property; index array by id;
frequency of all elements; most frequent element; pagination; sliding-window chunks;
remove falsy without `filter(Boolean)`; random N unique elements.

**3. Array Method Polyfills (→ `03-array-polyfills.md`, 11):** `map`; `filter`; `reduce`;
`forEach`; `find`; `findIndex`; `some`; `every`; `flat`; `flatMap`; `includes`. Edge cases:
sparse arrays; `reduce` initial value; callback arguments; `thisArg`; empty arrays.

**4. Objects (→ `04-objects.md`, 20):** deep clone; deep equality; deep merge; flatten
nested object (`{user:{address:{city:"Pune"}}}`→`{"user.address.city":"Pune"}`); unflatten;
deeply remove a property; deeply rename keys; `get(obj,"user.address.city")`; `set(obj,
"user.address.city","Pune")`; `has(obj, path)`; pick; omit; invert; group by key;
`Object.groupBy` equivalent; compare two objects → changed properties; deep diff;
deep freeze; safe clone of cyclic objects; recursive object transformation.

**5. Functions & Closures (→ `05-functions-closures.md`, 16):** counter via closure;
counter object (`increment/decrement/reset/value`); `once`; memoization; memoization
multi-arg; memoization with object args; memoization with cache expiry; currying
(`sum(1)(2)(3)`); infinite currying (`sum(1)(2)(3)(4)()`); mixed currying
(`sum(1,2)(3)(4,5)()`); `compose`; `pipe`; partial application; function chaining;
chainable calculator (`calculator(10).add(5).multiply(2).subtract(4).value()`); cache by
argument combination.

**6. Debounce & Throttle (→ `06-debounce-throttle.md`, 13):** basic debounce; debounce with
args; debounce preserving `this`; debounce immediate/leading; debounce leading+trailing;
`debounced.cancel()`; `debounced.flush()`; basic throttle; throttle preserving args/`this`;
leading throttle; trailing throttle; leading+trailing throttle; throttle cancel.
**(Extremely important frontend questions — give extra care.)**

**7. this, call, apply, bind & new (→ `07-this-call-bind-new.md`, 8):** custom
`Function.prototype.call`; custom `apply`; custom `bind`; custom `bind` + `new`; custom
`new`; custom `instanceof`; permanently bound context; borrow a method without `bind`.
**(DONE — fragment at `docs/superpowers/handoff-js-coding/07-this-call-bind-new.md`.)**

**8. Promises (→ `08-promises.md`, 23):** basic Promise-like class; `Promise.all`;
`allSettled`; `race`; `any`; `Promise.resolve`; `Promise.reject`; `sleep(1000)`;
callback→Promise; `promisify`; retry; retry with delay; exponential backoff; `withTimeout`;
sequential; parallel; max concurrency N; Promise queue; cancel obsolete async requests;
deduplicate identical concurrent requests; cache Promise results; async polling; poll until
condition.

**9. Async/Await Practical (→ `09-async-await.md`, 12):** fetch two APIs concurrently; fetch
B only after A succeeds; several endpoints with acceptable failures; retry only failed
requests; 100 URLs with max 5 concurrent; preserve original order despite completion order;
stop on first failure; continue despite failures; cancellable via `AbortController`;
prevent stale search results; async batching; request deduplication.

**10. Event Emitter / Pub-Sub (→ `10-event-emitter-pubsub.md`, 8):** EventEmitter with
`on`/`emit`/`off`; add `once`; multiple listeners; remove all listeners; namespaces;
wildcard subscriptions; basic pub/sub; observable-style subscription API.

**11. Data Structures (→ `11-data-structures.md`, 13):** Stack; Queue; Queue from two
stacks; Circular Queue; Priority Queue; Linked List; Doubly Linked List; Hash Map; Set;
LRU Cache; TTL Cache; Trie; Min/Max Heap. *(Frontend priority: Queue, Stack, Map, Set, LRU,
Trie.)*

**12. Iterators & Generators (→ `12-iterators-generators.md`, 7):** custom iterable object;
`[Symbol.iterator]`; `range(1,5)` iterator; infinite sequence generator; Fibonacci
generator; lazy traversal of nested data; chunk processing with generators.

**13. Serialization / Parsing (→ `13-serialization-parsing.md`, 8):** simplified
`JSON.stringify`; simplified `JSON.parse`; serialize nested query params; parse query params
(`?name=ranjeet&page=2`); object→query string; parse CSV-like data; serialize cyclic
objects safely; URL parser using standard APIs.

**14. Browser JavaScript (→ `14-browser-javascript.md`, 16):** event delegation; detect
click outside; DOM traversal; simple DOM selector; infinite scroll with
`IntersectionObserver`; lazy-load images; scroll throttling; resize debouncing;
`localStorage` save/restore; `localStorage` with TTL; cross-tab sync via `storage` event;
cross-tab via `BroadcastChannel`; copy-to-clipboard; drag-and-drop ordering; keyboard
shortcuts; online/offline detection.

**15. Utility / Library Questions (→ `15-utility-library.md`, 12):** lodash-like `get`;
`set`; `once`; `memoize`; `cloneDeep`; `isEqual`; `groupBy`; `chunk`; `flatten`; `uniq`;
`debounce`; `throttle`. *(These deliberately overlap pages 01–06/04; treat this page as the
"lodash-shaped" framing and cross-link rather than duplicating in full.)*

### 8.2 Part 2 — Guess the Output (topic → question numbers)

Exact snippets were in the user's prompt. Topic sections:

1. `var`/`let`/`const`, scope & hoisting (Q1–8): `var` before decl → `undefined`; `let`
   before decl → TDZ `ReferenceError`; `var` shadowing; block scope + `let` TDZ; `var` in
   block leaks; `let` in block doesn't; `var` in `if` inside function; `let` in `if` then
   read outside → `ReferenceError`. Covers function scope, block scope, hoisting, TDZ,
   shadowing, illegal shadowing.
2. Function hoisting (Q9–12): `foo()` before function declaration → works; before `var`
   expression → `TypeError: foo is not a function`; before `let` expression →
   `ReferenceError`; function declaration + `var` same name.
3. Closures (Q13–16): two independent counters; `for (var i)` + `setTimeout` → `3 3 3`;
   `for (let i)` → `0 1 2`; IIFE fix. **These three must be understood together.**
4. `this` (Q17–22): method call; nested normal function (default/global `this`); arrow
   inner (lexical `this`); arrow method (lexical → module/global); method extraction →
   `this` lost; `.bind(obj)` restores. Covers implicit/default/explicit binding, lexical
   `this`, extraction, `bind`, arrows.
5. call/apply/bind (Q23–25): `print.call(person)` / `print.apply(person)`; `bind` with
   preset arg; `bind` + `new` (bound `thisArg` ignored; `obj.value` unchanged, instance
   value set).
6. Primitive vs reference (Q26–29): value copy; object alias; shallow spread top-level
   copy; shallow spread nested mutation. Shallow vs deep.
7. Equality & coercion (Q30–38): `0==false`/`0===false`; `""==false`/`""===false`;
   `null==undefined`/`null===undefined`; `[]==false`/`[]===false`; `[] == ![]`;
   `"5"+2` vs `"5"-2` vs `"5"*2`; `true+true`, `true+false`; `null+1`, `undefined+1`;
   `[]+[]`, `[]+{}`, `{}+[]` (explain parsing context, don't memorise the last blindly).
8. `typeof` (Q39–40): `typeof null` → `"object"`, undefined, [], {}, function; `typeof NaN`
   → `"number"`, Infinity.
9. `NaN` (Q41–42): `NaN===NaN` false, `Object.is(NaN,NaN)` true, `Number.isNaN(NaN)` true;
   `Number.isNaN("hello")` false vs `isNaN("hello")` true.
10. Numbers (Q43–45): `0.1+0.2===0.3` false; `1+"2"+3` vs `1+2+"3"`; unary `+true`,
    `+false`, `+""`, `+"123"`.
11. Objects as keys (Q46): two different objects collide as `"[object Object]"`; compare
    with `Map`.
12. Property ordering (Q47): integer-like keys sorted ascending before string keys.
13. Destructuring (Q48–50): default only applies to `undefined`, not `null`; array holes.
14. Default parameters (Q51): `test()`, `test(undefined)`, `test(null)`.
15. Spread/rest (Q52–53): array spread is a copy; nested object spread shares reference.
16. `delete` (Q54–55): `delete obj.a` returns `true`, property gone; `delete arr[1]`
    leaves a hole, length unchanged.
17. Array mutation (Q56–58): `push` returns new length; `splice` mutates and returns removed;
    `slice` doesn't mutate.
18. map/filter/reduce (Q59–62): arrow with braces and no return → `[undefined,…]`; filter
    truthiness; `["1","2","3"].map(parseInt)` → `[1,NaN,NaN]` (**must include**); `reduce`
    without initial value; empty array without initial → `TypeError`.
19. Sorting (Q63–64): default `.sort()` is lexicographic → `[1,10,2,20]`; numeric comparator.
20. Set & Map (Q65–66): `Set` dedupes; `Map` distinguishes object keys (vs §11).
21. Prototypes (Q67–69): prototype method lookup; `person.__proto__ === Person.prototype`;
    `Object.create` inheritance + own-property shadowing.
22. Classes (Q70–71): `super()` then field override; static field vs instance field.
23. Event loop basics (Q72–74): `A C B`; promise microtask before sync end? (Q73 `A C B`);
    sync → microtask → macrotask (`A D C B`).
24. Nested microtasks (Q75–76): chains drain fully before timers.
25. `queueMicrotask` (Q77): microtask FIFO order.
26. async/await (Q78–80): `C A D B`; async function returns a Promise; `throw` becomes
    rejection.
27. async/await + Promise + timer (Q81): `1 3 6 4 5 2` style ordering. *Appear multiple
    times with increasing difficulty.*
28. Promise chaining (Q82–85): value threads through `.then` return; missing return →
    `undefined`; throw → catch → recover → next `.then`; returning a rejected promise.
29. `finally` (Q86–87): `finally` doesn't transform value; runs on both paths.
30. Promise constructor (Q88): executor runs synchronously (`A C D B`).
31. Error handling (Q89–90): try/catch/finally order; `finally` `return` overrides `try`.
32. Short-circuiting (Q91–92): `0||"A"`, `0??"A"`, `null||"A"`, `null??"A"`;
    `false&&"A"`, `true&&"A"`.
33. Optional chaining (Q93–94): `obj.user?.address?.city` → undefined; `obj.fn?.()` → undefined.
34. Increment operators (Q95–96): post/pre; `x++ + ++x` evaluation order.
35. Assignment operators (Q97): `a += a++` — *use sparingly; explain order, not trivia.*
36. Function arguments (Q98–100): primitive passed by value; object reference mutated;
    reassigning the parameter doesn't affect caller.
37. Parameters & `arguments` (Q101–102): `arguments.length`; normal vs arrow (`arguments`,
    `this`, `new`, `prototype`).
38. Function names & recursion (Q103): named function expression name only visible inside.
39. Property descriptors (Q104): `defineProperty` defaults (`writable/enumerable/
    configurable` all false); not in `Object.keys`.
40. freeze/seal/preventExtensions (Q105): add/delete/modify behaviour; shallow.
41. Sparse arrays (Q106–107): `new Array(3)` length; `map` skips holes; `Array(3)` vs
    `Array.from({length:3})` vs `[undefined,undefined,undefined]`.
42. `for...in` vs `for...of` (Q108): indices (strings) vs values.
43. const object references (Q109): mutate contents OK; reassign throws.
44. Circular references (Q110): `JSON.stringify` throws `TypeError`; how to serialise safely.
45. Date/time pitfalls (Q111–114): `Date` mutable; parsing format/time-zone dependent;
    compare timestamps; `new Date("2026-01-01")` vs `new Date(2026,0,1)`. *Don't over-invest.*
46. Modules (Q115–120): live bindings; default vs named; module scope; strict mode; circular
    deps; dynamic `import()`.
47. **Event loop combined challenge:** at least **5 harder** questions mixing
    `console.log`, `setTimeout`, `Promise`, `queueMicrotask`, `async`, `await`, nested
    promises. Example given in the prompt uses `start`, `timeout`, `promise-1`,
    `queueMicrotask` → `microtask`, `promise-2`, `async-1`, `async-2`, `end`. The student
    must build call stack / microtask queue / macrotask queue / output before checking.

### 8.3 Part 3 — Debugging Challenges (→ `26-debugging.md`, 15)

1. **Closure bug:** `for (var i=0;i<3;i++){ setTimeout(()=>console.log(i),100) }` → fix.
2. **Lost `this`:** `user.print()` uses `setTimeout(function(){ console.log(this.name) })`.
3. **Shallow copy bug:** `const copy = {...original}; copy.user.address.city = "Pune"`.
4. **Async `forEach`:** `items.forEach(async item => { await process(item) }); console.log("done")`.
5. **Sequential vs parallel:** three independent `await fetchX()` calls.
6. **Promise error handling:** an error not handled as expected.
7. **Race condition:** search `r`/`re`/`rea`/`reac`/`react`; stale response overwrites newer.
8. **Memory leak:** unremoved listeners/timers/subscriptions/observers.
9. **Mutation bug:** code accidentally mutating the original array/object.
10. **Wrong sort:** `[100,2,30,4].sort()`.
11. **`map(parseInt)`:** `["10","10","10"].map(parseInt)`.
12. **Floating point:** `0.1+0.2` in a money calculation.
13. **Incorrect promise chain:** `.then()` callback forgets to return value/promise.
14. **Missing `await`:** result is a Promise instead of the value.
15. **Unhandled rejection:** failure path not handled.

---

## 9. Final coverage checklist (from the prompt — verify the book covers all)

- **Language:** `var`, `let`, `const`, scope, lexical scope, hoisting, TDZ, closures,
  shadowing.
- **Functions:** declarations, expressions, arrows, callbacks, higher-order, currying,
  composition, recursion, closures.
- **`this`:** default/implicit/explicit binding, `call`, `apply`, `bind`, arrow lexical
  `this`, constructor/`new`.
- **Types:** primitive/reference, coercion, equality, `typeof`, `NaN`, null/undefined,
  truthy/falsy.
- **Objects:** prototypes, inheritance, descriptors, cloning, deep equality, property
  lookup, spread, destructuring, freeze/seal.
- **Arrays:** mutation, iteration, map/filter/reduce, sort, sparse arrays, flattening.
- **Async:** Promise, `.then`/`.catch`/`.finally`, async/await, microtasks, macrotasks,
  event loop, timers, `queueMicrotask`, concurrency, race conditions, cancellation, retries.
- **Browser:** events, delegation, localStorage, `IntersectionObserver`, `AbortController`,
  `BroadcastChannel`, DOM.
- **Data structures:** Map, Set, WeakMap/WeakSet concepts, Queue, Stack, Cache.
- **Advanced patterns:** debounce, throttle, memoization, currying, compose/pipe,
  EventEmitter, Promise polyfills, array polyfills, deep clone, flatten/unflatten,
  concurrency limiter, LRU cache.
- **Debugging:** stale closure, wrong `this`, mutation, Promise mistakes, async iteration
  mistakes, race conditions, memory leaks, coercion mistakes.

---

## 10. Recommended book structure (target)

```text
JavaScript
│
├── Theory                                  (existing concepts/ + theory chapters — keep)
│
├── Coding Questions                        (src/javascript/coding-questions.md + 15 pages)
│   ├── Strings & Arrays                    (01, 02)
│   ├── Objects                             (04)
│   ├── Functions                           (05)
│   ├── Polyfills                           (03)
│   ├── Async / Promises                    (08, 09)
│   ├── Browser APIs                        (14)
│   └── Advanced Utilities                  (06, 07, 10, 11, 12, 13, 15)
│
├── Guess the Output                        (16–25)
│   ├── Scope & Hoisting · Closures · this
│   ├── Coercion · Objects & References · Prototypes · Arrays
│   └── Promises · Event Loop
│
└── Debugging Challenges                    (26)
```

For coding questions use: Problem → examples → approach → implementation → walkthrough →
complexity → edge cases → follow-ups → common mistakes.
For guess-the-output: output → why → rule → safe rewrite; event loop always with the
7-step trace.
For debugging: broken code → what's wrong → fix → why → how you'd catch it.

---

## 11. Kickoff prompt for the next agent (copy/paste)

> Continue the JavaScript coding-section revamp. Read
> `JAVASCRIPT-CODING-REVAMP-HANDOFF.md` (repo root) in full, then read
> `docs/superpowers/handoff-js-coding/BRIEF.md` and the exemplar
> `docs/superpowers/handoff-js-coding/07-this-call-bind-new.md`.
>
> Start with **Phase 1**. Generate the remaining 14 coding pages by dispatching subagents
> per fragment as described in §4.3 (page `07` is already done as a fragment). Write the
> per-page headers, assemble the final pages into `src/javascript/coding-questions/`,
> update `theme/head.hbs` so the `machine-coding` class + jump list also apply on
> `/javascript/coding-questions/`, update `SUMMARY.md`, turn the legacy coding/output pages
> into redirect stubs (migrating their unique content), then run the §4.6 verification and
> `mdbook build`.
>
> Do **not** commit until the user reviews. After Phase 1 is approved, commit and push, then
> stop for the user before starting Phase 2.
