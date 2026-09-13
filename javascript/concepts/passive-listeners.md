# Passive Listeners

## 1. Why This Exists — The Problem First

Imagine a user swiping a page to scroll while the main thread is busy doing unrelated JavaScript. If the browser has a non-passive `touchmove` or `wheel` listener, it may have to wait for that listener to finish before it knows whether the code will cancel scrolling with `preventDefault()`. The result is input that feels stuck even though the handler only wanted to observe the gesture.

This is especially painful for analytics, logging, and lightweight gesture tracking. Those listeners do not need to control scrolling, but without an explicit promise they can still sit on the decision path for the browser's default action. Passive listeners let the browser treat those observers as non-blocking, while keeping cancellation available for interactions that genuinely need it.

## 2. The Analogy — Make It Obvious

Think of a railway crossing with an automatic gate. A train is the browser's default action—such as scrolling in response to a wheel or touch gesture. The signal operator is the event listener. If the operator is allowed to stop the train, the gate may need to wait for a response before opening safely.

Registering the listener as passive is a signed instruction: “I only watch the train; I will never stop it.” The gate can open for the train immediately, and the observer can still record what happened. If the observer later tries to press the emergency stop, the request is ignored and the browser may warn in the console. If the application really must stop the train, the listener cannot be passive.

The analogy has an important limit: passive does not move the observer to another thread or make the observer's work cheap. The observer still runs as JavaScript on the main thread. The promise only removes the browser's need to wait for that observer before starting a cancelable default action.

## 3. How It Actually Works — The Full Explanation

`addEventListener` accepts an options object. When `passive: true` is present, the listener is registered with a contract that its callback will not cancel the event by calling `event.preventDefault()`.

For a cancelable input event, the sequence is roughly:

1. The browser receives the input and determines the event path and possible default action.
2. A non-passive listener means the browser must preserve the possibility that JavaScript will call `preventDefault()`. A slow listener can therefore delay the default action.
3. A passive listener removes that possibility for its callback. The browser may begin the default action without waiting for that callback to decide whether to cancel it.
4. The callback still runs and can read the event, update application state, or send a small measurement. Its work still competes with other main-thread JavaScript.

The useful events are usually `touchstart`, `touchmove`, and `wheel`, because their default behavior can involve scrolling or zooming. The basic `scroll` event is different: it is not cancelable, so `preventDefault()` cannot stop scrolling there. Marking a `scroll` listener passive is harmless but does not provide the important cancellation-related optimization; the valuable decision is usually whether the input event that drives the scroll can be canceled.

Passive and cancelable are related but not identical. `event.cancelable` describes whether the event's default action can be canceled in the current dispatch. `passive` describes the promise made by one particular listener. A passive listener can receive an event that is normally cancelable, but its own `preventDefault()` call has no effect.

Modern browsers also apply browser-specific passive defaults for some `wheel` and touch listeners on root-level targets such as `window`, `document`, and `document.body`. Do not rely on that implicit behavior when the code's intent matters. State the option explicitly. In particular, if a custom interaction must cancel the default action, explicitly use `{ passive: false }`; otherwise a browser's root-level default may make the cancellation fail.

Passive does not replace performance work. A listener that performs a large calculation, forces layout repeatedly, or schedules too much rendering can still make the page sluggish after it runs. Passive only prevents that listener from being the reason the browser must wait before starting a cancelable default action. Keep the callback small, throttle high-frequency application work when appropriate, and use CSS `touch-action` where it expresses the gesture policy more directly for pointer interactions.

## 4. Real Code — See It Working

This browser example observes wheel input while leaving the container's native scrolling in charge. Save it as an `.html` file and open it in a browser; the counter updates while the element continues to scroll normally.

```html
<div id="feed" style="height: 180px; overflow: auto; border: 1px solid #999">
  <p>Scroll this panel. The listener measures input; it does not own scrolling.</p>
  <p>More content keeps the panel scrollable.</p>
  <p>More content keeps the panel scrollable.</p>
  <p>More content keeps the panel scrollable.</p>
  <p>More content keeps the panel scrollable.</p>
  <p>More content keeps the panel scrollable.</p>
</div>
<output id="count">Wheel events observed: 0</output>

<script>
  const feed = document.querySelector("#feed");
  const count = document.querySelector("#count");
  let wheelEvents = 0;

  feed.addEventListener("wheel", () => {
    // The browser can keep the native scroll decision independent of this observer.
    wheelEvents += 1;
    count.value = `Wheel events observed: ${wheelEvents}`;
  }, { passive: true });
</script>
```

Here is the opposite case. A custom horizontal gallery may need to consume a wheel gesture instead of allowing the panel to scroll vertically. That listener must opt out of passivity because cancellation is part of its job.

```js
// This local fixture stands in for the browser DOM in this runnable example.
const gallery = {
  scrollLeft: 0,
  addEventListener(type, callback, options) {
    this.listener = { type, callback, options };
  },
  dispatch(type, event) {
    if (this.listener?.type === type) this.listener.callback(event);
  },
};

gallery.addEventListener("wheel", (event) => {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    event.preventDefault(); // Valid only because passive is explicitly false.
    gallery.scrollLeft += event.deltaX;
  }
}, { passive: false });

gallery.dispatch("wheel", {
  deltaX: 40,
  deltaY: 10,
  preventDefault() {
    this.defaultPrevented = true;
  },
});
```

