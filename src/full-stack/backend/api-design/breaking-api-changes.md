# Breaking API Changes

## Detailed explanation

Handle incompatible contract changes with versions, migrations, release coordination, and rollback plans. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Breaking changes need a transition plan, not a surprise deploy.

## 2. Problem it solves

This design prevents inconsistent client behavior, duplicated backend logic, unclear errors, security gaps, and production-only workflow bugs.

## 3. Core idea

- Define the resource or workflow clearly.
- Validate input at the API boundary.
- Enforce authentication, authorization, and ownership checks.
- Return consistent success and error shapes.
- Plan idempotency, retries, logging, and monitoring for production behavior.

## 4. Visual / analogy

```txt
Client request
  -> auth/validation
  -> domain rules
  -> database/cache/queue
  -> serialized response/error
  -> frontend behavior
```

## 5. Minimal example

```txt
REQUEST  /api/example
CHECK    auth + validation + domain rules
WRITE    database or enqueue job
RETURN   status code + response body
```

## 6. Real-world example

In production, breaking api changes should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What constitutes a breaking API change?
- **The Engine Mechanism (Why it behaves this way):** A breaking change is any modification that causes existing clients to fail or behave incorrectly. Examples: removing fields, renaming fields, changing field types, changing HTTP methods, removing endpoints, changing status code semantics, making optional fields required, changing error code values, altering pagination format, changing authentication mechanism. Each breaks client assumptions encoded in their integration.
- **The Unforgettable Mental Model:** The **Contract Amendment**. If you change the terms of a signed contract without the other party's agreement, the contract is broken. API changes work the same way — the API contract is the agreement between backend and client.
- **The Trap:** Thinking that changing a field from optional to required is minor — existing clients that don't send the field will start failing immediately.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A breaking change is any modification that causes existing clients to fail. This includes removing or renaming fields, changing types or semantics, removing endpoints, changing HTTP methods or status codes, making optional fields required, and changing error codes. The test is simple: can an existing client continue working without any code changes? If not, it's breaking."

#### How do you plan a breaking change rollout?
- **The Engine Mechanism (Why it behaves this way):** Rollout process: (1) Identify all affected clients and stakeholders; (2) Create the new API version with breaking changes; (3) Write migration guide with before/after examples; (4) Communicate timeline to all clients; (5) Run both versions in parallel; (6) Monitor adoption metrics; (7) Send reminders as sunset approaches; (8) Sunset old version after all clients migrate or deadline passes.
- **The Unforgettable Mental Model:** The **Building Renovation**. Build the new wing (v2), move tenants gradually (migration), keep the old wing open during transition, and demolish it only after everyone has moved.
- **The Trap:** Not identifying all affected clients — mobile apps, third-party integrations, and internal services may all depend on the API and need migration.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I identify all affected clients including mobile apps, third-party integrations, and internal services. I create a new API version, write a detailed migration guide with examples, communicate the timeline, run both versions in parallel, monitor adoption, send reminders, and sunset the old version only after migration. The hardest part is identifying all clients — some dependencies are hidden."

#### How do you communicate breaking changes to clients?
- **The Engine Mechanism (Why it behaves this way):** Communication channels: (1) Deprecation headers in API responses; (2) API documentation updates with migration guides; (3) Email notifications to registered developers; (4) Developer portal announcements; (5) Changelog entries; (6) Direct outreach to high-impact clients. Multiple channels ensure the message reaches all stakeholders.
- **The Unforgettable Mental Model:** The **Multi-Channel Alert System**. Emergency alerts go out via sirens (headers), text messages (emails), bulletin boards (portal), and direct calls (outreach) — ensuring everyone gets the message.
- **The Trap:** Relying on a single communication channel — some clients may not check the developer portal, others may not read emails. Multiple channels are essential.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use multiple communication channels: deprecation headers in responses, updated documentation with migration guides, email notifications, developer portal announcements, changelog entries, and direct outreach to high-impact clients. Single-channel communication is risky — some clients miss emails, others don't check the portal. Redundancy ensures the message reaches everyone."

#### How do you minimize the impact of breaking changes?
- **The Engine Mechanism (Why it behaves this way):** Impact reduction: (1) Use API versioning to isolate breaking changes; (2) Provide backward-compatible adapters (translate v1 requests to v2 internally); (3) Offer extended transition periods for complex migrations; (4) Provide SDK updates with the new API; (5) Offer migration support (office hours, dedicated channels); (6) Phase the breaking change into smaller, incremental steps.
- **The Unforgettable Mental Model:** The **Gradual Slope Ramp**. Instead of a sudden cliff (breaking change), build a gradual ramp (adapters, extended timelines, SDK updates) that makes the transition smooth.
- **The Trap:** Making the breaking change all at once — large, complex migrations are more likely to fail or be delayed, extending the parallel maintenance period.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I minimize impact through API versioning, backward-compatible adapters that translate between versions, extended transition periods for complex migrations, SDK updates, migration support, and phasing large changes into smaller steps. The goal is to make the transition as smooth as possible — adapters are especially valuable because they let clients migrate at their own pace."

