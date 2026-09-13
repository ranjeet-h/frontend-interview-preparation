# DOM Event Propagation

## 1. Why This Exists — The Problem First

Suppose a table has 5,000 rows. A row click should select the row, a button inside the row should archive it, and clicking the table background should do nothing. Without event propagation knowledge, you can attach listeners everywhere, accidentally trigger the row action from the archive button, or stop an event so aggressively that a modal, analytics listener, or keyboard interaction stops working too.

The browser needs a predictable way for one interaction to reach the element that was hit and for interested ancestors to observe it. DOM event propagation is that delivery route. Once you understand the route, event delegation and propagation control become deliberate choices instead of trial and error.

## 2. The Analogy — Make It Obvious

Imagine a visitor entering a building to meet someone in a particular office.

On the way down, the visitor passes the building entrance, a floor desk, and the office door. Those checkpoints are the **capture phase**: ancestors get an opportunity to observe the event before the destination handles it. The visitor then arrives at the office—the **target phase**. Afterward, the visitor walks back out through the floor desk and entrance. That return trip is the **bubble phase**.

The visitor is the event. The office where the visit began is `event.target`. The checkpoint currently handling the visitor is `event.currentTarget`. A front desk that handles every visitor whose badge says “archive” is event delegation: one ancestor listener serves many descendants. A “do not pass this checkpoint” instruction is `stopPropagation()`, while “do not let any other clerk at this checkpoint handle this visitor” is `stopImmediatePropagation()`.

The analogy has one useful limit: not every event is configured to make the return trip. An event can be delivered at its target and captured by ancestors, yet have `bubbles: false`, so an ordinary ancestor listener does not receive it during bubbling.

## 3. How It Actually Works — The Full Explanation

**The three phases.**

For a click on this element:

```html
<body>
  <main id="panel">
    <button id="save"><span>Save</span></button>
  </main>
</body>
```

the browser builds an event path from the relevant root through `body`, `main`, and `button` to the event target. Conceptually, a bubbling `click` is processed like this:

1. **Capture:** `window`/`document` and then ancestors run listeners registered with `{ capture: true }`, moving toward the target.
2. **At target:** listeners on the `button` run. Both capture-registered and ordinary listeners can run here; the event’s `eventPhase` is `Event.AT_TARGET`.
3. **Bubble:** if `event.bubbles` is `true`, ordinary listeners run on `main`, `body`, `document`, and eventually `window`, moving away from the target.

The target is the node that initiated dispatch, not necessarily the element whose listener is running. If the user clicks the nested `span`, `event.target` is the `span`. In the `main` listener, `event.currentTarget` is `main`. `target` stays tied to the origin for that dispatch; `currentTarget` changes as different listeners run. During the callback, `event.currentTarget` is the reliable reference to the element that owns that listener. Do not expect it to remain useful after dispatch has finished; copy the value you need before scheduling asynchronous work.

`event.eventPhase` exposes the current phase as `CAPTURING_PHASE` (`1`), `AT_TARGET` (`2`), or `BUBBLING_PHASE` (`3`). `event.bubbles` tells you whether the event is configured to bubble. These are properties of this dispatch, not promises that every event type follows the same route.

**Capture is for observing or intercepting on the way down.**

Capture is opt-in:

```js
const parent = document.createElement("div");
const child = document.createElement("button");
child.textContent = "Save";
parent.append(child);
document.body.append(parent);

function onParentClick(event) {
  console.log(`captured ${event.type} on ${event.currentTarget === parent ? "parent" : "another target"}`);
}

parent.addEventListener("click", onParentClick, { capture: true });
child.dispatchEvent(new Event("click", { bubbles: true }));
```

That listener can observe a click before the button’s target listeners run. It is useful when a parent must see an event even though the event type does not bubble, or when an outer boundary must intercept an interaction before a descendant handles it. It is also easy to make capture too broad: a capture listener on `document` can affect unrelated controls, so keep its selector and scope narrow.

**Listener options control registration and lifetime.** The `capture` option chooses whether a listener runs during capture or ordinary bubbling. `once: true` removes that listener automatically after its first invocation, so it is useful for one-time setup or a single confirmation. `passive: true` promises that the listener will not call `preventDefault()`; browsers can start scrolling without waiting for that listener, and a `preventDefault()` call in a passive listener is ignored or reported as a warning. `passive` does not stop propagation and does not remove the listener. `signal` ties the listener to an `AbortSignal`, so calling its controller’s `abort()` removes the listener and any other listeners registered with that signal. For manual cleanup, `removeEventListener()` matches the event type, the same callback object, and the capture flag; it does not require the same `once` or `passive` values. An inline function cannot be removed later unless its function object was saved first.

