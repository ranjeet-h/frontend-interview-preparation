# HLD & LLD Interview Designs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone mdBook section with ten consistently structured HLD chapters and ten consistently structured LLD chapters for interview study.

**Architecture:** Add one new `interview-designs` subtree under the existing system-design track. Use one landing page, separate HLD and LLD indexes, and one focused Markdown file per problem. Keep the existing 100-question system-design track and backend deep dives intact; link to them only as optional further reading.

**Tech Stack:** Markdown, mdBook, Mermaid, plain-text diagrams, language-neutral LLD pseudocode, `rg`, shell checks, and `git diff --check`.

## Global Constraints

- The existing 100-question system-design curriculum and existing backend deep-dive pages remain unchanged.
- Every HLD chapter follows the same 17 numbered headings, in order.
- Every LLD chapter follows the same 13 numbered headings, in order.
- The LLD material is language-neutral and is not a TypeScript, JavaScript, Java, or other language tutorial.
- No runtime application code, dependencies, or code-execution harness is added.
- All scale figures are clearly labelled as interview assumptions.
- Every chapter contains problem-specific requirements, a main flow, edge/failure handling, and trade-offs.
- Diagrams must be simple enough to redraw during an interview.
- All new relative Markdown links must point to existing files or intentional in-page anchors.
- Each completed task is whitespace-checked, structurally checked, and committed before the next task starts.
- Preserve unrelated user changes in the worktree, especially the existing untracked TypeScript files.

---

## File map

Create:

- `src/full-stack/system-design/interview-designs/index.md` — section landing page and study route.
- `src/full-stack/system-design/interview-designs/hld/index.md` — HLD overview, 17-point framework, and topic table.
- `src/full-stack/system-design/interview-designs/lld/index.md` — LLD overview, 13-point framework, and topic table.
- Ten files under `src/full-stack/system-design/interview-designs/hld/` listed in the approved spec.
- Ten files under `src/full-stack/system-design/interview-designs/lld/` listed in the approved spec.

Modify:

- `src/SUMMARY.md` — add the new subtree beneath the existing System Design node.
- `src/full-stack/system-design/index.md` — add one link to the focused section without changing the 100-question chapter list or numbering.

Create or modify only the approved paths above and the implementation-plan/spec files. Do not stage the pre-existing untracked TypeScript work.

## Shared chapter templates

### HLD heading contract

Use these exact headings as `##` headings in every HLD file:

```text
## 1. Clarify requirements
## 2. Estimate scale
## 3. Define APIs
## 4. Define the data model
## 5. Draw the high-level architecture
## 6. Walk through the main request flow
## 7. Identify bottlenecks
## 8. Scale each component
## 9. Caching strategy
## 10. Database scaling and consistency
## 11. Handle concurrency
## 12. Reliability and failure handling
## 13. Availability versus consistency trade-offs
## 14. Security
## 15. Monitoring and observability
## 16. Discuss trade-offs
## 17. Future improvements
```

Before section 1, add a short “problem pressure” introduction and a one-paragraph interview scope. After section 17, add a concise interview recap and two or three likely follow-up questions. Under the required headings, cover the details defined in the approved design spec rather than replacing them with generic sentences.

### LLD heading contract

Use these exact headings as `##` headings in every LLD file:

```text
## 1. Clarify requirements
## 2. Identify entities
## 3. Define relationships
## 4. Define interfaces and abstractions
## 5. Design classes
## 6. Decide responsibilities
## 7. Apply design patterns where useful
## 8. Handle important workflows
## 9. Handle edge cases
## 10. Discuss extensibility
## 11. Discuss concurrency where relevant
## 12. Write the core class/pseudocode design
## 13. Discuss trade-offs
```

Before section 1, add a short problem introduction and interview scope. After section 13, add a concise interview recap and likely follow-ups. The pseudocode must be readable and language-neutral, and must name the core interfaces, classes, state transitions, and one important operation.

## Task 1: Create the section indexes and navigation

**Files:**

- Create: `src/full-stack/system-design/interview-designs/index.md`
- Create: `src/full-stack/system-design/interview-designs/hld/index.md`
- Create: `src/full-stack/system-design/interview-designs/lld/index.md`
- Modify: `src/SUMMARY.md` near the existing System Design entries
- Modify: `src/full-stack/system-design/index.md` in its navigation guidance

**Interfaces:**

- Produces the landing and index links consumed by all 20 chapter pages and by mdBook navigation.

- [ ] **Step 1: Write the landing page**

  Add the title `HLD & LLD Interview Designs`, explain the difference between system-level and object-level thinking, link to both sub-indexes, show the recommended interview sequence, and list the preserved existing tracks as optional context.

- [ ] **Step 2: Write the HLD index**

  Add the 17-point answer loop and a table linking, in this order, URL Shortener, Rate Limiter, Notification System, WhatsApp, Twitter Feed, BookMyShow, Uber, YouTube, Google Drive, and Payment System.

