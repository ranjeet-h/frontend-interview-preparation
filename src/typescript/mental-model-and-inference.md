# Mental Model and Type Inference

## 1. Why This Exists — The Problem First

A checkout flow can look perfectly typed and still fail for a real customer. A developer writes `const customer: Customer = await response.json()`, sees no compiler error, and assumes the server sent a customer. The server actually sent `{ "id": 42 }`; later, code calls `customer.email.toLowerCase()` and production throws because `email` is missing.

The important failure is not that TypeScript was useless. The developer asked it the wrong question. TypeScript checks whether the program's *known types* fit together while compiling. It does not sit between the network and the program, inspect a JSON packet, and change that packet into a safe `Customer`. Once this boundary is clear, annotations, inference, and compatibility stop feeling like arbitrary compiler rules. They become a way to make trustworthy promises inside the code you control.

## 2. The Analogy — Make It Obvious

Think of TypeScript as a careful shipping clerk working before a truck leaves the warehouse. The clerk reads labels on boxes, checks that a box marked "fragile glass" is loaded where the receiving dock expects fragile glass, and rejects labels that contradict each other. That is the compile-time check.

When the truck departs, the clerk and all the labels vanish. The receiving warehouse gets the actual boxes, not the clerk's notes. JavaScript is that receiving warehouse: it runs values at runtime, and it never sees TypeScript types. A label on an incoming, sealed box is not proof of its contents. Someone must open it and inspect it. In an application, runtime validation is that inspection; a later lesson covers [runtime validation and API boundaries](runtime-validation-and-api-boundaries.md).

Inference is the clerk reading a clear label rather than making someone hand-write it again. Assignability is the clerk asking, "Does this box provide everything this destination requires?" Structural typing is the clerk judging the required contents, not whether the box came from a particular brand of factory.

## 3. How It Actually Works — The Full Explanation

TypeScript analyzes a program, reports type errors, and then emits JavaScript. Type annotations, interfaces, type aliases, generics, and assertions are erased; they do not become runtime checks, metadata, or changed values. The emitted JavaScript gets the same objects, strings, and numbers that the source code created or received.

