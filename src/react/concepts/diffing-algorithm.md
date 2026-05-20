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
#### What is React's diffing algorithm?
- **The Engine Mechanism (Why it behaves this way):** React's diffing algorithm is the comparison logic inside reconciliation that finds differences between two element trees. Instead of computing a perfect minimum-edit-distance diff (which is O(n³)), React uses two practical heuristics: (1) elements of different types at the same position trigger a full subtree replacement, and (2) for sibling children, the `key` prop provides stable identity for matching. The algorithm walks both trees in a single pass, comparing nodes positionally, and produces a list of mutations — insertions, updates, moves, and deletions.
- **The Unforgettable Mental Model:** The **Quick Sorter**. Instead of comparing every item against every other item, the sorter uses shortcuts: different categories get swapped out entirely, and items with matching ID tags are recognized instantly. It's not perfect, but it's fast enough and works for 99% of UI patterns.
- **The Trap:** Thinking React computes the mathematically optimal diff. It doesn't — it uses heuristics that are fast and correct for typical UI trees but could produce suboptimal results for unusual structures.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: React's diffing algorithm is a heuristic-based comparison strategy that finds differences between two element trees in O(n) time. It uses two key assumptions: first, elements of different types at the same position represent different subtrees, so React replaces the entire subtree. Second, for list children, developers provide keys that let React match elements by identity. These heuristics avoid the O(n³) cost of a perfect tree diff while producing correct results for typical UI patterns."

#### Why is a perfect tree diff too expensive?
- **The Engine Mechanism (Why it behaves this way):** Computing the minimum number of operations to transform one arbitrary tree into another is the tree edit distance problem, which has O(n³) time complexity. For a UI tree with 1,000 elements, that's roughly 1 billion operations. Since React may re-render dozens of times per second during user interactions, this cost is prohibitive. React's heuristics reduce this to O(n) by assuming that elements rarely change type at the same position and that developers provide keys for list items — assumptions that hold true for nearly all real-world UIs.
- **The Unforgettable Mental Model:** The **Dictionary Comparison**. Finding the exact minimum edits to transform one dictionary into another would require checking every word against every other word — millions of comparisons. But if you assume words are alphabetically ordered and only a few change between editions, you can scan both books in a single pass and find differences instantly.
- **The Trap:** Believing React's diff is "good enough" because UIs are simple. The real reason is mathematical: O(n³) is fundamentally too slow for frequent re-renders, regardless of UI complexity.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A perfect tree diff solves the tree edit distance problem, which is O(n³) in time complexity. For a tree with just 1,000 nodes, that's a billion operations — far too slow for UI that needs to re-render multiple times per second. React sidesteps this by using domain-specific heuristics: it assumes elements of different types represent different subtrees, and that list items have stable keys. These assumptions reduce diffing to O(n), making it practical for real-time UI updates."

#### What are React's diffing assumptions?
- **The Engine Mechanism (Why it behaves this way):** React makes two core assumptions to make diffing practical. First, the type assumption: if two elements at the same position have different types (e.g., `<div>` vs `<span>`, or `Button` vs `Link`), React assumes the entire subtree is different and replaces it wholesale. This avoids deep comparison of subtrees that are likely unrelated. Second, the key assumption: for children in a list, React assumes that elements with the same key represent the same logical item across renders, even if their position changed. Without keys, React assumes position equals identity.
- **The Unforgettable Mental Model:** The **Airport Security Check**. Security assumes: (1) if your passport photo looks completely different, you're a different person (type change = full replacement). (2) if you have the same passport number, you're the same person even if you're standing in a different spot in line (key match = same identity).
- **The Trap:** Assuming React's assumptions are always correct. They work for typical UIs but can produce suboptimal results in edge cases — like when you intentionally want to replace a subtree while preserving state (which requires using a `key` on the parent to force remounting).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: React's diffing algorithm relies on two assumptions. First, elements of different types at the same position represent fundamentally different UI, so React replaces the entire subtree rather than comparing deeply. Second, for list children, the key prop provides stable identity — elements with matching keys are the same item, even if their position changed. These assumptions reduce diffing from O(n³) to O(n) and work correctly for virtually all real-world UI patterns."

#### How do keys improve diffing?
- **The Engine Mechanism (Why it behaves this way):** During diffing of children, React builds a map from old keys to old Fiber nodes. When processing new children, it looks up each new key in this map. A hit means the element existed before — React reuses the Fiber node, preserving its state and DOM. A miss means the element is new — React creates a fresh Fiber node. After processing all new children, any old keys not found in the new set are marked for deletion. This map-based lookup is O(1) per element, making the entire children diff O(n). Without keys, React must compare children positionally, which causes O(n) unnecessary operations when items shift.
- **The Unforgettable Mental Model:** The **Library Catalog**. Without a catalog system, finding a book means scanning every shelf in order. With a catalog (keys), you look up the book's ID and go directly to its location. Adding a new book? Insert it at the right spot without reshuffling the entire shelf.
- **The Trap:** Using non-unique or unstable keys. If two items share a key, React's map lookup produces incorrect results. If keys change between renders (like using `Math.random()`), React thinks every item is new and remounts everything.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Keys improve diffing by giving React an O(1) lookup mechanism to match children across renders. React builds a map from old keys to old nodes, then uses new keys to find matches. Matched nodes are reused with their state preserved; unmatched nodes are created or deleted. This makes children diffing O(n) and prevents the state corruption that occurs with position-based matching. Keys should be stable, unique identifiers from your data — never random values or array indices for dynamic lists."

