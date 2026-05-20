# Detached DOM Nodes

## Detailed explanation
Detached DOM node is node removed from document but still referenced by JavaScript. Because reference remains reachable, garbage collector cannot free node or its subtree.

Common causes: caches, closures, event listeners, old component refs, third-party widgets.

## 1. One-line mental model
Detached DOM node is removed from page but still kept alive by JS reference.

## 2. Problem it solves
Explains memory leaks where DOM appears gone but heap keeps growing.

## 3. Core idea
- Node removed from DOM.
- JS still references it.
- GC cannot collect it.
- Subtree/listeners may stay alive.
- Clear references/listeners on cleanup.

## 4. Visual / analogy
Taking sign off wall but keeping it tied with rope.

```txt
document removed node
cache still points to node
node not collected
```

## 5. Minimal example

```js
let saved = document.querySelector("#panel");
saved.remove();
// saved still keeps node alive
```

## 6. Real-world example

```js
return () => {
  widget.destroy();
  widgetRef.current = null;
};
```

## 7. Common interview questions
- What is detached DOM node?
- How causes memory leak?
- How find in DevTools?
- How cleanup?
- How do event listeners relate?

## 8. Active recall test
1. Is node in document?
2. Why not collected?
3. What references can retain it?
4. How cleanup widget?
5. What tool finds it?

## 9. Mistakes / traps
- Assuming `.remove()` frees memory instantly.
- Keeping DOM nodes in global arrays.
- Forgetting third-party widget cleanup.
- Ignoring retained listeners.

## 10. Compare with related concepts
- **Detached node vs hidden node:** removed from document vs still in DOM.
- **Memory leak vs normal cache:** unintended retention vs bounded useful storage.
- **GC vs cleanup:** GC needs unreachable data; cleanup removes refs.

## 11. Summary from memory
Explain how removed modal DOM can leak through stored ref.

## 12. Spaced revision prompts
- 1 day: Define detached node.
- 3 days: Give leak example.
- 7 days: Cleanup widget refs.
- 14 days: Use heap snapshot idea.

