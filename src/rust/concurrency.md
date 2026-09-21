# Concurrency

## 1. Why This Exists — The Problem First

Threads share memory, and shared mutable memory causes data races: two threads
racing to read and write the same location with no ordering. Most languages
detect this at runtime (if at all). Rust detects it at compile time with two
marker traits — `Send` (safe to move across threads) and `Sync` (safe to share
across threads) — plus locks and channels that carry those guarantees in their
types.

## 2. The Analogy — Make It Obvious

"Fearless concurrency" means the compiler is a safety inspector who checks the
scaffolding before anyone climbs. `Send` is a "safe to transport to another
worksite" sticker; `Sync` is a "safe for two crews to use at once" sticker.
`Rc` has neither sticker (its counter would tear). `Arc` has both (atomic
counter). `Mutex` is a tool shed with one key; `RwLock` is a reading room with
many reader badges but one writer key. Channels are conveyor belts between
crews — no shared tools, justonews parts handed over.

## 3. How It Actually Works — The Full Explanation

`Send: a `T` can be moved to another thread. `Sync`: `&T` can be shared across
threads (equivalently, `T` is safe behind a shared reference). Most types are
automatically `Send + Sync`; opt-outs are `Rc`, `RefCell`, raw pointers, and
anything holding them. `Mutex<T>` gives exclusive access via a guard
(`lock().unwrap()`); `RwLock<T>` allows many readers or one writer. Channels
(`mpsc`, `crossbeam`, `tokio::sync::mpsc`) transfer ownership between threads
instead of sharing. Safe Rust cannot create a data race (simultaneous unsynced
read+write); it *can* deadlock (locks are logic, not memory safety).

## 4. Real Code — See It Working

```rust
use std::sync::{Arc, Mutex, RwLock, mpsc};
use std::thread;

