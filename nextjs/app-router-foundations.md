# App Router Foundations

## What Next.js adds to React

React is a UI library. Next.js is a framework built around React that supplies
file-system routing, server rendering, build tooling, asset optimization,
metadata, and server-side application primitives. A React component can render
inside many environments; a Next.js route also has conventions for what happens
before, during, and after rendering.

## App Router versus Pages Router

The App Router lives under `app/` and uses nested layouts, React Server
Components by default, route segment conventions, and Server Actions. The Pages
Router lives under `pages/` and uses a page-per-route model with APIs such as
`getServerSideProps`, `getStaticProps`, and `getStaticPaths`. They can coexist
while an application is migrated, but a route belongs to one router.

## File-system routing

```text
app/
  layout.tsx             # shared root UI; required in the App Router
  page.tsx               # /
  dashboard/page.tsx     # /dashboard
  posts/[id]/page.tsx    # /posts/:id
  docs/[...slug]/page.tsx # /docs/a/b
  (marketing)/about/page.tsx # /about; group is omitted from the URL
```

`[id]` is a dynamic segment. `[...slug]` is a required catch-all segment, while
`[[...slug]]` is an optional catch-all. A route group such as `(marketing)`
organizes files without changing the URL. Parallel routes use named slots such
as `@analytics`; intercepting routes let a navigation render another route in a
context such as a modal.

## Layouts, templates, and special files

`layout.tsx` persists across navigation for its segment and is the usual place
for shared shell UI. `template.tsx` creates a new instance on navigation, so its
state resets. Nested layouts apply to descendants. `loading.tsx` provides a
segment-level loading UI, `error.tsx` is a client error boundary for a segment,
`global-error.tsx` handles root-level failures, and `not-found.tsx` renders a
not-found state. Calling `notFound()` stops the current render and selects that
UI.

## Interview answers

**What is the `app` directory?** The App Router's route tree. Folders represent
URL segments; special files define pages, layouts, loading states, errors, and
metadata. Non-route files can be colocated without becoming URLs.

**What is the `pages` directory?** The Pages Router's route tree. `pages/about.tsx`
becomes `/about`, and `pages/api/*` contains legacy API Routes.

**Can App and Pages Router routes coexist?** Yes, during migration, but avoid
assuming their data-fetching and rendering APIs are interchangeable.

**How should a large app be structured?** Keep route concerns near the route,
put reusable UI in a shared component area, put data-access functions in a
server-only library, and keep authentication/authorization in a small number of
auditable server boundaries.

**What does `next build` do?** It validates and compiles the application,
produces route and client bundles, prerenders eligible routes, and writes build
artifacts to `.next`. It does not prove that runtime data, credentials, or
external services are configured correctly.

## Memory hook

The folder tree is a URL tree, and special files are lifecycle hooks for each
branch of that tree.

