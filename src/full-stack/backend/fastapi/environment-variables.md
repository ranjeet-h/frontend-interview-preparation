# Environment Variables in FastAPI: `pydantic-settings`, `.env` Loading, and 12-Factor Configuration

## 1. Why This Exists — The Problem First

Imagine deploying your FastAPI application to production on a Friday afternoon. Scattered across forty different router files, database modules, and payment helpers are direct calls like `os.environ.get("DB_PORT")`, `os.environ.get("REDIS_TIMEOUT")`, and `os.environ.get("DEBUG")`.

Then the crashes start rolling in.

First, `os.environ.get("DB_PORT")` returned the string `"5432"` instead of the integer `5432`, crashing your connection pool with an unhandled `TypeError`. Next, someone set `DEBUG="False"` in the environment, but in standard Python `bool("False")` evaluates to `True` because any non-empty string is truthy—leaving your interactive Swagger docs and debug tracebacks exposed to the public internet. Then, a missing `REDIS_TIMEOUT` silently defaulted to `None`, causing background tasks to hang indefinitely under load instead of failing immediately on boot. Worst of all, an unhandled exception dumped a local dictionary to Datadog logs, broadcasting your unmasked Stripe API key and database master password in plaintext.

Hardcoding configuration in source files leaks credentials into git history and forces a code change every time a database replica moves. Scattering raw `os.environ` calls throughout your codebase delays configuration errors until runtime when traffic is actively hitting broken endpoints.

The Twelve-Factor App methodology mandates a strict boundary: your codebase must remain completely identical across local development, staging, CI, and production, varying only in the environment configuration injected at runtime. `pydantic-settings` exists to enforce this boundary. It provides centralized, declarative, type-safe settings management that validates types, parses strings, masks secrets, loads local `.env` files, and halts application startup with clear errors the millisecond a required configuration value is missing or malformed.

---

## 2. The Analogy — Make It Obvious

Think of your FastAPI application as a high-end industrial appliance, and your environments (local laptop, staging cluster, production cloud) as electrical outlets in different countries around the world.

In the US, the wall outlet provides 120V AC at 60Hz. In the UK, it supplies 230V AC at 50Hz. In a mobile field station, it runs off a 24V DC battery pack.

If the appliance manufacturer hardwires internal motors directly to the raw copper leads coming out of the wall, the appliance will explode in London, under-power in New York, and short-circuit in the field.

Instead, the appliance is engineered with a built-in Power Regulation Unit (`BaseSettings`):

1. **Pre-flight Inspection (Startup Validation):** Before the appliance turns on a single motor or opens its valves (before FastAPI binds to a port), the regulator measures the incoming line. If the line voltage is missing or outside safe operating limits, the internal circuit breaker trips immediately (`ValidationError`). The machine refuses to start, preventing damage.
2. **Signal Conditioning (Type Coercion):** The regulator converts raw, noisy AC wall current (string values from environment variables like `"5432"`, `"true"`, `"https://db.internal"`) into precisely calibrated internal DC voltages (Python `int`, `bool`, `PostgresDsn`).
3. **Insulated Protective Shielding (`SecretStr`):** Sensitive high-voltage junctions (API secrets and passwords) are encased in heavy, opaque rubber conduit. Diagnostic cameras and inspection probes (loggers and stack tracers) can only see the outer label `**********`, never the live electrical current, unless a maintenance technician explicitly unscrews the safety panel (`get_secret_value()`).
4. **Energy Buffer (`@lru_cache`):** The regulator stabilizes the power flow once on startup and maintains it. It does not measure the wall socket from scratch on every single rotation of the motor (every HTTP request).
5. **Power Source Hierarchy (Precedence Order):** If a field engineer clips a manual override generator directly to the test pins (explicit constructor arguments), that takes highest priority. If plugged into a wall outlet, it uses the wall current (OS environment variables). If no wall current is detected, it draws from the attached battery pack (`.env` file). If no battery is attached, it falls back to its baseline factory safety fuse (field defaults).

---

## 3. How It Actually Works — The Full Explanation

In modern FastAPI with Pydantic v2, settings management is provided by the `pydantic-settings` package through the `BaseSettings` class. It sits at the very start of your application's lifecycle, converting external environment data into validated Python objects.

