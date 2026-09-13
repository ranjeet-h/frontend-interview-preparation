# React Fragments

## 1. Why This Exists — The Problem First

JSX expressions need one returned root, but many UI components naturally produce several sibling elements. The old workaround was an extra `<div>`:

```tsx
function NameAndEmail() {
  return (
    <div>
      <h2>Ada Lovelace</h2>
      <p>ada@example.com</p>
    </div>
  );
}
```

That wrapper is not always harmless. A CSS grid or flex container sees the wrapper as one direct child instead of seeing the intended items. A `<tr>` cannot validly contain a `<div>` around its cells, and a definition list expects `<dt>` and `<dd>` in its meaningful structure. Unnecessary containers can also add confusing nodes to the accessibility tree, interfere with selectors such as `:nth-child`, and create extra work for layout and style calculation.

A Fragment solves the root-expression problem while emitting no element of its own. Its children remain siblings in the committed DOM. That makes it useful when grouping is needed by React and JSX, but a wrapper would have no visual, semantic, event, measurement, or styling purpose.

## 2. The Analogy — Make It Obvious

Imagine a librarian bundling several books with a temporary paper strap while moving them between carts. The strap lets the librarian handle the books as one unit during the move, but once the books are placed on the shelf, the strap is gone: each book sits directly beside the other books.

The paper strap is the Fragment Fiber. The cart is React’s render and reconciliation work. The shelf is the real parent DOM element. The books are the Fragment’s child elements. React can use the Fragment boundary to organize and reconcile the children, then commit the children directly into the parent without creating a strap-shaped DOM node.

The analogy has an important limit: a Fragment is not a DOM container. You cannot paint the paper strap, measure it, attach a click listener to it, or give it an accessibility role. If the grouping itself needs one of those capabilities, the grouping should be a real semantic or ordinary element.

## 3. How It Actually Works — The Full Explanation

In TSX, the short syntax `<>...</>` is JSX syntax for a Fragment. Depending on the configured JSX transform, TypeScript emits calls through the automatic JSX runtime or through `React.createElement`; the resulting React element has Fragment as its type. The exact generated helper names are compiler details, but the runtime meaning is the same: React receives a group of children with no host element.

The explicit form is equivalent in behavior:

```tsx
import { Fragment } from "react";

function Header() {
  return (
    <Fragment>
      <h1>Reports</h1>
      <p>Updated today</p>
    </Fragment>
  );
}
```

React represents the group in its internal tree, commonly described as a Fragment Fiber. During reconciliation, React compares the Fragment and its children using the same identity inputs used elsewhere: element type, position, and keys. During commit, the Fragment contributes no host node. Its host children are inserted, moved, updated, or removed relative to the nearest real DOM parent.

The short syntax accepts no attributes. In particular, this is invalid TSX:

```tsx
// Invalid: the shorthand Fragment cannot receive key, className, ref, or any other prop.
// <>...</> cannot be written with an attribute.
```

When a Fragment must be keyed, use the explicit form. A key belongs on the Fragment group, not on only its first child:

```tsx
import { Fragment } from "react";

type Product = { id: string; name: string; price: number };

export function ProductRows({ products }: { products: Product[] }) {
  return (
    <tbody>
      {products.map((product) => (
        <Fragment key={product.id}>
          <tr>
            <td>{product.name}</td>
            <td>${product.price.toFixed(2)}</td>
          </tr>
          <tr className="product-spacer" aria-hidden="true">
            <td colSpan={2} />
          </tr>
        </Fragment>
      ))}
    </tbody>
  );
}
```

The key identifies each pair of rows as one logical item. It is used by React and is not passed as a normal prop to a child component or rendered into the DOM. A Fragment key does not make the Fragment selectable in CSS, and it does not create an event target.

A component may also return an array of elements. Arrays are valid React children, but each element in a returned or mapped array needs an appropriate key when React is reconciling a collection. Arrays are especially useful when a program is already manipulating a collection; Fragments usually read more naturally when the author is expressing adjacent JSX. Neither option creates a DOM wrapper. The choice is mainly about grouping semantics, key placement, and syntax.

Fragment identity matters for state. A stable Fragment with a stable key lets React match its descendant Fibers to the previous render, so state and DOM nodes can be preserved where their own identity also matches. Changing the key tells React that this logical group is a different group; descendants are unmounted and mounted again. Moving a Fragment or changing the surrounding structure can likewise change positions and therefore state identity. A Fragment is not a universal state-preservation guarantee.

Strict Mode and concurrent rendering make render purity important. In development Strict Mode, React may call render logic more than once and may perform extra effect setup/cleanup checks. Concurrent rendering may start work, pause it, abandon it, and retry before committing. A Fragment does not change those rules: do not perform side effects during render, and do not infer that a Fragment has mounted merely because its JSX was evaluated. Effects belong to the component Fibers that declare them. They run and clean up according to those components’ committed lifecycle, while the Fragment itself owns no DOM node and no effect callback.

