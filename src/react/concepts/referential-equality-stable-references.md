# Referential Equality and Stable References

## 1. Why This Exists — The Problem First

You memoize a large results table, but it still renders whenever the parent types into an unrelated input. Or a subscription reconnects on every render even though the room ID has not changed. The surprising part is often that the data *looks* unchanged: `{ sort: "name" }` still contains the same key, and the callback still has the same body.

The missing piece is identity. React can cheaply ask whether it received the same value reference as last time, but it does not recursively inspect every object to decide whether two objects have equal contents. If you create a fresh object or function during every render, you are telling React—and any library using identity checks—that something changed.

## 2. The Analogy — Make It Obvious

Imagine a warehouse that accepts delivery instructions. Each instruction has a destination and a list of options. The clerk does not open every package and compare every word with yesterday’s package. They check the tracking number.

Two packages can contain identical instructions and still have different tracking numbers because they are two physical packages. That is JavaScript’s object comparison: two separately created objects are different references. If you hand over the *same package* again, the tracking number is unchanged, so a memoized clerk can skip reprocessing it.

In this analogy, a render is a new delivery round, an object or function is a package, and a reference is its tracking number. `useMemo` keeps one package until its inputs change. `useCallback` does the same for a function package. A primitive such as a string is more like the instruction written directly on a form: React can compare the value itself.

The analogy has an important limit: keeping the same package does not update its contents. A stable function can still contain old closed-over values. Identity and freshness are separate concerns.

## 3. How It Actually Works — The Full Explanation

JavaScript stores objects, arrays, and functions as values with identity. An object literal creates a new object each time that expression runs. A function expression or arrow function creates a new function object each time it runs. Equality for these values asks whether both variables point to the same object, not whether their properties or function bodies look alike.

```js
const first = { page: 1 };
const second = { page: 1 };
const alias = first;

console.log(first === second);       // false: two allocations
console.log(Object.is(first, alias)); // true: one allocation, two names
console.log(Object.is({ page: 1 }, { page: 1 })); // false
```

React relies on this shallow identity check in several places. A dependency array is compared element by element with `Object.is`; a primitive is compared by its value, while an object, array, or function is compared by its reference. `React.memo` similarly compares the component’s props shallowly by default. It does not deep-compare nested properties.

That gives us a common render sequence:

1. A parent renders.
2. An inline object, array, or function expression runs again.
3. JavaScript creates a new reference, even if the contents are identical.
4. A memoized child sees that prop reference change and renders again, or a dependency-based synchronization sees a changed dependency and runs again.

The parent itself still renders when its state changes. Stable references do not stop that. They only let consumers of those references skip work when the logical input did not change.

React render snapshots capture one set of props and state. The component function creates closures and values for that snapshot and returns a description of the UI. A later render creates a new snapshot; it does not mutate the old snapshot's local bindings. That is why a stable callback can still be stale if it captured an old value, while a callback whose dependency changed gets a new identity and a new snapshot of that value.

Ownership clarifies where identity should be decided. The component that owns a changing value should create or preserve the object or function derived from that value, then pass it to consumers. Consumers should not manufacture a fresh equivalent reference merely to forward the same meaning. When the owner changes the logical input, a new reference is intentional; when the input is unchanged, preserving the reference gives memoized children and other identity-sensitive consumers a useful signal.

Effects are for synchronizing a committed render with something outside React, such as a subscription, timer, DOM API, or network connection. Their dependencies describe which render values that external synchronization uses: an unstable object dependency can reconnect unnecessarily, while omitting a changing value can leave the external system synchronized with an old snapshot. Referential equality therefore affects when setup and cleanup repeat, but it does not make an effect's captured values live.

There are three normal ways to avoid accidental identity changes:

- Use a primitive prop when the child only needs a primitive. Passing `pageSize={20}` is easier to compare than passing `options={{ pageSize: 20 }}`.
- Move a truly constant object or function outside the component. It then has one module-level identity.
- Use `useMemo` for a value or `useCallback` for a function when a consumer benefits from avoiding recalculation or from usually-stable identity, and its inputs determine when a new identity is correct.

Memoization is not free, and `useMemo` is a performance optimization rather than a semantic identity guarantee. React stores the cached value and its dependencies, but it may discard that cache and calculate the value again, such as when a component suspends during its initial mount or when React makes other implementation decisions. If the calculation is cheap and nobody observes identity, recreating the value is often clearer and just as fast. If identity is part of correctness, use a persistent mechanism such as `useRef` for a stable container or `useState` with a lazy initializer for a persistent value; those values persist for the mounted component until you change them or it unmounts. If a memoized value captures changing data, every value it reads must be represented in its dependencies—or the stable reference can become stale.

The most useful distinction is this:

- Referential equality answers, “Is this the same allocation?”
- Value equality answers, “Does this represent the same data?”
- Stable reference means, “For this consumer, keep the allocation unchanged until these declared inputs change.”

