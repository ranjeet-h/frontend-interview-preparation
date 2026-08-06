# Mutable and Immutable Types

## Detailed explanation

Mutable objects can change in place; immutable objects create new values when changed. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Mutability decides whether references can observe changes.

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

In a FastAPI or Django backend, mutable and immutable types affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What is the difference between mutable and immutable types in Python?
- **The Engine Mechanism (Why it behaves this way):** In Python, every object has an identity (id), a type, and a value. Mutable objects (list, dict, set, bytearray) allow their value to change in place — the `id()` stays the same after modification. Immutable objects (int, float, str, tuple, frozenset, bytes) cannot change their value — any "modification" creates a new object with a new `id()`. This is enforced at the C level in CPython: immutable types lack in-place mutation methods, and their C struct fields are not exposed for modification.
- **The Unforgettable Mental Model:** The **Whiteboard vs. Printed Page**. A mutable object is a whiteboard — you can erase and rewrite on the same surface. An immutable object is a printed page — to change it, you must print a whole new page.
- **The Trap:** Thinking `a = a + 1` mutates an integer. It doesn't — it creates a new int object and rebinds the name `a` to it. The original int object is unchanged (and may be garbage collected if no other references exist).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Mutable types like lists, dicts, and sets can be modified in place — their identity stays the same while their content changes. Immutable types like integers, strings, and tuples cannot be changed; any operation that appears to modify them actually creates a new object. This distinction matters for function arguments, dictionary keys, hashing, thread safety, and memory behavior. Understanding it prevents subtle bugs like shared mutable state and unhashable key errors."

#### Why does mutability matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** Mutability affects caching, concurrency, and API correctness. Immutable objects are inherently thread-safe for reads — multiple threads can share a string or tuple without locks. Mutable objects require synchronization or isolation. In async services, sharing mutable state between coroutines can cause race conditions. Dict keys and set elements must be hashable, which requires immutability — using a list as a dict key raises `TypeError: unhashable type: 'list'`.
- **The Unforgettable Mental Model:** The **Museum Exhibit vs. Workshop**. Immutable objects are like museum exhibits — anyone can look, nobody can touch, so there's no conflict. Mutable objects are like a shared workshop — if two people modify the same tool simultaneously, chaos ensues.
- **The Trap:** Assuming immutability means thread-safety for compound operations. While individual reads of immutable objects are safe, a compound operation like `cache[key] = cache.get(key, 0) + 1` on a mutable dict is not atomic even if the values are immutable ints.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Mutability is a correctness and concurrency concern. Immutable types are safe to share across threads and coroutines without locks, making them ideal for configuration, constants, and cache keys. Mutable types require careful ownership — I use them when I need in-place updates for performance, but I isolate them to a single owner or protect them with locks. In FastAPI, request bodies are typically parsed into dicts (mutable), but I often convert them to dataclasses or NamedTuples (immutable) before passing them through the service layer to prevent accidental mutation."

#### What bug can happen if you misunderstand mutability?
- **The Engine Mechanism (Why it behaves this way):** The mutable default argument bug: `def append_item(item, target=[])` shares the same list across all calls. The aliasing bug: `a = [1, 2]; b = a; b.append(3)` — `a` is now `[1, 2, 3]` too. The loop mutation bug: iterating over a list while modifying it (`for x in my_list: my_list.remove(x)`) skips elements because the iterator's index advances while the list shrinks. The string concatenation in a loop bug: `s += chunk` in a loop creates O(n²) intermediate string objects because strings are immutable.
- **The Unforgettable Mental Model:** The **Photocopy Machine**. When you alias a mutable object (`b = a`), you're not making a photocopy — you're giving two people the same original document. Changes by one person affect what the other sees.
- **The Trap:** Using `list.copy()` or `[:]` only creates a shallow copy. If the list contains mutable objects, those inner objects are still shared. Use `copy.deepcopy()` for full isolation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common mutability bug is the mutable default argument — `def foo(bar=[])` creates one list shared by all calls. The fix is `def foo(bar=None)` with `bar = bar or []` inside. Another trap is shallow copying — `list.copy()` only copies the outer container, not nested mutable objects. I also watch for loop-while-mutating bugs and string concatenation in loops, which creates quadratic memory allocation. I use `"".join()` for string building and iterate over copies when I need to modify during iteration."

