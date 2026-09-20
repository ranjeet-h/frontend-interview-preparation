## Find the Longest Substring Without Repeating Characters

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `longestUniqueSubstring(str)` that returns the longest contiguous run of
characters in which no character appears twice. Return the substring itself, not its
length (the length variant is the same loop with `bestLength` returned directly).

- Signature: `longestUniqueSubstring(str: string): string`.
- Throw `TypeError` for non-strings rather than coercing.
- `""` returns `""`; ties are broken by the earliest occurrence.
- "Character" means **code point**, so an astral emoji counts as one character.

### Examples

```text
longestUniqueSubstring("abcabcbb")  // => "abc"
longestUniqueSubstring("bbbbb")     // => "b"
longestUniqueSubstring("pwwkew")    // => "wke"
longestUniqueSubstring("")          // => ""
longestUniqueSubstring("dvdf")      // => "vdf"
longestUniqueSubstring("abba")      // => "ab"
longestUniqueSubstring("😀a😀b")     // => "😀ab"  (emoji is one code point)
```

### Approach

A brute-force check of every start/end pair is `O(n³)` and is the wrong framing. The
invariant of the fast solution is: **the window `[left, right]` always contains no
duplicates**. For each `right` you either extend the window (new character) or move `left`
far enough to evict the previous occurrence of the character you just met.

Keep a `Map<char, lastIndex>` of the most recent index of every character. When
`chars[right]` was seen at `seenAt` and `seenAt >= left`, that occurrence is *inside* the
window, so set `left = seenAt + 1`. The `seenAt >= left` guard is the part most candidates
miss: a stale index that lies to the left of the window must be ignored, otherwise `left`
rewinds and the window grows incorrectly (that is exactly the `"abba"` case).

Track `bestStart`/`bestLength` rather than re-slicing on every improvement, so the final
`slice` happens once. Because a Map is keyed by value, iterating the string as **code
points** (`[...str]`) is what makes astral characters one key instead of two surrogate
halves. An ASCII-only variant can replace the Map with a 128-entry array of last indices.

### Implementation

```javascript
function longestUniqueSubstring(str) {
  if (typeof str !== "string") {
    throw new TypeError("longestUniqueSubstring expects a string");
  }

  const chars = [...str]; // code points: an emoji is one element, not two
  const lastSeen = new Map(); // code point -> most recent index
  let left = 0; // start of the current duplicate-free window
  let bestStart = 0;
  let bestLength = 0;

  for (let right = 0; right < chars.length; right += 1) {
    const ch = chars[right];
    const seenAt = lastSeen.get(ch);

    // Only shrink if the previous occurrence is still inside [left, right].
    if (seenAt !== undefined && seenAt >= left) {
      left = seenAt + 1;
    }

    lastSeen.set(ch, right);

    const windowLength = right - left + 1;
    if (windowLength > bestLength) {
      bestLength = windowLength;
      bestStart = left;
    }
  }

  return chars.slice(bestStart, bestStart + bestLength).join("");
}
```

### Walkthrough

Take `"abcabcbb"`. `chars` = `a b c a b c b b`; `lastSeen` starts empty, `left = 0`.

1. `right=0`, `a` unseen → window length `1` → best `1` at start `0`.
2. `right=1`, `b` unseen → length `2` → best `2` at start `0`.
3. `right=2`, `c` unseen → length `3` → best `3` at start `0`.
4. `right=3`, `a` seen at `0 >= left(0)` → `left = 1`; length `3 - 1 + 1 = 3` → best stays `3`.
5. `right=4`, `b` seen at `1 >= 1` → `left = 2`; length `4 - 2 + 1 = 3`.
6. `right=5`, `c` seen at `2 >= 2` → `left = 3`; length `5 - 3 + 1 = 3`.
7. `right=6`, `b` seen at `4 >= 3` → `left = 5`; length `6 - 5 + 1 = 2`.
8. `right=7`, `b` seen at `6 >= 5` → `left = 7`; length `1`.

`bestLength = 3`, `bestStart = 0`, so the result is `"abc"`. For `"abba"`, step 4 sets
`left = 1` when the second `b` is met, and the final `a` is ignored because its index `0`
is `< left`, which is precisely the guard's job.

### Complexity

Time: `O(n)` — each index is written to `lastSeen` once and `left` only ever moves forward.
Space: `O(min(n, u))` — the Map holds at most one entry per distinct character `u`. The
output is `O(n)`.

### Edge Cases

- `""` → `""`; the loop never runs and `slice(0, 0)` is empty.
- All identical (`"bbbbb"`) → `"b"`; one character.
- All distinct → the whole string; the window never shrinks.
- A repeated character far behind `left` (`"abba"`, `"dvdf"`) → must be ignored, or the
  window rewinds and overcounts.
- Case sensitivity: `"aA"` has two distinct characters, because JS comparison is
  code-point based.
- Whitespace and punctuation count as characters (`"a b"` → `"a b"`).
- Astral characters: `[...str]` keeps a surrogate pair together; `split("")` would treat
  `😀` as two *different* characters and could return a lone surrogate if sliced.
- Grapheme clusters (`"e\u0301"`, flag emoji) are several code points; the algorithm is
  correct at the code-point level but may split a visual glyph. `Intl.Segmenter` is the
  fix if grapheme-level uniqueness is required.

### Interview Follow-ups

- **At most `k` distinct characters** (`"eceba"`, `k=2` → `"ece"`): same window, but evict
  from `left` in a `while` loop while `lastSeen.size > k`; `O(n)` because `left` only moves
  forward.
- **Longest substring with at most `k` repeating** replacements (`"AABABBA"`, `k=1`):
  track `maxCount` in the window and shrink while `windowLength - maxCount > k`.
- **Return every maximal run**, not just the longest: collect when a new best is found.
- **Streaming input**: keep `lastSeen` and a rolling buffer; you cannot end the answer
  until the stream ends, but you can emit once a character's next occurrence is known.
- **ASCII fast path**: `new Int32Array(128).fill(-1)` for last indices, avoiding Map
  allocation and hashing.

### Common Mistakes

- Forgetting the `seenAt >= left` guard, so stale indices pull `left` backwards.
- Returning `chars.length` instead of the window length, or slicing with `right - left`
  instead of `right - left + 1` (off-by-one).
- Marking a character as seen only when it repeats, so the first occurrence has no index.
- Using `Set` and deleting only one character per step while still claiming `O(n)` without
  explaining the amortised argument.
- `split("")` instead of `[...str]`, which breaks astral characters.
- Recomputing `str.slice(...)` inside the loop, turning an `O(n)` scan into `O(n²)`.

### Takeaway

Longest-window problems are one invariant — "the window is currently valid" — plus the
cheapest rule that restores it when it breaks. Here the rule is `left = lastSeen[ch] + 1`,
and the guard `lastSeen[ch] >= left` is the whole trick.

## Find All Duplicate Characters in a String

`Difficulty: Easy` `Probability: High`

### Problem

Implement `findDuplicateChars(str)` that returns every character appearing **two or more
times**, with no repeats in the output. Order the result by **first appearance** in the
input, not alphabetically, so the function is stable and diffable.

- Signature: `findDuplicateChars(str: string): string[]`.
- Throw `TypeError` for non-strings.
- `""` and strings with no repeats return `[]`.
- "Character" means code point, so an astral emoji is a single result element.
- Comparison is case-sensitive: `"aA"` has no duplicates.

### Examples

```text
findDuplicateChars("aabbcde")   // => ["a", "b"]
findDuplicateChars("aabBcde")   // => ["a"]
findDuplicateChars("abcabc")    // => ["a", "b", "c"]   (first-appearance order)
findDuplicateChars("abccba")    // => ["a", "b", "c"]
findDuplicateChars("a")         // => []
findDuplicateChars("")          // => []
findDuplicateChars("a  b  ")    // => [" "]   (space is a character)
findDuplicateChars("😀a😀")      // => ["😀"]
```

### Approach

One pass builds a frequency table, a second pass extracts the duplicates. A `Map<char,
count>` is the right structure: keys can be any code point (including emoji) and Map
**iterates in insertion order**, which gives first-appearance ordering for free. Merging
those two passes is not worth it — you cannot know a character is a duplicate until you
have seen it twice, and you must not emit the same character again afterwards.

The alternative, `str.indexOf(ch) !== str.lastIndexOf(ch)`, "works" but is subtly wrong:
it is `O(n²)` on long strings, and on an astral character the two halves of the surrogate
pair may have different `lastIndexOf` results, so it can report or miss duplicates
depending on the split. `[...str]` plus a Map sidesteps both problems.

If the input is guaranteed ASCII, replace the Map with `Uint32Array(128)` and a `seen`
`Uint8Array` to avoid hashing and allocation. Keep the Map version as the general answer.

### Implementation

```javascript
function findDuplicateChars(str) {
  if (typeof str !== "string") {
    throw new TypeError("findDuplicateChars expects a string");
  }

  const counts = new Map();
  for (const ch of str) {
    // `?? 0` handles the first occurrence without a separate has() check.
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }

  const duplicates = [];
  for (const [ch, count] of counts) {
    if (count > 1) duplicates.push(ch); // Map order == first-appearance order
  }
  return duplicates;
}
```

A one-pass, two-set variant that emits on the second sighting is equivalent but must
guard against re-emitting a character seen three or more times:

```javascript
function findDuplicateCharsOnePass(str) {
  const seen = new Set();
  const emitted = new Set();
  const duplicates = [];
  for (const ch of str) {
    if (seen.has(ch)) {
      if (!emitted.has(ch)) {
        duplicates.push(ch);
        emitted.add(ch);
      }
    } else {
      seen.add(ch);
    }
  }
  return duplicates;
}
```

### Walkthrough

Take `"abccba"`.

1. Pass one counts: `a → 2`, `b → 2`, `c → 2`. Insertion order is `a, b, c` because
   `a`, `b`, `c` each first appear in that order.
2. Pass two iterates the Map in that order and pushes each key whose count is `> 1`:
   `["a", "b", "c"]`.

Now `"aabbcde"`: counts are `a → 2`, `b → 2`, `c → 1`, `d → 1`, `e → 1`; filtered result
is `["a", "b"]`. If you instead iterated a sorted set of keys you would still get the
same answer here, but `"ba"` would wrongly become `["a", "b"]` — first-appearance order
is the contract.

### Complexity

