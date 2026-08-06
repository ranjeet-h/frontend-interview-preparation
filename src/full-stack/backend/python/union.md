# Union

## Detailed explanation

`Union[A, B]` means a value may be one of multiple types. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Union models alternative allowed types.

## 2. Problem it solves

This concept helps Python backend code stay predictable under real service conditions: request handling, validation, database access, async work, tests, dependency management, and production debugging.

## 3. Core idea

- Understand the language behavior before applying a framework.
- Use explicit contracts where possible.
- Avoid hidden mutation and hidden dependencies.
- Choose concurrency tools based on I/O-bound vs CPU-bound work.
- Write code that is easy to test and debug.

## 4. Visual / analogy

```txt
Python concept -> service code behavior -> API reliability -> production debugging
```

## 5. Minimal example

```python
def example(value):
    return value
```

## 6. Real-world example

In a FastAPI or Django backend, union affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What is `Union[A, B]` in Python type hints?
- **The Engine Mechanism (Why it behaves this way):** `Union[A, B]` is a type hint meaning the value can be of type `A` or type `B` (or more: `Union[A, B, C]`). It's defined in the `typing` module. In Python 3.10+, the equivalent syntax is `A | B`. Type checkers use `Union` to narrow types: when you check `isinstance(x, str)`, the type checker narrows `Union[str, int]` to `str` in that branch. `Union` is the general case; `Optional[T]` is shorthand for `Union[T, None]`. `Union` does not affect runtime behavior — it's purely for static analysis.
- **The Unforgettable Mental Model:** The **Multi-Slot Mailbox**. A `Union` is like a mailbox that accepts letters of different sizes — small (str), medium (int), large (list). The mail carrier (type checker) verifies the letter fits one of the slots, but the mailbox itself doesn't care.
- **The Trap:** Using `Union` when a more specific type would work. `Union[str, int]` might indicate a design issue — should the function really accept both, or should there be two separate functions?
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `Union[A, B]` means a value can be type `A` or type `B`. In Python 3.10+, I use `A | B` syntax. Type checkers use `Union` for type narrowing — when I check `isinstance(x, str)`, the checker knows `x` is `str` in that branch. I use `Union` for functions that legitimately accept multiple types (like JSON values: `str | int | float | bool | None`), and `Optional` for nullable values. I'm careful not to overuse `Union` — if a function needs too many types, it might be doing too much."

#### Why does `Union` matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** Backend services handle heterogeneous data — JSON values can be strings, numbers, booleans, lists, objects, or null. API responses may return different types based on the request. Configuration values may be strings or parsed types. `Union` makes these heterogeneous contracts explicit. Without it, you'd use `Any` (no type safety) or the most general type (losing precision). FastAPI uses `Union` for request bodies that accept multiple formats. ORMs use `Union` for columns that store multiple types (rare but possible with JSON columns).
- **The Unforgettable Mental Model:** The **Swiss Army Knife**. A `Union` type is like a Swiss Army knife — it can be one of several tools. You need to check which tool you have before using it.
- **The Trap:** Using `Union` for every possible type instead of designing cleaner interfaces. `Union[A, B, C, D, E, F]` often indicates a design problem.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `Union` is essential for modeling heterogeneous data in backend services. JSON values are naturally union types — `str | int | float | bool | None`. API responses that return different shapes based on status codes benefit from `Union[SuccessResponse, ErrorResponse]`. Configuration values that can be strings or parsed types use `Union[str, int]`. I use `Union` when the heterogeneity is inherent to the domain, but I avoid it when it indicates poor design — if a function accepts six different types, it's probably doing too much."

#### What bug can happen if you misunderstand `Union`?
- **The Engine Mechanism (Why it behaves this way):** The type narrowing bug: `def process(x: Union[str, int]): if isinstance(x, str): ...; print(x.upper())` — the type checker narrows `x` to `str` in the `if` block, but outside the block, `x` is still `Union[str, int]`. The exhaustive check bug: `def handle(x: Union[A, B]): if isinstance(x, A): ...` — missing the `B` case. The type checker doesn't catch this unless you use a pattern like `assert_never(x)` from `typing_extensions`. The runtime type check bug: `isinstance(x, Union[str, int])` works in Python 3.10+ but not in older versions. The `Union` vs. `Any` confusion: `Union[A, B]` is checked (must be A or B), `Any` is unchecked (can be anything).
- **The Unforgettable Mental Model:** The **Unsorted Mail**. If you have a mailbox that accepts letters and packages, you need to sort them before processing. Treating a package like a letter (not checking the type) causes problems.
- **The Trap:** Not handling all cases of a `Union`. If `x: Union[A, B]`, you must handle both `A` and `B` — the type checker won't catch missing cases unless you use `assert_never`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common `Union` bug is not handling all cases. If `x: Union[A, B]`, I must handle both `A` and `B` — using `isinstance` checks or pattern matching (Python 3.10+). The type checker narrows types within `if` blocks but doesn't enforce exhaustive handling. For exhaustiveness, I use `assert_never(x)` from `typing_extensions` — if a new type is added to the `Union`, the type checker flags the missing case. I also avoid `Union` when `Any` would be equally meaningless — both indicate imprecise typing."