React’s comparison does not know your domain’s notion of “same.” Two user objects with the same `id` are still different references unless your code compares their IDs or preserves the original object.

## 4. Real Code — See It Working

The first example is plain JavaScript, so it can be run directly with `node` and makes the identity rule visible without a React setup.

```js
const makeOptions = () => ({ pageSize: 20 });

const previousOptions = makeOptions();
const nextOptions = makeOptions();
const sameOptions = previousOptions;

console.log(Object.is(previousOptions, nextOptions)); // false
console.log(Object.is(previousOptions, sameOptions)); // true

const cache = new Map();
cache.set(previousOptions, "cached result");

console.log(cache.get(nextOptions)); // undefined
console.log(cache.get(sameOptions)); // cached result
```

The `Map` example is production-relevant: caches, registries, subscription managers, and event systems often use object identity as a key. Equal-looking objects do not retrieve the same entry.

Here is a complete React example. It can be placed in a standard React + TypeScript application. The child is memoized so the effect of prop identity is observable in the console.

```tsx
import { memo, useCallback, useMemo, useState } from "react";

type SearchOptions = {
  pageSize: number;
  sort: "name" | "updated";
};

type ResultsProps = {
  options: SearchOptions;
  onSelect: (id: string) => void;
};

const Results = memo(function Results({ options, onSelect }: ResultsProps) {
  console.log("Results rendered", options, onSelect);
  return (
    <button type="button" onClick={() => onSelect("result-42")}>
      Show {options.pageSize} results sorted by {options.sort}
    </button>
  );
});

export function SearchPanel() {
  const [query, setQuery] = useState("");

  // The child does not depend on query, so keep these identities independent of it.
  const options = useMemo<SearchOptions>(
    () => ({ pageSize: 20, sort: "updated" }),
    [],
  );
  const handleSelect = useCallback((id: string) => {
    console.log("selected", id);
  }, []);

  return (
    <section>
      <label>
        Search
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <Results options={options} onSelect={handleSelect} />
    </section>
  );
}
```

Typing changes `SearchPanel`’s state and therefore re-renders the parent. Because `options` and `handleSelect` retain their references, the default `memo` comparison can skip `Results`. If `options` were written inline or `handleSelect` were declared inline, each keystroke would provide a new reference and defeat this particular optimization.

If the value depends on render data, include that data rather than forcing an empty dependency list:

```tsx
import { useCallback, useMemo, useState } from "react";

type Sort = "name" | "updated";

export function SortableResultsFixture() {
  const [sort, setSort] = useState<Sort>("name");
  const onSelect = useCallback((id: string, selectedSort: Sort) => {
    console.log("selected", id, "under", selectedSort);
  }, []);
  const options = useMemo(
    () => ({ pageSize: 20, sort }),
    [sort],
  );

  const handleSelect = useCallback(
    (id: string) => onSelect(id, sort),
    [onSelect, sort],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setSort((current) => (current === "name" ? "updated" : "name"))}
      >
        Sort by {sort === "name" ? "updated" : "name"}
      </button>
      <button type="button" onClick={() => handleSelect("result-42")}>
        Show {options.pageSize} results sorted by {options.sort}
      </button>
    </>
  );
}
```

This is the correctness boundary. Clicking the first button changes the owned `sort` state, so `options` and `handleSelect` intentionally receive new identities through their dependency lists. Re-rendering without a sort change reuses those identities. Omitting `sort` would preserve the references but make the callback or object describe an old render.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is referential equality, and why does `{}` not equal `{}`?**

Objects, arrays, and functions are compared by identity. Each object literal allocates a separate object, so the two expressions point to different allocations even though both objects have no properties. `Object.is(a, b)` and `a === b` are both true only when the references point to the same object for this kind of value.

**Q: How does React compare dependency-array entries?**

React compares entries pairwise with `Object.is`. A primitive such as a number or string is compared by value. An object, array, or function is compared by reference. If one dependency is not equal, the associated memoized calculation or synchronization is considered changed. This is why depending on a freshly created object is different from depending on its primitive fields.

**Q: Why can an inline object or function defeat `React.memo`?**

`React.memo` performs a shallow prop comparison by default. The parent may pass the same logical settings, but `options={{ pageSize: 20 }}` creates a new object on every render. Likewise, `onSelect={(id) => save(id)}` creates a new function. One changed prop is enough for the shallow comparison to fail, so the child renders.

**Q: What is a stable reference?**

A stable reference is an object, array, or function whose identity remains the same across renders until chosen inputs change. A module-level constant is stable for the lifetime of that module. `useRef` and state preserve a value for the mounted component; `useMemo` and `useCallback` cache values as performance optimizations and may be discarded by React. Stability matters only when a consumer observes identity—for example, a memoized child, dependency comparison, `Map` key, or third-party subscription API.

