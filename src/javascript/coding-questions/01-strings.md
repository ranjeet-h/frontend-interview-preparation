# Strings

Strings are the most common warm-up family in a JavaScript interview, and the trap is always the same: a naive `split("")`/`reverse()`/`join("")` hides the real questions. This page drills iteration over code points, frequency counting with objects and `Map`, and the parsing patterns (compression, expansion, balanced brackets) that show whether you can hold an index contract in your head.

## Reverse a String (Without `reverse()`)

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `reverseString(str)` that returns `str` reversed, **without** calling
`Array.prototype.reverse()`. The contract that actually matters is *what counts as a
character*: JavaScript strings are sequences of UTF-16 **code units**, `[...str]` and
`for...of` iterate **code points**, and **grapheme clusters** (emoji sequences, a base
letter plus a combining mark) live one level above that.

- Signature: `reverseString(str: string): string`.
- Throw `TypeError` for non-strings rather than coercing silently.
- `""` returns `""`. Return a brand-new string; the input is never mutated.

### Examples

```text
reverseString("hello")        // => "olleh"
reverseString("JavaScript")   // => "tpircSavaJ"
reverseString("")             // => ""
reverseString("ab")           // => "ba"
reverseString("😀ab")         // => "ba😀"
reverseString("mañana")       // => "anañam"
reverseString("e\u0301")      // => "\u0301e"   (base + combining mark reverses as two code points)
```

### Approach

Reversal is a swap, not a search. Two sensible shapes:

1. **Two pointers** over `[...str]` (an array of code points): swap `left`/`right` and
   move inward. `O(n)` time, `O(n)` space for the array, and a single output allocation.
2. **Accumulate by prepending** with `for...of` (`result = ch + result`). Short and
   readable, but repeated string concatenation is `O(n²)` in the worst case unless the
   engine's rope optimisation kicks in. Good to mention, not the one to ship.

The distinction the interview is probing: `str.split("")` splits **UTF-16 code units**, so
an astral character such as `😀` (a surrogate pair) becomes two broken halves. `[...str]`
and `for...of` split by **code point**, keeping surrogate pairs intact. Grapheme clusters
are a third level: `"👨‍👩‍👧"` or `"e\u0301"` are multiple code points that render as one
glyph, and correctly reversing them requires `Intl.Segmenter` — mention it rather than
hand-rolling it.

### Implementation

```javascript
function reverseString(str) {
  if (typeof str !== "string") {
    throw new TypeError("reverseString expects a string");
  }

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

For `"hello"`, `[...str]` gives `['h','e','l','l','o']`.

1. `left=0, right=4`: swap `h`/`o` → `['o','e','l','l','h']`; pointers become `1, 3`.
2. `left=1, right=3`: swap `e`/`l` → `['o','l','l','e','h']`; pointers become `2, 2`.
3. `left < right` is `false`, so the loop stops. `join("")` returns `"olleh"`.

The middle character of an odd-length string is never touched, which is correct. For
`"😀ab"`, `[...str]` is `['😀','a','b']` (three code points), so the emoji never gets split
and the result is `"ba😀"`.

### Complexity

Time: `O(n)` — one pass with `n/2` swaps. Space: `O(n)` — the code-point array is the only
extra allocation; reversing in place on a caller-supplied array would be `O(1)` extra.

### Edge Cases

- `""` → `""`; the loop never runs and `join` of `[]` is `""`.
- Single character → returned unchanged.
- Surrogate pairs (`"😀"`) stay intact because `[...str]` iterates code points.
- Combining marks (`"e\u0301"`) reverse the mark and the base letter separately; reversing
  *graphemes* needs `Intl.Segmenter` with granularity `"grapheme"`.
- `str.length` counts UTF-16 code units, so `"😀".length === 2`; do not use it to size the loop.
- Non-string input throws `TypeError` instead of stringifying `null`/objects.

### Interview Follow-ups

- **Reverse each word but keep word order:** split on spaces, reverse each word, rejoin.
- **Reverse word order:** split into words, reverse the array, rejoin — the next-but-one problem.
- **Reverse an array of characters in place:** the same two pointers with `O(1)` extra space.
- **Why is `split("")` wrong for emoji?** It splits UTF-16 code units; astral characters
  occupy two units and get separated into lone surrogates.
- **Unicode-aware version:** `Array.from(str)` equals `[...str]`; for graphemes use
  `[...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(str)].map(s => s.segment)`.

### Common Mistakes

- Calling `reverse()` — the problem forbids it and interviewers check the source.
- `str.split("").reverse().join("")`, which shreds astral characters and combining marks.
- Assuming `str.length` counts characters; it counts UTF-16 code units.
- Getting the loop bound wrong (`while (left <= right)`) and doing a pointless self-swap, or
  looping past the middle and re-reversing.
- Forgetting the empty/single-character cases and indexing `chars[-1]`.

### Takeaway

Reversal is a two-pointer swap over code points. The real question is "what is a
character?" — code units, code points, and grapheme clusters are three different answers.


## Reverse Every Word in a Sentence (Preserve Word Order)

`Difficulty: Easy` `Probability: High`

### Problem

Implement `reverseEachWord(sentence)` that reverses the characters of **each word** while
leaving the order of the words — and the exact whitespace between them — unchanged.

- A **word** is a maximal run of non-whitespace characters; punctuation stays attached
  to its word (`"hi, there"` → `"ih, ereht"`).
- Whitespace runs (spaces, tabs, newlines, multiple spaces) are preserved verbatim, so
  `"a  b"` must not collapse to `"a b"`.
- Reversing must be code-point aware, so `😀` is not split into lone surrogates.
- Signature: `reverseEachWord(sentence: string): string`; throw `TypeError` otherwise.

### Examples

```text
reverseEachWord("hello world")            // => "olleh dlrow"
reverseEachWord("The quick brown fox")    // => "ehT kciuq nworb xof"
reverseEachWord("a  b")                   // => "a  b"      (double space kept)
reverseEachWord("  leading space")        // => "  gnidael ecaps"
reverseEachWord("hi, there!")             // => "ih, !ereht"
reverseEachWord("one\ttwo\nthree")        // => "eno\towt\neerht"  (tab/newline kept)
reverseEachWord("😀ab cd")                // => "ba😀 dc"
reverseEachWord("")                       // => ""
```

### Approach

Two designs, only one of which preserves whitespace:

1. **`sentence.split(" ")` then reverse each part.** Simple, but it is wrong the moment
   there is a double space, a tab, or a newline: splitting on a single space leaves empty
   strings that get rejoined with exactly one space, so the original spacing is destroyed.
2. **`sentence.replace(/\S+/gu, reverse)`.** The regex matches each maximal run of
   non-whitespace (words) and leaves everything else — the whitespace, the punctuation
   outside words, the empty string — completely untouched. The replacement callback just
   reverses the matched word. This preserves the original string byte-for-byte except
   inside words.

A middle option is `split(/(\s+)/)` to capture separators, but then the array alternates
word/separator and you must skip the odd indices. `replace` states the intent directly.

The `u` flag makes `\S` operate on code points, so an astral character is one match unit
rather than two surrogate halves; the word reversal itself reuses the code-point-safe
`reverseString` from the previous problem.

### Implementation

```javascript
function reverseString(str) {
  const chars = [...str]; // code points
  let left = 0;
  let right = chars.length - 1;
  while (left < right) {
    [chars[left], chars[right]] = [chars[right], chars[left]];
    left += 1;
    right -= 1;
  }
  return chars.join("");
}

