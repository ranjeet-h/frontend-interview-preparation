# Backward Compatible APIs

## Detailed explanation

Evolve APIs with additive fields, stable semantics, and deprecation paths so old clients keep working. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Backward compatibility lets backend change without breaking deployed clients.

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

In production, backward compatible apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What makes an API change backward compatible?
- **The Engine Mechanism (Why it behaves this way):** A backward-compatible change is one that existing clients can handle without modification. Additive changes are safe: adding optional request fields, adding new response fields, adding new endpoints, adding new enum values. Clients ignore what they don't understand. Removing or changing existing fields is breaking.
- **The Unforgettable Mental Model:** The **Expanding Menu**. Adding new dishes to a restaurant menu doesn't confuse existing customers — they order what they know. But removing a dish they regularly order would break their routine.
- **The Trap:** Assuming adding a required field is backward compatible — existing clients don't send the new field, so their requests fail validation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Backward-compatible changes are additive: new optional fields, new response fields, new endpoints, new enum values. Existing clients ignore what they don't understand. Breaking changes are subtractive or modifying: removing fields, changing field types, changing semantics, removing endpoints. The key test: can an existing client continue working without any changes?"

#### What are safe additive changes?
- **The Engine Mechanism (Why it behaves this way):** Safe changes: adding optional request fields (with defaults), adding new response fields, adding new endpoints, adding new query parameters, adding new enum values, adding new error codes, adding new optional headers. These changes don't affect existing clients because they ignore unknown fields and parameters.
- **The Unforgettable Mental Model:** The **Universal Adapter**. New plugs (fields) can be added to the power strip, but existing plugs still work. The adapter accepts both old and new configurations.
- **The Trap:** Adding a new required response field that clients depend on for rendering — if the client expects a specific structure and the new field changes it, rendering may break.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Safe additive changes include optional request fields with defaults, new response fields, new endpoints, new query parameters, new enum values, and new error codes. Existing clients ignore unknown fields, so these changes don't affect them. The critical rule: new request fields must be optional with sensible defaults."

#### What are breaking changes to avoid?
- **The Engine Mechanism (Why it behaves this way):** Breaking changes: removing fields, renaming fields, changing field types (string to number), changing field semantics (date format change), removing endpoints, changing HTTP methods, changing status codes, making optional fields required, changing error code values, changing pagination format. Each of these breaks existing client assumptions.
- **The Unforgettable Mental Model:** The **Rewired Electrical System**. Changing the voltage (field type), moving the outlets (renaming), or removing circuits (removing fields) breaks everything plugged into the old system.
- **The Trap:** Changing a field's semantic meaning without changing its name — e.g., changing a date from "YYYY-MM-DD" to ISO 8601 with timezone. The field name is the same, but the format breaks clients.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Breaking changes include removing or renaming fields, changing field types or semantics, removing endpoints, changing HTTP methods or status codes, making optional fields required, and changing error codes or pagination format. The most subtle breaking change is altering a field's semantic meaning while keeping the same name — clients parse the same field but get unexpected values."

#### How do you deprecate an API field or endpoint?
- **The Engine Mechanism (Why it behaves this way):** Deprecation process: (1) Add deprecation header (`Deprecation: true`, `Sunset: <date>`); (2) Add deprecation notice to documentation; (3) Log usage of deprecated fields/endpoints; (4) Notify clients via email or dashboard; (5) Maintain the deprecated behavior for a transition period (3-6 months); (6) Remove after the sunset date. Never remove without notice.
- **The Unforgettable Mental Model:** The **Road Closure Notice**. First, signs warn of upcoming closure (deprecation header), then detours are posted (documentation), usage is tracked (logging), residents are notified (client communication), and finally the road closes after the announced date (sunset).
- **The Trap:** Removing deprecated fields without a transition period — clients that haven't updated will break immediately, causing production incidents.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I add deprecation headers (Deprecation, Sunset), update documentation, log usage, notify clients, maintain the deprecated behavior for 3-6 months, and remove after the sunset date. The key is communication and transition time. Never remove deprecated features without giving clients adequate time to migrate."

#### How do you test backward compatibility?
- **The Engine Mechanism (Why it behaves this way):** Compatibility tests: (1) Contract tests — verify existing response fields haven't changed; (2) Consumer-driven contracts — test against known client expectations; (3) Integration tests — run existing client code against the new API; (4) Schema diff — compare old and new schemas for breaking changes; (5) Canary releases — deploy to a subset of traffic and monitor for errors.
- **The Unforgettable Mental Model:** The **Compatibility Lab**. Old clients are tested against the new API version to ensure they still work. Schema diffs catch breaking changes before they reach production.
- **The Trap:** Only testing with the latest client — older client versions may still be in production and need to continue working.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use contract tests to verify existing response fields haven't changed, consumer-driven contracts to test against known client expectations, schema diffs to catch breaking changes, and canary releases to monitor real-world impact. Testing with older client versions is critical — the latest client isn't the only one in production."

