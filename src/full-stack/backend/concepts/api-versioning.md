# API Versioning

## Detailed explanation

API versioning is the practice of evolving APIs without breaking existing clients by keeping old contracts available while introducing new ones.

## 1. One-line mental model

Versioning lets APIs change without forcing all clients to update at once.

## 2. Problem it solves

Mobile apps, third-party clients, and deployed frontends cannot always update immediately when backend contracts change.

## 3. Core idea

- Common approaches: URL versioning, header versioning, and media type versioning.
- Version only when the contract changes incompatibly.
- Prefer additive changes when possible.
- Deprecate old versions with dates and migration docs.
- Keep response and error shapes stable inside a version.

## 4. Visual / analogy

```txt
v1 is old road; v2 is new road. Both may exist during migration.
```

## 5. Minimal example

```txt
/api/v1/users and /api/v2/users
```

## 6. Real-world example

A mobile app using v1 keeps working while web frontend adopts v2 response fields.

## 7. Common interview questions

#### What is API versioning?
- **The Engine Mechanism (Why it behaves this way):** API versioning is the practice of maintaining multiple API contracts simultaneously so that changes don't break existing clients. When the API contract changes incompatibly — removing fields, changing types, altering behavior — a new version is introduced. Common approaches include URL versioning (`/api/v1/users` vs `/api/v2/users`), header versioning (`Accept: application/vnd.myapi.v2+json`), and query parameter versioning (`/api/users?version=2`). The backend routes requests to the appropriate handler based on the version identifier, allowing old and new implementations to coexist.
- **The Unforgettable Mental Model:** API versioning is like **road construction with detours**. The old road (v1) stays open while the new road (v2) is built. Drivers choose when to switch, and eventually the old road closes with advance notice.
- **The Trap:** Versioning too early or for every minor change. Additive changes (new optional fields, new endpoints) are backward compatible and don't need versioning. Version only when breaking changes are unavoidable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: API versioning maintains multiple API contracts simultaneously so that changes don't break existing clients. When the contract changes incompatibly — removing fields, changing types, or altering behavior — a new version is introduced. The most common approach is URL versioning like `/api/v1/users` because it's explicit and easy to route. I prefer additive changes whenever possible since they don't break clients, and I version only when breaking changes are unavoidable."

#### Why does API versioning matter?
- **The Engine Mechanism (Why it behaves this way):** Mobile apps, third-party integrations, and deployed frontends cannot always update immediately when backend contracts change. A mobile app in the App Store may take weeks to get approved. Third-party partners may have their own release cycles. Without versioning, deploying a breaking change forces all clients to update simultaneously, which is impossible in practice. Versioning allows the backend to evolve while giving clients time to migrate at their own pace.
- **The Unforgettable Mental Model:** Versioning is like **a software library with backward compatibility**. You can upgrade to the new version when you're ready, but the old version keeps working until you migrate.
- **The Trap:** Never versioning and hoping clients update fast enough. This works for internal web frontends you control but fails for mobile apps and third-party integrations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: API versioning matters because clients can't always update immediately. Mobile apps have App Store review cycles, third-party partners have their own release schedules, and deployed frontends may be cached. Without versioning, a breaking change forces all clients to update simultaneously, which is impossible. Versioning lets the backend evolve while giving clients time to migrate. I design APIs to be backward compatible first, and only introduce versions when breaking changes are truly necessary."

#### What bugs happen when API versioning is handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor versioning causes several production issues. Breaking changes without versioning crash mobile apps that can't be updated quickly. Maintaining too many versions increases code complexity and testing burden. Inconsistent versioning strategies (some endpoints use URL versioning, others use headers) confuse clients. Forgetting to deprecate old versions leads to indefinite maintenance burden. Version-specific bugs where v1 and v2 handlers diverge and one becomes unmaintained.
- **The Unforgettable Mental Model:** Poor versioning is like **a restaurant that keeps every old menu forever**. The kitchen has to stock ingredients for 10 different menus, and nobody knows which one is current.
- **The Trap:** Creating a new version for every small change. This fragments the API, multiplies testing effort, and creates a maintenance nightmare. Version only for breaking changes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor versioning causes breaking changes that crash mobile apps, inconsistent versioning strategies that confuse clients, and indefinite maintenance of old versions. The worst bug is deploying a breaking change without versioning — mobile apps crash, third-party integrations fail, and you can't roll back because the database has already migrated. The fix is to version only for breaking changes, maintain a clear deprecation timeline, and communicate changes well in advance."

#### How does API versioning affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients must specify which API version they're targeting and handle version-specific response shapes. Web frontends can update immediately and target the latest version. Mobile apps may be stuck on an older version until the user updates. The frontend needs version-aware API clients that can handle different response shapes, field names, and error formats across versions. Feature flags can help gradually migrate from v1 to v2 by routing specific users or features to the new version.
- **The Unforgettable Mental Model:** The frontend is like a **translator between two language versions**. It knows which version the backend speaks and translates the response into what the UI expects.
- **The Trap:** Hardcoding the API version in multiple places. When it's time to migrate, you need to update every endpoint call. Use a centralized API client configuration.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Frontend clients must target a specific API version and handle version-specific response shapes. Web frontends can update immediately to the latest version, but mobile apps may lag behind. I use a centralized API client that manages the version header or URL prefix, so migration requires changing one configuration. For gradual migration, I use feature flags to route specific users or features to the new version while keeping the rest on the old version."

#### How would you test API versioning?
- **The Engine Mechanism (Why it behaves this way):** Version testing involves verifying that each version returns the expected response shape independently. Test v1 endpoints return v1 responses, v2 endpoints return v2 responses, and the two don't interfere. Test that deprecated versions still work correctly during the transition period. Test the migration path — ensure data created in v1 can be read in v2. Contract tests verify that each version's response matches its documented schema. Integration tests verify that both versions work against the same database.
- **The Unforgettable Mental Model:** Testing versioning is like **testing two versions of a recipe**. Both should produce edible food, but the ingredients and steps may differ. Taste-test each independently.
- **The Trap:** Only testing the latest version. Old versions must continue working correctly during the deprecation period. Test all active versions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test each API version independently — v1 returns v1 responses, v2 returns v2 responses. I verify that deprecated versions still work correctly during the transition period. I test the migration path to ensure data created in v1 can be read in v2. Contract tests verify each version's response matches its documented schema. I also test that both versions work against the same database without conflicts. The key is testing all active versions, not just the latest."

## 8. Active recall test

1. **Explain API versioning without looking at notes.**
   - **Explanation:** API versioning maintains multiple API contracts simultaneously so breaking changes don't crash existing clients. Common approaches include URL versioning (/api/v1/users), header versioning, and query parameters. Version only for breaking changes — additive changes are backward compatible.

2. **Give one production bug from poor API versioning.**
   - **Explanation:** Deploying a breaking change (removing a field) without versioning crashes mobile apps that can't be updated quickly. Users see broken screens, and the only fix is an emergency app update that takes days to get approved.

3. **Give one API example where versioning matters.**
   - **Explanation:** A user API changes the response from `{ "name": "full name" }` to `{ "firstName": "first", "lastName": "last" }`. v1 keeps the old shape for existing mobile apps, v2 uses the new shape for the web frontend. Both coexist during migration.

4. **Explain how a frontend client should handle API versioning.**
   - **Explanation:** The frontend uses a centralized API client that specifies the target version (via URL prefix or header). It handles version-specific response shapes through adapters or transformers. Web frontends target the latest version; mobile apps may need version-specific logic until the user updates.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

API Versioning is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain API Versioning in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define API Versioning in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
