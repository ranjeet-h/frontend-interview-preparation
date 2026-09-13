# Storage Event

## 1. Why This Exists — The Problem First

An application can be open in three tabs at once. If the user logs out in one tab, the other two still have their old in-memory UI unless they receive some signal. The same problem appears when a user changes a theme, switches an account, or invalidates a cached preference in one tab.

Polling `localStorage` wastes work and still leaves a delay. A `storage` event gives sibling browsing contexts a browser-provided notification when a shared Web Storage area actually changes.

## 2. The Analogy — Make It Obvious

Imagine several offices belonging to the same company. They share a public noticeboard, but each office has its own receptionist.

- `localStorage` is the noticeboard shared by offices with the same origin (scheme, host, and port).
- A tab that calls `setItem`, `removeItem`, or `clear` changes the noticeboard.
- The other offices receive a notice describing the change; the office that posted it does not receive a second notice.
- `event.key`, `event.oldValue`, and `event.newValue` describe what changed. For a noticeboard-wide wipe (`clear()`), there is no single key, so `event.key` is `null`.
- `sessionStorage` is different: it is a private noticeboard for one top-level browsing context. Its event can reach same-tab iframes that share that session storage area, but not an unrelated tab.

The event is therefore a change notification, not a conversation channel. The noticeboard stores the latest state; the notice only tells another office to inspect or react to it.

## 3. How It Actually Works — The Full Explanation

When one document successfully mutates a storage area, the browser identifies other documents that can access that same area and dispatches a non-bubbling `StorageEvent` on their `window` objects. The document that performed the mutation is excluded by design.

For `localStorage`, the receiving documents are other same-origin tabs, windows, and frames that share the origin's local storage area. For `sessionStorage`, the receiving documents must also belong to the same top-level browsing context, which normally means embedded same-tab iframes. This is why `sessionStorage` is not a cross-tab bus.

The event is produced only for a real storage change:

- `setItem(key, value)` adds a key or changes its string value.
- `removeItem(key)` changes storage only when that key existed.
- `clear()` changes storage only when the storage area was non-empty.
- Reads such as `getItem()` never produce an event.
- Setting a key to the same string value does not produce a change event.

Values in Web Storage are strings. If an application stores an object, it must serialize it with `JSON.stringify` and parse it on the receiving side. The event's values are snapshots of the mutation: `oldValue` is `null` for a newly added key, `newValue` is `null` for a removed key, and both are `null` for `clear()`. `url` identifies the document that made the change, while `storageArea` identifies the affected storage object.

The event does not carry an arbitrary JavaScript object, acknowledge delivery, order messages for your application, or replay history to a newly opened tab. If a tab opens after a change, it should read the current state directly. If several changes happen quickly, application logic should treat the storage area as the source of truth and make handlers idempotent.

`storage` is also not a same-document custom event. If the writer needs to update its own UI, it must do that in the write path or use a local state update as well. The browser's event is intended to notify other documents.

