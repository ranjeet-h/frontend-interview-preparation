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

#### What is IndexedDB?
- **The Engine Mechanism (Why it behaves this way):** IndexedDB is a low-level, transactional object database embedded directly within the browser engine. Under the hood, the browser's storage engine (typically built on top of LevelDB or SQLite in C++) manages a binary file structure on the user's hard drive dedicated to the origin's sandbox. It allows you to store and query highly complex structured JavaScript values (objects, arrays, Maps, Sets, Date objects, Blobs, and Files) using the Structured Clone Algorithm. Unlike relational databases that use tables and columns, IndexedDB stores data as records containing key-value pairs inside container structures called "object stores".
- **The Unforgettable Mental Model:** A small, fully functional, private post office inside your browser. Instead of putting tiny sticky notes on a single whiteboard (localStorage), this post office has infinite cabinets (object stores) where they can catalog complete parcel boxes (cloned JS objects) with automated card indexes (indexes) for quick lookups.
- **The Trap:** Operating directly with the native IndexedDB API. The native DOM API is ancient and event-driven (using `onsuccess`, `onerror`, `onupgradeneeded` events) instead of modern Promise chains, making the native code incredibly verbose, callback-heavy, and difficult to integrate with `async/await`. Developers should almost always wrap it in lightweight Promise abstractions like `idb`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'IndexedDB is a native, transactional, object-oriented database embedded inside the browser. It operates asynchronously, utilizes the Structured Clone Algorithm to store complex JS objects and binary Blobs, and provides indexing and transactional integrity, making it the bedrock database for offline-first web apps, PWAs, and local caches.'"

#### IndexedDB vs localStorage?
- **The Engine Mechanism (Why it behaves this way):**
  - **`localStorage`:** Is a synchronous key-value store that operates entirely in the browser's main-thread memory. During a write, the main thread is blocked while the engine serializes the data to a string and commits it to disk. It has a strict limit of ~5MB and only supports DOMString data types.
  - **`IndexedDB`:** Is fully asynchronous. Database transactions are queued and executed on a background database thread, unblocking the main JavaScript Call Stack. It has a storage limit determined by the browser's quota management system (often up to 50% or more of available free disk space) and supports true JavaScript objects without string serialization.
- **The Unforgettable Mental Model:** `localStorage` is like writing a note on a sticky note at your main office desk; it's quick to read, but if you have to write a 1,000-page book on sticky notes, your desk (the main thread) becomes instantly unusable. `IndexedDB` is like sending a file clerk (asynchronous worker) down to the basement archives to file away a huge stack of file folders; you can continue doing your work on the main desk while they complete the task in the background.
- **The Trap:** Assuming `localStorage` is fine for large JSON objects because "JSON.stringify is fast". On low-end mobile devices, parsing or serializing large JSON strings inside a synchronous loop can freeze the main thread for hundreds of milliseconds, resulting in noticeable scrolling stutters and input lag.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'The primary difference comes down to execution and capacity. `localStorage` is synchronous, blocks the main thread, is capped at ~5MB, and only stores strings. `IndexedDB` is fully asynchronous, executes on a separate database thread, supports structured cloning of native objects and files, and is capped only by the user's hard drive space, making it vastly superior for large-scale data sets and high-performance applications.'"

#### When use IndexedDB?
- **The Engine Mechanism (Why it behaves this way):** IndexedDB should be used when building application features that require offline operations, high reliability, large data quotas, or complex data lookups. This includes offline-first progressive web apps (PWAs), collaborative editors that cache document changes, offline email clients (like Gmail), media metadata caching, offline map tile storage, large drafts that shouldn't be lost on page reload, or sync queues that retry failed HTTP requests in the background via Service Workers.
- **The Unforgettable Mental Model:** A cargo plane's storage hold. You don't use it to carry your wallet (session tokens) or keys (user settings), but you do use it to carry heavy shipping containers (cached product catalog databases or offline user document drafts).
- **The Trap:** Storing sensitive authentication tokens or user passwords in IndexedDB. Like `localStorage`, IndexedDB is fully accessible via JavaScript running on the same origin. Storing plain-text sensitive tokens exposes them to Cross-Site Scripting (XSS) attacks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'We use IndexedDB when building robust offline capacities, like PWA sync queues, large form drafts, collaborative workspaces, and asset caching. By deferring storage operations to the background thread and utilizing object stores, we can seamlessly store hundreds of megabytes of structured data without degrading the user experience.'"

