# Interview Question Bank

All 204 Rust questions indexed. Theory answers live in their lesson; this page
is the fast review checklist.

## How to use

Tier 1 first (ownership, borrowing, lifetimes, `String`/`&str`,
`Option`/`Result`, traits, `Send`/`Sync`). Then Tier 2 (smart pointers,
iterators, locks, futures). See [Rust](index.md) for the tier table.

## Ownership & Borrowing (Q1–Q17)

| # | Question | Answered in |
|---|---|---|
| 1 | What is ownership in Rust? | [Ownership & Borrowing](ownership-borrowing.md) |
| 2 | What are the three ownership rules? | [Ownership & Borrowing](ownership-borrowing.md) |
| 3 | Why does Rust need ownership? | [Ownership & Borrowing](ownership-borrowing.md) |
| 4 | How does Rust provide memory safety without a garbage collector? | [Ownership & Borrowing](ownership-borrowing.md) |
| 5 | What happens when you assign one `String` to another variable? | [Ownership & Borrowing](ownership-borrowing.md) |
| 6 | What is a move? | [Ownership & Borrowing](ownership-borrowing.md) |
| 7 | What is borrowing? | [Ownership & Borrowing](ownership-borrowing.md) |
| 8 | What is the difference between `&T` and `&mut T`? | [Ownership & Borrowing](ownership-borrowing.md) |
| 9 | Why can Rust have multiple immutable references but only one mutable reference at a time? | [Ownership & Borrowing](ownership-borrowing.md) |
| 10 | Why can't mutable and immutable references coexist in certain situations? | [Ownership & Borrowing](ownership-borrowing.md) |
| 11 | What is the borrow checker? | [Ownership & Borrowing](ownership-borrowing.md) |
| 12 | What is a dangling reference, and how does Rust prevent it? | [Ownership & Borrowing](ownership-borrowing.md) |
| 13 | What happens when a value goes out of scope? | [Ownership & Borrowing](ownership-borrowing.md) |
| 14 | What is the `Drop` trait? | [Ownership & Borrowing](ownership-borrowing.md) |
| 15 | What is the difference between `Copy` and `Clone`? | [Ownership & Borrowing](ownership-borrowing.md) |
| 16 | Why does `i32` implement `Copy` but `String` does not? | [Ownership & Borrowing](ownership-borrowing.md) |
| 17 | What is shadowing, and how is it different from `mut`? | [Ownership & Borrowing](ownership-borrowing.md) |

## Lifetimes (Q18–Q25)

| # | Question | Answered in |
|---|---|---|
| 18 | What is a lifetime? | [Lifetimes](lifetimes.md) |
| 19 | Why does Rust need lifetimes? | [Lifetimes](lifetimes.md) |
| 20 | What does `'a` mean? | [Lifetimes](lifetimes.md) |
| 21 | When do you need explicit lifetime annotations? | [Lifetimes](lifetimes.md) |
| 22 | What are lifetime elision rules? | [Lifetimes](lifetimes.md) |
| 23 | What does `'static` mean? | [Lifetimes](lifetimes.md) |
| 24 | Why can't a function return a reference to a local variable? | [Lifetimes](lifetimes.md) |
| 25 | How do you store a reference inside a struct? | [Lifetimes](lifetimes.md) |

## String / Collections (Q26–Q31)

| # | Question | Answered in |
|---|---|---|
| 26 | What is the difference between `String` and `&str`? | [Strings & Collections](strings-collections.md) |
| 27 | Why can't you index a Rust `String` using `string[0]`? | [Strings & Collections](strings-collections.md) |
| 28 | What is the difference between `Vec<T>` and `&[T]`? | [Strings & Collections](strings-collections.md) |
| 29 | What are length and capacity in `Vec<T>`? | [Strings & Collections](strings-collections.md) |
| 30 | What happens when a `Vec` exceeds its capacity? | [Strings & Collections](strings-collections.md) |
| 31 | What is the difference between `HashMap` and `BTreeMap`? | [Strings & Collections](strings-collections.md) |

## Option / Result / Pattern Matching (Q32–Q41)

