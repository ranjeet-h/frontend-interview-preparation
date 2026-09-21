# Rust

Rust is a systems language that guarantees memory safety without a garbage
collector. The compiler — through ownership, borrowing, lifetimes, and traits —
rejects dangling references, data races, and use-after-free at compile time
instead of at runtime.

## Why this is a separate track

The JavaScript, TypeScript, and Python tracks assume a garbage collector or a
runtime that cleans up values for you. Rust moves that work to compile time:
every value has exactly one owner, the borrow checker validates every
reference, and lifetimes prove that no reference outlives its data. Keeping
Rust separate makes that boundary clear: if it compiles in safe Rust, whole
classes of memory and concurrency bugs are already ruled out.

## Recommended study order

Start with the memory model, then build toward types, concurrency, and async:

1. Learn [Ownership & Borrowing](ownership-borrowing.md) and
   [Lifetimes](lifetimes.md) first. These two chapters explain ~60% of all
   compiler errors you will meet in interviews.
2. Continue with [Strings & Collections](strings-collections.md),
   [Option / Result / Pattern Matching](option-result-matching.md),
   [Structs, Enums & Traits](structs-enums-traits.md), and
   [Generics & Associated Types](generics-associated-types.md).
3. Add [Smart Pointers](smart-pointers.md),
   [Iterators & Closures](iterators-closures.md), and
   [Modules & Cargo](modules-cargo.md).
4. Finish with [Concurrency](concurrency.md) and
   [Async Rust / Tokio](async-tokio.md) (including `Pin`, `Poll`/`Waker`,
   and cancellation safety).
5. Add the final core areas, kept interview-sized:
   [Unsafe Rust & Memory](unsafe-memory.md),
   [Macros](macros.md), and [Testing & Tooling](testing-tooling.md).
6. Practice [Code Reasoning](code-reasoning.md) (does-this-compile questions)
   and [Coding Practice](coding-practice.md), then use the
   [Interview Question Bank](interview-question-bank.md) for review.

## Interview priority

| Tier | Meaning | Focus |
|---|---|---|
| Tier 1 | Know well enough to explain and apply without notes. | Ownership, moves, `&T` vs `&mut T`, borrow checker, lifetimes, `String` vs `&str`, `Option`/`Result`, `?`, traits, generics, `Send`/`Sync`. |
| Tier 2 | Use confidently and explain the trade-off. | `Copy` vs `Clone`, `Vec` capacity, `HashMap` vs `BTreeMap`, `impl Trait` vs `dyn Trait`, associated types, `From`/`Into`, `Box`/`Rc`/`Arc`, iterators, closures, `Mutex`, channels, futures, Tokio basics, Cargo modules. |
| Tier 3 | Recognize, read accurately, use when needed. | `RefCell` interior mutability, `Weak`, monomorphization details, `spawn_blocking`, `select!`/`join!` edge cases, custom error types, `Pin`/`Waker`/cancellation safety, `unsafe` obligations, macros, testing tooling. |

## Track lessons

| Lesson | Interview focus |
|---|---|
| [Ownership & Borrowing](ownership-borrowing.md) | Moves, borrows, `Copy`/`Clone`, borrow checker (Q1–Q17) |
| [Lifetimes](lifetimes.md) | References that are proven valid, elision, `'static` (Q18–Q25) |
| [Strings & Collections](strings-collections.md) | `String` vs `&str`, `Vec`, maps (Q26–Q31) |
| [Option / Result / Pattern Matching](option-result-matching.md) | Null-free error handling, `?`, `match` (Q32–Q41) |
| [Structs, Enums & Traits](structs-enums-traits.md) | Data modeling, dispatch, orphan rule (Q42–Q55) |
| [Generics & Associated Types](generics-associated-types.md) | Generics, associated types, conversions, `?Sized` (Q151–Q160) |
| [Smart Pointers](smart-pointers.md) | `Box`, `Rc`, `Arc`, `RefCell`, `Weak` (Q56–Q63) |
| [Iterators & Closures](iterators-closures.md) | Zero-cost transforms, `Fn` traits (Q64–Q72) |
| [Modules & Cargo](modules-cargo.md) | Packages, crates, visibility, workspaces, Clippy (Q161–Q171) |
| [Concurrency](concurrency.md) | `Send`/`Sync`, locks, channels, fearless concurrency (Q73–Q85) |
| [Async Rust / Tokio](async-tokio.md) | Futures, executor, `spawn`, `select!`/`join!`, `Pin`, cancellation (Q86–Q100, Q199–Q204) |
| [Unsafe Rust & Memory](unsafe-memory.md) | `unsafe`, raw pointers, UB, FFI — interview-sized (Q172–Q181) |
| [Macros](macros.md) | `macro_rules!`, `derive`, procedural kinds — basics (Q182–Q188) |
| [Testing & Tooling](testing-tooling.md) | Unit/integration tests, Clippy, fmt, Miri, benches (Q189–Q198) |
| [Code Reasoning](code-reasoning.md) | Does-this-compile, fix-the-borrow (Q101–Q120) |
| [Coding Practice](coding-practice.md) | Rust-specific implementation tasks (Q121–Q150) |
| [Interview Question Bank](interview-question-bank.md) | All 204 questions indexed for review |

## Source policy

The Rust compiler (`rustc`), Cargo, and the official
[Rust Book](https://doc.rust-lang.org/book/),
[`std` docs](https://doc.rust-lang.org/std/), and
[Tokio docs](https://tokio.rs/) are the authority for language semantics.
Interview-prep guides set topic priority only; they are not technical truth.
Every behavior claim here should be checkable with a small `rustc` program.

## Question policy

Every question in this track is answered in its lesson or is clearly presented
as a navigation label to an answered lesson or question-bank entry. This landing
page is a roadmap, not an unanswered prompt list.