function reverseEachWord(sentence) {
  if (typeof sentence !== "string") {
    throw new TypeError("reverseEachWord expects a string");
  }
  // Match maximal runs of non-whitespace and reverse only those runs.
  return sentence.replace(/\S+/gu, (word) => reverseString(word));
}
```

### Walkthrough

For `"The quick  brown"` (note the double space):

1. `/\S+/gu` scans and matches `"The"` at index 0 → `reverseString("The")` → `"ehT"`.
2. The single space after it is not matched and is copied through unchanged.
3. The regex matches `"quick"` at index 4 → `"kciuq"`.
4. The **two** spaces after `"quick"` are not matched, so both are copied verbatim.
5. The regex matches `"brown"` → `"nworb"`.
6. The final output is `"ehT kciuq  nworb"`; only word interiors changed.

For `"😀ab cd"`, `\S+` (with `u`) matches `"😀ab"` as a single word; `[...word]` is
`['😀','a','b']`, so the reversed `"ba😀"` keeps the emoji whole.

### Complexity

Time: `O(n)` — each code point is visited a constant number of times (regex scan plus one
reversal of its word). Space: `O(n)` for the output string and the per-word code-point
array (which is freed word by word).

### Edge Cases

- Empty string → `""`; the regex finds no match and `replace` returns the input untouched.
- Leading/trailing whitespace is preserved because it is never part of a `\S+` match.
- Tabs, newlines, non-breaking spaces, and other Unicode whitespace all count as
  separators; `\S` is Unicode-aware, so `"a\u00a0b"` has two words.
- Punctuation adjacent to letters stays in the word and moves to the front on reversal
  (`"hi,"` → `",ih"`), which is usually what a character-level reversal means.
- Astral characters survive via the `u` flag plus `[...str]`.
- A single word returns that word reversed; the sentence is otherwise unchanged.

### Interview Follow-ups

- **Reverse the order of words instead of the letters** — the next problem; same
  tokenisation, different operation.
- **Reverse only words longer than `k`:** make the replacer conditional
  (`word.length > k ? reverseString(word) : word`).
- **Streaming/large input:** iterate with a `for...of` and only buffer the current word to
  keep memory at `O(word length)` instead of `O(sentence length)`.
- **Why not `split(" ")`?** It normalises whitespace and drops the original separators;
  interviewers use `"a  b"` to catch exactly that.

### Common Mistakes

- `sentence.split(" ").map(reverse).join(" ")`, which collapses runs of whitespace.
- Using `split("").reverse()` per word, shredding emoji and combining marks.
- Forgetting the `u` flag so `\S+` can split a surrogate pair at the boundary.
- Reversing the *array* of words (that is problem 3) instead of reversing each word.
- Assuming only the space character is whitespace; `\t`, `\n`, and `\u00a0` are too.

### Takeaway

Tokenise with a regex (`\S+`) and transform only the matches. Keeping whitespace out of
the match is what preserves the sentence's original shape without special-casing it.

## Reverse the Order of Words in a Sentence

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `reverseWordOrder(sentence)` that returns the sentence's words in reverse order.
This is the classic LeetCode 151 contract, and the contract's fine print is about
whitespace:

- A **word** is a maximal run of non-whitespace characters.
- The output joins the reversed words with **single spaces**, with no leading or trailing
  space — so runs of spaces, tabs, and newlines in the input are normalised away.
- `""` and whitespace-only input return `""`.
- Contrast with the previous problem: there the *letters inside* each word move; here the
  *words themselves* move and each word stays intact.
- Signature: `reverseWordOrder(sentence: string): string`; throw `TypeError` otherwise.

### Examples

```text
reverseWordOrder("the sky is blue")     // => "blue is sky the"
reverseWordOrder("  hello world  ")     // => "world hello"
reverseWordOrder("a good   example")    // => "example good a"
reverseWordOrder("one")                 // => "one"
reverseWordOrder("  ")                  // => ""
reverseWordOrder("")                    // => ""
reverseWordOrder("hello world hello")   // => "hello world hello"  (coincidence, not a no-op)
reverseWordOrder("hi,\tthere\nfriend")  // => "friend there hi,"
```

### Approach

The naive and correct versions look almost identical; the difference is how you split.

1. **`split(" ")` is wrong.** `"a good   example".split(" ")` yields `["a","good","","","example"]`,
   so joining produces `"example  good a"`-style garbage and the empty tokens shift positions.
2. **`split(/\s+/)` then filter.** `/\s+/` treats every whitespace run as one delimiter, so
   consecutive spaces, tabs, and newlines all collapse into a single split and produce no
   empty tokens — except at the start/end, where a leading/trailing separator creates one
   empty string that `filter(Boolean)` removes.
3. **Two-pointer swap (no `reverse()`).** If the interviewer forbids `reverse()`, swap the
   word array in place with the same two-pointer pattern as string reversal, or do the
   O(1)-extra-space *character* version noted in Follow-ups.

Ordering is preserved inside each word because the array elements are whole words; only the
array's order is inverted.

### Implementation

```javascript
function reverseWordOrder(sentence) {
  if (typeof sentence !== "string") {
    throw new TypeError("reverseWordOrder expects a string");
  }

  // /\s+/ collapses every whitespace run into one delimiter; filter drops the
  // empty token that leading/trailing whitespace produces.
  const words = sentence.split(/\s+/u).filter((word) => word.length > 0);

  // In-place swap so the solution does not depend on Array.prototype.reverse.
  let left = 0;
  let right = words.length - 1;
  while (left < right) {
    [words[left], words[right]] = [words[right], words[left]];
    left += 1;
    right -= 1;
  }

  return words.join(" ");
}
```

### Walkthrough

For `"a good   example"`:

1. `split(/\s+/)` sees the three spaces as one delimiter →
   `["a", "good", "example"]`; there is nothing to filter.
2. Two pointers: `left=0, right=2` swap → `["example","good","a"]`; now `left=1, right=1`.
3. The loop stops. `join(" ")` → `"example good a"`.

For `"  hello world  "`:

1. `split(/\s+/)` → `["", "hello", "world", ""]` (leading and trailing separators each
   produce an empty token).
2. `filter` removes both empties → `["hello", "world"]`.
3. Swap → `["world", "hello"]`; `join(" ")` → `"world hello"`.

For `"  "`, `split(/\s+/)` → `["", ""]`, filtered to `[]`, joined to `""`.

### Complexity

Time: `O(n)` for the split plus `O(w/2)` swaps (`w` = word count). Space: `O(n)` for the
word array and the output. The classic *character* in-place variant is `O(1)` extra.

### Edge Cases

- Empty and whitespace-only strings → `""`, never `undefined` or a stray space.
- Multiple/leading/trailing whitespace is normalised to single spaces.
- Single word → returned unchanged (the swap loop does not execute).
- Tabs/newlines/non-breaking spaces count as separators because `\s` is Unicode-aware.
- Punctuation stays inside its word: `"hi, there"` → `"there hi,"`.
- Astral characters are fine — words are never split internally, so surrogate pairs stay
  together without any special handling.
- Very long single word → no separator runs, so it is one token and comes back as-is.

### Interview Follow-ups

- **Do it with `O(1)` extra space** on a mutable character array: reverse the whole array,
  then reverse each word in place, then compress spaces.
- **Preserve the original whitespace** instead of normalising: capture separators with
  `split(/(\s+)/)` and rejoin in mirrored order.
- **Reverse each word too** (problem 2) and combine both to get a fully reversed sentence.
- **Streaming input:** collect words until N words are buffered, then emit them in reverse
  in fixed-size blocks to bound memory.

### Common Mistakes

- `split(" ")` without filtering, which emits empty strings and extra spaces.
- Forgetting `trim()` and getting a leading or trailing space in the output.
- Using `split("")`, which reverses characters rather than words.
- Reversing the letters of each word when the task asks to reverse the words.
- Assuming `"hello world hello"` is unchanged to prove correctness — it is a palindrome by
  coincidence; test with `"a b c"`.

### Takeaway

Reverse the *array*, not the characters. `split(/\s+/)` plus a filter is the whole
normalisation contract: whitespace becomes delimiters, and the output is single-spaced.

## Check Whether a String Is a Palindrome

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `isPalindrome(str, options)` that reports whether `str` reads the same forwards
and backwards. "Same" is ambiguous, so pin the contract with two explicit options rather
than guessing:

- `isPalindrome(str)` compares **code points exactly**: case-sensitive, punctuation and
  spaces significant.
- `ignoreCase` folds case before comparing.
- `ignoreNonAlphanumeric` strips everything that is not a Unicode letter or digit before
  comparing — the LeetCode 125 contract.
- `""` and a single character are palindromes.
- Signature: `isPalindrome(str: string, options?: { ignoreCase?: boolean; ignoreNonAlphanumeric?: boolean }): boolean`;
  throw `TypeError` for non-strings.

### Examples

```text
isPalindrome("racecar")                             // => true
isPalindrome("abba")                                // => true
isPalindrome("ab")                                  // => false
isPalindrome("")                                    // => true
isPalindrome("Madam")                               // => false  (default is case-sensitive)
isPalindrome("Madam", { ignoreCase: true })         // => true
isPalindrome("A man, a plan, a canal: Panama")      // => false  (spaces/case count)
isPalindrome("A man, a plan, a canal: Panama",
             { ignoreCase: true, ignoreNonAlphanumeric: true }) // => true
