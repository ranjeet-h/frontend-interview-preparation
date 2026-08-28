# TypeScript Interview Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone, interview-first TypeScript section to the mdBook with source-backed lessons, runnable examples, and complete answers to every TypeScript interview question introduced by the section.

**Architecture:** Create a new `src/typescript/` track with one landing page and focused leaf lessons. Each concept lesson follows the repository’s canonical Type A study format, while the question bank groups answered prompts by interview priority. Keep React-specific material in the existing `src/react/typescript-react.md` page and cross-link to it instead of duplicating it.

**Tech Stack:** Markdown, mdBook, TypeScript examples, Node.js tooling where needed, and the official TypeScript handbook as the semantic reference.

## Global Constraints

- Interview-prep sources determine topic priority, not technical truth.
- Official TypeScript documentation is the authority for compiler semantics and version-sensitive syntax.
- Every interview question added to a lesson or the question bank must include a complete answer, reasoning, and a correct example or solution when code is involved.
- Use the repository’s canonical Type A study-page format in this exact order: `Why This Exists — The Problem First`, `The Analogy — Make It Obvious`, `How It Actually Works — The Full Explanation`, `Real Code — See It Working`, `The Interview Questions — All of Them, Done Properly`, `The Traps — What Goes Wrong in Production`, `Compare With Related Concepts`, and `🧠 The Memory Hook`.
- Never open a lesson with a definition; start with a concrete failure, production pain, or interview situation.
- Use simple spoken English, accurate analogies, correct runnable code, and page-specific reasoning.
- Do not use `Engine Mechanism`, `Senior Interview Playbook`, script-like interview answers, or vague filler.
- Do not add nested sub-headers under the eight canonical lesson sections.
- Do not duplicate the existing React TypeScript lesson; link to it for JSX, props, events, refs, context, reducers, and hooks.
- Keep examples framework-independent unless a page explicitly links to the React companion.
- Keep runtime validation distinct from static typing: annotations and assertions do not validate untrusted data.
- Preserve existing legacy chapters and unrelated worktree changes.
- New pages must be linked from `src/SUMMARY.md`; mdBook omits unlinked files.
- Do not add a TypeScript runtime dependency or application code to this documentation repository.
- Before any completion claim, run fresh verification for Markdown structure, links, code fences, and mdBook build.

## File map and task boundaries

- Create `src/typescript/index.md`: track landing page, study order, tier legend, source policy, and React companion link.
- Create `src/typescript/mental-model-and-inference.md`: compile-time/runtime boundary, inference, widening, contextual typing, and structural typing.
- Create `src/typescript/types-unions-and-interfaces.md`: core types, `type` versus `interface`, unions, intersections, and top/bottom-like types.
- Create `src/typescript/narrowing-and-type-guards.md`: control-flow narrowing, guards, predicates, discriminated unions, and exhaustiveness.
- Create `src/typescript/functions-and-call-signatures.md`: function contracts, callbacks, `this`, overloads, unions, and generic call signatures.
- Create `src/typescript/generics-and-type-relationships.md`: generic inference, constraints, `keyof`, indexed access, defaults, and relationships.
- Create `src/typescript/utility-types.md`: built-in utility types and practical implementations of representative utilities.
- Create `src/typescript/mapped-conditional-and-template-types.md`: mapped, conditional, distributive, `infer`, and template literal types.
- Create `src/typescript/literal-types-as-const-and-satisfies.md`: literal widening, `as const`, `satisfies`, readonly inference, and configuration objects.
- Create `src/typescript/classes-modules-and-declarations.md`: classes, `implements`, modules, resolution, declaration merging, ambient declarations, and `.d.ts` files.
- Create `src/typescript/tsconfig-and-strictness.md`: strict compiler flags, target/module choices, libraries, resolution, and diagnostics.
- Create `src/typescript/runtime-validation-and-api-boundaries.md`: `unknown`, assertions, validators, API responses, and runtime/static boundaries.
- Create `src/typescript/practical-interview-patterns.md`: applied type modeling for async UI state, APIs, event emitters, forms, and invalid-state prevention.
- Create `src/typescript/interview-question-bank.md`: 50 answered interview prompts, including conceptual, type-error, practical, and coding questions.
- Modify `src/SUMMARY.md`: add the TypeScript track in the top-level study order after JavaScript and before DSA.

