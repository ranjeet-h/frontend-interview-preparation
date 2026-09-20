## Save and Restore Data with `localStorage`

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `createStorage(namespace)` — a thin, defensive wrapper over `localStorage` with `get(key, fallback)`, `set(key, value)`, `remove(key)`, and `keys()`. The contract is the **string ↔ value** boundary: `localStorage` stores only strings, so every write is a `JSON.stringify` and every read is a `JSON.parse`. The wrapper must also survive the three failure modes a naive `localStorage.setItem(k, obj)` ignores: **unserializable values**, **quota exceeded**, and **unavailable storage** (disabled cookies, private mode, SSR, workers).

A second contract matters for interviews: **reads return deep copies**. Parse produces a fresh object every time, so mutating what `get` returned does *not* change storage until you `set` it back.

### Examples

```text
const store = createStorage("app");

store.set("user", { name: "Ada", age: 36 });
localStorage.getItem("app:user")   // => '{"name":"Ada","age":36}'

store.get("user")                  // => { name: "Ada", age: 36 }
store.get("missing", { ok: false })// => { ok: false }

const a = store.get("user");
a.age = 99;
store.get("user").age              // => 36   (deep copy, not persisted)

store.set("noop", undefined)       // => false (undefined does not serialize)
store.set("nan", { n: NaN }); store.get("nan") // => { n: null } (Infinity too)

store.set("circular", (() => { const o = {}; o.self = o; return o; })())
                                   // => false (TypeError inside, caught)

localStorage.setItem("app:user", "{not json");
store.get("user", "fallback")      // => "fallback" (corrupt payload, no throw)
```

### Approach

`localStorage` is a synchronous string map exposed through the `Storage` interface. The wrapper is one indirection that makes the string boundary explicit.

1. **Namespace the keys.** Prefix every key (`app:user`) so the app can enumerate and clear its own slice without touching other code on the origin. `Object.keys(localStorage)` mostly works, but the portable enumeration is `storage.length` + `storage.key(i)`.
2. **Probe the backend, then cache it.** Merely *reading* `globalThis.localStorage` throws a `SecurityError` in sandboxed iframes, and in some private modes the object exists but `setItem` throws. Do one write/remove probe; on failure set the backend to `null` and make every method a safe no-op.
3. **`JSON.stringify` on write, `JSON.parse` + reviver on read.** `stringify` silently drops `undefined`, functions, and symbols from objects, turns `NaN`/`Infinity` into `null`, and returns `undefined` (not a string) for a top-level `undefined` — refuse to write that rather than storing `"undefined"`. It throws `TypeError` for cycles and `BigInt`. On the way back, JSON has no `Date`/`Map`/`Set`/`RegExp`; a reviver that recognises ISO-8601 restores real `Date`s, and the rest need explicit tagging. `structuredClone` does **not** help: you still must produce a string.
4. **Distinguish "absent" from "stored `null`."** `getItem` returns `null` in both cases. Take an explicit `fallback`, and wrap the payload if the distinction matters.
5. **Handle quota.** The budget is ~5 MB of UTF-16 characters (≈10 MB of bytes). When full, `setItem` throws a `DOMException` named `QuotaExceededError` (older Firefox: `NS_ERROR_DOM_QUOTA_REACHED`); some private modes throw regardless of size. Catch it, return `false`, let the caller evict. `getItem` can throw too, so the read path needs its **own** `try`/`catch` separate from the parse.

`sessionStorage` shares this API but is per-tab (survives reloads, not closes); everything below works against either backend.

### Implementation

```javascript
function createStorage(namespace, { storage } = {}) {
  // Resolve + probe the backend once. Reading localStorage can itself throw,
  // and a present-but-unwritable Storage exists in some private modes.
  let backend = storage;
  if (backend === undefined) {
    try {
      const ls = globalThis.localStorage;
      const probe = "__probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      backend = ls;
    } catch {
      backend = null; // disabled cookies, sandboxed iframe, SSR, worker
    }
  }

  const prefix = `${namespace}:`;
  const keyFor = (key) => prefix + key;

  // JSON has no Date. Restore ISO-8601 strings so round-tripped dates stay Dates.
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  const reviver = (_key, value) =>
    typeof value === "string" && ISO.test(value) ? new Date(value) : value;

  return {
    get(key, fallback = null) {
      if (!backend) return fallback;
      let raw = null;
      try { raw = backend.getItem(keyFor(key)); } catch { return fallback; }
      if (raw === null) return fallback;                                  // absent key
      try { return JSON.parse(raw, reviver); } catch { return fallback; } // corrupt payload
    },

    set(key, value) {
      if (!backend) return false;
      let raw;
      try { raw = JSON.stringify(value); } catch { return false; } // cycle or BigInt
      if (raw === undefined) return false; // top-level undefined / function / symbol
      try { backend.setItem(keyFor(key), raw); return true; }
      catch { return false; }              // QuotaExceededError, private-mode block
    },

    remove(key) {
      if (!backend) return;
      try { backend.removeItem(keyFor(key)); } catch { /* ignore */ }
    },

    keys() {
      if (!backend) return [];
      const out = [];
      for (let i = 0; i < backend.length; i += 1) {
        const key = backend.key(i); // Storage has no index: enumerate by position
        if (key !== null && key.startsWith(prefix)) out.push(key.slice(prefix.length));
      }
      return out;
    },
  };
}
```

### Walkthrough

`store.set("user", { name: "Ada", joined: new Date("2024-01-02T03:04:05Z") })`:

1. `JSON.stringify` walks the object. `name` is a string; `joined` has a `toJSON` method (inherited from `Date.prototype`), so it serializes to `"2024-01-02T03:04:05.000Z"`. The result is `'{"name":"Ada","joined":"2024-01-02T03:04:05.000Z"}'`.
2. `backend.setItem("app:user", raw)` writes the string synchronously. Returns `true`.

Now `store.get("user")`:

3. `getItem("app:user")` returns the raw string — `null` would mean absent, so we proceed.
4. `JSON.parse(raw, reviver)` walks the output. For `name`, `ISO.test("Ada")` is false → unchanged. For `joined`, the regex matches → `new Date("2024-01-02T03:04:05.000Z")`. The caller receives a real `Date`, so `get("user").joined.getUTCFullYear()` is `2024`.
5. Call it again: `JSON.parse` runs a second time, so `get("user") !== get("user")`. That is the deep-copy rule in action — two identical-looking but distinct objects.

Now the failure paths. `store.set("circular", o)` where `o.self === o`: `JSON.stringify` throws `TypeError`; the `catch` returns `false` and nothing is written. `store.set("noop", undefined)`: `JSON.stringify(undefined)` returns `undefined`, the `raw === undefined` guard fires, returns `false`. And after someone hand-edits the entry to `"{not json"`, `JSON.parse` throws inside its own `try`, so `get("user", "fallback")` returns `"fallback"` instead of taking down the app during boot.

### Complexity

Time: `O(n)` in payload size for `JSON.stringify`/`parse`, which is **synchronous and blocks the main thread** — that is the real cost of `localStorage`, not the `O(1)` map lookup. `keys()` is `O(k)` over all storage keys for the origin, since `Storage` has no prefix index. Space: `O(n)` for the string, which lives in the DOM-side storage as UTF-16 (~2 bytes per character), plus a copy of the parsed object.

