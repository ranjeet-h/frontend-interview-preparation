# Study-Book Agent Playbook — v2 (Theory-First)

A reusable handbook for turning this repository into a high-quality mdBook interview guide when **most pages are theory, not code**. It supersedes the v1 code-only playbook, but keeps v1's machinery for the pages that really are code (Types B and C).

Read this whole file before dispatching any writer.

---

## 0. Why v2 — a self-review of the v1 recommendation

The first recommendation ("port the playbook's verification loop onto the existing Type A–E format") was directionally right but had real gaps. This file fixes them:

1. **Numbers were loose.** v1 said "~670 pages migrated" and "~267 backlog" without a reproducible method. v2 records measured counts and the exact command used to get them (Section 2). It also acknowledges a third category v1 ignored: **151 files that match neither the old nor a new format signature** (indexes, banks, dumps, variants).
2. **Retention was dismissed too hard.** v1 said "40 flashcards is bloat" and stopped there. Retrieval practice is the highest-value part of interview prep, so v2 defines a calibrated recall budget per type instead of deleting the idea.
3. **The theory oracle was underspecified.** "Claim ledger" means nothing without a source hierarchy and a rule for genuinely contested claims. v2 adds both (Section 6).
4. **Orchestration was missing.** v1 omitted batching, git ownership, and worktree scoping — the parts that caused most of the pain in the original run. v2 restores them (Section 10).
5. **No safeguard against content deletion.** v1's byte-preservation rule existed precisely to stop a writer from "simplifying" away hard material. Theory pages need an equivalent: a coverage list (Section 7).
6. **Unification, not replacement.** v1 implied v2 replaces v1. The correct framing: B/C keep the v1 code pipeline; A/D/E get the new theory pipeline; one orchestrator runs both (Section 5).
7. **Missing reviewer independence mechanics.** v1 said "independent review" without saying what makes it independent. v2 defines a fresh session with no access to the writer's reasoning (Section 9).
8. **No entry/exit criteria.** v2 states when a page may start and what "done" means, in gate order.

The single durable idea survives unchanged: **write → independent oracle → independent full-file review → fix → confirm → build**, one page at a time.

---

## 1. The two pipelines

This book needs two verification pipelines, chosen by page type.

- **Theory pipeline** — Types **A** (concept), **D** (system design), **E** (database/backend pattern).
  Ground truth is not executable. Verify with a **claim ledger** plus runnable repros where possible.
- **Code pipeline** — Types **B** (implementation) and **C** (predict output).
  Reuse v1: brute-force/Jest oracle for B, exact-execution diff for C.

Teaching format is unchanged either way: the **Canonical Type A–E Rewrite Spec** in
`docs/superpowers/plans/2026-08-25-sequential-study-note-rewrite.md` remains the authority for headings and section order. This playbook only governs how pages are verified, reviewed, retained, and shipped.

---

## 2. Current state (measured, not asserted)

The tracker and `REWRITE_PROGRESS.md` are optimistic. These counts come from grep over `src`:

| Metric | Count | How measured |
|---|---:|---|
| Markdown files under `src/` | 1,141 | `find src -name '*.md'` |
| Pages on the **old 12-section template** (`One-line mental model`) | 267 | `grep -rl 'One-line mental model' src` |
| Pages still containing forbidden headings (`Engine Mechanism` / `Senior Interview Playbook`) | 120 | `grep -rl 'Senior Interview Playbook' src` |
| Files matching **neither** old nor new signature | 151 | `comm -23` of file list vs signature greps |

Old-template backlog by directory (the real queue):

| Directory | Pages |
|---|---:|
| `src/full-stack/backend/security` | 30 |
| `src/full-stack/backend/coding-practice` | 30 |
| `src/full-stack/backend/auth` | 30 |
| `src/full-stack/backend/performance` | 25 |
| `src/full-stack/backend/observability` | 25 |
| `src/full-stack/backend/deployment` | 25 |
| `src/full-stack/backend/websocket` | 20 |
| `src/full-stack/backend/testing` | 20 |
| `src/full-stack/backend/redis` | 20 |
| `src/full-stack/backend/queues` | 20 |
| `src/full-stack/backend/full-stack-integration` | 20 |
| `src/appendix/rewrite-progress.md`, `src/javascript/concepts/index.md` | 2 |

