# Iterators and Iterables in Python: The Iteration Protocol, `__iter__`, and `__next__`

## 1. Why This Exists — The Problem First

Imagine building a backend microservice that processes high-throughput audit logs, database cursor streams, and paginated third-party REST API feeds. Without a universal, language-level iteration contract, every library and data structure would invent its own arbitrary traversal API. One vendor client would expose `.has_next()` and `.get_next()`, a database driver would require `.fetch_one()`, a custom ring buffer would require manually tracking integer index offsets in a `while` loop, and a queue would require `.pop()`.

This fragmentation breaks Python's core idioms:
- You cannot write a standard `for item in stream:` loop across heterogeneous data sources.
- Built-in language features like sequence unpacking (`first, *rest = stream`), list comprehensions (`[x.id for x in stream]`), and reducer functions (`any()`, `all()`, `sum()`, `max()`) fail because they cannot predict how your custom object exposes its data.
- Standard streaming toolkits like `itertools` cannot compose or transform your objects.
- Developers often react by loading entire datasets into an in-memory `list` just to make them loop-compatible. If a database query returns ten million rows or a log stream is infinite, holding that collection in memory instantly triggers Out-Of-Memory (OOM) process termination in containerized production environments.

Python resolves this by establishing the **Iteration Protocol**: a formal, two-method interface (`__iter__` and `__next__`) that separates the data container (**Iterable**) from the stateful cursor traversing it (**Iterator**). This enables lazy, on-demand evaluation where billion-row datasets are processed in constant $O(1)$ memory.

## 2. The Analogy — Make It Obvious

Think of an **Iterable** as a printed novel sitting on a library shelf, and an **Iterator** as a sticky bookmark placed on a specific sentence.

- **The Book (The Iterable):** The book contains the full story, fixed and unchanging. It does not track who is reading it or what page anyone is on. Fifty different readers can walk up to the same book, grab their own sticky bookmarks, and read through the pages independently.
- **The Sticky Bookmark (The Iterator):** The bookmark holds exact, mutable state: the current page and line number. When you tell the bookmark "read next sentence" (`__next__()`), it reads the sentence under its pointer and advances forward by one line.
- **Exhaustion (`StopIteration`):** When the bookmark reaches the final word of the final chapter, it hits the back cover. If you ask it for the next sentence again, it raises its hands and says "there is nothing left" (`StopIteration`). The bookmark is permanently spent. You cannot rewind it.
- **Fresh Passes:** If you want to read the book a second time from page one, you do not try to rewind the exhausted bookmark. You go back to the book and ask for a brand-new bookmark (`iter(book)` / `book.__iter__()`).

Some objects in Python (like open file handles, live network sockets, and generator expressions) are like live radio broadcasts: they are both the broadcast and the receiver bookmark at the same time. Once the broadcast airs, the stream is spent forever.

## 3. How It Actually Works — The Full Explanation

The Python iteration protocol consists of two distinct roles defined by dunder (double-underscore) methods:

```txt
┌────────────────────────────────────────────────────────────────────────┐
│                               Iterable                                 │
│  - Implements: __iter__() -> returns a fresh Iterator instance         │
│  - Legacy fallback: __getitem__(index) from 0 to IndexError            │
│  - Examples: list, tuple, dict, set, str, range, custom collections    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         iter(obj)  │ invokes __iter__()
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                               Iterator                                 │
│  - Implements: __next__() -> returns next value or raises StopIteration│
│  - Implements: __iter__() -> returns `self` (self-iterable)            │
│  - Stateful, single-pass, consumable                                   │
│  - Examples: list_iterator, generator, enumerate, zip, file object    │
└────────────────────────────────────────────────────────────────────────┘
```

The Iterable Contract: An object is iterable if it can supply an iterator. It implements `__iter__()`, which must return a new iterator object. If `__iter__` is not defined, Python checks for the legacy sequence protocol: `__getitem__()` taking integer indices starting from `0`. If `__getitem__` is present, Python constructs a built-in iterator that accesses index `0`, `1`, `2`... until an `IndexError` is raised.

