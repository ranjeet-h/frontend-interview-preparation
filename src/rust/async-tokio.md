# Async Rust / Tokio

## 1. Why This Exists — The Problem First

Threads are expensive (stacks, context switches) for 100k idle connections.
Async lets one thread juggle thousands of I/O-bound tasks by parking each task
at `.await` and polling it only when its data is ready. Rust futures are lazy
state machines with no runtime attached — an executor (e.g. Tokio) must drive
them. Mixing blocking work or std locks into that executor stalls every task on
the thread.

## 2. The Analogy — Make It Obvious

A future is a recipe with bookmarks: it does nothing until a chef (executor)
starts cooking, and `.await` is "wait by the oven until the timer rings while
I prep other dishes." Tokio is the restaurant kitchen: the executor assigns
chefs, `spawn` seats a new order, `join!` waits for two dishes to finish
together, `select!` serves whichever dish is ready first. `spawn_blocking` is
the back room for chopping firewood — never chop at the sushi counter (the
async thread) or all orders stall. Holding a std `MutexGuard` across `.await`
is locking the pantry and taking a nap: nobody else can cook.

## 3. How It Actually Works — The Full Explanation

`async fn` returns an anonymous `Future` (`poll()` → `Pending`/`Ready`).
Futures are lazy: nothing runs until polled by an executor. `.await` yields to
the executor when pending and resumes with the value when ready. Tokio provides
the runtime (multi-threaded scheduler), I/O drivers, timers, and sync
primitives. `tokio::spawn` requires `Send + 'static` on multi-threaded
runtimes because tasks may migrate threads and outlive the spawner. CPU work
belongs on `spawn_blocking` (dedicated blocking pool). `tokio::sync::Mutex`
holds no OS thread while waiting, so it can be held across `.await` (with care
about contention); `std::sync::Mutex` blocks the thread and must never be held
across `.await`.

## 4. Real Code — See It Working

```rust
// Cargo.toml: tokio = { version = "1", features = ["full"] }
use std::time::Duration;
use tokio::time::timeout;

async fn fetch_user(id: u64) -> String {
    tokio::time::sleep(Duration::from_millis(50)).await; // yields, doesn't block
    format!("user-{id}")
}

async fn fetch_orders(id: u64) -> Vec<String> {
    tokio::time::sleep(Duration::from_millis(80)).await;
    vec![format!("order-{id}-a")]
}

#[tokio::main]
async fn main() {
    // Concurrent: both run together, total ~80ms not 130ms
    let (user, orders) = tokio::join!(fetch_user(1), fetch_orders(1));
    println!("{user} {orders:?}");

    // Race: first ready wins, other branch is dropped
    tokio::select! {
        u = fetch_user(2) => println!("user first: {u}"),
        o = fetch_orders(2) => println!("orders first: {o:?}"),
    }

    // Spawned task: must be Send + 'static
    let handle = tokio::spawn(async {
        fetch_user(3).await
    });
    println!("spawned: {}", handle.await.unwrap());

    // Blocking work off the async executor
    let hash = tokio::task::spawn_blocking(|| {
        // expensive CPU work here; runs on blocking pool
        (0..1_000_000u64).sum::<u64>()
    })
    .await
    .unwrap();
    println!("hash {hash}");

    // Timeout wrapper
    match timeout(Duration::from_millis(10), fetch_user(9)).await {
        Ok(u) => println!("{u}"),
        Err(_) => println!("timed out"),
    }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q86: What is `async/await` in Rust?**

Syntax for writing non-blocking sequential-looking code. `async fn` returns a
future; `.await` suspends the current task until the future resolves, freeing
the thread for other tasks. No threads are spawned implicitly — an executor
must run the future.

**Q87: What is a `Future`?**

A state machine implementing `Future::poll(cx) -> Poll<Output>`. `Pending`
means "not ready, wake me via the waker"; `Ready(v)` delivers the value. The
compiler generates the machine from `async` blocks (each `.await` is a state).

**Q88: Why are Rust futures lazy?**

Creating a future does zero work; it only captures state. Work happens on
`poll`. This enables cheap composition (`join!`, `select!`, combinators) and
cancellation by dropping. Contrast with JS promises/Go goroutines, which start
eagerly.

**Q89: What happens when `.await` is called?**

The current future polls its child. If ready, execution continues immediately.
If pending, the task registers a waker, yields to the executor, and resumes
(parallel tasks progress) when woken. `.await` never blocks the OS thread.

**Q90: What is Tokio?**

The de-facto async runtime: multi-threaded work-stealing scheduler, async
I/O (TCP/UDP/fs/process/signal), timers, and task-aware sync (`Mutex`,
`RwLock`, `Semaphore`, `mpsc`/`broadcast`/`watch`/`oneshot` channels).

**Q91: What is an async runtime?**

The engine that polls futures: reactor (I/O readiness + timers) plus executor
(task scheduling). Rust `std` ships none; Tokio, `async-std`, and `smol` fill
the role. `#[tokio::main]` boots one for `main`.

**Q92: What is an executor?**

The scheduler that owns tasks and calls `poll` when they are woken. Tokio's
multi-threaded executor load-balances across worker threads with work
stealing. Single-threaded (`new_current_thread`) executors never move tasks.

**Q93: What does `tokio::spawn` do?**

Schedules an independent task on the runtime, returning a `JoinHandle` for its
result. The task runs concurrently with the spawner; dropping the handle
detaches (task continues) unless aborted.

**Q94: Why does `tokio::spawn` often require `Send + 'static`?**