Forbidden-heading concentration: security 30, auth 30, testing 20, performance 18, full-stack-integration 17, deployment 3, plus `src/study-system.md` and one appendix page.

**Do not start writing until Phase 0 re-audits these numbers.** This table is a snapshot, not a tracker.

### Pages that stay as-is on purpose

Do not rewrite into a single topic: `src/**/index.md`, `src/SUMMARY.md`, include-only wrappers, the output-question parent pages (`output-questions*.md`), `src/dsa/*.md` dumps, `src/react/practical-questions.md`, `src/react/coding-challenges.md`, root archives (`01-*.md`…`06-*.md`), `the-transformation-group.md`, `ops-tree-interview-qna.md`. Question-bank pages stay single files.

---

## 3. Non-negotiables

1. **One page per writer task.** Never let one worker touch two topic pages. Parallelism is many workers on many files, never one worker on many files.
2. **Classify before writing.** Exactly one of A/B/C/D/E. If filename and content disagree, classify by content and record why.
3. **Preserve coverage.** Every question, trap, comparison, and source-backed fact the old page contained must survive or be explicitly corrected in-page. Do not silently drop hard material.
4. **Never open with a definition.** Open with the production pain, failure, or interview situation.
5. **No forbidden headings, no scripts.** `Engine Mechanism`, `Senior Interview Playbook`, and verbal scripts are banned. So is generic filler.
6. **Flat structure.** Eight numbered `##` headings per type. No `###` nested under them.
7. **Code and queries run.** Every snippet is executed or labeled with its exact environment and version.
8. **Independent verification is mandatory.** Writer self-review does not count. A fresh reviewer session must read the whole page.
9. **Only the orchestrator runs `git` and `mdbook build`.** Writers, reviewers, and fixers never do.
10. **Never commit unapproved work.** Commit only intended files, one page per commit, and only after the user approves the batch.
11. **Scope git to your own paths.** This is a shared worktree with concurrent sessions and pre-existing changes (`.DS_Store`, `theme/`, `book.toml`, `docs/`). Never `git add -A`.

---

## 4. The per-page pipeline

```
orchestrator
  ├─ picks the next page and classifies it
  ├─ dispatches WRITER      ── writes the page, builds the claim ledger, self-checks
  ├─ runs verifier + gates   ── structural verifier, snippets, build, diff-check
  ├─ dispatches REVIEWER     ── fresh session, reads whole page + source of truth
  ├─ dispatches FIXER        ── applies findings minimally
  ├─ dispatches CONFIRMATION ── back to the reviewer's session: "all clear?"
  └─ commits (only on approval) and moves on
```

Batch size: **2 pages per writer wave** is a good default; 1 page for very large or high-risk pages (auth, security, system design). The orchestrator never rewrites a topic page itself except as a single retry after a worker failure.

---

## 5. Per-type oracle

The oracle is the independent source of truth. Pick by type.

| Type | Oracle | Reject when |
|---|---|---|
| **A Concept** | **Claim ledger** + runnable repro. Every non-obvious assertion, version behavior, or perf number traces to a source (Section 6) or runs. | Unsourced confident claims; examples that don't run; analogy that breaks at the mechanic |
| **B Coding** | Brute-force/Jest oracle over exhaustive small + thousands of random cases, plus a mutation check | Fails any case; complexity claim not matching the code |
| **C Output** | Execute the exact snippet in the stated environment; diff real output/order against the page | Any value or ordering mismatch |
| **D System design** | Numbers-with-assumptions check + failure-mode walk + no-template-reuse check | Scale figures with no basis; reused architecture paragraph; consistency claim contradicting CAP/PACELC |
| **E DB/backend** | Execute the query where runnable (`sqlite3 :memory:`, local Postgres, `mongosh`); otherwise verify against the engine's documented plan/locking/isolation semantics | Dialect/version not named; "all SQL behaves the same"; "exactly once" for at-least-once + dedup |

