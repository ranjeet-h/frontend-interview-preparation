# Pointer Events

## 1. Why This Exists — The Problem First

A mouse-only drag handle is easy to start: listen for `mousedown`, track `mousemove`, and finish on `mouseup`. The same control on a phone needs touch events, a pen adds pressure and tilt, and registering mouse and touch handlers together can cause duplicate work through compatibility events. These bugs appear in sliders, drawing surfaces, resizers, maps, and drag-and-drop controls—places where input needs to feel continuous.

Pointer Events give mouse, touch, and pen one event model. They do not make a custom interaction accessible or decide whether the page should scroll, but they remove the device-specific fork and provide the pieces needed for reliable gestures: `pointerType`, `pointerId`, pointer capture, and cancellation.

## 2. The Analogy — Make It Obvious

Think of a parcel company receiving deliveries from vans, bicycles, and drones. The loading dock has one intake process, while a label records which vehicle delivered each parcel and any extra details such as weight or orientation.

The loading dock is your event listener. The vehicles are mouse, finger, and stylus. `pointerdown`, `pointermove`, and `pointerup` are the common intake stages. `pointerType` identifies the current vehicle; pressure, tilt, and contact dimensions are optional parcel details when the device supplies them.

Pointer capture is the dock assigning a parcel to one receiving bay. Once a slider thumb starts a drag, later movement is routed to that thumb even when the pointer leaves its small visual box. `pointerId` is the tracking number, so two fingers remain two independent deliveries.

The boundary of the analogy matters: the browser still owns decisions about scrolling and zooming. CSS `touch-action` declares which browser gestures are allowed, and `pointercancel` tells the application that the browser or operating system took the interaction away.

## 3. How It Actually Works — The Full Explanation

A pointer is a hardware-independent representation of one pointing contact or cursor. The browser first uses hit testing to choose the element under the coordinates, then dispatches events such as:

- `pointerover` and `pointerenter` when a pointer enters an element's hit area.
- `pointerdown` when it becomes active, such as a mouse button press or finger contact.
- `pointermove` while coordinates or pointer state change.
- `pointerup` when that pointer is no longer active.
- `pointerout` and `pointerleave` when it leaves the hit area.
- `pointercancel` when the browser can no longer continue the stream, for example because it began handling a pan or zoom or the device was interrupted.

The `PointerEvent` interface includes familiar `MouseEvent` data such as `clientX`, `clientY`, `button`, and `buttons`. It adds `pointerId`, `pointerType`, `pressure`, `width`, `height`, `tiltX`, and `tiltY` when supported. `pointerType` normally contains `"mouse"`, `"touch"`, or `"pen"`; it describes the active input, not every capability of the machine. A touchscreen laptop can produce mouse events from its trackpad and touch events from its screen.

The key invariant is one stream per active pointer id. A two-finger gesture produces two pointer streams, so multi-touch code should store state keyed by `pointerId`, not in one global coordinate pair. `isPrimary` identifies the primary pointer for a pointer type when an interaction intentionally handles only one contact.

Pointer Events can also produce compatibility mouse events. Mixing a pointer handler and an old mouse handler for the same gesture can therefore run the action twice. Prefer one input model for the interaction, and use `click` or explicit filtering when you deliberately need activation behavior.

**Capture keeps a drag stream together**

Without capture, later movement is normally hit-tested at its new location. A thumb can stop receiving movement as soon as the pointer leaves it. In `pointerdown`, call `setPointerCapture(event.pointerId)` on the element that owns the drag. Later events for that pointer are retargeted to that element until capture is released or the stream ends.

Capture is per pointer, not global. It changes hit testing and event targeting for that pointer, not the coordinates: `clientX` and `clientY` still describe where the pointer is. As the pointer moves inside or outside the capturing element, the specification allows the corresponding boundary events to be generated. Capture is implicitly released after `pointerup` or `pointercancel`; call `releasePointerCapture` when the application ends the drag early. The id must be active, or `setPointerCapture` can throw a `DOMException`.

Touch and other direct-manipulation input can receive implicit capture on `pointerdown`. Explicit capture is still useful because it makes a custom drag's ownership clear across mouse, pen, and touch.

**`touch-action` decides who owns a touch gesture**

The browser must distinguish “the page should scroll” from “this canvas should draw.” `touch-action` declares which gestures the browser may perform before the interaction begins. A drawing surface that owns the gesture commonly uses `touch-action: none`; a control that wants to preserve vertical page scrolling might use `pan-y`.

If the browser starts handling a conflicting gesture, it can dispatch `pointercancel`. Cleanup must run on both `pointerup` and `pointercancel`. Declare gesture intent with `touch-action` rather than trying to cancel every late event with `preventDefault()`.

