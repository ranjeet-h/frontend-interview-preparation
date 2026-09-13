# How do you manage environment variables

## 1. The Real-World Problem — When You Actually Hit This

Your MERN app has been running fine in development for months. You deploy to production on Railway, and suddenly the database connection fails. The error logs show the app is trying to connect to `localhost:27017` — your local MongoDB. Then you discover the developer accidentally committed `.env` to Git, and now your production database credentials are exposed in the repository. Anyone with access can see your JWT secret, your database password, and your API keys. Even worse, your frontend build is bundling `VITE_STRIPE_SECRET_KEY` into the client-side JavaScript, visible to anyone who opens the browser dev tools. This is the moment you realize environment variable management isn't just about configuration — it's about security, deployment safety, and the critical difference between what lives on the server and what lives in the browser.

## 2. The Analogy — Make the Mechanic Obvious

Think of environment variables like a restaurant with two areas: the kitchen (backend) and the dining room (frontend). The kitchen has secure storage for expensive ingredients, secret recipes, and the safe — things only staff can access. The dining room has the menu, prices, and decor — things customers can see. When you set up a restaurant, you put the secret recipes in the kitchen, not on the menu board. If you print the secret recipe on the menu, every customer walks away with it. Frontend environment variables are like the menu — they're public because they're sent to every customer's browser. Backend environment variables are like the kitchen safe — they stay on the server and never leave. The VITE_ prefix is like a special stamp that says "this goes on the menu." Without that stamp, the ingredient stays in the kitchen.

## 3. The Full Explanation — How It Actually Works

Environment variables are key-value pairs that your application reads from its runtime environment. In a MERN stack, you have two completely separate environments: the Node.js backend server and the browser where React runs. This separation is the entire point.

On the backend, Node.js reads environment variables from `process.env`. These variables exist only on the server. When the server starts, it loads these values and uses them for database connections, JWT secrets, API keys, and internal configuration. The browser never sees these. If your backend has `JWT_SECRET=super-secret-key`, that value exists only in the server's memory. A request to your API does not include it. You can change backend environment variables without rebuilding your app — just restart the server.

On the frontend, React runs in the browser. There is no `process.env` in the browser. Instead, build tools like Vite replace environment variable references with their actual values at build time. These values get baked into the JavaScript bundle that gets sent to the browser. If you reference `import.meta.env.VITE_API_URL`, Vite replaces that with the actual URL string during the build. This means anyone can view the bundle source and see those values. Frontend environment variables are public.

Vite solves this with the `VITE_` prefix. Only variables starting with `VITE_` are exposed to the client code. Everything else in `.env` is ignored during the build. This is a safety mechanism to prevent accidentally bundling secrets. But it only works if you respect the rule: never prefix sensitive variables with `VITE_`.

For local development, you use a `.env` file in your project root. The `dotenv` library loads this file into `process.env` when your Node.js backend starts. You never commit `.env` to Git — it's in `.gitignore`. Instead, you commit `.env.example` with placeholder values showing what variables are needed. This documents the required configuration without exposing actual secrets.

In production, you don't use `.env` files. Platforms like Railway, Render, Vercel, and Heroku provide environment variable settings in their dashboards. These are injected into your application's runtime environment when it starts. This is more secure than committing files and easier to manage across environments.

Validation is critical. If your app starts without `MONGO_URI`, it will crash when it tries to connect. Better to fail fast at startup with a clear error. Use a schema validator like Zod to check that all required environment variables are present and have the correct types before the app does anything else.

For environment-specific configuration, use separate files: `.env.development`, `.env.staging`, `.env.production`. Vite automatically loads the correct file based on the build mode. For the backend, load the file based on `NODE_ENV`. This ensures development uses your local database and debug settings, while production uses the real database and security settings.

Secrets rotation is the process of changing secrets like JWT keys or database passwords without breaking the system. The key insight is that you need a transition period where both the old and new secrets work. For JWTs, verify tokens with both the old and new secrets during the transition. Issue new tokens with the new secret. Once all old tokens have expired, remove the old secret. This prevents logging out all users when you rotate secrets.

## 4. See It In Practice — Real Code or Queries

### Backend with dotenv and Zod validation

