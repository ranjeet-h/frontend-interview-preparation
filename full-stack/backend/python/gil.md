# The Global Interpreter Lock (GIL) in Python: CPython Internals, Thread Contention, and PEP 703 Free-Threading

## 1. Why This Exists — The Problem First

You deploy an 8-core compute instance on AWS to crunch through hundreds of thousands of analytical calculations or parse large JSON payloads. You write clean, standard Python code using `concurrent.futures.ThreadPoolExecutor(max_workers=8)`, expecting your workload to run roughly 8 times faster. You open `htop` to watch all 8 CPU cores light up.

Instead, you see total CPU utilization capped at exactly 100% on a single core (12.5% of the machine's capacity), rapidly jumping between cores while the other 7 cores sit completely idle. Even worse, the multi-threaded code finishes *slower* than a basic single-threaded `for` loop.

This happens because CPython (the standard reference implementation of Python) has a Global Interpreter Lock (GIL)—a single process-wide mutex ensuring that only one native operating system thread can execute Python bytecode at any given moment.

To understand why Guido van Rossum and the CPython core team introduced the GIL in the early 1990s, look at CPython's memory management engine. CPython tracks object lifetimes using reference counting. Every Python object (`PyObject`) has an internal counter called `ob_refcnt`. Every time you bind a variable to an object, pass it into a function, or append it to a list, CPython increments that counter. When a variable goes out of scope or is reassigned, CPython decrements the counter. When `ob_refcnt` hits zero, CPython immediately frees the memory.

If multiple native OS threads executed Python code simultaneously across multiple CPU cores, two threads could mutate an object's reference counter at the exact same clock cycle. Without synchronization, you get race conditions: lost decrements leading to massive memory leaks, or duplicate decrements leading to a double-free crash that corrupts the process memory space.

CPython had two design choices:
1. Place a fine-grained mutex on every single Python object, or make every reference count increment/decrement an atomic CPU instruction (`LOCK XADD` on x86).
2. Wrap the entire interpreter evaluation loop in one global mutex.

Choice 1 was tested and rejected multiple times because fine-grained locks and atomic instructions impose a crushing 30% to 50% performance penalty on everyday single-threaded Python programs. Every variable assignment, dictionary lookup, and loop counter would spend CPU cycles acquiring and releasing locks. Choice 2—the Global Interpreter Lock—kept single-threaded Python lightning-fast, made C-extension integration trivial, and avoided deadlocks. The trade-off was that multi-core CPU parallelism could not be achieved with Python threads alone.

## 2. The Analogy — Make It Obvious

Imagine a recording studio with 8 professional voice actors (native OS threads) sitting in a soundproof room, but there is only one physical microphone (the CPython interpreter core) plugged into the mixing board.

When Voice Actor 1 is speaking (executing Python bytecode), Voice Actors 2 through 8 must sit in complete silence waiting for their turn, regardless of how many sound engineers or recording tracks (CPU cores) the studio owns.

Now consider two distinct scenarios:

**Scenario A: The Script-Reading Job (CPU-Bound Work)**
All 8 actors have thick scripts to read aloud. Because only one actor can hold the microphone at a time, they must pass the microphone around every few sentences. Instead of finishing 8 times faster, the actors spend time grabbing and passing the microphone back and forth, knocking over water glasses, losing their spot in the script (CPU cache invalidation), and finishing the total reading session slower than if one actor simply read all 8 scripts from start to finish.

**Scenario B: The Phone-Order Job (I/O-Bound Work)**
Voice Actor 1 gets on the microphone and dials a restaurant. While waiting on hold for 30 seconds for someone to pick up (waiting for a database query or network response), Voice Actor 1 places the microphone on the table. Voice Actor 2 immediately picks up the microphone, dials their vendor, places the mic down, and waits. Voice Actor 3 does the same. While all 8 actors wait on hold across 8 different phone lines (OS network sockets), they take turns using the single microphone to initiate calls and read responses. All 8 calls proceed in parallel without delay.

In this analogy:
- The Voice Actors are the native OS threads managed by the kernel.
- The Microphone is the GIL.
- The Studio Mixing Board is the CPU cores.
- Putting the mic down while on hold is CPython releasing the GIL during blocking I/O calls.
- Passing the mic during script reading is the switch interval (`sys.getswitchinterval()`), which causes thread contention and context-switching overhead.

## 3. How It Actually Works — The Full Explanation

CPython creates real, native OS threads (POSIX pthreads on Linux/macOS, Windows threads on Windows). The operating system kernel schedules these threads across all available CPU cores. However, before any thread can inspect, allocate, or execute Python bytecode instructions, it must hold the GIL mutex.

**CPython Internal Data Structures and Reference Counting**

At the C level, every Python object is defined as a `PyObject` structure:

```c
typedef struct _object {
    _PyObject_HEAD_EXTRA
    Py_ssize_t ob_refcnt;
    struct _typeobject *ob_type;
} PyObject;
```

When you write `a = [1, 2, 3]` and then `b = a`, CPython runs `Py_INCREF(a)`, which in standard CPython expands to:
```c
#define Py_INCREF(op) ( ((PyObject*)(op))->ob_refcnt++ )
```

Because `ob_refcnt++` is not atomic, two threads executing this simultaneously without a lock would read the old value, increment it in a CPU register, and write back the same incremented value—losing one reference count. The GIL eliminates the need for atomic assembly instructions or per-object locks by guaranteeing that only one thread runs the bytecode evaluation loop (`_PyEval_EvalFrameDefault` in `Python/ceval.c`) at any instant.

**The GIL Switch Interval and Thread Switching Mechanics**

How does CPython allow other threads to run if one thread is executing a long CPU-bound loop?

CPython uses a cooperative time-slicing mechanism called the switch interval, accessible via `sys.getswitchinterval()` (defaulting to 0.005 seconds, or 5 milliseconds).

Here is the exact step-by-step sequence:
1. Thread A acquires the GIL and runs Python bytecode.
2. An internal CPython timer tracks how long Thread A has continuously held the lock.
3. Once 5ms elapses, the runtime sets a global flag (`eval_breaker` in modern CPython).
4. When Thread A reaches its next bytecode boundary, it checks the `eval_breaker` flag, releases the GIL, and signals a condition variable (`pthread_cond_signal`).
5. Thread A then temporarily yields execution by waiting on an acknowledgement condition variable, giving other waiting threads (Thread B, Thread C) a chance to grab the GIL.
6. Thread B wakes up, acquires the GIL, resets the timer, and executes its bytecode for up to 5ms.

On multi-core systems, this time-slicing creates what computer scientists call the "Convoy Effect" and high context-switching overhead. The OS kernel schedules Thread A on Core 0 and Thread B on Core 1. Thread B wakes up and waits on the GIL. Thread A drops the GIL on Core 0, but before Thread B can complete its cross-core OS wakeup signal on Core 1, Thread A on Core 0 might immediately re-acquire the lock. The OS wastes thousands of CPU cycles signaling and sleeping threads while L1/L2 data caches get repeatedly invalidated.

**The Magic of Blocking I/O: Automatic GIL Release**

When a Python thread performs a blocking operation—such as `socket.recv()`, `file.read()`, `select()`, or `time.sleep()`—the CPython C implementation wraps the operating system call with two macros:

```c
Py_BEGIN_ALLOW_THREADS
/* The GIL is released here. This thread does not touch Python objects. */
bytes_read = read(fd, buffer, count); // Native OS kernel syscall
Py_END_ALLOW_THREADS
/* This thread re-acquires the GIL before returning to Python code. */
```

While Thread A is blocked inside the Linux kernel waiting for network packets, Thread B can run Python bytecode at full speed. This is why Python threads are effective for web scrapers, database-heavy microservices, and file downloaders.

**Native C/Rust Extensions and GIL Release**

Compiled extensions written in C, C++, Cython, or Rust can explicitly drop the GIL during heavy numerical computations.

When you call `numpy.dot(matrix_a, matrix_b)` or `torch.matmul(tensor_a, tensor_b)`, the underlying C/Fortran/CUDA code drops the GIL using `Py_BEGIN_ALLOW_THREADS` or Rust PyO3's `Python::allow_threads`. The library then spawns its own native OpenMP or worker threads to execute matrix multiplication in true hardware parallel across all CPU cores. When computation finishes, it re-acquires the GIL and returns a standard Python wrapper object.

**Bypassing the GIL for CPU-Bound Work**

Python developers use three primary strategies to achieve true multi-core parallelism:

1. **Multi-Processing (`multiprocessing` / `ProcessPoolExecutor`):** Spawns separate OS processes. Each process has its own distinct Python interpreter, its own memory address space, and its own independent GIL. An 8-worker process pool utilizes 8 CPU cores at 100% (800% aggregate). The trade-off is Inter-Process Communication (IPC) overhead, because all input arguments and return values must be serialized (`pickle`) and sent across OS pipes/sockets.
2. **Shared Memory (`multiprocessing.shared_memory`):** Introduced in Python 3.8, this allows multiple Python processes to read and write directly to a shared block of POSIX shared memory (`/dev/shm`), avoiding serialization costs for large NumPy arrays or dataframes.
3. **Free-Threaded Python (PEP 703 & Python 3.13+):** Python 3.13 introduced an experimental build (`--disable-gil`) that removes the GIL entirely from CPython. PEP 703 replaced the single global lock with:
   - **Biased Reference Counting (BRC):** Objects are marked as owned by the thread that created them. The owner thread increments/decrements refcounts with non-atomic instructions. Other threads use atomic instructions or work queues.
   - **Immortal Objects:** Common runtime objects (integers, strings like `"True"`, built-in types) have refcounting disabled so multiple threads can read them without memory bus contention.
   - **Mimalloc Allocator:** A thread-safe, high-performance memory allocator that uses per-thread memory heaps.
   - **Fine-Grained Collection Locks:** Internal locks inside Python dictionaries and lists to ensure structural thread safety during concurrent writes.

## 4. Real Code — See It Working

Let's look at three practical code examples demonstrating:
1. The performance difference between Single-Threaded, Multi-Threaded, and Multi-Process execution on CPU-bound vs I/O-bound tasks.
2. Why the GIL does not make your application code thread-safe (the race condition demo).
3. The bytecode disassembly proving why compound operations lose data under thread switching.

**Example 1: CPU-Bound vs I/O-Bound Benchmark**

```python
import time
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

def cpu_bound_task(n: int) -> int:
    """Calculates the sum of squares up to n (pure CPU bytecode crunching)."""
    total = 0
    for i in range(n):
        total += i * i
    return total

def io_bound_task(seconds: float) -> float:
    """Simulates waiting on a database query or external API response."""
    time.sleep(seconds)
    return seconds

def run_benchmarks():
    cpu_work_items = [20_000_000] * 4
    io_work_items = [0.5] * 4

    print("=== 1. CPU-BOUND WORKLOAD (4 tasks, 20M iterations each) ===")
    
    # Sequential
    start = time.perf_counter()
    for item in cpu_work_items:
        cpu_bound_task(item)
    print(f"Sequential Duration:    {time.perf_counter() - start:.2f}s")

    # Multi-threaded (Constrained by the GIL)
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(cpu_bound_task, cpu_work_items))
    print(f"ThreadPool Duration:    {time.perf_counter() - start:.2f}s (No speedup; lock contention overhead)")

    # Multi-process (Bypasses the GIL across 4 separate CPU cores)
    start = time.perf_counter()
    with ProcessPoolExecutor(max_workers=4) as executor:
        list(executor.map(cpu_bound_task, cpu_work_items))
    print(f"ProcessPool Duration:   {time.perf_counter() - start:.2f}s (~4x speedup on 4+ core CPU)")

    print("\n=== 2. I/O-BOUND WORKLOAD (4 tasks, 0.5s sleep each) ===")
    
    # Sequential I/O
    start = time.perf_counter()
    for item in io_work_items:
        io_bound_task(item)
    print(f"Sequential I/O Duration:{time.perf_counter() - start:.2f}s")

    # Multi-threaded I/O (GIL is released during time.sleep syscall)
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(io_bound_task, io_work_items))
    print(f"ThreadPool I/O Duration:{time.perf_counter() - start:.2f}s (~4x speedup because GIL was released)")

if __name__ == "__main__":
    # Required for safe process spawning on macOS/Windows
    run_benchmarks()
```

**Example 2: The Race Condition Demo (Why GIL != Thread Safety)**

```python
import threading
import dis

# Shared state without explicit application locks
shared_counter = 0

def unsafe_worker(iterations: int):
    global shared_counter
    for _ in range(iterations):
        # This single line is NOT atomic in Python bytecode
        shared_counter += 1

def demonstrate_race_condition():
    global shared_counter
    shared_counter = 0
    iterations = 100_000
    
    # Spawn two threads trying to increment the shared counter simultaneously
    t1 = threading.Thread(target=unsafe_worker, args=(iterations,))
    t2 = threading.Thread(target=unsafe_worker, args=(iterations,))
    
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    
    expected = iterations * 2
    print(f"Expected count: {expected}")
    print(f"Actual count:   {shared_counter}")
    print(f"Lost updates:   {expected - shared_counter}")

if __name__ == "__main__":
    demonstrate_race_condition()
```

**Example 3: Bytecode Disassembly Proving Non-Atomicity**

```python
import dis

def increment_step():
    global shared_counter
    shared_counter += 1

print("=== Bytecode Instructions for 'shared_counter += 1' ===")
dis.dis(increment_step)
```

Output of `dis.dis`:
```text
  1           0 LOAD_GLOBAL              0 (shared_counter)
              2 LOAD_CONST               1 (1)
              4 BINARY_OP                0 (+)
              8 STORE_GLOBAL             0 (shared_counter)
             10 RETURN_CONST             0 (None)
```

Look closely at the instruction sequence:
1. `LOAD_GLOBAL` pushes the current value of `shared_counter` (e.g., 42) onto the thread's value stack.
2. `LOAD_CONST` pushes `1` onto the stack.
3. `BINARY_OP (+)` calculates `43`.
4. `STORE_GLOBAL` writes `43` back to `shared_counter`.

If Thread A executes steps 1 and 2, and the 5ms switch interval triggers right before step 4, CPython forces Thread A to release the GIL. Thread B runs, reads `shared_counter` as 42, executes all four steps, and writes `43`. When Thread A regains the GIL, it finishes step 4 with its precomputed `43` and overwrites the variable. One entire increment is lost.

To make this safe, you must use an explicit `threading.Lock`:

```python
import threading

shared_counter = 0
counter_lock = threading.Lock()

def safe_worker(iterations: int):
    global shared_counter
    for _ in range(iterations):
        with counter_lock:  # Acquires OS mutex around the critical section
            shared_counter += 1
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the Global Interpreter Lock (GIL), and why was it implemented in CPython?**

The GIL is a mutual exclusion lock used by CPython to ensure that only one native OS thread executes Python bytecode at any given time. It was implemented primarily to protect CPython's memory management system. CPython uses reference counting (`ob_refcnt`) to track object lifetimes. If multiple threads incremented and decremented reference counters concurrently on multi-core processors without synchronization, memory corruptions and double-free crashes would occur. 

Instead of adding fine-grained locks to every individual object (which creates deadlocks and severely penalizes single-threaded execution performance by 30–50%), CPython implemented a single interpreter-level lock. This keeps single-threaded code fast, simplifies the integration of third-party C libraries, and guarantees internal memory safety.

**Q: If CPython has a GIL that allows only one thread to run at a time, why do we still need `threading.Lock`?**

The GIL provides interpreter-level thread safety (preventing internal C-level memory corruption and crash bugs in CPython itself), but it does not provide application-level thread safety for Python data structures and operations.

In Python, high-level statements like `counter += 1` or `if key not in cache: cache[key] = compute()` compile into multiple individual bytecode instructions (`LOAD_GLOBAL`, `LOAD_CONST`, `BINARY_OP`, `STORE_GLOBAL`). Because CPython switches active threads periodically (every 5ms or during I/O), a thread switch can happen between any two bytecode instructions. If Thread A reads a variable and gets interrupted before storing the updated value, Thread B can run, modify the variable, and have its work overwritten when Thread A resumes. You must use `threading.Lock` to make multi-step operations logically atomic.

**Q: How does the GIL behave during I/O-bound operations versus CPU-bound operations?**

During I/O-bound operations (such as making HTTP requests, reading from a disk file, querying a database, or calling `time.sleep()`), CPython invokes `Py_BEGIN_ALLOW_THREADS`, which drops the GIL immediately before executing the underlying OS system call. The thread blocks inside the kernel waiting for data, while other Python threads can acquire the GIL and execute bytecode concurrently. Thus, multi-threading offers significant performance gains for I/O-bound work.

During CPU-bound operations (such as heavy math loops, image transformations, or JSON encoding), the thread continuously executes bytecode instructions. It holds the GIL until the 5ms switch interval forces a release. On multi-core CPUs, waiting threads constantly fight for the lock, generating high context-switching overhead and CPU cache invalidations without providing any parallel execution speedup.

**Q: How do backend servers like Gunicorn, Uvicorn, and Celery handle the GIL in production?**

Python backend architectures bypass the GIL by structuring concurrency at the process level or using asynchronous event loops:
- **WSGI Servers (Gunicorn / uWSGI):** Use a pre-fork master-worker model. Gunicorn spawns multiple worker processes (typically `2 * cores + 1`). Each worker is an independent OS process with its own dedicated Python interpreter, memory space, and GIL, enabling true parallel request processing across all CPU cores.
- **ASGI Servers (Uvicorn / FastAPI):** Run on a single-threaded cooperative event loop (`asyncio`). Coroutines yield execution voluntarily using `await` during network socket waits, eliminating thread context-switching overhead entirely while running on one core. To utilize multiple cores, Uvicorn is run with multiple worker processes behind a reverse proxy like Nginx or Gunicorn.
- **Task Queues (Celery / RQ):** Offload CPU-heavy background tasks (video transcoding, PDF generation) to separate worker processes or external service clusters rather than processing them inside web request threads.

**Q: Why do libraries like NumPy and PyTorch run in true multi-core parallel despite the GIL?**

NumPy, PyTorch, and SciPy implement their core numerical and linear algebra routines in compiled C, C++, CUDA, and Fortran. When you execute an operation like a matrix multiplication, the C extension releases the GIL via `Py_BEGIN_ALLOW_THREADS` before entering the numerical loop. The library utilizes underlying multi-threaded libraries like OpenBLAS, Intel MKL, or CUDA streams to execute computations across all CPU cores or GPU hardware threads simultaneously. The GIL is re-acquired only when the computation finishes and Python objects need to be returned.

**Q: What is PEP 703 and what is the status of the "No-GIL" / Free-Threaded build in Python 3.13?**

PEP 703 ("Making the Global Interpreter Lock Optional in CPython") introduced an official architecture to remove the GIL from CPython, landing as an experimental build target (`python3.13t` or `--disable-gil`) in Python 3.13. 

PEP 703 solves the historical performance penalties of removing the GIL by using:
1. **Biased Reference Counting (BRC):** Objects are owned by the thread that allocated them. Owner thread updates use fast non-atomic instructions, while foreign threads use atomic instructions or work queues.
2. **Deferred Reference Counting / Immortal Objects:** Frequently accessed global objects (integers, strings, types) have reference counting disabled completely.
3. **Mimalloc Memory Allocator:** Provides lock-free, per-thread memory allocation heaps.
4. **Thread-Safe Data Structures:** Fine-grained internal locking for dictionaries and lists to prevent memory corruption during concurrent access.

## 6. The Traps — What Goes Wrong

**Trap 1: Assuming the GIL Eliminates the Need for Locks**
- **The Mistake:** Developers assume that because the GIL prevents concurrent bytecode execution, operations on lists, dictionaries, or shared integers are automatically atomic and safe from race conditions.
- **What Happens:** Statements like `counter += 1` or check-then-act logic (`if key not in cache: cache[key] = val`) compile to multiple bytecode instructions. Thread switching occurs midway, resulting in lost updates, duplicated entries, and intermittent data corruption bugs that only reproduce under heavy production load.
- **The Fix:** Protect all shared mutable state using `threading.Lock`, `threading.RLock`, or use thread-safe data structures like `queue.Queue`.

**Trap 2: Using Multi-Threading for CPU-Bound Background Tasks in Web APIs**
- **The Mistake:** Spawning background threads with `threading.Thread` or `ThreadPoolExecutor` inside a FastAPI or Django endpoint to process heavy workloads (e.g., generating high-resolution PDF reports or calculating cryptographic hashes).
- **What Happens:** The worker thread hogs the GIL. Because it is CPU-bound, it forces the web server's main thread to fight for bytecode execution slices every 5ms. Response latency spikes across all active API endpoints on that worker, and overall throughput collapses.
- **The Fix:** Offload CPU-bound jobs to a `ProcessPoolExecutor` or an asynchronous background task queue (Celery, RQ) backed by separate worker processes.

**Trap 3: Memory Bloat and Copy-on-Write Breakage with `multiprocessing`**
- **The Mistake:** Switching from threads to `multiprocessing` to bypass the GIL on a 16-core server when processing a large 10GB in-memory dataset, expecting Linux's `fork()` Copy-on-Write (CoW) to share the 10GB across all 16 workers for free.
- **What Happens:** Whenever a child process reads a Python object, CPython increments that object's `ob_refcnt`. This refcount increment is a memory write to the underlying page. Linux immediately triggers Copy-on-Write for that page. Within seconds, all 16 workers copy the pages into their private address spaces, consuming `10GB * 16 = 160GB` of RAM and crashing the server with an Out-Of-Memory (OOM) killer event.
- **The Fix:** Store large shared datasets in `multiprocessing.shared_memory.SharedMemory`, memory-mapped files (`mmap`), or use NumPy/Arrow arrays whose underlying data buffers exist outside the CPython object reference-counting subsystem.

**Trap 4: Invoking Python Callbacks from Native C/Rust Threads Without the GIL**
- **The Mistake:** Writing a C, C++, or Rust extension that spawns native background OS worker threads, and having those threads call back into a Python function without acquiring the GIL.
- **What Happens:** The native thread attempts to allocate a `PyObject` or update a frame stack while another thread holds the GIL. CPython's internal memory structures get corrupted, leading to an immediate segmentation fault (`SIGSEGV`) and instant process termination.
- **The Fix:** When interacting with Python from foreign threads in C/Rust, ensure you wrap the invocation with `PyGILState_Ensure()` and `PyGILState_Release()`, or use PyO3's `Python::with_gil` guard in Rust.

## 7. Compare With Related Concepts

**GIL vs `threading.Lock`**
- **The Difference:** The GIL is an internal, runtime-level mutex in CPython that protects the interpreter's own internal state and reference counters. A `threading.Lock` is an application-level synchronization primitive created by the developer to protect business logic, shared mutable variables, and critical code sections.
- **Rule of Thumb:** The GIL protects Python from crashing; a `threading.Lock` protects your application data from race conditions.

**GIL vs `asyncio` Event Loop**
- **The Difference:** The GIL governs multi-threaded pre-emptive execution across OS threads (where the runtime forces thread switches every 5ms). `asyncio` is single-threaded cooperative multitasking, where a single OS thread switches between coroutines only when a coroutine explicitly executes an `await` on a non-blocking I/O operation.
- **Rule of Thumb:** Use `asyncio` for high-volume concurrent network I/O with thousands of connections; use threads when integrating blocking legacy I/O libraries; use `multiprocessing` for CPU-bound computations.

**GIL (`ThreadPoolExecutor`) vs `ProcessPoolExecutor`**
- **The Difference:** `ThreadPoolExecutor` shares a single memory address space and a single GIL across threads, making data sharing fast but limiting execution to one CPU core for Python bytecode. `ProcessPoolExecutor` spawns independent OS processes with independent memory spaces and independent GILs, enabling full multi-core CPU parallelism at the cost of IPC serialization overhead.
- **Rule of Thumb:** If your task waits on network or disk, use `ThreadPoolExecutor`; if your task pegs CPU cores crunching numbers or transforming data, use `ProcessPoolExecutor`.

**CPython GIL vs Node.js Event Loop vs Java/Go Threading**
- **Node.js (V8):** Single-threaded event loop by design. No GIL because there is only one JavaScript execution thread per process. Multi-core work requires worker threads with isolated V8 isolates or `cluster` processes.
- **Go (Golang):** No GIL. Go's runtime uses an M:N scheduler with work-stealing, executing lightweight goroutines in true hardware parallel across native OS threads with atomic memory operations.
- **Java (JVM):** No GIL. Java threads map directly to OS threads and run bytecode concurrently across all CPU cores, utilizing memory barriers, atomic variables, and synchronized blocks for thread safety.
- **CPython:** Multi-threaded at the OS level, but single-threaded at the Python bytecode execution level due to the GIL.

## 8. 🧠 The Memory Hook

The GIL is one microphone for the entire CPython room: threads can drop it instantly when waiting on I/O, but only one thread can speak Python bytecode at a time. The GIL protects CPython's internal memory refcounts, not your application's shared variables—so threads still need locks, and CPU-heavy work still needs processes.
