# Environment Variables in FastAPI

## Detailed explanation

Environment variables provide deployment-specific configuration like database URLs and secrets. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Env vars keep config outside code.

## 2. Problem it solves

It keeps FastAPI applications predictable by making contracts, shared logic, validation, or runtime behavior explicit instead of scattering framework code across handlers.

## 3. Core idea

- Use Python type hints as API contracts.
- Keep route handlers thin and delegate business logic to services.
- Use dependencies for shared request-time behavior.
- Return explicit response models and status codes.
- Test behavior through HTTP calls and dependency overrides.

## 4. Visual / analogy

```txt
Request -> dependency resolution -> validation -> endpoint -> service/database -> response model -> response
```

## 5. Minimal example

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str

@app.post("/items")
def create_item(item: Item):
    return {"data": item}
```

## 6. Real-world example

A production FastAPI service uses routers per domain, Pydantic schemas for input/output, dependencies for auth and DB sessions, exception handlers for consistent errors, and tests with dependency overrides.

## 7. Common interview questions

#### How do you access environment variables in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Use `os.environ` or `os.getenv()` from Python's standard library: `import os; DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///default.db")`. Environment variables are read at runtime from the process environment. They're set by the deployment platform (Docker, Kubernetes, Heroku) or `.env` files loaded by `python-dotenv`. Environment variables are strings — you must parse them into the correct types (int, bool, URL). For production, never hardcode secrets — always read them from environment variables.
- **The Unforgettable Mental Model:** The **Vending Machine Slot**. The machine (app) doesn't know what coins (config values) are inside until you insert them (set env vars). Different machines (environments) have different coins.
- **The Trap:** Reading environment variables at import time in module-level code. This makes testing hard — you can't change env vars between tests without reloading modules. Read them in a settings class or dependency.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I read environment variables using os.getenv() in a Pydantic Settings class. This provides type conversion, validation, and defaults. I never hardcode secrets — they always come from environment variables set by the deployment platform."

#### Why shouldn't you hardcode configuration values?
- **The Engine Mechanism (Why it behaves this way):** Hardcoded values require code changes to modify configuration — different environments (dev, staging, production) need different code branches or config files checked into version control. This leaks secrets into git history, makes deployments fragile, and prevents configuration changes without redeployment. Environment variables separate code from configuration — the same code runs in all environments with different env var values.
- **The Unforgettable Mental Model:** The **Universal Remote**. A hardcoded config is like a remote that only works with one TV. Environment variables are a universal remote — same remote (code), different TVs (environments) via different settings.
- **The Trap:** Committing .env files to git. Even in private repos, .env files with secrets can be leaked. Use .env.example with placeholder values and .gitignore the real .env file.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Hardcoded config requires code changes for environment differences, leaks secrets into git, and prevents config changes without redeployment. I use environment variables for all configuration — the same code runs everywhere with different env var values. I never commit .env files."

#### How do you load environment variables from .env files?
- **The Engine Mechanism (Why it behaves this way):** Use `python-dotenv` to load `.env` files: `from dotenv import load_dotenv; load_dotenv()`. This reads key-value pairs from `.env` and sets them as environment variables. Call `load_dotenv()` early in your application (before importing modules that read env vars). Pydantic Settings automatically loads from `.env` files when using `pydantic-settings`. In production, `.env` files are typically not used — the deployment platform sets environment variables directly.
- **The Unforgettable Mental Model:** The **Recipe Card**. The .env file is a recipe card that tells the kitchen (app) what ingredients (config values) to use. In production, the supplier (deployment platform) delivers ingredients directly.
- **The Trap:** Relying on .env files in production. Production platforms (Kubernetes, Heroku, AWS) set env vars directly. .env files are for local development only.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use python-dotenv for local development to load .env files. Pydantic Settings handles this automatically. In production, the deployment platform sets environment variables directly — no .env files needed. I .gitignore .env files and commit .env.example with placeholders."