The Iterator Contract: An object is an iterator if it satisfies two requirements:
- `__next__()`: Returns the next element in the sequence. When no elements remain, it must raise the built-in `StopIteration` exception.
- `__iter__()`: Returns `self`. This rule is vital: it guarantees that any iterator is itself an iterable, allowing iterators to be passed directly to `for` loops, `zip()`, `islice()`, or nested function calls.

How `for item in sequence:` Works Under the Hood:

When Python executes a `for` loop, it does not use index-based counting. It compiles directly to dedicated CPython virtual machine bytecode instructions:

1. `GET_ITER`: Evaluates the target expression, calls `iter(target)` (invoking `PyObject_GetIter` in the C API), and pushes the resulting iterator onto the evaluation stack.
2. `FOR_ITER <offset>`: Calls `__next__()` on the iterator (via `PyIter_Next`). If a value is returned, it pushes the value to the stack and executes the loop block. If `StopIteration` is raised, CPython catches and clears the exception internally at the C level and jumps directly to `<offset>`, skipping the loop body and continuing execution.

The high-level `for` loop is equivalent to this exact Python logic:

```python
# What you write:
for item in data_source:
    process(item)

# What CPython actually executes under the hood:
_iterator = iter(data_source)  # Calls data_source.__iter__()
while True:
    try:
        item = next(_iterator)  # Calls _iterator.__next__()
    except StopIteration:
        break  # Clean exit when stream is exhausted
    process(item)
```

Because `StopIteration` is handled directly in CPython's evaluation loop, loop termination has no Python-level exception-handling overhead.

Iterators are Stateful, Lazy, and Consumable:

- Memory Efficiency ($O(1)$ Space): Containers like `list(range(10_000_000))` allocate approximately 80 megabytes of memory to store ten million integer references up front. An iterator over that same range calculates each integer on-the-fly inside `__next__()`, requiring only ~48 bytes of state (start, stop, step, and current position) regardless of whether the range spans ten numbers or ten trillion.
- Single-Pass Exhaustion: Iterators maintain an internal pointer. As values are produced, that pointer moves monotonically forward. Once an iterator raises `StopIteration`, it is exhausted. Calling `next()` on an exhausted iterator must continue raising `StopIteration`.
- Containers vs. Streams: Built-in collection types (`list`, `dict`, `set`, `tuple`, `str`) are iterables, not iterators. Calling `iter(my_list)` creates a fresh `list_iterator` object every time, leaving the list untouched. Streaming objects (open files, network sockets, generators) are their own iterators (`file.__iter__() is file`), meaning iterating over them once exhausts the underlying stream permanently.

The Two-Argument `iter(callable, sentinel)` Form:

Python provides a specialized built-in form of `iter()`: `iter(callable, sentinel)`. Instead of accepting a data container, it takes a zero-argument callable and a `sentinel` value. Every call to `__next__()` invokes the callable. When the return value matches `sentinel`, `StopIteration` is raised immediately. This pattern eliminates boilerplate `while True` loops when reading fixed-size blocks from files, consuming database cursors, or reading from sockets.

Composing Iterators with `itertools`:

Python's standard library module `itertools` provides high-performance, C-implemented primitives for streaming pipelines:
- `islice(iterable, start, stop[, step])`: Slices an iterator lazily without consuming or storing earlier elements in memory.
- `chain(*iterables)`: Lazily concatenates multiple independent iterables into a single continuous stream.
- `cycle(iterable)`: Caches elements from an iterable on the first pass and replays them in an infinite loop.
- `groupby(iterable, key_func)`: Groups consecutive elements sharing the same computed key (requires the input stream to be pre-sorted by that key).

## 4. Real Code — See It Working

Building a Separate Iterable and Iterator (Sliding Window):

To support multiple independent iterations over the same collection without shared state corruption, the iterable and the iterator must be separate classes.

