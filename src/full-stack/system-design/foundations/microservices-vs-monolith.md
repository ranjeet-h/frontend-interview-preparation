# Microservices vs Monolith

## 1. Why This Exists — The Problem First

Year one: eight engineers, one Rails app, deploy on Friday, everyone goes home. Year four: eighty engineers, same repo. A one-line change in the billing module requires coordinating with payments, notifications, and auth teams. Deploys take three hours. One bad migration takes down checkout, search, and the admin dashboard because they all share one process and one database connection pool.

The rewrite pitch comes next: "Let's split into microservices." Six months later you have seventeen repos, distributed tracing nobody looks at, a payment service that can't deploy because the shared protobuf package broke CI, and **slower** feature delivery than before.

The real question isn't "monolith or microservices?" — it's **when does splitting the system buy you more than it costs?** Interviewers want to hear you understand both sides, not recite "Netflix uses microservices."

## 2. The Analogy — Make It Obvious

**Monolith** = **one large restaurant kitchen**. One head chef, one walk-in fridge, one ticket rail. Orders come in, everyone works in the same space. Easy to coordinate ("needs more salt" is shouted across the room). But if the walk-in fridge dies, the entire kitchen stops. And you can't hire a pastry specialist without them bumping elbows with the grill cook.

**Microservices** = **a food hall with separate vendors**. Pizza guy, sushi counter, taco stand — each runs their own kitchen, inventory, and hours. The food hall provides shared tables and payment (API gateway, service mesh). Pizza can stay open while sushi renovates. But now a customer order spanning pizza + sushi requires coordination, you need a central payment system, and tracing "where's my order?" crosses three vendors.

Startups run one kitchen. City-scale operations run food halls — when they can afford the overhead.

## 3. How It Actually Works — The Full Explanation

### Monolithic architecture

A monolith is a **single deployable unit** containing most or all application logic. Typically:

- One codebase (or a tightly coupled multi-module repo)
- One build artifact (JAR, Docker image, `git push heroku`)
- Shared database (often one schema, many tables)
- In-process function calls between "modules" (no network)

**Strengths:**

- **Simple to develop** — refactor across modules with IDE support, no API contracts between services
- **Simple to test** — integration tests hit one process
- **Simple to deploy** — one pipeline, one rollback
- **Simple to debug** — one stack trace, one log stream
- **Transactional consistency** — ACID across modules in one DB is straightforward
- **Performance** — no network hop between "services" that are really just packages

**Weaknesses:**

- **Scaling is all-or-nothing** — can't scale just the image-processing module
- **Deploy coupling** — any team's change ships with everyone else's
- **Technology lock-in** — one runtime (Java 17 everywhere)
- **Blast radius** — memory leak in reporting takes down checkout
- **Onboarding friction at scale** — codebase becomes intimidating

### Microservices architecture

Microservices split the system into **independently deployable services**, each owning a bounded business capability. Communication is over the network (HTTP, gRPC, message queues).

**Strengths:**

- **Independent deploys** — ship payments v2 without touching search
- **Independent scaling** — 20 instances of read-heavy catalog, 2 of admin API
- **Team autonomy** — squad owns service end-to-end (Amazon "two-pizza team")
- **Technology diversity** — Python for ML, Go for gateway, Node for BFF (if you can afford the ops cost)
- **Fault isolation** — circuit breakers limit cascade failures (in theory)
- **Clear boundaries** — forces explicit APIs and domain modeling

**Weaknesses:**

- **Distributed systems tax** — latency, partial failures, eventual consistency
- **Operational overhead** — CI/CD per service, monitoring, on-call rotations multiplied
- **Data ownership complexity** — no more single JOIN across user + order tables
- **Testing harder** — contract tests, staging environments that mirror production topology
- **Debugging harder** — request spans five services; need distributed tracing
- **Premature extraction** — wrong service boundaries are expensive to undo

### The decision framework (what interviewers want)

Ask:

