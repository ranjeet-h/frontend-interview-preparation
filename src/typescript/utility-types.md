# Utility Types

## 1. Why This Exists — The Problem First

An application rarely has one perfect shape for a piece of data. A user profile might be complete when it comes from the database, partial while a form is being edited, and limited to `{ id, displayName }` when it is sent to a list component. If we manually write a new interface for every one of those views, the shapes drift: a field gets renamed in one place, a required property is forgotten in another, and the compiler cannot connect the variants.

TypeScript utility types let us derive a new static type from a type we already trust. They are especially useful at boundaries—forms, API payloads, state transitions, and generic libraries—where the same data needs a deliberate variation. The important qualification is that they change what the compiler accepts; they do not validate, clone, freeze, remove, or otherwise transform a JavaScript value at runtime.

## 2. The Analogy — Make It Obvious

Think of a complete shipping form as a master paper form kept by a warehouse. Different jobs need different views of that form:

- `Partial` makes every field optional for a “fields changed so far” note.
- `Required` describes a completed submission whose declared fields must all be present to the compiler; it does not inspect blank values.
- `Readonly` gives a worker a view they may inspect but must not edit.
- `Pick` photocopies only named fields, such as the address label.
- `Omit` photocopies everything except fields that must stay internal, such as an admin note.
- `Record` creates a new form indexed by a known set of keys, such as one status message per order state.
- `Exclude` removes members from a union of allowed labels.
- `Extract` keeps only the members that overlap another union.
- `NonNullable` removes the “missing” options from a field type.
- `Parameters` and `ReturnType` read a function’s input and output shapes so a wrapper or adapter stays in sync.

The master form is still paper. Photocopying it does not alter the original, and putting “do not edit” on a copy does not stop someone from changing the paper with a different tool. That is the same boundary as mapped and conditional utility types: they create compile-time views, not runtime behavior.

## 3. How It Actually Works — The Full Explanation

Most object utilities are mapped types: TypeScript iterates over keys of an existing type and changes the modifier or selects a subset. `Partial<T>` makes each property optional, `Required<T>` removes optional markers, and `Readonly<T>` adds readonly markers. Those markers affect assignment checking, not the object itself.

`Pick<T, K>` keeps keys `K` from `T`; `Omit<T, K>` keeps the keys of `T` after removing `K`. In simplified form, `Omit` is `Pick<T, Exclude<keyof T, K>>`: first calculate all keys except the forbidden ones, then pick the remainder. `Pick` constrains its key parameter to `keyof T`, but built-in `Omit<T, K>` does not. Therefore `Omit<User, "typo">` is permitted and has the same keys as `User`; the unknown key has nothing to remove. If a codebase wants typo rejection, it can define a stricter wrapper such as `StrictOmit<T, K extends keyof T> = Omit<T, K>`.

`Record<K, V>` maps every key in `K` to the same value type `V`. With a finite union such as `"idle" | "saving" | "error"`, it requires all three entries. With `string`, it describes an open string-keyed object, which is broader and does not guarantee any particular named key exists.

`Exclude<T, U>` and `Extract<T, U>` are distributive conditional types. For a union, TypeScript tests each member independently: `Exclude` keeps members that are not assignable to `U`, while `Extract` keeps members that are assignable to `U`. They are about assignability, not string subtraction. `Extract<"id" | "name", string>` keeps both because both are assignable to `string`.

`NonNullable<T>` is the common conditional-type operation that removes `null` and `undefined`. It is useful after a guard, but it does not perform that guard at runtime. The program must still establish the value is present before using it.

Function utilities inspect a function type. `Parameters<F>` produces a tuple of its parameter types, preserving order and optional/rest information. `ReturnType<F>` produces the result type. For an overloaded function, these utilities use the last overload signature that is visible in the type, so overload order can matter. For generic or deliberately broad functions, the result can also be broad (`unknown`, `any`, or a generic constraint); it is not a runtime observation.

All of these transformations are shallow unless the definition says otherwise. `Readonly<User>` prevents assignment to `user.address` but does not recursively make a present `address` object readonly. A `Partial<User>` makes `address` optional, but if an address is present, its nested `city` field remains governed by the original nested type.