If the first example called `event.preventDefault()`, the call would not cancel the default action and the browser could print a warning. The fix is not to make every listener active; it is to decide whether cancellation is truly required and choose the option that matches that decision.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does a passive event listener promise?**

It promises that this callback will not cancel the event's default action with `preventDefault()`. That promise lets the browser avoid waiting for this listener before beginning a cancelable action such as scrolling. The callback still runs normally on the main thread.

**Q: Does a passive listener make JavaScript execute faster?**

No. It does not reduce the callback's algorithmic cost, move it to a worker, or make a long task short. It changes the browser's dependency: the browser does not have to wait for this callback to learn whether it should start the default action. A 100 ms passive callback is still 100 ms of main-thread work and can still delay later input or rendering.

**Q: What happens if `preventDefault()` is called inside a passive listener?**

The call has no effect, so the default action is not canceled. Browsers commonly emit a console warning. This is a deliberate consequence of the listener's contract, not an exception that application code should depend on catching.

**Q: Which events are the usual candidates?**

`touchstart`, `touchmove`, and `wheel` are the common cases because they can participate in scrolling or zooming decisions. `scroll` itself cannot be canceled, so passive is generally redundant there. Check the event's actual default action and whether the handler needs cancellation rather than applying the option mechanically.

**Q: When should a listener be non-passive?**

Use `{ passive: false }` when the interaction intentionally prevents a browser default—for example, a custom gesture that consumes a wheel event or a legacy touch interaction that must suppress scrolling. Make that choice explicit and keep the cancellation logic narrow. For many modern pointer interactions, declaring the gesture with CSS `touch-action` is a clearer complement or alternative.

**Q: Are listeners passive by default?**

The DOM API's general default is not a universal “always passive” rule. Browsers have added special root-target defaults for some wheel and touch events, and those defaults vary by event, target, and browser. Code that depends on cancellation should explicitly say `{ passive: false }`; code that is observation-only should explicitly say `{ passive: true }` so its intent is clear on every target.

**Q: Is passive the same as throttling a scroll handler?**

No. Passive controls whether the browser may wait for the listener before a default action. Throttling controls how often the application performs work in response to a stream of events. A listener can be passive and still do too much work on every event; a listener can be throttled and still incorrectly block cancellation. They solve different problems and can be used together.

## 6. The Traps — What Goes Wrong

- **Calling `preventDefault()` after adding `{ passive: true }`.** The cancellation is ignored, often with a warning. Remove the call if the listener is only observing, or explicitly register it as non-passive if cancellation is required.
- **Making every input listener passive.** This can silently break custom scrolling, drag, swipe, or zoom behavior. First decide who owns the default action: the browser or the application.
- **Treating passive as a performance cure-all.** Passive removes one wait in the input path; it does not optimize the callback. Profile and reduce the callback's work, throttle expensive reactions, and avoid forced layout when the handler runs frequently.
- **Using `passive: true` on `scroll` and claiming it fixes scroll jank.** A `scroll` event is not cancelable, so it was not blocking the default scroll decision in the first place. Look for cancelable `wheel` or touch listeners, long tasks, layout work, or excessive rendering instead.
- **Relying on browser defaults.** A listener attached to `window` may have a different implicit passive behavior from one attached to a nested element, and browser behavior is not a portable application contract. Be explicit about both the observation-only and cancellation cases.
- **Confusing `preventDefault()` with propagation control.** Passive affects cancellation of the browser's default action. It does not stop an event from bubbling. Use `stopPropagation()` or `stopImmediatePropagation()` only when the separate propagation problem is the one you intend to solve.

## 7. Compare With Related Concepts

- **Passive listener vs non-passive listener:** Passive promises not to cancel and can remove the browser's need to wait; non-passive preserves the ability to cancel. Use passive for observation-only input and non-passive only when cancellation is required.
- **Passive listener vs throttling:** Passive changes the browser's default-action dependency; throttling reduces how often your code performs work. Use passive for input-path responsiveness and throttling for expensive repeated application work.
- **Passive listener vs `scroll` listener:** Passive matters most before a cancelable scroll decision, such as on `wheel` or touch input. A `scroll` listener observes scrolling after it happens and cannot cancel it.
- **Passive listener vs CSS `touch-action`:** Passive is a JavaScript listener contract. `touch-action` declares which pointer gestures an element allows the browser to handle in CSS. Prefer `touch-action` for a stable pointer-gesture policy, and use passive listeners when JavaScript needs to observe input without canceling it.
- **`preventDefault()` vs `stopPropagation()`:** `preventDefault()` cancels a browser action; `stopPropagation()` controls travel to other targets. A passive listener gives up the first ability, not the second.

## 8. 🧠 The Memory Hook — What Sticks

Passive is the browser's “you may proceed” stamp: the listener can watch the gesture, but it has surrendered the emergency brake. It does not make the observer faster—it simply stops the browser from waiting for an observer that promised never to cancel.
