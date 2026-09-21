# Smart Pointers

## 1. Why This Exists — The Problem First

Ownership allows exactly one owner, but real programs need shared ownership
(config read by many components), recursive types (linked lists), and shared
mutation (caches, graphs). Smart pointers encode each pattern's cost and
safety explicitly: `Box` for single heap ownership, `Rc`/`Arc` for shared
ownership, `RefCell`/`Mutex` for shared mutation, `Weak` to break cycles.

## 2. The Analogy — Make It Obvious

`Box` is buying the book outright and keeping it at home. `Rc` is a shared
office copy with a sign-out counter — the last person to return it recycles it.
`Arc` is the same counter but thread-safe (atomic clicks). `RefCell` moves the
librarian's rule-check from daytime (compile time) to nighttime (runtime): you
can edit the shared copy, but breaking the rules panics after hours. `Weak` is
a sticky note saying "the office copy lives over there" without keeping it
alive. A cycle of `Rc`s is two colleagues each waiting for the other to return
the book first — nobody ever does.

## 3. How It Actually Works — The Full Explanation

`Box<T>` is a unique heap pointer with static size (enables recursion) and no
overhead. `Rc<T>` is a non-atomic reference count for single-threaded sharing;
cloning bumps the count, dropping decrements, zero frees. `Arc<T>` is the
atomic-counter version safe to share across threads. `RefCell<T>` enforces the
many-readers-XOR-one-writer rule at runtime (`borrow()`/`borrow_mut()` panic on
violation) for single threads; `Mutex`/`RwLock` are the threaded equivalents.
`Weak<T>` is a non-owning handle from `Rc::downgrade`/`Arc::downgrade` that
`upgrade()`s to `Option<Rc<T>>`. `Rc` cycles leak because the count never hits
zero.

## 4. Real Code — See It Working

```rust
use std::cell::RefCell;
use std::rc::{Rc, Weak};
use std::sync::Arc;

enum List {
    Cons(i32, Box<List>),
    Nil,
}

fn main() {
    // Box: recursive type + heap ownership
    let _list = List::Cons(1, Box::new(List::Cons(2, Box::new(List::Nil))));

    // Rc<RefCell<T>>: shared + mutable (single thread)
    let shared = Rc::new(RefCell::new(vec![1, 2]));
    let a = Rc::clone(&shared);
    let b = Rc::clone(&shared);
    a.borrow_mut().push(3);
    println!("{:?} strong={}", b.borrow(), Rc::strong_count(&shared));

    // Weak breaks cycles
    let strong: Rc<String> = Rc::new(String::from("node"));
    let weak: Weak<String> = Rc::downgrade(&strong);
    println!("upgrade before drop: {:?}", weak.upgrade());
    drop(strong);
    println!("upgrade after drop: {:?}", weak.upgrade()); // None

    // Arc: share across threads
    let counter = Arc::new(42);
    let c2 = Arc::clone(&counter);
    std::thread::spawn(move || println!("from thread: {c2}")).join().unwrap();
    println!("from main: {counter}");
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q56: What is `Box<T>` and when would you use it?**

A uniquely owned heap pointer with no sharing overhead. Use for recursive types
(`Cons(Box<List>)`, trees), large values you want off the stack, and trait
objects (`Box<dyn Error>`). Derefs to `T`; dropping the `Box` drops the `T`.

**Q57: What is `Rc<T>`?**

Reference-counted single-threaded shared ownership. `Rc::clone` is cheap
(counter bump, not deep copy). When the last `Rc` drops, the value is freed.
`Rc<T>` alone is immutable — pair with `RefCell` for mutation. Not `Send`.

**Q58: What is `Arc<T>`?**

Atomically reference-counted shared ownership safe across threads. Same API
shape as `Rc` but counter updates are atomic (slightly costlier). The standard
way to share immutable data between threads; pair with `Mutex` for mutation.

**Q59: What is the difference between `Rc` and `Arc`?**

`Rc`: non-atomic count, fastest, single-thread only (`!Send`, `!Sync`).
`Arc`: atomic count, thread-safe (`Send + Sync` when `T` is), small atomic
overhead. Default to `Rc` on one thread, `Arc` across threads.

**Q60: What is `RefCell<T>`?**

Single-threaded interior mutability: allows mutation through a shared (`&`)
handle by checking borrow rules at runtime. `.borrow()` / `.borrow_mut()`
panic on violation (`BorrowError` with `try_borrow`). `RefCell` itself is
`!Sync`.

**Q61: What is interior mutability?**

Mutating through a `&T` (shared reference) via a wrapper that enforces safety
dynamically (`Cell`, `RefCell`, `Mutex`, `RwLock`, atomics). Needed when the API
gives you `&self` but you must update caches, counts, or shared state. The
`UnsafeCell` primitive underlies all of them.

**Q62: What is `Weak<T>`?**

A non-owning reference that does not increment the strong count, created by
`Rc::downgrade` / `Arc::downgrade`. `upgrade()` yields `Option<Rc<T>>`
(`None` once the value is gone). Used for caches, observers, and parent
pointers to avoid cycles.

**Q63: Why can `Rc` create memory leaks through reference cycles?**

If A holds an `Rc` to B and B holds an `Rc` to A, each strong count stays ≥ 1
forever, so neither drops — a leak in safe Rust (memory only, never undefined
behavior). Fix by making back-edges `Weak` (parent/observer pointers), so the
cycle does not keep owners alive.

## 6. The Traps — What Goes Wrong in Production

`Rc<RefCell<T>>` across threads does not compile — that is the compiler saving
you. Use `Arc<Mutex<T>>` or `Arc<RwLock<T>>`.

`borrow_mut()` while a `borrow()` is live panics at runtime. Keep borrow guards
short, avoid re-entrant calls that borrow the same cell, and prefer
`try_borrow` at risky boundaries.

`Rc` cycles in graphs/observers leak silently. Audit every back-pointer: if it
does not own, it must be `Weak`.

## 7. Compare With Related Concepts

`Box` vs `Rc` vs `Arc`: unique vs shared-single-thread vs shared-multi-thread.
Cost rises with flexibility.

`RefCell` vs `Mutex` vs `RwLock`: same interior-mutability idea, different
threading (single vs multi) and granularity (exclusive vs read/write-split).

`Rc` vs `Weak`: owning handle vs non-owning observer. Strong keeps alive; weak
merely watches.

## 8. 🧠 The Memory Hook

`Box` owns, `Rc` shares on one thread, `Arc` shares on many, `RefCell` bends
the borrow rules to runtime, `Weak` watches without owning — and cycles never
die.
