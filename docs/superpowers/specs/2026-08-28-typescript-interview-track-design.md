# TypeScript Interview Track Design

**Date:** 2026-08-28  
**Status:** Approved for implementation by the user

## Goal

Add a standalone TypeScript track to the mdBook that prepares frontend candidates for the TypeScript concepts, debugging questions, and live-coding tasks that recur in current interview preparation material. The official TypeScript handbook is the technical authority for explanations and examples; interview sources decide what receives the most study time.

## Context and scope

The book currently has JavaScript, frontend fundamentals, and React tracks. React already has a focused [TypeScript With React](../../../src/react/typescript-react.md) page, so the new track will teach the language and compiler model independently, then link to that React page for JSX, props, events, refs, context, reducers, and hooks.

The track is intentionally interview-first:

- Tier 1 pages cover questions candidates are repeatedly expected to answer or apply: inference, structural typing, `type` versus `interface`, unions, narrowing, `any`/`unknown`/`never`, generics, utility types, function typing, strictness, and runtime boundaries.
- Tier 2 pages cover common follow-ups and live-coding extensions: mapped types, conditional types, `infer`, `keyof`, indexed access, literal preservation, `as const`, `satisfies`, overloads, module resolution, and declaration files.
- Tier 3 content is limited to concise awareness notes for lower-yield material such as namespaces, decorators, and compiler internals. It will not displace practical interview preparation.

Current interview-prep sources converge on practical type modeling rather than syntax recall: generic utilities, discriminated unions, narrowing, utility types, structural typing, and coding tasks that make invalid states or unsafe API data visible. This is a prioritization inference from the sources, not a claim that every interviewer follows one fixed script.

Technical references for implementation:

- [Type inference](https://www.typescriptlang.org/docs/handbook/type-inference)
- [Type compatibility and structural typing](https://www.typescriptlang.org/docs/handbook/type-compatibility)
- [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing)
- [Generics](https://www.typescriptlang.org/docs/handbook/2/generics)
- [Utility types](https://www.typescriptlang.org/docs/handbook/utility-types)
- [Mapped types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)
- [Conditional types](https://www.typescriptlang.org/docs/handbook/2/conditional-types)
- [Modules](https://www.typescriptlang.org/docs/handbook/2/modules.html)
- [Type declarations](https://www.typescriptlang.org/docs/handbook/2/type-declarations)
- [TSConfig](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html)
- [GreatFrontEnd senior TypeScript interview questions (2026)](https://www.greatfrontend.com/blog/typescript-interview-questions-for-senior-frontend-developers)
- [KORE1 frontend interview questions (2026)](https://www.kore1.com/frontend-developer-interview-questions/)
- [Tarmac TypeScript interview questions](https://gettarmac.com/interview-questions/typescript-interview-questions)

## Information architecture

Create `src/typescript/` with one landing page and thirteen focused lesson pages:

1. `index.md` — track map, study order, interview-priority legend, and links to the React companion.
2. `mental-model-and-inference.md` — erased types, compile-time versus runtime, annotations versus inference, widening, contextual typing, and structural typing.
3. `types-unions-and-interfaces.md` — primitives, literals, objects, tuples, `type` versus `interface`, unions, intersections, optional properties, and `any`/`unknown`/`never`/`void`.
4. `narrowing-and-type-guards.md` — control-flow narrowing, `typeof`, `in`, `instanceof`, equality checks, user-defined predicates, discriminated unions, and exhaustive `never` checks.
5. `functions-and-call-signatures.md` — parameter and return types, callback contracts, optional/rest parameters, `this`, overloads versus unions versus generics, and common function-typing errors.
6. `generics-and-type-relationships.md` — inference, constraints, defaults, `keyof`, indexed access, generic relationships, and why a meaningful generic is better than an unconstrained one.
7. `utility-types.md` — practical use and implementation ideas for `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`, `Exclude`, `Extract`, `NonNullable`, `Parameters`, and `ReturnType`.
8. `mapped-conditional-and-template-types.md` — mapped type modifiers, conditional types, distributivity, `infer`, template literal types, and how to stop when a type becomes too clever.
9. `literal-types-as-const-and-satisfies.md` — literal widening, `as const`, `satisfies`, readonly inference, config objects, and preserving useful value-level inference.
10. `classes-modules-and-declarations.md` — structural classes, visibility, `implements` limitations, ES modules versus CommonJS, module resolution concepts, declaration merging, ambient declarations, and `.d.ts` boundaries.
11. `tsconfig-and-strictness.md` — `strict`, `strictNullChecks`, `noImplicitAny`, `noUncheckedIndexedAccess`, `target`, `module`, `moduleResolution`, `lib`, and reading compiler diagnostics.
12. `runtime-validation-and-api-boundaries.md` — why TypeScript types disappear, `unknown` at untrusted boundaries, assertions versus validation, type predicates, API response modeling, and schema-validation decisions.
13. `practical-interview-patterns.md` — typed async state, type-safe event emitters, generic helpers, form/config contracts, safe API clients, and invalid-state prevention.
14. `interview-question-bank.md` — short-answer questions, “what type/error/output?” drills, live-coding prompts, follow-up questions, answer rubrics, and a final revision checklist.

Each lesson remains focused enough to study independently. The landing page supplies the order; lesson pages cross-link only when a prerequisite is genuinely needed.

## Lesson format

Every lesson will use a consistent format adapted from the book’s existing React TypeScript page:

1. What the interviewer is testing
2. Short answer to say first
3. Mental model and terminology
4. Minimal TypeScript examples with expected compiler behavior
5. A practical frontend example
6. Common traps and incorrect approaches
7. Follow-up questions and what a stronger answer adds
8. Flashcards or quick recall prompts
9. Official documentation links

The question-bank page will additionally label each prompt as fundamentals, practical, senior follow-up, or lower priority. Examples will prefer `tsc`-checkable snippets and explain whether a behavior is compile-time-only or has runtime consequences.

## Content and source policy

- Interview-prep sources determine priority, not technical truth.
- Official TypeScript documentation is the authority for compiler semantics and version-sensitive syntax.
- When an interview source uses a simplification, the lesson will state the practical rule and then explain the important limitation.
- Avoid unsupported claims such as “always use `type`” or “interfaces are faster.” Present trade-offs and distinguish team convention from language capability.
- Do not duplicate the existing React TypeScript lesson; link to it for React-specific examples and add only language-level material in this track.
- Avoid framework-specific dependencies so examples can be checked with a minimal TypeScript setup.
- Keep runtime validation separate from static typing: an annotation or assertion must never be presented as input validation.

## Verification design

The implementation will be verified at four levels:

1. Navigation: every new page is linked from `src/SUMMARY.md`, links resolve, and entries have correct sibling indentation.
2. Markdown: fenced code blocks are balanced, headings are ordered, and `git diff --check` is clean.
3. Examples: TypeScript snippets that claim to compile or fail are checked with a temporary strict TypeScript harness or an equivalent repository-supported command; expected-error snippets are clearly marked.
4. mdBook: build with the repository’s mdBook binary and inspect the generated book for the new section and cross-links.

## Non-goals

- Rewriting the existing React TypeScript page.
- Adding a TypeScript runtime library, package dependency, or application code to this documentation repository.
- Exhaustively documenting every TypeScript feature.
- Claiming that the track predicts every company’s interview loop.
