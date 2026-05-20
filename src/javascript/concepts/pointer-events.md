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

#### What are Pointer Events?
- **The Engine Mechanism (Why it behaves this way):** The `PointerEvent` interface represents hardware pointer devices (mouse, pen/stylus, touch contact points) by extending the legacy `MouseEvent` interface. Under the hood, the browser's hardware driver layer dispatches raw input coordinates to the browser process. The browser's window-manager and event-routing sub-system map these raw inputs into unified `PointerEvent` instances in heap memory, preserving all mouse properties (like button click masks, viewport offsets, clientX/clientY) while appending stylus/touch parameters (pressure, tiltX, tiltY, twist, width, height).
- **The Unforgettable Mental Model:** A universal game controller adapter. Instead of your game engine having to support three separate input cables (one old serial mouse cable, a tablet pen wire, and a touch screen matrix), you plug all three into a single USB hub called "Pointer API" which emits standardized button-presses and joystick-coordinates.
- **The Trap:** Thinking `PointerEvent` behaves exactly like a `MouseEvent` without styling adjustments. By default, on touchscreens, touch-action behaviors (like scrolling or double-tap zooming) are managed by the browser. If you start listening to pointer events, the browser might intercept them for gestures unless you explicitly set the CSS property `touch-action: none;` on the target element.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Pointer Events are a unified DOM event specification that inherits from and extends MouseEvents, consolidating input coordinates, pressure, and tilt across mouse, touch, and stylus hardware. By aggregating these into a single event stream—like `pointerdown` and `pointermove`—they eliminate the need to write redundant and buggy dual-event handling paths for mobile and desktop.'"

#### Why use pointer events instead of mouse/touch separately?
- **The Engine Mechanism (Why it behaves this way):** Historically, developers wrote complex hybrid event bindings to support both desktop mice and mobile touch screens, attaching handlers for both `mousedown` and `touchstart`. This resulted in double-handling bugs due to "phantom mouse events" (where mobile browsers emulate a 300ms delayed `mousedown`/`mouseup` sequence after a `touchstart` to maintain compatibility with legacy websites). To prevent this, developers had to call `e.preventDefault()` inside `touchstart` which also disabled default zoom/scroll. Pointer Events solve this at the browser engine level by routing a single, unified `PointerEvent` stream with hardware-specific properties, eliminating the delay and the need for defensive, device-specific logic checks.
- **The Unforgettable Mental Model:** Instead of maintaining two completely separate check-in desks at a hotel—one for VIPs (mice) and one for standard guests (touch), you have a single reception desk with a smart agent who inspects the guest's ID and directs them to the exact same check-in pipeline.
- **The Trap:** Forgetting that pointer events do not combine multi-touch into a single event object. For multi-touch gestures, each contact point is assigned its own unique `pointerId` and generates its own independent pointer events, whereas touch events aggregate all active touches in a `touches` array on a single event object.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'We use Pointer Events because they consolidate input logic and resolve the historical issues of duplicate click behaviors and 300ms delayed emulation events. They also give us unified access to device features like contact area size, pen pressure, and hover capability in a single, robust codebase without device-specific branching.'"

#### What is `pointerType`?
- **The Engine Mechanism (Why it behaves this way):** The `pointerType` is a read-only string property on the `PointerEvent` prototype. During the creation of the event instance at the C++ browser engine layer, the browser queries the operating system's device driver subclass. It maps this input class to one of three standardized string literals: `"mouse"`, `"touch"`, or `"pen"`. This allows developers to conditionally adjust UI thresholds (e.g. broadening hit targets for `"touch"` pointers while keeping them tight for precise `"mouse"` inputs) dynamically within the same event listener.
- **The Unforgettable Mental Model:** A label printed on a delivery box: either "Delivered by Drone" (touch), "Delivered by Motorcycle" (pen), or "Delivered by Truck" (mouse). The box is opened the exact same way, but knowing the vehicle allows you to anticipate the speed and delivery pathway.
- **The Trap:** Relying on `pointerType` to detect if the user's device has a touchscreen. Users can have laptops with both touchscreens and trackpads; `pointerType` represents the active input *action*, not the device's static capabilities.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: '`pointerType` is a string property on the `PointerEvent` that identifies the physical hardware type that generated the event, returning `"mouse"`, `"touch"`, or `"pen"`. This allows us to adjust our interaction dynamics dynamically—such as expanding drag target areas or smoothing drawing lines—depending on whether the user is interacting with an imprecise finger or a pixel-perfect stylus.'"

