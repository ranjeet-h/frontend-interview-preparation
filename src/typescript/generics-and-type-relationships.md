# Generics and Type Relationships

## 1. Why This Exists — The Problem First

An API client often has the same shape for every endpoint: accept some input, pass it through a helper, and return related output. If every helper is written for one concrete type, the code gets duplicated. If every helper uses `any`, the code looks reusable but the compiler stops telling us whether the input and output still belong together.

That relationship is the real problem. A function that returns the value it received should return a `User` when it receives a `User`, a string when it receives a string, and the exact selected property type when it receives a property name. Generics let us describe that relationship once, so reuse does not require giving up type information.

The examples in this page follow the [TypeScript handbook's generics guidance](https://www.typescriptlang.org/docs/handbook/2/generics). They use compile-time relationships; TypeScript still removes types at runtime, so generics do not validate untrusted JSON or change JavaScript behavior.

## 2. The Analogy — Make It Obvious

Think of a parcel counter with reusable labels. The counter does not need to know whether a parcel contains a book, a shirt, or a keyboard. It records one fact when the parcel arrives: “this parcel contains type `T`.” When the parcel leaves, the same label is attached to it, so the receiver gets the original kind of thing back.

`T` is the label's type parameter. A generic function such as `identity<T>(value: T): T` says, “whatever type arrived is the type that leaves.” Type inference fills in the label from the value at the counter, so callers usually do not write `<User>` or `<string>` themselves.

A constraint is a rule printed on the counter's intake form: “this parcel must have a readable tracking number.” `T extends Trackable` still preserves the parcel's more specific type, but lets the counter safely use the required `trackingNumber` field. With two parameters, the labels can refer to each other: “the key must be one of the fields on this parcel, and the returned item has the type stored under that key.”

## 3. How It Actually Works — The Full Explanation

**Capturing a type instead of erasing it**

`function identity(value: any): any` accepts everything, but `any` disconnects the input from the output. The compiler cannot protect this call:

```ts
function unsafeIdentity(value: any): any {
  return value;
}

const unsafe = unsafeIdentity("ready");
unsafe.notARealStringMethod(); // No type error: unsafe is any.
```

The generic version introduces a type parameter, a variable that stands for a type:

```ts
function identity<T>(value: T): T {
  return value;
}

const numberResult = identity(42);       // number
const userResult = identity({ id: 7 });  // { id: number }
```

The call `identity(42)` gives the compiler a candidate for `T`, so it infers `T` as `number`. The return annotation uses the same `T`; that is the important part. We did not merely say “accept any value.” We said “return the same type that was accepted.” Type arguments can be written explicitly when inference is unclear or when the caller deliberately wants to fix the type: `identity<string>("ready")`.

Inference is not a runtime operation. It is the compiler solving type parameters from the call's arguments and then checking the body as if those parameters could be many different types. That is why this is an error:

```ts
function logLength<T>(value: T): T {
  // value.length; // Error: T might be a number, boolean, or object without length.
  return value;
}
```

An unconstrained `T` means “any type the caller is allowed to provide,” not “an object with every property.” The implementation may use only operations valid for every possible `T`.

**Constraints with `extends`**

When a function needs a capability, describe that capability as a constraint:

```ts
interface HasLength {
  length: number;
}

function logAndReturn<T extends HasLength>(value: T): T {
  console.log(value.length);
  return value;
}

logAndReturn("hello");       // T is string
logAndReturn([1, 2, 3]);      // T is number[]
// logAndReturn(123);         // Error: number has no length property.
```

`extends` here means “must be assignable to” or “must have at least this shape.” It does not mean that `T` must be a class subclass. A `string`, array, or custom object can satisfy the constraint structurally. The return type remains `T`, not merely `HasLength`, so extra properties are preserved for the caller.

**Relationships between multiple parameters**

One type parameter is enough for identity. A useful property getter needs two: one for the object and one for the key. `keyof T` produces a union of the known property names of `T`; `Key extends keyof T` restricts the second parameter to that union. Indexed access, `T[Key]`, means “the value type found at key `Key` in `T`.”

```ts
function getProperty<T, Key extends keyof T>(object: T, key: Key): T[Key] {
  return object[key];
}

const person = { name: "Mina", age: 31, active: true };
const name = getProperty(person, "name");   // string
const age = getProperty(person, "age");     // number
// getProperty(person, "email");             // Error: "email" is not a key of person.
```

This does more than prevent a misspelled key. It preserves the relationship between the selected key and result: selecting `"age"` returns `number`, while selecting `"name"` returns `string`. A signature such as `(object: T, key: keyof T): T[keyof T]` would validate the key, but its return type would be a union of all property types and would lose that particular-key relationship.

**Defaults and API design**

A generic default makes a type argument optional when the caller has not supplied enough information to infer it. The default must satisfy any constraint, and required type parameters must come before optional ones.

```ts
interface RequestOptions<Response = unknown> {
  parse: (body: string) => Response;
  cacheKey?: string;
}

function request<Response = unknown>(options: RequestOptions<Response>): Response {
  // A real client would fetch here. This example focuses on the type relationship.
  return options.parse('{"ok":true}');
}

const response = request({ parse: (body) => JSON.parse(body) as { ok: boolean } });
// Response is inferred as { ok: boolean }, so response.ok is boolean.

const unknownResponse = request({ parse: (body) => JSON.parse(body) });
// If no useful candidate is available, the default makes the result unknown.
```

Defaults make an API easy to start with while leaving an escape hatch for callers who need precision. They are especially useful for configurable clients and table-like utilities, but a default should not conceal a genuinely important type choice. If the caller must provide a response schema for safety, require it instead.

**Preserving relationships through transformations**

`map` has two related types: the input element type and the output element type. They do not have to be the same. The callback receives `T`, and the resulting array contains `U`:

```ts
function map<T, U>(items: readonly T[], transform: (item: T, index: number) => U): U[] {
  const result: U[] = [];
  for (let index = 0; index < items.length; index += 1) {
    result.push(transform(items[index], index));
  }
  return result;
}

const labels = map([{ id: 1 }, { id: 2 }], (item) => `user-${item.id}`);
// labels is string[].
```

A selector can preserve a narrower relationship than a general transformation. Here the selected key controls the output type, so a `User` selector for `"id"` returns `number`:

```ts
function select<T, Key extends keyof T>(items: readonly T[], key: Key): Array<T[Key]> {
  return map(items, (item) => item[key]);
}

const users = [
  { id: 1, name: "Mina" },
  { id: 2, name: "Omar" },
];

const ids = select(users, "id");       // number[]
const names = select(users, "name");   // string[]
```

The signature is a small proof: `Key` must come from `T`, and every output is `T[Key]`. This is the pattern to look for in caches, API clients, event maps, and configuration objects: keep a parameter wherever the caller's choice changes another type.

## 4. Real Code — See It Working

This complete example combines the requested patterns into a small, dependency-free table configuration. It is a data description, not a React component, so it can be reused by a CLI, server renderer, or UI adapter.

```ts
type Row = {
  id: number;
  name: string;
  active: boolean;
};

type Column<T, Key extends keyof T = keyof T> = {
  key: Key;
  heading: string;
  format?: (value: T[Key], row: T) => string;
};

type TableConfig<T, Key extends keyof T = keyof T> = {
  rows: readonly T[];
  columns: readonly Column<T, Key>[];
};

function renderTable<T, Key extends keyof T = keyof T>(config: TableConfig<T, Key>): string[][] {
  return config.rows.map((row) =>
    config.columns.map((column) => {
      const value = row[column.key];
      return column.format ? column.format(value, row) : String(value);
    }),
  );
}

const table: TableConfig<Row> = {
  rows: [
    { id: 1, name: "Mina", active: true },
    { id: 2, name: "Omar", active: false },
  ],
  columns: [
    { key: "name", heading: "Name" },
    {
      key: "active",
      heading: "Status",
      format: (value) => (value ? "Active" : "Paused"),
    },
  ],
};

const rendered = renderTable(table);
// rendered is string[][]; invalid keys and mismatched formatter values fail at compile time.
```

The default `Key = keyof T` makes the configuration convenient when it contains several kinds of columns. The `Key extends keyof T` relationship still ensures each column key exists and its formatter receives the corresponding property type. If a table API needs one fixed key, it can specify `TableConfig<Row, "active">` and make that narrower contract explicit.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What problem do generics solve?**

Generics let one implementation work with many types while preserving useful relationships between those types. `identity<T>(value: T): T` accepts a string, number, or object without reducing the result to `any`. In production, this prevents duplicated helpers and lets a compiler catch mismatches in utilities, caches, API clients, and configuration code.

**Q: How does TypeScript infer a generic?**

The compiler examines the values passed to a generic call and chooses type arguments that satisfy the function's parameter types. For `identity("x")`, it infers `T` from the argument and uses that same `T` for the result. In more complex calls there can be multiple candidates or contextual information, so inference may be broader than the literal value or may fail; explicit type arguments are available when the intended type needs to be stated.

**Q: What is a generic constraint?**

A constraint limits a type parameter to types that provide a required shape or relationship. `T extends HasLength` means the function may safely read `.length`, while still returning the caller's specific `T`. The constraint is a compile-time promise about allowed inputs, not runtime validation of data.

**Q: What does `keyof T` mean?**

`keyof T` is a type containing the property keys of `T` as a union. If `T` is `{ id: number; name: string }`, then `keyof T` is `"id" | "name"`. It is useful for restricting a key argument, but the key must be connected to the object type if we also want a key-specific result.

**Q: How do you type a property getter safely?**

Use two related parameters: `function getProperty<T, Key extends keyof T>(object: T, key: Key): T[Key]`. The constraint rejects keys that are not present on the object, and indexed access `T[Key]` returns the value type for the selected key. This is more precise than returning `T[keyof T]`, which would be a union of every possible property value.

**Q: Why can’t an unconstrained generic access a property?**

Because an unconstrained `T` stands for every type the caller might provide, including primitives and objects without that property. The function body must be valid for all of them. Add a constraint such as `T extends { length: number }`, or change the API so the property is supplied through a relationship like `Key extends keyof T`.

**Q: When should you avoid a generic?**

Avoid one when there is no real relationship to preserve, when a concrete type communicates the domain better, or when the type parameters make the API harder to read than the duplication they remove. A generic wrapper around one known `User` operation adds ceremony without flexibility. Also avoid using a generic as a substitute for runtime validation: a type parameter cannot prove that external JSON actually has the promised shape.

**Q: How do generic defaults help API design?**

They provide a sensible fallback, so common calls can omit a type argument while advanced callers can override it. A default can make a configurable client or table easy to use, and inference still wins when arguments provide a more specific type. Defaults must obey constraints and cannot be placed before a required type parameter.

**Q: What is the difference between a type parameter and a constraint?**

The type parameter is the captured type, such as `T`. The constraint is the minimum capability that `T` must have, such as `T extends HasLength`. The function can use members guaranteed by the constraint, while callers still keep the more specific type represented by `T`.

**Q: Why can a generic function have different input and output types?**

Each parameter can represent a different role. In `map<T, U>`, `T` is the input element and `U` is the transformed output. They are related because the callback consumes `T` and produces `U`, but they need not be equal. For a selector, `T[Key]` makes the output depend on the chosen key instead.

## 6. The Traps — What Goes Wrong

`any` is not “better generics.” It accepts the value and then turns off checking at the boundary. A caller can invoke a method that does not exist, and the compiler will not help. Use `unknown` when a value is genuinely unknown and narrow or validate it; use a generic when input and output must remain related.

An unconstrained `T` does not mean “an object.” Code such as `value.id` is unsafe because `T` might be `string` or `number`. Add the smallest honest constraint, or model the key relationship. Do not constrain everything to `object` and assume that gives named properties; `object` does not promise `id`, `length`, or any other member.

`keyof` alone can lose precision. This signature checks that a key exists but returns a broad union:

```ts
function lessPrecise<T>(object: T, key: keyof T): T[keyof T] {
  return object[key];
}
```

Use `Key extends keyof T` when the selected key needs to control the result. That extra parameter is the relationship, not needless complexity.

A type assertion can lie about a generic relationship. `JSON.parse(body) as User` tells the compiler to trust the programmer; it does not inspect the response. At an API boundary, validate the data at runtime, then expose a generic result only when the validation or caller-provided parser establishes the contract.

Generic defaults are not a way to put required parameters after optional ones. `type Bad<A = string, B> = ...` is invalid because a caller could not provide `B` without also deciding what `A` means. Reorder the parameters or give `B` a default too.

Finally, do not write a generic that has no meaningful type parameter use. If `function log<T>(message: string): void` never uses `T`, callers gain no relationship and the API only looks more complicated. Every type parameter should constrain an input, determine an output, or connect two parts of the contract.

## 7. Compare With Related Concepts

Generics versus `any`: generics preserve relationships and keep checking; `any` erases both. Use generics for reusable typed code, and use `any` only at a deliberate, isolated migration boundary when no safer type is currently possible.

Generics versus `unknown`: `unknown` says “the type is not known yet” and forces narrowing before use; a generic says “capture this caller-provided type and relate it elsewhere.” Use `unknown` for untrusted values, generics for relationships.

Generics versus overloads: overloads describe a finite set of distinct call shapes, while generics describe a repeatable relationship across many types. Use overloads when behavior truly changes between a small number of cases; use generics when the same rule applies to arbitrary caller types.

`keyof` versus indexed access: `keyof T` produces the allowed keys, while `T[Key]` looks up the value type at a key. Use them together for a type-safe property API; either one alone describes only half of that relationship.

Constraints versus runtime validation: `extends` restricts code that TypeScript can see at compile time; it cannot check a network response or user input. Use constraints for developer-facing APIs and runtime schemas or guards at trust boundaries.

Concrete types versus generic abstraction: a concrete type is clearer when the domain is intentionally fixed. Add a generic when a second real use case shares the same relationship and the abstraction makes both call sites safer or simpler.

## 8. 🧠 The Memory Hook — What Sticks

Generics are a type label that travels with the value: capture what came in, constrain only what the implementation needs, and reuse the label to describe what comes out. `keyof` chooses a legal door; indexed access tells you the type behind that exact door.
