# Diffing Algorithm

## Detailed explanation
React's diffing algorithm is the set of heuristics used during reconciliation to compare old and new element trees efficiently. A perfect tree diff can be expensive, so React uses practical assumptions that work well for UI.

The most important rules are: different element types usually produce different trees, and developers can provide stable keys to identify children across renders. This makes list updates and subtree replacement predictable.

## 1. One-line mental model
React diffing is the comparison strategy that finds what changed between two UI trees.

## 2. Problem it solves
Comparing two arbitrary trees perfectly is too expensive for frequent UI updates, so React needs a fast practical comparison approach.

## 3. Core idea
- Compare elements by type.
- If type differs, replace the subtree.
- If type matches, compare props and children.
- Use keys to match list children.
- Produce DOM update instructions for commit.

## 4. Visual / analogy
Diffing is like checking two shopping lists: match known item names first, then find added, removed, or changed items.

```txt
Old: A, B, C
New: A, C, D

With keys:
B removed
C preserved
D added
```

## 5. Minimal example

```tsx
// Type changed: subtree replacement
return isLink ? <a href="/home">Home</a> : <button>Home</button>;
```

## 6. Real-world example

```tsx
function Menu({ items }: { items: MenuItem[] }) {
  return items.map((item) => <MenuItemRow key={item.id} item={item} />);
}
```

Keys let React match rows by ID instead of by position.

## 7. Common interview questions
- What is React's diffing algorithm?
- Why is a perfect tree diff too expensive?
- What are React's diffing assumptions?
- How do keys improve diffing?
- What happens when component type changes?
- Why can index keys break state?
- How does diffing relate to reconciliation?

## 8. Active recall test
1. What is React comparing?
2. What is the type-change rule?
3. What is the key rule?
4. Why not use random keys?
5. What is the output of diffing?

## 9. Mistakes / traps
- Saying React compares every DOM node manually.
- Thinking keys improve visual sorting only.
- Using indexes in dynamic lists.
- Thinking same-looking JSX always preserves state.
- Ignoring component type identity.

## 10. Compare with related concepts
- **Diffing vs reconciliation:** diffing is the comparison mechanism inside reconciliation.
- **Diffing vs memoization:** diffing compares output trees; memoization may skip rendering work.
- **Diffing vs browser layout:** diffing is React work; layout is browser work.

## 11. Summary from memory
Explain React's two main diffing assumptions and why keys matter.

## 12. Spaced revision prompts
- After 1 day: Define diffing.
- After 3 days: Explain type replacement.
- After 7 days: Explain key-based child matching.
- After 14 days: Compare diffing and memoization.

