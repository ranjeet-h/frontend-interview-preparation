# Server State in React

## 1. Why This Exists — The Problem First

Server state is data owned by an external authority that React temporarily reads, displays, and sometimes changes. Users, products, invoices, permissions, notifications, comments, and orders are server state. The backend or database is the source of truth; the browser holds a cache.

Client-owned UI state is different: an open modal, selected tab, input draft, theme, or currently selected filter belongs to this interface session. A filter can still be client state while it chooses which server query to run.

The distinction matters because a server copy can be missing, loading, stale, failed, changed by another user, or replaced by a newer response. Multiple components may request the same resource, a search parameter may change while a request is in flight, and a successful mutation may make several cached views incorrect.

Manual fetch code can display data, but it does not automatically provide cache identity, shared in-flight requests, freshness rules, background refetching, cancellation, retries, invalidation, pagination, or optimistic rollback. The production problem is not simply “how do I fetch in React?” It is “how do I synchronize temporary client copies with data whose owner lives elsewhere?”

This page uses TanStack Query v5. The same ownership problem is addressed by SWR, RTK Query, Apollo, and Relay, with different APIs and cache models.

## 2. The Analogy — Make It Obvious

Think of server state as books in a public library. The library owns the canonical book and catalog. Your desk holds a borrowed copy that can become outdated while someone else edits the catalog. Two people at your desk should share one copy, not request identical copies. When a book is returned or edited, related desk copies need a fresh check.

- Library catalog: backend/database source of truth.
- Borrowed desk copy: query-cache entry.
- Book identity: query key.
- Check for changes: refetch.
- Copy may be old: stale status.
- Return or edit: mutation.
- Tell desks to check again: invalidation.
- Stop a request nobody wants: cancellation.

~~~mermaid
flowchart LR
  UI["React components"] --> Cache["Query cache"]
  Cache --> API["Backend API"]
  API --> DB["Database / source of truth"]
  UI --> Mutation["Mutation"]
  Mutation --> API
  Mutation --> Invalidate["Invalidate related keys"]
  Invalidate --> Cache
~~~

A cache is not ownership. The server remains authoritative when values conflict.

## 3. How It Actually Works — The Full Explanation

**Ownership.** Server state is remote, shared, asynchronous, and potentially stale. Client state is local to the UI or session. Putting orders in Redux or Zustand does not make them client-owned; it may create a second, manually maintained server cache.

**Query identity.** A query key identifies a cached resource and must include every input that changes its result:

~~~tsx
["orders", { customerId: "c-42", status: "open", page: 2 }]
~~~

An omitted status can show the wrong result. A random value or timestamp defeats reuse and deduplication. TanStack Query hashes serializable keys deterministically, but the application must define a complete semantic identity.

**Freshness and retention.** staleTime says how long successful data is fresh. gcTime says how long unused data remains before garbage collection. They are separate: a result may be stale but retained, or fresh while still actively observed. A stock count might need a short staleTime; a country list can tolerate a longer one.

**State transitions.** Initial loading means there is no usable data yet. Background fetching means old data exists while a newer request runs. In TanStack Query, isPending describes pending status and isFetching includes both initial fetches and refetches. A good UI uses a page loader for the first case and a small refresh indicator for the second.

**Deduplication.** Components sharing one QueryClient and one semantic key can share an in-flight request and its cached result. A header, table, and summary card therefore need not make three identical calls.

**Cancellation and race safety.** Query functions receive an AbortSignal. Pass it to fetch or the HTTP client so an obsolete request can stop when its key changes or it becomes unused. Correct keys separate results by resource; cancellation prevents wasted work and reduces stale-result races.

**Invalidation.** A mutation does not know every cached view that displays the changed entity. On success, invalidate related keys. Matching queries become stale and active observers may refetch. setQueryData is useful for a small, predictable direct update; invalidation is safer when the server normalizes fields, permissions, timestamps, counts, or aggregates.

**Retries.** Bound retries and use backoff for transient failures. Do not blindly retry validation errors or a 404. Be more conservative with mutations: retrying a non-idempotent write can duplicate side effects unless the API supports idempotency keys.

**Optimistic updates.** Cancel relevant reads, snapshot old data, write the prediction, restore the snapshot on failure, and invalidate on settlement. Optimism improves perceived latency but requires a reliable prediction and understandable rollback.

**Library trade-offs.** A library supplies a shared model for cache, freshness, status, cancellation, retries, pagination, and mutations. Costs include dependency weight, provider setup, API conventions, cache-key discipline, and the possibility of masking a poor ownership decision. It reduces coordination code; it does not design resource identity for you.

## 4. Real Code — See It Working