Type C is the one place a theory book gets a fully mechanical oracle; automate it in the verifier (Section 8).

---

## 6. The claim ledger (Types A/D/E)

The claim ledger is this playbook's replacement for the code oracle. It is a **temporary artifact**, not a committed page section.

For each page, extract every claim a reviewer could reasonably challenge:

- version- or environment-specific behavior (browser vs Node, React version, engine)
- performance, memory, or scale numbers
- security and correctness assertions
- "why" statements that are really causal claims (`X prevents Y`)
- framework/material nondeterminism

For each claim, record: the claim text, the source that supports it, and the repro command if one exists.

### Source hierarchy (use the highest available)

1. **Runnable proof** — the snippet, query, or repro actually executed in the stated environment.
2. **Normative spec** — ECMAScript, WHATWG/DOM, HTTP RFCs, SQL standard.
3. **Official project docs** — MDN, React docs, Node docs, PostgreSQL/MySQL/MongoDB docs, Mongoose/SQLAlchemy docs.
4. **The repository's own source or tests**, when the page documents repo behavior.
5. **Well-regarded secondary sources** — only acceptable when 1–4 are unavailable, and must be labeled as such.

### Contested or unverifiable claims

If a claim cannot be settled with 1–4, do one of:

- narrow it to what is actually provable ("in V8, …" / "per the WHATWG spec, …"), or
- mark it explicitly as an implementation detail that is not guaranteed, or
- remove it and keep the adjacent, provable point.

Never leave a confident general claim whose truth depends on a specific version, engine, or dialect but is written as universal.

---

## 7. Preservation rule for theory pages

v1 preserved code byte-for-byte. Theory pages need the equivalent guarantee against information loss.

Before rewriting, list the old page's **coverage items**: every question, trap, comparison, link, and source-backed fact. After rewriting, confirm each is either:

- still present (possibly reworded, moved into the correct A–E section), or
- deliberately corrected, with the correction explained in-page, or
- deliberately moved to a more appropriate page, with a link.

If the writer removes a coverage item for none of those reasons, the reviewer rejects the page. "It was redundant" is not a reason unless the same content exists and is linked.

This is why v1's byte-preservation existed: it stopped a rewriter from quietly flattening hard material. Keep the spirit.

---

## 8. Tooling

### 8.1 Structural verifier (`verify-theory-page.js`)

Detect the page type from its heading signature, then assert:

- required headings for that type are present **in order**
- no forbidden headings (`Engine Mechanism`, `Senior Interview Playbook`) and no verbal-script phrasing
- no `###` nested under the canonical `##` sections (count was already an issue: 8 pages in JS/React concepts still have nested headings)
- code fences balanced; every fenced JS/TS block parses
- every mermaid block parses; labels containing `[ ] ( )` are quoted
- `🧠 The Memory Hook` present
- internal links (`](target.md)`) resolve relative to the file
- no trailing whitespace; a blank line precedes every `---`
- **Type C only:** extract code plus expected output and execute/compare

Heading signatures live in Appendix A.

### 8.2 Companion auditors

- **Numbering audit** (only for numbered sections such as the output-question parts): filename number vs `# NN` title vs `SUMMARY.md` label — report gaps, duplicates, mismatches.
- **Link checker**: resolve every `](target.md)` across `src` and assert existence.
- **Mermaid validator**: parse every fenced mermaid block with the repo's own mermaid package under `jsdom`; quote special characters in labels.
- **Forbidden-heading sweep**: `grep -rl` for the banned headings; drives the Phase 0 queue.

### 8.3 Snippet execution

- JavaScript/TypeScript: run under the exact stated runtime; for browser-only APIs, state the environment and show the closest runnable proof.
- SQL: `sqlite3 :memory:` for dialect-neutral examples; label PostgreSQL/MySQL-specific syntax and verify syntax against that dialect.
- MongoDB: `mongosh` syntax check or a local example.
- React: verify against the repo's stated React version; keep examples internally consistent instead of inventing APIs.

---

## 9. Reviewer, fixer, and confirmation

