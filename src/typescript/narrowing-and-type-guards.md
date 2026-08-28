# Narrowing and Type Guards

## 1. Why This Exists — The Problem First

An API request rarely has one shape. A request can still be loading, succeed with data, or fail with an error. If those possibilities are represented as several independent booleans, the UI can accidentally describe impossible states: `isLoading: true` and `error: "offline"`, or `isLoading: false` with neither data nor error. Even with a union type, TypeScript cannot safely let us call `result.data` until our code proves which member it has.

Narrowing is the reasoning that turns a broad type such as `AsyncResult<User>` into the specific type that is safe on the current control-flow path. Type guards are the checks that provide that evidence. This is an interview topic because it connects type annotations to the code that actually runs: the compiler follows branches, returns, assignments, and checks, but it does not magically inspect a value from an API at runtime.

## 2. The Analogy — Make It Obvious

Think of an airport security desk receiving a sealed bag labelled “either passport, laptop, or prohibited item.” The label is the broad union type. The security officer does not guess what is inside; they perform an inspection.

Each inspection is a type guard. Looking at a category tag is like `typeof`; checking whether a particular pocket exists is like `in`; recognizing the object’s construction is like `instanceof`; comparing a status tag to `"success"` is an equality check. After the check, the officer is allowed to handle the contents according to the narrower category. If the bag came from outside the airport, the label itself is not proof: an API response is like uninspected luggage, so runtime validation must happen before static narrowing can be trusted.

An async result with a single status tag works like a bag with one authoritative category label. Three unrelated checkboxes do not: they permit combinations that no real request should have. A discriminated union makes each valid state a complete, mutually understood package.

## 3. How It Actually Works — The Full Explanation

### Narrowing is path-sensitive evidence

Suppose a parameter is `string | number`. At the function boundary, both are possible. A `typeof` check splits control flow into two paths. Inside the number path, the value is a `number`; after returning from that path, the remaining reachable path can be treated as a `string`.

TypeScript performs control-flow analysis. It tracks the facts established by guards and assignments as execution branches, then removes facts when paths merge or a later assignment changes the observed value. This is a compile-time analysis; JavaScript still executes the ordinary `if`, `switch`, or operator at runtime.

```ts
function formatId(id: string | number): string {
  if (typeof id === "number") {
    return `#${id.toString().padStart(6, "0")}`;
  }

  // The number branch returned, so this reachable branch has only string left.
  return id.trim().toUpperCase();
}

function brokenFormatId(id: string | number): string {
  // @ts-expect-error A union is not known to have the number-only method.
  return id.toFixed(2);
}
```

The second function is the important failing example: the declared type remains a union because no runtime fact selected one member. A type assertion could silence the error, but it would not perform a check and could turn bad input into a runtime exception.

### The built-in guards

`typeof` is best for JavaScript primitive categories. TypeScript understands the runtime result strings: `"string"`, `"number"`, `"bigint"`, `"boolean"`, `"symbol"`, `"undefined"`, `"object"`, and `"function"`. Remember the JavaScript quirk that `typeof null` is `"object"`; use an explicit null check when null matters.

```ts
function describe(value: string | number | null): string {
  if (value === null) return "missing";
  if (typeof value === "string") return value.toUpperCase();
  return value.toFixed(2);
}
```

`in` checks whether a property name exists on an object or its prototype chain. It is useful when union members have different fields, especially when the members are object types without a shared discriminator.

```ts
type LoadEvent = { kind: "load"; bytes: number } | { kind: "error"; message: string };

function eventText(event: LoadEvent): string {
  if ("bytes" in event) return `Loaded ${event.bytes} bytes`;
  return `Load failed: ${event.message}`;
}
```

An optional property can occur on both sides of an `in` check. Therefore, `"swim" in animal` does not mean the property is callable when the type says `swim?: () => void`; the property may exist with value `undefined`. Use a required discriminant or check the value too.

`instanceof` checks the runtime prototype chain, so it fits class instances and built-ins such as `Date` and `Error`.

```ts
function errorMessage(value: Error | string): string {
  if (value instanceof Error) return value.message;
  return value;
}
```

It is not a universal test for “objects that look like this interface.” Interfaces and type aliases do not exist at runtime, and objects created in another JavaScript realm can have surprising prototype identity. For plain API-shaped objects, use a property check or runtime schema validation instead.

Equality checks also narrow. Comparing a union to a literal removes the impossible members. Comparing two union values can narrow both to their common possible type.

```ts
function sameText(left: string | number, right: string | boolean): string {
  if (left === right) {
    // string is the only type common to both unions on this path.
    return left.toUpperCase() + right.toLowerCase();
  }
  return "different values or types";
}

