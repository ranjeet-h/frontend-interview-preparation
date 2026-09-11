# APIs, Server Actions, and Middleware

## Route Handlers

In the App Router, `route.ts` defines a Route Handler for a segment:

```ts
export async function GET() {
  const products = await listProducts()
  return Response.json(products)
}

export async function POST(request: Request) {
  const input = await request.json()
  const product = await createProduct(input)
  return Response.json(product, { status: 201 })
}
```

Export functions for the HTTP methods the endpoint supports. Validate input,
authenticate the caller, authorize the operation, and return deliberate status
codes. Route Handlers replace the App Router's need for `pages/api` API Routes;
the latter remains relevant to Pages Router applications.

Do not call your own Route Handler from a Server Component just to reuse server
logic. Call the shared data-access function directly. Keep the HTTP boundary for
browser/third-party clients or when HTTP behavior is itself the requirement.

## Server Actions

`"use server"` marks an async function as server-executed. Server Actions are
primarily mutation mechanisms, often connected to a form's `action` attribute.
They use a server request under the hood, so treat them like public endpoints:
validate every argument, check the current user's authorization, and never trust
hidden form fields or client-provided IDs.

```ts
"use server"

export async function updateProfile(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, message: "Name is required" }
  await requireUser()
  await saveProfile({ name })
  revalidatePath("/account")
  redirect("/account")
}
```

Use schema validation for complex inputs, return safe field errors, revalidate
affected data after a successful mutation, and make the operation idempotent
when retries are possible. Server Actions are not a replacement for a general
public API and are not the right default for high-volume reads.

## Middleware and proxy boundaries

The framework convention for request interception is version-sensitive; use the
installed version's documented middleware/proxy API. The purpose is to perform
cheap early work such as redirects, locale selection, or coarse request
classification. Keep database-heavy work out of this boundary when its runtime
or latency constraints do not support it.

Redirects tell the browser to request another URL. Rewrites serve a different
resource while keeping the visible URL. Both must be designed with cache keys,
loops, and authorization implications in mind.

## Cookies, headers, and environment variables

Read request cookies and headers only in server-supported contexts. Set secure
session cookies with `HttpOnly`, `Secure`, an intentional `SameSite` policy, and
a narrow `Path`/domain. Server environment variables stay on the server;
`NEXT_PUBLIC_*` values are intended for the browser and should be treated as
public, often inlined at build time.

## Interview answers

**How do you handle CORS?** Prefer same-origin server boundaries or a deliberate
BFF. If cross-origin access is required, emit a narrow allowed-origin policy and
handle preflight; do not use `*` with credentials.

**How do you handle file uploads?** Enforce size/type limits, authenticate the
request, stream or upload directly to object storage, scan as required, and
store metadata rather than trusting an original filename.

**Authentication versus authorization?** Authentication identifies the caller;
authorization decides whether that caller may perform this operation on this
resource. Both must be enforced on the server.

## Memory hook

Route Handlers expose HTTP, Server Actions expose mutations, and middleware
classifies requests early. None removes the need for server-side authorization.

