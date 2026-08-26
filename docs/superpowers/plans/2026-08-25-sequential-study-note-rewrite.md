# Sequential Study-Note Rewrite Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development plus superpowers:dispatching-parallel-agents. The master agent is an orchestrator, not a bulk rewriter. It assigns one leaf page to each worker, runs as many workers in parallel as the harness allows, reviews their diffs, then immediately assigns the next free pages. Keep looping until the tracker has no `queued` leaf pages. Never pause to ask whether to continue.

**Goal:** Rewrite every standalone study topic in the repository so a senior full-stack developer understands the underlying idea deeply through the user-provided Type A–E format, accurate examples, real trade-offs, traps, comparisons, and a memorable mental model.

**Format spec (workers must read this file):** this document, heading `Canonical Type A–E Rewrite Spec`. Do not invent a shorter template. The heading list in the worker contract is only a reminder; the full writing instructions live in that spec section.

**Tracker:** `docs/superpowers/plans/2026-08-25-one-topic-rewrite-tracker.md`

**Architecture:** The master agent owns the queue, git, and reviews. Worker subagents own one file each. Parallelism is many workers at once, never many files inside one worker. A worker must read its whole page, classify it, and rewrite it by hand. Scripts, templates applied to a folder, search-and-replace across files, and “generate 20 pages” prompts are forbidden. Navigation, include-only chapters, source maps, and generated book output remain wiring around the leaf pages.

**Tech Stack:** Markdown, mdBook, JavaScript/Node.js, React examples, Python/FastAPI examples, SQL, MongoDB/Mongoose, SQLAlchemy, Mermaid/text diagrams, and the repository's existing root source documents.

## Global Constraints

- Rewrite exactly one topic page per worker task. Many workers may run at the same time on different files. One worker must never touch a second topic page.
- The master loops: pick N unassigned queued files → dispatch N workers → review → mark tracker → dispatch the next N. Do not stop between waves until the leaf queue is empty or a worker is BLOCKED on a real ambiguity.
- Read the complete target page before drafting. Do not infer the topic from its filename alone.
- Classify the page as exactly one of Type A, B, C, D, or E from the user's prompt before writing.
- Preserve the user's exact section order for the detected type. The format is a teaching contract, not a loose suggestion.
- Never open with a definition. Start with the production pain, failure, or interview situation that creates the need for the idea.
- Write in simple, spoken English. A smart junior should understand the explanation on one read. Plain words first; technical terms only after the idea is already clear. Casual and precise, not textbook, not corporate, not dumbed-down.
- Do not use the headings or concepts called out as forbidden by the prompt: `Engine Mechanism`, `Senior Interview Playbook`, or script-like interview answers.
- Replace generic filler with page-specific reasoning. A page must name the actual invariant, failure mode, runtime behavior, query shape, or architectural trade-off it teaches.
- Do not use a script-writing pass, code generator, mass search-and-replace, or multi-file rewrite. Read-only inventory commands are allowed; content must be manually reasoned about page by page.
- Keep one topic per existing leaf page. Do not create a new cross-topic mega-page to avoid doing an individual rewrite.
- Preserve existing paths and links unless a link is demonstrably broken. Navigation changes happen only in a separate wiring task after the leaf content is complete.
- Do not touch the existing untracked `.DS_Store` or unrelated worktree changes.
- Use the most specific source of truth available: the matching implementation and tests for coding pages, the exact snippet and runtime for output pages, the schema/query for database pages, and the existing requirements/source material for system-design pages.
- Code and queries must be correct and runnable where the page promises runnable material. If a framework or database cannot be run locally, state the exact environment assumption and still syntax-check or reason through the smallest executable example.
- After a wave, the master verifies each page, runs `mdbook build` once for the wave, confirms each worker only changed its assigned file, then commits one page per commit in series. Workers must not run `git commit`.
- Wave size: use the largest parallel subagent count the harness accepts (target 8). If a dispatch fails, drop the wave size and continue. Never compensate by letting one worker rewrite multiple pages.

## Current Repository Scope

The checkout currently contains 1,007 markdown files. About 920 of those are leaf teaching pages still using the old 12-section template (`One-line mental model`, and often `Engine Mechanism` / `Senior Interview Playbook`). Those are the rewrite queue.

| Queue | Current pages | Page families |
|---|---:|---|
| JavaScript concepts | 56 | `src/javascript/concepts/*.md` excluding `index.md` |
| React concepts + focused chapters | ~74 | `src/react/concepts/*.md` plus focused chapters listed in Phase 2 |
| Backend | ~620 | Leaf pages under `src/full-stack/backend/**`, excluding indexes |
| Databases | ~170 | Leaf pages under `src/full-stack/databases/**`, excluding indexes |
| **Initial leaf queue** | **~920** | One independently verified task and commit per page |

**Never rewrite as one topic:** `src/**/index.md`, `src/SUMMARY.md`, include-only wrappers (`{{#include ...}}`), `src/javascript/output-questions.md`, `output-questions-2.md`, `output-questions-3.md` (4,775 lines of many puzzles), `src/dsa/*.md` dumps, `src/react/practical-questions.md`, `src/react/coding-challenges.md`, root archives (`01-*.md` through `06-*.md`, `the-transformation-group.md`, `ops-tree-interview-qna.md`). If those later need work, split **one question into one new file**, rewrite that file, commit, then stop.

**Frontend question banks stay single files:** `src/frontend/question-banks.md` and `src/frontend/coding-questions.md` are rewritten in place with full learning content (study-bank sections + Format B per problem). Do not split them per question.

