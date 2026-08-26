# TypeScript With React

## 1. Why This Exists — The Problem First

React makes it easy to pass values through a component tree, attach a handler to a DOM node, keep state, and render whatever an API returned. That flexibility is productive until a change crosses a boundary: a caller forgets a required prop, an optional value is used before it exists, an input handler reads the wrong field, a ref points at the wrong element, or a loading screen tries to read data that only exists after success.

JavaScript finds many of these mistakes only after a user takes the path that exercises them. TypeScript moves a useful part of the conversation earlier. A component declares the values it accepts, a handler declares the event it understands, and a state model declares which fields are available together. The compiler then checks the callers and the implementation against those contracts.

The important boundary is not “where can I add a type annotation?” It is “where does an assumption enter or leave this component?” Props, children, DOM events, refs, reducer actions, context values, hook inputs and outputs, generic components, and external data are all boundaries where a precise contract pays off.

TypeScript does not make external data trustworthy. Types are removed when the program runs, so JSON from a server is still unknown until runtime code validates it. A strong React design uses compile-time contracts for code it controls and runtime validation at the edge where data arrives.

## 2. The Analogy — Make It Obvious

Imagine a busy restaurant. TypeScript is the order ticket and the pass window:

- A component’s props are the order accepted by the kitchen.
- Default props are the kitchen’s fallback recipe when an optional instruction is omitted.
- `children` is the food placed on the plate; `ReactNode` allows many edible things, while a stricter element type allows only a specified plating arrangement.
- An event type is the label on a waiter’s tray: it says which kind of table and interaction the handler is serving.
- A ref is a claim ticket for one physical appliance, such as a particular input.
- A discriminated union is a menu that prevents an impossible order, such as “loading with a confirmed invoice total.”
- Runtime API validation is checking the delivery when it arrives; the ticket written earlier cannot inspect an untrusted box.

The useful question at every boundary is: “What is guaranteed here, and who is responsible for proving it?” Inference lets TypeScript fill in guarantees it can see. Narrowing lets your code prove a more specific case after a runtime check.

~~~mermaid
flowchart LR
  Caller["Component caller"] --> Props["Prop contract"]
  Props --> Component["React component"]
  Component --> Events["Typed DOM/component events"]
  Component --> State["Narrowed state"]
  API["Untrusted JSON"] --> Validate["Runtime validation"]
  Validate --> Data["Trusted app data"]
  Data --> Component
~~~

## 3. How It Actually Works — The Full Explanation

**Inference comes before annotation.** For a primitive `const`, TypeScript preserves the literal type: `const count = 0` is inferred as `0`, while `let count = 0` widens to `number` because the variable may be reassigned. Object and array literals are different: `const settings = { count: 0 }` has a mutable `count: number` property, while `const settings = { count: 0 } as const` recursively preserves literal types and makes the property readonly (`readonly count: 0`). TypeScript also infers the return type of a function from its returned expression. An annotation is most useful where a value crosses a boundary or where inference would be too broad. Over-annotating every local makes code noisy; under-typing a boundary moves uncertainty downstream.

**Props are an API.** A type alias or interface describes the public contract. Required values should be required. Optional values use `?`, and destructuring can provide a default without changing the caller’s contract. A defaulted prop is still optional to callers, but inside the function it has the non-optional type.

**Children need the right width.** `ReactNode` covers text, numbers, elements, fragments, portals, booleans and `null`—the values React can render or ignore. It is the normal type for flexible composition. `ReactElement` describes one React element object and is appropriate when a component truly requires one element, such as a slot that clones or inspects it. `JSX.Element` is commonly the result of JSX in a configured project; it is narrower than normal renderable content and is rarely the best type for `children`.

**Events should follow the element and the operation.** For an input value, `React.ChangeEvent<HTMLInputElement>` gives `currentTarget.value` the right type. For a button, `React.MouseEvent<HTMLButtonElement>` describes the element and mouse event. `currentTarget` is the element whose handler was registered on; `target` is the deepest element that originated the event and may require narrowing. Inline handlers often infer the best type, so extracting a handler is not a reason to guess.

