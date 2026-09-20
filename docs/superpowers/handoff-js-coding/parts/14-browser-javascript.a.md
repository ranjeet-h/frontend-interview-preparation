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

