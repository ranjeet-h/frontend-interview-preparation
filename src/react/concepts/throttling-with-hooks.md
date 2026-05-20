# Throttling With Hooks

## Detailed explanation
Throttling limits how often an action can run during a continuous stream of events. Unlike debounce, throttle keeps running at a controlled interval while events continue.

Throttling is useful for scroll, resize, pointer move, drag, and performance-sensitive event streams. In hooks, refs often track the last execution time or pending timer without causing renders.

## 1. One-line mental model
Throttling runs an action at most once per time window.

## 2. Problem it solves
High-frequency events can overwhelm rendering, calculations, or network calls.

## 3. Core idea
- Track last run time.
- Ignore or delay calls inside the window.
- Use refs for mutable timing data.
- Cleanup pending timers.
- Use for continuous event streams.

## 4. Visual / analogy
Throttle is like a turnstile that lets one person through every few seconds.

```txt
Events:  x x x x x x x
Runs:    x     x     x
```

## 5. Minimal example

```tsx
function useThrottleCallback(callback: () => void, delay: number) {
  const lastRun = React.useRef(0);
  return React.useCallback(() => {
    const now = Date.now();
    if (now - lastRun.current >= delay) {
      lastRun.current = now;
      callback();
    }
  }, [callback, delay]);
}
```

## 6. Real-world example

```tsx
const handleScroll = useThrottleCallback(() => {
  setScrollY(window.scrollY);
}, 100);
```

## 7. Common interview questions
#### What is throttling?
- **The Engine Mechanism (Why it behaves this way):** Throttling limits the execution rate of a function to at most once per specified time window. Unlike debounce, which waits for inactivity, throttle fires during continuous activity at a controlled interval. In React hooks, this is typically implemented with `useRef` to track the last execution timestamp and `Date.now()` to check if enough time has elapsed. The ref avoids re-renders since updating it doesn't trigger React's rendering cycle.
- **The Unforgettable Mental Model:** The **Metronome**. A metronome clicks at a steady beat regardless of how fast the musician plays. Throttle ensures your function fires at a steady rhythm, even when events are flooding in faster than that rhythm.
- **The Trap:** Confusing throttle with debounce. Throttle guarantees periodic execution during activity; debounce guarantees a single execution after activity stops.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Throttling limits how often a function can execute — it fires at most once per time window. Unlike debounce, which waits for a pause, throttle keeps firing during continuous activity at a controlled rate. In React, I implement it with refs to track the last execution time without causing re-renders, and `Date.now()` to check if the time window has elapsed."

#### Throttle vs debounce?
- **The Engine Mechanism (Why it behaves this way):** The fundamental difference is timing strategy. Debounce uses a reset-on-each-event model: every event cancels the previous timer and starts a new one, so the action fires only after the last event plus the delay. Throttle uses a time-window model: the first event fires immediately (or after the first window), then subsequent events are ignored until the window expires, at which point the next event fires. Debounce produces one execution; throttle produces many executions at a controlled rate.
- **The Unforgettable Mental Model:** The **Sprinkler vs. the Fire Hose**. Debounce is a sprinkler that only turns on after the rain stops. Throttle is a fire hose that sprays at a controlled, steady rate while the fire burns.
- **The Trap:** Using debounce when you need continuous feedback. A debounced scroll handler won't update until the user stops scrolling, making scroll-based UI feel broken.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The key difference is when they fire. Debounce fires once after a period of inactivity — it's for 'do this when the user stops.' Throttle fires repeatedly at a controlled rate during activity — it's for 'do this regularly while the user is acting.' I use debounce for search and validation, throttle for scroll, resize, and drag events."

#### How do hooks implement throttle?
- **The Engine Mechanism (Why it behaves this way):** A throttle hook uses `useRef` to store the last execution timestamp. The returned callback checks `Date.now() - lastRun.current >= delay`. If true, it updates `lastRun.current` and executes the callback. If false, it silently ignores the call. The callback is typically wrapped in `useCallback` to maintain a stable reference. The ref is crucial because updating it doesn't trigger a re-render, keeping the throttle logic silent from React's perspective.
- **The Unforgettable Mental Model:** The **Bouncer with a Watch**. The bouncer checks their watch each time someone tries to enter. If enough time has passed since the last person entered, they let them in and note the time. If not, they turn them away without drama.
- **The Trap:** Using `useState` instead of `useRef` for the timestamp. Updating state on every throttle check would cause a re-render for every event, defeating the performance purpose of throttling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement throttle with `useRef` to store the last execution time and a callback that checks if enough time has elapsed. If the window has passed, I update the ref and execute the callback. If not, I ignore the call. The ref is essential because it updates without triggering re-renders. I wrap the callback in `useCallback` for stable identity."

#### Why use refs for throttle timing?
- **The Engine Mechanism (Why it behaves this way):** `useRef` stores a mutable `.current` property that persists across renders without triggering re-renders when updated. Throttle logic needs to track timing state (last execution time, pending timer) that changes frequently — potentially dozens of times per second during scroll or mouse move events. If this were stored in `useState`, every update would schedule a React re-render, causing severe performance degradation. Refs provide a silent, mutable storage that React's rendering engine ignores.
- **The Unforgettable Mental Model:** The **Backstage Notebook**. The stage manager (ref) keeps notes backstage that don't affect the performance (render). The audience (UI) never sees the notes being updated, but they're crucial for coordinating the show.
- **The Trap:** Reading a ref during render and expecting the component to update when it changes. Refs are for storing values that don't drive UI. If the throttle state needs to affect rendering, you need a separate state variable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Refs are essential for throttle timing because they update without triggering re-renders. During scroll or mouse move events, the throttle check runs dozens of times per second. If I used `useState` for the timestamp, each check would schedule a React re-render, causing severe jank. Refs give me mutable, persistent storage that's invisible to React's rendering cycle — perfect for timing metadata."

