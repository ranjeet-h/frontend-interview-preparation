# Poetry in Python: `pyproject.toml`, Deterministic Lockfiles (`poetry.lock`), and Dependency Groups

## 1. Why This Exists — The Problem First

Imagine deploying a backend API service to production on a Friday afternoon. All integration tests passed in staging three days ago. But immediately upon container startup in production, the pods crash with a catastrophic traceback:

```text
ImportError: cannot import name 'DEFAULT_CIPHERS' from 'urllib3.util.ssl_'
```

You scramble to figure out what changed. You didn't modify any dependencies. Your `requirements.txt` file simply specified `requests>=2.28.0`. 

Here is what actually happened: When your staging Docker image built on Tuesday, `pip` resolved `requests`, which pulled in `urllib3==1.26.15`. When production built on Friday, `urllib3` released a brand-new major version `2.0.0` with breaking internal API changes. Because traditional `requirements.txt` files generally declare loose version ranges for direct dependencies, `pip` resolved the latest available transitive sub-dependency. Your staging and production environments were running completely different dependency graphs.

Before modern packaging tools, managing a Python project was a fragmented mess:
1. **Configuration sprawl:** You needed `setup.py` (imperative code for building), `setup.cfg` (static config), `MANIFEST.in` (packaging non-code assets), `requirements.txt` (production dependencies), and `requirements-dev.txt` (testing and linting tools).
2. **The Diamond Dependency Problem:** Package A requires `library >= 1.2, < 2.0`, while Package B requires `library >= 1.8, < 3.0`. Traditional `pip` evaluated packages sequentially without backtracking; whichever package was processed last would overwrite the shared dependency, often leaving the environment in a broken state.
3. **No Cryptographic Guarantees:** Traditional `requirements.txt` didn't verify file hashes by default, exposing CI/CD pipelines to potential supply-chain tampering if a package index or cache was compromised.
4. **Environment Isolation Friction:** Developers frequently forgot to activate their virtual environments, polluting global Python installations or mixing tool binaries.

Poetry was built to eliminate this chaos. It establishes a single declarative configuration file (`pyproject.toml`), uses a deterministic backtracking dependency solver to generate a pinned lockfile (`poetry.lock`) with cryptographic hashes, manages virtual environments automatically, and introduces first-class dependency groups for clean production builds.

---

## 2. The Analogy — Make It Obvious

Think of managing a Python project like constructing a commercial building:

- **`pyproject.toml` is the Architect’s Blueprint:** The blueprint defines the high-level intent and acceptable design parameters. It says: *"We need an exterior front door, approximately 36 by 80 inches, fire-rated for at least 60 minutes."* It does not list the exact manufacturing batch or factory serial number of the door; it specifies what the building requires to function safely (`fastapi = "^0.110.0"`).
- **The Poetry Resolver is the Structural Engineer:** When you add a new requirement (like reinforced glass windows), the engineer analyzes the entire structure. They verify that the weight of the windows does not compromise the load-bearing door frames, checking every sub-component and fastener so nothing collapses.
- **`poetry.lock` is the Itemized Bill of Materials with Exact Serial Numbers:** Once the engineer verifies that every piece fits, they generate an immutable manifest. It does not say "a fire-rated door"; it says *"Acme Steel Doors Model #X-409, Serial #98724, Factory Verification Seal `sha256:4f8a...`"*. Every contractor across five different continents (your laptop, your coworker's machine, the CI runner, the production Kubernetes cluster) receives this exact manifest and builds an identical structure down to the identical screw.
- **Dependency Groups are Job-Specific Tool Crates:** The electrical inspectors and scaffolding crews bring testing meters, hard hats, and temporary ladders to the site (`[tool.poetry.group.dev]` and `[tool.poetry.group.test]`). When the building is handed over to the paying tenants (your production Docker container), you leave the scaffolding and testing tools outside (`poetry install --without dev`) so the living space is lightweight, secure, and uncluttered.

---

## 3. How It Actually Works — The Full Explanation

Poetry coordinates four distinct responsibilities: configuration unification, dependency resolution, lockfile generation, and virtual environment orchestration.

```txt
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                 pyproject.toml                                   │
│  - Project Metadata (PEP 621)                                                    │
│  - Build Backend: poetry-core (PEP 518)                                          │
│  - Direct Dependencies: [tool.poetry.dependencies]                              │
│  - Dependency Groups: [tool.poetry.group.dev.dependencies]                       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                         poetry lock / poetry add
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │          PubGrub SAT Solver           │
                     │  - Scans full transitive tree         │
                     │  - Backtracks on version conflicts    │
                     │  - Selects mutually compatible set    │
                     └───────────────────┬───────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                  poetry.lock                                     │
│  - Exact pinned version of EVERY package (direct + transitive)                   │
│  - SHA-256 cryptographic hashes for wheel and sdist files                        │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                         poetry install [--without dev]
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         Isolated Virtual Environment                             │
│  - Automatically created at .venv or ~/.cache/pypoetry/virtualenvs               │
│  - Deterministic, byte-for-byte identical runtime packages                       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Unified Configuration via `pyproject.toml` (PEP 518 & PEP 621)

Historically, installing a Python package required executing `setup.py`. This created a chicken-and-egg security problem: pip had to execute arbitrary Python code just to discover what build tools were needed to install the package.

PEP 518 resolved this by standardizing `pyproject.toml` as the universal declarative configuration file. Poetry defines two key tables:
- `[build-system]`: Tells pip and other frontends what build engine to use (e.g., `poetry-core`) and how to compile the project without executing arbitrary code.
- `[tool.poetry]`: Contains project metadata (name, version, authors), Python compatibility constraints, and project dependencies.

### 2. The PubGrub Resolver and Deterministic `poetry.lock`

When you execute `poetry add <package>` or `poetry lock`, Poetry does not just grab the latest wheel from PyPI. It runs the **PubGrub algorithm** (a state-of-the-art Boolean Satisfiability / SAT solver):
1. It downloads metadata for the requested package and inspects all of its transitive dependencies.
2. It constructs a complete Directed Acyclic Graph (DAG) of version constraints.
3. If two dependencies require conflicting versions of a shared sub-dependency, the solver backtracks, trying alternative compatible releases across the version matrix.
4. Once a valid global solution is found, Poetry writes every single package—both direct and transitive—into `poetry.lock`.

Each entry in `poetry.lock` records:
- The exact pinned version (e.g., `version = "2.31.0"`).
- The exact list of package files and their cryptographic SHA-256 hashes.

When `poetry install` runs in CI/CD or production, Poetry skips the resolver entirely. It reads `poetry.lock`, verifies that the downloaded wheel hashes match the lockfile, and installs the exact pre-computed package set.

### 3. Modern Dependency Groups

In older workflows, teams maintained separate files like `requirements.txt` and `requirements-dev.txt`. Keeping these in sync was error-prone because a dev package might quietly require a newer version of a shared library than production used.

Poetry solves this with **Dependency Groups**:
- **Main dependencies (`[tool.poetry.dependencies]`):** Required for the application to run in production.
- **Group dependencies (`[tool.poetry.group.<name>.dependencies]`):** Isolated sets of packages for specific environments (e.g., `dev`, `test`, `docs`, `lint`).

Because all groups are resolved together during `poetry lock`, Poetry guarantees that your test tools (like `pytest` or `hypothesis`) never conflict with your production dependencies.

At installation time, you selectively include or exclude groups:
```bash
# In production containers (installs only main dependencies):
poetry install --without dev,test --no-root

# In CI test runners (installs main + test dependencies):
poetry install --with test
```

### 4. Virtual Environment Orchestration

Poetry manages virtual environments automatically:
- When you execute commands in a project directory, Poetry checks if an active virtual environment exists. If not, it creates one.
- By default, environments are stored in `~/.cache/pypoetry/virtualenvs`.
- For Docker containers and standard IDE development, running `poetry config virtualenvs.in-project true` instructs Poetry to place the virtual environment in a `.venv` folder in the project root.
- Commands can be run directly inside the environment using `poetry run <command>` (e.g., `poetry run uvicorn app.main:app`) without manually running `source .venv/bin/activate`.

---

## 4. Real Code — See It Working

### A Complete `pyproject.toml` Configuration

Here is a real-world configuration for a FastAPI microservice demonstrating metadata, version constraints, dependency groups, and tool configurations:

```toml
[tool.poetry]
name = "order-service"
version = "1.4.0"
description = "High-throughput order processing backend service"
authors = ["Engineering Team <backend@example.com>"]
readme = "README.md"
packages = [{ include = "app" }]

[tool.poetry.dependencies]
# Direct runtime dependencies
python = "^3.11"
# Caret (^) allows updates that do not modify the left-most non-zero digit: >=0.110.0, <0.111.0
fastapi = "^0.110.0"
# Uvicorn with standard extras (uvloop, httptools)
uvicorn = { extras = ["standard"], version = "^0.28.0" }
# Pydantic v2
pydantic = "^2.6.0"
# SQLAlchemy 2.0 with asyncpg driver
sqlalchemy = { extras = ["asyncio"], version = "^2.0.28" }
asyncpg = "^0.29.0"

[tool.poetry.group.dev.dependencies]
# Local developer tooling
ruff = "^0.3.0"
mypy = "^1.9.0"
pre-commit = "^3.6.0"

[tool.poetry.group.test.dependencies]
# Testing tools needed in CI/CD pipelines
pytest = "^8.1.0"
pytest-asyncio = "^0.23.5"
httpx = "^0.27.0"
testcontainers = { extras = ["postgres"], version = "^3.7.1" }

[build-system]
# PEP 518 build definition: lightweight poetry-core backend
requires = ["poetry-core>=1.0.0"]
build-backend = "poetry.core.masonry.api"

[tool.ruff]
line-length = 88
target-version = "py311"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

---

### Inside the Deterministic `poetry.lock`

When Poetry locks dependencies, it generates structured records. Notice how every package is locked to an exact version alongside cryptographic hashes:

```toml
# THIS FILE IS AUTOMATICALLY GENERATED BY POETRY. DO NOT EDIT MANUALLY.

[[package]]
name = "fastapi"
version = "0.110.0"
description = "FastAPI framework, high performance, easy to learn, fast to code, ready for production"
optional = false
python-versions = ">=3.8"
files = [
    {file = "fastapi-0.110.0-py3-none-any.whl", hash = "sha256:d8b2d184eb43c683b54d68e2195f17d23d57a2f57d6e67610129bcbb37452e64"},
    {file = "fastapi-0.110.0.tar.gz", hash = "sha256:39f60cb02111efbe85caec1d604b92b6a55180f1d13db798b0f209673da12487"},
]

[package.dependencies]
pydantic = ">=1.7.4,<3.0.0"
starlette = ">=0.37.1,<0.38.0"
typing-extensions = ">=4.8.0"

[[package]]
name = "starlette"
version = "0.37.2"
description = "The little ASGI library that shines."
optional = false
python-versions = ">=3.8"
files = [
    {file = "starlette-0.37.2-py3-none-any.whl", hash = "sha256:69b0ef093a1be1d3550e5015ff36ec88f98dfbc3b1e326b48508e6822db02cb6"},
    {file = "starlette-0.37.2.tar.gz", hash = "sha256:7f082e6669f9e31d3e8e3d09a80e1b6f0e6cbb45f9486c47864f19b25ffbfa33"},
]

[package.dependencies]
anyio = ">=3.4.0,<5"

[metadata]
lock-version = "2.0"
python-versions = "^3.11"
content-hash = "c18a994ef03d987d60f4e4a06d091f86bb9f0d061c47ea41443657ff17094b83"
```

---

### Core CLI Workflow

```bash
# 1. Initialize a new project or configure an existing directory
poetry init

# 2. Add direct production dependencies (updates pyproject.toml and poetry.lock)
poetry add fastapi "uvicorn[standard]"

# 3. Add development and test dependencies into dedicated groups
poetry add --group dev ruff mypy
poetry add --group test pytest httpx

# 4. Install all dependencies into the local virtual environment
poetry install

# 5. Run a command inside the virtual environment without activating it
poetry run pytest
poetry run uvicorn app.main:app --reload

# 6. Check for outdated dependencies and view the resolved dependency tree
poetry show --tree
poetry show --outdated

# 7. Update a specific package within the constraints allowed by pyproject.toml
poetry update fastapi

# 8. Re-generate the lockfile without bumping existing resolved versions
poetry lock --no-update

# 9. Build standard wheel and tarball distribution artifacts
poetry build
```

---

### Production Multi-Stage Dockerfile with Poetry

In production, you want fast builds, cached dependency layers, small images, and zero development dependencies. Here is the canonical pattern:

```dockerfile
# ==========================================
# Stage 1: Build Dependencies
# ==========================================
FROM python:3.11-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_VERSION=1.8.2 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1

# Install poetry into an isolated system directory
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && curl -sSL https://install.python-poetry.org | python3 - \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="$POETRY_HOME/bin:$PATH"

WORKDIR /app

# CRITICAL FOR DOCKER LAYER CACHING:
# Copy ONLY dependency manifests first so Docker caches installed packages
COPY pyproject.toml poetry.lock ./

# Install only production dependencies.
# --no-root: Skips installing the editable application package itself (since code isn't copied yet)
# --without dev,test: Excludes all development/test group dependencies
RUN poetry install --no-root --without dev,test

# ==========================================
# Stage 2: Final Lean Runtime Image
# ==========================================
FROM python:3.11-slim AS runner

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Point PATH to the virtualenv created in builder stage
    PATH="/app/.venv/bin:$PATH"

# Create a non-root system user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy the pre-built virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application source code
COPY app/ /app/app/

# Switch to non-root user
USER appuser

EXPOSE 8000

# Start server using the virtualenv's uvicorn binary
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between `pyproject.toml` and `poetry.lock`, and which one should be committed to Git?**

`pyproject.toml` declares your **intent and constraints**, while `poetry.lock` records the **exact, immutable resolution**. 

In `pyproject.toml`, you write abstract version ranges (e.g., `requests = "^2.28.0"`). It tells the system what your application is compatible with. In contrast, `poetry.lock` contains the complete, frozen dependency tree: every direct package, every transitive sub-dependency, their exact pinned version numbers (e.g., `requests == 2.28.2`, `urllib3 == 1.26.15`, `certifi == 2023.7.22`), and cryptographic SHA-256 file hashes.

**Both files must be committed to Git for applications and services.** Committing `poetry.lock` guarantees byte-for-byte reproducibility across all developer machines, CI test runners, and production Docker builds. Without the lockfile in version control, two builds occurring at different times could resolve different transitive dependencies, resulting in environment drift and untracked bugs reaching production. *(Note: For open-source libraries intended for distribution on PyPI, `pyproject.toml` is published, but the lockfile is typically omitted from the package itself so consuming applications can resolve their own dependency graphs).*

---

**Q: What is the difference between `poetry add`, `poetry install`, `poetry update`, and `poetry lock`?**

- **`poetry add <package>`:** Modifies `pyproject.toml` to declare a new dependency, runs the dependency resolver to find a compatible version, updates `poetry.lock`, and installs the package into the virtual environment.
- **`poetry install`:** Reads `poetry.lock` directly and installs the exact recorded versions into the virtual environment without resolving dependencies. If no lockfile exists, it resolves dependencies and creates one. This is the command used in CI/CD and deployment.
- **`poetry update [package]`:** Ignores the existing pinned versions in `poetry.lock`, queries PyPI for the newest versions that still satisfy the version ranges in `pyproject.toml`, re-resolves the dependency tree, updates `poetry.lock`, and installs the updated packages.
- **`poetry lock`:** Runs the resolver against `pyproject.toml` and refreshes `poetry.lock` without installing or uninstalling any packages in your active virtual environment. Running `poetry lock --no-update` refreshes lockfile metadata or hashes without bumping any already-locked versions.

---

**Q: What is the `--no-root` flag in `poetry install`, and why is it critical for Docker builds?**

By default, `poetry install` performs two operations: it installs all external dependencies listed in `poetry.lock`, and then it installs the current project itself (the "root" package) into the virtual environment in editable mode.

In a Dockerfile, you want to optimize layer caching. External dependencies change infrequently, while your application source code changes on every commit. If you run `poetry install` without `--no-root`, Poetry will fail if your source code is not yet copied into the container. But if you copy your application source code *before* installing dependencies, any 1-line code change invalidates the Docker cache, forcing Docker to re-download and re-install all third-party packages from scratch.

Using `poetry install --no-root` allows you to copy only `pyproject.toml` and `poetry.lock` first, install all third-party dependencies into a cached Docker layer, and then copy your application source code in a later step.

---

**Q: How does version constraint resolution work in Poetry (specifically Caret `^` vs Tilde `~`)?**

Poetry defaults to the **Caret (`^`)** operator when adding packages, following Semantic Versioning (SemVer: `Major.Minor.Patch`):

- **Caret (`^`) — Allows non-breaking SemVer updates:** It allows version updates that do not modify the left-most non-zero digit.
  - `^1.2.3` translates to `>= 1.2.3, < 2.0.0` (allows minor and patch updates).
  - `^0.2.3` translates to `>= 0.2.3, < 0.3.0` (in zero-major versions, minor bumps indicate breaking changes, so only patch updates are allowed).
  - `^0.0.3` translates to `== 0.0.3` (no updates allowed).
- **Tilde (`~`) — Allows patch-level updates only:**
  - `~1.2.3` translates to `>= 1.2.3, < 1.3.0` (locks major and minor, allows patch releases).
  - `~1.2` translates to `>= 1.2.0, < 2.0.0`.
- **Exact (`==`) or Wildcard (`*`):** `==1.2.3` locks strictly to that release, while `*` allows any version (strongly discouraged in production).

---

**Q: How do Dependency Groups differ from legacy `extras` and `requirements-dev.txt`?**

Legacy setups used `requirements-dev.txt` or package `extras` (e.g., `pip install -e .[dev]`). Both had severe architectural flaws:
1. `requirements-dev.txt` maintained an isolated dependency list that was not co-resolved with production dependencies, leading to diamond conflicts when dev tools pulled in incompatible sub-dependencies.
2. `extras` were originally designed for optional runtime features (like `sqlalchemy[asyncio]`), not for local developer tools like linters or test runners.

Poetry **Dependency Groups** (`[tool.poetry.group.<name>.dependencies]`) are co-resolved as part of a single, unified dependency graph during `poetry lock`. This ensures that your developer tools and production packages can always coexist peacefully. Furthermore, groups can be marked as `optional = true` and selectively installed or excluded via `--with <group>` and `--without <group>` CLI flags.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Running `poetry update` in CI/CD or Production Deployments

- **The Wrong Assumption:** A developer adds `poetry update` to their deployment script or Dockerfile thinking it ensures the container has the latest bug fixes.
- **Why It Fails:** `poetry update` regenerates the dependency graph and ignores `poetry.lock`. If a transitive dependency releases a breaking change or buggy patch an hour before deployment, production will pull in the untested code and crash.
- **What Actually Happens:** Builds become non-deterministic. Staging and production drift apart, destroying test reliability.
- **The Fix:** Never execute `poetry update` in automated pipelines. Always run `poetry install --without dev --no-root`.

---

### Trap 2: Lockfile Drift (Editing `pyproject.toml` Without Relocking)

- **The Wrong Assumption:** A developer manually edits `pyproject.toml` to change `pydantic = "^2.5.0"` to `pydantic = "^2.6.0"`, saves the file, and commits it directly to Git without running Poetry.
- **Why It Fails:** `pyproject.toml` contains a metadata hash (`content-hash`). When `pyproject.toml` is modified, `poetry.lock` becomes stale. When CI runs `poetry install`, Poetry detects that the content hash in `poetry.lock` does not match `pyproject.toml`.
- **What Actually Happens:** Depending on the configuration, `poetry install` will either throw a warning and install the outdated version from `poetry.lock`, or fail the build entirely.
- **The Fix:** Always use `poetry add <package>` or run `poetry lock --no-update` after manual edits to synchronize the lockfile before committing.

```bash
# Bad: Manual edit of pyproject.toml committed without lockfile update

# Good: Relock dependencies and verify consistency
poetry lock --no-update
git add pyproject.toml poetry.lock
git commit -m "chore: update pydantic version constraint"
```

---

### Trap 3: Inefficient Docker Layer Caching

- **The Wrong Assumption:** Copying the entire repository before running `poetry install` in a Dockerfile.

```dockerfile
# BROKEN DOCKERFILE PATTERN
FROM python:3.11-slim
WORKDIR /app
COPY . .
# Any 1-line change in app/main.py invalidates Docker cache here,
# forcing a slow, full re-download of all packages on every build:
RUN poetry install
```

- **Why It Fails:** Docker caches layers based on file checksums. Copying `.` copies application code along with manifests. Every source code edit busts the cache for all subsequent `RUN` commands.
- **The Fix:** Separate dependency installation from code copying using `--no-root`:

```dockerfile
# OPTIMIZED PATTERN
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-root --without dev
COPY app/ ./app
```

---

### Trap 4: Forgetting `virtualenvs.in-project true` in Team Environments

- **The Wrong Assumption:** Leaving Poetry's default virtual environment location unchanged (`~/.cache/pypoetry/virtualenvs`).
- **Why It Fails:** By default, Poetry creates virtual environments in a hidden user directory with hashed folder names (e.g., `order-service-py3.11-xK9sL2mP`).
- **What Actually Happens:** VS Code and PyCharm fail to automatically detect the project's Python interpreter. Developers get red squiggly lines across imports. When a virtual environment gets corrupted, finding and deleting it requires digging through hidden global cache folders.
- **The Fix:** Enforce in-project virtual environments across your team:

```bash
poetry config virtualenvs.in-project true
```
This creates a local `.venv` directory directly in the project root, which IDEs discover instantly.

---

## 7. Compare With Related Concepts

| Feature / Tool | Poetry | Pip + `requirements.txt` | Pipenv | PDM | UV (Astral) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Configuration Format** | `pyproject.toml` (`[tool.poetry]`) | Fragmented (`requirements.txt`, `setup.py`) | `Pipfile` & `Pipfile.lock` | Standard `pyproject.toml` (PEP 621) | Standard `pyproject.toml` (PEP 621) |
| **Deterministic Lockfile** | Yes (`poetry.lock` with SHA-256) | No (unless manually pinned with `--hash`) | Yes (`Pipfile.lock`) | Yes (`pdm.lock`) | Yes (`uv.lock`) |
| **Resolver Engine** | PubGrub SAT Backtracking Solver | Legacy iterative solver | Pip-tools / custom solver (notoriously slow) | Resolvelib Backtracking Solver | Ultra-fast PubGrub in Rust |
| **Dependency Groups** | Yes (`[tool.poetry.group]`) | No (requires multiple files) | Partial (default & dev-packages) | Yes (PEP 621 dependency groups) | Yes (PEP 621 dependency groups) |
| **Virtualenv Management** | Built-in & automatic | Manual (`python -m venv`) | Built-in | Built-in + PEP 582 support | Built-in & automatic |
| **Packaging / Publishing** | Built-in (`build` & `publish`) | Requires `wheel`, `twine`, `build` | No native packaging/publishing | Built-in build and publishing | Built-in build engine |
| **Resolution Speed** | Moderate (Pure Python) | Slow to Moderate | Slow (often hangs on large trees) | Moderate | **Instantaneous** (10–100x faster, Rust) |

### Key Decision Rules:

1. **Poetry vs Pip + `requirements.txt`:** Use Pip + `requirements.txt` only for simple, single-file scripts or throwaway experiments. Use Poetry for all serious microservices, APIs, and shared libraries where deterministic builds and dependency isolation are non-negotiable.
2. **Poetry vs Pipenv:** Choose Poetry. Pipenv was an early pioneer of lockfiles in Python but suffered from severe performance bottlenecks and confusing CLI semantics. Poetry offers a cleaner architecture and better tooling standards.
3. **Poetry vs PDM:** Choose PDM if you strictly require 100% pure PEP 621 metadata syntax without tool-specific tables (`[project]` vs `[tool.poetry]`). Choose Poetry for broader community adoption, richer documentation, and mature ecosystem plugins.
4. **Poetry vs UV:** UV is an ultra-fast Rust-based package manager designed as a drop-in replacement for pip, virtualenv, and poetry. Choose UV when CI/CD build speeds and monorepo workspace resolution times are your primary bottleneck. Choose Poetry when you need mature Python-based plugin ecosystems and established PyPI packaging workflows.

---

## 8. 🧠 The Memory Hook

**`pyproject.toml` is what you want, `poetry.lock` is what you got, and Dependency Groups control who gets what.**

Never resolve dependencies in production. Commit `poetry.lock` to version control, build your production containers with `--without dev --no-root`, and treat the lockfile as an immutable contract between your laptop and your production cluster.

