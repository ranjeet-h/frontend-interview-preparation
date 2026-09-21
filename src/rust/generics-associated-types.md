# Generics & Associated Types

## 1. Why This Exists — The Problem First

Without generics every container and helper would be rewritten per type
(`VecI32`, `VecString`) or fall back to runtime boxing and casts. Generics let
one definition serve many types with full static checking and zero runtime
cost. Associated types complete the picture: a trait like `Iterator` must name
*one* item type per implementation, not let the caller pick a different one at
every call site.

## 2. The Analogy — Make It Obvious

A generic is a recipe template with blanks ("cake with ___"): the compiler
prints a dedicated recipe card per filling (monomorphization). A generic type
parameter is a blank the *caller* fills in each time (`Vec<T>` holds anything).
An associated type is a blank the *recipe author* fixes once per version
(`Iterator::Item = u8` for that iterator, always). `Default` is the standard
"plain" version. `From`/`Into` are certified adapters between types. `?Sized`
is permission to serve an unsliced cake (unsized data like `str` or `dyn Trait`)
instead of requiring a boxed slice.

## 3. How It Actually Works — The Full Explanation

Generic functions, structs, and enums take type (and lifetime/const) parameters
and are monomorphized: the compiler emits one specialized copy per concrete
type used. Trait bounds (`T: Trait`, `T: Trait + Send + Sync`, `where` clauses)
constrain what the body may assume. Associated types (`type Item;`) are chosen
by the *implementor*; generic trait parameters (`trait From<T>`) are chosen by
the *caller*. `Default::default()` gives a canonical empty value. `From<T>`
plus the blanket `impl<U, T: From<U>> Into<T> for U` give infallible
conversions (`.into()`); `TryFrom`/`TryInto` add an `Error` for fallible ones.
Every generic parameter is `Sized` by default; `?Sized` relaxes that for
slices, `str`, and trait objects, which must then sit behind a pointer.

## 4. Real Code — See It Working

```rust
use std::convert::TryInto;

// Generic struct + function with bounds
struct Pair<T> {
    a: T,
    b: T,
}

fn swap<T>(mut p: Pair<T>) -> Pair<T> {
    std::mem::swap(&mut p.a, &mut p.b);
    p
}

// Associated type: one Item per implementor
trait Parse {
    type Output;
    fn parse(s: &str) -> Result<Self::Output, String>;
}

struct AsInt;
impl Parse for AsInt {
    type Output = i32;
    fn parse(s: &str) -> Result<i32, String> {
        s.trim().parse::<i32>().map_err(|e| e.to_string())
    }
}

// From / Into / TryFrom
fn demo_conversions() {
    let s: String = "hi".into(); // &str -> String via From
    let n: i32 = "42".parse().unwrap();
    let small: Result<u8, _> = 300i32.try_into(); // fallible: Err
    println!("{s} {n} {small:?}");
}

// ?Sized: accept sized AND unsized (behind a reference)
fn print_debug<T: std::fmt::Debug + ?Sized>(v: &T) {
    println!("{v:?}");
}

fn main() {
    let p = Pair { a: 1, b: 2 };
    println!("{} {}", swap(p).a, swap(p).b);
    println!("{:?}", AsInt::parse("7"));
    demo_conversions();
    print_debug("sized str");
    print_debug("unsized str" as &str);
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q151: What are generics in Rust?**

Type (lifetime, const) parameters that let functions, structs, enums, and
traits work over many types while staying statically checked. No runtime
polymorphism involved: each use is specialized at compile time.

**Q152: How do generic functions and structs work?**

You declare parameters once (`fn f<T>(x: T)`, `struct S<T> { v: T }`) and the
compiler type-checks the body against the declared bounds, then emits a
concrete copy per instantiated type. Turbofish (`f::<u32>(..)`) or inference
picks the type at each call.

**Q153: What is monomorphization?**

The compiler pass that turns each generic into per-type machine code
(`largest::<i32>`, `largest::<f64>` are separate functions). Same concept as
Q54. Benefit: inlining and zero-cost dispatch. Cost: larger binaries and longer
builds. Contrast with Java type erasure (one bytecode copy + casts).

**Q154: What are associated types?**

Placeholder types a trait declares and each `impl` fixes exactly once:
`trait Iterator { type Item; fn next(&mut self) -> Option<Self::Item>; }`.
Callers write `I::Item` without adding a parameter. Associated consts and
functions follow the same idea.

**Q155: Associated types vs generic type parameters?**

Associated type: one choice per *implementation* (`impl Iterator for Lines`
fixes `Item = String` forever). Generic parameter: one choice per *use*
(`impl<T> From<T> for Vec<T>` works for any `T` the caller picks). Rule of
thumb: output fixed by the type → associated type; input varying per call →
generic parameter. `Iterator::Item` vs `From<T>` is the canonical pair.

**Q156: What is the `Default` trait?**

`fn default() -> Self`: the canonical "empty" value (`0`, `""`, `None`, empty
`Vec`). Derive with `#[derive(Default)]` when all fields are `Default`. Used by
`Option::unwrap_or_default()`, `#[derive(Default)]` structs with
`..Default::default()`, and generic code needing a starting value.

