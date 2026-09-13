# Functions and Call Signatures
# Functions and Call Signatures

## 1. Why This Exists — The Problem First

An API can be perfectly correct at runtime and still be painful to use when its function contract is vague. A callback typed as `Function` loses its arguments and returns `any`; an overload can promise a call shape that its implementation does not safely handle; and a missing generic link can turn a useful result into `unknown` or `any`. These failures usually appear at the call site, far away from the function that caused them.

TypeScript's function types make those contracts visible before the code ships. The goal is not to annotate every punctuation mark. It is to express which arguments are accepted, what relationship exists between inputs and outputs, whether a callback may be called with `this`, and which runtime cases the implementation must handle.

## 2. The Analogy — Make It Obvious

Think of a function as a service counter. Its parameter list is the order form: it says which fields the customer must provide, which fields are optional, and whether an unbounded list of items is accepted. Its return type is the receipt the counter promises to hand back.

A callback is another counter that your service agrees to call. If your service promises to call it with a `User`, a callback that only knows how to process an unrelated `Admin` is not safe. A call signature is a counter that also has a sign above it: the same function can be callable and can expose properties such as `description` or `cache`.

Overloads are several public order forms for one counter, while the implementation is the staff procedure behind the counter. A union says one order form accepts several alternatives. A generic says the receipt keeps a relationship with what the customer handed in: a `User` goes in and the same `User` shape comes back out, without copying every possible type into a union.

## 3. How It Actually Works — The Full Explanation

TypeScript checks function contracts at compile time. JavaScript still receives ordinary values at runtime, and type annotations are erased. A parameter annotation does not convert a string into a number, and a return annotation does not validate a response from a server. Runtime checks are still needed at untrusted boundaries.

Parameter and return annotations are the most direct contract:

```ts
function subtotal(price: number, quantity: number): number {
  return price * quantity;
}
```

Inference fills in types when TypeScript has enough local evidence. In `const double = (n: number) => n * 2`, the return type is inferred as `number`. In `const names = users.map((user) => user.name)`, the array type supplies the callback parameter type. Inference is convenient, but an explicit return type is valuable at exported boundaries, public interfaces, recursive functions, and places where a future implementation must not accidentally widen or change the contract.

An optional parameter uses `?` and is `T | undefined` inside the function. A default parameter also accepts an omitted value, but after JavaScript applies the default, its body can treat the parameter as the non-optional type:

```ts
function pageSize(size?: number): number {
  return size ?? 25;
}

function retryDelay(attempt = 1): number {
  return attempt * 100;
}
```

At runtime, both omission and an explicit `undefined` trigger a default. Passing `null` does not trigger it. Optional parameters must come after required parameters. A rest parameter collects zero or more arguments into an array, and it must be last:

```ts
function joinPath(first: string, ...parts: string[]): string {
  return [first, ...parts].join("/");
}

joinPath("api", "users", "42");
```

A function type expression describes a callable value: `(event: MouseEvent) => void`. Use a named alias when the contract is reused. `void` means the caller must not rely on a return value; it does not mean the callback cannot internally compute one. That is why a value-returning function can often be passed to a `void` callback: the caller discards the value.

Callbacks need the type of the arguments the caller will provide, not merely the arguments a particular callback happens to use. If an API always supplies an index, write `(value: string, index: number) => void`. Do not mark `index` optional just to allow callbacks that ignore it; functions with fewer parameters can already stand in for functions with more parameters. Mark it optional only if the API may genuinely call the callback with no index.

JavaScript functions are objects, so a function can be both callable and have properties. A call signature places the callable part inside an object type:

```ts
type Formatter = {
  locale: string;
  (value: number): string;
};
```

Overloads expose several legal call shapes followed by one implementation. The overload signatures are visible to callers; the implementation signature is used inside the function and is not itself a public overload. Every overload must be compatible with the implementation, and the body must narrow its broad parameters before using them.