`src/study-system.md` is the only non-topic file allowed before the queue starts. It documents the recipe. It is Task 0, not a bulk content rewrite.

## Master Orchestrator Loop

The master never rewrites a topic page itself unless a worker failed and a single retry is needed.

```text
until tracker has no queued leaf pages:
  1. Claim the next N queued files that are not currently assigned.
  2. Dispatch N fresh subagents in one turn (true parallel).
  3. Each subagent gets exactly one absolute file path and the worker contract below.
  4. When the wave returns, review each diff against the Type A–E contract.
  5. Reject lazy work: unchanged template, generic filler, Engine Mechanism, interview scripts,
     or a file that was not fully read. Send that one file back to a fresh worker.
  6. Mark accepted pages rewritten in the tracker.
  7. Commit accepted pages one file per commit (master only).
  8. Immediately start the next wave. Do not wait for the user.
```

Workers must not edit the tracker, `SUMMARY.md`, indexes, or each other's files. Only the master updates the tracker after review.

## Worker Contract (paste into every subagent)

You are rewriting one interview study page. You are not a bulk generator.

Before writing, Read this plan file:

`/Users/ranjeetharishchandre/Documents/Personal/frontend-interview-preparation/docs/superpowers/plans/2026-08-25-sequential-study-note-rewrite.md`

Read from the heading **Canonical Type A–E Rewrite Spec** through the end of **Rules that apply to all formats**. That block is the full teaching contract. Then Read the entire assigned topic file. Then classify. Then rewrite.

Hard rules:
- Read the entire assigned file before writing anything.
- Touch only that one assigned topic file. No other markdown. No scripts. No loops over directories. No search-and-replace across the repo. You may Read this plan and the assigned page. You may Read neighboring pages only to avoid copying them.
- Classify exactly one type: A concept, B coding problem, C output/predict, D system design, E database/backend pattern.
- Apply that type's format in exact section order. Do not skip sections. Use the heading text from the spec.
- Replace the old 12-section template in place. Do not append a second explanation under it.
- Never open with a definition. Open with the real pain.
- Write in simple, easy-to-understand language. Explain like you are talking, not lecturing. No dense academic prose. No jargon until the idea is already obvious.
- Forbidden: `Engine Mechanism`, `Senior Interview Playbook`, verbal scripts, “it is worth noting that”, “in conclusion”.
- Length follows the topic. Do not shrink a hard topic to look efficient.
- Return: type chosen, absolute path, section list used, and a short note on what was generic vs what you actually taught.
- Do not git commit. The master commits after review.

## Page-by-Page Operating Procedure

Every leaf page follows this exact loop inside a single worker. These are the steps for one page, not a batch recipe.

### Task N: Rewrite one target page

**Files:**

- Modify: the single target markdown file named before starting the task
- Read: the target page's linked canonical chapter, source implementation, test file, or schema/query when one exists
- Temporary: any runtime-check file goes outside the repository and is deleted before the task ends

**Interfaces:**

- Consumes: the current page, its source-of-truth material, the user's Type A–E format, and the neighboring-topic links needed to avoid duplication
- Produces: one self-contained study page with the exact detected format, working examples, interview-ready understanding, and stable links

- [ ] **Step 1: Establish a clean page boundary.**

  Run `git status --short` and record the existing unrelated changes. Confirm the target path is the only intended content file for this task. Do not stage `.DS_Store`.

- [ ] **Step 2: Read the target completely.**

  Read the title, current explanation, every code block, every question and answer, traps, comparisons, links, and any include directive. Note what is correct, what is generic, what is missing, and what must remain source-faithful. Do not begin rewriting after reading only the first section.

- [ ] **Step 3: Read the page's evidence.**

  For a coding page, read the matching implementation and tests. For an output page, run or manually trace the exact snippet in the appropriate JavaScript environment. For a database page, inspect the schema, query shape, indexes, transaction boundaries, or ORM model. For system design, extract explicit requirements, scale assumptions, and failure modes from the existing page before choosing architecture.

- [ ] **Step 4: Classify exactly one type.**

  Choose Type A (concept/theory), Type B (coding problem), Type C (output/predict the result), Type D (system design), or Type E (database/backend pattern). If the filename and content disagree, classify by the content and record the reason in the commit description or task commentary.

- [ ] **Step 5: Build a page-specific teaching outline before prose.**

  Write down the opening production pain, one accurate analogy, the core invariant/mechanism, the real examples, the likely interview questions, the traps, the related concepts, and the memory hook. This is a temporary reasoning aid only; do not add a planning artifact to the repository for every page.

- [ ] **Step 6: Rewrite the page manually.**

  Replace the generic template rather than appending another explanation below it. Use plain language first, introduce terminology after the idea is clear, and make every example serve this page's exact topic. Keep the section headings flat and in the order required below.

- [ ] **Step 7: Verify the content.**

  Check the section order, problem-first opening, code/query correctness, exact output values, complexity claims, trade-offs, links, and the presence of the final `🧠 The Memory Hook`. Search the changed page for forbidden headings and generic filler.

- [ ] **Step 8: Run the smallest relevant technical checks.**

  Run `git diff --check -- <target>` and `mdbook build`. For JavaScript, run `node --check` or execute the exact snippet when possible. For Python, use `python3 -m py_compile` on a temporary file. For SQL, execute dialect-neutral examples with `sqlite3 :memory:` when valid and label PostgreSQL/MySQL-specific syntax. For MongoDB, use `mongosh` syntax checks or a local example when available. For React, verify the code against the repository's stated React assumptions and keep the example internally runnable rather than inventing APIs.

