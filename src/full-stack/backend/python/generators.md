# Generators in Python: Lazy Evaluation, Frame Suspension, and Memory-Efficient Pipelines

## 1. Why This Exists — The Problem First

Imagine an analytics worker in production tasked with parsing a 20GB web server access log file. A developer writes the ingestion script using standard file reading idioms:

```python
with open("access.log", "r") as f:
    lines = f.readlines()  # Reads every line into memory at once
    parsed_records = [parse_line(line) for line in lines]
    suspicious_ips = [r["ip"] for r in parsed_records if r["status"] == 403]
```

When this runs in a Docker container with a 4GB memory limit, the process crashes instantly. It does not raise a standard Python exception that your application can catch. The Linux kernel Out-Of-Memory (OOM) killer steps in, sends `SIGKILL` (`kill -9`), and terminates the worker without warning.

The failure happens because eager data structures like lists, sets, and tuples require all elements to exist simultaneously in physical RAM. A 20GB text file does not just consume 20GB of memory in Python—each line is instantiated as a `PyUnicodeObject` with pointer arrays and object header overhead, easily ballooning memory usage to 35GB or more. Creating intermediate transformed lists like `parsed_records` multiplies that allocation again.

Throwing more RAM at the machine is an expensive band-aid that fails the moment traffic spikes to 100GB of logs. The root problem is the evaluation strategy: loading the entire dataset when you only need to inspect one record at a time.

Generators solve this fundamental problem. Instead of computing an entire collection upfront (eager evaluation), generators produce items on demand, one at a time (lazy evaluation). The execution state pauses between items, allowing a 20GB, 500GB, or even infinitely long data stream to be parsed and transformed with a flat, constant memory footprint of less than 10MB.

## 2. The Analogy — Make It Obvious

Think of eager evaluation (lists) as a massive wedding catering buffet, and a generator as a personal sushi chef.

At a banquet buffet:
- The kitchen cooks all 500 meals before any guest enters the hall.
- You must rent a massive room with dozens of long tables just to hold the 500 plates simultaneously.
- If only 3 guests show up, 497 dishes were cooked, plated, and paid for in advance, wasting kitchen time and table space.
- If 5,000 guests show up, the dining hall runs out of floor space (OOM crash) before anyone takes a single bite.

Now consider the personal sushi chef:
- You sit down at the counter. The chef has raw ingredients stored away in a compact cooler, but nothing is pre-plated.
- You say, "Next piece, please."
- The chef slices a piece of tuna, shapes the rice, and sets one piece of sushi on your plate.
- The chef then pauses mid-motion, hands hovering over the counter, remembering exactly which knife was used and where the cutting board was left.
- You chew and swallow the piece. Only when your plate is completely empty do you say, "Next piece, please."
- The chef resumes, prepares the second piece, places it down, and pauses again.

In this analogy:
- Calling the generator function is hiring the chef. No cooking happens yet; the chef simply stands by at the counter.
- Calling `next()` is your voice asking for the next piece of sushi.
- `yield` is placing one completed piece on the plate and freezing execution.
- The chef's frozen posture and memory of the knife position is the heap-allocated frame object preserving local variables and the instruction pointer.
- The single plate in front of you is your application's RAM: it only ever holds one item at any moment in time.
- When the ingredients run out, the chef bows and says dinner is finished (`StopIteration`).

## 3. How It Actually Works — The Full Explanation

To master generators in Python, you must look past the syntax of `yield` and understand what CPython does to function frames on the heap.

```txt
Regular Function:
Caller ---> invokes f() ---> Creates Stack Frame ---> Runs to return/end ---> Frame Destroyed ---> Returns Value

Generator Function:
Caller ---> invokes g() ---> Compiles with CO_GENERATOR ---> Returns PyGenObject (No code executed yet)
Caller ---> next(g)     ---> Injects Frame into Evaluator ---> Runs to yield ---> Frame Suspended (f_lasti saved) ---> Yields Value
Caller ---> next(g)     ---> Restores Suspended Frame     ---> Resumes at f_lasti + 1 ---> Runs to next yield/return
```

