# Classes, Modules, and Declarations

## 1. Why This Exists — The Problem First

A payment service can have reasonable classes and still fail after a refactor: a subclass forgets a required method, a caller reaches into an internal field, or a type-only import becomes a runtime import and creates a circular dependency. Another failure appears when an application imports a JavaScript package with no type information: the code runs, but the compiler cannot describe its exports. Developers then reach for `any` or `declare module "x"` and hide a broken import instead of fixing it.

Classes, modules, and declaration files solve different parts of this mess. Classes organize runtime behavior and give TypeScript a type for instances and constructors. Modules define file-level boundaries for JavaScript values. Declarations describe those values to the compiler without necessarily emitting JavaScript. The key is knowing which layer a line belongs to and what it can—and cannot—guarantee.

## 2. The Analogy — Make It Obvious

Think of a company with workshops, doors, and a public catalog.

- A class is a workshop blueprint plus the machines that run when a product is made. An instance is one product. Static members live in the workshop itself, not in one product. `private`, `protected`, and `public` are rules about which workers may reach a machine.
- A module is a workshop with a locked door. Only explicitly exported tools can leave, and an import requests one of those tools. The module loader handles actual tools at runtime; TypeScript checks that the catalog and request agree.
- A declaration file (`.d.ts`) is the catalog. It lists the shape of products and tools, but it is not a workshop and manufactures nothing. An ambient declaration says, “assume this named workshop exists elsewhere.”

This maps directly to the boundary: a class and value export can produce or affect JavaScript, while an `interface` or `.d.ts` usually disappears after type-checking. A declaration can explain a runtime value, but it cannot create that value.

## 3. How It Actually Works — The Full Explanation

### Classes have two related types

When TypeScript sees `class Invoice`, it reasons about two sides:

1. The **instance side** describes values from `new Invoice()`: instance fields, instance methods, and inherited public members.
2. The **static side** describes the `Invoice` value itself: the constructor and static fields and methods.

That is why `Invoice` and `typeof Invoice` are not interchangeable. A function accepting `Invoice` expects an instance. One accepting `typeof Invoice` expects a constructable class value. `implements` checks only the instance side; it does not automatically check static members.

Class fields are instance fields unless marked `static`. An instance initializer runs for each construction; a static initializer runs when the class definition is evaluated. TypeScript types these fields, but JavaScript owns their runtime storage and behavior.

### Visibility has compile-time and runtime forms

`public` is the default. `protected` is usable in the declaring class and subclasses. `private` is usable only in the declaring class. TypeScript modifiers reject invalid typed source, but they do not all produce the same JavaScript boundary.

TypeScript's `private` is normally erased and emits an ordinary property. ECMAScript `#secret` is runtime-private: outside code cannot access it and it is not an ordinary property key. Use `#` when runtime encapsulation is an invariant; use TypeScript `private` when the goal is a compile-time API.

Two classes with private or protected members are compatible only when those members originate in the same class declaration. Ordinary object types remain structural, but class-private state adds a nominal-like identity check.

### `implements` checks a class; it does not convert an object

`implements` is a compile-time check against the instance side of an interface or class. It does not add methods, generate delegation, change the prototype, validate constructor arguments, or narrow a value after construction. A missing method is reported; a dishonest method body is not runtime-checked.

### Abstract classes share behavior

An `abstract` class can contain real fields and methods plus abstract members that subclasses must provide. Typed code cannot construct it directly. At runtime, `abstract` is erased; the emitted JavaScript class is still a class. Use an abstract class when subclasses share state or behavior; use an interface for a contract without required implementation. A class may implement several interfaces but extends only one class.

### Modules have compile-time and runtime boundaries

An ES module's imports and exports are its explicit public API. Imports are live bindings, and importing a module executes its top-level code according to the loader. CommonJS uses `require()` and `module.exports`; ESM uses `import` and `export`. They are different module systems, not universally interchangeable spellings.

