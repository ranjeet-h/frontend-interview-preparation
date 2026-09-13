# Conditional Rendering in React

## 1. Why This Exists — The Problem First

Every web application faces unpredictable runtime conditions: network latency, network errors, empty database queries, unauthenticated sessions, and fine-grained permission flags. Without conditional rendering, components assume data is always present, leading directly to production crashes like `TypeError: Cannot read properties of undefined (reading 'name')` when accessing user profiles before API responses arrive.

Even when code doesn't crash, poor conditional handling creates broken visual experiences. A developer writes `{items.length && <ProductList items={items} />}` thinking it renders nothing when empty, but the browser displays a stray `0` directly on the screen. Another developer uses four independent boolean flags (`isLoading`, `isError`, `isSuccess`, `isEmpty`), creating 16 theoretical combinations where a user might see both a loading spinner and an error banner simultaneously while background layout shifts cause severe visual flicker.

Conditional rendering is the architectural pattern of driving your entire visual interface deterministically from state snapshots. Instead of manually mutating DOM nodes when conditions change, your component returns a completely predictable tree of UI elements for each distinct state.

## 2. The Analogy — Make It Obvious

Think of conditional rendering like a **theater stage manager operating live scene backdrops**:

- **The State Snapshot is the Script Cue:** The script dictates what is currently happening—`Scene 1: Dark Dungeon`, `Scene 2: Castle Courtyard`, or `Intermission`.
- **The Early Return is the Emergency Curtain:** If an actor sprains an ankle (an error state) or props aren't set yet (a loading state), the stage manager drops an immediate safety curtain before anyone sees the half-built set.
- **Mounting and Unmounting is Swapping Physical Sets:** When switching from the Dungeon to the Castle, stagehands completely strike the Dungeon set, unplug its lighting, and wheel in the Castle. Any props left on the Dungeon set are hauled off to storage and reset to default.
- **Tree Position and Identity is Keeping the Same Actor in Costume:** If the script calls for an actor standing at center stage to switch from a red hat to a blue hat (`<Actor hat="red" />` to `<Actor hat="blue" />`), the stage manager doesn't fire the actor and hire a new one. The same actor stays on their mark at center stage and simply swaps hats. Their internal memory and makeup stay intact. But if the script replaces the actor with a completely different performer (`<Dog />`), the actor leaves the stage and all their active state vanishes.

In React, the component function is the stage manager calculating which set pieces and actors belong on stage for the current moment in time.

## 3. How It Actually Works — The Full Explanation

In React, JSX is syntactic sugar for `React.createElement` (or the modern JSX runtime `_jsx`). JSX creates React elements: plain JavaScript descriptions of the UI. Reconciliation then compares those elements with the previous ones and schedules Fiber work; a React element is not itself a Fiber node. Because JSX compiles down to standard JavaScript function calls and objects, React does not need custom templating syntax like `*ngIf` or `v-if`. Any standard JavaScript control flow mechanism—`if/else`, ternary expressions, logical operators, `switch` statements, or object lookup tables—executes during the component render phase to produce the next element tree.

**Core rendering patterns.**

**Early return guard clauses.**
When a component cannot or should not render its primary UI due to prerequisites (such as loading spinners, network errors, or missing authentication), the function exits early:

This is a contextual fragment: it assumes `status`, `data`, `Spinner`, `ErrorMessage`, `error`, `EmptyPlaceholder`, and `MainContent` are defined by the surrounding component.

```tsx
if (status === 'loading') return <Spinner />;
if (status === 'error') return <ErrorMessage error={error} />;
if (data.length === 0) return <EmptyPlaceholder />;
return <MainContent data={data} />;
```

This flattens component architecture, eliminating nested indentation and making guard logic readable from top to bottom.

**Inline ternary operators (`condition ? <A /> : <B />`).**
Ternaries handle mutually exclusive binary branches inside JSX expressions where an `if` statement cannot be placed inline:

This is a contextual fragment: it assumes `isSubmitting` is a boolean and `Spinner` is an available component.

```tsx
<button className={isSubmitting ? 'opacity-50' : 'opacity-100'}>
  {isSubmitting ? <Spinner /> : 'Save Changes'}
</button>
```