- [ ] **Step 9: Confirm the diff boundary.**

  Run `git diff --name-only` and confirm that only the target page is modified by the rewrite. Generated `book/` output is ignored and may be produced by mdBook; do not stage it. If any unrelated source file changed, stop and resolve the boundary before committing.

- [ ] **Step 10: Commit one page.**

  Stage only the target page and commit with `docs: rewrite <short-topic-name>`. Do not combine two topic pages, a navigation update, or a cleanup pass in the same commit.

## Canonical Type A–E Rewrite Spec

This is the full teaching prompt. Workers follow it exactly. Master agents review against it. Do not shorten this section when dispatching work.

You are rewriting a technical study note for a full-stack developer preparing for senior-level interviews.

Your single goal: the reader reads this once and understands it so deeply and clearly that it stays with them forever — not because they memorized it, but because they truly get it.

Write like the smartest senior engineer they've ever met sat down with them and actually explained this thing properly for the first time. Casual, confident, deeply clear. Zero textbook energy. Zero corporate tone. No "it is worth noting that". No "in conclusion". No scripts to memorize.

Use as many words as the topic needs. Never sacrifice depth or clarity to be short. A complex topic deserves a thorough explanation. A simple topic deserves a tight one. Let the content decide the length, not an arbitrary limit.

### Step 1 — Detect the topic type

Read the content silently and classify it into exactly ONE of these 5 types before writing anything.

**Type A — Concept / Theory**

How something works under the hood: JS mechanics, React internals, HTTP, caching, the event loop, closures, prototypes, CAP theorem, database indexing, auth flows, etc.

**Type B — Coding Problem**

Write or implement something: array/string/object problems, polyfills, custom hooks, algorithm implementations, DSA problems, frontend application problems.

**Type C — Output / Predict the Result**

Read code and say what it prints or returns: hoisting order, closure values, async/await execution order, `this` binding, prototype chain lookups, event loop tick order, class behavior.

**Type D — System Design**

Design a real large-scale system: URL shortener, chat app, rate limiter, notification service, distributed cache, feed system, payment service, etc.

**Type E — Database / Backend Pattern**

SQL vs NoSQL decisions, indexing strategies, query optimization, Node.js patterns, REST vs GraphQL, FastAPI design, ORM behavior, connection pooling, transactions, auth, API design patterns.

### Step 2 — Apply the right format

Use the matching format below in this exact order. Do not skip any section. Write as much as the topic genuinely needs for each section.

#### FORMAT A — Concept / Theory

**1. Why This Exists — The Problem First**

Never open with a definition. Open with pain.

Tell a short story about what went wrong before this concept existed, or what breaks when a developer doesn't understand it. Make the reader feel the problem. Make them need the solution before you give it. Two to four sentences minimum — but write more if the backstory genuinely helps understanding.

**2. The Analogy — Make It Obvious**

Find one real-world analogy that maps directly to how the concept actually works. Not just something that sounds clever — something that genuinely mirrors the mechanic so well that once you see it, the technical explanation feels like it's just giving names to things you already understand.

Develop the analogy properly. Don't just name it — walk through it. Show how each part of the analogy maps to each part of the technical concept. If the concept has multiple moving parts, the analogy should have matching moving parts.

Good sources for analogies: restaurants, post offices, relay races, assembly lines, phone calls, libraries, traffic systems, construction crews, bank queues, hotel systems. Avoid analogies that are already technical.

**3. How It Actually Works — The Full Explanation**

Now explain the real mechanic. Build on the analogy — use it as scaffolding. Say things like "in our analogy, the waiter is the event loop — in JavaScript, the event loop does the same thing: it..."

Explain it in plain English first, then introduce the correct technical terms once the concept already makes sense. Never introduce jargon before the idea is established.

Go as deep as the topic requires. Cover:

- The core mechanic (what actually happens step by step)
- Why it works the way it does (not just what, but why)
- How the different pieces interact with each other
- What the JavaScript engine / browser / database / server is actually doing internally, in plain words

If there are multiple sub-concepts or related behaviors, explain each one clearly. Don't rush. Don't assume the reader already knows related things — briefly explain them if they're needed to understand the main topic.

**4. Real Code — See It Working**

Write real, runnable code that demonstrates the concept. The code should feel like something you'd actually write at work, not a toy example.

Add comments that explain the WHY of important lines — not "this declares a variable" but "we need a new promise here because each .then() must have its own promise to resolve independently."

If the concept has multiple behaviors or edge cases worth showing, write multiple small code examples — each one clearly labelled and focused on one thing. Don't cram everything into one confusing block.

**5. The Interview Questions — All of Them, Done Properly**

For each interview question this topic generates:

Write the question in bold. Then write a full, clear answer — not a one-liner, not a script to memorize. Explain it the way someone who genuinely understands it would explain it. If the question has nuance or common confusion around it, address that directly.

Cover every question the original content raised, plus any important questions it missed. These are the questions an interviewer will actually ask. Treat each one seriously.

Format:

**Q: [The question]**

Answer goes here. Full explanation. As long as it needs to be.

**6. The Traps — What Goes Wrong**

For each common mistake, misconception, or gotcha:

- Describe what the wrong assumption is
- Explain exactly why it's wrong
- Show what actually happens instead
- If helpful, show a code example of the mistake and the fix

Don't compress this into one sentence per trap. If a trap is subtle or surprising, explain it properly. These are the things that make the difference between a good answer and a perfect answer in an interview.

**7. Compare With Related Concepts**

This topic will always sit next to related concepts that people confuse it with. For each related concept:

- State the comparison clearly
- Explain the key difference in plain language
- Give a one-line rule for when to use which