#### How do you handle different environments (dev, staging, prod)?
- **The Engine Mechanism (Why it behaves this way):** Use an `ENVIRONMENT` or `APP_ENV` environment variable to select configuration: `class Settings(BaseSettings): environment: str = "development"; database_url: str; @property def is_production(self): return self.environment == "production"`. Each environment has different values for the same variables: dev uses SQLite, staging uses a test DB, production uses the production DB. The deployment platform sets the environment-specific values. The code reads the same variable names — only the values change.
- **The Unforgettable Mental Model:** The **Costume Change**. The actor (code) is the same, but wears different costumes (config values) for different scenes (environments). The script doesn't change — only the appearance.
- **The Trap:** Using if/else branches in code for environment-specific logic. This creates environment-specific code paths that are hard to test. Use configuration values, not code branches.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use an ENVIRONMENT variable to distinguish environments. Each environment has different values for the same config variables — different DB URLs, different API keys. The code reads the same variable names; only the values change. I avoid if/else branches for environment-specific logic."

#### How do you validate environment variables?
- **The Engine Mechanism (Why it behaves this way):** Use Pydantic Settings (`pydantic-settings`) to validate environment variables: `class Settings(BaseSettings): database_url: PostgresDsn; secret_key: str = Field(min_length=32); debug: bool = False`. Pydantic validates types, constraints, and required fields at startup. If a required variable is missing or invalid, the app fails to start with a clear error message. This prevents runtime errors from missing configuration — fail fast at startup.
- **The Unforgettable Mental Model:** The **Pre-Flight Checklist**. Before takeoff (app start), the pilot (Pydantic Settings) checks every item on the list (env vars). If anything is missing or wrong, the plane doesn't take off.
- **The Trap:** Not validating environment variables. Missing or invalid config causes runtime errors that are hard to debug. Validate at startup with Pydantic Settings.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use Pydantic Settings to validate environment variables at startup. Required fields, type conversion, and constraints are checked before the app starts. If config is missing or invalid, the app fails fast with a clear error. This prevents runtime config errors."

#### How do you test with different environment variables?
- **The Engine Mechanism (Why it behaves this way):** Use `monkeypatch` in pytest to override environment variables: `def test_prod_settings(monkeypatch): monkeypatch.setenv("DATABASE_URL", "postgresql://test"); monkeypatch.setenv("ENVIRONMENT", "production"); settings = Settings(); assert settings.is_production`. Alternatively, create Settings instances directly with override values: `settings = Settings(database_url="sqlite:///test.db", _env_file=None)`. For integration tests, use a test-specific `.env.test` file. Always isolate env var changes per test to prevent cross-test contamination.
- **The Unforgettable Mental Model:** The **Costume Fitting Room**. Instead of changing the actor's costume on stage (global env vars), you try different costumes in the fitting room (test isolation) and verify each one fits correctly.
- **The Trap:** Setting environment variables globally in tests. This affects other tests running in the same process. Use monkeypatch or direct Settings instantiation for isolation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test with different env vars using pytest's monkeypatch or by creating Settings instances directly with override values. I isolate env var changes per test to prevent cross-test contamination. For integration tests, I use a test-specific .env.test file."

## 8. Active recall test

1. **How do you read environment variables in FastAPI?**
   - **Explanation:** Use os.getenv() in a Pydantic Settings class. This provides type conversion, validation, and defaults. Never hardcode secrets.

2. **Why shouldn't you hardcode configuration values?**
   - **Explanation:** Hardcoded values require code changes for environment differences, leak secrets into git, and prevent config changes without redeployment.

3. **How do you load .env files?**
   - **Explanation:** Use python-dotenv's load_dotenv() or Pydantic Settings which loads .env automatically. In production, the deployment platform sets env vars directly.

4. **How do you handle different environments?**
   - **Explanation:** Use an ENVIRONMENT variable. Each environment has different values for the same config variables. The code reads the same names; only values change.

5. **How do you validate environment variables?**
   - **Explanation:** Use Pydantic Settings with type annotations, Field constraints, and required fields. Validation happens at startup — fail fast if config is missing.

6. **How do you test with different environment variables?**
   - **Explanation:** Use pytest's monkeypatch or create Settings instances directly with override values. Isolate changes per test to prevent cross-test contamination.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Environment Variables in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Environment Variables in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Environment Variables in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
