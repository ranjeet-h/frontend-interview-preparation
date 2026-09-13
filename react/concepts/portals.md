# React Portals (`createPortal`)

## 1. Why This Exists — The Problem First

Imagine a product card with a “Delete” button. The card sits inside a scrolling panel. Clicking the button should open a confirmation dialog that covers the viewport.

If the dialog is rendered as an ordinary child of the card, it inherits the card’s physical environment. An ancestor may have `overflow: hidden`, a scrolling clipping box, a `transform`, a `filter`, or a stacking context with a lower `z-index`. A `position: fixed` dialog can then be clipped, positioned relative to the wrong ancestor, or painted behind another layer.

The tempting fixes create different problems:

- Move every dialog’s state to `App`, which loses the dialog’s natural ownership and causes prop drilling.
- Append DOM nodes with `document.body.appendChild()` manually, which makes React unaware of ownership, updates, and cleanup.
- Increase `z-index` forever, even though `z-index` cannot escape an ancestor’s stacking context.

A portal solves the specific placement problem. `createPortal(children, domNode)` tells React to keep `children` in the same React tree while committing their DOM nodes into another DOM container. The component can remain next to the state and event that control it, while its visual surface can live under a top-level host such as `<div id="modal-root"></div>`.

The most important sentence is: **a portal changes DOM placement, not React ownership.** It is a layout escape hatch, not a second React application and not an accessibility feature.

## 2. The Analogy — Make It Obvious

Think of a theatre company with a remote stage.

The director, script, actors, and cue system stay in the main theatre: that is the React tree. The company can perform a scene on a remote outdoor stage: that is the portal container in the DOM. The scenery is physically somewhere else, but the same director still owns the scene, sends its props and context, and receives its React events.

The mapping is direct:

- The **director’s script** is props and state. The dialog’s `open`, `onClose`, and form state can stay beside the button that owns them.
- The **remote stage** is `#modal-root` or `document.body`. It avoids the parent DOM subtree’s clipping and stacking constraints.
- The **company’s cue system** is React’s Fiber ownership. Context and reconciliation still follow the React parent-child relationship.
- The **intercom** is React event propagation. A click in the remote scene can still reach a parent React handler, even though the browser’s DOM ancestry is different.
- The **stage manager’s teardown** is effect cleanup. If the company creates a temporary stage or installs a key listener, it must remove exactly that resource when the owner leaves.

The analogy has one limit: the remote stage does not automatically make the performance accessible. Focus order, dialog semantics, keyboard behavior, and background inertness still require deliberate implementation.

## 3. How It Actually Works — The Full Explanation

**The API and the two trees.** The API comes from `react-dom`:

```tsx
import { createPortal } from "react-dom";

createPortal(children, domNode, optionalKey);
```

`children` is any renderable React node. `domNode` must be an existing DOM node at commit time. The optional `key` participates in reconciliation when portals are returned from a list or when multiple portal destinations need stable identity.

Suppose the React tree is:

```text
App
└─ ProductCard
   └─ DeleteDialog
```

The browser DOM may be:

```text
body
├─ #root
│  └─ product-card
└─ #modal-root
   └─ dialog
```

`DeleteDialog` remains a descendant of `ProductCard` in React’s Fiber tree. React therefore still reconciles its props and state, preserves or resets its state according to normal identity rules, and resolves context from the same React ancestors. The dialog’s host DOM nodes are simply inserted under `#modal-root` during the commit phase.

**React ownership versus browser ancestry.** The browser only sees physical DOM ancestry. CSS selectors, inherited styles, native `closest()`, and native event propagation use that DOM. React’s reconciliation, context, and synthetic event handling use React ownership. This split explains both the power and the traps of portals.

**Events follow the React tree for React handlers.** A click inside a portal bubbles through the React tree to React ancestors, according to the React `onClick` relationships. It does not need to be a DOM descendant of the ancestor that declares `onClick`.

The native event still has a physical DOM path. A native listener attached to the original card element will not receive a click from a dialog mounted elsewhere merely because React considers the dialog its child. A native listener on a physical ancestor of the portal container may receive it. React’s event system then dispatches React handlers using the Fiber relationship. With multiple React roots, propagation does not jump into an unrelated root.

