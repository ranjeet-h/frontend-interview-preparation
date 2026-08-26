# Senior React Architecture Scenarios

## 1. Why This Exists — The Problem First

Imagine a successful operations dashboard after two years of growth. It has billing, orders, customers, reporting, and an internal admin area. A customer list fetches data in the page component, a header keeps its own copy of the current user, a modal stores a second copy of the selected customer, and a global store contains both UI flags and server responses. Filters live in local state, so a copied link loses them. A route guard hides the admin screen, but the API accepts the same request from a modified browser. The table renders 100,000 rows, the initial bundle contains every seldom-used screen, and a failed render leaves a blank page with no correlation ID.

Each decision looked reasonable in isolation. Together they create contradictory sources of truth, unclear ownership, duplicated requests, slow interaction, inaccessible shared controls, weak security assumptions, and releases that are hard to roll back. The architecture problem is not “which React library should we install?” It is how to keep product flows reliable while the number of features, developers, requests, records, and deployments increases.

A senior answer starts by clarifying constraints and success metrics:

- What are the important user journeys, and which teams own them?
- Which data is authoritative on the server, and which state belongs only to this browser session?
- How are routes, tenants, roles, API contracts, and deployment environments represented?
- What latency, interaction, accessibility, error-rate, bundle-size, and test-time budgets matter?
- How many rows must be searchable, visible, editable, and exportable at once?
- Is independent deployment actually required, or would it merely add coordination and runtime cost?

The architecture then makes those answers visible through boundaries. It separates server state, client state, form state, URL state, and ephemeral UI state; gives features ownership; keeps reusable UI genuinely reusable; puts authorization on the server; and makes performance, observability, testing, CI/CD, and migration part of the design from the beginning.

The goal is not maximum abstraction. The goal is a system in which a change has a predictable blast radius, a failure has a useful diagnosis, and a team can improve one seam without rewriting the whole product.

## 2. The Analogy — Make It Obvious

Think of the application as a growing city.

- Product flows are districts and roads: routes connect a user journey from entry to completion.
- A feature folder is a district with a clear municipal owner. Its streets and buildings can change without every other district importing its internals.
- A shared component library is public infrastructure: accessible street signs, bridges, and utilities are maintained centrally because many districts truly need the same contract.
- The backend and database are the city archive and legal registry. The browser may keep a convenient copy, but a local copy cannot grant ownership of a property.
- URL state is a street address. It should identify a place and meaningful view settings that survive a refresh or can be shared.
- Form state is a citizen’s unfinished application. It is not official until validation and submission succeed.
- A query cache is a courier’s temporary copy of a public record. It needs an identity, freshness rules, cancellation, and a reconciliation path.
- The design system is a building code: it standardizes safe construction, keyboard behavior, focus, contrast, and visual language without dictating every building’s floor plan.
- Observability is the city control room: route, release, tenant, request, and error signals explain what happened without asking a user to reproduce it from memory.
- CI/CD and release controls are inspection and traffic systems. They stop unsafe changes, allow staged rollout, and provide a route back when a release harms a critical journey.

The mapping is useful because city planning has the same tradeoff as frontend architecture. A single house can be designed freely; a city needs zoning, utilities, emergency access, ownership, and capacity planning. More districts do not automatically justify separate cities. A well-modularized city can scale as a coherent whole; independent cities are justified only when their borders, governance, and infrastructure costs are worth it.

~~~mermaid
flowchart TD
  User["User journey"] --> Router["URL and route tree"]
  Router --> Feature["Feature boundary"]
  Feature --> Query["Server-state cache"]
  Query --> API["Typed API client"]
  API --> Server["Server authentication and authorization"]
  Server --> DB["Database / source of truth"]
  Feature --> UI["Design-system UI"]
  Feature --> Telemetry["Errors, metrics, traces"]
  CI["CI/CD gates"] --> Release["Safe rollout"]
  Release --> Router
~~~

The analogy has a security limit: a city sign saying “residents only” is not a police checkpoint. A hidden button or protected route is UX and traffic guidance. The server must still authenticate the request and authorize the specific operation and resource.

## 3. How It Actually Works — The Full Explanation

**Start with boundaries and ownership.** Begin with user journeys such as “find an invoice, edit it, submit it, and see the result,” not with a favorite state library. Map the route tree, feature ownership, API contracts, authentication and authorization model, deployment topology, and failure states. A boundary is healthy when one team can change its internals without requiring unrelated teams to understand them.

An extensible default is a modular monolith: one deployable application with explicit feature modules and shared platform code.

~~~text
src/
  app/                         # composition: router, providers, release config
  features/
    billing/
      api/                     # billing API functions and schemas
      components/              # billing-only UI
      routes/                  # route-level composition
      state/                   # billing-owned client/form state
      types.ts
    customers/
      api/
      components/
      routes/
  shared/
    api/                       # transport primitives, auth, error mapping
    ui/                        # truly reusable accessible primitives
    lib/                       # cross-feature utilities
