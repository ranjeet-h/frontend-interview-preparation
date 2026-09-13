# Component-Based Architecture in React

## 1. Why This Exists — The Problem First

Imagine an e-commerce checkout where one giant template owns the header, address form, cart rows, payment fields, validation, loading indicators, and every click handler. A small change to the payment button can accidentally depend on a selector used by the address form, while a second checkout page copies most of the same markup with slightly different rules. The page may work, but nobody can tell which code owns which behavior.

Component-based architecture gives each meaningful piece of the interface a boundary. A component can own one responsibility, expose a small input/output contract, and be composed into a larger screen. That makes change local: a profile card can change its suspension behavior without forcing a generic button or the whole page to understand users.

The goal is not to split every few lines into a file. The goal is to make ownership visible: who supplies data, who owns state, who renders a visual boundary, and who coordinates the workflow.

## 2. The Analogy — Make It Obvious

Think of a component tree as a modular hi-fi system. A turntable, preamplifier, amplifier, and speaker each has one job. Standard cables connect them, but one unit does not need to know the private mechanics of another. You can replace the speaker without rebuilding the turntable, or add a Bluetooth receiver through an available input.

The mapping is direct:

| Hi-fi system | React architecture | What the mapping means |
| --- | --- | --- |
| Turntable, amplifier, speaker | Components | Each unit owns a focused responsibility. |
| Standard RCA cable | Props | The parent supplies read-only inputs through a known interface. |
| Motor speed and needle counterweight | Local state and behavior | A component manages private details that callers should not control directly. |
| Rack connections | Composition | Larger interfaces are assembled by placing components inside other components. |
| Replacing a speaker | Local change and reuse | A component can be swapped or changed without rewriting unrelated parts. |

In React, a `Button` does not need to know whether it submits an invoice or suspends a user. It receives visual options and an event handler. A domain component such as `UserProfileCard` supplies the business meaning and composes that button with other pieces.

## 3. How It Actually Works — The Full Explanation

**Start with ownership.** A component is a unit of UI plus the data and behavior needed to make that unit work. A design-system primitive such as `Button` should know about keyboard behavior, disabled state, and visual variants. It should not know about invoices, permissions, or API endpoints. A feature component such as `UserProfileCard` can know about users and suspension rules, then pass generic instructions to the primitive.

**Use a one-way data contract.** A parent renders a child with props. The child reads those props; it does not mutate the parent's object or state. When the child needs a change, the parent passes a callback such as `onStatusChange`. The callback is an output channel: the child reports an intent, and the owner decides how to update the source of truth.

The useful mental equation is:

```text
rendered UI = f(props, state)
```

For the same props and state, the component should describe the same UI. Each render is a **snapshot**: React calls the component, gives that call its current props and state, and the returned JSX describes that moment. Event handlers created during that call close over that snapshot. If a user clicks a handler after a later render, the handler still sees the values from the render that created it; it does not reach backward and rewrite that old call's local variables. React schedules another render when state changes, producing a new snapshot and new handlers.

This is why render logic should be pure and why event logic belongs in the event handler. A render may be started, paused, or discarded by React, so it must only calculate the UI. A click, submit, or key press is an intentional event and can perform the corresponding action. Code that synchronizes with something outside React—such as the document title, a browser event target, or a WebSocket—belongs in `useEffect`, which runs after React commits the snapshot to the DOM.

`useEffect` is not a general “run this after every render” escape hatch. It is a post-commit synchronization contract: React commits the UI first, then runs the effect when its dependencies say the external synchronization is stale; cleanup disconnects the previous synchronization before the next one or on unmount. If the value can be derived during render, derive it there. If the work is caused directly by a user event, do it in the event handler instead of setting a flag and waiting for an effect to notice it.

Context is another explicit ownership boundary. `createContext` creates a channel with a default fallback, a Provider owns the current value and its updates, and `useContext` reads the nearest Provider above the consumer. The Provider should own the state or resource being shared; an intermediate layout does not need to accept and forward the value. A context value boundary is the value object supplied to one context, so split unrelated or differently changing values into separate contexts when their consumers should not share a rerender boundary. When the Provider's `value` changes by `Object.is`, every consumer of that context is scheduled to rerender, including a `memo`-wrapped consumer; consumers of a different context are not notified.

**Keep state close to where it matters.** A dropdown can own `isOpen` and keyboard navigation because those details matter only to the dropdown. A page can own selected filters when several sections need them. If two siblings need to coordinate, lift the shared state to their nearest useful parent. State ownership should follow the smallest set of components that need to read or change it.

**Prefer composition to inheritance.** React components are assembled with `children` and slot-like props such as `header` and `footer`. The container owns structure; the caller supplies the content. This keeps the container open to new combinations instead of creating a growing class hierarchy such as `ModalWithHeaderAndAdminActions`.

