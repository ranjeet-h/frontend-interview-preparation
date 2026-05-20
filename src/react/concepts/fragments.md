# Fragments

## Detailed explanation
Fragments let a component return multiple children without adding an extra DOM element. They are useful when markup needs a group in JSX but the DOM should not include a wrapper like `div`.

Fragments help preserve semantic HTML, table structure, flex/grid layouts, and accessibility. The short syntax is `<>...</>`, while `<React.Fragment key={...}>` is needed when a fragment in a list requires a key.

## 1. One-line mental model
A Fragment groups JSX children without creating a DOM wrapper.

## 2. Problem it solves
Components often need to return adjacent elements, but extra wrapper elements can break layout or semantic markup.

## 3. Core idea
- Use fragments to return multiple siblings.
- Fragments do not render DOM nodes.
- Short syntax is common.
- Explicit `React.Fragment` can accept a key.
- Fragments keep markup cleaner and more semantic.

## 4. Visual / analogy
A fragment is like a paperclip: it groups pages but is not part of the printed text.

```tsx
<>
  <dt>React</dt>
  <dd>A UI library</dd>
</>
```

## 5. Minimal example

```tsx
function HeaderText() {
  return (
    <>
      <h1>Dashboard</h1>
      <p>Overview</p>
    </>
  );
}
```

## 6. Real-world example

```tsx
function DefinitionItem({ term, description }: Props) {
  return (
    <React.Fragment>
      <dt>{term}</dt>
      <dd>{description}</dd>
    </React.Fragment>
  );
}
```

No invalid wrapper is inserted inside the definition list.

## 7. Common interview questions
- What is a Fragment?
- Why use fragments?
- Fragment short syntax vs `React.Fragment`?
- Can fragments have keys?
- Do fragments render to the DOM?
- How do fragments help semantic HTML?
- When is a wrapper element better?

## 8. Active recall test
1. What problem does a fragment solve?
2. Does a fragment create a DOM node?
3. When do you need `React.Fragment` instead of `<>`?
4. How can fragments help table markup?
5. When should you use a real wrapper?

## 9. Mistakes / traps
- Adding unnecessary `div` wrappers.
- Trying to put props on short fragment syntax.
- Forgetting keys for mapped fragments.
- Using fragments when a semantic wrapper like `section` is better.
- Thinking fragments affect styling or layout.

## 10. Compare with related concepts
- **Fragment vs div:** fragment groups without DOM; div creates DOM.
- **Fragment vs array:** arrays can return multiple elements but need keys.
- **Fragment vs component:** fragment is a grouping construct, not a custom component.

## 11. Summary from memory
Explain why fragments are useful inside tables, lists, or definition lists.

## 12. Spaced revision prompts
- After 1 day: Define Fragment.
- After 3 days: Compare fragment and div.
- After 7 days: Use keyed fragments in a list.
- After 14 days: Explain semantic wrapper trade-offs.

