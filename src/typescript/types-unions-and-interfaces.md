# Types, Unions, and Interfaces

## 1. Why This Exists — The Problem First

A checkout page can have a `status` field, but what is it allowed to contain? If one part of the app writes `"paid"`, another checks for `"payment-complete"`, and a third assumes every order has a shipping address, the code may compile as ordinary JavaScript and still fail in a customer-facing path. The hard part is not adding labels to variables. It is making the set of valid values and required fields honest enough that incompatible assumptions meet at compile time instead of in production.

The same problem appears in interviews. A candidate says “use an interface for an object” or “use a union for choices,” then models a state where a value can be both loading and failed, or accepts API data as `any`. Good TypeScript modeling makes invalid combinations difficult to write and makes the remaining runtime uncertainty visible.

## 2. The Analogy — Make It Obvious

Think of an order system as a warehouse with labelled slots. A `string` slot accepts text; a `number` slot accepts numbers. A literal type is a slot labelled with one exact value, such as `"paid"`. A union is a slot with a short approved-label list: an order may be `"draft"`, `"paid"`, or `"cancelled"`, but not a misspelt surprise.

An object shape is a packing checklist. `id` and `total` must be in every box; an optional `couponCode` may be absent. A tuple is a checklist whose position matters: the first item is a latitude and the second is a longitude. An intersection combines checklists, so a staff order needs every field from both an order and an audit record. If one checklist requires the same label to be both a string and a number, no real box can satisfy it.

`type` and `interface` are two ways to name the checklist. An interface is a checklist that can be reopened later so another declaration can add a line. A type alias is a fixed name that can describe a checklist, but can also name the approved-label list, a tuple, or a primitive. Neither label inspects a box arriving from outside the warehouse; that still needs runtime validation.

## 3. How It Actually Works — The Full Explanation

TypeScript describes JavaScript values at compile time. Its ordinary primitive types are `string`, `number`, `boolean`, `bigint`, `symbol`, `null`, and `undefined`. Use the lowercase names: `string`, not the boxed `String` object type. JavaScript has one `number` type for both whole numbers and decimals; `int` and `float` are not TypeScript primitive types.

Literal types describe a smaller set of values than their primitive parent. `"paid"` is a subtype of `string`; `42` is a subtype of `number`. A literal union is therefore a precise way to model finite choices. Arrays hold any number of values of one element type, while tuples have a known length and a known type at each position. TypeScript checks the shape at compile time, but emitted JavaScript still uses normal arrays and objects.

Object types say which properties a value must provide. `?` means a property may be absent. When read, an optional property is treated as possibly `undefined`, so code must handle that absence before using it. `readonly` prevents a write through a reference whose type has that modifier. It is a compile-time rule, shallow by default, and does not freeze the JavaScript object.

A type alias gives any type expression a reusable name. That includes primitives, literal unions, tuples, object shapes, unions, and intersections. An interface declares an object-shaped contract and can extend another interface. For object contracts, both work under TypeScript's structural typing: a value is assignable when it has compatible required members, not because it was created by a particular declaration. That is why independently written objects and library values can work together naturally.

Interfaces have one capability aliases deliberately do not: declaration merging. Two compatible `interface Preferences` declarations in the same declaration space become one interface containing both sets of members. This is useful for extending ambient or library declarations, such as `Window`, and should be used intentionally because it changes a shared contract. Declaring the same type alias twice is a duplicate-identifier error; aliases are fixed once declared.

A union written with `|` means a value may be any one of its members. You may only use an operation that is safe for every member until control flow proves which member you have. A later lesson covers that proof in depth as [narrowing and type guards](narrowing-and-type-guards.md). An intersection written with `&` means the value must satisfy all participating types. Intersections are useful for composing compatible capabilities, but conflicting required properties can make a property impossible.

`any`, `unknown`, `never`, and `void` are easy to misuse because they describe boundaries more than everyday domain data. `any` turns off checking for the value and lets unsafe assumptions spread. `unknown` accepts any incoming value but requires proof before it is used. `never` represents a state with no possible values, such as a function that never returns normally or a branch that has been proven impossible. `void` says a caller should not rely on a useful return value. None of these types validates, converts, or changes runtime data.

