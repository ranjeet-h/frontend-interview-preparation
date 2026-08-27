# Virtual Environments in Python: `sys.prefix`, `pyvenv.cfg`, and Site-Packages Isolation

## 1. Why This Exists — The Problem First

Imagine deploying an Ubuntu server hosting two Python web services. Service A is a legacy application relying on SQLAlchemy 1.4, while Service B is a new microservice written for SQLAlchemy 2.0. By default, Python installs all third-party libraries into a single global system directory: `/usr/lib/python3.X/site-packages` or `/usr/local/lib/python3.X/dist-packages`.

When you run `pip install sqlalchemy==2.0` globally for Service B, it silently overwrites Service A's SQLAlchemy 1.4 installation, immediately breaking Service A in production with `ImportError` and deprecated syntax failures. Even worse, modern Linux distributions rely heavily on Python for core operating system tasks. Core OS tools like `apt`, `cloud-init`, `ufw`, and `unattended-upgrades` import system Python modules. Running a global `sudo pip install` can overwrite an OS-critical package like `urllib3` or `cryptography` with an incompatible version, rendering `apt` inoperable and corrupting your operating system package manager.

Python was designed in an era when machines ran one script at a time with one set of global libraries. It has no built-in, local-by-default directory structure like Node.js's `node_modules`. Without an explicit isolation mechanism, every dependency installed on a machine competes for the exact same filesystem namespace. Python virtual environments (`venv`) were created to solve this global namespace collision by redirecting Python's package discovery mechanisms to isolated project-specific directories without duplicating the entire Python runtime.

## 2. The Analogy — Make It Obvious

Think of the system Python interpreter as a master building blueprints office with a shared central library. Whenever any worker in the building needs reference books (packages), they go to the central library shelf. If an architect replaces the 1998 structural code manual on the shared shelf with the 2024 revised edition, every engineer in the building is forced to use the 2024 rules, even if their older building project collapses under the new regulations.

A virtual environment is like issuing a project manager a temporary private keycard and a dedicated job-site desk. The desk contains a small configuration plaque (`pyvenv.cfg`) and a private bookshelf (`site-packages`). The engineer still uses the building's central power grid and heavy machinery (the underlying CPython binary and standard library C-extensions), but whenever they reach for a reference book, their private desk tells them to look on their own private bookshelf first. If they buy a new manual (`pip install`), it goes directly onto their private desk's shelf. The central building library remains completely untouched, and other project desks remain completely unaffected.

## 3. How It Actually Works — The Full Explanation

To understand virtual environments, you have to peel back the CPython startup sequence and observe how the interpreter determines where to find importable modules.

**How Python Finds Packages: `sys.prefix`, `sys.base_prefix`, and `site.py`**

When the Python executable starts, its primary job before executing your code is constructing `sys.path`—the ordered list of directory paths that Python searches whenever you write `import something`.

Under normal system execution, Python inspects its own executable location (for example, `/usr/bin/python3`) and sets two core internal variables:
- `sys.base_prefix`: Points to the directory where the standard library and core Python interpreter files are installed (e.g., `/usr`).
- `sys.prefix`: Points to the directory where project-specific site-packages and site configuration files are found (e.g., `/usr`).

In a global installation, `sys.base_prefix == sys.prefix`.

During interpreter initialization, CPython automatically imports a built-in module called `site` (defined in `site.py`). The `site` module calculates the location of third-party libraries by appending `lib/pythonX.Y/site-packages` to `sys.prefix` and adds that path to `sys.path`.

**The Core Engine of a Virtual Environment: `pyvenv.cfg` (PEP 405)**

When you execute `python3 -m venv .venv`, Python does not create a full copy of the Python standard library, compiler, or C extensions. Instead, it creates a lightweight directory structure with three critical components:
1. `pyvenv.cfg`: A small key-value text file located in the root of the `.venv` directory (or alongside the binary in `.venv/bin/`).
2. `.venv/bin/python`: A symbolic link pointing directly back to the base Python executable on your host system (`sys.base_prefix/bin/python`).
3. `.venv/lib/pythonX.Y/site-packages/`: An empty, dedicated directory for third-party packages installed specifically for this environment.

