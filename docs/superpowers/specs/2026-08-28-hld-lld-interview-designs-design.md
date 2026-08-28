# HLD & LLD Interview Designs — Design Specification

**Status:** Approved for implementation on 2026-08-28

## Goal

Add a standalone, interview-focused system-design section containing ten High-Level Design (HLD) problems and ten Low-Level Design (LLD) problems. Every HLD problem must follow the user's 17-point HLD interview structure, and every LLD problem must follow the user's 13-point LLD structure. The existing 100-question system-design curriculum and existing backend deep-dive pages remain unchanged.

## Audience and learning outcome

The section is for interview preparation. A learner should be able to open any problem, state assumptions, draw a defensible design, walk through the important flow, discuss failure and scale, and answer common follow-ups without memorizing a vendor-specific script.

The chapters will teach reasoning rather than only list components:

- Explain why a component exists and what fails without it.
- Make scale assumptions visible and use them to justify architecture.
- Separate the critical path from asynchronous work.
- Name the consistency and concurrency requirement that makes each design correct.
- End with trade-offs and a short interview recap.

## Scope boundaries

### In scope

- A new `HLD & LLD Interview Designs` section in the mdBook.
- Ten self-contained HLD chapter files.
- Ten self-contained LLD chapter files.
- HLD and LLD index pages with study guidance and topic tables.
- Navigation links in `src/SUMMARY.md`.
- Mermaid or text diagrams where they clarify topology or object relationships.
- Language-neutral LLD class diagrams and pseudocode. The section is not tied to TypeScript, JavaScript, Java, or another implementation language.
- Links from new chapters to relevant existing backend deep dives where they provide optional additional depth.

### Out of scope

- Rewriting, deleting, renaming, or re-numbering the existing 100-question system-design track.
- Rewriting existing files under `src/full-stack/backend/system-design/`.
- Adding runtime application code, dependencies, or a code-execution harness.
- Treating illustrative scale numbers as facts about a real company's internal system. All numbers are explicitly marked as assumptions.
- Designing every feature of the named products. Each chapter defines a practical interview scope before designing.

## Information architecture

Create this directory and file topology:

```text
src/full-stack/system-design/interview-designs/
├── index.md
├── hld/
│   ├── index.md
│   ├── url-shortener.md
│   ├── rate-limiter.md
│   ├── notification-system.md
│   ├── whatsapp.md
│   ├── twitter-feed.md
│   ├── bookmyshow.md
│   ├── uber.md
│   ├── youtube.md
│   ├── google-drive.md
│   └── payment-system.md
└── lld/
    ├── index.md
    ├── parking-lot.md
    ├── elevator.md
    ├── vending-machine.md
    ├── splitwise.md
    ├── bookmyshow.md
    ├── atm.md
    ├── car-rental.md
    ├── logger.md
    ├── notification-system.md
    └── cache.md
```

The new section is added beneath the existing `System Design` node in `src/SUMMARY.md`. The order is:

```text
System Design
  Foundations
  Easy System Design Problems
  Medium System Design Problems
  Hard System Design Problems
  Advanced & Specialist Areas
  Preparation Strategy
  HLD & LLD Interview Designs
    HLD Interview Designs
      ten HLD chapters
    LLD Interview Designs
      ten LLD chapters
```

The existing system-design index remains the entry point for the broad 100-question track. Its wording may receive one short link to the new section, but its current chapters and numbering are preserved.

## HLD chapter contract

Each of the ten HLD files uses the same numbered headings in the same order. The content under each heading is problem-specific, but the chapter must never skip one of the 17 points.

### 1. Clarify requirements

Separate functional requirements from non-functional requirements. State users, core use cases, explicit exclusions, target scale, latency, availability, consistency, durability, and security assumptions. Include a compact “interview scope” callout so the learner knows what not to design.

### 2. Estimate scale

Use only useful numbers: active users, requests per second, read/write ratio, peak multiplier, storage growth, and bandwidth. Show the arithmetic for at least one important estimate and label every number as an assumption.

### 3. Define APIs

Show the small set of important read, write, and asynchronous callback APIs. Include HTTP method, path, request body or query parameters, and a representative response or event when it improves understanding. Avoid pretending that every internal endpoint is required.

