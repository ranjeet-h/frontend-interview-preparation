# Previous State or Value Hook

## 1. Why This Exists — The Problem First

A component often receives only the latest snapshot of its inputs, but the behavior you need depends on the transition. A price label may need to say whether the price went up, a status badge may need to celebrate the exact moment `loading` became `success`, and a chart may need the old point to animate toward the new one. If you compare values after overwriting the old one, the evidence of the transition is gone.

React does not hand a component a built-in `previousProps` object. Each render is a fresh call with a fresh snapshot. `usePrevious` is a small custom-hook pattern for carrying one value across renders without making that historical value another source of UI updates.

## 2. The Analogy — Make It Obvious

Think of a driver checking a rear-view mirror. The road ahead is the current render: it is what the driver must use right now. The mirror is not another steering wheel and does not move the car; it quietly shows where the car was on the last completed trip through that part of the road.

The mapping is exact:

- The current prop or state value is the road directly ahead.
- A `useRef` is the mirror: it persists in the same component instance, but changing what it shows does not cause the car to move again.
- The render reads the mirror before it is updated, so it sees the previous value.
- An effect runs after React commits the current render and changes the mirror to the value just rendered.

On the first render, there is no road behind this component instance, so the mirror shows `undefined` unless the hook deliberately accepts an initial value. On the next render, it shows the value from the first render.

## 3. How It Actually Works — The Full Explanation

The usual implementation is deliberately split across render and commit:

```tsx
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}
```

Here is the timeline for `value` changing from `A` to `B`:

1. On render 1, `ref.current` starts as `undefined`. The hook returns `undefined`, while the effect is only scheduled.
2. React commits render 1. The effect runs and assigns `ref.current = A`.
3. A prop or state update causes render 2. Before render 2's effect runs, the hook reads `ref.current`, so it returns `A` while the current argument is `B`.
4. React commits render 2. The effect assigns `ref.current = B`, making `B` available as the previous value on render 3.

The important invariant is: during a committed render, `usePrevious(value)` returns the value captured by the last committed effect for this hook instance. An interrupted or abandoned render does not become “previous” merely because the component function started executing; the effect runs only after a render commits. That matters in concurrent React because speculative work must not overwrite committed history.

`useRef` is the storage choice because `.current` is mutable and stable across renders, while assigning to it does not schedule a render. State would be the wrong primitive for this particular job: setting state schedules another render, and a state-based “copy current into previous” effect adds an unnecessary render cycle and can loop if written carelessly. The component still re-renders when its real inputs change; the ref update is passive bookkeeping during the resulting commit.

The dependency array deserves precision. `[value]` means the effect updates the ref when React sees the value change by `Object.is`. If the value is an object that is mutated in place, its identity may not change, and the hook cannot provide an immutable historical snapshot. Even when the effect does run, both the “previous” and “current” values can point to the same mutable object. Use immutable updates, or store a deliberate copy when you truly need a snapshot of object contents.

The hook observes render history; it is not a general event log. It is useful for deriving a label such as “up” versus “down.” If the next action is an external side effect, derive the transition during render and perform the side effect in an effect or an event handler. Never show a toast, write to storage, or call an API directly while rendering just because the transition was detected.

## 4. Real Code — See It Working

The following is a complete component for a React 18+ TypeScript app. It can be pasted into a Vite React TS project. Clicking the button changes state, which causes the hook to expose the value from the prior committed render.

```tsx
import { useEffect, useRef, useState } from "react";

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  // This runs after the current render commits, creating the one-render lag.
  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

export default function PriceTracker() {
  const [price, setPrice] = useState(100);
  const previousPrice = usePrevious(price);

  const direction =
    previousPrice === undefined
      ? "initial"
      : price > previousPrice
        ? "up"
        : price < previousPrice
          ? "down"
          : "unchanged";

  return (
    <main>
      <p>Current price: ${price}</p>
      <p>
        Previous price: {previousPrice === undefined ? "none yet" : `$${previousPrice}`}
      </p>
      <p>Direction: {direction}</p>
      <button type="button" onClick={() => setPrice((current) => current + 5)}>
        Increase price
      </button>
    </main>
  );
}
```

For a status transition, the comparison is just as direct:

```tsx
import { useEffect, useRef } from "react";

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

type Status = "idle" | "loading" | "success" | "error";

function StatusMessage({ status }: { status: Status }) {
  const previousStatus = usePrevious(status);
  const justSucceeded = previousStatus === "loading" && status === "success";

  return <p>{justSucceeded ? "Loaded successfully" : `Status: ${status}`}</p>;
}
```

This render-time boolean is safe because it only describes what to render. If success should also trigger an analytics event, put that synchronization in an effect keyed by the transition, and make the operation safe under development Strict Mode's extra effect setup/cleanup checks. For a value that must be available before the browser paints—for example, a layout measurement—`useLayoutEffect` may be the appropriate timing choice, but it does not make the current render see a different previous value; the ref is still read during render and updated after that render.

## 5. The Interview Questions — All of Them, Done Properly

**Q: How would you implement `usePrevious`?**

Create a ref that survives renders, return its current value during render, and assign the new value in an effect after commit. That ordering creates the one-render delay. A generic TypeScript implementation returns `T | undefined` because the first render has no previous value.

**Q: Why use `useRef` instead of `useState`?**

The historical value is storage, not a reason to render. Updating `ref.current` does not schedule work, so the next ordinary render can read the updated history. State would schedule another render for bookkeeping and can produce an effect-update loop; it also makes the previous value an unnecessary UI-driving state variable.