Pointer Events are an input primitive, not an accessibility model. A pointer-only slider has no keyboard operation merely because it works with a finger. Prefer a native control where possible. A custom control needs focus, semantics, keyboard behavior, visible focus, and an equivalent non-drag action. The [W3C Pointer Events model](https://www.w3.org/TR/pointerevents3/) and [MDN guide](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) document the event and capture rules.

## 4. Real Code — See It Working

**One handler for mouse, touch, and pen**

Run this in a page containing the button.

```html
<button id="pad" type="button">Press or touch me</button>
```

```js
const pad = document.querySelector("#pad");

pad.addEventListener("pointerdown", (event) => {
  // WHY: one handler serves every pointing device.
  console.log({
    type: event.pointerType,
    id: event.pointerId,
    x: event.clientX,
    pressure: event.pressure,
  });
});
```

**A drag handle that survives leaving the handle**

This example includes keyboard behavior because pointer handling alone is not an accessible slider.

```html
<div class="slider" id="slider">
  <div class="track"></div>
  <button
    class="thumb"
    id="thumb"
    type="button"
    role="slider"
    aria-label="Volume"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow="50"
  ></button>
</div>
```

```css
.slider {
  position: relative;
  width: 20rem;
  height: 2rem;
  touch-action: none; /* The slider owns the drag. */
}

.track {
  position: absolute;
  top: 0.85rem;
  width: 100%;
  height: 0.3rem;
  background: #bbb;
}

.thumb {
  position: absolute;
  top: 0.45rem;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  transform: translateX(-50%);
}
```

```js
const slider = document.querySelector("#slider");
const thumb = document.querySelector("#thumb");
let value = 50;

function setValue(nextValue) {
  value = Math.max(0, Math.min(100, nextValue));
  thumb.style.left = String(value) + "%";
  thumb.setAttribute("aria-valuenow", String(value));
}

function valueFromClientX(clientX) {
  const bounds = slider.getBoundingClientRect();
  return ((clientX - bounds.left) / bounds.width) * 100;
}

function updateFromPointer(event) {
  // WHY: capture keeps this update receiving movement after the thumb is left.
  setValue(valueFromClientX(event.clientX));
}

thumb.addEventListener("pointerdown", (event) => {
  // WHY: capture belongs to this exact pointer stream.
  thumb.setPointerCapture(event.pointerId);
  updateFromPointer(event);
});

thumb.addEventListener("pointermove", (event) => {
  if (thumb.hasPointerCapture(event.pointerId)) {
    updateFromPointer(event);
  }
});

function endPointer(event) {
  // WHY: cancellation is a normal outcome of touch gestures.
  if (thumb.hasPointerCapture(event.pointerId)) {
    thumb.releasePointerCapture(event.pointerId);
  }
}

thumb.addEventListener("pointerup", endPointer);
thumb.addEventListener("pointercancel", endPointer);

thumb.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 10 : 1;
  const changes = {
    ArrowRight: step,
    ArrowUp: step,
    ArrowLeft: -step,
    ArrowDown: -step,
  };

  if (changes[event.key] !== undefined) {
    event.preventDefault();
    setValue(value + changes[event.key]);
  }
});

setValue(value);
```

**Tracking two independent contacts**

Key per-pointer state by `pointerId` so one finger cannot overwrite another.

```js
const canvas = {
  listeners: new Map(),
  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  },
  setPointerCapture(pointerId) {
    this.capturedPointerId = pointerId;
  },
};

const drawnLines = [];
function drawLine(startX, startY, endX, endY) {
  drawnLines.push({ startX, startY, endX, endY });
}

const activePointers = new Map();

canvas.addEventListener("pointerdown", (event) => {
  activePointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
  });
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const previous = activePointers.get(event.pointerId);
  if (!previous) return;

  drawLine(previous.x, previous.y, event.clientX, event.clientY);
  activePointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
  });
});

function finishPointer(event) {
  activePointers.delete(event.pointerId);
}

canvas.addEventListener("pointerup", finishPointer);
canvas.addEventListener("pointercancel", finishPointer);
```

In a browser, replace the fixture with a real canvas and add `touch-action: none` when the drawing surface should own the gesture.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What problem do Pointer Events solve?**

They provide one DOM event model for mouse, touch, and pen. An interaction can listen for the same down/move/up lifecycle and inspect device-specific data only when it needs to. They reduce duplicated mouse/touch logic, but do not automatically provide keyboard accessibility or decide whether the browser should scroll.

**Q: What is the difference between a pointer event and a mouse event?**

A `PointerEvent` contains the familiar mouse fields and adds a pointer id, device type, and touch/pen properties. Pointer capture is separate: it is an `Element` API controlled with `setPointerCapture()` and `releasePointerCapture()`, with related `gotpointercapture` and `lostpointercapture` events. Pointer events also support cancellation through events such as `pointercancel`. Legacy mouse events may still be synthesized for compatibility, so registering both event families for one gesture can duplicate work.

**Q: What does `pointerType` tell you?**

It identifies the active input, usually `"mouse"`, `"touch"`, or `"pen"`. It is not a permanent touchscreen detector: the same laptop can generate different values from its trackpad and screen.

**Q: Why is `pointerId` important?**

It identifies one active pointer stream. Each finger in a multi-touch gesture can have a different id. Store per-contact state by id when tracking movement or gestures.

**Q: What is pointer capture, and when should you use it?**

Capture retargets later events for one id to a chosen element instead of using the pointer's current hit-test target. Call `setPointerCapture(event.pointerId)` when a drag starts so a thumb or canvas keeps receiving movement after the pointer leaves. It ends automatically after `pointerup` or `pointercancel`, or explicitly with `releasePointerCapture`.

**Q: What is pointer capture versus pointer lock?**

Capture changes the event recipient while preserving normal coordinates. Pointer lock changes cursor behavior and reports relative movement, which suits games or camera controls. Use capture for ordinary drags and pointer lock for cursor-independent movement.

**Q: Why must a custom interaction handle `pointercancel`?**

It means the browser or operating system has ended the stream from the application's point of view—for example, a touch became a page pan or zoom. Cleanup only on `pointerup` can leave pressed state or active-pointer maps stuck.

**Q: How does `touch-action` relate to Pointer Events?**

It declares which direct-manipulation gestures the browser may perform, such as `pan-y` or `pinch-zoom`. If the browser takes ownership of a conflicting gesture, the application can receive `pointercancel`. Use the narrowest value that matches the control.

**Q: Do Pointer Events make a custom control accessible?**

No. They cover spatial pointing input, not keyboard or screen-reader interaction. Prefer native controls; otherwise add focus, semantics, keyboard actions, visible focus, and an equivalent non-drag path.

**Q: Does `pointerdown` fire for every mouse button press?**

For a mouse it corresponds to the transition from no active buttons to an active-button state. Pressing another button while one is already held may produce `mousedown` without another `pointerdown`. Use `button` and `buttons` when combinations matter.

## 6. The Traps — What Goes Wrong

- **“Pointer Events are renamed mouse events.”** They also model multiple contacts, device type, pressure, capture, and cancellation. Mouse-only assumptions discard the important part of the API.
- **Using `pointerType` as a device detector.** It describes this event's input, not all hardware available. Use capability detection for capabilities and `pointerType` for current behavior.
- **Tracking one global drag.** Two contacts can overwrite one coordinate pair. Use a `Map` keyed by `pointerId`, removing entries on both terminal events.
- **Assuming movement stays on the original element.** Normal hit testing follows the new location. Capture the pointer id when a drag starts.
- **Calling `preventDefault()` everywhere.** It can suppress scrolling or zooming. Declare gesture ownership with `touch-action` and cancel only a specific required default action.
- **Cleaning up only on `pointerup`.** Browser gestures and interruptions can cause `pointercancel`. Share cleanup between both paths.
- **Using `touch-action: none` universally.** It may make a canvas reliable while unnecessarily disabling page panning or zooming. Choose the narrowest policy.
- **Building a slider with pointer handlers only.** Pointer input does not provide keyboard or assistive-technology behavior. A native `<input type="range">` is often safer; a custom one needs the semantic and keyboard layer too.
- **Assuming capture keeps coordinates inside the element.** Capture changes event targeting, not coordinates. Clamp the value or define behavior for positions outside the bounds.

## 7. Compare With Related Concepts

- **Pointer Events vs mouse events:** Pointer Events cover mouse, touch, and pen with one stream and richer data; mouse events are the older mouse-oriented model. Use Pointer Events for new cross-device gestures.
- **Pointer Events vs Touch Events:** Pointer Events give each contact a `pointerId` and common event shape; Touch Events expose collections such as `touches` and `changedTouches`. Use Pointer Events for most new interactions.
- **Pointer capture vs event delegation:** Delegation listens on an ancestor under normal hit testing; capture retargets one active stream to its owner. Use delegation for ordinary targets and capture for active drags.
- **`pointerup` vs `pointercancel`:** `pointerup` is a normal end; `pointercancel` says the application will not receive a normal continuation. Both are cleanup paths.
- **`touch-action` vs `preventDefault()`:** `touch-action` declares gesture policy before interpretation; `preventDefault()` cancels a particular event. Prefer the former for touch ownership.
- **Pointer capture vs pointer lock:** Capture preserves ordinary coordinates and routes events; lock creates cursor-independent relative movement. Use capture for sliders and lock for camera-style controls.
- **Pointer interaction vs keyboard interaction:** Pointer Events describe spatial input; keyboard and semantic controls provide another path. Custom widgets need both, or should use a native control.

## 8. 🧠 The Memory Hook — What Sticks

Pointer Events are one delivery dock for many pointing inputs: `pointerType` tells which vehicle arrived, `pointerId` keeps each delivery separate, and capture keeps a delivery assigned during a drag. The dock is not the whole building—`touch-action` decides whether the browser takes the gesture, `pointercancel` ends it, and keyboard semantics keep the control usable when no pointer arrives.