**Q: When should you use `useMemo` or `useCallback`?**

Use `useMemo` for a calculation that is meaningfully expensive or for an object/array whose usually-stable identity helps a consumer. Use `useCallback` when a function identity helps a memoized child or a library that subscribes and unsubscribes by function identity. Neither hook is a semantic identity guarantee: React may discard a memo cache. If identity is correctness-critical, use `useRef` or state initialized with `useState` so the value persists for the mounted component. Do not add memoization automatically; its dependency bookkeeping and extra code must save more work than they cost.

**Q: Is `useCallback(fn, deps)` fundamentally different from `useMemo(() => fn, deps)`?**

For reference stability, they express the same idea: cache a function reference until the dependencies change. `useCallback` is the clearer API when the thing being cached is a function. Neither prevents the function from seeing stale values if the dependency list is incomplete.

**Q: Can a stable reference still be wrong?**

Yes. Stable identity says nothing about the freshness of the value reachable through that identity. A callback memoized with `[]` that reads `userId` will keep the initial `userId`. The reference is stable, but its behavior may be stale. Dependencies must describe every render value that the callback or computed value reads, unless the value is intentionally obtained through another explicit mechanism.

**Q: Should you deep-compare dependencies or memoize everything?**

Usually no. Deep comparison has a cost that grows with the structure being inspected and can hide unclear ownership or data-flow decisions. Memoization also has a cost. First ask whether a primitive can be passed, whether a constant can move outside the component, or whether the child really needs memoization. Then stabilize the specific identity that has a measured or correctness-relevant consumer.

## 6. The Traps — What Goes Wrong

The first trap is confusing equal contents with equal identity. This fails in `Map` keys, `Set` membership, memoized props, and dependency arrays because those consumers do not inspect every nested property. Compare a stable domain key such as `user.id` when that is the actual identity you need, or preserve the original object when object identity is meaningful.

The second trap is wrapping an unstable value in another unstable value. This does not help:

```tsx
const options = { pageSize: 20 };
const childProps = useMemo(() => ({ options }), [options]);
```

`options` is new on every render, so `childProps` is also recalculated on every render. Memoization only works when the inputs themselves remain stable or change for a real reason. Memoize the object at its source, pass primitives, or remove the unnecessary wrapper.

The third trap is using `useMemo` to hide a missing dependency. An empty list can make a reference stable while freezing the first render’s values. That trades a visible re-run for a less visible correctness bug. Include the values read by the calculation, restructure the calculation so it receives explicit inputs, or use an API designed for reading current values without changing the synchronization boundary.

The fourth trap is assuming `React.memo` prevents all child renders. It only skips a render when its observed props compare equal and React can reuse that work. Local state, context changes, a changed key, or an unstable prop can still cause the child to render. Memoization is a performance hint around a component boundary, not a guarantee that the component never runs.

The fifth trap is stabilizing cheap values by reflex. Creating `{ pageSize: 20 }` is usually cheaper and clearer than maintaining a memo record if nobody compares that object. A stable reference is valuable when it changes behavior for a consumer, not merely because a new allocation feels aesthetically wrong.

The sixth trap is using a custom deep comparator without measuring it. A comparator can cost more than rendering the child, and it can become incorrect when a new prop is added or a nested value is mutated. Prefer immutable updates, narrow props, and primitive selectors before introducing custom equality logic.

## 7. Compare With Related Concepts

**Referential equality vs value equality.** Referential equality asks whether two variables point to the same allocation; value equality asks whether their contents or domain values match. Use reference comparison when identity itself matters. Compare fields, IDs, or use a deliberate value-equality function when two separate objects should count as the same data.

**Stable reference vs immutable update.** A stable reference stays unchanged across renders; an immutable update creates a new reference when data changes and preserves old references for untouched data. Use both together: preserve identity for unchanged branches, and replace the changed branch so consumers can detect the update.

**Stable reference vs stale closure.** Stability controls *when the identity changes*. A closure controls which render’s variables a function can read. Use a dependency list that matches the values the function reads; do not treat a stable callback as proof that it sees current state.

**`useMemo` vs `useCallback`.** `useMemo` caches the result of a calculation; `useCallback` caches a function identity. Both are performance optimizations whose caches React may discard. Use `useRef` or state when the identity must persist because correctness depends on it, and use the memo hooks when the value only needs an optimization.

**`React.memo` vs `useMemo`.** `React.memo` can skip a component render when its props are shallowly equal. `useMemo` can preserve a value inside a component. Use `React.memo` at a component boundary and `useMemo` for a value that needs stable identity or expensive calculation; either one is ineffective if the relevant inputs keep changing.

## 8. 🧠 The Memory Hook — What Sticks

React does not inspect every package to see whether the contents look the same; it checks the tracking number. Keep the same reference only when a real consumer cares—and remember that the same tracking number can still point to instructions from an old render if you forgot an input.