Time: `O(n)` — two linear passes with `O(1)` Map operations (amortised). Space: `O(k)` for
the frequency table and `O(d)` for the output, where `k` is the number of distinct
characters and `d ≤ k` the number of duplicates.

### Edge Cases

- `""` → `[]`; `"a"` and `"abc"` → `[]` (no `count > 1`).
- Case sensitivity: `"aA"` → `[]`, `"aa"` → `["a"]`; call out the contract rather than
  silently folding case.
- Whitespace and punctuation are characters: `"a  b  "` → `[" "]`.
- Astral characters: `for...of` and Map keep `😀` whole; `split("")` would produce two
  surrogate halves and count them separately.
- Combining marks: `"e\u0301"` is two code points and is never a duplicate of itself;
  grapheme-level comparison needs `Intl.Segmenter`.
- Unicode case folding (`"ß"` vs `"SS"`) needs `toLocaleLowerCase` and is a deliberate
  extension, not the default.

### Interview Follow-ups

- **Return a count map instead of an array**: return the Map filtered to `count > 1`; the
  work is already done.
- **First non-repeating character** (`"aabbcdd"` → `"c"`): the same table, then scan the
  string (not the Map) for the first key with `count === 1`.
- **Case-insensitive mode**: key by `ch.toLocaleLowerCase()` but emit the first original
  casing you saw.
- **Memory-constrained, lowercase ASCII**: a 26-bit mask (`seen` and `duplicate` bitsets)
  gives `O(1)` space; mention it only if the interviewer narrows the alphabet.
- **Streaming input**: you can emit a duplicate the moment its count reaches 2; no need to
  buffer the whole string.

### Common Mistakes

- `str.indexOf(ch) !== str.lastIndexOf(ch)` — `O(n²)` and unreliable on surrogate pairs.
- De-duplicating by pushing every repeat, so `"aaa"` yields `["a", "a"]`.
- Iterating a `Set` built during the scan without tracking what was already emitted.
- Sorting the output when the contract asked for first-appearance order (or vice versa).
- Using `split("")`, which splits UTF-16 code units and breaks emoji.
- Forgetting that spaces and punctuation are legitimate characters.

### Takeaway

Duplicates are a frequency problem: count in one pass, filter in a second. The two
details interviewers probe are **ordering** (Map preserves first appearance) and **what a
character is** (code points via `for...of`, not `split("")`).

## Find the Longest Common Prefix

`Difficulty: Easy` `Probability: High`

### Problem

Implement `longestCommonPrefix(strings)` that returns the longest string that is a prefix
of **every** string in the array. The whole array shares it; there is no "majority"
notion.

- Signature: `longestCommonPrefix(strings: string[]): string`.
- Throw `TypeError` if the argument is not an array of strings.
- An empty array returns `""` (the empty string is a prefix of nothing).
- An empty string anywhere makes the answer `""`.
- Comparison is case-sensitive and code-point based.

### Examples

```text
longestCommonPrefix(["flower", "flow", "flight"])  // => "fl"
longestCommonPrefix(["dog", "racecar", "car"])     // => ""
longestCommonPrefix(["abc"])                       // => "abc"
longestCommonPrefix([])                            // => ""
longestCommonPrefix(["", "abc"])                   // => ""
longestCommonPrefix(["same", "same"])              // => "same"
longestCommonPrefix(["a😀b", "a😀c"])               // => "a😀"
```

### Approach

Three standard shapes, in increasing elegance:

1. **Vertical scan** — take the first string as a candidate prefix and, for each column
   `i`, check that every other string has the same character at `i`. The first mismatch
   returns `first.slice(0, i)`. This exits as early as possible when strings diverge, and
   it never compares characters beyond the shortest string.
2. **Sort and compare ends** — sort the array and compare only the first and last
   strings; the longest prefix they share is the answer. Short to write, but sorting is
   `O(n log n)` and it reorders (a copy) for no semantic reason.
3. **Horizontal shrink** — start with `prefix = strings[0]` and, for each next string,
   chop characters off the end until it is a prefix. Worst case it re-checks the whole
   prefix per string, so it is easier to get wrong than the vertical scan.

Use the vertical scan: it is `O(total characters compared)`, allocation-light, and its
loop bounds make the empty-input and empty-string cases fall out naturally.

The one real subtlety is **code points vs code units**. Comparing `strings[j][i]` and then
slicing `first.slice(0, i)` uses UTF-16 indices. Two strings that share the high surrogate
of an emoji but differ in the low surrogate (`"😀"` vs `"😁"`) would share `i = 1` and
return a lone high surrogate — a broken string. Working on `[...s]` code-point arrays and
`join("")` at the end avoids that.

### Implementation

```javascript
function longestCommonPrefix(strings) {
  if (!Array.isArray(strings)) {
    throw new TypeError("longestCommonPrefix expects an array of strings");
  }
  if (strings.length === 0) return "";

  // Convert once so the scan and the slice agree on code-point boundaries.
  const chars = strings.map((s) => {
    if (typeof s !== "string") {
      throw new TypeError("longestCommonPrefix expects an array of strings");
    }
    return [...s];
  });

  const first = chars[0];
  for (let column = 0; column < first.length; column += 1) {
    for (let row = 1; row < chars.length; row += 1) {
      // First divergence ends the prefix; shorter strings fail here too.
      if (chars[row][column] !== first[column]) {
        return first.slice(0, column).join("");
      }
    }
  }
  return strings[0]; // first string is a prefix of all the others
}
```

### Walkthrough

Take `["flower", "flow", "flight"]`; `chars` is
`[f,l,o,w,e,r]`, `[f,l,o,w]`, `[f,l,i,g,h,t]`.

- `column=0`: `chars[1][0] = "f" === first[0]`; `chars[2][0] = "f" === first[0]`. Continue.
- `column=1`: `"l" === "l"` for both. Continue.
- `column=2`: `chars[1][2] = "o" === "o"`; `chars[2][2] = "i" !== "o"` → return
  `first.slice(0, 2).join("") = "fl"`.

For `["", "abc"]`: `first` is `[]`, so the outer loop body never runs and we return
`strings[0] = ""`. For `["ab", "a"]`, `column=0` passes; at `column=1`,
`chars[1][1]` is `undefined`, which is `!== "b"` → `first.slice(0, 1) = "a"`, the correct
answer.

### Complexity

Time: `O(n * m)` worst case, where `n` is the number of strings and `m` the length of the
shortest; it exits at the first mismatch, so it is often far less. Space: `O(total
characters)` for the code-point arrays (or `O(1)` extra if you accept code-unit
comparison and skip the conversion).

### Edge Cases

- `[]` → `""`; the guard runs before any indexing.
- A single string → that string is returned unchanged.
- Any `""` in the array → the scan hits `undefined` at column `0` of that row and returns
  `""` (unless the empty string is first and short-circuits).
- All strings identical → returns the first string.
- No common prefix (`["dog", "cat"]`) → column `0` mismatches → `""`.
- Astral prefix (`["a😀b", "a😀c"]`) → `"a😀"`; a code-unit implementation might return a
  broken surrogate.
- Non-array or non-string entries → `TypeError`, before any work.
- Case sensitivity: `["Ab", "ab"]` → `""`.

### Interview Follow-ups

- **Longest common suffix**: reverse the array's strings, reuse this function, reverse the
  result (accounting for graphemes).
- **Longest common substring** (not prefix): this becomes a dynamic-programming or
  suffix-automaton problem; the prefix answer does not generalise.
- **`n` huge, shared prefix long**: sort-and-compare-first/last is a one-liner and can be
  faster when divergence is late, because only two strings are walked.
- **Trie variant**: insert all strings into a trie; the answer is the path until a node
  has more than one child or a word ends. Good when you also need prefix queries later.
- **Streaming strings**: keep the current prefix and shrink it as new strings arrive.

### Common Mistakes

- Only comparing each string to `strings[0]` and returning their pairwise prefix, rather
  than the prefix common to *all* strings.
- Returning `strings[0]` without verifying the shortest string is inside it.
- Slicing at `column + 1` instead of `column` (off-by-one).
- Using `strings[0][i]` directly and slicing a surrogate pair in half.
- Forgetting the empty-array guard, so `strings[0]` is `undefined` and `.length` throws.
- Assuming `["dog", "racecar", "car"]` shares `""` correctly but then also returning
  `""` for `["abc"]` because of a wrong base case.

### Takeaway

The longest common prefix is the vertical scan: walk columns of the first string and stop
at the first row that disagrees. Every edge case is just a bound — empty array, empty
string, or a shorter string yielding `undefined`.

## Check Whether One String Is a Rotation of Another

`Difficulty: Easy` `Probability: High`

### Problem

Implement `isRotation(a, b)` returning `true` when `b` can be obtained by rotating `a` —
that is, moving some prefix of `a` to its end — and `false` otherwise.

- Signature: `isRotation(a: string, b: string): boolean`.
- Throw `TypeError` for non-strings.
- Rotation is by any offset, including `0` (identity). `""` is a rotation of `""`.
- Strings of different lengths can never be rotations, regardless of content.
- The check is case-sensitive.

### Examples

```text
isRotation("waterbottle", "erbottlewat")  // => true
isRotation("abcde", "cdeab")              // => true
isRotation("abcde", "abced")              // => false
isRotation("abc", "abc")                  // => true   (zero rotation)
isRotation("abc", "ab")                   // => false  (different length)
isRotation("abc", "abcabc")               // => false  (different length)
isRotation("", "")                        // => true
isRotation("a", "a")                      // => true
isRotation("ab", "ba")                    // => true
```

### Approach

The naive answer is: for each of the `n` offsets, build `a.slice(i) + a.slice(0, i)` and
compare, which is `O(n²)` time and allocates `n` strings. The elegant answer rests on one
observation: **every rotation of `a` is a substring of `a + a`**, starting at some index
`0..n-1`.

So the test is `a.length === b.length && (a + a).includes(b)`. The length check is not
optional: without it, `isRotation("abc", "abcabc")` would return `true` because
`"abcabc".includes("abcabc")` is true, even though the strings differ in length. The
`length` equality also makes the empty-string case correct for free, since
`"".includes("")` is `true`.

A detail worth naming: `includes` can be `O(n * m)` in the worst case for some engines
(naive substring search). On a technical interview, mention that a KMP or Z-algorithm
prefix-function scan over `a + a` guarantees `O(n)`. For realistic string sizes the
built-in is fine, and the API contract is what matters.

