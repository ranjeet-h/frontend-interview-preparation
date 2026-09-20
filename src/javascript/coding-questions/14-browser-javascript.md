# Browser JavaScript

These are the DOM and browser-API problems that separate a frontend candidate from a generic JavaScript candidate: delegation, observers, storage, cross-tab messaging, clipboard, drag and drop, and keyboard shortcuts. The through-line is lifecycle — everything you attach, you must remove, or you have a leak.

## Implement Event Delegation

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `delegate(root, eventType, selector, handler)` that attaches **one** listener to `root`
and invokes `handler` only when the event originated on an element matching `selector`. Return a
`teardown()` function that removes the listener.

Contract:

- The listener lives on `root`; matching is done with `event.target.closest(selector)`.
- `handler` runs with `this` bound to the matched element and receives `(event, matched)`.
- The match must be inside `root` (or be `root` itself). `closest` can walk **past** `root` and
  return an ancestor outside the container, so reject with `root.contains(matched)`.
- `event.target` is not always an `Element` (it can be `document` or a text node), so guard with
  `instanceof Element` before calling `closest`.
- Dispatch to the closest match only — one handler call per event, even if several ancestors match.

### Examples

```html
<ul id="list">
  <li data-id="1"><button class="del">Delete</button></li>
  <li data-id="2"><button class="del">Delete</button></li>
</ul>
```

```javascript
const list = document.querySelector("#list");

const teardown = delegate(list, "click", ".del", function (event, button) {
  console.log("delete", button.closest("li").dataset.id);
});

// Clicking the button inside <li data-id="2">:
// => "delete 2"

// A row added later still works — nothing is bound to the button itself.
list.insertAdjacentHTML("beforeend", '<li data-id="3"><button class="del">Delete</button></li>');

teardown(); // listener removed; later clicks do nothing
```

### Approach

Bubbling is the mechanism: a click on the button bubbles through `<li>` and `<ul>` up to the
document. Instead of binding N listeners (one per button, re-bound whenever the list changes), bind
one listener on a stable ancestor and inspect `event.target` at dispatch time.

The core is `target.closest(selector)`: it walks the element and then its ancestors until one
matches. `event.target` is the **deepest** element in the path, which is why checking
`event.target.matches(selector)` is wrong — a click on the `<span>` inside a `.del` button would
miss, and a click on the button itself would hit. `closest` handles both.

Two guards matter. First, `closest` can escape the container: if `root` is an inner `<ul>` and the
selector matches an outer wrapper, `closest` returns that outer element. `root.contains(matched)`
rejects it. Second, `event.target` may be `document` or a non-Element node for some event types;
`closest` only exists on `Element`, so guard first.

For removal, either return a closure calling `removeEventListener`, or take an `AbortController` and
pass `{ signal }` to `addEventListener`, then `controller.abort()` to detach every listener at once.

### Implementation

```javascript
function delegate(root, eventType, selector, handler, options) {
  if (!(root instanceof Element)) throw new TypeError("root must be an Element");
  if (typeof selector !== "string") throw new TypeError("selector must be a string");
  if (typeof handler !== "function") throw new TypeError("handler must be a function");

  const listener = (event) => {
    // event.target can be document/text-node; closest only exists on Element.
    const target = event.target;
    if (!(target instanceof Element)) return;

    const matched = target.closest(selector);
    if (!matched) return;
    if (!root.contains(matched)) return; // closest walked past the container

    // `matched` becomes `this`; the element is also passed explicitly.
    handler.call(matched, event, matched);
  };

  // options may carry { capture, passive, once }.
  root.addEventListener(eventType, listener, options);

  return function teardown() {
    root.removeEventListener(eventType, listener, options);
  };
}
```

The same thing with an `AbortController`, which is the tidier API when a component owns many
listeners:

```javascript
function delegateWithSignal(root, eventType, selector, handler, controller) {
  root.addEventListener(
    eventType,
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const matched = target.closest(selector);
      if (matched && root.contains(matched)) handler.call(matched, event, matched);
    },
    { signal: controller.signal },
  );
  // controller.abort() removes every listener registered with this signal.
}
```

### Walkthrough

Take the `<ul id="list">` example and click the `<button class="del">` inside `<li data-id="2">`.

1. The click is dispatched on the button. It bubbles to `<li>`, `<ul>`, `<body>`, `<html>`, `document`.
2. Our single listener on `#list` runs when bubbling reaches it, with `event.target === button`.
3. `target instanceof Element` is true; `button.closest(".del")` returns the button itself.
4. `list.contains(button)` is true, so the guard passes.
5. `handler.call(button, event, button)` runs; the handler reads
   `button.closest("li").dataset.id` → `"2"`.

Now click the `<ul>` padding (not a button): `event.target === list`. `list.closest(".del")` walks up
past `#list` and returns `null` (no ancestor matches), so the handler is skipped.

Now the escape case: click a `.del` element inside a *nested* list whose ancestor `.del` sits outside
`#list`. `closest(".del")` returns the outer element; `list.contains(outer)` is `false`, so it is
ignored — exactly what a per-container delegator must do.

### Complexity

Time: `O(d)` per event for the `closest` walk, where `d` is the ancestor depth (plus `O(1)` for the
`contains` check). Space: `O(1)`; no per-element listeners, so setup is `O(1)` regardless of the
number of children.

### Edge Cases

- **Element added after binding:** works, because dispatch is dynamic — the main reason to delegate.
- **`root` itself matches the selector:** `closest` returns the target if it is `root`; `contains`
  is true, so it fires. Decide deliberately whether that is wanted.
- **Match outside `root`:** rejected by `root.contains(matched)`.
- **Non-Element target:** the `instanceof Element` guard prevents a `closest is not a function` throw.
- **`event.stopPropagation()`** in a child handler prevents our listener from ever running — a real
  hazard when delegating on an ancestor.
- **Shadow DOM:** `closest` does not cross shadow boundaries. Use `event.composedPath()` and test
  each entry instead.
- **`focus`/`blur`:** they do not bubble; delegate `focusin`/`focusout`, or use capture phase.
- **Handler throws:** the error propagates and does not remove the listener; wrap in `try/catch` if
  one bad handler must not break the rest.
- **Teardown called twice:** `removeEventListener` is idempotent, so a second call is a no-op.

### Interview Follow-ups

- **Delegate `focus`/`blur`:** they do not bubble, so listen on `focusin`/`focusout`, or add the
  listener with `{ capture: true }`.
- **Shadow DOM:** `closest` stops at the shadow root; walk `event.composedPath()` and call
  `closest` from the first `Element` in the path, or re-dispatch the event.
- **`AbortController` vs returned teardown:** `controller.abort()` removes many listeners in one
  call and is the modern lifecycle pattern for components.
- **Delegation with `passive`:** for `touchstart`/`wheel`/`scroll`, pass `{ passive: true }` so the
  browser never waits on the handler; call `preventDefault` only on non-passive listeners.

### Common Mistakes

- Using `event.target.matches(selector)` instead of `closest`, missing clicks on child elements.
- Forgetting `root.contains(matched)`, so a match on an ancestor outside the container fires.
- Calling `closest` without the `instanceof Element` guard and throwing on non-Element targets.
- Losing `this`: calling `handler(event)` so `this` is `undefined` instead of the matched element.
- Re-querying the element inside the handler instead of using the `matched` argument.
- Binding per element and never removing the listeners, leaking every row ever rendered.

### Takeaway

Delegation is one listener plus `event.target.closest(selector)`, guarded so the match is still
inside the container. It trades an `O(d)` ancestor walk per event for `O(1)` setup and automatic
support for elements that do not exist yet — and only works for events that bubble.

## Detect a Click Outside an Element

`Difficulty: Medium` `Probability: High`

### Problem

Implement `onClickOutside(element, callback, options)` that runs `callback(event)` whenever the user
presses outside `element`, and return a `teardown()` that removes the listener.

Contract decisions that define the problem:

- Listen for **`pointerdown`** on `document`, not `click`. A click is only produced after a
  press *and* release on the same element; a drag that starts inside and ends outside, or a
  press-release on a different element, is better modelled by the press.
- "Inside" means the event path contains `element`. Use `element.contains(event.target)` for the
  light DOM, but `event.composedPath().includes(element)` when `element` may live in shadow DOM,
  because `contains` does not cross shadow boundaries.
- Attach in the **capture** phase so it still fires when an inner handler calls
  `stopPropagation()`.
- The opener's own click must not immediately close the popover. Adding a `pointerdown` listener
  during a `click` handler is safe, because that click's `pointerdown` already happened.

### Examples

```html
<button id="trigger">Menu</button>
<div id="menu" hidden>...items...</div>
```

```javascript
const trigger = document.querySelector("#trigger");
const menu = document.querySelector("#menu");

let teardown = null;

trigger.addEventListener("click", () => {
  menu.hidden = false;
  // The click's pointerdown already fired, so no immediate close.
  teardown = onClickOutside(menu, (event) => {
    menu.hidden = true;
    teardown();
    teardown = null;
  }, { ignore: [trigger] }); // clicking the trigger is handled by its own toggle
});

// Pressing anywhere outside #menu and #trigger hides the menu.
// Pressing inside keeps it open.
```

### Approach

The listener goes on `document` in the capture phase. Capture runs from the root down to the target,
so our handler sees the event **before** any bubbling handler that might `stopPropagation`, and it
runs for every press anywhere in the document.

Inside, the test is containment, not equality: `target !== element` is the naive version and it
closes when the user clicks a child of the menu. Two containment tests exist:

1. `element.contains(target)` — correct for the light DOM, fast, `O(d)`.
2. `event.composedPath().includes(element)` — correct across shadow boundaries, because the composed
   path includes shadow hosts; `contains` stops at the shadow root.

Support an `ignore` list so a toggle button does not count as "outside." If the ignored element can
also be in shadow DOM, apply the same path test to each ignored node.

Two subtle points. First, **press, don't click**: `pointerdown` fires before focus changes and before
a drag can cancel the click, so dropdowns close reliably. Second, the **same-event race**: if you
register the outside listener synchronously inside the very `pointerdown` that opened the menu, the
capture listener is already on `document` when the event continues and closes it immediately. The
fix is to pass the opening event and ignore it by identity (`if (event === triggerEvent) return`), or
to open on `click` while listening on `pointerdown`, which does not overlap.

### Implementation

```javascript
function onClickOutside(element, callback, { ignore = [], capture = true } = {}) {
  if (!(element instanceof Element)) throw new TypeError("element must be an Element");

  const ignored = ignore.filter((node) => node instanceof Element);

  const composed = (node, event) => {
    // composedPath crosses shadow boundaries; works for events with a path.
    const path = event.composedPath?.();
    return path ? path.includes(node) : node.contains(event.target);
  };

  const listener = (event) => {
    if (composed(element, event)) return;              // inside -> keep open
    if (ignored.some((node) => composed(node, event))) return; // toggle handled elsewhere
    callback(event);
  };

  document.addEventListener("pointerdown", listener, { capture });
  return function teardown() {
    document.removeEventListener("pointerdown", listener, { capture });
  };
}
```

If a single press can register the listener (rather than a separate open click), add the open-event
identity guard:

```javascript
function onClickOutside(element, callback, openerEvent) {
  const listener = (event) => {
    if (event === openerEvent) return;            // ignore the press that opened us
    if (element.contains(event.target)) return;
    callback(event);
  };
  document.addEventListener("pointerdown", listener, true);
  return () => document.removeEventListener("pointerdown", listener, true);
}
```

### Walkthrough

The menu is open and the user presses on a `<span>` inside `#menu`:

1. `pointerdown` is dispatched on the `<span>`, capture phase starts at `window` → `document`.
2. Our capture listener runs first. `event.composedPath()` is
   `[span, #menu, body, html, document, window]`; `.includes(menu)` is `true`.
3. `composed(element, event)` is true, so we return without calling `callback`. The menu stays open.

Now the user presses on the page background:

1. `pointerdown` target is `<body>`; the path does not include `#menu`.
2. `composed(element)` is false; the `ignore` list does not contain `<body>`.
3. `callback(event)` runs, hiding the menu, and `teardown()` detaches the listener.

Finally the opening flow: the user clicks `#trigger`. `pointerdown` fires **first** on the trigger
while our listener is still detached; then `click` fires and we attach the listener. Since the
opening `pointerdown` is already history, the menu is not closed instantly.

### Complexity

Time: `O(p + e)` per press, where `p` is the composed-path length and `e` the number of ignored
nodes. Space: `O(p)` for the composed path (`composedPath()` allocates an array). Registration and
teardown are `O(1)`.

### Edge Cases

- **Click on a child of the element:** `contains`/`composedPath` return true, so it stays open —
  the case `target !== element` gets wrong.
- **Shadow DOM:** `element.contains(spanInsideShadow)` is `false`; the composed-path test is the
  fix.
- **Element not yet in the DOM:** `document` still receives presses; the path simply never includes
  it, so it closes on the first press. Guard the open path instead.
- **The opener press:** handle with the identity check or by opening on `click`.
- **`stopPropagation` inside the popover:** capture phase runs first, so the listener still fires
  and correctly returns early.
- **Clicks in an `<iframe>`:** they never reach the parent document, so the popover stays open —
  unavoidable without polling `document.activeElement`.
- **Multiple popovers:** each has its own `document` listener; teardown must be called when one
  closes, or listeners accumulate.
- **`pointerdown` vs `mousedown`:** `pointerdown` unifies mouse, touch, and pen; `mousedown` misses
  touch unless you also listen for `touchstart`.
- **Teardown not called:** the listener and its closure (and the element) leak for the page's life.

### Interview Follow-ups

- **Escape-to-close:** add a `keydown` listener checking `event.key === "Escape"`; remember to
  remove both listeners together.
- **Focus-based closing:** a `focusout` listener on the element with a `relatedTarget` containment
  check handles keyboard tabbing, which pointer events do not cover.
- **Popover API:** `<button popovertarget>` plus the `popover` attribute gets outside-click and
  Escape behaviour from the browser; mention it as the modern alternative.
- **Both pointer and keyboard:** the complete pattern combines `pointerdown` (inside test) and
  `focusout` (containment of `relatedTarget`), because a keyboard user never generates a pointer.
- **`once: true`:** if closing is one-way, register the listener with `{ once: true }` so the
  teardown is automatic.

### Common Mistakes

- Comparing `event.target !== element`, which closes on any child click.
- Listening on `click` instead of `pointerdown`, so a drag-outside keeps the popover open.
- Using `element.contains(event.target)` in a shadow-DOM app, where it always reports "outside."
- Registering the listener in the same `pointerdown` that opens the component and closing instantly.
- Listening in the bubble phase, so an inner `stopPropagation` hides the outside click.
- Forgetting the returned teardown, leaking a `document` listener per open/close cycle.

### Takeaway

"Outside" is a containment test on the event path, not an equality test on the target. Listen for
`pointerdown` in the capture phase, test with `composedPath().includes(element)` when shadow DOM is in
play, and give the opener its own exemption so the opening interaction does not dismiss what it just
opened.

## Implement DOM Traversal (Walk Descendants)

`Difficulty: Hard` `Probability: Medium`

### Problem

Implement `walkElements(root, visit)` that visits every descendant **Element** of `root` in
**document order** (pre-order: parent before children, children left to right), calling
`visit(element)`. Then build `findFirst(root, predicate)` and `countElements(root)` on top of it.

