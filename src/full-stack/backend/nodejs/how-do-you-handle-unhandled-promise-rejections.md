# How do you handle unhandled promise rejections

## Detailed explanation

How do you handle unhandled promise rejections is a core Node.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you handle unhandled promise rejections by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply Node.js rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle unhandled promise rejections affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle unhandled promise rejections in Node.js?
- **The Engine Mechanism (Why it behaves this way):** Unhandled promise rejections occur when a Promise is rejected without a `.catch()` handler or `try/catch` in async/await. Node.js emits an `unhandledRejection` event on the `process` object. In Node.js 15+, unhandled rejections crash the process by default (changed from warning in earlier versions). You can listen for `process.on('unhandledRejection', (reason, promise) => { ... })` to handle them — log the error, identify the source, and fix the code. The recommended approach is: handle rejections at the source (`.catch()` or `try/catch`), use a global handler as a safety net, and fix the root cause.
- **The Unforgettable Mental Model:** The **Dropped Ball**. An unhandled promise rejection is like a dropped ball — no one caught it. The global handler is the safety net that catches it, but the real fix is ensuring someone catches the ball at the source.
- **The Trap:** Relying solely on the global handler — it's a safety net, not a replacement for proper error handling at the source.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Unhandled promise rejections are handled by listening to `process.on('unhandledRejection')`. In Node.js 15+, they crash the process by default. I log the error, identify the source, and fix the code. The global handler is a safety net — the real fix is handling rejections at the source with `.catch()` or `try/catch`. I also use error tracking services (Sentry, Datadog) to catch and alert on unhandled rejections. The key principle: handle at the source, use global handler as safety net, fix the root cause."

#### Why does handling unhandled promise rejections matter in backend/full-stack systems?
- **The Engine Mechanism (Why it behaves this way):** Unhandled promise rejections crash the Node.js process (Node.js 15+), causing service downtime. Without proper handling, rejections go unnoticed, errors are lost, and debugging becomes difficult. For full-stack systems, unhandled rejections cause API failures — frontend clients see errors or timeouts. Proper handling ensures errors are logged, the process restarts automatically, and the root cause is fixed. In production, unhandled rejections are a leading cause of unexpected crashes.
- **The Unforgettable Mental Model:** The **Silent Killer**. Unhandled promise rejections are like a silent killer — they crash the process without warning, causing downtime and lost errors.
- **The Trap:** Not realizing that Node.js 15+ crashes on unhandled rejections — earlier versions only warned.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Unhandled promise rejections crash the process in Node.js 15+, causing downtime. Without proper handling, rejections go unnoticed, errors are lost, and debugging is difficult. For full-stack systems, unhandled rejections cause API failures — frontend clients see errors. Proper handling ensures errors are logged, the process restarts, and the root cause is fixed. In production, unhandled rejections are a leading cause of unexpected crashes. I handle rejections at the source, use a global handler as safety net, and monitor rejection rates."

#### What is a simple implementation or design?
- **The Engine Mechanism (Why it behaves this way):** Global handler: `process.on('unhandledRejection', (reason, promise) => { logger.error('Unhandled Rejection:', reason); process.exit(1); })`. Source handling with .catch(): `fetchData().then(process).catch(err => logger.error(err))`. Source handling with async/await: `try { const data = await fetchData(); process(data); } catch (err) { logger.error(err); }`. Error tracking: integrate with Sentry — `Sentry.captureException(reason)`. Express error handling: `app.use((err, req, res, next) => { logger.error(err); res.status(500).json({ error: 'Internal Server Error' }); })`.
- **The Unforgettable Mental Model:** The **Three-Layer Defense**. Unhandled rejection handling is like a three-layer defense — source handling (first line), global handler (safety net), error tracking (monitoring).
- **The Trap:** Not handling rejections in async/await — forgetting `try/catch` around `await` calls.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate unhandled rejection handling with three layers. First, source handling — `.catch()` for promises, `try/catch` for async/await. Second, global handler — `process.on('unhandledRejection')` as a safety net. Third, error tracking — Sentry or Datadog for monitoring and alerting. I also show Express error handling middleware for route-level error handling. The key is handling at the source — the global handler is a safety net, not a replacement."

#### What edge cases can break it?
- **The Engine Mechanism (Why it behaves this way):** The forgotten catch bug: `async function handler() { const data = await fetchData(); process(data); }` — no `try/catch`, rejection is unhandled. The swallowed error bug: `.catch(() => {})` — errors are silently swallowed, making debugging impossible. The async event listener bug: `emitter.on('data', async (data) => { await process(data); })` — async event listeners are fire-and-forget, errors are unhandled. The Promise.all bug: `Promise.all([p1, p2, p3])` — if any promise rejects, all results are lost; use `Promise.allSettled()` for partial results. The Node.js version bug: Node.js < 15 only warns, Node.js 15+ crashes — behavior differs by version.
- **The Unforgettable Mental Model:** The **Missing Net**. Forgotten catch is like a missing safety net — the ball (rejection) falls through, crashing the process.
- **The Trap:** Using `.catch(() => {})` — silently swallowing errors makes debugging impossible.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common unhandled rejection edge cases are forgotten catch — no `try/catch` around `await` calls. Swallowed errors — `.catch(() => {})` silently swallows errors. Async event listeners — fire-and-forget, errors are unhandled. Promise.all — any rejection loses all results; use `Promise.allSettled()`. Node.js version differences — < 15 warns, 15+ crashes. I handle all rejections at the source, never swallow errors, wrap async event listeners in try/catch, use `Promise.allSettled()` for partial results, and test across Node.js versions."

