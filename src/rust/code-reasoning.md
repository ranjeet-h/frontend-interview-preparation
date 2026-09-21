# Code Reasoning

Read-every-line questions. For each snippet: verdict, compiler error code,
why, and the minimal fix. All verdicts below were checked against `rustc`
borrow-checker rules (NLL: a borrow ends at its last use).

## Q101 — Moved `String`

```rust
let s1 = String::from("hello");
let s2 = s1;
println!("{s1}");
```

**Verdict: does NOT compile — error[E0382]: borrow of moved value.**

`String` is not `Copy`. `let s2 = s1;` moves ownership; `s1` is invalidated to
prevent double-free. Fix: borrow or clone deliberately:

```rust
let s1 = String::from("hello");
let s2 = s1.clone(); // explicit deep copy: both usable
println!("{s1} {s2}");
// or: let s2 = &s1; println!("{s1} {s2}");
```

## Q102 — Copied `i32`

```rust
let x = 10;
let y = x;
println!("{x} {y}");
```

**Verdict: compiles, prints `10 10`.**

`i32` is `Copy`: assignment duplicates the 4 bytes, both bindings stay valid.
No move, no drop logic involved.

## Q103 — Two shared borrows

```rust
let mut s = String::from("hello");
let r1 = &s;
let r2 = &s;
println!("{r1} {r2}");
```

**Verdict: compiles.**

Many `&T` may coexist. Neither borrow mutates, so no aliasing hazard. (`mut`
on `s` is unused here but harmless.)

## Q104 — Two mutable borrows

```rust
let mut s = String::from("hello");
let r1 = &mut s;
let r2 = &mut s;
println!("{r1} {r2}");
```

**Verdict: does NOT compile — error[E0499]: cannot borrow `s` as mutable more than once.**

Two live `&mut` could both write. Fix: sequence the borrows so the first ends
before the second begins:

```rust
let mut s = String::from("hello");
let r1 = &mut s;
println!("{r1}"); // r1 last use: borrow ends here
let r2 = &mut s;
println!("{r2}");
```

## Q105 — Shared + mutable together

```rust
let mut s = String::from("hello");
let r1 = &s;
let r2 = &mut s;
println!("{r1} {r2}");
```

**Verdict: does NOT compile — error[E0502]: cannot borrow `s` as mutable because it is also borrowed as immutable.**

While `r1` is live (used in `println!`), `r2` cannot mutate. Fix: end `r1`
first:

```rust
let mut s = String::from("hello");
let r1 = &s;
println!("{r1}"); // r1 ends
let r2 = &mut s;
println!("{r2}");
```

## Q106 — Return reference to local

```rust
fn get_string() -> &String {
    let s = String::from("hello");
    &s
}
```

**Verdict: does NOT compile — error[E0515]: cannot return reference to local variable.**

`s` is dropped at function exit; the reference would dangle. Fixes:

```rust
fn get_string() -> String { // move ownership out
    String::from("hello")
}
// or tie output to an input: fn get<'a>(s: &'a String) -> &'a String { s }
// or return 'static: fn get() -> &'static str { "hello" }
```

## Q107 — Missing lifetimes

```rust
fn longest(x: &str, y: &str) -> &str {
    if x.len() > y.len() { x } else { y }
}
```

**Verdict: does NOT compile — error[E0106]: missing lifetime specifiers.**

Two input lifetimes, one elided output: the compiler cannot know whether the
result borrows `x` or `y`. Fix:

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```

The single `'a` is the conservative contract: output lives as long as the
shorter input.

## Q108 — Consuming loop then use-after-move

```rust
let v = vec![1, 2, 3];
for x in v {
    println!("{x}");
}
println!("{v:?}");
```

**Verdict: does NOT compile — error[E0382]: use of moved value.**

`for x in v` calls `IntoIterator::into_iter(v)`, moving `v`. Fix: borrow:

```rust
let v = vec![1, 2, 3];
for x in &v {
    println!("{x}");
}
println!("{v:?}"); // OK
```

## Q109 — Mutate while iterating

```rust
let mut numbers = vec![1, 2, 3];
for number in &numbers {
    numbers.push(*number);
}
```

**Verdict: does NOT compile — error[E0502]: cannot borrow `numbers` as mutable because it is also borrowed as immutable.**

The `for` holds a shared borrow for the whole loop; `push` needs `&mut` and
could reallocate, invalidating the iterator. Fixes: iterate over a snapshot,
or collect first:

```rust
let mut numbers = vec![1, 2, 3];
let snapshot = numbers.clone();
for number in &snapshot {
    numbers.push(*number);
}
// or: for i in 0..numbers.len() { let n = numbers[i]; numbers.push(n); }
// (index loop re-borrows per iteration; still careful with growth)
```

