# useLayoutEffect

## 1. Why This Exists — The Problem First

Suppose a tooltip renders beside a button. On the first render, the component does not yet know the button's screen coordinates, so it may start from a temporary position such as `{ top: 0, left: 0 }`. If the measurement happens in `useEffect`, the browser can paint that bad position first. The user sees the tooltip jump from the corner to the button a moment later.

That one-frame jump is a timing bug, not a calculation bug. React needs an escape hatch for work that must happen after the new DOM exists but before that DOM is shown. `useLayoutEffect` is that escape hatch. It is deliberately narrow because it pauses the browser's opportunity to paint.

## 2. The Analogy — Make It Obvious

Think of a theater crew preparing a stage. React's render phase is the crew reading the set plan. The commit phase is the crew moving the actual props onto the stage. A layout effect is the stage manager checking the real set while the curtain is still closed: they measure the doorway, move a prop into the correct position, and only then open the curtain. The audience never sees the intermediate arrangement.

The curtain is the browser's paint. A `ref` is the stage manager's reference to a real prop. `getBoundingClientRect()` is the measuring tape. A state update inside the layout effect is a request to revise the set before the audience sees it. By contrast, `useEffect` is work done after the curtain has opened: ideal for fetching, subscriptions, analytics, and timers, but too late to hide a visual correction.

The analogy has an important limit: the stage manager is not allowed to take as long as they want. Every millisecond spent in a layout effect delays the audience seeing the new scene. It is a pre-paint checkpoint, not a general-purpose early callback.

## 3. How It Actually Works — The Full Explanation

React updates the UI in two broad stages. During render, React calls components and calculates what the next tree should be. That work must stay pure: there is no reliable DOM node to measure, and a concurrent render may be paused or discarded. During commit, React applies the chosen changes to the real DOM. This is the point at which the new elements exist.

After DOM mutations and ref attachment, React runs layout-effect cleanup for the previous committed effect when its dependencies changed, then runs the new `useLayoutEffect` setup synchronously. The callback can now read the committed DOM. If it calls a state setter, React performs the resulting update before the browser is allowed to paint this commit's result. The user therefore sees the corrected result, not the intermediate one.

The usual sequence is:

```text
render → commit DOM and refs → layout-effect cleanup → layout-effect setup
       → browser style/layout/paint → passive-effect cleanup/setup
```

The browser may calculate layout lazily. Reading `getBoundingClientRect()`, `offsetWidth`, or similar geometry can force it to calculate current layout before returning. That is useful when positioning something, but repeated read/write cycles can cause layout thrashing. Keep the measurement and the required correction small, and avoid unrelated computation in the callback.

The dependency array has the same meaning as for `useEffect`: React compares each dependency with its previous value using `Object.is`. A changed dependency causes cleanup followed by setup. An empty array means the effect is for the component's mount, with cleanup on unmount, although development Strict Mode intentionally runs a mount-cleanup-mount cycle to expose non-idempotent code. The effect must therefore undo subscriptions, event listeners, and other external work.

`useLayoutEffect` is a client-side hook. Server rendering has no `window`, document, or layout to measure, so React cannot run it on the server and warns in the usual SSR setup. The server HTML must still match the client's initial render. If the component only becomes meaningful once the DOM exists, render it from a client-only boundary or use a safe initial layout and perform non-critical work in `useEffect`. Do not hide a hydration mismatch by reading browser globals during render.

The hook's signature is:

```tsx
useLayoutEffect(setup, dependencies?)
```

`setup` may return a cleanup function. The hook does not make arbitrary DOM mutation safe; it only gives that mutation a precise point after React's commit. Prefer declarative JSX, and use this hook when a DOM read and an immediate visual correction are genuinely coupled.

## 4. Real Code — See It Working

The following is a complete browser example for a React 18+ Vite-style TypeScript app. Put the first block in `src/main.tsx` and the second in `src/index.css`. It measures a real button, positions a tooltip before paint, remeasures when the button's label changes or the window resizes, and cleans up the resize listener. The initial `visible` state keeps the tooltip out of the DOM until the first measurement is available.

