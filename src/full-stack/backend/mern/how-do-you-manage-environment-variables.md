# How do you manage environment variables

## Detailed explanation

How do you manage environment variables is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Make frontend and backend agree on auth, data contracts, errors, retries, and state.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define frontend-backend contract.
- Handle auth, cookies/tokens, CORS, and errors.
- Prevent duplicate or stale requests.
- Map backend validation to frontend UX.
- Keep contracts versioned and testable.

## 4. Visual / analogy

```txt
React UI -> API client -> backend endpoint -> response/error contract -> UI state
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply MERN backend rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you manage environment variables affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you manage environment variables in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** Backend: use `dotenv` for local development, platform env vars for production (Railway, Render, Heroku). Validate all required vars at startup with Zod: `const env = z.object({ MONGO_URI: z.string(), JWT_SECRET: z.string(), PORT: z.string().default('5000') }).parse(process.env);`. Frontend: use Vite's env var system — `VITE_API_URL` is exposed to the client, non-prefixed vars are server-only. Access via `import.meta.env.VITE_API_URL`. Never commit .env files — add to .gitignore. Use .env.example with placeholder values for documentation. For shared config between frontend and backend, use a config endpoint.
- **The Unforgettable Mental Model:** The **Two Vaults**. Backend vault (server-side) holds sensitive secrets (DB URL, JWT secret). Frontend vault (client-side) holds public config (API URL). The backend vault is locked tight; the frontend vault is visible to anyone who visits.
- **The Trap:** Prefixing backend-only vars with VITE_ — they get bundled into the frontend build and exposed to the browser. Only prefix vars with VITE_ if they're safe to expose.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I manage env vars separately for frontend and backend. Backend uses dotenv for local dev and platform env vars for production, validated with Zod at startup. Frontend uses Vite's VITE_ prefix system — only prefixed vars are exposed to the client. I never commit .env files and use .env.example for documentation. For shared config, I create a /api/config endpoint. The key rule: never prefix sensitive backend vars with VITE_ — they'll be exposed in the frontend bundle."

#### What's the difference between frontend and backend environment variables?
- **The Engine Mechanism (Why it behaves this way):** Backend env vars are server-side only — they're never sent to the browser. They include secrets (JWT_SECRET, DB_URL), ports, and internal configuration. Frontend env vars are baked into the JavaScript bundle at build time and are visible to anyone who inspects the source code. Vite only exposes vars prefixed with `VITE_` to the client. Backend vars are read at runtime (changeable without rebuild). Frontend vars are read at build time (require rebuild to change). Never put secrets in frontend env vars.
- **The Unforgettable Mental Model:** The **Public Sign vs. the Private Notebook**. Frontend env vars are like a public sign — anyone can read them. Backend env vars are like a private notebook — only the server can read them. Never write secrets on the public sign.
- **The Trap:** Putting API keys or secrets in frontend env vars — they're visible in the browser's source code. Only put public config (API URLs, feature flags) in frontend env vars.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Backend env vars are server-side only — they include secrets and internal config. Frontend env vars are baked into the bundle and visible to anyone. Vite only exposes VITE_-prefixed vars to the client. Backend vars are read at runtime; frontend vars at build time. I never put secrets in frontend env vars. For sensitive config that the frontend needs, I create a /api/config endpoint that the backend controls."

#### How do you handle environment-specific configuration?
- **The Engine Mechanism (Why it behaves this way):** Use separate .env files per environment: `.env.development`, `.env.staging`, `.env.production`. Vite automatically loads the correct file based on `NODE_ENV`. For backend, use `dotenv` with explicit file: `dotenv.config({ path: `.env.${process.env.NODE_ENV}` })`. Platform-specific vars are set in the deployment dashboard (Railway, Vercel). Use a config validation file that defines expected vars per environment: `const devSchema = z.object({ MONGO_URI: z.string() }); const prodSchema = devSchema.extend({ JWT_SECRET: z.string(), REDIS_URL: z.string() });`. This catches missing vars before deployment.
- **The Unforgettable Mental Model:** The **Outfit Change**. Development wears casual clothes (local DB, debug mode). Staging wears business casual (staging DB, limited logging). Production wears a suit (production DB, minimal logging, all security). Same person, different outfit for the occasion.
- **The Trap:** Using the same .env file for all environments — production might accidentally use development settings (local DB URL, debug mode enabled).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use environment-specific .env files — .env.development, .env.staging, .env.production. Vite loads the correct file automatically. For backend, I load the file based on NODE_ENV. Platform-specific vars are set in the deployment dashboard. I validate env vars with Zod schemas that differ per environment — production requires more vars (JWT_SECRET, REDIS_URL) than development. This catches missing vars before deployment."

#### How do you handle secrets rotation?
- **The Engine Mechanism (Why it behaves this way):** For JWT secret rotation: (1) Generate a new secret. (2) Add it as JWT_SECRET_NEW alongside JWT_SECRET. (3) Verify tokens with both secrets: `try { decoded = jwt.verify(token, process.env.JWT_SECRET); } catch { decoded = jwt.verify(token, process.env.JWT_SECRET_NEW); }`. (4) Issue new tokens with the new secret. (5) After all old tokens expire, remove JWT_SECRET. For database password rotation: (1) Add new password to MongoDB user. (2) Update MONGO_URI with new password. (3) Restart backend. Use a secrets manager (AWS Secrets Manager, HashiCorp Vault) for automated rotation.
- **The Unforgettable Mental Model:** The **Lock Change**. You install a new lock (new secret) while keeping the old lock working. Everyone gets a new key (new token). After everyone has the new key, you remove the old lock.
- **The Trap:** Rotating secrets without a transition period — all existing tokens become invalid immediately, logging out all users. Always support both old and new secrets during transition.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For JWT secret rotation, I support both old and new secrets during a transition period. I verify tokens with both secrets and issue new tokens with the new secret. After all old tokens expire, I remove the old secret. For database passwords, I add the new password to the database user, update the connection string, and restart. I use secrets managers for automated rotation. The key principle: never rotate secrets without a transition period — always support both old and new simultaneously."

#### How do you prevent secrets from leaking into version control?
- **The Engine Mechanism (Why it behaves this way):** (1) **.gitignore** — add `.env`, `.env.*`, `*.key`, `*.pem` to .gitignore. (2) **Pre-commit hooks** — use `husky` + `lint-staged` to scan for secrets before committing. (3) **Secret scanning** — enable GitHub Secret Scanning or use `gitleaks` in CI. (4) **.env.example** — provide a template with placeholder values for documentation. (5) **Never log secrets** — sanitize logs to remove sensitive values. (6) **Audit Git history** — if a secret was committed, rotate it immediately and use `git filter-branch` or BFG to remove it from history. (7) **Use platform secret management** — never store secrets in code.
- **The Unforgettable Mental Model:** The **Security Checklist**. Before committing, check: is .env in .gitignore? Are there any hardcoded secrets? Did the pre-commit hook pass? Has secret scanning run? Each check is a layer of protection.
- **The Trap:** Committing a secret and then deleting it in the next commit — the secret is still in Git history. Rotate the secret immediately and clean the history.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent secret leaks with multiple layers: .gitignore for .env files, pre-commit hooks with secret scanning, GitHub Secret Scanning in CI, and .env.example templates. If a secret is accidentally committed, I rotate it immediately and clean the Git history. I never store secrets in code — always use environment variables or a secrets manager. The key is defense in depth — no single measure is sufficient."

## 8. Active recall test

1. **How do you validate environment variables at startup?**
   - **Explanation:** Use Zod to define the expected shape and types. Parse process.env at startup. The app fails fast if required vars are missing or invalid.

2. **What's the VITE_ prefix for?**
   - **Explanation:** Vite only exposes env vars prefixed with VITE_ to the client bundle. Non-prefixed vars are server-only. Never prefix sensitive vars with VITE_.

3. **How do you handle environment-specific configuration?**
   - **Explanation:** Use separate .env files per environment (.env.development, .env.production). Vite loads the correct file automatically. Platform vars are set in the deployment dashboard.

4. **How do you rotate JWT secrets?**
   - **Explanation:** Support both old and new secrets during transition. Verify tokens with both, issue new tokens with the new secret. After old tokens expire, remove the old secret.

5. **How do you prevent secrets from leaking into Git?**
   - **Explanation:** .gitignore for .env files, pre-commit hooks with secret scanning, GitHub Secret Scanning in CI, .env.example templates. If leaked, rotate immediately and clean history.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you manage environment variables in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you manage environment variables in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