### 4. Define the data model

List major entities, important fields, relationships, indexes, partition keys, retention rules, and the SQL/NoSQL decision. Include the source of truth for each critical state.

### 5. Draw the high-level architecture

Begin with client, edge, stateless service, durable store, and asynchronous processing. Add cache, queue, object storage, CDN, search, WebSocket, or specialized services only when the requirements justify them. Include a diagram that can be redrawn on a whiteboard.

### 6. Walk through the main request flow

Walk one important write and/or read end-to-end. Explain synchronous steps, durable boundaries, event publication, workers, cache reads, and the response returned to the user. A diagram alone is not sufficient.

### 7. Identify bottlenecks

Name what breaks first at the stated scale: hot keys, partitions, connection pools, queue lag, fanout, external provider limits, storage bandwidth, or coordination. Tie each bottleneck to a mitigation.

### 8. Scale each component

Discuss horizontal scaling, replication, sharding, partitioning, load balancing, asynchronous work, backpressure, and consistent hashing where appropriate. Explain the partition key and its hot-key risk instead of saying only “add more servers.”

### 9. Caching strategy

For every cache, state the key, value, policy, TTL, invalidation path, cache-miss behavior, and whether stale data is acceptable. Use cache-aside by default and justify write-through or write-back when the problem needs it.

### 10. Database scaling and consistency

Discuss primary/replica behavior, read replicas, indexes, sharding, transactions, retention, and consistency level. Explicitly identify which records need strong consistency and which projections can be eventually consistent.

### 11. Handle concurrency

Cover atomic operations, optimistic or pessimistic locking, distributed locks, transactions, idempotency keys, compare-and-set updates, or reservation leases as appropriate. Include the invariant that must never be violated.

### 12. Reliability and failure handling

Explain timeouts, retries with backoff and jitter, circuit breakers, dead-letter queues, replication/failover, replay, reconciliation, duplicate requests, and partial failure. State whether each failure is retried, rejected, delayed, or degraded.

### 13. Availability versus consistency trade-offs

Apply the trade-off to this specific system. Do not recite CAP in the abstract. Say what the user may briefly observe during a partition and which invariant remains protected.

### 14. Security

Cover authentication, authorization, TLS, encryption at rest, rate limiting, input validation, secrets, PII, abuse prevention, and auditability at the level relevant to the problem.

### 15. Monitoring and observability

Name useful logs, metrics, traces, dashboards, and alerts. Include request latency, errors, queue lag, database health, cache hit rate, and domain-specific correctness metrics where appropriate.

### 16. Discuss trade-offs

Use a decision table with `Choice`, `Why`, `Alternative`, and `Trade-off`. Every major storage, queue, consistency, fanout, or deployment decision must be explained rather than asserted.

### 17. Future improvements

Close with realistic next steps such as multi-region operation, disaster recovery, data archival, stronger search, better partitioning, analytics, compliance, or product extensions. These are explicitly future work, not hidden requirements in the main design.

Each HLD chapter also contains a short introduction before section 1 and a short interview recap after section 17. These provide context and revision hooks without changing the required 17-point order.

## HLD topic-specific focus

| Chapter | Dominant design decisions and follow-ups |
|---|---|
| URL Shortener | Collision-safe short-code generation, redirect cache, expiry, 301/302 behavior, analytics off the redirect path |
| Rate Limiter | Token bucket versus sliding window, atomic distributed state, policy keys, fail-open/fail-closed behavior, fairness |
| Notification System | Preferences, templates, fanout, channel adapters, provider limits, retries, deduplication, offline delivery |
| WhatsApp | Conversation/message model, ordering, delivery receipts, offline queues, WebSocket routing, multi-device sync, media boundary |
| Twitter Feed | Follow graph, fanout-on-write versus fanout-on-read, celebrity accounts, ranking, cache invalidation, pagination |
| BookMyShow | Show inventory, seat holds, lease expiry, atomic booking, payment boundary, oversell prevention, read-heavy discovery |
| Uber | Location ingestion, geospatial indexing, matching, driver state, dispatch timeout, trip lifecycle, pricing, stale location tolerance |
| YouTube | Resumable upload, object storage, transcoding pipeline, metadata, CDN delivery, privacy, moderation, playback manifests |
| Google Drive | Chunked upload, metadata versus blob storage, permissions, sync cursors, conflict handling, versioning, sharing |
| Payment System | Idempotency, payment state machine, immutable ledger, gateway abstraction, webhooks, reconciliation, duplicate-charge prevention |

