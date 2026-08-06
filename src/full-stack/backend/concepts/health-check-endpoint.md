# Health Check Endpoint

## Detailed explanation

A health check endpoint reports whether a service is alive and ready to receive traffic.

## 1. One-line mental model

Health checks tell infrastructure whether to route traffic to an instance.

## 2. Problem it solves

Load balancers and orchestrators need automated signals to restart or remove unhealthy app instances.

## 3. Core idea

- Liveness means process is alive.
- Readiness means app can serve traffic.
- Check critical dependencies carefully.
- Keep health endpoints fast.
- Do not expose sensitive internals publicly.

## 4. Visual / analogy

```txt
Doctor check before joining game.
```

## 5. Minimal example

```txt
GET /healthz -> 200 OK
```

## 6. Real-world example

Load balancer removes instance when readiness check fails database connectivity.

## 7. Common interview questions

#### What is a health check endpoint?
- **The Engine Mechanism (Why it behaves this way):** A health check endpoint is a lightweight HTTP endpoint (typically `/health`, `/healthz`, or `/ready`) that reports whether a service is alive and ready to receive traffic. Load balancers, orchestrators (Kubernetes), and monitoring systems poll this endpoint at regular intervals. There are two types: liveness checks (is the process alive?) and readiness checks (can the service handle traffic?). Liveness checks verify the process is running — a simple 200 response suffices. Readiness checks verify critical dependencies are available — database connectivity, cache connectivity, queue connectivity. If liveness fails, the orchestrator restarts the container. If readiness fails, the load balancer stops routing traffic to the instance but doesn't restart it.
- **The Unforgettable Mental Model:** Health checks are like a **doctor's vital signs check**. Liveness = is the patient breathing? Readiness = is the patient healthy enough to go to work?
- **The Trap:** Making health checks too heavy — checking every dependency on every poll. This turns the health endpoint into a mini load test that runs every 10 seconds, potentially overwhelming dependencies.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A health check endpoint reports whether a service is alive and ready to receive traffic. There are two types: liveness (is the process alive?) and readiness (can it handle traffic?). Load balancers and orchestrators poll these endpoints regularly. Liveness checks are simple — a 200 response means the process is running. Readiness checks verify critical dependencies — database, cache, queue connectivity. If liveness fails, the orchestrator restarts the container. If readiness fails, traffic is stopped but the container isn't restarted. I keep health checks lightweight and fast — they shouldn't perform expensive operations."

#### Why do health check endpoints matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Health checks matter because they enable automated infrastructure management. Load balancers use health checks to detect unhealthy instances and stop routing traffic to them, preventing client errors. Orchestrators use liveness checks to detect crashed processes and restart them automatically. Readiness checks prevent traffic from reaching instances that are still starting up (loading configuration, warming caches, establishing database connections). Health checks enable zero-downtime deployments — the orchestrator waits for the new instance to pass readiness checks before routing traffic. They also enable self-healing systems — failed instances are automatically restarted without human intervention.
- **The Unforgettable Mental Model:** Health checks are like a **building's fire alarm system**. They detect problems automatically, alert the right people (load balancer, orchestrator), and trigger the right response (stop traffic, restart container).
- **The Trap:** Not having separate liveness and readiness checks. A single health endpoint conflates "process is alive" with "service is ready," causing orchestrators to restart containers that are just slow to start, or routing traffic to containers that are alive but not ready.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Health checks matter because they enable automated infrastructure management — load balancers detect unhealthy instances, orchestrators restart crashed processes, and readiness checks prevent traffic from reaching instances that aren't ready. They enable zero-downtime deployments and self-healing systems. I implement separate liveness and readiness endpoints — liveness is a simple 200, readiness checks critical dependencies. I keep health checks fast and lightweight, and I use them as the primary signal for infrastructure automation."

#### What bugs happen when health checks are handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor health checks cause several production issues. Health checks that check too many dependencies cause cascading failures — if a non-critical dependency (like an analytics service) is down, the health check fails and traffic is stopped even though the core service works. Health checks that are too slow cause false failures — the check takes longer than the timeout, the orchestrator thinks the instance is unhealthy, and restarts it. Health checks that expose sensitive information (database connection strings, internal metrics) leak data publicly. Not having health checks means unhealthy instances continue receiving traffic, causing client errors. Health checks that don't distinguish liveness from readiness cause unnecessary restarts or premature traffic routing.
- **The Unforgettable Mental Model:** Poor health checks are like a **car alarm that goes off for everything**. Wind, a passing bird, or a loud noise triggers it — eventually nobody pays attention, or it causes unnecessary tow truck calls.
- **The Trap:** Checking all dependencies in the readiness probe. If a non-critical dependency is down, the entire instance is removed from the load balancer, even though the core functionality works fine.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor health checks cause cascading failures from checking non-critical dependencies, false failures from slow checks, data leaks from exposed internals, and continued traffic to unhealthy instances from missing checks. The most common bug is checking all dependencies in the readiness probe — if a non-critical service is down, the entire instance is removed from the load balancer. I check only critical dependencies in readiness probes, keep checks fast (under 1 second), don't expose sensitive information, and separate liveness from readiness."

