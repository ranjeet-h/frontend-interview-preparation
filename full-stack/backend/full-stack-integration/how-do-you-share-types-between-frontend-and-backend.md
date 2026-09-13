# How do you share types between frontend and backend

## Detailed explanation

How do you share types between frontend and backend is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you share types between frontend and backend affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### Why is sharing types between frontend and backend important?
- **The Engine Mechanism (Why it behaves this way):** When frontend and backend maintain separate type definitions, they inevitably drift apart. The backend changes a field type, the frontend's duplicate type becomes stale, and TypeScript fails to catch the mismatch — resulting in runtime errors. Shared types create a single source of truth: define once, use everywhere. When the backend changes a type, the frontend's TypeScript compiler immediately flags any incompatibilities.
- **The Unforgettable Mental Model:** The **Shared Blueprint**. Both the electrician (backend) and plumber (frontend) work from the same building blueprint. If the architect moves a wall, both see the updated plan immediately. Separate blueprints mean the electrician wires a wall that no longer exists.
- **The Trap:** Copying types between frontend and backend manually. This works initially but becomes unmaintainable as the API grows. Every backend change requires a manual type update on the frontend, and missed updates cause runtime errors.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Shared types eliminate the drift problem where frontend and backend type definitions diverge over time. With a single source of truth, any backend type change immediately surfaces as a TypeScript compilation error on the frontend. This catches API incompatibilities at compile time rather than runtime, preventing subtle bugs where the frontend expects a string but receives a number, or a required field is suddenly optional."

#### How do you share types in a monorepo?
- **The Engine Mechanism (Why it behaves this way):** In a monorepo (using Turborepo, Nx, or pnpm workspaces), you create a shared package (e.g., `@workspace/types` or `@workspace/api`) that exports TypeScript interfaces, types, and Zod schemas. Both the frontend and backend packages add this shared package as a dependency. When types change, both packages rebuild automatically. The shared package lives in a `packages/types` directory at the repo root.
- **The Unforgettable Mental Model:** The **Central Library**. Instead of each department (frontend/backend) maintaining their own reference manuals, there's one central library (shared package) that everyone borrows from. When the manual is updated, everyone gets the new edition.
- **The Trap:** Putting backend-specific types (database models, ORM types) in the shared package. The shared package should only contain API contract types — what the frontend actually receives, not the backend's internal data structures.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: In a monorepo, I create a `packages/api-types` package that exports TypeScript interfaces and Zod schemas for all API request/response shapes. Both frontend and backend import from this package. The key discipline: only API contract types go in the shared package — no database models, no ORM types, no backend internals. The shared types represent the wire format, not the internal representation."

#### How do you share types when frontend and backend are in separate repositories?
- **The Engine Mechanism (Why it behaves this way):** For separate repos, types are shared via: (1) publishing the shared types as a private npm package that both repos install, (2) generating types from an OpenAPI spec using tools like openapi-typescript or orval, or (3) using a git submodule or CI pipeline that copies types between repos. The most robust approach is OpenAPI spec generation — the backend owns the spec, and the frontend generates types from it automatically.
- **The Unforgettable Mental Model:** The **Diplomatic Cable**. Two embassies (separate repos) communicate through official cables (published types). The sending embassy writes the message (backend defines spec), packages it securely (publishes npm package), and the receiving embassy decodes it (frontend installs and uses types).
- **The Trap:** Manually copying type files between repos via PRs. This creates a tight coupling between repos and slows down development. Automated type generation or package publishing is essential.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For separate repos, I prefer OpenAPI spec generation. The backend maintains the OpenAPI spec, and a CI step generates TypeScript types for the frontend using openapi-typescript. The generated types are committed to the frontend repo or consumed at build time. Alternatively, I publish shared types as a private npm package. The key is automation — type updates should flow from backend to frontend without manual copying or cross-repo PRs."

#### How do you use Zod for shared validation and types?
- **The Engine Mechanism (Why it behaves this way):** Zod schemas serve dual purposes: runtime validation and TypeScript type inference. A single Zod schema like `z.object({ id: z.string(), name: z.string().min(1) })` provides both a runtime validator (`schema.parse(data)`) and a TypeScript type (`type User = z.infer<typeof schema>`). The shared package exports Zod schemas, and both frontend and backend use them for validation and typing.
- **The Unforgettable Mental Model:** The **Universal Adapter**. One device (Zod schema) plugs into both the wall outlet (runtime validation) and the USB port (TypeScript types). Same adapter, two different uses.
- **The Trap:** Using Zod only for runtime validation without inferring TypeScript types. This defeats the purpose — you end up with separate type definitions alongside Zod schemas, recreating the drift problem.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use Zod schemas as the single source of truth for API types. A schema like `UserSchema = z.object({ id: z.string(), email: z.string().email() })` provides both runtime validation (`UserSchema.parse(data)`) and TypeScript types (`type User = z.infer<typeof UserSchema>`). The shared package exports schemas, and both sides use them. This ensures the runtime validation rules and TypeScript types are always in sync — change the schema, and both update automatically."