**Reviewer (fresh session).** Reads the entire page and the source of truth. Reports concrete problems only: wrong values, a trace that contradicts the page's own example, code claims that don't match behavior, contradictions, unsupported or incorrect recall questions, wrong complexity, broken markdown. For each: file, line, exact text, why it's wrong. Does not edit files or run git.

**Independence requirement.** The reviewer session must not see the writer's reasoning, draft notes, or claim ledger. It re-derives from the page and the source. Handing the writer's justification to the reviewer defeats the point.

**Fixer.** Applies findings precisely and minimally; re-verifies numbers against the executable source; re-runs the verifier and `git diff --check`; re-reads the changed region. Does not touch other files, git, or the build.

**Confirmation.** Returns to the reviewer session: re-read the fixed regions and report only remaining issues or "all clear". Does not modify files.

---

## 10. Orchestration, batching, and git

- The orchestrator owns the queue, the tracker, `git`, and `mdbook build`.
- Claim the next N queued pages, dispatch N writers in one turn, review as a wave, mark the tracker, commit accepted pages **one page per commit**, then immediately start the next wave.
- Use `git diff --name-only` after each wave to confirm only intended files changed. Reject a page if unrelated files moved.
- Because the worktree is shared: never stage `book/`, `.DS_Store`, `theme/`, `book.toml`, or other sessions' files. Stage explicit paths only.
- Coordinate the tracker with the measured queue from Section 2. Do not trust prior "complete" marks; a page is only `rewritten` after review and a target-only commit.

---

## 11. Verification gates (run in order)

```bash
# 1. structural verifier
node tools/verify-theory-page.js <page.md>

# 2. execute snippets (B/C always; E where runnable)
#    JS/TS parse + run, sqlite3 :memory:, mongosh, node --check

# 3. claim ledger review (A/D/E non-runnable claims sourced)

# 4. whitespace / conflict
git diff --check -- <page.md>

# 5. build
mdbook build

# 6. independent full-file read → fix → confirm
```

A green build does **not** prove a page is correct or studyable. The claim ledger and the independent read are load-bearing.

---

## 12. Retention layer (calibrated, not 40 cards)

Teaching is not recall. Add a consistent, light retrieval layer to every **newly rewritten or re-verified** page:

1. **Memory Hook** — already mandatory.
2. **"Say it in 60 seconds"** — a labeled block built from the Section 5 interview answers, for live rehearsal.
3. **Closed-book recall** — one hidden `<details><summary>Answers</summary>` with the type-appropriate budget:

| Type | Recall questions |
|---|---|
| A Concept | 4–6 |
| B Coding | 3–4 (pattern, complexity, first step) |
| C Output | 2–3 (rule + near-miss variant) |
| D System design | 5–7 (assumptions, core insight, failure, tradeoff) |
| E DB/backend | 4–6 (mechanic, tradeoff, production failure) |

4. **Spaced revision prompts** (Day 1/3/7/14) at section level, not per page.
5. **Memory-hook index** — a generated page listing every page's hook, so revision is driven from one place.

Do not generate 40 cards per page: across ~600 pages that is unmanageable and unused. Calibrated recall beats volume.

---

## 13. Free password gate (Vercel Edge Middleware + Basic Auth)

The book is private and hosted free on Vercel Hobby. Vercel's built-in **Password Protection is a Pro feature**. The free equivalent is a tiny **Edge Middleware** doing HTTP Basic Auth.

### 13.1 This repo's deploy layout (important)

- The mdBook root **is the repository root**: `book.toml` sits at the root, `src = "src"`, HTML output goes to `book/`.
- There is **no `package.json`** and no framework. On Vercel: Framework Preset = **Other**, Root Directory = **repo root**, Build Command `mdbook build`, Output Directory `book`, Install Command `cargo install mdbook --version 0.4.52 --locked` (pinned to match the local `mdbook v0.4.52`).
- Therefore the middleware file goes at the **repo root**: `middleware.js`.

Because the middleware uses only Web-standard APIs, it needs no dependencies and no `package.json`.

### 13.2 The file — `middleware.js` (repo root)