Node.js uses package metadata such as `package.json` `type`, extensions, and the selected loader. TypeScript's `module` setting controls emitted module form; the runtime still needs to interpret that output. Projects may use `"module": "NodeNext"` with matching Node metadata, or `"moduleResolution": "Bundler"` when a bundler owns resolution. There is no universal setup.

`moduleResolution` tells TypeScript how to find declarations and source modules. It does not install packages, rewrite a missing path, or guarantee Node resolves the same specifier. An import can fail although a file exists because extensions differ, package `exports` hides the subpath, ESM/CJS entry points differ, casing differs, or runtime output is `.js` while the source is only `.ts`. TypeScript may also find a `.d.ts` while the runtime package is missing.

Use `import type` and `export type` for names used only by the checker; they are erased and create no runtime dependency. Use a normal import for a class you instantiate, a function you call, or a value you read. `verbatimModuleSyntax` makes this boundary especially explicit.

### Declarations describe; implementations execute

Interfaces, type aliases, type-only imports/exports, and most `.d.ts` declarations provide static information and emit no JavaScript. A declaration file describes JavaScript, generated code, globals, or external modules; it does not implement them.

Declaration merging combines compatible declarations with the same name into one type-level result. Interfaces merge members, and supported namespace/class/function/enum combinations can merge. This is not runtime composition: merging does not add properties or methods to an object.

Ambient declarations use `declare` to describe an implementation outside the file. `@types` packages provide published declarations for JavaScript dependencies. A local declaration is appropriate when an actual internal or third-party module lacks types. `declare module "x"` is not validation: it does not install `x`, inspect its exports, check its spelling, or make its runtime loader resolve it. Keep declarations narrow and verify the runtime separately.

## 4. Real Code — See It Working

### Instance/static sides, visibility, and `implements`

```ts
interface Billable { totalCents(): number; }

class Invoice implements Billable {
  static readonly currency = "USD";
  private readonly id = crypto.randomUUID(); // compile-time private
  #auditToken = crypto.randomUUID();         // runtime-private

  constructor(public readonly customer: string, private cents: number) {}
  totalCents(): number { return this.cents; }
  protected markPaid(): void { this.cents = 0; }
  auditLabel(): string { return `${this.id}:${this.#auditToken}`; }
}

const invoice = new Invoice("Asha", 2500);
invoice.totalCents();
Invoice.currency;
// invoice.cents;       // Error: private
// invoice.markPaid();  // Error: protected
```

`Invoice.currency` belongs to the static side; `invoice.totalCents()` belongs to the instance side. `implements Billable` catches a missing method but does not create one.

```ts
type InvoiceConstructor = typeof Invoice;

function makeInvoice(Constructor: InvoiceConstructor): Invoice {
  return new Constructor("Mina", 0);
}

const created = makeInvoice(Invoice);
// makeInvoice(invoice); // Error: an instance is not constructable.
```

When a factory needs a static contract, write one:

```ts
interface HasKind { kind: string; }
interface HasKindConstructor {
  new (kind: string): HasKind;
  readonly category: string;
}
```

### Abstract classes

```ts
abstract class Message {
  constructor(public readonly id: string) {}
  envelope(): string { return `[${this.id}] ${this.body()}`; }
  protected abstract body(): string;
}

class TextMessage extends Message {
  constructor(id: string, private readonly text: string) { super(id); }
  protected body(): string { return this.text; }
}

new TextMessage("m-1", "hello").envelope(); // "[m-1] hello"
// new Message("m-2"); // Error in checked TypeScript
```

### Type-only imports and exports

```ts
// models.ts
export interface User { id: string; }
export class UserRepository {
  find(id: string): User { return { id }; }
}
```

```ts
// user-service.ts
import { UserRepository } from "./models.js"; // emitted value import
import type { User } from "./models.js";      // erased type import

