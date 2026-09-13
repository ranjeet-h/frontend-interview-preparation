# Backend Coding Questions

Imported from `Backend_Coding_Questions.csv`. Exact duplicate prompts were removed during generation.

## Question index

| # | Category | Question |
|---|---|---|
| 1 | EASY | [Reverse a String](#1-reverse-a-string) |
| 2 | EASY | [Find Maximum in Array](#2-find-maximum-in-array) |
| 3 | EASY | [Count Occurrences](#3-count-occurrences) |
| 4 | EASY | [Palindrome Check](#4-palindrome-check) |
| 5 | EASY | [Two Sum](#5-two-sum) |
| 6 | MEDIUM | [LRU Cache Implementation](#6-lru-cache-implementation) |
| 7 | MEDIUM | [Merge Sorted Arrays](#7-merge-sorted-arrays) |
| 8 | MEDIUM | [Find First Duplicate](#8-find-first-duplicate) |
| 9 | MEDIUM | [Valid Parentheses](#9-valid-parentheses) |
| 10 | MEDIUM | [Longest Substring Without Repeating](#10-longest-substring-without-repeating) |
| 11 | MEDIUM | [Group Anagrams](#11-group-anagrams) |
| 12 | HARD | [Implement LRU Cache from scratch](#12-implement-lru-cache-from-scratch) |
| 13 | HARD | [Binary Tree Level Order Traversal](#13-binary-tree-level-order-traversal) |
| 14 | HARD | [Longest Increasing Subsequence](#14-longest-increasing-subsequence) |
| 15 | HARD | [Word Ladder](#15-word-ladder) |
| 16 | HARD | [Regular Expression Matching](#16-regular-expression-matching) |
| 17 | HARD - System Design | [Design a URL Shortener](#17-design-a-url-shortener) |
| 18 | HARD - System Design | [Design a Rate Limiter](#18-design-a-rate-limiter) |
| 19 | HARD - System Design | [Cache Invalidation Strategy](#19-cache-invalidation-strategy) |

---

## EASY

### 1. Reverse a String

**Input**
```text
Input string: "hello"
```

**Expected output**
```text
Output string: "olleh"
```

#### Problem summary
Given a string, return it with characters in reverse order.

#### Approach
Convert to an array, use `.reverse()`, then join back. For an in-place feel, use a two-pointer swap on the char array.

#### Implementation

```js
// O(n) time, O(n) space — idiomatic one-liner
function reverseString(s) {
  return s.split('').reverse().join('');
}

// Two-pointer version (useful when mutation is allowed)
function reverseStringInPlace(arr) {
  let left = 0, right = arr.length - 1;
  while (left < right) {
    [arr[left], arr[right]] = [arr[right], arr[left]];
    left++;
    right--;
  }
  return arr.join('');
}

console.log(reverseString('hello'));          // "olleh"
console.log(reverseStringInPlace([...'hello'])); // "olleh"
```

#### Complexity
| | Value |
|---|---|
| Time | O(n) |
| Space | O(n) — new array/string |

#### Explanation / edge cases
- Empty string `""` → returns `""` (both versions handle it).
- Single character `"a"` → returns `"a"`.
- Unicode surrogate pairs (emoji) can break naïve `split('')`; use `[...s]` spread instead for full Unicode safety.

---

### 2. Find Maximum in Array

**Input**
```text
Input array: [3, 7, 2, 9, 1]
```

**Expected output**
```text
Output: 9
```

#### Problem summary
Return the largest number in a non-empty array of numbers.

#### Approach
Single linear scan tracking the current maximum. `Math.max(...arr)` is a clean alternative but can overflow the call-stack for very large arrays.

#### Implementation

```js
function findMax(arr) {
  if (arr.length === 0) throw new Error('Empty array');
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
}

// Alternatively: Math.max(...arr) for small arrays
// For large arrays use: arr.reduce((m, v) => (v > m ? v : m), -Infinity)

console.log(findMax([3, 7, 2, 9, 1])); // 9
```

#### Complexity
| | Value |
|---|---|
| Time | O(n) |
| Space | O(1) |

#### Explanation / edge cases
- Negative-only arrays: initialise `max = arr[0]`, not `0`, to avoid returning `0` incorrectly.
- Single-element array `[5]` → returns `5`.
- `Math.max(...arr)` throws `RangeError` on arrays with ~125 000+ elements due to call-stack limits.

---

### 3. Count Occurrences

**Input**
```text
Input array: [1, 2, 2, 3, 3, 3]
```

**Expected output**
```text
Output: {1: 1, 2: 2, 3: 3}
```

#### Problem summary
Given an array, return a frequency map where each key is a unique element and the value is its count.

#### Approach
One pass with a hash map (`{}` or `Map`). `Map` is preferable when keys can be non-string types.

#### Implementation

```js
function countOccurrences(arr) {
  const freq = new Map();
  for (const val of arr) {
    freq.set(val, (freq.get(val) ?? 0) + 1);
  }
  return freq;
}

// Plain-object version when keys are strings/numbers
function countOccurrencesObj(arr) {
  return arr.reduce((acc, val) => {
    acc[val] = (acc[val] ?? 0) + 1;
    return acc;
  }, {});
}

console.log(countOccurrencesObj([1, 2, 2, 3, 3, 3])); // { '1': 1, '2': 2, '3': 3 }
```

#### Complexity
| | Value |
|---|---|
| Time | O(n) |
| Space | O(k) — k = distinct values |

#### Explanation / edge cases
- Empty array → returns an empty map `{}`.
- Object keys are always strings in JS; use `Map` to preserve numeric/object keys.
- Works for string arrays too: `countOccurrencesObj(['a','b','a'])` → `{ a: 2, b: 1 }`.

---

### 4. Palindrome Check

**Input**
```text
Input string: "racecar"
```

**Expected output**
```text
Output: true (it is a palindrome)
```

#### Problem summary
Determine whether a string reads the same forwards and backwards, ignoring case and non-alphanumeric characters (interview standard).

#### Approach
Two-pointer technique: compare characters from both ends moving inward. Skip non-alphanumeric chars, normalise to lowercase.

#### Implementation

```js
function isPalindrome(s) {
  // Normalise: lowercase, keep only alphanumeric
  const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  let left = 0, right = clean.length - 1;
  while (left < right) {
    if (clean[left] !== clean[right]) return false;
    left++;
    right--;
  }
  return true;
}

console.log(isPalindrome('racecar'));          // true
console.log(isPalindrome('A man, a plan, a canal: Panama')); // true
console.log(isPalindrome('hello'));            // false
```

#### Complexity
| | Value |
|---|---|
| Time | O(n) |
| Space | O(n) — cleaned string (O(1) if we skip the clean step and use two pointers on the raw string) |

#### Explanation / edge cases
- Empty string or single character → `true` by convention.
- `"A man, a plan, a canal: Panama"` is a classic trick — passes after normalisation.
- For strict palindrome (no cleaning), remove the `.replace()` call.

---

### 5. Two Sum

**Input**
```text
Input array: [2, 7, 11, 15], target: 9
```

**Expected output**
```text
Output: [0, 1] (indices of 2 and 7)
```

#### Problem summary
Find two indices `i` and `j` in `nums` such that `nums[i] + nums[j] === target`. Each index used at most once.

#### Approach
Hash map: for each element store its index. On each step check if `target - nums[i]` already exists in the map.

#### Implementation

```js
function twoSum(nums, target) {
  const seen = new Map(); // value -> index
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) {
      return [seen.get(complement), i];
    }
    seen.set(nums[i], i);
  }
  return []; // no solution
}

console.log(twoSum([2, 7, 11, 15], 9));  // [0, 1]
console.log(twoSum([3, 2, 4], 6));       // [1, 2]
```

#### Complexity
| | Value |
|---|---|
| Time | O(n) |
| Space | O(n) — hash map |

#### Tradeoffs
| Approach | Time | Space |
|---|---|---|
| Brute force (nested loops) | O(n²) | O(1) |
| Sort + two-pointer (returns values, not indices) | O(n log n) | O(1) |
| Hash map (above) | O(n) | O(n) |

#### Explanation / edge cases
- `[3, 3]` with target `6` → `[0, 1]`. The map stores index, and we look up before inserting, so a number can be paired with itself only if it appears twice.
- Guarantees exactly one solution (per LeetCode constraint), but the implementation returns `[]` defensively.

---

## MEDIUM

### 6. LRU Cache Implementation

**Input**
```text
Operations: put(1,1), put(2,2), get(1), put(3,3), get(2) with capacity 2
```

**Expected output**
```text
get(1) returns 1, get(2) returns -1 (evicted)
```

#### Problem summary
Implement a Least-Recently-Used cache with O(1) `get` and O(1) `put`. When capacity is exceeded, evict the least-recently-used entry.

#### Approach
JavaScript's built-in `Map` preserves insertion order and provides O(1) access. Leverage this: on every access, delete and re-insert the key so it moves to the "most recent" position. The first key in the map is always the LRU candidate.

#### Implementation

```js
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return -1;
    // Move to most-recently-used position
    const val = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  put(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key); // refresh position
    } else if (this.cache.size === this.capacity) {
      // Evict LRU: first key in insertion order
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, value);
  }
}

// Trace: capacity = 2
const lru = new LRUCache(2);
lru.put(1, 1);
lru.put(2, 2);
console.log(lru.get(1)); // 1  → key 1 is now MRU
lru.put(3, 3);           // capacity full, evicts key 2 (LRU)
console.log(lru.get(2)); // -1 (evicted)
```

#### Complexity
| | Value |
|---|---|
| Time | O(1) for `get` and `put` |
| Space | O(capacity) |

#### Explanation / edge cases
- `Map` guarantees O(1) amortised `delete`/`set` and O(1) `keys().next()` to peek the oldest entry.
- This approach relies on V8's (and the spec's) insertion-order guarantee for `Map`.
- See **Q12** for a fully manual doubly-linked-list + HashMap implementation (required when language primitives cannot be used).

---

### 7. Merge Sorted Arrays

**Input**
```text
Input: array1 = [1, 3, 5], array2 = [2, 4, 6]
```

**Expected output**
```text
Output: [1, 2, 3, 4, 5, 6]
```

#### Problem summary
Given two sorted arrays, merge them into one sorted array without using a built-in sort.

#### Approach
Two-pointer technique: maintain a pointer for each array, compare the current elements, append the smaller one to the result, advance that pointer.

#### Implementation

```js
function mergeSortedArrays(a, b) {
  const result = [];
  let i = 0, j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) {
      result.push(a[i++]);
    } else {
      result.push(b[j++]);
    }
  }

  // Append any remaining elements
  while (i < a.length) result.push(a[i++]);
  while (j < b.length) result.push(b[j++]);

  return result;
}

console.log(mergeSortedArrays([1, 3, 5], [2, 4, 6])); // [1,2,3,4,5,6]
console.log(mergeSortedArrays([1, 2], [3, 4, 5, 6])); // [1,2,3,4,5,6]
console.log(mergeSortedArrays([], [1, 2]));            // [1,2]
```

#### Complexity
| | Value |
|---|---|
| Time | O(m + n) |
| Space | O(m + n) — result array |

#### Explanation / edge cases
- One or both arrays empty: the trailing while-loops handle the remaining elements.
- Duplicate values across arrays are preserved correctly (uses `<=`).
- In-place merge (LeetCode 88) starts from the end to avoid shifting — worth knowing for follow-ups.

---

### 8. Find First Duplicate

**Input**
```text
Input array: [1, 3, 4, 2, 2]
```

**Expected output**
```text
Output: 2 (first duplicate found)
```

#### Problem summary
Return the first element that appears more than once when scanning left to right.

#### Approach
Use a `Set` to track seen values. The first element already in the set is the answer.

#### Implementation

```js
function findFirstDuplicate(arr) {
  const seen = new Set();
  for (const num of arr) {
    if (seen.has(num)) return num;
    seen.add(num);
  }
  return -1; // no duplicate
}

console.log(findFirstDuplicate([1, 3, 4, 2, 2])); // 2
console.log(findFirstDuplicate([1, 1, 2]));        // 1
console.log(findFirstDuplicate([1, 2, 3]));        // -1
```

#### Complexity
| | Value |
|---|---|
| Time | O(n) |
| Space | O(n) — set |

#### Explanation / edge cases
- "First duplicate" means the first element whose second occurrence is encountered earliest, not the element with the smallest value.
  - `[2, 1, 2, 1]` → returns `2` (second `2` is seen before second `1`).
- No duplicates → returns `-1`.
- **O(1) space variant** (if array values are in range `[1..n]`): negate `arr[arr[i]-1]` as a visited marker. Restore values afterwards.

---

### 9. Valid Parentheses

**Input**
```text
Input string: "({[]})"
```

**Expected output**
```text
Output: true (all parentheses properly matched)
```

#### Problem summary
Given a string containing `(`, `)`, `{`, `}`, `[`, `]`, determine if it is valid: every open bracket is closed in the correct order.

#### Approach
Classic stack problem. Push open brackets; on a close bracket, pop from the stack and verify it matches.

#### Implementation

```js
function isValid(s) {
  const stack = [];
  const pairs = { ')': '(', '}': '{', ']': '[' };

  for (const ch of s) {
    if ('({['.includes(ch)) {
      stack.push(ch);
    } else {
      // Close bracket: top of stack must be the matching open
      if (stack.pop() !== pairs[ch]) return false;
    }
  }

  return stack.length === 0; // all opens must be closed
}

console.log(isValid('({[]})'));  // true
console.log(isValid('(]'));      // false
console.log(isValid('([)]'));    // false
console.log(isValid(''));        // true (empty is valid)
```

#### Complexity
| | Value |
|---|---|
| Time | O(n) |
| Space | O(n) — stack |

#### Explanation / edge cases
- `"([)]"` is `false` — closing in the wrong order even though counts match.
- Odd-length strings are always `false` (early-exit optimisation: `if (s.length % 2 !== 0) return false`).
- Empty string returns `true`.
- The `pairs` map keeps the matching logic declarative and easy to extend.

---

### 10. Longest Substring Without Repeating

**Input**
```text
Input string: "abcabcbb"
```

**Expected output**
```text
Output: 3 (substring "abc")
```

#### Problem summary
Find the length of the longest substring with all unique characters.

#### Approach
Sliding window with a `Map` that records the last-seen index of each character. When a repeat is found, slide `left` past the previous occurrence.

#### Implementation

```js
function lengthOfLongestSubstring(s) {
  const lastIndex = new Map(); // char -> last seen index
  let max = 0;
  let left = 0;

  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (lastIndex.has(ch) && lastIndex.get(ch) >= left) {
      // Slide left past the duplicate
      left = lastIndex.get(ch) + 1;
    }
    lastIndex.set(ch, right);
    max = Math.max(max, right - left + 1);
  }

  return max;
}

console.log(lengthOfLongestSubstring('abcabcbb')); // 3
console.log(lengthOfLongestSubstring('bbbbb'));    // 1
console.log(lengthOfLongestSubstring('pwwkew'));   // 3 ("wke")
console.log(lengthOfLongestSubstring(''));         // 0
```

#### Complexity
| | Value |
|---|---|
| Time | O(n) — each character processed at most twice |
| Space | O(min(n, σ)) — σ = alphabet size (e.g. 128 for ASCII) |

#### Explanation / edge cases
- The condition `lastIndex.get(ch) >= left` is critical: a character seen before the current window should not trigger a window shrink.
- All-unique string (e.g. `"abcde"`) → returns `n`.
- Single character or empty string handled naturally.

---

### 11. Group Anagrams

**Input**
```text
Input: ["eat", "tea", "ate", "tan", "nat"]
```

**Expected output**
```text
Output: [["eat", "tea", "ate"], ["tan", "nat"]]
```

#### Problem summary
Group words that are anagrams of each other. Two words are anagrams if they contain the same characters with the same frequencies.

#### Approach
For each word, sort its characters to produce a canonical key (all anagrams share the same sorted key). Group words by this key using a `Map`.

#### Implementation

```js
function groupAnagrams(words) {
  const groups = new Map();

  for (const word of words) {
    const key = [...word].sort().join(''); // canonical sorted form
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(word);
  }

  return [...groups.values()];
}

console.log(groupAnagrams(['eat', 'tea', 'ate', 'tan', 'nat']));
// [['eat','tea','ate'], ['tan','nat']]

console.log(groupAnagrams(['a']));
// [['a']]
```

#### Complexity
| | Value |
|---|---|
| Time | O(n · k log k) — n words, k = max word length |
| Space | O(n · k) — storing all words in the map |

#### Tradeoffs
- **Alternative key (O(n·k)):** Use a character-frequency array of size 26 as the key (faster for long words with small alphabets). Avoid the sort cost entirely: `key = Array(26).fill(0); for ch of word: key[ch.charCodeAt(0)-97]++; key.join('#')`.
- The sort-based approach is simpler and fine for interview settings.

#### Explanation / edge cases
- Empty string `""` groups with other empty strings (sorted key `""`).
- Words of different lengths can never be anagrams; the sorted key naturally handles this.
- Order of groups in the result is not specified — any valid grouping is accepted.

---

## HARD

### 12. Implement LRU Cache from scratch

**Input**
```text
capacity = 3, operations: put(1,1), put(2,2), put(3,3), get(1), put(4,4)
```

**Expected output**
```text
get(1)=1, key 2 evicted, get(2)=-1
```

#### Problem summary
Build an LRU Cache **without** relying on `Map`'s insertion-order property. Must support O(1) `get` and `put`.

#### Approach
**Doubly linked list + HashMap.**
- The linked list orders nodes by recency: head (dummy) → MRU → … → LRU → tail (dummy).
- The hashmap maps `key → node` for O(1) lookup.
- `get`: look up node, move it to the front (MRU position).
- `put`: if key exists update and move to front; if at capacity remove the node just before the tail (LRU), then add new node at front.

#### Implementation

```js
class DLLNode {
  constructor(key = 0, val = 0) {
    this.key = key;
    this.val = val;
    this.prev = null;
    this.next = null;
  }
}

class LRUCacheManual {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map(); // key -> DLLNode

    // Sentinel head (MRU side) and tail (LRU side)
    this.head = new DLLNode();
    this.tail = new DLLNode();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  // Remove node from its current position
  _remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  // Insert node right after head (MRU position)
  _insertFront(node) {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }

  get(key) {
    if (!this.map.has(key)) return -1;
    const node = this.map.get(key);
    this._remove(node);
    this._insertFront(node);
    return node.val;
  }

  put(key, value) {
    if (this.map.has(key)) {
      const node = this.map.get(key);
      node.val = value;
      this._remove(node);
      this._insertFront(node);
    } else {
      if (this.map.size === this.capacity) {
        // Evict LRU: node just before tail
        const lru = this.tail.prev;
        this._remove(lru);
        this.map.delete(lru.key);
      }
      const newNode = new DLLNode(key, value);
      this._insertFront(newNode);
      this.map.set(key, newNode);
    }
  }
}

// Trace: capacity = 3
const cache = new LRUCacheManual(3);
cache.put(1, 1);
cache.put(2, 2);
cache.put(3, 3);
console.log(cache.get(1)); // 1  → 1 promoted to MRU; LRU order: 2,3,1
cache.put(4, 4);           // evicts key 2 (LRU)
console.log(cache.get(2)); // -1 (evicted)
console.log(cache.get(1)); // 1
console.log(cache.get(3)); // 3
console.log(cache.get(4)); // 4
```

#### Complexity
| | Value |
|---|---|
| Time | O(1) for all operations |
| Space | O(capacity) |

#### Explanation / edge cases
- Sentinel nodes eliminate null checks when inserting/removing at list boundaries.
- `_remove` + `_insertFront` are the two atomic list operations; every cache operation composes them.
- `put` on an existing key updates the value and refreshes recency — don't forget this case.
- `get` on a missing key must return `-1` **and not** modify the list.

---

### 13. Binary Tree Level Order Traversal

**Input**
```text
Input: Tree with nodes 3,9,20,15,7
         3
        / \
       9  20
         /  \
        15   7
```

**Expected output**
```text
Output: [[3], [9, 20], [15, 7]] (level by level)
```

#### Problem summary
Return the values of a binary tree grouped by level (BFS order).

#### Approach
BFS with a queue. At each iteration, process all nodes currently in the queue (that's exactly one level), collect their values, then enqueue their children.

#### Implementation

```js
class TreeNode {
  constructor(val, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

function levelOrder(root) {
  if (!root) return [];

  const result = [];
  const queue = [root];

  while (queue.length > 0) {
    const levelSize = queue.length; // snapshot: how many nodes at this level
    const level = [];

    for (let i = 0; i < levelSize; i++) {
      const node = queue.shift();
      level.push(node.val);
      if (node.left)  queue.push(node.left);
      if (node.right) queue.push(node.right);
    }

    result.push(level);
  }

  return result;
}

// Build sample tree
const root = new TreeNode(3,
  new TreeNode(9),
  new TreeNode(20,
    new TreeNode(15),
    new TreeNode(7)
  )
);

console.log(levelOrder(root)); // [[3],[9,20],[15,7]]
```

#### Complexity
| | Value |
|---|---|
| Time | O(n) — each node visited once |
| Space | O(w) — w = max width of tree (queue holds at most one level) |

#### Explanation / edge cases
- `null` root → returns `[]`.
- `queue.shift()` is O(n) per call in V8; for perf-sensitive code use a proper queue (circular buffer or index-based pointer).
- **Variant — right-side view:** take `level[level.length - 1]` from each level.
- **Variant — zigzag:** alternate whether you push to front or back of the level array.

---

### 14. Longest Increasing Subsequence

**Input**
```text
Input array: [10, 9, 2, 5, 3, 7, 101, 18]
```

**Expected output**
```text
Output: 4 (subsequence [2, 3, 7, 101])
```

#### Problem summary
Find the length of the longest strictly increasing subsequence (elements need not be contiguous).

#### Approach A — Dynamic Programming O(n²)
`dp[i]` = length of LIS ending at index `i`. For each `i`, look back at all `j < i` where `nums[j] < nums[i]`.

#### Approach B — Patience Sorting / Binary Search O(n log n)
Maintain a `tails` array where `tails[i]` is the smallest tail element of all increasing subsequences of length `i+1`. Use binary search to maintain it.

#### Implementation

```js
// Approach A — O(n²) DP, easy to explain
function lisDP(nums) {
  const n = nums.length;
  if (n === 0) return 0;
  const dp = new Array(n).fill(1);

  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (nums[j] < nums[i]) {
        dp[i] = Math.max(dp[i], dp[j] + 1);
      }
    }
  }

  return Math.max(...dp);
}

// Approach B — O(n log n) patience sort
function lisOptimal(nums) {
  const tails = []; // tails[i] = smallest tail of LIS of length i+1

  for (const num of nums) {
    let lo = 0, hi = tails.length;
    // Binary search for leftmost position where tails[mid] >= num
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < num) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = num; // extend or replace
  }

  return tails.length;
}

console.log(lisDP([10, 9, 2, 5, 3, 7, 101, 18]));      // 4
console.log(lisOptimal([10, 9, 2, 5, 3, 7, 101, 18])); // 4
```

#### Complexity
| Approach | Time | Space |
|---|---|---|
| DP | O(n²) | O(n) |
| Patience sort | O(n log n) | O(n) |

#### Explanation / edge cases
- `tails` is always sorted, enabling binary search.
- `tails` does **not** represent an actual LIS; its length does. Reconstruct the subsequence by storing parent pointers in the DP approach.
- Strictly increasing: use `<`, not `<=` (for non-decreasing use `<=`).
- Empty array → `0`; single element → `1`.

---

### 15. Word Ladder

**Input**
```text
start = "hit", end = "cog"
wordList = ["hot","dot","dog","lot","log","cog"]
```

**Expected output**
```text
Output: 5  (hit → hot → dot → dog → cog)
```

#### Problem summary
Find the shortest transformation sequence from `start` to `end` where each step changes exactly one letter and every intermediate word must be in `wordList`. Return the sequence length (number of words), or `0` if no path exists.

#### Approach
BFS on an implicit graph where nodes are words and edges connect words differing by one character. BFS guarantees the shortest path. Use a `Set` for the word list and visited tracking.

#### Implementation

```js
function ladderLength(beginWord, endWord, wordList) {
  const wordSet = new Set(wordList);
  if (!wordSet.has(endWord)) return 0;

  const queue = [[beginWord, 1]]; // [word, steps]

  while (queue.length > 0) {
    const [word, steps] = queue.shift();

    for (let i = 0; i < word.length; i++) {
      for (let c = 97; c <= 122; c++) { // 'a' to 'z'
        const next = word.slice(0, i) + String.fromCharCode(c) + word.slice(i + 1);
        if (next === endWord) return steps + 1;
        if (wordSet.has(next)) {
          wordSet.delete(next); // mark visited
          queue.push([next, steps + 1]);
        }
      }
    }
  }

  return 0; // no path
}

console.log(
  ladderLength('hit', 'cog', ['hot','dot','dog','lot','log','cog'])
); // 5
```

#### Complexity
| | Value |
|---|---|
| Time | O(n · L · 26) — n = wordList size, L = word length |
| Space | O(n · L) — queue and set |

#### Explanation / edge cases
- Deleting visited words from the set (instead of a separate visited set) is both correct and slightly more memory-efficient.
- `endWord` not in `wordList` → return `0` immediately.
- **Bidirectional BFS** (advanced optimisation): simultaneously expand from both ends, meeting in the middle — reduces search space from O(26^L) to O(26^(L/2)).
- All words guaranteed same length per problem constraints.

---

### 16. Regular Expression Matching

**Input**
```text
pattern = "a*b?.c", string = "aabxc"
```

**Expected output**
```text
Output: true (pattern matches string)
```

#### Problem summary
Implement regex matching with:
- `.` — matches any single character
- `*` — matches zero or more of the **preceding** element
- `?` — matches zero or one of the preceding element

> Note: This extends the classic LeetCode 10 (`.*` only) to also include `?`.

#### Approach
2-D dynamic programming. `dp[i][j]` = `true` if `pattern[0..j-1]` matches `string[0..i-1]`.

#### Implementation

```js
function isMatch(s, p) {
  const m = s.length, n = p.length;
  // dp[i][j] = does pattern[0..j-1] match s[0..i-1]?
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(false));
  dp[0][0] = true;

  // Pattern can match empty string if it has "x*" or "x?" prefixes
  for (let j = 1; j <= n; j++) {
    if (p[j - 1] === '*' && j >= 2) {
      dp[0][j] = dp[0][j - 2]; // "x*" consumes 0 occurrences
    } else if (p[j - 1] === '?' && j >= 2) {
      dp[0][j] = dp[0][j - 2]; // "x?" consumes 0 occurrences
    }
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const pc = p[j - 1];
      const sc = s[i - 1];

      if (pc === '*') {
        // Zero occurrences of preceding char: dp[i][j-2]
        // One or more:    preceding matches sc AND dp[i-1][j]
        dp[i][j] = dp[i][j - 2] ||
          (j >= 2 && charMatch(p[j - 2], sc) && dp[i - 1][j]);
      } else if (pc === '?') {
        // Zero occurrences: dp[i][j-2]
        // One occurrence:   preceding matches sc AND dp[i-1][j-2]
        dp[i][j] = dp[i][j - 2] ||
          (j >= 2 && charMatch(p[j - 2], sc) && dp[i - 1][j - 2]);
      } else {
        dp[i][j] = charMatch(pc, sc) && dp[i - 1][j - 1];
      }
    }
  }

  return dp[m][n];
}

function charMatch(pc, sc) {
  return pc === '.' || pc === sc;
}

console.log(isMatch('aabxc', 'a*b?.c')); // true  → aa + b + x + c
console.log(isMatch('aa',    'a*'));      // true
console.log(isMatch('aab',   'c*a*b'));   // true
console.log(isMatch('mississippi', 'mis*is*p*.'));  // false
```

#### Complexity
| | Value |
|---|---|
| Time | O(m · n) |
| Space | O(m · n) — can be reduced to O(n) with rolling array |

#### Explanation / edge cases
- `*` and `?` quantifiers always refer to the **preceding** pattern character — never appear at index 0 in valid patterns.
- `dp[0][j]` initialisation handles patterns like `"a*b*"` matching an empty string.
- The `?` quantifier behaves like `*` but cannot match more than one character.
- To reduce space: only two rows of `dp` are needed at a time.

---

## HARD - System Design

### 17. Design a URL Shortener

**Input**
```text
Input: long URL "https://www.example.com/very/long/path"
```

**Expected output**
```text
Output: "https://short.url/abc123" with collision handling and storage design
```

#### Problem summary
Design a scalable service (like bit.ly) that:
1. Accepts a long URL and returns a short alias (6-8 chars).
2. Redirects the short alias back to the original URL.
3. Handles billions of URLs, high read throughput, low latency.

---

#### Functional requirements
- `POST /shorten` → returns short code.
- `GET /{code}` → 301/302 redirect to original URL.
- Optional: custom aliases, expiry, analytics.

#### Non-functional requirements
- Read-heavy (100:1 read-to-write ratio typical).
- P99 redirect latency < 10 ms.
- ~500M URLs/month → ~200 writes/sec, ~20K reads/sec.

---

#### Short code generation

```
Option A — Hash-based
  MD5(long_url) → 128-bit hash → take first 43 bits → Base62 encode → 7 chars
  Collision: if code exists and URL differs, append counter and rehash.

Option B — Counter + Base62 (preferred for uniqueness guarantee)
  Global auto-increment ID (or distributed: Snowflake ID)
  Base62 encode → 7 chars covers 62^7 ≈ 3.5 trillion URLs
```

**Base62 alphabet:** `[0-9A-Za-z]` (62 characters)

```js
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function toBase62(num) {
  let result = '';
  while (num > 0) {
    result = BASE62[num % 62] + result;
    num = Math.floor(num / 62);
  }
  return result.padStart(7, '0');
}

function fromBase62(str) {
  return [...str].reduce((acc, ch) => acc * 62 + BASE62.indexOf(ch), 0);
}
```

---

#### Architecture

```
Client
  │
  ├─ POST /shorten ──► [API Server] ──► [ID Generator (Snowflake)]
  │                         │                   │
  │                         ▼                   ▼
  │                   [Write DB]         encode to Base62
  │                   (PostgreSQL /              │
  │                    Cassandra)         store {code → url}
  │
  └─ GET /{code} ──► [API Server] ──► [Redis Cache] ──► cache hit → 302
                           │                               │
                           │                         cache miss
                           │                               │
                           └───────────────────────► [Read DB Replica]
                                                           │
                                                    populate cache
                                                    then 302 redirect
```

#### Data model

```sql
CREATE TABLE urls (
  id          BIGINT PRIMARY KEY,        -- Snowflake ID
  short_code  VARCHAR(10) UNIQUE NOT NULL,
  long_url    TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  expires_at  TIMESTAMP,
  user_id     BIGINT                      -- optional, for analytics
);

CREATE INDEX idx_short_code ON urls(short_code);
```

#### Cache layer (Redis)
- Key: `short:{code}`, Value: `long_url`
- TTL: 24 hours (refreshed on each hit)
- Eviction policy: `allkeys-lru`

#### Redirect: 301 vs 302
| Code | Meaning | Analytics |
|---|---|---|
| 301 | Permanent – browser caches forever | ❌ loses future hit counts |
| 302 | Temporary – always hits server | ✅ accurate click analytics |

> Use **302** for analytics; 301 only when caching is explicitly desired.

#### Tradeoffs
| Decision | Choice | Reason |
|---|---|---|
| ID scheme | Snowflake counter | No collisions, sortable, distributed-safe |
| Storage | PostgreSQL + Redis | Relational for consistency, Redis for sub-ms reads |
| Encoding | Base62 | URL-safe, 7 chars covers trillions of URLs |
| Redirect | 302 | Preserves analytics capability |

#### Handling scale
- **Read scaling:** Read replicas + Redis cache absorbs 99%+ of traffic.
- **Write scaling:** Partition by hash of `short_code` across DB shards.
- **Custom aliases:** Check uniqueness in DB before insert; reject duplicates.
- **Expiry:** Background job (cron/worker) deletes expired rows; Redis TTL evicts automatically.

---

### 18. Design a Rate Limiter

**Input**
```text
Requests: 10 requests in 5 seconds, limit = 5 per 5 seconds
```

**Expected output**
```text
6th request is rejected (429), 11th request allowed after window resets
```

#### Problem summary
Build a rate limiter that restricts clients to N requests per time window and returns HTTP 429 when the limit is exceeded.

---

#### Algorithms compared

| Algorithm | Accuracy | Burst Handling | Memory | Complexity |
|---|---|---|---|---|
| Fixed Window Counter | ❌ boundary burst | ❌ allows 2×N at window edge | Low | Simple |
| Sliding Window Log | ✅ exact | ✅ | High (log per req) | Moderate |
| Sliding Window Counter | ✅ approximate | ✅ | Low | Moderate |
| Token Bucket | ✅ | ✅ allows burst up to bucket size | Low | Simple |
| Leaky Bucket | ✅ | ❌ strict smoothing | Low | Simple |

**Recommended for most APIs: Token Bucket or Sliding Window Counter.**

---

#### Implementation — Sliding Window Counter (Redis)

```js
// Redis-based sliding window counter
// Key: ratelimit:{userId}:{windowStart}
// Expiry: 2 × windowSize

async function isAllowed(redisClient, userId, limit, windowMs) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const prevWindowStart = windowStart - windowMs;

  const key     = `ratelimit:${userId}:${windowStart}`;
  const prevKey = `ratelimit:${userId}:${prevWindowStart}`;

  const [currCount, prevCount] = await Promise.all([
    redisClient.incr(key),
    redisClient.get(prevKey),
  ]);

  // Set expiry on first write
  if (currCount === 1) await redisClient.pexpire(key, windowMs * 2);

  // Weighted count: prev_window_count × (overlap fraction) + curr_window_count
  const elapsed = now - windowStart; // ms into current window
  const prevWeight = (windowMs - elapsed) / windowMs;
  const estimated = Math.floor((Number(prevCount) || 0) * prevWeight) + currCount;

  if (estimated > limit) {
    // Undo the increment — request denied
    await redisClient.decr(key);
    return { allowed: false, retryAfterMs: windowMs - elapsed };
  }

  return { allowed: true };
}
```

#### Token Bucket — in-memory (single node)

```js
class TokenBucket {
  constructor(capacity, refillRatePerSec) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRatePerSec; // tokens per second
    this.lastRefill = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  consume(tokens = 1) {
    this._refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true; // allowed
    }
    return false; // rate limited
  }
}

const bucket = new TokenBucket(5, 1); // 5 capacity, 1 token/sec
for (let i = 1; i <= 7; i++) {
  console.log(`Request ${i}: ${bucket.consume() ? 'ALLOWED' : 'DENIED (429)'}`);
}
// Requests 1-5: ALLOWED, 6-7: DENIED
```

---

#### Architecture

```
Client Request
      │
      ▼
[Load Balancer / API Gateway]
      │
      ▼
[Rate Limiter Middleware]
      │
      ├── Redis INCR / GET (atomic, shared across all nodes)
      │         │
      │    allowed? ──────► [Upstream Service]
      │         │
      │    denied? ──────► HTTP 429 Too Many Requests
      │                    Headers:
      │                      Retry-After: <seconds>
      │                      X-RateLimit-Limit: 100
      │                      X-RateLimit-Remaining: 0
      │                      X-RateLimit-Reset: <epoch>
```

#### Key design decisions

| Concern | Decision |
|---|---|
| Shared state across servers | Redis (atomic `INCR`, `EXPIRE`) |
| Per-user vs per-IP | Per user ID + fallback to IP for unauthenticated |
| Race conditions | Redis Lua script or `MULTI/EXEC` for atomicity |
| Bypass on Redis failure | Fail-open (allow) vs fail-closed (deny) — use fail-open with monitoring |
| Granularity | Per endpoint (e.g., `/login` stricter than `/read`) |

#### Tradeoffs
- **Fixed window** is simplest but allows up to 2× burst at window boundaries.
- **Sliding window log** is exact but stores a timestamp per request — expensive at scale.
- **Token bucket** is intuitive and allows controlled bursting; ideal for API rate limits.
- **Redis Lua scripts** ensure the check-and-increment is atomic, preventing race conditions in distributed deployments.

---

### 19. Cache Invalidation Strategy

**Input**
```text
User updates profile (cache exists), other users request profile
```

**Expected output**
```text
Design includes TTL expiration, event-based invalidation, or version control
```

#### Problem summary
Cache invalidation is one of the hardest problems in distributed systems. Design a strategy that ensures cached data is consistent with the source of truth after writes.

---

#### Strategies overview

| Strategy | Description | Consistency | Complexity |
|---|---|---|---|
| TTL (Time-To-Live) | Cache expires after N seconds | Eventual | Low |
| Cache-Aside (Lazy) | App checks cache; on miss reads DB and populates | Eventual | Low |
| Write-Through | Write to cache and DB synchronously | Strong | Medium |
| Write-Behind (Write-Back) | Write to cache immediately, async flush to DB | Eventual (async) | High |
| Event-Driven Invalidation | DB change event triggers cache `DEL` | Near-real-time | Medium–High |
| Cache Versioning (ETag) | Version key changes on update; old key becomes orphan | Strong | Medium |

---

#### Recommended pattern: Cache-Aside + Event-Driven Invalidation

```
Write Path:
  Client ──► API Server ──► DB (write)
                  │
                  ▼
            [Message Broker]  (e.g. Kafka / Redis Pub/Sub)
                  │
                  ▼
         [Cache Invalidation Consumer]
                  │
                  ▼
            Redis DEL user:{id}

Read Path:
  Client ──► API Server ──► Redis GET user:{id}
                                │
                          cache hit? ──► return cached data
                                │
                          cache miss
                                │
                                ▼
                            DB READ ──► Redis SET user:{id} (+ TTL)
                                         │
                                         ▼
                                    return data
```

#### Implementation sketch (Node.js)

```js
// Cache-Aside read
async function getUserProfile(userId) {
  const cacheKey = `user:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
  await redis.setex(cacheKey, 300, JSON.stringify(user)); // 5-min TTL
  return user;
}

// Write + publish invalidation event
async function updateUserProfile(userId, data) {
  await db.query('UPDATE users SET ? WHERE id = ?', [data, userId]);
  await messageQueue.publish('user.updated', { userId });
}

// Consumer: listen for invalidation events
messageQueue.subscribe('user.updated', async ({ userId }) => {
  await redis.del(`user:${userId}`);
});
```

#### Write-Through pattern

```js
async function updateUserProfileWriteThrough(userId, data) {
  // Write to DB and cache in the same transaction / atomically
  await db.query('UPDATE users SET ? WHERE id = ?', [data, userId]);
  await redis.setex(`user:${userId}`, 300, JSON.stringify({ id: userId, ...data }));
}
// Pro: cache always up-to-date after write
// Con: write latency doubles; cache may be polluted with rarely-read data
```

#### Cache stampede prevention

When a hot key expires, many concurrent requests hit the DB simultaneously.

```js
// Probabilistic early expiration (XFetch algorithm)
async function getWithAntiStampede(key, ttl, fetchFn) {
  const cached = await redis.get(key);
  if (cached) {
    const { value, expiry, beta = 1 } = JSON.parse(cached);
    const remaining = expiry - Date.now() / 1000;
    // Probabilistic recompute before expiry
    if (remaining > beta * Math.random() * -Math.log(Math.random())) {
      return value;
    }
  }
  // Fetch fresh value
  const fresh = await fetchFn();
  const expiry = Date.now() / 1000 + ttl;
  await redis.setex(key, ttl, JSON.stringify({ value: fresh, expiry }));
  return fresh;
}
```

#### Tradeoffs summary

| Concern | Recommendation |
|---|---|
| Strong consistency required | Write-through or synchronous invalidation |
| High write throughput | Write-behind (async), accept brief staleness |
| Simple read-heavy workload | Cache-Aside + TTL (5–60 seconds) |
| Real-time invalidation | Event-driven via Kafka/Redis Pub/Sub |
| Cache stampede | Mutex lock, probabilistic expiry, or background refresh |
| Multi-region | Each region has local cache; events propagate via global bus |

#### Edge cases
- **Distributed write race:** Two processes update the same record; one may re-cache stale data. Use versioned keys or `SET key value NX` (set-if-not-exists) with the DB version number.
- **Message loss:** If the broker drops the `user.updated` event, cache stays stale. Mitigate with TTL as a fallback safety net.
- **Cascading invalidation:** Updating a parent entity may require invalidating child caches. Model invalidation dependencies explicitly or use namespace tagging (`SCAN` + bulk `DEL`).
- **Cold start:** After deployment, cache is empty. Use a warm-up job or accept initial DB load surge.
