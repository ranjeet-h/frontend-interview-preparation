# BroadcastChannel

## 1. Why This Exists — The Problem First

Imagine a user has your dashboard open in three tabs. They sign out in one tab, but the other two still show private data because each tab has its own JavaScript heap and UI state. You can make every tab poll the server, or abuse a `localStorage` write as a signal, but both approaches add work and blur the difference between persistent state and a short-lived notification.

`BroadcastChannel` exists for this narrower job: let active browser contexts of the same origin announce a message to one another without a server round trip. It is useful for logout signals, theme changes, cache invalidation, and coordination between a page and a worker. It is a messaging path, not shared storage and not a durable event log.

## 2. The Analogy — Make It Obvious

Think of a walkie-talkie channel in an office building.

- The channel name, such as `"auth"`, is the frequency everyone agrees to use.
- Each tab, window, iframe, or worker holds its own walkie-talkie: `new BroadcastChannel("auth")`.
- Pressing the talk button is `postMessage(payload)`.
- Every other walkie-talkie tuned to that frequency hears a `message` event. The sender does not hear its own transmission through its own channel object.
- The building's security desk is the same-origin boundary. Two offices can use the same frequency name, but if they are in different security domains, their radios are not connected.
- Turning off a radio is `close()`. It leaves the conversation and will not receive later messages.

The analogy also explains the main limitation: a radio transmission is not a notice pinned to a wall. A tab opened after the message was sent does not replay it, and a tab that was closed or disconnected cannot catch up. If a new tab must know the current state, it needs storage or a server query as well as a live signal.

## 3. How It Actually Works — The Full Explanation

Creating a channel registers a `BroadcastChannel` object with a named broadcast group. The group is scoped to the page's origin—scheme, host, and port—and to the browser's storage-partition rules. A channel named `"updates"` on `https://app.example.com` is unrelated to one with the same name on `https://other.example.com`; a subdomain is not automatically the same origin.

The normal message path is:

1. A context creates a channel and attaches a `message` listener.
2. The sender calls `postMessage(value)`.
3. The browser structured-clones `value` for delivery. The receiver gets a separate object graph, so changing the received object does not mutate the sender's original object.
4. The browser queues a `message` event for each other eligible channel object with the same name. `postMessage()` itself returns `undefined`; it does not wait for receivers to finish.
5. Each receiver reads `event.data` and decides whether the message is relevant.

Structured cloning handles many ordinary values—objects, arrays, strings, numbers, `Date`, `Blob`, and more—but it is not JSON serialization and it does not preserve every JavaScript value. Functions and DOM nodes cannot be cloned. Sending an unsupported value can throw `DataCloneError`; a deserialization failure can be reported through `messageerror`. The receiver still does not share memory with the sender, so a `BroadcastChannel` message is not a shared mutable store.

The API inherits from `EventTarget`, so both styles are valid:

```js
// A local fixture lets this registration example run outside a browser.
class FakeBroadcastChannel {
  constructor() {
    this.listeners = [];
  }

  addEventListener(type, listener) {
    if (type === "message") this.listeners.push(listener);
  }
}

const channel = new FakeBroadcastChannel();

channel.onmessage = (event) => {
  console.log(event.data);
};

channel.addEventListener("message", (event) => {
  console.log(event.data);
});
```

Use one registration style for a given handler and remove it or close the channel when its owner goes away. `close()` marks that channel object inactive: it will not receive new messages, and sending through it throws because it has already been closed. Closing is especially important when a component or worker creates a channel for a limited lifetime. The browser can eventually collect an unused channel, but explicit ownership and teardown make the lifetime clear and prevent duplicate listeners when a UI mounts more than once.

This is a live, best-effort coordination mechanism:

- It does not persist messages for future tabs.
- It does not guarantee that a receiver has processed a message before the sender continues.
- It does not authenticate messages beyond the browser's origin isolation. Any same-origin code that can create the channel can publish to it, so message handlers must validate the message shape and never treat a broadcast as proof of authorization.
- It is not a replacement for server fan-out, WebSockets, or a durable queue when other users, offline delivery, ordering across a distributed system, or replay is required.