Here is how CPython detects a virtual environment: when any Python binary is invoked, CPython inspects the directory containing the binary (`.venv/bin`) and the parent directory (`.venv`). It searches for a file named `pyvenv.cfg`.

If `pyvenv.cfg` is found:
- CPython reads the `home` key in `pyvenv.cfg` to identify the base interpreter location and assigns it to `sys.base_prefix`.
- CPython sets `sys.prefix` to the directory containing `pyvenv.cfg` (your `.venv` directory).
- When `site.py` executes, it builds the site-packages search path using `sys.prefix`. Therefore, `sys.path` gets `.venv/lib/pythonX.Y/site-packages` instead of the global `/usr/lib/python3.X/site-packages`.
- `pyvenv.cfg` contains the key `include-system-site-packages = false`. Because this is false, `site.py` deliberately skips adding the system-wide site-packages to `sys.path`.

**The Activation Myth: What `source .venv/bin/activate` Actually Does**

A widespread misconception among Python developers is that a virtual environment must be "activated" for Python to work in isolated mode. This is false.

The `activate` script is purely a shell convenience helper. When you run `source .venv/bin/activate`, the bash/zsh script performs only three basic actions:
1. It prepends the absolute path of `.venv/bin` to your current shell's `$PATH` environment variable (`export PATH="/path/to/.venv/bin:$PATH"`).
2. It sets the `$VIRTUAL_ENV` environment variable to `/path/to/.venv`.
3. It changes your terminal prompt to display `(.venv)`.

When you type `python app.py` in an activated shell, your shell finds `.venv/bin/python` first because of `$PATH`.

However, if you execute the virtual environment's binary directly:
`/path/to/.venv/bin/python app.py`

CPython starts, discovers `pyvenv.cfg` next to its binary, sets `sys.prefix` to `.venv`, and isolates `sys.path` with zero involvement from shell variables. You never need to run `activate` in production, systemd services, cron jobs, or Docker containers. Simply invoking the `.venv/bin/` binary directly guarantees complete isolation.

**Docker Containers vs Virtual Environments**

In containerized deployments using Docker, developers often ask: "If Docker already isolates the entire operating system filesystem, why do we need a Python virtual environment inside the container?"

There are three major architectural reasons why virtual environments remain best practice inside Docker containers:
1. **Multi-Stage Build Efficiency:** In a multi-stage `Dockerfile`, you can install compilers (gcc, build-essential, libpq-dev) and build all Python wheels into `/opt/venv` in a heavy `builder` stage. In the final `runner` stage, you copy only the `/opt/venv` directory into a clean, minimal base image (like `python:3.12-slim`). This eliminates build tools, compilers, and cache files from the production container image, shrinking image size from 1GB+ down to 100MB while keeping the runtime attack surface minimal.
2. **Avoiding Base OS Collisions (PEP 668):** Modern Linux base images (Debian 12 Bookworm, Ubuntu 24.04) enforce PEP 668 (`EXTERNALLY-MANAGED`). Running `pip install` against the container's system Python throws an explicit error to prevent corrupting OS-level Python packages. Installing into a container-local virtualenv (`/opt/venv`) completely avoids this conflict.
3. **Non-Root Security Execution:** Running your containerized backend as an unprivileged user (e.g., `USER appuser`) is a core security requirement. The system Python directories (`/usr/local/lib/python3.X`) are owned by `root`. Installing into or modifying global packages requires root permissions. Setting up `/opt/venv` owned by `appuser` allows non-root package execution and isolated security boundaries.

**The Ecosystem of Virtual Environment Tools**

Python has evolved several tools for managing virtual environments:
- `venv` (Standard Library, PEP 405): Built into Python 3.3+. Requires no installation. Lightweight, standard, and recommended for most backend applications.
- `virtualenv`: The third-party predecessor to `venv`. It supports creating environments for arbitrary installed Python versions, is slightly faster at creating environments than standard `venv`, and provides standalone wheel support.
- `conda` / `miniconda`: A language-agnostic binary package and environment manager. Unlike `venv` (which only manages Python packages and relies on system C-libraries), `conda` bundles precompiled C/C++, Fortran, and CUDA binaries directly inside the environment. Essential in data science and machine learning, but heavy for standard web backend microservices.
- `uv`: A high-performance Python package and environment manager written in Rust by Astral. It creates virtual environments in ~10 milliseconds (compared to 1-2 seconds with `venv`) and resolves/installs packages 10x-100x faster than `pip` while adhering 100% to standard `pyvenv.cfg` PEP 405 mechanics.
- `poetry` / `pdm` / `pipenv`: High-level dependency and workflow managers that resolve dependency lockfiles (`pyproject.toml` / `poetry.lock`) and automatically create/manage an underlying `venv` behind the scenes.

