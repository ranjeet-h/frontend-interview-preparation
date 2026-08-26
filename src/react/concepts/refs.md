# Refs in React: Stable Mutable Cells and Imperative Access

## 1. Why This Exists — The Problem First

React is easiest to reason about when the rendered UI is a function of props and state. Change state, render a new snapshot, and let React reconcile the DOM. That model covers most UI behavior, but two recurring problems do not fit neatly inside it.

First, a component sometimes needs private information that must survive renders but must not appear on screen. A timer ID, WebSocket instance, `AbortController`, animation frame ID, or previous value is not itself UI. Putting it in state creates an unnecessary render; putting it in a local variable loses it on the next render.

Second, browsers expose imperative objects. “Focus this input,” “scroll this element,” “measure this box,” and “give this canvas to a chart library” are commands against a concrete DOM node. JSX can describe that an input exists, but the focus command must happen after the node exists.

A ref is React’s narrow escape hatch for both cases: a stable mutable cell owned by one component instance, and a way to receive a committed DOM node or an intentionally small imperative API. It is not a replacement for state. The first question is always: “Does a change need React to render it?” If yes, use state or props. If it is private coordination or a one-off command, a ref may be the right tool.

## 2. The Analogy — Make It Obvious

Imagine each mounted component instance has a small labelled drawer. React keeps the drawer in the same component instance across render passes. The drawer contains one mutable slot, `.current`.

The drawer can hold a private note, such as a timer ID. Writing a new note does not redraw the stage because the audience cannot see the drawer. That is the “stable mutable cell” role.

The drawer can also receive a backstage pass to a particular DOM node. React puts that pass in the drawer during commit, after it has created or updated the node. An event handler can then use `inputRef.current?.focus()`. When the node is removed, React returns the pass by setting the object ref to `null`.

State is different: it is part of the script React uses to produce the visible scene, so changing it schedules another performance. A ref is backstage memory. If the audience must see the new value, it does not belong only in the drawer.

## 3. How It Actually Works — The Full Explanation

`useRef(initialValue)` returns an object with a mutable `current` property. React preserves that object for the lifetime of a mounted component instance:

```tsx
import { useRef, useState } from 'react';

export function RefCellExample() {
  const clickCountRef = useRef(0);
  const [clickCount, setClickCount] = useState(0);

  function handleClick() {
    clickCountRef.current += 1;
    setClickCount(clickCountRef.current);
  }

  return (
    <button type="button" onClick={handleClick}>
      Clicks: {clickCount}
    </button>
  );
}
```

The assignment is ordinary JavaScript mutation. It does not schedule work, so it does not cause a re-render. A later render of the same instance sees the same ref object and its latest `.current` value. The initial argument is used for initialization; passing a different initial value on a later render does not reset the cell.

This gives refs three useful properties. They have stable identity across renders, their contents are mutable, and their mutation is invisible to React’s update scheduling. Those properties make them useful for resource handles and DOM pointers, but they also mean React cannot react to a change in `.current` by itself.

**Render snapshots versus refs.** Each render sees a snapshot of its props, state, and context. Event handlers created by that render close over that snapshot. A ref is different: a handler can read the current contents of the same mutable cell later. This is useful for coordinating with an external system, but it is not a license to make rendering depend on an uncontrolled mutable value.

Normally read or write refs in event handlers, callback refs, `useEffect`, or `useLayoutEffect`. Avoid ref mutation during render. Concurrent React may start a render, pause it, retry it, or discard it before commit. A mutation performed during a discarded render can leak a value that never belonged to the committed UI. Reading a ref during render can likewise make output depend on mutable data outside that render’s snapshot. The narrow exception is predictable initialization that does not depend on render side effects; it should be used sparingly.

**DOM refs.** Attach an object ref with `ref={inputRef}`. React assigns the committed `HTMLInputElement` to `.current` during the commit phase and clears it when the node is detached. The node is available to layout effects, passive effects, and later event handlers—not during the initial render.