**Understand the render tree accurately.** React elements are descriptions: plain objects created by JSX. React stores work in an internal Fiber tree and uses that tree to schedule rendering. When state changes, React calls the affected component again and may render descendants to calculate the next element tree. Reconciliation compares the new description with the previous one, using element type and keys to decide what can be preserved. The commit phase then applies the necessary DOM mutations. A component boundary helps organize ownership and can limit work when the tree and memoization allow it, but it is not a promise that every sibling or descendant is never reconsidered.

**Treat keys as identity.** In a list, a stable key tells React which rendered item is the same logical item across renders. Using an array index as a key is risky when items can be inserted, removed, or reordered: React may preserve a row's local state for the wrong record. Component architecture is therefore also about stable identity, not just file organization.

## 4. Real Code — See It Working

The following is a self-contained TSX example for a Vite-style React app. It shows a domain-agnostic button, a structural card with explicit slots, and a domain component that owns the user action state. It uses inline styles so it does not depend on a CSS framework.

```tsx
import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
};

function Button({
  children,
  variant = 'primary',
  disabled = false,
  onClick,
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: disabled ? '#9ca3af' : variant === 'danger' ? '#dc2626' : '#2563eb',
        border: 0,
        borderRadius: 6,
        color: 'white',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '8px 12px',
      }}
    >
      {children}
    </button>
  );
}

type CardProps = {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
};

function Card({ children, header, footer }: CardProps) {
  return (
    <article style={{ border: '1px solid #d1d5db', borderRadius: 10, padding: 16 }}>
      <header style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 12, paddingBottom: 12 }}>
        {header}
      </header>
      <div>{children}</div>
      <footer style={{ borderTop: '1px solid #e5e7eb', marginTop: 12, paddingTop: 12 }}>
        {footer}
      </footer>
    </article>
  );
}

type User = {
  id: string;
  name: string;
  role: string;
  isSuspended: boolean;
};

type UserProfileCardProps = {
  user: User;
  onStatusChange: (userId: string, shouldSuspend: boolean) => Promise<void>;
};

function UserProfileCard({ user, onStatusChange }: UserProfileCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  async function handleToggleSuspension() {
    setIsUpdating(true);
    try {
      // The feature component knows the domain rule; Button only reports the click.
      await onStatusChange(user.id, !user.isSuspended);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <Card
      header={<strong>{user.name}</strong>}
      footer={
        <Button
          variant={user.isSuspended ? 'primary' : 'danger'}
          disabled={isUpdating}
          onClick={handleToggleSuspension}
        >
          {isUpdating ? 'Saving…' : user.isSuspended ? 'Reactivate' : 'Suspend'}
        </Button>
      }
    >
      <p>Role: {user.role}</p>
      <p>Status: {user.isSuspended ? 'Suspended' : 'Active'}</p>
    </Card>
  );
}

function App() {
  const [user, setUser] = useState<User>({
    id: 'u-1',
    name: 'Asha',
    role: 'Editor',
    isSuspended: false,
  });

  async function saveStatus(userId: string, shouldSuspend: boolean) {
    // A real app would call its API here. This delay makes the loading state visible.
    await new Promise((resolve) => setTimeout(resolve, 300));
    setUser((current) =>
      current.id === userId ? { ...current, isSuspended: shouldSuspend } : current,
    );
  }

  return <UserProfileCard user={user} onStatusChange={saveStatus} />;
}

createRoot(document.getElementById('root')!).render(<App />);
```

The important boundary is not the number of files. `Button` owns generic button behavior, `Card` owns a visual frame and slots, `UserProfileCard` owns the user-specific action, and `App` owns the user record. The callback crosses those boundaries without leaking the record into the primitive.

This small example makes the render-snapshot rule visible. Each click handler belongs to the render that created it, so it logs the `count` captured by that snapshot. The functional update is still the safe way to calculate the next state when several updates may be queued.

```tsx
import { useState } from 'react';

export function SnapshotDemo() {
  const [count, setCount] = useState(0);

  function handleClick() {
    // This handler captures count from the render that created it.
    console.log('clicked snapshot:', count);
    setCount((current) => current + 1);
    setCount((current) => current + 1);
  }

  return <button onClick={handleClick}>Count: {count}</button>;
}
```

The following examples show the two boundaries that are easy to confuse with render logic. The event handler performs the user-requested action immediately. The effect synchronizes the committed `title` value with the browser's document after the render that displays it.

```tsx
import { useEffect, useState } from 'react';

export function DocumentTitleDemo() {
  const [title, setTitle] = useState('Inbox');

  useEffect(() => {
    // React has committed the matching UI before this external sync runs.
    const previousTitle = document.title;
    document.title = `${title} · Mail`;

    return () => {
      // Restore the external system if this component leaves the tree.
      document.title = previousTitle;
    };
  }, [title]);

  function handleRename() {
    // This is caused by the click, so it belongs in the event handler.
    setTitle((current) => (current === 'Inbox' ? 'Starred' : 'Inbox'));
  }

  return <button onClick={handleRename}>Open {title}</button>;
}
```