This is why a dialog inside a clickable card can accidentally trigger the card’s navigation handler. Stop propagation at the dialog boundary when that is the intended behavior; do not assume DOM relocation stopped React propagation.

**Context crosses the portal.** Context lookup follows the React tree, so a portal child can read a theme, authenticated user, router, query client, or typed dialog context supplied above its logical parent. You do not re-wrap a portal merely because its DOM is under `body`. A portal rendered into a different document, such as an iframe, has additional document and stylesheet concerns, but its React ownership still matters.

**A portal does not create a new React root.** `createPortal` returns a React node that is reconciled by the existing root. `createRoot()` creates a separate root with separate ownership boundaries. Mixing the two concepts is a common source of incorrect claims about context and event propagation.

**Container lifecycle has two valid patterns.** Prefer a server-rendered, stable host when the application can provide one:

```html
<body>
  <div id="root"></div>
  <div id="modal-root"></div>
</body>
```

If a component creates its own host with `document.createElement`, it owns that host and must remove it in cleanup. React removes the portal’s child nodes when the portal unmounts, but React cannot know that an application-created container should be removed from `body` unless your code does so.

**SSR and hydration require a client boundary.** `document` and `window` do not exist during server rendering. Do not read `document.body` in module scope, in a state initializer, or unconditionally during render. A stable host in the server HTML is helpful, but the component still needs to avoid browser-only lookup during the server render. Render `null` until a client-only lifecycle step has run, then create the portal. The server output and the initial client hydration output must agree; adding portal DOM before hydration has matched the server can produce a hydration mismatch.

**Effects are synchronization contracts.** A portal modal commonly synchronizes external systems: a `keydown` listener, body scroll locking, focus restoration, or a dynamically created host. Each setup must return cleanup that undoes that exact setup. Cleanup runs when dependencies change and when the component unmounts. It can also run during development checks before a setup is repeated.

**Strict Mode and discarded renders.** In development, Strict Mode may mount, clean up, and mount again to expose missing cleanup. Concurrent rendering may also start a render and discard it before commit. Render code must therefore stay pure: do not append a host, add a listener, focus an element, or mutate `body` during render. Only committed lifecycle work may touch those external systems. A discarded render does not get a corresponding committed cleanup, so render-phase side effects can leak.

**State, keys, and portal identity.** A portal does not change React’s state rules while its destination is stable. If the same dialog component remains at the same logical position with the same key, its state can be preserved even when its DOM destination is elsewhere. However, changing `domNode` causes React to recreate the portal content in the new container, so state preservation across a container replacement is not guaranteed. Changing the portal’s `key`, changing component type, or intentionally remounting the dialog also resets its local state. Use a key when switching between records should create a fresh dialog state; do not use a key as a substitute for cleanup.

## 4. Real Code — See It Working

The following labeled TSX examples are self-contained except for the normal React and React DOM packages. Each example is a separate entry point. They use a small custom lifecycle hook so the effect implementation is isolated in one reusable hook. In a conventional application, `usePortalEffect` is the place where the same synchronization rules as `useEffect` belong.

**Example A — a stable host, typed context, accessible modal, and React bubbling.**

```tsx
import {
  createContext,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from "react";
import { createPortal, createRoot } from "react-dom";
import { useEffect } from "react";

// Keep direct effect code inside a synchronization hook.
function usePortalEffect(
  setup: () => void | (() => void),
  dependencies: readonly unknown[],
) {
  useEffect(setup, dependencies);
}

type Theme = "light" | "dark";
const ThemeContext = createContext<Theme>("light");

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const theme = useContext(ThemeContext);

  usePortalEffect(() => {
    setHost(document.getElementById("modal-root"));
    return () => setHost(null);
  }, []);

  usePortalEffect(() => {
    if (!open) return;

    restoreFocusTo.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();

      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          last?.focus();
          event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === last) {
          first?.focus();
          event.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus();
    };
  }, [host, open, onClose]);

  if (!open || !host) return null;

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgb(0 0 0 / 50%)" }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        tabIndex={-1}
        data-theme={theme}
        onClick={(event) => event.stopPropagation()}
        style={{ margin: "10vh auto", maxWidth: 420, padding: 24, background: "white" }}
      >
        <h2 id="delete-title">{title}</h2>
        {children}
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </div>,
    host,
  );
}

export function ProductCard() {
  const [open, setOpen] = useState(false);

  return (
    <ThemeContext.Provider value="light">
      <article onClick={() => console.log("navigate to product")}>
        <h1>Product Alpha</h1>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
        >
          Delete
        </button>
        <Modal open={open} title="Delete Product?" onClose={() => setOpen(false)}>
          <p>This dialog reads the theme context even though its DOM is elsewhere.</p>
          <button type="button" onClick={() => setOpen(false)}>Confirm delete</button>
        </Modal>
      </article>
    </ThemeContext.Provider>
  );
}

// Required HTML: <div id="root"></div><div id="modal-root"></div>
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(<ProductCard />);
```

