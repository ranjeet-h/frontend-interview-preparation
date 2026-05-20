# Pointer Events

## Detailed explanation
Pointer Events unify mouse, touch, and pen input under one event model. Instead of writing separate `mousedown`, `touchstart`, and pen handlers, code can use `pointerdown`, `pointermove`, `pointerup`, and related events.

They matter for drag-and-drop, drawing, sliders, resize handles, canvas tools, and mobile-friendly custom controls.

## 1. One-line mental model
Pointer Events provide one API for mouse, touch, and pen.

## 2. Problem it solves
Different input devices used to need separate event handling paths.

## 3. Core idea
- Use `pointerdown`, `pointermove`, `pointerup`.
- `pointerType` tells mouse/touch/pen.
- Pointer capture can keep receiving events.
- Works well for custom interactions.
- Needs accessibility fallback for keyboard.

## 4. Visual / analogy
Pointer Events are universal adapter for input devices.

```txt
mouse + touch + pen -> PointerEvent
```

## 5. Minimal example

```js
element.addEventListener("pointerdown", (event) => {
  console.log(event.pointerType);
});
```

## 6. Real-world example

```js
thumb.addEventListener("pointerdown", (event) => {
  thumb.setPointerCapture(event.pointerId);
});
```

Useful for sliders/drag handles.

## 7. Common interview questions
- What are Pointer Events?
- Why use pointer events instead of mouse/touch separately?
- What is `pointerType`?
- What is pointer capture?
- How do pointer events affect accessibility?

## 8. Active recall test
1. Which devices do pointer events cover?
2. Name three pointer events.
3. What does `pointerType` tell?
4. Why use pointer capture?
5. What non-pointer input must still work?

## 9. Mistakes / traps
- Ignoring keyboard accessibility.
- Handling only mouse events for mobile UI.
- Forgetting pointer cancellation.
- Not releasing capture when needed.

## 10. Compare with related concepts
- **Pointer vs mouse events:** pointer covers more devices.
- **Pointer vs touch events:** pointer unifies model.
- **Pointer capture vs event delegation:** capture redirects pointer stream; delegation listens at ancestor.

## 11. Summary from memory
Explain why custom slider should use Pointer Events plus keyboard support.

## 12. Spaced revision prompts
- 1 day: Define Pointer Events.
- 3 days: Explain `pointerType`.
- 7 days: Use pointer capture.
- 14 days: Add accessibility fallback.