**Generator Functions vs. Regular Functions**

When CPython compiles a function, the presence of the `yield` or `yield from` keyword changes how the code object is flagged. The compiler sets the `CO_GENERATOR` bit flag in `func.__code__.co_flags`.

When you call a standard function, CPython creates a call frame on the execution stack, executes the bytecode from start to finish, returns the result, and tears down the stack frame.

When you call a generator function, CPython checks for the `CO_GENERATOR` flag. If present, CPython executes zero lines of the function body. Instead, it wraps the function's code object, local variable space, and execution environment into a generator iterator object (`PyGenObject`) and immediately returns it to the caller.

**Frame Object Suspension on the Heap**

In lower-level languages like C, stack frames are strictly allocated on a contiguous hardware call stack. When a function finishes or returns, the stack pointer moves back down, invalidating that frame.

CPython is different: execution frames (`PyFrameObject`) are allocated as objects on the heap. Because the frame lives on the heap, Python can detach the frame from the active execution thread without destroying it.

When execution inside a generator encounters a `yield` statement:
1. The `YIELD_VALUE` bytecode instruction evaluates the expression next to `yield` and pushes that value to the caller.
2. CPython records the exact instruction offset in the frame's `f_lasti` (last instruction index) field.
3. The frame's entire local variable dictionary, evaluation stack, and exception state are kept intact on the heap.
4. The generator object's internal state is marked as suspended (`GEN_SUSPENDED`).
5. Control drops back to whoever called `next()`.

When the caller invokes `next()` again:
1. CPython verifies the generator is in `GEN_SUSPENDED` state and transitions it to `GEN_RUNNING`.
2. It restores the heap frame back into the interpreter loop.
3. Execution resumes at the instruction immediately following `f_lasti`, with all local variables preserving the exact state they held prior to the pause.

**The Full Generator Protocol: next, send, throw, and close**

Python generators are not merely one-way output streams; they are full coroutine primitives supporting bidirectional communication through four methods:

1. `next(gen)` or `gen.__next__()`: Resumes execution and runs until the next `yield` expression, returning the yielded value.
2. `gen.send(value)`: Resumes execution and sends a value into the generator. The expression `x = yield output` evaluates to `value` inside the generator. Calling `next(gen)` is functionally identical to calling `gen.send(None)`. A freshly created generator must always be primed with `next(gen)` or `gen.send(None)` before sending a non-None value, because execution must advance to the first `yield` before an assignment target exists.
3. `gen.throw(exc_type, exc_val, exc_tb)`: Injects an exception into the generator at the point of suspension. If the generator has a `try...except` block wrapping that `yield`, it can handle the exception and continue. Otherwise, the exception bubbles out to the caller.
4. `gen.close()`: Raises a `GeneratorExit` exception inside the generator at the suspension point. If the generator has a `finally` block, it executes cleanup logic (closing file handles, releasing locks, returning DB connections). If the generator attempts to yield another value after catching `GeneratorExit`, Python raises a `RuntimeError`.

**How StopIteration Signals Termination**

When a generator reaches the end of its body or encounters an explicit `return` statement:
1. The generator state transitions to `GEN_CLOSED`.
2. CPython raises a `StopIteration` exception.
3. If the generator returned a value (e.g., `return "summary_data"`), CPython stores that value inside the `value` attribute of the `StopIteration` instance (`exc.value`).
4. Standard iteration tools like `for` loops, `list()`, and comprehension constructs catch `StopIteration` under the hood and terminate the loop cleanly without exposing the exception to user code.

**Sub-generator Delegation with yield from (PEP 380)**

Before Python 3.3, if a generator wanted to delegate work to a child generator, you had to write a manual forwarding loop:

```python
# The manual, broken way
def delegator():
    for item in sub_generator():
        yield item
```

This manual loop has severe defects: it does not forward `.send()` values into the sub-generator, does not forward `.throw()` or `.close()` calls, and cannot easily capture the child generator's `return` value.