An annotation is an instruction to the checker: "treat this location as this type, and make sure assignments into it are allowed." Inference is the checker working out a type from evidence already present in the program. For `let retries = 3`, it can infer `number`. For a function that returns a template string, it can infer `string`. The [TypeScript handbook's type-inference guide](https://www.typescriptlang.org/docs/handbook/type-inference) describes inference from variable initializers, default parameters, and function returns.

Inference is deliberately useful, but it does not preserve every detail forever. A `let` variable is expected to be reassigned, so `let status = "queued"` widens to `string`; assigning `"running"` later should be legal. A `const` binding cannot be reassigned, so `const status = "queued"` can keep the narrower literal type `"queued"`. That widening is a practical guess about how the value will be used, not a runtime conversion.

When there are several values, TypeScript looks for a useful common type. Under `strictNullChecks`, `[0, 1, null]` becomes `(number | null)[]`: every element is either a number or `null`. When no supplied candidate is a supertype of the others, the handbook explains that a union can be the result. Context can add another candidate: a function declared to return `Animal[]` gives the array in its `return` statement an `Animal[]` context. This is called best-common-type inference.

Contextual typing is inference flowing from the destination toward an expression. If a callback is assigned where `(draft: Draft) => void` is required, TypeScript can infer the callback parameter as `Draft`. The expression did not announce its own parameter type; its location supplied it. The handbook calls out callback arguments, assignment right-hand sides, object and array literals, assertions, and return statements as common contextual positions.

After it knows the types, TypeScript checks assignability: can a value of the source type be used where the target type is required? For ordinary object types, that check is structural. A value is compatible when it has compatible versions of the members the target needs. A value with `id`, `name`, and `role` can be used as a `User` if `User` needs only compatible `id` and `name` members. This fits JavaScript, where object literals and independently authored objects are common. The [official compatibility guide](https://www.typescriptlang.org/docs/handbook/type-compatibility) calls this structural subtyping.

That rule has a useful guardrail. A fresh object literal gets an excess-property check, so assigning `{ id, name, role }` directly to `User` is rejected when `role` is not known by `User`. It catches likely typos such as `emali`. It is not a rule that all runtime objects may never have extra fields: an already-created object can have more data and still be structurally assignable.

## 4. Real Code — See It Working

This first example shows inference doing routine work. The comments show the types the checker infers; none of those comments or types exist in emitted JavaScript.

```ts
let retries = 3; // inferred: number, because this binding may be reassigned

const environment = "production"; // inferred: "production", a string literal type

function greeting(name: string) {
  // inferred return type: string, because a template literal produces a string
  return `Hello, ${name}`;
}

retries = 4;
const message: string = greeting("Asha");
```

Here the array needs one element type that accounts for all its values. This example assumes `strictNullChecks`, which is the setting that keeps `null` distinct from `number`.

```ts
const retryDelays = [0, 250, null];
// inferred: (number | null)[]

function delayFor(attempt: number): number | null {
  return retryDelays[attempt] ?? null;
}
```

The next callback has no written type on `draft`. Its destination supplies one, so TypeScript can allow `draft.title` and reject properties that a `Draft` does not have.

```ts
type Draft = { id: string; title: string };
type SaveDraft = (draft: Draft) => void;

const saveDraft: SaveDraft = (draft) => {
  console.log(`${draft.id}: ${draft.title}`);
};
```

Structural typing and excess-property checks are easiest to see side by side. The expected-error comment makes this a checkable compile-time example: the compiler should report the direct object-literal assignment as invalid and confirm that the error was expected.

```ts
type User = { id: string; name: string };

const apiUser = { id: "u_42", name: "Asha", role: "admin" };
const user: User = apiUser; // OK: apiUser has every member User requires.

// @ts-expect-error - fresh object literals may only name known User properties.
const typedUser: User = { id: "u_42", name: "Asha", role: "admin" };
```

This is **compile-time only**. It compiles because `payload` is `any`, which opts out of useful checking. The annotation does not inspect, repair, or transform the object at runtime; `customer.email` is still `undefined`.

```ts
type Customer = { id: string; email: string };

const payload: any = { id: 42 };
const customer: Customer = payload;

console.log(customer.email); // runtime output: undefined
```

When an exact value is part of the contract, [`as const` can preserve literals](literal-types-as-const-and-satisfies.md). It also makes object properties `readonly` in the type; it does not freeze the object at runtime.

```ts
const release = {
  environment: "production",
  retries: 3,
} as const;

// inferred: { readonly environment: "production"; readonly retries: 3 }
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does TypeScript do at runtime?**

TypeScript does not run as a type-checking layer in ordinary emitted JavaScript. It checks source code before execution and removes its type syntax when it produces JavaScript. That means a type helps the compiler reason about code paths and assignments, but it cannot validate a network response, prevent a JavaScript caller from passing the wrong value, or make an object property exist. Runtime guarantees need JavaScript that checks values, such as a schema validator or a hand-written type guard.

**Q: What is type inference?**

Type inference is TypeScript deriving a type from evidence in the program instead of requiring a written annotation everywhere. Initial values, default parameter values, return expressions, arrays, and a callback's destination type are common evidence. It exists because the code often already states enough: if a function returns a template string on every path, repeating `: string` adds little information. An annotation is still valuable when the intended public contract is broader or more important than the immediate implementation, or when inference cannot express the intent clearly.

**Q: Why does literal widening happen?**

Literal widening gives a mutable location room to change. `let phase = "queued"` would be painfully restrictive if its type stayed exactly `"queued"`, because the natural next assignment is `phase = "running"`. TypeScript therefore infers `string` there. A `const` binding cannot point to a different value, so it can usually retain the more useful literal type. Widening changes the compile-time description only; the runtime value remains the same string.

**Q: What is best-common-type inference?**

When one inferred type must describe several expressions, TypeScript considers their candidate types and looks for a type that can represent them all. For `[0, 250, null]`, that is `(number | null)[]` with `strictNullChecks`. The point is to describe every allowed element without pretending they are all numbers. If the candidates do not provide an appropriate shared supertype, TypeScript can infer a union, or the developer can supply the intended contextual type when the domain relationship matters.

**Q: What is contextual typing?**

Contextual typing is the reverse direction of inference: the place where an expression appears tells TypeScript how to type it. In `const save: SaveDraft = draft => ...`, the declared `SaveDraft` target gives `draft` its `Draft` type. This exists so callbacks, event handlers, and object literals remain concise without becoming untyped. The context is a contract the expression must satisfy, which is why a mouse handler can know about `event.button` while a generic scroll handler cannot.

**Q: What is structural typing?**

Structural typing compares the shape a value provides, not the declaration that created it. A value with compatible `id` and `name` properties can be used where `User` is required even if it came from a different interface, class, or unannotated object and also has extra properties. This matches JavaScript's object-by-shape style and makes independent libraries interoperate. It does not mean names are ignored: every member required by the target still has to exist with a compatible type.

**Q: What is the difference between structural compatibility and an excess-property check?**

Structural compatibility lets a value with extra members stand in for a smaller required shape; `apiUser` can be passed as a `User` because all required `User` members are present. The excess-property check is a special check for a fresh object literal assigned directly to that smaller shape. It catches a likely mistake at the moment TypeScript has the clearest signal that the object was intended to match the target exactly. It is a typo detector, not a runtime ban on extra JSON fields.

**Q: Does a type annotation validate an API response?**

No. An annotation checks the relationship TypeScript can see in the source, not bytes that arrived over the network. A common trap is `await response.json()`: its result has historically been typed broadly enough in many environments that an annotation can be accepted without proving the JSON has the claimed fields. Treat external data as `unknown`, validate its shape at runtime, and only then expose it as a trusted application type. The annotation documents the desired internal contract; validation establishes that the outside value earned it.

**Q: When should I write an annotation instead of trusting inference?**

Trust inference for local implementation details when the initializer and inferred type say exactly what a reader needs to know. Write an annotation at a boundary or when it communicates intent the implementation should be checked against: a function's public return type, a configurable collection meant to hold a particular base type, or a variable that should deliberately be wider than its initial literal. The useful question is not "can TypeScript infer this?" but "what contract do I want future changes to preserve?"

## 6. The Traps — What Goes Wrong in Production

The first trap is treating a compile-time declaration like a runtime parser. `const customer: Customer = payload` does not convert `42` into a string and does not add a missing `email`. It only asks whether the *type of `payload`* is assignable. If that type is `any`, the checker has been told to stop protecting this assignment. Keep external values as `unknown` until validation proves their shape.

The second trap is fighting widening with annotations that hide the reason it happened. `let phase: "queued" = "queued"` is correct only if reassignment to any other phase should be forbidden. If the phase will progress, model the real choices—perhaps `"queued" | "running" | "done"`—or accept `string` when arbitrary strings are truly valid. Use `as const` for intentional literal preservation, then learn its wider trade-offs in the [literal-types lesson](literal-types-as-const-and-satisfies.md).

The third trap is reading an excess-property error as "extra properties are never allowed." The error is specifically suspicious because the object literal is written right at a `User` destination. Storing the same object first produces a value whose shape has the required members, so it is compatible. Do not work around a genuine spelling error by moving it into another variable; fix the property name or make the target type honestly include it.

The last trap is calling structural typing nominal typing. `implements User` can be useful documentation and makes a class checked against `User`, but compatibility does not require that relationship to have been declared. TypeScript generally asks whether the needed members are present. Private and protected class members add important exceptions, which belong in the classes lesson rather than as a surprise hidden behind the simple object rule.

## 7. Compare With Related Concepts

An annotation and inference both give the checker a type, but they start from different places. Inference discovers a type from code that already exists; an annotation declares the contract that code must satisfy. Use inference for obvious local facts and annotations where the intended boundary deserves to be explicit.

`as const` and a normal `const` declaration solve different problems. `const` prevents rebinding the variable, while `as const` asks TypeScript to keep object and array literals narrow and mark their properties or elements readonly in the type. Use `as const` when exact literal values are meaningful; do not mistake it for `Object.freeze`.

Structural typing and runtime validation answer different questions. Structural typing asks whether TypeScript's current description of one value can satisfy another description. Validation asks whether an untrusted runtime value actually has the required shape. Use structural typing within typed code; validate at API, storage, user-input, and other external boundaries.

Assignability is broader than equality. Two types need not be identical for one value to be assignable to another: a richer object can satisfy a smaller required shape, and a literal such as `"production"` can be assigned to `string`. Use assignability to reason about safe use at a destination, not to ask whether two types are written the same way.

## 8. 🧠 The Memory Hook

TypeScript is the clerk before the truck leaves: it checks the labels and then disappears. Inference reads labels already present, structural typing checks whether the required contents are there, and runtime validation is the only person who opens an unknown box.
