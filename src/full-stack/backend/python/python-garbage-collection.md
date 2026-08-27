# Garbage Collection in Python: Reference Counting, Cyclic GC, and Generational Tracing

## 1. Why This Exists — The Problem First

A Python backend microservice starts happily at 180MB of RAM. Twelve hours into handling production traffic, its memory footprint climbs steadily past 3.5GB. Nothing shows up in global caches, database connection pools are fixed, and request payloads are small. Suddenly, the Linux Out-Of-Memory (OOM) killer sends a `SIGKILL`, terminating the worker pod in the middle of active requests.

What caused the leak? Two domain objects held references to each other—a parent tree node referencing its children, and each child holding a reference back to its parent.

In CPython, the primary way memory is reclaimed is instantaneous: every time a variable stops pointing to an object, that object's internal reference counter drops. When the counter hits zero, CPython immediately frees the memory. But when Object A points to Object B and Object B points to Object A, both retain a reference count of at least 1, even after all local variables pointing to them go out of scope. They become an isolated island of garbage floating in memory, completely unreachable by your application but completely invisible to simple reference counting.

Without a secondary cyclic garbage collection system to track, inspect, and dismantle these isolated circular graphs, every long-running Python application would eventually exhaust its heap and crash.

## 2. The Analogy — Make It Obvious

Imagine a busy package delivery warehouse managed by a clipboard tally system and an occasional audit inspector.

Every package arriving at the warehouse has a physical tally badge on the box.
- Whenever a driver, a warehouse worker, or a shelf holds that package, they increment the badge tally by 1.
- Whenever a driver drops off the package or a worker lets go of it, the badge tally decreases by 1.
- The warehouse rule is dead simple: the exact second a package's tally hits 0, the nearest worker drops the box into the recycling baler immediately. No waiting, no scheduling, no delays. This simple tally rule handles 95% of all boxes in the warehouse seamlessly.

Now imagine a mishap: Worker Alice places Package A into Box B, and Worker Bob places Package B into Box A. Both workers punch out and go home. Nobody in the outside world has an order ticket for either package. Yet Package A has a tally of 1 (held by Box B), and Package B has a tally of 1 (held by Box A). Because neither tally is 0, the regular warehouse workers will walk past those boxes forever without ever throwing them into the baler.

To solve this, the warehouse hires a specialized Audit Inspector:
- The Inspector does not check every single item. Plain letters and envelopes that cannot hold other boxes (integers, strings, floats) are ignored. The Inspector only monitors "container" boxes (lists, dictionaries, custom objects).
- The Inspector organizes boxes into three staging zones:
  - **Generation 0 (The Daily Unloading Dock):** Inspected very frequently. Most scratch boxes and temporary packaging are caught and shredded right here.
  - **Generation 1 (The Short-Term Shelves):** Boxes that survived a Generation 0 audit get moved here and inspected less often.
  - **Generation 2 (The Long-Term Storage Racks):** Long-lived singletons, application settings, and persistent items that survived multiple audits get moved here. They are inspected very rarely because checking the entire archive takes serious time.
- During an audit, the Inspector performs a "trial subtraction" on a whiteboard: they write down the tally numbers of all boxes on the dock, then subtract all internal references between those boxes. If a pair of boxes ends up with a count of 0 on the whiteboard, it proves they were only keeping each other alive. The Inspector cuts the internal tape and dumps the entire circular pair into the baler.

## 3. How It Actually Works — The Full Explanation

CPython uses a hybrid memory management architecture composed of two distinct layers: deterministic Reference Counting as the frontline worker, and a Generational Cyclic Garbage Collector as the safety net.

### The Frontline: Reference Counting

At the C level, every Python object is represented by a `PyObject` structure. The header of this structure (`PyObject_HEAD`) contains a 64-bit field called `ob_refcnt` alongside a pointer to the object's type (`ob_type`).

Whenever an object reference is created, passed, or stored:
- CPython invokes the macro `Py_INCREF()`, incrementing `ob_refcnt`.
- When a variable goes out of scope, is reassigned, or is explicitly cleared via `del`, CPython invokes `Py_DECREF()`, decrementing `ob_refcnt`.
- The moment `ob_refcnt` drops to 0, CPython immediately calls the type's deallocation function (`tp_dealloc`). Memory is freed back to Python's memory allocator (PyMalloc or system `free()`), and any associated OS resources are released immediately.

