# TypeScript

TypeScript is JavaScript with a compile-time type system. It helps you make the
assumptions between parts of your program visible before a user reaches the path
where JavaScript would otherwise discover a mismatch at runtime.

## Why this is a separate track

The JavaScript track explains the runtime: values, scope, objects, functions,
the event loop, and the browser. This track explains how TypeScript describes
and checks those same programs while you write them. Keeping the two tracks
separate makes the boundary clear: TypeScript can verify the code you compile,
but its types are removed before JavaScript runs. Data from an API, user input,
and other external systems still need runtime validation.

## Recommended study order

Start with the mental model, then build from everyday type relationships toward
the advanced tools that combine them:

1. Learn [Mental Model and Type Inference](mental-model-and-inference.md),
   [Types, Unions, and Interfaces](types-unions-and-interfaces.md), and
   [Narrowing and Type Guards](narrowing-and-type-guards.md).
2. Continue with [Functions and Call Signatures](functions-and-call-signatures.md),
   [Generics and Type Relationships](generics-and-type-relationships.md), and
   [Utility Types](utility-types.md).
3. Add [Mapped, Conditional, and Template Types](mapped-conditional-and-template-types.md),
   [Literal Types, `as const`, and `satisfies`](literal-types-as-const-and-satisfies.md),
   [Classes, Modules, and Declarations](classes-modules-and-declarations.md), and
   [`tsconfig` and Strictness](tsconfig-and-strictness.md).
4. Finish with [Runtime Validation and API Boundaries](runtime-validation-and-api-boundaries.md),
   [Practical Interview Patterns](practical-interview-patterns.md), and the
   [Interview Question Bank](interview-question-bank.md).

For component props, events, refs, reducers, and API data in React, continue to
[TypeScript With React](../react/typescript-react.md) after the core track.

## Interview priority

| Tier | Meaning | Focus |
|---|---|---|
| Tier 1 | Know this well enough to explain and apply it without notes. | Inference, unions, interfaces, narrowing, functions, generics, and strictness. |
| Tier 2 | Use it confidently and explain the trade-off when it is appropriate. | Utility types, literal types, `as const`, `satisfies`, modules, declarations, and runtime boundaries. |
| Tier 3 | Recognize it, read it accurately, and use it when a problem genuinely needs it. | Mapped, conditional, and template literal types. |

## Track lessons

| Lesson | Interview focus |
|---|---|
| [Mental Model and Type Inference](mental-model-and-inference.md) | What TypeScript checks, what it erases, and when inference is enough |
| [Types, Unions, and Interfaces](types-unions-and-interfaces.md) | Modeling values and public contracts |
| [Narrowing and Type Guards](narrowing-and-type-guards.md) | Proving which member of a union exists at runtime |
| [Functions and Call Signatures](functions-and-call-signatures.md) | Parameters, returns, overloads, and callable shapes |
| [Generics and Type Relationships](generics-and-type-relationships.md) | Preserving relationships between inputs and outputs |
| [Utility Types](utility-types.md) | Reusing and transforming existing contracts |
| [Mapped, Conditional, and Template Types](mapped-conditional-and-template-types.md) | Building types from other types |
| [Literal Types, `as const`, and `satisfies`](literal-types-as-const-and-satisfies.md) | Preserving precise values without losing validation |
| [Classes, Modules, and Declarations](classes-modules-and-declarations.md) | Class contracts, module boundaries, and external type information |
| [`tsconfig` and Strictness](tsconfig-and-strictness.md) | Compiler settings that change the guarantees you receive |
| [Runtime Validation and API Boundaries](runtime-validation-and-api-boundaries.md) | Turning unknown external data into trusted application data |
| [Practical Interview Patterns](practical-interview-patterns.md) | Small patterns that expose sound type design in interviews |
| [Interview Question Bank](interview-question-bank.md) | Answered questions for review and interview practice |

## Source policy

Each lesson separates TypeScript's compile-time rules from JavaScript runtime
behavior, uses runnable examples for behavior claims, and favors primary
TypeScript documentation when language details matter. Examples that cross an
external boundary treat the incoming value as unknown until runtime code has
validated it.

## Question policy

Every question in this track is answered in its lesson or is clearly presented
as a navigation label to an answered lesson or question-bank entry. This landing
page is a roadmap, not an unanswered prompt list.
