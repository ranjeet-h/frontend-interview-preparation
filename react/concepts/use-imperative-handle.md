# useImperativeHandle

## 1. Why This Exists — The Problem First

You build a design-system input that renders a label, an error message, an icon, and a native `<input>`. A checkout form needs to focus that input after validation fails. If the component forwards the raw DOM node, the form can focus it—but it can also change its classes, remove it, or depend on the fact that the implementation happens to be an `<input>`.

That is the real problem: a parent sometimes needs to request one concrete action, but should not receive the child’s entire private implementation. `useImperativeHandle` creates a narrow public handle for that boundary: the parent can call `focus()` or `clear()`, while the child remains free to change its internal markup.

## 2. The Analogy — Make It Obvious

Think of a hotel. The guest is the parent, the hotel room is the child component, and the room’s internal furniture is the child’s DOM and state. A normal prop is a request made at booking time: “make the room accessible.” The hotel decides how to satisfy it.

Sometimes a guest needs a one-off service after checking in: “please call housekeeping” or “unlock the minibar.” The front desk gives the guest a service card with only those permitted buttons. It does not hand over a master key to the room.

`forwardRef` is the hotel’s decision to accept that service card from the guest at all. `useImperativeHandle` is the child choosing the card’s contents. The parent’s `ref.current` becomes `{ focus, clear }`, not the internal `<input>` and not the child’s state. If the room later changes from an input to a more complex control, the service card can keep the same contract.

## 3. How It Actually Works — The Full Explanation

The parent creates a ref object, then attaches it to the child:

```tsx
const searchRef = useRef<SearchBoxHandle>(null);
return <SearchBox ref={searchRef} />;
```

In React 18 and earlier, a function component does not receive that `ref` as an ordinary prop. `forwardRef` is the explicit boundary that gives the child a second `ref` argument:

```tsx
const SearchBox = forwardRef<SearchBoxHandle, SearchBoxProps>((props, ref) => {
  // ref is available here because forwardRef passed it in.
});
```

Inside the child, another ref owns the private DOM node. `useImperativeHandle(ref, createHandle, dependencies)` tells React what value to assign to the parent’s ref instead of assigning the DOM node directly.

The sequence is:

1. The parent’s `searchRef.current` starts as `null`.
2. The child renders and registers the handle definition with React.
3. After React commits the child, React runs the handle factory and assigns its returned object to `searchRef.current`.
4. A parent event handler can now call `searchRef.current?.focus()`. That method reaches the private DOM ref and performs the browser action.
5. When the child is detached, React clears the exposed ref back to `null`.

The handle is an object contract, not a second state channel. Calling a method can update child state, focus a node, scroll a container, or coordinate with a browser API, but the method itself does not make the parent re-render. If the parent needs to render from the child’s status, that status belongs in props or state, not hidden behind a handle.

The dependency list controls when React recreates the exposed handle. React compares dependencies with `Object.is`. Omitting the list allows a new handle on every render; `[]` keeps the same handle object after mount. An empty list is not automatically correct: methods created there must not read changing props or state unless they use a ref or another deliberate strategy. Include values that the handle’s methods need, or define methods that read the latest value from a ref.

The factory should describe the handle, not perform the action immediately. The parent calls the method later. Keep methods small and intentional. Do not expose state objects, setters, or a raw DOM node merely because they are convenient.

In React 19, a function component can receive `ref` as a regular prop, so the wrapper is no longer required for that component style:

```tsx
import { type Ref, useImperativeHandle, useRef } from 'react';

type SearchBoxHandle = {
  focus: () => void;
  clear: () => void;
};

type SearchBoxProps = {
  placeholder?: string;
  ref?: Ref<SearchBoxHandle>;
};

export function SearchBox({
  ref,
  placeholder = 'Search products',
}: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus();
    },
    clear() {
      if (inputRef.current) inputRef.current.value = '';
      inputRef.current?.focus();
    },
  }), []);

  return <input ref={inputRef} placeholder={placeholder} />;
}
```

