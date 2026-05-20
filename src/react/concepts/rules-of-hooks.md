# Rules of Hooks

## Detailed explanation
The Rules of Hooks are constraints that keep React's hook state mapping predictable. Hooks must be called at the top level of React function components or custom hooks, not inside conditions, loops, nested functions, or after early returns.

React relies on call order to associate each hook call with its stored state. If hook order changes between renders, React can attach the wrong state to the wrong hook.

## 1. One-line mental model
Hooks must run in the same order on every render.

## 2. Problem it solves
React needs a stable way to match hook calls to stored hook state across renders.

## 3. Core idea
- Call hooks only at top level.
- Call hooks only from React components or custom hooks.
- Do not call hooks conditionally.
- Move conditions inside the hook body when needed.
- Use lint rules to catch violations.

## 4. Visual / analogy
Hook order is like numbered lockers: if you skip locker 2, everyone after it gets the wrong locker.

```txt
Render 1: useState -> useEffect -> useMemo
Render 2: useState ->            useMemo  // broken order
```

## 5. Minimal example

```tsx
function Component({ enabled }: { enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled) return;
    start();
  }, [enabled]);
}
```

## 6. Real-world example

```tsx
function useFeatureFlag(name: string) {
  const flags = React.useContext(FeatureFlagContext);
  return Boolean(flags[name]);
}
```

The custom hook follows the rules and can be reused safely.

## 7. Common interview questions
- What are the Rules of Hooks?
- Why can't hooks be called conditionally?
- Why must custom hooks start with `use`?
- What catches hook rule violations?
- Can hooks be called in normal functions?
- How do you handle conditional effects?
- What happens if hook order changes?

## 8. Active recall test
1. Why does hook order matter?
2. Where can hooks be called?
3. Where can hooks not be called?
4. How do you conditionally run effect logic?
5. Why does linting matter?

## 9. Mistakes / traps
- Calling a hook after an early return.
- Calling hooks inside event handlers.
- Calling hooks in normal utility functions.
- Conditionally calling a custom hook.
- Disabling hook lint rules instead of fixing structure.

## 10. Compare with related concepts
- **Rules of Hooks vs dependency rules:** call-order rules decide where hooks run; dependency rules decide when effects/memos update.
- **Custom hook vs utility:** custom hooks can call hooks and must follow rules.
- **Conditional hook vs conditional logic:** hook call stays unconditional; logic inside can be conditional.

## 11. Summary from memory
Explain why React requires hooks to be called in the same order every render.

## 12. Spaced revision prompts
- After 1 day: List the two Rules of Hooks.
- After 3 days: Fix a conditional hook call.
- After 7 days: Explain hook order.
- After 14 days: Compare hook rules and dependency arrays.