## 4. Real Code — See It Working

**Example 1: Direct grid children**

```tsx
type Stats = { followers: number; following: number; repositories: number };

function UserStats({ followers, following, repositories }: Stats) {
  return (
    <>
      <article className="stat-card">Followers: {followers}</article>
      <article className="stat-card">Following: {following}</article>
      <article className="stat-card">Repositories: {repositories}</article>
    </>
  );
}

export function Dashboard() {
  return (
    <section className="stats-grid">
      <UserStats followers={1250} following={340} repositories={48} />
    </section>
  );
}
```

If `.stats-grid` is a grid container, the three `article` elements are the relevant host children. A `<div>` inside `UserStats` would change that DOM relationship. The Fragment itself cannot receive `className`; put layout styles on the actual grid or on the cards.

**Example 2: Valid table structure**

```tsx
type Revenue = { label: string; q1: number; q2: number };

function RevenueCells({ q1, q2 }: Pick<Revenue, "q1" | "q2">) {
  return (
    <>
      <td>${q1.toLocaleString()}</td>
      <td>${q2.toLocaleString()}</td>
    </>
  );
}

export function RevenueTable({ rows }: { rows: Revenue[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Q1</th>
          <th>Q2</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <RevenueCells q1={row.q1} q2={row.q2} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`RevenueCells` contributes two cells without inventing an invalid element between `<tr>` and `<td>`. The Fragment improves structural validity; it does not replace table semantics such as captions, `scope`, or headers.

**Example 3: Keyed definition-list groups**

```tsx
import { Fragment } from "react";

type GlossaryItem = { id: string; term: string; definition: string };