## Task 1: TypeScript track foundation and navigation

**Files:**

- Create: `src/typescript/index.md`
- Modify: `src/SUMMARY.md`

**Interfaces:**

- Consumes: existing JavaScript, DSA, and React entries in `src/SUMMARY.md`, plus `src/react/typescript-react.md`.
- Produces: a reachable `TypeScript` section whose child links match every lesson path created by Tasks 2–14.

- [ ] **Step 1: Read the existing navigation and landing-page conventions.**

  Inspect `src/SUMMARY.md`, `src/javascript/index.md`, `src/react/index.md`, and `src/study-system.md`. Preserve the current top-level ordering and link indentation style.

- [ ] **Step 2: Write the landing page.**

  `src/typescript/index.md` must include: why a separate TypeScript track exists, the recommended study order, an interview-priority table with Tier 1/Tier 2/Tier 3 meanings, the 13 lesson links, a link to `../react/typescript-react.md`, the source policy, and a note that every question in the track is answered.

- [ ] **Step 3: Add the navigation entry.**

  Add this exact structure under the JavaScript track and before DSA:

  ```md
  # TypeScript

  - [TypeScript](typescript/index.md)
    - [Mental Model and Type Inference](typescript/mental-model-and-inference.md)
    - [Types, Unions, and Interfaces](typescript/types-unions-and-interfaces.md)
    - [Narrowing and Type Guards](typescript/narrowing-and-type-guards.md)
    - [Functions and Call Signatures](typescript/functions-and-call-signatures.md)
    - [Generics and Type Relationships](typescript/generics-and-type-relationships.md)
    - [Utility Types](typescript/utility-types.md)
    - [Mapped, Conditional, and Template Types](typescript/mapped-conditional-and-template-types.md)
    - [Literal Types, `as const`, and `satisfies`](typescript/literal-types-as-const-and-satisfies.md)
    - [Classes, Modules, and Declarations](typescript/classes-modules-and-declarations.md)
    - [`tsconfig` and Strictness](typescript/tsconfig-and-strictness.md)
    - [Runtime Validation and API Boundaries](typescript/runtime-validation-and-api-boundaries.md)
    - [Practical Interview Patterns](typescript/practical-interview-patterns.md)
    - [Interview Question Bank](typescript/interview-question-bank.md)
  ```

