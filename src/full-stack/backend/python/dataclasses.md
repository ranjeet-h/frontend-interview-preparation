# Dataclasses

## Detailed explanation

Dataclasses reduce boilerplate for classes that mainly store structured data. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Dataclass is a typed data container with generated methods.

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

In a FastAPI or Django backend, dataclasses affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What are dataclasses in Python?
- **The Engine Mechanism (Why it behaves this way):** Dataclasses (PEP 557, Python 3.7+) are classes decorated with `@dataclass` that auto-generate `__init__`, `__repr__`, `__eq__`, and optionally `__lt__`, `__le__`, `__gt__`, `__ge__`, `__hash__` based on class-level type-annotated fields. The decorator inspects class annotations at class creation time and injects dunder methods. Fields are defined as class attributes with type hints: `@dataclass class User: name: str; age: int`. The generated `__init__` takes parameters in field definition order. `dataclass(frozen=True)` makes instances immutable (generates `__hash__` and prevents attribute assignment). `field(default_factory=list)` provides mutable defaults safely.
- **The Unforgettable Mental Model:** The **Auto-Fill Form**. A dataclass is like a form where you just fill in the field names and types, and Python automatically generates all the boilerplate — constructor, string representation, equality check — like an auto-fill that completes the paperwork for you.
- **The Trap:** Using mutable defaults directly: `@dataclass class Config: items: list = []` — this shares the same list across instances. Use `field(default_factory=list)`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Dataclasses are a decorator that auto-generates boilerplate methods for data-holding classes. Instead of writing `__init__`, `__repr__`, and `__eq__` manually, I define fields with type annotations and `@dataclass` generates everything. They're ideal for DTOs, configuration objects, and value objects in backend services. I use `frozen=True` for immutable data (safe as dict keys, thread-safe), `field(default_factory=...)` for mutable defaults, and `field(repr=False)` to exclude sensitive fields from string representations."

#### Why do dataclasses matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** Backend services constantly transfer structured data between layers — API requests to service logic to database models. Dataclasses provide a clean, typed way to represent this data without the boilerplate of manual classes or the limitations of dicts. Unlike dicts, dataclasses have a fixed schema (field names and types), IDE autocomplete, and type checker support. Unlike NamedTuples, dataclasses support default values, mutable fields, and inheritance. In FastAPI, dataclasses can be used as request/response models (though Pydantic is preferred for validation). Dataclasses with `frozen=True` are hashable and can be used as dict keys or set elements.
- **The Unforgettable Mental Model:** The **Shipping Container**. A dict is a loose pile of items — you can add or remove anything. A dataclass is a shipping container — fixed slots, labeled compartments, and a manifest. You know exactly what's inside and where.
- **The Trap:** Using dataclasses for validation. Dataclasses don't validate types at runtime — `User(name=123, age="young")` is accepted. Use Pydantic for validation, dataclasses for data transfer.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Dataclasses provide structured, typed data containers without boilerplate. In backend services, I use them for DTOs between layers, configuration objects, and value objects. They're better than dicts because they have a fixed schema and type checker support. They're better than manual classes because they auto-generate `__init__`, `__repr__`, and `__eq__`. However, dataclasses don't validate types at runtime — for that, I use Pydantic. I prefer `frozen=True` for data that shouldn't change after creation, making it hashable and thread-safe."

#### What bug can happen if you misunderstand dataclasses?
- **The Engine Mechanism (Why it behaves this way):** The mutable default bug: `@dataclass class Config: items: list = []` shares the same list across all instances (same as the function default argument bug). Fix: `items: list = field(default_factory=list)`. The inheritance ordering bug: in dataclass inheritance, fields from base classes come first, then derived class fields. If a derived class defines a field without a default after inheriting a field with a default, it breaks `__init__` parameter ordering (non-default after default). The `frozen` mutation bug: trying to modify a frozen dataclass raises `FrozenInstanceError`. The `__post_init__` bug: `__post_init__` runs after `__init__` but doesn't receive the same arguments — it receives no arguments by default, so you can't use it to override field values passed to `__init__`.
- **The Unforgettable Mental Model:** The **Shared Blueprint**. The mutable default bug is like giving every house the same foundation — if one house's foundation cracks, they all crack. Each instance needs its own foundation (`default_factory`).
- **The Trap:** Thinking dataclasses validate types. They don't — `User(name=123)` is accepted if `name: str`. Type checking is static (mypy), not runtime.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common dataclass bug is the mutable default — `items: list = []` shares the list across instances. Use `field(default_factory=list)`. Another bug is inheritance ordering — derived class fields without defaults can't follow base class fields with defaults. Dataclasses also don't validate types at runtime — that's a static check via mypy. For runtime validation, I use Pydantic. I also watch for `frozen=True` dataclasses — they raise `FrozenInstanceError` on mutation, which is good for safety but surprising if you expected mutability."