The new HLD chapters may link to these existing pages for optional deeper reading without making the new chapters dependent on them:

- `design-a-url-shortener.md`
- `design-a-rate-limiter.md`
- `design-a-distributed-notification-service.md`
- `design-a-real-time-chat-system.md`
- `design-a-social-media-feed.md`
- `design-a-booking-system.md`
- `design-a-ride-booking-backend.md`
- `design-a-payment-system.md`
- `design-a-file-upload-service.md`

## LLD chapter contract

Each of the ten LLD files uses the same numbered headings in the same order. LLD chapters focus on object boundaries, behavior, and changeability rather than distributed-service topology.

### 1. Clarify requirements

Define the supported user actions, states, constraints, explicit exclusions, and the core workflow to implement in an interview.

### 2. Identify entities

List domain objects, value objects, enums, external actors, and infrastructure abstractions. Distinguish objects with identity from simple values.

### 3. Define relationships

Show composition, aggregation, inheritance, association, ownership, and cardinality. Use a small class/relationship diagram where it improves the model.

### 4. Define interfaces and abstractions

Introduce contracts at the points likely to change: allocation, pricing, scheduling, payment, storage, notification, or eviction. Interfaces must have concrete responsibilities and method shapes.

### 5. Design classes

Give each important class its state and public operations. Keep the model cohesive and avoid a single manager class that knows every detail.

### 6. Decide responsibilities

Explain which class owns each invariant and which class coordinates each workflow. Call out responsibilities that are deliberately not placed in a tempting but incorrect class.

### 7. Apply design patterns where useful

Use patterns only when they reduce coupling or make a stated variation easy: Strategy, Factory, State, Observer, Adapter, Repository, or Chain of Responsibility. Explain the problem each pattern solves and its cost.

### 8. Handle important workflows

Walk the main success path and at least one state transition or alternative path using the designed objects. Show which object calls which collaborator and when state changes.

### 9. Handle edge cases

Cover invalid state transitions, missing resources, duplicate operations, expired holds, insufficient funds, unsupported types, full capacity, and external failures as applicable.

### 10. Discuss extensibility

Show how a likely change—new vehicle, payment method, pricing policy, notification channel, eviction policy, or hardware adapter—can be added without editing unrelated classes.

### 11. Discuss concurrency where relevant

Identify shared mutable state and its protection: synchronized critical sections, atomic updates, locks, immutable snapshots, leases, or a single-threaded coordinator. If concurrency is not meaningful for a problem, say why.

### 12. Write the core class/pseudocode design

Provide concise, language-neutral pseudocode for the core interfaces, classes, state transitions, and one main operation. The pseudocode is intentionally readable rather than compilable in a specific language.

### 13. Discuss trade-offs

End with choices about inheritance versus composition, central coordinator versus distributed responsibility, in-memory versus persistent state, and extensibility versus simplicity.

Each LLD chapter also contains a short introduction before section 1 and a final interview recap after section 13.

## LLD topic-specific focus

| Chapter | Dominant design decisions and follow-ups |
|---|---|
| Parking Lot | Vehicle and spot types, allocation strategy, ticket lifecycle, pricing strategy, floors, availability |
| Elevator | Elevator state, request direction, scheduling strategy, door safety, multiple elevators, fault handling |
| Vending Machine | State machine, product inventory, coin/payment abstraction, change calculation, refund, out-of-stock behavior |
| Splitwise | Expense types, split strategies, balance ledger, settlement, rounding, group membership, extensibility |
| BookMyShow | Movie/show/seat model, seat hold lifecycle, booking service, pricing, payment boundary, concurrent booking |
| ATM | Card/authentication abstraction, ATM states, cash dispenser, account service, transaction rollback, hardware isolation |
| Car Rental | Vehicle inventory, reservation lifecycle, pricing, availability, extensions, return inspection, payment policy |
| Logger | Levels, formatting, sinks, filters, async boundary, correlation context, configuration, thread safety |
| Notification System | Notification contract, channel strategies, templates, user preferences, retries, observer/event boundary |
| Cache | Key/value contract, LRU or LFU eviction, TTL, capacity, storage abstraction, thread safety, policy replacement |