#### How do you handle breaking changes when necessary?
- **The Engine Mechanism (Why it behaves this way):** Breaking change process: (1) Create a new API version (v2); (2) Implement the breaking change in v2; (3) Maintain v1 alongside v2; (4) Provide migration guide; (5) Set a deprecation timeline for v1; (6) Monitor v2 adoption; (7) Sunset v1 after all clients migrate. Never break v1 in place.
- **The Unforgettable Mental Model:** The **Parallel Highway**. Build the new highway (v2) alongside the old one (v1), direct traffic to the new one gradually, and close the old one only after everyone has moved.
- **The Trap:** Breaking the existing API version in place — this forces all clients to update simultaneously, which is impossible in practice.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For breaking changes, I create a new API version rather than modifying the existing one. Both versions run in parallel. I provide a migration guide, set a deprecation timeline, monitor adoption, and sunset the old version only after clients have migrated. Breaking an existing version in place is never acceptable — it causes immediate production incidents for all clients."

#### How do you detect breaking changes in CI/CD?
- **The Engine Mechanism (Why it behaves this way):** Detection tools: (1) Schema diff tools (OpenAPI diff, GraphQL schema comparison); (2) Contract test suites that run on every PR; (3) Consumer-driven contract tests (Pact); (4) Automated breaking change detection in CI pipeline; (5) Pre-deployment compatibility checks. These tools catch breaking changes before they reach production.
- **The Unforgettable Mental Model:** The **Breaking Change Detector**. Like a metal detector at security, it scans every API change for breaking patterns before allowing deployment.
- **The Trap:** Not running compatibility checks in CI — breaking changes can slip through code review if reviewers aren't aware of all client dependencies.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I run schema diff tools, contract tests, and consumer-driven contract tests in CI on every PR. Automated breaking change detection catches modifications to existing fields, removed endpoints, and changed types before they reach production. These tools are essential because code reviewers may not know about all client dependencies."

#### What logs and metrics would you add for backward compatibility?
- **The Engine Mechanism (Why it behaves this way):** Logs: deprecated field/endpoint usage (client, endpoint, field, timestamp), breaking change detection results, version adoption rates. Metrics: API version distribution, deprecated feature usage rate, breaking change count per release, client migration rate. Alerts: deprecated feature usage after sunset date, breaking changes detected in CI, slow version adoption.
- **The Unforgettable Mental Model:** The **Version Migration Tracker**. Which API versions are in use, which deprecated features are still being called, and how fast clients are migrating to new versions.
- **The Trap:** Not tracking deprecated feature usage after the sunset date — clients still using deprecated features after removal will experience errors.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log deprecated feature usage with client identification, track API version distribution, monitor breaking change counts per release, and measure client migration rates. I alert on deprecated feature usage after sunset dates, breaking changes detected in CI, and slow version adoption. Deprecated usage tracking after sunset is critical — it identifies clients that need immediate attention."

## 8. Active recall test

1. **What makes an API change backward compatible?**
   - **Explanation:** An existing client can continue working without modification — typically additive changes like new optional fields, new endpoints, or new enum values.

2. **Why is adding a required field a breaking change?**
   - **Explanation:** Existing clients don't send the new field, so their requests fail validation — the change breaks existing client behavior.

3. **What headers indicate API deprecation?**
   - **Explanation:** `Deprecation: true` and `Sunset: <date>` — these inform clients that a feature will be removed and when.

4. **What is the recommended deprecation transition period?**
   - **Explanation:** 3-6 months — enough time for clients to detect the deprecation, plan migration, and implement changes.

5. **How should breaking changes be introduced?**
   - **Explanation:** Through a new API version (v2) running in parallel with the old version (v1), with a migration guide and deprecation timeline.

6. **What tools detect breaking changes in CI/CD?**
   - **Explanation:** Schema diff tools (OpenAPI diff), contract tests, consumer-driven contract tests (Pact), and automated breaking change detection pipelines.

7. **What is the most subtle breaking change?**
   - **Explanation:** Changing a field's semantic meaning while keeping the same name — e.g., changing date format. The field name is unchanged, but the value format breaks clients.

8. **Why test with older client versions?**
   - **Explanation:** Not all clients update immediately — older versions may still be in production and need to continue working with the API.

9. **What metric indicates migration progress?**
   - **Explanation:** API version distribution and deprecated feature usage rate — these show how many clients have migrated to the new version.

10. **What should never be done to an existing API version?**
    - **Explanation:** Break it in place — removing fields, changing types, or altering semantics in an existing version causes immediate production incidents for all clients.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Backward Compatible APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