PEP 380 introduced `yield from`, which establishes a direct, bidirectional communication channel between the outermost caller and the innermost sub-generator:

```python
# The robust PEP 380 way
def delegator():
    return_value = yield from sub_generator()
```

Under `yield from`:
- Values produced by `sub_generator()` are yielded directly to the caller.
- Any values passed via `.send()` by the caller bypass the delegating generator and are passed straight into `sub_generator()`.
- Exceptions injected via `.throw()` or `.close()` pass straight into `sub_generator()`.
- When `sub_generator()` terminates with a `return value` statement, `yield from` unpacks `StopIteration.value` and assigns it directly to `return_value`.

**Composable Generator Pipelines**

Generators compose like Unix pipes (`cat | grep | awk | sort`). You chain generator functions where each stage takes an iterable as input and yields transformed elements one by one.

Data flows through the pipeline in a pull-based fashion: the final consumer requests one item, which pulls an item through the filter, which pulls an item through the parser, which reads one line from the source file. Memory consumption remains bounded by a single record throughout the entire pipeline.

**Generator Expressions vs. List Comprehensions**

Python provides syntax parity between eager and lazy collection construction:
- List Comprehension: `[transform(x) for x in data if condition(x)]`
- Generator Expression: `(transform(x) for x in data if condition(x))`

The list comprehension allocates the complete list in memory immediately. The generator expression produces an anonymous generator object with roughly 100 to 200 bytes of fixed overhead, evaluating each item strictly on demand.

## 4. Real Code — See It Working

Let us look at production-grade implementations demonstrating lifecycle mechanics, streaming pipelines, bidirectional communication, and sub-generator delegation.

**1. Frame Lifecycle and Bidirectional Communication (send, throw, close)**

```python
import sys


def bidirectional_worker():
    """Demonstrates frame suspension, receiving values via send(),

    handling injected exceptions, and cleanup on close().
    """
    print("Worker: Initializing and waiting for first task...")
    received = yield "STATUS: READY"

    try:
        while True:
            # Execution pauses here. When send(val) is called,
            # 'received' captures that value and execution continues.
            print(f"Worker: Processing payload -> {received}")
            response = f"PROCESSED: {received.upper()}"
            received = yield response
    except ValueError as e:
        print(f"Worker: Caught injected error -> {e}")
        yield "STATUS: RECOVERED"
    finally:
        # Runs when gen.close() is called or generator is garbage collected
        print("Worker: Executing cleanup (closing sockets, releasing locks)...")


# --- Driving the generator step-by-step ---

worker = bidirectional_worker()

# Step 1: Prime the generator (advances to the first yield)
initial_status = next(worker)
print(f"Caller received: {initial_status}\n")

# Step 2: Send data into the suspended frame
res1 = worker.send("order_batch_01")
print(f"Caller received: {res1}\n")

res2 = worker.send("order_batch_02")
print(f"Caller received: {res2}\n")

# Step 3: Inject an exception into the generator
res3 = worker.throw(ValueError, "Malformed payload format")
print(f"Caller received: {res3}\n")

# Step 4: Explicitly close the generator to trigger finally block
worker.close()
```

**2. High-Throughput Streaming Log Pipeline with Batching**

