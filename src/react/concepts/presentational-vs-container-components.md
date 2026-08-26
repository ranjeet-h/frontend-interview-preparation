# Presentational vs Container Components (Smart vs Dumb)

## 1. Why This Exists — The Problem First

An admin user table often starts as one convenient component. It fetches `/api/v2/users`, reads the page from the router, gets an auth token from a store, maps API fields, renders the table, and handles pagination. It works until another screen needs the same table with customer data, Storybook needs to show an empty state without a backend, or a small API rename forces a developer to edit a file full of layout code.

That is the real problem: the component has mixed two different reasons to change. The data and orchestration change when the API, route, cache, or business rule changes. The presentation changes when the markup, accessibility behavior, or visual design changes. Keeping those concerns connected by props and callbacks makes each side easier to reuse, test, and replace.

## 2. The Analogy — Make It Obvious

Think of a restaurant. The kitchen receives raw ingredients, checks inventory, follows the recipe, handles a missing ingredient, and prepares a finished meal. That is the container's job: it talks to APIs and stores, applies business rules, and prepares data for the screen. The kitchen does not need to know which plates or table decorations the diner prefers.

The waitstaff and plating station receive the finished meal and present it clearly. They handle the diner's immediate requests and pass those requests back to the kitchen. That is the presentational component: it receives props, renders the visual result, and emits callbacks such as `onDelete` or `onNextPage`.

The mapping is useful because it also shows the boundary. Switching from a REST endpoint to GraphQL is a kitchen change; the plated meal can stay the same. Replacing the plates with a new visual theme is a presentation change; the recipe can stay the same. Props are the prepared meal crossing the boundary, and callbacks are requests travelling back from the table.

## 3. How It Actually Works — The Full Explanation

The pattern has two responsibilities, not necessarily two files or two React components. A **presentational component** owns the visual contract. Its meaningful inputs are props, and its output is JSX. It may own ephemeral UI state such as whether a menu is open, which accordion panel is expanded, or whether a tooltip is visible. It should not secretly know about an API client, router, authentication store, or database-shaped response.

A **container** owns orchestration. It chooses where data comes from, subscribes to server state or global state, reads route parameters, performs mutations, handles loading and error states, and converts backend data-transfer objects into a view model. In a modern React application, the container may be a route component, a small wrapper, or mostly a custom hook. The architectural question is “where does this responsibility belong?”, not “does every feature need a file named `Container`?”

There is another React rule underneath this boundary: every render is a snapshot. A function component call receives one set of props and state values, and the handlers it creates close over that render's values. Calling a setter schedules a new render; it does not rewrite the variables or closures from the handler that is already running. This is why a presentational callback reports the user intent from its committed snapshot, while the container decides what the next render should show. If a delayed callback must work from the latest state, use a functional state update or an explicit ref/synchronization design rather than assuming the old closure becomes live.

Component identity is separate from data ownership. React preserves a component's state when the element has the same type and key at the same position in the tree; changing props alone does not create a fresh component. The parent that chooses the type and `key` therefore owns whether a child keeps its local visual state or is deliberately remounted. A changed key discards the old instance/Fiber and mounts a new one, which can be useful for resetting a form, but it also destroys focus, local state, and effect subscriptions. A presentational component owns its local state; the container or route owns the identity decision when the feature's domain says a reset is required.

The boundary can be pictured as:

```text
route / container / custom hook
  API data + route state + business actions
               │
               │ typed props and callbacks
               ▼
reusable presentational UI
  markup + styles + accessibility + local visual state
```

The important invariant is that the reusable UI can be given a different data source without learning a new infrastructure context. If `UserTable` accepts `{ id, name, email, role }`, it does not matter whether the parent obtained those values from REST, GraphQL, a fixture, or a cached query. The parent owns the translation from a raw DTO such as `{ user_id, email_address }` into that stable view model.

This separation also clarifies state ownership. Server state belongs near the query or data layer, because it has freshness, caching, retry, and cancellation concerns. URL state belongs near routing, because it must be encoded and changed through the router. Domain state belongs near the feature that owns the rule. A presentational component may own “is the dropdown open?”, but it should not own “which customer is authorized to delete?”

Effects fit this model when they synchronize React with something outside React: a WebSocket, browser event listener, timer, imperative widget, or network client that needs setup and cleanup. They are not a second render phase and should not be used to derive `fullName` from props, mirror one state value into another, or respond to a button click that can call the action directly. Derive values during render, handle user events in event handlers, and use an effect only when an external system must be brought into alignment with the committed snapshot. Its dependency list describes the reactive values that make that synchronization valid; omitting one can leave an external callback with a stale closure, while unstable dependencies can cause unnecessary teardown and setup.

The pattern evolved with React. Before Hooks, class components held state and lifecycle methods, so teams often created a stateful `UserListContainer` around a stateless `UserList`. That made the boundary visible but could create wrapper chains. Hooks let a route component call `useUsersList()` and pass its result to `UserTable`, preserving the same separation without requiring a wrapper for every view. Data-fetching libraries such as TanStack Query are especially useful here because they provide caching, status, retries, and request identity instead of forcing each component to rebuild those concerns.

