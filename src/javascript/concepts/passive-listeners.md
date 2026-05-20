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

#### What is a passive listener?
- **The Engine Mechanism (Why it behaves this way):** When a DOM event fires (such as `touchstart` or `wheel`), the browser's compositor thread (responsible for painting frames to the screen) intercepts the input. Normally, the compositor thread must block and coordinate with the main thread (where JavaScript executes on the Call Stack) because the handler might call `preventDefault()` to cancel the default browser behavior (e.g., scrolling). By registering a passive listener via `{ passive: true }`, the developer guarantees that the callback will not call `preventDefault()`. This allows the compositor thread to execute the default action (scrolling/zooming) immediately on a separate thread, without waiting for the main thread's Call Stack to clear, allocate event objects, or evaluate lexical scopes.
- **The Unforgettable Mental Model:** Think of the compositor thread as a highway toll booth. Normally, the toll operator (compositor) must make a telephone call to the central office (JavaScript main thread) to ask, "Is it okay if I let this car pass?" for every single car. A passive listener is a pre-approved fast-pass lane: the office has signed a binding agreement saying, "We will never block traffic. Just let them through immediately."
- **The Trap:** Interviewers might ask if passive listeners speed up the execution of your JavaScript. They don't! The JavaScript code runs at the exact same speed. What changes is the decoupling of the browser's compositing/rendering pipeline from the JavaScript execution thread, preventing JS bottlenecks from dragging down the visual frame rate.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'A passive event listener is an option passed to `addEventListener` that explicitly promises the browser's rendering engine that the handler will not cancel the default behavior by calling `preventDefault()`. By registering a listener as passive, we allow the compositor thread to perform immediate page scrolling or zooming without blocking on the main thread, which avoids frame drops and scrolling jank.'"

#### Why useful for scroll?
- **The Engine Mechanism (Why it behaves this way):** During scrolling (via `touchstart`, `touchmove`, or `wheel`), the browser must determine if the default scroll action is canceled. Under standard circumstances, the compositor thread halts frame dispatching until the main JavaScript thread's Event Loop picks up the scroll event, executes the listener, and returns. If the main thread is busy with complex computations, React reconciliation, or garbage collection, this synchronous handshake creates frame delay (jank). A passive scroll listener avoids this handshake completely, allowing the compositor thread to update the scroll offset immediately on its own high-priority thread.
- **The Unforgettable Mental Model:** Imagine you're riding an elevator. When you hit a button, instead of checking with a central slow security guard who has to look up your clearance in a thick book, the elevator doors immediately start closing.
- **The Trap:** Not all scroll events can be made passive. Indeed, the actual `scroll` event itself is already un-cancelable by specification (you cannot cancel it with `preventDefault()`), so making a `scroll` listener passive is structurally redundant. The real benefit comes when you listen to *touch* or *wheel* events (`touchstart`, `touchmove`, `wheel`) which *can* cancel scrolling if not passive.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Passive listeners are critical for scroll performance because the touch and wheel events that drive scrolling are cancelable by default. Without `{ passive: true }`, the compositor thread is forced to delay scrolling until the main thread evaluates the JavaScript handler, leading to scroll lag. By using passive listeners, we guarantee the rendering engine can scroll immediately, achieving a buttery-smooth 60 or 120 FPS visual experience.'"

#### Can passive listener call `preventDefault()`?
- **The Engine Mechanism (Why it behaves this way):** Under the hood, if you register a listener with `{ passive: true }` and then invoke `event.preventDefault()`, the browser engine ignores the request. Specifically, the engine marks the internal event state flags as non-cancelable. In the browser console, the engine throws a non-blocking console warning (like `Unable to preventDefault inside passive event listener invocation`).
- **The Unforgettable Mental Model:** Signing a binding contract stating, "I will not buy this house," and then trying to buy it. The bank (browser engine) simply points at the contract, rejects your payment request, and sounds a warning siren, but doesn't crash the entire city.
- **The Trap:** Believing that calling `preventDefault()` in a passive listener will throw a runtime JavaScript error that crashes your application. It does not throw an exception; it merely prints a warning to the console and is ignored.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Technically, yes, you can physically write the code to call `preventDefault()`, but it will have no effect. The browser's event system will ignore the call and issue a console warning. The default behavior will proceed uninterrupted because the compositor thread has already initiated the action.'"

