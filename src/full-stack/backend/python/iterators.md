# Iterators

## Detailed explanation

Iterators implement `__iter__` and `__next__` to produce values one at a time. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Iterator is an object that knows its next value.

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

In a FastAPI or Django backend, iterators affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What is an iterator in Python?
- **The Engine Mechanism (Why it behaves this way):** An iterator is any object that implements the iterator protocol: `__iter__()` returns the iterator itself, and `__next__()` returns the next value or raises `StopIteration` when exhausted. Iterators are stateful — they track their position and produce values one at a time. Built-in iterables (lists, tuples, dicts, sets, strings) are not iterators themselves but can produce iterators via `iter(obj)`. The `for` loop automatically calls `iter()` on the target and then `__next__()` repeatedly until `StopIteration`. Generators are a convenient way to create iterators without manually implementing the protocol.
- **The Unforgettable Mental Model:** The **Tape Dispenser**. An iterator is like a tape dispenser — you pull one piece at a time, and it remembers where you are. You can't go back (unless you get a new dispenser), and when the tape runs out, you get nothing.
- **The Trap:** Confusing iterables with iterators. A list is iterable (you can call `iter(list)` on it) but not an iterator (it doesn't have `__next__`). An iterator is also iterable (`__iter__` returns itself), but the reverse is not true.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An iterator is an object that implements `__iter__` and `__next__`. `__iter__` returns itself, and `__next__` produces the next value or raises `StopIteration` when done. Iterators are stateful and single-pass — they remember their position and can't be rewound. The `for` loop uses the iterator protocol under the hood. I create iterators either by implementing the protocol manually (for complex state machines) or by using generators (for simple sequences). Understanding the protocol is key to making custom objects work with `for` loops, `list()`, `map()`, and all of Python's iteration tools."

#### What is the difference between iterable and iterator?
- **The Engine Mechanism (Why it behaves this way):** An iterable is any object that implements `__iter__()` (returning an iterator) or `__getitem__()` (supporting integer indexing). An iterator is an object that implements both `__iter__()` and `__next__()`. Every iterator is iterable (because `__iter__` returns itself), but not every iterable is an iterator. `iter([1, 2, 3])` returns a list_iterator — the list is the iterable, the list_iterator is the iterator. You can iterate over a list multiple times (each `for` loop gets a fresh iterator), but you can only iterate over an iterator once.
- **The Unforgettable Mental Model:** The **Book vs. the Bookmark**. An iterable is the book — you can read it multiple times. An iterator is the bookmark — it tracks your current page. Once you've read to the end, the bookmark is at the last page. To read again, you need a new bookmark (new iterator).
- **The Trap:** Passing an iterator to a function that expects an iterable and iterates it multiple times. The second iteration gets nothing because the iterator is already exhausted.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An iterable can produce an iterator — it implements `__iter__`. An iterator produces values — it implements `__iter__` and `__next__`. Lists, dicts, and sets are iterables but not iterators. Generators and file objects are both iterables and iterators. The practical difference: you can iterate over a list many times, but an iterator is single-use. When designing APIs, I accept iterables (not iterators) as parameters so callers can pass lists, generators, or any iterable, and the function can iterate as many times as needed."

#### How does the `for` loop use iterators internally?
- **The Engine Mechanism (Why it behaves this way):** `for x in iterable:` is equivalent to: `iterator = iter(iterable); while True: try: x = next(iterator); ... except StopIteration: break`. Python calls `iter()` to get an iterator, then repeatedly calls `next()` until `StopIteration` is raised. This is why any object implementing the iterator protocol works with `for` loops. The `try/except` is handled by the bytecode — it's not a Python-level try/except, so there's no performance penalty for normal loop termination.
- **The Unforgettable Mental Model:** The **Behind-the-Scenes Puppeteer**. The `for` loop looks simple, but behind the curtain, Python is calling `iter()`, then `next()` in a loop, catching `StopIteration` to know when to stop.
- **The Trap:** Thinking `for` loops work by indexing. They don't — they use the iterator protocol. This is why `for` works on sets (which have no index) and generators (which have no length).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A `for` loop is syntactic sugar for the iterator protocol. Python calls `iter()` on the target to get an iterator, then calls `next()` repeatedly in a loop, catching `StopIteration` to exit. This is why `for` works on any iterable — lists, dicts, sets, generators, files, custom objects. The `StopIteration` is caught at the bytecode level, so there's no performance cost. Understanding this helps me make custom objects work with `for` loops by implementing `__iter__` and `__next__`."

#### What bug can happen if you misunderstand iterators?
- **The Engine Mechanism (Why it behaves this way):** The iterator exhaustion bug: `it = iter(data); max(it); min(it)` — `min()` returns nothing useful because `max()` consumed the iterator. The dict-iterator bug: `for key in my_dict:` iterates over keys, not values or items. To get values, use `my_dict.values()`; for both, use `my_dict.items()`. The mutating-during-iteration bug: `for x in my_list: my_list.remove(x)` — the iterator's internal index gets out of sync with the modified list, skipping elements. The file iterator bug: `for line in file` reads the file to the end; iterating again yields nothing because the file object is its own iterator and the file pointer is at EOF.
- **The Unforgettable Mental Model:** The **One-Way Street**. An iterator is a one-way street — once you've driven past a point, you can't go back. If you need to revisit, you need a new street (new iterator).
- **The Trap:** Iterating over a dict directly when you need values. `for x in my_dict` gives keys, not values. Use `my_dict.values()` or `my_dict.items()`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common iterator bug is exhaustion — passing an iterator to a function that consumes it, then trying to use it again. The fix is to convert to a list first if you need multiple passes. Another bug is mutating a collection while iterating over it — the iterator's position gets confused. I iterate over a copy (`for x in my_list[:]`) or build a new list of items to remove. For dicts, I remember that `for x in my_dict` iterates keys — I use `.values()` or `.items()` when I need more."

#### How do iterators affect performance or memory?
- **The Engine Mechanism (Why it behaves this way):** Iterators are memory-efficient because they produce values on demand without storing them. The iterator itself is small — just the state needed to produce the next value. `range(10**9)` creates an iterator that uses ~50 bytes, not 8GB for a list of 10 billion integers. File iterators read one line at a time, not the entire file. However, iterators have per-item overhead from `__next__()` calls. For tight loops over small collections, direct indexing or list iteration is faster. The `itertools` module provides optimized C-level iterators that are faster than Python-level loops.
- **The Unforgettable Mental Model:** The **Faucet vs. the Bathtub**. An iterator is a faucet — water flows on demand, no storage needed. A list is a bathtub — you fill it all at once, then use it. The faucet uses less space but requires the water source to be available.
- **The Trap:** Using iterators for random access. Iterators are sequential — to get the 1000th item, you must consume the first 999. Use lists or arrays for random access.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Iterators are memory-efficient — they produce values on demand without storing them. `range(10**9)` uses ~50 bytes, not gigabytes. File iterators read one line at a time. But iterators are sequential — no random access, no length, no rewinding. For random access, I use lists or arrays. For sequential processing of large data, I use iterators. I also leverage `itertools` for optimized C-level iterator operations like `chain`, `islice`, `groupby`, and `product` — they're faster than equivalent Python loops."

#### How would you explain iterators with code?
- **The Engine Mechanism (Why it behaves this way):** Show the protocol: `class Counter: def __init__(self, n): self.n = n; self.current = 0; def __iter__(self): return self; def __next__(self): if self.current >= self.n: raise StopIteration; self.current += 1; return self.current`. Show `for` loop equivalent: `it = iter([1, 2, 3]); while True: try: x = next(it); print(x); except StopIteration: break`. Show iterator exhaustion: `it = iter([1, 2, 3]); list(it); list(it)` — second is empty. Show `itertools`: `from itertools import islice; list(islice(infinite_iter, 5))`.
- **The Unforgettable Mental Model:** The **From-Scratch Demo**. Building a custom iterator class from scratch shows exactly what `__iter__` and `__next__` do, making the protocol concrete.
- **The Trap:** Not showing that `iter()` on an iterator returns itself. This is a key part of the protocol — iterators are self-iterable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate iterators with three examples. First, a custom `Counter` class implementing `__iter__` and `__next__` to show the protocol. Second, the `for` loop desugaring to show how Python uses iterators internally. Third, iterator exhaustion — calling `list()` twice on the same iterator shows the second call returns empty. I also mention `itertools` as the standard library's iterator toolkit — functions like `chain`, `islice`, and `groupby` that compose iterators efficiently."

## 8. Active recall test

1. **What methods must an iterator implement?**
   - **Explanation:** `__iter__()` (returns the iterator itself) and `__next__()` (returns the next value or raises `StopIteration` when exhausted).

2. **What is the difference between an iterable and an iterator?**
   - **Explanation:** An iterable can produce an iterator (`__iter__`). An iterator produces values (`__iter__` + `__next__`). Every iterator is iterable, but not every iterable is an iterator. Lists are iterable but not iterators; generators are both.

3. **What happens when you iterate over an iterator twice?**
   - **Explanation:** The second iteration yields nothing because the iterator is already exhausted. Iterators are single-pass — they track position and can't be rewound.

4. **How does a `for` loop work internally?**
   - **Explanation:** It calls `iter()` on the target to get an iterator, then calls `next()` repeatedly in a loop, catching `StopIteration` to exit. Equivalent to: `it = iter(obj); while True: try: x = next(it); ... except StopIteration: break`.

5. **Why is `range(10**9)` memory-efficient?**
   - **Explanation:** `range` returns an iterator that computes values on demand using a formula (start + step * index). It doesn't store 10 billion integers — it stores just start, stop, step, and current position (~50 bytes).

6. **What happens if you modify a list while iterating over it?**
   - **Explanation:** The iterator's internal index gets out of sync with the modified list, causing elements to be skipped. Iterate over a copy (`for x in my_list[:]`) or build a separate list of items to remove.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Iterators with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Iterators and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Iterators.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
