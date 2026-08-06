# Concurrency vs Parallelism

## Detailed explanation

Concurrency handles multiple tasks in overlapping time; parallelism executes multiple tasks at the same time. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Concurrency is structure; parallelism is simultaneous execution.

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

In a FastAPI or Django backend, concurrency vs parallelism affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What is the difference between concurrency and parallelism?
- **The Engine Mechanism (Why it behaves this way):** Concurrency means multiple tasks make progress in overlapping time periods — they may not run simultaneously, but they interleave. Parallelism means multiple tasks execute at the exact same instant on multiple CPU cores. Concurrency is about structure (managing multiple tasks); parallelism is about execution (running multiple tasks simultaneously). In Python: asyncio provides concurrency (single thread, interleaved execution), threading provides concurrency (multiple threads, but GIL limits parallelism), and multiprocessing provides parallelism (multiple processes, each with its own GIL, true simultaneous execution on multiple cores).
- **The Unforgettable Mental Model:** The **Juggling Chef vs. Two Chefs**. Concurrency is one chef juggling multiple pots — switching between them, making progress on all, but only stirring one at a time. Parallelism is two chefs, each stirring their own pot simultaneously.
- **The Trap:** Using the terms interchangeably. They're related but distinct — you can have concurrency without parallelism (asyncio), and parallelism without concurrency (two independent batch jobs).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Concurrency is about dealing with multiple things at once — tasks overlap in time but may not run simultaneously. Parallelism is about doing multiple things at once — tasks execute simultaneously on multiple cores. In Python, asyncio provides concurrency through an event loop, threading provides concurrency with the GIL limiting parallelism, and multiprocessing provides true parallelism with separate processes. The choice depends on the workload: I/O-bound tasks benefit from concurrency, CPU-bound tasks need parallelism."

#### Why does this distinction matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** Choosing the wrong concurrency model causes performance problems. Using threading for CPU-bound work (image processing, data transformation) gives no speedup due to the GIL — you need multiprocessing. Using multiprocessing for I/O-bound work (database queries, API calls) wastes memory and adds IPC overhead — you need asyncio or threading. Understanding the distinction helps you match the tool to the workload: asyncio for high-concurrency I/O (web servers), multiprocessing for CPU-heavy tasks (data processing), threading for moderate I/O (background workers).
- **The Unforgettable Mental Model:** The **Right Tool for the Job**. Concurrency and parallelism are different tools. Using a hammer (parallelism) for a screw (I/O concurrency) works poorly. Match the tool to the workload.
- **The Trap:** Defaulting to threading for everything. Threading is good for I/O but useless for CPU-bound work in Python due to the GIL.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The distinction matters because choosing the wrong model causes performance problems. For I/O-bound work — database queries, API calls, file reads — I use asyncio or threading. The GIL is released during I/O waits, so concurrency works well. For CPU-bound work — image processing, data transformation, cryptography — I use multiprocessing. The GIL prevents threading from parallelizing CPU work, so separate processes are needed. In production, I often combine them: asyncio for request handling, multiprocessing for CPU-heavy background tasks."

#### What bug can happen if you misunderstand concurrency vs. parallelism?
- **The Engine Mechanism (Why it behaves this way):** The threading-for-CPU bug: using `threading.Thread` for CPU-bound work expecting speedup, but getting no improvement (or worse) due to GIL contention and context-switching overhead. The multiprocessing-for-I/O bug: using `multiprocessing` for I/O-bound work, wasting memory (each process duplicates the memory space) and adding IPC overhead. The asyncio-blocking bug: using asyncio for CPU-bound work, blocking the event loop and freezing all other coroutines. The shared-state-in-threads bug: assuming threading is safe for shared mutable state — the GIL doesn't make compound operations atomic.
- **The Unforgettable Mental Model:** The **Wrong Vehicle**. Using threading for CPU work is like taking a bicycle on a highway — it works, but it's the wrong vehicle for the speed you need.
- **The Trap:** Thinking "more threads = faster" for CPU work. In Python, more threads = more GIL contention = slower.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common bug is using threading for CPU-bound work — the GIL prevents parallelism, so threads just add overhead. The fix is multiprocessing. Another bug is using multiprocessing for I/O-bound work — it wastes memory and adds IPC overhead. The fix is asyncio or threading. I also watch for blocking calls in asyncio — CPU work blocks the event loop. The decision tree is simple: I/O-bound → asyncio or threading; CPU-bound → multiprocessing. I profile first to identify the bottleneck, then choose the right model."