Assumptions: React 18+, TypeScript, @tanstack/react-query v5, and one QueryClientProvider near the application root. The API returns JSON. Production boundaries should also validate response shapes.

~~~tsx
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";

type User = { id: string; name: string };

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

async function getUsers(signal: AbortSignal): Promise<User[]> {
  const response = await fetch("/api/users", { signal });
  if (!response.ok) throw new Error("Users request failed: " + response.status);
  return response.json() as Promise<User[]>;
}

function Users() {
  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: ({ signal }) => getUsers(signal),
  });

  if (usersQuery.isPending) return <p>Loading users…</p>;
  if (usersQuery.isError) return <p role="alert">Could not load users.</p>;

  return (
    <section>
      {usersQuery.isFetching && <p>Refreshing…</p>}
      <ul>
        {usersQuery.data.map((user) => <li key={user.id}>{user.name}</li>)}
      </ul>
    </section>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Users />
    </QueryClientProvider>
  );
}
~~~

The stable users key defines cache identity; the signal enables cancellation; the two status branches distinguish first load from refresh. useQuery manages a cache of server-owned data, not local ownership.

Here a client-owned search term selects a server query. placeholderData keeps a previous result visible while the new key fetches:

~~~tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type Product = { id: string; name: string };

function ProductSearch() {
  const [term, setTerm] = useState("");
  const canSearch = term.trim().length >= 2;
  const productsQuery = useQuery({
    queryKey: ["products", { term }],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ q: term });
      const response = await fetch("/api/products?" + params, { signal });
      if (!response.ok) throw new Error("Search failed");
      return response.json() as Promise<Product[]>;
    },
    enabled: canSearch,
    placeholderData: (previous) => previous,
  });

  return (
    <section>
      <label>
        Search products
        <input value={term} onChange={(event) => setTerm(event.target.value)} />
      </label>
      {!canSearch && <p>Type at least two characters to search.</p>}
      {canSearch && productsQuery.isPending && <p>Searching…</p>}
      {canSearch && productsQuery.isError && <p role="alert">Search failed.</p>}
      {canSearch &&
        productsQuery.data?.map((product) => <p key={product.id}>{product.name}</p>)}
      {canSearch && productsQuery.isFetching && productsQuery.data && (
        <p>Updating results…</p>
      )}
    </section>
  );
}
~~~

For a normal server-authoritative mutation, invalidate both list and detail identities:

~~~tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

type Invoice = { id: string; status: "pending" | "approved" };

async function approveInvoice(id: string): Promise<Invoice> {
  const response = await fetch("/api/invoices/" + id + "/approve", { method: "POST" });
  if (!response.ok) throw new Error("Approval failed");
  return response.json() as Promise<Invoice>;
}

function ApproveButton({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: approveInvoice,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["invoice", id] });
    },
  });

  return (
    <div>
      {mutation.isError && (
        <p role="alert">Approval failed. Please try again.</p>
      )}
      <button disabled={mutation.isPending} onClick={() => mutation.mutate(id)}>
        {mutation.isPending ? "Approving…" : "Approve"}
      </button>
    </div>
  );
}
~~~

The broad invoices key can match filtered lists, while the detail key is separate. If approval fails, show the error; do not pretend the cache changed.

For a safe toggle, optimistic update needs cancellation, a snapshot, rollback, and final reconciliation:

~~~tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

type Todo = { id: string; title: string; completed: boolean };
type TodosContext = { previous?: Todo[] };

async function setTodoCompleted(input: { id: string; completed: boolean }) {
  const response = await fetch("/api/todos/" + input.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: input.completed }),
  });
  if (!response.ok) throw new Error("Todo update failed");
  return response.json() as Promise<Todo>;
}

function useCompleteTodo() {
  const queryClient = useQueryClient();
  return useMutation<Todo, Error, { id: string; completed: boolean }, TodosContext>({
    mutationFn: setTodoCompleted,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["todos"] });
      const previous = queryClient.getQueryData<Todo[]>(["todos"]);
      queryClient.setQueryData<Todo[]>(["todos"], (todos = []) =>
        todos.map((todo) =>
          todo.id === input.id ? { ...todo, completed: input.completed } : todo,
        ),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["todos"], context.previous);
      } else {
        queryClient.removeQueries({ queryKey: ["todos"], exact: true });
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}
~~~

Without the snapshot, a failed request leaves a value on screen that the server rejected. Final invalidation lets server normalization and concurrent changes win.

## 5. The Interview Questions — All of Them, Done Properly

**What is the difference between client state and server state?** Client state is owned by the UI/session, such as an open modal or unsaved input. Server state is owned by an external authority, is asynchronous and shareable, and can become stale, such as an invoice. Ownership determines the synchronization problem.