This is not a purity contest. A small feature that appears once may be clearer as one component. Split the boundary when reuse, Storybook isolation, independent testing, or growing orchestration makes the separation pay for itself. Conversely, creating `ThingContainer.tsx`, `ThingView.tsx`, and `useThing.ts` for a tiny local button can make the code harder to follow.

## 4. Real Code — See It Working

The following TypeScript/React fragments are contextual application examples: they assume React, React Router, and `@tanstack/react-query` are installed in the application. The presentational component has no API, router, or store dependency.

**Presentational component: a stable view-model boundary.**

```tsx
// components/UserTable.tsx
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
  onPreviousPage: () => void;
}

export function UserTable({
  users,
  isLoading,
  currentPage,
  onNextPage,
  onPreviousPage,
}: UserTableProps) {
  if (isLoading) return <p role="status">Loading user records...</p>;
  if (users.length === 0) return <p>No users found.</p>;

  return (
    <section aria-label="Users">
      <table>
        <thead>
          <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th></tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav aria-label="User pages">
        <button type="button" disabled={currentPage === 1} onClick={onPreviousPage}>
          Previous
        </button>
        <span>Page {currentPage}</span>
        <button type="button" onClick={onNextPage}>Next</button>
      </nav>
    </section>
  );
}
```

The component still handles real UI behavior: loading and empty states, semantic table markup, the disabled previous button, and the callbacks emitted by pagination. “Presentational” does not mean “no interaction”; it means the interaction is expressed through its visual contract rather than hidden infrastructure access.

**Container hook: fetch, transform, and coordinate route state.**

```tsx
// hooks/useUsersList.ts
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { UserRowViewModel } from '../components/UserTable';

interface RawApiUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email_address: string;
  role_name: string;
}

export function useUsersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsedPage = Number(searchParams.get('page'));
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const query = useQuery({
    queryKey: ['users', page],
    queryFn: async (): Promise<UserRowViewModel[]> => {
      const response = await fetch(`/api/v2/users?page=${page}`);
      if (!response.ok) throw new Error('Failed to fetch users');

      const payload: { items: RawApiUser[] } = await response.json();
      // The translation protects reusable UI from backend naming decisions.
      return payload.items.map((item) => ({
        id: item.user_id,
        name: `${item.first_name} ${item.last_name}`.trim(),
        email: item.email_address,
        role: item.role_name,
      }));
    },
  });

  const setPage = (nextPage: number) => {
    setSearchParams({ page: String(Math.max(1, nextPage)) });
  };

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    currentPage: page,
    nextPage: () => setPage(page + 1),
    previousPage: () => setPage(page - 1),
  };
}
```

The query key includes `page`, so page 1 and page 2 are distinct server-state entries. The hook is also the right place to add authentication to the API client, preserve previous data during a transition, or expose a mutation that invalidates `['users']`. The table does not need to know any of those choices.

**Route component: connect the two sides.**

```tsx
// pages/UsersPage.tsx
import { UserTable } from '../components/UserTable';
import { useUsersList } from '../hooks/useUsersList';

export function UsersPage() {
  const users = useUsersList();

  if (users.error) return <p role="alert">{users.error}</p>;

  return (
    <main>
      <h1>User management</h1>
      <UserTable
        users={users.users}
        isLoading={users.isLoading}
        currentPage={users.currentPage}
        onNextPage={users.nextPage}
        onPreviousPage={users.previousPage}
      />
    </main>
  );
}
```

For a focused UI test, render `UserTable` with fixture props and assert on rows, status text, and button events. For a hook test, provide a query client and router test context, mock the network boundary, and assert that a raw API response becomes the expected view model. Each test supplies only the infrastructure required by the layer under test.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental distinction between presentational and container components?**

Presentational components own the visual contract: props enter, JSX is rendered, and user intent leaves through callbacks. Containers own orchestration: data fetching, route and store subscriptions, business rules, mutations, and translation from external data into UI props. The distinction is about responsibility, not a mandatory file naming scheme.

**Q: Must a presentational component be stateless?**

No. It may own state that only affects its local visual behavior, such as an open menu, focused item, or expanded panel. It should not hide domain state or infrastructure dependencies inside itself. A dropdown can own whether it is open; the feature container should decide whether the selected account is allowed to perform an action.

**Q: Is this pattern obsolete now that Dan Abramov no longer recommends splitting components into presentational and container categories by default?**

Historically, presentational/container was a useful category for explaining class-based React designs, where a stateful wrapper often surrounded a mostly stateless view. Dan Abramov no longer recommends splitting components into those categories by default. That historical guidance should be distinguished from modern practice: Hooks, composition, route boundaries, and query libraries let teams place orchestration where it belongs without automatically creating a `Container` and a `View` pair. Keep the underlying dependency boundary when it reduces coupling or improves reuse and testing, but do not treat the old categories as a required architecture.

**Q: Where should fetching and route parameters live?**

At a page or feature boundary, usually in a route component, container, or custom hook. A reusable table should receive `users` and callbacks rather than call `useSearchParams()` or fetch a hardcoded endpoint. That keeps it usable in another route, a Storybook story, or a unit test with no router or backend.