- [ ] **Step 3: Write the LLD index**

  Add the 13-point answer loop and a table linking, in this order, Parking Lot, Elevator, Vending Machine, Splitwise, BookMyShow, ATM, Car Rental, Logger, Notification System, and Cache.

- [ ] **Step 4: Add mdBook navigation**

  Under the existing System Design node in `src/SUMMARY.md`, add the landing page, HLD index and ten HLD children, then the LLD index and ten LLD children. Add one short link from the existing system-design index to this new section without changing its existing chapter list.

- [ ] **Step 5: Verify the navigation slice**

  Run:

  ```bash
  rg -n "HLD & LLD|HLD Interview Designs|LLD Interview Designs|interview-designs" src/SUMMARY.md src/full-stack/system-design/index.md src/full-stack/system-design/interview-designs
  git diff --check -- src/SUMMARY.md src/full-stack/system-design/index.md src/full-stack/system-design/interview-designs
  ```

  Expected: all three index files and all 20 future chapter link targets are named in the navigation; no whitespace errors are reported.

- [ ] **Step 6: Commit the navigation slice**

  ```bash
  git add src/SUMMARY.md src/full-stack/system-design/index.md src/full-stack/system-design/interview-designs
  git commit -m "docs: add HLD and LLD interview design navigation"
  ```

## Task 2: Add HLD URL Shortener

**Files:**

- Create: `src/full-stack/system-design/interview-designs/hld/url-shortener.md`

**Interfaces:**

- Consumes: HLD heading contract and optional deep link `../../../backend/system-design/design-a-url-shortener.md`.
- Produces: a self-contained URL-shortener interview answer with APIs, mapping model, redirect flow, and scale decisions.

- [ ] **Step 1: Write the 17 required sections**

  Use these concrete assumptions and decisions: roughly 100 million new links per month, 10 billion redirects per month, a read-heavy ratio near 100:1, sub-20 ms redirect target, seven-character Base62 space as an illustrative capacity calculation, `POST /short-links`, `GET /r/{code}`, and an optional delete/expiry operation. Model `ShortLink(code, destination, ownerId, createdAt, expiresAt, redirectType)` with a unique code index. Design a cache-first redirect path, durable mapping store, collision-safe ID generation, and an asynchronous click-event pipeline.

  Explain 301 versus 302, cache miss behavior, expiry, malicious URL validation, hot viral links, cache stampede protection, and why click analytics never blocks the redirect. Include a text or Mermaid diagram, a redirect request flow, the immutable mapping invariant, and an explicit SQL-versus-NoSQL trade-off.

- [ ] **Step 2: Add the recap and optional deep link**

  End with the interview answer: “generate a unique immutable key once, make redirects cache-first, keep the mapping durable, and move analytics off the hot path.” Link to the existing deep dive for optional additional reading.

- [ ] **Step 3: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/url-shortener.md)" -eq 17
  rg -n '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/url-shortener.md
  git diff --check -- src/full-stack/system-design/interview-designs/hld/url-shortener.md
  git add src/full-stack/system-design/interview-designs/hld/url-shortener.md
  git commit -m "docs: add HLD URL shortener interview design"
  ```

  Expected: exactly 17 numbered headings, in order, and a clean whitespace check.

## Task 3: Add HLD Rate Limiter

**Files:**

- Create: `src/full-stack/system-design/interview-designs/hld/rate-limiter.md`

**Interfaces:**

- Consumes: HLD heading contract and optional deep link `../../../backend/system-design/design-a-rate-limiter.md`.
- Produces: a distributed rate-limiter answer with policy evaluation, atomic state, headers, and failure behavior.

- [ ] **Step 1: Write the 17 required sections**

  Scope an API gateway or shared service that enforces per-user, per-IP, and per-tenant quotas. Compare token bucket, leaky bucket, fixed window, and sliding window; choose token bucket for the main design because it supports bursts with a sustained rate. Define a `POST /limit/check`-style internal contract or describe the gateway decision, `429` response, `Retry-After`, and rate-limit headers. Model policy configuration separately from mutable bucket state.

  Use Redis or an equivalent partitioned low-latency store with an atomic Lua/script or compare-and-set operation. Explain key choice, clock handling, hot tenants, fail-open versus fail-closed by endpoint risk, circuit breaking, policy cache invalidation, retries, and fairness. Include the invariant that two distributed gateway nodes cannot both consume the same last token.

- [ ] **Step 2: Add the recap and optional deep link**

  Close with the atomic shared-state insight and link to the existing detailed rate-limiter page.

- [ ] **Step 3: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/rate-limiter.md)" -eq 17
  git diff --check -- src/full-stack/system-design/interview-designs/hld/rate-limiter.md
  git add src/full-stack/system-design/interview-designs/hld/rate-limiter.md
  git commit -m "docs: add HLD rate limiter interview design"
  ```