An alternative that avoids concatenation is to iterate the starting offsets and compare
with a rolling hash, or to search `b` in `a + a` manually. Concatenation is the clearest.

### Implementation

```javascript
function isRotation(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    throw new TypeError("isRotation expects two strings");
  }

  // A rotation preserves length; this also handles "" and "" correctly.
  if (a.length !== b.length) return false;

  // Every rotation of `a` appears inside `a + a`, starting in the first half.
  return (a + a).includes(b);
}
```

The explicit-rotation version, for contrast — correct but `O(n²)`:

```javascript
// Illustrative only: allocates n strings and compares up to n characters each.
function isRotationNaive(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a.slice(i) + a.slice(0, i) === b) return true;
  }
  return a === b; // covers the empty-string case
}
```

### Walkthrough

Take `a = "waterbottle"`, `b = "erbottlewat"`.

1. Lengths are both `11`, so continue.
2. `a + a = "waterbottlewaterbottle"`.
3. `"waterbottlewaterbottle".includes("erbottlewat")` — the substring begins at index
   `8`: `a+a[8..19]` is `"erbottlewat"`. The call returns `true`.

Now a negative: `a = "abcde"`, `b = "abced"`. Lengths match (`5`), but
`"abcdeabcde"` never contains `"abced"`, so the result is `false`.

And the trap: `a = "abc"`, `b = "abcabc"`. Without the length guard,
`"abcabc".includes("abcabc")` is `true` and the function would lie. With the guard,
`3 !== 6` returns `false` immediately.

### Complexity

Time: `O(n + n) = O(n)` for the concatenation and search with typical engine string
search; worst-case substring search is `O(n²)`, avoided with KMP. Space: `O(n)` for the
concatenated string (avoidable with a rolling-hash or KMP scan).

### Edge Cases

- `""` and `""` → `true` (both length `0`, empty string is trivially present).
- `""` and `"a"` → `false` by the length guard; do not rely on `includes` alone.
- Different lengths → always `false`; the length check makes `"abc"` vs `"abcabc"` correct.
- Zero rotation (`a === b`) → `true`.
- Repeated patterns (`"aaaa"`, `"aa"`) → `false` on length; `"aaaa"`/`"aaaa"` → `true`.
- Single character → `true` iff equal.
- Case sensitivity: `"Abc"` and `"bcA"` → `false`; document rather than folding.
- Rotation splitting a surrogate pair: a code-unit rotation like `"😀a".slice(1)` is not
  a valid string; because a rotation by a code-unit offset can produce lone surrogates,
  code-point-aware rotation is a separate, harder contract. For equality of well-formed
  strings, `a + a` search does the right thing.

### Interview Follow-ups

- **Count the minimum rotations** to turn `a` into `b`: find the start index with
  `indexOf` in `a + a`, bounded by `a.length`; that index is the rotation count.
- **Check with only one concatenation avoidable**: use KMP or the Z-algorithm over
  `b + "$" + a + a` and look for a match of length `b.length`.
- **Case-insensitive rotation**: normalise both with `toLocaleLowerCase()` first, and
  state the locale.
- **Multiple candidate rotations**: return all distinct offsets where `b` matches.
- **Rotation vs. cyclic shift of words**: split on spaces and rotate the array instead;
  the algorithm is the same idea but on tokens.

### Common Mistakes

- Dropping the length guard, so any string contained in another passes
  (`"abc"` / `"abcabc"`).
- Building all rotations (`O(n²)` and lots of allocation) when concatenation suffices.
- Using `indexOf(b) !== -1` on `a` instead of `a + a`, missing wraparound rotations.
- Assuming `"abc".includes("")` semantics make `isRotation("abc", "")` true — the length
  guard prevents that.
- Rotating by UTF-16 units and producing broken surrogate halves.

### Takeaway

Rotation is containment in `a + a`, guarded by equal lengths. The length check is the part
that separates a correct answer from a plausible one, and it makes every empty/different
length case fall out automatically.

## Capitalize the First Letter of Every Word

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `capitalizeWords(str)` that uppercases the first character of each word and
leaves the rest of the string — including the remaining letters of each word and all
whitespace — untouched.

- Signature: `capitalizeWords(str: string): string`.
- Throw `TypeError` for non-strings.
- A word is a maximal run of non-whitespace after a whitespace boundary or the start of
  the string.
- Existing whitespace (tabs, newlines, runs of spaces) is preserved exactly.
- Already-capitalized or all-caps words are not lowercased: `"NASA"` stays `"NASA"`.
- Empty string returns `""`.

### Examples

```text
capitalizeWords("the quick brown fox")   // => "The Quick Brown Fox"
capitalizeWords("hello world")           // => "Hello World"
capitalizeWords("  hi   there  ")        // => "  Hi   There  "
capitalizeWords("")                      // => ""
capitalizeWords("a")                     // => "A"
capitalizeWords("NASA and the FBI")      // => "NASA And The FBI"
capitalizeWords("one\ttwo\nthree")       // => "One\tTwo\nThree"
capitalizeWords("don't stop")            // => "Don't Stop"
capitalizeWords("👋 hello")               // => "👋 Hello"
```

### Approach

The straightforward version splits on a single space (`str.split(" ")`, capitalize each
part, `join(" ")`), but it is wrong for tabs, newlines, and non-breaking spaces, and it
must remember that `split(" ")` keeps empty strings from consecutive spaces (which is
actually convenient for preservation). A better default is a single regex pass that
matches "a boundary or whitespace, then the first non-whitespace character" and replaces
only the matched character, keeping the separator group intact.

The regex `/(^|\s)(\S)/gu` captures two groups: the leading whitespace (or start of
string) and the first non-space character. Replacing with `lead + ch.toUpperCase()`
preserves every whitespace character because the match consumes exactly one separator.
With the `u` flag, `\S` operates on code points, so an emoji word start is matched whole
and `toUpperCase()` is a no-op on it — which is what we want.

Two honesty notes worth stating in an interview:

- `toUpperCase()` is **not locale-aware** and not always length-preserving: `"ß"` becomes
  `"SS"`, and Turkish `"i"` wants `"İ"` via `toLocaleUpperCase("tr")`.
- `\b` word boundaries and `\w` are ASCII-biased, so `/\b\w/g` silently skips words
  starting with `é`, `ñ`, or an emoji. Use `\S` with the `u` flag, or `Intl.Segmenter`
  with `granularity: "word"` when true Unicode word breaking matters (e.g. CJK without
  spaces, punctuation-based boundaries).

### Implementation

```javascript
function capitalizeWords(str) {
  if (typeof str !== "string") {
    throw new TypeError("capitalizeWords expects a string");
  }

  // (^|\s) keeps the separator; (\S) is the first character of a word.
  return str.replace(/(^|\s)(\S)/gu, (_match, lead, char) => lead + char.toUpperCase());
}
```

The split-based version is fine if you only care about spaces, and it shows the
preservation reasoning explicitly:

```javascript
function capitalizeWordsBySplit(str) {
  return str
    .split(/(\s+)/) // capture separators so they survive the join
    .map((part) => (/^\s/.test(part) || part === "" ? part : part[0].toUpperCase() + part.slice(1)))
    .join("");
}
```

### Walkthrough

Take `"  hi   there  "`.

1. The regex scans for `(^|\s)(\S)`. At index `0`, `^` matches but `(\S)` fails on the
   space, so the engine advances.
2. At index `1`, `(\s)` matches the second space, `(\S)` matches `"h"`. The replacement is
   `" " + "H"`. The string becomes `"  Hi   there  "`.
3. Scanning resumes after `"H"`. The next match is the last space before `"t"` (the regex
   skips over the earlier spaces because `(\S)` requires a non-space immediately after the
   captured separator, so the engine lands on the space directly before `"t"`), producing
   `"T"` → `"  Hi   There  "`.
4. No further matches; the trailing spaces and the extra spaces between words are
   untouched.

Now `"NASA and the FBI"`: each word's **first** character is uppercased; the rest is not
touched, so `"NASA"` and `"FBI"` stay as-is and the output is `"NASA And The FBI"`.

### Complexity

Time: `O(n)` — one regex pass over the string. Space: `O(n)` for the produced string
(strings are immutable, so a new one is always returned).

### Edge Cases

- `""` → `""`; the regex finds nothing.
- Leading/trailing whitespace and runs of spaces are preserved exactly.
- Tabs, newlines, `\r\n`, and non-breaking spaces (`\u00A0` matches `\s`) all count as
  separators.
- A word that is already capitalized is unchanged.
- All-caps words are **not** lowercased — this is a deliberate contract choice; if the
  interviewer wants title case, lowercase the remainder (`char.toUpperCase() +
  rest.toLowerCase()`).
- `"ß"` uppercases to `"SS"`, changing length; `toLocaleUpperCase` behaves differently per
  locale.
- Emoji-leading words: `"👋 hello"` → `"👋 Hello"`; the emoji itself is unaffected.
- Punctuation is part of the word: `"(hello)"` → `"(hello)"`, because `(` is not
  whitespace; hyphen/apostrophe handling is a policy decision.

### Interview Follow-ups

- **Title case** (lowercase the rest): `str.replace(/\w\S*/gu, (w) =>
  w[0].toUpperCase() + w.slice(1).toLowerCase())`, with the acronym caveat.
- **Capitalize only the first letter of the whole string**: `str.charAt(0).toUpperCase() +
  str.slice(1)` (use a code-point-safe `slice` for astral first characters).
- **Hyphenated and apostrophe words** (`"state-of-the-art"`): split on `[\s-]` or handle
  a dictionary of exceptions.
- **Locale-aware casing**: `toLocaleUpperCase("tr")` for Turkish, `"de"` for `ß`.
- **`Intl.Segmenter`**: `new Intl.Segmenter(locale, { granularity: "word" })` yields real
  word boundaries including punctuation and languages without spaces.

### Common Mistakes

- `str.split(" ")` only handles the space character; tabs and newlines are treated as part
  of a word.
- `/\b\w/gu` fails on non-ASCII first letters and, without `u`, on astral characters.
- Lowercasing the rest of each word when the contract said "only the first letter",
  turning `"NASA"` into `"Nasa"`.
- Using `.toUpperCase()` on a whole word and losing internal casing.
- Assuming `toUpperCase` is locale-aware (it is not) or length-preserving (`ß`).
- Mutating expectations: strings are immutable, so callers must use the return value.

