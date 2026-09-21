# Unsafe Rust & Memory

## 1. Why This Exists — The Problem First

Safe Rust rejects anything it cannot prove sound — including talking to
hardware, C libraries, and performance-critical layouts. Real systems still
need those escape hatches. `unsafe` marks the small region where *you* take
responsibility for upholding the invariants the compiler normally guarantees,
while the rest of the program keeps full checking. Interviews expect you to
name those obligations, not to write lock-free allocators from memory.

## 2. The Analogy — Make It Obvious

Safe Rust is a commercial kitchen with guards on every slicer. `unsafe` is the
key to the guard-removal cabinet: you may take a guard off to carve something
unusual, but every cut after that is your responsibility, and you must put the
guard back before serving (wrap the `unsafe` in a safe API). Raw pointers are
bare blades with no handle tracking (`*const` for looking, `*mut` for cutting).
Undefined behavior is food poisoning: the meal may look fine while being
silently toxic — the only fix is never serving it. FFI is catering for a
foreign restaurant (`extern "C"` is the agreed serving protocol). And yes, you
can still waste food (leak memory) without breaking any hygiene rule.

## 3. How It Actually Works — The Full Explanation

`unsafe` permits five operations: dereferencing raw pointers, calling `unsafe
fn`, implementing `unsafe trait`, accessing/mutating `static mut`, and touching
`union` fields. Raw pointers (`*const T`, `*mut T`) are non-owning, unaligned-
agnostic addresses with no borrow checking, no null/niche guarantees, and no
automatic cleanup. Undefined behavior (dangling/unaligned/misused pointers,
data races, invalid values like uninitialized `bool`, broken aliasing) may do
*anything*, including miscompiling distant safe code — Miri exists to catch it
in tests. `unsafe` does not disable the borrow checker around it; only the
listed operations escape checking. Safe code can still leak (`mem::forget`,
`Rc` cycles, `Box::leak`) — leaks are memory-inefficiency, not UB. FFI calls
across `extern "C"` boundaries must uphold both sides' ABIs and validity.

## 4. Real Code — See It Working