## Task 4: Add HLD Notification System

**Files:**

- Create: `src/full-stack/system-design/interview-designs/hld/notification-system.md`

**Interfaces:**

- Consumes: HLD heading contract and optional deep link `../../../backend/system-design/design-a-distributed-notification-service.md`.
- Produces: a multi-channel notification pipeline answer with durable intent and retryable delivery.

- [ ] **Step 1: Write the 17 required sections**

  Scope in-app, push, email, and SMS notifications with user preferences, templates, delivery status, and offline support. Define `POST /notifications`, preference reads/updates, and provider callback/webhook concepts. Model `Notification`, `DeliveryAttempt`, `UserPreference`, `Template`, and `DeviceSubscription`; make the notification intent durable before asynchronous fanout.

  Design ingestion, an event queue, preference/template resolution, per-channel workers, provider adapters, retry queues, and a dead-letter queue. Explain idempotency keys, deduplication, provider rate limits, channel fallback, quiet hours, expired device tokens, ordering where needed, and why user-facing acceptance can be asynchronous. Include domain metrics such as queue lag, delivery success by provider, and time-to-deliver.

- [ ] **Step 2: Add the recap and optional deep link**

  State the core separation: persist intent first, then deliver through independently throttled channel workers. Link to the existing notification-service deep dive.

- [ ] **Step 3: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/notification-system.md)" -eq 17
  git diff --check -- src/full-stack/system-design/interview-designs/hld/notification-system.md
  git add src/full-stack/system-design/interview-designs/hld/notification-system.md
  git commit -m "docs: add HLD notification system interview design"
  ```

## Task 5: Add HLD WhatsApp

**Files:**

- Create: `src/full-stack/system-design/interview-designs/hld/whatsapp.md`

**Interfaces:**

- Consumes: HLD heading contract and optional deep link `../../../backend/system-design/design-a-real-time-chat-system.md`.
- Produces: a WhatsApp-like messaging answer covering online delivery, offline queues, ordering, and multi-device sync.

- [ ] **Step 1: Write the 17 required sections**

  Scope one-to-one and group text messaging, message history, online/offline delivery, delivery/read receipts, and multi-device synchronization; keep calls and full end-to-end cryptographic protocol design out of the main scope while naming them as future work. Define message send, conversation history, presence, and WebSocket event contracts. Model `Conversation`, `Participant`, `Message`, `Device`, and `DeliveryReceipt` with conversation-based ordering metadata.

  Design WebSocket gateways, a stateless message API, durable message storage partitioned by conversation, an outbox/event stream, delivery workers, connection-directory state, and offline queues. Explain at-least-once delivery, client deduplication, per-conversation ordering, reconnect cursors, fanout for groups, hot groups, media/object-storage boundaries, and the difference between message durability and online delivery.

- [ ] **Step 2: Add the recap and optional deep link**

  Emphasize “persist once, assign an ordering position, then deliver at least once and deduplicate on clients.” Link to the existing real-time chat page.

- [ ] **Step 3: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/whatsapp.md)" -eq 17
  git diff --check -- src/full-stack/system-design/interview-designs/hld/whatsapp.md
  git add src/full-stack/system-design/interview-designs/hld/whatsapp.md
  git commit -m "docs: add HLD WhatsApp interview design"
  ```

## Task 6: Add HLD Twitter Feed

**Files:**

- Create: `src/full-stack/system-design/interview-designs/hld/twitter-feed.md`

**Interfaces:**

- Consumes: HLD heading contract and optional deep link `../../../backend/system-design/design-a-social-media-feed.md`.
- Produces: a feed answer with follow-graph reads, fanout choices, ranking, and celebrity handling.

- [ ] **Step 1: Write the 17 required sections**

  Scope posting, following, home timeline reads, pagination, basic ranking, and eventual like/repost counts. Define create-post, follow/unfollow, and cursor-based home-feed APIs. Model `User`, `Post`, `FollowEdge`, `FeedEntry`, and engagement counters. Explain fanout-on-write for ordinary users, fanout-on-read for celebrity accounts, and a hybrid feed assembly path.

  Design post storage, follow-graph storage, feed-cache or feed-inbox workers, ranking, cache invalidation, cursor pagination, and asynchronous engagement aggregation. Identify celebrity hot keys, write amplification, stale ranking, cache stampedes, and follower privacy changes. Make eventual consistency acceptable for feed projections while preserving authoring and privacy invariants.

- [ ] **Step 2: Add the recap and optional deep link**

  State the hybrid fanout rule and link to the existing social-feed deep dive.

