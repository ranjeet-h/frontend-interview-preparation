# Strings & Collections

## 1. Why This Exists — The Problem First

Rust strings are UTF-8, so a "character" is not one byte and indexing by
position is not O(1). Collections make the cost model explicit: `Vec` tracks
length vs capacity to amortize growth, and the map choice (`HashMap` vs
`BTreeMap`) trades hashing against ordering.

## 2. The Analogy — Make It Obvious

`&str` is a library reading-room view of someone else's book; `String` is
owning the book and being allowed to annotate it. `Vec` is an expandable
filing cabinet: `length` is drawers in use, `capacity` is drawers built.
Exceeding capacity means calling a contractor (reallocate + move). `HashMap`
is a pile of labeled bins with no order; `BTreeMap` is the same bins kept
alphabetical so you can walk them in order.

## 3. How It Actually Works — The Full Explanation

`String` is an owned, growable `Vec<u8>` guaranteed to be valid UTF-8.
`&str` is a borrowed UTF-8 slice (fat pointer: pointer + length). `Vec<T>` is a
contiguous growable buffer with `len <= capacity`; pushing past capacity
reallocates (typically doubling) and moves elements. Slices `&[T]` borrow a
contiguous run without owning it.

## 4. Real Code — See It Working

```rust
use std::collections::{BTreeMap, HashMap};

fn main() {
    let owned: String = String::from("hello");
    let borrowed: &str = &owned; // deref: &String -> &str
    // let b = owned[0]; // ERROR: String cannot be indexed by integer

    // Iterate UTF-8 correctly:
    for ch in owned.chars() { print!("{ch} "); }
    println!();
    for byte in owned.bytes() { print!("{byte} "); }
    println!();

    let mut v: Vec<i32> = Vec::with_capacity(2);
    v.push(1);
    v.push(2);
    println!("len={} cap={}", v.len(), v.capacity());
    v.push(3); // may reallocate; len=3, cap typically 4
    println!("len={} cap={}", v.len(), v.capacity());

    let slice: &[i32] = &v; // Vec<T> -> &[T]
    println!("{slice:?}");

    let mut freq = HashMap::new();
    for w in ["a", "b", "a"] {
        *freq.entry(w).or_insert(0) += 1;
    }
    println!("{freq:?}");

    let mut ordered = BTreeMap::new();
    ordered.insert(2, "b");
    ordered.insert(1, "a");
    // BTreeMap iterates sorted by key: 1, then 2
    for (k, val) in &ordered { println!("{k}: {val}"); }
    let _ = borrowed;
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q26: What is the difference between `String` and `&str`?**

`String` is owned, heap-allocated, growable, mutable UTF-8 (`Vec<u8>` wrapper).
`&str` is a borrowed, fixed-size UTF-8 view (pointer + length), often into a
`String`, a literal (`&'static str`), or another slice. Functions that only read
should take `&str`; constructors and accumulators return `String`. `&String`
deref-coerces to `&str`.

**Q27: Why can't you index a Rust `String` using `string[0]`?**

Because UTF-8 characters have variable byte widths (1–4 bytes). Byte index 0
may be mid-character, and character index 0 is O(n) to find. Allowing `s[0]`
would hide either a panic risk or a performance cliff. Use `.bytes()`,
`.chars()`, `.get(0..1)` (checked slicing), or grapheme crates instead. Slicing
with a range panics if the boundary is not on a char boundary.

**Q28: What is the difference between `Vec<T>` and `&[T]`?**

`Vec<T>` owns a growable heap buffer (pointer + len + capacity) and can push,
pop, and reallocate. `&[T]` is a borrowed fixed-length view (pointer + length)
into a `Vec`, array, or other contiguous storage. Prefer `&[T]` parameters when
you only read: they accept both `Vec` and arrays.

**Q29: What are length and capacity in `Vec<T>`?**

`len` is elements currently initialized; `capacity` is slots allocated. Invariant:
`len <= capacity`. `len` controls indexing/`Drop`; `capacity` controls when the
next `push` needs reallocation. `Vec::with_capacity(n)` pre-allocates to avoid
repeated growth.

**Q30: What happens when a `Vec` exceeds its capacity?**

It allocates a larger buffer (amortized growth, typically doubling), moves (or
copies) existing elements over, frees the old buffer, then writes the new
element. This is O(n) for that push but O(1) amortized across many pushes. Any
outstanding borrows or raw pointers into the old buffer are invalidated — the
borrow checker normally prevents you from holding them across `push`.

**Q31: What is the difference between `HashMap` and `BTreeMap`?**

`HashMap<K,V>` is hash-based: O(1) average lookup/insert, unordered iteration,
requires `Hash + Eq`, uses a random seed (DoS-resistant). `BTreeMap<K,V>` is a
B-tree: O(log n) lookup/insert, keys iterated in sorted order, requires `Ord`,
supports range queries (`range(..)`). Use `HashMap` for raw speed, `BTreeMap`
for ordering, deterministic iteration, or range scans.

## 6. The Traps — What Goes Wrong in Production

Slicing strings by byte ranges (`&s[0..2]`) panics on non-ASCII input. Always
use char boundaries, `.get()`, or `.chars()`.

Holding `&v[0]` across `v.push(..)` is rejected for a reason: reallocation
would dangle it. Collect indices instead of references, or `reserve()` upfront
and restructure so borrows end before mutation.

## 7. Compare With Related Concepts

`String` vs `&str` vs `&String`: own when you must grow or keep; borrow `&str`
to read; avoid `&String` parameters (they accept less than `&str`).

`Vec` vs slice vs array: `Vec` grows and owns; slices borrow any contiguous run;
arrays have fixed compile-time length and live inline.

`HashMap` vs `BTreeMap`: hashing (fast, unordered) vs tree (ordered, ranged).

## 8. 🧠 The Memory Hook

Rust strings are UTF-8 views, not byte arrays. Length is what you use; capacity
is what you paid for; maps trade speed for order.
