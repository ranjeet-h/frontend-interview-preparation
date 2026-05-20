# React

React ties together state, rendering, and reusable UI architecture. Study it by understanding
how data flows, when components re-render, and how hooks shape that flow.

## Chapters (theory — source: `04-react-theory-concepts.md`)

| Chapter | Lines | Focus |
|---|---|---|
| [Core Concepts](core-concepts.md) | `04` L1–296 | Virtual DOM, diffing, keys, controlled/uncontrolled, HOCs, lifting state |
| [Hooks In-Depth](hooks.md) | `04` L297–538 | useState, useEffect, useReducer, useMemo, useCallback, useRef, custom hooks |
| [State Management & Performance](state-performance.md) | `04` L539–663 | Context API, Redux, Zustand, React.memo, code splitting |
| [Architecture & Testing](architecture-testing.md) | `04` L664–879 | Scalable structure, render props, testing, React 18 features |
| [Advanced Patterns & Ecosystem](advanced-patterns.md) | `04` L880–1165 | useImperativeHandle, Error Boundaries, Portals, TypeScript, SSR/CSR/SSG |
| [Implementations & Examples](implementations.md) | `04` L1166–end | To-do list, API fetcher, useDebounce hook, Modal, Tree, Tabs |

## Concept chapters (12-section study format)

