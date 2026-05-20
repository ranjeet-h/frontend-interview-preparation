# Clipboard API

## Detailed explanation
Clipboard API lets web apps read or write clipboard data, usually through `navigator.clipboard`. It requires secure context and user permission/gesture depending on operation and browser.

Frontend use: copy links, invite codes, command palettes, paste handlers, rich editors.

## 1. One-line mental model
Clipboard API gives controlled access to user clipboard.

## 2. Problem it solves
Apps need safe copy/paste interactions without old `execCommand` hacks.

## 3. Core idea
- Use `navigator.clipboard`.
- Usually requires HTTPS.
- Write often needs user gesture.
- Read needs permission.
- Handle failures gracefully.

## 4. Visual / analogy
Clipboard API = permissioned bridge to system clipboard.

```js
await navigator.clipboard.writeText("copied");
```

## 5. Minimal example

```js
await navigator.clipboard.writeText(url);
```

## 6. Real-world example

```js
async function copyInvite(code) {
  try {
    await navigator.clipboard.writeText(code);
    showToast("Copied");
  } catch {
    showToast("Copy failed");
  }
}
```

## 7. Common interview questions

#### What is Clipboard API?
- **The Engine Mechanism (Why it behaves this way):** The Clipboard API is a modern, asynchronous host-environment API accessed via the `navigator.clipboard` object. It provides a Promise-based, secure method for web applications to read and write text or arbitrary binary data (like images or rich text files) directly to and from the system's global clipboard. Unlike the deprecated synchronous `document.execCommand('copy')`, which executed by manipulating the DOM selection, the Clipboard API interacts directly with the operating system's clipboard service asynchronously through the browser agent's platform layer, preventing synchronous main-thread blocking during expensive serialization/deserialization.
- **The Unforgettable Mental Model:** A security portal built into the terminal gate of an airport (the browser). Instead of letting any passenger sneak a peek inside your suitcase (clipboard) or slip items into it silently, you must go through a digital checkpoint that asks for authorization and ensures you are under a secure, authenticated connection.
- **The Trap:** Assuming that `navigator.clipboard` is always defined. On older browsers or inside non-secure iframe containers (which lack the `clipboard-write` feature policy), `navigator.clipboard` will be `undefined`, causing runtime execution errors unless guarded.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The Clipboard API is a modern, Promise-based browser interface accessed via `navigator.clipboard` that allows secure, asynchronous reading and writing of system clipboard data. It replaces the legacy, synchronous `document.execCommand` hack. It operates under strict security protocols, requiring a secure context (HTTPS) and active user interaction to mitigate scripting abuses like clipboard hijacking."

#### Why HTTPS needed?
- **The Engine Mechanism (Why it behaves this way):** The browser restricts access to sensitive APIs (like Clipboard, Geolocation, and Service Workers) to "Secure Contexts" (HTTPS and `localhost`) to prevent Man-in-the-Middle (MITM) attacks. Because the clipboard often holds highly sensitive user data—such as passwords, credit card numbers, or cryptographic keys—allowing an unencrypted HTTP origin to read the clipboard would allow network eavesdroppers to silently steal credentials. Similarly, allowing HTTP origins to write to the clipboard would let attackers inject malicious commands or spoof links (clipboard poisoning) into the user's workflow.
- **The Unforgettable Mental Model:** A high-security bank vault. If the pathway to the vault is an open, unmonitored public street (HTTP), anyone can mug the courier. The bank requires a heavily armored, private underground tunnel (HTTPS) to transport the gold (clipboard data).
- **The Trap:** Developing locally using an IP address (e.g., `http://192.168.1.50:3000`) instead of `localhost`. The browser does *not* treat external IP addresses as secure contexts, so `navigator.clipboard` will be `undefined`, breaking your clipboard implementation during cross-device mobile testing unless HTTPS is configured.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Secure Contexts, or HTTPS, are strictly enforced for the Clipboard API to eliminate the threat of eavesdropping and data manipulation. If unencrypted HTTP origins were granted clipboard access, active network attackers could silently read sensitive user information like passwords, or inject malicious payloads into the system clipboard. Thus, the V8 environment completely hides `navigator.clipboard` under non-secure connections."

#### How copy text?
- **The Engine Mechanism (Why it behaves this way):** Copying text is performed by calling the asynchronous method `navigator.clipboard.writeText(textString)`. When invoked, the method returns a `Promise`. The browser engine verifies that the document is the active, focused window and that the call was triggered inside a transient user activation (such as a click or keydown event handler). If these conditions are met, the browser serializes the JS string into raw UTF-8 bytes and pushes it to the native operating system's clipboard buffer, resolving the promise. If the validation fails, the promise is rejected with a `NotAllowedError`.
- **The Unforgettable Mental Model:** Pushing an envelope into a secure post-box. You must be physically standing at the box (user gesture) and the slot must be open (active focus) to slide the note inside. Once dropped, you receive a confirmation receipt (resolved Promise).
- **The Trap:** Attempting to call `writeText()` inside a delayed asynchronous callback (like a `setTimeout` or a resolved network fetch promise). If the time elapsed between the user's physical click and the `writeText()` call exceeds the browser's transient user activation threshold (typically ~5 seconds), the engine classifies the gesture as expired and rejects the operation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: To copy text programmatically, we call `navigator.clipboard.writeText(textString)`. Since this returns a Promise, we must await its completion and catch any rejections. The browser requires this operation to be executed within a transient user gesture, such as a click handler, and the document must be actively focused; otherwise, the engine throws a `NotAllowedError` to block unauthorized writes."