Contract:

- `root` itself is **not** visited; only descendants.
- Only `Element` nodes are visited. Text, comment, and processing-instruction nodes are skipped —
  use `firstElementChild`/`nextElementSibling`, not `firstChild`/`nextSibling`.
- Order is document order, which is what a human expects when reading the markup.
- If `visit` returns `false`, the subtree rooted at that element is **skipped** (a pruned
  traversal), so a caller can short-circuit.
- Traversal must be iterative or depth-bounded; a recursive version overflows the stack on very
  deep documents.

### Examples

```html
<div id="root">
  <p class="a">one</p>
  <section>
    <span class="a">two</span>
    <span>three</span>
  </section>
</div>
```

```javascript
const root = document.querySelector("#root");

walkElements(root, (el) => console.log(el.tagName, el.className));
```

```text
P a
SECTION
SPAN a
SPAN
```

```javascript
findFirst(root, (el) => el.className === "a")        // => <p class="a">
countElements(root)                                   // => 4 (p, section, span, span)
```

### Approach

The DOM is a tree, so both traversal algorithms apply; the only real choice is **pre-order** and
iteration order.

- **Pre-order (depth-first)** visits a node, then its descendants. This is "document order."
- **Breadth-first** visits level by level. It is right for "find the nearest ancestor/descendant
  within k levels," wrong for document order.

Recursive pre-order is the obvious version:

```javascript
function walk(el) {
  for (const child of el.children) { // children is a live HTMLCollection
    visit(child);
    walk(child);
  }
}
```

It is correct but has two problems: the call stack depth is the deepest branch, so a 10,000-level
document throws `RangeError: Maximum call stack size exceeded`; and `el.children` is a **live**
collection, so mutating the DOM inside `visit` changes what the loop sees. The iterative version
fixes both by using explicit state.

To get document order from a stack, push children **in reverse** — a stack pops last-in-first-out, so
reversing restores left-to-right order. (A queue gives breadth-first instead.)

Two more notes. `children` and `childNodes` are live; if `visit` inserts or removes nodes you get
either skipped or revisited nodes. For that reason, `querySelectorAll` and `getElementsByTagName`
differ in the same way: `querySelectorAll` is a static snapshot, `getElementsByTagName` is live. If a
callback may mutate, snapshot with `[...el.children]` or `Array.from`. Finally, the DOM ships a
built-in for exactly this: `document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, filter)` with
`nextNode()`, plus `NodeIterator`. Know them; the exercise is understanding what they do.

### Implementation

```javascript
// Pre-order, iterative, prunable. `visit` returning false skips that subtree.
function walkElements(root, visit) {
  if (!(root instanceof Element) && root !== document) {
    throw new TypeError("root must be an Element or Document");
  }

  const stack = [];
  // Seed with children in reverse so the stack pops them left to right.
  for (let i = root.children.length - 1; i >= 0; i -= 1) {
    stack.push(root.children[i]);
  }

  while (stack.length > 0) {
    const el = stack.pop();

    if (visit(el) === false) continue; // prune: do not push this element's children

    // Push children in reverse for document order.
    for (let i = el.children.length - 1; i >= 0; i -= 1) {
      stack.push(el.children[i]);
    }
  }
}

```

`walkElements` prunes subtrees (return `false`) but has no **abort**: the loop's `while` has no early
exit, so a search layered on top still visits every remaining node. A search needs its own loop, or
`visit` must signal "stop entirely" (a sentinel value, or throw a private abort object). Write the
search directly:

```javascript
function findFirst(root, predicate) {
  const stack = [];
  for (let i = root.children.length - 1; i >= 0; i -= 1) stack.push(root.children[i]);

  while (stack.length > 0) {
    const el = stack.pop();
    if (predicate(el)) return el;
    for (let i = el.children.length - 1; i >= 0; i -= 1) stack.push(el.children[i]);
  }
  return null;
}
```

### Walkthrough

For the tree `<div id="root"><p class="a">` , `<section>` containing `<span class="a">` and
`<span>`, walk `walkElements(root, visit)`:

1. Seed: `root.children` is `[p, section]`; pushed in reverse → stack `[section, p]`.
2. Pop `p` → `visit(p)` logs `P a`. Push `p.children` (none). Stack `[section]`.
3. Pop `section` → `visit(section)` logs `SECTION`. Push its children in reverse:
   `[span.a, span]` become `[span, span.a]` on the stack.
4. Pop `span.a` → logs `SPAN a`. Children are `[span.a, span]`; iterating the index backwards
   pushes `span` first and `span.a` second, so `span.a` is on top and is visited first.
5. Pop `span` → logs `SPAN`. Stack empty; traversal ends.

Output is `P a`, `SECTION`, `SPAN a`, `SPAN` — document order, exactly as `querySelectorAll`
would return the same elements.

For `findFirst(root, el => el.className === "a")`: the loop pops `p` first (same seeding), the
predicate is true, and it returns immediately without touching `section` or either `span` —
`O(1)` additional work for this input, and in general `O(k)` where `k` is the position of the match.

### Complexity

Time: `O(n)` for a full walk, `n` = number of descendant elements; each element is pushed and
popped once. Space: `O(w)` where `w` is the maximum number of siblings/queue width — the explicit
stack holds at most one level's worth of pending siblings plus the current path. Recursion would
use `O(d)` call frames for depth `d`; iteration trades stack frames for heap storage and removes the
overflow risk.

### Edge Cases

- **Empty container:** `root.children.length === 0`, the stack never fills, `visit` is never called.
- **Text and comment nodes:** skipped entirely, because only `children` (elements) is read.
- **Deeply nested DOM:** iterative traversal handles hundreds of thousands of levels; recursion
  throws `RangeError`.
- **Mutation inside `visit`:** `children` is live, so inserts/removes shift later siblings. If
  mutation is possible, snapshot each level with `Array.from(el.children)` first.
- **`visit` returns `false`:** that element's subtree is skipped but siblings still run — "prune,"
  not "abort."
- **Shadow DOM:** `children` does not descend into shadow roots; a host element's `shadowRoot` must
  be traversed separately.
- **`root` is `document`:** allowed; `document.children` is `[<html>]`, so the walk starts at `<html>`.
- **SVG/MathML:** still `Element`s and still have `children`, so the same traversal applies; tag
  names are case-sensitive there.
- **Reentrant calls:** the stack is per-call, so nested traversals do not interfere.

### Interview Follow-ups

- **Breadth-first:** swap the stack for a queue (`shift` is `O(n)`; use an index cursor or a
  deque) — the right tool for "within k levels."
- **`document.createTreeWalker`:** `walker.nextNode()` in a `while` loop, with `NodeFilter.SHOW_ELEMENT`
  and a filter callback; the native, allocation-light equivalent.
- **`NodeIterator` vs `TreeWalker`:** `TreeWalker` can move in all directions and prune with
  `FILTER_REJECT`; `NodeIterator` is forward/backward only but lets you detach.
- **Skip subtrees with a selector:** a `matches` check in `visit` returning `false` is a cheap
  `:not()` filter for the traversal.
- **Compare with `querySelectorAll`:** it is a static `NodeList` that returns document order; use it
  unless you need pruning, early exit, or filtering that CSS cannot express.
- **Virtualized trees:** keep a `Set` of expanded nodes and only descend into those.

### Common Mistakes

- Using `firstChild`/`nextSibling`, which include text and comment nodes, so `visit` receives
  non-Elements and crashes on `.tagName`.
- Pushing children in forward order and getting right-to-left output from the stack.
- Recursing without a depth guard, overflowing on pathological documents.
- Iterating `el.children` while the callback mutates the DOM, skipping or revisiting nodes.
- Confusing "prune" with "abort": returning `false` does not stop siblings.
- Assuming `querySelectorAll` is live (it is not) or that `getElementsByTagName` is static (it is
  not).
- Forgetting that shadow roots are separate trees.

### Takeaway

DOM traversal is pre-order DFS over `children`, iterative when depth is unbounded, and left-to-right
by pushing children in reverse onto a stack. The two decisions interviewers probe are "elements or
all nodes?" and "prune vs abort?" — everything else is bookkeeping.

## Implement a Simple DOM Selector

`Difficulty: Hard` `Probability: Medium`

### Problem

Implement `queryAll(root, selector)` and `matches(element, selector)` that support a useful subset of
CSS selectors, without calling `querySelector`/`matches`:

- **Simple selectors:** tag (`div`), class (`.card`), id (`#main`), universal (`*`), attribute
  presence (`[disabled]`), and attribute equality (`[data-id="3"]`, quoted or unquoted).
- **Compound selectors:** any run of the above with no spaces, e.g. `button.del[data-id="2"]`.
- **Descendant combinator:** compounds separated by whitespace, e.g. `section .card` or
  `#main .panel button.del`.
- `matches(element, selector)` returns a boolean for one element.
- `queryAll(root, selector)` returns a **document-order array** of descendants of `root` matching
  the full selector. Like `Element.querySelectorAll`, `root` itself is **not** a candidate.
- An empty/blank selector is a `SyntaxError`, matching native behaviour.

Out of scope, and worth saying so: child/sibling combinators, pseudo-classes, comma groups, and
attribute operators (`^=`, `$=`, `*=`).

### Examples

```html
<main id="main">
  <section class="panel">
    <button class="del" data-id="1">x</button>
    <button class="del" data-id="2" disabled>x</button>
  </section>
</main>
```

```javascript
queryAll(document, "button.del")                  // => [button[data-id=1], button[data-id=2]]
queryAll(document, 'button[data-id="2"]')         // => [button[data-id=2]]
queryAll(document, "button[disabled]")            // => [button[data-id=2]]
queryAll(document, "section button")              // => both buttons (descendant combinator)
queryAll(document, "#main .panel button.del")     // => both buttons (three compounds, gaps allowed)

matches(document.querySelector(".panel"), "section.panel")  // => true
matches(document.querySelector(".panel"), "button")         // => false
```

### Approach

Separate **parsing** from **matching**, and compile once. A selector compiles to an array of
*compound matchers* (left to right); matching an element is then a small recursive search up the
ancestor chain.

1. **Split into compounds.** Split on whitespace, but only whitespace at bracket depth 0 — otherwise
   `[data-id = "1"]` splits into three broken pieces. A tiny scanner that tracks `[`/`]` depth does
   this correctly; a bare `selector.split(/\s+/)` does not.
2. **Compile each compound** into a predicate. Scan the compound with one regex that recognises
   `.#name`, `[attr]`, `[attr=value]`, a tag name, or `*`, and wrap each token as a closure
   returning a boolean. Running the regex in a loop is simpler and more auditable than hand-writing
   a character-by-character parser.
3. **Match the full selector** against an element by matching the **last** compound against the
   element, then walking `parentElement` upward to satisfy the remaining compounds in reverse. Every
   earlier compound may be matched by any ancestor (that is what "descendant" means — arbitrary gaps
   are allowed).
4. **`queryAll`** walks descendants of `root` in document order and keeps the matches. This is why
   the traversal problem comes first: it is the engine underneath.

Details that make or break it:

- Use `el.localName` (lowercase for HTML), not `el.tagName` (uppercase). Native type selectors are
  ASCII case-insensitive in HTML, so compare lowercased.
- Test **descendants only**: `root.querySelectorAll(sel)` never returns `root` itself, and neither
  should we.
- `*` is a matcher that accepts everything; without it `queryAll(root, "*")` returns nothing.
- Attribute equality with an unquoted value must strip surrounding whitespace around `=`.
- Compile once per `queryAll` call, not once per element — otherwise the regex runs `n` times.

Honest scope note: this is a teaching engine for the grammar, not a replacement for the native
selector engine, which handles specificity, namespaces, pseudo-elements, escaping, and `:nth-child`
in optimised C++.

### Implementation

```javascript
// Split on whitespace that is NOT inside [ ... ], so [data-id = "1"] stays one compound.
function splitCompounds(selector) {
  const compounds = [];
  let depth = 0;
  let current = "";

  for (const ch of selector.trim()) {
    if (ch === "[") depth += 1;
    else if (ch === "]") depth -= 1;

    if (/\s/.test(ch) && depth === 0) {
      if (current) compounds.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) compounds.push(current);
  return compounds;
}

const SIMPLE = /(?:([.#])([\w-]+))|(?:\[([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\])|([\w-]+|\*)/g;

// Compile one compound like `button.del[data-id="2"]` into a predicate.
function compileCompound(compound) {
  const tests = [];
  SIMPLE.lastIndex = 0;

  let m;
  while ((m = SIMPLE.exec(compound)) !== null) {
    const [, prefix, name, attrName, dq, sq, unquoted, tag] = m;

    if (prefix === ".") {
      tests.push((el) => el.classList.contains(name));
    } else if (prefix === "#") {
      tests.push((el) => el.id === name);
    } else if (attrName !== undefined) {
      const expected = dq ?? sq ?? (unquoted === undefined ? undefined : unquoted.trim());
      tests.push((el) =>
        expected === undefined
          ? el.hasAttribute(attrName)                       // [disabled]
          : el.getAttribute(attrName) === expected,          // [data-id="2"]
      );
    } else if (tag !== undefined) {
      const wanted = tag.toLowerCase();
      tests.push(wanted === "*" ? () => true : (el) => el.localName === wanted);
    }
  }

  return (el) => tests.every((test) => test(el));
}

function matches(element, selector) {
  if (typeof selector !== "string" || selector.trim() === "") {
    throw new DOMException("Invalid selector", "SyntaxError");
  }
  const compounds = splitCompounds(selector).map(compileCompound);
  return matchesCompounds(element, compounds);
}

// Match the last compound against `el`, then find any ancestor for each earlier compound.
function matchesCompounds(el, compounds) {
  let index = compounds.length - 1;
  if (!compounds[index](el)) return false;

  index -= 1;
  let ancestor = el.parentElement;
  while (ancestor && index >= 0) {
    if (compounds[index](ancestor)) index -= 1; // matched: move to the previous compound
    ancestor = ancestor.parentElement;          // but keep climbing (gaps allowed)
  }
  return index < 0;
}

function queryAll(root, selector) {
  if (typeof selector !== "string" || selector.trim() === "") {
    throw new DOMException("Invalid selector", "SyntaxError");
  }
  const compounds = splitCompounds(selector).map(compileCompound);
  const results = [];
  const stack = [];

  for (let i = root.children.length - 1; i >= 0; i -= 1) stack.push(root.children[i]);

  while (stack.length > 0) {
    const el = stack.pop();                        // document order, root excluded
    if (matchesCompounds(el, compounds)) results.push(el);
    for (let i = el.children.length - 1; i >= 0; i -= 1) stack.push(el.children[i]);
  }
  return results;
}
```

One subtlety the regex must respect: `[\w-]+` for names means class names with characters like `:` or
escaped characters (`.sm\:block`) do not parse. Native CSS escaping is a much larger grammar; declare
it out of scope rather than half-implementing it.

### Walkthrough

Trace `queryAll(document, "#main .panel button.del")` against the example markup.

1. `splitCompounds` yields `["#main", ".panel", "button.del"]` — whitespace at depth 0 splits; there
   are no brackets here, so this is the obvious split.
2. `compileCompound` returns three predicates: `id === "main"`, `classList.contains("panel")`, and
   `localName === "button" && classList.contains("del")`.
