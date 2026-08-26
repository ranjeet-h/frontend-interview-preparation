# How does React communicate with Express backend

## 1. Why This Exists — The Problem First

A junior dev wires every component with its own `useEffect` and `fetch`. The product page mounts three child components; each fires `GET /api/user/profile`. MongoDB sees triple read load, the UI flickers as three loading spinners resolve at different times, and React Strict Mode in development makes it six requests. Worse: one component stores the token in `localStorage`, another reads from context, and a third hardcodes `http://localhost:5000` — production builds silently hit the wrong host.

React and Express do not "talk" automatically. You need a deliberate client layer: base URL, credentials, error normalization, and a cache that deduplicates identical in-flight requests.

## 2. The Analogy — Make It Obvious

React is a **concierge desk** in a hotel. Express is **room service** in the kitchen.

- The guest (user) asks the concierge for dinner.
- The concierge writes an **order ticket** (HTTP request: method, URL, headers, body).
- Room service prepares the meal (Express handler + MongoDB) and sends it back on a **tray** (JSON response).
- The concierge updates the guest's table (React state/cache) — they don't walk into the kitchen themselves.

If three concierges each order the same meal without checking whether an order is already in flight, the kitchen cooks three times. A **shared order board** (TanStack Query cache) prevents that.

## 3. How It Actually Works — The Full Explanation

**Transport.** Browser `fetch` or Axios over HTTPS. Methods map to intent: GET read, POST create, PUT/PATCH update, DELETE remove.

**Base URL.** Development: Vite proxy or `VITE_API_URL=http://localhost:5000`. Production: `https://api.yourapp.com`. Never hardcode localhost in components — use env vars injected at build time.

**Credentials.**

- **Cookie auth (refresh token):** `fetch(url, { credentials: 'include' })` and Express `cors({ credentials: true, origin: FRONTEND_URL })`.
- **Bearer access token:** `Authorization: Bearer <token>` header from memory/context — short-lived, not localStorage if avoidable.

**Request body.** JSON: `Content-Type: application/json` + `JSON.stringify(payload)`. Express parses with `express.json()`.

**Response handling.** Check `res.ok` or Axios interceptors. Parse JSON once. Map HTTP status to UI behavior: 401 → refresh or login redirect; 422 → field errors; 429 → retry-after messaging.

**Caching layer.** TanStack Query (or SWR) stores responses by `queryKey`, deduplicates concurrent fetches, refetches on focus/reconnect, and exposes `isLoading` / `isError` consistently.

**Real-time (when needed).** Socket.io client connects to same API host (or dedicated WS URL). REST still handles CRUD; sockets push events (chat messages, notifications).

## 4. Real Code — See It Working

**Central API client with interceptors**

```ts
// client/src/lib/apiClient.ts
const BASE = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? res.statusText,
      body?.error?.details
    );
  }

  return body as T;
}
```

**Express route the client calls**

```js
// server/routes/profile.js
const router = require("express").Router();
const { requireAuth } = require("../middleware/requireAuth");
const User = require("../models/User");

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select("name email role")
      .lean();
    if (!user) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "User not found" },
      });
    }
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

**React hook — one fetch, shared cache**

```tsx
// client/src/api/profile.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient";

type Profile = { _id: string; name: string; email: string; role: string };

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => api<{ data: Profile }>("/api/profile"),
    select: (res) => res.data,
    staleTime: 5 * 60_000,
  });
}
```

**Mutation with cache invalidation**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string }) =>
      api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are the primary communication patterns between React and Express?**

REST JSON over HTTP for CRUD. WebSockets (Socket.io) for bidirectional real-time. SSE for one-way server push. REST is default; add sockets only when polling is inadequate.

**Q: Why use TanStack Query instead of raw useEffect + fetch?**

Deduplication, caching, background refetch, standardized loading/error states, and mutation helpers. Raw useEffect duplicates requests across components and lacks cache invalidation patterns.

**Q: How do you attach authentication to requests?**

Short-lived access token in `Authorization` header (from memory after login). Refresh token in httpOnly cookie — browser sends automatically with `credentials: 'include'`. API client interceptor refreshes on 401 then retries once.

**Q: How do you configure the API URL for dev vs production?**

`VITE_API_URL` / `REACT_APP_API_URL` per environment. Dev may proxy `/api` through Vite to avoid CORS. Production points to deployed API domain.

**Q: How does Express receive and parse React's JSON body?**

`app.use(express.json())` parses body into `req.body`. Validate with Zod before touching Mongoose.

## 6. The Traps — What Goes Wrong

**Per-component fetch in useEffect.** Causes duplicate calls and inconsistent loading UI. Fix: shared query hooks.

**Forgetting credentials with cookie auth.** Cookies never sent → mysterious 401s. Fix: `credentials: 'include'` + CORS `credentials: true`.

**No error normalization.** Components branch on random response shapes. Fix: `ApiError` class and one interceptor.

**Mixing Axios and fetch with different base URLs.** Some requests hit wrong host. Fix: single client module.

**Parsing JSON twice or not handling empty bodies.** 204 responses break `res.json()`. Guard with `.catch(() => ({}))` or check status.

## 7. Compare With Related Concepts

**fetch vs Axios**

fetch is built-in, needs manual error handling. Axios gives interceptors and transforms — either works with a thin wrapper.

**TanStack Query vs Redux for API data**

Redux for client UI state; TanStack Query for server cache. Don't store API lists in Redux unless you need complex offline sync.

**Vite proxy vs explicit CORS in dev**

Proxy makes browser think API is same origin — simpler cookies. Explicit CORS mirrors production topology — catches cookie issues earlier.

## 8. 🧠 The Memory Hook — What Sticks

React never touches MongoDB — it sends **order tickets** (HTTP) to Express and updates UI from **trays** (JSON). One shared order board (query cache), one base URL from env, and `credentials: 'include'` when cookies carry auth.