### Edge Cases

- **Missing key** → `fallback`. There is no in-band way to tell "never written" from "stored `null`" unless you wrap the payload in an envelope like `{ v: null }`.
- **Corrupt JSON** (devtools edit, partial write, older schema) → `fallback`, never a throw. One bad key must not break the whole boot.
- **`undefined` / function / symbol** as the whole value → `stringify` returns `undefined` → `set` refuses. Inside an object they are dropped silently instead: `{ a: undefined }` becomes `{}`.
- **`NaN` / `Infinity`** → `null`; **`-0`** → `0`; **`BigInt` or a circular reference** → `TypeError`, caught, `set` returns `false`.
- **`Date`** revives via the reviver. **`Map` / `Set` / `RegExp` / class instances** become `{}` or a plain object and lose their prototype — tag and rebuild them by hand.
- **Quota exceeded** → `setItem` throws `DOMException`; `set` returns `false`. There is no automatic eviction unless you write it (see follow-ups).
- **Storage disabled / SSR / worker** → probe fails, `backend === null`, all methods degrade to `fallback`/`false`/no-op. `localStorage` does not exist in workers at all.
- **`storage` events do not fire in the tab that wrote** — the next problem covers this.
- **XSS reads it.** `localStorage` is not a security boundary; any script on the origin can read every key. Do not persist tokens or PII.
- **No atomicity.** Two tabs doing read-modify-write on one key lose updates; the Storage API has no lock.

### Interview Follow-ups

- **Schema versioning:** store `{ v: 2, data }` and run `migrate(raw)` once per session on read.
- **LRU eviction on quota:** catch the failure, keep an `updatedAt` beside each value, delete the oldest entries, retry once.
- **`IndexedDB` instead:** asynchronous, no 5 MB cap beyond disk quota, stores structured clones natively — at the cost of a much larger async API.
- **Cross-tab sync:** the `storage` event (next problem) and `BroadcastChannel`.

### Common Mistakes

- `localStorage.setItem(key, obj)` without `JSON.stringify` — stores `"[object Object]"` and every read returns that string.
- Assuming the write succeeded; ignoring the quota `DOMException`, so saves silently vanish.
- Not wrapping `JSON.parse` in `try`/`catch`, so a single hand-edited value throws on page load and blanks the app.
- Using `null` as the "missing" sentinel while also storing `null`, making the two states indistinguishable.
- Treating the parsed result as live state: mutating the object `get` returned and expecting persistence.
- Assuming `typeof localStorage !== "undefined"` is enough — accessing it can throw, and existence does not imply writability.
- Storing secrets because the key is not visible in the URL.

### Takeaway

`localStorage` is a synchronous, 5 MB, string-only map. The wrapper's whole job is the string ↔ value contract plus three failure modes: **parse error, quota, unavailable storage**. Every read is a fresh deep copy; every write is a full serialization you can be told `false` about.

## Implement `localStorage` with TTL

`Difficulty: Medium` `Probability: High`

### Problem

Implement `createTTLStorage(storage = localStorage)` — a key/value store where every entry can carry a **time to live**:

```text
set(key, value, ttlMs = Infinity) -> boolean
get(key)                          -> value | null
has(key)                          -> boolean
remove(key)                       -> void
purge()                           -> number   // expired entries removed
```

The contract:

- `get` must **never** return an expired value, and must return `null` for both "never written" and "expired."
- An expired entry should be **deleted** the moment it is discovered (lazy eviction), so storage does not fill with dead keys.
- Expiry must survive a page reload, a tab being suspended, and the browser being closed.
- `ttlMs` is milliseconds from the moment of the call; `Infinity` means no expiry.

The trap: TTL is a property of the **entry**, not of a timer you keep in the page.

### Examples

```text
const store = createTTLStorage();

store.set("token", "abc", 1000);
store.get("token")                  // => "abc"    (t = 0..999)
// ... 1001 ms pass
store.get("token")                  // => null, and localStorage no longer has the key

store.set("forever", { plan: "pro" }) // ttl defaults to Infinity
store.get("forever")                // => { plan: "pro" }  (always)

store.set("now", "x", 0); store.get("now")   // => null  (expires on the next read)
store.set("neg", "x", -5); store.get("neg")  // => null  (negative ttl clamped to 0)

store.set("a", 1, 50); store.set("b", 2, 10_000);
// ... 100 ms pass
store.purge()                       // => 1  (only "a" was expired)

store.get("never-written")          // => null
```

### Approach

Store an **envelope**, not a bare value: `{ v: <value>, e: <absolute expiry timestamp | null> }`.

1. **Absolute time, not a countdown.** Persist `e = Date.now() + ttlMs`. A relative TTL stored on disk would restart its countdown on every reload — the classic bug. Absolute timestamps are also what a server sends for auth tokens.
2. **Lazy expiry on read.** `get` compares `Date.now()` to `e` and deletes the key when expired. No timers, nothing to re-arm, nothing to leak. This is why suspension and reload are non-issues: expiry is a pure function of the envelope and the current clock.
3. **`>=` at the boundary.** `ttlMs = 0` must expire "immediately"; using `>` would let a same-millisecond read through.
4. **Non-finite TTL means no TTL.** `Infinity` (the default) and `NaN` are not finite, so they fall into the `e: null` branch. Clamp negatives with `Math.max(0, ttlMs)` so they expire at once rather than being "already expired forever."
5. **Fail open on unreadable payloads.** An entry written before this wrapper existed (or hand-edited) may not be an envelope. Return the raw value with no expiry instead of deleting data you cannot interpret.
6. **`purge()` sweeps opportunistically.** Snapshot the key list first: the `Storage` API's index shifts as you delete, so mutating while iterating skips keys. Schedule it on idle; it is `O(k)` over every key on the origin.
7. **One parse per read.** `get` must not parse the envelope twice (once to check `e`, once to return `v`) — read the envelope object, check `e`, return `env.v`. Also note `env.v === undefined` is possible if `undefined` was stored; `has` should compare against the envelope, not the value.

Honesty about the clock: `Date.now()` is wall clock, so a user changing the system clock, or an NTP correction, moves expiry. `performance.now()` is monotonic but resets on navigation, so it cannot back a persisted TTL. For anything security-relevant, treat the TTL as a UX nicety and let the server enforce real expiry.

### Implementation

