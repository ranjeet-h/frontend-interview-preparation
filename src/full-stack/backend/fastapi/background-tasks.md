# Background Tasks

## Detailed explanation

FastAPI background tasks run small post-response jobs like email or logging after the response is sent. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Background tasks defer small side effects.

## 2. Problem it solves

It keeps FastAPI applications predictable by making contracts, shared logic, validation, or runtime behavior explicit instead of scattering framework code across handlers.

## 3. Core idea

- Use Python type hints as API contracts.
- Keep route handlers thin and delegate business logic to services.
- Use dependencies for shared request-time behavior.
- Return explicit response models and status codes.
- Test behavior through HTTP calls and dependency overrides.

## 4. Visual / analogy

```txt
Request -> dependency resolution -> validation -> endpoint -> service/database -> response model -> response
```

## 5. Minimal example

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str

@app.post("/items")
def create_item(item: Item):
    return {"data": item}
```

## 6. Real-world example

A production FastAPI service uses routers per domain, Pydantic schemas for input/output, dependencies for auth and DB sessions, exception handlers for consistent errors, and tests with dependency overrides.

## 7. Common interview questions

#### What are background tasks in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Background tasks are functions that run after the response is sent to the client. Use `BackgroundTasks` as a parameter: `def send_email(task: BackgroundTasks): task.add_task(send_email_fn, to="user@example.com"); return {"status": "ok"}`. FastAPI sends the response first, then runs each added task in order. Tasks run in the same event loop (for async) or threadpool (for sync). They're ideal for small post-response jobs: sending emails, logging, webhooks, cache invalidation. They are NOT for long-running or heavy tasks — use a task queue (Celery, RQ) for those.
- **The Unforgettable Mental Model:** The **Restaurant Busser**. The waiter (endpoint) serves the meal (response) and leaves. The busser (background task) cleans the table (sends email, logs) after the customer is already eating. The customer doesn't wait for the cleaning.
- **The Trap:** Using background tasks for heavy work. Background tasks run in the same process — a long task blocks the event loop or threadpool, degrading performance for other requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Background tasks run after the response is sent. I use them for small post-response jobs — sending emails, logging, cache invalidation. They run in the same process, so I don't use them for heavy work. For long-running tasks, I use a task queue like Celery."

#### How do you add background tasks to an endpoint?
- **The Engine Mechanism (Why it behaves this way):** Inject `BackgroundTasks` as a parameter and call `add_task()` with the function and its arguments: `from fastapi import BackgroundTasks; @app.post("/users") def create_user(user: UserCreate, background_tasks: BackgroundTasks): db.add(user); db.commit(); background_tasks.add_task(send_welcome_email, user.email); return {"id": user.id}`. Multiple tasks can be added — they run in the order they were added. Tasks can be sync or async. The response is sent before any task runs.
- **The Unforgettable Mental Model:** The **To-Do List**. The endpoint writes items on a to-do list (add_task). After the meeting (response) ends, the assistant (FastAPI) works through the list in order.
- **The Trap:** Expecting the task to run before the response. Background tasks run AFTER the response is sent. If the task must complete before responding, call it directly, not as a background task.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I inject BackgroundTasks and call add_task with the function and arguments. Multiple tasks run in order after the response is sent. If a task must complete before responding, I call it directly — not as a background task."

#### What are the limitations of background tasks?
- **The Engine Mechanism (Why it behaves this way):** Background tasks: (1) Run in the same process — they consume the same memory and CPU as the application, (2) Run on the event loop (async) or threadpool (sync) — long tasks block other requests, (3) Have no retry mechanism — if a task fails, it's lost, (4) Have no persistence — tasks are lost on server restart, (5) Have no monitoring — no built-in way to track task status. For reliable, long-running, or heavy tasks, use a task queue (Celery, RQ, ARQ) with a message broker (Redis, RabbitMQ).
- **The Unforgettable Mental Model:** The **Sticky Note**. Background tasks are sticky notes on your monitor — convenient for quick reminders, but they fall off (lost on restart), have no tracking (no monitoring), and if you drop them (task fails), they're gone.
- **The Trap:** Using background tasks for critical operations. If sending a confirmation email is critical and must be retried on failure, use a task queue — not background tasks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Background tasks run in the same process with no retry, no persistence, and no monitoring. They're fine for non-critical, lightweight work like logging. For critical operations — emails, payments, data processing — I use a task queue like Celery with retry and monitoring."

#### How do background tasks differ from dependencies with yield cleanup?
- **The Engine Mechanism (Why it behaves this way):** Dependencies with `yield` run cleanup AFTER the response but BEFORE background tasks. The order is: (1) dependency setup (before yield), (2) endpoint execution, (3) response sent, (4) dependency cleanup (after yield), (5) background tasks. Yield cleanup is for resource management (closing DB sessions, releasing locks). Background tasks are for post-response work (sending emails, logging). They serve different purposes and run at different times.
- **The Unforgettable Mental Model:** The **Restaurant Closing**. Yield cleanup is the chef cleaning the kitchen after service (resource management). Background tasks are the manager sending the daily report after everyone leaves (post-response work). Kitchen cleaning happens before the report.
- **The Trap:** Using background tasks for resource cleanup. Background tasks don't have the same guarantee as yield cleanup — if the task fails, cleanup might not happen. Use yield for cleanup.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Yield cleanup runs before background tasks. Yield is for resource management — closing DB sessions, releasing locks. Background tasks are for post-response work — emails, logging. I use yield for cleanup and background tasks for non-critical post-response jobs."

#### How do you test background tasks?
- **The Engine Mechanism (Why it behaves this way):** Background tasks run after the response in TestClient tests. To verify task execution, use mocks: `with patch("app.emails.send_welcome_email") as mock_send: response = client.post("/users", json={...}); mock_send.assert_called_once()`. TestClient waits for background tasks to complete before returning the response, so assertions work synchronously. For testing task failures, make the mock raise an exception and verify the response is still sent (background task failures don't affect the response).
- **The Unforgettable Mental Model:** The **Rehearsal**. Before the actual performance (production), you rehearse with stand-ins (mocks) to verify the choreography (task execution) works correctly.
- **The Trap:** Not waiting for background tasks in tests. TestClient automatically waits for background tasks, but custom test setups might not. Ensure your test framework waits for task completion.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test background tasks with mocks — patch the task function and assert it was called with the right arguments. TestClient waits for background tasks to complete, so assertions work synchronously. I also test that task failures don't affect the response."

#### When should you use a task queue instead of background tasks?
- **The Engine Mechanism (Why it behaves this way):** Use a task queue (Celery, RQ, ARQ) when you need: (1) **Reliability** — tasks persist and retry on failure, (2) **Scalability** — tasks run on separate worker processes/machines, (3) **Scheduling** — delayed or periodic tasks, (4) **Monitoring** — task status, retries, failure alerts, (5) **Heavy workloads** — CPU-intensive or long-running tasks. Background tasks are for lightweight, non-critical, same-process work. Task queues are for anything that needs reliability, scaling, or monitoring.
- **The Unforgettable Mental Model:** The **In-House vs. Outsourced**. Background tasks are in-house staff — convenient but limited. Task queues are outsourced contractors — they have their own infrastructure, retry policies, and monitoring.
- **The Trap:** Starting with a task queue for simple needs. If you only need to log after a response, background tasks are simpler. Don't over-engineer with Celery for trivial post-response work.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use background tasks for lightweight, non-critical work — logging, cache invalidation. I use task queues for anything that needs reliability, retry, scaling, or monitoring — emails, payments, data processing. Task queues add complexity, so I only use them when the need justifies it."

## 8. Active recall test

1. **What are background tasks in FastAPI?**
   - **Explanation:** Functions that run after the response is sent to the client. Added via BackgroundTasks.add_task(). Run in the same process — suitable for lightweight, non-critical work.

2. **What is the execution order: endpoint, yield cleanup, background tasks?**
   - **Explanation:** Endpoint executes → response sent → yield cleanup runs → background tasks run. Cleanup happens before background tasks.

3. **What are the limitations of background tasks?**
   - **Explanation:** Same process (consumes app resources), no retry, no persistence (lost on restart), no monitoring. Not suitable for heavy or critical work.

4. **When should you use a task queue instead?**
   - **Explanation:** When you need reliability (retry), scalability (separate workers), scheduling (delayed/periodic), monitoring, or heavy workloads.

5. **How do you test background tasks?**
   - **Explanation:** Mock the task function and assert it was called. TestClient waits for background tasks to complete, so assertions work synchronously.

6. **Do background task failures affect the response?**
   - **Explanation:** No. The response is sent before background tasks run. Task failures don't affect the client's response.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Background Tasks should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Background Tasks, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Background Tasks.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