### The Role of `BaseSettings` and Automatic Coercion

When you create a subclass of `BaseSettings`, you define your configuration attributes using standard Python type annotations and Pydantic `Field` constraints. When the class is instantiated, Pydantic does not just read values—it inspects the environment and coerces raw strings into rich types:

- Strings representing numbers (e.g., `"8000"`, `"5432"`) are parsed into `int` or `float`.
- String representations of booleans (e.g., `"true"`, `"True"`, `"1"`, `"yes"`, `"on"`, `"false"`, `"0"`, `"no"`, `"off"`) are accurately converted to real Python `bool` values.
- Complex types like URLs and connection strings are parsed and validated via specialized types like `PostgresDsn`, `RedisDsn`, or `HttpUrl`.
- JSON-encoded strings in environment variables (e.g., `ALLOWED_ORIGINS='["https://app.example.com", "https://admin.example.com"]'`) are deserialized into native Python lists or dictionaries.

If any required field is missing from all sources, or if a value cannot be coerced into the annotated type, Pydantic raises a `pydantic.ValidationError` containing the exact field name and error reason, terminating the process immediately.

### The 4-Tier Precedence Order

When a configuration setting exists in multiple places, `pydantic-settings` resolves the final value using a strict, predictable evaluation hierarchy:

1. **Explicit Keyword Arguments (Highest Priority):** Arguments passed directly to the class constructor (e.g., `Settings(database_url="sqlite:///test.db")`).
2. **OS Environment Variables:** Variables set in the host operating system, Docker container, or Kubernetes pod (e.g., `export DATABASE_URL=...`).
3. **Dotenv (`.env`) Files:** Key-value pairs loaded from `.env` files specified in the model configuration.
4. **Field Defaults (Lowest Priority):** Default values declared directly on the class definition (e.g., `port: int = 8000`).

This hierarchy is what makes Twelve-Factor deployment work smoothly:
- In local development, developers rely on `.env` files so they do not have to manually set shell variables.
- In staging and production, container orchestrators (Kubernetes Secrets, AWS ECS task definitions) inject OS environment variables, cleanly overriding whatever might exist in any local file.
- In automated test suites, tests instantiate `Settings(database_url="...")` with explicit parameters, overriding both the environment and `.env` files without touching system state.

### Loading `.env` Files via `SettingsConfigDict`

In Pydantic v2, configuration for settings classes is defined using the `model_config` attribute with `SettingsConfigDict`. You specify the target `.env` file, encoding, and how extra environment variables should be treated:

```python
model_config = SettingsConfigDict(
    env_file=".env",
    env_file_encoding="utf-8",
    extra="ignore",
    case_sensitive=False,
)
```

Setting `extra="ignore"` prevents the application from crashing if the environment contains unrelated system variables (like `PATH` or `HOME`). Setting `case_sensitive=False` allows an environment variable named `database_url` or `DATABASE_URL` to match a field declared as `database_url`.

### Secret Handling with `SecretStr`

Standard strings in Python are easily leaked. If you log a settings dictionary (`logger.info(settings.model_dump())`) or if an unhandled exception prints a stack trace with local variables, all passwords, API keys, and tokens stored in standard `str` fields will appear in plain text.

Pydantic provides `SecretStr` and `SecretBytes` to eliminate this risk:
- When printed, converted to string (`str(settings.api_key)`), or represented (`repr(settings.api_key)`), a `SecretStr` always outputs `'**********'`.
- When serialized with `settings.model_dump()`, the value is excluded or masked.
- To retrieve the actual plaintext secret string when connecting to a third-party service or database driver, you must explicitly call `settings.api_key.get_secret_value()`.

### Performance and Dependency Injection with `@lru_cache`

Instantiating `BaseSettings` requires reading the filesystem (for `.env`), querying OS environment dictionaries, performing string parsing, and running validation regexes. If you instantiate `Settings()` inside every route handler or request dependency, you waste CPU cycles and introduce disk I/O overhead on every HTTP request.

The standard FastAPI pattern pairs `BaseSettings` with Python's built-in `functools.lru_cache` and FastAPI's `Depends` system:

```python
@lru_cache
def get_settings() -> Settings:
    return Settings()
```