```javascript
function createTTLStorage(storage = globalThis.localStorage) {
  const now = () => Date.now();

  // Read + interpret one entry. Returns null (absent) or an envelope object.
  // Fails OPEN: an unparseable / legacy payload is treated as a value with no TTL.
  const readEnvelope = (key) => {
    let raw;
    try { raw = storage.getItem(key); } catch { return null; }
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      const isEnvelope =
        parsed !== null && typeof parsed === "object" && "v" in parsed && "e" in parsed;
      return isEnvelope ? parsed : { v: parsed, e: null };
    } catch {
      return { v: raw, e: null }; // legacy raw string written before TTL existed
    }
  };

  // e === null means "no expiry"; otherwise e is an absolute ms timestamp.
  const expired = (env) => env.e !== null && now() >= env.e;

  const get = (key) => {
    const env = readEnvelope(key);
    if (env === null) return null;
    if (expired(env)) {
      try { storage.removeItem(key); } catch { /* already gone */ } // lazy eviction
      return null;
    }
    return env.v;
  };

  return {
    get,

    set(key, value, ttlMs = Infinity) {
      // Only finite TTLs get a timestamp; Infinity/NaN mean "never expires".
      const e = Number.isFinite(ttlMs) ? now() + Math.max(0, ttlMs) : null;
      try {
        storage.setItem(key, JSON.stringify({ v: value, e }));
        return true;
      } catch {
        return false; // quota exceeded / storage disabled
      }
    },

    has(key) {
      return get(key) !== null;
    },

    remove(key) {
      try { storage.removeItem(key); } catch { /* ignore */ }
    },

    purge() {
      // Snapshot first: Storage's index shifts as items are removed.
      const keys = [];
      try {
        for (let i = 0; i < storage.length; i += 1) keys.push(storage.key(i));
      } catch { return 0; }

      let removed = 0;
      for (const key of keys) {
        if (key === null) continue;
        const env = readEnvelope(key);
        if (env !== null && expired(env)) {
          try { storage.removeItem(key); removed += 1; } catch { /* ignore */ }
        }
      }
      return removed;
    },
  };
}
```

### Walkthrough

Take `set("token", "abc", 1000)` at `t = 0`:

1. `Number.isFinite(1000)` is true, so `e = 0 + Math.max(0, 1000) = 1000`. The stored string is `'{"v":"abc","e":1000}'`.
2. `get("token")` at `t = 400`: `readEnvelope` parses, `"v" in parsed` and `"e" in parsed` are true, so the envelope is returned. `expired` is `1000 !== null && 400 >= 1000` → `false`. `get` returns `"abc"`.
3. `get("token")` at `t = 1000`: `1000 >= 1000` → `true`, so `removeItem("token")` runs and `get` returns `null`. Note this is the boundary case: `ttlMs = 0` behaves identically, which is what we want.
4. `get("token")` at `t = 1200`: `getItem` returns `null`, so `readEnvelope` returns `null` and we short-circuit — one fewer parse, and the key is genuinely gone.

Now the `purge()` path with `set("a", 1, 50)` and `set("b", 2, 10_000)` at `t = 0`, then `purge()` at `t = 100`. The snapshot is `["a", "b"]`. For `"a"`: `100 >= 50` → removed, `removed = 1`. For `"b"`: `100 >= 10_000` is false → kept. `purge()` returns `1`, and `get("b")` still returns `2`.

Finally the legacy path: a key `theme` holding the raw string `"dark"` (written by older code). `JSON.parse('"dark"')` succeeds and yields the string `"dark"` — but `"v" in "dark"` is `false` (and `in` on a primitive throws `TypeError`, which is why the `typeof parsed === "object"` guard comes first). So `readEnvelope` returns `{ v: "dark", e: null }` and the value is served without expiry rather than deleted.

### Complexity

Time: `get`/`set` are `O(n)` in payload size for the `JSON.parse`/`stringify` (the envelope adds two fields, not a second pass). `purge` is `O(k)` in the number of keys on the origin, since each one must be read and parsed to inspect its `e`. Space: `O(k)` for the snapshot array, `O(n)` for the parsed envelope. Nothing here is a timer, so idle cost is zero.

### Edge Cases

- **`ttlMs = 0`** → `e = now`, and `>=` expires it on the very next read, including a same-millisecond one.
- **Negative / fractional TTL** → clamped by `Math.max(0, ...)`; `1.5` gives `e = now + 1.5` and `Date.now()` is integral, so it expires at `now + 2` effectively. No rounding needed, but do not assume integer `e`.
- **`Infinity` / `NaN`** → both non-finite → `e = null` → never expires. If you want `NaN` to mean "expire now," test `Number.isNaN` before the `isFinite` check. State the rule; do not leave it implicit.
- **Absent vs expired** → both `null`. If a caller must tell them apart (e.g. "session expired, please log in" vs "no session"), return an envelope from a `getEntry` variant instead of overloading `null`.
- **Legacy raw entries** → returned as-is, no expiry, never deleted.
- **Corrupt JSON** → fail open: the raw string is returned. The alternative (delete) loses user data on a parse bug.
- **Stored `undefined`** → the envelope's `v` is `undefined`, so `get` returns `undefined`, not `null`, and `has` would report `false`. Decide whether `has` means "present" (check the envelope) or "has a non-null value."
- **Clock changes** → wall-clock TTL is at the mercy of the user's clock and NTP steps. Say so out loud.
- **Storage unavailable** → `getItem`/`setItem` throw; `get` returns `null`, `set` returns `false`.
- **Quota** → the envelope is slightly larger than the raw value; `set` returns `false` rather than throwing. A useful refinement is "purge, then retry once."
- **Multi-tab** → two tabs may both discover and delete the same expired key. `removeItem` is idempotent, so the race is harmless.
- **Very large `ttlMs`** → `now + 1e15` is still an exact integer below `Number.MAX_SAFE_INTEGER`, so no overflow concerns in practice; `Infinity` is handled separately.

### Interview Follow-ups

- **Sliding expiration:** refresh `e` on each read. Convenient, but it means an actively-polling tab never logs out — a footgun for auth. Prefer absolute server-issued expiry.
- **`onExpire` callbacks with a timer:** find the smallest `e`, `setTimeout` for it, re-arm on `visibilitychange` and after each `purge`. Timers are an *optimization* for notification; the lazy check remains the source of truth because background tabs throttle timers and reloads lose them entirely.
- **In-memory L1 cache:** keep a `Map` of parsed envelopes to avoid `JSON.parse` on every read; invalidate on `set`/`remove`. Measure before adding it — parsing a few hundred bytes is cheap.
- **Envelope versioning:** `{ v: 2, value, e }` so the schema can migrate without breaking old entries.
- **Encryption / signing:** TTL is not a security control. A client can rewrite `e`, and any script on the origin can read the value.

### Common Mistakes

- Storing a relative TTL (`{ value, ttl: 1000 }`) and resetting the countdown on every reload.
- Relying on `setTimeout` alone: the timer is lost on reload and throttled in background tabs, so entries outlive their TTL.
- Using `>` instead of `>=`, so `ttlMs = 0` entries can still be read in the same millisecond.
- Parsing twice (`JSON.parse` to check `e`, again to return `v`) — one parse, return `env.v`.
- Deleting entries that fail to parse, destroying data on a schema change.
- Mutating storage while iterating `storage.length`/`storage.key(i)`, which skips entries during `purge`.
- Treating a client-side TTL as an authorization decision.

### Takeaway

TTL is a property of the **entry**, not of a timer: persist an absolute `expiresAt` beside the value, enforce it lazily on read, and sweep opportunistically. Timers are for notifying, never for correctness — which is exactly why expiry survives reloads, suspension, and closed tabs for free.

## Sync State Across Tabs with the `storage` Event

`Difficulty: Medium` `Probability: High`

### Problem

Implement `syncAcrossTabs(key, onChange)` — subscribe to changes of one `localStorage` key made in **other** tabs, and return an `unsubscribe` function. The contract:

- Writes are a JSON envelope under a namespaced key; reads parse defensively and never throw.
- The `storage` event fires in **every other** `Window` on the origin, never in the tab that wrote.
- `onChange(nextValue, { key, url, cleared })` is called only for the subscribed key; `unsubscribe()` removes the listener.

