# Timeout Handling

## 1. Why This Exists — The Problem First

An API request can remain pending long after the user has stopped caring about it. Without a deadline, a screen can show a spinner forever, an autocomplete can display results for an old query, and a server-side request can keep consuming a connection while the caller is already gone. The fix is not merely “wait less”: we need to decide what timeout means, stop work when possible, and clean up the timer and UI state on every path.

## 2. The Analogy — Make It Obvious

Imagine sending a runner to collect a parcel. You give the runner a deadline and keep a phone line open. If the runner returns before the deadline, you take the parcel and hang up the phone. If the deadline arrives first, you hang up, tell the customer the attempt timed out, and—when possible—send a cancellation notice so the runner stops spending effort on a delivery nobody is waiting for.

The deadline is the timeout policy. The phone line is the promise or request you are awaiting. Hanging up the line is cancellation, such as `AbortController.abort()`. A race-based timeout can stop your waiting, but it does not automatically call the runner back: the underlying operation may still finish in the background. That distinction is the source of many timeout bugs.

## 3. How It Actually Works — The Full Explanation

JavaScript timers do not interrupt running code. `setTimeout` queues a callback after at least the requested delay; the callback runs only when the current call stack is empty and the event loop gets to it. A timeout therefore measures how long the program has waited in an asynchronous period. It cannot forcibly stop a synchronous loop that blocks the thread.

For an abortable `fetch`, the usual sequence is:

1. Create an `AbortController` and pass its `signal` to `fetch`.
2. Start a timer that calls `controller.abort()` at the deadline.
3. If the response arrives first, use it and clear the timer.
4. If the timer fires first, `fetch` rejects with an abort error. The `finally` block still clears the timer because cleanup belongs to both success and failure paths.

Aborting is a request to stop work, not a promise that every lower-level byte has vanished instantly. The browser rejects the fetch promise and can stop the network operation; a remote server may already have processed the request. That is why a timeout is not proof that the server did nothing. Make retried operations safe to repeat, especially writes.

`Promise.race` expresses “which promise settles first?” It does not cancel the slower promise. A timeout promise can make the caller stop waiting while the original fetch continues. This is useful for non-cancelable work, but the losing operation still needs its own cleanup, and its eventual rejection must not become an unhandled rejection.

Retries add another boundary. Usually each attempt gets its own timeout, while the whole operation gets a larger overall deadline. Between attempts, exponential backoff (`base * 2 ** attempt`) reduces pressure on a struggling service; jitter prevents many clients from retrying in the same synchronized burst. Retry only failures that are transient or explicitly marked retryable, and only when the operation is safe to repeat. Caller cancellation, validation failures, authentication failures, other non-retryable HTTP responses, and non-idempotent writes must be rethrown immediately. A timeout may be transient, but it is not automatically safe to repeat.

## 4. Real Code — See It Working

This is a runnable Node.js example. It uses a local HTTP server so the fast and timed-out paths can be observed without relying on the network.

```js
import { createServer } from "node:http";

const server = createServer((_request, response) => {
  setTimeout(() => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  }, 100);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

async function fetchWithTimeout(url, milliseconds) {
  const controller = new AbortController();
  // WHY: the timer turns an indefinitely pending fetch into a bounded attempt.
  const timeoutId = setTimeout(() => controller.abort(), milliseconds);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`request exceeded ${milliseconds}ms`, { cause: error });
    }
    throw error;
  } finally {
    // WHY: without this, a successful request leaves a callback scheduled.
    clearTimeout(timeoutId);
  }
}

try {
  console.log(await fetchWithTimeout(`http://127.0.0.1:${port}`, 50));
} catch (error) {
  console.log(error.message); // request exceeded 50ms
} finally {
  server.close();
}
```

When the API cannot be aborted, a race can bound the caller’s wait, but it cannot stop the underlying work:

```js
function withTimeout(promise, milliseconds) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`timed out after ${milliseconds}ms`)),
      milliseconds,
    );
  });

  // WHY: finally clears the deadline after either winner; the original
  // operation still runs if it loses because Promise.race does not cancel it.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

