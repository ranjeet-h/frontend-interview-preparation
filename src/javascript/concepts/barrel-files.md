# Barrel Files

## Detailed explanation
Barrel files re-export many modules from one `index.js`/`index.ts`. They make imports cleaner, but can hurt tree shaking, increase accidental coupling, and create circular dependencies.

Frontend interviews ask this in bundle-size and architecture discussions.

## 1. One-line mental model
Barrel file is re-export hub for many modules.

## 2. Problem it solves
Many deep imports become noisy and unstable.

## 3. Core idea
- Uses `export * from`.
- Simplifies import paths.
- Can hide dependency graph.
- Can hurt tree shaking depending on tooling.
- Can create circular imports.

## 4. Visual / analogy
Barrel = central doorway to many rooms.

```js
export * from "./Button";
export * from "./Modal";
```

## 5. Minimal example

```js
// ui/index.js
export { Button } from "./Button";
export { Input } from "./Input";
```

## 6. Real-world example

```js
import { Button, Dialog } from "@/shared/ui";
```

## 7. Common interview questions
- What is barrel file?
- Why use it?
- How can it hurt tree shaking?
- What are circular dependency risks?
- When avoid barrel files?

## 8. Active recall test
1. What does barrel export?
2. Why imports get cleaner?
3. How bundle can grow?
4. What cycle risk exists?
5. When direct import better?

## 9. Mistakes / traps
- Exporting everything from huge package root.
- Creating cycles between feature barrels.
- Assuming tree shaking always works.
- Hiding side-effect imports.

## 10. Compare with related concepts
- **Barrel vs direct import:** convenience vs explicit dependency.
- **Named export vs barrel:** export style vs aggregation file.
- **Tree shaking vs barrel:** dead-code elimination can be harder if graph unclear.

## 11. Summary from memory
Explain why `@/components` barrel may increase bundle risk.

## 12. Spaced revision prompts
- 1 day: Define barrel file.
- 3 days: Explain tree-shaking risk.
- 7 days: Find circular import risk.
- 14 days: Decide direct vs barrel import.