### Examples

```text
// Tab A:                         // Tab B (subscribed to "app:theme"):
syncAcrossTabs("app:theme", (v) => render(v));
localStorage.setItem("app:theme", '"dark"')
                                  // => onChange("dark") fires in Tab B only
                                  // => Tab A hears nothing
localStorage.removeItem("app:theme")
                                  // => onChange(null) fires in Tab B
localStorage.clear()
                                  // => onChange(null, { cleared: true }) in Tab B
unsub()                           // => Tab B stops hearing anything
```

### Approach

The `storage` event is the browser's built-in cross-tab bus, but its shape surprises people:

1. **It never fires locally.** `window.addEventListener("storage", ...)` observes writes from other browsing contexts only. The writing tab must update its own UI directly — do not wait for an event that will never come.
2. **Namespace the key.** Subscribe to the full key (`"app:theme"`), not a prefix, because the event carries `event.key`, `event.newValue`, and `event.url`. On `clear()`, `event.key` is `null` — treat that as "everything may be gone" and re-read or report `cleared: true`.
3. **Parse, do not trust.** `event.newValue` is a string or `null` (removal). Parse with `JSON.parse` in `try`/`catch`; a corrupt payload calls `onChange` with a fallback rather than throwing inside an event handler.
4. **Return cleanup.** The listener closes over `onChange`. `unsubscribe` calls `removeEventListener` with the **same function reference** — an inline arrow in both places leaks.
5. **Same-origin and same-storage only.** `sessionStorage` changes never cross tabs (it is per-tab), and `storage` events do not fire across origins or in workers. Say that boundary out loud.

### Implementation

```javascript
function syncAcrossTabs(key, onChange, { fallback = null } = {}) {
  if (typeof onChange !== "function") throw new TypeError("onChange must be a function");

  const parse = (raw) => {
    if (raw === null) return fallback; // removeItem or clear
    try {
      return JSON.parse(raw);
    } catch {
      return fallback; // corrupt payload: fail open, never throw in handler
    }
  };

  const handler = (event) => {
    // event.key is null when clear() wiped the whole origin.
    if (event.key === null) {
      onChange(parse(event.newValue), { key, url: event.url, cleared: true });
      return;
    }
    if (event.key !== key) return; // namespaced: ignore other keys
    // event.storageArea distinguishes localStorage from sessionStorage.
    onChange(parse(event.newValue), { key, url: event.url, cleared: false });
  };

  window.addEventListener("storage", handler);

  // Optional: hydrate immediately so the subscriber starts from current truth.
  // hydrate() is separate from the event path on purpose.
  const hydrate = () => {
    let raw = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }
    return parse(raw);
  };

  const unsubscribe = () => window.removeEventListener("storage", handler);
  return { unsubscribe, hydrate };
}
```

### Walkthrough

Tab B calls `syncAcrossTabs("app:theme", render)`; Tab A runs `localStorage.setItem("app:theme", '"dark"')`:

1. Tab A's write commits synchronously. No event fires in Tab A.
2. The browser dispatches a `StorageEvent` to every other `Window` on the origin. In Tab B, `event.key` is `"app:theme"`, `event.newValue` is `'"dark"'`, `event.url` is Tab A's URL.
3. `handler` runs: `event.key === null` is false; `event.key !== key` is false, so it proceeds. `parse('"dark"')` returns `"dark"`.
4. `onChange("dark", { key: "app:theme", url, cleared: false })` runs `render("dark")`.
5. Later Tab A calls `removeItem("app:theme")`: `event.newValue` is `null`, so `parse` returns `fallback` (`null`) and Tab B renders the default.

### Complexity

Time: `O(n)` in payload size per event for the parse; filtering by key is `O(1)`. Space: `O(n)` for the parsed value. The listener itself is idle — no polling, no timers.

### Edge Cases

- **Writing tab hears nothing** — the single most-tested fact. Update local UI at the write site.
- **`clear()`** → `event.key` is `null`, `newValue` is `null`. Report `cleared: true` so the caller can re-hydrate every key.
- **`removeItem`** → `newValue` is `null`, indistinguishable from "stored null" unless you use an envelope like `{ v }`.
- **Unrelated keys** → early return. Without the guard, a busy origin spams every subscriber.
- **Corrupt JSON** → fallback, no throw. Event handlers that throw still swallow the update.
- **`storageArea`** → check it if the page uses both storages; `sessionStorage` events fire only between frames sharing a tab.
- **File:// and sandboxed iframes** → `localStorage` access can throw; the `hydrate` path guards it.
- **Race on read-modify-write** → two tabs incrementing one key lose updates. The event notifies; it does not lock.

### Interview Follow-ups

- **Elect a leader tab:** on `storage` heartbeat keys, the tab with the smallest `id` in `sessionStorage` owns the WebSocket; others take over when its heartbeat expires.
- **Debounce rapid writes:** coalesce bursts with a microtask before re-rendering.
- **Why not poll `localStorage` on an interval?** Synchronous reads block the main thread and drain battery; the event is push-based and free.
- **When is `BroadcastChannel` better?** Next problem — transient messages that must also reach the sending tab's peers without touching disk.

### Common Mistakes

- Expecting the event in the writing tab and concluding "it doesn't work."
- Comparing `event.newValue` (a string) directly to objects without parsing.
- Forgetting `event.key === null` for `clear()`, so a wipe leaves stale UI.
- Calling `removeEventListener("storage", () => ...)` with a fresh arrow — the listener never detaches.
- Subscribing with an un-namespaced key like `"theme"` and colliding with another library on the origin.

### Takeaway

The `storage` event is a push notification to **other** tabs: filter by exact key, parse defensively, handle the `key === null` clear case, and always return an `unsubscribe` that removes the same listener.

## Communicate Across Tabs with `BroadcastChannel`

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `createTabBus(name)` — a tiny pub/sub over `BroadcastChannel` with `post(message)`, `subscribe(listener)`, and `close()`. The contract:

- Every **open** context on the same origin with the same channel `name` receives each message, **including** other tabs, windows, iframes, and workers — but never the posting object itself in some browsers, so do not rely on self-delivery.
- `close()` detaches everything: no more sends, no more receives, no leaked channel.
- Messages use the structured-clone algorithm, not JSON strings.

### Examples

```text
const a = createTabBus("chat");
const b = createTabBus("chat");
const unsub = b.subscribe((msg) => console.log("b got", msg));

a.post({ text: "hi" });   // => b logs: b got { text: "hi" }
unsub();                  // => b stops receiving
a.close(); b.close();     // => channels released
```

### Approach

`BroadcastChannel` is the purpose-built tab bus; `storage` events are the fallback that happens to notify:

1. **One channel per bus, one listener set per channel.** `new BroadcastChannel(name)` joins the named room. Keep a `Set` of listeners and attach a single `channel.onmessage` dispatcher — attaching one native handler per subscriber leaks and reorders.
2. **Structured clone, not JSON.** Dates, Maps, typed arrays, and circular objects survive; functions, DOM nodes, and `WeakMap`s do not and throw `DataCloneError`. `undefined` and class prototypes need care: the prototype is dropped.
3. **Self-delivery is unreliable.** The spec does not deliver to the posting object, but some browsers echo to *other* objects on the same channel name in the *same* page. Never design a protocol that requires (or forbids) self-receipt — update local state directly at the post site.
4. **Lifecycle is explicit.** `channel.close()` leaves the room; after it, `post` throws `InvalidStateError` in some browsers and silently drops in others, and queued messages may never arrive. Guard with a `closed` flag and make `close()` idempotent.
5. **Compare with `storage` events deliberately.** Channel messages are transient (no persistence, no late-joiner replay) and reach same-page peers; `storage` events persist the last value (late joiners read it) but never reach the writer. Interviewers want that table.

