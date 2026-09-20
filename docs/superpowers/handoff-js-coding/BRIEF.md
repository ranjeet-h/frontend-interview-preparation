# Generation Brief — JavaScript Coding Questions (Part 1)

You are writing pages for a print-quality mdBook interview-preparation book.
The audience is a senior frontend/full-stack candidate who wants to *understand* each
pattern well enough to rebuild it live in an interview.

Write like an experienced engineer explaining to a peer: direct, specific, no filler,
no marketing language. Explain the *why* and the *contract*, not just the code.

## Hard output rules

1. **Output markdown only.** Write problems as `## ` headings. Do **not** add an `# H1`
   heading and do **not** add your own page titles — the assembler adds those.
2. **Never number the `##` headings.** The book auto-numbers problems with CSS. Write
   `## Implement Debounce`, not `## 12. Implement Debounce`.
3. **Do not add horizontal rules (`---`) between problems.** The assembler/page CSS
   handles problem separation. (A `---` is fine only inside quoted example text.)
4. Use exactly the subsection headings below, in exactly this order and spelling.
5. Code fences: use ```` ```javascript ```` for JS, ```text for output/plain text, ```html for HTML.
   Do not use `js`/`ts` tags.
6. Inline tags line: immediately after the `##` title, one blank line, then a line like
   `` `Difficulty: Medium` `Probability: Very High` ``. Nothing else on that line.
7. Each problem should be roughly 70–140 lines. Hard/Must-Master problems may go longer.
   Do not pad. Coverage and clarity beat length.
8. Use `// => result` comments inside code to show concrete outputs, and short ```text blocks
   when showing multi-line output.

## Per-problem template (use every heading, in this order)

```
## <Problem title>

`Difficulty: Easy|Medium|Hard` `Probability: Very High|High|Medium|Low`

### Problem

<what to implement, the exact function signature, and the contract/invariant>

### Examples

```text
<input> // => <output>
...
```

### Approach

<the plan, the invariant, and why this approach. Name the contract details a naive
solution would miss (this, callback args, sparse arrays, ordering, SameValueZero,
mutation, async scheduling). Do NOT include full code here.>

### Implementation

```javascript
// complete, runnable code with brief comments on the non-obvious lines
```

### Walkthrough

<trace the code on one real, slightly non-trivial input, step by step>

### Complexity

Time: ... Space: ... <one line on why>

### Edge Cases

- <edge 1 and what the code does>
- <edge 2 ...>

### Interview Follow-ups

- <the natural harder variant and one line on how to approach it>
- <2–4 follow-ups total>

### Common Mistakes

- <what interviewers actually see go wrong, and why>
- <2–4 total>

### Takeaway