**Q: Why does the pattern improve testing and Storybook work?**

The UI can be tested with plain props, so visual states do not require a network server, store provider, or router. Storybook can show loading, empty, error, long-name, and populated states by changing fixture props. The orchestration layer still needs integration-style tests for query behavior and transformations, but those tests no longer have to inspect CSS or DOM details to prove that data logic works.

**Q: What does the container do when the backend schema changes?**

It updates the translation from the backend DTO to the view model. For example, if `user_id` becomes `id`, the hook or API adapter changes while `UserTable` continues consuming `UserRowViewModel.id`. This is a boundary, not a magic shield: if the meaning of the field changes, both layers may need a deliberate product change.

**Q: When should you not split the component?**

Keep a small, local component together when it appears once, has little orchestration, and is easy to test as a unit. Split when the UI has multiple data sources, the logic is difficult to test alongside markup, the view needs Storybook or reuse, or the route boundary is already a natural seam. Extra files are not automatically better architecture.

## 6. The Traps — What Goes Wrong

**Trap: passing backend DTOs directly into shared UI.** A table that reads `user_id`, `email_address`, and `role_name` is coupled to the server vocabulary. A schema rename now leaks into visual code. Map the DTO once at the container boundary and make the view model describe what the UI needs.

**Trap: calling a global store from a supposedly shared component.** A component may look reusable because it lives under `shared/`, yet `useAuthStore()` inside it creates a hidden provider and application dependency. It can fail in Storybook or be impossible to reuse in a different product. Pass the needed `displayName`, `avatarUrl`, or permission result explicitly.

**Trap: treating all state as container state.** Local visual state does not need to be lifted merely to preserve a label. Lifting every hover, menu, or accordion flag creates noisy props and makes the component less cohesive. Lift state when another component must own or coordinate the decision; keep purely visual state local.

**Trap: treating all state as presentational state.** Putting authentication, selected account permissions, or server records into a table makes the table responsible for rules it cannot properly own. The result is a component that is difficult to reuse and easy to misuse. Keep domain ownership at the feature boundary and pass the smallest useful contract down.

**Trap: assuming the pattern requires three files.** A container wrapper that only forwards five values adds indirection without a boundary worth protecting. Start with a cohesive feature, then extract a hook or view when the coupling produces a real cost. Architecture should follow change and ownership, not a directory template.

**Trap: confusing a custom hook with a presentational component.** A hook can be headless and reusable, but it still contains stateful orchestration. It is not “dumb” just because it does not render JSX. Test it according to its contract: query status, returned data, actions, and side effects.

**Trap: making callbacks too vague.** `onChange(value: unknown)` pushes business interpretation into the UI and weakens the boundary. Prefer a meaningful contract such as `onPageChange(nextPage: number)` or `onDelete(userId: string)`. The UI should report user intent; the container should decide what that intent means.

## 7. Compare With Related Concepts

| Concept | Main responsibility | Dependency shape | Choose it when |
|---|---|---|---|
| Presentational component | Markup, styles, accessibility, and local visual interaction | Props in; callbacks out; no hidden API/store/router access | A view needs reuse, isolated tests, or multiple data sources |
| Container or route component | Fetching, routing, global state, mutations, and business decisions | Knows application infrastructure and feeds a view model | A page or feature must coordinate external systems |
| Custom hook | Share stateful or asynchronous logic without adding a DOM wrapper | Called by a component; can use query, router, or store APIs | Several containers need the same orchestration behavior |
| Headless UI / compound component | Reusable behavior and accessibility with consumer-controlled markup | Often uses context and internal state; styling is supplied by the consumer | A complex widget needs behavior reuse with different visual shells |
| Feature component | A deliberately cohesive vertical slice of UI and logic | May contain both presentation and orchestration | The feature is small or the boundary would add more indirection than value |

The practical rule is simple: separate a boundary when the two sides change for different reasons. Use a custom hook when you want to share logic without adding a wrapper. Use headless UI when the behavior itself is reusable but the markup must remain flexible. Keep a feature together when it is local and clear.

Context is another way to cross a boundary, but it is a dependency boundary rather than a replacement for every prop. It is a good fit for a value many descendants need, such as the current theme, locale, or an established feature-level service; the provider makes that dependency available without threading it through every intermediate component. Props and composition make dependencies visible at the call site and let a parent choose exactly what a child receives, while context hides the path and couples consumers to a provider contract. That hidden coupling can make isolated reuse and testing harder, and a provider update can notify all consumers that read its value, even when a particular consumer only needs part of it. Prefer props or composition for a focused, local contract; use context when the dependency is genuinely cross-cutting or when introducing it removes more plumbing than coupling.

## 8. 🧠 The Memory Hook — What Sticks

Picture a restaurant: the container is the kitchen that handles ingredients, recipes, and failures; the presentational component is the plating station that turns the prepared meal into a visible experience. Props carry the meal to the table, callbacks carry the diner's request back, and a custom hook lets the kitchen move out of the dining room without building wrapper walls.