Reference counting is fast, deterministic, and distributed across the lifetime of the program. There is no global "stop-the-world" pause required for standard, non-cyclic objects.

However, reference counting has one fundamental blind spot: reference cycles. If Object A references Object B, and Object B references Object A, their `ob_refcnt` values will never reach 0 on their own, even if both `a` and `b` variables are deleted from local and global namespaces.

### The Safety Net: The Cyclic Generational Collector

To clean up isolated circular graphs, CPython includes the `gc` module—a cyclic garbage collector operating on top of reference counting.

Only container objects can form reference cycles. Atomic, immutable objects like `int`, `float`, `str`, and `bytes` cannot hold references to other objects and are never tracked by the cyclic GC. Container objects—such as `dict`, `list`, `set`, `tuple`, custom class instances, functions, and generators—have an extra header prepended called `PyGC_Head`. This header includes doubly-linked list pointers (`gc_next`, `gc_prev`) allowing CPython to link all active container objects into generational lists.

The collector is built around the Generational Hypothesis: most objects die very young. Temporary variables, local scopes, and short-lived request payloads are allocated and discarded within milliseconds. Objects that survive multiple collection cycles tend to be long-lived constants, imported modules, and long-running state.

CPython partitions tracked container objects into three generations:
- **Generation 0:** Contains all newly allocated container objects.
- **Generation 1:** Contains objects that survived one Gen 0 collection pass.
- **Generation 2:** Contains long-lived objects that survived collections across Gen 1.

The collector tracks allocations and deallocations using internal counters. You can inspect the thresholds via `gc.get_threshold()`, which by default returns `(700, 10, 10)`:
- When the net difference between container allocations and deallocations in Generation 0 exceeds 700, a Gen 0 collection triggers.
- When Generation 0 has been collected 10 times, a Generation 1 collection is triggered (which collects both Gen 0 and Gen 1).
- When Generation 1 has been collected 10 times, a full Generation 2 collection is triggered (which sweeps Gen 0, Gen 1, and Gen 2).

### The Cycle Detection Algorithm: Trial Deletion

When a collection runs on generation $N$, CPython combines generation $N$ and all younger generations into a candidate list and executes trial deletion:

1. **Copy reference counts:** For every object in the candidate list, CPython copies its `ob_refcnt` to a temporary field named `gc_refs` inside its `PyGC_Head`.
2. **Subtract internal pointers:** CPython iterates through every container in the candidate list and visits all objects it points to using the type's `tp_traverse` slot. For every referenced object inside the candidate list, CPython decrements that object's `gc_refs` by 1.
3. **Partition reachable vs unreachable:**
   - Any object that still has `gc_refs > 0` must have an external reference coming from outside the candidate list (such as a local variable on the call stack, a global variable, or an older generation object). This object is definitively alive.
   - Any object reachable from a definitively alive object is also marked alive (its `gc_refs` is restored, and all objects it points to are traversed and marked alive).
   - Any object whose `gc_refs` remains 0 after all reachable trees are marked is part of an isolated cycle with zero external references.
4. **Reclaim memory:** CPython breaks the circular references among unreachable objects, allowing normal `Py_DECREF()` operations to drop their real `ob_refcnt` to 0 and trigger immediate deallocation.

### PEP 442 and Destructor Safety in Python 3.4+

Historically (Python 2.x and early 3.x), if objects in an unreachable cycle defined a `__del__` method, Python could not determine a safe destruction order without risking that one object's destructor might access another already-finalized object in the cycle. Python abandoned collection of those objects, labeling them "uncollectable" and dumping them into `gc.garbage`, creating an unpreventable memory leak.

PEP 442 (introduced in Python 3.4) overhauled finalization. CPython now splits cleanup into two safe phases: it first calls all `__del__` destructors on cycle members while all references in the cycle are still fully intact and valid, and only afterward tears down the references and frees memory.

### Breaking Cycles at the Architecture Level with `weakref`

Instead of relying on periodic cyclic GC sweeps, well-architected systems prevent cycles entirely using the `weakref` module. A weak reference (`weakref.ref` or `weakref.proxy`) allows an object to reference a target without incrementing the target's `ob_refcnt`. If all strong references to the target are removed, the target is immediately deallocated, and the weak reference automatically invalidates or returns `None`.

### Disabling GC in Pre-Fork Multi-Worker Architectures (Instagram Optimization)

In production services running under pre-fork process managers (such as Gunicorn or uWSGI), master processes load application code, ORM models, and configuration before calling `os.fork()` to create worker processes.