#### How do health check endpoints affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients don't directly interact with health check endpoints — they're used by infrastructure. However, health checks indirectly affect the frontend through availability and reliability. When health checks work correctly, unhealthy instances are removed from the load balancer, so the frontend only hits healthy instances — fewer errors, better reliability. When health checks fail or are misconfigured, the frontend experiences errors from unhealthy instances, increased latency from overloaded instances, or complete outages when all instances are incorrectly marked unhealthy. During deployments, readiness checks ensure the frontend only hits instances that are fully started and ready.
- **The Unforgettable Mental Model:** Health checks for the frontend are like a **quality control system in a factory**. The customer doesn't see the QC process, but they benefit from receiving only properly inspected products.
- **The Trap**: The frontend not handling instances that pass health checks but are still slow to respond. A readiness check may pass (database connected) but the instance may still be warming caches, causing slow initial responses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend doesn't directly interact with health checks, but benefits from them through improved availability and reliability. Healthy instances serve traffic, unhealthy ones are removed. During deployments, readiness checks ensure the frontend only hits ready instances. However, the frontend should still handle occasional errors — health checks aren't perfect, and an instance may pass checks but still have issues. I design the frontend with retry logic, error boundaries, and graceful degradation to handle infrastructure-level failures."

#### How would you test health check endpoints?
- **The Engine Mechanism (Why it behaves this way):** Testing health checks involves verifying correct responses for healthy and unhealthy states. Test the liveness endpoint returns 200 when the process is running. Test the readiness endpoint returns 200 when all critical dependencies are available. Test the readiness endpoint returns 503 when a critical dependency is unavailable. Test that the load balancer stops routing traffic when readiness fails. Test that the orchestrator restarts the container when liveness fails. Test health check response time — it should be fast (under 1 second). Test that health checks don't expose sensitive information. Test that health checks don't overload dependencies when polled frequently.
- **The Unforgettable Mental Model:** Testing health checks is like **testing a smoke detector**. Verify it beeps when there's smoke (unhealthy), stays silent when there's no smoke (healthy), and doesn't trigger false alarms (false positives).
- **The Trap**: Only testing the happy path (healthy state). Test unhealthy states — disconnect the database, stop the cache — and verify the health check correctly reports the failure.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test health checks by verifying correct responses for healthy and unhealthy states. Liveness returns 200 when running. Readiness returns 200 when dependencies are available, 503 when they're not. I test load balancer behavior — traffic stops when readiness fails. I test orchestrator behavior — container restarts when liveness fails. I verify response time is fast, no sensitive data is exposed, and frequent polling doesn't overload dependencies. I test unhealthy states by disconnecting dependencies. The key is testing both healthy and unhealthy states."

## 8. Active recall test

1. **Explain health check endpoints without looking at notes.**
   - **Explanation:** Health check endpoints report whether a service is alive (liveness) and ready to handle traffic (readiness). Load balancers and orchestrators poll them regularly. Liveness = process running (200). Readiness = critical dependencies available (200) or not (503). Liveness failure triggers restart; readiness failure stops traffic routing.

2. **Give one production bug related to health checks.**
   - **Explanation:** Checking all dependencies (including non-critical ones) in the readiness probe causes the instance to be removed from the load balancer when a non-critical service (like analytics) is down. The core service works fine but receives no traffic because the health check is too strict.

3. **Give one API example where health checks matter.**
   - **Explanation:** Kubernetes probes: liveness at `/healthz` returns 200 if the process is running. Readiness at `/ready` checks database connectivity — returns 200 if connected, 503 if not. The load balancer routes traffic only to ready instances. Failed liveness triggers pod restart.

4. **Explain how a frontend client experiences health checks.**
   - **Explanation:** The frontend doesn't directly interact with health checks but benefits from improved availability — unhealthy instances are removed from the load balancer. During deployments, readiness checks ensure the frontend only hits ready instances. The frontend should still handle occasional errors with retry logic.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Health Check Endpoint is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Health Check Endpoint in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Health Check Endpoint in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
