# How do you design frontend and backend contracts

## Detailed explanation

How do you design frontend and backend contracts is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you design frontend and backend contracts affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is a frontend-backend contract?
- **The Engine Mechanism (Why it behaves this way):** A frontend-backend contract is a formal agreement on the shape of API requests and responses — including URL paths, HTTP methods, request/response body schemas, headers, status codes, and error formats. It serves as the interface between the two layers, allowing them to evolve independently as long as the contract is maintained. Contracts are typically defined using OpenAPI/Swagger specs, TypeScript types, or schema definitions (Zod, JSON Schema).
- **The Unforgettable Mental Model:** The **Electrical Outlet Standard**. The wall outlet (backend) and the plug (frontend) don't need to know about each other's internals — they just need to agree on the shape (contract). As long as both follow the standard, any plug works with any outlet.
- **The Trap:** Treating the contract as informal documentation that gets outdated. Contracts must be machine-readable and validated — either through code generation, schema validation, or contract testing — to prevent drift.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A frontend-backend contract is a formal, machine-readable agreement on API shapes — URLs, methods, request/response schemas, status codes, and error formats. I define contracts using OpenAPI specs or shared TypeScript types, validate them with schema tools like Zod, and enforce them through contract tests. The contract allows frontend and backend teams to work in parallel — as long as both honor the contract, they can evolve their internal implementations independently."

#### How do you design an API contract before implementation?
- **The Engine Mechanism (Why it behaves this way):** API-first design starts by writing the contract (OpenAPI spec or TypeScript types) before writing any implementation code. The contract defines endpoints, request/response schemas, error formats, and pagination patterns. Both frontend and backend teams review and agree on the contract. Then the backend implements to satisfy the contract, and the frontend generates client code or types from it.
- **The Unforgettable Mental Model:** The **Architect's Blueprint**. Before laying a single brick, the architect draws the complete blueprint. The construction team (backend) builds to spec, and the interior designer (frontend) plans around the finished structure. Both work from the same blueprint.
- **The Trap:** Starting implementation without a contract. This leads to frontend and backend evolving in different directions, requiring costly rework when they finally integrate.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use an API-first approach — write the OpenAPI spec or TypeScript types before any implementation. The contract defines endpoints, schemas, error formats, and pagination. Both teams review it in a contract review meeting. Once agreed, the backend implements to satisfy the spec, and the frontend generates typed client code from it. This enables parallel development and catches design issues early, before code is written."

#### How do you share contract types between frontend and backend?
- **The Engine Mechanism (Why it behaves this way):** Shared types can be distributed via: (1) a shared npm package containing TypeScript types or Zod schemas, (2) code generation from an OpenAPI spec (using tools like openapi-typescript or Swagger Codegen), or (3) a monorepo where both frontend and backend import from a shared `@workspace/types` package. The key is a single source of truth — types are defined once and consumed by both sides.
- **The Unforgettable Mental Model:** The **Shared Dictionary**. Both teams use the same dictionary (shared types) to ensure they're speaking the same language. When a word's definition changes (type updates), both teams get the updated definition automatically.
- **The Trap:** Duplicating types in both frontend and backend codebases. When the backend changes a field type, the frontend's duplicate type becomes stale, causing runtime errors that TypeScript should have caught.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a single source of truth for contract types. In a monorepo, I create a shared `@workspace/api-types` package that both frontend and backend import. For separate repos, I generate types from an OpenAPI spec using openapi-typescript and publish them as an npm package. Either way, types are defined once — if the backend changes a schema, the shared types update and the frontend's TypeScript compiler catches any incompatibilities."

#### How do you handle breaking changes in API contracts?
- **The Engine Mechanism (Why it behaves this way):** Breaking changes (removing fields, changing types, altering response structures) require versioning. Strategies include: URL versioning (`/api/v1/` → `/api/v2/`), header-based versioning, or additive-only changes (never remove, only add). Deprecation headers signal upcoming changes. The old version remains available until all clients migrate, then it's sunset after a grace period.
- **The Unforgettable Mental Model:** The **Road Detour**. When a road needs renovation (breaking change), you don't close it immediately. You build a new road alongside it (v2), put up signs directing traffic to the new road (deprecation headers), and only close the old road after everyone has switched.
- **The Trap:** Making breaking changes without versioning. Removing a field that the frontend depends on causes immediate runtime errors. Always use additive changes or version the API.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle breaking changes through API versioning and deprecation. For breaking changes, I create a new version (v2) alongside the existing one (v1). I add deprecation headers to v1 responses with a sunset date. The frontend migrates to v2 at its own pace. For non-breaking changes, I follow the additive-only rule — never remove or change existing fields, only add new optional ones. This ensures backward compatibility."

