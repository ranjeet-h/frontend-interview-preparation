# How do you prevent breaking frontend when backend changes

## Detailed explanation

How do you prevent breaking frontend when backend changes is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Make frontend and backend agree on auth, data contracts, errors, retries, and state.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define frontend-backend contract.
- Handle auth, cookies/tokens, CORS, and errors.
- Prevent duplicate or stale requests.
- Map backend validation to frontend UX.
- Keep contracts versioned and testable.

## 4. Visual / analogy

```txt
React UI -> API client -> backend endpoint -> response/error contract -> UI state
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply full-stack integration rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you prevent breaking frontend when backend changes affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you prevent backend changes from breaking the frontend?
- **The Engine Mechanism (Why it behaves this way):** Prevention requires a combination of contract enforcement, versioning, and deployment strategies. API contracts (OpenAPI specs) are validated in CI — backend changes that break the contract fail the build. API versioning ensures old endpoints remain available while new ones are introduced. Feature flags allow gradual rollout of changes. Canary deployments let a small percentage of traffic hit the new backend before full rollout.
- **The Unforgettable Mental Model:** The **Train Track Switch**. You don't yank the switch while the train is on it. You lay new tracks alongside the old ones (versioning), verify they're safe (contract tests), gradually divert traffic (canary), and only remove the old tracks after all trains have switched.
- **The Trap:** Deploying backend changes without checking frontend compatibility. Even with contract tests, subtle changes (new enum values, different date formats, additional required query params) can break the frontend without violating the schema.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent breakage through three layers: contract enforcement, versioning, and safe deployment. Contract tests in CI catch schema-breaking changes. API versioning ensures old endpoints remain available during transitions. For deployment, I use canary releases — routing 5% of traffic to the new backend first, monitoring for errors, then gradually increasing. I also use feature flags to toggle new behavior on/off without redeploying. The key principle: never break an existing contract, only extend it."

#### What is the additive-only change rule?
- **The Engine Mechanism (Why it behaves this way):** The additive-only rule states that you can only add new optional fields to an API response or request — never remove, rename, or change the type of existing fields. Adding optional fields is safe because existing clients ignore unknown fields. Removing or changing fields breaks clients that depend on them. This rule enables backward-compatible evolution without versioning for every change.
- **The Unforgettable Mental Model:** The **Buffet Table**. Adding a new dish (optional field) doesn't affect people who only eat the existing dishes. But removing a dish or changing its recipe breaks the people who came specifically for it.
- **The Trap:** Adding a new required field. A "new" field that's required is actually a breaking change — existing clients don't send it and will get validation errors. New fields must always be optional.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The additive-only rule means I only add new optional fields to APIs — never remove, rename, or change existing ones. Adding optional fields is safe because JSON parsers ignore unknown keys. Removing or changing fields breaks clients. New fields must be optional with sensible defaults so existing clients continue working. When a field truly needs to be removed, I deprecate it first (mark it, log usage), wait for clients to migrate, then remove it in a new API version."

#### How do you use contract testing to prevent breakage?
- **The Engine Mechanism (Why it behaves this way):** Contract tests run in CI and verify that the backend's actual API responses match the published contract (OpenAPI spec). Tools like Dredd, Pact, or custom test suites send real requests to the backend and validate every response field, type, and status code against the schema. If the backend changes in a way that violates the contract, the CI pipeline fails, preventing deployment.
- **The Unforgettable Mental Model:** The **Puzzle Piece Test**. Each API response is a puzzle piece that must fit the contract's puzzle board. Contract testing checks every edge and corner — if even one tab doesn't match, the piece is rejected.
- **The Trap:** Only testing successful responses in contract tests. Error responses, empty arrays, null fields, and pagination edge cases are equally important — they're where most contract violations occur.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I run contract tests in CI that send real requests to the backend and validate responses against the OpenAPI spec. Tests cover happy paths, error responses, empty collections, null fields, and pagination boundaries. If any response doesn't match the schema — wrong type, missing required field, unexpected status code — the CI fails. I also use consumer-driven contracts (Pact) where the frontend defines its expectations and the backend verifies it satisfies them."

#### How do feature flags help with backend changes?
- **The Engine Mechanism (Why it behaves this way):** Feature flags allow backend changes to be toggled on/off at runtime without redeployment. The backend checks a flag (from LaunchDarkly, Unleash, or env vars) to determine which behavior to use. If a change breaks the frontend, the flag is flipped off instantly, reverting to the old behavior. This decouples deployment from release.
- **The Unforgettable Mental Model:** The **Light Switch**. You wire up the new light (deploy the change) but keep the switch off. When you're ready, flip the switch (enable flag). If the light flickers (breakage), flip it back off instantly — no rewiring needed.
- **The Trap:** Accumulating dead feature flags. Flags that are permanently enabled or disabled become technical debt. Every flag should have an owner and an expiration date.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Feature flags decouple deployment from release. I deploy the backend change with the flag off, then enable it gradually — first for internal users, then 1% of traffic, then 100%. If the frontend breaks, I flip the flag off instantly without a redeploy. Flags also enable A/B testing and gradual migration. I ensure every flag has an owner and a cleanup plan — dead flags are technical debt that complicates the codebase."

#### How do you handle database schema changes that affect API responses?
- **The Engine Mechanism (Why it behaves this way):** Database schema changes (adding columns, renaming tables, changing types) must be decoupled from API changes. The migration strategy is: (1) add new columns without removing old ones, (2) update the backend to write to both old and new columns, (3) update the frontend to use the new API shape, (4) remove the old columns after frontend migration is complete. This is the expand-contract pattern.
- **The Unforgettable Mental Model:** The **Bridge Replacement**. You build a new bridge alongside the old one (add new columns), route traffic to it gradually (update backend/frontend), and only demolish the old bridge after all traffic has moved.
- **The Trap:** Renaming or dropping a database column in a single migration. This breaks the backend immediately and causes API failures for all frontend clients. Always expand first, contract later.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use the expand-contract pattern for database changes. First, expand: add new columns without removing old ones. The backend writes to both. Then migrate: update the frontend to use the new API shape. Finally, contract: remove old columns after confirming the frontend no longer depends on them. Each step is a separate deployment, ensuring zero downtime. I never rename or drop columns in a single migration — that's a guaranteed production incident."

#### How do you test frontend compatibility before deploying backend changes?
- **The Engine Mechanism (Why it behaves this way):** Pre-deployment testing uses a staging environment where the new backend is deployed alongside the current frontend. Integration tests run the full frontend against the new backend, catching compatibility issues. E2E tests (Cypress, Playwright) simulate user flows and verify the frontend works correctly with the new backend responses.
- **The Unforgettable Mental Model:** The **Dress Rehearsal**. Before opening night (production deployment), the cast (frontend) rehearses with the new set design (backend) on the actual stage (staging). Any mismatches are caught before the audience sees them.
- **The Trap:** Testing the new backend only with API tests, not with the actual frontend. API tests verify the contract, but the frontend might have assumptions not captured in the contract (field ordering, specific string formats, timing dependencies).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Before deploying backend changes, I run the full frontend test suite against the new backend in a staging environment. This includes E2E tests that simulate real user flows, integration tests that verify API compatibility, and visual regression tests that catch UI changes from modified response data. I also run the frontend's TypeScript compiler against the new API types — any type mismatches are caught before deployment. This catches issues that pure API contract tests might miss."

#### What would you monitor to detect backend-caused frontend breakage?
- **The Engine Mechanism (Why it behaves this way):** Monitoring tracks frontend error rates (JavaScript errors, API failures), user-reported issues, and behavioral anomalies (drop in conversion rates, increased bounce rates) after backend deployments. Correlating frontend error spikes with backend deployment timestamps quickly identifies causation. Real user monitoring (RUM) captures the actual user experience.
- **The Unforgettable Mental Model:** The **Seismograph**. Each backend deployment is a small earthquake. The seismograph (monitoring) detects tremors (error spikes) and measures their intensity. If a deployment causes a major quake (frontend breakage), you know immediately.
- **The Trap:** Only monitoring backend health (CPU, memory, response time). A backend can be perfectly healthy while returning data that crashes the frontend. Frontend error monitoring is equally important.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor frontend error rates (Sentry), API failure rates, and behavioral metrics (conversion, bounce rate) correlated with backend deployment timestamps. If a backend deployment coincides with a frontend error spike, I know the change caused breakage. I use RUM (Real User Monitoring) to see the actual user experience — not just server-side metrics. I also set up automated alerts: if frontend errors increase by more than 10% within 5 minutes of a backend deploy, the deployment is automatically rolled back."

## 8. Active recall test

1. **What are the three layers of preventing backend-caused frontend breakage?**
   - **Explanation:** (1) Contract enforcement — CI tests that validate backend responses against the OpenAPI spec. (2) Versioning — old endpoints remain available while new ones are introduced. (3) Safe deployment — canary releases and feature flags that allow gradual rollout and instant rollback.

2. **What is the additive-only change rule?**
   - **Explanation:** Only add new optional fields to APIs — never remove, rename, or change existing fields. Adding optional fields is safe because JSON parsers ignore unknown keys. New fields must be optional with sensible defaults so existing clients continue working without modification.

3. **What is the expand-contract pattern for database changes?**
   - **Explanation:** (1) Expand: add new database columns without removing old ones. (2) Migrate: update backend to write to both, update frontend to use new shape. (3) Contract: remove old columns after confirming frontend no longer depends on them. Each step is a separate deployment for zero downtime.

4. **How do feature flags prevent breakage from backend changes?**
   - **Explanation:** Feature flags allow backend changes to be toggled on/off at runtime without redeployment. Deploy with the flag off, enable gradually, and if breakage occurs, flip the flag off instantly. This decouples deployment from release and enables instant rollback.

5. **How do you test frontend compatibility before deploying backend changes?**
   - **Explanation:** Deploy the new backend to a staging environment and run the full frontend test suite against it — E2E tests, integration tests, and TypeScript compilation against new API types. This catches compatibility issues that pure API contract tests might miss, like UI assumptions not captured in the schema.

6. **Why is testing only with API tests insufficient?**
   - **Explanation:** API tests verify the contract schema but don't catch frontend assumptions outside the contract — field ordering, specific string formats, timing dependencies, or UI rendering issues from modified data. Running the actual frontend against the new backend catches these gaps.

7. **What metric most directly indicates backend-caused frontend breakage?**
   - **Explanation:** Frontend error rate spike correlated with backend deployment timestamp. If JavaScript errors or API failures increase within minutes of a backend deploy, the change likely caused breakage. This is more direct than backend-only metrics like CPU or response time.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you prevent breaking frontend when backend changes in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you prevent breaking frontend when backend changes in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