3. The traversal pops `<main id="main">` first. `matchesCompounds` tests the **last** compound,
   `button.del`, against `<main>` → false. It is not a result; its children are pushed.
4. `<section class="panel">` is popped. Last compound fails. Children pushed.
5. The first `<button class="del">` is popped. Last compound → `localName === "button"` (true) and
   `contains("del")` (true), so the last compound passes; `index` becomes `1`.
6. Climb: `ancestor = section.panel`; `compounds[1](".panel")` is true → `index = 0`; climb again to
   `main#main`; `compounds[0]("#main")` is true → `index = -1`. The `while` condition `index >= 0` is
   false, so we stop and return `true`. The button is pushed to `results`.
7. The second button repeats steps 5–6 and is added. `<body>`/`<html>` are not descendants of
   `document`'s children traversal beyond that, and nothing else matches.
8. Result: `[button[data-id=1], button[data-id=2]]` in document order.

For `matches(section, "section.panel")`: the compound list has length 1, the single predicate passes,
`index` becomes `-1`, the ancestor loop never runs, and it returns `true` — a compound selector needs
no ancestor walk at all.

### Complexity

Time: `O(n * (s + d))` worst case, where `n` is descendant elements, `s` compounds, and `d` ancestor
depth; in practice most elements fail the last-compound test in `O(1)` and never walk. Space: `O(n)`
for the result, `O(h)` for the traversal stack (tree height/width), `O(s)` for the compiled
predicates.

### Edge Cases

- **Empty or blank selector:** throws `SyntaxError`, matching `querySelectorAll("")`.
- **`root` itself matches:** it is still excluded, because traversal seeds from `root.children` —
  same as native `element.querySelectorAll`.
- **`*` universal:** compiles to `() => true`; without it `queryAll(document, "*")` is empty.
- **Tag case:** `localName` is lowercase for HTML, so `DIV` and `div` both match; in XML/SVG,
  `localName` preserves case and the comparison is effectively case-sensitive.
- **Whitespace inside brackets:** `[data-id = "2"]` stays one compound thanks to the depth scanner
  and the `\s*=\s*` in the regex.
- **Attribute with no value:** `[disabled]` tests presence with `hasAttribute`.
- **Unquoted attribute value:** `[data-id=2]` compares `"2"` after trimming.
- **Multiple classes/ids:** `.a.b` compiles to two `classList` tests; `#x#y` can never match, as in
  CSS.
- **Escaped class names** (`sm\\:block`) and pseudo-classes are not parsed; declare the limit.
- **Element removed mid-traversal:** the live `children` collection shifts; snapshot levels if the
  DOM may change.
- **Shadow DOM:** not traversed; a shadow root is a separate tree.

### Interview Follow-ups

- **Child combinator `>`:** tokenise the combinator as a distinct symbol and, when matching, require
  the previous compound to match `el.parentElement` exactly instead of any ancestor.
- **Sibling combinators `+`/`~`:** match against `previousElementSibling` (one for `+`, walk for `~`).
- **Attribute operators:** `^=`, `$=`, `*=` map to `startsWith`/`endsWith`/`includes` on the
  attribute value.
- **Comma groups:** split on top-level commas into alternative compound lists and union the results,
  then dedupe and sort by document position.
- **Pseudo-classes:** `:nth-child(an+b)` needs an index; compute it from the element's position
  among `parentElement.children`.
- **Performance:** right-to-left matching (as here) is how real engines avoid visiting candidates
  they will reject; precomputing an id/tag index makes it faster still.
- **Why not just call `querySelectorAll`?** Because the exercise is the grammar; production code
  should always use the native engine.

### Common Mistakes

- Splitting with `selector.split(/\s+/)`, which shatters `[data-id = "1"]` into three compounds.
- Comparing `el.tagName === "div"` when `tagName` is `"DIV"`.
- Including `root` as a candidate, so `element.querySelectorAll("div")` semantics are wrong.
- Forgetting `*`, making `queryAll(document, "*")` return nothing.
- Recompiling the regex per element, turning `O(n)` parsing into `O(n)` per-candidate work.
- Matching compounds left-to-right down from the root, which is both slower and harder to write than
  the right-to-left ancestor walk.
- Ignoring a `null` from `getAttribute` when both the element and the selector have no attribute,
  so `null === undefined` comparisons silently fail.
- Claiming full CSS support when escaping, namespaces, and pseudo-elements are absent.

### Takeaway

A selector engine is a compiler plus a matcher: split on top-level whitespace, compile each compound
to a predicate, match the last compound first and walk ancestors for the rest. The descendant
combinator is exactly "any ancestor satisfies the previous compound," which is why the matching runs
right to left.

## Implement Infinite Scroll With `IntersectionObserver`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `createInfiniteScroll(options)` that appends the next page of items whenever a **sentinel**
element scrolls into view, using `IntersectionObserver` — no `scroll` listener and no manual math.

```javascript
createInfiniteScroll({
  root,        // scroll container Element, or null for the viewport
  sentinel,    // Element placed after the list; entering view means "load more"
  fetchPage,   // async (page, signal) => items[]
  render,      // (items, page) => void, appends to the DOM
  rootMargin,  // prefetch distance, e.g. "0px 0px 400px 0px"
  onError,     // (error) => void
}) // => { stop() }
```

Contract:

- **Exactly one request in flight.** A second intersection while `loading` is true must be ignored.
- **The sentinel is the state.** Once `fetchPage` returns an empty array, the list is finished:
  disconnect the observer and never fetch again.
- **A visible page fills.** If the sentinel is still on screen after rendering, load again rather
  than waiting for the user to scroll.
- **`stop()` is idempotent and total:** abort any in-flight request (`AbortController`), set the
  finished flag, and `observer.disconnect()`.
- Failure is **not** terminal: an error leaves the observer armed so the next intersection retries.

### Examples

```html
<div id="feed" class="feed"></div>
<div id="sentinel" aria-hidden="true"></div>
```

```javascript
const feed = document.querySelector("#feed");

const { stop } = createInfiniteScroll({
  root: feed,
  sentinel: document.querySelector("#sentinel"),
  rootMargin: "0px 0px 400px 0px", // start loading 400px before it is visible
  async fetchPage(page, signal) {
    const res = await fetch(`/api/items?page=${page}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json(); // [] on the last page
  },
  render(items) {
    feed.append(...items.map((item) => {
      const el = document.createElement("article");
      el.textContent = item.title;
      return el;
    }));
  },
});

// later, on unmount:
stop();
```

```text
scroll down -> sentinel enters view -> fetch page 0 -> append -> ...
last page returns [] -> observer.disconnect() -> no more requests
stop() while a request is in flight -> fetch rejects with AbortError -> ignored
```

### Approach

The sentinel pattern: put an empty `<div>` after the last item and observe it. When it intersects the
scrollport, the user is near the end, so fetch the next page. The browser tells you *that* the
boundary was crossed; you never read `scrollTop` or compute distances.

The observer callback must be guarded. `IntersectionObserver` can deliver several entries at once
(one per observed target) and can fire again while a request is in flight, so check a `loading` flag
before doing anything. Requests are cancellable with an `AbortController` created per call, so
`stop()` can abort an in-flight fetch instead of letting it resolve into an unmounted component.

The subtle part is **re-arming**. `IntersectionObserver` fires when intersection *changes*. If a page
renders and the sentinel is still visible, no change occurs and no callback arrives — the list stalls
until the user scrolls away and back. Two fixes:

1. **Re-observe** (`unobserve` then `observe`) after each load. `observe()` queues an initial entry
   with the *current* state, so a still-visible sentinel immediately triggers the next page. This is
   the primary implementation below because the geometry is recomputed fresh.
2. **Cache `entry.isIntersecting`** from the last callback and, in a `finally` block, load again if
   it was `true`. Cheaper, but it uses stale geometry: the sentinel may already have moved below the
   fold, so it can fetch a page or two more than necessary.

Use `rootMargin` to prefetch: a bottom margin of `400px` means the callback fires while the sentinel
is still 400px from entering, so content arrives before the user reaches the end. `threshold: 0` is
enough — any overlap.

**Why not a scroll handler?** A `scroll` listener fires dozens to hundreds of times per second on
the main thread. The usual implementation reads `element.scrollHeight - element.scrollTop -
element.clientHeight` (or `getBoundingClientRect`), each of which can force a style/layout flush
("layout thrash") when interleaved with writes. It then needs manual throttling, breaks inside a
nested scroll container unless you recompute that element's own metrics, and goes wrong with
`transform`, zoom, fractional pixels, or a container with its own scrolling. `IntersectionObserver`
computes intersection in the browser, delivers coalesced callbacks asynchronously (off the layout
critical path), understands clipping and any `root`, and only fires on threshold crossings — so there
is nothing to throttle and nothing to measure.

### Implementation

```javascript
function createInfiniteScroll({
  root = null,
  sentinel,
  fetchPage,
  render,
  rootMargin = "0px 0px 400px 0px",
  onError = (error) => console.error(error),
}) {
  let page = 0;
  let loading = false;
  let finished = false;
  let controller = null;

  const observer = new IntersectionObserver(
    (entries) => {
      // Any overlap means "the user is near the end"; ignore exits.
      if (entries.some((entry) => entry.isIntersecting)) load();
    },
    { root, rootMargin, threshold: 0 },
  );

  async function load() {
    if (loading || finished) return; // re-entrancy guard: one request at a time
    loading = true;
    controller = new AbortController();

    try {
      const items = await fetchPage(page, controller.signal);
      if (finished) return; // stop() was called while awaiting

      if (!Array.isArray(items) || items.length === 0) {
        finished = true;
        observer.disconnect(); // nothing left to load
        return;
      }

      render(items, page);
      page += 1;
    } catch (error) {
      if (error.name === "AbortError") return; // cancelled by stop()
      onError(error);                          // stay armed so the next try retries
    } finally {
      loading = false;
      controller = null;

      if (!finished) {
        // Force a fresh evaluation: if the sentinel is still visible, this
        // immediately queues the next page instead of stalling until a scroll.
        observer.unobserve(sentinel);
        observer.observe(sentinel);
      }
    }
  }

  observer.observe(sentinel); // initial observation fires once with the current state

  return {
    stop() {
      finished = true;
      controller?.abort();       // cancel an in-flight request
      observer.disconnect();     // detach the observer (idempotent)
    },
    get isLoading() {
      return loading;
    },
  };
}
```

The variant that caches intersection state instead of re-observing (fewer observer churn, slightly
looser):

```javascript
let lastIntersecting = false;
const observer = new IntersectionObserver((entries) => {
  lastIntersecting = entries[entries.length - 1].isIntersecting;
  if (lastIntersecting) load();
}, { root, rootMargin });
// ...in the `finally` block, replacing the unobserve/observe pair:
if (!finished && lastIntersecting) load();
```

### Walkthrough

Assume `#feed` is a scrollable container with the sentinel just below the fold within the 400px
`rootMargin`.

1. `observer.observe(sentinel)` queues an initial entry. The observer fires: the sentinel is within
   the margin, so `entry.isIntersecting` is `true` and `load()` is called.
2. `loading` is `false`, `finished` is `false`, so `loading = true`, a fresh `AbortController` is
   created, and `fetchPage(0, signal)` starts.
3. The response arrives with 20 items. `finished` is still false, so `render(items, 0)` appends them
   and `page` becomes `1`.
4. The `finally` block sets `loading = false`, then re-observes the sentinel. The browser recomputes:
   20 items did not fill the viewport, so the sentinel is *still* visible and the initial entry fires
   `true` again → `load()` for page 1.
5. This repeats, filling the screen. Eventually a page pushes the sentinel past the 400px margin;
   the re-observe returns `isIntersecting: false`, so no load happens. The list is quiet.
6. The user scrolls down; the sentinel crosses back into the margin, a change event fires with
   `true`, and page `n` loads. The cycle continues.
7. On the last page `fetchPage` resolves to `[]`; `finished = true` and `observer.disconnect()`. No
   further callbacks, no further fetches.
8. If `stop()` runs mid-request (step 2). It sets `finished`, calls `controller.abort()`, and
   disconnects. The `await` rejects with `AbortError`, which is swallowed, and `finally` sees
   `finished === true` so it does not re-arm.

### Complexity

Time: `O(1)` work per threshold crossing (plus one `fetchPage`), and `O(p)` DOM work per page of `p`
items. The browser's intersection computation is amortised and off the main-thread critical path, so
there is no per-scroll cost at all. Space: `O(1)` aside from the rendered DOM and the in-flight page.

### Edge Cases

- **Sentinel visible at startup:** supported — `observe()` fires immediately, so the first page loads
  without any scroll.
- **Empty first page:** `finished` is set on the very first response; the observer disconnects and no
  retry occurs.
- **`root: null`:** observes the viewport; `rootMargin` is then relative to the whole window.
- **Nested scroll container:** pass that element as `root`; this is exactly what scroll-handler math
  gets wrong when it measures the document instead of the container.
- **`rootMargin` with a percentage or negative value:** legal; a negative bottom margin delays the
  trigger until the sentinel is inside the viewport proper.
- **Fetch failure:** `onError` runs and the observer stays armed — but because the sentinel is still
  visible, the re-observe retries immediately. Add a retry counter/backoff, or require a user action
  after a failure, or a failing endpoint becomes a hot loop.
- **`stop()` called twice:** second call is a no-op (`finished` already true, `disconnect()` is
  idempotent, `controller` is `null` so `?.` short-circuits).
- **`stop()` during `fetchPage`:** the request is aborted and its resolution is ignored.
- **Several entries in one callback:** use `.some(...)`, not `entries[0]`, or you may read an exit
  entry and miss a real trigger.
- **Sentinel removed from the DOM:** the observer keeps it in its set and never fires again; remove
  it explicitly or call `stop()`.
- **`root` not actually scrollable:** the sentinel may never enter view; treat as finished or show a
  manual "Load more" button.
- **No `IntersectionObserver`:** older environments need a scroll-based fallback; feature-detect with
  `if ("IntersectionObserver" in window)`.

### Interview Follow-ups

- **Prefetch distance:** tune `rootMargin` ("600px" vs "1200px") and explain the trade-off between
  wasted bandwidth and the user hitting the end.
- **Cursor pagination:** replace `page` with an opaque cursor returned by the server; it survives
  inserts and deletes that shift offset-based pages.
- **Error backoff:** track consecutive failures and grow the delay, or park the observer until a
  "Retry" button is pressed.
- **Virtualisation:** for thousands of rows, combine infinite loading with a windowing library so only
  visible rows exist in the DOM.
- **Skeletons and layout shift:** reserve space for pending items (`min-height` or placeholders) to
  avoid content jumping and a feedback loop with the sentinel.
- **`observer.takeRecords()`:** drain pending entries synchronously when you need an immediate answer.
- **Accessibility:** announce "loaded 20 more items" via a live region, and do not trap keyboard users
  in an endlessly growing list.

### Common Mistakes

- No `loading` guard, so two intersections in quick succession fetch the same page twice.
- Never calling `observer.disconnect()`, leaking the observer and its target for the page's life.
- Reading `entries[0].isIntersecting` when a callback can carry multiple entries.
- Fetching regardless of `isIntersecting`, loading content the user never approaches.
- Not re-arming after a load, so infinite scroll mysteriously stalls when a page does not fill the
  screen.