### Takeaway

Match the boundary **and** the first character, replace only that character, and let the
separator pass through unchanged. `\S` with the `u` flag beats `\b\w` the moment the input
is not plain ASCII.

## Convert camelCase to snake_case

`Difficulty: Medium` `Probability: High`

### Problem

Implement `camelToSnake(str)` that converts a camelCase or PascalCase identifier to
lowercase snake_case, inserting an underscore at each word boundary.

- Signature: `camelToSnake(str: string): string`.
- Throw `TypeError` for non-strings.
- A boundary is a lowercase-or-digit followed by an uppercase letter (`fooBar` →
  `foo_bar`), **and** the end of an acronym before a new word (`HTTPServer` →
  `http_server`, not `h_t_t_p_server`).
- The result is lowercased.
- An empty string returns `""`; digits are treated as word characters.

### Examples

```text
camelToSnake("camelCase")            // => "camel_case"
camelToSnake("getHTTPResponseCode")  // => "get_http_response_code"
camelToSnake("HTTPServer")           // => "http_server"
camelToSnake("XMLHttpRequest")       // => "xml_http_request"
camelToSnake("CamelCase")            // => "camel_case"
camelToSnake("already_snake")        // => "already_snake"  (no uppercase: unchanged)
camelToSnake("version2Api")          // => "version2_api"
camelToSnake("HTTP")                 // => "http"
camelToSnake("")                     // => ""
```

### Approach

The naive one-liner `str.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())` produces
`"h_t_t_p_server"` for `"HTTPServer"`: every capital gets its own underscore, so acronyms
are destroyed. The correct version needs **two ordered replacements** before lowercasing:

1. `([a-z0-9])([A-Z])` → `$1_$2` inserts a boundary between a word character and a new
   capital: `fooBar` → `foo_Bar`.
2. `([A-Z]+)([A-Z][a-z])` → `$1_$2` inserts a boundary *inside* an acronym run, right
   before the capital that starts the next lowercase word: `HTTPServer` → `HTTP_Server`.

The order matters. After step 1, a run like `"getHTTPResponse"` has already become
`"get_HTTPResponse"`; step 2 then only needs to split `HTTPResponse`. If you ran step 2
first, `"getHTTPResponse"` would split `getHTTP`'s acronym run incorrectly. Finally,
`.toLowerCase()` flattens everything.

Note what this pattern does **not** do: it does not consult a dictionary, so an all-caps
run at the very end (`"HTTP"`) is simply lowercased, and a single uppercase letter inside
a word (`"iPad"` → `"i_pad"`) is treated as a word start. If the interviewer demands
"words" from a known vocabulary, no regex can do it; state that explicitly rather than
pretending.

### Implementation

```javascript
function camelToSnake(str) {
  if (typeof str !== "string") {
    throw new TypeError("camelToSnake expects a string");
  }

  return (
    str
      // fooBar / foo2Bar -> foo_Bar / foo2_Bar
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      // HTTP + Server -> HTTP_Server (acronym run before a new word)
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
      .toLowerCase()
  );
}
```

### Walkthrough

Take `"getHTTPResponseCode"` (characters: `g e t H T T P R e s p o n s e C o d e`).

1. First pass, `([a-z0-9])([A-Z])`:
   - `t` then `H` → insert: `get_HTTPResponseCode`.
   - `e` then `C` (in `ResponseCode`) → insert: `get_HTTPResponse_Code`.
   - No other lowercase/digit-before-uppercase pairs (`P R` are both capitals).
2. Second pass, `([A-Z]+)([A-Z][a-z])` on `get_HTTPResponse_Code`:
   - In `HTTPRespons…`, `[A-Z]+` backtracks to `HTTP` and `([A-Z][a-z])` matches `Re` →
     `HTTP_Respons…`. The leading `H` alone cannot pair (next char is `T`, no lowercase),
     so it is left alone.
   - `_Code` has only one capital, no match.
   - Intermediate: `get_HTTP_Response_Code`.
3. `.toLowerCase()` → `"get_http_response_code"`.

For `"HTTPServer"`: step 1 does nothing (no lowercase/digit before a capital); step 2
turns `HTTP`+`Se` into `HTTP_Server`; lowercased → `"http_server"`.

### Complexity

Time: `O(n)` — two linear regex passes plus `toLowerCase`, each `O(n)`. Space: `O(n)` for
the intermediate and final strings (strings are immutable).

### Edge Cases

- `""` → `""`.
- Already snake_case or all-lowercase (`"already_snake"`, `"plain"`) → unchanged.
- PascalCase → a leading underscore? No: the first letter is a word start, so
  `"CamelCase"` → `"camel_case"` with no leading underscore (the regex only inserts
  *between* characters).
- Acronyms: `"HTTPServer"` → `"http_server"`; a lone trailing acronym `"HTTP"` → `"http"`.
- Digits: `"version2Api"` → `"version2_api"`; `"foo2bar"` → `"foo2bar"`.
- Single-letter words: `"aB"` → `"a_b"`; `"AB"` → `"ab"` (one acronym run).
- Existing underscores, dashes, and spaces are not normalised; `"foo_Bar"` → `"foo__bar"`
  because the capital after `_` is still a boundary. Normalise the input first if needed.
- Non-ASCII uppercase (`"é"`, Turkish `"İ"`) is not matched by `[A-Z]`; `toLowerCase`
  still applies, but boundary detection is ASCII-only. Mention `\p{Lu}` with the `u` flag
  as the fix.
- `toLowerCase()` can change length for a few characters (`İ` → `i̇`).

### Interview Follow-ups

- **The reverse** — snake_case to camelCase is the next problem; the two share the notion
  of segmenting words, not the same regex.
- **kebab-case**: replace `"_"` with `"-"` in the output; the segmentation is identical.
- **SCREAMING_SNAKE_CASE**: add `.toUpperCase()` at the end.
- **Unicode-aware boundaries**: `str.replace(/([\p{Ll}\d])(\p{Lu})/gu, "$1_$2")` and a
  second pass for acronyms, with `\p{Lu}`, handles accented letters.
- **Production**: `lodash`'s `_.snakeCase` uses a word-splitting regex plus a dictionary
  for known cases; mention it rather than re-deriving it.

### Common Mistakes

- `str.replace(/[A-Z]/g, "_$1")` (or any per-capital regex), which shatters acronyms into
  `h_t_t_p`.
- Running the acronym pass before the simple boundary pass, so runs are split incorrectly.
- Calling `.toLowerCase()` first, which erases every uppercase boundary.
- Forgetting digits: `"version2Api"` becomes `"version2api"` if digit-to-capital is not a
  boundary.
- Expecting dictionary-quality word segmentation from a regex — it cannot know `"iP"` is
  two words unless you tell it.
- Not handling `null`/`undefined` (the `typeof` guard covers it) or coercing numbers
  silently.

### Takeaway

camelCase to snake_case is two boundary rules plus a lowercase: `aA` and `AAa`. Get the
order right and acronyms survive; get it wrong and `HTTPServer` becomes `h_t_t_p_server`,
which is the answer interviewers are watching for.

## Convert snake_case to camelCase

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `snakeToCamel(str, options)` that joins underscore- or dash-separated words into
camelCase: the first word stays lowercase, each following word is capitalized and the
separators disappear.

- Signature: `snakeToCamel(str: string, { pascalCase = false } = {}): string`.
- Throw `TypeError` for non-strings.
- `snakeToCamel("foo_bar_baz")` → `"fooBarBaz"`.
- With `pascalCase: true`, the first word is capitalized too (`"FooBarBaz"`), which is
  what a class or type name wants.
- Empty input and input made only of separators return `""`.
- Words are normalised to lowercase, because snake_case is lowercased by definition.

### Examples

```text
snakeToCamel("foo_bar_baz")                  // => "fooBarBaz"
snakeToCamel("hello_world")                  // => "helloWorld"
snakeToCamel("foo")                          // => "foo"
snakeToCamel("foo_bar_baz", { pascalCase: true }) // => "FooBarBaz"
snakeToCamel("foo-bar-baz")                  // => "fooBarBaz"   (kebab works too)
snakeToCamel("FOO_BAR")                      // => "fooBar"      (normalised)
snakeToCamel("_foo__bar_")                   // => "fooBar"      (stray separators)
snakeToCamel("user_id_2")                    // => "userId2"
snakeToCamel("__")                           // => ""
snakeToCamel("")                             // => ""
```

### Approach

Split on one-or-more separators with `/[_-]+/`, drop empty segments (which the leading,
trailing, and doubled separators produce), then map each word: the first is left as-is
(or capitalized when `pascalCase`), the rest have their first character uppercased. Join
with no separator.

Two contract decisions deserve to be stated up front, because they are where answers
differ:

- **Normalisation.** Calling `.toLowerCase()` on each word makes `"FOO_BAR"` →
  `"fooBar"`, which is what a canonical snake_case input produces anyway. It also means
  an already-camel input with no separators (`"fooBar"`) is flattened to `"foobar"`. That
  is fine given the stated input contract ("snake or kebab"), but say it out loud so the
  interviewer knows you chose it deliberately. If you must preserve mixed casing, skip the
  `toLowerCase` and only capitalize subsequent words.
- **Capitalizing a word** must be code-point safe. `word[0].toUpperCase() + word.slice(1)`
  breaks when the first character is an astral letter or emoji, so use
  `const [first, ...rest] = [...lower]; first.toUpperCase() + rest.join("")`.

A `String.replace` variant, `str.replace(/[_-]([a-z])/g, (_, c) => c.toUpperCase())`, is
shorter but mishandles leading/doubled separators (`"a__b"` → `"a_B"`) and uppercase
letters, so prefer the split form and keep the replace version as a talking point.

### Implementation

```javascript
function snakeToCamel(str, { pascalCase = false } = {}) {
  if (typeof str !== "string") {
    throw new TypeError("snakeToCamel expects a string");
  }

  // One-or-more separators; filter(Boolean) drops the empty pieces they create.
  const words = str.split(/[_-]+/).filter(Boolean);
  if (words.length === 0) return "";

  return words
    .map((word, index) => {
      const lower = word.toLowerCase(); // canonical snake_case casing
      const capitalize = pascalCase || index > 0;
      if (!capitalize) return lower;

      // Code-point safe: toUpperCase() on a lone surrogate is a no-op.
      const [first, ...rest] = [...lower];
      return first.toUpperCase() + rest.join("");
    })
    .join("");
}
```

