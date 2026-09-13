# Custom Hook Testing

## 1. Why This Exists — The Problem First

A shared hook can look correct in one screen and still fail everywhere else. A `useDebouncedValue` hook might leave old timers alive, an authentication hook might be rendered without its provider, and an async hook might commit a response for a request the user has already replaced. If the only test is a large end-to-end test, the failure is slow to isolate; if the only test checks private state, harmless refactoring breaks the suite.

The useful question is not “how do I test a function that happens to start with `use`?” It is “what contract does this hook expose to its consumer, and what React lifecycle makes that contract true?” Hook tests exercise that contract in a small, real React render, then verify initial state, actions, rerenders, provider inputs, asynchronous completion, and unmount cleanup.

## 2. The Analogy — Make It Obvious

Think of a custom hook as a reusable appliance installed in different kitchens. The appliance design is shared, but each kitchen gets its own plugged-in instance: its own state, timers, subscriptions, and pending work. A test bench can connect one appliance, supply the electricity and plumbing it requires, press its controls, and inspect the output without building the whole kitchen.

The test bench is `renderHook` or a tiny test component. A provider wrapper is the missing electrical panel or water connection: a hook that calls `useAuth()` cannot operate in an empty React tree. `act` is the rule that says, “finish the control-panel operation before reading the display”; it lets React process updates before the assertion. Rerendering supplies a new input to the same installed instance, while `unmount` removes the appliance and checks that it shut down cleanly.

The analogy has a limit. If the thing being tested is the kitchen experience—keyboard access, labels, focus, validation messages, or the exact rendered result—the bench is too isolated. Render the real component, because the component is the public boundary the user depends on.

## 3. How It Actually Works — The Full Explanation

A hook is not an ordinary function. Calling `useBoolean()` directly in a Node test bypasses React’s dispatcher, so `useState`, `useContext`, and `useSyncExternalStore` have no render to belong to. React owns when the hook is called, when its state is preserved, when props change, and when cleanup runs. The harness must create an actual React render.

There are two common harnesses:

- `renderHook(() => useSomething(input), { wrapper })` is compact for a hook whose contract is values and actions. It returns a `result` object, plus controls such as `rerender` and `unmount`.
- A small component that calls the hook and renders its output is better when the behavior is inherently visual or interaction-heavy. It also exercises the hook-to-markup boundary, accessibility semantics, and event wiring.

The core loop is:

1. The harness renders the hook. React calls it in the normal render phase and stores its hook state against that component instance.
2. The test reads the observable result or rendered DOM. It should not reach into React’s state slots, refs, or effect bookkeeping.
3. An action, prop change, timer, or promise changes the conditions. The test wraps the operation in `act` when it can cause a React update, so the harness flushes the resulting render before the assertion.
4. The test uses `rerender` to provide a new input to the same instance. For debouncing, this matters because old cleanup must run before new setup is observed.
5. The test uses `waitFor` or an accessible `findBy...` query for asynchronous work. It waits for a condition, not an arbitrary sleep.
6. The test uses `unmount` when teardown is part of the contract. React runs cleanup, and the test verifies that timers, subscriptions, listeners, and requests do not outlive their owner.

The most useful boundary is observable behavior. A hook’s public contract may be `{ value, toggle }`, a loading/data/error state machine, an unsubscribe guarantee, or a request-cancellation rule. A test can assert those things without caring whether the implementation uses `useState`, `useReducer`, a ref, or a different helper next month. A test that asserts “`setState` was called twice” has coupled itself to the current recipe instead of the appliance’s output.

Context changes the setup, not the principle. The wrapper must provide the same kind of provider the hook expects, with test-controlled values. For a query hook, use a fresh test query client or disable retries; otherwise cache and retry state can leak between tests and make a failure look random. For an auth hook, exercise authenticated and unauthenticated values, and separately verify the fail-fast error when the provider is absent if that error is part of the API.

Time and asynchronous work need explicit control. Fake timers let a test move through a debounce window immediately, but timer advancement is still a state-changing operation and should be wrapped in `act`. Promise completion is different from timer completion: resolve the controlled promise, then wait for React to render the settled state. Do not mix fake timers and real-time sleeps casually; that often leaves a test waiting for a clock that has been replaced.