- [ ] **Step 3: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/twitter-feed.md)" -eq 17
  git diff --check -- src/full-stack/system-design/interview-designs/hld/twitter-feed.md
  git add src/full-stack/system-design/interview-designs/hld/twitter-feed.md
  git commit -m "docs: add HLD Twitter feed interview design"
  ```

## Task 7: Add HLD BookMyShow

**Files:**

- Create: `src/full-stack/system-design/interview-designs/hld/bookmyshow.md`

**Interfaces:**

- Consumes: HLD heading contract and optional deep link `../../../backend/system-design/design-a-booking-system.md`.
- Produces: a movie-ticket booking answer with strongly consistent inventory and expiring holds.

- [ ] **Step 1: Write the 17 required sections**

  Scope browsing movies, theatres, shows, seat maps, temporary seat holds, payment handoff, booking confirmation, and cancellation/refund. Define show discovery, seat availability, hold, confirm, and booking-status APIs. Model `Movie`, `Theatre`, `Screen`, `Show`, `Seat`, `SeatHold`, `Booking`, and `PaymentAttempt`; keep show-seat inventory as the source of truth for availability.

  Design a read-heavy discovery path and a transactional booking path. Use an expiring hold lease plus an atomic conditional update or row lock so a seat cannot be confirmed twice. Explain payment timeout recovery, abandoned holds, idempotency, oversell prevention, seat-map caching, hot shows, strong consistency for inventory, eventual consistency for search and analytics, and the invariant “a seat for a show has at most one active owner.”

- [ ] **Step 2: Add the recap and optional deep link**

  Close with the split between cached discovery and transaction-protected seat inventory, then link to the existing booking deep dive.

- [ ] **Step 3: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/bookmyshow.md)" -eq 17
  git diff --check -- src/full-stack/system-design/interview-designs/hld/bookmyshow.md
  git add src/full-stack/system-design/interview-designs/hld/bookmyshow.md
  git commit -m "docs: add HLD BookMyShow interview design"
  ```

## Task 8: Add HLD Uber

**Files:**

- Create: `src/full-stack/system-design/interview-designs/hld/uber.md`

**Interfaces:**

- Consumes: HLD heading contract and optional deep link `../../../backend/system-design/design-a-ride-booking-backend.md`.
- Produces: a ride-hailing answer separating ephemeral location traffic from transactional trip state.

- [ ] **Step 1: Write the 17 required sections**

  Scope rider estimates and requests, driver location/status, matching, dispatch acceptance, trip lifecycle, fare estimate, and basic notifications. Define location-update, fare-estimate, request-ride, driver-response, and trip-status APIs. Model `Rider`, `Driver`, `DriverLocation`, `Trip`, `DispatchOffer`, `FareQuote`, and `PaymentRecord`.

  Design a high-throughput location ingestion stream with a geospatial index, a matching service, WebSocket/push dispatch, and a strongly durable trip service. Use cells/geohashes/H3 or an equivalent spatial partition, stale-location TTLs, driver locks or compare-and-set state transitions, expanding search radius, and dispatch timeouts. Explain why location can tolerate loss and staleness while trip assignment and payment cannot, plus surge and regional hot spots.

- [ ] **Step 2: Add the recap and optional deep link**

  State the two-speed architecture—loss-tolerant location plane and strict trip plane—and link to the existing ride-booking deep dive.

- [ ] **Step 3: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/uber.md)" -eq 17
  git diff --check -- src/full-stack/system-design/interview-designs/hld/uber.md
  git add src/full-stack/system-design/interview-designs/hld/uber.md
  git commit -m "docs: add HLD Uber interview design"
  ```

## Task 9: Add HLD YouTube

**Files:**

- Create: `src/full-stack/system-design/interview-designs/hld/youtube.md`

**Interfaces:**

- Consumes: HLD heading contract and the existing file-upload deep dive at `../../../backend/system-design/design-a-file-upload-service.md` for optional reading.
- Produces: a video platform answer separating upload, processing, metadata, and playback delivery.

- [ ] **Step 1: Write the 17 required sections**

  Scope resumable uploads, video processing, metadata, privacy, playback, basic search/discovery, and view-count events. Define upload-session, chunk, complete-upload, video-metadata, and playback APIs. Model `Video`, `UploadSession`, `VideoChunk`, `Encoding`, `Manifest`, `Visibility`, and `ViewEvent`.

  Design pre-signed multipart upload to object storage, durable metadata, an event queue, transcoding workers, moderation, manifest generation, CDN delivery, and playback authorization. Explain idempotent chunk completion, retryable processing, storage bandwidth, hot videos, cache/CDN invalidation, private/unlisted access, eventual view counts, and why raw video bytes do not belong in the transactional metadata database.

- [ ] **Step 2: Add the recap**

  Close with the pipeline “upload directly to object storage, process asynchronously, serve immutable encodings through a CDN.”

- [ ] **Step 3: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/youtube.md)" -eq 17
  git diff --check -- src/full-stack/system-design/interview-designs/hld/youtube.md
  git add src/full-stack/system-design/interview-designs/hld/youtube.md
  git commit -m "docs: add HLD YouTube interview design"
  ```

## Task 10: Add HLD Google Drive

**Files:**

- Create: `src/full-stack/system-design/interview-designs/hld/google-drive.md`

