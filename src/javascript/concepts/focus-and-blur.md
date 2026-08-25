# Focus and Blur

## 1. Why This Exists — The Problem First

A form can look correct to a mouse user and still be unusable from the keyboard. A user tabs into a field, submits invalid data, or opens a dialog, and suddenly the focus ring disappears or the next Tab starts at the top of the page. They have lost their place, and a screen reader may no longer announce the control they need to fix.

Focus and blur are the browser signals that let an application keep that place. They are useful for validation, keyboard navigation, menus, dialogs, and restoring the user to the button that opened an overlay.

## 2. The Analogy — Make It Obvious

Imagine a help desk with one active customer window. The person currently speaking with the agent is the focused element: keyboard input goes there. When that window is closed or the agent switches to another window, the old one receives `blur`; the new one receives `focus`.

The window itself is the event target. A `focus` or `blur` notification is private to that window, so it does not bubble up through the desk. `focusin` and `focusout` are the front-desk notifications: they travel up through the containing area, which lets one container observe many child controls. Calling `.focus()` is the agent deliberately switching the active window rather than waiting for the customer to navigate there.

## 3. How It Actually Works — The Full Explanation

The browser keeps a current focus target for each document. For an ordinary document, `document.activeElement` tells you which element currently owns keyboard focus (with special behavior around iframes and shadow roots). Native controls such as buttons, links with an `href`, inputs, and selects can normally receive focus. A custom element such as a `div` needs an intentional keyboard contract, often `tabindex="0"`; `tabindex="-1"` permits programmatic focus without adding the element to normal Tab order.

When focus moves from element A to element B, the useful conceptual sequence is:

1. A loses focus and receives `blur`.
2. A receives `focusout`, which bubbles.
3. B receives `focus`.
4. B receives `focusin`, which bubbles.

The exact browser event sequence has historical and platform nuances, so code should depend on each event's documented propagation behavior rather than treating the sequence as a general-purpose transaction. The `FocusEvent.relatedTarget` property is often valuable: for `blur` and `focusout` it is the element receiving focus, while for `focus` and `focusin` it is the element losing focus. It can be `null` when focus leaves the document or for security reasons.

`focus` and `blur` do not bubble. If a form wants to observe direct focus changes from one place, it can either listen for bubbling `focusin`/`focusout` or register `focus`/`blur` in the capture phase. This is the same distinction that matters for event delegation; see the repository's [DOM Event Propagation](dom-event-propagation.md) page.

Calling `element.focus()` asks the browser to make that element the keyboard target. The element must be mounted and focusable; a disabled control or an element hidden with `display: none` cannot become a useful target. `element.focus({ preventScroll: true })` keeps the focus change from automatically scrolling the page, which is helpful when the application will manage scrolling separately.

Focus is not the same as “the user clicked this.” Keyboard navigation, assistive technology, scripts, and pointer input can all change focus. Likewise, `blur` means focus was lost, not that a value was changed. Use `input` for each edit and `change` for a committed value; use `blur` when leaving the control is the lifecycle event you need.

Visible focus is part of the interaction, not decoration. Keep the browser outline or replace it with a strong, sufficiently contrasting style. `:focus-visible` is useful when the design wants a keyboard-oriented indicator without hiding focus from users who need it. Never remove `outline` without providing an equivalent visible state.

Dialogs add a larger focus responsibility. On open, focus should move to the best starting control, not blindly to the dialog wrapper. While a custom modal is open, background content must be made inert and sequential focus must remain inside the dialog. On close, focus should return to the element that opened it, if that element still exists and is usable. Native `<dialog>.showModal()` supplies important modal behavior, including making the rest of the document inert and placing focus in the dialog; custom overlays must reproduce those responsibilities themselves. The [MDN `<dialog>` guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog) explains the browser-provided behavior.

## 4. Real Code — See It Working

This complete browser example shows field-level validation, delegated focus observation, and a native modal. Save it as `focus.html` and open it in a browser.