React development Strict Mode may perform an extra setup/cleanup cycle to expose unsafe external synchronization. A sound hook makes setup reversible, so the extra cycle does not create duplicate listeners, requests, or timers. Testing cleanup is therefore not optional leak checking; it verifies the ownership rule that makes remounts and development checks safe.

## 4. Real Code — See It Working

The snippets assume a TypeScript test project with React Testing Library’s `renderHook`, `render`, `screen`, `act`, and `waitFor`, plus Vitest globals. They are test files for hooks imported from the application, not definitions of those hooks. Replace import paths with the project’s modules. The same structure works with Jest by replacing `vi` with `jest` and its timer APIs.

For a hook whose contract is a value and an action:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBoolean } from "./useBoolean";

describe("useBoolean", () => {
  it("exposes the initial value and changes it through the public action", () => {
    const { result } = renderHook(() => useBoolean(false));

    expect(result.current.value).toBe(false);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.value).toBe(true);
  });
});
```

The test does not inspect the state variable or count renders. It calls the action a component would call and reads the value a component would receive.

For a debounced value, control time and verify both the quiet period and replacement behavior:

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  afterEach(() => vi.useRealTimers());

  it("publishes only the latest value after the delay", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "r" } },
    );

    rerender({ value: "re" });
    rerender({ value: "react" });
    expect(result.current).toBe("r");

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("r");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("react");
  });
});
```

This proves the invariant: after rapid input, one final value is published after 300 milliseconds of quiet time. It does not prove a particular timer variable exists.

For a context-dependent hook, make the provider part of the harness. This example uses a minimal provider so the setup is self-contained; an application test would import its real provider and fixture:

```tsx
import { createContext, type PropsWithChildren, useContext } from "react";
import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";

type User = { id: string; name: string };
const AuthContext = createContext<User | null>(null);

function useCurrentUser() {
  return useContext(AuthContext);
}

function wrapper({ children }: PropsWithChildren) {
  return (
    <AuthContext.Provider value={{ id: "u-7", name: "Maya" }}>
      {children}
    </AuthContext.Provider>
  );
}

it("reads the user from the provider supplied by the harness", () => {
  const { result } = renderHook(() => useCurrentUser(), { wrapper });
  expect(result.current).toEqual({ id: "u-7", name: "Maya" });
});
```

When the hook’s meaning is the UI, render the consumer instead. This test checks the user-visible contract of a form hook and assumes `ProfileForm` exposes the actual application form:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { ProfileForm } from "./ProfileForm";

it("shows validation through the accessible form UI", async () => {
  const user = userEvent.setup();
  render(<ProfileForm onSave={async () => {}} />);

  await user.click(screen.getByRole("button", { name: /save/i }));

  expect(screen.getByRole("alert")).toHaveTextContent("Name is required");
});
```

For an async hook, control the async boundary. This deferred-promise example is self-contained as a test shape; in a network-facing suite, MSW usually preserves more of the real request/response behavior:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useLoadUser } from "./useLoadUser";

it("moves from loading to data when the request resolves", async () => {
  let resolveRequest!: (user: { id: string; name: string }) => void;
  const request = new Promise<{ id: string; name: string }>((resolve) => {
    resolveRequest = resolve;
  });
  const fetchUser = vi.fn(() => request);
  const { result } = renderHook(() => useLoadUser("u-7", fetchUser));

  expect(result.current.status).toBe("loading");

  act(() => resolveRequest({ id: "u-7", name: "Maya" }));

  await waitFor(() => {
    expect(result.current).toEqual({
      status: "success",
      data: { id: "u-7", name: "Maya" },
      error: null,
    });
  });
  expect(fetchUser).toHaveBeenCalledWith("u-7");
});
```

The same suite should reject the request and assert the error state. For a search hook, add two deferred requests and resolve the older one last; the test should prove that the stale response is aborted or ignored. That is the race condition production code must handle.

Cleanup has its own direct shape. A subscription hook should return the external system to a known state when its owner unmounts:

```tsx
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useClockSubscription } from "./useClockSubscription";

it("unsubscribes when the hook owner unmounts", () => {
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(() => unsubscribe);
  const { unmount } = renderHook(() => useClockSubscription(subscribe));

  expect(subscribe).toHaveBeenCalledTimes(1);
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
```