**Bubbling makes delegation possible.**

With delegation, the listener lives on a stable ancestor and handles matching descendants:

```js
const list = {
  contains(node) {
    return node === button;
  },
};
const button = {
  dataset: { id: "42" },
  closest(selector) {
    return selector === "button[data-id]" ? this : null;
  },
};
function selectItem(id) {
  console.log(`selected ${id}`);
}

function onListClick(event) {
  const button = event.target.closest("button[data-id]");
  if (!button || !list.contains(button)) return;

  selectItem(button.dataset.id);
}

onListClick({ target: button });
```

This works because `click` normally bubbles. It also handles buttons added after the listener was installed. The listener count is one for the list rather than one per row, but delegation is not automatically faster in every situation. It adds selector matching and boundary logic, and it is a poor fit when each child has an independent lifecycle or when the event does not bubble.

`event.target` may be a `span`, `svg`, or `path`, so calling `event.target.matches("button")` can miss the intended button. `closest()` walks from that origin toward its ancestors. The `list.contains(button)` guard prevents a matching element outside the intended list from being accepted when the listener is attached to a broad container.

**Stopping propagation is different from cancelling default behavior.**

These methods solve different problems:

- `event.stopPropagation()` stops the event from continuing to other event targets along the capture or bubble path. It does not cancel a link navigation or stop other listeners already registered on the same target.
- `event.stopImmediatePropagation()` also prevents later listeners on the current event target from running. It is a strong tool and can interfere with other code sharing that target.
- `event.preventDefault()` asks the browser not to perform the event’s default action, such as following a link or submitting a form. It does not stop the event from propagating.

For example, a row can ignore its own click when a nested action button handles the click:

```js
const row = document.createElement("li");
row.dataset.id = "42";
const archiveButton = document.createElement("button");
archiveButton.type = "button";
archiveButton.dataset.archive = "";
row.append(archiveButton);
document.body.append(row);

function openRow(id) {
  console.log(`opened ${id}`);
}

function archiveRow(id) {
  console.log(`archived ${id}`);
}

row.addEventListener("click", () => openRow(row.dataset.id));

archiveButton.addEventListener("click", (event) => {
  event.stopPropagation();
  archiveRow(row.dataset.id);
});
```

Often the cleaner design is to let the event bubble and have the row handler identify the actual action, rather than making nested components compete with propagation stops. Stop propagation at a boundary only when the parent must not interpret that interaction.

**Events do not all bubble.**

Always check the event’s contract instead of memorizing one universal list. `focus` and `blur` do not bubble, while `focusin` and `focusout` do. `mouseenter` and `mouseleave` do not bubble, while `mouseover` and `mouseout` do. `scroll` is generally not a bubbling event for ordinary element scrolling. `load` is also not a general bubbling event.

If a form wants one listener for descendant focus changes, it can use the bubbling pair:

```js
const form = document.createElement("form");
const field = document.createElement("label");
field.className = "field";
const input = document.createElement("input");
field.append(input);
form.append(field);
document.body.append(form);

form.addEventListener("focusin", (event) => {
  event.target.closest(".field")?.classList.add("is-active");
});

form.addEventListener("focusout", (event) => {
  event.target.closest(".field")?.classList.remove("is-active");
});
```

Alternatively, a parent can listen for `focus` with `{ capture: true }`. Capture and bubbling are not interchangeable: capture sees the event on the way down, whereas delegation normally depends on a bubbling event on the way up.

**Event paths and shadow DOM.**

The visible `event.target` can be retargeted at a shadow-DOM boundary. Code outside a closed shadow root may see the host element rather than the internal button. When a component intentionally exposes a composed event, `event.composedPath()` can reveal the dispatch path permitted across the boundary. This is why reusable web components should treat event names, `bubbles`, `composed`, and `detail` as part of their public contract instead of assuming that every internal click should escape.

The same route also explains why a DOM listener and a React handler are related but not identical. React builds its own event system on top of native events, while the browser still provides the underlying native propagation. Keep this page focused on native DOM behavior; React’s synthetic event and root-delegation details belong in [Synthetic Events and Event Delegation in React](../../react/concepts/synthetic-events.md).

## 4. Real Code — See It Working