isPalindrome("12321")                               // => true
isPalindrome("a😀a")                                // => true   (code-point aware)
```

### Approach

Two pointers from both ends, moving inward, comparing as you go. Build the comparable
sequence **once** from code points (`[...source]`), so astral characters stay whole, then
walk `left`/`right` and bail on the first mismatch. This is `O(n)` time and, unlike
`str === reverseString(str)`, returns early and never materialises a second full string.

Normalisation must happen before splitting into code points, and the order is
`normalize → strip → case-fold`:

- **`normalize("NFC")`** makes canonically equivalent sequences comparable: `"é"` (one
  code point) and `"e\u0301"` (base + combining acute) are the same glyph but different
  code points, so without NFC a visually obvious palindrome fails.
- **Stripping** uses `/[^\p{L}\p{N}]+/gu`, the Unicode property classes for letters and
  digits. `\W` is the wrong tool: it is ASCII-flavoured and keeps `_`, and it drops
  accented letters that are clearly alphanumeric.
- **Case folding** with `toLowerCase()`. Note the subtlety that `toLowerCase` can change
  length for a few characters (`"İ"` → `"i\u0307"`), which is one reason to normalise
  afterwards if you ever combine both.

Two alternatives worth naming: comparing against the reversed string (simple, allocates,
and only correct if the reversal is code-point aware), and the recursive shrink
(`str[0] === str.at(-1) && isPalindrome(str.slice(1, -1))`), which is elegant but `O(n²)`
because of the slices and risks stack overflow.

### Implementation

```javascript
function isPalindrome(str, { ignoreCase = false, ignoreNonAlphanumeric = false } = {}) {
  if (typeof str !== "string") {
    throw new TypeError("isPalindrome expects a string");
  }

  let source = str.normalize("NFC"); // canonically equivalent glyphs compare equal
  if (ignoreNonAlphanumeric) {
    source = source.replace(/[^\p{L}\p{N}]+/gu, ""); // Unicode letters + digits only
  }
  if (ignoreCase) {
    source = source.toLowerCase();
  }

  const chars = [...source]; // code points, so surrogate pairs stay intact
  let left = 0;
  let right = chars.length - 1;

  while (left < right) {
    if (chars[left] !== chars[right]) return false; // early exit on first mismatch
    left += 1;
    right -= 1;
  }
  return true;
}
```

### Walkthrough

For `"A man, a plan, a canal: Panama"` with both options:

1. NFC normalisation leaves it unchanged (all ASCII).
2. Stripping `/[^\p{L}\p{N}]+/gu` removes spaces, commas, and the colon →
   `"AmanaplanacanalPanama"`.
3. `toLowerCase()` → `"amanaplanacanalpanama"` (21 chars, odd length).
4. Two pointers compare `a/a`, `m/m`, `a/a`, … inward. The 11th character is the untouched
   middle `p`. Every pair matches, so the function returns `true`.

Without the options, step 2 and 3 are skipped, so the first comparison is `"A"` vs `"a"` →
`false` immediately, which is the strict contract the defaults promise.

### Complexity

Time: `O(n)` — one normalisation pass plus one comparison pass, `n/2` comparisons.
Space: `O(n)` for the normalised string and the code-point array; the two-pointer form
adds no second string, unlike reverse-and-compare.

### Edge Cases

- `""` and single characters → `true`: `left < right` is immediately false.
- Even vs odd length: the middle code point of an odd string is never compared, correctly.
- Unicode normalization: `"é"` vs `"e\u0301"` are different code points; NFC fixes it.
- `toLowerCase` length changes (`"İ".toLowerCase()` is two code points) can shift indices if
  you case-fold after splitting; normalise and fold before deciding what "length" means.
- `ignoreNonAlphanumeric` keeps letters and digits but drops `_`, `-`, and emoji; if a
  palindrome contains emoji, strip mode may remove them, changing the answer — document it.
- Astral characters are handled by `[...str]`; indexing with `str[i]` alone would compare
  lone surrogates and still work for equality, but is fragile if reversed.
- Locale-sensitive casing (Turkish dotless `ı`) is not handled by `toLowerCase()` without
  `toLocaleLowerCase("tr")`; state the limitation rather than pretending.

### Interview Follow-ups

- **Valid palindrome after deleting at most one character:** on a mismatch, try skipping
  the left or the right character and re-check the inner substring.
- **Longest palindromic substring:** expand around every centre (and between centres) in
  `O(n²)`, or Manacher's algorithm in `O(n)`.
- **Ignore only punctuation, keep spaces:** drop the `\s` removal and treat spaces as
  significant characters.
- **Recursive version:** show it, then explain the `O(n²)` slicing and stack-depth costs.
- **Streaming palindrome check** over a very large input: keep a stack for the first half
  and compare as the second half arrives.

### Common Mistakes

- Forgetting the contract: the same input is both `true` and `false` depending on
  `ignoreCase`/`ignoreNonAlphanumeric`, so always state which mode is being tested.
- Using `\W` for "non-alphanumeric", which keeps `_` and is not Unicode-friendly.
- Skipping Unicode normalization, so combining-accent text fails unexpectedly.
- `str.split("").reverse().join("")` for the comparison, which mangles astral characters.
- Reversing the whole string when an early-exit two-pointer scan is cheaper.
- Off-by-one in the recursion (`slice(1, -1)`) or forgetting the empty base case.

### Takeaway

A palindrome check is two pointers that meet in the middle, plus a clearly stated
normalisation policy. Normalise (NFC), optionally strip and case-fold, split into code
points, then compare from both ends with an early exit.

## Check Whether Two Strings Are Anagrams

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `areAnagrams(a, b, options)` that reports whether `a` and `b` are anagrams —
the same multiset of characters in a different order.

- Default comparison is **code-point exact**: case-sensitive and whitespace-significant.
- `ignoreCase` folds case first; `ignoreWhitespace` removes all whitespace first.
- Both inputs must be strings, else `TypeError`.
- The invariant: anagram if and only if, for every character, `count(a, ch) === count(b, ch)`.
- Signature: `areAnagrams(a: string, b: string, options?: { ignoreCase?: boolean; ignoreWhitespace?: boolean }): boolean`.

### Examples

```text
areAnagrams("listen", "silent")                                  // => true
areAnagrams("rail safety", "fairy tales", { ignoreWhitespace: true }) // => true
areAnagrams("Hello", "hello")                                    // => false (case differs)
areAnagrams("Hello", "hello", { ignoreCase: true })              // => true
areAnagrams("aab", "abb")                                        // => false (counts differ)
areAnagrams("abc", "ab")                                         // => false (lengths differ)
areAnagrams("", "")                                              // => true
areAnagrams("abc", "")                                           // => false
areAnagrams("😀ab", "ba😀")                                      // => true (code points)
areAnagrams("debit card", "bad credit", { ignoreWhitespace: true }) // => true
```

### Approach

Two standard solutions; prefer the counting one.

1. **Sort and compare.** Normalise both strings, split to an array, sort, compare. Clear,
   but `O(n log n)` and it allocates two arrays plus the sort machinery. The default
   comparator sorts by UTF-16 code unit, which is fine for equality but easy to
   mis-explain.
2. **Count and cancel.** Normalise both, split into code points, build a `Map` of counts
   for the first string, then decrement against the second. Any missing character or any
   leftover count means not an anagrams. This is `O(n)` and works on any alphabet, not just
   `a–z`.

A quick **length check** first is the cheapest possible rejection: anagrams must have the
same number of code points. Compare `[...x].length`, not `x.length`, so surrogate pairs are
counted as one character each.

Two correctness details a naive answer misses:

- **Unicode normalization.** `"é"` (U+00E9) and `"e\u0301"` (e + combining acute) look
  identical but have different code points, so they are *not* anagrams without
  `.normalize("NFC")`. Normalise both before comparing.
- **Key safety.** Build counts in a `Map`, not a plain object, so characters like
  `"__proto__"` or `"constructor"` cannot collide with inherited properties and Map
  preserves clean semantics.

Normalisation order: NFC → strip whitespace → case-fold → split into code points.

### Implementation

```javascript
function areAnagrams(a, b, { ignoreCase = false, ignoreWhitespace = false } = {}) {
  if (typeof a !== "string" || typeof b !== "string") {
    throw new TypeError("areAnagrams expects two strings");
  }

  const toCodePoints = (input) => {
    let text = input.normalize("NFC"); // "é" and "e\u0301" become comparable
    if (ignoreWhitespace) text = text.replace(/\s+/gu, "");
    if (ignoreCase) text = text.toLowerCase();
    return [...text]; // code points, not UTF-16 code units
  };

  const left = toCodePoints(a);
  const right = toCodePoints(b);

  if (left.length !== right.length) return false; // cheapest rejection

  const counts = new Map();
  for (const ch of left) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1); // default 0 when unseen
  }
  for (const ch of right) {
    const remaining = counts.get(ch);
    if (!remaining) return false; // undefined (absent) or 0 (already cancelled)
    counts.set(ch, remaining - 1);
  }
  return true; // lengths matched and every count cancelled exactly
}
```

### Walkthrough

For `areAnagrams("listen", "silent")`:

1. NFC leaves both unchanged (ASCII); no whitespace or case options.
2. `left = ['l','i','s','t','e','n']`, `right = ['s','i','l','e','n','t']`; equal length 6.
3. Count `left`: `l:1, i:1, s:1, t:1, e:1, n:1`.
4. Consume `right`: `s` → 0, `i` → 0, `l` → 0, `e` → 0, `n` → 0, `t` → 0. No character
   was missing and none went negative.
5. Return `true`.

For `areAnagrams("aab", "abb")`: counts are `a:2, b:1`; consuming the second string uses
`a` twice (to 0), then `b` sees `1` and drops to `0`, then the final `b` finds `counts.get("b")`
is `0` → `!0` is `true` → returns `false`. The early length check does not fire because both
have length 3, which is exactly why the count step is required.

### Complexity

Time: `O(n)` — one pass to count, one to cancel, plus `O(n)` normalisation. Space: `O(k)`
for the `Map`, where `k` is the number of distinct code points (at most `n`). The sort
alternative is `O(n log n)` time and `O(n)` space.

### Edge Cases

- `""` vs `""` → `true` (empty maps match); `""` vs `" "` with whitespace stripping → `true`.
- Length mismatch returns `false` before any counting.
- Case and whitespace only matter when the options ask for it — state the default.
- Unicode normalization: combining marks change the comparison for accented text.
- Astral characters (`😀`) are single code points in the map, so a surrogate pair cannot be
  half-counted.
- Whitespace stripping with `\s` removes tabs/newlines too, not just spaces.
- Very large inputs: the `Map` grows with the alphabet size, not the input, for repeated text.

### Interview Follow-ups

- **Group anagrams** from an array of strings: bucket by a canonical key (sorted string or
  a counted signature), `O(total characters)` with a hash map.
- **Fixed lowercase `a–z` input:** replace the `Map` with a `new Array(26).fill(0)` and
  index by `ch.charCodeAt(0) - 97` for `O(1)` extra space.
- **Anagram of a palindrome:** at most one character may have an odd count; derive it from
  the same frequency map.
- **Streaming / huge strings:** incremental counts plus early exit when a count goes negative,
  avoiding a full second pass.
- **Why not sort?** It is `O(n log n)`; counting is linear and does not need a total order.

### Common Mistakes

- Comparing sorted strings without NFC normalisation, so visually identical accented text
  fails.
- Using `str.split("")`, splitting surrogate pairs and double-counting astral characters.
- Building counts in a plain `{}` and hitting `__proto__`/`hasOwnProperty` collisions;
  use `Map` or `Object.create(null)`.
- Forgetting that the default is case-sensitive, then reporting a wrong answer on
  `"Listen"`/`"Silent"`.
- Only checking length and set membership, which wrongly accepts `"aab"`/`"abb"`.

### Takeaway

Anagram means equal character counts. Normalise (NFC), optionally strip and fold, split
into code points, then count with a `Map` and cancel. It is `O(n)` and needs no sorting.

## Find the First Non-Repeating Character

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `firstNonRepeating(str)` that returns the first character — scanning left to
right — that appears exactly once in the whole string, or `null` if every character repeats.

- The scan order is the string's order, so `"swiss"` returns `"w"`, not `"i"`, even though
  both occur once.
- Comparison is code-point exact and case-sensitive.
- Whitespace counts as a character, so the answer can be `" "`.
- Signature: `firstNonRepeating(str: string): string | null`; throw `TypeError` for non-strings.
- Returning `null` (rather than `-1` or `""`) keeps the "not found" case distinct from a
  legitimate empty-string answer.

### Examples

```text
firstNonRepeating("swiss")      // => "w"
firstNonRepeating("aabbcc")     // => null
firstNonRepeating("aabbc")      // => "c"
firstNonRepeating("abcdef")     // => "a"
firstNonRepeating("abcabc")     // => null
firstNonRepeating("aab")        // => "b"
firstNonRepeating("")           // => null
firstNonRepeating("😀a😀")      // => "a"
firstNonRepeating("  ")         // => null  (space repeats)
firstNonRepeating("a b a")      // => "b"
```

### Approach

Two passes over the code points, using a `Map` from character to count:

1. **Count.** Walk the string once and increment `counts.get(ch) ?? 0`.
2. **Find.** Walk the string a second time and return the first character whose count is
   exactly `1`.

Both passes are `O(n)`, so the whole thing is linear. A tempting "single pass" that uses
`indexOf`/`lastIndexOf` on each character is `O(n²)` because each lookup rescans the string.

There is a neat simplification: a `Map` preserves **insertion order**, and characters are
inserted on first sighting. So after the count pass, iterating `counts` and returning the
first key with count `1` yields exactly the first non-repeating character — the second pass
over the string is unnecessary. It is equivalent because the first-inserted character with
count one *is* the earliest one in the string. The explicit second pass is still worth
writing out because it makes the "scan order" contract obvious at a glance.

For the LeetCode-style **index** variant, track the index during the scan. Careful: with a
code-point array the index is a **code-point index**, which differs from a UTF-16 index once
astral characters appear before the match. If the caller needs to slice the original string,
either return the character (and use `indexOf` only for the non-astral case) or carry a
running UTF-16 offset.

### Implementation

```javascript
function firstNonRepeating(str) {
  if (typeof str !== "string") {
    throw new TypeError("firstNonRepeating expects a string");
  }

  const chars = [...str]; // code points, so an emoji is one character
  const counts = new Map();

  for (const ch of chars) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1); // first sighting starts at 0 -> 1
  }

  for (const ch of chars) {
    if (counts.get(ch) === 1) return ch; // earliest in string order wins
  }

  return null; // everything repeated (or the string was empty)
}
```

The equivalent insertion-order variant, which skips the second pass:

```javascript
function firstNonRepeatingViaMapOrder(str) {
  const counts = new Map();
  for (const ch of str) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  for (const [ch, count] of counts) {
    if (count === 1) return ch; // Map iterates in insertion (= first-seen) order
  }
  return null;
}
```

### Walkthrough

For `"swiss"`:

1. Code points are `['s','w','i','s','s']`.
2. Count pass: `s` → 1, `w` → 1, `i` → 1, `s` → 2, `s` → 3. Final map: `s:3, w:1, i:1`.
3. Find pass in string order: `s` has count 3 (skip); `w` has count 1 → **return `"w"`**.
   Even though `i` also occurs once, `w` is earlier in the string.

For `"aabbcc"`: counts are all `2`; the find pass skips every character and returns `null`.
For `"a b a"`: counts are `a:2, " ":1, b:1`; scanning finds the space first, then `b`; the
space has count 1, so `" "` is returned. This is why "does whitespace count?" must be
answered explicitly.

### Complexity

Time: `O(n)` — two linear passes (or one plus a `Map` iteration). Space: `O(k)` for the
`Map`, where `k` is the number of distinct code points; for ASCII text that is at most 128.

### Edge Cases

- Empty string → `null`.
- Every character repeats (`"aabbcc"`) → `null`.
- Every character is unique (`"abcdef"`) → the first one, `"a"`.
- Astral characters are single map keys via `[...str]`; `split("")` would create two keys
  and report a surrogate as "non-repeating".
- Whitespace and punctuation are counted like any other character.
- The returned character is a code point; for the index variant, a code-point index is not
  a UTF-16 index when astral characters precede it.
- Case-sensitive by default: `"Aa"` has no repeats.

### Interview Follow-ups

- **Return the index instead of the character:** adapt the second pass to track the position
  (and define whether it is a code-point or UTF-16 index).
- **First non-repeating character in a stream:** maintain a doubly linked list of unique
  characters plus a map from character to its list node; a second occurrence removes the
  node, so the head is always the answer in `O(1)` per character.
- **All non-repeating characters, in order:** after counting, filter the map entries with
  count `1`.
- **`k`-th non-repeating character:** collect the ordered list and index it, or use a
  streaming structure.
- **Case-insensitive variant:** fold with `toLowerCase()` before counting and return the
  original-cased character by storing the first-seen original alongside the count.

### Common Mistakes

- Calling `indexOf` and `lastIndexOf` per character, giving `O(n²)` complexity.
- Using a plain object and hitting `__proto__`/`constructor` key collisions.
- `split("")` instead of `[...str]`, which breaks astral characters.
- Returning `""` or `-1` ambiguously; pick a sentinel that cannot be a real character.
- Assuming `Map` order can be ignored — the second pass makes string order explicit, and
  the `Map`-iteration shortcut relies on insertion order.

### Takeaway

Count once in a `Map`, then find the first character with count one. The interesting parts
are stating that scan order decides ties, returning a sentinel that cannot be a real
character, and keeping code points whole.

## Find the First Repeating Character

`Difficulty: Easy` `Probability: High`

### Problem

Implement `firstRepeating(str)` that returns the first character that is seen **for the
second time** while scanning left to right, or `null` if no character repeats.

The precise definition matters, because "first repeating" is ambiguous:

- **Scan order (this contract):** return the character whose *second occurrence* comes
  earliest. For `"abba"` that is `"b"` — at index 2, `b` is the first character found
  already present in the set.
- **First-occurrence order (the other reading):** the earliest character that will later
  reappear; for `"abba"` that is `"a"`.

Both come up in interviews, so state which one you are implementing. This page implements
scan order, which is what a single-pass `Set` naturally produces.

- Comparison is code-point exact and case-sensitive; whitespace counts.
- Signature: `firstRepeating(str: string): string | null`; throw `TypeError` for non-strings.

### Examples

```text
firstRepeating("abba")       // => "b"   (second `b` is the earliest repeat encountered)
firstRepeating("abcabc")     // => "a"   (second `a` arrives before the second `b`)
firstRepeating("aab")        // => "a"
firstRepeating("abcdef")     // => null  (all unique)
firstRepeating("a")          // => null
firstRepeating("")           // => null
firstRepeating("😀a😀b")     // => "😀"
firstRepeating("a b a")      // => "a"
firstRepeating("ABCA")       // => "A"   (case-sensitive)
```

### Approach

One pass with a `Set` of characters already seen:

1. For each code point, ask `seen.has(ch)`.
2. If yes, that is the first second-occurrence in string order — return it immediately.
3. If no, add it to the set and continue.

The `Set` is exactly the right structure: we never need counts, only "have I seen this
before?", so we stop as soon as the first duplicate appears. This is `O(n)` time in the
worst case (no repeats) and `O(k)` space.

The alternative definition ("earliest first occurrence that repeats anywhere") needs a
full count pass first, then a second scan for the first character with count `> 1` — the
same shape as the *first non-repeating* problem, but with `> 1` instead of `=== 1`. Because
that requires knowing the whole string before answering, it cannot early-exit; the `Set`
version can.

Do not confuse this with "first character that repeats **consecutively**" (`"aabba"` → `"a"`,
but `"abaab"` → `null`), which is just a comparison of neighbours and a different question.

### Implementation

```javascript
function firstRepeating(str) {
  if (typeof str !== "string") {
    throw new TypeError("firstRepeating expects a string");
  }

  const seen = new Set();

  for (const ch of str) {
    // for...of iterates code points, so an emoji is a single character
    if (seen.has(ch)) return ch; // first second-occurrence in scan order
    seen.add(ch);
  }

  return null; // no character ever repeated
}
```

The alternative, first-occurrence-order definition, in case the interviewer wants it:

```javascript
function firstRepeatingByFirstOccurrence(str) {
  const counts = new Map();
  for (const ch of str) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  for (const ch of str) {
    if (counts.get(ch) > 1) return ch; // earliest character that has any duplicate
  }
  return null;
}
```

### Walkthrough

For `"abba"`:

1. `ch = "a"`: `seen` is empty, so add `a`.
2. `ch = "b"`: not seen, add `b`. `seen = {a, b}`.
3. `ch = "b"`: `seen.has("b")` is true → **return `"b"`**. Note the scan never reaches the
   final `a`, so `a` never gets the chance to "repeat"; scan order is what decides.

For `"abcabc"`, the first three characters are all new, the fourth (`a`) is already in the
set, so the answer is `"a"` — not `"c"`, even though `c` is the character that completes the
repetition pattern later.

For `"😀a😀b"`, `for...of` yields `['😀','a','😀','b']`; the third character matches the
first, returning `"😀"` with the surrogate pair intact.

### Complexity

Time: `O(n)` — one pass with `O(1)` `Set` lookups; it can return early, so the best case is
`O(1)` when the first two characters match. Space: `O(k)`, the number of distinct code
points seen before the first repeat.

### Edge Cases

- Empty string and single character → `null`; nothing can repeat.
- Immediate repeat (`"aa..."`) → returns on the second iteration, the best case.
- All unique characters → the set holds every character and `null` is returned.
- Astral characters stay whole because of `for...of`.
- Whitespace and punctuation participate; `"a b a"` returns `"a"`.
- Case-sensitive: `"Aa"` has no repeat; `"aA"` neither.
- The two definitions can disagree (`"abba"` → `"b"` vs `"a"`), so confirm which is wanted.

### Interview Follow-ups

- **Return the index** of the first repeating character rather than the character: track the
  position in the loop (define code-point vs UTF-16 index).
- **First character repeated consecutively:** a one-line neighbour comparison; no `Set` needed.
- **First character whose frequency reaches `k`:** keep counts in a `Map` and return when a
  count first hits `k`.
- **Streaming version:** the `Set` approach is already incremental and `O(1)` amortised per
  character, so it adapts directly to an unbounded stream.
- **Detect a cycle in a sequence of arbitrary values:** same `Set`/`seen` idea, with a `Map`
  from value to first index if the position is needed.

### Common Mistakes

- Using `str.indexOf(ch) !== str.lastIndexOf(ch)` per character, which is `O(n²)`.
- Confusing this with *first non-repeating* and returning the wrong character on `"abba"`.
- Splitting with `split("")`, so a surrogate pair "repeats" as two separate half-characters.
- Building full counts and then returning the earliest *first occurrence* without noticing
  that changes the answer for inputs like `"abba"`.
- Using a plain object and colliding with prototype keys such as `"constructor"`.

### Takeaway

First repeating in scan order is a `Set` membership check in a single early-exiting pass:
if it is already there, it is the answer. The only trap is that "first" needs a definition,
and first-occurrence order is a different function.

## Count Occurrences of Every Character

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `countCharacters(str)` that returns how many times each character appears.

- Signature: `countCharacters(str: string): Map<string, number>`.
- Characters are **code points**, so `😀` is one key even though it is two UTF-16 units.
- The empty string returns an empty `Map`.
- Return type is a `Map`, not a plain object, because `Map` preserves insertion order and
  cannot collide with prototype keys. A plain-object variant is shown for completeness.

### Examples

```text
countCharacters("aabbbc")
// => Map(3) { 'a' => 2, 'b' => 3, 'c' => 1 }