## Q110 — `iter` vs `iter_mut` vs `into_iter`

```rust
for x in v.iter() {}     // x: &T — borrows, v usable after
for x in v.iter_mut() {} // x: &mut T — mutably borrows (v must be mut), usable after
for x in v.into_iter() {}// x: T — consumes v, v moved and unusable after
```

Use `iter` to read, `iter_mut` to edit in place, `into_iter` to consume/transform
into ownership (e.g. `v.into_iter().map(...).collect()`).

## Q111 — Match on `Option`

```rust
let value = Some(10);
match value {
    Some(x) => println!("{x}"),
    None => println!("None"),
}
```

**Verdict: compiles, prints `10`.**

`i32` is `Copy`, so matching by value is fine. For non-`Copy` payloads, match
on a reference (`match &value`) or use `if let` to avoid moving.

## Q112 — Deref coercion `&String` → `&str`

```rust
let s = String::from("hello");
fn print_value(value: &str) {}
print_value(&s);
```

**Verdict: compiles.**

`&String` coerces to `&str` via `Deref<Target=str>`. This is why APIs take
`&str`: they accept `String`, literals, and slices uniformly. Prefer `&str`
parameters over `&String`.

## Q113 — `Box` deref

```rust
let x = Box::new(10);
println!("{}", *x);
```

**Verdict: compiles, prints `10`.**

`Box<T>` owns heap storage and implements `Deref`; `*x` follows the pointer.
`Box` is also how recursive types (`Cons(Box<List>)`) get a statically known
size.

## Q114 — Why can't `Rc<T>` normally be moved into another thread?

Because `Rc`'s counter is non-atomic, so concurrent clone/drop would race. The
type is `!Send + !Sync`, and `thread::spawn` / `tokio::spawn` require `Send`.
Move an `Arc<T>` instead (or restructure to message passing).

## Q115 — Why can `Arc<T>` be moved between threads?

Its counter uses atomic operations, so concurrent ownership changes are sound.
`Arc<T>` is `Send + Sync` when `T: Send + Sync`. Sharing is still read-only
without a lock — wrap mutation in `Mutex`/`RwLock` or use atomics.

## Q116 — Why might this async function become `!Send`?

```rust
use std::sync::Mutex;
use std::sync::Arc;

async fn work(cache: Arc<Mutex<Vec<String>>>) {
    let guard = cache.lock().unwrap(); // std MutexGuard is !Send
    some_async_work().await;           // guard held across .await
    drop(guard);
}
async fn some_async_work() {}
```

Because `std::sync::MutexGuard` is `!Send`. Holding it across `.await` makes
the future's state machine hold a `!Send` value across a yield point, so the
whole future is `!Send` and `tokio::spawn` (multi-threaded) rejects it. Fix by
scoping the guard before the await, or use `tokio::sync::Mutex`:

```rust
async fn work_fixed(cache: Arc<Mutex<Vec<String>>>) {
    { let mut guard = cache.lock().unwrap(); guard.push("x".to_owned()); }
    some_async_work().await;
}
```

## Q117 — Find and fix the borrow problem without blind `.clone()`

Strategy: (1) read which borrow is live at the error line; (2) shorten the
borrow (end its last use earlier, scope the guard, iterate by index); (3) change
the signature (`String` → `&str`, `&Vec<T>` → `&[T]`); (4) restructure
(split read/write phases, collect-then-mutate). Clone only when the value must
genuinely be owned in two places (e.g. sent to another thread while retained).

## Q118 — Convert unnecessary clones into borrows

Smells: `fn f(s: String)` that only reads `s`; `arg.clone()` at every call;
`to_string()` just to call a `&str` API. Fix: take `&str`/`&[T]`/`&T`,
iterate with `iter()`, use `as_str()`/`as_slice()`, and push `.to_owned()`
to the single point where ownership is truly needed.

## Q119 — `String` → `&str` where ownership isn't required

```rust
// Before: forces every caller to give up or clone a String
fn greet_before(name: String) -> String { format!("hi {name}") }
// After: accepts String, &str, literals; caller decides
fn greet_after(name: &str) -> String { format!("hi {name}") }

fn main() {
    let owned = String::from("asha");
    greet_after(&owned); // no clone, owned still usable
    greet_after("sam");  // literals work too
}
```

Rule: take `&str` to read, return/construct `String` to own.

## Q120 — Trace ownership line by line

Method: label each binding as Owner / Moved-from / Borrowed (`&`/`&mut`) after
every statement. Mark moves (`=`, by-value call, `into_iter`), copies
(`Copy` types duplicate), and borrow regions (start to last use). The owner at
scope end is who drops. Practice on Q101–Q109 until the verdict is obvious
before compiling.