```python
from collections.abc import Generator, Iterable
import re
from typing import Any

# Regex to parse Nginx combined access log lines
LOG_PATTERN = re.compile(
    r'(?P<ip>[\d\.]+)\s+-\s+-\s+\[(?P<time>[^\]]+)\]\s+"(?P<method>\w+)\s+(?P<path>[^\s]+)\s+HTTP/[^"]+"\s+(?P<status>\d+)\s+(?P<bytes>\d+)'
)


def stream_log_lines(raw_lines: Iterable[str]) -> Generator[str, None, None]:
    """Stage 1: Read and yield raw lines, stripping whitespace."""
    for line in raw_lines:
        line = line.strip()
        if line:
            yield line


def parse_records(
    lines: Iterable[str],
) -> Generator[dict[str, Any], None, None]:
    """Stage 2: Transform raw text lines into structured dictionaries."""
    for line in lines:
        match = LOG_PATTERN.match(line)
        if match:
            data = match.groupdict()
            data["status"] = int(data["status"])
            data["bytes"] = int(data["bytes"])
            yield data


def filter_server_errors(
    records: Iterable[dict[str, Any]],
) -> Generator[dict[str, Any], None, None]:
    """Stage 3: Filter records lazily without creating intermediate lists."""
    for record in records:
        if record["status"] >= 500:
            yield record


def batch_records(
    records: Iterable[dict[str, Any]], batch_size: int = 2
) -> Generator[list[dict[str, Any]], None, None]:
    """Stage 4: Group streaming records into batches for bulk database inserts."""
    batch = []
    for record in records:
        batch.append(record)
        if len(batch) == batch_size:
            # Yield full batch, then reset accumulator
            yield batch
            batch = []
    if batch:
        # Yield any remaining trailing records
        yield batch


# Simulated large stream of log lines (e.g. from an open file or S3 stream)
raw_log_stream = [
    '192.168.1.10 - - [27/Aug/2026:10:00:00 +0000] "GET /api/v1/users HTTP/1.1" 200 1024',
    '10.0.0.5 - - [27/Aug/2026:10:00:01 +0000] "POST /api/v1/checkout HTTP/1.1" 500 240',
    '172.16.0.2 - - [27/Aug/2026:10:00:02 +0000] "GET /health HTTP/1.1" 200 45',
    '10.0.0.9 - - [27/Aug/2026:10:00:03 +0000] "GET /api/v1/orders HTTP/1.1" 503 180',
    '192.168.1.15 - - [27/Aug/2026:10:00:04 +0000] "DELETE /api/v1/items/4 HTTP/1.1" 502 120',
]

# Compose the end-to-end streaming pipeline (O(1) memory overhead)
pipeline = batch_records(
    filter_server_errors(parse_records(stream_log_lines(raw_log_stream))),
    batch_size=2,
)

print("Starting streaming pipeline processing:")
for batch_number, error_batch in enumerate(pipeline, start=1):
    print(f"\n--- Inserting Batch {batch_number} into Alert DB ---")
    for err in error_batch:
        print(f"Alert: {err['ip']} hit {err['path']} -> HTTP {err['status']}")
```

**3. Sub-generator Delegation with `yield from` and Return Values**

```python
from collections.abc import Generator


def tally_metric_stream(
    metric_name: str,
) -> Generator[str, float, dict[str, float]]:
    """Sub-generator: Collects streamed numbers and returns aggregated summary."""
    total = 0.0
    count = 0

    while True:
        # Yield status and receive measurement via send()
        val = yield f"{metric_name}: Awaiting measurement"
        if val is None:
            # None signals end of this sub-stream
            break
        total += val
        count += 1

    # Return value is placed inside StopIteration.value
    avg = (total / count) if count > 0 else 0.0
    return {"metric": metric_name, "count": count, "total": total, "avg": avg}


def metric_router() -> Generator[str, float, list[dict[str, float]]]:
    """Delegating generator: Uses yield from to establish a bidirectional

    channel to sub-generators and captures their return values.
    """
    summaries = []

    print("Router: Activating latency collector...")
    latency_summary = yield from tally_metric_stream("latency_ms")
    summaries.append(latency_summary)

    print("Router: Activating memory collector...")
    memory_summary = yield from tally_metric_stream("memory_mb")
    summaries.append(memory_summary)

    return summaries


# Driving the delegated pipeline
router = metric_router()

# Prime the delegator (which automatically primes the first sub-generator)
status = next(router)
print(f"Consumer: {status}")

# Send measurements directly to the 'latency_ms' sub-generator
print(f"Consumer: {router.send(120.5)}")
print(f"Consumer: {router.send(95.2)}")
print(f"Consumer: {router.send(140.0)}")

# End the latency sub-generator by sending None -> transitions to memory sub-generator
status = router.send(None)
print(f"\nConsumer switched: {status}")

# Send measurements directly to the 'memory_mb' sub-generator
print(f"Consumer: {router.send(512.0)}")
print(f"Consumer: {router.send(768.5)}")

# End memory sub-generator -> metric_router reaches its return statement
try:
    router.send(None)
except StopIteration as e:
    final_report = e.value
    print("\n--- Final Aggregation Report ---")
    for summary in final_report:
        print(summary)
```

