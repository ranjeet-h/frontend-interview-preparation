# Testing & Tooling

## 1. Why This Exists — The Problem First

Rust's safety guarantees mean little without proof the logic is right. The
toolchain bakes the proof workflow in: unit tests beside the code, integration
tests against the public API, and one command (`cargo test`) running both —
plus formatter, linter, UB detector, and benchmarks. Senior interviews probe
this because `#[cfg(test)]`, Clippy gates, and Miri separate hobby crates from
production crates.

## 2. The Analogy — Make It Obvious

Unit tests are kitchen taste-tests during cooking (small, fast, beside the
stove = beside the code). Integration tests are mystery-diner visits (outside
the kitchen, through the public menu = public API). `#[cfg(test)]` is the
"staff tasting" sign hung only after hours; `#[test]` is the judge's scorecard
on each dish. `cargo test` runs the whole tasting menu. Clippy is the health
inspector, rustfmt the plating standard, Miri the lab testing for invisible
toxins (UB), benchmarks the timed cook-off.

## 3. How It Actually Works — The Full Explanation

Unit tests live in `src/` under `#[cfg(test)] mod tests` (compiled only for
`cargo test`), each case marked `#[test]` (panics or `assert!` failures fail the
suite; `Result`-returning tests use `?` and fail on `Err`). Integration tests
live in `tests/*.rs`, each file a separate crate importing the library's public
API. `cargo test` builds all targets, runs tests in parallel threads, and
supports filters (`cargo test name_substr`), `-- --nocapture`, and doc-tests
(code examples in `///` comments run as tests). Clippy (`cargo clippy -- -D
warnings`) lints; rustfmt (`cargo fmt --check`) gates style; Miri (`cargo +nightly
miri test`) interprets `unsafe` paths to catch UB; benchmarks use `cargo bench`
(criterion or nightly `test::Bencher`) for timing regressions.

## 4. Real Code — See It Working

```rust
// src/lib.rs
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub fn parse_age(s: &str) -> Result<u8, String> {
    s.trim().parse::<u8>().map_err(|e| format!("bad age: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_two_numbers() {
        assert_eq!(add(2, 3), 5);
    }

    // Result-returning test: ? propagates, Err fails the test.
    #[test]
    fn parses_valid_age() -> Result<(), String> {
        assert_eq!(parse_age("42")?, 42);
        assert!(parse_age("abc").is_err());
        Ok(())
    }

    #[test]
    #[should_panic(expected = "overflow")]
    fn documents_panic() {
        panic!("overflow demo");
    }
}
```

```rust
// tests/integration.rs (separate crate, public API only)
use my_crate::add;

#[test]
fn adds_from_outside() {
    assert_eq!(add(1, 2), 3);
}
```

```bash
cargo test                 # all targets
cargo test parses_valid    # filter by name
cargo clippy -- -D warnings
cargo fmt --check
cargo +nightly miri test   # UB detector (nightly)
```

## 5. The Interview Questions — All of Them, Done Properly

**Q189: How are unit tests written in Rust?**

Inline in `src/` inside `#[cfg(test)] mod tests`, importing with `use
super::*`, each case `#[test] fn name() { assert!/assert_eq!(..) }`. They test
private and public code alike and compile only under `cargo test`.

**Q190: Unit tests vs integration tests?**

Unit: in-`src`, fast, white-box (can touch privates), per-module. Integration:
in `tests/`, black-box (public API only), each file its own crate, slower.
Libraries need both; binaries lean on integration tests (thin `main` calling
the lib).

**Q191: What does `#[cfg(test)]` do?**

Conditional compilation: the annotated module/item exists only when compiling
with `--test` / `cargo test`. Keeps test helpers and dev-dependencies out of
release binaries.

**Q192: What does `#[test]` do?**

Marks a function as a test case: the harness runs it, catches panics, reports
pass/fail, and supports attributes (`#[should_panic]`, `#[ignore]`). Test fns
may return `()` or `Result<(), E: Debug>`.

**Q193: How do you test `Result`-returning code?**

Return `Result<(), E>` from the test and use `?`: `Ok(())` passes, `Err`
fails with debug output. Assert error cases with `.is_err()` / `.unwrap_err()`
and match on variants for precise coverage (see example above).

**Q194: What does `cargo test` do?**

Builds lib, bins, tests, and doc-tests in test profile, runs them (parallel by
default), and summarizes. Filters, `-- --nocapture` (show `println!`), and
`-- --test-threads=1` tune execution. Doc examples in `///` blocks run too.

**Q195: What is Clippy?**

The official linter (`cargo clippy`): hundreds of checks for bugs, perf
foibles, and non-idioms (`needless_clone`, `await_holding_lock`, `len_zero`).
Mature teams gate merges on `clippy -- -D warnings`. Distinct from formatting
(rustfmt) — Clippy judges substance, rustfmt judges shape.

**Q196: What is rustfmt?**

The canonical formatter (`cargo fmt` / `rustfmt`): one true style, no debates.
CI gates on `cargo fmt --check`. Run it before every commit; never hand-format
what the tool owns.

**Q197: What is Miri?**

An interpreter (`cargo +nightly miri test`) that executes tests while tracking
aliasing, alignment, initialization, and data-race UB — catching unsound
`unsafe` that passes normal tests. Essential for any crate containing `unsafe`;
 overkill-free for pure safe code but still a strong CI signal.

**Q198: What is benchmarking in Rust?**

Measuring throughput/latency across commits: nightly `#[bench]` (legacy),
stable Criterion (`cargo bench` with statistical reports and regression
detection), or `divan`. Benchmarks live in `benches/` with `cargo bench`.
Interview point: benchmark the hot path (parsers, hot loops, lock contention),
not everything — and always compare against a baseline.

## 6. The Traps — What Goes Wrong in Production

Testing only the happy path with `unwrap()`-laden tests that mirror the bug
instead of the contract. Cover `Err` branches and boundary inputs.

Putting integration logic in `src/main.rs` where `tests/` cannot import it.
Keep `main` thin; move logic to `lib.rs`.

Ignoring Clippy/fmt in CI, then drowning reviews in style nits while real
lints (`await_holding_lock`, UB-adjacent patterns) go unrun.

## 7. Compare With Related Concepts

Unit (white-box, fast) vs integration (black-box, realistic) vs doc-test
(examples that never rot): three layers, all run by one command.

`cargo test` (correctness) vs Clippy (idiom/bug lint) vs fmt (style) vs Miri
(soundness) vs bench (speed): five questions, five tools, one toolchain.

`#[cfg(test)]` (compile gate) vs `#[test]` (run gate): inclusion vs execution.

## 8. 🧠 The Memory Hook

Taste in the kitchen (unit), serve mystery diners (integration), inspect
health (Clippy), plate uniformly (fmt), lab-test for toxins (Miri) — and time
the cook-off (bench).