**Q157: What are `From`, `Into`, `TryFrom`, and `TryInto`?**

The standard conversion traits. `From<T> for U` defines infallible
`U::from(t)`; `Into<U> for T` is auto-provided by blanket impl (so write
`From`, get `Into` free; prefer `.into()` at call sites with inferred target).
`TryFrom`/`TryInto` add `type Error` for fallible conversions
(`u8::try_from(300i32)`). `?` and `.into()` compose: custom errors implement
`From<LowLevel>` so `?` converts automatically.

**Q158: What does `T: Trait` mean?**

A trait bound: generic `T` must implement `Trait` for this code to compile.
The body may only use methods from the bound (plus always-available
operations). It is a contract on the caller and a capability for the body.

**Q159: What does `T: Trait + Send + Sync` mean?**

Multiple bounds: `T` must implement all listed traits (here: domain behavior
`Trait` plus thread-transfer `Send` and thread-share `Sync`). Needed when a
generic value crosses threads (spawned tasks, shared state). Longer lists move
to `where T: Trait, T: Send, T: Sync`.

**Q160: What does `?Sized` mean?**

Relaxes the implicit `T: Sized` bound so `T` may be unsized (`str`, `[u8]`,
`dyn Trait`). Because unsized values have no compile-time size, they can only
be used behind a pointer (`&T`, `Box<T>`, `Rc<T>`). Example: `fn f<T: ?Sized>(x:
&T)` accepts both `String` internals and string slices uniformly.

## 6. The Traps — What Goes Wrong in Production

Writing `From` in both directions manually instead of once (the other comes
free via the blanket impl) causes conflicting-impl errors.

Using a generic parameter where an associated type belongs
(`trait Parse<T>` instead of `type Output`) forces callers to annotate
turbofish everywhere and allows one type to "parse to anything," which is
rarely intended.

Forgetting `?Sized` on generic helpers that should accept `str`/`dyn Trait`
behind references, then fighting "doesn't have a size known at compile-time."

## 7. Compare With Related Concepts

Generics (static, monomorphized) vs `dyn Trait` (dynamic, vtable): speed and
inlining vs flexibility and binary size.

Associated types (one per impl) vs generic params (one per use): `Iterator`
vs `From`; pick by who chooses.

`From`/`Into` (infallible) vs `TryFrom`/`TryInto` (fallible with `Error`) vs
`as` casts (lossy, no trait): prefer the traits; reserve `as` for numeric
casts you have audited.

## 8. 🧠 The Memory Hook

Generics stamp one copy per type, bounds list what the copy may assume,
associated types fix one answer per impl, `From` converts freely — and `?Sized`
lets the unsized sit behind a pointer.
