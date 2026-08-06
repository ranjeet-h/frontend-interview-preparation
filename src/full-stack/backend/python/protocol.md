# Protocol

## Detailed explanation

Protocol defines structural typing: objects match by methods/attributes, not inheritance. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Protocol is interface by behavior.

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

In a FastAPI or Django backend, protocol affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What is `Protocol` in Python type hints?
- **The Engine Mechanism (Why it behaves this way):** `Protocol` (PEP 544, Python 3.8+) defines structural typing — a class matches a protocol if it has the required methods and attributes, regardless of inheritance. This is "duck typing" made static: if it walks like a duck and quacks like a duck, the type checker accepts it as a duck. Protocols are defined by inheriting from `typing.Protocol` and declaring method signatures. Classes don't need to explicitly inherit from the protocol — they match implicitly if they have the right shape. `@runtime_checkable` allows `isinstance(obj, Protocol)` checks at runtime (only checks method existence, not signatures).
- **The Unforgettable Mental Model:** The **Job Description**. A protocol is like a job posting — it lists required skills (methods). Any candidate (class) with those skills qualifies, regardless of their background (inheritance chain).
- **The Trap:** Thinking protocols require explicit inheritance. They don't — matching is structural (implicit), not nominal (explicit). This is the key difference from abstract base classes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `Protocol` defines structural typing — a class matches if it has the required methods, regardless of inheritance. It's static duck typing. I define a protocol with required method signatures, and any class with those methods matches implicitly. This is different from abstract base classes, which require explicit inheritance. I use protocols for dependency inversion — defining interfaces that any implementation can satisfy without coupling to a base class. In backend services, I use protocols for repository interfaces, service contracts, and plugin systems."

#### Why does `Protocol` matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** Backend services benefit from dependency inversion — high-level modules depend on abstractions, not concrete implementations. Protocols provide these abstractions without requiring inheritance hierarchies. A `UserRepository` protocol defines `get_user(id: int) -> User` — any class with this method (SQLAlchemy repo, MongoDB repo, in-memory repo for tests) satisfies the protocol. This enables easy testing (swap real repo for mock), easy swapping (change database without changing service code), and clean architecture. FastAPI's dependency injection works naturally with protocols.
- **The Unforgettable Mental Model:** The **Universal Charger**. A protocol is like a USB-C port — any device with a USB-C connector works, regardless of brand. You don't need to know the manufacturer; you just need the right shape.
- **The Trap:** Using protocols when a simple function type (`Callable`) would suffice. Protocols are for multi-method interfaces; single-method interfaces can use `Callable`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Protocols enable dependency inversion without inheritance. I define a `UserRepository` protocol with methods like `get_user` and `save_user`. The service layer depends on the protocol, not the concrete implementation. In production, I inject a SQLAlchemy repository; in tests, I inject an in-memory repository. Both satisfy the protocol. This makes testing easy (swap implementations), makes architecture clean (layers depend on abstractions), and makes code flexible (change implementations without changing consumers). I prefer protocols over ABCs because they don't require explicit inheritance."

#### What bug can happen if you misunderstand `Protocol`?
- **The Engine Mechanism (Why it behaves this way):** The implicit matching surprise: a class accidentally matches a protocol because it happens to have the right method names, even though it wasn't designed for that purpose. The runtime check limitation: `@runtime_checkable` only checks method existence, not signatures — `isinstance(obj, Protocol)` returns `True` even if the method has wrong parameters. The self-type bug: protocols with methods that return `Self` (the implementing class) need `typing_extensions.Self` for correct typing. The inheritance confusion: a class that explicitly inherits from a protocol is treated nominally (must be declared), not structurally — this defeats the purpose of structural typing.
- **The Unforgettable Mental Model:** The **Accidental Match**. A class accidentally matching a protocol is like someone accidentally qualifying for a job because they happen to have the right skills on their resume, even though they never applied.
- **The Trap:** Using `@runtime_checkable` expecting it to check method signatures. It only checks that methods exist, not that they have the right parameters or return types.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most surprising protocol behavior is implicit matching — any class with the right methods matches, even accidentally. This is usually a feature, not a bug, but it can cause confusion. `@runtime_checkable` only checks method existence, not signatures — it's a shallow check. I avoid explicit inheritance from protocols (that's what ABCs are for). For self-returning methods, I use `typing_extensions.Self`. The key principle: protocols are for structural typing — matching by shape, not by name."