export type UserLoader = (id: string) => User;
export function createLoader(repository: UserRepository): UserLoader {
  return (id) => repository.find(id);
}
```

The `.js` specifier suits a Node-style ESM project whose source emits `.js`; a bundler can use different rules. Check the project's actual module settings.

### A local `.d.ts` for an untyped module

Suppose the real runtime package `slugger-kit` exists but ships no types:

```ts
// types/slugger-kit.d.ts
declare module "slugger-kit" {
  export interface SlugOptions {
    lowercase?: boolean;
    separator?: string;
  }
  export function slugify(input: string, options?: SlugOptions): string;
}
```

```ts
import { slugify } from "slugger-kit";
const path = slugify("Order 42", { lowercase: true }); // string
```

The declaration improves editor and compiler checks. It does not install or implement `slugger-kit); the runtime import must still resolve.

### Declaration merging

```ts
interface RequestContext { requestId: string; }
interface RequestContext { userId?: string; }
const context: RequestContext = { requestId: "req-7" };
```

The interfaces merge for the checker. Nothing is added to `context` at runtime. A library augmentation similarly needs an existing library and real runtime behavior.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does `implements` guarantee?**

Only that the class's instance side is assignable to the stated contract at compile time. It does not inherit implementation, add fields, affect the prototype, validate constructor arguments, check static members, or survive in emitted JavaScript. Describe a constructor contract separately with `typeof C` or a construct signature.

**Q: How are classes structurally typed?**

Public instance members are compared by shape, so unrelated classes with compatible public methods can satisfy the same interface. Private and protected members must originate in the same class declaration, preventing unrelated classes with coincidental public APIs from being confused when hidden state matters. A class value and an instance are different shapes: compare `typeof C` with `C` deliberately.

**Q: What is the difference between ESM and CommonJS?**

ESM uses statically analyzable `import`/`export` bindings and live bindings. CommonJS loads synchronously through `require()` and exposes the mutable `module.exports` value. Node.js, TypeScript, and bundlers each have settings that affect interpretation and emission, so the correct answer depends on package `type`, extensions, `module`, `moduleResolution`, and the actual loader.

**Q: Why can an import fail even when the file exists?**

The resolver may use a different base directory or extension rules, a package `exports` map may hide the subpath, the ESM/CJS entry point may be incompatible, casing may differ, or runtime output may be `.js` while the source is only `.ts`. TypeScript can also find a `.d.ts` description even when the runtime package is absent. Check both TypeScript's resolution trace and runtime resolution.

**Q: What is a declaration file?**

A `.d.ts` file contains types for code implemented elsewhere: JavaScript libraries, generated code, globals, or module exports. It is consumed by the checker and normally emits no JavaScript. It is a contract, not evidence; a false declaration can compile and still fail at runtime.

**Q: What is declaration merging?**

It is TypeScript combining separate compatible declarations with the same mergeable name into one type-level declaration. Interface members merge, and certain namespace/class/function/enum combinations merge under defined rules. It does not concatenate runtime objects or add missing methods; the implementation must already satisfy the merged type.

**Q: When should you write an ambient module declaration?**

When a real external module exists but has no usable declarations, such as an internal JavaScript package or a build-tool-supported asset import. Keep it narrow, include it in `tsconfig`, and verify the runtime import separately. Prefer bundled types or a maintained `@types` package when available.

**Q: Why is `declare module "x"` not validation?**

`declare` changes what the compiler assumes; it does not look up or execute the module. It cannot prove that `x` is installed, that exports match, or that a loader resolves the specifier. Runtime loading, integration tests, and accurate package metadata provide that evidence.

**Q: What is the difference between an instance member and a static member?**

An instance member exists on each object created by the class, such as `invoice.totalCents()`. A static member is on the class value, such as `Invoice.currency`. `implements` checks instance members, not static members. APIs receiving classes should type the static side.

**Q: When should you use an interface, abstract class, or declaration file?**

Use an interface for a contract without required runtime implementation. Use an abstract class when subclasses share emitted behavior or state. Use a declaration file when implementation exists elsewhere and needs a static description. Interfaces and declarations create no behavior; an abstract class does.

## 6. The Traps — What Goes Wrong

### Treating `implements` as inheritance