function present(value: string | null | undefined): string {
  if (value != null) return value; // deliberately removes null and undefined
  return "not present";
}
```

`== null` is one useful intentional exception to a strict-equality style rule: it matches both `null` and `undefined`. Use it only when that combined meaning is wanted; otherwise prefer explicit `===` checks.

### Truthiness is a coarse guard

JavaScript converts a condition to boolean. `0`, `NaN`, `""`, `0n`, `null`, and `undefined` are falsy; other values are truthy. TypeScript can remove `null` and `undefined` from a truthy branch, but it cannot infer that “present” means “non-empty” if empty is a valid value.

```ts
function showSearchTerm(term: string | undefined): string {
  if (!term) return "No search term";
  return `Searching for ${term}`;
}

// This is often a bug when the empty string is meaningful.
function countUsers(count: number | undefined): string {
  if (count) return `${count} users online`;
  return "Nobody is online"; // also used for a valid count of 0
}

function countUsersPrecisely(count: number | undefined): string {
  if (count === undefined) return "Count unavailable";
  return `${count} users online`; // 0 is preserved as data
}
```

Use truthiness when every falsy value really means “absent.” Use explicit equality or a domain-specific predicate when `0`, `false`, or `""` is valid data.

### Assignments and reachability matter

The declared type controls what can be assigned; the observed type controls what is currently usable. A variable declared as `string | number` may be narrowed to `number` after `x = 1`, then to `string` after `x = "done"`, while a boolean assignment remains illegal because it is outside the declared type. When control flow returns, throws, or otherwise makes a branch unreachable, TypeScript can remove that branch’s possibilities from the remainder.

### User-defined predicates: a checked result with a trust boundary

A function returning `value is T` is a user-defined type guard. When it returns `true`, TypeScript narrows the argument named in the predicate to `T` at the call site.

```ts
type User = { id: string; name: string };

function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.name === "string";
}

function welcome(value: unknown): string {
  if (isUser(value)) return `Welcome, ${value.name}`;
  return "Invalid user payload";
}
```

The predicate body runs at runtime, but the `value is User` part is only a compile-time promise. TypeScript does not prove that the implementation is honest. A lying predicate can create code that compiles and then crashes:

```ts
function lies(value: unknown): value is User {
  return true; // The compiler trusts this; runtime data is still unchecked.
}
```

Keep predicates small, test them with valid and invalid values, and do not confuse a cast (`value as User`) with validation. A cast changes the compiler’s view only; a predicate should inspect the value.

### Discriminated unions model valid async states

Here is one model used throughout an application:

```ts
type AsyncResult<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

function renderUsers(result: AsyncResult<User[]>): string {
  switch (result.status) {
    case "idle":
      return "Start searching";
    case "loading":
      return "Loading users…";
    case "success":
      return `${result.data.length} users found`;
    case "error":
      return `Could not load users: ${result.error.message}`;
  }
}
```

`status` is the discriminant: a shared property whose literal value identifies exactly one member. Once `status` is `"success"`, `data` is known to exist; once it is `"error"`, `error` is known to exist. The union encodes the invariant that each state carries the fields required by that state.

To make future states fail loudly at compile time, route the default branch through `never`:

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled async result: ${JSON.stringify(value)}`);
}

function resultLabel(result: AsyncResult<User>): string {
  switch (result.status) {
    case "idle": return "idle";
    case "loading": return "loading";
    case "success": return result.data.name;
    case "error": return result.error.message;
    default: return assertNever(result);
  }
}
```

If `AsyncResult` later gains `{ status: "cancelled" }`, the default branch receives that member instead of `never`, so compilation fails until the new state is handled. The throw is a runtime safety net; the exhaustiveness guarantee comes from the static type.

### Why the discriminator beats independent booleans

This tempting model has too many combinations:

```ts
type BadAsyncState<T> = {
  isLoading: boolean;
  hasError: boolean;
  data?: T;
  error?: Error;
};