**Imperative handles.** A child can expose a small typed command surface instead of its raw DOM node. In React 18 and earlier, `forwardRef` passes the parent’s ref into a function component. `useImperativeHandle` decides what value the parent receives. React 19 also allows a function component to receive `ref` as a prop, but libraries must still type and support the React versions they claim to support.

**Identity, state ownership, and keys.** A ref belongs to a component instance, just as local state does. If React preserves the instance at the same tree position, its ref object survives. Changing a component type or `key` creates a new identity and resets its hooks, including refs. A key is therefore a state-and-ref boundary, not merely a list warning fix. Use it when a fresh instance is intended; do not add keys to reset state accidentally.

**Effects, cleanup, and timing.** Ref attachment happens during commit. `useLayoutEffect` runs after refs and DOM mutations are available but before the browser paints, so it is appropriate for synchronous measurement or preventing a visible positioning jump. `useEffect` is the default for subscriptions, timers, requests, and other synchronization that does not need to block paint. Cleanup runs before an effect’s replacement setup and when the component unmounts. A resource stored in a ref still needs an explicit cleanup; the ref does not clean the resource for you.

**Strict Mode and discarded renders.** In development, Strict Mode intentionally exercises effect setup and cleanup more than once on initial mounting. A timer or subscription must tolerate setup, cleanup, and setup again. This catches missing cleanup; it is not a reason to put setup in render. In concurrent rendering, only committed work should control external systems. Ref mutations in event handlers and committed effects are safe places to coordinate; render-time mutations are not.

**SSR.** The server has no browser DOM, so a DOM ref is `null` while rendering on the server. Effects do not run during server rendering. Code that accesses `window`, `document`, or `ref.current` must wait for the client, an event, a callback ref, or an effect. `useLayoutEffect` is also a browser-timing tool and can warn in server-rendered environments; prefer `useEffect` when layout measurement is not required, or isolate the layout-dependent component to the client.

## 4. Real Code — See It Working

The following examples are complete labeled TSX examples. They use state for visible values and refs for private handles or imperative commands.

**Example 1: focus a committed DOM node and keep a timer handle out of state.**

```tsx
import { useEffect, useRef, useState } from 'react';

export function SearchPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  function focusSearch() {
    inputRef.current?.focus();
  }

  function handleSubmit() {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    setMessage(`Searching for “${query.trim() || 'everything'}”…`);
    timeoutRef.current = setTimeout(() => {
      setMessage(`Finished searching for “${query.trim() || 'everything'}”.`);
      timeoutRef.current = null;
    }, 300);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <section aria-label="Search panel">
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search products"
      />
      <button type="button" onClick={focusSearch}>Focus search</button>
      <button type="button" onClick={handleSubmit}>Search</button>
      <p aria-live="polite">{message}</p>
    </section>
  );
}
```

The input is controlled because its value is visible UI. The timeout ID is not UI, so it lives in a ref. The cleanup cancels the last timeout when the component leaves the tree.

**Example 2: expose a narrow imperative handle.**

```tsx
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

export type SearchBoxHandle = {
  focus: () => void;
  clear: () => void;
};

type SearchBoxProps = {
  onSearch: (query: string) => void;
};

export const SearchBox = forwardRef<SearchBoxHandle, SearchBoxProps>(
  function SearchBox({ onSearch }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');

    useImperativeHandle(ref, () => ({
      focus() {
        inputRef.current?.focus();
      },
      clear() {
        setQuery('');
        inputRef.current?.focus();
      },
    }), []);

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(query.trim());
        }}
      >
        <label htmlFor="product-query">Products</label>
        <input
          id="product-query"
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Search</button>
      </form>
    );
  },
);

export function SearchScreen() {
  const searchBoxRef = useRef<SearchBoxHandle>(null);
  const [lastSearch, setLastSearch] = useState('');

  return (
    <section>
      <SearchBox
        ref={searchBoxRef}
        onSearch={(query) => {
          if (query) setLastSearch(query);
          else searchBoxRef.current?.focus();
        }}
      />
      <button type="button" onClick={() => searchBoxRef.current?.clear()}>
        Clear
      </button>
      <p>{lastSearch ? `Last search: ${lastSearch}` : 'No search yet.'}</p>
    </section>
  );
}
```

