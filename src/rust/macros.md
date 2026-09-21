# Macros

## 1. Why This Exists — The Problem First

Functions run on values at runtime; sometimes you need code that writes code:
`vec![1, 2, 3]` taking any arity, `println!` with format checking, `#[derive
(Clone)]` generating trait impls. Macros operate at compile time on tokens or
syntax trees, eliminating boilerplate that generics alone cannot express.

## 2. The Analogy — Make It Obvious

A function is a vending machine (insert values, get a value). A macro is the
factory that builds custom vending machines from blueprints before the store
opens. `!` is the "factory order" suffix distinguishing blueprint requests from
snack purchases. `macro_rules!` is the in-house штамп press for simple
pattern-based machines. `#[derive]` is ordering a standard accessory pack from
a catalog (procedural factory) that bolts generated code onto your type.

## 3. How It Actually Works — The Full Explanation

`macro_rules!` (declarative, `macro_rules!` with matchers like `$( $x:expr ),*`)
expands by token-pattern matching at compile time (hygienic: names don't leak).
Procedural macros are compiler plugins over syntax: derive (`#[derive(Serialize)]`
generates `impl`), attribute (`#[tokio::main]`, `#[test]` transform the item),
and function-like (`vec!`-style bang macros taking token streams). Use macros
for variadics, DSLs, and codegen; prefer functions/generics/traits when values
suffice — macros expand opaquely, slowing builds and complicating errors.

## 4. Real Code — See It Working

```rust
// Declarative macro: minimal repeat-sum.
macro_rules! sum_all {
    ( $( $x:expr ),* ) => {
        {
            let mut total = 0;
            $( total += $x; )*
            total
        }
    };
}

// Derive (procedural, from std/serde): generates impls.
#[derive(Debug, Clone, PartialEq, Default)]
struct Point {
    x: i32,
    y: i32,
}

fn main() {
    println!("sum = {}", sum_all!(1, 2, 3)); // 6
    let p = Point { x: 1, ..Default::default() };
    println!("{p:?} cloned={:?}", p.clone());
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q182: What is a Rust macro?**

Compile-time code generation: input tokens/syntax in, expanded code out, before
type checking. Enables variadic arguments, DSLs, and derived impls impossible
for ordinary functions.

**Q183: Macro vs function?**

Functions take typed values at runtime, have one signature, and appear in
stack traces. Macros take tokens at compile time, can accept variable shapes
(`vec![..]` arities), generate items/statements, and expand invisibly (errors
point at expansion sites). Prefer functions unless you need syntax-level
flexibility.

**Q184: What is `macro_rules!`?**

The declarative macro system: pattern `=>` expansion rules matched against
tokens (`:expr`, `:ident`, `:ty`, `:block`, repetitions `$(..),*`). Hygienic
and crate-local by default (`#[macro_export]` to share). Best for small
wrappers and repetition; complex parsing belongs in procedural macros.

**Q185: Why do macros use `!`?**

To mark compile-time expansion syntactically (`vec!`, `println!`, `format!`).
The `!` tells readers and the compiler "this is not an ordinary call — it
rewrites code before checking." Function-like procedural macros also use `!`;
attribute/derive macros use `#[..]` instead.

**Q186: What is `#[derive(...)]`?**

An automatic `impl` generator for whitelisted traits (`Debug`, `Clone`,
`PartialEq`, `Default`, `Serialize` with serde). The compiler (or a derive
macro crate) writes the boilerplate `impl` for your struct/enum. Only works for
traits that explicitly support deriving.

**Q187: Declarative vs procedural macros?**

Declarative (`macro_rules!`): pattern-match tokens, simple, hygienic, limited
parsing. Procedural: arbitrary Rust code transforming `TokenStream`s via the
compiler API — full power, harder to write/debug, slower builds. Use
declarative until patterns genuinely fail.

**Q188: What are derive, attribute, and function-like procedural macros?**

Derive: `#[derive(X)]` on structs/enums, generates trait impls. Attribute:
`#[my_attr]` on any item, can rewrite it (`#[test]`, `#[tokio::main]`).
Function-like: `my_macro!(..)` call position, takes tokens and returns code.
All three ship from separate `proc-macro` crates.

## 6. The Traps — What Goes Wrong in Production

Reaching for macros when a generic function or trait default would do —
paying expansion opacity and build time for no reason.

Writing a clever `macro_rules!` that produces inscrutable errors five crates
away. Keep expansions small, parenthesize aggressively, and test expansions
with `cargo expand` during development.

Depending on heavyweight derive stacks in hot crates without measuring build
impact; gate exotic derives behind features.

## 7. Compare With Related Concepts

Macro (compile-time tokens) vs generic function (compile-time types, checked
body) vs `dyn` (runtime dispatch): earlier binding = faster + more rigid.

Declarative (patterns) vs procedural (programs): stamping vs machining.

`#[derive]` (additive impl) vs attribute macro (rewrite item) vs `!` macro
(expand call): three call sites, one engine family.

## 8. 🧠 The Memory Hook

Functions vend snacks, macros build the machines — `!` orders the factory,
`macro_rules!` stamps simple parts, `derive` bolts on standard accessories.