#### How does `Protocol` affect testing?
- **The Engine Mechanism (Why it behaves this way):** Protocols make testing easier by defining clear interfaces. Test implementations (mocks, fakes, stubs) satisfy the protocol without inheriting from anything. The type checker verifies that test implementations match the protocol's method signatures. This catches mock bugs where the mock has wrong method names or signatures. Protocols also enable property-based testing — the type checker ensures test strategies produce values that satisfy the protocol.
- **The Unforgettable Mental Model:** The **Plug-and-Play Test**. Protocols are like standardized plugs — any implementation (real or mock) that fits the plug works in the socket (consumer).
- **The Trap:** Not verifying that mock implementations match the protocol. A mock with wrong method names passes at runtime but fails the type checker.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Protocols make testing easier because test implementations (mocks, fakes) satisfy the protocol without inheritance. The type checker verifies that mocks have the right method signatures — catching bugs where a mock has `get_user` but the protocol expects `fetch_user`. I create fake implementations for testing that satisfy the protocol with in-memory data structures. The type checker ensures the fake matches the real implementation's interface, giving confidence that tests are realistic."

#### How does `Protocol` affect performance?
- **The Engine Mechanism (Why it behaves this way):** `Protocol` has zero runtime performance impact — it's a type hint. `@runtime_checkable` adds a small `isinstance` check cost, but this is negligible. Protocols don't add any method dispatch overhead — method calls go directly to the implementing class, not through a proxy. The performance benefit is architectural: protocols enable swapping implementations, so you can use a faster implementation in production without changing consumer code.
- **The Unforgettable Mental Model:** The **Invisible Interface**. Protocols are invisible at runtime — they don't add any overhead. They're like a contract that exists only on paper, not in the physical world.
- **The Trap:** Thinking protocols add dispatch overhead like interfaces in Java. They don't — Python's dynamic dispatch is unchanged.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Protocols have zero runtime overhead — they're type hints. Method calls go directly to the implementing class, no proxy or dispatch layer. `@runtime_checkable` adds a tiny `isinstance` check cost, but I rarely use it. The performance benefit is architectural: protocols let me swap implementations, so I can optimize the implementation without changing consumers. In backend services, this means I can use a cached repository in production and an in-memory repository in tests, both satisfying the same protocol."

#### How would you explain `Protocol` with code?
- **The Engine Mechanism (Why it behaves this way):** Show protocol definition: `class Repository(Protocol): def get(self, id: int) -> User: ...; def save(self, user: User) -> None: ...`. Show implicit matching: `class SQLRepo: def get(self, id: int) -> User: ...; def save(self, user: User) -> None: ...` — matches `Repository` without inheriting. Show usage: `def service(repo: Repository): user = repo.get(1); repo.save(user)`. Show `@runtime_checkable`: `@runtime_checkable class Repository(Protocol): ...; isinstance(SQLRepo(), Repository)` → `True`. Show test fake: `class FakeRepo: def get(self, id: int) -> User: return self.users[id]; def save(self, user: User) -> None: self.users[user.id] = user`.
- **The Unforgettable Mental Model:** The **Interface Without Inheritance**. Show two classes that match the same protocol without sharing a base class — this is the key insight.
- **The Trap:** Not showing the implicit matching — the whole point of protocols is that classes don't need to inherit.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate protocols with three examples. First, a `Repository` protocol with `get` and `save` methods. Second, a `SQLRepo` class that matches the protocol without inheriting from it — this is structural typing. Third, a `FakeRepo` for testing that also matches the protocol. The service function accepts `Repository` and works with both implementations. This shows dependency inversion: the service depends on the abstraction, not the concrete class."

## 8. Active recall test

1. **What is structural typing vs. nominal typing?**
   - **Explanation:** Structural typing (protocols) matches by shape — if a class has the right methods, it matches. Nominal typing (ABCs, inheritance) matches by name — a class must explicitly inherit from the base.

2. **Do classes need to inherit from a Protocol to match it?**
   - **Explanation:** No. Matching is implicit — any class with the required methods and attributes satisfies the protocol, regardless of inheritance.

3. **What does `@runtime_checkable` do?**
   - **Explanation:** Allows `isinstance(obj, Protocol)` checks at runtime. It only checks method existence, not signatures. Has a small performance cost.

4. **When should you use Protocol vs. ABC (Abstract Base Class)?**
   - **Explanation:** Use Protocol for structural typing (implicit matching, no inheritance required). Use ABC for nominal typing (explicit inheritance, shared implementation, `register()` for virtual subclasses).

5. **Can a Protocol have default method implementations?**
   - **Explanation:** Yes, but it's unusual. Protocols typically define interfaces without implementation. Default implementations are better suited for ABCs or mixin classes.

6. **How do Protocols enable dependency inversion?**
   - **Explanation:** High-level modules depend on the protocol (abstraction), not concrete implementations. Any class satisfying the protocol can be injected, enabling easy testing and implementation swapping.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Protocol with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Protocol and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Protocol.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
