# Study System

This mdBook uses one memory-first structure for concept chapters. Every new concept page should follow this format unless it is clearly a landing page, pure coding challenge, output question, source map, or index.

## Concept Chapter Template

```md
# Concept Name

## Detailed explanation
Explain the concept properly before the learning sections. This should be the first real teaching block: define the concept, explain how it works, when it appears in real projects, and why interviewers care about it.

## 1. One-line mental model
Explain the concept in one simple sentence.

## 2. Problem it solves
What pain existed before this concept?

## 3. Core idea
Explain the concept in 3-5 clear points.

## 4. Visual / analogy
Use one diagram, analogy, or flow.

## 5. Minimal example
Show the smallest possible working example.

## 6. Real-world example
Show how it appears in production code.

## 7. Common interview questions
Add 5-10 questions.

## 8. Active recall test
Ask questions without answers first.

## 9. Mistakes / traps
Mention common wrong answers and misconceptions.

## 10. Compare with related concepts
Explain what it is not.

## 11. Summary from memory
Ask the reader to explain the concept in their own words.

## 12. Spaced revision prompts
Create quick revision questions for later.
```

## Chapter Type Rules

- **Concept chapters:** use the 12-section template exactly.
- **Question banks:** may group many questions, but each detailed answer should still use the same mental-model, problem, example, traps, and comparison flow.
- **Coding challenge chapters:** keep problem, constraints, solution, walkthrough, complexity, traps, and follow-ups.
- **Output question chapters:** keep question, prediction, answer, why, trap, and variation.
- **Index pages:** only navigation and study guidance.
- **Legacy source include pages:** acceptable during migration, but new hand-written material should use the 12-section template.

## Cross-topic principles

- Start with the idea, not the answer.
- Explain the invariant in plain language.
- Use one worked example before optimizing.
- Compare trade-offs explicitly.
- Transfer the pattern to similar questions instead of memorizing isolated answers.

## Track design rules

- Every new domain starts with a landing page before it gets many chapters.
- Keep the chapter map and source map aligned whenever a track grows.
- Split large topics into smaller pages instead of extending one file forever.

## Difficulty-aware depth

- **Easy**: concise but complete walkthrough, traps, and recap.
- **Medium**: clearer state tracking and stronger invariants.
- **Hard**: proof-oriented reasoning, comparisons, and edge cases.
- **Very hard**: decomposition, multiple examples, and failure-mode analysis.
