# Load Balancing

## Detailed explanation

Load balancing distributes requests across multiple backend instances so traffic is shared and failures are tolerated.

## 1. One-line mental model

Spread requests across healthy servers.

## 2. Problem it solves

One server cannot handle all traffic or provide high availability alone.

## 3. Core idea

- Can be layer 4 or layer 7.
- Uses algorithms like round-robin, least connections, or weighted routing.
- Requires health checks.
- Works best with stateless app instances.
- Can drain connections during deploys.

## 4. Visual / analogy

```txt
Traffic officer sends cars to open lanes.
```

## 5. Minimal example

```txt
Load balancer -> app-1/app-2/app-3
```

## 6. Real-world example

API runs 6 containers behind ALB; unhealthy containers stop receiving traffic.

## 7. Common interview questions

#### What is load balancing?
- **The Engine Mechanism (Why it behaves this way):** Load balancing distributes incoming requests across multiple backend instances so traffic is shared and no single server is overwhelmed. A load balancer (hardware appliance, software like HAProxy, or cloud service like AWS ALB) sits between clients and backend servers, using algorithms to decide which instance receives each request. Common algorithms include round-robin (distribute evenly), least connections (send to the instance with fewest active connections), weighted routing (send more traffic to more powerful instances), and IP hash (same client always goes to the same instance). The load balancer performs health checks to detect unhealthy instances and stops routing traffic to them. It works best with stateless app instances that don't require sticky sessions.
- **The Unforgettable Mental Model:** Load balancing is like a **traffic officer at a multi-lane intersection**. They direct cars to the least congested lane, close lanes that are blocked (unhealthy instances), and keep traffic flowing smoothly.
- **The Trap:** Using load balancing with stateful servers that store session data in memory. If a user's session is on instance A but the load balancer routes their next request to instance B, the session is lost.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Load balancing distributes requests across multiple backend instances to share traffic and tolerate failures. A load balancer uses algorithms like round-robin, least connections, or weighted routing to decide which instance receives each request. It performs health checks to detect unhealthy instances and stops routing to them. Load balancing works best with stateless app instances — if servers hold session state in memory, sticky sessions or shared session stores are needed. I use cloud load balancers (ALB, NLB) for production, with health checks, connection draining for deploys, and auto-scaling integration."

#### Why does load balancing matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Load balancing matters because a single server cannot handle all traffic or provide high availability alone. By distributing requests across multiple instances, load balancing increases total capacity (more servers = more requests handled), provides fault tolerance (if one instance fails, others continue serving), enables zero-downtime deployments (drain traffic from old instances before routing to new ones), and supports auto-scaling (add or remove instances based on traffic). Without load balancing, traffic spikes overwhelm a single server, server failures cause total outages, and deployments require downtime.
- **The Unforgettable Mental Model:** Load balancing is like a **team of cashiers at a store**. One cashier can only serve so many customers. Multiple cashiers serve more customers, and if one goes on break, the others keep serving.
- **The Trap:** Assuming load balancing eliminates the need for application-level resilience. Load balancing distributes traffic but doesn't handle application errors, database failures, or cascading failures between services.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Load balancing matters because it increases capacity, provides fault tolerance, enables zero-downtime deployments, and supports auto-scaling. A single server can't handle all traffic or survive failures. By distributing requests across multiple instances, load balancing ensures that traffic spikes are handled, server failures don't cause outages, and deployments happen without downtime. I combine load balancing with stateless app design, health checks, connection draining, and auto-scaling for a resilient production architecture."

#### What bugs happen when load balancing is handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor load balancing causes several production issues. Sticky sessions with in-memory state cause session loss when instances restart or are removed. Health checks that are too aggressive remove healthy instances from the pool during temporary slowdowns. Health checks that are too lenient continue routing to unhealthy instances, causing client errors. Uneven load distribution (some instances overloaded, others idle) wastes resources and causes slow responses for users routed to overloaded instances. Not draining connections during deployments causes in-flight requests to fail when instances are terminated. Load balancer becoming a single point of failure — if the load balancer itself fails, all traffic is lost.
- **The Unforgettable Mental Model:** Poor load balancing is like a **traffic officer who sends all cars to one lane**. Some lanes are empty while one is gridlocked, and closed lanes still receive traffic.
- **The Trap:** Not configuring connection draining during deployments. When an instance is terminated, in-flight requests are dropped, causing client errors and failed transactions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor load balancing causes session loss from sticky sessions with in-memory state, incorrect health checks removing healthy instances or routing to unhealthy ones, uneven load distribution wasting resources, and failed requests from missing connection draining during deployments. The most common bug is not draining connections — when an instance is terminated during deployment, in-flight requests fail. I configure health checks with appropriate thresholds, use least-connections or weighted routing for even distribution, enable connection draining for graceful deploys, and ensure the load balancer itself is highly available."