**4. Memory Footprint Verification: List vs. Generator Expression**

```python
import sys

# Allocate 10 million integers eagerly in a list
# Each integer object + pointer array consumes physical memory
list_comp = [i for i in range(10_000_000)]
list_memory_bytes = sys.getsizeof(list_comp)

# Create a lazy generator expression for 10 million integers
gen_exp = (i for i in range(10_000_000))
gen_memory_bytes = sys.getsizeof(gen_exp)

print(
    f"List Comprehension Memory : {list_memory_bytes / (1024 * 1024):.2f} MB"
)
print(f"Generator Expression Memory: {gen_memory_bytes} bytes")
print(f"Memory Reduction Factor    : {list_memory_bytes // gen_memory_bytes}x")
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between a regular function and a generator function in Python?**

A regular function executes to completion or until it encounters a `return` statement. When called, its entire execution frame is created, evaluated, and immediately destroyed upon exit, returning a single final value.

A generator function contains one or more `yield` statements. When invoked, CPython does not execute the function body; instead, it compiles the code with the `CO_GENERATOR` flag and returns a `PyGenObject` iterator. Execution only advances when the consumer calls `next(gen)` or `gen.send()`. When it hits `yield`, CPython halts execution, freezes the heap-allocated frame object (preserving local variables and instruction pointer `f_lasti`), and yields the value to the caller. The function can be resumed multiple times from its exact suspension point.

**Q: How does CPython preserve execution state across `yield` statements under the hood?**

In CPython, execution frames (`PyFrameObject`) are allocated as heap objects rather than living on a fixed, contiguous C execution stack. When `yield` executes (`YIELD_VALUE`), CPython saves the current bytecode instruction pointer index into `f_lasti`, stores the evaluation stack pointers, preserves the `f_localsplus` variable array on the heap, and marks the generator state as `GEN_SUSPENDED`.

When `next()` or `.send()` is called again, CPython loads this heap frame back into the evaluation loop, changes the state to `GEN_RUNNING`, and resumes bytecode dispatch at `f_lasti + 1`. This architectural choice decouples Python frame lifecycles from the operating system thread stack.

**Q: What happens when a generator function executes a `return` statement?**

When a generator reaches a `return` statement or the end of its function block, execution terminates and CPython raises a `StopIteration` exception.

If a return statement contains a value (e.g., `return total_count`), that return value is attached to the `StopIteration` instance as its `value` attribute (`exc.value`). In standard `for` loops, this value is discarded because `for` loops catch `StopIteration` silently to break iteration. However, when delegated via `yield from sub_generator()`, the `yield from` construct captures `StopIteration.value` and assigns it as the result of the expression.

**Q: How does `yield from` differ from a manual `for item in subgen: yield item` loop?**

A manual loop only performs one-way data forwarding: it pulls values from `subgen` and yields them upward. It breaks in three critical scenarios:
1. Bidirectional sending: If the outer caller calls `delegator.send(val)`, the manual loop cannot pass `val` down into `subgen`.
2. Exception routing: If the outer caller calls `delegator.throw(exc)` or `delegator.close()`, the manual loop does not route the exception into `subgen`'s active suspension point.
3. Return value capture: If `subgen` terminates with `return result`, a manual loop requires catching `StopIteration` manually and extracting `.value`.

`yield from` establishes a direct, bidirectional channel between the outer caller and the sub-generator. It forwards all `.send()`, `.throw()`, and `.close()` calls transparently, yields all values directly, and automatically unpacks the sub-generator's return value upon completion.

**Q: Why must a generator be primed before calling `.send()` with a non-None value?**

When a generator is first created, no code inside the function has executed yet. It is in the `GEN_CREATED` state. The execution instruction pointer is at the very beginning of the function, before any `yield` expression has been reached.

A `yield` expression is the target that receives the sent value (e.g., `x = yield 1`). Because the generator has not yet paused at a `yield` expression, there is nowhere for the sent value to go. Calling `gen.send("data")` on a freshly created generator raises `TypeError: can't send non-None value to a just-started generator`. Calling `next(gen)` or `gen.send(None)` advances the frame to the first `yield`, priming it to receive future values.

