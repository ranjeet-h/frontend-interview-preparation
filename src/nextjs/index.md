# Next.js

Next.js is a full-stack React framework. React supplies the component model;
Next.js adds conventions and server capabilities for routing, rendering, data
fetching, mutations, assets, metadata, and deployment.

## Why this is a separate track

The [React track](../react/index.md) explains components, hooks, state, and the
rendering model. This track explains how those ideas become a production web
application: where code runs, how a URL maps to files, when data is cached, how
server and browser code communicate, and how the application is shipped.

The examples use the App Router because it is the current default architecture.
The Pages Router is included where interviewers still ask about it or where a
legacy application may use it. APIs and behavior can change across Next.js
releases, so verify version-specific details against the [official App Router
documentation](https://nextjs.org/docs/app).

## Recommended study order

1. Start with [App Router Foundations](app-router-foundations.md): project
   structure, layouts, route segments, and the App/Pages Router distinction.
2. Learn [Rendering and Data Fetching](rendering-and-data-fetching.md): SSR,
   SSG, ISR, CSR, caching, revalidation, and streaming.
3. Study [Server and Client Components](server-and-client-components.md):
   `"use client"`, serializable props, hydration, and bundle boundaries.
4. Continue with [Navigation, Errors, and Metadata](navigation-errors-and-metadata.md).
5. Learn [APIs, Server Actions, and Middleware](apis-server-actions-and-middleware.md).
6. Finish with [Security, Performance, and Production](security-performance-and-production.md)
   and the [Interview Question Bank](interview-question-bank.md).

## Interview priority

| Tier | Focus |
|---|---|
| Tier 1 | App Router structure, Server vs Client Components, rendering choices, data fetching, caching, navigation, and authentication boundaries |
| Tier 2 | Server Actions, Route Handlers, middleware, error/loading conventions, metadata, image optimization, and deployment |
| Tier 3 | Parallel/intercepting routes, Edge Runtime trade-offs, multi-tenancy, real-time updates, and large-scale architecture |

## Track lessons

| Lesson | Interview focus |
|---|---|
| [App Router Foundations](app-router-foundations.md) | What Next.js adds to React and how files become routes |
| [Rendering and Data Fetching](rendering-and-data-fetching.md) | SSR, SSG, ISR, CSR, caching, revalidation, and streaming |
| [Server and Client Components](server-and-client-components.md) | Execution environments, hydration, boundaries, and serializable props |
| [Navigation, Errors, and Metadata](navigation-errors-and-metadata.md) | Links, route parameters, layouts, loading, errors, SEO, and sitemaps |
| [APIs, Server Actions, and Middleware](apis-server-actions-and-middleware.md) | Route Handlers, forms, mutations, redirects, cookies, headers, and middleware |
| [Security, Performance, and Production](security-performance-and-production.md) | Auth, secrets, bundles, assets, observability, Docker, and architecture |
| [Interview Question Bank](interview-question-bank.md) | Rapid review prompts mapped to the answered lessons |

## Core rule

For every feature, first identify the execution environment and the data
boundary. Server code can use secrets and direct data sources; browser code can
use state, event handlers, and Web APIs. Most difficult Next.js interview
questions are variations of that rule.