**Refs describe a mutable escape hatch.** `useRef<HTMLInputElement>(null)` creates a ref whose current value is either the input or `null` before attachment and after unmount. Check for `null` before calling a DOM method. A component that forwards a ref should expose the actual DOM or imperative handle it promises, not an unrelated internal node. Callback refs are useful when attachment itself is the event of interest, but the callback’s parameter still needs the correct element type.

**Reducers make transitions explicit.** Give the state and action separate types. A `switch` on a literal action field narrows the action. An `assertNever` default makes adding an action a compiler-visible task. The reducer should return the same state shape on every branch; it should not silently accept arbitrary strings.

**Context needs a safe access boundary.** `createContext<T | null>(null)` reflects that no provider exists by default. Export a `useAppContext` hook that throws when the value is missing, then consumers receive `T` rather than carrying `null` checks through the entire tree. The provider still has to be present at runtime; the hook only turns an invalid tree into a clear failure.

**Custom hooks are typed functions with a React lifecycle.** Type inputs as the narrowest useful contract and return an object when several named values are involved. A hook can derive values from state, call event handlers, use a query library, or subscribe through an external-store API. It should not expose an implementation detail just to make the caller compile. A hook call does not create shared state by itself; sharing comes from context or an external store.

**Generics preserve relationships.** A generic hook such as `useSelection<T>` can return the same `T` that it accepts. A generic table can connect each row’s `T` to a column accessor. A generic is worthwhile when callers need the relationship preserved; it is not a badge of sophistication. Prefer a concrete type when there is no meaningful variation.

**Discriminated unions model valid states.** A shared literal field such as `status` is the discriminator. In `if (state.status === "success")`, TypeScript narrows the state to the success member, so `data` is available. In the error branch, `error` is available. `never` on mutually exclusive props prevents callers from supplying combinations that the UI cannot interpret.

**Compile time and runtime are different boundaries.** `response.json()` returns data whose shape is controlled by the server, not by a TypeScript annotation. Writing `as User` tells the compiler to trust the value; it does not inspect the value. Parse the unknown payload with a runtime schema or explicit validator, handle failure, and only then expose a typed result to React. This is particularly important for authentication, money, permissions, feature flags, and API version changes.

## 4. Real Code — See It Working

Assumptions: React 18 or newer, TypeScript with JSX enabled, and the automatic JSX transform or an equivalent React import setup. These examples are intended for a strict TypeScript project (`strict: true`). They use event handlers and derivation for local behavior; there are no direct `useEffect` calls.

Here is a reusable input boundary with optional props, default values, renderable children, a correctly typed event, a ref, and validation state:

~~~tsx
import { forwardRef, type ChangeEvent, type ReactNode } from "react";

type TextFieldProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  children?: ReactNode;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      value,
      onValueChange,
      placeholder = "",
      disabled = false,
      error,
      children,
    },
    ref,
  ) {
    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      onValueChange(event.currentTarget.value);
    }

    return (
      <label>
        <span>{label}</span>
        <input
          ref={ref}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error !== undefined}
          aria-describedby={error ? `${label}-error` : undefined}
          onChange={handleChange}
        />
        {children}
        {error && <span id={`${label}-error`} role="alert">{error}</span>}
      </label>
    );
  },
);
~~~

`forwardRef<HTMLInputElement, TextFieldProps>` connects the public ref to the actual input. The explicit `children?: ReactNode` field in `TextFieldProps` makes children part of this component’s public contract. The component does not need a `React.FC`; an ordinary function or `forwardRef` call keeps the props boundary direct, and React 18+ typings do not add `children` implicitly through `React.FC`. The parent can use `useRef<HTMLInputElement>(null)` and focus the field from an event handler or another explicitly justified browser integration.

An event type can often be inferred when the handler is inline. Extracting it is useful when the handler is reused or its boundary is part of the API:

~~~tsx
import type { ChangeEvent, FormEvent } from "react";

type SearchFormProps = {
  onSubmitSearch: (query: string) => void;
};

export function SearchForm({ onSubmitSearch }: SearchFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = form.get("query");
    if (typeof query === "string" && query.trim()) {
      onSubmitSearch(query.trim());
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    // currentTarget is the input on which this handler is registered.
    console.log(event.currentTarget.value);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="query" onChange={handleInput} />
      <button type="submit">Search</button>
    </form>
  );
}
~~~

