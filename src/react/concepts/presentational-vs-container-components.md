# Presentational vs Container Components (Smart vs Dumb)

## 1. Why This Exists — The Problem First

Imagine building a sortable, paginated user table for an admin dashboard. You write a single 300-line React component: inside it, you call `fetch('/api/v2/users')`, read URL search params to synchronize pagination with `useSearchParams()`, pull the current auth token directly from a global Redux or Zustand store, and render the HTML `<table>` with custom CSS classes, loading spinners, and action buttons.

The component works on day one. Then production reality hits:

1. **Zero Reusability:** The billing team asks to display customer accounts using the exact same table design, column sorting, and pagination controls. But because your table has `/api/v2/users` hardcoded inside its body, you cannot reuse the markup. You either duplicate the 300 lines or hack in conditional API flags.
2. **Broken Design Workflows:** The design team wants to test the table in Storybook across various visual edge cases (empty states, 50-character names, mobile viewports). Storybook crashes instantly because there is no backend API server, no active Redux store, and no router context.
3. **Painful Testing:** To test whether clicking a column header toggles the sort arrow icon, your unit test must set up mock service workers (MSW), mock global state providers, configure memory routers, and wait for asynchronous network promises to settle. A five-line UI check turns into a 60-line test harness.
4. **High Regression Risk:** When the backend team renames an API response property from `user_id` to `id`, you must open the exact file containing your CSS flexbox layouts and responsive dropdown logic. An API tweak risks breaking the visual layout.

This friction happens when **how things look** (markup, styles, visual states) is tightly coupled to **how things work** (data fetching, business logic, store subscriptions, side effects). Separating presentation from data orchestration solves this immediately.

---

## 2. The Analogy — Make It Obvious

Think of a **high-end restaurant**:

```
[ Kitchen & Executive Chef ]  ──( Prepared Meal / Props )──▶  [ Waitstaff & Plating ]  ──▶  [ Diner / User ]
   • Sources raw ingredients                                     • Arranges food on china
   • Controls stoves & timers                                    • Handles silverware & napkins
   • Manages recipes & inventory                                 • Listens to guest feedback
   (Container / Smart)                                           (Presentational / Dumb)
```

- **The Kitchen & Executive Chef (The Container):** The kitchen sources raw ingredients from vendors (APIs), checks refrigerator inventory (cache/store), manages stove timers and prep work (side effects, state machines), and handles supply failures (if the salmon is spoiled, substitute sea bass). The kitchen does not care about table linens or background music. Its job is to turn raw ingredients into a clean, ready-to-serve meal.
- **The Waitstaff & Plating (The Presentational Component):** The waitstaff receives the prepared meal on a silver platter (props). They focus entirely on visual presentation, plate arrangement, and diner interactions. When the diner asks for water or sends a dish back (user clicks/events), the server catches the request and passes the message back to the kitchen (callbacks).
- **Why the separation matters:** You can switch food vendors from Local Farms to Ocean Catch (switch a REST API to GraphQL or local mock data), and the plated presentation at the table remains identical. Conversely, you can replace all the restaurant's plates and dining room decor (re-theme UI) without changing the kitchen's cooking recipes.

---

## 3. How It Actually Works — The Full Explanation

The Presentational vs. Container pattern divides UI development into two distinct layers of responsibility.

### The Two Layers of Responsibility

```
┌────────────────────────────────────────────────────────┐
│ CONTAINER LAYER ("Smart" / Orchestration)              │
│ - Fetches data (TanStack Query, SWR, fetch)            │
│ - Subscribes to global stores (Zustand, Redux)         │
│ - Reads router params (useParams, useSearchParams)     │
│ - Shapes raw API payloads into clean UI data shapes    │
│ - Passes data and event handlers down as props         │
└──────────────────────────┬─────────────────────────────┘
                           │ Props (Data & Callbacks)
                           ▼
┌────────────────────────────────────────────────────────┐
│ PRESENTATIONAL LAYER ("Dumb" / Visual)                 │
│ - Receives data and callbacks strictly via props       │
│ - Renders JSX markup, CSS, and layout styling          │
│ - Handles local UI state (accordion open, hover state) │
│ - No knowledge of APIs, databases, stores, or routes   │
│ - Pure, deterministic, and isolated                    │
└────────────────────────────────────────────────────────┘
```