#### What is pointer capture?
- **The Engine Mechanism (Why it behaves this way):** In standard mouse interactions, if a user clicks an element and drags their pointer *outside* the boundaries of that element, the element stops receiving `mousemove` and `mouseup` events because the pointer is no longer hovering over it. Pointer capture overrides this default routing by binding all subsequent pointer events directly to the target element, regardless of where the coordinates are in the viewport. By calling `element.setPointerCapture(pointerId)`, the engine redirects the event targeting stream on the active `pointerId` straight to the element's fiber tree. The capture is automatically released when the pointer is released (`pointerup`/`pointercancel`), or can be manually dropped via `element.releasePointerCapture(pointerId)`.
- **The Unforgettable Mental Model:** An anchor and a chain. When a user grabs a slider thumb, you anchor the pointer to that thumb. Even if the user moves their finger off the screen or far below the slider track, the slider thumb remains chained to the pointer's coordinates and updates smoothly.
- **The Trap:** Forgetting that pointer capture throws a DOMException if the `pointerId` is invalid or not actively in a down/active state at the moment `setPointerCapture` is called. It must be called synchronously inside or immediately after a `pointerdown` listener.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Pointer capture is a mechanism invoked via `element.setPointerCapture(pointerId)` that redirects all subsequent pointer events for a specific touch or click stream to that exact element, even if the pointer moves outside the element’s bounding box. This is vital for widgets like sliders, drag-and-drop zones, or drawing canvases to ensure interactions remain continuous and uninterrupted when the user drags quickly.'"

#### How do pointer events affect accessibility?
- **The Engine Mechanism (Why it behaves this way):** Pointer events are fundamentally dependent on physical coordinate systems and spatial interfaces. Because of this, they are entirely blind to keyboard navigation or assistive technologies like screen readers, which do not emit coordinates, pressures, or device IDs. When a screen reader executes an action, it directly triggers simulated high-level actions (like `click`), bypassing pointer coordinates. If a widget’s interaction logic is built *only* on `pointerdown`/`pointermove`/`pointerup`, keyboard and screen reader users will be completely locked out.
- **The Unforgettable Mental Model:** A high-tech digital art gallery where the security system only opens the doors if it scans the physical texture of a finger. Blind users or those with assistive motor controls are stuck outside because they don't produce the spatial finger scan.
- **The Trap:** Designing a custom slider or drag-and-drop panel solely using `pointermove` and forgetting to bind `keydown` listeners for arrow keys and standard keyboard navigations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Pointer events are inherently spatial and have no built-in fallback for non-pointing assistive technologies. When implementing custom pointer interactions—like drag-and-drop or sliders—we must always layer on keyboard listeners (like `keydown` for Arrow keys), apply proper ARIA roles (such as `role="slider"`), and manage focus states, so the control remains fully accessible to keyboard-only and screen reader users.'"

## 8. Active recall test

#### 1. Which devices do pointer events cover?
- **Explanation/Answer:** They cover all physical pointing input devices, primarily mouse, touch (fingers/screen contacts), and pens/styli.

#### 2. Name three pointer events.
- **Explanation/Answer:** `pointerdown`, `pointermove`, and `pointerup` (along with `pointercancel`, `pointerover`, and `pointerout`).

#### 3. What does `pointerType` tell?
- **Explanation/Answer:** It identifies the device type that initiated the event, returning `"mouse"`, `"touch"`, or `"pen"`.

#### 4. Why use pointer capture?
- **Explanation/Answer:** To lock the pointer's input stream to a specific element, ensuring that dragging actions (like sliders or canvas sketches) continue to update smoothly even if the user's cursor or finger drifts outside the boundaries of that element.

#### 5. What non-pointer input must still work?
- **Explanation/Answer:** Keyboard navigation (handling `keydown`/`keyup` events for Tab, Enter, Space, and Arrow keys) and screen-reader activation triggers.

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