function badMessage(state: BadAsyncState<User>): string {
  if (state.isLoading) return "Loading";
  if (state.hasError) return state.error?.message ?? "Unknown error";
  return state.data?.name ?? "No user";
}
```

Nothing in `BadAsyncState` prevents `isLoading` and `hasError` from both being true, or prevents `hasError: false` with an `error`. Optional chaining prevents a crash in this example but hides the invalid state rather than excluding it.

The valid-state union makes illegal combinations unrepresentable:

```ts
const validStates: AsyncResult<User>[] = [
  { status: "idle" },
  { status: "loading" },
  { status: "success", data: { id: "u1", name: "Ada" } },
  { status: "error", error: new Error("Offline") },
];

const impossible: AsyncResult<User> = {
  status: "loading",
  // @ts-expect-error A loading result cannot carry success data.
  data: { id: "u1", name: "Ada" },
};
```

The type improves state construction, reducer transitions, event handling, and rendering. It does not validate a server response by itself. A value received from `JSON.parse` is `unknown` (or should be treated as `unknown`) until a runtime check establishes its shape.

```ts
function parseUserResult(json: string): AsyncResult<User> {
  const value: unknown = JSON.parse(json);

  // A discriminant check is useful only after checking that value is an object.
  if (typeof value !== "object" || value === null || !("status" in value)) {
    throw new Error("Malformed result");
  }

  // This example has only established that a status property exists.
  // Production code should validate every member and field before returning.
  throw new Error("Use a complete runtime validator at the API boundary");
}
```

Static narrowing answers “what does this branch know, given the types and checks in the source?” Runtime validation answers “does this external value actually satisfy the contract?” Both are needed at an API boundary.

## 4. Real Code — See It Working

This complete example combines a safe boundary predicate, a discriminated union, control-flow narrowing, and exhaustive rendering. It is intentionally independent of a framework so the type reasoning is visible.

```ts
type User = { id: string; name: string };