There are three separate responsibilities here. `createPortal` handles placement. `ThemeContext` demonstrates logical ownership. The lifecycle hook handles the external listener, scroll lock, initial focus, and focus restoration. A production focus trap should also cycle `Tab` among the dialog’s focusable elements, and the application should make the background inert while the modal is modal; those are accessibility responsibilities, not portal behavior.

**Example B — a dynamically created portal host with symmetrical cleanup.**

Use this when the component, rather than the HTML document, owns the host. The host is created after a client commit and removed by the same lifecycle hook. The `host` state makes the first render return `null`; it also prevents a server render from reading `document`.

```tsx
import { type ReactNode, useState } from "react";
import { createPortal, createRoot } from "react-dom";
import { useEffect } from "react";

function usePortalEffect(
  setup: () => void | (() => void),
  dependencies: readonly unknown[],
) {
  useEffect(setup, dependencies);
}

export function TemporaryPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  usePortalEffect(() => {
    const nextHost = document.createElement("div");
    nextHost.dataset.portalHost = "temporary";
    document.body.appendChild(nextHost);
    setHost(nextHost);

    return () => {
      nextHost.remove();
      setHost(null);
    };
  }, []);

  return host ? createPortal(children, host) : null;
}

// Executable usage in a page containing <div id="root"></div>:
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <TemporaryPortal>
    <p>This content is mounted under a temporary body host.</p>
  </TemporaryPortal>,
);
```

The cleanup removes the exact node created by that setup. It is safe if the component is unmounted, and it is safe under Strict Mode’s setup-cleanup-setup probe. React also removes the portal children before the host is removed. Do not create `nextHost` in the component body: a render can be repeated or discarded without a committed cleanup.

**Example C — state reset is a key decision, not a portal feature.**

If the same dialog edits different products, decide whether draft state should survive the product change. This complete browser-entry example uses a stable `#modal-root` host and makes the reset choice explicit; an SSR application should resolve the host in a client-only lifecycle step as shown in Example A/B.

```tsx
import { useState } from "react";
import { createPortal, createRoot } from "react-dom";

function EditDialog({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [draft, setDraft] = useState(productId);
  const host = document.getElementById("modal-root");
  if (!host) throw new Error("Missing #modal-root");

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Edit ${productId}`}>
      <label>
        Name
        <input value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button type="button" onClick={onClose}>Close</button>
    </div>,
    host,
  );
}

