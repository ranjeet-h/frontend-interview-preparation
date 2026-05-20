# Keys in React Lists

## Detailed explanation
Keys are special values that help React match list items between renders. When a list changes, React needs to know whether each child is the same item, a new item, a removed item, or an item that moved. Keys provide that identity among siblings.

Stable keys are essential when list items contain local state, focus, animations, or uncontrolled inputs. Bad keys, especially array indexes in dynamic lists, can attach the wrong state to the wrong item.

## 1. One-line mental model
Keys tell React which list item is which across renders so it can preserve the right identity and state.

## 2. Problem it solves
When list items are inserted, removed, sorted, or filtered, React needs a stable way to match old children with new children. Without keys, it falls back to position, which can reuse the wrong DOM or component state.

## 3. Core idea
- A key is React's identity hint for siblings in a list.
- Keys must be stable, unique among siblings, and based on data identity.
- IDs from the backend are usually good keys.
- Index keys are only safe for static lists that never reorder or change.
- Bad keys cause state mix-ups, focus bugs, animation bugs, and unnecessary work.

## 4. Visual / analogy
Keys are like name tags at a conference. If people change seats, their name tags still identify them.

```txt
Good keys:
Before: A(id=1), B(id=2)
After:  C(id=3), A(id=1), B(id=2)

React can match A and B by id.
```

## 5. Minimal example

```tsx
items.map((item) => (
  <li key={item.id}>{item.label}</li>
));
```

## 6. Real-world example

```tsx
function EditableTodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul>
      {todos.map((todo) => (
        <EditableTodo key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
```

If a todo is inserted above the focused todo, stable keys help React keep focus and local state attached to the correct item.

## 7. Common interview questions
#### What are keys in React?
- **The Engine Mechanism (Why it behaves this way):** Keys are special string values that React uses to identify individual elements among siblings in a list. During the reconciliation phase, when React compares the old and new element trees, it uses keys to match elements between renders. If an element with key "A" exists in both the old and new tree, React knows it's the same item and preserves its DOM node and component state. If a key appears in the new tree but not the old, React mounts a new element. If a key disappears, React unmounts it. Keys are consumed by React during reconciliation and are not passed to components as props.
- **The Unforgettable Mental Model:** The **Name Tag at a Conference**. Each attendee wears a name tag (key) that identifies them regardless of where they sit. If people change seats (reorder), the name tags still correctly identify who is who.
- **The Trap:** Thinking keys are passed to components as `props.key`. React extracts and consumes keys at the reconciliation level — `props.key` inside a component is always `undefined`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Keys are special values that React uses to identify list items across renders. During reconciliation, React compares the old and new element trees and uses keys to match elements — knowing which items are the same, which are new, and which were removed. Keys should be stable, unique among siblings, and based on data identity. They're not passed to components as props; React consumes them internally during the diffing process."

#### Why are keys important?
- **The Engine Mechanism (Why it behaves this way):** Keys are important because they ensure React correctly preserves component state and DOM node identity when a list changes. Without keys, React matches elements by position (index), which causes problems when items are inserted, removed, or reordered. For example, if a list item contains an uncontrolled input with typed text, and a new item is inserted above it, React without keys would shift the input's DOM node to the wrong item, causing the typed text to appear on the wrong row. Keys prevent this by telling React exactly which element corresponds to which data item, regardless of position changes.
- **The Unforgettable Mental Model:** The **Hotel Room Assignment**. Without keys, the hotel assigns guests to rooms by arrival order. If a VIP arrives and gets inserted at the front, everyone else shifts rooms — the guest in room 3 now has room 4's key. With keys, each guest has a specific room number that doesn't change regardless of who arrives.
- **The Trap:** Thinking keys are only about performance. While keys do help React optimize, their primary purpose is correctness — preventing state from being attached to the wrong item.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Keys are important for two reasons: correctness and performance. For correctness, keys ensure that when a list changes, React preserves the right state for the right item — especially critical when list items have local state like input values or focus. For performance, keys help React minimize DOM operations by reusing existing elements instead of destroying and recreating them. Without keys, React falls back to position-based matching, which can cause state mix-ups and unnecessary work."