### Walkthrough

Take `"user_id_2"`.

1. `split(/[_-]+/)` → `["user", "id", "2"]` (no empties to filter).
2. `index=0`, `"user"`: `capitalize` is `false` (not pascalCase), so it stays `"user"`.
3. `index=1`, `"id"`: `lower = "id"`, `capitalize` is `true`, `[...lower]` is `["i","d"]`,
   so the result is `"I" + "d" = "Id"`.
4. `index=2`, `"2"`: `lower = "2"`, capitalized is `"2"` (`"2".toUpperCase()` is `"2"`).
5. `join("")` → `"userId2"`.

Now `"_foo__bar_"`: `split(/[_-]+/)` → `["", "foo", "bar", ""]`; `filter(Boolean)` →
`["foo", "bar"]` → `"fooBar"`. And `"FOO_BAR"`: words `["FOO", "BAR"]`, both lowercased
to `["foo", "bar"]`, giving `"fooBar"`.

### Complexity

Time: `O(n)` — one split, one map, one join over the input length. Space: `O(n)` for the
word array and the result (strings are immutable).

### Edge Cases

- `""`, `"__"`, `"-_"` → `""` (all segments filtered out).
- Leading/trailing/duplicated separators → ignored, no empty capital at the start.
- Kebab-case works because the split class includes `-`.
- Mixed separators (`"foo-_bar"`) → treated as one boundary run.
- Digits: `"user_id_2"` → `"userId2"`; `"v2_api"` → `"v2Api"`.
- All-caps input is normalised (`"FOO_BAR"` → `"fooBar"`); already-camel input
  (`"fooBar"`) is flattened to `"foobar"` — call this out.
- Astral first letter in a word: `[...lower]` keeps the surrogate pair intact.
- Non-ASCII uppercase expansions (`"ß"` → `"SS"`) can change the word length; that is
  inherent to `toUpperCase`, not to this function.
- Passing `pascalCase` truthy for only the first word differs from applying it to every
  word; the option here means "capitalize the first word too".

### Interview Follow-ups

- **kebab-case to camelCase** falls out of the same function; reverse it with
  `camelToSnake` and `.replaceAll("_", "-")` for kebab output.
- **`UPPER_SNAKE` → `PascalCase`**: call with `{ pascalCase: true }`; the normalisation
  handles the rest.
- **Preserve inner casing** (`"foo_BarBaz"`): drop `toLowerCase()` and only uppercase the
  first character of later words; document that it is no longer canonical.
- **`String.replace` one-liner**, and why it is fragile on doubled separators and
  uppercase letters.
- **Production**: `lodash`'s `_.camelCase` / `_.upperFirst`; mention, then show the
  hand-rolled version as the interview answer.

### Common Mistakes

- `str.replace(/_([a-z])/g, ...)` misses `_A` and leaves stray underscores for `"a__b"`
  (`"a_B"`), and does not handle a leading separator.
- Using `word[0]` / `word.slice(1)`, which splits surrogate pairs on astral input.
- Capitalizing the first word by accident, so `"foo_bar"` → `"FooBar"`.
- Forgetting `filter(Boolean)` and trying to capitalize empty segments.
- Forgetting the `typeof` guard and silently stringifying `null` to `"null"`.
- Assuming the output preserves input casing when the implementation normalises.

### Takeaway

Snake to camel is "split on separator runs, keep the first worddown, uppercase the first
code point of the rest, join." The only real decisions are whether to normalise casing and
whether to capitalize the first word — state both.

## Implement a Simple Template Interpolator

`Difficulty: Easy` `Probability: High`

### Problem

Implement `template(str, data)` that replaces `{{key}}` placeholders with values from
`data`, e.g. `template("Hello {{name}}", { name: "John" })` → `"Hello John"`.

- Signature: `template(str: string, data?: object): string`.
- Throw `TypeError` for a non-string template.
- Whitespace inside the braces is allowed: `{{ name }}` matches `name`.
- A key that is an **own** property of `data` is replaced; the value is stringified.
- A missing key is left as the original placeholder, so the bug is visible rather than
  silently blank. (This is a policy choice — see Follow-ups for throw/empty variants.)

### Examples

```text
template("Hello {{name}}", { name: "John" })          // => "Hello John"
template("{{a}}-{{b}}", { a: 1, b: 2 })               // => "1-2"
template("{{ name }}!", { name: "Ada" })              // => "Ada!"
template("Hi {{name}}, hi {{name}}", { name: "Sam" }) // => "Hi Sam, hi Sam"
template("no placeholders", { x: 1 })                 // => "no placeholders"
template("{{missing}}", { name: "Sam" })              // => "{{missing}}"
template("{{n}}", { n: null })                        // => ""   (own key, null value)
template("{{greet}}", { greet: () => "hi" })          // => "() => \"hi\""  (String()-ed)
template("", {})                                      // => ""
template("{{}}", {})                                  // => "{{}}"  (empty key: no match)
```

### Approach

One regex replaces every placeholder in a single pass. The pattern is
`/\{\{\s*([^{}]+?)\s*\}\}/g`: two literal braces, optional surrounding whitespace, and a
lazy capture of one-or-more non-brace characters. Excluding `{` and `}` from the capture
is what keeps nested/malformed braces from being swallowed, and the lazy `+?` stops the
match at the first `}}` rather than the last (the greedy `(.*)` bug that turns
`"{{a}} and {{b}}"` into one match).

Two implementation points that separate a demo from a correct answer:

1. **Use a replacer function, not a replacement string.** If the value contains `$&`,
   `$1`, or `` $` ``, a string replacement would interpret those as substitution
   patterns. `replace(pattern, (match, key) => ...)` returns the value literally.
2. **Read only own properties.** `data[key]` would happily return inherited members, so
   `{{toString}}` or `{{constructor}}` would "resolve" to functions. `Object.hasOwn(data,
   key)` (ES2022) blocks prototype reads.

Values are stringified with `String(value)`, except `null`/`undefined` for an own key,
which become `""` (a present-but-empty value). Unknown keys return `match`, keeping the
placeholder intact. The regex is non-global-safe? It is global (`g`); each `replace` call
resets `lastIndex`, so a module-level regex is fine with `String.prototype.replace` (but
would be stateful with `.test`/`.exec` — a good nuance to mention).

### Implementation

```javascript
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

function template(str, data = {}) {
  if (typeof str !== "string") {
    throw new TypeError("template expects a string");
  }
  const context = data ?? {};

  return str.replace(PLACEHOLDER, (match, key) => {
    // Own properties only: {{constructor}}/{{toString}} must not resolve.
    if (!Object.hasOwn(context, key)) return match; // leave the placeholder visible

    const value = context[key];
    return value == null ? "" : String(value); // null/undefined -> empty, not "null"
  });
}
```

Variants worth being able to write on demand:

```javascript
// Throw on a missing key (fail fast in a config layer).
function templateStrict(str, data = {}) {
  return str.replace(PLACEHOLDER, (match, key) => {
    if (!Object.hasOwn(data, key)) throw new ReferenceError(`missing key: ${key}`);
    return String(data[key]);
  });
}

// Nested paths: "{{user.name}}" — resolve one dot-segment at a time.
function resolvePath(object, path) {
  return path.split(".").reduce((value, part) => (
    value != null && Object.hasOwn(Object(value), part) ? value[part] : undefined
  ), object);
}
```

### Walkthrough

Take `template("Hello {{name}}, you have {{count}} new {{item}}s", { name: "Ada", count:
3, item: "message" })`.

1. The regex scans and finds `{{name}}` → `match = "{{name}}"`, `key = "name"`.
2. `Object.hasOwn(data, "name")` is `true`; `value = "Ada"`; `String("Ada") = "Ada"`.
3. Next match `{{count}}` → `key = "count"`, value `3`, result `"3"`.
4. Next match `{{item}}` → `"message"`.
5. There is no placeholder after `s`, so the tail `"s"` passes through unchanged.

Result: `"Hello Ada, you have 3 new messages"`. For `"{{missing}}"`, `hasOwn` is `false`,
so the callback returns `match` and the placeholder survives verbatim — easy to notice in
output and easy to assert against in a test.

### Complexity

Time: `O(n + k)` where `n` is the template length and `k` the number of placeholders
(each value is stringified once). Space: `O(n)` for the result; placeholders are replaced
in a single pass.

### Edge Cases

- No placeholders → the string is returned unchanged.
- Repeated placeholder → replaced at every occurrence (`g` flag).
- Whitespace inside braces is trimmed; braces without a key (`"{{}}"`) do not match and
  pass through.
- Missing key → placeholder preserved (documented); a strict variant throws instead.
- `null`/`undefined` value on an own key → `""`; a literal `0`, `false`, or `""` is kept
  as `"0"`, `"false"`, `""`.
- Values containing `$&`/`$1` are literal, because the replacer is a function.
- Prototype keys (`{{constructor}}`, `{{__proto__}}`) are blocked by `Object.hasOwn`.
- Braces inside a value are not re-scanned; replacement is single-pass, so no injection
  via data.
- Unicode keys and astral characters in values pass through untouched.
- Non-object `data` (a number, a string) works for its own index properties; `data =
  null` is normalised to `{}`.

### Interview Follow-ups

- **Nested paths** (`{{user.profile.name}}`): split the key on `.` and resolve one own
  property at a time, returning the placeholder (or `undefined`) when a step is missing.
- **Defaults / filters** (`{{name ?? "Guest"}}`, `{{price | currency}}`): tokenise the
  expression before resolving; this is where a real template engine starts.
- **Compile once, render many**: tokenise into a literal/placeholder array or build a
  function via `new Function`, caching the compiled form on the template string. Be
  explicit that `new Function` is code execution and must never see untrusted templates.
- **HTML escaping**: if the output is inserted into the DOM, escape `<`, `>`, `&`, `"`,
  `'` in values; a template engine without escaping is an XSS vector.
- **Escaping the syntax** (`\{{literal}}`): handle the backslash before the regex pass, or
  use a negative lookbehind.

### Common Mistakes

- Greedy `/\{\{(.*)\}\}/`: `"{{a}} {{b}}"` becomes a single match spanning both.
- Matching `{{` with a character class that includes braces, which lets matches cross
  boundaries.