#### How does `Union` affect testing?
- **The Engine Mechanism (Why it behaves this way):** `Union` requires testing each type case. For `def process(x: Union[str, int])`, tests must cover: `x` is `str`, `x` is `int`, and the behavior for each. Type checkers catch tests that pass wrong types. `Union` also affects test data generation — hypothesis strategies need to cover all union members. Testing type narrowing requires verifying that each branch handles its type correctly.
- **The Unforgettable Mental Model:** The **Branch Coverage Map**. Each type in a `Union` is a branch in the code. Testing requires covering every branch — like a map where every road must be driven.
- **The Trap:** Only testing one type in the union. If `Union[str, int]`, testing only `str` misses half the behavior.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `Union` requires testing each type case. For `Union[str, int]`, I test both `str` input and `int` input, verifying the correct behavior for each. The type checker helps by flagging tests that pass wrong types. I also use hypothesis to generate test data covering all union members. The key principle: every type in the union is a code path that needs testing."

#### How does `Union` affect performance?
- **The Engine Mechanism (Why it behaves this way):** `Union` has zero runtime performance impact — it's a type hint. The `isinstance` checks used for type narrowing at runtime have a small cost (type checking), but this is negligible. The real performance concern is design: if a function processes `Union[str, int]` differently for each type, the branching logic adds complexity. For hot paths, consider separate functions for each type rather than a union with branching.
- **The Unforgettable Mental Model:** The **Signpost**. `Union` is like a signpost at a fork — it tells you which road to take. The signpost itself doesn't slow you down, but choosing the wrong road does.
- **The Trap:** Using `Union` in hot paths with complex branching. Separate functions per type are cleaner and potentially faster.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `Union` has zero runtime overhead — it's a type hint. The `isinstance` checks for type narrowing cost nanoseconds. The real concern is code complexity — a function that handles `Union[A, B, C, D]` with branching is harder to optimize than separate functions per type. For hot paths, I prefer separate functions. For API boundaries and data modeling, `Union` is the right tool. The key is matching the tool to the context."

#### How would you explain `Union` with code?
- **The Engine Mechanism (Why it behaves this way):** Show basic usage: `def process(x: Union[str, int]) -> str: if isinstance(x, str): return x.upper(); return str(x)`. Show type narrowing: `def handle(x: str | int): if isinstance(x, str): reveal_type(x)  # str; else: reveal_type(x)  # int`. Show JSON type: `JsonValue = str | int | float | bool | None | list["JsonValue"] | dict[str, "JsonValue"]`. Show `assert_never`: `def handle(x: A | B): if isinstance(x, A): ...; elif isinstance(x, B): ...; else: assert_never(x)`.
- **The Unforgettable Mental Model:** The **Type Narrowing Demo**. Show how the type checker narrows `Union` types within `if isinstance()` blocks — this is the most powerful feature of `Union`.
- **The Trap:** Not showing the `assert_never` pattern for exhaustive handling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate `Union` with three examples. First, a basic `process` function that handles `str | int` differently — shows type narrowing with `isinstance`. Second, a `JsonValue` recursive union — shows how `Union` models real-world heterogeneous data. Third, the `assert_never` pattern for exhaustive handling — if a new type is added to the union, the type checker flags the missing case. I also show the Python 3.10 `A | B` syntax."

## 8. Active recall test

1. **What does `Union[A, B]` mean?**
   - **Explanation:** The value can be of type `A` or type `B`. In Python 3.10+, use `A | B` syntax.

2. **How does type narrowing work with `Union`?**
   - **Explanation:** When you check `isinstance(x, A)` on a `Union[A, B]`, the type checker narrows `x` to `A` within that `if` block. In the `else` block, `x` is narrowed to `B`.

3. **What is `assert_never` and when do you use it?**
   - **Explanation:** From `typing_extensions`, it marks a code path as unreachable. Used after exhaustive `isinstance` checks on a `Union` — if a new type is added, the type checker flags the missing case.

4. **Is `Union[str, None]` the same as `Optional[str]`?**
   - **Explanation:** Yes. `Optional[str]` is shorthand for `Union[str, None]`. Both mean the value can be `str` or `None`.

5. **Does `Union` affect runtime behavior?**
   - **Explanation:** No. `Union` is a type hint ignored at runtime. It's used by static type checkers (mypy, pyright) and IDEs.

6. **When should you avoid using `Union`?**
   - **Explanation:** When it indicates poor design — a function accepting too many types (`Union[A, B, C, D, E]`) is probably doing too much. Prefer separate functions or a common protocol/base class.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Union with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Union and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Union.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