```html
<form id="profile-form" novalidate>
  <label>
    Display name
    <input id="display-name" name="displayName" required />
  </label>
  <button>Save</button>
</form>
<p id="status" aria-live="polite"></p>

<button id="open-help" type="button">Open help</button>
<dialog id="help-dialog" aria-labelledby="help-title">
  <h2 id="help-title">Help</h2>
  <p>Press Escape or use the close button.</p>
  <button id="close-help" type="button">Close</button>
</dialog>

<script>
  const form = document.querySelector("#profile-form");
  const nameInput = document.querySelector("#display-name");
  const status = document.querySelector("#status");
  const dialog = document.querySelector("#help-dialog");
  const openHelp = document.querySelector("#open-help");
  const closeHelp = document.querySelector("#close-help");

  // novalidate lets this example show the custom submit-time error flow;
  // production forms can keep native constraint validation when it is desired.
  // focusout bubbles, so one listener can observe every field in the form.
  form.addEventListener("focusout", (event) => {
    if (event.target instanceof HTMLInputElement && !event.target.validity.valid) {
      event.target.setAttribute("aria-invalid", "true");
      status.textContent = "Display name is required.";
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!nameInput.value.trim()) {
      nameInput.setAttribute("aria-invalid", "true");
      status.textContent = "Fix the highlighted field.";
      // The error is actionable, so put the keyboard at the error.
      nameInput.focus({ preventScroll: true });
    }
  });

  let opener;
  openHelp.addEventListener("click", () => {
    opener = document.activeElement;
    dialog.showModal();
  });

  closeHelp.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    // Restore the user's place, but do not focus a node that was removed.
    if (opener instanceof HTMLElement && opener.isConnected && !opener.hasAttribute("disabled")) {
      opener.focus();
    }
  });
</script>
```

For plain event delegation outside a form, use `focusin` and `focusout`:

```js
const panelFixture = document.createElement("div");
panelFixture.className = "settings-panel";
panelFixture.innerHTML = `
  <label class="field">
    Display name
    <input type="text" />
  </label>
  <label class="field">
    Email
    <input type="email" />
  </label>