#### How does this distinction affect testing?
- **The Engine Mechanism (Why it behaves this way):** Testing concurrent code requires verifying interleaving behavior — race conditions, deadlocks, and ordering. Testing parallel code requires verifying independent execution — no shared state corruption, correct result aggregation. Concurrency tests are non-deterministic — race conditions may not reproduce every run. Parallel tests are more deterministic but require process isolation. Testing asyncio uses `pytest-asyncio`. Testing threading requires careful synchronization in tests. Testing multiprocessing requires `if __name__ == "__main__":` guards on some platforms.
- **The Unforgettable Mental Model:** The **Stress Test**. Concurrency testing is like stress-testing a bridge — you need to simulate many users at once to find weak points. Parallel testing is like testing two bridges independently — each must hold on its own.
- **The Trap:** Testing concurrent code with a single thread — race conditions don't appear without actual interleaving.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Testing concurrent code requires actual concurrency — running multiple threads or coroutines simultaneously to expose race conditions. I run tests multiple times to catch non-deterministic bugs. For parallel code, I test process isolation — ensuring processes don't corrupt shared state. I use `pytest-asyncio` for async tests, and for multiprocessing, I ensure tests have proper `__main__` guards. The key is to test the concurrency properties, not just the functional behavior."

#### How does this distinction affect performance?
- **The Engine Mechanism (Why it behaves this way):** Concurrency (asyncio) handles many I/O operations with minimal memory (~1KB per coroutine). Parallelism (multiprocessing) uses significant memory (~8MB+ per process) but achieves true CPU parallelism. Threading is in between — more memory than asyncio (~8MB per thread) but less than multiprocessing, with concurrency for I/O but no parallelism for CPU due to the GIL. The performance choice depends on the bottleneck: if waiting for I/O, concurrency wins; if computing, parallelism wins.
- **The Unforgettable Mental Model:** The **Weight vs. Speed Trade-off**. Concurrency is lightweight (low memory, high connection count). Parallelism is heavyweight (high memory, true speed). Choose based on what you need.
- **The Trap:** Optimizing for the wrong bottleneck. Adding parallelism to an I/O-bound service doesn't help — the bottleneck is waiting, not computing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Performance depends on the bottleneck. For I/O-bound services, concurrency (asyncio) handles thousands of connections with minimal memory. For CPU-bound services, parallelism (multiprocessing) uses multiple cores to speed up computation. Threading is a middle ground — good for moderate I/O but useless for CPU due to the GIL. I profile first to identify the bottleneck, then choose the right model. In production, I often combine them: asyncio for request handling (I/O-bound), multiprocessing for background data processing (CPU-bound)."

#### How would you explain this distinction with code?
- **The Engine Mechanism (Why it behaves this way):** Show concurrency with asyncio: `async def main(): await asyncio.gather(io_task1(), io_task2())` — two I/O tasks overlap, complete in ~1 second each. Show parallelism with multiprocessing: `with Pool(2) as p: p.map(cpu_task, [data1, data2])` — two CPU tasks run simultaneously on two cores, complete in ~half the time. Show threading for I/O: `Thread(target=io_task1).start(); Thread(target=io_task2).start()` — I/O tasks overlap. Show threading for CPU: `Thread(target=cpu_task1).start(); Thread(target=cpu_task2).start()` — no speedup due to GIL.
- **The Unforgettable Mental Model:** The **Side-by-Side Demo**. Run the same task with asyncio, threading, and multiprocessing — the timing differences make the distinction clear.
- **The Trap:** Not showing the GIL's effect on threading for CPU work. This is the key insight.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate with four examples. First, asyncio for I/O — two 1-second sleeps complete in ~1 second (concurrency). Second, multiprocessing for CPU — two CPU tasks on two cores complete in half the time (parallelism). Third, threading for I/O — works well, GIL is released during waits. Fourth, threading for CPU — no speedup, GIL prevents parallelism. The timing differences make the distinction undeniable. I also show the memory difference: asyncio uses KB per connection, multiprocessing uses MB per process."

## 8. Active recall test

1. **What is the key difference between concurrency and parallelism?**
   - **Explanation:** Concurrency = tasks overlap in time (interleaved). Parallelism = tasks execute simultaneously (at the same instant on multiple cores).

2. **Which Python tool provides true parallelism?**
   - **Explanation:** `multiprocessing` — separate processes with separate GILs, enabling true simultaneous execution on multiple CPU cores.

3. **Why doesn't threading provide parallelism for CPU-bound work in Python?**
   - **Explanation:** The GIL (Global Interpreter Lock) allows only one thread to execute Python bytecode at a time. CPU-bound threads compete for the GIL, serializing execution.

4. **When should you use asyncio vs. multiprocessing?**
   - **Explanation:** asyncio for I/O-bound work (network, disk, database). multiprocessing for CPU-bound work (computation, data processing). Match the tool to the bottleneck.

5. **What is the memory cost difference between asyncio and multiprocessing?**
   - **Explanation:** asyncio uses ~1KB per coroutine (shared memory space). multiprocessing uses ~8MB+ per process (separate memory space). Asyncio scales to 10,000+ connections; multiprocessing is limited by RAM.

6. **Can you have concurrency without parallelism?**
   - **Explanation:** Yes. asyncio provides concurrency (interleaved execution) without parallelism (simultaneous execution). A single thread handles many tasks by switching between them at `await` points.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Concurrency vs Parallelism with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Concurrency vs Parallelism and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Concurrency vs Parallelism.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