#### Is it synchronous?
- **The Engine Mechanism (Why it behaves this way):** No, the IndexedDB API is strictly asynchronous. When a database request is initiated (such as `indexedDB.open()` or `transaction.objectStore().get()`), the browser engine allocates an IDBRequest object in memory, schedules the I/O operation on a background database thread, and returns the request object immediately back to the Call Stack. Once the background database thread finishes the operation, it places a task on the Event Loop's Macrotask Queue. The Event Loop eventually picks up this task, allocates the result in heap memory, and triggers the listener callbacks.
- **The Unforgettable Mental Model:** Placing an order at a drive-thru restaurant. You don't stand at the window blocking other cars while the chef cooks the burger; you receive a pager (the IDBRequest object) and wait in your car (unblocked main thread) until the pager rings, indicating your burger is ready.
- **The Trap:** Thinking that you can return the result of an IndexedDB query synchronously from a helper function. Any function reading from IndexedDB must return a Promise or accept a callback, and must be invoked using `await` or `.then()`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'No, IndexedDB is strictly asynchronous. All read and write operations are routed to a dedicated background I/O thread, avoiding main-thread blocking. The results are pushed back to the Call Stack via the Event Loop as macrotasks, which requires us to handle all queries using asynchronous promises or callback structures.'"

#### What are object stores?
- **The Engine Mechanism (Why it behaves this way):** An object store is the primary storage mechanism inside an IndexedDB database, analogous to a table in a relational database or a collection in MongoDB. It stores records as individual JavaScript objects. Each record has a key (which can be auto-generated or derived from a specific keyPath within the object). The engine indexes these keys using a B-Tree structure in the SQLite/LevelDB binary file. Multiple distinct object stores can exist within a single database, and they can only be created or modified during the `onupgradeneeded` database lifecycle event when the database schema version is changed.
- **The Unforgettable Mental Model:** A designated cabinet drawer in a filing cabinet. One drawer is labeled "Users", another is labeled "Orders". Inside each drawer, folders (objects) are sorted by their social security number or order ID (keys). You cannot mix user files into the order drawer, keeping the systems clean.
- **The Trap:** Trying to create an object store inside a standard transaction loop. Attempting to call `db.createObjectStore()` anywhere outside the `onupgradeneeded` handler will throw a `DOMException` error.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Object stores are the core storage containers in IndexedDB, equivalent to tables in SQL databases. They store records as key-value pairs where the value is a structured-cloned JavaScript object. Object stores are highly optimized using B-Trees, and they must be declared and configured strictly during the database schema migration phase inside the `onupgradeneeded` lifecycle.'"

## 8. Active recall test

#### 1. Is IndexedDB async?
- **Explanation/Answer:** Yes, it is strictly asynchronous. All disk reading and writing are performed on a separate thread, returning results through event listeners or Promises.

#### 2. What data size case fits?
- **Explanation/Answer:** Large data sets, ranging from tens of megabytes up to hundreds of gigabytes (typically limited to a percentage of the user's hard drive space).

#### 3. Why not localStorage?
- **Explanation/Answer:** Because localStorage is synchronous (blocking the main thread), string-only (requires parsing), and limited to a tiny ~5MB quota, making it unsafe for large or structural data.

#### 4. What are transactions?
- **Explanation/Answer:** Transactions are atomic wrappers around database operations. They ensure that a group of database reads and writes either all succeed together or all fail together, preventing data corruption. They also lock object stores to ensure database consistency.

#### 5. Name offline use case.
- **Explanation/Answer:** An offline sync queue that saves drafts of emails or chat messages while the user has no network connection, and automatically uploads them to the server as soon as the connection is restored.

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

