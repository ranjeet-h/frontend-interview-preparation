# Lifetimes

## 1. Why This Exists — The Problem First

References do not own data, so the compiler must prove they never outlive the
data they point to. Without that proof, returning a reference to a local
variable or storing a short-lived borrow in a long-lived struct would create
dangling pointers — the exact bug ownership was built to eliminate.

Lifetimes are the compiler's proof language for "this reference is valid for
this region of code." Most are inferred; annotations are required only when a
signature is ambiguous about which input lifetime an output is tied to.

## 2. The Analogy — Make It Obvious

A lifetime is a library loan period stamped on every borrow. The book (owned
data) must stay on the shelf at least as long as any loan slip says someone is
still reading it. `'a` is just a name for "some loan period the caller picks."
Elision rules are the librarian filling in obvious dates so you do not have to.
`'static` means "the book is in the permanent collection — it never leaves."

## 3. How It Actually Works — The Full Explanation

Every reference has a lifetime: the region during which it is valid. The borrow
checker requires the referent to outlive every borrow of it. Generic lifetime
parameters (`<'a>`) relate inputs to outputs without naming concrete scopes.

Elision (three rules) lets most functions omit annotations:

1. Each elided input reference gets its own lifetime.
2. If there is exactly one input lifetime, it is assigned to all elided outputs.
3. If there are multiple inputs but one is `&self`/`&mut self`, the `self`
   lifetime is assigned to all elided outputs.

`'static` means "valid for the entire program" (string literals, leaked boxes).
A `T: 'static` bound often means "owns its data" (no short-lived borrows), not
"lives forever."

## 4. Real Code — See It Working

```rust
// Explicit: output lives as long as the shorter of the two inputs.
// Without annotations this does NOT compile (E0106).
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

// Elided: one input lifetime -> output gets it automatically.
fn first_word(s: &str) -> &str {
    s.split_whitespace().next().unwrap_or("")
}

// Struct holding a borrow must declare the lifetime.
struct Excerpt<'a> {
    text: &'a str,
}

fn main() {
    let book = String::from("rust book");
    let e = Excerpt { text: &book };
    println!("{}", longest(&book, "go"));
    println!("{}", first_word(&book));
    println!("{}", e.text);
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q18: What is a lifetime?**

The compile-time region during which a reference is guaranteed valid. The
borrow checker ensures every reference is used only inside its lifetime and
that its referent outlives it. Lifetimes are erased at runtime; they cost
nothing in the binary.

**Q19: Why does Rust need lifetimes?**

To prevent dangling references statically. Because references are non-owning,
the compiler needs a way to prove "this borrow cannot outlive its owner,"
especially across function calls and inside structs. Lifetimes are that proof.

**Q20: What does `'a` mean?**

A generic lifetime parameter — "some lifetime chosen by the caller." In
`fn f<'a>(x: &'a str) -> &'a str`, `'a` ties the output's validity to the
input's validity without naming a concrete scope. Different call sites
instantiate `'a` differently.

**Q21: When do you need explicit lifetime annotations?**

When the compiler cannot infer which input lifetime an output (or stored
reference) is tied to: functions taking two or more references and returning
one (`longest`), structs/enums holding references, and some `impl` blocks.
One-input-in/one-output-out functions almost never need them (elision).

**Q22: What are lifetime elision rules?**

The three rules in section 3 above. Practical effect: `fn f(s: &str) -> &str`
means `fn f<'a>(s: &'a str) -> &'a str`; methods `fn get(&self) -> &str` tie the
output to `&self`. Anything ambiguous (two inputs, one output) must be written
out.

**Q23: What does `'static` mean?**

"Valid for the whole program run." String literals (`&'static str`) and leaked
allocations qualify. As a trait bound (`T: 'static`), it means "contains no
short-lived borrows" — an owned `String` qualifies even though it will be
dropped. It does not mean "never freed" in the bound sense.

**Q24: Why can't a function return a reference to a local variable?**

The local is dropped at function exit, so any reference to it would dangle.
The compiler rejects it (E0515). Fix by returning an owned value (`String`
instead of `&str`), returning a reference to an *input* (tied via lifetimes),
or returning `'static` data.

```rust
// fn get_string() -> &String { let s = String::from("hi"); &s } // ERROR
fn get_string() -> String { String::from("hi") } // OK: ownership moves out
```

**Q25: How do you store a reference inside a struct?**

Declare the lifetime on the struct and on the field, and propagate it through
`impl`:

```rust
struct Holder<'a> {
    name: &'a str,
}
impl<'a> Holder<'a> {
    fn name(&self) -> &'a str { self.name }
}
```

The struct instance can never outlive the data it borrows. If that is too
restrictive, store an owned `String` instead.

## 6. The Traps — What Goes Wrong in Production

The classic trap is "lifetime tetris": adding `'a` everywhere until it compiles
without understanding which borrow is too short. Read the error's "requires
that X outlives Y" note — usually a local is returned by reference or a
temporary is borrowed. Return ownership instead.

The second trap is overusing `'static`. Forcing data to be `'static` (via
`Box::leak` or global state) to silence the checker leaks memory or
introduces hidden sharing. Prefer owned values or correctly scoped borrows.

## 7. Compare With Related Concepts

Lifetimes vs scopes: a scope is where an owner lives; a lifetime is the proven
valid region of a *borrow*. The borrow's lifetime must be contained in the
owner's scope.

Elision vs explicit: elision is shorthand the compiler expands; explicit
annotations are required only when expansion is ambiguous. They mean the same
thing once expanded.

`'static` data vs `T: 'static` bound: the former is a concrete eternal
reference; the latter is a constraint that a type owns all its data.

## 8. 🧠 The Memory Hook

Lifetimes stamp every borrow with "valid until." If the data leaves before the
stamp expires, the program does not compile.
