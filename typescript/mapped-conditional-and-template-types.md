# Mapped, Conditional, and Template Types

## 1. Why This Exists — The Problem First

Suppose an API describes a User once, but the application also needs a form model, a patch payload, a nullable database result, and a set of change events. Copying each shape by hand feels harmless at first. Later, someone adds timezone to User, updates two copies, misses the third, and the compiler can no longer protect the boundary between them.

These TypeScript features solve that maintenance problem by letting one type be a small, checked recipe for another type. The danger is that a clever recipe can become harder to understand than the original types, so the goal is not to show off type tricks. The goal is to keep related contracts synchronized while the code remains readable.

## 2. The Analogy — Make It Obvious

Think of a warehouse with a trusted inventory list. The list has named shelves—id, name, and email—and each shelf has a rule for what it stores.

- A mapped type is a worker who visits every shelf in the inventory and applies the same operation: put a lock on each shelf, make every shelf optional, or replace every value with a validation flag.
- keyof is the worker's list of shelf names. It prevents the worker from silently inventing or forgetting a shelf.
- A conditional type is a sorting rule: if an item fits a category, send it down one lane; otherwise send it down another. extends means “is assignable to” here, not “inherits from a class” in the object-oriented sense.
- Key remapping changes the labels while visiting the shelves, such as turning name into getName. Returning never removes a shelf from the final inventory.
- A template literal type is a label maker. Given name, it can produce the allowed label nameChanged, and given a union of names it produces the corresponding union of labels.

The warehouse itself is still a normal runtime object. These workers and label makers only describe what shapes are allowed at compile time; they do not loop over properties or rename anything in JavaScript at runtime.

## 3. How It Actually Works — The Full Explanation

### Mapped types: iterate over known keys

The basic shape is:

~~~ts
type Transform<Source> = {
  [Key in keyof Source]: Source[Key];
};
~~~

keyof Source produces a union of property keys. For type User = { id: number; name: string }, it is "id" | "name". The in part visits each key, and Source[Key] is an indexed access that retrieves the value type for the key currently being visited.

The mapped type can preserve the original value types, replace them, or make a decision for each property. Because the key union comes from the source type, adding a property to the source automatically affects the derived type.

Two property modifiers are especially important:

- readonly controls whether a property can be assigned after creation.
- ? controls whether a property may be omitted.

In a homomorphic mapped type, omitting a modifier preserves the corresponding modifier from the source. An explicit +readonly or +? adds a modifier, while -readonly or -? removes one. For example, -readonly [Key in keyof T] makes every visited property writable, while [Key in keyof T]-? makes every property required. These modifiers affect the static contract, not whether an object is frozen or copied at runtime.

### Key remapping: change or filter the keys

TypeScript 4.1+ allows an as clause:

~~~ts
type Getters<Source> = {
  [Key in keyof Source as `get${Capitalize<string & Key>}`]: () => Source[Key];
};
~~~

The original key still controls the lookup of Source[Key], but the as expression controls the output key. string & Key narrows the key to something usable in a string template; it prevents a possible number or symbol key from being passed to Capitalize.

Key remapping can also filter. A mapped key that becomes never is omitted:

~~~ts
type WithoutId<Source> = {
  [Key in keyof Source as Key extends "id" ? never : Key]: Source[Key];
};
~~~

This is useful for deliberate public projections, but a long chain of remapped keys is often a sign that a named domain type would communicate the design better.

### Conditional types: choose between type branches

The form is:

~~~ts
type Result<T> = T extends object ? "object" : "other";
~~~

Read it as: “if T is assignable to Constraint, use IfTrue; otherwise use IfFalse.” This is a type-level decision, similar in shape to JavaScript's condition ? a : b, but it runs while TypeScript calculates types. The true branch can use the fact established by the check. For example, after checking T extends { message: unknown }, T["message"] is safe in that branch.

The check is about assignability. A type with extra properties can still extend a smaller structural type if it has the required members. It is not a runtime check, and it does not make a JavaScript value safe at runtime.

