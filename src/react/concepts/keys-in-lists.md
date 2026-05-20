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
- What are keys in React?
- Why are keys important?
- Why should indexes not be used as keys?
- Do keys need to be globally unique?
- Where should the key prop be placed?
- Can random values be used as keys?
- How do keys affect reconciliation?

## 8. Active recall test
1. What does a key identify?
2. Are keys passed as normal props?
3. When is index key acceptable?
4. Why is `Math.random()` a bad key?
5. What bugs can unstable keys cause?

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