- [ ] **Step 4: Verify foundation links and Markdown.**

  Run:

  ```bash
  /Users/ranjeetharishchandre/.cargo/bin/mdbook build
  git diff --check
  ```

  The build may report the repository’s existing search-index warning, but it must exit successfully and the new landing-page link must resolve.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/SUMMARY.md src/typescript/index.md
  git commit -m "docs: add TypeScript track navigation"
  ```

## Task 2: Mental model and inference lesson

**Files:**

- Create: `src/typescript/mental-model-and-inference.md`

**Interfaces:**

- Consumes: TypeScript handbook pages on [type inference](https://www.typescriptlang.org/docs/handbook/type-inference) and [type compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility).
- Produces: the prerequisite mental model used by every later lesson.

- [ ] **Step 1: Write one complete Type A lesson.**

  Use the exact eight canonical sections. Teach type erasure, annotations versus inference, best-common-type inference, literal widening, contextual typing, assignability, and structural typing. Include an interview scenario where a developer trusts an annotation that does not change runtime data.

- [ ] **Step 2: Answer every lesson question.**

  Include complete answers for at least these questions: “What does TypeScript do at runtime?”, “What is type inference?”, “Why does literal widening happen?”, “What is contextual typing?”, “What is structural typing?”, and “Does a type annotation validate an API response?” Each answer must explain the why, not just state a rule.

- [ ] **Step 3: Add checkable examples.**

  Show inferred variable and return types, an excess-property check, a structurally compatible object, a literal-preserving `as const` preview linked to Task 9, and an explicitly labeled compile-time-only example.

- [ ] **Step 4: Verify and commit.**

  Check balanced fences, canonical headings, question/answer pairing, official links, and `git diff --check`; then commit:

  ```bash
  git add src/typescript/mental-model-and-inference.md
  git commit -m "docs: explain TypeScript inference and structural typing"
  ```

## Task 3: Core types, unions, and interfaces lesson

**Files:**

- Create: `src/typescript/types-unions-and-interfaces.md`

**Interfaces:**

- Consumes: Task 2’s inference terminology and the official [everyday types](https://www.typescriptlang.org/docs/handbook/2/everyday-types) guidance.
- Produces: core type vocabulary used by narrowing, generics, and practical modeling.

- [ ] **Step 1: Write the complete Type A lesson.**

  Cover primitives, literal types, arrays, tuples, object shapes, optional and readonly properties, `type` aliases, interfaces, declaration merging, unions, intersections, and `any`/`unknown`/`never`/`void`. Explain that `type` and `interface` overlap for object contracts but differ in unions, intersections, and reopening.

- [ ] **Step 2: Answer the interview questions.**

  Answer at minimum: “What is the difference between `type` and `interface`?”, “What are union and intersection types?”, “What is the difference between `any` and `unknown`?”, “When does `never` appear?”, “What does `readonly` guarantee?”, “Are optional properties the same as `undefined`?”, and “Why is structural typing important for interfaces?”

- [ ] **Step 3: Include compile examples and traps.**

  Include a type-error example for unsafe `any`, a narrowing preview for `unknown`, an impossible intersection, a literal union for finite values, and a comparison table for `type` versus `interface` that states trade-offs without declaring one universally superior.

- [ ] **Step 4: Verify and commit.**

  Validate canonical headings, fenced examples, every question’s answer, and `git diff --check`; commit:

  ```bash
  git add src/typescript/types-unions-and-interfaces.md
  git commit -m "docs: teach TypeScript core types and unions"
  ```

## Task 4: Narrowing and type guards lesson

**Files:**

- Create: `src/typescript/narrowing-and-type-guards.md`

**Interfaces:**

- Consumes: Task 3’s unions and `unknown`; official [narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing) documentation.
- Produces: safe control-flow reasoning for API states, events, and reducers.

- [ ] **Step 1: Write the complete Type A lesson.**

  Explain control-flow analysis with `typeof`, `in`, `instanceof`, equality checks, truthiness limitations, assignments, user-defined predicates, discriminated unions, and exhaustive `never` checks. Use one coherent async-result model to show why a discriminator is stronger than several independent booleans.

- [ ] **Step 2: Answer the interview questions.**

  Answer: “What is narrowing?”, “What is a type guard?”, “When do you use `in` versus `typeof`?”, “What does a predicate `value is T` promise?”, “What is a discriminated union?”, “How do you make a `switch` exhaustive?”, “Why can truthiness checks be unsafe?”, and “Why does TypeScript not validate external JSON?”

- [ ] **Step 3: Include checked examples.**

  Include a successful and failing narrowing example, a custom predicate with a warning about lying predicates, a `Result` union with an exhaustive switch, and a boolean-flags anti-pattern replaced by a valid-state union.

- [ ] **Step 4: Verify and commit.**

  Confirm each question has an answer and each code example’s branch matches the stated type; commit:

  ```bash
  git add src/typescript/narrowing-and-type-guards.md
  git commit -m "docs: explain TypeScript narrowing and type guards"
  ```

## Task 5: Functions and call signatures lesson

**Files:**

- Create: `src/typescript/functions-and-call-signatures.md`

**Interfaces:**

- Consumes: Tasks 2–4; official [functions](https://www.typescriptlang.org/docs/handbook/2/functions) documentation.
- Produces: function contracts used by generic helpers and frontend APIs.

- [ ] **Step 1: Write the complete Type A lesson.**

  Cover parameter and return annotations, inference, optional/default/rest parameters, callback types, function properties, call signatures, `this` parameters, overload signatures, union parameters, and generic functions. Explain overloads versus unions versus generics with a decision rule.

- [ ] **Step 2: Answer the interview questions.**

  Answer: “How do you type a callback?”, “When should a return type be explicit?”, “What is a call signature?”, “How do overloads work?”, “When is a union better than an overload?”, “When is a generic better than a union?”, “What is a `this` parameter?”, and “Why can a callback assignment fail under strict function checking?”

- [ ] **Step 3: Include practical examples.**

  Include a typed event handler, a callback that preserves a result type, overloads for a search function, a generic alternative, and an intentionally invalid callback with the compiler reason explained.

- [ ] **Step 4: Verify and commit.**

  Check all overload signatures have one implementation, examples are syntactically valid, answers are complete, and commit:

  ```bash
  git add src/typescript/functions-and-call-signatures.md
  git commit -m "docs: teach TypeScript function contracts"
  ```

## Task 6: Generics and type relationships lesson

**Files:**

- Create: `src/typescript/generics-and-type-relationships.md`

**Interfaces:**

- Consumes: Task 5’s function contracts; official [generics](https://www.typescriptlang.org/docs/handbook/2/generics) documentation.
- Produces: generic patterns used by utility functions, tables, caches, and API clients.

- [ ] **Step 1: Write the complete Type A lesson.**

  Teach generic inference, type parameters, constraints with `extends`, defaults, relationships between multiple parameters, `keyof`, indexed access types, and preserving input/output relationships. Explain why `function identity(value: any): any` is not a generic solution.

- [ ] **Step 2: Answer the interview questions.**

  Answer: “What problem do generics solve?”, “How does TypeScript infer a generic?”, “What is a generic constraint?”, “What does `keyof T` mean?”, “How do you type a property getter safely?”, “Why can’t an unconstrained generic access a property?”, “When should you avoid a generic?”, and “How do generic defaults help API design?”

- [ ] **Step 3: Include practical examples.**

  Include identity, a constrained `getProperty`, a generic `map`, a type-preserving selection helper, and a small generic table-like configuration without pulling in React dependencies.

- [ ] **Step 4: Verify and commit.**

  Check inference claims against the handbook, verify every question has an answer, and commit:

  ```bash
  git add src/typescript/generics-and-type-relationships.md
  git commit -m "docs: explain TypeScript generics and relationships"
  ```

## Task 7: Utility types lesson

**Files:**

- Create: `src/typescript/utility-types.md`

**Interfaces:**

- Consumes: Tasks 3 and 6; official [utility types](https://www.typescriptlang.org/docs/handbook/utility-types) documentation.
- Produces: practical transformations for forms, API payloads, state, and library code.

- [ ] **Step 1: Write the complete Type A lesson.**

  Explain and demonstrate `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`, `Exclude`, `Extract`, `NonNullable`, `Parameters`, and `ReturnType`. Show where each is useful and where it can hide an overly broad contract.

- [ ] **Step 2: Answer the interview questions.**

  Answer: “What are utility types?”, “How are `Pick` and `Omit` different?”, “How is `Omit` conceptually built?”, “What is the difference between `Exclude` and `Extract`?”, “How do you get a function’s return type?”, “When is `Partial` dangerous?”, and “Would you use a utility type or define a new domain type?”

- [ ] **Step 3: Include implementation examples.**

  Implement representative equivalents for `MyPick`, `MyReadonly`, `MyExclude`, and `MyReturnType`, explain each line, and add an edit-form example using `Pick` rather than a manually duplicated object shape.

- [ ] **Step 4: Verify and commit.**

  Confirm each utility’s input/output relationship, check type-level examples for syntax, and commit:

  ```bash
  git add src/typescript/utility-types.md
  git commit -m "docs: teach TypeScript utility types"
  ```

## Task 8: Mapped, conditional, and template types lesson

**Files:**

- Create: `src/typescript/mapped-conditional-and-template-types.md`

**Interfaces:**

- Consumes: Tasks 6–7; official [mapped types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html) and [conditional types](https://www.typescriptlang.org/docs/handbook/2/conditional-types) documentation.
- Produces: senior-level follow-up explanations without encouraging clever type puzzles.

- [ ] **Step 1: Write the complete Type A lesson.**

  Explain mapped types over `keyof`, `readonly`/optional modifiers, key remapping, conditional `extends`, distributive conditional types, `infer`, and template literal types. Include a stopping rule: use a named domain type when the transformation becomes harder to read than the value code.

- [ ] **Step 2: Answer the interview questions.**

  Answer: “What is a mapped type?”, “How do you remove `readonly`?”, “What is a conditional type?”, “Why are conditional types distributive?”, “What does `infer` do?”, “How do you remap keys?”, “When are template literal types useful?”, and “How do you keep advanced types maintainable?”

- [ ] **Step 3: Include focused examples.**

  Include a mutable mapped type, a nullable-field transformation, an `infer` extraction, a non-distributive conditional example, and an event-name template type. Every advanced example must explain its resulting type in plain English.

- [ ] **Step 4: Verify and commit.**

  Check official syntax and distributivity claims, ensure no nested canonical sub-headings are introduced, and commit:

  ```bash
  git add src/typescript/mapped-conditional-and-template-types.md
  git commit -m "docs: explain advanced TypeScript type transformations"
  ```

## Task 9: Literal types, `as const`, and `satisfies` lesson

**Files:**

- Create: `src/typescript/literal-types-as-const-and-satisfies.md`

**Interfaces:**

- Consumes: Tasks 2, 3, and 8; official [`satisfies` release guidance](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html).
- Produces: accurate answers for inference-preservation questions in modern frontend code.

- [ ] **Step 1: Write the complete Type A lesson.**

  Explain literal widening, literal unions, readonly tuple/object inference from `as const`, annotation versus assertion versus `satisfies`, and configuration maps that must be checked without losing precise property inference.

- [ ] **Step 2: Answer the interview questions.**

  Answer: “Why does a `const` variable sometimes still widen?”, “What does `as const` do?”, “Is `as const` runtime freezing?”, “What does `satisfies` do?”, “How is `satisfies` different from an annotation?”, “When can `as` hide a bug?”, and “How do you type a configuration object while preserving literal keys?”

- [ ] **Step 3: Include contrasting examples.**

  Show a widened array, a readonly tuple, an annotation that loses a property-specific type, a `satisfies` example that checks shape while preserving inference, and a clear note that none of these validates external JSON.

- [ ] **Step 4: Verify and commit.**

  Check version-sensitive syntax against the official source, pair every question with an answer, and commit:

  ```bash
  git add src/typescript/literal-types-as-const-and-satisfies.md
  git commit -m "docs: explain literal inference and satisfies"
  ```

## Task 10: Classes, modules, and declarations lesson

**Files:**

- Create: `src/typescript/classes-modules-and-declarations.md`

**Interfaces:**

- Consumes: Task 3’s interfaces and structural typing; official [modules](https://www.typescriptlang.org/docs/handbook/2/modules.html) and [type declarations](https://www.typescriptlang.org/docs/handbook/2/type-declarations) documentation.
- Produces: practical module and library-typing guidance.

- [ ] **Step 1: Write the complete Type A lesson.**

  Cover class fields and visibility, `implements` as a check rather than a runtime conversion, structural class compatibility, ES modules versus CommonJS, module boundaries, module resolution concepts, declaration merging, ambient declarations, `@types`, and local `.d.ts` files.

- [ ] **Step 2: Answer the interview questions.**

  Answer: “What does `implements` guarantee?”, “How are classes structurally typed?”, “What is the difference between ESM and CommonJS?”, “Why can an import fail even when the file exists?”, “What is a declaration file?”, “What is declaration merging?”, “When should you write an ambient module declaration?”, and “Why is `declare module 'x'` not validation?”

- [ ] **Step 3: Include practical examples.**

  Include a class/interface mismatch, a type-only import/export example, a minimal `.d.ts` declaration for an untyped module, and a module-boundary explanation that distinguishes compile-time declarations from emitted JavaScript.

- [ ] **Step 4: Verify and commit.**

  Validate links to official module/declaration docs, ensure examples do not claim a single universal module setup, and commit:

  ```bash
  git add src/typescript/classes-modules-and-declarations.md
  git commit -m "docs: teach TypeScript modules and declarations"
  ```

## Task 11: `tsconfig` and strictness lesson

**Files:**

- Create: `src/typescript/tsconfig-and-strictness.md`

**Interfaces:**

- Consumes: Tasks 2, 3, and 10; official [TSConfig](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html) documentation.
- Produces: interview-ready reasoning about compiler configuration and diagnostics.

- [ ] **Step 1: Write the complete Type A lesson.**

  Explain `strict`, `strictNullChecks`, `noImplicitAny`, `noUncheckedIndexedAccess`, `target`, `module`, `moduleResolution`, and `lib`. Show that `tsconfig.json` affects type checking and emitted code, while bundlers and runtimes have their own behavior.

- [ ] **Step 2: Answer the interview questions.**

  Answer: “What does `strict` enable?”, “Why does `strictNullChecks` matter?”, “What does `noUncheckedIndexedAccess` change?”, “What is the difference between `target` and `module`?”, “What does `lib` control?”, “Why can TypeScript compile while the runtime import fails?”, and “How do you approach a compiler error instead of suppressing it?”

- [ ] **Step 3: Include a minimal configuration and diagnostics examples.**

  Show a strict configuration with the named flags, a before/after indexed-access example, a nullability error fixed by narrowing, and a short diagnostic-reading workflow.

- [ ] **Step 4: Verify and commit.**

  Check each flag’s stated behavior against the official docs and commit:

  ```bash
  git add src/typescript/tsconfig-and-strictness.md
  git commit -m "docs: explain TypeScript strictness and tsconfig"
  ```

## Task 12: Runtime validation and API boundaries lesson

**Files:**

- Create: `src/typescript/runtime-validation-and-api-boundaries.md`

**Interfaces:**

- Consumes: Tasks 2–4 and the existing frontend API/security material.
- Produces: the boundary rule used by the practical patterns and question bank.

- [ ] **Step 1: Write the complete Type A lesson.**

  Start with a production failure caused by treating `response.json()` as a trusted domain object. Explain erased types, `unknown`, assertions, type predicates, explicit validators, schema libraries as an optional project choice, versioned API responses, and failure handling.

- [ ] **Step 2: Answer the interview questions.**

  Answer: “Does TypeScript validate API data?”, “Why should external data start as `unknown`?”, “What is the difference between `as User` and validation?”, “How do you write a type guard?”, “Where should validation happen?”, “How do you model API success and failure?”, “What should happen when a payload is invalid?”, and “Why is `any` especially dangerous at a boundary?”

- [ ] **Step 3: Include a complete boundary example.**

  Show `fetch` data treated as `unknown`, a validator that returns `value is User`, a discriminated result for success/failure, and a clear warning that the validator itself must be maintained as the contract changes.

- [ ] **Step 4: Verify and commit.**

  Check that no assertion is presented as validation, every question has a complete answer, and commit:

  ```bash
  git add src/typescript/runtime-validation-and-api-boundaries.md
  git commit -m "docs: explain TypeScript runtime boundaries"
  ```

## Task 13: Practical interview patterns lesson

**Files:**

- Create: `src/typescript/practical-interview-patterns.md`

**Interfaces:**

- Consumes: Tasks 4, 6, 7, 9, and 12.
- Produces: end-to-end examples that connect interview concepts to frontend work without duplicating the React TypeScript page.

- [ ] **Step 1: Write one focused practical Type A lesson.**

  Organize the page around the interview problem “How would you model a frontend feature so invalid states are hard to represent?” Build a typed async state, a safe API boundary, a generic event emitter, a form payload derived with utility types, and a configuration map using `satisfies`. Explain the trade-offs and keep each example small enough to understand.

- [ ] **Step 2: Answer every practical question.**

  Answer: “How would you model loading/success/error?”, “Why are independent booleans risky?”, “How do you type an event emitter?”, “How do you prevent a form from accepting server-only fields?”, “How do you keep a config object’s literals?”, “Where do you validate?”, “When is a generic abstraction too much?”, and “How would you explain these choices in a code review?”

- [ ] **Step 3: Include solved live-coding exercises.**

  Add complete solutions for a generic `getProperty`, an exhaustive async-state renderer, a type-safe event emitter, and a `Pick`-based edit payload. Each solution must state inputs, outputs, invalid cases, and the type-level reason it works.

- [ ] **Step 4: Verify and commit.**

  Check each example for coherent relationships and runtime/static boundary language; commit:

  ```bash
  git add src/typescript/practical-interview-patterns.md
  git commit -m "docs: add practical TypeScript interview patterns"
  ```

## Task 14: Complete TypeScript interview question bank

**Files:**

- Create: `src/typescript/interview-question-bank.md`

**Interfaces:**

- Consumes: Tasks 2–13 and the interview-priority evidence in the design spec.
- Produces: 50 answered questions with no unanswered prompt, plus a revision checklist.

- [ ] **Step 1: Create the question bank structure.**

  Use four flat sections: Tier 1 fundamentals (20 questions), practical coding and debugging (15 questions), senior follow-ups (10 questions), and lower-priority awareness (5 questions). Do not use nested sub-headings under a question.

- [ ] **Step 2: Write every question and answer.**

  Every entry must use this exact shape:

  ```md
  **Q: [Question]**

  **Answer:** [Complete explanation with the rule, why it matters, and the trade-off or trap.]

  ```ts
  // Correct or incorrect example tied to the answer.
  ```

  ```

  Coding prompts must include the full solution, not only hints. Type-error prompts must include the corrected code and explain why the original failed. Include prompts on `type`/`interface`, inference, `any`/`unknown`, narrowing, discriminated unions, generics, utility types, `keyof`, `infer`, `as const`, `satisfies`, modules, `tsconfig`, runtime validation, and practical modeling.

- [ ] **Step 3: Add interview follow-ups and revision checklist.**

  For each practical or senior question, include one follow-up with its answer. End with a checklist covering the Tier 1 concepts and a “say this first, then explain why” study method without turning answers into scripts.

- [ ] **Step 4: Verify question completeness.**

  Confirm exactly 50 primary `**Q:` entries, at least 50 matching `**Answer:**` entries, and that every code prompt has a complete solution. Search for question-like lines without an answer before committing.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/typescript/interview-question-bank.md
  git commit -m "docs: add answered TypeScript interview question bank"
  ```