## 4. Real Code — See It Working

The following examples are type-checked examples. The `@ts-expect-error` comments document compiler errors that are intentionally demonstrated; if TypeScript stops reporting one, compilation fails and the example needs attention.

```ts
interface User {
  id: string;
  name: string;
  email: string;
  role?: "admin" | "member";
  address?: { city: string };
}

type UserDraft = Partial<User>;
const draft: UserDraft = { name: "Asha" };

type StoredUser = Required<User>;
const stored: StoredUser = {
  id: "u_1",
  name: "Asha",
  email: "asha@example.com",
  role: "member",
  address: { city: "Bengaluru" },
};

type PublicUser = Readonly<Pick<User, "id" | "name">>;
const publicUser: PublicUser = { id: stored.id, name: stored.name };
// @ts-expect-error Readonly rejects assignment through this type.
publicUser.name = "New name";

type UserEdit = Pick<User, "name" | "email">;
type UserWithoutRole = Omit<User, "role">;

const editable: UserEdit = { name: "Asha", email: "asha@example.com" };
const safeToLog: UserWithoutRole = {
  id: stored.id,
  name: stored.name,
  email: stored.email,
};

type RoleMessage = Record<NonNullable<Required<User>["role"]>, string>;
const roleMessages: RoleMessage = {
  admin: "Full access",
  member: "Standard access",
};

type UserEvent = "created" | "updated" | "deleted";
type NonDestructiveEvent = Exclude<UserEvent, "deleted">;
type ReadEvent = Extract<UserEvent, "created" | "updated">;

const userEvent: NonDestructiveEvent = "updated";
const readEvent: ReadEvent = "created";
// @ts-expect-error "deleted" was excluded.
const invalidEvent: NonDestructiveEvent = "deleted";

function findUser(id: string): User | undefined {
  return id === stored.id ? stored : undefined;
}

type FindUserResult = NonNullable<ReturnType<typeof findUser>>;
function formatUser(user: FindUserResult): string {
  return `${user.id}: ${user.name}`;
}

type FindUserArgs = Parameters<typeof findUser>;
const args: FindUserArgs = ["u_1"];
formatUser(stored);
```

Here are representative equivalents. They expose the mechanism without pretending that a type alias performs a runtime operation.

```ts
type MyPick<T, K extends keyof T> = {
  [P in K]: T[P];
};

type StrictOmit<T, K extends keyof T> = Omit<T, K>;

type MyReadonly<T> = {
  readonly [P in keyof T]: T[P];
};

type MyExclude<T, U> = T extends U ? never : T;

type MyReturnType<F extends (...args: never[]) => unknown> =
  F extends (...args: never[]) => infer R ? R : never;

interface Product {
  id: string;
  price: number;
  title: string;
}

type ProductCard = MyPick<Product, "id" | "title">;
type ProductWithoutPrice = StrictOmit<Product, "price">;
type FrozenProduct = MyReadonly<Product>;
type NonPreviewField = MyExclude<"id" | "title" | "price", "price">;
type PriceResult = MyReturnType<(currency: string) => number>;

type BuiltInTypoOmit = Omit<Product, "prcie">; // Allowed: no matching key is removed.
// @ts-expect-error StrictOmit rejects a key that is not in Product.
type StrictTypoOmit = StrictOmit<Product, "prcie">;
```

Line by line, `MyPick` loops over only the requested keys and looks up each property’s original type. `StrictOmit` adds the `K extends keyof T` constraint that built-in `Omit` intentionally does not have, then delegates the actual omission to `Omit`. `MyReadonly` loops over every key and adds the readonly modifier while preserving each value type. `MyExclude` distributes over a union: a member assignable to `U` becomes `never`, and `never` disappears from the resulting union. `MyReturnType` uses `infer R` to ask the compiler to name the function’s result type and then returns that name. These aliases disappear after compilation; they do not create JavaScript functions.

For an edit form, derive the input contract from the canonical domain model instead of duplicating it:

```ts
interface Account {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
  isSuspended: boolean;
}

type AccountEdit = Pick<Account, "displayName" | "email">;

function saveAccountEdit(accountId: Account["id"], changes: AccountEdit) {
  // The id is the route/resource identity; editable fields are explicit.
  return { accountId, changes };
}

saveAccountEdit("acct_1", {
  displayName: "Asha Rao",
  email: "asha@example.com",
});

// @ts-expect-error createdAt is server-owned, not an edit-form field.
saveAccountEdit("acct_1", { createdAt: new Date() });
```

At runtime, `saveAccountEdit` receives an ordinary object. `Pick` does not strip `createdAt` if an untrusted caller sends it as JavaScript, and TypeScript’s excess-property checks are not a security boundary. Validate and whitelist the payload at the API boundary when the data is external.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are utility types?**

They are reusable generic type transformations supplied by TypeScript, such as `Partial<T>`, `Pick<T, K>`, and `ReturnType<F>`. They derive a compile-time contract from another type, which keeps related views synchronized. They have no direct runtime effect: a `Readonly<T>` value is not frozen, and `Omit<T, "password">` does not delete a password from an object.

**Q: How are `Pick` and `Omit` different?**

`Pick<T, K>` uses an allow-list: the result contains only the named keys. `Omit<T, K>` uses a deny-list: the result contains every key except the named keys. Use `Pick` when the consumer should receive a small, stable projection; use `Omit` when the base type is the right shape and only a few fields are intentionally excluded. For security-sensitive output, an explicit `Pick` is usually safer because newly added fields do not silently flow into the contract.

**Q: How is `Omit` conceptually built?**

As `Pick<T, Exclude<keyof T, K>>`. `keyof T` produces all keys, `Exclude` removes the forbidden keys, and `Pick` rebuilds the object from what remains. The equation explains the behavior, but unlike `Pick`, built-in `Omit<T, K>` does not constrain `K` to `keyof T`, so unknown keys are ignored. Use `StrictOmit<T, K extends keyof T>` when typo rejection is desired.

**Q: What is the difference between `Exclude` and `Extract`?**

Both distribute over union members. `Exclude<T, U>` keeps members of `T` that are not assignable to `U`; `Extract<T, U>` keeps members that are assignable to `U`. For example, `Exclude<"read" | "write", "write">` is `"read"`, while `Extract<"read" | "write", "read" | "audit">` is `"read"`. Think “remove” versus “intersect by assignability.”

**Q: How do you get a function’s return type?**

Use `ReturnType<typeof functionName>` for a named function or `ReturnType<typeof callback>` for a value. For example, `type Result = ReturnType<typeof findUser>` is `User | undefined`. If the result must be present, first prove that at runtime and then use a narrowed value; `NonNullable<ReturnType<...>>` changes the declared type but does not check the value.

**Q: When is `Partial` dangerous?**

It is dangerous when it weakens a type at a boundary that actually requires a complete object. A function accepting `Partial<Account>` might receive `{}` and fail later, or an update operation might accidentally interpret an omitted field as “clear it,” “leave it unchanged,” or “use a default.” Use a dedicated patch/update type when omission has domain meaning, validate required invariants, and distinguish `undefined` from an intentionally supplied `null` when the API needs that distinction.

**Q: Would you use a utility type or define a new domain type?**

Use a utility type when the new shape is mechanically tied to the source and should change whenever that source changes—for example, an edit form’s `Pick<Account, ...>`. Define a named domain type when the shape has independent business meaning, validation rules, lifecycle semantics, or a contract that should not silently change when the source evolves. A named `AccountPatch` can still use utilities internally, but naming it tells readers that its semantics deserve their own review.

**Q: Do utility types transform values at runtime?**

No. They guide the TypeScript checker and are erased from emitted JavaScript. `Readonly<T>` does not call `Object.freeze`, `Omit<T, "secret">` does not remove a property, and `NonNullable<T>` does not reject `null`. Runtime parsing, copying, freezing, and redaction need actual code or a validation library.

## 6. The Traps — What Goes Wrong in Production

