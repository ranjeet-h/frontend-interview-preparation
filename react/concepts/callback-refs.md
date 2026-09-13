# Callback Refs in React

## 1. Why This Exists — The Problem First

React normally lets you describe *what* should be rendered. A ref is the deliberate escape hatch for asking, “Which host node did React create, and when can I use it?” That question is easy for a permanently rendered input and more subtle for conditional, reordered, or dynamically sized UI.

Suppose an information panel starts closed:

```tsx
useEffect(() => {
  const panel = panelRef.current;
  if (panel) {
    setHeight(panel.getBoundingClientRect().height);
  }
}, []);
```

On the first render there is no panel, so the object ref is `null`. Later, opening the panel changes the JSX and React writes the DOM node into `panelRef.current`. That mutation is not state: it does not schedule a render, and React does not treat `[panelRef.current]` as a reliable notification mechanism. The effect above therefore does not automatically become a “run when this node appears” subscription.

A callback ref solves the notification problem. Instead of giving React a mutable container, give it a function:

```tsx
const setPanelNode = (node: HTMLDivElement | null) => {
  if (node) {
    // The node has just been attached for this ref.
  } else {
    // The node has just been detached for this ref.
  }
};
```

React calls the function during the commit that attaches or detaches the host node. That makes callback refs useful for work whose trigger is specifically “this element became available” or “this element is no longer owned by this ref”: measuring it, focusing it, observing it, or registering it in a keyed collection.

They do not make every DOM task better. If a button only needs to focus an already-rendered input after a click, an object ref is usually simpler. The important distinction is notification versus storage:

- An object ref stores the latest node in `.current`; reading it is your responsibility.
- A callback ref notifies your code at attachment and detachment boundaries.

## 2. The Analogy — Make It Obvious

An object ref is a labeled storage box. React puts the current DOM node in the box and later replaces it with `null`. The box itself does not call you when its contents change; you open it when your code already has a reason to look.

A callback ref is a handoff at a loading dock. When a node arrives, React hands that particular node to your function. When that ref no longer owns the node, React hands back `null` in the traditional API, or runs the cleanup returned by the callback in React 19’s callback-ref cleanup API. A keyed list can use several handoff points to maintain one registry of nodes.

This analogy also explains the boundary. The callback is not a render-time expression that describes a value. It is a commit-time notification about a host instance. Do not read it during render and expect it to be current; React may render work that it never commits.

## 3. How It Actually Works — The Full Explanation

The basic type is a function accepting a node or `null`:

```tsx
const setInputNode: React.RefCallback<HTMLInputElement> = (node) => {
  if (node === null) {
    console.log('input detached');
    return;
  }

  console.log('input attached', node);
};

return <input ref={setInputNode} />;
```

The lifecycle is easiest to remember as a commit sequence:

```text
Render: React evaluates JSX and prepares a candidate tree.
  |
  v
Commit: React mutates the host tree and attaches refs.
  |
  +--> callback ref receives the node
  |
  +--> layout effects can measure the committed layout
  |
  v
Browser may paint; passive effects run later.
```

On mount, the callback receives the host node. On unmount, the traditional callback-ref contract calls it with `null`. On a ref-prop identity change, React detaches the old callback and attaches the new one, even when the underlying DOM element itself stays in place. A host-node replacement also produces a detach/attach pair. Treat every callback invocation as a real ownership transition, not as a promise that the user can see a visual change.

The callback runs after the relevant DOM mutation has been committed, but “in the document” is not universal: portals, detached roots, hidden trees, and test renderers have different host environments. The node is the committed host instance for this ref; measure it only when its environment makes that measurement meaningful. If a measurement changes layout or state, consider whether a layout-sensitive design is better served by a layout effect or a browser observer.

**Stable identity and `useCallback`.** This is an identity-sensitive prop. An inline function creates a fresh function object on every render:

```tsx
<div ref={(node) => console.log(node)} />
```

When the parent re-renders, React sees a different `ref` function. It may call the old function with `null`, then the new function with the node. That is correct: the old callback has lost ownership and the new one has gained it. It is not necessarily a DOM remount.