### Distributive conditional types: unions are processed member by member

When the checked side is a naked type parameter, a conditional type distributes over a union:

~~~ts
type ToArray<T> = T extends unknown ? T[] : never;
type NumbersOrStrings = ToArray<number | string>;
~~~

NumbersOrStrings becomes number[] | string[], as if TypeScript evaluated ToArray<number> | ToArray<string>. This behavior is useful for filters and extractors: T extends { id: string } ? T : never keeps only union members that match.

Sometimes the whole union must be judged at once. Wrap both sides in a tuple:

~~~ts
type WholeUnion<T> = [T] extends [string] ? "all strings" : "not all strings";
type MixedResult = WholeUnion<string | number>;
~~~

MixedResult is "not all strings", because the tuple wrapper stops distribution and asks one question about the union as a whole. The tuple is only a type-system technique; it does not mean the runtime value is an array.

### infer: name a part discovered by a conditional check

infer introduces a type variable inside the true branch when TypeScript can match a shape:

~~~ts
type ElementOf<T> = T extends readonly (infer Item)[] ? Item : never;
type ExtractedElement = ElementOf<readonly ["draft", "published"]>;
~~~

Here Item is inferred as the element type, so ExtractedElement is "draft" | "published". infer does not inspect a value at runtime. It asks the compiler to capture the matching piece so the rest of the type expression can reuse it. This is the idea behind built-in utilities such as ReturnType.

### Template literal types: derive string protocols

A template literal type combines string literal types into a new string union:

~~~ts
type EventName<Property extends string> = `${Property}Changed`;
type UserEvent = EventName<"name" | "age">;
~~~

UserEvent is "nameChanged" | "ageChanged". When a template includes unions, TypeScript forms the combinations. Combined with keyof, this can model event names, CSS token names, route fragments, or generated client method names.

The type is most valuable when the string protocol is small, stable, and derived from a source of truth. It cannot validate arbitrary input at runtime. A server response or user-provided string still needs runtime validation before the type can be trusted.