Linux uses Copy-on-Write (CoW) to share physical memory pages across parent and child processes. However, when CPython's cyclic GC runs inside a worker, its pointer updates on `PyGC_Head` headers and reference counter increments write directly into the shared memory pages containing static code and classes. This dirtying breaks CoW sharing, forcing each worker to copy entire chunks of memory into its private space and ballooning server memory usage.

To solve this, modern Python (3.7+) provides `gc.freeze()`. By calling `gc.freeze()` in the master process right before forking workers, all preloaded application objects are moved into a permanent, untracked generation that is completely ignored by future GC collection sweeps. Child workers can keep cyclic GC enabled for per-request allocations without dirtying shared parent pages.

## 4. Real Code — See It Working

Let us look at runnable examples showing reference counting, circular reference collection, weak references, and GC tuning.

### Example 1: Reference Counting in Action

```python
import sys

# Create a simple object
data = ["order_101", "order_102"]

# sys.getrefcount passes 'data' into the function, creating a temporary reference.
# Therefore, getrefcount always returns 1 higher than the actual active references.
print(f"Initial ref count: {sys.getrefcount(data)}")  # Prints 2 (variable 'data' + function argument)

alias = data
print(f"After alias ref count: {sys.getrefcount(data)}")  # Prints 3 ('data', 'alias', + function argument)

del alias
print(f"After del alias ref count: {sys.getrefcount(data)}")  # Prints 2
```

### Example 2: Creating and Collecting an Isolated Reference Cycle

```python
import gc

class Node:
    def __init__(self, name: str):
        self.name = name
        self.partner = None

    def __repr__(self):
        return f"Node({self.name})"

# Ensure automatic GC does not run midway so we can observe the cycle manually
gc.disable()

# Create two nodes referencing each other
node_a = Node("A")
node_b = Node("B")
node_a.partner = node_b
node_b.partner = node_a

# Remove external variable references
del node_a
del node_b

# At this point, both Node instances still exist in memory with ref count = 1.
# Reference counting alone cannot reclaim them.
print("Running manual cycle collection...")
unreachable_count = gc.collect()
print(f"Reclaimed unreachable cyclic objects: {unreachable_count}")

# Re-enable automatic garbage collection
gc.enable()
```

### Example 3: Eliminating Cycles with `weakref`

```python
import weakref

class Parent:
    def __init__(self, name: str):
        self.name = name
        self.children = []

    def add_child(self, child_name: str):
        child = Child(child_name, self)
        self.children.append(child)
        return child

    def __del__(self):
        print(f"Parent {self.name} deallocated immediately!")

class Child:
    def __init__(self, name: str, parent: Parent):
        self.name = name
        # Store a weak reference to the parent instead of a strong reference
        self._parent = weakref.ref(parent)

    @property
    def parent(self) -> Parent | None:
        # Dereferencing the weakref returns the live Parent or None if already freed
        return self._parent()

    def __del__(self):
        print(f"Child {self.name} deallocated immediately!")

# Build the relationship
parent = Parent("HQ")
child = parent.add_child("Branch-1")

print(f"Child sees parent: {child.parent.name}")

# Deleting parent immediately triggers destruction because child holds only a weakref
print("Deleting parent...")
del parent
# Both Parent and Child destructors fire immediately without needing gc.collect()
```

### Example 4: Pre-Fork Optimization with `gc.freeze()` in Gunicorn/FastAPI

