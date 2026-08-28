# Literal Types, `as const`, and `satisfies`

## 1. Why This Exists — The Problem First

Imagine a frontend configuration that controls which payment methods appear:

```ts
const paymentLabels = { card: "Card", bank: "Bank transfer" };
```

Later, a helper needs to accept only the exact keys `card` and `bank`, and a request builder needs to know that the `card` label is specifically a string. If the object was inferred too broadly, useful information has disappeared. If it was forced into a broad annotation, the compiler may check the overall shape but forget the property-specific facts. If it was asserted with `as`, a typo can be hidden behind a promise the compiler is not allowed to challenge.

Literal types, `as const`, and `satisfies` are three ways to control that trade-off. They let us decide whether a value should remain a general `string`, one exact string such as `"card"`, a mutable array, a readonly tuple, or an object whose keys and values are checked without throwing away the precise inference that makes the object pleasant to use.

## 2. The Analogy — Make It Obvious

Think of a warehouse label. A label saying “text” is useful but broad. A label saying “`"card"`” is precise: it identifies one approved value. Literal widening is the warehouse clerk replacing a precise label with a broader category because the box may be moved later.

`as const` is a stamp that says, “keep the exact labels and do not edit this packing list through this type.” On an object, every property keeps its literal type and becomes readonly; on an array, the positions become a readonly tuple. The stamp changes the static label, not the box or the warehouse floor.

An annotation is a receiving form that says, “this entire delivery must fit this broad category.” The form checks the delivery but makes you work with the category afterward. `satisfies` is a second inspector: it checks that the delivery fits the form while leaving the original, detailed labels attached. That is why a configuration can be checked against `Record<ThemeName, string>` and still retain the exact keys and property-specific value types.

## 3. How It Actually Works — The Full Explanation

**Literal types and widening.**

A literal type is one exact value: `"success"`, `42`, or `true`. A union of literals is a finite vocabulary:

```ts
type RequestStatus = "idle" | "loading" | "success" | "error";
```

This is narrower than `string`. A function accepting `RequestStatus` can reject `"pending"`, catch a misspelling, and let a `switch` cover known states.

TypeScript widens a literal when it believes the value needs to remain replaceable. A `let` variable usually widens because reassignment is expected. A top-level primitive `const` binding can keep its literal type because the binding cannot be replaced:

```ts
let mutableStatus = "idle"; // string: another string may be assigned later
mutableStatus = "loading";

const fixedStatus = "idle"; // "idle": the binding cannot be reassigned

const statuses = ["idle", "loading"]; // string[]: array elements are mutable
statuses.push("success");
```

The important nuance is that `const` protects the variable binding, not the inside of an object or array. `const settings = { mode: "dark" }` still has a mutable property, so `mode` is generally inferred as `string`. `const` tells JavaScript that `settings` cannot point at another object; it does not tell TypeScript that `settings.mode` can never change.

Context also matters. An expression assigned to an explicitly broad target is checked in that context, so the target can determine how much detail remains. `as const` opts into the narrowest literal interpretation for a literal expression instead of relying on the normal widening rules.

**What `as const` produces.**

For a literal expression, `as const` has three practical effects:

- string, number, and boolean properties keep their literal types;
- object properties become `readonly`;
- array literals become readonly tuples, preserving length and position.

```ts
const route = {
  method: "GET",
  path: "/users",
} as const;

// typeof route is:
// { readonly method: "GET"; readonly path: "/users" }

const point = [10, 20] as const;
// typeof point is readonly [10, 20]
```

The readonly behavior follows the expression being asserted. Nested object and array literals inside that expression receive readonly static types, but a pre-existing object or array referenced by the expression keeps its original type. The assertion does not walk through that reference and rewrite its type. Nothing here makes JavaScript immutable at runtime: `as const` is erased during compilation, emits no `Object.freeze` call, and adds no runtime guard.

```ts
const mutableTags = ["draft"];

const settings = {
  nested: { mode: "dark" },
  tags: ["typescript", "frontend"],
  linkedTags: mutableTags,
} as const;

// @ts-expect-error The nested object literal is readonly in the asserted type.
settings.nested.mode = "light";
// @ts-expect-error The nested array literal is a readonly tuple.
settings.tags.push("interview");

// This is a reference to a pre-existing mutable array, so its original type remains string[].
settings.linkedTags.push("interview");
mutableTags.push("published"); // Both names reach the same ordinary runtime array.
```

`as const` can be useful for deriving a union from data:

```ts
const roles = ["admin", "editor", "viewer"] as const;
type Role = (typeof roles)[number]; // "admin" | "editor" | "viewer"
```

This is a type-level relationship. The array is still an ordinary JavaScript array at runtime, though this particular reference is readonly to TypeScript.