| # | Question | Answered in |
|---|---|---|
| 32 | Why doesn't Rust have `null`? | [Option / Result](option-result-matching.md) |
| 33 | What is `Option<T>`? | [Option / Result](option-result-matching.md) |
| 34 | What is `Result<T, E>`? | [Option / Result](option-result-matching.md) |
| 35 | What is the difference between `Option` and `Result`? | [Option / Result](option-result-matching.md) |
| 36 | What does the `?` operator do? | [Option / Result](option-result-matching.md) |
| 37 | `unwrap()` vs `expect()` vs `?`? | [Option / Result](option-result-matching.md) |
| 38 | When should `panic!` be used? | [Option / Result](option-result-matching.md) |
| 39 | What is pattern matching? | [Option / Result](option-result-matching.md) |
| 40 | Why must `match` be exhaustive? | [Option / Result](option-result-matching.md) |
| 41 | `match` vs `if let`? | [Option / Result](option-result-matching.md) |

## Struct / Enum / Traits (Q42–Q55)

| # | Question | Answered in |
|---|---|---|
| 42 | What is the difference between a struct and an enum? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 43 | What is an `impl` block? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 44 | What is the difference between a method and an associated function? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 45 | What is a trait? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 46 | How are Rust traits different from interfaces? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 47 | What are trait bounds? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 48 | What does `where` do? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 49 | What is `impl Trait`? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 50 | What is `dyn Trait`? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 51 | What is the difference between `impl Trait` and `dyn Trait`? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 52 | What is static dispatch? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 53 | What is dynamic dispatch? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 54 | What is monomorphization? | [Structs, Enums & Traits](structs-enums-traits.md) |
| 55 | What is the orphan rule? | [Structs, Enums & Traits](structs-enums-traits.md) |

## Smart Pointers (Q56–Q63)

| # | Question | Answered in |
|---|---|---|
| 56 | What is `Box<T>` and when would you use it? | [Smart Pointers](smart-pointers.md) |
| 57 | What is `Rc<T>`? | [Smart Pointers](smart-pointers.md) |
| 58 | What is `Arc<T>`? | [Smart Pointers](smart-pointers.md) |
| 59 | What is the difference between `Rc` and `Arc`? | [Smart Pointers](smart-pointers.md) |
| 60 | What is `RefCell<T>`? | [Smart Pointers](smart-pointers.md) |
| 61 | What is interior mutability? | [Smart Pointers](smart-pointers.md) |
| 62 | What is `Weak<T>`? | [Smart Pointers](smart-pointers.md) |
| 63 | Why can `Rc` create memory leaks through reference cycles? | [Smart Pointers](smart-pointers.md) |

## Iterators / Closures (Q64–Q72)

| # | Question | Answered in |
|---|---|---|
| 64 | What is an iterator? | [Iterators & Closures](iterators-closures.md) |
| 65 | Difference between `iter()`, `iter_mut()`, and `into_iter()`? | [Iterators & Closures](iterators-closures.md) |
| 66 | What does `map()` do? | [Iterators & Closures](iterators-closures.md) |
| 67 | What does `filter()` do? | [Iterators & Closures](iterators-closures.md) |
| 68 | What does `collect()` do? | [Iterators & Closures](iterators-closures.md) |
| 69 | Why are Rust iterators called zero-cost abstractions? | [Iterators & Closures](iterators-closures.md) |
| 70 | What is a closure? | [Iterators & Closures](iterators-closures.md) |
| 71 | What are `Fn`, `FnMut`, and `FnOnce`? | [Iterators & Closures](iterators-closures.md) |
| 72 | What does `move` do with a closure? | [Iterators & Closures](iterators-closures.md) |

## Concurrency (Q73–Q85)

| # | Question | Answered in |
|---|---|---|
| 73 | What does fearless concurrency mean? | [Concurrency](concurrency.md) |
| 74 | What is `Send`? | [Concurrency](concurrency.md) |
| 75 | What is `Sync`? | [Concurrency](concurrency.md) |
| 76 | What is the difference between `Send` and `Sync`? | [Concurrency](concurrency.md) |
| 77 | Why isn't `Rc<T>` thread-safe? | [Concurrency](concurrency.md) |
| 78 | Why is `Arc<T>` thread-safe? | [Concurrency](concurrency.md) |
| 79 | What is `Mutex<T>`? | [Concurrency](concurrency.md) |
| 80 | Why is `Arc<Mutex<T>>` commonly used? | [Concurrency](concurrency.md) |
| 81 | What is `RwLock<T>`? | [Concurrency](concurrency.md) |
| 82 | `Mutex` vs `RwLock`? | [Concurrency](concurrency.md) |
| 83 | What are channels? | [Concurrency](concurrency.md) |
| 84 | Can safe Rust have a deadlock? | [Concurrency](concurrency.md) |
| 85 | Can safe Rust have a data race? | [Concurrency](concurrency.md) |

## Async Rust / Tokio (Q86–Q100)