### Implementation

```javascript
function createTabBus(name) {
  if (!("BroadcastChannel" in globalThis)) {
    throw new Error("BroadcastChannel is not supported in this browser");
  }

  const channel = new BroadcastChannel(name);
  const listeners = new Set();
  let closed = false;

  // Single native entry point; fan out to the Set so unsubscribe is O(1).
  channel.onmessage = (event) => {
    for (const listener of [...listeners]) {
      try {
        listener(event.data, event);
      } catch {
        // One bad subscriber must not break the rest of the fan-out.
      }
    }
  };

  return {
    post(message) {
      if (closed) return false;
      try {
        channel.postMessage(message); // structured clone happens here
        return true;
      } catch {
        return false; // DataCloneError: function, DOM node, WeakMap, ...
      }
    },

    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      listeners.add(listener);
      // Cleanup for THIS subscriber only; the channel stays open for others.
      return () => {
        listeners.delete(listener);
      };
    },

    messageCount() {
      return listeners.size;
    },

    close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      channel.onmessage = null; // break the native -> JS reference before close
      channel.close();          // leave the room; releases the underlying port
    },
  };
}
```

### Walkthrough

Two tabs open the same origin; each runs `createTabBus("chat")` and subscribes:

1. Tab A calls `post({ text: "hi" })`. The browser structured-clones `{ text: "hi" }` — the receiver gets a distinct object, so `msg !== original`.
2. Tab B's `channel.onmessage` fires with `event.data` as the clone. The dispatcher iterates the snapshot `[...listeners]` and calls each one.
3. A second subscriber in Tab B that throws does not stop the first: the `try`/`catch` around each call contains the failure.
4. Tab B calls its `unsub()`: only its entry leaves the `Set`; Tab A's channel is unaffected. When both call `close()`, `closed` flips, the `Set` clears, `onmessage` is nulled, and the ports release. A late `post` returns `false` instead of throwing.

### Complexity

Time: `O(s)` per message for `s` subscribers, plus `O(n)` structured-clone cost in payload size. Space: `O(n)` for the clone held until dispatch completes. Idle cost is zero — no polling.

### Edge Cases

- **Unsupported browsers (older Safari/SSR/workers without it)** → feature-detect and fall back to `storage` events, or throw a clear error as above. Decide and state it.
- **Un-cloneable payloads** → functions, DOM nodes, `WeakRef`s throw `DataCloneError`; `post` returns `false` instead of propagating.
- **Prototype loss** → class instances arrive as plain objects; rehydrate with a `type` field and a factory.
- **`close()` then `post()`** → guarded to `false`. Without the flag, behaviour differs by browser.
- **Unsubscribe during dispatch** → iterate a snapshot so a listener removing itself does not skip its neighbour.
- **Name collisions** → the channel name is global per origin; prefix it (`"app:chat"`) like storage keys.
- **No persistence** → a tab opened after the message never sees it. Persist last-value separately if late joiners need state.

### Interview Follow-ups

- **`storage` event vs `BroadcastChannel`:** persistence (storage wins, late joiners read) vs transience and self-page delivery (channel wins); payload (string-only vs structured clone); writer notification (never vs unreliable). Draw the table.
- **Leader election / locks:** combine a channel heartbeat with a `localStorage` timestamp; the lowest-id live tab owns the socket.
- **Exactly-once delivery:** add `{ id, retries }` and an ack channel; the bus itself is at-most-once per open context.
- **Cross-origin tabs:** neither primitive crosses origins — use `postMessage` on a shared `window.open` reference or a server relay.

### Common Mistakes

- Relying on self-delivery (or its absence) in application logic — both assumptions break across browsers.
- Attaching `channel.onmessage = listener` per subscriber so each subscribe overwrites the last.
- Forgetting `channel.close()` on unmount/pagehide, leaking a port per navigation in SPAs.
- Sending class instances and reading methods on the other side — prototypes do not survive the clone.
- Using the channel as storage: expecting a newly opened tab to receive yesterday's message.

### Takeaway

`BroadcastChannel` is a transient, structured-clone bus for a named room: one native handler fanning out to a `Set`, never depend on self-delivery, and `close()` must clear listeners, null the handler, and close the port.

## Implement Copy to Clipboard

`Difficulty: Easy` `Probability: High`

### Problem

Implement `copyText(text)` returning `Promise<boolean>` — `true` on success, `false` on any failure, never throws. The contract:

- Prefer the async `navigator.clipboard.writeText`; fall back to the legacy `execCommand("copy")` path where the Clipboard API is missing, insecure, or denied.
- Works only after a **user gesture** and (for the modern API) in a **secure context**; every failure collapses to `false`.

### Examples

```text
await copyText("hello@example.com"); // => true  (button click, HTTPS)
await copyText("no gesture yet");    // => false (called on page load, denied)
await copyText("http page");         // => true via execCommand fallback (Clipboard API absent)
```

### Approach

Clipboard access is a permission-gated capability, not a plain function:

1. **Try modern first.** `navigator.clipboard?.writeText(text)` is async, preserves Unicode, and needs no DOM hacks. It resolves only in secure contexts (`https:`, `localhost`) after a user activation; otherwise it rejects with `NotAllowedError`/`SecurityError`.
2. **Fall back to selection + `execCommand`.** Create a temporary off-screen `textarea`, set its `value`, append it, `focus()` + `select()`, call `document.execCommand("copy")` (returns a boolean), then remove the node in a `finally`. The element must be attached and visible-ish — `display: none` or `opacity: 0` with zero size breaks selection in some browsers.
3. **Never throw.** Normalise `undefined`, denial, missing API, and `execCommand` returning `false` into one `false`. Callers branch on the boolean (show "Press ⌘C") rather than catching five error shapes.
4. **Gesture discipline.** Call `copyText` synchronously inside the click/keydown handler. Awaiting a `fetch` first consumes the transient activation and turns a success into `NotAllowedError`.
5. **Permissions are advisory.** `navigator.permissions.query({ name: "clipboard-write" })` is unsupported in Firefox/Safari; treat it as a hint, not a gate, and just attempt the write.

### Implementation

```javascript
async function copyText(text) {
  const value = String(text ?? "");
  if (value === "") return false; // nothing to copy; avoid a fake "success"

  // 1. Modern path: async, no DOM needed, requires gesture + secure context.
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to execCommand: denial, insecure context, no focus.
  }

  // 2. Legacy path: selection-based copy. Must run on the main thread with a live DOM.
  try {
    const area = document.createElement("textarea");
    area.value = value;
    // Off-screen but selectable: display:none breaks select() in some browsers.
    area.style.position = "fixed";
    area.style.top = "-9999px";
    area.style.left = "-9999px";
    area.setAttribute("readonly", ""); // keeps iOS keyboard from popping up
    document.body.appendChild(area);
    try {
      area.focus({ preventScroll: true });
      area.select();
      area.setSelectionRange(0, area.value.length); // iOS needs the explicit range
      return document.execCommand("copy"); // boolean, deprecated but universal
    } finally {
      area.remove(); // cleanup even when execCommand throws
    }
  } catch {
    return false;
  }
}
```

