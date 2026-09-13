# Navigation, Errors, and Metadata

## Navigation

Use `next/link`'s `<Link>` for internal navigation. It enables client-side
transitions and can prefetch routes; a plain `<a>` performs a normal document
navigation. Use `useRouter()` for imperative navigation in a Client Component,
`usePathname()` for the current pathname, `useSearchParams()` for the query
string, and `useParams()` for dynamic route parameters.

Prefer URL search parameters for shareable filters, pagination, and search
state. They survive refresh, can be bookmarked, and give the server a usable
request input. Debouncing belongs in the client interaction layer; validation
and authorization still belong on the server.

## Redirects and errors

`redirect()` stops the current server render and sends the user to another URL.
`permanentRedirect()` communicates a permanent move. In a Client Component,
router methods can navigate after an interaction. Middleware can redirect before
the route renders, but it should not become the only authorization check.

`error.tsx` catches errors below its segment and must be a Client Component so
it can offer a reset action. `notFound()` is for an absent resource, not an
unexpected exception. Log unexpected failures on the server and return safe
user-facing messages; do not expose stack traces or secrets.

## Metadata and SEO

Export a static `metadata` object for fixed values or `generateMetadata()` for
route- and data-dependent values. These APIs are server-only. Dynamic routes can
derive title, description, canonical URL, and Open Graph fields from the same
validated data used to render the page. Add `sitemap.ts` and `robots.ts` using
the framework's metadata file conventions when those files need to be generated.

SEO is more than a title: return meaningful server-rendered content, canonical
URLs, correct status codes, structured metadata where appropriate, and a
crawlable link graph. Do not claim that metadata makes private pages public or
that a client-only title guarantees crawler behavior.

## Interview answers

**What is prefetching?** Next.js can fetch route resources before a user clicks
an internal link, reducing navigation latency. It is an optimization, not a
freshness or authorization guarantee.

**How do layouts share data with pages?** A layout and its child page can each
fetch the data they need; use a shared server data function and request-level
memoization where appropriate. Do not pass a database client through props.

**What are parallel routes?** Named slots that let one layout render multiple
route branches independently, useful for dashboards and coordinated loading or
error states.

**What are intercepting routes?** A routing convention that lets navigation show
another route in the current context, commonly a detail page as a modal while a
direct URL still renders the full page.

## Memory hook

Links move between known pages; router hooks read or control the current URL;
special files turn failure and discoverability into part of the route contract.