If the real hook uses `useSyncExternalStore`, assert the store’s subscribe/unsubscribe contract. If it owns an `AbortController`, assert that unmount prevents a result from reaching the consumer or that the transport receives an abort signal. The exact spy is secondary; the important fact is that work owned by the unmounted instance cannot keep affecting the application.

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you test a custom hook?**

Render it through a real React harness, then assert on returned values and public actions. `renderHook` is compact for a UI-independent hook; a small real component is better when the contract is DOM behavior, accessibility, or a user flow. Cover initial state, meaningful transitions, errors, async completion, provider requirements, and cleanup. The test should behave like a consumer, not like a debugger of private state.

**Q: Why can’t you call a hook directly in a unit test?**

Hooks rely on React’s current render dispatcher and on a component instance that owns their state and lifecycle. A direct call has no valid React render, so it violates the Rules of Hooks and cannot exercise rerender or unmount behavior. A hook harness or test component supplies that React environment.

**Q: When should you use `renderHook`, and when should you render a component?**

Use `renderHook` when the contract is mostly values and actions: a boolean, reducer-like state machine, debounced value, or provider-backed selector. Render a component when the hook is coupled to markup, focus, DOM measurement, form semantics, event wiring, or a user-visible loading/error state. Choose the smallest boundary that still proves the behavior, not a permanent preference for isolation.

**Q: What does `act` do in hook tests?**

`act` tells the testing environment that an operation may cause React updates and that the test is about to observe its result. It flushes the related render work so assertions do not read an intermediate state. Use it around actions, timer advancement, and other synchronous triggers; for async work, await the appropriate async operation and use `waitFor` or `findBy...` for the settled state.

**Q: How do you test a hook that uses context?**

Supply the required provider through the harness’s `wrapper` or render the component inside the real provider. Give each test explicit fixture values, such as authenticated, logged-out, or a test query client with retries controlled. Keep the wrapper deterministic. Also test the missing-provider error if the hook intentionally fails fast, because that is part of its developer-facing contract.

**Q: How do you test debounce or throttle behavior?**

Use fake timers for timer-driven behavior. Render the hook, change the input, assert that the output has not changed before the boundary, advance time inside `act`, and assert the new output. Change the input more than once before the boundary to prove the old schedule is replaced. Restore real timers after each test. For throttle, assert the opposite contract: work is allowed during the burst but no more often than the interval.

**Q: Does a debounce test prove that stale network responses are safe?**

No. Debouncing controls when a request starts; it does not control a request already in flight. Test stale-response safety with two controlled requests: start A, start B, resolve B, then resolve A. The hook should keep B’s result, using cancellation, a request identity check, or a server-state library. A timer-only test misses this race.

**Q: How do you test an async hook?**

Control the boundary with MSW, a deferred promise, or a narrowly scoped mock. Assert the state sequence: loading, success, and error. Wait for a condition with `waitFor` or an accessible `findBy...` query instead of sleeping for an assumed duration. Include rejection, empty data, timeout or retry behavior where applicable, cancellation, and out-of-order responses when the hook can receive them.

**Q: How do you test cleanup?**

Render the hook, trigger or observe setup, call `unmount`, and assert that the owned resource was released. That may be an unsubscribe function, listener removal, cleared timer, aborted request, or absence of a state update after unmount. Cleanup tests matter because duplicate listeners and leaked work often appear only after navigation or repeated mounting.

**Q: What should a custom hook test avoid?**

Avoid private state names, ref contents, effect call counts, hook call order, and assertions about an internal library call unless that call is the integration contract. Those tests fail when the implementation is refactored even though consumers see the same behavior. Mock only boundaries whose behavior you need to control; mocking the hook’s own internals can remove the mechanism you meant to test.

**Q: What is the difference between testing a hook and testing a utility function?**

A pure utility can be called directly because it has no React lifecycle. A hook needs a render because state, context, subscriptions, and cleanup belong to that lifecycle. Extract pure calculations and test them as utilities when that clarifies the design, but keep hook-level coverage for the wiring that connects the calculation to React inputs and updates.

**Q: How do you keep hook tests isolated?**

