# Multiprocessing

## Detailed explanation

Multiprocessing runs work in separate OS processes with separate Python interpreters. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Multiprocessing bypasses GIL for CPU-bound work.

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

In a FastAPI or Django backend, multiprocessing affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What is multiprocessing in Python?
- **The Engine Mechanism (Why it behaves this way):** Multiprocessing spawns separate OS processes, each with its own Python interpreter and GIL. Processes communicate via IPC (inter-process communication) — pipes, queues, shared memory, or managers. The `multiprocessing` module provides `Process` for individual processes, `Pool` for process pools, `Queue` for inter-process communication, and `Manager` for shared objects. Each process has its own memory space — variables are not shared. Data passed between processes is serialized (pickled) by default, which adds overhead. `multiprocessing.shared_memory` (Python 3.8+) allows zero-copy sharing of large arrays.
- **The Unforgettable Mental Model:** The **Separate Offices**. Each process is like a separate office building — its own workers (threads), its own files (memory), its own rules (GIL). To share information, you send memos (IPC) between buildings.
- **The Trap:** Thinking processes share memory. They don't — each process has its own memory space. Global variables in one process are not visible in another.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Multiprocessing creates separate OS processes, each with its own Python interpreter and GIL. This bypasses the GIL limitation, enabling true parallelism for CPU-bound work. Processes don't share memory — they communicate via IPC (queues, pipes, shared memory). I use `ProcessPoolExecutor` for CPU-heavy tasks like data transformation, image processing, and cryptography. The trade-off is memory overhead (each process duplicates the memory space) and IPC cost (data serialization). For large datasets, I use `shared_memory` to avoid copying."

#### Why does multiprocessing matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** Backend services sometimes need CPU-heavy processing — image resizing, PDF generation, data aggregation, ML inference. The GIL prevents threading from parallelizing this work. Multiprocessing provides true parallelism by using multiple CPU cores. In production, Gunicorn uses multiprocessing (worker processes) to serve requests in parallel. Celery and RQ use multiprocessing for background task execution. The key benefit: CPU-bound tasks that would take 10 seconds in a single thread take 2.5 seconds on 4 cores.
- **The Unforgettable Mental Model:** The **Assembly Line Expansion**. One worker (process) takes 10 minutes to build a product. Four workers take 2.5 minutes. Each worker has their own workspace (memory), but they coordinate via the manager (IPC).
- **The Trap:** Using multiprocessing for I/O-bound work. The IPC overhead and memory duplication make it slower than asyncio or threading for I/O tasks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Multiprocessing matters for CPU-bound backend tasks — image processing, data transformation, ML inference — where the GIL prevents threading from helping. I use `ProcessPoolExecutor` to parallelize CPU work across multiple cores. In production, Gunicorn uses worker processes for parallel request handling. The trade-off is memory (each process duplicates the memory space) and IPC overhead (data serialization). I only use multiprocessing for CPU-bound work; for I/O-bound work, asyncio or threading is more efficient."

#### What bug can happen if you misunderstand multiprocessing?
- **The Engine Mechanism (Why it behaves this way):** The shared state illusion bug: modifying a global variable in one process doesn't affect other processes — each process has its own copy. The pickle bug: objects passed between processes must be picklable — lambdas, local functions, and some C extensions can't be pickled. The `__main__` guard bug: on Windows, multiprocessing requires `if __name__ == "__main__":` to prevent infinite process spawning. The memory explosion bug: each process copies the parent's memory space — a 1GB parent becomes N GB with N processes. The deadlock bug: processes waiting on each other's queues or locks can deadlock if not designed carefully.
- **The Unforgettable Mental Model:** The **Mirror World**. Each process is like a mirror world — it looks identical to the original, but changes in one world don't affect the others. They're separate universes.
- **The Trap:** Assuming global variables are shared between processes. They're not — each process gets its own copy at spawn time.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common multiprocessing bug is assuming shared state — global variables aren't shared between processes. Each process gets its own copy. I use `Queue`, `Pipe`, or `Manager` for inter-process communication. Another bug is the pickle requirement — objects passed between processes must be serializable. Lambdas and local functions can't be pickled. On Windows, the `__main__` guard is required to prevent infinite process spawning. I also watch for memory explosion — each process copies the parent's memory, so I use `shared_memory` for large datasets."