The parent receives only `focus` and `clear`, not the private input. The empty dependency list keeps the handle object stable; its methods use the DOM ref and state setter without capturing changing state. For a method that needs current state, either include the value in the dependency list or keep the latest value in a separate ref deliberately.

**Example 3: callback refs for conditional measurement and dynamic nodes.**

```tsx
import { useCallback, useRef, useState, type RefObject } from 'react';

type Message = { id: string; text: string };

export function MessageList({ messages }: { messages: Message[] }) {
  const nodesRef = useRef(new Map<string, HTMLLIElement>());
  const [height, setHeight] = useState(0);

  const measureHeader = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) setHeight(Math.round(node.getBoundingClientRect().height));
  }, []);

  function scrollToMessage(id: string) {
    nodesRef.current.get(id)?.scrollIntoView({ block: 'nearest' });
  }

  return (
    <section>
      <div ref={measureHeader}>Header height: {height}px</div>
      <button type="button" onClick={() => scrollToMessage(messages[0]?.id ?? '')}>
        Scroll to first
      </button>
      <ul>
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            nodesRef={nodesRef}
          />
        ))}
      </ul>
    </section>
  );
}

function MessageRow({
  message,
  nodesRef,
}: {
  message: Message;
  nodesRef: RefObject<Map<string, HTMLLIElement>>;
}) {
  const setNode = useCallback((node: HTMLLIElement | null) => {
    if (node === null) nodesRef.current?.delete(message.id);
    else nodesRef.current?.set(message.id, node);
  }, [message.id, nodesRef]);

  return <li ref={setNode}>{message.text}</li>;
}
```

An object ref is passive: React writes `.current`, but no notification is emitted. A callback ref receives the node at attachment time and `null` at detachment time, so it can measure a conditionally mounted node or maintain a `Map` without calling hooks inside a loop. The row component keeps each callback identity stable for that row, avoiding unnecessary detach-and-attach cycles. In React 19, a callback ref may also return a cleanup function; the `null` form remains the broadly compatible pattern shown here.

## 5. The Interview Questions — All of Them, Done Properly

**What is a ref?** It is a React-owned, instance-scoped object whose mutable `current` property survives renders without scheduling renders. It can hold private coordination data, a DOM node, or a child’s exposed imperative handle.

**Why does changing `.current` not re-render?** Assignment mutates an object property; it is not a state update. React does not subscribe to that property, so no reconciliation is scheduled. If the screen must change, pair the ref with state or use state instead.

**When is `useRef` better than a local variable?** A local variable is recreated on each render. `useRef` preserves the same cell across renders and across callbacks created by those renders. Use a local variable for calculation within one render; use a ref for private data that must survive.

**When is `useRef` better than `useState`?** Use a ref for data whose changes should not themselves update UI: timer handles, DOM nodes, latest external values, or cancellation handles. Use state for data that participates in rendered output, accessibility text, or a state transition the user must observe.

**When is a DOM ref available?** It is populated during commit, after React has created or updated the DOM node. It is available in a callback ref, layout effect, passive effect, or later event handler. It is `null` before mount and after detachment.

**What are object and callback refs?** An object ref is a stable `{ current }` cell that React updates passively. A callback ref is a function React calls with a node and then `null` when the ref is detached. Callback refs are useful for immediate mount notification, measurement, and dynamic collections.

**What are `forwardRef` and `useImperativeHandle`?** In React 18 and earlier, `forwardRef` lets a function component receive a parent’s ref. `useImperativeHandle` customizes the value exposed through that ref. `forwardRef` opens the boundary; `useImperativeHandle` defines the public API. React 19 supports receiving `ref` as a regular prop, but the API-design distinction remains.

**Why not expose the raw DOM node?** It couples the parent to the child’s current markup and exposes far more mutation than the parent needs. A handle such as `{ focus, clear }` preserves the child’s implementation boundary and is easier to type and change.

**What does the dependency list of `useImperativeHandle` mean?** React compares dependencies with `Object.is` and recreates the handle when one changes. `[]` gives stable identity but can make methods capture old values. Include values that should cause recreation, or use a separate latest-value ref when a stable handle must read fresh data.

