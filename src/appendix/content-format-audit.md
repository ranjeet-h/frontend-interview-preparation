# Content Format Audit

This audit tracks where the mdBook already follows the concept-study structure and where it still uses older formats.

## Required Concept Format

Every concept chapter should use:

1. One-line mental model
2. Problem it solves
3. Core idea
4. Visual / analogy
5. Minimal example
6. Real-world example
7. Common interview questions
8. Active recall test
9. Mistakes / traps
10. Compare with related concepts
11. Summary from memory
12. Spaced revision prompts

## Current Status

| Area | Status | Notes |
|---|---|---|
| `src/study-system.md` | Updated | The book-wide standard now documents the 12-section concept template. |
| `src/react/concepts/*` React fundamentals batch | Updated | The first React fundamentals batch now uses the correct pattern: one concept gets all 12 learning sections. |
| `src/react/*` broad additions | Needs split | Broad pages like server state, routing, and forms should be split further into one page per concept when expanded. |
| Existing React source include chapters | Needs migration | Files like `core-concepts.md`, `hooks.md`, and `state-performance.md` include legacy line ranges from `04-react-theory-concepts.md`. They render correctly but do not fully follow the 12-section template yet. |
| JavaScript theory chapters | Needs migration | Current chapters are source includes and topic collections, not one concept per template. |
| Frontend fundamentals | Needs migration | HTML/CSS/Web concepts need splitting into concept pages or rewritten sections. |
| DSA and coding problems | Different format allowed | Coding challenge content should keep problem/solution structure, but add traps, active recall, and spaced revision where missing. |
| System design | Different format allowed | Scenario chapters can stay case-study based, but individual concept explanations should use the template. |
| Backend question banks | Needs partial migration | Existing Q&A format is useful, but detailed answers should be reshaped into mental model/problem/core idea/examples/traps/comparison prompts. |

## Migration Rule

When editing an existing concept, rewrite that concept into the 12-section structure instead of appending more free-form explanation. If a chapter contains many concepts, split high-value concepts into their own pages over time.

## React Migration Queue

Continue the React migration in small batches:

1. What causes a re-render
2. Parent-child re-render behavior
3. State update batching
4. Automatic batching
5. Render phase vs commit phase
6. Memoization
7. `React.memo`
8. Avoiding unnecessary re-renders
9. Expensive calculations in components
10. Avoiding inline object/function props
11. Key stability
12. List virtualization and windowing
13. Code splitting and lazy loading
14. `React.lazy`
15. `Suspense`
16. Bundle size optimization
17. Profiling React apps
18. React Profiler and flamegraphs
19. Context performance issues
20. Concurrent rendering and transitions