| Chapter | Focus |
|---|---|
| [What Is React and Why It Is Used](concepts/what-is-react.md) | React purpose, UI library role, state-driven components |
| [Declarative vs Imperative UI](concepts/declarative-vs-imperative-ui.md) | What vs how, direct DOM contrast, state-driven rendering |
| [Component-Based Architecture](concepts/component-based-architecture.md) | Component boundaries, reuse, composition |
| [JSX and How JSX Compiles](concepts/jsx-and-compilation.md) | JSX syntax, compilation, React element creation |
| [React Elements vs Components](concepts/react-elements-vs-components.md) | Component definition vs element object |
| [Functional Components vs Class Components](concepts/functional-vs-class-components.md) | Modern functions/hooks vs legacy class lifecycle model |
| [Props in React](concepts/props.md) | Parent-to-child inputs, immutability, prop design |
| [State in React](concepts/state.md) | Component memory, re-rendering, immutability |
| [Children Prop](concepts/children-prop.md) | Nested content and composition |
| [Conditional Rendering](concepts/conditional-rendering.md) | Loading/error/empty/success branches |
| [List Rendering](concepts/list-rendering.md) | Mapping arrays to elements and large-list concerns |
| [Keys in React Lists](concepts/keys-in-lists.md) | Stable identity for reconciliation |
| [Event Handling in React](concepts/event-handling.md) | Handlers, form events, Synthetic Event basics |
| [Controlled Components](concepts/controlled-components.md) | React-owned values, callbacks, form state |
| [Uncontrolled Components](concepts/uncontrolled-components.md) | DOM-owned values, refs, default values |
| [Forms in React](concepts/forms-in-react.md) | Form state, validation, submit flow, accessibility |
| [Component Composition](concepts/component-composition.md) | Children, compound APIs, composition over configuration |
| [Reusable Components](concepts/reusable-components.md) | Stable reusable APIs, variants, accessibility |
| [Presentational vs Container Components](concepts/presentational-vs-container-components.md) | UI-only components vs data/behavior orchestration |
| [Lifting State Up](concepts/lifting-state-up.md) | Closest common parent ownership and callbacks |
| [Props Drilling](concepts/props-drilling.md) | Deep prop forwarding and alternatives |
| [Component Lifecycle](concepts/component-lifecycle.md) | Mount, update, unmount, cleanup, class lifecycle |
| [One-Way Data Flow](concepts/one-way-data-flow.md) | Props down, callbacks up, explicit ownership |
| [Immutability in React State](concepts/immutability-in-react-state.md) | Immutable updates, references, state traps |
| [Rendering Flow in React](concepts/rendering-flow.md) | Update scheduling, render, reconcile, commit |
| [Virtual DOM and Reconciliation](concepts/virtual-dom-reconciliation.md) | Virtual DOM, render/reconcile/commit flow, keys, diffing traps |
| [Reconciliation](concepts/reconciliation.md) | Old vs new UI tree comparison |
| [Diffing Algorithm](concepts/diffing-algorithm.md) | React tree comparison heuristics |
| [React Fiber Architecture](concepts/react-fiber-architecture.md) | Units of work, scheduling, prioritization |
| [Synthetic Events](concepts/synthetic-events.md) | React's normalized event wrapper |
| [Fragments](concepts/fragments.md) | Group JSX without DOM wrappers |
| [Portals](concepts/portals.md) | Render outside parent DOM hierarchy |
| [Error Boundaries](concepts/error-boundaries.md) | Catch render crashes and show fallback UI |
| [Refs](concepts/refs.md) | Mutable boxes and DOM access |
| [Forward Refs](concepts/forward-refs.md) | Expose inner DOM refs through components |
| [Callback Refs](concepts/callback-refs.md) | Ref assignment callbacks for dynamic nodes |
| [StrictMode](concepts/strict-mode.md) | Development checks for unsafe patterns |
| [React DevTools](concepts/react-devtools.md) | Inspect and profile component trees |
| [`useState`](concepts/use-state.md) | Local component state and functional updates |
| [`useEffect`](concepts/use-effect.md) | Synchronizing with external systems |
| [`useContext`](concepts/use-context.md) | Reading shared provider values |
| [`useRef`](concepts/use-ref.md) | Mutable values and DOM refs without re-rendering |
| [`useReducer`](concepts/use-reducer.md) | Action-based local state transitions |
| [`useMemo`](concepts/use-memo.md) | Memoized calculated values |
| [`useCallback`](concepts/use-callback.md) | Memoized function references |
| [`useLayoutEffect`](concepts/use-layout-effect.md) | Layout work before browser paint |
| [`useImperativeHandle`](concepts/use-imperative-handle.md) | Custom forwarded ref handles |
| [`useDebugValue`](concepts/use-debug-value.md) | DevTools labels for custom hooks |
| [Custom Hooks](concepts/custom-hooks.md) | Reusable stateful logic |
| [Rules of Hooks](concepts/rules-of-hooks.md) | Stable hook call order |
| [Hook Dependency Array](concepts/hook-dependency-array.md) | Reactive values and re-run control |
| [Stale Closures](concepts/stale-closures.md) | Old render values in callbacks |
| [Effect Cleanup Functions](concepts/effect-cleanup-functions.md) | Undo subscriptions, timers, and requests |
| [Avoiding Infinite Re-renders](concepts/avoiding-infinite-re-renders.md) | Render/effect feedback-loop traps |
| [Lazy Initialization in useState](concepts/lazy-initialization-use-state.md) | Initial state setup only once |
| [Functional State Updates](concepts/functional-state-updates.md) | Previous-state-safe updates |
| [Referential Equality and Stable References](concepts/referential-equality-stable-references.md) | Object/function identity in React |
| [Race Conditions Inside Effects](concepts/race-conditions-inside-effects.md) | Out-of-order async effect results |
| [AbortController Inside Effects](concepts/abort-controller-inside-effects.md) | Canceling outdated fetch work |
| [Debouncing With Hooks](concepts/debouncing-with-hooks.md) | Delayed quiet-time updates |
| [Throttling With Hooks](concepts/throttling-with-hooks.md) | Rate-limited high-frequency events |
| [Previous State or Value Hook](concepts/use-previous.md) | Remembering previous render values |
| [Mounted State Tracking](concepts/mounted-state-tracking.md) | Guarding non-cancelable async results |
| [Hook Comparisons](concepts/hook-comparisons.md) | `useReducer` vs `useState`, `useRef` vs `useState`, `useMemo` vs `useCallback` |
| [Handling Async Logic Inside Hooks](concepts/async-logic-inside-hooks.md) | Loading/error/cancellation patterns |
| [Custom Hook Testing](concepts/custom-hook-testing.md) | Testing reusable hook behavior |
| [Server State in React](server-state.md) | Client state vs server state, query cache, invalidation, optimistic updates |
| [Routing in React](routing.md) | Client routing, params, query params, nested routes, protected routes |
| [Forms in React](forms.md) | Controlled/uncontrolled forms, validation, React Hook Form, accessibility |
| [TypeScript With React](typescript-react.md) | Props, children, events, refs, unions, reducers, API typing |
| [Component Design in React](component-design.md) | Composition, component boundaries, compound components, reusable APIs |
| [React Security, Build Tools & Web Platform](security-build-platform.md) | XSS, auth storage, bundle size, CSS strategy, browser APIs |
| [Senior React Scenario Questions](senior-scenarios.md) | Architecture trade-offs, production debugging, testing, ownership |

## Chapters (coding — source: `05-react-coding-challenges.md`)

| Chapter | Lines | Focus |
|---|---|---|
| [Coding Challenges](coding-challenges.md) | `05` L1–734 | Custom hooks, performance, component design, state management |
| [Output Questions](output-questions.md) | `05` L735–end | "What is the output?" — hooks, memo, context, reducer |

## Practical interview builds (curated)

| Chapter | Source | Focus |
|---|---|---|
| [Practical Questions (50 Interview Builds)](practical-questions.md) | Curated | Beginner → advanced React UI build problems with simple solutions and interview takeaways |
