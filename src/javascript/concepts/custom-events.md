# Custom Events

## 1. Why This Exists — The Problem First

A checkout widget written by one team needs to tell a host page that an item was added. The host is not its parent component, the widget cannot import the host's state store, and the two pieces may even be built with different frameworks. A direct function call creates a dependency; polling creates delay and wasted work. If both sides already share a document, a custom DOM event gives them a small browser-native contract: one side announces a named fact, and any interested `EventTarget` can listen for it.

That solves integration communication, not application state management. Using custom events for every React-to-React update usually makes ownership and data flow harder to see.

## 2. The Analogy — Make It Obvious

Think of a building with rooms and a receptionist.

- A DOM node or `window` is a place where an announcement can be made.
- `addEventListener("order:submitted", handler)` registers a room to hear announcements with that name.
- `new CustomEvent("order:submitted", { detail: ... })` is the announcement card. Its `detail` is the information written on the card.
- `dispatchEvent(event)` hands the card to the building's announcement system.

If the announcement is made in one room and `bubbles: true`, it can travel through containing rooms toward the building entrance. If bubbling is false, only listeners on the dispatch target (and capture listeners on the event path where applicable) are part of the useful route. A listener does not need to know who made the announcement; it only needs to agree on the event name and payload shape.

This analogy also explains the boundary. The building is one document. A custom event does not magically travel to another browser tab, another origin, or a server. For those routes, use a cross-context or network mechanism such as `BroadcastChannel`, `postMessage`, WebSocket, or `fetch`.

## 3. How It Actually Works — The Full Explanation

### The three objects involved

`CustomEvent` is an event object with normal `Event` behavior plus a read-only `detail` property. `detail` can contain any JavaScript value; it is not automatically JSON-serialized or cloned. If it points at a mutable object, listeners receive that same object reference, so a listener can change data that another listener later observes.

The target is any `EventTarget`, including an element, `document`, `window`, `AbortSignal`, or a custom object that implements the interface. The listener is registered against a case-sensitive event type string. Event names such as `cart:item-added` are ordinary application conventions, not special browser keywords.

### Dispatch is synchronous

The normal sequence is:

1. Create and initialize the event.
2. Register listeners before the event is dispatched.
3. Call `target.dispatchEvent(event)`.
4. The browser sets `event.target` to that target, builds the applicable event path, and invokes matching listeners in event order.
5. `dispatchEvent` returns only after those listeners finish.

This is different from a native user action, which the browser schedules as part of its event processing. A manually dispatched event runs synchronously inside the current call stack. A slow listener therefore makes the caller wait. Exceptions thrown in listeners are reported as uncaught exceptions by the browser; they do not become a normal throw from `dispatchEvent` that the caller can reliably catch.

### Propagation: target, capture, and bubble

For a DOM tree, an event can have a path from an ancestor down to the target and back up again. A listener registered with `{ capture: true }` observes the capture phase on the way down. The target's listeners run at the target. Bubbling listeners on ancestors run on the way back up only when the event was created with `bubbles: true`.

`event.target` is where dispatch started. `event.currentTarget` is the object whose listener is running right now. That distinction matters when one parent listener handles events from many child controls.

`composed` is a separate option. It controls whether an event can cross a Shadow DOM boundary; `bubbles` controls whether it travels upward through the event path. A web component that wants its host page to observe an internal event commonly uses both `{ bubbles: true, composed: true }`, while still exposing only an intentional public payload.

### Default actions and cancellation

Custom events do not acquire a browser default action just because they are cancelable. Setting `cancelable: true` allows a listener to call `preventDefault()`. The caller can inspect the boolean result of `dispatchEvent`: it is `false` when a cancelable event was prevented, and `true` otherwise.

That makes a custom event useful as a synchronous permission check, but only when the producer is prepared to honor the result. `preventDefault()` does not stop propagation; `stopPropagation()` does not cancel a default action. They solve different problems.

### Listener lifetime is part of the contract

Keep a stable function reference if a listener must later be removed. `removeEventListener` matches the event type, callback identity, and capture setting. Creating a new arrow function during removal does not identify the original listener. For one-shot work, `{ once: true }` removes the listener after its first invocation. For a group of listeners, an `AbortController` can provide a shared teardown signal.

### Where this pattern fits

Custom events are a good seam between a web component and its host, between independent widgets in one document, or between framework code and a third-party DOM library. They are a poor replacement for props, context, or a state store inside one component tree because the event is imperative, easy to miss, and does not describe who owns the resulting state.

