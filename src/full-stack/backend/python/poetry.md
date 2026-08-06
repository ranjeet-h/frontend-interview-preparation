# Poetry

## Detailed explanation

Poetry manages dependencies, virtual environments, packaging, and lockfiles. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Poetry makes Python dependency management reproducible.

## 2. Problem it solves

This concept helps Python backend code stay predictable under real service conditions: request handling, validation, database access, async work, tests, dependency management, and production debugging.

## 3. Core idea

- Understand the language behavior before applying a framework.
- Use explicit contracts where possible.
- Avoid hidden mutation and hidden dependencies.
- Choose concurrency tools based on I/O-bound vs CPU-bound work.
- Write code that is easy to test and debug.

## 4. Visual / analogy

```txt
Python concept -> service code behavior -> API reliability -> production debugging
```

## 5. Minimal example

```python
def example(value):
    return value
```

## 6. Real-world example

In a FastAPI or Django backend, poetry affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What is Poetry in Python?
- **The Engine Mechanism (Why it behaves this way):** Poetry is a dependency management and packaging tool for Python. It combines `pyproject.toml` (project configuration), `poetry.lock` (pinned dependency tree), and a virtual environment manager into one tool. `poetry init` creates a `pyproject.toml` with project metadata. `poetry add package` adds a dependency and updates both `pyproject.toml` and `poetry.lock`. `poetry install` reads `poetry.lock` and installs exact versions. Poetry resolves the full dependency tree, ensuring all packages are compatible. It also handles building and publishing packages to PyPI. Poetry creates and manages virtual environments automatically (configurable via `poetry config virtualenvs.in-project true`).
- **The Unforgettable Mental Model:** The **All-in-One Workshop**. Poetry is like a workshop that combines tool storage (dependency management), blueprints (pyproject.toml), inventory list (poetry.lock), and packaging station (build/publish) — all in one place.
- **The Trap:** Committing `pyproject.toml` without `poetry.lock` — the lock file pins exact versions for reproducibility. Without it, different machines may resolve different dependency trees.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poetry is an all-in-one dependency management and packaging tool. It uses `pyproject.toml` for project configuration and `poetry.lock` for pinned dependency versions. `poetry add` adds dependencies and resolves the full tree, ensuring compatibility. `poetry install` installs exact versions from the lock file. Poetry also manages virtual environments automatically and handles building/publishing packages. I prefer Poetry over pip+requirements.txt because it resolves the full dependency tree, preventing conflicts, and the lock file ensures reproducibility across environments."

#### Why does Poetry matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** Backend services need reliable dependency management — specific versions, conflict resolution, reproducible builds. Poetry solves these problems better than pip alone. Poetry's dependency resolver considers the full tree, not just direct dependencies — it finds a version set where all packages are compatible. The `poetry.lock` file pins every transitive dependency, ensuring CI, staging, and production use identical versions. Poetry also manages dev dependencies separately (`poetry add --group dev pytest`), keeping production installs lean. In CI/CD, `poetry install --no-dev --no-interaction` installs only production dependencies.
- **The Unforgettable Mental Model:** The **Architect's Blueprint**. Poetry is like an architect's blueprint — it plans the entire structure (dependency tree), ensures all parts fit together (resolution), and provides exact specifications (lock file) for builders (CI/CD).
- **The Trap:** Using `poetry update` in production — it updates all dependencies to latest compatible versions, potentially breaking the service. Use `poetry install` for reproducibility.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poetry matters for reliable dependency management in backend services. Its resolver considers the full dependency tree, preventing conflicts that pip might miss. The lock file pins every transitive dependency, ensuring CI, staging, and production are identical. Poetry separates dev and production dependencies, keeping production installs lean. In CI/CD, I use `poetry install --no-dev --no-interaction` for fast, reproducible builds. I also use Poetry's build and publish commands for packaging internal libraries."

#### What bug can happen if you misunderstand Poetry?
- **The Engine Mechanism (Why it behaves this way):** The lock file drift bug: modifying `pyproject.toml` without running `poetry lock` — the lock file becomes stale, and `poetry install` installs outdated versions. The `poetry update` bug: running `poetry update` in production updates all dependencies, potentially breaking the service. The virtual environment confusion bug: Poetry creates venvs in a default location (`~/.cache/pypoetry/virtualenvs`), not in the project directory — developers may not realize which venv is active. The dependency group bug: not separating dev and production dependencies — `poetry install` without `--no-dev` installs testing tools in production. The resolver timeout bug: complex dependency trees can cause Poetry's resolver to take a long time or fail — use `poetry lock --no-update` to update only specific packages.
- **The Unforgettable Mental Model:** The **Outdated Map**. A stale lock file is like an outdated map — it shows the old route, not the new one. Following it leads to the wrong destination.
- **The Trap:** Running `poetry update` instead of `poetry install` in CI/CD — `update` changes versions, `install` uses pinned versions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common Poetry bug is the lock file drift — modifying `pyproject.toml` without running `poetry lock` leaves the lock file stale. I always run `poetry lock` after changing dependencies. Another bug is running `poetry update` in production — it updates all dependencies, potentially breaking things. I use `poetry install` for reproducibility. I also configure Poetry to create venvs in the project directory (`poetry config virtualenvs.in-project true`) for visibility. And I separate dev dependencies with `--group dev` to keep production installs lean."