**8. 🧠 The Memory Hook — What Sticks**

Write 1–3 sentences that capture the absolute core of this concept in a way that is impossible to forget. This is not a definition. It's the mental image, the key insight, the "aha" that makes everything click. If someone woke you up at 3am and asked you about this topic, this is what you'd say first.

On the page, use these markdown headings in this order:

```md
# <Topic Name>

## 1. Why This Exists — The Problem First

## 2. The Analogy — Make It Obvious

## 3. How It Actually Works — The Full Explanation

## 4. Real Code — See It Working

## 5. The Interview Questions — All of Them, Done Properly

## 6. The Traps — What Goes Wrong

## 7. Compare With Related Concepts

## 8. 🧠 The Memory Hook — What Sticks
```

#### FORMAT B — Coding Problem

**1. What the Interviewer Is Really Testing**

Don't just describe the problem. Say what underlying skill or pattern is being measured. "This looks like a string problem, but it's really testing whether you naturally reach for a hash map instead of nested loops when you need O(1) lookups."

**2. Think Before You Code — The Senior Dev Thought Process**

Walk through exactly how an experienced developer thinks when they first see this problem. Write it as a genuine thought process, not a list of steps:

- What's the naive/brute force approach and what's its complexity?
- Why is that not good enough?
- What pattern, data structure, or insight makes this solvable efficiently?
- How do you recognize that pattern from the problem description?
- What does the optimal approach look like at a high level before writing any code?

Write this in first person if it helps — "The first thing I notice is... My instinct is to reach for... but then I realize..."

This section is often more important than the code itself. It's what interviewers listen for.

**3. The Solution — Fully Explained Code**

Write the complete, correct, working solution.

Comments should explain the WHY of non-obvious decisions: why this data structure and not another, why this loop direction, why this condition, what this line prevents.

After the code, clearly state:

- Time complexity — and explain why in one sentence
- Space complexity — and explain why in one sentence

Use the repository's actual implementation and tests where they exist. Do not silently correct source behavior without explaining the correction.

**4. Dry Run — Walk Through a Real Example**

Take a concrete input and trace through the algorithm step by step. Show exactly what the variables, pointers, stack, or data structure look like at each meaningful step. Don't rush. Show every step that matters.

**5. Edge Cases — The Ones That Break Naive Solutions**

List every edge case worth mentioning in an interview. For each one, explain why it's a trap and what your solution does about it. Don't just list them — explain them.

**6. Variations and Follow-ups**

What does the interviewer ask next? "What if the array is sorted?" "What if there are duplicates?" "What if you had to do it in-place?" "What if the input is a stream?"

For each variation, give a real answer — how does the approach change? What's the new complexity?

**7. 🧠 The Memory Hook**

The pattern name, the key insight, or the mental trigger that makes this problem instantly recognizable next time you see one like it.

On the page, use these markdown headings in this order:

```md
# <Problem Name>

## 1. What the Interviewer Is Really Testing

## 2. Think Before You Code — The Senior Dev Thought Process

## 3. The Solution — Fully Explained Code

## 4. Dry Run — Walk Through a Real Example

## 5. Edge Cases — The Ones That Break Naive Solutions

## 6. Variations and Follow-ups

## 7. 🧠 The Memory Hook
```

#### FORMAT C — Output / Predict the Result

**1. The Code**

Reproduce the exact code cleanly formatted.

**2. The Answer**

State clearly what the output is — every log, in order, with exact values. If the answer surprises most people, say so.

**3. Execution — Walk Through It Like the JS Engine**

This is the most important section. Go through the code exactly as JavaScript executes it — in the real order, not the reading order.

Cover every phase that matters:

- The hoisting phase: what gets hoisted, what gets initialized, what stays uninitialized
- The synchronous execution phase: what runs, in what order, what values things hold at each moment
- The async scheduling phase: what gets pushed to the call stack, what goes to the Web API, what enters the microtask queue, what enters the macrotask queue, and in what order they resolve

Explain each step in plain, past-tense English. "JavaScript hoisted the function declaration to the top of the scope. It did not hoist the arrow function — that's a variable declared with const, so it stayed in the temporal dead zone. Then execution started at line 1..."

Don't skip steps. Don't assume the reader already knows the order. The goal is for them to be able to trace any code like this on their own after reading this explanation.

**4. The Concept This Question Tests**

Name the exact mechanism being tested: temporal dead zone, closure over loop variable, microtask vs macrotask queue order, `this` in arrow functions vs regular functions, prototype chain lookup, etc.

Then explain that concept properly — as if this output question is an excuse to teach the real concept deeply. This is where the real learning happens.

**5. The Trap — Why Most People Get It Wrong**

What false assumption does someone make when they get this wrong? What rule do they think applies that actually doesn't? Be specific. "Most people expect `var` to throw a ReferenceError like `let` does, but `var` is hoisted and initialized to `undefined`, so it returns undefined instead of crashing."

**6. 🧠 The Memory Hook**

The rule, in a form that's impossible to forget.

On the page, use these markdown headings in this order:

```md
# <Question Name>

## 1. The Code

## 2. The Answer

## 3. Execution — Walk Through It Like the JS Engine

## 4. The Concept This Question Tests

## 5. The Trap — Why Most People Get It Wrong

## 6. 🧠 The Memory Hook
```

#### FORMAT D — System Design

**1. Understand the Problem First — Clarify Before Designing**

Restate what's actually being asked. Strip out the vague words and get concrete:

- What is the system actually doing?
- What scale are we designing for? (Users, requests per second, data volume)
- What does "working correctly" actually mean here? (Consistency? Low latency? High availability?)
- What are the hard constraints? What can we sacrifice?

Explain which questions you'd ask the interviewer before drawing anything. This is a signal interviewers look for — great candidates clarify before designing.

**2. The Core Insight — The Decision Everything Else Flows From**

Every system design problem has one central tradeoff or architectural insight that determines the whole design. Find it and state it clearly.

"The core challenge of a URL shortener isn't storing URLs — that's trivial. It's generating short codes that are unique, unpredictable, and can be resolved in a single fast lookup at massive read scale. Everything in this design exists to solve those three things."

This is what separates a senior answer from a junior answer.

**3. High-Level Architecture — Components and Why Each Exists**

Walk through the major components of the system. Don't just list them — explain why each one is there. What problem does it solve? What breaks if you remove it?

Include a simple text diagram showing how data flows through the system:

```txt
Client → Load Balancer → API Servers → Cache Layer → Primary DB
                                    ↘ Message Queue → Background Workers → Object Storage
```

Then walk through a typical request end-to-end: where it enters, what touches it, how it gets processed, how the response comes back.

**4. Key Technical Decisions — With Real Tradeoffs**

For every major architectural choice, explain:

- What you chose
- What you considered and rejected
- Why you made this choice — specifically, what problem it solves and what you're giving up

Go through every meaningful decision: storage engine choice, caching strategy, consistency model, synchronous vs async processing, push vs pull, SQL vs NoSQL, monolith vs microservices where relevant.

Don't just say "I'd use Redis for caching." Say why Redis, why not Memcached, what you're caching, what the cache invalidation strategy is, and what happens when the cache misses.

**5. Deep Dives — The Parts That Actually Matter**

Every system design question has two or three components that are genuinely hard and that the interviewer wants to explore deeply. Identify them and go deep:

- The hardest algorithmic piece (e.g. generating unique short codes at scale without a bottleneck)
- The hardest consistency challenge (e.g. what happens if two servers process the same request simultaneously)
- The hardest scaling challenge (e.g. what breaks first at 100x traffic and how you fix it)

Go into real technical depth here. This is where you show you've actually thought through the hard parts.

**6. Failure Modes and Resilience**

What breaks first when this system is under stress? Walk through:

- The most likely failure points
- What happens to the user when each one fails
- How you detect the failure
- How you recover from it
- What you'd do to prevent it from being a single point of failure

**7. What Makes a Great Answer vs an Average One**

Explain what an interviewer is listening for in this specific system design question. What do junior candidates miss? What does a senior candidate say that a junior doesn't?

**8. 🧠 The Memory Hook**

The architectural pattern, the central tradeoff, or the core insight of this design in a form that's impossible to forget.

On the page, use these markdown headings in this order:

```md
# <System Name>

## 1. Understand the Problem First — Clarify Before Designing

## 2. The Core Insight — The Decision Everything Else Flows From

## 3. High-Level Architecture — Components and Why Each Exists

## 4. Key Technical Decisions — With Real Tradeoffs

## 5. Deep Dives — The Parts That Actually Matter

## 6. Failure Modes and Resilience

## 7. What Makes a Great Answer vs an Average One

## 8. 🧠 The Memory Hook
```

#### FORMAT E — Database / Backend Pattern

**1. The Real-World Problem — When You Actually Hit This**

Start with a production scenario. Not "imagine you have a database." More like: "Your app has been running fine for months. Then one day a user queries their order history and it takes 8 seconds. The query worked fine in development with 100 rows. Now you have 2 million rows. This is the exact moment you realize you needed an index."

Make it feel like something that actually happens at a real job. Because it does.

**2. The Analogy — Make the Mechanic Obvious**

Find a real-world analogy that maps precisely to how this database or backend concept works. Develop it properly — don't just name it.

**3. The Full Explanation — How It Actually Works**

Explain the mechanic completely. Cover:

- What it is in plain language
- Why it works the way it does internally
- The exact tradeoffs — what you gain, what you pay for it
- When to use it and when not to
- How it interacts with other parts of the system

Use the correct technical terms, but introduce them after the plain English explanation. Never the other way around.

Include the consistency, security, transaction, indexing, connection, error, and observability concerns relevant to that page rather than generic backend advice.

**4. See It In Practice — Real Code or Queries**

Write real examples using the correct language for the topic:

- SQL for relational database topics
- MongoDB query syntax for MongoDB topics
- JavaScript/TypeScript for Node.js patterns
- Python for FastAPI topics

The examples should feel like real production code, not toy examples. Comments explain the important decisions.

If there are multiple variants or common patterns worth showing, show them all with clear labels.

**5. Interview Questions — All of Them, Done Properly**

For each interview question this topic generates, write the question in bold, then write a genuine answer — not a one-liner.

**Q: [Question]**

Full answer here.

**6. The Traps — What Goes Wrong in Production**

Cover every common mistake, misconception, or performance pitfall. For each one: what the mistake is, why people make it, what actually happens as a result, and how to fix or avoid it.

**7. Compare With Related Concepts**

What does this concept get confused with? For each comparison, explain the real difference and give a rule for when to choose which.

**8. 🧠 The Memory Hook**

The core insight about this concept in a form that sticks forever.

On the page, use these markdown headings in this order:

```md
# <Pattern Name>

## 1. The Real-World Problem — When You Actually Hit This

## 2. The Analogy — Make the Mechanic Obvious

## 3. The Full Explanation — How It Actually Works

## 4. See It In Practice — Real Code or Queries

## 5. Interview Questions — All of Them, Done Properly

## 6. The Traps — What Goes Wrong in Production

## 7. Compare With Related Concepts

## 8. 🧠 The Memory Hook
```