Use `useCallback` when avoiding this detach/attach churn matters or when the callback installs resources:

```tsx
const setCardNode = useCallback((node: HTMLDivElement | null) => {
  if (node === null) {
    return;
  }

  console.log(node.getBoundingClientRect().width);
}, []);
```

The tradeoff is dependency management, not magic performance. `useCallback` keeps the function stable only while its dependencies are stable. If the callback closes over `roomId`, `onResize`, or another changing value, include that value; changing dependencies intentionally causes ref cleanup and re-setup. An empty dependency list is safe only when the callback truly does not need changing render values. A stable callback can also retain values from the render in which it was created, so do not use `[]` to hide a stale-closure bug.

Stability is especially important when the callback calls state setters. This pattern can loop:

```tsx
// Avoid: a new callback can set state, rerender, detach, and set state again.
<div ref={(node) => node && setWidth(node.offsetWidth)} />
```

Even with a stable callback, guard state updates when measurement can produce the same value repeatedly:

```tsx
const setMeasuredNode = useCallback((node: HTMLDivElement | null) => {
  if (node === null) {
    return;
  }

  const nextWidth = Math.round(node.getBoundingClientRect().width);
  setWidth((previousWidth) =>
    previousWidth === nextWidth ? previousWidth : nextWidth,
  );
}, []);
```

**Traditional cleanup and React 19 cleanup.** For React versions whose callback ref type returns `void`, do setup and teardown in the node/null branches. Keep the resource handle somewhere stable if teardown needs it:

```tsx
const observerRef = useRef<ResizeObserver | null>(null);

const setObservedNode = useCallback((node: HTMLDivElement | null) => {
  if (node === null) {
    observerRef.current?.disconnect();
    observerRef.current = null;
    return;
  }

  const observer = new ResizeObserver(([entry]) => {
    console.log(entry.contentRect.width);
  });
  observer.observe(node);
  observerRef.current = observer;
}, []);
```

React 19 also supports a callback ref returning a cleanup function. In that form, setup belongs in the callback and cleanup is returned next to it:

```tsx
const setObservedNode = useCallback((node: HTMLDivElement | null) => {
  if (node === null) {
    return;
  }

  const observer = new ResizeObserver(([entry]) => {
    console.log(entry.contentRect.width);
  });
  observer.observe(node);

  return () => observer.disconnect();
}, []);
```

For this React 19 form, React runs the returned cleanup when the ref is detached or the callback identity changes; it does not additionally need to call the callback with `null` for that cleanup path. Do not mix assumptions from the two APIs: if a codebase supports React 18, use the `null` branch and a compatible `React.RefCallback` type. A returned cleanup is not a license to skip cleanup for timers, observers, event listeners, or third-party instances.

**Dynamic lists, identity, and ownership.** Hooks cannot be called inside `.map()`, but one stable `Map` can own many nodes. The item’s stable key is the ownership identity:

```tsx
const itemNodes = useRef(new Map<string, HTMLLIElement>());

return (
  <ul>
    {items.map((item) => (
      <li
        key={item.id}
        ref={(node) => {
          if (node) {
            itemNodes.current.set(item.id, node);
          } else {
            itemNodes.current.delete(item.id);
          }
        }}
      >
        {item.label}
      </li>
    ))}
  </ul>
);
```

The `null` branch matters: otherwise the map retains detached nodes. The `key` matters just as much. With `key={item.id}`, React can preserve the relationship between a logical item and its node as the list is filtered or reordered. With an unstable index key, a node may be reused for a different item, so a map keyed by item ID and a ref callback that closes over the item ID can disagree about ownership. Never use a callback ref to compensate for incorrect keys.

For many rows, avoid creating a new callback per row if identity churn is measurable. A factory can still be cached by ID, but it must delete its callback entry when the item disappears; otherwise the registry of functions becomes another leak. Usually, the straightforward callback-plus-Map pattern is the best tradeoff until profiling says otherwise.

**Callback refs versus object refs and effects.** An object ref is passive storage:

```tsx
const inputRef = useRef<HTMLInputElement | null>(null);

function focusInput() {
  inputRef.current?.focus();
}

return <input ref={inputRef} />;
```

This is ideal when an event handler, imperative API, or later computation initiates the work. A callback ref is a better fit when attachment itself is the event, especially for conditional mounting, node registration, immediate focus, or resource setup tightly owned by one node.

Effects are for synchronizing with external systems after commit. They can be right for a subscription that depends on several values or on a component-level resource, but an effect that merely waits for `objectRef.current` to stop being `null` is usually the wrong notification channel. A callback ref also does not replace an effect when the work must react to later changes in props or state; give the external system an explicit update path or use the appropriate effect abstraction.

`useImperativeHandle` is different again: it customizes the ref handle exposed by a component. It is about a component’s public imperative API, while a callback ref is about observing or storing the host instance supplied at a ref boundary.

**Strict Mode, concurrency, SSR, and TypeScript.** Development Strict Mode may perform extra mount-like setup and cleanup checks. Callback-ref code must therefore be idempotent: attach one observer, disconnect exactly that observer, and tolerate a node being handed back more than once across development checks. Do not infer “the user saw a new element” from a callback count.

Concurrent rendering can start, pause, abandon, or replay render work. Callback refs run for committed work, not for every render attempt. Never mutate a ref map, measure a node, or subscribe to an observer during render; do it in the callback after React has attached the node. Also avoid assuming callback invocation order across unrelated branches.

On the server there is no DOM node to pass. A callback ref is not a server-side measurement mechanism, and `window`, `ResizeObserver`, `getBoundingClientRect`, and `HTMLElement` must be used only in client-capable code paths. The JSX can be rendered for SSR, but the callback runs when the client renderer commits the hydrated host node. If a first render depends on a measurement, render a safe non-measured state and update after attachment rather than reading browser globals during render.

TypeScript should express nullability at the boundary:

```tsx
const setButtonNode: React.RefCallback<HTMLButtonElement> = (node) => {
  if (node === null) {
    return;
  }

  node.focus();
};
```

For a reusable callback, `React.RefCallback<HTMLDivElement>` communicates the host type. For a map, prefer `Map<string, HTMLDivElement>` so lookups remain typed. If using React 19’s returned cleanup, check the installed `@types/react` version and the project’s React version; a type declaration that accepts only `void` indicates that the project is still on the older callback-ref contract.

## 4. Real Code — See It Working

The examples below are complete components. They use callback refs as the trigger for node attachment and keep the DOM work local to the node’s ownership boundary.

**Example 1: conditional measurement and focus**

```tsx
import { useCallback, useState } from 'react';

export function MeasuredPanel() {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState<number | null>(null);

  const setPanelNode = useCallback((node: HTMLDivElement | null) => {
    if (node === null) {
      setHeight(null);
      return;
    }

    const nextHeight = Math.round(node.getBoundingClientRect().height);
    setHeight((previousHeight) =>
      previousHeight === nextHeight ? previousHeight : nextHeight,
    );
  }, []);

  return (
    <section>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide panel' : 'Show panel'}
      </button>

      {open && (
        <div ref={setPanelNode}>
          <h2>Details</h2>
          <p>This panel is measured when its node is attached.</p>
          <p aria-live="polite">
            {height === null ? 'Measuring…' : `Height: ${height}px`}
          </p>
        </div>
      )}
    </section>
  );
}
```

The callback runs when `open` causes the panel to mount, so it does not miss the transition from “no node” to “node.” On close, the traditional `null` branch clears the derived display state. In a production layout whose size changes after fonts, images, or content load, the initial callback is not enough; add a `ResizeObserver` or another explicit update source.

**Example 2: a keyed list registry and scrolling**