For custom events crossing a Shadow DOM boundary, define the event's public name and payload as deliberately as you would define an API. Do not leak internal nodes or sensitive mutable state through `detail`.

## 4. Real Code — See It Working

### A small browser example: publish, receive, and clean up

Save this as an HTML file and open it in a browser. The button dispatches an event on itself; the parent receives it because the event bubbles.

```html
<button id="add-to-cart">Add keyboard</button>
<output id="status" aria-live="polite"></output>

<script>
  const button = document.querySelector("#add-to-cart");
  const status = document.querySelector("#status");

  function showCartUpdate(event) {
    // The event name is the routing key; detail is the agreed payload.
    const { sku, quantity } = event.detail;
    status.textContent = `${quantity} × ${sku} added`;
  }

  // Listening on the parent lets this work for current and future buttons.
  document.body.addEventListener("cart:item-added", showCartUpdate);

  button.addEventListener("click", () => {
    button.dispatchEvent(
      new CustomEvent("cart:item-added", {
        bubbles: true,
        detail: { sku: "keyboard", quantity: 1 },
      }),
    );
  });

  // In a real component, call this when the component is disposed.
  // document.body.removeEventListener("cart:item-added", showCartUpdate);
</script>
```

The listener sees the same event object while it runs. `event.target` is the button, while `event.currentTarget` is `document.body`. If `bubbles` were omitted, the body listener would not run.

### A cancelable event as a synchronous policy check

```js
const checkout = document.createElement("form");
checkout.id = "checkout";
document.body.append(checkout);

checkout.addEventListener("checkout:before-submit", (event) => {
  if (!event.detail.email.includes("@")) {
    event.preventDefault();
  }
});

function submitCheckout(email) {
  const allowed = checkout.dispatchEvent(
    new CustomEvent("checkout:before-submit", {
      cancelable: true,
      detail: { email },
    }),
  );

  if (!allowed) {
    return { submitted: false, reason: "invalid email" };
  }

  // The producer explicitly chooses to honor preventDefault().
  return { submitted: true };
}
```

This is not asynchronous validation. A listener cannot `await` a server response and expect the already-returned dispatch to pause. Use an explicit async function when the decision depends on I/O.

### Teardown with `AbortController`

```js
const controller = new AbortController();
const eventTarget = new EventTarget();

function onLogout(event) {
  console.log(`Signed out user ${event.detail.userId}`);
}

eventTarget.addEventListener("auth:logout", onLogout, {
  signal: controller.signal,
});

eventTarget.dispatchEvent(
  new CustomEvent("auth:logout", { detail: { userId: "u-42" } }),
);

// Removes onLogout without needing to remember the target and options later.
controller.abort();
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between `Event` and `CustomEvent`?**

`Event` gives you the standard event type and propagation behavior. `CustomEvent` is the convenient built-in form for adding application data through `detail`. Both are dispatched with `dispatchEvent`, and both can use options such as `bubbles`, `cancelable`, and `composed` where supported. For a richer reusable event contract, subclassing `Event` is also possible, but `CustomEvent` is usually clearer for a simple payload.

**Q: Is `event.detail` copied when the event is dispatched?**

No. The `detail` property holds the value supplied to the constructor. For an object, listeners normally observe the same object reference, not a JSON clone. That makes passing data cheap, but it also means mutable payloads create shared state. Prefer a small, stable payload and treat it as read-only; clone or freeze it when the boundary requires stronger isolation.

**Q: Why did my ancestor listener not receive the custom event?**

The event probably was dispatched on a descendant without `bubbles: true`, or the listener is not on the event's path. Bubbling is opt-in for a `CustomEvent`. Also check the event name's exact spelling and case, and remember that a Shadow DOM boundary may require `composed: true` in addition to `bubbles: true`.

**Q: Is `dispatchEvent` asynchronous?**

No. It invokes applicable listeners synchronously and returns after they finish. A listener that performs expensive work blocks the code that called `dispatchEvent`. If work should happen later, the listener must explicitly schedule it, for example with `queueMicrotask` or `setTimeout`; that changes when the work runs and when errors are observed.

**Q: What does the boolean returned by `dispatchEvent` mean?**

It returns `false` only when the event is cancelable and at least one listener called `preventDefault()`. Otherwise it returns `true`. The producer must deliberately check that result and define what cancellation means. Calling `stopPropagation()` affects routing, not this return value.

**Q: How do you prevent a custom-event listener from leaking?**

Remove it from the same target with the same event type, the same function object, and the same capture setting. A named function or stored callback is therefore safer than an anonymous function when the lifetime is longer than the current operation. `{ once: true }` handles one invocation, and an `AbortSignal` is convenient when a component owns several listeners.

**Q: When should a React application use custom events instead of props or context?**

Use props, context, or a state store for communication inside a React ownership tree because those mechanisms make state ownership and rendering dependencies explicit. Use a custom event when React is crossing a boundary it does not own, such as a web component, a legacy widget, or a third-party DOM integration. The event should represent a boundary-level fact, not act as a hidden replacement for application state.

**Q: Can a custom event communicate with another tab?**

No. A custom DOM event stays within the `EventTarget` graph of its document. For same-origin tabs, consider `BroadcastChannel` or the `storage` event; for windows or frames, consider `postMessage`; for a server, use a network protocol. Those mechanisms have different delivery, serialization, origin, and lifetime rules.

## 6. The Traps — What Goes Wrong

### Forgetting that bubbling is opt-in

```js
const child = document.createElement("button");