### Rules that apply to all formats

These are non-negotiable regardless of topic type:

**Never open with a definition.** Always open with a problem, a story, or a question that makes the reader need the explanation.

**Use as many words as the topic needs.** The goal is permanent understanding. A complex topic with five moving parts needs five properly explained parts. Never compress at the expense of clarity.

**No "Engine Mechanism" sections.** This heading signals robotic, academic writing. Weave the mechanics naturally into the explanation.

**No "Senior Interview Playbook" scripts.** Scripts get forgotten. Understanding doesn't. Teach understanding.

**No nested sub-headers inside sub-headers.** Flat, clean structure only. Use the numbered `##` headings from the chosen format. Do not add `###` under them.

**No walls of bullet points.** If something needs three lines to explain properly, write three lines of prose. Bullets are for genuine lists — not for hiding incomplete explanations behind dashes.

**Analogies must be accurate, not just clever.** If the analogy breaks down at a key point, either fix it or don't use it. A misleading analogy is worse than no analogy.

**Code must be correct and runnable.** Test it mentally line by line before writing it. Wrong code destroys trust and causes confusion.

**Write in simple, easy-to-understand language.** This is mandatory, not a style preference. The explanation should sound like a senior engineer talking at a whiteboard, not like a textbook or a blog post. Short sentences. Everyday words. If a junior engineer can follow the mechanic on one read, the language is right. Depth comes from clear sequencing, not from fancy vocabulary.

**Plain English first, jargon second.** Name the idea in normal words, then give the technical term. Never the other way around. Do not stack undefined terms in one sentence.

**Tone throughout:** You are the smartest, most patient senior engineer the reader has ever met. You genuinely want them to understand this. You remember what it was like not to know it. You explain the thing you actually wish someone had explained to you. Casual, confident, deeply clear. Zero textbook energy. Zero corporate tone. No "it is worth noting that". No "in conclusion". No scripts to memorize.

**The 🧠 Memory Hook is mandatory for every topic.** It's not a definition. It's not a summary. It's the single image, rule, or insight that makes this topic permanently retrievable from memory.

### Tips for choosing depth

For theory topics with multiple sub-questions (like Promise chaining with 5 interview questions): treat each original sub-question as a proper interview question in the interview-questions section and answer each one fully.

For coding problem sets: one problem per page. Each gets a complete Format B treatment.

For output questions: one puzzle per page. Paste the code block and the original explanation together. Format C restructures it around the execution walkthrough.

For system design: one question per page. Scale depth to complexity — a URL shortener gets less depth than a distributed messaging system, but still uses every Format D section.

For database and backend pattern pages: Format E unless the page is clearly a concept (Format A) or an implementation (Format B).

If the topic is very long and complex: write a long, thorough page. That is correct. Do not try to shorten it.

## Ordered Rewrite Queue

The queue is ordered by prerequisite knowledge and review value. Within every row, process filenames alphabetically or by the dependency order discovered while reading; never process the whole row as one batch.

### Phase 1: JavaScript runtime foundations and output reasoning

Process `src/javascript/concepts/` one file at a time using the numbered list in the tracker. Do not open `output-questions-3.md` in this phase.

The focus is to replace the current generic engine prose with accurate runtime walkthroughs: bindings versus values, environments, stack frames, closure reachability, task queues, promise state, `this`, coercion, browser APIs, memory, and security. Examples must distinguish browser behavior from Node.js behavior when that affects the answer.

### Phase 2: React mental model, hooks, architecture, and scenarios

Process `src/react/concepts/` one file at a time, beginning with `what-is-react.md`, `jsx-and-compilation.md`, `react-elements-vs-components.md`, `component-based-architecture.md`, `props.md`, `state.md`, `one-way-data-flow.md`, `rendering-flow.md`, `reconciliation.md`, `keys-in-lists.md`, and the remaining rendering and hooks pages in dependency order. Then process the eight direct pages: `server-state.md`, `routing.md`, `forms.md`, `typescript-react.md`, `component-design.md`, `security-build-platform.md`, `senior-scenarios.md`, and `practical-questions.md`, one page per task.

Every React page must explain render snapshots, ownership, identity, effects as synchronization with external systems, and the exact reason a hook or memoization decision works. Avoid claims that depend on a version not stated in the page. Keep output questions and coding collections out of the single-topic pass unless their individual questions are explicitly decomposed into one-page tasks.

### Phase 3: Backend foundations and request behavior

Process these directories serially, one leaf page at a time:

| Directory | Pages | Emphasis |
|---|---:|---|
| `src/full-stack/backend/concepts/` | 39 | HTTP lifecycle, REST, middleware, validation, caching, pagination, rate limits, scaling, and request semantics |
| `src/full-stack/backend/api-design/` | 30 | API contracts, errors, idempotency, versioning, bulk operations, auth boundaries, and retries |
| `src/full-stack/backend/auth/` | 30 | Authentication, authorization, cookies, tokens, OAuth/OIDC, MFA, revocation, and privilege boundaries |
| `src/full-stack/backend/full-stack-integration/` | 20 | Frontend/backend contracts, stale requests, uploads, auth, cookies, WebSockets, and optimistic updates |
| `src/full-stack/backend/mern/` | 30 | End-to-end MERN behavior, route protection, uploads, pagination, real-time flows, and operations |

These pages are Type E unless the content genuinely asks for a coding implementation or system design. The opening story must describe the actual production failure—duplicate payment, stale search result, broken CORS request, leaked token, slow upload—not generic “backend correctness.”

