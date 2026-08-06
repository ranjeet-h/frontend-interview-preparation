# API Versioning Design

## Detailed explanation

Choose URL/header/media versioning and lifecycle rules for API contract evolution. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Versioning groups incompatible contracts under explicit names.

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

In production, api versioning design should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What are the main API versioning strategies?
- **The Engine Mechanism (Why it behaves this way):** Four main strategies: (1) URL versioning — `/api/v1/users` (most common, visible, cache-friendly); (2) Header versioning — `API-Version: 1` (clean URLs, harder to test); (3) Media type versioning — `Accept: application/vnd.myapi.v1+json` (RESTful, complex); (4) Query parameter versioning — `/api/users?v=1` (simple, caching issues). Each has tradeoffs in visibility, cacheability, and implementation complexity.
- **The Unforgettable Mental Model:** The **Language Translation System**. URL versioning is like speaking different languages in different rooms (visible, clear). Header versioning is like wearing a language badge (clean but hidden). Media type versioning is like using formal diplomatic protocol (correct but complex). Query params are like adding a language tag to a sentence (simple but inconsistent).
- **The Trap:** Choosing query parameter versioning without considering caching — CDNs and browsers cache GET requests by URL, and query params can cause cache fragmentation or stale responses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The four main strategies are URL versioning, header versioning, media type versioning, and query parameter versioning. URL versioning is the most practical — it's visible, cache-friendly, and easy to debug. Header versioning keeps URLs clean but is harder to test. Media type versioning is the most RESTful but complex. Query parameter versioning has caching issues. I recommend URL versioning for most teams."

#### How do you choose a versioning strategy?
- **The Engine Mechanism (Why it behaves this way):** Decision factors: (1) Client types — browser clients benefit from URL versioning (visible, testable); (2) CDN/caching needs — URL versioning works best with CDNs; (3) API maturity — new APIs can start without versioning; (4) Team preference — consistency matters more than the specific choice; (5) Existing conventions — follow what your organization already uses. The best strategy is the one your team can implement consistently.
- **The Unforgettable Mental Model:** The **Tool Selection Guide**. Choose the tool that fits the job: URL versioning for public APIs with diverse clients, header versioning for internal service-to-service APIs, media type for strict REST compliance.
- **The Trap:** Changing versioning strategy mid-project — consistency is more important than picking the "perfect" strategy. Switching causes confusion and migration overhead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I consider client types, caching needs, API maturity, team preference, and existing conventions. For public APIs with diverse clients, URL versioning is best. For internal service-to-service APIs, header versioning works well. The most important factor is consistency — whatever the team chooses, stick with it. Changing strategy mid-project causes more problems than choosing a suboptimal strategy."

#### How do you implement URL versioning?
- **The Engine Mechanism (Why it behaves this way):** URL versioning places the version in the path: `/api/v1/users`, `/api/v2/users`. Implementation: route prefix matching directs requests to version-specific controllers/handlers. Shared logic is extracted into common modules. Version-specific logic lives in versioned directories. The router maps `/api/v1/*` to v1 handlers and `/api/v2/*` to v2 handlers.
- **The Unforgettable Mental Model:** The **Parallel Assembly Lines**. Two assembly lines (v1 and v2) run side by side, each producing the same product with different specifications. Shared components (motors, wheels) come from the same supplier (common modules).
- **The Trap:** Duplicating all code between versions — shared logic should be extracted into common modules to avoid maintenance burden.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: URL versioning routes requests based on the version prefix in the path. `/api/v1/*` goes to v1 handlers, `/api/v2/*` to v2 handlers. I extract shared logic into common modules and keep only version-specific differences in versioned directories. Code duplication between versions is the anti-pattern — shared logic should be centralized to reduce maintenance burden."

#### How do you handle shared logic across versions?
- **The Engine Mechanism (Why it behaves this way):** Shared logic patterns: (1) Common modules — validation, authentication, serialization shared across versions; (2) Adapter pattern — v2 handlers call v1 logic with adapters for differences; (3) Strategy pattern — version-specific behavior selected at runtime; (4) Inheritance — base controller with version-specific overrides. The goal is to minimize duplication while allowing version-specific customization.
- **The Unforgettable Mental Model:** The **Shared Kitchen, Separate Recipes**. The kitchen (common modules) has the same ingredients and equipment, but each chef (version) follows their own recipe (version-specific logic).
- **The Trap:** Over-sharing logic — if v1 and v2 have fundamentally different behavior, forcing them to share code creates complexity. Sometimes duplication is cleaner than over-abstraction.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use common modules for shared logic like validation, authentication, and serialization. Version-specific behavior uses adapters or strategy patterns. The key is balancing sharing with separation — over-sharing creates complexity when versions diverge, but under-sharing creates maintenance burden. Sometimes a small amount of duplication is cleaner than a complex abstraction."