#### How do you handle clients that don't migrate?
- **The Engine Mechanism (Why it behaves this way):** Non-migration handling: (1) Extended sunset deadlines with justification; (2) Continued maintenance of old version with security patches only; (3) Feature freeze on old version — no new features; (4) Cost-based incentives — charge for maintaining old version; (5) Forced migration after hard deadline with graceful degradation. Balance client needs with maintenance burden.
- **The Unforgettable Mental Model:** The **Lease Extension**. Some tenants need more time to move. You extend the lease but charge a premium (maintenance cost), stop improvements (feature freeze), and set a final move-out date.
- **The Trap:** Maintaining old versions indefinitely — the maintenance burden grows with each version, eventually becoming unsustainable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For non-migrating clients, I offer extended deadlines with justification, continue security patches only, freeze new features on the old version, and may charge for extended maintenance. After a hard deadline, I enforce migration with graceful degradation. Maintaining old versions indefinitely is unsustainable — there must be a final sunset date."

#### How do you test breaking changes before release?
- **The Engine Mechanism (Why it behaves this way):** Testing strategy: (1) Run existing client integration tests against the new version; (2) Consumer-driven contract tests for known clients; (3) Schema comparison to document all breaking changes; (4) Canary deployment to a subset of traffic; (5) Shadow testing — run new version alongside old, compare outputs; (6) Load testing to ensure new version handles production traffic.
- **The Unforgettable Mental Model:** The **Parallel Test Track**. The new version runs alongside the old one, processing the same requests and comparing outputs. Differences are analyzed before the new version goes live.
- **The Trap:** Only testing the new version in isolation — the critical test is whether existing clients work with the new version, not whether the new version works on its own.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test by running existing client integration tests against the new version, using consumer-driven contract tests, comparing schemas to document all breaking changes, canary deploying to a subset of traffic, and shadow testing to compare outputs between versions. The most important test is whether existing clients work with the new version — not whether the new version works in isolation."

#### How do you version APIs to handle breaking changes?
- **The Engine Mechanism (Why it behaves this way):** Versioning strategies: (1) URL versioning — `/api/v1/resource`, `/api/v2/resource` (most common, most visible); (2) Header versioning — `API-Version: 2` (cleaner URLs, harder to debug); (3) Media type versioning — `Accept: application/vnd.api.v2+json` (RESTful, complex); (4) Query parameter versioning — `?v=2` (simple, but caching issues). URL versioning is the most practical for most teams.
- **The Unforgettable Mental Model:** The **Product Line**. Version 1 and Version 2 are separate products on the shelf. Customers choose which one to buy (use), and both are available until Version 1 is discontinued.
- **The Trap:** Using query parameter versioning — it interacts poorly with HTTP caching and CDN behavior, making cache invalidation difficult.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prefer URL versioning (`/api/v1/`, `/api/v2/`) for its simplicity and visibility. Header versioning is cleaner but harder to debug. Media type versioning is the most RESTful but complex. Query parameter versioning has caching issues. URL versioning strikes the best balance between simplicity, debuggability, and cache compatibility for most teams."

#### What logs and metrics would you add for breaking changes?
- **The Engine Mechanism (Why it behaves this way):** Logs: version usage (client, version, endpoint, timestamp), migration progress, deprecated endpoint calls, breaking change detection results. Metrics: API version distribution, migration rate, deprecated feature usage, breaking change count per release, client adoption timeline. Alerts: deprecated version usage after sunset, slow migration rate, breaking changes in CI without proper versioning.
- **The Unforgettable Mental Model:** The **Version Migration Dashboard**. Real-time view of which API versions are in use, migration progress, and alerts for clients still on deprecated versions.
- **The Trap:** Not tracking version usage per client — without this data, you can't identify which clients need migration support or follow-up.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log version usage with client identification, track migration progress, and monitor deprecated endpoint calls. Metrics show API version distribution, migration rate, and adoption timeline. I alert on deprecated version usage after sunset, slow migration rates, and breaking changes in CI without proper versioning. Per-client version tracking is essential for targeted migration support."

## 8. Active recall test

1. **What is the simplest test for whether a change is breaking?**
   - **Explanation:** Can an existing client continue working without any code changes? If not, the change is breaking.

2. **What is the first step in planning a breaking change rollout?**
   - **Explanation:** Identify all affected clients and stakeholders — including mobile apps, third-party integrations, and internal services.

3. **Why use multiple communication channels for breaking changes?**
   - **Explanation:** No single channel reaches all clients — some miss emails, others don't check the developer portal. Redundancy ensures the message is received.

4. **What are backward-compatible adapters?**
   - **Explanation:** Middleware that translates requests/responses between API versions, allowing clients to migrate at their own pace while the backend runs the new version.

5. **What is shadow testing for breaking changes?**
   - **Explanation:** Running the new API version alongside the old one, processing the same requests, and comparing outputs to detect differences before going live.

6. **Which API versioning strategy is most practical?**
   - **Explanation:** URL versioning (`/api/v1/`, `/api/v2/`) — it's simple, visible, debuggable, and compatible with HTTP caching.

7. **Why not maintain old API versions indefinitely?**
   - **Explanation:** The maintenance burden grows with each version — security patches, bug fixes, and infrastructure costs become unsustainable.

8. **What should happen to old versions during the transition period?**
   - **Explanation:** Security patches continue, but new features are frozen — the old version is maintained but not enhanced.

9. **What metric shows migration progress?**
   - **Explanation:** API version distribution — the percentage of traffic on each version shows how many clients have migrated.

10. **What is the hardest part of breaking change management?**
    - **Explanation:** Identifying all affected clients — some dependencies are hidden (abandoned mobile apps, forgotten integrations) and may not be discovered until they break.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Breaking API Changes.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