## 4. Real Code — See It Working

Let's look at how Python exposes its internal path resolution, how `pyvenv.cfg` drives `sys.prefix`, and how to structure production container environments.

**Example 1: Inspecting the Internal Isolation Mechanics**

Run this script with system Python and then with virtual environment Python to see how CPython alters its internals:

```python
# inspect_env.py
import os
import sys

print("=" * 60)
print(f"Executable:       {sys.executable}")
print(f"Base Prefix:      {sys.base_prefix}")
print(f"Current Prefix:   {sys.prefix}")
print(f"Is Virtual Env?   {sys.prefix != sys.base_prefix}")
print("=" * 60)

# Check if pyvenv.cfg is driving this environment
venv_cfg_path = os.path.join(sys.prefix, "pyvenv.cfg")
if os.path.exists(venv_cfg_path):
    print(f"Found pyvenv.cfg at: {venv_cfg_path}")
    with open(venv_cfg_path, "r", encoding="utf-8") as f:
        print("--- pyvenv.cfg contents ---")
        print(f.read().strip())
        print("---------------------------")
else:
    print("Running in global system environment (no pyvenv.cfg detected).")

print("\nActive sys.path search order:")
for index, path in enumerate(sys.path):
    # Highlight where third-party packages will be loaded from
    marker = " <-- [site-packages]" if "site-packages" in path else ""
    print(f"  [{index}] {path}{marker}")
```

When run with `/usr/bin/python3 inspect_env.py`:
```text
============================================================
Executable:       /usr/bin/python3
Base Prefix:      /usr
Current Prefix:   /usr
Is Virtual Env?   False
============================================================
Running in global system environment (no pyvenv.cfg detected).

Active sys.path search order:
  [0] /workspace/project
  [1] /usr/lib/python312.zip
  [2] /usr/lib/python3.12
  [3] /usr/lib/python3.12/lib-dynload
  [4] /usr/local/lib/python3.12/dist-packages <-- [site-packages]
  [5] /usr/lib/python3/dist-packages <-- [site-packages]
```

When run with `./.venv/bin/python inspect_env.py`:
```text
============================================================
Executable:       /workspace/project/.venv/bin/python
Base Prefix:      /usr
Current Prefix:   /workspace/project/.venv
Is Virtual Env?   True
============================================================
Found pyvenv.cfg at: /workspace/project/.venv/pyvenv.cfg
--- pyvenv.cfg contents ---
home = /usr/bin
include-system-site-packages = false
version = 3.12.3
executable = /usr/bin/python3.12
command = /usr/bin/python3 -m venv /workspace/project/.venv
---------------------------

Active sys.path search order:
  [0] /workspace/project
  [1] /usr/lib/python312.zip
  [2] /usr/lib/python3.12
  [3] /usr/lib/python3.12/lib-dynload
  [4] /workspace/project/.venv/lib/python3.12/site-packages <-- [site-packages]
```
Notice how `/usr/lib/python3/dist-packages` is completely removed from `sys.path` when `include-system-site-packages = false`.

**Example 2: Direct Execution vs Shell Activation**

This bash script demonstrates that direct binary invocation works identically without `source activate`:

```bash
#!/usr/bin/env bash
set -e

# Create a clean virtual environment using the standard library
python3 -m venv .venv

# Install a specific package into the virtualenv directly using its pip binary
# Notice: We do NOT run 'source .venv/bin/activate'
./.venv/bin/pip install --quiet "pydantic==2.7.0"

# Execute Python directly through the virtualenv binary
./.venv/bin/python -c "import pydantic; print(f'Pydantic version: {pydantic.__version__} loaded from {pydantic.__file__}')"

# Verify that system Python cannot see this package
python3 -c "import pydantic" 2>/dev/null || echo "System Python correctly cannot find pydantic!"
```