```javascript
// server/config/env.js
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file based on NODE_ENV
const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
dotenv.config({ path: envFile });

// Define the expected environment variables
const envSchema = z.object({
  // Required database connection
  MONGO_URI: z.string().url(),

  // Required JWT secret for authentication
  JWT_SECRET: z.string().min(32),

  // Optional port, defaults to 5000
  PORT: z.string().default('5000'),

  // Optional Redis URL (only required in production)
  REDIS_URL: z.string().url().optional(),

  // Frontend URL for CORS
  FRONTEND_URL: z.string().url(),
});

// Parse and validate - this throws if required vars are missing
const env = envSchema.parse(process.env);

export default env;
```

```javascript
// server/index.js
import env from './config/env.js';
import mongoose from 'mongoose';
import express from 'express';

// Use validated environment variables
const app = express();
const PORT = env.PORT;

// Connect to MongoDB with validated URI
mongoose.connect(env.MONGO_URI)
  .then(() => console.log('Database connected'))
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1); // Fail fast if DB connection fails
  });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Frontend with Vite environment variables

```javascript
// .env.development
VITE_API_URL=http://localhost:5000/api
VITE_ENABLE_DEBUG=true
```

```javascript
// .env.production
VITE_API_URL=https://api.myapp.com/api
VITE_ENABLE_DEBUG=false
```

```javascript
// frontend/src/api/client.js
const API_URL = import.meta.env.VITE_API_URL;
const ENABLE_DEBUG = import.meta.env.VITE_ENABLE_DEBUG === 'true';

export async function fetchUser(id) {
  if (ENABLE_DEBUG) {
    console.log(`Fetching user ${id} from ${API_URL}`);
  }

  const response = await fetch(`${API_URL}/users/${id}`);
  return response.json();
}
```

### Backend environment-specific configuration

```javascript
// server/config/env.js
import dotenv from 'dotenv';
import { z } from 'zod';

const NODE_ENV = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${NODE_ENV}` });

// Development allows missing optional vars
const devSchema = z.object({
  MONGO_URI: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.string().default('5000'),
  FRONTEND_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(), // Optional in dev
});

// Production requires all vars
const prodSchema = devSchema.extend({
  REDIS_URL: z.string().url(), // Required in prod
});

const envSchema = NODE_ENV === 'production' ? prodSchema : devSchema;
const env = envSchema.parse(process.env);

export default env;
```

### JWT secret rotation with transition period

```javascript
// server/middleware/auth.js
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export function verifyToken(token) {
  // Try the new secret first
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    // If that fails, try the old secret during transition
    if (env.JWT_SECRET_OLD) {
      try {
        return jwt.verify(token, env.JWT_SECRET_OLD);
      } catch (oldErr) {
        throw new Error('Invalid token');
      }
    }
    throw new Error('Invalid token');
  }
}

// When issuing new tokens, always use the new secret
export function generateToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
}
```

### .gitignore and .env.example

```text
# .gitignore
.env
.env.*
*.key
*.pem
node_modules/
dist/
build/
```