Save this as `propagation.html` and open it in a browser. Click the button text, then click the archive action. The log shows the order, the origin, and the listener currently running.

```html
<ul id="orders">
  <li data-order-id="42">
    <button type="button" data-action="open">
      <span>Open order 42</span>
    </button>
    <button type="button" data-action="archive">Archive</button>
  </li>
</ul>
<pre id="log" aria-live="polite"></pre>

<script>
  const orders = document.querySelector("#orders");
  const log = document.querySelector("#log");

  function write(message) {
    log.textContent += `${message}\n`;
  }

  orders.addEventListener(
    "click",
    (event) => {
      write(`capture: target=${event.target.tagName}, current=${event.currentTarget.id}`);
    },
    { capture: true },
  );

  orders.addEventListener("click", (event) => {
    write(`bubble: target=${event.target.tagName}, current=${event.currentTarget.id}`);

    const button = event.target.closest("button[data-action]");
    if (!button || !orders.contains(button)) return;

    const row = button.closest("[data-order-id]");
    const action = button.dataset.action;
    write(`${action} order ${row.dataset.orderId}`);

    if (action === "archive") {
      // The row/list handler must not treat this action as an open-row click.
      event.stopPropagation();
    }
  });

  orders.querySelector("[data-order-id]").addEventListener("click", (event) => {
    if (event.target.closest('[data-action="archive"]')) return;
    write(`row action for ${event.currentTarget.dataset.orderId}`);
  });
</script>
```

For a backdrop, `target` versus `currentTarget` gives a precise “click outside the dialog” check:

```js
const backdrop = {};
function closeDialog() {
  console.log("dialog closed");
}

function onBackdropClick(event) {
  // The backdrop itself was clicked, not a dialog descendant.
  if (event.target === event.currentTarget) closeDialog();
}

onBackdropClick({ target: backdrop, currentTarget: backdrop });
```

For a dynamically changing list, delegation and cleanup can share an `AbortController`:

```js
const list = document.createElement("ul");
const removeButton = document.createElement("button");
removeButton.type = "button";
removeButton.dataset.removeId = "42";
list.append(removeButton);
document.body.append(list);

function removeItem(id) {
  console.log(`removed ${id}`);
}

const controller = new AbortController();

function onListClick(event) {
  const removeButton = event.target.closest("button[data-remove-id]");
  if (!removeButton || !list.contains(removeButton)) return;
  removeItem(removeButton.dataset.removeId);
}

list.addEventListener("click", onListClick, { signal: controller.signal });

removeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

// When the list component is destroyed, remove the listener as one owned unit.
controller.abort();
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the order of DOM event propagation?**

For a bubbling event, ancestors receive capture listeners on the way from the root toward the target, listeners on the target run at the at-target phase, and ordinary ancestor listeners receive the event on the way back up. The exact path depends on the DOM tree and boundaries such as shadow roots. The event does not magically start at the parent; the target is established first, and the dispatch algorithm walks the path around it.

**Q: What is the difference between `event.target` and `event.currentTarget`?**

`target` is the event’s origin for this dispatch. `currentTarget` is the `EventTarget` whose listener is currently executing. In a delegated list listener, `target` might be a nested `span` while `currentTarget` is the list. Use `target` plus `closest()` to discover which descendant was activated; use `currentTarget` to read the element that owns the handler.

**Q: What is event delegation, and when would you use it?**

Event delegation places one listener on an ancestor and uses a bubbling event’s origin to handle matching descendants. It is useful for large or dynamic lists, menus, and tables because newly inserted children work without individual registration. It is not a blanket performance rule: selectors and boundary checks add complexity, and non-bubbling events require capture or a different event type.

**Q: What does `stopPropagation()` do?**

It prevents the event from continuing to other event targets during capture or bubbling. It does not cancel the browser’s default action and does not stop other listeners on the same current target. `stopImmediatePropagation()` adds that same-target suppression, so it should be reserved for cases that truly require ownership of the dispatch.

**Q: What is the difference between `preventDefault()` and `stopPropagation()`?**

`preventDefault()` affects the browser action associated with the event, such as navigation or form submission, and only works when the event is cancelable and the listener is allowed to cancel it. `stopPropagation()` affects which DOM targets receive the event. A form submit handler can call both when it must prevent navigation and prevent an ancestor from treating the submit as a separate action, but one does not imply the other.

**Q: How do you delegate `focus` or `blur`?**

Use their bubbling counterparts, `focusin` and `focusout`, when a parent should observe descendants. Or register `focus`/`blur` on the parent with `{ capture: true }`. Do not attach an ordinary bubbling `focus` listener to the form and expect it to see a child input gain focus.

**Q: Why does a delegated handler use `closest()` instead of `matches()`?**

The deepest clicked node may be an icon, SVG path, or text wrapper inside the intended control. `matches()` only tests that exact node. `closest()` starts there and walks toward ancestors, so it can recover the button or link that defines the interaction boundary. Always verify that the result belongs to the delegated container.

**Q: What happens across a shadow-DOM boundary?**

Events can be retargeted so outside code sees a shadow host rather than an internal node. Whether an event crosses the boundary depends on its `composed` behavior and the component’s dispatch choices. `composedPath()` is useful when inspecting the permitted path, but it should not be used to bypass a component’s intended encapsulation contract.

## 6. The Traps — What Goes Wrong

- **Assuming every event bubbles.** `focus`, `blur`, `mouseenter`, and `mouseleave` are common counterexamples. A parent’s ordinary listener can appear “broken” when the event simply has no bubbling phase. Choose `focusin`/`focusout`, `mouseover`/`mouseout`, or capture based on the behavior you need.

- **Using `event.target` to read the delegated control’s attributes.** A click on an icon inside a button makes the icon the target. Read the attributes from the element returned by `closest()`, and check containment before acting.

- **Confusing `currentTarget` with a permanently stored element.** `currentTarget` is meaningful while the listener callback is executing. If asynchronous work needs the handler owner, store `const owner = event.currentTarget` before `setTimeout` or a promise continuation. Do not rely on an event object’s live properties later.

- **Using `stopPropagation()` to cancel navigation.** Stopping propagation does not stop a link’s default action. Call `preventDefault()` for the default action, and use propagation control only when ancestor or descendant listeners must not run.

- **Stopping propagation from every nested component.** This can hide events from legitimate analytics, accessibility, or parent behavior and make composition brittle. First ask whether the parent can inspect `target` and make its own decision; stop only at a real interaction boundary.

- **Forgetting that same-target listeners are different from ancestor listeners.** `stopPropagation()` stops movement to another target, but other listeners on the current target may still run. Use `stopImmediatePropagation()` only when suppressing those sibling listeners is explicitly required.

- **Delegating outside the intended boundary.** A broad document listener plus `closest("button")` can accidentally handle a button from another widget. Scope the listener to the component and verify `container.contains(match)`.

- **Treating React propagation as identical to native DOM propagation.** React exposes familiar event properties, but it layers its own dispatch system over native events. For a React-specific answer, explain the React version and root behavior; do not use a React claim as proof of the native DOM algorithm.

## 7. Compare With Related Concepts

| Concept | Key difference | Use it when |
| --- | --- | --- |
| Capture vs bubble | Capture travels ancestor → target; bubble travels target → ancestors and only occurs when the event bubbles. | Use capture to observe/intercept on the way down; use bubble for ordinary delegation. |
| `target` vs `currentTarget` | `target` is the origin; `currentTarget` is the listener owner currently executing. | Use `target` to identify a descendant; use `currentTarget` for the element that owns the handler. |
| `stopPropagation()` vs `stopImmediatePropagation()` | The first stops movement to other targets; the second also stops later listeners on the current target. | Use the smallest control that prevents the unwanted handler. |
| `stopPropagation()` vs `preventDefault()` | One changes event delivery; the other cancels a cancelable browser action. | Use propagation control for ancestor/descendant coordination; use default cancellation for navigation, submit, or browser behavior. |
| Direct listeners vs delegation | Direct listeners live on each control; delegation uses one ancestor listener and bubbling. | Use direct listeners for independent lifecycles or non-bubbling events; use delegation for large, dynamic groups. |
| `focus`/`blur` vs `focusin`/`focusout` | The first pair does not bubble; the second pair does. | Use the bubbling pair for parent-level focus observation. |
| Native DOM events vs React events | Native events follow the browser’s DOM path; React dispatches its event abstraction on top of native input. | Use native rules for `addEventListener`; use React’s documented event model inside JSX handlers. |

## 8. 🧠 The Memory Hook — What Sticks

Picture a visitor going down to the office and back up through the building: capture goes down, the target receives the visit, and bubbling comes back up. `target` is the office that started the visit; `currentTarget` is the checkpoint currently handling it—so delegation means putting one clerk at the right checkpoint and using `closest()` to find the intended office.