**Example 3: Production Multi-Stage Dockerfile Using Virtual Environments**

Here is the industry-standard multi-stage Dockerfile pattern isolating Python dependencies in production containers:

```dockerfile
# syntax=docker/dockerfile:1

# Stage 1: Build stage with compilers and build tools
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies required for compiling C-extensions (e.g. asyncpg, cryptography)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a dedicated virtual environment at /opt/venv
RUN python -m venv /opt/venv

# Ensure pip in the venv is up-to-date and install project requirements directly into /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Final runtime stage - small, secure, and minimal
FROM python:3.12-slim AS runner

WORKDIR /app

# Install only runtime shared libraries (no compilers or build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create an unprivileged user for security
RUN useradd -m -u 1001 appuser

# Copy the pre-built virtual environment from the builder stage
COPY --from=builder --chown=appuser:appuser /opt/venv /opt/venv

# Copy application source code
COPY --chown=appuser:appuser ./src /app/src

# Set environment variables:
# 1. Prepend /opt/venv/bin to PATH so 'python' and 'uvicorn' invoke the venv binaries automatically
# 2. Prevent Python from buffering stdout/stderr
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

USER appuser

# Run uvicorn using the virtual environment's binary directly
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What happens at the CPython runtime level when Python starts inside a virtual environment versus globally?**

When CPython initializes, it computes `sys.prefix` and `sys.base_prefix` before importing user code. In a global run, CPython finds the standard library alongside the main executable and assigns `sys.prefix = sys.base_prefix = /usr`. It then runs `site.py`, which adds the global `site-packages` directory to `sys.path`.

Inside a virtual environment, CPython inspects the directory containing the invoked binary or its parent directory looking for `pyvenv.cfg`. When `pyvenv.cfg` is present, CPython parses its `home` parameter to set `sys.base_prefix` (pointing to the original Python standard library installation), while setting `sys.prefix` to the root of the `.venv` directory. When `site.py` runs, it reads `sys.prefix` and injects `.venv/lib/pythonX.Y/site-packages` into `sys.path`. Because `include-system-site-packages` is set to `false`, `site.py` omits the global site-packages directory from `sys.path` entirely. The runtime effectively isolates third-party imports while reusing the shared standard library C-extensions and core runtime binaries.

**Q: Does a virtual environment require `source .venv/bin/activate` to work? What does `activate` actually do?**

No. Activation is not required for a virtual environment to function. The `activate` shell script only performs environment variable modifications in the calling shell: it prepends `.venv/bin` to the shell's `$PATH`, sets `$VIRTUAL_ENV`, and updates the shell prompt string.

CPython's internal environment detection does not check `$PATH` or `$VIRTUAL_ENV`. It inspects the physical path of the Python executable being invoked. If you execute `.venv/bin/python script.py` or `.venv/bin/uvicorn`, CPython locates `pyvenv.cfg` relative to that executable and isolates `sys.prefix` immediately. In automated production environments like Docker, systemd, cron jobs, and Kubernetes entrypoints, invoking the binary directly by its absolute or relative path is preferred over sourcing `activate`.

**Q: Why is `sudo pip install` dangerous on Linux distributions, and what problem does PEP 668 solve?**

On Linux distributions such as Ubuntu and Debian, system-level Python packages are managed by the OS package manager (`apt`). System tools like `cloud-init`, `netplan`, `ufw`, and `apt` itself are written in Python and depend on exact package versions installed under `/usr/lib/python3/dist-packages`.

When a developer runs `sudo pip install <package>`, `pip` installs or upgrades libraries globally under `/usr/local/lib/python3.X/dist-packages`. Because `/usr/local/lib` precedes `/usr/lib` in system Python's default `sys.path`, the newly installed package shadows the OS version. Upgrading a common library like `urllib3`, `requests`, or `cryptography` can break OS administration tools. PEP 668 introduced a marker file (`EXTERNALLY-MANAGED`) in system Python directories. When `pip` detects this file, it blocks global installation with an error message instructing the developer to use a virtual environment or an OS package instead.

**Q: Why should you use a virtual environment inside a Docker container when Docker already provides filesystem isolation?**

While Docker isolates the container filesystem from the host, using a virtual environment inside the container solves three key production challenges:
First, it enables clean multi-stage builds. All build dependencies, header files, and compiler toolchains remain in the builder container, while the compiled wheels and virtual environment in `/opt/venv` are copied to a lean production container.
Second, modern container base images enforce PEP 668; using a virtual environment avoids modifying the base image's system Python and prevents permission issues when running as a non-root user.
Third, it guarantees that any default Python utilities installed in the Linux base image never collide with the pinned application dependencies in your `requirements.txt`.

**Q: How do `venv`, `virtualenv`, `conda`, and `uv` compare in backend architecture?**

`venv` is the standard library implementation (PEP 405) built into Python 3.3+. It requires zero external dependencies and is ideal for standard production microservices.

`virtualenv` is a third-party tool that predated `venv`. It can create environments for multiple different Python versions on one host, provides standalone seed wheels, and is faster than standard `venv`.

`conda` is a full binary package manager that manages not just Python packages, but underlying non-Python shared libraries (such as CUDA, OpenBLAS, C/C++ runtimes). It isolates the entire binary toolchain, making it dominant in machine learning and data science, though heavy and slower for standard web APIs.

`uv` is an ultra-fast Python package and project manager written in Rust. It implements PEP 405 virtual environment creation and package installation from scratch, creating virtual environments in under 10 milliseconds and resolving dependencies up to 100 times faster than `pip` while producing standard, fully compatible `.venv` directories.

**Q: How does Python resolve imports across `sys.path`, and how does `site-packages` get ordered?**

When Python encounters an `import foo` statement, it iterates through `sys.path` in sequential order and loads the first matching module or package directory containing an `__init__.py` (or valid namespace package).

`sys.path` is initialized in the following priority order:
1. The directory containing the input script (or the current working directory if running interactively).
2. The `PYTHONPATH` environment variable directories (if set).
3. The standard library modules (located in `sys.base_prefix/lib/pythonX.Y`).
4. Compiled shared library extensions (in `lib-dynload`).
5. Third-party `site-packages` directories (added by `site.py` from `sys.prefix/lib/pythonX.Y/site-packages`).
6. Paths specified inside any `.pth` files found inside `site-packages`.

Because the script's directory is index 0 in `sys.path`, a local file named `math.py` or `requests.py` will shadow both the standard library and third-party packages, causing unexpected import collisions.

## 6. The Traps — What Goes Wrong

**Trap 1: Committing the `.venv` Directory to Version Control**

Developers new to Python sometimes commit the entire `.venv` folder to git, creating massive commits with thousands of files.
- *Why it fails:* Virtual environments contain platform-specific compiled binaries, OS-specific dynamic links, and absolute filesystem paths hardcoded into script shebang headers (`#!/.venv/bin/python`). A `.venv` created on macOS will not run on Linux or Windows, and a `.venv` moved to a different path on the same machine will break immediately.
- *The fix:* Add `.venv/`, `venv/`, and `ENV/` to your root `.gitignore`. Commit only dependency declarations like `pyproject.toml`, `requirements.txt`, or lockfiles (`poetry.lock`, `uv.lock`).