**Why is fetching inside an effect often not enough?** An effect starts a request but does not itself provide cache identity, shared requests, freshness, background refetching, cancellation, retries, invalidation, or optimistic rollback. A custom hook can implement those policies; a library provides a reusable model.

**What is a query key?** It is the stable, serializable identity of a cached resource. It must contain every parameter that changes the result. Missing inputs cause incorrect reuse; unstable inputs destroy reuse.

**What is stale-while-revalidate?** Show a cached, possibly stale result immediately, then request a newer copy in the background. Existing content remains useful while a refresh indicator communicates that it is being checked.

**How does invalidation work?** A mutation marks matching cached queries stale; active observers may refetch. It signals reconciliation with the server and is not the same as deleting all data or guessing every final response.

**How do optimistic updates work?** Cancel reads, snapshot old cache, write the prediction, restore it on error, and invalidate when settled. Optimism is only safe with a reliable prediction and rollback path.

**How do you prevent duplicate calls?** Share one query client and use the same semantic key for the same resource. Subscribers can share an in-flight request and cached result.

**TanStack Query or RTK Query?** TanStack Query is focused on server state. RTK Query fits applications already standardized on Redux Toolkit and wanting API cache state in that ecosystem. Compare architecture, team familiarity, cache needs, SSR, and runtime constraints.

**How do pagination and infinite queries work?** Include page or cursor in the key for independent pages, or use an infinite-query API for one cursor-driven resource. Keep the next-page rule explicit and decide whether previous data remains visible during loading.

**How do you cancel an outdated request?** Accept the query function's AbortSignal and pass it to fetch. When parameters change, the key identifies the new resource and the old request can be aborted.

**When should you update cache directly?** Use setQueryData when the response is authoritative and every affected shape is predictable. Prefer invalidation when normalization, permissions, aggregates, or unknown consumers are involved.

**How should retries work?** Bound them, use backoff for transient errors, skip deterministic validation failures, and be conservative with non-idempotent mutations. Idempotency keys can make writes safely retryable.

**What belongs on screen during refetch?** Keep usable old data and show local fetching feedback. Use a full loader only when no data exists; this avoids flicker and preserves context.

## 6. The Traps — What Goes Wrong

- Treating the query cache as the source of truth.
- Omitting filter, locale, tenant, permission scope, page, or cursor from a query key.
- Using random values or timestamps in keys.
- Copying query data into local state and creating a second drifting copy.
- Showing a full-page spinner during every background refresh.
- Ignoring response.ok: fetch resolves for HTTP 4xx and 5xx responses.
- Not passing AbortSignal to the HTTP request.
- Invalidating a detail query while leaving related lists, counts, or aggregates stale.
- Optimistically changing the UI without a snapshot and rollback.
- Automatically retrying non-idempotent writes without considering duplicate side effects.
- Making all data infinitely fresh as a blanket performance fix.
- Assuming invalidation means a completed immediate refetch.
- Putting every remote response into Redux or Zustand without cache policies.
- Retaining sensitive data across logout, tenant changes, or permission changes.

## 7. Compare With Related Concepts

| Concept | Owns the data? | Main problem it solves | Example |
| --- | --- | --- | --- |
| Local React state | A component or UI flow | Immediate interaction state | Open dialog, input draft |
| Context | No ownership by itself | Passing shared client values | Theme or UI configuration |
| Redux/Zustand | The client application | Client transitions and durable drafts | Wizard state |
| Server-state cache | Server remains authoritative | Freshness, sharing, refetching, mutations | Cached invoices |
| Effect | No ownership by itself | Lifecycle synchronization | Browser API subscription |
| Database | Backend/domain system | Durable canonical persistence | Orders table |

useState answers “what should this component remember?” A server-state library answers “how should this UI observe and reconcile a remote resource?” They coexist: a local search term can select a query key while products remain server state.

A server-state library fits remote, shared, asynchronous data with freshness or mutation concerns. It may be unnecessary for a one-off request with no reuse policy, though loading, errors, response validation, and cancellation still matter. Libraries differ in API, SSR, normalized caching, and Redux integration; the ownership problem is unchanged.

## 8. 🧠 The Memory Hook — What Sticks

Server state is a borrowed, possibly stale copy of data owned somewhere else. Give each resource a stable identity, cache it, distinguish “no data yet” from “refreshing old data,” cancel obsolete reads, retry deliberately, and invalidate or update related keys after writes.

Use this interview sequence:

**owner → query key → cache/freshness → loading/error → cancellation/deduplication → mutation → rollback/invalidation**

Keep modal visibility and draft text in client state; keep the invoice in a server-state cache; let the backend remain the final authority.