#### What happens when component type changes?
- **The Engine Mechanism (Why it behaves this way):** When the diffing algorithm encounters a type change at a position, it immediately marks the old subtree for deletion and schedules a new subtree for creation. React does not attempt to compare the subtrees — it assumes they are incompatible. All DOM nodes in the old subtree are removed, all component instances are unmounted (triggering `componentWillUnmount` and `useEffect` cleanup), and all local state is destroyed. New DOM nodes are created and new component instances are mounted. This is the most expensive operation in diffing because it discards all previous work.
- **The Unforgettable Mental Model:** The **Building Demolition**. If you decide a house should become a parking lot, you don't renovate — you demolish everything and start fresh. The foundation, plumbing, wiring, and furniture are all gone because the new structure has nothing in common with the old one.
- **The Trap:** Unintentionally changing types through conditional rendering patterns like `{condition ? <ComponentA /> : <ComponentB />}`. This destroys state every time the condition flips.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: When the component type changes at a position, React performs a full subtree replacement. It unmounts every component in the old subtree, removes all DOM nodes, and destroys all state. Then it mounts a completely new subtree. This is intentional — React assumes different types are incompatible. If you need to swap visual appearance while preserving state, keep the same component type and change props. If you intentionally want to reset state on a type change, you can force it by adding a `key` prop."

#### Why can index keys break state?
- **The Engine Mechanism (Why it behaves this way):** When index is used as a key, React associates component state with the array position, not the data item. Consider a list `[{id: 'A'}, {id: 'B'}]` rendered with index keys `0` and `1`. If you insert `{id: 'C'}` at the front, the list becomes `[{id: 'C'}, {id: 'A'}, {id: 'B'}]` with keys `0`, `1`, `2`. React sees key `0` existed before, so it reuses the component at position 0 — but now that component holds data `C` while its internal state (like an input value) still belongs to `A`. The state is now attached to the wrong data item, causing visible bugs.
- **The Unforgettable Mental Model:** The **Assigned Seating Disaster**. Imagine a restaurant that seats guests by arrival order. Guest A sits at table 1, Guest B at table 2. If a VIP cuts in and takes table 1, Guest A moves to table 2. But the waiter's order sheet still says table 1 ordered steak and table 2 ordered fish. Now Guest A (at table 2) gets fish, and the VIP (at table 1) gets steak — wrong orders for everyone.
- **The Trap:** Using index keys for lists that "seem static." Even lists that start static often gain sorting, filtering, or pagination later. Index keys create a latent bug that activates the moment the list mutates.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Index keys break state because they tie component identity to position rather than data. When items are inserted, deleted, or reordered, React incorrectly reuses component instances for the wrong data items. For example, inserting an item at the top shifts all indices down, and React thinks each position still holds the same component. But the data has changed, so the component's internal state — input values, toggle states, effect subscriptions — is now attached to the wrong data. The fix is always to use a stable, unique identifier from the data."

#### How does diffing relate to reconciliation?
- **The Engine Mechanism (Why it behaves this way):** Diffing is the comparison mechanism that runs as a sub-step of reconciliation. Reconciliation is the broader process: it includes rendering components to produce new element trees, diffing those trees against the previous trees, and collecting the resulting mutations. Diffing specifically handles the tree comparison logic — the type checks, key lookups, and effect tag assignments. Think of reconciliation as the full pipeline and diffing as the comparison engine within it. In the Fiber architecture, diffing happens as React walks the Fiber tree, comparing each work-in-progress node with its current counterpart.
- **The Unforgettable Mental Model:** The **Factory Assembly Line**. Reconciliation is the entire factory — raw materials come in, products are assembled, quality-checked, and shipped. Diffing is the quality control station — it compares the new product against the old spec and flags what changed. You can't have quality control without the factory, but the factory has many stations besides quality control.
- **The Trap:** Using "diffing" and "reconciliation" as synonyms. They are related but distinct: diffing is the comparison algorithm; reconciliation is the full process that includes rendering, diffing, and effect collection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Diffing is the comparison mechanism within the broader reconciliation process. Reconciliation encompasses rendering components to produce new element trees, diffing those trees against previous versions, and collecting mutations for the commit phase. Diffing specifically handles the tree comparison — checking types, matching keys, and marking effect tags. In short: reconciliation is the full pipeline, diffing is the comparison step inside it."

## 8. Active recall test
1. **What is React's diffing algorithm?**
   - **Explanation:** It is a heuristic-based comparison strategy that finds differences between two element trees in O(n) time. It uses type comparison (different types = subtree replacement) and key-based matching (keys identify list items across renders) to avoid the O(n³) cost of a perfect tree diff.
2. **Why is a perfect tree diff too expensive?**
   - **Explanation:** The tree edit distance problem has O(n³) complexity. For a 1,000-node tree, that's ~1 billion operations — too slow for UI that re-renders multiple times per second. React's heuristics reduce this to O(n).
3. **What are React's two diffing assumptions?**
   - **Explanation:** (1) Elements of different types at the same position represent different subtrees, so React replaces the entire subtree. (2) For list children, the key prop provides stable identity — matching keys mean the same item.
4. **How do keys improve diffing?**
   - **Explanation:** Keys enable O(1) map lookups to match children across renders. React builds a map of old keys to old nodes, then uses new keys to find matches. This avoids position-based matching and preserves component state.
5. **What happens when component type changes?**
   - **Explanation:** React unmounts the entire old subtree, destroys all DOM nodes, runs cleanup functions, and creates a brand new subtree. All component state is lost.
6. **Why can index keys break state?**
   - **Explanation:** Index keys tie component identity to position. When items are inserted or reordered, React reuses component instances for the wrong data items, causing internal state to attach to incorrect data.
7. **How does diffing relate to reconciliation?**
   - **Explanation:** Diffing is the comparison mechanism inside reconciliation. Reconciliation is the full process (render + compare + collect mutations); diffing is specifically the tree comparison step.

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