```js
export const config = { matcher: "/(.*)" };

const REALM = 'Basic realm="Study Book"';

export default function middleware(request) {
  const pass = process.env.SITE_PASSWORD;
  const user = process.env.SITE_USER || "viewer";
  const header = request.headers.get("authorization") || "";
  let ok = false;

  if (pass && header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      const u = i === -1 ? "" : decoded.slice(0, i);
      const p = i === -1 ? "" : decoded.slice(i + 1);
      ok = i !== -1 && timingSafeEqual(u, user) && timingSafeEqual(p, pass);
    } catch {
      ok = false;
    }
  }

  if (ok) return new Response(null, { headers: { "x-middleware-next": "1" } });

  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

// Compare without leaking length or prefix through timing.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

The Edge runtime prints a deprecation warning; it is cosmetic. To move to the Node runtime later, use `export const config = { matcher: "/(.*)", runtime: "nodejs" }`.

### 13.3 Environment variables

Project → Settings → Environment Variables:

- `SITE_USER` = e.g. `viewer`
- `SITE_PASSWORD` = a strong, unique password

Apply to **Production, Preview, and Development**. Env changes take effect only after a **redeploy**.

### 13.4 Deploy and verify

```bash
git push origin master
# or
vercel redeploy <deployment-url> --target production
```

Verify on **production** (not a preview):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<your-site>                         # expect 401
curl -s -o /dev/null -w '%{http_code}\n' -u viewer:<password> https://<your-site>    # expect 200
curl -sI https://<your-site> | grep -i 'www-authenticate'                            # expect Basic realm=...
```

### 13.5 Pitfalls (learned the hard way)

- **Preview deployments are behind Vercel SSO** by default, so every request 302s to `vercel.com/sso-api`. Test the gate on production, not a preview.
- **Do not add a root `.vercelignore`** unless you mean it: Vercel matches patterns **case-insensitively**, so a pattern like `Easy` strips `src/easy` from the build and produces empty pages. Git deploys already exclude `node_modules`/`.git`, and the built output is gitignored.
- **Pin the mdBook install** (`cargo install mdbook --version 0.4.52 --locked`); an unpinned dependency can break the build overnight.
- **zsh does not word-split unquoted variables.** `A="-u u:p"; curl $A URL` sends no auth. Pass credentials explicitly.
- **Gitignore `.vercel/`** (written by `vercel link`); commit `middleware.js`. Nothing else in this playbook may be auto-staged (`git add -A` is banned).
- The gate protects the **whole site, including static assets** — that is intended. There is no per-page gate.
- **Basic Auth base64 is not encryption.** Serve over HTTPS only.
- This is a **deterrent, not real authentication**: anyone with the password gets the whole book. Rotate the password if it leaks, and do not reuse it elsewhere.
- Browser credential caching after a successful challenge is expected; there is no reliable server-side logout for Basic Auth.

### 13.6 Where it fits

The gate is independent of page content and can be landed as a small standalone task at any time (naturally Phase 0 or Phase 5). It is **not** a substitute for the page pipeline; it only controls access.

## 14. Rollout phases

**Phase 0 — Freeze, audit, tool.**
- Re-audit and write the exact old-template page list to the tracker, replacing optimistic counts.
- Land `tools/verify-theory-page.js`, the link checker, the numbering audit, and the mermaid validator.
- Update `src/study-system.md` to point at this v2 playbook.
- Exit: the tracker matches grep reality, and the verifier runs on one known-old and one known-new page correctly.

**Phase 1 — Highest interview value.**
- `auth/` (30) and `security/` (30). These are the most asked and currently the most outdated; many still carry forbidden scripted answers.
- Exit: 60 pages through the full pipeline, reviewed and confirmed.

**Phase 2 — Reliability and data.**
- `performance/` (25), `observability/` (25), `queues/` (20), `redis/` (20), `websocket/` (20), `testing/` (20), `deployment/` (25), `full-stack-integration/` (20).

**Phase 3 — Implementation practice.**
- `coding-practice/` (30) — these are Type B, so they use the v1 code pipeline (Jest + brute-force oracle), not the claim ledger.