### Walkthrough

Click handler runs `await copyText("hello@example.com")` on HTTPS:

1. `value` is non-empty. `navigator.clipboard.writeText` exists, so we `await` it. The browser checks transient activation (the click) and the secure context — both pass — and writes to the OS clipboard. Return `true`.
2. Same call on `http:` in an old browser: `navigator.clipboard` is `undefined`, so the first block is skipped. The fallback appends the off-screen `textarea`, `select()`s `"hello@example.com"`, `execCommand("copy")` returns `true`, and `finally` removes the node. Return `true`.
3. Called from `setTimeout` with no gesture: `writeText` rejects `NotAllowedError`; the fallback's `execCommand` returns `false` (or throws), the outer `catch` returns `false`. The caller shows a manual-copy hint.

### Complexity

Time: `O(n)` in string length for the OS copy; DOM churn is one append/remove. Space: `O(n)` for the temporary `textarea` value. Both paths are one-shot — no listeners, no retained state.

### Edge Cases

- **Empty string** → `false` by choice; copying `""` clears the clipboard on some platforms, which is rarely intended.
- **Non-strings** → coerced with `String(text ?? "")`; `null`/`undefined` become `""` and return `false`.
- **Insecure context** → `navigator.clipboard` may be `undefined` over `http:`; the fallback is the whole answer.
- **No gesture** → both paths fail; surface fallback UI with the text pre-selected.
- **`display: none` textarea** → selection fails silently; position off-screen instead.
- **iOS Safari** → needs `readonly`, `focus()`, and `setSelectionRange`; without them `select()` picks nothing.
- **SSR / no DOM** → `document` is undefined; guard or restrict this function to client code.
- **Permissions API gaps** → do not gate on `query("clipboard-write")`; Firefox throws `TypeError` for it.

### Interview Follow-ups

- **Read from the clipboard:** `navigator.clipboard.readText()` needs the `clipboard-read` permission and a stricter gesture; paste via `paste` event access to `event.clipboardData` is the legacy route.
- **Copy rich HTML:** `ClipboardItem` with `"text/html"` + `"text/plain"` fallbacks so pasting into Notepad still works.
- **Show feedback:** return the boolean into a toast ("Copied") vs an inline "Select and press ⌘C" fallback with the text selected.
- **Why `execCommand` at all?** Deprecated but the only path in insecure contexts and older browsers; production code keeps it until the fallback's share is negligible.

### Common Mistakes

- Calling `copyText` after an `await fetch(...)` and losing transient activation.
- Hiding the fallback `textarea` with `display: none`, which makes `select()` a no-op.
- Forgetting `area.remove()` on failure, stacking invisible nodes on repeated clicks.
- Letting `NotAllowedError` propagate instead of collapsing to `false` with fallback UI.
- Assuming `navigator.clipboard` exists everywhere — it is `undefined` in insecure contexts and older browsers.

### Takeaway

Try async `writeText` inside the gesture, fall back to an off-screen selectable `textarea` + `execCommand`, remove the node in a `finally`, and collapse every denial into `false` with manual-copy UI.

## Implement Drag-and-Drop List Ordering

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `makeSortable(listEl, { onOrder })` — turn a `<ul>`/`<ol>` into a reorderable list with plain JavaScript, returning a `destroy()` cleanup. The contract:

- Dragging an item over a sibling shows where it will land; dropping commits the order and calls `onOrder(idsInNewOrder)`.
- Works with keyboard (`ArrowUp`/`ArrowDown` on a focused item) as an accessible equivalent.
- `destroy()` removes every listener and attribute the setup added.

### Examples

```text
<ul id="todos">
  <li data-id="a">Buy milk</li>
  <li data-id="b">Write report</li>
  <li data-id="c">Call mom</li>
</ul>
// Drag "Call mom" over "Buy milk" and drop:
// => DOM becomes c, a, b; onOrder(["c", "a", "b"])
```

### Approach

Two engines; know both, implement one with reasons. **HTML5 DnD** (`draggable`, `dragstart`/`dragover`/`drop`) gives a native drag image but `dragover` must `preventDefault()` or `drop` never fires, and touch support is poor. **Pointer Events** give full control and touch support but you own the ghost, auto-scroll, and hit-testing. Below is HTML5 DnD (the interview default) with delegation: one listener set on the `<ul>`, `closest("li")` to find targets, midpoint test for before/after, `insertBefore` to move, plus `tabindex` + arrows for keyboard parity. Every listener and attribute is tracked so `destroy()` undoes it.

### Implementation

```javascript
function makeSortable(listEl, { onOrder } = {}) {
  const items = () => [...listEl.querySelectorAll(":scope > li")];
  const ids = () => items().map((li) => li.dataset.id ?? li.textContent);
  let draggedId = null;
  let dropAfter = false;
  const cleanups = [];

  const on = (target, type, fn) => {
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  };
  for (const li of items()) {
    li.setAttribute("draggable", "true"); // cleanup removes both below
    li.setAttribute("tabindex", "0");
  }
  const clearIndicator = () => {
    for (const li of items()) li.classList.remove("drop-indicator");
  };
  on(listEl, "dragstart", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    draggedId = li.dataset.id ?? li.textContent;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", draggedId); } catch { /* Safari */ }
    li.classList.add("dragging");
  });
  on(listEl, "dragend", () => {
    draggedId = null;
    clearIndicator();
    listEl.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
  });
  on(listEl, "dragover", (e) => {
    e.preventDefault(); // REQUIRED: without it, drop never fires
    const over = e.target.closest("li");
    clearIndicator();
    if (!over || over.dataset.id === draggedId) return;
    const rect = over.getBoundingClientRect();
    dropAfter = (e.clientY - rect.top) > rect.height / 2;
    over.classList.add("drop-indicator");
  });
  on(listEl, "drop", (e) => {
    e.preventDefault();
    const over = e.target.closest("li");
    const dragged = listEl.querySelector(`[data-id="${CSS.escape(draggedId ?? "")}"]`);
    clearIndicator();
    if (!over || !dragged || over === dragged) return;
    listEl.insertBefore(dragged, dropAfter ? over.nextSibling : over);
    onOrder?.(ids());
  });
  on(listEl, "keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const li = e.target.closest("li");
    if (!li) return;
    e.preventDefault(); // arrows now reorder instead of scrolling
    const sib = e.key === "ArrowUp" ? li.previousElementSibling : li.nextElementSibling;
    if (!sib) return;
    listEl.insertBefore(li, e.key === "ArrowUp" ? sib : sib.nextSibling);
    li.focus();
    onOrder?.(ids());
  });

  return function destroy() {
    for (const li of items()) {
      li.removeAttribute("draggable");
      li.removeAttribute("tabindex");
    }
    while (cleanups.length) cleanups.pop()();
  };
}
```

```html
<ul id="todos">
  <li data-id="a">Buy milk</li>
  <li data-id="b">Write report</li>
  <li data-id="c">Call mom</li>
</ul>
```

### Walkthrough