## Teaching and writing conventions

- Use plain language first, then introduce the technical term.
- Start each chapter with the problem pressure and a memorable mental model.
- Keep assumptions visible; do not bury them in prose.
- Prefer diagrams that can be redrawn in an interview in under two minutes.
- Use tables for APIs, entities, trade-offs, and state transitions when a table is clearer than paragraphs.
- Use fenced `txt`, `mermaid`, `http`, `json`, `sql`, and pseudocode blocks only when the notation helps the learner.
- Keep HLD technology choices vendor-neutral unless a concrete technology makes the trade-off clearer.
- Keep LLD code language-neutral. Names should be conventional and readable, but no chapter should require a language compiler.
- Explain correctness invariants explicitly for bookings, payments, messages, inventory, and cache state.
- Mark approximate capacity figures as interview assumptions, not production facts.
- Include a compact “common follow-ups” or “interviewer may ask” subsection when the chapter has more than one natural deep dive.
- Use relative links from each chapter to the new indexes and optional existing deep dives.

## Implementation sequence

Implementation will proceed in four independently reviewable slices:

1. Create the new landing and index pages, add navigation, and add the five HLD chapters with the highest overlap with existing deep dives: URL Shortener, Rate Limiter, Notification System, WhatsApp, and Twitter Feed.
2. Add the remaining five HLD chapters: BookMyShow, Uber, YouTube, Google Drive, and Payment System.
3. Add the first five LLD chapters: Parking Lot, Elevator, Vending Machine, Splitwise, and BookMyShow.
4. Add the remaining five LLD chapters: ATM, Car Rental, Logger, Notification System, and Cache.

Each slice is verified before the next slice begins. The implementation plan will give exact files and per-chapter checks for each slice.

## Acceptance criteria

### Content

- All 20 requested problem names appear in the new section.
- Every HLD chapter has exactly the required 17 numbered headings, in order.
- Every LLD chapter has exactly the required 13 numbered headings, in order.
- Each chapter contains problem-specific requirements, scale or object reasoning, architecture/class design, main flow, edge/failure handling, and trade-offs.
- The HLD chapters include APIs, data models, caching, database consistency, concurrency, reliability, security, monitoring, and future improvements where required by the template.
- The LLD chapters include entities, relationships, interfaces, responsibilities, patterns, workflows, edge cases, extensibility, concurrency, and pseudocode where required by the template.
- Existing system-design pages and numbering remain intact.

### Navigation and rendering

- `src/SUMMARY.md` reaches the new landing page, both sub-indexes, and all 20 chapters.
- Every new relative Markdown link resolves to an existing file or an intentional in-page anchor.
- `mdbook build` succeeds.
- Mermaid diagrams, code fences, tables, and callouts render without malformed Markdown.

### Repository quality

- `git diff --check` succeeds.
- No unrelated files are changed.
- No unfinished placeholder wording remains in the new section.
- The final report names verification commands and their results instead of claiming completion from inspection alone.

## Design decision summary

| Decision | Rationale | Rejected alternative |
|---|---|---|
| Add a new standalone section | Preserves the existing broad curriculum and gives this interview list a consistent structure | Rewriting current pages would risk losing existing material and numbering |
| One file per problem | Makes revision, deep links, and focused review practical | Two giant HLD/LLD files would become difficult to navigate |
| Reuse a strict template | Lets the learner build a repeatable interview habit and makes coverage auditable | Free-form chapters make it easy to omit concurrency, failure, or trade-offs |
| Keep LLD language-neutral | The goal is design reasoning, not a TypeScript or Java lesson | A language-specific implementation would narrow the section unnecessarily |
| Keep existing deep dives as optional links | Provides depth without making the new study path depend on old chapter structure | Copying or replacing the deep dives would create maintenance and navigation risk |
| Use four implementation slices | Keeps each batch reviewable and allows link/build checks throughout a large documentation change | One all-at-once edit would make omissions and navigation mistakes harder to isolate |