**Annotation, assertion, and `satisfies`.**

These three forms answer different questions:

```ts
type Method = "GET" | "POST";
type RequestOptions = { method: Method; path: string };

const annotated: RequestOptions = {
  method: "GET",
  path: "/users",
};

const asserted = {
  method: "GET",
  path: "/users",
} as RequestOptions;

const checked = {
  method: "GET",
  path: "/users",
} satisfies RequestOptions;
```

An annotation says the variable has `RequestOptions`; the assigned expression must be compatible, and later reads use that declared type. An assertion says, “treat this expression as `RequestOptions`.” It can be useful when the programmer has information the compiler cannot derive, but it does not prove the value is correct and can hide missing or incompatible runtime data. `satisfies` checks that the expression is compatible with `RequestOptions` while preserving the expression's own inferred type.

An assertion and `satisfies` are not interchangeable. `as RequestOptions` changes the static view at the expression; `satisfies RequestOptions` validates that view without replacing the expression's more specific information. Neither performs runtime validation.

**Why `satisfies` matters for configuration maps.**

Suppose every color entry must be either a string or an RGB tuple, and every color key must be present:

```ts
type Color = "red" | "green" | "blue";
type RGB = readonly [red: number, green: number, blue: number];
type Palette = Record<Color, string | RGB>;

const palette = {
  red: [255, 0, 0],
  green: "#00ff00",
  blue: [0, 0, 255],
} satisfies Palette;

const normalizedGreen = palette.green.toUpperCase(); // string
const firstRedChannel = palette.red[0]; // number
```

The `satisfies` check catches a missing `blue`, an extra misspelled key such as `bleu`, a tuple with the wrong length, or a value of the wrong kind. At the same time, `palette.green` remains known as a string rather than becoming the broad union `string | RGB`, and `palette.red` remains known as an array of numbers.

For exact keys, `Record<Color, unknown>` is a useful pattern:

```ts
type Feature = "search" | "export" | "billing";

const featureEnabled = {
  search: true,
  export: false,
  billing: true,
} satisfies Record<Feature, unknown>;

type FeatureKey = keyof typeof featureEnabled; // "search" | "export" | "billing"
```

Because the target has a finite key union, the object literal must include those keys and cannot add an unknown key. `keyof typeof featureEnabled` derives the keys from the value after the check. If keys are allowed to be open-ended, use `Record<string, Value>` instead; it checks value compatibility but cannot require a particular finite key set.

**The external-data boundary.**

None of these features validates JSON received from a server, local storage, a URL, or a user. TypeScript checks source code and values already typed within that source code. This is not safe validation:

```ts
type User = { id: number; name: string };

const user = JSON.parse('{"id": 1}') as User;
// The assertion is accepted, but user.name is actually undefined at runtime.
```

At an external boundary, parse as `unknown`, validate the actual structure with runtime code or a schema library, and only then use the validated type. `as const` and `satisfies` are excellent for code-owned constants; they cannot inspect a packet that arrives after compilation.

Official references: [literal inference and type assertions in the TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html), [const assertions in the TypeScript 3.4 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html), and the [TypeScript 4.9 release notes for `satisfies`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html).

## 4. Real Code — See It Working

The following examples are intentionally small enough to compile with `tsc --strict`. The `@ts-expect-error` comments document errors that are supposed to exist; compilation fails if TypeScript unexpectedly accepts them.

**Widening versus exact literals.**

```ts
let current = "idle"; // string
current = "loading"; // allowed because the variable is replaceable

const exact = "idle"; // "idle"
// @ts-expect-error exact is not allowed to become another literal.
const onlyIdle: "idle" = exact === "idle" ? exact : "loading";

const tags = ["typescript", "frontend"]; // string[]
tags.push("interview"); // allowed: this array is mutable
```

**Readonly tuple and object inference.**

```ts
const coordinateOrigin = [0, 0] as const;
const coordinates: readonly [number, number] = coordinateOrigin;

// @ts-expect-error A readonly tuple cannot be mutated through this reference.
coordinateOrigin[0] = 10;

const action = { type: "user/created", retryable: false } as const;
// @ts-expect-error Both properties are readonly in the inferred type.
action.retryable = true;

type ActionType = typeof action.type; // "user/created"
```

**Annotation can lose property-specific information.**

```ts
type Mode = "dark" | "light";
type Theme = Record<Mode, string | { hex: string }>;

const annotatedTheme: Theme = {
  dark: "#111111",
  light: { hex: "#ffffff" },
};

// The annotation is correct, but every property is read as string | { hex: string }.
// @ts-expect-error The broad union does not guarantee that `dark` is a string.
annotatedTheme.dark.toUpperCase();
```

**`satisfies` checks the shape and keeps inference.**