List is `a, b, c`. The user drags `c` above `a` and drops:

1. `dragstart` on `c`: `draggedId = "c"`, `c` gets `.dragging`.
2. `dragover` on `a`: `preventDefault()` keeps the drop alive; pointer is above `a`'s midpoint so `dropAfter` is false and `a` gets `.drop-indicator`.
3. `drop` on `a`: `insertBefore(c, a)` → DOM is `c, a, b`; `onOrder(["c", "a", "b"])` fires; `dragend` clears the classes.

### Complexity

Time: `O(1)` per drag event; `onOrder` maps `O(m)` items. Space: `O(m)` for the snapshots. No timers, nothing retained after `destroy()`.

### Edge Cases

- **Missing `preventDefault` in `dragover`** → `drop` never fires; the most common DnD bug.
- **Drop on itself / empty space** → no-op via the `over === dragged` / `!over` guards.
- **Ids with quotes** → `CSS.escape` the selector; items without `data-id` fall back to `textContent`.
- **Touch devices** → HTML5 DnD barely fires; state the Pointer Events alternative.
- **Destroyed list** → `destroy()` must run on unmount or `dragover` leaks.

### Interview Follow-ups

- **Pointer Events version:** ghost clone, `elementFromPoint` hit-testing, auto-scroll, `setPointerCapture`.
- **Cross-list dragging:** accept a group name, report `{ from, to }` orders.

### Common Mistakes

- Forgetting `preventDefault()` in `dragover` and debugging `drop` for an hour.
- Reading `dataTransfer.getData` in `dragover` — restricted mid-drag; keep the closure variable.
- Per-item listeners with no matching removals, leaking on every re-render.
- No keyboard path — fails basic accessibility review.
- Reordering via `innerHTML`, which destroys focus and item state.

### Takeaway

DnD ordering is `dragstart` → `preventDefault` in `dragover` → midpoint test → `insertBefore` in `drop`, plus an arrow-key equivalent — with every listener and attribute tracked so `destroy()` leaves nothing behind.

## Implement Keyboard Shortcuts

`Difficulty: Medium` `Probability: High`

### Problem

Implement `createShortcuts(target = window)` with `register(combo, handler)`, `unregister(combo, handler)`, and `destroy()`. The contract:

- `combo` looks like `"ctrl+s"`, `"cmd+shift+p"`, `"?"`, or `"escape"` — case-insensitive, modifiers in any order.
- Handlers fire only on exact matches, never while the user types in inputs (unless opted in), and `preventDefault` runs only for handled combos.
- One native `keydown` listener total; `destroy()` removes it.

### Examples

```text
const sc = createShortcuts();
sc.register("ctrl+s", (e) => saveDoc());   // => fires on Ctrl+S (or Cmd+S? see below)
sc.register("cmd+k", (e) => openPalette());
sc.register("?", (e) => openHelp());       // => Shift+/ matches "?"
sc.unregister("cmd+k", openPalette);
sc.destroy();                              // => native listener removed
```

### Approach

Shortcut handling is normalisation plus restraint. Normalise registration (`"Cmd+S"`) and the event (`event.key` + modifier flags) to one canonical `ctrl+meta+shift+alt+key` string, so order and case never matter — keeping `ctrl` and `meta` distinct for cross-platform save. Dispatch from a single `keydown` listener (not deprecated `keypress`) into a `Map` of combos. Skip typing contexts (`input`/`textarea`/`select`/`contentEditable`/IME) unless opted in, and `preventDefault` only inside the match branch so unowned combos keep their browser behaviour.

### Implementation

```javascript
function createShortcuts(target = globalThis.window) {
  const MODS = ["ctrl", "meta", "shift", "alt"];
  const ALIASES = {
    esc: "escape", cmd: "meta", command: "meta",
    control: "ctrl", option: "alt", del: "delete", space: " ",
  };

  const normaliseCombo = (combo) => {
    const mods = new Set();
    let key = null;
    for (let part of String(combo).toLowerCase().split("+")) {
      part = (ALIASES[part.trim()] ?? part.trim());
      if (MODS.includes(part)) mods.add(part);
      else if (key === null) key = part;
      else throw new Error(`Invalid combo "${combo}"`);
    }
    if (!key) throw new Error(`Invalid combo "${combo}"`);
    return [...MODS.filter((m) => mods.has(m)), key].join("+");
  };

  const eventToCombo = (e) => {
    const mods = [
      e.ctrlKey && "ctrl", e.metaKey && "meta",
      e.shiftKey && "shift", e.altKey && "alt",
    ].filter(Boolean);
    return [...mods, e.key.toLowerCase()].join("+");
  };

  const isTyping = (e) => {
    if (e.isComposing) return true;
    const t = e.target;
    if (!(t instanceof Element)) return false;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  };

  const registry = new Map(); // combo -> Set of entries
  const onKeydown = (e) => {
    if (e.defaultPrevented) return;
    const entries = registry.get(eventToCombo(e));
    if (!entries?.size || e.repeat) return;
    if ([...entries].every((en) => !en.allowInInputs) && isTyping(e)) return;
    for (const { handler, preventDefault } of [...entries]) {
      if (preventDefault) e.preventDefault(); // only combos we own
      try { handler(e); } catch { /* one bad handler must not break dispatch */ }
    }
  };

  target.addEventListener("keydown", onKeydown);

  return {
    register(combo, handler, { allowInInputs = false, preventDefault = true } = {}) {
      if (typeof handler !== "function") throw new TypeError("handler must be a function");
      const key = normaliseCombo(combo);
      if (!registry.has(key)) registry.set(key, new Set());
      const entry = { handler, allowInInputs, preventDefault };
      registry.get(key).add(entry);
      return () => this.unregister(combo, handler);
    },
    unregister(combo, handler) {
      const key = normaliseCombo(combo);
      const entries = registry.get(key);
      if (!entries) return;
      for (const entry of [...entries]) {
        if (entry.handler === handler) entries.delete(entry);
      }
      if (entries.size === 0) registry.delete(key);
    },
    destroy() {
      target.removeEventListener("keydown", onKeydown);
      registry.clear();
    },
  };
}
```

### Walkthrough

`register("Cmd+Shift+P", palette)` then Cmd+Shift+P is pressed:

1. Registration canonicalises to `"meta+shift+p"` (`cmd → meta`, mods sorted).
2. The event has `key === "P"` with `metaKey`/`shiftKey` true → lowercased to `"meta+shift+p"`. Match.
3. Target is `body` (not typing), not a repeat → `preventDefault()` runs, then `palette(e)`. In a search `<input>` with `allowInInputs: false`, step 3 returns early.

### Complexity

Time: `O(1)` per keydown — one normalise + one `Map` lookup + `O(h)` handlers for that combo. Space: `O(c)` registered combos. One listener regardless of shortcut count.

### Edge Cases

- **`ctrl` vs `meta`** → distinct. `"ctrl+s"` does not fire on Cmd+S; register both for cross-platform save.
- **`"?"` vs `"shift+/"`** → `event.key` is `"?"` on US layouts; other layouts differ by physical key — note it.
- **IME composition** → `isComposing` guard prevents stealing keystrokes mid-composition.
- **Held keys** → `e.repeat` returns early; opt out per-registration for continuous actions.

### Interview Follow-ups

