# Settings Management in FastAPI: Singleton Patterns, `@lru_cache`, and Dependency Injection

## 1. Why This Exists — The Problem First

Imagine deploying a high-traffic payment service. In dozens of files, engineers scattered raw `os.getenv()` calls to read environment variables:

```python
# Scattered across handlers and database utilities
db_url = os.getenv("DATABASE_URL")
stripe_key = os.getenv("STRIPE_SECRET_KEY")
timeout = int(os.getenv("TIMEOUT_SECONDS", "30"))
```

Three production disasters inevitably occur:

First, the **silent startup crash**. An engineer adds a new third-party integration requiring `STRIPE_SECRET_KEY` but forgets to configure the variable in the staging container. Because `os.getenv()` silently returns `None` without raising an error, the application boots successfully, passes health checks, and sits idle for hours. At 3:00 AM, the first customer hits `/checkout`, triggering an unhandled `AttributeError` inside the payment SDK.

Second, the **request-time I/O collapse**. To avoid `os.getenv()` mess, an engineer creates a Pydantic `Settings` class to validate everything. But inside their route handler, they instantiate it on every request:

```python
@app.get("/orders")
def get_orders():
    settings = Settings()  # Reads .env from disk and parses env vars on EVERY request!
    ...
```

Under 4,000 requests per second, the server repeatedly opens file handles to read `.env`, loops through the system environment dictionary, casts types, and executes validation trees 4,000 times a second. File descriptor limits are exhausted, CPU usage spikes to 100%, and request latency surges from 15ms to 800ms.

Third, the **test suite contamination nightmare**. When running parallel unit tests with Pytest, you cannot safely test how your application behaves under different configurations. Mutating `os.environ` in one test bleeds into concurrently running threads, causing flaky test runs that pass locally but fail intermittently in CI.

FastAPI solves all three issues by combining **Pydantic Settings** (fail-fast validation at boot), **`@lru_cache`** (zero-cost singleton in memory), and **Dependency Injection via `Depends()`** (effortless test overrides without global state pollution).

---

## 2. The Analogy — Make It Obvious

Think of settings management like the **pre-flight inspection and master flight manifest** of a commercial airline.

```txt
┌──────────────────────────────────────────────────────────────────┐
│                      PRE-FLIGHT GATE CHECK                       │
│  Ground Crew verifies Fuel, Cargo Weight, Route, Nav Data       │
│  [Pydantic Settings: Any missing required item grounded at gate] │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ Passes validation
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                      LAMINATED COCKPIT CLIPBOARD                 │
│  Captain creates ONE master flight plan card for the cockpit    │
│  [@lru_cache: Evaluated ONCE, stored as a zero-cost singleton]  │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ Consulted during flight
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                      FLIGHT CREW IN-FLIGHT ACCESS                │
│  Pilots & navigators glance at the clipboard during maneuvers    │
│  [Depends(get_settings): Injected into routes on demand]         │
└──────────────────────────────────────────────────────────────────┘
```

If every flight attendant had to run down to the cargo hold, open shipping containers, calculate fuel densities, and translate runway weather codes every time a passenger asked for water, the plane would never operate efficiently. Worse, discovering that navigation coordinates are missing halfway across the ocean is catastrophic.

Instead:
1. **The Ground Inspection (`Pydantic BaseSettings`)**: Before the plane leaves the gate (startup), the crew verifies all required instruments, fuel reserves, and flight plans. If anything is missing or malformed, the plane refuses to take off (fails fast).
2. **The Laminated Clipboard (`@lru_cache`)**: Once calculated, the master parameters are written down once and clipped to the cockpit dashboard. The crew never recalculates fuel density mid-flight; they read the existing clipboard.
3. **Cockpit Glance (`Depends(get_settings)`)**: Whenever an autopilot system or crew member needs a threshold, they glance at the clipboard.
4. **Flight Simulator Mode (`app.dependency_overrides`)**: When training pilots in a simulator (running test suites), the instructor slips a simulated flight card onto the clipboard without rewiring the actual airplane electronics.

---

## 3. How It Actually Works — The Full Explanation

Settings management in modern FastAPI relies on three coordinated architectural layers:

```txt
System Env / .env File
         │
         ▼ (Boot time / First call)
┌────────────────────────────────────────────────────────┐
│  Pydantic Settings Model (BaseSettings)                │
│  • Reads OS environment variables & .env file          │
│  • Coerces string types ("5432" -> 5432, "true" -> True)│
│  • Validates constraints (URLs, ports, SecretStr)      │
│  • Assembles @computed_field connection strings        │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Singleton Cache: @lru_cache def get_settings()        │
│  • Executes initialization exactly ONCE                │
│  • Holds validated Settings instance in memory         │
│  • Subsequent calls return reference in O(1) time      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  FastAPI Dependency Injection: Depends(get_settings)   │
│  • Injected into Route Handlers and Services           │
│  • Allows test suites to swap config via:              │
│    app.dependency_overrides[get_settings] = ...       │
└────────────────────────────────────────────────────────┘
```

### Layer 1: Pydantic Settings (`BaseSettings`) and Type Validation

`pydantic-settings` provides `BaseSettings`, a specialized subclass of Pydantic's `BaseModel`. When an instance of `BaseSettings` is created, it follows a strict resolution hierarchy:

1. System environment variables already loaded into the process (`os.environ`).
2. Variables loaded from an external file (such as `.env` or `.env.production`).
3. Default values declared directly on the model fields.

Key engine behaviors include:

- **Automatic Type Coercion**: Environment variables are always OS-level strings. Pydantic automatically parses string values into Python native types: `"5432"` becomes `int(5432)`, `"yes"`, `"true"`, `"1"` become `bool(True)`, and JSON strings like `'["admin", "read"]'` become Python lists.
- **Fail-Fast Bootstrapping**: If a required field (a field without a default value) is missing from the environment, Pydantic raises a `ValidationError` with details specifying the exact variable name and expected type. The process exits before binding to network ports.
- **Nested Configurations**: Enterprise apps group settings logically (e.g., `DatabaseSettings`, `RedisSettings`, `AuthSettings`). By setting `env_nested_delimiter="__"`, Pydantic maps `DATABASE__HOST` and `DATABASE__PORT` directly into nested objects like `settings.database.host` and `settings.database.port`.
- **Derived Values via `@computed_field`**: You should avoid asking operators to configure duplicate environment variables (e.g., configuring `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, *and* `DATABASE_URL`). Instead, use `@computed_field` to assemble the valid connection DSN programmatically from the validated individual fields.
- **Secret Masking via `SecretStr`**: Plain `str` fields print credentials in plaintext during logging or unhandled tracebacks. `SecretStr` masks the value as `**********` whenever dumped or converted to string, requiring explicit `.get_secret_value()` when establishing connections.

### Layer 2: The Factory Pattern and `@lru_cache`

Creating a Pydantic `BaseSettings` instance involves filesystem checks, regex parsing of `.env` files, looking up system environment tables, and validating recursive data trees. This is expensive ($O(K)$ where $K$ is the number of configuration fields).

Python's `functools.lru_cache` memoizes the return value of a function based on the arguments passed to it:

```python
@lru_cache
def get_settings() -> Settings:
    return Settings()
```

Because `get_settings()` takes no arguments, the first invocation executes `Settings()`, validates the environment, and places the resulting instance in the LRU cache. Every subsequent call across all threads and async coroutines returns the exact same object reference in $O(1)$ memory lookup time without parsing or disk I/O.

### Layer 3: Dependency Injection via `Depends(get_settings)`

Instead of importing a global variable directly into route files (e.g., `from config import settings`), endpoints declare the dependency explicitly:

```python
@app.get("/items")
def list_items(settings: Settings = Depends(get_settings)):
    ...
```

Why use `Depends(get_settings)` over a direct global import?

1. **Decoupled Architecture**: Handlers declare their requirement for configuration as an abstract dependency rather than tightly binding to a static module-level singleton.
2. **Deterministic Testing**: FastAPI's routing engine inspects `app.dependency_overrides` before resolving any dependency function. When a test suite sets:
   ```python
   app.dependency_overrides[get_settings] = lambda: TestSettings()
   ```
   FastAPI bypasses `get_settings()` completely and supplies `TestSettings()` to the handler. No monkey-patching of `os.environ`, no cache invalidation gymnastics, and no cross-test pollution.

---

## 4. Real Code — See It Working

Here is a production-grade configuration architecture for FastAPI.

### 1. Configuration Module (`app/core/config.py`)

```python
from functools import lru_cache
from typing import Optional
from pydantic import SecretStr, computed_field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Database connection configuration."""
    host: str = "localhost"
    port: int = 5432
    user: str = "postgres"
    password: SecretStr = SecretStr("postgres")
    name: str = "production_db"
    max_connections: int = 20

    @computed_field
    @property
    def async_url(self) -> str:
        # Build async SQLAlchemy DSN dynamically from validated components
        pwd = self.password.get_secret_value()
        return f"postgresql+asyncpg://{self.user}:{pwd}@{self.host}:{self.port}/{self.name}"


class AuthSettings(BaseSettings):
    """Authentication and token parameters."""
    # Required field: missing environment variable will fail startup immediately
    secret_key: SecretStr
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60


class Settings(BaseSettings):
    """Root application configuration."""
    app_name: str = "Core Billing Service"
    environment: str = "development"
    debug: bool = False

    # Nested configuration groups
    database: DatabaseSettings = DatabaseSettings()
    auth: AuthSettings

    # Pydantic v2 Settings configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # Maps DB__HOST to database.host, AUTH__SECRET_KEY to auth.secret_key
        env_nested_delimiter="__",
        case_sensitive=False,
        extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    """
    Factory function cached via @lru_cache.
    Instantiates Settings once at startup and serves the cached singleton.
    """
    return Settings()
```

### 2. FastAPI Application Endpoints (`app/main.py`)

```python
from fastapi import FastAPI, Depends, status
from app.core.config import Settings, get_settings

app = FastAPI(title="Payment API")


@app.get("/health", status_code=status.HTTP_200_OK)
def health_check(settings: Settings = Depends(get_settings)):
    # Handlers consume configuration via dependency injection
    return {
        "status": "healthy",
        "app_name": settings.app_name,
        "environment": settings.environment,
        "debug_mode": settings.debug,
        "db_host": settings.database.host,
    }


@app.get("/db-config", status_code=status.HTTP_200_OK)
def get_db_info(settings: Settings = Depends(get_settings)):
    # Access computed properties safely without exposing raw passwords
    return {
        "database_target": f"{settings.database.host}:{settings.database.port}/{settings.database.name}",
        "connection_pool_limit": settings.database.max_connections,
    }
```

### 3. Test Suite with Clean Dependency Overrides (`tests/test_api.py`)

```python
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.main import app
from app.core.config import Settings, AuthSettings, DatabaseSettings, get_settings


@pytest.fixture
def client_with_test_settings():
    """
    Pytest fixture that swaps production settings with mock test settings
    and guarantees teardown cleanup after the test executes.
    """
    class TestSettings(Settings):
        environment: str = "test"
        debug: bool = True
        auth: AuthSettings = AuthSettings(secret_key=SecretStr("mock-test-secret-key-12345"))
        database: DatabaseSettings = DatabaseSettings(
            host="sqlite-memory",
            port=0,
            user="test_user",
            password=SecretStr("test_pass"),
            name="test_db",
            max_connections=5
        )

    # Override the settings dependency
    app.dependency_overrides[get_settings] = lambda: TestSettings()

    with TestClient(app) as test_client:
        yield test_client

    # Teardown: Always clear overrides to prevent cross-test state leakage
    app.dependency_overrides.clear()


def test_health_check_returns_test_environment(client_with_test_settings):
    response = client_with_test_settings.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["environment"] == "test"
    assert data["debug_mode"] is True
    assert data["db_host"] == "sqlite-memory"
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why should you use Pydantic `BaseSettings` instead of standard `os.getenv` or `os.environ`?**

`os.getenv()` returns untyped raw strings (or `None`), provides no automatic validation, and fails silently when a required variable is missing. This pushes configuration errors to runtime when an unconfigured code branch is first hit by user traffic.

Pydantic `BaseSettings` provides:
1. **Fail-fast validation**: Required fields without default values crash the server immediately upon startup if missing from the environment, preventing silent runtime failures.
2. **Type coercion**: Automatically casts environment strings into booleans, integers, lists, and complex sub-models with full data validation.
3. **Security**: Types like `SecretStr` prevent secrets from appearing in application logs, Sentry traces, or console outputs.
4. **Self-documenting contract**: The settings class serves as a single, typed schema of every external variable the application depends on.

---

**Q: Why do we wrap `get_settings()` with `@lru_cache` instead of instantiating a global variable `settings = Settings()` at the top of the file?**

If you instantiate `settings = Settings()` globally at module import time:
- The environment is evaluated as soon as the Python file is imported, making it hard to dynamically configure test environments before the class is initialized.
- Every route that imports `from config import settings` is tightly coupled to that specific concrete object.

Wrapping `get_settings()` in `@lru_cache` creates a lazy-loaded singleton. The initialization runs only when first called. More importantly, it turns the settings retrieval into a callable function that FastAPI's dependency injection system can intercept. This allows tests to override configuration using `app.dependency_overrides[get_settings] = lambda: TestSettings()` without monkey-patching global variables or reloading modules.

---

**Q: How does `app.dependency_overrides` work in FastAPI tests, and does `@lru_cache` interfere with it?**

FastAPI's dependency injection resolver checks the `app.dependency_overrides` dictionary before invoking any dependency function. The dictionary maps the original dependency function object (the key, `get_settings`) to a replacement callable (the value).

When an override is registered, FastAPI calls the replacement function directly and never invokes `get_settings()`. Therefore, `@lru_cache` does not interfere with dependency overrides in route handlers because `get_settings()` is never called.

If non-route utility functions call `get_settings()` directly outside FastAPI's request lifecycle during tests, you can call `get_settings.cache_clear()` to reset the cached singleton between test cases.

---

**Q: How do you prevent sensitive secrets (database passwords, API keys) from leaking into logs and exception traces?**

Use Pydantic's `SecretStr` (or `SecretBytes`) field type for all credentials:

```python
from pydantic import SecretStr

class Settings(BaseSettings):
    api_key: SecretStr
```

When `settings.model_dump()`, `str(settings)`, or `print(settings)` is executed, the field displays as `SecretStr('**********')`. To access the actual secret value for authenticating with third-party clients, explicitly call `.get_secret_value()`. Additionally, ensure logging formatters filter out environment dictionaries and never dump the raw `__dict__` of settings objects to stdout in production.

---

**Q: How do you structure configuration for multiple environments (Development, Staging, Production) following 12-Factor App principles?**

The 12-Factor App methodology mandates strict separation of config from code: the codebase has exactly **one** `Settings` class definition across all environments, and environment-specific values are injected at runtime via environment variables or container orchestrators (Kubernetes Secrets/ConfigMaps, AWS ECS task definitions).

For local developer convenience, you can conditionally switch the `.env` file source using a bootstrap variable:

```python
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

env_state = os.getenv("APP_ENV", "development")

class Settings(BaseSettings):
    environment: str = env_state
    model_config = SettingsConfigDict(
        env_file=f".env.{env_state}",
        extra="ignore"
    )
```

In production containers, no `.env` files are baked into the Docker image; values are injected directly into the process environment by the deployment platform.

---

**Q: How do nested settings models and `@computed_field` work in Pydantic v2?**

Nested models group related configuration into sub-domains (e.g., `settings.database`, `settings.redis`). By specifying `env_nested_delimiter="__"` in `SettingsConfigDict`, Pydantic maps flat environment variables like `DATABASE__PORT=5432` into the nested attribute `settings.database.port`.

The `@computed_field` decorator allows you to define properties that are calculated dynamically from validated attributes. This is used for constructing full database connection DSNs from host, port, username, and password fields, ensuring that connection strings are consistent and validated without duplicating raw config variables.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Instantiating `Settings()` inside route handlers

```python
# ❌ INCORRECT: Parses .env and env vars on EVERY request
@app.get("/data")
def read_data():
    settings = Settings()
    return {"host": settings.database.host}

# ✅ CORRECT: Zero-cost cached singleton via DI
@app.get("/data")
def read_data(settings: Settings = Depends(get_settings)):
    return {"host": settings.database.host}
```

*What goes wrong*: `Settings()` executes filesystem I/O to search for `.env`, reads environment tables, and runs full schema validation. Under high traffic, this causes massive CPU spikes, high memory allocation, and latency degradation.

---

### Trap 2: Plaintext secrets in logs and error responses

```python
# ❌ INCORRECT: Plain string will be logged in cleartext during errors or dumps
class Settings(BaseSettings):
    jwt_secret: str

# ✅ CORRECT: SecretStr masks sensitive data automatically
class Settings(BaseSettings):
    jwt_secret: SecretStr
```

*What goes wrong*: When an unhandled exception occurs or when debugging utilities log `settings.model_dump()`, raw string secrets are exported to monitoring systems (Datadog, Sentry, CloudWatch), violating compliance standards (SOC2, PCI-DSS) and leaking credentials.

---

### Trap 3: Leaking test dependency overrides across the test suite

```python
# ❌ INCORRECT: Override stays in app memory for all subsequent tests
def test_feature():
    app.dependency_overrides[get_settings] = lambda: TestSettings()
    client = TestClient(app)
    assert client.get("/health").status_code == 200

# ✅ CORRECT: Use a fixture with teardown cleanup
@pytest.fixture
def test_client():
    app.dependency_overrides[get_settings] = lambda: TestSettings()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
```

*What goes wrong*: `app.dependency_overrides` is a persistent dictionary on the FastAPI application instance. If test A sets an override and fails to clear it, test B inherits test A's configuration, leading to order-dependent test failures and hard-to-debug CI flakiness.

---

### Trap 4: Baking `.env` files into production Docker containers

```dockerfile
# ❌ INCORRECT: Secrets baked into image layers
COPY .env /app/.env

# ✅ CORRECT: Inject environment variables at container runtime
# Dockerfile contains only application code; orchestration supplies env vars
```

*What goes wrong*: Anyone with access to the Docker image registry can inspect layers and extract production database passwords and API keys. Furthermore, images cannot be promoted across environments (staging to production) without rebuilding.

---

### Trap 5: Directly importing global `settings` in route handlers

```python
# ❌ INCORRECT: Direct import bypasses dependency injection
from app.core.config import get_settings
global_settings = get_settings()

@app.get("/profile")
def get_profile():
    if global_settings.debug:
        ...

# ✅ CORRECT: Inject via Depends for testability
@app.get("/profile")
def get_profile(settings: Settings = Depends(get_settings)):
    if settings.debug:
        ...
```

*What goes wrong*: Direct imports bind handlers to the concrete singleton instance in memory, making it impossible to override settings in integration tests without monkey-patching module globals.

---

## 7. Compare With Related Concepts

| Concept | How It Works | Key Difference | When to Use Which |
| :--- | :--- | :--- | :--- |
| **`os.environ` / `os.getenv`** | Direct Python standard library access to process environment dictionary. | Raw strings only, no schema, silent `None` on missing keys, no validation. | Only for minimal bootstrap scripts before Pydantic is initialized. |
| **Pydantic `BaseSettings`** | Typed schema reading from env vars, `.env` files, and defaults. | Validates types, enforces required fields at boot, masks secrets via `SecretStr`. | Standard configuration source of truth for all FastAPI applications. |
| **Global Module Singleton (`settings = Settings()`)** | Instantiated once at file import time and imported directly across modules. | Cannot be cleanly overridden by FastAPI's dependency injection in test suites. | Use only in standalone background worker scripts outside FastAPI routing. |
| **Cached Dependency (`@lru_cache` + `Depends(get_settings)`)** | Lazy-loaded singleton injected into route handlers via FastAPI DI. | Combines zero per-request overhead with clean test override capability via `app.dependency_overrides`. | Best practice for all FastAPI route handlers and request-scoped services. |
| **`FastAPI.state` (`app.state.settings`)** | Attaching a settings object to the application state during lifespan startup. | Dynamic untyped attribute lookup on `request.app.state` without automatic DI parameter resolution. | Suitable for framework-level state (DB connection pools, HTTP client sessions). |

---

## 8. 🧠 The Memory Hook

> **Validate on boot, cache in memory, inject at the door.**
>
> Pydantic guarantees your environment is 100% valid before the server takes its first breath, `@lru_cache` makes accessing it a zero-cost singleton, and `Depends(get_settings)` lets your test suite swap the rules on the fly without ever touching production code.
