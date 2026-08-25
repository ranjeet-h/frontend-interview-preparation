# Clipboard API

## 1. Why This Exists — The Problem First

Users expect a button labelled “Copy” to copy exactly what the interface shows. They also expect a paste action in an editor to use the data they just chose. Before the modern Clipboard API, developers often had to select text in a hidden element and call the synchronous, deprecated `document.execCommand("copy")`. That approach was fragile, awkward for rich data, and easy to trigger at surprising times.

The browser cannot simply give every page unrestricted access to the system clipboard, either. A page that could read it silently could steal a password or one-time code; a page that could write silently could replace a copied bank account number or shell command. The Clipboard API exists to make useful copy and paste interactions possible while keeping those operations behind browser security checks.

## 2. The Analogy — Make It Obvious

Think of the system clipboard as a small locker at a building's front desk, and the web page as a visitor.

- `navigator.clipboard` is the front-desk window. It is the page's entry point, not a direct reference to arbitrary operating-system memory.
- `writeText()` is handing the clerk a plain-text note to put in the locker. `readText()` is asking the clerk to hand a note back.
- `ClipboardItem` is a parcel with several labelled formats—for example, HTML for a rich editor and plain text for applications that cannot use HTML.
- A secure context and browser policy are the building's identity checks. A page served from an unsafe context may not even get a front-desk window.
- User activation, focus, permission, and iframe policy are additional checks. Passing one check does not guarantee that every browser will pass the others.
- `copy`, `cut`, and `paste` events are different from the front desk. They are the building's normal event lane: they happen around a user-initiated clipboard action and expose `event.clipboardData` only while that event is being handled.

The analogy explains why a copy button can work without exposing the user's existing clipboard contents: writing a value and reading a value are separate operations with different privacy risks.

## 3. How It Actually Works — The Full Explanation

The asynchronous Clipboard API is exposed through `navigator.clipboard`, which returns a `Clipboard` object in supporting secure contexts. Its methods return promises because the browser may need to consult permission state, communicate with the operating system, serialize data, or wait for a browser decision. A rejected promise is a normal security or capability result, not proof that the JavaScript syntax was wrong.

### The write path

For plain text, `await navigator.clipboard.writeText(text)` asks the browser to serialize the string and replace the system clipboard's text representation. For multiple representations, `navigator.clipboard.write([item])` accepts `ClipboardItem` objects. A rich editor can offer both `text/html` and `text/plain`; the receiving application chooses a format it understands.

The browser then applies its policy checks. The page needs a secure context, the document generally needs to be focused, and browsers commonly require a transient user activation for a write. A click or keyboard activation is therefore the right place to start the operation. Do not put the actual clipboard call behind a long network request or timer and assume the original click is still valid: transient activation can be consumed or expire.

### The read path

`readText()` and `read()` are more sensitive because they bring data from outside the page into JavaScript. The browser can require recent user interaction, a permission decision, a paste UI action, or a focused document. The exact combination varies by browser and can change as permission policy evolves, so code must handle rejection rather than promise that a silent background read will work.

The Permissions API may expose `clipboard-read` and `clipboard-write` in a particular browser, but `navigator.permissions.query()` is not a portable way to guarantee the outcome. Some browsers do not support those permission names, and a `granted` result still does not remove every other policy check. Treat the actual Clipboard promise as authoritative.

### Secure contexts and embedding

Clipboard access is a secure-context feature. HTTPS is the normal production requirement; browsers also treat loopback development origins such as `http://localhost` and `http://127.0.0.1` as potentially trustworthy. An arbitrary LAN address such as `http://192.168.1.50:3000` is not interchangeable with `localhost`, so cross-device testing may require HTTPS.

An embedded page has another boundary: the top-level page can restrict clipboard features with Permissions Policy, commonly through `allow="clipboard-read; clipboard-write"` on an iframe. Even a secure child frame can fail if the embedding policy or browser permission does not allow the operation. Check the frame's deployment configuration when code works at the top level but fails when embedded.

### Async Clipboard API versus clipboard events

The async API is for explicit programmatic access outside a clipboard event handler. Clipboard events are for participating in a user action:

- `copy` and `cut` let a page customize data placed on the clipboard through `event.clipboardData` and `preventDefault()`.
- `paste` lets a page inspect the data supplied for that paste event through `event.clipboardData`.
- A synthetic `ClipboardEvent` does not grant access to the real system clipboard.

The two APIs overlap in purpose but are not interchangeable. Use an event when you are modifying or consuming the data for an actual user copy, cut, or paste. Use `navigator.clipboard` when the UI explicitly asks the browser to read or write clipboard data and the operation is allowed by the browser.