#### How does load balancing affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients typically don't know they're behind a load balancer — the load balancer presents a single endpoint. However, load balancing affects the frontend through response consistency (different instances may return slightly different data if caches differ), session persistence (sticky sessions ensure a user always hits the same instance), and error handling (if an instance fails, the load balancer retries on another instance, which may cause duplicate POST requests). The frontend may experience slightly different response times depending on which instance handles the request. For WebSocket connections, load balancing must support connection persistence — the same instance must handle the entire WebSocket session.
- **The Unforgettable Mental Model:** Load balancing for the frontend is like a **call center with multiple agents**. You call one number, but different agents may answer. Most interactions are consistent, but you might notice slight differences between agents.
- **The Trap:** The frontend assuming consistent response times across requests. Different instances may have different load levels, causing variable response times.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend typically doesn't know about load balancing — it sees a single endpoint. But load balancing affects response consistency (different instances may have different cache states), session persistence (sticky sessions for stateful apps), and error handling (load balancer retries may cause duplicate POSTs). For WebSockets, the load balancer must maintain connection persistence to the same instance. I design the frontend to handle variable response times and ensure the backend is stateless so any instance can handle any request consistently."

#### How would you test load balancing behavior?
- **The Engine Mechanism (Why it behaves this way):** Testing load balancing involves verifying traffic distribution, health check behavior, failover, and connection draining. Send many requests and verify they're distributed across instances (check instance logs or response headers with instance ID). Test health checks by stopping an instance and verifying traffic stops routing to it. Test failover by removing all but one instance and verifying traffic routes to the remaining instance. Test connection draining by initiating a deployment and verifying in-flight requests complete before the instance is terminated. Test uneven load by simulating traffic spikes and verifying the load balancer distributes correctly. Test that the load balancer itself is highly available.
- **The Unforgettable Mental Model:** Testing load balancing is like **testing a team of workers**. Verify work is distributed evenly, verify sick workers are replaced, verify the team continues when someone leaves, and verify no work is lost during shift changes.
- **The Trap:** Only testing with a single instance. Load balancing behavior only manifests with multiple instances — test with at least two, preferably three or more.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test load balancing by verifying traffic distribution across instances, health check behavior, failover, and connection draining. I send many requests and verify even distribution. I stop an instance and verify traffic stops routing to it. I test failover with remaining instances. I test connection draining during deployments. I simulate traffic spikes to verify distribution under load. I test with multiple instances — at least two, preferably three or more. The key is testing failure scenarios, not just the happy path."

## 8. Active recall test

1. **Explain load balancing without looking at notes.**
   - **Explanation:** Load balancing distributes requests across multiple backend instances using algorithms like round-robin, least connections, or weighted routing. It performs health checks to detect unhealthy instances, stops routing to them, and works best with stateless apps. Increases capacity, provides fault tolerance, and enables zero-downtime deployments.

2. **Give one production bug related to load balancing.**
   - **Explanation:** Not configuring connection draining during deployments causes in-flight requests to fail when instances are terminated. Users see errors during deployments because their active requests are dropped before completion.

3. **Give one API example where load balancing matters.**
   - **Explanation:** An API running 6 containers behind an AWS ALB. The ALB distributes requests using least-connections, performs health checks every 30 seconds, removes unhealthy containers, and drains connections during rolling deployments.

4. **Explain how a frontend client experiences load balancing.**
   - **Explanation:** The frontend sees a single endpoint — it doesn't know about load balancing. Effects include variable response times (different instance loads), potential response inconsistency (different cache states), and retry behavior (load balancer may retry failed requests on another instance).

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Load Balancing is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Load Balancing in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Load Balancing in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