#### How do you generate frontend types from an OpenAPI spec?
- **The Engine Mechanism (Why it behaves this way):** Tools like openapi-typescript, orval, or Swagger Codegen read an OpenAPI spec and generate TypeScript types, API client functions, and React Query hooks. The generation runs in CI or as a pre-commit hook. The output is committed to the frontend repo or generated at build time. When the backend updates the spec, the frontend regenerates types automatically.
- **The Unforgettable Mental Model:** The **3D Printer**. The OpenAPI spec is the CAD file (design blueprint). The type generator is the 3D printer — feed it the blueprint, and it produces the exact physical object (TypeScript types, API clients, hooks) automatically.
- **The Trap:** Committing generated types without a regeneration process. Generated types become stale if not regenerated when the spec changes. Automate regeneration in CI or as a build step.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use openapi-typescript to generate TypeScript types from the backend's OpenAPI spec. The generation runs as a CI step — when the backend updates the spec, the frontend regenerates types automatically. I also use orval to generate React Query hooks alongside types, so the frontend gets both typed data and typed API calls. Generated files are committed to the repo with a clear header indicating they're auto-generated, and the regeneration command is documented in the README."

#### How do you handle type conflicts between frontend and backend needs?
- **The Engine Mechanism (Why it behaves this way):** Sometimes the frontend needs a different type shape than the backend provides (e.g., the backend returns a timestamp string, the frontend wants a Date object). The solution is a transformation layer: shared types represent the wire format (what travels over the network), and each side transforms to/from its internal representation. The frontend transforms API responses to UI-friendly types; the backend transforms internal models to API types.
- **The Unforgettable Mental Model:** The **Power Converter**. The wall outlet provides 120V (wire format), but your laptop needs 20V (internal format). The power converter (transformation layer) translates between the two. The outlet and laptop don't need to agree on voltage — the converter handles it.
- **The Trap:** Putting UI-specific types in the shared package. The shared package should only contain wire format types. UI types (like `formattedDate: string` instead of `createdAt: string`) belong in the frontend's internal code.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I separate wire format types from internal types. The shared package contains only wire format types — exactly what travels over the network. Each side has a transformation layer: the frontend maps API responses to UI-friendly types (parsing dates, formatting numbers), and the backend maps internal models to API types. This keeps the shared package clean and focused on the contract, while each side optimizes its internal representation for its own needs."

#### What would you monitor for shared types in production?
- **The Engine Mechanism (Why it behaves this way):** Shared type monitoring tracks type generation failures in CI, runtime validation errors (Zod parse failures), and type drift incidents (where the frontend received unexpected data shapes). These metrics reveal whether the type sharing pipeline is working and whether the backend is honoring the shared contract.
- **The Unforgettable Mental Model:** The **Supply Chain Tracker**. It monitors whether the factory (backend) is producing parts matching the spec (shared types), whether the shipping (type generation) is working, and whether the assembly line (frontend) is receiving the right parts.
- **The Trap:** Not monitoring runtime validation failures. TypeScript catches compile-time mismatches, but runtime Zod parse failures reveal cases where the backend sent data that didn't match the shared schema — a critical contract violation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor type generation failures in CI (indicates spec-to-type pipeline issues), runtime Zod parse failures (backend sent data not matching the shared schema), and type drift incidents detected through error tracking. I also track the time between backend type changes and frontend type updates — a long gap indicates the sharing pipeline is broken. Runtime validation failures are the most critical metric since they represent actual contract violations reaching production."

## 8. Active recall test

1. **What problem does sharing types between frontend and backend solve?**
   - **Explanation:** Type drift — when frontend and backend maintain separate type definitions that diverge over time. Shared types create a single source of truth, so backend type changes immediately surface as TypeScript compilation errors on the frontend, catching API incompatibilities at compile time rather than runtime.

2. **What should and shouldn't go in a shared types package?**
   - **Explanation:** Should: API contract types (request/response shapes, error formats, pagination structures). Shouldn't: database models, ORM types, backend internals, or UI-specific types. The shared package represents the wire format — what travels over the network, not internal representations.

3. **How do you share types between separate repositories?**
   - **Explanation:** Use OpenAPI spec generation (backend maintains spec, frontend generates types via openapi-typescript) or publish shared types as a private npm package. The key is automation — type updates should flow from backend to frontend without manual copying or cross-repo PRs.

4. **What dual purpose do Zod schemas serve?**
   - **Explanation:** Runtime validation (`schema.parse(data)`) and TypeScript type inference (`type User = z.infer<typeof schema>`). A single Zod schema provides both, ensuring validation rules and types are always in sync. Change the schema, and both update automatically.

5. **How do you handle cases where frontend needs a different type shape than the backend provides?**
   - **Explanation:** Use a transformation layer. Shared types represent the wire format (network data). The frontend transforms API responses to UI-friendly types (parsing dates, formatting numbers). The backend transforms internal models to API types. Keep shared types focused on the contract, not internal representations.

6. **How do you automate type generation from an OpenAPI spec?**
   - **Explanation:** Run openapi-typescript or orval as a CI step or build script. When the backend updates the spec, the pipeline regenerates TypeScript types, API client functions, and React Query hooks for the frontend. Generated files are committed with an auto-generated header.

7. **What is the most critical metric for shared type health?**
   - **Explanation:** Runtime Zod parse failure rate — the number of times the backend sent data that didn't match the shared schema. This represents actual contract violations reaching production. TypeScript catches compile-time mismatches, but runtime failures reveal gaps in the type sharing pipeline.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you share types between frontend and backend in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you share types between frontend and backend in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
