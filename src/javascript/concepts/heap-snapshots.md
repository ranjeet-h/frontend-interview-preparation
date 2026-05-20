# Heap Snapshots

## Detailed explanation
Heap snapshots are Chrome DevTools memory captures showing objects currently retained in JavaScript heap. They help find leaks by comparing snapshots before and after user flows.

Senior frontend debugging uses snapshots to find retained DOM nodes, growing arrays/maps, closures, and unexpected references.

## 1. One-line mental model
Heap snapshot shows what memory is still reachable and why.

## 2. Problem it solves
Memory leaks need evidence of retained objects, not guesses.

## 3. Core idea
- Capture heap state.
- Repeat flow.
- Force GC if appropriate.
- Compare snapshots.
- Inspect retaining paths.

## 4. Visual / analogy
Heap snapshot = X-ray of memory.

```txt
Snapshot A -> run flow -> Snapshot B -> compare retained objects
```

## 5. Minimal example

```txt
Chrome DevTools -> Memory -> Heap snapshot -> Take snapshot
```

## 6. Real-world example

```txt
Open modal/close modal 20 times.
Take snapshots.
Look for retained detached modal nodes.
```

## 7. Common interview questions
- What is heap snapshot?
- How debug memory leak?
- What is retaining path?
- How find detached DOM nodes?
- Snapshot vs performance recording?

## 8. Active recall test
1. What does snapshot capture?
2. Why compare snapshots?
3. What is retaining path?
4. How find detached nodes?
5. Why force GC?

## 9. Mistakes / traps
- Trusting one snapshot only.
- Ignoring normal cache growth.
- Not reproducing flow consistently.
- Confusing allocation timeline with snapshot.

## 10. Compare with related concepts
- **Heap snapshot vs Performance panel:** memory graph vs runtime timeline.
- **Retained size vs shallow size:** total kept alive vs object itself.
- **Leak vs cache:** unbounded unintended growth vs managed storage.

## 11. Summary from memory
Explain workflow to confirm modal memory leak.

## 12. Spaced revision prompts
- 1 day: Define heap snapshot.
- 3 days: Explain retaining path.
- 7 days: Compare snapshots.
- 14 days: Diagnose detached node leak.

