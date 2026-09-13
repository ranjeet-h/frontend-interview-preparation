# Next.js Interview Question Bank

This page answers all 180 questions supplied for the Next.js track. The App
Router is the default context; behavior that changes between releases should be
checked in the [official Next.js documentation](https://nextjs.org/docs/app).

## Foundations and Components

**1. What is Next.js, and how is it different from React?**  
React is a UI library for components. Next.js is a full-stack React framework that adds file-based routing, server rendering, data fetching, APIs, caching, metadata, and production optimization. In an interview: “React gives you the view layer; Next.js gives you the production framework around it.”

**2. Main features of Next.js?**  
File-system routing, layouts, Server/Client Components, SSR/SSG/ISR/CSR, streaming, caching and revalidation, Route Handlers, Server Actions, middleware, image/font optimization, metadata APIs, and deployment support.

**3. App Router vs Pages Router?**  
App Router uses `app/`, nested layouts, Server Components by default, and segment files. Pages Router uses `pages/`, `getServerSideProps`, `getStaticProps`, and API Routes. They can coexist during migration.

**4. What is the `app` directory?**  
It is the App Router route tree. Folders are URL segments; special files like `page.tsx`, `layout.tsx`, `loading.tsx`, and `error.tsx` define behavior.

**5. What is the `pages` directory?**  
The older Pages Router. `pages/about.tsx` maps to `/about`; `pages/api/users.ts` defines a legacy API endpoint.

**6. Server Components?**  
They run only on the server, can access databases/secrets directly, and send no component JS to the browser. They cannot use state, effects, event handlers, or browser APIs.

**7. Client Components?**  
Marked with `"use client"`. They can use state, effects, events, browser APIs, and client-only libraries, but they ship JavaScript to the browser.

**8. Server vs Client Components?**  
Server Components are for data access and low browser JS. Client Components are for interactivity. The real difference is **where the code runs**, not whether HTML is server-rendered.

**9. What does `"use client"` do?**  
It marks a module as a Client Component entry point. Its imports enter the client bundle, so placing it too high increases bundle size and hydration cost.

**10. When use a Client Component?**  
When you need state, effects, event handlers, browser APIs, or client-only hooks. Keep the boundary as close to the interactive element as possible.

**11. Can a Server Component import a Client Component?**  
Yes. A server page can fetch data and pass serializable props to a small interactive Client Component.

**12. Can a Client Component import a Server Component?**  
Not directly. Compose the Server Component above it and pass its rendered output through `children` or another supported slot.

## Rendering and Data Fetching

**13. How does rendering work in Next.js?**  
Next composes layouts and pages, resolves server work, produces initial UI, and sends browser JS only for Client Components. Work can happen at build time, request time, or in the browser.

**14. SSR?**  
Server-Side Rendering renders the route per request. It allows request-specific data like sessions or locales, but consumes server resources per request.

**15. SSG?**  
Static Site Generation produces reusable output ahead of requests, usually at build time. It is fast and cache-friendly but cannot depend on per-request data.

**16. ISR?**  
Incremental Static Regeneration reuses static output and refreshes it after a freshness period or explicit invalidation. You get static speed with periodic updates.

**17. CSR?**  
Client-Side Rendering lets the browser fetch or compute UI after JavaScript loads. It suits browser-only interactions but can delay content and hurt SEO.

**18. SSR vs SSG vs ISR vs CSR?**  
SSR = request-time rendering. SSG = build-time rendering. ISR = static output with refresh. CSR = browser-time rendering. One app can mix all four.

**19. How choose a rendering strategy?**  
Ask: Is data public? How fresh must it be? Does it depend on the user/request? Are browser APIs needed? Then measure cache reuse, origin latency, and client startup cost.

**20. Dynamic rendering?**  
The route depends on request-time information or uncached work: cookies, headers, session, or fresh data. It changes caching and increases server cost, so use it deliberately.

**21. Static rendering?**  
It produces reusable output without request-specific values. This enables strong CDN and cache reuse for content that tolerates the freshness policy.

**22. Data fetching in App Router?**  
Async Server Components can use `fetch`, an ORM, or other server I/O directly. Client Components use browser fetching or a client cache for browser-owned data.

**23. Fetch data in a Server Component?**  
Make the component async and await a shared server data-access function. Calling the source directly usually avoids an unnecessary HTTP request to your own Route Handler.

**24. Can you use `useEffect` for data fetching?**  
Yes, in a Client Component. It is useful for browser-only data and client revalidation, but usually not the best initial page-fetching strategy.

**25. How does Next.js extend `fetch`?**  
Server `fetch` can participate in Next.js rendering and caching. Options like `cache`, `next.revalidate`, and tags express reuse and invalidation; defaults are release-sensitive.

**26. Request caching?**  
A server data result or rendered route may be reused according to its cache and route configuration. Distinguish this from browser, CDN, and client-library caches.

**27. What is `cache: "no-store"`?**  
It requests fresh data for that server fetch instead of a persistent cached result. It does not invalidate every other cache in the application.

**28. What is `next: { revalidate: ... }`?**  
It defines a time-based freshness policy for a server fetch. It permits refresh after the interval; it is not instant global consistency.

**29. `revalidatePath()`?**  
Invalidates cached data or output associated with a route path so it can be regenerated with current data, usually after a mutation.

**30. `revalidateTag()`?**  
Invalidates data associated with a cache tag. Tags are useful when one mutation affects several routes reading the same logical resource.

**31. `generateStaticParams()`?**  
Returns known dynamic parameters that Next.js may prerender. Use it for finite public content, not authorization or unbounded datasets.

**32. `generateMetadata()`?**  
Generates server-side metadata from route params or data: dynamic titles, descriptions, canonical URLs, and social preview fields.

## Routing, Layouts, and Navigation

**33. Dynamic routes?**  
Square brackets create a parameter, e.g. `app/products/[id]/page.tsx`. Always validate the received value before using it in a query.

**34. What is `[id]`?**  
It is one dynamic URL segment. `/products/42` supplies `id: "42"` to the route.

**35. Catch-all `[...slug]`?**  
Matches one or more remaining segments and provides them as an array, e.g. `["a", "b"]` for `/docs/a/b`.

**36. Optional catch-all `[[...slug]]`?**  
Matches zero or more remaining segments, so `/docs` and `/docs/a/b` can use the same route. The parameter may be `undefined`.

**37. Route groups `(group)`?**  
Organize routes or select layouts without adding the folder name to the URL. `(marketing)/about/page.tsx` maps to `/about`.

**38. Parallel routes?**  
Named slots like `@analytics` let a layout render multiple route branches independently. Useful for dashboards with separate loading/error states.

**39. Intercepting routes?**  
They let navigation render another route in the current context, commonly a detail page as a modal over a list. Direct navigation renders the full page.

**40. What is a layout?**  
`layout.tsx` wraps a segment and its descendants. It is useful for shared shells, navigation, and providers, and generally persists across compatible navigation.

**41. `layout.tsx` vs `template.tsx`?**  
Layouts persist when their segment remains active. Templates create a new instance on navigation, intentionally resetting state and effects.

**42. Nested layout?**  
A layout inside a child segment that wraps only that branch and its descendants, such as a different shell for an account area.

**43. `loading.tsx`?**  
Provides a segment loading UI, usually through Suspense and streaming. It should clearly represent the shape of pending content.

**44. `error.tsx`?**  
A segment error boundary and must be a Client Component. It can display a safe message and offer a reset/retry action.

**45. `global-error.tsx`?**  
A root-level fallback for failures that prevent the normal root layout from rendering. Keep it minimal and safe.

**46. `not-found.tsx`?**  
Defines UI for a missing resource or a call to `notFound()`. Missing data and unexpected failures should look different.

**47. `notFound()`?**  
Stops the current render and selects the nearest not-found UI, normally with a 404 response.

**48. `redirect()`?**  
Stops the current server execution and redirects to another URL, commonly after an auth check or successful mutation.

**49. `permanentRedirect()`?**  
Communicates a permanent resource move, allowing clients and caches to treat it differently from a temporary redirect.

**50. How does navigation work?**  
`Link` supports client-side transitions and prefetching. Next.js updates affected segments while preserving compatible layouts; router methods handle imperative client navigation.

**51. `<Link>` vs `<a>`?**  
`Link` is optimized for internal Next.js navigation. `<a>` is the standard browser link, appropriate for external URLs or intentional full reloads.

**52. Prefetching?**  
Next.js may load route resources before a visible internal link is clicked. It reduces navigation latency but is not a freshness or authorization guarantee.

**53. `useRouter()`?**  
A Client Component hook for imperative actions like `push`, `replace`, `back`, and `refresh`. It is not a security mechanism.

**54. `usePathname()`?**  
Reads the current pathname in a Client Component, commonly for active-link styling and client-only UI decisions.

**55. `useSearchParams()`?**  
Reads query parameters in a Client Component. Treat their values as untrusted input and validate them on the server.

**56. `useParams()`?**  
Reads dynamic route parameters in a Client Component. Server data access must still validate and authorize the corresponding server params.

## APIs, Actions, and Middleware

**57. Route Handlers?**  
Server endpoints defined with `route.ts`/`route.js` in the App Router, using Web `Request` and `Response` APIs.

**58. What is `route.ts`?**  
The file convention for a Route Handler. Export `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` functions for supported methods.

**59. How implement GET, POST, PUT, PATCH, DELETE?**  
Export one function per method, parse and validate input, authenticate and authorize, call domain logic, and return deliberate response bodies/status codes.

**60. Route Handlers vs API Routes?**  
Route Handlers belong to `app/` and use Web APIs. API Routes belong to `pages/api` and use the Pages Router’s request/response APIs.

**61. Server Actions?**  
Async server functions invoked through supported forms or client mechanisms, primarily for UI-related mutations.

**62. How do Server Actions work?**  
`"use server"` marks the function/module. The client submits serializable arguments or `FormData`, and Next.js performs the server call and can return updated UI/data.

**63. What does `"use server"` do?**  
Marks an async function as server-executed, or marks module exports as server functions. It does not validate input or authorize the caller automatically.

**64. When use Server Actions?**  
For application-owned mutations, especially forms. Use Route Handlers or a separate API for public clients, webhooks, and stable HTTP contracts.

**65. Forms with Server Actions?**  
Pass an action to the form, read and validate `FormData` on the server, authorize the user, mutate, revalidate affected data, then return safe errors or redirect.

**66. Validation in Server Actions?**  
Validate every argument server-side with a schema or explicit checks. Client validation is only a usability improvement.

**67. Errors in Server Actions?**  
Return safe structured errors for expected validation failures. Log unexpected errors through the server error boundary/observability system without exposing stacks or secrets.

**68. Invalidate cache after Server Action?**  
After success, call `revalidatePath()` for affected routes or `revalidateTag()` for affected data groups, then return updated state or redirect.

**69. Middleware functions?**  
They inspect requests before route handling and can continue, redirect, rewrite, or add request context according to the installed version’s convention.

**70. What is `middleware.ts` used for?**  
Locale selection, URL normalization, redirects, request correlation, and coarse auth gating are common uses. Resource authorization still belongs at the server data/action boundary.

**71. Auth middleware?**  
Verify a session indicator, redirect clearly unauthenticated requests, and use a narrow matcher. Repeat the authorization check in the page/handler/action.

**72. Redirects vs rewrites in middleware?**  
A redirect changes the browser URL and causes another request. A rewrite serves a different destination while keeping the visible URL. Test loops and cache keys.

**73. Redirects vs rewrites?**  
Redirects are visible browser navigation; rewrites are internal mapping. Use a redirect for canonical moves and a rewrite for proxy/internal routing behavior.

**74. Edge Runtime?**  
A restricted runtime designed for supported deployment locations near users. It has a smaller API surface than Node.js.

**75. Node.js vs Edge Runtime?**  
Node.js supports more packages and Node APIs. Edge can reduce network distance for suitable work but may restrict native modules, filesystem use, or long-lived connections.


## Edge, cookies, headers, env

**76. Edge Runtime limitations?**  
Missing Node APIs, limited filesystem, no native modules, short timeouts, package compatibility issues, and no long-lived connections. Use Edge for low-latency simple logic; verify every dependency.

**77. How do cookies work in Next.js?**  
Cookies are request/response data. Server code can read them in supported contexts; Route Handlers and Server Actions can set them. `HttpOnly` cookies are not readable by browser JS.

**78. Read/set cookies in Server Components and Route Handlers?**  
Read incoming cookies with the server cookie API. Set cookies only from Route Handlers or Server Actions using `HttpOnly`, `Secure`, deliberate `SameSite`, and correct path/domain.

**79. How do headers work?**  
Server APIs can read request headers; handlers/middleware/config can set response headers. Validate header input and allow-list security-sensitive values.

**80. How do environment variables work?**  
Server code reads private vars normally. `NEXT_PUBLIC_*` vars are bundled for the browser and are public. Never put secrets in `NEXT_PUBLIC_*`.

**81. Server-only vs `NEXT_PUBLIC_*`?**  
Server-only vars stay on the server. `NEXT_PUBLIC_*` is exposed to every browser user and often baked in at build time. Treat it as public.

**82. How keep secrets secure?**  
Use secret management, server-only modules, never pass secrets as props/responses, never log them, and authorize every operation using them.

## Auth, hydration, performance

**83. How is authentication implemented?**  
Server verifies session/token, identifies user, and checks authorization on every protected read and mutation. Client UI checks are only presentation.

**84. Protect server-side routes?**  
Resolve session server-side, check permission and resource scope, query only authorized data, and return suitable redirect/401/403/404.

**85. Protect client-side routes?**  
Client guards improve UX only. Always repeat the check in the server page, Route Handler, and Server Action because client code is bypassable.

**86. What is hydration?**  
Browser attaches React behavior to server-produced HTML. Server Components do not hydrate as client code; Client Components require browser JS.

**87. Causes of hydration mismatch?**  
Server and browser produce different first markup: time/random values, locale/timezone, browser-only APIs, unstable data, invalid HTML nesting.

**88. Fix hydration mismatch?**  
Make initial output deterministic, pass server-known values, move browser-only work into effects/client boundaries, fix invalid markup. Suppress only harmless intentional differences.

**89. What is streaming?**  
Send ready response segments while slower work continues, usually with Suspense or `loading.tsx`. Improves perceived progress, not backend latency.

**90. Suspense with Next.js?**  
Defines a boundary whose fallback streams first and is replaced when suspended server/client work resolves.

**91. What is partial rendering?**  
On navigation, update only affected route segments while preserving compatible layouts and state. Reduces unnecessary work.

**92. How does Next improve performance?**  
Prerendering/caching, route code splitting, prefetching, streaming, Server Components, and optimized images/fonts/scripts. Always measure.

**93. How does code splitting work?**  
Build creates route and dynamic client chunks. Imports reachable from Client Components can enter the browser graph.

**94. What is dynamic import?**  
Load a module on demand, reducing initial client work for large/conditional features. Provide loading state and consider SSR behavior.

**95. How lazy-load a component?**  
Use `next/dynamic` or compatible dynamic import for non-critical features, with a useful fallback and measured benefit.

**96. Disable SSR for dynamic import?**  
Use `dynamic(() => import('./Widget'), { ssr: false })` for genuinely browser-only components. It removes server HTML, so it can hurt SEO.

## Assets, SEO, state, security

**97. How does `next/image` optimize images?**  
Serves appropriately sized/optimized formats and manages loading. You still provide dimensions, responsive `sizes`, and trusted remote config.

**98. Why use `Image`?**  
Built-in sizing/optimization reduces transfer and layout shift. Use normal `img` if another pipeline already owns optimization.

**99. How does `next/font` optimize fonts?**  
Integrates font loading with build/runtime, supports self-hosting, subsets, and fallbacks to reduce transfer and layout shift.

**100. How does `next/script` optimize scripts?**  
Controls third-party script loading strategy and placement. Defer non-critical scripts; review privacy, security, and performance.

**101. How optimize SEO?**  
Server-render meaningful public content, provide metadata/canonical URLs, correct status codes, crawlable links, and sitemap/robots when useful.

**102. How does Metadata API work?**  
Pages/layouts export static `metadata` or server-side `generateMetadata()`. Next combines values through the route tree.

**103. Dynamic titles/descriptions?**  
Validate route params, load the public record server-side, return a `Metadata` object from `generateMetadata()` with a safe fallback.

**104. Open Graph metadata?**  
Return `openGraph` fields like title, description, URL, images from metadata/generateMetadata. Use public, safe, absolute image URLs.

**105. Create sitemap?**  
Use `app/sitemap.ts` or a static sitemap of controlled public URLs. Do not enumerate private or unbounded records blindly.

**106. Create `robots.txt`?**  
Use `app/robots.ts` or a static file. It expresses crawl policy, not security.

**107. Internationalization?**  
Resolve locale from URL/domain/trusted preference, allow-list it, load messages per locale. Middleware helps routing, not security.

**108. Query parameters?**  
Read server `searchParams` or client `useSearchParams()`, normalize and validate, then use for bounded filtering/sorting/pagination/search.

**109. Dynamic metadata for dynamic routes?**  
Use validated params in `generateMetadata()`, load the same public resource as the page, and handle missing data consistently.

**110. Share data between layouts and pages?**  
Use shared server data functions and request-level memoization. Never pass DB clients or request objects through props.

**111. Global state?**  
Keep server data server-side. Use Context/Zustand/Redux only for genuinely client-owned state, with request-safe providers.

**112. Context vs Zustand vs Redux vs server state?**  
Context: low-frequency dependencies. Zustand: small client state. Redux: complex traceable client state. Server-state tools: remote data/refetching.

**113. React Query/TanStack Query with Next?**  
Server can provide initial data or dehydrated cache; TanStack Query handles client refetching/mutations. Define one owner for freshness.

**114. Fetch same data in Server Component and React Query?**  
Not by default. Server-fetch and hydrate client cache only when client refetching is needed. Avoid duplicate requests and conflicting freshness.

**115. Avoid duplicate API requests?**  
Use direct server data access, shared functions, request memoization, and one client query key per resource. Avoid calling your own Route Handler from server render.

**116. Optimistic updates?**  
Update UI immediately, keep rollback state, call authorized mutation, then reconcile with server and invalidate affected data.

**117. Handle auth tokens securely?**  
Prefer short-lived server-managed sessions or protected cookies. Rotate/revoke as needed. Keep long-lived credentials out of browser JS.

**118. Why is `localStorage` risky for tokens?**  
Any JS on the origin, including XSS or compromised dependency, can read it. `HttpOnly` cookies prevent page scripts from reading, but CSRF policy is still needed.

**119. Prevent exposing server code?**  
Keep secrets/data access server-only, avoid importing them across client boundaries, send only required serializable data, and use `server-only`.

**120. What is `server-only`?**  
An import guard that makes accidental client imports fail clearly. It is not authentication or authorization.

**121. CORS in Next.js?**  
Prefer same-origin/BFF. Otherwise allow-list exact origins, methods, headers, handle preflight, and never combine wildcard origins with credentials.

**122. File uploads?**  
Authenticate, enforce size/type limits, stream/upload to object storage, scan as required, and generate trusted metadata instead of trusting filenames.

**123. Pagination?**  
Put validated page/cursor state in URL search params, fetch bounded data, and return stable links/cursors. Cursor pagination is better for large changing datasets.

**124. Infinite scrolling?**  
Server-render first page, then Client Component requests cursor pages via observer/button. Handle limits, cancellation, deduplication, accessibility.

**125. Search with URL search params?**  
Read and validate `q` server-side, query an indexed/bounded source, and update the URL from the client for shareable, back-button-friendly search.

**126. Debounced search?**  
Debounce typing in a Client Component, update URL/query after pause, cancel/ignore stale requests. Validate final query on the server.

**127. Redirect after form submission?**  
Validate, authorize, mutate in Action/Handler, revalidate affected data, then call `redirect()` or return deliberate navigation.

**128. Role-based authorization?**  
Resolve roles/permissions server-side, map operation to allow-list, enforce beside the resource query/mutation. Client role flags are presentation only.

**129. Authentication vs authorization?**  
Authentication identifies the caller. Authorization decides whether that caller may perform an operation on a resource. Login does not imply every permission.

**130. Handle API errors globally?**  
Use shared error classification, consistent response shapes, structured logging, Route Handler handling, and `error.tsx`. Return safe client details; keep diagnostics in logs.

## Production and configuration

**131. Error boundaries in App Router?**  
`error.tsx` catches errors below its segment and can reset the failed subtree. It does not replace validation, authorization, or logging.

**132. Log server-side errors?**  
Log structured, redacted events with route, request/trace, dependency, and error class context. Store in protected observability systems.

**133. Instrumentation hooks?**  
Startup/observability hooks for monitoring, tracing, instrumentation. Keep idempotent and runtime-compatible.

**134. Monitor production app?**  
Track error rate, server/upstream latency, cache behavior, JS transfer, hydration, Core Web Vitals, deployment health. Use logs, metrics, traces, alerts.

**135. Deploy Next.js app?**  
Build with intended deps/config, run on compatible Node/Edge host, or static export if no runtime needed. Verify env, caching, assets, health, migrations.

**136. Vercel vs custom Node server?**  
Vercel manages build, routing, caching, deployment. Custom server gives more control but you own scaling, processes, caching, security, compatibility.

**137. Dockerize Next.js?**  
Use multi-stage build, compile in builder, copy only runtime output/deps into small non-root image. Provide config and health checks.

**138. What is `output: "standalone"`?**  
Produces a self-contained server artifact with traced runtime dependencies. Often reduces Docker image size.

**139. Reduce Docker image size?**  
Multi-stage builds, minimal compatible base, production deps only, standalone/traced output, good `.dockerignore`. Confirm native modules work.

**140. What happens during `next build`?**  
Compiles server/client code, validates app, creates bundles, prerenders eligible routes, optimizes assets, writes `.next`. It cannot prove external services are healthy.

**141. What is `.next`?**  
Generated bundles, manifests, prerendered output, caches. Disposable build artifact, not source code to edit or normally commit.

**142. What is Turbopack?**  
Next.js’s high-performance incremental bundler for supported dev/build workflows. Confirm feature support for your release.

**143. Turbopack vs Webpack?**  
Turbopack emphasizes incremental computation and Rust toolchain. Webpack has mature JS plugin/config ecosystem. Choose by measured speed and compatibility.

**144. What is `next.config.js/ts` for?**  
Configures redirects, rewrites, headers, images, runtime/build options, output mode, aliases, experimental features. Treat as production code.

**145. Redirects/rewrites/headers in `next.config`?**  
Declarative rules that redirect, internally rewrite, or add response headers. Test precedence, loops, caching, security.

**146. What is `basePath`?**  
Serves app under a fixed URL prefix like `/docs`. Links, assets, deployment routing must respect it.

**147. What is `assetPrefix`?**  
Changes prefix for generated asset URLs, commonly for CDN. Not a replacement for `basePath`. Test assets and cache rules.

**148. Configure remote images?**  
Allow-list exact hosts/patterns in image config. Use correct dimensions and `sizes`. Avoid arbitrary remote URLs due to abuse, bandwidth, SSRF risk.

**149. Debug slow Next.js page?**  
Separate server TTFB, upstream/DB latency, browser transfer, bundle execution, hydration. Inspect waterfalls, cache misses, images, host limits.

**150. Reduce JS bundle size?**  
Keep static/data work server-side, shrink Client Component boundaries, remove unused deps, dynamically import non-critical features, analyze bundles.

## Senior architecture

**151. Identify unnecessary Client Components?**  
Find client modules that only render static UI or fetch server data. Inspect dependency graph. Move work upward, keep smallest interactive child.

**152. Why keep Client Component boundaries small?**  
Their reachable imports may ship and hydrate in browser. Smaller boundaries mean less JS, startup cost, leakage risk, state complexity.

**153. What if `"use client"` is on root layout?**  
Root becomes client entry, can pull much of app into browser and lose direct server-only capabilities. Prefer small client provider inside Server Component root layout.

**154. How do Server Components reduce JS?**  
Implementation and server-only dependencies stay on server. Only serialized output and references to Client Components cross the boundary.

**155. What data can pass from Server to Client Component?**  
Supported serializable values: primitives, arrays, plain objects. Send only required fields. Never credentials, DB clients, private records.

**156. Why must Server-to-Client props be serializable?**  
They cross execution/transport boundary. Connections, class instances, functions cannot be reconstructed reliably. Server Actions are special references.

**157. Can you use hooks in Server Components?**  
No interactive client hooks like `useState`/`useEffect`. Delegate browser interaction to Client Components; use server APIs for server work.

**158. Can you use browser APIs in Server Components?**  
No `window`, `document`, `localStorage`, etc. Server Components run on the server.

**159. Can you use async Client Components?**  
Do not make one async for normal server fetching. Fetch in Server Component and pass data down, or use a client data library/effect.

**160. Access database directly from Server Component?**  
Import server-only data access, validate route/session inputs, execute bounded parameterized query, return only needed fields.

**161. Is direct DB query from Server Component safe?**  
It can be, but server execution is not authorization. Enforce identity, tenant/resource scope, least privilege, validation, safe errors.

**162. Route Handler vs direct DB access?**  
Use Handler for browser/third-party clients, webhooks, uploads, or HTTP contract. Server Component usually calls shared data logic directly.

**163. Request deduplication?**  
Coalesces/memoizes identical work within supported render/request scope. Not a global consistency or authorization guarantee.

**164. Memoization vs caching?**  
Memoization reuses computation in a defined scope. Caching stores results for broader time/request scope with freshness/invalidation. State scope and lifetime.

**165. Prevent stale data?**  
Set explicit freshness, invalidate paths/tags after mutations, control client caches, reconcile optimistic state. “Dynamic” alone does not explain freshness.

**166. Real-time updates?**  
Choose polling, SSE, WebSockets, or managed service based on latency/connection needs. Server-render initial data; update client cache from live stream.

**167. WebSockets with Next.js?**  
Require host/runtime supporting long-lived upgraded connections. Many serverless handlers are request-bounded. Use dedicated realtime service/server.

**168. Handle large lists efficiently?**  
Paginate/virtualize, query only needed fields, use stable keys and bounded responses, stream useful sections, avoid sending entire dataset.

**169. Prevent unnecessary re-renders?**  
Keep state local, pass minimal stable props, split by update frequency, use profiler before adding memoization.

**170. Structure large production app?**  
Organize routes by product boundaries, colocate loading/error UI, centralize server data/domain logic, isolate client stores, document auth/caching/errors/observability/deployment.

**171. Design production authentication?**  
Use trusted identity/session service, protect cookies, resolve identity server-side, authorize every resource/mutation, handle expiry/rotation, audit sensitive events.

**172. Design e-commerce with Next.js?**  
Cache public catalog, validated dynamic routes/metadata, client-friendly cart, server-side pricing/inventory checks, idempotent audited orders.

**173. Dashboard with authenticated SSR data?**  
Resolve/authorize session server-side, fetch independent panels in parallel, stream slow panels behind Suspense, keep filters as small Client Components.

**174. Multi-tenant Next.js app?**  
Resolve tenant from trusted host/session mapping, carry scope through every server query, isolate cache keys/storage, test cross-tenant denial.

**175. Permissions/roles in multi-tenant?**  
Resolve identity and tenant membership server-side, evaluate explicit policy for resource/action, enforce in handlers/actions/queries. Client role flags are presentation only.

**176. Caching for high-traffic app?**  
Classify data by freshness/privacy, cache public content, tag shared data, never cache personalized output accidentally, prevent stampedes, monitor hit rate/origin load/invalidation latency.

**177. Handle millions of dynamic pages?**  
Avoid enumerating every page. Use on-demand rendering/caching, selective static params, CDN delivery, bounded queries, pagination, explicit invalidation.

**178. Optimize app with slow backend API?**  
Measure upstream latency, parallelize independent calls, cache safe responses, coalesce duplicate reads, stream independent UI, add timeouts/fallbacks, move aggregation closer to backend.

**179. Prevent waterfalls when fetching multiple APIs?**  
Start independent promises before awaiting them, use `Promise.all` when failure semantics allow, move composition server-side, stream independent sections.

**180. Most common performance mistakes?**  
Root layout client-side, broad client boundaries, internal HTTP calls from Server Components, serial waterfalls, oversized images/data, unnecessary `ssr: false`, cache changes without measurement.

---

## Final interview checklist

For any Next.js design answer, cover:

1. **Where code runs** — server, client, Edge, build time.  
2. **What is cached** — and for how long.  
3. **How input is validated** — never trust client data.  
4. **Where authorization happens** — server boundary, not UI.  
5. **What reaches the browser** — JS, props, secrets risk.  
6. **Loading/error behavior** — Suspense, `loading.tsx`, `error.tsx`.  
7. **How you measure success** — latency, cache hit rate, bundle size, Core Web Vitals.

That structure makes you sound like a senior engineer, not someone who memorized definitions.