**Short-circuit logical operators (`condition && <Element />` / `condition || <Fallback />`).**
JavaScript's `&&` evaluates left-to-right, returning the first falsy operand or the last truthy operand. React interprets `false`, `null`, and `undefined` as instructions to render nothing. A numeric `0` is different: `0 && <Badge />` evaluates to `0`, and React renders that number as text. An empty string is also falsy, but React treats `""` as empty text and does not create a visible blank or text leak.

This is a contextual fragment: it assumes `items`, `user`, `List`, and `Profile` are defined by the surrounding component.

To use `&&` safely, ensure the left operand is strictly boolean: `items.length > 0 && <List />` or `Boolean(user) && <Profile />`.

**Record / map lookup tables for multi-state machines.**
When a UI transitions between three or more states, chaining nested ternaries causes unreadable code. An explicit lookup object or switch statement maps status keys directly to their respective view components:

This is a contextual fragment: it assumes `TabState`, `OverviewTab`, `AnalyticsTab`, `SettingsTab`, and `FallbackTab` are defined by the surrounding feature.

```tsx
const VIEW_MAP: Record<TabState, React.ComponentType> = {
  overview: OverviewTab,
  analytics: AnalyticsTab,
  settings: SettingsTab,
};

function TabContainer({ activeTab }: { activeTab: TabState }) {
  const ActiveView = VIEW_MAP[activeTab] ?? FallbackTab;
  return <ActiveView />;
}
```

**Reconciliation, mounting, and state destruction.**

React's reconciliation engine compares element `type`, position among siblings, and `key` when present. When conditional rendering changes the returned element tree between renders, React applies identity rules to decide which existing Fiber work can be updated and which must be removed or created:

**Falsy node handling.**
When an element expression evaluates to `null`, `undefined`, `false`, or `true`, React renders no node for that value. The surrounding tree can still contain other siblings; this does not mean React preserves a component instance that was removed.

**Same type at the same position (preserved state).**
When a condition changes props on the same component type at the exact same tree location:

This is a contextual fragment: it assumes `isVIP` is a boolean and `ProfileCard` is a defined component.

```tsx
// Render 1
<div>{isVIP ? <ProfileCard badge="gold" /> : <ProfileCard badge="silver" />}</div>
```

React compares the element at that sibling position. The element type is `ProfileCard` on both renders. React does not unmount the component; it retains the existing Fiber node, keeps all internal `useState` and `useRef` values, and triggers a re-render with updated props.

**Different type at the same position (state destroyed).**
When a condition returns a different component or HTML tag at that tree location:

This is a contextual fragment: it assumes `isAdmin` is a boolean and both dashboard components are defined.

```tsx
// Render 1: <AdminDashboard /> -> Render 2: <UserDashboard />
<div>{isAdmin ? <AdminDashboard /> : <UserDashboard />}</div>
```

React sees that the element type changed from `AdminDashboard` to `UserDashboard`. It completely unmounts `AdminDashboard`, runs all `useEffect` cleanup functions, deletes its entire subtree and internal state from memory, and mounts `UserDashboard` with fresh initial state.

**Explicit state resets with keys.**
If two branches render the same component type but represent fundamentally distinct entities whose internal state should never leak across transitions, assign unique `key` props:

This is a contextual fragment: it assumes `isEditingProfile`, `profileData`, `settingsData`, and `Form` are defined.

```tsx
{isEditingProfile ? (
  <Form key="profile-form" initialData={profileData} />
) : (
  <Form key="settings-form" initialData={settingsData} />
)}
```

Because the `key` changes, React treats them as two distinct elements, destroying the old form's uncommitted draft state and initializing the new form cleanly.

**Discriminated unions for impossible states.**

Managing asynchronous lifecycle with scattered booleans leads to invalid UI states:

This is a contextual fragment: it assumes `useState` is imported and `User` is a domain type declared elsewhere.

```tsx
// Antipattern: 8 possible permutations (e.g. isLoading=true AND isError=true)
const [isLoading, setIsLoading] = useState(false);
const [isError, setIsError] = useState(false);
const [data, setData] = useState<User[] | null>(null);
```