**Interfaces:**

- Consumes: HLD heading contract and optional file-upload deep link `../../../backend/system-design/design-a-file-upload-service.md`.
- Produces: a cloud-drive answer with metadata/blob separation, sync cursors, versioning, and permissions.

- [ ] **Step 1: Write the 17 required sections**

  Scope upload/download, folders, sharing, permissions, version history, multi-device sync, and change listing. Define create-upload-session, upload-chunk, finalize, download, list, and changes-by-cursor APIs. Model `User`, `File`, `Folder`, `FileVersion`, `Permission`, `UploadSession`, and `ChangeRecord`.

  Design metadata storage separately from object storage, resumable chunk upload, content hashes, a change log, sync workers, download authorization, and CDN/object-store delivery. Explain optimistic version checks, conflicting edits, cursor expiration, tombstones, permission caching, large-file bandwidth, hot shared files, retention, and why blob durability and metadata consistency have different operational paths.

- [ ] **Step 2: Add the recap**

  State “metadata is the coordination plane, object storage is the blob plane, and clients reconcile from a durable change cursor.”

- [ ] **Step 3: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/google-drive.md)" -eq 17
  git diff --check -- src/full-stack/system-design/interview-designs/hld/google-drive.md
  git add src/full-stack/system-design/interview-designs/hld/google-drive.md
  git commit -m "docs: add HLD Google Drive interview design"
  ```

## Task 11: Add HLD Payment System

**Files:**

- Create: `src/full-stack/system-design/interview-designs/hld/payment-system.md`

**Interfaces:**

- Consumes: HLD heading contract and optional deep link `../../../backend/system-design/design-a-payment-system.md`.
- Produces: a payment answer centered on idempotency, state transitions, immutable accounting, and reconciliation.

- [ ] **Step 1: Write the 17 required sections**

  Scope payment intent creation, authorization/capture, status, refunds, gateway callbacks, and merchant reconciliation. Define `POST /payments` with an idempotency key, status, refund, and webhook endpoints. Model `PaymentIntent`, `PaymentAttempt`, `LedgerEntry`, `Refund`, `WebhookEvent`, and `ReconciliationRecord`; keep the ledger append-only and avoid storing raw card data.

  Design API gateway/auth, payment orchestration, idempotency storage, gateway adapters, transactional state store, double-entry ledger, webhook inbox, retry workers, and reconciliation jobs. Explain unknown gateway outcomes, duplicate requests, webhook replay, provider outages, timeouts, charge-versus-order sequencing, strong consistency for balances and ledger entries, eventual status projections, PCI/PII boundaries, and the invariant “one idempotency key maps to one payment result.”

- [ ] **Step 2: Add the recap and optional deep link**

  Close with “never infer failure from a timeout; persist intent, make every operation idempotent, and reconcile external truth.” Link to the existing payment deep dive.

- [ ] **Step 3: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/hld/payment-system.md)" -eq 17
  git diff --check -- src/full-stack/system-design/interview-designs/hld/payment-system.md
  git add src/full-stack/system-design/interview-designs/hld/payment-system.md
  git commit -m "docs: add HLD payment system interview design"
  ```

## Task 12: Add LLD Parking Lot

**Files:**

- Create: `src/full-stack/system-design/interview-designs/lld/parking-lot.md`

**Interfaces:**

- Consumes: LLD heading contract.
- Produces: a class-level parking-lot design with pluggable spot allocation and pricing.

- [ ] **Step 1: Write the 13 required sections**

  Use `VehicleType`, `SpotType`, `Vehicle`, `Car`, `Bike`, `Truck`, `ParkingSpot`, `ParkingFloor`, `ParkingLot`, `Ticket`, `Payment`, `SpotAllocationStrategy`, and `PricingStrategy`. Show composition from lot to floors to spots, association from ticket to vehicle and spot, and an operation such as `ParkingLot.park(vehicle)` followed by `exit(ticket)`. Explain the ownership of occupancy, floor-level availability, ticket lifecycle, payment failure, full-lot behavior, and concurrent spot allocation.

  Use Strategy for allocation and pricing, Factory only if vehicle/payment creation varies, and composition over a giant inheritance tree. Include language-neutral pseudocode for conditional spot assignment and release. Show how a new vehicle or pricing policy is added without editing `ParkingLot` internals.

