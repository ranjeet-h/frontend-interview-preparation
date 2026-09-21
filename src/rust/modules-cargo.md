# Modules & Cargo

## 1. Why This Exists — The Problem First

Real projects outgrow one file. Rust answers with three nested units —
packages (a Cargo project), crates (a compilation unit with a `main` or `lib`
root), and modules (namespaces inside a crate) — plus Cargo as the single
build, dependency, test, lint, and format tool. Interviews probe this because
`pub`, `mod`, `use`, and `Cargo.toml` decide what compiles, what is visible,
and what ships reproducibly.

## 2. The Analogy — Make It Obvious

A package is the restaurant building. A crate is a kitchen inside it (either
the dine-in kitchen producing meals = binary, or the commissary producing
ingredients for others = library). Modules are stations in the kitchen
(`grill`, `pastry`) with doors (`mod`), name tags (`use`), and locks (`pub`
vs private). `crate`/`self`/`super` are directions ("this building," "this
station," "the station above"). `pub(crate)` is a staff-only door: anyone in
the building, nobody outside. `Cargo.toml` is the menu and supplier list;
`Cargo.lock` is the exact delivery receipt; workspaces are a food hall sharing
one loading dock; features are optional menu sections; `check`/`build`/`fmt`/
`clippy` are taste-test, full service, plating standard, and health inspection.

## 3. How It Actually Works — The Full Explanation

A package holds one or more crates plus `Cargo.toml`. A binary crate has
`src/main.rs` (runnable); a library crate has `src/lib.rs` (importable); both
can coexist. `mod foo;` declares a submodule (in `foo.rs` or `foo/mod.rs`);
`pub mod` / `pub fn` / `pub struct` expose items (struct fields need their own
`pub`). `use crate::x::Y;` imports a path; `crate`, `self`, `super` anchor it.
`pub(crate)` visible in-crate only (also `pub(super)`, `pub(in path)`).
`Cargo.toml` declares metadata, dependencies, features, profiles; `Cargo.lock`
pins exact versions (commit it for binaries/apps, typically not for libraries).
Workspaces share one `target/` and lockfile across member packages. Features
gate optional code via `cfg(feature = "..")`. `cargo check` type-checks fast
(no codegen); `cargo build` produces binaries; `cargo fmt` normalizes style;
`cargo clippy` lints for bugs and idioms.

## 4. Real Code — See It Working

```text
my-app/
  Cargo.toml            # package manifest
  src/
    main.rs             # binary crate root
    lib.rs              # library crate root (optional, same package)
    auth/
      mod.rs            # `mod auth;` -> module tree
      login.rs
```

```rust
// src/main.rs
mod auth; // declares module (src/auth.rs or src/auth/mod.rs)
use crate::auth::login::validate; // absolute path from crate root
use self::auth::session::Session; // `self` = current module
// use super::helpers::retry;      // `super` = parent module (inside auth/*)

fn main() {
    println!("{}", validate("asha"));
    let _ = Session::new();
}

// src/auth/mod.rs
pub mod login;
pub mod session;
pub(crate) fn internal_reset() {} // staff-only: whole crate, not outside

// src/auth/login.rs
pub fn validate(name: &str) -> bool {
    !name.is_empty()
}
```

```toml
# Cargo.toml (essentials)
[package]
name = "my-app"
version = "0.1.0"
edition = "2021"

[features]
default = ["tls"]
tls = ["tokio/tls"]

[dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
```

## 5. The Interview Questions — All of Them, Done Properly

**Q161: Package vs crate vs module?**

Package: a Cargo project directory (manifest + source + tests). Crate: a
compilation unit — one `main.rs` (binary) or `lib.rs` (library) root with its
module tree; `rustc` compiles crates. Module: a namespace inside a crate
(`mod auth { ... }`) organizing code and controlling visibility. One package
can hold multiple crates (binary + library + examples).

**Q162: Binary crate vs library crate?**

Binary (`src/main.rs`, has `fn main`): builds an executable, cannot be imported
by other crates. Library (`src/lib.rs`): builds a reusable `rlib`, imported via
its crate name. Packages commonly ship both: thin binary calling into the
library so logic is testable.

**Q163: What are `mod`, `use`, and `pub`?**

`mod` declares a module (inline `mod x {}` or file `mod x;`). `use` brings a
path into scope (alias with `as`, glob with `*`). `pub` lifts the default
private visibility: `pub fn`, `pub struct` (fields still private unless marked),
`pub mod`. Privacy is per-module: children see ancestors' private items, not
vice versa.

**Q164: What are `crate`, `self`, and `super`?**

Path anchors: `crate::a::B` starts at the crate root (stable against moves);
`self::x` is the current module; `super::x` is the parent module (common for
sibling imports inside `auth/login.rs`: `use super::session::Session;`).
Prefer `crate::` in most application code for clarity.

**Q165: What does `pub(crate)` mean?**

Visible everywhere inside this crate, invisible to downstream crates. Ideal for
helpers shared across modules but not part of the public API. Siblings:
`pub(super)` (parent only), `pub(in crate::x)` (specific subtree), plain `pub`
(public API, semver-relevant).

**Q166: What is `Cargo.toml`?**

The package manifest: name/version/edition, dependencies (with versions and
features), dev-dependencies, features, profiles, workspace membership, and
target configs. It states *intent* ("serde ^1"); the lockfile records the
exact resolution.

**Q167: What is `Cargo.lock`?**

The pinned dependency graph (exact versions + checksums) produced by Cargo.
Guarantees reproducible builds. Commit it for binaries and applications;
libraries usually gitignore it so downstream resolvers stay flexible (the app's
lockfile wins).

**Q168: What is a Cargo workspace?**

Multiple related packages sharing one `Cargo.lock` and `target/` directory,
with a root manifest listing `members`. Used for monorepos (app + libs +
services). Enables joint `cargo build/test` and path dependencies between
members without version churn.

**Q169: What are Cargo features?**

Named optional capabilities (`default = ["tls"]`) toggling dependencies and
`#[cfg(feature = "tls")]` code paths. Consumers opt in via
`dep = { version = "1", features = ["tls"] }` or `--features`. Keep features
additive (enabling more must not break) to avoid dependency-hell surprises.

**Q170: `cargo check` vs `cargo build`?**

`check` runs name/borrow/type checking without codegen — much faster, ideal for
edit-compile feedback and CI lint gates. `build` also emits machine code
(debug or `--release` optimized). Workflow: `check` while iterating, `build`
(or `test`/`clippy`) before merging.

**Q171: What are `cargo fmt` and `cargo clippy`?**

`cargo fmt` (rustfmt) enforces canonical formatting — run it, don't debate it.
`cargo clippy` is the official linter with hundreds of correctness/perf/idiom
checks (`await_holding_lock`, `needless_clone`, `len_zero`). CI should gate on
`fmt --check` and `clippy -D warnings` for interview-grade code quality.

## 6. The Traps — What Goes Wrong in Production

Making everything `pub` "to get it compiling" leaks internals into semver and
prevents refactoring. Start private, widen to `pub(crate)`, then `pub` only at
a deliberate API boundary.

Circular `mod` imports and `use` cycles signal a layering bug — extract a
shared leaf module instead of `pub use` gymnastics.

Committing vs ignoring `Cargo.lock` backwards (locking libraries, floating
binaries) causes "works on my machine" deploys. Binaries commit; libraries
usually don't.

## 7. Compare With Related Concepts

Package vs crate vs module: project vs compilation unit vs namespace. npm's
package ≈ Cargo package; Node's file module ≈ Rust module; Go's package ≈ Rust
crate-plus-module hybrid.

`use` (import path) vs `mod` (declare module) vs `pub` (widen visibility):
three orthogonal axes beginners conflate into one.

`check` (fast verify) vs `build` (produce binary) vs `clippy` (lint) vs `fmt`
(format): speed vs artifact vs correctness vs style.

## 8. 🧠 The Memory Hook

Packages hold crates, crates compile, modules organize; `pub` opens doors,
`crate`/`self`/`super` give directions — and Cargo checks fast, builds once,
formats always, and lints before you ship.