#### Which events commonly use it?
- **The Engine Mechanism (Why it behaves this way):** The events that benefit are those that can block UI scrolling or zooming because they trigger on user gestures before the rendering engine updates the viewport. These are `touchstart`, `touchmove`, `wheel`, and `mousewheel`. In modern browsers (Chrome 56+, Safari 11.1+, Firefox 61+), these events are actually registered as passive by *default* on `window`, `document`, and `document.body` to protect performance.
- **The Unforgettable Mental Model:** Guardrails on a winding mountain road. The browser automatically places guardrails (default passive status) on the highest-risk scroll/touch routes so users don't drive off the performance cliff.
- **The Trap:** Assuming all events are passive by default. The browser only defaults `touchstart`/`touchmove`/`wheel` to passive on root-level nodes (`window`, `document`, `body`). If you bind a `touchmove` listener to a specific internal `div`, it might not default to passive, and you should declare it explicitly.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'The most common events are touch gestures and wheel scrolling, specifically `touchstart`, `touchmove`, and `wheel`. Because these are the primary drivers of viewport movement, modern browsers actually auto-default these events to passive at the window, document, and body levels, but we should still explicitly apply them on nested scrollable elements to ensure cross-browser consistency.'"

#### How does passive listener improve performance?
- **The Engine Mechanism (Why it behaves this way):** The improvement is measured in Input Latency and Frame Rate (FPS). When a user scrolls, the input event is queued on the browser's I/O thread. Without a passive listener, the compositor thread must block until the main thread executes the event listener callback in the Microtask/Macrotask queues of the Event Loop. If the main thread's Call Stack is blocked (e.g. running heavy JS), this blocks the frame render, causing a stutter (layout shift or delay). A passive listener breaks this synchronous dependency, allowing the I/O and compositor threads to render scrolling at 60Hz/120Hz while the main thread processes JS asynchronously.
- **The Unforgettable Mental Model:** A busy restaurant kitchen. Instead of the waiter (compositor thread) standing and waiting inside the kitchen for the chef (main thread) to confirm if a table ordered a simple glass of water (scrolling), the waiter immediately pours the water and checks in with the chef later when the chef is free.
- **The Trap:** Confusing passive event listeners with optimizing the event handler callback's execution time. Passive listeners do not make your JavaScript execution faster; they prevent slow JavaScript from blocking the browser's hardware-accelerated rendering pipeline.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'It improves performance by decoupling the hardware-accelerated compositor thread from the main JavaScript thread. Instead of forcing the compositor to block on the Event Loop to check if `preventDefault()` will be called, the compositor immediately paints the scrolling viewport, completely eliminating touch-scrolling lag even when the main thread is fully saturated.'"

## 8. Active recall test

#### 1. What does passive promise?
- **Explanation/Answer:** It promises the browser engine that the event listener will not call `event.preventDefault()`. This allows the browser to execute the default action (like scrolling) immediately on the compositor thread without waiting for the main thread to run the JavaScript handler.

#### 2. What method becomes invalid?
- **Explanation/Answer:** `event.preventDefault()` becomes invalid and ineffective. If called inside a passive listener, it is ignored by the engine, which prints a warning to the console, and the default browser action is still performed.

#### 3. Why does scroll improve?
- **Explanation/Answer:** Scrolling improves because the compositor thread can render the scroll movement instantly without blocking on a synchronous handshake with the main JavaScript thread, bypassing any main-thread CPU bottlenecks (like heavy script execution or layout reflows).

#### 4. Name two event types.
- **Explanation/Answer:** `touchmove` and `wheel` (or `touchstart`). These are input-intensive gestures that default to triggering scroll behaviors.

#### 5. When not use passive?
- **Explanation/Answer:** You should not use a passive listener when you explicitly *need* to prevent the browser's default action. For example, if you are building a custom swipe-to-dismiss gesture, a custom drag-and-drop container, or a pinch-to-zoom component where the default browser scrolling or bouncing behavior must be suppressed.

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

