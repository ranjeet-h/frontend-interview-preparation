# `useContext`: Sharing Data Through a React Subtree

## 1. Why This Exists — The Problem First

React props are explicit and local: a parent chooses a value and passes it to a direct child. That is usually the best default. The problem appears when a value belongs to a whole subtree, but the component that owns the value is far above the component that needs it.

Imagine an authenticated dashboard. `App` owns the session, `Shell` renders the page frame, `Sidebar` renders navigation, `NavigationGroup` renders links, and `UserMenu` finally needs the current user. Passing `user` and `logout` through every intermediate component is prop drilling. Those components now expose props that are not part of their own responsibilities. A layout refactor must change unrelated function signatures, and it becomes unclear which component actually owns the data.

Context solves the transport problem: a provider makes a value available to descendants, and a consumer reads it without intermediate components forwarding it. It does not solve ownership, persistence, mutation, caching, authorization, or server synchronization. Those are still state-management and application-architecture decisions.

Context is a tree-scoped dependency-injection mechanism. A theme, locale, authenticated session, router object, form controller, or compound-component state can be ambient within one subtree. “Ambient” does not mean global: two separate provider subtrees can hold different values, and a component can receive a different value after moving to another branch.

The important cost is broadcast granularity. A consumer subscribes to the context as a whole. If the provider value changes identity, every consumer of that context in its descendant subtree becomes eligible to render, even when a consumer only uses one property. That is why context is a good escape hatch for deep, cross-cutting dependencies and a poor default for every changing piece of application state.

## 2. The Analogy — Make It Obvious

Think of props as a courier carrying a package through an office. Each desk must accept the package and hand it to the next desk, even when those desks do not use its contents. This is explicit and traceable, but inconvenient for a package that must cross many unrelated desks.

Context is a building access system. A provider programs a badge rule for one part of the building. A component asks the access system for the rule at its current location. The floors in between do not carry the badge or know its contents.

The access rule has two boundaries:

- **Scope:** the rule applies only below that provider in the rendered tree.
- **Broadcast:** everyone who asks for that same rule is notified when the rule changes.

Nested rules explain nearest-provider lookup. If the whole building has a light theme but a preview room installs a dark theme, a reader inside the preview room gets dark; a reader elsewhere still gets light. The inner rule shadows the outer rule only for its descendant subtree.

Splitting contexts is like using separate badge systems for theme and authentication. A change to the theme system does not notify people who only hold an authentication badge. Splitting reduces unrelated subscriptions, but it does not make one context selector-based: all consumers of the changed context still observe that context’s value as a unit.

## 3. How It Actually Works — The Full Explanation

`createContext(defaultValue)` creates a context object. The object is the identity of the channel; every provider and consumer must use that exact object. `Context.Provider` writes a value into the current React tree position. `useContext(Context)` reads the value supplied by the nearest matching provider above the component that calls it.

React does not search the DOM. During render, React records that the currently rendering Fiber depends on the context object. It resolves the current value from the provider stack/tree for that render. If no matching provider exists above the consumer, React returns the `defaultValue` from `createContext`. A provider with `value={undefined}` is still a provider, so it supplies `undefined`; it does not reactivate the default.

The lookup is positional, not based on JSX text or a module-level singleton. A provider affects descendants in the rendered tree, including descendants hidden behind ordinary component boundaries. It does not affect a sibling or an ancestor. Context follows the React ownership tree, not DOM parentage; a portal created by a descendant can still read context from its React ancestry even when its DOM mounts elsewhere.

**Nearest-provider lookup**

```text
ThemeContext.Provider value="light"
├── Header                         -> "light"
└── PreviewTheme.Provider value="dark"
    └── PreviewButton              -> "dark"
```

When a provider renders again, React compares the previous and next `value` with `Object.is`. If the identity is unchanged, the context channel has not changed. If it is different, React schedules context consumers whose recorded dependency matches that channel. This is why a provider value such as `{{ user, logout }}` is dangerous: the object is newly allocated on every provider render, even if `user` and `logout` did not change.

Context propagation is not ordinary parent-to-child prop reconciliation. A consumer can be scheduled because its context changed even when a memoized ancestor would otherwise bail out. `React.memo` still helps with parent-driven prop updates, but it is not a selector for context and cannot suppress a context update observed by the memoized component itself.

There are two different rerender questions to keep separate:

1. **Did the provider component function run?** Its own state, props, or parent update can make that happen.
2. **Did the context value change identity?** Only a changed provider value propagates a context update to its subscribers.