### Phase 4: Databases, query reasoning, and ORM behavior

Process the database leaf directories one page at a time, in this order:

| Directory | Pages | Emphasis |
|---|---:|---|
| `src/full-stack/databases/sql/` | 40 | relational modeling, keys, normalization, indexes, transactions, isolation, deadlocks, replication, and query plans |
| `src/full-stack/databases/postgresql/` | 35 | PostgreSQL-specific indexes, MVCC, vacuum, JSONB, replication, locks, partitioning, and query tools |
| `src/full-stack/databases/mysql/` | 30 | InnoDB, locking, replication, charset/collation, indexes, JSON, and operational behavior |
| `src/full-stack/databases/mongodb/` | 35 | documents, BSON/ObjectId, embedding/reference decisions, aggregation, indexes, transactions, replica sets, and sharding |
| `src/full-stack/databases/sql-query-practice/` | 30 | one SQL problem per page with query choice, data shape, dry run, edge cases, and complexity |
| `src/full-stack/backend/mongoose/` | 30 | schemas, validation, indexes, population, transactions, query performance, and lifecycle hooks |
| `src/full-stack/backend/sqlalchemy/` | 30 | sessions, ORM/Core trade-offs, relationships, loading strategies, transactions, migrations, and N+1 behavior |

Database pages must not pretend all SQL dialects behave the same. Name the dialect, isolation level, index type, transaction boundary, or ORM loading strategy being discussed. Query-practice pages are Type B, while database concepts and patterns are Type E.

### Phase 5: Backend runtimes and implementation practice

Process these directories serially after the underlying request and database concepts are stable:

| Directory | Pages | Emphasis |
|---|---:|---|
| `src/full-stack/backend/nodejs/` | 30 | event loop, streams, worker threads, process behavior, errors, and production runtime choices |
| `src/full-stack/backend/express/` | 30 | middleware, routing, errors, auth, uploads, security, testing, and application structure |
| `src/full-stack/backend/fastapi/` | 50 | ASGI, dependencies, Pydantic, async/sync boundaries, sessions, auth, lifespan, testing, and transactions |
| `src/full-stack/backend/python/` | 30 | language/runtime foundations needed for senior backend interviews |
| `src/full-stack/backend/coding-practice/` | 30 | one implementation problem per page, with design choice, runnable code, tests, failure cases, and complexity |

Coding pages are Type B only when the reader is asked to implement something. Framework explanation pages remain Type E. A framework example must match the framework's actual lifecycle and must not use pseudocode that looks executable but cannot run.

### Phase 6: Reliability, performance, security, testing, and operations

Process one page at a time in this order:

| Directory | Pages | Emphasis |
|---|---:|---|
| `src/full-stack/backend/performance/` | 25 | latency budgets, caching, pagination, N+1, connection pools, event-loop blocking, and high-volume data |
| `src/full-stack/backend/queues/` | 20 | delivery semantics, retries, dead letters, ordering, backpressure, and idempotency |
| `src/full-stack/backend/redis/` | 20 | data structures, TTLs, locks, caching, streams, pub/sub, and persistence trade-offs |
| `src/full-stack/backend/websocket/` | 20 | connection lifecycle, authentication, rooms, fan-out, scaling, and reconnect behavior |
| `src/full-stack/backend/observability/` | 25 | logs, metrics, traces, alerts, correlation IDs, and debugging workflows |
| `src/full-stack/backend/security/` | 30 | XSS, CSRF, SSRF, injection, headers, secrets, abuse prevention, and safe error handling |
| `src/full-stack/backend/testing/` | 20 | unit, integration, contract, end-to-end, database, auth, background-job, and WebSocket tests |
| `src/full-stack/backend/deployment/` | 25 | containers, workers, reverse proxies, TLS, migrations, CI/CD, secrets, rollback, and zero downtime |

Performance and security pages must include the production failure that exposes the need for the pattern and explain the remaining risk after the mitigation. Testing pages must show what is isolated, what is real, and why a mock does or does not preserve the behavior under test.

### Phase 7: Senior scenarios and system design

Process `src/full-stack/backend/senior-scenarios/` one page at a time as Type E or Type D based on the page's actual request. Then process the 30 leaf pages in `src/full-stack/backend/system-design/` one at a time as Type D, beginning with the URL shortener, authentication, file upload, background job, notification, and payment designs before the larger feed, ride, multi-tenant, recommendation, and analytics designs.

Do not reuse one architecture paragraph across system designs. Each page must state its own assumptions, scale, hot path, consistency decision, failure mode, and trade-offs. The text diagram and deep dives must reflect that system rather than the generic `Clients -> API -> services -> database/cache/queue` template currently present in many pages.

## Cross-Page Consistency Rules

- A foundational page may explain a mechanism once; later pages should link back and apply it to their own problem instead of copying a generic explanation.
- When two pages overlap, keep both if their interview use is different, but state the boundary: for example, JavaScript closures versus React stale closures, HTTP idempotency versus database transactions, or Redis caching versus database caching.
- Preserve a stable vocabulary for request, response, state, identity, ownership, consistency, retry, cancellation, and failure. If a page uses a specialized term, define it in context.
- Do not claim “exactly once” when the implementation only provides at-least-once delivery plus deduplication or idempotency.
- Do not state a performance number without an assumption, measurement, or reasoned order-of-growth explanation.
- Treat browser, Node.js, Python, SQL, MongoDB, and framework behavior as environment-specific where it really is.
- The memory hook must be unique to the page. Reusing “bilingual interpreter,” “backpack,” or another analogy across unrelated pages weakens recall.