#### 1. Presentational Components ("Dumb" / UI Components)
- **Primary concern:** How things look.
- **Inputs and Outputs:** Props in, JSX elements out.
- **Data dependencies:** They never import API clients, fetch utilities, global store selectors, or router hooks. If they need data, it must arrive through `props`.
- **State ownership:** They do not own business or domain state. However, they **can** own ephemeral, visual-only UI state—such as whether a dropdown menu is open, whether a tooltip is hovered, or which tab is highlighted.
- **Determinism:** Given the exact same props, a presentational component produces the exact same rendered output. This makes them trivial to test and drop into Storybook or component catalogs.

#### 2. Container Components ("Smart" / Orchestrator Components)
- **Primary concern:** How things work.
- **Responsibilities:** Managing network calls, caching, error boundaries, router coordination, global store reading/writing, and business calculations.
- **Markup:** Minimal. Containers rarely have custom CSS classes, layout wrappers beyond basic structural divs, or detailed HTML tags. They primarily render presentational child components and feed them props.
- **Data Transformation:** Containers act as a translation barrier. They receive raw backend data structures (DTOs), sanitize and reshape them into UI-friendly props, and pass them down. If the backend schema changes, only the container needs updating.

---

### The Evolution: From Class Wrappers to Custom Hooks

Understanding how this pattern evolved prevents dogmatic or outdated architectural decisions.

#### The 2015 Era: File-Level Component Pairs
When Dan Abramov popularized this pattern in the early days of React and Redux, React had a fundamental limitation: **only class components could hold state and lifecycle methods (`componentDidMount`)**, while function components were strictly stateless (`(props) => JSX`).

To separate logic from layout, developers created two physical files for every view:
1. `UserListContainer.jsx` (Class component fetching data in `componentDidMount` and rendering the child).
2. `UserList.jsx` (Stateless function component rendering `<ul>` and `<li>`).

This led to deep component nesting ("wrapper hell") in React DevTools and excessive boilerplate.

#### The Modern Era: Custom Hooks as Containers
With React 16.8+ (Hooks), function components can manage state, side effects, and context subscriptions directly.

This fundamentally changed how the pattern is implemented:
- The **Container Component** largely evolved into a **Custom Hook** (e.g., `useUserData()`).
- The logic (network calls, caching, state machines) lives in the hook.
- The UI (markup, styles, accessibility) lives in the component.

```tsx
// The modern expression of the Container/Presentational pattern:
function UsersPage() {
  // Custom hook acts as the Container / Data Orchestrator
  const { users, isLoading, error, deleteUser } = useUsers();

  // Presentational component receives clean props
  return (
    <UserTable
      users={users}
      isLoading={isLoading}
      errorMessage={error?.message}
      onDelete={deleteUser}
    />
  );
}
```

The separation of concerns did not disappear—it became cleaner. You get all the benefits of isolated UI components without arbitrary component wrapper hierarchies.

---

## 4. Real Code — See It Working

### The Anti-Pattern: Tightly Coupled God Component

Here is the coupled approach where networking, routing, store access, and table rendering are tangled together:

```tsx
// AntiPatternUserTable.tsx - Hard to test, impossible to reuse
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function AntiPatternUserTable() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const page = Number(searchParams.get('page')) || 1;

  useEffect(() => {
    // Tightly coupled to a specific URL endpoint and auth mechanism
    fetch(`/api/v2/users?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((json) => {
        setData(json.items);
        setLoading(false);
      });
  }, [page, token]);

  if (loading) return <div className="spinner">Loading users...</div>;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {data.map((user) => (
            <tr key={user.id}>
              <td>{user.full_name}</td>
              <td>{user.email_address}</td>
              <td><span className="badge">{user.role_name}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => setSearchParams({ page: String(page + 1) })}>
        Next Page
      </button>
    </div>
  );
}
```

---

### The Refactored Pattern: Clean Separation

#### Step 1: The Presentational Component (Pure UI)

This component knows nothing about network requests, URLs, or authentication. It accepts typed props and renders UI.

```tsx
// components/UserTable.tsx
import React from 'react';

export interface UserRowViewModel {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface UserTableProps {
  users: UserRowViewModel[];
  isLoading: boolean;
  currentPage: number;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export function UserTable({
  users,
  isLoading,
  currentPage,
  onNextPage,
  onPrevPage,
}: UserTableProps) {
  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading user records...</div>;
  }

  if (users.length === 0) {
    return <div className="p-8 text-center text-gray-500">No users found.</div>;
  }