- [ ] **Step 2: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/lld/parking-lot.md)" -eq 13
  git diff --check -- src/full-stack/system-design/interview-designs/lld/parking-lot.md
  git add src/full-stack/system-design/interview-designs/lld/parking-lot.md
  git commit -m "docs: add LLD parking lot interview design"
  ```

## Task 13: Add LLD Elevator

**Files:**

- Create: `src/full-stack/system-design/interview-designs/lld/elevator.md`

**Interfaces:**

- Consumes: LLD heading contract.
- Produces: an elevator controller design with scheduling and safety boundaries.

- [ ] **Step 1: Write the 13 required sections**

  Use `ElevatorController`, `ElevatorCar`, `FloorRequest`, `CabinRequest`, `Scheduler`, `Door`, `Display`, `Direction`, and elevator states such as `Idle`, `Moving`, `DoorOpen`, and `OutOfService`. Show request ownership, car selection, direction-aware scheduling, door safety, multiple cars, emergency stop, and a workflow from button press to arrival.

  Use Strategy for scheduling so nearest-car, scan, and destination-dispatch policies can vary. Use State for car lifecycle only where it clarifies legal transitions. Include pseudocode for `request(floor, direction)` and `assignNextStop()`, and explain how sensor callbacks and a single controller event loop protect shared state.

- [ ] **Step 2: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/lld/elevator.md)" -eq 13
  git diff --check -- src/full-stack/system-design/interview-designs/lld/elevator.md
  git add src/full-stack/system-design/interview-designs/lld/elevator.md
  git commit -m "docs: add LLD elevator interview design"
  ```

## Task 14: Add LLD Vending Machine

**Files:**

- Create: `src/full-stack/system-design/interview-designs/lld/vending-machine.md`

**Interfaces:**

- Consumes: LLD heading contract.
- Produces: a vending-machine state-machine design with inventory and payment abstractions.

- [ ] **Step 1: Write the 13 required sections**

  Use `VendingMachine`, `ProductSlot`, `Inventory`, `Money`, `PaymentProcessor`, `ChangeCalculator`, and a `MachineState` interface with `Idle`, `HasSelection`, `HasPayment`, `Dispensing`, and `OutOfService` states. Walk through select, insert money, dispense, cancel/refund, and out-of-stock flows.

  Make state transitions own legal operations, keep inventory separate from payment, and use Adapter for cash/card payment devices. Cover insufficient money, exact change, payment timeout, jammed dispensing, duplicate selection, and refund. Include pseudocode for the state transition around `dispense()` and explain synchronization around stock and money.

- [ ] **Step 2: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/lld/vending-machine.md)" -eq 13
  git diff --check -- src/full-stack/system-design/interview-designs/lld/vending-machine.md
  git add src/full-stack/system-design/interview-designs/lld/vending-machine.md
  git commit -m "docs: add LLD vending machine interview design"
  ```

## Task 15: Add LLD Splitwise

**Files:**

- Create: `src/full-stack/system-design/interview-designs/lld/splitwise.md`

**Interfaces:**

- Consumes: LLD heading contract.
- Produces: an expense-sharing design with split strategies and a balance ledger.

- [ ] **Step 1: Write the 13 required sections**

  Use `User`, `Group`, `Expense`, `ExpenseSplit`, `EqualSplit`, `ExactSplit`, `PercentSplit`, `SplitStrategy`, `BalanceSheet`, `Settlement`, and `ExpenseService`. Define relationships between groups, members, expenses, splits, and balances. Walk through adding an expense and settling balances.

  Use Strategy for split calculation and composition for expense ownership. Cover validation that split totals equal the expense, decimal rounding, self-splits, non-members, edits/deletes, settlement records, and concurrent updates to a balance. Include pseudocode for `addExpense(expense, splitStrategy)` and explain whether balances are derived or stored.

- [ ] **Step 2: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/lld/splitwise.md)" -eq 13
  git diff --check -- src/full-stack/system-design/interview-designs/lld/splitwise.md
  git add src/full-stack/system-design/interview-designs/lld/splitwise.md
  git commit -m "docs: add LLD Splitwise interview design"
  ```

## Task 16: Add LLD BookMyShow

**Files:**

- Create: `src/full-stack/system-design/interview-designs/lld/bookmyshow.md`

**Interfaces:**

- Consumes: LLD heading contract.
- Produces: an object design for movie discovery, seat holds, booking confirmation, and payment coordination.

- [ ] **Step 1: Write the 13 required sections**

  Use `Movie`, `Theatre`, `Screen`, `Show`, `Seat`, `SeatHold`, `Booking`, `BookingRepository`, `SeatLock`, `PaymentGateway`, and `BookingService`. Show the relationship from theatre to screens to shows to seats, and keep a show-specific seat state rather than treating a reusable seat definition as inventory.

  Walk through `holdSeats()` and `confirmBooking()`. Use a lock/lease abstraction and conditional state transition to prevent double booking. Cover expired holds, payment failure, partial seat selection, duplicate confirmation, cancellation, and concurrent callers. Use Strategy for pricing or seat selection where appropriate, and include pseudocode for atomic confirmation.