- `data[key]` instead of `Object.hasOwn`, so `{{toString}}` resolves to a function, and a
  crafted template can probe the prototype chain.
- Using a replacement string and breaking on `$&`/`$1` in the data.
- Treating `0` and `false` as "missing" with `if (!value)`, so `{{count}}` with `0`
  renders empty.
- Forgetting that `String(undefined)` is `"undefined"` and shipping `"null"` into the UI.
- Re-scanning the output, which lets a value containing `{{...}}` inject further
  substitutions.

### Takeaway

A template interpolator is one non-greedy regex plus a replacer function that resolves
**own** properties. The correctness details — lazy matching, `Object.hasOwn`, function
replacers, and `null`-handling — are the whole question; the loop is trivial.

## Implement String Truncation with an Ellipsis

`Difficulty: Easy` `Probability: High`

### Problem

Implement `truncate(str, maxLength, ellipsis = "\u2026")` that shortens `str` so the
**whole result, including the ellipsis, is at most `maxLength` characters**. If the input
already fits, it is returned unchanged.

- Signature: `truncate(str: string, maxLength: number, ellipsis?: string): string`.
- Throw `TypeError` for a non-string input or a non-integer/negative `maxLength`.
- The ellipsis counts against the budget: `maxLength` is the maximum length of the result,
  not the prefix.
- "Length" is measured in code points, so an astral character counts as one.
- If `maxLength` is smaller than the ellipsis, return `ellipsis` cut to `maxLength`.

### Examples

```text
truncate("Hello, world!", 5)          // => "Hell\u2026"      (4 code points + ellipsis)
truncate("Hello, world!", 2)          // => "H\u2026"
truncate("Hello, world!", 1)          // => "\u2026"
truncate("Hello, world!", 0)          // => ""
truncate("Hello, world!", 13)         // => "Hello, world!"  (fits, unchanged)
truncate("Hello", 5)                  // => "Hello"
truncate("Hello, world!", 5, "...")   // => "He..."           (2 + 3)
truncate("Hello, world!", 3, "...")   // => "..."
truncate("😀😀😀😀😀", 3)                // => "😀😀\u2026"        (emoji are single code points)
truncate("", 5)                       // => ""
```

### Approach

The contract is a length budget, and the classic bug is slicing `str` to `maxLength` and
*then* appending the ellipsis, which overflows the budget. Subtract the ellipsis length
first: `str.slice(0, maxLength - ellipsis.length) + ellipsis`. The guard for "input
already fits" must compare against `maxLength` directly, never the reduced prefix length.

Count in **code points**, not UTF-16 code units, or an emoji at the cut point is halved.
Convert once with `[...str]`, slice the array, and `join`. This also makes the result
respect the stated budget: `[...str].length` is the visual character count for the
code-point level (graphemes remain a higher level — a flag emoji or a base+combining mark
is still multiple code points).

Handle the degenerate budgets explicitly. If `maxLength` is `0`, return `""`. If
`maxLength` is positive but `<= ellipsis.length`, there is no room for both a prefix and
the full ellipsis, so return `ellipsis` truncated to `maxLength` — the result still obeys
the budget. Some APIs instead always return the ellipsis in this case; pick one and state
it.

Word-boundary truncation (cut at the last space, and avoid leaving dangling punctuation)
is the common follow-up; it needs a re-check after the cut and a fallback to a hard cut
when the first word alone exceeds the budget.

### Implementation

```javascript
function truncate(str, maxLength, ellipsis = "\u2026") {
  if (typeof str !== "string") {
    throw new TypeError("truncate expects a string");
  }
  if (!Number.isInteger(maxLength) || maxLength < 0) {
    throw new TypeError("maxLength must be a non-negative integer");
  }
  if (typeof ellipsis !== "string") {
    throw new TypeError("ellipsis must be a string");
  }

  const chars = [...str]; // code points, so emoji are never split
  if (chars.length <= maxLength) return str; // already fits: no ellipsis

  const ellipsisChars = [...ellipsis];
  if (maxLength <= ellipsisChars.length) {
    // No room for a prefix; return the ellipsis trimmed to the budget.
    return ellipsisChars.slice(0, maxLength).join("");
  }

  const keep = maxLength - ellipsisChars.length; // ellipsis is part of the budget
  return chars.slice(0, keep).join("") + ellipsis;
}
```

A word-boundary variant that does not cut mid-word:

```javascript
function truncateAtWord(str, maxLength, ellipsis = "\u2026") {
  const hard = truncate(str, maxLength, ellipsis);
  if (hard === str) return str;

  const body = hard.slice(0, -ellipsis.length); // prefix before the ellipsis
  const lastSpace = body.search(/\s\S*$/u);     // last word begins after this space
  // Fall back to the hard cut when trimming would drop the only word.
  const trimmed = lastSpace > 0 ? body.slice(0, lastSpace) : body;
  return trimmed.replace(/[\s.,;:!?-]+$/u, "") + ellipsis;
}
```

### Walkthrough

Take `truncate("Hello, world!", 5)`.

1. `chars` has `13` code points; `13 <= 5` is false, so we do not return early.
2. `ellipsisChars` is `["\u2026"]`, length `1`; `5 <= 1` is false.
3. `keep = 5 - 1 = 4`; `chars.slice(0, 4)` is `["H","e","l","l"]`; joined with the
   ellipsis → `"Hell\u2026"`, exactly `5` code points.

Now `truncate("Hello, world!", 5, "...")`: `ellipsis` has length `3`; `5 <= 3` is false;
`keep = 2` → `"He" + "..." = "He..."` (5 characters). And `truncate("Hello, world!", 3,
"...")`: `3 <= 3` is true, so we return `"..."` (3 characters) — a valid result even
though the ellipsis consumes the entire budget. For `maxLength = 0`, the same branch
returns `[].join("") = ""`.

### Complexity

Time: `O(n)` — one spread and one slice. Space: `O(n)` for the code-point array; the
result is `O(maxLength)`.

### Edge Cases

- Input already within budget → returned unchanged, no ellipsis appended.
- `maxLength === 0` → `""`.
- `maxLength < ellipsis.length` (including `1` for a one-character ellipsis) → the
  ellipsis is itself truncated to the budget.
- `maxLength === str` length → unchanged; `maxLength === length - 1` → cut plus ellipsis.
- Multi-character or empty ellipsis: `""` as the ellipsis means a pure prefix cut.
- Astral characters: code-point slicing keeps `😀` whole; a naive `slice` could halve it.
- Grapheme clusters: a base letter plus a combining accent, or a family emoji, is multiple
  code points and can still be cut; `Intl.Segmenter` with `granularity: "grapheme"` is the
  full fix.
- Non-integer, `NaN`, `Infinity`, or negative `maxLength` → `TypeError` (or clamp, if you
  prefer — state the choice).
- `null`/`undefined` input → `TypeError` rather than `"null…"`.

### Interview Follow-ups

- **Word-boundary truncation**: as above; cut at the last space, strip trailing
  punctuation, and fall back to a hard cut when the first word is too long.
- **Truncate the middle** (`"abc…xyz"`): keep `ceil`/`floor` of the budget on each end and
  put the ellipsis between; useful for paths and long IDs.
- **Truncate from the start** (`"…world!"`): keep the tail, which matters for file names
  where the extension is the informative part.
- **Grapheme-safe truncation**: segment with `Intl.Segmenter` and count segments, so you
  do not split a family emoji or an accented letter.
- **HTML-aware truncation**: never cut inside a tag; walk the DOM or a tokeniser and use
  `textContent` length, because truncating raw HTML can produce invalid markup.

### Common Mistakes

- Slicing to `maxLength` and then appending the ellipsis, so the result is `maxLength +
  ellipsis.length` long.
- Measuring with `.length` (UTF-16 code units) and splitting an emoji.
- Forgetting the `maxLength === 0` and `maxLength < ellipsis.length` branches, producing an
  over-budget result or `undefined`.
- Appending the ellipsis even when the string already fits.
- Hard-coding `"..."` when the signature accepts a custom ellipsis.
- Using `substring`/`substr` instead of `slice`, and confusing negative-index semantics.

### Takeaway

Truncation is a budget: reserve the ellipsis's length *before* slicing, and count code
points rather than UTF-16 units. The degenerate budgets (`0`, and less than the ellipsis)
are exactly where careless answers overflow.

## Count Words Without Simply Calling `split(" ")`

`Difficulty: Easy` `Probability: High`

### Problem

Implement `countWords(str)` that counts words, where a word is a maximal run of
non-whitespace characters. The constraint is the point: do not call `str.split(" ")`, and
in particular do not let tabs, newlines, or runs of spaces inflate the count.

- Signature: `countWords(str: string): number`.
- Throw `TypeError` for non-strings.
- Any whitespace (`\s`) separates words: spaces, tabs, newlines, form feeds, and
  non-breaking space (`\u00A0`).
- Leading, trailing, and repeated whitespace are ignored.
- Punctuation attaches to its word (`"don't stop"` is `2`).

### Examples

```text
countWords("")                     // => 0
countWords("   ")                  // => 0
countWords("hello")                // => 1
countWords("  hello   world  ")    // => 2
countWords("one\ttwo\nthree")      // => 3
countWords("a\u00A0b")             // => 2   (NBSP is whitespace)
countWords("don't stop")           // => 2
countWords("👋 world")              // => 2
```

### Approach

A word count is a **state machine**: you are either inside a word or outside it, and the
count increments on each outside→inside transition. One pass with an `inWord` flag does
this in `O(n)` time and `O(1)` extra space — strictly better than `split`, which allocates
an array of all words.

Two details make it correct rather than merely plausible:

- **Test `\s`, not `" "`.** The naive `split(" ")` gives `"one\ttwo"`.length of 1 (a
  single "word" containing a tab) and counts consecutive spaces as empty entries; a
  regex-based test handles every Unicode whitespace character.
- **Iterate code points** with `for...of`, not `str.split("")`. An astral character is two
  UTF-16 units; a code-unit loop still counts it correctly here, but `for...of` makes the
  intent explicit and keeps the function consistent with the rest of the chapter.

Keep the whitespace test as a **non-global** regex. A global regex with `.test` mutates
`lastIndex` between calls, so `const re = /\s/g; re.test("a"); re.test("a")` can return
`false` on the second call — a genuine, easy-to-miss bug in exactly this kind of loop. A
plain `/\s/u` has no state.

