# IndexedDB

## 1. Why This Exists — The Problem First

Imagine an offline-capable editor that must keep a user's draft, an outbox of unsent changes, and enough cached data to reopen the document after a network outage. Putting that state in `localStorage` means serializing one large string, blocking the main thread while reading and writing it, and eventually hitting a small quota. Keeping it only in memory loses it on refresh; sending every keystroke to the server fails when the connection disappears.

IndexedDB exists for the browser-side database problem: store substantial, structured, origin-private data asynchronously, query it by keys or indexes, and update related records atomically. It is not a replacement for the server database, but it gives an offline-first application a durable local working set and a place to queue work for later synchronization.

## 2. The Analogy — Make It Obvious

Think of a library branch reserved for one web origin.

- The database is the branch's catalog.
- Object stores are shelves for different record types, such as `notes` and `outbox`.
- A record's primary key is its catalog number. An object store can take it from a property such as `id`, or generate one for you.
- An index is a second card catalog. It lets the librarian find notes by `projectId` without walking every note in primary-key order.
- A transaction is one checkout desk's operation: all the writes in that operation are committed together, or none of them are.
- The database version is the edition of the catalog layout. Adding a shelf or card catalog is a schema migration, so it happens in the special upgrade window rather than during ordinary reading and writing.

The library is private to the origin: `https://app.example` cannot open the database belonging to `https://other.example`. The browser also owns the building's storage policy. It may grant a useful amount of space, reject a write with `QuotaExceededError`, or evict best-effort data under storage pressure. “Persistent” here means browser-managed client storage, not a guarantee that the user's data can never disappear.

## 3. How It Actually Works — The Full Explanation

IndexedDB is a low-level, asynchronous object database exposed by the browser. The API is available from windows and workers, and it follows the same-origin policy. Values are stored using the [structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm), so records can contain ordinary objects, arrays, dates, maps, sets, blobs, and files. Functions, DOM nodes, and symbols are not cloneable values.

### Opening a database is also where migrations happen

`indexedDB.open(name, version)` returns an `IDBOpenDBRequest`, not an `IDBDatabase` immediately. The browser eventually fires one of these important events:

1. If the requested version is newer than the stored version, `onupgradeneeded` runs. Create or alter object stores and indexes there.
2. If the upgrade transaction succeeds, `onsuccess` gives the application an `IDBDatabase` connection.
3. If another tab still has an older connection open, the upgrade can be blocked until that tab closes or responds to `onversionchange`.
4. `onerror` reports an unsuccessful open or migration.

The version number is therefore a migration boundary, not an arbitrary cache label. A migration must be safe to run from every older schema that the application supports. Object stores and indexes cannot be created during a normal read/write transaction; the browser only exposes schema mutation during the version-change transaction.

### Object stores, keys, and indexes

An object store holds records keyed by a primary key. With `keyPath: "id"`, this record gets its key from `record.id`; with `autoIncrement: true`, the browser can generate a key when the record does not provide one. `put()` inserts or replaces a record at its key, while `add()` fails if that key already exists.

An index maps another property to the primary keys of matching records. For example, an index on `projectId` makes “all notes for project 7” a database lookup rather than an application loop over every note. An index is not a separate source of truth: changing or deleting the record updates the index as part of the same transaction. `unique: true` rejects two records with the same indexed value; it does not make the primary key unique because primary keys are already unique.

### Every data operation belongs to a transaction

After opening the connection, the application creates a transaction with a scope and mode:

```js
const readOnly = db.transaction("notes", "readonly");
const readWrite = db.transaction(["notes", "outbox"], "readwrite");
```

The scope limits which object stores the transaction can touch. A `readwrite` transaction can enqueue several requests. If a later request fails, the transaction can abort and roll back the writes from that transaction, preserving the atomicity of the unit you chose. Do not split an invariant across unrelated transactions and then assume they commit together.

