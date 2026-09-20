# Promises

Promises are a state machine plus a queue, and every combinator is a variation on ordering and settlement. This page implements the core class and then the real-world helpers interviews actually ask for: `all`/`allSettled`/`race`/`any`, promisify, retry with backoff, timeouts, concurrency limits, deduplication, caching, and polling.