#### How does multiprocessing affect testing?
- **The Engine Mechanism (Why it behaves this way):** Testing multiprocessing code requires process isolation. Tests that spawn processes must be careful about resource cleanup — orphaned processes can persist after tests. `pytest` has plugins like `pytest-forked` for process isolation. Testing IPC requires verifying that data is correctly sent and received between processes. Testing process pools requires verifying that tasks are distributed correctly and results are collected. Mocking in multiprocessing is tricky — mocks in the parent process don't exist in child processes.
- **The Unforgettable Mental Model:** The **Separate Test Rooms**. Each process is tested in its own room — you can't see what's happening in other rooms directly. You communicate through message tubes (queues).
- **The Trap:** Not cleaning up processes after tests — orphaned processes consume resources and affect subsequent tests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Testing multiprocessing requires process isolation and careful cleanup. I ensure tests terminate all spawned processes, using `process.terminate()` and `process.join()` in teardown. I test IPC by sending known data through queues and verifying it arrives correctly. I test process pools by submitting tasks and verifying results match expected output. Mocking is tricky — mocks in the parent don't exist in children, so I use shared state or test the worker function directly. I also run multiprocessing tests serially to avoid resource contention."

#### How does multiprocessing affect performance or memory?
- **The Engine Mechanism (Why it behaves this way):** Multiprocessing provides true CPU parallelism — N processes on N cores can achieve N× speedup for CPU-bound work. However, each process has memory overhead (~8MB+ for the Python interpreter plus application memory). Data passed between processes is pickled (serialized), adding CPU and memory overhead. `shared_memory` (Python 3.8+) reduces memory overhead for large arrays by sharing memory between processes without copying. Process startup time is significant (~100ms per process) compared to thread startup (~1ms). For short-lived tasks, process pool reuse amortizes startup cost.
- **The Unforgettable Mental Model:** The **Heavy Machinery**. Multiprocessing is like bringing in heavy machinery — powerful but expensive to set up and run. Use it when the job justifies the cost.
- **The Trap:** Creating a new process for each short-lived task. Process startup overhead dominates execution time. Use a process pool instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Multiprocessing provides true CPU parallelism — 4 processes on 4 cores can achieve ~4× speedup for CPU-bound work. The cost is memory (each process duplicates the memory space) and IPC overhead (data serialization). I use process pools to amortize startup costs — creating a process takes ~100ms, but reusing pool processes is fast. For large datasets, I use `shared_memory` to avoid copying data between processes. The key rule: use multiprocessing for CPU-bound work that runs long enough to amortize startup costs. For short tasks or I/O-bound work, use asyncio or threading."

#### How would you explain multiprocessing with code?
- **The Engine Mechanism (Why it behaves this way):** Show basic process: `def worker(x): return x * x; with Pool(4) as pool: results = pool.map(worker, range(10))`. Show `ProcessPoolExecutor`: `with ProcessPoolExecutor() as executor: futures = [executor.submit(cpu_task, data) for data in datasets]; results = [f.result() for f in futures]`. Show shared memory: `from multiprocessing import shared_memory; shm = shared_memory.SharedMemory(create=True, size=1024)`. Show the `__main__` guard: `if __name__ == "__main__": multiprocessing.freeze_support(); main()`. Show timing comparison: single-threaded CPU task vs. multiprocessing — demonstrate speedup.
- **The Unforgettable Mental Model:** The **Speedup Demo**. Run a CPU-bound task with 1 process vs. 4 processes — the timing difference proves parallelism.
- **The Trap:** Not showing the `__main__` guard — it's required on Windows and good practice everywhere.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate multiprocessing with three examples. First, `Pool.map` for parallelizing a CPU-bound function across multiple processes — shows the speedup. Second, `ProcessPoolExecutor` for more control — submitting tasks individually and collecting results with futures. Third, the `__main__` guard — required on Windows to prevent infinite process spawning. I also show the timing comparison: a CPU task that takes 4 seconds with 1 process takes ~1 second with 4 processes. This proves true parallelism."

## 8. Active recall test

1. **Why does multiprocessing bypass the GIL?**
   - **Explanation:** Each process has its own Python interpreter and its own GIL. Processes run in separate OS processes, so they truly execute in parallel on multiple CPU cores.

2. **Do processes share memory in multiprocessing?**
   - **Explanation:** No. Each process has its own memory space. Global variables are not shared. Use `Queue`, `Pipe`, `Manager`, or `shared_memory` for inter-process communication.

3. **What is the `__main__` guard and why is it needed?**
   - **Explanation:** `if __name__ == "__main__":` prevents infinite process spawning on Windows (and macOS with spawn start method). Without it, child processes re-import the module and spawn more children.

4. **When should you use `Pool` vs. `ProcessPoolExecutor`?**
   - **Explanation:** `Pool` is simpler for map/reduce patterns. `ProcessPoolExecutor` is more flexible — supports `submit()`, `as_completed()`, and integrates with `concurrent.futures` API.

5. **What is the memory cost of multiprocessing?**
   - **Explanation:** Each process copies the parent's memory space. A 1GB parent becomes N GB with N processes. Use `shared_memory` (Python 3.8+) to share large arrays without copying.

6. **Why is multiprocessing slow for short-lived tasks?**
   - **Explanation:** Process startup takes ~100ms. For short tasks, startup overhead dominates execution time. Use a process pool to reuse processes and amortize startup costs.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Multiprocessing with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Multiprocessing and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Multiprocessing.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