~~~

The rule is not “never import across features.” It is to expose deliberate public interfaces and avoid reaching through another feature’s private files. A component becomes shared after repeated, stable use cases reveal a common contract—not merely because it is convenient to place it in `shared/ui`.

**Classify state by ownership.** A useful classification is:

| State | Owner and examples | Best home | Main question |
| --- | --- | --- | --- |
| Server state | invoices, users, permissions, orders | Query cache | How fresh and reconcilable is this remote copy? |
| Client state | wizard step, selected bulk actions, durable draft | Local reducer or client store | Which client transitions must be shared? |
| Form state | dirty fields, touched fields, validation messages | Form boundary | What is edited but not yet accepted? |
| URL state | route params, search, filters, sort, page | Router/search params | Should refresh, sharing, and Back restore it? |
| Ephemeral UI state | tooltip, open popover, hover, pending focus | Component state | Does only this mounted interaction need it? |

The categories can cooperate. A URL filter can select a query key; query data can populate a form; a mutation can update the server and then invalidate cached lists. Cooperation is different from copying everything into one global store. The source of truth must remain explicit.

**Choose the smallest state tool that fits the ownership.** Context is dependency delivery, not automatically a state-management strategy. It works well for stable, broadly relevant values such as theme, locale, or a service object; a frequently changing context value can rerender a large subtree unless it is split or selected carefully. Redux Toolkit is useful when the application needs explicit event-driven transitions, middleware, devtools, persistence rules, and a standardized team model. Zustand is lightweight for shared client-owned state with small selectors, but the team still needs conventions for persistence, reset, and debugging. TanStack Query, SWR, RTK Query, Apollo, or Relay solve remote-data synchronization; they do not replace all client state. A reducer plus local state is often clearest for a contained workflow.

Before choosing, ask: who owns the data, how many consumers need it, must it survive navigation or reload, what transition invariants exist, how fresh must it be, and how will it be inspected and reset? A library should remove coordination cost, not hide an ownership decision.

**Follow a request from route to screen.** A robust read path looks like this:

1. The router matches a validated URL and selects a feature route.
2. The route checks settled identity and coarse UI permissions, while preserving loading and forbidden states.
3. A query key identifies the exact remote resource, including tenant, filters, sort, page or cursor, and other result-changing inputs.
4. The typed API client adds transport policy, credentials, abort signals, response validation, and normalized error mapping.
5. The server authenticates the caller and authorizes the requested action against the resource; the database remains authoritative.
6. The query cache distinguishes initial pending state from background fetching, retains or discards data according to freshness policy, and shares requests among consumers.
7. The feature renders success, empty, loading, retryable error, forbidden, and resource-not-found states as intentional UI.
8. Telemetry records a stable event with route, release, request, and correlation context while avoiding secrets and unnecessary personal data.

For writes, validate at the form boundary, submit through the API client, handle idempotency and conflict rules, update or invalidate every affected query identity, and make rollback or retry behavior explicit. Optimistic UI is appropriate only when the prediction is safe and the old value can be restored.

**Treat permissions as two separate decisions.** UX permission gating can hide navigation, disable an action, or render a `<Forbidden />` state while the identity and policy are loading. It improves clarity and reduces accidental requests. It is not authorization. The backend must verify authentication, tenant scope, role or capability, and object-level access for every sensitive read and write. A client-provided `canEdit` flag is a hint for rendering, never proof that an operation is allowed. Avoid leaking sensitive resource existence when choosing between a 403 and a 404; follow the server’s policy.

**Design performance as a budget and a measurement loop.** “Fast” is not a technique. Define targets such as initial JavaScript transfer, route transition latency, largest contentful paint, interaction latency, memory use, table scroll frame time, and error rate. Measure representative devices and network conditions in production-like builds. Then choose an intervention:

- reduce work: server pagination, smaller payloads, indexed queries, selective fields;
- reduce JavaScript: route-level splitting, dependency review, tree shaking, delayed optional features;
- reduce render work: stable keys, narrow subscriptions, derived values, memoization after profiling;
- reduce DOM work: virtualization for fixed or predictable rows;
- reduce perceived latency: pending UI, placeholder data, prefetching, and optimistic updates where correct.

A dashboard with 100,000 records has two separate bottlenecks. Data fetching must not send all records merely because the browser can technically hold them. Use server-side pagination or cursor-based loading with stable ordering, filtering, and search. DOM rendering must not mount all returned records at once; virtualize the visible window with numeric dimensions, stable row identity, overscan, and a plan for variable-height details. If rich expandable rows have unpredictable height, a detail drawer or separate route is often safer than forcing them into a fixed-height virtual list.

