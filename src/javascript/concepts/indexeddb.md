# IndexedDB

## Detailed explanation
IndexedDB is browser database for large structured client-side data. It is asynchronous and better than localStorage for bigger data, offline-first apps, caches, drafts, and files metadata.

Frontend use: offline queues, local caches, PWA data, large form drafts, media metadata.

## 1. One-line mental model
IndexedDB is async browser database for large structured data.

## 2. Problem it solves
localStorage is small, synchronous, and string-only.

## 3. Core idea
- Stores structured data.
- Async API.
- Supports indexes and transactions.
- Larger capacity than localStorage.
- Good for offline features.

## 4. Visual / analogy
IndexedDB = mini local database in browser.

```txt
App -> IndexedDB -> object stores/indexes
```

## 5. Minimal example

```js
const request = indexedDB.open("app-db", 1);
```

## 6. Real-world example

```js
// Use wrapper libraries like idb for cleaner Promise APIs.
```

## 7. Common interview questions
- What is IndexedDB?
- IndexedDB vs localStorage?
- When use IndexedDB?
- Is it synchronous?
- What are object stores?

## 8. Active recall test
1. Is IndexedDB async?
2. What data size case fits?
3. Why not localStorage?
4. What are transactions?
5. Name offline use case.

## 9. Mistakes / traps
- Using localStorage for large data.
- Blocking UI with sync storage loops.
- Storing sensitive tokens.
- Ignoring schema/version upgrades.

## 10. Compare with related concepts
- **IndexedDB vs localStorage:** async structured DB vs sync string key-value.
- **IndexedDB vs Cache API:** app data vs request/response cache.
- **IndexedDB vs cookies:** client DB vs request headers.

## 11. Summary from memory
Explain when offline app should use IndexedDB.

## 12. Spaced revision prompts
- 1 day: Define IndexedDB.
- 3 days: Compare localStorage.
- 7 days: Explain object store.
- 14 days: Design offline queue storage.