```python
from collections.abc import Iterable, Iterator
from typing import TypeVar

T = TypeVar("T")


class SlidingWindowIterator(Iterator[tuple[T, ...]]):
    """Stateful iterator: tracks cursor position over an underlying sequence."""

    def __init__(self, data: list[T], window_size: int) -> None:
        self._data = data
        self._window_size = window_size
        self._cursor = 0  # Internal state: tracks the start index of the current window

    def __next__(self) -> tuple[T, ...]:
        # When the window exceeds the data boundary, exhaust the iterator
        if self._cursor + self._window_size > len(self._data):
            raise StopIteration

        window = tuple(self._data[self._cursor : self._cursor + self._window_size])
        self._cursor += 1  # Advance the cursor for the next __next__() invocation
        return window


class SlidingWindow(Iterable[tuple[T, ...]]):
    """Iterable container: produces fresh, independent iterators on demand."""

    def __init__(self, data: list[T], window_size: int) -> None:
        if window_size <= 0:
            raise ValueError("Window size must be greater than 0")
        self._data = data
        self._window_size = window_size

    def __iter__(self) -> SlidingWindowIterator[T]:
        # Crucial design requirement: return a NEW iterator instance every time
        return SlidingWindowIterator(self._data, self._window_size)


# Usage: Multiple loops run independently without interfering with each other
stream = SlidingWindow([10, 20, 30, 40, 50], window_size=3)

# First pass produces 3 windows: (10, 20, 30), (20, 30, 40), (30, 40, 50)
print(list(stream))

# Second pass works immediately because stream.__iter__() creates a fresh iterator
nested_pairs = [(w1, w2) for w1 in stream for w2 in stream]
print(f"Generated {len(nested_pairs)} nested window combinations.")  # 3 * 3 = 9
```

Streaming Paginated API Records Lazily:

This custom iterator lazily fetches remote HTTP pages on demand as the caller requests items, preventing memory bloat and avoiding unnecessary network calls if iteration stops early.

```python
from collections.abc import Iterator
from typing import Any, Callable


class PaginatedAPIIterator(Iterator[dict[str, Any]]):
    """Streams individual records from a remote paginated API on demand."""

    def __init__(
        self,
        fetch_page_fn: Callable[[int], dict[str, Any]],
        start_page: int = 1,
    ) -> None:
        self._fetch_page_fn = fetch_page_fn
        self._current_page = start_page
        self._buffer: list[dict[str, Any]] = []
        self._exhausted = False

    def __next__(self) -> dict[str, Any]:
        # If our in-memory buffer has items, serve the next record immediately
        if self._buffer:
            return self._buffer.pop(0)

        # If the remote endpoint has no more pages, signal completion
        if self._exhausted:
            raise StopIteration

        # Buffer is empty: fetch the next page from the network
        response = self._fetch_page_fn(self._current_page)
        records = response.get("data", [])
        has_more = response.get("has_more", False)

        if not records:
            self._exhausted = True
            raise StopIteration

        self._current_page += 1
        self._exhausted = not has_more

        # Populate buffer and return the first record of the fresh page
        self._buffer = records
        return self._buffer.pop(0)


# Mock API fetcher function
def mock_api(page: int) -> dict[str, Any]:
    print(f"  [Network] Fetching page {page}...")
    if page > 2:
        return {"data": [], "has_more": False}
    return {
        "data": [{"id": (page - 1) * 2 + 1}, {"id": (page - 1) * 2 + 2}],
        "has_more": page < 2,
    }


# Lazily consume only what is needed:
reader = PaginatedAPIIterator(fetch_page_fn=mock_api)

print("Reading first 3 items:")
for index, record in enumerate(reader):
    print(f"Received record: {record}")
    if index == 2:
        print("Stopping early — remaining remote pages are never fetched!")
        break
```

Two-Argument `iter(callable, sentinel)` for Binary/Stream I/O:

```python
import io

# Simulate a 36-byte raw TCP stream or file buffer
raw_payload = b"HEADER_TOKEN_01;PAYLOAD_DATA_02;END_OF_TRANS_99;"
socket_mock = io.BytesIO(raw_payload)

# Stream 16-byte fixed blocks until the stream returns empty bytes b""
BLOCK_SIZE = 16
stream_iterator = iter(lambda: socket_mock.read(BLOCK_SIZE), b"")

for chunk_index, chunk in enumerate(stream_iterator, start=1):
    print(f"Chunk {chunk_index} ({len(chunk)} bytes): {chunk}")
```

Composing Pipelines with `itertools`:

```python
import itertools

# 1. islice: Extract elements without loading the entire stream into memory
counter = itertools.count(start=100, step=10)  # Infinite: 100, 110, 120, 130...
first_four = list(itertools.islice(counter, 4))
print(f"islice result: {first_four}")  # [100, 110, 120, 130]

# 2. chain: Seamlessly iterate over multiple heterogeneous iterables as one stream
primary_cache = ["user_1", "user_2"]
fallback_db = ("user_3", "user_4")
combined_stream = itertools.chain(primary_cache, fallback_db)
print(f"chain result: {list(combined_stream)}")  # ['user_1', 'user_2', 'user_3', 'user_4']

# 3. groupby: Group consecutive elements (stream must be sorted by the group key)
transactions = [
    {"user": "alice", "amount": 50},
    {"user": "alice", "amount": 75},
    {"user": "bob", "amount": 120},
    {"user": "charlie", "amount": 30},
]

for user, user_txs in itertools.groupby(transactions, key=lambda x: x["user"]):
    total = sum(tx["amount"] for tx in user_txs)
    print(f"User {user} total spend: ${total}")
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact difference between an Iterable and an Iterator in Python?**

An iterable is any object that can produce an iterator. It implements `__iter__()` (or the fallback `__getitem__()`), returning a new iterator object. Examples include `list`, `dict`, `set`, `tuple`, `str`, and `range`. An iterable itself does not produce items on demand and does not track traversal state; calling `next()` on a list raises a `TypeError: 'list' object is not an iterator`.

An iterator is the stateful cursor that produces items sequentially. It implements both `__next__()` (which computes the next item or raises `StopIteration`) and `__iter__()` (which returns `self`). Iterators are single-pass and consumable. Every iterator is an iterable, but most iterables are not iterators.

**Q: Why must an iterator's `__iter__()` method return `self`? What breaks if it does not?**

An iterator must return `self` from `__iter__()` so that it adheres to the Iterable interface. Functions and language constructs like `for item in it:`, `zip(it1, it2)`, `enumerate(it)`, and `itertools.islice(it, 5)` begin by calling `iter(argument)` on every input passed to them.

If an iterator does not implement `__iter__()` returning `self`, passing an existing iterator into another `for` loop, helper function, or `itertools` pipeline would fail immediately with `TypeError: 'MyIterator' object is not iterable`. Returning `self` allows partially consumed iterators to be passed around and composed across different functions seamlessly.

**Q: What happens under the hood when Python executes `for x in sequence:` at the bytecode level?**

CPython compiles the `for` loop into two core virtual machine opcodes:
1. `GET_ITER`: Pops `sequence` off the stack, invokes its C-level slot `tp_iter` (equivalent to `iter(sequence)`), and pushes the resulting iterator onto the stack.
2. `FOR_ITER`: Calls the iterator's `tp_iternext` slot (equivalent to `next(iterator)`). If an element is returned, it pushes the element to the stack and executes the loop body. When the iterator raises `StopIteration`, CPython intercepts the exception at the C evaluation loop level without creating Python-level exception tracebacks, pops the exhausted iterator, and jumps directly to the instruction past the loop block.

**Q: What is the difference between `range(10_000_000)` and `list(range(10_000_000))` in terms of memory and iteration behavior?**

In Python 3, `range(10_000_000)` returns a lazy sequence object (an iterable). It does not allocate memory for ten million numbers; it stores only three integer attributes (`start`, `stop`, `step`), taking roughly 48 bytes of memory regardless of the range size. It computes numbers mathematically upon request during iteration and supports $O(1)$ membership testing (`x in range(...)`) and $O(1)$ indexing (`range(...)[500]`).

In contrast, `list(range(10_000_000))` consumes the entire range immediately and creates a contiguous array of ten million pointer references in RAM, allocating ~80 megabytes of memory.

**Q: How does the two-argument `iter(callable, sentinel)` work, and why is it preferred over manual `while True` loops?**

`iter(callable, sentinel)` builds an iterator that repeatedly invokes the provided zero-argument `callable` on every call to `__next__()`. As long as the returned value is not equal to `sentinel`, that value is yielded. The moment the callable returns a value equal to `sentinel`, the iterator raises `StopIteration`.

It is preferred because it turns procedural, error-prone `while True` read loops with nested break conditions into clean, idiomatic single-pass iterators. This iterator can then be piped directly into list comprehensions, `sum()`, `islice()`, or `for` loops without writing manual buffer checks.

**Q: What bug occurs when you call `min(it)` followed by `max(it)` on the same iterator `it`?**

`min(it)` consumes the iterator from its current position to the very end to find the smallest element, raising `StopIteration` when finished. When `max(it)` is evaluated immediately afterward, the iterator is already exhausted, so `max()` raises `ValueError: max() arg is an empty sequence` (or returns a default value if one was provided).

To compute multiple aggregations over streaming data, you must either convert the iterator to an in-memory collection first (`data = list(it)`), iterate over a reusable iterable container, or compute both statistics in a single pass using a single loop.

**Q: How does Python maintain backwards compatibility with objects that do not implement `__iter__`?**

If an object does not define `__iter__`, `iter(obj)` falls back to checking for the legacy sequence method `__getitem__()`. If `__getitem__` is implemented, Python creates an internal C-level sequence iterator (`PySeqIter_Type`) that attempts to access `obj[0]`, `obj[1]`, `obj[2]`, and so on, incrementing the index by 1 on each step. The loop terminates automatically when `obj[index]` raises an `IndexError`. If neither `__iter__` nor `__getitem__` is implemented, `iter(obj)` raises `TypeError: 'ClassName' object is not iterable`.

## 6. The Traps — What Goes Wrong

### Trap 1: Combining Iterable and Iterator State in the Same Class

A common design flaw is implementing `__next__` directly on a custom container class and having `__iter__` return `self`.

```python
# BROKEN IMPLEMENTATION:
class FaultyDataset:

    def __init__(self, items: list[str]) -> None:
        self._items = items
        self._index = 0

    def __iter__(self):
        return self  # BUG: Returns self instead of a fresh iterator

    def __next__(self):
        if self._index >= len(self._items):
            raise StopIteration
        val = self._items[self._index]
        self._index += 1
        return val


