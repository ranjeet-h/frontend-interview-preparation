# Generation Brief — Guess the Output + Debugging (Parts 2 & 3)

You are writing pages for a print-quality mdBook interview-preparation book.
Audience: a senior frontend/full-stack candidate. Write like an experienced engineer
explaining to a peer: direct, specific, no filler. Explain the *mechanism*, not just
the answer.

This supplements `BRIEF.md` (same hard output rules apply — read it first):
- Output markdown only. Problems are `## ` headings. **No H1, no numbered headings,
  no `---` between problems.**
- Tag line right after each `##`: `` `Difficulty: X` `Probability: Y` ``.
- Fences: ```` ```javascript ```` for code, ```text for output. No `js`/`ts` tags.
- Use `// => result` comments for short outputs.

## Part 2 template — Guess the Output (every question, in this order)

```
## <one-line description of the trap, e.g. "`var` reads `undefined` before assignment">

`Difficulty: Easy|Medium|Hard` `Probability: Very High|High|Medium|Low`

### The Code

```javascript
<the exact snippet, complete and runnable>
```

### Output

```text
<exact output, one line per console.log; name the error type for throws>
```

### Explanation

<mechanically why, step by step: environment setup, then statement-by-statement
execution. Name bindings, values, and queue transitions. Not "because hoisting" —
show the two timelines.>

### The Rule

<the language rule in one paragraph: TDZ, implicit binding, ToPrimitive,
SameValueZero, microtask-then-macrotask, etc.>

### How to Rewrite It Safely

<if surprising: the safe version. If not surprising (it tests correct mental models):
say what the code demonstrates and what variation would break it.>

### Takeaway

<one or two sentences>
```

## Mandatory event-loop trace

Every event-loop question MUST include this 7-step trace inside `### Explanation`:

```text
1. synchronous execution: ...
2. call stack: ...
3. scheduled microtasks: ...
4. scheduled macrotasks: ...
5. microtask execution order: ...
6. next macrotask: ...
7. final output: ...
```

## Part 3 template — Debugging (every challenge, in this order)

```
## <Bug name, e.g. "Stale closure in a `var` loop">

`Difficulty: ...` `Probability: ...`

### The Broken Code

```javascript
<exact broken snippet>
```

### What's Wrong

<the bug precisely named: stale closure / lost this / shared mutation /
unawaited forEach / sequential-but-independent awaits / unhandled rejection /
race / leak / comparator-less sort / parseInt-as-callback / float money /
missing return / missing await / unhandled path>

### The Fix

```javascript
<corrected code, complete>
```

### Why It Works

<one paragraph: the mechanism the fix restores>

### How You'd Catch It

<the test, lint rule, DevTools technique, or review smell>

### Takeaway

<one sentence>
```

## Quality bar

- **Outputs must be exact.** Trace before you write the Output section. For throws,
  give the exact error (`ReferenceError: Cannot access 'a' before initialization`,
  `TypeError: foo is not a function`, etc.).
- **Never present engine-dependent trivia as fact.** For `{} + []`-style parsing
  puzzles, explain the *parsing context* (block vs expression position) instead of
  asserting one universal answer.
- **No memorisation framing.** Every Takeaway must state a rule that predicts a
  whole family of snippets, not the answer to this one.
- Reference material on disk (same repo): `src/javascript/output-questions-3.md`
  (many exact snippets with outputs) and `src/javascript/output-questions/part-1..3/`
  (long-form explanations to mine and compress). Use them for snippet accuracy, but
  write in the template above — do not copy their format.

## Worked exemplar — a scope question

## `var` reads `undefined` before its assignment runs

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log(a);
var a = 10;
console.log(a);
```

### Output

```text
undefined
10
```

### Explanation

Two timelines. **Setup:** before any statement runs, declaration instantiation finds
`var a` in the variable environment, creates the binding, and initialises it to
`undefined`. **Execution:** statement 1 reads the existing binding → `undefined`.
Statement 2's declaration part is a no-op (binding exists); its *initializer* assigns
`5`... (read: assigns `10`). Statement 3 reads `10`.

### The Rule

`var` separates binding creation (setup, value `undefined`) from assignment
(execution, at the statement). `let`/`const` also create the binding at setup but
leave it uninitialised — reading it throws `ReferenceError` (the temporal dead zone).

### How to Rewrite It Safely

Declare before use; prefer `let`/`const` so accidental early reads throw instead of
silently yielding `undefined`.

### Takeaway

For `var`, the name arrives at setup as `undefined` and the value arrives when
execution reaches the assignment. Never collapse the two.

## Worked exemplar — an event-loop question

## Sync, microtask, then macrotask

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log("A");
setTimeout(() => console.log("B"), 0);
Promise.resolve().then(() => console.log("C"));
console.log("D");
```

### Output

```text
A
D
C
B
```

### Explanation

```text
1. synchronous execution: A logs; setTimeout schedules macrotask B; .then schedules microtask C; D logs.
2. call stack: empty after D.
3. scheduled microtasks: [C].
4. scheduled macrotasks: [B].
5. microtask execution order: C runs (microtask queue drains fully before any macrotask).
6. next macrotask: B runs.
7. final output: A, D, C, B.
```

### The Rule

The event loop drains the microtask queue completely after each macrotask (and after
the initial script). Promise callbacks and `queueMicrotask` always beat `setTimeout`,
regardless of timeout length.

### How to Rewrite It Safely

Nothing is broken here — this is the canonical ordering to internalise. The dangerous
variation is *relying* on it for correctness across semantically unrelated work;
sequence explicitly with `await` instead.

### Takeaway

Sync first, then every queued microtask, then one macrotask. `setTimeout(..., 0)`
means "next macrotask at the earliest", never "run now".