The underlying idea is unchanged: `ref` is the communication channel, and `useImperativeHandle` chooses the value exposed through it. Existing React 18 libraries and many transitional codebases still use `forwardRef`, so an interview answer should know both forms.

## 4. Real Code — See It Working

This complete example is suitable for a React 18 or React 19 project that supports TypeScript and JSX. It shows a reusable input exposing only two actions and a parent consuming the typed API.

```tsx
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

export type SearchBoxHandle = {
  focus: () => void;
  clear: () => void;
};

type SearchBoxProps = {
  initialValue?: string;
  onSearch: (query: string) => void;
};

export const SearchBox = forwardRef<SearchBoxHandle, SearchBoxProps>(
  function SearchBox({ initialValue = '', onSearch }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState(initialValue);

    useImperativeHandle(ref, () => ({
      // The parent gets an action, not permission to manipulate the input.
      focus() {
        inputRef.current?.focus();
      },
      clear() {
        setQuery('');
        inputRef.current?.focus();
      },
    }), []);

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      onSearch(query.trim());
    }

    return (
      <form onSubmit={handleSubmit} aria-label="Search">
        <label htmlFor="product-search">Products</label>
        <input
          id="product-search"
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Search</button>
      </form>
    );
  },
);

export function ProductSearchForm() {
  const searchRef = useRef<SearchBoxHandle>(null);
  const [lastSearch, setLastSearch] = useState('');

  function handleInvalidSearch() {
    // This is a one-off UI action, so an imperative method is appropriate.
    searchRef.current?.focus();
  }

  return (
    <section>
      <SearchBox
        ref={searchRef}
        onSearch={(query) => {
          if (query) setLastSearch(query);
          else handleInvalidSearch();
        }}
      />
      <button type="button" onClick={() => searchRef.current?.clear()}>
        Clear search
      </button>
      <p aria-live="polite">
        {lastSearch ? `Searching for: ${lastSearch}` : 'Enter a product name.'}
      </p>
    </section>
  );
}
```

Here is the important contrast. Exposing `inputRef` directly would let the parent call every DOM method and mutate every DOM property. The public `SearchBoxHandle` makes unsupported operations a TypeScript error and leaves the markup private.

If a handle reads changing state, make that choice explicit. This version keeps the public object stable while the method reads the latest value through a separate ref:

```tsx
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

type PlayerHandle = { reportPosition: () => number };

export const Player = forwardRef<PlayerHandle>(function Player(_, ref) {
  const [position, setPosition] = useState(0);
  const latestPosition = useRef(position);
  latestPosition.current = position;

  useImperativeHandle(ref, () => ({
    reportPosition: () => latestPosition.current,
  }), []);

  return (
    <button type="button" onClick={() => setPosition((value) => value + 10)}>
      Position: {position}
    </button>
  );
});
```

For a handle that should be recreated when a value changes, include that value instead. The right choice depends on whether handle identity matters and whether its methods need the latest render data.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does `useImperativeHandle` do?**

It customizes the value a parent receives through a ref attached to a child. The child returns a deliberately small object such as `{ focus, clear }`, so the parent can request supported imperative actions without receiving the child’s raw DOM node or internal state. It does not create the parent’s ref and it does not make an ordinary function component receive refs in React 18; `forwardRef` supplies that boundary there.

**Q: Why are `forwardRef` and `useImperativeHandle` often used together?**

In React 18 and earlier, `forwardRef` passes the parent’s ref into a function component. `useImperativeHandle` then transforms what travels back through that channel. `forwardRef` answers “how does the ref get in?”; `useImperativeHandle` answers “what does the parent get?” In React 19, direct `ref` props can replace the wrapper for new function components, but the handle customization remains the same.

**Q: Why not just forward the DOM node?**

A raw node is a much larger and less stable API. A parent can mutate classes, styles, attributes, or even remove the node, and it becomes coupled to the child’s current markup. A narrow handle preserves the abstraction boundary: the parent asks for `focus()` while the child decides whether that means focusing an input, a composite widget, or another element.

**Q: When is an imperative handle justified?**