dataset = FaultyDataset(["A", "B", "C"])

# Nested loop fails silently:
pairs = []
for x in dataset:
    for y in dataset:
        pairs.append((x, y))

# Expected: 9 pairs (3x3).
# Actual: Only [('A', 'B'), ('A', 'C')] (2 pairs total)!
# Why: The inner loop consumed the single shared cursor `_index` to exhaustion during the first iteration.
# Fix: Separate the container (Iterable) from the cursor (Iterator), returning a new Iterator instance in __iter__().
```

### Trap 2: Mutating a Collection While Iterating Over It

Modifying a list or dictionary while actively iterating over it corrupts the iterator's internal index or hash-table cursor.

```python
# BROKEN: Modifying a list during iteration skips elements
numbers = [1, 2, 3, 4, 5, 6]
for num in numbers:
    if num % 2 == 0:
        numbers.remove(num)  # Modifies underlying array in place

print(numbers)  # Prints [1, 3, 5, 6] -> 6 was skipped because index shifted!

# BROKEN: Mutating a dictionary raises RuntimeError
cache = {"a": 1, "b": 2, "c": 3}
for k in cache:
    if k == "b":
        del cache[k]  # Raises RuntimeError: dictionary changed size during iteration

# FIX: Iterate over a shallow copy or use a comprehension:
numbers = [n for n in numbers if n % 2 != 0]
cache = {k: v for k, v in cache.items() if k != "b"}
```

### Trap 3: Accidentally Consuming an Iterator Inside a Debug Logger or Check

Passing an iterator to `bool()`, `len()`, or a logging statement can exhaust or alter the stream before business logic executes.

```python
def process_stream(records_iter):
    # Attempting to check length or log contents
    # print(f"Processing records: {list(records_iter)}")  # BUG: Completely empties records_iter!

    for record in records_iter:
        # If the print statement above ran, this loop executes ZERO times!
        save_to_db(record)
