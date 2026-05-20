# Reverse Proxy

## Detailed explanation

A reverse proxy sits in front of backend servers and forwards client requests to internal services.

## 1. One-line mental model

Reverse proxy is the public front door for private backend servers.

## 2. Problem it solves

Apps need TLS termination, routing, compression, buffering, static serving, and protection before traffic reaches app code.

## 3. Core idea

- Examples include Nginx, Envoy, HAProxy, and cloud load balancers.
- Can terminate TLS.
- Can route by host/path.
- Can add headers like request id or forwarded IP.
- Can serve static files and buffer slow clients.

## 4. Visual / analogy

```txt
Hotel front desk routes guests to rooms.
```

## 5. Minimal example

```txt
Nginx proxies `/api` to Node app and `/static` to static files.
```

## 6. Real-world example

Production Express app runs behind Nginx for TLS and routing.

## 7. Common interview questions

1. What is Reverse Proxy?
2. Why does Reverse Proxy matter in backend systems?
3. How would you explain Reverse Proxy in an interview?
4. What bugs happen when Reverse Proxy is handled poorly?
5. How does Reverse Proxy affect frontend clients?
6. How would you test Reverse Proxy?

## 8. Active recall test

1. Explain Reverse Proxy without looking at notes.
2. Give one production bug related to Reverse Proxy.
3. Give one API or backend example where Reverse Proxy matters.
4. Explain how a frontend client should react to Reverse Proxy.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Reverse Proxy is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Reverse Proxy in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Reverse Proxy in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