- [ ] **Step 2: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/lld/bookmyshow.md)" -eq 13
  git diff --check -- src/full-stack/system-design/interview-designs/lld/bookmyshow.md
  git add src/full-stack/system-design/interview-designs/lld/bookmyshow.md
  git commit -m "docs: add LLD BookMyShow interview design"
  ```

## Task 17: Add LLD ATM

**Files:**

- Create: `src/full-stack/system-design/interview-designs/lld/atm.md`

**Interfaces:**

- Consumes: LLD heading contract.
- Produces: an ATM design that isolates hardware, account operations, and state transitions.

- [ ] **Step 1: Write the 13 required sections**

  Use `ATM`, `CardReader`, `Authenticator`, `AccountService`, `CashDispenser`, `ReceiptPrinter`, `Transaction`, `ATMState`, and states such as `Idle`, `CardInserted`, `Authenticated`, `Selecting`, `Processing`, and `OutOfService`. Walk through cash withdrawal, balance inquiry, deposit or transfer scope if included, cancellation, and card retention.

  Use State for the session lifecycle and Adapter for hardware devices. Keep account authorization and balance mutation behind an account-service interface. Cover invalid PIN attempts, insufficient account funds, insufficient ATM cash, denomination constraints, dispenser failure, timeout, rollback, and concurrent withdrawals. Include pseudocode for an idempotent withdrawal transaction and explain why the ATM should not own bank balances.

- [ ] **Step 2: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/lld/atm.md)" -eq 13
  git diff --check -- src/full-stack/system-design/interview-designs/lld/atm.md
  git add src/full-stack/system-design/interview-designs/lld/atm.md
  git commit -m "docs: add LLD ATM interview design"
  ```

## Task 18: Add LLD Car Rental

**Files:**

- Create: `src/full-stack/system-design/interview-designs/lld/car-rental.md`

**Interfaces:**

- Consumes: LLD heading contract.
- Produces: a rental-domain design with vehicle availability, reservation lifecycle, pricing, and return inspection.

- [ ] **Step 1: Write the 13 required sections**

  Use `Vehicle`, `VehicleType`, `Branch`, `Customer`, `Reservation`, `RentalAgreement`, `AvailabilityService`, `PricingStrategy`, `Inspection`, `PaymentService`, and `RentalService`. Walk through search, reserve, pick up, extend, return, inspection, and charge/refund.

  Use Strategy for pricing, Repository for persistence boundaries, and composition for branch and vehicle relationships. Cover overlapping reservations, reservation expiry, vehicle unavailable after inspection, late return, damage charge, payment failure, cancellation, and concurrent reservation attempts. Include pseudocode for an availability check followed by an atomic reservation operation.

- [ ] **Step 2: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/lld/car-rental.md)" -eq 13
  git diff --check -- src/full-stack/system-design/interview-designs/lld/car-rental.md
  git add src/full-stack/system-design/interview-designs/lld/car-rental.md
  git commit -m "docs: add LLD car rental interview design"
  ```

## Task 19: Add LLD Logger

**Files:**

- Create: `src/full-stack/system-design/interview-designs/lld/logger.md`

**Interfaces:**

- Consumes: LLD heading contract.
- Produces: a structured logger design with filters, formatters, sinks, and optional asynchronous dispatch.

- [ ] **Step 1: Write the 13 required sections**

  Use `LogEvent`, `LogLevel`, `Logger`, `Filter`, `Formatter`, `Sink`, `ConsoleSink`, `FileSink`, `RemoteSink`, `LoggerConfig`, and `AsyncDispatcher`. Walk through a log call from level check to formatting to sink delivery. Keep the logger’s public contract small: level methods plus structured context.

  Use Chain of Responsibility or composable filters for filtering, Strategy/Adapter for formatting and sinks, and a queue boundary for asynchronous remote delivery. Cover disabled levels, sink failure, backpressure, rotation, sensitive-field redaction, correlation IDs, configuration reload, ordering, and thread safety. Include pseudocode for `logger.log(event)` and explain the trade-off between synchronous durability and request latency.

- [ ] **Step 2: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/lld/logger.md)" -eq 13
  git diff --check -- src/full-stack/system-design/interview-designs/lld/logger.md
  git add src/full-stack/system-design/interview-designs/lld/logger.md
  git commit -m "docs: add LLD logger interview design"
  ```

## Task 20: Add LLD Notification System

**Files:**

- Create: `src/full-stack/system-design/interview-designs/lld/notification-system.md`

**Interfaces:**

- Consumes: LLD heading contract.
- Produces: an object design for notification creation, preference checks, channel dispatch, and retry policy.

- [ ] **Step 1: Write the 13 required sections**

  Use `Notification`, `NotificationChannel`, `EmailChannel`, `PushChannel`, `SmsChannel`, `TemplateRenderer`, `PreferenceService`, `NotificationDispatcher`, `RetryPolicy`, and `DeliveryResult`. Walk through an event becoming a notification, preference evaluation, template rendering, channel selection, delivery, and retry.

  Use Strategy or Adapter for channels, Observer or an event boundary for notification creation, and a Repository/port for persistence. Cover unsupported channels, quiet hours, missing device tokens, template errors, provider failure, duplicate delivery, idempotency, and adding a new channel without modifying the dispatcher’s core logic. Include pseudocode for `dispatch(notification)` and state ownership.

