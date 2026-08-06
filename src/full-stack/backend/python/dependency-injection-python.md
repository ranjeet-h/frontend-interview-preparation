# Dependency Injection in Python

## Detailed explanation

Dependency injection passes required collaborators into functions/classes instead of constructing them inside. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Inject dependencies to make code testable and flexible.

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

In a FastAPI or Django backend, dependency injection in python affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What is dependency injection in Python?
- **The Engine Mechanism (Why it behaves this way):** Dependency injection (DI) is a pattern where a component receives its dependencies from the outside rather than creating them internally. Instead of `class Service: def __init__(self): self.db = Database()`, you write `class Service: def __init__(self, db: Database): self.db = db`. The dependency is "injected" at construction time. Python supports DI through constructor injection (most common), function parameter injection (FastAPI's `Depends`), and decorator-based injection. DI frameworks like `injector`, `punq`, and `dependency-injector` automate dependency resolution. FastAPI's DI system inspects function signatures and resolves dependencies recursively.
- **The Unforgettable Mental Model:** The **Power Tool Outlet**. Instead of a tool having a built-in battery (hardcoded dependency), it plugs into an outlet (injected dependency). You can swap the power source (real DB → mock DB) without changing the tool.
- **The Trap:** Confusing DI with a DI framework. DI is a pattern — you can do it manually without any library. Frameworks just automate the wiring.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Dependency injection is a pattern where components receive their dependencies from outside rather than creating them internally. Instead of `self.db = Database()` inside a class, I pass `db` as a constructor parameter. This makes the component testable (inject a mock), flexible (swap implementations), and explicit (dependencies are visible in the signature). In FastAPI, I use `Depends()` for function-level DI — the framework resolves dependencies recursively. DI is a pattern, not a framework — you can do it manually or use a library."

#### Why does dependency injection matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** DI enables testability — inject mock dependencies instead of real databases, HTTP clients, or external services. It enables flexibility — swap implementations without changing consumer code (real DB → in-memory DB for tests). It enables lifecycle management — the DI container controls when dependencies are created and destroyed (singleton, request-scoped, transient). In FastAPI, `Depends()` handles request-scoped dependencies — database sessions are created per request and closed after. DI makes the dependency graph explicit, improving code readability and maintainability.
- **The Unforgettable Mental Model:** The **Modular Stereo System**. Instead of a stereo with built-in speakers (hardcoded), you have separate components connected by cables (injected). Swap speakers, add a subwoofer, or use headphones — the stereo doesn't care.
- **The Trap:** Over-engineering DI — creating a complex DI container for a simple service. Manual constructor injection is often enough.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: DI matters for three reasons: testability, flexibility, and lifecycle management. I inject dependencies so I can swap real databases for mocks in tests, swap implementations without changing consumers, and control when dependencies are created and destroyed. In FastAPI, `Depends()` handles request-scoped dependencies — database sessions are created per request and closed automatically. I start with manual constructor injection and only add a DI container when the dependency graph becomes complex. The key benefit is that dependencies are explicit — you can see what a component needs from its signature."

#### What bug can happen if you misunderstand dependency injection?
- **The Engine Mechanism (Why it behaves this way):** The mutable shared state bug: injecting a mutable singleton (like a dict cache) that's shared across requests — one request's modifications affect another. The circular dependency bug: A depends on B, B depends on A — the DI container can't resolve the cycle. The lifecycle mismatch bug: injecting a request-scoped dependency into a singleton service — the singleton holds a reference to a dependency from the first request, using stale data for all subsequent requests. The over-injection bug: injecting everything, including simple values — `def process(db, config, logger, validator, formatter, ...)` — too many dependencies indicate the component does too much.
- **The Unforgettable Mental Model:** The **Shared Notebook**. Injecting a mutable singleton is like giving everyone the same notebook — what one person writes, everyone sees. Each request should get its own notebook.
- **The Trap:** Injecting a request-scoped dependency into a singleton — the singleton captures the first request's dependency and uses it forever.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common DI bug is lifecycle mismatch — injecting a request-scoped dependency (like a database session) into a singleton service. The singleton captures the first request's session and uses it for all requests, causing stale data and connection issues. I match dependency lifecycles: singletons get singletons, request-scoped gets request-scoped. Another bug is mutable shared state — injecting a mutable object that's shared across requests. I use immutable configurations and request-scoped mutable state. Circular dependencies indicate a design problem — I refactor to break the cycle."

#### How does dependency injection affect testing?
- **The Engine Mechanism (Why it behaves this way):** DI makes testing trivial — inject mocks instead of real dependencies. Constructor injection: `Service(mock_db)` — no framework needed. FastAPI's `Depends()` can be overridden: `app.dependency_overrides[get_db] = lambda: mock_db`. DI enables unit testing (test components in isolation with mocks) and integration testing (test with real dependencies). The dependency graph is explicit, so test setup is clear — you know exactly what to mock. DI also enables property-based testing — inject different implementations to test behavior across variants.
- **The Unforgettable Mental Model:** The **Test Plug**. DI is like a standardized plug — you can plug in a real dependency for production or a mock dependency for testing, without changing the component.
- **The Trap:** Not overriding all dependencies in tests — some real dependencies slip through, making tests slow or non-deterministic.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: DI makes testing straightforward. For unit tests, I inject mocks directly: `Service(mock_db, mock_http_client)`. For FastAPI integration tests, I override dependencies: `app.dependency_overrides[get_db] = lambda: mock_db`. The key advantage is that dependencies are explicit — I know exactly what to mock. I test with both mocks (unit tests) and real dependencies (integration tests). DI also makes test setup cleaner — no global state, no patching, just constructor arguments."

#### How does dependency injection affect performance?
- **The Engine Mechanism (Why it behaves this way):** Manual DI (constructor injection) has zero performance overhead — it's just function arguments. DI frameworks add small overhead for dependency resolution (typically microseconds per resolution). FastAPI's `Depends()` resolves dependencies per request, adding minimal overhead. The performance benefit of DI is indirect: it enables caching (inject a cached service), connection pooling (inject a pooled database client), and lazy loading (inject a factory instead of the actual object). These optimizations improve performance without changing consumer code.
- **The Unforgettable Mental Model:** The **Plug-and-Play Upgrade**. DI is like a standardized socket — you can plug in a faster component without rewiring the whole system.
- **The Trap:** Thinking DI frameworks add significant overhead. They don't — resolution takes microseconds, negligible compared to I/O operations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Manual DI has zero overhead — it's just function arguments. DI frameworks add microseconds per resolution, negligible compared to I/O. The performance benefit of DI is indirect: it enables caching, connection pooling, and lazy loading. I inject a pooled database client instead of creating connections per request. I inject a cached service instead of recomputing. These optimizations improve performance without changing consumer code. The key is that DI makes optimization possible — without it, dependencies are hardcoded and hard to swap."

#### How would you explain dependency injection with code?
- **The Engine Mechanism (Why it behaves this way):** Show constructor injection: `class Service: def __init__(self, db: Database): self.db = db`. Show FastAPI DI: `def get_db(): with Session() as db: yield db; @app.get("/users"): def get_users(db: Session = Depends(get_db)): ...`. Show override for testing: `app.dependency_overrides[get_db] = lambda: mock_db`. Show manual DI in tests: `service = Service(mock_db); result = service.get_user(1)`. Show dependency chain: `def get_repo(db = Depends(get_db)): return UserRepository(db); def get_service(repo = Depends(get_repo)): return UserService(repo)`.
- **The Unforgettable Mental Model:** The **Dependency Chain**. Show how dependencies chain together — `get_db` → `get_repo` → `get_service` — each depending on the previous.
- **The Trap:** Not showing the test override — this is the most practical benefit of DI.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate DI with three examples. First, constructor injection — `Service(db)` shows the basic pattern. Second, FastAPI's `Depends()` — shows framework-level DI with automatic resolution and cleanup. Third, test override — `app.dependency_overrides[get_db] = lambda: mock_db` shows how DI enables testing. I also show dependency chains — `get_db` → `get_repo` → `get_service` — where each dependency depends on the previous. This shows how DI scales from simple to complex."

## 8. Active recall test

1. **What is dependency injection?**
   - **Explanation:** A pattern where components receive their dependencies from outside rather than creating them internally. Dependencies are passed as constructor arguments or function parameters.

2. **How does DI make testing easier?**
   - **Explanation:** Inject mocks instead of real dependencies. `Service(mock_db)` tests the service without a real database. In FastAPI, override dependencies with `app.dependency_overrides`.

3. **What is a lifecycle mismatch in DI?**
   - **Explanation:** Injecting a request-scoped dependency into a singleton service. The singleton captures the first request's dependency and uses it for all subsequent requests, causing stale data.

4. **What is the difference between DI as a pattern and a DI framework?**
   - **Explanation:** DI as a pattern is manual — passing dependencies as arguments. A DI framework (injector, FastAPI's Depends) automates dependency resolution and lifecycle management.

5. **How does FastAPI's `Depends()` work?**
   - **Explanation:** FastAPI inspects function signatures, resolves dependencies recursively, and injects the results. Dependencies can be functions, classes, or other `Depends()`. They're resolved per request.

6. **What is a circular dependency and how do you fix it?**
   - **Explanation:** A depends on B, B depends on A — the DI container can't resolve the cycle. Fix by refactoring: extract shared logic into a third component, or use lazy injection (inject a factory instead of the object).

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Dependency Injection in Python with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Dependency Injection in Python and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Dependency Injection in Python.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