Use it for an action that is naturally a command and does not represent ongoing parent-owned state: focus, text selection, scrolling, starting playback, or integrating with a browser or third-party imperative API. If the parent is really describing durable UI state—such as whether a dialog is open—prefer props like `open` and `onOpenChange`. A method like `open()` can be reasonable for a specialized compatibility boundary, but it should not become the component’s whole communication model.

**Q: What does the dependency list mean?**

React compares the listed values with `Object.is` and recreates the handle when one changes. With `[]`, the handle object is stable, but methods must not accidentally close over stale changing values. With no list, React can recreate it on every render. Include changing values when recreation is appropriate, or read the latest value through a ref when stable handle identity is part of the design.

**Q: Does calling a handle method re-render the parent?**

No. A ref is a mutable escape hatch, not reactive state. The method may call the child’s state setter, which can re-render the child, but assigning or calling through `parentRef.current` does not notify React that the parent should render. If the parent must display the result, communicate that result through state, props, or a callback.

**Q: What happens to the handle during unmount?**

React clears the ref, so the parent’s `ref.current` becomes `null`. Parent code should therefore use optional chaining and should not retain the old handle as if it were a permanent object. The same nullability applies before the child has committed.

## 6. The Traps — What Goes Wrong

**Treating the handle as state.** A parent calls `ref.current?.open()` and expects a label elsewhere in the parent to update automatically. The call does not schedule a parent render. Keep render-visible state in React state or lift it to the parent; use the handle for the command itself.

**Using an empty dependency list with changing closures.** A method created once can capture the first render’s props or state. Either list the values it needs, or keep the latest value in a ref and have the stable method read that ref. “Stable” and “fresh” are separate design requirements.

**Returning the private node anyway.** `useImperativeHandle(ref, () => inputRef.current)` defeats the point and is also awkward because the node may be `null` when the handle is created. Expose named operations that safely consult `inputRef.current` when called.

**Calling the factory as though it were the action.** The factory returns the handle object; it should not focus the input, fetch data, or open a dialog while React is establishing the handle. Put the behavior inside a method and let the parent call that method in response to an event.

**Using a handle for ordinary state flow.** A parent-controlled `open` prop is easier to inspect, test, replay, and synchronize than a hidden `open()` command. Ask whether the value describes what the UI should be or whether it is a one-time action. Use props for the former and a handle only for the latter.

**Forgetting the ref boundary.** In React 18, placing `ref` on a normal function component does not make it available as `props.ref`; the ref must be accepted through `forwardRef`. In React 19, direct ref props are supported, but a library still needs to match the React versions and type definitions it claims to support.

## 7. Compare With Related Concepts

**`forwardRef` vs `useImperativeHandle`**

`forwardRef` makes a parent ref available inside a child. `useImperativeHandle` chooses the value exposed through that ref. Use only `forwardRef` when forwarding a deliberately supported DOM target; add `useImperativeHandle` when the public API should be a restricted set of methods.

**Imperative handle vs declarative props**

Props describe desired state, such as `open={isOpen}`. A handle commands an action, such as `ref.current?.focus()`. Use props for state the UI must reflect and a handle for one-off actions that do not fit naturally into a render description.

**Imperative handle vs `useRef`**

`useRef` creates a private persistent mutable cell inside a component. `useImperativeHandle` controls a ref value exposed across a component boundary. Use `useRef` to own the implementation detail; use `useImperativeHandle` to publish a small external contract built on that detail.

**Imperative handle vs callback prop**

A callback prop sends an event or request through normal one-way data flow, such as `onSubmit` or `onRequestFocus`. A handle lets the parent synchronously invoke a named child action when a ref is the clearest API. Prefer a callback or state when the interaction is part of normal data flow; use a handle when the child is a reusable imperative surface such as a text editor, media player, or scroll container.

## 8. 🧠 The Memory Hook — What Sticks

`forwardRef` opens the service window; `useImperativeHandle` decides which buttons are on the service card. Give the parent a button like `focus()`, never the master key to the child’s DOM and state.