```ts
type Mode = "dark" | "light";
type Theme = Record<Mode, string | { hex: string }>;

const preciseTheme = {
  dark: "#111111",
  light: { hex: "#ffffff" },
} satisfies Theme;

preciseTheme.dark.toUpperCase(); // allowed: this property is known to be a string
preciseTheme.light.hex.toUpperCase(); // allowed: this property is the object form

const invalidTheme = {
  dark: "#111111",
  light: { hex: "#ffffff" },
  // @ts-expect-error `bright` is not one of the exact Mode keys.
  bright: "#eeeeee",
} satisfies Theme;
```

**Exact keys and a safe runtime boundary.**

```ts
type ScreenName = "home" | "settings";

const screenTitles = {
  home: "Home",
  settings: "Settings",
} satisfies Record<ScreenName, string>;

function titleFor(screen: keyof typeof screenTitles): string {
  return screenTitles[screen];
}

const jsonValue: unknown = JSON.parse('{"home":"Home"}');

function isScreenTitles(value: unknown): value is Record<ScreenName, string> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.home === "string" &&
    typeof candidate.settings === "string"
  );
}

if (isScreenTitles(jsonValue)) {
  titleFor("home");
  jsonValue.settings.toUpperCase();
}
```

The final guard is runtime code. The `as Record<string, unknown>` inside it only gives the guard a workable intermediate view after the `typeof` check; it does not claim that the external value is already a valid screen map.

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does a `const` variable sometimes still widen?**

`const` prevents reassignment of the binding, but it does not make the value's contents immutable. A primitive `const status = "idle"` can retain the literal type `"idle"` because the binding cannot point to another string. An object such as `const state = { status: "idle" }` still has a writable `status` property, so TypeScript usually widens that property to `string`. An array is similarly inferred as a mutable `string[]`. Use `as const` when the object or array itself should be represented with literal and readonly information.

**Q: What does `as const` do?**

It is a const assertion on a literal expression. It prevents literal widening, marks object properties readonly, and infers an array literal as a readonly tuple. That makes it useful for action objects, route tables, enum-like lists, and deriving unions from data. It is a compile-time type operation; it does not clone, freeze, or validate the runtime value.

**Q: Is `as const` runtime freezing?**

No. TypeScript erases the assertion. JavaScript receives the same ordinary object or array and can still mutate it through another mutable reference, an escape hatch, or JavaScript code. If runtime immutability is actually required, use an explicit runtime mechanism such as `Object.freeze`—and remember that ordinary `Object.freeze` is shallow unless nested values are frozen too.

**Q: What does `satisfies` do?**

It checks that an expression is assignable to a target type without changing the expression's resulting inferred type. This catches missing keys, extra keys on an object literal, and incompatible values while preserving useful facts such as “this particular property is a string” or “this tuple has three numeric positions.” It is available in TypeScript 4.9 and later.

**Q: How is `satisfies` different from an annotation?**

An annotation changes the variable's declared type and subsequent reads use that type. A `satisfies` clause checks against the target but keeps the expression's own specific inference. In a palette, `const palette: Record<Color, string | RGB>` makes `palette.green` look like the union, while `const palette = {...} satisfies Record<Color, string | RGB>` can preserve `palette.green` as a string and `palette.red` as a numeric tuple. Both check compatibility; they differ in the type retained for use afterward.

**Q: When can `as` hide a bug?**

Whenever the assertion is being used as a substitute for evidence. `const user = response.json() as User` does not inspect the response; it simply tells the compiler to stop questioning the expression. A typo, missing property, wrong API version, or malformed JSON can pass compilation and fail later. Assertions are appropriate when a real invariant has been established elsewhere and TypeScript cannot express that evidence, but at untrusted boundaries prefer parsing and runtime validation.

**Q: How do you type a configuration object while preserving literal keys?**

Define the allowed key union and value contract, then use `satisfies`:

```ts
type Environment = "development" | "staging" | "production";
type EnvironmentConfig = { apiBaseUrl: string; retries: number };

const configs = {
  development: { apiBaseUrl: "http://localhost:3000", retries: 0 },
  staging: { apiBaseUrl: "https://staging.example.com", retries: 2 },
  production: { apiBaseUrl: "https://example.com", retries: 3 },
} satisfies Record<Environment, EnvironmentConfig>;

type ConfigKey = keyof typeof configs;
const selected = configs["production"];
const retryCount: number = selected.retries;
```

`Record<Environment, EnvironmentConfig>` requires every allowed key and rejects an extra typo. `keyof typeof configs` gives the exact key union after the check, and each property retains its own useful property-specific inference. If values should be mutable, do not add `as const`; if the values must be immutable, combine a deliberate readonly value type or `as const` with the shape check, understanding the readonly trade-off.

**Q: How do literal unions help an interview answer?**

