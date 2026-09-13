# Rendering and Data Fetching

## The four rendering strategies

| Strategy | When HTML/data is produced | Good fit |
|---|---|---|
| SSR | Per request | Personalized or rapidly changing pages |
| SSG | During build/prerendering | Stable public content |
| ISR | Static output refreshed after a period or on demand | Content that tolerates a stale window |
| CSR | In the browser after JavaScript loads | Highly interactive or browser-only data |

These are delivery strategies, not mutually exclusive application types. A
single Next.js application can have static marketing pages, dynamically rendered
account pages, and small client-side interactive islands.

## App Router data fetching

An App Router Server Component can be asynchronous and fetch from the source of
truth directly:

```tsx
export default async function ProductPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProduct(id) // database or upstream service
  return <ProductView product={product} />
}
```

Fetching directly avoids an unnecessary internal HTTP hop. Use a Route Handler
when another client needs an HTTP endpoint, when the operation is a public BFF
boundary, or when HTTP semantics are part of the contract.

## Caching and revalidation

The exact defaults are release-sensitive, so always inspect the versioned
documentation. The durable mental model is to distinguish:

- **Request caching:** whether a data request may reuse a prior result.
- **Data revalidation:** when cached data becomes eligible for refresh, such as
  `next: { revalidate: 60 }` or a tag/path invalidation.
- **Full-route rendering:** whether the rendered route can be reused.
- **Client cache:** state held by a browser library such as TanStack Query.

`cache: "no-store"` requests fresh data for that fetch. `revalidatePath()`
invalidates a route path; `revalidateTag()` invalidates data associated with a
tag. `generateStaticParams()` supplies known dynamic params for prerendering.
Do not call a setting “ISR” merely because it uses a cache: explain what is
cached, for how long, and what invalidates it.

## Parallel work and streaming

Start independent promises before awaiting them to avoid waterfalls. Render a
slow subtree behind `Suspense` or a segment `loading.tsx` so the shell can be
streamed while data is still resolving. Streaming improves perceived progress;
it does not make a slow database query faster.

## Interview answers

**Can `useEffect` fetch data?** Yes, in a Client Component, especially for
browser-only or frequently refreshed data. For initial route data, prefer a
Server Component or an appropriate client data library so the page does not
ship an empty shell and then fetch everything after hydration.

**How do you choose a strategy?** Ask whether the data is public, how fresh it
must be, whether it depends on the request/user, and whether the interaction is
browser-only. Then measure cache hit rate, origin latency, and invalidation cost.

**What is request deduplication?** Identical data work can be memoized or
coalesced within a render/request context. It is not permission to assume that
all independent requests or all users share one mutable result.

**How do you prevent stale data?** Define freshness explicitly, use tags or
paths for event-driven invalidation, avoid accidental client caches, and expose
version or timestamp information when a stale window matters to users.

**How do you prevent waterfalls?** Identify independent dependencies, start
their promises together, place `Suspense` boundaries around slow branches, and
move aggregation close to the data source when several network hops are
otherwise unavoidable.

## Memory hook

Rendering chooses when to produce the view; caching chooses whether work can be
reused. They are related decisions, not synonyms.