```python
import gc

def on_starting_gunicorn_server():
    """Simulated Gunicorn on_starting hook executed in the master process."""
    # 1. Preload all heavy models, routes, and shared database metadata
    print("Preloading application schemas and singletons...")

    # 2. Run a full collection to clean up setup artifacts
    gc.collect()

    # 3. Freeze all existing objects into the permanent generation.
    # When workers fork, GC runs in child workers will never touch or dirty
    # these preloaded memory pages, preserving Linux Copy-on-Write sharing.
    gc.freeze()
    print(f"Frozen objects: {gc.get_freeze_count()} permanently untracked.")

on_starting_gunicorn_server()
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does CPython manage memory, and why does it use a dual garbage collection system instead of pure tracing or pure reference counting?**

CPython uses Reference Counting as its primary memory management mechanism and a Generational Cyclic Garbage Collector as a secondary mechanism.

Pure reference counting is used for the vast majority of memory management because it is deterministic and immediate: when `ob_refcnt` hits zero, memory and underlying file descriptors or network sockets are freed right away without requiring application-wide pauses. However, pure reference counting has a fatal theoretical flaw: it cannot detect or reclaim reference cycles ($A \rightarrow B \rightarrow A$), which would leak permanently.

CPython introduces the cyclic GC specifically to solve this blind spot. Instead of scanning the entire heap like a pure tracing garbage collector (such as the JVM or Go runtime), CPython's cyclic GC only tracks container objects and runs trial deletions across generational lists to detect and break isolated cyclic graphs. This dual architecture gives Python the low-latency predictability of reference counting while preventing cyclic memory leaks.

**Q: What is the generational hypothesis, and how do Python's three generations (0, 1, 2) exploit it?**

The Weak Generational Hypothesis states that in virtually all software systems, the vast majority of allocated objects have very short lifespans (temporary strings, function stack frames, local dictionaries), while objects that survive past an initial threshold tend to persist for a long time (modules, long-lived caches, configurations).

CPython splits tracked container objects into three doubly-linked lists:
- **Generation 0:** Newly created container objects. Swept frequently whenever net allocations (`allocations - deallocations`) exceed `threshold0` (default 700).
- **Generation 1:** Objects surviving a Gen 0 sweep are promoted here. Swept less frequently (default every 10 Gen 0 sweeps).
- **Generation 2:** Long-lived objects surviving Gen 1 sweeps are promoted here. Swept rarest of all (default every 10 Gen 1 sweeps).

By focusing 90%+ of its collection effort on Gen 0, CPython reclaims short-lived cycles rapidly while avoiding expensive, full-heap scans over the entire object space.

**Q: How does Python's cyclic GC detect reference cycles using trial deletion?**

The cyclic GC uses a four-step trial deletion algorithm on a candidate set of containers:
1. It copies each candidate object's real reference count `ob_refcnt` into a temporary field called `gc_refs` located in the `PyGC_Head` struct.
2. For each container in the candidate set, it iterates through all objects referenced by that container (via `tp_traverse`) and decrements the target's `gc_refs` by 1.
3. After all internal references have been subtracted, any object with `gc_refs > 0` must have at least one reference coming from outside the candidate set (from the stack, global scope, or older generation). That object is marked reachable, and all objects reachable from it are recursively marked reachable.
4. Any remaining objects with `gc_refs == 0` have no external roots and exist solely due to mutual internal references. The collector breaks their references and reclaims their memory.

**Q: What was the historic issue with `__del__` in reference cycles, and how did PEP 442 resolve it in Python 3.4+?**

Prior to Python 3.4, if two objects in an unreachable reference cycle both defined `__del__` destructors, CPython could not determine which destructor to execute first. Running Object A's `__del__` might cause it to access Object B after B had already been finalized, leading to memory corruption or crashes. To prevent this, CPython simply refused to collect cyclic graphs containing `__del__` methods, dumping them into `gc.garbage` and causing an uncollectable memory leak.

PEP 442 resolved this in Python 3.4+ by formalizing safe object finalization. CPython now splits finalization and deallocation into two passes: it first invokes the `tp_finalize` slot (`__del__`) for all objects in the unreachable cycle while all cycle pointers remain intact and navigable. Once all destructors have finished executing, CPython performs reference breaking and memory deallocation.

**Q: Why does `sys.getrefcount(obj)` return a number higher than expected?**

`sys.getrefcount(obj)` returns the exact value of the C struct field `ob_refcnt`. However, calling the function requires passing `obj` as an argument expression. In Python's calling convention, binding an argument to a function parameter increments the object's reference count by 1 for the duration of the call stack frame. Therefore, `sys.getrefcount(obj)` will always report a count that is at least 1 higher than the number of active variables and containers referencing the object in the outer scope.

**Q: Why did Instagram famously disable Python's garbage collection, and how does `gc.freeze()` in modern Python address that problem?**

Instagram ran Django web servers using Gunicorn/uWSGI pre-fork workers. In a pre-fork model, the master process loads all Django code, ORM models, and settings, and then forks child processes. Linux relies on Copy-on-Write (CoW) to share physical memory pages between parent and child until a page is modified.

When Python's cyclic GC ran in child workers, its generational linked-list updates and refcount manipulations wrote metadata directly into the memory pages containing the preloaded code and classes. This dirtied the pages, destroyed CoW sharing, and caused every worker's private memory to balloon by hundreds of megabytes. Disabling GC prevented page dirtying and saved 10% total server RAM across their fleet.

Modern Python solved this cleanly with `gc.freeze()` (Python 3.7+). Instead of disabling GC entirely (which risks leaking request-scoped cycles), the master process executes `gc.freeze()` immediately before forking. All preloaded objects are moved to a permanent uncollected generation. Child workers can leave cyclic GC enabled to safely clean up request cycles without ever dirtying the shared parent memory pages.

**Q: When should you use `weakref` in backend architecture, and what happens when you access an expired weak reference?**

You should use `weakref` whenever you need bidirectional relationships, parent-child hierarchies, observer patterns, or in-memory caches where one object needs to observe or communicate with another without asserting ownership over its lifecycle.

For example, a child node in a tree should hold a `weakref.ref(parent)` back to its parent. If the parent is deleted from the root graph, the parent's `ob_refcnt` drops to 0 and frees immediately without waiting for a cyclic GC sweep.

When you call an expired `weakref.ref()` object whose target has been deallocated, it returns `None`. If you use `weakref.proxy()` and attempt to access an attribute on a dead referent, Python raises a `ReferenceError`.

**Q: What are the performance and latency implications of Generation 2 GC collections in async Python (FastAPI / asyncio) applications?**

Async Python runs all concurrent coroutines on a single OS thread using an event loop. When a Generation 2 collection triggers, CPython must traverse every tracked container object across all three generations on the heap to perform trial deletions and cycle tracing.

In long-running async microservices holding hundreds of thousands of objects in memory, a full Gen 2 collection can block the thread for 50ms to 200ms+. Because the event loop is single-threaded, all I/O polling, incoming HTTP request processing, and active coroutines are frozen for the duration of the sweep, causing sudden tail latency (p99) spikes. To mitigate this, teams tune thresholds with `gc.set_threshold()`, use `__slots__` or tuples to reduce the count of tracked container objects, or trigger manual `gc.collect(1)` sweeps during off-peak windows.

## 6. The Traps — What Goes Wrong

### Trap 1: Relying on `__del__` for Critical Resource Cleanup

- **The Wrong Assumption:** Placing socket closure, database connection release, or file flush logic inside a class's `__del__` method guarantees immediate cleanup when the object is no longer in use.
- **Why It Fails:** `__del__` is only invoked when `ob_refcnt` drops to 0 or during an active cyclic GC sweep. If an object is caught in a reference cycle, held by an unhandled exception traceback, or kept alive in a thread pool local, `__del__` may be delayed indefinitely or never run before process termination.
- **The Fix:** Always manage system resources deterministically using context managers (`with` statements implementing `__enter__` and `__exit__`).

```python
# BROKEN: Non-deterministic file cleanup
class FileLogger:
    def __init__(self, path):
        self.file = open(path, "w")
    def __del__(self):
        self.file.close()  # May not run for minutes if caught in a cycle!

