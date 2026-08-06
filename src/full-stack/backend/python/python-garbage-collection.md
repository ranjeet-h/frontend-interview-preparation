# Garbage Collection in Python

## Detailed explanation

Python primarily uses reference counting plus cyclic GC to reclaim unreachable object graphs. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

GC cleans objects no live code can reach.

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

In a FastAPI or Django backend, garbage collection in python affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### How does garbage collection work in Python?
- **The Engine Mechanism (Why it behaves this way):** Python's GC is a generational cyclic garbage collector that supplements reference counting. It tracks objects that could participate in cycles (containers: lists, dicts, sets, custom classes). These objects are linked into doubly-linked lists organized into three generations. When the count of allocations minus deallocations in generation N exceeds a threshold, GC runs for that generation and all younger ones. The collector uses a mark-and-sweep algorithm: it identifies reachable objects by tracing references from roots (stack, globals, builtins), then frees unreachable objects. Python 3.4+ (PEP 442) supports safe finalization of objects with `__del__` in cycles.
- **The Unforgettable Mental Model:** The **Three-Bucket Sorting System**. New items go in bucket 0. If they survive inspection, they move to bucket 1, then bucket 2. Bucket 0 is checked every few minutes, bucket 1 every hour, bucket 2 every day. Most trash is caught in bucket 0 — the old stuff rarely needs checking.
- **The Trap:** Thinking Python's GC is like Java's or Go's. Python's GC only handles cycles — reference counting handles the vast majority of deallocations. Python's GC is not a full tracing collector.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Python's garbage collection is a generational cyclic collector that works alongside reference counting. Reference counting handles most deallocations immediately. The GC kicks in to detect and break reference cycles — situations where objects reference each other and their reference counts never reach zero. It uses three generations: new objects are checked frequently, survivors move to less-frequently-checked generations. The collector traces reachable objects from roots and frees anything unreachable. I configure GC thresholds based on the service's latency and memory requirements."

#### Why does garbage collection matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** In long-running services, reference cycles are common — ORM objects with bidirectional relationships, event handlers that reference their parent, cached objects with back-references. Without the GC, these cycles would leak memory indefinitely. GC pause times affect request latency — a gen 2 collection on a large object graph can take hundreds of milliseconds. Understanding GC behavior helps you tune thresholds, avoid unnecessary cycles, and diagnose memory issues. In async services, the GC runs in the event loop thread, so a long GC pause blocks all coroutines.
- **The Unforgettable Mental Model:** The **Traffic Jam**. A GC pause is like a traffic light turning red — all cars (coroutines) stop waiting. Most red lights are brief (gen 0), but occasionally there's a long one (gen 2) that backs up the entire intersection.
- **The Trap:** Assuming GC pauses are negligible. In latency-sensitive services (p99 < 100ms), a 200ms gen 2 collection can blow your SLA.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: GC matters in backend services for two reasons: memory leaks and latency. Reference cycles from ORM relationships, event handlers, and caches accumulate without the GC. But GC runs cause pause times — in async services, a gen 2 collection blocks the entire event loop. I monitor GC stats with `gc.get_stats()`, tune thresholds with `gc.set_threshold()`, and for latency-critical paths, I consider disabling GC temporarily during request processing and running it during idle periods. I also design data structures to minimize cycles — using `weakref` for back-references and avoiding bidirectional links where possible."

#### What bug can happen if you misunderstand garbage collection?
- **The Engine Mechanism (Why it behaves this way):** The uncollectable cycle bug: objects with `__del__` methods in reference cycles were uncollectable in Python < 3.4, causing permanent leaks. The GC threshold bug: default thresholds (700, 10, 10) may be too aggressive for services that create many short-lived objects, causing frequent gen 0 collections. The `gc.disable()` bug: disabling GC to avoid pauses causes cycles to accumulate indefinitely, eventually causing OOM. The `__slots__` misconception: `__slots__` reduces per-instance memory but doesn't prevent cycles — slotted classes can still participate in reference cycles.
- **The Unforgettable Mental Model:** The **Broken Vacuum**. Disabling GC is like turning off the vacuum cleaner because it's noisy. The room gets cleaner temporarily (no pauses), but eventually the dust (cycles) piles up so high you can't walk.
- **The Trap:** Thinking `__slots__` prevents memory leaks. It reduces memory per instance but doesn't affect reference counting or cycle detection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most dangerous GC bug is disabling it entirely to avoid pauses — this causes reference cycles to accumulate until OOM. In Python 3.4+, `__del__` in cycles is handled safely, but in older versions it caused uncollectable leaks. I've seen services with aggressive default GC thresholds that spent 20% of CPU time in gen 0 collections — tuning thresholds to `(2000, 15, 15)` reduced GC overhead by 60%. I also watch for ORM objects with bidirectional relationships that create cycles — I use `weakref` for the back-reference to break the cycle."