#### How do dataclasses affect testing?
- **The Engine Mechanism (Why it behaves this way):** Dataclasses are easy to test because they're simple data containers with predictable behavior. `__eq__` is auto-generated based on field values, so `assert obj1 == obj2` works out of the box. `__repr__` provides readable failure messages. Test dataclasses by creating instances with various field combinations and verifying equality, repr output, and hash behavior (for frozen dataclasses). Use `dataclasses.asdict()` to convert to dicts for JSON serialization testing. Test `__post_init__` logic by creating instances and verifying computed fields.
- **The Unforgettable Mental Model:** The **Lego Brick**. Dataclasses are like Lego bricks — simple, predictable, and easy to snap together. Testing them is straightforward because their behavior is deterministic and auto-generated.
- **The Trap:** Not testing `__post_init__` logic. If your dataclass has computed fields or validation in `__post_init__`, those need explicit tests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Dataclasses are inherently testable because they're simple data containers. The auto-generated `__eq__` means equality assertions work out of the box. `__repr__` gives clear failure messages. I test dataclasses by creating instances with various inputs and verifying equality, repr, and hash behavior. For dataclasses with `__post_init__`, I test the computed fields and any validation logic. I also use `dataclasses.asdict()` to test JSON serialization. The key advantage over dicts is that dataclasses have a fixed schema — I can't accidentally misspell a field name and get a silent bug."

#### How do dataclasses affect performance or memory?
- **The Engine Mechanism (Why it behaves this way):** Dataclasses have a small startup cost — the decorator inspects annotations and generates methods at class creation time (once, at import). Instance creation is comparable to regular classes. Memory-wise, dataclass instances use the same amount of memory as regular class instances — each instance has a `__dict__` unless `__slots__` is used. `@dataclass(slots=True)` (Python 3.10+) generates `__slots__`, reducing per-instance memory by ~40-50% and improving attribute access speed. Frozen dataclasses are slightly slower to create (immutability checks) but faster to hash (cached hash value).
- **The Unforgettable Mental Model:** The **Pre-Fab House**. A dataclass is like a pre-fabricated house — the blueprint is designed once (import time), then houses are built quickly (instance creation). With `slots=True`, it's like a tiny house — less space, same functionality.
- **The Trap:** Not using `slots=True` for dataclasses with many instances. Without slots, each instance has a `__dict__`, wasting memory.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Dataclasses have minimal performance overhead — method generation happens once at import time. Instance creation is comparable to regular classes. For memory efficiency, I use `@dataclass(slots=True)` (Python 3.10+) which eliminates the per-instance `__dict__`, saving ~40-50% memory. This matters when creating thousands of instances, like database row objects. Frozen dataclasses have a small creation cost (immutability checks) but benefit from cached hash values. In backend services, I use slots for high-volume data objects and frozen for immutable value objects."

#### How would you explain dataclasses with code?
- **The Engine Mechanism (Why it behaves this way):** Show basic dataclass: `@dataclass class User: name: str; age: int; u = User("Alice", 30); print(u)` — auto-generated `__repr__` shows `User(name='Alice', age=30)`. Show defaults: `@dataclass class Config: host: str = "localhost"; port: int = 8080`. Show `default_factory`: `@dataclass class Team: members: list = field(default_factory=list)`. Show frozen: `@dataclass(frozen=True) class Point: x: int; y: int`. Show `__post_init__`: `@dataclass class Rectangle: width: float; height: float; def __post_init__(self): self.area = self.width * self.height`. Show `asdict()`: `from dataclasses import asdict; asdict(user)` → `{"name": "Alice", "age": 30}`.
- **The Unforgettable Mental Model:** The **Progressive Reveal**. Start with the simplest dataclass, then add features one by one — defaults, default_factory, frozen, post_init, asdict. Each feature solves a real problem.
- **The Trap:** Not showing the mutable default bug and its fix. This is the #1 dataclass mistake.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate dataclasses progressively. First, a basic `User` with auto-generated `__init__`, `__repr__`, and `__eq__`. Second, defaults and `default_factory` to solve the mutable default bug. Third, `frozen=True` for immutable, hashable instances. Fourth, `__post_init__` for computed fields. Fifth, `asdict()` for serialization. I also show `slots=True` for memory efficiency. This progression shows the full range of dataclass capabilities and when to use each feature."

## 8. Active recall test

1. **What methods does `@dataclass` auto-generate?**
   - **Explanation:** `__init__`, `__repr__`, `__eq__`. Optionally `__lt__`, `__le__`, `__gt__`, `__ge__`, `__hash__` (with `order=True` or `frozen=True`).

2. **How do you provide a mutable default value in a dataclass?**
   - **Explanation:** Use `field(default_factory=list)` or `field(default_factory=dict)`. Never use `items: list = []` — it shares the same list across all instances.

3. **What does `frozen=True` do?**
   - **Explanation:** Makes the dataclass immutable — attribute assignment raises `FrozenInstanceError`. Also auto-generates `__hash__`, making instances usable as dict keys and set elements.

4. **Do dataclasses validate types at runtime?**
   - **Explanation:** No. `User(name=123, age="young")` is accepted even with `name: str; age: int`. Type checking is static (mypy, IDE). Use Pydantic for runtime validation.

5. **What is `__post_init__` and when does it run?**
   - **Explanation:** A method that runs after `__init__` completes. Used for computed fields, validation, or derived attributes. Receives no arguments by default.

6. **What does `slots=True` do in a dataclass?**
   - **Explanation:** Generates `__slots__` instead of `__dict__`, reducing per-instance memory by ~40-50% and improving attribute access speed. Available in Python 3.10+.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Dataclasses with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Dataclasses and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Dataclasses.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