fn main() {
    // Share a counter between threads
    let counter = Arc::new(Mutex::new(0));
    let mut handles = Vec::new();
    for _ in 0..8 {
        let c = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            for _ in 0..1_000 {
                *c.lock().unwrap() += 1; // guard dropped at statement end
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    println!("counter = {}", counter.lock().unwrap()); // 8000

    // RwLock: many readers
    let cache = Arc::new(RwLock::new(vec![1, 2, 3]));
    {
        let readers: Vec<_> = (0..4)
            .map(|_| {
                let c = Arc::clone(&cache);
                thread::spawn(move || c.read().unwrap().len())
            })
            .collect();
        for r in readers {
            println!("len {}", r.join().unwrap());
        }
    }

    // Channels: move data, don't share it
    let (tx, rx) = mpsc::channel();
    let producer = thread::spawn(move || {
        for i in 0..3 {
            tx.send(i).unwrap();
        }
    });
    for msg in rx {
        println!("got {msg}");
    }
    producer.join().unwrap();

    // Compile-time proof: Rc is !Send
    // fn assert_send<T: Send>() {}
    // assert_send::<std::rc::Rc<i32>>(); // ERROR: Rc cannot be sent between threads
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q73: What does fearless concurrency mean?**

That safe Rust programs cannot have data races, so refactoring single-threaded
code to multi-threaded code surfaces mistakes as compile errors rather than
flaky production crashes. It does not mean deadlock-free or logic-bug-free —
only memory-safe concurrency.

**Q74: What is `Send`?**

Marker trait: ownership of `T` may be transferred to another thread. `Mutex<T>`,
channels, and `thread::spawn`'s closure require it. Almost all owned types are
`Send` except `Rc`, `RefCell`, and raw pointers.

**Q75: What is `Sync`?**

Marker trait: `&T` may be shared across threads. If `T: Sync`, multiple threads
can hold `&T` simultaneously. `Mutex<T>` is `Sync` even when `T` is not, because
access is serialized.

**Q76: What is the difference between `Send` and `Sync`?**

`Send` is about moving *ownership* across threads; `Sync` is about *sharing a
reference* across threads. Formally `T: Sync` iff `&T: Send`. A type can be
`Send` but `!Sync` (e.g. `Cell<T>`: movable, but sharing `&Cell` would allow
racy mutation) or neither (`Rc`).

**Q77: Why isn't `Rc<T>` thread-safe?**

Its reference count uses non-atomic increments. Two threads cloning/dropping
concurrently would race on the counter (lost updates, double-free). Hence `Rc`
is explicitly `!Send + !Sync` and the compiler rejects moving it to another
thread.

**Q78: Why is `Arc<T>` thread-safe?**

Its counter uses atomic operations with proper memory ordering, so concurrent
clone/drop is sound. `Arc<T>` is `Send + Sync` whenever `T` is `Send + Sync`
(immutable sharing needs both). Mutation still needs a lock or atomic inner
type.

**Q79: What is `Mutex<T>`?**

Mutual-exclusion lock wrapping the data itself (`Mutex<T>`, not a separate
lock + data). `lock()` returns a `MutexGuard` that derefs to `&mut T`; unlock
happens on guard drop. Poisoning (`lock().unwrap()` vs handling `PoisonError`)
signals a panicked holder.

**Q80: Why is `Arc<Mutex<T>>` commonly used?**

`Arc` solves *shared ownership across threads*; `Mutex` solves *exclusive
mutation*. Together they are the simplest correct "shared mutable state"
pattern: clone the `Arc` per thread, `lock()` briefly to mutate. For read-heavy
workloads prefer `Arc<RwLock<T>>`; for counters prefer atomics.

**Q81: What is `RwLock<T>`?**

Reader-writer lock: many concurrent readers or one exclusive writer. `read()`
yields `&T`, `write()` yields `&mut T`. Higher read throughput than `Mutex`,
but writer starvation and slightly higher overhead are possible.

**Q82: `Mutex` vs `RwLock`?**

`Mutex`: one accessor at a time, simplest, best for short critical sections
and mixed read/write. `RwLock`: parallel reads, best for read-heavy data with
rare writes. Both can deadlock; neither prevents logic races (check-then-act
still needs the guard held across both steps).

**Q83: What are channels?**

Message-passing pipes that transfer *ownership* between threads (`mpsc`:
multi-producer single-consumer; `mpmc` via `crossbeam`/`tokio`). `send`
moves the value; `recv`/`iter` yields it. Prefer channels when threads form a
pipeline (producer-consumer) over shared-state locks.

**Q84: Can safe Rust have a deadlock?**

Yes. Deadlock is a liveness bug (two threads each waiting on the other's lock),
not memory unsafety, so the compiler allows it. Avoid by locking in a
consistent order, holding guards briefly, and never calling unknown code while
holding a lock. `try_lock` + backoff helps in advanced cases.

**Q85: Can safe Rust have a data race?**

No (by definition: concurrent unsynchronized read+write to the same memory).
The `Send`/`Sync` system plus the borrow checker rule this out. You can still
have *race conditions* (logical ordering bugs, e.g. check-then-act without a
lock) — those are logic errors, not data races, and the type system does not
catch them.

## 6. The Traps — What Goes Wrong in Production

Holding a `MutexGuard` across I/O, sleeps, or `.await` serializes the whole
system and risks deadlock. Scope guards tightly (`{ *c.lock().unwrap() += 1; }`).

Cloning an `Arc` per message instead of per thread leaks reference churn; clone
once per thread/task and `move` it in.

Using `Mutex` for a read-heavy cache kills parallelism — measure and switch to
`RwLock` or sharded locks/atomics when reads dominate.

## 7. Compare With Related Concepts

`Send` vs `Sync` vs `Copy`: thread-move vs thread-share vs bitwise-duplicate.
Orthogonal axes; a type can be any combination (except `Copy` implies no `Drop`
while locks need `Drop`).

`Mutex` vs `RwLock` vs channels vs atomics: exclusive vs shared-read vs
message-passing vs lock-free single values. Match the pattern: short writes →
`Mutex`; many reads → `RwLock`; pipelines → channels; counters/flags → atomics.

Deadlock (liveness) vs data race (safety): Rust prevents the second, not the
first.

## 8. 🧠 The Memory Hook

`Send` moves, `Sync` shares, `Arc` counts atomically, locks serialize, channels
hand over — and safe Rust never races, but it can still wait forever.