On a multi-threaded runtime the task may execute on any worker thread (`Send`)
and may outlive the spawning scope (`'static`: no borrowed stack data). Fixes:
move owned/`Arc` data in, use `scope` APIs or `new_current_thread` + `spawn_local`
for non-`Send` futures.

**Q95: What is `spawn_blocking`?**

An escape hatch that runs a blocking closure on a dedicated thread pool and
returns its result as a future. For CPU-heavy compute, `std::fs`, or blocking
libraries that would otherwise stall async workers.

**Q96: Why should blocking work not be performed directly inside async code?**

Async workers are few (often one per core). A blocking call parks the whole
worker, starving every task queued on it — latency spikes and timeouts. Keep
async tasks non-blocking; push blocking work to `spawn_blocking`.

**Q97: What is the difference between `std::sync::Mutex` and `tokio::sync::Mutex`?**

`std` mutex blocks the OS thread while waiting (fast uncontended, deadly across
`.await`). Tokio's mutex is task-aware: contention yields the task instead of
the thread, so it can be held across `.await`. Tokio's version is slower
uncontended and not for hot lock-free paths; prefer brief critical sections in
both.

**Q98: Why is holding a mutex guard across `.await` dangerous?**

With `std::sync::Mutex` it blocks the executor thread (all co-located tasks
stall; can deadlock if the waker needs that thread). With Tokio's mutex it is
allowed but still extends contention: every awaited moment holds up other
tasks. Pattern: clone/copy what you need, drop the guard, then `.await`.

```rust
// BAD: std guard across await
// let guard = std_mutex.lock().unwrap();
// some_async().await; // blocks worker!

// GOOD: scope the guard, then await
// { let guard = std_mutex.lock().unwrap(); cache_update(&guard); }
// some_async().await;
```

**Q99: What is `tokio::select!`?**

A race macro: polls several branches concurrently, runs the first ready arm,
drops the losers. Used for timeouts, cancellation, and "first response wins."
Add `biased;` when priority matters; guard with `if` conditions per branch.

**Q100: What is `tokio::join!`?**

A concurrency macro: polls several branches concurrently and waits for *all*
to finish, returning a tuple. All branches run on the same task (no `Send`
bound beyond the future itself). For independent tasks needing handles, use
`tokio::spawn` + `handle.await` or `JoinSet`.

**Q199: What are `Pin` and `Unpin`?**

`Pin<P>` is a wrapper guaranteeing the pointee will never move again, so
self-referential futures (which hold pointers into their own state across
`.await`) stay valid. `Unpin` is an auto-trait marking types that are safe to
move even when pinned (most ordinary types are `Unpin`; `async` futures with
borrowed state across awaits generally are not). You rarely implement them —
you respect them via `Box::pin`, `pin!`, and `Pin<&mut T>` APIs.

**Q200: Why does async Rust need `Pin`?**

An `async` block becomes a state machine holding live variables across yield
points; if the future moved in memory after it started, internal references
would dangle. `Pin` lets the executor promise "this future's address is
stable," making self-borrows sound. That is why `Future::poll` takes
`Pin<&mut Self>`, and why immovable futures must be boxed/pinned before
spawning or selecting.

**Q201: What are `Poll::Ready` and `Poll::Pending`?**

The two outcomes of `Future::poll`: `Ready(value)` delivers the result
immediately; `Pending` means "not yet — I registered a waker, poll me again
when woken." Executors loop on this: ready tasks continue, pending tasks park.
`.await` is syntax over the same contract.

**Q202: What is a `Waker`?**

The executor's callback handle (`Context::waker`) a pending future clones and
hands to the I/O source or timer. When data arrives, the source calls
`wake()`/`wake_by_ref()`, scheduling the task for re-poll. Without correct
waking, a future sleeps forever — the classic custom-future bug.

**Q203: How does an `async fn` become a state machine?**

The compiler desugars each `.await` into a state: live variables become struct
fields, suspension points become discriminant values, and `poll` matches on
the current state to resume after the last yield. Borrows held across `.await`
extend field lifetimes (often making the future `!Send` or larger) — which is
why holding guards across awaits has type-level consequences (see Q98/Q116).

**Q204: What is cancellation safety?**

Whether dropping a future mid-`await` is harmless. `tokio::select!` and
timeouts *cancel* losers by dropping them, so a future that loses half-written
state (e.g. sent a request but dropped before reading the response) can corrupt
protocols or lose data. Tokio documents each combinator's guarantee; for custom
code, prefer `select!` only over documented cancellation-safe ops, or add
explicit cleanup/drop guards.

## 6. The Traps — What Goes Wrong in Production

Holding any lock across `.await` (especially std) is the #1 Tokio outage
pattern. Audit with `clippy::await_holding_lock`.

Calling blocking libraries (`std::fs::read`, `reqwest::blocking`, heavy crypto)
inline in handlers stalls workers. Wrap in `spawn_blocking` or use async
equivalents.

Unbounded `spawn` per request exhausts memory. Use `Semaphore`/`JoinSet` limits
and timeouts (`tokio::time::timeout`) on fallible I/O.

## 7. Compare With Related Concepts

Future (lazy, polled) vs Promise (eager, pushed) vs goroutine (eager,
scheduled by runtime): Rust composes without starting; others start on
creation.

`join!` (all, same task) vs `select!` (first, cancel rest) vs `spawn` (detached
task with handle): same-task concurrency vs racing vs independent scheduling.

`std::sync::Mutex` (thread-blocking) vs `tokio::sync::Mutex` (task-yielding):
never cross `.await` with the former; minimize crossings with the latter.

## 8. 🧠 The Memory Hook

Futures nap at `.await`, the executor cooks other orders, Tokio runs the
kitchen — and firewood (`spawn_blocking`) never belongs on the sushi counter.