**Make design-system contracts behavioral.** A reusable button is not successful because it has a color prop. Its contract includes semantic HTML, keyboard activation, focus-visible styling, disabled and busy semantics, loading announcements, contrast, touch target, label rules, and documented variants. Prefer composable primitives and explicit escape hatches over a giant component with dozens of interacting booleans. Test primitives at the keyboard and screen-reader boundary, then test feature composition for the few workflows that matter.

**Use layered failure handling.** A component error boundary catches render, lifecycle, and constructor failures below it; it does not catch every event-handler exception, server failure, or error in the boundary itself. Put boundaries at a useful granularity: an app fallback for catastrophic failure, route boundaries for navigation failures, and feature boundaries where a broken widget should not erase the entire workspace. Map API failures into typed categories such as validation, authentication, forbidden, not found, conflict, rate limit, transient server failure, and unknown. Report unexpected failures with release and route context, show a safe recovery action, and never render tokens or raw sensitive responses into an error report.

**Test the architecture at several levels.** Unit tests protect pure reducers, parsers, permission predicates, API error mapping, and table-window calculations. Component tests verify accessible states and interaction contracts. Integration tests exercise a route with a mocked API, query cache, forms, and authorization outcomes. End-to-end tests cover the highest-value journeys across real navigation, refresh, deep links, and a production-like build. Contract tests check that client assumptions match the API. Performance tests enforce budgets rather than celebrating a single local benchmark.

**Migrate through seams, not a rewrite.** First inventory routes, state owners, API calls, runtime errors, bundle composition, and test gaps. Choose one vertical slice with measurable value. Define an adapter around legacy data or components, add characterization tests for behavior that must remain stable, put new code behind a route or feature boundary, and move ownership one dependency at a time. Keep old and new paths observable during the transition. Delete the adapter only after consumers move and the rollback path is no longer needed. A rewrite without seams discards domain knowledge and creates a long period with no safe partial release.

**Choose the deployment topology after the boundaries are understood.**

- A monolith is one deployable unit and is often the simplest operational choice for a small team or tightly coupled product.
- A modular monolith keeps one deployment but enforces feature boundaries, which often provides most maintainability benefits with low runtime complexity.
- Micro-frontends can provide team and deployment independence when domains, ownership, release cadence, and technology boundaries are genuinely independent. They add shared dependency coordination, cross-app routing, duplicated runtime cost, design-system versioning, observability complexity, integration testing, and failure modes across independently loaded applications.

Micro-frontends are not the default answer to a large codebase. First prove that module boundaries, ownership, and release needs cannot be met inside a modular monolith. If independent delivery is required, define contracts for navigation, identity, shared UI, events, error isolation, performance budgets, and rollback before choosing orchestration technology.

## 4. Real Code — See It Working

The examples below assume React 18+, TypeScript, and TanStack Query v5 where query hooks are used. They keep platform code and feature code explicit. The UI permission check is deliberately separate from server authorization.

**A feature route with a typed client and query states:**

~~~tsx
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

type Invoice = {
  id: string;
  totalCents: number;
  status: "open" | "paid";
};