function App() {
  const [productId, setProductId] = useState("alpha");
  const [open, setOpen] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setProductId("beta")}>Edit beta</button>
      {open && (
        <EditDialog
          key={productId}
          productId={productId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Required HTML: <div id="root"></div><div id="modal-root"></div>
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(<App />);
```

The `key` is attached to the logical React component, not to the destination DOM node. Here it intentionally resets the draft when `productId` changes. Without the key, the same `EditDialog` identity would keep its draft and would need an explicit event-driven update policy. A portal does not make state global, and moving a node under `body` does not by itself reset it; replacing the `domNode` can recreate the portal content and therefore must not be used as a state-preservation guarantee.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a React portal, and what problem does it solve?**

A portal renders React children into a DOM node outside their ordinary DOM parent while keeping them in the same React tree. It solves physical layout constraints such as clipping and stacking contexts. It does not automatically solve focus, ARIA, keyboard handling, or background inertness.

**Q: Does a portal preserve React parent-child relationships?**

Yes. Props, state ownership, reconciliation, and context follow the React tree. Only the host DOM insertion point changes.

**Q: Do events from a portal bubble?**

React event handlers bubble through the React tree, so a parent React `onClick` can receive a click from a portal child. Native DOM listeners follow the physical DOM path. Stop the event at the dialog boundary when a clickable ancestor must not react.

**Q: Does `event.stopPropagation()` stop every possible listener?**

It stops propagation of the React event through React’s dispatch path. It does not rewrite the physical DOM structure, and the exact interaction with native listeners depends on where and when those listeners run. Use a React handler boundary for React ancestors; use native event controls only when you intentionally own native listeners.

**Q: Does context work through a portal?**

Yes. Context lookup follows React ownership. A portal child reads providers above its logical React parent without being re-wrapped because its DOM is under `body`.

**Q: Is a portal the same as `createRoot()`?**

No. A portal is a React child returned from an existing root. `createRoot()` starts another root, which changes ownership boundaries and can change how context and event propagation work.

**Q: Why can `z-index` fail without a portal?**

`z-index` compares layers within stacking contexts. It cannot make a descendant escape an ancestor’s stacking context or an ancestor’s clipping box. A portal mounted under a suitable top-level host removes the problematic ancestor from the dialog’s physical ancestry.

**Q: Is `position: fixed` alone enough?**

Not always. Transforms, filters, perspective, containment, and other layout or stacking rules can affect a fixed descendant’s containing block or paint order. Portals are useful when the overlay must escape an unknown or restrictive ancestor environment; a local tooltip may not need one.

**Q: Does `createPortal` work during SSR?**

The API can be used in an SSR application, but the render must not read browser globals on the server. Look up or create the host in a client-only lifecycle step, render `null` until it exists, and ensure server and hydration output agree.

**Q: Who removes portal DOM nodes?**

When the portal unmounts, React removes the DOM children it rendered. If application code created the host element itself, that code must remove the host in cleanup. React cannot infer ownership of arbitrary nodes appended to `body`.

**Q: Does a portal trap focus automatically?**

No. An accessible modal needs a dialog role, a label, initial focus, focus restoration, Escape behavior, a real focus trap or equivalent modal primitive, and a strategy for making background content inert. A portal only changes placement.

**Q: What happens to portal state when its container changes?**

React state is controlled by logical component identity and keys, but the portal destination is part of the portal’s rendering identity. When `domNode` changes, React recreates the portal content in the new container, so state preservation is not guaranteed. A changed key or a changed component position/type can also reset state. Treat a stable host and logical keys as separate decisions: the React tree explains ownership, while replacing the container can recreate the owned content.

**Q: Why must portal setup happen in an effect rather than render?**

Render can be repeated, paused, or discarded. Appending a host or adding a listener in render creates an external side effect without a guaranteed cleanup. Commit-time lifecycle work has the setup-cleanup contract needed for Strict Mode and concurrent rendering.

**Q: What is the difference between a portal and an iframe?**

A portal shares the same document, JavaScript environment, React tree, and styles unless you add isolation yourself. An iframe creates a separate browsing context with its own document, globals, CSS, and security boundary. Use a portal for in-app overlays and an iframe when document or trust isolation is the goal.

## 6. The Traps — What Goes Wrong

**Trap 1 — “The dialog is outside the card, so the card cannot receive its click.”**

This confuses DOM ancestry with React ancestry. The portal dialog can still bubble to a parent React `onClick`. Stop propagation on the dialog surface or on the specific action when that is the desired interaction.

**Trap 2 — “A portal makes the modal accessible.”**

Placement is not semantics. Without focus management, keyboard users may tab into the page behind the dialog. Without `role="dialog"`, `aria-modal`, and a label, assistive technology may not understand the surface. Prefer a well-tested dialog primitive when the application does not need to implement these details itself.

**Trap 3 — Reading `document` during SSR.**

This fails:

```tsx
// ❌ Runs while the module or render is evaluated on the server.
const host = document.getElementById("modal-root");
```

Resolve browser nodes after the client commit, or pass a server-known host through a client boundary. Do not silence hydration warnings; make the server and client render contract intentional.

**Trap 4 — Creating a host on every render.**

This leaks orphan nodes and is unsafe under discarded renders:

```tsx
// ❌ A render is not a resource-ownership boundary.
const host = document.createElement("div");
document.body.appendChild(host);
return createPortal(children, host);
```

Create one host in a committed lifecycle setup and remove that exact host in cleanup, as in Example B.

**Trap 5 — Assuming React removes a host that your code appended.**

React owns the portal children it commits, not arbitrary siblings in `body`. If your code appends `nextHost`, your cleanup must remove `nextHost`. Otherwise every open-close cycle leaves an empty element behind.

**Trap 6 — Using an unstable callback dependency and calling it a portal bug.**

If `onClose` is recreated on every parent render, an effect depending on it may repeatedly tear down and reinstall its listener. Stabilize the callback when appropriate, or structure the synchronization so the dependency accurately describes the resource. Do not hide a broken dependency model with a “run once” ref guard.

**Trap 7 — Resetting dialog state from cleanup.**

Cleanup belongs to the old committed resource and can run because the component is leaving. Use a key when a new logical record needs fresh local state; use an event handler or explicit state transition for user-driven reset. Do not depend on cleanup to perform ordinary UI state choreography.

**Trap 8 — Treating `z-index: 999999` as a universal escape hatch.**

Large numbers do not cross stacking-context boundaries or undo clipping. Check the physical host and ancestor CSS. A portal helps only if its destination itself is placed at the correct top-level boundary.

**Trap 9 — Claiming every event behaves identically across roots.**

A portal within one React root preserves that root’s React propagation relationship. An unrelated root is a separate ownership system. Native listeners and React handlers also have different paths. State the exact boundary instead of saying “portals bubble through the DOM.”

## 7. Compare With Related Concepts

| Concern | Ordinary child render | React portal | Native `<dialog>.showModal()` | iframe |
|---|---|---|---|---|
| Physical DOM location | Under the parent DOM node | In the supplied host node | Promoted to the browser top layer | In a separate document |
| React ownership | Parent-child React tree | Same parent-child React tree | Same React tree if rendered by React | Host and iframe documents require coordination |
| React context | Preserved | Preserved | Preserved | Not automatically shared across documents/apps |
| React event relationship | Normal React propagation | React propagation follows logical ownership | Normal React propagation for React handlers | Separate document event system |
| Escapes ancestor clipping | No | Usually, if host is outside it | Yes, through the top layer | Yes, by document isolation |
| Accessibility built in | No | No | Some native modal behavior | No; must design it |
| Cleanup of application resources | Component cleanup | Component cleanup plus owned-host cleanup | Close the dialog and clean app resources | Manage window/document lifecycle |

**Portal versus ordinary rendering.** Use ordinary rendering when the overlay is intentionally local to a card or panel and its clipping is desirable. Use a portal when the surface must escape that physical layout but remain owned by the same React feature.

**Portal versus CSS positioning.** CSS positioning is cheaper and simpler when the containing block and stacking context are controlled. A portal is a structural answer to unknown or restrictive ancestors; it is not a replacement for good overlay positioning and sizing.

**Portal versus native `<dialog>`.** A native dialog can provide browser-managed modal behavior and top-layer placement when used with `showModal()`. A portal can place a React subtree at a predictable host and works for menus, tooltips, toasts, and custom overlays. They can be combined: portal a React-controlled `<dialog>` and let the browser provide its native modal layer, while still handling the application’s open state carefully.

**Portal versus an iframe.** A portal gives physical relocation with logical unity. An iframe gives document isolation. Choose based on the problem: overlays need relocation; untrusted or independently styled content may need an iframe.

**Portal versus a separate React root.** A portal preserves the parent root’s logical relationships. A separate root is an ownership boundary. If a dialog needs the parent’s context and event relationship, a portal is usually the appropriate abstraction.

## 8. 🧠 The Memory Hook — What Sticks

> **Remote DOM, local React.**
>
> A portal moves the stage, not the director: the DOM surface escapes clipping, while React state, context, reconciliation, and React events stay attached to the logical owner.

When debugging a portal, ask four questions in order:

1. **Where is the DOM host?** Is it outside the clipping and stacking contexts that caused the problem?
2. **Who owns the React node?** Which component supplies its state, context, and event ancestors?
3. **What external resources were set up?** Are listeners, focus, scroll locking, and dynamic hosts cleaned up symmetrically?
4. **What identity should state have?** Should the dialog preserve state, or should a deliberate `key` create a fresh instance?