# CORRECT: Explicit deterministic scope
class FileLogger:
    def __init__(self, path):
        self.path = path
        self.file = None
    def __enter__(self):
        self.file = open(self.path, "w")
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.file:
            self.file.close()
```

### Trap 2: Accidentally Pinning Memory via Exception Tracebacks

- **The Wrong Assumption:** Storing an exception instance on a long-lived service object (`self.last_error = e`) only stores the error message and type.
- **Why It Fails:** In Python 3, every caught exception has an attached `__traceback__` attribute. The traceback holds a reference to the active stack frame, which holds references to all local variables in every enclosing scope up the entire call stack. Storing `self.last_error = e` accidentally keeps the entire stack frame—including request payloads, database rows, and local objects—pinned in memory.
- **The Fix:** Strip the traceback or store only the string representation and error code.

```python
# BROKEN: Keeps entire execution frame and local variables alive
class ServiceWorker:
    def handle(self, payload):
        try:
            self.process(payload)
        except Exception as e:
            self.last_error = e  # Leaks payload, locals, and stack frames!

# CORRECT: Store only error details or explicitly detach traceback
class ServiceWorker:
    def handle(self, payload):
        try:
            self.process(payload)
        except Exception as e:
            self.last_error = str(e)
            # Or if storing exception instance:
            # self.last_error = e.with_traceback(None)