**How do keys affect refs?** A preserved key and position preserve the component instance and its ref cell. A changed key creates a new instance, so the old ref is detached and the new one starts from its initial value. Keys define identity and state ownership.

**How do refs interact with SSR and concurrency?** Server rendering does not create browser DOM nodes and does not run effects, so DOM refs are `null` there. Concurrent rendering can discard uncommitted work, which is why render must not mutate refs to coordinate external systems. Commit-time ref attachment and committed effects are the safe synchronization points.

## 6. The Traps — What Goes Wrong

**Trap 1: using a ref as visible state.** `countRef.current += 1` changes memory but leaves `Count: 0` on screen. Keep the count in state when the user must see it.

**Trap 2: touching the DOM during render.** `inputRef.current!.focus()` can run while `.current` is `null`, and it makes rendering impure. Move the command to an event handler or a correctly timed effect.

**Trap 3: mutating a ref during render to track history.** A render can be retried or discarded. A render counter or “previous value” mutation in the function body can record work that never committed. Use an effect for committed history, or derive the value without mutation.

**Trap 4: forgetting cleanup.** A ref preserves a timer ID; it does not cancel the timer. Every subscription, timer, observer, animation frame, or third-party instance needs cleanup, including cleanup that is safe under Strict Mode’s development cycle.

**Trap 5: expecting an effect to notice `.current`.** Ref mutation is not a reactive dependency. An effect with `[nodeRef.current]` is not a reliable way to observe attachment. Use a callback ref, state notification, or an effect driven by the prop/state that controls the node’s presence.

**Trap 6: creating refs inside a loop or conditional.** `useRef` is a Hook and must be called in the same order on every render. Use one ref containing a `Map`, or move the item into a child component with its own ref.

**Trap 7: unstable callback refs.** An inline callback creates a new function on every render, so React may detach the old callback with `null` and attach the new one again. Use `useCallback` when repeated setup or measurement would be costly, and always handle detachment.

**Trap 8: using an imperative handle for ordinary state flow.** `ref.current?.open()` is a command, not a reactive source of truth. If the parent owns whether a dialog is open, use `open` and `onOpenChange`; reserve the handle for actions such as focus or select.

## 7. Compare With Related Concepts

| Choice | Survives renders | Changing it re-renders | Best fit | Main warning |
| --- | --- | --- | --- | --- |
| `useRef` | Yes, for one instance | No | DOM nodes, timer IDs, private mutable coordination | UI will not update from mutation |
| `useState` | Yes, for one instance | Yes | Rendered values and user-visible state | Do not store disposable handles unnecessarily |
| Local variable | No | No | One-render calculations | Reset on every render |
| `useMemo` | Usually, while dependencies are unchanged | No by itself | Cached calculation | Not a general-purpose mutable cell |
| Module variable | Yes, globally | No | Deliberately shared module data | Instances can overwrite one another |

`useRef` versus `useState`: ask whether the value is part of the UI snapshot. A loading label belongs in state; the `AbortController` used to cancel its request belongs in a ref or in the effect’s local cleanup closure.

Object ref versus callback ref: choose an object ref when later code simply needs the node. Choose a callback ref when attachment itself is the event, especially for conditional measurement or a `Map` of list nodes.

`useRef` versus `useImperativeHandle`: `useRef` owns a private cell inside a component. `useImperativeHandle` designs the value crossing a component boundary. The child commonly uses both: one private DOM ref and one public handle.

Imperative handle versus props: props describe state or desired configuration, such as `open={isOpen}`. A handle issues a command, such as `focus()`. Prefer props for durable state and handles for narrow commands that are awkward to express as rendered data.

## 8. 🧠 The Memory Hook — What Sticks

Remember: **a ref is a private drawer with one stable slot**.

It survives the component instance, changes silently, and can hold either a backstage DOM pass or private coordination data. React fills a DOM ref during commit and clears it on detach. State drives the visible scene; refs coordinate the machinery behind it. Keep render pure, clean up every resource, and expose only small imperative handles across boundaries.
