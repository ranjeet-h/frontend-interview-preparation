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

1. What is Multiprocessing?
2. Why does it matter in backend Python?
3. What bug can happen if you misunderstand it?
4. How does it affect testing?
5. How does it affect performance or memory?
6. How would you explain it with code?

## 8. Active recall test

1. Define Multiprocessing in one sentence.
2. Give one backend example.
3. Give one mistake related to it.
4. Explain how you would test code using it.

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