A regex one-liner also satisfies "no `split(" ")"`": `(str.match(/\S+/gu) ?? []).length`.
Mention it as the concise answer, but the manual scanner is the one that shows you can
reason about the state machine, and it streams (you can feed chunks and carry `inWord`).
Real Unicode word segmentation — where CJK is segmented without spaces and
`"U.S.A."` is three words — needs `Intl.Segmenter`; a whitespace scanner cannot see word
boundaries that are not whitespace.

### Implementation

```javascript
const WHITESPACE = /\s/u; // non-global: .test has no lastIndex state

function countWords(str) {
  if (typeof str !== "string") {
    throw new TypeError("countWords expects a string");
  }

  let count = 0;
  let inWord = false;

  for (const ch of str) {
    if (WHITESPACE.test(ch)) {
      inWord = false; // end of the current word (or still between words)
    } else if (!inWord) {
      count += 1; // outside -> inside transition starts a new word
      inWord = true;
    }
  }
  return count;
}
```

The concise equivalent, if the interviewer allows a regex match:

```javascript
function countWordsRegex(str) {
  return (str.match(/\S+/gu) ?? []).length; // [] handles null from a no-match
}
```

### Walkthrough

Take `"  hello   world  "`.

1. Characters `' '`, `' '`: whitespace, so `inWord` stays `false`.
2. `'h'`: not whitespace and `!inWord` → `count = 1`, `inWord = true`.
3. `'e','l','l','o'`: all inside the word, `inWord` already `true`, no change.
4. `' ',' ',' '`: first space flips `inWord = false`; the next two leave it `false`.
5. `'w'`: outside→inside → `count = 2`, `inWord = true`.
6. `'o','r','l','d'`: no change; trailing spaces keep `inWord = false`.

Result `2`. Now `""`: the loop body never runs, `count` stays `0`. And `"   "`: every
character is whitespace, so `count` is `0` — the empty strings that `split(" ")` would
produce never become words.

### Complexity

Time: `O(n)` — one pass, one regex test per code point. Space: `O(1)` — only the flag and
counter, regardless of input size (the regex alternative allocates `O(w)` for `w` words).

### Edge Cases

- `""` and all-whitespace strings → `0`.
- Leading, trailing, and repeated whitespace → no double counting.
- Tabs, newlines, carriage returns, form feeds, vertical tabs, and NBSP all count as
  separators.
- A single word with no whitespace → `1`.
- Emoji count as words (`"👋 world"` → `2`) because they are not whitespace.
- Punctuation stays inside its word: `"hello, world!"` → `2`, not more.
- Zero-width space (`\u200B`) and zero-width joiner (`\u200D`) are **not** in `\s`, so
  `"a\u200Bb"` is one word; state this rather than pretending it is whitespace.
- CJK text has no spaces, so `"日本語"` is `1` by this contract; real segmentation needs
  `Intl.Segmenter`.
- A global `/\s/g` regex reused with `.test` would corrupt results via `lastIndex` — keep
  it non-global.

### Interview Follow-ups

- **Regex one-liner**: `(str.match(/\S+/gu) ?? []).length`; discuss the allocation trade.
- **Count only alphabetic words**: match `/[\p{L}\p{N}]+/gu` so `"--"` is not a word; this
  changes the definition, so state it.
- **`Intl.Segmenter`**: `[...new Intl.Segmenter("en", { granularity: "word" }).segment(str)]`
  and filter `segment.isWordLike`; this is the correct answer for Chinese/Japanese and for
  punctuation-aware boundaries.
- **Streaming**: process chunks, keep `inWord` across chunk boundaries, and only increment
  on transitions; never split the count.
- **Word frequencies**: the same scanner can build a `Map` of counts, but skipping
  punctuation and case-folding changes the key space.

### Common Mistakes

- `str.split(" ").length`, which counts `""` as `1` and splits only on literal spaces.
- `str.split(" ")` on `"  a  b "`: six entries, most of them empty strings.
- Not filtering empty strings after `split(/\s+/)`, so `""` or `"   "` returns `1`.
- Testing with `/ /` instead of `/\s/`, missing tabs and NBSP.
- Reusing a global regex with `.test` and being bitten by `lastIndex`.
- Incrementing on every non-whitespace character instead of on the transition, so
  `"hello"` counts `5`.

### Takeaway

Word counting is a one-pass state machine over "inside a word or not." The transition
increment is the whole algorithm; the traps are testing `" "` instead of `\s`, and using a
stateful global regex.

## Validate Balanced Parentheses and Brackets

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `isBalanced(str)` that returns `true` when every opening bracket has a matching
closing bracket **of the same kind**, in the correct nesting order. Support `()`, `[]`,
and `{}`; all other characters are ignored.

- Signature: `isBalanced(str: string): boolean`.
- Throw `TypeError` for non-strings.
- Bracket types must match: `"(]"` is `false`, even though the counts are equal.
- Nesting must be well-ordered: `"([)]"` is `false`.
- An empty string and a string with no brackets are `true`.
- Brackets inside string/comment literals are out of scope here (see Follow-ups).

### Examples

```text
isBalanced("()[]{}")   // => true
isBalanced("([{}])")   // => true
isBalanced("")         // => true
isBalanced("abc")      // => true
isBalanced("a(b)c[d]") // => true
isBalanced("(]")       // => false  (wrong type)
isBalanced("([)]")     // => false  (interleaved)
isBalanced("(((")      // => false  (unclosed)
isBalanced(")))")      // => false  (extra closer)
isBalanced(")(")       // => false  (closer first)
isBalanced("{[()]}")   // => true
```

### Approach

The stack is the canonical answer, and the invariant is simple: **the stack always
contains exactly the currently open, not-yet-closed brackets, in order.** An opening
bracket is pushed; a closing bracket must match the top of the stack, which is popped.

The tempting shortcut — counting how many of each bracket appear and checking the counts
are equal — is wrong. It accepts `"([)]"` (two of each, correctly interleaved: `(` `[` `)`
`]` gives `1,1,1,1`) and `")("`. Matching types and order is exactly what the stack
encodes; no counter can.

Two implementation choices:

- **A map from closing to opening** (`{ ")": "(", "]": "[", "}": "{" }`) makes the closing
  branch a single lookup and comparison, and lets you extend the pair set without new
  branches.
- **A `switch`** is equivalent and slightly more explicit at first read.

The error conditions all reduce to `stack.pop() !== expectedOpener`: popping an empty stack
yields `undefined`, which never equals an opener, so an extra closer is rejected for free
without a separate `stack.length === 0` check. The final check is `stack.length === 0`, so
unclosed openers fail.

Other characters are skipped, which makes the function usable on real source text. If the
input may be malformed or very long, you can
throw with the offending index instead of returning a boolean — useful in interviews where
they ask for diagnostics rather than a yes/no.

### Implementation

```javascript
const OPENERS = new Set(["(", "[", "{"]);
const CLOSER_TO_OPENER = { ")": "(", "]": "[", "}": "{" };

function isBalanced(str) {
  if (typeof str !== "string") {
    throw new TypeError("isBalanced expects a string");
  }

  const stack = [];

  for (const ch of str) {
    if (OPENERS.has(ch)) {
      stack.push(ch); // remember which kind is open
    } else if (Object.hasOwn(CLOSER_TO_OPENER, ch)) {
      // An empty stack makes pop() undefined, so extra closers fail here.
      if (stack.pop() !== CLOSER_TO_OPENER[ch]) return false;
    }
    // Anything else is not a bracket and is ignored.
  }

  return stack.length === 0; // leftover openers mean it never balanced
}
```

A diagnostics variant that reports where it broke:

```javascript
function firstUnbalancedIndex(str) {
  const stack = []; // entries: { ch, index }
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (OPENERS.has(ch)) {
      stack.push({ ch, index: i });
    } else if (Object.hasOwn(CLOSER_TO_OPENER, ch)) {
      const top = stack.pop();
      if (!top || top.ch !== CLOSER_TO_OPENER[ch]) return i; // mismatched closer
    }
  }
  return stack.length === 0 ? -1 : stack[0].index; // first unclosed opener
}
```

### Walkthrough

Take `"([{}])"`.

1. `(`: opener → push → `["("]`.
2. `[`: opener → push → `["(", "["]`.
3. `{`: opener → push → `["(", "[", "{"]`.
4. `}`: closer, expects `"{"`. `pop()` returns `"{"` → match; stack `["(", "["]`.
5. `]`: expects `"["`. `pop()` returns `"["` → match; stack `["("]`.
6. `)`: expects `"("`. `pop()` returns `"("` → match; stack `[]`.
7. End: `stack.length === 0` → `true`.

Now the trap `"([)]"`:

1. `(` push → `["("]`.
2. `[` push → `["(", "["]`.
3. `)`: expects `"("`, but `pop()` returns `"["` → mismatch → return `false`.

And `")))"`: the first `)` pops an empty stack (`undefined !== "("`) → `false`. `"((("`
pushes three, the loop ends, `stack.length === 3` → `false`.

### Complexity

Time: `O(n)` — each character is inspected once, with `O(1)` stack operations. Space:
`O(n)` in the worst case (all opening brackets, e.g. `"((((("`).

### Edge Cases

- `""` and strings without brackets → `true`; the loop does nothing and the stack is empty.
- Extra closing bracket → `pop()` on an empty stack returns `undefined` → `false`.
- Unclosed opening bracket → non-empty stack at the end → `false`.
- Wrong bracket type (`"(]"`) → top-of-stack mismatch → `false`.
- Interleaved brackets (`"([)]"`) → mismatch at the inner closer → `false`.
- Correctly nested mixes (`"{[()]}"`) → `true`.
- Non-bracket characters are ignored, so `"a(b)c"` and `"1 + (2 * 3)"` are balanced.
- Deep nesting can grow the stack but not the call stack (this is iterative), so there is
  no recursion limit; only memory bounds it.
- Brackets inside string literals, template literals, or comments are not understood;
  `"if (x) { return \"(\" }"` would see the parenthesis in the string as a real bracket.
  A lexer is required for that and belongs in Follow-ups.
- Unicode look-alike brackets (`"（"`, `"【"`) are not in the pair map and are ignored;
  extend the map if the input is not ASCII.

### Interview Follow-ups

- **Return the offending index** instead of a boolean: keep `{ ch, index }` on the stack
  and return the mismatch position or the first unclosed opener.
- **Configurable pairs** (`<>` in generics, `/* */`): pass the map in as a parameter and
  keep the same algorithm.
- **Longest valid parentheses substring** (`"(()"` → `2`): stack-of-indices or DP; not the
  same problem, but a very common next question.
- **Minimum removals to make it valid** (`"())(("`): a greedy two-pass scan or DP;
  mention it as the optimization follow-up.
- **Ignore quoted spans**: run a small tokenizer that tracks `'`, `"`, `` ` ``, and
  comments; in JS, template literals add `${...}` interpolation that nests too.