1. **Lazy Loading:** `Settings` is not instantiated when the module is imported; it is instantiated the first time `get_settings()` is called.
2. **Single-Instance Caching:** Subsequent calls to `get_settings()` return the exact same in-memory `Settings` instance instantly, avoiding repeated disk reads and parsing.
3. **Clean Test Overrides:** In test suites, FastAPI's `app.dependency_overrides[get_settings]` allows tests to swap the cached production settings with mock test settings without altering system environment variables.

---

## 4. Real Code — See It Working

Here is a complete, production-ready architecture demonstrating `BaseSettings`, `SettingsConfigDict`, `SecretStr`, `PostgresDsn`, `@lru_cache`, FastAPI route injection, and multi-environment testing.

### Centralized Settings Definition (`config.py`)

```python
from functools import lru_cache
from typing import Literal
from pydantic import Field, PostgresDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Application Metadata
    app_name: str = Field(default="FastAPI Enterprise Service", description="Public service name")
    environment: Literal["development", "staging", "production", "test"] = Field(
        default="development",
        description="Current deployment tier"
    )
    debug: bool = Field(default=False, description="Enable verbose debug mode")

    # Network & Server
    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1024, le=65535)

    # Database Configuration (Pydantic validates full connection URL structure)
    database_url: PostgresDsn = Field(
        ...,  # Ellipsis indicates a strictly required setting with no default
        description="PostgreSQL async connection string"
    )
    db_pool_size: int = Field(default=10, ge=1, le=50)

    # Security & API Secrets (Protected against accidental logging)
    jwt_secret_key: SecretStr = Field(
        ...,
        min_length=32,
        description="Symmetric key for JWT signing"
    )
    stripe_api_key: SecretStr = Field(
        ...,
        description="Secret key for Stripe payment gateway"
    )

    # Configuration for pydantic-settings
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",            # Ignore unexpected host environment variables
        case_sensitive=False,      # Match both DATABASE_URL and database_url
    )


# Caching ensures disk I/O and validation happen only once
@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### FastAPI Application and Route Injection (`main.py`)

```python
import logging
from fastapi import FastAPI, Depends, status
from config import Settings, get_settings

logger = logging.getLogger("app.service")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Production API")


@app.get("/health", status_code=status.HTTP_200_OK)
def health_check(settings: Settings = Depends(get_settings)):
    # Settings are injected via FastAPI Dependency Injection with zero runtime cost
    return {
        "status": "healthy",
        "app_name": settings.app_name,
        "environment": settings.environment,
        "debug": settings.debug,
    }


@app.post("/payments/charge")
def process_payment(settings: Settings = Depends(get_settings)):
    # Safe logging: printing SecretStr displays masked asterisks
    logger.info("Initializing payment gateway with key: %s", settings.stripe_api_key)
    # Output in logs: 'Initializing payment gateway with key: **********'

    # Extract raw plaintext secret ONLY when sending to external SDK or client
    raw_key = settings.stripe_api_key.get_secret_value()

    # Simulate SDK authentication
    return {
        "status": "processed",
        "key_fingerprint": f"valid_key_len_{len(raw_key)}"
    }
```

### Dynamic Multi-Environment Loader (`config_multi.py`)

For projects requiring different `.env` files based on a single selector switch:

```python
import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

# Read the active environment tier from OS, defaulting to development
APP_ENV = os.getenv("APP_ENV", "development").lower()