- [ ] **Step 2: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/lld/notification-system.md)" -eq 13
  git diff --check -- src/full-stack/system-design/interview-designs/lld/notification-system.md
  git add src/full-stack/system-design/interview-designs/lld/notification-system.md
  git commit -m "docs: add LLD notification system interview design"
  ```

## Task 21: Add LLD Cache

**Files:**

- Create: `src/full-stack/system-design/interview-designs/lld/cache.md`

**Interfaces:**

- Consumes: LLD heading contract.
- Produces: a cache design with replaceable eviction policy, TTL, capacity, and storage/concurrency boundaries.

- [ ] **Step 1: Write the 13 required sections**

  Use `Cache<K,V>`, `CacheEntry`, `Storage`, `EvictionPolicy`, `LruPolicy`, `LfuPolicy`, `Clock`, and `CacheService`. Define `get`, `put`, `remove`, and `size` contracts. Walk through cache hit, miss, insertion, update, eviction, and expiry.

  Use Strategy for eviction, a monotonic clock abstraction for TTL, and a storage abstraction so an in-memory implementation can be replaced. Explain why LRU needs a map plus linked ordering, how LFU handles frequency/ties, lazy versus eager expiry, capacity validation, cache stampede protection, concurrent get/put behavior, and whether reads refresh TTL. Include language-neutral pseudocode for O(1) LRU `get` and `put` without relying on a language-specific ordered map.

- [ ] **Step 2: Verify and commit**

  ```bash
  test "$(rg -c '^## [0-9]+\.' src/full-stack/system-design/interview-designs/lld/cache.md)" -eq 13
  git diff --check -- src/full-stack/system-design/interview-designs/lld/cache.md
  git add src/full-stack/system-design/interview-designs/lld/cache.md
  git commit -m "docs: add LLD cache interview design"
  ```

## Task 22: Run the complete content, navigation, and mdBook audit

**Files:**

- Verify: `src/SUMMARY.md`
- Verify: `src/full-stack/system-design/index.md`
- Verify: `src/full-stack/system-design/interview-designs/index.md`
- Verify: all files under `src/full-stack/system-design/interview-designs/hld/`
- Verify: all files under `src/full-stack/system-design/interview-designs/lld/`

**Interfaces:**

- Consumes: all 20 completed chapters and the navigation entries from Tasks 1–21.
- Produces: evidence that the new section is reachable, structurally complete, renderable, and isolated from unrelated work.

- [ ] **Step 1: Confirm the requested file set**

  Run:

  ```bash
  rg --files src/full-stack/system-design/interview-designs/hld | sort
  rg --files src/full-stack/system-design/interview-designs/lld | sort
  ```

  Expected: each directory contains its `index.md` plus exactly the ten requested chapter files.

- [ ] **Step 2: Audit all HLD and LLD heading counts and order**

  Run:

  ```bash
  for file in src/full-stack/system-design/interview-designs/hld/*.md; do
    count=$(rg -c '^## [0-9]+\.' "$file")
    test "$file" = "src/full-stack/system-design/interview-designs/hld/index.md" || test "$count" -eq 17
  done
  for file in src/full-stack/system-design/interview-designs/lld/*.md; do
    count=$(rg -c '^## [0-9]+\.' "$file")
    test "$file" = "src/full-stack/system-design/interview-designs/lld/index.md" || test "$count" -eq 13
  done
  ```

  Expected: every HLD chapter reports 17 numbered headings and every LLD chapter reports 13.

- [ ] **Step 3: Check all required topics and navigation targets**

  Run:

  ```bash
  rg -n "url-shortener|rate-limiter|notification-system|whatsapp|twitter-feed|bookmyshow|uber|youtube|google-drive|payment-system|parking-lot|elevator|vending-machine|splitwise|atm|car-rental|logger|cache" src/SUMMARY.md
  ```

  Expected: all 20 chapter paths appear under the new navigation subtree.

- [ ] **Step 4: Run whitespace and build verification**

  Run:

  ```bash
  git diff --check
  mdbook build
  ```

  Expected: no whitespace errors and a successful mdBook build. If the build reports a malformed link or Markdown block, fix only the new section, rerun the focused heading/link checks, and commit the correction with a `docs: verify ...` message.

- [ ] **Step 5: Confirm the final worktree boundary**

  Run:

  ```bash
  git status --short
  git diff --stat 5c3094d..HEAD
  ```

  Expected: the diff from the approved spec commit contains only the implementation plan, HLD/LLD section files, and intended navigation changes; the pre-existing untracked TypeScript files are still uncommitted and untouched.

- [ ] **Step 6: Report evidence**

  Record the exact heading counts, file-set result, `git diff --check` result, `mdbook build` result, and commit range in the final handoff. Do not describe the section as complete until all checks pass.