## Verification Gates

### Page gate

Before committing a page, confirm all of the following:

- The page opens with a concrete problem or production situation, not a definition.
- The detected type is correct and all required sections appear in the exact order.
- No forbidden heading, scripted interview answer, generic filler, or placeholder remains.
- The analogy maps to the actual mechanic and is not merely decorative.
- Every code/query block is either executed or clearly labeled with its real environment assumptions.
- Every output question has exact output and real execution order.
- Every coding page includes brute force, optimal reasoning, complexity, dry run, edge cases, and follow-ups.
- Every system-design page includes assumptions, diagram, request flow, decisions, deep dives, failures, and resilience.
- Every database/backend page includes production trade-offs, security/correctness boundaries, and interaction with surrounding systems.
- The final memory hook is present and memorable rather than a restated definition.
- `git diff --check -- <target>` passes.
- `mdbook build` passes.
- `git diff --name-only` shows only the target page as a source change.

### Track gate

After a complete directory is finished, run a read-only audit for that directory:

- Search for `Engine Mechanism`, `Senior Interview Playbook`, and the generic filler phrases found in the initial audit.
- Check all Markdown links from rewritten pages that point into the finished directory.
- Run `mdbook build` from a clean generated-output state.
- Review the directory's commits to verify one page per commit.

Track gates are audits, not permission to edit many pages together. If the audit finds a problem, fix it in a new single-page task.

### Final gate

After the leaf queue is complete, perform a separate wiring pass for indexes, `SUMMARY.md`, include-only chapters, source maps, and appendix audits. That pass may update navigation only where the serial page rewrites require it; it must not rewrite topic prose in bulk. Run the full mdBook build, link audit, forbidden-heading audit, `git diff --check`, and a final worktree review. Keep the existing `.DS_Store` untouched.

## Startable Tasks

These are the only tasks with named files. After Task 1, copy the same ten steps onto the next tracker row. Do not expand this section into 920 tasks.

### Task 0: Encode the Type A–E recipe

**Files:**
- Modify: `src/study-system.md`
- Modify: `docs/superpowers/plans/2026-08-25-one-topic-rewrite-tracker.md`

**Interfaces:**
- Consumes: the user's Type A–E prompt and the global constraints in this plan
- Produces: a study-system chapter that tells future page rewrites which headings to use, and a tracker with Task 0 marked rewritten

- [ ] **Step 1: Read `src/study-system.md` completely.**

- [ ] **Step 2: Replace the 12-section concept template** with Type A–E rules, the forbidden headings, the one-page-at-a-time rule, and the skip list for indexes and dumps. Do not rewrite any topic page in this task.

- [ ] **Step 3: Run `mdbook build` and `git diff --name-only`.** Only `src/study-system.md` (and the tracker if updated) should change.

- [ ] **Step 4: Commit** `docs: encode type A-E rewrite recipe in study system`

- [ ] **Step 5: Immediately start wave 1.** Do not wait for another user prompt unless they said `stop`.

### Task 1: Rewrite Memory Heap

**Files:**
- Modify: `src/javascript/concepts/memory-heap.md`
- Read: `src/javascript/concepts/execution-context.md` and `src/javascript/concepts/call-stack.md` only to avoid duplicating their full explanations

**Interfaces:**
- Consumes: the current Memory Heap page and neighboring JS runtime pages
- Produces: one Type A study page for the JavaScript memory heap

Expected classification: **Type A**. If the full read shows otherwise, classify from content and say so before writing.

- [ ] **Step 1: Confirm a clean page boundary** with `git status --short`.

- [ ] **Step 2: Read `src/javascript/concepts/memory-heap.md` completely.**

- [ ] **Step 3: Classify Type A–E from the content.**

- [ ] **Step 4: Rewrite only that file** using the Type A section order. Open with the production/runtime pain of not understanding heap vs stack. Do not add `Engine Mechanism` or interview scripts.

- [ ] **Step 5: Verify** section order, runnable examples, traps, comparison with stack/execution context, and `🧠 The Memory Hook`.

- [ ] **Step 6: Run** `git diff --check -- src/javascript/concepts/memory-heap.md` and `mdbook build`.

- [ ] **Step 7: Confirm** `git diff --name-only` shows only the intended files.

- [ ] **Step 8: Return the page for master review.** Do not edit the tracker or commit; the master reviews the page with the other wave results.

- [ ] **Step 9: Master marks the tracker row rewritten only after review.**

- [ ] **Step 10: Master commits this page independently and assigns more free pages.** Memory Heap may run in parallel with other Phase 1 files. Each still has its own worker.

### Task 2 onward

The master copies Task 1's worker contract onto the next free tracker rows, N at a time. Never give one worker two rows.

## How A Working Session Starts

Once the user approves this orchestrator model, the master:

1. Completes Task 0 (`src/study-system.md`) itself, because every worker depends on the shared recipe.
2. Claims the next wave from the tracker (target 8 files).
3. Dispatches one fresh subagent per file in a single parallel turn.
4. Reviews, tracks, commits, and loops until the leaf queue is empty.

The user may say `stop` to halt the loop. `rewrite <path>` still means one file, assigned to one worker. There is no “rewrite the folder” command.

## Completion Definition

This work is complete only when every page in the 921-page leaf queue has an individual rewrite commit and page-level verification evidence, the remaining aggregate/support pages have been reviewed for link integrity, and the final mdBook build succeeds. “The template was applied to all files” is not completion; the reader should be able to identify the real problem, mechanic, trade-off, trap, and memory hook for every page without encountering generic filler.