type AsyncResult<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function renderUserResult(result: AsyncResult<User>): string {
  switch (result.status) {
    case "idle":
      return "Choose a user";
    case "loading":
      return "Loading…";
    case "success":
      return `User: ${result.data.name}`;
    case "error":
      return `Error: ${result.error.message}`;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

function userFromUnknown(value: unknown): User {
  if (!isUser(value)) throw new Error("Invalid user payload");
  return value;
}

const result: AsyncResult<User> = {
  status: "success",
  data: userFromUnknown({ id: "u1", name: "Ada" }),
};

console.log(renderUserResult(result)); // User: Ada
```

The check in `isUser` is runtime work. The fact that `result.data` is available in the `"success"` case is static narrowing. Keeping those jobs separate makes the boundary clear and keeps internal code simple.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is narrowing?**

Narrowing is TypeScript’s compile-time process of refining a broad declared type to a more specific type on a particular control-flow path. A value declared as `string | number` stays a union at the boundary, but a `typeof value === "string"` branch lets TypeScript treat it as `string` there. The refinement is based on reachable code, guards, assignments, and returns; it does not change the runtime value.

**Q: What is a type guard?**

A type guard is a runtime expression or function result that TypeScript understands as evidence about a type. Examples include `typeof x === "string"`, `x instanceof Date`, `"data" in result`, equality checks, and a user-defined predicate such as `isUser(x): x is User`. The runtime check must be meaningful: an assertion or an arbitrary boolean does not make external data safe.

**Q: When do you use `in` versus `typeof`?**

Use `typeof` for primitive categories such as strings, numbers, booleans, functions, and `undefined`. Use `in` when narrowing object union members by the presence of different property names. `in` tests property existence, including the prototype chain, and does not validate the property’s value. For class identity use `instanceof`; for a stable application state use a literal discriminant such as `status`.

**Q: What does a predicate `value is T` promise?**

It promises the compiler that whenever the function returns `true`, the named parameter can be treated as `T`. TypeScript trusts that promise; it does not verify the predicate’s implementation. Therefore, a predicate must perform a real runtime check and should be tested. `as T` is only a cast and performs no check, while a sound predicate establishes evidence at runtime and communicates that evidence to the type system.

**Q: What is a discriminated union?**

It is a union whose members share a property with distinct literal values, such as `status: "loading" | "success" | "error"`. Checking that property selects one member and reveals its member-specific fields. This is stronger than independent booleans because each member describes one complete valid state, so impossible combinations are rejected when states are constructed.

**Q: How do you make a `switch` exhaustive?**

Handle every discriminant value and make the default branch accept `never`, usually with `assertNever(value: never): never`. If a new union member is added and no case handles it, the value in the default branch is no longer `never`, producing a compile error. The runtime throw in `assertNever` is useful defense in depth, but the compile-time `never` parameter is what detects the missing case.

**Q: Why can truthiness checks be unsafe?**

Truthiness groups absence-like values with valid data. `0`, `false`, and `""` are falsy, so `if (value)` may skip a legitimate count, flag, or text value. Use truthiness only when every falsy value means “not available.” Otherwise check the exact sentinel, such as `value !== undefined`, `value !== null`, or `value.length > 0` when non-empty text is the actual requirement.

**Q: Why does TypeScript not validate external JSON?**

TypeScript types are erased when code is emitted, while JSON arrives at runtime and can come from an old server, a bug, a malicious client, or a different deployment. `JSON.parse` produces runtime data, not a proof of a TypeScript interface. Parse into `unknown`, validate the shape with a predicate or schema validator at the boundary, and only then expose a typed value to the rest of the application.

**Q: Does a type guard validate data at runtime?**

The expression inside the guard runs at runtime, but narrowing itself is static. A built-in guard performs its own runtime operation; a custom predicate performs only whatever checks its body contains. A predicate that checks only `status` does not prove that a success member has valid `data`. Validate all required fields before treating the result as a trusted domain value.

## 6. The Traps — What Goes Wrong

### Treating a type assertion as a check

`const user = value as User` changes only the compiler’s opinion. It can be useful after an independently proven invariant, but it does not inspect `value`. At an API boundary, prefer `unknown` plus a real validator.

### Forgetting that `null` is an object to `typeof`

`typeof null === "object"` is a JavaScript historical quirk. A check for `typeof value === "object"` still leaves `null` possible, so access to properties or iteration can fail. Pair it with `value !== null`.

### Assuming `in` means a usable property

`"data" in value` proves the property exists, not that it has the expected type. Optional properties may put a type on both sides of the branch, and inherited properties also count. Use a required discriminant or check the property value itself when that distinction matters.

### Letting a predicate lie

The compiler cannot audit `return true` in `value is User`. A false promise moves an invalid value into code that assumes the target shape, which is more dangerous than an ordinary compile error. Keep predicates local and explicit, and test malformed inputs.

### Using several booleans for one state machine

Independent flags create a Cartesian product of combinations, most of which are invalid. Optional fields and optional chaining make the symptoms quieter without enforcing the invariant. A discriminated union puts the state and its required payload in one member.

### Believing narrowing is permanent

Narrowing is tied to a path and the compiler’s knowledge at that point. A later assignment can widen the observed type again, and callbacks or mutable aliases can make a prior fact unsafe to preserve. Keep values immutable where practical and re-check at the point of use when mutation can occur.

### Assuming a successful compile proves a complete switch

A `switch` can compile while silently falling through or returning an unhelpful default. Use `never` to turn a new discriminant value into a visible compiler failure, then decide deliberately what runtime fallback should do.

## 7. Compare With Related Concepts

| Concept | Key difference | Rule of thumb |
| --- | --- | --- |
| Narrowing vs widening | Narrowing removes impossible members on a path; widening lets a value be treated as a broader type. | Narrow with evidence; widen only when the consumer genuinely needs less information. |
| Type guard vs type assertion | A guard performs or represents a runtime check; `as T` only changes static interpretation. | Use assertions for proven internal invariants, guards at uncertain boundaries. |
| `typeof` vs `in` | `typeof` identifies primitive/runtime categories; `in` identifies object members by property presence. | Start with `typeof` for primitives, `in` for object-shape unions. |
| `in` vs `instanceof` | `in` checks a property on an object/prototype chain; `instanceof` checks constructor prototype identity. | Use `in` for structural objects, `instanceof` for known class instances. |
| Truthiness vs equality | Truthiness groups all falsy values; equality targets a precise sentinel or literal. | Use equality when `0`, `false`, or `""` is valid data. |
| Discriminated union vs boolean flags | A union encodes mutually exclusive valid states; flags allow invalid combinations unless extra rules enforce them. | Model a state machine with one discriminant and member-specific payloads. |
| Static narrowing vs runtime validation | Narrowing trusts declared types and checks in source; validation inspects actual external values. | Validate once at the boundary, then narrow safely inside the domain. |

## 8. 🧠 The Memory Hook — What Sticks

Narrowing is TypeScript asking, “What has this path proved?” A discriminant is the single authoritative label for an async state: one label selects one payload, while scattered booleans let impossible worlds leak into the UI. At the edge, validate reality; inside the program, let guards and exhaustive unions make the safe paths obvious.