#### How do you deprecate an API version?
- **The Engine Mechanism (Why it behaves this way):** Deprecation process: (1) Add `Deprecation: true` and `Sunset: <date>` headers to all v1 responses; (2) Update documentation with migration guide; (3) Log v1 usage with client identification; (4) Notify all registered clients; (5) Monitor v2 adoption; (6) Send final warnings before sunset; (7) Return 410 Gone after sunset date. The process takes 3-6 months minimum.
- **The Unforgettable Mental Model:** The **Service Disnotice**. First, warning labels appear (deprecation headers), then the manual is updated (documentation), usage is tracked (logging), customers are notified (communication), and finally the service ends (410 Gone).
- **The Trap:** Returning 404 after sunset — 410 Gone is the correct status code, indicating the resource existed but has been permanently removed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I add deprecation and sunset headers, update documentation with migration guides, log usage, notify clients, monitor adoption, send final warnings, and return 410 Gone after the sunset date. 410 is the correct status code — it indicates the resource existed but has been permanently removed, unlike 404 which suggests it never existed."

#### How do you test API versioning?
- **The Engine Mechanism (Why it behaves this way):** Testing strategy: (1) Test each version independently — v1 and v2 have separate test suites; (2) Test version routing — requests go to the correct version handler; (3) Test shared logic — common modules work correctly for all versions; (4) Test deprecation — deprecated version returns correct headers; (5) Test migration — v2 produces expected results for v1 inputs; (6) Cross-version compatibility tests.
- **The Unforgettable Mental Model:** The **Dual Certification Program**. Each version has its own certification (test suite), the routing system is tested, shared components are verified, and the migration path is validated.
- **The Trap:** Only testing the latest version — older versions still serve production traffic and need full test coverage.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test each version independently with separate test suites, verify version routing, test shared logic across versions, validate deprecation headers, and test migration paths. Testing older versions is critical — they still serve production traffic. Cross-version compatibility tests ensure that the migration path works correctly."

#### What logs and metrics would you add for API versioning?
- **The Engine Mechanism (Why it behaves this way):** Logs: version usage (client, version, endpoint, timestamp), deprecation header delivery, migration events, version routing decisions. Metrics: traffic distribution by version, deprecated version usage rate, migration completion rate, version-specific error rates, response time by version. Alerts: deprecated version usage after sunset, version-specific error rate spikes, slow migration progress.
- **The Unforgettable Mental Model:** The **Version Traffic Control Tower**. Real-time view of traffic distribution across versions, migration progress, and alerts for deprecated version usage or version-specific issues.
- **The Trap:** Not tracking version usage per client — without this data, you can't identify which clients are still on deprecated versions and need migration support.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log version usage with client identification, track traffic distribution by version, monitor deprecated version usage, and measure migration completion rates. I alert on deprecated version usage after sunset, version-specific error rate spikes, and slow migration progress. Per-client version tracking is essential for targeted migration outreach."

#### How do you handle database schema changes with API versioning?
- **The Engine Mechanism (Why it behaves this way):** Database strategies: (1) Additive migrations only — add columns, never remove during the transition; (2) Version-aware models — v1 and v2 handlers read/write different columns; (3) Migration scripts — after v1 sunset, migrate data from old columns to new and remove old columns; (4) View layer — database views present different schemas to different API versions. The database evolves additively during the transition period.
- **The Unforgettable Mental Model:** The **House Renovation**. Add the new room (new columns) while keeping the old one (old columns). Both versions of the house work during renovation. After everyone moves to the new wing, the old room is removed.
- **The Trap:** Removing database columns before all API versions are sunset — this breaks the old API version even though it's still serving traffic.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use additive-only database migrations during the transition — add columns, never remove. Version-aware handlers read/write the appropriate columns. After all clients migrate and the old version is sunset, I run migration scripts to move data and remove old columns. Removing columns before sunset breaks the old API version."

## 8. Active recall test

1. **What are the four API versioning strategies?**
   - **Explanation:** URL versioning, header versioning, media type versioning, and query parameter versioning — each with different tradeoffs in visibility, cacheability, and complexity.

2. **Which versioning strategy is most recommended for public APIs?**
   - **Explanation:** URL versioning (`/api/v1/`) — it's visible, cache-friendly, easy to debug, and works well with CDNs.

3. **Why avoid query parameter versioning?**
   - **Explanation:** It interacts poorly with HTTP caching — CDNs and browsers cache by URL, and query params can cause cache fragmentation or stale responses.

4. **What status code indicates a deprecated API version has been removed?**
   - **Explanation:** `410 Gone` — the resource existed but has been permanently removed, unlike 404 which suggests it never existed.

5. **How should shared logic be handled across API versions?**
   - **Explanation:** Extract into common modules — validation, authentication, serialization are shared, while version-specific logic lives in versioned directories.

6. **What headers indicate API version deprecation?**
   - **Explanation:** `Deprecation: true` and `Sunset: <date>` — these inform clients that the version will be removed and when.

7. **Why test older API versions?**
   - **Explanation:** They still serve production traffic — test coverage must be maintained for all active versions, not just the latest.

8. **What is the recommended deprecation timeline?**
   - **Explanation:** 3-6 months minimum — enough time for clients to detect deprecation, plan migration, and implement changes.

9. **How should database schemas evolve during API versioning?**
   - **Explanation:** Additive-only migrations — add columns during transition, never remove. Remove old columns only after all API versions using them are sunset.

10. **What metric shows whether versioning is working?**
    - **Explanation:** Traffic distribution by version and migration completion rate — these show how many clients have moved to the new version and how quickly.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for API Versioning Design.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