Context moves ownership to the Provider and makes the consumer's dependency explicit at the point of use. This focused example has separate state and dispatch contexts: a badge subscribes to the changing state, while the button subscribes only to the stable dispatch function. A state update rerenders the badge, but it does not notify the dispatch-only consumer because the dispatch context value remains the same reference.

```tsx
import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark';
type Action = { type: 'toggle' };

const ThemeStateContext = createContext<Theme | null>(null);
const ThemeDispatchContext = createContext<Dispatch<Action> | null>(null);

function themeReducer(theme: Theme, action: Action): Theme {
  return action.type === 'toggle' ? (theme === 'light' ? 'dark' : 'light') : theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, dispatch] = useReducer(themeReducer, 'light');

  // The Provider owns the state and defines the value boundaries.
  return (
    <ThemeDispatchContext.Provider value={dispatch}>
      <ThemeStateContext.Provider value={theme}>
        {children}
      </ThemeStateContext.Provider>
    </ThemeDispatchContext.Provider>
  );
}

export function ThemeBadge() {
  const theme = useContext(ThemeStateContext);
  if (theme === null) throw new Error('ThemeBadge needs ThemeProvider');
  return <span>Theme: {theme}</span>;
}

export function ToggleThemeButton() {
  const dispatch = useContext(ThemeDispatchContext);
  if (dispatch === null) throw new Error('ToggleThemeButton needs ThemeProvider');
  return <button onClick={() => dispatch({ type: 'toggle' })}>Toggle theme</button>;
}
```

`<ThemeProvider><ThemeBadge /><ToggleThemeButton /></ThemeProvider>` gives both consumers access without passing props through layouts. The Provider is the owner, `ThemeStateContext` is the changing value boundary, and `ThemeDispatchContext` is the stable action boundary. With one combined object such as `{ theme, dispatch }`, any new object reference would notify both kinds of consumers whenever the theme changed.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is component-based architecture in React, and how does it differ from traditional MVC?**

MVC commonly separates code into technical layers: model, view, and controller. A single feature may therefore require coordinated edits across a template, controller, and model. React components organize a UI unit around a responsibility and its boundary: JSX, local state, event handlers, and prop types can live together, while larger components compose smaller ones. React does not eliminate models or controllers; it changes the primary unit of UI organization from a page-wide layer to a tree of cooperating components.

**Q: How do you choose a component boundary?**

Look for a distinct responsibility, a state-ownership boundary, a repeated interaction, or a subtree that changes independently. A component should have a clear reason to change and a small contract. Do not extract solely because a file reached an arbitrary line count. If a fragment has no independent meaning, state, reuse, or test value, keeping it local may be clearer.

**Q: What is the difference between a design-system primitive and a domain component?**

A primitive accepts generic concerns such as `variant`, `disabled`, `children`, and `onClick`; it should not fetch users or check invoice permissions. A domain component understands a business entity or workflow, such as suspension or checkout, and composes primitives to express that behavior. The primitive is reusable because it knows little; the domain component is useful because it knows enough.

**Q: What makes a component truly reusable?**

Reuse comes from a small, predictable API and composition. A component is falsely reusable when it collects unrelated flags such as `isInvoice`, `showAdminActions`, `compact`, and `withAvatar`, then branches through every combination. That API hides several components inside one conditional maze. Prefer generic props and slots when callers need to vary content; split the component when the behaviors genuinely diverge.

**Q: How does composition help with prop drilling?**

Prop drilling is not every prop passed through a parent; it is usually an intermediate component carrying data it does not use merely to reach a descendant. If the page already knows the user, it can compose `<Sidebar><Avatar src={user.avatarUrl} /></Sidebar>` and pass that result through a layout's `children` or `sidebar` slot. The layout only arranges content. For genuinely shared state across distant branches, composition is not the only answer; context or an external store may be more appropriate.

**Q: Does making more components automatically improve performance?**

No. Components create useful ownership and testing boundaries, but a parent render can still cause child functions to run. Actual DOM work is determined during reconciliation, and render skipping requires appropriate techniques such as stable props, `memo`, or a better state boundary. First design clear ownership; measure before adding memoization, because unstable object and callback props can erase its benefit.

**Q: What does it mean that a render is a snapshot, and how do closures fit in?**

Each invocation of a function component receives one point-in-time set of props and state and returns the UI for that snapshot. Event handlers created during that invocation close over its variables, so an older handler can log an older state value even after a newer render has appeared. A state setter requests a new render; it does not mutate the local variable inside an already-created handler. Use functional state updates when the next value depends on the previous queued value.