Requests such as `store.put()` and `store.get()` complete asynchronously. The native API reports their results through `IDBRequest` events; a Promise wrapper or a library such as [`idb`](https://github.com/jakearchibald/idb) can make the same lifecycle easier to use with `async`/`await`.

There is an important timing rule: a transaction can become inactive after its queued requests finish and control returns to the event loop. Queue related requests in the same active transaction rather than doing an unrelated `await` in the middle and expecting the transaction to remain open. If a long workflow needs multiple asynchronous phases, either keep the database operation small or use separate transactions with an explicit recovery strategy.

### Durability, quota, and security are application concerns

IndexedDB avoids the synchronous API shape of Web Storage, but asynchronous does not mean “free.” Cloning large objects, reading them into JavaScript, rendering them, and searching without a useful index can still consume memory and time. Design records and indexes around the queries the UI actually needs.

Quota is browser- and device-dependent. Use `navigator.storage.estimate()` when capacity matters, catch `QuotaExceededError`, delete or compact data deliberately, and consider `navigator.storage.persist()` where the product can justify requesting stronger persistence. Even then, treat local data as recoverable cache or offline work unless the product has a separate export/sync story.

IndexedDB is protected by the same-origin boundary, not by encryption. Any script that executes in the origin can read it, so an XSS vulnerability can expose its contents. Store drafts, caches, and sync records there; do not treat it as a secret vault for passwords or long-lived authentication tokens.

## 4. Real Code — See It Working

### Open a versioned database and define its schema

Run this in a browser page or module. The helper converts the native open request into a Promise, while leaving the schema migration in `onupgradeneeded`.

```js
function openNotesDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("offline-notes", 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      const notes = db.createObjectStore("notes", { keyPath: "id" });

      // WHY: this index makes projectId lookups avoid a full store scan.
      notes.createIndex("by-project", "projectId");
      notes.createIndex("by-updated-at", "updatedAt");
    };

    request.onsuccess = () => {
      const db = request.result;

      // WHY: an old tab must release its connection before a new schema
      // version can finish upgrading the shared database.
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn("Close another tab before the database can be upgraded.");
    };
  });
}
```

### Write a record atomically and read it back

The write resolves when the transaction completes, not merely when `put()` accepts a request. That distinction matters when the caller must know that the durable transaction outcome succeeded.

```js
function waitForTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Transaction failed"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveNote(db, note) {
  const transaction = db.transaction("notes", "readwrite");
  transaction.objectStore("notes").put(note);

  // WHY: a successful request is not the same as a successfully committed
  // transaction when later work in the transaction can still fail.
  await waitForTransaction(transaction);
}

async function loadNote(db, id) {
  const transaction = db.transaction("notes", "readonly");
  return requestResult(transaction.objectStore("notes").get(id));
}

const db = await openNotesDatabase();
await saveNote(db, {
  id: "draft-42",
  projectId: "interview-prep",
  body: "Revise IndexedDB transactions",
  updatedAt: Date.now(),
});

console.log(await loadNote(db, "draft-42"));
```

### Query through an index and handle quota

An index is useful only when the query matches its key shape. This example asks IndexedDB for every note in one project, then handles the storage failure that can happen on `put()` or at transaction commit.

```js
async function notesForProject(db, projectId) {
  const transaction = db.transaction("notes", "readonly");
  const index = transaction.objectStore("notes").index("by-project");
  return requestResult(index.getAll(projectId));
}

async function tryToCacheNote(db, note) {
  try {
    await saveNote(db, note);
  } catch (error) {
    if (error?.name === "QuotaExceededError") {
      console.warn("Storage is full; evict or compact cache data first.");
      return false;
    }
    throw error;
  }
  return true;
}

console.log(await notesForProject(db, "interview-prep"));
console.log(await navigator.storage?.estimate?.());
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is IndexedDB, and when would you choose it?**

It is an asynchronous, transactional, origin-scoped object database built into the browser. Choose it for structured local data such as offline drafts, an outbox, a substantial cache, or files and metadata that must survive a reload. It is a poor fit for a tiny preference or a secret: `localStorage` is simpler for the former, and IndexedDB is readable by same-origin script for the latter.

**Q: How is IndexedDB different from `localStorage`?**

`localStorage` is a synchronous string key-value API with a small, browser-defined limit. IndexedDB performs asynchronous requests, supports structured-cloned values, object stores, indexes, and transactions, and normally offers a browser-managed quota that is much larger. IndexedDB still requires quota and eviction handling; “larger” does not mean unlimited or server-grade durability.

**Q: What is an object store?**

It is the primary container for records in an IndexedDB database, roughly like a table without fixed relational columns. Each record has a key, optionally obtained from a key path in the value. Object stores are created or altered only during a version-change transaction in `onupgradeneeded`.

**Q: What is the difference between a key path and an index?**

A key path identifies a record's primary key, such as `id`; it determines how the record is stored and retrieved by primary key. An index is an additional lookup path, such as `projectId`, that finds records by another property. A key path identifies one record; an index answers a different query shape.

**Q: Why are transactions important?**

They define the scope and atomic boundary of database work. If an operation updates a note and enqueues its sync entry in the same `readwrite` transaction, the application avoids committing only one half of that invariant. If the two writes belong to separate transactions, a crash or failure can leave them out of sync and the application must repair that state.

**Q: Why can an IndexedDB transaction unexpectedly become inactive?**

Native requests are asynchronous, but a transaction is not an infinitely open database session. Once its active request work finishes and the event loop regains control, the browser may auto-commit it. Queue dependent requests while the transaction is active; do not insert an arbitrary `await fetch(...)` between two writes and expect both writes to stay in one transaction.

**Q: Is IndexedDB truly persistent and unlimited?**

No. It is persistent relative to a page reload and browser session, but the browser controls quota and eviction. A write can fail with `QuotaExceededError`, the user can clear site data, private browsing has different behavior, and browsers can evict best-effort origin data under storage pressure. Product-critical data should be synchronized or exportable.

**Q: Is IndexedDB secure for tokens and passwords?**

It is isolated by origin, but it is not a secret store. JavaScript running in the same origin can access the database, so an XSS bug can read tokens or personal data from it. Use an appropriate credential strategy and reduce the value of any client-side record; never store passwords in plaintext.

**Q: Do I need a wrapper library?**

No. The native API is capable and available in browsers and workers, but its event-based request and transaction lifecycle is verbose. A small, well-tested Promise wrapper or a library such as `idb` can improve ergonomics. A wrapper does not remove the underlying rules about versions, transaction scope, quota, or same-origin security.

## 6. The Traps — What Goes Wrong

- **Treating it like an in-memory object:** A value returned from `get()` is a structured-cloned result, not a live reference to the database record. Mutating it does not save anything. Call `put()` in a `readwrite` transaction to persist the change.

- **Creating a store during normal application work:** `db.createObjectStore("notes")` outside `onupgradeneeded` throws because schema changes require the version-change transaction. Increment the database version and write a migration that checks the existing schema.

- **Resolving after `request.onsuccess` when the transaction can still fail:** A request may succeed while a later request aborts the transaction. For writes that must be durable as a unit, wait for `transaction.oncomplete` and handle `onabort`.

- **Putting an arbitrary `await` inside one transaction:** A network call or unrelated timer can let the transaction become inactive before the next request is queued. Make the local transaction small, or perform the network work before/after it and design an explicit retry or reconciliation path.

- **Assuming `put()` means “update safely”:** `put()` replaces the record at its key. If two parts of an application read, modify, and write the same record, the later write can overwrite fields from the earlier one. Store narrow records, use a transaction around the read-modify-write, and define conflict handling for multi-tab or sync scenarios.

- **Using a missing index as if it were a query planner:** `getAll()` on the object store and filtering in JavaScript reads more data than necessary. Create an index for a frequent equality or range query, and remember that an index does not make arbitrary full-text or fuzzy search free.

- **Calling the quota “unlimited”:** Browser quotas differ and stored data may be evicted. Catch `QuotaExceededError`, measure approximate usage, cap cache growth, and keep the server or an export as the recovery source for important work.

- **Using IndexedDB as an XSS defense:** Same-origin isolation blocks other origins, not compromised script in the current origin. A strict Content Security Policy, output encoding, safe DOM APIs, and careful token architecture still matter.

- **Leaving old connections open during a migration:** Another tab with an open connection can block the upgrade. Handle `onversionchange` by closing stale connections and show the user a reload/close prompt when the application needs coordinated multi-tab upgrades.

## 7. Compare With Related Concepts

| Concept | Key difference | Use it when |
| --- | --- | --- |
| `localStorage` | Synchronous, string-only key-value storage with a small quota; no transactions or indexes. | Keep a few simple, non-sensitive preferences and accept its blocking API. |
| Cache API | Stores request/response pairs and is designed around fetching resources, not querying application records. | Cache HTTP assets or responses for a service worker; use IndexedDB for structured domain data and an outbox. |
| Cookies | Small values automatically sent with matching HTTP requests. | Carry narrowly scoped server-facing state such as a session cookie; do not use them as a client database. |
| IndexedDB vs a server database | IndexedDB is per-origin and per-device; it is not shared across users or a source of truth for the backend. | Use it for local latency, offline work, and retry queues, then synchronize authoritative data with the server. |
| IndexedDB vs OPFS | IndexedDB is record/index/transaction oriented; the Origin Private File System is file-oriented and can suit large file workflows. | Choose based on whether the dominant operation is querying records or reading/writing files. |
| Native IndexedDB vs `idb` | The native API exposes event-based requests; `idb` wraps it with Promise-friendly objects. | Use the wrapper for ergonomics, while still reasoning about the native schema and transaction lifecycle. |

## 8. 🧠 The Memory Hook — What Sticks

IndexedDB is a private browser library: object stores are shelves, indexes are card catalogs, and transactions are one all-or-nothing checkout. Remember the four boundaries—origin, version-change migration, active transaction, and browser quota—and the design becomes predictable: store offline work locally, query it by the shape you indexed, and never mistake client storage for a secret or an indestructible server database.