<one or two sentences: the single idea to remember>
```

## Quality bar

- **Contract first.** For built-ins, state `this` handling, callback arguments, return
  value, sparse-array behavior, mutation, and ordering before coding.
- **Correct, modern JavaScript.** ES2020+ is fine (`??`, `?.`, `Object.groupBy`,
  `structuredClone`, class fields). Do not use deprecated patterns.
- **Real edge cases.** Empty input, single element, `null`/`undefined`, `NaN`,
  holes, negative indices, large input, Unicode, floating point, mutation of input,
  async rejection, stale results — whichever apply.
- **Honest about limits.** If something cannot be truly polyfilled (timers, host
  scheduling, `requestAnimationFrame`, private fields), say so in Edge Cases/Follow-ups.
- **No library solutions** as the core answer (no lodash/date-fns). Libraries may be
  mentioned only in Follow-ups as "production would use X".

## Worked exemplar A — a coding problem

## Reverse a String (Without `reverse()`)

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `reverseString(str)` that returns the string reversed, **without** calling
`Array.prototype.reverse()`. The contract is about what counts as a "character":
`split("")` splits UTF-16 code units, so an astral character such as an emoji becomes two
broken halves. Iterate code points instead.

### Examples

```text
reverseString("hello")      // => "olleh"
reverseString("JavaScript") // => "tpircSavaJ"
reverseString("")           // => ""
reverseString("ab")         // => "ba"
reverseString("😀ab")       // => "ba😀"
reverseString("mañana")     // => "anañam"
```

### Approach

Reversal is a swap, not a search. Two clean options:

1. **Two pointers** on the array of code points: swap `left`/`right` and move inward.
   `O(n)` time and `O(n)` space for the array, with the fewest allocations.
2. **Build up** by prepending (`for...of` + `result = char + result`). Readable, but
   repeated string concatenation is `O(n²)` unless the engine optimises ropes.

Importantly, `[...str]` and `for...of` iterate **code points**, whereas `str.split("")`
splits **UTF-16 code units**. That distinction is the real question. Grapheme clusters
(e.g. a family emoji or a base letter plus a combining accent) are a further level up and
require `Intl.Segmenter`; mention it rather than hand-rolling it.

### Implementation

```javascript
function reverseString(str) {
  if (typeof str !== "string") throw new TypeError("reverseString expects a string");

  const chars = [...str]; // code points, so surrogate pairs stay intact
  let left = 0;
  let right = chars.length - 1;

  while (left < right) {
    [chars[left], chars[right]] = [chars[right], chars[left]];
    left += 1;
    right -= 1;
  }

  return chars.join("");
}
```

### Walkthrough

For `"hello"`: `chars = ['h','e','l','l','o']`.

1. `left=0, right=4` → swap `h`/`o` → `['o','e','l','l','h']`; pointers become `1, 3`.
2. `left=1, right=3` → swap `e`/`l` → `['o','l','l','e','h']`; pointers become `2, 2`.
3. `left < right` is false, so the loop stops. `join("")` returns `"olleh"`.

For `"😀ab"`, `[...str]` yields `['😀','a','b']`, so the emoji is one element and survives.

### Complexity

Time: `O(n)` — one pass with `n/2` swaps. Space: `O(n)` — the code-point array. The
in-place swap avoids a second output array.

### Edge Cases

- `""` → `""` (loop never runs).
- Single character → returns it unchanged.
- Surrogate pairs (`"😀"`) stay intact because of the spread.
- Combining marks (`"e\u0301"`) reverse the mark and the base letter; reversing graphemes
  needs `Intl.Segmenter`.
- Non-string input throws rather than silently coercing.

### Interview Follow-ups

- **Reverse each word but keep word order:** split on spaces, reverse each part, rejoin.
- **Reverse word order:** split, reverse the array of words, rejoin.
- **Reverse in place** for an array of characters (two pointers, `O(1)` extra space).
- **Why is `split("")` wrong for emoji?** It splits UTF-16 code units; astral characters
  occupy two units and get separated.

### Common Mistakes

- Using `reverse()` — the problem explicitly forbids it, and interviewers check.
- `str.split("").reverse().join("")` breaks astral characters.
- Assuming `str.length` counts characters; it counts UTF-16 units.
- Forgetting the empty and single-character cases in the loop bounds.

### Takeaway

Reversal is a two-pointer swap. The actual interview question is "what is a character?" —
code units, code points, and grapheme clusters are three different answers.

## Worked exemplar B — a polyfill (contract-heavy)

## Implement `Array.prototype.map`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `myMap(callback, thisArg)` matching `Array.prototype.map`. The contract:
convert the receiver to an object, snapshot `length`, call `callback.call(thisArg, value,
index, array)` for each **present** index, skip holes, and return a new array of the same
length where holes remain holes.

### Examples

```text
[1, 2, 3].myMap((x) => x * 2)          // => [2, 4, 6]
[1, 2, 3].myMap((x, i) => x + i)       // => [1, 3, 5]
const ctx = { factor: 10 };
[1, 2].myMap(function (x) { return x * this.factor; }, ctx) // => [10, 20]
const sparse = [10, , 30];
sparse.myMap((x) => x + 1)             // => [11, <hole>, 31]
```

### Approach

The shared iterator contract is the point: `toObject(this)`, snapshot `length` once,
then for each index check `index in object` to distinguish a hole from an explicit
`undefined`. `map` writes the callback's return value at the same index. The `thisArg`
is forwarded with `callback.call`. Unlike `find`, `map` skips holes.

### Implementation

```javascript
if (!Array.prototype.myMap) {
  Array.prototype.myMap = function (callback, thisArg) {
    if (typeof callback !== "function") throw new TypeError("callback must be a function");

    const object = Object(this);              // generic: works for array-like receivers
    const length = object.length >>> 0;        // snapshot once; callbacks may mutate length

    const result = new Array(length);
    for (let index = 0; index < length; index += 1) {
      if (index in object) {                   // skip holes, pass explicit undefined
        result[index] = callback.call(thisArg, object[index], index, object);
      }
    }
    return result;
  };
}
```

### Walkthrough

For `sparse = [10, , 30]`, `length` is `3`. Index `0` is present → `result[0] = 11`.
Index `1` is checked with `1 in sparse`, which is `false`, so `result[1]` stays a hole
and the callback is never called. Index `2` is present → `result[2] = 31`.
Result: `[11, <hole>, 31]`, and `result.length === 3`.

### Complexity

Time: `O(n)` over the snapshotted length. Space: `O(n)` for the result array.

### Edge Cases

- **Sparse arrays:** holes are skipped and preserved; `1 in [ , ]` is `false` but
  `1 in [undefined]` is `true`.
- **`length` mutation during iteration:** snapshot it, or appended values change traversal.
- **`thisArg`:** forwarded via `.call`; irrelevant for arrow callbacks (lexical `this`).
- **Non-function callback:** throws `TypeError` before iterating.
- **Array-like receiver:** `Array.prototype.myMap.call({ 0: 'a', length: 1 }, ...)` works.

### Interview Follow-ups

- Implement `filter` and `forEach` on the same skeleton, then explain how each differs.
- Why do `find`/`findIndex` visit holes while `map` skips them? (`Get` vs `HasProperty`.)
- Why snapshot `length` but check `index in object` live? (Fixed boundary, live indices.)

### Common Mistakes

- Using `for...of` or `.forEach`, which hide the hole/`this` contract.
- Reading `object.length` every iteration so a callback can extend the loop.
- Writing `result[index] = ...` without the `in` guard, turning holes into `undefined`.
- Checking `typeof callback !== "function"` after starting iteration.

### Takeaway

Every array iterator shares "snapshot length, visit present indices, call with
value/index/array, honour `thisArg`." The method's personality is only what it does with
the callback's result.