**Trap 2: Relying on `source activate` in Production Process Managers**

Configuring systemd unit files, cron jobs, or Docker entrypoints to run `source .venv/bin/activate && gunicorn app:main` frequently fails because non-interactive shells do not source profiles or may use `/bin/sh` which lacks `source` or bash-specific activation syntax.
- *Why it fails:* Non-interactive execution environments run subshells where environment variables set in previous lines are lost, causing the command to fall back to system Python and crash with missing dependency errors.
- *The fix:* Never activate environments in automated scripts. Point directly to the binary:
```bash
# In systemd or cron:
ExecStart=/home/ubuntu/api/.venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker src.main:app
```

**Trap 3: Moving or Renaming a Virtual Environment Directory**

Renaming a project folder containing `.venv` or moving `.venv` to another location causes command-line scripts like `pytest`, `pip`, or `uvicorn` inside `.venv/bin/` to crash with `bad interpreter: No such file or directory`.
- *Why it fails:* When `pip` installs executable CLI wrappers into `.venv/bin/`, it writes an absolute shebang path on line 1 of every generated script (e.g., `#!/Users/name/project/.venv/bin/python`). If the path changes, the operating system kernel cannot locate the interpreter.
- *The fix:* Virtual environments are ephemeral. Do not attempt to move or rename them. Delete the directory with `rm -rf .venv` and recreate it in seconds using `python3 -m venv .venv && pip install -r requirements.txt`.