#### How does mutability affect testing?
- **The Engine Mechanism (Why it behaves this way):** Mutable test fixtures cause test pollution — one test modifies shared data, affecting subsequent tests. Immutable fixtures prevent this. When testing functions that mutate their arguments, you need to verify both the return value and the mutated input. Mocking mutable objects requires care — `unittest.mock.patch` replaces references, but if code holds a local reference before the patch, it won't see the mock.
- **The Unforgettable Mental Model:** The **Hotel Room**. Each test should get a clean room (fresh fixture). If tests share a mutable fixture, it's like guests not checking out — the next guest finds the previous guest's mess.
- **The Trap:** Not resetting mutable state between tests in `setUp`/`tearDown` or pytest fixtures. Using module-level mutable variables that persist across test runs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I design test fixtures to be immutable by default — tuples, frozensets, or freshly created objects per test. When I need mutable fixtures, I create them inside the test function or use pytest's `scope="function"` fixtures to ensure isolation. I also test mutation side effects explicitly: if a function modifies its input, I assert both the return value and the mutated state. This catches bugs where a function accidentally mutates data it shouldn't."

#### How does mutability affect performance or memory?
- **The Engine Mechanism (Why it behaves this way):** Immutable objects can be interned and shared safely. Python interns small integers (-5 to 256) and some strings, so `a = 1; b = 1` makes `a is b` True. This saves memory. Mutable objects cannot be interned because modification would affect all references. String concatenation in a loop is O(n²) because each `+=` creates a new string — `"".join(list_of_strings)` is O(n) because it pre-calculates the total size. Lists over-allocate for amortized O(1) appends; tuples are exact-size.
- **The Unforgettable Mental Model:** The **Factory Assembly Line**. Immutable objects are like mass-produced identical parts — the factory can reuse molds and share inventory. Mutable objects are custom-built — each one is unique and needs its own resources.
- **The Trap:** Thinking `sys.getsizeof()` tells the full memory story. It only measures the container, not the objects it references. A list of 1 million ints reports ~8MB for the list pointers, but the int objects themselves add more memory.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Immutability enables memory optimizations like interning — Python shares references to common immutable objects. For performance, I avoid string concatenation in loops (O(n²)) and use `"".join()` instead (O(n)). I choose tuples over lists for fixed data because they're more memory-efficient and slightly faster to iterate. In data-processing pipelines, I use generators for lazy evaluation to avoid materializing large intermediate lists. When profiling, I look at both container size and referenced object sizes, since `sys.getsizeof()` only tells part of the story."

#### How would you explain mutability with code?
- **The Engine Mechanism (Why it behaves this way):** Demonstrate with `id()` checks. `a = [1, 2]; print(id(a)); a.append(3); print(id(a))` — same id, proving in-place mutation. `s = "hello"; print(id(s)); s += " world"; print(id(s))` — different id, proving new object creation. Show the default argument bug: `def foo(bar=[]); bar.append(1); return bar; foo(); foo()` — returns `[1, 1]` on second call. Show the fix: `def foo(bar=None); bar = bar or []; bar.append(1); return bar`.
- **The Unforgettable Mental Model:** The **ID Card Test**. `id()` is like a social security number — if it stays the same after an operation, the object was mutated in place. If it changes, a new object was created.
- **The Trap:** Not mentioning that `is` checks identity while `==` checks equality. `a = [1]; b = [1]; a == b` is True but `a is b` is False.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate mutability with three code examples. First, the `id()` test — append to a list and show the id stays the same; concat a string and show the id changes. Second, the default argument bug — call a function with `bar=[]` twice and show the list accumulates. Third, the aliasing trap — assign `b = a` for a list, modify `b`, and show `a` changed too. These examples make the abstract concept concrete and show why it matters in real code."

## 8. Active recall test

1. **What is the fundamental difference between mutable and immutable objects?**
   - **Explanation:** Mutable objects can change their value in place (same id, different content). Immutable objects cannot — any "change" creates a new object with a new id.

2. **Why can't you use a list as a dictionary key?**
   - **Explanation:** Dict keys must be hashable, which requires immutability. Lists are mutable, so their hash could change after insertion, breaking the hash table's ability to find them. Use tuple instead.

3. **What is the mutable default argument bug and how do you fix it?**
   - **Explanation:** `def foo(bar=[])` creates one list at function definition time, shared by all calls. Fix: use `def foo(bar=None)` and create the list inside: `bar = bar or []`.

4. **Why is `"".join(strings)` faster than `s += chunk` in a loop?**
   - **Explanation:** Strings are immutable, so `+=` creates a new string each iteration — O(n²) total. `"".join()` pre-calculates total size and builds the result in one pass — O(n).

5. **Does `list.copy()` create a fully independent copy?**
   - **Explanation:** No, it creates a shallow copy. The outer list is new, but elements inside are shared references. Use `copy.deepcopy()` for full independence.

6. **Why are immutable objects thread-safe for reads?**
   - **Explanation:** Since their value cannot change, multiple threads can read the same immutable object simultaneously without risk of seeing inconsistent state. No locks needed for read-only access.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Mutable and Immutable Types with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Mutable and Immutable Types and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Mutable and Immutable Types.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