countCharacters("mississippi")
// => Map(4) { 'm' => 1, 'i' => 4, 's' => 4, 'p' => 2 }

countCharacters("")       // => Map(0) {}
countCharacters("😀a😀")   // => Map(2) { '😀' => 2, 'a' => 1 }
countCharacters("a a")    // => Map(2) { 'a' => 2, ' ' => 1 }
```

`Map` iteration follows first-seen order, which is usually what you want:

```text
[...countCharacters("aabbbc")]  // => [['a',2], ['b',3], ['c',1]]
```

### Approach

One pass over the code points with a `Map`, using the "treat missing as zero" idiom:

```javascript
counts.set(ch, (counts.get(ch) ?? 0) + 1);
```

`Map.get` returns `undefined` for an unseen key, and `?? 0` turns that into a starting
count. The alternative, `counts.get(ch) + 1`, yields `NaN` on the first sighting — an easy
and embarrassingly visible bug.

**Why a `Map` rather than an object?**

- **Ordering.** `Map` iterates in insertion (first-seen) order. A plain object does not:
  keys that look like array indices (`"0"`, `"1"`, `"42"`) are reordered to the front in
  numeric order before the string keys, so a string of digits loses its original order.
- **No prototype collisions.** `obj[key]` also consults `Object.prototype`, so a key such as
  `constructor` or `__proto__` is hazardous when counting *tokens*. Single-character keys
  make that unlikely, but a `Map` removes the concern entirely.
- **Accurate size.** `map.size` is a property; `Object.keys(obj).length` builds an array.

If the caller wants a plain object, convert at the boundary with `Object.fromEntries(map)`.
If you must build the object directly, use `Object.create(null)` as the seed so there is no
prototype to collide with.

For performance on large ASCII input, a `Uint32Array(128)` indexed by
`ch.codePointAt(0)` is faster than a `Map` because it needs no hashing; mention it as the
optimisation, not the default.

Normalisation (`str.normalize("NFC")`) is appropriate if you want `"é"` and `"e\u0301"` to
count as the same character; otherwise they are distinct code points, and the default
should be the exact code points unless stated otherwise.

### Implementation

```javascript
function countCharacters(str) {
  if (typeof str !== "string") {
    throw new TypeError("countCharacters expects a string");
  }

  const counts = new Map();

  for (const ch of str) {
    // for...of iterates code points; `?? 0` seeds unseen keys
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }

  return counts;
}