type PermissionSnapshot = {
  status: "loading" | "ready";
  canViewBilling: boolean;
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function usePermissionSnapshot(): PermissionSnapshot {
  return { status: "ready", canViewBilling: true };
}

function Forbidden(): ReactElement {
  return <p role="alert">You do not have access to billing.</p>;
}

function InvoiceTable({ rows }: { rows: Invoice[] }): ReactElement {
  return (
    <table>
      <tbody>
        {rows.map((invoice) => (
          <tr key={invoice.id}>
            <td>{invoice.id}</td>
            <td>{invoice.totalCents / 100}</td>
            <td>{invoice.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BillingRoute(): ReactElement {
  const permissions = usePermissionSnapshot();
  const invoicesQuery = useQuery({
    queryKey: ["invoices", { tenantId: "demo-tenant" }],
    queryFn: ({ signal }) => getJson<Invoice[]>("/api/invoices", signal),
    enabled: permissions.status === "ready" && permissions.canViewBilling,
  });

  if (permissions.status === "loading") return <p>Checking access…</p>;
  if (!permissions.canViewBilling) return <Forbidden />;
  if (invoicesQuery.isPending) return <p>Loading invoices…</p>;
  if (invoicesQuery.isError) {
    return <p role="alert">Could not load invoices. Try again.</p>;
  }

  return (
    <section aria-busy={invoicesQuery.isFetching}>
      {invoicesQuery.isFetching && <p>Refreshing…</p>}
      <InvoiceTable rows={invoicesQuery.data} />
    </section>
  );
}

export function App({ children }: { children?: ReactNode }): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      {children ?? <BillingRoute />}
    </QueryClientProvider>
  );
}
~~~

The query key includes tenant scope, the request accepts the library-provided abort signal, and the UI distinguishes initial pending from background fetching. In a real application, `usePermissionSnapshot` would read a typed session/policy source, and the API would independently enforce access. This example does not pretend that the boolean grants authorization.

**A state boundary and a server-paginated, virtualized table:**

~~~tsx
import { useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";

type Order = { id: string; customerName: string; totalCents: number };
type Page = { rows: Order[]; nextPage: number | null };

async function getOrderPage(page: number, signal: AbortSignal): Promise<Page> {
  const response = await fetch(`/api/orders?page=${page}&limit=100`, { signal });
  if (!response.ok) throw new Error("Orders request failed");
  return response.json() as Promise<Page>;
}

function OrdersTable(): ReactElement {
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageQuery = useQuery({
    queryKey: ["orders", { page, limit: 100 }],
    queryFn: ({ signal }) => getOrderPage(page, signal),
    placeholderData: (previous) => previous,
  });
  const rows = pageQuery.data?.rows ?? [];
  const selectedCount = selectedIds.size;
  const summary = useMemo(
    () => `${rows.length} loaded, ${selectedCount} selected`,
    [rows.length, selectedCount],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  function toggleSelected(id: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (pageQuery.isPending) return <p>Loading orders…</p>;
  if (pageQuery.isError) return <p role="alert">Orders failed to load.</p>;

  return (
    <section>
      <p aria-live="polite">{summary}</p>
      <div
        ref={scrollRef}
        style={{ height: "min(60vh, 480px)", overflow: "auto" }}
        aria-busy={pageQuery.isFetching}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const order = rows[item.index];
            if (!order) return null;
            return (
              <div
                key={order.id}
                role="row"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <button onClick={() => toggleSelected(order.id)}>
                  {selectedIds.has(order.id) ? "Selected" : "Select"}
                </button>
                {order.customerName} — {order.totalCents / 100}
              </div>
            );
          })}
        </div>
      </div>
      <button
        disabled={page === 1}
        onClick={() => setPage((current) => Math.max(1, current - 1))}
      >
        Previous
      </button>
      <button
        disabled={pageQuery.data.nextPage === null}
        onClick={() => {
          if (pageQuery.data.nextPage !== null) setPage(pageQuery.data.nextPage);
        }}
      >
        Next
      </button>
    </section>
  );
}
~~~

This is intentionally a boundary, not a claim that 100,000 records should be fetched into one array. The server owns search, filtering, ordering, and pagination; the browser renders only the current page’s visible window. Production code should use a stable secondary sort or cursor pagination when new records can arrive, a responsive measured viewport rather than a hardcoded height, stable IDs rather than array indexes, and a drawer or separate route for variable-height details. If a table library requires numeric scroll dimensions, derive them from the available container and update them on resize. `@tanstack/react-virtual` is the assumed virtualization library; its API and row-height constraints should be verified against the chosen table implementation.

**A global reporting seam with recoverable boundaries:**

~~~tsx
import type { ErrorInfo, ReactElement, ReactNode } from "react";
import { Component } from "react";

type ErrorBoundaryProps = { children: ReactNode; routeName: string };
type ErrorBoundaryState = { hasError: boolean; errorId?: string };

function reportRenderFailure(error: Error, info: ErrorInfo, routeName: string): string {
  const errorId = `ui-${Date.now()}`;
  console.error("render failure", {
    errorId,
    routeName,
    message: error.message,
    componentStack: info.componentStack,
  });
  return errorId;
}

function FailureFallback({ errorId }: { errorId?: string }): ReactElement {
  return (
    <section role="alert">
      <h1>This part of the app failed</h1>
      <p>Reload the section or contact support with this reference.</p>
      {errorId && <code>{errorId}</code>}
    </section>
  );
}

export class FeatureErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const errorId = reportRenderFailure(error, info, this.props.routeName);
    this.setState({ hasError: true, errorId });
  }

  render(): ReactNode {
    if (this.state.hasError) return <FailureFallback errorId={this.state.errorId} />;
    return this.props.children;
  }
}
~~~

The boundary reports a safe identifier and keeps the failure local to a feature. A separate API error mapper handles rejected requests, and an event-handler wrapper handles failures from user actions; a render boundary is not a universal catch-all. In production, the reporter would send structured data to an approved telemetry service with release, route, and correlation context, while filtering tokens and personal data.

**A migration seam and CI budget:**

~~~tsx
import type { ReactElement } from "react";

type LegacyInvoice = { invoice_id: string; amount: number; paid: boolean };
type InvoiceViewModel = { id: string; totalCents: number; status: "open" | "paid" };

function adaptLegacyInvoice(input: LegacyInvoice): InvoiceViewModel {
  return {
    id: input.invoice_id,
    totalCents: Math.round(input.amount * 100),
    status: input.paid ? "paid" : "open",
  };
}

function LegacyBillingAdapter({ input }: { input: LegacyInvoice }): ReactElement {
  const invoice = adaptLegacyInvoice(input);
  return <p>{invoice.id}: {invoice.status} ({invoice.totalCents} cents)</p>;
}
~~~

The adapter gives a new feature a typed model while the legacy endpoint still exists. Characterization tests first pin down old behavior; contract tests then pin down the new API; a later change can replace the adapter without changing every consumer at once.

~~~yaml
name: frontend-quality
on: [pull_request]
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run typecheck
      - run: npm test -- --runInBand
      - run: npm run build
      - run: npm run lint
      - run: npm run test:e2e:critical
      - run: npm run perf:budget
~~~

The commands are placeholders for repository scripts, not undeclared application symbols. A serious pipeline also checks formatting, dependency/license policy, accessibility smoke tests, API contracts, changed-feature coverage, bundle budgets, source-map upload, and a deploy/rollback preview. Budgets must fail loudly or create an explicit reviewed exception; a dashboard is not protected by a budget that nobody measures.

## 5. The Interview Questions — All of Them, Done Properly

**Q1: How would you design a large React app from scratch?**

I would start with product journeys, constraints, and success metrics. I would map routes and layouts, identify feature and team ownership, define typed API boundaries and server authorization, classify state by owner, and choose a modular monolith unless independent deployment is a demonstrated requirement. I would establish a shared accessible UI contract, route-level loading and error boundaries, query-cache policy, observability fields, and CI gates. I would then implement one vertical slice end to end and use its measured behavior to refine conventions.

The follow-up is “what would you avoid?” I would avoid a universal global store, a catch-all `components` folder, client-only authorization, fetching from arbitrary components, loading every route in the first bundle, and a rewrite without tests or rollback. I would document ownership and budgets because architecture that exists only in a diagram will decay.

**Q2: How do you choose between Redux, Zustand, Context, and TanStack Query?**

First classify the data. TanStack Query is for remote, asynchronous, potentially stale data and provides cache identity, freshness, deduplication, retries, cancellation, and mutation reconciliation. Redux Toolkit fits broad client-owned workflows that benefit from explicit actions, reducers, middleware, devtools, and team-wide conventions. Zustand is a small client store when selective subscriptions and low ceremony matter. Context supplies dependencies or relatively stable shared values; it is not a cache or a replacement for every state transition.

I would choose based on ownership, transition complexity, persistence, inspection, SSR, team conventions, and operational cost. A local reducer may beat all four for a contained wizard. I would not put invoices in Redux merely because many screens display them; that creates a second server cache unless there is a deliberate reason and freshness policy.

**Q3: What state belongs in the URL, server cache, component, form, or global client store?**

Route identity, shareable filters, sort, pagination, and selected tabs belong in the URL when refresh, links, and Back/Forward should restore them. Remote entities, lists, and permissions belong in a server-state cache whose source of truth remains the backend. Draft input, touched fields, and validation messages belong to a form boundary until submission. A modal, tooltip, hover, and temporary selection belong to local component state. A global client store is for client-owned state that several distant consumers must coordinate, such as a multi-step workflow or durable client preference.

The test is not “how many components read it?” The test is “who owns it, how long must it live, and what consistency contract does it need?”

**Q4: Why is a micro-frontend architecture not the default answer?**

It solves a specific organizational and deployment problem: independently owned domains need to release, scale, or migrate on different schedules. It also introduces runtime composition, duplicate dependencies, cross-application navigation and identity, shared design-system versions, integration tests, observability stitching, loading failures, and more difficult performance budgets. A modular monolith can provide clear ownership with one build and one runtime.

I would ask for evidence: Which teams are blocked by the current release boundary? Which contracts can be stable? Who owns shared navigation and authentication? How will rollback work if one remote fails? If the answers are weak, keep a modular monolith and revisit when the constraint is real.

**Q5: How would you optimize a dashboard with 100,000 rows?**

Separate fetch cost from render cost. Push filtering, sorting, aggregation, and pagination to the server; use indexed queries, compact payloads, stable ordering, and cursor pagination when offset pagination can skip or duplicate rows under concurrent writes. On the client, fetch a page or cursor window, virtualize visible rows, use stable IDs, keep row components small, avoid broad subscriptions, and measure scroll and input latency. Use a detail drawer or route if expanded content has variable height.

I would define behavior first: can users search across all records, select across pages, export, and preserve filters? Virtualization alone does not make a 100,000-row API response cheap, and pagination alone does not make a 10,000-row DOM cheap. The design must cover accessibility, keyboard navigation, loading of the next page, empty and error states, and stale selection after filters change.

**Q6: How would you design a reusable design system?**

I would start with a small set of semantic primitives and document behavioral contracts: roles, keyboard behavior, focus management, disabled/busy states, labels, errors, contrast, responsive rules, and supported composition. Tokens centralize color, type, spacing, motion, and elevation. Variants should express meaningful product states rather than expose every CSS property. Each component gets visual, interaction, accessibility, and regression tests; feature teams can compose primitives without forking them.

I would measure adoption and defect rates, not just published component count. A design system needs ownership, versioning, deprecation policy, migration guidance, and a process for exceptions. A shared component that cannot meet one feature’s accessibility or content needs is not truly reusable.

**Q7: How would you handle permissions in a large app?**

Represent identity, tenant, capabilities, and policy-loading status with explicit types. Use permissions to guide menus, route rendering, disabled actions, and empty/forbidden states. Query keys and cache invalidation must include tenant or policy scope where those inputs change data. On every sensitive server request, authenticate the caller and authorize the action against the specific resource; do not trust a role or `canEdit` value sent by the browser.

I would define the failure policy for unknown, unauthenticated, authenticated-but-forbidden, and not-found states. I would audit authorization decisions, avoid logging secrets, clear or partition sensitive cached data on logout or tenant change, and test object-level access. The frontend gate is a UX optimization, never the security boundary.

**Q8: How would you migrate a legacy React app?**

I would inventory routes, dependencies, state ownership, API calls, bundle cost, runtime errors, and critical journeys. I would select a vertical slice with a measurable pain point, add characterization and integration tests, introduce a typed adapter around the legacy API or component, and move the route behind a stable boundary. I would keep old and new paths observable, release incrementally, and maintain a rollback switch until confidence is earned.

I would migrate ownership before syntax: moving files to TypeScript or a new folder does not remove hidden coupling. Each step should delete a source of truth, a legacy dependency, or a measurable failure mode. The end state may remain a modular monolith; a rewrite is not a success metric by itself.

**Q9: How would you reduce bundle size?**

Measure a production build by route and dependency. Split rarely visited routes and heavy editors at route or feature boundaries, remove duplicate libraries, import only required modules, tree-shake dead code, compress assets, and avoid shipping server-only or admin-only code to every user. Prefetch likely next routes deliberately when the network and metrics justify it. Track initial and per-route transfer budgets in CI.

I would not replace every dependency blindly or lazy-load tiny, critical code. A split can worsen interaction if it creates a waterfall, and a smaller bundle can still be slow if it causes extra requests or expensive startup work. Verify with real user metrics and a representative low-end device.

**Q10: How would you handle frontend errors globally?**

Use a layered model: app, route, and feature render boundaries; typed API error mapping; event-handler handling; and a central reporter. Each report should include a release identifier, route, correlation ID, browser/runtime context, and safe feature metadata. The UI should provide an accessible, localized recovery action and preserve unaffected areas where possible. Expected validation, unauthorized, not-found, and offline states should not create noisy “unknown crash” alerts.

I would sample or group repeated errors, protect personal data, and test both fallback rendering and report delivery failure. An error boundary cannot catch a rejected fetch automatically, so network errors need an explicit query or mutation state.

**Q11: How would you design an API client layer?**

Keep transport policy in one small boundary: base URL, credentials, abort signals, timeout policy, request IDs, JSON parsing, response validation, and conversion of HTTP responses into typed domain errors. Keep feature functions close to their domain, for example `getInvoicePage`, rather than letting components assemble URLs and headers. Separate generated or transport DTOs from view models when naming, normalization, or compatibility requires it.

The client should never decide authorization; it may attach credentials and map a 403. It should make idempotency explicit for retryable writes, avoid automatic retries for unsafe operations without server support, and preserve enough error metadata for UI and telemetry without exposing secrets.

**Q12: How would you prevent performance regressions?**

Define budgets for initial and route bundles, render/interaction latency, long tasks, memory, table behavior, and key journey timings. Add static bundle analysis, targeted component benchmarks, and production-like performance tests to CI. Use profiling to locate expensive renders, enforce stable query keys and selectors, and review broad context or store subscriptions. Monitor real-user metrics after release and compare by route, device, and release.

Budgets need ownership and an exception process. A threshold that is ignored is documentation, not a guardrail. I would also test correctness under performance techniques: virtualization must preserve keyboard access and stable rows; optimistic updates must roll back; caching must not show data across tenants.

**Q13: What belongs in serious React CI?**

Type checking, linting, formatting, unit and component tests, integration tests for route/data boundaries, critical end-to-end journeys, accessibility checks, API contract checks, production build validation, bundle budgets, and performance smoke tests. Add dependency and license policy, secret scanning, visual regression where the design system warrants it, migration compatibility checks, and artifact/source-map verification. Parallelize independent jobs, but keep tests isolated and measure whether worker count actually helps.

The exact matrix depends on risk. A payment or permission change deserves more contract and end-to-end coverage than a copy edit; every pull request still needs a fast, reliable baseline.

**Q14: How do you distinguish a monolith, modular monolith, and micro-frontends in a decision?**

The question is deployment and ownership, not file count. A monolith optimizes for operational simplicity. A modular monolith adds enforceable internal boundaries while retaining one runtime and release. Micro-frontends trade more runtime and integration complexity for independent team and deployment autonomy. I would choose the simplest shape that satisfies current constraints, then define the signal that would justify moving to the next level.

**Q15: How should a global frontend error strategy interact with observability and release safety?**

A fallback alone tells the user something broke but not whether a release, route, tenant, browser, or backend dependency caused it. Attach a release ID and correlation context, group errors, alert on new or worsening rates, and use staged rollout or rollback for high-risk changes. Preserve safe recovery and avoid retry storms. The monitoring decision is part of the architecture because it determines how quickly the team can contain damage.

## 6. The Traps — What Goes Wrong

- **Choosing a library before classifying state.** A remote invoice placed in a client store still needs freshness, cancellation, invalidation, and server reconciliation. Name the owner first.
- **Making Context the global database.** A changing provider value can rerender a broad tree, and Context supplies values rather than cache policy. Split providers or use a store/query cache when the contract requires it.
- **Creating one giant global store.** This hides feature ownership, couples unrelated transitions, complicates resets on logout or tenant change, and encourages copying server state.
- **Using a generic `components` folder as an ownership system.** A folder does not explain who may change a component or which domain contract it serves. Keep feature UI local until reuse is proven.
- **Treating a route guard as authorization.** A user can call the endpoint directly, alter the bundle, or replay a request. Enforce authentication and object-level authorization on the server.
- **Redirecting while identity is unknown.** “No user yet” can mean “session check pending.” Model loading, anonymous, and authenticated states separately to avoid flashes and lost destinations.
- **Trusting client permission data.** A `canDelete` flag improves rendering but cannot grant permission. The server must recalculate policy for the requested resource.
- **Putting every filter in local state.** Refresh, copied links, and Back then lose meaningful navigation. Put shareable, history-worthy state in validated URL parameters, while keeping uncommitted typing local when appropriate.
- **Treating query invalidation as immediate truth.** Invalidation marks data for reconciliation; it does not mean every related view has already refetched. Show pending states and invalidate all relevant identities.
- **Making optimistic updates without rollback.** A fast wrong answer is worse than a visible pending state. Snapshot, predict only when safe, restore on failure, and reconcile after settlement.
- **Retrying every request.** Retrying a validation error wastes time; retrying a non-idempotent write can duplicate side effects. Classify errors and use idempotency keys where needed.
- **Using memoization without a profile.** Extra comparisons, unstable props, and complex memo boundaries can add work. Measure the hot path and fix ownership or data shape first.
- **Calling virtualization a complete 100k-row solution.** It limits DOM work, not server payload, search cost, database queries, accessibility, or selection semantics. Pair it with server pagination and a measured viewport.
- **Using array indexes as row identity.** Sorting, pagination, and insertion then move state to the wrong record. Use stable domain IDs.
- **Virtualizing variable-height details casually.** Expanded content can invalidate measurements and keyboard expectations. Use predictable row contracts or a drawer/detail route.
- **Hardcoding a table height for every screen.** A number that works on one laptop can clip on another. Measure available space and update numeric dimensions on resize.
- **Building a design system of cosmetic props only.** Color variants without focus, semantics, error, and busy contracts spread inaccessible behavior at scale.
- **Putting all routes in the initial bundle.** A declarative route table does not create a split if every module is statically imported. Inspect the production graph.
- **Assuming lazy loading is free.** A split can add waterfalls and visible delays. Split meaningful boundaries and prefetch intentionally.
- **Catching only render errors.** Boundaries do not automatically catch event-handler exceptions, rejected requests, worker failures, or server errors. Use the right seam for each failure.
- **Logging raw errors indiscriminately.** Request bodies, tokens, and personal data can leak into telemetry. Redact, classify, and retain only what supports diagnosis.
- **Rewriting before measuring.** A large replacement creates a long period with two systems and no confidence. Start with an adapter, tests, a vertical slice, and a rollback plan.
- **Calling a folder move a migration.** TypeScript, a new router, or a new store does not remove hidden coupling. Prove that ownership and failure modes improved.
- **Choosing micro-frontends to solve team communication.** Runtime fragmentation cannot fix unclear domain ownership. Establish contracts and ownership first.
- **Treating passing unit tests as release safety.** A route can compile while deep links, permissions, API contracts, bundles, accessibility, and production performance fail. Test the critical journey and the built artifact.

## 7. Compare With Related Concepts

| Decision | Use it for | It is not a substitute for | Key tradeoff |
| --- | --- | --- | --- |
| Local state | One component’s immediate interaction | Server cache or shared workflow model | Simple and private; cannot coordinate distant owners alone |
| Context | Supplying stable, broad dependencies | A freshness-aware data cache | Convenient propagation; changing values can widen rerenders |
| Redux Toolkit | Explicit client-owned transitions and middleware | Server authorization or remote freshness | Strong conventions and tooling; more ceremony |
| Zustand | Small shared client-owned state with selectors | Query invalidation and server truth | Low ceremony; conventions and observability are team responsibilities |
| TanStack Query / similar | Remote cache, freshness, cancellation, mutations | Form drafts or every client transition | Solves synchronization; requires disciplined query identity |
| URL state | Shareable navigation meaning | Secrets, large drafts, or transient hover | Durable and bookmarkable; public and history-aware |
| Server authorization | Trusted permission enforcement | UX navigation guidance | Secure boundary; adds policy and failure states |
| Route guard | Early UI gating and navigation | Backend access control | Better UX; bypassable by an untrusted client |
| Pagination | Limit data fetched and transferred | DOM virtualization | Server/query correctness; page transitions and selection semantics |
| Virtualization | Limit mounted DOM and render work | Server-side search and pagination | Fast scrolling; row-height and accessibility constraints |
| Error boundary | Recover from descendant render failures | Network and event errors | Local containment; must be paired with other error seams |
| Modular monolith | Clear ownership in one deployable app | Independent release autonomy | Low runtime cost; teams share release coordination |
| Micro-frontends | Independent domain deployment at meaningful scale | Basic folder organization | Autonomy; integration, performance, and observability complexity |

**Server state versus client state.** The decisive distinction is ownership, not whether the data is stored in JavaScript. An order loaded from an API remains server-owned even if a client store holds it. A selected tab remains client-owned even if it changes a server query.

**Pagination versus virtualization.** Pagination answers “how much remote data should we fetch?” Virtualization answers “how much DOM should we mount?” A large dashboard commonly needs both. Neither one solves search indexing, API authorization, stable ordering, keyboard navigation, or export behavior by itself.

**Context versus a store.** Context is a propagation mechanism with provider-driven updates. A store usually adds a subscription model, selectors, and explicit update conventions. Use Context for stable dependencies and small shared values; use a store when independent consumers need selective client-state subscriptions and durable transition rules.

**Query cache versus a client store.** A query cache models remote identity, freshness, refetching, cancellation, and mutation reconciliation. A client store models local transitions and intent. They can coexist, but duplicating the same entity in both requires a clearly owned synchronization rule and a reason strong enough to pay for it.

**Controlled form versus server state.** A form draft is a proposed change, not the canonical entity. Keep draft, dirty, touched, and validation state close to the form; submit through a typed mutation; reconcile the returned server representation. Copying an entity into a form does not make the copy authoritative.

**Frontend permission gating versus authorization.** Gating controls what the current browser offers. Authorization controls what the trusted backend accepts. Use both, and assume the browser is hostile when deciding access.

**Render error boundary versus global error reporter.** A boundary changes the UI after a render failure. A reporter records diagnostic context. A query or mutation state handles remote failures. A robust strategy needs all appropriate seams, with redaction and user-safe recovery.

**Monolith versus modular monolith versus micro-frontends.** These are deployment and ownership choices, not a maturity ladder that every product must climb. A modular monolith often captures the architectural value of boundaries before the operational cost of multiple runtimes is justified.

**Route-level code splitting versus data loading.** Dynamic imports delay JavaScript; loaders or query functions obtain runtime data. Splitting a route does not paginate its API, and caching its API does not shrink the bundle. Measure both waterfalls independently.

**Offset versus cursor pagination.** Offset pagination is simple and works when ordering is stable and changes are acceptable. Cursor pagination can preserve a more consistent traversal as records are inserted or removed, but it requires API support and more complex navigation. State the consistency requirement before choosing.

## 8. 🧠 The Memory Hook — What Sticks

Use **MAPS** when answering a senior React architecture scenario:

- **M — Map ownership.** Start with user flow, teams, routes, API contracts, and the question “who is authoritative?” Classify remote, client, form, URL, and ephemeral UI state.
- **A — Address the runtime path.** Explain URL → route → feature → query/client → server authorization → source of truth → intentional UI states. Include loading, empty, error, forbidden, and not-found outcomes.
- **P — Protect budgets and boundaries.** Measure bundle, interaction, table, memory, accessibility, and error budgets. Use server pagination plus virtualization for large data, shared UI contracts, typed API seams, and observability.
- **S — Ship incrementally.** Prefer a modular monolith until independent deployment is real. Migrate with adapters, tests, one vertical slice, staged rollout, and rollback evidence.

The shortest durable answer is: **owner → boundary → runtime flow → failure and performance budget → measured tradeoff → incremental release**. If a proposal cannot say who owns the data, who may authorize the operation, how a failure is observed, and how the change is rolled back, it is a component idea—not yet senior architecture.