const result = await withTimeout(Promise.resolve("cache hit"), 50);
console.log(result); // cache hit
```

Here is a retry boundary with one timeout per attempt, one overall deadline, and a caller signal. It retries only repeat-safe transient failures; an idempotency key can justify setting `idempotent: true` for a write, but the example does not assume that a timed-out write is safe.

```js
function isRetryableFailure(error, { idempotent, retryableStatuses }) {
  if (!idempotent) return false;
  if (error.retryable === true || error.code === "ETIMEDOUT") return true;
  if (error instanceof TypeError) return true; // fetch network failure
  return retryableStatuses.includes(error.status);
}

function waitForBackoff(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const backoff = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(backoff);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function retryingFetch(url, {
  attempts = 3,
  attemptMs = 200,
  totalMs = 1000,
  method = "GET",
  idempotent = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"].includes(method),
  retryableStatuses = [500, 502, 503, 504],
  signal,
} = {}) {
  const overallController = new AbortController();
  const overallTimeoutError = Object.assign(new Error("overall timeout"), { code: "ETIMEDOUT" });
  const overallTimeout = setTimeout(() => overallController.abort(overallTimeoutError), totalMs);
  const callerAndOverall = signal
    ? AbortSignal.any([signal, overallController.signal])
    : overallController.signal;
  const deadline = Date.now() + totalMs;

  try {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (signal?.aborted) throw signal.reason;
      if (overallController.signal.aborted) throw overallController.signal.reason;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw overallTimeoutError;

      const attemptController = new AbortController();
      const attemptTimeoutError = Object.assign(new Error(`attempt exceeded ${attemptMs}ms`), {
        code: "ETIMEDOUT",
        retryable: true,
      });
      const attemptTimeout = setTimeout(
        () => attemptController.abort(attemptTimeoutError),
        Math.min(attemptMs, remaining),
      );
      try {
        const response = await fetch(url, {
          method,
          signal: AbortSignal.any([callerAndOverall, attemptController.signal]),
        }).finally(() => clearTimeout(attemptTimeout));
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return response;
      } catch (error) {
        clearTimeout(attemptTimeout);
        // WHY: caller cancellation is not a retryable failure; rethrow its
        // reason immediately so no later attempt or backoff can start.
        if (signal?.aborted) throw signal.reason;
        if (overallController.signal.aborted) throw overallController.signal.reason;
        if (attemptController.signal.aborted) error = attemptTimeoutError;
        if (attempt === attempts - 1 || !isRetryableFailure(error, { idempotent, retryableStatuses })) {
          throw error;
        }
        // WHY: backoff gives a recovering service room before the next try.
        const delay = 50 * 2 ** attempt + Math.random() * 50;
        await waitForBackoff(delay, callerAndOverall);
      }
    }
  } finally {
    clearTimeout(overallTimeout);
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you implement a timeout for `fetch`?**

Create an `AbortController`, pass its signal to `fetch`, schedule `controller.abort()` with `setTimeout`, and clear that timer in `finally`. Catch the abort separately if the UI needs to distinguish a deadline from a network failure or an HTTP error.

**Q: Does `setTimeout` guarantee that the request is canceled at exactly that millisecond?**

No. It guarantees only that its callback becomes eligible after the delay. A blocked JavaScript thread, a busy event loop, or scheduling overhead can make it run later. It also cannot undo work already performed by the server.

**Q: What is the difference between a timeout and cancellation?**

A timeout is a policy: stop waiting after a limit. Cancellation is the mechanism or signal used to stop an operation. A timeout can trigger cancellation, but a user navigating away can also trigger the same cancellation without any deadline being reached.

**Q: What is the `Promise.race` timeout caveat?**

`Promise.race` settles with the first promise but does not cancel the losers. A raced fetch can continue using bandwidth and resources after the caller receives a timeout error. Prefer an abort signal when the operation supports it; otherwise make the underlying operation safe to finish and clean up its own resources.

**Q: What happens to an in-flight `fetch` after `abort()`?**

The fetch promise rejects, commonly with an error whose name is `AbortError`, and the browser or runtime can stop the client-side operation. The server may still receive or complete the request, so cancellation is not a rollback and does not guarantee that no side effect happened.

**Q: Why clear the timeout in `finally`?**

The timer is needed only while the operation is pending. `finally` runs after both fulfillment and rejection, so it prevents a later callback from aborting an already-settled request, keeps the event loop cleaner, and avoids retaining closures longer than necessary.

**Q: How should timeout errors be shown in a UI?**

Keep the request state explicit: loading, success, timeout, abort, or another error. A timeout message should explain that the service took too long and offer a safe retry; it should not claim that the server definitely failed or that a write definitely did not happen. Ignore cancellation caused by an intentional unmount or navigation when that is not a user-visible failure.

**Q: How do timeout and retry work together?**

Give each attempt a bounded timeout and enforce a separate overall deadline. Retry only transient, repeat-safe failures, use backoff with jitter, and stop immediately when the caller cancels. Otherwise retries can turn one slow request into a traffic spike or duplicate a side effect.

## 6. The Traps — What Goes Wrong

- **Leaving the timer running:** A request succeeds, but its timeout callback still runs later. It may perform unnecessary work or abort a controller that other code accidentally reused. Put `clearTimeout` in `finally`.

- **Thinking a timeout kills synchronous work:** `setTimeout` cannot interrupt a CPU-heavy loop. Move expensive work to a worker or split it into yielding chunks; use request cancellation for async work.

- **Using `Promise.race` as cancellation:** The race rejects quickly, but the losing fetch, stream, or database operation may continue. Use `AbortController` where supported, or add an operation-specific cancellation API.

- **Treating every abort as a timeout:** A user cancel, component cleanup, and deadline can all produce an abort-shaped error. Track the reason or keep separate state so navigation does not show “server timed out.”

- **Retrying every timeout blindly:** A timed-out `POST` may have reached the server and committed before the response was lost. Retry only with an idempotency key or an operation designed to be repeat-safe.

- **Creating one controller for all retries:** Once a signal is aborted, it stays aborted. Create a fresh per-attempt controller and combine it with a longer-lived overall signal.

- **Forgetting backoff and an overall deadline:** Three attempts with three timeouts can exceed the product’s acceptable wait by a large margin. Budget the full sequence, including delays between attempts.

- **Updating UI after the request is no longer relevant:** An old search response can overwrite a newer query. Cancel stale work or associate each response with the request identity that started it before committing data.

## 7. Compare With Related Concepts

| Concept | Key difference | When to use it |
| --- | --- | --- |
| Timeout vs cancellation | Timeout is a deadline policy; cancellation is a stop signal. | Set a timeout for bounded waiting; cancel when the caller no longer needs the work. |
| Timeout vs `Promise.race` | A timeout is the behavior you want; `Promise.race` is only a promise-composition tool and does not cancel losers. | Use an abortable signal for fetch; use a race only when bounding the wait is enough. |
| Timeout vs retry | Timeout ends one attempt; retry starts another attempt. | Retry transient, repeat-safe failures after a bounded timeout and backoff. |
| Timeout vs HTTP error | A timeout may mean no response arrived; an HTTP error is a received response with a failure status. | Show different diagnostics and choose retry policy based on the failure class. |
| Timeout vs race condition | Timeout handles excessive waiting; a race condition handles competing completions arriving in an unsafe order. | Use deadlines for latency; use request identity or cancellation for stale-result ordering. |
| Per-attempt vs overall timeout | Per-attempt limits one try; overall timeout limits the complete retry operation. | Use both when retries are allowed so the user has one predictable maximum wait. |

## 8. 🧠 The Memory Hook — What Sticks

Treat async work like a delivery with a deadline: stop waiting, cancel the courier when you can, and always hang up the timer in `finally`. `Promise.race` only makes you leave the queue—it does not call the courier back—so retries need their own safety and total time budget.
