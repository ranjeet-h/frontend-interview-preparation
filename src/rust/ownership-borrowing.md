# Ownership & Borrowing

## 1. Why This Exists — The Problem First

C programs crash with use-after-free and double-free. Java and Go programs pause
for garbage collection. Rust wanted a third option: free memory deterministically
at scope exit, with no collector and no manual `free()`, while still rejecting
dangling pointers and data races before the program ever runs.

Ownership is that mechanism. Every value has exactly one owner. When the owner
goes out of scope, the value is dropped. References borrow the value
temporarily, and the borrow checker proves at compile time that no borrow
outlives the owner and no mutation can be observed through an unexpected alias.

## 2. The Analogy — Make It Obvious

Think of a library book with exactly one borrower card (the owner). You can lend
the book out for reading (`&T`, many readers at once) or lend it to one editor
with a red pen (`&mut T`, exactly one writer, no readers while editing). The
librarian (borrow checker) tracks who has the book and refuses any loan that
would let someone read a half-edited page or return the book while someone is
still reading it.

Moving (`let s2 = s1`) is handing the borrower card to someone else: the old
card stops working. Copying (`i32`, which is `Copy`) is photocopying a flyer:
everyone gets their own independent copy. `Clone` is explicitly ordering a
second printed copy of the book — it costs something, so you must ask for it.

## 3. How It Actually Works — The Full Explanation

Memory safety without a collector works because the compiler tracks ownership
statically and inserts deterministic `drop` calls at scope exits. There is no
runtime reference graph to trace.

The three ownership rules are:

1. Each value has exactly one owner variable.
2. There can only be one owner at a time (assignment or passing by value
   *moves* ownership).
3. When the owner goes out of scope, the value is dropped (its `Drop::drop`
   runs and its memory is freed).

## 4. Real Code — See It Working

```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1; // move: s1 is no longer usable
    // println!("{s1}"); // error[E0382]: borrow of moved value
    println!("{s2}");

    let x = 10; // i32 is Copy
    let y = x;  // bitwise copy; x is still valid
    println!("{x} {y}");

    let mut s = String::from("hello");
    let r1 = &s; // shared borrow
    let r2 = &s; // second shared borrow is fine
    println!("{r1} {r2}");
    // shared borrows end here (NLL), so a mutable borrow is allowed next:
    let r3 = &mut s;
    r3.push_str(" world");
    println!("{r3}");
} // s, s2, x, y are dropped here in reverse declaration order
```

## 5. The Interview Questions — All of Them, Done Properly

**Q1: What is ownership in Rust?**

Ownership is the compile-time system that ties every heap value to exactly one
owner binding. The owner controls deallocation: when it goes out of scope the
value is dropped. Transferring the binding by assignment or by-value argument
moves ownership; the old binding becomes unusable. This gives deterministic
cleanup with no garbage collector.

**Q2: What are the three ownership rules?**

1. Each value in Rust has an owner. 2. There can only be one owner at a time.
3. When the owner goes out of scope, the value will be dropped. Interviews want
all three verbatim, plus one example each (move on assignment, move into a
function, drop at scope end).

**Q3: Why does Rust need ownership?**

To guarantee memory safety (no use-after-free, double-free, or leaks by
accident) and thread safety (no data races) without a garbage collector and
without manual memory management. Ownership lets the compiler insert `free`
equivalents automatically and prove references are always valid.

**Q4: How does Rust provide memory safety without a garbage collector?**

Through static ownership tracking plus the borrow checker. The compiler knows
each value's owner and every borrow's lifetime, inserts `drop` at scope exit,
and rejects programs where a reference could outlive its referent or where
mutation could race with reads. There is no runtime tracing; safety is proven
before the binary runs.

**Q5: What happens when you assign one `String` to another variable?**

The `String` (pointer + length + capacity on the stack, bytes on the heap) is
*moved*, not deep-copied. Ownership transfers to the new binding and the old
binding is invalidated. This prevents double-free: only the new owner will drop
the heap buffer. Use `.clone()` for an explicit deep copy.

**Q6: What is a move?**

A transfer of ownership. After `let b = a;` (for a non-`Copy` type), `a` can no
longer be used; only `b` owns the value and only `b` will drop it. Moves also
happen when passing a value by value to a function or returning one. Moves are
shallow (stack header is copied) and do not run heap allocation.

**Q7: What is borrowing?**

Temporarily accessing a value through a reference (`&T` or `&mut T`) without
taking ownership. The borrower can read (or mutate, for `&mut`) but the owner
retains ownership and remains responsible for cleanup. All borrows must end
before the owner is moved or dropped.

**Q8: What is the difference between `&T` and `&mut T`?**

`&T` is a shared (immutable) reference: many can coexist, but none can mutate
through it. `&mut T` is an exclusive (mutable) reference: exactly one can be
live at a time and no `&T` may overlap it, but mutation through it is allowed.
Both are non-owning and must not outlive the referent.

**Q9: Why can Rust have multiple immutable references but only one mutable reference at a time?**