Modeling state as a TypeScript discriminated union gives TypeScript compile-time narrowing. It does not validate untrusted runtime data or guarantee that a JavaScript value actually matches the union unless a runtime parser or validator checks it:

```tsx
type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User[] }
  | { status: 'error'; error: Error };
```

TypeScript narrows the type in each conditional branch, ensuring `data` cannot be accessed during loading and `error` cannot be accessed during success.

**Effects and Strict Mode boundaries.** Rendering should remain a pure calculation: it reads the current state and returns elements. Event handlers are where user actions cause updates. An Effect is for synchronizing with something outside React—such as a subscription, timer, browser API, or network connection—not for deriving JSX or handling a click that can be handled directly in an event handler. When an Effect has dependencies, React runs its cleanup before the next setup whose dependencies changed, and it runs cleanup when the component is removed. In development, `<StrictMode>` intentionally performs an extra setup-cleanup cycle for Effects on initial mount, and may call render logic more than once, to expose impure code; this is a development check, not a claim that production mounts twice.

## 4. Real Code — See It Working

Here is a complete, production-grade implementation demonstrating early returns, discriminated unions, safe logical short-circuits, key-based state resets, and map-driven views:

```tsx
import React, { useState } from 'react';

interface Project {
  id: string;
  name: string;
  taskCount: number;
}

// 1. Discriminated union modeling all mutual lifecycle states
type AsyncData<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T };

interface ProjectListProps {
  projectState: AsyncData<Project[]>;
  onRetry: () => void;
}

export function ProjectManager({ projectState, onRetry }: ProjectListProps) {
  const [activeView, setActiveView] = useState<'grid' | 'table'>('grid');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Early Return 1: Loading state
  if (projectState.status === 'loading') {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <span className="animate-spin mr-2">⏳</span> Loading projects...
      </div>
    );
  }

  // Early Return 2: Error state with retry callback
  if (projectState.status === 'error') {
    return (
      <div className="rounded-md bg-red-50 p-4 text-red-800">
        <p className="font-semibold">Failed to load projects</p>
        <p className="text-sm">{projectState.message}</p>
        <button
          onClick={onRetry}
          className="mt-3 rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Early Return 3: Empty dataset state (data is safely narrowed to Project[])
  const projects = projectState.data;
  if (projects.length === 0) {
    return (
      <div className="text-center p-8 border-2 border-dashed rounded-lg">
        <h3 className="text-lg font-medium text-slate-700">No projects found</h3>
        <p className="text-sm text-slate-500">Create your first project to get started.</p>
      </div>
    );
  }

  // Main UI: Rendered only when data exists and is valid
  return (
    <div className="space-y-6">
      {/* Header with safe numeric short-circuiting */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          Active Projects
          {/* Safe boolean check prevents rendering '0' when empty */}
          {projects.length > 0 && (
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              {projects.length}
            </span>
          )}
        </h2>

        {/* Binary toggle using clean inline ternary */}
        <button
          onClick={() => setActiveView(prev => (prev === 'grid' ? 'table' : 'grid'))}
          className="text-sm text-slate-600 hover:text-slate-900 font-medium"
        >
          Switch to {activeView === 'grid' ? 'Table View' : 'Grid View'}
        </button>
      </div>

      {/* Conditional rendering with key-driven isolation */}
      {activeView === 'grid' ? (
        <div className="grid grid-cols-3 gap-4">
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => setSelectedProjectId(project.id)}
              className="p-4 border rounded shadow-sm hover:border-blue-500 cursor-pointer"
            >
              <h4 className="font-semibold">{project.name}</h4>
              <p className="text-xs text-slate-500">{project.taskCount} tasks</p>
            </div>
          ))}
        </div>
      ) : (
        <table className="w-full border-collapse border border-slate-200">
          <thead>
            <tr className="bg-slate-50 text-left text-sm">
              <th className="p-2 border">Project Name</th>
              <th className="p-2 border">Open Tasks</th>
            </tr>
          </thead>
          <tbody>
            {projects.map(project => (
              <tr key={project.id} className="hover:bg-slate-50">
                <td className="p-2 border">{project.name}</td>
                <td className="p-2 border">{project.taskCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Distinct key forces state reset when changing selected entity */}
      {selectedProjectId && (
        <ProjectEditorModal
          key={selectedProjectId}
          projectId={selectedProjectId}
          onClose={() => setSelectedProjectId(null)}
        />
      )}
    </div>
  );
}

function ProjectEditorModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [draftNotes, setDraftNotes] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded p-6 max-w-md w-full">
        <h3 className="font-bold">Edit Project #{projectId}</h3>
        <textarea
          value={draftNotes}
          onChange={e => setDraftNotes(e.target.value)}
          placeholder="Type project notes..."
          className="w-full border p-2 mt-2 rounded"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 text-sm border rounded">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does conditional rendering work in React compared to template-based frameworks like Angular or Vue?**

In template-based frameworks (like Angular with `*ngIf` or Vue with `v-if`), conditional rendering is handled by a specialized template compiler that parses custom HTML directives into DOM-manipulation instructions. In React, JSX is not a template language—it compiles directly into JavaScript `React.createElement` or `_jsx` calls.

Because component rendering is simply JavaScript execution, you have full access to native control structures (`if/else`, ternaries, logical short-circuits, `switch` blocks, and object lookups). During the render phase, React runs your component function, evaluates these JavaScript expressions, and receives an immutable object tree describing the desired UI. React then reconciles this new tree with the previous fiber tree to compute the minimal set of real DOM mutations.

**Q: Why does `{count && <Badge />}` render the number `0` when `count === 0`, and what are the standard fixes?**

This occurs because of JavaScript's logical AND (`&&`) evaluation rules combined with React's JSX rendering behavior. JavaScript's `&&` operator evaluates expressions left to right. When the left operand is falsy, JavaScript short-circuits and returns the exact value of the left operand—not a boolean `false`.

When `count` is `0`, the expression `0 && <Badge />` evaluates directly to the number `0`. In React, booleans (`false`, `true`), `null`, `undefined`, and an empty string render no visible content. Numbers and non-empty strings are valid renderable values, so React converts the returned `0` into a text node and renders it to the screen.

The three production fixes are:
1. **Explicit boolean conversion:** `{Boolean(count) && <Badge />}`
2. **Strict comparison:** `{count > 0 && <Badge />}`
3. **Explicit ternary:** `{count ? <Badge /> : null}`

**Q: What happens to a component's internal state when it is conditionally unmounted and remounted?**

When a component is conditionally removed from the element tree (for example, switching from `<Editor />` to `null` via an early return or ternary), React unmounts that Fiber node. During unmounting, React:
1. Executes all cleanup functions from active `useEffect` and `useLayoutEffect` hooks.
2. Removes all associated DOM nodes from the document.
3. Completely destroys the Fiber node and discards its hook state list (`useState`, `useRef`, `useReducer`).

When the condition later flips back to true and `<Editor />` returns to the tree, React creates a brand-new Fiber node. The component executes its initialization lifecycle from scratch, resetting all `useState` variables to their initial arguments. If you need state to persist across visibility toggles, lift that state up to a parent component, store it in an external cache/store, or hide the element visually using CSS (`display: none`).

This is a contextual fragment: it assumes `Editor` is a defined component and that its effects have cleanup functions where external resources need releasing.

**Q: How does React decide whether to preserve or reset state when switching between two branches of a ternary?**

React determines whether to preserve or reset state by inspecting the **element type** and the element's **position among its siblings**. A `key` refines sibling identity; an array index is only one possible key value (often an unsafe one when items reorder):

1. **Different element type at the same position:**
   `{isAdmin ? <AdminPanel /> : <UserPanel />}`
   The type changes from `AdminPanel` to `UserPanel`. React tears down the old component tree, discards its state, and mounts the new component fresh.

2. **Same element type at the same position:**
   `{isPersonal ? <AccountForm type="personal" /> : <AccountForm type="business" />}`
   The element type is `AccountForm` in both branches. React assumes it is updating the existing instance, preserves the Fiber node and all internal state (like dirty form inputs), and only delivers the updated `type` prop.

3. **Same element type with explicit keys:**
   `{isPersonal ? <AccountForm key="personal" /> : <AccountForm key="business" />}`
   Because the `key` attribute differs, React recognizes them as two distinct entities. It unmounts the old instance and mounts a fresh instance with clean state.

**Q: What are the architectural trade-offs between conditionally unmounting a component versus hiding it with CSS (`display: none`)?**

- **Conditional Unmounting (`{isOpen && <Modal />}`):**
  - *Pros:* Conserves browser memory and CPU by destroying inactive DOM nodes; unmounting invokes each Effect's returned cleanup, which can stop timers and subscriptions when it correctly calls APIs such as `clearInterval`, `unsubscribe`, or `abort`. Unmounting alone does not magically stop an underlying resource, so missing or incorrect cleanup can still leak.
  - *Cons:* Incurs mount/unmount overhead (creating DOM nodes, running layout effects) whenever toggled. State is completely reset unless lifted to a parent.
  - *When to use:* Modals, heavy dashboards, large lists, or features accessed infrequently.

- **CSS Visibility (`<div style={{ display: isOpen ? 'block' : 'none' }}>`):**
  - *Pros:* Instantaneous visual toggle without DOM creation overhead. Preserves internal component state, scroll positions, and uncommitted form inputs.
  - *Cons:* Inactive components stay in the DOM tree, consuming memory. Child `useEffect` hooks, event listeners, and polling intervals continue running in the background unless explicitly gated.
  - *When to use:* Tabbed interfaces, media players that must retain playback state, or frequently toggled tooltips.

**Q: Why are TypeScript discriminated unions preferred over multiple boolean flags for asynchronous UI states?**

Using independent boolean flags (such as `const [isLoading, setIsLoading] = useState(false)` and `const [isError, setIsError] = useState(false)`) permits $2^N$ possible states, including invalid and impossible combinations like `isLoading: true` and `isError: true` simultaneously. This forces defensive conditional checks in your JSX and frequently causes UI bugs like error banners showing behind loading skeletons.

A discriminated union models async status as mutually exclusive objects tagged with a common discriminant field:

This is a contextual fragment: it assumes `User` is a domain type declared elsewhere.

```tsx
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
```

The union describes the states that well-typed application code is allowed to construct. Inside conditional blocks (`if (state.status === 'success')`), TypeScript's control flow analysis narrows the type, providing type-safe access to `state.data`. This is static checking, not runtime validation: API responses or casts can still contain invalid values, so validate untrusted input at the boundary.

## 6. The Traps — What Goes Wrong

**Trap 1: The Falsy Number and Empty String Leak**
- *The Mistake:* Writing `{notifications.length && <Badge count={notifications.length} />}` or `{user.nickname && <span>{user.nickname}</span>}`.
- *Why It Breaks:* In JavaScript, `0 && <Component />` evaluates to `0`, and React renders that number as visible text. `"" && <Component />` evaluates to the empty string, which React renders as no visible content; it does not create a visible blank or text leak.
- *The Fix:* Always cast to a boolean: `{notifications.length > 0 && <Badge />}` or `{Boolean(user.nickname) && <span>{user.nickname}</span>}`.

This is a contextual fragment: it assumes `notifications`, `user`, `Badge`, and React rendering are supplied by the surrounding component.

**Trap 2: Violating the Rules of Hooks with Conditional Early Returns**
- *The Mistake:* Placing a hook call after a conditional early return:
  ```tsx
  function UserProfile({ userId }: { userId: string | null }) {
    if (!userId) return <EmptyState />;
    // ❌ Error: Rendered fewer hooks than expected
    const [profile, setProfile] = useState<Profile | null>(null);
    useEffect(() => { /* fetch */ }, [userId]);
    return <div>{profile?.name}</div>;
  }
  ```
- *Why It Breaks:* React relies on the exact invocation order of hooks across renders to maintain internal state indices on the Fiber node. If an early return executes before all hooks are declared, hook counts differ between renders, corrupting internal fiber state and throwing a fatal runtime invariant error.
- *The Fix:* Always declare all hooks at the very top level of the component before any conditional early returns.

This is a contextual fragment: it assumes `EmptyState`, `Profile`, `useState`, and `useEffect` are imported or defined. The exact failure occurs when a later render reaches a different number or order of hook calls.

Strict Mode does not make conditional hooks valid. Its extra development checks can make impure render logic or missing Effect cleanup easier to notice, but event handlers and Effects remain separate from render-time branching.

**Trap 3: Accidental State Leakage Across Conditional Branches**
- *The Mistake:* Conditionally rendering the same component type for two distinct entities without keys:
  ```tsx
  // User switches from editing Alice to editing Bob
  {selectedUser.role === 'admin' ? (
    <UserForm initialRole="admin" />
  ) : (
    <UserForm initialRole="member" />
  )}
  ```
- *Why It Breaks:* Because both branches return `<UserForm />` at the same sibling position in the parent's JSX, React updates the existing component instance instead of remounting. Any dirty local input state typed into Alice's form remains inside Bob's form.
- *The Fix:* Add a unique `key` prop: `<UserForm key={selectedUser.id} />`.

This is a contextual fragment: it assumes `selectedUser` and `UserForm` are defined and that the two branches occupy the same sibling position.

**Trap 4: The Nested Ternary "Pyramid of Doom"**
- *The Mistake:* Nesting ternaries three or four levels deep inside JSX expressions:

  This is a contextual fragment: it assumes `isLoading`, `isError`, `data`, `Spinner`, `Error`, `List`, and `Empty` are defined.

  ```tsx
  return (
    <div>
      {isLoading ? <Spinner /> : isError ? <Error /> : data ? <List items={data} /> : <Empty />}
    </div>
  );
  ```
- *Why It Breaks:* Deeply nested ternaries are difficult to scan, easy to misread, and prone to edge-case bugs when additional states are introduced.
- *The Fix:* Extract edge cases into top-level early returns, or use a lookup table / sub-component if branching within an inline layout.

**Trap 5: Rendering Protected UI Before Auth Resolution**
- *The Mistake:* Checking `if (user.isAdmin)` when `user` is still `null` during initial session verification:
  ```tsx
  function AdminPage() {
    const { user } = useAuth(); // user is null while token validates
    if (!user.isAdmin) return <Navigate to="/unauthorized" />;
    return <AdminDashboard />;
  }
  ```
- *Why It Breaks:* The application flashes a false "Unauthorized" error or prematurely redirects the user to the login page for 100ms before the authentication token finishes validating.
- *The Fix:* Explicitly handle the pending authentication status: `if (authStatus === 'loading') return <AuthSkeleton />`.

This is a contextual fragment: it assumes `useAuth`, `Navigate`, `AuthSkeleton`, and `AdminDashboard` are defined by the application.

## 7. Compare With Related Concepts

| Concept | Primary Purpose | Lifecycle & DOM Impact | Rule of Thumb |
| :--- | :--- | :--- | :--- |
| **Conditional Rendering** | Returning different JSX structures based on runtime state snapshots. | React mounts, updates, or unmounts only the branches whose element identity and presence require it; removed subtrees lose their DOM and Fiber state. | Use for distinct application states (loading, error, empty), access control, and modal popups. |
| **Conditional CSS (`display: none`)** | Toggling visual visibility of elements already mounted in the DOM. | DOM nodes and component state remain fully intact in memory; effects continue running. | Use for tabs, accordions, and media players where state and scroll positions must persist. |
| **Client-Side Routing (`react-router`)** | Conditionally rendering route elements based on the browser URL path. | A route's page segment may unmount while a shared layout remains mounted when the route configuration keeps that layout at the same identity; other route changes can replace the layout too. | Use for top-level navigation, deep-linkable URLs, and screen transitions. |
| **`React.lazy` & Suspense** | Conditionally loading and rendering code-split component bundles on demand. | Defers script download until condition is triggered; renders fallback during network fetch. | Use for heavy, infrequently visited routes or complex widgets (e.g. rich text editors, charts). |

## 8. 🧠 The Memory Hook — What Sticks

React conditional rendering is not template magic—it is pure JavaScript executed against a state snapshot. JSX creates element descriptions, and reconciliation turns the comparison into Fiber work. If you return `0`, it prints `0`; if you remove or swap identities, React tears down the affected subtree; if you keep the same element type at the same sibling position, state survives unless a changed `key` deliberately gives it a new identity.