A literal union states the finite vocabulary directly: `"idle" | "loading" | "success" | "error"`. It is narrower than `string`, supports control-flow narrowing and exhaustiveness checks, and makes typos compile-time errors. It does not make a runtime string safe by itself; data from outside the program still needs validation before it is treated as that union.

**Q: When should you choose `as const` versus `satisfies`?**

Use `as const` when the central goal is to preserve literals and expose a readonly object or tuple. Use `satisfies` when the central goal is to check that a value conforms to a contract while keeping property-specific inference. They solve different halves of the problem and can be combined, but combining them may make values readonly, so do it intentionally.

## 6. The Traps — What Goes Wrong

**“`const` means every nested value is constant.”**

This confuses a JavaScript binding with a TypeScript readonly type. `const user = { name: "A" }` prevents `user = otherUser`, but `user.name = "B"` is still a normal mutation. If code needs an immutable static table, use `as const` or an explicit readonly type. If the application needs runtime protection, add runtime freezing or avoid mutation by design.

**Treating `as const` as a validator.**

`as const` narrows what TypeScript believes about code you wrote; it does not verify that a server response contains those values. `JSON.parse(input) as const` is rejected by TypeScript because const assertions can only be applied to literal expressions, not to the result of a function call. The tempting alternative, `JSON.parse(input) as User`, is valid syntax but unsafe: it is only a claim about unchecked data. Keep the external value `unknown` until a runtime check proves its shape.

```ts
type User = { id: number; name: string };
const input = '{"id": 1}';

// @ts-expect-error Const assertions apply to literal expressions, not call results.
const impossible = JSON.parse(input) as const;

const unsafeUser = JSON.parse(input) as User; // Compiles; name is missing at runtime.
```

**Annotating a whole map with a broad union too early.**

`const palette: Record<Color, string | RGB>` is a valid contract, but every lookup is read as `string | RGB`, even when the source literal clearly used one form for a specific property. That can force unnecessary narrowing at every use. If the object is code-owned and you want both validation and precise property inference, use `satisfies`.

**Assuming `satisfies` changes mutability or narrows everything to literals.**

`satisfies` preserves the expression's inferred type; it does not automatically add `readonly` and does not behave like `as const`. A mutable object checked with `satisfies` remains mutable if its inferred properties are mutable. If exact literals and readonly properties are needed, use `as const` deliberately, perhaps on the expression being checked.

**Using `Record<string, Value>` when the keys are actually closed.**

`Record<string, string>` describes an open dictionary. It is appropriate when arbitrary string keys are valid, but it cannot require `home`, `settings`, and `help` all to exist. For a closed set, use `Record<"home" | "settings" | "help", string>` so omissions and typos are caught.

**Expecting readonly values to pass to mutable APIs.**

A `readonly [number, number]` is not assignable to a function requiring `[number, number]`, because that function could mutate the tuple. Accept `readonly` in APIs that only read:

```ts
function distanceFromOrigin(point: readonly [number, number]): number {
  return Math.hypot(point[0], point[1]);
}
```

Readonly is a useful promise, but it changes assignability. Do not remove it with a cast just to silence an error; decide whether the callee truly needs mutation.

## 7. Compare With Related Concepts

| Concept | Key difference | Use it when |
| --- | --- | --- |
| `const` | Runtime binding cannot be reassigned; nested values may still mutate. | You need ordinary JavaScript binding immutability. |
| `as const` | Compile-time literal preservation plus readonly object/tuple inference; no runtime freeze. | A code-owned value is a fixed vocabulary or readonly static table. |
| Type annotation (`: T`) | Checks assignment and makes the location use `T` afterward. | The variable should expose exactly the declared contract, even if that is broader. |
| Type assertion (`as T`) | Tells the checker to trust a more specific view; does not validate or convert. | You have evidence the compiler cannot derive, and the assertion is local and justified. |
| `satisfies T` | Checks assignability to `T` while retaining the expression's inferred type. | A config or map needs shape/key checks and precise property inference. |
| `readonly` type | Prevents writes through a TypeScript reference; it is shallow and compile-time only. | An API should consume data without mutating it. |
| Runtime schema validation | Inspects actual values while the program runs. | Data comes from JSON, storage, users, or another process. |

The short rule is: annotate when you want a contract as the usable type, assert only when you already have trustworthy evidence, use `satisfies` to check without erasing details, use `as const` for intentional literal/readonly inference, and validate anything that crossed a runtime boundary.

## 8. 🧠 The Memory Hook — What Sticks

`const` locks the name, `as const` locks the type-level labels, and `satisfies` checks the packing list without replacing those labels. Use `satisfies` when you want the compiler to inspect a configuration and still let each property remain exactly what it is; remember that none of these stamps opens and inspects external JSON.