```tsx
// src/main.tsx
import { StrictMode, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

type Point = { top: number; left: number };

function Tooltip({
  targetRef,
  measureKey,
}: {
  targetRef: RefObject<HTMLButtonElement | null>;
  measureKey: string;
}) {
  const [point, setPoint] = useState<Point>({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const measure = () => {
      const rect = target.getBoundingClientRect();

      // Keep the measurement and visual correction in the same pre-paint window.
      setPoint({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
      setVisible(true);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [targetRef, measureKey]);

  if (!visible) return null;

  return (
    <div
      className="tooltip"
      role="status"
      style={{ top: point.top, left: point.left }}
    >
      Saved locally
    </div>
  );
}

function SaveButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [saved, setSaved] = useState(false);

  return (
    <main className="demo-shell">
      <button ref={buttonRef} onClick={() => setSaved(true)}>
        {saved ? 'Saved' : 'Save draft'}
      </button>
      <Tooltip targetRef={buttonRef} measureKey={saved ? 'saved' : 'draft'} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SaveButton />
  </StrictMode>,
);
```

```css
/* src/index.css */
body {
  margin: 0;
  font: 16px system-ui, sans-serif;
}

.demo-shell {
  display: grid;
  place-items: center;
  min-height: 100vh;
}

button {
  padding: 0.7rem 1rem;
}

.tooltip {
  position: fixed;
  transform: translateX(-50%);
  padding: 0.35rem 0.6rem;
  color: white;
  background: #222;
  border-radius: 0.35rem;
  pointer-events: none;
}
```

This second fixture shows the timing difference without depending on a test runner. It logs the order from one committed update. In an actual browser, passive effects are generally deferred until after the browser has had a chance to paint; React may choose an earlier flush for interaction-driven work, so “after paint” is the practical default, not a promise that every passive callback is late in every scheduling case.