## Task 15: Whole-track verification and handoff

**Files:**

- Verify: `src/SUMMARY.md` and every file under `src/typescript/`
- Do not modify generated `book/` output unless the repository already tracks it.

**Interfaces:**

- Consumes: all completed TypeScript lesson pages and their commits.
- Produces: fresh evidence that the section is reachable, structurally valid, and contains answers for all added interview questions.

- [ ] **Step 1: Verify navigation and file reachability.**

  Extract every `typescript/` link from `src/SUMMARY.md`, confirm the target exists, confirm each child has exactly the intended indentation, and confirm no new TypeScript page is unlinked.

- [ ] **Step 2: Verify Markdown structure.**

  Check balanced triple-backtick and triple-tilde fences, canonical heading order on the 12 concept/practical pages, no forbidden headings, no broken local links, and clean whitespace:

  ```bash
  git diff --check
  ```

- [ ] **Step 3: Verify question answers.**

  Count the 50 primary question-bank entries and matching answer labels. Search all TypeScript pages for `**Q:` and manually confirm each prompt is followed by an answer; follow-up questions must also be answered.

- [ ] **Step 4: Verify representative TypeScript examples.**

  If `tsc` is unavailable, use a temporary directory and `npx --yes -p typescript tsc --strict --noEmit` on extracted positive examples; mark intentional failures with `@ts-expect-error`. Check at least one positive and one intentional-error example from each advanced lesson. Delete temporary files afterward.

- [ ] **Step 5: Build the mdBook.**

  ```bash
  /Users/ranjeetharishchandre/.cargo/bin/mdbook build
  ```

  Confirm exit code 0 and inspect the generated TypeScript section/table of contents for all links.

- [ ] **Step 6: Run final diff and status review.**

  ```bash
  git status --short
  git diff --stat master..HEAD
  git diff --check master..HEAD
  ```

  Confirm the diff contains only the approved design/plan artifacts and TypeScript section work. Do not claim completion until all commands have fresh successful evidence.
