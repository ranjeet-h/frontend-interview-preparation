# StrictMode

## Detailed explanation
`StrictMode` is a development-only React tool that helps detect unsafe patterns. It can intentionally double-invoke render-related behavior and remount components in development to reveal side effects, missing cleanup, and code that depends on mounting only once.

StrictMode does not affect production behavior directly. Its value is making bugs visible earlier, especially as React supports more concurrent and interruptible rendering patterns.

## 1. One-line mental model
StrictMode is a development checker that intentionally stresses components to expose unsafe code.

## 2. Problem it solves
Components can accidentally rely on impure rendering, missing cleanup, deprecated APIs, or mount-only assumptions that break under modern React behavior.

## 3. Core idea
- Enabled with `<React.StrictMode>`.
- Runs only in development.
- Helps find unsafe side effects.
- May double-run certain logic to expose bugs.
- Does not render duplicate UI in production.

## 4. Visual / analogy
StrictMode is like a fire drill: inconvenient during practice, valuable before real failure.

```mermaid
flowchart LR
  Component["Component"] --> Strict["StrictMode checks"]
  Strict --> Warning["Warnings/extra dev runs"]
  Warning --> Fix["Fix unsafe pattern"]
```

## 5. Minimal example

```tsx
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

## 6. Real-world example

```tsx
function AppRoot() {
  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>
  );
}
```

## 7. Common interview questions
- What is StrictMode?
- Does StrictMode run in production?
- Why does React render twice in development?
- Why does effect cleanup matter in StrictMode?
- Should you remove StrictMode to fix duplicate logs?
- What bugs does StrictMode reveal?
- How does StrictMode relate to concurrent rendering?

## 8. Active recall test
1. Is StrictMode production behavior?
2. Why can logs appear twice?
3. What does remounting reveal?
4. Should render have side effects?
5. What should cleanup do?

## 9. Mistakes / traps
- Removing StrictMode instead of fixing unsafe code.
- Assuming double development behavior happens in production.
- Writing non-idempotent render logic.
- Forgetting cleanup for subscriptions.
- Treating duplicate API calls in dev as always a production bug.

## 10. Compare with related concepts
- **StrictMode vs linter:** StrictMode checks runtime development behavior; linter checks code statically.
- **StrictMode vs production:** StrictMode extra checks are development-only.
- **StrictMode vs concurrent rendering:** StrictMode prepares code for modern rendering assumptions.

## 11. Summary from memory
Explain why StrictMode can make code run twice in development and why that is useful.

## 12. Spaced revision prompts
- After 1 day: Define StrictMode.
- After 3 days: Explain double rendering in development.
- After 7 days: Debug missing cleanup exposed by StrictMode.
- After 14 days: Explain why not to remove StrictMode casually.