- Catching the `AbortError` as a real error and surfacing it to the user after `stop()`.
- Falling back to a `scroll` listener that reads `getBoundingClientRect` on every event, forcing
  layout on the main thread — the exact cost `IntersectionObserver` exists to remove.
- Forgetting `{ signal }` in `fetch`, so aborted requests still resolve and render.

### Takeaway

Infinite scroll is a sentinel plus an observer, with three invariants: one request at a time, stop on
an empty page, and re-arm after each load so a non-filling page keeps going. `IntersectionObserver`
replaces the scroll listener and its layout math with a browser-computed, throttled-by-design
callback — and `disconnect()` plus an `AbortController` is what makes it safe to tear down.

## Lazy-Load Images With `IntersectionObserver`

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `lazyLoadImages(root, options)` that defers image loading until each image is near the
viewport. Images ship with their real URL in `data-src` (and optionally `data-srcset`); when the image
approaches the scrollport, copy those into `src`/`srcset` and stop observing it.

```javascript
lazyLoadImages(root = document, {
  rootMargin = "200px 0px", // start loading 200px before entering view
  srcAttr = "data-src",
  srcsetAttr = "data-srcset",
  onError,                  // (img) => void
}) // => stop()
```

Contract:

- Observe every `img[data-src]` found under `root` at call time.
- On intersection, transfer `data-srcset`/`data-src` to the real attributes, remove the `data-*`
  ones so a second pass cannot re-load, and **unobserve** the image — lazy loading is one-shot.
- Return `stop()`, which calls `observer.disconnect()`.
- If `IntersectionObserver` is unavailable, load everything immediately (graceful degradation).
- Never re-trigger a load for an image already handed to the browser.

### Examples

```html
<img data-src="hero.jpg" alt="Hero" width="800" height="450" decoding="async"
     src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">

<img data-src="a.jpg" data-srcset="a.jpg 1x, a@2x.jpg 2x"
     alt="A" width="400" height="300" loading="lazy">
```

```javascript
const stop = lazyLoadImages(document, {
  rootMargin: "300px 0px",
  onError: (img) => img.classList.add("is-broken"),
});

// Before scroll: neither request is made; only the inline placeholder is shown.
// Scrolling within 300px of a.jpg: the browser requests a.jpg (or a@2x.jpg on HiDPI).
stop(); // never load anything else
```

```text
initial:     0 network requests for the real files
near view:   GET /a.jpg            (or /a@2x.jpg when devicePixelRatio >= 2)
in view:     GET /hero.jpg
after stop:  no further requests
broken URL:  "error" fires -> onError(img) -> placeholder stays visible
```

### Approach

Collect the candidates once, observe them, and swap attributes on the first intersection. The
observer's `rootMargin` is the "lookahead": a bottom margin of `200px` fires the callback while the
image is still a screenful away, so the request starts before the user sees an empty box.

Three decisions define a correct implementation:

1. **One-shot, not continuous.** After loading, `observer.unobserve(img)`. Keeping it observed means
   the callback runs on every crossing, and a naive implementation would re-assign `src` (a no-op if
   unchanged, but a bug if the code also resets state).
2. **Remove the `data-*` attributes** after copying them. Now the element no longer matches
   `img[data-src]`, so a later scan (or a re-render) cannot enqueue it again.
3. **Attach the `error` listener before assigning `src`.** A cached image can resolve within the same
   task, and a listener added afterwards can miss the event. The same reasoning applies to `load`.

Why this beats a scroll listener: a scroll handler has to read `getBoundingClientRect()` or
`offsetTop` for every image on every scroll event, which forces layout synchronously and is the
classic cause of janky scrolling. It also fires hundreds of times per second and needs throttling.
`IntersectionObserver` evaluates intersection inside the browser, batched and asynchronously, tells
you only when an image crosses the margin, and automatically accounts for the actual scroll container
and clipping.

Always give images `width`/`height` (or a CSS `aspect-ratio`) so the layout reserves space; otherwise
each load causes a layout shift. `decoding="async"` keeps decode off the main thread. For simple
cases, the native `loading="lazy"` attribute does most of this with no JavaScript; the
`IntersectionObserver` approach wins when you need a custom prefetch margin, a placeholder swap, or
analytics hooks.

### Implementation

```javascript
function lazyLoadImages(
  root = document,
  { rootMargin = "200px 0px", srcAttr = "data-src", srcsetAttr = "data-srcset", onError } = {},
) {
  const images = [...root.querySelectorAll(`img[${srcAttr}]`)];

  const loadImage = (img) => {
    // Attach handlers BEFORE assigning src: a cached image can settle immediately.
    img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
    img.addEventListener(
      "error",
      () => {
        img.classList.add("is-broken");
        onError?.(img);
      },
      { once: true },
    );

    const srcset = img.getAttribute(srcsetAttr);
    const src = img.getAttribute(srcAttr);

    if (srcset) {
      img.srcset = srcset;
      img.removeAttribute(srcsetAttr);
    }
    if (src) {
      img.src = src;
      img.removeAttribute(srcAttr); // now it no longer matches img[data-src]
    }
  };

  // No IntersectionObserver (or a non-DOM root): load everything up front.
  if (!("IntersectionObserver" in window)) {
    images.forEach(loadImage);
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue; // keep observing until it approaches
        loadImage(entry.target);
        observer.unobserve(entry.target);    // one-shot
      }
    },
    { rootMargin },
  );

  images.forEach((img) => observer.observe(img));

  return () => observer.disconnect();
}
```

For the smoothest swap, decode before revealing: `img.decode().then(() => img.classList.add("is-loaded")).catch(() => {})`
instead of relying on the `load` event.

### Walkthrough

Using the two images above with `rootMargin: "300px 0px"`.

1. `querySelectorAll("img[data-src]")` returns both images; both are observed. The observer queues an
   initial entry for each with the current intersection state.
2. The callback runs once with two entries. The first image (`hero.jpg`) is in the viewport, so
   `isIntersecting` is `true`: `loadImage` adds the listeners, copies `src = "hero.jpg"`, removes
   `data-src`, and the observer unobserves it. The browser starts the request.
3. The callback runs again for the second image; it is more than 300px below the fold, so
   `isIntersecting` is `false` and it stays observed.
4. The user scrolls. When `a.jpg` comes within 300px of the viewport, the observer fires with
   `true`: `srcset` is copied first (so the browser can pick `a@2x.jpg` on a HiDPI display), then
   `src`, then the image is unobserved. It never fires again.
5. `stop()` calls `observer.disconnect()`, so any still-unloaded images will never be requested by
   this code.

### Complexity

Time: `O(n)` to collect and observe `n` images, `O(1)` per intersection (plus a network request).
Space: `O(n)` for the observed set, shrinking to `O(1)` as images are unobserved.

### Edge Cases

- **Image already in view at startup:** the initial observation fires immediately, so it loads without
  a scroll.
- **Broken URL:** the `error` listener runs, `onError` fires, and the placeholder remains; the image
  is still unobserved so it does not retry in a loop.
- **Cached image:** handled by attaching the `load`/`error` listeners *before* setting `src`.
- **`data-srcset` without `data-src`, or vice versa:** each is copied only if present.
- **`<picture>` with `<source>`:** `data-srcset` must be transferred to the `<source>` elements too;
  this implementation only handles `<img>`, so note the gap.
- **Image removed from the DOM before it intersects:** the observer retains it; call `stop()` or
  `unobserve` on removal to let it be collected.
- **`rootMargin` percentage:** allowed, and relative to the root's size.
- **No `IntersectionObserver`:** the fallback eagerly loads everything, so the page still works.
- **`stop()` called twice:** `disconnect()` is idempotent.
- **`root` is a scroll container, not `document`:** pass it explicitly so intersection is measured
  against that container.
- **Empty `data-src`:** `img.getAttribute` returns `""`, which is falsy, so nothing is assigned and
  the placeholder stays.

### Interview Follow-ups

- **Native `loading="lazy"`:** the browser already does this with no JS; say when it is enough and
  when `IntersectionObserver` is still needed (custom margins, placeholder swaps, analytics).
- **LQIP / blur-up:** ship a tiny inlined placeholder as `src`, then swap to the full image and
  animate a blur off; pair with `img.decode()` to avoid a flash.
- **Responsive images:** `srcset` + `sizes` lets the browser pick the right resolution; the lazy
  loader must copy both, not just `src`.
- **Priority hints:** mark the hero `fetchpriority="high"` and preload it with
  `<link rel="preload" as="image">`; lazy-load only the below-the-fold images.
- **Free memory:** optionally re-observe and reset `src` when an image leaves the viewport by a large
  margin — usually not worth the complexity, and it can cause re-downloads.
- **`content-visibility: auto`:** lets the browser skip rendering off-screen subtrees, complementing
  image lazy loading.
- **Reserve space:** `width`/`height` attributes or `aspect-ratio` prevent cumulative layout shift,
  which matters for Core Web Vitals.

### Common Mistakes

- Checking `img` visibility with a `scroll` handler and `getBoundingClientRect`, causing forced
  layout on every scroll event.
- Setting `src` without ever calling `unobserve`, so the observer keeps the element alive and the
  callback re-runs on every crossing.
- Adding the `load`/`error` listener after assigning `src`, missing a cached image's event.
- Omitting `width`/`height`, so each lazy load shifts the layout.
- Forgetting `alt`, leaving the image inaccessible.
- Loading the real URL in a `src` attribute as a fallback "just in case," which defeats the entire
  exercise by fetching everything immediately.
- Forgetting the `IntersectionObserver` feature check, throwing in older browsers.
- Not returning a teardown, so a removed component keeps requesting images.

### Takeaway

Lazy loading is "observe, swap once, unobserve." Ship the URL in `data-src`, transfer it (and
`data-srcset`) on the first intersection, remove the `data-*` marker, and use `rootMargin` to start
the request early. The observer removes the scroll listener and its layout thrash, and a one-shot
unobserve is what keeps the whole thing cheap.

## Implement Scroll Throttling

`Difficulty: Easy` `Probability: High`

### Problem

Implement `throttledScroll(handler, wait)` that runs a scroll handler at most once per
`wait` milliseconds, with a leading call for instant feedback and a trailing call so the
final position is never lost. Attach it with `{ passive: true }` and return a `destroy()`
that removes the listener. Then explain when to drop throttling entirely in favour of
`requestAnimationFrame` or `IntersectionObserver`.

### Examples

```javascript
const destroy = throttledScroll((y) => {
  header.classList.toggle("compact", y > 100);
}, 100);
// scrolling fires handler immediately, then at most every 100ms, plus once at rest
destroy(); // listener removed, timer cleared
```

### Approach