```tsx
import { useEffect, useLayoutEffect } from 'react';

export function CommitTimeline() {
  useLayoutEffect(() => {
    console.log('layout: DOM is committed; paint is still blocked');
    return () => console.log('layout cleanup');
  }, []);

  useEffect(() => {
    console.log('passive: React scheduled ordinary post-commit work');
    return () => console.log('passive cleanup');
  }, []);

  return <p>Open the browser console.</p>;
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is `useLayoutEffect`, and when does it run?**

It is a client-side React hook for synchronous work after React has committed DOM mutations and attached refs, but before the browser paints the committed frame. It is useful when code must measure the DOM or make a visual correction before the user can see an intermediate state. It is not a replacement for render logic or for ordinary side effects.

**Q: How is `useLayoutEffect` different from `useEffect`?**

Both synchronize with something outside the component's pure render calculation and both use dependency comparison and cleanup. The timing is the important difference: a layout effect runs in React's synchronous commit path and can block paint; a passive effect is normally flushed after paint and does not hold the first visual frame hostage. Use the layout version only when being one frame late is visible or when a committed DOM measurement must immediately determine the visual result. Use `useEffect` for network requests, subscriptions, logging, timers, and other work that does not need pre-paint layout.

**Q: Why does `useLayoutEffect` prevent a tooltip from flickering?**

The first render can use a temporary position because the component has not measured the target yet. A layout effect reads the committed target rectangle, updates the position, and lets React commit that correction before paint. With `useEffect`, the temporary position may be painted first, so the user sees the tooltip jump. The hook does not make measurement free; it simply places the measurement before the frame becomes visible.

**Q: Does a state update inside a layout effect cause another render?**

Yes. The setter schedules a state update, and React can process the resulting render and commit before the browser paints. This is why the pattern works for measuring and then positioning. It also means an unconditional setter can create a render loop or make every commit more expensive. Store only a changed value, use a stable dependency list, and avoid setting state when the measurement is already equal.

**Q: Why can layout effects hurt performance?**

The browser cannot paint while the synchronous commit work is still running. A slow callback, a forced layout read followed by many writes, or a cascade of state updates increases input-to-paint latency. Prefer one small measurement, batch the necessary style/state correction, and move work that does not affect the current frame to `useEffect` or an event handler.

**Q: What happens to `useLayoutEffect` during server rendering?**

There is no DOM on the server, so React cannot perform the layout measurement there and warns in common SSR environments. The hook starts on the client after hydration. Keep the server output and the client's initial render consistent; if the UI fundamentally depends on browser geometry, isolate it behind a client-only boundary or use a safe placeholder until the client can measure.

**Q: How does Strict Mode affect a layout effect?**

In development, Strict Mode may run setup, cleanup, and setup again on mount. This is an intentional stress test. A layout effect must remove what it adds and must tolerate being initialized again. A resize listener without matching removal, for example, can be attached twice in development and signals a real cleanup bug.

**Q: Can I use `useLayoutEffect` for data fetching or subscriptions because it runs sooner?**

You can technically start such work there, but it is the wrong default. Fetching does not need a pre-paint DOM measurement, and placing it in the layout path delays the first frame for no visual benefit. Use `useEffect` for those synchronizations, with cancellation or cleanup where appropriate.

## 6. The Traps — What Goes Wrong

**“Earlier is always better.”** A layout effect being earlier is useful only when the current frame would otherwise be visibly wrong. For everything else, earlier means more work sits between commit and paint. Ask: “Does this callback need a committed DOM measurement to determine what the user sees in this frame?” If not, use a passive effect or an event handler.

**Measuring during render.** A component body may run before a DOM node exists, and concurrent React can discard that render. Reading `ref.current` or calling `getBoundingClientRect()` during render couples calculation to a mutable outside system. Put the read in a layout effect, where React has committed the node, or in an event handler when the measurement is user-triggered.

**Writing and then reading layout repeatedly.** A loop that changes a style, reads geometry, changes another style, and reads again can force the browser to recalculate layout repeatedly. Read the values you need first, compute the result, then apply the smallest set of writes. Do not turn one layout effect into a layout engine.

**Unconditional state updates.** This pattern is dangerous:

```tsx
useLayoutEffect(() => {
  setSize(ref.current?.getBoundingClientRect().width ?? 0);
});
```

With no dependency array, it runs after every commit and schedules another update. Even with dependencies, update only when the new measurement matters, and make the effect's dependencies describe the inputs that require re-measurement.

**Assuming the effect runs on the server.** It does not. Browser globals must not be read during server render, and the server must not emit markup that only the first client layout effect can explain. Treat the SSR warning as a design signal, not as noise to suppress.

**Forgetting Strict Mode cleanup.** A layout effect that adds a listener, observer, or imperative widget must return cleanup. Development's extra setup cycle makes leaks visible early, and production features can also mount, hide, reveal, or replace subtrees in ways that require correct teardown.

## 7. Compare With Related Concepts

**`useLayoutEffect` vs `useEffect`.** Layout effects run synchronously after commit and before paint; passive effects are normally flushed after paint. Use `useLayoutEffect` for a DOM measurement plus immediate visual correction, and default to `useEffect` for non-visual synchronization.

**`useLayoutEffect` vs render.** Render calculates a description of UI and may be restarted; a layout effect runs only after a selected tree has been committed and can inspect the real DOM. Keep render pure; put DOM reads and imperative corrections in the effect.

**`useLayoutEffect` vs a callback ref.** A callback ref runs when React attaches or detaches a particular node, which is useful for reacting to that node becoming available. A layout effect is better when the work depends on committed layout, multiple refs, dependencies, or cleanup over time. Use the smallest seam that matches the job.

**`useLayoutEffect` vs `useInsertionEffect`.** Insertion effects are an earlier, specialized hook intended primarily for CSS-in-JS libraries to inject styles before layout effects. Application code should not use it for measurements or ordinary DOM work. Use a layout effect for measuring committed layout; use a passive effect when pre-paint timing is unnecessary.

## 8. 🧠 The Memory Hook — What Sticks

`useLayoutEffect` is the closed-curtain inspection: React has put the real DOM on stage, you measure or correct it, and only then does the browser let the audience see the frame. If the correction is not visual and not needed before paint, leave the curtain alone and use `useEffect`.