The [TypeScript handbook's Everyday Types guide](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html) is the source for these basic forms. Its [Object Types guide](https://www.typescriptlang.org/docs/handbook/2/objects.html) covers `readonly`, optional properties, tuples, and intersections; its [declaration-merging reference](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) explains how interface declarations combine.

## 4. Real Code — See It Working

This example models finite order phases, ordinary primitive fields, an array, a tuple, and an object shape. The `@ts-expect-error` line is intended to fail under `tsc --strict`; it proves the compiler rejects values outside the finite set.

```ts
type OrderPhase = "draft" | "paid" | "cancelled";
type Coordinates = readonly [latitude: number, longitude: number];

interface Order {
  id: string;
  total: number;
  phase: OrderPhase;
  tags: string[];
  delivery?: Coordinates;
  readonly createdAt: Date;
}

const order: Order = {
  id: "ord_42",
  total: 1299,
  phase: "paid",
  tags: ["priority", "gift"],
  delivery: [12.9716, 77.5946],
  createdAt: new Date("2026-08-28T00:00:00Z"),
};

// @ts-expect-error "refunded" is not one of the approved phases.
order.phase = "refunded";

// @ts-expect-error readonly prevents assignment through this Order reference.
order.createdAt = new Date();

const coupon = order.delivery?.[0]; // number | undefined
```

The tuple is not merely `number[]`: its length and order are part of its contract. `readonly` on the tuple also prevents `order.delivery?.push(...)` through that typed reference. It does not make `Date` immutable, and it does not recursively freeze values inside an object.

Here, aliases compose a reusable domain model. A union expresses alternatives; an intersection expresses requirements that must both be met.

```ts
type PaymentMethod = "card" | "bank-transfer";
type PurchaseId = string | number;

type Audited = {
  createdAt: Date;
  createdBy: string;
};

type PaidOrder = {
  id: PurchaseId;
  method: PaymentMethod;
} & Audited;

const paidOrder: PaidOrder = {
  id: "ord_42",
  method: "card",
  createdAt: new Date(),
  createdBy: "user_7",
};

type ImpossibleId = { id: string } & { id: number };

// @ts-expect-error ImpossibleId.id would need to be both string and number.
const impossible: ImpossibleId = { id: "ord_42" };
```

The `ImpossibleId` intersection is not a clever conversion. Its `id` property is effectively `string & number`, so no ordinary value can supply it. The compiler catches the attempted assignment; JavaScript would have no special intersection value at runtime.

This pair shows the safety boundary between `any` and `unknown`. Both can hold external data. Only `unknown` forces the code to establish enough evidence before property access.

```ts
declare const responseBody: any;

// Compiles, but `any` has disabled the check. This can throw at runtime if the
// response is null, missing `customer`, or has a non-string email.
const unsafeEmail: string = responseBody.customer.email;

declare const untrustedBody: unknown;

// @ts-expect-error An unknown value cannot be dereferenced before narrowing.
untrustedBody.customer;

function hasEmail(value: unknown): value is { email: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    typeof value.email === "string"
  );
}

if (hasEmail(untrustedBody)) {
  console.log(untrustedBody.email.toLowerCase()); // safe after this check
}
```

The predicate is runtime code, so it can inspect a value. The `value is { email: string }` part only tells TypeScript to trust the result of that runtime check in the `if` branch; it does not make a careless predicate correct. For full external-data validation, see [runtime validation and API boundaries](runtime-validation-and-api-boundaries.md).

This example shows intentional interface reopening. The declarations must agree on any member they share.

```ts
interface Preferences {
  theme: "light" | "dark";
}

interface Preferences {
  reducedMotion: boolean;
}

const preferences: Preferences = {
  theme: "dark",
  reducedMotion: true,
};
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between `type` and `interface`?**

Both can name an object contract, support optional and readonly properties, participate in structural assignability, and be extended or composed. Choose either consistently for a local object contract when its features fit. A `type` alias can name any type expression, including a primitive, tuple, union, or intersection. An `interface` is for object-shaped contracts and can be reopened so declarations merge. Use a type alias when the named thing is a union, tuple, or computed composition; use an interface when a reopenable object contract or a team/library convention makes that clearer. There is no universal winner.

**Q: What are union and intersection types?**

A union, `A | B`, means a value can be an `A` or a `B`. The compiler only lets you use facts shared by every possible member until code narrows the value. A literal union such as `"draft" | "paid" | "cancelled"` is ideal for a finite domain because it rejects misspellings and gives later code a known set to handle.

An intersection, `A & B`, means a value must meet both contracts at once. It is useful for composition, such as `Order & Audited`. It does not merge contradictions into a magic value: `{ id: string } & { id: number }` requires an impossible `id`, so assignments fail. Read `|` as “one allowed alternative” and `&` as “all required capabilities.”

**Q: What is the difference between `any` and `unknown`?**

Both can represent a value whose shape is not known yet, but they make opposite safety choices. `any` lets the value be assigned anywhere, called, indexed, and dereferenced without type checking. That convenience can let a bad API response become a trusted `string` and fail later at runtime. `unknown` accepts the value but blocks those uses until checks such as `typeof`, `Array.isArray`, or a sound validator establish a narrower type.

Use `unknown` at API, storage, plugin, and user-input boundaries. Use `any` only as a narrow, deliberate escape hatch when the program genuinely cannot express a relationship yet, and contain it immediately. Neither one validates runtime input; `unknown` merely makes missing validation hard to ignore.

**Q: When does `never` appear?**

`never` appears where no value can arrive. A function that always throws or loops forever can return `never` because it never completes normally. It also appears after exhaustive narrowing: if a discriminated union has handled every member, the remaining value is `never`. That makes an exhaustiveness helper useful because adding a new union member turns a supposedly unreachable branch into a compile-time error.

```ts
type Result =
  | { kind: "success"; value: string }
  | { kind: "failure"; message: string };

function assertNever(value: never): never {
  throw new Error(`Unhandled result: ${JSON.stringify(value)}`);
}

function label(result: Result): string {
  switch (result.kind) {
    case "success":
      return result.value;
    case "failure":
      return result.message;
    default:
      return assertNever(result);
  }
}
```

`never` is not the same as `void`. `never` says no normal return happens; `void` says callers must not use a return value.

**Q: What does `readonly` guarantee?**

`readonly` guarantees that code holding a reference through that readonly type cannot assign to that property. It protects the contract at compile time: `order.createdAt = ...` is rejected when `createdAt` is readonly. It does not guarantee runtime immutability, does not call `Object.freeze`, and is shallow unless nested properties and collections are also typed readonly. Another mutable alias can still change the same object at runtime.

**Q: Are optional properties the same as `undefined`?**

No. `couponCode?: string` means the property may be missing. Reading it produces `string | undefined`, because JavaScript yields `undefined` for a missing property. `couponCode: string | undefined` means the property itself is required, but its value may be `undefined`; an object without that key does not satisfy the contract. With the default compiler behavior, an optional property can usually be explicitly assigned `undefined`; with `exactOptionalPropertyTypes`, that assignment is rejected unless `undefined` is included in the declared property type. Model absence and an explicitly present `undefined` separately when that distinction matters.

**Q: Why is structural typing important for interfaces?**

Interfaces describe the capabilities a value must provide, not a nominal family it must belong to. A function that needs `{ id: string; total: number }` can accept an object from another module, a class instance, or a richer API model as long as the required members are compatible. This fits JavaScript's duck-typed object style and keeps contracts useful across independently authored code. It also means an interface name is not runtime identity, and a fresh object literal may receive an excess-property check to catch likely spelling mistakes.

**Q: What does `void` mean, and how is it different from `undefined`?**

`void` is normally used as a function return annotation to say the caller must not depend on a useful result. A function written as `function logOrder(): void { console.log("saved"); }` completes without returning a value, so its JavaScript result is `undefined`. But the concepts are not interchangeable: `undefined` is an actual JavaScript value and can be used in unions, while `void` describes an intentionally ignored result in a function contract. A callback type returning `void` can even accept an implementation that returns a value; callers of the callback are still not allowed to use that value.

## 6. The Traps — What Goes Wrong in Production

The first trap is using `any` to make a compiler error disappear at an external boundary. `any` does not make an API response safe; it only removes the compiler's evidence requirement. If the server changes `customer.email` from a string to `null`, the unsafe access in the earlier example still throws. Receive unknown data as `unknown`, validate it at runtime, and expose a trusted type only after validation.

The second trap is treating a union as if it were an object with every member's methods. A `string | number` is not guaranteed to have `toUpperCase`, because a number has no such method. The compiler allows only shared operations until a check proves the string branch. Do not silence that error with an assertion; narrow the value or change the model.

The third trap is using optional fields to represent mutually exclusive states. `type Request = { loading?: boolean; error?: string; data?: User }` permits `loading: true` and `error: "offline"` together even if the UI cannot honestly be both. A discriminated union makes each valid state explicit and lets later code narrow on the discriminator.

```ts
type RequestState =
  | { state: "loading" }
  | { state: "failed"; message: string }
  | { state: "ready"; data: { id: string } };
```

The fourth trap is assuming `readonly` means immutable. A readonly property blocks the assignment TypeScript sees through that type, but it does not stop a mutable alias or a runtime method from changing the object. Use readonly to communicate and enforce an API boundary in typed code; use runtime immutability tools when the runtime itself must enforce it.

The last trap is making an intersection when the real relationship is an alternative. `CardPayment & BankTransfer` says one value must be both payment methods. If a payment is either card or bank transfer, use `CardPayment | BankTransfer` and a discriminator. The symbol is a modeling decision, not a shorthand for “combine some types until the error goes away.”

## 7. Compare With Related Concepts

`type` and `interface` overlap for object contracts, so the choice is about the shape and evolution of the model rather than runtime behavior. Both disappear from emitted JavaScript and both use structural assignability.

| Decision point | `type` alias | `interface` | Practical rule |
|---|---|---|---|
| What it can name | Any type expression: primitives, literals, tuples, unions, intersections, and objects. | An object-shaped contract, with inheritance through `extends`. | Use `type` when the model itself is a union, tuple, or composition. |
| Composing contracts | Build intersections directly, such as `type StaffOrder = Order & Audited`. | Extend compatible object contracts, such as `interface StaffOrder extends Order, Audited {}`. | Use the form that makes the relationship easiest to read. |
| Alternatives | Name a union directly, such as `type Payment = Card | BankTransfer`. | Cannot be declared as a union; an interface describes one object contract. | Use `type` for “one of these shapes.” |
| Reopening | A second alias with the same name is a duplicate-identifier error. | Same-name declarations merge when their members are compatible. | Use an interface when intentional declaration merging is part of the extension point. |
| Team or library convention | Useful for local composition and domain unions. | Common for public object-facing contracts and ambient-library augmentation. | Follow the surrounding API's convention when both are technically suitable. |

Neither is universally superior. An interface can still participate in a type alias intersection, and a type alias can describe an object perfectly well; the meaningful differences are the operations above, not a blanket performance or runtime claim.

| Concept | What it means | When to use it |
|---|---|---|
| `type` alias | A fixed name for any type expression, including unions, tuples, primitives, and intersections. | Prefer it when the named model is not only an object contract or when composing types is central. |
| `interface` | A named object contract that can extend and reopen through declaration merging. | Prefer it for object-facing contracts when reopening or an interface-focused convention is useful. |
| Union (`A | B`) | One value may be one of several alternatives; only shared facts are safe before narrowing. | Use it for finite states, alternative input forms, and values with more than one valid shape. |
| Intersection (`A & B`) | One value must meet every participating contract. | Use it to compose compatible capabilities; avoid it for mutually exclusive alternatives. |
| `unknown` | Any incoming value, with proof required before use. | Use it at untrusted runtime boundaries. |
| `any` | An escape hatch that disables checks for the value. | Avoid by default; isolate it only when unavoidable and replace it with a real contract quickly. |
| Optional property (`x?: T`) | The key may be absent, and reading it may produce `undefined`. | Use it when absence itself is valid information. |
| Required `undefined` (`x: T | undefined`) | The key must exist, though its value may be undefined. | Use it when presence of the key matters separately from its value. |

Arrays and tuples also look similar but model different promises. `number[]` means any number of numeric elements. `[number, number]` means exactly two numeric positions with an order the caller can rely on. Use an array for a collection; use a tuple only when each position has a stable, meaningful role.

Static types and runtime validation solve different problems. Types help code you compile agree on a model; validation checks whether an outside value actually matches it. Use both at a boundary: validate first, then let TypeScript preserve the proved relationship through the rest of the program.

## 8. 🧠 The Memory Hook — What Sticks

Types are the warehouse labels for the values your code is allowed to handle. A union is the approved-label list, an intersection is every checklist at once, and `unknown` is the sealed incoming box that must be opened before anyone trusts its label.
