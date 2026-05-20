# DOM-Based XSS

## Detailed explanation
DOM-based XSS happens when frontend JavaScript takes untrusted data and writes it into DOM as executable HTML/JS. Server may return safe page, but client-side code creates vulnerability.

Common risky sinks: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, unsafe URL assignment, and `eval`.

## 1. One-line mental model
DOM-based XSS = frontend code turns attacker-controlled input into executable DOM.

## 2. Problem it solves
Developers need know XSS can be introduced entirely in client code.

## 3. Core idea
- Source = URL/user/API data.
- Sink = dangerous DOM write.
- Prefer `textContent`.
- Sanitize trusted-rich HTML.
- Use CSP as defense-in-depth.

## 4. Visual / analogy
Bad input enters pipe and comes out as script.

```txt
location.hash -> innerHTML -> script executes
```

## 5. Minimal example

```js
element.innerHTML = location.hash.slice(1); // dangerous
```

## 6. Real-world example

```js
element.textContent = userInput;
```

Safe text rendering.

## 7. Common interview questions
- What is DOM-based XSS?
- Why is `innerHTML` dangerous?
- How prevent DOM XSS?
- What is sanitization?
- What is CSP role?

## 8. Active recall test
1. What is source?
2. What is sink?
3. Safe text API?
4. When sanitize?
5. Why CSP not enough alone?

## 9. Mistakes / traps
- Trusting URL params.
- Sanitizing then modifying HTML unsafely.
- Using `innerHTML` for plain text.
- Thinking React protects manual DOM writes.

## 10. Compare with related concepts
- **DOM XSS vs reflected XSS:** client sink vs server response reflection.
- **Escaping vs sanitizing:** encode text vs allow safe HTML subset.
- **CSP vs prevention:** mitigation layer vs primary fix.

## 11. Summary from memory
Explain how URL hash can become DOM XSS through `innerHTML`.

## 12. Spaced revision prompts
- 1 day: Define DOM XSS.
- 3 days: List dangerous sinks.
- 7 days: Replace `innerHTML`.
- 14 days: Explain CSP role.

