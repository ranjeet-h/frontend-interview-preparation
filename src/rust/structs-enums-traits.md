# Structs, Enums & Traits

## 1. Why This Exists — The Problem First

Structs model "this AND that" (a `User` has an id AND a name); enums model
"this OR that" (a `Response` is success OR failure). Traits define shared
behavior without inheritance, and generics plus trait bounds let one function
serve many types with zero runtime cost via monomorphization.

## 2. The Analogy — Make It Obvious

A struct is a form with fixed fields. An enum is a multiple-choice answer where
exactly one option (with its attached data) is selected. An `impl` block is the
instruction manual for one specific form. A trait is a job description ("must be
able to `summarize()`"); any struct or enum can apply by implementing it.
`impl Trait` is "hire any one qualified candidate, decided at compile time";
`dyn Trait` is "accept any qualified temp worker through an agency at runtime
(with a dispatch fee)." The orphan rule says you cannot rewrite someone else's
job description for someone else's employee — you must own at least one side.

## 3. How It Actually Works — The Full Explanation

Methods take `self`/`&self`/`&mut self`; associated functions (e.g. `new()`)
do not take `self` and are called as `Type::f()`. Trait bounds (`T: Clone`,
`where T: Display`) constrain generics. `impl Trait` in argument/return
position is static dispatch (one concrete type, monomorphized). `dyn Trait` is
dynamic dispatch through a vtable behind a pointer (`&dyn`, `Box<dyn>`).
Monomorphization emits a specialized copy of each generic per concrete type:
fast, but larger binaries. The orphan rule (`impl ForeignTrait for ForeignType`
is forbidden) preserves coherence so method resolution is unambiguous.

## 4. Real Code — See It Working

```rust
struct User {
    id: u64,
    name: String,
}

impl User {
    fn new(id: u64, name: &str) -> Self { // associated function
        Self { id, name: name.to_owned() }
    }
    fn greet(&self) -> String { // method
        format!("hi, {}", self.name)
    }
}

enum Shape {
    Circle(f64),
    Rect { w: f64, h: f64 },
}

trait Area {
    fn area(&self) -> f64;
}

impl Area for Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle(r) => std::f64::consts::PI * r * r,
            Shape::Rect { w, h } => w * h,
        }
    }
}

// Static dispatch: one concrete type per call site, inlined.
fn print_area_static(item: &impl Area) {
    println!("{}", item.area());
}

// Dynamic dispatch: heterogeneous collection, vtable lookup.
fn print_area_dyn(items: &[Box<dyn Area>]) {
    for item in items {
        println!("{}", item.area());
    }
}

fn largest<T: PartialOrd>(a: T, b: T) -> T {
    if a >= b { a } else { b }
}

fn main() {
    let u = User::new(1, "asha");
    println!("{}", u.greet());
    print_area_static(&Shape::Circle(2.0));
    print_area_dyn(&[Box::new(Shape::Circle(2.0)), Box::new(Shape::Rect { w: 2.0, h: 3.0 })]);
    println!("{}", largest(3, 7));
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q42: What is the difference between a struct and an enum?**

Structs combine fields (product type: all fields present). Enums offer mutually
exclusive variants each with optional data (sum type: exactly one variant
present). Structs model records; enums model state machines, messages, and
`Option`/`Result` themselves.

**Q43: What is an `impl` block?**

Where you define methods and associated functions for a type, and where you
write `impl Trait for Type`. Inherent `impl` adds type-specific behavior;
trait `impl` fulfills a contract. Only one inherent `impl` per type per crate
can define a given method name.

**Q44: What is the difference between a method and an associated function?**

Methods take a receiver (`self`, `&self`, `&mut self`) and operate on an
instance (`user.greet()`). Associated functions do not (`User::new(..)`,
`String::from(..)`); they are constructors, converters, or utilities in the
type's namespace.

**Q45: What is a trait?**

A set of required/provided method signatures (plus associated types/consts)
that types can implement. Traits enable shared behavior, generic bounds,
operator overloading (`Add`, `Drop`), and markers (`Send`, `Sync`, `Copy`).

**Q46: How are Rust traits different from interfaces?**

Traits support default method bodies, associated types/consts, blanket impls
(`impl<T: Display> ToString for T`), and zero-cost generics without
inheritance or virtual-by-default methods. No class hierarchy, no constructor
contracts, no null. `dyn Trait` is the closest to a classic interface object.

**Q47: What are trait bounds?**

Constraints on generics: `fn f<T: Clone + Debug>(x: T)`. They guarantee the
generic body can only use behavior the bound provides, and let callers know
what a type must offer. Multiple bounds use `+`; complex ones go in `where`.

**Q48: What does `where` do?**

Moves long or complex bounds out of the angle brackets for readability:
`fn f<T, U>(t: T, u: U) where T: Display, U: Clone`. Required for
higher-ranked or multi-clause constraints and preferred for any bound list
longer than one or two items.

**Q49: What is `impl Trait`?**

"Some one concrete type implementing this trait, chosen at compile time."
In argument position it is sugar for a generic (`fn f(x: impl Display)`). In
return position it hides the concrete type while keeping static dispatch
(`fn f() -> impl Iterator<Item=i32>`). One function, one hidden type.

**Q50: What is `dyn Trait`?**

A trait object: a fat pointer (data + vtable) enabling runtime polymorphism.
Written `&dyn Display`, `Box<dyn Error>`. Allows heterogeneous collections and
runtime-selected behavior at the cost of indirection and no inlining.

**Q51: What is the difference between `impl Trait` and `dyn Trait`?**

`impl Trait`: static dispatch, monomorphized, fast, one concrete type per
function (or per call site in argument position), can return without boxing.
`dyn Trait`: dynamic dispatch, vtable, supports mixing types at runtime,
requires a pointer, small runtime cost, object-safety restrictions apply.

**Q52: What is static dispatch?**

Resolving the callee at compile time (generics, `impl Trait`). Enables
inlining and zero-cost abstraction. Binary grows per instantiation.

**Q53: What is dynamic dispatch?**

Resolving the callee at runtime through a vtable (`dyn Trait`). Flexible
(plugins, heterogeneous lists) but indirect and opaque to the optimizer.

**Q54: What is monomorphization?**

The compiler emitting a specialized copy of each generic function/type per
concrete type argument. `largest::<i32>` and `largest::<f64>` become separate
machine-code functions. Zero runtime cost, larger binaries, longer builds.

**Q55: What is the orphan rule?**

You may implement a trait only if your crate owns the trait or the type:
`impl MyTrait for Vec<T>` (own trait) and `impl Display for MyType` (own type)
are legal; `impl Display for Vec<T>` is not. It guarantees coherence — no two
crates can provide conflicting impls for the same pair.

## 6. The Traps — What Goes Wrong in Production

Returning `impl Trait` from branches yielding different concrete types fails
(one hidden type only). Return `Box<dyn Trait>` instead.

Forgetting object safety (`fn clone(&self) -> Self`, generic methods) makes a
trait unusable as `dyn`. Split the trait or stay with generics.

Deep `dyn` in hot loops costs vtable indirection per call; prefer generics on
the hot path and `dyn` at boundaries.

## 7. Compare With Related Concepts

Struct vs enum vs trait: data shape vs data choice vs shared behavior.

`impl Trait` vs generics vs `dyn Trait`: sugar vs explicit static vs runtime
dynamic. Same performance class for the first two; different trade-off for the
third.

Monomorphization (Rust/C++) vs erasure (Java) vs boxing (Go `any`): Rust pays
in binary size for speed; others pay in runtime checks or boxing.

## 8. 🧠 The Memory Hook

Structs hold AND, enums pick OR, traits promise CAN, `impl` is fixed at compile
time while `dyn` is chosen at runtime — and you can only implement what you own.