| # | Question | Answered in |
|---|---|---|
| 86 | What is `async/await` in Rust? | [Async Rust / Tokio](async-tokio.md) |
| 87 | What is a `Future`? | [Async Rust / Tokio](async-tokio.md) |
| 88 | Why are Rust futures lazy? | [Async Rust / Tokio](async-tokio.md) |
| 89 | What happens when `.await` is called? | [Async Rust / Tokio](async-tokio.md) |
| 90 | What is Tokio? | [Async Rust / Tokio](async-tokio.md) |
| 91 | What is an async runtime? | [Async Rust / Tokio](async-tokio.md) |
| 92 | What is an executor? | [Async Rust / Tokio](async-tokio.md) |
| 93 | What does `tokio::spawn` do? | [Async Rust / Tokio](async-tokio.md) |
| 94 | Why does `tokio::spawn` often require `Send + 'static`? | [Async Rust / Tokio](async-tokio.md) |
| 95 | What is `spawn_blocking`? | [Async Rust / Tokio](async-tokio.md) |
| 96 | Why should blocking work not be performed directly inside async code? | [Async Rust / Tokio](async-tokio.md) |
| 97 | What is the difference between `std::sync::Mutex` and `tokio::sync::Mutex`? | [Async Rust / Tokio](async-tokio.md) |
| 98 | Why is holding a mutex guard across `.await` dangerous? | [Async Rust / Tokio](async-tokio.md) |
| 99 | What is `tokio::select!`? | [Async Rust / Tokio](async-tokio.md) |
| 100 | What is `tokio::join!`? | [Async Rust / Tokio](async-tokio.md) |
| 199 | What are `Pin` and `Unpin`? | [Async Rust / Tokio](async-tokio.md) |
| 200 | Why does async Rust need `Pin`? | [Async Rust / Tokio](async-tokio.md) |
| 201 | What are `Poll::Ready` and `Poll::Pending`? | [Async Rust / Tokio](async-tokio.md) |
| 202 | What is a `Waker`? | [Async Rust / Tokio](async-tokio.md) |
| 203 | How does an `async fn` become a state machine? | [Async Rust / Tokio](async-tokio.md) |
| 204 | What is cancellation safety? | [Async Rust / Tokio](async-tokio.md) |

## Generics & Associated Types (Q151–Q160)

| # | Question | Answered in |
|---|---|---|
| 151 | What are generics in Rust? | [Generics & Associated Types](generics-associated-types.md) |
| 152 | How do generic functions and structs work? | [Generics & Associated Types](generics-associated-types.md) |
| 153 | What is monomorphization? | [Generics & Associated Types](generics-associated-types.md) |
| 154 | What are associated types? | [Generics & Associated Types](generics-associated-types.md) |
| 155 | Associated types vs generic type parameters? | [Generics & Associated Types](generics-associated-types.md) |
| 156 | What is the `Default` trait? | [Generics & Associated Types](generics-associated-types.md) |
| 157 | What are `From`, `Into`, `TryFrom`, and `TryInto`? | [Generics & Associated Types](generics-associated-types.md) |
| 158 | What does `T: Trait` mean? | [Generics & Associated Types](generics-associated-types.md) |
| 159 | What does `T: Trait + Send + Sync` mean? | [Generics & Associated Types](generics-associated-types.md) |
| 160 | What does `?Sized` mean? | [Generics & Associated Types](generics-associated-types.md) |

## Modules & Cargo (Q161–Q171)

| # | Question | Answered in |
|---|---|---|
| 161 | Package vs crate vs module? | [Modules & Cargo](modules-cargo.md) |
| 162 | Binary crate vs library crate? | [Modules & Cargo](modules-cargo.md) |
| 163 | What are `mod`, `use`, and `pub`? | [Modules & Cargo](modules-cargo.md) |
| 164 | What are `crate`, `self`, and `super`? | [Modules & Cargo](modules-cargo.md) |
| 165 | What does `pub(crate)` mean? | [Modules & Cargo](modules-cargo.md) |
| 166 | What is `Cargo.toml`? | [Modules & Cargo](modules-cargo.md) |
| 167 | What is `Cargo.lock`? | [Modules & Cargo](modules-cargo.md) |
| 168 | What is a Cargo workspace? | [Modules & Cargo](modules-cargo.md) |
| 169 | What are Cargo features? | [Modules & Cargo](modules-cargo.md) |
| 170 | `cargo check` vs `cargo build`? | [Modules & Cargo](modules-cargo.md) |
| 171 | What are `cargo fmt` and `cargo clippy`? | [Modules & Cargo](modules-cargo.md) |