- **Streaming**: the stack generalises to a chunked reader as long as you never return
  early; you cannot conclude "balanced" until the input ends.

### Common Mistakes

- Counting each bracket type and comparing counts, which accepts `"([)]"` and `")("`.
- Forgetting the final `stack.length === 0`, so `"((("` returns `true`.
- Checking the stack length on close instead of comparing the actual bracket type.
- Using `stack.pop()` and then comparing to the *closing* character rather than the opener.
- Treating every character as a bracket, so `"a(a"` fails on letters.
- Assuming this validates code structure rather than bracket nesting; it knows nothing
  about quotes, comments, or `${}` interpolation.
- Recursing on nesting depth and hitting a stack overflow on adversarial input.

### Takeaway

Balanced brackets is a stack with one invariant: the stack top is the most recently opened
bracket, and every closer must match it. Type matching plus the final empty-stack check is
the entire correctness argument — counts are not enough.

## Decode Nested Strings (`3[a2[c]]` → `accaccacc`)

`Difficulty: Medium` `Probability: High`

### Problem

Implement `decodeString(s)` that expands a compact repeat notation: an integer `k` followed
by a bracketed group repeats that group `k` times, and groups nest.

- Signature: `decodeString(s: string): string`.
- Throw `TypeError` for non-strings, and `SyntaxError` for malformed nesting.
- Repeat counts may have more than one digit (`"12[a]"`).
- Letters outside brackets are copied verbatim.
- `"0[a]"` and `"[]"` produce `""` (a zero repeat).

### Examples

```text
decodeString("3[a]")           // => "aaa"
decodeString("3[a2[c]]")       // => "accaccacc"
decodeString("2[abc]3[cd]ef")  // => "abcabccdcdcdef"
decodeString("abc")            // => "abc"
decodeString("10[a]")          // => "aaaaaaaaaa"
decodeString("2[]")            // => ""
decodeString("0[abc]")         // => ""
decodeString("3[😀]")           // => "😀😀😀"
decodeString("a2[b]c")         // => "abbc"
```

### Approach

The notation is a context-free grammar, and two standard shapes solve it: a **stack** of
saved states, or a **recursive descent** where each `[` recurses. The stack version is the
one to write first: it has no recursion depth limit, so `"10[10[10[...]]]"` cannot blow the
call stack.

Two stacks are the classic formulation, and the insight is that at each `[` you must save
*both* halves of the current state:

- `countStack` — the repeat count accumulated just before the `[`;
- `stringStack` — the partial result built so far, which the expanded group will be
  appended to.

Then:

- digit → accumulate: `count = count * 10 + Number(ch)` (the multi-digit detail);
- `[` → push `count` and `current`, reset both;
- `]` → pop the repeat and the saved prefix, then `current = savedPrefix + current.repeat(k)`
  (`.repeat` is `O(output)`, not a loop of concatenations);
- letter → append to `current`.

On `]`, appending to the *saved prefix* is what makes nesting work: the inner group
finishes first and its expansion is placed before whatever comes after `]` — a single
`.repeat` and one concatenation per group.

A recursive version recurses on each `[` and returns the index reached, which is elegant
but is `O(depth)` call frames. State the trade-off.

Whether to throw on malformed input is a contract decision. This implementation throws
`SyntaxError` for an unmatched `]` or an unclosed `[`, which is more useful than silently
producing garbage; some interviewers prefer best-effort. Say which one you are doing.

Also note the memory reality: the output length is exponential in nesting depth, so
`"9[9[9[a]]]"` is legitimate but huge. A follow-up often asks to return only the length or
to cap the output to avoid a denial-of-service.

### Implementation

```javascript
function decodeString(s) {
  if (typeof s !== "string") {
    throw new TypeError("decodeString expects a string");
  }

  const countStack = []; // repeat counts awaiting their group
  const stringStack = []; // partial results awaiting their group
  let current = ""; // text of the group being built
  let count = 0; // digits seen since the last "["

  for (const ch of s) {
    if (ch >= "0" && ch <= "9") {
      count = count * 10 + Number(ch); // multi-digit counts accumulate
    } else if (ch === "[") {
      countStack.push(count);
      stringStack.push(current);
      count = 0;
      current = "";
    } else if (ch === "]") {
      if (countStack.length === 0) throw new SyntaxError("unmatched ']'");
      const repeat = countStack.pop();
      const prefix = stringStack.pop();
      current = prefix + current.repeat(repeat); // group is now part of its parent
    } else {
      current += ch; // a literal character
    }
  }

  if (countStack.length > 0) throw new SyntaxError("unmatched '['");
  return current;
}
```

Recursive descent, for comparison — same grammar, `O(depth)` call frames:

```javascript
function decodeStringRec(s) {
  let i = 0;
  function parse() {
    let out = "";
    while (i < s.length && s[i] !== "]") {
      if (s[i] >= "0" && s[i] <= "9") {
        let count = 0;
        while (i < s.length && s[i] >= "0" && s[i] <= "9") count = count * 10 + Number(s[i++]);
        i += 1; // consume "["
        const inner = parse();
        i += 1; // consume "]"
        out += inner.repeat(count);
      } else {
        out += s[i++];
      }
    }
    return out;
  }
  const result = parse();
  if (i !== s.length) throw new SyntaxError("unmatched ']'");
  return result;
}
```

### Walkthrough

Take `"3[a2[c]]"`. Start `current = ""`, `count = 0`, both stacks empty.

1. `'3'`: not a bracket → `count = 3`.
2. `'['`: push `count (3)` and `current ("")`; reset `count = 0`, `current = ""`.
   `countStack = [3]`, `stringStack = [""]`.
3. `'a'`: `current = "a"`.
4. `'2'`: `count = 2`.
5. `'['`: push `2` and `"a"`; reset. `countStack = [3, 2]`, `stringStack = ["", "a"]`.
6. `'c'`: `current = "c"`.
7. `']'`: repeat `2`, prefix `"a"` → `current = "a" + "c".repeat(2) = "acc"`.
   `countStack = [3]`, `stringStack = [""]`.
8. `']'`: repeat `3`, prefix `""` → `current = "" + "acc".repeat(3) = "accaccacc"`.
9. End: stacks empty → return `"accaccacc"`.

The key ordering is step 7: the inner group's expansion (`"cc"`) is appended to the saved
prefix `"a"` from the same nesting level, giving `"acc"`. Step 8 then repeats that whole
group, which is why nesting composes correctly.

### Complexity

Time: `O(n + L)` where `n` is the encoded length and `L` is the decoded output length;
`.repeat` and concatenation are linear in what they produce and each group is expanded
once. Space: `O(depth + L)` — the two stacks hold one entry per nesting level, plus the
output. The recursive version uses `O(depth)` call frames.

### Edge Cases

- Plain text with no brackets (`"abc"`) → returned unchanged; `count` stays `0`.
- Multi-digit counts: `"10[a]"` accumulates `1` then `10`, not `1` then `0`.
- Zero repeats: `"0[abc]"` and `"2[]"` → `""`; `.repeat(0)` is `""`.
- Adjacent groups: `"2[a]3[b]"` → `"aabbb"`; each group is independent.
- Literal characters between and after groups: `"a2[b]c"` → `"abbc"`.
- Deep nesting: the stack version handles arbitrary depth; the recursive one risks
  `RangeError: Maximum call stack size exceeded`.
- Malformed input: unmatched `]` or unclosed `[` throws `SyntaxError` here; decide and
  document the policy.
- `"[]"` (no digits) pushes `count = 0`, so it yields `""`; `count` was never reset by a
  digit. This is a syntax edge worth stating.
- Astral characters: `for...of` copies `😀` as one unit, so `"3[😀]"` is three emoji, not a
  broken surrogate sequence.
- Output blow-up: repeat counts multiply, so `"9[9[9[a]]]"` is ~729 characters per level
  and larger inputs can exhaust memory; a production parser caps the output size.
- Negatives are impossible to encode; `"-1[a]"` is literal text because `-` is not a digit.

### Interview Follow-ups

- **Encode the reverse** (`encodeString`, run-length-ish compression) and discuss why it is
  not the exact inverse: `"aaa"` can encode as `"3[a]"` or `"a3"`-style variants.
- **Return the decoded length only**, without materialising the string, by keeping counts
  as multipliers — this avoids the exponential memory blow-up.
- **Add escapes** (`\3[a]` is a literal `"3[a]"`): consume the backslash in the scanner
  before the digit branch.
- **Validate more strictly**: reject `"2[3[a]]"` (a count directly before `[`) or digits
  after `]`, and report the index.
- **Streaming/bounded decode**: emit output as groups close rather than building the whole
  string, and stop early at a byte limit.
- **Recursive descent**: rewrite it as above and compare stack depth, readability, and how
  each handles `"]]]"`.

### Common Mistakes

- Parsing only single-digit counts, so `"12[a]"` becomes `"aa"` or `"2[a]"`.
- Treating `]` as "append current to the previous group" without saving the prefix, losing
  literals that appeared before the `[` (`"a2[b]"` → `"bb"` instead of `"abb"`).
- Popping the two stacks in the wrong order (pairing a count with the wrong prefix).
- Not resetting `count`/`current` at `[`, so the group inherits stale state.
- Using recursion on deeply nested input and hitting the call-stack limit.
- Building the result with nested `for` loops plus `+=`, which is `O(L²)` instead of using
  `.repeat`.
- Silently returning a partial string on unbalanced input instead of documenting the
  policy.
- Forgetting that `for...of` is needed to keep astral characters whole.

### Takeaway

Nested decode is a stack of saved `(prefix, count)` pairs: `[` saves the state, `]` restores
it and expands the finished group with `.repeat`. The two things being saved — the digits
*and* the text before the bracket — are exactly what a one-stack solution forgets, and the
multi-digit count is the other standard trap.