Create fresh provider values, stores, query clients, and mock handlers per test. Clear mocks and restore timers after each test. Do not let a module-level singleton cache or mutable fixture carry state from one render to another. Isolation means each test owns the React tree and every external resource it creates.

## 6. The Traps — What Goes Wrong

**Calling the hook as an ordinary function.** This skips React’s dispatcher and cannot model state ownership, rerenders, or cleanup. Render it with `renderHook` or call it from a minimal component.

**Asserting internal mechanics.** Checking a ref, state variable name, effect count, or exact helper call makes a test brittle. A refactor can preserve the contract while changing all those details. Assert the value, action, DOM result, or externally visible side effect instead.

**Forgetting `act`.** Reading `result.current` immediately after an action or timer advance can observe the pre-update render and produce warnings. Wrap the state-changing operation in `act`, then assert after React has processed it.

**Using real time for timer behavior.** Sleeping for 300 milliseconds is slow and does not prove the replacement rule. Fake timers make the boundary explicit and let the test check 299 ms versus 300 ms. Restore the clock or later tests may unexpectedly run under a fake scheduler.

**Waiting with arbitrary sleeps.** A guessed delay can be too short on a busy machine and slow when work completes immediately. Wait for a meaningful state or DOM condition instead.

**Sharing provider state between tests.** A reused query client, context object, store, or handler can cache data or retain subscribers. Build provider setup per test and explicitly control retries, cache, and cleanup.

**Testing only the happy path.** Async hooks fail through rejected requests, empty results, timeouts, cancellation, and stale responses. A success assertion alone does not establish the state machine; make meaningful failure states observable and test them.

**Confusing debounce with cancellation.** A timer can prevent a request from starting, but cannot retract a request already in flight. Pair the debounce test with a cancellation or request-identity test whenever older responses can arrive later.

**Over-isolating a UI hook.** A form hook can return the right `isValid` flag while the form has the wrong label, event wiring, focus behavior, or error semantics. Move coverage to the component boundary when users experience the behavior through the DOM.

**Treating Strict Mode as a nuisance.** Disabling Strict Mode to silence duplicate setup hides cleanup bugs. Make setup reversible and assert that one live subscription or request remains after the development remount pattern.

**Mocking the hook itself.** If a component test replaces the hook with a stub, it proves only that the component can consume that stub. That can be useful for a separate component-isolation test, but it is not a custom-hook test. Keep hook behavior and consumer behavior as intentionally separate suites.

## 7. Compare With Related Concepts

**Hook test vs component test:** A hook test isolates values, actions, providers, and lifecycle transitions. A component test proves the full user-facing path through markup and events. Use the hook boundary for reusable UI-independent behavior; use the component boundary when DOM or accessibility is part of the contract.

**Unit test vs integration test:** A unit test controls most dependencies and focuses on one hook’s state machine. An integration test keeps real providers, routing, a query client, or a network handler together to verify their interaction. Use the smallest test for diagnosis, then add integration coverage where the seam itself can fail.

**Pure utility test vs hook test:** A utility has inputs and outputs with no React lifecycle, so a direct call is enough. A hook adds render ownership, state persistence, context, subscriptions, and teardown. Extract pure logic for cheap unit coverage, but test the hook wiring separately.

**Fake timers vs real timers:** Fake timers are precise for debounce, throttle, polling, and timeout policies. Real timers are closer to a browser scheduler but slower and less deterministic. Prefer fake timers for a timing contract, and use a browser-level test only when the actual scheduler or rendering integration is what you need to prove.

**Mocked `fetch` vs MSW:** A mocked function is narrow and useful when a hook accepts a request function as an injected dependency. MSW intercepts at the network boundary and preserves more request/response behavior, making it stronger for API status and contract tests. Choose based on the boundary you want the test to preserve.

**Local hook state vs external store testing:** A local hook instance is isolated per rendered component. An external store has its own lifetime and may be shared by many consumers, so test both store transitions and hook subscription behavior. Two calls to the same local hook are two instances, not shared state.

## 8. 🧠 The Memory Hook — What Sticks

Test a custom hook like an appliance on a bench: install it in a real React render, connect the providers it needs, press only public controls, and inspect the output. Then unplug it with `unmount`—if its timers, listeners, or requests keep working, the hook does not own its lifecycle correctly.
