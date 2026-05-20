# Passive Listeners

## Detailed explanation
Passive listeners tell browser that event handler will not call `preventDefault()`. This lets browser scroll immediately without waiting for JavaScript, improving touch and wheel performance.

They matter for frontend performance because scroll handlers can block smooth scrolling when browser must wait to see if code cancels default behavior.

## 1. One-line mental model
Passive listener says, "I will not cancel default scroll."

## 2. Problem it solves
Scroll and touch events can feel janky when browser waits for JavaScript before scrolling.

## 3. Core idea
- Use `{ passive: true }`.
- Handler must not call `preventDefault()`.
- Common for `touchstart`, `touchmove`, `wheel`.
- Improves scroll responsiveness.
- Wrong for handlers that must cancel default.

## 4. Visual / analogy
Passive listener is green light for browser scroll.

```js
window.addEventListener("scroll", onScroll, { passive: true });
```

## 5. Minimal example

```js
window.addEventListener("wheel", handleWheel, { passive: true });
```

## 6. Real-world example

```js
document.addEventListener("touchmove", trackTouch, { passive: true });
```

Analytics can observe touch movement without blocking scroll.

## 7. Common interview questions
- What is passive listener?
- Why useful for scroll?
- Can passive listener call `preventDefault()`?
- Which events commonly use it?
- How does it improve performance?

## 8. Active recall test
1. What does passive promise?
2. What method becomes invalid?
3. Why does scroll improve?
4. Name two event types.
5. When not use passive?

## 9. Mistakes / traps
- Calling `preventDefault()` in passive listener.
- Marking listeners passive when cancel needed.
- Thinking passive makes handler faster; it mainly unblocks browser.
- Using scroll listener when IntersectionObserver better.

## 10. Compare with related concepts
- **Passive vs active listener:** cannot cancel vs may cancel.
- **Passive listener vs throttle:** browser scroll optimization vs callback frequency control.
- **Passive listener vs IntersectionObserver:** event handling vs browser observation.

## 11. Summary from memory
Explain why passive touch listener improves scroll responsiveness.

## 12. Spaced revision prompts
- 1 day: Define passive listener.
- 3 days: Explain `preventDefault` limitation.
- 7 days: Use passive with wheel.
- 14 days: Compare passive and throttle.