#### What permissions apply?
- **The Engine Mechanism (Why it behaves this way):** The Permissions API controls clipboard access using two distinct tokens: `clipboard-write` and `clipboard-read`. For writing operations (`writeText` / `write`), browsers implicitly grant the `clipboard-write` permission when the execution is accompanied by a transient user activation (a physical click) on an active tab. For reading operations (`readText` / `read`), the security threat is much higher, so the browser explicitly prompts the user with a permission request modal. The engine checks the status via `navigator.permissions.query({ name: 'clipboard-read' })`. If the status is `'granted'`, the read proceeds; if `'prompt'`, a dialog appears; if `'denied'`, the read rejects immediately.
- **The Unforgettable Mental Model:** A security clearance badge. Writing to the clipboard is like slipping an anonymous note under a door—you only need to show you are a real person (user gesture). Reading from the clipboard is like opening someone else's briefcase—you must show your security badge and get explicit verbal permission (prompt) first.
- **The Trap:** Assuming that you can silently read from the clipboard in the background. The browser will always block background reads, and in modern browsers, even active reads trigger a persistent UI indicator in the address bar to warn the user.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The Clipboard API relies on the Permissions API to govern access. Writing text requires the `clipboard-write` permission, which is automatically granted in modern browsers as long as it is triggered during an active user gesture. Reading text is treated with extreme caution, requiring the `clipboard-read` permission, which forces a runtime browser prompt. We should always check the permission status using `navigator.permissions.query` before initiating a read operation to provide a smooth user experience."

#### How handle failure?
- **The Engine Mechanism (Why it behaves this way):** Because `navigator.clipboard` methods are asynchronous and return Promises, all failures manifest as Promise rejections. These rejections can occur due to: missing secure contexts (`navigator.clipboard` is undefined), expired user gestures, permission denial by the user, document lack of focus, or data size limits. A robust architecture implements a multi-tiered fallback strategy: first guarding against API availability, catching rejections in a `try...catch` block to display clear UI toasts, and falling back to a legacy selection-and-copy mechanism using a hidden `<textarea>` and `document.execCommand('copy')` if the modern API is blocked or unsupported.
- **The Unforgettable Mental Model:** A space mission with a primary engine and a backup booster. If the advanced thruster (Clipboard API) fails or loses power, the flight computer instantly detects it (catch block) and fires up the backup retro-rocket (execCommand fallback) to ensure the spacecraft lands safely.
- **The Trap:** Forgetting that `document.execCommand('copy')` is synchronous. If you fall back to it, ensure the element creation, selection, copy execution, and cleanup are executed sequentially and synchronously on the main thread, as browsers will reject `execCommand` if it is deferred.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Robust clipboard integration requires defensive coding. First, I check if `navigator.clipboard` is defined. If present, I wrap the asynchronous call in a `try...catch` block to handle rejections gracefully and notify the user via a UI toast. If the API is missing or rejects due to browser limitations, I fall back to a legacy strategy: dynamically creating a hidden `<textarea>`, setting its value, selecting the text, invoking `document.execCommand('copy')` synchronously, and immediately pruning the DOM node."

## 8. Active recall test

#### 1. What global host object provides access to the Clipboard API?
The modern Clipboard API is accessed via the `navigator.clipboard` object.

#### 2. What asynchronous method writes text directly to the system clipboard?
`navigator.clipboard.writeText(textString)` is the asynchronous method used to write string content.

#### 3. Why is it mandatory to use a try...catch block or catch rejections when using this API?
Because clipboard methods return Promises which can reject due to user gesture expiration, lack of document focus, user permission denial, or unsupported contexts. Catching rejections prevents unhandled promise errors and enables running fallback code.

#### 4. What runtime execution environment context is required for navigator.clipboard to be available?
A Secure Context (HTTPS or `localhost`) is strictly required. On unencrypted HTTP connections, `navigator.clipboard` is `undefined`.

#### 5. Outline a standard, high-impact real-world scenario for this API.
Building a "Copy Invite Link" or "Copy Code Block" button that asynchronously copies a specific string to the clipboard with zero layout disruption, providing a visual success toast, and falling back to document selection + `execCommand` if the Clipboard API fails.

## 9. Mistakes / traps
- Assuming clipboard always available.
- Not requiring user gesture.
- Ignoring permission errors.
- Copying sensitive data silently.

## 10. Compare with related concepts
- **Clipboard API vs execCommand:** modern Promise API vs legacy command.
- **writeText vs readText:** write to clipboard vs read from it.
- **Clipboard event vs API:** paste/copy events vs programmatic access.

## 11. Summary from memory
Explain robust copy-to-clipboard button.

## 12. Spaced revision prompts
- 1 day: Define Clipboard API.
- 3 days: Write copy function.
- 7 days: Handle permission failure.
- 14 days: Compare with paste event.