#### Where is throttle useful?
- **The Engine Mechanism (Why it behaves this way):** Throttle is useful for high-frequency event streams where you need continuous but limited updates. Scroll events fire on every pixel moved — throttle to 100ms intervals for scroll-based animations or lazy loading. Resize events fire continuously during window resizing — throttle for layout recalculations. Pointer/mouse move events fire on every pixel — throttle for drag-and-drop or drawing canvas. The controlled rate balances responsiveness with performance.
- **The Unforgettable Mental Model:** The **Sample Rate**. Like audio sampling — you don't need every microsecond of sound data; sampling at 44.1kHz captures everything the human ear can hear. Throttle samples events at a rate that captures the user's intent without overwhelming the system.
- **The Trap:** Using throttle for events that need immediate response. A throttled click handler that fires once per second would miss rapid clicks. Throttle is for continuous streams, not discrete actions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Throttle is ideal for high-frequency continuous events: scroll tracking for parallax or lazy loading, resize handling for responsive layouts, pointer move for drag-and-drop, and wheel events for custom scrolling. The key is that these events fire dozens or hundreds of times per second, and throttle reduces them to a manageable rate while maintaining continuous feedback."

#### How do you clean up throttled timers?
- **The Engine Mechanism (Why it behaves this way):** Some throttle implementations use a trailing timer to ensure the last event in a burst fires after the window expires. This timer must be cleared in the effect's cleanup function to prevent it from firing after the component unmounts. If using a timestamp-only approach (no timers), cleanup may not be needed for the throttle itself, but the event listener attached to the window still requires cleanup via `removeEventListener`.
- **The Unforgettable Mental Model:** The **Cleanup Crew**. After the event ends, the cleanup crew sweeps up any pending timers that haven't fired yet. Without them, the last timer fires into the void of an unmounted component.
- **The Trap:** Assuming timestamp-only throttle needs no cleanup. Even without timers, the event listener must be removed. And if the throttle has a trailing edge timer, it must be cleared to prevent post-unmount state updates.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: If my throttle uses a trailing timer, I clear it in the effect's cleanup to prevent post-unmount execution. Even with a timestamp-only approach, I always clean up the event listener with `removeEventListener`. The cleanup ensures no pending work fires after the component is gone, preventing memory leaks and stale state updates."

#### How do you test throttle?
- **The Engine Mechanism (Why it behaves this way):** Testing throttle requires controlling time and simulating rapid events. Fake timers (`vi.useFakeTimers()`) replace `Date.now()` and `setTimeout` with mock implementations. You fire multiple events in quick succession, advance time by the throttle window, and assert that the callback fired the expected number of times. For example, firing 10 events in 50ms with a 100ms throttle should result in exactly 1 execution.
- **The Unforgettable Mental Model:** The **Stress Test**. You bombard the throttle with events like a stress test, then fast-forward time to see if it held up — firing at the right rate and not exceeding the limit.
- **The Trap:** Testing throttle with real timers. The timing is too fast and non-deterministic — network latency, CPU load, and event loop scheduling make real-timer throttle tests flaky.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test throttle with fake timers. I enable them, fire multiple rapid events, advance time by the throttle window, and assert the callback fired the correct number of times. For a 100ms throttle with 10 events in 50ms, I expect 1 execution. After advancing another 100ms, I expect a second execution if another event fires. Fake timers make these tests deterministic and fast."

## 8. Active recall test
1. **What does throttle limit?**
   - **Explanation:** The frequency of function execution — at most once per specified time window. During continuous activity, throttle ensures the function fires at a controlled rate rather than on every single event, balancing responsiveness with performance.
2. **Is throttle quiet-time based?**
   - **Explanation:** No. Throttle fires during activity at regular intervals. Debounce is quiet-time based — it waits for a pause before firing. Throttle doesn't care about pauses; it enforces a maximum execution rate regardless of event pattern.
3. **Why use ref for last run time?**
   - **Explanation:** Updating a ref doesn't trigger a re-render. Throttle timing data changes frequently (potentially every event), and storing it in state would cause a re-render for every event, defeating the performance purpose. Refs provide silent, mutable storage.
4. **Name one throttle use case.**
   - **Explanation:** Scroll position tracking. Scroll events fire on every pixel moved — potentially hundreds of times per second. Throttling to 100ms intervals reduces this to ~10 updates per second, which is smooth enough for UI updates while preventing performance degradation.
5. **How is debounce different?**
   - **Explanation:** Debounce waits for a period of inactivity before firing once. Throttle fires repeatedly at a controlled rate during activity. Debounce is "do this after the user stops"; throttle is "do this regularly while the user acts."

## 9. Mistakes / traps
- Using debounce for scroll tracking when continuous updates are needed.
- Re-rendering on every event anyway.
- Forgetting cleanup for trailing calls.
- Capturing stale callback values.
- Choosing delay without UX testing.

## 10. Compare with related concepts
- **Throttle vs debounce:** throttle runs periodically; debounce waits.
- **Throttle vs requestAnimationFrame:** RAF aligns with paint; throttle uses time windows.
- **Throttle vs virtualization:** throttle reduces event work; virtualization reduces DOM work.

## 11. Summary from memory
Explain why scroll handlers often use throttling instead of debouncing.

## 12. Spaced revision prompts
- After 1 day: Define throttle.
- After 3 days: Build a throttle callback.
- After 7 days: Compare with debounce.
- After 14 days: Use throttle for scroll.