```tsx
import { useRef } from 'react';

type Message = { id: string; text: string };

const messages: Message[] = [
  { id: 'welcome', text: 'Welcome to the room.' },
  { id: 'rules', text: 'Please read the rules.' },
  { id: 'finish', text: 'That is the end of the log.' },
];

export function MessageLog() {
  const messageNodes = useRef(new Map<string, HTMLLIElement>());

  function scrollToMessage(id: string) {
    messageNodes.current.get(id)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  return (
    <div>
      <button type="button" onClick={() => scrollToMessage('rules')}>
        Jump to rules
      </button>
      <ul>
        {messages.map((message) => (
          <li
            key={message.id}
            ref={(node) => {
              if (node) {
                messageNodes.current.set(message.id, node);
              } else {
                messageNodes.current.delete(message.id);
              }
            }}
          >
            {message.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

The map is one stable object ref, not one hook call per item. Each callback adds or removes exactly one `(id, node)` pair. The `key` and map key are deliberately the same logical identity.

**Example 3: observer setup with React 19 cleanup**

```tsx
import { useCallback, useState } from 'react';

export function ObservedCard() {
  const [width, setWidth] = useState<number | null>(null);

  const setCardNode = useCallback((node: HTMLDivElement | null) => {
    if (node === null) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <article ref={setCardNode} style={{ resize: 'horizontal', overflow: 'auto' }}>
      <p>Resize this card.</p>
      <output>{width === null ? 'No measurement yet' : `${width}px wide`}</output>
    </article>
  );
}
```

This example requires React 19’s callback-ref cleanup support and matching types. For React 18, store the observer in a ref and disconnect it in the `node === null` branch instead. The observer handles later size changes; the callback itself handles attachment and ownership.

## 5. The Interview Questions — All of Them, Done Properly

**What is a callback ref?**

A function supplied to `ref` that React calls with a host node when that ref attaches and, in the traditional API, with `null` when it detaches. It is a commit-time notification, not a render-time value.

**When does it run relative to effects?**

It runs during commit after the host mutation relevant to the ref. Ref attachment is available before layout-sensitive post-commit work such as layout effects; passive effects run later. Do not overgeneralize this to “the node is always visible in the document”: portals, detached roots, hidden rendering, and test environments differ.

**Why can one render produce `null` and then the node?**

React first detaches the previous callback when its function identity changes, then attaches the new callback. An inline arrow is a new function on every render. The DOM element may not have been removed; the callback ownership changed.

**Should every callback ref use `useCallback`?**

No. Use it when stable identity prevents unnecessary detach/attach work, avoids repeated resource setup, or prevents a state-update loop. It adds dependency and stale-closure responsibility, so a simple one-off registration may not need it.

**Why is `[ref.current]` not a good dependency for measuring a conditional node?**

React does not observe property mutation inside an object ref. The dependency expression is evaluated during render, while the `.current` write happens during commit. A callback ref directly represents the attachment event; an effect is not a reliable watcher for that mutable field.

**How do callback refs avoid the Rules of Hooks in a list?**

Call `useRef` once to create a stable map, then use ordinary callback functions inside the list. The hooks are not inside the loop; the callbacks are normal JavaScript values. Delete entries on detach to avoid retaining dead nodes.

**Can a callback ref measure every future layout change?**

No. It reports attachment and detachment, not continuous layout changes. Use `ResizeObserver`, a carefully scoped layout effect, or an explicit update mechanism for changes caused by content, fonts, images, or responsive layout.

**What is the React 19 cleanup form?**

A callback may return a cleanup function. React runs that cleanup when the ref is detached or its callback identity changes. The older node/null style remains the compatible choice for versions and type definitions that do not support returned cleanup.

**How does Strict Mode affect the answer?**

Development checks can cause setup and cleanup to be exercised more than once. Correct code is idempotent and releases each resource it acquires. Callback counts are not a production business event counter.

**What changes under concurrent rendering?**

Only committed trees receive ref callbacks. Render attempts can be abandoned, so DOM reads and external subscriptions belong in the callback or another post-commit mechanism, never in render.

**What happens during SSR?**

There is no browser host node to measure on the server. The callback is useful when the client commits hydration, but browser-only APIs must be guarded by client execution and the initial render must not depend on a measurement that does not exist yet.

## 6. The Traps — What Goes Wrong

**Trap 1: unconditional state updates from an unstable callback**

```tsx
// Bad: new ref identity plus setState can repeat forever.
<div ref={(node) => node && setWidth(node.offsetWidth)} />
```

Use a stable callback and avoid setting state when the value is unchanged. Also remember that a callback ref is not the right place for an unbounded measurement feedback loop.

**Trap 2: treating `null` as impossible**

```tsx
// Bad for the traditional API: node can be null during detach.
const setInput = (node: HTMLInputElement | null) => node.focus();
```

Narrow first. In React 19’s returned-cleanup form, setup receives the node and teardown is returned, but the code still needs to follow the installed API’s type and version contract.

**Trap 3: leaking a list registry**

```tsx
// Bad: detached nodes remain strongly referenced.
ref={(node) => {
  if (node) nodes.current.set(item.id, node);
}}
```

Always delete on detach. Also clear or replace any separate timers, observers, or event listeners owned by that node.

**Trap 4: using index keys for logical items**

If filtering shifts index keys, React can reuse a DOM node for another item. A callback that closes over an ID may then update a map entry that no longer describes the DOM node’s logical owner. Stable data keys preserve the identity contract.

**Trap 5: assuming the callback means “visible and final layout”**

Attachment says the host node was committed for that ref. It does not guarantee that images have loaded, web fonts have settled, CSS transitions have completed, the node is in the viewport, or a portal is in the main document. Choose an observer or later measurement when those facts matter.

**Trap 6: hiding a stale closure with `useCallback(..., [])`**

An empty dependency list does not mean “always current.” If the callback needs changing props or state, include them or use a stable external handle designed for that purpose. A dependency change and resulting ref cleanup may be the correct behavior.

**Trap 7: doing DOM work during render**

Concurrent React may render and discard a tree. Reading or mutating DOM from render is both too early and tied to work that may never commit. The callback is the post-commit boundary.

**Trap 8: using browser-only APIs in SSR code**

`ResizeObserver`, `window`, `document`, and DOM constructors may not exist on the server. Keep them behind client-only execution and provide a deterministic server-safe render.

## 7. Compare With Related Concepts

| Concept | What it provides | Best fit | Main caution |
| --- | --- | --- | --- |
| Callback ref | A commit-time node/null handoff, or node-owned cleanup in React 19 | React to attachment, measure an appearing node, register list items, attach a per-node observer | Callback identity controls detach/attach; cleanup must be idempotent |
| Object ref (`useRef`) | Stable mutable storage in `.current` | Focus, scroll, play, or inspect a node from an event handler | Mutations do not notify React or schedule renders |
| `useLayoutEffect` | Post-commit, pre-paint synchronization for layout-sensitive work | Coordinate measurement with other committed layout | It is component-level effect logic and can block paint; do not use it as a ref mutation watcher |
| `useEffect` | Post-paint synchronization with external systems | Subscriptions or resources whose lifecycle depends on component values | An effect with `ref.current` as a dependency is not a reliable attach notification |
| `ResizeObserver` | Notifications for later element-size changes | Keep measurements current after attachment | It supplements a callback ref; it does not replace cleanup |
| `useImperativeHandle` | A custom handle exposed through a component ref | Publish methods such as `focus()` without exposing raw DOM | It defines a component API; it is not a DOM-node registry |
| Stable `key` | Logical identity for reconciliation | Preserve item/node correspondence through reorder and filtering | Index keys can make ref registries describe the wrong item |

The compact decision rule is: use an object ref when code already has the trigger; use a callback ref when node attachment is the trigger; use an observer when the external fact can change after attachment; use an effect abstraction when the resource belongs to the component rather than one host node.

## 8. 🧠 The Memory Hook — What Sticks

An object ref is a quiet storage box: React updates `.current`, and you decide when to look.

A callback ref is a handoff: React calls with the committed node when ownership begins and with `null` on traditional detach, or runs returned cleanup in React 19. Stable callback identity prevents accidental detach/attach churn; stable keys preserve the right item-to-node owner.

For the interview, say: **“Callback refs are commit-time attachment notifications. They are useful when the node’s arrival or departure is the event; object refs are simpler when I only need imperative access later.”**