**Q: What happens to a suspended generator if the consumer terminates iteration early or encounters an error?**

If a consumer breaks out of a loop early or crashes, the generator remains suspended on the heap until it is either explicitly closed via `gen.close()` or collected by CPython's garbage collector.

When `gen.close()` runs or the generator is garbage collected, CPython raises a `GeneratorExit` exception inside the generator at its suspension point. This forces any active `finally` blocks or context managers (`with` statements) inside the generator to execute, guaranteeing that database connections, file handles, or mutex locks are safely cleaned up. If user code catches `GeneratorExit` and attempts to yield another value, CPython raises `RuntimeError: generator ignored GeneratorExit`.

**Q: When should you NOT use a generator in backend architecture?**

You should avoid generators in three primary scenarios:
1. Random access or indexed lookups: Generators do not support indexing (`gen[5]`) or slicing (`gen[10:20]`). If you need random access, you must use a list or tuple.
2. Multiple passes over data: Generators are single-use iterators. If an algorithm needs to calculate the mean on pass 1 and standard deviation on pass 2, passing a generator causes pass 2 to receive an empty sequence.
3. Micro-optimizations for small, fixed collections: For small lists (e.g., `< 1,000` items), list comprehensions run faster than generators because CPython optimizes list creation at the C level with pre-allocated memory arrays, avoiding the per-item frame switching and opcode overhead of `YIELD_VALUE`.

## 6. The Traps — What Goes Wrong

**1. The Single-Use Exhaustion Trap (Double Consumption)**

A generator can only be iterated once. After reaching the end, its frame is marked `GEN_CLOSED` and subsequent calls to `next()` immediately raise `StopIteration`.

```python
# The Trap: Consuming the generator twice
def get_user_ids():
    yield from [101, 102, 103]


ids = get_user_ids()

if not list(ids):  # FIRST CONSUMPTION: exhausts the generator
    raise ValueError("No IDs found")

# SECOND CONSUMPTION: ids is already empty! Loop runs 0 times.
for user_id in ids:
    process_user(user_id)
```

Why it happens: Developers confuse iterables (which can produce fresh iterators) with iterator/generator objects (which hold mutable iteration state).

The Fix: If you must inspect and reuse the stream, materialize it with `data = list(ids)` (if memory permits), or split the stream using `itertools.tee`:

```python
import itertools

ids_check, ids_work = itertools.tee(get_user_ids(), 2)
if not any(ids_check):
    raise ValueError("No IDs found")

for user_id in ids_work:
    process_user(user_id)
```

**2. The Un-iterated Generator Bug (Silent Non-Execution)**

Calling a generator function returns the generator iterator without running any code. If you forget to iterate it, the work never executes.

```python
# The Trap: Generator created but never consumed
def record_audit_events(events):
    for event in events:
        db.save(event)
        yield event


# The developer assumes calling the function saves the audit events
record_audit_events(event_list)  # BUG: Zero database writes occur!
```

Why it happens: In regular functions, calling `func()` executes the body. In generator functions, calling `func()` merely instantiates the iterator.

The Fix: Either consume the generator using a loop, pass it to `collections.deque(gen, maxlen=0)` to exhaust it at C-speed with zero memory allocation, or use a regular function if no lazy streaming is needed.

**3. Capturing Mutable Outer Variables Across Suspensions**

Because a generator pauses and resumes over time, if it closes over an external mutable variable, any mutation of that variable by other code between yields changes the generator's behavior.