If a provider rerenders with the same primitive value, consumers are not notified by context. If the provider rerenders with a new object, consumers are notified even when the object’s fields look equal. A stable value does not magically prevent the provider’s own children from being reconciled for every possible reason; it specifically prevents unnecessary context notifications.

**Rerender boundaries and value design**

- Keep frequently changing values out of a context read by broad parts of the tree.
- Split unrelated domains into separate contexts.
- Split state from dispatch when dispatch has stable identity and many components only send actions.
- Memoize an object or array provider value when its reference should change only with selected inputs.
- Put a provider around the smallest subtree that genuinely shares the dependency.
- Use a selector-capable external store when consumers need independent subscriptions to fields of one frequently changing store.

`useMemo` can preserve the reference of a provider object, but it cannot make a changed property invisible to consumers of that context. It is also not a correctness mechanism: the application must remain correct if React discards a memoized calculation. Design the value and ownership first; optimize measured identity churn second.

**State, ownership, and keys**

The provider component owns state when it calls `useState` or `useReducer`; the context only transports the resulting snapshot and actions. A consumer cannot mutate context directly unless the provider exposes an action, setter, or command. Keep the reducer and state transition rules at the owner boundary so the provider remains the source of truth.

A `key` changes component identity. Giving a provider or a provider-owned child a new key can intentionally reset its state by remounting it, but it also discards local state and recreates descendants. Do not use a key as a general rerender switch. If a selected account should start a fresh editor, key the editor by account ID; if the same provider should simply expose a new account, update its state/value without remounting unrelated UI.

## 4. Real Code — See It Working

**Example 1 — A self-contained typed provider with separate state and dispatch channels**

This snippet can be placed in a TSX file with React installed. It demonstrates ownership, a nullable typed default, a fail-fast hook, stable dispatch identity, and the reducer’s stable state identity when no state transition occurs.

```tsx
import {
  createContext,
  memo,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";
type ThemeState = { theme: Theme; contrast: boolean };
type ThemeAction =
  | { type: "toggle-theme" }
  | { type: "toggle-contrast" };

const ThemeStateContext = createContext<ThemeState | null>(null);
const ThemeDispatchContext = createContext<Dispatch<ThemeAction> | null>(null);

function reducer(state: ThemeState, action: ThemeAction): ThemeState {
  if (action.type === "toggle-theme") {
    return { ...state, theme: state.theme === "light" ? "dark" : "light" };
  }
  return { ...state, contrast: !state.contrast };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    theme: "light",
    contrast: false,
  });
  return (
    <ThemeDispatchContext.Provider value={dispatch}>
      <ThemeStateContext.Provider value={state}>
        {children}
      </ThemeStateContext.Provider>
    </ThemeDispatchContext.Provider>
  );
}

function useThemeState(): ThemeState {
  const value = useContext(ThemeStateContext);
  if (value === null) throw new Error("Missing <ThemeProvider>");
  return value;
}

function useThemeDispatch(): Dispatch<ThemeAction> {
  const value = useContext(ThemeDispatchContext);
  if (value === null) throw new Error("Missing <ThemeProvider>");
  return value;
}

const ThemeBadge = memo(function ThemeBadge() {
  const { theme, contrast } = useThemeState();
  return <output>{theme} / {contrast ? "high contrast" : "normal"}</output>;
});

const ThemeButton = memo(function ThemeButton() {
  const dispatch = useThemeDispatch();
  return <button onClick={() => dispatch({ type: "toggle-theme" })}>Toggle</button>;
});

export function App() {
  return (
    <ThemeProvider>
      <ThemeBadge />
      <ThemeButton />
    </ThemeProvider>
  );
}
```

`ThemeButton` subscribes only to the dispatch context, whose reducer dispatch function is stable. It does not rerender because the theme state context changes. `ThemeBadge` subscribes to state and does rerender when the state object changes. This is a render-boundary improvement, not a claim that `memo` is required for context correctness.

**Example 2 — Nearest provider and the default value**

```tsx
import { createContext, useContext, type ReactNode } from "react";

const LanguageContext = createContext("en");

function Label() {
  return <span>{useContext(LanguageContext)}</span>;
}

function Preview({ children }: { children: ReactNode }) {
  return (
    <LanguageContext.Provider value="fr">
      {children}
    </LanguageContext.Provider>
  );
}

export function App() {
  return (
    <LanguageContext.Provider value="en">
      <Label />
      <Preview><Label /></Preview>
    </LanguageContext.Provider>
  );
}
```