#### Why should indexes not be used as keys?
- **The Engine Mechanism (Why it behaves this way):** Index keys tie an element's identity to its position in the array. When the array changes — items are inserted, removed, sorted, or filtered — the positions shift, and React incorrectly matches elements. For example, if you have items [A, B, C] with keys [0, 1, 2] and insert D at the front, the new keys are [0, 1, 2, 3]. React thinks the element at key 0 is still A (it's now D), key 1 is still B (it's now A), etc. This causes React to reuse the wrong DOM nodes and component state for each item. The result: input values appear on wrong rows, focus jumps to wrong elements, and animations fire on wrong items.
- **The Unforgettable Mental Model:** The **Musical Chairs**. Index keys are like musical chairs — when the music stops and someone new joins, everyone shifts seats. The person who was in chair 2 is now in chair 3, but you still identify them by chair 2.
- **The Trap:** Using index keys because "it works" in a simple demo where the list never changes. The bug only appears when the list becomes dynamic.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Index keys tie element identity to array position, which breaks when the list changes. If you insert an item at the front, all subsequent items shift positions, and React thinks they're different elements. This causes state to be associated with the wrong item — input values appear on wrong rows, focus jumps unexpectedly, and animations fire incorrectly. I only use index keys for static lists that never reorder, insert, or remove items. For dynamic lists, I always use a stable ID from the data."

#### Do keys need to be globally unique?
- **The Engine Mechanism (Why it behaves this way):** Keys only need to be unique among sibling elements at the same level in the tree. React uses keys to differentiate siblings during reconciliation, not across the entire application. Two different lists can use the same key values without conflict because React scopes key matching to the sibling array. For example, a list of users with IDs [1, 2, 3] and a list of products with IDs [1, 2, 3] can coexist without issues because they're in different parent elements. However, within a single `map()` call, every key must be unique.
- **The Unforgettable Mental Model:** The **Apartment Number**. Apartment 1A in Building A is different from Apartment 1A in Building B. The number only needs to be unique within its building (sibling group), not across the entire city (application).
- **The Trap:** Generating globally unique keys (like UUIDs) when a simple database ID would suffice. This adds unnecessary complexity and can cause issues if the UUID changes between renders.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Keys only need to be unique among siblings at the same level, not globally across the application. React scopes key matching to the sibling array during reconciliation. So two different lists can use the same ID values without conflict. Within a single list, however, every key must be unique — you can't have two items with key="1" in the same map. I typically use database IDs as keys, which are naturally unique within their collection."

#### Where should the key prop be placed?
- **The Engine Mechanism (Why it behaves this way):** The key prop must be placed on the outermost element returned by the `map()` callback — the element that React sees as a sibling in the list. When you write `items.map(item => <li key={item.id}>{item.name}</li>)`, the key is on the `<li>` element. If you extract the item into a component, the key goes on the component tag: `items.map(item => <Item key={item.id} data={item} />)`. React reads the key during reconciliation of the sibling array and does not pass it to the component. Placing the key on an inner element (inside the component's JSX) has no effect because React never sees it at the sibling level.
- **The Unforgettable Mental Model:** The **Shipping Label**. The key is like a shipping label on the outside of a package. The delivery service (React) reads it to route the package. If you put the label inside the box (inside the component), the delivery service can't see it.
- **The Trap:** Placing the key inside the child component's own JSX instead of on the component tag in the map. This is invisible to React's reconciliation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The key goes on the element returned by the map callback — the direct child in the sibling array. If I'm mapping to a component, the key goes on the component tag: `items.map(item => <Item key={item.id} />)`. If I'm mapping to a DOM element, it goes on that element: `items.map(item => <li key={item.id} />)`. React consumes the key at the sibling level during reconciliation and doesn't pass it to the component as a prop."

#### Can random values be used as keys?
- **The Engine Mechanism (Why it behaves this way):** Using random values (like `Math.random()`) as keys causes React to treat every element as a new item on every render, because the key changes each time. This forces React to unmount and remount every element in the list, destroying all local state (input values, focus, animations) and performing unnecessary DOM operations. Random keys defeat the entire purpose of keys, which is to provide stable identity across renders. The only scenario where random keys might be intentional is when you explicitly want to force a full remount of all items, but this is almost always an anti-pattern.
- **The Unforgettable Mental Model:** The **Daily ID Card**. Imagine if your ID card changed its number every day. The security guard (React) would think you're a different person every morning and make you go through the full onboarding process again.
- **The Trap:** Using `Math.random()` to "fix" a key warning without understanding the consequences. This silences the warning but creates worse problems.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: No, random values should never be used as keys. Random keys change on every render, which causes React to treat every element as new — unmounting and remounting everything, destroying local state, and performing unnecessary DOM work. Keys need to be stable across renders for the same item. If I don't have a stable ID from the data, I'd rather use an index key (for static lists) than a random key, because at least index keys are stable within a single render."

#### How do keys affect reconciliation?
- **The Engine Mechanism (Why it behaves this way):** During reconciliation, React's diffing algorithm processes sibling elements by comparing their keys. It builds a map of old keys to old elements, then iterates through the new elements: if a new element's key exists in the old map, React reuses the existing element and updates its props; if the key doesn't exist, React creates a new element; if an old key doesn't appear in the new list, React removes that element. This key-based matching allows React to efficiently handle insertions, deletions, and reorders with minimal DOM operations. Without keys, React falls back to position-based matching, which is less efficient and can cause state mismatches.
- **The Unforgettable Mental Model:** The **Matching Game**. Reconciliation with keys is like a matching game — React lays out the old cards (elements) face up, then deals new cards one by one, finding matches by their key labels. Matched cards stay on the table with updated details; new cards are added; unmatched old cards are removed.
- **The Trap:** Thinking React does a deep comparison of element content. React only compares keys and types — if the type changes, the entire subtree is replaced regardless of content similarity.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Keys are central to React's reconciliation algorithm. When React diffs a list of siblings, it builds a map of old keys to old elements, then iterates through new elements to find matches. If a key matches, React reuses the existing element and updates its props. If a key is new, React mounts a new element. If an old key disappears, React removes it. This allows React to handle insertions, deletions, and reorders efficiently. Without keys, React matches by position, which is less efficient and can cause state to be associated with the wrong item."

## 8. Active recall test
1. **What does a key identify?**
   - **Explanation:** A key identifies a specific list item among its siblings across renders. It allows React to match an element in the new tree with the corresponding element in the old tree, preserving the element's DOM node and component state regardless of position changes.
2. **Are keys passed as normal props?**
   - **Explanation:** No. Keys are consumed by React during reconciliation and are not passed to the component as `props.key`. Inside a component, `props.key` is always `undefined`. Keys are used at the sibling level to match elements between renders.
3. **When is index key acceptable?**
   - **Explanation:** Index keys are only acceptable for static lists that never change order, never have items inserted or removed, and never filter items. In these cases, position never changes, so index-based identity is stable. For any dynamic list, index keys cause state mismatches.
4. **Why is `Math.random()` a bad key?**
   - **Explanation:** `Math.random()` generates a new value on every render, so React treats every element as a new item each time. This forces React to unmount and remount all elements, destroying local state (input values, focus) and performing unnecessary DOM operations. Keys must be stable across renders.
5. **What bugs can unstable keys cause?**
   - **Explanation:** Unstable keys (like index keys on dynamic lists or random keys) cause: (1) State mismatches — input values, focus, or component state appear on the wrong item after reordering. (2) Unnecessary remounts — React destroys and recreates DOM nodes instead of reusing them. (3) Animation bugs — animations fire on wrong items. (4) Performance degradation — more DOM operations than necessary.

## 9. Mistakes / traps
- Using array index as key for editable or sortable lists.
- Using `Math.random()` and remounting every item every render.
- Thinking keys must be globally unique across the whole app.
- Placing key inside the child component instead of the mapped element.
- Expecting to read `props.key` inside a component. React does not pass it as a normal prop.

## 10. Compare with related concepts
- **Key vs ID:** ID belongs to data; key is React's render identity hint. Often they use the same value.
- **Key vs prop:** key is special and not available as `props.key`.
- **Key vs ref:** key identifies elements for React; ref gives access to a node or instance.
- **Stable key vs random key:** stable preserves identity; random forces remounts.

## 11. Summary from memory
Explain why using index as key breaks an editable todo list when a new item is inserted at the top.

## 12. Spaced revision prompts
- After 1 day: Define key.
- After 3 days: Explain index-key bugs.
- After 7 days: Identify good and bad keys in code.
- After 14 days: Connect keys to reconciliation.