// Optional boundary helper: hand callers a plain object when they prefer one.
function countCharactersAsObject(str) {
  // Object.create(null) avoids inherited keys like `constructor`.
  const counts = Object.create(null);
  for (const ch of str) {
    counts[ch] = (counts[ch] ?? 0) + 1;
  }
  return counts;
}
```

### Walkthrough

For `"mississippi"`:

1. `m`: unseen → `get` is `undefined`, `?? 0` gives `0`, set `m:1`.
2. `i`: unseen → `i:1`.
3. `s`: unseen → `s:1`.
4. `s`: seen → `1 + 1` → `s:2`.
5. `i`: seen → `i:2`.
6. The remaining `ssippi` continue: `s` climbs to 4, `i` climbs to 4, `p` goes to 1 then 2.
7. Final map in first-seen order: `m:1, i:4, s:4, p:2`; `size` is `4`.

For `"😀a😀"`: `for...of` yields `['😀','a','😀']`, so `😀` is counted twice under one key
and `size` is `2`. Using `str.split("")` here would produce four keys — two per emoji — and
double the reported size.

### Complexity

Time: `O(n)` — one pass, `O(1)` average per `Map` operation. Space: `O(k)` for the map,
where `k` is the number of distinct code points (at most the alphabet size; at most `n`).

### Edge Cases

- Empty string → empty `Map`, not `null` or `{}` with extra keys.
- Whitespace, newlines, and tabs are counted as characters; filter them first if unwanted.
- Astral characters are one key because of `for...of`.
- Digits as characters: in the **object** variant they are reordered to the front; the
  `Map` variant keeps first-seen order.
- Unicode normalization is not applied by default; `"é"` and `"e\u0301"` count separately
  unless you normalise.
- Surrogate halves never appear as keys with `for...of`; with `.split("")` they do.
- Very long strings stay `O(k)` memory because counts are aggregated.

### Interview Follow-ups

- **Count words instead of characters:** split on `/\s+/` (after trimming) and count tokens;
  here the prototype-collision argument for `Map` is stronger because `"constructor"` is a
  plausible word.
- **Top `k` frequent characters:** count, then partial-sort with a size-`k` min-heap for
  `O(n + k log k)` instead of sorting everything.
- **ASCII-only fast path:** `Uint32Array(256)` indexed by code unit; no hashing, no `Map`.
- **Streaming counts:** the same loop, called incrementally on chunks; store the `Map`
  across calls.
- **Sorted output by count:** `[...counts].sort((a, b) => b[1] - a[1])`; remember `Map`
  itself keeps insertion order, not count order.

### Common Mistakes

- `counts.get(ch) + 1` without a default, producing `NaN` on every first occurrence.
- `str.split("")` instead of `[...str]`/`for...of`, splitting surrogate pairs.
- Building a plain object and expecting insertion order, then being surprised that the
  digit keys moved to the front.
- Using `obj[ch]` on an object whose prototype can shadow the key.
- Forgetting that `Map` has `.size`, not `.length`, and writing `map.size()`.

### Takeaway

Counting is one pass with `?? 0` for the default. Choose `Map` over a plain object so order
is insertion-based and prototype keys cannot interfere; convert to an object only at the
API boundary.

## Find the Most Frequent Character

`Difficulty: Easy` `Probability: High`

### Problem

Implement `mostFrequent(str)` that returns the character that occurs the most times, or
`null` for the empty string.

- Comparison is code-point exact and case-sensitive; whitespace counts.
- Ties are the interesting part. This implementation breaks them by **whichever character
  reaches the final maximum count first** during the scan. A two-pass variant that breaks
  ties by **earliest first occurrence** is shown alongside, because the two can disagree.
- Signature: `mostFrequent(str: string): string | null`; throw `TypeError` for non-strings.

### Examples

```text
mostFrequent("aabbbc")     // => "b"   (b:3 beats a:2)
mostFrequent("aabb")       // => "a"   (tie 2-2, `a` reaches 2 first)
mostFrequent("bbaa")       // => "b"   (tie 2-2, `b` reaches 2 first)
mostFrequent("a")          // => "a"
mostFrequent("")           // => null
mostFrequent("😀😀a")      // => "😀"
mostFrequent("abc")        // => "a"   (all tie at 1; first to reach 1 wins)
mostFrequent("xyyax")      // => "y"   (one-pass) vs "x" (first-occurrence variant)
```

The last example is the one worth memorising: `x` and `y` both end at 2, so the tie-break
rule decides the answer.

### Approach

Single pass, maintaining a running best while counting:

1. Count the current character with the `?? 0` default.
2. If this character's new count is **strictly greater** than the best so far, promote it.
3. Otherwise leave the best alone — that is what makes ties stable.

Using `>` rather than `>=` is the entire tie-break policy: once a character holds the lead,
a later character that merely ties cannot displace it. Because counts only ever increase by
one, the first character to reach a given count is the one that gets promoted at that count.

For the alternate tie-break, count everything first, then iterate the `Map` (which is in
first-seen order) and keep the first character with the largest count. Both are `O(n)`; the
one-pass version can promote mid-scan and avoids a second traversal, while the two-pass
version makes "earliest first occurrence" explicit.

A common but *different* question is the **majority** character (more than `n/2`), which has
a lovely `O(1)`-space solution: Boyer–Moore voting. Do not reach for it here — it does not
work for a general mode.

### Implementation

```javascript
function mostFrequent(str) {
  if (typeof str !== "string") {
    throw new TypeError("mostFrequent expects a string");
  }

  const counts = new Map();
  let bestChar = null;
  let bestCount = 0;

  for (const ch of str) {
    const count = (counts.get(ch) ?? 0) + 1;
    counts.set(ch, count);

    // Strict `>` keeps the incumbent on ties.
    if (count > bestCount) {
      bestCount = count;
      bestChar = ch;
    }
  }

  return bestChar; // null only for the empty string
}
```

The first-occurrence tie-break variant:

```javascript
function mostFrequentByFirstOccurrence(str) {
  const counts = new Map();
  for (const ch of str) counts.set(ch, (counts.get(ch) ?? 0) + 1);

  let bestChar = null;
  let bestCount = 0;
  for (const [ch, count] of counts) {
    // Map iterates in first-seen order, so strict `>` picks the earliest starter.
    if (count > bestCount) {
      bestCount = count;
      bestChar = ch;
    }
  }
  return bestChar;
}
```

### Walkthrough

For `"aabbbc"`:

1. `a`: count 1 > 0 → best `a` at 1. `counts = {a:1}`.
2. `a`: count 2 > 1 → best `a` at 2.
3. `b`: count 1, not > 2 → best unchanged. `counts` now `{a:2, b:1}`.
4. `b`: count 2, not > 2 → best unchanged (this is the tie rule in action).
5. `b`: count 3 > 2 → best `b` at 3.
6. `c`: count 1, not > 3. Final best is `"b"`, the unique maximum.

For `"xyyax"`, the tie case:

1. `x` → 1 > 0 → best `x` at 1.
2. `y` → 1, not > 1.
3. `y` → 2 > 1 → best `y` at 2.
4. `a` → 1, not > 2.
5. `x` → 2, not > 2 → best stays `"y"`.

The first-occurrence variant instead scans the map in order `x, y, a` and returns `"x"`,
because `x` is the first character with the maximum count of 2.

### Complexity

Time: `O(n)` — one pass (or two for the variant), `O(1)` average per map operation.
Space: `O(k)` for the counts, `k` = distinct code points; `O(1)` extra for the running best.

### Edge Cases

- Empty string → `null`; with `bestCount = 0` nothing is ever promoted.
- All characters unique → the first character is returned, since it is first to reach 1.
- Exact ties → the chosen tie-break decides; document it and test `"aabb"` vs `"bbaa"`.
- Astral characters are one key via `for...of`, so `"😀😀"` returns `"😀"`.
- Whitespace and punctuation compete like any other character.
- Case-sensitive: `"aA"` is a tie at 1 and returns `"a"`.
- Unicode normalization is not applied; `"é"` and `"e\u0301"` are separate keys unless you
  normalise first.
- Huge inputs: the map stays `O(k)`, so memory scales with the alphabet, not the input.

### Interview Follow-ups

- **Return all characters tied for the maximum:** a second pass collecting every key whose
  count equals `bestCount`.
- **Top `k` frequent characters:** count, then a size-`k` min-heap or bucket sort for
  `O(n + k log k)`.
- **Mode of words instead of characters:** same algorithm after tokenising on `/\s+/`.
- **Majority (`> n/2`) only:** Boyer–Moore voting, `O(n)` time and `O(1)` space; verify with
  a second pass if the guarantee is not part of the contract.
- **Streaming:** the one-pass version already maintains only the running best, so it adapts
  directly to chunks.

### Common Mistakes

- `counts.get(ch) + 1` without `?? 0`, producing `NaN` and a `NaN` answer.
- Using `>=` and silently changing the tie-break, then failing an assertion on `"aabb"`.
- Initialising `bestChar` to `""` instead of `null`, so the empty string returns `""`.
- Assuming the answer is unique and ignoring ties entirely.
- Using `split("")`, so an emoji counts as two separate candidates.
- Reaching for Boyer–Moore voting when the question is a general mode, not a majority.

### Takeaway

Track a running maximum in one pass and use strict `>` to make ties stable. The contract
detail that decides correctness is which tie-break you promise — first to reach the max,
or earliest first occurrence.

## Remove Duplicate Characters From a String

`Difficulty: Easy` `Probability: High`

### Problem

Implement `removeDuplicates(str, options)` that returns a new string containing only the
**first** occurrence of each character, in order.

- Order is preserved: the output is a subsequence of the input, not a set.
- Identity is by code point; `ignoreCase` folds for *comparison* but the **first
  occurrence's original casing is what is kept**.
- The result is a new string; the input is never mutated (strings are immutable anyway).
- Signature: `removeDuplicates(str: string, options?: { ignoreCase?: boolean }): string`;
  throw `TypeError` for non-strings.

### Examples

```text
removeDuplicates("programming")                 // => "progamin"
removeDuplicates("aabbcc")                      // => "abc"
removeDuplicates("abcABC")                      // => "abcABC"   (case-sensitive)
removeDuplicates("abcABC", { ignoreCase: true })// => "abc"      (first casing kept)
removeDuplicates("aaaa")                        // => "a"
removeDuplicates("")                            // => ""
removeDuplicates("😀a😀b")                      // => "😀ab"      (code points)
removeDuplicates("  a  b ")                     // => " ab"       (runs of spaces collapse)
removeDuplicates("banana")                      // => "ban"
```

### Approach

A `Set` of keys already emitted, plus an output array, in one pass:

1. Compute the comparison key: the code point itself, or its `toLowerCase()` when
   `ignoreCase` is set.
2. If the key is not in the set, record it and push the **original** code point — not the
   folded key — so the first casing survives.
3. Skip characters whose key was already seen.

The tempting one-liner `[...new Set(str)].join("")` is correct for the default case and
worth knowing, but it cannot express `ignoreCase` and it silently chooses "keep first" —
which happens to be the required policy here, but is invisible in the code. The explicit
loop documents both decisions.

The other common (and worse) implementation is `[...str].filter((ch, i) => str.indexOf(ch) === i)`,
which works but is `O(n²)` because each `indexOf` rescans from the start. It also compares
UTF-16 units if written with `split("")`.

Notes on correctness:

- **Preserve order.** `Set` iteration is insertion order, and pushing during the scan keeps
  the output a subsequence, which is the contract.
- **First vs last occurrence.** "Keep last" is a one-word change (delete then re-add, or
  build a `Map` from character to last index and sort), but it produces reversed-ish output
  unless you re-sort by the stored index. State which you implement.
- **Unicode.** `str.normalize("NFC")` first if canonically equivalent sequences should
  collapse; otherwise `"é"` and `"e\u0301"` are treated as different characters.

### Implementation

```javascript
function removeDuplicates(str, { ignoreCase = false } = {}) {
  if (typeof str !== "string") {
    throw new TypeError("removeDuplicates expects a string");
  }

  const seen = new Set();
  const output = [];

  for (const ch of str) {
    // for...of iterates code points, so astral characters stay whole
    const key = ignoreCase ? ch.toLowerCase() : ch;
    if (!seen.has(key)) {
      seen.add(key);
      output.push(ch); // keep the FIRST occurrence's original casing
    }
  }

  return output.join("");
}
```

### Walkthrough

For `"programming"`:

1. `p`: new → push. `output = ['p']`.
2. `r`: new → push. `['p','r']`.
3. `o`: new → push. `['p','r','o']`.
4. `g`: new → push. `['p','r','o','g']`.
5. `r`: already seen → skip.
6. `a`: new → push. `['p','r','o','g','a']`.
7. `m`: new → push. `['p','r','o','g','a','m']`.
8. `m`: seen → skip. `i`: push. `n`: push.
9. `g`: seen → skip.
10. `join("")` → `"progamin"`.

For `"abcABC"` with `ignoreCase`: keys are `a, b, c`; the first `A` maps to key `"a"`
(already present) and is skipped, so the result is `"abc"`. The originals `A`, `B`, `C` are
never pushed, which is why the first-casing rule matters.

### Complexity

Time: `O(n)` — one pass with `O(1)` average set lookups. Space: `O(k)` for the set plus
`O(n)` for the output array (the output is at most `n` characters). The `indexOf` variant is
`O(n²)` time.

### Edge Cases

- Empty string → `""`; the loop does not run and `join` of `[]` is `""`.
- All characters identical → one character (`"aaaa"` → `"a"`).
- All characters unique → the input is returned unchanged.
- Case-insensitive folding can change key length (`"İ".toLowerCase()` is two code points),
  so the key is not guaranteed to be one character; that is fine for set membership.
- Astral characters are single code points, so a repeated emoji is removed whole.
- Whitespace duplicates collapse like any other character (`"  "` → `" "`).
- Unicode normalization is not applied; combine it with `ignoreCase` if needed.

### Interview Follow-ups

- **Remove duplicates from a sorted array in place:** two pointers (write index vs read
  index), returning the new length and using `O(1)` extra space.
- **Keep the last occurrence instead of the first:** delete and re-add the key so it moves
  to the end, or store last indices and rebuild in index order.
- **Remove all characters that ever repeat** (keep only truly unique ones): count first,
  then filter by count `=== 1` — a different operation from deduplication.
- **Deduplicate words in a sentence**, preserving order: the same `Set` over tokens.
- **Grapheme-level dedupe:** segment with `Intl.Segmenter` so emoji sequences and combining
  marks are the unit of uniqueness, not code points.

### Common Mistakes

- `str.split("").filter(...)`, which splits surrogate pairs and can keep half an emoji.
- `indexOf` inside a `filter`/`map`, giving `O(n²)`.
- Using `new Set(str)` for the case-insensitive case, where folding is impossible.
- Pushing the folded key instead of the original character, lowercasing the output.
- Confusing "remove duplicates" (keep one) with "remove all repeated characters" (keep none).
- Forgetting to join the output array, or returning the `Set` itself.

### Takeaway

One `Set` of comparison keys and one output array preserve order in `O(n)`. The two
decisions to state out loud are "keep the first occurrence" and "fold case only for
comparison, not for output".

## Compress a String (Run-Length Encoding)

`Difficulty: Easy` `Probability: High`

### Problem

Implement `compress(str)` that performs run-length encoding: replace each maximal run of the
same character with the character followed by the run's length. By the stated contract, the
count is **always** written, including for runs of length 1.

- `"aaabbccccd"` → `"a3b2c4d1"`.
- Characters are code points, so a run of emoji is encoded as one character plus a count.
- `""` returns `""`; a single character returns that character followed by `"1"`.
- Signature: `compress(str: string): string`; throw `TypeError` for non-strings.

This is the encode half; the final problem decodes it. Together they are a round trip, with
one caveat about literal digits noted in Edge Cases.

### Examples

```text
compress("aaabbccccd")   // => "a3b2c4d1"
compress("abc")          // => "a1b1c1"
compress("aaaa")         // => "a4"
compress("a")            // => "a1"
compress("")             // => ""
compress("aaAA")         // => "a2A2"   (case-sensitive)
compress("😀😀😀a")      // => "😀3a1"
compress("a".repeat(12)) // => "a12"    (multi-digit count)
```

### Approach

One linear scan that tracks the current run character and its length:

1. Seed `current` with the first code point and `run = 1`.
2. For each subsequent code point, if it equals `current`, increment `run`; otherwise flush
   `current` + `String(run)` and start a new run.
3. After the loop, **flush the final run** — the classic off-by-one bug is forgetting step 3,
   which drops the last group entirely.

Two implementation details matter:

- **Iterate code points**, not code units: `[...str]` makes `"😀"` a single element so a run
  of emoji is compressed as one character. With `str[i]` you would compare lone surrogates;
  the encoding would still round-trip for well-formed input, but the intermediate string is
  not a valid character sequence and `[...str]`-based tooling breaks.
- **Collect into an array and `join`** rather than repeatedly concatenating to a string.
  Repeated `result += ...` can degrade to `O(n²)` on pathological input; `join` is linear.

State the count contract explicitly, because two conventions exist:

- **Always emit the count** (this problem, per the example `d1`).
- **Emit the count only when it is greater than 1** (LeetCode 443 and most production RLE):
  `"aaabbccccd"` → `"a3b2c4d"`. Pick one and say which; they are not interchangeable, and
  the matching decoder must follow the same rule.

If the goal is actual compression rather than the exercise, return the original string when
the encoded form is not shorter — encoding `"abc"` to `"a1b1c1"` makes it longer.

### Implementation

```javascript
function compress(str) {
  if (typeof str !== "string") {
    throw new TypeError("compress expects a string");
  }

  const chars = [...str]; // code points, not UTF-16 units
  if (chars.length === 0) return "";

  const output = [];
  let current = chars[0];
  let run = 1;

  for (let i = 1; i < chars.length; i += 1) {
    if (chars[i] === current) {
      run += 1;
    } else {
      output.push(current, String(run)); // close the previous run
      current = chars[i];
      run = 1;
    }
  }

  output.push(current, String(run)); // flush the final run
  return output.join("");
}
```

### Walkthrough

For `"aaabbccccd"`:

1. `chars = ['a','a','a','b','b','c','c','c','c','d']`; seed `current = 'a'`, `run = 1`.
2. Index 1: `'a' === 'a'` → `run = 2`. Index 2: → `run = 3`.
3. Index 3: `'b' !== 'a'` → push `"a"`, `"3"`; reset `current = 'b'`, `run = 1`.
4. Index 4: `'b'` → `run = 2`.
5. Index 5: `'c'` → push `"b"`, `"2"`; reset to `'c'`, `run = 1`.
6. Indices 6–8: three more `'c'` → `run = 4`.
7. Index 9: `'d'` → push `"c"`, `"4"`; reset to `'d'`, `run = 1`.
8. Loop ends; flush `"d"`, `"1"`. `output` is
   `['a','3','b','2','c','4','d','1']`; `join("")` → `"a3b2c4d1"`.

For a 12-character run, `run` reaches `12` and `String(12)` is `"12"`, so multi-digit counts
work without special handling — the only reason to special-case digits is the ambiguity
discussed next, not the length.

### Complexity

Time: `O(n)` — each code point is inspected once. Space: `O(n)` for the code-point array and
the output, which is at most `2n` entries after `join` (each run contributes at most a
character plus its digits).

### Edge Cases

- Empty string → `""`; the early return avoids indexing `chars[0]`.
- Single character → `"a1"` under the always-count contract.
- No runs at all (`"abc"`) → `"a1b1c1"`, longer than the input; callers who care should keep
  whichever is shorter.
- The final run must be flushed after the loop — omitting that drops the last group.
- Multi-digit counts (`"a".repeat(100)` → `"a100"`) are produced by `String(run)`.
- Astral characters are one code point via `[...str]`, so `"😀😀"` → `"😀2"`.
- **Literal digits are ambiguous.** Compressing `"a12"` gives `"a11121"`, which is not
  decodable by the simple expander because it cannot tell run counts from literal digit
  characters. RLE in this form assumes the alphabet excludes digits (or uses escapes).
- Unicode normalization is irrelevant here — encoding is about identity, and NFC does not
  change run boundaries in a way you want unless the caller asks for it.

### Interview Follow-ups

- **Decode it** — the next problem: parse a character then its digits, with a missing count
  meaning 1.
- **LeetCode 443 style, in place:** compress a character array using a read pointer and a
  write pointer, `O(1)` extra space, returning the new length.
- **Only emit counts greater than 1:** delete the `run === 1` case; then `"a"` → `"a"` and
  the decoder must default a missing count to 1.
- **Streaming compression:** emit runs as chunks arrive and hold only the current run's
  character and count, so memory is `O(alphabet)` rather than `O(n)`.
- **Byte RLE for binary data:** the same algorithm over a `Uint8Array` with a 256-entry run
  table; counts often need a fixed-width encoding to stay unambiguous.

### Common Mistakes

- Forgetting to flush the final run, so the last group vanishes.
- Using `str[i]` instead of code points, splitting surrogate pairs when a run contains emoji.
- `result += char + count` in a hot loop, which can be quadratic rather than linear.
- Emitting the count before the character (`"3a"` instead of `"a3"`).
- Mixing conventions: encoding with "always count" and decoding with "missing means 1",
  or vice versa.
- Assuming the compressed form is always shorter; for random text it usually is not.

### Takeaway

Run-length encoding is a scan with a running (character, count) pair, plus a final flush.
`[...str]` keeps code points whole, `push`/`join` keeps it linear, and the count convention
must match whichever decoder you pair with it.

## Expand a Compressed String (Decode RLE)

`Difficulty: Medium` `Probability: High`

### Problem

Implement `expand(str)`, the inverse of the previous problem: parse a sequence of
`<character><count>` pairs and expand each character `count` times.

- `"a3b2c4"` → `"aaabbcccc"`.
- A character with **no digits** after it defaults to a count of `1`: `"abc"` → `"abc"`.
- Multi-digit counts are allowed: `"a12"` → twelve `a`s.
- A count of `0` emits nothing: `"a0b2"` → `"bb"`.
- The format must be validated: a **digit in character position** (a leading digit, or a
  digit after another run was already consumed) is a `SyntaxError`, because it cannot be
  attributed to a character.
- Characters are code points; `"😀3"` means three emoji.
- Signature: `expand(str: string): string`; throw `TypeError` for non-strings.

### Examples

```text
expand("a3b2c4")     // => "aaabbcccc"
expand("a1b1c1")     // => "abc"
expand("abc")        // => "abc"           (missing counts default to 1)
expand("a")          // => "a"
expand("")           // => ""
expand("a12")        // => "aaaaaaaaaaaa"  (12 characters)
expand("a0b2")       // => "bb"            (zero repeats emits nothing)
expand("😀3a2")      // => "😀😀😀aa"
expand("a007")       // => "aaaaaaa"       (leading zeros are just digits)
expand("3a")         // => SyntaxError     (digit in character position)
```

The last two lines show the two halves of the contract: expansion is total on well-formed
input, and it **rejects** malformed input rather than guessing.

### Approach

One index-based scan over the code points:

1. Read the character at `i`. If it is a digit, throw `SyntaxError` — there is no preceding
   character for it to belong to.
2. Advance, then greedily consume consecutive digits into a string.
3. If there were **no digits**, the count is `1`; otherwise parse the digits with
   `Number(...)` (or `parseInt(digits, 10)`).
4. Append `character.repeat(count)` to an output array.
5. `join` the array once at the end.

The greedy digit loop is what makes multi-digit counts work: after reading a character, keep
consuming while the current code point is `0`–`9`.

Two design points worth stating:

- **`repeat` and zero.** `"a".repeat(0)` is `""`, which is exactly the desired "skip" and
  needs no special case. The `repeat` argument must be a non-negative integer; the format
  cannot produce negatives.
- **Digits are reserved.** Because the decoder treats digits as counts, the encoder from the
  previous problem is only invertible on inputs that contain no literal digits. Real formats
  solve this with an escape character or a length-prefixed encoding; for the exercise, say
  it out loud rather than pretending the codec is general.

A compact regex version also works:

```javascript
str.replace(/(\D)(\d*)/gu, (_, ch, digits) => ch.repeat(digits === "" ? 1 : Number(digits)));
```

With the `u` flag, `\D` matches a full code point, so it is astral-safe. Its weakness is that
a leading digit simply does not match and is **copied through unchanged** (`"3a"` → `"3a"`)
instead of throwing, and `\D` includes whitespace and punctuation, so malformed runs are
easy to miss. The explicit loop validates; the regex does not.

Guard against decompression bombs: cap the total output length (or the per-run count) so a
malicious `"a999999999"` cannot exhaust memory. `String.prototype.repeat` throws `RangeError`
if the result would exceed the engine's maximum string length, but that is a late and blunt
defence.

### Implementation

```javascript
const MAX_OUTPUT_LENGTH = 10_000_000; // refuse to build absurd strings