```text
# .env.example
# Copy this file to .env and fill in actual values

MONGO_URI=mongodb://localhost:27017/myapp
JWT_SECRET=your-secret-key-at-least-32-characters
PORT=5000
FRONTEND_URL=http://localhost:5173
REDIS_URL=redis://localhost:6379
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you manage environment variables in a MERN app?**

I manage environment variables separately for frontend and backend because they live in completely different environments. On the backend, I use `dotenv` to load a `.env` file in local development, and I set environment variables through the platform dashboard in production. I validate all required variables at startup using Zod so the app fails fast if something is missing. On the frontend, I use Vite's environment variable system — only variables prefixed with `VITE_` are exposed to the client code. I never commit `.env` files to Git; they're in `.gitignore`. Instead, I commit `.env.example` with placeholder values to document what variables are needed. For configuration that both frontend and backend need, I create a `/api/config` endpoint so the backend controls what gets exposed to the frontend. The key rule is never prefix sensitive backend variables with `VITE_` — that would bundle them into the client-side JavaScript where anyone can see them.

**Q: What's the difference between frontend and backend environment variables?**

Backend environment variables exist only on the server. They're read from `process.env` at runtime and never sent to the browser. They include secrets like database passwords, JWT secrets, and API keys. You can change them without rebuilding the app — just restart the server. Frontend environment variables are completely different. They're baked into the JavaScript bundle at build time, so they're visible to anyone who inspects the browser's source code. Vite only exposes variables prefixed with `VITE_` to the client. Changing a frontend environment variable requires rebuilding the bundle. I only put public configuration in frontend env vars — things like API URLs, feature flags, and analytics IDs. Secrets always stay on the backend.

**Q: How do you handle environment-specific configuration?**

I use separate `.env` files for each environment: `.env.development`, `.env.staging`, and `.env.production`. Vite automatically loads the correct file based on the build mode. For the backend, I load the file based on `NODE_ENV` using `dotenv.config({ path: '.env.' + process.env.NODE_ENV })`. I also validate environment variables with different schemas per environment — development might make Redis optional, but production requires it. Platform-specific variables like database URLs for production are set directly in the deployment dashboard, not in `.env` files. This ensures development uses local resources and debug settings, while production uses production resources and security settings. I never use the same `.env` file for all environments because that risks accidentally using development settings in production.

**Q: How do you rotate secrets like JWT keys?**

I rotate secrets with a transition period where both the old and new secrets work. For JWT secrets, I add a new secret as `JWT_SECRET_NEW` while keeping the old `JWT_SECRET`. During the transition, I verify tokens with both secrets — try the new one first, fall back to the old one if verification fails. I issue all new tokens with the new secret. Once all old tokens have expired (usually after the token TTL), I remove the old secret. This prevents logging out all users when I rotate the secret. For database passwords, I add the new password to the database user, update the connection string in the environment variables, and restart the backend. The key principle is never rotate a secret without a transition period — always support both old and new simultaneously until the old one is no longer in use.

**Q: How do you prevent secrets from leaking into version control?**

I use multiple layers of protection. First, `.env` files and anything with secrets go in `.gitignore`. Second, I use pre-commit hooks with tools like `husky` and `lint-staged` to scan for secrets before anything gets committed. Third, I enable GitHub Secret Scanning or use `gitleaks` in CI to catch any secrets that do get committed. Fourth, I provide `.env.example` files with placeholder values so developers know what variables are needed without seeing actual secrets. Fifth, I sanitize logs to never log sensitive values. If a secret does accidentally get committed, I rotate it immediately and clean the Git history using tools like BFG or `git filter-branch`. I never store secrets in code — always in environment variables or a secrets manager. Defense in depth is the approach because no single measure is foolproof.

## 6. The Traps — What Goes Wrong in Production

The most common trap is prefixing sensitive backend variables with `VITE_`. This bundles them into the frontend JavaScript where anyone can view them. I've seen developers prefix `VITE_STRIPE_SECRET_KEY` thinking it's just another environment variable, not realizing it becomes public. Only prefix variables that are safe to expose — API URLs, feature flags, public analytics IDs. Secrets never get the prefix.

Another trap is committing `.env` to Git and then deleting it in a later commit. The secret is still in Git history. Anyone with repository access can see it in the commit history. If this happens, you must rotate the secret immediately and clean the history. Deleting the file in a new commit doesn't remove it from the past.

Using the same `.env` file for all environments is a disaster waiting to happen. Someone might push a change that adds `DEBUG=true` to the shared file, and suddenly production is logging sensitive information. Or worse, production might accidentally use a local database URL. Always use environment-specific files and validate that production has all required variables.

A subtle trap is assuming frontend environment variables are secure. They're not. They're just string replacements in the build output. Anyone can open the browser dev tools, view the source, and see every `VITE_` variable. If the frontend needs something sensitive, create a backend endpoint that provides it securely, not an environment variable.

Forgetting to validate environment variables at startup causes runtime failures. The app starts successfully, then crashes when it tries to connect to the database because `MONGO_URI` is missing. This is worse than failing at startup because it might happen after the app has already started handling requests. Validate at startup so errors are caught immediately.

## 7. Compare With Related Concepts

Environment variables are often confused with hardcoded configuration values. The difference is that environment variables change per environment without code changes, while hardcoded values require modifying and redeploying code. Use environment variables for anything that differs between development, staging, and production — database URLs, API keys, feature flags. Hardcode only true constants that never change.

They're also confused with configuration files like `config.json`. Configuration files are part of the codebase and get committed to Git. Environment variables are external to the codebase and injected at runtime. Use configuration files for application structure and business rules. Use environment variables for deployment-specific values and secrets.

In backend development, environment variables are sometimes confused with secrets managers like AWS Secrets Manager or HashiCorp Vault. Environment variables are the basic mechanism for injecting configuration. Secrets managers are specialized systems for securely storing, rotating, and auditing secrets at scale. For small apps, environment variables are sufficient. For large enterprise apps, use a secrets manager and inject values into environment variables at runtime.

## 8. 🧠 The Memory Hook

Two vaults: the backend vault holds secrets and never leaves the server; the frontend vault holds public config and gets sent to every browser. The VITE_ prefix is the key that unlocks the frontend vault — use it only for things you'd print on a billboard.