`;
document.body.append(panelFixture);

const panel = document.querySelector(".settings-panel");

panel.addEventListener("focusin", (event) => {
  event.target.closest(".field")?.classList.add("is-active");
});

panel.addEventListener("focusout", (event) => {
  const field = event.target.closest(".field");
  // relatedTarget tells us whether focus stayed inside this field wrapper.
  if (field && !field.contains(event.relatedTarget)) {
    field.classList.remove("is-active");
  }
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between `focus` and `blur`?**

`focus` fires when an element becomes the current keyboard target. `blur` fires when it loses that status. Both are non-bubbling `FocusEvent`s, so a parent does not receive them through ordinary bubbling. Their bubbling counterparts are `focusin` and `focusout`.

**Q: How do you find the currently focused element?**

Read `document.activeElement`. Treat the result as a live DOM reference, not as a permanent guarantee: focus can move immediately, the node can be removed, and an iframe or shadow root can make the relevant active element belong to a nested document or tree.

**Q: How do you focus an element in JavaScript?**

Call `element.focus()`, or `element.focus({ preventScroll: true })` when the focus change should not move the viewport. The element must be connected and focusable. Calling focus on a disabled or hidden control does not create a usable keyboard target.

**Q: Why would you use `focusin` instead of `focus`?**

Use `focusin` when an ancestor should observe focus entering any descendant without registering a capture listener. For example, a form can validate or style its fields with one delegated listener. Use `focus` on the element itself when direct ownership is clearer, or use capture when you specifically need the non-bubbling event.

**Q: What is `relatedTarget` useful for?**

It identifies the other side of the focus transition. On `focusout`, it is the element receiving focus; on `focusin`, it is the element losing focus. Checking whether `relatedTarget` remains inside a menu or composite widget prevents closing the widget when focus merely moves between its own children.

**Q: Should validation happen on `blur` or `change`?**

It depends on the rule. `blur` is a good boundary for field-level feedback after the user leaves a control. `change` reports a committed value and has control-specific behavior, while `input` reports edits as they happen. A robust form often combines these with submit-time validation rather than assuming one event covers every path.

**Q: How should a modal manage focus?**

Save the opener, move focus into the dialog, prevent interaction with the background, and restore focus to the opener on close when it is still connected and enabled. A custom modal must implement the keyboard and inertness behavior carefully. Prefer native `<dialog>.showModal()` where its semantics fit, because the browser supplies modal top-layer and inert-background behavior.

**Q: Is a focus trap always necessary?**

A true modal needs focus to stay within the active modal while it is open. But a hand-written Tab loop is not the only way to achieve that, and a non-modal popover or disclosure should not trap focus at all. Choose the interaction model first; then use native dialog/popover behavior or a well-tested accessibility primitive instead of trapping every overlay by default.

## 6. The Traps — What Goes Wrong

- **Removing the outline:** `outline: none` makes keyboard position invisible unless a replacement exists. Keep a visible `:focus` or `:focus-visible` style with adequate contrast.
- **Delegating with `focus`:** A parent listener such as `form.addEventListener("focus", handler)` does not see descendant focus through bubbling. Use `focusin`, or pass `{ capture: true }` when capture is intentional.
- **Calling focus before the target exists:** A ref or query result can be `null`, and a hidden or disabled element cannot become a useful target. Mount and reveal the control before focusing it.
- **Focusing the first error without a reason:** Moving focus on every validation change can interrupt typing and screen-reader navigation. Move it after a failed submit when the user needs a clear recovery point; otherwise announce the error and let the user continue.
- **Closing a modal and losing the opener:** Focus may fall back to the document, forcing a keyboard user to repeat navigation. Store the original element and restore it only after checking that it is still connected and usable.
- **Confusing focus with value changes:** A user can focus and blur without changing a value, and a script can change a value without focus. Choose `focus`/`blur`, `input`, `change`, or submit validation according to the actual requirement.
- **Building a fake modal with only ARIA:** `role="dialog"` and `aria-modal="true"` describe semantics; they do not automatically move focus, make the background inert, or implement keyboard dismissal. Native `<dialog>` or a complete tested primitive is safer than a styled `div` with labels alone.

## 7. Compare With Related Concepts

| Concept | Key difference | Use it when |
| --- | --- | --- |
| `focus` vs `focusin` | Both report focus entering, but `focus` does not bubble and `focusin` does. | Use `focusin` for delegation; use `focus` for direct ownership or capture-phase observation. |
| `blur` vs `focusout` | Both report focus leaving, but `blur` does not bubble and `focusout` does. | Use `focusout` for a parent observing many controls. |
| Focus vs `:active` | Focus is the keyboard target; `:active` is the brief pressed/activated state during an interaction. | Style keyboard position with focus; style press feedback with `:active`. |
| `blur` vs `change` | `blur` is a focus transition; `change` concerns a committed value. | Validate on blur when leaving matters; validate on change when value commitment matters. |
| `tabindex="0"` vs `tabindex="-1"` | Both can make a custom element focusable, but only `0` joins normal sequential Tab order. | Use `0` for a keyboard-stop control; use `-1` for a programmatic target such as a dialog heading or error region. |
| Native modal dialog vs custom overlay | `showModal()` provides browser-managed modal/inert behavior; a custom overlay must implement it. | Prefer native dialog where possible; otherwise treat focus, escape, labeling, and background inertness as one feature. |

## 8. 🧠 The Memory Hook — What Sticks

Focus is the keyboard's current address, and blur is the “address changed” notice. For a parent watching many controls, remember the paired upgrade: `focusin`/`focusout` bubble; `focus`/`blur` do not. A good interface always knows where the user came from, where focus must go next, and how to bring them back.