The `typeof query === "string"` check narrows `FormDataEntryValue` from `string | File` to `string`. That is narrowing: a runtime check changes what TypeScript permits in the branch. It is different from a type assertion, which only overrides the compiler.

This reducer makes every UI transition visible and exhaustive:

~~~tsx
type User = { id: string; name: string };

type UserState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; users: User[] }
  | { status: "error"; message: string };

type UserAction =
  | { type: "load" }
  | { type: "resolve"; users: User[] }
  | { type: "reject"; message: string }
  | { type: "reset" };

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

function userReducer(state: UserState, action: UserAction): UserState {
  switch (action.type) {
    case "load":
      return { status: "loading" };
    case "resolve":
      return { status: "success", users: action.users };
    case "reject":
      return { status: "error", message: action.message };
    case "reset":
      return { status: "idle" };
    default:
      return assertNever(action);
  }
}

export function UserList({ state }: { state: UserState }) {
  if (state.status === "loading") return <p>Loading…</p>;
  if (state.status === "error") return <p role="alert">{state.message}</p>;
  if (state.status === "idle") return <p>Choose a user list.</p>;

  return <ul>{state.users.map((user) => <li key={user.id}>{user.name}</li>)}</ul>;
}
~~~

The `status` check narrows the union. There is no `users?` field that can be absent in one render and present in another; the state itself says whether users exist. If a new action is added and the switch is not updated, `assertNever(action)` becomes a type error.

Context can expose a non-null value to consumers while preserving the missing-provider failure:

~~~tsx
import { createContext, useContext, type ReactNode } from "react";

type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  value,
  children,
}: {
  value: ThemeContextValue;
  children: ReactNode;
}) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return value;
}
~~~

The hook is the boundary that narrows `ThemeContextValue | null` to `ThemeContextValue`. Callers do not need defensive null checks after the provider contract has been enforced.

Generics preserve a value relationship in a custom hook and a component:

~~~tsx
import { useState } from "react";

export function useSelection<T>(initial: T | null) {
  const [selected, setSelected] = useState<T | null>(initial);
  return { selected, select: setSelected, clear: () => setSelected(null) };
}

type SelectProps<T> = {
  options: readonly T[];
  getKey: (option: T) => string;
  getLabel: (option: T) => string;
  onSelect: (option: T) => void;
};

export function Select<T>({
  options,
  getKey,
  getLabel,
  onSelect,
}: SelectProps<T>) {
  return (
    <ul>
      {options.map((option) => (
        <li key={getKey(option)}>
          <button onClick={() => onSelect(option)}>{getLabel(option)}</button>
        </li>
      ))}
    </ul>
  );
}
~~~

For `Select<User>`, the option passed to both label and selection callbacks is the same `User` type. TypeScript can often infer `T` from `options`, `getKey`, and `onSelect`; an explicit type argument is useful when inference has too little information.

Finally, validate external data before it becomes a prop. This small validator is deliberately explicit and has no dependency on a particular schema library:

~~~tsx
type Product = { id: string; name: string; priceCents: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseProduct(value: unknown): Product {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.priceCents !== "number"
  ) {
    throw new Error("Invalid product response");
  }
  return { id: value.id, name: value.name, priceCents: value.priceCents };
}

async function getProduct(id: string): Promise<Product> {
  const response = await fetch(`/api/products/${id}`);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const payload: unknown = await response.json();
  return parseProduct(payload);
}
~~~

The annotation `payload: unknown` forces the boundary to prove the shape. Once `parseProduct` returns, React code receives `Product`. In production, a library such as Zod, Valibot, or ArkType can make this validation more composable, but the rule is unchanged: a compile-time type assertion is not runtime validation.

## 5. The Interview Questions — All of Them, Done Properly

**How do you type a component’s props?** Define a named object type for the public contract and use it as the function parameter. Keep required values required, mark truly optional values with `?`, and use a destructuring default for a fallback. Type callbacks by their inputs and outputs, for example `(value: string) => void`, so callers cannot silently pass the wrong value.

**Should you use `interface` or `type`?** Both can describe object props. `type` is convenient for unions, intersections, and aliases; `interface` supports declaration merging and extension. Choose the convention that fits the codebase. The important choice is the shape of the contract, not the keyword.