`this` parameters are a compile-time-only first parameter. They document and check the receiver that a regular function expects, but they do not become a runtime argument. An arrow function cannot use this pattern because its `this` is lexically captured rather than supplied by the caller.

Unions model one parameter that may be one of several types. The body narrows the union with `typeof`, `Array.isArray`, a discriminant, or another type guard. Use a union when the result and behavior do not need to preserve a different input/output relationship. Use overloads when distinct input shapes deserve distinct, precise return types. Use a generic when the important fact is that types are related and should flow from input to output.

For generic functions, the type parameter is inferred from the arguments. `function first<T>(items: T[]): T | undefined` links the element type to the result. A constraint such as `T extends { length: number }` permits operations available on every valid `T`, while still preserving the specific input type. Good generic parameters relate at least two parts of a contract; a type parameter used only once usually adds complexity without information.

Under `strictFunctionTypes`, callback parameters are checked contravariantly. A function that accepts a broad value can safely be used where a callback may receive a narrower value. A function that accepts only a narrower value cannot safely replace a callback that might receive any value from the broader set, because the caller could pass a value the narrow callback cannot process.

## 4. Real Code — See It Working

This event handler has a precise callback contract. The handler may ignore `event`, because a function with fewer parameters is assignable to one that receives more; the handler may not assume an unrelated event type.

```ts
interface SearchInput {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
}

function updateSearch(input: SearchInput, value: string): void {
  // The component owns the event shape and passes the value to the handler.
  input.onChange({ target: { value } });
}

const searchInput: SearchInput = {
  value: "typescript",
  onChange: (event) => {
    console.log(event.target.value);
  },
};

updateSearch(searchInput, "functions");
```

This callback preserves a result type through a generic. The array determines `Input`; the callback determines `Output`; the returned array is `Output[]` rather than `any[]`.

```ts
function mapValues<Input, Output>(
  values: Input[],
  transform: (value: Input) => Output,
): Output[] {
  return values.map(transform);
}

const lengths = mapValues(["Ada", "Linus"], (name) => name.length);
// lengths: number[]
```

Overloads make a search API pleasant when the return type depends on the call shape. With no query, this API returns the complete `User[]`; with a query, it returns one matching `User` or `undefined`. A single `query?: string` signature would need a `User[] | User | undefined` return, forcing every caller to narrow a result that the call shape already tells us about.

```ts
interface User {
  id: string;
  name: string;
}

const users: User[] = [
  { id: "u1", name: "Ada" },
  { id: "u2", name: "Linus" },
];

function searchUsers(): User[];
function searchUsers(query: string): User | undefined;
function searchUsers(query?: string): User[] | User | undefined {
  if (query === undefined) {
    return users;
  }

  return users.find((user) =>
    user.name.toLowerCase().includes(query.toLowerCase()),
  );
}

const allUsers = searchUsers(); // User[]
const firstMatch = searchUsers("Ada"); // User | undefined
```

When the input/output relationship is the same for every type, a generic is usually clearer than writing an overload for each type.

```ts
function first<T>(items: T[]): T | undefined {
  return items[0];
}

const firstUser = first(users); // User | undefined
const firstNumber = first([10, 20]); // number | undefined
```

This example intentionally fails under strict callback checking. `AnimalHandler` might receive any `Animal`, but `dogHandler` cannot handle a `Cat`.

```ts
interface Animal {
  name: string;
}

interface Dog extends Animal {
  bark(): void;
}

type AnimalHandler = (animal: Animal) => void;

const dogHandler = (dog: Dog): void => dog.bark();

// @ts-expect-error -- Dog is narrower than Animal under strictFunctionTypes.
const unsafe: AnimalHandler = dogHandler;
```

A function property plus a call signature is useful for a callable formatter with metadata:

```ts
type CurrencyFormatter = {
  currency: string;
  (amount: number): string;
};

const formatUSD: CurrencyFormatter = Object.assign(
  (amount: number) => `$${amount.toFixed(2)}`,
  { currency: "USD" },
);

console.log(formatUSD(12.5), formatUSD.currency);
```

A `this` parameter protects a callback-style API without changing the emitted JavaScript signature:

```ts
interface UserRecord {
  admin: boolean;
}

function filterUsers(
  records: UserRecord[],
  predicate: (this: UserRecord) => boolean,
): UserRecord[] {
  return records.filter(function (this: UserRecord, record) {
    return predicate.call(record);
  });
}

const admins = filterUsers([{ admin: true }, { admin: false }], function (this: UserRecord) {
  return this.admin;
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you type a callback?**

Use a function type expression or a named type alias, such as `(event: Event) => void` or `type OnSave = (draft: Draft) => Promise<void>`. Type the arguments the caller guarantees and the result the callback produces. Avoid `Function`, because it permits unsafe calls and returns `any`.

**Q: When should a return type be explicit?**

Inference is fine for small private functions when the implementation makes the result obvious. Be explicit for exported functions, public library APIs, callbacks whose result matters, recursive functions, and boundaries where a stable contract catches accidental changes. An annotation is also a useful design check: if the body cannot satisfy it, the implementation and contract disagree.

**Q: What is a call signature?**

It is the callable part of an object type, written like `(input: string): number` inside `{ ... }`. It is needed when a value is both callable and has properties. A function type expression describes only the call; a call-signature object can describe the call plus metadata.

**Q: How do overloads work?**

Write the public overload signatures first, then one implementation signature and body. Callers are checked against the overload list, not against the implementation signature. The implementation must be broad enough to handle every overload and must narrow its inputs before using them. Every overload needs one compatible implementation; separate implementations for the same function are not allowed.

**Q: When is a union better than an overload?**

Use a union when one implementation has the same return type and behavior for every accepted input, such as `function lengthOf(value: string | unknown[]): number`. A union lets a value whose type is already `string | unknown[]` pass directly. Overloads are better when the accepted shapes have different return types or meaning.

**Q: When is a generic better than a union?**

Use a generic when the input and output, or two inputs, have a relationship that should be preserved. `first<T>(items: T[]): T | undefined` works for every element type and returns the corresponding type. A union such as `string | number` would lose that relationship and force callers to narrow a broad result.

**Q: What is a `this` parameter?**

It is a fake first parameter used only by TypeScript to declare the `this` value inside a regular function. It is removed from emitted JavaScript and does not affect the runtime argument count. It is useful when an API invokes a callback with a deliberate receiver. Use a regular `function`, not an arrow, because arrows capture `this` from their surrounding scope.

**Q: Why can a callback assignment fail under strict function checking?**

Because the callback may receive values chosen by the caller. Assigning `(dog: Dog) => void` to `(animal: Animal) => void` is unsafe: the caller is allowed to pass a `Cat`. With `strictFunctionTypes`, parameter positions are checked so the assigned callback can handle every value the target contract permits. A callback accepting `Animal` can be used where one accepting `Dog` is expected; the reverse is unsafe.

**Q: What is the difference between a default parameter and an optional parameter at runtime?**

Both allow omission, but a default replaces `undefined` before the body runs, while an optional parameter remains possibly `undefined`. Neither changes JavaScript's runtime rules for `null`, and neither validates arbitrary input at runtime.

**Q: Can a callback declared to return `void` return a value?**

When a function value is assigned to a `void`-returning callback, TypeScript permits a value-returning function because the caller promises not to use the value. A function declaration explicitly annotated `(): void` cannot return a value. This distinction protects common APIs such as `forEach` while still enforcing a literal `void` implementation.

## 6. The Traps — What Goes Wrong in Production

**Trap: using `Function` as a callback type.** It says almost nothing about parameters and makes calls return `any`. Write the actual parameter and return contract instead, or use `() => unknown` when the function will be stored but not called.

**Trap: putting an optional parameter in a callback to support shorter callbacks.** `(value: Item, index?: number) => void` says the API may omit the index. It makes a callback's `index` possibly `undefined`, even if the implementation always passes it. Keep the index required; callers can still provide a one-parameter callback.

**Trap: calling the implementation signature of an overload.** An overload set with one-argument and three-argument signatures does not automatically allow two arguments just because the implementation uses optional parameters. Only declared overload signatures are public.

**Trap: assuming overloads narrow a union argument.** If a variable has type `string | string[]`, it may match neither a `string` overload nor a `string[]` overload. Add a union overload, narrow before calling, or use a union parameter when the return type is the same.

**Trap: writing a generic that does not preserve a relationship.** `function log<T extends string>(value: T): void` gains nothing over `function log(value: string): void` when `T` appears only in the input. Generics are for relating types, not for making a signature look advanced.

**Trap: trusting annotations at runtime.** `function parseId(id: number)` does not stop JavaScript from receiving a string through an untyped caller or JSON. Validate external data, then pass the validated value into the typed function.

**Trap: forgetting that a rest parameter is an array.** In `(...values: number[])`, the body receives one array named `values`; callers pass separate arguments. Spread syntax does the reverse when an iterable is expanded into arguments. A normal mutable array is not automatically a fixed-length tuple, so tuple types may be needed for exact spread calls.

**Trap: using an arrow function when the API supplies `this`.** The arrow captures lexical `this`, so a runtime receiver supplied with `.call`, `.apply`, or a method-style invocation is ignored. Use a regular function and declare `(this: ExpectedType)` when that receiver is part of the contract.

## 7. Compare With Related Concepts

**Function type expression vs call signature.** `(x: number) => string` describes a callable value only. `{ label: string; (x: number): string }` describes a callable value with a property. Use the first for ordinary callbacks and the second for callable objects with state or metadata.

**Optional parameter vs union with `undefined`.** `x?: number` communicates that callers may omit the argument and makes it optional in calls. `x: number | undefined` requires an argument, although that argument may be `undefined`. Use `?` for omission; use the union when the position must be present.

**Default parameter vs optional parameter.** Both accept omission, but a default gives the function a non-undefined value in its body. Use a default when the function has a natural fallback; use optional syntax when the function must distinguish missing input or handle `undefined` itself.

**Overload vs union.** Overloads publish several call shapes and can give each shape a precise return type. A union publishes one shape with a multi-type parameter and is easier for union-typed variables. Use overloads for input-dependent return types; use a union for one common result and behavior.

**Overload vs generic.** Overloads enumerate a small, intentionally different set of cases. Generics express a reusable type relationship across many cases. Use a generic when the same rule works for every `T`; use overloads when the cases have genuinely different semantics.

**Generic vs `any`.** `any` removes the relationship and shifts errors to runtime. A generic preserves the relationship while allowing many concrete types. Use `any` only when deliberately accepting an untyped boundary and contain it; use a generic for typed reusable helpers.

**`this` parameter vs ordinary parameter.** A `this` parameter describes the receiver used by a regular function and is erased from emitted calls. An ordinary parameter is a real runtime argument. Use `this` for receiver-aware callback APIs; use an ordinary parameter when the value should be passed explicitly.

**Compile-time checking vs runtime behavior.** TypeScript can reject an unsafe callback assignment or a missing argument before emit. It cannot prevent JavaScript from being called by an untyped consumer, cannot create overload dispatch at runtime, and cannot validate JSON. The emitted function still needs ordinary JavaScript branching and runtime validation where data is untrusted.

## 8. 🧠 The Memory Hook

A function type is an order form plus a receipt: parameters say what may enter, the return type says what comes out, and generics preserve the relationship between them. Overloads are multiple public forms for one implementation; unions are alternatives in one form; callbacks must be safe for every value the caller may hand them.

Source: [TypeScript Handbook — More on Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html)