1. **Team size and structure** — <10 engineers? Monolith is fine. Multiple autonomous squads? Services can match team boundaries (Conway's Law).
2. **Scaling profile** — Is one component 100x hotter than others? Independent scaling justifies a split.
3. **Release cadence** — Do teams block each other on deploys? Services decouple release trains.
4. **Domain clarity** — Do you understand bounded contexts (DDD)? Splitting along fuzzy lines creates distributed monoliths.
5. **Operational maturity** — Do you have K8s, observability, and SRE capacity? Microservices without that is pain.

**The honest answer:** Most startups should stay monolith (or modular monolith) longer than they think. Extract services when you have **concrete pain** — not because a blog post said to.

### Modular monolith — the middle path

Keep one deployable unit but enforce **module boundaries** in code (separate packages, no cross-module DB access, clear public APIs between modules). Extract to a service later when a module's scaling or team ownership demands it. This is increasingly the senior-engineer recommendation over big-bang microservice rewrites.

## 4. Real Code — See It Working

### Monolith — everything in one process

```
┌─────────────────────────────────────────┐
│           ecommerce-monolith            │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │  Users  │ │ Orders  │ │ Payments │  │
│  │ module  │ │ module  │ │  module  │  │
│  └────┬────┘ └────┬────┘ └────┬─────┘  │
│       └───────────┼───────────┘        │
│                   ▼                    │
│            ┌─────────────┐             │
│            │  PostgreSQL  │             │
│            │  (one DB)    │             │
│            └─────────────┘             │
└─────────────────────────────────────────┘
         Single deploy: docker push monolith:v42
```

```python
# monolith — in-process call, same transaction
def create_order(user_id: int, items: list) -> Order:
    user = users_repo.get(user_id)          # same process
    order = orders_repo.insert(user, items) # same DB connection
    payments.charge(user, order.total)      # function call, not HTTP
    notifications.send_receipt(user.email)  # still in-process
    db.commit()                             # one ACID transaction
    return order
```

### Microservices — network boundaries

```
┌──────────┐     ┌──────────┐     ┌────────────┐
│  User    │     │  Order   │     │  Payment   │
│ Service  │◄───►│ Service  │◄───►│  Service   │
│  :8081   │ gRPC│  :8082   │ gRPC│   :8083    │
└────┬─────┘     └────┬─────┘     └─────┬──────┘
     │                │                  │
     ▼                ▼                  ▼
  users_db        orders_db          payments_db
  (owned)         (owned)            (owned)
```

```python
# order-service — network calls, distributed transaction problem
def create_order(user_id: int, items: list) -> Order:
    user = user_client.get_user(user_id)       # HTTP/gRPC — can fail, timeout
    order = orders_repo.insert(user_id, items)
    try:
        payment_client.charge(user_id, order.total)  # separate service
    except PaymentError:
        orders_repo.mark_failed(order.id)    # compensating action — not ACID
        raise
    event_bus.publish("order.created", order)  # async notification
    return order
```

```bash
# Independent deploys
kubectl rollout restart deployment/order-service
# payment-service and user-service unaffected
```

### Extracting one service (evolution path)

```text
Step 1: Monolith with payments/ package
Step 2: payments/ talks to DB through payments_repository only
Step 3: Move payments_repository + API to payments-service
Step 4: Monolith calls payments-service via HTTP; delete in-process code
```

Strangler fig pattern — don't rewrite; peel off one capability at a time.

## 5. The Interview Questions — All of Them, Done Properly

**Q: Monolith vs microservices — which would you choose?**

I'd start with the simplest structure that matches team size and traffic. A monolith (or modular monolith) for early stage: faster iteration, easier debugging, ACID transactions. I'd extract microservices when there's clear pain — one component needs independent scaling, teams block each other on deploys, or a domain boundary is well understood. Never "microservices because scale" without naming the specific bottleneck a split solves.

**Q: What are the trade-offs of microservices?**

Independent deploy and scale per service, team autonomy, fault isolation — traded for network latency, distributed failure modes, harder testing and debugging, data consistency challenges, and significant operational overhead. You pay the tax on every cross-service call.

**Q: When is a monolith the better choice?**

Small team, unclear domain boundaries, low traffic, need for rapid product iteration, limited ops/SRE capacity, or heavy cross-module transactions. Most startups. Also when you haven't yet proven product-market fit — architecture should optimize for learning speed.

**Q: What is a distributed monolith?**

Services that must deploy together because of tight coupling — shared database, synchronous chains of calls, no real bounded contexts. Worst of both worlds: network overhead without independence. Smell: "we can't deploy service B until service A's migration lands."

**Q: How do microservices communicate?**

Synchronously: REST, gRPC (request/response, coupling, simpler mental model). Asynchronously: Kafka, RabbitMQ, SQS (decoupling, eventual consistency, harder to reason about). Good designs mix both — sync for queries, async for side effects.

**Q: How do you handle data in microservices?**

Database per service — each service owns its schema, no direct cross-DB joins. Cross-service data needs via API calls or replicated read models (CQRS). Accept eventual consistency or use sagas for multi-step transactions. This is the hardest part and where many migrations struggle.

**Q: What is Conway's Law?**

Organizations design systems that mirror their communication structure. Microservices work when team boundaries align with service boundaries. Misaligned teams + microservices = ownership fights and shared databases.

## 6. The Traps — What Goes Wrong

**Microservices on day one.** You spend six months building infra instead of product. No users, but you have Kubernetes. Classic startup failure mode.

**Shared database across services.** Three services, one Postgres — you've built a distributed monolith. Schema changes still require coordination. Give each service its own datastore.

**Synchronous call chains.** A → B → C → D on the critical path. p99 latency is the sum of p99s. One slow service tanks everything. Prefer async events for non-critical paths; cache aggressively.

**No distributed tracing.** Five services, five log formats, one angry user. Without trace IDs (OpenTelemetry, Jaeger), debugging is guesswork.

**Wrong service boundaries.** Splitting by technical layer ("user-service" + "database-service") instead of business capability ("billing-service", "inventory-service"). Boundaries should follow domain language.

**Ignoring the modular monolith option.** Interviewers respect "we'd keep a modular monolith and extract when we hit X threshold" more than "microservices always."

## 7. Compare With Related Concepts

**Monolith vs SOA (Service-Oriented Architecture).** SOA is an older enterprise pattern — larger, often ESB-mediated services. Microservices are smaller, decentralized, no central bus. Microservices are SOA ideas with smaller scope and modern tooling.

**Microservices vs Serverless.** Serverless (Lambda, Cloud Functions) is fine-grained, event-driven, vendor-managed scaling. Microservices are long-running processes you operate. Can combine: microservices triggered by serverless handlers.

**Microservices vs Modular Monolith.** Modular monolith = one deploy, enforced internal boundaries. Microservices = boundaries enforced by network. Evolution path: monolith → modular monolith → selective extraction.

**Horizontal Scaling vs Microservices.** You can horizontally scale a monolith (multiple instances behind LB). Microservices let you scale *parts* independently. Don't confuse "need more servers" with "need more services."

## 8. 🧠 The Memory Hook — What Sticks

One kitchen vs food hall. The kitchen is faster to run until eighty cooks collide. The food hall lets pizza scale separately from sushi — but someone has to coordinate the bill and explain why your order hit three kitchens. Pick the food hall when the kitchen is actually on fire, not because food halls sound modern.
