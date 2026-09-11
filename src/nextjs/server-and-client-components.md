# Server and Client Components

## The boundary

In the App Router, layouts and pages are Server Components by default. They can
read server-side data sources, use secrets without sending them to the browser,
and contribute no component JavaScript to the client bundle. A Client Component
is opted into with the module directive:

```tsx
"use client"

import { useState } from "react"

export function LikeButton({ initialLikes }: { initialLikes: number }) {
  const [likes, setLikes] = useState(initialLikes)
  return <button onClick={() => setLikes(likes + 1)}>{likes}</button>
}
```

Use a Client Component for state, event handlers, effects, browser APIs, or a
client-only custom hook. Keep the boundary as small as possible: a root
`"use client"` turns its imports into client-side code and can make the bundle,
hydration cost, and security review much larger.

## Composition rules

A Server Component can render a Client Component. The common pattern is a server
page fetching data and passing serializable props to a small interactive child.
A Client Component cannot directly import a Server Component because its module
graph must be available to the browser. Instead, compose the server-rendered
piece as `children` or another slot from a Server Component, or move the data
boundary upward.

Props crossing the boundary must be serializable by React. Functions, database
connections, class instances, and arbitrary request objects are not ordinary
props. A Server Action is a special server reference that can be passed through
supported action mechanisms; it is not a license to send server objects to the
browser.

## Hydration and mismatch errors

Hydration attaches client behavior to server-produced HTML. A mismatch occurs
when the browser's first render produces different markup from the server's
markup. Common causes include `Date.now()`, random values, locale/time-zone
differences, browser-only branches, unstable IDs, and data changing between
renders.

Fix the cause: make the initial output deterministic, move browser-only logic
behind an effect or Client Component boundary, pass a server-known value, or
use a narrowly scoped suppression only when the difference is intentional and
safe. `typeof window !== "undefined"` alone does not make differing markup
correct.

## Interview answers

**Can Server Components use hooks?** They cannot use interactive client hooks
such as `useState`, `useEffect`, or event handlers. They can use the server-side
React/Next.js APIs supported by the installed version.

**Can they use browser APIs?** No. There is no browser `window`, `document`, or
`localStorage` on the server.

**Can Client Components be server-rendered?** Their initial UI may be included
in server-rendered output, but their client code still has to be sent and
hydrated for interactivity.

**Can an async Client Component be used?** Do not make a Client Component async
for server data fetching. Fetch on the server and pass data down, or use a
client data library/effect appropriate to the interaction.

**What does `server-only` do?** It marks a module as server-only so an accidental
client import fails clearly during development/build. It is a guardrail, not a
replacement for authorization checks.

## Memory hook

The server owns protected data and expensive preparation; the client owns
interaction. Put the boundary around the smallest useful interactive island.