#### How do you validate that the backend honors the contract?
- **The Engine Mechanism (Why it behaves this way):** Contract validation uses automated tests that verify the backend's actual responses match the contract schema. Tools like Dredd, Schemathesis, or custom test suites send requests to the backend and validate responses against the OpenAPI spec or Zod schemas. This runs in CI to catch contract violations before deployment.
- **The Unforgettable Mental Model:** The **Quality Control Inspector**. Every product coming off the assembly line (backend response) is measured against the blueprint (contract). If dimensions don't match (schema violation), the product is rejected before shipping.
- **The Trap:** Only testing the happy path in contract tests. Contract tests should also verify error responses, edge cases (empty arrays, null values), and pagination metadata to ensure the full contract is honored.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate contract compliance through automated contract tests in CI. I use tools that send requests to the backend and validate responses against the OpenAPI spec — checking status codes, response schemas, required fields, and error formats. I also test edge cases: empty responses, null values, and pagination boundaries. If the backend returns a response that doesn't match the contract, the CI pipeline fails, preventing deployment of a contract-breaking change."

#### How do you handle optional vs required fields in contracts?
- **The Engine Mechanism (Why it behaves this way):** Contracts explicitly mark fields as required or optional. Required fields must always be present in the response; optional fields may be absent or null. The frontend must handle both cases — accessing optional fields with null checks or optional chaining. The backend must never omit required fields and should document when optional fields are present vs absent.
- **The Unforgettable Mental Model:** The **Restaurant Menu**. Required fields = every dish comes with rice (always present). Optional fields = extra sauce (sometimes present, sometimes not). You always expect rice, but you don't crash if there's no extra sauce.
- **The Trap:** Treating optional fields as required in the frontend. Accessing `user.avatar.url` without checking if `avatar` exists causes runtime errors when the field is absent. Always use optional chaining: `user?.avatar?.url`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Contracts clearly mark fields as required or optional. The backend guarantees required fields are always present and documents the conditions under which optional fields appear. The frontend accesses optional fields with null checks or optional chaining. TypeScript's type system enforces this at compile time — optional fields are typed as `field?: Type` or `field: Type | null`, forcing the developer to handle the absent case. I also use Zod runtime validation to catch any backend violations."

#### What would you monitor for API contracts in production?
- **The Engine Mechanism (Why it behaves this way):** Contract monitoring tracks schema validation failures at runtime, deprecation header usage (clients still using old versions), contract drift (backend responses diverging from spec), and client error rates caused by contract violations. Tools like runtime schema validation middleware log any response that doesn't match the contract.
- **The Unforgettable Mental Model:** The **Bridge Inspection**. Regular checks ensure the bridge (contract) hasn't developed cracks (drift), that old traffic patterns (deprecated versions) are being phased out, and that no unexpected loads (schema violations) are stressing the structure.
- **The Trap:** Not monitoring contract drift. The backend might slowly diverge from the spec as developers add fields or change types without updating the contract, causing subtle frontend bugs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor contract health through runtime schema validation — middleware that validates every backend response against the contract and logs violations. I track deprecation header usage to see which clients are still on old versions, monitor contract drift metrics to catch spec-to-implementation divergence, and alert on client error rates caused by contract violations. This ensures the contract remains a living, accurate agreement rather than stale documentation."

## 8. Active recall test

1. **What is the purpose of a frontend-backend contract?**
   - **Explanation:** It's a formal agreement on API shapes — URLs, methods, request/response schemas, status codes, and error formats. It allows frontend and backend teams to work in parallel and evolve independently, as long as both honor the contract. It serves as the interface between the two layers.

2. **What is API-first design?**
   - **Explanation:** Writing the API contract (OpenAPI spec or TypeScript types) before implementing any code. Both teams review and agree on the contract, then the backend implements to satisfy it and the frontend generates typed client code from it. This enables parallel development and catches design issues early.

3. **How do you share types between frontend and backend?**
   - **Explanation:** Use a single source of truth: a shared npm package with TypeScript types/Zod schemas, code generation from an OpenAPI spec, or a monorepo shared package. Types are defined once and imported by both sides, preventing duplication and drift.

4. **How do you handle breaking changes in API contracts?**
   - **Explanation:** Use API versioning — create a new version (v2) alongside the old one (v1). Add deprecation headers with a sunset date. Follow the additive-only rule for non-breaking changes: never remove or modify existing fields, only add new optional ones.

5. **How do you validate backend contract compliance?**
   - **Explanation:** Use automated contract tests in CI that send requests to the backend and validate responses against the OpenAPI spec or Zod schemas. Check status codes, response schemas, required fields, error formats, and edge cases. Fail the CI pipeline on contract violations.

6. **How should the frontend handle optional fields from the backend?**
   - **Explanation:** Access optional fields with null checks or optional chaining (`user?.avatar?.url`). TypeScript types them as `field?: Type` or `field: Type | null`, forcing compile-time handling of the absent case. Runtime validation with Zod catches any backend violations.

7. **What metric indicates contract drift in production?**
   - **Explanation:** Runtime schema validation failure rate — the number of backend responses that don't match the contract schema. A non-zero rate means the backend is diverging from the spec, which can cause subtle frontend bugs. This should be monitored and alerted on.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you design frontend and backend contracts in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you design frontend and backend contracts in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