#### How does garbage collection affect testing?
- **The Engine Mechanism (Why it behaves this way):** Tests that create many objects can trigger GC during test execution, causing non-deterministic timing. Tests that rely on `__del__` being called at a specific time are fragile — `__del__` timing depends on GC cycles, which vary by Python version, platform, and load. Testing for memory leaks requires forcing GC with `gc.collect()` before measuring memory, otherwise unreachable objects may still be counted. The `pytest` fixture system creates and destroys objects, but if fixtures create cycles, those objects may persist beyond the test.
- **The Unforgettable Mental Model:** The **Unpredictable Janitor**. The GC is like a janitor who cleans on their own schedule. If you're trying to measure how much trash a person produces, you need to make sure the janitor has cleaned first — otherwise your measurement includes old trash.
- **The Trap:** Not calling `gc.collect()` before measuring memory in leak tests — unreachable objects waiting for GC inflate the baseline.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I make memory tests deterministic by calling `gc.collect()` before and after the operation under test. This ensures all unreachable objects are freed before measuring. I avoid testing `__del__` timing because it depends on GC cycles. For leak detection, I use `tracemalloc` which tracks allocations regardless of GC state. I also ensure test fixtures don't create reference cycles — if they do, I explicitly break them in teardown or use `weakref` to prevent persistence across tests."

#### How does garbage collection affect performance?
- **The Engine Mechanism (Why it behaves this way):** GC has two performance impacts: CPU overhead for tracing and pause times for collection. Gen 0 collections are fast (microseconds to milliseconds) because they check few objects. Gen 2 collections can take hundreds of milliseconds for large heaps. The overhead is proportional to the number of tracked objects — services that create many container objects (lists, dicts, custom instances) trigger GC more frequently. Python 3.8+ has an improved GC with better performance. You can tune thresholds: `gc.set_threshold(0)` disables automatic GC (manual `gc.collect()` still works), `gc.set_threshold(2000, 15, 15)` reduces frequency.
- **The Unforgettable Mental Model:** The **Tax Audit**. GC is like a tax audit — small audits (gen 0) happen frequently and are quick. A full audit (gen 2) happens rarely but takes days. The more financial transactions (objects) you have, the longer the audit takes.
- **The Trap:** Tuning GC thresholds without measuring. Making thresholds too high saves CPU but increases memory; making them too low saves memory but increases CPU.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: GC affects performance through CPU overhead and pause times. I measure both with `gc.get_stats()` and application-level latency metrics. For CPU-bound services, I increase thresholds to reduce GC frequency — trading memory for CPU. For latency-sensitive services, I may disable automatic GC during request processing and run it manually during idle periods. I also reduce the number of tracked objects by using `__slots__`, tuples instead of dicts, and avoiding unnecessary container creation in hot paths. The key is to measure first, then tune — never guess."

#### How would you explain garbage collection with code?
- **The Engine Mechanism (Why it behaves this way):** Show GC stats: `import gc; gc.get_stats()` — returns counts of collections and collected objects per generation. Show a cycle: `class A: pass; a = A(); b = A(); a.ref = b; b.ref = a; del a; del b; gc.collect()` — returns the number of unreachable objects collected. Show threshold tuning: `gc.set_threshold(2000, 15, 15)`. Show manual GC: `gc.disable(); ...; gc.collect(); gc.enable()`. Show `gc.garbage` — in Python < 3.4, uncollectable objects with `__del__` end up here.
- **The Unforgettable Mental Model:** The **Dashboard**. `gc.get_stats()` is like a car dashboard — it tells you how often the engine (GC) is running and how much work it's doing.
- **The Trap:** Not checking `gc.isenabled()` before calling `gc.disable()` — if GC is already disabled, you might not realize it.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate GC with four code examples. First, `gc.get_stats()` to show collection counts and collected objects per generation. Second, creating a reference cycle and showing that `gc.collect()` is needed to free it. Third, tuning thresholds with `gc.set_threshold()` and measuring the impact on GC frequency. Fourth, the manual GC pattern — disabling during request processing and running during idle periods. These examples show both how GC works and how to manage it in production services."

## 8. Active recall test

1. **What is the difference between reference counting and garbage collection in Python?**
   - **Explanation:** Reference counting frees objects immediately when their reference count reaches zero — it handles most deallocations. Garbage collection detects and frees objects in reference cycles that reference counting can't handle — it runs periodically.

2. **How many generations does Python's GC have and how do they work?**
   - **Explanation:** Three generations (0, 1, 2). New objects start in gen 0. Survivors move to gen 1, then gen 2. Gen 0 is checked most frequently, gen 2 least. This generational approach optimizes for the observation that most objects die young.

3. **When should you tune GC thresholds?**
   - **Explanation:** When GC is consuming too much CPU (increase thresholds) or when memory usage is too high (decrease thresholds). Measure first with `gc.get_stats()` and application metrics, then tune. Default is (700, 10, 10).

4. **What happens to objects with `__del__` in reference cycles?**
   - **Explanation:** In Python 3.4+, they're safely collected (PEP 442). In older versions, they were uncollectable and ended up in `gc.garbage`, causing permanent leaks.

5. **How do you force garbage collection in Python?**
   - **Explanation:** Call `gc.collect()`. This runs a full collection of all generations. You can also pass a generation number: `gc.collect(0)` collects only gen 0.

6. **Can you disable garbage collection? What are the risks?**
   - **Explanation:** Yes, with `gc.disable()`. The risk is that reference cycles accumulate indefinitely, causing memory to grow until OOM. Manual `gc.collect()` still works when GC is disabled.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Garbage Collection in Python with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Garbage Collection in Python and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Garbage Collection in Python.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