```python
# The Trap: Mutable state altered between yields
config = {"discount": 0.10}


def calculate_prices(items):
    for item in items:
        # 'config' is resolved dynamically at each yield resumption
        yield item * (1 - config["discount"])


pricing_stream = calculate_prices([100, 100, 100])

print(next(pricing_stream))  # 90.0 (discount = 0.10)
config["discount"] = 0.50  # External mutation
print(next(pricing_stream))  # 50.0 (unexpectedly changed mid-stream!)
```

The Fix: Bind values locally within the generator or pass immutable snapshots (frozen dataclasses, namedtuples) into the generator to avoid external coupling.

**4. Swallowing Exceptions in Deferred Generator Pipelines**

If an exception is raised deep within a lazy pipeline, it surfaces only when the consumer pulls from the generator, not when the generator was defined or configured.

```python
def read_records(filename):
    with open(filename) as f:
        for line in f:
            yield parse(line)


# File is NOT opened here. No FileNotFoundError is raised here.
stream = read_records("missing_file.csv")

# 500 lines of code later...
# FileNotFoundError occurs here, far from where the function was called!
first_item = next(stream)
```

The Fix: Perform early validation eagerly before returning the generator, or use a factory pattern:

```python
def read_records_safe(filename):
    # Eager validation before yielding
    if not os.path.exists(filename):
        raise FileNotFoundError(f"Missing: {filename}")

    def _generator():
        with open(filename) as f:
            for line in f:
                yield parse(line)

    return _generator()
```

## 7. Compare With Related Concepts

**Generators vs. Custom Iterators (`__iter__` / `__next__`)**
- **Mechanic:** A custom iterator requires writing a class that implements `__iter__()` returning `self` and `__next__()` manually tracking state attributes (`self.index += 1`) and explicitly raising `StopIteration`. A generator creates the exact same iterator protocol automatically using local variable scope and `yield`.
- **Memory & Complexity:** Generators eliminate boilerplate and state-machine bugs. Custom iterator classes are useful when you need to attach custom domain methods (e.g., `.reset()` or `.peek()`) to the iterator object.
- **Rule of Thumb:** Use generators by default for custom iteration. Use custom iterator classes only when you need custom methods or complex multi-method state inspection.

**Generators vs. List Comprehensions / Lists**
- **Mechanic:** Lists store all objects in memory simultaneously (`O(N)` memory). Generators produce one object at a time on demand (`O(1)` memory).
- **Performance:** For small collections (`< 1,000` items), list comprehensions are 10–20% faster due to C-level contiguous memory allocation. For large or unbounded collections, generators prevent Out-Of-Memory crashes and start producing results instantly without initial latency.
- **Rule of Thumb:** Use lists when you need random access (`list[i]`), slicing, sorting, length calculation (`len(list)`), or multiple passes. Use generators for large datasets, streaming I/O, and linear data pipelines.

**Generators vs. Asynchronous Generators (`async def` / `yield`)**
- **Mechanic:** Standard generators implement `__next__()` and run synchronously, blocking the thread while computing the next item. Async generators (`async def` with `yield`) implement `__anext__()` returning an awaitable, allowing the generator to yield execution back to the asyncio event loop while waiting for async I/O (`await db.fetch()`).
- **Rule of Thumb:** Use synchronous generators for CPU-bound transformations and streaming file reads. Use async generators (`async for item in gen`) when producing items requires non-blocking network requests, async database queries, or WebSocket feeds.

**Generators vs. Itertools**
- **Mechanic:** Generators provide custom procedural logic for yielding items. The `itertools` module provides optimized, C-implemented generator building blocks (`chain`, `islice`, `groupby`, `takewhile`, `tee`).
- **Rule of Thumb:** Combine both. Write generator functions for your domain-specific parsing and business logic, and pipe them through `itertools` primitives for slicing, grouping, and chaining.

## 8. 🧠 The Memory Hook

A generator is a **bookmark in a frozen execution frame**: calling the function hires the worker without starting the job, `yield` hands you one item and pauses the worker's world on the heap, and `next()` taps the worker on the shoulder to run until the next bookmark.