For exact platform behavior, see [MDN's Clipboard API guide](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API), the [`Navigator.clipboard` reference](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/clipboard), [MDN's secure-context guidance](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts), and the [W3C Clipboard API and Events specification](https://www.w3.org/TR/clipboard-apis/).

## 4. Real Code — See It Working

### A copy button that preserves the user gesture

This is a complete browser example. The clipboard call starts directly from the button's activation handler, and every rejection becomes user-visible feedback.

```html
<button id="copy-button" type="button">Copy invite link</button>
<span id="copy-status" role="status" aria-live="polite"></span>

<script>
  const copyButton = document.querySelector("#copy-button");
  const copyStatus = document.querySelector("#copy-status");
  const inviteUrl = new URL("/invite/abc123", window.location.origin).href;

  copyButton.addEventListener("click", async () => {
    if (!window.isSecureContext || !navigator.clipboard) {
      copyStatus.textContent = "Copy is unavailable in this context.";
      return;
    }

    // Keep this call in the activation handler so the browser can associate
    // it with the user's click instead of an expired timer or fetch callback.
    try {
      await navigator.clipboard.writeText(inviteUrl);
      copyStatus.textContent = "Invite link copied.";
    } catch (error) {
      // NotAllowedError is common, but browsers can reject for other reasons.
      console.error("Clipboard write failed", error);
      copyStatus.textContent = "Copy failed. Select the link and copy it manually.";
    }
  });
</script>
```

### Copy HTML and plain text together

Rich editors should provide a useful plain-text representation as well as HTML. The plain-text entry is the interoperability fallback chosen by applications that do not accept formatted clipboard data.

```js
async function copyRichSnippet(title, url) {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Rich clipboard writing is unavailable");
  }

  const html = `<a href="${escapeHtmlAttribute(url)}">${escapeHtml(title)}</a>`;
  const item = new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([`${title}\n${url}`], { type: "text/plain" }),
  });

  await navigator.clipboard.write([item]);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function escapeHtmlAttribute(value) {
  // Escaping HTML characters is not URL validation; validate allowed schemes
  // separately before using a URL in a real application.
  const parsed = new URL(value, window.location.href);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Unsupported URL scheme");
  }
  return escapeHtml(parsed.href);
}
```

### Read text only after an explicit paste action

Reading should be attached to a user-facing paste action. The browser may still require a prompt or reject the request, so a good UI treats the read as a best-effort operation.

```html
<button id="paste-button" type="button">Paste code</button>
<textarea id="code-input" rows="4" placeholder="Paste here"></textarea>
<p id="paste-status" role="status" aria-live="polite"></p>

<script>
  const pasteButton = document.querySelector("#paste-button");
  const codeInput = document.querySelector("#code-input");
  const pasteStatus = document.querySelector("#paste-status");

  pasteButton.addEventListener("click", async () => {
    if (!navigator.clipboard) {
      pasteStatus.textContent = "Clipboard reading is unavailable.";
      return;
    }

    try {
      codeInput.value = await navigator.clipboard.readText();
      pasteStatus.textContent = "Pasted from the clipboard.";
    } catch (error) {
      console.error("Clipboard read failed", error);
      pasteStatus.textContent = "The browser did not allow clipboard access.";
    }
  });
</script>
```

### Customize a normal user copy event

This event-based example does not read arbitrary existing clipboard contents. It changes the payload produced when the user copies a selection from this element.

```js
const pre = {
  addEventListener(eventName, handler) {
    this.handlers ??= {};
    this.handlers[eventName] = handler;
  },
};
const document = {
  querySelector(selector) {
    return selector === "pre" ? pre : null;
  },
};
const window = {
  getSelection() {
    return { toString: () => "selected\ttext" };
  },
};

const codeBlock = document.querySelector("pre");

codeBlock.addEventListener("copy", (event) => {
  const selectedText = window.getSelection()?.toString() ?? "";
  if (!selectedText) return;

  event.preventDefault();
  event.clipboardData.setData("text/plain", selectedText.replaceAll("\t", "  "));
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the Clipboard API, and why is it asynchronous?**

It is a browser API for reading and writing system clipboard data through `navigator.clipboard`. The async methods return promises because the browser may need to enforce permissions, consult user-activation state, serialize formats, and communicate with the operating system. It is different from `document.execCommand("copy")`, which was a synchronous, selection-oriented legacy mechanism.

**Q: Why does clipboard code usually need HTTPS?**

Clipboard access is a powerful feature exposed in secure contexts. HTTPS gives the browser a stronger origin and transport guarantee; `localhost` and loopback addresses are special development exceptions in browsers that treat them as trustworthy. A random HTTP LAN address is not automatically equivalent. Use `window.isSecureContext` and feature detection, then provide a usable failure path.

**Q: Why can `writeText()` fail even after a user clicks a button?**

The browser can reject because the context is insecure, the document is not focused, the API is unsupported, the frame is not allowed by Permissions Policy, or permission/user-activation requirements were not met. A click handler is the correct starting point, but it is not a universal permission grant. Catch the rejection and tell the user what they can do next.

**Q: Is reading the clipboard the same as writing it?**

No. Writing replaces clipboard data supplied by the page, while reading imports potentially sensitive user data into JavaScript. Browsers generally protect reads more aggressively and may require a paste action, transient activation, permission, or prompt. Never design a page around silently polling the clipboard in the background.

**Q: When would you use `ClipboardItem` instead of `writeText()`?**

Use `writeText()` for one plain-text value such as a URL or invite code. Use `ClipboardItem` with `navigator.clipboard.write()` when the receiving application benefits from multiple representations, such as HTML plus plain text or an image plus a fallback. Validate and escape generated HTML; the clipboard is a data interchange boundary, not a reason to trust pasted markup.

**Q: What is the difference between the Clipboard API and `copy`/`paste` events?**

The async Clipboard API performs explicit programmatic reads and writes. Clipboard events run as part of a user-initiated copy, cut, or paste and expose a `DataTransfer`-like `event.clipboardData` during that event. Use an event to customize a real user action; use `navigator.clipboard` for an explicit application operation that passes browser policy.

**Q: Should an application always fall back to `document.execCommand("copy")`?**

No. It is deprecated, selection-based, and not a reliable substitute for the modern API—especially for rich data or strict security policies. A product may choose a carefully tested legacy fallback for a supported browser population, but it must feature-detect it, keep the synchronous selection and cleanup together, and still provide a manual-copy path. Do not claim that a fallback can bypass permission or secure-context restrictions.

## 6. The Traps — What Goes Wrong

- **Assuming `navigator.clipboard` always exists.** It can be missing in an insecure context, an unsupported browser, or an environment that does not expose the feature. Check `window.isSecureContext` and the property before calling it.

- **Waiting before the clipboard call.** A button handler that awaits a slow fetch or schedules a timer before calling `writeText()` may lose transient activation. Prepare the value first, then start the clipboard operation directly from the user activation when the browser requires it.

- **Treating a resolved write as proof that every browser behaves the same.** Permission UI, user-activation rules, and support for `clipboard-read`/`clipboard-write` permission names differ. Code to the promise result and test the browsers you support.

- **Reading on page load or polling in the background.** Clipboard reads can expose passwords, tokens, and personal information. They are intentionally restricted. Ask for a clear user action and handle a denial without making the page unusable.

- **Forgetting iframe policy.** A secure child frame can still be denied if the embedding document does not delegate clipboard access. Check `Permissions-Policy` and the iframe's `allow` attribute when embedding.

- **Trusting pasted HTML.** Clipboard data can contain markup from an external application. Sanitize or parse it according to the editor's security model; never insert arbitrary pasted HTML with `innerHTML` and assume it is harmless.

- **Using a synthetic paste event as a permission bypass.** Creating and dispatching `new ClipboardEvent("paste")` does not grant access to the real system clipboard. Real clipboard data is controlled by the browser's user action and permission rules.

- **Copying a value that is not the value the user sees.** Clipboard poisoning can mislead users—for example, a UI shows one address while the page copies another. Make the copied value predictable, give clear feedback, and avoid silently rewriting user selections.

- **Logging clipboard contents while debugging.** Clipboard data may contain secrets. Log operation type and error class, not the copied or pasted value.

## 7. Compare With Related Concepts

- **Async Clipboard API vs clipboard events:** The async API is explicit, promise-based programmatic access; events participate in a real copy, cut, or paste action. Use the event for customization of that action and the async API for a dedicated copy/paste control.

- **`writeText()` vs `write()` with `ClipboardItem`:** `writeText()` handles one plain-text representation; `write()` can publish multiple MIME-typed representations. Use the simplest representation that meets the receiving application's needs.

- **`readText()` vs `read()`:** `readText()` asks for text only; `read()` returns `ClipboardItem` objects so code can inspect supported formats and retrieve blobs. Use `readText()` for text fields and `read()` for images or rich data.

- **Clipboard API vs File API:** Clipboard methods exchange data with the system clipboard; the File API works with files the user selected or dropped. A pasted image may be available as a clipboard blob, but that does not give the page filesystem access.

- **Clipboard permission vs user activation:** Permission is the browser's authorization state; activation is evidence of a recent user action. Depending on the browser and operation, both, either, or an additional focus/frame check may matter. Never use a permission query as a guarantee that the next call cannot fail.

- **Clipboard API vs `document.execCommand()`:** The modern API is asynchronous and supports structured clipboard formats; `execCommand("copy")` relies on document selection and is deprecated. Prefer the modern API, with manual-copy UX when it is unavailable.

## 8. 🧠 The Memory Hook — What Sticks

The clipboard is a guarded front desk, not a public variable: writing a note and reading the user's existing notes are separate requests, each checked by the browser. Start clipboard work from a clear user action, offer only the data you intend to exchange, and treat every rejection as an expected boundary—not an exceptional impossibility.
