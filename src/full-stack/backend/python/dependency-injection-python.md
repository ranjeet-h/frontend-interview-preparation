# Dependency Injection in Python

## Detailed explanation

Dependency injection passes required collaborators into functions/classes instead of constructing them inside. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Inject dependencies to make code testable and flexible.

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

In a FastAPI or Django backend, dependency injection in python affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

1. What is Dependency Injection in Python?
2. Why does it matter in backend Python?
3. What bug can happen if you misunderstand it?
4. How does it affect testing?
5. How does it affect performance or memory?
6. How would you explain it with code?

## 8. Active recall test

1. Define Dependency Injection in Python in one sentence.
2. Give one backend example.
3. Give one mistake related to it.
4. Explain how you would test code using it.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Dependency Injection in Python with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Dependency Injection in Python and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Dependency Injection in Python.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