**Phase 4 — Finish the code queue.**
- Remaining output questions and polyfills via the v1 pipeline; DSA pages via Type B.

**Phase 5 — Sweep and retention build.**
- Forbidden-heading sweep, link check, numbering audit, nested-`###` cleanup, memory-hook index.
- Final worktree review; nothing committed without approval.

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Vacuous gates — code checks "pass" theory pages without verifying anything | Use the per-type oracle; a page with no runnable claim needs a claim ledger, not a Jest run |
| Tracker drift | Re-audit with grep each phase; treat tracker numbers as claims to verify |
| Content loss during rewrite | Coverage list + reviewer rejection rule (Section 7) |
| Misleading analogy | Reviewer tests the analogy against the mechanic; a wrong analogy is worse than none |
| Template saturation / reused imagery | Enforce unique memory hooks and distinct opening shapes per page |
| Confident version-specific claims written as universal | Source hierarchy + narrow-or-remove rule (Section 6) |
| Shared worktree corruption | Explicit-path staging; never `git add -A`; orchestrator-only git |
| Writer/reviewer collusion | Reviewer is a fresh session with no access to the writer's reasoning |
| Volume over depth | A page is done when it survives an independent read, not when it has the headings |

---

## 16. Definition of done

- [ ] Every target page classified A–E; required headings present in order; no forbidden headings; no nested `###`.
- [ ] Per-type oracle passed: claim ledger sourced (A/D/E), executed (B/C), or dialect-correct (E).
- [ ] Coverage list reconciled: nothing correct was silently dropped; corrections explained in-page.
- [ ] Independent reviewer read every page; findings fixed and confirmed.
- [ ] `verify-theory-page.js`, link checker, numbering audit, mermaid validator clean.
- [ ] `mdbook build` green; `git diff --check` clean; only intended files changed.
- [ ] Retention layer present; memory-hook index built.
- [ ] Tracker and `README`/landing page match measured counts.
- [ ] Password gate deployed and verified on production (401 without, 200 with) — see Section 13.
- [ ] Nothing committed without user approval.

---

## Appendix A — Type heading signatures (for the verifier)

- **A Concept:** starts with `## 1. Why This Exists — The Problem First`, ends with `## 8. 🧠 The Memory Hook`
- **B Coding:** starts with `## 1. What the Interviewer Is Really Testing`, ends with `## 7. 🧠 The Memory Hook`
- **C Output:** starts with `## 1. The Code`, ends with `## 6. 🧠 The Memory Hook`
- **D System design:** starts with `## 1. Understand the Problem First — Clarify Before Designing`, ends with `## 8. 🧠 The Memory Hook`
- **E DB/backend:** starts with `## 1. The Real-World Problem — When You Actually Hit This`, ends with `## 8. 🧠 The Memory Hook`

Canonical section text and order live in
`docs/superpowers/plans/2026-08-25-sequential-study-note-rewrite.md` → **Canonical Type A–E Rewrite Spec**. If that file changes, update this appendix.

## Appendix B — What changed from the v1 recommendation

1. Added measured counts and the commands behind them; named the 151-signature-less files.
2. Added a calibrated retention layer instead of dismissing flashcards.
3. Replaced the vague "claim ledger" with a source hierarchy and a contested-claim rule.
4. Restored orchestration, batching, git ownership, and worktree scoping.
5. Added the coverage-preservation rule that replaces v1's byte-preservation.
6. Reframed v2 as a unification of two pipelines, not a replacement of v1.
7. Defined reviewer independence as a fresh session with no writer context.
8. Added explicit entry/exit criteria and phased rollout with per-phase exits.
9. Corrected the queue: `coding-practice/` is Type B and does **not** use the claim ledger.
10. Made number audits conditional on numbered sections.
11. Added the free Vercel password gate (Section 13), adapted to this repo (mdBook root = repo root, `middleware.js` at root, no `package.json`) instead of v1's `mdbook/` subdirectory assumption.
12. Corrected the build command: this repo has no `package.json`, so the gate is `mdbook build`, not `npm run mdbook:build`.