For the official syntax and more examples, read the TypeScript Handbook pages on [mapped types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html), [conditional types](https://www.typescriptlang.org/docs/handbook/2/conditional-types), and [template literal types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html).

## 4. Real Code — See It Working

### Make a readonly model mutable

~~~ts
type LockedProfile = {
  readonly id: string;
  readonly displayName?: string;
};

type MutableProfile<Source> = {
  -readonly [Key in keyof Source]: Source[Key];
};

const editableProfile: MutableProfile<LockedProfile> = {
  id: "u-42",
};

editableProfile.id = "u-43";
// The resulting type has id: string and displayName?: string.
// Only readonly was removed; displayName is still optional.
~~~

If a form also needs every field present, compose the modifiers deliberately:

~~~ts
type RequiredMutable<Source> = {
  -readonly [Key in keyof Source]-?: Source[Key];
};

const completeProfile: RequiredMutable<LockedProfile> = {
  id: "u-42",
  displayName: "Ravi",
};
// The resulting type requires both writable properties.
~~~

### Add null to every field

~~~ts
type Account = {
  id: number;
  email: string;
  lastLogin: Date;
};

type NullableFields<Source> = {
  [Key in keyof Source]: Source[Key] | null;
};

const databaseRow: NullableFields<Account> = {
  id: 7,
  email: null,
  lastLogin: new Date(),
};
// The resulting type is { id: number | null; email: string | null;
// lastLogin: Date | null }. All keys remain required.
~~~

### Extract a promise's resolved type with infer

~~~ts
type AwaitedValue<T> = T extends PromiseLike<infer Value> ? Value : T;

type UserResponse = AwaitedValue<Promise<{ id: string; active: boolean }>>;
const responseShape: UserResponse = { id: "u-42", active: true };
// UserResponse is { id: string; active: boolean }: infer captured the
// type inside PromiseLike, rather than changing the runtime promise.
~~~

### Test a union as a whole, not distributively

~~~ts
type AllObjects<T> = [T] extends [object] ? "yes" : "no";

type ObjectUnion = AllObjects<{ id: string } | { name: string }>;
type MixedUnion = AllObjects<{ id: string } | null>;

const objectAnswer: ObjectUnion = "yes";
const mixedAnswer: MixedUnion = "no";
// ObjectUnion is "yes" because every member is assignable to object.
// MixedUnion is "no" because the tuple wrapper evaluates the union once;
// it does not produce "yes" | "no" for individual members.
~~~

### Derive typed change events from object keys

~~~ts
type ChangeEventName<Source> = `${string & keyof Source}Changed`;

type UserRecord = {
  name: string;
  age: number;
};

type UserChangeEvent = ChangeEventName<UserRecord>;

function logUserChange(event: UserChangeEvent): void {
  console.log(event);
}

logUserChange("nameChanged");
logUserChange("ageChanged");
// UserChangeEvent is "nameChanged" | "ageChanged". A typo such as
// "emailChanged" is rejected because email is not a UserRecord key.
~~~

A more useful event API can connect each event name to the corresponding value type:

~~~ts
type Watcher<Source> = {
  on<Key extends string & keyof Source>(
    event: `${Key}Changed`,
    callback: (nextValue: Source[Key]) => void,
  ): void;
};

declare const userWatcher: Watcher<UserRecord>;

userWatcher.on("ageChanged", (nextAge) => {
  nextAge.toFixed();
});
// For ageChanged, nextAge is number. The key captured before "Changed"
// is reused to index UserRecord, so the callback cannot receive a string.
~~~

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a mapped type?**

A mapped type creates a new object type by iterating over a union of property keys, usually keyof T. For each key, it can preserve T[Key], replace the value type, change modifiers, rename the key, or filter the key out with never. It is the type-level equivalent of applying one consistent transformation to every property, and it keeps the derived contract synchronized when the source type changes.

**Q: How do you remove readonly?**

Use the -readonly mapped modifier: type Mutable<T> = { -readonly [K in keyof T]: T[K] }. The minus is important: leaving the modifier out preserves the source modifier, while +readonly adds it. This changes assignability only; it does not clone, unfreeze, or otherwise change the runtime object. If optionality must also be removed, use -? separately.

**Q: What is a conditional type?**

It is a type-level choice written as T extends U ? Yes : No. If the left type is assignable to the right type, TypeScript selects the first branch; otherwise it selects the second. Conditional types become useful with generics because the result can follow the input type—for example, returning an element type for arrays and leaving non-arrays alone. They are compile-time descriptions, not runtime validation.

**Q: Why are conditional types distributive?**

When a naked type parameter is checked against a union, TypeScript applies the conditional independently to each union member and unions the results. Thus T extends unknown ? T[] : never turns string | number into string[] | number[]. This is useful for filtering and transforming unions. If the decision must consider the union as one value, wrap the checked type—[T] extends [U]—so the type parameter is no longer naked and distribution stops.

**Q: What does infer do?**

infer declares a temporary type variable inside the successful branch of a conditional pattern match. In T extends PromiseLike<infer Value> ? Value : T, TypeScript captures whatever type appears inside PromiseLike and returns it. It is a way to extract structure from a type, not a way to inspect a runtime value. It is especially useful for return types, promise values, tuple members, and function parameters.

**Q: How do you remap keys?**

Put an as clause in the mapped type: { [K in keyof T as NewKey<K>]: T[K] }. NewKey<K> can be a template literal such as `get${Capitalize<string & K>}`. If the expression evaluates to never, that key is removed. Remapping is a good fit for a small, meaningful projection such as getters or event handlers; a complicated chain is usually better expressed as an explicit named type.

**Q: When are template literal types useful?**

Use them when a string's valid shape is a stable protocol derived from other literal types: event names like nameChanged, design-token names, route segments, or generated method names. Combining them with keyof catches drift between a source object and its string API. They do not parse or validate arbitrary runtime strings, and large unions can become difficult for both humans and the compiler, so keep the generated vocabulary bounded.

**Q: How do you keep advanced types maintainable?**

Start with a value-level model and add a type transformation only when it removes real duplication or protects a real boundary. Give non-obvious transformations domain names such as NullableFields or UserChangeEvent, add small compile-time examples, and prefer two simple named helpers over one clever expression. Keep runtime validation at external boundaries. The stopping rule is simple: when the transformation is harder to read than the value code it describes, stop and write a named domain type explicitly.

## 6. The Traps — What Goes Wrong

**Confusing a type transformation with a runtime transformation.** A mapped type does not loop over object keys, remove a property, or make a frozen object mutable. It only changes what assignments the compiler accepts. Use JavaScript object-spread, a real loop, Object.freeze, or a validator when runtime behavior is required.

**Using readonly removal as an immutability workaround.** -readonly can describe a writable view, but it cannot make a read-only API safe to mutate. If the same object is shared, mutation may still violate the owner's assumptions. Copy the data when ownership changes, and use the mapped type only to describe the copy or a deliberate local view.

**Forgetting that ? and | undefined are related but not identical.** An optional property may be omitted, while a required property typed as string | undefined must still be present. -? removes optionality; it is not a general-purpose “remove undefined from every value” operation.

**Expecting a conditional type to validate input.** type SafeId = string does not make a server response safe, and T extends { id: string } does not inspect an object at runtime. Parse or validate unknown data first, then let the validated type flow through the type-level transformations.

**Missing distributivity when filtering a union.** type OnlyWithId<T> = T extends { id: string } ? T : never filters each union member because T is naked. Changing it to [T] extends [{ id: string }] ? T : never asks whether the entire union fits the shape and therefore has different semantics. Choose the tuple wrapper intentionally.

**Assuming infer can infer anything anywhere.** It only captures a type where the surrounding conditional pattern gives TypeScript a position to match. If the pattern does not describe the structure, the false branch is selected or inference is too broad. Keep the pattern small and test the result with an assignment or a compile-time assertion.

**Building an unbounded template-literal vocabulary.** A finite union such as name | age gives useful autocomplete. Plain string gives `\${string}Changed`, which accepts almost any matching string and loses much of that protection. Keep the source key union precise, and avoid generating enormous cross-products of unions.

**Writing a type puzzle when a domain type would be clearer.** A transformation that requires several nested conditionals, remaps, and infer steps may be technically correct but operationally expensive for the next maintainer. Extract named helpers, document the resulting shape, or write the type explicitly. Cleverness is not a design requirement.

## 7. Compare With Related Concepts

**Mapped type vs index signature.** An index signature describes arbitrary keys, such as Record<string, boolean>. A mapped type visits a known key union and can preserve relationships to each original property. Use an index signature for genuinely open dictionaries; use a mapped type when the keys come from a known model.

**Mapped type vs Pick/Omit/Partial/Required.** Those utility types are named, tested mapped-type patterns. Use the built-in utility when its intent matches the job; write a custom mapped type when you need a domain-specific value transformation, modifier combination, or key remapping.

**Conditional type vs runtime if.** A runtime if chooses behavior for an actual value. A conditional type chooses a static type from generic information before the program runs. Use both when needed: runtime code handles reality, and the conditional type describes the relationship between input and output.

**Distributive vs non-distributive conditional type.** A distributive conditional transforms union members independently; a tuple-wrapped conditional evaluates the union as a whole. Use distribution for union filters and member-by-member transforms, and suppress it for “do all members satisfy this?” questions.

**Template literal type vs string validation.** A template literal type gives compile-time checking when the source is a literal or a precise union. It cannot prove the shape of a runtime string from a network request. Use a runtime parser or validator at that boundary, then use the template type for internal APIs.

## 8. 🧠 The Memory Hook — What Sticks

Picture a warehouse worker walking a known shelf list: mapped types change every shelf, conditional types choose a lane, infer writes down the piece it found, and template literals print a new label. Keep the worker's instructions short—when the type recipe is harder to read than the actual inventory, name the domain shape and write it plainly.