child.dispatchEvent(new CustomEvent("panel:close"));
```

This dispatches on `child`, but an ancestor's normal listener will not receive it because `bubbles` defaults to `false`. Add `{ bubbles: true }` when the event is intentionally delegated. Do not turn bubbling on automatically for every event: it expands the public surface and can cause unrelated ancestors to react.

### Treating `preventDefault` as propagation control

`preventDefault()` marks a cancelable event as prevented; it does not stop other listeners from running. `stopPropagation()` stops travel to other targets but does not prevent listeners already scheduled at the current target. `stopImmediatePropagation()` is stronger and also prevents later listeners on that same target. Choose the smallest control that matches the requirement.

### Removing a different function

```js
function clearSession() {
  console.log("Session cleared");
}

window.addEventListener("auth:logout", () => clearSession());
window.removeEventListener("auth:logout", () => clearSession()); // no effect
```

Those two arrow expressions create different function objects, so the second call cannot remove the first listener. Store the callback or use an `AbortController`.

### Passing a giant mutable object

The event is a notification boundary, not a convenient way to expose an entire store. A large mutable `detail` object lets one listener silently change what another listener sees. Send the smallest useful data, such as `{ orderId }`, and let the receiver read its own state if it needs more.

### Expecting an async veto

`dispatchEvent` cannot wait for a promise returned by a listener. A listener that starts an async check cannot reliably call `preventDefault()` after the producer has already continued. Model the operation as an explicit `async` function or command when the decision depends on network or storage I/O.

### Using `window` as an invisible global store

Global event names are easy to collide, hard to trace, and remain active if listeners are not cleaned up. Scope the target as narrowly as possible, use namespaced names and documented payloads, and pair registration with teardown. In a single framework tree, a visible state flow is usually easier to maintain.

## 7. Compare With Related Concepts

| Choice | Key difference | Use it when |
| --- | --- | --- |
| `CustomEvent` vs `Event` | `CustomEvent` carries application data in `detail`; `Event` is enough when the name and standard fields are all you need. | Use `CustomEvent` for a small payload on a DOM event path. |
| Custom event vs pub-sub emitter | A custom event uses `EventTarget` routing, propagation phases, and DOM lifetime. A pub-sub emitter calls subscribers from an application-owned registry with no DOM path. | Use the emitter for non-DOM domain messages; use a custom event at a browser/widget boundary. |
| Custom event vs `BroadcastChannel` | A custom event is same-document; `BroadcastChannel` sends structured-cloned messages between same-origin browsing contexts. | Use `BroadcastChannel` for active cross-tab or cross-window coordination. |
| Custom event vs React props/context | Custom events are imperative and loosely connected to rendering; props/context are declarative inputs in a React tree. | Use props/context for React-owned state; use events to integrate something outside that tree. |
| `preventDefault` vs `stopPropagation` | The first marks a cancelable action as rejected; the second changes where the event travels. | Use the former for a producer-controlled veto and the latter for routing control. |

## 8. 🧠 The Memory Hook — What Sticks

A custom event is a signed notice passed through one building: `detail` is the note, `dispatchEvent` delivers it synchronously, and `bubbles` decides whether it can travel upstairs. It is an excellent handshake between independent things that share a document—not a hidden replacement for the state flow inside one application.