For the exact browser-facing API, see [MDN's `storage` event reference](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event) and [`StorageEvent` properties](https://developer.mozilla.org/en-US/docs/Web/API/StorageEvent).

## 4. Real Code — See It Working

### Observe a real `localStorage` change

Open the same page in two tabs. Keep this listener open in Tab B, then run the writer commands from Tab A's console.

```js
window.addEventListener("storage", (event) => {
  // The event fields describe the change made by the other document.
  console.log({
    key: event.key,
    oldValue: event.oldValue,
    newValue: event.newValue,
    url: event.url,
    isLocalStorage: event.storageArea === window.localStorage,
  });
});

// Run these in the other tab, one at a time:
localStorage.setItem("theme", "dark");       // add: oldValue null
localStorage.setItem("theme", "light");      // update: both values strings
localStorage.setItem("theme", "light");      // same value: no event
localStorage.removeItem("theme");             // remove: newValue null
localStorage.setItem("a", "1");
localStorage.clear();                          // key, oldValue, newValue are null
```

The writer tab does not log its own writes. Tab B sees the events, and the values remain strings even if the code that wrote them started with numbers or objects.

### Logout synchronization

Use a changing value as a signal. A fixed value such as `"true"` would not create a new event if it is written again while already stored.

```js
const LOGOUT_KEY = "app:logout";

function clearLocalSessionState() {
  sessionStorage.clear();
}

function logoutHere() {
  // The timestamp makes each logout a distinct storage mutation.
  localStorage.setItem(LOGOUT_KEY, String(Date.now()));

  // The writer does not receive a storage event, so update itself explicitly.
  clearLocalSessionState();
  window.location.replace("/login");
}

window.addEventListener("storage", (event) => {
  if (event.storageArea !== window.localStorage || event.key !== LOGOUT_KEY) {
    return;
  }

  // Make this safe if the handler is reached more than once by app logic.
  clearLocalSessionState();
  window.location.replace("/login");
});
```

The event is only a coordination hint. It is not authentication. The server must still reject expired or revoked credentials, and the logout handler must not assume that a tab receiving the signal is currently on a page where redirecting is harmless.

### Cross-tab preference synchronization

```js
const THEME_KEY = "app:theme";

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

// New tabs must initialize from current state; they cannot receive old events.
applyTheme(localStorage.getItem(THEME_KEY) ?? "light");

window.addEventListener("storage", (event) => {
  if (event.storageArea === window.localStorage && event.key === THEME_KEY) {
    applyTheme(event.newValue ?? "light");
  }
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the `storage` event?**

It is a `Window` event that informs another document when a Web Storage area accessible to that document changes. In the common cross-tab case, one same-origin tab mutates `localStorage` and the other same-origin tabs receive a `StorageEvent` containing the changed key and old/new string values. It is a notification about shared browser state, not a general-purpose message API.

**Q: Does the tab that calls `localStorage.setItem()` receive the event?**

No. The initiating document is intentionally excluded. If that tab needs to update its own UI, the code that performs the write must update local state directly. This also prevents code from accidentally treating its own write as an incoming synchronization message.

**Q: Which operations trigger it?**

A real `setItem`, `removeItem`, or `clear` mutation can trigger it. Repeating a write with the same string, removing a missing key, clearing an already empty area, and reading storage do not create a storage change. The event is delivered to eligible other documents, not to the writer.

**Q: What is the difference between `localStorage` and `sessionStorage` for this event?**

`localStorage` is shared by same-origin browsing contexts, so its event is useful across tabs. `sessionStorage` is scoped to a page session and top-level browsing context; its event can notify same-tab iframes that share that session storage area, but not another tab. Saying “the storage event only works with localStorage” is too broad; saying “sessionStorage syncs between tabs” is wrong.

**Q: What does `StorageEvent` contain?**

`key` names the changed key, or is `null` for `clear()`. `oldValue` and `newValue` are strings or `null`, depending on whether a value was added, changed, removed, or cleared. `url` is the URL of the document that changed storage, and `storageArea` refers to the affected `Storage` object. The event does not contain an arbitrary object payload.

**Q: How would you implement logout across tabs?**

Write a dedicated signal key with a value that changes on every logout, such as a timestamp or random ID. Handle the logout locally in the initiating tab, because it will not receive its own event, and handle the same key in sibling tabs by clearing local session state and navigating to the login route. This improves UI consistency, but real security still comes from server-side session or token invalidation; a browser event can be missed by a closed tab and should not be the security boundary.

**Q: Is `storage` a reliable messaging system?**

No. It is good for small, low-frequency hints such as logout or a preference change. It has string-only payloads, no application-level acknowledgement, no replay protocol, and no durable message history. A receiver should read current state when it needs authoritative data. For richer live messages, use `BroadcastChannel` or another explicit messaging design.

## 6. The Traps — What Goes Wrong

- **Testing in one tab and expecting a callback.** The writer is excluded, so a one-tab test appears broken. Use two same-origin tabs, or test the local write path separately from the cross-document listener.

- **Treating `sessionStorage` as shared tab state.** Separate tabs normally have separate session storage areas. Only documents inside the same top-level browsing context, such as same-tab iframes, can share the relevant session storage area.

- **Using a constant logout flag forever.** `setItem("logout", "true")` followed by the same call may be a no-op. Use a changing event ID, or remove and re-add deliberately when that behavior is appropriate.

- **Assuming `event.key` is always a string.** `clear()` sets `key`, `oldValue`, and `newValue` to `null`. Branch on `event.key === null` before treating it as a normal item update.

- **Parsing `newValue` without handling removal or invalid data.** `newValue` is `null` after `removeItem`, and JSON stored by another version of the app might be malformed or use an unexpected shape. Validate before applying it.

- **Using it as a high-frequency transport.** Writing every cursor movement or chat keystroke to storage couples messaging to persistent state and creates unnecessary serialization and storage work. Use `BroadcastChannel`, a worker, or a server connection for active streams.

- **Putting secrets in `localStorage` because it syncs.** Same-origin JavaScript, including an injected XSS script, can read it. Synchronization convenience does not change the storage area's security model; do not use it as a safe token vault.

- **Believing an event is a durable delivery guarantee.** A closed or crashed tab cannot react, and a newly opened tab does not receive historical events. Persist authoritative state separately and initialize from that state.

## 7. Compare With Related Concepts

| Concept | What it gives you | Use it when |
|---|---|---|
| `storage` event | A notification caused by another document changing Web Storage; string metadata only | You need small, low-frequency same-origin sync tied to stored state, such as logout or theme changes |
| `BroadcastChannel` | A named same-origin message channel with structured-clone payloads; the sender does not receive its own message | You need live tab/window/worker messages that do not need to be persisted |
| `postMessage` | Targeted messages between windows, frames, or workers that hold a reference relationship | You know the specific recipient, such as a parent frame and an embedded iframe |
| Custom DOM event | Same-document application notification | Components in one document need to communicate; it does not cross tabs |
| `localStorage` vs `sessionStorage` | Origin-wide persistence vs top-level-tab session scope | Pick `localStorage` for cross-tab state; pick `sessionStorage` for temporary tab-local state |

## 8. 🧠 The Memory Hook — What Sticks

`storage` is the **“someone else changed the shared noticeboard” bell**: the writer never hears its own bell, and the bell carries the change details rather than a rich message. For cross-tab logout, write a new signal, handle the current tab yourself, and let sibling tabs react; never confuse that notification with authentication or durable messaging.