**Q: Does changing `ref.current` cause a re-render?**

No. It is a normal mutable assignment. React does not subscribe the scheduler to ref mutations. A later render happens because a prop, state value, context value, or parent update caused it—not because the previous-value ref changed.

**Q: Why update the ref in an effect instead of during render?**

If the hook assigned `ref.current = value` before returning, the render would immediately read the current value and the “previous” value would no longer be previous. Post-commit assignment preserves the old value for the whole current render and records the committed value for the next one. It also avoids treating an abandoned concurrent render as committed history.

**Q: What does `usePrevious` return on the first render?**

Usually `undefined`. The ref starts empty and its effect has not run yet. Consumers must handle that case explicitly, or the hook can accept a meaningful initial value when the domain has one. Do not use `undefined` as the only “no previous value” signal if `undefined` is itself a valid input; use a sentinel or an explicit `{ hasPrevious, value }` result in that API.

**Q: What happens if the component unmounts and mounts again?**

The new mount gets a new hook instance and starts with its initial previous value. React preserves the ref across re-renders of the same mounted instance, not across arbitrary unmount/remount cycles. A changing `key` can intentionally cause that reset.

**Q: Does this work correctly with React Strict Mode and concurrent rendering?**

The basic pattern is safe because the mutation is in an effect and assigning the same value again is harmless. Development Strict Mode may run effect setup more than once to expose unsafe side effects, so code that reacts to a detected transition must still be idempotent or correctly cleaned up. In concurrent rendering, only committed effects update the ref, which is the useful meaning of “previous” for what the user actually saw.

**Q: Is `usePrevious` a deep snapshot of an object?**

No. It remembers the previous reference. If an object was mutated in place, its old reference now exposes the mutation too, and `[value]` may not detect any identity change. Prefer immutable object updates. If a true historical value is required, create a controlled snapshot with a documented cost rather than assuming `usePrevious` performs a deep clone.

**Q: When should you use it, and when is it a smell?**

Use it for a narrow comparison between adjacent committed renders: threshold crossings, direction labels, animation inputs, or transition-specific rendering. It is a smell when it is compensating for unclear ownership or duplicated state, when it is used to avoid correct effect dependencies, or when the application really needs an event history, reducer transition, or server-state library. Model the business event directly when that is clearer.

## 6. The Traps — What Goes Wrong

- **Writing the new value during render:** `ref.current = value` before the return destroys the one-render lag. The hook returns the current value, not the previous one. Record it after commit instead.

- **Expecting the first render to have history:** `previousValue === currentValue` is not a reliable “did not change” test on mount. There was no prior render. Guard the initial case or return an explicit presence flag.

- **Using state as a mirror:** An effect that copies `value` into state adds a second render for data React already has. It can also loop if the effect keeps producing a new state value. Use a ref for passive history; use state only when the value itself drives UI and has an independent owner.

- **Mutating objects in place:** A ref preserves a reference, not a frozen copy. With `user.name = "new"`, both the current object and the remembered reference can expose `"new"`. Replace objects immutably when identity should represent a change.

- **Running side effects during render:** Detecting `justSucceeded` is a render calculation. Sending an email, showing a toast, or writing analytics in that branch is unsafe because React can render more than once or discard work. Synchronize with the external system in the right effect or initiate the action from the event that caused it.

- **Treating effect timing as immediate:** `useEffect` runs after commit and normally after the browser has had a chance to paint. Do not use a previous-value effect as a synchronous callback in the middle of render. For visual setup that must happen before paint, choose layout timing deliberately and accept its cost.

- **Using it as a workaround for bad state design:** If a reducer transition such as `SUBMIT_REQUEST -> SUBMIT_SUCCESS` is the actual business event, a reducer or event handler may communicate intent better than comparing two incidental renders. Previous-value comparison is an observation tool, not a replacement for a domain model.

## 7. Compare With Related Concepts

- **`usePrevious` vs current state:** State is the current value owned by the component; `usePrevious` is a read-only observation of what the prior committed render saw. Use state to drive the next UI, and use a previous-value ref only when the difference between two adjacent renders matters.

- **`useRef` vs `useState`:** Both persist data across renders, but state updates schedule renders while ref assignments do not. Use state for data the UI must react to; use a ref for mutable information that should survive renders without independently changing the UI.

- **`usePrevious` vs an effect cleanup function:** Cleanup receives the values captured by the effect setup that is being replaced or removed, which is ideal for disconnecting the old subscription or aborting the old request. `usePrevious` exposes the old value during the next render, which is useful for comparing render output. Use cleanup for undoing external work; use a previous-value hook for render-time comparison.

- **`usePrevious` vs reducer action history:** A previous-value hook only retains one prior value and can miss intermediate updates. A reducer can encode the event that caused the transition and retain explicit domain state. Use a reducer when the transition itself matters, not merely the before/after display.

- **Previous reference vs immutable snapshot:** `usePrevious` remembers identity; it does not clone data. Use immutable updates for cheap and reliable identity comparisons. Create a snapshot only when the old contents—not just the old reference—are required and the memory/CPU cost is justified.

## 8. 🧠 The Memory Hook — What Sticks

`usePrevious` is a rear-view mirror updated after the car reaches the next marker: during this render you see yesterday's value, and after commit that value becomes tomorrow's mirror image. The ref stores history silently; the render that caused the history is still driven by the real prop or state change.