```ts
interface Persistable { save(): void; }
class Draft implements Persistable {
  // Error: save is missing. The interface did not provide it.
}
```

Use `extends` for inherited class implementation, write the method, or delegate to a dependency. `implements` is a test at the class boundary, not code generation.

### Checking the wrong side of a class

`class Factory implements HasCreate` checks whether instances have `create`; it does not check whether `Factory.create` exists. If a registry stores constructors, type the constructor value. This is why “the class implements the interface” does not prove a static factory call works.

### Assuming TypeScript `private` is security

TypeScript `private` normally emits an ordinary property. Do not put secrets in it and assume JavaScript cannot read them. Use ECMAScript `#private` for runtime encapsulation, and protect secrets at the process or network boundary as well.

### Assuming `abstract` survives runtime

`abstract` prevents `new Base()` in checked source but is erased from emitted JavaScript. A JavaScript caller or `any` can bypass that static restriction. Add a runtime constructor guard only if runtime prevention is actually required.

### Importing a type as a value

```ts
import { User } from "./models.js"; // wrong if User is only an interface
function label(user: User): string { return user.id; }
```

Write `import type { User }` when the name is used only in annotations. Conversely, do not use `import type` for a class you instantiate. A type-only export cannot be a runtime export.

### Believing a path alias changes runtime paths

`paths` can teach TypeScript that `@/models` points to source, but it does not teach Node.js how to load that alias from emitted JavaScript. A bundler or matching Node configuration must own the same alias. Editor resolution is not runtime proof.

### Using a catch-all ambient declaration

```ts
declare module "*" {
  const value: any;
  export default value;
}
```

This can hide misspelled packages and unsupported imports across the project. Declare the specific module and exports. A narrow declaration preserves alarms; a catch-all `any` removes them.

### Assuming declaration merging patches JavaScript

If interfaces merge a `checkoutCompleted` event, no event is registered and no property is added to an object. The declaration must describe behavior the library really supports. Test the runtime registration alongside the type augmentation.

## 7. Compare With Related Concepts

| Concept | Key difference | Use it when |
| --- | --- | --- |
| `implements` vs `extends` | Checks a contract vs inherits class behavior/state. | Check an independent class or reuse a base implementation. |
| Instance vs static side | `C` describes instances; `typeof C` describes constructor/static members. | Type values passed to `new` or class factories. |
| TS `private` vs `#private` | Compile-time restriction vs JavaScript runtime enforcement. | Choose compiler guidance or actual encapsulation. |
| Interface vs abstract class | No runtime implementation vs shared emitted behavior/state. | Prefer flexible contracts or a real shared base. |
| ESM vs CommonJS | Different binding and loader semantics. | Match the module form to the actual runtime. |
| `import type` vs `import` | Erased declaration vs possible runtime dependency. | Use the former for annotations, latter for execution. |
| `.d.ts` vs `.ts` | External description vs possible emitted implementation. | Type JavaScript/generated code or write implementation. |
| Declaration vs object merging | Compiler combination vs runtime mutation. | Augment types or change values, respectively. |
| `@types` vs local declaration | Published package vs project-owned description. | Prefer maintained types; write local types for missing/internal APIs. |

The shortest rule is: first decide whether you are describing a value or running a value. Then name the boundary—instance, constructor, module export, or external package. Most confusion here comes from crossing one of those boundaries silently.

## 8. 🧠 The Memory Hook — What Sticks

The class is the workshop, the instance is the product, the module is the locked door, and the `.d.ts` file is only the catalog. TypeScript can check that the catalog matches code you wrote, but only the runtime can open the door and prove the workshop and product are really there.

Official references: the [TypeScript handbook on classes](https://www.typescriptlang.org/docs/handbook/2/classes.html), [modules](https://www.typescriptlang.org/docs/handbook/2/modules.html), [declaration files](https://www.typescriptlang.org/docs/handbook/2/type-declarations.html), [declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html), and [module resolution](https://www.typescriptlang.org/docs/handbook/modules/reference.html).
