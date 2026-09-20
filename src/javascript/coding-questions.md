# JavaScript Coding Interview Guide

> **Goal:** If you can independently solve and *explain* every problem in this section, your JavaScript interview coverage is strong enough for frontend and full-stack interviews.
>
> This is a **practice bank and pattern library**, not a list of snippets to memorise. Every problem teaches one reusable idea, and every implementation is small enough to reproduce from scratch in an interview.

JavaScript interviews ask two practical things beyond theory:

1. **Can you build it?** — write the function, the polyfill, the utility, the async helper.
2. **Can you read it?** — predict the output and explain the exact rule behind it.

This section is organised around those two skills, plus a third that experienced interviewers lean on: **can you debug it?**

| Part | What it is | Pages |
|---|---|---|
| [Part 1 — Coding Questions](#part-1-coding-questions) | Implement the function from scratch | `coding-questions/01`–`15` |
| [Part 2 — Guess the Output](#part-2-guess-the-output) | Predict output and explain the rule | `coding-questions/16`–`25` |
| [Part 3 — Debugging](#part-3-debugging-challenges) | Find and fix the bug | `coding-questions/26` |

## How to use this section

1. Start with the **Must Master** checklist and work top-down.
2. Open the page for the pattern you are practising.
3. Read the **Problem** and **Examples**, then cover the screen and attempt it yourself.
4. Compare against **Implementation**, then read **Walkthrough** and **Complexity**.
5. Read **Edge Cases**, **Interview Follow-ups**, and **Common Mistakes** out loud.
6. Rebuild it from scratch a day later. If you can explain *why* it works, move on.

### Difficulty and probability markers

| Marker | Meaning |
|---|---|
| `Difficulty: Easy` | Reproducible in about 10 minutes. |
| `Difficulty: Medium` | 20–30 minutes; the realistic interview bar. |
| `Difficulty: Hard` | 40+ minutes; senior / deep-dive. |
| `Probability: Very High` | Asked constantly in JavaScript interviews. |
| `Probability: High` | Common. |
| `Probability: Medium` | Appears in product-focused or senior loops. |
| `Probability: Low` | Rare, but teaches a useful pattern. |

Probability describes how useful the pattern is in a real interview, not a statistical claim.

### The structure of every coding problem

Each guided problem follows the same order so you can study quickly:

1. **Problem** — what to implement and the exact contract.
2. **Examples** — inputs and outputs, including one non-trivial case.
3. **Approach** — the plan and the invariants, before any code.
4. **Implementation** — a complete, runnable solution.
5. **Walkthrough** — the code traced on a real input.
6. **Complexity** — time and space, stated plainly.
7. **Edge Cases** — the inputs that break naive solutions.
8. **Interview Follow-ups** — the natural harder questions.
9. **Common Mistakes** — what interviewers actually see.
10. **Takeaway** — the one sentence to remember.

The goal is coverage of the *pattern*, so follow-ups and edge cases carry as much weight as the code.

### Two rules that shape this section

- **Explain the contract before the code.** Every built-in has a precise contract (`this`, callback arguments, sparse arrays, ordering, `SameValueZero`). Naming it is the difference between a candidate who copied a loop and one who understands the API.
- **No library shortcuts.** Core logic uses the language and browser APIs only. Lodash, Redux, and other libraries appear in follow-ups to discuss how production code would differ — never as the answer.

---

## Part 1: Coding Questions

## Must Master Before a JavaScript Interview

If time is short, master these first. Each links to the page that teaches it.

- [ ] Reverse a string without using `reverse()` — [Strings](coding-questions/01-strings.md)
- [ ] Check whether a string is a palindrome — [Strings](coding-questions/01-strings.md)
- [ ] Find the first non-repeating character — [Strings](coding-questions/01-strings.md)
- [ ] Count character frequency — [Strings](coding-questions/01-strings.md)
- [ ] Remove duplicates from an array — [Arrays](coding-questions/02-arrays.md)
- [ ] Flatten a nested array — [Arrays](coding-questions/02-arrays.md)
- [ ] Implement custom `map` — [Array Method Polyfills](coding-questions/03-array-polyfills.md)
- [ ] Implement custom `filter` — [Array Method Polyfills](coding-questions/03-array-polyfills.md)
- [ ] Implement custom `reduce` — [Array Method Polyfills](coding-questions/03-array-polyfills.md)
- [ ] Implement `Array.prototype.flat` — [Array Method Polyfills](coding-questions/03-array-polyfills.md)
- [ ] Implement debounce — [Debounce & Throttle](coding-questions/06-debounce-throttle.md)
- [ ] Implement throttle — [Debounce & Throttle](coding-questions/06-debounce-throttle.md)
- [ ] Implement memoization — [Functions & Closures](coding-questions/05-functions-closures.md)
- [ ] Implement currying — [Functions & Closures](coding-questions/05-functions-closures.md)
- [ ] Implement `compose` — [Functions & Closures](coding-questions/05-functions-closures.md)
- [ ] Implement `pipe` — [Functions & Closures](coding-questions/05-functions-closures.md)
- [ ] Deep clone an object — [Objects](coding-questions/04-objects.md)
- [ ] Deep equality comparison — [Objects](coding-questions/04-objects.md)
- [ ] Implement `Object.groupBy` — [Objects](coding-questions/04-objects.md)
- [ ] Convert nested object into flat object — [Objects](coding-questions/04-objects.md)
- [ ] Convert flat object into nested object — [Objects](coding-questions/04-objects.md)
- [ ] Implement `Promise.all` — [Promises](coding-questions/08-promises.md)
- [ ] Implement `Promise.allSettled` — [Promises](coding-questions/08-promises.md)
- [ ] Implement `Promise.race` — [Promises](coding-questions/08-promises.md)
- [ ] Implement `Promise.any` — [Promises](coding-questions/08-promises.md)
- [ ] Retry an asynchronous function — [Promises](coding-questions/08-promises.md)
- [ ] Implement timeout around a Promise — [Promises](coding-questions/08-promises.md)
- [ ] Implement concurrency-limited Promise execution — [Promises](coding-questions/08-promises.md)
- [ ] Implement `sleep` — [Promises](coding-questions/08-promises.md)
- [ ] Implement EventEmitter — [Event Emitter & Pub-Sub](coding-questions/10-event-emitter-pubsub.md)
- [ ] Implement `once` — [Functions & Closures](coding-questions/05-functions-closures.md)
- [ ] Implement `Function.prototype.call` — [this, call, apply, bind & new](coding-questions/07-this-call-bind-new.md)
- [ ] Implement `Function.prototype.apply` — [this, call, apply, bind & new](coding-questions/07-this-call-bind-new.md)
- [ ] Implement `Function.prototype.bind` — [this, call, apply, bind & new](coding-questions/07-this-call-bind-new.md)
- [ ] Implement the `new` operator — [this, call, apply, bind & new](coding-questions/07-this-call-bind-new.md)
- [ ] Implement `instanceof` — [this, call, apply, bind & new](coding-questions/07-this-call-bind-new.md)
- [ ] Implement an LRU Cache — [Data Structures](coding-questions/11-data-structures.md)
- [ ] Implement a simple pub/sub system — [Event Emitter & Pub-Sub](coding-questions/10-event-emitter-pubsub.md)
- [ ] Implement deep object `get(path)` — [Objects](coding-questions/04-objects.md)
- [ ] Implement deep object `set(path, value)` — [Objects](coding-questions/04-objects.md)

## Section index — Part 1: Coding Questions

| # | Page | Problems |
|---|---|---|
| 01 | [Strings](coding-questions/01-strings.md) | Reverse · reverse words · palindrome · anagrams · first non-repeating · first repeating · character frequency · most frequent · remove duplicates · compress · expand · longest unique substring · duplicate characters · longest common prefix · rotation check · title case · camel↔snake · template interpolation · truncate · count words · balanced brackets · decode `3[a2[c]]` |
| 02 | [Arrays](coding-questions/02-arrays.md) | Remove duplicates · dedupe by property · find duplicates · intersection · union · difference · symmetric difference · second largest · kth largest · move zeros · rotate left/right · chunk · flatten · flatten depth · missing numbers · two-sum pairs · unique pairs · max subarray · merge sorted · sort without `.sort()` · shuffle · Fisher–Yates · partition · group by · index by id · frequency · most frequent · pagination · sliding window · remove falsy · random N |
| 03 | [Array Method Polyfills](coding-questions/03-array-polyfills.md) | `map` · `filter` · `reduce` · `forEach` · `find` · `findIndex` · `some` · `every` · `flat` · `flatMap` · `includes` |
| 04 | [Objects](coding-questions/04-objects.md) | Deep clone · deep equal · deep merge · flatten · unflatten · deep delete · deep rename · `get` · `set` · `has` · `pick` · `omit` · `invert` · `groupBy` · `Object.groupBy` · diff · deep diff · deep freeze · cyclic clone · recursive transform |
| 05 | [Functions & Closures](coding-questions/05-functions-closures.md) | Counter · counter object · `once` · memoize · memoize multi-arg · memoize objects · memoize TTL · curry · infinite curry · mixed curry · `compose` · `pipe` · partial · chaining · chainable calculator · cache by arguments |
| 06 | [Debounce & Throttle](coding-questions/06-debounce-throttle.md) | Basic debounce · with args · preserve `this` · leading · leading + trailing · `cancel` · `flush` · basic throttle · with args/`this` · leading · trailing · leading + trailing · `cancel` |
| 07 | [this, call, apply, bind & new](coding-questions/07-this-call-bind-new.md) | `call` · `apply` · `bind` · bind + `new` · `new` · `instanceof` · permanent context · method borrowing |
| 08 | [Promises](coding-questions/08-promises.md) | Promise-like class · `all` · `allSettled` · `race` · `any` · `resolve` · `reject` · `sleep` · callback→Promise · `promisify` · retry · retry with delay · exponential backoff · `withTimeout` · sequential · parallel · concurrency limit · Promise queue · cancel obsolete · dedupe concurrent · cache results · polling · poll until |
| 09 | [Async/Await Practical](coding-questions/09-async-await.md) | Two APIs concurrently · dependent requests · tolerate failures · retry only failures · 100 URLs / 5 concurrent · preserve order · stop on failure · continue on failure · `AbortController` · prevent stale results · batching · deduplication |
| 10 | [Event Emitter & Pub-Sub](coding-questions/10-event-emitter-pubsub.md) | `on`/`emit`/`off` · `once` · multiple listeners · remove all · namespaces · wildcard · pub/sub · observable |
| 11 | [Data Structures](coding-questions/11-data-structures.md) | Stack · Queue · queue from two stacks · circular queue · priority queue · linked list · doubly linked list · hash map · set · LRU cache · TTL cache · trie · heap |
| 12 | [Iterators & Generators](coding-questions/12-iterators-generators.md) | Custom iterable · `[Symbol.iterator]` · `range` · infinite sequence · Fibonacci generator · lazy traversal · generator chunking |
| 13 | [Serialization & Parsing](coding-questions/13-serialization-parsing.md) | `JSON.stringify` · `JSON.parse` · nested query params · parse query string · object→query · CSV parse · cyclic serialization · URL parser |
| 14 | [Browser JavaScript](coding-questions/14-browser-javascript.md) | Event delegation · click outside · DOM traversal · DOM selector · infinite scroll · lazy images · scroll throttle · resize debounce · localStorage · localStorage TTL · cross-tab `storage` · `BroadcastChannel` · clipboard · drag ordering · keyboard shortcuts · online/offline |
| 15 | [Utility / Library Questions](coding-questions/15-utility-library.md) | lodash `get` · `set` · `once` · `memoize` · `cloneDeep` · `isEqual` · `groupBy` · `chunk` · `flatten` · `uniq` · `debounce` · `throttle` |

## Part 2: Guess the Output

Predict the exact output, explain the rule, and rewrite the surprising cases. See [Guess the Output](coding-questions.md#part-2-guess-the-output) pages `16`–`25`.

## Part 3: Debugging Challenges

Broken JavaScript to find and fix. See the [Debugging Challenges](coding-questions/26-debugging.md) page.

## Coverage map

Use this to find a concept when revising. Each category maps to the pages that teach it.

| Category | Covered in |
|---|---|
| Strings: reverse, palindrome, frequency, compression, parsing | 01 |
| Arrays: dedupe, set operations, flatten, rotate, two-sum, sorting, grouping | 02 |
| Polyfills: array iteration, `reduce`, `flat`, `flatMap`, `includes` | 03 |
| Objects: clone, deep equal, `get`/`set`, flatten, pick/omit, group, freeze, cycles | 04 |
| Functions: closures, `once`, memoize, curry, compose/pipe, partial, chaining | 05 |
| Rate control: debounce, throttle, leading/trailing, cancel, flush | 06 |
| `this`: call, apply, bind, bind+`new`, custom `new`, `instanceof` | 07 |
| Promises: states, combinators, promisify, retry, timeout, concurrency, cache, polling | 08 |
| Async/await: ordering, cancellation, races, batching, dedupe | 09 |
| Events: emitter, pub/sub, namespaces, wildcards, observables | 10 |
| Data structures: stack, queue, linked list, map, set, LRU, TTL, trie, heap | 11 |
| Iterators/generators: iterables, `Symbol.iterator`, lazy sequences | 12 |
| Serialization: JSON, query strings, CSV, cycles, URLs | 13 |
| Browser: events, observers, storage, cross-tab, clipboard, drag, shortcuts | 14 |
| Utilities: lodash-style helpers | 15 |
