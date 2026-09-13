# How do you manage environment variables

## 1. Why This Exists — The Problem First

A new developer clones the repo, runs `npm start`, and the app boots fine — then crashes on the first database call because `DATABASE_URL` was never set. Or worse: someone commits `.env` to git with production API keys, a bot scrapes the repo within hours, and you're rotating credentials across five services on a Friday night.

Hardcoded configuration means every environment change requires a code deploy. Missing validation means the app starts in a broken state and fails twenty minutes later with a cryptic connection error. Environment variables exist to separate *what the app does* from *where it runs* — but only if you load, validate, and protect them deliberately.

## 2. The Analogy — Make It Obvious

A touring band plays the same setlist every night, but the venue changes — different city, different sound system, different stage size.

The setlist is the code (same everywhere). The venue tech sheet is the environment config: which PA system (database URL), what monitor mix (log level), whether pyrotechnics are allowed (feature flags). The band doesn't rewrite songs for each city — they read the tech sheet before soundcheck.

If someone forgets to specify "no pyro" and the venue is a small club, things catch fire. If the tech sheet lists the wrong PA input, the show doesn't start. That's why you check the sheet *before* doors open (startup validation), never tape the keys to the outside of the tour bus (don't commit secrets to git), and keep the pyro permit in a locked case (secret manager for production credentials).

## 3. How It Actually Works — The Full Explanation

Environment variables are key-value strings injected into the process environment, accessed in Node.js via `process.env`:

```javascript
process.env.DATABASE_URL  // always a string, or undefined
```

They follow the **twelve-factor app** principle: store config in the environment, not in code. Same Docker image or build artifact runs in dev, staging, and production — only the env vars change.

**Where they come from:**

| Environment | Source |
|---|---|
| Local development | `.env` file loaded by `dotenv` |
| CI/CD | Pipeline secrets (GitHub Actions secrets, GitLab CI variables) |
| Production containers | Kubernetes ConfigMaps + Secrets, ECS task definitions, Docker `-e` flags |
| Production VMs | systemd `EnvironmentFile`, PM2 ecosystem config |
| Sensitive secrets | AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager |

**The production pattern:**

1. Load env vars early (before any other imports that depend on config)
2. Validate all required vars at startup — fail fast with a clear message
3. Parse strings to typed values (numbers, booleans, JSON)
4. Export a single config object — the rest of the app imports config, never `process.env` directly
5. Never commit `.env` — commit `.env.example` with dummy values as documentation

**Critical properties:**

- **Always strings** — `process.env.PORT` is `'3000'`, not `3000`. Parse explicitly.
- **Case-sensitive** — `process.env.port` ≠ `process.env.PORT`
- **Undefined if missing** — no error until you access and use it; validate early
- **Inherited by child processes** — cluster workers inherit parent's env
- **Overridden by deployment platform** — K8s secrets override `.env` file values

**Secrets vs configuration:**

- Configuration (port, log level, feature flags) — plain env vars are fine
- Secrets (DB passwords, API keys, JWT signing keys) — use a secret manager in production; inject at runtime, never log, never commit

## 4. Real Code — See It Working

**Validated config module — the pattern every service should use**

```javascript
// config.js — loaded first, before anything else
require('dotenv').config(); // dev only; production injects env directly

const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ENABLE_FEATURE_X: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1); // fail fast — don't start half-configured
  }

  return result.data; // typed: { PORT: number, ENABLE_FEATURE_X: boolean, ... }
}

module.exports = loadConfig();
```

**Usage in the rest of the app**

```javascript
// server.js
const config = require('./config'); // crashes at import if env is invalid
const express = require('express');

const app = express();
app.listen(config.PORT, () => {
  console.log(`Listening on :${config.PORT} (${config.NODE_ENV})`);
});
```

**`.env.example` — committed to git as documentation**

```bash
# .env.example — copy to .env and fill in values
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://user:pass@localhost:5432/myapp
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-to-at-least-32-characters-long
LOG_LEVEL=debug
ENABLE_FEATURE_X=false
```

**`.gitignore`**

```
.env
.env.local
.env.*.local
```

**Loading secrets from AWS Secrets Manager in production**

```javascript
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function loadSecrets() {
  if (process.env.NODE_ENV !== 'production') return;

  const client = new SecretsManagerClient({ region: 'us-east-1' });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: 'myapp/production' })
  );
  const secrets = JSON.parse(response.SecretString);

  // Inject into process.env before config validation
  Object.assign(process.env, secrets);
}

// bootstrap.js
async function bootstrap() {
  await loadSecrets();
  const config = require('./config');
  require('./server')(config);
}
bootstrap();
```

**Kubernetes deployment — env from ConfigMap and Secret**

```yaml
env:
  - name: PORT
    value: "3000"
  - name: NODE_ENV
    value: "production"
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: myapp-secrets
        key: database-url
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you manage environment variables in Node.js?**

Access via `process.env`. Load from `.env` in development with `dotenv`. Validate all required variables at startup with a schema (Zod, envalid, joi). Export a typed config object. In production, inject via the deployment platform or a secret manager. Never commit `.env` files.

**Q: Why validate at startup instead of when the variable is first used?**

Fail fast with a clear error: "Missing DATABASE_URL" at boot is debugged in seconds. A missing variable discovered on the first database call in production — twenty minutes after deploy — is a incident. The app should refuse to start if config is incomplete.

**Q: Why are environment variables always strings?**

The OS environment is a string map. `process.env.PORT` returns `'3000'`, not the number 3000. `'false'` is truthy in JavaScript. Parse explicitly: `parseInt()`, boolean comparison, `JSON.parse()` for objects.

**Q: How do you handle secrets in production?**

Never in git. Use AWS Secrets Manager, Vault, or Kubernetes Secrets. Inject at container startup. Rotate without code changes. Ensure secrets never appear in logs, error messages, or APM traces.

**Q: What's the difference between dotenv and production env injection?**

`dotenv` reads a `.env` file from disk — convenient for local dev. Production platforms inject env vars directly into the process environment — no file on disk. Many teams use `dotenv` only when `NODE_ENV !== 'production'`.

**Q: How do environment variables affect frontend clients?**

Backend env vars configure API behavior (CORS origins, rate limits, feature flags). Frontend apps use build-time injection (`VITE_API_URL`, `NEXT_PUBLIC_API_URL`) — baked into the JS bundle at build time. For runtime config without rebuilds, expose a `/api/config` endpoint that returns safe, non-secret config.

## 6. The Traps — What Goes Wrong

**Committing `.env` to git.** Secrets leak permanently — git history keeps them even after deletion. Use `git-secrets` or `trufflehog` in CI to scan.

**No startup validation.**

```javascript
const db = new Pool({ connectionString: process.env.DATABASE_URL });
// undefined URL → cryptic error on first query, not at boot
```

**Truthy check on booleans.**

```javascript
if (process.env.ENABLE_CACHE) { ... }
// ENABLE_CACHE='false' is truthy — cache is enabled when you wanted it off
```

Fix: `process.env.ENABLE_CACHE === 'true'`

**Scattered `process.env` access.** Fifty files reading `process.env` directly — impossible to know what's required. Centralize in one config module.

**Logging config at startup.**

```javascript
console.log('Config:', config); // may include JWT_SECRET
```

Log only non-sensitive values.

**Whitespace in `.env` files.**

```bash
DATABASE_URL= postgres://...  # leading space becomes part of the value
```

**Default fallbacks for required secrets.**

```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
// ships to production with a known default if env var is missing
```

Fail if required secrets are missing — don't silently default.

**Build-time vs runtime confusion for frontend.** `REACT_APP_API_URL` is embedded at build time. Changing the env var in production without rebuilding does nothing. Use runtime config endpoint if you need to change URLs without rebuild.

## 7. Compare With Related Concepts

**Environment variables vs config files (JSON/YAML).** Env vars are standard for twelve-factor apps and container platforms. Config files work for complex nested config but don't integrate as cleanly with K8s/Docker secret injection. Rule: env vars for service config; config files for complex static rules checked into git.

**dotenv vs envalid/zod validation.** `dotenv` only loads — no validation. Pair it with a schema validator. Libraries like `envalid` combine loading and validation.

**Environment variables vs secret managers.** Env vars are the delivery mechanism; secret managers are the secure storage. In production, the manager injects values as env vars at runtime. Don't read secret manager on every request — load once at startup.

**Config vs feature flags.** Env vars toggle features at deploy time (requires restart/redeploy). Feature flag services (LaunchDarkly, Unleash) toggle at runtime without deploy. Rule: env vars for environment-specific config; feature flags for gradual rollouts.

## 8. 🧠 The Memory Hook — What Sticks

One config module, validated at boot, typed and exported — everything else imports config, never `process.env`. Secrets live in a manager, not in git. If the app starts with bad config, that's your fault for not failing fast at the door.