See the [MDN `BroadcastChannel` reference](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel) and the [HTML Standard's broadcast algorithm](https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts) for the browser API and specification details.

## 4. Real Code — See It Working

### A small message bus for two same-origin contexts

Open the same page in two tabs. Both tabs create a listener; clicking the button in one tab sends a message to the other tab. The sender's own channel object does not receive the broadcast.

```html
<button id="announce">Announce</button>
<output id="status">Waiting for another tab</output>

<script>
  const channel = new BroadcastChannel("demo:presence");
  const status = document.querySelector("#status");

  channel.addEventListener("message", (event) => {
    // The payload is a clone, so the receiver can safely treat it as its own value.
    if (event.data?.type === "hello") {
      status.textContent = `${event.data.from} is open`;
    }
  });

  document.querySelector("#announce").addEventListener("click", () => {
    channel.postMessage({ type: "hello", from: "another tab" });
  });

  window.addEventListener("pagehide", () => {
    // This page no longer needs the live subscription after it is being discarded.
    channel.close();
  }, { once: true });
</script>
```

### Cross-tab logout signal

The broadcast should carry a command or version, not an access token. Each tab owns its own cleanup and uses the message only to start that cleanup.

```js
// Local fixtures stand in for the browser channel, session store, and window.
class FakeBroadcastChannel {
  addEventListener() {}
  postMessage(data) {
    this.lastMessage = data;
  }
  close() {
    this.closed = true;
  }
}

const BroadcastChannel = FakeBroadcastChannel;

const sessionStore = {
  clear() {
    this.cleared = true;
  },
};

const window = {
  location: {
    replace(path) {
      this.path = path;
    },
  },
  addEventListener(type, listener) {
    if (type === "pagehide") this.pagehide = listener;
  },
};

const authChannel = new BroadcastChannel("app:auth");

function finishLogout() {
  // Clear in-memory state and navigate; do not trust the broadcast as authorization.
  sessionStore.clear();
  window.location.replace("/login");
}

authChannel.addEventListener("message", (event) => {
  if (event.data?.type === "logout") {
    finishLogout();
  }
});

function logoutHere() {
  // Broadcast before navigating so sibling tabs receive the signal.
  authChannel.postMessage({ type: "logout", reason: "user" });
  // The current channel object is excluded from its own broadcast, so clean up locally too.
  finishLogout();
}

window.addEventListener("pagehide", () => authChannel.close(), { once: true });
```

In a real application, persist the authoritative session change through the server or cookie flow as well. A broadcast only reaches currently listening same-origin contexts; it cannot log out a tab that opens later or prove that the server-side session was revoked.

### A worker can participate too

`BroadcastChannel` is available in workers, which makes it useful when a service worker or dedicated worker needs to notify open pages. The worker still follows the same origin and channel-name rules.

```js
// worker.js
// A worker-like fixture makes the message trigger explicit when run under Node.
class FakeBroadcastChannel {
  constructor() {
    this.messages = [];
  }

  postMessage(data) {
    this.messages.push(data);
  }
}

const channel = new FakeBroadcastChannel();
const self = {
  addEventListener(type, listener) {
    if (type === "message") this.onmessage = listener;
  },
  dispatchMessage(data) {
    this.onmessage?.({ data });
  },
};

self.addEventListener("message", (event) => {
  if (event.data?.type === "cache-updated") {
    channel.postMessage({ type: "invalidate", key: event.data.key });
  }
});

self.dispatchMessage({ type: "cache-updated", key: "profile" });
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is `BroadcastChannel`?**

It is a browser `EventTarget` that provides named, asynchronous publish-subscribe messaging between active same-origin browsing contexts. Pages in different tabs, windows, frames, or workers can create channels with the same name and exchange structured-cloned values. The sender's channel object is excluded from delivery, and the API does not persist messages.

**Q: Does the sender receive its own message?**

No. A message is delivered to other `BroadcastChannel` objects listening to the same named channel. If the current tab must also update its UI, call the local state transition explicitly or put that transition in a function and invoke it both locally and from the listener.

**Q: What does “same origin” mean here?**

The contexts must match the origin rules: scheme, host, and port are part of the boundary. `https://app.example.com` and `https://api.example.com` are different origins even though they share a registrable domain. A channel name by itself never grants cross-origin access; use a carefully validated `window.postMessage` bridge or a server when cross-origin communication is intentional.

**Q: Are messages passed by reference?**

No. The browser uses the structured clone algorithm, so the receiver gets a separate clone. This avoids direct shared-object mutation, but it costs serialization and cloning work and excludes values such as functions. Do not send a huge application store when a small event like `{ type: "invalidate", key }` is enough.

**Q: Is `BroadcastChannel` reliable or durable?**

It is useful for live coordination between currently active listeners, but it is not a durable queue. A listener that is created after a message was sent does not receive a replay, and a closed or unavailable context cannot catch up. Pair the signal with an authoritative source such as server state, `localStorage`, or IndexedDB when late readers need the current value.

**Q: How is it different from `storage` events?**

`storage` is a notification caused by a `localStorage` or applicable `sessionStorage` mutation and exposes fields such as `key`, `oldValue`, and `newValue`; it does not notify the document that performed the write. `BroadcastChannel` is purpose-built messaging, carries structured-cloned payloads, and does not persist a value as a side effect. Choose `storage` when the stored value is itself the source of truth; choose `BroadcastChannel` when you need a live message between active contexts.

**Q: Why should a component call `close()`?**

`close()` ends that channel object's participation and prevents future messages from arriving. Without a clear teardown, a component that mounts repeatedly can leave several live channel objects and run the same handler multiple times. Give the channel an owner, register its handler once, and close it when that owner is destroyed.

**Q: Can `BroadcastChannel` replace WebSockets?**

No. `BroadcastChannel` coordinates contexts inside one browser's same-origin boundary. A WebSocket connects a client to a server and can deliver events from other users or other devices. A common architecture uses a WebSocket for server fan-out and a `BroadcastChannel` to fan that event from one page or worker to sibling tabs.

## 6. The Traps — What Goes Wrong

### Treating a broadcast as persisted state

```js
class FakeBroadcastChannel {
  constructor() {
    this.messages = [];
  }

  postMessage(data) {
    this.messages.push(structuredClone(data));
  }
}

const channel = new FakeBroadcastChannel();
channel.postMessage({ theme: "dark" });
```

This tells current listeners about a change, but it does not make a future tab open in dark mode. Persist the theme separately, then broadcast an invalidation or “settings changed” signal so active tabs refresh their local view.

### Expecting the current tab to receive the message

The sender is intentionally excluded. A logout implementation that only posts `{ type: "logout" }` will leave the current tab logged in unless it also runs local logout logic. Keep the command and the local transition separate so the sender and receivers follow the same cleanup path.

### Assuming a subdomain is same-origin

Same brand does not mean same origin. Different hosts, schemes, or ports do not share a `BroadcastChannel`. If a cross-origin iframe must communicate, use `postMessage` with a specific expected origin and validate both `event.origin` and the payload shape.

### Sending values that cannot be cloned

```js
class FakeBroadcastChannel {
  postMessage(data) {
    // structuredClone reproduces the browser's cloneability check.
    structuredClone(data);
  }
}

const channel = new FakeBroadcastChannel();

try {
  channel.postMessage({ onDone: () => console.log("done") });
} catch (error) {
  if (error.name !== "DataCloneError") throw error;
  console.log("DataCloneError");
}
```

Send data, not behavior: use `{ type: "done" }` and let the receiver choose its own function. Also avoid sending secrets or large mutable graphs; cloning is not a security boundary or a free operation.

### Creating a new channel for every render

In a UI framework, constructing a channel during every render creates multiple subscriptions. The result is duplicate navigation, repeated cache invalidation, and unclear ownership. Create one channel for the intended lifetime, keep the handler stable, and close the channel during teardown.

### Using a broadcast as an authorization decision

Any same-origin script that can access the page can publish the channel's messages. A message such as `{ type: "admin" }` is just input; it is not proof that the sender is an administrator. Validate message schemas and derive permissions from trusted application state or the server.

## 7. Compare With Related Concepts

| Choice | Key difference | Use it when |
| --- | --- | --- |
| `BroadcastChannel` vs `storage` event | Direct live message with structured cloning vs notification caused by a storage mutation. | Use the channel for active coordination; use storage when the persisted value is the state a late tab must read. |
| `BroadcastChannel` vs `window.postMessage` | Named many-to-many same-origin broadcast vs targeted window/frame messaging that can cross origins with validation. | Use `postMessage` when you know the target window or need a cross-origin bridge. |
| `BroadcastChannel` vs custom DOM event | Cross-context browser messaging vs an event that stays in one document's `EventTarget` graph. | Use a custom event for same-page integration; use the channel for tabs, windows, or workers. |
| `BroadcastChannel` vs WebSocket | Browser-local coordination vs a client-server connection. | Use WebSockets for server-originated or multi-device events; optionally use a channel to fan them across tabs. |
| `BroadcastChannel` vs `SharedWorker` | A message broadcast primitive vs a worker that can own shared computation and state. | Use a channel for signals; use a shared worker when one long-lived worker should coordinate active pages. |

## 8. 🧠 The Memory Hook — What Sticks

`BroadcastChannel` is a same-origin walkie-talkie: active listeners hear a cloned message, the speaker does not hear its own transmission, and nobody gets a replay later. Use it to announce a change, not to store the truth; pair it with authoritative state when a tab can arrive late.
