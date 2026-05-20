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
- What is Clipboard API?
- Why HTTPS needed?
- How copy text?
- What permissions apply?
- How handle failure?

## 8. Active recall test
1. Which global object?
2. Which method writes text?
3. Why catch errors?
4. What context needed?
5. Name use case.

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