```rust
// Minimal unsafe: raw-pointer read with explicit contract.
fn first_or_zero(ptr: *const i32, len: usize) -> i32 {
    if ptr.is_null() || len == 0 {
        return 0;
    }
    // SAFETY: caller guarantees ptr points to >= 1 valid, aligned i32,
    // and no mutable aliasing during this call.
    unsafe { *ptr }
}

// Safe wrapper around unsafe internals: the pattern interviews want.
fn sum_slice(values: &[i32]) -> i32 {
    let mut total = 0;
    let mut i = 0;
    while i < values.len() {
        // Bounds check hoisted by hand; still sound because i < len.
        total += unsafe { *values.as_ptr().add(i) };
        i += 1;
    }
    total
}

// FFI declaration: calling C's strlen.
extern "C" {
    fn strlen(s: *const std::os::raw::c_char) -> usize;
}

fn main() {
    let v = vec![1, 2, 3];
    println!("{}", first_or_zero(v.as_ptr(), v.len()));
    println!("{}", sum_slice(&v));

    // Leaks are safe (wasteful, not UB):
    let leaked: &'static str = Box::leak("temp".to_owned().into_boxed_str());
    println!("{leaked}");
    std::mem::forget(v); // also a safe leak
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q172: What is `unsafe` Rust?**

The opt-in region where the compiler permits operations it cannot verify, and
the programmer assumes responsibility for their soundness. Everything else in
the crate keeps full safety checks. Idiomatic use hides `unsafe` inside a safe
abstraction with documented `SAFETY` preconditions.

**Q173: Why does Rust need `unsafe`?**

Because hardware access, OS syscalls, C interop, and some data structures
(intrusive lists, allocators, SIMD) cannot be expressed within safe borrowing
rules but are still necessary. `unsafe` contains that necessity in auditable
blocks instead of sprinkling unchecked behavior everywhere.

**Q174: What operations require an unsafe context?**

Dereferencing `*const T` / `*mut T`; calling an `unsafe fn` or `extern` fn;
implementing an `unsafe trait`; reading/writing `static mut`; accessing `union`
fields. Creating a raw pointer or writing ordinary safe code inside the block
needs no `unsafe` by itself.

**Q175: What is a raw pointer?**

An unguarded address (`*const T` / `*mut T`): may be null, dangling, or
unaligned; carries no lifetime, ownership, or aliasing enforcement; must be
dereferenced in `unsafe`. Built with `&x as *const _`, `ptr::addr_of!`, or
returned from FFI/allocators.

**Q176: `*const T` vs `*mut T`?**

`*const T` is read-oriented (do not mutate through it; may still alias); `*mut
T` permits mutation. Neither is checked; both can alias unless you uphold
`noalias`-style discipline yourself. Prefer `*const` when you only read — it
documents intent and matches `&T`-derived pointers.

**Q177: What is undefined behavior?**

A program state the language declares meaningless (null/dangling deref,
misaligned access, out-of-bounds, data race, invalid enum/bool bit pattern,
broken aliasing rules). The compiler may assume UB never happens, so UB can
corrupt *unrelated* safe code after optimization. Never "test whether it
works" — eliminate it, and run Miri on `unsafe` paths.

**Q178: Does `unsafe` disable the borrow checker?**

No. Surrounding safe references, moves, and borrows are still fully checked;
only the five listed operations escape. A common misconception in interviews —
say it explicitly: `unsafe` narrows the unchecked surface, it does not turn
checks off.

**Q179: Can safe Rust leak memory?**

Yes — safely. `mem::forget`, `Rc`/`Arc` cycles, `Box::leak`, and thread-scope
escapes drop nothing but never create UB. The guarantee is *soundness* (no
dangling use, no races), not *frugality*. Treat leaks as a resource bug, caught
by review and profiling, not by the borrow checker.

**Q180: What is FFI?**

Foreign Function Interface: calling (or exposing) functions across language
boundaries, usually C. Rust declares foreign symbols in `extern "C" { ... }`
and exports with `#[no_mangle] pub extern "C" fn`. Every boundary crossing must
manually uphold layouts (`#[repr(C)]`), nullability, ownership (who frees?),
and unwinding rules (never unwind across C).

**Q181: What is `extern "C"`?**

The C application binary interface for a declaration or definition: argument
passing, name mangling (none), and calling convention match what C compilers
expect. `extern "C" { fn f(..); }` imports; `pub extern "C" fn f(..)` exports.
Other ABIs (`"Rust"`, `"system"`) exist, but `"C"` is the portable lingua
franca.

## 6. The Traps — What Goes Wrong in Production

Treating `unsafe` as "trust me" without writing the `SAFETY` contract, so a
later refactor silently violates alignment/lifetime/aliasing assumptions.

Dereferencing an FFI pointer without null/length checks, or holding a
`&T`-derived raw pointer across reallocation — the two most common soundness
holes in reviews.

Panicking or allocating inside `extern "C"` callbacks that forbid unwinding,
or freeing memory across allocators (Rust-allocated, C-freed).

## 7. Compare With Related Concepts

Safe reference (`&T`: checked, non-null, aligned, aliased-read-only) vs raw
pointer (`*const T`: none of that, your job) vs `unsafe` block (the audited
room where raw use is allowed).

Leak (safe waste) vs UB (unsafe corruption): one costs memory, the other costs
correctness of the whole program.

`unsafe fn` (caller must uphold contract) vs `unsafe` block (current code does
unchecked ops) vs `unsafe trait` (implementor upholds invariants like `Send`).

## 8. 🧠 The Memory Hook

`unsafe` removes guards, not rules: raw pointers cut both ways, UB poisons the
whole kitchen, FFI speaks C — and leaks waste food without poisoning anyone.