**What is the difference between `ReactNode`, `ReactElement`, and `JSX.Element`?** `ReactNode` is broad renderable content and is the normal `children` type. `ReactElement` is one React element object and is appropriate when a component needs to inspect or clone one element. `JSX.Element` is the JSX expression result in the configured JSX namespace and is usually too narrow for general children. Type the requirement, not the implementation detail.

**Do you need `React.FC`?** No. A function with a props parameter is usually clearer. `React.FC` can be useful when a project deliberately wants that convention, but it does not replace explicit prop design and should not be used merely to obtain `children`.

**How do you type optional and default props?** Write `size?: "sm" | "lg"` in the public type and destructure as `{ size = "sm" }`. Callers may omit `size`; inside the function, the default guarantees a valid literal. Do not mark a prop optional if the component cannot operate without it.

**How do you type a DOM event?** Use the React event generic for the actual element and event: `ChangeEvent<HTMLInputElement>` for an input change, `FormEvent<HTMLFormElement>` for form submission, or `MouseEvent<HTMLButtonElement>` for a button click. Inline handlers usually infer these types. Prefer `currentTarget` when you need the element that owns the handler.

**Why can `target` be troublesome?** The event target is the deepest originating node and may be a child element. `currentTarget` is tied to the registered element, so its type matches the handler’s generic. If you truly need `target`, narrow it before reading element-specific properties.

**How do you type refs?** For a DOM ref, use `useRef<HTMLInputElement>(null)` and handle the initial `null`. For a forwarded ref, pass the element type and props type to `forwardRef`. For an imperative API, use `useImperativeHandle` with a named handle type and expose the smallest promised surface.

**How do you type a reducer exhaustively?** Give state and actions separate discriminated unions, switch on the action’s literal `type`, and route the default branch to `assertNever`. The compiler then reports an unhandled action when the union grows.

**How should context be typed?** Use `createContext<Value | null>(null)` when the provider is not guaranteed by construction. Wrap `useContext` in a hook that throws when the value is `null`; its return type is then `Value`. This makes a missing provider fail clearly while keeping normal consumers simple.

**What makes a custom hook’s type useful?** Its input and return types should describe behavior, not implementation. Return named values and actions when there are several, preserve relationships with generics when needed, and expose errors as a deliberate union or type rather than `any`. A hook does not share state merely because its function is shared.

**When should you use a generic?** Use one when a caller’s type must be preserved across inputs and outputs, such as `useSelection<T>` or `Select<T>`. If the component only supports one domain model, a concrete type is easier to read. A generic that erases useful constraints is not type safety.

**How do discriminated unions prevent impossible UI states?** Make valid states separate members with a shared literal discriminator: idle, loading, success with data, and error with a message. Narrowing on the discriminator makes only the fields for that state available. `never` props can similarly make variants mutually exclusive.

**What is inference, and why does it matter?** Inference is TypeScript deriving a type from an initializer, parameter context, or return expression. It keeps local code concise and catches changes automatically. Add explicit types at boundaries or when inference widens a value too much; do not annotate every expression by reflex.

**What is type narrowing?** Narrowing is the compiler refining a broad type after a runtime check such as `typeof value === "string"`, `value !== null`, an `in` check, or a discriminant comparison. It is evidence-based. `as SomeType` is an assertion and supplies no runtime evidence.

**Why is `unknown` safer than `any`?** `unknown` accepts an external value but requires a check before property access or use. `any` disables those checks and allows mistakes to spread. Use `unknown` for parsed JSON, caught errors, and genuinely untrusted values, then narrow or validate.

**How do you type an API response?** Keep the response boundary as `unknown`, check HTTP success, validate the decoded payload with a schema or explicit parser, and return a domain type such as `Promise<Product>`. A cast like `response.json() as Promise<Product>` only changes the compiler’s belief; it does not detect malformed or version-skewed data.

**How do TypeScript types relate to a query library?** Type the query function’s validated return value and let the library carry that type through `data`, loading, and error states. Keep the query key and runtime validation policy explicit. A generic query result does not validate JSON by itself.

**What can TypeScript catch, and what can it not catch?** It catches many shape, property, callback, and impossible-branch errors before build time. It cannot prove a server response is honest, a reducer has the desired business behavior, a button is accessible, or a race-free user flow is correct. Runtime validation, tests, and user-flow checks remain necessary.