## Unsafe Rust & Memory (Q172–Q181)

| # | Question | Answered in |
|---|---|---|
| 172 | What is `unsafe` Rust? | [Unsafe Rust & Memory](unsafe-memory.md) |
| 173 | Why does Rust need `unsafe`? | [Unsafe Rust & Memory](unsafe-memory.md) |
| 174 | What operations require an unsafe context? | [Unsafe Rust & Memory](unsafe-memory.md) |
| 175 | What is a raw pointer? | [Unsafe Rust & Memory](unsafe-memory.md) |
| 176 | `*const T` vs `*mut T`? | [Unsafe Rust & Memory](unsafe-memory.md) |
| 177 | What is undefined behavior? | [Unsafe Rust & Memory](unsafe-memory.md) |
| 178 | Does `unsafe` disable the borrow checker? | [Unsafe Rust & Memory](unsafe-memory.md) |
| 179 | Can safe Rust leak memory? | [Unsafe Rust & Memory](unsafe-memory.md) |
| 180 | What is FFI? | [Unsafe Rust & Memory](unsafe-memory.md) |
| 181 | What is `extern "C"`? | [Unsafe Rust & Memory](unsafe-memory.md) |

## Macros (Q182–Q188)

| # | Question | Answered in |
|---|---|---|
| 182 | What is a Rust macro? | [Macros](macros.md) |
| 183 | Macro vs function? | [Macros](macros.md) |
| 184 | What is `macro_rules!`? | [Macros](macros.md) |
| 185 | Why do macros use `!`? | [Macros](macros.md) |
| 186 | What is `#[derive(...)]`? | [Macros](macros.md) |
| 187 | Declarative vs procedural macros? | [Macros](macros.md) |
| 188 | What are derive, attribute, and function-like procedural macros? | [Macros](macros.md) |

## Testing & Tooling (Q189–Q198)

| # | Question | Answered in |
|---|---|---|
| 189 | How are unit tests written in Rust? | [Testing & Tooling](testing-tooling.md) |
| 190 | Unit tests vs integration tests? | [Testing & Tooling](testing-tooling.md) |
| 191 | What does `#[cfg(test)]` do? | [Testing & Tooling](testing-tooling.md) |
| 192 | What does `#[test]` do? | [Testing & Tooling](testing-tooling.md) |
| 193 | How do you test `Result`-returning code? | [Testing & Tooling](testing-tooling.md) |
| 194 | What does `cargo test` do? | [Testing & Tooling](testing-tooling.md) |
| 195 | What is Clippy? | [Testing & Tooling](testing-tooling.md) |
| 196 | What is rustfmt? | [Testing & Tooling](testing-tooling.md) |
| 197 | What is Miri? | [Testing & Tooling](testing-tooling.md) |
| 198 | What is benchmarking in Rust? | [Testing & Tooling](testing-tooling.md) |

## Code Reasoning (Q101–Q120)

| # | Question | Answered in |
|---|---|---|
| 101–116 | Does-this-compile snippets (moves, borrows, lifetimes, `Send`) | [Code Reasoning](code-reasoning.md) |
| 117 | Find the ownership/borrowing problem and fix it without blind `.clone()` | [Code Reasoning](code-reasoning.md) |
| 118 | Convert unnecessary clones into borrowing-based code | [Code Reasoning](code-reasoning.md) |
| 119 | Convert `String` → `&str` where ownership isn't required | [Code Reasoning](code-reasoning.md) |
| 120 | Trace which variable owns each value after every line | [Code Reasoning](code-reasoning.md) |

## Coding (Q121–Q150)

| # | Task | Answered in |
|---|---|---|
| 121–127 | Struct, enum, trait, generics, `&str`, lifetimes, borrowed struct | [Coding Practice](coding-practice.md) |
| 128–133 | `HashMap` frequencies, dedup, grouping, iterators, `map`/`filter`/`collect`, no-clone transforms | [Coding Practice](coding-practice.md) |
| 134–136 | `Result` parsing, custom errors, `?` file reads | [Coding Practice](coding-practice.md) |
| 137–140 | Generic stack, `Box` list, `Rc`, `Rc<RefCell<T>>` | [Coding Practice](coding-practice.md) |
| 141–144 | `Arc<Mutex<T>>`, threads, channels, producer-consumer | [Coding Practice](coding-practice.md) |
| 145–150 | Async fns, Tokio tasks, `join!`, `select!`, timeouts, `spawn_blocking` | [Coding Practice](coding-practice.md) |