```

### Trap 4: Iterating Directly Over a Dictionary Expecting Key-Value Tuples

Iterating directly over a `dict` yields its keys, not `(key, value)` pairs or values.

```python
user_scores = {"alice": 95, "bob": 88}

# WRONG assumption:
# for name, score in user_scores:  # Raises ValueError: too many values to unpack (expected 2, got 5 chars of 'alice')

# CORRECT:
for name, score in user_scores.items():
    print(f"{name}: {score}")
```

### Trap 5: Misusing `itertools.groupby` on Unsorted Data

Unlike SQL `GROUP BY`, `itertools.groupby` only groups consecutive elements with matching keys.

```python
import itertools

raw_data = [("A", 1), ("B", 2), ("A", 3)]

# WRONG: Unsorted input creates multiple split groups for 'A'
groups = {k: list(v) for k, v in itertools.groupby(raw_data, key=lambda x: x[0])}
# Result: {'A': [('A', 3)], 'B': [('B', 2)]} -> The first ('A', 1) was overwritten and lost!

# FIX: Sort the data by the grouping key before calling groupby
sorted_data = sorted(raw_data, key=lambda x: x[0])
valid_groups = {
    k: list(v) for k, v in itertools.groupby(sorted_data, key=lambda x: x[0])
}
# Result: {'A': [('A', 1), ('A', 3)], 'B': [('B', 2)]}
```

## 7. Compare With Related Concepts

| Concept | What It Is | State & Reusability | Memory Footprint | Primary Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Iterable** (`__iter__`) | A data container or source that produces fresh iterators. | Reusable across multiple independent loops. | Depends on container ($O(N)$ for lists, $O(1)$ for `range`). | Exposing collections for standard iteration. |
| **Iterator** (`__iter__` + `__next__`) | A stateful cursor pointing to a specific position in a sequence. | Single-pass; permanently exhausted when done. | Constant $O(1)$ (evaluates on demand). | Streaming large or infinite sequences lazily. |
| **Generator** (`yield` / expressions) | A syntactic function that produces an iterator via compiler magic. | Single-pass iterator; suspends execution frame. | Constant $O(1)$. | Writing clean streaming logic without class boilerplate. |
| **Sequence** (`__getitem__` + `__len__`) | A container supporting integer index lookups and length. | Reusable; supports random access ($O(1)$ lookup). | Linear $O(N)$ (all elements in memory). | Indexing, slicing, reverse traversal, and random access. |

### Key Decision Rules
- **Iterable vs. Iterator:** If you need callers to be able to iterate over the data multiple times independently, create an **Iterable** that returns fresh iterators. If you are tracking the progress of an active stream, you are building an **Iterator**.
- **Custom Iterator Class vs. Generator (`yield`):** Use a **generator function** for 95% of streaming tasks because Python manages `__iter__`, `__next__`, and `StopIteration` automatically. Use a **custom iterator class** only when you need explicit public methods, inspectable state attributes, or complex lifecycle controls.
- **Iterator vs. Sequence/List:** Use an **Iterator** when the dataset is too large for RAM or is produced asynchronously/lazily. Use a **List/Sequence** when you require random access by index (`data[i]`), slicing (`data[1:4]`), length querying (`len(data)`), or repeated iterations.

## 8. 🧠 The Memory Hook

An **Iterable** is the printed book on the library shelf; an **Iterator** is the sticky bookmark that reads one sentence at a time and can only move forward. When the bookmark hits the back cover, it is exhausted forever—if you want to read again, you never rewind the bookmark, you ask the book for a brand-new one.