**Q: When should you use `useEffect` in a component architecture?**

Use it to synchronize a committed render with an external system: subscribe to a browser or library event source, connect to a WebSocket, update `document.title`, or control an imperative widget. React runs the setup after commit and runs cleanup before resynchronizing or unmounting. Do not use it to calculate a value from props/state—that belongs in render—or to react to a click—that belongs in the event handler. The dependency list describes which external synchronization inputs changed; it is not a command to run arbitrary code after a render.

**Q: How do `createContext` and `useContext` work, and what rerenders when the value changes?**

`createContext(defaultValue)` creates the channel, a Provider owns and supplies its current `value`, and `useContext` reads the nearest matching Provider above the calling component. The default is used only when no Provider is present; it is not a shared mutable store. When the Provider's value changes by identity, React schedules all consumers of that context to read the new value, even if a consumer is wrapped in `memo`. Keep the value boundary focused—split state from stable dispatch or unrelated domains into separate contexts when their update frequencies and consumers differ. Context removes intermediate prop forwarding, but it does not remove the need for a deliberate owner.

**Q: Why do keys matter to component architecture?**

Keys describe identity among siblings. A stable record ID lets React preserve the right component instance when a list changes. An index key can make an input or local state appear to move to a different record after insertion or sorting. Keys should represent the business identity of the item, not merely its current position.

## 6. The Traps — What Goes Wrong

**Trap: The “God Component.”** A single `DataCard` with fifteen booleans appears reusable, but its combinations create hidden coupling and rising cyclomatic complexity. An invoice change can break a profile variant because both share branches. Keep stable primitives small and compose feature-specific arrangements at the call site.

**Trap: Premature extraction.** Extracting `TableWithSearchAndPagination` after the first table assumes future tables share its behavior. The second table may need infinite scrolling and the third expandable rows, forcing unrelated options into the abstraction. Duplicate local code is often cheaper than a wrong shared boundary; extract after repeated examples reveal a real common contract.

**Trap: Business logic inside a primitive.** This is a misleading “reusable” button:

```tsx
// Wrong boundary: this generic-looking control knows auth, API, and item identity.
function DeleteButton({ itemId }: { itemId: string }) {
  const { user } = useAuth();
  if (!user.permissions.includes('DELETE_ITEM')) return null;
  return <button onClick={() => api.delete(itemId)}>Delete</button>;
}
```

The code is a contextual fragment: `useAuth` and `api` are intentionally not defined here. In a real feature, a domain parent should calculate permission and deletion behavior, then pass `disabled` and `onClick` to a generic `Button`. That keeps authorization policy and network behavior testable at the right boundary.

**Trap: Mutating props.** A child must not write `user.isSuspended = true` or mutate an array received from its parent. Mutation bypasses the owner's state transition and can leave React with an unchanged reference, making updates difficult to reason about. Report intent through a callback; let the owner create the next object or array.

**Trap: Confusing component boundaries with render isolation.** Splitting a page into ten components does not guarantee ten isolated renders. React may call descendants again as it calculates a tree. Use state placement, stable keys, and measured memoization when performance requires it; do not use component count as a performance metric.

**Trap: Micro-fragmentation.** Turning a five-line title wrapper into its own file can make a simple UI harder to read. Extract when the piece has independent state, meaningful reuse, complex logic, or a useful test boundary. Keep tightly coupled static markup together.

## 7. Compare With Related Concepts

| Comparison | Key difference | One-line rule |
| --- | --- | --- |
| React component vs. plain JavaScript function | A component returns a UI description and participates in React rendering; a plain function computes data or performs a non-UI operation. | Use a component for UI ownership; use a function for transformations and domain calculations. |
| Composition vs. inheritance | Composition assembles objects through `children`, slots, and props; inheritance extends a base class and couples behavior to that hierarchy. | Prefer composition when the UI needs flexible combinations. |
| UI primitive vs. domain component | A primitive is domain-agnostic; a domain component understands entities, workflows, and business rules. | Keep policy in the domain layer and generic interaction in the primitive. |
| Presentational vs. container component | A presentational component mainly renders supplied data; a container coordinates data fetching, stores, routes, and page states. | Put coordination at a route or feature boundary, then feed focused visual components. |
| Props vs. context | Props make a direct dependency explicit; context avoids threading a value through every intermediate component. | Use props for local, visible relationships; use context for a genuinely shared ambient dependency. |
| Component boundary vs. module boundary | A component boundary organizes runtime UI ownership; a module/file boundary organizes source code. | Choose the runtime responsibility first, then decide whether a separate file improves navigation. |

## 8. 🧠 The Memory Hook — What Sticks

Think of React components as modular hi-fi units: each one has a focused job, a standard input cable called props, and private controls called state. Build the rack through composition, and let the component that owns the business decision send the signal; generic units should never guess what the song means.