**Trap 4: Local Module Shadowing Standard Library or Third-Party Packages**

Creating a local file named `random.py`, `email.py`, `queue.py`, or `requests.py` in your project root causes unrelated third-party libraries or standard library modules to crash with strange `AttributeError: module 'random' has no attribute 'choice'` errors.
- *Why it fails:* Because `sys.path[0]` is the directory of the running script, Python searches the local directory before checking standard library or virtual environment `site-packages`.
- *The fix:* Never name local files or packages after standard library modules or external packages.

**Trap 5: Accidental System Package Leakage with `include-system-site-packages = true`**

If a virtual environment is created with `python -m venv --system-site-packages .venv`, the resulting `pyvenv.cfg` sets `include-system-site-packages = true`.
- *Why it fails:* Python will load packages from `/usr/lib/python3/dist-packages` whenever a package is not found in `.venv`. Code runs fine locally because a missing dependency happens to be installed on your development laptop's OS, but the build fails immediately in CI or production where the system package does not exist.
- *The fix:* Keep `include-system-site-packages = false` (the default). Use `--no-site-packages` if using older tooling, ensuring total isolation.

## 7. Compare With Related Concepts

**Virtual Environment (`venv`) vs Docker Container**
- *The Core Difference:* A virtual environment isolates only Python packages and runtime search paths (`sys.prefix`) by altering `sys.path`. A Docker container isolates the entire operating system user space—including the filesystem, Linux kernel namespaces, process table, network interfaces, and system C-libraries.
- *Rule of Thumb:* Use `venv` for local Python development and multi-stage dependency staging; use Docker for packaging the full application, OS system dependencies, and runtime deployment boundaries.

**`venv` (Standard Library) vs `conda` (Conda Environment)**
- *The Core Difference:* `venv` manages only Python libraries using `pip` and relies on the host operating system's compiled C-libraries. `conda` is a multi-language binary package manager that distributes pre-compiled binaries for Python, C/C++ libraries, BLAS/LAPACK, CUDA, and FFmpeg inside the environment.
- *Rule of Thumb:* Use `venv` (or `uv`) for web APIs, FastAPI/Django backends, and cloud microservices; use `conda` for complex scientific computing, data science, and deep learning projects requiring specific GPU/CUDA binary dependencies.

**`venv` vs Node.js `node_modules`**
- *The Core Difference:* Node.js resolves dependencies locally by default by looking up the directory tree for a `./node_modules` folder relative to the executed file. Python resolves dependencies globally by default via `sys.prefix` and requires an explicit virtual environment directory with `pyvenv.cfg` to redirect `sys.path`.
- *Rule of Thumb:* In Node.js, running `npm install` creates a local `./node_modules` automatically; in Python, you must explicitly create and target a virtual environment (`python -m venv .venv`) before running `pip install`.

**`sys.path.append()` vs Virtual Environment**
- *The Core Difference:* `sys.path.append("/path/to/lib")` is a runtime hack that manually inserts a directory string into the search list in Python code. A virtual environment is an interpreter-level boundary configured at startup via `pyvenv.cfg`, ensuring that command-line tools, entrypoint scripts, C-extensions, and package metadata (`importlib.metadata`) work consistently across the entire project.
- *Rule of Thumb:* Never use `sys.path.append()` to manage third-party dependencies; always use a virtual environment.

## 8. 🧠 The Memory Hook

A Python virtual environment is not a copy of Python — it is a `pyvenv.cfg` file that points `sys.prefix` to a private `site-packages` directory. You never need to `activate` it; running `.venv/bin/python` is all it takes to trigger complete isolation.
