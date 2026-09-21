# Iterators & Closures

## 1. Why This Exists — The Problem First

Loops with manual indices invite off-by-one errors, accidental aliasing, and
missed vectorization. Rust iterators express *what* to do (`map`, `filter`,
`collect`) and let the compiler fuse the pipeline into a single tight loop —
no intermediate allocations, no bounds checks in release. Closures capture
their environment with explicit cost (`Fn`/`FnMut`/`FnOnce`).

## 2. The Analogy — Make It Obvious

An iterator is a conveyor belt with a crank: each turn yields the next item
until the belt is empty. Adaptors (`map`, `filter`) are machines bolted onto
the belt — they do nothing until you crank (lazy). `collect` is the box at the
end that catches everything. A closure is a lunchbox that packs food from the
office fridge: by reference (`Fn`), by mutable loan (`FnMut`), or by taking it
with you (`FnOnce`). `move` means "pack ownership, not借 references."

## 3. How It Actually Works — The Full Explanation

`Iterator` requires `type Item` and `fn next(&mut self) -> Option<Self::Item>`.
Adaptors are lazy; consumers (`collect`, `sum`, `for`) drive them. Because each
adaptor is a generic struct, LLVM inlines the chain into one loop — hence
"zero-cost." `iter()` yields `&T`, `iter_mut()` yields `&mut T`, `into_iter()`
consumes and yields `T`. Closures implement exactly one of `Fn` (shared borrow
of captures), `FnMut` (exclusive borrow), `FnOnce` (takes ownership); every
closure implements at least `FnOnce`. `move` forces by-value capture (needed
for `thread::spawn` and many async tasks).

## 4. Real Code — See It Working

```rust
fn main() {
    let v = vec![1, 2, 3, 4, 5];

    // Lazy pipeline: nothing runs until collect()
    let evens_squared: Vec<i32> = v
        .iter()              // &i32, borrows v
        .filter(|x| *x % 2 == 0)
        .map(|x| x * x)
        .collect();
    println!("{evens_squared:?}"); // [4, 16]

    let mut v2 = vec![1, 2, 3];
    for x in v2.iter_mut() {
        *x *= 10; // mutate in place
    }
    // into_iter consumes:
    let total: i32 = v2.into_iter().sum(); // v2 moved here
    println!("total {total}");

    // Closures: capture modes
    let bonus = 10;
    let add_bonus = |x: i32| x + bonus; // Fn: borrows bonus
    println!("{}", add_bonus(5));

    let mut count = 0;
    let mut increment = || {
        count += 1; // FnMut: mutably borrows count
        count
    };
    increment();
    println!("{count}");

    let name = String::from("rust");
    let take = move || name; // FnOnce: takes ownership
    println!("{}", take());
    // println!("{name}"); // ERROR: moved
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q64: What is an iterator?**

A value implementing `Iterator` (`next()` yielding `Option<Item>`). `for x in
iter` desugars to a loop over `IntoIterator::into_iter()`. Lazy adaptors
transform; consumers execute. Preferred over index loops for safety and speed.

**Q65: Difference between `iter()`, `iter_mut()`, and `into_iter()`?**

`iter()` borrows (`&T`), collection stays usable. `iter_mut()` mutably borrows
(`&mut T`), allows in-place edits, still no move. `into_iter()` consumes
(`T`), collection is moved and unusable after (except for `&[T]`, where
`into_iter` borrows for backwards compatibility — know this footgun).

**Q66: What does `map()` do?**

Transforms each item lazily: `iter.map(|x| f(x))`. One-to-one, no filtering.
Fuses with neighbors at compile time; no allocation until a consumer runs.

**Q67: What does `filter()` do?**

Keeps items matching a predicate: `iter.filter(|x| cond)`. Takes `&Item`, so
patterns often need `|&x|` or `|x: &&T|`. Lazy; combine with `map` before
`collect`.

**Q68: What does `collect()` do?**

Drives the pipeline and builds a container (`Vec`, `String`, `HashMap`, ...)
inferred from context (`let v: Vec<_> = ...collect()`). Uses `FromIterator`.
Fallible pipelines use `collect::<Result<Vec<_>, _>>()` to short-circuit on
the first error.

**Q69: Why are Rust iterators called zero-cost abstractions?**

The adaptor chain compiles to the same assembly as a hand-written loop: no
virtual calls, no intermediate buffers, bounds checks elided. You pay for
abstraction in compile time (monomorphization), not runtime.

**Q70: What is a closure?**

An anonymous function (`|args| body`) that captures its environment. Each
closure has a unique compiler-generated type implementing one of the `Fn`
traits. Captures default to the least privilege needed (by reference, then by
mutable borrow, then by value).

**Q71: What are `Fn`, `FnMut`, and `FnOnce`?**

The three capture contracts: `Fn(&self)` borrows shared (callable repeatedly
through `&`); `FnMut(&mut self)` borrows exclusively (needs `mut` to call);
`FnOnce(self)` consumes captures (callable once). Every closure is at least
`FnOnce`; `Fn` closures are also `FnMut` and `FnOnce` (hierarchy). Generic
bounds pick the weakest capability you need.

**Q72: What does `move` do with a closure?**

Forces all captures by value (ownership or `Copy`). Required when the closure
must outlive its stack frame (`thread::spawn`, `tokio::spawn`, returning a
closure). Does not make the closure `FnOnce` by itself — that depends on what
the body does with the moved values.

## 6. The Traps — What Goes Wrong in Production

Calling `collect()` too early (or twice) materializes intermediates and kills
fusion. Keep the chain lazy until the final consumer.

`into_iter()` on a reference vs value confusion, and `filter`'s `&&T` double
reference, are the two most common closure-signature stumbles. Let the compiler
tell you the item type, then destructure (`|&x|`, `|(k, v)|`).

Capturing `&mut` state in a `Fn` context (e.g. `rayon` or `map` expecting `Fn`)
fails — restructure to `FnMut` or use interior mutability deliberately.

## 7. Compare With Related Concepts

`for` loop vs iterator chain: explicit control vs declarative pipeline.
Iterators win for transforms; `for` wins for early `break` with complex state
(though `try_for_each`/`find` cover most cases).

`iter` vs `iter_mut` vs `into_iter`: borrow vs mutably borrow vs consume.
Choose by whether downstream needs ownership.

Closure vs function pointer (`fn`): closures capture and have unique types;
`fn` pointers capture nothing and have one uniform type.

## 8. 🧠 The Memory Hook

Iterators are lazy belts, `collect` is the box, and closures pack their lunch
by the cheapest means — reference, mutable loan, or taking it along.
