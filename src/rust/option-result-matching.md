# Option / Result / Pattern Matching

## 1. Why This Exists — The Problem First

Null pointers caused billion-dollar crashes because "no value" was
indistinguishable from "a value" at the type level. Rust removes `null` and
encodes absence (`Option`) and failure (`Result`) as enums the compiler forces
you to handle. `match` must be exhaustive so no case silently falls through.

## 2. The Analogy — Make It Obvious

`Option` is a mailbox that is either empty (`None`) or holds one letter
(`Some`). `Result` is a lab report that is either a result (`Ok`) or an error
slip (`Err`) explaining what went wrong. `match` is opening every possible
envelope at the post office counter — the clerk will not let you leave until
you have a plan for each kind. `?` is handing a lab error straight to your
supervisor instead of handling it yourself.

## 3. How It Actually Works — The Full Explanation

```rust
enum Option<T> { None, Some(T) }
enum Result<T, E> { Ok(T), Err(E) }
```

`?` unwraps `Ok`/`Some` or early-returns the error (converting via `From`).
`unwrap` panics on failure; `expect` panics with a custom message; `?`
propagates. `panic!` is for unrecoverable programmer errors (broken invariants,
startup misconfiguration), never for routine input or I/O. `match` checks every
variant; `if let` is sugar for one interesting case plus an optional `else`.

## 4. Real Code — See It Working

```rust
use std::fs;
use std::num::ParseIntError;

fn parse_age(s: &str) -> Result<u8, ParseIntError> {
    s.trim().parse::<u8>() // no panic: failure becomes Err
}

fn read_age(path: &str) -> Result<u8, Box<dyn std::error::Error>> {
    let text = fs::read_to_string(path)?; // ? propagates io::Error via From
    let age = text.trim().parse::<u8>()?; // ? propagates ParseIntError via From
    Ok(age)
}

fn main() {
    let value = Some(10);
    match value {
        Some(x) => println!("got {x}"),
        None => println!("none"),
    }
    if let Some(x) = value {
        println!("if-let got {x}");
    }

    match parse_age("42") {
        Ok(age) => println!("age {age}"),
        Err(e) => println!("bad input: {e}"),
    }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q32: Why doesn't Rust have `null`?**

Because `null` lets any reference be secretly absent, so every dereference is a
potential crash the type system cannot see (Tony Hoare's "billion-dollar
mistake"). Rust forces absence into the type (`Option<T>`), so callers must
handle `None` before they can touch the `T`.

**Q33: What is `Option<T>`?**

The absence-or-value enum: `Some(T)` or `None`. Used for optional fields,
nullable lookups, and partial functions. Combinators (`map`, `and_then`,
`unwrap_or`, `ok_or`) transform it without manual branching.

**Q34: What is `Result<T, E>`?**

The success-or-failure enum: `Ok(T)` or `Err(E)`. Used for fallible operations
(I/O, parsing, validation). `E` is usually an error type implementing
`std::error::Error`. Combinators (`map`, `map_err`, `and_then`) chain fallible
steps.

**Q35: What is the difference between `Option` and `Result`?**

`Option` means "may be absent" with no reason attached; `Result` means "may
have failed" with an error value explaining why. Convert with `.ok_or(err)` and
`.ok()`. Use `Option` for lookups/defaults, `Result` for operations that can go
wrong in an interesting way.

**Q36: What does the `?` operator do?**

On `Result`: returns the `Ok` payload, or early-returns `Err(e.into())` from
the enclosing function (which must itself return `Result` or `Option`). On
`Option`: returns the `Some` payload or early-returns `None`. It is propagation
with automatic error conversion, not a panic.

**Q37: `unwrap()` vs `expect()` vs `?`?**

`unwrap()` extracts success or panics with a generic message — only for tests,
examples, or proven invariants. `expect(msg)` panics with your message —
documents *why* failure is impossible. `?` propagates to the caller — the
production default for recoverable errors. Never `unwrap` user input or I/O in
a server.

**Q38: When should `panic!` be used?**

For bugs and unrecoverable startup states: violated invariants, corrupt
internal state, missing required config without which the process cannot run.
Not for bad user input, missing files, network failures, or parse errors —
those are `Result`s. Libraries should almost never panic on external input.

**Q39: What is pattern matching?**

Destructuring values by shape: literals, enum variants, structs, tuples, slices,
and guards. `match`, `if let`, `let else`, and `while let` all use patterns.
Bindings default to move/copy; use `ref`/`&` patterns or match on references to
borrow instead.

**Q40: Why must `match` be exhaustive?**

So adding a variant or forgetting a case is a compile error, not a silent
runtime fallthrough. The compiler proves every possible input has an arm. Use `_`
only as a deliberate catch-all, and prefer listing variants explicitly in
libraries so new variants break callers loudly.

**Q41: `match` vs `if let`?**

`match` handles all cases and returns a value from any arm; required when every
case needs distinct logic. `if let` handles one interesting pattern and ignores
(or `else`-handles) the rest; best for "do X if it matches, otherwise skip."
`let...else` (Rust 1.65+) refutes and diverges on the else branch.

## 6. The Traps — What Goes Wrong in Production

`unwrap` in request handlers turns a bad client payload into a server crash.
Propagate with `?` and map to a 4xx response instead.

Using `Option::unwrap` after `is_some()` instead of `if let`/`map` introduces
TOCTOU-style races in concurrent code and is simply less readable. Prefer
combinators.

Catch-all `_` arms swallow new error variants silently. In error-handling
`match`, enumerate variants so the compiler warns you when the error enum grows.

## 7. Compare With Related Concepts

`Option` vs `Result` vs exceptions: Rust encodes absence and failure in return
types you must handle; exceptions are invisible control flow. No `try/catch`
for business errors — only `panic` unwinding for bugs.

`?` vs `unwrap` vs `match`: `?` delegates, `unwrap` crashes, `match` decides
locally. Choose by who should handle the failure.

`match` vs `if let`: exhaustive decision vs focused extraction.

## 8. 🧠 The Memory Hook

No null, no silent fallthrough. `Option` says "maybe," `Result` says "or why
not," `match` proves you handled both, `?` passes the problem up.