The first label reads `en`; the nested label reads `fr`. If `Label` were rendered without any provider, it would read the typed fallback `en`. A fallback is useful for a meaningful standalone default or tests, but `createContext<T | null>(null)` plus a guarded custom hook is often safer for required dependencies because missing providers fail immediately instead of silently using an accidental production-like value.

**Example 3 — Composition can remove the dependency entirely**

```tsx
import type { ReactNode } from "react";

type User = { name: string };

function Layout({ menu, children }: { menu: ReactNode; children: ReactNode }) {
  return <main><header>{menu}</header><section>{children}</section></main>;
}

export function App({ user }: { user: User }) {
  return (
    <Layout menu={<button>{user.name}</button>}>
      <p>Dashboard content</p>
    </Layout>
  );
}
```

The layout does not need a `user` prop because the caller constructs the menu and passes the finished element. Prefer this when one known piece of UI needs data. Prefer context when many independently placed descendants need the same dependency or compound components must coordinate implicitly.

## 5. The Interview Questions — All of Them, Done Properly

**What real problem does `useContext` solve?** It removes repetitive prop forwarding for a dependency shared by a deep React subtree. It does not replace props for ordinary parent-child data flow and it does not create application-wide mutable state.

**How does React find the value?** The consumer registers a dependency on a particular context object during render. React resolves the closest matching provider above that consumer in the React tree. With no provider, it returns `createContext`’s default. A provider whose value is `undefined` still wins over the default.

**What happens when `value` changes?** React compares the previous and next provider values with `Object.is`. A changed identity propagates work to consumers of that context below the provider. Objects and arrays therefore need deliberate identity management; equal-looking object literals are not equal references.

**Does `React.memo` prevent context rerenders?** No, not for a component that calls `useContext` for the changed context. `memo` compares props. Context is an independent subscription. A memoized wrapper that does not consume context can still help isolate a consumer, and splitting state/dispatch can remove subscriptions that do not need to exist.

**Does a provider rerender always rerender every consumer?** No. A provider function may rerender without changing its context value. Context propagation occurs when the value identity changes. Consumers can also rerender for their own props, state, or parent reconciliation, so context identity is not the only source of work.

**Why memoize a provider value?** To avoid broadcasting a freshly allocated object when the underlying fields are unchanged:

```tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";

type User = { id: string };
const UserContext = createContext<{ user: User; logout: () => void } | null>(null);

function UserProvider({ user, logout, children }: {
  user: User;
  logout: () => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ user, logout }), [user, logout]);
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function App({ user }: { user: User }) {
  return <UserProvider user={user} logout={() => {}}><UserMenu /></UserProvider>;
}

function UserMenu() {
  const value = useContext(UserContext);
  if (value === null) throw new Error("Missing <UserProvider>");
  return <button onClick={value.logout}>{value.user.id}</button>;
}

```

Do not add `useMemo` mechanically. It does not provide field-level selection, and its dependencies must describe the values used to construct the object.

**How should TypeScript defaults be typed?** For a required provider, use a nullable or undefined default and guard it in a custom hook:

```tsx
import { createContext, useContext } from "react";

type Session = { id: string };
const SessionContext = createContext<Session | undefined>(undefined);

function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === undefined) throw new Error("Missing <SessionProvider>");
  return session;
}
```

For an optional dependency, give `createContext` a real safe fallback and type the context as that value. Do not use `{} as Session` or a fake non-null default: it hides configuration errors and weakens the type contract.

**Is Context a state-management library?** Context is transport and subscription wiring. `useState` and `useReducer` provide local ownership and transitions; Redux, Zustand, and similar stores add external ownership, selectors, middleware, persistence, or tooling. Context can be part of a state-management solution, but it is not those capabilities by itself.

**What is context splitting?** It is separating independent channels, commonly state and dispatch or theme and locale. A component that only dispatches no longer subscribes to state changes. It does not make a single state context granular; all consumers of that state context still observe its changed value.

**Can context work with SSR and Server Components?** Server-rendered markup can read a provider during the server render, but provider placement and the initial value must be consistent with the client render to avoid hydration mismatches. Never put request-specific mutable data in a process-global singleton; create provider state per request/render. A client hook such as `useContext` belongs in a client component, while server-rendered data should usually be passed through the server/component tree rather than recreated as a client-side global. Context is scoped to a render tree, not a cross-request cache.

## 6. The Traps — What Goes Wrong

**Trap: the inline object broadcast**