- **Sequence shortcuts (`g` then `i`):** buffer recent keys with timestamps, match prefixes, expire after ~1s of inactivity.
- **Scoped shortcuts:** bind per-panel targets or check `closest("[data-scope]")` so the editor's keys do not fire in the modal.
- **Discoverability:** derive the help overlay (`?`) from the registry instead of maintaining a separate list.
- **Why `event.key` over `keyCode`?** `keyCode` is deprecated and layout-dependent; `key`/`code` distinguish character (`?`) from physical position (`Slash`).

### Common Mistakes

- `preventDefault()` on every `keydown`, breaking Tab navigation and browser find.
- Listening to `keypress` (deprecated, no modifiers) or `keyup` (action lags the press).
- Firing shortcuts while typing — the `?`-opens-help-while-typing-a-question bug.
- Matching `keyCode` numbers, which differ across layouts and are deprecated.
- Adding one native listener per shortcut and removing none of them on unmount.

### Takeaway

Normalise registration and events to one canonical `mods+key` string, dispatch from a single `keydown` listener, skip typing contexts, and `preventDefault` only the combos you actually handle — with `destroy()` removing that one listener.

## Detect Online and Offline Status

`Difficulty: Easy` `Probability: Medium`

### Problem

Implement `watchOnlineStatus(onChange)` — report connectivity as `{ online, since, type }`, call `onChange` on every transition, and return `{ get, unsubscribe }`. The contract:

- Initial state comes from `navigator.onLine`; transitions come from `window` `online`/`offline` events.
- `online` is a best-effort hint, not proof of internet — document the heartbeat follow-up.
- `unsubscribe()` removes both listeners.

### Examples

```text
const { get, unsubscribe } = watchOnlineStatus((s) => banner(s.online));
get()            // => { online: true, since: 1726754400000, type: "initial" }
                 // unplug cable:
                 // => onChange({ online: false, since: ..., type: "offline" })
                 // replug:
                 // => onChange({ online: true, since: ..., type: "online" })
unsubscribe();   // => no further callbacks
```

### Approach

The platform gives a cheap signal and leaves verification to you:

1. **Seed from `navigator.onLine`, track transitions with events.** `navigator.onLine` is `false` only when the browser is *sure* it is offline (airplane mode, no NIC). `true` means "a network interface is up," not "the internet works." Listen for `online`/`offline` on `window` and stamp each state with `Date.now()` in `since`.
2. **Debounce the flap.** Cables, tunnels, and captive portals oscillate. Emit immediately but include `since` so the UI can show "Back online · syncing…" until a heartbeat confirms.
3. **Verify with a heartbeat (the follow-up you must mention).** On `online`, fetch a tiny same-origin endpoint (`/health`, `cache: "no-store"`) with a timeout; only then mark "confirmed." A captive portal returns `200` for everything, so check the body, not just the status.
4. **Clean up both listeners.** Two `addEventListener` calls need two matching `removeEventListener` calls with the same references — `unsubscribe` does both and is safe to call twice.
5. **SSR honesty.** `navigator`/`window` may not exist; default to `{ online: true }` (assume online, render, then correct on mount) rather than throwing during render.

### Implementation

```javascript
function watchOnlineStatus(onChange) {
  if (typeof onChange !== "function") throw new TypeError("onChange must be a function");

  const supported = typeof window !== "undefined" && typeof navigator !== "undefined";
  let state = {
    online: supported ? navigator.onLine !== false : true, // SSR: assume online
    since: Date.now(),
    type: "initial",
  };

  const emit = (online, type) => {
    state = { online, since: Date.now(), type };
    try {
      onChange({ ...state }); // copy: callers must not mutate our state
    } catch {
      // Subscriber errors must not break the other listener path.
    }
  };

  const handleOnline = () => emit(true, "online");
  const handleOffline = () => emit(false, "offline");

  if (supported) {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  }

  let unsubscribed = false;
  return {
    get() {
      return { ...state };
    },
    unsubscribe() {
      if (unsubscribed || !supported) return;
      unsubscribed = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    },
  };
}

// Follow-up: confirm the network actually reaches YOUR server.
async function confirmOnline(url = "/health", { timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
    if (!res.ok) return false;
    const body = await res.text(); // captive portals return 200 with a login page
    return body.trim() === "ok";
  } catch {
    return false; // abort, DNS failure, CORS block: all mean "not usable"
  } finally {
    clearTimeout(timer); // cleanup: no dangling timer after resolve
  }
}
```

### Walkthrough

Page loads with Wi-Fi up: `navigator.onLine` is `true`, so `state = { online: true, since: t0, type: "initial" }`. The banner reads `get()` and shows nothing.

1. User unplugs the cable. The browser fires `offline` on `window`. `handleOffline` runs `emit(false, "offline")`: `state` becomes `{ online: false, since: t1 }`, `onChange` shows "You're offline."
2. User replugs. `online` fires; `emit(true, "online")` shows "Back online · syncing…" and the app calls `confirmOnline("/health")`.
3. `confirmOnline` races `fetch` against a 5s `AbortController`. The server returns `"ok"` → `true`, banner hides. A hotel portal returning its login page yields a body mismatch → `false`, banner stays.
4. On unmount, `unsubscribe()` removes both listeners; calling it again is a no-op via the flag.

### Complexity

Time: `O(1)` per event; `confirmOnline` costs one RTT plus a timeout. Space: `O(1)` — a single state object copied per emit. Idle cost is zero until the heartbeat runs.

### Edge Cases

- **`onLine === true` with no internet** → VPN up but upstream dead, captive portal, DNS hijack. Never gate a destructive action on it; heartbeat first.
- **Flapping** → rapid online/offline oscillation; `since` lets the UI debounce ("stable for 3s before syncing").
- **Service workers** → they can serve cached responses while "offline"; coordinate the banner with the worker's sync queue.
- **SSR** → no `window`/`navigator`; assume online and correct on hydration.
- **Mutating emitted state** → prevented by spreading on emit and in `get()`.
- **Listener leak in SPAs** → every mount must pair with `unsubscribe()` on unmount.
- **Heartbeat caching** → `cache: "no-store"` plus a unique body check; without it a cached `200` "confirms" a dead network.

### Interview Follow-ups

- **Heartbeat loop:** on `online`, poll `/health` with backoff until `"ok"`, then flush the offline mutation queue in order.
- **Offline queue:** stash writes in `IndexedDB` while offline, replay FIFO on confirmed-online, resolve conflicts by `updatedAt` or server-wins.
- **Network Information API:** `navigator.connection.effectiveType` / `saveData` to downgrade images/video on 2G — Chromium-only, so progressive enhancement.
- **Why not ping a third party?** CORS blocks the read, ad-blockers block the host, and it leaks user presence; always verify against your own origin.

### Common Mistakes

- Treating `navigator.onLine === true` as proof of internet and skipping the heartbeat.
- Listening to only `offline` (or only `online`), so the banner latches forever.
- Removing listeners with fresh arrows so `removeEventListener` detaches nothing.
- Forgetting `clearTimeout` in the heartbeat, leaking a timer per check.
- Checking `res.ok` only — captive portals return `200` for every URL, so the body check is the real test.

### Takeaway

`navigator.onLine` seeds, `online`/`offline` events transition, and neither proves reachability — pair the hint with a same-origin heartbeat and always remove both listeners on cleanup.