function expand(str) {
  if (typeof str !== "string") {
    throw new TypeError("expand expects a string");
  }

  const chars = [...str]; // code points, not UTF-16 units
  const output = [];
  let totalLength = 0;
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];

    // A digit here has no character to attach to.
    if (ch >= "0" && ch <= "9") {
      throw new SyntaxError(`Unexpected digit "${ch}" at position ${i}`);
    }
    i += 1;

    // Greedily read the count digits (there may be none).
    let digits = "";
    while (i < chars.length && chars[i] >= "0" && chars[i] <= "9") {
      digits += chars[i];
      i += 1;
    }

    const count = digits === "" ? 1 : Number(digits);
    totalLength += count;
    if (totalLength > MAX_OUTPUT_LENGTH) {
      throw new RangeError("expanded output would be too large");
    }

    output.push(ch.repeat(count)); // repeat(0) is "" — nothing to special-case
  }

  return output.join("");
}
```

### Walkthrough

For `"a3b2c4"`:

1. `i = 0`: `ch = 'a'` is not a digit. Advance to `i = 1`.
2. Consume digits: `'3'` → `digits = "3"`, `i = 2`. `'b'` stops the loop.
3. `count = Number("3") = 3`; push `"aaa"`.
4. `i = 2`: `ch = 'b'`. Advance; consume `"2"`; push `"bb"`; `i = 4`.
5. `i = 4`: `ch = 'c'`. Advance; consume `"4"`; push `"cccc"`; `i = 6`.
6. Loop ends. `output = ["aaa","bb","cccc"]`; `join("")` → `"aaabbcccc"`.

For `"3a"`: `i = 0`, `ch = '3'` is a digit → `SyntaxError` before any output is produced,
so the failure is loud and immediate. For `"abc"`: each character consumes no digits, so each
gets count 1 and the output is `"abc"` unchanged. For `"a0b2"`: `a` repeats 0 times (`""`),
then `b` repeats twice → `"bb"`.

### Complexity

Time: `O(m + L)` where `m` is the number of runs (characters plus digits scanned) and `L` is
the length of the expanded output — building the string is necessarily proportional to its
size. Space: `O(L)` for the output plus `O(r)` transient per-run strings; the code-point
array is `O(m)`. Validation is `O(m)` and does not allocate.

### Edge Cases

- Empty string → `""`; the loop never runs.
- Missing count → defaults to 1, so uncompressed input passes through.
- Count `0` → emits nothing; `repeat(0)` handles it without a branch.
- Multi-digit counts and leading zeros (`"a007"` → 7) work because digits are parsed as a
  decimal number, not by length.
- A leading digit, or a digit after a run was consumed, throws `SyntaxError`; do not
  silently copy it.
- Astral characters are single code points, so `"😀3"` produces three whole emoji.
- Only ASCII digits `0`–`9` are counts; `-`, `+`, `.`, and Unicode digits such as `"٣"` are
  treated as literal characters, which is a deliberate (and documentable) limitation.
- Decompression bombs: cap the output length; otherwise `"a999999999"` is a memory-exhaustion
  vector.
- Literal digits cannot be round-tripped; the encoder is only invertible when the alphabet
  excludes digits.

### Interview Follow-ups

- **Round-trip test:** `expand(compress(s)) === s` for strings with no literal digits; add a
  property-based test over random alphabets.
- **Escaping:** extend the grammar to `\` escapes (or a sentinel) so digits in the payload
  are representable, then re-derive the parser.
- **Regex vs parser:** show the `replace` one-liner, then explain why it cannot validate and
  why a real codec needs a proper scanner.
- **Streaming decode:** emit each run as soon as its digits are read, keeping only `O(1)`
  state instead of the whole code-point array.
- **Alternative encodings:** length-prefixed or index-plus-count formats avoid the
  character/count ambiguity entirely and are what production compression uses.

### Common Mistakes

- `Number(digits) || 1`, which turns a legitimate count of `0` into `1`; use an explicit
  `digits === ""` check.
- Forgetting to skip past the digits after parsing, causing an infinite loop or re-reading
  `'3'` as a character.
- Using `parseInt(digits)` without a radix (harmless for decimal digits but sloppy), or
  `parseFloat`, which accepts stray characters.
- Splitting with `str.split("")`, which breaks astral characters.
- Not validating leading digits, so `"3a"` silently passes through as `"3a"`.
- Unbounded expansion from untrusted input — a real security concern, not a theoretical one.
- Off-by-one when flushing the last run because the parser was written as a `for` loop with
  a `+1` lookahead.

### Takeaway

Decoding is a scanner: read a character, greedily read its digits, repeat, and validate
digits that appear where a character belongs. `repeat(0)` naturally means "emit nothing",
and the real engineering concerns are validation and bounding the output size.

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