#### How does Poetry affect testing?
- **The Engine Mechanism (Why it behaves this way):** Poetry ensures tests run with the exact same dependencies as production. `poetry install` reads the lock file and installs pinned versions. Dev dependencies are installed separately (`poetry install --with dev`), keeping the dependency graph clean. Poetry's lock file ensures that tests pass locally and in CI with identical dependencies. Poetry also supports testing with different Python versions via `poetry run pytest` in different venvs.
- **The Unforgettable Mental Model:** The **Identical Twins**. Poetry's lock file ensures the test environment and production environment are identical twins — same dependencies, same versions, same behavior.
- **The Trap:** Not installing dev dependencies in CI — tests fail because pytest or other test tools aren't installed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poetry ensures tests run with identical dependencies as production. `poetry install --with dev` installs both production and dev dependencies. The lock file guarantees that local and CI environments are identical. I use `poetry run pytest` to run tests within the Poetry-managed venv. The key benefit is reproducibility — tests pass locally and in CI because the dependencies are pinned to exact versions."

#### How does Poetry affect performance or memory?
- **The Engine Mechanism (Why it behaves this way):** Poetry itself has no runtime performance impact — it's a build-time tool. The dependency resolution step can be slow for complex dependency trees (minutes for large projects), but this is a one-time cost during `poetry lock`. `poetry install` is fast because it reads the pre-resolved lock file. Poetry's virtual environments have the same memory characteristics as standard venvs. Production installs with `--no-dev` are leaner because dev dependencies (testing tools, linters) aren't installed.
- **The Unforgettable Mental Model:** The **Pre-Computed Recipe**. Poetry's lock file is like a pre-computed recipe — the resolver does the hard work once (computing compatible versions), and `poetry install` just follows the recipe (fast).
- **The Trap:** Thinking Poetry's resolver slowness affects runtime. It doesn't — resolution happens at build time, not runtime.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poetry has no runtime performance impact — it's a build-time tool. Dependency resolution can be slow for complex trees, but this is a one-time cost during `poetry lock`. `poetry install` is fast because it reads the pre-resolved lock file. Production installs with `--no-dev` are leaner because dev dependencies aren't included. The key benefit is build-time reliability, not runtime performance."

#### How would you explain Poetry with code?
- **The Engine Mechanism (Why it behaves this way):** Show init: `poetry init` creates `pyproject.toml`. Show add: `poetry add requests` adds to `pyproject.toml` and updates `poetry.lock`. Show install: `poetry install` installs from lock file. Show dev deps: `poetry add --group dev pytest`. Show run: `poetry run python main.py` runs within the venv. Show lock: `poetry lock` resolves and pins dependencies. Show build: `poetry build` creates wheel and sdist. Show export: `poetry export -f requirements.txt > requirements.txt` exports to pip format.
- **The Unforgettable Mental Model:** The **Daily Workflow**. Show the daily workflow: add, lock, install, run. This makes the concept concrete.
- **The Trap:** Not showing the difference between `poetry add` and `poetry install` — add modifies the project, install sets up the environment.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate Poetry with the daily workflow: `poetry add requests` adds a dependency and updates the lock file, `poetry install` installs exact versions from the lock file, `poetry run python main.py` runs the application within the venv, and `poetry lock` resolves the full dependency tree. I also show `poetry add --group dev pytest` for dev dependencies and `poetry export` for pip compatibility. The key commands are add, lock, install, and run."

## 8. Active recall test

1. **What is the difference between `pyproject.toml` and `poetry.lock`?**
   - **Explanation:** `pyproject.toml` declares direct dependencies with version ranges. `poetry.lock` pins exact versions of all dependencies (direct and transitive) after resolution.

2. **What does `poetry add` do vs. `poetry install`?**
   - **Explanation:** `poetry add` adds a dependency to `pyproject.toml` and resolves the lock file. `poetry install` reads the lock file and installs exact versions into the venv.

3. **Why should you commit `poetry.lock`?**
   - **Explanation:** It pins exact versions of all dependencies, ensuring reproducibility across environments (dev, CI, production). Without it, different machines may resolve different versions.

4. **How do you add a dev-only dependency in Poetry?**
   - **Explanation:** `poetry add --group dev pytest`. This adds the dependency to the dev group in `pyproject.toml`. Install with `poetry install --with dev`.

5. **What does `poetry run` do?**
   - **Explanation:** Runs a command within the Poetry-managed virtual environment. `poetry run python main.py` uses the venv's Python and installed packages.

6. **How do you export Poetry dependencies to pip format?**
   - **Explanation:** `poetry export -f requirements.txt --output requirements.txt`. This converts the lock file to pip's requirements format for compatibility.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Poetry with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Poetry and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Poetry.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