#### How would you test it?
- **The Engine Mechanism (Why it behaves this way):** Testing unhandled promise rejections involves verifying source handling, global handler behavior, error tracking, and crash recovery. Source handling tests: verify rejections are caught with `.catch()` or `try/catch`. Global handler tests: verify the global handler catches unhandled rejections and logs them. Error tracking tests: verify errors are sent to tracking services. Crash recovery tests: verify the process restarts after a crash (Node.js 15+). Version tests: verify behavior across Node.js versions.
- **The Unforgettable Mental Model:** The **Rejection Test Lab**. Testing unhandled rejections is like a rejection lab — you verify source handling, global handler, error tracking, crash recovery, and version behavior.
- **The Trap:** Not testing across Node.js versions — behavior differs between < 15 and 15+.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test unhandled promise rejections with five tests. First, source handling — verify rejections are caught with `.catch()` or `try/catch`. Second, global handler — verify the global handler catches and logs unhandled rejections. Third, error tracking — verify errors are sent to tracking services. Fourth, crash recovery — verify the process restarts after a crash (Node.js 15+). Fifth, version tests — verify behavior across Node.js versions. I intentionally throw unhandled rejections in tests to verify the handler works correctly."

#### How does it affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Unhandled promise rejections affect frontend clients through API failures — crashed processes cause 500 errors or connection refused errors. Proper handling minimizes downtime — errors are logged, the process restarts automatically, and the root cause is fixed. For full-stack systems, unhandled rejections cause frontend errors, loading spinners, or timeouts. Proper handling ensures minimal disruption — users may see a brief delay, but the service recovers automatically.
- **The Unforgettable Mental Model:** The **Brief Interruption**. Proper unhandled rejection handling is like a brief interruption — users see a momentary delay, but the service recovers automatically.
- **The Trap:** Not realizing that unhandled rejections directly affect frontend user experience.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Unhandled promise rejections affect frontend clients through API failures — crashed processes cause 500 errors or connection refused. Proper handling minimizes downtime — errors are logged, the process restarts, and the root cause is fixed. For full-stack systems, unhandled rejections cause frontend errors, loading spinners, or timeouts. Proper handling ensures minimal disruption — users see a brief delay, but the service recovers. I monitor rejection rates and crash rates to ensure unhandled rejections are handled effectively."

#### What would you monitor in production?
- **The Engine Mechanism (Why it behaves this way):** Production unhandled rejection monitoring includes: rejection rate (unhandled rejections per minute), crash rate (process restarts per hour), error logging (stack traces, context), rejection source (which promise rejected), and fix rate (time from detection to fix). Tools: error tracking services (Sentry, Datadog), process manager logs, APM tools for crash rate. Alerts for rejection rate spikes, crash rate increases, and unresolved rejections.
- **The Unforgettable Mental Model:** The **Rejection Monitor**. Unhandled rejection monitoring is like a monitor — rejection rate is the frequency gauge, crash rate is the restart counter, fix rate is the resolution meter.
- **The Trap:** Not monitoring rejection source — without knowing which promise rejected, fixing is impossible.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor rejection rate, crash rate, error logging, rejection source, and fix rate. I use error tracking services (Sentry, Datadog), process manager logs, and APM tools. I set alerts for rejection rate spikes, crash rate increases, and unresolved rejections. Rejection source is critical — without knowing which promise rejected, fixing is impossible. The key is monitoring both the frequency (rejection rate) and the resolution (fix rate) of unhandled rejections."

## 8. Active recall test

1. **What happens to unhandled promise rejections in Node.js 15+?**
   - **Explanation:** They crash the process by default. Earlier versions (pre-15) only warned. This change makes unhandled rejections a critical issue in modern Node.js.

2. **How do you handle unhandled promise rejections globally?**
   - **Explanation:** Listen to `process.on('unhandledRejection', (reason, promise) => { ... })`. Log the error, then exit with code 1 for process manager restart.

3. **What is the difference between handling at the source vs. global handler?**
   - **Explanation:** Source handling (`.catch()`, `try/catch`) catches rejections where they occur — the proper approach. Global handler is a safety net for missed rejections — not a replacement.

4. **What is the problem with `.catch(() => {})`?**
   - **Explanation:** It silently swallows errors — no logging, no handling, no debugging clues. Always log or handle errors in `.catch()`.

5. **How do async event listeners cause unhandled rejections?**
   - **Explanation:** Async event listeners are fire-and-forget — errors in async listeners are unhandled unless caught inside the listener with try/catch.

6. **How do unhandled promise rejections affect frontend clients?**
   - **Explanation:** Crashed processes cause API failures — 500 errors or connection refused. Proper handling minimizes downtime — errors are logged, process restarts, root cause is fixed.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle unhandled promise rejections in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle unhandled promise rejections in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