export function Glossary({ items }: { items: GlossaryItem[] }) {
  return (
    <dl>
      {items.map((item) => (
        <Fragment key={item.id}>
          <dt>{item.term}</dt>
          <dd>{item.definition}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
```

The explicit Fragment is necessary because the mapped expression produces two siblings for each item. `<>...</>` cannot carry `key`. A stable data id is preferable to an array index when items can be inserted, deleted, or reordered.

**Example 4: A keyed Fragment can intentionally reset descendants**

```tsx
import { Fragment, useState } from "react";

function DraftEditor({ documentId }: { documentId: string }) {
  const [draft, setDraft] = useState("");

  return (
    <label>
      Draft for {documentId}
      <input value={draft} onChange={(event) => setDraft(event.target.value)} />
    </label>
  );
}

export function Editor({ documentId, title }: { documentId: string; title: string }) {
  return (
    <Fragment key={documentId}>
      <h2>{title}</h2>
      <DraftEditor documentId={documentId} />
    </Fragment>
  );
}
```

When `documentId` changes, the keyed Fragment represents a new group, so the editor’s state resets. If that reset is not intended, keep the identity stable and model the document change explicitly instead.

## 5. The Interview Questions — All of Them, Done Properly

**What is a React Fragment?** A Fragment is a React grouping construct that lets a component return multiple children without adding a host DOM element. It solves JSX’s single-root expression requirement while preserving the parent-child structure required by CSS and HTML.

**What is the difference between `<>...</>` and `<React.Fragment>...</React.Fragment>`?** They represent the same Fragment behavior. The shorthand is concise but accepts no props. The explicit form can receive a `key`, which is needed when one mapped item expands to multiple siblings. In TypeScript, either `React.Fragment` or an imported `Fragment` can be used, provided the JSX configuration and imports are set up correctly.

**Can a Fragment receive `className`, `style`, `onClick`, or `ref`?** No. Those values need a host node or another supported target. Use a real element if the group needs styling, event handling, measurement, animation, a ref, or a semantic role. A Fragment key is special reconciliation metadata, not a DOM prop.

**Are Fragments visible in the DOM?** No. The browser sees the Fragment’s host children directly under their real parent. React may represent the Fragment internally, but DevTools’ React tree and the browser’s DOM tree are different views.

**How are Fragment keys different from child keys?** A key on an explicit Fragment identifies the whole group produced by one collection item. Keys on the group’s children identify those children within their own sibling collection. If one item produces a heading and a paragraph, putting a key on only the heading does not correctly key the two-node group.

**How does a Fragment affect state and reconciliation?** React matches a Fragment and its descendants by type, position, and keys. Stable identity can preserve descendant state. A changed Fragment key, a changed component type, or a changed structural position can cause descendants to remount and lose state. Fragment boundaries do not make state independent of the surrounding tree.

**What happens to effects inside a Fragment?** Effects are owned by the components that call `useEffect` or other effect hooks. A Fragment has no effect lifecycle of its own. When a keyed Fragment is replaced, descendant components unmount and their cleanup functions run; when it is merely re-rendered with matching identity, descendants can remain mounted. Strict Mode may add development-only setup and cleanup checks.

**How do Fragments behave with concurrent rendering?** They participate in the same interruptible render and commit process as other React elements. Render work can be restarted or abandoned before it reaches the DOM. Only committed work should be observed through effects or refs, so Fragment code must remain render-pure and must not depend on render being called exactly once.

**Why use a Fragment instead of an array?** Both can produce zero wrapper nodes. A Fragment expresses a JSX group and can put one key on the logical group. Arrays express a collection directly and require keys on the relevant array elements. Arrays can be a good fit for computed lists; Fragments are often clearer for a fixed set of adjacent elements or a multi-node item in a map.

**When should I use a real element instead?** Use one when it contributes meaning (`nav`, `main`, `section`, `article`, `fieldset`), provides an accessibility landmark or label boundary, owns layout or styling, is an event target, must be measured or animated, or is the target of a ref. Removing a wrapper is not automatically an accessibility improvement.

## 6. The Traps — What Goes Wrong

**Trap 1: Trying to key shorthand syntax.** `items.map((item) => < key={item.id}>...</>)` is not valid JSX. Use `<Fragment key={item.id}>...</Fragment>`.

**Trap 2: Keying the wrong node.** In a map where each item returns multiple siblings, this does not key the complete group:

```tsx
type Item = { id: string; title: string; description: string };

const items: Item[] = [
  { id: "one", title: "First item", description: "First description" },
  { id: "two", title: "Second item", description: "Second description" },
];

export function IncorrectlyKeyedItems() {
  return (
    <section>
      {items.map((item: Item) => (
        <>
          <h3 key={item.id}>{item.title}</h3>
          <p>{item.description}</p>
        </>
      ))}
    </section>
  );
}
```

The key must be on the explicit Fragment. Do not silence the warning by using an unstable value such as `Math.random()`, and do not use an index when the collection can reorder.

**Trap 3: Expecting a Fragment to be a CSS or event boundary.** `.container > *`, `:nth-child`, event bubbling, and layout calculations operate on the real DOM. The browser cannot select or style “the Fragment.” A Fragment containing two `<div>` elements contributes two direct children, not one selectable group.

**Trap 4: Assuming Fragment means “no semantics needed.”** A Fragment cannot supply a heading relationship, landmark, form grouping, table semantics, or accessible name. Keep meaningful elements and use Fragment only when the wrapper itself has no job.

**Trap 5: Believing Fragment identity always preserves state.** A Fragment can preserve state only when the relevant identity remains stable. Changing its key intentionally remounts the group. Moving it among siblings or changing the surrounding conditional structure can also change identity.

**Trap 6: Treating render as a one-time mount.** Strict Mode and concurrent rendering can invoke render more than once or discard a render before commit. Do not subscribe, mutate external systems, or inspect a Fragment’s “DOM node” during render. Put synchronization in an effect with correct cleanup, and remember that the effect belongs to its component, not to the Fragment.

## 7. Compare With Related Concepts

| Concern | Fragment | Real element such as `<div>` or `<section>` | Array of elements |
| --- | --- | --- | --- |
| Host DOM node | None | One host node | None |
| Direct-child layout | Children remain direct children | Adds an intermediate child | Children remain direct children |
| Semantic/accessibility role | Cannot provide one | Can provide one | Cannot provide one as a group |
| `className`, style, events, ref | Not supported | Supported where applicable | No shared target |
| Keying a multi-node mapped item | Explicit Fragment can carry one key | Wrapper can carry one key | Key each array item/element as required |
| State identity | Fragment type, position, and key participate | Element type, position, and key participate | Child element identity participates |
| Effect ownership | Descendant components own effects; Fragment owns none | Descendant components own effects; host element owns no hook effect | Descendant components own effects |
| Best use | Group siblings with no wrapper purpose | Meaning, styling, interaction, measurement, or ref target | Computed collections and direct list construction |

Use `<>...</>` for a static group with no key. Use `<Fragment key={item.id}>...</Fragment>` when one collection item produces several siblings. Use an array when the data structure itself is the collection and per-element keys are natural. Use a real element when the wrapper needs to exist for the user, the browser, assistive technology, or an imperative API.

## 8. 🧠 The Memory Hook — What Sticks

Fragment = **temporary librarian strap, zero shelf space**: React can carry and reconcile siblings as a group, but the strap disappears before the browser sees the DOM. Remember three checks: **no node, no props; keyed groups need explicit syntax; stable keys preserve identity, changed keys reset descendants**.
