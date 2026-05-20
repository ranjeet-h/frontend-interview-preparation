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
- What is throttling?
- Throttle vs debounce?
- How do hooks implement throttle?
- Why use refs for throttle timing?
- Where is throttle useful?
- How do you clean up throttled timers?
- How do you test throttle?

## 8. Active recall test
1. What does throttle limit?
2. Is throttle quiet-time based?
3. Why use ref for last run time?
4. Name one throttle use case.
5. How is debounce different?

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