- **Treating `Partial<T>` as a safe patch protocol.** A partial object says only that properties may be absent; it does not say how an update should interpret absence. Define patch semantics explicitly and validate before persistence.

- **Assuming `Readonly` is deep or runtime-enforced.** `Readonly<Account>` protects assignments through that particular static reference and only at the top level. Nested objects remain mutable, and JavaScript can mutate the object through another alias. Use a deep readonly type for a compile-time convention, and `Object.freeze` or immutable data structures when runtime enforcement matters.

- **Using `Omit` as a security filter.** `Omit<Account, "passwordHash">` changes the type of a value expression; it does not sanitize a response. Build a DTO at runtime by selecting fields or serialize through a trusted schema.

- **Making `Record<string, V>` when keys are actually finite.** `Record<"idle" | "saving" | "error", string>` catches missing statuses. `Record<string, string>` accepts any string key and therefore loses that exhaustiveness. Use a literal union when the set is known.

- **Confusing `Exclude` with substring removal.** `Exclude<"user_created", "created">` remains `"user_created"` because the whole string is not assignable to `"created"`. Use template literal types or a runtime string operation for pattern-based work.

- **Assuming `NonNullable` proves presence.** `NonNullable<User | undefined>` is `User` only as a type expression. A possibly missing value still needs an `if`, an assertion with a justified invariant, or a throwing lookup before it is passed to a function requiring `User`.

- **Expecting `ReturnType` to infer the result of calling a function.** `ReturnType<typeof getUser>` inspects the function type. `ReturnType<getUser()>` is invalid because `getUser()` is a value expression, not a type. Use `typeof` on the function or `typeof result` on a variable when appropriate.

- **Assuming `Pick` protects against extra properties everywhere.** Fresh object literals receive excess-property checks, but values held in variables can carry extra runtime fields. This is another reason to validate and map untrusted data at boundaries.

- **Using a derived type where the domain needs independent semantics.** A mechanically derived `Pick` can silently change when the source gains a field or changes optionality. That coupling is useful for UI projections, but risky for versioned public APIs or business commands; introduce a named type when stability is part of the contract.

## 7. Compare With Related Concepts

`Pick` versus `Omit`: allow-list the fields you want versus deny-list the fields you do not want. Use `Pick` for narrow public projections and `Omit` for convenient internal variants where additions to the base type are intentionally inherited.

`Partial<T>` versus a patch/domain type: make every property optional mechanically versus encode what an update means. Use `Partial` for local drafts or straightforward merge updates; define a domain type when omitted, `undefined`, `null`, and defaults have different meanings.

`Readonly<T>` versus `Object.freeze(value)`: static assignment protection versus runtime freezing. Use the former for compiler-visible ownership conventions and the latter when the runtime must reject or prevent mutation; neither is automatically deep.

`Exclude<T, U>` versus `Extract<T, U>`: remove assignable union members versus keep assignable union members. Use `Exclude` for forbidden cases and `Extract` for selecting the supported overlap.

`Record<K, V>` versus an index signature `{ [key: string]: V }`: a mapped finite key set can require every known key, while an index signature describes arbitrary keys. Use `Record` with a literal union for exhaustive tables and an index signature only when open-ended keys are truly valid.

`ReturnType<F>` versus an explicit result type: derive a coupled implementation result versus publish an independently owned contract. Use `ReturnType` for wrappers and adapters that should track a function; use an explicit domain type when callers should not change merely because an implementation function changes.

`Pick`/`Omit` versus runtime validation: static shape description versus runtime evidence. Use both at an external boundary: a utility type documents what the code expects, while validation and mapping establish that an unknown value really has that shape.

## 8. 🧠 The Memory Hook

Utility types are photocopiers for contracts: they make a compile-time view of an existing shape, but the original JavaScript object stays exactly as it was. Remember the verbs—`Partial` loosens, `Required` tightens, `Readonly` locks a view, `Pick` keeps, `Omit` removes, `Record` maps keys, `Exclude` removes union members, `Extract` keeps overlap, and function utilities inspect signatures. When the shape carries business meaning or crosses an untrusted boundary, give it a named contract and runtime validation instead of trusting a clever alias.