```

### Trap 3: Blindly Calling `gc.disable()` to Optimize Request Latency

- **The Wrong Assumption:** Calling `gc.disable()` in an API application removes all GC pause times without any side effects because reference counting handles everything.
- **Why It Fails:** While reference counting frees non-cyclic objects, third-party libraries, ORMs (SQLAlchemy, Django ORM), logging frameworks, and internal closures frequently create circular references. Disabling GC without an explicit manual collection strategy causes cyclic objects to accumulate monotonically until the process crashes from OOM.
- **The Fix:** Rather than disabling GC globally, increase Gen 0 thresholds (`gc.set_threshold(50000, 15, 15)`) to reduce frequency, use `gc.freeze()` in master processes, or run `gc.collect()` explicitly during idle worker intervals.

### Trap 4: Assuming `__slots__` Prevents Reference Cycles

- **The Wrong Assumption:** Adding `__slots__` to a class eliminates garbage collection overhead and prevents reference cycles.
- **Why It Fails:** `__slots__` prevents the creation of a per-instance `__dict__`, reducing the memory overhead of an object from ~150 bytes to ~48 bytes. However, attributes declared in `__slots__` can still hold references to other container objects. If two slotted instances reference each other, they still form a cycle, have `PyGC_Head` headers, and require cyclic GC sweeps to be reclaimed.
- **The Fix:** Use `__slots__` strictly for per-instance memory reduction; use `weakref` to prevent reference cycles.

### Trap 5: Believing Tuples Are Always Ignored by the Cyclic GC

- **The Wrong Assumption:** Because tuples are immutable, they are never tracked by the cyclic GC.
- **Why It Fails:** While a tuple containing only atomic types (`tuple[int, str]`) is untracked by the GC, a tuple containing mutable containers (`tuple[list, dict]`) can participate in a reference cycle (e.g., `my_list.append(my_tuple)` where `my_tuple = (my_list,)`). CPython dynamically inspects tuples upon creation; if a tuple contains any container objects, it is assigned a `PyGC_Head` and tracked in Generation 0.

## 7. Compare With Related Concepts

### Reference Counting vs. Generational Cyclic GC
- **Difference:** Reference counting is continuous, local, and deallocates memory immediately when `ob_refcnt == 0`. Generational cyclic GC runs periodically, inspects collections of containers, and breaks unreachable circular reference loops.
- **Rule of thumb:** Reference counting handles 99% of normal object lifecycles; cyclic GC exists solely to sweep unreachable circular islands.

### Python Dual GC vs. Java / Go Tracing GC
- **Difference:** Java (JVM) and Go do not use reference counting; they rely entirely on periodic tracing collectors (Mark-Sweep, Generational ZGC, concurrent tri-color collectors) that traverse all live objects from root sets. Python uses reference counting first and only traces container objects for cycle detection.
- **Rule of thumb:** Python has zero pause times for linear code and immediate destructor execution; JVM/Go incur periodic tracing overhead but never suffer from reference cycle leaks.

### `del` Statement vs. Object Deallocation
- **Difference:** The `del x` statement removes the name binding `x` from the current namespace and invokes `Py_DECREF()`. It does not directly free memory. Deallocation is an indirect side effect that only happens if `ob_refcnt` drops to zero.
- **Rule of thumb:** Use `del` to unbind variable names from scope; never assume `del` instantly frees heap memory if other references or cycles exist.

### Strong Reference (`=`) vs. Weak Reference (`weakref.ref`)
- **Difference:** A strong reference increments `ob_refcnt`, keeping the object alive and asserting shared ownership. A weak reference creates a non-owning pointer that does not increment `ob_refcnt`, allowing the referent to be deallocated at any time.
- **Rule of thumb:** Use strong references for direct ownership; use weak references for parent back-pointers, caches, and observer subscriptions.

### `gc.collect()` vs. `gc.freeze()`
- **Difference:** `gc.collect()` immediately executes a full cycle-detection sweep across active generations to reclaim unreachable memory. `gc.freeze()` freezes all current objects into an untracked permanent generation so subsequent GC runs never scan or modify them.
- **Rule of thumb:** Use `gc.collect()` during maintenance/idle intervals; use `gc.freeze()` in pre-fork web server master processes right before spawning workers.

## 8. 🧠 The Memory Hook

Python reclaims memory the exact microsecond an object's reference counter hits zero; the cyclic garbage collector is merely the periodic safety patrol hunting down isolated circular handshake islands that reference counting cannot see. Use context managers (`with`) for resources, `weakref` for back-pointers, and `gc.freeze()` before forking workers.