```tsx
import { createContext, useMemo, type ReactNode } from "react";

type User = { id: string };
const UserContext = createContext<{ user: User; logout: () => void } | null>(null);

function BadProvider({ user, logout, children }: {
  user: User;
  logout: () => void;
  children: ReactNode;
}) {
  return (
    <UserContext.Provider value={{ user, logout }}>
      {children}
    </UserContext.Provider>
  );
}

function GoodProvider({ user, logout, children }: {
  user: User;
  logout: () => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ user, logout }), [user, logout]);
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

// Bad when App rerenders for unrelated reasons.
export function App({ user, children }: { user: User; children: ReactNode }) {
  return <GoodProvider user={user} logout={() => {}}>{children}</GoodProvider>;
}
```

Use a stable value when the provider rerenders for unrelated reasons. Remember that `useMemo` is about avoiding accidental identity changes, not about making a context selector.

**Trap: confusing the default with provider initialization**

```tsx
import { createContext, useContext } from "react";

const ThemeContext = createContext<string | undefined>("light");

function Consumer() {
  return <output>{useContext(ThemeContext)}</output>;
}

export function App() {
  return (
    <ThemeContext.Provider value={undefined}>
      <Consumer />
    </ThemeContext.Provider>
  );
}
```

The default is used only when no matching provider exists. It is not a fallback for `undefined`, `null`, empty objects, or failed loading state supplied by a provider.

**Trap: one “God Context”**

Putting theme, cart, user, notifications, and a text input into one object couples unrelated update frequencies. A notification increment changes the context value and wakes every consumer of that channel. Split by domain and frequency, or move fast-changing state to a narrower owner or selector-based store.

**Trap: using context for high-frequency state**

Mouse coordinates, animation frames, scroll position, and every keystroke can create broad render work. Keep transient state near the component that renders it. For an external mutable source, use `useSyncExternalStore` with a stable snapshot and subscribe only where the data is needed; do not mirror the source into context with an effect.

**Trap: using an effect to “sync” derived context state**

If a value can be derived from props or existing state, derive it during render. If a user action changes state and performs an external action, do both in the event handler. Effects are for synchronizing with genuinely external systems, not for repairing provider ownership or copying one context into another. An external store’s subscription belongs behind `useSyncExternalStore` or a library designed for that source.

**Trap: using a key to force arbitrary refreshes**

A new key remounts the keyed identity and resets its state. That is useful for a fresh form for a new record, but it destroys state and subscriptions. Use it for an intentional identity boundary, not as a substitute for correct context values or updates.

**Trap: treating render as a committed side effect**

In Strict Mode, development renders may be invoked more than once to expose impure render logic. In concurrent rendering, React may start a render, pause it, replace it, or discard it before commit. A context read is a render-time snapshot for that attempt. Never mutate a singleton, send analytics, write storage, or publish to an external system merely because a component read context. Do external synchronization at the appropriate committed boundary, and make it resilient to setup/cleanup and remounting.

## 7. Compare With Related Concepts

| Choice | Best fit | Main trade-off |
| --- | --- | --- |
| Props | Direct parent-child communication and explicit APIs | Verbose when a value crosses many unrelated layers |
| Context | Deep subtree dependencies such as theme, locale, auth, or compound-component state | Coarse broadcast; provider scope and value identity matter |
| Composition (`children`/slots) | One known child or UI fragment needs data | The caller must construct and place the fragment |
| Local state | State belongs to one small interactive owner | Other branches cannot read it without lifting or sharing |
| `useReducer` plus Context | A reducer-owned subtree needs shared commands and state | Still has context broadcast boundaries; no selectors by default |
| External store | High-frequency or cross-cutting state needing selectors, persistence, or tooling | More lifecycle and architecture to learn and maintain |
| TanStack Query/SWR | Server state, cache, refetching, retries, and request deduplication | Not a replacement for local UI state or dependency injection |
| `useSyncExternalStore` | A React subscription to an already-existing external source | The source must provide a correct subscribe/snapshot contract |

The decision rule is simple: start with props and composition; introduce context when a dependency is genuinely shared across a subtree; split contexts when update domains differ; choose an external store when context’s all-consumers-on-value-change behavior is too coarse; choose a server-state library for remote data lifecycle.

## 8. 🧠 The Memory Hook

> **Context is a tree-scoped broadcast channel:** the nearest provider supplies the value, `Object.is` decides whether the channel changed, and every consumer of that channel may render. Props keep ownership explicit, composition can remove the dependency, split contexts reduce unrelated subscriptions, and external stores provide selectors when broadcast is too broad.