class DynamicSettings(BaseSettings):
    environment: str = APP_ENV
    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    model_config = SettingsConfigDict(
        # Loads .env.development, .env.staging, or .env.production dynamically
        env_file=(f".env.{APP_ENV}", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

@lru_cache
def get_dynamic_settings() -> DynamicSettings:
    return DynamicSettings()
```

### Automated Testing with Dependency Overrides (`test_main.py`)

```python
from fastapi.testclient import TestClient
from pydantic import SecretStr
from config import Settings, get_settings
from main import app

client = TestClient(app)


def test_health_check_with_test_settings():
    # 1. Construct a clean Settings instance in memory without touching disk or OS env
    mock_settings = Settings(
        app_name="Test Suite Service",
        environment="test",
        debug=True,
        database_url="postgresql://test_user:test_pass@localhost:5432/test_db",
        jwt_secret_key=SecretStr("a" * 32),
        stripe_api_key=SecretStr("sk_test_1234567890abcdefghijklmn"),
    )

    # 2. Override the get_settings dependency in FastAPI
    app.dependency_overrides[get_settings] = lambda: mock_settings

    try:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["app_name"] == "Test Suite Service"
        assert data["environment"] == "test"
        assert data["debug"] is True
    finally:
        # 3. Always clean up dependency overrides to prevent test contamination
        app.dependency_overrides.clear()
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does `pydantic-settings` determine the priority when a configuration variable is defined across multiple sources?**

`pydantic-settings` resolves configuration values using a 4-tier precedence hierarchy:
1. **Explicit keyword arguments:** Values passed directly when instantiating the class (e.g., `Settings(port=9000)`).
2. **Operating system environment variables:** Variables set in the host environment or injected into the container (e.g., `PORT=9000`).
3. **Dotenv (`.env`) file variables:** Values parsed from the `.env` file specified in `SettingsConfigDict`.
4. **Field default values:** Fallback values declared directly on the class attributes.

This structure allows seamless progression across environments: local developers write `.env` files; staging and production platforms override them via container-injected OS variables without touching code; and automated test suites override everything by passing keyword arguments directly into constructor calls.

---

**Q: Why should you use `@lru_cache` with `get_settings()` instead of instantiating a global singleton `settings = Settings()` at module top-level?**

There are three key architectural reasons:

1. **Test Isolation and Override Capabilities:** If you write `settings = Settings()` at the top level of `config.py`, that code runs the exact millisecond the file is imported. If required environment variables are not set in the test runner's shell, the entire test suite crashes before the tests even begin. Using a factory function `get_settings()` decorated with `@lru_cache` combined with FastAPI's `Depends(get_settings)` allows your test suite to inject mock settings via `app.dependency_overrides[get_settings] = lambda: mock_settings` without modifying OS environment variables or reloading Python modules.
2. **Lazy Initialization:** The settings object is not instantiated until the first HTTP request or lifespan event asks for it. This allows startup scripts to dynamically inject or compute environment variables before settings are evaluated.
3. **Zero Request-Time Overhead:** Without `@lru_cache`, calling `Settings()` inside every route handler would force the server to read `.env` from disk, query the OS environment table, and execute Pydantic regex validators on every single HTTP request. `@lru_cache` parses the settings once, caches the resulting object in memory, and returns that reference in nanoseconds.

---

**Q: How do you prevent sensitive configuration data (database credentials, private keys, API tokens) from leaking into application logs?**

You declare sensitive fields using Pydantic's `SecretStr` (or `SecretBytes` for binary keys) instead of standard Python `str`.

When a field is annotated with `SecretStr`:
- Calling `str(settings.secret_key)`, `repr(settings.secret_key)`, or passing it to logging formatters (`logger.info("Secret: %s", settings.secret_key)`) always renders masked text: `'**********'`.
- Serializing settings with `settings.model_dump()` or `settings.model_dump_json()` keeps the field masked or excludes it.
- To retrieve the actual plaintext secret for establishing network connections, you must explicitly call `settings.secret_key.get_secret_value()`. This makes secret access intentional and easily auditable during code reviews.

---

**Q: Why does standard `os.environ.get()` cause subtle bugs with boolean variables, and how does `pydantic-settings` solve it?**

In standard Python, `os.environ.get("DEBUG")` returns a string. If the environment variable is set to `"False"`, calling `bool(os.environ.get("DEBUG"))` evaluates to `True` because Python treats any non-empty string as truthy (`bool("False") == True`, `bool("0") == True`). To safely parse booleans with raw Python, you have to write custom parsing logic comparing strings against `"true"`, `"1"`, etc.

`pydantic-settings` handles this automatically through type coercion. When a field is typed as `bool`, it evaluates case-insensitive string representations:
- `"true"`, `"t"`, `"1"`, `"yes"`, `"on"` coerce to `True`.
- `"false"`, `"f"`, `"0"`, `"no"`, `"off"` coerce to `False`.
- Any unrecognized string raises a `ValidationError` on startup rather than silently inverting your logic.

---

**Q: How do you manage multi-environment configuration (development, staging, production) according to Twelve-Factor principles?**

The core rule of Twelve-Factor App configuration is that the application codebase and container images must remain 100% identical across all environments.

In practice:
- **Local Development:** Developers keep a local `.env` file (which is added to `.gitignore`) containing local database connections and mock API keys. An un-secret `.env.example` template with placeholder values is committed to version control to document required fields.
- **Staging and Production:** No `.env` files are baked into container images or mounted into disks. Instead, the container orchestrator (Kubernetes Secrets / ConfigMaps, AWS ECS task definitions, HashiCorp Vault) injects environment variables directly into the container process's OS environment.
- **Dynamic Tier Switching:** If distinct local environment files are needed (e.g., `.env.development`, `.env.test`), the application inspects a single selector variable (such as `APP_ENV=development`) and dynamically passes `env_file=f".env.{APP_ENV}"` to `SettingsConfigDict`.

---

**Q: What happens if a required environment variable is missing or malformed when a FastAPI application boots up?**

Pydantic raises a `ValidationError` during the execution of `Settings()`.

Because this instantiation occurs during application startup (in the lifespan handler or upon the first dependency resolution before requests are accepted), the server fails fast:
1. The process crashes immediately with a structured error log detailing the exact variable name, expected type, and failure reason.
2. The container runtime (e.g., Kubernetes) marks the container as unhealthy because the startup probe fails.
3. Traffic is never routed to a broken instance with missing database credentials or invalid configuration, preventing partial failures and silent data corruption.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Instantiating `Settings()` as a Top-Level Global Variable

**The Mistake:** Writing `settings = Settings()` at the root of `config.py` and importing that object directly into route handlers.

**Why It Fails:** The settings instance is created when Python imports the module. When your test runner (e.g., `pytest`) boots up and imports your routes, `Settings()` executes before your test fixtures have a chance to configure test environment variables or mock databases. If local `.env` files are missing in CI, imports will fail immediately.

**The Fix:** Wrap initialization in a cached factory function (`@lru_cache def get_settings(): return Settings()`) and inject it into endpoints with FastAPI's `Depends(get_settings)`.

---

### Trap 2: Mutating OS Environment Variables in Tests Without Clearing the Cache

**The Mistake:** Using `monkeypatch.setenv("DATABASE_URL", "sqlite:///test.db")` in a test after `get_settings()` has already been called in an earlier test.

**Why It Fails:** Because `get_settings` is wrapped in `@lru_cache`, Python skips the function body on subsequent calls and returns the previously cached object created with the old environment variables. Your `monkeypatch` has zero effect.

**The Fix:** Use FastAPI's `app.dependency_overrides[get_settings]` to inject test settings, or explicitly call `get_settings.cache_clear()` in a pytest fixture teardown when modifying OS environment variables.

---

### Trap 3: Calling `.get_secret_value()` in Loggers or String Formatting

**The Mistake:** Writing `logger.info(f"Connecting to database: {settings.db_password.get_secret_value()}")` or defining a `__str__` helper that unwraps secrets for debugging.

**Why It Fails:** Calling `.get_secret_value()` bypasses the protective shielding of `SecretStr`. The raw secret gets written into log aggregators (Datadog, CloudWatch, Splunk) where unauthorized team members or third-party log viewers can access it.

**The Fix:** Pass the `SecretStr` object directly to loggers. It will safely render as `'**********'`. Only call `.get_secret_value()` at the exact point where the secret is passed to a database connection driver or HTTP client.

---

### Trap 4: Baking `.env` Files into Production Docker Images

**The Mistake:** Adding `COPY .env .env` in a `Dockerfile` so the container runs out of the box in production.

**Why It Fails:** Baking `.env` files into container layers violates Docker security and Twelve-Factor principles. Anyone with pull access to the container registry can inspect the image layers and extract your production secrets. Furthermore, the same image cannot be promoted across staging and production because the configuration is hardcoded into the container filesystem.

**The Fix:** Add `.env` and `.env.*` to `.dockerignore` and `.gitignore`. Commit only `.env.example` with dummy values. In production, inject environment variables at runtime via Kubernetes Secrets, AWS Secrets Manager, or container environment definitions.

---

### Trap 5: Defaulting Required Production Secrets in Code

**The Mistake:** Providing fallback default values for production credentials in your class definition (e.g., `jwt_secret: str = "default-insecure-secret-key-123"`).

**Why It Fails:** If an operations engineer forgets to set the `JWT_SECRET` environment variable in the production Kubernetes deployment, the application will not fail on boot. It will silently start using the default insecure key, allowing attackers to forge valid JWT tokens and bypass authentication entirely.

**The Fix:** Mark all sensitive credentials and environment-specific endpoints as required using `Field(...)` or by omitting default values. Force the application to fail fast on startup if production credentials are missing.

---

### Trap 6: Strict Extra Fields Crashing Startup (`extra="forbid"`)

**The Mistake:** Setting `model_config = SettingsConfigDict(extra="forbid")` in `BaseSettings`.

**Why It Fails:** Unlike standard `BaseModel` schemas for API payloads, `BaseSettings` reads from the host operating system. Production platforms (AWS, Kubernetes, Linux OS) inject dozens of standard system variables (such as `KUBERNETES_SERVICE_HOST`, `HOSTNAME`, `PATH`, `HOME`). With `extra="forbid"`, Pydantic will raise a `ValidationError` and crash your application because of unexpected system variables it does not recognize.

**The Fix:** Always use `extra="ignore"` (the default in `pydantic-settings`) so unrelated system environment variables are quietly bypassed.

---

## 7. Compare With Related Concepts

### `pydantic-settings` (`BaseSettings`) vs `os.environ` / `os.getenv`

- **Mechanic:** `os.getenv` is Python's standard library interface to the OS environment table, returning raw strings or `None`. `pydantic-settings` is a declarative schema engine that reads the environment, validates constraints, coerces data types, and aggregates settings in a centralized model.
- **Trade-off:** `os.getenv` has zero external dependencies but provides no type validation, no default parsing, no secret masking, and scatters configuration across files. `pydantic-settings` requires an extra dependency but eliminates runtime configuration bugs.
- **Rule of Thumb:** Use `pydantic-settings` for all application and service configuration; use `os.getenv` only for tiny one-off utility scripts or before the settings system has initialized.

---

### `pydantic-settings` (`BaseSettings`) vs `python-dotenv`

- **Mechanic:** `python-dotenv` reads a `.env` file and writes those key-value pairs directly into Python's global `os.environ` dictionary. `pydantic-settings` reads `.env` files directly and populates an isolated, type-safe `BaseSettings` instance without polluting the global OS process space (unless explicitly configured).
- **Trade-off:** `python-dotenv` only handles file reading and string injection. `pydantic-settings` handles reading, type coercion, complex validation, secret masking, and caching.
- **Rule of Thumb:** Use `pydantic-settings` for FastAPI applications; `pydantic-settings` uses `python-dotenv` under the hood for `.env` parsing anyway.

---

### `BaseSettings` vs `BaseModel`

- **Mechanic:** Both inherit from Pydantic's core validation architecture. However, `BaseModel` is designed for data serialization and deserialization (such as HTTP request/response JSON bodies), reading data passed to its constructor. `BaseSettings` is specialized for configuration, automatically reading and prioritizing data from OS environment variables and `.env` files when constructor arguments are omitted.
- **Trade-off:** Using `BaseModel` for settings forces you to manually load and pass environment dictionaries. `BaseSettings` automates source discovery and environment resolution.
- **Rule of Thumb:** Use `BaseModel` for API schemas and domain data transfer objects (DTOs); use `BaseSettings` for system configuration and infrastructure settings.

---

### Container Environment Variables vs `.env` Files

- **Mechanic:** Container environment variables are injected into the running process by the operating system kernel or container runtime (Docker/Kubernetes). `.env` files are plain text files stored on the filesystem that must be read and parsed by the application at startup.
- **Trade-off:** `.env` files are convenient for local development but pose security and immutability risks if used in production. Container environment variables are secure, platform-managed, and follow Twelve-Factor standards.
- **Rule of Thumb:** Use `.env` files exclusively on local developer workstations; use container/OS environment variables in staging, CI, and production.

---

## 8. 🧠 The Memory Hook — What Sticks

Defaults are the basement, `.env` is the local floor, OS environment is the building rule, and explicit kwargs are the penthouse override. Subclass `BaseSettings` to validate at the door, wrap secrets in `SecretStr` to keep them off the security cameras, and cache with `@lru_cache` so you only inspect the room once.