  return (
    <div className="rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white text-sm text-gray-800">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{user.name}</td>
              <td className="px-4 py-3 text-gray-500">{user.email}</td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {user.role}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination controls emit callbacks instead of mutating router directly */}
      <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={onPrevPage}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-gray-600">Page {currentPage}</span>
        <button
          type="button"
          onClick={onNextPage}
          className="rounded border px-3 py-1 text-sm"
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

#### Step 2: The Orchestration Hook (Container Logic)

All side effects, routing, caching, and data reshaping are encapsulated inside a custom hook:

```tsx
// hooks/useUsersList.ts
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UserRowViewModel } from '../components/UserTable';

interface RawApiUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email_address: string;
  role_name: string;
}

export function useUsersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const query = useQuery({
    queryKey: ['users', page],
    queryFn: async (): Promise<UserRowViewModel[]> => {
      const res = await fetch(`/api/v2/users?page=${page}`);
      if (!res.ok) throw new Error('Failed to fetch users');
      const data: { items: RawApiUser[] } = await res.json();

      // Transform raw backend DTO into clean View Model
      return data.items.map((item) => ({
        id: item.user_id,
        name: `${item.first_name} ${item.last_name}`.trim(),
        email: item.email_address,
        role: item.role_name,
      }));
    },
  });

  const goToNextPage = () => setSearchParams({ page: String(page + 1) });
  const goToPrevPage = () => setSearchParams({ page: String(Math.max(1, page - 1)) });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    currentPage: page,
    goToNextPage,
    goToPrevPage,
  };
}
```

#### Step 3: The Route / Container Component

The route component serves as the glue, wiring the container logic to the presentational component:

```tsx
// pages/UsersPage.tsx
import { useUsersList } from '../hooks/useUsersList';
import { UserTable } from '../components/UserTable';

export function UsersPage() {
  const {
    users,
    isLoading,
    isError,
    errorMessage,
    currentPage,
    goToNextPage,
    goToPrevPage,
  } = useUsersList();

  if (isError) {
    return <div className="rounded bg-red-50 p-4 text-red-700">{errorMessage}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">User Management</h1>
      <UserTable
        users={users}
        isLoading={isLoading}
        currentPage={currentPage}
        onNextPage={goToNextPage}
        onPrevPage={goToPrevPage}
      />
    </div>
  );
}
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental distinction between presentational and container components?**

Presentational components govern how things look; container components govern how things work.

Presentational components receive data and callbacks exclusively through props and return JSX. They do not initiate network requests, read route parameters, or subscribe to global state stores. They are deterministic and pure with respect to their props.

Container components orchestrate side effects: data fetching, caching, error states, route management, and state mutations. They shape raw data into clean view models and pass that data down to presentational components.

---

**Q: Can a presentational component hold internal state, or must it be completely stateless?**

Presentational components can hold internal state, provided that state is purely local and visual.

The misconception is equating "presentational" with "stateless". A presentational component should not manage business or domain state (e.g., user profiles, cart items, authentication tokens). However, it frequently manages visual interaction state:
- Whether an accordion section is collapsed or expanded.
- Whether a custom dropdown menu is open.
- Which tab is visually active in a tab bar.
- Ephemeral hover, focus, or tooltip animations.

These state values dictate visual presentation, not application business rules.

---

**Q: Dan Abramov wrote an update saying he no longer promotes this pattern. Does that mean we should not use it?**

No. Dan Abramov clarified that he no longer promotes the rigid practice of splitting every UI feature into two physical wrapper components (`ThingContainer.jsx` wrapping `Thing.jsx`).

Before Hooks in React 16.8, class components were the only way to hold state and lifecycle methods, making wrapper components necessary to keep presentation functions pure. With React Hooks, stateful logic can be encapsulated inside Custom Hooks (`useThing()`) instead of wrapper components.

The underlying principle—**Separation of Concerns between data orchestration and UI rendering**—remains a fundamental pillar of scalable frontend architecture. Hooks changed the implementation mechanism, not the architectural goal.

---

**Q: Where should data fetching and route parameters live in a clean React architecture?**

Data fetching and route parameters should live at the boundary: in page-level route components, container components, or dedicated custom hooks.

They should never live inside reusable UI components (like buttons, modals, cards, or tables). If a shared `<UserProfileCard />` component directly calls `useParams()` or `fetch('/api/user')`, it cannot be rendered inside a preview popover, a search results dropdown, or a test environment without setting up fake routes and network mocks. Keeping shared UI dependent only on props ensures maximum portability.

---

**Q: How does this pattern improve unit testing and Storybook development?**

It decouples visual testing from infrastructure testing:

1. **For Presentational Components:** You test UI rendering, accessibility, and user events using simple props without mocking `fetch`, setting up Redux store providers, or configuring `MemoryRouter`. Tests run in milliseconds in jsdom and are completely deterministic. In Storybook, you can render empty states, loading states, error states, and populated states simply by passing different mock prop objects.
2. **For Container Hooks / Logic:** You test data transformations, retry mechanisms, and pagination state machines using hook testing utilities (`renderHook`) with network mocks (like MSW). You verify that the hook returns the correct state without asserting on DOM nodes or CSS classes.

---

**Q: When should you NOT split a component into presentational and container layers?**

You should not split when the component is small, localized, and has low probability of reuse.

If you are building a simple 30-line feedback form that appears on a single settings sub-page, creating `FeedbackFormContainer.tsx`, `FeedbackFormView.tsx`, and `useFeedbackForm.ts` adds needless indirection and cognitive overhead. Start with a single cohesive component. Split into container logic and presentational views only when:
- The UI needs to be reused with different data sources.
- The UI needs to be developed or documented in Storybook.
- The component's state or side-effect logic grows complex enough that testing UI and logic together becomes painful.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Leaking Domain DTOs into Shared UI Primitives
- **The Mistake:** Passing raw backend database payloads directly into a shared UI component (e.g., `<DataTable data={rawBackendSqlResponse} />`).
- **Why It Fails:** The presentational component becomes coupled to backend database column names (like `usr_frst_nm` or `created_at_epoch_ms`). If the backend schema changes, your UI breaks.
- **The Fix:** The container (or custom hook) should map backend DTOs into a sanitized View Model (`{ id, name, formattedDate }`) before passing them as props to the presentational component.

---

### Trap 2: Hidden Global Dependencies in "Shared" Components
- **The Mistake:** Placing a component in the `src/components/shared/` folder, but having it internally call `const user = useAuthStore((s) => s.user)`.
- **Why It Fails:** It looks like a shared component, but it has a hidden dependency on a specific global store slice. Dropping it into a public landing page or an isolated test immediately causes runtime errors.
- **The Fix:** Pass `user` (or the specific fields it needs, like `avatarUrl` and `displayName`) explicitly through props.

---

### Trap 3: Premature File Splitting (Indirection Overkill)
- **The Mistake:** Enforcing a strict repository rule that every single component must have a matching `.container.tsx` file.
- **Why It Fails:** Developers spend time writing pass-through boilerplate for components with zero business logic. Navigating the codebase requires jumping between two files for every minor change.
- **The Fix:** Keep simple feature components unified. Extract custom hooks for data fetching when logic expands, and extract presentational components when visual reuse or Storybook isolation is needed.

---

## 7. Compare With Related Concepts

| Pattern / Concept | Primary Focus | Where Logic Lives | When to Choose |
| :--- | :--- | :--- | :--- |
| **Presentational Component** | Visual rendering, markup, and local UI interaction. | None (props in, JSX out). Minimal ephemeral UI state. | Building reusable UI primitives, tables, modals, cards, and design system elements. |
| **Container Component** | Data orchestration, store subscriptions, and side effects. | Component lifecycle / body, delegating UI to children. | Orchestrating top-level page views, route entry points, and multi-component workflows. |
| **Custom Hook** | Headless business logic, async state, and event handling. | Encapsulated inside hook functions (`useUsersList`). | Sharing stateful logic across multiple components without adding wrapper nodes to the React tree. |
| **Headless UI / Compound Components** | Behavior and accessibility primitives with flexible markup slots. | Context and internal state machines; consumer provides JSX. | Building complex interactive widgets (e.g., Radix UI, Headless UI, Select menus) where consumers need custom styling. |

---

## 8. 🧠 The Memory Hook — What Sticks

**Containers care about the plumbing; presentational components care about the canvas.**

- **The Plumbing (Container / Hook):** Fetches data, manages state, connects routes, and handles errors.
- **The Canvas (Presentational Component):** Takes props in, paints pixels out, and emits user clicks.
- **The Modern Shift:** Custom hooks let you separate the plumbing from the canvas without building extra component walls.