Scroll fires at up to 60+ events per second; layout reads inside the handler (like
`getBoundingClientRect`) on every event is the classic jank source. A leading +
trailing throttle (the throttle page's flagship) gives both responsiveness and
completeness: reuse that implementation rather than re-deriving it — this problem is
about *wiring*, not the rate limiter. `passive: true` tells the browser the handler
will never `preventDefault()`, so scrolling never blocks on JS. Keep a named function
reference so `removeEventListener` can actually remove it — the number-one scroll-listener
bug is registering an anonymous function and then failing to unregister it.

Full theory lives on the [Debounce & Throttle](06-debounce-throttle.md) page; here it
is applied.

### Implementation

```javascript
function leadingTrailingThrottle(fn, wait) {
  let lastCall = 0;
  let timerId = null;
  let lastArgs;
  let lastThis;

  function invoke() {
    lastCall = Date.now();
    timerId = null;
    fn.apply(lastThis, lastArgs);
    lastArgs = lastThis = null;
  }

  function throttled(...args) {
    const now = Date.now();
    const remaining = wait - (now - lastCall);
    lastArgs = args;
    lastThis = this;
    if (remaining <= 0) {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      invoke();
    } else if (timerId === null) {
      timerId = setTimeout(invoke, remaining);
    }
  }
  throttled.cancel = () => {
    if (timerId !== null) clearTimeout(timerId);
    timerId = null;
    lastArgs = lastThis = null;
  };
  return throttled;
}

function throttledScroll(handler, wait = 100) {
  if (typeof handler !== "function") throw new TypeError("handler must be a function");
  const throttled = leadingTrailingThrottle(handler, wait);
  // Named + snapshot: the trailing call gets a number, never a stale event.
  const listener = () => throttled(window.scrollY);
  window.addEventListener("scroll", listener, { passive: true });
  return function destroy() {
    window.removeEventListener("scroll", listener);
    throttled.cancel();
  };
}
```

### Walkthrough

`throttledScroll((y) => ..., 100)` then a fling that emits scroll events at
`t = 0, 16, 32, …, 300`:

1. `t = 0`: `remaining <= 0` → leading invoke immediately (header updates at once).
2. `t = 16..100`: each call refreshes `lastArgs` and arms one trailing timer.
3. `t ≈ 100`: the timer fires → trailing invoke with the latest position.
4. The pattern repeats; when events stop, the pending trailing timer delivers the
   final position, then goes quiet. `destroy()` removes the listener and the timer.

### Complexity

Time: `O(1)` per event plus handler cost, capped at ~`1000/wait` handler runs per
second. Space: `O(1)` — a few timestamps and one timer.

### Edge Cases

- `wait = 0` degenerates to unthrottled — guard or document a minimum.
- Always remove with the *same* function reference and the *same* capture flag;
  anonymous listeners leak.
- `passive: true` forbids `preventDefault()` inside — a handler that needs it must be
  non-passive (and will block scrolling).
- Handler throwing: the error propagates from the throttled wrapper; decide whether to
  isolate (see the EventEmitter page's error-isolation discussion).
- SSR/no-`window` environments: guard `typeof window !== "undefined"`.

### Interview Follow-ups

- **`requestAnimationFrame` throttle:** at most one run per frame, aligned with paint —
  better for visual updates; worse for non-visual work (throttled in background tabs).
- **IntersectionObserver instead:** for "element in view" logic it removes the listener
  entirely (see the infinite-scroll problem on this page).
- **Scrollend event:** modern browsers fire `scrollend` — use it instead of trailing
  where supported.

### Common Mistakes

- Anonymous listener + failed `removeEventListener` = leak on every mount.
- Trailing-only throttle: the UI feels laggy on first scroll.
- Leading-only throttle: the final resting position never renders.
- Layout reads (`offsetTop`, `getBoundingClientRect`) inside an unthrottled handler.
- Forgetting `{ passive: true }`, blocking the compositor on JS.

### Takeaway

Scroll handling is leading + trailing throttle on a named, passive listener with a
`destroy()`. And always ask whether an observer or rAF removes the listener altogether.

## Implement Resize Debouncing

`Difficulty: Easy` `Probability: High`

### Problem

Implement `debouncedResize(handler, wait)` that re-runs an expensive layout response
(charts, grids, canvas sizing) only after resizing *settles*, and show the modern
`ResizeObserver`-based equivalent. Return a `destroy()` in both versions. Explain why
debounce (not throttle) is the default for resize, and when `ResizeObserver` makes both
obsolete.

### Examples

```javascript
const destroy = debouncedResize(() => {
  chart.resize(container.clientWidth, container.clientHeight);
}, 150);
// dragging the window edge fires dozens of events; chart.resize runs once, 150ms after rest
destroy();
```

```javascript
const stop = observeResize(container, (entry) => {
  chart.resize(entry.contentRect.width, entry.contentRect.height);
});
stop(); // observer.disconnect()
```

### Approach

Resize is the mirror of scroll: during a drag, intermediate sizes are garbage —
redrawing a chart 60 times for widths nobody will ever see is pure waste. So the
default is **debounce** (run once after quiet), not throttle. Reuse the trailing
debounce from the [Debounce & Throttle](06-debounce-throttle.md) page; this problem is
again about wiring: named handler, timer cleanup, `destroy()`.

The modern answer is `ResizeObserver`: it watches the *element*, not the window, so
sidebar collapses and container queries trigger it too — things window resize never
sees. One observer per component, `disconnect()` on teardown.

### Implementation

```javascript
function debounce(fn, wait, immediate = false) {
  let timerId = null;
  function debounced(...args) {
    const callNow = immediate && timerId === null;
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      if (!immediate) fn.apply(this, args);
    }, wait);
    if (callNow) fn.apply(this, args);
  }
  debounced.cancel = () => {
    clearTimeout(timerId);
    timerId = null;
  };
  return debounced;
}

function debouncedResize(handler, wait = 150) {
  if (typeof handler !== "function") throw new TypeError("handler must be a function");
  const debounced = debounce(handler, wait);
  window.addEventListener("resize", debounced);
  return function destroy() {
    window.removeEventListener("resize", debounced);
    debounced.cancel();
  };
}

function observeResize(element, handler) {
  if (typeof ResizeObserver === "undefined") {
    // Graceful fallback where observers don't exist.
    return debouncedResize(handler, 150);
  }
  const observer = new ResizeObserver((entries) => {
    // One entry per observed element; take the first.
    handler(entries[0]);
  });
  observer.observe(element);
  return function stop() {
    observer.disconnect();
  };
}
```

### Walkthrough

Dragging a window edge for 800ms with `wait = 150`:

1. Each `resize` event clears the pending timer and arms a fresh 150ms one — the
   handler never runs mid-drag.
2. 150ms after the last event, the timer fires → `chart.resize` runs once with the
   final size.
3. `destroy()` removes the listener *and* cancels a pending timer, so no resize runs
   after teardown.

With `observeResize`, no window listener exists at all: the browser notifies only when
the element's box actually changes, batching notifications per frame.

### Complexity

Time: `O(1)` per event (clear + set timeout); the handler runs once per settled
resize. Space: `O(1)` — one timer or one observer.

### Edge Cases

- Handler still pending at teardown → `cancel()` it, or it fires into dead UI.
- `ResizeObserver` loops: resizing the observed element *from inside* the callback
  re-triggers it — guard with a size check or `requestAnimationFrame`.
- Initial size: `observe()` fires once immediately with the current box; the window
  version does not — call the handler once explicitly there if first paint needs it.
- No `window` (SSR) / no `ResizeObserver` (old browsers): guard and fall back.
- `devicePixelRatio` changes need their own handling for canvas sharpness.

### Interview Follow-ups

- **Throttle + debounce combos:** leading-debounce for instant feedback on first resize.
- **Container queries vs JS measurement:** CSS increasingly removes the need for JS here.
- **`visualViewport` API:** mobile keyboard resizes need `visualViewport.resize`, not
  window resize.

### Common Mistakes

- Throttling resize and redrawing dozens of times for transient sizes.
- Anonymous listener, failed removal, leaked timer firing into unmounted UI.
- Observing `document.body` and causing feedback loops.
- Assuming window resize fires for element-level changes (sidebar toggle, fonts loading).
- Forgetting the explicit initial call, leaving the first paint unsized.

### Takeaway

Resize is debounce-after-quiet on a named listener with `destroy()` — and
`ResizeObserver` on the element is the better default wherever it exists.


## Save and Restore Data with `localStorage`

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `createStorage(namespace)` — a thin, defensive wrapper over `localStorage` with `get(key, fallback)`, `set(key, value)`, `remove(key)`, and `keys()`. The contract is the **string ↔ value** boundary: `localStorage` stores only strings, so every write is a `JSON.stringify` and every read is a `JSON.parse`. The wrapper must also survive the three failure modes a naive `localStorage.setItem(k, obj)` ignores: **unserializable values**, **quota exceeded**, and **unavailable storage** (disabled cookies, private mode, SSR, workers).

A second contract matters for interviews: **reads return deep copies**. Parse produces a fresh object every time, so mutating what `get` returned does *not* change storage until you `set` it back.

### Examples

```text
const store = createStorage("app");

store.set("user", { name: "Ada", age: 36 });
localStorage.getItem("app:user")   // => '{"name":"Ada","age":36}'

store.get("user")                  // => { name: "Ada", age: 36 }
store.get("missing", { ok: false })// => { ok: false }

const a = store.get("user");
a.age = 99;
store.get("user").age              // => 36   (deep copy, not persisted)

store.set("noop", undefined)       // => false (undefined does not serialize)
store.set("nan", { n: NaN }); store.get("nan") // => { n: null } (Infinity too)

store.set("circular", (() => { const o = {}; o.self = o; return o; })())
                                   // => false (TypeError inside, caught)

localStorage.setItem("app:user", "{not json");
store.get("user", "fallback")      // => "fallback" (corrupt payload, no throw)
```

### Approach

`localStorage` is a synchronous string map exposed through the `Storage` interface. The wrapper is one indirection that makes the string boundary explicit.

1. **Namespace the keys.** Prefix every key (`app:user`) so the app can enumerate and clear its own slice without touching other code on the origin. `Object.keys(localStorage)` mostly works, but the portable enumeration is `storage.length` + `storage.key(i)`.
2. **Probe the backend, then cache it.** Merely *reading* `globalThis.localStorage` throws a `SecurityError` in sandboxed iframes, and in some private modes the object exists but `setItem` throws. Do one write/remove probe; on failure set the backend to `null` and make every method a safe no-op.
3. **`JSON.stringify` on write, `JSON.parse` + reviver on read.** `stringify` silently drops `undefined`, functions, and symbols from objects, turns `NaN`/`Infinity` into `null`, and returns `undefined` (not a string) for a top-level `undefined` — refuse to write that rather than storing `"undefined"`. It throws `TypeError` for cycles and `BigInt`. On the way back, JSON has no `Date`/`Map`/`Set`/`RegExp`; a reviver that recognises ISO-8601 restores real `Date`s, and the rest need explicit tagging. `structuredClone` does **not** help: you still must produce a string.
4. **Distinguish "absent" from "stored `null`."** `getItem` returns `null` in both cases. Take an explicit `fallback`, and wrap the payload if the distinction matters.
5. **Handle quota.** The budget is ~5 MB of UTF-16 characters (≈10 MB of bytes). When full, `setItem` throws a `DOMException` named `QuotaExceededError` (older Firefox: `NS_ERROR_DOM_QUOTA_REACHED`); some private modes throw regardless of size. Catch it, return `false`, let the caller evict. `getItem` can throw too, so the read path needs its **own** `try`/`catch` separate from the parse.

`sessionStorage` shares this API but is per-tab (survives reloads, not closes); everything below works against either backend.

### Implementation

```javascript
function createStorage(namespace, { storage } = {}) {
  // Resolve + probe the backend once. Reading localStorage can itself throw,
  // and a present-but-unwritable Storage exists in some private modes.
  let backend = storage;
  if (backend === undefined) {
    try {
      const ls = globalThis.localStorage;
      const probe = "__probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      backend = ls;
    } catch {
      backend = null; // disabled cookies, sandboxed iframe, SSR, worker
    }
  }

  const prefix = `${namespace}:`;
  const keyFor = (key) => prefix + key;

  // JSON has no Date. Restore ISO-8601 strings so round-tripped dates stay Dates.
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  const reviver = (_key, value) =>
    typeof value === "string" && ISO.test(value) ? new Date(value) : value;

  return {
    get(key, fallback = null) {
      if (!backend) return fallback;
      let raw = null;
      try { raw = backend.getItem(keyFor(key)); } catch { return fallback; }
      if (raw === null) return fallback;                                  // absent key
      try { return JSON.parse(raw, reviver); } catch { return fallback; } // corrupt payload
    },

    set(key, value) {
      if (!backend) return false;
      let raw;
      try { raw = JSON.stringify(value); } catch { return false; } // cycle or BigInt
      if (raw === undefined) return false; // top-level undefined / function / symbol
      try { backend.setItem(keyFor(key), raw); return true; }
      catch { return false; }              // QuotaExceededError, private-mode block
    },

    remove(key) {
      if (!backend) return;
      try { backend.removeItem(keyFor(key)); } catch { /* ignore */ }
    },

    keys() {
      if (!backend) return [];
      const out = [];
      for (let i = 0; i < backend.length; i += 1) {
        const key = backend.key(i); // Storage has no index: enumerate by position
        if (key !== null && key.startsWith(prefix)) out.push(key.slice(prefix.length));
      }
      return out;
    },
  };
}
```

### Walkthrough

`store.set("user", { name: "Ada", joined: new Date("2024-01-02T03:04:05Z") })`:

1. `JSON.stringify` walks the object. `name` is a string; `joined` has a `toJSON` method (inherited from `Date.prototype`), so it serializes to `"2024-01-02T03:04:05.000Z"`. The result is `'{"name":"Ada","joined":"2024-01-02T03:04:05.000Z"}'`.
2. `backend.setItem("app:user", raw)` writes the string synchronously. Returns `true`.

Now `store.get("user")`:

3. `getItem("app:user")` returns the raw string — `null` would mean absent, so we proceed.
4. `JSON.parse(raw, reviver)` walks the output. For `name`, `ISO.test("Ada")` is false → unchanged. For `joined`, the regex matches → `new Date("2024-01-02T03:04:05.000Z")`. The caller receives a real `Date`, so `get("user").joined.getUTCFullYear()` is `2024`.
5. Call it again: `JSON.parse` runs a second time, so `get("user") !== get("user")`. That is the deep-copy rule in action — two identical-looking but distinct objects.

Now the failure paths. `store.set("circular", o)` where `o.self === o`: `JSON.stringify` throws `TypeError`; the `catch` returns `false` and nothing is written. `store.set("noop", undefined)`: `JSON.stringify(undefined)` returns `undefined`, the `raw === undefined` guard fires, returns `false`. And after someone hand-edits the entry to `"{not json"`, `JSON.parse` throws inside its own `try`, so `get("user", "fallback")` returns `"fallback"` instead of taking down the app during boot.

### Complexity

Time: `O(n)` in payload size for `JSON.stringify`/`parse`, which is **synchronous and blocks the main thread** — that is the real cost of `localStorage`, not the `O(1)` map lookup. `keys()` is `O(k)` over all storage keys for the origin, since `Storage` has no prefix index. Space: `O(n)` for the string, which lives in the DOM-side storage as UTF-16 (~2 bytes per character), plus a copy of the parsed object.

### Edge Cases

- **Missing key** → `fallback`. There is no in-band way to tell "never written" from "stored `null`" unless you wrap the payload in an envelope like `{ v: null }`.
- **Corrupt JSON** (devtools edit, partial write, older schema) → `fallback`, never a throw. One bad key must not break the whole boot.
- **`undefined` / function / symbol** as the whole value → `stringify` returns `undefined` → `set` refuses. Inside an object they are dropped silently instead: `{ a: undefined }` becomes `{}`.
- **`NaN` / `Infinity`** → `null`; **`-0`** → `0`; **`BigInt` or a circular reference** → `TypeError`, caught, `set` returns `false`.
- **`Date`** revives via the reviver. **`Map` / `Set` / `RegExp` / class instances** become `{}` or a plain object and lose their prototype — tag and rebuild them by hand.
- **Quota exceeded** → `setItem` throws `DOMException`; `set` returns `false`. There is no automatic eviction unless you write it (see follow-ups).
- **Storage disabled / SSR / worker** → probe fails, `backend === null`, all methods degrade to `fallback`/`false`/no-op. `localStorage` does not exist in workers at all.
- **`storage` events do not fire in the tab that wrote** — the next problem covers this.
- **XSS reads it.** `localStorage` is not a security boundary; any script on the origin can read every key. Do not persist tokens or PII.
- **No atomicity.** Two tabs doing read-modify-write on one key lose updates; the Storage API has no lock.

### Interview Follow-ups

- **Schema versioning:** store `{ v: 2, data }` and run `migrate(raw)` once per session on read.
- **LRU eviction on quota:** catch the failure, keep an `updatedAt` beside each value, delete the oldest entries, retry once.
- **`IndexedDB` instead:** asynchronous, no 5 MB cap beyond disk quota, stores structured clones natively — at the cost of a much larger async API.
- **Cross-tab sync:** the `storage` event (next problem) and `BroadcastChannel`.

### Common Mistakes

- `localStorage.setItem(key, obj)` without `JSON.stringify` — stores `"[object Object]"` and every read returns that string.
- Assuming the write succeeded; ignoring the quota `DOMException`, so saves silently vanish.
- Not wrapping `JSON.parse` in `try`/`catch`, so a single hand-edited value throws on page load and blanks the app.
- Using `null` as the "missing" sentinel while also storing `null`, making the two states indistinguishable.
- Treating the parsed result as live state: mutating the object `get` returned and expecting persistence.
- Assuming `typeof localStorage !== "undefined"` is enough — accessing it can throw, and existence does not imply writability.
- Storing secrets because the key is not visible in the URL.

### Takeaway

`localStorage` is a synchronous, 5 MB, string-only map. The wrapper's whole job is the string ↔ value contract plus three failure modes: **parse error, quota, unavailable storage**. Every read is a fresh deep copy; every write is a full serialization you can be told `false` about.

## Implement `localStorage` with TTL

`Difficulty: Medium` `Probability: High`

### Problem

Implement `createTTLStorage(storage = localStorage)` — a key/value store where every entry can carry a **time to live**:

```text
set(key, value, ttlMs = Infinity) -> boolean
get(key)                          -> value | null
has(key)                          -> boolean
remove(key)                       -> void
purge()                           -> number   // expired entries removed
```

The contract:

- `get` must **never** return an expired value, and must return `null` for both "never written" and "expired."
- An expired entry should be **deleted** the moment it is discovered (lazy eviction), so storage does not fill with dead keys.
- Expiry must survive a page reload, a tab being suspended, and the browser being closed.
- `ttlMs` is milliseconds from the moment of the call; `Infinity` means no expiry.

The trap: TTL is a property of the **entry**, not of a timer you keep in the page.

### Examples

```text
const store = createTTLStorage();

store.set("token", "abc", 1000);
store.get("token")                  // => "abc"    (t = 0..999)
// ... 1001 ms pass
store.get("token")                  // => null, and localStorage no longer has the key

store.set("forever", { plan: "pro" }) // ttl defaults to Infinity
store.get("forever")                // => { plan: "pro" }  (always)

store.set("now", "x", 0); store.get("now")   // => null  (expires on the next read)
store.set("neg", "x", -5); store.get("neg")  // => null  (negative ttl clamped to 0)

store.set("a", 1, 50); store.set("b", 2, 10_000);
// ... 100 ms pass
store.purge()                       // => 1  (only "a" was expired)

store.get("never-written")          // => null
```

### Approach

Store an **envelope**, not a bare value: `{ v: <value>, e: <absolute expiry timestamp | null> }`.

1. **Absolute time, not a countdown.** Persist `e = Date.now() + ttlMs`. A relative TTL stored on disk would restart its countdown on every reload — the classic bug. Absolute timestamps are also what a server sends for auth tokens.
2. **Lazy expiry on read.** `get` compares `Date.now()` to `e` and deletes the key when expired. No timers, nothing to re-arm, nothing to leak. This is why suspension and reload are non-issues: expiry is a pure function of the envelope and the current clock.
3. **`>=` at the boundary.** `ttlMs = 0` must expire "immediately"; using `>` would let a same-millisecond read through.
4. **Non-finite TTL means no TTL.** `Infinity` (the default) and `NaN` are not finite, so they fall into the `e: null` branch. Clamp negatives with `Math.max(0, ttlMs)` so they expire at once rather than being "already expired forever."
5. **Fail open on unreadable payloads.** An entry written before this wrapper existed (or hand-edited) may not be an envelope. Return the raw value with no expiry instead of deleting data you cannot interpret.
6. **`purge()` sweeps opportunistically.** Snapshot the key list first: the `Storage` API's index shifts as you delete, so mutating while iterating skips keys. Schedule it on idle; it is `O(k)` over every key on the origin.
7. **One parse per read.** `get` must not parse the envelope twice (once to check `e`, once to return `v`) — read the envelope object, check `e`, return `env.v`. Also note `env.v === undefined` is possible if `undefined` was stored; `has` should compare against the envelope, not the value.

Honesty about the clock: `Date.now()` is wall clock, so a user changing the system clock, or an NTP correction, moves expiry. `performance.now()` is monotonic but resets on navigation, so it cannot back a persisted TTL. For anything security-relevant, treat the TTL as a UX nicety and let the server enforce real expiry.

### Implementation

```javascript
function createTTLStorage(storage = globalThis.localStorage) {
  const now = () => Date.now();

  // Read + interpret one entry. Returns null (absent) or an envelope object.
  // Fails OPEN: an unparseable / legacy payload is treated as a value with no TTL.
  const readEnvelope = (key) => {
    let raw;
    try { raw = storage.getItem(key); } catch { return null; }
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      const isEnvelope =
        parsed !== null && typeof parsed === "object" && "v" in parsed && "e" in parsed;
      return isEnvelope ? parsed : { v: parsed, e: null };
    } catch {
      return { v: raw, e: null }; // legacy raw string written before TTL existed
    }
  };

  // e === null means "no expiry"; otherwise e is an absolute ms timestamp.
  const expired = (env) => env.e !== null && now() >= env.e;

  const get = (key) => {
    const env = readEnvelope(key);
    if (env === null) return null;
    if (expired(env)) {
      try { storage.removeItem(key); } catch { /* already gone */ } // lazy eviction
      return null;
    }
    return env.v;
  };

  return {
    get,

    set(key, value, ttlMs = Infinity) {
      // Only finite TTLs get a timestamp; Infinity/NaN mean "never expires".
      const e = Number.isFinite(ttlMs) ? now() + Math.max(0, ttlMs) : null;
      try {
        storage.setItem(key, JSON.stringify({ v: value, e }));
        return true;
      } catch {
        return false; // quota exceeded / storage disabled
      }
    },

    has(key) {
      return get(key) !== null;
    },

    remove(key) {
      try { storage.removeItem(key); } catch { /* ignore */ }
    },

    purge() {
      // Snapshot first: Storage's index shifts as items are removed.
      const keys = [];
      try {
        for (let i = 0; i < storage.length; i += 1) keys.push(storage.key(i));
      } catch { return 0; }

      let removed = 0;
      for (const key of keys) {
        if (key === null) continue;
        const env = readEnvelope(key);
        if (env !== null && expired(env)) {
          try { storage.removeItem(key); removed += 1; } catch { /* ignore */ }
        }
      }
      return removed;
    },
  };
}
```

### Walkthrough

Take `set("token", "abc", 1000)` at `t = 0`:

1. `Number.isFinite(1000)` is true, so `e = 0 + Math.max(0, 1000) = 1000`. The stored string is `'{"v":"abc","e":1000}'`.
2. `get("token")` at `t = 400`: `readEnvelope` parses, `"v" in parsed` and `"e" in parsed` are true, so the envelope is returned. `expired` is `1000 !== null && 400 >= 1000` → `false`. `get` returns `"abc"`.
3. `get("token")` at `t = 1000`: `1000 >= 1000` → `true`, so `removeItem("token")` runs and `get` returns `null`. Note this is the boundary case: `ttlMs = 0` behaves identically, which is what we want.
4. `get("token")` at `t = 1200`: `getItem` returns `null`, so `readEnvelope` returns `null` and we short-circuit — one fewer parse, and the key is genuinely gone.

Now the `purge()` path with `set("a", 1, 50)` and `set("b", 2, 10_000)` at `t = 0`, then `purge()` at `t = 100`. The snapshot is `["a", "b"]`. For `"a"`: `100 >= 50` → removed, `removed = 1`. For `"b"`: `100 >= 10_000` is false → kept. `purge()` returns `1`, and `get("b")` still returns `2`.

Finally the legacy path: a key `theme` holding the raw string `"dark"` (written by older code). `JSON.parse('"dark"')` succeeds and yields the string `"dark"` — but `"v" in "dark"` is `false` (and `in` on a primitive throws `TypeError`, which is why the `typeof parsed === "object"` guard comes first). So `readEnvelope` returns `{ v: "dark", e: null }` and the value is served without expiry rather than deleted.

### Complexity

Time: `get`/`set` are `O(n)` in payload size for the `JSON.parse`/`stringify` (the envelope adds two fields, not a second pass). `purge` is `O(k)` in the number of keys on the origin, since each one must be read and parsed to inspect its `e`. Space: `O(k)` for the snapshot array, `O(n)` for the parsed envelope. Nothing here is a timer, so idle cost is zero.

### Edge Cases

- **`ttlMs = 0`** → `e = now`, and `>=` expires it on the very next read, including a same-millisecond one.
- **Negative / fractional TTL** → clamped by `Math.max(0, ...)`; `1.5` gives `e = now + 1.5` and `Date.now()` is integral, so it expires at `now + 2` effectively. No rounding needed, but do not assume integer `e`.
- **`Infinity` / `NaN`** → both non-finite → `e = null` → never expires. If you want `NaN` to mean "expire now," test `Number.isNaN` before the `isFinite` check. State the rule; do not leave it implicit.
- **Absent vs expired** → both `null`. If a caller must tell them apart (e.g. "session expired, please log in" vs "no session"), return an envelope from a `getEntry` variant instead of overloading `null`.
- **Legacy raw entries** → returned as-is, no expiry, never deleted.
- **Corrupt JSON** → fail open: the raw string is returned. The alternative (delete) loses user data on a parse bug.
- **Stored `undefined`** → the envelope's `v` is `undefined`, so `get` returns `undefined`, not `null`, and `has` would report `false`. Decide whether `has` means "present" (check the envelope) or "has a non-null value."
- **Clock changes** → wall-clock TTL is at the mercy of the user's clock and NTP steps. Say so out loud.
- **Storage unavailable** → `getItem`/`setItem` throw; `get` returns `null`, `set` returns `false`.
- **Quota** → the envelope is slightly larger than the raw value; `set` returns `false` rather than throwing. A useful refinement is "purge, then retry once."
- **Multi-tab** → two tabs may both discover and delete the same expired key. `removeItem` is idempotent, so the race is harmless.
- **Very large `ttlMs`** → `now + 1e15` is still an exact integer below `Number.MAX_SAFE_INTEGER`, so no overflow concerns in practice; `Infinity` is handled separately.

### Interview Follow-ups

- **Sliding expiration:** refresh `e` on each read. Convenient, but it means an actively-polling tab never logs out — a footgun for auth. Prefer absolute server-issued expiry.
- **`onExpire` callbacks with a timer:** find the smallest `e`, `setTimeout` for it, re-arm on `visibilitychange` and after each `purge`. Timers are an *optimization* for notification; the lazy check remains the source of truth because background tabs throttle timers and reloads lose them entirely.
- **In-memory L1 cache:** keep a `Map` of parsed envelopes to avoid `JSON.parse` on every read; invalidate on `set`/`remove`. Measure before adding it — parsing a few hundred bytes is cheap.
- **Envelope versioning:** `{ v: 2, value, e }` so the schema can migrate without breaking old entries.
- **Encryption / signing:** TTL is not a security control. A client can rewrite `e`, and any script on the origin can read the value.

### Common Mistakes

- Storing a relative TTL (`{ value, ttl: 1000 }`) and resetting the countdown on every reload.
- Relying on `setTimeout` alone: the timer is lost on reload and throttled in background tabs, so entries outlive their TTL.
- Using `>` instead of `>=`, so `ttlMs = 0` entries can still be read in the same millisecond.
- Parsing twice (`JSON.parse` to check `e`, again to return `v`) — one parse, return `env.v`.
- Deleting entries that fail to parse, destroying data on a schema change.
- Mutating storage while iterating `storage.length`/`storage.key(i)`, which skips entries during `purge`.
- Treating a client-side TTL as an authorization decision.

### Takeaway

TTL is a property of the **entry**, not of a timer: persist an absolute `expiresAt` beside the value, enforce it lazily on read, and sweep opportunistically. Timers are for notifying, never for correctness — which is exactly why expiry survives reloads, suspension, and closed tabs for free.

## Sync State Across Tabs with the `storage` Event

`Difficulty: Medium` `Probability: High`

### Problem

Implement `syncAcrossTabs(key, onChange)` — subscribe to changes of one `localStorage` key made in **other** tabs, and return an `unsubscribe` function. The contract:

- Writes are a JSON envelope under a namespaced key; reads parse defensively and never throw.
- The `storage` event fires in **every other** `Window` on the origin, never in the tab that wrote.
- `onChange(nextValue, { key, url, cleared })` is called only for the subscribed key; `unsubscribe()` removes the listener.

### Examples

```text
// Tab A:                         // Tab B (subscribed to "app:theme"):
syncAcrossTabs("app:theme", (v) => render(v));
localStorage.setItem("app:theme", '"dark"')
                                  // => onChange("dark") fires in Tab B only
                                  // => Tab A hears nothing
localStorage.removeItem("app:theme")
                                  // => onChange(null) fires in Tab B
localStorage.clear()
                                  // => onChange(null, { cleared: true }) in Tab B
unsub()                           // => Tab B stops hearing anything
```

### Approach

The `storage` event is the browser's built-in cross-tab bus, but its shape surprises people:

1. **It never fires locally.** `window.addEventListener("storage", ...)` observes writes from other browsing contexts only. The writing tab must update its own UI directly — do not wait for an event that will never come.
2. **Namespace the key.** Subscribe to the full key (`"app:theme"`), not a prefix, because the event carries `event.key`, `event.newValue`, and `event.url`. On `clear()`, `event.key` is `null` — treat that as "everything may be gone" and re-read or report `cleared: true`.
3. **Parse, do not trust.** `event.newValue` is a string or `null` (removal). Parse with `JSON.parse` in `try`/`catch`; a corrupt payload calls `onChange` with a fallback rather than throwing inside an event handler.
4. **Return cleanup.** The listener closes over `onChange`. `unsubscribe` calls `removeEventListener` with the **same function reference** — an inline arrow in both places leaks.
5. **Same-origin and same-storage only.** `sessionStorage` changes never cross tabs (it is per-tab), and `storage` events do not fire across origins or in workers. Say that boundary out loud.

### Implementation

```javascript
function syncAcrossTabs(key, onChange, { fallback = null } = {}) {
  if (typeof onChange !== "function") throw new TypeError("onChange must be a function");

  const parse = (raw) => {
    if (raw === null) return fallback; // removeItem or clear
    try {
      return JSON.parse(raw);
    } catch {
      return fallback; // corrupt payload: fail open, never throw in handler
    }
  };

  const handler = (event) => {
    // event.key is null when clear() wiped the whole origin.
    if (event.key === null) {
      onChange(parse(event.newValue), { key, url: event.url, cleared: true });
      return;
    }
    if (event.key !== key) return; // namespaced: ignore other keys
    // event.storageArea distinguishes localStorage from sessionStorage.
    onChange(parse(event.newValue), { key, url: event.url, cleared: false });
  };

  window.addEventListener("storage", handler);

  // Optional: hydrate immediately so the subscriber starts from current truth.
  // hydrate() is separate from the event path on purpose.
  const hydrate = () => {
    let raw = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }
    return parse(raw);
  };

  const unsubscribe = () => window.removeEventListener("storage", handler);
  return { unsubscribe, hydrate };
}
```

### Walkthrough

Tab B calls `syncAcrossTabs("app:theme", render)`; Tab A runs `localStorage.setItem("app:theme", '"dark"')`:

1. Tab A's write commits synchronously. No event fires in Tab A.
2. The browser dispatches a `StorageEvent` to every other `Window` on the origin. In Tab B, `event.key` is `"app:theme"`, `event.newValue` is `'"dark"'`, `event.url` is Tab A's URL.
3. `handler` runs: `event.key === null` is false; `event.key !== key` is false, so it proceeds. `parse('"dark"')` returns `"dark"`.
4. `onChange("dark", { key: "app:theme", url, cleared: false })` runs `render("dark")`.
5. Later Tab A calls `removeItem("app:theme")`: `event.newValue` is `null`, so `parse` returns `fallback` (`null`) and Tab B renders the default.

### Complexity

Time: `O(n)` in payload size per event for the parse; filtering by key is `O(1)`. Space: `O(n)` for the parsed value. The listener itself is idle — no polling, no timers.

### Edge Cases

- **Writing tab hears nothing** — the single most-tested fact. Update local UI at the write site.
- **`clear()`** → `event.key` is `null`, `newValue` is `null`. Report `cleared: true` so the caller can re-hydrate every key.
- **`removeItem`** → `newValue` is `null`, indistinguishable from "stored null" unless you use an envelope like `{ v }`.
- **Unrelated keys** → early return. Without the guard, a busy origin spams every subscriber.
- **Corrupt JSON** → fallback, no throw. Event handlers that throw still swallow the update.
- **`storageArea`** → check it if the page uses both storages; `sessionStorage` events fire only between frames sharing a tab.
- **File:// and sandboxed iframes** → `localStorage` access can throw; the `hydrate` path guards it.
- **Race on read-modify-write** → two tabs incrementing one key lose updates. The event notifies; it does not lock.

### Interview Follow-ups

- **Elect a leader tab:** on `storage` heartbeat keys, the tab with the smallest `id` in `sessionStorage` owns the WebSocket; others take over when its heartbeat expires.
- **Debounce rapid writes:** coalesce bursts with a microtask before re-rendering.
- **Why not poll `localStorage` on an interval?** Synchronous reads block the main thread and drain battery; the event is push-based and free.
- **When is `BroadcastChannel` better?** Next problem — transient messages that must also reach the sending tab's peers without touching disk.

### Common Mistakes

- Expecting the event in the writing tab and concluding "it doesn't work."
- Comparing `event.newValue` (a string) directly to objects without parsing.
- Forgetting `event.key === null` for `clear()`, so a wipe leaves stale UI.
- Calling `removeEventListener("storage", () => ...)` with a fresh arrow — the listener never detaches.
- Subscribing with an un-namespaced key like `"theme"` and colliding with another library on the origin.

### Takeaway

The `storage` event is a push notification to **other** tabs: filter by exact key, parse defensively, handle the `key === null` clear case, and always return an `unsubscribe` that removes the same listener.

## Communicate Across Tabs with `BroadcastChannel`

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `createTabBus(name)` — a tiny pub/sub over `BroadcastChannel` with `post(message)`, `subscribe(listener)`, and `close()`. The contract:

- Every **open** context on the same origin with the same channel `name` receives each message, **including** other tabs, windows, iframes, and workers — but never the posting object itself in some browsers, so do not rely on self-delivery.
- `close()` detaches everything: no more sends, no more receives, no leaked channel.
- Messages use the structured-clone algorithm, not JSON strings.

### Examples

```text
const a = createTabBus("chat");
const b = createTabBus("chat");
const unsub = b.subscribe((msg) => console.log("b got", msg));

a.post({ text: "hi" });   // => b logs: b got { text: "hi" }
unsub();                  // => b stops receiving
a.close(); b.close();     // => channels released
```

### Approach

`BroadcastChannel` is the purpose-built tab bus; `storage` events are the fallback that happens to notify:

1. **One channel per bus, one listener set per channel.** `new BroadcastChannel(name)` joins the named room. Keep a `Set` of listeners and attach a single `channel.onmessage` dispatcher — attaching one native handler per subscriber leaks and reorders.
2. **Structured clone, not JSON.** Dates, Maps, typed arrays, and circular objects survive; functions, DOM nodes, and `WeakMap`s do not and throw `DataCloneError`. `undefined` and class prototypes need care: the prototype is dropped.
3. **Self-delivery is unreliable.** The spec does not deliver to the posting object, but some browsers echo to *other* objects on the same channel name in the *same* page. Never design a protocol that requires (or forbids) self-receipt — update local state directly at the post site.
4. **Lifecycle is explicit.** `channel.close()` leaves the room; after it, `post` throws `InvalidStateError` in some browsers and silently drops in others, and queued messages may never arrive. Guard with a `closed` flag and make `close()` idempotent.
5. **Compare with `storage` events deliberately.** Channel messages are transient (no persistence, no late-joiner replay) and reach same-page peers; `storage` events persist the last value (late joiners read it) but never reach the writer. Interviewers want that table.

### Implementation

```javascript
function createTabBus(name) {
  if (!("BroadcastChannel" in globalThis)) {
    throw new Error("BroadcastChannel is not supported in this browser");
  }

  const channel = new BroadcastChannel(name);
  const listeners = new Set();
  let closed = false;

  // Single native entry point; fan out to the Set so unsubscribe is O(1).
  channel.onmessage = (event) => {
    for (const listener of [...listeners]) {
      try {
        listener(event.data, event);
      } catch {
        // One bad subscriber must not break the rest of the fan-out.
      }
    }
  };

  return {
    post(message) {
      if (closed) return false;
      try {
        channel.postMessage(message); // structured clone happens here
        return true;
      } catch {
        return false; // DataCloneError: function, DOM node, WeakMap, ...
      }
    },

    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      listeners.add(listener);
      // Cleanup for THIS subscriber only; the channel stays open for others.
      return () => {
        listeners.delete(listener);
      };
    },

    messageCount() {
      return listeners.size;
    },

    close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      channel.onmessage = null; // break the native -> JS reference before close
      channel.close();          // leave the room; releases the underlying port
    },
  };
}
```

### Walkthrough

Two tabs open the same origin; each runs `createTabBus("chat")` and subscribes:

1. Tab A calls `post({ text: "hi" })`. The browser structured-clones `{ text: "hi" }` — the receiver gets a distinct object, so `msg !== original`.
2. Tab B's `channel.onmessage` fires with `event.data` as the clone. The dispatcher iterates the snapshot `[...listeners]` and calls each one.
3. A second subscriber in Tab B that throws does not stop the first: the `try`/`catch` around each call contains the failure.
4. Tab B calls its `unsub()`: only its entry leaves the `Set`; Tab A's channel is unaffected. When both call `close()`, `closed` flips, the `Set` clears, `onmessage` is nulled, and the ports release. A late `post` returns `false` instead of throwing.

### Complexity

Time: `O(s)` per message for `s` subscribers, plus `O(n)` structured-clone cost in payload size. Space: `O(n)` for the clone held until dispatch completes. Idle cost is zero — no polling.

### Edge Cases

- **Unsupported browsers (older Safari/SSR/workers without it)** → feature-detect and fall back to `storage` events, or throw a clear error as above. Decide and state it.
- **Un-cloneable payloads** → functions, DOM nodes, `WeakRef`s throw `DataCloneError`; `post` returns `false` instead of propagating.
- **Prototype loss** → class instances arrive as plain objects; rehydrate with a `type` field and a factory.
- **`close()` then `post()`** → guarded to `false`. Without the flag, behaviour differs by browser.
- **Unsubscribe during dispatch** → iterate a snapshot so a listener removing itself does not skip its neighbour.
- **Name collisions** → the channel name is global per origin; prefix it (`"app:chat"`) like storage keys.
- **No persistence** → a tab opened after the message never sees it. Persist last-value separately if late joiners need state.

### Interview Follow-ups

- **`storage` event vs `BroadcastChannel`:** persistence (storage wins, late joiners read) vs transience and self-page delivery (channel wins); payload (string-only vs structured clone); writer notification (never vs unreliable). Draw the table.
- **Leader election / locks:** combine a channel heartbeat with a `localStorage` timestamp; the lowest-id live tab owns the socket.
- **Exactly-once delivery:** add `{ id, retries }` and an ack channel; the bus itself is at-most-once per open context.
- **Cross-origin tabs:** neither primitive crosses origins — use `postMessage` on a shared `window.open` reference or a server relay.

### Common Mistakes

- Relying on self-delivery (or its absence) in application logic — both assumptions break across browsers.
- Attaching `channel.onmessage = listener` per subscriber so each subscribe overwrites the last.
- Forgetting `channel.close()` on unmount/pagehide, leaking a port per navigation in SPAs.
- Sending class instances and reading methods on the other side — prototypes do not survive the clone.
- Using the channel as storage: expecting a newly opened tab to receive yesterday's message.

### Takeaway

`BroadcastChannel` is a transient, structured-clone bus for a named room: one native handler fanning out to a `Set`, never depend on self-delivery, and `close()` must clear listeners, null the handler, and close the port.

## Implement Copy to Clipboard

`Difficulty: Easy` `Probability: High`

### Problem

Implement `copyText(text)` returning `Promise<boolean>` — `true` on success, `false` on any failure, never throws. The contract:

- Prefer the async `navigator.clipboard.writeText`; fall back to the legacy `execCommand("copy")` path where the Clipboard API is missing, insecure, or denied.
- Works only after a **user gesture** and (for the modern API) in a **secure context**; every failure collapses to `false`.

### Examples

```text
await copyText("hello@example.com"); // => true  (button click, HTTPS)
await copyText("no gesture yet");    // => false (called on page load, denied)
await copyText("http page");         // => true via execCommand fallback (Clipboard API absent)
```

### Approach

Clipboard access is a permission-gated capability, not a plain function:

1. **Try modern first.** `navigator.clipboard?.writeText(text)` is async, preserves Unicode, and needs no DOM hacks. It resolves only in secure contexts (`https:`, `localhost`) after a user activation; otherwise it rejects with `NotAllowedError`/`SecurityError`.
2. **Fall back to selection + `execCommand`.** Create a temporary off-screen `textarea`, set its `value`, append it, `focus()` + `select()`, call `document.execCommand("copy")` (returns a boolean), then remove the node in a `finally`. The element must be attached and visible-ish — `display: none` or `opacity: 0` with zero size breaks selection in some browsers.
3. **Never throw.** Normalise `undefined`, denial, missing API, and `execCommand` returning `false` into one `false`. Callers branch on the boolean (show "Press ⌘C") rather than catching five error shapes.
4. **Gesture discipline.** Call `copyText` synchronously inside the click/keydown handler. Awaiting a `fetch` first consumes the transient activation and turns a success into `NotAllowedError`.
5. **Permissions are advisory.** `navigator.permissions.query({ name: "clipboard-write" })` is unsupported in Firefox/Safari; treat it as a hint, not a gate, and just attempt the write.

### Implementation

```javascript
async function copyText(text) {
  const value = String(text ?? "");
  if (value === "") return false; // nothing to copy; avoid a fake "success"

  // 1. Modern path: async, no DOM needed, requires gesture + secure context.
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to execCommand: denial, insecure context, no focus.
  }

  // 2. Legacy path: selection-based copy. Must run on the main thread with a live DOM.
  try {
    const area = document.createElement("textarea");
    area.value = value;
    // Off-screen but selectable: display:none breaks select() in some browsers.
    area.style.position = "fixed";
    area.style.top = "-9999px";
    area.style.left = "-9999px";
    area.setAttribute("readonly", ""); // keeps iOS keyboard from popping up
    document.body.appendChild(area);
    try {
      area.focus({ preventScroll: true });
      area.select();
      area.setSelectionRange(0, area.value.length); // iOS needs the explicit range
      return document.execCommand("copy"); // boolean, deprecated but universal
    } finally {
      area.remove(); // cleanup even when execCommand throws
    }
  } catch {
    return false;
  }
}
```

### Walkthrough

Click handler runs `await copyText("hello@example.com")` on HTTPS:

1. `value` is non-empty. `navigator.clipboard.writeText` exists, so we `await` it. The browser checks transient activation (the click) and the secure context — both pass — and writes to the OS clipboard. Return `true`.
2. Same call on `http:` in an old browser: `navigator.clipboard` is `undefined`, so the first block is skipped. The fallback appends the off-screen `textarea`, `select()`s `"hello@example.com"`, `execCommand("copy")` returns `true`, and `finally` removes the node. Return `true`.
3. Called from `setTimeout` with no gesture: `writeText` rejects `NotAllowedError`; the fallback's `execCommand` returns `false` (or throws), the outer `catch` returns `false`. The caller shows a manual-copy hint.

### Complexity

Time: `O(n)` in string length for the OS copy; DOM churn is one append/remove. Space: `O(n)` for the temporary `textarea` value. Both paths are one-shot — no listeners, no retained state.

### Edge Cases

- **Empty string** → `false` by choice; copying `""` clears the clipboard on some platforms, which is rarely intended.
- **Non-strings** → coerced with `String(text ?? "")`; `null`/`undefined` become `""` and return `false`.
- **Insecure context** → `navigator.clipboard` may be `undefined` over `http:`; the fallback is the whole answer.
- **No gesture** → both paths fail; surface fallback UI with the text pre-selected.
- **`display: none` textarea** → selection fails silently; position off-screen instead.
- **iOS Safari** → needs `readonly`, `focus()`, and `setSelectionRange`; without them `select()` picks nothing.
- **SSR / no DOM** → `document` is undefined; guard or restrict this function to client code.
- **Permissions API gaps** → do not gate on `query("clipboard-write")`; Firefox throws `TypeError` for it.

### Interview Follow-ups

- **Read from the clipboard:** `navigator.clipboard.readText()` needs the `clipboard-read` permission and a stricter gesture; paste via `paste` event access to `event.clipboardData` is the legacy route.
- **Copy rich HTML:** `ClipboardItem` with `"text/html"` + `"text/plain"` fallbacks so pasting into Notepad still works.
- **Show feedback:** return the boolean into a toast ("Copied") vs an inline "Select and press ⌘C" fallback with the text selected.
- **Why `execCommand` at all?** Deprecated but the only path in insecure contexts and older browsers; production code keeps it until the fallback's share is negligible.

### Common Mistakes

- Calling `copyText` after an `await fetch(...)` and losing transient activation.
- Hiding the fallback `textarea` with `display: none`, which makes `select()` a no-op.
- Forgetting `area.remove()` on failure, stacking invisible nodes on repeated clicks.
- Letting `NotAllowedError` propagate instead of collapsing to `false` with fallback UI.
- Assuming `navigator.clipboard` exists everywhere — it is `undefined` in insecure contexts and older browsers.

### Takeaway

Try async `writeText` inside the gesture, fall back to an off-screen selectable `textarea` + `execCommand`, remove the node in a `finally`, and collapse every denial into `false` with manual-copy UI.

## Implement Drag-and-Drop List Ordering

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `makeSortable(listEl, { onOrder })` — turn a `<ul>`/`<ol>` into a reorderable list with plain JavaScript, returning a `destroy()` cleanup. The contract:

- Dragging an item over a sibling shows where it will land; dropping commits the order and calls `onOrder(idsInNewOrder)`.
- Works with keyboard (`ArrowUp`/`ArrowDown` on a focused item) as an accessible equivalent.
- `destroy()` removes every listener and attribute the setup added.

### Examples

```text
<ul id="todos">
  <li data-id="a">Buy milk</li>
  <li data-id="b">Write report</li>
  <li data-id="c">Call mom</li>
</ul>
// Drag "Call mom" over "Buy milk" and drop:
// => DOM becomes c, a, b; onOrder(["c", "a", "b"])
```

### Approach

Two engines; know both, implement one with reasons. **HTML5 DnD** (`draggable`, `dragstart`/`dragover`/`drop`) gives a native drag image but `dragover` must `preventDefault()` or `drop` never fires, and touch support is poor. **Pointer Events** give full control and touch support but you own the ghost, auto-scroll, and hit-testing. Below is HTML5 DnD (the interview default) with delegation: one listener set on the `<ul>`, `closest("li")` to find targets, midpoint test for before/after, `insertBefore` to move, plus `tabindex` + arrows for keyboard parity. Every listener and attribute is tracked so `destroy()` undoes it.

### Implementation

```javascript
function makeSortable(listEl, { onOrder } = {}) {
  const items = () => [...listEl.querySelectorAll(":scope > li")];
  const ids = () => items().map((li) => li.dataset.id ?? li.textContent);
  let draggedId = null;
  let dropAfter = false;
  const cleanups = [];

  const on = (target, type, fn) => {
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  };
  for (const li of items()) {
    li.setAttribute("draggable", "true"); // cleanup removes both below
    li.setAttribute("tabindex", "0");
  }
  const clearIndicator = () => {
    for (const li of items()) li.classList.remove("drop-indicator");
  };
  on(listEl, "dragstart", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    draggedId = li.dataset.id ?? li.textContent;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", draggedId); } catch { /* Safari */ }
    li.classList.add("dragging");
  });
  on(listEl, "dragend", () => {
    draggedId = null;
    clearIndicator();
    listEl.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
  });
  on(listEl, "dragover", (e) => {
    e.preventDefault(); // REQUIRED: without it, drop never fires
    const over = e.target.closest("li");
    clearIndicator();
    if (!over || over.dataset.id === draggedId) return;
    const rect = over.getBoundingClientRect();
    dropAfter = (e.clientY - rect.top) > rect.height / 2;
    over.classList.add("drop-indicator");
  });
  on(listEl, "drop", (e) => {
    e.preventDefault();
    const over = e.target.closest("li");
    const dragged = listEl.querySelector(`[data-id="${CSS.escape(draggedId ?? "")}"]`);
    clearIndicator();
    if (!over || !dragged || over === dragged) return;
    listEl.insertBefore(dragged, dropAfter ? over.nextSibling : over);
    onOrder?.(ids());
  });
  on(listEl, "keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const li = e.target.closest("li");
    if (!li) return;
    e.preventDefault(); // arrows now reorder instead of scrolling
    const sib = e.key === "ArrowUp" ? li.previousElementSibling : li.nextElementSibling;
    if (!sib) return;
    listEl.insertBefore(li, e.key === "ArrowUp" ? sib : sib.nextSibling);
    li.focus();
    onOrder?.(ids());
  });

  return function destroy() {
    for (const li of items()) {
      li.removeAttribute("draggable");
      li.removeAttribute("tabindex");
    }
    while (cleanups.length) cleanups.pop()();
  };
}
```

```html
<ul id="todos">
  <li data-id="a">Buy milk</li>
  <li data-id="b">Write report</li>
  <li data-id="c">Call mom</li>
</ul>
```

### Walkthrough

List is `a, b, c`. The user drags `c` above `a` and drops:

1. `dragstart` on `c`: `draggedId = "c"`, `c` gets `.dragging`.
2. `dragover` on `a`: `preventDefault()` keeps the drop alive; pointer is above `a`'s midpoint so `dropAfter` is false and `a` gets `.drop-indicator`.
3. `drop` on `a`: `insertBefore(c, a)` → DOM is `c, a, b`; `onOrder(["c", "a", "b"])` fires; `dragend` clears the classes.

### Complexity

Time: `O(1)` per drag event; `onOrder` maps `O(m)` items. Space: `O(m)` for the snapshots. No timers, nothing retained after `destroy()`.

### Edge Cases

- **Missing `preventDefault` in `dragover`** → `drop` never fires; the most common DnD bug.
- **Drop on itself / empty space** → no-op via the `over === dragged` / `!over` guards.
- **Ids with quotes** → `CSS.escape` the selector; items without `data-id` fall back to `textContent`.
- **Touch devices** → HTML5 DnD barely fires; state the Pointer Events alternative.
- **Destroyed list** → `destroy()` must run on unmount or `dragover` leaks.

### Interview Follow-ups

- **Pointer Events version:** ghost clone, `elementFromPoint` hit-testing, auto-scroll, `setPointerCapture`.
- **Cross-list dragging:** accept a group name, report `{ from, to }` orders.

### Common Mistakes

- Forgetting `preventDefault()` in `dragover` and debugging `drop` for an hour.
- Reading `dataTransfer.getData` in `dragover` — restricted mid-drag; keep the closure variable.
- Per-item listeners with no matching removals, leaking on every re-render.
- No keyboard path — fails basic accessibility review.
- Reordering via `innerHTML`, which destroys focus and item state.

### Takeaway

DnD ordering is `dragstart` → `preventDefault` in `dragover` → midpoint test → `insertBefore` in `drop`, plus an arrow-key equivalent — with every listener and attribute tracked so `destroy()` leaves nothing behind.

## Implement Keyboard Shortcuts

`Difficulty: Medium` `Probability: High`

### Problem

Implement `createShortcuts(target = window)` with `register(combo, handler)`, `unregister(combo, handler)`, and `destroy()`. The contract:

- `combo` looks like `"ctrl+s"`, `"cmd+shift+p"`, `"?"`, or `"escape"` — case-insensitive, modifiers in any order.
- Handlers fire only on exact matches, never while the user types in inputs (unless opted in), and `preventDefault` runs only for handled combos.
- One native `keydown` listener total; `destroy()` removes it.

### Examples

```text
const sc = createShortcuts();
sc.register("ctrl+s", (e) => saveDoc());   // => fires on Ctrl+S (or Cmd+S? see below)
sc.register("cmd+k", (e) => openPalette());
sc.register("?", (e) => openHelp());       // => Shift+/ matches "?"
sc.unregister("cmd+k", openPalette);
sc.destroy();                              // => native listener removed
```

### Approach

Shortcut handling is normalisation plus restraint. Normalise registration (`"Cmd+S"`) and the event (`event.key` + modifier flags) to one canonical `ctrl+meta+shift+alt+key` string, so order and case never matter — keeping `ctrl` and `meta` distinct for cross-platform save. Dispatch from a single `keydown` listener (not deprecated `keypress`) into a `Map` of combos. Skip typing contexts (`input`/`textarea`/`select`/`contentEditable`/IME) unless opted in, and `preventDefault` only inside the match branch so unowned combos keep their browser behaviour.

### Implementation

```javascript
function createShortcuts(target = globalThis.window) {
  const MODS = ["ctrl", "meta", "shift", "alt"];
  const ALIASES = {
    esc: "escape", cmd: "meta", command: "meta",
    control: "ctrl", option: "alt", del: "delete", space: " ",
  };

  const normaliseCombo = (combo) => {
    const mods = new Set();
    let key = null;
    for (let part of String(combo).toLowerCase().split("+")) {
      part = (ALIASES[part.trim()] ?? part.trim());
      if (MODS.includes(part)) mods.add(part);
      else if (key === null) key = part;
      else throw new Error(`Invalid combo "${combo}"`);
    }
    if (!key) throw new Error(`Invalid combo "${combo}"`);
    return [...MODS.filter((m) => mods.has(m)), key].join("+");
  };

  const eventToCombo = (e) => {
    const mods = [
      e.ctrlKey && "ctrl", e.metaKey && "meta",
      e.shiftKey && "shift", e.altKey && "alt",
    ].filter(Boolean);
    return [...mods, e.key.toLowerCase()].join("+");
  };

  const isTyping = (e) => {
    if (e.isComposing) return true;
    const t = e.target;
    if (!(t instanceof Element)) return false;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  };

  const registry = new Map(); // combo -> Set of entries
  const onKeydown = (e) => {
    if (e.defaultPrevented) return;
    const entries = registry.get(eventToCombo(e));
    if (!entries?.size || e.repeat) return;
    if ([...entries].every((en) => !en.allowInInputs) && isTyping(e)) return;
    for (const { handler, preventDefault } of [...entries]) {
      if (preventDefault) e.preventDefault(); // only combos we own
      try { handler(e); } catch { /* one bad handler must not break dispatch */ }
    }
  };

  target.addEventListener("keydown", onKeydown);

  return {
    register(combo, handler, { allowInInputs = false, preventDefault = true } = {}) {
      if (typeof handler !== "function") throw new TypeError("handler must be a function");
      const key = normaliseCombo(combo);
      if (!registry.has(key)) registry.set(key, new Set());
      const entry = { handler, allowInInputs, preventDefault };
      registry.get(key).add(entry);
      return () => this.unregister(combo, handler);
    },
    unregister(combo, handler) {
      const key = normaliseCombo(combo);
      const entries = registry.get(key);
      if (!entries) return;
      for (const entry of [...entries]) {
        if (entry.handler === handler) entries.delete(entry);
      }
      if (entries.size === 0) registry.delete(key);
    },
    destroy() {
      target.removeEventListener("keydown", onKeydown);
      registry.clear();
    },
  };
}
```

### Walkthrough

`register("Cmd+Shift+P", palette)` then Cmd+Shift+P is pressed:

1. Registration canonicalises to `"meta+shift+p"` (`cmd → meta`, mods sorted).
2. The event has `key === "P"` with `metaKey`/`shiftKey` true → lowercased to `"meta+shift+p"`. Match.
3. Target is `body` (not typing), not a repeat → `preventDefault()` runs, then `palette(e)`. In a search `<input>` with `allowInInputs: false`, step 3 returns early.

### Complexity

Time: `O(1)` per keydown — one normalise + one `Map` lookup + `O(h)` handlers for that combo. Space: `O(c)` registered combos. One listener regardless of shortcut count.

### Edge Cases

- **`ctrl` vs `meta`** → distinct. `"ctrl+s"` does not fire on Cmd+S; register both for cross-platform save.
- **`"?"` vs `"shift+/"`** → `event.key` is `"?"` on US layouts; other layouts differ by physical key — note it.
- **IME composition** → `isComposing` guard prevents stealing keystrokes mid-composition.
- **Held keys** → `e.repeat` returns early; opt out per-registration for continuous actions.

### Interview Follow-ups

- **Sequence shortcuts (`g` then `i`):** buffer recent keys with timestamps, match prefixes, expire after ~1s of inactivity.
- **Scoped shortcuts:** bind per-panel targets or check `closest("[data-scope]")` so the editor's keys do not fire in the modal.
- **Discoverability:** derive the help overlay (`?`) from the registry instead of maintaining a separate list.
- **Why `event.key` over `keyCode`?** `keyCode` is deprecated and layout-dependent; `key`/`code` distinguish character (`?`) from physical position (`Slash`).

### Common Mistakes

- `preventDefault()` on every `keydown`, breaking Tab navigation and browser find.
- Listening to `keypress` (deprecated, no modifiers) or `keyup` (action lags the press).
- Firing shortcuts while typing — the `?`-opens-help-while-typing-a-question bug.
- Matching `keyCode` numbers, which differ across layouts and are deprecated.
- Adding one native listener per shortcut and removing none of them on unmount.

### Takeaway

Normalise registration and events to one canonical `mods+key` string, dispatch from a single `keydown` listener, skip typing contexts, and `preventDefault` only the combos you actually handle — with `destroy()` removing that one listener.

## Detect Online and Offline Status

`Difficulty: Easy` `Probability: Medium`

### Problem

Implement `watchOnlineStatus(onChange)` — report connectivity as `{ online, since, type }`, call `onChange` on every transition, and return `{ get, unsubscribe }`. The contract:

- Initial state comes from `navigator.onLine`; transitions come from `window` `online`/`offline` events.
- `online` is a best-effort hint, not proof of internet — document the heartbeat follow-up.
- `unsubscribe()` removes both listeners.

### Examples

```text
const { get, unsubscribe } = watchOnlineStatus((s) => banner(s.online));
get()            // => { online: true, since: 1726754400000, type: "initial" }
                 // unplug cable:
                 // => onChange({ online: false, since: ..., type: "offline" })
                 // replug:
                 // => onChange({ online: true, since: ..., type: "online" })
unsubscribe();   // => no further callbacks
```

### Approach

The platform gives a cheap signal and leaves verification to you:

1. **Seed from `navigator.onLine`, track transitions with events.** `navigator.onLine` is `false` only when the browser is *sure* it is offline (airplane mode, no NIC). `true` means "a network interface is up," not "the internet works." Listen for `online`/`offline` on `window` and stamp each state with `Date.now()` in `since`.
2. **Debounce the flap.** Cables, tunnels, and captive portals oscillate. Emit immediately but include `since` so the UI can show "Back online · syncing…" until a heartbeat confirms.
3. **Verify with a heartbeat (the follow-up you must mention).** On `online`, fetch a tiny same-origin endpoint (`/health`, `cache: "no-store"`) with a timeout; only then mark "confirmed." A captive portal returns `200` for everything, so check the body, not just the status.
4. **Clean up both listeners.** Two `addEventListener` calls need two matching `removeEventListener` calls with the same references — `unsubscribe` does both and is safe to call twice.
5. **SSR honesty.** `navigator`/`window` may not exist; default to `{ online: true }` (assume online, render, then correct on mount) rather than throwing during render.

### Implementation

```javascript
function watchOnlineStatus(onChange) {
  if (typeof onChange !== "function") throw new TypeError("onChange must be a function");

  const supported = typeof window !== "undefined" && typeof navigator !== "undefined";
  let state = {
    online: supported ? navigator.onLine !== false : true, // SSR: assume online
    since: Date.now(),
    type: "initial",
  };

  const emit = (online, type) => {
    state = { online, since: Date.now(), type };
    try {
      onChange({ ...state }); // copy: callers must not mutate our state
    } catch {
      // Subscriber errors must not break the other listener path.
    }
  };

  const handleOnline = () => emit(true, "online");
  const handleOffline = () => emit(false, "offline");

  if (supported) {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  }

  let unsubscribed = false;
  return {
    get() {
      return { ...state };
    },
    unsubscribe() {
      if (unsubscribed || !supported) return;
      unsubscribed = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    },
  };
}

// Follow-up: confirm the network actually reaches YOUR server.
async function confirmOnline(url = "/health", { timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
    if (!res.ok) return false;
    const body = await res.text(); // captive portals return 200 with a login page
    return body.trim() === "ok";
  } catch {
    return false; // abort, DNS failure, CORS block: all mean "not usable"
  } finally {
    clearTimeout(timer); // cleanup: no dangling timer after resolve
  }
}
```

### Walkthrough

Page loads with Wi-Fi up: `navigator.onLine` is `true`, so `state = { online: true, since: t0, type: "initial" }`. The banner reads `get()` and shows nothing.

1. User unplugs the cable. The browser fires `offline` on `window`. `handleOffline` runs `emit(false, "offline")`: `state` becomes `{ online: false, since: t1 }`, `onChange` shows "You're offline."
2. User replugs. `online` fires; `emit(true, "online")` shows "Back online · syncing…" and the app calls `confirmOnline("/health")`.
3. `confirmOnline` races `fetch` against a 5s `AbortController`. The server returns `"ok"` → `true`, banner hides. A hotel portal returning its login page yields a body mismatch → `false`, banner stays.
4. On unmount, `unsubscribe()` removes both listeners; calling it again is a no-op via the flag.

### Complexity

Time: `O(1)` per event; `confirmOnline` costs one RTT plus a timeout. Space: `O(1)` — a single state object copied per emit. Idle cost is zero until the heartbeat runs.

### Edge Cases

- **`onLine === true` with no internet** → VPN up but upstream dead, captive portal, DNS hijack. Never gate a destructive action on it; heartbeat first.
- **Flapping** → rapid online/offline oscillation; `since` lets the UI debounce ("stable for 3s before syncing").
- **Service workers** → they can serve cached responses while "offline"; coordinate the banner with the worker's sync queue.
- **SSR** → no `window`/`navigator`; assume online and correct on hydration.
- **Mutating emitted state** → prevented by spreading on emit and in `get()`.
- **Listener leak in SPAs** → every mount must pair with `unsubscribe()` on unmount.
- **Heartbeat caching** → `cache: "no-store"` plus a unique body check; without it a cached `200` "confirms" a dead network.

### Interview Follow-ups

- **Heartbeat loop:** on `online`, poll `/health` with backoff until `"ok"`, then flush the offline mutation queue in order.
- **Offline queue:** stash writes in `IndexedDB` while offline, replay FIFO on confirmed-online, resolve conflicts by `updatedAt` or server-wins.
- **Network Information API:** `navigator.connection.effectiveType` / `saveData` to downgrade images/video on 2G — Chromium-only, so progressive enhancement.
- **Why not ping a third party?** CORS blocks the read, ad-blockers block the host, and it leaks user presence; always verify against your own origin.

### Common Mistakes

- Treating `navigator.onLine === true` as proof of internet and skipping the heartbeat.
- Listening to only `offline` (or only `online`), so the banner latches forever.
- Removing listeners with fresh arrows so `removeEventListener` detaches nothing.
- Forgetting `clearTimeout` in the heartbeat, leaking a timer per check.
- Checking `res.ok` only — captive portals return `200` for every URL, so the body check is the real test.

### Takeaway

`navigator.onLine` seeds, `online`/`offline` events transition, and neither proves reachability — pair the hint with a same-origin heartbeat and always remove both listeners on cleanup.