## 6. The Traps — What Goes Wrong

- Using `any` at a prop or API boundary because the first version is inconvenient. The missing contract then infects every consumer.
- Writing `as User` after `response.json()` and calling it validation. It is only a compiler assertion.
- Typing every `children` prop as `ReactElement` when text, fragments, or conditional `null` are valid.
- Using `JSX.Element` as a universal return or children type without checking the actual requirement.
- Guessing an event as `Event` or `MouseEvent` and losing the element-specific `currentTarget` type.
- Reading `event.target.value` without narrowing the target; `target` is not the same as the registered element.
- Forgetting that a DOM ref is `null` before attachment and after unmount.
- Letting a reducer action be `{ type: string }`, which prevents useful discriminated narrowing and exhaustive checking.
- Making context globally nullable so every consumer is forced to repeat a check instead of enforcing the provider boundary once.
- Treating a custom hook as a singleton. Separate calls have separate local hook state unless a context or store owns the shared value.
- Adding a generic that is not preserving a relationship. Extra type parameters make APIs harder to use without adding safety.
- Representing loading, success, and error as independent booleans. Combinations such as `isLoading && data` become possible even when the UI cannot render them coherently.
- Over-annotating locals and hiding useful inference, then changing an annotation instead of fixing the underlying contract.
- Duplicating API or domain types manually in multiple places. Copies drift when payloads or business rules change; derive types from a runtime schema or API client where possible, or keep one boundary type and reuse it.
- Assuming a successful TypeScript build proves runtime API compatibility, accessibility, or business correctness.
- Calling hooks from event handlers or conditional branches. Hook calls belong at the top level of a component or custom hook; user actions belong in event handlers.

## 7. Compare With Related Concepts

| Concept | What it guarantees | What it does not guarantee | Best boundary |
| --- | --- | --- | --- |
| TypeScript type | Compile-time shape and relationships | Runtime truth or behavior | Props, state, events, refs, hook APIs |
| Runtime schema validation | A checked value shape at runtime | Correct business meaning beyond its rules | API, storage, URL, and user-controlled data |
| PropTypes | Runtime prop validation, useful for untyped consumers | Compile-time checking of TypeScript source | Published component boundary |
| `ReactNode` | Broad renderable children | Exactly one inspectable element | Flexible composition |
| `ReactElement` | One React element object | Text or arbitrary renderable content | Slot/cloning APIs that require one element |
| Discriminated union | Valid combinations represented in code | Server response authenticity | UI state and variant props |
| `unknown` | Untrusted value cannot be used without proof | Automatic parsing | JSON and caught external errors |
| `any` | No compiler friction | Almost all useful safety | Avoid at boundaries |
| Context | Descendant access to one provided value | Automatic global singleton semantics | Shared client configuration or state |

TypeScript and runtime validation complement each other: the first protects code-to-code boundaries during development, while the second protects the program from values it does not control. A reducer and a state machine can both model transitions, but a reducer is the React update mechanism; the discriminated union is the contract that makes its states explicit.

`PropTypes` validate props at runtime and remain useful when untyped consumers call a component; TypeScript checks the source at compile time. TypeScript types disappear at runtime, so runtime validation is still needed for untrusted data.

`useState` and a reducer are both client-state tools. `useState` suits a small independent value; a reducer suits related transitions with named actions. A query library and a typed fetch function are also different layers: the fetch function validates one response, while the library manages server-state caching, freshness, and request status.

## 8. 🧠 The Memory Hook — What Sticks

At every React boundary, ask four questions:

**What enters?** Type props, children, event elements, hook arguments, and external payloads.

**What is guaranteed?** Let inference do obvious local work, narrow unions with evidence, and validate `unknown` before trusting it.

**What can coexist?** Model valid UI states and component variants as discriminated unions so impossible combinations cannot compile.

**Who owns the escape hatch?** A ref owns access to a DOM node, context owns a shared descendant value, a reducer owns transitions, and a query/data layer owns remote data policy.

The interview-sized summary is: **types describe code you control; validators prove data you do not; narrowing connects runtime evidence to safe JSX.**

When designing a reusable input, start with the prop contract, choose `ReactNode` only if children are flexible, type the actual DOM event, forward the precise ref, represent validation as an explicit state, and validate any API result before passing it into the component.