Because shared reads cannot observe each other, so aliasing is harmless. A
writer, however, could invalidate what readers or other writers assume. The
rule "many readers XOR one writer" guarantees that mutation is never observed
through a stale alias, which is the root cause of data races and iterator
invalidation in other languages.

**Q10: Why can't mutable and immutable references coexist in certain situations?**

For the same reason: if `r1 = &s` exists and `r2 = &mut s` mutated `s`, then
`r1` would observe a value that changed under its feet (e.g. reallocation
invalidating its pointer). Non-lexical lifetimes (NLL) narrow this: the ban
lasts only while both references are actually *used*, not for their whole
lexical scope. Once `r1`'s last use passes, `r2` becomes legal.

**Q11: What is the borrow checker?**

The compiler pass (part of `rustc`'s MIR borrow checking, formerly AST-based)
that validates every reference: it must point to live data, obey the
many-readers-XOR-one-writer rule, and never outlive the owner. Violations are
compile errors (E0382 moved value, E0502/E0505 conflicting borrows, E0597 does
not live long enough). It enforces the rules without runtime cost.

**Q12: What is a dangling reference, and how does Rust prevent it?**

A reference pointing to freed memory (e.g. to a local that was dropped). Rust
prevents it by tying each reference's lifetime to the owner's scope: a reference
cannot be used after its referent's scope ends, and a function cannot return a
reference to a local (see Q24). This is checked statically; safe Rust cannot
express a dangling reference.

**Q13: What happens when a value goes out of scope?**

Rust calls `drop` on it automatically (user `Drop::drop` first, then field drops
in declaration order, then heap memory is freed). This is deterministic and runs
in reverse declaration order. No collector pause, no manual `free`.

**Q14: What is the `Drop` trait?**

The customization point for scope-exit cleanup: `fn drop(&mut self)`. Types like
`String`, `Vec`, `File`, and `MutexGuard` implement it to release heap memory,
close handles, or unlock. You rarely call `drop()` explicitly except via
`std::mem::drop(value)` to end a value early. `Drop` and `Copy` are mutually
exclusive.

**Q15: What is the difference between `Copy` and `Clone`?**

`Copy` is an implicit, cheap bitwise duplicate (marker trait, `fn`less beyond
`Clone` supertrait): assignment copies and both sides stay usable. `Clone` is an
explicit, potentially expensive deep duplicate via `.clone()`. Every `Copy` type
is also `Clone`, but not vice versa (`String`, `Vec` are `Clone` only).

**Q16: Why does `i32` implement `Copy` but `String` does not?**

`i32` is a fixed-size stack value with no heap allocation or cleanup: copying
its 4 bytes is trivially safe and needs no `Drop`. `String` owns a heap buffer
with a `Drop` that frees it; bitwise-copying it would create two owners of one
buffer and a double-free. So `String` opts out of `Copy` and requires moves or
explicit `.clone()`.

**Q17: What is shadowing, and how is it different from `mut`?**

Shadowing (`let x = x + 1;` or `let s: &str = &s_string;`) declares a *new*
binding that hides the old one; it can even change type and need not be `mut`.
`mut` (`let mut x = 1; x += 1;`) allows mutation of the *same* binding and never
changes its type. Shadowing is idiomatic for type-changing transforms.

```rust
let data = "42";
let data: u32 = data.parse().unwrap(); // shadowing + type change: legal
let mut count = 0;
count += 1; // mut: same binding, same type
```

## 6. The Traps — What Goes Wrong in Production

The first trap is "fixing" every borrow error with `.clone()`. Clones hide the
real issue (an unneeded `String` parameter that should be `&str`, a loop that
should borrow) and add heap allocations on hot paths. Fix the ownership shape
first; clone only at a true ownership boundary.

The second trap is assuming NLL means borrows end at scope end. They end at
*last use*. Code that "looks" conflicting (`r1 = &s; r2 = &mut s;` with `r1`
never used again) actually compiles. Conversely, holding a borrow across a
later use (e.g. `println!("{r1}")` after creating `r2`) is still an error.

The third trap is moving out of a borrowed context or using a value after it
was moved into a function call or `for x in v` loop. Prefer `&v`, `v.iter()`,
or return ownership explicitly.

## 7. Compare With Related Concepts

Move vs `Copy` vs `Clone`: a move transfers ownership (old binding dies); a
`Copy` duplicates bits implicitly (both bindings live); a `Clone` duplicates
logically via an explicit, possibly heap-allocating call.

`&T` vs `&mut T` vs owned `T`: shared borrows allow aliasing but forbid
mutation; exclusive borrows allow mutation but forbid aliasing; owned values
allow both but require ownership transfer.

Shadowing vs `mut`: shadowing creates successive immutable snapshots (can change
type); `mut` evolves one binding in place (fixed type).

## 8. 🧠 The Memory Hook

One owner, many readers XOR one writer, drop at scope exit. If the compiler
complains, it is protecting a reader from a writer it cannot see.
