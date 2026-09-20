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
